/**
 * Every literal spec 012 quotes, in one module.
 *
 * The #10/#11 pattern (`src/lib/stock-takes-messages.ts`, `src/lib/analysis-messages.ts`): the
 * writer and the test read the SAME literal, so a header cannot be spelled one way in the
 * workbook and another way in the criterion that checks it. A message that exists twice is a
 * message that will one day exist in two spellings.
 *
 * It imports nothing from `src/server/`, so spec 012 AC-1's scan of the writer — which imports
 * this module — stays green, and it names no money column.
 */

/** The first worksheet, ahead of the yard sheets (AC-1). */
export const SHEET_SUMMARY = "Summary";

/**
 * The five master columns of a yard sheet, A–E, in order (AC-2).
 *
 * Taken from `specs/domain-model.md` Part 1's layout and the sample workbook's row 2.
 */
export const MASTER_HEADERS = ["Description", "Supplier", "Type", "Unit", "Price"] as const;

/** The repeating pair after the master columns (AC-2). */
export const QUANTITY_HEADER = "Qty";
export const VALUE_HEADER = "Value";

/** Column A of the total row. The sample's own word, and the row that closes the block. */
export const TOTAL_LABEL = "TOTAL";

/**
 * The `Summary` row labels, each in column A of its row (AC-5).
 *
 * `South` is the sample's name for the Cashel yard; the Dublin row is labelled with the yard's
 * own name by the writer, so only the four words that are not yard names live here.
 */
export const SUMMARY_SOUTH_LABEL = "South";
export const SUMMARY_TOTAL_STOCK_LABEL = "Total Stock";
export const SUMMARY_MOM_LABEL = "MoM Variance";
export const SUMMARY_YOY_LABEL = "YoY Variance";

/** The signer block below each yard sheet's total row (AC-9, owner ruling R2). Text only. */
export const SIGNED_BY_LABEL = "Signed by";
export const SIGNED_ON_LABEL = "Signed on";

/* -------------------------------------------------------------------------- the file */

/**
 * The download's name (AC-12): `macroads-stock-<first>-<last>.xlsx` for the exported period
 * range, and `macroads-stock-empty.xlsx` when there is no period to name.
 *
 * It lives here, beside the sheet and header literals, so the route, the service and the test
 * read the SAME spelling — and so a file name cannot exist in two forms. `periodKeys` are the
 * exported periods, ascending, which is the order the yard sheets carry them.
 */
export const EXPORT_FILENAME_PREFIX = "macroads-stock";

export function exportFileName(periodKeys: readonly string[]): string {
  if (periodKeys.length === 0) return `${EXPORT_FILENAME_PREFIX}-empty.xlsx`;

  return `${EXPORT_FILENAME_PREFIX}-${periodKeys[0]}-${periodKeys[periodKeys.length - 1]}.xlsx`;
}
