import { ONLY_ACTIVE_PIN_RESET } from "@/lib/auth-messages";
import { applyOutcome, isLocked } from "@/server/auth/account-lock";
import { EVENT_RETENTION_DAYS } from "@/server/auth/attempt-budget";
import { generatePin, type PinLength } from "@/server/auth/credential-rules";
import { assertRole } from "@/server/auth/guards";
import { accountKey, currentPinKeyId, hashPin } from "@/server/auth/password";
import type { ProfileStatus } from "@/server/auth/profile-status";
import type { Role } from "@/server/auth/roles";
import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";

/**
 * The admin section's services (spec 021 D4, `/profiles`). ADMIN-only, refused HERE rather
 * than in the middleware (003 AC-16), so removing the route's middleware entry exposes none
 * of it.
 *
 * Feature #21 builds this module in two phases. Phase B ships the shapes and
 * `resetProfilePin`, because a reset is what ends every session that used the old PIN
 * (AC-17, AC-24), and the sign-in swap is not complete until that holds.
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

const MS_PER_DAY = 86_400_000;

type Transaction = Parameters<Parameters<typeof db.$transaction>[0]>[0];
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

/**
 * One profile as the admin section shows it. Every field is copied by name, and the PIN
 * hash and its key are reduced to two booleans before anything leaves this module.
 */
async function toProfileListEntry(reader: Reader, id: string, now: Date): Promise<ProfileListEntry> {
  const row = await reader.user.findUnique({ where: { id }, select: PROFILE_SELECT });
  if (row === null) {
    throw new NotFoundError(`Profile ${id} does not exist`);
  }

  const keyId = currentPinKeyId();
  let lock: AccountLockView | null = null;
  if (row.username !== null) {
    const key = accountKey(row.username);
    const state = await reader.accountLock.findUnique({
      where: { accountKey: key },
      select: { consecutiveFailures: true, level: true, lockedUntil: true },
    });
    const failuresLast30Days = await reader.authEvent.count({
      where: {
        kind: "PIN_FAILURE",
        accountKey: key,
        at: { gt: new Date(now.getTime() - EVENT_RETENTION_DAYS * MS_PER_DAY) },
      },
    });
    const current = state ?? { consecutiveFailures: 0, level: 0, lockedUntil: null };
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
    const rows = await tx.$queryRaw<{ status: ProfileStatus; username: string | null }[]>`
      SELECT "status", "username" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
    const row = rows[0];
    if (row === undefined) {
      throw new NotFoundError(`Profile ${id} does not exist`);
    }
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

    const key = accountKey(row.username);
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

    return toProfileListEntry(tx, id, now);
  });

  return { profile, newPin };
}
