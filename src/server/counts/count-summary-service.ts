import { isDraft } from "@/lib/count-lifecycle";
import { COUNT_NO_LONGER_EXISTS } from "@/lib/count-messages";
import { multiplyDecimal, sumDecimals } from "@/lib/money";
import { assertUser } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { getLifecycleFacts, pricesInForceOn } from "@/server/counts/count-lifecycle-service";
import { countForRole } from "@/server/counts/count-shape";
import { formatPeriodKey, formatPeriodLabel } from "@/server/counts/period";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import { isoDateOf } from "@/server/items/price-selection";
import type {
  CountLifecycleFacts,
  CountStatus,
  Period,
  SubmitReviewForAdmin,
  SubmitReviewForStaff,
  SummaryRow,
  UncountedLine,
} from "@/types/stock-count";

/**
 * The two read-only surfaces of #9, and the whole of its money boundary.
 *
 * THREE SURFACES, THREE DIFFERENT ANSWERS, AND THE DIFFERENCE IS THE POINT
 * (`specs/domain-model.md` Part 6, 009 AC-21 and AC-22):
 *
 * | `getCount` (#7)      | both roles | unchanged by this feature; `itemsWithoutPrice` for an ADMIN |
 * | `getCountForSubmit`  | both roles | NO EURO FOR EITHER ROLE. An ADMIN also learns WHICH items have no price |
 * | `getCountSummary`    | ADMIN only | every euro in this feature, and a `ForbiddenError` for anybody else |
 *
 * `getCountSummary` RAISES rather than returning a reduced object, and the admin builder is
 * never called for a staff actor. There is no money-free thing this function could usefully
 * answer — that is `getCount`'s job, and it already exists.
 *
 * TYPESCRIPT DOES NOT PROTECT ANY OF THIS. #8 proved it twice: a `currentPrice` added to a
 * staff shape typechecked cleanly, exit 0, and only the key walks caught it. So every
 * guarantee here is asserted over a VALUE, never over a type (AC-34).
 *
 * IT READS AND NEVER WRITES. `count-lifecycle-service.ts` is the only writer in this
 * feature; nothing in this module calls `update`, `create`, `upsert` or `delete`.
 *
 * `ValuedLine` AND `CountSummaryForAdmin` ARE DECLARED HERE, not in `src/types/`, and that
 * is deliberate: they name the price snapshot column, and 009 AC-26 permits exactly two
 * files in the whole tree to name it. This is one of them. It is the layout #6 used for
 * `PriceRow` in `src/server/items/price-selection.ts`, for the same reason.
 */

/** One line of the ADMIN-only valued summary. */
export type ValuedLine = {
  itemId: string;
  description: string;
  unitLabel: string | null;
  quantity: string | null;
  /**
   * A decimal STRING or null. Null is Invariant 4: no `ItemPrice` was in force, the line
   * values at zero and says so.
   *
   * While the count is still a `DRAFT` no snapshot exists yet, so this carries the price
   * that submitting it right now WOULD write — the same `selectCurrentPrice` answer, from
   * the same day. From the moment it is submitted this is the stored column and nothing
   * else: no later price-list edit can move it (Invariant 2, AC-19).
   */
  unitPriceSnapshot: string | null;
  /** `quantity x (unitPriceSnapshot ?? 0)`, exact, computed on read (Invariant 1). */
  lineValue: string;
  noPrice: boolean;
};

/** ADMIN ONLY. `/summary` is a 307 for a staff session and this shape is never built. */
export type CountSummaryForAdmin = {
  countId: string;
  locationName: string;
  periodLabel: string;
  countDate: string;
  status: CountStatus;
  lines: ValuedLine[];
  /**
   * The sum of the EXACT line values, unrounded. Rendered as
   * `formatPriceExact(roundHalfUp(total, 2))`; stored nowhere, ever (Invariant 1).
   *
   * NOT the sum of the rounded lines (Invariant 10, Open question 3): four Clonmel prices
   * are non-terminating workbook formulas, and a stock system that disagrees with the file
   * it replaced by any amount will not be trusted. The stated cost is that the rendered
   * column may not add to the rendered total to the last cent, and the total is right.
   */
  countTotal: string;
  itemsWithoutPrice: number;
  linesWithoutPrice: { itemId: string; description: string }[];
  lifecycle: CountLifecycleFacts;
};

/** A count's lines with everything both surfaces need, already in sheet order. */
type CountRead = {
  countId: string;
  locationName: string;
  period: Period;
  countDate: string;
  status: CountStatus;
  lines: {
    itemId: string;
    description: string;
    unitLabel: string | null;
    quantity: string | null;
    snapshot: string | null;
  }[];
};

/**
 * One count, its lines and its sheet order.
 *
 * The comparator is `ItemLocation.sortOrder` then `description` — the same one the yard
 * sheet and `getCount` use, so all three reproduce the sheet element for element and the
 * uncounted list is in the order a person walks the yard (AC-4).
 */
async function readCount(countId: string): Promise<CountRead> {
  const row = await db.stockCount.findUnique({
    where: { id: countId },
    select: {
      id: true,
      periodYear: true,
      periodMonth: true,
      countDate: true,
      status: true,
      location: { select: { id: true, name: true } },
      lines: {
        select: {
          itemId: true,
          quantity: true,
          unitPriceSnapshot: true,
          item: { select: { description: true, unitLabel: true } },
        },
      },
    },
  });

  if (row === null) throw new NotFoundError(COUNT_NO_LONGER_EXISTS);

  const links = await db.itemLocation.findMany({
    where: { locationId: row.location.id, itemId: { in: row.lines.map((line) => line.itemId) } },
    select: { itemId: true, sortOrder: true },
  });
  const sortOrders = new Map(links.map((link) => [link.itemId, link.sortOrder]));

  const lines = row.lines
    .map((line) => ({
      itemId: line.itemId,
      description: line.item.description,
      unitLabel: line.item.unitLabel,
      // Decimal STRINGS, never JS numbers: the workbook holds `21.6128` tonnes and
      // `6.11764706` euro (docs/architecture.md, Money and quantities).
      quantity: line.quantity === null ? null : line.quantity.toString(),
      snapshot: line.unitPriceSnapshot === null ? null : line.unitPriceSnapshot.toString(),
      // A line whose link was unassigned after the count started has no position left on
      // the sheet; it sorts to the end rather than to the top, where a 0 would put it.
      sortOrder: sortOrders.get(line.itemId) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.description.localeCompare(right.description),
    )
    // The sheet position has done its job; it is not a fact either surface carries.
    .map((line) => ({
      itemId: line.itemId,
      description: line.description,
      unitLabel: line.unitLabel,
      quantity: line.quantity,
      snapshot: line.snapshot,
    }));

  return {
    countId: row.id,
    locationName: row.location.name,
    period: { periodYear: row.periodYear, periodMonth: row.periodMonth },
    countDate: isoDateOf(row.countDate),
    status: row.status as CountStatus,
    lines,
  };
}

/**
 * The price each line is valued at, in ONE place for both surfaces.
 *
 * Past `DRAFT` it is the stored snapshot and nothing else — that is Invariant 2, and it is
 * why editing a supplier price tomorrow cannot change what last month's stock was worth.
 * While the count is still a `DRAFT` there is no snapshot to read, so the answer is what
 * submitting it now would write: the same function, the same day, so the warning an ADMIN
 * sees before submitting names the same items as the tags they see after it (AC-12).
 */
async function priceByItem(count: CountRead): Promise<Map<string, string>> {
  if (!isDraft(count.status)) {
    return new Map(
      count.lines
        .filter((line): line is typeof line & { snapshot: string } => line.snapshot !== null)
        .map((line) => [line.itemId, line.snapshot]),
    );
  }

  return pricesInForceOn(
    count.lines.map((line) => line.itemId),
    count.countDate,
  );
}

/** The lines with no price, named. A warning that names the items is actionable. */
function linesWithoutPriceIn(
  count: CountRead,
  prices: ReadonlyMap<string, string>,
): { itemId: string; description: string }[] {
  return count.lines
    .filter((line) => !prices.has(line.itemId))
    .map((line) => ({ itemId: line.itemId, description: line.description }));
}

/* --------------------------------------------------------------- the submit review */

/**
 * The review-and-sign screen's data, for either role.
 *
 * IT TAKES AN ACTOR AND A COUNT ID AND NOTHING ELSE — no filter, no query parameter, no
 * page state. #8's three filters hide rows on purpose, and a counter who has filtered to
 * one supplier and counted every visible row has finished nothing: this function always
 * reads the WHOLE count, so the blocked list is identical with a filter and without one
 * (AC-4). That is also why #8's "a parameter that is not one of the three is ignored"
 * stays literally true — this feature adds no fourth parameter anywhere.
 */
export async function getCountForSubmit(
  actor: SessionUser | null,
  countId: string,
): Promise<SubmitReviewForStaff | SubmitReviewForAdmin> {
  const user = assertUser(actor);

  const count = await readCount(countId);
  const lifecycle = await getLifecycleFacts(user, countId);

  const uncounted: UncountedLine[] = count.lines
    .filter((line) => line.quantity === null)
    .map((line) => ({
      itemId: line.itemId,
      description: line.description,
      unitLabel: line.unitLabel,
    }));

  const countedLineCount = count.lines.length - uncounted.length;

  const forStaff: SubmitReviewForStaff = {
    countId: count.countId,
    locationName: count.locationName,
    periodKey: formatPeriodKey(count.period),
    periodLabel: formatPeriodLabel(count.period),
    countDate: count.countDate,
    status: count.status,
    lineCount: count.lines.length,
    countedLineCount,
    uncountedLineCount: uncounted.length,
    uncounted,
    lifecycle,
  };

  return countForRole(
    user,
    // No euro, no `No price`, no count of either: Part 6's "one version of the screen, not
    // two" holds because the ADMIN's extra is a LIST OF ITEM NAMES, not a figure.
    async () => forStaff,
    async (): Promise<SubmitReviewForAdmin> => {
      const linesWithoutPrice = linesWithoutPriceIn(count, await priceByItem(count));

      return {
        ...forStaff,
        itemsWithoutPrice: linesWithoutPrice.length,
        linesWithoutPrice,
      };
    },
  );
}

/* -------------------------------------------------------------- the valued summary */

/**
 * The ADMIN-only valued summary: a price, a value, a tag and a total.
 *
 * THE STAFF BRANCH THROWS, AND THE ADMIN BUILDER IS NEVER CALLED FOR A STAFF ACTOR — both
 * thunks go to `countForRole`, which chooses from `actor.role` and from nothing a client
 * can set (AC-22, AC-27). The refusal carries the same sentence 006 AC-4 pinned for the
 * seventeen item-master mutations, because one refusal spelled two ways is two refusals.
 */
export async function getCountSummary(
  actor: SessionUser | null,
  countId: string,
): Promise<CountSummaryForAdmin> {
  const user = assertUser(actor);

  return countForRole(
    user,
    (): never => {
      throw new ForbiddenError("ADMIN is required for this action");
    },
    async (): Promise<CountSummaryForAdmin> => {
      const count = await readCount(countId);
      const lifecycle = await getLifecycleFacts(user, countId);
      const prices = await priceByItem(count);

      const lines: ValuedLine[] = count.lines.map((line) => {
        const price = prices.get(line.itemId) ?? null;

        return {
          itemId: line.itemId,
          description: line.description,
          unitLabel: line.unitLabel,
          quantity: line.quantity,
          unitPriceSnapshot: price,
          // Invariant 4: no price means zero, exactly and visibly — never silently.
          lineValue: multiplyDecimal(line.quantity ?? "0", price ?? "0"),
          noPrice: price === null,
        };
      });

      const linesWithoutPrice = linesWithoutPriceIn(count, prices);

      return {
        countId: count.countId,
        locationName: count.locationName,
        periodLabel: formatPeriodLabel(count.period),
        countDate: count.countDate,
        status: count.status,
        lines,
        // Summed EXACT and rounded once, by the screen, for display only.
        countTotal: sumDecimals(lines.map((line) => line.lineValue)),
        itemsWithoutPrice: linesWithoutPrice.length,
        linesWithoutPrice,
        lifecycle,
      };
    },
  );
}

/* ------------------------------------------------------- the screen's half of the row */

/**
 * THE ONE MAPPER, AND WHY IT EXISTS AT ALL (009 AC-26).
 *
 * `ValuedLine` names `unitPriceSnapshot`, because it IS that column read back. 009 AC-26
 * permits exactly two files in the tree to name it, and keeps the `src/app/**` and
 * `src/components/**` half of 006 AC-31's list at the three item-master files — so a page
 * that wrote `line.unitPriceSnapshot` would turn that half red. The criterion's own
 * sentence is that "this feature's screens render a price without naming the column,
 * because the value crosses the boundary on a field the shape declares": this function is
 * that field. It renames one key and copies six, here, in a file that may say both words.
 *
 * It is PURE and it is a projection, not a second computation: `lineValue` is the exact
 * string `getCountSummary` already derived, and nothing is rounded, summed or formatted.
 */
export function summaryRows(summary: CountSummaryForAdmin): SummaryRow[] {
  return summary.lines.map((line) => ({
    itemId: line.itemId,
    description: line.description,
    unitLabel: line.unitLabel,
    quantity: line.quantity,
    unitAmount: line.unitPriceSnapshot,
    lineValue: line.lineValue,
    noPrice: line.noPrice,
  }));
}
