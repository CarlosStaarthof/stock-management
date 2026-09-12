import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import {
  CLEAR_FILTERS,
  NO_MATCHING_LINES,
  NO_SUPPLIER,
  NO_UNIT,
  SUPPLIER_FILTER_LABEL,
  TYPE_FILTER_LABEL,
  UNIT_FILTER_LABEL,
  countedSummary,
  facetOptionLabel,
  filtersHiding,
  showingSummary,
} from "@/lib/count-messages";

import { seededMasterCounts } from "./support/item-master";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  RESERVED_YEAR,
  anyUnitPriceText,
  clearReservedYear,
  realCountIds,
  seedCountWithLines,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 008's three filter categories: how they are built, how they combine, where they
 * live, and the sentence that stops one of them hiding the fact that a count is not done.
 *
 * NOTHING HERE HARD-CODES A SUPPLIER NAME. The Dublin sheet is the user's master, so every
 * assertion is made against the facet's OWN count as the panel displays it — which is also
 * what AC-21 asks for, in so many words: the criterion cannot pass with a filter that
 * merely renders a different number.
 *
 * This file owns reserved year 2096 and deletes only that year.
 */
const YEAR = RESERVED_YEAR.filters;

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
  const user = await createTestUser(role, `stock-entry-filters-${role.toLowerCase()}`);
  created.push(user.email);
  return user;
}

async function freshCount(
  createdById: string,
  month: number,
): Promise<{ countId: string; lineCount: number }> {
  return seedCountWithLines({
    locationCode: "DUBLIN",
    year: YEAR,
    month,
    countDate: `${String(YEAR)}-${String(month).padStart(2, "0")}-10`,
    createdById,
  });
}

type Facet = { value: string; count: number };

/** Every option of one category, as the panel itself displays it. */
async function facetsOf(page: Page, category: string): Promise<Facet[]> {
  return page
    .getByTestId("facet-option")
    .filter({ has: page.locator(`input[name="${category}"]`) })
    .evaluateAll((elements) =>
      elements.map((element) => ({
        value: element.getAttribute("data-option") ?? "",
        count: Number(element.getAttribute("data-count") ?? "0"),
      })),
    );
}

function optionFor(page: Page, category: string, option: string): Locator {
  return page
    .getByTestId("facet-option")
    .filter({ has: page.locator(`input[name="${category}"][value="${option}"]`) });
}

test("AC-20: the three categories are built from the count's own lines", async ({ page }) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 1);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}`);

  const panel = page.getByTestId("entry-filters");
  await expect(panel).toBeVisible();

  // Exactly three groups, labelled Supplier, Type and Unit, in that order.
  for (const [category, label] of [
    ["supplier", SUPPLIER_FILTER_LABEL],
    ["type", TYPE_FILTER_LABEL],
    ["unit", UNIT_FILTER_LABEL],
  ] as const) {
    await expect(page.getByRole("group", { name: label })).toHaveCount(1);
    await expect(page.getByTestId(`facet-group-${category}`)).toBeVisible();
  }
  await expect(panel.locator("fieldset")).toHaveCount(3);

  for (const category of ["supplier", "type", "unit"] as const) {
    const facets = await facetsOf(page, category);
    expect(facets.length, category).toBeGreaterThan(0);

    // Sorted by value ascending, case-insensitive, with the sentinel option LAST — an item
    // with no supplier is an exception, and an exception belongs at the end of a list.
    const sentinel = category === "supplier" ? NO_SUPPLIER : category === "unit" ? NO_UNIT : null;
    const ordinary = facets.filter((facet) => facet.value !== sentinel);
    const sorted = [...ordinary].sort((left, right) =>
      left.value.toLocaleLowerCase().localeCompare(right.value.toLocaleLowerCase()),
    );
    expect(ordinary.map((facet) => facet.value), category).toEqual(
      sorted.map((facet) => facet.value),
    );
    if (sentinel !== null && facets.some((facet) => facet.value === sentinel)) {
      expect(facets[facets.length - 1].value, category).toBe(sentinel);
    }

    // `type` has no sentinel because `Item.itemTypeId` is required.
    if (category === "type") {
      expect(facets.map((facet) => facet.value)).not.toContain(NO_SUPPLIER);
      expect(facets.map((facet) => facet.value)).not.toContain(NO_UNIT);
    }

    // Each count is over the WHOLE count, so the three categories partition every line.
    expect(facets.reduce((sum, facet) => sum + facet.count, 0), category).toBe(lineCount);

    // An option's accessible name is its own value followed by its own count: `Kelly (14)`.
    const first = facets[0];
    await expect(optionFor(page, category, first.value).locator("input")).toHaveAccessibleName(
      facetOptionLabel(first.value, first.count),
    );
  }
});

test("AC-20, AC-21: OR within a category, AND across them, and the counts never renumber", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 2);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}`);

  const suppliers = await facetsOf(page, "supplier");
  expect(suppliers.length).toBeGreaterThanOrEqual(2);
  const [first, second] = suppliers;

  // One supplier: the list shrinks to exactly that supplier's OWN facet count, so the
  // criterion cannot pass with a filter that merely renders a different number.
  await optionFor(page, "supplier", first.value).locator("input").check();
  await expect(page.getByTestId("count-line")).toHaveCount(first.count);

  // A second supplier: OR within the category.
  await optionFor(page, "supplier", second.value).locator("input").check();
  await expect(page.getByTestId("count-line")).toHaveCount(first.count + second.count);

  // The facet counts have NOT moved: a count that moved would make options appear and
  // vanish under a thumb, and the panel jump while it is being tapped.
  expect(await facetsOf(page, "supplier")).toEqual(suppliers);

  // A type as well: AND across categories, so the list can only get shorter.
  const shownTypes = await page
    .getByTestId("count-line")
    .evaluateAll((elements) => elements.length);
  const types = await facetsOf(page, "type");
  await optionFor(page, "type", types[0].value).locator("input").check();
  const narrowed = await page.getByTestId("count-line").count();
  expect(narrowed).toBeLessThanOrEqual(shownTypes);

  // And the progress line is byte-identical throughout: a filter changes what you can see,
  // never what you have done.
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(0, lineCount));
});

test("AC-22: filters live in the URL, cost no round trip, and survive a reload", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 3);
  const path = `/stock-entry/counts/${countId}`;

  await signIn(page, staff);
  await page.goto(path);

  const suppliers = await facetsOf(page, "supplier");
  const [first, second] = suppliers;

  // Instrumented: toggling a checkbox makes no request to the server at all.
  const requests: string[] = [];
  page.on("request", (request) => {
    requests.push(new URL(request.url()).pathname);
  });

  await optionFor(page, "supplier", first.value).locator("input").check();
  await optionFor(page, "supplier", second.value).locator("input").check();
  await page.waitForTimeout(1_000);
  expect(requests.filter((pathname) => pathname.startsWith("/stock-entry"))).toEqual([]);

  // Repeated parameters, never a comma-joined list, so a value containing a comma is safe.
  const url = new URL(page.url());
  expect(url.pathname).toBe(path);
  expect(url.searchParams.getAll("supplier")).toEqual([first.value, second.value]);

  // `replaceState`, not `pushState`: one *back* leaves the screen.
  await page.goBack();
  expect(new URL(page.url()).pathname).not.toBe(path);
  await page.goForward();

  // Reloading that address renders the same filtered list FROM THE SERVER, with the same
  // checkboxes selected, because `parseFilterSelection` runs on the server render too.
  const filtered = `${path}?supplier=${encodeURIComponent(first.value)}&supplier=${encodeURIComponent(second.value)}`;
  await page.goto(filtered);
  await expect(page.getByTestId("count-line")).toHaveCount(first.count + second.count);
  await expect(optionFor(page, "supplier", first.value).locator("input")).toBeChecked();
  await expect(optionFor(page, "supplier", second.value).locator("input")).toBeChecked();

  // No query string can make this page throw (007 AC-21).
  for (const query of [
    "?supplier=NoSuchSupplier",
    "?supplier=NoSuchSupplier&supplier=NoSuchSupplier",
    "?supplier=",
    "?colour=red",
    "?type=&unit=&supplier=",
    "?supplier[]=Kelly",
    "?supplier=%E2%82%AC",
  ]) {
    const response = await page.request.get(`${path}${query}`);
    expect(response.status(), query).toBe(200);
  }

  // An unknown value is IGNORED rather than treated as a filter that matches nothing.
  await page.goto(`${path}?supplier=NoSuchSupplier`);
  await expect(page.getByTestId("showing-summary")).toHaveCount(0);
  await expect(page.getByTestId("no-matching-lines")).toHaveCount(0);
});

test("AC-22: with JavaScript disabled the panel is a GET form with an Apply filters submit", async ({
  browser,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 4);
  const path = `/stock-entry/counts/${countId}`;

  const signedIn = await browser.newContext();
  const helper = await signedIn.newPage();
  await signIn(helper, staff);
  const supplier = (await facetsOf(await openedAt(helper, path), "supplier"))[0];
  const session = await signedIn.storageState();
  await signedIn.close();

  const context = await browser.newContext({ javaScriptEnabled: false, storageState: session });
  const page = await context.newPage();
  await page.goto(path);

  const panel = page.getByTestId("entry-filters");
  await expect(panel).toHaveAttribute("method", /get/i);
  await expect(page.getByTestId("apply-filters")).toHaveCount(1);

  await optionFor(page, "supplier", supplier.value).locator("input").check();
  await page.getByTestId("apply-filters").click();
  await page.waitForLoadState("load");

  // The same URL the client would have produced, and the same filtered list.
  expect(new URL(page.url()).searchParams.getAll("supplier")).toEqual([supplier.value]);
  await expect(page.getByTestId("count-line")).toHaveCount(supplier.count);

  await context.close();
});

test("AC-23, AC-24, AC-25: a filter can never let a counter believe they have finished", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 5);
  const path = `/stock-entry/counts/${countId}`;

  await signIn(page, staff);
  await page.goto(path);

  // With no filter active NEITHER element is rendered — there is nothing to warn about.
  await expect(page.getByTestId("showing-summary")).toHaveCount(0);
  await expect(page.getByTestId("filter-hiding")).toHaveCount(0);
  await expect(page.getByTestId("clear-filters")).toHaveCount(0);

  const suppliers = await facetsOf(page, "supplier");
  const chosen = suppliers[0];
  await optionFor(page, "supplier", chosen.value).locator("input").check();

  const shown = chosen.count;
  const hiddenLines = lineCount - shown;
  await expect(page.getByTestId("count-line")).toHaveCount(shown);
  await expect(page.getByTestId("showing-summary")).toHaveText(showingSummary(shown, lineCount));
  // Hiding 70 rows is ordinary; hiding 31 UNCOUNTED ones is the thing that ends with a
  // count submitted half done.
  await expect(page.getByTestId("filter-hiding")).toHaveText(
    filtersHiding(hiddenLines, hiddenLines),
  );

  // The progress line is about the whole count and is byte-identical under the filter.
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(0, lineCount));

  // Counting a hidden row is impossible, but counting a VISIBLE one moves both numbers in
  // the right direction and leaves the hiding sentence about the rest.
  await page.getByTestId("count-line").first().getByTestId("none-held").click();
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(1, lineCount));
  await expect(page.getByTestId("filter-hiding")).toHaveText(
    filtersHiding(hiddenLines, hiddenLines),
  );

  // *Clear filters* returns to the unfiltered URL and the whole list.
  await expect(page.getByTestId("clear-filters")).toHaveAccessibleName(CLEAR_FILTERS);
  await page.getByTestId("clear-filters").click();
  await expect(page.getByTestId("count-line")).toHaveCount(lineCount);
  expect(page.url().endsWith(path)).toBe(true);
  await expect(page.getByTestId("filter-hiding")).toHaveCount(0);

  // A filter matching nothing is the moment the trap is most likely to spring: the empty
  // state, the hiding sentence AND *Clear filters*, all three.
  const types = await facetsOf(page, "type");
  const units = await facetsOf(page, "unit");
  let impossible: { type: string; unit: string } | null = null;
  for (const type of types) {
    for (const unit of units) {
      await page.goto(
        `${path}?type=${encodeURIComponent(type.value)}&unit=${encodeURIComponent(unit.value)}`,
      );
      if ((await page.getByTestId("count-line").count()) === 0) {
        impossible = { type: type.value, unit: unit.value };
        break;
      }
    }
    if (impossible !== null) break;
  }

  expect(impossible, "no type/unit pair on this sheet matches nothing").not.toBeNull();
  await expect(page.getByTestId("no-matching-lines")).toHaveText(NO_MATCHING_LINES);
  await expect(page.getByTestId("showing-summary")).toHaveText(showingSummary(0, lineCount));
  // Everything is hidden, and all but the one row counted above is uncounted — which is
  // exactly the sentence a counter needs at the moment the list looks finished.
  await expect(page.getByTestId("filter-hiding")).toHaveText(
    filtersHiding(lineCount, lineCount - 1),
  );
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(1, lineCount));
  await expect(page.getByTestId("clear-filters")).toBeVisible();
});

test("AC-17: with every filter applied and with none, a staff page still carries no price", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 6);
  const path = `/stock-entry/counts/${countId}`;
  const aRealPrice = await anyUnitPriceText();

  await signIn(page, staff);
  await page.goto(path);

  const everything = new URLSearchParams();
  for (const category of ["supplier", "type", "unit"] as const) {
    for (const facet of await facetsOf(page, category)) everything.append(category, facet.value);
  }

  for (const url of [path, `${path}?${everything.toString()}`]) {
    const response = await page.request.get(url);
    const body = await response.text();

    expect(response.status(), url).toBe(200);
    expect(body, `${url} carries a euro sign`).not.toContain("€");
    expect(body, `${url} names the price column`).not.toContain("unitPrice");
    expect(body, `${url} carries a per-row price tag`).not.toContain("No price");
    if (aRealPrice !== null) {
      expect(body, `${url} carries a real price`).not.toContain(aRealPrice);
    }
  }
});

/** Open a page at `path` and hand it back, so a facet can be read before the JS is gone. */
async function openedAt(page: Page, path: string): Promise<Page> {
  await page.goto(path);
  await page.getByTestId("entry-filters").waitFor();
  return page;
}
