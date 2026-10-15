import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SessionUser } from "@/server/auth/session-user";
import { exportWorkbook } from "@/server/export/export-service";

/**
 * Spec 012 AC-16 (owner ruling R6) at Level 2, from a FRESH schema.
 *
 * The rename migration `20261013120000_rename_clonmel_to_cashel` is applied to the test
 * database like every other migration, so by the time a test runs, `Location` already reads
 * `Cashel`. To prove the migration itself is a lossless, in-place rename, this file builds a
 * schema that stops just before it:
 *
 *   1. create a throwaway PostgreSQL schema and apply every migration BEFORE the rename;
 *   2. seed the Clonmel world through a Prisma client scoped to that schema - including an
 *      APPROVED stock take with lines and a signer;
 *   3. apply the rename migration verbatim;
 *   4. assert no row was lost, the counts are unchanged, the location reads `Cashel`, its
 *      children followed the rename, and the stock take still loads and exports.
 *
 * It is data-only: the renaming statement is an `UPDATE`, never a `DROP`/`CREATE` of a table,
 * type or enum. `Location` is a text column, so no enum is involved; the assertions below
 * also pin that the file recreates nothing (`ALTER TYPE ... RENAME VALUE` is what an enum
 * would use, and there is none to rename).
 *
 * `@prisma/client` is imported here to build the schema-scoped client, the same exception
 * `src/server/test-db.db.test.ts` makes; the schema is dropped in `afterAll`, so nothing
 * outlives the file.
 */

const MIGRATIONS_DIR = "prisma/migrations";
const RENAME_DIR = "20261013120000_rename_clonmel_to_cashel";

/** The migration directories, oldest first. */
function migrationDirectories(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** A migration file's statements: full-line comments dropped, split on `;`, empties removed. */
function statementsOf(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** The same connection string, pointed at one schema. */
function withSchema(url: string, schema: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

type DbGlobal = { macroadsPrismaClient?: PrismaClient };

const BASE_URL = (process.env.DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? "").trim();
const SCHEMA = `mig_rename_${randomBytes(5).toString("hex")}`;

const ADMIN: SessionUser = {
  id: "user_admin_rename_fixture",
  username: "renameadmin",
  name: "Rename Fixture Admin",
  role: "ADMIN",
};

const SIGNER_ID = "user_rename_signer";
const CREATOR_ID = "user_rename_creator";
const SIGNER_NAME = "Aoife Signer";
const PERIOD = "2026-06";

const admin = new PrismaClient({ datasources: { db: { url: BASE_URL } } });
const scoped = new PrismaClient({ datasources: { db: { url: withSchema(BASE_URL, SCHEMA) } } });

/** The Clonmel world, to be seeded before the rename. */
async function seedClonmelWorld(): Promise<void> {
  await scoped.user.create({
    data: {
      id: SIGNER_ID,
      username: "aoifesigner",
      name: SIGNER_NAME,
      status: "ACTIVE",
      role: "YARD_STAFF",
    },
  });
  await scoped.user.create({
    data: {
      id: CREATOR_ID,
      username: "renamecreator",
      name: "Rename Fixture Creator",
      status: "ACTIVE",
      role: "ADMIN",
    },
  });

  const typeId = "type_rename";
  await scoped.itemType.create({ data: { id: typeId, code: "BEADS", name: "Beads", sortOrder: 1 } });

  const items = [
    { id: "item_rename_widget_a", description: "Widget A", quantity: "2", snapshot: "1.005", sort: 1 },
    { id: "item_rename_widget_b", description: "Widget B", quantity: "3", snapshot: "2", sort: 2 },
  ];

  for (const item of items) {
    await scoped.item.create({
      data: { id: item.id, description: item.description, itemTypeId: typeId },
    });
    await scoped.itemPrice.create({
      data: {
        itemId: item.id,
        unitPrice: item.snapshot,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      },
    });
    await scoped.itemLocation.create({
      data: { itemId: item.id, locationId: "loc_clonmel", sortOrder: item.sort, active: true },
    });
  }

  const day = new Date("2026-06-15T00:00:00.000Z");
  const count = await scoped.stockCount.create({
    data: {
      locationId: "loc_clonmel",
      periodYear: 2026,
      periodMonth: 6,
      countDate: day,
      status: "APPROVED",
      createdById: CREATOR_ID,
      submittedAt: day,
      signedById: SIGNER_ID,
      signedAt: day,
      signatureSvg: "M 1 1 L 20 12",
      approvedById: CREATOR_ID,
      approvedAt: day,
    },
    select: { id: true },
  });

  for (const item of items) {
    await scoped.stockCountLine.create({
      data: {
        stockCountId: count.id,
        itemId: item.id,
        quantity: item.quantity,
        unitPriceSnapshot: item.snapshot,
      },
    });
  }
}

beforeAll(async () => {
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);

  for (const directory of migrationDirectories().filter((name) => name < RENAME_DIR)) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${directory}/migration.sql`, "utf8");
    for (const statement of statementsOf(sql)) {
      await scoped.$executeRawUnsafe(statement);
    }
  }

  await seedClonmelWorld();
});

afterAll(async () => {
  await scoped.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await admin.$disconnect();
});

describe("012 AC-16 (R6): Clonmel becomes Cashel in place", () => {
  it("AC-16: the rename loses no row, changes no count, and the stock take still loads and exports", async () => {
    // --- the world before the rename ------------------------------------------------
    const beforeLocation = await scoped.location.findUnique({ where: { id: "loc_clonmel" } });
    expect(beforeLocation).toMatchObject({ code: "CLONMEL", name: "Clonmel" });

    const rowsBefore = {
      item: await scoped.item.count(),
      itemLocation: await scoped.itemLocation.count(),
      stockCount: await scoped.stockCount.count(),
      stockCountLine: await scoped.stockCountLine.count(),
      user: await scoped.user.count(),
    };
    const lineBefore = await scoped.stockCountLine.findMany({
      orderBy: { itemId: "asc" },
      select: { itemId: true, quantity: true, unitPriceSnapshot: true },
    });
    const asStrings = (
      line: { itemId: string; quantity: unknown; unitPriceSnapshot: unknown },
    ): string =>
      `${line.itemId}|${line.quantity === null ? "null" : String(line.quantity)}|${
        line.unitPriceSnapshot === null ? "null" : String(line.unitPriceSnapshot)
      }`;
    const linesBefore = lineBefore.map(asStrings);

    // --- apply the real migration ---------------------------------------------------
    const renameSql = readFileSync(`${MIGRATIONS_DIR}/${RENAME_DIR}/migration.sql`, "utf8");
    for (const statement of statementsOf(renameSql)) {
      await scoped.$executeRawUnsafe(statement);
    }

    // --- no row lost, no count changed ----------------------------------------------
    const rowsAfter = {
      item: await scoped.item.count(),
      itemLocation: await scoped.itemLocation.count(),
      stockCount: await scoped.stockCount.count(),
      stockCountLine: await scoped.stockCountLine.count(),
      user: await scoped.user.count(),
    };
    expect(rowsAfter).toEqual(rowsBefore);
    expect(await scoped.stockCountLine.count()).toBeGreaterThan(0);

    const linesAfter = (
      await scoped.stockCountLine.findMany({
        orderBy: { itemId: "asc" },
        select: { itemId: true, quantity: true, unitPriceSnapshot: true },
      })
    ).map(asStrings);
    expect(linesAfter).toEqual(linesBefore);

    // --- Clonmel now reads Cashel ---------------------------------------------------
    expect(await scoped.location.findFirst({ where: { code: "CLONMEL" } })).toBeNull();
    expect(await scoped.location.findUnique({ where: { id: "loc_clonmel" } })).toBeNull();
    const cashel = await scoped.location.findUnique({ where: { id: "loc_cashel" } });
    expect(cashel).toMatchObject({
      id: "loc_cashel",
      code: "CASHEL",
      name: "Cashel",
      active: true,
      sortOrder: 2,
    });

    // The child rows followed the id rename through `ON UPDATE CASCADE`.
    const count = await scoped.stockCount.findFirst({
      where: { periodYear: 2026, periodMonth: 6 },
      select: { locationId: true },
    });
    expect(count?.locationId).toBe("loc_cashel");
    const links = await scoped.itemLocation.findMany({ select: { locationId: true } });
    expect(new Set(links.map((link) => link.locationId))).toEqual(new Set(["loc_cashel"]));

    // --- the migration is in place, never a drop-and-recreate ------------------------
    expect(renameSql).toMatch(/UPDATE "Location"/);
    expect(renameSql).not.toMatch(/\b(DROP|CREATE)\s+(TABLE|TYPE|SCHEMA|INDEX)\b/i);
    expect(renameSql).not.toMatch(/\bALTER\s+TYPE\b/i);

    // --- the stock take still loads and exports -------------------------------------
    const previous = (globalThis as unknown as DbGlobal).macroadsPrismaClient;
    (globalThis as unknown as DbGlobal).macroadsPrismaClient = scoped;
    try {
      const { fileName, bytes } = await exportWorkbook(ADMIN, {
        showAll: false,
        locationCode: "CASHEL",
        periodKey: PERIOD,
      });

      expect(fileName).toBe("Cashel_Stocktake_15-06-2026.xlsx");

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes);
      expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Summary", "Cashel"]);

      const sheet = workbook.getWorksheet("Cashel");
      expect(sheet).toBeDefined();

      // 2 x 1.005 and 3 x 2, valued on each line's frozen snapshot.
      expect(sheet?.getCell("G3").value).toBe(2.01);
      expect(sheet?.getCell("G4").value).toBe(6);

      let total: { formula?: string; result?: number } | undefined;
      sheet?.eachRow((row) => {
        row.eachCell((cell) => {
          const value = cell.value as { formula?: string; result?: number } | null;
          if (value !== null && typeof value === "object" && value.formula?.startsWith("SUM(")) {
            total = value;
          }
        });
      });
      expect(total?.result).toBe(8.01);
    } finally {
      (globalThis as unknown as DbGlobal).macroadsPrismaClient = previous;
    }
  });
});
