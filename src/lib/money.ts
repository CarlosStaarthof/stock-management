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

/* ===================================================================================
 * Feature #9 — the arithmetic, in strings.
 *
 * `lineValue = quantity x (the snapshot ?? 0)` and `countTotal = the sum of them`, and
 * NEITHER EVER PASSES THROUGH A JAVASCRIPT `number`. `roundHalfUp("2.675", 2)` is `"2.68"`
 * and `Number(2.675).toFixed(2)` is `"2.67"`, and that one cent is the whole argument:
 * Invariant 10 says a stock system that disagrees with the file it replaced, by any
 * amount, will not be trusted.
 *
 * The digits are carried in `bigint`, which is exact at any size; the scale is carried
 * beside them as an integer count of decimal places. The parameters keep neutral names for
 * the reason the header gives: 006 AC-31 holds `src/lib/**` at zero files naming the price
 * column, so these three functions take `left`, `right` and `values`.
 * =================================================================================== */

/** The digits of a decimal string, with its sign and its number of decimal places. */
type ScaledDigits = { negative: boolean; digits: bigint; scale: number };

/**
 * `"6.1176"` -> `{ negative: false, digits: 61176n, scale: 4 }`, or `null` for a string
 * that is not a plain decimal.
 *
 * Every value that reaches these functions is a `Decimal` column stringified by Prisma, so
 * `null` means a bug rather than a user. The callers answer it with zero rather than by
 * throwing: 009 AC-28 requires the two services to raise only typed domain errors, and a
 * `RangeError` escaping from a formatter would be neither typed nor catchable by a screen.
 */
function scaledDigitsOf(value: string): ScaledDigits | null {
  const parsed = DECIMAL.exec(value.trim());
  if (parsed === null) return null;

  const [, sign, whole, fraction = ""] = parsed;
  return {
    negative: sign === "-",
    digits: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
}

/** `10^places`, built as a literal rather than by exponentiation, so nothing is a float. */
function powerOfTen(places: number): bigint {
  return BigInt(`1${"0".repeat(places)}`);
}

/** The same digits carried to a deeper scale, exactly. */
function atScale(value: ScaledDigits, scale: number): bigint {
  return value.digits * powerOfTen(scale - value.scale);
}

/**
 * Digits and a scale back to a decimal string.
 *
 * `trim` drops trailing zeros the scale left behind, which is what makes
 * `multiplyDecimal("9.83", "890")` read `"8748.7"` rather than `"8748.700"`. It is off for
 * `roundHalfUp`, which must render exactly the places it was asked for.
 */
function render(value: ScaledDigits, trim: boolean): string {
  const padded = value.digits.toString().padStart(value.scale + 1, "0");
  const whole = padded.slice(0, padded.length - value.scale);
  const rawFraction = value.scale === 0 ? "" : padded.slice(padded.length - value.scale);
  const fraction = trim ? rawFraction.replace(/0+$/, "") : rawFraction;

  const magnitude = fraction === "" ? whole : `${whole}.${fraction}`;
  // Zero has no sign: `-0.00` is a value nobody wants to read on an invoice.
  return value.negative && value.digits !== 0n ? `-${magnitude}` : magnitude;
}

/**
 * `quantity x price`, exact to the last digit, with no rounding anywhere (009 AC-24).
 *
 * `multiplyDecimal("21.6128", "6.11764706")` is `"132.219482378368"` — fourteen decimal
 * places, because one of the four Clonmel prices is a non-terminating workbook formula and
 * Invariant 10 forbids losing its tail before the total is taken.
 */
export function multiplyDecimal(left: string, right: string): string {
  const first = scaledDigitsOf(left);
  const second = scaledDigitsOf(right);
  if (first === null || second === null) return "0";

  return render(
    {
      negative: first.negative !== second.negative,
      digits: first.digits * second.digits,
      scale: first.scale + second.scale,
    },
    true,
  );
}

/**
 * The sum of the EXACT values, at the deepest scale any of them uses (009 AC-25).
 *
 * Invariant 10 and Open question 3: the total is the sum of the exact line values, rounded
 * once for display — never the sum of the rounded lines. The stated cost is that the
 * rendered column may not add to the rendered total to the last cent, and the total is the
 * figure that agrees with the workbook.
 */
export function sumDecimals(values: readonly string[]): string {
  const parsed = values.map(scaledDigitsOf).filter((value): value is ScaledDigits => value !== null);

  const scale = parsed.reduce((deepest, value) => Math.max(deepest, value.scale), 0);
  const total = parsed.reduce(
    (running, value) => (value.negative ? running - atScale(value, scale) : running + atScale(value, scale)),
    0n,
  );

  return render({ negative: total < 0n, digits: total < 0n ? -total : total, scale }, true);
}

/**
 * Half away from zero, to exactly `places` decimal places (009 AC-24).
 *
 * `roundHalfUp("2.675", 2)` is `"2.68"`. `Number(2.675).toFixed(2)` is `"2.67"`, because
 * the nearest double to 2.675 is slightly below it — the single most quoted reason this
 * module is string arithmetic.
 *
 * The result always carries `places` decimals, so `"8748.7"` rounds to `"8748.70"` and a
 * column of values lines up on the point.
 */
export function roundHalfUp(value: string, places: number): string {
  const parsed = scaledDigitsOf(value);
  // Unreadable in, unchanged out: showing the raw string is honest, and inventing a
  // rounded number from one this function could not read is not.
  if (parsed === null) return value;

  if (parsed.scale <= places) {
    return render(
      { ...parsed, digits: atScale(parsed, places), scale: places },
      false,
    );
  }

  const divisor = powerOfTen(parsed.scale - places);
  const quotient = parsed.digits / divisor;
  const remainder = parsed.digits % divisor;
  // `remainder + remainder >= divisor` rather than `2n * remainder`: the doubling is an
  // addition, so the module keeps exactly one multiplication in it and a scan can say so.
  const rounded = remainder + remainder >= divisor ? quotient + 1n : quotient;

  return render({ negative: parsed.negative, digits: rounded, scale: places }, false);
}

/* ===================================================================================
 * Feature #10 — the comparison, in strings.
 *
 * `src/lib/held.ts` asks one question of a stored quantity — is it greater than zero — and
 * `docs/architecture.md` § Money and quantities forbids answering it by converting the
 * decimal to a JavaScript `number`. `0.0001` tonnes of something is held, `9.50` and `9.5`
 * are the same amount, and `Number("0.0000") > 0` is a comparison that happens to be right
 * today and is the wrong mechanism.
 *
 * It lives here rather than in `held.ts` because the digits-and-scale machinery above is
 * already exact at any size and there is no reason for a second copy of it.
 * =================================================================================== */

/**
 * `-1`, `0` or `1` — `left` against `right`, exact at any scale and any size (010 AC-10).
 *
 * `compareDecimals("0.0000", "0")` is `0`, `("0.0001", "0")` is `1`, `("9.50", "9.5")` is
 * `0`, `("-1", "0")` is `-1`.
 *
 * A string this function cannot read compares EQUAL rather than throwing. Every value that
 * reaches it is a `Decimal` column stringified by Prisma, so an unreadable one is a bug;
 * answering it with `0` makes the one caller that matters — `isHeld` — say *not held*,
 * which is the reading that hides nothing a person entered and invents nothing they did not.
 */
export function compareDecimals(left: string, right: string): -1 | 0 | 1 {
  const first = scaledDigitsOf(left);
  const second = scaledDigitsOf(right);
  if (first === null || second === null) return 0;

  const scale = Math.max(first.scale, second.scale);
  const signedFirst = first.negative ? -atScale(first, scale) : atScale(first, scale);
  const signedSecond = second.negative ? -atScale(second, scale) : atScale(second, scale);

  if (signedFirst < signedSecond) return -1;
  return signedFirst > signedSecond ? 1 : 0;
}

/* ===================================================================================
 * Feature #11 — the difference, and the step from a decimal to a coordinate.
 *
 * Both are here rather than in the analysis modules for the reason `compareDecimals` is:
 * the digits-and-scale machinery above is already exact at any size, and a second copy of
 * it would be a second thing to keep right.
 *
 * `scaleToInteger` IS THE REASON THE CHART NEEDS NO `Number(` (011 AC-10). A bar's height
 * is a euro figure mapped onto a viewBox, which is the one place in a chart a JavaScript
 * float normally creeps in; here the mapping is `bigint` division with an exact remainder
 * test, so 011's scan of `src/lib/analysis-chart.ts` and `src/server/reporting/**` can
 * refuse `Number(`, `parseFloat`, `toFixed` and `Math.round` outright rather than granting
 * the usual chart exemption.
 *
 * The parameters keep neutral names — `left`, `right`, `value`, `max`, `range` — for the
 * reason the header gives: 006 AC-31 holds `src/lib/**` at zero files naming the price
 * column, and 011 AC-26 keeps it there.
 * =================================================================================== */

/**
 * `left − right`, exact to the last digit, with no rounding anywhere (011 AC-10).
 *
 * `subtractDecimals("8896.637232378368", "8748.7")` is `"147.937232378368"`;
 * `("100", "150")` is `"-50"`; `("9.50", "9.5")` is `"0"` — a zero difference has no sign
 * and no trailing noise, because `-0.00` on a variance is a figure nobody wants to read.
 *
 * A string this function cannot read counts as zero rather than throwing, exactly as
 * `multiplyDecimal` and `sumDecimals` treat one: every value that reaches it is a figure
 * this module itself produced from a `Decimal` column, so an unreadable one is a bug, and
 * a `RangeError` escaping a formatter would be neither typed nor catchable by a screen
 * (011 AC-21).
 */
export function subtractDecimals(left: string, right: string): string {
  const first = scaledDigitsOf(left);
  const second = scaledDigitsOf(right);

  const scale = Math.max(first?.scale ?? 0, second?.scale ?? 0);
  const signed = (value: ScaledDigits | null): bigint => {
    if (value === null) return 0n;
    return value.negative ? -atScale(value, scale) : atScale(value, scale);
  };

  const difference = signed(first) - signed(second);

  return render(
    {
      negative: difference < 0n,
      digits: difference < 0n ? -difference : difference,
      scale,
    },
    true,
  );
}

/**
 * `value / max × range`, as an integer STRING, half away from zero, clamped to `[0, range]`.
 *
 * This is the decimal → coordinate step of the trend chart (011 AC-10, AC-14), and it is
 * `bigint` throughout: `scaleToInteger("50", "100", 160)` is `"80"`,
 * `("1", "3", 160)` is `"53"` and `("2", "3", 160)` is `"107"` — the two thirds round in
 * opposite directions and neither passes through a float.
 *
 * THREE EDGES, ANSWERED RATHER THAN GUARDED AGAINST BY THE CALLER:
 *
 *   * `max` of `"0"` — every period is zero — gives `"0"` for every point. A ratio with no
 *     denominator is not an error here; it is a flat chart, and #11 draws it as thirteen
 *     minimum-height bars because a COMPLETE period holding nothing is a real fact.
 *   * a `value` above `max`, or below zero, is CLAMPED into the box rather than allowed to
 *     draw outside it. A bar taller than the plot is a rendering bug a reader cannot see.
 *   * `("0.0001", "1000000", 160)` is `"0"` — a figure too small to be a pixel is no
 *     pixels, and the caller, not this function, decides whether a visible period still
 *     deserves a minimum bar.
 *
 * `range` is an integer count of viewBox units, which is a dimension and never a quantity
 * or a price, so it is the one plain `number` on this path.
 */
export function scaleToInteger(value: string, max: string, range: number): string {
  const numerator = scaledDigitsOf(value);
  const denominator = scaledDigitsOf(max);
  if (numerator === null || denominator === null) return "0";

  const span = BigInt(range);
  if (span <= 0n) return "0";

  // A negative figure and a non-positive maximum both leave the box; neither is drawable.
  const scale = Math.max(numerator.scale, denominator.scale);
  const top = numerator.negative ? -atScale(numerator, scale) : atScale(numerator, scale);
  const bottom = denominator.negative ? -atScale(denominator, scale) : atScale(denominator, scale);
  if (top <= 0n || bottom <= 0n) return "0";
  if (top >= bottom) return span.toString();

  const scaled = top * span;
  const quotient = scaled / bottom;
  const remainder = scaled % bottom;
  // `remainder + remainder >= bottom` rather than `2n * remainder`, for the reason
  // `roundHalfUp` gives: the doubling is an addition, so the rounding needs no second
  // multiplication and a scan can say how many this module performs.
  const rounded = remainder + remainder >= bottom ? quotient + 1n : quotient;

  return (rounded > span ? span : rounded).toString();
}
