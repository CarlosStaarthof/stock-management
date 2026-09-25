import { compareDecimals, scaleToInteger } from "@/lib/money";
import type { TrendPoint } from "@/types/analysis";

/**
 * The trend chart's geometry: pure integer layout, and not one pixel of it is a float.
 *
 * THIS PROJECT SHIPS NO CHARTING LIBRARY and has a dependency fence (`npm run lint`,
 * `tests/unit/lint-fence.test.ts`). Adding one would put a client bundle, a licence and a
 * second rendering path into a screen that needs none of them, and #10's finding stands:
 * a screen that needs JavaScript is a screen that breaks. So the chart is an inline
 * `<svg>` rendered on the server from the SAME array that fills the table, and it is built
 * in two pieces so that all of it can be checked without a browser — this module is the
 * half that has no browser in it at all.
 *
 * WHY 520: it is exactly `13 × 40`, so thirteen slots divide the viewBox with no
 * remainder and THIS MODULE CONTAINS NO DIVISION. `TREND_VIEWBOX_WIDTH === TREND_WINDOW *
 * TREND_SLOT_WIDTH` is asserted as an equality (011 AC-14), so the constants cannot drift
 * apart without a test saying so.
 *
 * WHY EVERY SCALED VALUE IS A STRING: the decimal → coordinate step is `scaleToInteger` in
 * `src/lib/money.ts`, in `bigint`, beside the arithmetic that is already exact at any size.
 * There is therefore NO `Number(`, `parseFloat`, `toFixed` or `Math.round` anywhere on this
 * feature's path, not even in the chart — 011 AC-10 declines the usual chart exemption
 * deliberately, and a scan enforces it. A height that arrived as an exact decimal leaves as
 * an exact integer string; turning it into a JavaScript number to put it in an attribute
 * would undo the only reason the step is exact.
 *
 * A CHART NOBODY CAN ASSERT IS DECORATION, so every slot carries the facts a test reads:
 * the period key, the period label, and — for a bar — the exact decimal string the service
 * produced. AC-14 asserts the chart's tuples are EQUAL to the table's, so the picture and
 * the numbers cannot disagree.
 *
 * A GAP IS NOT A ZERO. An incomplete period gets `bar: false` and no height at all, because
 * a zero-height bar reads as €0 and a period nobody counted is not a period holding
 * nothing. A COMPLETE period whose total is `"0"` gets `TREND_MIN_BAR_HEIGHT` — counted
 * and empty is a real fact and it is drawn.
 *
 * Pure: no Prisma, no clock, no browser, and it imports nothing from `src/server/`.
 */

/** Thirteen periods, so the YEAR-ON-YEAR comparand is the leftmost point of the window. */
export const TREND_WINDOW = 13;

/** One slot per period. `13 × 40 = 520` exactly, which is why there is no division here. */
export const TREND_SLOT_WIDTH = 40;

export const TREND_VIEWBOX_WIDTH = 520;

/** The plot plus a strip beneath it for the baseline and the gap markers. */
export const TREND_VIEWBOX_HEIGHT = 180;

/** The tallest a bar may be: the full total of the largest period in the window. */
export const TREND_PLOT_HEIGHT = 160;

export const TREND_BAR_WIDTH = 24;

/** `(40 − 24) = 16`, half on each side. Written down rather than divided for. */
export const TREND_BAR_INSET = 8;

/** `24 = 12 + 12`. Also written down rather than divided for: this module has no `/` in it. */
export const TREND_BAR_HALF_WIDTH = 12;

/**
 * A complete period always has a bar, even at `€0.00` and even at a figure too small to
 * round to a pixel. Counted-and-empty is a fact; the gap beside it is a different one, and
 * the reader has to be able to tell them apart at a glance.
 */
export const TREND_MIN_BAR_HEIGHT = 2;

/** One slot of the chart: a bar, or a gap. Integer viewBox units throughout. */
export type TrendSlot = {
  periodKey: string;
  periodLabel: string;
  complete: boolean;
  /** The exact decimal string the service produced. NULL FOR A GAP — a gap has no amount. */
  amount: string | null;
  /** The left edge of this slot's bar. */
  x: number;
  /** The centre of the slot, where a gap marker sits. */
  centreX: number;
  /** `false` is a GAP: no height, no rectangle, and nothing that reads as a zero. */
  bar: boolean;
  /** The bar's height in viewBox units, as an integer STRING. Null for a gap. */
  height: string | null;
  /** The bar's top edge: the baseline less its height. Null for a gap. */
  y: string | null;
};

const PLOT_HEIGHT_UNITS = BigInt(TREND_PLOT_HEIGHT);
const MIN_BAR_UNITS = BigInt(TREND_MIN_BAR_HEIGHT);

/**
 * The tallest complete total in the window, or `"0"` when nothing in it is complete.
 *
 * Only a COMPLETE period can set the scale: an incomplete one has no total at all, and a
 * partial total setting the height of the bars beside it would make every bar in the window
 * wrong for a reason the reader cannot see.
 */
function largestTotal(points: readonly TrendPoint[]): string {
  let largest = "0";

  for (const point of points) {
    if (!point.complete || point.totalStock === null) continue;
    if (compareDecimals(point.totalStock, largest) > 0) largest = point.totalStock;
  }

  return largest;
}

/**
 * The points, laid out left to right, oldest first — the same order and the same length as
 * the array the table renders (011 AC-14).
 *
 * `x` is a plain integer because it is a POSITION, derived by multiplying two constants by
 * an index; no quantity, price or figure passes through it. Everything derived from a euro
 * — `height`, `y` and `amount` — stays a string.
 */
export function buildTrendGeometry(points: readonly TrendPoint[]): TrendSlot[] {
  const max = largestTotal(points);

  return points.map((point, index) => {
    const x = index * TREND_SLOT_WIDTH + TREND_BAR_INSET;

    if (!point.complete || point.totalStock === null) {
      // A GAP. No height, no amount, nothing a reader could mistake for a figure.
      return {
        periodKey: point.periodKey,
        periodLabel: point.periodLabel,
        complete: point.complete,
        amount: null,
        x,
        centreX: x + TREND_BAR_HALF_WIDTH,
        bar: false,
        height: null,
        y: null,
      };
    }

    const scaled = BigInt(scaleToInteger(point.totalStock, max, TREND_PLOT_HEIGHT));
    const height = scaled < MIN_BAR_UNITS ? MIN_BAR_UNITS : scaled;

    return {
      periodKey: point.periodKey,
      periodLabel: point.periodLabel,
      complete: point.complete,
      amount: point.totalStock,
      x,
      centreX: x + TREND_BAR_HALF_WIDTH,
      bar: true,
      height: height.toString(),
      // The bar grows up from the baseline, so its top edge is the baseline less its
      // height — a subtraction in `bigint`, which is why there is still no division and
      // still no `Number(`.
      y: (PLOT_HEIGHT_UNITS - height).toString(),
    };
  });
}
