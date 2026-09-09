import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { skipWithoutDatabase } from "./support/database";
import { createTestUser, deactivate, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Level 4 (docs/verification.md): a real browser, a real server, a real database.
 * Skips itself, annotated, when no database is reachable (AC-28).
 */
const SESSION_COOKIE = "authjs.session-token";
const INVALID_CREDENTIALS = "Invalid email or password.";

const created: string[] = [];

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.afterAll(async () => {
  for (const email of created.splice(0)) {
    await removeUser(email);
  }
});

async function newUser(role: "YARD_STAFF" | "ADMIN"): Promise<TestUser> {
  const user = await createTestUser(role);
  created.push(user.email);
  return user;
}

test("AC-9, AC-14: a YARD_STAFF user signs in and lands on /stock-entry", async ({ page }) => {
  const user = await newUser("YARD_STAFF");

  await signIn(page, user);

  expect(new URL(page.url()).pathname).toBe("/stock-entry");

  const session = await page.request.get("/api/session");
  expect(session.status()).toBe(200);
  expect(await session.json()).toMatchObject({
    email: user.email,
    role: "YARD_STAFF",
    landingPath: "/stock-entry",
  });

  const cookies = await page.context().cookies();
  expect(cookies.map((cookie) => cookie.name)).toContain(SESSION_COOKIE);
});

test("AC-9, AC-14: an ADMIN signs in and lands on /stock-takes", async ({ page }) => {
  const user = await newUser("ADMIN");

  await signIn(page, user);

  expect(new URL(page.url()).pathname).toBe("/stock-takes");

  const session = await page.request.get("/api/session");
  expect(session.status()).toBe(200);
  expect(await session.json()).toMatchObject({
    email: user.email,
    role: "ADMIN",
    landingPath: "/stock-takes",
  });
});

test("AC-9: the email in the session is the stored, lower-cased one", async ({ page }) => {
  const user = await newUser("YARD_STAFF");

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(user.email.toUpperCase());
  await page.getByLabel("Password").fill(user.password);
  await page.getByTestId("sign-in-submit").click();

  await expect(page.getByTestId("signed-in-email")).toHaveText(user.email);

  const session = await page.request.get("/api/session");
  expect((await session.json()).email).toBe(user.email);
});

test.describe("a failed sign-in", () => {
  test("AC-10: wrong password, unknown email and deactivated account are one answer", async ({
    page,
  }) => {
    const user = await newUser("YARD_STAFF");
    const deactivated = await newUser("YARD_STAFF");
    await deactivate(deactivated.email);

    const attempts: { label: string; email: string; password: string }[] = [
      { label: "wrong password", email: user.email, password: `Pw-${randomBytes(12).toString("hex")}` },
      {
        label: "unknown email",
        email: `ghost-${randomBytes(8).toString("hex")}@macroads-e2e.invalid`,
        password: user.password,
      },
      { label: "deactivated account", email: deactivated.email, password: deactivated.password },
    ];

    const messages: string[] = [];

    for (const attempt of attempts) {
      await page.context().clearCookies();
      await page.goto("/sign-in");
      await page.getByLabel("Email").fill(attempt.email);
      await page.getByLabel("Password").fill(attempt.password);

      const [response] = await Promise.all([
        page.waitForResponse(
          (candidate) =>
            candidate.request().method() === "POST" &&
            new URL(candidate.url()).pathname === "/sign-in",
        ),
        page.getByTestId("sign-in-submit").click(),
      ]);

      // 200, not a redirect: nothing was granted.
      expect(response.status(), attempt.label).toBe(200);

      await expect(page.getByTestId("sign-in-error")).toHaveText(INVALID_CREDENTIALS);
      messages.push(await page.getByTestId("sign-in-error").innerText());

      expect(new URL(page.url()).pathname, attempt.label).toBe("/sign-in");

      const cookies = await page.context().cookies();
      expect(cookies.map((cookie) => cookie.name), attempt.label).not.toContain(SESSION_COOKIE);

      const session = await page.request.get("/api/session");
      expect(session.status(), attempt.label).toBe(401);
    }

    // Identical in all three cases — that is the criterion, not merely "an error appeared".
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe(INVALID_CREDENTIALS);
  });

  test("AC-10: the form keeps the typed email and clears the password", async ({ page }) => {
    const user = await newUser("YARD_STAFF");

    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(`Pw-${randomBytes(12).toString("hex")}`);
    await page.getByTestId("sign-in-submit").click();

    await expect(page.getByTestId("sign-in-error")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue(user.email);
    await expect(page.getByLabel("Password")).toHaveValue("");
  });
});

test("AC-12: signing in from a protected URL lands on that URL, not on the default landing", async ({
  page,
}) => {
  const user = await newUser("ADMIN");

  // An ADMIN whose default landing is /stock-takes asks for /analysis while signed out.
  await page.goto("/analysis");
  expect(page.url()).toContain("/sign-in?callbackUrl=%2Fanalysis");

  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByTestId("sign-in-submit").click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Analysis");
  expect(new URL(page.url()).pathname).toBe("/analysis");
});

test("AC-11: deactivation takes effect on the next request, without touching the cookie", async ({
  page,
}) => {
  const user = await newUser("YARD_STAFF");
  await signIn(page, user);

  const before = await page.context().cookies();
  await deactivate(user.email);
  const after = await page.context().cookies();

  // The test does not touch the session cookie: the check is server-side, against the row.
  expect(after.map((cookie) => cookie.name)).toEqual(before.map((cookie) => cookie.name));

  // Asserted on the response, not on where the browser happened to end up: the next
  // request for the protected page is answered with a redirect, by the server.
  const refused = await page.request.get("/stock-entry", { maxRedirects: 0 });
  expect([302, 307]).toContain(refused.status());
  expect(refused.headers().location).toBe("/sign-in?reason=inactive");

  await page.goto("/sign-in?reason=inactive");
  await expect(page.getByTestId("inactive-message")).toHaveText(
    "Your account is no longer active. Contact an administrator.",
  );

  const session = await page.request.get("/api/session");
  expect(session.status()).toBe(401);
});

test("AC-21: signing out ends the session", async ({ page }) => {
  const user = await newUser("YARD_STAFF");
  await signIn(page, user);

  await page.getByTestId("sign-out").click();
  await expect(page.getByTestId("sign-in-submit")).toBeVisible();

  const cookies = await page.context().cookies();
  const session = cookies.find((cookie) => cookie.name === SESSION_COOKIE);
  expect(session === undefined || session.value === "").toBe(true);

  await page.goto("/stock-entry");
  expect(new URL(page.url()).pathname).toBe("/sign-in");

  expect((await page.request.get("/api/session")).status()).toBe(401);
});
