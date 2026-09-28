import { randomInt } from "node:crypto";

import { describe, expect, it } from "vitest";

import { bodyShowsPrice } from "../e2e/support/stock-entry";

/**
 * `bodyShowsPrice`, the one search every e2e "no price in the body" check goes through
 * (coordinator ruling, 2026-09-28).
 *
 * The rule: the price counts as shown when its whole text stands with no ASCII letter or digit
 * immediately before or after it. A price with a `.` may carry trailing zeros before that
 * boundary. `Decimal#toString()` drops them, while `formatPriceExact` and the `Decimal(18, 8)`
 * column keep them (review finding H1).
 *
 * These cases prove both directions. Every shape this application gives a leaked price is found,
 * and the digits inside an identifier or inside a different number are not. One shape is found by
 * neither this search nor the substring search before it: a price of 1,000 or more, grouped by
 * thousands, as in `€1,234.00`. The euro-sign assertions beside every call cover it.
 *
 * EVERY SHARED CASE RUNS AGAINST FIVE PRICES: two integers and three decimals.
 * - The integer literal is the digits both real collisions held: a test name, then Next's
 *   server-action key.
 * - The decimal literal is the review's example.
 * - The other three are built at runtime, so no case can pass because of the particular digits
 *   it was written for. A decimal is built the way `Decimal#toString()` prints one, with a
 *   non-zero last digit.
 *
 * Each body is built around the price itself. A letter sits within the first two and the last
 * two characters of every identifier, and a "different number" is a digit run longer than the
 * price. Either way, any second, accidental match of a runtime price would still have a letter
 * or digit beside it, whatever digits were drawn. A decimal price holds the only `.` in those
 * bodies, so it can match nowhere else.
 */

/** A decimal as `Decimal#toString()` prints one: `places` fraction digits, the last never 0. */
function runtimeDecimal(places: 1 | 2): string {
  const whole = String(randomInt(1, 10_000));
  const last = String(randomInt(1, 10));
  return places === 1 ? `${whole}.${last}` : `${whole}.${String(randomInt(0, 10))}${last}`;
}

/**
 * `price` with its fraction padded to `places`: `formatPriceExact` pads to 2, and the
 * `Decimal(18, 8)` column's own text has 8. An integer gets a `.` and zeros.
 */
function padded(price: string, places: number): string {
  const [whole = "", fraction = ""] = price.split(".");
  return `${whole}.${fraction.padEnd(places, "0")}`;
}

const INTEGERS: readonly { label: string; price: string }[] = [
  { label: "the integer literal both collisions held", price: "890" },
  { label: "an integer built at runtime", price: String(randomInt(100, 100_000)) },
];

const DECIMALS: readonly { label: string; price: string }[] = [
  { label: "the review's one-decimal literal", price: "37.8" },
  { label: "a one-decimal price built at runtime", price: runtimeDecimal(1) },
  { label: "a two-decimal price built at runtime", price: runtimeDecimal(2) },
];

const PRICES = [...INTEGERS, ...DECIMALS];

/** Shapes a leaked price takes. Every one must be found. */
const STILL_CAUGHT: readonly { shape: string; body: (price: string) => string }[] = [
  { shape: "€<p> as formatPriceExact pads it", body: (p) => `<td>€${padded(p, 2)}</td>` },
  { shape: "€ <p>", body: (p) => `<span>€ ${p}</span>` },
  { shape: "padded, bare, with no euro", body: (p) => `<td>${padded(p, 2)}</td>` },
  { shape: "unpadded, bare, with no euro", body: (p) => `<td>${p}</td>` },
  { shape: '"<p>"', body: (p) => `<td data-price="${p}">` },
  { shape: '"unitPrice":"<p>"', body: (p) => `self.__next_f.push({"unitPrice":"${p}"})` },
  {
    shape: "the column's own text, to 8 places",
    body: (p) => `{"unitPrice":"${padded(p, 8)}"}`,
  },
  { shape: "<p>,00", body: (p) => `<td>${p},00</td>` },
  { shape: "the whole body", body: (p) => p },
  { shape: "at the very start", body: (p) => `${p} in the yard` },
  { shape: "at the very end", body: (p) => `the yard holds ${p}` },
  {
    shape: "after an identifier that also holds it",
    body: (p) => `<input name="$ACTION_KEY" value="kc${p}aba4ec2"/><td>${p}</td>`,
  },
];

/** The same digits where they are not a price. None may be found. */
const NO_LONGER_TRIPPED: readonly { shape: string; body: (price: string) => string }[] = [
  {
    shape: "a server-action key, kc<p>aba…",
    body: (p) => `<input type="hidden" name="$ACTION_KEY" value="kc${p}aba4ec2d57e0f4833e0b"/>`,
  },
  {
    shape: "a test name, …5f41bdc1<p>dade2",
    body: (p) => `<td>stock-entry-access-owner-5f41bdc1${p}dade2</td>`,
  },
  {
    shape: "a count cuid, cmx<p>…",
    body: (p) => `<a href="/stock-entry/counts/cmx${p}q0a7wz3k9e1b">Open</a>`,
  },
  { shape: "a different number, 1<p>", body: (p) => `<td>1${p}</td>` },
  { shape: "a different number, <p>5", body: (p) => `<td>${p}5</td>` },
  { shape: "a different number, <p>9", body: (p) => `<td>${p}9</td>` },
  { shape: "a different number, <p>07", body: (p) => `<td>${p}07</td>` },
  { shape: "letters on both sides, alone", body: (p) => `a${p}z` },
];

describe.each(PRICES)("bodyShowsPrice, with $label", ({ price }) => {
  it.each(STILL_CAUGHT)("still catches $shape", ({ body }) => {
    expect(bodyShowsPrice(body(price), price), body(price)).toBe(true);
  });

  it.each(NO_LONGER_TRIPPED)("is no longer tripped by $shape", ({ body }) => {
    expect(bodyShowsPrice(body(price), price), body(price)).toBe(false);
  });

  it("finds nothing in a body that does not hold the digits at all", () => {
    expect(bodyShowsPrice("<main><td>Count</td></main>", price)).toBe(false);
  });
});

describe("bodyShowsPrice, the review's two missed shapes, written out", () => {
  it("finds 37.8 as formatPriceExact prints it and as the column holds it", () => {
    expect(bodyShowsPrice("<td>€37.80</td>", "37.8")).toBe(true);
    expect(bodyShowsPrice('{"unitPrice":"37.80000000"}', "37.8")).toBe(true);
  });
});

describe.each(DECIMALS)("bodyShowsPrice, $label, is one token", ({ price }) => {
  const [whole = "", fraction = ""] = price.split(".");

  it("takes the whole text, and catches it where a currency sign or a space bounds it", () => {
    expect(bodyShowsPrice(`€${price}`, price)).toBe(true);
    expect(bodyShowsPrice(`${price} `, price)).toBe(true);
  });

  it("absorbs trailing zeros, however many, before the boundary", () => {
    expect(bodyShowsPrice(`<td>€${price}0</td>`, price)).toBe(true);
    expect(bodyShowsPrice(`<td>${price}00</td>`, price)).toBe(true);
    expect(bodyShowsPrice(`"${price}0000000"`, price)).toBe(true);
  });

  it("absorbs only zeros: a non-zero digit after them makes another number", () => {
    expect(bodyShowsPrice(`<td>${price}01</td>`, price)).toBe(false);
    expect(bodyShowsPrice(`<td>${padded(price, 8)}1</td>`, price)).toBe(false);
    expect(bodyShowsPrice(`<td>${price}0k</td>`, price)).toBe(false);
  });

  it("reads its `.` literally, not as any character", () => {
    expect(bodyShowsPrice(`<td>${whole}x${fraction}</td>`, price)).toBe(false);
    expect(bodyShowsPrice(`<td>${whole}0${fraction}</td>`, price)).toBe(false);
  });

  it("applies the boundary at both ends", () => {
    expect(bodyShowsPrice(`<td>9${price}</td>`, price)).toBe(false);
    expect(bodyShowsPrice(`<td>${price}9</td>`, price)).toBe(false);
    expect(bodyShowsPrice(`<td>k${price}</td>`, price)).toBe(false);
    expect(bodyShowsPrice(`<td>${price}k</td>`, price)).toBe(false);
  });

  it("is not found by its whole part alone", () => {
    expect(bodyShowsPrice(`<td>€${whole}</td>`, price)).toBe(false);
  });
});

describe.each(INTEGERS)("bodyShowsPrice, $label, is unchanged by H1", ({ price }) => {
  it("absorbs nothing: <p>0 and <p>00 are ten and a hundred times the price", () => {
    expect(bodyShowsPrice(`<td>${price}0</td>`, price)).toBe(false);
    expect(bodyShowsPrice(`<td>€${price}00</td>`, price)).toBe(false);
  });

  it("is still found before a point, as the substring search found it", () => {
    expect(bodyShowsPrice(`<td>€${price}.00</td>`, price)).toBe(true);
    expect(bodyShowsPrice(`"${price}.00000000"`, price)).toBe(true);
  });
});

describe("bodyShowsPrice, an empty price", () => {
  it("refuses to search rather than find a match between any two characters", () => {
    expect(() => bodyShowsPrice("<td></td>", "")).toThrow(/needs a price/);
  });
});
