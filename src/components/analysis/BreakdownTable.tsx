import Link from "next/link";
import type { JSX } from "react";

import {
  BREAKDOWN_HEADING,
  BREAKDOWN_LABEL,
  INCOMPLETE_TOTAL,
  NOTHING_HELD_IN_PERIOD,
  NOT_COUNTED,
  TOTAL_STOCK_LABEL,
  formatFigure,
  unvaluedHeldLinesMessage,
} from "@/lib/analysis-messages";
import type { BreakdownKey, BreakdownRow } from "@/types/analysis";

/**
 * Where the stock is: by type or by supplier, per yard and together (011 AC-15).
 *
 * TWO LINKS, NOT A `<select>`, for the reason #10's scope selector gives: this feature
 * ships no client JavaScript at all, and a `<select>` needs an `onChange` to navigate. The
 * current one carries `aria-current="true"` and the other carries the attribute not at
 * all — `aria-current="false"` is a value, and a test that counts elements carrying it
 * would count both.
 *
 * IT IS HANDED ITS LINKS ALREADY BUILT. Every URL on this screen comes from one builder,
 * so no component is a second place the reading state could be dropped (AC-16).
 *
 * THE PER-YARD COLUMN STILL RENDERS WHEN THE PERIOD DOES NOT ADD UP. An incomplete period
 * has no row total — Invariant 7 — but the yards that WERE approved still have figures,
 * and hiding them would throw away the only thing on the screen that is known.
 *
 * A GROUP WHOSE HELD LINES ARE ALL UNPRICED IS NEVER OMITTED: it renders `€0.00` AND the
 * sentence saying how much of it was counted and not valued. `Dublin!AH25` and `!AH51` —
 * €486.00 counted, never valued, and invisible — are the defect that rule exists for.
 */

export type BreakdownOption = {
  key: BreakdownKey;
  label: string;
  href: string;
  current: boolean;
};

/** One active yard, as a column heading: the name is `Location.name`, never a literal. */
export type BreakdownColumn = { locationCode: string; locationName: string };

export function BreakdownTable({
  breakdownKey,
  options,
  columns,
  rows,
}: {
  breakdownKey: BreakdownKey;
  options: BreakdownOption[];
  columns: BreakdownColumn[];
  rows: BreakdownRow[];
}): JSX.Element {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{BREAKDOWN_HEADING}</h2>

      <nav data-testid="breakdown-links" className="flex flex-wrap items-center gap-2">
        {options.map((option) => (
          <Link
            key={option.key}
            data-testid="breakdown-link"
            data-breakdown={option.key}
            href={option.href}
            prefetch={false}
            aria-current={option.current ? "true" : undefined}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded border px-3 py-2 text-sm ${
              option.current
                ? "border-slate-900 bg-slate-900 font-semibold text-white"
                : "border-slate-300 text-slate-900"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p
          data-testid="breakdown-empty"
          className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
        >
          {NOTHING_HELD_IN_PERIOD}
        </p>
      ) : (
        /*
          The scroller is on a wrapper rather than on the document: a four-column money
          table does not fit 320 px, and a table that widens the PAGE is the overflow
          AC-20 forbids. The wrapper scrolls; the document never does.
        */
        <div className="w-full overflow-x-auto">
          <table data-testid="breakdown" className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th scope="col" className="py-1 pr-3 font-medium">
                  {BREAKDOWN_LABEL[breakdownKey]}
                </th>
                {columns.map((column) => (
                  <th
                    key={column.locationCode}
                    scope="col"
                    data-location-code={column.locationCode}
                    className="py-1 pr-3 text-right font-medium whitespace-nowrap"
                  >
                    {column.locationName}
                  </th>
                ))}
                <th scope="col" className="py-1 text-right font-medium whitespace-nowrap">
                  {TOTAL_STOCK_LABEL}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={`${row.groupKey}|${row.groupLabel}`}
                  data-testid="breakdown-row"
                  data-group={row.groupKey}
                  className="border-b border-slate-100 align-top"
                >
                  <th scope="row" className="py-1 pr-3 text-left font-normal">
                    {row.groupLabel}
                    {row.unvaluedHeldLineCount === 0 ? null : (
                      <span
                        data-testid="unvalued-lines"
                        className="block text-xs font-normal text-amber-800"
                      >
                        {unvaluedHeldLinesMessage(row.unvaluedHeldLineCount)}
                      </span>
                    )}
                  </th>

                  {row.perYard.map((cell) => (
                    <td
                      key={cell.locationCode}
                      data-testid="breakdown-cell"
                      data-location-code={cell.locationCode}
                      className="py-1 pr-3 text-right whitespace-nowrap"
                    >
                      {cell.amount === null ? NOT_COUNTED : formatFigure(cell.amount)}
                    </td>
                  ))}

                  <td
                    data-testid="breakdown-total"
                    className="py-1 text-right font-semibold whitespace-nowrap"
                  >
                    {/*
                      A row total for an incomplete period is not a yard: it reads
                      `Incomplete`, and the per-yard cells beside it keep `Not counted`
                      (AC-6, amended 2026-09-24).
                    */}
                    {row.amount === null ? INCOMPLETE_TOTAL : formatFigure(row.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
