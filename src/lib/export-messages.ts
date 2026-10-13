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
 * `South` is the sample's name for the Clonmel yard; the Dublin row is labelled with the yard's
 * own name by the writer, so only the four words that are not yard names live here.
 */
export const SUMMARY_SOUTH_LABEL = "South";
export const SUMMARY_TOTAL_STOCK_LABEL = "Total Stock";
export const SUMMARY_MOM_LABEL = "MoM Variance";
export const SUMMARY_YOY_LABEL = "YoY Variance";

/** The signer block below each yard sheet's total row (AC-9, owner ruling R2). Text only. */
export const SIGNED_BY_LABEL = "Signed by";
export const SIGNED_ON_LABEL = "Signed on";
