import { beforeEach, describe, expect, it } from "vitest";

import { supplierHasItems, supplierNameAlreadyExists } from "@/lib/item-master-messages";
import { db } from "@/server/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/errors";
import { getItem } from "@/server/items/item-service";
import {
  createSupplier,
  deleteSupplier,
  listSuppliers,
  renameSupplier,
  setSupplierActive,
} from "@/server/items/supplier-service";
import { resetTestDb } from "@/server/test-db";

import {
  ADMIN,
  makeItem,
  makeItemType,
  makeSupplier,
  tableCounts,
} from "../../../tests/support/item-master-fixture";

/**
 * Spec 006 AC-25 and AC-26: suppliers.
 */
beforeEach(async () => {
  await resetTestDb();
});

describe("listSuppliers and createSupplier", () => {
  it("AC-25: lists alphabetically with the number of items each supplies", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const kelly = await makeSupplier("Kelly");
    await makeSupplier("Amber");
    await makeItem({ description: "Beads", itemTypeId: typeId, supplierId: kelly });
    await makeItem({ description: "Thermo-P", itemTypeId: typeId, supplierId: kelly });

    const rows = await listSuppliers(ADMIN);

    expect(rows.map((row) => [row.name, row.itemCount])).toEqual([
      ["Amber", 0],
      ["Kelly", 2],
    ]);
  });

  it("AC-25: a trimmed, unique name is created", async () => {
    const created = await createSupplier(ADMIN, { name: "  Kestrel " });

    expect(created.name).toBe("Kestrel");
    expect(created.active).toBe(true);
    expect(await db.supplier.count()).toBe(1);
  });

  it("AC-25: a duplicate in any case is refused and nothing is written", async () => {
    await createSupplier(ADMIN, { name: "Kelly" });

    const error = await createSupplier(ADMIN, { name: "kelly" }).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(supplierNameAlreadyExists("Kelly"));
    expect(await db.supplier.count()).toBe(1);
  });

  it("AC-25 failure path: an empty or whitespace-only name raises ValidationError on name", async () => {
    for (const name of ["", "   "]) {
      const error = await createSupplier(ADMIN, { name }).catch((thrown) => thrown);
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("name");
    }

    expect(await db.supplier.count()).toBe(0);
  });
});

describe("renameSupplier and setSupplierActive", () => {
  it("AC-25: renaming changes every item's displayed supplier without touching Item", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const supplierId = await makeSupplier("Kellys");
    const itemId = await makeItem({
      description: "Beads",
      itemTypeId: typeId,
      supplierId,
    });
    const before = await db.item.findUniqueOrThrow({ where: { id: itemId } });

    await renameSupplier(ADMIN, supplierId, { name: "Kelly" });

    expect(await db.item.findUniqueOrThrow({ where: { id: itemId } })).toEqual(before);
    expect((await getItem(ADMIN, itemId)).supplierName).toBe("Kelly");
  });

  it("AC-25: archiving hides a supplier from the choices but not from the item that names it", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const supplierId = await makeSupplier("Kelly");
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId, supplierId });

    await setSupplierActive(ADMIN, supplierId, false);

    // Not offered for a NEW choice ...
    expect(await listSuppliers(ADMIN)).toEqual([]);
    // ... but still shown, marked, on the item that already references it, and the
    // foreign key is unchanged.
    const detail = await getItem(ADMIN, itemId);
    expect(detail.supplierId).toBe(supplierId);
    expect(detail.supplierName).toBe("Kelly");
    expect(detail.supplierActive).toBe(false);

    // Visible under "Show archived", and restoring returns it to the selection list.
    expect((await listSuppliers(ADMIN, { includeArchived: true })).map((row) => row.name)).toEqual([
      "Kelly",
    ]);
    await setSupplierActive(ADMIN, supplierId, true);
    expect((await listSuppliers(ADMIN)).map((row) => row.name)).toEqual(["Kelly"]);
  });

  it("AC-25 failure path: renaming onto another supplier's name is refused", async () => {
    await makeSupplier("Kelly");
    const kestrel = await makeSupplier("Kestrel");

    await expect(renameSupplier(ADMIN, kestrel, { name: "KELLY" })).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect((await db.supplier.findUniqueOrThrow({ where: { id: kestrel } })).name).toBe("Kestrel");
  });

  it("AC-25: renaming a supplier to its own name in a new case is not a conflict", async () => {
    const kelly = await makeSupplier("kelly");

    await renameSupplier(ADMIN, kelly, { name: "Kelly" });

    expect((await db.supplier.findUniqueOrThrow({ where: { id: kelly } })).name).toBe("Kelly");
  });
});

describe("deleteSupplier", () => {
  it("AC-26: a supplier with items is refused, readably, and everything survives", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const supplierId = await makeSupplier("Kelly");
    for (const description of ["Beads", "Thermo-P", "MultiGrip"]) {
      await makeItem({ description, itemTypeId: typeId, supplierId });
    }

    const error = await deleteSupplier(ADMIN, supplierId).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(supplierHasItems("Kelly", 3));
    for (const forbidden of [
      "violates RESTRICT setting of foreign key constraint",
      "23001",
      "PrismaClientUnknownRequestError",
    ]) {
      expect((error as ConflictError).message).not.toContain(forbidden);
    }
    expect(await db.supplier.count()).toBe(1);
    expect(await db.item.count()).toBe(3);
  });

  it("AC-26: a supplier with no items is deleted", async () => {
    const supplierId = await makeSupplier("Amber");

    await deleteSupplier(ADMIN, supplierId);

    expect(await db.supplier.count()).toBe(0);
  });

  it("AC-26 failure path: an unknown supplier id is a NotFoundError", async () => {
    await expect(deleteSupplier(ADMIN, "supplier_missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("AC-4: every supplier mutation refuses a YARD_STAFF actor and writes nothing", async () => {
    const supplierId = await makeSupplier("Kelly");
    const before = await tableCounts();
    const staff = { ...ADMIN, role: "YARD_STAFF" } as const;

    await expect(createSupplier(staff, { name: "Kestrel" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createSupplier(staff, { name: "Kestrel" })).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(renameSupplier(staff, supplierId, { name: "Kestrel" })).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(setSupplierActive(staff, supplierId, false)).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(deleteSupplier(staff, supplierId)).rejects.toThrow(
      "ADMIN is required for this action",
    );

    expect(await tableCounts()).toEqual(before);
    expect((await db.supplier.findUniqueOrThrow({ where: { id: supplierId } })).name).toBe("Kelly");
  });
});
