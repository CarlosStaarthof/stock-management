import { expect, test } from "@playwright/test";

import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import { seededMasterCounts } from "./support/item-master";
import {
  RESERVED_YEAR,
  anyUnitPriceText,
  approveAs,
  clearReservedYear,
  fillQuantities,
  realCountIds,
  reservedCountTotals,
  seedCount,
  seedCountWithLines,
  submitAs,
} from "./support/stock-entry";
import {
  bodyOf,
  jumpTargets,
  longestDescription,
  maskForeignNeighbours,
  shapeCountQuantities,
} from "./support/stock-takes";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 010's browser half for `/stock-takes/counts/<id>` — the read-only record, held only
 * by default.
 *
 * THIS FILE OWNS RESERVED YEAR 2102 (007 AC-30, 010 AC-21) and deletes only that year. Its
 * counts are built with `seedCountWithLines`, `fillQuantities`, `submitAs` and `approveAs`,
 * which go through Prisma and the lifecycle SERVICE rather than through the
 * period-validating start flow — which is why 2102 is reachable although 007 AC-8 caps a
 * period started through `startCount` at 2100.
 *
 * THREE COUNTS, ONE PER STATUS, because AC-12 requires the money walk at the browser for a
 * draft, a submitted and an approved count, for both roles. The submitted and approved ones
 * go through the real service precisely because that is what writes the price snapshot: a
 * status written straight into the column would leave every snapshot null and "no euro
 * reached the screen" would prove nothing.
 *
 * THE FOURTH COUNT IS CLONMEL'S, dated BETWEEN two of Dublin's, and it exists to be NOT
 * jumped to: the previous count of a Dublin count is Dublin's previous count (AC-11).
 */
const YEAR = RESERVED_YEAR.takesCount;
const Y = String(YEAR);

const created: string[] = [];
let draftId = "";
let submittedId = "";
let approvedId = "";
let clonmelId = "";
let shape: Awaited<ReturnType<typeof shapeCountQuantities>>;
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

  const owner = await createTestUser("YARD_STAFF", "stock-takes-count-owner");
  const approver = await createTestUser("ADMIN", "stock-takes-count-approver");
  created.push(owner.email, approver.email);

  // The draft: held, counted-as-zero and never-counted lines, and two awkward decimals.
  const draft = await seedCountWithLines({
    locationCode: "DUBLIN",
    year: YEAR,
    month: 1,
    countDate: `${Y}-01-31`,
    createdById: owner.id,
  });
  draftId = draft.countId;
  shape = await shapeCountQuantities(draftId, { zeros: 5, nulls: 7 });

  // Clonmel, dated between Dublin's January and Dublin's February.
  clonmelId = await seedCount({
    locationCode: "CLONMEL",
    year: YEAR,
    month: 2,
    countDate: `${Y}-02-15`,
    createdById: owner.id,
  });

  const submitted = await seedCountWithLines({
    locationCode: "DUBLIN",
    year: YEAR,
    month: 2,
    countDate: `${Y}-02-28`,
    createdById: owner.id,
  });
  submittedId = submitted.countId;
  await fillQuantities(submittedId);
  await submitAs(submittedId, owner);

  const approved = await seedCountWithLines({
    locationCode: "DUBLIN",
    year: YEAR,
    month: 3,
    countDate: `${Y}-03-31`,
    createdById: owner.id,
  });
  approvedId = approved.countId;
  await fillQuantities(approvedId);
  await submitAs(approvedId, owner);
  await approveAs(approvedId, approver);
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
  const user = await createTestUser(role, "stock-takes-count");
  created.push(user.email);
  return user;
}

/**
 * The four counts this file created, and therefore the only ids in the database whose
 * presence in a rendered body this file can predict (010's eighth amendment).
 *
 * Every other count belongs to another spec's reserved year, to the item-master fixture or
 * to the user's own data, and any of those may be created or deleted while this file runs.
 */
function ownCounts(): string[] {
  return [draftId, submittedId, approvedId, clonmelId];
}

/**
 * What the two jumps out of this file's own counts must lead to, whoever is reading.
 *
 * Only the neighbours THIS FILE OWNS are named. The draft's *previous* is the whole yard's
 * previous count and the approved one's *next* is the whole yard's next, so both are
 * facts about other specs' rows rather than about this feature — those two are what
 * `maskForeignNeighbours` drops from the byte comparisons, and they are asserted nowhere
 * because there is nothing true to assert. The three that remain are pinned by this
 * file's own fixture: no other spec writes into year 2102, so nothing can be dated between
 * two of these counts.
 */
function ownNeighboursOf(countId: string): { previous?: string; next?: string } {
  if (countId === draftId) return { next: submittedId };
  if (countId === submittedId) return { previous: draftId, next: approvedId };
  if (countId === approvedId) return { previous: submittedId };
  return {};
}

/* ---------------------------------------------------------- AC-8, what it renders */

test("AC-8: the record is the yard, the period, the day, who counted it and its status", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-takes/counts/${draftId}`);

  await expect(page.getByTestId("history-yard")).toHaveText("Dublin");
  await expect(page.getByTestId("history-period")).toHaveText(`January ${Y}`);
  await expect(page.getByTestId("history-date")).toHaveAttribute("datetime", `${Y}-01-31`);
  await expect(page.getByTestId("history-date")).toHaveText(`31 January ${Y}`);
  await expect(page.getByTestId("history-status")).toHaveText("Draft");
  await expect(page.getByTestId("history-counted-by")).toContainText("Counted by");

  await expect(page.getByTestId("history-status")).toHaveCount(1);
  await page.goto(`/stock-takes/counts/${submittedId}`);
  await expect(page.getByTestId("history-status")).toHaveText("Submitted");
  await page.goto(`/stock-takes/counts/${approvedId}`);
  await expect(page.getByTestId("history-status")).toHaveText("Approved");
});

test("AC-8: this page cannot be typed into — no input, select, textarea, button or form", async ({
  page,
}) => {
  await signIn(page, await newUser("ADMIN"));

  for (const url of [
    `/stock-takes/counts/${draftId}`,
    `/stock-takes/counts/${draftId}?show=all`,
    `/stock-takes/counts/${approvedId}`,
  ]) {
    await page.goto(url);
    for (const element of ["input", "select", "textarea", "button", "form"]) {
      await expect(page.locator(element), `${url} has a ${element}`).toHaveCount(0);
    }
  }
});

test("AC-8: the quantity is exactly as stored, never rounded", async ({ page }) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-takes/counts/${draftId}`);

  await expect(
    page.locator(`[data-item-id="${shape.exactItemId}"]`).getByTestId("history-quantity"),
  ).toHaveText(shape.exactQuantity);
  await expect(
    page.locator(`[data-item-id="${shape.fractionItemId}"]`).getByTestId("history-quantity"),
  ).toHaveText(shape.fractionQuantity);
});

test("AC-8: the rows are in the order getCount returns, the same order the sheet has", async ({
  page,
}) => {
  await signIn(page, await newUser());

  await page.goto(`/stock-entry/counts/${submittedId}`);
  const sheetOrder = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid='count-line']")).map(
      (row) => row.getAttribute("data-item-id") ?? "",
    ),
  );

  await page.goto(`/stock-takes/counts/${submittedId}?show=all`);
  const historyOrder = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid='history-line']")).map(
      (row) => row.getAttribute("data-item-id") ?? "",
    ),
  );

  expect(historyOrder.length).toBeGreaterThan(0);
  expect(historyOrder).toEqual(sheetOrder);
});

test("AC-8, AC-17: a count that does not exist is a sentence and a way back", async ({ page }) => {
  await signIn(page, await newUser());

  for (const id of ["does-not-exist", "not a valid id at all", "../../etc/passwd"]) {
    const response = await page.request.get(`/stock-takes/counts/${encodeURIComponent(id)}`);
    expect(response.status(), id).toBe(200);

    await page.goto(`/stock-takes/counts/${encodeURIComponent(id)}`);
    await expect(page.getByTestId("count-missing"), id).toHaveText("That count no longer exists.");
    await expect(page.getByTestId("back-to-calendar"), id).toHaveAttribute(
      "href",
      "/stock-takes",
    );

    const body = await response.text();
    for (const forbidden of ["prisma", "Prisma", "violates", "constraint", "P2025", "SQLSTATE"]) {
      expect(body, `${id} leaked ${forbidden}`).not.toContain(forbidden);
    }
  }
});

/* ------------------------------------------------------------ AC-9, held is the default */

test("AC-9: held only is the default, and the page says what it hid", async ({ page }) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-takes/counts/${draftId}`);

  // The numbers are derived from the count the fixture actually built, so this asserts
  // about the feature and not about the user's Dublin sheet.
  await expect(page.getByTestId("history-line")).toHaveCount(shape.held);
  await expect(page.getByTestId("hidden-summary")).toHaveText(
    `${String(shape.hidden)} of ${String(shape.total)} items are not held and are hidden.`,
  );
  await expect(page.getByTestId("show-all-items")).toHaveText("Show all items");
  await expect(page.getByTestId("show-all-items")).toHaveAttribute(
    "href",
    `/stock-takes/counts/${draftId}?show=all`,
  );

  // Neither hidden line is in the DOM at all - hiding one in a component is not hiding it.
  await expect(page.locator(`[data-item-id="${shape.nullItemId}"]`)).toHaveCount(0);
  await expect(page.locator(`[data-item-id="${shape.zeroItemId}"]`)).toHaveCount(0);
});

test("AC-9: show=all renders every row, and 0 stays distinguishable from never counted", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto(`/stock-takes/counts/${draftId}?show=all`);

  await expect(page.getByTestId("history-line")).toHaveCount(shape.total);
  await expect(page.getByTestId("hidden-summary")).toHaveCount(0);
  await expect(page.getByTestId("show-held-only")).toHaveText("Show held only");
  await expect(page.getByTestId("show-held-only")).toHaveAttribute(
    "href",
    `/stock-takes/counts/${draftId}?show=held`,
  );

  // Invariant 5, surviving a read: `0` is a person who stood in the yard and wrote none.
  const zeroRow = page.locator(`[data-item-id="${shape.zeroItemId}"]`);
  await expect(zeroRow).toHaveAttribute("data-counted", "zero");
  await expect(zeroRow.getByTestId("history-quantity")).toHaveText("0");

  const nullRow = page.locator(`[data-item-id="${shape.nullItemId}"]`);
  await expect(nullRow).toHaveAttribute("data-counted", "no");
  await expect(nullRow.getByTestId("history-quantity")).toHaveText("Not counted");
});

test("AC-9: ?show=held renders identically to no ?show at all", async ({ page }) => {
  await signIn(page, await newUser());

  const withNothing = await bodyOf(page, `/stock-takes/counts/${draftId}`);
  const jumpsWithNothing = await jumpTargets(page);
  const withHeld = await bodyOf(page, `/stock-takes/counts/${draftId}?show=held`);
  const jumpsWithHeld = await jumpTargets(page);

  // THE JUMP THIS FILE OWNS IS ASSERTED, NOT MASKED: both readings lead to February's
  // count, and `?show=held` carries no differently from no `?show` at all.
  expect(jumpsWithNothing.next).toBe(submittedId);
  expect(jumpsWithHeld.next).toBe(submittedId);

  // THE MASK DROPS ONE VALUE AND KEEPS THE CLAIM. The *Previous count* of the earliest
  // count in this file's year is the whole yard's previous count, chosen across every
  // year, so another spec creating or deleting a Dublin count between these two
  // navigations changes it — identical lengths, one differing id, which is precisely how
  // this assertion failed on 2026-09-14. What this criterion claims is that the two ways
  // of asking for the held view render the same screen, and that claim is still compared
  // byte for byte. See 010's eighth post-approval amendment.
  expect(maskForeignNeighbours(withHeld, ownCounts())).toBe(
    maskForeignNeighbours(withNothing, ownCounts()),
  );
});

test("AC-9: an unreadable ?show is a 307 that keeps the yard", async ({ page }) => {
  await signIn(page, await newUser());

  for (const query of ["?show=banana", "?show=", "?show=held&show=all"]) {
    const plain = await page.request.get(`/stock-takes/counts/${draftId}${query}`, {
      maxRedirects: 0,
    });
    expect(plain.status(), query).toBe(307);
    expect(plain.headers()["location"] ?? "", query).toBe(`/stock-takes/counts/${draftId}`);

    const scoped = await page.request.get(
      `/stock-takes/counts/${draftId}${query}&yard=CLONMEL`,
      { maxRedirects: 0 },
    );
    expect(scoped.status(), query).toBe(307);
    expect(scoped.headers()["location"] ?? "", query).toBe(
      `/stock-takes/counts/${draftId}?yard=CLONMEL`,
    );

    // And following it renders the count rather than an error.
    await page.goto(`/stock-takes/counts/${draftId}${query}`);
    await expect(page.getByTestId("history-yard"), query).toBeVisible();
    await expect(page.getByTestId("error-message"), query).toHaveCount(0);
  }
});

/* ------------------------------------------------------------- AC-11, the same yard */

test("AC-11: the jumps are same-yard, and carry the reading mode", async ({ page }) => {
  await signIn(page, await newUser());

  // February's Dublin count: the previous one is January's DUBLIN count, not the Clonmel
  // count dated between them.
  await page.goto(`/stock-takes/counts/${submittedId}?yard=CLONMEL&show=all`);
  await expect(page.getByTestId("previous-count")).toHaveAttribute(
    "href",
    `/stock-takes/counts/${draftId}?yard=CLONMEL&show=all`,
  );
  await expect(page.getByTestId("next-count")).toHaveAttribute(
    "href",
    `/stock-takes/counts/${approvedId}?yard=CLONMEL&show=all`,
  );
  expect(
    await page.getByTestId("previous-count").getAttribute("href"),
  ).not.toContain(clonmelId);

  // BOTH DIRECTIONS ARE READ WHERE THIS FILE OWNS THE ANSWER, NOT WHERE THE DATABASE
  // HAPPENS TO END.
  //
  // What stood here asserted that the approved count's *Next count* is DISABLED, and
  // justified it with "2102 is the highest reserved year". That was already the SECOND
  // spelling of one idea. The first named `stock-takes-calendar.spec.ts`'s year and failed
  // the first time the two #10 specs ran in one session; Phase B traded it for "nothing
  // exists after", which looks narrower and is in fact BROADER - a claim about every spec
  // in the repository. #11 falsified it in one commit: `analysisAccess: 2103`,
  // `analysisPrior: 2104` and `analysisFigures: 2105` each seed DUBLIN counts, all three
  // of those files run in THIS project at `workers: 3`, and a Dublin count dated
  // 2103-10-31 is a perfectly good *Next count* for a 2102-03-31 one.
  //
  // THERE IS NO THIRD SPELLING OF THAT IDEA TO REACH FOR, and that is why the assertion
  // changes shape rather than changing its number. `findNeighbourCounts` chooses the
  // neighbour by `(countDate, id)` across the WHOLE yard's history, so "there is nothing
  // after this count" is - for every count at either of the two yards - a claim about
  // every row in the database. Owning the top of the order does not fix it; it moves the
  // boundary onto whichever count is last.
  //
  // WHAT IS ASSERTED INSTEAD IS A NEIGHBOURHOOD THIS FILE CONTROLS. February's count sits
  // at a yard/period BOTH of whose neighbours are this file's own - January's draft before
  // it and March's approved count after it - because no other spec writes into 2102, so no
  // row that is not this file's can be dated between two of them. Both jumps out of it are
  // therefore facts about rows this file created and about nothing else, and the control
  // is pinned in the state it is in: an anchor, under the same test id, carrying the
  // label, carrying the owned href, and NOT announcing itself disabled.
  //
  // THE ABSENCE BRANCH KEEPS THE ONE OWNER THAT CAN ACTUALLY CLAIM IT.
  // `src/server/counts/count-history-service.db.test.ts` calls `resetTestDb()` and so owns
  // the whole of `StockCount`: `expect(latest.next).toBeNull()` is true there by
  // construction rather than by hope. What was here was a duplicate of that claim, made
  // from the one place that cannot support it. See "Repair pass 5" in
  // `progress/impl_stock_takes_history.md`.
  await page.goto(`/stock-takes/counts/${submittedId}`);
  for (const [testId, label, target] of [
    ["previous-count", "Previous count", draftId],
    ["next-count", "Next count", approvedId],
  ] as const) {
    const control = page.getByTestId(testId);
    await expect(control, testId).toHaveCount(1);
    await expect(control, testId).toHaveText(label);
    await expect(control, testId).toHaveAttribute("href", `/stock-takes/counts/${target}`);
    expect(await control.evaluate((node) => node.tagName), testId).toBe("A");
    // A jump that HAS somewhere to go never announces itself disabled. That is the other
    // half of `CountJump`'s two states, and it is the half this file can prove: a
    // component that regressed to rendering the disabled `span` always would fail here.
    expect(await control.getAttribute("aria-disabled"), testId).toBeNull();
  }

  // The top of THIS FILE'S OWN sequence, with still nothing said about what is above it:
  // the approved count's *Previous count* is February's, which this file created.
  await page.goto(`/stock-takes/counts/${approvedId}`);
  const previous = page.getByTestId("previous-count");
  await expect(previous).toHaveText("Previous count");
  await expect(previous).toHaveAttribute("href", `/stock-takes/counts/${submittedId}`);
  expect(await previous.evaluate((node) => node.tagName)).toBe("A");
});

/* ------------------------------------------- AC-12, AC-13, AC-14, AC-15, the boundary */

test("AC-12, AC-13: for a draft, a submitted and an approved count, one body and no euro", async ({
  browser,
}) => {
  const price = await anyUnitPriceText();

  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  await signIn(staffPage, await newUser("YARD_STAFF"));

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, await newUser("ADMIN"));

  for (const countId of [draftId, submittedId, approvedId]) {
    for (const url of [
      `/stock-takes/counts/${countId}`,
      `/stock-takes/counts/${countId}?show=all`,
    ]) {
      const staffBody = await bodyOf(staffPage, url);
      const staffJumps = await jumpTargets(staffPage);
      const adminBody = await bodyOf(adminPage, url);
      const adminJumps = await jumpTargets(adminPage);

      // NO HYDRATION SEPARATOR IN EITHER BODY. A `<!-- -->` between two adjacent React
      // children is emitted by the server, and a normal hydration KEEPS it (all 246 on
      // `/summary`, in every clean load measured). It disappears only when React throws the
      // server's markup away and renders the page again on the client — minified #418,
      // whose cause `src/components/HydrationGate.tsx` removes — and a body that had been
      // regenerated is eight characters shorter per separator. This comparison caught an
      // eight-character difference, in both directions, before the sentence it came from
      // was made one string; that fits a regeneration on one side, and it was never
      // reproduced, so it is not proven. Asserting the absence keeps the equality below
      // independent of hydration either way.
      expect(staffBody, url).not.toContain("<!-- -->");
      expect(adminBody, url).not.toContain("<!-- -->");
      expect(adminBody.length, url).toBe(staffBody.length);

      // EVERY JUMP THIS FILE OWNS LEADS TO THE SAME COUNT FOR BOTH ROLES, asserted rather
      // than masked: the draft's *Next count* is February's, the submitted count sits
      // between the other two, and the approved one's *Previous count* is February's.
      const owned = ownNeighboursOf(countId);
      for (const [role, jumps] of [
        ["staff", staffJumps],
        ["admin", adminJumps],
      ] as const) {
        if (owned.previous !== undefined) {
          expect(jumps.previous, `${url} ${role}`).toBe(owned.previous);
        }
        if (owned.next !== undefined) expect(jumps.next, `${url} ${role}`).toBe(owned.next);
      }

      // THE BYTE COMPARISON KEEPS ITS CLAIM AND LOSES ONE DEPENDENCY. The two neighbours
      // this file does NOT own - the yard's count before the draft and its count after the
      // approved one - are chosen across the whole of the yard's history, so another
      // spec's rows move them between the staff reading and the administrator's. Cuids are
      // fixed width, so the length assertion above passed while this one failed: the
      // signature 010's eighth post-approval amendment records. Role-invariance is what is
      // claimed, and role-invariance is still compared byte for byte.
      expect(maskForeignNeighbours(adminBody, ownCounts()), url).toBe(
        maskForeignNeighbours(staffBody, ownCounts()),
      );

      for (const body of [staffBody, adminBody]) {
        expect(body, url).not.toContain("€");
        expect(body, url).not.toContain("No price");
        expect(body, url).not.toContain("unitPrice");
        if (price !== null) expect(body, url).not.toContain(price);
      }

      // The administrator's WHOLE response, not only the compared element: an approved
      // count has a real price snapshot on every line, and none of it reached this screen.
      const html = await adminPage.content();
      expect(html, url).not.toContain("€");
      expect(html, url).not.toContain("unitPrice");
      if (price !== null) expect(html, url).not.toContain(price);
    }
  }

  await staffContext.close();
  await adminContext.close();
});

test("AC-14: role cannot be influenced by a query, a header or a cookie", async ({ browser }) => {
  for (const role of ["YARD_STAFF", "ADMIN"] as const) {
    const other = role === "ADMIN" ? "YARD_STAFF" : "ADMIN";
    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, await newUser(role));

    const plain = await bodyOf(page, `/stock-takes/counts/${approvedId}`);
    const plainJumps = await jumpTargets(page);

    await context.addCookies([
      { name: "role", value: other, url: page.url().split("/stock-takes")[0] },
    ]);
    await page.setExtraHTTPHeaders({ "x-user-role": other });
    const spoofed = await bodyOf(page, `/stock-takes/counts/${approvedId}?role=${other}`);
    const spoofedJumps = await jumpTargets(page);

    // THE JUMP THIS FILE OWNS IS ASSERTED, NOT MASKED: the approved count's *Previous
    // count* is February's count, spoofed or not, and a vector that changed where this
    // page leads would be caught here rather than absorbed below.
    expect(plainJumps.previous, role).toBe(submittedId);
    expect(spoofedJumps.previous, role).toBe(submittedId);

    // THE MASK DROPS ONE VALUE AND KEEPS THE CLAIM, exactly as in AC-9 and AC-13 above.
    // The approved count's *Next count* is the whole yard's next count, chosen across
    // every year, so #11's 2103-2105 Dublin rows appearing or disappearing between these
    // two navigations changes it - identical lengths, one differing id, which is the
    // signature 010's eighth post-approval amendment records. What THIS criterion claims
    // is that a query parameter, a header and a cookie cannot move the role, and that
    // claim is still compared byte for byte. See 010's tenth amendment.
    expect(maskForeignNeighbours(spoofed, ownCounts()), role).toBe(
      maskForeignNeighbours(plain, ownCounts()),
    );

    await context.close();
  }
});

test("AC-15: one link into Stock Entry, the same for both roles, and nothing to /summary", async ({
  browser,
}) => {
  const staffContext = await browser.newContext();
  const staffPage = await staffContext.newPage();
  const staff = await newUser("YARD_STAFF");
  await signIn(staffPage, staff);

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  await signIn(adminPage, await newUser("ADMIN"));

  for (const page of [staffPage, adminPage]) {
    await page.goto(`/stock-takes/counts/${approvedId}`);

    const link = page.getByTestId("open-in-stock-entry");
    await expect(link).toHaveCount(1);
    await expect(link).toHaveText("Open this count in Stock Entry");
    await expect(link).toHaveAttribute("href", `/stock-entry/counts/${approvedId}`);

    for (const url of [
      `/stock-takes/counts/${approvedId}`,
      `/stock-takes/counts/${approvedId}?show=all`,
    ]) {
      await page.goto(url);
      const html = await page.content();
      expect(html, url).not.toContain("/summary");

      const beneath = await page.evaluate(
        (id) =>
          Array.from(document.querySelectorAll("a"))
            .map((anchor) => anchor.getAttribute("href") ?? "")
            .filter((href) => href.startsWith(`/stock-entry/counts/${id}/`)),
        approvedId,
      );
      expect(beneath, url).toEqual([]);
    }
  }

  // 009 AC-1 still holds unmodified: the euro is where #9 put it.
  const staffSummary = await staffPage.request.get(
    `/stock-entry/counts/${approvedId}/summary`,
    { maxRedirects: 0 },
  );
  expect(staffSummary.status()).toBe(307);
  expect(staffSummary.headers()["location"] ?? "").toContain("/stock-entry?denied=count-summary");

  const adminSummary = await adminPage.request.get(`/stock-entry/counts/${approvedId}/summary`);
  expect(adminSummary.status()).toBe(200);

  await staffContext.close();
  await adminContext.close();
});

/* ------------------------------------------------------- AC-16, the mode survives */

test("AC-16: badge, Show all items, Previous count, Back to the calendar — the scope rides", async ({
  page,
}) => {
  await signIn(page, await newUser());

  await page.goto(`/stock-takes?month=${Y}-02&yard=CLONMEL`);
  await page.locator(`[data-count-id="${clonmelId}"]`).click();
  await page.waitForURL(
    (url) =>
      url.pathname === `/stock-takes/counts/${clonmelId}` && url.search === "?yard=CLONMEL",
  );

  // Back to a Dublin count, where there is something to show.
  await page.goto(`/stock-takes/counts/${submittedId}?yard=CLONMEL`);
  await page.getByTestId("show-all-items").click();
  await page.waitForURL(
    (url) =>
      url.pathname === `/stock-takes/counts/${submittedId}` &&
      url.search === "?yard=CLONMEL&show=all",
  );

  await page.getByTestId("previous-count").click();
  await page.waitForURL(
    (url) =>
      url.pathname === `/stock-takes/counts/${draftId}` &&
      url.search === "?yard=CLONMEL&show=all",
  );
  // Still every row, because `show` travelled with the jump.
  await expect(page.getByTestId("history-line")).toHaveCount(shape.total);

  // *Back to the calendar* carries `yard` and NOT `show`: `show` means nothing to a
  // calendar.
  const back = page.getByTestId("back-to-calendar");
  await expect(back).toHaveAttribute("href", "/stock-takes?yard=CLONMEL");
  await back.click();
  await page.waitForURL((url) => url.pathname === "/stock-takes" && url.search === "?yard=CLONMEL");
  await expect(page.getByTestId("calendar")).toBeVisible();
});

/* -------------------------------------------------------------- AC-3, AC-18, AC-19 */

test("AC-3: reading a count writes nothing", async ({ page }) => {
  const before = await reservedCountTotals(YEAR);

  await signIn(page, await newUser("ADMIN"));
  for (const countId of [draftId, submittedId, approvedId]) {
    await page.goto(`/stock-takes/counts/${countId}`);
    await page.goto(`/stock-takes/counts/${countId}?show=all`);
  }

  expect(await reservedCountTotals(YEAR)).toEqual(before);
});

test("AC-18: the held toggle and the jumps work with the bundle disabled", async ({ browser }) => {
  const signedIn = await browser.newContext();
  const helper = await signedIn.newPage();
  await signIn(helper, await newUser());
  const session = await signedIn.storageState();
  await signedIn.close();

  const context = await browser.newContext({ javaScriptEnabled: false, storageState: session });
  const page = await context.newPage();

  await page.goto(`/stock-takes/counts/${draftId}`);
  await expect(page.getByTestId("history-line")).toHaveCount(shape.held);

  await page.getByTestId("show-all-items").click();
  await page.waitForLoadState("load");
  await expect(page.getByTestId("history-line")).toHaveCount(shape.total);

  await page.getByTestId("next-count").click();
  await page.waitForLoadState("load");
  await expect(page.getByTestId("history-yard")).toHaveText("Dublin");

  await page.getByTestId("back-to-calendar").click();
  await page.waitForLoadState("load");
  await expect(page.getByTestId("calendar")).toBeVisible();

  await context.close();
});

test("AC-19: the record never scrolls sideways at 390 px or 320 px, in either view", async ({
  browser,
}) => {
  // The longest description on the yard this count was taken at, so the measurement is
  // taken on the row AC-19 names rather than on whichever row happened to be widest.
  const longest = await longestDescription("DUBLIN");
  expect(longest.length).toBeGreaterThan(0);

  // AC-19 takes every measurement in BOTH sessions, the same shape as the AC-14 test above.
  // On this page the whole document sits inside `stock-takes-body`, so AC-13's byte equality
  // already makes the two sessions identical here - this repetition is cheap confirmation of
  // that, not the load-bearing measurement, which is the calendar's identity header.
  for (const role of ["YARD_STAFF", "ADMIN"] as const) {
    const signedIn = await browser.newContext();
    const helper = await signedIn.newPage();
    await signIn(helper, await newUser(role));
    const session = await signedIn.storageState();
    await signedIn.close();

    for (const width of [390, 320]) {
      const context = await browser.newContext({
        viewport: { width, height: 844 },
        storageState: session,
      });
      const page = await context.newPage();

      for (const url of [
        `/stock-takes/counts/${draftId}`,
        // The fuller state, on the count holding the longest description in the database and
        // a four-decimal quantity: 008 AC-30 recorded that the overflow appears here and not
        // in the default view.
        `/stock-takes/counts/${draftId}?show=all`,
      ]) {
        await page.goto(url);

        if (url.endsWith("show=all")) {
          await expect(page.getByText(longest, { exact: true }).first()).toHaveCount(1);
        }

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth, `${role} ${String(width)} ${url}`).toBeLessThanOrEqual(
          overflow.clientWidth,
        );
      }

      // Every control this page renders is a 44 px tap target.
      await page.goto(`/stock-takes/counts/${submittedId}`);
      for (const testId of [
        "previous-count",
        "next-count",
        "show-all-items",
        "open-in-stock-entry",
        "back-to-calendar",
      ]) {
        const box = await page.getByTestId(testId).boundingBox();
        expect(box?.width ?? 0, `${role} ${String(width)} ${testId}`).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0, `${role} ${String(width)} ${testId}`).toBeGreaterThanOrEqual(44);
      }

      await context.close();
    }
  }
});
