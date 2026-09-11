/**
 * Which price was in force on a given day.
 *
 * Pure, and separately tested, because it has two callers with very different stakes.
 * This screen uses it to decide which row wears the `Current` badge; #8 and #9 will call
 * it with the count date to decide what a `StockCountLine`'s price snapshot becomes — the
 * historical fact Invariant 2 forbids anything from rewriting afterwards. One definition,
 * or the screen and the snapshot eventually disagree about what "the price" was.
 *
 * `effectiveFrom` is a `YYYY-MM-DD` string, never a `Date`. Fixed-width ISO dates sort
 * lexicographically in the same order they sort chronologically, so the comparison needs
 * no timezone and cannot acquire one.
 */

/** A price, as it crosses a service boundary: decimal STRINGS, never JS numbers. */
export type PriceRow = {
  id: string;
  unitPrice: string;
  currency: string;
  /** `YYYY-MM-DD`. */
  effectiveFrom: string;
  label: string | null;
};

/** The three fields a screen needs from the price in force. */
export type CurrentPrice = {
  unitPrice: string;
  currency: string;
  effectiveFrom: string;
};

/**
 * A price as Prisma hands it back: a `Decimal` that stringifies, and a `@db.Date` that
 * arrives as a `Date` at UTC midnight. Structural, so this module still imports nothing —
 * which is what keeps it pure and unit-testable with no database (AC-32).
 */
export type PriceRecord = {
  id: string;
  unitPrice: { toString(): string };
  currency: string;
  effectiveFrom: Date;
  label: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A `@db.Date` column is stored at UTC midnight; `YYYY-MM-DD` is the whole of it. */
export function isoDateOf(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Database rows to boundary rows, newest `effectiveFrom` first.
 *
 * It lives here, and not in each service, for the reason spec 006 AC-31 gives: exactly
 * nine modules may name the price column, and neither the yard sheet nor a page is one of
 * them. One conversion, in a module that is allowed to say the word.
 */
export function toPriceRows(records: readonly PriceRecord[]): PriceRow[] {
  return records
    .map((price) => ({
      id: price.id,
      unitPrice: price.unitPrice.toString(),
      currency: price.currency,
      effectiveFrom: isoDateOf(price.effectiveFrom),
      label: price.label,
    }))
    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom));
}

/**
 * The row with the greatest `effectiveFrom` that is ON OR BEFORE `asOf`, or `null`.
 *
 * A price effective exactly on `asOf` wins — a price list dated the first of the month is
 * in force on the first of the month, which is how the workbook's `2025 Prices` column was
 * always read.
 */
export function selectCurrentPrice<T extends { effectiveFrom: string }>(
  prices: readonly T[],
  asOf: string,
): T | null {
  let winner: T | null = null;

  for (const price of prices) {
    if (!ISO_DATE.test(price.effectiveFrom)) continue;
    if (price.effectiveFrom > asOf) continue;
    if (winner === null || price.effectiveFrom > winner.effectiveFrom) {
      winner = price;
    }
  }

  return winner;
}

/** `selectCurrentPrice` narrowed to what a list row shows. */
export function toCurrentPrice(
  prices: readonly PriceRow[],
  asOf: string,
): CurrentPrice | null {
  const current = selectCurrentPrice(prices, asOf);
  if (current === null) return null;
  return {
    unitPrice: current.unitPrice,
    currency: current.currency,
    effectiveFrom: current.effectiveFrom,
  };
}

/**
 * The decimal string inside a `CurrentPrice`, for a screen that renders it with
 * `formatPriceExact`.
 *
 * It exists so that a page does not have to name the column to show the number: spec 006
 * AC-31 permits exactly nine modules to name `unitPrice`, and the yard sheet is not one
 * of them. The value is unchanged — this is a boundary, not a conversion.
 */
export function priceAmountOf(price: CurrentPrice | null): string | null {
  return price === null ? null : price.unitPrice;
}

/** Today, as `YYYY-MM-DD` in the local zone: the default `asOf` and the form's default. */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}
