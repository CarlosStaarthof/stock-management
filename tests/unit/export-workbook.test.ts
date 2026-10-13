import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { NO_SUPPLIER } from "@/lib/analysis-messages";
import { buildWorkbook, type ExportInput, type ExportRow } from "@/lib/excel/workbook-writer";
import {
  MASTER_HEADERS,
  QUANTITY_HEADER,
  SIGNED_BY_LABEL,
  SIGNED_ON_LABEL,
  TOTAL_LABEL,
  VALUE_HEADER,
} from "@/lib/export-messages";

/**
 * Spec 012's writer, proved in memory against the module and against the bytes it produces.
 *
 * Level 3 of docs/verification.md in the writing direction: build a fixture, write the buffer,
 * load it back with ExcelJS, and assert cells. No database and no browser, so AC-1 to AC-7,
 * AC-9 and AC-11 run in `npm run test:unit` on a machine with neither.
 *
 * THE INPUT IS ONE DEPOT AND ONE STOCK TAKE (R3). There is no second depot and no second
 * period anywhere below; a file's shape is the shape of a single depot's single take.
 */

const WRITER = "src/lib/excel/workbook-writer.ts";
const MESSAGES = "src/lib/export-messages.ts";

async function load(input: ExportInput): Promise<ExcelJS.Workbook> {
  const buffer = await buildWorkbook(input);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(buffer).buffer);
  return workbook;
}

async function bytesOf(input: ExportInput): Promise<Buffer> {
  return buildWorkbook(input);
}

/** The sheet named `name`, or a thrown error naming what the workbook did hold. */
function sheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const found = workbook.getWorksheet(name);
  if (found === undefined) {
    throw new Error(
      `no sheet ${name}; workbook holds ${workbook.worksheets.map((w) => w.name).join(", ")}`,
    );
  }
  return found;
}

/** A cell value as a plain object, so a `{ formula, result }` can be read without a cast dance. */
function valueOf(worksheet: ExcelJS.Worksheet, ref: string): unknown {
  return worksheet.getCell(ref).value;
}

/** Every string a workbook holds, cell by cell, so an absence can be asserted over the lot. */
function stringsIn(workbook: ExcelJS.Workbook): string[] {
  const found: string[] = [];
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === "string") found.push(cell.value);
      });
    });
  }
  return found;
}

/* ----------------------------------------------------------------------- the fixtures */

function row(partial: Partial<ExportRow> & { description: string }): ExportRow {
  return {
    supplier: "Kestrel",
    typeName: "Logo",
    unitLabel: "1 Unit",
    currentPrice: "1.005",
    cell: null,
    ...partial,
  };
}

/**
 * One depot, one stock take.
 *
 * Two lines worth `1.005` each: the exact sum is `2.010` -> `2.01`, while the sum of the
 * individually rounded cells is `1.01 + 1.01 = 2.02`. That one cent is the whole of AC-3's
 * distinguishability. A third item counted zero and a fourth never counted at all exercise
 * AC-7.
 */
function baseInput(overrides: Partial<ExportInput> = {}): ExportInput {
  const rows: ExportRow[] = [
    row({ description: "Widget A", cell: { quantity: "1", value: "1.005" } }),
    row({ description: "Widget B", supplier: null, unitLabel: null, cell: { quantity: "1", value: "1.005" } }),
    row({
      description: "Counted Zero",
      typeName: "Thermo-P",
      currentPrice: "2",
      cell: { quantity: "0", value: "0" },
    }),
    row({ description: "Never Counted", typeName: "Thermo-P", currentPrice: "2", cell: null }),
  ];

  return {
    showAll: false,
    depotName: "Dublin",
    periodLabel: "June 2026",
    rows,
    count: { signedByName: "Aoife", signedOn: "2026-06-30" },
    ...overrides,
  };
}

/* --------------------------------------------------------------------------- AC-1 */

describe("AC-1: two sheets, one depot, named exactly, generated purely", () => {
  it("loads into Summary then the depot sheet, in that order, with no trailing space", async () => {
    const workbook = await load(baseInput());
    expect(workbook.worksheets.map((each) => each.name)).toEqual(["Summary", "Dublin"]);
  });

  it("names the depot sheet for the depot it is handed (ruling R5)", async () => {
    const workbook = await load(baseInput({ depotName: "Cashel" }));
    expect(workbook.worksheets.map((each) => each.name)).toEqual(["Summary", "Cashel"]);
  });

  it("imports exceljs and src/lib only: never @/server or @prisma", () => {
    const source = readFileSync(WRITER, "utf8");
    expect(source).not.toMatch(/from\s+["']@\/server\//);
    expect(source).not.toMatch(/from\s+["']@prisma\//);
    expect(source).not.toMatch(/require\(/);
  });

  it("builds a buffer with no database and no environment", async () => {
    const bytes = await bytesOf(baseInput());
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});

/* --------------------------------------------------------------------------- AC-2 */

describe("AC-2: a depot sheet is the sample's shape", () => {
  it("row 2 is the five master columns then one Qty | Value, and row 1 labels the Qty column", async () => {
    const workbook = await load(baseInput());
    const dublin = sheet(workbook, "Dublin");

    const header = ["A2", "B2", "C2", "D2", "E2", "F2", "G2"].map((ref) => valueOf(dublin, ref));
    expect(header).toEqual([...MASTER_HEADERS, QUANTITY_HEADER, VALUE_HEADER]);

    expect(valueOf(dublin, "F1")).toBe("June 2026");
    // There is no second stock take, so there is no second pair of columns.
    expect(valueOf(dublin, "H1")).toBeNull();
    expect(valueOf(dublin, "H2")).toBeNull();
  });

  it("writes the item fields, NO_SUPPLIER where there is none, and the current price", async () => {
    const workbook = await load(baseInput());
    const dublin = sheet(workbook, "Dublin");

    expect(valueOf(dublin, "A3")).toBe("Widget A");
    expect(valueOf(dublin, "B3")).toBe("Kestrel");
    expect(valueOf(dublin, "C3")).toBe("Logo");
    expect(valueOf(dublin, "D3")).toBe("1 Unit");
    expect(valueOf(dublin, "E3")).toBe("€1.005");

    expect(valueOf(dublin, "A4")).toBe("Widget B");
    expect(valueOf(dublin, "B4")).toBe(NO_SUPPLIER);
  });
});

/* --------------------------------------------------------------------------- AC-3 */

describe("AC-3: every value is derived, and the total is a formula", () => {
  it("stores each exact line value and a SUM total rounded once, not the sum of rounded cells", async () => {
    const workbook = await load(baseInput());
    const dublin = sheet(workbook, "Dublin");

    // Two lines worth 1.005 each. The stored value is exact; the display format rounds.
    expect(valueOf(dublin, "G3")).toBe(1.005);
    expect(valueOf(dublin, "G4")).toBe(1.005);

    const total = valueOf(dublin, "G5") as { formula?: string; result?: number };
    expect(total.formula).toMatch(/^SUM\(G3:G4\)$/);
    expect(total.result).toBe(2.01); // roundHalfUp("2.010", 2)
    expect(total.result).not.toBe(2.02); // the sum of the rounded cells would be 2.02
  });

  it("number-formats value cells to two places and leaves an uncounted item blank", async () => {
    const workbook = await load(baseInput({ showAll: true }));
    const dublin = sheet(workbook, "Dublin");

    expect(dublin.getCell("G3").numFmt).toBe("#,##0.00");
    // Never Counted is row 6 and has no line at all: both its cells are untouched.
    expect(dublin.getCell("F6").value).toBeNull();
    expect(dublin.getCell("G6").value).toBeNull();
    // The counted zero is a real line, so its cell is a zero rather than a blank.
    expect(dublin.getCell("F5").value).toBe(0);
    expect(dublin.getCell("G5").value).toBe(0);
  });
});

/* --------------------------------------------------------------------------- AC-4 */

describe("AC-4: no error cell, and the cells track the data", () => {
  it("walks every cell of every sheet and finds no error value", async () => {
    const workbook = await load(baseInput({ showAll: true }));
    const errors = new Set(["#REF!", "#DIV/0!", "#VALUE!", "#NAME?", "#N/A", "#NULL!", "#NUM!"]);

    for (const worksheet of workbook.worksheets) {
      worksheet.eachRow((worksheetRow) => {
        worksheetRow.eachCell((cell) => {
          const value = cell.value;
          if (typeof value === "string") {
            expect(errors.has(value), `${worksheet.name}!${cell.address}`).toBe(false);
          }
          if (value !== null && typeof value === "object" && "error" in value) {
            expect(errors.has(String((value as { error: unknown }).error))).toBe(false);
          }
        });
      });
    }
  });

  it("changes the value cell and the total when a line's quantity changes", async () => {
    const before = await load(baseInput());
    const beforeValue = valueOf(sheet(before, "Dublin"), "G3");
    const beforeTotal = (valueOf(sheet(before, "Dublin"), "G5") as { result?: number }).result;

    const changed = baseInput();
    changed.rows[0].cell = { quantity: "3", value: "3.015" };
    const after = await load(changed);
    const afterValue = valueOf(sheet(after, "Dublin"), "G3");
    const afterTotal = (valueOf(sheet(after, "Dublin"), "G5") as { result?: number }).result;

    expect(afterValue).not.toBe(beforeValue);
    expect(afterTotal).not.toBe(beforeTotal);
  });
});

/* --------------------------------------------------------------------------- AC-5 */

describe("AC-5: the summary is the depot alone and is derived", () => {
  it("names the depot in A3 and its total in B3, and carries no cross-depot figure", async () => {
    const workbook = await load(baseInput());
    const summary = sheet(workbook, "Summary");

    expect(valueOf(summary, "A3")).toBe("Dublin");
    const total = valueOf(summary, "B3") as { formula?: string; result?: number };
    expect(total.formula).toMatch(/^'Dublin'!G5$/);
    expect(total.result).toBe(2.01);
  });

  it("does not spell South, Total Stock, MoM Variance or YoY Variance anywhere", async () => {
    const workbook = await load(baseInput());
    const strings = stringsIn(workbook);

    for (const forbidden of ["South", "Cashel", "Total Stock", "MoM Variance", "YoY Variance"]) {
      expect(strings, forbidden).not.toContain(forbidden);
    }
    expect(strings).toContain("Dublin");
  });
});

/* --------------------------------------------------------------------------- AC-6 */

describe("AC-6: a file carries exactly one depot and no other", () => {
  it("builds a Dublin file with no Cashel cell, and a Cashel file with no Dublin cell", async () => {
    const dublin = await load(baseInput({ depotName: "Dublin" }));
    expect(stringsIn(dublin)).not.toContain("Cashel");

    const cashel = await load(baseInput({ depotName: "Cashel" }));
    expect(stringsIn(cashel)).not.toContain("Dublin");
    expect(stringsIn(cashel)).toContain("Cashel");
  });

  it("carries only its own stock take's pair (no second period column)", async () => {
    const workbook = await load(baseInput());
    const dublin = sheet(workbook, "Dublin");

    expect(valueOf(dublin, "F2")).toBe(QUANTITY_HEADER);
    expect(valueOf(dublin, "G2")).toBe(VALUE_HEADER);
    expect(valueOf(dublin, "H2")).toBeNull();
  });
});

/* --------------------------------------------------------------------------- AC-7 */

describe("AC-7: held-only by default; showAll restores every assigned item", () => {
  it("counts only held rows by default and every assigned row with showAll", async () => {
    const held = await load(baseInput({ showAll: false }));
    const all = await load(baseInput({ showAll: true }));

    const heldDublin = sheet(held, "Dublin");
    const allDublin = sheet(all, "Dublin");

    // Held: Widget A and Widget B. Counted-zero and never-counted do not appear.
    expect(valueOf(heldDublin, "A3")).toBe("Widget A");
    expect(valueOf(heldDublin, "A4")).toBe("Widget B");
    expect(valueOf(heldDublin, "A5")).toBe(TOTAL_LABEL);

    expect(valueOf(allDublin, "A3")).toBe("Widget A");
    expect(valueOf(allDublin, "A4")).toBe("Widget B");
    expect(valueOf(allDublin, "A5")).toBe("Counted Zero");
    expect(valueOf(allDublin, "A6")).toBe("Never Counted");
    expect(valueOf(allDublin, "A7")).toBe(TOTAL_LABEL);
  });

  it("is mode-independent in the total: a counted zero moves no figure", async () => {
    const held = await load(baseInput({ showAll: false }));
    const all = await load(baseInput({ showAll: true }));
    const heldTotal = (valueOf(sheet(held, "Dublin"), "G5") as { result?: number }).result;
    const allTotal = (valueOf(sheet(all, "Dublin"), "G7") as { result?: number }).result;
    expect(allTotal).toBe(heldTotal);
  });
});

/* --------------------------------------------------------------------------- AC-9 */

describe("AC-9: the signer and the signed date are on the depot sheet", () => {
  it("renders the signer's name and the signed date as text", async () => {
    const workbook = await load(baseInput());
    const dublin = sheet(workbook, "Dublin");

    expect(valueOf(dublin, "A7")).toBe(SIGNED_BY_LABEL);
    expect(valueOf(dublin, "B7")).toBe("Aoife");
    expect(valueOf(dublin, "A8")).toBe(SIGNED_ON_LABEL);
    expect(valueOf(dublin, "B8")).toBe("2026-06-30");
  });

  it("names the signature column in neither the writer nor its messages (009 AC-26)", () => {
    expect(readFileSync(WRITER, "utf8")).not.toMatch(/signatureSvg/);
    expect(readFileSync(MESSAGES, "utf8")).not.toMatch(/signatureSvg/);
  });
});

/* -------------------------------------------------------------------------- AC-11 */

describe("AC-11: no new dependency, and the file is self-contained", () => {
  it("leaves package.json's dependencies exactly as they are", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual([
      "@prisma/client",
      "bcryptjs",
      "exceljs",
      "next",
      "next-auth",
      "react",
      "react-dom",
      "zod",
    ]);
  });

  it("embeds no host, connection string, secret or absolute path in the bytes", async () => {
    const buffer = await bytesOf(baseInput());
    const text = buffer.toString("latin1");
    for (const sentinel of [
      "postgres://",
      "DATABASE_URL",
      "DIRECT_URL",
      "PIN_PEPPER",
      "AUTH_SECRET",
      "/scratch/stock-management",
      "localhost",
    ]) {
      expect(text.includes(sentinel), sentinel).toBe(false);
    }
  });
});
