import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { resetTestDb, SEEDED_LOCATIONS } from "@/server/test-db";

/**
 * Spec 004, the referential half: the `onDelete` policy of every foreign key, and what it
 * buys - history that survives archival.
 *
 * The intent behind the table in the spec is one sentence: an entity that history refers
 * to cannot be deleted, and rows that are merely parts of another row go with their
 * parent. `Restrict` is what makes "archiving never alters historical lines" (Part 5) a
 * fact rather than a habit.
 *
 * The delete rules are read out of `information_schema.referential_constraints`, not out
 * of prisma/schema.prisma, and then exercised for real.
 */

type ForeignKeyRow = {
  constraint_name: string;
  delete_rule: string;
  table_name: string;
  column_name: string;
};

type IndexRow = { tablename: string; indexname: string; indexdef: string };

async function foreignKeys(): Promise<Map<string, ForeignKeyRow>> {
  const rows = await db.$queryRaw<ForeignKeyRow[]>`
    SELECT rc.constraint_name, rc.delete_rule, kcu.table_name, kcu.column_name
    FROM information_schema.referential_constraints rc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = rc.constraint_name
     AND kcu.constraint_schema = rc.constraint_schema
    WHERE rc.constraint_schema = 'public'
    ORDER BY kcu.table_name, kcu.column_name`;

  return new Map(rows.map((row) => [`${row.table_name}.${row.column_name}`, row]));
}

/** The first column of an index, taken from the `USING …(…)` clause of its definition. */
function leadingColumn(indexdef: string): string | undefined {
  const match = /USING\s+\w+\s+\(([^)]*)\)/.exec(indexdef);
  if (match === null) return undefined;

  const first = match[1].split(",")[0].trim();
  const quoted = /^"([^"]+)"/.exec(first);
  return quoted === null ? first.split(/\s+/)[0] : quoted[1];
}

/**
 * Runs `action`, requires it to reject, and returns the rejection.
 *
 * `refusedBy` names the foreign key that was supposed to do the refusing, so a red run
 * says WHICH rule stopped being enforced rather than only that something did (AC-25).
 */
async function rejection(action: () => Promise<unknown>, refusedBy: string): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error(
    `expected the database to refuse this delete through ${refusedBy}, but it succeeded`,
  );
}

/**
 * A delete refused by a RESTRICT foreign key.
 *
 * Spec 004 AC-20 names Prisma's `P2003` / `P2014`. Prisma raises neither here, and the
 * reason is AC-19: the key is genuinely `ON DELETE RESTRICT`, so Postgres refuses with
 * SQLSTATE `23001` (`restrict_violation`) before Prisma's own referential layer is
 * involved, and Prisma relays that raw error as a `PrismaClientUnknownRequestError` with
 * no `code`. `P2003` is what a `NO ACTION` / `23503` key would produce.
 *
 * So the assertion is the stronger, true one: the refusal names the foreign key, and it
 * is a RESTRICT refusal. See progress/impl_domain_schema.md, "Deviations from the spec".
 */
function expectRestrictViolation(error: unknown, constraintName: string): void {
  const text = String(error);

  expect(text, "SQLSTATE 23001, restrict_violation").toContain('code: "23001"');
  expect(text).toContain("violates RESTRICT setting of foreign key constraint");
  expect(text).toContain(constraintName);
}

function suffix(): string {
  return randomBytes(6).toString("hex");
}

type Fixture = {
  userId: string;
  itemTypeId: string;
  supplierId: string;
  itemId: string;
  itemPriceId: string;
  itemLocationId: string;
  stockCountId: string;
  stockCountLineId: string;
};

/** One row in every one of the nine tables, wired together the way #7 will wire them. */
async function seedEverything(): Promise<Fixture> {
  const unique = suffix();

  const user = await db.user.create({
    data: {
      name: "Referential Fixture",
      status: "ACTIVE",
    },
  });
  const itemType = await db.itemType.create({
    data: { code: `TYPE_${unique}`, name: "Road studs", sortOrder: 2 },
  });
  const supplier = await db.supplier.create({ data: { name: `Kestrel ${unique}` } });
  const item = await db.item.create({
    data: { description: `Road Studs 301 Type ${unique}`, itemTypeId: itemType.id, supplierId: supplier.id },
  });
  const itemPrice = await db.itemPrice.create({
    data: {
      itemId: item.id,
      unitPrice: "6.11764706",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  const itemLocation = await db.itemLocation.create({
    data: { itemId: item.id, locationId: "loc_dublin", sortOrder: 4 },
  });
  const stockCount = await db.stockCount.create({
    data: {
      locationId: "loc_dublin",
      periodYear: 2026,
      periodMonth: 9,
      countDate: new Date("2026-09-30T00:00:00.000Z"),
      createdById: user.id,
    },
  });
  const line = await db.stockCountLine.create({
    data: {
      stockCountId: stockCount.id,
      itemId: item.id,
      quantity: "21.6128",
      unitPriceSnapshot: "6.11764706",
    },
  });

  return {
    userId: user.id,
    itemTypeId: itemType.id,
    supplierId: supplier.id,
    itemId: item.id,
    itemPriceId: itemPrice.id,
    itemLocationId: itemLocation.id,
    stockCountId: stockCount.id,
    stockCountLineId: line.id,
  };
}

beforeEach(async () => {
  await resetTestDb();
});

describe("every foreign key carries the delete rule the spec chose", () => {
  const RESTRICTED = [
    "StockCountLine.itemId",
    "StockCount.locationId",
    "StockCount.createdById",
    "StockCount.approvedById",
    "StockCount.signedById",
    "ItemLocation.locationId",
    "Item.supplierId",
    "Item.itemTypeId",
    // 021 AC-1: first-run setup's claim can never outlive its administrator.
    "SetupClaim.userId",
  ];

  const CASCADING = ["StockCountLine.stockCountId", "ItemPrice.itemId", "ItemLocation.itemId"];

  it("AC-19, amended by 021 AC-1: the nine Restrict foreign keys report delete_rule RESTRICT", async () => {
    const keys = await foreignKeys();

    for (const key of RESTRICTED) {
      expect(keys.get(key)?.delete_rule, key).toBe("RESTRICT");
    }
  });

  it("AC-19: the three Cascade foreign keys report delete_rule CASCADE", async () => {
    const keys = await foreignKeys();

    for (const key of CASCADING) {
      expect(keys.get(key)?.delete_rule, key).toBe("CASCADE");
    }
  });

  it("AC-19, amended by 021 AC-1: those twelve are all of them, and none is SET NULL or NO ACTION", async () => {
    const keys = await foreignKeys();

    expect([...keys.keys()].sort()).toEqual([...RESTRICTED, ...CASCADING].sort());

    for (const [key, row] of keys) {
      expect(["RESTRICT", "CASCADE"], `${key} is ${row.delete_rule}`).toContain(row.delete_rule);
    }
  });
});

describe("history cannot be deleted, and archival does not touch it", () => {
  it("AC-20a: archiving an item leaves every line that mentions it exactly as it was", async () => {
    const fixture = await seedEverything();
    const before = await db.stockCountLine.findUniqueOrThrow({
      where: { id: fixture.stockCountLineId },
    });

    await db.item.update({ where: { id: fixture.itemId }, data: { active: false } });

    const after = await db.stockCountLine.findUniqueOrThrow({
      where: { id: fixture.stockCountLineId },
      include: { stockCount: true },
    });

    expect(after.id).toBe(before.id);
    expect(after.quantity?.toString()).toBe("21.6128");
    expect(after.unitPriceSnapshot?.toString()).toBe("6.11764706");
    expect(after.stockCount.id).toBe(fixture.stockCountId);
  });

  it("AC-20b: deleting an item a count line mentions is refused, and both survive", async () => {
    const fixture = await seedEverything();

    const error = await rejection(
      () => db.item.delete({ where: { id: fixture.itemId } }),
      "StockCountLine_itemId_fkey",
    );

    expectRestrictViolation(error, "StockCountLine_itemId_fkey");
    expect(await db.item.count({ where: { id: fixture.itemId } })).toBe(1);
    expect(await db.stockCountLine.count({ where: { id: fixture.stockCountLineId } })).toBe(1);
  });

  it("AC-20c: deleting the user who created a count is refused - deactivation, not deletion", async () => {
    const fixture = await seedEverything();

    const error = await rejection(
      () => db.user.delete({ where: { id: fixture.userId } }),
      "StockCount_createdById_fkey",
    );

    expectRestrictViolation(error, "StockCount_createdById_fkey");
    expect(await db.user.count({ where: { id: fixture.userId } })).toBe(1);

    // The way a person is removed (#3's `active`, #21's `status`), and the signature keeps
    // its owner.
    const deactivated = await db.user.update({
      where: { id: fixture.userId },
      data: { status: "DEACTIVATED" },
    });
    expect(deactivated.status).toBe("DEACTIVATED");
    expect(await db.stockCount.count({ where: { createdById: fixture.userId } })).toBe(1);
  });

  it("AC-20d: deleting a count deletes its lines and nothing else", async () => {
    const fixture = await seedEverything();

    await db.stockCount.delete({ where: { id: fixture.stockCountId } });

    expect(await db.stockCountLine.count({ where: { id: fixture.stockCountLineId } })).toBe(0);
    expect(await db.item.count({ where: { id: fixture.itemId } })).toBe(1);
    expect(await db.itemPrice.count({ where: { id: fixture.itemPriceId } })).toBe(1);
    expect(await db.itemLocation.count({ where: { id: fixture.itemLocationId } })).toBe(1);
    expect(await db.user.count({ where: { id: fixture.userId } })).toBe(1);
    expect(await db.location.count({ where: { id: "loc_dublin" } })).toBe(1);
  });

  it("AC-20e: an item with prices and links but no lines deletes, and takes them with it", async () => {
    const fixture = await seedEverything();
    await db.stockCountLine.delete({ where: { id: fixture.stockCountLineId } });

    await db.item.delete({ where: { id: fixture.itemId } });

    expect(await db.item.count({ where: { id: fixture.itemId } })).toBe(0);
    expect(await db.itemPrice.count({ where: { id: fixture.itemPriceId } })).toBe(0);
    expect(await db.itemLocation.count({ where: { id: fixture.itemLocationId } })).toBe(0);

    // Cascade goes down, never sideways: the supplier, the type and the yard remain.
    expect(await db.supplier.count({ where: { id: fixture.supplierId } })).toBe(1);
    expect(await db.itemType.count({ where: { id: fixture.itemTypeId } })).toBe(1);
    expect(await db.location.count({ where: { id: "loc_dublin" } })).toBe(1);
  });
});

describe("every foreign-key column is indexed", () => {
  const FOREIGN_KEY_COLUMNS = [
    ["Item", "supplierId"],
    ["Item", "itemTypeId"],
    ["ItemPrice", "itemId"],
    ["ItemLocation", "itemId"],
    ["ItemLocation", "locationId"],
    ["StockCount", "locationId"],
    ["StockCount", "createdById"],
    ["StockCount", "approvedById"],
    ["StockCount", "signedById"],
    ["StockCountLine", "stockCountId"],
    ["StockCountLine", "itemId"],
  ];

  it("AC-29: each one leads at least one index - Postgres does not index them for us", async () => {
    const indexes = await db.$queryRaw<IndexRow[]>`
      SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`;

    const unindexed: string[] = [];
    for (const [table, column] of FOREIGN_KEY_COLUMNS) {
      const covering = indexes.filter(
        (index) => index.tablename === table && leadingColumn(index.indexdef) === column,
      );
      if (covering.length === 0) unindexed.push(`${table}.${column}`);
    }

    expect(unindexed).toEqual([]);
  });

  it("AC-29: the parser used above actually reads a leading column", async () => {
    // Guard against the assertion passing because leadingColumn() returns undefined for
    // everything and the filter is comparing undefined to undefined.
    const indexes = await db.$queryRaw<IndexRow[]>`
      SELECT tablename, indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'ItemLocation_locationId_sortOrder_idx'`;

    expect(indexes).toHaveLength(1);
    expect(leadingColumn(indexes[0].indexdef)).toBe("locationId");
  });
});

describe("resetTestDb", () => {
  it("AC-28: it empties all eight owned tables in foreign-key-safe order", async () => {
    await seedEverything();

    // Every table non-empty before the reset, or the assertions below prove nothing.
    expect(await db.stockCountLine.count()).toBe(1);
    expect(await db.itemPrice.count()).toBe(1);
    expect(await db.itemLocation.count()).toBe(1);

    await resetTestDb();

    expect(await db.stockCountLine.count()).toBe(0);
    expect(await db.stockCount.count()).toBe(0);
    expect(await db.itemPrice.count()).toBe(0);
    expect(await db.itemLocation.count()).toBe(0);
    expect(await db.item.count()).toBe(0);
    expect(await db.supplier.count()).toBe(0);
    expect(await db.itemType.count()).toBe(0);
    expect(await db.user.count()).toBe(0);
  });

  it("AC-28: it restores Location to exactly the two migration rows", async () => {
    await db.location.create({
      data: { id: `loc_invented_${suffix()}`, code: `WEXFORD_${suffix()}`, name: "Wexford" },
    });
    await db.location.update({
      where: { id: "loc_dublin" },
      data: { name: "Renamed By A Test", active: false, sortOrder: 99 },
    });

    await resetTestDb();

    const rows = await db.location.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((row) => ({ ...row }))).toEqual(SEEDED_LOCATIONS.map((row) => ({ ...row })));
  });

  it("AC-28: calling it twice in succession succeeds", async () => {
    await seedEverything();

    await resetTestDb();
    await resetTestDb();

    expect(await db.user.count()).toBe(0);
    expect(await db.location.count()).toBe(2);
  });
});
