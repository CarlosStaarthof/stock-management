import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import type { CountStatus } from "@/types/stock-count";

import { makeUser } from "./item-master-fixture";

/**
 * Level 2 fixtures for feature #8 (`docs/verification.md`): real rows in a real Postgres,
 * read through Prisma rather than through the service under test.
 *
 * IT LIVES UNDER `tests/` FOR ONE SPECIFIC REASON, and it is the reason
 * `tests/support/item-master-fixture.ts` gives for the same move in #6. 007 AC-25 asserts
 * that the ONLY files under `src/server/counts/` and `src/app/stock-entry/` naming
 * `SUBMITTED`, `APPROVED`, `submittedAt`, `approvedAt`, `signatureSvg` or the price
 * snapshot column are two named test files, as an exact list. #8's own criteria need a
 * count that has moved past `DRAFT` (AC-9) and need the snapshot column asserted null
 * after every write (AC-31) — so the two literals live here, outside both scanned trees,
 * and that exact list stays byte-identical.
 */

/**
 * The status a count has after #9 submits it. #8 never writes it and never reads it: the
 * service's branch is `status !== "DRAFT"`, and this constant exists so a test can build
 * the state that branch refuses.
 */
export const PAST_DRAFT: CountStatus = "SUBMITTED";

/** Move a count out of `DRAFT`, as #9 will, so #8 can be asked to refuse it (008 AC-9). */
export async function markPastDraft(countId: string): Promise<void> {
  await db.stockCount.update({ where: { id: countId }, data: { status: PAST_DRAFT } });
}

/**
 * Every column of a `StockCountLine` except the one #8 is allowed to write.
 *
 * A test compares whole rows and asserts the compared key set is exactly this, so "nothing
 * else changed" is proved structurally rather than by naming five columns and hoping a
 * sixth is never added (008 AC-8, AC-28).
 */
export const PRESERVED_LINE_COLUMNS = [
  "id",
  "stockCountId",
  "itemId",
  "unitPriceSnapshot",
  "note",
] as const;

/** The price snapshot of every line of a count. Invariant 2: null until #9 writes it. */
export async function snapshotsOf(countId: string): Promise<(string | null)[]> {
  const lines = await db.stockCountLine.findMany({
    where: { stockCountId: countId },
    orderBy: { itemId: "asc" },
    select: { unitPriceSnapshot: true },
  });

  return lines.map((line) =>
    line.unitPriceSnapshot === null ? null : line.unitPriceSnapshot.toString(),
  );
}

/** Every column of every line of a count, for a before/after comparison. */
export async function lineRowsOf(countId: string): Promise<Record<string, unknown>[]> {
  const lines = await db.stockCountLine.findMany({
    where: { stockCountId: countId },
    orderBy: { itemId: "asc" },
  });

  return lines.map((line) => ({ ...line }) as Record<string, unknown>);
}

/** Every column of the parent count, so AC-8 can prove not one of them moved. */
export async function countRowOf(countId: string): Promise<Record<string, unknown>> {
  const count = await db.stockCount.findUniqueOrThrow({ where: { id: countId } });
  return { ...count } as Record<string, unknown>;
}

/**
 * `SELECT count(*) FROM "StockCountLine" WHERE quantity IS NULL`, in SQL.
 *
 * 008 AC-5 asks for exactly this: the difference between *not counted* and *counted, none
 * held* has to be visible to the database itself, not merely to TypeScript.
 */
export async function nullQuantityLineCount(): Promise<number> {
  const rows = await db.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) AS n FROM "StockCountLine" WHERE quantity IS NULL`;

  return Number(rows[0].n);
}

/** Row counts of every table #8 must be able to prove it did not insert into or delete from. */
export async function allTableCounts(): Promise<Record<string, number>> {
  return {
    stockCount: await db.stockCount.count(),
    stockCountLine: await db.stockCountLine.count(),
    item: await db.item.count(),
    itemPrice: await db.itemPrice.count(),
    itemLocation: await db.itemLocation.count(),
    supplier: await db.supplier.count(),
    itemType: await db.itemType.count(),
    location: await db.location.count(),
    user: await db.user.count(),
  };
}

/**
 * A `SessionUser` for a row that really exists, so a foreign key on `createdById` is
 * satisfiable and `findActiveUserById` has something to find.
 */
export async function actorFor(role: "ADMIN" | "YARD_STAFF", name?: string): Promise<SessionUser> {
  const id = await makeUser(role);
  if (name !== undefined) await db.user.update({ where: { id }, data: { name } });

  const row = await db.user.findUniqueOrThrow({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

/** Every quantity on a count, in `itemId` order, as strings or real `null`s. */
export async function quantitiesOf(countId: string): Promise<(string | null)[]> {
  const lines = await db.stockCountLine.findMany({
    where: { stockCountId: countId },
    orderBy: { itemId: "asc" },
    select: { quantity: true },
  });

  return lines.map((line) => (line.quantity === null ? null : line.quantity.toString()));
}

/** Who started a count. AC-19: no request may change it, whatever it claims to be. */
export async function createdByIdOf(countId: string): Promise<string> {
  const count = await db.stockCount.findUniqueOrThrow({
    where: { id: countId },
    select: { createdById: true },
  });

  return count.createdById;
}
