import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { resetTestDb } from "@/server/test-db";

/**
 * Spec 004, the column half: what the DATABASE holds, not what prisma/schema.prisma says.
 *
 * The difference is the whole point of this file. A test that finds the string
 * `Decimal(18, 8)` in the schema proves that somebody typed it; only
 * `information_schema.columns` proves that the column which actually exists is
 * `numeric(18,8)`. Every assertion below therefore goes to Postgres.
 *
 * Level 2 of docs/verification.md: a real test Postgres, never a mock.
 */

type ColumnRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  numeric_precision: number | null;
  numeric_scale: number | null;
};

async function columnsOf(table: string): Promise<Map<string, ColumnRow>> {
  const rows = await db.$queryRaw<ColumnRow[]>`
    SELECT table_name, column_name, data_type, is_nullable,
           numeric_precision::int AS numeric_precision,
           numeric_scale::int     AS numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
    ORDER BY ordinal_position`;

  return new Map(rows.map((row) => [row.column_name, row]));
}

async function allPublicColumns(): Promise<ColumnRow[]> {
  return db.$queryRaw<ColumnRow[]>`
    SELECT table_name, column_name, data_type, is_nullable,
           numeric_precision::int AS numeric_precision,
           numeric_scale::int     AS numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position`;
}

const MIGRATIONS_DIR = "prisma/migrations";

function stockDomainMigrationSql(): string {
  const directory = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .find((name) => name.endsWith("_create_stock_domain"));

  if (directory === undefined) throw new Error("create_stock_domain migration not found");
  return readFileSync(`${MIGRATIONS_DIR}/${directory}/migration.sql`, "utf8");
}

/** A count needs a yard, a person and an item; an item needs a type. This builds all of it. */
async function seedOneCountWithAnItem(): Promise<{ stockCountId: string; itemId: string }> {
  const suffix = randomBytes(6).toString("hex");

  const user = await db.user.create({
    data: {
      name: "Columns Fixture",
      status: "ACTIVE",
    },
  });

  const itemType = await db.itemType.create({
    data: { code: `TYPE_${suffix}`, name: "Extrusion", sortOrder: 1 },
  });

  const item = await db.item.create({
    data: { description: `White Extrusion 80/20 ${suffix}`, itemTypeId: itemType.id },
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

  return { stockCountId: stockCount.id, itemId: item.id };
}

beforeEach(async () => {
  await resetTestDb();
});

describe("the database the migrations produce", () => {
  // Re-spelled by 021 AC-2 as #4's own claim, as 004 AC-23's directory census was: the first
  // two migrations are #3's and #4's, in that order, and every migration applied is finished
  // and not rolled back, whatever later features add. It carries no row count, so it is
  // never re-amended when a feature adds a migration; 021 pins its own third row itself.
  it("AC-24, amended by 021 AC-2: the first two migrations are create_user then create_stock_domain, and every migration is finished and none rolled back", async () => {
    const rows = await db.$queryRaw<
      { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
    >`SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      ORDER BY started_at`;

    expect(rows[0]?.migration_name).toMatch(/^\d{14}_create_user$/);
    expect(rows[1]?.migration_name).toMatch(/^\d{14}_create_stock_domain$/);

    for (const row of rows) {
      expect(row.finished_at, `${row.migration_name} finished`).not.toBeNull();
      expect(row.rolled_back_at, `${row.migration_name} not rolled back`).toBeNull();
    }
  });

  it("AC-1, amended by 021 AC-1: the public schema holds exactly the twelve tables of Part 3", async () => {
    const rows = await db.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;

    expect(rows.map((row) => row.table_name)).toEqual([
      "AccountLock",
      "AuthEvent",
      "Item",
      "ItemLocation",
      "ItemPrice",
      "ItemType",
      "Location",
      "SetupClaim",
      "StockCount",
      "StockCountLine",
      "Supplier",
      "User",
    ]);
  });

  it("AC-3: enum_range returns Part 3's labels, in Part 3's order", async () => {
    const [unitKind] = await db.$queryRaw<{ labels: string }[]>`
      SELECT enum_range(NULL::"UnitKind")::text AS labels`;
    const [countStatus] = await db.$queryRaw<{ labels: string }[]>`
      SELECT enum_range(NULL::"CountStatus")::text AS labels`;
    const [role] = await db.$queryRaw<{ labels: string }[]>`
      SELECT enum_range(NULL::"Role")::text AS labels`;

    expect(unitKind.labels).toBe("{TONNE,KILOGRAM,LITRE,UNIT,LINEAR_METRE}");
    expect(countStatus.labels).toBe("{DRAFT,SUBMITTED,APPROVED}");
    expect(role.labels).toBe("{YARD_STAFF,ADMIN}");
  });

  it("AC-5, amended by 021 AC-1: User has #21's eleven columns, with Part 3's types and nullabilities", async () => {
    const columns = await columnsOf("User");

    // Postgres order: #3's surviving columns, then the ones pin_profiles added.
    expect([...columns.keys()]).toEqual([
      "id",
      "name",
      "role",
      "createdAt",
      "updatedAt",
      "status",
      "username",
      "requestedUsername",
      "pinHash",
      "pinKeyId",
      "sessionEpoch",
    ]);

    const shape = [...columns.values()].map(
      (row) => `${row.column_name} ${row.data_type} ${row.is_nullable}`,
    );

    // #4's three relation fields added no column (004 AC-5); #21's migration replaced
    // email, passwordHash and active with the credential columns, each nullable because a
    // request, a leaver and a profile migrated from #3 hold none (021 *Data touched*).
    expect(shape).toEqual([
      "id text NO",
      "name text NO",
      "role USER-DEFINED NO",
      "createdAt timestamp without time zone NO",
      "updatedAt timestamp without time zone NO",
      "status USER-DEFINED NO",
      "username text YES",
      "requestedUsername text YES",
      "pinHash text YES",
      "pinKeyId text YES",
      "sessionEpoch integer NO",
    ]);
  });

  it("AC-21: Location holds exactly the two migration-seeded yards", async () => {
    const rows = await db.location.findMany({ orderBy: { sortOrder: "asc" } });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: "loc_dublin",
      code: "DUBLIN",
      name: "Dublin",
      active: true,
      sortOrder: 1,
    });
    expect(rows[1]).toMatchObject({
      id: "loc_clonmel",
      code: "CLONMEL",
      name: "Clonmel",
      active: true,
      sortOrder: 2,
    });
  });

  it("AC-21: re-running the migration's insert adds no row and raises no error", async () => {
    const insert = stockDomainMigrationSql().slice(
      stockDomainMigrationSql().indexOf('INSERT INTO "Location"'),
    );

    // The statement out of the committed migration, executed verbatim a second time.
    await db.$executeRawUnsafe(insert);
    await db.$executeRawUnsafe(insert);

    const rows = await db.location.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(["loc_dublin", "loc_clonmel"]);
  });
});

describe("money is Decimal(18,8) in the database", () => {
  it("AC-6: ItemPrice.unitPrice is numeric(18,8) and NOT NULL", async () => {
    const column = (await columnsOf("ItemPrice")).get("unitPrice");

    expect(column?.data_type).toBe("numeric");
    expect(column?.numeric_precision).toBe(18);
    expect(column?.numeric_scale).toBe(8);
    expect(column?.is_nullable).toBe("NO");
  });

  it("AC-6: StockCountLine.unitPriceSnapshot is numeric(18,8) and nullable while DRAFT", async () => {
    const column = (await columnsOf("StockCountLine")).get("unitPriceSnapshot");

    expect(column?.data_type).toBe("numeric");
    expect(column?.numeric_precision).toBe(18);
    expect(column?.numeric_scale).toBe(8);
    expect(column?.is_nullable).toBe("YES");
  });

  it("AC-6: those two are the only monetary columns in the schema", async () => {
    const monetary = (await allPublicColumns())
      .filter((row) => /price/i.test(row.column_name))
      .map((row) => `${row.table_name}.${row.column_name}`);

    expect(monetary.sort()).toEqual(["ItemPrice.unitPrice", "StockCountLine.unitPriceSnapshot"]);
  });
});

describe("quantity is Decimal(12,4) in the database", () => {
  it("AC-7: StockCountLine.quantity and Item.unitQuantityKg are numeric(12,4)", async () => {
    const quantity = (await columnsOf("StockCountLine")).get("quantity");
    const unitQuantityKg = (await columnsOf("Item")).get("unitQuantityKg");

    expect(quantity?.data_type).toBe("numeric");
    expect(quantity?.numeric_precision).toBe(12);
    expect(quantity?.numeric_scale).toBe(4);

    expect(unitQuantityKg?.data_type).toBe("numeric");
    expect(unitQuantityKg?.numeric_precision).toBe(12);
    expect(unitQuantityKg?.numeric_scale).toBe(4);
  });
});

describe("Float appears nowhere", () => {
  it("AC-8: no column in the public schema is double precision or real", async () => {
    const offenders = (await allPublicColumns())
      .filter((row) => ["double precision", "real"].includes(row.data_type))
      .map((row) => `${row.table_name}.${row.column_name} ${row.data_type}`);

    expect(offenders).toEqual([]);
  });
});

describe("precision survives a round trip through Postgres", () => {
  it("AC-9: 21.6128 tonnes and the =5.2/0.85 price come back exactly as written", async () => {
    const { stockCountId, itemId } = await seedOneCountWithAnItem();

    const written = await db.stockCountLine.create({
      data: {
        stockCountId,
        itemId,
        // Dublin!  21.6128 tonnes, and the 8-place value of the workbook formula
        // =5.2/0.85 (specs/domain-model.md Invariant 10).
        quantity: "21.6128",
        unitPriceSnapshot: "6.11764706",
      },
    });

    const read = await db.stockCountLine.findUniqueOrThrow({ where: { id: written.id } });

    expect(read.quantity?.toString()).toBe("21.6128");
    expect(read.unitPriceSnapshot?.toString()).toBe("6.11764706");
  });

  it("AC-9: 0.475 reads back as 0.475, not 0.48 and not 0", async () => {
    const { stockCountId, itemId } = await seedOneCountWithAnItem();

    const written = await db.stockCountLine.create({
      data: { stockCountId, itemId, quantity: "0.475" },
    });

    const read = await db.stockCountLine.findUniqueOrThrow({ where: { id: written.id } });

    expect(read.quantity?.toString()).toBe("0.475");
    expect(read.quantity?.equals("0.475")).toBe(true);
    expect(read.quantity?.toString()).not.toBe("0.48");
    expect(read.quantity?.toString()).not.toBe("0");
  });
});

describe("null and zero are different facts", () => {
  it("AC-10: quantity is nullable in information_schema", async () => {
    const column = (await columnsOf("StockCountLine")).get("quantity");

    expect(column?.is_nullable).toBe("YES");
  });

  it("AC-10: a null quantity and a zero quantity are stored and queried apart", async () => {
    const { stockCountId, itemId: notCountedItemId } = await seedOneCountWithAnItem();
    const suffix = randomBytes(6).toString("hex");
    const itemType = await db.itemType.findFirstOrThrow();
    const noneHeldItem = await db.item.create({
      data: { description: `Road Studs 301 Type ${suffix}`, itemTypeId: itemType.id },
    });

    const notCounted = await db.stockCountLine.create({
      data: { stockCountId, itemId: notCountedItemId, quantity: null },
    });
    const noneHeld = await db.stockCountLine.create({
      data: { stockCountId, itemId: noneHeldItem.id, quantity: "0" },
    });

    const readNotCounted = await db.stockCountLine.findUniqueOrThrow({
      where: { id: notCounted.id },
    });
    const readNoneHeld = await db.stockCountLine.findUniqueOrThrow({ where: { id: noneHeld.id } });

    expect(readNotCounted.quantity).toBeNull();
    expect(readNoneHeld.quantity).not.toBeNull();
    expect(readNoneHeld.quantity?.equals("0")).toBe(true);

    const nobodyLooked = await db.stockCountLine.findMany({ where: { quantity: null } });
    const countedAsNone = await db.stockCountLine.findMany({
      where: { quantity: "0" },
    });

    expect(nobodyLooked.map((line) => line.id)).toEqual([notCounted.id]);
    expect(countedAsNone.map((line) => line.id)).toEqual([noneHeld.id]);
  });
});

describe("value is never a column", () => {
  it("AC-11: no column in the public schema is named like a stored value or total", async () => {
    const offenders = (await allPublicColumns())
      .filter((row) => /value|total|amount/i.test(row.column_name))
      .map((row) => `${row.table_name}.${row.column_name}`);

    expect(offenders).toEqual([]);
  });

  it("AC-11: unitPrice and unitPriceSnapshot survive that regex and still exist", async () => {
    // The regex must not be passing simply because the money columns were renamed away.
    expect(/value|total|amount/i.test("unitPrice")).toBe(false);
    expect(/value|total|amount/i.test("unitPriceSnapshot")).toBe(false);

    expect((await columnsOf("ItemPrice")).has("unitPrice")).toBe(true);
    expect((await columnsOf("StockCountLine")).has("unitPriceSnapshot")).toBe(true);
  });
});

describe("dates are dates", () => {
  it("AC-22: countDate and effectiveFrom are date, not timestamp", async () => {
    const countDate = (await columnsOf("StockCount")).get("countDate");
    const effectiveFrom = (await columnsOf("ItemPrice")).get("effectiveFrom");

    expect(countDate?.data_type).toBe("date");
    expect(effectiveFrom?.data_type).toBe("date");
  });

  it("AC-22: the day the yard was walked does not shift by a timezone", async () => {
    const { stockCountId } = await seedOneCountWithAnItem();

    const read = await db.stockCount.findUniqueOrThrow({ where: { id: stockCountId } });

    expect(read.countDate.toISOString().slice(0, 10)).toBe("2026-09-30");
  });
});
