import { beforeEach, describe, expect, it } from "vitest";

import { moneyKeysIn } from "@/lib/money-boundary";
import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import {
  assignItemToLocation,
  listSheet,
  locationName,
  moveItemInSheet,
  unassignItemFromLocation,
} from "@/server/items/item-assignment-service";
import { addPrice } from "@/server/items/item-price-service";
import {
  createItem,
  deleteItem,
  markItemReviewed,
  setItemActive,
  updateItem,
} from "@/server/items/item-service";
import {
  createItemType,
  deleteItemType,
  moveItemType,
  updateItemType,
} from "@/server/items/item-type-service";
import { currentPriceOf } from "@/server/items/sheet-shape";
import {
  createSupplier,
  deleteSupplier,
  renameSupplier,
  setSupplierActive,
} from "@/server/items/supplier-service";
import { resetTestDb } from "@/server/test-db";

import {
  ADMIN,
  DUBLIN_ID,
  STAFF,
  makeItem,
  makeItemType,
  makeLink,
  makePrice,
  makeSupplier,
  tableCounts,
} from "../../../tests/support/item-master-fixture";

/**
 * Spec 007 AC-14 against a real database: the one guard that moves, and everything that
 * does not move with it.
 *
 * It is a NEW file rather than an addition to `item-assignment-service.db.test.ts`,
 * because AC-14 says the only shipped assertion this feature edits is the
 * `listSheet(staff, "DUBLIN")` rejection in that file and that `git diff` on it shows no
 * other change. So the one line goes there, and everything new goes here.
 */
beforeEach(async () => {
  await resetTestDb();
});

/** Dublin with one priced item and one item that has never had a price. */
async function dublinWithTwoItems(): Promise<{ priced: string; unpriced: string }> {
  const typeId = await makeItemType("BEADS", 1);
  const supplierId = await makeSupplier("Kelly");

  const priced = await makeItem({
    description: "White Extrusion 80/20",
    itemTypeId: typeId,
    supplierId,
    unitLabel: "20 Kg",
  });
  await makePrice(priced, "9.83000000", "2025-01-01", "2025 Prices");
  await makeLink(priced, DUBLIN_ID, 3);

  const unpriced = await makeItem({
    description: "Yellow Thermo-P",
    itemTypeId: typeId,
    supplierId,
    unitLabel: "25 Kg",
  });
  await makeLink(unpriced, DUBLIN_ID, 4);

  return { priced, unpriced };
}

describe("listSheet is role-shaped", () => {
  it("AC-14: a YARD_STAFF entry has NO currentPrice key at all, at any row", async () => {
    await dublinWithTwoItems();

    const sheet = await listSheet(STAFF, "DUBLIN");

    expect(sheet).toHaveLength(2);
    for (const entry of sheet) {
      expect(Object.hasOwn(entry, "currentPrice")).toBe(false);
      expect(Object.keys(entry).sort()).toEqual([
        "description",
        "itemActive",
        "itemId",
        "linkActive",
        "sortOrder",
        "unitLabel",
      ]);
    }
  });

  it("AC-14: an ADMIN entry carries currentPrice, and 006 AC-24's shape is unchanged", async () => {
    const { priced, unpriced } = await dublinWithTwoItems();

    const sheet = await listSheet(ADMIN, "DUBLIN", {}, "2026-09-01");

    expect(sheet.map((entry) => entry.itemId)).toEqual([priced, unpriced]);
    for (const entry of sheet) {
      expect(Object.hasOwn(entry, "currentPrice")).toBe(true);
    }
    expect(currentPriceOf(sheet[0])?.unitPrice).toBe("9.83");
    expect(currentPriceOf(sheet[1])).toBeNull();
  });

  it("AC-14, AC-17: the staff sheet carries no monetary key at any depth", async () => {
    await dublinWithTwoItems();

    expect(moneyKeysIn(await listSheet(STAFF, "DUBLIN"))).toEqual([]);

    // Non-vacuity: the ADMIN sheet does carry one, so the walk is looking at something.
    expect(moneyKeysIn(await listSheet(ADMIN, "DUBLIN"))).toContain("currentPrice");
  });

  it("AC-14: both roles get the same rows, in the same order, with the same non-money fields", async () => {
    const { priced, unpriced } = await dublinWithTwoItems();

    const staffSheet = await listSheet(STAFF, "DUBLIN");
    const adminSheet = await listSheet(ADMIN, "DUBLIN");

    expect(staffSheet.map((entry) => entry.itemId)).toEqual([priced, unpriced]);
    expect(staffSheet.map((entry) => entry.itemId)).toEqual(
      adminSheet.map((entry) => entry.itemId),
    );
    expect(staffSheet.map((entry) => entry.sortOrder)).toEqual([3, 4]);
    expect(staffSheet.map((entry) => entry.description)).toEqual(
      adminSheet.map((entry) => entry.description),
    );
  });

  it("AC-14: the shape comes from actor.role alone — a staff actor named ADMIN is still staff", async () => {
    await dublinWithTwoItems();

    // Nothing a client sets reaches this decision: there is no query string, header or
    // cookie in the argument list at all. The nearest thing a request could influence is
    // the user's own name and email, and neither is consulted.
    const impostor: SessionUser = {
      ...STAFF,
      name: "ADMIN",
      email: "admin@macroads.test",
    };

    for (const entry of await listSheet(impostor, "DUBLIN")) {
      expect(Object.hasOwn(entry, "currentPrice")).toBe(false);
    }
  });

  it("AC-14: listSheet and locationName both accept any signed-in actor", async () => {
    await dublinWithTwoItems();

    expect(await locationName(STAFF, "DUBLIN")).toBe("Dublin");
    expect(await locationName(ADMIN, "CLONMEL")).toBe("Clonmel");
    expect(await listSheet(STAFF, "CLONMEL")).toEqual([]);
  });

  it("AC-14, AC-4: both read functions refuse a null actor with UnauthorizedError", async () => {
    await dublinWithTwoItems();
    const nobody = null as unknown as SessionUser;

    await expect(listSheet(nobody, "DUBLIN")).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(locationName(nobody, "DUBLIN")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("nothing else about the item master moves", () => {
  it("AC-14: all seventeen mutations of 006 AC-4 still refuse a staff actor, and write nothing", async () => {
    const { priced } = await dublinWithTwoItems();
    const typeId = (await db.itemType.findFirstOrThrow({ select: { id: true } })).id;
    const supplierId = (await db.supplier.findFirstOrThrow({ select: { id: true } })).id;
    const before = await tableCounts();

    // Thunks, not promises: an array of already-started promises rejects before the loop
    // reaches it, and an unhandled rejection is noise that can hide a real one.
    const seventeen: [string, () => Promise<unknown>][] = [
      ["createItem", () => createItem(STAFF, { description: "New", itemTypeId: typeId })],
      ["updateItem", () => updateItem(STAFF, priced, { description: "New", itemTypeId: typeId })],
      ["setItemActive", () => setItemActive(STAFF, priced, false)],
      ["deleteItem", () => deleteItem(STAFF, priced)],
      ["markItemReviewed", () => markItemReviewed(STAFF, priced)],
      ["addPrice", () => addPrice(STAFF, { itemId: priced, unitPrice: "1.00", effectiveFrom: "2026-01-01" })],
      ["assignItemToLocation", () => assignItemToLocation(STAFF, priced, "CLONMEL")],
      ["unassignItemFromLocation", () => unassignItemFromLocation(STAFF, priced, "DUBLIN")],
      ["moveItemInSheet", () => moveItemInSheet(STAFF, priced, "DUBLIN", "UP")],
      ["createSupplier", () => createSupplier(STAFF, { name: "Another" })],
      ["renameSupplier", () => renameSupplier(STAFF, supplierId, { name: "Another" })],
      ["setSupplierActive", () => setSupplierActive(STAFF, supplierId, false)],
      ["deleteSupplier", () => deleteSupplier(STAFF, supplierId)],
      ["createItemType", () => createItemType(STAFF, { code: "NEW", name: "New" })],
      ["updateItemType", () => updateItemType(STAFF, typeId, { code: "NEW", name: "New" })],
      ["moveItemType", () => moveItemType(STAFF, typeId, "UP")],
      ["deleteItemType", () => deleteItemType(STAFF, typeId)],
    ];

    expect(seventeen).toHaveLength(17);

    for (const [name, call] of seventeen) {
      await expect(call(), name).rejects.toBeInstanceOf(ForbiddenError);
      await expect(call(), name).rejects.toThrow("ADMIN is required for this action");
    }

    // Every row count in the five tables is exactly what it was before the refusals.
    expect(await tableCounts()).toEqual(before);
  });
});
