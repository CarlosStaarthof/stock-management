import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { isHeld, partitionHeld } from "@/lib/held";

/**
 * Spec 010 AC-10, and it needs no database: held is a question about a decimal string.
 */
describe("isHeld", () => {
  it("AC-10: answers the six cases the criterion names", () => {
    expect(isHeld(null)).toBe(false);
    expect(isHeld("0")).toBe(false);
    expect(isHeld("0.0000")).toBe(false);
    expect(isHeld("-3")).toBe(false);
    expect(isHeld("0.0001")).toBe(true);
    expect(isHeld("21.6128")).toBe(true);
  });

  it("AC-10: a fourth decimal place is stock, and the scale it is stored at is not", () => {
    // `Decimal(12, 4)` is what the column is, so the same quantity reaches this function
    // spelled several ways in the life of one count.
    expect(isHeld("0.0001")).toBe(true);
    expect(isHeld("0.00010000")).toBe(true);
    expect(isHeld("0.475")).toBe(true);
    expect(isHeld("0.4750")).toBe(true);
    expect(isHeld("00000.0000")).toBe(false);
  });

  it("AC-10: an unreadable quantity is not held, and does not throw", () => {
    expect(isHeld("")).toBe(false);
    expect(isHeld("banana")).toBe(false);
    expect(isHeld("1e4")).toBe(false);
  });
});

describe("partitionHeld", () => {
  const LINES = [
    { itemId: "a", quantity: "21.6128" },
    { itemId: "b", quantity: null },
    { itemId: "c", quantity: "0" },
    { itemId: "d", quantity: "0.0001" },
    { itemId: "e", quantity: "0.0000" },
    { itemId: "f", quantity: "9" },
  ] as const;

  it("AC-10: splits held from hidden, preserving input order in both", () => {
    const { held, hidden } = partitionHeld(LINES);

    expect(held.map((line) => line.itemId)).toEqual(["a", "d", "f"]);
    expect(hidden.map((line) => line.itemId)).toEqual(["b", "c", "e"]);
  });

  it("AC-10: held.length + hidden.length === lines.length, for every input", () => {
    const inputs: { quantity: string | null }[][] = [
      [],
      [{ quantity: null }],
      [{ quantity: "0" }, { quantity: "0" }],
      [...LINES],
    ];

    for (const input of inputs) {
      const { held, hidden } = partitionHeld(input);

      expect(held.length + hidden.length).toBe(input.length);
    }
  });

  it("AC-10: null and 0 both hide, and stay distinguishable afterwards", () => {
    // #8's whole feature is that a blank cell and a counted zero are different facts. The
    // held view hides both; it must not merge them, because `?show=all` renders `Not
    // counted` for one and `0` for the other.
    const { hidden } = partitionHeld(LINES);

    expect(hidden.map((line) => line.quantity)).toEqual([null, "0", "0.0000"]);
  });

  it("AC-10: it copies lines rather than rewriting them, and mutates nothing", () => {
    const input = [{ itemId: "a", quantity: "0" }, { itemId: "b", quantity: "5" }];
    const before = structuredClone(input);

    const { held, hidden } = partitionHeld(input);

    expect(input).toEqual(before);
    expect(held[0]).toBe(input[1]);
    expect(hidden[0]).toBe(input[0]);
  });
});

describe("AC-10: the module decides on the decimal, never on a JavaScript number", () => {
  it("AC-10: held.ts contains no Number(, parseFloat, toFixed or Math.round", () => {
    const code = readFileSync("src/lib/held.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

    expect(code).toContain("compareDecimals");

    expect(code).not.toMatch(/Number\s*\(/);
    expect(code).not.toMatch(/parseFloat/);
    expect(code).not.toMatch(/toFixed/);
    expect(code).not.toMatch(/Math\.round/);
  });

  it("AC-10, AC-18: it imports nothing from src/server, so 006 AC-33's fence stays green", () => {
    const imports = [...readFileSync("src/lib/held.ts", "utf8").matchAll(/from "([^"]+)"/g)].map(
      (match) => match[1],
    );

    expect(imports).toContain("@/lib/money");
    for (const specifier of imports) {
      if (/(^|\/)server(\/|$)/.test(specifier)) {
        expect(specifier, `held.ts imports ${specifier}`).toBe("@/server/errors");
      }
    }
  });

  it("006 AC-31: it names the price column nowhere", () => {
    expect(readFileSync("src/lib/held.ts", "utf8")).not.toContain("unitPrice");
  });
});
