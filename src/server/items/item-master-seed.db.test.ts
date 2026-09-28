import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ConflictError } from "@/server/errors";
import { readMasterCounts, seedItemMasterIfEmpty } from "@/server/items/item-master-seed";
import { updateItem } from "@/server/items/item-service";
import { importWorkbook } from "@/server/items/workbook-import-service";
import { resetTestDb } from "@/server/test-db";
import { ADMIN, makeItem, makeItemType, makeLink, makeSupplier, DUBLIN_ID } from "../../../tests/support/item-master-fixture";
import { runScript } from "../../../tests/support/run-script";

/**
 * Spec 016 AC-6: the item master is loaded once, and only into an empty database.
 *
 * Against the test database, emptied before every test. The workbook is read, never written.
 */

const WORKBOOK = "Samples/Stock @ 01-Sep-2026.xlsx";
const BYTES = readFileSync(WORKBOOK);
const SEEDED_LINE = "[seed] SEEDED: 10 suppliers, 19 item types, 140 items, 129 prices, 152 yard links";
const FULL_COUNTS = { suppliers: 10, itemTypes: 19, items: 140, prices: 129, links: 152 };

beforeEach(async () => {
  await resetTestDb();
});

/** Every column of every row of the five tables, ids included, ordered by id. */
async function dumpMaster(): Promise<string> {
  const [suppliers, itemTypes, items, prices, links] = await Promise.all([
    db.supplier.findMany({ orderBy: { id: "asc" } }),
    db.itemType.findMany({ orderBy: { id: "asc" } }),
    db.item.findMany({ orderBy: { id: "asc" } }),
    db.itemPrice.findMany({ orderBy: { id: "asc" } }),
    db.itemLocation.findMany({ orderBy: { id: "asc" } }),
  ]);
  return JSON.stringify({ suppliers, itemTypes, items, prices, links });
}

/** The seeded item master, with one item renamed by an ADMIN through the item service. */
async function seededThenRenamed(): Promise<void> {
  const seeded = await seedItemMasterIfEmpty({ fileName: WORKBOOK, bytes: BYTES });
  expect(seeded.outcome).toBe("SEEDED");

  const item = await db.item.findFirstOrThrow({
    where: { description: { not: "" } },
    orderBy: { id: "asc" },
    select: { id: true, description: true, supplierId: true, itemTypeId: true, unitLabel: true, notes: true },
  });
  await updateItem(ADMIN, item.id, {
    description: `${item.description} (renamed)`,
    supplierId: item.supplierId,
    itemTypeId: item.itemTypeId,
    unitLabel: item.unitLabel,
    notes: item.notes,
  });
}

describe("016 AC-6: all five tables empty", () => {
  it("AC-6: seedItemMasterIfEmpty runs #5's importer and returns SEEDED with 10, 19, 140, 129 and 152", async () => {
    expect(await readMasterCounts()).toEqual({ suppliers: 0, itemTypes: 0, items: 0, prices: 0, links: 0 });

    const result = await seedItemMasterIfEmpty({ fileName: WORKBOOK, bytes: BYTES });

    expect(result).toEqual({ outcome: "SEEDED", counts: FULL_COUNTS });
    expect(await readMasterCounts()).toEqual(FULL_COUNTS);
  });

  it("AC-6: the script prints [seed] SEEDED with the five counts and exits 0, then [seed] SKIPPED with them and exits 0", async () => {
    const first = runScript("scripts/seed-if-empty.ts", [], process.env);

    expect(first.status, first.stderr).toBe(0);
    expect(first.stdout.trim()).toBe(SEEDED_LINE);

    const second = runScript("scripts/seed-if-empty.ts", [], process.env);

    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout.trim()).toBe(
      "[seed] SKIPPED: item master present (10 suppliers, 19 item types, 140 items, 129 prices, 152 yard links)",
    );
    expect(await readMasterCounts()).toEqual(FULL_COUNTS);
  });
});

describe("016 AC-6: all five tables non-zero", () => {
  it("AC-6: after an ADMIN renamed an item, it returns SKIPPED and writes nothing: the five tables, ids included, are deep-equal before and after", async () => {
    await seededThenRenamed();
    const before = await dumpMaster();

    const result = await seedItemMasterIfEmpty({ fileName: WORKBOOK, bytes: BYTES });

    expect(result).toEqual({ outcome: "SKIPPED", counts: FULL_COUNTS });
    expect(await dumpMaster()).toEqual(before);
  });

  it("AC-6 (non-vacuity): importWorkbook, given that same state, creates one item", async () => {
    await seededThenRenamed();

    const outcome = await importWorkbook({ fileName: WORKBOOK, bytes: BYTES });

    expect(outcome.created.items).toBe(1);
  });
});

describe("016 AC-6: any other combination", () => {
  it("AC-6: a partly filled item master throws ConflictError naming each of the five tables with its count, and writes nothing", async () => {
    const supplierId = await makeSupplier("Partial Supplier");
    const typeId = await makeItemType("PARTIAL", 1);
    const itemId = await makeItem({ description: "Partial item", supplierId, itemTypeId: typeId });
    await makeLink(itemId, DUBLIN_ID, 1);

    const partials: (() => Promise<void>)[] = [
      async () => undefined,
      async () => {
        await db.itemLocation.deleteMany();
      },
      async () => {
        await db.itemLocation.deleteMany();
        await db.item.deleteMany();
        await db.itemType.deleteMany();
      },
    ];
    const expected = [
      "Supplier 1, ItemType 1, Item 1, ItemPrice 0, ItemLocation 1",
      "Supplier 1, ItemType 1, Item 1, ItemPrice 0, ItemLocation 0",
      "Supplier 1, ItemType 0, Item 0, ItemPrice 0, ItemLocation 0",
    ];

    for (const [index, reduce] of partials.entries()) {
      await reduce();
      const before = await dumpMaster();

      const attempt = seedItemMasterIfEmpty({ fileName: WORKBOOK, bytes: BYTES });

      await expect(attempt).rejects.toBeInstanceOf(ConflictError);
      await expect(attempt).rejects.toThrow(expected[index] ?? "");
      expect(await dumpMaster()).toEqual(before);
    }
  });

  it("AC-6: the script exits non-zero for a partly filled item master, naming the five counts", async () => {
    await makeSupplier("Partial Supplier");
    const before = await dumpMaster();

    const run = runScript("scripts/seed-if-empty.ts", [], process.env);

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("Supplier 1, ItemType 0, Item 0, ItemPrice 0, ItemLocation 0");
    expect(run.stdout).not.toContain("[seed] SEEDED");
    expect(await dumpMaster()).toEqual(before);
  });
});
