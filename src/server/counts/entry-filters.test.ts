import { describe, expect, it } from "vitest";

import { NO_SUPPLIER, NO_UNIT, filtersHiding } from "@/lib/count-messages";
import {
  buildEntryFacets,
  emptySelection,
  filterEntryRows,
  hiddenSummary,
  isEmptySelection,
  parseFilterSelection,
} from "@/server/counts/entry-filters";
import type { FilterSelection } from "@/server/counts/entry-filters";
import type { CountLineRow } from "@/types/stock-count";

/**
 * Spec 008 AC-20, AC-21, AC-22 and AC-23, with no database and no browser (AC-32): the
 * facets, the predicate and the arithmetic that stops a filter hiding an unfinished count.
 */

let nextSortOrder = 0;

function line(partial: Partial<CountLineRow> = {}): CountLineRow {
  nextSortOrder += 1;
  return {
    itemId: partial.itemId ?? `item_${nextSortOrder}`,
    description: partial.description ?? `Item ${nextSortOrder}`,
    unitLabel: partial.unitLabel === undefined ? "Tonne" : partial.unitLabel,
    supplierName: partial.supplierName === undefined ? "Kelly" : partial.supplierName,
    typeName: partial.typeName ?? "Thermo-P",
    sortOrder: partial.sortOrder ?? nextSortOrder,
    quantity: partial.quantity === undefined ? null : partial.quantity,
  };
}

/** Four suppliers, three types, two units — small enough to count by eye. */
function sheet(): CountLineRow[] {
  return [
    line({ itemId: "a", supplierName: "Kelly", typeName: "Thermo-P", unitLabel: "Tonne" }),
    line({ itemId: "b", supplierName: "Kelly", typeName: "Thermo-P", unitLabel: "20 Kg" }),
    line({ itemId: "c", supplierName: "Kelly", typeName: "Beads", unitLabel: "Tonne" }),
    line({ itemId: "d", supplierName: "Meon", typeName: "Thermo-P", unitLabel: "Tonne" }),
    line({ itemId: "e", supplierName: "meon", typeName: "A-S", unitLabel: null }),
    line({ itemId: "f", supplierName: null, typeName: "A-S", unitLabel: null }),
  ];
}

function selection(partial: Partial<FilterSelection>): FilterSelection {
  return { ...emptySelection(), ...partial };
}

function idsOf(lines: readonly CountLineRow[]): string[] {
  return lines.map((row) => row.itemId);
}

describe("AC-20: the three categories are built from the count's own lines", () => {
  it("AC-20: exactly three categories, each sorted by value with the sentinel last", () => {
    const facets = buildEntryFacets(sheet());

    expect(Object.keys(facets).sort()).toEqual(["supplier", "type", "unit"]);

    // Case-insensitive: `meon` sits beside `Meon`, not after every capital letter. The
    // sentinel `No supplier` is last however the alphabet would have sorted it.
    expect(facets.supplier).toEqual([
      { value: "Kelly", count: 3 },
      { value: "meon", count: 1 },
      { value: "Meon", count: 1 },
      { value: NO_SUPPLIER, count: 1 },
    ]);

    expect(facets.type).toEqual([
      { value: "A-S", count: 2 },
      { value: "Beads", count: 1 },
      { value: "Thermo-P", count: 3 },
    ]);

    expect(facets.unit).toEqual([
      { value: "20 Kg", count: 1 },
      { value: "Tonne", count: 3 },
      { value: NO_UNIT, count: 2 },
    ]);
  });

  it("AC-20: type has no sentinel, because Item.itemTypeId is required", () => {
    const facets = buildEntryFacets(sheet());

    expect(facets.type.map((facet) => facet.value)).not.toContain(NO_SUPPLIER);
    expect(facets.type.map((facet) => facet.value)).not.toContain(NO_UNIT);
  });

  it("AC-20: a count is over the WHOLE count, so an option never renumbers under a thumb", () => {
    // The facets are built once, from every line, and filtering does not rebuild them.
    const lines = sheet();
    const facets = buildEntryFacets(lines);
    const visible = filterEntryRows(lines, selection({ supplier: ["Kelly"] }));

    expect(visible).toHaveLength(3);
    expect(buildEntryFacets(lines)).toEqual(facets);
  });

  it("AC-20: a count with no lines has three empty categories rather than none", () => {
    expect(buildEntryFacets([])).toEqual({ supplier: [], type: [], unit: [] });
  });
});

describe("AC-21: OR within a category, AND across categories", () => {
  it("AC-21: an empty selection returns every line", () => {
    const lines = sheet();

    expect(filterEntryRows(lines, emptySelection())).toHaveLength(lines.length);
    expect(isEmptySelection(emptySelection())).toBe(true);
    expect(isEmptySelection(selection({ type: ["A-S"] }))).toBe(false);
  });

  it("AC-21: two suppliers means either supplier", () => {
    const visible = filterEntryRows(sheet(), selection({ supplier: ["Kelly", "Meon"] }));

    expect(idsOf(visible)).toEqual(["a", "b", "c", "d"]);
  });

  it("AC-21: a supplier and a type means both", () => {
    const visible = filterEntryRows(
      sheet(),
      selection({ supplier: ["Kelly"], type: ["Thermo-P"] }),
    );

    expect(idsOf(visible)).toEqual(["a", "b"]);
  });

  it("AC-21: adding a unit narrows it again", () => {
    const visible = filterEntryRows(
      sheet(),
      selection({ supplier: ["Kelly"], type: ["Thermo-P"], unit: ["Tonne"] }),
    );

    expect(idsOf(visible)).toEqual(["a"]);
  });

  it("AC-21: the sentinel selects the lines that have no such fact", () => {
    expect(idsOf(filterEntryRows(sheet(), selection({ supplier: [NO_SUPPLIER] })))).toEqual([
      "f",
    ]);
    expect(idsOf(filterEntryRows(sheet(), selection({ unit: [NO_UNIT] })))).toEqual(["e", "f"]);
  });

  it("AC-21: a value present in no line contributes nothing and raises nothing", () => {
    const lines = sheet();

    expect(idsOf(filterEntryRows(lines, selection({ supplier: ["Kelly", "Ghost"] })))).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(filterEntryRows(lines, selection({ supplier: ["Ghost"] }))).toEqual([]);
  });

  it("AC-21: filtering never mutates the lines it was given", () => {
    const lines = sheet();
    const before = idsOf(lines);

    filterEntryRows(lines, selection({ supplier: ["Kelly"] }));

    expect(idsOf(lines)).toEqual(before);
  });
});

describe("AC-22: a selection comes from the URL and never throws", () => {
  const facets = buildEntryFacets(sheet());

  it("AC-22: repeated parameters are a list, and a comma is just a character", () => {
    const parsed = parseFilterSelection(
      { supplier: ["Kelly", "Meon"], type: "Thermo-P" },
      facets,
    );

    expect(parsed).toEqual({ supplier: ["Kelly", "Meon"], type: ["Thermo-P"], unit: [] });
  });

  it("AC-22: an unknown value, an empty value and an unknown parameter are ignored", () => {
    const parsed = parseFilterSelection(
      {
        supplier: ["Ghost", "", "Kelly", "Ghost"],
        colour: "red",
        quantity: "12.5",
        unit: [],
      },
      facets,
    );

    // The page still renders 200 with the filters it could understand (007 AC-21).
    expect(parsed).toEqual({ supplier: ["Kelly"], type: [], unit: [] });
  });

  it("AC-22: a repeated known value is selected once", () => {
    expect(parseFilterSelection({ supplier: ["Kelly", "Kelly"] }, facets).supplier).toEqual([
      "Kelly",
    ]);
  });

  it("AC-22: no query string makes the parse throw", () => {
    for (const raw of [
      {},
      { supplier: undefined },
      { supplier: "" },
      { type: [] },
      { unit: ["", "", ""] },
      { supplier: ["Kelly"], type: ["Ghost"], unit: ["Ghost"] },
    ]) {
      expect(() => parseFilterSelection(raw, facets)).not.toThrow();
    }

    expect(isEmptySelection(parseFilterSelection({ supplier: [""] }, facets))).toBe(true);
  });

  it("AC-22: the same parse runs on the server, so a reload renders the same list", () => {
    const lines = sheet();
    const parsed = parseFilterSelection({ supplier: ["Kelly"], type: ["Beads"] }, facets);

    expect(idsOf(filterEntryRows(lines, parsed))).toEqual(["c"]);
  });
});

describe("AC-23: a filter can never let a counter believe they have finished", () => {
  it("AC-23: the hidden rows and the uncounted ones among them are both reported", () => {
    const lines = [
      line({ itemId: "a", supplierName: "Kelly", quantity: "12.5" }),
      line({ itemId: "b", supplierName: "Meon", quantity: null }),
      line({ itemId: "c", supplierName: "Meon", quantity: null }),
      line({ itemId: "d", supplierName: "Meon", quantity: "0" }),
    ];

    const visible = filterEntryRows(lines, selection({ supplier: ["Kelly"] }));

    expect(hiddenSummary(lines, visible)).toEqual({ hidden: 3, hiddenUncounted: 2 });
  });

  it("AC-23: `0` is counted, so it is never one of the hidden uncounted rows", () => {
    const lines = [line({ itemId: "a", quantity: "0" }), line({ itemId: "b", quantity: null })];

    expect(hiddenSummary(lines, [])).toEqual({ hidden: 2, hiddenUncounted: 1 });
  });

  it("AC-23: nothing hidden is nothing to say", () => {
    const lines = sheet();

    expect(hiddenSummary(lines, lines)).toEqual({ hidden: 0, hiddenUncounted: 0 });
    expect(filtersHiding(0, 0)).toBe("");
  });

  it("AC-23: the sentence the arithmetic feeds", () => {
    expect(filtersHiding(70, 31)).toBe("Filters are hiding 70 items, 31 not counted.");
    expect(filtersHiding(1, 1)).toBe("Filters are hiding 1 item, 1 not counted.");
    expect(filtersHiding(70, 0)).toBe("Filters are hiding 70 items, all counted.");
  });
});
