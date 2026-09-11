import {
  COUNT_DATE_INVALID,
  MONTH_INVALID,
  PERIOD_INVALID,
  formatPeriodLabelOf,
} from "@/lib/count-messages";
import { ValidationError } from "@/server/errors";
import { isoDateSchema } from "@/server/items/item-master-input";
import type { Period } from "@/types/stock-count";

/**
 * A count is keyed by its period and dated by its day (`specs/domain-model.md` Part 4).
 *
 * Pure: no Prisma, no clock, no `new Date()` without an argument. That is why AC-6's and
 * AC-21's arithmetic runs in `npm run test:unit` on a machine with no Postgres at all
 * (AC-29).
 *
 * THE RULE IS ONE FUNCTION AND ONE PLACE. `day <= 5` closes the PREVIOUS month; anything
 * later closes the date's own month; January rolls back to December of the previous year.
 * It is shown to the user before the write (AC-7) and overridden with one control (AC-8).
 * Nothing recomputes it afterwards, and nothing validates the date against the period: a
 * count dated `2026-10-01` that closes `2026-09` is the ordinary case, not an anomaly, and
 * the workbook holds one dated `2026-12-31` belonging to `2025-12`.
 *
 * There is deliberately NO business-day rule here or anywhere else (AC-9). The workbook
 * counted on Saturdays and Sundays; so does this. The date is recorded as given.
 */

/** The last day of the month `day <= 5` belongs to. Part 4's boundary, as a constant. */
const PREVIOUS_MONTH_THROUGH_DAY = 5;

const MONTH_KEY = /^\d{4}-\d{2}$/;

/** AC-8: `periodYear` never reaches the database outside this range. */
const EARLIEST_YEAR = 2000;
const LATEST_YEAR = 2100;

/**
 * A `YYYY-MM-DD` that is a real day, or `ValidationError` naming `countDate` (AC-6).
 *
 * `2026-02-30` matches the shape and is not a day, so the shape is not enough. The answer
 * comes from `isoDateSchema` — #6's regex plus its `Date` round-trip — rather than from a
 * second copy of it here: "a real calendar day" has ONE definition in this application, and
 * the review of this feature caught the copy that made that sentence false.
 */
export function parseCountDate(raw: unknown): string {
  const parsed = isoDateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError("countDate", COUNT_DATE_INVALID);
  }
  return parsed.data;
}

/**
 * Part 4's rule, as one pure function. Its four worked examples are AC-6's first four
 * assertions, in order.
 */
export function periodForCountDate(rawCountDate: unknown): Period {
  const countDate = parseCountDate(rawCountDate);

  const year = Number(countDate.slice(0, 4));
  const month = Number(countDate.slice(5, 7));
  const day = Number(countDate.slice(8, 10));

  if (day > PREVIOUS_MONTH_THROUGH_DAY) {
    return { periodYear: year, periodMonth: month };
  }

  // January rolls back a year: the first five days of January close the previous December.
  return month === 1
    ? { periodYear: year - 1, periodMonth: 12 }
    : { periodYear: year, periodMonth: month - 1 };
}

/** `{2026, 9}` to `"2026-09"`. The same shape as a month key, because it is one. */
export function formatPeriodKey(period: Period): string {
  return `${period.periodYear}-${String(period.periodMonth).padStart(2, "0")}`;
}

/** `{2026, 9}` to `"September 2026"`. */
export function formatPeriodLabel(period: Period): string {
  return formatPeriodLabelOf(period);
}

/**
 * `"2026-09"` to `{2026, 9}`, or `ValidationError` naming `period` (AC-8).
 *
 * The year range is what keeps `periodMonth` away from the `StockCount_periodMonth_range`
 * CHECK #4 shipped: a refusal here is a sentence beside a field, and a refusal there is a
 * Postgres string on a screen, which `docs/architecture.md` forbids.
 */
export function parsePeriodKey(raw: unknown): Period {
  if (typeof raw !== "string" || !MONTH_KEY.test(raw)) {
    throw new ValidationError("period", PERIOD_INVALID);
  }

  const periodYear = Number(raw.slice(0, 4));
  const periodMonth = Number(raw.slice(5, 7));

  if (periodYear < EARLIEST_YEAR || periodYear > LATEST_YEAR) {
    throw new ValidationError("period", PERIOD_INVALID);
  }
  if (periodMonth < 1 || periodMonth > 12) {
    throw new ValidationError("period", PERIOD_INVALID);
  }

  return { periodYear, periodMonth };
}

/** `"2026-09-15"` to `"2026-09"`. The month a day sits in — AC-20's placement rule. */
export function monthKeyOf(rawCountDate: unknown): string {
  return parseCountDate(rawCountDate).slice(0, 7);
}

/** A month key, validated. `banana`, `2026-13`, `2026-1` and `""` are all refused (AC-21). */
export function parseMonthKey(raw: unknown): string {
  if (typeof raw !== "string" || !MONTH_KEY.test(raw)) {
    throw new ValidationError("month", MONTH_INVALID);
  }
  const month = Number(raw.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new ValidationError("month", MONTH_INVALID);
  }
  return raw;
}

function shiftMonth(monthKey: string, by: -1 | 1): string {
  const valid = parseMonthKey(monthKey);
  const year = Number(valid.slice(0, 4));
  const month = Number(valid.slice(5, 7)) + by;

  if (month === 0) return `${year - 1}-12`;
  if (month === 13) return `${year + 1}-01`;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** `previousMonthKey("2026-01")` is `"2025-12"` (AC-21). */
export function previousMonthKey(monthKey: string): string {
  return shiftMonth(monthKey, -1);
}

/** `nextMonthKey("2026-12")` is `"2027-01"` (AC-21). */
export function nextMonthKey(monthKey: string): string {
  return shiftMonth(monthKey, 1);
}

/** The first and last day of a month, as `YYYY-MM-DD`, for a `countDate` range query. */
export function monthBounds(monthKey: string): { first: string; last: string } {
  const valid = parseMonthKey(monthKey);
  const year = Number(valid.slice(0, 4));
  const month = Number(valid.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return { first: `${valid}-01`, last: `${valid}-${String(lastDay).padStart(2, "0")}` };
}
