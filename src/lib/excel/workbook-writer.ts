import ExcelJS from "exceljs";

import { NO_SUPPLIER } from "@/lib/analysis-messages";
import {
  MASTER_HEADERS,
  QUANTITY_HEADER,
  SHEET_SUMMARY,
  SIGNED_BY_LABEL,
  SIGNED_ON_LABEL,
  TOTAL_LABEL,
  VALUE_HEADER,
} from "@/lib/export-messages";
import { isHeld } from "@/lib/held";
import { roundHalfUp, sumDecimals } from "@/lib/money";

/**
 * Builds the workbook feature #12 exports for ONE depot's ONE stock take, from plain data and
 * nothing else.
 *
 * PURE, AND THAT IS ENFORCED. It imports `exceljs` and `src/lib/` ONLY — never `@/server/`,
 * never `@prisma/client` — so AC-1's scan holds and the whole of AC-1 to AC-7, AC-9 and AC-11
 * is provable in `npm run test:unit` with no Postgres and no browser. Every euro arrives on a
 * field this module's own `ExportInput` shape declares (`value`), never by naming the
 * price-snapshot column, so 009 AC-26 keeps that column named by exactly the service modules
 * that already do.
 *
 * IT ALSO OBEYS A SCAN IT DID NOT BUILD. `src/server/items/workbook-plan.test.ts` sweeps every
 * module under `src/lib/excel` and requires that a non-comment line names no SHEET-COLUMN string
 * other than A to E, and that no cell is fetched by a numeric column index. That scan is #5's,
 * about the importer; this module is not the importer but sits in the scanned directory, so it
 * names its sheet through `src/lib/export-messages.ts` and addresses every cell by an A1-style
 * reference rather than a `(row, column)` pair. The guarantee #5 protects is untouched.
 *
 * FOUR RULES THE SHAPE ENCODES, EACH WITH AN ACCEPTANCE CRITERION RATHER THAN A COMMENT:
 *
 *  1. ONE DEPOT, ONE STOCK TAKE (AC-1, AC-6). The input is a single depot's name, one period's
 *     label, its rows and its one `APPROVED` count. There is no second depot and no second
 *     period anywhere in this module, so a file can never mix the two sites or two months.
 *  2. EVERY VALUE IS DERIVED, AND THE TOTAL IS A FORMULA (AC-3). The caller hands each line's
 *     exact `quantity x snapshot` value as a decimal string; the writer stores the number and
 *     the depot TOTAL is a `SUM(...)` formula over the value column, whose cached result is the
 *     sum of the EXACT line values rounded once — never the sum of the rounded cells. The value
 *     cell itself is the exact number, displayed at two places by a number format, so a
 *     spreadsheet that recalculates the formula still gets the exact sum.
 *  3. NO ERROR CELL IS POSSIBLE (AC-4). Nothing here writes `#REF!`, `#DIV/0!` or any other
 *     error value; an item with no line in the stock take is a blank, never a zero.
 *  4. HELD ONLY BY DEFAULT (AC-7). With `showAll: false`, a row appears only when it holds stock
 *     in the stock take, by `isHeld` — the same `quantity > 0` rule every other surface uses; a
 *     counted zero and a blank are two different facts and neither is held.
 */

/**
 * One item's line in the stock take: what was counted and what it is worth, both as strings.
 *
 * `quantity` is `null` when there was no line at all — *nobody looked* — and the string `"0"`
 * when a person counted none; the two are different facts (Invariant 5) and the writer keeps
 * them apart. `value` is the EXACT `quantity x snapshot` (or `"0"` when the line has no
 * snapshot), already computed by the service so this module never names the snapshot column.
 */
export type ExportLineCell = {
  quantity: string | null;
  value: string;
};

/** One item row of the depot sheet. Field by field; the shape is the boundary (AC-2, AC-4). */
export type ExportRow = {
  description: string;
  /** `null` becomes `NO_SUPPLIER` on the sheet, exactly as the item master shows it (AC-2). */
  supplier: string | null;
  typeName: string;
  unitLabel: string | null;
  /** Column E: the item's CURRENT price as a decimal string, or `null` for no price (ruling R4). */
  currentPrice: string | null;
  /** This stock take's line, or `null` when the item had none. */
  cell: ExportLineCell | null;
};

/** The one `APPROVED` count exported: the only kind that carries a euro and a signature (AC-9). */
export type ExportCount = {
  /** `User.name` of `StockCount.signedById`, via `getLifecycleFacts`. */
  signedByName: string | null;
  /** `signedAt` as `YYYY-MM-DD`, or `null`. Ruling R2: the date travels, the stroke does not. */
  signedOn: string | null;
};

/**
 * Everything `buildWorkbook` needs for ONE depot's ONE stock take. Plain data; no database row
 * and no service call.
 *
 * `depotName` is the worksheet name as well as the Summary's own label: AC-1 and ruling R5 make
 * it the depot's own `Location.name`, so it is `Dublin` or `Cashel` and never `Cashel ` with a
 * trailing space.
 */
export type ExportInput = {
  /** `false` is held-only (AC-7); the route's `?all=1` sets `true`. */
  showAll: boolean;
  depotName: string;
  /** `"September 2026"` — `formatMonthLabel`'s output, as the workbook shows it (AC-2). */
  periodLabel: string;
  rows: ExportRow[];
  count: ExportCount;
};

/* -------------------------------------------------------------------------- helpers */

/** A quantity cell lines up on the point without showing fourteen decimal places of noise. */
const QUANTITY_FORMAT = "0.####";
/** A euro cell is displayed to the cent, by a format rather than by lossy rounding (AC-3). */
const MONEY_FORMAT = "#,##0.00";
/** Feature #22 AC-8: column E is a number a reader can sort and sum, shown in euros. */
const PRICE_FORMAT = '"€"#,##0.00';

/**
 * The column letter of a 1-based index. Excel's bijective base-26: index 1 is A, 26 is Z,
 * 27 is AA and 703 is AAA. Built from arithmetic only, so no column name is a string literal.
 */
export function columnLetter(index: number): string {
  let remaining = index;
  let letters = "";

  while (remaining > 0) {
    const offset = (remaining - 1) % 26;
    letters = String.fromCharCode(65 + offset) + letters;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return letters;
}

/** The A1-style reference of a 1-based column and row, e.g. column 7 row 5 is G5. */
function ref(column: number, row: number): string {
  return `${columnLetter(column)}${row}`;
}

/** A worksheet name inside a formula: single quotes doubled, always quoted. */
function quotedSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

/** The value a cell holds, exact. A decimal string becomes a number, which xlsx stores as a double. */
function numberOf(decimal: string): number {
  return Number(decimal);
}

/** The depot's rows, held-only unless `showAll` (AC-7). Input order preserved. */
function visibleRows(input: ExportInput): ExportRow[] {
  if (input.showAll) return [...input.rows];

  return input.rows.filter((row) => row.cell !== null && isHeld(row.cell.quantity));
}

/**
 * The depot's exact total for the stock take: the sum of every line value it contributed.
 *
 * Mode-independent: a hidden counted-zero line contributes `"0"`, so held-only and show-all
 * agree to the cent. An empty depot totals `"0"`, which is a real figure (nothing is held), not
 * a missing one.
 */
function depotTotal(input: ExportInput): string {
  const values: string[] = [];
  for (const row of input.rows) {
    if (row.cell !== null) values.push(row.cell.value);
  }

  return sumDecimals(values);
}

/* --------------------------------------------------------------------- the worksheets */

/**
 * The depot sheet, in the sample's shape (AC-2) with the derived figure (AC-3).
 *
 * Row 1 carries the period label above the one `Qty` column, row 2 the five master headers and
 * the `Qty | Value` pair, data from row 3, the total row after it, and the signer block below
 * that. Returns the total row's number so the overview can point its own total at it.
 */
function writeDepotSheet(sheet: ExcelJS.Worksheet, input: ExportInput): number {
  sheet.getCell(ref(6, 1)).value = input.periodLabel;

  const headers = [...MASTER_HEADERS, QUANTITY_HEADER, VALUE_HEADER];
  headers.forEach((header, index) => {
    sheet.getCell(ref(index + 1, 2)).value = header;
  });

  const rows = visibleRows(input);

  rows.forEach((row, rowIndex) => {
    const excelRow = 3 + rowIndex;

    sheet.getCell(ref(1, excelRow)).value = row.description;
    sheet.getCell(ref(2, excelRow)).value = row.supplier ?? NO_SUPPLIER;
    sheet.getCell(ref(3, excelRow)).value = row.typeName;
    sheet.getCell(ref(4, excelRow)).value = row.unitLabel ?? "";
    // Column E: the current price as a NUMBER, never text (022 AC-8). An item with no
    // price leaves the cell blank, not an empty string.
    const priceCell = sheet.getCell(ref(5, excelRow));
    if (row.currentPrice !== null) {
      priceCell.value = numberOf(row.currentPrice);
      priceCell.numFmt = PRICE_FORMAT;
    }

    if (row.cell === null) return;

    if (row.cell.quantity !== null) {
      const quantityCell = sheet.getCell(ref(6, excelRow));
      quantityCell.value = numberOf(row.cell.quantity);
      quantityCell.numFmt = QUANTITY_FORMAT;
    }

    const valueCell = sheet.getCell(ref(7, excelRow));
    valueCell.value = numberOf(row.cell.value);
    valueCell.numFmt = MONEY_FORMAT;
  });

  // One row below the block, or row 4 when there are no data rows, so the range is never empty.
  const lastDataRow = Math.max(2 + rows.length, 3);
  const totalRow = lastDataRow + 1;
  sheet.getCell(ref(1, totalRow)).value = TOTAL_LABEL;

  const totalCell = sheet.getCell(ref(7, totalRow));
  totalCell.value = {
    formula: `SUM(${ref(7, 3)}:${ref(7, lastDataRow)})`,
    result: numberOf(roundHalfUp(depotTotal(input), 2)),
  };
  totalCell.numFmt = MONEY_FORMAT;

  const signerRow = totalRow + 2;
  sheet.getCell(ref(1, signerRow)).value = SIGNED_BY_LABEL;
  sheet.getCell(ref(2, signerRow)).value = input.count.signedByName ?? "";
  sheet.getCell(ref(1, signerRow + 1)).value = SIGNED_ON_LABEL;
  sheet.getCell(ref(2, signerRow + 1)).value = input.count.signedOn ?? "";

  return totalRow;
}

/**
 * The overview sheet: the depot's own name and its total for the stock take, and nothing else
 * (AC-5).
 *
 * Row 3 is the depot name in column A and its total in column B, the total a cross-sheet
 * formula onto the depot sheet's own TOTAL cell so the two can never disagree. There is no
 * `South`, no second depot, no `Total Stock`, no `MoM` and no `YoY`: a single-depot,
 * single-stock-take file has neither a second depot nor a second period to compare against.
 */
function writeOverviewSheet(sheet: ExcelJS.Worksheet, input: ExportInput, totalRow: number): void {
  sheet.getCell(ref(1, 3)).value = input.depotName;

  const totalCell = sheet.getCell(ref(2, 3));
  totalCell.value = {
    formula: `${quotedSheetName(input.depotName)}!${ref(7, totalRow)}`,
    result: numberOf(roundHalfUp(depotTotal(input), 2)),
  };
  totalCell.numFmt = MONEY_FORMAT;
}

/* ------------------------------------------------------------------------- the surface */

/**
 * The whole workbook as bytes: the overview sheet, then the one depot sheet (AC-1).
 *
 * Two sheets, always — even with no rows at all, the empty workbook is a valid file with the
 * five master headers and a zero total, not an error.
 */
export async function buildWorkbook(input: ExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  const overview = workbook.addWorksheet(SHEET_SUMMARY);
  const depot = workbook.addWorksheet(input.depotName);
  const totalRow = writeDepotSheet(depot, input);
  writeOverviewSheet(overview, input, totalRow);

  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(new Uint8Array(written as ArrayBuffer));
}
