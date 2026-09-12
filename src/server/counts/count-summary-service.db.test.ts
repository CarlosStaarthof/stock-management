import { beforeEach, describe, expect, it } from "vitest";

import { COUNT_NO_LONGER_EXISTS, itemsWithoutPriceMessage } from "@/lib/count-messages";
import { formatPriceExact, roundHalfUp } from "@/lib/money";
import { assertNoMoneyKeys, moneyKeysIn } from "@/lib/money-boundary";
import type { SessionUser } from "@/server/auth/session-user";
import { submitCount } from "@/server/counts/count-lifecycle-service";
import { getCount } from "@/server/counts/count-service";
import {
  type CountSummaryForAdmin,
  getCountForSubmit,
  getCountSummary,
} from "@/server/counts/count-summary-service";
import { startCount } from "@/server/counts/count-service";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/server/errors";
import { resetTestDb } from "@/server/test-db";
import type { SubmitReviewForAdmin } from "@/types/stock-count";

import { actorFor } from "../../../tests/support/count-fixture";
import {
  DUBLIN_ID,
  fixtureId,
  makeItemType,
  makeItemsBulk,
  makeLinksBulk,
  makePricesBulk,
  makeSupplier,
} from "../../../tests/support/item-master-fixture";

/**
 * Spec 009's money boundary, at Level 2 (`docs/verification.md` 3b): the walk runs on
 * THREE surfaces with THREE different expected answers, all of them EXACT SETS — so a
 * seventh money-shaped key turns a test red rather than reaching a page.
 *
 * TYPESCRIPT DOES NOT PROTECT ANY OF THIS, which #8 proved twice with `typecheck` exit 0.
 * Every assertion here is over a VALUE returned by a service, never over a type.
 */
beforeEach(async () => {
  await resetTestDb();
});

const SIGNATURE = "M 10 10 L 20 20 L 30 40";
const COUNT_DATE = "2026-06-15";
const PERIOD = "2026-06";

type Line = { quantity: string | null; price: string | null };

type Fixture = {
  countId: string;
  itemIds: string[];
  staff: SessionUser;
  admin: SessionUser;
};

/**
 * A count of exactly these lines: a quantity each, and a price or none.
 *
 * The five-line case is AC-25's fixture, whose total is computed by hand in the criterion
 * and asserted here as a literal string.
 */
async function seedCount(lines: readonly Line[]): Promise<Fixture> {
  const typeId = await makeItemType("BEADS", 1, "Beads");
  const supplierId = await makeSupplier("Kelly");

  const itemIds = lines.map((_line, index) => fixtureId("item", index));
  await makeItemsBulk(
    itemIds.map((id, index) => ({
      id,
      description: `Item ${String(index).padStart(3, "0")}`,
      itemTypeId: typeId,
      supplierId,
      unitLabel: index === 0 ? null : "20 Kg",
    })),
  );
  await makeLinksBulk(
    itemIds.map((itemId, index) => ({ itemId, locationId: DUBLIN_ID, sortOrder: 3 + index })),
  );
  await makePricesBulk(
    lines
      .map((line, index) => ({ line, itemId: itemIds[index] }))
      .filter((entry): entry is { line: Line & { price: string }; itemId: string } =>
        entry.line.price !== null,
      )
      .map((entry) => ({
        itemId: entry.itemId,
        amount: entry.line.price,
        effectiveFrom: "2025-01-01",
      })),
  );

  const staff = await actorFor("YARD_STAFF", "Jo Byrne");
  const admin = await actorFor("ADMIN", "Ann Doyle");

  const countId = await startCount(staff, {
    locationCode: "DUBLIN",
    countDate: COUNT_DATE,
    period: PERIOD,
  });

  for (const [index, line] of lines.entries()) {
    await db.stockCountLine.updateMany({
      where: { stockCountId: countId, itemId: itemIds[index] },
      data: { quantity: line.quantity },
    });
  }

  return { countId, itemIds, staff, admin };
}

/** docs/verification.md Level 3's own figure, and the four that follow it (AC-25). */
const AC25_LINES: Line[] = [
  { quantity: "890", price: "9.83" },
  { quantity: "21.6128", price: "6.11764706" },
  { quantity: "0.475", price: "33.09" },
  { quantity: "0", price: "45" },
  { quantity: "7", price: null },
];

/* ------------------------------------------------------------------------- AC-2 */

describe("AC-2: both read surfaces take an explicit actor", () => {
  it("AC-2: a null actor is refused by each of them", async () => {
    const { countId } = await seedCount(AC25_LINES);

    await expect(getCountForSubmit(null, countId)).rejects.toThrow(UnauthorizedError);
    await expect(getCountSummary(null, countId)).rejects.toThrow(UnauthorizedError);
  });

  it("AC-29: a countId that does not exist is a NotFoundError with this feature's sentence", async () => {
    const { admin } = await seedCount([{ quantity: "1", price: "2" }]);

    const missing = await getCountSummary(admin, "count_that_never_was").catch(
      (error: unknown) => error,
    );
    expect(missing).toBeInstanceOf(NotFoundError);
    expect((missing as Error).message).toBe(COUNT_NO_LONGER_EXISTS);

    await expect(getCountForSubmit(admin, "count_that_never_was")).rejects.toThrow(
      COUNT_NO_LONGER_EXISTS,
    );
  });
});

/* ------------------------------------------------------------------------- AC-4 */

describe("AC-4: the way from blocked to submittable", () => {
  it("AC-4: every uncounted line is listed, in sheet order, never truncated", async () => {
    const lines: Line[] = Array.from({ length: 82 }, (_unused, index) => ({
      quantity: index < 12 ? null : "5",
      price: "10",
    }));
    const { countId, itemIds, staff } = await seedCount(lines);

    const review = await getCountForSubmit(staff, countId);

    expect(review.lineCount).toBe(82);
    expect(review.countedLineCount).toBe(70);
    expect(review.uncountedLineCount).toBe(12);
    expect(review.uncounted).toHaveLength(12);
    expect(review.uncounted.map((line) => line.itemId)).toEqual(itemIds.slice(0, 12));
    expect(review.uncounted[0].description).toBe("Item 000");
    // The first item has no unit label; the screen renders `No unit` for it.
    expect(review.uncounted[0].unitLabel).toBeNull();
    expect(review.uncounted[1].unitLabel).toBe("20 Kg");
  });

  it("AC-4: it reads no query parameter — its signature is the actor and the count id", () => {
    // Two parameters, so a filter cannot reach it and the blocked list cannot be filtered.
    expect(getCountForSubmit).toHaveLength(2);
    expect(getCountSummary).toHaveLength(2);
  });

  it("AC-4: a fully counted count renders no blocked list at all, not an empty one", async () => {
    const { countId, staff } = await seedCount(AC25_LINES);

    const review = await getCountForSubmit(staff, countId);

    expect(review.uncounted).toEqual([]);
    expect(review.uncountedLineCount).toBe(0);
    expect(review.countedLineCount).toBe(5);
  });
});

/* ---------------------------------------------------------------- AC-12, AC-25 */

describe("AC-25: the ADMIN summary, against a fixture whose total is computed by hand", () => {
  it("AC-25: five line values and one total, each asserted as a literal string", async () => {
    const { countId, staff, admin } = await seedCount(AC25_LINES);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const summary = await getCountSummary(admin, countId);

    expect(summary.lines.map((line) => line.lineValue)).toEqual([
      "8748.7",
      "132.219482378368",
      "15.71775",
      "0",
      "0",
    ]);
    expect(summary.countTotal).toBe("8896.637232378368");

    // Rendered rounded, once, at the boundary - and stored nowhere.
    expect(formatPriceExact(roundHalfUp(summary.countTotal, 2))).toBe("€8,896.64");
  });

  it("AC-25: the total is the sum of the EXACT lines, not the sum of the rounded ones", async () => {
    const { countId, staff, admin } = await seedCount([
      { quantity: "1", price: "0.005" },
      { quantity: "1", price: "0.005" },
      { quantity: "1", price: "0.005" },
    ]);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const summary = await getCountSummary(admin, countId);

    const sumOfRounded = summary.lines
      .map((line) => roundHalfUp(line.lineValue, 2))
      .reduce((running, value) => `${Number.parseFloat(running) + Number.parseFloat(value)}`, "0");

    expect(summary.countTotal).toBe("0.015");
    expect(roundHalfUp(summary.countTotal, 2)).toBe("0.02");
    // The stated cost of Invariant 10, asserted rather than hidden: the column does not add
    // up to the total, and the total is the figure that agrees with the workbook.
    expect(sumOfRounded).toBe("0.03");
  });

  it("AC-12: Invariant 4 on the summary — no price, zero value, named and tagged", async () => {
    const lines: Line[] = Array.from({ length: 82 }, (_unused, index) => ({
      quantity: "4",
      price: index >= 79 ? null : "10",
    }));
    const { countId, itemIds, staff, admin } = await seedCount(lines);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const summary = await getCountSummary(admin, countId);

    const tagged = summary.lines.filter((line) => line.noPrice);
    expect(tagged.map((line) => line.itemId)).toEqual(itemIds.slice(79));
    for (const line of tagged) {
      expect(line.unitPriceSnapshot).toBeNull();
      expect(line.lineValue).toBe("0");
    }

    expect(summary.itemsWithoutPrice).toBe(3);
    expect(summary.linesWithoutPrice.map((line) => line.itemId)).toEqual(itemIds.slice(79));
    expect(summary.linesWithoutPrice[0].description).toBe("Item 079");

    // 79 lines at 4 x 10.
    expect(summary.countTotal).toBe("3160");
  });

  it("AC-12: before submission the ADMIN review names the same items, and staff gets neither", async () => {
    const lines: Line[] = Array.from({ length: 10 }, (_unused, index) => ({
      quantity: "4",
      price: index >= 7 ? null : "10",
    }));
    const { countId, itemIds, staff, admin } = await seedCount(lines);

    const forAdmin = (await getCountForSubmit(admin, countId)) as SubmitReviewForAdmin;
    expect(forAdmin.itemsWithoutPrice).toBe(3);
    expect(forAdmin.linesWithoutPrice.map((line) => line.itemId)).toEqual(itemIds.slice(7));
    expect(itemsWithoutPriceMessage(forAdmin.itemsWithoutPrice)).toContain("3 items on this sheet");

    const forStaff = await getCountForSubmit(staff, countId);
    expect(forStaff).not.toHaveProperty("itemsWithoutPrice");
    expect(forStaff).not.toHaveProperty("linesWithoutPrice");
  });

  it("AC-29: a count with no priced lines at all totals zero and tags every row", async () => {
    const { countId, staff, admin } = await seedCount([
      { quantity: "4", price: null },
      { quantity: "9", price: null },
    ]);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const summary = await getCountSummary(admin, countId);

    expect(summary.lines.every((line) => line.noPrice)).toBe(true);
    expect(summary.countTotal).toBe("0");
    expect(formatPriceExact(roundHalfUp(summary.countTotal, 2))).toBe("€0.00");
  });

  it("AC-11: the summary shows the SNAPSHOT, so a later price edit cannot move a value", async () => {
    const { countId, itemIds, staff, admin } = await seedCount([{ quantity: "10", price: "3" }]);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const before = await getCountSummary(admin, countId);
    expect(before.countTotal).toBe("30");

    await makePricesBulk([{ itemId: itemIds[0], amount: "99", effectiveFrom: "2025-06-01" }]);

    const after = await getCountSummary(admin, countId);
    expect(after.countTotal).toBe("30");
    expect(after.lines[0].unitPriceSnapshot).toBe("3");
  });
});

/* ---------------------------------------------------------------- AC-21, AC-22 */

describe("AC-21: the money-key walk, on both shared surfaces", () => {
  it("AC-21: a YARD_STAFF actor is sent NO money key at any depth, on any of the three", async () => {
    // One line left uncounted on purpose, so the walk really descends into `uncounted[]`
    // and into `lines[]` rather than over two short objects.
    const { countId, staff } = await seedCount([
      { quantity: null, price: "9.83" },
      ...AC25_LINES.slice(1),
    ]);

    const count = await getCount(staff, countId);
    const review = await getCountForSubmit(staff, countId);
    const facts = review.lifecycle;

    assertNoMoneyKeys(count, "getCount(staff)");
    assertNoMoneyKeys(review, "getCountForSubmit(staff)");
    assertNoMoneyKeys(facts, "getLifecycleFacts(staff)");

    // Non-vacuity: the walk really did descend into the arrays.
    expect(JSON.stringify(review)).toContain("Item 000");
  });

  it("AC-21: for an ADMIN, getCount still reports EXACTLY itemsWithoutPrice (007 AC-17)", async () => {
    const { countId, admin } = await seedCount(AC25_LINES);

    expect(moneyKeysIn(await getCount(admin, countId))).toEqual(["itemsWithoutPrice"]);
  });

  it("AC-21: for an ADMIN, getCountForSubmit reports exactly the set of two", async () => {
    const { countId, admin } = await seedCount(AC25_LINES);

    const offenders = moneyKeysIn(await getCountForSubmit(admin, countId));

    expect(new Set(offenders)).toEqual(new Set(["itemsWithoutPrice", "linesWithoutPrice"]));
    expect(offenders).toHaveLength(2);
  });

  it("AC-21: getLifecycleFacts returns ONE shape — the two roles are deeply equal", async () => {
    const { countId, staff, admin } = await seedCount(AC25_LINES);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const forStaff = (await getCountForSubmit(staff, countId)).lifecycle;
    const forAdmin = (await getCountForSubmit(admin, countId)).lifecycle;

    expect(forStaff).toEqual(forAdmin);
    expect(forStaff.signaturePath).toBe(SIGNATURE);
    assertNoMoneyKeys(forStaff, "lifecycle");
  });
});

describe("AC-22: the euro lives on exactly one surface", () => {
  it("AC-22: a staff actor is refused, with the sentence 006 AC-4 pinned", async () => {
    const { countId, staff } = await seedCount(AC25_LINES);

    const refusal = await getCountSummary(staff, countId).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ForbiddenError);
    expect((refusal as Error).message).toBe("ADMIN is required for this action");
  });

  it("AC-22: the ADMIN summary's money keys are EXACTLY the six the criterion names", async () => {
    const { countId, staff, admin } = await seedCount(AC25_LINES);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const summary: CountSummaryForAdmin = await getCountSummary(admin, countId);

    // As a SET, so a seventh money-shaped key turns this red wherever it is added.
    expect(new Set(moneyKeysIn(summary))).toEqual(
      new Set([
        "itemsWithoutPrice",
        "linesWithoutPrice",
        "unitPriceSnapshot",
        "lineValue",
        "countTotal",
        "noPrice",
      ]),
    );
  });
});
