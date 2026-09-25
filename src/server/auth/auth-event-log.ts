import {
  BUDGET_WINDOW_HOURS,
  EVENT_RETENTION_DAYS,
  type AttemptEvent,
  type CountedEventKind,
} from "@/server/auth/attempt-budget";
import { db } from "@/server/db";

/**
 * The budget bookkeeping every attempt shares (021 S8, AC-14, AC-20, AC-26, AC-28): sign-in,
 * profile requests, first-run setup and the admin section's resume. Each is one bucket's
 * events, read under that bucket's transaction-scoped advisory lock, so concurrent attempts
 * on one bucket queue instead of all reading "nine".
 *
 * ONE SOURCE for the lock key and the retention sweep: a bucket has one lock whoever takes
 * it, and every event written by an attempt runs the same sweep. Nothing here reads a
 * `User` row, and no event carries a typed value: an event is a kind, a bucket, a time and,
 * for a PIN failure at a well-formed username, that username's account key (AC-14).
 */

export type Transaction = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/** The same limits `attemptSignIn` uses: a transaction may queue behind another's bcrypt. */
export const AUTH_TRANSACTION_OPTIONS = { maxWait: 60_000, timeout: 60_000 } as const;

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Held until the transaction ends. */
export async function lockBucket(tx: Transaction, bucket: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`macroads:budget:${bucket}`}, 0))`;
}

/** The bucket's events of `kind`, and its resets, inside the rolling window ending at `now`. */
export async function bucketEvents(
  tx: Transaction,
  bucket: string,
  kind: CountedEventKind,
  now: Date,
): Promise<AttemptEvent[]> {
  return tx.authEvent.findMany({
    where: {
      bucket,
      kind: { in: [kind, "BUDGET_RESET"] },
      at: { gt: new Date(now.getTime() - BUDGET_WINDOW_HOURS * MS_PER_HOUR) },
    },
    select: { kind: true, at: true },
  });
}

/**
 * One event in `bucket`, then every event past retention and every lock row whose lock has
 * ended and which has not changed in as long — the rule AC-14 states for writing an event.
 *
 * `accountKey` is given by a PIN failure only: the key of a well-formed username, or `null`
 * for a malformed attempt. Omitted, the column is not named in the insert at all, so the
 * request and setup services send exactly the statement they always sent.
 */
export async function recordEvent(
  tx: Transaction,
  kind: CountedEventKind,
  bucket: string,
  now: Date,
  accountKey?: string | null,
): Promise<void> {
  const data = accountKey === undefined ? { kind, bucket, at: now } : { kind, bucket, accountKey, at: now };
  await tx.authEvent.create({ data, select: { id: true } });

  const cutoff = new Date(now.getTime() - EVENT_RETENTION_DAYS * MS_PER_DAY);
  await tx.authEvent.deleteMany({ where: { at: { lt: cutoff } } });
  await tx.accountLock.deleteMany({
    where: {
      updatedAt: { lt: cutoff },
      OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
    },
  });
}

/**
 * Lifts the pause on `bucket` (AC-26): one `BUDGET_RESET` event, after which the events
 * before it no longer count (`decideAttempt`). It deletes no event — the failures stay
 * visible on `/profiles` — so it runs no retention sweep either: an admin's reset is not an
 * attempt, and it is the attempts that keep the table bounded.
 */
export async function recordBudgetReset(tx: Transaction, bucket: string, now: Date): Promise<void> {
  await tx.authEvent.create({ data: { kind: "BUDGET_RESET", bucket, at: now }, select: { id: true } });
}

/** Prisma's unique-constraint violation, recognised without importing its types. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
