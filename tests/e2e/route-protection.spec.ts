import { randomBytes } from "node:crypto";

import { encode } from "next-auth/jwt";
import { expect, test } from "@playwright/test";

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

test.describe("the sign-in page on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("AC-32: at 390 px it does not scroll sideways and every control is usable", async ({
    page,
  }) => {
    await page.goto("/sign-in");

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    const email = page.getByLabel("Email");
    const password = page.getByLabel("Password");
    const submit = page.getByTestId("sign-in-submit");

    for (const control of [email, password, submit]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    }

    // Clickable without horizontal scrolling: filling them proves they can be reached.
    await email.fill("someone@macroads-e2e.invalid");
    await password.fill(`Pw-${randomBytes(12).toString("hex")}`);
    await expect(submit).toBeEnabled();
  });
});
