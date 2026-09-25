import { ONLY_ACTIVE_PIN_RESET, USERNAME_TAKEN_MESSAGE } from "@/lib/auth-messages";
import { applyOutcome, isLocked } from "@/server/auth/account-lock";
import { parsePin, parseProfileName, parseUsername } from "@/server/auth/credential-rules";
import { accountKey, currentPinKeyId, hashPin } from "@/server/auth/password";
import type { ProfileStatus } from "@/server/auth/profile-status";
import type { Role } from "@/server/auth/roles";
import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * What the operator, the test fixtures and nothing else may do to profiles directly
 * (spec 021 S11, AC-31).
 *
 * Imported only by `scripts/`, by tests and by `tests/e2e/support/` — never by a page, a
 * component, a route handler or the middleware, which a source scan asserts. A function
 * here is a second way to put a credential on a profile, so no request can reach one.
 */

/** True for Prisma's unique-constraint violation, without importing PrismaClient's types. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export type ActiveProfileInput = {
  name: string;
  username: string;
  role: Role;
  pin: string;
};

/**
 * An `ACTIVE` profile holding a username and a PIN, created directly — what the end-to-end
 * fixtures sign in as (AC-40). The PIN is the caller's, drawn at runtime by the caller; it
 * is hashed here and never stored, returned or logged. A username held by any profile is
 * refused with `USERNAME_TAKEN_MESSAGE`.
 */
export async function createActiveProfile(input: ActiveProfileInput): Promise<SessionUser> {
  const name = parseProfileName(input.name);
  const username = parseUsername(input.username);
  const pin = parsePin(input.pin);
  const { pinHash, pinKeyId } = await hashPin(pin);

  try {
    const created = await db.user.create({
      data: { name, username, role: input.role, status: "ACTIVE", pinHash, pinKeyId },
      select: { id: true, name: true, role: true },
    });
    return { id: created.id, username, name: created.name, role: created.role };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError(USERNAME_TAKEN_MESSAGE(username));
    }
    throw error;
  }
}

/** A profile's PIN as the operator sees it: present, absent, or made under another pepper (S4). */
export type OperatorPinState = "set" | "none" | "reset needed";

/**
 * One line of `pin:reset -- --list` (AC-30): exactly these seven facts. The PIN hash, its
 * key and the account key are reduced to `pinState` and `lockState` here, so nothing that
 * leaves this module could be printed by mistake.
 */
export type OperatorProfileLine = {
  id: string;
  username: string | null;
  name: string;
  role: Role;
  status: ProfileStatus;
  pinState: OperatorPinState;
  /** `-` with no username; otherwise `not locked` or `locked until <ISO instant>`. */
  lockState: string;
};

/**
 * Every profile, oldest first, for the operator's `--list`. Fails closed with the
 * pepper's own error, before reading a row, when `PIN_PEPPER` is unusable: without it no
 * PIN state and no lock can be told.
 */
export async function listProfilesForOperator(now: Date = new Date()): Promise<OperatorProfileLine[]> {
  const keyId = currentPinKeyId();

  const rows = await db.user.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
      pinHash: true,
      pinKeyId: true,
    },
  });

  const keys = new Map<string, string>();
  for (const row of rows) {
    if (row.username !== null) keys.set(row.id, accountKey(row.username));
  }
  const locks = await db.accountLock.findMany({
    where: { accountKey: { in: [...keys.values()] } },
    select: { accountKey: true, consecutiveFailures: true, level: true, lockedUntil: true },
  });
  const lockByKey = new Map(locks.map((lock) => [lock.accountKey, lock]));

  return rows.map((row) => {
    let lockState = "-";
    const key = keys.get(row.id);
    if (key !== undefined) {
      const lock = lockByKey.get(key);
      lockState =
        lock !== undefined && lock.lockedUntil !== null && isLocked(lock, now)
          ? `locked until ${lock.lockedUntil.toISOString()}`
          : "not locked";
    }

    let pinState: OperatorPinState = "none";
    if (row.pinHash !== null) pinState = row.pinKeyId === keyId ? "set" : "reset needed";

    return {
      id: row.id,
      username: row.username,
      name: row.name,
      role: row.role,
      status: row.status,
      pinState,
      lockState,
    };
  });
}

export type OperatorCredentialsInput = {
  id: string;
  /** The operator's chosen PIN. Hashed here; never stored, returned or logged. */
  pin: string;
  /** Given when, and only when, the profile has no username yet (a row migrated from #3). */
  username?: string;
};

/**
 * The operator's repair (S11, AC-30): an `ACTIVE` profile gets the operator's PIN under the
 * current `PIN_PEPPER` and, if it has none, a username. Any lock on that username ends and
 * its failure count is zeroed; the level is kept, as `resetProfilePin` keeps it (S6). The
 * `sessionEpoch` is incremented, so every session the profile had ends on its next request
 * (AC-17). It creates no profile.
 *
 * Refusals change no row. A `ValidationError` names its field: `pin` for the PIN, and
 * `username` for a username that is missing, not wanted, or malformed.
 */
export async function setCredentialsForOperator(input: OperatorCredentialsInput): Promise<SessionUser> {
  const pin = parsePin(input.pin);
  const wanted = input.username === undefined ? undefined : parseUsername(input.username);
  const { pinHash, pinKeyId } = await hashPin(pin);

  try {
    return await db.$transaction(async (tx) => {
      const now = new Date();
      const rows = await tx.$queryRaw<
        { name: string; role: Role; status: ProfileStatus; username: string | null }[]
      >`SELECT "name", "role", "status", "username" FROM "User" WHERE "id" = ${input.id} FOR UPDATE`;
      const row = rows[0];
      if (row === undefined) {
        throw new NotFoundError(`Profile ${input.id} does not exist`);
      }
      if (row.status !== "ACTIVE") {
        throw new ConflictError(ONLY_ACTIVE_PIN_RESET);
      }
      if (row.username === null && wanted === undefined) {
        throw new ValidationError("username", "This profile has no username yet. Give it one.");
      }
      if (row.username !== null && wanted !== undefined) {
        throw new ValidationError(
          "username",
          "This profile already has a username. It is not changed here; give only a new PIN.",
        );
      }

      const username = row.username ?? (wanted as string);
      if (row.username === null) {
        const holder = await tx.user.findUnique({ where: { username }, select: { id: true } });
        if (holder !== null) {
          throw new ConflictError(USERNAME_TAKEN_MESSAGE(username));
        }
      }

      await tx.user.update({
        where: { id: input.id },
        data: { username, pinHash, pinKeyId, sessionEpoch: { increment: 1 } },
        select: { id: true },
      });

      const key = accountKey(username);
      const lock = await tx.accountLock.findUnique({
        where: { accountKey: key },
        select: { consecutiveFailures: true, level: true, lockedUntil: true },
      });
      if (lock !== null) {
        const cleared = applyOutcome(lock, "CLEARED", now);
        await tx.accountLock.update({
          where: { accountKey: key },
          data: {
            consecutiveFailures: cleared.consecutiveFailures,
            level: cleared.level,
            lockedUntil: cleared.lockedUntil,
          },
          select: { accountKey: true },
        });
      }

      return { id: input.id, username, name: row.name, role: row.role };
    });
  } catch (error) {
    // Two operators giving one username at once: the unique index settles it.
    if (isUniqueViolation(error) && wanted !== undefined) {
      throw new ConflictError(USERNAME_TAKEN_MESSAGE(wanted));
    }
    throw error;
  }
}
