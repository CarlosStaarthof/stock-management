import type { JSX } from "react";

import {
  SIGNATURE_HEADING,
  lifecycleSentences,
} from "@/lib/count-messages";
import { SIGNATURE_VIEWBOX, splitStrokes } from "@/lib/signature-path";
import type { CountLifecycleFacts } from "@/types/stock-count";

/**
 * WHAT HAPPENED TO THIS COUNT, in the words both roles see (009 AC-7, AC-16, AC-18, AC-23).
 *
 * One block, rendered identically on `/stock-entry/counts/[id]`, on `/submit` once the
 * count is away, and on `/summary`. Part 6 asks for "one version of the screen, not two",
 * and the cheapest way to keep that true is for there to be one component: a sentence that
 * existed in three places would eventually exist in three spellings.
 *
 * IT CARRIES NO EURO, for anybody. `CountLifecycleFacts` has ONE shape for both roles
 * because there is no monetary fact it could hold — `getLifecycleFacts` returns deeply
 * equal values for a `YARD_STAFF` actor and for an `ADMIN` on the same count (009 AC-21).
 *
 * THE FOUR SENTENCES ARE BUILT IN `src/lib/count-messages.ts`, NOT HERE, and that is not
 * taste: the instants on the shape are named for the columns they came from, and 007 AC-25
 * as amended by 009 AC-26 keeps `src/app/stock-entry/**` and `src/components/stock-entry/**`
 * at ZERO files naming any of them. `lifecycleSentences` takes the whole shape and hands
 * back strings.
 *
 * THE SIGNATURE IS THE STORED PATH DATA, RENDERED (009 AC-7). An inline `<svg>` with the
 * fixed `0 0 600 300` viewBox and one `<path>` per stroke, whose `d` attributes joined by a
 * single space are byte for byte what Postgres holds. There is no raster anywhere on this
 * path, so what was drawn, what was stored and what is shown cannot be three pictures — and
 * it will still be crisp when #12 puts it in the workbook.
 */
export function CountRecord({ lifecycle }: { lifecycle: CountLifecycleFacts }): JSX.Element | null {
  const said = lifecycleSentences(lifecycle);
  const strokes = lifecycle.signaturePath === null ? [] : splitStrokes(lifecycle.signaturePath);

  // A DRAFT nobody has ever submitted has nothing to say. It renders no empty block rather
  // than an empty one (009 § UI states).
  if (
    said.signed === null &&
    said.approved === null &&
    said.reopened === null &&
    strokes.length === 0
  ) {
    return null;
  }

  return (
    <section data-testid="count-record" className="flex flex-col gap-2">
      {/*
        SHOWN TO BOTH ROLES (009 Open question 7): the person who has to walk the yard
        again is the person who needs the reason, and this sentence carries no euro.
      */}
      {said.reopened === null ? null : (
        <p
          data-testid="reopen-notice"
          role="alert"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {said.reopened}
        </p>
      )}

      {said.signed === null ? null : (
        <p data-testid="signed-by" className="text-sm text-slate-700">
          {said.signed}
        </p>
      )}

      {said.approved === null ? null : (
        <p data-testid="approved-by" className="text-sm text-slate-700">
          {said.approved}
        </p>
      )}

      {/*
        A FACT RECORDED, NOT A RULE BROKEN (009 AC-16, Open question 2): the team is two
        people at most, and an administrator alone in the office must be able to close the
        month. Refusing it would leave a single-admin yard unable to finish.
      */}
      {said.samePerson === null ? null : (
        <p data-testid="signed-and-approved-by-same-person" className="text-sm text-slate-700">
          {said.samePerson}
        </p>
      )}

      {strokes.length === 0 ? null : (
        <figure className="flex flex-col gap-1">
          <figcaption className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {SIGNATURE_HEADING}
          </figcaption>
          <svg
            data-testid="signature"
            viewBox={SIGNATURE_VIEWBOX}
            role="img"
            aria-label={SIGNATURE_HEADING}
            className="h-auto w-full max-w-sm rounded border border-slate-300 bg-white"
          >
            {strokes.map((stroke, index) => (
              <path
                key={`${String(index)}-${stroke.slice(0, 12)}`}
                d={stroke}
                fill="none"
                stroke="#0f172a"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </figure>
      )}
    </section>
  );
}
