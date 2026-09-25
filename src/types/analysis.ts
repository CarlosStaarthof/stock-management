import type { CountStatus } from "@/types/stock-count";

/**
 * Every shape feature #11 moves across a boundary, in one module that imports no runtime.
 *
 * IT LIVES HERE FOR THE REASON `src/types/stock-count.ts` DOES: `src/lib/analysis-chart.ts`
 * needs `TrendPoint` to lay a bar out, and `docs/architecture.md` forbids `src/lib/**` from
 * importing anything under `src/server/` except `@/server/errors`. A type module under
 * `src/types/` is reachable from `src/lib/`, `src/server/` and `src/app/` alike.
 *
 * NOT ONE FIELD HERE NAMES THE PRICE SNAPSHOT COLUMN, and that is the mapper rule of 009
 * AC-26 applied where the boundary actually is: every euro on this screen crosses on a
 * field the SHAPE declares — `yardValue`, `totalStock`, `againstTotal`, `varianceAmount`,
 * `amount` — so `src/server/reporting/analysis-service.ts` is the only module in this
 * feature that has to say the column's name, and no page or component ever does
 * (011 AC-26).
 *
 * THE SIX MONEY-SHAPED KEYS ARE A CENSUS, NOT AN ACCIDENT (011 AC-17). `againstTotal`,
 * `amount`, `totalStock`, `unvaluedHeldLineCount`, `varianceAmount` and `yardValue` are
 * exactly the keys `MONEY_KEY_PATTERN` matches anywhere in `AnalysisForAdmin`, and they are
 * exactly the euro-bearing fields. The variance is `varianceAmount` and not `difference`
 * precisely so that `deepKeys` COUNTS this feature's euros instead of missing one; a
 * seventh money-shaped key turns AC-17 red.
 *
 * EVERY MONETARY FIELD IS A DECIMAL STRING OR `null`, NEVER A JavaScript `number` and never
 * a `0` standing in for an absence (`docs/architecture.md` § Money and quantities). `null`
 * means *this figure does not exist*; `"0"` means *this figure is zero*. Six figures on this
 * screen turn on that distinction and the spec tabulates all six.
 */

/** Which grouping the breakdown uses. Two, fixed; there is no third and no free text. */
export type BreakdownKey = "type" | "supplier";

/**
 * COMPARABLE is the only state that carries a number. The other three name the reason.
 *
 * `PERIOD_INCOMPLETE` is the SELECTED period; `AGAINST_INCOMPLETE` and `AGAINST_MISSING`
 * are the period being compared against. They are three different sentences because they
 * are three different facts, and an administrator acts on a different thing in each.
 */
export type VarianceState =
  | "COMPARABLE"
  | "PERIOD_INCOMPLETE"
  | "AGAINST_INCOMPLETE"
  | "AGAINST_MISSING";

/** One yard in one period. `yardValue` is null unless that yard's count is APPROVED. */
export type YardFigure = {
  /** `"DUBLIN"`. */
  locationCode: string;
  /** `"Dublin"`. */
  locationName: string;
  /** The status of that yard's count for this period, or null when there is none. */
  countStatus: CountStatus | null;
  countId: string | null;
  /** `"YYYY-MM-DD"` — the day the yard was walked, not the month it closes. */
  countDate: string | null;
  /**
   * Σ (quantity × (the snapshot ?? 0)) over the APPROVED count. Exact, unrounded.
   *
   * `null` for every other state — a yard that was never counted is not a yard holding
   * €0, and rendering one as the other is the defect this whole feature is shaped around.
   */
  yardValue: string | null;
  /** Lines with `quantity > 0` by decimal comparison (`isHeld`, #10). */
  heldLineCount: number;
  /** Held lines with no snapshot: counted, not valued. Invariant 4. */
  unvaluedHeldLineCount: number;
};

export type PeriodFigures = {
  /** `"2026-09"`. */
  periodKey: string;
  /** `"September 2026"`. */
  periodLabel: string;
  /** Invariant 7: every ACTIVE Location has an APPROVED count for this period. */
  complete: boolean;
  /** The names of the active yards without one, in sortOrder. Empty when complete. */
  missingYardNames: string[];
  /** Every ACTIVE Location, in sortOrder — including the ones with no count at all. */
  yards: YardFigure[];
  /** Σ yardValue, exact — ONLY when `complete`. Null otherwise, and NEVER `"0"`. */
  totalStock: string | null;
  unvaluedHeldLineCount: number;
};

export type Variance = {
  /** `"2026-08"` for MoM, `"2025-09"` for YoY. Always present, even when missing. */
  againstPeriodKey: string;
  againstPeriodLabel: string;
  /** The comparand's total, exact — only when THAT period is complete. */
  againstTotal: string | null;
  /** totalStock − againstTotal, exact. Null unless `state` is COMPARABLE. */
  varianceAmount: string | null;
  state: VarianceState;
};

export type BreakdownRow = {
  /** `ItemType.code`, `Supplier.id`, or `""` for the items with no supplier. */
  groupKey: string;
  /** `"Thermo-P"` | `"Kelly"` | `"No supplier"`. */
  groupLabel: string;
  /** One entry per ACTIVE Location, in sortOrder. `amount` is null for an unapproved yard. */
  perYard: { locationCode: string; amount: string | null }[];
  /** Σ perYard, exact — only when the period is complete. */
  amount: string | null;
  unvaluedHeldLineCount: number;
};

/** One bar of the chart. `totalStock` null is a GAP, and a gap is not a zero. */
export type TrendPoint = {
  periodKey: string;
  periodLabel: string;
  complete: boolean;
  totalStock: string | null;
};

/**
 * ADMIN ONLY. `/analysis` is a 307 for a staff session and this shape is never built.
 *
 * It is ALLOWED to carry every monetary fact in this product, and it does: Part 6 gives an
 * administrator all of them, and this is the surface that carries them. The guarantee is
 * not that the shape is clean — it is that the shape is NEVER BUILT FOR ANYBODY ELSE
 * (AC-2, AC-17). `assertNoMoneyKeys` is deliberately not applied to it.
 */
export type AnalysisForAdmin = {
  /** `"2026-09"` — the selected period, echoed back so the page never re-derives it. */
  periodKey: string;
  /** `"September 2026"`. */
  periodLabel: string;
  breakdownKey: BreakdownKey;
  period: PeriodFigures;
  monthOnMonth: Variance;
  yearOnYear: Variance;
  /** TREND_WINDOW points, oldest first, ending at the selected period. */
  trend: TrendPoint[];
  breakdown: BreakdownRow[];
  /** The previous / next period holding at least one APPROVED count, or null. */
  previousApprovedPeriodKey: string | null;
  nextApprovedPeriodKey: string | null;
  anyApprovedCountEver: boolean;
};

/**
 * `getAnalysis`'s only argument besides the actor: no filter, no role, no page state
 * (AC-4). The role comes from the session and from nothing a client can set.
 */
export type AnalysisInput = {
  /** `"2026-09"`, already parsed by `parseAnalysisPeriodParam` at the edge. */
  periodKey: string;
  breakdownKey: BreakdownKey;
};
