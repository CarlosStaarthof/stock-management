import type { JSX } from "react";

import { isHeld } from "@/lib/held";
import { NOT_COUNTED, NO_UNIT } from "@/lib/stock-takes-messages";
import type { CountHistoryLine } from "@/types/stock-count";

/**
 * What a count recorded: item, quantity, unit — `specs/domain-model.md` Part 6's row, and
 * nothing more (010 AC-8).
 *
 * THE QUANTITY IS PRINTED EXACTLY AS STORED. `21.6128` renders `21.6128` and `0.475`
 * renders `0.475`: the string crosses from Postgres through the service to here without
 * ever being a JavaScript `number`, so there is nothing here to round (AC-8, AC-10).
 *
 * THREE STATES, NOT TWO, AND THE DOM KEEPS THEM APART (AC-9, Invariant 5):
 *
 *   * `data-counted="no"`   — nobody looked. Renders `Not counted`.
 *   * `data-counted="zero"` — counted, none held. Renders `0`.
 *   * `data-counted="yes"`  — held.
 *
 * The middle one is #8's whole feature surviving a read: the workbook's blank cell could
 * not say "a person stood in the yard and wrote none", and this screen must not lose it
 * again by rendering both as an empty space.
 *
 * A STACKED LIST RATHER THAN A TABLE, which is 008 AC-30's finding: at 320 px a
 * three-column table of long descriptions is what makes the document scroll sideways, and
 * AC-19 measures this view in the `show=all` state on the longest description in the
 * database precisely because that is where the overflow appears.
 *
 * No price, no value, no total, for either role — there is no monetary fact on the shape
 * this is handed (AC-12).
 */

/** Which of Invariant 5's three states this line is in. Decided by `isHeld`, never by a number. */
function countedState(quantity: string | null): "no" | "zero" | "yes" {
  if (quantity === null) return "no";
  return isHeld(quantity) ? "yes" : "zero";
}

export function HistoryLines({ lines }: { lines: CountHistoryLine[] }): JSX.Element {
  return (
    <ul data-testid="history-lines" className="flex w-full flex-col">
      {lines.map((line) => (
        <li
          key={line.itemId}
          data-testid="history-line"
          data-item-id={line.itemId}
          data-counted={countedState(line.quantity)}
          className="flex flex-col gap-1 border-b border-slate-200 py-2"
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 break-words text-sm font-medium">{line.description}</span>
            <span className="shrink-0 text-xs text-slate-600">{line.unitLabel ?? NO_UNIT}</span>
          </div>
          <span data-testid="history-quantity" className="text-sm text-slate-600">
            {line.quantity ?? NOT_COUNTED}
          </span>
        </li>
      ))}
    </ul>
  );
}
