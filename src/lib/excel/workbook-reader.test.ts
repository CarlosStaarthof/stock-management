import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";

import { readYardSheets, toDecimalString, type YardSheetRow } from "@/lib/excel/workbook-reader";
import { ValidationError } from "@/server/errors";

/**
 * Spec 005 AC-1 to AC-7 — the reader, against the real workbook.
 *
 * Level 3 of docs/verification.md, in the reading direction: a real `.xlsx` buffer, read
 * back and asserted cell by cell. `Samples/` is opened read-only and never written to.
 *
 * Every figure here was counted from the file, not inherited: 152 rows, 82 on `Dublin`
 * and 70 on `'Clonmel '`.
 */

const WORKBOOK_PATH = "Samples/Stock @ 01-Sep-2026.xlsx";

const EXPECTED_KEYS = [
  "belowTotal",
  "description",
  "itemType",
  "price",
  "row",
  "sheet",
  "supplier",
  "unitLabel",
];

let rows: YardSheetRow[];

function rowAt(sheet: string, row: number): YardSheetRow {
  const found = rows.find((candidate) => candidate.sheet === sheet && candidate.row === row);
  if (found === undefined) throw new Error(`no row for ${sheet}!${row}`);
  return found;
}

/** An `.xlsx` built in memory, so a defect the real file does not have can still be proved. */
async function workbookWith(
  sheets: { name: string; cells: Record<string, ExcelJS.CellValue> }[],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const [ref, value] of Object.entries(sheet.cells)) {
      worksheet.getCell(ref).value = value;
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** A minimal but valid `'Clonmel '` sheet, so a Dublin fixture can be read at all. */
const VALID_CLONMEL = {
  name: "Clonmel ",
  cells: {
    A2: "Description",
    A3: "Something",
    B3: "Kestrel",
    C3: "Logo",
    D3: "1 Unit",
    E3: 5,
    A4: "TOTAL",
  } as Record<string, ExcelJS.CellValue>,
};

beforeAll(async () => {
  rows = await readYardSheets(readFileSync(WORKBOOK_PATH));
});

describe("readYardSheets against the source workbook", () => {
  it("AC-1: returns 152 rows, from the two yard sheets and nothing else", () => {
    expect(rows).toHaveLength(152);
    expect([...new Set(rows.map((row) => row.sheet))].sort()).toEqual(["Clonmel ", "Dublin"]);
  });

  it("AC-1: every row carries exactly the eight declared fields", () => {
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(EXPECTED_KEYS);
    }
  });

  it("AC-1: no field carries a quantity, a value, a count or a date", () => {
    // The historical Qty/Value column pairs are not imported (Part 2). The reader cannot
    // leak one it never names.
    for (const key of EXPECTED_KEYS) {
      expect(key).not.toMatch(/qty|quantity|value|count|date/i);
    }
  });

  it("AC-2: resolves the worksheet whose name is exactly 'Clonmel ', trailing space and all", () => {
    const clonmel = rows.filter((row) => row.sheet === "Clonmel ");

    expect(clonmel).toHaveLength(70);
    expect(clonmel[0].sheet).toBe("Clonmel ");
    expect(clonmel[0].sheet.endsWith(" ")).toBe(true);
  });

  it("AC-3: Dublin's item block is rows 3-84, 82 rows, and no row below the total", () => {
    const dublin = rows.filter((row) => row.sheet === "Dublin");
    const inBlock = dublin.filter((row) => !row.belowTotal);

    expect(inBlock).toHaveLength(82);
    expect(inBlock[0].row).toBe(3);
    expect(inBlock[inBlock.length - 1].row).toBe(84);
    expect(dublin.filter((row) => row.belowTotal)).toHaveLength(0);
  });

  it("AC-3: 'Clonmel ' gives rows 3-70 plus the two below-total rows 75 and 76", () => {
    const clonmel = rows.filter((row) => row.sheet === "Clonmel ");
    const inBlock = clonmel.filter((row) => !row.belowTotal);
    const below = clonmel.filter((row) => row.belowTotal);

    expect(inBlock).toHaveLength(68);
    expect(inBlock[0].row).toBe(3);
    expect(inBlock[inBlock.length - 1].row).toBe(70);
    expect(below.map((row) => row.row)).toEqual([75, 76]);
    expect(below.map((row) => row.description)).toEqual([
      "Road Diesel - White",
      "Marked Gas Oil - Green",
    ]);
  });

  it("AC-3: the TOTAL rows are not items, and Dublin's empty row 85 is skipped silently", () => {
    expect(rows.some((row) => row.sheet === "Clonmel " && row.row === 71)).toBe(false);
    expect(rows.some((row) => row.sheet === "Dublin" && row.row === 86)).toBe(false);
    expect(rows.some((row) => row.description.trim().toUpperCase() === "TOTAL")).toBe(false);

    // Empty across A-E: neither returned nor an error.
    expect(rows.some((row) => row.sheet === "Dublin" && row.row === 85)).toBe(false);
  });

  it("AC-4: the five rich-text descriptions concatenate every run, not just the first", () => {
    expect(rowAt("Clonmel ", 9).description).toBe("White - Briteline");
    expect(rowAt("Clonmel ", 10).description).toBe("Yellow  - Briteline");
    expect(rowAt("Clonmel ", 22).description).toBe("Stick On Studs - Meon");
    expect(rowAt("Clonmel ", 23).description).toBe("Stick On Studs - Roadcraft  1st July");
    expect(rowAt("Clonmel ", 24).description).toBe("Anti Skid Buff  - Kelly's");
  });

  it("AC-4: each of the five is strictly longer than its own first run", () => {
    // The bug this criterion exists for: an earlier reader took the first run alone and
    // produced `tBriteline`, which this project then recorded as a supplier typo that does
    // not exist (specs/domain-model.md Part 2).
    const firstRuns: [number, string][] = [
      [9, "White - "],
      [10, "Yellow  - "],
      [22, "Stick On Studs - "],
      [23, "Stick On Studs -"],
      [24, "Anti Skid Buff  - "],
    ];

    for (const [row, firstRun] of firstRuns) {
      const description = rowAt("Clonmel ", row).description;

      expect(description.startsWith(firstRun)).toBe(true);
      expect(description.length).toBeGreaterThan(firstRun.length);
    }
  });

  it("AC-4: every description is a string, never an object carrying richText", () => {
    for (const row of rows) {
      expect(typeof row.description).toBe("string");
      expect(row.description).not.toMatch(/richText/);
    }
  });

  it("AC-4: no description begins with a lower-case t, because no t prefix exists", () => {
    expect(rows.filter((row) => row.description.startsWith("t"))).toEqual([]);
  });

  it("AC-8: no supplier cell carries a leading t either", () => {
    expect(rows.filter((row) => (row.supplier ?? "").startsWith("t"))).toEqual([]);
  });

  it("AC-5: text is read as UTF-8, so the euro sign survives", () => {
    const description = rowAt("Clonmel ", 28).description;

    expect(description).toBe("Anti Skid Grains (€550 p/T)");
    expect(description).toContain("€");
  });

  it("AC-6: a formula price is imported as its computed value, at eight places", () => {
    expect(rowAt("Clonmel ", 19).price).toBe("6.11764706");
    expect(rowAt("Clonmel ", 20).price).toBe("2.88235294");
    expect(rowAt("Clonmel ", 21).price).toBe("6.92941176");
    expect(rowAt("Clonmel ", 23).price).toBe("1.55555556");
  });

  it("AC-6: the workbook's binary-float artefacts normalise", () => {
    expect(rowAt("Dublin", 10).price).toBe("33.09");
    expect(rowAt("Dublin", 31).price).toBe("2252.8");
    expect(rowAt("Dublin", 55).price).toBe("137.11");
    expect(rowAt("Dublin", 72).price).toBe("155.55");
  });

  it("AC-6: every price is a decimal string, never a JavaScript number", () => {
    for (const row of rows) {
      if (row.price === null) continue;
      expect(typeof row.price).toBe("string");
      expect(row.price).toMatch(/^-?\d+(\.\d{1,8})?$/);
    }
  });

  it("AC-7: all 152 rows of the real workbook carry a description", () => {
    expect(rows.filter((row) => row.description.trim() === "")).toEqual([]);
  });
});

describe("readYardSheets refuses what it cannot import", () => {
  it("AC-2: a workbook with no 'Clonmel ' sheet is a ValidationError, not 82 rows", async () => {
    const buffer = await workbookWith([
      {
        name: "Dublin",
        cells: { A2: "Description", A3: "Thing", C3: "Logo", A4: "TOTAL" },
      },
    ]);

    await expect(readYardSheets(buffer)).rejects.toBeInstanceOf(ValidationError);
    await expect(readYardSheets(buffer)).rejects.toThrow(/Clonmel/);
    await expect(readYardSheets(buffer)).rejects.toThrow(/sheet/);
  });

  it("AC-2: a sheet named Clonmel without the trailing space is not the sheet", async () => {
    const buffer = await workbookWith([
      { name: "Dublin", cells: { A3: "Thing", C3: "Logo", A4: "TOTAL" } },
      { name: "Clonmel", cells: { A3: "Thing", C3: "Logo", A4: "TOTAL" } },
    ]);

    await expect(readYardSheets(buffer)).rejects.toThrow(/Clonmel/);
  });

  it("AC-7: a row with a supplier and a price but no description names the sheet and the row", async () => {
    const buffer = await workbookWith([
      {
        name: "Dublin",
        cells: {
          A2: "Description",
          A3: "Thing",
          C3: "Logo",
          D3: "1 Unit",
          E3: 10,
          // Row 7: no description, but a supplier and a price. A defect at source.
          B7: "Kestrel",
          E7: 12.5,
          A8: "TOTAL",
        },
      },
      VALID_CLONMEL,
    ]);

    await expect(readYardSheets(buffer)).rejects.toBeInstanceOf(ValidationError);
    await expect(readYardSheets(buffer)).rejects.toThrow(/Dublin/);
    await expect(readYardSheets(buffer)).rejects.toThrow(/7/);
  });

  it("AC-7: a row that is empty across A-E is skipped rather than refused", async () => {
    const buffer = await workbookWith([
      {
        name: "Dublin",
        cells: { A3: "Thing", C3: "Logo", D3: "1 Unit", E3: 10, A6: "TOTAL" },
      },
      VALID_CLONMEL,
    ]);

    const read = await readYardSheets(buffer);

    expect(read.filter((row) => row.sheet === "Dublin").map((row) => row.row)).toEqual([3]);
  });

  it("AC-6: a price formula with no cached result names the sheet and the cell", async () => {
    const buffer = await workbookWith([
      {
        name: "Dublin",
        cells: {
          A3: "Thing",
          C3: "Logo",
          D3: "1 Unit",
          // Written without a cached result, exactly as a file saved by a non-Excel tool.
          E3: { formula: "5.2/0.85" },
          A4: "TOTAL",
        },
      },
      VALID_CLONMEL,
    ]);

    await expect(readYardSheets(buffer)).rejects.toBeInstanceOf(ValidationError);
    await expect(readYardSheets(buffer)).rejects.toThrow(/Dublin/);
    await expect(readYardSheets(buffer)).rejects.toThrow(/E3/);
  });

  it("AC-3: a sheet with no TOTAL row has no item block, and says so", async () => {
    const buffer = await workbookWith([
      { name: "Dublin", cells: { A3: "Thing", C3: "Logo" } },
      VALID_CLONMEL,
    ]);

    await expect(readYardSheets(buffer)).rejects.toBeInstanceOf(ValidationError);
    await expect(readYardSheets(buffer)).rejects.toThrow(/TOTAL/);
  });
});

describe("toDecimalString", () => {
  it("AC-6: rounds half-up at eight places, on the digits and not through a float", () => {
    expect(toDecimalString(6.117647058823529)).toBe("6.11764706");
    expect(toDecimalString(1.5555555555555554)).toBe("1.55555556");
    expect(toDecimalString(33.090000000000003)).toBe("33.09");
    expect(toDecimalString(2252.8000000000002)).toBe("2252.8");
    expect(toDecimalString(890)).toBe("890");
    expect(toDecimalString(0)).toBe("0");
  });

  it("AC-6: carries across a run of nines rather than dropping the carry", () => {
    expect(toDecimalString(0.999999999)).toBe("1");
    expect(toDecimalString(9.999999995)).toBe("10");
  });

  it("AC-6: refuses a value that is not a finite number", () => {
    expect(() => toDecimalString(Number.NaN)).toThrow(ValidationError);
    expect(() => toDecimalString(Number.POSITIVE_INFINITY)).toThrow(ValidationError);
  });
});
