import {
  QUANTITY_INVALID,
  QUANTITY_NEGATIVE,
  QUANTITY_TOO_LARGE,
} from "@/lib/count-messages";
import { ValidationError } from "@/server/errors";

/**
 * A typed quantity, turned into something Postgres can be handed — or refused.
 *
 * IT IS THE ONLY PLACE IN THE PRODUCT THAT DECIDES WHAT A QUANTITY LOOKS LIKE (008 AC-7).
 * The endpoint, the no-JavaScript server action and the client all call this one function,
 * so a value the client queued is a value the server will accept, and a `400` therefore
 * means a forged request or a bug rather than a disagreement between two regexes. No other
 * module contains a numeric regular expression for a quantity.
 *
 * FOUR PROPERTIES, each of which has a criterion rather than a comment keeping it true.
 *
 *  1. EMPTY IS `null`, AND `null` IS NOT ZERO. `""`, `"   "` and `null` all mean *nobody
 *     has looked at this row*; `"0"` means *somebody looked and none is held*. That is
 *     Invariant 5, and the distinction the workbook's blank cell could not express — an
 *     empty input is never saved as `0` (008 AC-4, AC-5).
 *  2. IT REFUSES RATHER THAN ROUNDS. `21.61285` is not stored as `21.6129`:
 *     `specs/product-brief.md` says never round, and a fifth decimal place silently lost
 *     is exactly the kind of drift this product exists to remove. `Decimal(12, 4)` would
 *     round it without saying so, so the refusal happens here instead.
 *  3. IT NEVER CONVERTS THROUGH `Number`. `21.6128` tonnes and `0.475` units survive as
 *     strings from the browser to Postgres (`docs/architecture.md` § Money and
 *     quantities); the magnitude check counts digits rather than parsing a float, so
 *     nothing on this path is ever a JavaScript number (008 AC-29).
 *  4. IT IS PURE. No Prisma, no clock, no environment — which is why 008 AC-7 runs in
 *     `npm run test:unit` on a machine with no Postgres at all (008 AC-32), and why a
 *     client component may import it to check a value before queueing it.
 *
 * A DECIMAL COMMA IS ACCEPTED AND NORMALISED. `21,6128` is what an Irish phone keypad
 * offers some users and what the workbook's own authors sometimes typed; refusing it would
 * be refusing a correct count on a punctuation mark.
 */

/**
 * The shape of a canonical quantity: digits, optionally a point and up to four more.
 *
 * No sign — a negative quantity is refused with its own sentence, not with this one. No
 * exponent — `1e3` is a JavaScript idea, not a number anybody counts in a yard. The
 * integer part is deliberately unbounded here so that `100000000` reaches the magnitude
 * check and is told it is too large, rather than being told it is not a number.
 */
export const QUANTITY_PATTERN = /^\d+(?:\.\d{1,4})?$/;

/** `Decimal(12, 4)`: 12 digits in all, 4 of them after the point, so 8 before it. */
const MAX_INTEGER_DIGITS = 8;

/**
 * `"007"` is `"7"`, `"1.5000"` is `"1.5"`, `"0.0"` is `"0"`.
 *
 * Canonical form matters because the same number typed two ways must queue, send and
 * compare as one value — and because `"0"` has to read back as `"0"` (008 AC-5).
 */
function canonicalise(digits: string): string {
  const [whole, fraction = ""] = digits.split(".");

  const trimmedWhole = whole.replace(/^0+(?=\d)/, "");
  const trimmedFraction = fraction.replace(/0+$/, "");

  return trimmedFraction === "" ? trimmedWhole : `${trimmedWhole}.${trimmedFraction}`;
}

/**
 * The canonical decimal string for `raw`, or `null` when the row is *not counted*.
 *
 * Throws `ValidationError` with `field === "quantity"` — never a bare `Error`, so the
 * caller can put the sentence beside the row it names (008 AC-25, AC-27).
 */
export function parseQuantity(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  // A decimal comma is the same number; the trim comes second so `" 21,6128 "` works.
  const text = raw.replace(",", ".").trim();
  if (text === "") return null;

  // Checked before the shape, so a person who typed a minus sign is told about the minus
  // sign rather than about decimal places.
  if (text.startsWith("-")) {
    throw new ValidationError("quantity", QUANTITY_NEGATIVE);
  }

  if (!QUANTITY_PATTERN.test(text)) {
    throw new ValidationError("quantity", QUANTITY_INVALID);
  }

  const canonical = canonicalise(text);
  const [whole] = canonical.split(".");
  if (whole.length > MAX_INTEGER_DIGITS) {
    // Refused here so that `numeric field overflow` (SQLSTATE 22003) is a thing this
    // product never has to explain to a person standing in a yard (008 AC-27).
    throw new ValidationError("quantity", QUANTITY_TOO_LARGE);
  }

  return canonical;
}
