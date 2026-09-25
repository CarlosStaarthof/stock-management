import { TREND_WINDOW } from "@/lib/analysis-chart";
import { NO_SUPPLIER, formatMonthLabel } from "@/lib/analysis-messages";
import { isHeld } from "@/lib/held";
import { multiplyDecimal, subtractDecimals, sumDecimals } from "@/lib/money";
import { assertRole } from "@/server/auth/guards";
import { shapeForRole } from "@/server/auth/role-shape";
import type { SessionUser } from "@/server/auth/session-user";
import { formatPeriodKey } from "@/server/counts/period";
import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import {
  comparePeriodKeys,
  periodWindow,
  previousPeriodKey,
  priorYearPeriodKey,
} from "@/server/reporting/period-series";
import type {
  AnalysisForAdmin,
  AnalysisInput,
  BreakdownKey,
  BreakdownRow,
  PeriodFigures,
  TrendPoint,
  Variance,
  VarianceState,
  YardFigure,
} from "@/types/analysis";
import type { CountStatus } from "@/types/stock-count";

/**
 * Analysis: the one surface in this product that carries ALL of the money, for ONE role.
 *
 * FIVE RULES THIS MODULE ENCODES, each with a criterion rather than a comment keeping it
 * true.
 *
 *  1. ONLY AN `APPROVED` COUNT CARRIES A EURO (AC-5). Invariant 7 says so, and the two
 *     other statuses are shown rather than hidden: a `SUBMITTED` count's snapshots exist,
 *     so it COULD be valued, and it must not be — an `ADMIN` may still reopen it, and a
 *     total that falls when a count is sent back for correction is a total nobody can
 *     quote. A `DRAFT` has no snapshot at all, so valuing one would mean valuing September
 *     at March's prices.
 *  2. A MISSING MONTH IS A GAP, NEVER A ZERO (AC-6) — and the converse is the harder half:
 *     a COMPLETE period holding nothing is `"0"`, and that is a genuinely different fact.
 *     `null` means *this figure does not exist*; `"0"` means *this figure is zero*. Six
 *     figures on this screen turn on it.
 *  3. PRICES COME FROM THE COUNT, NEVER FROM THE PRICE LIST (AC-8). `unitPriceSnapshot` is
 *     a historical fact captured at submit time; this module reads it and reads nothing
 *     else. There is no path from here to the price list — not a query, not an import, not
 *     even a mention, which is why AC-8's scan reads this comment too — so no price-list
 *     edit can move a figure on this screen. That is the defect the whole product exists to
 *     fix: the workbook's `Value` columns reference the single price column `E`, so editing
 *     a price silently rewrites the value of every historical count.
 *  4. AN UNPRICED HELD LINE IS COUNTED, NOT LISTED (AC-9). `quantity > 0` by decimal
 *     comparison AND no snapshot. A line counted as `0` with no price contributes zero
 *     either way, and warning about it would be noise: 35 of 82 rows in the most recent
 *     Dublin count are zero or blank.
 *  5. THE TOTAL IS THE SUM OF THE EXACT FIGURES, ROUNDED ONCE (AC-7, Invariant 10) — never
 *     the sum of the rounded ones. The stated cost is that the rendered column may not add
 *     to the rendered total to the last cent, and the total is the correct figure.
 *
 * THIS MODULE WRITES NOTHING, ANYWHERE (AC-4). No `create`, `update`, `upsert`, `delete` or
 * `deleteMany`, on any model. It is the only module in this feature that names `db`.
 *
 * TYPESCRIPT DOES NOT PROTECT ANY OF THIS. #8 proved a price added to a staff shape
 * typechecks at exit 0, and #10 proved `return { ...row }` spreads a forbidden key through
 * silently. So EVERY SHAPE BELOW IS BUILT FIELD BY FIELD, never by spreading a database
 * row, and every guarantee is asserted over a VALUE rather than over a type.
 *
 * WHY IT READS EVERY COUNT ROW AND FILTERS IN MEMORY. `@@unique([locationId, periodYear,
 * periodMonth])` makes `StockCount` at most one row per yard per month — a few hundred rows
 * after a decade — and the one read answers four questions at once: which yards were
 * counted in the window, with what status, which periods hold an `APPROVED` count at all,
 * and which are the nearest either side. The LINES, which are the only large table here,
 * are then fetched for exactly the approved counts inside the thirteen-period window.
 * It also keeps this module free of `Number(`, which AC-10 forbids outright: a
 * `(periodYear, periodMonth)` filter would have to turn `"2026-09"` into two integers, and
 * every period key below is instead derived FROM the integers the database gave us, through
 * `formatPeriodKey`.
 */

/** The status that carries a euro. The other two are read, shown, and valued at nothing. */
const APPROVED: CountStatus = "APPROVED";

/**
 * A `@db.Date` column is stored at UTC midnight; `YYYY-MM-DD` is the whole of it.
 *
 * Written here rather than imported, BECAUSE THE MODULE THAT HOLDS THE TREE'S `isoDateOf`
 * IS THE PRICE LIST'S OWN MODULE. AC-8 asks for no path at all from this feature to it, and
 * a static import is a path even when the function it reaches for cannot carry a price —
 * and the criterion's scan reads this comment as well as the code, so this one cannot name
 * it either. `src/server/items/workbook-import-service.ts` already keeps its own copy of
 * this one-liner for its own reasons, so this is the third and the tree's precedent rather
 * than a new habit. The trade-off is recorded in `progress/impl_analysis.md`.
 */
function asIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------- the reading */

/** One yard, as the grid's columns are ordered. */
type Yard = { id: string; code: string; name: string };

/** One count, keyed by the period it CLOSES rather than by the day it was walked. */
type CountRow = {
  countId: string;
  locationId: string;
  /** `"2026-09"`, derived from the integers the database holds (never parsed from a string). */
  periodKey: string;
  countDate: string;
  status: CountStatus;
};

/**
 * One line of an approved count, valued.
 *
 * `lineValue` is `quantity × (the snapshot ?? 0)`, exact and unrounded — Invariant 1's
 * "derived on read, every time", and Invariant 4's "no price means zero, visibly".
 */
type ValuedRow = {
  countId: string;
  locationId: string;
  periodKey: string;
  lineValue: string;
  held: boolean;
  /** Invariant 4: held, and no snapshot. Counted, not valued. */
  unvaluedHeld: boolean;
  typeKey: string;
  typeLabel: string;
  typeSortOrder: number;
  supplierKey: string;
  supplierLabel: string;
  /** `No supplier` sorts LAST in the supplier breakdown, whatever its label sorts as. */
  supplierMissing: boolean;
};

async function readYards(): Promise<Yard[]> {
  // Invariant 7 is "every ACTIVE Location", and `Location` carries no history of that flag,
  // so completeness is computed against the yards that are active NOW. The consequence is
  // real, is not hidden, and is the spec's Open question 2.
  const rows = await db.location.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { id: true, code: true, name: true },
  });

  return rows.map((row) => ({ id: row.id, code: row.code, name: row.name }));
}

async function readCounts(): Promise<CountRow[]> {
  const rows = await db.stockCount.findMany({
    where: { location: { active: true } },
    select: {
      id: true,
      locationId: true,
      periodYear: true,
      periodMonth: true,
      countDate: true,
      status: true,
    },
  });

  return rows.map((row) => ({
    countId: row.id,
    locationId: row.locationId,
    periodKey: formatPeriodKey({ periodYear: row.periodYear, periodMonth: row.periodMonth }),
    countDate: asIsoDate(row.countDate),
    status: row.status as CountStatus,
  }));
}

/**
 * The lines of exactly these counts, valued on the snapshot and on nothing else.
 *
 * The item's type and supplier come back with the line because the breakdown groups by
 * them, and a second read keyed by item would be a second definition of which items a count
 * covers.
 */
async function readValuedLines(counts: readonly CountRow[]): Promise<ValuedRow[]> {
  if (counts.length === 0) return [];

  const byId = new Map(counts.map((count) => [count.countId, count]));

  const rows = await db.stockCountLine.findMany({
    where: { stockCountId: { in: counts.map((count) => count.countId) } },
    select: {
      stockCountId: true,
      quantity: true,
      unitPriceSnapshot: true,
      item: {
        select: {
          itemType: { select: { code: true, name: true, sortOrder: true } },
          supplier: { select: { id: true, name: true } },
        },
      },
    },
  });

  return rows.flatMap((row) => {
    const count = byId.get(row.stockCountId);
    if (count === undefined) return [];

    // Decimal STRINGS, never JS numbers: the workbook holds `21.6128` tonnes and
    // `6.11764706` euro, and a float round trip is exactly what loses the tail
    // (`docs/architecture.md` § Money and quantities).
    const quantity = row.quantity === null ? null : row.quantity.toString();
    const snapshot = row.unitPriceSnapshot === null ? null : row.unitPriceSnapshot.toString();
    const held = isHeld(quantity);

    return [
      {
        countId: count.countId,
        locationId: count.locationId,
        periodKey: count.periodKey,
        // Invariant 4: no price means zero, exactly and visibly — never silently.
        lineValue: multiplyDecimal(quantity ?? "0", snapshot ?? "0"),
        held,
        unvaluedHeld: held && snapshot === null,
        typeKey: row.item.itemType.code,
        typeLabel: row.item.itemType.name,
        typeSortOrder: row.item.itemType.sortOrder,
        supplierKey: row.item.supplier === null ? "" : row.item.supplier.id,
        supplierLabel: row.item.supplier === null ? NO_SUPPLIER : row.item.supplier.name,
        supplierMissing: row.item.supplier === null,
      },
    ];
  });
}

/** The lines of each count, indexed once, so a yard figure is a lookup and not a scan. */
function linesByCount(lines: readonly ValuedRow[]): Map<string, ValuedRow[]> {
  const byCount = new Map<string, ValuedRow[]>();

  for (const line of lines) {
    const own = byCount.get(line.countId) ?? [];
    own.push(line);
    byCount.set(line.countId, own);
  }

  return byCount;
}

/* ------------------------------------------------------------------- the figures */

/** Every count of one period, by yard. At most one per yard, by `@@unique` (#4). */
type PeriodCounts = Map<string, CountRow>;

function countsByPeriod(counts: readonly CountRow[]): Map<string, PeriodCounts> {
  const byPeriod = new Map<string, PeriodCounts>();

  for (const count of counts) {
    const yards = byPeriod.get(count.periodKey) ?? new Map<string, CountRow>();
    yards.set(count.locationId, count);
    byPeriod.set(count.periodKey, yards);
  }

  return byPeriod;
}

/**
 * One yard in one period.
 *
 * FIELD BY FIELD, NEVER A SPREAD. A spread of the database row would carry `locationId`,
 * `periodYear` and whatever a later migration adds, and the compiler would not say a word:
 * #10 proved exactly that, and proved that the compiler DOES catch it when the mapper is
 * written out. This list is the boundary.
 */
function yardFigureFor(
  yard: Yard,
  count: CountRow | undefined,
  lines: ReadonlyMap<string, ValuedRow[]>,
): YardFigure {
  const approved = count !== undefined && count.status === APPROVED;
  // A SUBMITTED count's lines already hold their snapshots, and they are deliberately not
  // read: the count is priced and is not yet a record (AC-5).
  const own = approved ? (lines.get(count.countId) ?? []) : [];

  return {
    locationCode: yard.code,
    locationName: yard.name,
    countStatus: count === undefined ? null : count.status,
    countId: count === undefined ? null : count.countId,
    countDate: count === undefined ? null : count.countDate,
    // `null` for DRAFT, for SUBMITTED and for no count at all. A yard that was not counted
    // is not a yard holding €0, and the three states render as three different sentences.
    yardValue: approved ? sumDecimals(own.map((line) => line.lineValue)) : null,
    heldLineCount: own.filter((line) => line.held).length,
    unvaluedHeldLineCount: own.filter((line) => line.unvaluedHeld).length,
  };
}

function periodFiguresFor(
  periodKey: string,
  yards: readonly Yard[],
  counts: PeriodCounts | undefined,
  lines: ReadonlyMap<string, ValuedRow[]>,
): PeriodFigures {
  const figures = yards.map((yard) => yardFigureFor(yard, counts?.get(yard.id), lines));

  const missingYardNames = figures
    .filter((figure) => figure.yardValue === null)
    .map((figure) => figure.locationName);

  // Invariant 7, and the empty-tree case answered rather than left vacuous: with no active
  // yard at all there is nothing to be complete, and a `€0.00` total for a product with no
  // yards would be the top-level form of the mistake this feature is shaped around.
  const complete = yards.length > 0 && missingYardNames.length === 0;

  return {
    periodKey,
    periodLabel: formatMonthLabel(periodKey),
    complete,
    missingYardNames,
    yards: figures,
    // Σ THE EXACT yard values. Rounded once, by the screen, for display only.
    totalStock: complete ? sumDecimals(figures.map((figure) => figure.yardValue ?? "0")) : null,
    unvaluedHeldLineCount: figures.reduce((running, figure) => running + figure.unvaluedHeldLineCount, 0),
  };
}

/* ------------------------------------------------------------------ the variances */

/** `true` when SOMETHING was counted here, whatever its status. Absence is a third answer. */
function anyCountIn(period: PeriodFigures): boolean {
  return period.yards.some((yard) => yard.countStatus !== null);
}

/**
 * One comparison, joined on the PERIOD (AC-11, AC-12).
 *
 * IT REFUSES RATHER THAN REACHING FURTHER BACK. When `(y, m − 1)` is incomplete the answer
 * is `AGAINST_INCOMPLETE` and the period is named; it does NOT fall back to the nearest
 * earlier complete period, because silently comparing September with July is a two-month
 * movement labelled as one month — the same species of defect as `Summary!C9`'s eleven-
 * month "year on year", which Part 4 condemns in terms. The spec records that one line of
 * `specs/domain-model.md` Part 3 reads otherwise, and settles it here.
 *
 * The four states are checked in this order on purpose: the SELECTED period's own
 * incompleteness comes first, because when there is no figure to compare FROM, naming a
 * fault in the comparand would send an administrator to the wrong yard.
 */
function varianceAgainst(period: PeriodFigures, against: PeriodFigures): Variance {
  const state = ((): VarianceState => {
    if (!period.complete) return "PERIOD_INCOMPLETE";
    if (!anyCountIn(against)) return "AGAINST_MISSING";
    if (!against.complete) return "AGAINST_INCOMPLETE";
    return "COMPARABLE";
  })();

  return {
    againstPeriodKey: against.periodKey,
    againstPeriodLabel: against.periodLabel,
    againstTotal: against.complete ? against.totalStock : null,
    // `COMPARABLE` already means both periods are complete, and a complete period always
    // has a total; the two null checks narrow the type rather than adding a fifth state.
    varianceAmount:
      state === "COMPARABLE" && period.totalStock !== null && against.totalStock !== null
        ? subtractDecimals(period.totalStock, against.totalStock)
        : null,
    state,
  };
}

/* ------------------------------------------------------------------ the breakdown */

/** One group, accumulating before it becomes a row. */
type GroupTally = {
  groupKey: string;
  groupLabel: string;
  sortOrder: number;
  /** `No supplier` is last whatever its name sorts as (AC-15). */
  last: boolean;
  /** Line values by yard, so a per-yard cell is a sum of EXACT figures. */
  byYard: Map<string, string[]>;
  unvaluedHeldLineCount: number;
  anyHeld: boolean;
};

function groupOf(line: ValuedRow, breakdownKey: BreakdownKey): {
  groupKey: string;
  groupLabel: string;
  sortOrder: number;
  last: boolean;
} {
  if (breakdownKey === "supplier") {
    return {
      groupKey: line.supplierKey,
      groupLabel: line.supplierLabel,
      // Suppliers have no `sortOrder` column; they order by name, which the comparator
      // applies as the tie-break for every group with the same rank.
      sortOrder: 0,
      last: line.supplierMissing,
    };
  }

  return {
    groupKey: line.typeKey,
    groupLabel: line.typeLabel,
    sortOrder: line.typeSortOrder,
    last: false,
  };
}

/**
 * The breakdown of ONE period, per yard and together (AC-15).
 *
 * A GROUP WITH NOTHING HELD DOES NOT APPEAR — Part 5 puts the dashboard at held only, and
 * there is no control to show the rest. But a group whose only held lines are UNPRICED does
 * appear, at `€0.00`, carrying the sentence: €486 counted and never valued was invisible
 * because it was absent, and that is the defect AC-9 exists for.
 *
 * The per-yard cell of an approved yard is a figure even when the PERIOD is incomplete; it
 * is the row TOTAL that is absent then, for the same reason the period total is.
 */
function breakdownFor(
  period: PeriodFigures,
  yards: readonly Yard[],
  counts: PeriodCounts | undefined,
  lines: readonly ValuedRow[],
  breakdownKey: BreakdownKey,
): BreakdownRow[] {
  const approvedYardIds = new Set(
    yards.filter((yard) => counts?.get(yard.id)?.status === APPROVED).map((yard) => yard.id),
  );

  const tallies = new Map<string, GroupTally>();

  for (const line of lines) {
    if (line.periodKey !== period.periodKey) continue;
    if (!approvedYardIds.has(line.locationId)) continue;

    const group = groupOf(line, breakdownKey);
    const tally = tallies.get(group.groupKey) ?? {
      groupKey: group.groupKey,
      groupLabel: group.groupLabel,
      sortOrder: group.sortOrder,
      last: group.last,
      byYard: new Map<string, string[]>(),
      unvaluedHeldLineCount: 0,
      anyHeld: false,
    };

    const values = tally.byYard.get(line.locationId) ?? [];
    values.push(line.lineValue);
    tally.byYard.set(line.locationId, values);

    tally.unvaluedHeldLineCount += line.unvaluedHeld ? 1 : 0;
    tally.anyHeld = tally.anyHeld || line.held;

    tallies.set(group.groupKey, tally);
  }

  return [...tallies.values()]
    .filter((tally) => tally.anyHeld)
    .sort((left, right) => {
      if (left.last !== right.last) return left.last ? 1 : -1;
      if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      return left.groupLabel.localeCompare(right.groupLabel);
    })
    .map((tally) => {
      const perYard = yards.map((yard) => ({
        locationCode: yard.code,
        amount: approvedYardIds.has(yard.id) ? sumDecimals(tally.byYard.get(yard.id) ?? []) : null,
      }));

      return {
        groupKey: tally.groupKey,
        groupLabel: tally.groupLabel,
        perYard,
        // Σ THE EXACT per-yard figures, and only for a complete period — so `sumDecimals`
        // of the rows equals `period.totalStock` exactly, whatever the rounded column adds
        // up to on the screen.
        amount: period.complete
          ? sumDecimals(perYard.flatMap((cell) => (cell.amount === null ? [] : [cell.amount])))
          : null,
        unvaluedHeldLineCount: tally.unvaluedHeldLineCount,
      };
    });
}

/* ---------------------------------------------------------------- the navigation */

/**
 * Every period holding at least one `APPROVED` count at an ACTIVE yard, ascending.
 *
 * "At an active yard" rather than "anywhere", because every other figure on this screen is
 * about the yards Invariant 7 is about: a jump that landed on a period whose only approved
 * count belongs to a deactivated yard would show a grid of `Not counted` and no total, which
 * is a dead end rather than a destination.
 */
function approvedPeriodKeysIn(counts: readonly CountRow[]): string[] {
  const keys = new Set(
    counts.filter((count) => count.status === APPROVED).map((count) => count.periodKey),
  );

  return [...keys].sort(comparePeriodKeys);
}

/* --------------------------------------------------------------- the role, once */

/**
 * `shapeForRole`'s caller for Analysis (AC-2), and the reason the admin shape is never even
 * CONSTRUCTED for a staff actor.
 *
 * It takes its two builders as parameters rather than closing over them because a parameter
 * can be a `vi.fn()` and a closure cannot — the spy-thunk half of AC-2 runs in
 * `npm run test:unit` with no database, exactly as 003 AC-17 and 009 AC-22 do.
 *
 * The staff thunk below THROWS, and it is unreachable while `assertRole` stands above it in
 * `getAnalysis`. That is deliberate and it is not decoration: there is no money-free thing
 * this function could usefully answer — `/stock-takes` is that screen and it already exists
 * — so if a later edit ever weakened the guard, the answer would still be a refusal rather
 * than a reduced object somebody could be tempted to fill in.
 */
export function analysisForRole<TStaff, TAdmin>(
  actor: SessionUser,
  forStaff: () => TStaff,
  forAdmin: () => TAdmin,
): TStaff | TAdmin {
  return shapeForRole(actor, { forStaff, forAdmin });
}

/* ------------------------------------------------------------------ the surface */

/**
 * Every figure on `/analysis`, for one period and one grouping. ADMIN ONLY.
 *
 * IT TAKES AN ACTOR AND `{ periodKey, breakdownKey }` AND NOTHING ELSE (AC-4): no filter,
 * no role, no page state. The actor comes from `requireAdminPage("analysis")` and from
 * nowhere else, and the shape is chosen from `actor.role` alone — never from a query
 * parameter, a header or a cookie (AC-18).
 *
 * A period far outside any data is not an error: it returns the never-counted state for
 * that period, with every yard `Not counted`, no total and thirteen gaps (AC-21).
 */
export async function getAnalysis(
  actor: SessionUser | null,
  input: AnalysisInput,
): Promise<AnalysisForAdmin> {
  const user = assertRole(actor, "ADMIN");

  return analysisForRole(
    user,
    (): never => {
      throw new ForbiddenError("ADMIN is required for this action");
    },
    async (): Promise<AnalysisForAdmin> => {
      // Thirteen periods, oldest first, ending at the selected one — so the leftmost point
      // of the chart IS the year-on-year comparand, and the two can never disagree.
      const window = periodWindow(input.periodKey, TREND_WINDOW);
      const monthOnMonthKey = previousPeriodKey(input.periodKey);
      const yearOnYearKey = priorYearPeriodKey(input.periodKey);

      // Both comparands are members of the window, and the set says so rather than a
      // comment promising it: a key that fell outside would otherwise be valued from lines
      // that were never read, which is a WRONG total rather than a missing one.
      const needed = new Set([...window, monthOnMonthKey, yearOnYearKey]);

      const [yards, counts] = await Promise.all([readYards(), readCounts()]);

      const valued = await readValuedLines(
        counts.filter((count) => count.status === APPROVED && needed.has(count.periodKey)),
      );
      const lines = linesByCount(valued);

      const byPeriod = countsByPeriod(counts);
      const figuresFor = (key: string): PeriodFigures =>
        periodFiguresFor(key, yards, byPeriod.get(key), lines);

      const period = figuresFor(input.periodKey);

      const trend: TrendPoint[] = window.map((key) => {
        const figures = figuresFor(key);
        return {
          periodKey: figures.periodKey,
          periodLabel: figures.periodLabel,
          complete: figures.complete,
          // A GAP, and not a zero: an incomplete period has no total at all, and a
          // zero-height bar would read as €0.
          totalStock: figures.totalStock,
        };
      });

      const approvedKeys = approvedPeriodKeysIn(counts);
      const earlier = approvedKeys.filter((key) => comparePeriodKeys(key, input.periodKey) < 0);
      const later = approvedKeys.filter((key) => comparePeriodKeys(key, input.periodKey) > 0);

      return {
        periodKey: period.periodKey,
        periodLabel: period.periodLabel,
        breakdownKey: input.breakdownKey,
        period,
        monthOnMonth: varianceAgainst(period, figuresFor(monthOnMonthKey)),
        yearOnYear: varianceAgainst(period, figuresFor(yearOnYearKey)),
        trend,
        breakdown: breakdownFor(
          period,
          yards,
          byPeriod.get(input.periodKey),
          valued,
          input.breakdownKey,
        ),
        previousApprovedPeriodKey: earlier.length === 0 ? null : earlier[earlier.length - 1],
        nextApprovedPeriodKey: later.length === 0 ? null : later[0],
        anyApprovedCountEver: approvedKeys.length > 0,
      };
    },
  );
}

/**
 * Every period holding at least one `APPROVED` count, ascending. ADMIN ONLY.
 *
 * The page opens on the LAST of these — the latest period holding an approved count, not
 * the latest COMPLETE one (AC-16, Open question 3): opening on a complete period would hide
 * the yard that has not counted, which is the thing an administrator most needs to act on.
 * With none at all the page opens on the month containing today in the yard and renders the
 * empty state, and that clock belongs to the page rather than to this service.
 */
export async function listApprovedPeriods(actor: SessionUser | null): Promise<string[]> {
  assertRole(actor, "ADMIN");

  return approvedPeriodKeysIn(await readCounts());
}
