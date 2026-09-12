import {
  CLEAR_FILTERS as ITEM_MASTER_CLEAR_FILTERS,
  NO_SUPPLIER as ITEM_MASTER_NO_SUPPLIER,
  NO_UNIT as ITEM_MASTER_NO_UNIT,
  locationNotFound,
} from "@/lib/item-master-messages";
import type { CountStatus, Period } from "@/types/stock-count";

/**
 * Every user-facing literal specs 007 and 008 quote, in one module.
 *
 * AC-26: the screen and the test read the SAME literal, so they cannot drift apart — a
 * message that exists twice is a message that will one day exist in two spellings.
 * `src/lib/auth-messages.ts` is #3's version of this and `src/lib/item-master-messages.ts`
 * is #6's.
 *
 * It imports nothing from `src/server/` (AC-26 keeps the lint fence of 006 AC-33 green),
 * and it names no price column at all: AC-15 keeps the whole of `src/lib/**` at zero files
 * naming the one 006 AC-31 guards, which is why this comment does not spell it either.
 * `itemsWithoutPriceMessage` counts ITEMS, not euros.
 *
 * The month and day formatters live here rather than in `src/server/counts/period.ts`
 * because `September 2026` and `1 September 2026` are literals two criteria quote, and
 * because `src/lib/calendar-month.ts` needs them too — and `src/lib/**` may not import
 * from `src/server/**`.
 */

/* --------------------------------------------------------------------- the dates */

/**
 * English month names, in order. `Intl` is not used: a server whose default locale is not
 * English would render `septembre 2026`, and AC-7, AC-8, AC-11, AC-19 and AC-24 all quote
 * the English spelling as a literal.
 */
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The calendar's seven column headings, Monday first (AC-19). */
export const WEEKDAY_HEADINGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** `formatMonthLabel("2026-09")` is `September 2026`. */
export function formatMonthLabel(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** `formatDayLabel("2026-09-01")` is `1 September 2026` — no leading zero, no weekday. */
export function formatDayLabel(dateKey: string): string {
  const year = Number(dateKey.slice(0, 4));
  const month = Number(dateKey.slice(5, 7));
  const day = Number(dateKey.slice(8, 10));
  return `${day} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** `formatPeriodLabelOf(2026, 9)` is `September 2026`. */
export function formatPeriodLabelOf(period: Period): string {
  return `${MONTH_NAMES[period.periodMonth - 1]} ${period.periodYear}`;
}

/* ------------------------------------------------------------------ empty states */

/** The state of the development database today: `StockCount` holds 0 rows (AC-22). */
export const NO_COUNTS_RECORDED_YET = "No stock counts recorded yet.";

/** A month with nothing in it, when other months do have counts (AC-22). */
export const NO_COUNTS_IN_MONTH = "No counts in this month.";

/**
 * `Dublin has no items on its sheet. An administrator must assign items before this yard
 * can be counted.` (AC-13) — refused BEFORE anything is written, so there is no empty
 * count to tidy up afterwards.
 */
export function noItemsOnSheet(locationName: string): string {
  return (
    `${locationName} has no items on its sheet. ` +
    "An administrator must assign items before this yard can be counted."
  );
}

/* --------------------------------------------------------------------- controls */

export const START_A_COUNT = "Start a count";
export const START_COUNT = "Start count";
export const CONTINUE_THIS_COUNT = "Continue this count";
export const OPEN_THE_EXISTING_COUNT = "Open the existing count";
export const BACK_TO_THE_CALENDAR = "Back to the calendar";
export const PREVIOUS_MONTH = "Previous month";
export const NEXT_MONTH = "Next month";
export const TODAY = "Today";
export const CONTINUE_TO_CONFIRM = "Continue";
export const CHANGE_THE_DATE_OR_YARD = "Change the date or the yard";

/* ----------------------------------------------------------------------- labels */

export const COUNT_DATE_LABEL = "Count date";
export const YARD_LABEL = "Yard";

/** AC-7: the override is ONE control, and this is what it is called. */
export const PERIOD_LABEL = "Period this count closes";

/** `Counting as Jo Byrne` (AC-5, AC-24). Text, never an input — AC-5 is the reason. */
export function countingAs(name: string): string {
  return `Counting as ${name}`;
}

/**
 * The three status words (AC-20).
 *
 * A `Record<CountStatus, string>` here is the layout AC-25 fixes: the labels are readable
 * words in `src/lib/`, and no file under `src/server/counts/` or `src/app/stock-entry/`
 * has to name `SUBMITTED` or `APPROVED` to render one.
 */
export const COUNT_STATUS_LABEL: Record<CountStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
};

/** Invariant 5: a line nobody has looked at yet. `0` is a different thing, and is #8's. */
export const NOT_COUNTED = "Not counted";

/** The same words #6 uses for an item with no unit label — one literal, two screens. */
export const NO_UNIT = ITEM_MASTER_NO_UNIT;

/** `0 of 82 counted` (AC-24). */
export function countedSummary(counted: number, total: number): string {
  return `${counted} of ${total} counted`;
}

/* -------------------------------------------------------------------- the period */

/** `This count closes September 2026.` — shown BEFORE anything is written (AC-7). */
export function countClosesMessage(period: Period): string {
  return `This count closes ${formatPeriodLabelOf(period)}.`;
}

/* --------------------------------------------------------------------- refusals */

/** AC-6. The date is a real calendar day or it is nothing; `2026-02-30` is nothing. */
export const COUNT_DATE_INVALID = "Count date must be a real date, as YYYY-MM-DD.";

/**
 * AC-8. The range is what keeps `periodMonth` away from the `StockCount_periodMonth_range`
 * CHECK: a refusal here is a sentence beside a field, and a refusal there is a Postgres
 * string on a screen.
 */
export const PERIOD_INVALID = "Period must be a month between 2000 and 2100.";

/** AC-21. A month key that is not `YYYY-MM`; the calendar redirects rather than throws. */
export const MONTH_INVALID = "Month must be a month, as YYYY-MM.";

/** AC-23. No yard is preselected, so "none chosen" is a state the form can really be in. */
export const CHOOSE_A_YARD = "Choose a yard.";

/** `Count for DUBLIN in 2026-09 already exists` (AC-10) — the domain's words, not Postgres's. */
export function countAlreadyExists(locationCode: string, periodKey: string): string {
  return `Count for ${locationCode} in ${periodKey} already exists`;
}

/**
 * `Dublin already has a draft count for September 2026, started by Jo Byrne on
 * 1 September 2026.` (AC-11) — so coming back never starts a second count.
 */
export function draftAlreadyExists(
  locationName: string,
  period: Period,
  creatorName: string,
  countDate: string,
): string {
  return (
    `${locationName} already has a draft count for ${formatPeriodLabelOf(period)}, ` +
    `started by ${creatorName} on ${formatDayLabel(countDate)}.`
  );
}

/**
 * The same situation as `draftAlreadyExists`, for a count that has moved past `DRAFT`
 * (AC-11). It offers *Open the existing count* rather than *Continue this count*, because
 * continuing is not a thing a person may do to a count that is already away.
 */
export function countAlreadyExistsForPeriod(locationName: string, period: Period): string {
  return `${locationName} already has a count for ${formatPeriodLabelOf(period)}.`;
}

/** AC-24: a `countId` that does not exist is a sentence and a way back, never a throw. */
export const COUNT_NO_LONGER_EXISTS = "That count no longer exists.";

/** AC-13, AC-23: a yard code that is not one of the two. #6's words, one literal. */
export const yardNotFound = locationNotFound;

/* ----------------------------------------------------------- the ADMIN-only line */

/**
 * `11 items on this sheet have no price recorded. Their lines will count as 0 when this
 * count is submitted.` (AC-16, Invariant 4).
 *
 * It is a count of ITEMS, not a euro figure — the only money-adjacent fact on this whole
 * surface, and the reason `getCount` goes through `shapeForRole`. A YARD_STAFF session is
 * never sent it and never renders it.
 */
export function itemsWithoutPriceMessage(count: number): string {
  const items = count === 1 ? "1 item on this sheet has" : `${count} items on this sheet have`;
  return `${items} no price recorded. Their lines will count as 0 when this count is submitted.`;
}

/* ===================================================================================
 * Feature #8 — the counting screen.
 *
 * Everything below is a literal spec 008 quotes, in the module 008 AC-26 names: the screen,
 * the service, the endpoint and the test all read the SAME string, so a re-spelling is a
 * compile error rather than a silently failing assertion. `Clear filters`, `No supplier`
 * and `No unit` are imported from `src/lib/item-master-messages.ts` rather than re-spelled,
 * as #7 already does for `No unit`.
 * =================================================================================== */

/* -------------------------------------------------------------- entry: the controls */

/**
 * `0` is one tap (008 AC-6). The most recent Dublin count has 35 of 82 rows at zero or
 * blank, and a counter who has to type `0` thirty-five times goes back to paper.
 */
export const NONE_HELD = "None held";

/** The no-JavaScript submit control (008 AC-16). With JavaScript it flushes the queue. */
export const SAVE_NOW = "Save now";

/** 008 AC-13: an immediate retry, beside the banner that says how many are waiting. */
export const RETRY_NOW = "Retry now";

/** The `<noscript>` submit of the filter panel (008 AC-22). */
export const APPLY_FILTERS = "Apply filters";

/** #6's words, one literal, two screens (008 AC-23, AC-26). */
export const CLEAR_FILTERS = ITEM_MASTER_CLEAR_FILTERS;

/* ---------------------------------------------------------------- entry: save state */

/** The header when nothing is pending (008 AC-12). */
export const ALL_CHANGES_SAVED = "All changes saved";

/** The header while a request is in flight — text, never a spinner that hides the row. */
export const SAVING = "Saving…";

/** The row that the server has not taken yet (008 AC-13). The typed value stays put. */
export const NOT_SAVED = "Not saved";

/**
 * `3 changes not saved. They will be sent when the connection returns.` (008 AC-13, AC-14).
 *
 * It is the counterweight to the progress line: the page never claims a number is stored,
 * only that it has been entered, so a counter always knows which of the two they have.
 */
export function changesNotSaved(pending: number): string {
  return pending === 1
    ? "1 change not saved. It will be sent when the connection returns."
    : `${pending} changes not saved. They will be sent when the connection returns.`;
}

/* ------------------------------------------------------------------ entry: filters */

/** The three filter categories, in the order the panel renders them (008 AC-20). */
export const SUPPLIER_FILTER_LABEL = "Supplier";
export const TYPE_FILTER_LABEL = "Type";
export const UNIT_FILTER_LABEL = "Unit";

/** An item with no supplier, spelled as the item master spells it (008 AC-20). */
export const NO_SUPPLIER = ITEM_MASTER_NO_SUPPLIER;

/** `Kelly (14)` — an option's accessible name is its own value and its own count. */
export function facetOptionLabel(value: string, count: number): string {
  return `${value} (${count})`;
}

/** `Showing 12 of 82 items` (008 AC-23). Rendered only while a filter is active. */
export function showingSummary(shown: number, total: number): string {
  return `Showing ${shown} of ${total} items`;
}

/**
 * `Filters are hiding 70 items, 31 not counted.` (008 AC-23).
 *
 * A FILTER MUST NOT BE ABLE TO HIDE THE FACT THAT YOU HAVE NOT FINISHED, which is why the
 * second clause exists at all: hiding 70 rows is ordinary, hiding 31 uncounted ones is the
 * thing that ends with a count submitted half done. `(0, 0)` is the empty string and the
 * element is not rendered — there is nothing to warn about when nothing is hidden.
 */
export function filtersHiding(hidden: number, hiddenUncounted: number): string {
  if (hidden === 0) return "";

  const items = hidden === 1 ? "1 item" : `${hidden} items`;
  const rest = hiddenUncounted === 0 ? "all counted" : `${hiddenUncounted} not counted`;
  return `Filters are hiding ${items}, ${rest}.`;
}

/** A filter that matches nothing — the moment the trap above is most likely to spring. */
export const NO_MATCHING_LINES = "No items match these filters.";

/* ----------------------------------------------------------------- entry: refusals */

/**
 * A count that can no longer be edited (008 AC-9). The branch that raises it is written
 * `status !== "DRAFT"`; the sentence lives here so no module under `src/server/counts/` or
 * `src/app/stock-entry/` has to name a status past DRAFT (007 AC-25).
 */
export const COUNT_READ_ONLY = "This count has been submitted and can no longer be edited.";

/** 007 AC-13 refuses a yard with an empty sheet, so this is a state only a bug reaches. */
export const COUNT_HAS_NO_ITEMS = "This count has no items.";

/** An edit naming a line this count does not have (008 AC-8). */
export const ITEM_NOT_ON_COUNT = "That item is not on this count.";

/* --------------------------------------------------------------- entry: a quantity */

/**
 * The three refusals `parseQuantity` raises (008 AC-7), each naming what is wrong with the
 * number rather than what Postgres would have said about it.
 *
 * FIVE DECIMAL PLACES ARE REFUSED, NEVER ROUNDED: `specs/product-brief.md` says never
 * round, and `Decimal(12, 4)` would round `21.61285` silently.
 */
export const QUANTITY_INVALID = "Quantity must be a number with up to 4 decimal places.";
export const QUANTITY_NEGATIVE = "Quantity cannot be negative.";

/**
 * `Decimal(12, 4)` holds 8 digits before the point. The refusal is what keeps a
 * `numeric field overflow` (SQLSTATE 22003) from ever reaching a screen (008 AC-27).
 */
export const QUANTITY_TOO_LARGE = "Quantity must be less than 100000000.";

/** A request body that is not the shape the endpoint documents (008 AC-10). */
export const SAVE_REQUEST_INVALID = "That save could not be read.";

/** A save carrying no edit at all: the client has nothing to send and should not have. */
export const SAVE_HAS_NO_EDITS = "A save must carry at least one line.";

/** 200 lines is more than two and a half Dublin sheets, so a larger batch is not a count. */
export const SAVE_HAS_TOO_MANY_EDITS = "A save may carry at most 200 lines.";
