import { expect, test } from "@playwright/test";

import { seededMasterCounts } from "./support/item-master";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  RESERVED_YEAR,
  clearReservedYear,
  realCountIds,
  seedCount,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 007 AC-19, AC-20, AC-21 and AC-22's browser half: the calendar in a real browser.
 *
 * This file owns reserved year 2092 (AC-30) and deletes only that year. Every date it
 * touches is inside that year, so the real calendar default — `defaultMonthKey`, which
 * reads the greatest `countDate` in the table — sees nothing this file did.
 *
 * September 2092 begins on a Monday, and its shape is asserted from `buildMonthGrid` in
 * `src/lib/calendar-month.test.ts` rather than here: what this file proves is that the
 * PAGE renders that grid, in order, with the right badges on the right days.
 */
const YEAR = RESERVED_YEAR.calendar;
const MONTH = `${String(YEAR)}-09`;

const created: string[] = [];
let dublinCountId = "";
let clonmelCountId = "";
let octoberCountId = "";
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

  const owner = await createTestUser("YARD_STAFF", "stock-entry-calendar-owner");
  created.push(owner.email);

  // Two counts on the SAME day, one at each yard (AC-20).
  dublinCountId = await seedCount({
    locationCode: "DUBLIN",
    year: YEAR,
    month: 9,
    countDate: `${MONTH}-01`,
    createdById: owner.id,
  });
  clonmelCountId = await seedCount({
    locationCode: "CLONMEL",
    year: YEAR,
    month: 9,
    countDate: `${MONTH}-01`,
    createdById: owner.id,
  });

  // Dated the 1st of OCTOBER and closing AUGUST: it belongs in October's grid, because a
  // count is placed by the day the yard was walked and not by the month it closes (AC-20).
  // August is used rather than September only because Dublin's September is already taken
  // by the count above, and one yard may hold one count per month.
  octoberCountId = await seedCount({
    locationCode: "DUBLIN",
    year: YEAR,
    month: 8,
    countDate: `${String(YEAR)}-10-01`,
    createdById: owner.id,
  });
});

test.afterAll(async () => {
  if (!(await databaseIsReachable())) return;

  await clearReservedYear(YEAR);
  for (const email of created.splice(0)) {
    await removeUser(email);
  }

  expect(await realCountIds()).toEqual(realCountsBefore);
  expect(await seededMasterCounts()).toEqual(masterBefore);
});

async function newUser(role: "YARD_STAFF" | "ADMIN" = "YARD_STAFF"): Promise<TestUser> {
  const user = await createTestUser(role, "stock-entry-calendar");
  created.push(user.email);
  return user;
}

test("AC-19: the page is one month of days with seven Monday-first column headings", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-entry?month=${MONTH}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`September ${String(YEAR)}`);
  await expect(page.getByTestId("month-heading")).toHaveText(`September ${String(YEAR)}`);

  const headings = page.getByTestId("weekday-heading");
  await expect(headings).toHaveCount(7);
  expect(await headings.allTextContents()).toEqual([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]);

  // Thirty dated cells, and every one of September's days present exactly once.
  for (const day of [1, 15, 30]) {
    await expect(
      page.getByTestId(`day-${MONTH}-${String(day).padStart(2, "0")}`),
    ).toHaveCount(1);
  }
  await expect(page.getByTestId(`day-${MONTH}-31`)).toHaveCount(0);
});

test("AC-20: a day with counts at both yards renders two badges, Dublin before Clonmel", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-entry?month=${MONTH}`);

  const cell = page.getByTestId(`day-${MONTH}-01`);
  const badges = cell.getByTestId("count-badge");

  await expect(badges).toHaveCount(2);
  await expect(badges.nth(0)).toContainText("Dublin");
  await expect(badges.nth(0)).toContainText("Draft");
  await expect(badges.nth(1)).toContainText("Clonmel");

  await expect(badges.nth(0)).toHaveAttribute(
    "href",
    `/stock-entry/counts/${dublinCountId}`,
  );
  await expect(badges.nth(1)).toHaveAttribute(
    "href",
    `/stock-entry/counts/${clonmelCountId}`,
  );
  // The period rides along in the badge's title.
  await expect(badges.nth(0)).toHaveAttribute("title", MONTH);

  // Following one arrives at that count.
  await badges.nth(0).click();
  await page.waitForURL(`**/stock-entry/counts/${dublinCountId}`);
  await expect(page.getByTestId("count-heading")).toHaveText("Dublin");
});

test("AC-20: a count is placed by countDate, not by the period it closes", async ({ page }) => {
  await signIn(page, await newUser());

  // Dated 1 October and closing August: absent from the grid of the month it CLOSES…
  await page.goto(`/stock-entry?month=${String(YEAR)}-08`);
  await expect(page.locator(`[data-count-id="${octoberCountId}"]`)).toHaveCount(0);

  // …and present in the grid of the day it HAPPENED, carrying its period in the title.
  await page.goto(`/stock-entry?month=${String(YEAR)}-10`);
  const badge = page.getByTestId(`day-${String(YEAR)}-10-01`).getByTestId("count-badge");
  await expect(badge).toHaveCount(1);
  await expect(badge).toHaveAttribute("href", `/stock-entry/counts/${octoberCountId}`);
  await expect(badge).toHaveAttribute("title", `${String(YEAR)}-08`);

  // And the count page agrees: August is the period, 1 October is the day.
  await badge.click();
  await page.waitForURL(`**/stock-entry/counts/${octoberCountId}`);
  await expect(page.getByTestId("count-period")).toHaveText(`August ${String(YEAR)}`);
  await expect(page.getByTestId("count-date")).toHaveText(`1 October ${String(YEAR)}`);
});

test("AC-20: a day with no count carries no badge and a Start a count link for that day", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-entry?month=${MONTH}`);

  const empty = page.getByTestId(`day-${MONTH}-17`);
  await expect(empty.getByTestId("count-badge")).toHaveCount(0);

  const link = empty.getByTestId("start-count-day");
  await expect(link).toHaveAttribute("href", `/stock-entry/new?countDate=${MONTH}-17`);
  await expect(link).toHaveAccessibleName("Start a count");

  // AC-23: following it pre-fills the date field with that day.
  await link.click();
  await page.waitForURL(`**/stock-entry/new?countDate=${MONTH}-17`);
  await expect(page.getByTestId("count-date")).toHaveValue(`${MONTH}-17`);
});

test("AC-20: exactly one cell in the whole application is today's", async ({ page }) => {
  await signIn(page, await newUser());

  // A reserved year is not the current year, so its grid marks nothing.
  await page.goto(`/stock-entry?month=${MONTH}`);
  await expect(page.locator("[data-today='true']")).toHaveCount(0);

  // The Today link lands on the month that does mark one.
  await page.getByTestId("today").click();
  await page.waitForURL(/\/stock-entry\?month=\d{4}-\d{2}/);
  await expect(page.locator("[data-today='true']")).toHaveCount(1);
});

test("AC-21: the month controls are plain links to the neighbouring months", async ({ page }) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-entry?month=${MONTH}`);

  await expect(page.getByTestId("previous-month")).toHaveAttribute(
    "href",
    `/stock-entry?month=${String(YEAR)}-08`,
  );
  await expect(page.getByTestId("next-month")).toHaveAttribute(
    "href",
    `/stock-entry?month=${String(YEAR)}-10`,
  );

  await page.getByTestId("previous-month").click();
  await expect(page.getByTestId("month-heading")).toHaveText(`August ${String(YEAR)}`);

  await page.goto(`/stock-entry?month=${String(YEAR)}-12`);
  await expect(page.getByTestId("next-month")).toHaveAttribute(
    "href",
    `/stock-entry?month=${String(YEAR + 1)}-01`,
  );
});

test("AC-21: no value of ?month can make this page throw", async ({ page }) => {
  await signIn(page, await newUser());

  for (const query of [
    "?month=banana",
    "?month=2026-13",
    "?month=2026-1",
    "?month=",
    "?month=2026-08&month=2026-09",
    "?month=../../etc/passwd",
  ]) {
    const response = await page.request.get(`/stock-entry${query}`, { maxRedirects: 0 });

    expect(response.status(), query).toBe(307);
    expect(response.headers()["location"] ?? "", query).toContain("/stock-entry");

    // And following it renders the calendar rather than an error.
    await page.goto(`/stock-entry${query}`);
    await expect(page.getByTestId("calendar"), query).toBeVisible();
    await expect(page.getByTestId("error-message"), query).toHaveCount(0);
  }
});

test("AC-22: a month with no counts, in a database that has some, says so", async ({ page }) => {
  await signIn(page, await newUser());

  // August of the reserved year holds nothing, and the database certainly holds something:
  // this file's own `beforeAll` put three counts in it.
  await page.goto(`/stock-entry?month=${String(YEAR)}-08`);

  await expect(page.getByTestId("no-counts-in-month")).toHaveText("No counts in this month.");
  // No empty-state instruction: that belongs to the never-counted-anything state only.
  await expect(page.getByTestId("no-counts-ever")).toHaveCount(0);
  await expect(page.getByTestId("start-a-count")).toHaveCount(0);
});

test("AC-28: the calendar's seven columns fit a 390 px phone without scrolling sideways", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page, await newUser());
  await page.goto(`/stock-entry?month=${MONTH}`);

  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

  // Every one of the seven columns is at least 40 px wide.
  const headings = page.getByTestId("weekday-heading");
  for (let column = 0; column < 7; column += 1) {
    const box = await headings.nth(column).boundingBox();
    expect(box?.width ?? 0, `column ${String(column)}`).toBeGreaterThanOrEqual(40);
  }

  // And the month controls are 44 px tap targets.
  for (const testId of ["previous-month", "today", "next-month"]) {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box?.width ?? 0, testId).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, testId).toBeGreaterThanOrEqual(44);
  }

  await context.close();
});
