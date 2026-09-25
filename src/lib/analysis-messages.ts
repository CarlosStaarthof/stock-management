import {
  COUNT_STATUS_LABEL as COUNT_COUNT_STATUS_LABEL,
  NOT_COUNTED as COUNT_NOT_COUNTED,
  formatMonthLabel as countFormatMonthLabel,
  formatPeriodLabelOf as countFormatPeriodLabelOf,
} from "@/lib/count-messages";
import { NO_SUPPLIER as ITEM_MASTER_NO_SUPPLIER } from "@/lib/item-master-messages";
import { CURRENCY_SYMBOL, formatPriceExact, roundHalfUp } from "@/lib/money";
import type { BreakdownKey } from "@/types/analysis";

/**
 * Every user-facing literal spec 011 quotes, in one module.
 *
 * AC-22: the screen and the test read the SAME literal, so they cannot drift apart — a
 * message that exists twice is a message that will one day exist in two spellings.
 * `src/lib/auth-messages.ts` is #3's version of this, `src/lib/item-master-messages.ts` is
 * #6's, `src/lib/count-messages.ts` is #7's and `src/lib/stock-takes-messages.ts` is #10's.
 *
 * THE LITERALS #6 AND #7 ALREADY OWN ARE RE-EXPORTED, NOT RESTATED, and AC-22 asserts the
 * IDENTITY rather than the spelling: `COUNT_STATUS_LABEL` here is the same object as
 * `COUNT_STATUS_LABEL` there, and `Not counted` and `No supplier` are the same strings as
 * `NOT_COUNTED` and `NO_SUPPLIER`. This is the layout #10 used for
 * `stock-takes-messages.ts`, for the reason 006 AC-24 gives: a second spelling of a
 * sentence is a second thing to keep in step.
 *
 * THIS MODULE IS THE ONE THAT BUILDS A EURO SENTENCE, and that is not a leak: it is
 * `src/lib/`, it reaches no database and no session, and `/analysis` is a `307` for every
 * staff session before any of it is read. It still names the price column NOWHERE — 006
 * AC-31 holds the whole of `src/lib/**` at zero files naming it and 011 AC-26 keeps it
 * there — which is why `formatFigure` takes `value` and `formatVarianceAmount` takes
 * `amount`.
 *
 * It imports nothing from `src/server/` at all, so 006 AC-33's lint fence stays green.
 */

/* ------------------------------------------------------------------ the re-exports */

/**
 * #3's heading, kept VERBATIM: `tests/e2e/role-access.spec.ts` asserts this exact string
 * for an `ADMIN` and must pass unmodified (AC-1).
 */
export const ANALYSIS_HEADING = "Analysis";

/** `formatMonthLabel("2026-09")` is `September 2026` — #7's formatter, not a second one. */
export const formatMonthLabel = countFormatMonthLabel;

/** `formatPeriodLabelOf({2026, 9})` is `September 2026`. The same function, from #7. */
export const formatPeriodLabelOf = countFormatPeriodLabelOf;

/** The three status words, as the SAME record #7 built (AC-5, AC-22). */
export const COUNT_STATUS_LABEL = COUNT_COUNT_STATUS_LABEL;

/**
 * A yard with no count for this period. `Not counted` and NEVER `€0.00` — that is the
 * whole of AC-6, and it is #7's string rather than a second spelling of it.
 */
export const NOT_COUNTED = COUNT_NOT_COUNTED;

/** The items with no supplier — `Dublin!A45` `School Logo Triangle` is the real case. */
export const NO_SUPPLIER = ITEM_MASTER_NO_SUPPLIER;

/* --------------------------------------------------------------- the empty states */

/**
 * The state of the database before anybody approves anything (AC-6).
 *
 * The page renders this, one link, and NO `€` CHARACTER AT ALL. An empty database showing
 * `€0.00` is the top-level form of the mistake this whole feature is shaped around.
 */
export const NO_APPROVED_STOCK_TAKES_YET = "No approved stock takes yet.";

/** The one thing the empty state offers, pointing at #10's calendar. */
export const GO_TO_STOCK_TAKES = "Go to Stock Takes";

/** A period in which nothing at all was held: no breakdown rows, and this instead (AC-15). */
export const NOTHING_HELD_IN_PERIOD = "Nothing was held in this period.";

/* ------------------------------------------------------------------ completeness */

/**
 * `Clonmel has no approved count for September 2026.` — and with both yards missing,
 * `Dublin and Clonmel have no approved count for September 2026.` (AC-6).
 *
 * IT NAMES THE YARDS. Invariant 7 makes an incomplete period's total absent, and a total
 * that is absent without saying which yard is missing is a screen that tells an
 * administrator to go and look for the reason.
 */
/**
 * The TOTAL of a period that is not complete: `total-stock`, and every breakdown row's total
 * cell (AC-6, amended 2026-09-24).
 *
 * NOT `Not counted`. A total is not a yard, and `Not counted` printed beside Dublin's figure
 * reads as if nobody counted at all. The yard cells keep #7's word, because for a yard it is
 * the fact; the total gets its own, because for a total the fact is that it does not add up
 * yet. Either way it is a word and never a figure: Invariant 7 makes the total absent.
 */
export const INCOMPLETE_TOTAL = "Incomplete";

export function missingYardsMessage(
  locationNames: readonly string[],
  periodLabel: string,
): string {
  const named =
    locationNames.length <= 1
      ? locationNames.join("")
      : `${locationNames.slice(0, -1).join(", ")} and ${locationNames[locationNames.length - 1]}`;

  const verb = locationNames.length === 1 ? "has" : "have";

  return `${named} ${verb} no approved count for ${periodLabel}.`;
}

/* ------------------------------------------------------ Invariant 4, on an aggregate */

/**
 * `3 held lines have no price and counted as zero.` — and `1 held line has …` for one
 * (AC-9).
 *
 * THE COUNT, NOT THE NAMES. #9 put this warning on one count's submit review as a LIST OF
 * ITEM NAMES, which is right for one count and wrong for an aggregate: across thirteen
 * periods and two yards a list of names is a wall nobody reads. Analysis states the size of
 * the hole beside every figure it shortens; the sentence is a link to #9's summary, which
 * names what is in it.
 *
 * `€486.00 counted and never valued, and invisible` — `Dublin!AH25` and `!AH51` — is the
 * defect this sentence exists for.
 */
export function unvaluedHeldLinesMessage(heldLinesWithoutPrice: number): string {
  const subject = heldLinesWithoutPrice === 1 ? "held line has" : "held lines have";
  return `${heldLinesWithoutPrice} ${subject} no price and counted as zero.`;
}

/* --------------------------------------------------------------- the two variances */

export const MONTH_ON_MONTH_LABEL = "Month on month";
export const YEAR_ON_YEAR_LABEL = "Year on year";
export const TOTAL_STOCK_LABEL = "Total stock";

/** The SELECTED period has no total, so there is nothing to compare from (AC-11). */
export const NOT_COMPARABLE_PERIOD_INCOMPLETE = "Not comparable — this period is incomplete.";

/**
 * `Not comparable — August 2026 is incomplete.` (AC-11).
 *
 * IT NAMES THE PERIOD AND IT DOES NOT REACH FURTHER BACK. Part 4 settles year on year in
 * terms — *never "twelve columns to the left", which is what the Summary sheet does today
 * and which breaks the moment a month is skipped* — and month on month is the same defect
 * one month wide. `Summary!C9` subtracts the column ELEVEN months back and compares
 * October 2025 with November 2024. Month on month means the month before, or it means
 * nothing.
 */
export function notComparableAgainstIncomplete(againstPeriodLabel: string): string {
  return `Not comparable — ${againstPeriodLabel} is incomplete.`;
}

/** `Not comparable — there is no count for August 2026.` (AC-11). */
export function notComparableAgainstMissing(againstPeriodLabel: string): string {
  return `Not comparable — there is no count for ${againstPeriodLabel}.`;
}

/* ----------------------------------------------------------------- the two figures */

/**
 * A figure, as a screen shows it: `formatPriceExact(roundHalfUp(value, 2))` (AC-7).
 *
 * ROUNDED ONCE, HERE, FOR DISPLAY ONLY. Every figure this feature computes is exact and
 * unrounded until it reaches this function; nothing rounded is ever summed. The stated cost
 * is #9's: the rendered per-yard column may not add to the rendered total to the last cent,
 * AND THE TOTAL IS THE CORRECT FIGURE. Invariant 10 is the reason — four Clonmel prices
 * are non-terminating workbook formulas, and a stock system that disagrees with the file it
 * replaced, by any amount, will not be trusted.
 */
export function formatFigure(value: string): string {
  return formatPriceExact(roundHalfUp(value, 2));
}

/**
 * A variance, signed: `−€1,234.56` for a fall and `€1,234.56` for a rise (AC-11).
 *
 * THE SIGN IS A TRUE MINUS (U+2212), NOT A HYPHEN. A hyphen at that size reads as a dash
 * between two figures rather than as the sign of one, and this is the only negative number
 * on the screen. A rise carries no `+`: the Summary sheet shows an absolute difference and
 * so does this, and a plus sign in front of a euro reads as an instruction.
 */
export const MINUS_SIGN = "−";

export function formatVarianceAmount(amount: string): string {
  const rounded = roundHalfUp(amount, 2);

  return rounded.startsWith("-")
    ? `${MINUS_SIGN}${formatPriceExact(rounded.slice(1))}`
    : formatPriceExact(rounded);
}

/** The one currency, from the one module that spells it (006 § Out of scope). */
export const EURO = CURRENCY_SYMBOL;

/* -------------------------------------------------------- the breakdown, and the jumps */

/** The two groupings, as the two links are labelled (AC-15). */
export const BREAKDOWN_LABEL: Record<BreakdownKey, string> = {
  type: "By type",
  supplier: "By supplier",
};

/** The breakdown's own heading, and the column that carries the row total. */
export const BREAKDOWN_HEADING = "Where the stock is";

/**
 * The two period jumps (AC-16) — they skip the months nobody counted, because the workbook
 * has no July or August 2025 at all and paging through them is four taps to reach a fact.
 *
 * Where there is no neighbour the control still renders under the same label, disabled,
 * rather than disappearing: a control that comes and goes is a control a person has to look
 * for.
 */
export const PREVIOUS_PERIOD = "Previous period";
export const NEXT_PERIOD = "Next period";

/* ------------------------------------------------------------------- the chart */

/** The `<title>` of the inline `<svg>`, which is also its accessible name (AC-14). */
export const TREND_CHART_TITLE = "Total stock by period";

/** The row of the accompanying table, which carries the same tuples as the chart (AC-14). */
export const TREND_TABLE_CAPTION = "Total stock by period, as figures";
