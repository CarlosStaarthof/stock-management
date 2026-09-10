import { readdirSync, readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";

import { readYardSheets, type YardSheetRow } from "@/lib/excel/workbook-reader";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
// `planWorkbook` is the --dry-run path. It is exercised HERE, in the pure suite, and not in
// a *.db.test.ts, because needing no database is the whole point of it and AC-27 requires
// that to be provable without one. Importing the service pulls in `@/server/db`, which is a
// lazy proxy: no client is constructed and no connection is opened until somebody uses it.
import { planWorkbook } from "@/server/items/workbook-import-service";
import {
  buildImportPlan,
  buildImportReport,
  describeSource,
  diffPlan,
  type ExistingMasterData,
  type ImportPlan,
  type ImportPlanItem,
  type ImportReport,
} from "@/server/items/workbook-plan";

/**
 * Spec 005 AC-8 to AC-17, and the plan half of AC-23 and AC-25.
 *
 * Every figure is one counted from `Samples/Stock @ 01-Sep-2026.xlsx`, and every test here
 * runs in `npm run test:unit` with no database at all — which is the whole point of the
 * pure boundary between the plan and the write.
 */

const WORKBOOK_PATH = "Samples/Stock @ 01-Sep-2026.xlsx";

/** The two yards #4's migration seeds. Nothing here creates them. */
const EMPTY_DATABASE: ExistingMasterData = {
  locations: [
    { id: "loc_dublin", code: "DUBLIN" },
    { id: "loc_clonmel", code: "CLONMEL" },
  ],
  suppliers: [],
  itemTypes: [],
  items: [],
  prices: [],
  links: [],
};

const SOURCE = { fileName: "Stock @ 01-Sep-2026.xlsx", byteLength: 90567, sha256: "abc123" };

let rows: YardSheetRow[];
let plan: ImportPlan;
let report: ImportReport;

function itemAt(cell: string): ImportPlanItem {
  const found = plan.items.find((item) => item.cells.includes(cell));
  if (found === undefined) throw new Error(`no planned item built from ${cell}`);
  return found;
}

function row(overrides: Partial<YardSheetRow> = {}): YardSheetRow {
  return {
    sheet: "Dublin",
    row: 3,
    belowTotal: false,
    description: "Thing",
    supplier: "Kestrel",
    itemType: "Logo",
    unitLabel: "1 Unit",
    price: "10",
    ...overrides,
  };
}

/** Every key at any depth of a JSON-shaped value. */
function keysDeep(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) keysDeep(entry, into);
    return into;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      into.add(key);
      keysDeep(nested, into);
    }
  }
  return into;
}

/** Every string VALUE at any depth. Keys are not leaves; `keysDeep` covers those. */
function stringLeavesDeep(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const entry of value) stringLeavesDeep(entry, into);
    return into;
  }
  if (typeof value === "string") {
    into.push(value);
    return into;
  }
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) stringLeavesDeep(nested, into);
  }
  return into;
}

/** Every key that holds a number, at any depth. */
function numericKeysDeep(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) numericKeysDeep(entry, into);
    return into;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (typeof nested === "number") into.add(key);
      else numericKeysDeep(nested, into);
    }
  }
  return into;
}

beforeAll(async () => {
  rows = await readYardSheets(readFileSync(WORKBOOK_PATH));
  plan = buildImportPlan(rows);
  report = buildImportReport(plan, diffPlan(plan, EMPTY_DATABASE), SOURCE);
});

describe("suppliers", () => {
  it("AC-8: collapse to exactly the ten canonical names", () => {
    expect(plan.suppliers.map((supplier) => supplier.name).sort()).toEqual([
      "Ennis Flint",
      "Kelly",
      "Kestrel",
      "M & E",
      "Meon",
      "Mid-West",
      "Pittman",
      "Roadcraft",
      "Roadstuds",
      "Visever",
    ]);
  });

  it("AC-8: Kelly (7), Kellys (19) and Kelly's (1) are one supplier", () => {
    const kelly = rows.filter((source) => (source.supplier ?? "").trim().startsWith("Kelly"));
    const bySpelling = new Map<string, number>();
    for (const source of kelly) {
      const spelling = source.supplier ?? "";
      bySpelling.set(spelling, (bySpelling.get(spelling) ?? 0) + 1);
    }

    expect(bySpelling.get("Kelly")).toBe(7);
    expect(bySpelling.get("Kellys")).toBe(19);
    expect(bySpelling.get("Kelly's")).toBe(1);

    const planned = plan.items.filter((item) => (item.supplierName ?? "").startsWith("Kelly"));
    expect([...new Set(planned.map((item) => item.supplierName))]).toEqual(["Kelly"]);
  });

  it("AC-8: Meon and Visever lose their trailing space, and no planned name carries whitespace", () => {
    expect(plan.suppliers.map((supplier) => supplier.name)).toContain("Meon");
    expect(plan.suppliers.map((supplier) => supplier.name)).toContain("Visever");

    for (const supplier of plan.suppliers) {
      expect(supplier.name).toBe(supplier.name.trim());
    }
  });

  it("AC-8: there is no leading-t strip rule, so tMeon plans a supplier named tMeon", () => {
    // The `t` prefixes an earlier draft described were a defect in a reader, not spellings
    // in the file (Part 2). Stripping a character the workbook does not contain would
    // corrupt a real supplier name.
    const planned = buildImportPlan([row({ supplier: "tMeon" })]);

    expect(planned.suppliers).toEqual([{ name: "tMeon" }]);
    expect(planned.items[0].supplierName).toBe("tMeon");
  });

  it("AC-8: one Dublin row has no supplier at all, and is planned with null", () => {
    expect(itemAt("Dublin!A45").description).toBe("School Logo Triangle");
    expect(itemAt("Dublin!A45").supplierName).toBeNull();
  });
});

describe("item types", () => {
  it("AC-9: are exactly Part 2's nineteen, in Part 2's order, with sortOrder 1-19", () => {
    expect(plan.itemTypes).toEqual(
      [
        "Thermo-P",
        "Beads",
        "C-E",
        "A-S",
        "Cold A-S",
        "Primer",
        "M-Grip",
        "Vialine",
        "Paint",
        "MMA",
        "Logo",
        "Sealer",
        "Cleaner",
        "F&F",
        "Ramps",
        "Aerosol",
        "Bauxite",
        "Glue",
        "Fuel",
      ].map((code, index) => ({ code, name: code, sortOrder: index + 1 })),
    );
  });

  it("AC-9: Logo's collapses into Logo, and no type named Logo's is created", () => {
    expect(itemAt("'Clonmel '!A66").itemTypeCode).toBe("Logo");
    expect(plan.itemTypes.map((itemType) => itemType.code)).not.toContain("Logo's");
  });
});

describe("units over the planned items", () => {
  it("AC-10: the tally across the 140 items is 24 / 38 / 6 / 71 / 1", () => {
    const tally = new Map<string, number>();
    for (const item of plan.items) {
      tally.set(item.unitKind, (tally.get(item.unitKind) ?? 0) + 1);
    }

    expect(tally.get("TONNE")).toBe(24);
    expect(tally.get("KILOGRAM")).toBe(38);
    expect(tally.get("LITRE")).toBe(6);
    expect(tally.get("UNIT")).toBe(71);
    expect(tally.get("LINEAR_METRE")).toBe(1);
    expect([...tally.values()].reduce((sum, count) => sum + count, 0)).toBe(140);
  });
});

describe("items", () => {
  it("AC-11: 152 source rows become 140 items and 152 yard links", () => {
    expect(rows).toHaveLength(152);
    expect(plan.items).toHaveLength(140);
    expect(plan.items.reduce((total, item) => total + item.links.length, 0)).toBe(152);
  });

  it("AC-11: exactly twelve items are held at both yards, and they are these twelve", () => {
    const shared = plan.items.filter((item) => item.links.length > 1);

    expect(shared.map((item) => item.description)).toEqual([
      "White Extrusion 80/20",
      "Yellow Extrusion 55/20",
      "Red - KestrelFlex - Anti-Skid",
      "Beads",
      "MMA Paints - Red",
      "MMA Paints - Blue",
      "MMA Paints - White",
      "MultiGrip X440 Traffic Green RAL6024",
      "MultiGrip X440 Traffic Purple. RAL 4006",
      "ViaLine  Traffic Red RAL1023",
      "ViaLine Traffic Yellow (RAL 1023)",
      "ViaLine White",
    ]);
  });

  it("AC-11: trailing space is trimmed", () => {
    expect(rowAtSource("Dublin", 3).description).toBe("White Extrusion 80/20");
    expect(itemAt("Dublin!A46").description).toBe("Click & Collect");
  });

  it("AC-11: internal whitespace is preserved, so the bicycle logos are four items", () => {
    // The user decided this at approval (spec 005 Open questions §5). Collapsing internal
    // runs when matching would give 138 items and 14 shared; the plan holds 140 and 12.
    const twoSpaces = itemAt("Dublin!A16");
    const threeSpaces = itemAt("'Clonmel '!A52");

    expect(twoSpaces.description).toBe("Bicycle Logo's  1200mm");
    expect(threeSpaces.description).toBe("Bicycle Logo's   1200mm");
    expect(twoSpaces).not.toBe(threeSpaces);
    expect(twoSpaces.links).toHaveLength(1);
    expect(threeSpaces.links).toHaveLength(1);

    const collapsed = new Set(
      plan.items.map((item) => `${item.description.replace(/\s+/g, " ")}|${item.supplierName ?? ""}`),
    );
    expect(collapsed.size).toBe(138);
    expect(plan.items).toHaveLength(140);
  });

  it("AC-11: the same description under two suppliers is two items", () => {
    const underKestrel = itemAt("Dublin!A16");
    const underKelly = itemAt("Dublin!A18");

    expect(underKestrel.description).toBe(underKelly.description);
    expect(underKestrel.supplierName).toBe("Kestrel");
    expect(underKelly.supplierName).toBe("Kelly");
  });

  it("AC-11: every link's sortOrder is its source row number", () => {
    for (const item of plan.items) {
      for (const cell of item.cells) {
        const parsed = /!A(\d+)$/.exec(cell);
        expect(parsed).not.toBeNull();
        expect(item.links.map((link) => link.sortOrder)).toContain(Number(parsed?.[1]));
      }
    }
  });
});

describe("the thirteen incomplete rows", () => {
  const INCOMPLETE = [
    "Dublin!A9",
    "Dublin!A12",
    "Dublin!A18",
    "Dublin!A29",
    "Dublin!A44",
    "Dublin!A45",
    "Dublin!A46",
    "Dublin!A47",
    "Dublin!A48",
    "Dublin!A62",
    "Dublin!A63",
    "Dublin!A78",
    "'Clonmel '!A54",
  ];

  it("AC-12: each is imported and flagged needsReview", () => {
    for (const cell of INCOMPLETE) {
      expect(itemAt(cell).needsReview, cell).toBe(true);
    }
  });

  it("AC-12: Dublin!A43 Clock Blue + Yellow Nos is NOT one of them", () => {
    const clock = itemAt("Dublin!A43");

    expect(clock.description).toBe("Clock Blue + Yellow Nos");
    expect(clock.unitLabel).toBe("1 Unit");
    expect(clock.unitPrice).toBe("350");
    expect(clock.needsReview).toBe(false);
  });

  it("AC-12: eleven of the thirteen get no ItemPrice at all, rather than a zero price", () => {
    const withoutPrice = [
      "Dublin!A12",
      "Dublin!A18",
      "Dublin!A29",
      "Dublin!A44",
      "Dublin!A45",
      "Dublin!A46",
      "Dublin!A47",
      "Dublin!A48",
      "Dublin!A62",
      "Dublin!A63",
      "'Clonmel '!A54",
    ];

    expect(withoutPrice).toHaveLength(11);
    for (const cell of withoutPrice) {
      expect(itemAt(cell).unitPrice, cell).toBeNull();
    }
  });

  it("AC-12: the other two keep the price they carry and are flagged for the unit alone", () => {
    expect(itemAt("Dublin!A9").unitPrice).toBe("173.29");
    expect(itemAt("Dublin!A9").reviewReasons).toEqual(["MISSING_UNIT"]);
    expect(itemAt("Dublin!A78").unitPrice).toBe("253");
    expect(itemAt("Dublin!A78").reviewReasons).toEqual(["MISSING_UNIT"]);
  });

  it("AC-12: 129 of the 140 items carry a price", () => {
    expect(plan.items.filter((item) => item.unitPrice !== null)).toHaveLength(129);
    expect(plan.items.filter((item) => item.unitPrice === null)).toHaveLength(11);
  });
});

describe("the two rows below Clonmel's total", () => {
  it("AC-13: are imported in full, linked to Clonmel, priced and flagged", () => {
    const diesel = itemAt("'Clonmel '!A75");
    const gasOil = itemAt("'Clonmel '!A76");

    expect(diesel.description).toBe("Road Diesel - White");
    expect(gasOil.description).toBe("Marked Gas Oil - Green");

    for (const item of [diesel, gasOil]) {
      expect(item.supplierName).toBe("Mid-West");
      expect(item.itemTypeCode).toBe("Fuel");
      expect(item.unitLabel).toBe("Ltrs");
      expect(item.unitKind).toBe("LITRE");
      expect(item.links).toEqual([{ locationCode: "CLONMEL", sortOrder: item.links[0].sortOrder }]);
      expect(item.needsReview).toBe(true);
      expect(item.reviewReasons).toEqual(["BELOW_TOTAL_ROW"]);
    }

    expect(diesel.unitPrice).toBe("1.23");
    expect(gasOil.unitPrice).toBe("0.96");
    expect(diesel.links[0].sortOrder).toBe(75);
    expect(gasOil.links[0].sortOrder).toBe(76);
  });

  it("AC-13: each carries a note naming its cell and saying where the row sits", () => {
    expect(itemAt("'Clonmel '!A75").notes).toContain("'Clonmel '!A75");
    expect(itemAt("'Clonmel '!A75").notes).toContain("below the total row");
    expect(itemAt("'Clonmel '!A76").notes).toContain("'Clonmel '!A76");
    expect(itemAt("'Clonmel '!A76").notes).toContain("below the total row");
  });

  it("AC-13: Dublin contributes no below-total row", () => {
    expect(rows.filter((source) => source.sheet === "Dublin" && source.belowTotal)).toEqual([]);
  });

  it("AC-13: fifteen items are flagged needsReview and no others", () => {
    expect(plan.items.filter((item) => item.needsReview)).toHaveLength(15);
    expect(plan.items.filter((item) => !item.needsReview)).toHaveLength(125);
  });
});

describe("cross-sheet disagreements", () => {
  it("AC-14: five items disagree on the unit label, and Dublin wins each time", () => {
    const unitConflicts = plan.conflicts.filter((conflict) => conflict.field === "unitLabel");

    expect(
      unitConflicts.map((conflict) => [conflict.description, ...conflict.cells, ...conflict.readings]),
    ).toEqual([
      ["MMA Paints - Red", "Dublin!D50", "'Clonmel '!D64", "1 Unit", "16kg"],
      ["MMA Paints - Blue", "Dublin!D51", "'Clonmel '!D61", "1 Unit", "16kg"],
      ["MMA Paints - White", "Dublin!D53", "'Clonmel '!D60", "2 Unit", "16kg"],
      ["ViaLine  Traffic Red RAL1023", "Dublin!D70", "'Clonmel '!D42", "20 Kg", "20kg"],
      ["ViaLine Traffic Yellow (RAL 1023)", "Dublin!D73", "'Clonmel '!D43", "20 Kg", "20kg"],
    ]);

    for (const conflict of unitConflicts) {
      expect(itemAt(conflict.cells[0].replace(/!D/, "!A")).unitLabel).toBe(conflict.readings[0]);
    }
  });

  it("AC-14: five items disagree on the item type, and Dublin wins each time", () => {
    const typeConflicts = plan.conflicts.filter((conflict) => conflict.field === "itemType");

    expect(
      typeConflicts.map((conflict) => [conflict.description, ...conflict.cells, ...conflict.readings]),
    ).toEqual([
      ["MultiGrip X440 Traffic Green RAL6024", "Dublin!C65", "'Clonmel '!C36", "Paint", "M-Grip"],
      ["MultiGrip X440 Traffic Purple. RAL 4006", "Dublin!C66", "'Clonmel '!C35", "Paint", "M-Grip"],
      ["ViaLine  Traffic Red RAL1023", "Dublin!C70", "'Clonmel '!C42", "Paint", "Vialine"],
      ["ViaLine Traffic Yellow (RAL 1023)", "Dublin!C73", "'Clonmel '!C43", "Paint", "Vialine"],
      ["ViaLine White", "Dublin!C74", "'Clonmel '!C39", "Paint", "Vialine"],
    ]);
  });

  it("AC-14: the ten disagreements fall on eight distinct items, each with a note", () => {
    expect(plan.conflicts).toHaveLength(10);

    const affected = new Set(plan.conflicts.map((conflict) => conflict.description));
    expect(affected.size).toBe(8);

    for (const conflict of plan.conflicts) {
      const item = plan.items.find((candidate) => candidate.description === conflict.description);
      expect(item?.notes).toContain(conflict.cells[0]);
      expect(item?.notes).toContain(conflict.cells[1]);
      expect(item?.notes).toContain(String(conflict.readings[0]));
      expect(item?.notes).toContain(String(conflict.readings[1]));
    }
  });

  it("AC-14: zero items disagree on price - all twelve shared items are priced the same", () => {
    const shared = plan.items.filter((item) => item.links.length > 1);
    const pricesBySheet = shared.map((item) =>
      item.cells.map((cell) => {
        const parsed = /^(?:'(.*)'|([^!]*))!A(\d+)$/.exec(cell);
        const sheet = parsed?.[1] ?? parsed?.[2] ?? "";
        const source = rows.find((each) => each.sheet === sheet && each.row === Number(parsed?.[3]));
        return source?.price ?? null;
      }),
    );

    const disagreeing = pricesBySheet.filter((prices) => new Set(prices).size > 1);
    expect(disagreeing).toHaveLength(0);
  });

  it("AC-14: a price disagreement refuses the whole run, naming both cells and both prices", () => {
    const refused = () =>
      buildImportPlan([
        row({ sheet: "Dublin", row: 5, description: "Same Thing", price: "100" }),
        row({ sheet: "Clonmel ", row: 9, description: "Same Thing", price: "110" }),
      ]);

    expect(refused).toThrow(ConflictError);
    expect(refused).toThrow(/Dublin!E5/);
    expect(refused).toThrow(/'Clonmel '!E9/);
    expect(refused).toThrow(/100/);
    expect(refused).toThrow(/110/);
  });
});

describe("notes", () => {
  it("AC-15: exactly ten items carry a note, and the other 130 carry none", () => {
    const withNotes = plan.items.filter((item) => item.notes !== null);

    expect(withNotes).toHaveLength(10);
    expect(plan.items.filter((item) => item.notes === null)).toHaveLength(130);

    // The two below-total rows plus the eight items of AC-14, and nothing else.
    const belowTotal = withNotes.filter((item) => item.reviewReasons.includes("BELOW_TOTAL_ROW"));
    expect(belowTotal).toHaveLength(2);
  });
});

describe("the import report", () => {
  it("AC-16: names the source, the sheets and the counts", () => {
    expect(report.source).toEqual(SOURCE);

    expect(report.sheets).toEqual([
      { name: "Dublin", firstRow: 3, lastRow: 84, rowsRead: 82, belowTotalRows: 0 },
      { name: "Clonmel ", firstRow: 3, lastRow: 70, rowsRead: 68, belowTotalRows: 2 },
    ]);

    expect(report.counts.map((count) => [count.table, count.planned])).toEqual([
      ["Supplier", 10],
      ["ItemType", 19],
      ["Item", 140],
      ["ItemPrice", 129],
      ["ItemLocation", 152],
    ]);
  });

  it("AC-16: lists the fifteen flagged items with their cell and their reasons", () => {
    expect(report.needsReview.map((entry) => entry.sheetCell)).toEqual([
      "Dublin!A9",
      "Dublin!A12",
      "Dublin!A18",
      "Dublin!A29",
      "Dublin!A44",
      "Dublin!A45",
      "Dublin!A46",
      "Dublin!A47",
      "Dublin!A48",
      "Dublin!A62",
      "Dublin!A63",
      "Dublin!A78",
      "'Clonmel '!A54",
      "'Clonmel '!A75",
      "'Clonmel '!A76",
    ]);

    const reasons = new Set(report.needsReview.flatMap((entry) => entry.reasons));
    expect([...reasons].sort()).toEqual([
      "BELOW_TOTAL_ROW",
      "MISSING_PRICE",
      "MISSING_SUPPLIER",
      "MISSING_UNIT",
    ]);
  });

  it("AC-16: lists the four collapsed supplier spellings with their row counts", () => {
    const byVariant = new Map(
      report.supplierVariants.map((variant) => [variant.variant, variant]),
    );

    expect(report.supplierVariants).toHaveLength(4);
    expect(byVariant.get("Kellys")).toMatchObject({ canonical: "Kelly", rowCount: 19 });
    expect(byVariant.get("Kelly's")).toMatchObject({ canonical: "Kelly", rowCount: 1 });
    expect(byVariant.get("Meon ")).toMatchObject({ canonical: "Meon", rowCount: 1 });
    expect(byVariant.get("Visever ")).toMatchObject({ canonical: "Visever", rowCount: 2 });
  });

  it("AC-16: lists the twelve shared items and the ten conflicts", () => {
    expect(report.sharedItems).toHaveLength(12);
    expect(report.conflicts).toHaveLength(10);
    expect(report.divergences).toEqual([]);
  });

  it("AC-16: every array is ordered by sheet then row", () => {
    const sheetRank = (cell: string): number => (cell.startsWith("Dublin") ? 0 : 1);
    const rowOf = (cell: string): number => Number(/(\d+)$/.exec(cell)?.[1] ?? 0);

    for (const cells of [
      report.needsReview.map((entry) => entry.sheetCell),
      report.supplierVariants.map((variant) => variant.cells[0]),
      report.sharedItems.map((shared) => shared.cells[0]),
      report.conflicts.map((conflict) => conflict.cells[0]),
    ]) {
      const ordered = [...cells].sort(
        (a, b) => sheetRank(a) - sheetRank(b) || rowOf(a) - rowOf(b),
      );
      expect(cells).toEqual(ordered);
    }
  });

  it("AC-16: building it twice from the same workbook gives two identical JSON strings", () => {
    const again = buildImportReport(
      buildImportPlan(rows),
      diffPlan(buildImportPlan(rows), EMPTY_DATABASE),
      SOURCE,
    );

    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
  });
});

describe("the report carries no money outside divergences[]", () => {
  /**
   * AC-17 as amended by the user on 2026-09-10 (spec § Post-approval amendments).
   *
   * `divergences[]` is exempt, because AC-22 requires it to carry the workbook value and
   * the stored value of every field the importer declined to overwrite, and a price is
   * such a field. Everything else in the report is money-free.
   *
   * The exemption is deliberately NOT proved vacuously. The same three assertions run
   * twice: once against the ordinary report, whose `divergences` is `[]`, and once against
   * a report built from a database in which an ADMIN has corrected a price, whose
   * `divergences` is not — and the second run also asserts, positively, that both figures
   * ARE inside the exempt array, so the exemption cannot quietly stop carrying what AC-22
   * requires of it.
   */
  const STRUCTURAL_NUMBER_KEYS = [
    "belowTotalRows",
    "byteLength",
    "created",
    "firstRow",
    "lastRow",
    "planned",
    "rowCount",
    "rowsRead",
    "skipped",
  ];

  /** The report with the one exempt array removed — structurally, never by string surgery. */
  function withoutDivergences(source: ImportReport): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...source };
    delete copy.divergences;
    return copy;
  }

  /** Every decimal price string the workbook holds. */
  function workbookPrices(): Set<string> {
    return new Set(
      plan.items.map((item) => item.unitPrice).filter((price): price is string => price !== null),
    );
  }

  function assertMoneyFreeOutsideDivergences(source: ImportReport, label: string): void {
    const outside = withoutDivergences(source);
    const prices = workbookPrices();

    expect(prices.size).toBeGreaterThan(0);

    for (const key of keysDeep(outside)) {
      expect(key, `${label}: report key ${key}`).not.toMatch(/price|value|amount/i);
    }

    // (a) Prices are decimal STRINGS throughout this feature (the Contract forbids a JS
    // number), so a leaked price would be serialised quoted. Searching for the quoted form
    // is exactly "no string leaf and no key EQUALS a price".
    const serialised = JSON.stringify(outside);
    for (const price of prices) {
      expect(serialised, `${label}: price ${price}`).not.toContain(JSON.stringify(price));
    }

    // (b) A price glued into a longer string - `"CP Primer 253"` - is not a whole leaf, so
    // (a) alone misses it. Every price that carries a decimal point is therefore searched
    // for INSIDE each string leaf as well. Only decimal prices: an integer one cannot be
    // told from a row number or a colour code without false positives, and the workbook
    // proves it - `102` is a real price and `ViaLine  Traffic Red RAL1023` is a real
    // description. That residue is covered by (a) when the price is a whole leaf and by
    // (c) when it is a number.
    const decimalPrices = [...prices].filter((price) => price.includes("."));
    expect(decimalPrices.length, `${label}: decimal prices to search for`).toBeGreaterThan(20);

    for (const leaf of stringLeavesDeep(outside)) {
      for (const price of decimalPrices) {
        expect(leaf.includes(price), `${label}: ${JSON.stringify(leaf)} carries ${price}`).toBe(
          false,
        );
      }
    }

    // (c) A price leaked as a NUMBER would need a key of its own, and this list is exact.
    expect([...numericKeysDeep(outside)].sort(), label).toEqual(STRUCTURAL_NUMBER_KEYS);
  }

  it("AC-17: the ordinary report, whose divergences[] is empty, carries no money", () => {
    expect(report.divergences).toEqual([]);

    assertMoneyFreeOutsideDivergences(report, "ordinary report");
  });

  it("AC-17: a report whose divergences[] is NOT empty carries no money outside it either", () => {
    // A database that already holds `Beads`, priced 800 by an ADMIN where the workbook
    // says 790. The importer overwrites nothing (AC-22) and reports the disagreement.
    const corrected = buildImportReport(
      plan,
      diffPlan(plan, {
        ...EMPTY_DATABASE,
        suppliers: [{ id: "sup_kestrel", name: "Kestrel" }],
        itemTypes: [{ id: "type_beads", code: "Beads" }],
        items: [
          {
            id: "item_beads",
            description: "Beads",
            supplierId: "sup_kestrel",
            itemTypeId: "type_beads",
            unitLabel: "Tonne",
            unitKind: "TONNE",
            unitQuantityKg: "1000",
            active: true,
            needsReview: false,
            notes: null,
          },
        ],
        prices: [
          {
            itemId: "item_beads",
            effectiveFrom: "2025-01-01",
            unitPrice: "800",
            currency: "EUR",
            label: "2025 Prices",
          },
        ],
      }),
      SOURCE,
    );

    // The exemption is exercised, not skipped over.
    expect(corrected.divergences).not.toEqual([]);

    assertMoneyFreeOutsideDivergences(corrected, "report with a corrected price");
  });

  it("AC-17 with AC-22: the exempt array does carry both figures, so the exemption earns itself", () => {
    const corrected = buildImportReport(
      plan,
      diffPlan(plan, {
        ...EMPTY_DATABASE,
        suppliers: [{ id: "sup_kestrel", name: "Kestrel" }],
        itemTypes: [{ id: "type_beads", code: "Beads" }],
        items: [
          {
            id: "item_beads",
            description: "Beads",
            supplierId: "sup_kestrel",
            itemTypeId: "type_beads",
            unitLabel: "Tonne",
            unitKind: "TONNE",
            unitQuantityKg: "1000",
            active: true,
            needsReview: false,
            notes: null,
          },
        ],
        prices: [
          {
            itemId: "item_beads",
            effectiveFrom: "2025-01-01",
            unitPrice: "800",
            currency: "EUR",
            label: "2025 Prices",
          },
        ],
      }),
      SOURCE,
    );

    // AC-22 requires the workbook value AND the database value. If a later change made the
    // exemption redundant by dropping one of them, this turns red rather than staying
    // quietly green on an empty array.
    expect(corrected.divergences).toEqual([
      {
        entity: "ItemPrice",
        key: "Beads / Kestrel @ 2025-01-01",
        field: "unitPrice",
        workbook: "790",
        database: "800",
      },
    ]);

    const inside = JSON.stringify(corrected.divergences);
    expect(inside).toContain(JSON.stringify("790"));
    expect(inside).toContain(JSON.stringify("800"));

    // And 790 really is the workbook's price for that item, not a number invented here.
    expect(plan.items.find((item) => item.description === "Beads")?.unitPrice).toBe("790");
  });

  it("AC-17: MISSING_PRICE is a reason code, which is a value and not a key", () => {
    expect(JSON.stringify(report)).toContain("MISSING_PRICE");
    expect([...keysDeep(report)]).not.toContain("MISSING_PRICE");
  });
});

describe("diffPlan", () => {
  it("AC-19: refuses a database with no CLONMEL yard, and names the code", () => {
    const missingClonmel: ExistingMasterData = {
      ...EMPTY_DATABASE,
      locations: [{ id: "loc_dublin", code: "DUBLIN" }],
    };

    expect(() => diffPlan(plan, missingClonmel)).toThrow(NotFoundError);
    expect(() => diffPlan(plan, missingClonmel)).toThrow(/CLONMEL/);
  });

  it("AC-18: against an empty database everything is a create and nothing is skipped", () => {
    const diff = diffPlan(plan, EMPTY_DATABASE);

    expect(diff.counts.toCreate).toEqual({
      suppliers: 10,
      itemTypes: 19,
      items: 140,
      prices: 129,
      links: 152,
    });
    expect(diff.counts.skipped).toEqual({
      suppliers: 0,
      itemTypes: 0,
      items: 0,
      prices: 0,
      links: 0,
    });
    expect(diff.divergences).toEqual([]);
  });

  it("AC-23: two supplier-less rows with the same description collapse into one item", () => {
    // Postgres treats NULLs as distinct, so `@@unique([description, supplierId])` would
    // accept both. The collapse happens here, in application code, before the write.
    const collapsed = buildImportPlan([
      row({ sheet: "Dublin", row: 45, description: "School Logo Triangle", supplier: null, price: null }),
      row({ sheet: "Clonmel ", row: 12, description: "School Logo Triangle", supplier: null, price: null }),
    ]);

    expect(collapsed.items).toHaveLength(1);
    expect(collapsed.items[0].supplierName).toBeNull();
    expect(collapsed.items[0].links).toEqual([
      { locationCode: "DUBLIN", sortOrder: 45 },
      { locationCode: "CLONMEL", sortOrder: 12 },
    ]);
  });

  it("AC-23: a supplier-less item already in the database is matched, not duplicated", () => {
    const oneRow = buildImportPlan([
      row({ sheet: "Dublin", row: 45, description: "School Logo Triangle", supplier: null, price: null }),
    ]);

    const diff = diffPlan(oneRow, {
      ...EMPTY_DATABASE,
      itemTypes: [{ id: "type_logo", code: "Logo" }],
      items: [
        {
          id: "item_existing",
          description: "School Logo Triangle",
          supplierId: null,
          itemTypeId: "type_logo",
          unitLabel: "1 Unit",
          unitKind: "UNIT",
          unitQuantityKg: null,
          active: true,
          needsReview: true,
          notes: null,
        },
      ],
    });

    expect(diff.counts.toCreate.items).toBe(0);
    expect(diff.counts.skipped.items).toBe(1);
    expect(diff.items[0].existingItemId).toBe("item_existing");
  });

  it("AC-22: a stored row that differs is reported, never changed", () => {
    const oneRow = buildImportPlan([
      row({ sheet: "Dublin", row: 3, description: "Thing", supplier: "Kestrel", unitLabel: "Tonne", price: "10" }),
    ]);

    const diff = diffPlan(oneRow, {
      ...EMPTY_DATABASE,
      suppliers: [{ id: "sup_kestrel", name: "Kestrel" }],
      itemTypes: [{ id: "type_logo", code: "Logo" }],
      items: [
        {
          id: "item_1",
          description: "Thing",
          supplierId: "sup_kestrel",
          itemTypeId: "type_logo",
          unitLabel: "tonne",
          unitKind: "TONNE",
          unitQuantityKg: "1000.0000",
          active: false,
          needsReview: false,
          notes: null,
        },
      ],
      prices: [
        {
          itemId: "item_1",
          effectiveFrom: "2025-01-01",
          unitPrice: "11.00000000",
          currency: "EUR",
          label: "2025 Prices",
        },
      ],
    });

    expect(diff.counts.toCreate.items).toBe(0);
    expect(diff.counts.toCreate.prices).toBe(0);

    const fields = diff.divergences.map((divergence) => divergence.field).sort();
    expect(fields).toEqual(["active", "unitLabel", "unitPrice"]);

    // `1000.0000` and `1000` are the same number, so unitQuantityKg is NOT a divergence.
    expect(fields).not.toContain("unitQuantityKg");

    const price = diff.divergences.find((divergence) => divergence.field === "unitPrice");
    expect(price).toMatchObject({ entity: "ItemPrice", workbook: "10", database: "11" });
  });
});

describe("the importer's source, as a fact about the repository", () => {
  const MODULES = ["src/lib/excel", "src/server/items"].flatMap((directory) =>
    readdirSync(directory)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => `${directory}/${name}`),
  );

  it("AC-25: reads no worksheet column beyond E", () => {
    expect(MODULES.length).toBeGreaterThan(0);

    for (const file of MODULES) {
      const source = readFileSync(file, "utf8");

      // Every one- or two-letter upper-case string literal in the importer is a column.
      for (const [, letters] of source.matchAll(/["'`]([A-Z]{1,2})["'`]/g)) {
        expect(["A", "B", "C", "D", "E"], `${file} names column ${letters}`).toContain(letters);
      }

      // And no cell is fetched by a numeric column index either.
      expect(source).not.toMatch(/getCell\(\s*\d/);
    }
  });

  it("AC-25: names Summary and Clonmel Trucks & Yard only in a comment that excludes them", () => {
    let mentions = 0;

    for (const file of MODULES) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!/Summary|Clonmel Trucks & Yard/.test(line)) continue;
        mentions += 1;
        expect(line.trim(), `${file}: ${line}`).toMatch(/^(\*|\/\/|\/\*)/);
      }
    }

    expect(mentions).toBeGreaterThan(0);
  });
});

describe("describeSource", () => {
  // #5 review, required change 1. AC-16's `source` clause had no proof: the report tests
  // hand `buildImportReport` a fabricated SOURCE, which would pass even if this function
  // returned a constant. These two figures were verified independently of this code, twice
  // - Python `hashlib` and `sha256sum` - so they are asserted as literals.
  const BYTE_LENGTH = 90567;
  const SHA256 = "6308ae040163d3d008cb0622fc83c70987ceaf44389d59a457ab5e6a2f54bff0";

  it("AC-16: names the file and digests the bytes that were actually read", () => {
    const bytes = readFileSync(WORKBOOK_PATH);

    expect(describeSource("Stock @ 01-Sep-2026.xlsx", bytes)).toEqual({
      fileName: "Stock @ 01-Sep-2026.xlsx",
      byteLength: BYTE_LENGTH,
      sha256: SHA256,
    });
  });

  it("AC-16: one byte changed is a different digest, so the digest is of the bytes", () => {
    // The failure path, and what stops the assertion above from passing on a constant.
    const bytes = readFileSync(WORKBOOK_PATH);
    const tampered = Uint8Array.from(bytes);
    tampered[1000] = tampered[1000] ^ 0xff;

    const original = describeSource("workbook.xlsx", bytes);
    const changed = describeSource("workbook.xlsx", tampered);

    expect(changed.byteLength).toBe(original.byteLength);
    expect(changed.sha256).not.toBe(original.sha256);
    expect(changed.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("planWorkbook, the --dry-run path", () => {
  // #5 review, required change 2. This is the only thing standing between AC-27 and a
  // connection attempt, and it had no test at all.
  it("AC-27: plans 140 items from the real workbook with no database in sight", async () => {
    const planned = await planWorkbook(WORKBOOK_PATH, readFileSync(WORKBOOK_PATH));

    expect(planned.plan.items).toHaveLength(140);
    expect(planned.report.counts.find((count) => count.table === "Item")).toEqual({
      table: "Item",
      planned: 140,
      created: 140,
      skipped: 0,
    });
    expect(planned.source.byteLength).toBe(90567);

    // The report it prints is the report the real run prints.
    expect(planned.report.needsReview).toHaveLength(15);
    expect(planned.report.divergences).toEqual([]);
  });

  it("AC-27: a file that is not a workbook is a ValidationError, not a ZIP stack trace", async () => {
    const notAWorkbook = Buffer.from("This is a PDF, or a photograph, or nothing at all.");

    await expect(planWorkbook("wrong.pdf", notAWorkbook)).rejects.toBeInstanceOf(ValidationError);
    await expect(planWorkbook("wrong.pdf", notAWorkbook)).rejects.toThrow(/xlsx/);
  });

  it("AC-27: a workbook with no 'Clonmel ' sheet is refused before anything is planned", async () => {
    const workbook = new ExcelJS.Workbook();
    const dublin = workbook.addWorksheet("Dublin");
    dublin.getCell("A3").value = "Thing";
    dublin.getCell("C3").value = "Logo";
    dublin.getCell("A4").value = "TOTAL";
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

    await expect(planWorkbook("half.xlsx", bytes)).rejects.toBeInstanceOf(ValidationError);
    await expect(planWorkbook("half.xlsx", bytes)).rejects.toThrow(/Clonmel/);
  });
});

describe("the second matching pass is narrow, as a stated rule", () => {
  /**
   * #5 review, required change 4.
   *
   * `diffPlan` matches on `(description, supplierId ?? null)` (AC-23) and then makes ONE
   * further attempt: a planned item with NO supplier may claim a stored row of the same
   * description that nothing else has claimed. That is what makes AC-22's third run create
   * nothing after an ADMIN fills in `School Logo Triangle`'s missing supplier.
   *
   * The pass being narrow is load-bearing, and until now it was only proved indirectly -
   * the database test went red when it was deleted. These two tests state the safety
   * properties as rules instead, so a later widening turns them red on purpose.
   */
  const TWO_SUPPLIERS: ExistingMasterData = {
    ...EMPTY_DATABASE,
    suppliers: [
      { id: "sup_kestrel", name: "Kestrel" },
      { id: "sup_kelly", name: "Kelly" },
    ],
    itemTypes: [{ id: "type_logo", code: "Logo" }],
  };

  function storedItem(id: string, supplierId: string | null): ExistingMasterData["items"][number] {
    return {
      id,
      description: "Thing",
      supplierId,
      itemTypeId: "type_logo",
      unitLabel: "1 Unit",
      unitKind: "UNIT",
      unitQuantityKg: null,
      active: true,
      needsReview: false,
      notes: null,
    };
  }

  it("AC-11 with AC-23: a planned item WITH a supplier never claims another supplier's row", () => {
    // `Thing` is stored under Kelly; the workbook says `Thing` under Kestrel. Those are two
    // real items (AC-11), so the import must create the second, not adopt the first.
    const planned = buildImportPlan([row({ description: "Thing", supplier: "Kestrel" })]);

    const diff = diffPlan(planned, { ...TWO_SUPPLIERS, items: [storedItem("item_kelly", "sup_kelly")] });

    expect(diff.items[0].existingItemId).toBeNull();
    expect(diff.counts.toCreate.items).toBe(1);
    expect(diff.divergences).toEqual([]);
  });

  it("AC-23: an exact key match always beats the loose one", () => {
    // Both stored rows have the description the plan carries, and the SUPPLIER-LESS one is
    // listed second. A loose-first implementation would claim `item_under_kestrel` for the
    // supplier-less planned item and then create a duplicate; an exact-first one does not.
    const planned = buildImportPlan([
      row({ row: 3, description: "Thing", supplier: "Kestrel" }),
      row({ row: 4, description: "Thing", supplier: null, price: null }),
    ]);

    expect(planned.items).toHaveLength(2);

    const diff = diffPlan(planned, {
      ...TWO_SUPPLIERS,
      items: [storedItem("item_under_kestrel", "sup_kestrel"), storedItem("item_no_supplier", null)],
    });

    expect(diff.items[0].existingItemId).toBe("item_under_kestrel");
    expect(diff.items[1].existingItemId).toBe("item_no_supplier");
    expect(diff.counts.toCreate.items).toBe(0);
  });

  it("AC-23: a row an exact match already claimed cannot be claimed a second time", () => {
    // Only the supplier-less row is stored, and an exact match takes it. The Kestrel item
    // must then be created rather than adopting the row that is already spoken for.
    const planned = buildImportPlan([
      row({ row: 3, description: "Thing", supplier: null, price: null }),
      row({ row: 4, description: "Thing", supplier: "Kestrel" }),
    ]);

    const diff = diffPlan(planned, { ...TWO_SUPPLIERS, items: [storedItem("item_no_supplier", null)] });

    expect(diff.items[0].existingItemId).toBe("item_no_supplier");
    expect(diff.items[1].existingItemId).toBeNull();
    expect(diff.counts.toCreate.items).toBe(1);
  });
});

/** The source row behind a cell, for the trimming assertions. */
function rowAtSource(sheet: string, number: number): YardSheetRow {
  const found = rows.find((candidate) => candidate.sheet === sheet && candidate.row === number);
  if (found === undefined) throw new Error(`no row for ${sheet}!${number}`);
  return found;
}
