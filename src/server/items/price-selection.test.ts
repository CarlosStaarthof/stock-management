import { describe, expect, it } from "vitest";

import {
  priceAmountOf,
  selectCurrentPrice,
  toCurrentPrice,
  todayIso,
} from "@/server/items/price-selection";
import type { PriceRow } from "@/server/items/price-selection";

/**
 * Spec 006 AC-15's first half. No database (AC-32): #8 and #9 will call this same
 * function with a count date to decide `unitPriceSnapshot`, so it is tested where a
 * failure is cheapest to see.
 */
function price(id: string, effectiveFrom: string, amount = "10.00000000"): PriceRow {
  return { id, unitPrice: amount, currency: "EUR", effectiveFrom, label: null };
}

describe("selectCurrentPrice", () => {
  it("AC-15: a single past price is the current one", () => {
    const rows = [price("a", "2025-01-01")];

    expect(selectCurrentPrice(rows, "2026-09-10")?.id).toBe("a");
  });

  it("AC-15: with two past prices the later one wins", () => {
    const rows = [price("a", "2025-01-01"), price("b", "2026-01-01")];

    expect(selectCurrentPrice(rows, "2026-09-10")?.id).toBe("b");
    // Input order must not decide it.
    expect(selectCurrentPrice([...rows].reverse(), "2026-09-10")?.id).toBe("b");
  });

  it("AC-15: a price effective exactly on asOf wins", () => {
    const rows = [price("a", "2025-01-01"), price("b", "2026-09-10")];

    expect(selectCurrentPrice(rows, "2026-09-10")?.id).toBe("b");
  });

  it("AC-15: a future-only price gives null", () => {
    const rows = [price("future", "2026-10-01")];

    expect(selectCurrentPrice(rows, "2026-09-10")).toBeNull();
  });

  it("AC-15: an empty list gives null", () => {
    expect(selectCurrentPrice([], "2026-09-10")).toBeNull();
  });

  it("AC-15: a future row never displaces a past one", () => {
    const rows = [price("past", "2025-01-01"), price("future", "2099-01-01")];

    expect(selectCurrentPrice(rows, "2026-09-10")?.id).toBe("past");
  });

  it("AC-15: a malformed effectiveFrom is ignored rather than chosen", () => {
    const rows = [price("good", "2025-01-01"), price("bad", "not-a-date")];

    expect(selectCurrentPrice(rows, "2026-09-10")?.id).toBe("good");
  });
});

describe("toCurrentPrice and priceAmountOf", () => {
  it("AC-15: the winner's amount crosses the boundary as an unmodified string", () => {
    const rows = [price("a", "2025-01-01", "6.11764706")];

    const current = toCurrentPrice(rows, "2026-09-10");

    expect(current).toEqual({
      unitPrice: "6.11764706",
      currency: "EUR",
      effectiveFrom: "2025-01-01",
    });
    expect(priceAmountOf(current)).toBe("6.11764706");
  });

  it("AC-15 failure path: no price in force gives null on both", () => {
    expect(toCurrentPrice([], "2026-09-10")).toBeNull();
    expect(priceAmountOf(null)).toBeNull();
  });
});

describe("todayIso", () => {
  it("AC-13: the add-price form's default date is today, zero-padded", () => {
    expect(todayIso(new Date(2026, 8, 10))).toBe("2026-09-10");
    expect(todayIso(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("AC-13: it reads the local day, so a late-evening save is not dated tomorrow", () => {
    expect(todayIso(new Date(2026, 8, 10, 23, 59, 59))).toBe("2026-09-10");
  });
});
