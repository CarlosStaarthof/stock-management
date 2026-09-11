/**
 * Formatting for the decimal strings the database stores as `Decimal(18, 8)`.
 *
 * `docs/architecture.md` § Money and quantities: never a JavaScript `number` for anything
 * Postgres stores as a decimal. `6.11764706` is one of the four Clonmel prices that are
 * workbook formulas (`=5.2/0.85` and friends), and a `Number` round trip is exactly what
 * loses its tail. So this module takes a STRING and returns a STRING, and there is no
 * `Number(...)`, `parseFloat`, `toFixed` or `Intl.NumberFormat` anywhere in it.
 *
 * The parameter is deliberately called `value` and not after the price column: spec 006
 * AC-31 keeps `src/lib/**` at zero files naming that column - in code and in a comment
 * alike - so the money boundary can be audited with a grep rather than by reading.
 */

/** Part 6 and the workbook: one currency, and it is not an input (006 § Out of scope). */
export const CURRENCY_SYMBOL = "€";

/** Prices are shown to at least cents, so `1000` reads as a price and not as a count. */
const MINIMUM_FRACTION_DIGITS = 2;

const DECIMAL = /^(-?)(\d+)(?:\.(\d*))?$/;

/** `1000` -> `1,000`. Grouped from the right, three at a time, without arithmetic. */
function groupThousands(whole: string): string {
  let grouped = "";
  for (let index = whole.length; index > 0; index -= 3) {
    const start = Math.max(0, index - 3);
    grouped = whole.slice(start, index) + (grouped === "" ? "" : `,${grouped}`);
  }
  return grouped === "" ? "0" : grouped;
}

/**
 * `"6.11764706"` -> `€6.11764706`, `"33.09000000"` -> `€33.09`,
 * `"1000.00000000"` -> `€1,000.00`, `"0.00000000"` -> `€0.00`.
 *
 * Trailing zeros beyond the second decimal place are noise from `Decimal(18, 8)`; the
 * digits before them are the number the workbook holds, and every one of them survives.
 *
 * A string this function cannot read is returned unchanged rather than turned into `NaN`:
 * showing the raw value is honest, and showing `€NaN` is not.
 */
export function formatPriceExact(value: string): string {
  const parsed = DECIMAL.exec(value.trim());
  if (parsed === null) return value;

  const [, sign, wholeRaw, fractionRaw = ""] = parsed;

  const whole = wholeRaw.replace(/^0+(?=\d)/, "");
  const trimmedFraction = fractionRaw.replace(/0+$/, "");
  const fraction =
    trimmedFraction.length >= MINIMUM_FRACTION_DIGITS
      ? trimmedFraction
      : trimmedFraction.padEnd(MINIMUM_FRACTION_DIGITS, "0");

  return `${sign}${CURRENCY_SYMBOL}${groupThousands(whole)}.${fraction}`;
}
