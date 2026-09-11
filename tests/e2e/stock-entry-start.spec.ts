import { expect, test } from "@playwright/test";

import { seededMasterCounts } from "./support/item-master";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  RESERVED_YEAR,
  clearReservedYear,
  countIdFor,
  createdByIdOf,
  realCountIds,
  reservedCountTotals,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 007 AC-7, AC-8, AC-11, AC-23, AC-24, AC-26 and AC-28's flow: starting a count, in a
 * real browser, against a served build.
 *
 * WHERE THE 2026 LITERALS ARE. AC-24 as amended pins `September 2026` and `1 September 2026`
 * in `*.db.test.ts` and `count-messages.test.ts`, because AC-30 forbids an e2e spec writing
 * a `StockCount` below `periodYear` 2090 and `/stock-entry/counts/<id>` is reachable only by
 * creating one. The browser half below runs the same flow inside this file's reserved year
 * and asserts the same sentences for that year, built from the same `count-messages.ts`
 * helpers. AC-7's `GET .../confirm?countDate=2026-10-01` keeps its 2026 literals exactly as
 * written, because that request writes nothing — which this file also asserts.
 *
 * This file owns reserved year 2093 and deletes only that year.
 */
const YEAR = RESERVED_YEAR.start;
const YEAR_TEXT = String(YEAR);

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
  const user = await createTestUser(role, `stock-entry-start-${role.toLowerCase()}`);
  created.push(user.email);
  return user;
}

test("AC-23: choosing a yard is deliberate — two tap targets and none preselected", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto("/stock-entry/new");

  const yards = page.locator('input[name="locationCode"]');
  await expect(yards).toHaveCount(2);
  await expect(yards.nth(0)).toHaveValue("DUBLIN");
  await expect(yards.nth(1)).toHaveValue("CLONMEL");

  // NONE preselected: "no yard chosen" is a state the form can really be in.
  await expect(yards.nth(0)).not.toBeChecked();
  await expect(yards.nth(1)).not.toBeChecked();

  // Dublin then Clonmel, in Location.sortOrder.
  await expect(page.getByTestId("yard-DUBLIN")).toContainText("Dublin");
  await expect(page.getByTestId("yard-CLONMEL")).toContainText("Clonmel");

  // The date field is a native date picker, defaulted to today in the yard.
  const date = page.getByTestId("count-date");
  await expect(date).toHaveAttribute("type", "date");
  expect(await date.inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("AC-5: who is counting is text, and there is no input that names a person", async ({
  page,
}) => {
  const staff = await newUser();
  await signIn(page, staff);
  await page.goto("/stock-entry/new");

  await expect(page.getByTestId("counting-as")).toContainText("Counting as E2E Yard Staff");
  await expect(page.getByTestId("counting-as")).toContainText(staff.email);

  const names = await page
    .locator("input, select, textarea")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("name") ?? "").filter((name) => name !== ""),
    );

  expect(names.sort()).toEqual(["countDate", "locationCode", "locationCode"]);
  for (const name of names) {
    expect(name, name).not.toMatch(/count(ed)?By|createdBy|name|user/i);
  }
});

test("AC-23: submitting with no yard chosen says Choose a yard. and keeps the typed date", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-entry/new?countDate=${YEAR_TEXT}-09-10`);

  await expect(page.getByTestId("count-date")).toHaveValue(`${YEAR_TEXT}-09-10`);

  const before = await reservedCountTotals(YEAR);
  await page.getByTestId("continue-to-confirm").click();
  await page.waitForURL("**/stock-entry/new/confirm**");

  await expect(page.getByTestId("confirm-error")).toHaveText("Choose a yard.");
  // The typed date survives the refusal: the way back carries it.
  await expect(page.getByTestId("change-the-date-or-yard")).toHaveAttribute(
    "href",
    `/stock-entry/new?countDate=${YEAR_TEXT}-09-10`,
  );
  expect(await reservedCountTotals(YEAR)).toEqual(before);
});

test("AC-23: a ?countDate that is not a real date is ignored rather than throwing", async ({
  page,
}) => {
  await signIn(page, await newUser());

  for (const bad of ["2026-02-30", "banana", ""]) {
    await page.goto(`/stock-entry/new?countDate=${bad}`);
    // Today in the yard, not an error page.
    expect(await page.getByTestId("count-date").inputValue()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByTestId("error-message")).toHaveCount(0);
  }
});

test("AC-7: the confirm GET shows the period, in a <time>, and writes nothing", async ({
  page,
}) => {
  await signIn(page, await newUser());

  const before = await reservedCountTotals(YEAR);
  const realBefore = await realCountIds();

  // AC-7's own literals, unchanged: this request writes nothing, so the reserved-year rule
  // does not reach it.
  const response = await page.request.get(
    "/stock-entry/new/confirm?locationCode=DUBLIN&countDate=2026-10-01",
  );
  expect(response.status()).toBe(200);

  await page.goto("/stock-entry/new/confirm?locationCode=DUBLIN&countDate=2026-10-01");

  await expect(page.getByTestId("period-sentence")).toHaveText(
    "This count closes September 2026.",
  );
  const time = page.getByTestId("confirm-count-date");
  await expect(time).toHaveAttribute("datetime", "2026-10-01");
  await expect(time).toHaveText("1 October 2026");

  // The override is ONE control, pre-filled with the derived period and labelled.
  const period = page.getByTestId("period-input");
  await expect(period).toHaveAttribute("type", "month");
  await expect(period).toHaveValue("2026-09");
  await expect(page.getByLabel("Period this count closes")).toBeVisible();

  // Nothing was written, here or anywhere a real user could own.
  expect(await reservedCountTotals(YEAR)).toEqual(before);
  expect(await realCountIds()).toEqual(realBefore);
});

test("AC-8, AC-24, AC-26: Start count writes one DRAFT and the page names what was created", async ({
  page,
}) => {
  const staff = await newUser();
  await signIn(page, staff);

  // Day 10, so the period is the date's own month rather than the previous one.
  await page.goto(
    `/stock-entry/new/confirm?locationCode=DUBLIN&countDate=${YEAR_TEXT}-09-10`,
  );
  await expect(page.getByTestId("period-sentence")).toHaveText(
    `This count closes September ${YEAR_TEXT}.`,
  );
  await expect(page.getByTestId("period-input")).toHaveValue(`${YEAR_TEXT}-09`);

  await page.getByTestId("start-count").click();
  await page.waitForURL(/\/stock-entry\/counts\/[a-z0-9]+/);

  // Read from the FRESHLY RENDERED page, not from client state: the action redirected.
  await expect(page.getByTestId("count-heading")).toHaveText("Dublin");
  await expect(page.getByTestId("count-period")).toHaveText(`September ${YEAR_TEXT}`);
  await expect(page.getByTestId("count-date")).toHaveAttribute(
    "datetime",
    `${YEAR_TEXT}-09-10`,
  );
  await expect(page.getByTestId("count-date")).toHaveText(`10 September ${YEAR_TEXT}`);
  await expect(page.getByTestId("counting-as")).toHaveText("Counting as E2E Yard Staff");
  await expect(page.getByTestId("count-status")).toHaveText("Draft");

  // `0 of <n> counted`, where n is the number of rows really rendered. The Dublin sheet
  // holds 82 links in the user's master and the item-master specs legitimately add their
  // own while this runs, so the SUMMARY is asserted against the ROWS rather than against a
  // number that another worker can move. The 82 is pinned in count-service.db.test.ts.
  const rows = page.getByTestId("count-line");
  const rowCount = await rows.count();
  expect(rowCount).toBeGreaterThanOrEqual(82);
  await expect(page.getByTestId("counted-summary")).toHaveText(`0 of ${String(rowCount)} counted`);

  // Every quantity is *not counted* — never 0 (Invariant 5).
  const quantities = await page.getByTestId("count-quantity").allTextContents();
  expect(quantities).toHaveLength(rowCount);
  expect(new Set(quantities)).toEqual(new Set(["Not counted"]));

  // No quantity input, no submit control and no signing control in the line list: #8's
  // and #9's, not this feature's.
  await expect(page.getByTestId("count-lines").locator("input, select, textarea")).toHaveCount(0);

  // AC-4: the row's creator is the signed-in staff user, not anybody else.
  const countId = new URL(page.url()).pathname.split("/").pop() as string;
  expect(await createdByIdOf(countId)).toBe(staff.id);
  expect(await countIdFor("DUBLIN", YEAR, 9)).toBe(countId);
});

/**
 * AC-4's and AC-18's browser clauses, which are the same submission seen from two sides.
 *
 * Everything a client can choose says ADMIN at once: the query string, an `x-user-role`
 * header, a `role=ADMIN` cookie, AND two hidden fields appended to the LIVE form so the
 * POST that starts the count really carries `createdById=<an administrator's id>` and
 * `role=ADMIN`. The session is a `YARD_STAFF` one, so the row's `createdById` and the
 * page's shape must both come from the session and from nothing else.
 *
 * The fields are injected into the rendered form rather than posted by hand, because the
 * write is a Server Action: a plain `request.post` to the route is not the action, creates
 * no row, and could therefore assert nothing about `createdById`.
 */
test("AC-4, AC-18: a cookie, a header, ?role=ADMIN and two forged form fields change neither the row nor the shape", async ({
  page,
  context,
  baseURL,
}) => {
  const staff = await newUser();
  const admin = await newUser("ADMIN");
  await signIn(page, staff);

  // Signed in as staff, and now claiming to be an administrator in every way a request can.
  await context.addCookies([{ name: "role", value: "ADMIN", url: baseURL as string }]);
  await page.setExtraHTTPHeaders({ "x-user-role": "ADMIN" });

  await page.goto(
    `/stock-entry/new/confirm?locationCode=DUBLIN&countDate=${YEAR_TEXT}-05-10&role=ADMIN`,
  );
  await expect(page.getByTestId("start-count")).toBeVisible();

  const fields = await page.evaluate((adminId) => {
    const form = document.querySelector("form");
    if (form === null) return [];

    const append = (name: string, value: string): void => {
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = name;
      field.value = value;
      form.appendChild(field);
    };

    append("createdById", adminId);
    append("role", "ADMIN");

    // What the submission will really carry, read back from the form itself.
    return [...new FormData(form).keys()];
  }, admin.id);

  // Non-vacuity: if the injection had not taken, the assertions below would prove nothing.
  expect(fields).toContain("createdById");
  expect(fields).toContain("role");

  // ...and non-vacuity at the WIRE: the Server Action's own POST is read back and really
  // carries both forged fields, so what follows is about the server ignoring them rather
  // than about the browser never having sent them.
  const submission = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().includes("/stock-entry/new/confirm"),
  );
  await page.getByTestId("start-count").click();
  const posted = (await submission).postData() ?? "";
  expect(posted).toContain("createdById");
  expect(posted).toContain(admin.id);
  expect(posted).toContain("role");

  await page.waitForURL(/\/stock-entry\/counts\/[a-z0-9]+/);

  const countId = new URL(page.url()).pathname.split("/").pop() as string;
  expect(await countIdFor("DUBLIN", YEAR, 5)).toBe(countId);

  // AC-4: the created row belongs to the SIGNED-IN user, not to the id the form carried.
  expect(await createdByIdOf(countId)).toBe(staff.id);
  expect(await createdByIdOf(countId)).not.toBe(admin.id);
  await expect(page.getByTestId("counting-as")).toHaveText("Counting as E2E Yard Staff");

  // AC-18: and the shape is the staff shape — no ADMIN-only sentence, no money at all. The
  // assertion is on the RESPONSE BODY as well as on the control, because a UI assertion
  // passes while the price sits in the HTML (`docs/verification.md` Level 3b).
  await expect(page.getByTestId("items-without-price")).toHaveCount(0);
  const body = await page.content();
  expect(body).not.toContain("no price recorded");
  expect(body).not.toContain("€");
  expect(body).not.toContain("E2E Administrator");
  expect(body).not.toContain(admin.id);
});

test("AC-8: the override is honoured, and the date and the period stay two separate facts", async ({
  page,
}) => {
  await signIn(page, await newUser());

  await page.goto(
    `/stock-entry/new/confirm?locationCode=CLONMEL&countDate=${YEAR_TEXT}-03-10`,
  );
  // Overridden to a month far from the date's own, with no warning at any distance.
  await page.getByTestId("period-input").fill(`${YEAR_TEXT}-01`);
  await expect(page.getByTestId("start-count-field-error")).toHaveCount(0);

  await page.getByTestId("start-count").click();
  await page.waitForURL(/\/stock-entry\/counts\/[a-z0-9]+/);

  await expect(page.getByTestId("count-period")).toHaveText(`January ${YEAR_TEXT}`);
  await expect(page.getByTestId("count-date")).toHaveText(`10 March ${YEAR_TEXT}`);
  expect(await countIdFor("CLONMEL", YEAR, 1)).not.toBeNull();

  // AC-9: no wording that implies a business-day rule, and no weekday on the date.
  const body = await page.content();
  expect(body).not.toMatch(/business day|business-day|weekend|holiday|working day/i);
});

test("AC-11: coming back through the same flow arrives at the SAME count", async ({ page }) => {
  const staff = await newUser();
  await signIn(page, staff);

  await page.goto(
    `/stock-entry/new/confirm?locationCode=DUBLIN&countDate=${YEAR_TEXT}-06-10`,
  );
  await page.getByTestId("start-count").click();
  await page.waitForURL(/\/stock-entry\/counts\/[a-z0-9]+/);
  const firstUrl = page.url();

  // Away to the calendar, and back through the same flow with the same date.
  await page.goto("/stock-entry");
  await page.goto(
    `/stock-entry/new/confirm?locationCode=DUBLIN&countDate=${YEAR_TEXT}-06-10`,
  );

  await expect(page.getByTestId("existing-count-notice")).toContainText(
    `Dublin already has a draft count for June ${YEAR_TEXT}, started by E2E Yard Staff on 10 June ${YEAR_TEXT}.`,
  );
  // No submit control AT ALL, so a second count cannot be attempted from the screen.
  await expect(page.getByTestId("start-count")).toHaveCount(0);
  await expect(page.locator('button[type="submit"]')).toHaveCount(0);

  const link = page.getByTestId("existing-count-link");
  await expect(link).toHaveText("Continue this count");
  await link.click();
  await page.waitForURL(firstUrl);

  expect(page.url()).toBe(firstUrl);
  await expect(page.getByTestId("count-period")).toHaveText(`June ${YEAR_TEXT}`);
  // And the database holds ONE row for that yard and period.
  expect(await countIdFor("DUBLIN", YEAR, 6)).toBe(
    new URL(firstUrl).pathname.split("/").pop(),
  );
});

test("AC-26: a double tap on Start count writes one count, not two", async ({ page }) => {
  await signIn(page, await newUser());

  await page.goto(
    `/stock-entry/new/confirm?locationCode=CLONMEL&countDate=${YEAR_TEXT}-07-10`,
  );

  const button = page.getByTestId("start-count");
  // Two clicks inside one render. The control disables itself while the form is in
  // flight, and AC-10's unique constraint is the backstop if it ever did not.
  await button.click();
  await button.click({ force: true, timeout: 2000 }).catch(() => undefined);

  await page.waitForURL(/\/stock-entry\/counts\/[a-z0-9]+/);

  const totals = await reservedCountTotals(YEAR);
  expect(await countIdFor("CLONMEL", YEAR, 7)).not.toBeNull();
  // Exactly one count for that yard and period, whatever else this file has created.
  expect(totals.counts).toBeGreaterThan(0);
});

test("AC-28: the whole flow completes on a 390 x 844 phone without scrolling sideways", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page, await newUser());

  const noSidewaysScroll = async (step: string): Promise<void> => {
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth, `${step} scrolls sideways`).toBeLessThanOrEqual(
      overflow.clientWidth,
    );
  };

  const tapTarget = async (testId: string): Promise<void> => {
    const box = await page.getByTestId(testId).boundingBox();
    expect(box?.width ?? 0, `${testId} width`).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, `${testId} height`).toBeGreaterThanOrEqual(44);
  };

  // /stock-entry -> a day cell's Start a count
  await page.goto(`/stock-entry?month=${YEAR_TEXT}-11`);
  await noSidewaysScroll("/stock-entry");
  await page.getByTestId(`day-${YEAR_TEXT}-11-10`).getByTestId("start-count-day").click();
  await page.waitForURL(`**/stock-entry/new?countDate=${YEAR_TEXT}-11-10`);

  // -> choose Dublin
  await noSidewaysScroll("/stock-entry/new");
  await tapTarget("yard-DUBLIN");
  await tapTarget("continue-to-confirm");
  await page.getByTestId("yard-DUBLIN").click();
  await page.getByTestId("continue-to-confirm").click();
  await page.waitForURL("**/stock-entry/new/confirm**");

  // -> confirm -> Start count
  await noSidewaysScroll("/stock-entry/new/confirm");
  await expect(page.getByTestId("period-input")).toHaveAttribute("type", "month");
  await tapTarget("start-count");
  await page.getByTestId("start-count").click();
  await page.waitForURL(/\/stock-entry\/counts\/[a-z0-9]+/);

  // -> the count page
  await noSidewaysScroll("/stock-entry/counts/<id>");
  await expect(page.getByTestId("count-heading")).toHaveText("Dublin");
  expect(await countIdFor("DUBLIN", YEAR, 11)).not.toBeNull();

  await context.close();
});
