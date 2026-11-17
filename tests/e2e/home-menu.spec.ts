import { expect, test } from "@playwright/test";

import type { Role } from "@/server/auth/roles";

import { skipWithoutDatabase } from "./support/database";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Feature #22 AC-4 and AC-5: every role lands on `/home`, and the menu is EXACTLY that
 * role's tiles — absent from the response, not hidden by styling.
 *
 * Level 4 (docs/verification.md): a real browser, a real server, the development
 * database. Skips itself, annotated, when no database is reachable.
 */
const created: string[] = [];

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.afterAll(async () => {
  for (const username of created.splice(0)) {
    await removeUser(username);
  }
});

async function newUser(role: Role): Promise<TestUser> {
  const user = await createTestUser(role);
  created.push(user.username);
  return user;
}

/** The path and query of a `Location` header, exactly as the browser would follow it. */
function locationOf(headers: Record<string, string>): string {
  const target = new URL(headers["location"] ?? "", "http://localhost");
  return `${target.pathname}${target.search}`;
}

/** The `home-*` tile anchors a response contains, in render order (not the nav itself). */
async function tileIds(page: import("@playwright/test").Page): Promise<string[]> {
  return page
    .locator('nav[data-testid="home-menu"] a')
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-testid") ?? "").filter((id) => id !== ""),
    );
}

/** Asserts the response has no link to `href` at all — absent, not hidden. */
async function expectNoLink(page: import("@playwright/test").Page, href: string): Promise<void> {
  await expect(page.locator(`a[href="${href}"]`)).toHaveCount(0);
}

/* ------------------------------------------------------------------ AC-4 */

test("AC-4: signed out, /home answers 307 to /sign-in?callbackUrl=%2Fhome and sends no menu", async ({
  request,
}) => {
  const response = await request.get("/home", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(locationOf(response.headers())).toBe("/sign-in?callbackUrl=%2Fhome");
  expect(await response.text()).not.toContain("home-menu");
});

for (const role of ["YARD_STAFF", "ADMIN", "SUPER_ADMIN"] as const) {
  test(`AC-4: a ${role} signs in and lands on /home`, async ({ page }) => {
    const user = await newUser(role);

    await signIn(page, user);

    expect(new URL(page.url()).pathname).toBe("/home");
    await expect(page.getByTestId("signed-in-name")).toHaveText(user.name);
    await expect(page.getByTestId("sign-out")).toBeVisible();
  });
}

/* ------------------------------------------------------------------ AC-5 */

test("AC-5: a YARD_STAFF response has one tile, Stock Calendar to /stock-entry", async ({
  page,
}) => {
  const staff = await newUser("YARD_STAFF");
  await signIn(page, staff);

  expect(await tileIds(page)).toEqual(["home-calendar"]);
  await expect(page.getByTestId("home-calendar")).toHaveText("Stock Calendar");
  await expect(page.getByTestId("home-calendar")).toHaveAttribute("href", "/stock-entry");

  await expectNoLink(page, "/analysis/export");
  await expectNoLink(page, "/item-master");
  await expectNoLink(page, "/dashboard");
});

test("AC-5: an ADMIN response has three tiles and no Dashboard", async ({ page }) => {
  const admin = await newUser("ADMIN");
  await signIn(page, admin);

  expect(await tileIds(page)).toEqual(["home-calendar", "home-export", "home-stock"]);
  await expect(page.getByTestId("home-calendar")).toHaveText("Stock Calendar");
  // D4: an administrator reaches the history/approvals calendar in one tap.
  await expect(page.getByTestId("home-calendar")).toHaveAttribute("href", "/stock-takes");
  await expect(page.getByTestId("home-export")).toHaveText("Export");
  await expect(page.getByTestId("home-export")).toHaveAttribute("href", "/analysis/export");
  await expect(page.getByTestId("home-stock")).toHaveText("Stock");
  await expect(page.getByTestId("home-stock")).toHaveAttribute("href", "/item-master");
  await expectNoLink(page, "/dashboard");
});

test("AC-5: a SUPER_ADMIN response has all four tiles", async ({ page }) => {
  const superAdmin = await newUser("SUPER_ADMIN");
  await signIn(page, superAdmin);

  expect(await tileIds(page)).toEqual([
    "home-calendar",
    "home-export",
    "home-stock",
    "home-dashboard",
  ]);
  await expect(page.getByTestId("home-calendar")).toHaveAttribute("href", "/stock-takes");
  await expect(page.getByTestId("home-dashboard")).toHaveText("Dashboard");
  await expect(page.getByTestId("home-dashboard")).toHaveAttribute("href", "/dashboard");
});

/* ------------------------------------------------------------------ AC-9 */

test("AC-9: the home menu carries no figure, price, value, total or euro", async ({ page }) => {
  const staff = await newUser("YARD_STAFF");
  await signIn(page, staff);

  const menu = page.getByTestId("home-menu");
  await expect(menu).toHaveText("Stock Calendar");
  await expect(menu).not.toContainText("€");
  await expect(menu).not.toContainText(/\d/);
  await expect(page.locator("body")).not.toContainText("€");
});
