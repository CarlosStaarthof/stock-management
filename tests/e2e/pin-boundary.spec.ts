import { expect, test } from "@playwright/test";

import { assertNoMoneyKeys, deepKeys } from "@/lib/money-boundary";

import { skipWithoutDatabase } from "./support/database";
import {
  addKnownDevice,
  createTestUser,
  enterCredentials,
  removeUser,
  signIn,
  storedPinHash,
} from "./support/users";
import type { TestUser } from "./support/users";

/**
 * 021 AC-33's response half and AC-34: the sign-in swap opens no path around the money
 * boundary, and no response carries a PIN, a hash or a key. Asserted on RESPONSE BODIES, as
 * docs/verification.md Level 3b asks: a UI assertion passes while the data sits in the JSON.
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
  const user = await createTestUser(role, "pin-boundary");
  created.push(user.username);
  return user;
}

const SECRET_KEY = /pin|hash|password|lookup|code/i;

test("AC-33: /api/users lists exactly id, username, name, role and status, and no response carries a stored hash", async ({
  page,
}) => {
  const admin = await newUser("ADMIN");
  const staff = await newUser("YARD_STAFF");
  await signIn(page, admin);

  const users = await page.request.get("/api/users");
  const session = await page.request.get("/api/session");
  expect(users.status()).toBe(200);
  expect(session.status()).toBe(200);

  const body = (await users.json()) as { users: Record<string, unknown>[] };
  expect(Object.keys(body)).toEqual(["users"]);
  expect(body.users.length).toBeGreaterThanOrEqual(2);
  for (const entry of body.users) {
    expect(Object.keys(entry).sort()).toEqual(["id", "name", "role", "status", "username"]);
  }
  const listed = body.users.map((entry) => entry.username);
  expect(listed).toContain(admin.username);
  expect(listed).toContain(staff.username);

  for (const [label, json] of [
    ["/api/users", body],
    ["/api/session", await session.json()],
  ] as const) {
    expect(deepKeys(json).filter((key) => SECRET_KEY.test(key)), label).toEqual([]);
  }

  const raw = `${await users.text()}\n${await session.text()}`;
  for (const username of [admin.username, staff.username]) {
    expect(raw).not.toContain(await storedPinHash(username));
  }
});

test("AC-34: a YARD_STAFF session is sent no money through /api/session or /api/users", async ({
  page,
}) => {
  const staff = await newUser("YARD_STAFF");
  await signIn(page, staff);

  const session = await page.request.get("/api/session");
  const users = await page.request.get("/api/users");

  expect(session.status()).toBe(200);
  expect(users.status()).toBe(403);
  assertNoMoneyKeys(await session.json(), "/api/session");
  assertNoMoneyKeys(await users.json(), "/api/users");
});

test("AC-34: a role forged into the sign-in form, a header and a cookie gives a YARD_STAFF session", async ({
  page,
  baseURL,
}) => {
  const staff = await newUser("YARD_STAFF");

  await page.context().addCookies([{ name: "role", value: "ADMIN", url: baseURL as string }]);
  await page.setExtraHTTPHeaders({ "x-user-role": "ADMIN" });
  await page.goto("/sign-in");
  await addKnownDevice(page);
  await page.evaluate(() => {
    const field = document.createElement("input");
    field.type = "hidden";
    field.name = "role";
    field.value = "ADMIN";
    document.querySelector("form")?.appendChild(field);
  });
  await enterCredentials(page, staff);
  await expect(page.getByTestId("signed-in-name")).toHaveText(staff.name);

  const session = await page.request.get("/api/session");
  expect((await session.json()).role).toBe("YARD_STAFF");

  const analysis = await page.request.get("/analysis", { maxRedirects: 0 });
  expect([302, 307]).toContain(analysis.status());
  expect(analysis.headers().location).toBe("/stock-entry?denied=analysis");
});

test("AC-34: the sign-in page and the setup address carry no euro", async ({ request }) => {
  for (const path of ["/sign-in", "/setup"]) {
    const response = await request.get(path);
    expect(await response.text(), path).not.toContain("€");
  }
});
