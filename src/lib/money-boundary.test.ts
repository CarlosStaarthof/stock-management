import { describe, expect, it } from "vitest";

import {
  assertNoMoneyKeys,
  deepKeys,
  moneyKeysIn,
  passwordKeysIn,
} from "@/lib/money-boundary";

// The fixture AC-19 names, character for character.
const WITH_MONEY = { line: { unitPriceSnapshot: 1, totals: { lineValue: 2 } } };
const WITHOUT_MONEY = {
  id: "c_1",
  line: { item: "White Extrusion 80/20", quantity: "9.8300", unit: "Each", note: null },
};

describe("deepKeys", () => {
  it("AC-19: reports keys at every depth, through arrays", () => {
    const keys = deepKeys({ a: 1, b: { c: 2 }, d: [{ e: 3 }] });

    expect(keys.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("AC-19: reports nothing for primitives, null and an empty object", () => {
    expect(deepKeys(null)).toEqual([]);
    expect(deepKeys("price")).toEqual([]);
    expect(deepKeys(42)).toEqual([]);
    expect(deepKeys({})).toEqual([]);
  });
});

describe("assertNoMoneyKeys", () => {
  it("AC-19: fails on { line: { unitPriceSnapshot, totals: { lineValue } } }", () => {
    expect(moneyKeysIn(WITH_MONEY).sort()).toEqual(["lineValue", "totals", "unitPriceSnapshot"]);
    expect(() => assertNoMoneyKeys(WITH_MONEY, "/api/example")).toThrowError(
      /unitPriceSnapshot/,
    );
    expect(() => assertNoMoneyKeys(WITH_MONEY, "/api/example")).toThrowError(/\/api\/example/);
  });

  it("AC-19: passes on a body with no monetary key", () => {
    expect(moneyKeysIn(WITHOUT_MONEY)).toEqual([]);
    expect(() => assertNoMoneyKeys(WITHOUT_MONEY)).not.toThrow();
  });

  it("AC-19: a monetary key hidden inside an array is still found", () => {
    expect(moneyKeysIn({ lines: [{ item: "A" }, { item: "B", amount: 3 }] })).toEqual(["amount"]);
  });
});

describe("passwordKeysIn", () => {
  it("AC-20: finds passwordHash at any depth, and nothing in a clean body", () => {
    expect(passwordKeysIn({ user: { id: "u", passwordHash: "$2b$10$…" } })).toEqual([
      "passwordHash",
    ]);
    expect(passwordKeysIn(WITHOUT_MONEY)).toEqual([]);
  });
});
