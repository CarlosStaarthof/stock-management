import { expect, test } from "@playwright/test";

import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import { seededMasterCounts } from "./support/item-master";
import {
  RESERVED_YEAR,
  anyUnitPriceText,
  clearReservedYear,
  realCountIds,
  reservedCountTotals,
  seedCount,
} from "./support/stock-entry";
import { badgeTuples, bodyOf } from "./support/stock-takes";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 010's browser half for `/stock-takes` — the calendar, the scope selector and the
 * two count jumps.
 *
 * THIS FILE OWNS RESERVED YEAR 2101 (007 AC-30, 010 AC-21) and deletes only that year,
 * never the range: `playwright.config.ts` runs three files at once, so a range delete
 * would remove a sibling's rows mid-run and fail intermittently at `retries: 0`. It
 * asserts through `realCountIds()` that the set of counts a REAL user could own is
 * identical before and after.
 *
 * ITS COUNTS ARE BUILT THROUGH PRISMA, not through `startCount`, which is why 2101 is
 * reachable at all: 007 AC-8 caps the PERIOD a count started through that flow may close
 * at 2100, and this file needs counts to LOOK at rather than counts to make.
 *
 * THE FIXTURE IS AC-11's, exactly: Dublin on 31 January, 30 April and 31 May, Clonmel on
 * 31 March and again on 30 April. So April holds two yards on one day (AC-4, AC-6), March
 * holds only Clonmel (AC-6), May is a neighbouring month with a count in it (AC-4), and
 * *Previous count* from April must answer `2101-01` under `DUBLIN` and `2101-03` under
 * `BOTH` — three months back at one yard, skipping the two nobody counted there (AC-11).
 */
const YEAR = RESERVED_YEAR.takesCalendar;
const Y = String(YEAR);
const APRIL = `${Y}-04`;

const created: string[] = [];
let dublinJanuaryId = "";
let dublinAprilId = "";
let dublinMayId = "";
let clonmelMarchId = "";
let clonmelAprilId = "";
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

  const owner = await createTestUser("YARD_STAFF", "stock-takes-calendar-owner");
  created.push(owner.username);

  const seed = async (
    locationCode: "DUBLIN" | "CLONMEL",
    month: number,
    countDate: string,
  ): Promise<string> =>
    seedCount({ locationCode, year: YEAR, month, countDate, createdById: owner.id });

  dublinJanuaryId = await seed("DUBLIN", 1, `${Y}-01-31`);
  clonmelMarchId = await seed("CLONMEL", 3, `${Y}-03-31`);
  dublinAprilId = await seed("DUBLIN", 4, `${Y}-04-30`);
  clonmelAprilId = await seed("CLONMEL", 4, `${Y}-04-30`);
  dublinMayId = await seed("DUBLIN", 5, `${Y}-05-31`);
});

test.afterAll(async () => {
  if (!(await databaseIsReachable())) return;

  await clearReservedYear(YEAR);
  for (const username of created.splice(0)) {
    await removeUser(username);
  }

  // 007 AC-30: this file reached nothing outside its own reservation.
  expect(await realCountIds()).toEqual(realCountsBefore);
  expect(await seededMasterCounts()).toEqual(masterBefore);
});

async function newUser(
  role: "YARD_STAFF" | "ADMIN" = "YARD_STAFF",
  label = "stock-takes-calendar",
): Promise<TestUser> {
  const user = await createTestUser(role, label);
  created.push(user.username);
  return user;
}

/**
 * AC-19's LEVER, and it is the display name's content rather than the session's role.
 *
 * `createTestUser` builds the name `${label}-` followed by 16 letters `a`-`p` (021 AC-40;
 * before #21 it built an email address). Every other label in this suite is full of hyphens -
 * `stock-takes-calendar`, `stock-takes-count` - and browsers take a line break AFTER a
 * hyphen, so the longest unbreakable run a normal fixture name can produce is its 16-letter
 * suffix, which fits at 320 px. That is why both roles measure the same and why a role
 * repetition alone cannot see the defect.
 *
 * THIS LABEL IS DELIBERATELY HYPHEN-FREE, DOT-FREE AND 61 CHARACTERS LONG: one unbreakable
 * token, wider than a 390 px viewport. It is the only thing in the suite that pressures the
 * identity header, which renders `{user.name}` OUTSIDE `stock-takes-body` - so AC-13's byte
 * equality cannot cover it - and which overflowed the document at 390 px before
 * `break-words` was added to it. DO NOT "tidy" this back to a hyphenated label: doing so
 * leaves the test green and the guarantee gone. Spec: 010 AC-19 and its fifth amendment.
 *
 * LENGTH IS MEASURED, NOT GUESSED. AC-19's floor is 56 characters; a 45-character run was
 * tried first and the unfixed page PASSED at both viewports - at 14 px text the run is about
 * 6.6 px per character, so 45 characters (~297 px) still fits the 296 px a 320 px viewport
 * leaves inside `p-3`. 61 characters overflows at 390 px, which is the wider and therefore
 * the harder of the two measurements. The guard below is set at that measured floor of 56,
 * which is what the criterion now says: its original 40 admitted a run that cannot fail, and
 * the sixth amendment corrected it to the measured number.
 */
const UNBREAKABLE_LABEL = "stocktakescalendarunbreakableemaillocalpartthatmustwrapatac19";

/* ------------------------------------------------------------------ AC-1, the routes */

test("AC-1: a signed-out GET is a 307 to sign-in carrying the path, and sends no content", async ({
  page,
}) => {
  for (const path of ["/stock-takes", `/stock-takes/counts/${dublinAprilId}`]) {
    const response = await page.request.get(path, { maxRedirects: 0 });

    expect([302, 307], path).toContain(response.status());
    const location = response.headers()["location"] ?? "";
    expect(location, path).toContain("/sign-in");
    expect(location, path).toContain(`callbackUrl=${encodeURIComponent(path)}`);

    // None of the page's own content travelled with the refusal.
    const body = await response.text();
    expect(body, path).not.toContain("stock-takes-body");
    expect(body, path).not.toContain("Stock Takes");
  }
});

test("AC-1: both roles get 200, the heading, the email and a way out", async ({ page }) => {
  for (const role of ["YARD_STAFF", "ADMIN"] as const) {
    const user = await newUser(role);
    await signIn(page, user);
    await page.goto(`/stock-takes?month=${APRIL}`);

    // #3's heading, kept verbatim: `role-access.spec.ts` asserts it for both roles and
    // passes unmodified.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Stock Takes");
    await expect(page.getByTestId("signed-in-name")).toHaveText(user.name);
    await expect(page.getByTestId("month-heading")).toHaveText(`April ${Y}`);
    expect(
      await page.getByTestId("month-heading").evaluate((node) => node.tagName),
    ).toBe("H2");

    const detail = await page.request.get(`/stock-takes/counts/${dublinAprilId}`);
    expect(detail.status(), role).toBe(200);

    await page.getByTestId("sign-out").click();
    await page.waitForURL((url) => !url.pathname.startsWith("/stock-takes"));
    const afterSignOut = await page.request.get("/stock-takes", { maxRedirects: 0 });
    expect([302, 307]).toContain(afterSignOut.status());
  }
});

/* ------------------------------------------------- AC-4, AC-5, one calendar not two */

test("AC-4: the two calendars render the SAME badges for the same month", async ({ page }) => {
  await signIn(page, await newUser());

  await page.goto(`/stock-entry?month=${APRIL}`);
  const entryBadges = await badgeTuples(page);

  await page.goto(`/stock-takes?month=${APRIL}&yard=BOTH`);
  const takesBadges = await badgeTuples(page);

  // Exactly, and in the same per-day order — an array equality, not a set comparison.
  expect(takesBadges).toEqual(entryBadges);
  expect(entryBadges.length).toBeGreaterThan(0);
  expect(entryBadges.some((tuple) => tuple.includes(dublinAprilId))).toBe(true);
  expect(entryBadges.some((tuple) => tuple.includes(clonmelAprilId))).toBe(true);

  // And in the neighbouring month too, so the equality is not an accident of one grid.
  await page.goto(`/stock-entry?month=${Y}-05`);
  const entryMay = await badgeTuples(page);
  await page.goto(`/stock-takes?month=${Y}-05&yard=BOTH`);
  expect(await badgeTuples(page)).toEqual(entryMay);
  expect(entryMay.some((tuple) => tuple.includes(dublinMayId))).toBe(true);
});

test("AC-5: what each calendar owns, asserted by absence", async ({ page }) => {
  await signIn(page, await newUser());

  await page.goto(`/stock-takes?month=${APRIL}`);
  // This calendar reads; it does not start a count.
  await expect(page.getByTestId("start-count-day")).toHaveCount(0);
  const empty = page.getByTestId(`day-${APRIL}-17`);
  await expect(empty).toHaveCount(1);
  await expect(empty.locator("a")).toHaveCount(0);
  await expect(page.getByTestId("calendar")).toHaveCount(1);
  expect(await page.getByTestId("weekday-heading").allTextContents()).toEqual([
    "Mon",
    "Tue",
    "Wed",
    "Thu",
    "Fri",
    "Sat",
    "Sun",
  ]);
  const takesBadge = page.locator(`[data-count-id="${dublinAprilId}"]`);
  await expect(takesBadge).toHaveAttribute(
    "href",
    `/stock-takes/counts/${dublinAprilId}`,
  );

  await page.goto(`/stock-entry?month=${APRIL}`);
  // #7's calendar has no scope selector and no count jumps — and gained none.
  await expect(page.getByTestId("yard-scope")).toHaveCount(0);
  await expect(page.getByTestId("previous-count")).toHaveCount(0);
  await expect(page.getByTestId("next-count")).toHaveCount(0);
  await expect(page.getByTestId("calendar")).toHaveCount(1);
  await expect(page.getByTestId("start-count-day").first()).toHaveAttribute(
    "href",
    /\/stock-entry\/new\?countDate=/,
  );
  // The one deliberate divergence, in one test so it is visible.
  await expect(page.locator(`[data-count-id="${dublinAprilId}"]`)).toHaveAttribute(
    "href",
    `/stock-entry/counts/${dublinAprilId}`,
  );
});

/* ------------------------------------------------------- AC-6, the Dublin / Clonmel */

test("AC-6: three scope links, labelled and tallied for the displayed month", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-takes?month=${APRIL}`);

  const options = page.getByTestId("yard-scope").getByTestId("yard-scope-option");
  await expect(options).toHaveCount(3);
  expect(await options.allTextContents()).toEqual(["Dublin (1)", "Clonmel (1)", "Both (2)"]);

  // Exactly one option is current, and with no `?yard` it is `Both`.
  await expect(page.locator("[aria-current='true']")).toHaveCount(1);
  await expect(options.nth(2)).toHaveAttribute("aria-current", "true");

  await page.goto(`/stock-takes?month=${APRIL}&yard=CLONMEL`);
  await expect(page.locator("[aria-current='true']")).toHaveCount(1);
  await expect(
    page.getByTestId("yard-scope").getByTestId("yard-scope-option").nth(1),
  ).toHaveAttribute("aria-current", "true");
});

test("AC-6: what Both means on a day only one yard was counted", async ({ page }) => {
  await signIn(page, await newUser());

  // 31 March: Clonmel only.
  await page.goto(`/stock-takes?month=${Y}-03`);
  const marchCell = page.getByTestId(`day-${Y}-03-31`);
  await expect(marchCell.getByTestId("count-badge")).toHaveCount(1);
  await expect(marchCell.locator(`[data-count-id="${clonmelMarchId}"]`)).toHaveCount(1);

  await page.goto(`/stock-takes?month=${Y}-03&yard=CLONMEL`);
  await expect(marchCell.getByTestId("count-badge")).toHaveCount(1);

  await page.goto(`/stock-takes?month=${Y}-03&yard=DUBLIN`);
  await expect(marchCell.getByTestId("count-badge")).toHaveCount(0);
  await expect(marchCell.locator("a")).toHaveCount(0);

  // 30 April: both, Dublin before Clonmel.
  await page.goto(`/stock-takes?month=${APRIL}`);
  const aprilBadges = page.getByTestId(`day-${APRIL}-30`).getByTestId("count-badge");
  await expect(aprilBadges).toHaveCount(2);
  await expect(aprilBadges.nth(0)).toHaveAttribute("data-location-code", "DUBLIN");
  await expect(aprilBadges.nth(1)).toHaveAttribute("data-location-code", "CLONMEL");
});

test("AC-6, AC-17: an unreadable ?yard is a 307 and no error", async ({ page }) => {
  await signIn(page, await newUser());

  for (const query of ["?yard=banana", "?yard=dublin", "?yard=", "?yard=DUBLIN&yard=CLONMEL"]) {
    const response = await page.request.get(`/stock-takes${query}`, { maxRedirects: 0 });

    expect(response.status(), query).toBe(307);
    expect(response.headers()["location"] ?? "", query).toContain("/stock-takes");

    await page.goto(`/stock-takes${query}`);
    await expect(page.getByTestId("calendar"), query).toBeVisible();
    await expect(page.getByTestId("error-message"), query).toHaveCount(0);
  }
});

/* ---------------------------------------------------------------- AC-11, the jumps */

test("AC-11: Previous count skips the months nobody counted at that yard", async ({ page }) => {
  await signIn(page, await newUser());

  // Three months back at Dublin: April -> January, past the two nobody counted there.
  await page.goto(`/stock-takes?month=${APRIL}&yard=DUBLIN`);
  await expect(page.getByTestId("previous-count")).toHaveAttribute(
    "href",
    `/stock-takes?month=${Y}-01&yard=DUBLIN`,
  );
  await expect(page.getByTestId("next-count")).toHaveAttribute(
    "href",
    `/stock-takes?month=${Y}-05&yard=DUBLIN`,
  );

  // One month back under Both, because Clonmel counted in March.
  await page.goto(`/stock-takes?month=${APRIL}&yard=BOTH`);
  await expect(page.getByTestId("previous-count")).toHaveAttribute(
    "href",
    `/stock-takes?month=${Y}-03`,
  );

  // Following it lands on that month, and the count is drawn there.
  await page.getByTestId("previous-count").click();
  await expect(page.getByTestId("month-heading")).toHaveText(`March ${Y}`);
  await expect(page.locator(`[data-count-id="${clonmelMarchId}"]`)).toHaveCount(1);
});

test("AC-11: with no neighbour the control still renders, disabled and not an anchor", async ({
  page,
}) => {
  await signIn(page, await newUser());

  // A MONTH AFTER EVERY COUNT THERE CAN BE, rather than before the earliest one in this
  // file. "Nothing before" is not this file's to claim - `stock-takes-count.spec.ts` owns
  // 2102 and the eight stock-entry specs own 2091-2100, and all of them may be running in
  // another worker right now, which is how the first version of this assertion failed.
  // "Nothing after 2103-01" is a fact: 2102 is the highest reserved year, the item-master
  // fixture's 2999 count belongs to the `chromium` project which has completed, and a real
  // count is always below RESERVED_FLOOR.
  await page.goto(`/stock-takes?month=2103-01`);
  const next = page.getByTestId("next-count");

  await expect(next).toHaveCount(1);
  await expect(next).toHaveText("Next count");
  await expect(next).toHaveAttribute("aria-disabled", "true");
  expect(await next.evaluate((node) => node.tagName)).not.toBe("A");

  // And the one that does have a neighbour is an anchor with the same test id.
  const previous = page.getByTestId("previous-count");
  expect(await previous.evaluate((node) => node.tagName)).toBe("A");
  await expect(previous).toHaveText("Previous count");
});

/* ------------------------------------------- AC-12, AC-13, AC-14, one screen, no euro */

test("AC-12, AC-13: the calendar body is byte-identical between the two roles, and has no euro", async ({
  browser,
}) => {
  const price = await anyUnitPriceText();

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, await newUser("YARD_STAFF"));

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, await newUser("ADMIN"));

  for (const url of [`/stock-takes?month=${APRIL}`, `/stock-takes?month=${APRIL}&yard=DUBLIN`]) {
    const staffBody = await bodyOf(staffPage, url);
    const adminBody = await bodyOf(adminPage, url);

    // Same length, same characters, no normalisation beyond the equality itself - and no
    // `<!-- -->` hydration separator in either, which is what makes that equality stable
    // rather than a race between the two fetches (see the count spec for the transcript).
    expect(staffBody, url).not.toContain("<!-- -->");
    expect(adminBody, url).not.toContain("<!-- -->");
    expect(adminBody.length, url).toBe(staffBody.length);
    expect(adminBody, url).toBe(staffBody);

    for (const body of [staffBody, adminBody]) {
      expect(body, url).not.toContain("€");
      expect(body, url).not.toContain("No price");
      expect(body, url).not.toContain("unitPrice");
      if (price !== null) expect(body, url).not.toContain(price);
    }

    // The whole page, not only the compared element: the euro is nowhere in the response.
    const html = await staffPage.content();
    expect(html, url).not.toContain("€");
    expect(html, url).not.toContain("unitPrice");
  }

  await staffContext.close();
  await adminContext.close();
});

test("AC-14: nothing the client sets changes what either session is sent", async ({
  browser,
}) => {
  for (const role of ["YARD_STAFF", "ADMIN"] as const) {
    const other = role === "ADMIN" ? "YARD_STAFF" : "ADMIN";
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, await newUser(role));

    const plain = await bodyOf(page, `/stock-takes?month=${APRIL}`);

    await context.addCookies([
      { name: "role", value: other, url: page.url().split("/stock-takes")[0] },
    ]);
    await page.setExtraHTTPHeaders({ "x-user-role": other });
    const spoofed = await bodyOf(page, `/stock-takes?month=${APRIL}&role=${other}`);

    expect(spoofed, role).toBe(plain);

    await context.close();
  }
});

/* -------------------------------------------------------- AC-16, the reading mode */

test("AC-16: every link on a scoped calendar carries the scope, and the default is never spelled", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-takes?month=${APRIL}&yard=CLONMEL`);

  // Every link EXCEPT the scope selector itself, which is the one control whose job is to
  // leave the current scope. The month controls, *Today*, both jumps and every badge.
  const hrefsOutsideTheSelector = async (): Promise<string[]> =>
    page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          "[data-testid='stock-takes-body'] a:not([data-testid='yard-scope-option'])",
        ),
      ).map((anchor) => anchor.getAttribute("href") ?? ""),
    );

  const hrefs = await hrefsOutsideTheSelector();
  // Non-vacuity by KIND rather than by count: the three month controls, the count jump
  // that has a neighbour, and the Clonmel badge. (April's *Next count* is correctly not an
  // anchor at all — Clonmel has nothing after it in this reserved year — which is why a
  // bare count here would be asserting about the fixture instead of about the links.)
  expect(hrefs.length).toBeGreaterThanOrEqual(5);
  expect(hrefs.some((href) => href.startsWith("/stock-takes/counts/"))).toBe(true);
  expect(hrefs.filter((href) => href.includes("month=")).length).toBeGreaterThanOrEqual(3);
  for (const href of hrefs) {
    expect(href, href).toContain("yard=CLONMEL");
  }

  // The selector's own three: each carries ITS scope, and `Both` carries none at all.
  const options = page.getByTestId("yard-scope").getByTestId("yard-scope-option");
  await expect(options.nth(0)).toHaveAttribute("href", `/stock-takes?month=${APRIL}&yard=DUBLIN`);
  await expect(options.nth(1)).toHaveAttribute("href", `/stock-takes?month=${APRIL}&yard=CLONMEL`);
  await expect(options.nth(2)).toHaveAttribute("href", `/stock-takes?month=${APRIL}`);

  // The default scope is never spelled into a URL: with no query string, nothing this page
  // renders puts one there.
  await page.goto("/stock-takes");
  for (const href of await hrefsOutsideTheSelector()) {
    expect(href, href).not.toContain("yard=");
  }
  await expect(page.getByTestId("calendar")).toBeVisible();
});

/* ------------------------------------------------ AC-17, AC-3, nothing throws, nothing writes */

test("AC-17: no query parameter combination returns a 500 or a database string", async ({
  page,
}) => {
  await signIn(page, await newUser());

  for (const query of [
    "?month=2026-13",
    "?month=banana",
    "?month=",
    "?month=2026-01&month=2026-02",
    "?yard=banana",
    "?yard=",
    "?yard=DUBLIN&yard=DUBLIN",
    "?show=banana",
    "?show=",
    "?show=held&show=all",
    `?month=${APRIL}&yard=banana&show=banana`,
    "?month=../../etc/passwd",
  ]) {
    const response = await page.request.get(`/stock-takes${query}`);

    expect(response.status(), query).toBe(200);
    const body = await response.text();
    for (const forbidden of [
      "prisma",
      "Prisma",
      "violates",
      "constraint",
      "SQLSTATE",
      "23514",
      "23505",
      "P2002",
      "P2025",
      "at async",
    ]) {
      expect(body, `${query} leaked ${forbidden}`).not.toContain(forbidden);
    }
  }
});

test("AC-3: reading the calendar writes nothing", async ({ page }) => {
  const before = await reservedCountTotals(YEAR);

  await signIn(page, await newUser());
  for (const url of [
    `/stock-takes?month=${APRIL}`,
    `/stock-takes?month=${APRIL}&yard=DUBLIN`,
    `/stock-takes/counts/${dublinJanuaryId}`,
    `/stock-takes/counts/${dublinJanuaryId}?show=all`,
  ]) {
    await page.goto(url);
  }

  expect(await reservedCountTotals(YEAR)).toEqual(before);
});

/* ------------------------------------------------------------ AC-18, no JavaScript */

test("AC-18: with the bundle disabled, every control on the calendar still navigates", async ({
  browser,
}) => {
  const signedIn = await browser.newContext();
  const helper = await signedIn.newPage();
  await signIn(helper, await newUser());
  const session = await signedIn.storageState();
  await signedIn.close();

  const context = await browser.newContext({ javaScriptEnabled: false, storageState: session });
  const page = await context.newPage();

  await page.goto(`/stock-takes?month=${APRIL}`);
  await expect(page.getByTestId("calendar")).toBeVisible();

  // The scope selector.
  await page.getByTestId("yard-scope").getByTestId("yard-scope-option").nth(0).click();
  await page.waitForLoadState("load");
  expect(new URL(page.url()).searchParams.get("yard")).toBe("DUBLIN");

  // The month controls.
  await page.getByTestId("previous-month").click();
  await page.waitForLoadState("load");
  await expect(page.getByTestId("month-heading")).toHaveText(`March ${Y}`);

  // And the count jump, which is the control this feature exists for.
  await page.goto(`/stock-takes?month=${APRIL}&yard=DUBLIN`);
  await page.getByTestId("previous-count").click();
  await page.waitForLoadState("load");
  await expect(page.getByTestId("month-heading")).toHaveText(`January ${Y}`);

  await context.close();
});

/* ---------------------------------------------------------------- AC-19, the phone */

test("AC-19: the calendar never scrolls sideways at 390 px or 320 px, in any scope", async ({
  browser,
}) => {
  // AC-19 takes every measurement in BOTH sessions. It is not a formality on this page:
  // the identity header sits OUTSIDE `stock-takes-body`, so AC-13's byte equality does not
  // cover it, and `{user.name}` holds an unbreakable run whose length varies per session -
  // the only part of this page that does. At 320 px that is exactly what would push
  // `scrollWidth` past `clientWidth`, and nothing else in the suite measures it for an
  // administrator. Same shape as the AC-14 test above.
  // The guard, so a future edit that shortens or hyphenates the label fails HERE, saying
  // what it broke, instead of leaving the measurement below silently unpressured.
  expect(
    UNBREAKABLE_LABEL,
    "AC-19 needs one unbreakable run long enough to overflow 390 px - see the constant",
  ).toMatch(/^[a-z0-9]{56,}$/);

  for (const role of ["YARD_STAFF", "ADMIN"] as const) {
    // The STAFF pass carries the long name: it is the first iteration, so an overflow
    // regression aborts at the very first measurement rather than after a full second
    // session, and it costs no extra context, user or navigation. The ADMIN pass keeps an
    // ordinary hyphenated name, which leaves it as the plain-name control B1 asked for -
    // so a failure on one pass and not the other names the name's CONTENT as the cause.
    const signedIn = await browser.newContext();
    const helper = await signedIn.newPage();
    await signIn(helper, await newUser(role, role === "YARD_STAFF" ? UNBREAKABLE_LABEL : undefined));
    const session = await signedIn.storageState();
    await signedIn.close();

    for (const width of [390, 320]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        storageState: session,
      });
      const page = await context.newPage();

      for (const yard of ["DUBLIN", "CLONMEL", "BOTH"]) {
        // April is the month one day carries two badges.
        await page.goto(`/stock-takes?month=${APRIL}&yard=${yard}`);

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth, `${role} ${String(width)} ${yard}`).toBeLessThanOrEqual(
          overflow.clientWidth,
        );

        // The seven columns all fit, each day cell at least 40 px wide.
        const headings = page.getByTestId("weekday-heading");
        for (let column = 0; column < 7; column += 1) {
          const box = await headings.nth(column).boundingBox();
          expect(
            box?.width ?? 0,
            `${role} ${String(width)} column ${String(column)}`,
          ).toBeGreaterThanOrEqual(40);
        }
      }

      await page.goto(`/stock-takes?month=${APRIL}`);
      for (const testId of [
        "previous-month",
        "today",
        "next-month",
        "previous-count",
        "next-count",
      ]) {
        const box = await page.getByTestId(testId).boundingBox();
        expect(box?.width ?? 0, `${role} ${String(width)} ${testId}`).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0, `${role} ${String(width)} ${testId}`).toBeGreaterThanOrEqual(44);
      }

      const options = page.getByTestId("yard-scope").getByTestId("yard-scope-option");
      for (let option = 0; option < 3; option += 1) {
        const box = await options.nth(option).boundingBox();
        expect(
          box?.width ?? 0,
          `${role} ${String(width)} scope ${String(option)}`,
        ).toBeGreaterThanOrEqual(44);
        expect(
          box?.height ?? 0,
          `${role} ${String(width)} scope ${String(option)}`,
        ).toBeGreaterThanOrEqual(44);
      }

      await context.close();
    }
  }
});

test("AC-4, AC-19: the badge is the SAME box on both calendars, and is not a 44 px target", async ({
  browser,
}) => {
  const signedIn = await browser.newContext();
  const helper = await signedIn.newPage();
  await signIn(helper, await newUser());
  const session = await signedIn.storageState();
  await signedIn.close();

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: session,
  });
  const page = await context.newPage();

  await page.goto(`/stock-takes?month=${APRIL}`);
  const takes = await page.locator(`[data-count-id="${dublinAprilId}"]`).boundingBox();
  await page.goto(`/stock-entry?month=${APRIL}`);
  const entry = await page.locator(`[data-count-id="${dublinAprilId}"]`).boundingBox();

  // AC-4, MEASURED RATHER THAN SCANNED: the two optional props changed where a badge
  // LEADS and nothing about how it is drawn. Same width, same height, in both calendars,
  // at the viewport the product is used at.
  expect(takes?.width).toBe(entry?.width);
  expect(takes?.height).toBe(entry?.height);
  expect(takes?.width ?? 0).toBeGreaterThanOrEqual(40);

  // AC-19 ASKS FOR 44 x 44 ON EACH COUNT BADGE AND THIS FEATURE DOES NOT DELIVER IT: the
  // shared badge measures 47.1 x 29 on BOTH calendars. It cannot be made taller from here
  // - the badge belongs to `CalendarGrid`, AC-4 allows this feature exactly two optional
  // props on that component and requires #7's rendering to be unchanged, and a 44 px badge
  // would not fit two counts in a 64 px day cell. The conflict is between two criteria of
  // this spec and is recorded in progress/impl_stock_takes_history.md rather than resolved
  // by quietly restyling #7's calendar. Every OTHER control AC-19 lists is asserted at 44
  // above; this line pins what the badge actually is, so a later change to it is visible.
  expect(takes?.height ?? 0).toBeLessThan(44);

  // THE BOUND IS TWO-SIDED ON PURPOSE. `toBeLessThan(44)` cannot be falsified by a
  // REDUCTION, the width bound above bounds width only, and the cross-page height equality
  // is blind to any change in `CalendarGrid`, which is the one component BOTH calendars
  // render - so every change to this badge moves both numbers together. Without a floor the
  // #10 reviewer shrank the badge from 29 px to 8 px and this test still passed. Shrinking
  // is the direction an accidental style change most often goes, and the badge is the one
  // control AC-19's 44 x 44 was waived for, so it is the one that most needs a floor.
  // Verified by mutation in both directions, transcript in
  // progress/impl_stock_takes_history.md. Spec: 010 AC-19 and its fourth amendment.
  expect(takes?.height ?? 0).toBeGreaterThanOrEqual(24);

  await context.close();
});
