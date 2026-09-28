import { randomInt } from "node:crypto";

import { describe, expect, it } from "vitest";

import { bodyShowsPrice } from "../e2e/support/stock-entry";

/**
 * `bodyShowsPrice`, the one search every e2e "no price in the body" check goes through
 * (coordinator ruling, 2026-09-28).
 *
 * The rule: the price counts as shown when its whole text stands with no ASCII letter or digit
 * immediately before or after it. These cases prove both directions: every shape a leaked price
 * takes is still found, so nothing is weaker, and the digits inside an identifier or inside a
 * different number are not.
 *
 * EVERY CASE RUNS AGAINST THREE PRICES. The literal is the digits both real collisions held: a
 * test name, then Next's server-action key. The other two are built at runtime, so no case can
 * pass because of the particular digits it was written for. Each body is built around the price
 * itself. A letter sits within the first two and the last two characters of every identifier,
 * so no run of three or more digits touches either end of it. A second, accidental match of
 * a runtime price would therefore still have a letter or digit on each side, whatever digits
 * were drawn. A decimal price holds the only `.` in its body, so it can match nowhere else.
 */

const PRICES: readonly { label: string; price: string }[] = [
  { label: "the literal both collisions held", price: "890" },
  { label: "an integer built at runtime", price: String(randomInt(100, 100_000)) },
  {
    label: "a decimal built at runtime",
    price: `${String(randomInt(1, 10_000))}.${String(randomInt(1, 100))}`,
  },
];

/** Shapes a leaked price takes. Every one must be found. */
const STILL_CAUGHT: readonly { shape: string; body: (price: string) => string }[] = [
  { shape: "€<p>.00", body: (p) => `<td>€${p}.00</td>` },
  { shape: "€ <p>", body: (p) => `<span>€ ${p}</span>` },
  { shape: '"<p>"', body: (p) => `<td data-price="${p}">` },
  { shape: '"unitPrice":"<p>"', body: (p) => `self.__next_f.push({"unitPrice":"${p}"})` },
  { shape: "><p><", body: (p) => `<td data-testid="x">${p}</td>` },
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

describe("bodyShowsPrice, a decimal price is one token", () => {
  const price = `${String(randomInt(1, 10_000))}.${String(randomInt(1, 100))}`;
  const [whole = "", fraction = ""] = price.split(".");

  it("takes the whole text, and catches it where a currency sign or a space bounds it", () => {
    expect(bodyShowsPrice(`€${price}`, price)).toBe(true);
    expect(bodyShowsPrice(`${price} `, price)).toBe(true);
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

describe("bodyShowsPrice, an empty price", () => {
  it("refuses to search rather than find a match between any two characters", () => {
    expect(() => bodyShowsPrice("<td></td>", "")).toThrow(/needs a price/);
  });
});
