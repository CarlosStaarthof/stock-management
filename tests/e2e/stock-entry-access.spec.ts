import { expect, test } from "@playwright/test";

import { ACCESS_DENIED_MESSAGE } from "@/lib/auth-messages";

import { seededMasterCounts } from "./support/item-master";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  RESERVED_YEAR,
  anyUnitPriceText,
  bodyShowsPrice,
  clearReservedYear,
  realCountIds,
  seedCount,
} from "./support/stock-entry";
import { createTestUser, enterCredentials, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 007 AC-1, AC-2, AC-17, AC-18 and AC-28's 320 px half: who may reach the four
 * routes, and what a `YARD_STAFF` session is sent when it does.
 *
 * The money assertions are on the RESPONSE BODY, not on what is visible: a UI assertion
 * passes while the price sits in the HTML (`docs/verification.md` Level 3b).
 *
 * This file owns reserved year 2091 (AC-30) and deletes only that year.
 */
const YEAR = RESERVED_YEAR.access;

const created: string[] = [];
let countId = "";
let realCountsBefore: string[] = [];
let masterBefore: Awaited<ReturnType<typeof seededMasterCounts>>;
let aRealPrice: string | null = null;

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.beforeAll(async () => {
  // `beforeAll` runs before any `beforeEach` skip, so it asks the same question itself.
  if (!(await databaseIsReachable())) return;

  realCountsBefore = await realCountIds();
  masterBefore = await seededMasterCounts();
  aRealPrice = await anyUnitPriceText();

  await clearReservedYear(YEAR);

  const owner = await createTestUser("YARD_STAFF", "stock-entry-access-owner");
  created.push(owner.username);
  countId = await seedCount({
    locationCode: "DUBLIN",
    year: YEAR,
    month: 9,
    countDate: `${String(YEAR)}-09-10`,
    createdById: owner.id,
  });
});

test.afterAll(async () => {
  if (!(await databaseIsReachable())) return;

  await clearReservedYear(YEAR);
  for (const username of created.splice(0)) {
    await removeUser(username);
  }

  // AC-30: not one row outside this file's reservation moved.
  expect(await realCountIds()).toEqual(realCountsBefore);
  expect(await seededMasterCounts()).toEqual(masterBefore);
});

async function newUser(role: "YARD_STAFF" | "ADMIN"): Promise<TestUser> {
  const user = await createTestUser(role, `stock-entry-${role.toLowerCase()}`);
  created.push(user.username);
  return user;
}

/** The four URLs of AC-1, built once the seeded count's id is known. */
function fourUrls(): string[] {
  return [
    "/stock-entry",
    "/stock-entry/new",
    "/stock-entry/new/confirm",
    `/stock-entry/counts/${countId}`,
  ];
}

test("AC-1: a signed-out request to any of the four URLs is redirected and sent no content", async ({
  request,
}) => {
  for (const url of fourUrls()) {
    const response = await request.get(url, { maxRedirects: 0 });

    expect([302, 307], `${url} status`).toContain(response.status());

    const location = response.headers()["location"] ?? "";
    expect(location, `${url} location`).toContain("/sign-in");
    expect(location, `${url} callbackUrl`).toContain(`callbackUrl=${encodeURIComponent(url)}`);

    // None of the page's content reached the client.
    const body = await response.text();
    expect(body, `${url} body`).not.toContain("Start a count");
    expect(body, `${url} body`).not.toContain("Counting as");
    expect(body, `${url} body`).not.toContain("€");
  }
});

test("AC-1: the callbackUrl carries the query as well as the path", async ({ request }) => {
  const url = "/stock-entry/new/confirm?locationCode=DUBLIN&countDate=2026-10-01";
  const response = await request.get(url, { maxRedirects: 0 });

  expect([302, 307]).toContain(response.status());
  expect(response.headers()["location"] ?? "").toContain(
    `callbackUrl=${encodeURIComponent(url)}`,
  );
});

test("AC-1: signing in from that redirect lands on the requested path", async ({ page }) => {
  const staff = await newUser("YARD_STAFF");

  await page.goto("/stock-entry/new");
  await expect(page).toHaveURL(/\/sign-in\?callbackUrl=/);

  await enterCredentials(page, staff);

  await page.waitForURL("**/stock-entry/new");
  await expect(page.getByTestId("counting-as")).toContainText("Counting as");
});

for (const role of ["YARD_STAFF", "ADMIN"] as const) {
  test(`AC-2: ${role} reaches every one of the four routes with 200`, async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, await newUser(role));

    for (const url of fourUrls()) {
      const response = await page.request.get(url);
      expect(response.status(), `${url} status`).toBe(200);
    }

    await context.close();
  });
}

test("AC-2: the three test ids #3 left on /stock-entry survive its replacement", async ({
  page,
}) => {
  const staff = await newUser("YARD_STAFF");
  await signIn(page, staff);

  await page.goto("/stock-entry");
  await expect(page.getByTestId("signed-in-name")).toHaveText(staff.name);
  await expect(page.getByTestId("sign-out")).toBeVisible();

  // For ANY value of ?denied=, including an empty one.
  for (const denied of ["item-master", "analysis", ""]) {
    await page.goto(`/stock-entry?denied=${denied}`);
    await expect(page.getByTestId("access-denied")).toHaveText(
      ACCESS_DENIED_MESSAGE,
    );
  }

  // And the control really ends the session.
  await page.goto("/stock-entry");
  await page.getByTestId("sign-out").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/stock-entry"));
  const refused = await page.request.get("/stock-entry", { maxRedirects: 0 });
  expect([302, 307]).toContain(refused.status());
});

test("AC-17: no page a YARD_STAFF session can obtain here carries a euro or a price", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, await newUser("YARD_STAFF"));

  for (const url of fourUrls()) {
    const response = await page.request.get(url);
    const body = await response.text();

    expect(response.status(), `${url} status`).toBe(200);
    expect(body, `${url} carries a euro sign`).not.toContain("€");
    expect(body, `${url} names the price column`).not.toContain("unitPrice");
    expect(body, `${url} names the snapshot column`).not.toContain("unitPriceSnapshot");
    if (aRealPrice !== null) {
      // A real price from the user's own master, asserted absent from the page source.
      expect(bodyShowsPrice(body, aRealPrice), `${url} carries a real price`).toBe(false);
    }
  }

  await context.close();
});

test("AC-18: a query parameter, a header and a cookie cannot change the role", async ({
  page,
  context,
  baseURL,
}) => {
  const staff = await newUser("YARD_STAFF");
  await signIn(page, staff);

  await context.addCookies([{ name: "role", value: "ADMIN", url: baseURL as string }]);
  const headers = { "x-user-role": "ADMIN" };

  const response = await page.request.get(`/stock-entry/counts/${countId}?role=ADMIN`, {
    headers,
  });
  const body = await response.text();

  expect(response.status()).toBe(200);
  // The ADMIN-only sentence of AC-16, and a euro, are both absent.
  expect(body).not.toContain("no price recorded");
  expect(body).not.toContain("€");
  expect(body).not.toContain("unitPrice");

  // The same three vectors on the POST that starts a count, plus role=ADMIN in the body.
  // The refusal it gets is AC-10's, because this yard and period already have a count —
  // and the point is that the SHAPE and the row are unaffected either way.
  const posted = await page.request.post(`/stock-entry/new/confirm?role=ADMIN`, {
    headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
    data: "role=ADMIN&locationCode=DUBLIN&countDate=2091-09-10&period=2091-09",
    maxRedirects: 0,
  });

  expect(posted.status()).toBeLessThan(500);
  expect(await posted.text()).not.toContain("€");
});

test("AC-28: at 320 px the document never scrolls sideways on any of the four routes", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
  const page = await context.newPage();
  await signIn(page, await newUser("YARD_STAFF"));

  for (const url of fourUrls()) {
    await page.goto(url);

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(overflow.scrollWidth, `${url} document overflows at 320 px`).toBeLessThanOrEqual(
      overflow.clientWidth,
    );
  }

  await context.close();
});
