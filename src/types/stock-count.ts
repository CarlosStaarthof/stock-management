/**
 * Every shape feature #7 moves across a boundary, in one module that imports no runtime.
 *
 * IT LIVES HERE, AND AC-25 IS THE REASON. That criterion forbids the strings `SUBMITTED`
 * and `APPROVED` anywhere under `src/server/counts/**` or `src/app/stock-entry/**` — this
 * feature only ever creates a `DRAFT`, and a scan is what keeps that true rather than a
 * promise. The union has to be written down somewhere, so it is written down OUTSIDE both
 * scanned trees, following the precedent `src/types/item-master.ts` set in #6 for the same
 * kind of reason. Every branch on status in this feature is written `status !== "DRAFT"`,
 * never by naming the other two members.
 *
 * The second reason is the dependency rule: `src/lib/count-messages.ts` needs `Period` and
 * `CountStatus` to build its sentences, and `docs/architecture.md` forbids `src/lib/**`
 * from importing anything under `src/server/` except `@/server/errors`. A type module
 * under `src/types/` is reachable from `src/lib/`, `src/server/` and `src/app/` alike.
 */

/** The lifecycle of `specs/domain-model.md` Part 3. #9 owns every transition out of DRAFT. */
export type CountStatus = "DRAFT" | "SUBMITTED" | "APPROVED";

/** Declaration order, so a list of statuses always reads the same way. */
export const COUNT_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
] as const satisfies readonly CountStatus[];

/**
 * The month a count closes (Part 4). Not the day it was walked — that is `countDate`, and
 * the whole point of Part 4 is that the two are independent facts.
 */
export type Period = { periodYear: number; periodMonth: number };

/** One count, as it appears on a day of the calendar. */
export type CountBadge = {
  countId: string;
  /** `"DUBLIN"`. */
  locationCode: string;
  /** `"Dublin"`. */
  locationName: string;
  status: CountStatus;
  /** `"2026-09"` — the month it closes, which need not be the month it sits in. */
  periodKey: string;
};

/** `date` is `"YYYY-MM-DD"`. */
export type CalendarDay = { date: string; counts: CountBadge[] };

export type CalendarMonth = {
  /** `"2026-09"`. */
  monthKey: string;
  /** `"September 2026"`. */
  monthLabel: string;
  previousMonthKey: string;
  nextMonthKey: string;
  /** Today in the yard's zone, `"YYYY-MM-DD"` (AC-31). */
  todayKey: string;
  /** Every day of the month, ascending. Padding is the grid's business, not the data's. */
  days: CalendarDay[];
  countsInMonth: number;
  anyCountEver: boolean;
};

export type CountLineRow = {
  itemId: string;
  description: string;
  unitLabel: string | null;
  sortOrder: number;
  /**
   * A decimal STRING or null, never a JS number: `docs/architecture.md` § Money and
   * quantities, and `21.6128` tonnes is the reason. `null` is *not counted* — the
   * distinction the workbook's blank cell could not express (Invariant 5).
   */
  quantity: string | null;
};

export type CountForStaff = {
  countId: string;
  locationCode: string;
  locationName: string;
  /** `"2026-09"`. */
  periodKey: string;
  /** `"September 2026"`. */
  periodLabel: string;
  /** `"YYYY-MM-DD"`. */
  countDate: string;
  status: CountStatus;
  createdById: string;
  createdByName: string;
  lineCount: number;
  countedLineCount: number;
  uncountedLineCount: number;
  lines: CountLineRow[];
};

export type CountForAdmin = CountForStaff & {
  /** Items on this sheet with no `ItemPrice` in force. Invariant 4: their lines value at 0. */
  itemsWithoutPrice: number;
};

/** What `startCount` receives after `parseStartCountInput` has had it. */
export type StartCountInput = {
  locationCode: string;
  /** `"YYYY-MM-DD"`. */
  countDate: string;
  /** Derived by `periodForCountDate`, then possibly overridden by the user. */
  period: Period;
};

/** What a form hands the service: three strings, none of them trusted. */
export type StartCountRawInput = {
  locationCode: string | undefined;
  countDate: string | undefined;
  period: string | undefined;
};

/** A yard a count may be started at. No money, no sortOrder — the order is the array's. */
export type CountableYard = { code: string; name: string };

/** What `findCountForPeriod` answers with when this yard has already been counted. */
export type ExistingCount = {
  countId: string;
  status: CountStatus;
  /** `"YYYY-MM-DD"`. */
  countDate: string;
  createdByName: string;
};
