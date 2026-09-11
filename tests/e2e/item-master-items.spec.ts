import { expect, test } from "@playwright/test";

import { db } from "@/server/db";

import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  cleanUp,
  newLedger,
  seedCountLine,
  seedItem,
  seedItemType,
  seedSupplier,
  seededMasterCounts,
  uniqueName,
} from "./support/item-master";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 006 AC-6 to AC-20 and AC-28, AC-29 — through a real browser against a real
 * database, which is the only place the sentence "the new value is present on the freshly
 * rendered page" can be proved (docs/verification.md Level 4).
 *
 * Every row is this run's own and is removed in `afterAll`; nothing here touches a row it
 * did not create (AC-34).
 */
const ledger = newLedger();
const created: string[] = [];

let before: Awaited<ReturnType<typeof seededMasterCounts>>;
let supplierId = "";
let supplierName = "";
let secondSupplierId = "";
let itemTypeId = "";
let itemTypeName = "";
let pricedItem = { id: "", description: "" };
let flaggedItem = { id: "", description: "" };
let fuelItem = { id: "", description: "" };
let notedItem = { id: "", description: "" };
let referencedItem = { id: "", description: "" };
let deletableItem = { id: "", description: "" };

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.beforeAll(async () => {
  if (!(await databaseIsReachable())) return;

  before = await seededMasterCounts();

  const supplier = await seedSupplier(ledger, "Kelly");
  supplierId = supplier.id;
  supplierName = supplier.name;
  const second = await seedSupplier(ledger, "Kestrel");
  secondSupplierId = second.id;

  const itemType = await seedItemType(ledger, "Beads");
  itemTypeId = itemType.id;
  itemTypeName = itemType.name;

  pricedItem = await seedItem(ledger, {
    base: "Priced Beads",
    itemTypeId,
    supplierId,
    unitLabel: "20 Kg",
    price: { amount: "33.09", effectiveFrom: "2025-01-01", label: "2025 Prices" },
  });

  // Missing a supplier and a price: two outstanding reasons (AC-18, AC-19).
  flaggedItem = await seedItem(ledger, {
    base: "School Logo Triangle",
    itemTypeId,
    supplierId: null,
    unitLabel: "1 Unit",
    needsReview: true,
  });

  // Flagged for provenance and missing nothing: the below-total fuel row (AC-18).
  fuelItem = await seedItem(ledger, {
    base: "Diesel Below Total",
    itemTypeId,
    supplierId,
    unitLabel: "Ltrs",
    needsReview: true,
    notes: "Below the total row on Dublin!A61 - kept for provenance.",
    price: { amount: "1.15", effectiveFrom: "2025-01-01", label: "2025 Prices" },
  });

  // The cross-sheet conflict of 005 AC-14 (AC-20).
  notedItem = await seedItem(ledger, {
    base: "MMA Paints - Red",
    itemTypeId,
    supplierId,
    unitLabel: "1 Unit",
    notes: "Dublin!D50 says 1 Unit; 'Clonmel '!D64 says 16kg. Decide which is right.",
    price: { amount: "12.00", effectiveFrom: "2025-01-01", label: null },
  });

  referencedItem = await seedItem(ledger, {
    base: "Counted Beads",
    itemTypeId,
    supplierId,
    unitLabel: "20 Kg",
    price: { amount: "9.83", effectiveFrom: "2025-01-01", label: null },
  });
  await seedCountLine(ledger, referencedItem.id, 1);

  deletableItem = await seedItem(ledger, {
    base: "Disposable Beads",
    itemTypeId,
    supplierId,
    unitLabel: "20 Kg",
    price: { amount: "1.00", effectiveFrom: "2025-01-01", label: null },
    yards: [{ code: "DUBLIN", sortOrder: 910 }],
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
  const user = await createTestUser("ADMIN", "item-master-admin");
  created.push(user.email);
  return user;
}

test("AC-6, AC-17: the list finds an item by substring in any case, and the badges count", async ({
  page,
}) => {
  await signIn(page, await admin());
  await page.goto("/item-master");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Item master");
  // No pagination control: 140 items is one page, and a filter is a better answer.
  await expect(page.getByRole("link", { name: /next page/i })).toHaveCount(0);

  // ONE ROW PER ACTIVE ITEM, ALL OF THEM — measured, not inferred from the absence of a
  // page control (AC-6).
  //
  // The comparison is made WITHIN ONE PAGE LOAD, between the rendered rows and the
  // `Active` badge, because both come from the same `listItems` call and therefore from
  // the same snapshot. That is what makes it immune to the other two spec files creating
  // and deleting their own rows in parallel workers, and it is why the obvious shape -
  // comparing the row count to a fresh db.item.count() - was NOT used: two readings taken
  // at two moments against a database three workers are writing to is an intermittent
  // failure, which is the defect spec 006 AC-35 exists to remove.
  //
  // But that equality is NOT sufficient on its own. src/server/items/item-service.ts
  // computes `counts` and `rows` from the SAME in-memory array, so a `take:` on the
  // findMany shrinks the badge and the rendered rows together and toHaveCount(activeBadge)
  // still passes. The #6 reviewer proved it: with `take: 50` the failure lands on the line
  // below, not on that one.
  //
  // So the floor is load-bearing. `toBeGreaterThan(100)` is what pins the badge against
  // the real size of the master and stops the equality being a tautology. DO NOT REMOVE IT
  // as redundant: it is the one assertion the `take: 50` mutation fails.
  //
  // What stands behind it is the presence check below — NOT a comparison against a fresh
  // db.item.count(). Two polled global comparisons stood there until 007 AC-33 removed
  // them. Polling repairs a TRANSIENT disagreement, not a continuous one, and
  // item-master-yards.spec.ts and item-master-access.spec.ts create and archive items
  // throughout this window, so the render and the count are taken at different instants
  // and there is no pass on which the predicate holds. It failed #7's gate with
  // "Timeout 10000ms exceeded while waiting on the predicate", 1 failed, 33 did not run.
  const activeBadge = Number(await page.getByTestId("filter-count-active").innerText());
  expect(activeBadge).toBeGreaterThan(100);
  await expect(page.getByTestId("item-row")).toHaveCount(activeBadge);

  // And the list is not a lie about the rows this file owns: every item seeded in
  // `beforeAll` is on the page, found by its unique description. These rows are this
  // spec's own, so no parallel worker moves them (AC-33, 006 AC-34). `deletableItem` is
  // left out on purpose — a later test in this file removes it.
  for (const seeded of [pricedItem, flaggedItem, fuelItem, notedItem, referencedItem]) {
    await expect(
      page.getByTestId("item-row").filter({ hasText: seeded.description }),
      `${seeded.description} is rendered on the active list`,
    ).toHaveCount(1);
  }

  // A substring, in the wrong case.
  await page.goto(`/item-master?q=${encodeURIComponent("priced beads")}`);
  const rows = page.getByTestId("item-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(pricedItem.description);
  await expect(rows.first()).toContainText(supplierName);
  await expect(rows.first()).toContainText(itemTypeName);
  await expect(rows.first()).toContainText("20 Kg");
  await expect(rows.first().getByTestId("item-price")).toHaveText("€33.09");

  // AC-17: every badge READS a real number rather than merely being non-empty, and the
  // filtered list renders exactly those rows and no others. Each filter is measured WITHIN
  // ONE PAGE LOAD — the badge and the rows on that load come from the same `listItems`
  // snapshot — which is precisely what the removed polls against db.item.count() could not
  // do while three workers write (AC-33).
  for (const filter of ["active", "needs-review", "notes", "archived"] as const) {
    await page.goto(`/item-master?filter=${filter}`);

    const badge = await page.getByTestId(`filter-count-${filter}`).innerText();
    expect(badge, `the ${filter} badge reads a whole number`).toMatch(/^\d+$/);
    await expect(
      page.getByTestId("item-row"),
      `the ${filter} list renders exactly the rows its badge claims`,
    ).toHaveCount(Number(badge));
  }

  // And each filter really selects: this file's own flagged and noted rows sit under the
  // filters their seeded flags put them in, and an active row is not under `Archived`.
  await page.goto("/item-master?filter=needs-review");
  for (const seeded of [flaggedItem, fuelItem]) {
    await expect(
      page.getByTestId("item-row").filter({ hasText: seeded.description }),
    ).toHaveCount(1);
  }

  await page.goto("/item-master?filter=notes");
  for (const seeded of [fuelItem, notedItem]) {
    await expect(
      page.getByTestId("item-row").filter({ hasText: seeded.description }),
    ).toHaveCount(1);
  }

  await page.goto("/item-master?filter=archived");
  await expect(
    page.getByTestId("item-row").filter({ hasText: pricedItem.description }),
  ).toHaveCount(0);

  await page.goto("/item-master");
  await page.getByTestId("filter-needs-review").click();
  await expect(page).toHaveURL(/filter=needs-review/);

  // The filtered list holds exactly the flagged rows: same page load, same snapshot.
  const flaggedBadge = Number(
    await page.getByTestId("filter-count-needs-review").innerText(),
  );
  await expect(page.getByTestId("item-row")).toHaveCount(flaggedBadge);
  const flaggedRowCount = await page.getByTestId("item-row").count();

  // AC-17: "Each flagged row links to /item-master/items/<id>." Rendered since the first
  // draft and never asserted until now.
  const flaggedRows = page.getByTestId("item-row");
  expect(flaggedRowCount).toBeGreaterThan(0);
  for (let index = 0; index < Math.min(flaggedRowCount, 5); index += 1) {
    const row = flaggedRows.nth(index);
    const itemId = await row.getAttribute("data-item-id");

    expect(itemId, "every row carries its item id").toBeTruthy();
    await expect(row.getByRole("link").first()).toHaveAttribute(
      "href",
      `/item-master/items/${itemId}`,
    );
  }
});

test("AC-6, AC-28: a filter matching nothing says so and offers a way back", async ({ page }) => {
  await signIn(page, await admin());

  await page.goto(`/item-master?q=${encodeURIComponent(uniqueName("nothing-matches"))}`);

  await expect(page.getByTestId("item-master-no-match")).toContainText(
    "No items match those filters.",
  );
  await page.getByTestId("clear-filters").click();
  await expect(page).toHaveURL(/\/item-master$/);
  await expect(page.getByTestId("item-table")).toBeVisible();
});

test("AC-7, AC-28: creating an item derives its unit and shows it after a fresh load", async ({
  page,
}) => {
  await signIn(page, await admin());
  const description = uniqueName("Created Beads");

  await page.goto("/item-master/items/new");
  await page.getByLabel("Description", { exact: true }).fill(description);
  await page.getByLabel("Supplier", { exact: true }).selectOption(supplierId);
  await page.getByLabel("Type", { exact: true }).selectOption(itemTypeId);
  await page.getByLabel("Unit label", { exact: true }).fill("20 Kg");
  await page.getByTestId("save-item").click();

  await page.waitForURL(/\/item-master\/items\/[^/]+\?done=saved/);
  await expect(page.getByTestId("item-master-done")).toHaveText("Saved.");
  await expect(page.getByTestId("item-description")).toHaveText(description);
  await expect(page.getByTestId("unit-kind")).toHaveText("KILOGRAM");

  const stored = await db.item.findFirstOrThrow({ where: { description } });
  expect(stored.unitKind).toBe("KILOGRAM");
  expect(stored.unitQuantityKg?.toString()).toBe("20");
  expect(stored.active).toBe(true);
});

test("AC-7: two spaces in a description survive, and the three-space spelling is a different item", async ({
  page,
}) => {
  await signIn(page, await admin());
  const twoSpaces = uniqueName("Bicycle Logo's  1200mm");

  await page.goto("/item-master/items/new");
  await page.getByLabel("Description", { exact: true }).fill(twoSpaces);
  await page.getByLabel("Type", { exact: true }).selectOption(itemTypeId);
  await page.getByTestId("save-item").click();
  // The redirect, not merely "a URL under /items/": `/items/new` matches that too, and a
  // refusal would have looked like a pass.
  await page.waitForURL(/\/item-master\/items\/[^/]+\?done=saved/);

  expect(await db.item.count({ where: { description: twoSpaces } })).toBe(1);

  // 005 open question 5 keeps the two spellings apart, so the three-space search misses.
  // The suffix stays in the needle: the imported master really does hold a three-space
  // `Bicycle Logo's   1200mm`, and searching for the bare spelling would find the user's
  // row rather than proving anything about this one.
  const threeSpaces = twoSpaces.replace("Logo's  1200mm", "Logo's   1200mm");
  expect(threeSpaces).not.toBe(twoSpaces);
  await page.goto(`/item-master?q=${encodeURIComponent(threeSpaces)}`);
  await expect(page.getByTestId("item-master-no-match")).toBeVisible();
});

test("AC-8, AC-29: an empty description is refused inline, with no database word on the page", async ({
  page,
}) => {
  await signIn(page, await admin());
  const typedNote = uniqueName("a note I do not want to retype");

  await page.goto("/item-master/items/new");
  await page.getByLabel("Description", { exact: true }).fill("   ");
  await page.getByLabel("Type", { exact: true }).selectOption(itemTypeId);
  await page.getByLabel("Notes", { exact: true }).fill(typedNote);
  await page.getByTestId("save-item").click();

  await expect(page.getByTestId("description-error")).toHaveText("Description is required.");
  // Everything else the admin typed is still there.
  await expect(page.getByLabel("Notes", { exact: true })).toHaveValue(typedNote);
  await expect(page.getByLabel("Type", { exact: true })).toHaveValue(itemTypeId);

  const html = await page.content();
  for (const forbidden of [
    "Item_description_not_empty",
    "violates",
    "check constraint",
    "23514",
    "prisma",
    "Prisma",
  ]) {
    expect(html, forbidden).not.toContain(forbidden);
  }
});

test("AC-9, AC-29: a duplicate identity is refused above the form, in the service's words", async ({
  page,
}) => {
  await signIn(page, await admin());

  await page.goto("/item-master/items/new");
  await page.getByLabel("Description", { exact: true }).fill(pricedItem.description);
  await page.getByLabel("Supplier", { exact: true }).selectOption(supplierId);
  await page.getByLabel("Type", { exact: true }).selectOption(itemTypeId);
  await page.getByTestId("save-item").click();

  await expect(page.getByTestId("item-form-error")).toContainText(
    `An item "${pricedItem.description}" already exists for supplier ${supplierName}.`,
  );

  const html = await page.content();
  for (const forbidden of ["prisma", "Prisma", "violates", "23505", "P2002", "constraint"]) {
    expect(html, forbidden).not.toContain(forbidden);
  }
});

test("AC-10, AC-19: an edit persists, re-derives the unit, and raises the flag when it must", async ({
  page,
}) => {
  await signIn(page, await admin());

  await page.goto(`/item-master/items/${pricedItem.id}`);
  await page.getByLabel("Supplier", { exact: true }).selectOption(secondSupplierId);
  await page.getByLabel("Unit label", { exact: true }).fill("Tonne");
  await page.getByTestId("save-item").click();

  await page.waitForURL(/\?done=saved/);
  await expect(page.getByTestId("item-master-done")).toHaveText("Saved.");
  await expect(page.getByTestId("unit-kind")).toHaveText("TONNE");

  const stored = await db.item.findUniqueOrThrow({ where: { id: pricedItem.id } });
  expect(stored.supplierId).toBe(secondSupplierId);
  expect(stored.unitQuantityKg?.toString()).toBe("1000");

  // Clearing the supplier raises the flag on that save (AC-19).
  await page.getByLabel("Supplier", { exact: true }).selectOption("");
  await page.getByTestId("save-item").click();
  await page.waitForURL(/\?done=saved/);
  await expect(page.getByTestId("needs-review-tag")).toBeVisible();
  expect((await db.item.findUniqueOrThrow({ where: { id: pricedItem.id } })).needsReview).toBe(
    true,
  );
});

test("AC-13, AC-14, AC-15, AC-29: a price is added, never overwritten", async ({ page }) => {
  await signIn(page, await admin());
  const item = await seedItem(ledger, {
    base: "Repriced Beads",
    itemTypeId,
    supplierId,
    unitLabel: "20 Kg",
    price: { amount: "33.09", effectiveFrom: "2025-01-01", label: "2025 Prices" },
  });

  await page.goto(`/item-master/items/${item.id}`);
  await expect(page.getByTestId("current-price")).toHaveText("€33.09");
  // The existing row is read-only: no edit control and no delete control.
  await expect(page.getByTestId("price-row")).toHaveCount(1);
  await expect(page.getByTestId("price-row").getByRole("button")).toHaveCount(0);

  await page.getByLabel("Amount", { exact: true }).fill("35.00");
  await page.getByLabel("Effective from", { exact: true }).fill("2026-10-01");
  await page.getByTestId("add-price").click();

  await page.waitForURL(/\?done=price-added/);
  await expect(page.getByTestId("item-master-done")).toHaveText("Price added.");
  await expect(page.getByTestId("price-row")).toHaveCount(2);

  const rows = await db.itemPrice.findMany({
    where: { itemId: item.id },
    orderBy: { effectiveFrom: "asc" },
  });
  expect(rows).toHaveLength(2);
  expect(rows[0].unitPrice.toString()).toBe("33.09");
  expect(rows[0].label).toBe("2025 Prices");

  // The same date again is refused, and the typed values are kept (AC-14).
  await page.getByLabel("Amount", { exact: true }).fill("40.00");
  await page.getByLabel("Effective from", { exact: true }).fill("2026-10-01");
  await page.getByTestId("add-price").click();

  await expect(page.getByTestId("price-form-error")).toContainText(
    "Prices are never overwritten: choose a later date.",
  );
  await expect(page.getByLabel("Amount", { exact: true })).toHaveValue("40.00");
  await expect(page.getByLabel("Effective from", { exact: true })).toHaveValue("2026-10-01");

  const html = await page.content();
  for (const forbidden of [
    "Unique constraint",
    "P2002",
    "ItemPrice_itemId_effectiveFrom_key",
    "prisma",
  ]) {
    expect(html, forbidden).not.toContain(forbidden);
  }
  expect(await db.itemPrice.count({ where: { itemId: item.id } })).toBe(2);
});

test("AC-15: a future-only price leaves the header saying No current price", async ({ page }) => {
  await signIn(page, await admin());
  const item = await seedItem(ledger, {
    base: "Future Priced Beads",
    itemTypeId,
    supplierId,
    unitLabel: "20 Kg",
    price: { amount: "35.00", effectiveFrom: "2099-01-01", label: "future" },
  });

  await page.goto(`/item-master/items/${item.id}`);

  await expect(page.getByTestId("current-price")).toHaveText("No current price");
  await expect(page.getByTestId("price-row")).toHaveCount(1);
  await expect(page.getByTestId("current-badge")).toHaveCount(0);
  await expect(page.getByTestId("price-row")).toContainText("2099-01-01");
});

test("AC-15, AC-18: an item with no price shows both sentences", async ({ page }) => {
  await signIn(page, await admin());

  await page.goto(`/item-master/items/${flaggedItem.id}`);

  await expect(page.getByTestId("reason-MISSING_PRICE")).toHaveText("No price");
  await expect(page.getByTestId("reason-MISSING_SUPPLIER")).toHaveText("No supplier");
  await expect(page.getByTestId("no-price-recorded")).toHaveText(
    "No price recorded. Lines for this item will count as 0 and raise a warning on the count summary.",
  );
});

test("AC-18, AC-19: a flag clears only once every reason is gone", async ({ page }) => {
  await signIn(page, await admin());

  await page.goto(`/item-master/items/${flaggedItem.id}`);
  await page.getByTestId("mark-reviewed").click();

  await page.waitForURL(/\?error=/);
  await expect(page.getByTestId("item-master-error")).toContainText("Cannot mark reviewed:");
  expect((await db.item.findUniqueOrThrow({ where: { id: flaggedItem.id } })).needsReview).toBe(
    true,
  );

  // Supply the supplier through the screen, then the price, then try again.
  await page.getByLabel("Supplier", { exact: true }).selectOption(supplierId);
  await page.getByTestId("save-item").click();
  await page.waitForURL(/\?done=saved/);

  await page.getByLabel("Amount", { exact: true }).fill("7.50");
  await page.getByLabel("Effective from", { exact: true }).fill("2026-01-01");
  await page.getByTestId("add-price").click();
  await page.waitForURL(/\?done=price-added/);

  await page.getByTestId("mark-reviewed").click();
  await page.waitForURL(/\?done=reviewed/);
  await expect(page.getByTestId("item-master-done")).toHaveText("Marked as reviewed.");
  await expect(page.getByTestId("needs-review-tag")).toHaveCount(0);
  expect((await db.item.findUniqueOrThrow({ where: { id: flaggedItem.id } })).needsReview).toBe(
    false,
  );
});

test("AC-18: a below-total fuel row carries no reason and can be reviewed at once", async ({
  page,
}) => {
  await signIn(page, await admin());

  await page.goto(`/item-master/items/${fuelItem.id}`);

  await expect(page.getByTestId("needs-review-tag")).toBeVisible();
  await expect(page.getByTestId("flagged-at-import")).toHaveText("Flagged at import");
  await expect(page.getByTestId("reason-MISSING_SUPPLIER")).toHaveCount(0);
  await expect(page.getByTestId("reason-MISSING_UNIT")).toHaveCount(0);
  await expect(page.getByTestId("reason-MISSING_PRICE")).toHaveCount(0);
  await expect(page.getByTestId("import-notes")).toContainText("Below the total row");

  await page.getByTestId("mark-reviewed").click();
  await page.waitForURL(/\?done=reviewed/);
  expect((await db.item.findUniqueOrThrow({ where: { id: fuelItem.id } })).needsReview).toBe(
    false,
  );
});

test("AC-20: the cross-sheet note is rendered verbatim beside the unit label that fixes it", async ({
  page,
}) => {
  await signIn(page, await admin());

  await page.goto(`/item-master/items/${notedItem.id}`);

  const notes = page.getByTestId("import-notes");
  await expect(notes).toContainText("Dublin!D50");
  await expect(notes).toContainText("1 Unit");
  await expect(notes).toContainText("'Clonmel '!D64");
  await expect(notes).toContainText("16kg");

  // Clearing the note is how a resolved conflict is recorded, and it changes nothing else.
  const beforeSave = await db.item.findUniqueOrThrow({ where: { id: notedItem.id } });
  await page.getByLabel("Notes", { exact: true }).fill("");
  await page.getByTestId("save-item").click();
  await page.waitForURL(/\?done=saved/);

  const afterSave = await db.item.findUniqueOrThrow({ where: { id: notedItem.id } });
  expect(afterSave.notes).toBeNull();
  expect(afterSave.needsReview).toBe(beforeSave.needsReview);
  expect(afterSave.unitLabel).toBe(beforeSave.unitLabel);
  await expect(page.getByTestId("import-notes")).toHaveCount(0);
});

test("AC-11: archiving keeps history and restoring returns the item to its yards", async ({
  page,
}) => {
  await signIn(page, await admin());
  const lineBefore = await db.stockCountLine.findFirstOrThrow({
    where: { itemId: referencedItem.id },
  });
  await db.itemLocation.create({
    data: {
      itemId: referencedItem.id,
      locationId: (await db.location.findUniqueOrThrow({ where: { code: "CLONMEL" } })).id,
      sortOrder: 920,
    },
  });

  await page.goto(`/item-master/items/${referencedItem.id}`);
  await page.getByTestId("archive-item").click();
  await page.waitForURL(/\?done=archived/);
  await expect(page.getByTestId("archived-tag")).toBeVisible();

  expect(await db.stockCountLine.findUniqueOrThrow({ where: { id: lineBefore.id } })).toEqual(
    lineBefore,
  );
  const link = await db.itemLocation.findFirstOrThrow({
    where: { itemId: referencedItem.id },
  });
  expect(link.sortOrder).toBe(920);
  expect(link.active).toBe(true);

  // Gone from the default list, present under ?filter=archived.
  await page.goto(`/item-master?q=${encodeURIComponent(referencedItem.description)}`);
  await expect(page.getByTestId("item-master-no-match")).toBeVisible();
  await page.goto(
    `/item-master?filter=archived&q=${encodeURIComponent(referencedItem.description)}`,
  );
  await expect(page.getByTestId("item-row")).toHaveCount(1);

  await page.goto(`/item-master/items/${referencedItem.id}`);
  await page.getByTestId("restore-item").click();
  await page.waitForURL(/\?done=restored/);
  await expect(page.getByTestId("yard-state-CLONMEL")).toHaveText("Assigned, position 920");
});

test("AC-12, AC-29: an item a count names offers no Delete and refuses one readably", async ({
  page,
}) => {
  await signIn(page, await admin());

  await page.goto(`/item-master/items/${referencedItem.id}`);
  await expect(page.getByTestId("delete-item-link")).toHaveCount(0);
  await expect(page.getByTestId("line-count")).toContainText("On 1 count line");

  // The confirm page states the refusal instead, in the service's own words.
  await page.goto(`/item-master/items/${referencedItem.id}/delete`);
  await expect(page.getByTestId("delete-refused")).toContainText(
    `"${referencedItem.description}" appears on 1 count line and cannot be deleted. Archive it instead.`,
  );
  await expect(page.getByTestId("confirm-delete-item")).toHaveCount(0);

  const html = await page.content();
  for (const forbidden of [
    "violates RESTRICT setting of foreign key constraint",
    "PrismaClientUnknownRequestError",
    "constraint",
    "23001",
  ]) {
    expect(html, forbidden).not.toContain(forbidden);
  }

  expect(await db.item.count({ where: { id: referencedItem.id } })).toBe(1);
});

test("AC-12: deleting an unreferenced item takes its prices and links with it", async ({
  page,
}) => {
  await signIn(page, await admin());

  await page.goto(`/item-master/items/${deletableItem.id}`);
  await page.getByTestId("delete-item-link").click();

  await expect(page.getByTestId("delete-item-name")).toHaveText(deletableItem.description);
  await expect(page.getByTestId("delete-confirm-body")).toContainText("1 price");
  await page.getByTestId("confirm-delete-item").click();

  await page.waitForURL(/\/item-master\?done=deleted/);
  await expect(page.getByTestId("item-master-done")).toHaveText("Deleted.");

  expect(await db.item.count({ where: { id: deletableItem.id } })).toBe(0);
  expect(await db.itemPrice.count({ where: { itemId: deletableItem.id } })).toBe(0);
  expect(await db.itemLocation.count({ where: { itemId: deletableItem.id } })).toBe(0);
});

test("AC-5: a form body carrying role=ADMIN does not make a YARD_STAFF session an admin", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const staff = await createTestUser("YARD_STAFF", "item-master-forge");
  created.push(staff.email);
  await signIn(page, staff);

  const target = await seedItem(ledger, {
    base: "Untouched By Staff",
    itemTypeId,
    supplierId,
    unitLabel: "20 Kg",
  });
  const rowBefore = await db.item.findUniqueOrThrow({ where: { id: target.id } });

  // The same POST an admin's form would make, with role=ADMIN added to the body.
  const response = await page.request.post(`/item-master/items/${target.id}`, {
    form: {
      role: "ADMIN",
      actor: "ADMIN",
      userId: staff.id,
      itemId: target.id,
      description: uniqueName("Renamed by a staff session"),
      supplierId,
      itemTypeId,
      unitLabel: "Tonne",
      notes: "",
    },
    maxRedirects: 0,
  });

  expect(response.status()).not.toBe(200);
  expect(await db.item.findUniqueOrThrow({ where: { id: target.id } })).toEqual(rowBefore);

  await context.close();
});
