import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  COUNT_HAS_NO_ITEMS,
  COUNT_NO_LONGER_EXISTS,
  REVIEW_AND_SIGN,
  SIGNATURE_NEEDS_JS,
  SIGNATURE_REQUIRED,
  SIGN_AND_SUBMIT,
  countedSummary,
  itemsWithoutPriceMessage,
  uncountedBlocksSubmit,
} from "@/lib/count-messages";
import { getCountForSubmit } from "@/server/counts/count-summary-service";

import { seededMasterCounts } from "./support/item-master";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  RESERVED_YEAR,
  actorFor,
  anyUnitPriceText,
  approveAs,
  clearReservedYear,
  fillQuantities,
  lifecycleOf,
  realCountIds,
  seedCount,
  seedCountWithLines,
  submitAs,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 009's review-and-sign screen: the three guards, Invariant 5's way out, the empty
 * pad, the no-JavaScript path and the money-free HTML.
 *
 * WHY THE COUNTS ARE SEEDED RATHER THAN STARTED THROUGH THE UI. #7 already proves starting
 * one works and #8 proves typing into it works; this file is about what happens when
 * somebody says they have finished. Each test gets its own month inside this file's
 * reserved year (007 AC-30).
 *
 * WHY NO ASSERTION SAYS 82. The Dublin sheet is the USER'S master, so every count is
 * asserted against the number of lines the database really holds for it.
 *
 * This file owns reserved year 2098 and deletes only that year.
 */
const YEAR = RESERVED_YEAR.submit;

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

  // AC-32: this file reached outside its reservation nowhere at all, and the seeded master
  // it counted is exactly as it found it.
  expect(await realCountIds()).toEqual(realCountsBefore);
  expect(await seededMasterCounts()).toEqual(masterBefore);
});

async function newUser(role: "YARD_STAFF" | "ADMIN" = "YARD_STAFF"): Promise<TestUser> {
  const user = await createTestUser(role, `stock-entry-submit-${role.toLowerCase()}`);
  created.push(user.email);
  return user;
}

/** One stroke across the pad with the mouse — the shortest real signature. */
async function draw(page: Page): Promise<void> {
  const pad = page.getByTestId("signature-pad");
  const box = await pad.boundingBox();
  if (box === null) throw new Error("the pad has no box to draw in");

  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 10, { steps: 12 });
  await page.mouse.move(box.x + box.width - 20, box.y + box.height - 10, { steps: 12 });
  await page.mouse.up();

  await expect(page.getByTestId("signature-field")).not.toHaveValue("");
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

test("AC-1: the three routes are closed to a signed-out request, and two of them to a staff session", async ({
  request,
  page,
  browser,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 1);

  const routes = {
    submit: `/stock-entry/counts/${countId}/submit`,
    summary: `/stock-entry/counts/${countId}/summary`,
    reopen: `/stock-entry/counts/${countId}/reopen`,
  };

  // Signed out: a 307 to /sign-in carrying the path, and NONE of the page's content.
  for (const url of Object.values(routes)) {
    const response = await request.get(url, { maxRedirects: 0 });

    expect([302, 307], `${url} status`).toContain(response.status());
    const location = response.headers()["location"] ?? "";
    expect(location, url).toContain("/sign-in");
    expect(location, url).toContain(`callbackUrl=${encodeURIComponent(url)}`);

    const body = await response.text();
    expect(body, url).not.toContain(REVIEW_AND_SIGN);
    expect(body, url).not.toContain("€");
  }

  // Signed in as YARD_STAFF: /submit is theirs, the other two are not — asserted on the
  // RAW RESPONSE, because a UI assertion passes while the body is still on the wire.
  await signIn(page, staff);

  const staffSubmit = await page.request.get(routes.submit, { maxRedirects: 0 });
  expect(staffSubmit.status()).toBe(200);

  for (const [route, denied] of [
    [routes.summary, "count-summary"],
    [routes.reopen, "count-reopen"],
  ] as const) {
    const refused = await page.request.get(route, { maxRedirects: 0 });

    expect([302, 307], route).toContain(refused.status());
    expect(refused.headers()["location"] ?? "", route).toBe(`/stock-entry?denied=${denied}`);

    const body = await refused.text();
    expect(body, route).not.toContain("€");
    expect(body, route).not.toContain("Approve this count");
    expect(body, route).not.toContain("Reopen this count");
  }

  // And the calendar says why, in #3's words.
  await page.goto("/stock-entry?denied=count-summary");
  await expect(page.getByTestId("access-denied")).toHaveText(
    "You do not have access to that page.",
  );

  // Signed in as ADMIN: all three are 200.
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, await newUser("ADMIN"));

  for (const url of Object.values(routes)) {
    const allowed = await adminPage.request.get(url, { maxRedirects: 0 });
    expect(allowed.status(), url).toBe(200);
  }
  await adminContext.close();
});

test("AC-4: the blocked list is the way out, and a filter cannot change it", async ({ page }) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 2);
  const { uncounted } = await fillQuantities(countId, 3);

  await signIn(page, staff);

  // The control on the counting screen is present and NOT disabled while the count is
  // blocked: the refusal is the service's, and a disabled button is not a rule.
  await page.goto(`/stock-entry/counts/${countId}`);
  const reviewAndSign = page.getByTestId("review-and-sign");
  await expect(reviewAndSign).toHaveText(REVIEW_AND_SIGN);
  expect(await reviewAndSign.isDisabled()).toBe(false);

  await reviewAndSign.click();
  await page.waitForURL(/\/submit$/);

  await expect(page.getByTestId("counted-summary")).toHaveText(
    countedSummary(lineCount - 3, lineCount),
  );
  await expect(page.getByTestId("uncounted-blocked")).toHaveText(uncountedBlocksSubmit(3));

  const entries = page.getByTestId("uncounted-line");
  await expect(entries).toHaveCount(3);

  // Every href is exactly the count's own path plus the row's anchor — NO QUERY STRING, so
  // the filter does not travel with it.
  const hrefs = await entries.locator("a").evaluateAll((links) =>
    links.map((link) => link.getAttribute("href") ?? ""),
  );
  expect(hrefs).toHaveLength(3);
  for (const href of hrefs) {
    expect(href).toMatch(new RegExp(`^/stock-entry/counts/${countId}#line-[\\w-]+$`));
    expect(href).not.toContain("?");
  }
  expect(new Set(hrefs)).toEqual(
    new Set(uncounted.map((itemId) => `/stock-entry/counts/${countId}#line-${itemId}`)),
  );

  // No truncation and no way to hide one of them.
  await expect(page.getByRole("button", { name: /show more|load more/i })).toHaveCount(0);

  // THE HARD CASE: the same screen reached from a FILTERED counting view is identical.
  const fromTheFilteredView = hrefs;
  await page.goto(`/stock-entry/counts/${countId}?supplier=Kelly&type=Thermo-P`);
  await page.getByTestId("review-and-sign").click();
  await page.waitForURL(/\/submit$/);

  await expect(page.getByTestId("uncounted-line")).toHaveCount(3);
  const afterFiltering = await page
    .getByTestId("uncounted-line")
    .locator("a")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  expect(afterFiltering).toEqual(fromTheFilteredView);

  // Following one lands on the counting screen with NO filter applied, and the row it
  // names is rendered and scrolled to.
  await page.getByTestId("uncounted-line").first().locator("a").click();
  await page.waitForURL(new RegExp(`/stock-entry/counts/${countId}#line-`));
  expect(page.url()).not.toContain("?");

  const row = page.locator(`#line-${uncounted[0]}`);
  await expect(row).toHaveAttribute("data-counted", "false");
  await expect(row).toBeInViewport();
  await expect(page.getByTestId("count-line")).toHaveCount(lineCount);
});

test("AC-6, AC-28, AC-29: the button is not the guard, and every refusal is this feature's own sentence", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 3);
  await fillQuantities(countId, 2);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}/submit`);

  // Enabled BEFORE anything is drawn (009 AC-6), and the pad is there to draw on.
  const submit = page.getByTestId("sign-and-submit");
  await expect(submit).toHaveAccessibleName(SIGN_AND_SUBMIT);
  expect(await submit.isDisabled()).toBe(false);
  await expect(page.getByTestId("signature-pad")).toBeVisible();

  // Pressed with nothing drawn: Invariant 11's sentence, beside the pad, and the page does
  // not navigate. The refusal is `submitCount`'s; the screen is a courtesy.
  await submit.click();
  const beside = page.getByTestId("submit-field-error");
  await expect(beside).toHaveText(SIGNATURE_REQUIRED);
  await expect(beside).toHaveAttribute("data-field", "signature");
  expect(page.url()).toContain("/submit");

  let row = await lifecycleOf(countId);
  expect(row.status).toBe("DRAFT");
  expect(row.signaturePath).toBeNull();
  expect(row.signedById).toBeNull();
  expect(row.submittedOn).toBeNull();
  expect(row.notes).toBeNull();

  // Drawn, and submitted while two rows are still uncounted: Invariant 5's sentence, which
  // is the first of 009 AC-28's eight provoked failures.
  await draw(page);
  const drawn = await page.getByTestId("signature-field").inputValue();
  expect(drawn).not.toBe("");

  await page.getByTestId("sign-and-submit").click();
  await expect(page.getByTestId("submit-field-error")).toHaveText(uncountedBlocksSubmit(2));
  expect((await lifecycleOf(countId)).status).toBe("DRAFT");

  // AC-29: THE REJECTED SUBMISSION KEPT THE DRAWING. Nobody signs twice for a reason that
  // was not the drawing — asserted by reading the hidden field after the error rendered.
  expect(await page.getByTestId("signature-field").inputValue()).toBe(drawn);

  // NOT ONE WORD OF POSTGRES ON THE SCREEN (009 AC-28).
  const html = await page.content();
  for (const forbidden of [
    "prisma",
    "Prisma",
    "violates",
    "constraint",
    "SQLSTATE",
    "23502",
    "23514",
    "P2002",
    "P2025",
  ]) {
    expect(html, forbidden).not.toContain(forbidden);
  }

  // The two missing rows counted — in the database, with the page left exactly as it is —
  // and the SAME drawing submits.
  await fillQuantities(countId, 0);
  await page.getByTestId("sign-and-submit").click();
  await page.waitForURL(`**/stock-entry/counts/${countId}`);

  row = await lifecycleOf(countId);
  expect(row.status).toBe("SUBMITTED");
  expect(row.signaturePath).toBe(drawn);
  expect(row.signedById).toBe(staff.id);

  // A countId that does not exist is a sentence and a way back, not a throw.
  await page.goto("/stock-entry/counts/count_does_not_exist/submit");
  await expect(page.getByTestId("count-missing")).toHaveText(COUNT_NO_LONGER_EXISTS);
  await expect(page.getByTestId("back-to-calendar")).toBeVisible();
});

test("AC-29: the two states of /submit that are not a pad — away, and empty", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 7);
  await fillQuantities(countId, 0);
  await submitAs(countId, staff);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}/submit`);

  // AWAY: the signed record, read-only. No pad, no control, and the signature on it.
  await expect(page.getByTestId("count-status")).toHaveText("Submitted");
  await expect(page.getByTestId("signature-pad")).toHaveCount(0);
  await expect(page.getByRole("button", { name: SIGN_AND_SUBMIT })).toHaveCount(0);
  await expect(page.getByTestId("signed-by")).toContainText("Signed by E2E Yard Staff on ");
  await expect(page.getByTestId("signature")).toBeVisible();
  await expect(page.getByTestId("uncounted-list")).toHaveCount(0);
  expect(await page.locator("main").innerHTML()).not.toContain("€");

  // EMPTY: a count with no lines says so, and offers nothing to sign (007 AC-13 says one
  // cannot be created; the screen still answers for it rather than rendering an empty pad).
  const emptyId = await seedCount({
    locationCode: "DUBLIN",
    year: YEAR,
    month: 8,
    countDate: `${String(YEAR)}-08-10`,
    createdById: staff.id,
  });

  await page.goto(`/stock-entry/counts/${emptyId}/submit`);
  await expect(page.getByTestId("count-empty")).toHaveText(COUNT_HAS_NO_ITEMS);
  await expect(page.getByTestId("signature-pad")).toHaveCount(0);
  await expect(page.getByRole("button", { name: SIGN_AND_SUBMIT })).toHaveCount(0);
});

test("AC-10: with no JavaScript the review is there, the pad says why it is not, and there is no submit control", async ({
  browser,
}) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 4);
  await fillQuantities(countId, 4);

  // Signed in WITH JavaScript, then the session carried into a context that has none — the
  // sign-in form is #3's and is not what this criterion is about.
  const signedIn = await browser.newContext();
  const helper = await signedIn.newPage();
  await signIn(helper, staff);
  const session = await signedIn.storageState();
  await signedIn.close();

  const context = await browser.newContext({ javaScriptEnabled: false, storageState: session });
  const page = await context.newPage();

  const response = await page.goto(`/stock-entry/counts/${countId}/submit`);
  expect(response?.status()).toBe(200);

  // The review and the blocked list, exactly as they render with the bundle.
  await expect(page.getByTestId("counted-summary")).toHaveText(
    countedSummary(lineCount - 4, lineCount),
  );
  await expect(page.getByTestId("uncounted-line")).toHaveCount(4);

  // It fails honestly: the sentence, and NO control whose accessible name is the act.
  await expect(page.getByTestId("signature-needs-js")).toHaveText(SIGNATURE_NEEDS_JS);
  await expect(page.getByTestId("signature-pad")).toHaveCount(0);
  await expect(page.getByRole("button", { name: SIGN_AND_SUBMIT })).toHaveCount(0);
  expect(await page.content()).not.toContain(`>${SIGN_AND_SUBMIT}<`);

  // Nothing was written by looking at it.
  expect((await lifecycleOf(countId)).status).toBe("DRAFT");

  await context.close();
});

test("AC-21: neither shared screen carries a euro, for either role, in any state", async ({
  page,
  browser,
}) => {
  const staff = await newUser();
  const admin = await newUser("ADMIN");
  const aRealPrice = await anyUnitPriceText();

  const draft = await freshCount(staff.id, 5);
  const submitted = await freshCount(staff.id, 6);
  await fillQuantities(submitted.countId, 0);
  await submitAs(submitted.countId, staff);

  // THE THIRD STATE. AC-21 names DRAFT, SUBMITTED and APPROVED, and an approved count is
  // the one whose lines carry a `unitPriceSnapshot` in the database - so it is the state in
  // which a shared screen has a price within reach and could most easily leak one.
  const approved = await freshCount(staff.id, 9);
  await fillQuantities(approved.countId, 0);
  await submitAs(approved.countId, staff);
  await approveAs(approved.countId, admin);

  // Non-vacuity: the walk below is worth nothing if the three counts are not really in the
  // three states it claims to cover.
  expect((await lifecycleOf(draft.countId)).status).toBe("DRAFT");
  expect((await lifecycleOf(submitted.countId)).status).toBe("SUBMITTED");
  expect((await lifecycleOf(approved.countId)).status).toBe("APPROVED");

  const urls = (countId: string): string[] => [
    `/stock-entry/counts/${countId}`,
    `/stock-entry/counts/${countId}?supplier=Kelly`,
    `/stock-entry/counts/${countId}/submit`,
  ];

  await signIn(page, staff);
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin);

  for (const reader of [page, adminPage]) {
    for (const countId of [draft.countId, submitted.countId, approved.countId]) {
      for (const url of urls(countId)) {
        const response = await reader.request.get(url);
        const body = await response.text();

        // Non-vacuity: a page that 404s or redirects away carries no euro either, and that
        // is not the fact this walk is asserting. Both roles get the real screen in all
        // three states - `/submit` on an APPROVED count renders its "away" state (AC-29).
        expect(response.status(), url).toBe(200);
        expect(body, url).not.toContain("€");
        expect(body, url).not.toContain("No price");
        expect(body, url).not.toContain("unitPrice");
        if (aRealPrice !== null) expect(body, url).not.toContain(aRealPrice);
      }
    }
  }

  // The ADMIN's extra on `/submit` is a LIST OF ITEM NAMES and never a figure, and a staff
  // session gets neither (009 AC-12, AC-21). What is expected comes from the SERVICE, so
  // the assertion is about this screen rather than about the user's own master data.
  const review = await getCountForSubmit(actorFor(admin), draft.countId);
  const expected = "linesWithoutPrice" in review ? review.linesWithoutPrice : [];

  await adminPage.goto(`/stock-entry/counts/${draft.countId}/submit`);
  await expect(adminPage.getByTestId("line-without-price")).toHaveCount(expected.length);

  if (expected.length > 0) {
    await expect(adminPage.getByTestId("items-without-price")).toHaveText(
      itemsWithoutPriceMessage(expected.length),
    );
    await expect(adminPage.getByTestId("lines-without-price")).toContainText(
      expected[0].description,
    );
  }

  await page.goto(`/stock-entry/counts/${draft.countId}/submit`);
  await expect(page.getByTestId("lines-without-price")).toHaveCount(0);
  await expect(page.getByTestId("items-without-price")).toHaveCount(0);

  await adminContext.close();
});
