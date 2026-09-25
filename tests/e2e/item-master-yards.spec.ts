import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { db } from "@/server/db";

import { MOVED, noItemsAssigned } from "@/lib/item-master-messages";

import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  cleanUp,
  newLedger,
  seedItem,
  seedItemType,
  seedSupplier,
  seededMasterCounts,
  uniqueName,
} from "./support/item-master";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 006 AC-21 to AC-28: yard assignment, sheet order, suppliers and item types.
 *
 * The sheet fixtures sit at `sortOrder` 800+, well past the 3-84 the importer wrote, so a
 * move here can never disturb a real row's position — and the multiset assertion is made
 * over this run's own rows for the same reason.
 *
 * The other half of that promise - that a move of this run's rows can only swap them WITH
 * EACH OTHER - is a fact about the whole table, because both move services swap with the
 * neighbouring row among every row there. So it is checked before and after every move
 * (`expectSheetRowsAlone`, `expectTypePairAlone`), and a stranger in the band fails there,
 * by name, instead of as a number that came out wrong.
 */
const ledger = newLedger();
const created: string[] = [];

let before: Awaited<ReturnType<typeof seededMasterCounts>>;
let supplierId = "";
let supplierName = "";
let itemTypeId = "";
let sheetItems: { id: string; description: string }[] = [];
let unassignedItem = { id: "", description: "" };
let lowerType = { id: "", code: "", sortOrder: 0 };
let upperType = { id: "", code: "", sortOrder: 0 };

/**
 * Where this worker's pair of item types starts, far above the 19 the importer wrote.
 * `parallelIndex` is stable for the life of a worker and two workers never share one, so
 * two files running at once cannot reorder each other's rows (AC-34).
 *
 * Only the pair's own two numbers are reserved, not all ten. A type seeded at "the
 * greatest plus one" while the pair exists lands ABOVE it - this file's own *Fresh Type*
 * lands at `band + 2` - and a move of the pair never reaches that far.
 */
function typeBand(parallelIndex: number): number {
  return 9000 + parallelIndex * 10;
}

/** The Clonmel positions this file's three rows are seeded at: a gap on purpose (AC-23). */
const SHEET_POSITIONS = [801, 802, 805];

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.beforeAll(async () => {
  if (!(await databaseIsReachable())) return;

  before = await seededMasterCounts();

  const supplier = await seedSupplier(ledger, "Yard Supplier");
  supplierId = supplier.id;
  supplierName = supplier.name;
  const itemType = await seedItemType(ledger, "Yard Type");
  itemTypeId = itemType.id;

  // Two types this run owns, at two CONSECUTIVE positions, so "move the upper one up"
  // swaps it with the lower one - as long as nothing else holds either number, which
  // `expectTypePairAlone` checks at every move rather than assuming.
  //
  // The UPPER one is created first, and deliberately. The other item-master files seed
  // their types at "the greatest plus one" in their own `beforeAll`, at the same moment
  // this one runs. Created lower-first, a seed that read the greatest while only the
  // lower one existed would land on the upper one's number. Created upper-first, the
  // greatest is already `band + 1` before `band` is taken, so such a seed lands above.
  const band = typeBand(test.info().parallelIndex);
  const upper = await seedItemType(ledger, "Upper Type", band + 1);
  const lower = await seedItemType(ledger, "Lower Type", band);
  lowerType = { id: lower.id, code: lower.code, sortOrder: lower.sortOrder };
  upperType = { id: upper.id, code: upper.code, sortOrder: upper.sortOrder };

  // Three rows at 801, 802 and 805 - a gap on purpose, and it must survive (AC-23).
  sheetItems = [];
  for (const [index, sortOrder] of SHEET_POSITIONS.entries()) {
    sheetItems.push(
      await seedItem(ledger, {
        base: `Clonmel Row ${index}`,
        itemTypeId,
        supplierId,
        unitLabel: "20 Kg",
        price: { amount: "6.11764706", effectiveFrom: "2025-01-01", label: null },
        yards: [{ code: "CLONMEL", sortOrder }],
      }),
    );
  }

  unassignedItem = await seedItem(ledger, {
    base: "Not On A Sheet",
    itemTypeId,
    supplierId,
    unitLabel: "20 Kg",
  });
});

test.afterAll(async () => {
  if (!(await databaseIsReachable())) return;

  for (const email of created.splice(0)) {
    await removeUser(email);
  }
  await cleanUp(ledger);

  expect(await seededMasterCounts()).toEqual(before);
});

async function admin(): Promise<TestUser> {
  const user = await createTestUser("ADMIN", "item-master-yard");
  created.push(user.email);
  return user;
}

/**
 * One move, and the wait for THAT move to finish before anything is asserted or clicked.
 *
 * Every move redirects to the same `?done=moved`, so on a page that already says *Moved.*
 * neither the URL nor the notice can tell a second move from the first. The wait used to
 * be the rendered number under the 10-second `expect` clock, and a trace shows what that
 * clock had to cover: the action's POST, and then - before the number changes on screen -
 * the redirect's own client navigation, usually a second request to the server. On a slow
 * branch the two did not fit: reproduced once in ten runs of the project on 2026-09-23, at
 * the third move of the sheet test, where the swap had reached the database and the
 * screen still showed the old number.
 *
 * So a move starts from a page with no outcome on it, and has finished when the URL
 * carries its outcome - the action has run and committed and the router has taken its
 * answer. That is a signal, not a clock: no timeout is raised, and like every `waitForURL`
 * in this suite it is bounded by the test's own limit. A refusal fails here in the
 * service's own words, rather than as a number that never changed.
 */
async function move(page: Page, control: Locator): Promise<void> {
  const current = new URL(page.url());
  if (current.search !== "") await page.goto(current.pathname);

  await control.click();
  await page.waitForURL(/[?&](done|error)=/);
  expect(new URL(page.url()).searchParams.get("error"), "the move was refused").toBeNull();
  await expect(page.getByTestId("item-master-done")).toHaveText(MOVED);
}

/** The number a row shows, asserted once its move has finished. */
async function expectRenderedOrder(row: Locator, testId: string, sortOrder: number): Promise<void> {
  await expect(row.getByTestId(testId)).toHaveText(String(sortOrder));
}

function describeType(type: { code: string; name: string; sortOrder: number }): string {
  return `${type.code} "${type.name}" at sortOrder ${type.sortOrder}`;
}

/**
 * The type pair can only swap with each other - checked, not assumed.
 *
 * `moveItemType` swaps a type with its neighbour among EVERY item type in the database,
 * ordered by `sortOrder` and then `code`, not with "the other one of the pair". So the
 * pair must be adjacent in that order, and no other type may hold either of their two
 * numbers: a stranger sharing a number can come between them on the next move even when
 * it does not now. On 2026-09-14 leftover rows at 9001 did exactly that, and the failure
 * read as a `sortOrder` that came out wrong. It now reads as the stranger's code and name.
 */
async function expectTypePairAlone(): Promise<void> {
  const low = Math.min(lowerType.sortOrder, upperType.sortOrder);
  const high = Math.max(lowerType.sortOrder, upperType.sortOrder);
  const ours = new Set([lowerType.id, upperType.id]);
  const ordered = await db.itemType.findMany({
    select: { id: true, code: true, name: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });

  const strangers = ordered.filter(
    (type) => !ours.has(type.id) && type.sortOrder >= low && type.sortOrder <= high,
  );
  expect(
    strangers.map(describeType),
    `another item type holds this run's reorder band ${low}-${high}, so a move could swap with it`,
  ).toEqual([]);

  const positions = ordered.flatMap((type, index) => (ours.has(type.id) ? [index] : []));
  expect(positions, "both reserved item types still exist").toHaveLength(2);
  expect(
    ordered.slice(positions[0] + 1, positions[1]).map(describeType),
    "the two reserved item types are not adjacent in moveItemType's order; between them",
  ).toEqual([]);
}

/**
 * The same promise for the three Clonmel rows.
 *
 * `moveItemInSheet` swaps with the neighbour among every ACTIVE link of an ACTIVE item on
 * the sheet, ordered by `sortOrder` and then description - so this reads the sheet through
 * exactly that filter and that order. An unassigned link or an archived item is not a
 * neighbour, and is not reported.
 */
async function expectSheetRowsAlone(): Promise<void> {
  const low = Math.min(...SHEET_POSITIONS);
  const high = Math.max(...SHEET_POSITIONS);
  const ours = new Set(sheetItems.map((item) => item.id));
  const links = await db.itemLocation.findMany({
    where: { location: { code: "CLONMEL" }, active: true, item: { active: true } },
    select: { itemId: true, sortOrder: true, item: { select: { description: true } } },
  });
  const ordered = links.sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.item.description.localeCompare(right.item.description),
  );
  const describeLink = (link: (typeof ordered)[number]): string =>
    `"${link.item.description}" (item ${link.itemId}) at sortOrder ${link.sortOrder}`;

  const strangers = ordered.filter(
    (link) => !ours.has(link.itemId) && link.sortOrder >= low && link.sortOrder <= high,
  );
  expect(
    strangers.map(describeLink),
    `another Clonmel row sits in this run's sheet band ${low}-${high}, so a move could swap with it`,
  ).toEqual([]);

  const positions = ordered.flatMap((link, index) => (ours.has(link.itemId) ? [index] : []));
  expect(positions, "all three seeded rows are still on the Clonmel sheet").toHaveLength(3);
  expect(
    ordered
      .slice(positions[0], positions[positions.length - 1] + 1)
      .filter((link) => !ours.has(link.itemId))
      .map(describeLink),
    "the three seeded rows are not contiguous in moveItemInSheet's order; among them",
  ).toEqual([]);
}

/** The multiset of this run's `sortOrder` values at Clonmel. */
async function ourSortOrders(): Promise<number[]> {
  const links = await db.itemLocation.findMany({
    where: { itemId: { in: sheetItems.map((item) => item.id) } },
    select: { sortOrder: true },
  });
  return links.map((link) => link.sortOrder).sort((left, right) => left - right);
}

test("AC-21, AC-22: assigning puts an item last, unassigning keeps its place", async ({
  page,
}) => {
  await signIn(page, await admin());

  const highestBefore = await db.itemLocation.aggregate({
    where: { location: { code: "CLONMEL" } },
    _max: { sortOrder: true },
  });

  await page.goto(`/item-master/items/${unassignedItem.id}`);
  await expect(page.getByTestId("yard-state-CLONMEL")).toHaveText("Not assigned");
  await page.getByTestId("assign-CLONMEL").click();
  await page.waitForURL(/\?done=assigned/);

  const link = await db.itemLocation.findFirstOrThrow({
    where: { itemId: unassignedItem.id, location: { code: "CLONMEL" } },
  });
  expect(link.sortOrder).toBe((highestBefore._max.sortOrder ?? 0) + 1);
  expect(link.active).toBe(true);
  await expect(page.getByTestId("yard-state-CLONMEL")).toHaveText(
    `Assigned, position ${link.sortOrder}`,
  );

  // Unassigning deactivates the row rather than deleting it: the place survives. The
  // count is of THIS item's links, not of the table: another spec file is running in
  // another worker and creating links of its own.
  const rowsBefore = await db.itemLocation.count({ where: { itemId: unassignedItem.id } });
  await page.getByTestId("unassign-CLONMEL").click();
  await page.waitForURL(/\?done=unassigned/);

  const after = await db.itemLocation.findUniqueOrThrow({ where: { id: link.id } });
  expect(after.id).toBe(link.id);
  expect(after.sortOrder).toBe(link.sortOrder);
  expect(after.active).toBe(false);
  expect(await db.itemLocation.count({ where: { itemId: unassignedItem.id } })).toBe(rowsBefore);

  // Re-assigning restores exactly the position it held.
  await page.getByTestId("assign-CLONMEL").click();
  await page.waitForURL(/\?done=assigned/);
  await expect(page.getByTestId("yard-state-CLONMEL")).toHaveText(
    `Assigned, position ${link.sortOrder}`,
  );
  expect(await db.itemLocation.count({ where: { itemId: unassignedItem.id } })).toBe(rowsBefore);

  // Leave the fixture as the other tests expect it.
  await page.getByTestId("unassign-CLONMEL").click();
  await page.waitForURL(/\?done=unassigned/);
});

test("AC-23, AC-24: the sheet shows sortOrder, and a move is a swap that keeps the gaps", async ({
  page,
}) => {
  await signIn(page, await admin());
  const beforeMoves = await ourSortOrders();
  expect(beforeMoves).toEqual(SHEET_POSITIONS);
  await expectSheetRowsAlone();

  await page.goto("/item-master/yards/CLONMEL");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Clonmel sheet");

  const lastRow = page.locator(`[data-item-id="${sheetItems[2].id}"]`);
  await expect(lastRow.getByTestId("sheet-sort-order")).toHaveText("805");
  // The price is rendered exactly, with every digit the workbook formula produced.
  await expect(lastRow).toContainText("€6.11764706");

  await move(page, lastRow.getByTestId(`move-up-${sheetItems[2].id}`));
  await expectSheetRowsAlone();
  await expectRenderedOrder(lastRow, "sheet-sort-order", 802);

  // The two rows exchanged their numbers; nothing was renumbered.
  expect(
    (await db.itemLocation.findFirstOrThrow({ where: { itemId: sheetItems[2].id } })).sortOrder,
  ).toBe(802);
  expect(
    (await db.itemLocation.findFirstOrThrow({ where: { itemId: sheetItems[1].id } })).sortOrder,
  ).toBe(805);
  expect(await ourSortOrders()).toEqual(beforeMoves);

  // A sequence of moves leaves the multiset identical, which is the whole assertion.
  const secondRow = page.locator(`[data-item-id="${sheetItems[2].id}"]`);
  await move(page, secondRow.getByRole("button", { name: "Move down" }));
  await expectSheetRowsAlone();
  await expectRenderedOrder(secondRow, "sheet-sort-order", 805);

  const firstRow = page.locator(`[data-item-id="${sheetItems[0].id}"]`);
  await move(page, firstRow.getByRole("button", { name: "Move down" }));
  await expectSheetRowsAlone();
  await expectRenderedOrder(firstRow, "sheet-sort-order", 802);

  expect(await ourSortOrders()).toEqual(beforeMoves);
});

test("AC-23: the first row has no Move up and the last has no Move down", async ({ page }) => {
  await signIn(page, await admin());

  await page.goto("/item-master/yards/CLONMEL");
  const rows = page.getByTestId("sheet-row");
  const count = await rows.count();
  expect(count).toBeGreaterThan(1);

  await expect(rows.first().getByRole("button", { name: "Move up" })).toHaveCount(0);
  await expect(rows.first().getByRole("button", { name: "Move down" })).toHaveCount(1);
  await expect(rows.nth(count - 1).getByRole("button", { name: "Move down" })).toHaveCount(0);
  await expect(rows.nth(count - 1).getByRole("button", { name: "Move up" })).toHaveCount(1);
});

test("AC-28: a yard with nothing assigned says so", async ({ page }) => {
  await signIn(page, await admin());

  // The sentence itself is single-sourced and asserted from the module (AC-28).
  expect(noItemsAssigned("Dublin")).toBe("No items are assigned to Dublin yet.");

  // Emptying Dublin to see it rendered would mean deleting the user's 82 links, which
  // AC-34 forbids - `item-assignment-service.db.test.ts` proves the empty sheet against a
  // database this suite is allowed to empty. What IS proved here is that the yard page
  // renders one of its two states and never neither.
  await page.goto("/item-master/yards/DUBLIN");
  await expect(page.getByTestId("sheet-table").or(page.getByTestId("sheet-empty"))).toBeVisible();
});

test("AC-25, AC-26, AC-29: suppliers are created, renamed, archived and refused readably", async ({
  page,
}) => {
  await signIn(page, await admin());
  const newName = uniqueName("New Supplier");

  await page.goto("/item-master/suppliers");
  await page.getByLabel("Supplier name", { exact: true }).fill(newName);
  await page.getByTestId("create-supplier").click();
  await page.waitForURL(/\?done=supplier-saved/);
  await expect(page.getByTestId("item-master-done")).toHaveText("Supplier saved.");

  const created1 = await db.supplier.findFirstOrThrow({ where: { name: newName } });

  // A duplicate in any case is refused, beside the input.
  await page.getByLabel("Supplier name", { exact: true }).fill(newName.toUpperCase());
  await page.getByTestId("create-supplier").click();
  await expect(page.getByTestId("supplier-name-error")).toContainText("already exists");

  // An empty name is a ValidationError on the same field.
  await page.getByLabel("Supplier name", { exact: true }).fill("   ");
  await page.getByTestId("create-supplier").click();
  await expect(page.getByTestId("supplier-name-error")).toHaveText("Supplier name is required.");

  // Deleting a supplier that supplies items is refused in the service's own words.
  await page.goto("/item-master/suppliers");
  await page.getByTestId(`delete-supplier-${supplierId}`).click();
  await page.waitForURL(/\?error=/);
  await expect(page.getByTestId("item-master-error")).toContainText(
    `${supplierName} supplies`,
  );
  await expect(page.getByTestId("item-master-error")).toContainText(
    "and cannot be deleted. Archive it instead.",
  );

  const html = await page.content();
  for (const forbidden of [
    "violates RESTRICT setting of foreign key constraint",
    "23001",
    "PrismaClientUnknownRequestError",
  ]) {
    expect(html, forbidden).not.toContain(forbidden);
  }
  expect(await db.supplier.count({ where: { id: supplierId } })).toBe(1);

  // A supplier with no items is deleted.
  await page.getByTestId(`delete-supplier-${created1.id}`).click();
  await page.waitForURL(/\?done=deleted/);
  expect(await db.supplier.count({ where: { id: created1.id } })).toBe(0);
});

test("AC-25: archiving a supplier leaves the item that names it unchanged and marked", async ({
  page,
}) => {
  await signIn(page, await admin());
  const supplier = await seedSupplier(ledger, "Archivable Supplier");
  const item = await seedItem(ledger, {
    base: "Item Of An Archived Supplier",
    itemTypeId,
    supplierId: supplier.id,
    unitLabel: "20 Kg",
  });

  await page.goto("/item-master/suppliers");
  await page.getByTestId(`archive-supplier-${supplier.id}`).click();
  await page.waitForURL(/\?done=archived/);

  // Gone from the default list, present under Show archived.
  await expect(page.locator(`[data-supplier-name="${supplier.name}"]`)).toHaveCount(0);
  await page.getByTestId("toggle-archived-suppliers").click();
  await expect(page.locator(`[data-supplier-name="${supplier.name}"]`)).toHaveCount(1);

  // The item still names it, marked (archived), and its supplierId is unchanged.
  expect((await db.item.findUniqueOrThrow({ where: { id: item.id } })).supplierId).toBe(
    supplier.id,
  );
  await page.goto(`/item-master/items/${item.id}`);
  await expect(page.getByLabel("Supplier", { exact: true })).toHaveValue(supplier.id);
  await expect(page.getByLabel("Supplier", { exact: true })).toContainText(
    `${supplier.name} (archived)`,
  );

  // A NEW item is not offered it.
  await page.goto("/item-master/items/new");
  await expect(page.getByLabel("Supplier", { exact: true })).not.toContainText(supplier.name);

  // Restoring returns it to the selection list.
  await page.goto("/item-master/suppliers?archived=1");
  await page.getByTestId(`restore-supplier-${supplier.id}`).click();
  await page.waitForURL(/\?done=restored/);
  await page.goto("/item-master/items/new");
  await expect(page.getByLabel("Supplier", { exact: true })).toContainText(supplier.name);
});

test("AC-26, AC-27: item types are created, reordered and refused readably, and never archived", async ({
  page,
}) => {
  await signIn(page, await admin());

  await page.goto("/item-master/types");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Item types");
  // No archive control anywhere on the screen (AC-27).
  await expect(page.getByRole("button", { name: "Archive" })).toHaveCount(0);

  const code = uniqueName("Fresh Type").replace(/\s+/g, "_").toUpperCase();
  const highest = await db.itemType.aggregate({ _max: { sortOrder: true } });
  await page.getByLabel("New type code").fill(code);
  await page.getByLabel("New type name").fill(uniqueName("Fresh Type"));
  await page.getByTestId("create-type").click();
  await page.waitForURL(/\?done=type-saved/);

  const fresh = await db.itemType.findFirstOrThrow({ where: { code } });
  ledger.itemTypeIds.push(fresh.id);
  // "the next sortOrder after the greatest" (AC-27). Greater-than rather than equal to
  // `max + 1`, because another worker may have taken that number between the read above
  // and the click - and what the criterion is about is that a new type lands at the END.
  expect(fresh.sortOrder).toBeGreaterThan(highest._max.sortOrder ?? 0);

  // A duplicate code in any case is refused.
  await page.getByLabel("New type code").fill(code.toLowerCase());
  await page.getByLabel("New type name").fill(uniqueName("Fresh Type Again"));
  await page.getByTestId("create-type").click();
  await expect(page.getByTestId("type-form-error")).toContainText("already exists");

  // A move is a swap, and it is made between two types THIS RUN OWNS: reordering one of
  // the user's 19 imported types, even to put it back afterwards, is exactly what AC-34
  // forbids.
  await page.goto("/item-master/types");
  const pair = [lowerType.sortOrder, upperType.sortOrder];

  const upperRow = page.locator(`[data-type-code="${upperType.code}"]`);
  const lowerRow = page.locator(`[data-type-code="${lowerType.code}"]`);

  await expectTypePairAlone();
  await move(page, page.getByTestId(`move-type-up-${upperType.id}`));
  await expectTypePairAlone();
  await expectRenderedOrder(upperRow, "type-sort-order", lowerType.sortOrder);

  const movedUpper = await db.itemType.findUniqueOrThrow({ where: { id: upperType.id } });
  const movedLower = await db.itemType.findUniqueOrThrow({ where: { id: lowerType.id } });
  expect([movedLower.sortOrder, movedUpper.sortOrder].sort((l, r) => l - r)).toEqual(pair);
  expect(movedUpper.sortOrder).toBe(lowerType.sortOrder);
  expect(movedLower.sortOrder).toBe(upperType.sortOrder);

  // And back, under the same rule: the multiset never moves.
  await move(page, page.getByTestId(`move-type-down-${upperType.id}`));
  await expectTypePairAlone();
  await expectRenderedOrder(upperRow, "type-sort-order", upperType.sortOrder);
  await expectRenderedOrder(lowerRow, "type-sort-order", lowerType.sortOrder);

  expect((await db.itemType.findUniqueOrThrow({ where: { id: upperType.id } })).sortOrder).toBe(
    upperType.sortOrder,
  );
  expect((await db.itemType.findUniqueOrThrow({ where: { id: lowerType.id } })).sortOrder).toBe(
    lowerType.sortOrder,
  );

  // A type with items cannot be deleted, and says so without a Postgres word.
  await page.getByTestId(`delete-type-${itemTypeId}`).click();
  await page.waitForURL(/\?error=/);
  await expect(page.getByTestId("item-master-error")).toContainText("cannot be deleted");
  const html = await page.content();
  for (const forbidden of ["violates", "23001", "PrismaClientUnknownRequestError", "prisma"]) {
    expect(html, forbidden).not.toContain(forbidden);
  }

  // An unused one is deleted.
  await page.getByTestId(`delete-type-${fresh.id}`).click();
  await page.waitForURL(/\?done=deleted/);
  expect(await db.itemType.count({ where: { id: fresh.id } })).toBe(0);
});

test("AC-28: a submit control is disabled while pending, so a double click writes one row", async ({
  page,
}) => {
  await signIn(page, await admin());
  const description = uniqueName("Double Clicked");

  await page.goto("/item-master/items/new");
  await page.getByLabel("Description", { exact: true }).fill(description);
  await page.getByLabel("Type", { exact: true }).selectOption(itemTypeId);

  const submit = page.getByTestId("save-item");
  await submit.click();
  // The second click lands on a control the form has already disabled.
  await submit.click({ force: true, timeout: 2_000 }).catch(() => undefined);

  await page.waitForURL(/\/item-master\/items\/[^/]+\?done=saved/);
  expect(await db.item.count({ where: { description } })).toBe(1);
});
