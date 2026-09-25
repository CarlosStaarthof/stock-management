import { logWarn } from "@/lib/log";
import {
  applyOutcome,
  isLocked,
  type AccountLockState,
} from "@/server/auth/account-lock";
import {
  BUDGET_WINDOW_HOURS,
  bucketFor,
  decideAttempt,
  EVENT_RETENTION_DAYS,
  PIN_FAILURE_BUDGET,
} from "@/server/auth/attempt-budget";
import { parsePin, parseUsername } from "@/server/auth/credential-rules";
import {
  accountKey,
  CredentialSecretError,
  currentPinKeyId,
  signDeviceToken,
  verifyDeviceToken,
  verifyPin,
} from "@/server/auth/password";
import { toSessionUser, type SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";

/**
 * One sign-in attempt, decided in one place (spec 021, *The rules this contract encodes*).
 *
 * The Auth.js `authorize` callback calls this and nothing else, so the sign-in form's
 * server action and a direct POST to the credentials callback meet the same budget and the
 * same lock, and every failed attempt records exactly one event and one step of the lock
 * however many layers it passed through (AC-15).
 *
 * The order is the contract:
 *
 *  1. `PIN_PEPPER` unusable → `UNAVAILABLE`, nothing read or written.
 *  2. The device budget, under a transaction-scoped advisory lock on the bucket. Spent →
 *     `PAUSED`, before any username or PIN is looked at (S8).
 *  3. Parse. Malformed — a trivial PIN included (the Phase A ruling) → one failure in the
 *     device bucket with no account key, no `User` read, no bcrypt.
 *  4. The `AccountLock` row of the typed username, created if absent, locked `FOR UPDATE`
 *     so attempts at one username are serialised (AC-12). Locked → `LOCKED`, nothing
 *     written, no `User` read, no bcrypt.
 *  5. One `User` read, by username.
 *  6. Exactly one bcrypt comparison, whatever the row — against a hash of random bytes when
 *     there is no usable stored hash — so neither the statements nor the work reveal
 *     whether a username exists (AC-10).
 *  7. A PIN stored under another pepper is `INCORRECT` and records nothing (S4).
 *  8. Anything else is one failure: a step of the lock and one `PIN_FAILURE` event.
 */

export type DeviceContext = { deviceToken: string | null };

export type SignInOutcome =
  | { outcome: "SIGNED_IN"; user: SessionUser; sessionEpoch: number; deviceToken: string }
  | { outcome: "INCORRECT" }
  | { outcome: "LOCKED" }
  | { outcome: "PAUSED" }
  | { outcome: "UNAVAILABLE" };

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Attempts at one username queue on its row lock, and attempts from one bucket on its
 * advisory lock, so a transaction may wait for others to finish their bcrypt. The limits
 * are generous for that reason; nothing here is slow on its own.
 */
const TRANSACTION_OPTIONS = { maxWait: 60_000, timeout: 60_000 } as const;

type Transaction = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type ProfileRow = {
  id: string;
  username: string | null;
  name: string;
  role: "YARD_STAFF" | "ADMIN";
  status: "PENDING" | "ACTIVE" | "REJECTED" | "DEACTIVATED";
  pinHash: string | null;
  pinKeyId: string | null;
  sessionEpoch: number;
};

/** `new-devices` or `device`: what a log line may say about a bucket (AC-33). */
function bucketKind(bucket: string): string {
  return bucket.endsWith(":new-devices") ? "new-devices" : "device";
}

/**
 * Every `AuthEvent` past retention, and every lock row whose lock has ended and which has
 * not changed in as long. Run whenever an event is written, so the tables stay bounded by
 * the budgets (AC-14).
 */
async function deleteExpired(tx: Transaction, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * MS_PER_DAY);

  await tx.authEvent.deleteMany({ where: { at: { lt: cutoff } } });
  await tx.accountLock.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
    },
  });
}

async function recordFailure(
  tx: Transaction,
  bucket: string,
  key: string | null,
  now: Date,
): Promise<void> {
  await tx.authEvent.create({
    data: { kind: "PIN_FAILURE", bucket, accountKey: key, at: now },
    select: { id: true },
  });
  await deleteExpired(tx, now);
  logWarn("auth.pin_failed", { bucket: bucketKind(bucket) });
}

/** The lock row of `key`, created if absent and locked for this transaction (step 4). */
async function lockAccountRow(tx: Transaction, key: string, now: Date): Promise<AccountLockState> {
  await tx.$executeRaw`
    INSERT INTO "AccountLock" ("accountKey", "updatedAt") VALUES (${key}, ${now})
    ON CONFLICT ("accountKey") DO NOTHING`;
  const rows = await tx.$queryRaw<AccountLockState[]>`
    SELECT "consecutiveFailures", "level", "lockedUntil" FROM "AccountLock"
    WHERE "accountKey" = ${key} FOR UPDATE`;

  // The row was inserted a statement ago if it did not exist. Were it somehow absent, the
  // zero state is what it would hold, and `writeLock` would then fail loudly on it.
  return rows[0] ?? { consecutiveFailures: 0, level: 0, lockedUntil: null };
}

async function writeLock(
  tx: Transaction,
  key: string,
  state: AccountLockState,
): Promise<void> {
  await tx.accountLock.update({
    where: { accountKey: key },
    data: {
      consecutiveFailures: state.consecutiveFailures,
      level: state.level,
      lockedUntil: state.lockedUntil,
    },
    select: { accountKey: true },
  });
}

/** Parsed input, or `null` when either half is malformed (step 3). */
function parseAttempt(username: string, pin: string): { username: string; pin: string } | null {
  try {
    return { username: parseUsername(username), pin: parsePin(pin) };
  } catch (error) {
    if (error instanceof ValidationError) return null;
    throw error;
  }
}

export async function attemptSignIn(
  username: string,
  pin: string,
  device: DeviceContext,
): Promise<SignInOutcome> {
  // Step 1. Every later step needs the pepper; without it nothing is evaluated (AC-32).
  let keyId: string;
  try {
    keyId = currentPinKeyId();
  } catch (error) {
    if (error instanceof CredentialSecretError) {
      logWarn("auth.sign_in_unavailable", { variable: error.variable });
      return { outcome: "UNAVAILABLE" };
    }
    throw error;
  }

  const deviceId = verifyDeviceToken(device.deviceToken);
  const bucket = bucketFor("PIN_FAILURE", deviceId);

  try {
    return await db.$transaction(async (tx): Promise<SignInOutcome> => {
      const now = new Date();

      // Step 2. The bucket's lock is held to the end of the transaction, so concurrent
      // attempts cannot all read "nine" and all be evaluated (AC-14).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`macroads:budget:${bucket}`}, 0))`;
      const events = await tx.authEvent.findMany({
        where: {
          bucket,
          kind: { in: ["PIN_FAILURE", "BUDGET_RESET"] },
          at: { gt: new Date(now.getTime() - BUDGET_WINDOW_HOURS * MS_PER_HOUR) },
        },
        select: { kind: true, at: true },
      });
      if (
        decideAttempt(events, "PIN_FAILURE", now, PIN_FAILURE_BUDGET, BUDGET_WINDOW_HOURS) ===
        "REFUSE"
      ) {
        return { outcome: "PAUSED" };
      }

      // Step 3.
      const parsed = parseAttempt(username, pin);
      if (parsed === null) {
        await recordFailure(tx, bucket, null, now);
        return { outcome: "INCORRECT" };
      }

      // Step 4.
      const key = accountKey(parsed.username);
      const lock = await lockAccountRow(tx, key, now);
      if (isLocked(lock, now)) {
        return { outcome: "LOCKED" };
      }

      // Step 5.
      const row: ProfileRow | null = await tx.user.findUnique({
        where: { username: parsed.username },
        select: {
          id: true,
          username: true,
          name: true,
          role: true,
          status: true,
          pinHash: true,
          pinKeyId: true,
          sessionEpoch: true,
        },
      });

      // Step 6. One comparison in every case.
      const live = row !== null && row.status === "ACTIVE" && row.username !== null;
      const staleKey = live && row.pinHash !== null && row.pinKeyId !== keyId;
      const usableHash = live && !staleKey ? row.pinHash : null;
      const matches = await verifyPin(parsed.pin, usableHash);

      if (matches && row !== null && row.username !== null) {
        await writeLock(tx, key, applyOutcome(lock, "SUCCESS", now));
        return {
          outcome: "SIGNED_IN",
          user: toSessionUser({
            id: row.id,
            username: row.username,
            name: row.name,
            role: row.role,
          }),
          sessionEpoch: row.sessionEpoch,
          // Issued, or renewed with the same id: a known device stays known (S8).
          deviceToken: signDeviceToken(deviceId),
        };
      }

      // Step 7. The PIN cannot match under this pepper; counting it would lock everyone
      // the day a pepper is replaced (S4). The line names no username.
      if (staleKey) {
        logWarn("auth.pin_key_mismatch", { bucket: bucketKind(bucket) });
        return { outcome: "INCORRECT" };
      }

      // Step 8.
      await writeLock(tx, key, applyOutcome(lock, "FAILURE", now));
      await recordFailure(tx, bucket, key, now);
      return { outcome: "INCORRECT" };
    }, TRANSACTION_OPTIONS);
  } catch (error) {
    // `signDeviceToken` needs AUTH_SECRET; without it no session could be issued either.
    // The transaction has rolled back, so the successful attempt changed nothing.
    if (error instanceof CredentialSecretError) {
      logWarn("auth.sign_in_unavailable", { variable: error.variable });
      return { outcome: "UNAVAILABLE" };
    }
    throw error;
  }
}
