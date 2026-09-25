import { nextMonthKey, parseMonthKey, previousMonthKey } from "@/server/counts/period";

/**
 * Period arithmetic for Analysis: the month before, the same month a year back, a window,
 * and an ordering. Pure — no Prisma, no clock, no `new Date` and no `Date.UTC` anywhere in
 * the module (011 AC-13), which is why every criterion it carries runs in
 * `npm run test:unit` on a machine with no Postgres at all.
 *
 * THERE IS ONE DEFINITION OF "THE MONTH BEFORE THIS ONE" IN THIS REPOSITORY AND THIS
 * MODULE DOES NOT ADD A SECOND. Every function here is built on `previousMonthKey`,
 * `nextMonthKey` and `parseMonthKey` from `@/server/counts/period`, which is the rule 006
 * AC-24 exists to enforce and the reason this module lives under `src/server/` rather than
 * beside the chart in `src/lib/`: `docs/architecture.md` forbids `src/lib/**` from
 * importing anything under `src/server/`. `src/server/counts/period.ts` is byte-identical
 * after this feature.
 *
 * `priorYearPeriodKey` WALKS BACK TWELVE MONTHS RATHER THAN SUBTRACTING ONE FROM THE YEAR,
 * for exactly that reason. Subtracting from the year is a second piece of month arithmetic
 * — correct today, and one more place to be wrong the day the calendar rule changes. Twelve
 * calls to a function that is already tested cost nothing and cannot disagree with it.
 *
 * MONTH ON MONTH IS `(y, m − 1)` AND YEAR ON YEAR IS `(y − 1, m)`, and NEITHER is "the
 * column to the left". `Summary!C9` subtracts the column ELEVEN months back and compares
 * October 2025 with November 2024; Part 4 condemns that in terms. The join is on the
 * PERIOD, so a skipped month cannot quietly turn a comparison into a two-month movement —
 * it turns it into a refusal, which is `analysis-service.ts`'s job and not this module's.
 */

/** Twelve months back is the same month last year. Part 4's year-on-year, as a constant. */
const MONTHS_IN_YEAR = 12;

/** `previousPeriodKey("2026-01")` is `"2025-12"` (AC-11). */
export function previousPeriodKey(periodKey: string): string {
  return previousMonthKey(periodKey);
}

/**
 * `priorYearPeriodKey("2026-01")` is `"2025-01"` and `("2026-12")` is `"2025-12"` (AC-12).
 *
 * Twelve steps back through the one definition, never `year − 1` spelled again here.
 */
export function priorYearPeriodKey(periodKey: string): string {
  let key = parseMonthKey(periodKey);

  for (let step = 0; step < MONTHS_IN_YEAR; step += 1) {
    key = previousMonthKey(key);
  }

  return key;
}

/**
 * `size` consecutive period keys, OLDEST FIRST, ending at `periodKey` (AC-13).
 *
 * `periodWindow("2026-09", 13)` is `["2025-09", …, "2026-09"]`, so THE LEFTMOST POINT OF
 * THE WINDOW IS THE YEAR-ON-YEAR COMPARAND — that is why the trend constant is 13 and not
 * 12, and why the chart and the year-on-year figure can never disagree about which month
 * they mean.
 *
 * It walks BACK to the oldest key and then FORWARD to fill the array, so both directions go
 * through the one definition and the result is in reading order without being reversed.
 */
export function periodWindow(periodKey: string, size: number): string[] {
  if (size < 1) return [];

  let oldest = parseMonthKey(periodKey);
  for (let step = 1; step < size; step += 1) {
    oldest = previousMonthKey(oldest);
  }

  const window = [oldest];
  while (window.length < size) {
    window.push(nextMonthKey(window[window.length - 1]));
  }

  return window;
}

/**
 * `-1`, `0` or `1` — `left` against `right` in time (AC-13).
 *
 * `"YYYY-MM"` is fixed width and zero padded, so it sorts lexicographically in the same
 * order it sorts chronologically; the comparison needs no arithmetic and cannot acquire a
 * timezone. `src/server/items/price-selection.ts` makes the same observation about
 * `"YYYY-MM-DD"`.
 *
 * Both sides go through `parseMonthKey` first, so a key that is not a month is a typed
 * `ValidationError` rather than a silently wrong ordering.
 */
export function comparePeriodKeys(left: string, right: string): -1 | 0 | 1 {
  const first = parseMonthKey(left);
  const second = parseMonthKey(right);

  if (first < second) return -1;
  return first > second ? 1 : 0;
}
