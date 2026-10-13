import { formatMonthLabel } from "@/lib/analysis-messages";
import { buildWorkbook } from "@/lib/excel/workbook-writer";
import type {
  ExportCount,
  ExportInput,
  ExportLineCell,
  ExportRow,
  ExportYard,
} from "@/lib/excel/workbook-writer";
import { exportFileName } from "@/lib/export-messages";
import { multiplyDecimal } from "@/lib/money";
import { assertRole } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { getLifecycleFacts } from "@/server/counts/count-lifecycle-service";
import { formatPeriodKey } from "@/server/counts/period";
import { db } from "@/server/db";
import { toCurrentPrice, toPriceRows, todayIso } from "@/server/items/price-selection";
import type { PriceRecord } from "@/server/items/price-selection";
import {
  comparePeriodKeys,
  previousPeriodKey,
  priorYearPeriodKey,
} from "@/server/reporting/period-series";
import type { CountStatus } from "@/types/stock-count";

/**
 * The Excel export: the database, mapped field by field onto the writer's plain-data shape.
 *
 * THIS MODULE IS THE ONE PLACE THE EXPORT READS THE DATABASE, and it is the second and last
 * monetary surface in the product. Five rules, each with a criterion rather than a comment.
 *
 *  1. ADMIN ONLY, REFUSED IN THE SERVICE (AC-8). `assertRole` is the first line and the
 *     refusal happens before any read, so removing the route's guard exposes nothing: the
 *     service throws `ForbiddenError` naming `ADMIN` (003 AC-16), exactly as `getAnalysis`
 *     does.
 *  2. EVERY EURO CROSSES ON A FIELD (AC-10, 006 AC-31). The writer is handed `value` and
 *     `currentPrice`, never a price column, so `src/lib/**` still names the snapshot nowhere.
 *     This module reads `unitPriceSnapshot` for a period's frozen value — never `ItemPrice`
 *     for it (Invariant 2): editing a price moves column E and never a past `Value`.
 *  3. THE SIGNER REACHES THE SHEET THROUGH `getLifecycleFacts` (AC-9). The signature column
 *     stays named by `count-lifecycle-service.ts` alone (009 AC-26); this module names the
 *     signer's NAME and the signed DATE, which is all ruler R2 asks the sheet to carry.
 *  4. A MISSING LINE IS A BLANK, NEVER A ZERO (AC-2, AC-3). Only an item that had a line in a
 *     period gets a cell; the rest of the row is empty. A `null` quantity is *nobody looked*
 *     and, per the writer, is kept apart from a counted zero.
 *  5. THE PERIOD SET IS EVERY APPROVED PERIOD (ruling R3). A period enters when an active yard
 *     holds an `APPROVED` count for it, ascending on the sheets; the writer reverses it for
 *     the overview. No year filter, and no route parameter for one.
 *
 * IT WRITES NOTHING. No `create`, `update`, `delete` or `upsert`, on any model, and no
 * migration. The file is returned in memory and is the owner's to save (OD4).
 */

/** The one status a euro may be read from (Invariant 7). The other two are not exported. */
const APPROVED: CountStatus = "APPROVED";

/* -------------------------------------------------------------------- the reading */

/** One yard, as the sheets are ordered: `Location.sortOrder`, then `code`. */
type Yard = { id: string; code: string; name: string };

/** One `APPROVED` count, keyed by the period it closes rather than the day it was walked. */
type ApprovedCount = {
  countId: string;
  locationId: string;
  /** `"2026-09"`, derived from the integers the database holds. */
  periodKey: string;
};

/** One approved line, valued, indexed by the yard and period it belongs to. */
type ValuedLine = {
  locationId: string;
  periodKey: string;
  itemId: string;
  cell: ExportLineCell;
};

/** The `ItemLocation` row plus the item fields a yard sheet row needs — field by field. */
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

async function readYards(): Promise<Yard[]> {
  // Invariant 7 is "every ACTIVE Location"; the sheets are the active yards (ruling R5).
  const rows = await db.location.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  return rows.map((row) => ({ id: row.id, code: row.code, name: row.name }));
}

/**
 * Every `APPROVED` count at an active yard, oldest first.
 *
 * "At an active yard" for the reason `listApprovedPeriods` gives: a period whose only approved
 * count belongs to a deactivated yard would be a column of nothing on every sheet.
 */
async function readApprovedCounts(): Promise<ApprovedCount[]> {
  const rows = await db.stockCount.findMany({
    where: { status: APPROVED, location: { active: true } },
    orderBy: [{ periodYear: "asc" }, { periodMonth: "asc" }, { locationId: "asc" }],
    select: { id: true, locationId: true, periodYear: true, periodMonth: true },
  });

  return rows.map((row) => ({
    countId: row.id,
    locationId: row.locationId,
    periodKey: formatPeriodKey({ periodYear: row.periodYear, periodMonth: row.periodMonth }),
  }));
}

/**
 * The lines of exactly these approved counts, valued on the snapshot and nothing else.
 *
 * `value` is the EXACT `quantity x snapshot` (or `"0"` when the line has no snapshot), the
 * same derivation `analysis-service.ts` uses, so the workbook and `/analysis` cannot disagree.
 */
async function readValuedLines(counts: readonly ApprovedCount[]): Promise<ValuedLine[]> {
  if (counts.length === 0) return [];

  const byId = new Map(counts.map((count) => [count.countId, count]));

  const rows = await db.stockCountLine.findMany({
    where: { stockCountId: { in: counts.map((count) => count.countId) } },
    select: { stockCountId: true, itemId: true, quantity: true, unitPriceSnapshot: true },
  });

  return rows.flatMap((row) => {
    const count = byId.get(row.stockCountId);
    if (count === undefined) return [];

    // Decimal STRINGS, never JS numbers: one Cashel price does not terminate in decimal, and
    // a float round trip is exactly what loses the tail (docs/architecture.md).
    const quantity = row.quantity === null ? null : row.quantity.toString();
    const snapshot = row.unitPriceSnapshot === null ? null : row.unitPriceSnapshot.toString();

    return [
      {
        locationId: count.locationId,
        periodKey: count.periodKey,
        itemId: row.itemId,
        cell: { quantity, value: multiplyDecimal(quantity ?? "0", snapshot ?? "0") },
      },
    ];
  });
}

/** Every assigned, active item of one yard, in the order staff walk it (`listSheet`). */
async function readYardLinks(locationId: string): Promise<LinkRecord[]> {
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

/** The exported periods, ascending — the same order the yard sheets carry them. */
function approvedPeriodKeysIn(counts: readonly ApprovedCount[]): string[] {
  const keys = new Set(counts.map((count) => count.periodKey));
  return [...keys].sort(comparePeriodKeys);
}

/** One period's exported facts: its label and the two comparands, all from `period.ts`. */
function exportPeriodOf(periodKey: string): ExportInput["periods"][number] {
  return {
    periodKey,
    label: formatMonthLabel(periodKey),
    monthOnMonthKey: previousPeriodKey(periodKey),
    yearOnYearKey: priorYearPeriodKey(periodKey),
  };
}

/** One cell key: a period and an item, scoped to the yard whose map it sits in. */
function cellKey(periodKey: string, itemId: string): string {
  return `${periodKey}|${itemId}`;
}

/** One yard's cells, so a row's period is a lookup rather than a scan of every line. */
function cellsForYard(
  lines: readonly ValuedLine[],
  locationId: string,
): Map<string, ExportLineCell> {
  const byKey = new Map<string, ExportLineCell>();

  for (const line of lines) {
    if (line.locationId !== locationId) continue;
    byKey.set(cellKey(line.periodKey, line.itemId), line.cell);
  }

  return byKey;
}

/**
 * One yard sheet row. FIELD BY FIELD, never a spread: a database row spread into this shape
 * would carry `itemId`, `sortOrder` and whatever a later migration adds, and the compiler
 * would not say a word (#10 proved exactly that).
 */
function toExportRow(
  link: LinkRecord,
  periods: readonly ExportInput["periods"][number][],
  cells: ReadonlyMap<string, ExportLineCell>,
  asOf: string,
): ExportRow {
  const current = toCurrentPrice(toPriceRows(link.item.prices), asOf);

  const rowCells: Record<string, ExportLineCell> = {};
  for (const period of periods) {
    const cell = cells.get(cellKey(period.periodKey, link.item.id));
    if (cell !== undefined) rowCells[period.periodKey] = cell;
  }

  return {
    description: link.item.description,
    // The writer turns `null` into `NO_SUPPLIER`; this layer does not name the message.
    supplier: link.item.supplier?.name ?? null,
    typeName: link.item.itemType.name,
    unitLabel: link.item.unitLabel,
    currentPrice: current === null ? null : current.unitPrice,
    cells: rowCells,
  };
}

/**
 * A yard's signer block, one entry per `APPROVED` count, oldest first.
 *
 * THE FACTS COME THROUGH `getLifecycleFacts` (AC-9): the signer's name is the `signedBy`
 * `User.name` and the date is `signedAt` as `YYYY-MM-DD`, both obtained without this module
 * naming the signature column — which is why 009 AC-26's one-module rule still holds. Ruling
 * R2: the name and the date travel; the drawn stroke does not.
 */
async function toExportCounts(
  actor: SessionUser,
  counts: readonly ApprovedCount[],
): Promise<ExportCount[]> {
  const exported: ExportCount[] = [];

  for (const count of counts) {
    const facts = await getLifecycleFacts(actor, count.countId);
    exported.push({
      periodKey: count.periodKey,
      signedByName: facts.signedByName,
      signedOn: facts.signedAt === null ? null : facts.signedAt.slice(0, 10),
    });
  }

  return exported;
}

/** One yard's sheet data: its named rows and its signer block. */
async function toExportYard(
  actor: SessionUser,
  yard: Yard,
  counts: readonly ApprovedCount[],
  periods: readonly ExportInput["periods"][number][],
  lines: readonly ValuedLine[],
  asOf: string,
): Promise<ExportYard> {
  const links = await readYardLinks(yard.id);
  const cells = cellsForYard(lines, yard.id);

  return {
    name: yard.name,
    code: yard.code,
    rows: links.map((link) => toExportRow(link, periods, cells, asOf)),
    counts: await toExportCounts(
      actor,
      counts.filter((count) => count.locationId === yard.id),
    ),
  };
}

/* ------------------------------------------------------------------- the surface */

/**
 * The whole workbook, built from the database and returned in memory. ADMIN ONLY.
 *
 * `showAll` is the route's `?all=1` (AC-12): `false` exports held-only rows, `true` exports
 * every assigned item (AC-7). The file name is `macroads-stock-<first>-<last>.xlsx` over the
 * exported range, or `macroads-stock-empty.xlsx` when nothing is approved (AC-12).
 */
export async function exportWorkbook(
  actor: SessionUser | null,
  options: { showAll: boolean },
): Promise<{ fileName: string; bytes: Buffer }> {
  const user = assertRole(actor, "ADMIN");

  const asOf = todayIso();
  const [yards, counts] = await Promise.all([readYards(), readApprovedCounts()]);

  const periods = approvedPeriodKeysIn(counts).map(exportPeriodOf);
  const lines = await readValuedLines(counts);

  const exportYards: ExportYard[] = [];
  for (const yard of yards) {
    exportYards.push(await toExportYard(user, yard, counts, periods, lines, asOf));
  }

  const bytes = await buildWorkbook({
    showAll: options.showAll,
    periods,
    yards: exportYards,
  });

  return {
    fileName: exportFileName(periods.map((period) => period.periodKey)),
    bytes,
  };
}
