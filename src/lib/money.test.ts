import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  compareDecimals,
  formatPriceExact,
  multiplyDecimal,
  roundHalfUp,
  sumDecimals,
} from "@/lib/money";

/**
 * Spec 006 AC-15's second half, and AC-32: it runs with no database, because the money
 * this feature renders is a string all the way from Postgres to the page.
 */
describe("formatPriceExact", () => {
  it("AC-15: renders the four values the criterion names, exactly", () => {
    expect(formatPriceExact("6.11764706")).toBe("€6.11764706");
    expect(formatPriceExact("33.09000000")).toBe("€33.09");
    expect(formatPriceExact("1000.00000000")).toBe("€1,000.00");
    expect(formatPriceExact("0.00000000")).toBe("€0.00");
  });

  it("AC-15: keeps at least two decimals and groups thousands", () => {
    expect(formatPriceExact("5")).toBe("€5.00");
    expect(formatPriceExact("5.1")).toBe("€5.10");
    expect(formatPriceExact("1234567.5")).toBe("€1,234,567.50");
    expect(formatPriceExact("100")).toBe("€100.00");
    expect(formatPriceExact("1000")).toBe("€1,000.00");
  });

  it("AC-15: never rounds a value a JavaScript number could not hold", () => {
    // 0.1 + 0.2 territory: 17 significant digits survive because nothing is arithmetic.
    expect(formatPriceExact("9007199254.74099999")).toBe("€9,007,199,254.74099999");
    expect(formatPriceExact("0.00000001")).toBe("€0.00000001");
  });

  it("AC-15 failure path: an unreadable string is returned unchanged, never as NaN", () => {
    expect(formatPriceExact("")).toBe("");
    expect(formatPriceExact("abc")).toBe("abc");
    expect(formatPriceExact("€5")).toBe("€5");
  });

  it("AC-15: the module converts nothing through Number", () => {
    // The scan is on CODE, not on prose: the module's own doc comment names the four
    // things it must not do, which is the whole reason they are worth asserting.
    const code = readFileSync("src/lib/money.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(code).toContain("formatPriceExact");
    expect(code).not.toMatch(/\bNumber\s*\(/);
    expect(code).not.toMatch(/\bparseFloat\b/);
    expect(code).not.toMatch(/\btoFixed\b/);
    expect(code).not.toMatch(/\bIntl\b/);
  });
});

/**
 * Spec 009 AC-24 and AC-25's rounding half: the value arithmetic, with no database
 * (009 AC-31). Every figure the criterion quotes is asserted as a literal string.
 */
describe("AC-24: multiplyDecimal is exact", () => {
  it("AC-24: the four products the criterion names", () => {
    expect(multiplyDecimal("9.83", "890")).toBe("8748.7");
    expect(multiplyDecimal("21.6128", "6.11764706")).toBe("132.219482378368");
    expect(multiplyDecimal("0.475", "33.09")).toBe("15.71775");
    expect(multiplyDecimal("0", "890")).toBe("0");
  });

  it("AC-24: a quantity times nothing is nothing, and zero carries no sign", () => {
    expect(multiplyDecimal("890", "0")).toBe("0");
    expect(multiplyDecimal("0.00000000", "0")).toBe("0");
    expect(multiplyDecimal("-0", "5")).toBe("0");
  });

  it("AC-24: it keeps digits a double would lose", () => {
    // 0.1 * 0.2 is 0.020000000000000004 in IEEE 754. It is not here.
    expect(multiplyDecimal("0.1", "0.2")).toBe("0.02");
    expect(multiplyDecimal("21.6128", "0.00000001")).toBe("0.000000216128");
    expect(multiplyDecimal("99999999.9999", "999999999.99999999")).toBe(
      "99999999999899999.000000000001",
    );
  });

  it("AC-24: a Decimal(18,8) string with trailing zeros multiplies as the number it is", () => {
    // Prisma hands back `33.09000000`; the product must read as the workbook reads it.
    expect(multiplyDecimal("0.475", "33.09000000")).toBe("15.71775");
  });

  it("AC-24: a negative quantity keeps its sign, and two negatives do not", () => {
    expect(multiplyDecimal("-2", "3")).toBe("-6");
    expect(multiplyDecimal("-2", "-3")).toBe("6");
  });
});

describe("AC-24, AC-25: sumDecimals adds the exact values", () => {
  it("AC-24: the sum the criterion names, at the deepest scale of its parts", () => {
    expect(sumDecimals(["8748.7", "132.219482378368", "0"])).toBe("8880.919482378368");
  });

  it("AC-24: the empty sum is zero, not an empty string", () => {
    expect(sumDecimals([])).toBe("0");
    expect(sumDecimals(["0", "0"])).toBe("0");
  });

  it("AC-25: the five-line fixture totals exactly what the criterion quotes", () => {
    const lines = ["8748.7", "132.219482378368", "15.71775", "0", "0"];

    expect(sumDecimals(lines)).toBe("8896.637232378368");
  });

  it("AC-24: it is associative over the scales, so the order of the lines cannot change it", () => {
    const lines = ["0.1", "0.2", "132.219482378368", "8748.7"];

    expect(sumDecimals(lines)).toBe(sumDecimals([...lines].reverse()));
    expect(sumDecimals(lines)).toBe("8881.219482378368");
  });
});

describe("AC-24, AC-25: roundHalfUp, and the cent Number.toFixed loses", () => {
  it("AC-24: the four results the criterion names", () => {
    expect(roundHalfUp("132.219482378368", 2)).toBe("132.22");
    expect(roundHalfUp("2.675", 2)).toBe("2.68");
    expect(roundHalfUp("0.005", 2)).toBe("0.01");
    expect(roundHalfUp("8748.7", 2)).toBe("8748.70");
  });

  it("AC-24: 2.675 is the whole argument for string arithmetic", () => {
    // The comparison this module exists to win. Asserted rather than asserted-about.
    expect(roundHalfUp("2.675", 2)).not.toBe("2.67");
    expect(formatPriceExact(roundHalfUp("2.675", 2))).toBe("€2.68");
  });

  it("AC-24: it always renders exactly the places asked for", () => {
    expect(roundHalfUp("5", 2)).toBe("5.00");
    expect(roundHalfUp("0", 2)).toBe("0.00");
    expect(roundHalfUp("8896.637232378368", 0)).toBe("8897");
    expect(roundHalfUp("1.005", 4)).toBe("1.0050");
  });

  it("AC-24: half goes away from zero on both sides, and zero keeps no sign", () => {
    expect(roundHalfUp("-2.675", 2)).toBe("-2.68");
    // `-0.00` is a value nobody wants to read on a summary, so a rounded zero is `0.00`.
    expect(roundHalfUp("-0.004", 2)).toBe("0.00");
  });

  it("AC-24 failure path: a string it cannot read comes back unchanged, never as NaN", () => {
    expect(roundHalfUp("abc", 2)).toBe("abc");
    expect(multiplyDecimal("abc", "2")).toBe("0");
    expect(sumDecimals(["abc", "2"])).toBe("2");
  });
});

describe("AC-25: the total is the sum of the exact lines, rounded once", () => {
  it("AC-25: the two orders differ, and the service returns the former", () => {
    // Open question 3, stated rather than hidden. Three lines of 0.005 each: rounding
    // first gives three cents, rounding once gives two - and two is what the workbook has.
    const lines = ["0.005", "0.005", "0.005"];

    const roundedOnce = roundHalfUp(sumDecimals(lines), 2);
    const sumOfRounded = sumDecimals(lines.map((line) => roundHalfUp(line, 2)));

    expect(roundedOnce).toBe("0.02");
    expect(sumOfRounded).toBe("0.03");
    expect(roundedOnce).not.toBe(sumOfRounded);
  });
});

describe("AC-24: no JavaScript number touches money in this module", () => {
  const code = readFileSync("src/lib/money.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  it("AC-24: the five forbidden spellings appear nowhere in the code", () => {
    expect(code).toContain("multiplyDecimal");
    expect(code).toContain("sumDecimals");
    expect(code).toContain("roundHalfUp");

    expect(code).not.toMatch(/\bNumber\s*\(/);
    expect(code).not.toMatch(/\bparseFloat\b/);
    expect(code).not.toMatch(/\btoFixed\b/);
    expect(code).not.toMatch(/\bMath\.round\b/);
  });

  it("AC-24: there is exactly ONE multiplication, and TypeScript proves both sides are bigint", () => {
    // `*` is not banned outright - it is banned on a price, a quantity or a value. The
    // module contains one, between two `bigint` digit strings; mixing a `bigint` with a
    // `number` is a compile error, so `npm run typecheck` is what proves the operands.
    // The OPERATOR, not the character: `(\d*)` inside the decimal pattern is not one.
    const multiplications = code.split("\n").filter((line) => /\s\*\s/.test(line));

    // No exponentiation either, which is why `powerOfTen` builds a literal.
    expect(code).not.toMatch(/\*\*/);

    expect(multiplications.map((line) => line.trim())).toEqual([
      "return value.digits * powerOfTen(scale - value.scale);",
      "digits: first.digits * second.digits,",
    ]);
    expect(code).toMatch(/digits:\s*bigint/);
  });

  it("AC-24: the module still names the price column nowhere (006 AC-31)", () => {
    expect(readFileSync("src/lib/money.ts", "utf8")).not.toContain("unitPrice");
  });
});

/**
 * Spec 010 AC-10. `isHeld` is one question asked of a stored quantity, and this is the
 * comparison it is asked with: exact, at any scale, and never through a JS number.
 */
describe("compareDecimals", () => {
  it("AC-10: answers the five comparisons the criterion names", () => {
    expect(compareDecimals("0.0000", "0")).toBe(0);
    expect(compareDecimals("0.0001", "0")).toBe(1);
    expect(compareDecimals("9.50", "9.5")).toBe(0);
    expect(compareDecimals("10", "9")).toBe(1);
    expect(compareDecimals("-1", "0")).toBe(-1);
  });

  it("AC-10: trailing zeros are noise and leading zeros are not a value", () => {
    // `Decimal(12, 4)` reads `0` back as `0.0000` and `21.6128` as itself, so a held test
    // that compared the STRINGS would call a counted zero held.
    expect(compareDecimals("21.6128", "0.0000")).toBe(1);
    expect(compareDecimals("0.0000", "0.00000000")).toBe(0);
    expect(compareDecimals("007", "7")).toBe(0);
    expect(compareDecimals("-0", "0")).toBe(0);
  });

  it("AC-10: it is exact past the range a double is, and antisymmetric", () => {
    // 9007199254740993 is the first integer a `number` cannot hold; as a pair of doubles
    // these two compare EQUAL, which is the failure mode this module exists to avoid.
    expect(compareDecimals("9007199254740993", "9007199254740992")).toBe(1);
    expect(compareDecimals("9007199254740992", "9007199254740993")).toBe(-1);

    expect(compareDecimals("0.10000000000000001", "0.1")).toBe(1);
    expect(compareDecimals("-3", "-4")).toBe(1);
    expect(compareDecimals("-4", "-3")).toBe(-1);
  });

  it("AC-10: a string it cannot read compares equal rather than throwing", () => {
    // A service must raise only typed domain errors (AC-17), and a `RangeError` escaping
    // from a comparator would be neither typed nor catchable by a screen.
    expect(compareDecimals("banana", "0")).toBe(0);
    expect(compareDecimals("0", "")).toBe(0);
    expect(compareDecimals("1e4", "0")).toBe(0);
  });

  it("AC-10: the comparison itself uses no JavaScript number", () => {
    const code = readFileSync("src/lib/money.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(code).toContain("export function compareDecimals");
    expect(code).not.toMatch(/\bNumber\s*\(/);
    expect(code).not.toMatch(/\bparseFloat\b/);
    expect(code).not.toMatch(/\btoFixed\b/);
    expect(code).not.toMatch(/\bMath\.round\b/);
  });
});
