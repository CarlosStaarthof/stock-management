import { NO_SUPPLIER } from "@/lib/analysis-messages";
import { isHeld } from "@/lib/held";
import { multiplyDecimal, sumDecimals } from "@/lib/money";
import type { Role } from "@/server/auth/roles";
import { db } from "@/server/db";

import { seedCount } from "./stock-entry";

/**
 * Fixtures for the two `/analysis` specs (spec 011 AC-24).
 *
 * IT IS A NEW MODULE RATHER THAN AN EDIT TO `tests/e2e/support/stock-entry.ts`, for the
 * reason #10 recorded when it added `tests/e2e/support/stock-takes.ts`: that file is a
 * SHIPPED one and 011 AC-25 lets this feature amend it "exactly as AC-24 names and no
 * further" — which is `RESERVED_YEAR` and its one-year-per-file note. The year
 * reservation, the count seeding and the lifecycle helpers are still its, and are imported
 * from it, because a second definition of "a reserved year" is what 007 AC-30 forbids.
 *
 * THE COUNTS HERE HOLD A HANDFUL OF LINES, NOT A WHOLE YARD SHEET. #8's and #10's fixtures
 * call `seedCountLines`, which writes one line per item on the sheet — 82 for Dublin — and
 * this feature needs ELEVEN counts across two years, each submitted and approved through
 * the real service. That is several thousand round trips to a database in another region
 * for figures that a dozen lines prove exactly as well. What the criteria here are about
 * is how lines across MANY counts are joined, so the lines themselves are a precondition
 * and are built the shortest honest way (`tests/support/item-master-fixture.ts`'s rule).
 *
 * THE SUBMIT AND THE APPROVAL GO THROUGH THE REAL SERVICE, and that is not shortenable:
 * `unitPriceSnapshot` is written at SUBMIT and by nothing else (Invariant 2), so a status
 * written straight into the column would leave every snapshot null and every figure on the
 * screen zero. The fixture must produce a real record or it proves nothing.
 *
 * NO EURO FIGURE IS ASSERTED AS A LITERAL ANYWHERE IN THIS SUITE. The prices are the
 * USER'S master and a literal would be an assertion about their data; 007's start spec
 * recorded that choice and 008 and 010 repeated it. So the specs recompute the expected
 * figure from the rows they seeded, with `yardValueOf` below, and compare.
 */

/** What `submitAs` and `approveAs` want: a test account, as the session sees it. */
export type Actor = { id: string; username: string; name: string; role: Role };

/** One item of the user's master, with the two facts the breakdown groups on. */
export type FixtureItem = {
  itemId: string;
  itemTypeId: string;
  supplierId: string | null;
};

/**
 * Items off one yard's own sheet, chosen for VARIETY rather than taken from the top.
 *
 * The breakdown groups by type and by supplier, so a fixture of five items that happen to
 * share a type would render one row and prove nothing about the ordering, the per-yard
 * columns or the `No supplier` group. This picks an unsupplied item first if the sheet has
 * one — `Dublin!A45` `School Logo Triangle` is the real case AC-15 names — then one item
 * of each distinct type, then whatever is left, so the groups are as many as the master
 * can supply without the spec knowing anything about it.
 *
 * EVERY ITEM IT RETURNS HAS A PRICE IN THE MASTER, and that is not a tidiness choice. The
 * user's own master contains items with NO price at all — that is Invariant 4's whole
 * subject, and the first run of this suite found one on the Dublin sheet — so a fixture
 * built from arbitrary items has an unvalued held line in it that the spec did not put
 * there, and every count of them becomes a fact about the master rather than about this
 * feature. Taking only priced items makes `clearPriceSnapshots` the ONLY source of an
 * unpriced line, so `3 held lines have no price` and `1 held line has` are both exactly
 * what the fixture asked for.
 */
export async function pickSheetItems(
  locationCode: "DUBLIN" | "CLONMEL",
  howMany: number,
): Promise<FixtureItem[]> {
  const links = await db.itemLocation.findMany({
    where: {
      location: { code: locationCode },
      // `prices: { some: {} }` is "this item has at least one price row", which is what
      // makes the snapshot #9 writes at submit a figure rather than a null.
      item: { active: true, prices: { some: {} } },
    },
    select: { item: { select: { id: true, itemTypeId: true, supplierId: true } } },
    orderBy: { itemId: "asc" },
  });

  const candidates: FixtureItem[] = links.map((link) => ({
    itemId: link.item.id,
    itemTypeId: link.item.itemTypeId,
    supplierId: link.item.supplierId,
  }));

  const chosen: FixtureItem[] = [];
  const taken = new Set<string>();
  const take = (item: FixtureItem): void => {
    if (taken.has(item.itemId) || chosen.length >= howMany) return;
    taken.add(item.itemId);
    chosen.push(item);
  };

  const unsupplied = candidates.find((item) => item.supplierId === null);
  if (unsupplied !== undefined) take(unsupplied);

  const seenTypes = new Set<string>();
  for (const item of candidates) {
    if (seenTypes.has(item.itemTypeId)) continue;
    seenTypes.add(item.itemTypeId);
    take(item);
  }

  for (const item of candidates) take(item);

  return chosen;
}

/** One line of a fixture count: an item, and the quantity the yard walked. */
export type FixtureLine = { itemId: string; quantity: string };

/**
 * A count in a reserved year, holding exactly the lines it is given.
 *
 * Through Prisma rather than through `startCount`, which is what makes years past 2100
 * reachable at all: 007 AC-8 caps the PERIOD a count started through that flow may close
 * at 2100, and it does not bind a count built directly.
 */
export async function seedCountHolding(input: {
  locationCode: "DUBLIN" | "CLONMEL";
  year: number;
  month: number;
  countDate: string;
  owner: Actor;
  lines: readonly FixtureLine[];
}): Promise<string> {
  const countId = await seedCount({
    locationCode: input.locationCode,
    year: input.year,
    month: input.month,
    countDate: input.countDate,
    createdById: input.owner.id,
  });

  await db.stockCountLine.createMany({
    data: input.lines.map((line) => ({
      stockCountId: countId,
      itemId: line.itemId,
      // A string, never a float: `0` is counted and none held, and both are counted.
      quantity: line.quantity,
    })),
    skipDuplicates: true,
  });

  return countId;
}

/**
 * Invariant 4's state, on a count that is already a record: held, counted, and never
 * valued.
 *
 * The snapshot is cleared AFTER approval rather than before, because #9's `submitCount` is
 * the only thing that may write that column and it writes whatever the master holds. A
 * master where every item happens to be priced would otherwise make AC-9 unprovable in a
 * browser — the €486 that `Dublin!AH25` and `!AH51` counted and never valued is the defect
 * the criterion exists for, and a fixture that could not reproduce it would leave the one
 * sentence on this screen that names a hole untested.
 */
export async function clearPriceSnapshots(
  countId: string,
  itemIds: readonly string[],
): Promise<void> {
  await db.stockCountLine.updateMany({
    where: { stockCountId: countId, itemId: { in: [...itemIds] } },
    data: { unitPriceSnapshot: null },
  });
}

/** One count's lines, as the raw strings every figure on the screen is computed from. */
export async function valuedLinesOf(
  countId: string,
): Promise<{ itemId: string; quantity: string; snapshot: string | null }[]> {
  const lines = await db.stockCountLine.findMany({
    where: { stockCountId: countId },
    select: { itemId: true, quantity: true, unitPriceSnapshot: true },
    orderBy: { itemId: "asc" },
  });

  return lines.map((line) => ({
    itemId: line.itemId,
    quantity: line.quantity === null ? "0" : line.quantity.toString(),
    snapshot: line.unitPriceSnapshot === null ? null : line.unitPriceSnapshot.toString(),
  }));
}

/**
 * What one count is worth, recomputed from its own rows: `Σ (quantity × (snapshot ?? 0))`.
 *
 * Invariant 4 is in the `?? "0"`: an unpriced line contributes nothing and is COUNTED
 * separately, rather than being dropped from the sum as though it had never been held.
 */
export function yardValueOf(
  lines: readonly { quantity: string; snapshot: string | null }[],
): string {
  return sumDecimals(lines.map((line) => multiplyDecimal(line.quantity, line.snapshot ?? "0")));
}

/** Held lines with no price: `quantity > 0` and no snapshot (AC-9). */
export function unvaluedHeldLinesOf(
  lines: readonly { quantity: string; snapshot: string | null }[],
): number {
  // `isHeld` is #10's one definition of "this line holds stock", down to the decimal
  // comparison: `Decimal(12, 4)` reads a counted zero back as `"0.0000"`, which is not a
  // string a test may compare against `"0"` itself.
  return lines.filter((line) => line.snapshot === null && isHeld(line.quantity)).length;
}

/**
 * How many `APPROVED` counts the WHOLE database holds right now.
 *
 * A PRECONDITION, NEVER A BRANCH. The empty state is a fact about the whole database, and
 * the shared e2e database is never in it: three workers run fourteen spec files, several of
 * which approve counts in their own reserved years. A test that branched on this being zero
 * could never reach its asserting branch (011 review finding B1), so the empty state's page
 * half is proved by `src/app/analysis/page.test.ts` instead, and `analysis-access.spec.ts`
 * uses this only to assert that its own approved counts exist before it asserts the grid.
 */
export async function approvedCountTally(): Promise<number> {
  return db.stockCount.count({ where: { status: "APPROVED" } });
}

/** The active yards, in `Location.sortOrder` — the order every column on the screen uses. */
export async function activeYards(): Promise<{ code: string; name: string }[]> {
  const yards = await db.location.findMany({
    where: { active: true },
    select: { code: true, name: true },
    orderBy: { sortOrder: "asc" },
  });

  return yards.map((yard) => ({ code: yard.code, name: yard.name }));
}

/**
 * The type groups the breakdown will render for a set of held lines, IN THE ORDER IT WILL
 * render them: `ItemType.sortOrder`, then name (AC-15).
 *
 * Derived from the master rather than typed out, for the reason every fixture in this
 * suite gives: the types are the USER'S and a spec that named `Thermo-P` would be
 * asserting about their data instead of about this feature.
 */
export async function typeGroupsFor(
  itemIds: readonly string[],
): Promise<{ code: string; name: string }[]> {
  const items = await db.item.findMany({
    where: { id: { in: [...itemIds] } },
    select: { itemType: { select: { code: true, name: true, sortOrder: true } } },
  });

  const groups = new Map<string, { code: string; name: string; sortOrder: number }>();
  for (const item of items) {
    groups.set(item.itemType.code, {
      code: item.itemType.code,
      name: item.itemType.name,
      sortOrder: item.itemType.sortOrder,
    });
  }

  return [...groups.values()]
    .sort((left, right) =>
      left.sortOrder === right.sortOrder
        ? left.name.localeCompare(right.name)
        : left.sortOrder - right.sortOrder,
    )
    .map((group) => ({ code: group.code, name: group.name }));
}

/**
 * The supplier groups, in the order the breakdown will render them: name ascending, with
 * the items that have NO supplier last (AC-15).
 *
 * `Supplier` has no `sortOrder` column, so name is the order; the group key of the
 * unsupplied items is the empty string, which is why it cannot simply sort with the rest.
 */
export async function supplierGroupsFor(
  itemIds: readonly string[],
): Promise<{ key: string; label: string }[]> {
  const items = await db.item.findMany({
    where: { id: { in: [...itemIds] } },
    select: { supplier: { select: { id: true, name: true } } },
  });

  const named = new Map<string, string>();
  let anyUnsupplied = false;
  for (const item of items) {
    if (item.supplier === null) anyUnsupplied = true;
    else named.set(item.supplier.id, item.supplier.name);
  }

  const groups = [...named.entries()]
    .sort((left, right) => left[1].localeCompare(right[1]))
    .map(([key, label]) => ({ key, label }));

  return anyUnsupplied ? [...groups, { key: "", label: NO_SUPPLIER }] : groups;
}
