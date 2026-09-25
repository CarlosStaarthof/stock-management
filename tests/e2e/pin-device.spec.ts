import { expect, test } from "@playwright/test";
import type { BrowserContext } from "@playwright/test";

import { signDeviceToken, verifyDeviceToken } from "@/server/auth/password";
import { DEVICE_COOKIE } from "@/server/auth/sign-in-codes";

import { skipWithoutDatabase } from "./support/database";
import { createTestUser, enterCredentials, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * 021 AC-16: the device token is trust for the budget, not a key to the door.
 *
 * Every attempt here SUCCEEDS or is made with no credentials at all, so nothing in this file
 * records a failure — least of all in the new-device budget the real users share (AC-40).
 */
const SESSION_COOKIE = "authjs.session-token";
const DAY_SECONDS = 86_400;
const MAX_AGE_SECONDS = 180 * DAY_SECONDS;

const created: string[] = [];

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.afterAll(async () => {
  for (const username of created.splice(0)) {
    await removeUser(username);
  }
});

async function newUser(): Promise<TestUser> {
  const user = await createTestUser("YARD_STAFF", "pin-device");
  created.push(user.username);
  return user;
}

async function deviceCookie(context: BrowserContext): Promise<{
  value: string;
  expires: number;
  httpOnly: boolean;
  sameSite: string;
  path: string;
  secure: boolean;
} | null> {
  return (await context.cookies()).find((cookie) => cookie.name === DEVICE_COOKIE) ?? null;
}

/** The expiry a token carries, in Unix seconds: its third dot-separated field. */
function expiryOf(token: string): number {
  return Number(token.split(".")[2]);
}

function expectDeviceCookieShape(
  cookie: Awaited<ReturnType<typeof deviceCookie>>,
  label: string,
): void {
  expect(cookie, label).not.toBeNull();
  expect(cookie?.httpOnly, label).toBe(true);
  expect(cookie?.sameSite, label).toBe("Lax");
  expect(cookie?.path, label).toBe("/");
  // Served over http here, so not Secure; over https the attribute is set (AC-16).
  expect(cookie?.secure, label).toBe(false);
  const lifetime = (cookie?.expires ?? 0) - Date.now() / 1000;
  expect(Math.abs(lifetime - MAX_AGE_SECONDS), label).toBeLessThan(120);
  expect(verifyDeviceToken(cookie?.value), label).toMatch(/^[0-9a-f]{32}$/);
}

test("AC-16: a sign-in through the form sets macroads-device, HttpOnly, Lax, Path=/, for 180 days", async ({
  page,
}) => {
  const user = await newUser();

  await page.goto("/sign-in");
  await enterCredentials(page, user);
  await expect(page.getByTestId("signed-in-name")).toHaveText(user.name);

  expectDeviceCookieShape(await deviceCookie(page.context()), "form");
});

test("AC-16: a sign-in through the credentials callback sets the same cookie", async ({ page }) => {
  const user = await newUser();

  const csrf = (await (await page.request.get("/api/auth/csrf")).json()) as { csrfToken: string };
  const response = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.csrfToken,
      username: user.username,
      pin: user.pin,
      callbackUrl: "/stock-entry",
    },
    maxRedirects: 0,
  });

  expect(response.status()).toBeLessThan(400);
  expect((await page.context().cookies()).map((cookie) => cookie.name)).toContain(SESSION_COOKIE);
  expectDeviceCookieShape(await deviceCookie(page.context()), "callback");
});

test("AC-16: a browser that already holds a valid token keeps its device id, with a renewed expiry", async ({
  page,
  baseURL,
}) => {
  const user = await newUser();
  const tenDaysAgo = new Date(Date.now() - 10 * DAY_SECONDS * 1000);
  const held = signDeviceToken(null, tenDaysAgo);
  await page.context().addCookies([{ name: DEVICE_COOKIE, value: held, url: baseURL as string }]);

  await page.goto("/sign-in");
  await enterCredentials(page, user);
  await expect(page.getByTestId("signed-in-name")).toHaveText(user.name);

  const renewed = await deviceCookie(page.context());
  expect(verifyDeviceToken(renewed?.value)).toBe(verifyDeviceToken(held));
  expect(expiryOf(renewed?.value ?? "")).toBeGreaterThan(expiryOf(held) + 9 * DAY_SECONDS);
});

test("AC-16: a request carrying only a valid device cookie is not signed in", async ({
  page,
  baseURL,
}) => {
  await page.context().addCookies([
    { name: DEVICE_COOKIE, value: signDeviceToken(null), url: baseURL as string },
  ]);

  expect((await page.request.get("/api/session")).status()).toBe(401);
  for (const path of ["/stock-entry", "/stock-takes", "/analysis", "/item-master"]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    expect([302, 307], path).toContain(response.status());
    expect(response.headers().location, path).toContain("/sign-in");
  }
});

test("AC-16: signing out leaves the device cookie in place", async ({ page }) => {
  const user = await newUser();
  await signIn(page, user);
  const before = await deviceCookie(page.context());

  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("sign-in-submit")).toBeVisible();

  const after = await deviceCookie(page.context());
  expect(after?.value).toBe(before?.value);
  expect((await page.request.get("/api/session")).status()).toBe(401);
});
