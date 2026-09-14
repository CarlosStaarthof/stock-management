import { assertUser } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { getCount } from "@/server/counts/count-service";
import { formatPeriodKey, monthKeyOf, parseCountDate } from "@/server/counts/period";
import { db } from "@/server/db";
import { isoDateOf } from "@/server/items/price-selection";
import type {
  CountCursor,
  CountHistoryLine,
  CountHistoryView,
  CountNeighbours,
  CountRef,
  CountStatus,
  YardScope,
} from "@/types/stock-count";

/**
 * Reading a stock take back as a RECORD — what was counted, at which yard, and when.
 *
 * FOUR RULES THIS MODULE ENCODES, each with a criterion rather than a comment keeping it
 * true.
 *
 *  1. THE ACTOR IS THE SESSION. Both exported functions take an explicit `actor` and begin
 *     with `assertUser(actor)`. It comes from `requireUserPage()` and from nowhere else
 *     (AC-3). There is no role refusal here: `specs/domain-model.md` Part 6 gives both
 *     roles the calendar and the count view.
 *  2. THIS MODULE WRITES NOTHING, ANYWHERE. No `create`, `update`, `upsert`, `delete` or
 *     `deleteMany`, on any model (AC-3). It reads two things and that is all it does.
 *  3. NO MONEY REACHES A CALLER, FOR EITHER ROLE (AC-12). `getCountHistory` is a MAPPER
 *     over `getCount`, field by field and never a spread, so an administrator's
 *     `itemsWithoutPrice` — a key that matches `/price/i` — is dropped HERE, in the
 *     service. That is #9's rule applied where the boundary actually is: when a shape's key
 *     would be a forbidden string, the boundary is crossed by a mapper in the service, not
 *     by a scan exemption for the screen. The stated cost is one query whose answer is
 *     thrown away for an administrator; the alternative is a second definition of "a count's
 *     lines", which is what 006 AC-24 exists to prevent.
 *  4. THERE IS NO ROLE BRANCH IN THIS FILE, and AC-13 scans for the absence of one: no
 *     role name, no role field, no role-shaped chooser appears below, because there is
 *     nothing here one role may have and the other may not. One shape, both roles, deeply
 *     equal values. The one place a role is consulted is inside `getCount`, and the mapper
 *     below is what discards what it did with it.
 *
 * A HISTORICAL COUNT IS READ FROM ITS OWN LINES, NEVER FROM TODAY'S SHEET. The yard-sheet
 * reader of 006 AC-24 is not called here — and cannot be: 008 AC-3 bans its name outright
 * from every shipping module in this tree. A sheet is what a yard stocks NOW; a count is
 * what a yard held THEN. An item archived since the count must still appear in it, which is
 * what `getCount` already does and what AC-8 pins.
 */

/** A `@db.Date` column is stored at UTC midnight; `YYYY-MM-DD` is the whole of it. */
function asDateColumn(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/**
 * One count, read only: item, quantity, unit — Part 6's row, and nothing more (AC-8).
 *
 * EVERY LINE COMES BACK, in sheet order, including the ones holding nothing. The held view
 * is a pure predicate applied afterwards by `src/lib/held.ts`, so the page can say *35 of
 * 82 items are not held and are hidden.* without a second read, and so `?show=all` is a
 * link rather than a query (AC-9).
 *
 * `quantity` crosses as the decimal STRING `getCount` produced, never rounded and never a
 * JavaScript number. `null` is *nobody looked* and `"0"` is *counted, none held*: keeping
 * those two apart is the whole of Invariant 5, and it has to survive a read as well as a
 * write.
 *
 * A `countId` that does not exist raises `NotFoundError` carrying `COUNT_NO_LONGER_EXISTS`,
 * because `getCount` does; the page renders that sentence and a way back, and does not
 * throw (AC-8, AC-17). No Prisma or Postgres string can reach a screen through here.
 */
export async function getCountHistory(
  actor: SessionUser,
  countId: string,
): Promise<CountHistoryView> {
  const user = assertUser(actor);

  const count = await getCount(user, countId);

  // FIELD BY FIELD, NEVER A SPREAD. A spread would carry `itemsWithoutPrice` for an
  // administrator and `createdById` for everybody, and would carry whatever a later feature adds
  // to `CountForStaff`. This list is the money boundary, written out (AC-12, AC-13).
  const lines: CountHistoryLine[] = count.lines.map((line) => ({
    itemId: line.itemId,
    description: line.description,
    unitLabel: line.unitLabel,
    quantity: line.quantity,
    sortOrder: line.sortOrder,
  }));

  return {
    countId: count.countId,
    locationCode: count.locationCode,
    locationName: count.locationName,
    periodKey: count.periodKey,
    periodLabel: count.periodLabel,
    countDate: count.countDate,
    status: count.status,
    countedByName: count.createdByName,
    lineCount: count.lineCount,
    uncountedLineCount: count.uncountedLineCount,
    lines,
  };
}

/* ------------------------------------------------------------------- the two jumps */

/** The yards a scope covers. `BOTH` is both of them, and a named yard is itself. */
function yardCodesIn(scope: YardScope): string[] {
  return scope === "BOTH" ? ["DUBLIN", "CLONMEL"] : [scope];
}

/** The columns a jump target needs, and no others. */
const NEIGHBOUR_SELECT = {
  id: true,
  countDate: true,
  status: true,
  periodYear: true,
  periodMonth: true,
  location: { select: { code: true, name: true } },
} as const;

type NeighbourRow = {
  id: string;
  countDate: Date;
  status: string;
  periodYear: number;
  periodMonth: number;
  location: { code: string; name: string };
};

/**
 * A row as a jump target. `monthKey` is the month the count SITS in and `periodKey` is the
 * month it CLOSES, and they are different facts: 007 AC-20 places a count dated
 * `2026-10-01` closing `2026-09` in OCTOBER's grid, so a calendar jump that moved by period
 * would land the reader on a month the count is not drawn in.
 */
function asCountRef(row: NeighbourRow): CountRef {
  const countDate = isoDateOf(row.countDate);

  return {
    countId: row.id,
    locationCode: row.location.code,
    locationName: row.location.name,
    countDate,
    monthKey: monthKeyOf(countDate),
    periodKey: formatPeriodKey({ periodYear: row.periodYear, periodMonth: row.periodMonth }),
    status: row.status as CountStatus,
  };
}

/**
 * The nearest count strictly before and strictly after a cursor, within a scope (AC-11).
 *
 * THE ORDERING IS `(countDate, id)` ASCENDING, AND `id` IS WHAT MAKES IT TOTAL. Two counts
 * at one yard can share a `countDate` — `@@unique([locationId, periodYear, periodMonth])`
 * permits September and October both walked on 1 October — so an ordering on `countDate`
 * alone is not deterministic. `id` is unique, so the pair always is. Neither count is ever
 * its own neighbour, and each is reachable from the other exactly once.
 *
 * TWO CURSORS, ONE FUNCTION. On the DETAIL the cursor is a count: `{ date, countId }`, and
 * the scope is that count's OWN yard whatever `?yard` says — Clonmel's stock is different
 * stock, and putting it next in a sequence a person is reading as one yard's history would
 * invite exactly the comparison Part 4 forbids. On the CALENDAR the cursor is a day with no
 * count on it: `{ date, countId: null }`, and the caller asks twice — with the month's
 * first day for `previous` and with its last day for `next` — because the month, not a
 * count, is what the reader is standing on. Skipping the empty months falls out of that:
 * the workbook has no July or August 2025 at all.
 *
 * The date is parsed with `parseCountDate`, so a cursor that is not a real calendar day is
 * a typed `ValidationError` naming `countDate` rather than an `Invalid Date` reaching
 * Postgres (AC-17).
 */
export async function findNeighbourCounts(
  actor: SessionUser,
  scope: YardScope,
  cursor: CountCursor,
): Promise<CountNeighbours> {
  assertUser(actor);

  const date = parseCountDate(cursor.date);
  const at = asDateColumn(date);
  const inScope = { location: { code: { in: yardCodesIn(scope) } } };

  // `(countDate, id) < (date, countId)`, written as the two cases Prisma can express. With
  // no `countId` the cursor sits between days, so only the first case applies.
  const before =
    cursor.countId === null
      ? [{ countDate: { lt: at } }]
      : [{ countDate: { lt: at } }, { countDate: at, id: { lt: cursor.countId } }];

  const after =
    cursor.countId === null
      ? [{ countDate: { gt: at } }]
      : [{ countDate: { gt: at } }, { countDate: at, id: { gt: cursor.countId } }];

  const [previous, next] = await Promise.all([
    db.stockCount.findFirst({
      where: { ...inScope, OR: before },
      orderBy: [{ countDate: "desc" }, { id: "desc" }],
      select: NEIGHBOUR_SELECT,
    }),
    db.stockCount.findFirst({
      where: { ...inScope, OR: after },
      orderBy: [{ countDate: "asc" }, { id: "asc" }],
      select: NEIGHBOUR_SELECT,
    }),
  ]);

  return {
    previous: previous === null ? null : asCountRef(previous),
    next: next === null ? null : asCountRef(next),
  };
}
