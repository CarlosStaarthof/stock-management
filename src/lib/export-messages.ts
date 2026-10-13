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

/** The first worksheet, ahead of the one depot sheet (AC-1). */
export const SHEET_SUMMARY = "Summary";

/**
 * The five master columns of a depot sheet, A–E, in order (AC-2).
 *
 * Taken from `specs/domain-model.md` Part 1's layout and the sample workbook's row 2.
 */
export const MASTER_HEADERS = ["Description", "Supplier", "Type", "Unit", "Price"] as const;

/** The one pair after the master columns for the single stock take (AC-2). */
export const QUANTITY_HEADER = "Qty";
export const VALUE_HEADER = "Value";

/** Column A of the total row. The sample's own word, and the row that closes the block. */
export const TOTAL_LABEL = "TOTAL";

/** The signer block below the depot sheet's total row (AC-9, owner ruling R2). Text only. */
export const SIGNED_BY_LABEL = "Signed by";
export const SIGNED_ON_LABEL = "Signed on";

/* -------------------------------------------------------------------------- the pages */

/** The `/analysis/export` listing page (AC-15). */
export const EXPORT_HEADING = "Export stock takes";

/** Shown when no depot holds an `APPROVED` count (the page's empty state). */
export const EXPORT_EMPTY = "No approved stock takes to export yet.";

/** The link from `/analysis` into the export page (Contract). */
export const EXPORT_LINK_LABEL = "Export";

/** One download control per depot on the listing page (R8). */
export const EXPORT_DOWNLOAD_LABEL = "Download";

/** The listing page's base path. The download handler sits one segment below it (AC-12). */
export const EXPORT_PATH = "/analysis/export";
export const EXPORT_DOWNLOAD_PATH = `${EXPORT_PATH}/download`;

/* -------------------------------------------------------------------------- the errors */

/** A `?location` naming no active depot. */
export const EXPORT_LOCATION_UNKNOWN = "Unknown depot.";

/** A depot with no `APPROVED` count for the requested period (AC-12). */
export const EXPORT_NO_APPROVED_COUNT = "No approved stock take for that depot and period.";

/* -------------------------------------------------------------------------- the file */

/**
 * The download's name (AC-12, ruling R7): `<Depot>_Stocktake_dd-mm-yyyy.xlsx`, where
 * `dd-mm-yyyy` is that depot count's OWN `countDate`.
 *
 * It lives here, beside the sheet and header literals, so the route, the service, the page
 * and the test read the SAME spelling — and so a file name cannot exist in two forms.
 * `countDate` is the `YYYY-MM-DD` the database holds; `depotName` is the `Location.name`.
 */
export const STOCKTAKE_FILENAME_MARKER = "_Stocktake_";

export function exportFileName(depotName: string, countDate: string): string {
  const [year, month, day] = countDate.split("-");

  return `${depotName}${STOCKTAKE_FILENAME_MARKER}${day}-${month}-${year}.xlsx`;
}

/* -------------------------------------------------------------------------- the links */

/** One depot and one stock take: the download the listing page offers (R8, AC-15). */
export function exportHref(
  locationCode: string,
  periodKey: string,
  options: { showAll?: boolean } = {},
): string {
  const params = new URLSearchParams({ location: locationCode, period: periodKey });
  if (options.showAll === true) params.set("all", "1");

  return `${EXPORT_DOWNLOAD_PATH}?${params.toString()}`;
}
