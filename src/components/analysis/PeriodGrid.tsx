import Link from "next/link";
import type { JSX } from "react";

import {
  COUNT_STATUS_LABEL,
  INCOMPLETE_TOTAL,
  NOT_COUNTED,
  TOTAL_STOCK_LABEL,
  formatFigure,
  missingYardsMessage,
  unvaluedHeldLinesMessage,
} from "@/lib/analysis-messages";
import type { PeriodFigures, YardFigure } from "@/types/analysis";

/**
 * What each yard was worth in one period, and what the two of them were worth together
 * (011 AC-5, AC-6, AC-7, AC-9).
 *
 * IT COMPUTES NOTHING. Every figure arrives exact and unrounded from
 * `getAnalysis`; the only thing that happens here is `formatFigure`, which is
 * `formatPriceExact(roundHalfUp(value, 2))` and is the ONE place a euro is rounded — for
 * display, once, never before a sum (AC-7). There is no arithmetic in this file.
 *
 * AN ABSENT FIGURE IS NAMED, NEVER DRAWN AS A ZERO. `Not counted` where a yard has no
 * approved count, `Submitted` or `Draft` where it has one that is not a record yet, and a
 * total that reads `Incomplete` — its own word, not the yard's (AC-6, amended) — with the
 * sentence beside it naming the yards that are missing. `€0.00` appears only where a
 * period is COMPLETE and really holds nothing —
 * counted-and-empty and never-counted are two different facts and this component renders
 * them differently, which is the whole of the spec's second section.
 *
 * ONE COLUMN ON THE PHONE, ONE ROW ON THE DESKTOP (AC-20), and the yard cells and the
 * total are SIBLINGS with the same box so that "stacked" is measurable: at 390 px every
 * `yard-cell-*` shares a left edge with `total-stock`, and at 1280 px none of them does.
 * The padding is on the cells rather than on anything between them, so the two edges line
 * up to the pixel rather than to a class name.
 *
 * NOT ONE FIELD HERE NAMES THE PRICE SNAPSHOT COLUMN (AC-26): every euro crosses on a
 * field the shape declares, so `src/app/**` and `src/components/**` stay at the three
 * item-master files 006 AC-31 permits.
 */

/**
 * The status word of a yard whose count is not a record yet, or `Not counted`.
 *
 * Both literals are #7's, re-exported by `analysis-messages.ts` rather than respelled
 * (AC-22): three words for three facts, and none of them is a euro.
 */
function statusWordOf(figure: YardFigure): string {
  return figure.countStatus === null ? NOT_COUNTED : COUNT_STATUS_LABEL[figure.countStatus];
}

export type YardCell = {
  figure: YardFigure;
  /** #10's read-only view of that count — `null` when the yard has no count at all. */
  countHref: string | null;
  /** #9's summary, the surface that NAMES the items with no price (AC-9). */
  summaryHref: string | null;
};

const CELL =
  "flex flex-1 flex-col gap-2 rounded border border-slate-300 bg-white p-3 text-slate-900";

export function PeriodGrid({
  period,
  cells,
}: {
  period: PeriodFigures;
  cells: YardCell[];
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="period-grid"
        className="flex flex-col gap-3 sm:flex-row sm:items-stretch"
      >
        {cells.map((cell) => (
          <div
            key={cell.figure.locationCode}
            data-testid={`yard-cell-${cell.figure.locationCode}`}
            data-location-code={cell.figure.locationCode}
            className={CELL}
          >
            <p className="text-sm text-slate-600">{cell.figure.locationName}</p>

            {/*
              The figure, or nothing at all. A yard with no APPROVED count has no value —
              not a zero, not a dash standing in for one — and the status word below says
              which of the three reasons it is (AC-5, AC-6).
            */}
            {cell.figure.yardValue === null ? null : (
              <p data-testid="yard-value" className="text-xl font-semibold break-words">
                {formatFigure(cell.figure.yardValue)}
              </p>
            )}

            {cell.countHref === null ? (
              <p data-testid="yard-status" className="text-sm text-slate-600">
                {statusWordOf(cell.figure)}
              </p>
            ) : (
              <Link
                data-testid="yard-count-link"
                data-location-code={cell.figure.locationCode}
                href={cell.countHref}
                prefetch={false}
                className="inline-flex min-h-11 min-w-11 items-center justify-center self-start rounded border border-slate-300 px-3 py-2 text-sm"
              >
                {statusWordOf(cell.figure)}
              </Link>
            )}

            {/*
              Invariant 4, beside the figure it shortens rather than in a footnote on
              another page — and it is a LINK, because this screen states the size of the
              hole and #9's summary names what is in it (AC-9). With none, the element is
              absent entirely rather than rendered empty.
            */}
            {cell.figure.unvaluedHeldLineCount === 0 || cell.summaryHref === null ? null : (
              <p data-testid="unvalued-lines" className="text-sm text-amber-800">
                <Link href={cell.summaryHref} prefetch={false} className="underline">
                  {unvaluedHeldLinesMessage(cell.figure.unvaluedHeldLineCount)}
                </Link>
              </p>
            )}
          </div>
        ))}

        {/*
          The total is a SIBLING of the yard cells and carries the same box, so AC-20's
          left-edge measurement is about the layout rather than about padding.
        */}
        <div
          data-testid="total-stock"
          className={`${CELL} border-slate-900 font-semibold`}
        >
          <p className="text-sm font-normal text-slate-600">{TOTAL_STOCK_LABEL}</p>
          <p className="text-xl break-words">
            {period.totalStock === null ? INCOMPLETE_TOTAL : formatFigure(period.totalStock)}
          </p>

          {period.unvaluedHeldLineCount === 0 ? null : (
            <p data-testid="unvalued-lines" className="text-sm font-normal text-amber-800">
              {unvaluedHeldLinesMessage(period.unvaluedHeldLineCount)}
            </p>
          )}
        </div>
      </div>

      {/*
        Invariant 7's other half: a total that is absent without saying WHICH yard is
        missing sends an administrator away to look for the reason (AC-6).
      */}
      {period.complete || period.missingYardNames.length === 0 ? null : (
        <p
          data-testid="period-incomplete"
          className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
        >
          {missingYardsMessage(period.missingYardNames, period.periodLabel)}
        </p>
      )}
    </div>
  );
}
