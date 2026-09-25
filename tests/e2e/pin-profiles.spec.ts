import { randomBytes } from "node:crypto";

import type { Browser, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  ACCOUNT_LOCKED_LABEL,
  CLEAR_LOCK_LABEL,
  CREDENTIAL_NEEDS_RESET_LABEL,
  INCORRECT_SIGN_IN_MESSAGE,
  NEW_DEVICES_PAUSED_MESSAGE,
  PIN_FAILURES_SUMMARY,
  PROFILE_STATUS_LABELS,
  RESET_PIN_SHOWN_ONCE,
  RESUME_NEW_DEVICES_LABEL,
  USERNAME_TAKEN_MESSAGE,
} from "@/lib/auth-messages";
import { generatePin, parsePin } from "@/server/auth/credential-rules";
import { accountKey, hashPin } from "@/server/auth/password";
import { db } from "@/server/db";

import { skipWithoutDatabase } from "./support/database";
import {
  addKnownDevice,
  createTestUser,
  enterCredentials,
  forgetDevices,
  removeUser,
  signIn,
} from "./support/users";
import type { TestUser } from "./support/users";

/**
 * `/profiles`, the admin section, in a real browser against a real server and the
 * development database (021 AC-21 to AC-26, and the `/profiles` halves of AC-23, AC-32,
 * AC-34 and AC-35).
 *
 * THE DEVELOPMENT DATABASE HOLDS PROFILES THIS FILE DOES NOT OWN — administrators among them —
 * and `/profiles` lists every one. So this file finds its own rows by their own ids, never
 * counts anyone else's, and never presses a control on a row it did not create. The
 * last-administrator rule, which depends on how many administrators exist, is proved in
 * `profile-admin-service.db.test.ts`, where the test builds the whole population.
 *
 * NO NEW-DEVICE BUDGET IS SPENT (AC-40): every sign-in and every deliberate failure is made
 * from a freshly minted known device, requests are written directly, and the last test
 * asserts that nothing reached the shared buckets while this file ran. Every profile it
 * creates is removed with its lock row and its events.
 *
 * Every PIN is drawn at runtime by `generatePin` (AC-8).
 */
const created: string[] = [];
const createdIds: string[] = [];
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

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function freshUsername(): string {
  const username = `e2e-${hex(10)}`;
  created.push(username);
  return username;
}

async function newUser(role: "YARD_STAFF" | "ADMIN"): Promise<TestUser> {
  const user = await createTestUser(role, "pin-profiles");
  created.push(user.username);
  return user;
}

function wrongPin(pin: string): string {
  for (;;) {
    const other = generatePin(6);
    if (other !== pin) return other;
  }
}

type Request = { id: string; requestedUsername: string; name: string; pin: string };

/**
 * A `PENDING` request in the shape `requestProfile` writes, written directly so that no
 * request budget is spent. Called only after `createTestUser`, which skips without a pepper.
 */
async function pendingRequest(): Promise<Request> {
  const requestedUsername = freshUsername();
  const name = `pin-profiles-request-${hex(8)}`;
  const pin = generatePin(6);
  const { pinHash, pinKeyId } = await hashPin(pin);
  const row = await db.user.create({
    data: { name, requestedUsername, status: "PENDING", role: "YARD_STAFF", pinHash, pinKeyId },
    select: { id: true },
  });
  createdIds.push(row.id);
  return { id: row.id, requestedUsername, name, pin };
}

/** React's root has hydrated, so a click reaches the form's action, as C1's spec waits. */
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    type Root = { stateNode?: { current?: { memoizedState?: { isDehydrated?: boolean } } } };
    const holder = document as unknown as Record<string, Root | undefined>;
    const key = Object.keys(holder).find((name) => name.startsWith("__reactContainer$"));
    return (
      key !== undefined && holder[key]?.stateNode?.current?.memoizedState?.isDehydrated === false
    );
  });
}

async function openProfiles(page: Page, admin: TestUser): Promise<void> {
  await signIn(page, admin);
  await page.goto("/profiles");
  await expect(page.locator("h1")).toHaveText("Profiles");
  await hydrated(page);
}

/** The path and query a redirect answered with. */
function locationOf(headers: Record<string, string>): string {
  const target = new URL(headers["location"] ?? "", "http://localhost");
  return `${target.pathname}${target.search}`;
}

/** Signs `user` in from a context of its own, and closes it. */
async function signsIn(browser: Browser, user: TestUser): Promise<void> {
  const context = await browser.newContext();
  try {
    await signIn(await context.newPage(), user);
  } finally {
    await context.close();
  }
}

/* ------------------------------------------------------------------ AC-22 */

test("AC-22: signed out, /profiles answers 307 to /sign-in?callbackUrl=%2Fprofiles", async ({
  request,
}) => {
  const response = await request.get("/profiles", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(locationOf(response.headers())).toBe("/sign-in?callbackUrl=%2Fprofiles");
});

test("AC-22: a YARD_STAFF session answers 307 to /stock-entry?denied=profiles, and the response names no profile", async ({
  page,
}) => {
  const admin = await newUser("ADMIN");
  const staff = await newUser("YARD_STAFF");
  await signIn(page, staff);

  const response = await page.request.get("/profiles", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(locationOf(response.headers())).toBe("/stock-entry?denied=profiles");
  const body = await response.text();
  for (const user of [admin, staff]) {
    expect(body).not.toContain(user.name);
    expect(body).not.toContain(user.username);
  }
});

test("AC-22, AC-34: an ADMIN gets 200, the h1 Profiles and a row per profile, PENDING first then oldest first, and no euro", async ({
  page,
}) => {
  const admin = await newUser("ADMIN");
  const staff = await newUser("YARD_STAFF");
  const request = await pendingRequest();
  await signIn(page, admin);

  const response = await page.goto("/profiles");

  expect(response?.status()).toBe(200);
  expect(await response?.text()).not.toContain("€");
  await expect(page.locator("h1")).toHaveText("Profiles");
  for (const user of [admin, staff]) {
    await expect(page.getByTestId(`profile-name-${user.id}`)).toHaveText(user.name);
    await expect(page.getByTestId(`profile-username-${user.id}`)).toHaveText(user.username);
    await expect(page.getByTestId(`profile-role-${user.id}`)).toHaveText(user.role);
    await expect(page.getByTestId(`profile-status-${user.id}`)).toHaveText(PROFILE_STATUS_LABELS.ACTIVE);
    await expect(page.getByTestId(`profile-created-${user.id}`)).toHaveText(/^\d{4}-\d{2}-\d{2}$/);
  }
  await expect(page.getByTestId(`profile-name-${request.id}`)).toHaveText(request.name);
  await expect(page.getByTestId(`profile-username-${request.id}`)).toHaveText(request.requestedUsername);
  await expect(page.getByTestId(`profile-role-${request.id}`)).toHaveText("YARD_STAFF");
  await expect(page.getByTestId(`profile-status-${request.id}`)).toHaveText(PROFILE_STATUS_LABELS.PENDING);

  // The order, read from the one render: every waiting row before every other, and each
  // group oldest first. The rows other files own are in it too, and obey the same rule.
  const rows = await page
    .getByTestId("profile-list")
    .locator(":scope > li")
    .evaluateAll((items) =>
      items.map((item) => ({
        id: item.getAttribute("data-testid") ?? "",
        status: item.querySelector("[data-testid^='profile-status-']")?.textContent ?? "",
        created: item.querySelector("[data-testid^='profile-created-'] time")?.getAttribute("datetime") ?? "",
      })),
    );
  expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
  const waiting = rows.map((row) => row.status === PROFILE_STATUS_LABELS.PENDING);
  expect(waiting.indexOf(false) === -1 || waiting.lastIndexOf(true) < waiting.indexOf(false)).toBe(true);
  for (const group of [true, false]) {
    const created = rows.filter((_, index) => waiting[index] === group).map((row) => row.created);
    expect(created).toEqual([...created].sort());
  }
  const ids = rows.map((row) => row.id);
  expect(ids.indexOf(`profile-${request.id}`)).toBeLessThan(ids.indexOf(`profile-${admin.id}`));
});

test("AC-22: as an ADMIN, /analysis renders exactly one link to /profiles, in its header, with no query parameter, and it leads there", async ({
  page,
}) => {
  const admin = await newUser("ADMIN");
  await signIn(page, admin);

  await page.goto("/analysis");

  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"), (anchor) => anchor.getAttribute("href") ?? ""),
  );
  expect(hrefs.filter((href) => new URL(href, "http://localhost").pathname === "/profiles")).toEqual([
    "/profiles",
  ]);
  const link = page.locator("header").locator('a[href="/profiles"]');
  await expect(link).toHaveCount(1);

  await link.click();
  await expect(page.locator("h1")).toHaveText("Profiles");
  expect(new URL(page.url()).pathname).toBe("/profiles");
});

/* ------------------------------------------------------------------ AC-21 */

test("AC-21: the approval form pre-fills the requested username, and approving with an edited one lets the requester sign in with it and their own PIN", async ({
  page,
  browser,
}) => {
  const admin = await newUser("ADMIN");
  const request = await pendingRequest();
  await openProfiles(page, admin);
  const field = page.getByTestId(`approve-username-${request.id}`);
  await expect(field).toHaveValue(request.requestedUsername);
  const edited = freshUsername();

  await field.fill(edited);
  await page.getByTestId(`approve-role-${request.id}`).selectOption("YARD_STAFF");
  await page.getByTestId(`approve-${request.id}`).click();

  await expect(page.getByTestId(`profile-status-${request.id}`)).toHaveText(PROFILE_STATUS_LABELS.ACTIVE);
  await expect(page.getByTestId(`profile-username-${request.id}`)).toHaveText(edited);
  await signsIn(browser, {
    id: request.id,
    username: edited,
    name: request.name,
    pin: request.pin,
    role: "YARD_STAFF",
  });
});

test("AC-21: approving with a username another profile holds renders USERNAME_TAKEN_MESSAGE beside the form, and the request stays waiting", async ({
  page,
}) => {
  const admin = await newUser("ADMIN");
  const holder = await newUser("YARD_STAFF");
  const request = await pendingRequest();
  await openProfiles(page, admin);

  await page.getByTestId(`approve-username-${request.id}`).fill(holder.username);
  await page.getByTestId(`approve-${request.id}`).click();

  await expect(page.getByTestId(`approve-error-${request.id}`)).toHaveText(
    USERNAME_TAKEN_MESSAGE(holder.username),
  );
  await expect(page.getByTestId(`profile-status-${request.id}`)).toHaveText(PROFILE_STATUS_LABELS.PENDING);
  expect(
    await db.user.findUniqueOrThrow({
      where: { id: request.id },
      select: { status: true, requestedUsername: true, username: true },
    }),
  ).toEqual({ status: "PENDING", requestedUsername: request.requestedUsername, username: null });
});

/* ------------------------------------------------------------------ AC-24 */

test("AC-24: a reset renders the new PIN once beside RESET_PIN_SHOWN_ONCE and the name; no later GET, no column and no console holds it; it signs in", async ({
  page,
  browser,
}) => {
  const admin = await newUser("ADMIN");
  const staff = await newUser("YARD_STAFF");
  const printed: string[] = [];
  page.on("console", (message) => printed.push(message.text()));
  await openProfiles(page, admin);
  const row = page.getByTestId(`profile-${staff.id}`);
  // The action's answer is streamed, and a browser keeps no copy of a streamed body to read
  // afterwards; so the one POST is fetched through the test and handed on whole.
  const actionBodies: string[] = [];
  await page.route("**/profiles", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const answer = await route.fetch();
    const body = await answer.text();
    actionBodies.push(body);
    return route.fulfill({ response: answer, body });
  });

  await row.getByTestId(`reset-6-${staff.id}`).click();

  const shown = row.getByTestId("new-pin");
  await expect(shown).toHaveText(/^\d{6}$/);
  const newPin = (await shown.textContent()) ?? "";
  expect(parsePin(newPin)).toBe(newPin);
  await page.unroute("**/profiles");
  expect(actionBodies).toHaveLength(1);
  expect(actionBodies[0]).toContain(newPin);
  await expect(row.getByTestId("new-pin-notice")).toContainText(RESET_PIN_SHOWN_ONCE);
  await expect(row.getByTestId("new-pin-for")).toHaveText(staff.name);

  const later = await page.request.get("/profiles");
  expect(later.status()).toBe(200);
  expect(await later.text()).not.toContain(newPin);
  const stored = [
    ...(await db.user.findMany()),
    ...(await db.accountLock.findMany()),
    ...(await db.authEvent.findMany()),
  ].flatMap((row) => Object.values(row).map(String));
  expect(stored.filter((value) => value === newPin)).toEqual([]);
  expect(printed.filter((line) => line.includes(newPin))).toEqual([]);

  await signsIn(browser, { ...staff, pin: newPin });
});

/* ------------------------------------------------------------------ AC-25 */

test("AC-25: an ADMIN creates an ADMIN profile directly, its PIN is rendered once as a reset's is, and that username and PIN sign in", async ({
  page,
  browser,
}) => {
  const admin = await newUser("ADMIN");
  await openProfiles(page, admin);
  const section = page.getByTestId("create-profile-section");
  const username = freshUsername();
  const name = `pin-profiles-created-${hex(8)}`;

  await section.locator("#create-name").fill(name);
  await section.locator("#create-username").fill(username.toUpperCase());
  await section.locator("#create-role").selectOption("ADMIN");
  await section.locator("#create-length").selectOption("6");
  await section.getByTestId("create-profile-admin-submit").click();

  const shown = section.getByTestId("new-pin");
  await expect(shown).toHaveText(/^\d{6}$/);
  const newPin = (await shown.textContent()) ?? "";
  await expect(section.getByTestId("new-pin-notice")).toContainText(RESET_PIN_SHOWN_ONCE);
  await expect(section.getByTestId("new-pin-for")).toHaveText(name);
  expect(
    await db.user.findUniqueOrThrow({
      where: { username },
      select: { name: true, role: true, status: true },
    }),
  ).toEqual({ name, role: "ADMIN", status: "ACTIVE" });
  expect(await (await page.request.get("/profiles")).text()).not.toContain(newPin);

  const row = await db.user.findUniqueOrThrow({ where: { username }, select: { id: true } });
  await signsIn(browser, { id: row.id, username, name, pin: newPin, role: "ADMIN" });
});

/* ------------------------------------------------------------------ AC-26 */

test("AC-26: after one incorrect PIN from this file's known device, the summary is PIN_FAILURES_SUMMARY with one or more from known devices, and nothing says new devices are paused", async ({
  page,
  browser,
}) => {
  const admin = await newUser("ADMIN");
  const staff = await newUser("YARD_STAFF");
  const context = await browser.newContext();
  const guesser = await context.newPage();
  await guesser.goto("/sign-in");
  devices.push(await addKnownDevice(guesser));
  await enterCredentials(guesser, { ...staff, pin: wrongPin(staff.pin) });
  await expect(guesser.getByTestId("sign-in-error")).toHaveText(INCORRECT_SIGN_IN_MESSAGE);
  await context.close();

  await openProfiles(page, admin);

  const text = (await page.getByTestId("pin-failures").textContent()) ?? "";
  // The sentence's shape, from the builder itself: three markers become three numbers.
  const markers = [7_000_001, 7_000_002, 7_000_003] as const;
  let shape = PIN_FAILURES_SUMMARY(...markers).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const marker of markers) shape = shape.replace(String(marker), "(\\d+)");
  const [, a, b, c] = new RegExp(`^${shape}$`).exec(text) ?? [];
  expect(text).toBe(PIN_FAILURES_SUMMARY(Number(a), Number(b), Number(c)));
  expect(Number(b)).toBeGreaterThanOrEqual(1);
  await expect(page.getByTestId(`failures-${staff.id}`)).toHaveText("1");
  await expect(page.getByText(NEW_DEVICES_PAUSED_MESSAGE)).toHaveCount(0);
  await expect(page.getByRole("button", { name: RESUME_NEW_DEVICES_LABEL })).toHaveCount(0);
});

test("AC-26: a locked row shows ACCOUNT_LOCKED_LABEL with its end and CLEAR_LOCK_LABEL; clearing lets the correct PIN in at once, keeps the level and writes no event", async ({
  page,
  browser,
}) => {
  const admin = await newUser("ADMIN");
  const staff = await newUser("YARD_STAFF");
  const key = accountKey(staff.username);
  const until = new Date(Date.now() + 30 * 60_000);
  await db.accountLock.create({
    data: { accountKey: key, consecutiveFailures: 0, level: 2, lockedUntil: until },
  });
  await openProfiles(page, admin);
  const lock = page.getByTestId(`lock-${staff.id}`);
  await expect(lock).toContainText(ACCOUNT_LOCKED_LABEL);
  await expect(lock.locator("time")).toHaveAttribute("datetime", until.toISOString());
  await expect(page.getByTestId(`lock-${admin.id}`)).toHaveCount(0);
  const events = await db.authEvent.count({ where: { accountKey: key } });

  await lock.getByRole("button", { name: CLEAR_LOCK_LABEL }).click();

  await expect(lock).toHaveCount(0);
  expect(
    await db.accountLock.findUniqueOrThrow({
      where: { accountKey: key },
      select: { consecutiveFailures: true, level: true, lockedUntil: true },
    }),
  ).toEqual({ consecutiveFailures: 0, level: 2, lockedUntil: null });
  expect(await db.authEvent.count({ where: { accountKey: key } })).toBe(events);
  await signsIn(browser, staff);
});

/* ------------------------------------------------------------------ AC-23 */

test("AC-23: an ADMIN demoted from /profiles is staff on its next request and admin again once promoted; deactivated, it is signed out and its PIN is gone", async ({
  page,
  browser,
}) => {
  const admin = await newUser("ADMIN");
  const target = await newUser("ADMIN");
  const context = await browser.newContext();
  const targetPage = await context.newPage();
  await signIn(targetPage, target);
  await openProfiles(page, admin);

  await page.getByTestId(`make-YARD_STAFF-${target.id}`).click();
  await expect(page.getByTestId(`profile-role-${target.id}`)).toHaveText("YARD_STAFF");

  const analysis = await targetPage.request.get("/analysis", { maxRedirects: 0 });
  expect(analysis.status()).toBe(307);
  expect(locationOf(analysis.headers())).toBe("/stock-entry?denied=analysis");
  const session = await targetPage.request.get("/api/session");
  const sessionBody = await session.text();
  expect(sessionBody).toContain('"role":"YARD_STAFF"');
  expect(`${await analysis.text()}${sessionBody}`).not.toContain("€");

  await page.getByTestId(`make-ADMIN-${target.id}`).click();
  await expect(page.getByTestId(`profile-role-${target.id}`)).toHaveText("ADMIN");
  expect((await targetPage.request.get("/analysis", { maxRedirects: 0 })).status()).toBe(200);

  await page.getByTestId(`deactivate-open-${target.id}`).click();
  await page.getByTestId(`deactivate-${target.id}`).click();
  await expect(page.getByTestId(`profile-status-${target.id}`)).toHaveText(
    PROFILE_STATUS_LABELS.DEACTIVATED,
  );

  await targetPage.goto("/stock-entry");
  expect(`${new URL(targetPage.url()).pathname}${new URL(targetPage.url()).search}`).toBe(
    "/sign-in?reason=inactive",
  );
  expect((await targetPage.request.get("/api/session")).status()).toBe(401);
  expect(
    await db.user.findUniqueOrThrow({
      where: { id: target.id },
      select: { username: true, pinHash: true, pinKeyId: true },
    }),
  ).toEqual({ username: target.username, pinHash: null, pinKeyId: null });

  devices.push(await addKnownDevice(targetPage));
  await enterCredentials(targetPage, target);
  await expect(targetPage.getByTestId("sign-in-error")).toHaveText(INCORRECT_SIGN_IN_MESSAGE);
  await context.close();
});

/* ------------------------------------------------------------------ AC-32 */

test("AC-32: a profile whose PIN was stored under another pepper is marked CREDENTIAL_NEEDS_RESET_LABEL in its row", async ({
  page,
}) => {
  const admin = await newUser("ADMIN");
  const staff = await newUser("YARD_STAFF");
  // Another pepper's fingerprint: the shape `pinKeyId` has, drawn at runtime.
  await db.user.update({ where: { id: staff.id }, data: { pinKeyId: hex(8) } });

  await openProfiles(page, admin);

  await expect(page.getByTestId(`needs-reset-${staff.id}`)).toHaveText(CREDENTIAL_NEEDS_RESET_LABEL);
  await expect(page.getByTestId(`needs-reset-${admin.id}`)).toHaveCount(0);
});

/* ------------------------------------------------------------------ AC-35 */

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]) {
  test.describe(`/profiles at ${viewport.width} px`, () => {
    test.use({ viewport });

    test(`AC-35: at ${viewport.width} px /profiles does not scroll sideways, and every action control is at least 44 px tall`, async ({
      page,
    }) => {
      const admin = await newUser("ADMIN");
      const staff = await newUser("YARD_STAFF");
      const request = await pendingRequest();
      await db.accountLock.create({
        data: {
          accountKey: accountKey(staff.username),
          consecutiveFailures: 0,
          level: 1,
          lockedUntil: new Date(Date.now() + 15 * 60_000),
        },
      });
      await openProfiles(page, admin);
      await page.getByTestId(`deactivate-open-${staff.id}`).click();
      await expect(page.getByTestId(`deactivate-${staff.id}`)).toBeVisible();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

      // The header's sign-out counts too (021 C2-2): it is an action control on this page.
      const scopes = [
        page.locator("header"),
        page.getByTestId(`profile-${request.id}`),
        page.getByTestId(`profile-${staff.id}`),
        page.getByTestId(`profile-${admin.id}`),
        page.getByTestId("create-profile-section"),
      ];
      let measured = 0;
      for (const scope of scopes) {
        const controls = scope
          .locator("button, select, summary, input:not([type='hidden'])")
          .filter({ visible: true });
        for (const control of await controls.all()) {
          const box = await control.boundingBox();
          const label = (await control.getAttribute("data-testid")) ?? (await control.getAttribute("id")) ?? "";
          expect(box, label).not.toBeNull();
          expect(box?.height ?? 0, label).toBeGreaterThanOrEqual(44);
          expect((box?.x ?? -1) + (box?.width ?? Infinity), label).toBeLessThanOrEqual(viewport.width);
          measured += 1;
        }
      }
      // Sign-out; approve, its username and role, reject; two role changes, four resets, two
      // disclosures, one confirm, one clear; the create form's four fields and its submit.
      expect(measured).toBeGreaterThanOrEqual(19);
      await expect(page.locator("header").getByTestId("sign-out")).toBeVisible();
    });
  });
}

/* ------------------------------------------------------------------ AC-40 */

test("AC-40: nothing in this file reached a new-device budget the real users share", async () => {
  expect(
    await db.authEvent.count({
      where: { bucket: { in: ["pin:new-devices", "request:new-devices"] }, at: { gte: startedAt } },
    }),
  ).toBe(0);
});
