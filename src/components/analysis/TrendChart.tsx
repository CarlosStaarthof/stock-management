import type { JSX } from "react";

import {
  TREND_BAR_WIDTH,
  TREND_PLOT_HEIGHT,
  TREND_VIEWBOX_HEIGHT,
  TREND_VIEWBOX_WIDTH,
  buildTrendGeometry,
} from "@/lib/analysis-chart";
import type { TrendSlot } from "@/lib/analysis-chart";
import {
  INCOMPLETE_TOTAL,
  TREND_CHART_TITLE,
  TREND_TABLE_CAPTION,
  formatFigure,
} from "@/lib/analysis-messages";
import type { TrendPoint } from "@/types/analysis";

/**
 * Thirteen periods of total stock, as an inline `<svg>` and as the figures beside it
 * (011 AC-14).
 *
 * SERVER-RENDERED MARKUP, NO CHARTING LIBRARY, NO CLIENT BUNDLE. This project has a
 * dependency fence and #10's finding stands: a screen that needs JavaScript is a screen
 * that breaks. The picture is markup, so it arrives with the document.
 *
 * THE PICTURE AND THE FIGURES COME FROM ONE ARRAY, and that is the point rather than a
 * convenience: `buildTrendGeometry` is called ONCE and both the bars and the rows are
 * mapped from its result, so the two cannot disagree. AC-14 asserts that by comparing the
 * `(period, amount)` tuples parsed from each — an assertion that would be vacuous if the
 * two lists were built separately and a chart that could disagree with its own table is a
 * chart nobody should believe.
 *
 * THERE IS NO ARITHMETIC IN THIS FILE. `x`, `y`, `height` and `centreX` arrive ready to
 * become attributes, the scaled ones as exact integer STRINGS out of `bigint`, so no
 * JavaScript `number` ever touches a euro on the way to a pixel (AC-10). The two
 * constants used below are the baseline and the strip beneath it; nothing is derived
 * from them here.
 *
 * A GAP IS NOT A ZERO. An incomplete period gets no rectangle at all — a tick in the
 * strip BELOW the baseline, where nothing can be mistaken for a bar of height nothing —
 * and no `data-amount`, because a gap has no amount to carry. A complete period holding
 * nothing gets a real bar at the minimum height: counted-and-empty is a fact, and the
 * reader has to be able to tell the two apart at a glance.
 *
 * A GAP'S WORD IS `Incomplete`, in the marker's `<title>` and in the table cell alike. Both
 * stand for the period's TOTAL, and a total is not a yard: `Not counted` there, for a month
 * where Dublin was approved and Clonmel was not, reads as if nobody counted at all. That is
 * the same reading AC-6 (amended 2026-09-24) removed from `total-stock` and the breakdown's
 * row totals, and the trend is the third place a period's total is printed.
 *
 * NO FIXED PIXEL WIDTH: the `viewBox` scales to whatever the column gives it, so the
 * chart fits a 320 px phone and a desktop without a second rendering path (AC-20).
 */

/** One slot: a bar for a complete period, a gap marker for every other kind. */
function Slot({ slot }: { slot: TrendSlot }): JSX.Element {
  if (!slot.bar || slot.amount === null || slot.height === null || slot.y === null) {
    return (
      <line
        data-testid="trend-gap"
        data-period={slot.periodKey}
        x1={slot.centreX}
        y1={TREND_PLOT_HEIGHT}
        x2={slot.centreX}
        y2={TREND_VIEWBOX_HEIGHT}
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="2 3"
        className="text-slate-400"
      >
        <title>{`${slot.periodLabel}: ${INCOMPLETE_TOTAL}`}</title>
      </line>
    );
  }

  return (
    <rect
      data-testid="trend-bar"
      data-period={slot.periodKey}
      data-amount={slot.amount}
      x={slot.x}
      y={slot.y}
      width={TREND_BAR_WIDTH}
      height={slot.height}
      fill="currentColor"
      className="text-slate-900"
    >
      <title>{`${slot.periodLabel}: ${formatFigure(slot.amount)}`}</title>
    </rect>
  );
}

export function TrendChart({ points }: { points: TrendPoint[] }): JSX.Element {
  const slots = buildTrendGeometry(points);

  return (
    <section className="flex flex-col gap-3">
      <svg
        data-testid="trend-chart"
        role="img"
        viewBox={`0 0 ${String(TREND_VIEWBOX_WIDTH)} ${String(TREND_VIEWBOX_HEIGHT)}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full rounded border border-slate-200 bg-white"
      >
        <title>{TREND_CHART_TITLE}</title>

        {/* The baseline every bar stands on, and the line the gap markers hang below. */}
        <line
          x1={0}
          y1={TREND_PLOT_HEIGHT}
          x2={TREND_VIEWBOX_WIDTH}
          y2={TREND_PLOT_HEIGHT}
          stroke="currentColor"
          strokeWidth={1}
          className="text-slate-300"
        />

        {slots.map((slot) => (
          <Slot key={slot.periodKey} slot={slot} />
        ))}
      </svg>

      <div className="w-full overflow-x-auto">
        <table data-testid="trend-table" className="w-full text-sm">
          <caption className="pb-1 text-left text-sm text-slate-600">
            {TREND_TABLE_CAPTION}
          </caption>
          <tbody>
            {slots.map((slot) => (
              <tr
                key={slot.periodKey}
                data-testid="trend-row"
                data-period={slot.periodKey}
                // Absent for a gap, exactly as it is absent on the marker above: the two
                // lists of tuples are compared for equality (AC-14).
                data-amount={slot.amount ?? undefined}
                className="border-b border-slate-100"
              >
                <th scope="row" className="py-1 text-left font-normal text-slate-700">
                  {slot.periodLabel}
                </th>
                <td className="py-1 text-right whitespace-nowrap">
                  {slot.amount === null ? INCOMPLETE_TOTAL : formatFigure(slot.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
