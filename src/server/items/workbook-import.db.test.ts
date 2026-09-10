import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { importWorkbook } from "@/server/items/workbook-import-service";
import type { ImportPlan, ImportSource } from "@/server/items/workbook-plan";
import { resetTestDb } from "@/server/test-db";

/**
 * Spec 005 AC-18 to AC-25 — the write, against a real Postgres.
 *
 * Level 2 of docs/verification.md: a real test database, emptied between tests, never a
 * mock of `PrismaClient`. `npm run test:db` refuses to run unless `TEST_DATABASE_URL` is
 * set and differs from `DATABASE_URL`, so these truncations cannot reach a developer's
 * data.
 *
 * The two properties that matter are proved here and nowhere else: the importer is
 * INSERT-ONLY, so a re-run never reverts a human's correction (AC-21, AC-22); and the
 * write is ATOMIC, so a part-way failure leaves zero rows (AC-24).
 */

const WORKBOOK_PATH = "Samples/Stock @ 01-Sep-2026.xlsx";
const WORKBOOK_BYTES = readFileSync(WORKBOOK_PATH);

const SLOW = 120_000;

async function runImport() {
  return await importWorkbook({ fileName: WORKBOOK_PATH, bytes: WORKBOOK_BYTES });
}

async function rowCounts() {
  const [locations, suppliers, itemTypes, items, prices, links, users, counts, lines] =
    await Promise.all([
      db.location.count(),
      db.supplier.count(),
      db.itemType.count(),
      db.item.count(),
      db.itemPrice.count(),
      db.itemLocation.count(),
      db.user.count(),
      db.stockCount.count(),
      db.stockCountLine.count(),
    ]);

  return { locations, suppliers, itemTypes, items, prices, links, users, counts, lines };
}

/** Every column of every row of the five tables the importer writes, ordered by id. */
async function dumpMasterData(): Promise<string> {
  const [suppliers, itemTypes, items, prices, links] = await Promise.all([
    db.supplier.findMany({ orderBy: { id: "asc" } }),
    db.itemType.findMany({ orderBy: { id: "asc" } }),
    db.item.findMany({ orderBy: { id: "asc" } }),
    db.itemPrice.findMany({ orderBy: { id: "asc" } }),
    db.itemLocation.findMany({ orderBy: { id: "asc" } }),
  ]);

  // Prisma's Decimal and Date both serialise deterministically, so one string is a dump.
  return JSON.stringify({ suppliers, itemTypes, items, prices, links });
}

beforeEach(async () => {
  await resetTestDb();
});

describe("one run against a database holding only the two seeded yards", () => {
  it(
    "AC-18: creates 10 suppliers, 19 types, 140 items, 129 prices and 152 links",
    async () => {
      const before = await rowCounts();
      expect(before).toMatchObject({ locations: 2, suppliers: 0, items: 0, users: 0 });

      const outcome = await runImport();

      expect(outcome.created).toEqual({
        suppliers: 10,
        itemTypes: 19,
        items: 140,
        prices: 129,
        links: 152,
      });

      const after = await rowCounts();
      expect(after).toEqual({
        locations: 2,
        suppliers: 10,
        itemTypes: 19,
        items: 140,
        prices: 129,
        links: 152,
        users: 0,
        counts: 0,
        lines: 0,
      });
    },
    SLOW,
  );

  it(
    "AC-25: imports no historical count data at all",
    async () => {
      await runImport();

      expect(await db.stockCount.count()).toBe(0);
      expect(await db.stockCountLine.count()).toBe(0);
    },
    SLOW,
  );

  it(
    "AC-12: every imported item is active, and exactly fifteen need review",
    async () => {
      await runImport();

      expect(await db.item.count({ where: { active: true } })).toBe(140);
      expect(await db.item.count({ where: { needsReview: true } })).toBe(15);

      const schoolLogo = await db.item.findFirst({ where: { description: "School Logo Triangle" } });
      expect(schoolLogo?.active).toBe(true);
      expect(schoolLogo?.needsReview).toBe(true);
      expect(schoolLogo?.supplierId).toBeNull();
    },
    SLOW,
  );

  it(
    "AC-15: exactly ten items carry a note",
    async () => {
      await runImport();

      expect(await db.item.count({ where: { NOT: { notes: null } } })).toBe(10);
    },
    SLOW,
  );

  it(
    "AC-5: the euro sign survives the round trip into Item.description",
    async () => {
      await runImport();

      const item = await db.item.findFirst({ where: { description: { contains: "Anti Skid Grains" } } });
      expect(item?.description).toBe("Anti Skid Grains (€550 p/T)");
    },
    SLOW,
  );
});

describe("the two yards", () => {
  it(
    "AC-19: are used and never created, and the 152 links split 82 / 70",
    async () => {
      expect(await db.location.count()).toBe(2);

      await runImport();

      expect(await db.location.count()).toBe(2);
      expect(await db.itemLocation.count({ where: { locationId: "loc_dublin" } })).toBe(82);
      expect(await db.itemLocation.count({ where: { locationId: "loc_clonmel" } })).toBe(70);
    },
    SLOW,
  );

  it(
    "AC-13: the two below-total fuel rows are linked to Clonmel, priced and flagged",
    async () => {
      await runImport();

      for (const [description, price, sortOrder] of [
        ["Road Diesel - White", "1.23", 75],
        ["Marked Gas Oil - Green", "0.96", 76],
      ] as const) {
        const item = await db.item.findFirst({
          where: { description },
          include: { supplier: true, itemType: true, prices: true, locations: true },
        });

        expect(item?.supplier?.name).toBe("Mid-West");
        expect(item?.itemType.code).toBe("Fuel");
        expect(item?.unitLabel).toBe("Ltrs");
        expect(item?.unitKind).toBe("LITRE");
        expect(item?.needsReview).toBe(true);
        expect(item?.notes).toContain("below the total row");
        expect(item?.prices[0].unitPrice.toString()).toBe(price);
        expect(item?.locations).toHaveLength(1);
        expect(item?.locations[0].locationId).toBe("loc_clonmel");
        expect(item?.locations[0].sortOrder).toBe(sortOrder);
      }
    },
    SLOW,
  );

  it(
    "AC-19: a database with no CLONMEL row fails with NotFoundError and writes nothing",
    async () => {
      await db.location.delete({ where: { code: "CLONMEL" } });

      await expect(runImport()).rejects.toBeInstanceOf(NotFoundError);
      await expect(runImport()).rejects.toThrow(/CLONMEL/);

      const after = await rowCounts();
      expect(after).toMatchObject({
        suppliers: 0,
        itemTypes: 0,
        items: 0,
        prices: 0,
        links: 0,
      });
    },
    SLOW,
  );
});

describe("prices", () => {
  it(
    "AC-20: land exactly as the workbook computes them, on the 2025 list",
    async () => {
      await runImport();

      const prices = await db.itemPrice.findMany({ include: { item: true } });

      expect(prices).toHaveLength(129);
      for (const price of prices) {
        expect(price.currency).toBe("EUR");
        expect(price.label).toBe("2025 Prices");
        expect(price.effectiveFrom.toISOString().slice(0, 10)).toBe("2025-01-01");
      }

      const castIronStuds = prices.find((price) => price.item.description === "Cast Iron Studs");
      expect(castIronStuds?.unitPrice.toString()).toBe("6.11764706");

      const bauxite = prices.find((price) => price.item.description === "Bauxite Buff  for MMA");
      expect(bauxite?.unitPrice.toString()).toBe("33.09");
    },
    SLOW,
  );

  it(
    "AC-20: every item has at most one price, so the unique key is never violated",
    async () => {
      await runImport();

      const perItem = await db.itemPrice.groupBy({ by: ["itemId"], _count: { _all: true } });

      expect(perItem).toHaveLength(129);
      for (const group of perItem) {
        expect(group._count._all).toBe(1);
      }
    },
    SLOW,
  );
});

describe("a second run", () => {
  it(
    "AC-21: creates nothing, changes nothing, and does not recreate a single row",
    async () => {
      await runImport();
      const afterFirst = await dumpMasterData();

      const second = await runImport();

      expect(second.created).toEqual({
        suppliers: 0,
        itemTypes: 0,
        items: 0,
        prices: 0,
        links: 0,
      });
      expect(second.skipped).toEqual({
        suppliers: 10,
        itemTypes: 19,
        items: 140,
        prices: 129,
        links: 152,
      });

      // ids included: no row was deleted and recreated behind our back.
      expect(await dumpMasterData()).toBe(afterFirst);
      expect(second.report.divergences).toEqual([]);
    },
    SLOW,
  );
});

describe("a re-run never overwrites a human's edit", () => {
  it(
    "AC-22: four ADMIN corrections survive a third run, and each is reported as a divergence",
    async () => {
      await runImport();
      await runImport();

      const kestrel = await db.supplier.findFirstOrThrow({ where: { name: "Kestrel" } });
      const schoolLogo = await db.item.findFirstOrThrow({
        where: { description: "School Logo Triangle" },
      });
      const extrusion = await db.item.findFirstOrThrow({
        where: { description: "White Extrusion 80/20" },
      });
      const beads = await db.item.findFirstOrThrow({ where: { description: "Beads" } });
      const bitumen = await db.item.findFirstOrThrow({ where: { description: "Bitumen" } });

      // The four edits an ADMIN makes from #6's item master.
      await db.item.update({ where: { id: schoolLogo.id }, data: { supplierId: kestrel.id } });
      await db.item.update({ where: { id: extrusion.id }, data: { unitLabel: "tonne" } });
      await db.itemPrice.update({
        where: { itemId_effectiveFrom: { itemId: beads.id, effectiveFrom: new Date("2025-01-01T00:00:00.000Z") } },
        data: { unitPrice: "800" },
      });
      await db.item.update({ where: { id: bitumen.id }, data: { active: false } });

      const third = await runImport();

      expect(third.created).toEqual({
        suppliers: 0,
        itemTypes: 0,
        items: 0,
        prices: 0,
        links: 0,
      });

      // Byte for byte, the human's version is what the database still holds.
      expect((await db.item.findUniqueOrThrow({ where: { id: schoolLogo.id } })).supplierId).toBe(
        kestrel.id,
      );
      expect((await db.item.findUniqueOrThrow({ where: { id: extrusion.id } })).unitLabel).toBe("tonne");
      expect(
        (
          await db.itemPrice.findFirstOrThrow({ where: { itemId: beads.id } })
        ).unitPrice.toString(),
      ).toBe("800");
      expect((await db.item.findUniqueOrThrow({ where: { id: bitumen.id } })).active).toBe(false);

      // And none of it went unnoticed.
      const divergences = third.report.divergences;
      expect(divergences.find((each) => each.field === "supplierName")).toMatchObject({
        workbook: null,
        database: "Kestrel",
      });
      expect(divergences.find((each) => each.field === "unitLabel")).toMatchObject({
        workbook: "Tonne",
        database: "tonne",
      });
      expect(divergences.find((each) => each.field === "unitPrice")).toMatchObject({
        workbook: "790",
        database: "800",
      });
      expect(divergences.find((each) => each.field === "active")).toMatchObject({
        workbook: "true",
        database: "false",
      });

      // AC-17 as amended on 2026-09-10: both figures live in `divergences[]` and nowhere
      // else. The pure test in workbook-plan.test.ts proves the whole property (AC-27
      // requires AC-17 to run with no database); this corroborates it on a report the
      // service really produced, from a price a real ADMIN really corrected.
      const outside: Record<string, unknown> = { ...third.report };
      delete outside.divergences;
      const serialisedOutside = JSON.stringify(outside);

      for (const price of ["790", "800"]) {
        expect(serialisedOutside).not.toContain(JSON.stringify(price));
      }
      expect(JSON.stringify(divergences)).toContain(JSON.stringify("790"));
      expect(JSON.stringify(divergences)).toContain(JSON.stringify("800"));

      expect(await db.item.count()).toBe(140);
    },
    SLOW,
  );

  it("AC-22: the service module contains no update, no delete and no upsert", () => {
    const service = readFileSync("src/server/items/workbook-import-service.ts", "utf8");
    const planner = readFileSync("src/server/items/workbook-plan.ts", "utf8");

    for (const forbidden of [".update", ".updateMany", ".upsert", ".delete", ".deleteMany"]) {
      expect(service, `the service names ${forbidden}`).not.toContain(forbidden);
    }

    // The planner cannot write at all: it never reaches the database layer.
    expect(planner).not.toContain("@/server/db");
    expect(planner).not.toContain("@prisma/client");

    // Non-vacuity: the scan read the module that does the writing.
    expect(service).toContain("createManyAndReturn");
    expect(service).toContain("@/server/db");
  });
});

describe("the supplier-less duplicate gap", () => {
  it(
    "AC-23: two runs leave exactly one School Logo Triangle",
    async () => {
      await runImport();
      await runImport();

      expect(await db.item.count({ where: { description: "School Logo Triangle" } })).toBe(1);
    },
    SLOW,
  );

  it(
    "AC-23: an item inserted by hand with a null supplier is matched, not copied",
    async () => {
      const itemType = await db.itemType.create({
        data: { code: "Logo", name: "Logo", sortOrder: 11 },
      });
      await db.item.create({
        data: {
          description: "School Logo Triangle",
          supplierId: null,
          itemTypeId: itemType.id,
          needsReview: true,
        },
      });

      const outcome = await runImport();

      expect(outcome.created.items).toBe(139);
      expect(outcome.skipped.items).toBe(1);
      expect(await db.item.count({ where: { description: "School Logo Triangle" } })).toBe(1);
      expect(await db.item.count()).toBe(140);
    },
    SLOW,
  );
});

describe("the write is atomic", () => {
  const SOURCE: ImportSource = { fileName: "fixture.xlsx", byteLength: 0, sha256: "" };

  const PLAN_WITH_A_BLANK_DESCRIPTION: ImportPlan = {
    suppliers: [{ name: "Kestrel" }],
    itemTypes: [{ code: "Logo", name: "Logo", sortOrder: 1 }],
    items: [
      {
        description: "A Perfectly Good Item",
        supplierName: "Kestrel",
        itemTypeCode: "Logo",
        unitLabel: "1 Unit",
        unitKind: "UNIT",
        unitQuantityKg: null,
        needsReview: false,
        notes: null,
        unitPrice: "10",
        links: [{ locationCode: "DUBLIN", sortOrder: 3 }],
        cells: ["Dublin!A3"],
        reviewReasons: [],
      },
      {
        // `Item_description_not_empty` refuses this. NOT NULL alone would let it through.
        description: "   ",
        supplierName: "Kestrel",
        itemTypeCode: "Logo",
        unitLabel: "1 Unit",
        unitKind: "UNIT",
        unitQuantityKg: null,
        needsReview: false,
        notes: null,
        unitPrice: "11",
        links: [{ locationCode: "DUBLIN", sortOrder: 4 }],
        cells: ["Dublin!A4"],
        reviewReasons: [],
      },
    ],
    sheets: [{ name: "Dublin", firstRow: 3, lastRow: 4, rowsRead: 2, belowTotalRows: 0 }],
    supplierVariants: [],
    sharedItems: [],
    conflicts: [],
  };

  it("AC-24: a plan whose second item is refused leaves zero rows, not one", async () => {
    await expect(
      importWorkbook({ source: SOURCE, plan: PLAN_WITH_A_BLANK_DESCRIPTION }),
    ).rejects.toThrow();

    const after = await rowCounts();

    // The first item AND its supplier were rolled back: one transaction, all or nothing.
    expect(after).toMatchObject({
      suppliers: 0,
      itemTypes: 0,
      items: 0,
      prices: 0,
      links: 0,
      locations: 2,
    });
  });
});
