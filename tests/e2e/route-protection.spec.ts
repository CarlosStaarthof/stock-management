import { randomInt } from "node:crypto";

import { encode } from "next-auth/jwt";
import { expect, test } from "@playwright/test";

import { skipWithoutDatabase } from "./support/database";
import { addKnownDevice, createTestUser, enterCredentials, removeUser } from "./support/users";

/**
 * Route protection needs no database — the middleware refuses an unauthenticated request
 * from the session cookie alone — so this spec runs even when nothing is reachable
 * (spec 003 AC-28).
 */
const PROTECTED_PATHS = ["/stock-entry", "/stock-takes", "/analysis"];

// Auth.js's cookie over plain http, and the salt its own encoder derives its key from.
const SESSION_COOKIE = "authjs.session-token";

test.describe("unauthenticated access", () => {
  for (const path of PROTECTED_PATHS) {
    test(`AC-12: ${path} redirects to /sign-in with the callbackUrl and sends no content`, async ({
      request,
    }) => {
      const response = await request.get(path, { maxRedirects: 0 });

      expect([302, 307]).toContain(response.status());
      expect(response.headers().location).toBe(
        `/sign-in?callbackUrl=${encodeURIComponent(path)}`,
      );

      // None of the protected page reached the client.
      const body = await response.text();
      expect(body).not.toContain("Stock Entry");
      expect(body).not.toContain("Stock Takes");
      expect(body).not.toContain("Analysis");
    });
  }

  test("AC-12: / and /sign-in still answer 200, and / still has the Macroads Stock heading", async ({
    page,
    request,
  }) => {
    const home = await request.get("/", { maxRedirects: 0 });
    const signIn = await request.get("/sign-in", { maxRedirects: 0 });

    expect(home.status()).toBe(200);
    expect(signIn.status()).toBe(200);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Macroads Stock");
  });

  test("AC-13: /api/session with no session cookie is 401 Unauthorized and carries no user", async ({
    request,
  }) => {
    const response = await request.get("/api/session");

    expect(response.status()).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });

    const body = await response.text();
    for (const field of ["email", "role", "name", "landingPath"]) {
      expect(body).not.toContain(field);
    }
  });

  test("AC-15: /api/users with no session is refused", async ({ request }) => {
    const response = await request.get("/api/users");

    expect(response.status()).toBe(401);
    expect(await response.text()).not.toContain("users");
  });
});

test.describe("an expired session", () => {
  test("AC-13: a token minted with the same AUTH_SECRET but a past exp is not a session", async ({
    context,
    request,
    baseURL,
  }) => {
    const secret = process.env.AUTH_SECRET;
    test.skip(
      secret === undefined || secret === "",
      "AUTH_SECRET is not set in this environment",
    );

    // Signed with the real secret, so the only thing wrong with it is that it expired an
    // hour ago. maxAge is negative: Auth.js sets exp = now + maxAge.
    const expired = await encode({
      token: { sub: "expired-user", role: "ADMIN" },
      secret: secret as string,
      salt: SESSION_COOKIE,
      maxAge: -3600,
    });

    await context.addCookies([
      { name: SESSION_COOKIE, value: expired, url: baseURL as string },
    ]);

    const page = await context.newPage();
    const response = await page.goto("/stock-entry");
    expect(new URL(page.url()).pathname).toBe("/sign-in");
    expect(response?.status()).toBe(200);

    const session = await page.request.get("/api/session");
    expect(session.status()).toBe(401);

    // And the same request without the cookie is refused identically.
    expect((await request.get("/api/session")).status()).toBe(401);
  });
});

/**
 * 021 AC-35, the `/sign-in` half: sign-in works in a glove, and without JavaScript. The
 * other three pages AC-35 measures (`/sign-in/create`, `/sign-in/requested`, `/profiles`)
 * arrive with #21's Phase C. It replaces #3's 390 px email-and-password test (003 AC-32).
 */
for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]) {
  test.describe(`the sign-in page at ${viewport.width} px`, () => {
    test.use({ viewport });

    test(`AC-35: at ${viewport.width} px it does not scroll sideways, and all twelve keys are at least 44 x 44 in three columns`, async ({
      page,
    }) => {
      await page.goto("/sign-in");
      await expect(page.getByTestId("pin-key-0")).toBeVisible();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      await expect(page.locator('[data-testid^="pin-key-"]')).toHaveCount(11);
      const keys = [
        ...Array.from({ length: 10 }, (_, digit) => `pin-key-${digit}`),
        "pin-key-delete",
        "sign-in-submit",
      ];
      await expect(page.getByTestId("sign-in-submit")).toHaveText("Sign in");

      const columns = new Set<number>();
      for (const key of keys) {
        const box = await page.getByTestId(key).boundingBox();
        expect(box, key).not.toBeNull();
        expect(box?.width ?? 0, key).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0, key).toBeGreaterThanOrEqual(44);
        expect((box?.x ?? 0) + (box?.width ?? 0), key).toBeLessThanOrEqual(viewport.width);
        columns.add(Math.round(box?.x ?? 0));
      }
      expect(columns.size).toBe(3);
    });
  });
}

test("AC-35: the keypad types what is tapped and deletes the last digit, and both fields are phone-shaped", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const pin = page.getByLabel("PIN", { exact: true });
  const username = page.getByLabel("Username");

  const digits = Array.from({ length: 5 }, () => String(randomInt(10))).join("");
  for (const digit of digits) {
    await page.getByTestId(`pin-key-${digit}`).click();
  }
  await expect(pin).toHaveValue(digits);
  await page.getByTestId("pin-key-delete").click();
  await expect(pin).toHaveValue(digits.slice(0, -1));

  await expect(pin).toHaveAttribute("type", "password");
  await expect(pin).toHaveAttribute("inputmode", "numeric");
  await expect(pin).toHaveAttribute("autocomplete", "off");
  await expect(username).toHaveAttribute("autocomplete", "off");
  await expect(username).toHaveAttribute("autocapitalize", "none");
  await expect(username).toHaveAttribute("spellcheck", "false");
  expect((await username.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test.describe("the sign-in page without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("AC-35: there is no keypad, and the two fields alone sign in", async ({ page }, testInfo) => {
    await page.goto("/sign-in");
    await expect(page.getByLabel("Username")).toBeVisible();
    await expect(page.locator('[data-testid^="pin-key-"]')).toHaveCount(0);

    await skipWithoutDatabase(testInfo);
    const user = await createTestUser("YARD_STAFF", "route-protection-no-js");
    try {
      await addKnownDevice(page);
      await enterCredentials(page, user);

      await page.waitForURL((url) => url.pathname === "/stock-entry");
      await expect(page.getByTestId("signed-in-name")).toHaveText(user.name);
    } finally {
      await removeUser(user.username);
    }
  });
});
