import type { JSX } from "react";

import {
  NOT_COUNTED,
  NO_PRICE,
  NO_UNIT,
  PRICE_COLUMN,
  QUANTITY_COLUMN,
  VALUE_COLUMN,
} from "@/lib/count-messages";
import { formatPriceExact, roundHalfUp } from "@/lib/money";
import type { SummaryRow } from "@/types/stock-count";

/**
 * THE ONE SURFACE IN THIS PRODUCT THAT CARRIES A EURO, and it is `ADMIN`-only.
 *
 * `/stock-entry/counts/[id]/summary` is a `307` for every `YARD_STAFF` session, at the
 * route, before a line of this component is built — and `getCountSummary` raises
 * `ForbiddenError` for a staff actor even if one ever reached it (009 AC-22). So this
 * component does not decide whether to show a price: `docs/architecture.md` is explicit
 * that "if a component has to decide whether to show a price, the boundary has already
 * been crossed in the wrong place".
 *
 * IT NAMES NO COLUMN. The price arrives on `unitAmount`, because 009 AC-26 keeps the
 * `src/app/**` and `src/components/**` half of 006 AC-31's permitted list at exactly the
 * three item-master files: the value crosses the last boundary on a field the SHAPE
 * declares, and `summaryRows` in `count-summary-service.ts` — a file that may say both
 * words — is the one mapper.
 *
 * IT COMPUTES NOTHING. Every figure here was derived by the service, exactly, as a decimal
 * string; this file rounds for DISPLAY and formats, and holds no `Number(`, no
 * `parseFloat`, no `toFixed`, no `Math.round` and no `*` (009 AC-24). The line values are
 * rounded to the cent; the TOTAL is the sum of the EXACT values rounded once, which is why
 * the column may not add to the total on screen to the last cent and why the total is the
 * figure that agrees with the workbook (Invariant 10, 009 Open question 3).
 *
 * A STACKED LIST RATHER THAN A TABLE, for the reason 008 AC-30 recorded: four columns of
 * figures beside a description like `White Extrusion 80/20 Thermo-P` cannot fit 320 CSS px
 * without the document scrolling sideways, and 009 AC-9 checks this very screen at 390 px
 * and at 320 px because "a table is what overflows".
 *
 * INVARIANT 4 IS VISIBLE PER ROW, never silent: a line whose item had no price in force on
 * `countDate` is tagged `No price` and valued at `€0.00`, rather than being quietly worth
 * nothing.
 */
export function ValuedLines({ rows }: { rows: SummaryRow[] }): JSX.Element {
  return (
    <ul data-testid="valued-lines" className="flex w-full flex-col">
      {rows.map((row) => (
        <li
          key={row.itemId}
          data-testid="valued-line"
          data-item-id={row.itemId}
          className="flex flex-col gap-1 border-b border-slate-200 py-2"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 break-words text-sm font-medium">{row.description}</span>
            <span className="shrink-0 text-xs text-slate-600">{row.unitLabel ?? NO_UNIT}</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-700">
            <span data-testid="line-quantity">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {QUANTITY_COLUMN}{" "}
              </span>
              {row.quantity ?? NOT_COUNTED}
            </span>

            <span data-testid="line-amount">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {PRICE_COLUMN}{" "}
              </span>
              {row.noPrice || row.unitAmount === null ? (
                <span
                  data-testid="no-price"
                  className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
                >
                  {NO_PRICE}
                </span>
              ) : (
                formatPriceExact(row.unitAmount)
              )}
            </span>

            <span data-testid="line-value" className="font-medium">
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {VALUE_COLUMN}{" "}
              </span>
              {formatPriceExact(roundHalfUp(row.lineValue, 2))}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
