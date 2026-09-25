import { randomBytes, randomInt } from "node:crypto";

import { encode } from "next-auth/jwt";
import type { BrowserContext, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  ACCOUNT_LOCKED_MESSAGE,
  INCORRECT_SIGN_IN_MESSAGE,
  SESSION_ENDED_MESSAGE,
  SIGN_IN_PAUSED_MESSAGE,
} from "@/lib/auth-messages";
import { generatePin, isTrivialPin } from "@/server/auth/credential-rules";
import { accountKey, hashPin, verifyDeviceToken } from "@/server/auth/password";
import { resetProfilePin } from "@/server/auth/profile-admin-service";
import { DEVICE_COOKIE } from "@/server/auth/sign-in-codes";
import { db } from "@/server/db";

import { skipWithoutDatabase } from "./support/database";
import { actorFor } from "./support/stock-entry";
import {
  addKnownDevice,
  createTestUser,
  deactivate,
  enterCredentials,
  forgetDevices,
  removeUser,
  signIn,
} from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Signing in with a username and a PIN (021 AC-9, AC-10, AC-12, AC-15, AC-17, AC-36), in
 * place of #3's email-and-password criteria. Level 4 (docs/verification.md): a real browser,
 * a real server, the development database. Skips itself, annotated, when no database is
 * reachable (003 AC-28) or no `PIN_PEPPER` is set (021 AC-40).
 *
 * THE DEVELOPMENT DATABASE'S NEW-DEVICE BUDGET IS NEVER SPENT HERE (AC-40). Every deliberate
 * failure is made from a known device minted for it, and the last test asserts that no
 * `pin:new-devices` failure was recorded while this file ran.
 *
 * Every PIN is drawn at runtime by `generatePin`; a trivial one is built from the rule.
 */
const SESSION_COOKIE = "authjs.session-token";

const created: string[] = [];
const createdIds: string[] = [];
/** The budget buckets of the devices this file minted for its deliberate failures. */
const devices: string[] = [];
let startedAt = new Date();

test.beforeAll(() => {
  startedAt = new Date();
});

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.afterAll(async () => {
  for (const username of created.splice(0)) {
    await removeUser(username);
  }
  if (createdIds.length > 0) {
    await db.user.deleteMany({ where: { id: { in: createdIds.splice(0) } } });
  }
  await forgetDevices(devices.splice(0));
});

async function newUser(role: "YARD_STAFF" | "ADMIN"): Promise<TestUser> {
  const user = await createTestUser(role, "sign-in");
  created.push(user.username);
  return user;
}

/** A well-formed username nobody holds, registered so its lock row is removed afterwards. */
function strangerUsername(): string {
  const username = `e2e-${randomBytes(10).toString("hex")}`;
  created.push(username);
  return username;
}

function wrongPin(pin: string): string {
  for (;;) {
    const other = generatePin(6);
    if (other !== pin) return other;
  }
}

/** One digit repeated: trivial by the rule, of a digit chosen at runtime. */
function trivialPin(length: 4 | 6): string {
  const pin = String(randomInt(10)).repeat(length);
  expect(isTrivialPin(pin)).toBe(true);
  return pin;
}

async function sessionCookieNames(context: BrowserContext): Promise<string[]> {
  return (await context.cookies()).map((cookie) => cookie.name);
}

/** Types a username and a PIN into the form and submits, returning the POST's response. */
async function attempt(page: Page, username: string, pin: string): Promise<number> {
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("PIN", { exact: true }).fill(pin);
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/sign-in",
    ),
    page.getByTestId("sign-in-submit").click(),
  ]);
  return response.status();
}

/** A session cookie Auth.js would accept, carrying exactly the claims given. */
async function mintSession(claims: Record<string, unknown>): Promise<string> {
  const secret = process.env.AUTH_SECRET ?? "";
  return encode({ token: claims, secret, salt: SESSION_COOKIE, maxAge: 3600 });
}

/* ------------------------------------------------------------------ AC-9 */

test("AC-9: a YARD_STAFF profile signs in and lands on /stock-entry, with the header showing its name", async ({
  page,
}) => {
  const user = await newUser("YARD_STAFF");

  await signIn(page, user);

  expect(new URL(page.url()).pathname).toBe("/stock-entry");
  await expect(page.getByTestId("signed-in-name")).toHaveText(user.name);

  const session = await page.request.get("/api/session");
  expect(session.status()).toBe(200);
  const body = (await session.json()) as Record<string, unknown>;
  expect(Object.keys(body).sort()).toEqual(["id", "landingPath", "name", "role", "username"]);
  expect(body).toEqual({
    id: user.id,
    username: user.username,
    name: user.name,
    role: "YARD_STAFF",
    landingPath: "/stock-entry",
  });

  expect(await sessionCookieNames(page.context())).toContain(SESSION_COOKIE);
});

test("AC-9: an ADMIN signs in and lands on /stock-takes", async ({ page }) => {
  const user = await newUser("ADMIN");

  await signIn(page, user);

  expect(new URL(page.url()).pathname).toBe("/stock-takes");
  const session = await page.request.get("/api/session");
  expect(await session.json()).toMatchObject({ role: "ADMIN", landingPath: "/stock-takes" });
});

test("AC-9: the username typed in capitals, or with spaces around it, signs in the same profile", async ({
  browser,
}) => {
  const user = await newUser("YARD_STAFF");

  for (const typed of [user.username.toUpperCase(), `  ${user.username}  `]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/sign-in");
    await addKnownDevice(page);
    await enterCredentials(page, { ...user, username: typed });

    await expect(page.getByTestId("signed-in-name")).toHaveText(user.name);
    const session = await page.request.get("/api/session");
    expect((await session.json()).username).toBe(user.username);
    await context.close();
  }
});

test("AC-9: from a callbackUrl an ADMIN lands there, and an off-site callbackUrl is ignored", async ({
  browser,
}) => {
  const admin = await newUser("ADMIN");

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/analysis");
  expect(page.url()).toContain("/sign-in?callbackUrl=%2Fanalysis");
  await addKnownDevice(page);
  await enterCredentials(page, admin);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Analysis");
  expect(new URL(page.url()).pathname).toBe("/analysis");
  await context.close();

  for (const offsite of ["//evil.example/x", "https://evil.example/x"]) {
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await otherPage.goto(`/sign-in?callbackUrl=${encodeURIComponent(offsite)}`);
    await addKnownDevice(otherPage);
    await enterCredentials(otherPage, admin);
    await otherPage.waitForURL((url) => url.pathname !== "/sign-in");
    expect(otherPage.url(), offsite).not.toContain("evil.example");
    expect(new URL(otherPage.url()).pathname, offsite).toBe("/stock-takes");
    await other.close();
  }
});

test("AC-9: the form has exactly two text-entry controls, username and pin, and nothing named email or password", async ({
  page,
}) => {
  await page.goto("/sign-in");

  const entries = page.locator(
    'form input:not([type="hidden"]):not([type="submit"]):not([type="button"]), form textarea',
  );
  await expect(entries).toHaveCount(2);
  expect(await entries.evaluateAll((nodes) => nodes.map((node) => node.getAttribute("name")))).toEqual([
    "username",
    "pin",
  ]);

  const names = await page
    .locator("form [name]")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("name") ?? ""));
  const labels = await page.locator("form label").allInnerTexts();
  for (const text of [...names, ...labels]) {
    expect(text).not.toMatch(/email|password/i);
  }
});

/* ------------------------------------------------------------------ AC-10 */

test("AC-10: every failure is one answer — unknown, wrong, pending, deactivated, rejected and malformed", async ({
  page,
}) => {
  const active = await newUser("YARD_STAFF");

  const pendingUsername = `e2e-${randomBytes(10).toString("hex")}`;
  const pendingPin = generatePin(6);
  const pending = await db.user.create({
    data: {
      name: "sign-in-pending",
      requestedUsername: pendingUsername,
      status: "PENDING",
      ...(await hashPin(pendingPin)),
    },
    select: { id: true },
  });
  createdIds.push(pending.id);
  created.push(pendingUsername);

  const leaver = await newUser("YARD_STAFF");
  await deactivate(leaver.username);

  const rejectedUsername = `e2e-${randomBytes(10).toString("hex")}`;
  const rejected = await db.user.create({
    data: { name: "sign-in-rejected", status: "REJECTED" },
    select: { id: true },
  });
  createdIds.push(rejected.id);
  created.push(rejectedUsername);

  const attempts: [string, string, string][] = [
    ["(a) a username no profile holds", strangerUsername(), generatePin(6)],
    ["(b) a wrong PIN", active.username, wrongPin(active.pin)],
    ["(c) a PENDING request", pendingUsername, pendingPin],
    ["(d) a DEACTIVATED profile's former PIN", leaver.username, leaver.pin],
    ["(e) a REJECTED request", rejectedUsername, generatePin(6)],
    ["(f) a 3-digit PIN", active.username, generatePin(4).slice(0, 3)],
    ["(f) a 5-digit PIN", active.username, generatePin(6).slice(0, 5)],
    ["(f) a trivial 4-digit PIN", active.username, trivialPin(4)],
    ["(f) a trivial 6-digit PIN", active.username, trivialPin(6)],
    ["(f) a username beginning with a digit", `7${randomBytes(5).toString("hex")}`, active.pin],
  ];

  const rendered: string[] = [];
  for (const [label, username, pin] of attempts) {
    await page.context().clearCookies();
    await page.goto("/sign-in");
    devices.push(await addKnownDevice(page));

    const status = await attempt(page, username, pin);

    expect(status, label).toBe(200);
    const error = page.getByTestId("sign-in-error");
    await expect(error, label).toHaveText(INCORRECT_SIGN_IN_MESSAGE);
    rendered.push(await error.evaluate((node) => node.outerHTML));
    await expect(page.getByLabel("Username"), label).toHaveValue(username);
    await expect(page.getByLabel("PIN", { exact: true }), label).toHaveValue("");
    expect(await sessionCookieNames(page.context()), label).not.toContain(SESSION_COOKIE);
    expect((await page.request.get("/api/session")).status(), label).toBe(401);
  }

  // Identical in every case — that is the criterion, not merely "an error appeared".
  expect(new Set(rendered).size).toBe(1);
});

/* ------------------------------------------------------------------ AC-12 */

test("AC-12: a locked username says so identically for a live profile and an invented one, and an open session survives", async ({
  browser,
}) => {
  const live = await newUser("YARD_STAFF");
  const invented = strangerUsername();

  // The profile's own session, opened before the lock.
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signIn(ownerPage, live);

  const lockedHtml: string[] = [];
  for (const [username, correct] of [
    [live.username, live.pin],
    [invented, generatePin(6)],
  ] as const) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto("/sign-in");
    await addKnownDevice(page);

    for (let failure = 0; failure < 5; failure += 1) {
      await attempt(page, username, wrongPin(correct));
      await expect(page.getByTestId("sign-in-error")).toHaveText(INCORRECT_SIGN_IN_MESSAGE);
    }
    await attempt(page, username, correct);

    const error = page.getByTestId("sign-in-error");
    await expect(error).toHaveText(ACCOUNT_LOCKED_MESSAGE);
    lockedHtml.push(await error.evaluate((node) => node.outerHTML));
    expect((await page.request.get("/api/session")).status()).toBe(401);
    await context.close();
  }

  expect(lockedHtml[0]).toBe(lockedHtml[1]);
  expect((await ownerPage.request.get("/api/session")).status()).toBe(200);
  await ownerContext.close();
});

/* ------------------------------------------------------------------ AC-15 */

test("AC-15: the credentials callback and the form meet the same budget and the same lock", async ({
  browser,
}) => {
  const [first, second, third] = [
    await newUser("YARD_STAFF"),
    await newUser("YARD_STAFF"),
    await newUser("YARD_STAFF"),
  ];

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/sign-in");
  await addKnownDevice(page);
  const token = (await context.cookies()).find((cookie) => cookie.name === DEVICE_COOKIE)?.value;
  const bucket = `pin:device:${verifyDeviceToken(token) ?? "none"}`;

  const csrf = (await (await page.request.get("/api/auth/csrf")).json()) as { csrfToken: string };
  for (const target of [first, second]) {
    for (let failure = 0; failure < 5; failure += 1) {
      const response = await page.request.post("/api/auth/callback/credentials", {
        form: {
          csrfToken: csrf.csrfToken,
          username: target.username,
          pin: wrongPin(target.pin),
          callbackUrl: "/stock-entry",
        },
        maxRedirects: 0,
      });
      expect(response.status()).toBeLessThan(400);
    }
  }

  expect(await sessionCookieNames(context)).not.toContain(SESSION_COOKIE);
  expect(await db.authEvent.count({ where: { kind: "PIN_FAILURE", bucket } })).toBe(10);
  for (const target of [first, second]) {
    const lock = await db.accountLock.findUnique({
      where: { accountKey: accountKey(target.username) },
      select: { lockedUntil: true },
    });
    expect(lock?.lockedUntil?.getTime() ?? 0).toBeGreaterThan(Date.now());
  }

  await page.goto("/sign-in");
  await attempt(page, third.username, third.pin);
  await expect(page.getByTestId("sign-in-error")).toHaveText(SIGN_IN_PAUSED_MESSAGE);
  expect(await sessionCookieNames(context)).not.toContain(SESSION_COOKIE);
  expect((await page.request.get("/api/session")).status()).toBe(401);
  await context.close();

  // Another known device: one wrong PIN through the form is one event and one step.
  const fresh = await browser.newContext();
  const freshPage = await fresh.newPage();
  await freshPage.goto("/sign-in");
  await addKnownDevice(freshPage);
  const freshToken = (await fresh.cookies()).find((cookie) => cookie.name === DEVICE_COOKIE)?.value;
  const freshBucket = `pin:device:${verifyDeviceToken(freshToken) ?? "none"}`;
  const before = await db.accountLock.findUnique({
    where: { accountKey: accountKey(third.username) },
    select: { consecutiveFailures: true },
  });

  await attempt(freshPage, third.username, wrongPin(third.pin));
  await expect(freshPage.getByTestId("sign-in-error")).toHaveText(INCORRECT_SIGN_IN_MESSAGE);

  expect(await db.authEvent.count({ where: { bucket: freshBucket } })).toBe(1);
  const after = await db.accountLock.findUnique({
    where: { accountKey: accountKey(third.username) },
    select: { consecutiveFailures: true },
  });
  expect(after?.consecutiveFailures).toBe((before?.consecutiveFailures ?? 0) + 1);
  await fresh.close();
});

/* ------------------------------------------------------------------ AC-17 */

test("AC-17: a session with no epoch claim is refused, though its profile is ACTIVE", async ({
  context,
  baseURL,
}) => {
  test.skip((process.env.AUTH_SECRET ?? "") === "", "AUTH_SECRET is not set in this environment");
  const user = await newUser("YARD_STAFF");

  const token = await mintSession({ sub: user.id, role: "YARD_STAFF" });
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL as string }]);
  const page = await context.newPage();

  const refused = await page.request.get("/stock-entry", { maxRedirects: 0 });
  expect([302, 307]).toContain(refused.status());
  expect(refused.headers().location).toBe("/sign-in?reason=inactive");
  expect((await page.request.get("/api/session")).status()).toBe(401);
});

test("AC-17: after a PIN reset the profile's open session is refused on its next request", async ({
  page,
}) => {
  const admin = await newUser("ADMIN");
  const staff = await newUser("YARD_STAFF");
  await signIn(page, staff);
  const before = await page.context().cookies();

  await resetProfilePin(actorFor(admin), staff.id, 6);

  // The test does not touch the session cookie: the check is server-side, against the row.
  expect((await page.context().cookies()).map((cookie) => cookie.value)).toEqual(
    before.map((cookie) => cookie.value),
  );
  const refused = await page.request.get("/stock-entry", { maxRedirects: 0 });
  expect([302, 307]).toContain(refused.status());
  expect(refused.headers().location).toBe("/sign-in?reason=inactive");
  expect((await page.request.get("/api/session")).status()).toBe(401);

  await page.goto("/stock-entry");
  await expect(page.getByTestId("inactive-message")).toHaveText(SESSION_ENDED_MESSAGE);
});

test("AC-17: an ADMIN role claim on a YARD_STAFF profile's token is never read", async ({
  context,
  baseURL,
}) => {
  test.skip((process.env.AUTH_SECRET ?? "") === "", "AUTH_SECRET is not set in this environment");
  const staff = await newUser("YARD_STAFF");

  const token = await mintSession({ sub: staff.id, role: "ADMIN", epoch: 0 });
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL as string }]);
  const page = await context.newPage();

  expect((await page.request.get("/api/session")).status()).toBe(200);
  expect((await page.request.get("/api/users")).status()).toBe(403);
});

test("003 AC-11, amended by 021 AC-17: deactivation ends the session on its next request", async ({
  page,
}) => {
  const user = await newUser("YARD_STAFF");
  await signIn(page, user);

  await deactivate(user.username);

  const refused = await page.request.get("/stock-entry", { maxRedirects: 0 });
  expect([302, 307]).toContain(refused.status());
  expect(refused.headers().location).toBe("/sign-in?reason=inactive");
  expect((await page.request.get("/api/session")).status()).toBe(401);
});

/* ------------------------------------------------------------------ AC-36 */

test("AC-36: a half-typed PIN is forgotten when the page hides, when it is restored, and on reload", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const pinField = page.getByLabel("PIN", { exact: true });

  const tapDigits = async (): Promise<string> => {
    const digits = Array.from({ length: 3 }, () => String(randomInt(10))).join("");
    for (const digit of digits) {
      await page.getByTestId(`pin-key-${digit}`).click();
    }
    await expect(pinField).toHaveValue(digits);
    return digits;
  };

  const leftAnywhere = async (digits: string): Promise<string[]> => {
    const stored = await page.evaluate(() => [
      ...Object.values({ ...window.localStorage }),
      ...Object.values({ ...window.sessionStorage }),
    ]);
    const cookies = (await page.context().cookies()).map((cookie) => cookie.value);
    return [...stored, ...cookies, page.url()].filter((value) => value.includes(digits));
  };

  const hidden = await tapDigits();
  expect(await leftAnywhere(hidden)).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(pinField).toHaveValue("");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  const restored = await tapDigits();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect(pinField).toHaveValue("");
  expect(await leftAnywhere(restored)).toEqual([]);

  const reloaded = await tapDigits();
  await page.reload();
  await expect(page.getByLabel("PIN", { exact: true })).toHaveValue("");
  expect(await leftAnywhere(reloaded)).toEqual([]);
});

/* ------------------------------------------------------------------ 003 AC-21 */

test("003 AC-21: signing out ends the session", async ({ page }) => {
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

/* ------------------------------------------------------------------ AC-40 */

test("AC-40: nothing in this file reached the new-device budget the real users share", async () => {
  expect(
    await db.authEvent.count({
      where: { bucket: "pin:new-devices", kind: "PIN_FAILURE", at: { gte: startedAt } },
    }),
  ).toBe(0);
});
