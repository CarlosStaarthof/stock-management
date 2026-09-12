import { db } from "@/server/db";

/**
 * Fixtures for the stock-entry end-to-end specs.
 *
 * Spec 007 AC-30, and the reason this module exists. Playwright runs against the
 * DEVELOPMENT database, because that is the one the server under test is connected to —
 * and a `StockCount` is keyed by `(locationId, periodYear, periodMonth)`, so it cannot
 * carry a per-run random suffix in a name the way an `Item` can. The reservation is a
 * RANGE OF YEARS instead: nothing below `RESERVED_FLOOR` is ever written or deleted, and
 * each spec file owns exactly one year inside it.
 *
 * THE DELETE IS SCOPED TO THE FILE'S OWN YEAR, NEVER THE WHOLE RANGE. `playwright.config.ts`
 * runs three files at once, so a range delete would remove a sibling file's rows mid-run
 * and fail intermittently at `retries: 0` — the exact flakiness AC-30 exists to forbid. It
 * would also destroy the `periodYear: 2999` fixture `tests/e2e/support/item-master.ts` has
 * seeded since #6, on which `tests/e2e/item-master-items.spec.ts` depends for its whole
 * file. Both reasons are recorded in spec 007 § Post-approval amendments 2.
 */

/** Nothing at or above this year is a real count. Nothing below it is ever touched. */
export const RESERVED_FLOOR = 2090;

/** One year per spec file, so two files can never collide on a yard and a month. */
export const RESERVED_YEAR = {
  access: 2091,
  calendar: 2092,
  start: 2093,
  refusals: 2094,
  // #8's three, one each (008 AC-33). Seven files, seven years, and every one of them
  // deletes only its own — never the range, for the reasons recorded above.
  quantities: 2095,
  filters: 2096,
  autosave: 2097,
} as const;

export function assertReserved(year: number): void {
  if (year < RESERVED_FLOOR) {
    throw new Error(
      `${String(year)} is below the reserved floor of ${String(RESERVED_FLOOR)}: a spec may ` +
        "not write or delete a count a real user could own.",
    );
  }
}

/**
 * Every count this file's year holds, gone — and nothing else.
 *
 * Called in `beforeAll` (so a crashed previous run cannot poison this one) and in
 * `afterAll` (so this run leaves nothing behind).
 */
export async function clearReservedYear(year: number): Promise<void> {
  assertReserved(year);

  const counts = await db.stockCount.findMany({
    where: { periodYear: year },
    select: { id: true },
  });

  await db.stockCountLine.deleteMany({
    where: { stockCountId: { in: counts.map((count) => count.id) } },
  });
  await db.stockCount.deleteMany({ where: { periodYear: year } });
}

/**
 * The ids of every count a REAL user could own, sorted.
 *
 * AC-30: identical before and after the run — today, empty, because `StockCount` holds 0
 * rows. This is the assertion that proves a spec never reached outside its reservation.
 */
export async function realCountIds(): Promise<string[]> {
  const counts = await db.stockCount.findMany({
    where: { periodYear: { lt: RESERVED_FLOOR } },
    select: { id: true },
  });

  return counts.map((count) => count.id).sort();
}

/** How many counts this file's year currently holds, for a "this GET wrote nothing" check. */
export async function reservedCountTotals(
  year: number,
): Promise<{ counts: number; lines: number }> {
  assertReserved(year);

  const counts = await db.stockCount.findMany({
    where: { periodYear: year },
    select: { id: true },
  });

  return {
    counts: counts.length,
    lines: await db.stockCountLine.count({
      where: { stockCountId: { in: counts.map((count) => count.id) } },
    }),
  };
}

/** The id of the count this yard and period holds, or `null`. */
export async function countIdFor(
  locationCode: "DUBLIN" | "CLONMEL",
  year: number,
  month: number,
): Promise<string | null> {
  const location = await db.location.findUniqueOrThrow({
    where: { code: locationCode },
    select: { id: true },
  });

  const count = await db.stockCount.findUnique({
    where: {
      locationId_periodYear_periodMonth: {
        locationId: location.id,
        periodYear: year,
        periodMonth: month,
      },
    },
    select: { id: true },
  });

  return count === null ? null : count.id;
}

/** `createdById` of a count, so AC-4 can assert whose id was really written. */
export async function createdByIdOf(countId: string): Promise<string> {
  const count = await db.stockCount.findUniqueOrThrow({
    where: { id: countId },
    select: { createdById: true },
  });
  return count.createdById;
}

/**
 * A count created directly, for a spec that needs one to LOOK at rather than to make.
 *
 * It goes through Prisma rather than through `startCount`, so a fixture cannot fail
 * independently of the thing it is meant to prove — the same choice
 * `tests/support/item-master-fixture.ts` records for #6.
 */
export async function seedCount(input: {
  locationCode: "DUBLIN" | "CLONMEL";
  year: number;
  month: number;
  countDate: string;
  createdById: string;
}): Promise<string> {
  assertReserved(input.year);
  assertReserved(Number(input.countDate.slice(0, 4)));

  const location = await db.location.findUniqueOrThrow({
    where: { code: input.locationCode },
    select: { id: true },
  });

  const count = await db.stockCount.create({
    data: {
      locationId: location.id,
      periodYear: input.year,
      periodMonth: input.month,
      countDate: new Date(`${input.countDate}T00:00:00.000Z`),
      createdById: input.createdById,
    },
    select: { id: true },
  });

  return count.id;
}

/** One real price from the master, so a spec can assert the page does not contain it. */
export async function anyUnitPriceText(): Promise<string | null> {
  const price = await db.itemPrice.findFirst({ select: { unitPrice: true } });
  return price === null ? null : price.unitPrice.toString();
}

/* ------------------------------------------------------------------ #8, the counting */

/**
 * One `StockCountLine` per item on the yard's sheet, `quantity` null — the state #7's
 * `startCount` leaves behind, built directly through Prisma.
 *
 * It goes through Prisma rather than through `startCount` for the reason
 * `tests/support/item-master-fixture.ts` records for #6: a fixture must not be able to
 * fail independently of the thing it is meant to prove. What #8's criteria are about is
 * what happens to these lines afterwards, so the lines themselves are a precondition and
 * are built the shortest honest way.
 *
 * It returns how many lines there are, because the Dublin sheet is the USER'S master and
 * a criterion that hard-coded 82 would be asserting about their data rather than about
 * this feature. 007's `stock-entry-start.spec.ts` made the same choice and records it.
 */
export async function seedCountLines(
  countId: string,
  locationCode: "DUBLIN" | "CLONMEL",
): Promise<number> {
  const location = await db.location.findUniqueOrThrow({
    where: { code: locationCode },
    select: { id: true },
  });

  const links = await db.itemLocation.findMany({
    where: { locationId: location.id },
    select: { itemId: true },
  });

  await db.stockCountLine.createMany({
    data: links.map((link) => ({ stockCountId: countId, itemId: link.itemId })),
    skipDuplicates: true,
  });

  return links.length;
}

/** A count, its lines, and the number of them — the one call a #8 spec starts from. */
export async function seedCountWithLines(input: {
  locationCode: "DUBLIN" | "CLONMEL";
  year: number;
  month: number;
  countDate: string;
  createdById: string;
}): Promise<{ countId: string; lineCount: number }> {
  const countId = await seedCount(input);
  return { countId, lineCount: await seedCountLines(countId, input.locationCode) };
}

/**
 * Every quantity of a count, keyed by `itemId`, as decimal strings or real `null`s.
 *
 * `null` and `"0"` are DIFFERENT values here, and that difference is the feature
 * (008 AC-5). A helper that returned `0` for both would make the criterion unprovable.
 */
export async function quantitiesByItem(countId: string): Promise<Map<string, string | null>> {
  const lines = await db.stockCountLine.findMany({
    where: { stockCountId: countId },
    select: { itemId: true, quantity: true },
  });

  return new Map(
    lines.map((line): [string, string | null] => [
      line.itemId,
      line.quantity === null ? null : line.quantity.toString(),
    ]),
  );
}

/** One line's stored quantity, or `null` — the read-back 008 AC-5 asks for. */
export async function quantityOf(countId: string, itemId: string): Promise<string | null> {
  const line = await db.stockCountLine.findFirstOrThrow({
    where: { stockCountId: countId, itemId },
    select: { quantity: true },
  });

  return line.quantity === null ? null : line.quantity.toString();
}

/** `SELECT count(*) … WHERE quantity IS NULL`, for one count (008 AC-5, AC-24). */
export async function uncountedLinesOf(countId: string): Promise<number> {
  return db.stockCountLine.count({ where: { stockCountId: countId, quantity: null } });
}

/** The price snapshot of every line, which Invariant 2 keeps null until #9 writes it. */
export async function snapshotsOf(countId: string): Promise<(string | null)[]> {
  const lines = await db.stockCountLine.findMany({
    where: { stockCountId: countId },
    select: { unitPriceSnapshot: true },
  });

  return lines.map((line) =>
    line.unitPriceSnapshot === null ? null : line.unitPriceSnapshot.toString(),
  );
}

/**
 * The status a count has after #9 submits it.
 *
 * IT LIVES IN A TEST SUPPORT MODULE, and 007 AC-25 is the reason: the only files under
 * `src/server/counts/` and `src/app/stock-entry/` that may name a status past `DRAFT` are
 * two named test files, as an exact list. #8 needs a count the service will refuse to edit
 * (008 AC-9), so the literal lives out here and that list stays byte-identical.
 */
const PAST_DRAFT = "SUBMITTED" as const;

/** Move a count out of `DRAFT`, as #9 will, so #8 can be asked to refuse it (008 AC-9). */
export async function markPastDraft(countId: string): Promise<void> {
  await db.stockCount.update({ where: { id: countId }, data: { status: PAST_DRAFT } });
}
