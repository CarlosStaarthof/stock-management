import { beforeEach, describe, expect, it } from "vitest";

import {
  DESCRIPTION_REQUIRED,
  cannotMarkReviewed,
  itemAlreadyExists,
  itemHasCountLines,
} from "@/lib/item-master-messages";
import { db } from "@/server/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/errors";
import {
  createItem,
  deleteItem,
  getItem,
  listItems,
  markItemReviewed,
  setItemActive,
  updateItem,
} from "@/server/items/item-service";
import { parseItemListQuery } from "@/server/items/item-master-input";
import { listSheet } from "@/server/items/item-assignment-service";
import { resetTestDb } from "@/server/test-db";

import {
  ADMIN,
  CLONMEL_ID,
  DUBLIN_ID,
  makeCountLine,
  makeItem,
  makeItemType,
  makeLink,
  makePrice,
  makeSupplier,
  tableCounts,
} from "../../../tests/support/item-master-fixture";

/**
 * Level 2 (docs/verification.md): the item master against a real Postgres, never a mock.
 *
 * Spec 006 AC-6 to AC-12 and AC-17 to AC-20.
 */
const QUERY = parseItemListQuery({});

function query(raw: Record<string, string>): ReturnType<typeof parseItemListQuery> {
  return parseItemListQuery(raw);
}

beforeEach(async () => {
  await resetTestDb();
});

describe("listItems", () => {
  it("AC-6: renders one row per active item, ordered by description case-insensitively", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const kelly = await makeSupplier("Kelly");
    await makeItem({ description: "beads small", itemTypeId: typeId, supplierId: kelly });
    await makeItem({ description: "Anti-Skid", itemTypeId: typeId, supplierId: kelly });
    await makeItem({ description: "Zebra", itemTypeId: typeId, supplierId: kelly });
    await makeItem({ description: "Archived one", itemTypeId: typeId, active: false });

    const page = await listItems(ADMIN, QUERY);

    expect(page.rows.map((row) => row.description)).toEqual(["Anti-Skid", "beads small", "Zebra"]);
    expect(page.counts).toEqual({ active: 3, needsReview: 0, notes: 0, archived: 1 });
  });

  it("AC-6: q matches a substring in any case, and the filters combine with AND", async () => {
    const beads = await makeItemType("BEADS", 1);
    const paint = await makeItemType("PAINT", 2);
    const kelly = await makeSupplier("Kelly");
    const kestrel = await makeSupplier("Kestrel");

    const a = await makeItem({ description: "MultiGrip Red", itemTypeId: beads, supplierId: kelly });
    await makeItem({ description: "multigrip Blue", itemTypeId: paint, supplierId: kestrel });
    await makeItem({ description: "Thermo-P", itemTypeId: beads, supplierId: kelly });
    await makeLink(a, DUBLIN_ID, 3);

    expect((await listItems(ADMIN, query({ q: "multigrip" }))).rows).toHaveLength(2);
    expect(
      (await listItems(ADMIN, query({ q: "MULTIGRIP", supplierId: kelly }))).rows.map(
        (row) => row.description,
      ),
    ).toEqual(["MultiGrip Red"]);
    expect(
      (await listItems(ADMIN, query({ q: "multigrip", itemTypeId: paint }))).rows.map(
        (row) => row.description,
      ),
    ).toEqual(["multigrip Blue"]);
    expect(
      (await listItems(ADMIN, query({ q: "multigrip", locationCode: "DUBLIN" }))).rows.map(
        (row) => row.description,
      ),
    ).toEqual(["MultiGrip Red"]);
  });

  it("AC-6 failure path: a filter matching nothing returns no rows, and the master is not empty", async () => {
    const typeId = await makeItemType("BEADS", 1);
    await makeItem({ description: "Beads", itemTypeId: typeId });

    const page = await listItems(ADMIN, query({ q: "nothing-matches-this" }));

    expect(page.rows).toEqual([]);
    // The two empty states are different sentences, so the page must be able to tell them
    // apart: no items at all, versus no items matching (AC-28).
    expect(page.totalItems).toBe(1);
  });

  it("AC-6: a row carries the supplier, type, unit, current price and yard badges", async () => {
    const typeId = await makeItemType("BEADS", 1, "Beads");
    const kelly = await makeSupplier("Kelly");
    const itemId = await makeItem({
      description: "Beads",
      itemTypeId: typeId,
      supplierId: kelly,
      unitLabel: "20 Kg",
    });
    await makePrice(itemId, "33.09000000", "2025-01-01");
    await makeLink(itemId, DUBLIN_ID, 3);
    await makeLink(itemId, CLONMEL_ID, 7);

    const [row] = (await listItems(ADMIN, QUERY, "2026-09-10")).rows;

    expect(row.supplierName).toBe("Kelly");
    expect(row.supplierActive).toBe(true);
    expect(row.itemTypeName).toBe("Beads");
    expect(row.unitLabel).toBe("20 Kg");
    expect(row.unitKind).toBe("KILOGRAM");
    expect(row.unitQuantityKg).toBe("20");
    expect(row.currentPrice).toEqual({
      unitPrice: "33.09",
      currency: "EUR",
      effectiveFrom: "2025-01-01",
    });
    // Location.sortOrder, so Dublin is always before Clonmel.
    expect(row.yards).toEqual(["DUBLIN", "CLONMEL"]);
    expect(row.reviewReasons).toEqual([]);
  });

  it("AC-17: the four counts are of the whole master, not of the filtered page", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const supplierId = await makeSupplier("Topaz");

    for (let index = 0; index < 15; index += 1) {
      await makeItem({
        description: `Flagged ${index}`,
        itemTypeId: typeId,
        supplierId,
        unitLabel: "Ltrs",
        needsReview: true,
        notes: index < 10 ? `note ${index}` : null,
      });
    }
    await makeItem({ description: "Fine", itemTypeId: typeId, supplierId, unitLabel: "Ltrs" });

    const page = await listItems(ADMIN, query({ filter: "needs-review" }));

    expect(page.counts).toEqual({ active: 16, needsReview: 15, notes: 10, archived: 0 });
    expect(page.rows).toHaveLength(15);
    expect(page.rows.every((row) => row.needsReview)).toBe(true);

    expect((await listItems(ADMIN, query({ filter: "notes" }))).rows).toHaveLength(10);
    expect((await listItems(ADMIN, query({ filter: "archived" }))).rows).toHaveLength(0);
  });

  it("AC-18: a flagged row with nothing missing carries no reason, and a price-less one does", async () => {
    const typeId = await makeItemType("FUEL", 1);
    const topaz = await makeSupplier("Topaz");

    const fuel = await makeItem({
      description: "Diesel",
      itemTypeId: typeId,
      supplierId: topaz,
      unitLabel: "Ltrs",
      needsReview: true,
      notes: "Below the total row on Dublin!A61",
    });
    await makePrice(fuel, "1.15000000", "2025-01-01");
    await makeItem({
      description: "School Logo Triangle",
      itemTypeId: typeId,
      supplierId: null,
      unitLabel: "1 Unit",
      needsReview: true,
    });

    const rows = (await listItems(ADMIN, query({ filter: "needs-review" }))).rows;
    const byDescription = new Map(rows.map((row) => [row.description, row]));

    expect(byDescription.get("Diesel")?.reviewReasons).toEqual([]);
    expect(byDescription.get("Diesel")?.hasNote).toBe(true);
    expect(byDescription.get("School Logo Triangle")?.reviewReasons).toEqual([
      "MISSING_SUPPLIER",
      "MISSING_PRICE",
    ]);
  });

  it("AC-4: listItems refuses a YARD_STAFF actor, as a ForbiddenError", async () => {
    const staff = { ...ADMIN, role: "YARD_STAFF" } as const;

    await expect(listItems(staff, QUERY)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listItems(staff, QUERY)).rejects.toThrow(
      "ADMIN is required for this action",
    );
  });
});

describe("createItem", () => {
  it("AC-7: derives unitKind and unitQuantityKg with normaliseUnit, and starts active", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const kelly = await makeSupplier("Kelly");

    const created = await createItem(ADMIN, {
      description: "  Beads  ",
      supplierId: kelly,
      itemTypeId: typeId,
      unitLabel: "20 Kg",
      notes: null,
    });

    const stored = await db.item.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.description).toBe("Beads");
    expect(stored.unitKind).toBe("KILOGRAM");
    expect(stored.unitQuantityKg?.toString()).toBe("20");
    expect(stored.active).toBe(true);
    // No price yet, so the system raises the flag on the way in (AC-19).
    expect(stored.needsReview).toBe(true);
  });

  it("AC-7: internal whitespace in a description is preserved exactly", async () => {
    const typeId = await makeItemType("SIGNS", 1);

    const created = await createItem(ADMIN, {
      description: "Bicycle Logo's  1200mm",
      supplierId: null,
      itemTypeId: typeId,
      unitLabel: null,
      notes: null,
    });

    expect(created.description).toBe("Bicycle Logo's  1200mm");
    // 005 open question 5 keeps the two-space and three-space spellings apart, so the
    // three-space search must not find the two-space row.
    expect((await listItems(ADMIN, query({ q: "Logo's   1200mm" }))).rows).toEqual([]);
    expect((await listItems(ADMIN, query({ q: "Logo's  1200mm" }))).rows).toHaveLength(1);
  });

  it("AC-8: an empty or whitespace-only description writes no row", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const base = { supplierId: null, itemTypeId: typeId, unitLabel: null, notes: null };

    for (const description of ["", "   "]) {
      const error = await createItem(ADMIN, { ...base, description }).catch((thrown) => thrown);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("description");
      expect((error as ValidationError).message).toBe(DESCRIPTION_REQUIRED);
    }

    expect(await db.item.count()).toBe(0);
  });

  it("AC-9: a second item with the same description under the same supplier is refused", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const kelly = await makeSupplier("Kelly");
    const input = {
      description: "Beads",
      supplierId: kelly,
      itemTypeId: typeId,
      unitLabel: null,
      notes: null,
    };
    await createItem(ADMIN, input);

    const error = await createItem(ADMIN, input).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(itemAlreadyExists("Beads", "Kelly"));
    expect(await db.item.count()).toBe(1);
  });

  it("AC-9: two supplier-less items with one description are refused where Postgres cannot", async () => {
    const typeId = await makeItemType("SIGNS", 1);
    const input = {
      description: "School Logo Triangle",
      supplierId: null,
      itemTypeId: typeId,
      unitLabel: null,
      notes: null,
    };
    await createItem(ADMIN, input);

    const error = await createItem(ADMIN, input).catch((thrown) => thrown);

    // @@unique([description, supplierId]) does NOT catch this: Postgres treats two NULLs
    // as distinct, so the check is the application's (AC-9, mirroring 005 AC-23).
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(
      itemAlreadyExists("School Logo Triangle", null),
    );
    expect((error as ConflictError).message).toContain("no supplier");
    expect(await db.item.count()).toBe(1);
  });

  it("AC-9: the same description under a different supplier is two real items", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const kelly = await makeSupplier("Kelly");
    const kestrel = await makeSupplier("Kestrel");

    await createItem(ADMIN, {
      description: "Beads",
      supplierId: kelly,
      itemTypeId: typeId,
      unitLabel: null,
      notes: null,
    });
    await createItem(ADMIN, {
      description: "Beads",
      supplierId: kestrel,
      itemTypeId: typeId,
      unitLabel: null,
      notes: null,
    });

    expect(await db.item.count()).toBe(2);
  });

  it("AC-4: every item mutation refuses a YARD_STAFF actor and writes nothing", async () => {
    // All six functions `item-service.ts` owns, not two of them - and the after-image is
    // every table this feature can write, not `Item` alone (AC-4).
    const typeId = await makeItemType("BEADS", 1);
    const supplierId = await makeSupplier("Kelly");
    const itemId = await makeItem({
      description: "Beads",
      itemTypeId: typeId,
      supplierId,
      unitLabel: "20 Kg",
      needsReview: true,
    });
    await makePrice(itemId, "33.09000000", "2025-01-01");
    await makeLink(itemId, DUBLIN_ID, 3);

    const before = await tableCounts();
    const beforeRow = await db.item.findUniqueOrThrow({ where: { id: itemId } });
    const staff = { ...ADMIN, role: "YARD_STAFF" } as const;
    const input = {
      description: "Renamed by staff",
      supplierId: null,
      itemTypeId: typeId,
      unitLabel: "Tonne",
      notes: "touched",
    };

    // The class, not only the message: a caller that cannot tell a refusal from a bug is
    // exactly what docs/architecture.md's typed errors exist to prevent.
    await expect(createItem(staff, { ...input, description: "Newcomer" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createItem(staff, { ...input, description: "Newcomer" })).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(updateItem(staff, itemId, input)).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(setItemActive(staff, itemId, false)).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(deleteItem(staff, itemId)).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(markItemReviewed(staff, itemId)).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(getItem(staff, itemId)).rejects.toThrow(
      "ADMIN is required for this action",
    );

    // Item, ItemPrice, ItemLocation, Supplier and ItemType all unchanged.
    expect(await tableCounts()).toEqual(before);
    // And the row itself, field for field: a refusal that still edited would pass a count.
    expect(await db.item.findUniqueOrThrow({ where: { id: itemId } })).toEqual(beforeRow);
  });
});

describe("updateItem", () => {
  it("AC-10: persists all four fields, re-derives the unit, and leaves prices and links alone", async () => {
    const beads = await makeItemType("BEADS", 1);
    const paint = await makeItemType("PAINT", 2);
    const kelly = await makeSupplier("Kelly");
    const kestrel = await makeSupplier("Kestrel");
    const itemId = await makeItem({
      description: "Beads",
      itemTypeId: beads,
      supplierId: kelly,
      unitLabel: "20 Kg",
    });
    const priceId = await makePrice(itemId, "33.09000000", "2025-01-01");
    const linkId = await makeLink(itemId, DUBLIN_ID, 3);

    await updateItem(ADMIN, itemId, {
      description: "Beads",
      supplierId: kestrel,
      itemTypeId: paint,
      unitLabel: "Tonne",
      notes: "moved to paint",
    });

    const stored = await db.item.findUniqueOrThrow({ where: { id: itemId } });
    expect(stored.supplierId).toBe(kestrel);
    expect(stored.itemTypeId).toBe(paint);
    expect(stored.unitLabel).toBe("Tonne");
    expect(stored.unitKind).toBe("TONNE");
    expect(stored.unitQuantityKg?.toString()).toBe("1000");
    expect(stored.notes).toBe("moved to paint");

    const price = await db.itemPrice.findUniqueOrThrow({ where: { id: priceId } });
    expect(price.itemId).toBe(itemId);
    expect(price.effectiveFrom.toISOString().slice(0, 10)).toBe("2025-01-01");
    const link = await db.itemLocation.findUniqueOrThrow({ where: { id: linkId } });
    expect(link.sortOrder).toBe(3);
    expect(link.active).toBe(true);
  });

  it("AC-10: setting the supplier to none stores null, not a placeholder row", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const kelly = await makeSupplier("Kelly");
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId, supplierId: kelly });

    await updateItem(ADMIN, itemId, {
      description: "Beads",
      supplierId: "",
      itemTypeId: typeId,
      unitLabel: null,
      notes: null,
    });

    const stored = await db.item.findUniqueOrThrow({ where: { id: itemId } });
    expect(stored.supplierId).toBeNull();
    expect(await db.supplier.count()).toBe(1);
  });

  it("AC-9: renaming item B onto item A's identity is refused and B is unchanged", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const kelly = await makeSupplier("Kelly");
    await makeItem({ description: "Alpha", itemTypeId: typeId, supplierId: kelly });
    const bId = await makeItem({ description: "Bravo", itemTypeId: typeId, supplierId: kelly });

    await expect(
      updateItem(ADMIN, bId, {
        description: "Alpha",
        supplierId: kelly,
        itemTypeId: typeId,
        unitLabel: null,
        notes: null,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect((await db.item.findUniqueOrThrow({ where: { id: bId } })).description).toBe("Bravo");
  });

  it("AC-9: saving an item onto its own identity is not a conflict", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Alpha", itemTypeId: typeId });

    await updateItem(ADMIN, itemId, {
      description: "Alpha",
      supplierId: null,
      itemTypeId: typeId,
      unitLabel: "20 Kg",
      notes: null,
    });

    expect((await db.item.findUniqueOrThrow({ where: { id: itemId } })).unitLabel).toBe("20 Kg");
  });

  it("AC-8: an empty description on update changes nothing", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId });

    await expect(
      updateItem(ADMIN, itemId, {
        description: "   ",
        supplierId: null,
        itemTypeId: typeId,
        unitLabel: null,
        notes: null,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect((await db.item.findUniqueOrThrow({ where: { id: itemId } })).description).toBe("Beads");
  });

  it("AC-20: notes are editable and clearing them changes nothing else", async () => {
    const typeId = await makeItemType("PAINT", 1);
    const kelly = await makeSupplier("Kelly");
    const itemId = await makeItem({
      description: "MMA Paints - Red",
      itemTypeId: typeId,
      supplierId: kelly,
      unitLabel: "1 Unit",
      notes: "Dublin!D50 says 1 Unit; 'Clonmel '!D64 says 16kg",
    });
    await makePrice(itemId, "1.00000000", "2025-01-01");
    const before = await db.item.findUniqueOrThrow({ where: { id: itemId } });

    await updateItem(ADMIN, itemId, {
      description: "MMA Paints - Red",
      supplierId: kelly,
      itemTypeId: typeId,
      unitLabel: "1 Unit",
      notes: "",
    });

    const after = await db.item.findUniqueOrThrow({ where: { id: itemId } });
    expect(after.notes).toBeNull();
    expect(after.needsReview).toBe(before.needsReview);
    expect(after.active).toBe(before.active);
    expect(after.unitLabel).toBe(before.unitLabel);
  });

  it("AC-19: clearing the supplier or the unit label of a reviewed item raises the flag", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const kelly = await makeSupplier("Kelly");
    const itemId = await makeItem({
      description: "Beads",
      itemTypeId: typeId,
      supplierId: kelly,
      unitLabel: "20 Kg",
      needsReview: false,
    });
    await makePrice(itemId, "1.00000000", "2025-01-01");

    await updateItem(ADMIN, itemId, {
      description: "Beads",
      supplierId: null,
      itemTypeId: typeId,
      unitLabel: "20 Kg",
      notes: null,
    });
    expect((await db.item.findUniqueOrThrow({ where: { id: itemId } })).needsReview).toBe(true);

    await db.item.update({ where: { id: itemId }, data: { needsReview: false, supplierId: kelly } });

    await updateItem(ADMIN, itemId, {
      description: "Beads",
      supplierId: kelly,
      itemTypeId: typeId,
      unitLabel: "",
      notes: null,
    });
    expect((await db.item.findUniqueOrThrow({ where: { id: itemId } })).needsReview).toBe(true);
  });

  it("AC-19: an ordinary save never lowers the flag", async () => {
    const typeId = await makeItemType("FUEL", 1);
    const topaz = await makeSupplier("Topaz");
    const itemId = await makeItem({
      description: "Diesel",
      itemTypeId: typeId,
      supplierId: topaz,
      unitLabel: "Ltrs",
      needsReview: true,
    });
    await makePrice(itemId, "1.15000000", "2025-01-01");

    await updateItem(ADMIN, itemId, {
      description: "Diesel",
      supplierId: topaz,
      itemTypeId: typeId,
      unitLabel: "Ltrs",
      notes: "still flagged for provenance",
    });

    expect((await db.item.findUniqueOrThrow({ where: { id: itemId } })).needsReview).toBe(true);
  });
});

describe("markItemReviewed", () => {
  it("AC-19: refuses while a reason remains, naming it, and leaves the flag up", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({
      description: "Beads",
      itemTypeId: typeId,
      supplierId: await makeSupplier("Kelly"),
      unitLabel: "20 Kg",
      needsReview: true,
    });

    const error = await markItemReviewed(ADMIN, itemId).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toBe(cannotMarkReviewed(["MISSING_PRICE"]));
    expect((error as ValidationError).message).toBe("Cannot mark reviewed: no price recorded.");
    expect((await db.item.findUniqueOrThrow({ where: { id: itemId } })).needsReview).toBe(true);
  });

  it("AC-19: succeeds once the supplier, the unit label and the price are supplied", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({
      description: "Beads",
      itemTypeId: typeId,
      supplierId: null,
      unitLabel: null,
      needsReview: true,
    });

    await expect(markItemReviewed(ADMIN, itemId)).rejects.toBeInstanceOf(ValidationError);

    await updateItem(ADMIN, itemId, {
      description: "Beads",
      supplierId: await makeSupplier("Kelly"),
      itemTypeId: typeId,
      unitLabel: "20 Kg",
      notes: null,
    });
    await makePrice(itemId, "33.09000000", "2025-01-01");

    const reviewed = await markItemReviewed(ADMIN, itemId);

    expect(reviewed.needsReview).toBe(false);
    expect((await listItems(ADMIN, query({ filter: "needs-review" }))).rows).toEqual([]);
    expect((await listItems(ADMIN, QUERY)).counts.needsReview).toBe(0);
  });

  it("AC-19: a below-total fuel row can be marked reviewed immediately", async () => {
    const typeId = await makeItemType("FUEL", 1);
    const itemId = await makeItem({
      description: "Diesel",
      itemTypeId: typeId,
      supplierId: await makeSupplier("Topaz"),
      unitLabel: "Ltrs",
      needsReview: true,
      notes: "Below the total row",
    });
    await makePrice(itemId, "1.15000000", "2025-01-01");

    await markItemReviewed(ADMIN, itemId);

    expect((await db.item.findUniqueOrThrow({ where: { id: itemId } })).needsReview).toBe(false);
  });
});

describe("setItemActive", () => {
  it("AC-11: archiving does not touch history, the links, or the yards it returns to", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({
      description: "Swept Path Markers for Transdev",
      itemTypeId: typeId,
      supplierId: await makeSupplier("Kelly"),
      unitLabel: "1 Unit",
    });
    const linkId = await makeLink(itemId, DUBLIN_ID, 12);
    const { lineId } = await makeCountLine(itemId, { quantity: "21.6128" });
    const lineBefore = await db.stockCountLine.findUniqueOrThrow({ where: { id: lineId } });
    const linkBefore = await db.itemLocation.findUniqueOrThrow({ where: { id: linkId } });

    await setItemActive(ADMIN, itemId, false);

    const lineAfter = await db.stockCountLine.findUniqueOrThrow({ where: { id: lineId } });
    expect(lineAfter.id).toBe(lineBefore.id);
    expect(lineAfter.quantity?.toString()).toBe(lineBefore.quantity?.toString());
    expect(lineAfter.unitPriceSnapshot?.toString()).toBe(
      lineBefore.unitPriceSnapshot?.toString(),
    );
    expect(lineAfter.note).toBe(lineBefore.note);

    const linkAfter = await db.itemLocation.findUniqueOrThrow({ where: { id: linkId } });
    expect(linkAfter).toEqual(linkBefore);

    expect((await listItems(ADMIN, QUERY)).rows).toEqual([]);
    expect(await listSheet(ADMIN, "DUBLIN")).toEqual([]);
    expect(await listSheet(ADMIN, "CLONMEL")).toEqual([]);

    const archived = (await listItems(ADMIN, query({ filter: "archived" }))).rows;
    expect(archived).toHaveLength(1);
    expect(archived[0].active).toBe(false);

    await setItemActive(ADMIN, itemId, true);

    const sheet = await listSheet(ADMIN, "DUBLIN");
    expect(sheet.map((entry) => [entry.description, entry.sortOrder])).toEqual([
      ["Swept Path Markers for Transdev", 12],
    ]);
  });
});

describe("deleteItem", () => {
  it("AC-12: refuses an item with a count line, in the service's own words", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId });
    await makeCountLine(itemId);

    const error = await deleteItem(ADMIN, itemId).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(itemHasCountLines("Beads", 1));
    for (const forbidden of [
      "violates RESTRICT setting of foreign key constraint",
      "PrismaClientUnknownRequestError",
      "constraint",
      "23001",
    ]) {
      expect((error as ConflictError).message).not.toContain(forbidden);
    }
    expect(await db.item.count()).toBe(1);
    expect(await db.stockCountLine.count()).toBe(1);
  });

  it("AC-12: deletes an unreferenced item and cascades its prices and links, leaving no orphan", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId });
    await makePrice(itemId, "1.00000000", "2025-01-01");
    await makeLink(itemId, DUBLIN_ID, 3);
    await makeLink(itemId, CLONMEL_ID, 4);

    await deleteItem(ADMIN, itemId);

    expect(await db.item.count()).toBe(0);
    expect(await db.itemPrice.count()).toBe(0);
    expect(await db.itemLocation.count()).toBe(0);
  });

  it("AC-12: getItem reports the line count the Delete control is rendered from", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const free = await makeItem({ description: "Free", itemTypeId: typeId });
    const used = await makeItem({ description: "Used", itemTypeId: typeId });
    await makeCountLine(used);

    expect((await getItem(ADMIN, free)).lineCount).toBe(0);
    expect((await getItem(ADMIN, used)).lineCount).toBe(1);
  });

  it("AC-12 failure path: an unknown id is a NotFoundError, not a crash", async () => {
    await expect(deleteItem(ADMIN, "item_does_not_exist")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getItem(ADMIN, "item_does_not_exist")).rejects.toBeInstanceOf(NotFoundError);
  });
});
