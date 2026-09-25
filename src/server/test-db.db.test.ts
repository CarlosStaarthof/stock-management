import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { resetTestDb, SEEDED_LOCATIONS, TRUNCATED_TABLES } from "@/server/test-db";

/**
 * Spec 020 against a real Postgres: what actually reaches the database, and what the tables
 * hold afterwards.
 *
 * The claim this feature makes is a count, not a stopwatch — two statements per reset
 * instead of eleven — so it is asserted by counting the statements Prisma reports sending,
 * through the `query` log events. Timing would measure the link, which varies by the minute.
 *
 * `@prisma/client` is imported here, which no other file but `src/server/db.ts` does. AC-3
 * requires a client constructed with query logging, installed through the `globalThis` hook
 * `src/server/db.ts` already provides, so that no logging and no instrumentation ships. The
 * ESLint fence covers `src/app`, `src/components` and `src/lib`, none of which this is.
 */

type DbGlobal = { macroadsPrismaClient?: PrismaClient };

type TableRow = { table_name: string };

type ForeignKeyRow = { referencing: string; referenced: string };

const ALL_TABLES = [...TRUNCATED_TABLES, "Location"];

function suffix(): string {
  return randomBytes(6).toString("hex");
}

/** Every double-quoted identifier in a statement, in the order it appears. */
function quotedIdentifiers(statement: string): string[] {
  return [...statement.matchAll(/"([^"]+)"/g)].map((match) => match[1] ?? "");
}

/** The identifiers that name a table of this schema, de-duplicated. */
function tablesNamedIn(statement: string): string[] {
  return [...new Set(quotedIdentifiers(statement).filter((name) => ALL_TABLES.includes(name)))];
}

/** One row in every one of the nine tables. */
async function seedEverything(): Promise<void> {
  const unique = suffix();

  const user = await db.user.create({
    data: {
      name: "Reset Fixture",
      status: "ACTIVE",
    },
  });
  const itemType = await db.itemType.create({
    data: { code: `TYPE_${unique}`, name: "Road studs", sortOrder: 2 },
  });
  const supplier = await db.supplier.create({ data: { name: `Kestrel ${unique}` } });
  const item = await db.item.create({
    data: {
      description: `Road Studs 301 Type ${unique}`,
      itemTypeId: itemType.id,
      supplierId: supplier.id,
    },
  });
  await db.itemPrice.create({
    data: {
      itemId: item.id,
      unitPrice: "6.11764706",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    },
  });
  await db.itemLocation.create({
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
  await db.stockCountLine.create({
    data: {
      stockCountId: stockCount.id,
      itemId: item.id,
      quantity: "21.6128",
      unitPriceSnapshot: "6.11764706",
    },
  });
}

/** The row counts of the eight truncated tables, by table name. */
async function ownedRowCounts(): Promise<Record<string, number>> {
  const [stockCountLine, stockCount, itemPrice, itemLocation, item, supplier, itemType, user] =
    await Promise.all([
      db.stockCountLine.count(),
      db.stockCount.count(),
      db.itemPrice.count(),
      db.itemLocation.count(),
      db.item.count(),
      db.supplier.count(),
      db.itemType.count(),
      db.user.count(),
    ]);

  return {
    StockCountLine: stockCountLine,
    StockCount: stockCount,
    ItemPrice: itemPrice,
    ItemLocation: itemLocation,
    Item: item,
    Supplier: supplier,
    ItemType: itemType,
    User: user,
  };
}

/**
 * Runs `prepare`, discards the statements it cost, then records every statement `action`
 * sends — from Prisma's `query` log events, so Prisma methods that send nothing are not
 * counted and a method that sends two statements is.
 *
 * The client is installed on the hook `src/server/db.ts` reads, and the previous one is put
 * back and this one disconnected afterwards, so no later file in the suite inherits it.
 */
async function statementsSentBy(
  prepare: () => Promise<void>,
  action: () => Promise<void>,
): Promise<string[]> {
  const client = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
  const statements: string[] = [];
  client.$on("query", (event) => {
    statements.push(event.query);
  });

  const dbGlobal = globalThis as unknown as DbGlobal;
  const previous = dbGlobal.macroadsPrismaClient;
  dbGlobal.macroadsPrismaClient = client;

  try {
    await client.$connect();
    await prepare();
    // Log events cross from the engine on their own schedule; a tick here means the
    // clearing below cannot swallow one of `action`'s statements instead of `prepare`'s.
    await new Promise((resolve) => setTimeout(resolve, 100));
    statements.length = 0;

    await action();
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    dbGlobal.macroadsPrismaClient = previous;
    await client.$disconnect();
  }

  return statements;
}

beforeEach(async () => {
  await resetTestDb();
});

describe("two statements per reset, counted rather than timed", () => {
  it("AC-3: a reset against a fully populated database sends exactly two statements", async () => {
    const statements = await statementsSentBy(seedEverything, resetTestDb);

    expect(statements, statements.join("\n---\n")).toHaveLength(2);
  });

  it("AC-3: a reset against an already-empty database sends exactly two as well", async () => {
    const statements = await statementsSentBy(async () => {}, resetTestDb);

    expect(statements, statements.join("\n---\n")).toHaveLength(2);
  });

  it("AC-3: neither statement is BEGIN, COMMIT or ROLLBACK", async () => {
    const statements = await statementsSentBy(seedEverything, resetTestDb);

    for (const statement of statements) {
      expect(statement.trim()).not.toMatch(/^(BEGIN|COMMIT|ROLLBACK)\b/i);
    }
  });

  it("AC-2: the first statement is the TRUNCATE of exactly the eight tables", async () => {
    const [truncate = ""] = await statementsSentBy(seedEverything, resetTestDb);

    expect(truncate.trim()).toMatch(/^TRUNCATE TABLE /);
    expect([...new Set(quotedIdentifiers(truncate))].sort()).toEqual([...TRUNCATED_TABLES].sort());
    expect(truncate).not.toContain('"Location"');
    expect(truncate).not.toMatch(/CASCADE/i);
    expect(truncate).not.toMatch(/RESTART IDENTITY/i);
  });

  it("AC-3: the second statement's only table is Location", async () => {
    const [, restore = ""] = await statementsSentBy(seedEverything, resetTestDb);

    expect(tablesNamedIn(restore)).toEqual(["Location"]);
  });
});

describe("the truncate list is the schema's, not a list somebody remembered", () => {
  it("AC-4: TRUNCATED_TABLES plus Location is exactly what information_schema holds", async () => {
    const rows = await db.$queryRaw<TableRow[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;

    // A table added by a later feature and not added to TRUNCATED_TABLES turns this red,
    // rather than quietly keeping its rows between tests (020 AC-4).
    expect(rows.map((row) => row.table_name).sort()).toEqual([...ALL_TABLES].sort());
  });
});

describe("Location cannot be reached, so CASCADE is not needed", () => {
  it("AC-5: Location has no foreign key of its own", async () => {
    const rows = await db.$queryRaw<{ constraint_name: string }[]>`
      SELECT constraint_name
      FROM information_schema.table_constraints
      WHERE constraint_schema = 'public'
        AND table_name = 'Location'
        AND constraint_type = 'FOREIGN KEY'`;

    expect(rows).toEqual([]);
  });

  it("AC-5: every foreign key into the eight comes from within the eight", async () => {
    const rows = await db.$queryRaw<ForeignKeyRow[]>`
      SELECT DISTINCT kcu.table_name AS referencing, ccu.table_name AS referenced
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = rc.constraint_name
       AND kcu.constraint_schema = rc.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = rc.unique_constraint_name
       AND ccu.constraint_schema = rc.unique_constraint_schema
      WHERE rc.constraint_schema = 'public'`;

    // Not a vacuous pass: there are eleven foreign keys in this schema (004 AC-19).
    expect(rows.length).toBeGreaterThan(0);

    const reaching = rows.filter((row) => TRUNCATED_TABLES.includes(row.referenced));
    const fromOutside = reaching.filter((row) => !TRUNCATED_TABLES.includes(row.referencing));

    // The set is closed, so Postgres accepts the TRUNCATE without CASCADE. A later table
    // that referenced one of the eight and was missing from the list would fail here AND
    // in every reset - loudly, rather than being emptied silently.
    expect(fromOutside, JSON.stringify(fromOutside)).toEqual([]);
  });
});

describe("RESTART IDENTITY would reset nothing", () => {
  it("AC-6: the schema owns no sequence at all", async () => {
    const rows = await db.$queryRaw<{ sequences: number }[]>`
      SELECT count(*)::int AS sequences
      FROM pg_class
      WHERE relkind = 'S' AND relnamespace = 'public'::regnamespace`;

    // Every id is an application-supplied cuid; the other half of AC-6, read from
    // prisma/schema.prisma, is in src/server/test-db.test.ts.
    expect(rows[0]?.sequences).toBe(0);
  });
});

describe("what the reset leaves behind", () => {
  it("AC-7: one reset empties all eight tables and raises nothing", async () => {
    await seedEverything();

    const before = await ownedRowCounts();
    for (const [table, count] of Object.entries(before)) {
      expect(count, `${table} before the reset`).toBeGreaterThan(0);
    }

    await resetTestDb();

    const after = await ownedRowCounts();
    for (const [table, count] of Object.entries(after)) {
      expect(count, `${table} after the reset`).toBe(0);
    }
  });

  it("AC-8: Location is restored from every direction a test can damage it", async () => {
    await db.location.update({
      where: { id: "loc_dublin" },
      data: { name: "Renamed By A Test", active: false, sortOrder: 99 },
    });
    await db.location.create({
      data: { id: `loc_invented_${suffix()}`, code: `WEXFORD_${suffix()}`, name: "Wexford" },
    });
    await db.location.delete({ where: { id: "loc_clonmel" } });

    await resetTestDb();

    const rows = await db.location.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((row) => ({ ...row }))).toEqual(SEEDED_LOCATIONS.map((row) => ({ ...row })));
  });

  it("AC-8: the restore happens inside the one statement AC-3 counts", async () => {
    const statements = await statementsSentBy(async () => {
      await db.location.update({
        where: { id: "loc_dublin" },
        data: { name: "Renamed By A Test", active: false, sortOrder: 99 },
      });
      await db.location.delete({ where: { id: "loc_clonmel" } });
    }, resetTestDb);

    expect(statements).toHaveLength(2);

    const rows = await db.location.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((row) => ({ ...row }))).toEqual(SEEDED_LOCATIONS.map((row) => ({ ...row })));
  });

  it("AC-9: two resets in immediate succession leave the same state", async () => {
    await seedEverything();

    await resetTestDb();
    await resetTestDb();

    expect(Object.values(await ownedRowCounts())).toEqual(Array(8).fill(0));

    const rows = await db.location.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((row) => ({ ...row }))).toEqual(SEEDED_LOCATIONS.map((row) => ({ ...row })));
  });
});
