import type { JSX } from "react";

import {
  NOT_COMPARABLE_PERIOD_INCOMPLETE,
  formatVarianceAmount,
  notComparableAgainstIncomplete,
  notComparableAgainstMissing,
} from "@/lib/analysis-messages";
import type { Variance } from "@/types/analysis";

/**
 * This period against another one — month on month, and year on year (011 AC-11, AC-12).
 *
 * ONE ELEMENT ALWAYS CARRIES THE ANSWER, and the answer is either a signed figure or the
 * sentence saying why there is none. A panel that showed a figure sometimes and nothing
 * the rest of the time would leave an administrator unable to tell "no movement" from "not
 * comparable", and those are the two readings this whole feature exists to keep apart.
 *
 * IT REFUSES RATHER THAN REACHING FURTHER BACK. The comparand is `(y, m − 1)` or
 * `(y − 1, m)` and nothing else; when it is incomplete the sentence NAMES it and stops.
 * `Summary!C9` subtracts the column eleven months back and calls the answer month on
 * month; month on month means the month before, or it means nothing.
 *
 * THE SIGN IS A TRUE MINUS AND IT IS `analysis-messages.ts`'s (AC-22), not a hyphen typed
 * here: a hyphen at this size reads as a dash between two figures rather than as the sign
 * of one, and this is the only negative number on the screen.
 */

/**
 * The figure, or the reason there is none.
 *
 * `COMPARABLE` is the only state that carries a number, so the four states collapse to
 * "is there an amount". The last line is reached only by a `COMPARABLE` with no amount,
 * which the shape forbids; if it ever happened the honest thing to say is that this
 * period has no total, which is exactly what that sentence says.
 */
function varianceText(variance: Variance): string {
  if (variance.state === "COMPARABLE" && variance.varianceAmount !== null) {
    return formatVarianceAmount(variance.varianceAmount);
  }
  if (variance.state === "AGAINST_INCOMPLETE") {
    return notComparableAgainstIncomplete(variance.againstPeriodLabel);
  }
  if (variance.state === "AGAINST_MISSING") {
    return notComparableAgainstMissing(variance.againstPeriodLabel);
  }
  return NOT_COMPARABLE_PERIOD_INCOMPLETE;
}

export function VariancePanel({
  testId,
  label,
  variance,
}: {
  testId: string;
  label: string;
  variance: Variance;
}): JSX.Element {
  return (
    <div className="flex flex-1 flex-col gap-2 rounded border border-slate-300 bg-white p-3">
      <p className="text-sm text-slate-600">{label}</p>

      <p
        data-testid={testId}
        data-against-period={variance.againstPeriodKey}
        data-state={variance.state}
        className="text-xl font-semibold break-words"
      >
        {varianceText(variance)}
      </p>

      {/*
        The comparand, named, whenever there IS one to compare with. The three refusals
        name it inside their own sentence, so repeating it there would say it twice.
      */}
      {variance.state === "COMPARABLE" ? (
        <p className="text-sm text-slate-600">{variance.againstPeriodLabel}</p>
      ) : null}
    </div>
  );
}
