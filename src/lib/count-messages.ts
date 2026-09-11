import { NO_UNIT as ITEM_MASTER_NO_UNIT, locationNotFound } from "@/lib/item-master-messages";
import type { CountStatus, Period } from "@/types/stock-count";

/**
 * Every user-facing literal spec 007 quotes, in one module.
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
