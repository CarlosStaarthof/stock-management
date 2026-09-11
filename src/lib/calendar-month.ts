import { MONTH_INVALID } from "@/lib/count-messages";
import { ValidationError } from "@/server/errors";

/**
 * One month of days, as complete Monday-first weeks (AC-19).
 *
 * Pure, and unit-tested with no database: a calendar is arithmetic, and arithmetic that
 * needs Postgres to be checked is arithmetic nobody checks. It knows nothing about counts
 * — `listCalendarMonth` supplies those, keyed by date — so a padding cell cannot acquire a
 * count by accident, because there is nowhere on it to put one.
 *
 * ROWS ARE ALWAYS `ceil((leading + days) / 7)`, never a fixed five or six. The three cases
 * AC-19 pins are the argument:
 *
 *   * `2026-09`  Tuesday, 30 days  ->  1 + 30 = 31  ->  5 rows, 4 trailing pads
 *   * `2026-02`  Sunday,  28 days  ->  6 + 28 = 34  ->  5 rows, 1 trailing pad
 *   * `2026-03`  Sunday,  31 days  ->  6 + 31 = 37  ->  6 rows, 5 trailing pads
 *
 * February is the largest leading pad that still fits in five rows, which is the case an
 * off-by-one in the pad arithmetic breaks; March is the case that stops the grid being
 * assumed to be five. Both were corrected into the spec after the implementer checked the
 * arithmetic (spec 007 § Post-approval amendments 1).
 *
 * `@/server/errors` is the one import `docs/architecture.md` permits `src/lib/**` to take
 * from `src/server/`, and `tests/unit/lint-fence.test.ts` is what keeps that honest.
 */

/** A cell of the grid. `date` is `"YYYY-MM-DD"`, or `null` for a padding cell. */
export type MonthGridCell = { date: string | null };

/** A week: always seven cells, Monday first. */
export type MonthGridRow = MonthGridCell[];

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

const DAYS_IN_WEEK = 7;

/** The one padding cell, shared: it carries no date, no link and no count. */
const PADDING: MonthGridCell = { date: null };

/**
 * `2026-09` to `{ year: 2026, month: 9 }`, or `ValidationError`.
 *
 * The field is `month` because that is the query parameter the calendar reads it from
 * (AC-21), so a caller that wanted to render a message beside something could.
 */
function parseMonthKeyParts(monthKey: string): { year: number; month: number } {
  if (!MONTH_KEY.test(monthKey)) {
    throw new ValidationError("month", MONTH_INVALID);
  }
  return { year: Number(monthKey.slice(0, 4)), month: Number(monthKey.slice(5, 7)) };
}

/** How many days the month has. `Date.UTC(y, m, 0)` is the last day of month `m`. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * How many padding cells come before the 1st: 0 when the month starts on a Monday, 6 when
 * it starts on a Sunday. `getUTCDay()` is Sunday-first, so it is rotated.
 */
export function leadingPadding(year: number, month: number): number {
  return (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % DAYS_IN_WEEK;
}

export function buildMonthGrid(monthKey: string): MonthGridRow[] {
  const { year, month } = parseMonthKeyParts(monthKey);

  const leading = leadingPadding(year, month);
  const days = daysInMonth(year, month);
  const rows = Math.ceil((leading + days) / DAYS_IN_WEEK);

  const cells: MonthGridCell[] = [];
  for (let index = 0; index < leading; index += 1) cells.push(PADDING);
  for (let day = 1; day <= days; day += 1) {
    cells.push({ date: `${monthKey}-${String(day).padStart(2, "0")}` });
  }
  while (cells.length < rows * DAYS_IN_WEEK) cells.push(PADDING);

  return Array.from({ length: rows }, (_unused, row) =>
    cells.slice(row * DAYS_IN_WEEK, (row + 1) * DAYS_IN_WEEK),
  );
}
