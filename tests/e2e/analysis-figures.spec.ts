import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  INCOMPLETE_TOTAL,
  MINUS_SIGN,
  NOTHING_HELD_IN_PERIOD,
  NOT_COUNTED,
  NO_SUPPLIER,
  formatFigure,
  formatVarianceAmount,
  unvaluedHeldLinesMessage,
} from "@/lib/analysis-messages";
import { CURRENCY_SYMBOL, compareDecimals, subtractDecimals, sumDecimals } from "@/lib/money";

import {
  activeYards,
  clearPriceSnapshots,
  pickSheetItems,
  seedCountHolding,
  supplierGroupsFor,
  unvaluedHeldLinesOf,
  typeGroupsFor,
  valuedLinesOf,
  yardValueOf,
} from "./support/analysis";
import type { FixtureItem } from "./support/analysis";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import { seededMasterCounts } from "./support/item-master";
import {
  RESERVED_YEAR,
  approveAs,
  clearReservedYear,
  realCountIds,
  submitAs,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 011's browser half for the FIGURES: the per-yard grid, the total, both variances,
 * the trend chart, the breakdown and the period navigation.
 *
 * THIS FILE OWNS TWO ADJACENT RESERVED YEARS, 2104 AND 2105 (011 AC-24), and it is the
 * first spec in this suite to own more than one. Year on year is `(y − 1, m)`: a fixture
 * for it needs an approved period in each of two consecutive years, and there is no free
 * adjacent pair at or below 2100. It deletes BOTH of its own in `beforeAll` and `afterAll`
 * — never the range, because three files run at once — and asserts through `realCountIds()`
 * that the set of counts a real user could own is identical before and after.
 *
 * IT OWNS THE TWO HIGHEST RESERVED YEARS, AND THAT IS WHAT MAKES THE DEFAULT ASSERTABLE.
 * With no `?period` the page opens on the latest period holding an approved count ANYWHERE
 * in the database. Every other spec in this suite reserves 2091–2103, and the only fixture
 * above that — `tests/e2e/support/item-master.ts`'s `periodYear: 2999` — is a DRAFT and so
 * holds no approved count at all. So "the latest approved period" is this file's, by
 * construction rather than by luck.
 *
 * NO EURO IS ASSERTED AS A LITERAL. The prices are the user's master; every expected
 * figure below is recomputed from the rows this file seeded and compared with what the
 * page rendered. 007's start spec recorded that choice and 008 and 010 repeated it.
 *
 * THE FIXTURE, AND WHAT EACH PERIOD IS FOR:
 *
 *   2104-09  both yards approved, LARGE quantities   the year-on-year comparand, and a FALL
 *   2105-03  both yards approved, every quantity 0   complete-and-empty renders €0.00
 *   2105-07  Dublin approved, Clonmel SUBMITTED      a status that is priced and not counted
 *   2105-08  both yards approved, SMALL quantities   the month-on-month comparand, and a RISE
 *   2105-09  both yards approved, and four unpriced  THE MAIN PERIOD
 *   2105-10  Dublin only                             later than 2105-09 AND incomplete
 *
 * 2105-02 is deliberately EMPTY, so that reading 2105-03 gives the third refusal — there
 * is no count at all for the month before — and 2105-10 is later than the latest COMPLETE
 * period, so the default cannot be "the latest period that adds up".
 */
const YEAR = RESERVED_YEAR.analysisFigures;
const PRIOR_YEAR = RESERVED_YEAR.analysisPrior;
const Y = String(YEAR);
const P = String(PRIOR_YEAR);

const MAIN = `${Y}-09`;
const MONTH_BEFORE = `${Y}-08`;
const YEAR_BEFORE = `${P}-09`;
const ALL_ZERO = `${Y}-03`;
const PART_SUBMITTED = `${Y}-07`;
const LATEST = `${Y}-10`;

const created: string[] = [];
let dublinItems: FixtureItem[] = [];
let clonmelItems: FixtureItem[] = [];
let dublinMainId = "";
let clonmelMainId = "";
let dublinPriorId = "";
let clonmelPriorId = "";
let dublinBeforeId = "";
let clonmelBeforeId = "";
let clonmelSubmittedId = "";
let realCountsBefore: string[] = [];
let masterBefore: Awaited<ReturnType<typeof seededMasterCounts>>;

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.beforeAll(async () => {
  if (!(await databaseIsReachable())) return;

  // Eleven counts, each submitted and approved through the real lifecycle service, against
  // a database in another region. The hook's own budget is raised; `playwright.config.ts`'s
  // `timeout`, `expect.timeout`, `workers`, `retries` and `fullyParallel` are untouched
  // (011 AC-24), and no TEST below gets a second longer than every other test in the suite.
  test.setTimeout(180_000);

  realCountsBefore = await realCountIds();
  masterBefore = await seededMasterCounts();

  await clearReservedYear(YEAR);
  await clearReservedYear(PRIOR_YEAR);

  const owner = await createTestUser("YARD_STAFF", "analysis-figures-owner");
  const approver = await createTestUser("ADMIN", "analysis-figures-approver");
  created.push(owner.username, approver.username);

  dublinItems = await pickSheetItems("DUBLIN", 6);
  clonmelItems = await pickSheetItems("CLONMEL", 4);

  const seed = async (
    locationCode: "DUBLIN" | "CLONMEL",
    year: number,
    month: number,
    lines: { itemId: string; quantity: string }[],
    lifecycle: "SUBMITTED" | "APPROVED",
  ): Promise<string> => {
    const countId = await seedCountHolding({
      locationCode,
      year,
      month,
      countDate: `${String(year)}-${String(month).padStart(2, "0")}-28`,
      owner,
      lines,
    });
    await submitAs(countId, owner);
    if (lifecycle === "APPROVED") await approveAs(countId, approver);
    return countId;
  };

  const at = (items: FixtureItem[], quantity: string): { itemId: string; quantity: string }[] =>
    items.map((item) => ({ itemId: item.itemId, quantity }));

  // The year-on-year comparand: the largest period in the window, so the main period is a
  // FALL against it and the chart has a bar to scale every other bar against.
  dublinPriorId = await seed("DUBLIN", PRIOR_YEAR, 9, at(dublinItems.slice(0, 5), "10"), "APPROVED");
  clonmelPriorId = await seed("CLONMEL", PRIOR_YEAR, 9, at(clonmelItems, "10"), "APPROVED");

  // Counted, and empty. A real state, and a different one from never counted.
  await seed("DUBLIN", YEAR, 3, at(dublinItems.slice(0, 5), "0"), "APPROVED");
  await seed("CLONMEL", YEAR, 3, at(clonmelItems, "0"), "APPROVED");

  // Priced but not a record: its snapshots exist and are deliberately not read.
  await seed("DUBLIN", YEAR, 7, at(dublinItems.slice(0, 5), "1"), "APPROVED");
  clonmelSubmittedId = await seed("CLONMEL", YEAR, 7, at(clonmelItems, "1"), "SUBMITTED");

  // The month-on-month comparand: smaller than the main period, so that one variance on
  // the screen is a rise and the other is a fall, and the two signs are both asserted.
  dublinBeforeId = await seed("DUBLIN", YEAR, 8, at(dublinItems.slice(0, 5), "2"), "APPROVED");
  clonmelBeforeId = await seed("CLONMEL", YEAR, 8, at(clonmelItems, "2"), "APPROVED");

  // THE MAIN PERIOD. Dublin's SIXTH line is counted as ZERO and unpriced, and it must be
  // counted in no warning anywhere: a line counted as none is not stock that failed to be
  // valued (AC-9). It contributes nothing to any figure either, which is why it can be
  // added to this period alone without disturbing the two comparisons below.
  dublinMainId = await seed(
    "DUBLIN",
    YEAR,
    9,
    [...at(dublinItems.slice(0, 5), "4"), { itemId: dublinItems[5].itemId, quantity: "0" }],
    "APPROVED",
  );
  clonmelMainId = await seed("CLONMEL", YEAR, 9, at(clonmelItems, "4"), "APPROVED");

  // Invariant 4, after approval and never before: `submitCount` is the only thing that may
  // write that column, and it writes whatever the master holds.
  //
  // THE SAME THREE ITEMS ARE UNPRICED IN ALL THREE COMPARED PERIODS, and that is what
  // makes the two variances deterministic against a master whose prices this suite may
  // not know. Each yard's priced set is then identical in 2104-09, 2105-08 and 2105-09, so
  // the three totals are 10k, 2k and 4k for the same k — a RISE month on month and a FALL
  // year on year, whatever k turns out to be. The test asserts k is above zero rather than
  // assuming it.
  for (const countId of [dublinMainId, dublinPriorId, dublinBeforeId]) {
    await clearPriceSnapshots(countId, [
      dublinItems[0].itemId,
      dublinItems[1].itemId,
      dublinItems[2].itemId,
    ]);
  }
  await clearPriceSnapshots(dublinMainId, [dublinItems[5].itemId]);
  for (const countId of [clonmelMainId, clonmelPriorId, clonmelBeforeId]) {
    await clearPriceSnapshots(countId, [clonmelItems[0].itemId]);
  }

  // Later than the latest COMPLETE period, and incomplete: the default must land here.
  await seed("DUBLIN", YEAR, 10, at(dublinItems.slice(0, 5), "3"), "APPROVED");
});

test.afterAll(async () => {
  if (!(await databaseIsReachable())) return;

  await clearReservedYear(YEAR);
  await clearReservedYear(PRIOR_YEAR);
  for (const username of created.splice(0)) {
    await removeUser(username);
  }

  // 007 AC-30: this file reached nothing outside its own two years.
  expect(await realCountIds()).toEqual(realCountsBefore);
  expect(await seededMasterCounts()).toEqual(masterBefore);
});

async function newUser(label = "analysis-figures"): Promise<TestUser> {
  const user = await createTestUser("ADMIN", label);
  created.push(user.username);
  return user;
}

function analysisUrl(periodKey: string, breakdown = "type"): string {
  return `/analysis?period=${periodKey}&breakdown=${breakdown}`;
}

/** What the fixture says a yard is worth, recomputed from its own rows. */
async function expectedYardValue(countId: string): Promise<string> {
  return yardValueOf(await valuedLinesOf(countId));
}

/** `(data-period, data-amount)` for every element matching a selector, in document order. */
async function tuplesOf(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(
    (css) =>
      Array.from(document.querySelectorAll(css)).map((element) =>
        [element.getAttribute("data-period") ?? "", element.getAttribute("data-amount") ?? ""].join(
          "|",
        ),
      ),
    selector,
  );
}

/* --------------------------------------------------------- AC-7, the figures themselves */

test("AC-7: every rendered figure is the sum of the rows this file seeded", async ({ page }) => {
  await signIn(page, await newUser());
  await page.goto(analysisUrl(MAIN));

  const dublin = await expectedYardValue(dublinMainId);
  const clonmel = await expectedYardValue(clonmelMainId);

  await expect(page.getByTestId("yard-cell-DUBLIN")).toContainText(formatFigure(dublin));
  await expect(page.getByTestId("yard-cell-CLONMEL")).toContainText(formatFigure(clonmel));

  // THE TOTAL IS THE SUM OF THE EXACT YARDS, ROUNDED ONCE — never the sum of the rounded
  // ones. The two can differ by a cent, and the first is the correct figure (Invariant 10).
  await expect(page.getByTestId("total-stock")).toContainText(
    formatFigure(sumDecimals([dublin, clonmel])),
  );
});

/* ------------------------------------------- AC-9, Invariant 4 beside the figure it shortens */

test("AC-9: the unvalued-line sentence, both numbers of it, and the route to the names", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(analysisUrl(MAIN));

  // THREE HELD LINES, NOT FOUR. Dublin's fourth unpriced line is counted as ZERO, and a
  // line counted as none is not stock that failed to be valued - so the sentence says 3
  // while the count really holds 4 lines with no price. Both numbers are DERIVED from the
  // rows this file seeded rather than typed, so the assertion is about the rule and not
  // about how many unpriced items the master happens to hold.
  const dublinLines = await valuedLinesOf(dublinMainId);
  const heldWithoutPrice = unvaluedHeldLinesOf(dublinLines);
  const allWithoutPrice = dublinLines.filter((line) => line.snapshot === null).length;

  expect(heldWithoutPrice).toBe(3);
  expect(allWithoutPrice).toBe(4);

  const dublin = page.getByTestId("yard-cell-DUBLIN").getByTestId("unvalued-lines");
  await expect(dublin).toHaveText(unvaluedHeldLinesMessage(heldWithoutPrice));

  // And the singular, on the same page: one yard reads `has`, the other reads `have`.
  await expect(page.getByTestId("yard-cell-CLONMEL").getByTestId("unvalued-lines")).toHaveText(
    unvaluedHeldLinesMessage(unvaluedHeldLinesOf(await valuedLinesOf(clonmelMainId))),
  );
  expect(unvaluedHeldLinesOf(await valuedLinesOf(clonmelMainId))).toBe(1);

  // The sentence is a LINK to #9's summary, which lists the items by name.
  const href = await dublin.locator("a").getAttribute("href");
  const url = new URL(href ?? "", "http://localhost");
  expect(url.pathname).toBe(`/stock-entry/counts/${dublinMainId}/summary`);
  expect(url.searchParams.get("period")).toBe(MAIN);
  expect(url.searchParams.get("breakdown")).toBe("type");

  // With none, the element is absent entirely rather than rendered empty. The period where
  // every quantity is ZERO is the one that proves it whatever the master holds: no line is
  // held there, so no line can be a held line without a price.
  await page.goto(analysisUrl(ALL_ZERO));
  await expect(page.getByTestId("unvalued-lines")).toHaveCount(0);
});

/* ------------------------------------------------ AC-5, only an APPROVED count is a euro */

test("AC-5: a SUBMITTED yard is named and linked, and is worth nothing anywhere", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(analysisUrl(PART_SUBMITTED));

  const clonmel = page.getByTestId("yard-cell-CLONMEL");
  await expect(clonmel).toContainText("Submitted");

  // No euro inside the cell, and in particular not €0.00.
  expect(await clonmel.textContent()).not.toContain(CURRENCY_SYMBOL);

  const href = await clonmel.getByTestId("yard-count-link").getAttribute("href");
  expect(new URL(href ?? "", "http://localhost").pathname).toBe(
    `/stock-takes/counts/${clonmelSubmittedId}`,
  );

  // Its snapshots exist. They are deliberately not read, so the period does not add up -
  // and the total says so in its own word, not the yard's (AC-6, amended 2026-09-24).
  expect(await page.getByTestId("total-stock").textContent()).not.toContain(CURRENCY_SYMBOL);
  await expect(page.getByTestId("total-stock")).toContainText(INCOMPLETE_TOTAL);
  await expect(page.getByTestId("period-incomplete")).toContainText(`July ${Y}.`);
});

/* ----------------------------------------- AC-6, counted-and-empty is not never-counted */

test("AC-6: a complete period holding nothing renders €0.00, and a gap renders neither", async ({
  page,
}) => {
  await signIn(page, await newUser());

  await page.goto(analysisUrl(ALL_ZERO));
  await expect(page.getByTestId("total-stock")).toContainText(formatFigure("0"));
  await expect(page.getByTestId("period-incomplete")).toHaveCount(0);

  // Nothing was held, so there is no group to break down - and the page says THAT rather
  // than rendering an empty table (AC-15).
  await expect(page.getByTestId("breakdown-empty")).toHaveText(NOTHING_HELD_IN_PERIOD);
  await expect(page.getByTestId("breakdown")).toHaveCount(0);

  // And the yard that was never counted, one period later in the same fixture.
  await page.goto(analysisUrl(LATEST));
  await expect(page.getByTestId("yard-cell-CLONMEL")).toContainText(NOT_COUNTED);
  expect(await page.getByTestId("total-stock").textContent()).not.toContain(CURRENCY_SYMBOL);
  await expect(page.getByTestId("total-stock")).toContainText(INCOMPLETE_TOTAL);
  await expect(page.getByTestId("total-stock")).not.toContainText(NOT_COUNTED);
  await expect(page.getByTestId("period-incomplete")).toContainText(
    `has no approved count for October ${Y}.`,
  );

  // The trend prints this period's total as well, so it gets the total's word, in the table
  // cell and in the gap marker's title alike - never the yard's (AC-6, amended 2026-09-24).
  const trendRow = page.locator(`[data-testid='trend-row'][data-period='${LATEST}']`);
  await expect(trendRow.locator("td")).toHaveText(INCOMPLETE_TOTAL);
  await expect(trendRow).not.toContainText(NOT_COUNTED);
  await expect(
    page.locator(`[data-testid='trend-gap'][data-period='${LATEST}'] title`),
  ).toHaveText(`October ${Y}: ${INCOMPLETE_TOTAL}`);
});

/* ------------------------------------------------- AC-11 and AC-12, the two variances */

test("AC-11, AC-12: month on month rises, year on year falls, and both are joined on the period", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(analysisUrl(MAIN));

  const mom = page.getByTestId("mom-variance");
  const yoy = page.getByTestId("yoy-variance");

  // MONTH ON MONTH IS `(y, m − 1)` AND YEAR ON YEAR IS `(y − 1, m)`, joined on the period
  // and never on "the column to the left": `Summary!C9` subtracts the column eleven months
  // back and compares October 2025 with November 2024.
  await expect(mom).toHaveAttribute("data-against-period", MONTH_BEFORE);
  await expect(yoy).toHaveAttribute("data-against-period", YEAR_BEFORE);
  await expect(mom).toHaveAttribute("data-state", "COMPARABLE");
  await expect(yoy).toHaveAttribute("data-state", "COMPARABLE");

  // THE FIXTURE'S OWN CLAIM, ASSERTED RATHER THAN ASSUMED. The three compared periods hold
  // the same priced items with the same three cleared, at quantities 10, 2 and 4, so their
  // totals are 10k, 2k and 4k for one k this suite never sees. If the master ever made
  // k zero, the two sign assertions below would be vacuous - so k is checked first, and a
  // vacuous pass becomes a failure that says why.
  const main = sumDecimals([
    await expectedYardValue(dublinMainId),
    await expectedYardValue(clonmelMainId),
  ]);
  const before = sumDecimals([
    await expectedYardValue(dublinBeforeId),
    await expectedYardValue(clonmelBeforeId),
  ]);
  const prior = sumDecimals([
    await expectedYardValue(dublinPriorId),
    await expectedYardValue(clonmelPriorId),
  ]);
  expect(compareDecimals(main, before), "the fixture must make this a rise").toBe(1);
  expect(compareDecimals(main, prior), "the fixture must make this a fall").toBe(-1);

  // A rise carries no sign; a fall carries a TRUE MINUS (U+2212), which is the sign of one
  // figure rather than a dash between two. Both are on this one page.
  const momText = (await mom.textContent()) ?? "";
  const yoyText = (await yoy.textContent()) ?? "";
  expect(momText.startsWith(MINUS_SIGN)).toBe(false);
  expect(yoyText.startsWith(MINUS_SIGN)).toBe(true);

  // And each is exactly the difference of the two totals this file seeded.
  expect(momText).toBe(formatVarianceAmount(subtractDecimals(main, before)));
  expect(yoyText).toBe(formatVarianceAmount(subtractDecimals(main, prior)));
  expect(momText).toContain(CURRENCY_SYMBOL);
  expect(yoyText).toContain(CURRENCY_SYMBOL);
});

test("AC-11: the three refusals name the reason and never reach further back", async ({
  page,
}) => {
  await signIn(page, await newUser());

  // The comparand is INCOMPLETE: it says so, names July, and does NOT fall back to the
  // complete period before it. Comparing August with March is the workbook's defect.
  await page.goto(analysisUrl(MONTH_BEFORE));
  await expect(page.getByTestId("mom-variance")).toHaveText(
    `Not comparable — July ${Y} is incomplete.`,
  );
  await expect(page.getByTestId("mom-variance")).toHaveAttribute(
    "data-against-period",
    PART_SUBMITTED,
  );

  // There is no count at all for the month before: a THIRD sentence, not the second one.
  await page.goto(analysisUrl(ALL_ZERO));
  await expect(page.getByTestId("mom-variance")).toHaveText(
    `Not comparable — there is no count for February ${Y}.`,
  );

  // The SELECTED period is the incomplete one, which is a different fact again.
  await page.goto(analysisUrl(LATEST));
  await expect(page.getByTestId("mom-variance")).toHaveText(
    "Not comparable — this period is incomplete.",
  );
  await expect(page.getByTestId("yoy-variance")).toHaveText(
    "Not comparable — this period is incomplete.",
  );
});

/* --------------------------------------------------------------------- AC-14, the chart */

test("AC-14: the chart is thirteen assertable slots and cannot disagree with its table", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(analysisUrl(MAIN));

  const chart = page.getByTestId("trend-chart");
  await expect(chart).toHaveAttribute("viewBox", "0 0 520 180");
  await expect(chart).toHaveAttribute("role", "img");
  await expect(chart.locator("title").first()).toHaveText("Total stock by period");

  // No fixed pixel width: the viewBox scales to the column it is given.
  expect(await chart.getAttribute("width")).toBeNull();

  const bars = await page.getByTestId("trend-bar").count();
  const gaps = await page.getByTestId("trend-gap").count();
  expect(bars + gaps).toBe(13);
  expect(bars).toBeGreaterThan(0);
  expect(gaps).toBeGreaterThan(0);

  // THE PICTURE AND THE FIGURES ARE THE SAME NUMBERS, in the same order. A gap carries no
  // `data-amount` on either side, because a gap has no amount.
  const drawn = await tuplesOf(page, "[data-testid='trend-bar'],[data-testid='trend-gap']");
  const printed = await tuplesOf(page, "[data-testid='trend-row']");
  expect(drawn).toEqual(printed);
  expect(drawn).toHaveLength(13);

  // The leftmost point of the window IS the year-on-year comparand - that is why the
  // window is thirteen and not twelve (AC-13).
  expect(drawn[0].split("|")[0]).toBe(YEAR_BEFORE);
  expect(drawn[12].split("|")[0]).toBe(MAIN);

  // A COMPLETE PERIOD HOLDING NOTHING IS DRAWN, and a period nobody finished is not. The
  // all-zero period is inside this window: it gets a BAR carrying `data-amount="0"` - at
  // the minimum height, because a zero-height bar reads as €0 - while the months with no
  // count at all get a gap marker and no amount. That distinction is the whole of the
  // spec's second section and this is where it is visible.
  await expect(
    page.locator(`[data-testid='trend-bar'][data-period='${ALL_ZERO}']`),
  ).toHaveAttribute("data-amount", "0");
  await expect(page.locator(`[data-testid='trend-gap'][data-period='${ALL_ZERO}']`)).toHaveCount(
    0,
  );
  const gapPeriods = await page
    .getByTestId("trend-gap")
    .evaluateAll((slots) => slots.map((slot) => slot.getAttribute("data-period") ?? ""));
  expect(gapPeriods, "the months nobody counted are gaps").toContain(`${Y}-04`);
  for (const slot of await page.getByTestId("trend-gap").all()) {
    expect(await slot.getAttribute("data-amount"), "a gap has no amount").toBeNull();
  }

  // And the bar for the selected period carries the EXACT decimal the service produced,
  // unrounded, not the rounded string the cell beside it prints.
  const exact = sumDecimals([
    await expectedYardValue(dublinMainId),
    await expectedYardValue(clonmelMainId),
  ]);
  await expect(page.getByTestId("trend-bar").last()).toHaveAttribute("data-amount", exact);
});

/* ---------------------------------------------------------------- AC-15, the breakdown */

test("AC-15: the breakdown groups by type and by supplier, in the order the master gives", async ({
  page,
}) => {
  await signIn(page, await newUser());

  // The items that are HELD in the main period: Dublin's fifth line is counted as zero, so
  // its group appears only if another held line shares it.
  const heldIds = [...dublinItems.slice(0, 5), ...clonmelItems].map((item) => item.itemId);

  await page.goto(analysisUrl(MAIN));
  const byType = await page
    .getByTestId("breakdown-row")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-group") ?? ""));
  expect(byType).toEqual((await typeGroupsFor(heldIds)).map((group) => group.code));

  // One amount cell per active yard, in `Location.sortOrder`, and a total cell beside it.
  const yards = await activeYards();
  const cells = page.getByTestId("breakdown-row").first().getByTestId("breakdown-cell");
  expect(await cells.count()).toBe(yards.length);
  for (const [index, yard] of yards.entries()) {
    await expect(cells.nth(index)).toHaveAttribute("data-location-code", yard.code);
  }

  await page.goto(analysisUrl(MAIN, "supplier"));
  const bySupplier = await page
    .getByTestId("breakdown-row")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-group") ?? ""));
  const expectedSuppliers = await supplierGroupsFor(heldIds);
  expect(bySupplier).toEqual(expectedSuppliers.map((group) => group.key));

  // `No supplier` is LAST when the master has one, and it is the real case:
  // `Dublin!A45` `School Logo Triangle` has no supplier at all.
  if (expectedSuppliers.some((group) => group.key === "")) {
    await expect(page.getByTestId("breakdown-row").last()).toContainText(NO_SUPPLIER);
  }

  // The current grouping is marked, exactly one of the two is, and the other carries the
  // attribute NOT AT ALL - `aria-current="false"` is a value, and an assertion that counted
  // elements carrying it would count both.
  const current = page.locator("[data-testid='breakdown-link'][aria-current='true']");
  await expect(current).toHaveCount(1);
  await expect(current).toHaveAttribute("data-breakdown", "supplier");
});

test("AC-15: an incomplete period keeps the per-yard figures and loses the row total", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(analysisUrl(LATEST));

  const row = page.getByTestId("breakdown-row").first();

  // Dublin was approved, so its cell is a figure; the total cannot exist, so it is not one.
  expect(await row.getByTestId("breakdown-cell").first().textContent()).toContain(
    CURRENCY_SYMBOL,
  );
  expect(await row.getByTestId("breakdown-total").textContent()).not.toContain(CURRENCY_SYMBOL);

  // EVERY row's total reads `Incomplete` - a total is not a yard (AC-6, amended
  // 2026-09-24) - while the yard nobody counted keeps `Not counted` in its own column.
  const rowTotals = await page.getByTestId("breakdown-total").allTextContents();
  expect(rowTotals.length).toBeGreaterThan(0);
  expect(new Set(rowTotals.map((text) => text.trim()))).toEqual(new Set([INCOMPLETE_TOTAL]));
  expect(
    (await row.locator("[data-testid='breakdown-cell'][data-location-code='CLONMEL']").textContent())?.trim(),
  ).toBe(NOT_COUNTED);
});

/* ------------------------------------------------- AC-16, the default and the navigation */

test("AC-16: with no query it opens on the latest APPROVED period, not the latest complete one", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto("/analysis");

  // 2105-10 is later than 2105-09 and does NOT add up. A default that skipped to the
  // latest complete period would hide the yard that has not counted, which is the thing an
  // administrator most needs to see.
  await expect(page.getByTestId("period-heading")).toHaveText(`October ${Y}`);
  await expect(page.getByTestId("period-incomplete")).toBeVisible();
});

test("AC-16: the jumps skip the months nobody counted, and the end of the line is disabled", async ({
  page,
}) => {
  await signIn(page, await newUser());

  // From the latest approved period there is nowhere later to go: the control still
  // renders, under the same test id and the same label, as a non-anchor.
  await page.goto(analysisUrl(LATEST));
  const next = page.getByTestId("next-period");
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(next).toHaveText("Next period");
  expect(await next.evaluate((element) => element.tagName)).toBe("SPAN");

  // Backwards skips 2105-04, -05 and -06, which nobody counted.
  await page.getByTestId("previous-period").click();
  await page.waitForLoadState("load");
  await expect(page.getByTestId("period-heading")).toHaveText(`September ${Y}`);

  await page.goto(analysisUrl(PART_SUBMITTED));
  await page.getByTestId("previous-period").click();
  await page.waitForLoadState("load");
  await expect(page.getByTestId("period-heading")).toHaveText(`March ${Y}`);
});

test("AC-16: EVERY link on the screen carries the current period and grouping", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(analysisUrl(MAIN, "supplier"));

  // ONE RULE, COVERING EVERY LINK: the two breakdown links, both period jumps, every link
  // into a count and the sentence that leads to the item names. `analysisHref` writes both
  // parameters whenever it is given them - including the default grouping - precisely so
  // that this can be asserted as one rule rather than as a list of exceptions.
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]")).map((anchor) =>
      anchor.getAttribute("href"),
    ),
  );

  expect(hrefs.length).toBeGreaterThan(4);
  for (const href of hrefs) {
    const url = new URL(href ?? "", "http://localhost");
    // BOTH PARAMETERS, ON EVERY LINK, WITHOUT EXCEPTION. What each carries differs by what
    // the link is FOR - a period jump carries its target period, a breakdown link carries
    // its target grouping - but neither may ever be missing, which is the rule that keeps
    // a reading state from being dropped by one link out of nine.
    expect(url.searchParams.has("period"), href ?? "").toBe(true);
    expect(["type", "supplier"], href ?? "").toContain(url.searchParams.get("breakdown"));
  }

  // The links that are not a period jump carry the CURRENT period: the two breakdown
  // links, every link into a count, and the sentence that leads to the item names.
  const jumps = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid='previous-period'],[data-testid='next-period']")).map(
      (element) => element.getAttribute("href") ?? "",
    ),
  );
  for (const href of hrefs) {
    if (jumps.includes(href ?? "")) continue;
    expect(new URL(href ?? "", "http://localhost").searchParams.get("period"), href ?? "").toBe(
      MAIN,
    );
  }

  // And the two jumps really do point somewhere else, so the exclusion above is not a
  // loophole that would swallow a link that had simply lost its period.
  expect(jumps).toHaveLength(2);
  for (const href of jumps) {
    expect(new URL(href, "http://localhost").searchParams.get("period"), href).not.toBe(MAIN);
    expect(new URL(href, "http://localhost").searchParams.get("breakdown"), href).toBe(
      "supplier",
    );
  }

  // And the two of them that are the grouping really do differ from each other.
  const breakdowns = await page
    .getByTestId("breakdown-link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("data-breakdown") ?? ""));
  expect(breakdowns).toEqual(["type", "supplier"]);
});

/* ------------------------------------------------------- the variance figure, exactly */

test("AC-11: the rendered variance is exactly the difference of the two totals", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(analysisUrl(MAIN));

  const main = sumDecimals([
    await expectedYardValue(dublinMainId),
    await expectedYardValue(clonmelMainId),
  ]);

  // The comparand's EXACT total, read off the table row that carries it - so the variance
  // is checked against the same unrounded string the service produced rather than against
  // a figure this test rounded for itself.
  const august = await page
    .locator(`[data-testid='trend-row'][data-period='${MONTH_BEFORE}']`)
    .getAttribute("data-amount");

  expect(august).not.toBeNull();
  await expect(page.getByTestId("mom-variance")).toHaveText(
    formatVarianceAmount(subtractDecimals(main, august ?? "0")),
  );
});
