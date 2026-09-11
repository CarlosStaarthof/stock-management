import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { formatPriceExact } from "@/lib/money";

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
