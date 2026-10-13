import ExcelJS from "exceljs";

import {
  MASTER_HEADERS,
  QUANTITY_HEADER,
  SHEET_SUMMARY,
  SIGNED_BY_LABEL,
  SIGNED_ON_LABEL,
  SUMMARY_MOM_LABEL,
  SUMMARY_SOUTH_LABEL,
  SUMMARY_TOTAL_STOCK_LABEL,
  SUMMARY_YOY_LABEL,
  TOTAL_LABEL,
  VALUE_HEADER,
} from "@/lib/export-messages";
import { isHeld } from "@/lib/held";
import {
  NO_SUPPLIER,
  NOT_COMPARABLE_PERIOD_INCOMPLETE,
} from "@/lib/analysis-messages";
import { formatPriceExact, roundHalfUp, subtractDecimals, sumDecimals } from "@/lib/money";

/**
 * Builds the workbook feature #12 exports, sheet by sheet, from plain data and nothing else.
 *
 * PURE, AND THAT IS ENFORCED. It imports `exceljs` and `src/lib/` ONLY — never `@/server/`, never
 * `@prisma/client` — so AC-1's scan holds and the whole of AC-1 to AC-6, AC-9 and AC-11 is
 * provable in `npm run test:unit` with no Postgres and no browser. Every euro arrives on a field
 * this module's own `ExportInput` shape declares (`value`), never by naming the price-snapshot
 * column, so 009 AC-26 keeps that column named by exactly the service modules that already do.
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
 *  1. EVERY VALUE IS DERIVED, AND THE TOTAL IS A FORMULA (AC-3). The caller hands each line's
 *     exact `quantity x snapshot` value as a decimal string; the writer stores the number and the
 *     yard TOTAL is a `SUM(...)` formula over the value column, whose cached result is the sum of
 *     the EXACT line values rounded once — never the sum of the rounded cells. The value cell
 *     itself is the exact number, displayed at two places by a number format, so a spreadsheet
 *     that recalculates the formula still gets the exact sum. A fixture whose lines round to a
 *     different total than the exact sum distinguishes the two rules (AC-3).
 *  2. NO ERROR CELL IS POSSIBLE (AC-4). Nothing here writes `#REF!`, `#DIV/0!` or any other error
 *     value; a period an item was not part of is a blank, and a yard that was not counted has no
 *     total cell at all.
 *  3. A GAP IS NEVER A ZERO, AND A PREVIOUS MONTH IS NEVER "THE LAST ONE" (AC-5, AC-6). `Total
 *     Stock` exists only for a complete period; `MoM`/`YoY` refuse with a word rather than
 *     reaching across a missing month. The caller supplies the two comparand keys per period,
 *     derived by `period.ts`, so this module never re-derives a calendar.
 *  4. HELD ONLY BY DEFAULT (AC-7). With `showAll: false`, a row appears only when it holds stock
 *     in at least one exported period, by `isHeld` — the same `quantity > 0` rule every other
 *     surface uses; a counted zero and a blank are two different facts and neither is held.
 */

/** One exported period, ascending. The comparand keys come from the caller (AC-6). */
export type ExportPeriod = {
  /** `"2026-09"`. */
  periodKey: string;
  /** `"September 2026"` — `formatMonthLabel`'s output, as the workbook shows it. */
  label: string;
  /** `previousMonthKey(periodKey)`, e.g. `"2026-08"`. */
  monthOnMonthKey: string;
  /** The same month a year earlier, e.g. `"2025-09"`. */
  yearOnYearKey: string;
};

/**
 * One item in one period: what was counted and what it is worth, both as strings.
 *
 * `quantity` is `null` when there was no line at all — *nobody looked* — and the string `"0"`
 * when a person counted none; the two are different facts (Invariant 5) and the writer keeps
 * them apart. `value` is the EXACT `quantity x snapshot` (or `"0"` when the line has no snapshot),
 * already computed by the service so this module never names the snapshot column.
 */
export type ExportLineCell = {
  quantity: string | null;
  value: string;
};

/** One item row of a yard sheet. Field by field; the shape is the boundary (AC-2, AC-4). */
export type ExportRow = {
  description: string;
  /** `null` becomes `NO_SUPPLIER` on the sheet, exactly as the item master shows it (AC-2). */
  supplier: string | null;
  typeName: string;
  unitLabel: string | null;
  /** Column E: the item's CURRENT price as a decimal string, or `null` for no price (ruling R4). */
  currentPrice: string | null;
  /** One entry per period the item had a line in. A missing key is a blank cell, not a zero. */
  cells: Record<string, ExportLineCell>;
};

/** One `APPROVED` count at a yard: the only kind that carries a euro and a signature (AC-9). */
export type ExportCount = {
  periodKey: string;
  /** `User.name` of `StockCount.signedById`, via `getLifecycleFacts`. */
  signedByName: string | null;
  /** `signedAt` as `YYYY-MM-DD`, or `null`. Ruling R2: the date travels, the stroke does not. */
  signedOn: string | null;
};

/**
 * One yard sheet. `name` is the worksheet name; AC-1 and ruling R5 make it the active yard's own
 * name, so it is `Dublin` and `Cashel` for the data this product holds, and never `Cashel `.
 */
export type ExportYard = {
  name: string;
  /** `"DUBLIN"`. Carried for the reader's benefit; the sheet itself is keyed by `name`. */
  code: string;
  rows: ExportRow[];
  /** One per `APPROVED` count, oldest first. Empty for a yard that has never been approved. */
  counts: ExportCount[];
};

/** Everything `buildWorkbook` needs. Plain data; no database row and no service call. */
export type ExportInput = {
  /** `false` is held-only (AC-7); the route's `?all=1` sets `true`. */
  showAll: boolean;
  /** Ascending, as the yard sheets order them; the overview sheet reverses them (AC-5). */
  periods: ExportPeriod[];
  /** The active yards, in sheet order — `Dublin` then `Cashel` (AC-1). */
  yards: ExportYard[];
};

/* -------------------------------------------------------------------------- helpers */

/** A quantity cell lines up on the point without showing fourteen decimal places of noise. */
const QUANTITY_FORMAT = "0.####";
/** A euro cell is displayed to the cent, by a format rather than by lossy rounding (AC-3). */
const MONEY_FORMAT = "#,##0.00";

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

/** The value a cell holds, exact. A decimal string becomes a number, which xlsx stores as a double. */
function numberOf(decimal: string): number {
  return Number(decimal);
}

/** One yard's rows, held-only unless `showAll` (AC-7). Input order preserved. */
function visibleRows(yard: ExportYard, periods: readonly ExportPeriod[], showAll: boolean): ExportRow[] {
  if (showAll) return [...yard.rows];

  return yard.rows.filter((row) =>
    periods.some((period) => {
      const cell = row.cells[period.periodKey];
      return cell !== undefined && isHeld(cell.quantity);
    }),
  );
}

/** True when this yard holds an `APPROVED` count closing this period. */
function hasCount(yard: ExportYard, periodKey: string): boolean {
  return yard.counts.some((count) => count.periodKey === periodKey);
}

/**
 * One yard's exact total for one period: the sum of the line values it contributed.
 *
 * A period the yard was not counted in is `null`, not `"0"` — the distinction Invariant 7 keeps
 * and every figure on the overview sheet turns on. The total is mode-independent: a hidden
 * counted-zero line contributes `"0"`, so held-only and show-all agree to the cent.
 */
function yardTotal(yard: ExportYard, periodKey: string): string | null {
  if (!hasCount(yard, periodKey)) return null;

  const values: string[] = [];
  for (const row of yard.rows) {
    const cell = row.cells[periodKey];
    if (cell !== undefined) values.push(cell.value);
  }

  return sumDecimals(values);
}

/**
 * One period is complete when EVERY active yard was counted (Invariant 7, AC-5).
 *
 * "Every active yard" is the `yards` array this function walks — the same set the sheets carry —
 * so a total is absent the moment one yard's count is missing, which is the fact the sample's
 * overview cell got wrong by adding two counts seven months apart.
 */
function isComplete(yards: readonly ExportYard[], periodKey: string): boolean {
  return yards.length > 0 && yards.every((yard) => hasCount(yard, periodKey));
}

/* --------------------------------------------------------------------- the worksheets */

/**
 * One yard sheet, in the sample's shape (AC-2) with the two derived figures (AC-3).
 *
 * Row 1 carries the period label above each `Qty` column, row 2 the five master headers and the
 * repeating `Qty | Value` pair, data from row 3, the total row after it, and the signer block
 * below that. A period the yard was not counted in has no total cell at all, rather than a `SUM`
 * that would read `0`.
 */
function writeYardSheet(
  sheet: ExcelJS.Worksheet,
  yard: ExportYard,
  periods: readonly ExportPeriod[],
  showAll: boolean,
): void {
  for (let index = 0; index < periods.length; index += 1) {
    const qtyColumn = 6 + index * 2;
    sheet.getCell(ref(qtyColumn, 1)).value = periods[index].label;
  }

  const headers: string[] = [...MASTER_HEADERS];
  for (let index = 0; index < periods.length; index += 1) {
    headers.push(QUANTITY_HEADER, VALUE_HEADER);
  }
  headers.forEach((header, index) => {
    sheet.getCell(ref(index + 1, 2)).value = header;
  });

  const rows = visibleRows(yard, periods, showAll);

  rows.forEach((row, rowIndex) => {
    const excelRow = 3 + rowIndex;

    sheet.getCell(ref(1, excelRow)).value = row.description;
    sheet.getCell(ref(2, excelRow)).value = row.supplier ?? NO_SUPPLIER;
    sheet.getCell(ref(3, excelRow)).value = row.typeName;
    sheet.getCell(ref(4, excelRow)).value = row.unitLabel ?? "";
    sheet.getCell(ref(5, excelRow)).value =
      row.currentPrice === null ? "" : formatPriceExact(row.currentPrice);

    periods.forEach((period, periodIndex) => {
      const cell = row.cells[period.periodKey];
      if (cell === undefined) return;

      const qtyColumn = 6 + periodIndex * 2;
      const valueColumn = qtyColumn + 1;

      if (cell.quantity !== null) {
        const quantityCell = sheet.getCell(ref(qtyColumn, excelRow));
        quantityCell.value = numberOf(cell.quantity);
        quantityCell.numFmt = QUANTITY_FORMAT;
      }

      const valueCell = sheet.getCell(ref(valueColumn, excelRow));
      valueCell.value = numberOf(cell.value);
      valueCell.numFmt = MONEY_FORMAT;
    });
  });

  // One row below the block, or row 4 when there are no data rows, so the range is never empty.
  const lastDataRow = Math.max(2 + rows.length, 3);
  const totalRow = lastDataRow + 1;
  sheet.getCell(ref(1, totalRow)).value = TOTAL_LABEL;

  periods.forEach((period, periodIndex) => {
    const total = yardTotal(yard, period.periodKey);
    if (total === null) return;

    const valueColumn = 7 + periodIndex * 2;
    const letter = columnLetter(valueColumn);
    const totalCell = sheet.getCell(ref(valueColumn, totalRow));
    totalCell.value = {
      formula: `SUM(${letter}3:${letter}${lastDataRow})`,
      result: numberOf(roundHalfUp(total, 2)),
    };
    totalCell.numFmt = MONEY_FORMAT;
  });

  let signerRow = totalRow + 2;
  for (const count of yard.counts) {
    sheet.getCell(ref(1, signerRow)).value = SIGNED_BY_LABEL;
    sheet.getCell(ref(2, signerRow)).value = count.signedByName ?? "";
    sheet.getCell(ref(1, signerRow + 1)).value = SIGNED_ON_LABEL;
    sheet.getCell(ref(2, signerRow + 1)).value = count.signedOn ?? "";
    signerRow += 3;
  }
}

/**
 * The overview sheet: one column per period, newest in `B` (AC-5), every figure derived from the
 * same yard totals the sheets show (AC-6).
 *
 * `South` is the second yard (Cashel in this product) and row 4 is the first (Dublin), matching
 * the sample's own labels. `Total Stock` and the two variances are blank or a word, never a `0`,
 * when the period they would describe is not a complete period.
 */
function writeOverviewSheet(
  sheet: ExcelJS.Worksheet,
  periods: readonly ExportPeriod[],
  yards: readonly ExportYard[],
): void {
  const newestFirst = [...periods].sort((left, right) =>
    left.periodKey < right.periodKey ? 1 : left.periodKey > right.periodKey ? -1 : 0,
  );

  newestFirst.forEach((period, index) => {
    sheet.getCell(ref(2 + index, 1)).value = period.label;
  });

  const south = yards[1];
  const north = yards[0];
  sheet.getCell(ref(1, 3)).value = SUMMARY_SOUTH_LABEL;
  sheet.getCell(ref(1, 4)).value = north.name;
  sheet.getCell(ref(1, 5)).value = SUMMARY_TOTAL_STOCK_LABEL;
  sheet.getCell(ref(1, 7)).value = SUMMARY_MOM_LABEL;
  sheet.getCell(ref(1, 9)).value = SUMMARY_YOY_LABEL;

  const comparisonCell = (
    rowIndex: number,
    column: number,
    period: ExportPeriod,
    comparandKey: string,
  ): void => {
    const current = isComplete(yards, period.periodKey);
    const comparand = newestFirst.find((each) => each.periodKey === comparandKey);

    if (!current || comparand === undefined || !isComplete(yards, comparand.periodKey)) {
      sheet.getCell(ref(column, rowIndex)).value = NOT_COMPARABLE_PERIOD_INCOMPLETE;
      return;
    }

    const currentTotal = sumDecimals(
      yards.map((yard) => yardTotal(yard, period.periodKey) ?? "0"),
    );
    const comparandTotal = sumDecimals(
      yards.map((yard) => yardTotal(yard, comparand.periodKey) ?? "0"),
    );

    const cell = sheet.getCell(ref(column, rowIndex));
    cell.value = numberOf(roundHalfUp(subtractDecimals(currentTotal, comparandTotal), 2));
    cell.numFmt = MONEY_FORMAT;
  };

  newestFirst.forEach((period, index) => {
    const column = 2 + index;

    const southTotal = yardTotal(south, period.periodKey);
    if (southTotal !== null) {
      const cell = sheet.getCell(ref(column, 3));
      cell.value = numberOf(roundHalfUp(southTotal, 2));
      cell.numFmt = MONEY_FORMAT;
    }

    const northTotal = yardTotal(north, period.periodKey);
    if (northTotal !== null) {
      const cell = sheet.getCell(ref(column, 4));
      cell.value = numberOf(roundHalfUp(northTotal, 2));
      cell.numFmt = MONEY_FORMAT;
    }

    if (northTotal !== null && southTotal !== null) {
      const cell = sheet.getCell(ref(column, 5));
      cell.value = numberOf(roundHalfUp(sumDecimals([southTotal, northTotal]), 2));
      cell.numFmt = MONEY_FORMAT;
    }

    comparisonCell(7, column, period, period.monthOnMonthKey);
    comparisonCell(9, column, period, period.yearOnYearKey);
  });
}

/* ------------------------------------------------------------------------- the surface */

/**
 * The whole workbook as bytes: the overview sheet, then one sheet per yard in the order given
 * (AC-1). Three sheets, always — even with no period and no yard data, the empty workbook is a
 * valid file with the five master headers, not an error (AC-5, AC-12's `empty` filename).
 */
export async function buildWorkbook(input: ExportInput): Promise<Buffer> {
  if (input.yards.length !== 2) {
    throw new Error(`the export expects two yard sheets, got ${input.yards.length}`);
  }

  const workbook = new ExcelJS.Workbook();

  const overview = workbook.addWorksheet(SHEET_SUMMARY);
  writeOverviewSheet(overview, input.periods, input.yards);

  for (const yard of input.yards) {
    const sheet = workbook.addWorksheet(yard.name);
    writeYardSheet(sheet, yard, input.periods, input.showAll);
  }

  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(new Uint8Array(written as ArrayBuffer));
}
