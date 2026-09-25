import { expect, test } from "@playwright/test";

import { ACCESS_DENIED_MESSAGE } from "@/lib/auth-messages";
import { assertNoMoneyKeys, deepKeys } from "@/lib/money-boundary";

import { skipWithoutDatabase } from "./support/database";
import { createTestUser, removeUser, signIn, storedPinHash } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Role refusal, the money boundary and the "role comes from the session" rule, asserted
 * on RESPONSE BODIES. A UI assertion passes while the data sits in the JSON
 * (docs/verification.md Level 3b).
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

async function newUser(role: "YARD_STAFF" | "ADMIN"): Promise<TestUser> {
  const user = await createTestUser(role);
  created.push(user.username);
  return user;
}

// Part 6: Stock Takes is money-free and common to both roles - one version of the
// screen, not two. One test per role, so a slow sign-in cannot make the other look broken.
for (const role of ["YARD_STAFF", "ADMIN"] as const) {
  test(`AC-15: ${role} reaches /stock-takes with 200`, async ({ page }) => {
    const user = await newUser(role);

    await signIn(page, user);
    const response = await page.goto("/stock-takes");

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stock Takes");
  });
}

test("AC-15, AC-16: /analysis and /api/users refuse YARD_STAFF and admit ADMIN", async ({
  browser,
}) => {
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  const staff = await newUser("YARD_STAFF");
  await signIn(staffPage, staff);

  await staffPage.goto("/analysis");
  expect(staffPage.url()).toContain("/stock-entry?denied=analysis");
  await expect(staffPage.getByTestId("access-denied")).toHaveText(
    ACCESS_DENIED_MESSAGE,
  );

  const staffUsers = await staffPage.request.get("/api/users");
  expect(staffUsers.status()).toBe(403);
  expect(await staffUsers.json()).toEqual({ error: "Forbidden" });
  expect(await staffUsers.text()).not.toContain("users");

  await staffContext.close();

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const admin = await newUser("ADMIN");
  await signIn(adminPage, admin);

  const analysis = await adminPage.goto("/analysis");
  expect(analysis?.status()).toBe(200);
  await expect(adminPage.getByRole("heading", { level: 1 })).toHaveText("Analysis");

  const adminUsers = await adminPage.request.get("/api/users");
  expect(adminUsers.status()).toBe(200);
  expect(Array.isArray((await adminUsers.json()).users)).toBe(true);

  await adminContext.close();
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

  const session = await page.request.get("/api/session?role=ADMIN", { headers });
  expect(session.status()).toBe(200);
  expect((await session.json()).role).toBe("YARD_STAFF");
  expect(await session.text()).toContain('"role":"YARD_STAFF"');

  const users = await page.request.get("/api/users?role=ADMIN", { headers });
  expect(users.status()).toBe(403);

  // The same three vectors on a POST, with role=ADMIN in the body as well.
  const posted = await page.request.post("/api/session?role=ADMIN", {
    headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
    data: "role=ADMIN",
  });
  expect(posted.status()).toBe(200);
  expect((await posted.json()).role).toBe("YARD_STAFF");
});

test("AC-19, AC-20: nothing a YARD_STAFF session can obtain carries money or a password", async ({
  page,
}) => {
  const staff = await newUser("YARD_STAFF");
  await signIn(page, staff);

  const session = await page.request.get("/api/session");
  const users = await page.request.get("/api/users");

  expect(session.status()).toBe(200);
  expect(users.status()).toBe(403);

  for (const [label, body] of [
    ["/api/session", await session.json()],
    ["/api/users", await users.json()],
  ] as const) {
    assertNoMoneyKeys(body, label);
    expect(deepKeys(body).filter((key) => /password/i.test(key))).toEqual([]);
  }
});

test("AC-20: the ADMIN listing of at least two accounts carries no password and no hash", async ({
  page,
}) => {
  const admin = await newUser("ADMIN");
  const staff = await newUser("YARD_STAFF");
  await signIn(page, admin);

  const response = await page.request.get("/api/users");
  const body = (await response.json()) as { users: { username: string }[] };
  const raw = await response.text();

  expect(response.status()).toBe(200);
  expect(body.users.length).toBeGreaterThanOrEqual(2);
  expect(deepKeys(body).filter((key) => /password/i.test(key))).toEqual([]);
  assertNoMoneyKeys(body, "/api/users");

  for (const username of [admin.username, staff.username]) {
    expect(raw).not.toContain(await storedPinHash(username));
  }
});
