import { describe, expect, it } from "vitest";

import { reviewReasons } from "@/server/items/review-reasons";
import type { ReviewReason } from "@/types/item-master";

/**
 * Spec 006 AC-18's first half: all eight combinations of the three facts, with no
 * database (AC-32).
 */
const COMBINATIONS: {
  supplierId: string | null;
  unitLabel: string | null;
  hasPrice: boolean;
  expected: ReviewReason[];
}[] = [
  { supplierId: "sup_1", unitLabel: "20 Kg", hasPrice: true, expected: [] },
  { supplierId: "sup_1", unitLabel: "20 Kg", hasPrice: false, expected: ["MISSING_PRICE"] },
  { supplierId: "sup_1", unitLabel: null, hasPrice: true, expected: ["MISSING_UNIT"] },
  {
    supplierId: "sup_1",
    unitLabel: null,
    hasPrice: false,
    expected: ["MISSING_UNIT", "MISSING_PRICE"],
  },
  { supplierId: null, unitLabel: "20 Kg", hasPrice: true, expected: ["MISSING_SUPPLIER"] },
  {
    supplierId: null,
    unitLabel: "20 Kg",
    hasPrice: false,
    expected: ["MISSING_SUPPLIER", "MISSING_PRICE"],
  },
  {
    supplierId: null,
    unitLabel: null,
    hasPrice: true,
    expected: ["MISSING_SUPPLIER", "MISSING_UNIT"],
  },
  {
    supplierId: null,
    unitLabel: null,
    hasPrice: false,
    expected: ["MISSING_SUPPLIER", "MISSING_UNIT", "MISSING_PRICE"],
  },
];

describe("reviewReasons", () => {
  it("AC-18: covers all eight combinations of supplier, unit label and price", () => {
    expect(COMBINATIONS).toHaveLength(8);

    for (const { expected, ...item } of COMBINATIONS) {
      expect(reviewReasons(item), JSON.stringify(item)).toEqual(expected);
    }
  });

  it("AC-18: a blank unit label counts as missing, as `Item_description_not_empty` taught", () => {
    expect(reviewReasons({ supplierId: "s", unitLabel: "   ", hasPrice: true })).toEqual([
      "MISSING_UNIT",
    ]);
    expect(reviewReasons({ supplierId: "s", unitLabel: "", hasPrice: true })).toEqual([
      "MISSING_UNIT",
    ]);
  });

  it("AC-18: the two below-total fuel rows have no reason at all", () => {
    // 005 open question 1: flagged for provenance, missing nothing. They may therefore be
    // marked reviewed immediately (AC-19), and carry no reason tag (AC-18).
    expect(reviewReasons({ supplierId: "sup_topaz", unitLabel: "Ltrs", hasPrice: true })).toEqual(
      [],
    );
  });

  it("AC-18: the order of the reasons is stable, so a message reads the same twice", () => {
    const reasons = reviewReasons({ supplierId: null, unitLabel: null, hasPrice: false });

    expect(reasons).toEqual(["MISSING_SUPPLIER", "MISSING_UNIT", "MISSING_PRICE"]);
  });
});
