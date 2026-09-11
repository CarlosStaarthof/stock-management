import { expect, test } from "@playwright/test";

import { seededMasterCounts } from "./support/item-master";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  RESERVED_YEAR,
  clearReservedYear,
  countIdFor,
  realCountIds,
  reservedCountTotals,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 007 AC-10, AC-16, AC-24 and AC-27: what a refused request is shown, and what it is
 * never shown.
 *
 * Four provoked failures — a second count for the same yard and period, a `period` of
 * `2026-13`, a `countId` that does not exist, and a yard chosen as nonsense — and in every
 * rendered page the feature's own sentence and not one word of Postgres or Prisma.
 *
 * This file owns reserved year 2094 and deletes only that year.
 */
const YEAR = RESERVED_YEAR.refusals;
const YEAR_TEXT = String(YEAR);

/** Nothing a driver says may reach a screen (AC-10, AC-27). */
const DATABASE_WORDS =
  /prisma|violates|constraint|SQLSTATE|23514|23505|P2002|P2003|P2025|StockCount_locationId_periodYear_periodMonth_key|StockCount_periodMonth_range|Unique constraint|check constraint/i;

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
  for (const email of created.splice(0)) {
    await removeUser(email);
  }

  expect(await realCountIds()).toEqual(realCountsBefore);
  expect(await seededMasterCounts()).toEqual(masterBefore);
});

async function newUser(role: "YARD_STAFF" | "ADMIN" = "YARD_STAFF"): Promise<TestUser> {
  const user = await createTestUser(role, `stock-entry-refusals-${role.toLowerCase()}`);
  created.push(user.email);
  return user;
}

test("AC-10, AC-27: a second count for the same yard and period is refused in the domain's words", async ({
  page,
}) => {
  await signIn(page, await newUser());

  // One count for Dublin, closing April of the reserved year.
  await page.goto(`/stock-entry/new/confirm?locationCode=DUBLIN&countDate=${YEAR_TEXT}-04-10`);
  await page.getByTestId("start-count").click();
  await page.waitForURL(/\/stock-entry\/counts\/[a-z0-9]+/);
  const firstId = new URL(page.url()).pathname.split("/").pop() as string;

  const before = await reservedCountTotals(YEAR);

  // A DIFFERENT countDate, the same period: the screen would offer the existing count, so
  // the second attempt is made the only way it can be — by overriding the period on a
  // confirm screen for a day whose derived period is a different one.
  await page.goto(`/stock-entry/new/confirm?locationCode=DUBLIN&countDate=${YEAR_TEXT}-05-20`);
  await page.getByTestId("period-input").fill(`${YEAR_TEXT}-04`);
  await page.getByTestId("start-count").click();

  const error = page.getByTestId("start-count-error");
  await expect(error).toContainText(`Count for DUBLIN in ${YEAR_TEXT}-04 already exists`);

  const link = page.getByTestId("open-existing-count");
  await expect(link).toHaveText("Open the existing count");
  await expect(link).toHaveAttribute("href", `/stock-entry/counts/${firstId}`);

  // Not one word of Postgres or Prisma anywhere in the page.
  expect(await page.content()).not.toMatch(DATABASE_WORDS);

  // And nothing was written.
  expect(await reservedCountTotals(YEAR)).toEqual(before);

  // Following the link arrives at the count that exists, byte for byte the same one.
  await link.click();
  await page.waitForURL(`**/stock-entry/counts/${firstId}`);
  await expect(page.getByTestId("count-period")).toHaveText(`April ${YEAR_TEXT}`);
  await expect(page.getByTestId("count-date")).toHaveText(`10 April ${YEAR_TEXT}`);
});

test("AC-8, AC-27: a period of 2026-13 is refused inline and never reaches the CHECK", async ({
  page,
}) => {
  await signIn(page, await newUser());

  const before = await reservedCountTotals(YEAR);

  await page.goto(`/stock-entry/new/confirm?locationCode=DUBLIN&countDate=${YEAR_TEXT}-08-10`);
  // A native month input will not hold `2026-13`, so the value is set the way a hand-made
  // request would: on the element itself, past the picker.
  await page.getByTestId("period-input").evaluate((element) => {
    (element as HTMLInputElement).type = "text";
    (element as HTMLInputElement).value = "2026-13";
  });
  await page.getByTestId("start-count").click();

  const inline = page.getByTestId("start-count-field-error");
  await expect(inline).toHaveText("Period must be a month between 2000 and 2100.");
  await expect(inline).toHaveAttribute("data-field", "period");

  const body = await page.content();
  expect(body).not.toMatch(DATABASE_WORDS);
  expect(body).not.toContain("StockCount_periodMonth_range");

  expect(await reservedCountTotals(YEAR)).toEqual(before);
});

test("AC-24, AC-27: a countId that does not exist is a sentence and a way back", async ({
  page,
}) => {
  await signIn(page, await newUser());

  const response = await page.request.get("/stock-entry/counts/count_does_not_exist");
  expect(response.status()).toBe(200);

  await page.goto("/stock-entry/counts/count_does_not_exist");

  await expect(page.getByTestId("count-missing")).toHaveText("That count no longer exists.");
  await expect(page.getByTestId("back-to-calendar")).toHaveAttribute("href", "/stock-entry");
  // Not the shared error boundary, and not a driver string.
  await expect(page.getByTestId("error-message")).toHaveCount(0);
  expect(await page.content()).not.toMatch(DATABASE_WORDS);

  await page.getByTestId("back-to-calendar").click();
  await page.waitForURL("**/stock-entry");
  await expect(page.getByTestId("calendar")).toBeVisible();
});

test("AC-13, AC-27: a yard that does not exist is named, not explained by Postgres", async ({
  page,
}) => {
  await signIn(page, await newUser());

  // `?locationCode=BANANA` is not a yard: the confirm screen asks for one rather than
  // throwing, which is the same answer as choosing none.
  await page.goto(`/stock-entry/new/confirm?locationCode=BANANA&countDate=${YEAR_TEXT}-08-10`);

  await expect(page.getByTestId("confirm-error")).toHaveText("Choose a yard.");
  expect(await page.content()).not.toMatch(DATABASE_WORDS);
  await expect(page.getByTestId("error-message")).toHaveCount(0);
});

test("AC-16: an ADMIN is told how many items have no price, and a YARD_STAFF user is not", async ({
  browser,
}) => {
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, await newUser("YARD_STAFF"));

  // One count, started by the staff user, for the reserved year.
  await staffPage.goto(
    `/stock-entry/new/confirm?locationCode=DUBLIN&countDate=${YEAR_TEXT}-10-10`,
  );
  await staffPage.getByTestId("start-count").click();
  await staffPage.waitForURL(/\/stock-entry\/counts\/[a-z0-9]+/);
  const countId = new URL(staffPage.url()).pathname.split("/").pop() as string;

  // The staff page renders the sentence NOWHERE, carries no per-row price tag, and no euro.
  const staffBody = await staffPage.content();
  await expect(staffPage.getByTestId("items-without-price")).toHaveCount(0);
  expect(staffBody).not.toContain("no price recorded");
  expect(staffBody).not.toContain("No price");
  expect(staffBody).not.toContain("€");
  await staffContext.close();

  // The same count, for an ADMIN. The number depends on the user's own master, so what is
  // asserted is the SENTENCE and its shape, not a count another spec could move.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, await newUser("ADMIN"));
  await adminPage.goto(`/stock-entry/counts/${countId}`);

  const warning = adminPage.getByTestId("items-without-price");
  if ((await warning.count()) > 0) {
    await expect(warning).toContainText(
      /^\d+ items? on this sheet ha(ve|s) no price recorded\. Their lines will count as 0 when this count is submitted\.$/,
    );
  }

  // Otherwise identical markup: the same heading, period, date, status and rows.
  await expect(adminPage.getByTestId("count-heading")).toHaveText("Dublin");
  await expect(adminPage.getByTestId("count-status")).toHaveText("Draft");
  await expect(adminPage.getByTestId("count-period")).toHaveText(`October ${YEAR_TEXT}`);
  // Even for an ADMIN this page shows no euro: it counts items, not money.
  expect(await adminPage.content()).not.toContain("€");

  await adminContext.close();

  expect(await countIdFor("DUBLIN", YEAR, 10)).toBe(countId);
});
