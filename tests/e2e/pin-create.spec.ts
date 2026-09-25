import { randomBytes, randomInt } from "node:crypto";

import { expect, test } from "@playwright/test";
import type { Page, Response } from "@playwright/test";

import {
  NAME_CHARACTERS_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  NAME_TOO_LONG_MESSAGE,
  PIN_FORMAT_MESSAGE,
  PIN_MISMATCH_MESSAGE,
  PIN_TOO_SIMPLE_MESSAGE,
  PROFILE_REQUEST_SENT,
  PROFILE_REQUESTS_PAUSED,
  USERNAME_FORMAT_MESSAGE,
} from "@/lib/auth-messages";
import { PROFILE_REQUEST_BUDGET } from "@/server/auth/attempt-budget";
import { generatePin, isTrivialPin } from "@/server/auth/credential-rules";
import { verifyPin } from "@/server/auth/password";
import { db } from "@/server/db";

import { skipWithoutDatabase } from "./support/database";
import { addKnownDevice, createTestUser, deactivate, forgetDevices, removeUser } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * *Create profile* and its acknowledgement, end to end (021 AC-18 to AC-20, and the
 * `/sign-in/create` and `/sign-in/requested` halves of AC-34 to AC-36). Level 4
 * (docs/verification.md): a real browser, the served build, the development database.
 *
 * THE DEVELOPMENT DATABASE'S NEW-DEVICE REQUEST BUDGET IS NEVER SPENT HERE (AC-40). Every
 * request is made from a known device minted for the test that makes it, and the last test
 * asserts that no `request:new-devices` event was written while this file ran. Every
 * request row, test profile and event this file creates is deleted afterwards.
 *
 * Every PIN is drawn at runtime by `generatePin`; a trivial one is built from the rule.
 */
const requestedUsernames: string[] = [];
const createdUsers: string[] = [];
const requestBuckets: string[] = [];
let startedAt = new Date();

test.beforeAll(() => {
  startedAt = new Date();
});

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.afterAll(async () => {
  const usernames = requestedUsernames.splice(0);
  if (usernames.length > 0) {
    await db.user.deleteMany({ where: { status: "PENDING", requestedUsername: { in: usernames } } });
  }
  for (const username of createdUsers.splice(0)) {
    await removeUser(username);
  }
  await forgetDevices(requestBuckets.splice(0));
});

type Typed = { name: string; username: string; pin: string; pinAgain: string };

/** A username nobody holds, registered so any request row for it is removed afterwards. */
function freshUsername(): string {
  const username = `e2e-${randomBytes(10).toString("hex")}`;
  requestedUsernames.push(username);
  return username;
}

function typed(overrides: Partial<Typed> = {}): Typed {
  const pin = generatePin(6);
  return {
    name: `pin-create-${randomBytes(8).toString("hex")}`,
    username: freshUsername(),
    pin,
    pinAgain: pin,
    ...overrides,
  };
}

async function newUser(): Promise<TestUser> {
  const user = await createTestUser("YARD_STAFF", "pin-create");
  createdUsers.push(user.username);
  requestedUsernames.push(user.username);
  return user;
}

/** A known device of this test's own; its request bucket is removed afterwards. */
async function knownDevice(page: Page): Promise<string> {
  const bucket = (await addKnownDevice(page)).replace(/^pin:/, "request:");
  requestBuckets.push(bucket);
  return bucket;
}

/**
 * Hydration has committed, read from React's root as `support/hydration.ts` reads it, so a
 * value typed now is not typed into markup React has yet to take over.
 */
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

async function fill(page: Page, entry: Typed): Promise<void> {
  await page.getByLabel("Your name").fill(entry.name);
  await page.getByLabel("Username").fill(entry.username);
  await page.getByLabel("PIN", { exact: true }).fill(entry.pin);
  await page.getByLabel("PIN again").fill(entry.pinAgain);
}

/** Submits the form and returns the response to its POST. */
async function submit(page: Page): Promise<Response> {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        new URL(candidate.url()).pathname === "/sign-in/create",
    ),
    page.getByTestId("create-profile-submit").click(),
  ]);
  return response;
}

async function rowsRequesting(username: string): Promise<number> {
  return db.user.count({ where: { requestedUsername: username.trim().toLowerCase() } });
}

/* ------------------------------------------------------------------ AC-18 */

test("AC-18: /sign-in links to Create profile, which answers 200 signed out and asks for four things", async ({
  page,
  request,
}) => {
  await page.goto("/sign-in");
  const link = page.getByRole("link", { name: "Create profile" });
  await expect(link).toHaveAttribute("href", "/sign-in/create");

  expect((await request.get("/sign-in/create")).status()).toBe(200);

  await link.click();
  await page.waitForURL((url) => url.pathname === "/sign-in/create");
  for (const label of ["Your name", "Username", "PIN again"]) {
    await expect(page.getByLabel(label)).toBeVisible();
  }
  await expect(page.getByLabel("PIN", { exact: true })).toBeVisible();
  await expect(page.getByTestId("create-profile-submit")).toHaveText("Send for approval");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
});

test("AC-18: a valid request lands on the acknowledgement and creates one PENDING YARD_STAFF row with no username", async ({
  page,
}) => {
  await page.goto("/sign-in/create");
  await knownDevice(page);
  await hydrated(page);
  const entry = typed();

  await fill(page, { ...entry, username: `  ${entry.username.toUpperCase()} ` });
  await page.getByTestId("create-profile-submit").click();

  await page.waitForURL((url) => url.pathname === "/sign-in/requested");
  await expect(page.getByTestId("profile-request-sent")).toHaveText(PROFILE_REQUEST_SENT);

  const rows = await db.user.findMany({ where: { requestedUsername: entry.username } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    status: "PENDING",
    role: "YARD_STAFF",
    username: null,
    name: entry.name,
  });
  expect(await verifyPin(entry.pin, rows[0]?.pinHash ?? null)).toBe(true);
});

test("AC-18: a request forged to carry role, status, username and pinHash creates the same PENDING YARD_STAFF row", async ({
  page,
}) => {
  await page.goto("/sign-in/create");
  await knownDevice(page);
  await hydrated(page);
  const entry = typed();
  const forgedUsername = freshUsername();

  await fill(page, entry);
  await page.evaluate(
    (fields) => {
      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        document.querySelector("form")?.appendChild(input);
      }
    },
    {
      role: "ADMIN",
      status: "ACTIVE",
      username: forgedUsername,
      pinHash: randomBytes(30).toString("base64"),
    },
  );
  await page.getByTestId("create-profile-submit").click();
  await page.waitForURL((url) => url.pathname === "/sign-in/requested");

  const rows = await db.user.findMany({ where: { requestedUsername: entry.username } });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ status: "PENDING", role: "YARD_STAFF", username: null });
  expect(await db.user.count({ where: { username: forgedUsername } })).toBe(0);
});

test("AC-18: each invalid input creates no row and re-renders 200 with its one message, keeping the name and username and emptying both PINs", async ({
  page,
}) => {
  await page.goto("/sign-in/create");
  await knownDevice(page);
  await hydrated(page);

  const trivial = String(randomInt(10)).repeat(6);
  expect(isTrivialPin(trivial)).toBe(true);
  const pin = generatePin(6);
  let other = generatePin(6);
  while (other === pin) other = generatePin(6);

  const cases: [string, Partial<Typed>, string][] = [
    ["a blank name", { name: "   " }, NAME_REQUIRED_MESSAGE],
    ["a name of 81 characters", { name: "n".repeat(81) }, NAME_TOO_LONG_MESSAGE],
    ["a name with a tab", { name: "Two\tParts" }, NAME_CHARACTERS_MESSAGE],
    ["a name with <", { name: "a<b" }, NAME_CHARACTERS_MESSAGE],
    ["a name with >", { name: "a>b" }, NAME_CHARACTERS_MESSAGE],
    ["a malformed username", { username: `9${randomBytes(4).toString("hex")}` }, USERNAME_FORMAT_MESSAGE],
    ["a malformed PIN", { pin: pin.slice(0, 5), pinAgain: pin.slice(0, 5) }, PIN_FORMAT_MESSAGE],
    ["a trivial PIN", { pin: trivial, pinAgain: trivial }, PIN_TOO_SIMPLE_MESSAGE],
    ["two different PINs", { pin, pinAgain: other }, PIN_MISMATCH_MESSAGE],
  ];

  for (const [label, overrides, message] of cases) {
    const entry = typed(overrides);
    await fill(page, entry);

    const response = await submit(page);

    expect(response.status(), label).toBe(200);
    await expect(page.getByTestId("create-profile-error"), label).toHaveText(message);
    await expect(page.getByLabel("Your name"), label).toHaveValue(entry.name);
    await expect(page.getByLabel("Username"), label).toHaveValue(entry.username);
    await expect(page.getByLabel("PIN", { exact: true }), label).toHaveValue("");
    await expect(page.getByLabel("PIN again"), label).toHaveValue("");
    expect(await rowsRequesting(entry.username), label).toBe(0);
  }
});

test("AC-18: a name carrying a line break or a carriage return, which only a forged field can hold, is refused with NAME_CHARACTERS_MESSAGE", async ({
  page,
}) => {
  await page.goto("/sign-in/create");
  await knownDevice(page);
  await hydrated(page);

  // A text field drops line breaks from its value, so the form cannot send one; a hidden
  // field keeps them, which is what a hand-made POST would carry.
  for (const breakCharacter of ["\n", "\r"]) {
    const entry = typed();
    await fill(page, entry);
    await page.evaluate((name) => {
      const visible = document.querySelector<HTMLInputElement>('input[name="name"]');
      if (visible !== null) visible.name = "not-the-name";
      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = "name";
      hidden.value = name;
      document.querySelector("form")?.prepend(hidden);
    }, `Two${breakCharacter}Lines`);

    const response = await submit(page);

    expect(response.status()).toBe(200);
    await expect(page.getByTestId("create-profile-error")).toHaveText(NAME_CHARACTERS_MESSAGE);
    expect(await rowsRequesting(entry.username)).toBe(0);
  }
});

/* ------------------------------------------------------------------ AC-19, AC-20 */

test.describe("without JavaScript, where the answer is the server's own response", () => {
  test.use({ javaScriptEnabled: false });

  test("AC-18, AC-19: requests for a live, a deactivated, a requested and an unheld username get the same 303, Location and cookies, and a byte-identical acknowledgement", async ({
    page,
  }) => {
    const live = await newUser();
    const leaver = await newUser();
    await deactivate(leaver.username);

    await page.goto("/sign-in/create");
    await knownDevice(page);

    // A request already waiting for U3.
    const requested = freshUsername();
    await fill(page, typed({ username: requested }));
    await Promise.all([
      page.waitForURL((url) => url.pathname === "/sign-in/requested"),
      page.getByTestId("create-profile-submit").click(),
    ]);
    expect(await rowsRequesting(requested)).toBe(1);

    const answers: { status: number; location: string | undefined; cookies: string[]; body: string }[] = [];
    for (const username of [live.username, leaver.username, requested, freshUsername()]) {
      await page.goto("/sign-in/create");
      const before = await rowsRequesting(username);
      await fill(page, typed({ username, pin: live.pin, pinAgain: live.pin }));

      const [posted, acknowledged] = await Promise.all([
        page.waitForResponse(
          (candidate) =>
            candidate.request().method() === "POST" &&
            new URL(candidate.url()).pathname === "/sign-in/create",
        ),
        page.waitForResponse(
          (candidate) =>
            candidate.request().method() === "GET" &&
            new URL(candidate.url()).pathname === "/sign-in/requested",
        ),
        page.getByTestId("create-profile-submit").click(),
      ]);

      answers.push({
        status: posted.status(),
        location: posted.headers().location,
        cookies: (await posted.headersArray())
          .filter((header) => header.name.toLowerCase() === "set-cookie")
          .map((header) => header.value.split("=")[0] ?? "")
          .sort(),
        body: await acknowledged.text(),
      });
      expect(await rowsRequesting(username), username).toBe(before + 1);
    }

    expect(answers[0]?.status).toBe(303);
    expect(answers[0]?.location).toBe("/sign-in/requested");
    expect(answers[0]?.body).toContain(PROFILE_REQUEST_SENT);
    for (const answer of answers.slice(1)) {
      expect(answer.status).toBe(answers[0]?.status);
      expect(answer.location).toBe(answers[0]?.location);
      expect(answer.cookies).toEqual(answers[0]?.cookies);
      expect(answer.body === answers[0]?.body).toBe(true);
    }
  });

  test("AC-20: a paused request renders PROFILE_REQUESTS_PAUSED at 200, byte-identical for a live username and an unheld one, and creates no row", async ({
    page,
  }) => {
    const live = await newUser();
    await page.goto("/sign-in/create");
    const bucket = await knownDevice(page);

    // This device has spent its day: its own bucket only, never the one new devices share.
    const now = new Date();
    await db.authEvent.createMany({
      data: Array.from({ length: PROFILE_REQUEST_BUDGET }, () => ({
        kind: "PROFILE_REQUEST" as const,
        bucket,
        at: now,
      })),
    });

    const bodies: string[] = [];
    for (const username of [live.username, freshUsername()]) {
      await page.goto("/sign-in/create");
      const before = await rowsRequesting(username);
      await fill(page, typed({ username }));

      const response = await submit(page);

      expect(response.status(), username).toBe(200);
      const body = await response.text();
      expect(body, username).toContain(PROFILE_REQUESTS_PAUSED);
      bodies.push(body);
      expect(await rowsRequesting(username), username).toBe(before);
    }
    expect(bodies[0] === bodies[1]).toBe(true);
  });
});

/* ------------------------------------------------------------------ AC-34, AC-35 */

test("AC-34: /sign-in/create and /sign-in/requested carry no euro", async ({ request }) => {
  for (const path of ["/sign-in/create", "/sign-in/requested"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(await response.text(), path).not.toContain("€");
  }
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]) {
  test.describe(`Create profile at ${viewport.width} px`, () => {
    test.use({ viewport });

    test(`AC-35: at ${viewport.width} px neither page scrolls sideways, and every control on /sign-in/create is at least 44 px tall`, async ({
      page,
    }) => {
      for (const path of ["/sign-in/create", "/sign-in/requested"]) {
        await page.goto(path);
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, path).toBeLessThanOrEqual(clientWidth);
      }

      await page.goto("/sign-in/create");
      const controls = page.locator("main input:not([type=hidden]), main button, main a");
      await expect(controls).toHaveCount(6);
      for (let index = 0; index < 6; index += 1) {
        const box = await controls.nth(index).boundingBox();
        expect(box, `control ${index}`).not.toBeNull();
        expect(box?.height ?? 0, `control ${index}`).toBeGreaterThanOrEqual(44);
        expect((box?.x ?? 0) + (box?.width ?? 0), `control ${index}`).toBeLessThanOrEqual(
          viewport.width,
        );
      }
    });
  });
}

/* ------------------------------------------------------------------ AC-36 */

test("AC-36: both PIN fields of Create profile are forgotten when the page hides, when it is restored, and on reload, and are never stored", async ({
  page,
}) => {
  await page.goto("/sign-in/create");
  await hydrated(page);
  const pinFields = [page.getByLabel("PIN", { exact: true }), page.getByLabel("PIN again")];

  const typeDigits = async (): Promise<string> => {
    const digits = Array.from({ length: 3 }, () => String(randomInt(10))).join("");
    for (const field of pinFields) {
      await field.pressSequentially(digits);
      await expect(field).toHaveValue(digits);
    }
    return digits;
  };

  // The origin is not something a typed PIN can reach, so only the rest of the URL is read.
  const leftAnywhere = async (digits: string): Promise<string[]> => {
    const stored = await page.evaluate(() => [
      ...Object.values({ ...window.localStorage }),
      ...Object.values({ ...window.sessionStorage }),
    ]);
    const cookies = (await page.context().cookies()).map((cookie) => cookie.value);
    const url = new URL(page.url());
    return [...stored, ...cookies, `${url.pathname}${url.search}${url.hash}`].filter((value) =>
      value.includes(digits),
    );
  };

  const hidden = await typeDigits();
  expect(await leftAnywhere(hidden)).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  for (const field of pinFields) await expect(field).toHaveValue("");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  });

  const restored = await typeDigits();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  for (const field of pinFields) await expect(field).toHaveValue("");
  expect(await leftAnywhere(restored)).toEqual([]);

  const reloaded = await typeDigits();
  await page.reload();
  await hydrated(page);
  for (const field of pinFields) await expect(field).toHaveValue("");
  expect(await leftAnywhere(reloaded)).toEqual([]);
});

/* ------------------------------------------------------------------ AC-40 */

test("AC-40: nothing in this file reached the new-device request budget the real users share", async () => {
  expect(
    await db.authEvent.count({
      where: { bucket: "request:new-devices", at: { gte: startedAt } },
    }),
  ).toBe(0);
});
