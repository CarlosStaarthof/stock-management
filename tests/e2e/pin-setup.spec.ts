import { expect, test } from "@playwright/test";

import { SETUP_COMPLETE_MESSAGE } from "@/lib/auth-messages";

import { skipWithoutDatabase } from "./support/database";
import { createTestUser, removeUser } from "./support/users";

/**
 * First-run setup, end to end, as far as the development database allows (021 AC-27, AC-28,
 * AC-34).
 *
 * NO TEST HERE CLAIMS SETUP. The development database always holds an `ADMIN`, so `/setup`
 * answers 404 there, and removing one to see the form would be removing a real
 * administrator. The available side — the form, the code, the claim, the race — is proved
 * against the test database in `src/server/auth/setup-service.db.test.ts`, where the page is
 * also rendered on the server. What is proved here is what the development database can
 * show: the 404, and the page setup sends its new administrator to.
 */
const SESSION_COOKIE = "authjs.session-token";

const created: string[] = [];

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.afterAll(async () => {
  for (const username of created.splice(0)) {
    await removeUser(username);
  }
});

test("AC-27, AC-34: with an ADMIN in the database, /setup answers 404 signed out, with no setupCode field and no euro", async ({
  request,
}) => {
  const admin = await createTestUser("ADMIN", "pin-setup");
  created.push(admin.username);

  const response = await request.get("/setup", { maxRedirects: 0 });

  // Not a protected path: the middleware does not send it to /sign-in first.
  expect(response.status()).toBe(404);
  const body = await response.text();
  expect(body).not.toMatch(/name=["']?setupCode/);
  expect(body).not.toContain("Setup code");
  expect(body).not.toContain("€");
});

test("AC-28: /sign-in?setup=done renders SETUP_COMPLETE_MESSAGE above an empty form and sets no session cookie", async ({
  page,
}) => {
  const response = await page.goto("/sign-in?setup=done");

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("setup-complete")).toHaveText(SETUP_COMPLETE_MESSAGE);
  await expect(page.getByLabel("Username")).toHaveValue("");
  await expect(page.getByLabel("PIN", { exact: true })).toHaveValue("");

  const setCookies = ((await response?.headersArray()) ?? []).filter(
    (header) => header.name.toLowerCase() === "set-cookie",
  );
  expect(setCookies.filter((header) => header.value.startsWith(`${SESSION_COOKIE}=`))).toEqual([]);
  expect((await page.context().cookies()).map((cookie) => cookie.name)).not.toContain(
    SESSION_COOKIE,
  );
  expect((await page.request.get("/api/session")).status()).toBe(401);
});
