import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { NO_SUPPLIER, NOT_COMPARABLE_PERIOD_INCOMPLETE } from "@/lib/analysis-messages";
import {
  MASTER_HEADERS,
  QUANTITY_HEADER,
  SIGNED_BY_LABEL,
  SIGNED_ON_LABEL,
  SUMMARY_MOM_LABEL,
  SUMMARY_SOUTH_LABEL,
  SUMMARY_TOTAL_STOCK_LABEL,
  SUMMARY_YOY_LABEL,
  TOTAL_LABEL,
  VALUE_HEADER,
} from "@/lib/export-messages";
import {
  buildWorkbook,
  type ExportInput,
  type ExportPeriod,
  type ExportRow,
  type ExportYard,
} from "@/lib/excel/workbook-writer";

/**
 * Spec 012's writer, proved in memory against the module and against the bytes it produces.
 *
 * Level 3 of docs/verification.md in the writing direction: build a fixture, write the buffer,
 * load it back with ExcelJS, and assert cells. No database and no browser, so AC-1 to AC-7,
 * AC-9 and AC-11 run in `npm run test:unit` on a machine with neither.
 */

const WRITER = "src/lib/excel/workbook-writer.ts";
const MESSAGES = "src/lib/export-messages.ts";

async function load(input: ExportInput): Promise<ExcelJS.Workbook> {
  const buffer = await buildWorkbook(input);
  const bytes = new Uint8Array(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes.buffer);
  return workbook;
}

async function bytesOf(input: ExportInput): Promise<Buffer> {
  return buildWorkbook(input);
}

/** The sheet named `name`, or a thrown error naming what the workbook did hold. */
function sheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const found = workbook.getWorksheet(name);
  if (found === undefined) {
    throw new Error(`no sheet ${name}; workbook holds ${workbook.worksheets.map((w) => w.name).join(", ")}`);
  }
  return found;
}

/** A cell value as a plain object, so a `{ formula, result }` can be read without a cast dance. */
function valueOf(worksheet: ExcelJS.Worksheet, ref: string): unknown {
  return worksheet.getCell(ref).value;
}

/* ----------------------------------------------------------------------- the fixtures */

const PERIOD_A: ExportPeriod = {
  periodKey: "2026-06",
  label: "June 2026",
  monthOnMonthKey: "2026-05",
  yearOnYearKey: "2025-06",
};

const PERIOD_B: ExportPeriod = {
  periodKey: "2026-07",
  label: "July 2026",
  monthOnMonthKey: "2026-06",
  yearOnYearKey: "2025-07",
};

function row(partial: Partial<ExportRow> & { description: string; cells: ExportRow["cells"] }): ExportRow {
  return {
    supplier: "Kestrel",
    typeName: "Logo",
    unitLabel: "1 Unit",
    currentPrice: "1.005",
    ...partial,
  };
}

/**
 * Two yards, two complete periods.
 *
 * `Dublin`'s June holds two lines worth `1.005` each: the exact sum is `2.010` -> `2.01`, while
 * the sum of the individually rounded cells is `1.01 + 1.01 = 2.02`. That one cent is the whole
 * of AC-3's distinguishability. A third item counted zero and a fourth never counted at all
 * exercise AC-7.
 */
function baseInput(overrides: Partial<ExportInput> = {}): ExportInput {
  const dublinRows: ExportRow[] = [
    row({
      description: "Widget A",
      cells: {
        "2026-06": { quantity: "1", value: "1.005" },
        "2026-07": { quantity: "2", value: "2.01" },
      },
    }),
    row({
      description: "Widget B",
      supplier: null,
      unitLabel: null,
      cells: { "2026-06": { quantity: "1", value: "1.005" } },
    }),
    row({
      description: "Counted Zero",
      typeName: "Thermo-P",
      currentPrice: "2",
      cells: { "2026-06": { quantity: "0", value: "0" } },
    }),
    row({
      description: "Never Counted",
      typeName: "Thermo-P",
      currentPrice: "2",
      cells: {},
    }),
  ];

  const clonmelRows: ExportRow[] = [
    row({
      description: "Clonmel Held",
      supplier: "Meon",
      cells: {
        "2026-06": { quantity: "5", value: "15" },
        "2026-07": { quantity: "5", value: "15" },
      },
    }),
  ];

  const dublin: ExportYard = {
    name: "Dublin",
    code: "DUBLIN",
    rows: dublinRows,
    counts: [
      { periodKey: "2026-06", signedByName: "Aoife", signedOn: "2026-06-30" },
      { periodKey: "2026-07", signedByName: "Ciara", signedOn: "2026-07-31" },
    ],
  };

  const clonmel: ExportYard = {
    name: "Clonmel",
    code: "CLONMEL",
    rows: clonmelRows,
    counts: [
      { periodKey: "2026-06", signedByName: "Brian", signedOn: "2026-07-01" },
      { periodKey: "2026-07", signedByName: "Dara", signedOn: "2026-08-01" },
    ],
  };

  return { showAll: false, periods: [PERIOD_A, PERIOD_B], yards: [dublin, clonmel], ...overrides };
}

/* --------------------------------------------------------------------------- AC-1 */

describe("AC-1: three sheets, named exactly, generated purely", () => {
  it("loads into Summary, Dublin and Clonmel, in that order, with no trailing space", async () => {
    const workbook = await load(baseInput());
    expect(workbook.worksheets.map((each) => each.name)).toEqual(["Summary", "Dublin", "Clonmel"]);
  });

  it("names the yard sheets for the active yards it is handed (ruling R5)", async () => {
    const workbook = await load(
      baseInput({
        yards: [
          { name: "Dublin", code: "DUBLIN", rows: [], counts: [] },
          { name: "Cashel", code: "CASHEL", rows: [], counts: [] },
        ],
      }),
    );
    expect(workbook.worksheets.map((each) => each.name)).toEqual(["Summary", "Dublin", "Cashel"]);
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

describe("AC-2: a yard sheet is the sample's shape", () => {
  it("row 2 is the five master columns then repeating Qty | Value, and row 1 labels the Qty columns", async () => {
    const workbook = await load(baseInput());
    const dublin = sheet(workbook, "Dublin");

    const header = ["A2", "B2", "C2", "D2", "E2", "F2", "G2", "H2", "I2"].map(
      (ref) => valueOf(dublin, ref),
    );
    expect(header).toEqual([
      ...MASTER_HEADERS,
      QUANTITY_HEADER,
      VALUE_HEADER,
      QUANTITY_HEADER,
      VALUE_HEADER,
    ]);

    expect(valueOf(dublin, "F1")).toBe("June 2026");
    expect(valueOf(dublin, "H1")).toBe("July 2026");
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

  it("number-formats value cells to two places and leaves an unheld period blank", async () => {
    const workbook = await load(baseInput());
    const dublin = sheet(workbook, "Dublin");

    expect(dublin.getCell("G3").numFmt).toBe("#,##0.00");
    // Widget B was never part of July: no line at all, so the cell is untouched.
    expect(dublin.getCell("H4").value).toBeNull();
    expect(dublin.getCell("I4").value).toBeNull();
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
          if (typeof value === "string") expect(errors.has(value), `${worksheet.name}!${cell.address}`).toBe(false);
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
    changed.yards[0].rows[0].cells["2026-06"] = { quantity: "3", value: "3.015" };
    const after = await load(changed);
    const afterValue = valueOf(sheet(after, "Dublin"), "G3");
    const afterTotal = (valueOf(sheet(after, "Dublin"), "G5") as { result?: number }).result;

    expect(afterValue).not.toBe(beforeValue);
    expect(afterTotal).not.toBe(beforeTotal);
  });
});

/* --------------------------------------------------------------------------- AC-5 */

describe("AC-5: Summary mirrors the sample and is derived", () => {
  it("labels the rows and derives South, Dublin and Total Stock per period, newest in B", async () => {
    const workbook = await load(baseInput());
    const summary = sheet(workbook, "Summary");

    expect(valueOf(summary, "B1")).toBe("July 2026");
    expect(valueOf(summary, "C1")).toBe("June 2026");

    expect(valueOf(summary, "A3")).toBe(SUMMARY_SOUTH_LABEL);
    expect(valueOf(summary, "A4")).toBe("Dublin");
    expect(valueOf(summary, "A5")).toBe(SUMMARY_TOTAL_STOCK_LABEL);
    expect(valueOf(summary, "A7")).toBe(SUMMARY_MOM_LABEL);
    expect(valueOf(summary, "A9")).toBe(SUMMARY_YOY_LABEL);

    // July: Clonmel 15 + Dublin 2.01 = 17.01; June the same.
    expect(valueOf(summary, "B3")).toBe(15);
    expect(valueOf(summary, "B4")).toBe(2.01);
    expect(valueOf(summary, "B5")).toBe(17.01);
    expect(valueOf(summary, "C3")).toBe(15);
    expect(valueOf(summary, "C5")).toBe(17.01);
  });

  it("leaves the Bal per nl block and row 16 empty", async () => {
    const workbook = await load(baseInput());
    const summary = sheet(workbook, "Summary");
    expect(valueOf(summary, "B16")).toBeNull();
    expect(valueOf(summary, "A16")).toBeNull();
  });

  it("gives no Total Stock for an incomplete period and names the missing yard elsewhere", async () => {
    const input = baseInput();
    // Clonmel was not counted in July, so July is incomplete.
    input.yards[1].counts = [input.yards[1].counts[0]];
    const workbook = await load(input);
    const summary = sheet(workbook, "Summary");

    expect(valueOf(summary, "B4")).toBe(2.01); // Dublin still has its figure
    expect(valueOf(summary, "B3")).toBeNull(); // South is absent
    expect(valueOf(summary, "B5")).toBeNull(); // so Total Stock does not exist
  });
});

/* --------------------------------------------------------------------------- AC-6 */

describe("AC-6: MoM and YoY join on the period and refuse across a gap", () => {
  it("computes a variance only when both operands are complete periods", async () => {
    const workbook = await load(baseInput());
    const summary = sheet(workbook, "Summary");

    // July vs June, both complete and both 17.01 -> 0.00.
    expect(valueOf(summary, "B7")).toBe(0);
    // Year on year needs July 2025, which was not exported.
    expect(valueOf(summary, "B9")).toBe(NOT_COMPARABLE_PERIOD_INCOMPLETE);
  });

  it("does not reach across a missing month: July's MoM is refused when June is absent", async () => {
    const may: ExportPeriod = {
      periodKey: "2026-05",
      label: "May 2026",
      monthOnMonthKey: "2026-04",
      yearOnYearKey: "2025-05",
    };
    const july = PERIOD_B;
    const input = baseInput({ periods: [may, july] });
    // Both yards counted May and July, but not June.
    for (const yard of input.yards) {
      yard.counts = [
        { periodKey: "2026-05", signedByName: "Aoife", signedOn: "2026-05-31" },
        { periodKey: "2026-07", signedByName: "Ciara", signedOn: "2026-07-31" },
      ];
    }

    const workbook = await load(input);
    const summary = sheet(workbook, "Summary");
    // B is July; its MoM comparand 2026-06 is missing, so the cell refuses rather than
    // reporting May-to-July as one month.
    expect(valueOf(summary, "B7")).toBe(NOT_COMPARABLE_PERIOD_INCOMPLETE);
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

describe("AC-9: the signer and the signed date are on each yard sheet", () => {
  it("renders the signer's name and the signed date as text, one pair per approved count", async () => {
    const workbook = await load(baseInput());
    const dublin = sheet(workbook, "Dublin");

    expect(valueOf(dublin, "A7")).toBe(SIGNED_BY_LABEL);
    expect(valueOf(dublin, "B7")).toBe("Aoife");
    expect(valueOf(dublin, "A8")).toBe(SIGNED_ON_LABEL);
    expect(valueOf(dublin, "B8")).toBe("2026-06-30");

    expect(valueOf(dublin, "B10")).toBe("Ciara");
    expect(valueOf(dublin, "B11")).toBe("2026-07-31");
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
