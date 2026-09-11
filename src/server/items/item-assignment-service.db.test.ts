import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import {
  assignItemToLocation,
  listSheet,
  moveItemInSheet,
  unassignItemFromLocation,
} from "@/server/items/item-assignment-service";
import { setItemActive } from "@/server/items/item-service";
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
  makeItemsBulk,
  makeLinksBulk,
  makeSupplier,
  fixtureId,
  sortOrdersAt,
} from "../../../tests/support/item-master-fixture";

/**
 * Spec 006 AC-21 to AC-24: assignment, unassignment and the sheet order.
 */
beforeEach(async () => {
  await resetTestDb();
});

/**
 * Dublin as #5 imported it: links at `sortOrder` 3 to 84, which is why a new assignment
 * lands at 85 and not at 1 (AC-21).
 */
async function dublinSheet(count: number, firstSortOrder = 3): Promise<string[]> {
  const typeId = await makeItemType("BEADS", 1);
  const supplierId = await makeSupplier("Kelly");
  const ids = Array.from({ length: count }, (_, index) => fixtureId("item_dub", index));

  await makeItemsBulk(
    ids.map((id, index) => ({
      id,
      description: `Item ${String(index).padStart(3, "0")}`,
      itemTypeId: typeId,
      supplierId,
      unitLabel: "20 Kg",
    })),
  );
  await makeLinksBulk(
    ids.map((id, index) => ({
      itemId: id,
      locationId: DUBLIN_ID,
      sortOrder: firstSortOrder + index,
    })),
  );

  return ids;
}

describe("assignItemToLocation", () => {
  it("AC-21: a new assignment takes max + 1 and lands last on the sheet", async () => {
    const existing = await dublinSheet(82); // sortOrder 3..84
    expect(await sortOrdersAt(DUBLIN_ID)).toHaveLength(82);
    const newcomer = await makeItem({
      description: "Zzz newcomer",
      itemTypeId: (await db.itemType.findFirstOrThrow()).id,
    });

    await assignItemToLocation(ADMIN, newcomer, "DUBLIN");

    const link = await db.itemLocation.findFirstOrThrow({
      where: { itemId: newcomer, locationId: DUBLIN_ID },
    });
    expect(link.sortOrder).toBe(85);
    expect(link.active).toBe(true);

    const sheet = await listSheet(ADMIN, "DUBLIN");
    expect(sheet).toHaveLength(83);
    expect(sheet[sheet.length - 1].itemId).toBe(newcomer);
    expect(existing).toHaveLength(82);
  });

  it("AC-21: max + 1 counts inactive links too, so an unassigned number is not reused", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const parked = await makeItem({ description: "Parked", itemTypeId: typeId });
    await makeLink(parked, DUBLIN_ID, 40, false);
    const newcomer = await makeItem({ description: "Newcomer", itemTypeId: typeId });

    await assignItemToLocation(ADMIN, newcomer, "DUBLIN");

    const link = await db.itemLocation.findFirstOrThrow({ where: { itemId: newcomer } });
    expect(link.sortOrder).toBe(41);
  });

  it("AC-21, AC-22: assigning an item with an inactive link reactivates that same row", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId });
    const linkId = await makeLink(itemId, DUBLIN_ID, 12);
    const rowsBefore = await db.itemLocation.count();

    await unassignItemFromLocation(ADMIN, itemId, "DUBLIN");
    await assignItemToLocation(ADMIN, itemId, "DUBLIN");

    const link = await db.itemLocation.findUniqueOrThrow({ where: { id: linkId } });
    expect(link.sortOrder).toBe(12);
    expect(link.active).toBe(true);
    expect(await db.itemLocation.count()).toBe(rowsBefore);
  });

  it("AC-21: assigning an already-assigned item is a no-op with no error and no row", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId });
    await makeLink(itemId, DUBLIN_ID, 12);

    await assignItemToLocation(ADMIN, itemId, "DUBLIN");
    await assignItemToLocation(ADMIN, itemId, "DUBLIN");

    expect(await db.itemLocation.count()).toBe(1);
    expect((await db.itemLocation.findFirstOrThrow()).sortOrder).toBe(12);
  });

  it("AC-21 failure path: an unknown yard code is a NotFoundError naming the code", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId });

    const error = await assignItemToLocation(ADMIN, itemId, "CORK").catch((thrown) => thrown);

    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).message).toContain("CORK");
    expect(await db.itemLocation.count()).toBe(0);
  });
});

describe("unassignItemFromLocation", () => {
  it("AC-22: deactivates the row, keeps its id, sortOrder and every count line", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId });
    const dublinLink = await makeLink(itemId, DUBLIN_ID, 12);
    const clonmelLink = await makeLink(itemId, CLONMEL_ID, 30);
    const { lineId } = await makeCountLine(itemId);
    const lineBefore = await db.stockCountLine.findUniqueOrThrow({ where: { id: lineId } });
    const rowsBefore = await db.itemLocation.count();

    await unassignItemFromLocation(ADMIN, itemId, "DUBLIN");

    const link = await db.itemLocation.findUniqueOrThrow({ where: { id: dublinLink } });
    expect(link.id).toBe(dublinLink);
    expect(link.sortOrder).toBe(12);
    expect(link.active).toBe(false);
    expect(await db.itemLocation.count()).toBe(rowsBefore);

    // The other yard is untouched, and so is history.
    expect((await db.itemLocation.findUniqueOrThrow({ where: { id: clonmelLink } })).active).toBe(
      true,
    );
    expect(await db.stockCountLine.findUniqueOrThrow({ where: { id: lineId } })).toEqual(
      lineBefore,
    );

    expect((await listSheet(ADMIN, "DUBLIN")).map((entry) => entry.itemId)).toEqual([]);
    expect((await listSheet(ADMIN, "CLONMEL")).map((entry) => entry.itemId)).toEqual([itemId]);
  });

  it("AC-22 failure path: unassigning an item that was never assigned is a NotFoundError", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId });

    await expect(unassignItemFromLocation(ADMIN, itemId, "DUBLIN")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("moveItemInSheet", () => {
  it("AC-23: a move is a swap and the multiset of sortOrder values never changes", async () => {
    // Clonmel as #5 imported it: 3..70, then nothing at 71..74, then 75 and 76 - the gap
    // records that the two fuel rows sit below the total row (005 open question 4).
    const typeId = await makeItemType("BEADS", 1);
    const orders = [
      ...Array.from({ length: 68 }, (_, index) => index + 3), // 3..70
      75,
      76,
    ];
    const itemIdByOrder = new Map<number, string>(
      orders.map((sortOrder) => [sortOrder, fixtureId("item_clon", sortOrder)]),
    );

    await makeItemsBulk(
      orders.map((sortOrder) => ({
        id: fixtureId("item_clon", sortOrder),
        description: `Row ${String(sortOrder).padStart(3, "0")}`,
        itemTypeId: typeId,
      })),
    );
    await makeLinksBulk(
      orders.map((sortOrder) => ({
        itemId: fixtureId("item_clon", sortOrder),
        locationId: CLONMEL_ID,
        sortOrder,
      })),
    );

    const before = await sortOrdersAt(CLONMEL_ID);
    expect(before).toEqual([...orders].sort((left, right) => left - right));

    const mover = itemIdByOrder.get(75) as string;
    await moveItemInSheet(ADMIN, mover, "CLONMEL", "UP");

    // The row that was at 75 is now at 70, and the row that was at 70 is now at 75.
    expect(
      (await db.itemLocation.findFirstOrThrow({ where: { itemId: mover } })).sortOrder,
    ).toBe(70);
    expect(
      (
        await db.itemLocation.findFirstOrThrow({
          where: { itemId: itemIdByOrder.get(70) as string },
        })
      ).sortOrder,
    ).toBe(75);

    // Both values still exist, and 71..74 is still a gap: nothing was renumbered.
    expect(await sortOrdersAt(CLONMEL_ID)).toEqual(before);

    await moveItemInSheet(ADMIN, mover, "CLONMEL", "DOWN");
    await moveItemInSheet(ADMIN, mover, "CLONMEL", "DOWN");
    await moveItemInSheet(ADMIN, mover, "CLONMEL", "UP");

    expect(await sortOrdersAt(CLONMEL_ID)).toEqual(before);
  });

  it("AC-23: UP on the first row and DOWN on the last write nothing at all", async () => {
    const ids = await dublinSheet(3, 3);
    const before = await db.itemLocation.findMany({ orderBy: { sortOrder: "asc" } });

    await moveItemInSheet(ADMIN, ids[0], "DUBLIN", "UP");
    await moveItemInSheet(ADMIN, ids[2], "DUBLIN", "DOWN");

    expect(await db.itemLocation.findMany({ orderBy: { sortOrder: "asc" } })).toEqual(before);
  });

  it("AC-23 failure path: an item that is not on the sheet cannot be moved", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId });

    await expect(moveItemInSheet(ADMIN, itemId, "DUBLIN", "UP")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("listSheet", () => {
  it("AC-24: active links of active items only, ordered by sortOrder then description", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const supplierId = await makeSupplier("Kelly");
    const ids = Array.from({ length: 84 }, (_, index) => fixtureId("item_sheet", index));
    await makeItemsBulk(
      ids.map((id, index) => ({
        id,
        description: `Item ${String(index).padStart(3, "0")}`,
        itemTypeId: typeId,
        supplierId,
        unitLabel: "20 Kg",
      })),
    );
    await makeLinksBulk(
      ids.map((id, index) => ({ itemId: id, locationId: DUBLIN_ID, sortOrder: index + 3 })),
    );
    await makePrice(ids[0], "33.09000000", "2025-01-01");

    // One archived item and one unassigned link: 84 links, 82 on the sheet.
    await setItemActive(ADMIN, ids[10], false);
    await unassignItemFromLocation(ADMIN, ids[20], "DUBLIN");

    const sheet = await listSheet(ADMIN, "DUBLIN");
    const withArchived = await listSheet(ADMIN, "DUBLIN", { includeArchived: true });

    expect(sheet).toHaveLength(82);
    expect(withArchived).toHaveLength(84);
    expect(sheet.map((entry) => entry.sortOrder)).toEqual(
      [...sheet.map((entry) => entry.sortOrder)].sort((left, right) => left - right),
    );
    expect(sheet[0].sortOrder).toBe(3);
    expect(sheet[0].currentPrice?.unitPrice).toBe("33.09");
    expect(sheet[0].unitLabel).toBe("20 Kg");

    const marked = new Map(withArchived.map((entry) => [entry.itemId, entry]));
    expect(marked.get(ids[10])?.itemActive).toBe(false);
    expect(marked.get(ids[10])?.linkActive).toBe(true);
    expect(marked.get(ids[20])?.linkActive).toBe(false);
    expect(marked.get(ids[20])?.itemActive).toBe(true);
  });

  it("AC-24: a tie on sortOrder is broken by description, so two loads read the same", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const bravo = await makeItem({ description: "Bravo", itemTypeId: typeId });
    const alpha = await makeItem({ description: "Alpha", itemTypeId: typeId });
    await makeLink(bravo, DUBLIN_ID, 7);
    await makeLink(alpha, DUBLIN_ID, 7);

    expect((await listSheet(ADMIN, "DUBLIN")).map((entry) => entry.description)).toEqual([
      "Alpha",
      "Bravo",
    ]);
  });

  it("AC-28: a yard with no assignments returns an empty sheet rather than throwing", async () => {
    expect(await listSheet(ADMIN, "CLONMEL")).toEqual([]);
  });

  it("AC-4: every assignment mutation refuses a YARD_STAFF actor and writes nothing", async () => {
    const typeId = await makeItemType("BEADS", 1);
    const itemId = await makeItem({ description: "Beads", itemTypeId: typeId });
    await makeLink(itemId, DUBLIN_ID, 3);
    const before = await db.itemLocation.findMany();
    const staff = { ...ADMIN, role: "YARD_STAFF" } as const;

    await expect(assignItemToLocation(staff, itemId, "CLONMEL")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(assignItemToLocation(staff, itemId, "CLONMEL")).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(unassignItemFromLocation(staff, itemId, "DUBLIN")).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(moveItemInSheet(staff, itemId, "DUBLIN", "UP")).rejects.toThrow(
      "ADMIN is required for this action",
    );
    await expect(listSheet(staff, "DUBLIN")).rejects.toThrow(
      "ADMIN is required for this action",
    );

    expect(await db.itemLocation.findMany()).toEqual(before);
  });
});
