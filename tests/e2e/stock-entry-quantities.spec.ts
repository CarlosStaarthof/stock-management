import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  ALL_CHANGES_SAVED,
  COUNT_HAS_NO_ITEMS,
  COUNT_NO_LONGER_EXISTS,
  COUNT_READ_ONLY,
  NONE_HELD,
  NOT_COUNTED,
  SAVE_NOW,
  SAVING,
  QUANTITY_INVALID,
  countedSummary,
} from "@/lib/count-messages";

import { seededMasterCounts } from "./support/item-master";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  RESERVED_YEAR,
  anyUnitPriceText,
  clearReservedYear,
  markPastDraft,
  quantitiesByItem,
  quantityOf,
  realCountIds,
  seedCount,
  seedCountWithLines,
  snapshotsOf,
  uncountedLinesOf,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 008's rows: the inputs, the null/zero distinction, *None held*, the progress line,
 * the read-only count, the no-JavaScript path and the phone.
 *
 * WHY THE COUNTS ARE SEEDED RATHER THAN STARTED THROUGH THE UI. #7 already proves starting
 * one works; this file is about what happens to the 82 lines afterwards, so each test gets
 * its own month inside this file's reserved year and the fixture builds the lines directly
 * (007 AC-30).
 *
 * WHY NO ASSERTION SAYS 82. The Dublin sheet is the USER'S master, and a number hard-coded
 * here would be asserting about their data rather than about this feature. Every count is
 * instead asserted against the number of lines the database really holds for it, and that
 * number is asserted to be at least 82 — the same choice `stock-entry-start.spec.ts` made
 * and recorded in #7.
 *
 * This file owns reserved year 2095 and deletes only that year.
 */
const YEAR = RESERVED_YEAR.quantities;

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

  // AC-30: this file reached outside its reservation nowhere at all.
  expect(await realCountIds()).toEqual(realCountsBefore);
  expect(await seededMasterCounts()).toEqual(masterBefore);
});

async function newUser(role: "YARD_STAFF" | "ADMIN" = "YARD_STAFF"): Promise<TestUser> {
  const user = await createTestUser(role, `stock-entry-quantities-${role.toLowerCase()}`);
  created.push(user.email);
  return user;
}

/** One Dublin count of its own per test, so no two tests share a row. */
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

/** The queue is empty and the header says so. */
async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId("save-status")).toHaveText(ALL_CHANGES_SAVED, {
    timeout: 20_000,
  });
}

test("AC-2, AC-3, AC-35: both roles get one editable row per line, and nothing paginates them", async ({
  page,
  browser,
}) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 1);
  expect(lineCount).toBeGreaterThanOrEqual(82);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}`);

  // Every line of the count is on the page: Part 5 gives count entry ALL items assigned to
  // the yard, and any control that silently drops a row drops an UNCOUNTED row.
  await expect(page.getByTestId("count-line")).toHaveCount(lineCount);
  await expect(page.getByTestId("quantity-input")).toHaveCount(lineCount);
  await expect(page.getByTestId("count-quantity")).toHaveCount(lineCount);

  // AC-35: 007 AC-24's "no input on this page" clause is superseded — exactly one input per
  // rendered row, every one of them `inputmode="decimal"`, and no select and no textarea.
  const fields = page.getByTestId("count-lines").locator("input, select, textarea");
  await expect(fields).toHaveCount(lineCount);
  await expect(page.getByTestId("count-lines").locator("select")).toHaveCount(0);
  await expect(page.getByTestId("count-lines").locator("textarea")).toHaveCount(0);
  const modes = await fields.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("inputmode")),
  );
  expect(new Set(modes)).toEqual(new Set(["decimal"]));

  // No pagination, no show-more, no held-only toggle, no virtualised container.
  await expect(
    page.getByRole("button", { name: /show more|load more|next page|held only/i }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /show more|load more|next page/i })).toHaveCount(0);

  // The same markup for an ADMIN, plus #7's items-without-price sentence and nothing else.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, await newUser("ADMIN"));
  await adminPage.goto(`/stock-entry/counts/${countId}`);

  await expect(adminPage.getByTestId("count-line")).toHaveCount(lineCount);
  await expect(adminPage.getByTestId("quantity-input")).toHaveCount(lineCount);
  await adminContext.close();
});

test("AC-4: null and 0 differ in text and in an attribute, never in colour alone", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 2);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}`);

  const rows = page.getByTestId("count-line");
  const uncounted = rows.first();
  const other = rows.nth(1);

  await expect(uncounted).toHaveAttribute("data-counted", "false");
  await expect(uncounted.getByTestId("not-counted")).toHaveText(NOT_COUNTED);
  await expect(uncounted.getByTestId("quantity-input")).toHaveValue("");

  // Somebody looked, none is held.
  await other.getByTestId("none-held").click();
  await settled(page);
  await page.reload();

  const zeroed = page.getByTestId("count-line").nth(1);
  await expect(zeroed).toHaveAttribute("data-counted", "true");
  await expect(zeroed.getByTestId("not-counted")).toHaveCount(0);
  // A `0` is never rendered as blank: the `0` is the fact.
  await expect(zeroed.getByTestId("quantity-input")).toHaveValue("0");

  // The distinction survives CSS being switched off entirely, because it is carried by
  // textContent and by an attribute rather than by two greys a counter in bright sunlight
  // cannot tell apart.
  const stillUncounted = page.getByTestId("count-line").first();
  const uncountedText = await stillUncounted.evaluate((row) => row.textContent ?? "");
  const zeroedText = await zeroed.evaluate((row) => row.textContent ?? "");

  expect(uncountedText).toContain(NOT_COUNTED);
  expect(zeroedText).not.toContain(NOT_COUNTED);
  expect(uncountedText).not.toEqual(zeroedText);
});

test("AC-5, AC-24: a blank input is never saved as 0, and a 0 is never saved as blank", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 3);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}`);
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(0, lineCount));

  const rows = page.getByTestId("count-line");
  const zeroRow = rows.first();
  const valueRow = rows.nth(1);
  const zeroItem = (await zeroRow.getAttribute("data-item-id")) as string;
  const valueItem = (await valueRow.getAttribute("data-item-id")) as string;

  const nullsBefore = await uncountedLinesOf(countId);

  // Typing `0` into an uncounted row and blurring stores the number zero.
  await zeroRow.getByTestId("quantity-input").fill("0");
  await zeroRow.getByTestId("quantity-input").blur();
  await settled(page);

  expect(await quantityOf(countId, zeroItem)).toBe("0");
  expect(await quantityOf(countId, zeroItem)).not.toBeNull();
  await expect(zeroRow).toHaveAttribute("data-counted", "true");
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(1, lineCount));
  // Visible to the database itself, not merely to TypeScript.
  expect(await uncountedLinesOf(countId)).toBe(nullsBefore - 1);

  // A real number, then cleared: back to null, and NOT to zero.
  await valueRow.getByTestId("quantity-input").fill("12.5");
  await valueRow.getByTestId("quantity-input").blur();
  await settled(page);
  expect(await quantityOf(countId, valueItem)).toBe("12.5");
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(2, lineCount));

  await valueRow.getByTestId("quantity-input").fill("");
  await valueRow.getByTestId("quantity-input").blur();
  await settled(page);

  expect(await quantityOf(countId, valueItem)).toBeNull();
  await expect(valueRow).toHaveAttribute("data-counted", "false");
  await expect(valueRow.getByTestId("not-counted")).toHaveText(NOT_COUNTED);
  // The progress line DECREMENTS: clearing a row is how a count is undone.
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(1, lineCount));
  expect(await uncountedLinesOf(countId)).toBe(nullsBefore - 1);

  // Focusing an empty input and blurring it without typing sends nothing at all.
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  const untouched = rows.nth(2).getByTestId("quantity-input");
  await untouched.focus();
  await untouched.blur();
  await page.waitForTimeout(1_500);
  expect(posts).toEqual([]);

  // AC-31: every line this feature writes still has no price snapshot (Invariant 2).
  expect(new Set(await snapshotsOf(countId))).toEqual(new Set([null]));

  // On reload the sentence is rendered by the SERVER, from the database.
  await page.reload();
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(1, lineCount));
});

test("AC-6: None held is one tap, saves 0 with no debounce, and is silent on a row already at 0", async ({
  browser,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 4);

  // The viewport AC-30 names, because the tap target is measured on it.
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page, staff);

  // The recorder carries the MOMENT of each save, not merely the fact of one: this test has
  // to tell "sent now" from "sent in 800 ms", and a count taken after the queue has settled
  // cannot — both spellings end at exactly one POST. Same shape as `recordPosts` in
  // `stock-entry-autosave.spec.ts`.
  const posts: { at: number; url: string }[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/api/counts/")) {
      posts.push({ at: Date.now(), url: request.url() });
    }
  });

  await page.goto(`/stock-entry/counts/${countId}`);
  const row = page.getByTestId("count-line").first();
  const itemId = (await row.getAttribute("data-item-id")) as string;
  const control = row.getByTestId("none-held");

  // Its accessible name is `None held`, and its tap target is at least 44 x 44 CSS px.
  await expect(control).toHaveAccessibleName(NONE_HELD);
  const box = await control.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

  const tappedAt = Date.now();
  await control.click();
  await expect(row).toHaveAttribute("data-counted", "true");
  await expect(row.getByTestId("quantity-input")).toHaveValue("0");
  await settled(page);

  // ONE post — and it LEFT well inside the 800 ms a typed character would have waited out:
  // a tap is a decision, not a keystroke somebody is still making. The bound is asserted
  // from the recorded timestamp rather than from when the count is taken, so settling above
  // cannot hide a debounced save the way a bare `toHaveLength(1)` here does. Rebuild
  // `CountSheet.tsx`'s `noneHeld()` as `edit(itemId, "0", false)` and this is the line that
  // goes red, at ~800 ms against a 400 ms bound.
  expect(posts).toHaveLength(1);
  expect(posts[0].at - tappedAt).toBeLessThan(400);
  expect(await quantityOf(countId, itemId)).toBe("0");

  // Tapping it again on a row that already reads 0 sends nothing.
  await control.click();
  await page.waitForTimeout(1_500);
  expect(posts).toHaveLength(1);
  await expect(page.getByTestId("save-status")).toHaveText(ALL_CHANGES_SAVED);

  await context.close();
});

test("AC-24: the progress line moves as a number is typed, before the save is confirmed", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 5);

  await signIn(page, staff);
  // Two seconds in flight, so "before the save is confirmed" is a real window.
  await page.route("**/api/counts/*/lines", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue();
  });
  await page.goto(`/stock-entry/counts/${countId}`);

  const row = page.getByTestId("count-line").first();
  await row.getByTestId("quantity-input").fill("7");
  await row.getByTestId("quantity-input").blur();

  // The counterweight is the unsaved banner: the page never claims a number is STORED,
  // only that it has been entered.
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(1, lineCount));
  await expect(page.getByTestId("save-status")).toHaveText(SAVING);

  await settled(page);
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(1, lineCount));
});

test("AC-9, AC-25: a count that is no longer a DRAFT is read-only, in the domain's words", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 6);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}`);
  await page.getByTestId("count-line").first().getByTestId("none-held").click();
  await settled(page);

  await markPastDraft(countId);
  await page.reload();

  await expect(page.getByTestId("count-read-only")).toHaveText(COUNT_READ_ONLY);
  // The quantities as TEXT, and no way to type one.
  await expect(page.getByTestId("count-lines").locator("input, select, textarea")).toHaveCount(0);
  await expect(page.getByTestId("none-held")).toHaveCount(0);
  await expect(page.getByTestId("save-now")).toHaveCount(0);
  await expect(page.getByTestId("count-quantity").first()).toHaveText("0");

  // The endpoint refuses it too, with the same sentence and a 409.
  const refused = await page.request.post(`/api/counts/${countId}/lines`, {
    data: { edits: [{ itemId: "whatever", quantity: "1" }] },
  });
  expect(refused.status()).toBe(409);
  expect(((await refused.json()) as { error: string }).error).toBe(COUNT_READ_ONLY);
});

test("AC-25: a countId that does not exist, and a count with no lines", async ({ page }) => {
  const staff = await newUser();
  await signIn(page, staff);

  await page.goto("/stock-entry/counts/doesnotexist");
  await expect(page.getByTestId("count-missing")).toHaveText(COUNT_NO_LONGER_EXISTS);
  await expect(page.getByTestId("back-to-calendar")).toBeVisible();

  // 007 AC-13 refuses a yard with an empty sheet before anything is written, so this is a
  // state only a bug reaches — and it renders a sentence rather than an empty table.
  const emptyId = await seedCount({
    locationCode: "CLONMEL",
    year: YEAR,
    month: 7,
    countDate: `${String(YEAR)}-07-10`,
    createdById: staff.id,
  });

  await page.goto(`/stock-entry/counts/${emptyId}`);
  await expect(page.getByTestId("count-empty")).toHaveText(COUNT_HAS_NO_ITEMS);
  await expect(page.getByTestId("count-lines")).toHaveCount(0);
});

test("AC-16: it still works with JavaScript disabled, and Save now is a real submit", async ({
  browser,
}) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 8);

  // Signed in WITH JavaScript, then the session carried into a context that has none — the
  // sign-in form is #3's and is not what this criterion is about.
  const signedIn = await browser.newContext();
  const helper = await signedIn.newPage();
  await signIn(helper, staff);
  const session = await signedIn.storageState();
  await signedIn.close();

  const context = await browser.newContext({ javaScriptEnabled: false, storageState: session });
  const page = await context.newPage();
  await page.goto(`/stock-entry/counts/${countId}`);

  // All the inputs, with their current values, in the FIRST response.
  await expect(page.getByTestId("quantity-input")).toHaveCount(lineCount);
  await expect(page.getByTestId("save-now")).toHaveAccessibleName(SAVE_NOW);
  // A real form whose action is a Server Action. React renders that as `method="POST"`
  // back to this page's own URL plus a hidden `$ACTION_ID_…` field naming the function —
  // which is exactly what makes the submit work with no bundle at all.
  //
  // Reading them from the LIVE DOM is sound HERE ONLY because this context runs no script:
  // nothing hydrates, so the DOM is the server's HTML. With JavaScript on, a hydration
  // mismatch re-renders the form on the client without them (see `hiddenFieldsAsServed` in
  // `stock-entry-approve.spec.ts`).
  const form = page.locator("form", { has: page.getByTestId("save-now") });
  await expect(form).toHaveAttribute("method", /post/i);
  expect(await form.getAttribute("action")).toBe("");
  const hidden = await form
    .locator('input[type="hidden"]')
    .evaluateAll((elements) => elements.map((element) => element.getAttribute("name") ?? ""));
  expect(hidden.filter((name) => name.startsWith("$ACTION")).length).toBeGreaterThan(0);
  // The only thing this feature puts in the form itself, and it is not an identity.
  expect(hidden).toContain("countId");

  const rows = page.getByTestId("count-line");
  const firstItem = (await rows.first().getAttribute("data-item-id")) as string;
  const secondItem = (await rows.nth(1).getAttribute("data-item-id")) as string;

  await rows.first().getByTestId("quantity-input").fill("3");
  await rows.nth(1).getByTestId("quantity-input").fill("0");
  await page.getByTestId("save-now").click();
  await page.waitForLoadState("load");

  // Persisted, re-rendered with the new values, and the progress line updated.
  expect(await quantityOf(countId, firstItem)).toBe("3");
  expect(await quantityOf(countId, secondItem)).toBe("0");
  await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(2, lineCount));
  await expect(page.getByTestId("count-line").first().getByTestId("quantity-input")).toHaveValue(
    "3",
  );
  await expect(page.getByTestId("save-error")).toHaveCount(0);

  // An invalid value: the AC-7 message beside the row it names, and NOTHING persisted.
  const before = await quantitiesByItem(countId);
  await page.getByTestId("count-line").nth(2).getByTestId("quantity-input").fill("21.61285");
  await page.getByTestId("save-now").click();
  await page.waitForLoadState("load");

  const named = page.getByTestId("count-line").nth(2).getByTestId("row-error");
  await expect(named).toHaveText(QUANTITY_INVALID);
  expect(await quantitiesByItem(countId)).toEqual(before);

  await context.close();
});

test("AC-11, AC-16: with JavaScript, Save now flushes the queue and never posts to the page", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 9);

  await signIn(page, staff);

  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(new URL(request.url()).pathname);
  });

  await page.goto(`/stock-entry/counts/${countId}`);
  const url = page.url();

  const row = page.getByTestId("count-line").first();
  const itemId = (await row.getAttribute("data-item-id")) as string;
  await row.getByTestId("quantity-input").fill("4.25");
  await page.getByTestId("save-now").click();
  await settled(page);

  expect(await quantityOf(countId, itemId)).toBe("4.25");
  // No full-page navigation, and no POST to the page URL at any point.
  expect(page.url()).toBe(url);
  expect(posts).toEqual([`/api/counts/${countId}/lines`]);
});

test("AC-34: two devices, one count — the last write wins and says so", async ({ browser }) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 10);

  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await signIn(pageA, staff);
  await signIn(pageB, staff);

  // B's page is loaded FIRST, so it is looking at the count before A touches it.
  await pageB.goto(`/stock-entry/counts/${countId}`);
  await pageA.goto(`/stock-entry/counts/${countId}`);

  const rowA = pageA.getByTestId("count-line").first();
  const itemId = (await rowA.getAttribute("data-item-id")) as string;
  await rowA.getByTestId("quantity-input").fill("10");
  await rowA.getByTestId("quantity-input").blur();
  await settled(pageA);
  expect(await quantityOf(countId, itemId)).toBe("10");

  const rowB = pageB.getByTestId("count-line").first();
  expect(await rowB.getAttribute("data-item-id")).toBe(itemId);
  await rowB.getByTestId("quantity-input").fill("20");
  await rowB.getByTestId("quantity-input").blur();
  await settled(pageB);

  // No refusal, no version token: a lost edit is recoverable by typing it again, and a
  // lock held by a phone that walked out of signal is not.
  expect(await quantityOf(countId, itemId)).toBe("20");
  await expect(rowB.getByTestId("quantity-input")).toHaveValue("20");
  await expect(rowA.getByTestId("quantity-input")).toHaveValue("10");

  await pageA.reload();
  await expect(pageA.getByTestId("count-line").first().getByTestId("quantity-input")).toHaveValue(
    "20",
  );

  // The same two sessions on DIFFERENT lines interfere with each other not at all.
  const secondA = pageA.getByTestId("count-line").nth(1);
  const secondItem = (await secondA.getAttribute("data-item-id")) as string;
  await secondA.getByTestId("quantity-input").fill("5");
  await secondA.getByTestId("quantity-input").blur();
  await settled(pageA);

  expect(await quantityOf(countId, itemId)).toBe("20");
  expect(await quantityOf(countId, secondItem)).toBe("5");
  await expect(pageA.getByTestId("counted-summary")).toContainText("2 of ");

  await contextA.close();
  await contextB.close();
});

/**
 * The response with the bytes NEXT.JS generated taken out of it, leaving the markup the
 * application itself produced.
 *
 * WHY THIS EXISTS (010's ninth post-approval amendment, which records the failure). AC-17
 * used to compare the price, a plain numeric string from the database, against the whole
 * HTML with `toContain`. After the e2e debris was cleared from the development database
 * the price the fixture happened to pick became three digits, and it matched inside the
 * random 32-character hex of a `$ACTION_KEY` field. Nothing leaked - the euro sign, the
 * column name and the *no price* sentence all passed - but a guarantee that fails on a
 * coincidence is a guarantee that will one day be SILENCED on a coincidence, and that is
 * the cost this pays back.
 *
 * WHAT IS REMOVED AND WHY EACH IS SAFE TO REMOVE:
 *
 * - `script` and `style`. The flight payload holds webpack chunk and module ids, which are
 *   bare numbers - `[890,` and `"890"` are both shapes it emits. Prices in that payload
 *   are still caught, by name rather than by value: the euro sign, the column name and the
 *   money-key walk over the serialised props all read the WHOLE response, unfiltered.
 * - The server-action fields. Their value is a hash of the function's module, not data.
 * - `/_next/…` URLs. A chunk file is named after its id, so the same digits ride in there.
 * - `class` and `id`. A styling token and a React `useId` are, in the amendment's own
 *   words, exactly what a bare number must not be confused with.
 *
 * `data-*` attributes and form values are deliberately NOT removed: "not hidden - not
 * sent" means a price in an attribute nobody renders is still a leak.
 */
function applicationMarkup(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<input\b[^>]*\$ACTION[^>]*>/gi, " ")
    .replace(/\/_next\/[^"'\s>]*/gi, " ")
    .replace(/\s(?:class|id)="[^"]*"/gi, " ");
}

/**
 * Every place `price` appears as a NUMBER OF ITS OWN, with the sixty characters either
 * side of it so a failure says where.
 *
 * A price is a token: something that is not a digit, a letter or a decimal point stands on
 * each side of it. `890` inside `…f36a890835f…` is part of a longer run and is not a
 * sighting; `>890<`, `="890"` and ` 890 ` are. The boundary is what tells a price from a
 * hash - and it is not the whole answer on its own, which is why the caller searches the
 * application's own markup rather than the raw response.
 */
function priceSightings(text: string, price: string): string[] {
  const escaped = price.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const standalone = new RegExp(`(?<![0-9A-Za-z.])${escaped}(?![0-9A-Za-z.])`, "g");

  return [...text.matchAll(standalone)].map((match) => {
    const at = match.index ?? 0;
    return text.slice(Math.max(0, at - 60), at + price.length + 60);
  });
}

test("AC-17: a YARD_STAFF session can obtain no price from this screen, and an ADMIN no total", async ({
  page,
  browser,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 11);
  const aRealPrice = await anyUnitPriceText();

  await signIn(page, staff);
  const staffBody = await (await page.request.get(`/stock-entry/counts/${countId}`)).text();

  expect(staffBody).not.toContain("€");
  expect(staffBody).not.toContain("unitPrice");
  expect(staffBody).not.toContain("No price");

  if (aRealPrice !== null) {
    // A REAL PRICE, AS A NUMBER OF ITS OWN, IN THE MARKUP THIS APPLICATION WROTE.
    expect(priceSightings(applicationMarkup(staffBody), aRealPrice), "staff response").toEqual(
      [],
    );

    // THE SEARCH IS NOT VACUOUS, IN BOTH DIRECTIONS, ON THE BYTES THAT MADE IT FLAKY.
    // A price in a cell is found; the same three digits inside a server action's hash are
    // not - and neither is a hash sitting in ordinary text, so it is the BOUNDARY and not
    // only the removal that distinguishes them.
    expect(
      priceSightings(applicationMarkup(`<td data-testid="x">${aRealPrice}</td>`), aRealPrice),
    ).toHaveLength(1);
    expect(
      priceSightings(
        applicationMarkup(
          '<input type="hidden" name="$ACTION_KEY" value="k934edebf36a890835fd557e0f4833e0b"/>',
        ),
        "890",
      ),
    ).toEqual([]);
    expect(priceSightings("<p>k934edebf36a890835fd557e0f4833e0b</p>", "890")).toEqual([]);

    // AND THE FILTER DID NOT QUIETLY EMPTY THE DOCUMENT: the rows are still in what was
    // searched, and the field whose hash collided is really there to be excluded.
    expect(staffBody).toContain("$ACTION");
    expect(applicationMarkup(staffBody)).toContain("count-line");
  }

  await page.goto(`/stock-entry/counts/${countId}`);
  await expect(page.getByTestId("items-without-price")).toHaveCount(0);

  if (aRealPrice !== null) {
    // AND NOTHING A PERSON CAN READ. The text of the hydrated page, scripts and styles
    // removed, is what a yard hand actually has in front of them.
    const readable = await page.evaluate(() => {
      const copy = document.body.cloneNode(true);
      if (!(copy instanceof HTMLElement)) return "";
      for (const node of copy.querySelectorAll("script, style")) node.remove();
      return copy.textContent ?? "";
    });
    expect(priceSightings(readable, aRealPrice), "rendered text").toEqual([]);
  }

  // The ADMIN gets #7's sentence and otherwise the same markup — and still no euro.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, await newUser("ADMIN"));
  const adminBody = await (
    await adminPage.request.get(`/stock-entry/counts/${countId}`)
  ).text();

  expect(adminBody).not.toContain("€");
  expect(adminBody).not.toContain("unitPrice");
  expect(adminBody).not.toContain("No price");
  await adminContext.close();
});

test("AC-30: phone-first — 390 px and 320 px filtered and not, the keyboard's 380 px, and Tab from the 81st", async ({
  browser,
}) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 12);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}`);

  const overflow = async (): Promise<{ scroll: number; client: number }> =>
    page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));

  const unfiltered = await overflow();
  expect(unfiltered.scroll).toBeLessThanOrEqual(unfiltered.client);

  // WHY "with the filter panel open and closed" IS NOT A SECOND CASE HERE.
  // `src/components/stock-entry/EntryFilters.tsx` renders no collapse control — no
  // `<details>`, no toggle button — so the panel is always open and therefore always in its
  // widest state, which is the state every measurement in this test is taken against. There
  // is no closed state to measure; the clause is satisfied by construction, not skipped.

  // Every input: at least 64 x 44 CSS px, and entirely inside the viewport horizontally.
  const boxes = await page
    .getByTestId("quantity-input")
    .evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, height: box.height, left: box.left, right: box.right };
      }),
    );

  expect(boxes).toHaveLength(lineCount);
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(64);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(390);
  }

  // Every *None held* control and every filter option's tap target.
  for (const testId of ["none-held", "facet-option"]) {
    const taps = await page
      .getByTestId(testId)
      .evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      );

    expect(taps.length, testId).toBeGreaterThan(0);
    for (const tap of taps) {
      expect(tap.width, testId).toBeGreaterThanOrEqual(44);
      expect(tap.height, testId).toBeGreaterThanOrEqual(44);
    }
  }

  // The keypad the phone offers, and the reason it is not `type="number"`.
  const first = page.getByTestId("quantity-input").first();
  await expect(first).toHaveAttribute("inputmode", "decimal");
  await expect(first).toHaveAttribute("autocomplete", "off");
  await expect(first).toHaveAttribute("enterkeyhint", "next");
  await expect(first).toHaveAttribute("type", "text");

  // A scroll gesture over a focused input cannot change its value.
  await first.fill("5");
  await first.focus();
  await first.dispatchEvent("wheel", { deltaY: 240 });
  await first.dispatchEvent("wheel", { deltaY: -240 });
  expect(await first.inputValue()).toBe("5");

  // The status bar is sticky to the TOP: the keyboard occupies the bottom, and a bar there
  // would cover the row being typed into.
  const sticky = await page
    .getByTestId("entry-status")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { position: style.position, top: style.top, bottom: style.bottom };
    });
  expect(sticky.position).toBe("sticky");
  expect(sticky.top).toBe("0px");

  // The space a keyboard leaves: a focused row is still entirely on screen.
  await page.setViewportSize({ width: 390, height: 380 });
  const deep = page.getByTestId("quantity-input").nth(Math.min(30, lineCount - 1));
  await deep.focus();
  const focusedBox = await deep.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom };
  });
  expect(focusedBox.top).toBeGreaterThanOrEqual(0);
  expect(focusedBox.bottom).toBeLessThanOrEqual(380);

  // Reaching the last input needs only vertical scrolling — it is in the DOM on first
  // paint, and one Tab away from the one before it.
  const inputs = page.getByTestId("quantity-input");
  const lastName = await inputs.nth(lineCount - 1).getAttribute("name");
  await inputs.nth(lineCount - 2).focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement?.getAttribute("name") ?? null)).toBe(
    lastName,
  );

  // 320 px, and the document still does not scroll sideways.
  await page.setViewportSize({ width: 320, height: 740 });
  const narrow = await overflow();
  expect(narrow.scroll).toBeLessThanOrEqual(narrow.client);

  // AND WITH A FILTER APPLIED, at both widths. A filtered page is not the same page: it
  // grows two flex-wrapped sentences (*Showing…* and the hiding warning) and the
  // *Clear filters* link, which is precisely the state in which a 320 px screen is most
  // likely to overflow. Measuring only the unfiltered page leaves that untested.
  const supplierFacets = await page
    .getByTestId("facet-option")
    .filter({ has: page.locator('input[name="supplier"]') })
    .evaluateAll((elements) =>
      elements.map((element) => ({
        value: element.getAttribute("data-option") ?? "",
        count: Number(element.getAttribute("data-count") ?? "0"),
      })),
    );

  // A facet that really hides rows, so the warning sentence is on screen while we measure.
  const partialFacets = supplierFacets.filter(
    (facet) => facet.count > 0 && facet.count < lineCount,
  );
  expect(partialFacets.length, "a supplier facet that hides at least one line").toBeGreaterThan(
    0,
  );
  const chosen = partialFacets[0];

  await page
    .getByTestId("facet-option")
    .filter({ has: page.locator(`input[name="supplier"][value="${chosen.value}"]`) })
    .locator("input")
    .check();

  await expect(page.getByTestId("count-line")).toHaveCount(chosen.count);
  await expect(page.getByTestId("showing-summary")).toBeVisible();
  await expect(page.getByTestId("filter-hiding")).toBeVisible();
  await expect(page.getByTestId("clear-filters")).toBeVisible();

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 740 });
    const filtered = await overflow();
    expect(filtered.scroll, `filtered at ${String(width)} px`).toBeLessThanOrEqual(
      filtered.client,
    );
  }

  await context.close();
});
