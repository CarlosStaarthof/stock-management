import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  CLEAR_SIGNATURE,
  SIGNATURE_FULL,
  SIGN_AND_SUBMIT,
} from "@/lib/count-messages";
import {
  SIGNATURE_MAX_CHARS,
  SIGNATURE_MAX_POINTS,
  SIGNATURE_PATH_PATTERN,
  SIGNATURE_VIEWBOX,
} from "@/lib/signature-path";

import { seededMasterCounts } from "./support/item-master";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  RESERVED_YEAR,
  clearReservedYear,
  fillQuantities,
  lifecycleOf,
  realCountIds,
  seedCountWithLines,
  submitAs,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 009's pad: what a finger, a stylus and a mouse all produce, what is stored, and
 * what 390 px does to it.
 *
 * THIS IS THE FILE THE PHONE-FIRST CONSTRAINT WAS WRITTEN FOR (AC-9). A count is taken
 * standing in a yard with one hand; the signature is the last thing that happens there,
 * and a pad that scrolls the page instead of drawing is a pad nobody can sign.
 *
 * This file owns reserved year 2100 — the LAST reservable year, because 007 AC-8 caps a
 * submitted period at 2100 — and deletes only that year.
 */
const YEAR = RESERVED_YEAR.signature;

const created: string[] = [];
let realCountsBefore: string[] = [];
let masterBefore: Awaited<ReturnType<typeof seededMasterCounts>>;

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.beforeAll(async () => {
  if (!(await databaseIsReachable())) return;

  realCountsBefore = await realCountIds();
  masterBefore = await seededMasterCounts();
  await clearReservedYear(YEAR);
});

test.afterAll(async () => {
  if (!(await databaseIsReachable())) return;

  await clearReservedYear(YEAR);
  for (const username of created.splice(0)) {
    await removeUser(username);
  }

  expect(await realCountIds()).toEqual(realCountsBefore);
  expect(await seededMasterCounts()).toEqual(masterBefore);
});

async function newUser(role: "YARD_STAFF" | "ADMIN" = "YARD_STAFF"): Promise<TestUser> {
  const user = await createTestUser(role, `stock-entry-signature-${role.toLowerCase()}`);
  created.push(user.username);
  return user;
}

/** A Dublin count whose every line is counted, so only the drawing is left to do. */
async function countedCount(createdById: string, month: number): Promise<string> {
  const { countId } = await seedCountWithLines({
    locationCode: "DUBLIN",
    year: YEAR,
    month,
    countDate: `${String(YEAR)}-${String(month).padStart(2, "0")}-10`,
    createdById,
  });
  await fillQuantities(countId, 0);
  return countId;
}

async function padBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.getByTestId("signature-pad").boundingBox();
  if (box === null) throw new Error("the pad has no box to draw in");
  return box;
}

/**
 * A real touch gesture, dispatched through CDP.
 *
 * `page.touchscreen` can only TAP, and a tap is one point — which this product refuses,
 * because a dot is not a signature (AC-5). A drag is what has to be proved, so the events
 * are dispatched as the browser's own touch input; they arrive at the component as
 * `pointerdown` / `pointermove` / `pointerup` with `pointerType: "touch"`, which is the
 * whole point of AC-8: ONE code path, and the component never asks which it was.
 */
async function touchDrag(page: Page, from: { x: number; y: number }, dx: number, steps = 12) {
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: from.x, y: from.y }],
  });

  for (let step = 1; step <= steps; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        {
          x: from.x + (dx * step) / steps,
          // A signature is not a straight line, and a straight one would reduce to two
          // points: the zigzag is what makes the assertion about point count mean anything.
          y: from.y + (step % 2 === 0 ? 18 : -18),
        },
      ],
    });
  }

  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

test("AC-7, AC-8: a drawn signature round-trips byte for byte, and a second stroke is a second M", async ({
  page,
}) => {
  const staff = await newUser();
  const countId = await countedCount(staff.id, 1);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}/submit`);

  const box = await padBox(page);
  const field = page.getByTestId("signature-field");

  // Stroke one.
  await page.mouse.move(box.x + 20, box.y + box.height - 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 3, box.y + 20, { steps: 10 });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 20, { steps: 10 });
  await page.mouse.up();

  // Stroke two, after lifting: a new `M`.
  await page.mouse.move(box.x + box.width * 0.6, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 30, { steps: 10 });
  await page.mouse.up();

  const drawn = await field.inputValue();
  expect(drawn).toMatch(SIGNATURE_PATH_PATTERN);
  expect(drawn.match(/M /g) ?? []).toHaveLength(2);
  expect((drawn.match(/L /g) ?? []).length).toBeGreaterThanOrEqual(2);

  // The pad renders exactly what it will submit: one `<path>` per stroke, and their `d`
  // attributes joined by a single space ARE the value.
  const padPaths = await page
    .getByTestId("signature-pad")
    .locator("path")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  expect(padPaths).toHaveLength(2);
  expect(padPaths.join(" ")).toBe(drawn);

  const submittedAtLeast = Date.now();
  await page.getByTestId("sign-and-submit").click();
  await page.waitForURL(`**/stock-entry/counts/${countId}`);

  // WHAT POSTGRES HOLDS IS EXACTLY WHAT WAS DRAWN — same length, same characters, no
  // escaping and no re-serialisation (AC-7).
  const row = await lifecycleOf(countId);
  expect(row.signaturePath).toBe(drawn);
  expect(row.signaturePath).toHaveLength(drawn.length);
  expect(row.signedById).toBe(staff.id);
  expect(row.submittedOn).not.toBeNull();
  expect(Math.abs((row.submittedOn?.getTime() ?? 0) - submittedAtLeast)).toBeLessThan(30_000);

  // And the count page renders it back: an inline <svg> in the fixed coordinate space,
  // one <path> per stroke, joining to the stored string exactly.
  const rendered = page.getByTestId("signature");
  await expect(rendered).toHaveAttribute("viewBox", SIGNATURE_VIEWBOX);
  expect(SIGNATURE_VIEWBOX).toBe("0 0 600 300");

  const renderedPaths = await rendered
    .locator("path")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  expect(renderedPaths).toHaveLength(2);
  expect(renderedPaths.join(" ")).toBe(row.signaturePath);

  // A reload reads it from the database and draws the same thing.
  await page.reload();
  const afterReload = await page
    .getByTestId("signature")
    .locator("path")
    .evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""));
  expect(afterReload.join(" ")).toBe(row.signaturePath);
});

test("AC-8: Clear empties everything, and the client cap keeps the server cap unreachable", async ({
  page,
}) => {
  const staff = await newUser();
  const countId = await countedCount(staff.id, 2);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}/submit`);

  const box = await padBox(page);
  const field = page.getByTestId("signature-field");

  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 20, { steps: 10 });
  await page.mouse.up();
  await expect(field).not.toHaveValue("");

  // CLEAR: the pad, the hidden field, and nothing else.
  await page.getByRole("button", { name: CLEAR_SIGNATURE }).click();
  await expect(field).toHaveValue("");
  await expect(page.getByTestId("signature-pad").locator("path")).toHaveCount(0);

  // And drawing still works afterwards.
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 30, box.y + box.height - 30, { steps: 10 });
  await page.mouse.up();
  await expect(field).not.toHaveValue("");
  await page.getByRole("button", { name: CLEAR_SIGNATURE }).click();

  // THE CAP. Six hundred moves, well spread, is more than any signature: recording stops
  // at SIGNATURE_MAX_POINTS, the screen SAYS SO rather than silently dropping the end of a
  // stroke, and what is left is still a valid path far inside the server's backstop.
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  for (let pass = 0; pass < 3; pass += 1) {
    await page.mouse.move(box.x + box.width - 10, box.y + 20 + pass * 20, { steps: 100 });
    await page.mouse.move(box.x + 10, box.y + 30 + pass * 20, { steps: 100 });
  }
  await page.mouse.up();

  await expect(page.getByTestId("signature-full")).toHaveText(SIGNATURE_FULL);

  const capped = await field.inputValue();
  expect(capped).toMatch(SIGNATURE_PATH_PATTERN);
  expect((capped.match(/[ML] /g) ?? []).length).toBeLessThanOrEqual(SIGNATURE_MAX_POINTS);
  expect(capped.length).toBeLessThan(SIGNATURE_MAX_CHARS);

  // It is still a signature this product will store.
  await page.getByTestId("sign-and-submit").click();
  await page.waitForURL(`**/stock-entry/counts/${countId}`);
  expect((await lifecycleOf(countId)).signaturePath).toBe(capped);
});

test("AC-9: a finger at 390 px — the whole flow, and the drag draws instead of scrolling", async ({
  browser,
}) => {
  const staff = await newUser();
  const countId = await countedCount(staff.id, 3);

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  await signIn(page, staff);

  const noSidewaysScroll = async (where: string): Promise<void> => {
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth, `${where} overflows at 390 px`).toBeLessThanOrEqual(
      overflow.clientWidth,
    );
  };

  await page.goto(`/stock-entry/counts/${countId}`);
  await noSidewaysScroll("the count");

  await page.getByTestId("review-and-sign").click();
  await page.waitForURL(/\/submit$/);
  await noSidewaysScroll("the review");

  // The pad is big enough to sign in, and entirely on the screen.
  const box = await padBox(page);
  expect(box.width).toBeGreaterThanOrEqual(320);
  expect(box.height).toBeGreaterThanOrEqual(150);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);

  // `touch-action: none` in the browser's own words.
  const touchAction = await page
    .getByTestId("signature-pad")
    .evaluate((pad) => getComputedStyle(pad).touchAction);
  expect(touchAction).toBe("none");

  // THE ONE ASSERTION THIS CONSTRAINT EXISTS FOR: a 200 px drag across the pad draws, and
  // the page does not move under the finger.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
  });
  const scrollBefore = await page.evaluate(() => window.scrollY);

  await touchDrag(page, { x: box.x + 20, y: box.y + box.height / 2 }, 200);

  const scrollAfter = await page.evaluate(() => window.scrollY);
  expect(scrollAfter).toBe(scrollBefore);

  const drawn = await page.getByTestId("signature-field").inputValue();
  expect(drawn).toMatch(SIGNATURE_PATH_PATTERN);
  expect((drawn.match(/[ML] /g) ?? []).length).toBeGreaterThanOrEqual(2);

  // The two controls are both thumb-sized, and the primary one needs no sideways scroll.
  for (const testId of ["clear-signature", "sign-and-submit"]) {
    const control = await page.getByTestId(testId).boundingBox();
    expect(control?.width ?? 0, testId).toBeGreaterThanOrEqual(44);
    expect(control?.height ?? 0, testId).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByTestId("sign-and-submit")).toBeVisible();
  await expect(page.getByTestId("sign-and-submit")).toHaveAccessibleName(SIGN_AND_SUBMIT);

  await page.getByTestId("sign-and-submit").click();
  await page.waitForURL(`**/stock-entry/counts/${countId}`);
  await noSidewaysScroll("the submitted count");

  const row = await lifecycleOf(countId);
  expect(row.signaturePath).toBe(drawn);
  expect(row.status).toBe("SUBMITTED");

  await context.close();
});

test("AC-9: 320 px, and the ADMIN's valued table, because a table is what overflows", async ({
  browser,
}) => {
  const staff = await newUser();
  const admin = await newUser("ADMIN");
  const countId = await countedCount(staff.id, 4);
  await submitAs(countId, staff);

  const routes = [
    `/stock-entry/counts/${countId}/submit`,
    `/stock-entry/counts/${countId}/summary`,
    `/stock-entry/counts/${countId}/reopen`,
  ];

  for (const width of [320, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 740 } });
    const page = await context.newPage();
    await signIn(page, admin);

    for (const url of routes) {
      await page.goto(url);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, `${url} overflows at ${String(width)} px`).toBeLessThanOrEqual(
        overflow.clientWidth,
      );
    }

    // The valued table really was on the screen that was measured.
    await page.goto(`/stock-entry/counts/${countId}/summary`);
    await expect(page.getByTestId("valued-lines")).toBeVisible();
    expect(await page.getByTestId("valued-line").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("count-total")).toContainText("€");

    await context.close();
  }

  // At 320 px the pad is still wide enough to sign on, for the staff user whose job it is.
  const narrow = await browser.newContext({ viewport: { width: 320, height: 740 } });
  const narrowPage = await narrow.newPage();
  await signIn(narrowPage, staff);
  const draftId = await countedCount(staff.id, 5);
  await narrowPage.goto(`/stock-entry/counts/${draftId}/submit`);

  const box = await padBox(narrowPage);
  expect(box.width).toBeGreaterThanOrEqual(260);

  await narrow.close();
});
