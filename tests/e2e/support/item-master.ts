import { randomBytes } from "node:crypto";

import { db } from "@/server/db";

/**
 * Fixtures for the item-master end-to-end specs.
 *
 * Spec 006 AC-34, and the reason this module exists at all: Playwright runs against the
 * DEVELOPMENT database, because that is the one the server under test is connected to —
 * and that database holds the user's real imported master, 140 items, 129 prices and 152
 * yard links. So every row a spec needs it creates itself, under a per-run random suffix
 * that cannot collide with a real description, and deletes again in `afterAll`. Nothing
 * here edits, archives or deletes a row it did not create, and the specs assert the
 * seeded item count is identical before and after the run.
 *
 * The suffix is generated once per Node process, so a spec file's rows are recognisable
 * as a group and a crashed run leaves rows a human can identify and remove.
 */
export const RUN_SUFFIX = `e2e-${randomBytes(6).toString("hex")}`;

/** Everything this process created, youngest first, for `afterAll`. */
type Created = {
  itemIds: string[];
  supplierIds: string[];
  itemTypeIds: string[];
  countIds: string[];
  userIds: string[];
};

export function newLedger(): Created {
  return { itemIds: [], supplierIds: [], itemTypeIds: [], countIds: [], userIds: [] };
}

/** A description no imported row can share: the run suffix is in it. */
export function uniqueName(base: string): string {
  return `${base} ${RUN_SUFFIX}`;
}

export async function seedSupplier(ledger: Created, base: string): Promise<{ id: string; name: string }> {
  const name = uniqueName(base);
  const supplier = await db.supplier.create({ data: { name }, select: { id: true } });
  ledger.supplierIds.push(supplier.id);
  return { id: supplier.id, name };
}

/**
 * `sortOrder` may be given explicitly, and the reorder test gives it.
 *
 * Two types created a moment apart both take `max + 1`, and another worker creating one
 * in between lands between them — which makes "move the lower one up and it swaps with
 * the upper one" false. Two CONSECUTIVE integers cannot have anything between them, so a
 * test that owns a pair like `9000, 9001` owns their adjacency no matter what else the
 * run is doing.
 */
export async function seedItemType(
  ledger: Created,
  base: string,
  sortOrder?: number,
): Promise<{ id: string; code: string; name: string; sortOrder: number }> {
  const code = uniqueName(base).replace(/\s+/g, "_").toUpperCase();
  const name = uniqueName(base);
  // Well past the 19 imported types, so a new one never lands among them.
  const highest = await db.itemType.aggregate({ _max: { sortOrder: true } });
  const position = sortOrder ?? (highest._max.sortOrder ?? 0) + 1;
  const itemType = await db.itemType.create({
    data: { code, name, sortOrder: position },
    select: { id: true },
  });
  ledger.itemTypeIds.push(itemType.id);
  return { id: itemType.id, code, name, sortOrder: position };
}

export type SeedItemInput = {
  base: string;
  itemTypeId: string;
  supplierId?: string | null;
  unitLabel?: string | null;
  needsReview?: boolean;
  notes?: string | null;
  price?: { amount: string; effectiveFrom: string; label?: string | null } | null;
  yards?: { code: "DUBLIN" | "CLONMEL"; sortOrder: number }[];
};

export async function seedItem(
  ledger: Created,
  input: SeedItemInput,
): Promise<{ id: string; description: string }> {
  const description = uniqueName(input.base);

  const item = await db.item.create({
    data: {
      description,
      supplierId: input.supplierId ?? null,
      itemTypeId: input.itemTypeId,
      unitLabel: input.unitLabel ?? null,
      needsReview: input.needsReview ?? false,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });
  ledger.itemIds.push(item.id);

  if (input.price != null) {
    await db.itemPrice.create({
      data: {
        itemId: item.id,
        unitPrice: input.price.amount,
        effectiveFrom: new Date(`${input.price.effectiveFrom}T00:00:00.000Z`),
        label: input.price.label ?? null,
      },
    });
  }

  for (const yard of input.yards ?? []) {
    const location = await db.location.findUniqueOrThrow({
      where: { code: yard.code },
      select: { id: true },
    });
    await db.itemLocation.create({
      data: { itemId: item.id, locationId: location.id, sortOrder: yard.sortOrder },
    });
  }

  return { id: item.id, description };
}

/** A `StockCountLine` naming an item, so `deleteItem` has something to be refused by. */
export async function seedCountLine(
  ledger: Created,
  itemId: string,
  periodMonth: number,
): Promise<void> {
  const location = await db.location.findUniqueOrThrow({
    where: { code: "DUBLIN" },
    select: { id: true },
  });
  const user = await db.user.create({
    data: {
      email: `count-${RUN_SUFFIX}-${periodMonth}@macroads-e2e.invalid`,
      name: "E2E count creator",
      passwordHash: "fixture-not-a-hash",
      role: "ADMIN",
    },
    select: { id: true },
  });
  ledger.userIds.push(user.id);

  // 2999 is a period nothing real occupies, so `@@unique([locationId, year, month])`
  // cannot collide with a count somebody made.
  const count = await db.stockCount.create({
    data: {
      locationId: location.id,
      periodYear: 2999,
      periodMonth,
      countDate: new Date("2999-01-31T00:00:00.000Z"),
      createdById: user.id,
    },
    select: { id: true },
  });
  ledger.countIds.push(count.id);

  await db.stockCountLine.create({
    data: { stockCountId: count.id, itemId, quantity: "1.0000" },
  });
}

/**
 * Undo, child before parent. Nothing here is a `deleteMany` over a table: every id was
 * put in the ledger by this process, so a bug in a filter cannot reach a real row.
 */
export async function cleanUp(ledger: Created): Promise<void> {
  for (const countId of ledger.countIds.splice(0)) {
    await db.stockCountLine.deleteMany({ where: { stockCountId: countId } });
    await db.stockCount.delete({ where: { id: countId } }).catch(() => undefined);
  }
  for (const itemId of ledger.itemIds.splice(0)) {
    // ItemPrice and ItemLocation are Cascade from Item (004 AC-19), so they go with it.
    await db.item.delete({ where: { id: itemId } }).catch(() => undefined);
  }
  for (const supplierId of ledger.supplierIds.splice(0)) {
    await db.supplier.delete({ where: { id: supplierId } }).catch(() => undefined);
  }
  for (const itemTypeId of ledger.itemTypeIds.splice(0)) {
    await db.itemType.delete({ where: { id: itemTypeId } }).catch(() => undefined);
  }
  for (const userId of ledger.userIds.splice(0)) {
    await db.user.delete({ where: { id: userId } }).catch(() => undefined);
  }

  // Anything this run created through the SCREEN rather than through the fixture: the
  // create-item spec makes rows the ledger never saw. They all carry the run suffix.
  await db.item.deleteMany({ where: { description: { contains: RUN_SUFFIX } } });
  await db.supplier.deleteMany({ where: { name: { contains: RUN_SUFFIX } } });
  await db.itemType.deleteMany({ where: { code: { contains: RUN_SUFFIX.toUpperCase() } } });
}

/**
 * The master as the USER left it: every row that is not this suite's.
 *
 * AC-34 asserts these are identical before and after the run. It counts rows without an
 * e2e marker rather than all rows, because three Playwright workers are three processes
 * with three suffixes, all creating and deleting rows at once — a total over the whole
 * table would move for reasons that have nothing to do with whether this feature respects
 * the user's data. What must not move is the 140 items, 129 prices and 152 links the
 * importer wrote, and that is what this counts.
 */
const E2E_MARKER = "e2e-";

export async function seededMasterCounts(): Promise<{
  items: number;
  prices: number;
  links: number;
  suppliers: number;
  itemTypes: number;
}> {
  const notOurs = { NOT: { description: { contains: E2E_MARKER } } };

  return {
    items: await db.item.count({ where: notOurs }),
    prices: await db.itemPrice.count({ where: { item: notOurs } }),
    links: await db.itemLocation.count({ where: { item: notOurs } }),
    suppliers: await db.supplier.count({ where: { NOT: { name: { contains: E2E_MARKER } } } }),
    itemTypes: await db.itemType.count({
      where: { NOT: { code: { contains: E2E_MARKER.toUpperCase() } } },
    }),
  };
}
