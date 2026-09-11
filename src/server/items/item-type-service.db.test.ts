import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { itemTypeCodeAlreadyExists, itemTypeHasItems } from "@/lib/item-master-messages";
import { db } from "@/server/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/errors";
import {
  createItemType,
  deleteItemType,
  listItemTypes,
  moveItemType,
  updateItemType,
} from "@/server/items/item-type-service";
import { resetTestDb } from "@/server/test-db";

import {
  ADMIN,
  makeItem,
  makeItemType,
  tableCounts,
} from "../../../tests/support/item-master-fixture";

/**
 * Spec 006 AC-27: item types — created, renamed, reordered and deleted, and NEVER
 * archived, because Part 3 gives `ItemType` no `active` column and this feature adds no
 * migration.
 */
beforeEach(async () => {
  await resetTestDb();
});

/** The 19 types #5 imported, in `sortOrder`. */
async function nineteenTypes(): Promise<string[]> {
  const ids: string[] = [];
  for (let index = 0; index < 19; index += 1) {
    ids.push(await makeItemType(`TYPE_${String(index).padStart(2, "0")}`, index + 1));
  }
  return ids;
}

describe("listItemTypes and createItemType", () => {
  it("AC-27: lists in sortOrder with item counts, and a new type takes the next position", async () => {
    const ids = await nineteenTypes();
    await makeItem({ description: "Beads", itemTypeId: ids[0] });

    const before = await listItemTypes(ADMIN);
    expect(before).toHaveLength(19);
    expect(before.map((type) => type.sortOrder)).toEqual(
      Array.from({ length: 19 }, (_, index) => index + 1),
    );
    expect(before[0].itemCount).toBe(1);

    const created = await createItemType(ADMIN, { code: "NEW", name: "New group" });

    expect(created.sortOrder).toBe(20);
    expect(created.itemCount).toBe(0);
    expect((await listItemTypes(ADMIN)).at(-1)?.code).toBe("NEW");
  });

  it("AC-27: a duplicate code in any case is refused", async () => {
    await createItemType(ADMIN, { code: "BEADS", name: "Beads" });

    const error = await createItemType(ADMIN, { code: "beads", name: "Beads again" }).catch(
      (thrown) => thrown,
    );

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(itemTypeCodeAlreadyExists("BEADS"));
    expect(await db.itemType.count()).toBe(1);
  });

  it("AC-27 failure path: a blank code or name writes nothing", async () => {
    await expect(createItemType(ADMIN, { code: "  ", name: "Beads" })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(createItemType(ADMIN, { code: "BEADS", name: "" })).rejects.toBeInstanceOf(
      ValidationError,
    );

    expect(await db.itemType.count()).toBe(0);
  });

  it("AC-27: renaming keeps the position and the items", async () => {
    const typeId = await makeItemType("BEDS", 4, "Beds");
    await makeItem({ description: "Beads", itemTypeId: typeId });

    const renamed = await updateItemType(ADMIN, typeId, { code: "BEADS", name: "Beads" });

    expect(renamed.sortOrder).toBe(4);
    expect(renamed.itemCount).toBe(1);
    expect((await db.itemType.findUniqueOrThrow({ where: { id: typeId } })).code).toBe("BEADS");
  });
});

describe("moveItemType", () => {
  it("AC-27: a move is a swap under the same multiset rule as the yard sheet", async () => {
    // A gap on purpose: 1, 2, 7, 8. Nothing here may compact it.
    const first = await makeItemType("A", 1);
    const second = await makeItemType("B", 2);
    const third = await makeItemType("C", 7);
    await makeItemType("D", 8);

    const before = (await db.itemType.findMany({ select: { sortOrder: true } }))
      .map((type) => type.sortOrder)
      .sort((left, right) => left - right);

    await moveItemType(ADMIN, third, "UP");

    expect((await db.itemType.findUniqueOrThrow({ where: { id: third } })).sortOrder).toBe(2);
    expect((await db.itemType.findUniqueOrThrow({ where: { id: second } })).sortOrder).toBe(7);
    expect(
      (await db.itemType.findMany({ select: { sortOrder: true } }))
        .map((type) => type.sortOrder)
        .sort((left, right) => left - right),
    ).toEqual(before);

    // First up and last down write nothing at all.
    const snapshot = await db.itemType.findMany({ orderBy: { sortOrder: "asc" } });
    await moveItemType(ADMIN, first, "UP");
    expect(await db.itemType.findMany({ orderBy: { sortOrder: "asc" } })).toEqual(snapshot);
  });

  it("AC-27 failure path: a direction that is neither UP nor DOWN is refused", async () => {
    const typeId = await makeItemType("A", 1);

    await expect(moveItemType(ADMIN, typeId, "SIDEWAYS")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("deleteItemType", () => {
  it("AC-26, AC-27: a type with items is refused readably; an unused one is deleted", async () => {
    const used = await makeItemType("BEADS", 1, "Beads");
    const free = await makeItemType("SPARE", 2, "Spare");
    for (const description of ["Beads", "Thermo-P", "MultiGrip", "A-S"]) {
      await makeItem({ description, itemTypeId: used });
    }

    const error = await deleteItemType(ADMIN, used).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(itemTypeHasItems("Beads", 4));
    for (const forbidden of [
      "violates RESTRICT setting of foreign key constraint",
      "23001",
      "PrismaClientUnknownRequestError",
    ]) {
      expect((error as ConflictError).message).not.toContain(forbidden);
    }
    expect(await db.itemType.count()).toBe(2);
    expect(await db.item.count()).toBe(4);

    await deleteItemType(ADMIN, free);
    expect(await db.itemType.count()).toBe(1);
  });

  it("AC-27 failure path: an unknown type id is a NotFoundError", async () => {
    await expect(deleteItemType(ADMIN, "type_missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("AC-4: every item-type mutation refuses a YARD_STAFF actor and writes nothing", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const before = await tableCounts();
    const staff = { ...ADMIN, role: "YARD_STAFF" } as const;

    await expect(createItemType(staff, { code: "NEW", name: "New" })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(createItemType(staff, { code: "NEW", name: "New" })).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(updateItemType(staff, typeId, { code: "X", name: "X" })).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(moveItemType(staff, typeId, "UP")).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(deleteItemType(staff, typeId)).rejects.toThrow(
      "ADMIN is required for this action",
    );

    expect(await tableCounts()).toEqual(before);
  });
});

describe("AC-27: there is no archive for an item type, anywhere", () => {
  it("AC-27: the service exports nothing that deactivates a type", () => {
    const source = readFileSync("src/server/items/item-type-service.ts", "utf8");

    expect(source).toContain("export async function deleteItemType");
    expect(source).not.toContain("setItemTypeActive");
    // `ItemType` has no `active` column at all (Part 3), so a form field for one would
    // not compile - but the type FORM must not offer one either (AC-27).
    expect(source).not.toMatch(/itemType\.update\([^)]*active/s);
  });

  it("AC-27: the item-type screen renders no archive control and no active field", () => {
    const page = readFileSync("src/app/item-master/types/page.tsx", "utf8");
    const panel = readFileSync("src/components/item-master/ItemTypePanel.tsx", "utf8");

    for (const source of [page, panel]) {
      expect(source).not.toContain("Archive");
      expect(source).not.toContain("archiveItemType");
      expect(source).not.toMatch(/name="active"/);
    }
  });
});
