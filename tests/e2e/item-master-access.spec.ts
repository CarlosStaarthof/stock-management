import { expect, test } from "@playwright/test";

import { ACCESS_DENIED_MESSAGE } from "@/lib/auth-messages";

import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  cleanUp,
  newLedger,
  seedItem,
  seedItemType,
  seedSupplier,
  seededMasterCounts,
} from "./support/item-master";
import { createTestUser, enterCredentials, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 006 AC-1, AC-2, AC-3 and AC-30: who can reach the item master, what a refused
 * request is sent, and whether the whole of it works on a phone.
 *
 * The refusal is asserted on the RESPONSE, not on the rendered page: a UI assertion
 * passes while the price sits in the HTML (docs/verification.md Level 3b).
 */
const ledger = newLedger();
const created: string[] = [];

let seededItemDescription = "";
let seededItemId = "";
let before: Awaited<ReturnType<typeof seededMasterCounts>>;

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.beforeAll(async () => {
  // `beforeAll` runs before any `beforeEach` skip, so it asks the same question itself.
  if (!(await databaseIsReachable())) return;

  before = await seededMasterCounts();

  const supplier = await seedSupplier(ledger, "Access Supplier");
  const itemType = await seedItemType(ledger, "Access Type");
  const item = await seedItem(ledger, {
    base: "Access Probe Item",
    itemTypeId: itemType.id,
    supplierId: supplier.id,
    unitLabel: "20 Kg",
    price: { amount: "33.09", effectiveFrom: "2025-01-01", label: "2025 Prices" },
    yards: [{ code: "DUBLIN", sortOrder: 900 }],
  });

  seededItemDescription = item.description;
  seededItemId = item.id;
});

test.afterAll(async () => {
  if (!(await databaseIsReachable())) return;

  for (const username of created.splice(0)) {
    await removeUser(username);
  }
  await cleanUp(ledger);

  // AC-34: the user's own master is exactly as this run found it.
  expect(await seededMasterCounts()).toEqual(before);
});

async function newUser(role: "YARD_STAFF" | "ADMIN"): Promise<TestUser> {
  const user = await createTestUser(role, `item-master-${role.toLowerCase()}`);
  created.push(user.username);
  return user;
}

/** The seven URLs of AC-1, built once the fixture id is known. */
function sevenUrls(): string[] {
  return [
    "/item-master",
    "/item-master/items/new",
    `/item-master/items/${seededItemId}`,
    `/item-master/items/${seededItemId}/delete`,
    "/item-master/suppliers",
    "/item-master/types",
    "/item-master/yards/DUBLIN",
  ];
}

test("AC-1: a signed-out request to any of the seven URLs is redirected and sent no content", async ({
  request,
}) => {
  for (const url of sevenUrls()) {
    const response = await request.get(url, { maxRedirects: 0 });

    expect([302, 307], `${url} status`).toContain(response.status());

    const location = response.headers()["location"] ?? "";
    expect(location, `${url} location`).toContain("/sign-in");
    expect(location, `${url} callbackUrl`).toContain(
      `callbackUrl=${encodeURIComponent(url)}`,
    );

    // None of the page's content: not the heading, not the item, not a euro.
    const body = await response.text();
    expect(body, `${url} body`).not.toContain("Item master");
    expect(body, `${url} body`).not.toContain(seededItemDescription);
    expect(body, `${url} body`).not.toContain("€");
  }
});

test("AC-1: signing in from that redirect lands on the requested path", async ({ page }) => {
  const admin = await newUser("ADMIN");

  await page.goto("/item-master/suppliers");
  await expect(page).toHaveURL(/\/sign-in\?callbackUrl=/);

  await enterCredentials(page, admin);

  await page.waitForURL("**/item-master/suppliers");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Suppliers");
});

test("AC-2: a YARD_STAFF session is refused at all seven URLs and sent no item and no money", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const staff = await newUser("YARD_STAFF");
  await signIn(page, staff);

  for (const url of sevenUrls()) {
    const response = await page.request.get(url, { maxRedirects: 0 });

    expect(response.status(), `${url} status`).toBe(307);
    expect(response.headers()["location"] ?? "", `${url} location`).toContain(
      "/stock-entry?denied=item-master",
    );

    // The body of that 307 is Next's own redirect scaffolding - a script shell with no
    // page content in it - so the assertion is on WHAT IS IN IT rather than on its size.
    const body = await response.text();
    expect(body, `${url} carries an item`).not.toContain(seededItemDescription);
    expect(body, `${url} carries a price`).not.toContain("33.09");
    expect(body, `${url} carries a euro sign`).not.toContain("€");
    expect(body, `${url} carries a money word`).not.toMatch(/unitPrice|price|value|total|amount/i);
  }

  // Following the redirect renders #3's message, on a page this feature does not edit.
  await page.goto("/item-master");
  await expect(page).toHaveURL(/\/stock-entry\?denied=item-master/);
  await expect(page.getByTestId("access-denied")).toHaveText(
    ACCESS_DENIED_MESSAGE,
  );

  await context.close();
});

test("AC-1, AC-2: an ADMIN reaches all seven URLs with 200", async ({ page }) => {
  const admin = await newUser("ADMIN");
  await signIn(page, admin);

  for (const url of sevenUrls()) {
    const response = await page.request.get(url);
    expect(response.status(), `${url} status`).toBe(200);
  }
});

test("AC-30: at 390 px the document never scrolls sideways on any of the seven URLs", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const admin = await newUser("ADMIN");
  await signIn(page, admin);

  for (const url of sevenUrls()) {
    await page.goto(url);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    // The item table may scroll inside its own container; the DOCUMENT may not.
    expect(overflow.scrollWidth, `${url} document overflows`).toBeLessThanOrEqual(
      overflow.clientWidth,
    );
  }

  // And the controls a phone has to reach are reachable without scrolling the document.
  await page.goto("/item-master");
  await expect(page.getByLabel("Search items")).toBeVisible();
  await expect(page.getByTestId("filter-needs-review")).toBeVisible();
  await expect(page.getByTestId("add-item")).toBeVisible();

  await page.goto(`/item-master/items/${seededItemId}`);
  await expect(page.getByTestId("save-item")).toBeVisible();
  await expect(page.getByTestId("add-price")).toBeVisible();
  await expect(page.getByTestId("assign-CLONMEL")).toBeVisible();

  // AC-30 names *Move up*, so this reaches for a *Move up*. It is the SECOND row's,
  // because the first row legitimately has none — AC-23 renders no Move up on the row a
  // move up would be a no-op for, and asserting on the first row would have been
  // asserting the control is absent while claiming it is reachable.
  await page.goto("/item-master/yards/DUBLIN");
  const sheetRows = page.getByTestId("sheet-row");
  expect(await sheetRows.count()).toBeGreaterThan(1);
  const secondRowMoveUp = sheetRows.nth(1).getByRole("button", { name: "Move up" });
  await expect(secondRowMoveUp).toBeVisible();
  await expect(secondRowMoveUp).toBeEnabled();

  await page.goto("/item-master/types");
  const secondTypeMoveUp = page
    .getByTestId("type-row")
    .nth(1)
    .getByRole("button", { name: "Move up" });
  await expect(secondTypeMoveUp).toBeVisible();
  await expect(secondTypeMoveUp).toBeEnabled();

  await context.close();
});
