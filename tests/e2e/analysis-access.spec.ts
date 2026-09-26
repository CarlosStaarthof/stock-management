import { expect, test } from "@playwright/test";

import { ACCESS_DENIED_MESSAGE } from "@/lib/auth-messages";
import {
  BREAKDOWN_LABEL,
  INCOMPLETE_TOTAL,
  NOT_COUNTED,
  missingYardsMessage,
} from "@/lib/analysis-messages";
import { CURRENCY_SYMBOL } from "@/lib/money";

import {
  activeYards,
  approvedCountTally,
  clearPriceSnapshots,
  pickSheetItems,
  seedCountHolding,
} from "./support/analysis";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import { seededMasterCounts } from "./support/item-master";
import {
  RESERVED_YEAR,
  approveAs,
  clearReservedYear,
  realCountIds,
  reservedCountTotals,
  submitAs,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 011's browser half for the ROUTE: who may reach `/analysis`, what a refused session
 * is sent, what a hand-edited query string does, and what the screen measures on a phone.
 *
 * THIS FILE OWNS RESERVED YEAR 2103 (007 AC-30, 011 AC-24) and deletes only that year. Its
 * counts are built through Prisma and the lifecycle SERVICE rather than through the start
 * flow, which is why 2103 is reachable although 007 AC-8 caps a period started through
 * `startCount` at 2100.
 *
 * EVERY NAVIGATION CARRIES AN EXPLICIT `?period`, AND THAT IS NOT DECORATION. With no
 * `?period` the page opens on the latest period holding an approved count ANYWHERE in the
 * database, and `playwright.config.ts` runs fourteen spec files across three workers —
 * several of which approve counts in their own reserved years while this one is running.
 * A measurement taken on "whatever period happened to be latest" is a measurement of
 * another spec's fixture. The one test that must read the default names the reason it can
 * (`analysis-figures.spec.ts`, which owns the two HIGHEST reserved years).
 *
 * THE PERIODS ARE CHOSEN SO THE THIRTEEN-MONTH WINDOW HOLDS NO SIBLING'S ROWS. The window
 * of `2103-12` is `2102-12` through `2103-12`; `tests/e2e/stock-takes-count.spec.ts` owns
 * 2102 but seeds only January, February and March of it. So every bar and every gap on
 * the chart below belongs to this file.
 */
const YEAR = RESERVED_YEAR.analysisAccess;
const Y = String(YEAR);

/** Complete: both yards approved. The period every measurement below is taken on. */
const COMPLETE = `${Y}-12`;
/** Incomplete: Dublin approved, Clonmel never counted. */
const INCOMPLETE = `${Y}-11`;

const created: string[] = [];
let dublinCompleteId = "";
let draftId = "";
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

  const owner = await createTestUser("YARD_STAFF", "analysis-access-owner");
  const approver = await createTestUser("ADMIN", "analysis-access-approver");
  created.push(owner.username, approver.username);

  const dublinItems = await pickSheetItems("DUBLIN", 4);
  const clonmelItems = await pickSheetItems("CLONMEL", 3);

  const approved = async (
    locationCode: "DUBLIN" | "CLONMEL",
    month: number,
    day: string,
    items: { itemId: string }[],
    quantity: string,
  ): Promise<string> => {
    const countId = await seedCountHolding({
      locationCode,
      year: YEAR,
      month,
      countDate: `${Y}-${String(month).padStart(2, "0")}-${day}`,
      owner,
      lines: items.map((item) => ({ itemId: item.itemId, quantity })),
    });
    await submitAs(countId, owner);
    await approveAs(countId, approver);
    return countId;
  };

  dublinCompleteId = await approved("DUBLIN", 12, "31", dublinItems, "4");
  await approved("CLONMEL", 12, "31", clonmelItems, "2");
  await approved("DUBLIN", 11, "30", dublinItems, "3");

  // One held line with no price, so the disclosure AC-9 owns is on the measured page too:
  // a sentence that only ever renders in another spec is a sentence this one cannot
  // overflow a phone with.
  await clearPriceSnapshots(dublinCompleteId, [dublinItems[0].itemId]);

  // A DRAFT, for the two `/stock-entry` routes AC-19's euro census walks.
  draftId = await seedCountHolding({
    locationCode: "DUBLIN",
    year: YEAR,
    month: 10,
    countDate: `${Y}-10-31`,
    owner,
    lines: dublinItems.map((item) => ({ itemId: item.itemId, quantity: "1" })),
  });
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
  role: "YARD_STAFF" | "ADMIN" = "ADMIN",
  label = "analysis-access",
): Promise<TestUser> {
  const user = await createTestUser(role, label);
  created.push(user.username);
  return user;
}

/**
 * AC-20's LEVER, and it is the display name's CONTENT rather than the session's role.
 *
 * `createTestUser` builds the name `${label}-` followed by 16 letters `a`–`p` (021 AC-40;
 * before #21 it built an email address), and every other label in this suite is full of
 * hyphens — browsers take a line break AFTER a hyphen, so the longest unbreakable run an
 * ordinary fixture name can produce is its 16-letter suffix, which fits at 320 px. That is
 * why a page with this defect passed a no-sideways-scroll assertion on three routes for
 * three features (010's fifth and sixth amendments, and the third instance is exactly this
 * page).
 *
 * HYPHEN-FREE, DOT-FREE AND 61 CHARACTERS: one unbreakable token, wider than a 390 px
 * viewport. DO NOT "tidy" this into a hyphenated label — doing so leaves the test green
 * and the guarantee gone.
 *
 * LENGTH IS MEASURED ON THIS PAGE, NOT INHERITED FROM #10'S. `/stock-takes` renders the
 * header at `text-sm`, about 6.6 px per character, where the break-even label is 56.
 * THIS page rendered it at `text-base`, measured at about 7.1 px per character, so the
 * break-even is SHORTER: a 390 px viewport leaves 366 px inside `p-3`, and the unbreakable
 * token is the label plus the hyphen after it, so 51 characters (a 52-character run, ~371
 * px) is the shortest label that overflows and 50 fits exactly. At 320 px it is 42. The
 * unfixed page measured `scrollWidth` 478 against both viewports with the 61 below — 88 px
 * of sideways scroll at the WIDER one — while an ordinary hyphenated fixture (an email
 * address then) measured exactly 390 and exactly 320 on the same page. The full sweep is in
 * `progress/impl_analysis.md`.
 *
 * The guard is set at that measured 51 rather than at the 61 actually used, so a future
 * reader who shortens the label to tidy it turns this test red instead of quietly restoring
 * the blind spot; the extra ten characters are margin against a machine whose font is a
 * shade narrower.
 */
const UNBREAKABLE_LABEL = "analysisaccessunbreakableemaillocalpartthatmustwrapatac20xxxx";

/** Both parameters, on every URL, because the page writes both on every link (AC-16). */
function analysisUrl(periodKey: string, breakdown = "type"): string {
  return `/analysis?period=${periodKey}&breakdown=${breakdown}`;
}

/* ------------------------------------------------------------------ AC-1, the route */

test("AC-1: a signed-out GET is a 307 to sign-in carrying the path, and sends no content", async ({
  page,
}) => {
  const response = await page.request.get("/analysis", { maxRedirects: 0 });

  expect([302, 307]).toContain(response.status());
  const location = response.headers()["location"] ?? "";
  expect(location).toContain("/sign-in");
  expect(location).toContain("callbackUrl=%2Fanalysis");

  // None of the page's own content travelled with the refusal, and no euro did either.
  const body = await response.text();
  expect(body).not.toContain("period-heading");
  expect(body).not.toContain("trend-chart");
  expect(body).not.toContain(CURRENCY_SYMBOL);
});

test("AC-1, AC-2: a YARD_STAFF GET is refused by the service and sends no part of the body", async ({
  page,
}) => {
  await signIn(page, await newUser("YARD_STAFF"));

  // On the RAW response, not on the rendered DOM: the point is that nothing was SENT.
  const response = await page.request.get("/analysis", { maxRedirects: 0 });

  expect(response.status()).toBe(307);
  expect(response.headers()["location"] ?? "").toContain("/stock-entry?denied=analysis");

  // No part of the page body travelled with the refusal, and no euro did either.
  const body = await response.text();
  expect(body).not.toContain("period-heading");
  expect(body).not.toContain("trend-chart");
  expect(body).not.toContain("total-stock");
  expect(body).not.toContain(CURRENCY_SYMBOL);

  await page.goto("/analysis");
  expect(page.url()).toContain("/stock-entry?denied=analysis");
  await expect(page.getByTestId("access-denied")).toHaveText(
    ACCESS_DENIED_MESSAGE,
  );
});

test("AC-1: an ADMIN gets 200, the heading, the identity header and the period heading", async ({
  page,
}) => {
  const admin = await newUser();
  await signIn(page, admin);

  const response = await page.goto(analysisUrl(COMPLETE));
  expect(response?.status()).toBe(200);

  // #3's heading, VERBATIM: `tests/e2e/role-access.spec.ts` asserts this exact string and
  // must pass unmodified.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Analysis");
  await expect(page.getByTestId("signed-in-name")).toHaveText(admin.name);
  await expect(page.getByTestId("sign-out")).toBeVisible();

  const heading = page.getByTestId("period-heading");
  await expect(heading).toHaveText(`December ${Y}`);
  expect(await heading.evaluate((element) => element.tagName)).toBe("H2");
});

/* ------------------------------------------------------- AC-18, the role is the session's */

test("AC-18: a query parameter, a header and a cookie cannot change the role", async ({
  browser,
  baseURL,
}) => {
  const host = new URL(baseURL ?? "http://localhost:3000").hostname;
  const vectors = ["/analysis", `/analysis?period=${COMPLETE}`, "/analysis?breakdown=supplier"];

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, await newUser("YARD_STAFF"));
  await staffContext.addCookies([{ name: "role", value: "ADMIN", domain: host, path: "/" }]);

  for (const path of vectors) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await staffPage.request.get(`${path}${separator}role=ADMIN`, {
      headers: { "x-user-role": "ADMIN" },
      maxRedirects: 0,
    });

    expect(response.status(), path).toBe(307);
    expect(response.headers()["location"] ?? "", path).toContain("/stock-entry?denied=analysis");

    const refused = await response.text();
    expect(refused, path).not.toContain("period-heading");
    expect(refused, path).not.toContain(CURRENCY_SYMBOL);
  }
  await staffContext.close();

  // And the same three vectors carrying the STAFF role change nothing for an
  // administrator: the RENDERED BODY is byte-identical to the request without them.
  //
  // THE COMPARISON IS `<main>`, NOT THE WHOLE DOCUMENT, and the reason is the framework's
  // rather than this page's: Next echoes the request URL into its own RSC flight payload,
  // inside a `<script>` that is a sibling of `<main>`, so two responses to two different
  // URLs can never be byte-identical documents no matter what the page renders. Comparing
  // `<main>` is the criterion's claim exactly - what was RENDERED - and it is strictly
  // stronger than comparing a normalised document, because nothing is normalised away.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, await newUser());

  const renderedBody = async (url: string): Promise<string> => {
    const response = await adminPage.goto(url);
    expect(response?.status(), url).toBe(200);
    await adminPage.waitForLoadState("networkidle");
    return adminPage.evaluate(() => document.querySelector("main")?.outerHTML ?? "");
  };

  const adminPaths = [analysisUrl(COMPLETE), analysisUrl(COMPLETE, "supplier")];

  // THE PLAIN READS CARRY NONE OF THE THREE VECTORS (review observation O2). The cookie is
  // added only after both are taken, so it sits on ONE side of the comparison: a cookie
  // that changed the render would make the two sides differ rather than hiding in both.
  expect((await adminContext.cookies()).map((cookie) => cookie.name)).not.toContain("role");
  const plain = new Map<string, string>();
  for (const path of adminPaths) {
    const body = await renderedBody(path);
    expect(body, path).toContain("period-heading");
    plain.set(path, body);
  }

  // All three vectors at once on the second read: the query parameter, the header and
  // the cookie.
  await adminContext.addCookies([
    { name: "role", value: "YARD_STAFF", domain: host, path: "/" },
  ]);
  await adminPage.setExtraHTTPHeaders({ "x-user-role": "YARD_STAFF" });
  expect((await adminContext.cookies()).map((cookie) => cookie.name)).toContain("role");

  for (const path of adminPaths) {
    expect(await renderedBody(`${path}&role=YARD_STAFF`), path).toBe(plain.get(path));
  }
  await adminContext.close();
});

/* ---------------------------------------------- AC-19, the euro lives on two surfaces */

test("AC-19: /analysis carries the euro and the five money-free routes still do not", async ({
  page,
}) => {
  await signIn(page, await newUser());

  const analysis = await page.request.get(analysisUrl(COMPLETE));
  expect(analysis.status()).toBe(200);
  expect(await analysis.text()).toContain(CURRENCY_SYMBOL);

  // 009 AC-21, 009 AC-22 and 010 AC-12, re-asserted against the REAL analysis page rather
  // than the placeholder: the only two euro-bearing routes in the tree are `/analysis` and
  // `/stock-entry/counts/[id]/summary`.
  for (const path of [
    "/stock-entry",
    `/stock-entry/counts/${draftId}`,
    `/stock-entry/counts/${draftId}/submit`,
    "/stock-takes",
    `/stock-takes/counts/${dublinCompleteId}`,
  ]) {
    const response = await page.request.get(path);
    expect(response.status(), path).toBe(200);
    expect(await response.text(), `${path} carries a euro`).not.toContain(CURRENCY_SYMBOL);
  }
});

/* ------------------------------------------------- AC-21, nothing a URL can carry throws */

test("AC-21: six unreadable parameters redirect, and no database string reaches the screen", async ({
  page,
}) => {
  await signIn(page, await newUser());

  const provoked = [
    "?period=banana",
    `?period=${Y}-13`,
    "?period=",
    `?period=${COMPLETE}&period=${INCOMPLETE}`,
    "?breakdown=banana",
    "?breakdown=type&breakdown=supplier",
  ];

  for (const query of provoked) {
    const refusal = await page.request.get(`/analysis${query}`, { maxRedirects: 0 });
    expect(refusal.status(), query).toBe(307);
    expect(refusal.headers()["location"] ?? "", query).toContain("/analysis");

    // Followed: it is the page's own content and never a 500 or an error screen.
    const followed = await page.request.get(`/analysis${query}`);
    expect(followed.status(), query).toBe(200);

    const body = await followed.text();
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

  // A period far outside any data is the never-counted state for THAT period, not an error.
  const ancient = await page.request.get("/analysis?period=1999-01");
  expect(ancient.status()).toBe(200);
  expect(await ancient.text()).toContain("January 1999");
});

test("AC-4: reading this screen writes nothing", async ({ page }) => {
  const before = await reservedCountTotals(YEAR);

  await signIn(page, await newUser());
  for (const url of [
    analysisUrl(COMPLETE),
    analysisUrl(COMPLETE, "supplier"),
    analysisUrl(INCOMPLETE),
    "/analysis?period=1999-01",
  ]) {
    await page.goto(url);
  }

  expect(await reservedCountTotals(YEAR)).toEqual(before);
});

/* -------------------------------------------------- AC-22, the bundle is never needed */

test("AC-22: with JavaScript disabled the screen renders and every control navigates", async ({
  browser,
}) => {
  const signedIn = await browser.newContext();
  const helper = await signedIn.newPage();
  await signIn(helper, await newUser());
  const session = await signedIn.storageState();
  await signedIn.close();

  const context = await browser.newContext({ javaScriptEnabled: false, storageState: session });
  const page = await context.newPage();

  await page.goto(analysisUrl(COMPLETE));

  // The grid, the chart and the breakdown all arrive with the document.
  await expect(page.getByTestId("period-grid")).toBeVisible();
  await expect(page.getByTestId("trend-chart")).toBeVisible();
  await expect(page.getByTestId("breakdown")).toBeVisible();

  // BOTH breakdown links (review observation O7): away from the default, and back to it.
  await page.getByTestId("breakdown-link").filter({ hasText: BREAKDOWN_LABEL.supplier }).click();
  await page.waitForLoadState("load");
  expect(new URL(page.url()).searchParams.get("breakdown")).toBe("supplier");
  expect(new URL(page.url()).searchParams.get("period")).toBe(COMPLETE);

  await page.getByTestId("breakdown-link").filter({ hasText: BREAKDOWN_LABEL.type }).click();
  await page.waitForLoadState("load");
  expect(new URL(page.url()).searchParams.get("breakdown")).toBe("type");
  expect(new URL(page.url()).searchParams.get("period")).toBe(COMPLETE);

  // BOTH period jumps, which are the controls that skip the months nobody counted. The
  // second lands back on this file's own December, because nothing any sibling owns lies
  // between this file's November and December.
  await page.getByTestId("previous-period").click();
  await page.waitForLoadState("load");
  await expect(page.getByTestId("period-heading")).toHaveText(`November ${Y}`);
  expect(new URL(page.url()).searchParams.get("period")).toBe(INCOMPLETE);

  await page.getByTestId("next-period").click();
  await page.waitForLoadState("load");
  await expect(page.getByTestId("period-heading")).toHaveText(`December ${Y}`);
  expect(new URL(page.url()).searchParams.get("period")).toBe(COMPLETE);

  // And a link into a count.
  await page.goto(analysisUrl(COMPLETE));
  await page.getByTestId("yard-count-link").first().click();
  await page.waitForLoadState("load");
  expect(new URL(page.url()).pathname).toContain("/stock-takes/counts/");

  await context.close();
});

/* --------------------------------------------------------------- AC-6, the empty state */

test("AC-6: with an approved count in the database the page is never in the empty state", async ({
  page,
}) => {
  await signIn(page, await newUser());

  // THE EMPTY STATE IS UNREACHABLE HERE, AND THIS TEST NO LONGER PRETENDS OTHERWISE. "No
  // approved count anywhere" is a fact about the WHOLE database, and this suite shares one:
  // siblings approve counts in their own reserved years, and this file's `beforeAll`
  // approves three of its own before any test runs. This test used to branch on the
  // database being empty; that branch could never execute, so it asserted nothing while
  // reading as the criterion (review finding B1). It was DELETED rather than kept as a
  // guarded no-op, because a branch that can never run is a claim, not a test.
  //
  // WHERE THE EMPTY STATE IS PROVED NOW (011 AC-6 and AC-16, amended 2026-09-24): the page
  // half by `src/app/analysis/page.test.ts`, which renders this page on the server with its
  // services mocked, needs no database, runs in every gate, and was watched going red with
  // a `€0.00` planted in the empty branch; the shape half (`anyApprovedCountEver` false on
  // a truncated database) by `src/server/reporting/analysis-service.db.test.ts`.
  //
  // WHAT IS LEFT HERE IS THE HALF THAT IS REACHABLE, asserted unconditionally: with the
  // approved counts this file itself created, the default view is the grid, not the empty
  // state. The tally is a PRECONDITION, not a branch.
  expect(await approvedCountTally()).toBeGreaterThanOrEqual(3);

  const body = await (await page.request.get("/analysis")).text();
  expect(body).not.toContain("no-approved-counts");
  expect(body).toContain("period-grid");
});

/* ------------------------------------------------------------------ AC-20, the phone */

test("AC-20: the screen never scrolls sideways at 390 px or 320 px, in any state", async ({
  browser,
}) => {
  // The guard, so a future edit that shortens or hyphenates the label fails HERE, saying
  // what it broke, instead of leaving every measurement below silently unpressured. 51 is
  // the break-even MEASURED ON THIS PAGE at 390 px, which is the wider and therefore the
  // harder of the two viewports - see the constant's comment for the arithmetic.
  expect(
    UNBREAKABLE_LABEL,
    "AC-20 needs one unbreakable run long enough to overflow 390 px - see the constant",
  ).toMatch(/^[a-z0-9]{51,}$/);

  const signedIn = await browser.newContext();
  const helper = await signedIn.newPage();
  await signIn(helper, await newUser("ADMIN", UNBREAKABLE_LABEL));
  const session = await signedIn.storageState();
  await signedIn.close();

  const states = [
    analysisUrl(COMPLETE),
    analysisUrl(COMPLETE, "supplier"),
    analysisUrl(INCOMPLETE),
    // A period NOBODY counted: every yard `Not counted`, no total, thirteen gaps. It is a
    // real state of this screen and it is measured as itself - it is NOT the empty state.
    // The empty state (nothing approved in the whole database) cannot be reached in the
    // shared e2e database and is recorded as unmeasured in the browser (AC-20, amended
    // 2026-09-24); its markup is asserted by `src/app/analysis/page.test.ts`.
    "/analysis?period=1999-01",
    "/analysis",
  ];

  for (const width of [390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      storageState: session,
    });
    const page = await context.newPage();

    for (const url of states) {
      await page.goto(url);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, `${String(width)} ${url}`).toBeLessThanOrEqual(
        overflow.clientWidth,
      );
    }

    // THE GRID STACKS ON THE PHONE: every yard cell shares a left edge with the total.
    await page.goto(analysisUrl(COMPLETE));
    const total = await page.getByTestId("total-stock").boundingBox();
    const cells = page.locator("[data-testid^='yard-cell-']");
    for (let index = 0; index < (await cells.count()); index += 1) {
      const cell = await cells.nth(index).boundingBox();
      expect(
        Math.abs((cell?.x ?? 0) - (total?.x ?? 0)),
        `${String(width)} cell ${String(index)} is not stacked`,
      ).toBeLessThanOrEqual(4);
    }

    // The chart fits, entirely, at both widths.
    const chart = await page.getByTestId("trend-chart").boundingBox();
    expect(chart?.x ?? -1, String(width)).toBeGreaterThanOrEqual(0);
    expect((chart?.x ?? 0) + (chart?.width ?? 0), String(width)).toBeLessThanOrEqual(width);

    // Every control the flow touches, except the links inside a sentence.
    for (const testId of ["previous-period", "next-period", "yard-count-link"]) {
      const box = await page.getByTestId(testId).first().boundingBox();
      expect(box?.width ?? 0, `${String(width)} ${testId}`).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, `${String(width)} ${testId}`).toBeGreaterThanOrEqual(44);
    }

    const links = page.getByTestId("breakdown-link");
    for (let index = 0; index < 2; index += 1) {
      const box = await links.nth(index).boundingBox();
      expect(box?.width ?? 0, `${String(width)} breakdown ${String(index)}`).toBeGreaterThanOrEqual(
        44,
      );
      expect(
        box?.height ?? 0,
        `${String(width)} breakdown ${String(index)}`,
      ).toBeGreaterThanOrEqual(44);
    }

    await context.close();
  }
});

test("AC-20: and the grid is a ROW on the desktop, so the stacking above means something", async ({
  browser,
}) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await signIn(page, await newUser());

  await page.goto(analysisUrl(COMPLETE));

  const total = await page.getByTestId("total-stock").boundingBox();
  const cells = page.locator("[data-testid^='yard-cell-']");
  expect(await cells.count()).toBeGreaterThan(0);

  for (let index = 0; index < (await cells.count()); index += 1) {
    const cell = await cells.nth(index).boundingBox();
    expect(
      Math.abs((cell?.x ?? 0) - (total?.x ?? 0)),
      `desktop cell ${String(index)} is stacked and should be a column`,
    ).toBeGreaterThan(4);
  }

  await context.close();
});

test("AC-6: the incomplete period names the yard and never renders a euro for it", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(analysisUrl(INCOMPLETE));

  // Clonmel has no count at all in this period: named, not zeroed.
  const clonmel = page.getByTestId("yard-cell-CLONMEL");
  await expect(clonmel).toContainText(NOT_COUNTED);
  expect(await clonmel.textContent()).not.toContain(CURRENCY_SYMBOL);

  await expect(page.getByTestId("period-incomplete")).toContainText(
    `has no approved count for November ${Y}.`,
  );

  // The TOTAL has its own word, which is not the yard's (AC-6, amended 2026-09-24).
  const total = page.getByTestId("total-stock");
  expect(await total.textContent()).not.toContain(CURRENCY_SYMBOL);
  await expect(total).toContainText(INCOMPLETE_TOTAL);
  await expect(total).not.toContainText(NOT_COUNTED);

  // And the complete period beside it does render one, so the assertion above is about
  // the state rather than about the page never showing money at all.
  await page.goto(analysisUrl(COMPLETE));
  expect(await page.getByTestId("total-stock").textContent()).toContain(CURRENCY_SYMBOL);

  // BOTH YARDS MISSING IS THE OTHER SENTENCE - `Dublin and Clonmel have`, not `has`. The
  // names come from `Location.name` and the sentence from `analysis-messages.ts`, so this
  // asserts the join rather than two yard names a future rename would falsify.
  await page.goto("/analysis?period=1999-01");
  const yards = await activeYards();
  await expect(page.getByTestId("period-incomplete")).toHaveText(
    missingYardsMessage(
      yards.map((yard) => yard.name),
      "January 1999",
    ),
  );
  expect(yards.length, "the plural join needs at least two yards to be a join").toBeGreaterThan(
    1,
  );
});
