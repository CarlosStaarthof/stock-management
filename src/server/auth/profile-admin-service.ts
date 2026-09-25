import {
  LAST_ADMIN_MESSAGE,
  ONLY_ACTIVE_PIN_RESET,
  USERNAME_TAKEN_MESSAGE,
} from "@/lib/auth-messages";
import { applyOutcome, isLocked, type AccountLockState } from "@/server/auth/account-lock";
import {
  BUDGET_WINDOW_HOURS,
  bucketFor,
  decideAttempt,
  EVENT_RETENTION_DAYS,
  PIN_FAILURE_BUDGET,
} from "@/server/auth/attempt-budget";
import {
  AUTH_TRANSACTION_OPTIONS,
  bucketEvents,
  isUniqueViolation,
  lockBucket,
  recordBudgetReset,
  type Transaction,
} from "@/server/auth/auth-event-log";
import {
  generatePin,
  parseProfileName,
  parseUsername,
  type PinLength,
} from "@/server/auth/credential-rules";
import { assertRole } from "@/server/auth/guards";
import { accountKey, currentPinKeyId, hashPin } from "@/server/auth/password";
import type { ProfileStatus } from "@/server/auth/profile-status";
import { isRole, type Role } from "@/server/auth/roles";
import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * The admin section's services (spec 021 D4, S10, S14, `/profiles`). ADMIN-only, refused
 * HERE rather than in the middleware (003 AC-16): every function below asserts the role
 * before it reads anything, so removing the route's middleware entry exposes none of it.
 *
 * WHAT LEAVES THIS MODULE IS A `ProfileListEntry`, built by one mapper. Every field is
 * copied by name, and the PIN hash and its key are reduced to two booleans first, so a
 * page that renders an entry cannot render a hash it was never given. A new PIN — from a
 * reset or a direct creation — is returned ONCE, beside the entry and never inside it, and
 * is never logged or stored in clear (AC-24, AC-25).
 *
 * THE LAST ADMINISTRATOR CANNOT GO (S10). Demoting or deactivating locks every `ACTIVE`
 * `ADMIN` row `FOR UPDATE`, in id order, before the target row, and refuses when the change
 * would leave no `ACTIVE` `ADMIN` that holds a username and a PIN. Two administrators
 * demoting each other at once queue on the first of those locks; the second then re-reads
 * the rows, sees the first's demotion, and is refused (AC-23).
 *
 * A USERNAME IS SETTLED AT APPROVAL (S2). It is checked free before it is written, and the
 * unique index settles two approvals of one username made at the same moment: the loser's
 * violation becomes `USERNAME_TAKEN_MESSAGE`, never a database error text (AC-21).
 *
 * First-run setup (`setup-service.ts`) returns the administrator it creates through
 * `toProfileListEntry`, so there is one way a profile leaves the server.
 */

export type AccountLockView = {
  locked: boolean;
  lockedUntil: string | null;
  consecutiveFailures: number;
  level: number;
  failuresLast30Days: number;
};

export type ProfileListEntry = {
  id: string;
  username: string | null;
  requestedUsername: string | null;
  name: string;
  role: Role;
  status: ProfileStatus;
  createdAt: string;
  /** Holds a username and a PIN. */
  credentialSet: boolean;
  /** Its PIN was stored under another PIN_PEPPER (S4), so it can never match again. */
  credentialNeedsReset: boolean;
  /** `null` when the profile has no username. */
  lock: AccountLockView | null;
};

/** The last day's incorrect PINs (AC-26), counted by the kind of bucket they came from. */
export type PinFailureSummary = {
  newDevices: number;
  knownDevices: number;
  /** Of those, the ones that named no profile's username — a malformed one included. */
  unknownUsernames: number;
  newDevicesPaused: boolean;
};

/** Approving or rejecting anything but a request (AC-21). */
export const NOT_PENDING_MESSAGE = "This profile is not waiting for approval any more.";

/** Changing the role of, or deactivating, a profile that is not active (AC-23). */
export const ONLY_ACTIVE_PROFILE_CHANGE = "Only an active profile can have its role changed or be deactivated.";

/** A role no form offers: only a forged submission can carry one. */
export const ROLE_REQUIRED_MESSAGE = "Choose a role: administrator or yard staff.";

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Where every new device's PIN failures are counted (S8). */
const NEW_DEVICE_BUCKET = bucketFor("PIN_FAILURE", null);
const KNOWN_DEVICE_PREFIX = "pin:device:";

type Reader = Pick<Transaction, "user" | "accountLock" | "authEvent">;

const PROFILE_SELECT = {
  id: true,
  username: true,
  requestedUsername: true,
  name: true,
  role: true,
  status: true,
  pinHash: true,
  pinKeyId: true,
  createdAt: true,
} as const;

type ProfileRow = {
  id: string;
  username: string | null;
  requestedUsername: string | null;
  name: string;
  role: Role;
  status: ProfileStatus;
  pinHash: string | null;
  pinKeyId: string | null;
  createdAt: Date;
};

/** The one mapper: a row, its lock and its failure count become what the page may show. */
function toEntry(
  row: ProfileRow,
  lockRow: AccountLockState | null,
  failuresLast30Days: number,
  keyId: string,
  now: Date,
): ProfileListEntry {
  let lock: AccountLockView | null = null;
  if (row.username !== null) {
    const current = lockRow ?? { consecutiveFailures: 0, level: 0, lockedUntil: null };
    const locked = isLocked(current, now);
    lock = {
      locked,
      lockedUntil: locked && current.lockedUntil !== null ? current.lockedUntil.toISOString() : null,
      consecutiveFailures: current.consecutiveFailures,
      level: current.level,
      failuresLast30Days,
    };
  }

  return {
    id: row.id,
    username: row.username,
    requestedUsername: row.requestedUsername,
    name: row.name,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    credentialSet: row.username !== null && row.pinHash !== null,
    credentialNeedsReset: row.pinHash !== null && row.pinKeyId !== keyId,
    lock,
  };
}

function failureWindowStart(now: Date): Date {
  return new Date(now.getTime() - EVENT_RETENTION_DAYS * MS_PER_DAY);
}

/** One profile as the admin section shows it. */
export async function toProfileListEntry(
  reader: Reader,
  id: string,
  now: Date,
): Promise<ProfileListEntry> {
  const row = await reader.user.findUnique({ where: { id }, select: PROFILE_SELECT });
  if (row === null) {
    throw new NotFoundError(`Profile ${id} does not exist`);
  }

  const keyId = currentPinKeyId();
  let lockRow: AccountLockState | null = null;
  let failures = 0;
  if (row.username !== null) {
    const key = accountKey(row.username);
    lockRow = await reader.accountLock.findUnique({
      where: { accountKey: key },
      select: { consecutiveFailures: true, level: true, lockedUntil: true },
    });
    failures = await reader.authEvent.count({
      where: { kind: "PIN_FAILURE", accountKey: key, at: { gt: failureWindowStart(now) } },
    });
  }

  return toEntry(row, lockRow, failures, keyId, now);
}

function parseRole(role: unknown): Role {
  if (!isRole(role)) {
    throw new ValidationError("role", ROLE_REQUIRED_MESSAGE);
  }
  return role;
}

/** The target row, locked for this transaction. */
async function lockProfile(
  tx: Transaction,
  id: string,
): Promise<{ role: Role; status: ProfileStatus; username: string | null; requestedUsername: string | null }> {
  const rows = await tx.$queryRaw<
    { role: Role; status: ProfileStatus; username: string | null; requestedUsername: string | null }[]
  >`SELECT "role", "status", "username", "requestedUsername" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
  const row = rows[0];
  if (row === undefined) {
    throw new NotFoundError(`Profile ${id} does not exist`);
  }
  return row;
}

/**
 * Every `ACTIVE` `ADMIN` row, locked in id order so two transactions never take them in
 * opposite orders (S10). A row another transaction demotes or deactivates while this one
 * waits is re-read at its lock and no longer matches, so it is not returned.
 */
async function lockActiveAdmins(tx: Transaction): Promise<{ id: string; canSignIn: boolean }[]> {
  return tx.$queryRaw<{ id: string; canSignIn: boolean }[]>`
    SELECT "id", ("username" IS NOT NULL AND "pinHash" IS NOT NULL) AS "canSignIn"
    FROM "User" WHERE "role" = 'ADMIN' AND "status" = 'ACTIVE'
    ORDER BY "id" FOR UPDATE`;
}

/** Refuses when `leaving` is the last `ACTIVE` `ADMIN` that can sign in (S10). */
function assertAnotherAdminRemains(admins: { id: string; canSignIn: boolean }[], leaving: string): void {
  if (!admins.some((admin) => admin.id !== leaving && admin.canSignIn)) {
    throw new ConflictError(LAST_ADMIN_MESSAGE);
  }
}

/**
 * `outcome` applied to the lock row of `key`, if it has one, under a row lock — the same
 * lock a sign-in attempt holds, so a clear and an attempt cannot interleave (S6).
 */
async function settleLock(
  tx: Transaction,
  key: string,
  outcome: "SUCCESS" | "CLEARED",
  now: Date,
): Promise<void> {
  const rows = await tx.$queryRaw<AccountLockState[]>`
    SELECT "consecutiveFailures", "level", "lockedUntil" FROM "AccountLock"
    WHERE "accountKey" = ${key} FOR UPDATE`;
  const current = rows[0];
  if (current === undefined) return;

  const next = applyOutcome(current, outcome, now);
  await tx.accountLock.update({
    where: { accountKey: key },
    data: {
      consecutiveFailures: next.consecutiveFailures,
      level: next.level,
      lockedUntil: next.lockedUntil,
    },
    select: { accountKey: true },
  });
}

/**
 * Every profile, `PENDING` first, then oldest first (AC-22), with its lock and its PIN
 * failures in the last 30 days (AC-26).
 */
export async function listProfiles(actor: SessionUser | null): Promise<ProfileListEntry[]> {
  assertRole(actor, "ADMIN");

  const now = new Date();
  const keyId = currentPinKeyId();
  const rows = await db.user.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: PROFILE_SELECT,
  });

  const keyOf = new Map<string, string>();
  for (const row of rows) {
    if (row.username !== null) keyOf.set(row.id, accountKey(row.username));
  }
  const keys = [...keyOf.values()];

  const locks =
    keys.length === 0
      ? []
      : await db.accountLock.findMany({
          where: { accountKey: { in: keys } },
          select: { accountKey: true, consecutiveFailures: true, level: true, lockedUntil: true },
        });
  const counts =
    keys.length === 0
      ? []
      : await db.authEvent.groupBy({
          by: ["accountKey"],
          where: { kind: "PIN_FAILURE", accountKey: { in: keys }, at: { gt: failureWindowStart(now) } },
          _count: { _all: true },
        });
  const lockByKey = new Map(locks.map((lock) => [lock.accountKey, lock]));
  const failuresByKey = new Map(counts.map((count) => [count.accountKey, count._count._all]));

  const entries = rows.map((row) => {
    const key = keyOf.get(row.id);
    return toEntry(
      row,
      key === undefined ? null : (lockByKey.get(key) ?? null),
      key === undefined ? 0 : (failuresByKey.get(key) ?? 0),
      keyId,
      now,
    );
  });

  return [
    ...entries.filter((entry) => entry.status === "PENDING"),
    ...entries.filter((entry) => entry.status !== "PENDING"),
  ];
}

/**
 * A request becomes an `ACTIVE` profile with the chosen role (AC-21): its requested
 * username, or `username` instead when the approving `ADMIN` gives one. The PIN the
 * requester chose is kept. A username held by any profile, in any status, is refused to
 * the `ADMIN` by name. Any lock the username collected before anyone held it is zeroed.
 */
export async function approveProfile(
  actor: SessionUser | null,
  id: string,
  role: Role,
  username?: string,
): Promise<ProfileListEntry> {
  assertRole(actor, "ADMIN");
  const chosenRole = parseRole(role);
  const given = username === undefined ? undefined : parseUsername(username);

  let wanted = given;
  try {
    return await db.$transaction(async (tx) => {
      const now = new Date();
      const row = await lockProfile(tx, id);
      if (row.status !== "PENDING" || row.requestedUsername === null) {
        throw new ConflictError(NOT_PENDING_MESSAGE);
      }

      const settled = given ?? row.requestedUsername;
      wanted = settled;
      const holder = await tx.user.findUnique({ where: { username: settled }, select: { id: true } });
      if (holder !== null) {
        throw new ConflictError(USERNAME_TAKEN_MESSAGE(settled));
      }

      await tx.user.update({
        where: { id },
        data: { status: "ACTIVE", username: settled, requestedUsername: null, role: chosenRole },
        select: { id: true },
      });
      await settleLock(tx, accountKey(settled), "SUCCESS", now);

      return toProfileListEntry(tx, id, now);
    }, AUTH_TRANSACTION_OPTIONS);
  } catch (error) {
    // Another approval took the same username a moment earlier: the unique index refused
    // this one, and the transaction rolled back whole.
    if (isUniqueViolation(error) && wanted !== undefined) {
      throw new ConflictError(USERNAME_TAKEN_MESSAGE(wanted));
    }
    throw error;
  }
}

/**
 * A request is refused (S14): `REJECTED`, with its requested username and its PIN hash
 * cleared. The row is kept.
 */
export async function rejectProfile(actor: SessionUser | null, id: string): Promise<ProfileListEntry> {
  assertRole(actor, "ADMIN");

  return db.$transaction(async (tx) => {
    const now = new Date();
    const row = await lockProfile(tx, id);
    if (row.status !== "PENDING") {
      throw new ConflictError(NOT_PENDING_MESSAGE);
    }

    await tx.user.update({
      where: { id },
      data: { status: "REJECTED", requestedUsername: null, pinHash: null, pinKeyId: null },
      select: { id: true },
    });

    return toProfileListEntry(tx, id, now);
  }, AUTH_TRANSACTION_OPTIONS);
}

/**
 * An `ACTIVE` profile's role (AC-23). It bites on the profile's next request, because every
 * request re-reads the role from the row. Demoting the last `ACTIVE` `ADMIN` that can sign
 * in — by another profile or by itself — is refused (S10).
 */
export async function changeProfileRole(
  actor: SessionUser | null,
  id: string,
  role: Role,
): Promise<ProfileListEntry> {
  assertRole(actor, "ADMIN");
  const chosenRole = parseRole(role);

  return db.$transaction(async (tx) => {
    const now = new Date();
    const admins = await lockActiveAdmins(tx);
    const row = await lockProfile(tx, id);
    if (row.status !== "ACTIVE") {
      throw new ConflictError(ONLY_ACTIVE_PROFILE_CHANGE);
    }
    if (row.role === "ADMIN" && chosenRole !== "ADMIN") {
      assertAnotherAdminRemains(admins, id);
    }

    await tx.user.update({ where: { id }, data: { role: chosenRole }, select: { id: true } });

    return toProfileListEntry(tx, id, now);
  }, AUTH_TRANSACTION_OPTIONS);
}

/**
 * A fresh random PIN for an `ACTIVE` profile, returned ONCE (AC-24). It is drawn by
 * `generatePin`, stored under the current pepper, and never logged. The profile's
 * `sessionEpoch` is incremented, so every session obtained with the old PIN ends on its
 * next request (AC-17). Any lock on its username ends and its failure count is zeroed; the
 * lock level is kept, so a reset in the middle of an attack buys an attacker five guesses,
 * not a fresh run (S6).
 */
export async function resetProfilePin(
  actor: SessionUser | null,
  id: string,
  length: PinLength,
): Promise<{ profile: ProfileListEntry; newPin: string }> {
  assertRole(actor, "ADMIN");

  const newPin = generatePin(length);
  const { pinHash, pinKeyId } = await hashPin(newPin);

  const profile = await db.$transaction(async (tx) => {
    const now = new Date();
    const row = await lockProfile(tx, id);
    // A profile with no username cannot hold a PIN (`User_pin_needs_username`); only the
    // operator's script can give a migrated profile both.
    if (row.status !== "ACTIVE" || row.username === null) {
      throw new ConflictError(ONLY_ACTIVE_PIN_RESET);
    }

    await tx.user.update({
      where: { id },
      data: { pinHash, pinKeyId, sessionEpoch: { increment: 1 } },
      select: { id: true },
    });
    await settleLock(tx, accountKey(row.username), "CLEARED", now);

    return toProfileListEntry(tx, id, now);
  }, AUTH_TRANSACTION_OPTIONS);

  return { profile, newPin };
}

/**
 * A leaver (S14): `DEACTIVATED`, with the PIN hash cleared and the username kept, which is
 * never reissued. Every session the profile holds is refused on its next request, because
 * only an `ACTIVE` row has a session (AC-23). The last `ACTIVE` `ADMIN` that can sign in
 * cannot be deactivated, by another profile or by itself (S10).
 */
export async function deactivateProfile(
  actor: SessionUser | null,
  id: string,
): Promise<ProfileListEntry> {
  assertRole(actor, "ADMIN");

  return db.$transaction(async (tx) => {
    const now = new Date();
    const admins = await lockActiveAdmins(tx);
    const row = await lockProfile(tx, id);
    if (row.status !== "ACTIVE") {
      throw new ConflictError(ONLY_ACTIVE_PROFILE_CHANGE);
    }
    if (row.role === "ADMIN") {
      assertAnotherAdminRemains(admins, id);
    }

    await tx.user.update({
      where: { id },
      data: { status: "DEACTIVATED", pinHash: null, pinKeyId: null },
      select: { id: true },
    });

    return toProfileListEntry(tx, id, now);
  }, AUTH_TRANSACTION_OPTIONS);
}

/**
 * Ends the lock on a profile's username at once (S6, AC-26): its failure count is zeroed
 * and its level KEPT, so a clear in the middle of an attack gives the attacker five more
 * guesses, not a fresh run. No event is written.
 */
export async function clearAccountLock(actor: SessionUser | null, id: string): Promise<ProfileListEntry> {
  assertRole(actor, "ADMIN");

  return db.$transaction(async (tx) => {
    const now = new Date();
    const row = await tx.user.findUnique({ where: { id }, select: { username: true } });
    if (row === null) {
      throw new NotFoundError(`Profile ${id} does not exist`);
    }
    if (row.username !== null) {
      await settleLock(tx, accountKey(row.username), "CLEARED", now);
    }

    return toProfileListEntry(tx, id, now);
  }, AUTH_TRANSACTION_OPTIONS);
}

/**
 * An `ACTIVE` profile created by an `ADMIN` (AC-25), `ADMIN` role included, with a PIN drawn
 * by `generatePin` and returned ONCE, exactly as a reset returns one. Any lock the username
 * collected before anyone held it is zeroed.
 */
export async function createProfile(
  actor: SessionUser | null,
  input: { name: string; username: string; role: Role; length: PinLength },
): Promise<{ profile: ProfileListEntry; newPin: string }> {
  assertRole(actor, "ADMIN");
  const name = parseProfileName(input.name);
  const username = parseUsername(input.username);
  const role = parseRole(input.role);

  const newPin = generatePin(input.length);
  const { pinHash, pinKeyId } = await hashPin(newPin);

  try {
    const profile = await db.$transaction(async (tx) => {
      const now = new Date();
      const holder = await tx.user.findUnique({ where: { username }, select: { id: true } });
      if (holder !== null) {
        throw new ConflictError(USERNAME_TAKEN_MESSAGE(username));
      }

      const created = await tx.user.create({
        data: { name, username, role, status: "ACTIVE", pinHash, pinKeyId },
        select: { id: true },
      });
      await settleLock(tx, accountKey(username), "SUCCESS", now);

      return toProfileListEntry(tx, created.id, now);
    }, AUTH_TRANSACTION_OPTIONS);

    return { profile, newPin };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(USERNAME_TAKEN_MESSAGE(username));
    }
    throw error;
  }
}

/**
 * The last day's `PIN_FAILURE` events, by the kind of bucket they were counted in, and
 * whether sign-in from new devices is paused (AC-26). An event "names no profile's
 * username" when its account key is no profile's — in any status — or when it has none,
 * because the attempt's username was malformed.
 */
export async function pinFailureSummary(actor: SessionUser | null): Promise<PinFailureSummary> {
  assertRole(actor, "ADMIN");

  const now = new Date();
  const events = await db.authEvent.findMany({
    where: {
      kind: { in: ["PIN_FAILURE", "BUDGET_RESET"] },
      bucket: { startsWith: "pin:" },
      at: { gt: new Date(now.getTime() - BUDGET_WINDOW_HOURS * MS_PER_HOUR) },
    },
    select: { kind: true, bucket: true, accountKey: true, at: true },
  });
  const failures = events.filter((event) => event.kind === "PIN_FAILURE");

  const holders = await db.user.findMany({
    where: { username: { not: null } },
    select: { username: true },
  });
  const heldKeys = new Set(
    holders.flatMap((holder) => (holder.username === null ? [] : [accountKey(holder.username)])),
  );

  const newDeviceEvents = events.filter((event) => event.bucket === NEW_DEVICE_BUCKET);
  return {
    newDevices: failures.filter((event) => event.bucket === NEW_DEVICE_BUCKET).length,
    knownDevices: failures.filter((event) => event.bucket.startsWith(KNOWN_DEVICE_PREFIX)).length,
    unknownUsernames: failures.filter(
      (event) => event.accountKey === null || !heldKeys.has(event.accountKey),
    ).length,
    newDevicesPaused:
      decideAttempt(newDeviceEvents, "PIN_FAILURE", now, PIN_FAILURE_BUDGET, BUDGET_WINDOW_HOURS) ===
      "REFUSE",
  };
}

/**
 * Lifts the pause on sign-in from new devices (S8, AC-26): one `BUDGET_RESET` event in the
 * shared bucket, taken under that bucket's lock, so attempts queued behind it are
 * evaluated against the reset. No event is deleted: every failure stays on the page.
 *
 * Nothing is written while new devices are not paused. A reset then would only hand the
 * untrusted internet a fresh ten guesses — which is what a second press of a control that
 * was on screen a moment ago would otherwise do.
 */
export async function resumeNewDeviceSignIn(actor: SessionUser | null): Promise<void> {
  assertRole(actor, "ADMIN");

  await db.$transaction(async (tx) => {
    const now = new Date();
    await lockBucket(tx, NEW_DEVICE_BUCKET);
    const events = await bucketEvents(tx, NEW_DEVICE_BUCKET, "PIN_FAILURE", now);
    if (decideAttempt(events, "PIN_FAILURE", now, PIN_FAILURE_BUDGET, BUDGET_WINDOW_HOURS) === "ALLOW") {
      return;
    }
    await recordBudgetReset(tx, NEW_DEVICE_BUCKET, now);
  }, AUTH_TRANSACTION_OPTIONS);
}
