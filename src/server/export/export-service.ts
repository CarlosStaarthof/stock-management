import { formatMonthLabel } from "@/lib/analysis-messages";
import {
  EXPORT_LOCATION_UNKNOWN,
  EXPORT_NO_APPROVED_COUNT,
  exportFileName,
} from "@/lib/export-messages";
import { buildWorkbook } from "@/lib/excel/workbook-writer";
import type {
  ExportCount,
  ExportLineCell,
  ExportRow,
} from "@/lib/excel/workbook-writer";
import { multiplyDecimal } from "@/lib/money";
import { assertRole } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { getLifecycleFacts } from "@/server/counts/count-lifecycle-service";
import { formatPeriodKey, parseMonthKey } from "@/server/counts/period";
import { db } from "@/server/db";
import { NotFoundError, ValidationError } from "@/server/errors";
import { toCurrentPrice, toPriceRows, todayIso } from "@/server/items/price-selection";
import type { PriceRecord } from "@/server/items/price-selection";
import type { CountStatus } from "@/types/stock-count";

/**
 * The Excel export: the database, mapped field by field onto the writer's plain-data shape.
 *
 * THIS MODULE IS THE ONE PLACE THE EXPORT READS THE DATABASE, and it is the second and last
 * monetary surface in the product. Six rules, each with a criterion rather than a comment.
 *
 *  1. ADMIN ONLY, REFUSED IN THE SERVICE (AC-8). `assertRole` is the first line and the
 *     refusal happens before any read, so removing the route's guard exposes nothing: the
 *     service throws `ForbiddenError` naming `ADMIN` (003 AC-16), exactly as `getAnalysis`
 *     does.
 *  2. ONE DEPOT, ONE STOCK TAKE (AC-12, AC-15). `exportWorkbook` resolves exactly one active
 *     depot by its code and exactly one `APPROVED` count for the period it is asked for, and
 *     hands the writer that depot alone. There is no path here that builds a second depot's
 *     sheet or a second stock take's column.
 *  3. EVERY EURO CROSSES ON A FIELD (AC-10, 006 AC-31). The writer is handed `value` and
 *     `currentPrice`, never a price column, so `src/lib/**` still names the snapshot nowhere.
 *     This module reads `unitPriceSnapshot` for the stock take's frozen value — never
 *     `ItemPrice` for it (Invariant 2): editing a price moves column E and never a past
 *     `Value`.
 *  4. THE SIGNER REACHES THE SHEET THROUGH `getLifecycleFacts` (AC-9). The signature column
 *     stays named by `count-lifecycle-service.ts` alone (009 AC-26); this module names the
 *     signer's NAME and the signed DATE, which is all ruler R2 asks the sheet to carry.
 *  5. A MISSING LINE IS A BLANK, NEVER A ZERO (AC-2, AC-3). Only an item that had a line
 *     gets a cell; the rest of the row is empty. A `null` quantity is *nobody looked* and,
 *     per the writer, is kept apart from a counted zero.
 *  6. THE FILE NAME IS THE DEPOT'S OWN (AC-12, ruling R7). `<Depot>_Stocktake_dd-mm-yyyy.xlsx`
 *     is built from the depot's `Location.name` and the count's own `countDate`.
 *
 * IT WRITES NOTHING. No `create`, `update`, `delete` or `upsert`, on any model, and no
 * migration. The file is returned in memory and is the owner's to save (OD4).
 */

/** The one status a euro may be read from (Invariant 7). The other two are not exported. */
const APPROVED: CountStatus = "APPROVED";

/* -------------------------------------------------------------------- the reading */

/** One depot, as the sheets are ordered: `Location.sortOrder`, then `code`. */
type Depot = { id: string; code: string; name: string };

/** One `APPROVED` count, keyed by the period it closes rather than the day it was walked. */
type ApprovedCount = {
  countId: string;
  locationId: string;
  /** `"2026-09"`, derived from the integers the database holds. */
  periodKey: string;
  /** `"2026-09-30"`, the day the depot was walked. Ruling R7 names the file from it. */
  countDate: string;
};

/** The `ItemLocation` row plus the item fields a depot sheet row needs — field by field. */
type LinkRecord = {
  sortOrder: number;
  item: {
    id: string;
    description: string;
    unitLabel: string | null;
    supplier: { name: string } | null;
    itemType: { name: string };
    prices: PriceRecord[];
  };
};

/** `countDate` is a date-only column; a UTC day keeps the calendar day it was walked. */
function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Every active depot, in sheet order (ruling R5: a sheet is named for its depot). */
async function readDepots(): Promise<Depot[]> {
  const rows = await db.location.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  return rows.map((row) => ({ id: row.id, code: row.code, name: row.name }));
}

/** The one active depot whose `code` is `code`, or `null` for an unknown one (AC-12). */
async function readDepotByCode(code: string): Promise<Depot | null> {
  const row = await db.location.findFirst({
    where: { code, active: true },
    select: { id: true, code: true, name: true },
  });

  return row === null ? null : { id: row.id, code: row.code, name: row.name };
}

/**
 * The one `APPROVED` count at this depot closing this period, or `null`.
 *
 * A `DRAFT` or `SUBMITTED` count is not an answer: only an `APPROVED` take carries a euro
 * (OD3), so anything else is treated as absent and the route refuses (AC-12).
 */
async function readApprovedCount(
  locationId: string,
  periodKey: string,
): Promise<ApprovedCount | null> {
  const monthKey = parseMonthKey(periodKey);
  const periodYear = Number(monthKey.slice(0, 4));
  const periodMonth = Number(monthKey.slice(5, 7));

  const row = await db.stockCount.findUnique({
    where: {
      locationId_periodYear_periodMonth: { locationId, periodYear, periodMonth },
    },
    select: { id: true, locationId: true, status: true, countDate: true },
  });

  if (row === null || row.status !== APPROVED) return null;

  return {
    countId: row.id,
    locationId: row.locationId,
    periodKey: monthKey,
    countDate: isoDay(row.countDate),
  };
}

/**
 * Every `APPROVED` count at an active depot, oldest first, for the listing page (AC-15).
 *
 * "At an active depot" for the reason `listApprovedPeriods` gives: a stock take whose only
 * approved count belongs to a deactivated depot would be a download of nothing.
 */
async function readApprovedCounts(): Promise<ApprovedCount[]> {
  const rows = await db.stockCount.findMany({
    where: { status: APPROVED, location: { active: true } },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }, { locationId: "asc" }],
    select: { id: true, locationId: true, periodYear: true, periodMonth: true, countDate: true },
  });

  return rows.map((row) => ({
    countId: row.id,
    locationId: row.locationId,
    periodKey: formatPeriodKey({ periodYear: row.periodYear, periodMonth: row.periodMonth }),
    countDate: isoDay(row.countDate),
  }));
}

/**
 * One stock take's lines, valued on the snapshot and nothing else, keyed by item.
 *
 * `value` is the EXACT `quantity x snapshot` (or `"0"` when the line has no snapshot), the
 * same derivation `analysis-service.ts` uses, so the workbook and `/analysis` cannot disagree.
 */
async function readCountCells(countId: string): Promise<Map<string, ExportLineCell>> {
  const rows = await db.stockCountLine.findMany({
    where: { stockCountId: countId },
    select: { itemId: true, quantity: true, unitPriceSnapshot: true },
  });

  const cells = new Map<string, ExportLineCell>();
  for (const row of rows) {
    // Decimal STRINGS, never JS numbers: one Cashel price does not terminate in decimal, and
    // a float round trip is exactly what loses the tail (docs/architecture.md).
    const quantity = row.quantity === null ? null : row.quantity.toString();
    const snapshot = row.unitPriceSnapshot === null ? null : row.unitPriceSnapshot.toString();

    cells.set(row.itemId, {
      quantity,
      value: multiplyDecimal(quantity ?? "0", snapshot ?? "0"),
    });
  }

  return cells;
}

/** Every assigned, active item of one depot, in the order staff walk it. */
async function readDepotLinks(locationId: string): Promise<LinkRecord[]> {
  const links = (await db.itemLocation.findMany({
    where: { locationId, active: true, item: { active: true } },
    include: {
      item: {
        include: {
          supplier: { select: { name: true } },
          itemType: { select: { name: true } },
          // Whole `ItemPrice` rows, handed to `price-selection.ts`, which is one of the
          // modules allowed to name the price column. Column E is the CURRENT price (R4).
          prices: true,
        },
      },
    },
  })) as LinkRecord[];

  return [...links].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.item.description.localeCompare(right.item.description),
  );
}

/* ------------------------------------------------------------------- the mapping */

/**
 * One depot sheet row. FIELD BY FIELD, never a spread: a database row spread into this shape
 * would carry `itemId`, `sortOrder` and whatever a later migration adds, and the compiler
 * would not say a word (#10 proved exactly that).
 */
function toExportRow(
  link: LinkRecord,
  cells: ReadonlyMap<string, ExportLineCell>,
  asOf: string,
): ExportRow {
  const current = toCurrentPrice(toPriceRows(link.item.prices), asOf);

  return {
    description: link.item.description,
    // The writer turns `null` into `NO_SUPPLIER`; this layer does not name the message.
    supplier: link.item.supplier?.name ?? null,
    typeName: link.item.itemType.name,
    unitLabel: link.item.unitLabel,
    currentPrice: current === null ? null : current.unitPrice,
    cell: cells.get(link.item.id) ?? null,
  };
}

/**
 * The signer block, from `getLifecycleFacts` (AC-9).
 *
 * The signer's name is the `signedBy` `User.name` and the date is `signedAt` as `YYYY-MM-DD`,
 * both obtained without this module naming the signature column — which is why 009 AC-26's
 * one-module rule still holds. Ruling R2: the name and the date travel; the drawn stroke does
 * not.
 */
function toExportCount(facts: {
  signedByName: string | null;
  signedAt: string | null;
}): ExportCount {
  return {
    signedByName: facts.signedByName,
    signedOn: facts.signedAt === null ? null : facts.signedAt.slice(0, 10),
  };
}

/* ------------------------------------------------------------------- the surface */

/**
 * One depot's workbook for one stock take, built from the database and returned in memory.
 * ADMIN ONLY.
 *
 * `showAll` is the route's `?all=1` (AC-12): `false` exports held-only rows, `true` exports
 * every assigned item (AC-7). `locationCode` and `periodKey` select the one depot and the one
 * `APPROVED` count; a missing depot or an unapproved period is a typed refusal, never a file
 * (AC-12). The file name is `<Depot>_Stocktake_dd-mm-yyyy.xlsx` (AC-12, ruling R7).
 */
export async function exportWorkbook(
  actor: SessionUser | null,
  options: { showAll: boolean; locationCode: string; periodKey: string },
): Promise<{ fileName: string; bytes: Buffer }> {
  const user = assertRole(actor, "ADMIN");

  const asOf = todayIso();
  const depot = await readDepotByCode(options.locationCode);
  if (depot === null) throw new ValidationError("location", EXPORT_LOCATION_UNKNOWN);

  const count = await readApprovedCount(depot.id, options.periodKey);
  if (count === null) throw new NotFoundError(EXPORT_NO_APPROVED_COUNT);

  const [cells, facts] = await Promise.all([
    readCountCells(count.countId),
    getLifecycleFacts(user, count.countId),
  ]);

  const links = await readDepotLinks(depot.id);
  const rows = links.map((link) => toExportRow(link, cells, asOf));

  const bytes = await buildWorkbook({
    showAll: options.showAll,
    depotName: depot.name,
    periodLabel: formatMonthLabel(count.periodKey),
    rows,
    count: toExportCount(facts),
  });

  return { fileName: exportFileName(depot.name, count.countDate), bytes };
}

/** One depot's download on the listing page (R8, AC-15). */
export type ExportDepotDownload = {
  code: string;
  name: string;
  /** The depot count's own `countDate`, `YYYY-MM-DD`. */
  countDate: string;
};

/** One approved stock take: a period and the depots that approved a count in it (R8, AC-15). */
export type ExportStockTake = {
  periodKey: string;
  periodLabel: string;
  depots: ExportDepotDownload[];
};

/**
 * The approved stock takes the listing page shows, newest first (AC-15).
 *
 * Each stock take carries one entry per active depot that holds an `APPROVED` count for it,
 * so the page can offer one download per depot (R8) and nothing is hard-coded. ADMIN only.
 */
export async function listExportStockTakes(
  actor: SessionUser | null,
): Promise<ExportStockTake[]> {
  assertRole(actor, "ADMIN");

  const [depots, counts] = await Promise.all([readDepots(), readApprovedCounts()]);
  const byId = new Map(depots.map((depot) => [depot.id, depot]));

  const byPeriod = new Map<string, ExportStockTake>();
  for (const count of counts) {
    const depot = byId.get(count.locationId);
    if (depot === undefined) continue;

    let stockTake = byPeriod.get(count.periodKey);
    if (stockTake === undefined) {
      stockTake = {
        periodKey: count.periodKey,
        periodLabel: formatMonthLabel(count.periodKey),
        depots: [],
      };
      byPeriod.set(count.periodKey, stockTake);
    }

    stockTake.depots.push({ code: depot.code, name: depot.name, countDate: count.countDate });
  }

  return [...byPeriod.values()].sort((left, right) =>
    left.periodKey < right.periodKey ? 1 : left.periodKey > right.periodKey ? -1 : 0,
  );
}
