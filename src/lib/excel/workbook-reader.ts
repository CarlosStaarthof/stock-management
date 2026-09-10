import ExcelJS from "exceljs";

import { ValidationError } from "@/server/errors";

/**
 * Reads columns A-E of the two yard sheets of `Samples/Stock @ 01-Sep-2026.xlsx`.
 *
 * This is step one of spec 005's three-step pipeline — read, plan, write — and it is the
 * only step that knows what a spreadsheet is. It returns plain data, so the plan
 * (`src/server/items/workbook-plan.ts`) is a pure function over rows and AC-1 to AC-17 are
 * provable in `npm run test:unit` with no database and no Postgres.
 *
 * It imports `@/server/errors` and nothing else from `src/server/`. That module holds four
 * error classes and no state: the dependency rule this file obeys is the one that matters,
 * "src/lib/excel/ never imports Prisma" (docs/architecture.md), and spec 005 AC-31 states
 * the boundary in exactly those terms — neither `@prisma/client` nor `@/server/db`.
 *
 * NOT READ, on purpose (specs/domain-model.md Part 2 § Not imported, spec 005 AC-25): the
 * historical `Qty` / `Value` column pairs beyond column E, the `Summary` sheet, and the
 * whole `Clonmel Trucks & Yard` sheet. Counting starts fresh from the next count, so this
 * module has no reason to know a quantity ever existed.
 */

/**
 * The two yard sheets, in the order the importer processes them.
 *
 * The trailing space in `"Clonmel "` is the workbook's own and is preserved everywhere:
 * `getWorksheet("Clonmel")` returns nothing (AC-2), so tidying the name away would make
 * the importer read one sheet and silently lose 70 rows.
 */
export const YARD_SHEET_NAMES = ["Dublin", "Clonmel "] as const;

export type YardSheetName = (typeof YARD_SHEET_NAMES)[number];

export type YardSheetRow = {
  sheet: YardSheetName;
  /** The 1-based worksheet row, e.g. 45. Becomes `ItemLocation.sortOrder`. */
  row: number;
  /** True only for the two fuel rows below `'Clonmel '`'s total row. */
  belowTotal: boolean;
  /** Column A, trimmed. Never empty — a blank description fails loudly (AC-7). */
  description: string;
  /**
   * Column B as written, `null` when blank.
   *
   * Deliberately NOT trimmed. `Meon ` and `Visever ` are two of the four spellings the
   * report has to name in `supplierVariants[]` (AC-16); trimming here would erase the
   * difference between a variant and its canonical form and make that criterion
   * unsatisfiable. The trim and the collapse both happen in the plan, which is where the
   * spec's field-by-field table puts them.
   */
  supplier: string | null;
  /** Column C, trimmed. Never empty — `Item.itemTypeId` is NOT NULL. */
  itemType: string;
  /** Column D verbatim, `null` when blank. `20 Kg` and `20kg` stay two labels. */
  unitLabel: string | null;
  /**
   * Column E as a canonical decimal string, never a JavaScript number.
   *
   * `=5.2/0.85` arrives as `"6.11764706"` and `Dublin!E10` as `"33.09"`, not
   * `33.090000000000003`: at eight places the figures match the workbook exactly, which is
   * what Invariant 10 asks of the application that replaces it.
   */
  price: string | null;
};

/** Column A of row 3 is the first item on both sheets; rows 1 and 2 are headings. */
const FIRST_ITEM_ROW = 3;

/** The row that closes the item block. `'Clonmel '!A71` and `Dublin!A86`. */
const TOTAL_MARKER = "TOTAL";

const COLUMN_DESCRIPTION = "A";
const COLUMN_SUPPLIER = "B";
const COLUMN_ITEM_TYPE = "C";
const COLUMN_UNIT = "D";
const COLUMN_PRICE = "E";

/**
 * The `ItemPrice` money column is `Decimal(18, 8)` (spec 004 AC-6), so eight places is
 * where a price is rounded and where the file's binary-float artefacts stop mattering.
 *
 * The column is never NAMED in this module: spec 005 AC-29 keeps that name out of
 * src/lib/ entirely, so the money boundary has one fewer place to leak from.
 */
const PRICE_SCALE = 8;

/** A worksheet name needs quoting in a cell reference when it is not a bare identifier. */
function quoteSheetName(sheetName: string): string {
  return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(sheetName) ? sheetName : `'${sheetName}'`;
}

/**
 * `Dublin!A45` and `'Clonmel '!A75`, the way Excel itself writes them.
 *
 * Every message, note and report entry in this feature uses this one function, so a cell
 * a reviewer reads in the report can be pasted straight into the workbook's name box.
 */
export function formatCellRef(sheetName: string, column: string, row: number): string {
  return `${quoteSheetName(sheetName)}!${column}${row}`;
}

/** Digit-string increment with carry, so rounding never goes through a float. */
function incrementDigits(digits: string): string {
  const out = digits.split("");
  for (let index = out.length - 1; index >= 0; index -= 1) {
    if (out[index] === "9") {
      out[index] = "0";
      continue;
    }
    out[index] = String(Number(out[index]) + 1);
    return out.join("");
  }
  return `1${out.join("")}`;
}

/** `1.23e-7` -> `0.000000123`. `String(n)` uses exponents outside 1e-7 .. 1e21. */
function withoutExponent(text: string): string {
  const parts = /^(-?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(text);
  if (parts === null) return text;

  const [, sign, whole, fraction = "", exponentText] = parts;
  const digits = whole + fraction;
  const pointIndex = whole.length + Number(exponentText);

  if (pointIndex <= 0) return `${sign}0.${"0".repeat(-pointIndex)}${digits}`;
  if (pointIndex >= digits.length) return `${sign}${digits}${"0".repeat(pointIndex - digits.length)}`;
  return `${sign}${digits.slice(0, pointIndex)}.${digits.slice(pointIndex)}`;
}

/**
 * A JavaScript number as a decimal string, rounded half-up at `scale` places.
 *
 * The rounding is done on the digits, not with `toFixed` or a multiply-and-divide: those
 * go back through a binary float and reintroduce exactly the artefact this removes.
 * `String(n)` is the shortest decimal that round-trips the double, which is why
 * `33.090000000000003` shortens to `33.09` and `5.2/0.85` still rounds to `6.11764706`.
 */
export function toDecimalString(value: number, scale: number = PRICE_SCALE): string {
  if (!Number.isFinite(value)) {
    throw new ValidationError("price", `${String(value)} is not a finite number`);
  }

  const plain = withoutExponent(String(value));
  const parts = /^(-?)(\d+)(?:\.(\d*))?$/.exec(plain);
  if (parts === null) {
    throw new ValidationError("price", `${plain} is not a decimal number`);
  }

  const [, sign, whole, fraction = ""] = parts;
  let digits = whole + fraction.slice(0, scale).padEnd(scale, "0");
  const nextDigit = fraction.charAt(scale);
  if (nextDigit !== "" && nextDigit >= "5") {
    digits = incrementDigits(digits);
  }

  const cut = digits.length - scale;
  const roundedWhole = digits.slice(0, cut).replace(/^0+(?=\d)/, "");
  const roundedFraction = digits.slice(cut).replace(/0+$/, "");
  const magnitude = roundedFraction === "" ? roundedWhole : `${roundedWhole}.${roundedFraction}`;

  return /^0(\.0*)?$/.test(magnitude) ? "0" : `${sign}${magnitude}`;
}

/**
 * One cell reduced to a string or a number.
 *
 * The rich-text branch is the reason spec 005 AC-4 exists. Five Clonmel descriptions are
 * stored as several `<r>` runs inside one shared string; an earlier reader took the first
 * run only and produced `tBriteline`, which this project then wrote down as a supplier
 * typo that does not exist (Part 2). Every `<t>` descendant is concatenated, in order.
 */
function unwrapCellValue(
  sheetName: string,
  cellRef: string,
  value: unknown,
  depth: number = 0,
): string | number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";

  if (value instanceof Date) {
    throw new ValidationError("cell", `${cellRef} holds a date; columns A-E hold no dates`);
  }

  if (typeof value !== "object") {
    throw new ValidationError("cell", `${cellRef} holds a value this importer cannot read`);
  }

  // Six levels would already mean a formula whose result is a formula whose result is a
  // formula; something is wrong with the file rather than with the cell.
  if (depth > 4) {
    throw new ValidationError("cell", `${cellRef} nests too deeply to read`);
  }

  const object = value as Record<string, unknown>;

  if (Array.isArray(object.richText)) {
    return (object.richText as { text?: unknown }[])
      .map((run) => (typeof run.text === "string" ? run.text : ""))
      .join("");
  }

  if (typeof object.error === "string") {
    throw new ValidationError("cell", `${cellRef} holds the error value ${object.error}`);
  }

  if ("formula" in object || "sharedFormula" in object) {
    const result = object.result;
    if (result === undefined || result === null) {
      const formula = typeof object.formula === "string" ? `=${object.formula}` : "a formula";
      throw new ValidationError(
        "cell",
        `${cellRef} on sheet ${sheetName} is ${formula} with no cached result; ` +
          "open the workbook and save it so the computed value is stored",
      );
    }
    return unwrapCellValue(sheetName, cellRef, result, depth + 1);
  }

  if ("hyperlink" in object) {
    return unwrapCellValue(sheetName, cellRef, object.text, depth + 1);
  }

  throw new ValidationError("cell", `${cellRef} holds a value this importer cannot read`);
}

/** The cell as text, exactly as written. `null` when the cell is blank or all spaces. */
function cellText(sheet: ExcelJS.Worksheet, sheetName: string, column: string, row: number): string | null {
  const cellRef = formatCellRef(sheetName, column, row);
  const unwrapped = unwrapCellValue(sheetName, cellRef, sheet.getCell(`${column}${row}`).value);

  if (unwrapped === null) return null;
  const text = typeof unwrapped === "number" ? toDecimalString(unwrapped) : unwrapped;
  return text.trim() === "" ? null : text;
}

/** The price cell as a canonical decimal string. `null` when the cell is blank. */
function cellPrice(sheet: ExcelJS.Worksheet, sheetName: string, row: number): string | null {
  const cellRef = formatCellRef(sheetName, COLUMN_PRICE, row);
  const unwrapped = unwrapCellValue(sheetName, cellRef, sheet.getCell(`${COLUMN_PRICE}${row}`).value);

  if (unwrapped === null) return null;
  if (typeof unwrapped === "number") return toDecimalString(unwrapped);

  const text = unwrapped.trim();
  if (text === "") return null;
  if (!/^-?\d+(\.\d+)?$/.test(text)) {
    throw new ValidationError("price", `${cellRef} holds ${JSON.stringify(text)}, which is not a price`);
  }
  return toDecimalString(Number(text));
}

/** The row whose column A trims to `TOTAL`: the row that closes the item block. */
function findTotalRow(sheet: ExcelJS.Worksheet, sheetName: YardSheetName): number {
  for (let row = FIRST_ITEM_ROW; row <= sheet.rowCount; row += 1) {
    if (cellText(sheet, sheetName, COLUMN_DESCRIPTION, row)?.trim() === TOTAL_MARKER) {
      return row;
    }
  }

  throw new ValidationError(
    "sheet",
    `sheet ${quoteSheetName(sheetName)} has no ${TOTAL_MARKER} row in column A, so the ` +
      "item block has no end",
  );
}

function readSheet(sheet: ExcelJS.Worksheet, sheetName: YardSheetName): YardSheetRow[] {
  const totalRow = findTotalRow(sheet, sheetName);
  const rows: YardSheetRow[] = [];

  for (let row = FIRST_ITEM_ROW; row <= sheet.rowCount; row += 1) {
    if (row === totalRow) continue;

    const description = cellText(sheet, sheetName, COLUMN_DESCRIPTION, row);
    const supplier = cellText(sheet, sheetName, COLUMN_SUPPLIER, row);
    const itemType = cellText(sheet, sheetName, COLUMN_ITEM_TYPE, row);
    const unitLabel = cellText(sheet, sheetName, COLUMN_UNIT, row);
    const price = cellPrice(sheet, sheetName, row);

    // `Dublin!A85` is empty across A-E: skipped silently, neither returned nor an error.
    if (description === null && supplier === null && itemType === null && unitLabel === null && price === null) {
      continue;
    }

    const belowTotal = row > totalRow;

    if (description === null) {
      // Below the total row, only a row that HOLDS a description is a row (AC-3). Inside
      // the block, a row with a supplier or a price but no description is a defect in the
      // source and is named rather than dropped (AC-7).
      if (belowTotal) continue;
      throw new ValidationError(
        "description",
        `${quoteSheetName(sheetName)} row ${row} has no description in column ` +
          `${COLUMN_DESCRIPTION}: fix it in the workbook, it cannot be imported`,
      );
    }

    if (itemType === null) {
      throw new ValidationError(
        "itemType",
        `${formatCellRef(sheetName, COLUMN_ITEM_TYPE, row)} has no type, and every item ` +
          "belongs to one",
      );
    }

    rows.push({
      sheet: sheetName,
      row,
      belowTotal,
      description: description.trim(),
      supplier,
      itemType: itemType.trim(),
      unitLabel,
      price,
    });
  }

  return rows;
}

/**
 * Every item row of both yard sheets, `Dublin` first and `'Clonmel '` second.
 *
 * The order is fixed because it decides which sheet wins a cross-sheet disagreement
 * (AC-14), and because a deterministic order is what makes two runs of the plan
 * byte-identical (AC-16).
 */
export async function readYardSheets(buffer: Buffer): Promise<YardSheetRow[]> {
  const workbook = new ExcelJS.Workbook();

  // ExcelJS declares its own `Buffer extends ArrayBuffer`, which Node's Buffer does not
  // satisfy, so the bytes are copied into a plain ArrayBuffer rather than cast through
  // `unknown` (docs/conventions.md: narrow properly, do not reach for an escape hatch).
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);

  try {
    await workbook.xlsx.load(arrayBuffer);
  } catch (error) {
    // A file that is not a workbook is a bad input, not a bug in this importer, and the
    // caller has to be able to tell those apart (docs/architecture.md § Error handling).
    // Unwrapped, `npm run seed:workbook --file wrong.pdf` prints a ZIP library's stack
    // trace, which AC-26 forbids.
    throw new ValidationError(
      "file",
      "the file could not be opened as an .xlsx workbook: " +
        `${error instanceof Error ? error.message : "unknown problem"}`,
    );
  }

  const rows: YardSheetRow[] = [];

  for (const sheetName of YARD_SHEET_NAMES) {
    const sheet = workbook.getWorksheet(sheetName);

    if (sheet === undefined || sheet.name !== sheetName) {
      throw new ValidationError(
        "sheet",
        `the workbook has no sheet named ${JSON.stringify(sheetName)}; it holds ` +
          `${workbook.worksheets.map((each) => JSON.stringify(each.name)).join(", ")}`,
      );
    }

    rows.push(...readSheet(sheet, sheetName));
  }

  return rows;
}
