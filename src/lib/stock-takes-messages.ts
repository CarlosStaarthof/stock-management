import {
  BACK_TO_THE_CALENDAR as COUNT_BACK_TO_THE_CALENDAR,
  COUNT_NO_LONGER_EXISTS as COUNT_COUNT_NO_LONGER_EXISTS,
  COUNT_STATUS_LABEL as COUNT_COUNT_STATUS_LABEL,
  NEXT_MONTH as COUNT_NEXT_MONTH,
  NOT_COUNTED as COUNT_NOT_COUNTED,
  NO_COUNTS_IN_MONTH as COUNT_NO_COUNTS_IN_MONTH,
  NO_COUNTS_RECORDED_YET as COUNT_NO_COUNTS_RECORDED_YET,
  NO_UNIT as COUNT_NO_UNIT,
  PREVIOUS_MONTH as COUNT_PREVIOUS_MONTH,
  START_A_COUNT as COUNT_START_A_COUNT,
  TODAY as COUNT_TODAY,
  YARD_LABEL as COUNT_YARD_LABEL,
  facetOptionLabel as countFacetOptionLabel,
  formatDayLabel as countFormatDayLabel,
  formatMonthLabel as countFormatMonthLabel,
} from "@/lib/count-messages";

/**
 * Every user-facing literal spec 010 quotes, in one module.
 *
 * AC-18: the screen and the test read the SAME literal, so they cannot drift apart — a
 * message that exists twice is a message that will one day exist in two spellings.
 * `src/lib/auth-messages.ts` is #3's version of this, `src/lib/item-master-messages.ts` is
 * #6's and `src/lib/count-messages.ts` is #7's.
 *
 * THE LITERALS #7 ALREADY OWNS ARE RE-EXPORTED, NOT RESTATED, and AC-18 asserts the
 * IDENTITY rather than the spelling: `COUNT_STATUS_LABEL` here is the same object as
 * `COUNT_STATUS_LABEL` there, and the two empty-state sentences are the same strings. This
 * is the layout #6 used when `count-messages.ts` took `NO_UNIT` from
 * `item-master-messages.ts`. Two calendars that said `No counts in this month.` in two
 * places would be the second definition 006 AC-24 exists to prevent, one sentence lower
 * down than the query it prevents it in.
 *
 * IT NAMES NO PRICE COLUMN AND BUILDS NO EURO SENTENCE, and that is not an omission: #10
 * is money-free by design, for BOTH roles, on every surface it adds (AC-12). The currency
 * symbol lives in `src/lib/money.ts` and no screen of this feature imports it.
 *
 * It imports nothing from `src/server/` at all, which keeps 006 AC-33's lint fence green
 * (AC-18).
 */

/* ------------------------------------------------------------------ the re-exports */

/** #3's heading, kept verbatim: `tests/e2e/role-access.spec.ts` asserts it for both roles. */
export const STOCK_TAKES_HEADING = "Stock Takes";

/** `formatMonthLabel("2026-09")` is `September 2026` — #7's formatter, not a second one. */
export const formatMonthLabel = countFormatMonthLabel;

/** `formatDayLabel("2026-09-01")` is `1 September 2026`. */
export const formatDayLabel = countFormatDayLabel;

/** `Dublin (4)` — #8's facet label, because a scope option is a facet (AC-6). */
export const facetOptionLabel = countFacetOptionLabel;

/** The three status words, as the SAME record #7 built (AC-18). */
export const COUNT_STATUS_LABEL = COUNT_COUNT_STATUS_LABEL;

/** Invariant 5: a line nobody looked at. `0` is a different fact and renders as `0`. */
export const NOT_COUNTED = COUNT_NOT_COUNTED;

/** An item with no unit label, spelled as #6 and #7 spell it. */
export const NO_UNIT = COUNT_NO_UNIT;

/** The database has never held a stock take — the state it is in today. */
export const NO_COUNTS_RECORDED_YET = COUNT_NO_COUNTS_RECORDED_YET;

/** This month, in this scope, has none — while other months do. No instruction with it. */
export const NO_COUNTS_IN_MONTH = COUNT_NO_COUNTS_IN_MONTH;

/** The one thing the never-counted-anything state offers, pointing at #7's `/stock-entry/new`. */
export const START_A_COUNT = COUNT_START_A_COUNT;

/** Back from a count to the calendar it was opened from (AC-16). */
export const BACK_TO_THE_CALENDAR = COUNT_BACK_TO_THE_CALENDAR;

/** A `countId` that does not exist is a sentence and a way back, never a throw (AC-8). */
export const COUNT_NO_LONGER_EXISTS = COUNT_COUNT_NO_LONGER_EXISTS;

/** The month controls, shared with #7's calendar because they are the same calendar. */
export const PREVIOUS_MONTH = COUNT_PREVIOUS_MONTH;
export const NEXT_MONTH = COUNT_NEXT_MONTH;
export const TODAY = COUNT_TODAY;

/* --------------------------------------------------------------- the yard selector */

/**
 * `Both` — the third option of the scope selector (AC-6).
 *
 * The other two are `Location.name` as the database holds it, so `Dublin` and `Clonmel`
 * are never spelled in this module: they are data, and #6 made them editable.
 *
 * IT IS A SCOPE, NOT A CLAIM THAT BOTH YARDS WERE COUNTED. On a day only Clonmel was
 * walked, `Both (1)` shows the Clonmel badge and nothing beside it.
 */
export const BOTH_YARDS = "Both";

/**
 * The selector's accessible name — #7's `Yard` label, re-exported rather than restated.
 *
 * AC-18's rule reaches a label a criterion does not quote for the same reason it reaches
 * the ones it does: a word that exists twice is a word that will one day exist in two
 * spellings.
 */
export const YARD_LABEL = COUNT_YARD_LABEL;

/* ----------------------------------------------------------------- the count jumps */

/**
 * The two jumps that skip the months nobody counted (AC-11) — the workbook has no July or
 * August 2025 at all, and paging through them is four taps to reach a fact.
 *
 * Where there is no neighbour the control still renders under the same label, disabled,
 * rather than disappearing: a control that comes and goes is a control a person has to
 * look for.
 */
export const PREVIOUS_COUNT = "Previous count";
export const NEXT_COUNT = "Next count";

/* ------------------------------------------------------------- held, and everything */

/**
 * `35 of 82 items are not held and are hidden.` (AC-9).
 *
 * THE PAGE SAYS WHAT IT HID. Part 5 makes held-only the default because 35 of the most
 * recent Dublin count's 82 rows are zero or blank, and a view that quietly dropped 35 rows
 * would be a view a person could not trust to be the whole record.
 */
export function notHeldSummary(hidden: number, total: number): string {
  return `${hidden} of ${total} items are not held and are hidden.`;
}

/** The toggle, one tap each way (AC-9). */
export const SHOW_ALL_ITEMS = "Show all items";
export const SHOW_HELD_ONLY = "Show held only";

/**
 * `No items were held at Dublin in September 2026.` (UI states) — the third empty state,
 * and the only one that is about a count rather than about a calendar.
 *
 * It names the yard and the period because the reader arrived here from a calendar and may
 * have opened the count they did not mean to.
 */
export function noItemsHeld(locationName: string, periodLabel: string): string {
  return `No items were held at ${locationName} in ${periodLabel}.`;
}

/* ------------------------------------------------------------------ the one way out */

/**
 * `Open this count in Stock Entry` (AC-15) — the ONE link this feature renders into #9's
 * tree, with the same `href` and the same label for both roles.
 *
 * An `ADMIN` reaches the euro through it, in two clicks, on a screen that is #9's and not
 * this one's. Nothing here links to `/summary`, for anybody: an admin-only shortcut would
 * buy one click and cost AC-13's byte-identity assertion, which is the only thing that
 * makes "one version of the screen, not two" checkable at all.
 */
export const OPEN_IN_STOCK_ENTRY = "Open this count in Stock Entry";

/** Who walked the yard (AC-8). The lifecycle sentences are #9's, on #9's screens. */
export const COUNTED_BY_LABEL = "Counted by";

/**
 * `Counted by Aisling` — the label and the name as ONE string, and that matters (AC-13).
 *
 * Rendered as `{LABEL}{" "}{name}` the sentence is three React children, and the server
 * emits an `<!-- -->` separator between the last two which HYDRATION THEN REMOVES. AC-13
 * compares the rendered body of the two sessions byte for byte, and a body that loses
 * eight characters a moment after it arrives is a comparison whose answer depends on which
 * of the two fetches was read first. It was observed doing exactly that, in both
 * directions, before this function existed. One expression is one text node.
 */
export function countedBy(name: string): string {
  return `${COUNTED_BY_LABEL} ${name}`;
}
