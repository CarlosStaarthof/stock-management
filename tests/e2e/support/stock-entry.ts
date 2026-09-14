import type { Role } from "@/server/auth/roles";
import type { SessionUser } from "@/server/auth/session-user";
import { approveCount, submitCount } from "@/server/counts/count-lifecycle-service";
import { db } from "@/server/db";
import { strokesToPath } from "@/lib/signature-path";

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
  // #9's three, one each (009 AC-32). Ten files, ten years.
  //
  // 2100 IS THE LAST YEAR A COUNT CREATED THROUGH `startCount` CAN RESERVE, and the note
  // is corrected here rather than left to be discovered (010 AC-21). 007 AC-8 caps the
  // PERIOD a count may close at 2100, and that cap binds the start flow - it does not bind
  // a count built through Prisma. #10's two specs need a count to LOOK at rather than one
  // to make, so they build theirs with `seedCountWithLines`, `fillQuantities`, `submitAs`
  // and `approveAs`, which go through Prisma and the lifecycle service; 2101 and 2102 are
  // therefore reachable, and a spec that needs the START flow still has no year past 2100.
  submit: 2098,
  approve: 2099,
  signature: 2100,
  // #10's two, one each (010 AC-21). Twelve files, twelve years, and every one of them
  // still deletes only its own.
  takesCalendar: 2101,
  takesCount: 2102,
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

/* ------------------------------------------------------------------ #9, the lifecycle */

/**
 * A signature the grammar accepts, spelled once for every spec that needs one.
 *
 * It is built by `strokesToPath` rather than typed as a literal, so a change to the format
 * moves the fixture with it - the same reason the pad, the service and the parser all read
 * `src/lib/signature-path.ts` (009 AC-5).
 */
export const DRAWN_SIGNATURE = strokesToPath([
  [
    { x: 20, y: 40 },
    { x: 80, y: 120 },
    { x: 140, y: 60 },
  ],
  [
    { x: 200, y: 100 },
    { x: 260, y: 40 },
  ],
]);

/** A `SessionUser` for a test account, so a spec can call a service the way a page does. */
export function actorFor(user: { id: string; email: string; role: Role }): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.role === "ADMIN" ? "E2E Administrator" : "E2E Yard Staff",
    role: user.role,
  };
}

/**
 * Every line of a count given a quantity, except `leaveUncounted` of them.
 *
 * Invariant 5 is what this exists for: a count with one `null` cannot be submitted, and a
 * spec that wants the blocked state and a spec that wants the submittable one differ by
 * this one number (009 AC-3, AC-4).
 */
export async function fillQuantities(
  countId: string,
  leaveUncounted = 0,
): Promise<{ counted: number; uncounted: string[] }> {
  const lines = await db.stockCountLine.findMany({
    where: { stockCountId: countId },
    select: { id: true, itemId: true },
    orderBy: { itemId: "asc" },
  });

  const uncounted = lines.slice(0, leaveUncounted);
  const toCount = lines.slice(leaveUncounted);

  await db.stockCountLine.updateMany({
    where: { id: { in: toCount.map((line) => line.id) } },
    // A number, not a zero: `0` is counted and none held, and both are counted (008 AC-5).
    data: { quantity: 3 },
  });
  await db.stockCountLine.updateMany({
    where: { id: { in: uncounted.map((line) => line.id) } },
    data: { quantity: null },
  });

  return { counted: toCount.length, uncounted: uncounted.map((line) => line.itemId) };
}

/** The whole lifecycle of a count, read straight from Postgres (009 AC-14, AC-18). */
export async function lifecycleOf(countId: string): Promise<{
  status: string;
  signaturePath: string | null;
  signedById: string | null;
  approvedById: string | null;
  submittedOn: Date | null;
  approvedOn: Date | null;
  notes: string | null;
}> {
  const row = await db.stockCount.findUniqueOrThrow({
    where: { id: countId },
    select: {
      status: true,
      signatureSvg: true,
      signedById: true,
      approvedById: true,
      submittedAt: true,
      approvedAt: true,
      notes: true,
    },
  });

  return {
    status: row.status,
    signaturePath: row.signatureSvg,
    signedById: row.signedById,
    approvedById: row.approvedById,
    submittedOn: row.submittedAt,
    approvedOn: row.approvedAt,
    notes: row.notes,
  };
}

/**
 * A count submitted through the REAL service, for a spec that needs one to look at.
 *
 * The fixture goes through `submitCount` rather than through Prisma precisely because the
 * snapshot write is what makes a valued summary possible: writing `status` directly would
 * leave every `unitPriceSnapshot` null and the summary would be a page of `No price` tags
 * that proved nothing (Invariant 2).
 */
export async function submitAs(
  countId: string,
  user: { id: string; email: string; role: Role },
  signaturePath = DRAWN_SIGNATURE,
): Promise<void> {
  await submitCount(actorFor(user), countId, { signaturePath });
}

/**
 * A count approved through the REAL service, for a spec that needs an `APPROVED` one to
 * look at.
 *
 * Through `approveCount` and never through Prisma, for the same reason as `submitAs`: a
 * direct `status` write would leave `approvedById` and `approvedAt` null and the screens
 * would render a state the product can never actually be in (009 AC-16).
 *
 * The actor must be an `ADMIN`; a staff one is refused by the service, which is 009 AC-15's
 * assertion and not this fixture's.
 */
export async function approveAs(
  countId: string,
  user: { id: string; email: string; role: Role },
): Promise<void> {
  await approveCount(actorFor(user), countId);
}
