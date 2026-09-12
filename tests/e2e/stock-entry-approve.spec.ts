import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  APPROVE_THIS_COUNT,
  COUNT_ALREADY_DRAFT,
  COUNT_NO_LONGER_EXISTS,
  NO_PRICE,
  REOPEN_REASON_REQUIRED,
  REOPEN_THIS_COUNT,
  SIGNATURE_REQUIRED,
  SIGNED_AND_APPROVED_BY_SAME_PERSON,
  approvedByMessage,
  auditSentence,
  linesWithoutPriceMessage,
  reopenedNotice,
  signedByMessage,
} from "@/lib/count-messages";
import { formatPriceExact, roundHalfUp } from "@/lib/money";
import { getCountSummary } from "@/server/counts/count-summary-service";

import { seededMasterCounts } from "./support/item-master";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  RESERVED_YEAR,
  actorFor,
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
 * Spec 009's ADMIN half: the valued summary, approval, the audited reopen — and the three
 * layers that keep a `YARD_STAFF` session out of all of it.
 *
 * PART 6 READ LITERALLY. Staff submit and never approve, and the refusal that matters is
 * the SERVICE's (`count-lifecycle-service.db.test.ts` proves that one with no browser at
 * all). What this file adds is the two outer layers and the fact that neither can be
 * talked round: the route answers `307` and sends nothing, and a forged submission
 * carrying `role=ADMIN` changes no column.
 *
 * This file owns reserved year 2099 and deletes only that year.
 */
const YEAR = RESERVED_YEAR.approve;

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
  const user = await createTestUser(role, `stock-entry-approve-${role.toLowerCase()}`);
  created.push(user.email);
  return user;
}

/** A Dublin count, counted in full and submitted through the real service. */
async function submittedCount(staff: TestUser, month: number): Promise<string> {
  const { countId } = await seedCountWithLines({
    locationCode: "DUBLIN",
    year: YEAR,
    month,
    countDate: `${String(YEAR)}-${String(month).padStart(2, "0")}-10`,
    createdById: staff.id,
  });
  await fillQuantities(countId, 0);
  await submitAs(countId, staff);
  return countId;
}

/** The `<main>` of a page, which is everything below #3's shared header. */
async function mainOf(page: Page, url: string): Promise<string> {
  await page.goto(url);
  return page.locator("main").innerHTML();
}

test("AC-12, AC-22, AC-25: the euro lives on exactly one of the four routes, and every figure on it is the service's", async ({
  page,
}) => {
  const staff = await newUser();
  const admin = await newUser("ADMIN");
  const countId = await submittedCount(staff, 1);

  await signIn(page, admin);

  // THE EURO IS ON EXACTLY ONE OF THE FOUR ROUTES, for an ADMIN — the one a staff session
  // cannot reach at all (009 AC-22).
  const routes = [
    `/stock-entry/counts/${countId}`,
    `/stock-entry/counts/${countId}/submit`,
    `/stock-entry/counts/${countId}/summary`,
    `/stock-entry/counts/${countId}/reopen`,
  ];
  const withEuro: string[] = [];
  for (const url of routes) {
    const body = await (await page.request.get(url)).text();
    if (body.includes("€")) withEuro.push(url);
  }
  expect(withEuro).toEqual([`/stock-entry/counts/${countId}/summary`]);

  // Every figure on the screen is the one the service derived — the screen renders, and
  // the service computes (009 AC-25).
  const summary = await getCountSummary(actorFor(admin), countId);

  await page.goto(`/stock-entry/counts/${countId}/summary`);
  await expect(page.getByTestId("count-total")).toHaveText(
    formatPriceExact(roundHalfUp(summary.countTotal, 2)),
  );
  await expect(page.getByTestId("valued-line")).toHaveCount(summary.lines.length);

  // INVARIANT 4, PER ROW AND NEVER SILENT: `No price` on exactly the lines with no price,
  // each valued at zero, and the sentence above the table.
  const priceless = summary.lines.filter((line) => line.noPrice);
  await expect(page.getByTestId("no-price")).toHaveCount(priceless.length);

  if (priceless.length > 0) {
    await expect(page.getByTestId("lines-without-price-warning")).toHaveText(
      linesWithoutPriceMessage(summary.itemsWithoutPrice),
    );

    const row = page.locator(`[data-testid="valued-line"][data-item-id="${priceless[0].itemId}"]`);
    await expect(row.getByTestId("no-price")).toHaveText(NO_PRICE);
    await expect(row.getByTestId("line-value")).toContainText("€0.00");
  }

  const priced = summary.lines.filter((line) => !line.noPrice);
  expect(priced.length).toBeGreaterThan(0);
  const first = priced[0];
  const pricedRow = page.locator(`[data-testid="valued-line"][data-item-id="${first.itemId}"]`);
  await expect(pricedRow.getByTestId("line-amount")).toContainText(
    formatPriceExact(first.unitPriceSnapshot ?? "0"),
  );
  await expect(pricedRow.getByTestId("line-value")).toContainText(
    formatPriceExact(roundHalfUp(first.lineValue, 2)),
  );
  await expect(pricedRow.getByTestId("no-price")).toHaveCount(0);

  // A countId that does not exist is a sentence and a way back, not a throw (009 AC-29).
  await page.goto("/stock-entry/counts/count_does_not_exist/summary");
  await expect(page.getByTestId("count-missing")).toHaveText(COUNT_NO_LONGER_EXISTS);
});

test("AC-16, AC-20, AC-23: approval, the trail, and one version of the screen for both roles", async ({
  page,
  browser,
}) => {
  const staff = await newUser();
  const admin = await newUser("ADMIN");
  const countId = await submittedCount(staff, 2);

  await signIn(page, admin);
  await page.goto(`/stock-entry/counts/${countId}/summary`);

  // One event so far, and it reads as a sentence with its actor and a formatted day.
  const beforeApproval = await lifecycleOf(countId);
  await expect(page.getByTestId("audit-entry")).toHaveCount(1);

  await page.getByTestId("approve-count").click();
  // The redirect is to the URL the page is already on, so the ADDRESS cannot say when the
  // write has happened: the freshly rendered status is what says so.
  await expect(page.getByTestId("count-status")).toHaveText("Approved");

  const approved = await lifecycleOf(countId);
  expect(approved.status).toBe("APPROVED");
  expect(approved.approvedById).toBe(admin.id);
  expect(approved.signedById).toBe(staff.id);
  // The snapshots and the signature did not move: approval changes the status and two
  // columns, and nothing else (009 AC-16).
  expect(approved.signaturePath).toBe(beforeApproval.signaturePath);
  expect(approved.submittedOn?.getTime()).toBe(beforeApproval.submittedOn?.getTime());

  // The trail, oldest first, and the approve control is gone because the count is away.
  const entries = page.getByTestId("audit-entry");
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0)).toContainText("Submitted by");
  await expect(entries.nth(1)).toContainText("Approved by");
  await expect(page.getByRole("button", { name: APPROVE_THIS_COUNT })).toHaveCount(0);

  const trail = (approved.notes ?? "").split("\n");
  expect(trail).toHaveLength(2);
  // The earlier line is byte-identical to what it was before the approval: append-only.
  expect(trail[0]).toBe(beforeApproval.notes);

  // WHAT THE PERSON WHO COUNTED IT SEES — Part 6's row, read literally (009 AC-23).
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, staff);

  const staffMain = await mainOf(staffPage, `/stock-entry/counts/${countId}`);
  const signedAt = approved.submittedOn?.toISOString() ?? "";
  const approvedAtInstant = approved.approvedOn?.toISOString() ?? "";

  await expect(staffPage.getByTestId("count-status")).toHaveText("Approved");
  await expect(staffPage.getByTestId("signed-by")).toHaveText(
    signedByMessage("E2E Yard Staff", signedAt),
  );
  await expect(staffPage.getByTestId("approved-by")).toHaveText(
    approvedByMessage("E2E Administrator", approvedAtInstant),
  );
  await expect(staffPage.getByTestId("signature")).toBeVisible();

  // No input, no euro, no value column, no total, no tag — asserted by absence.
  await expect(staffPage.getByTestId("count-lines").locator("input")).toHaveCount(0);
  await expect(staffPage.getByTestId("count-lines").locator("select")).toHaveCount(0);
  await expect(staffPage.getByTestId("count-lines").locator("textarea")).toHaveCount(0);
  await expect(staffPage.getByTestId("count-total")).toHaveCount(0);
  expect(staffMain).not.toContain("€");
  expect(staffMain).not.toContain(NO_PRICE);
  await expect(staffPage.getByTestId("count-summary-link")).toHaveCount(0);

  // ONE VERSION OF THE SCREEN, NOT TWO: the ADMIN's markup is the staff markup plus one
  // link, asserted by removing that link and comparing what is left.
  await page.goto(`/stock-entry/counts/${countId}`);
  await expect(page.getByTestId("count-summary-link")).toHaveAttribute(
    "href",
    `/stock-entry/counts/${countId}/summary`,
  );

  const adminMain = await page.locator("main").evaluate((main) => {
    const copy = main.cloneNode(true) as HTMLElement;
    copy.querySelector('[data-testid="count-summary-link"]')?.remove();
    return copy.innerHTML;
  });
  expect(adminMain).toBe(staffMain);

  // The audit trail is the ADMIN's: a staff session sees the reason, never the trail.
  expect(staffMain).not.toContain("audit-trail");
  expect(
    auditSentence({
      at: approvedAtInstant,
      event: "APPROVED",
      actorName: "E2E Administrator",
      actorEmail: admin.email,
      reason: null,
    }),
  ).toContain("Approved by E2E Administrator on ");

  await staffContext.close();
});

test("AC-16: an ADMIN who signed a count may approve it, and both screens say so", async ({
  page,
}) => {
  // OPEN QUESTION 2, as a fact rather than a rule: `specs/product-brief.md` says the team
  // is two people at most, and an administrator alone in the office must be able to close
  // the month. Refusing this would leave a single-admin yard unable to finish a count.
  const admin = await newUser("ADMIN");
  const { countId } = await seedCountWithLines({
    locationCode: "DUBLIN",
    year: YEAR,
    month: 6,
    countDate: `${String(YEAR)}-06-10`,
    createdById: admin.id,
  });
  await fillQuantities(countId, 0);
  await submitAs(countId, admin);

  await signIn(page, admin);
  await page.goto(`/stock-entry/counts/${countId}/summary`);
  await page.getByTestId("approve-count").click();
  await expect(page.getByTestId("count-status")).toHaveText("Approved");

  const row = await lifecycleOf(countId);
  expect(row.approvedById).toBe(admin.id);
  expect(row.signedById).toBe(admin.id);

  // Recorded, and visible, on BOTH screens.
  await expect(page.getByTestId("signed-and-approved-by-same-person")).toHaveText(
    SIGNED_AND_APPROVED_BY_SAME_PERSON,
  );

  await page.goto(`/stock-entry/counts/${countId}`);
  await expect(page.getByTestId("signed-and-approved-by-same-person")).toHaveText(
    SIGNED_AND_APPROVED_BY_SAME_PERSON,
  );

  // And approving it again is refused in this feature's own words (009 AC-16, AC-28).
  await page.goto(`/stock-entry/counts/${countId}/summary`);
  await expect(page.getByRole("button", { name: APPROVE_THIS_COUNT })).toHaveCount(0);
});

test("AC-18: the reopen destroys the signature, says why, and demands a fresh one", async ({
  page,
  browser,
}) => {
  const staff = await newUser();
  const admin = await newUser("ADMIN");
  const countId = await submittedCount(staff, 3);
  const reason = "the MMA price was wrong";

  await signIn(page, admin);

  // The only way in is from the summary, which is where the figures are.
  await page.goto(`/stock-entry/counts/${countId}/summary`);
  await page.getByTestId("reopen-link").click();
  await page.waitForURL(/\/reopen$/);
  await expect(page.getByTestId("reopen-destroys")).toBeVisible();

  // No reason, no reopen — and the sentence is inline beside the field it names.
  await page.getByTestId("reopen-count").click();
  const inline = page.getByTestId("reopen-field-error");
  await expect(inline).toHaveText(REOPEN_REASON_REQUIRED);
  await expect(inline).toHaveAttribute("data-field", "reason");
  expect((await lifecycleOf(countId)).status).toBe("SUBMITTED");

  await page.getByTestId("reopen-reason").fill(reason);
  await page.getByTestId("reopen-count").click();
  await page.waitForURL(`**/stock-entry/counts/${countId}`);

  // SIX COLUMNS BACK TO NULL, and the trail is what survives.
  const reopened = await lifecycleOf(countId);
  expect(reopened.status).toBe("DRAFT");
  expect(reopened.signaturePath).toBeNull();
  expect(reopened.signedById).toBeNull();
  expect(reopened.approvedById).toBeNull();
  expect(reopened.submittedOn).toBeNull();
  expect(reopened.approvedOn).toBeNull();
  expect((reopened.notes ?? "").split("\n")).toHaveLength(2);
  expect(reopened.notes).toContain(reason);

  // THE PERSON WHO HAS TO WALK THE YARD AGAIN IS TOLD WHY, and the sentence carries no
  // euro (009 AC-18, Open question 7).
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, staff);
  await staffPage.goto(`/stock-entry/counts/${countId}`);

  await expect(staffPage.getByTestId("reopen-notice")).toHaveText(
    reopenedNotice("E2E Administrator", new Date().toISOString(), reason),
  );
  await expect(staffPage.getByTestId("signature")).toHaveCount(0);
  expect(await staffPage.locator("main").innerHTML()).not.toContain("€");

  // The count is editable again, and a FRESH signature is demanded.
  await expect(staffPage.getByTestId("quantity-input").first()).toBeVisible();
  await staffPage.goto(`/stock-entry/counts/${countId}/submit`);
  await expect(staffPage.getByTestId("signature-pad").locator("path")).toHaveCount(0);
  await staffPage.getByTestId("sign-and-submit").click();
  await expect(staffPage.getByTestId("submit-field-error")).toHaveText(SIGNATURE_REQUIRED);

  await staffContext.close();

  // A DRAFT cannot be reopened: the conflict sentence, and no control to press.
  await page.goto(`/stock-entry/counts/${countId}/reopen`);
  await expect(page.getByTestId("reopen-conflict")).toHaveText(COUNT_ALREADY_DRAFT);
  await expect(page.getByRole("button", { name: REOPEN_THIS_COUNT })).toHaveCount(0);
  await expect(page.getByTestId("reopen-reason")).toHaveCount(0);
});

test("AC-15, AC-27: a staff session never approves, however it asks", async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  const staff = await newUser();
  const admin = await newUser("ADMIN");
  const countId = await submittedCount(staff, 4);

  // Everything a client can choose says ADMIN at once.
  await context.addCookies([{ name: "role", value: "ADMIN", url: baseURL as string }]);
  await page.setExtraHTTPHeaders({ "x-user-role": "ADMIN" });
  await signIn(page, staff);

  for (const url of [
    `/stock-entry/counts/${countId}?role=ADMIN`,
    `/stock-entry/counts/${countId}/submit?role=ADMIN`,
  ]) {
    await page.goto(url);

    // No control and no way in, for either act.
    await expect(page.getByRole("button", { name: APPROVE_THIS_COUNT })).toHaveCount(0);
    await expect(page.getByRole("button", { name: REOPEN_THIS_COUNT })).toHaveCount(0);
    await expect(page.locator('a[href$="/summary"]')).toHaveCount(0);
    await expect(page.locator('a[href$="/reopen"]')).toHaveCount(0);
    expect(await page.locator("main").innerHTML(), url).not.toContain("€");
  }

  for (const [url, denied] of [
    [`/stock-entry/counts/${countId}/summary?role=ADMIN`, "count-summary"],
    [`/stock-entry/counts/${countId}/reopen?role=ADMIN`, "count-reopen"],
  ] as const) {
    const refused = await page.request.get(url, { maxRedirects: 0 });
    expect([302, 307], url).toContain(refused.status());
    expect(refused.headers()["location"] ?? "", url).toBe(`/stock-entry?denied=${denied}`);
  }

  // THE SERVER ACTION ITSELF, posted by a staff session with the reference captured from
  // an ADMIN render and every identity field a sender could invent. The action runs; the
  // SERVICE refuses it (009 AC-15, AC-27).
  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, admin);
  await adminPage.goto(`/stock-entry/counts/${countId}/summary`);

  const hidden = await adminPage
    .locator("form", { has: adminPage.getByTestId("approve-count") })
    .locator('input[type="hidden"]')
    .evaluateAll((fields) =>
      fields.map((field) => ({
        name: field.getAttribute("name") ?? "",
        value: (field as HTMLInputElement).value,
      })),
    );
  await adminContext.close();

  // Non-vacuity: the capture really did find the Server Action's own reference.
  expect(hidden.some((field) => field.name.startsWith("$ACTION"))).toBe(true);

  const before = await lifecycleOf(countId);

  const submission = page.waitForRequest(
    (request) => request.method() === "POST" && request.url().includes(`/summary`),
  );

  await page.goto(`/stock-entry/counts/${countId}`);
  await page.evaluate(
    ({ fields, action, adminId }) => {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = action;
      form.enctype = "multipart/form-data";

      const append = (name: string, value: string): void => {
        const field = document.createElement("input");
        field.type = "hidden";
        field.name = name;
        field.value = value;
        form.appendChild(field);
      };

      for (const field of fields) append(field.name, field.value);
      append("role", "ADMIN");
      append("userId", adminId);
      append("approvedById", adminId);
      append("signedById", adminId);

      document.body.appendChild(form);
      form.submit();
    },
    {
      fields: hidden,
      action: `/stock-entry/counts/${countId}/summary`,
      adminId: admin.id,
    },
  );

  const posted = (await submission).postData() ?? "";
  expect(posted).toContain("role");
  expect(posted).toContain(admin.id);

  await page.waitForLoadState("load");

  // NOTHING MOVED. The refusal is the service's, not the button's absence.
  const after = await lifecycleOf(countId);
  expect(after.status).toBe("SUBMITTED");
  expect(after.approvedById).toBeNull();
  expect(after.approvedOn).toBeNull();
  expect(after.notes).toBe(before.notes);
  expect(after.signedById).toBe(staff.id);
});

test("AC-10: an ADMIN approves and reopens with the bundle disabled", async ({ browser }) => {
  const staff = await newUser();
  const admin = await newUser("ADMIN");
  const countId = await submittedCount(staff, 5);

  const signedIn = await browser.newContext();
  const helper = await signedIn.newPage();
  await signIn(helper, admin);
  const session = await signedIn.storageState();
  await signedIn.close();

  const context = await browser.newContext({ javaScriptEnabled: false, storageState: session });
  const page = await context.newPage();

  // Approve: an ordinary form, posting to a server action, with no JavaScript at all.
  await page.goto(`/stock-entry/counts/${countId}/summary`);
  await expect(page.getByTestId("count-total")).toContainText("€");
  await page.getByTestId("approve-count").click();
  await page.waitForLoadState("load");

  const approved = await lifecycleOf(countId);
  expect(approved.status).toBe("APPROVED");
  expect(approved.approvedById).toBe(admin.id);
  // Re-rendered from the SERVER: the new state is read from the page, not from any client.
  await expect(page.getByTestId("count-status")).toHaveText("Approved");
  await expect(page.getByTestId("audit-entry")).toHaveCount(2);

  // Reopen: a typed reason and a second ordinary form.
  await page.goto(`/stock-entry/counts/${countId}/reopen`);
  await page.getByTestId("reopen-reason").fill("counted the wrong bay");
  await page.getByTestId("reopen-count").click();
  await page.waitForLoadState("load");

  const reopened = await lifecycleOf(countId);
  expect(reopened.status).toBe("DRAFT");
  expect(reopened.signaturePath).toBeNull();
  expect(reopened.approvedById).toBeNull();
  await expect(page.getByTestId("reopen-notice")).toContainText("counted the wrong bay");

  await context.close();
});
