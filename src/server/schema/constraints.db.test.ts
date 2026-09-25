import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { resetTestDb } from "@/server/test-db";

/**
 * Spec 004, the constraint half: the five unique keys and the two hand-written CHECKs,
 * each stated as the domain rule it enforces.
 *
 * The point of every test here is that POSTGRES refuses, not a form and not a service.
 * Two people can open a screen at the same moment; only the database can decide which of
 * them gets the September count for Dublin.
 *
 * Level 2 of docs/verification.md: a real test Postgres, never a mock.
 */

type KnownRequestError = { code: string; meta?: Record<string, unknown>; message: string };

/** Narrows a thrown value to a Prisma known-request error, or fails loudly. */
function asPrismaError(error: unknown): KnownRequestError {
  const candidate = error as Partial<KnownRequestError>;
  if (typeof candidate.code !== "string" || typeof candidate.message !== "string") {
    throw new Error(`expected a Prisma known-request error, got: ${String(error)}`);
  }
  return candidate as KnownRequestError;
}

/**
 * The name of the Postgres unique index a P2002 refers to.
 *
 * Prisma 6 does not put the constraint name in the error: `meta` carries the model and
 * the offending FIELDS - `{"modelName":"StockCount","target":["locationId","periodYear",
 * "periodMonth"]}` - and the message repeats them. Postgres' own DETAIL, which Prisma
 * relays for `$executeRaw`, gives the key values and not the name either.
 *
 * So the index name is composed from what Prisma does report, exactly the way Prisma
 * composes it when it generates the migration, and `expectUniqueViolation` below then
 * requires an index of precisely that name to exist in the database. The pair is what
 * "P2002 naming the constraint" can actually mean here: a P2002 that identifies these
 * fields, on this model, and an index called this in Postgres.
 */
function uniqueIndexNameOf(error: KnownRequestError): string {
  const meta = error.meta as { modelName?: string; target?: string[] | string } | undefined;
  const target = Array.isArray(meta?.target) ? meta.target : [String(meta?.target ?? "")];
  return `${meta?.modelName ?? "?"}_${target.join("_")}_key`;
}

/** The `CREATE UNIQUE INDEX` definition Postgres holds under this name, if any. */
async function uniqueIndexDefinition(name: string): Promise<string | undefined> {
  const rows = await db.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${name}`;
  return rows[0]?.indexdef;
}

/** P2002, pointing at a unique index that really exists in Postgres under that name. */
async function expectUniqueViolation(error: unknown, constraintName: string): Promise<void> {
  const known = asPrismaError(error);

  expect(known.code).toBe("P2002");
  expect(uniqueIndexNameOf(known)).toBe(constraintName);

  const definition = await uniqueIndexDefinition(constraintName);
  expect(definition, `pg_indexes has no ${constraintName}`).toBeDefined();
  expect(definition).toMatch(/^CREATE UNIQUE INDEX/);
}

/**
 * Runs `action`, requires it to reject, and returns the rejection.
 *
 * `refusedBy` names the constraint that was supposed to do the refusing, so that when one
 * of these tests goes red the message says WHICH rule stopped being enforced - which is
 * the whole value of the gate (AC-25).
 */
async function rejection(action: () => Promise<unknown>, refusedBy: string): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error(
    `expected the database to refuse this write through ${refusedBy}, but it succeeded`,
  );
}

function suffix(): string {
  return randomBytes(6).toString("hex");
}

async function newUser(): Promise<string> {
  const user = await db.user.create({
    data: {
      name: "Constraints Fixture",
      status: "ACTIVE",
    },
  });
  return user.id;
}

async function newItemType(): Promise<string> {
  const unique = suffix();
  const itemType = await db.itemType.create({
    data: { code: `TYPE_${unique}`, name: "Extrusion", sortOrder: 1 },
  });
  return itemType.id;
}

async function newSupplier(name?: string): Promise<string> {
  const supplier = await db.supplier.create({ data: { name: name ?? `Kestrel ${suffix()}` } });
  return supplier.id;
}

async function newItem(itemTypeId: string, description?: string): Promise<string> {
  const item = await db.item.create({
    data: { description: description ?? `White Extrusion 80/20 ${suffix()}`, itemTypeId },
  });
  return item.id;
}

beforeEach(async () => {
  await resetTestDb();
});

describe("one count per yard per month, not per day", () => {
  it("AC-12: a second Dublin count for 2026-09 is refused even with a different day and status", async () => {
    const createdById = await newUser();

    await db.stockCount.create({
      data: {
        locationId: "loc_dublin",
        periodYear: 2026,
        periodMonth: 9,
        countDate: new Date("2026-09-30T00:00:00.000Z"),
        createdById,
      },
    });

    const error = await rejection(() =>
      db.stockCount.create({
        data: {
          locationId: "loc_dublin",
          periodYear: 2026,
          periodMonth: 9,
          // A different day and a different status: the key is the MONTH.
          countDate: new Date("2026-09-15T00:00:00.000Z"),
          status: "SUBMITTED",
          createdById,
        },
      }),
      "StockCount_locationId_periodYear_periodMonth_key",
    );

    await expectUniqueViolation(error, "StockCount_locationId_periodYear_periodMonth_key");

    const surviving = await db.stockCount.findMany({
      where: { locationId: "loc_dublin", periodYear: 2026, periodMonth: 9 },
    });
    expect(surviving).toHaveLength(1);
    expect(surviving[0].countDate.toISOString().slice(0, 10)).toBe("2026-09-30");
    expect(surviving[0].status).toBe("DRAFT");
  });

  it("AC-12: the next month at the same yard, and the same month at the other yard, both succeed", async () => {
    const createdById = await newUser();

    await db.stockCount.create({
      data: {
        locationId: "loc_dublin",
        periodYear: 2026,
        periodMonth: 9,
        countDate: new Date("2026-09-30T00:00:00.000Z"),
        createdById,
      },
    });

    const october = await db.stockCount.create({
      data: {
        locationId: "loc_dublin",
        periodYear: 2026,
        periodMonth: 10,
        countDate: new Date("2026-10-31T00:00:00.000Z"),
        createdById,
      },
    });
    const clonmel = await db.stockCount.create({
      data: {
        locationId: "loc_clonmel",
        periodYear: 2026,
        periodMonth: 9,
        countDate: new Date("2026-09-30T00:00:00.000Z"),
        createdById,
      },
    });

    expect(october.periodMonth).toBe(10);
    expect(clonmel.locationId).toBe("loc_clonmel");
    expect(await db.stockCount.count()).toBe(3);
  });
});

describe("an item is assigned to a yard at most once", () => {
  it("AC-13: a second link for the same item and yard is refused and creates no row", async () => {
    const itemId = await newItem(await newItemType());
    await db.itemLocation.create({ data: { itemId, locationId: "loc_dublin", sortOrder: 3 } });

    const error = await rejection(() =>
      db.itemLocation.create({ data: { itemId, locationId: "loc_dublin", sortOrder: 99 } }),
      "ItemLocation_itemId_locationId_key",
    );

    await expectUniqueViolation(error, "ItemLocation_itemId_locationId_key");
    expect(await db.itemLocation.count({ where: { itemId } })).toBe(1);
  });

  it("AC-13: the same item on the other yard succeeds, and the item then has two links", async () => {
    const itemId = await newItem(await newItemType());
    await db.itemLocation.create({ data: { itemId, locationId: "loc_dublin", sortOrder: 3 } });

    await db.itemLocation.create({ data: { itemId, locationId: "loc_clonmel", sortOrder: 7 } });

    const links = await db.itemLocation.findMany({ where: { itemId }, orderBy: { sortOrder: "asc" } });
    expect(links.map((link) => link.locationId)).toEqual(["loc_dublin", "loc_clonmel"]);
  });
});

describe("a price list is versioned, never overwritten", () => {
  it("AC-14: a second price for the same item and effective date is refused", async () => {
    const itemId = await newItem(await newItemType());
    await db.itemPrice.create({
      data: { itemId, unitPrice: "6.11764706", effectiveFrom: new Date("2026-01-01T00:00:00.000Z") },
    });

    const error = await rejection(() =>
      db.itemPrice.create({
        data: { itemId, unitPrice: "9.99", effectiveFrom: new Date("2026-01-01T00:00:00.000Z") },
      }),
      "ItemPrice_itemId_effectiveFrom_key",
    );

    await expectUniqueViolation(error, "ItemPrice_itemId_effectiveFrom_key");
  });

  it("AC-14: a later effective date succeeds and the earlier price is untouched", async () => {
    const itemId = await newItem(await newItemType());
    await db.itemPrice.create({
      data: { itemId, unitPrice: "6.11764706", effectiveFrom: new Date("2026-01-01T00:00:00.000Z") },
    });

    await rejection(
      () =>
        db.itemPrice.create({
          data: { itemId, unitPrice: "9.99", effectiveFrom: new Date("2026-01-01T00:00:00.000Z") },
        }),
      "ItemPrice_itemId_effectiveFrom_key",
    );
    await db.itemPrice.create({
      data: { itemId, unitPrice: "6.50000000", effectiveFrom: new Date("2026-07-01T00:00:00.000Z") },
    });

    const prices = await db.itemPrice.findMany({
      where: { itemId },
      orderBy: { effectiveFrom: "asc" },
    });

    expect(prices).toHaveLength(2);
    expect(prices[0].unitPrice.toString()).toBe("6.11764706");
    expect(prices[0].effectiveFrom.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(prices[1].unitPrice.toString()).toBe("6.5");
    expect(prices[1].effectiveFrom.toISOString().slice(0, 10)).toBe("2026-07-01");
  });
});

describe("an item is (description, supplierId)", () => {
  it("AC-15: the same description under the same supplier is refused", async () => {
    const itemTypeId = await newItemType();
    const supplierId = await newSupplier("Kestrel");
    const description = `Bicycle Logo's 1200mm ${suffix()}`;

    await db.item.create({ data: { description, itemTypeId, supplierId } });

    const error = await rejection(() =>
      db.item.create({ data: { description, itemTypeId, supplierId } }),
      "Item_description_supplierId_key",
    );

    await expectUniqueViolation(error, "Item_description_supplierId_key");
    expect(await db.item.count({ where: { description } })).toBe(1);
  });

  it("AC-15: the same description under a different supplier is a different item", async () => {
    const itemTypeId = await newItemType();
    const kestrel = await newSupplier("Kestrel");
    const kelly = await newSupplier("Kelly");
    const description = `Bicycle Logo's 1200mm ${suffix()}`;

    await db.item.create({ data: { description, itemTypeId, supplierId: kestrel } });
    await db.item.create({ data: { description, itemTypeId, supplierId: kelly } });

    const items = await db.item.findMany({ where: { description } });
    expect(items).toHaveLength(2);
    expect(items.map((item) => item.supplierId).sort()).toEqual([kestrel, kelly].sort());
  });

  it("AC-15: two supplier-less items with the same description both insert - NULLs are distinct", async () => {
    // Not a wish, a fact about Postgres, recorded rather than pretended away. Dublin!A45
    // is the workbook row with no supplier; de-duplicating there is #5's job, and this
    // test is what tells #5 the database will not do it for free.
    const itemTypeId = await newItemType();
    const description = `Supplier-less row ${suffix()}`;

    await db.item.create({ data: { description, itemTypeId } });
    await db.item.create({ data: { description, itemTypeId } });

    const items = await db.item.findMany({ where: { description } });
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.supplierId === null)).toBe(true);
  });
});

describe("one line per item per count", () => {
  it("AC-16: a second line for the same item on the same count is refused", async () => {
    const createdById = await newUser();
    const itemId = await newItem(await newItemType());
    const count = await db.stockCount.create({
      data: {
        locationId: "loc_dublin",
        periodYear: 2026,
        periodMonth: 9,
        countDate: new Date("2026-09-30T00:00:00.000Z"),
        createdById,
      },
    });

    await db.stockCountLine.create({ data: { stockCountId: count.id, itemId, quantity: "3" } });

    const error = await rejection(() =>
      db.stockCountLine.create({ data: { stockCountId: count.id, itemId, quantity: "4" } }),
      "StockCountLine_stockCountId_itemId_key",
    );

    await expectUniqueViolation(error, "StockCountLine_stockCountId_itemId_key");

    const lines = await db.stockCountLine.findMany({ where: { stockCountId: count.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity?.toString()).toBe("3");
  });

  it("AC-16: the same item on a different count succeeds", async () => {
    const createdById = await newUser();
    const itemId = await newItem(await newItemType());

    const september = await db.stockCount.create({
      data: {
        locationId: "loc_dublin",
        periodYear: 2026,
        periodMonth: 9,
        countDate: new Date("2026-09-30T00:00:00.000Z"),
        createdById,
      },
    });
    const october = await db.stockCount.create({
      data: {
        locationId: "loc_dublin",
        periodYear: 2026,
        periodMonth: 10,
        countDate: new Date("2026-10-31T00:00:00.000Z"),
        createdById,
      },
    });

    await db.stockCountLine.create({ data: { stockCountId: september.id, itemId, quantity: "3" } });
    await db.stockCountLine.create({ data: { stockCountId: october.id, itemId, quantity: "4" } });

    expect(await db.stockCountLine.count({ where: { itemId } })).toBe(2);
  });
});

describe("Item.description is required and non-empty at the database", () => {
  it("AC-17: an empty description is refused through prisma.item.create", async () => {
    const itemTypeId = await newItemType();
    const before = await db.item.count();

    const error = await rejection(
      () => db.item.create({ data: { description: "", itemTypeId } }),
      "Item_description_not_empty",
    );

    expect(String(error)).toContain("Item_description_not_empty");
    expect(await db.item.count()).toBe(before);
  });

  it("AC-17: a whitespace-only description is refused through prisma.item.create", async () => {
    const itemTypeId = await newItemType();
    const before = await db.item.count();

    const error = await rejection(
      () => db.item.create({ data: { description: "   ", itemTypeId } }),
      "Item_description_not_empty",
    );

    expect(String(error)).toContain("Item_description_not_empty");
    expect(await db.item.count()).toBe(before);
  });

  it("AC-17: both are refused through $executeRaw too - the rule is Postgres', not Prisma's", async () => {
    const itemTypeId = await newItemType();
    const before = await db.item.count();

    for (const description of ["", "   "]) {
      const error = await rejection(
        () =>
          db.$executeRaw`INSERT INTO "Item" ("id", "description", "itemTypeId")
                         VALUES (${`raw_${suffix()}`}, ${description}, ${itemTypeId})`,
        "Item_description_not_empty",
      );

      expect(String(error)).toContain("Item_description_not_empty");
    }

    expect(await db.item.count()).toBe(before);
  });

  it("AC-17: an untrimmed description inserts - the constraint forbids emptiness, not untidiness", async () => {
    const itemTypeId = await newItemType();

    const created = await db.item.create({
      data: { description: "  White Extrusion 80/20  ", itemTypeId },
    });

    // Trimming stays the importer's rule (specs/domain-model.md Part 2), not the column's.
    expect(created.description).toBe("  White Extrusion 80/20  ");
  });

  it("AC-17: a null description is refused as NOT NULL, before the CHECK is reached", async () => {
    const itemTypeId = await newItemType();
    const before = await db.item.count();

    const error = await rejection(
      () =>
        db.$executeRaw`INSERT INTO "Item" ("id", "description", "itemTypeId")
                       VALUES (${`raw_${suffix()}`}, NULL, ${itemTypeId})`,
      'the NOT NULL on "Item"."description"',
    );

    // Postgres' not_null_violation. It never reaches the CHECK: NOT NULL is checked
    // first, and Prisma relays the SQLSTATE rather than the constraint name.
    expect(String(error)).toContain("23502");
    expect(await db.item.count()).toBe(before);
  });
});

describe("StockCount.periodMonth is a month", () => {
  async function createWithMonth(periodMonth: number): Promise<unknown> {
    const createdById = await newUser();
    return db.stockCount.create({
      data: {
        locationId: "loc_dublin",
        periodYear: 2026,
        periodMonth,
        countDate: new Date("2026-09-30T00:00:00.000Z"),
        createdById,
      },
    });
  }

  it("AC-18: month 0 and month 13 are both refused, and create no row", async () => {
    for (const month of [0, 13]) {
      const error = await rejection(
        () => createWithMonth(month),
        "StockCount_periodMonth_range",
      );

      expect(String(error), `month ${month}`).toContain("StockCount_periodMonth_range");
    }

    expect(await db.stockCount.count()).toBe(0);
  });

  it("AC-18: month 1 and month 12 both succeed", async () => {
    const january = await createWithMonth(1);
    const december = await createWithMonth(12);

    expect(january).toBeDefined();
    expect(december).toBeDefined();

    const months = await db.stockCount.findMany({ orderBy: { periodMonth: "asc" } });
    expect(months.map((count) => count.periodMonth)).toEqual([1, 12]);
  });
});
