"use client";

import { useActionState } from "react";
import type { JSX } from "react";

import { reopenCountAction } from "@/app/stock-entry/actions";
import { EMPTY_COUNT_ACTION_STATE } from "@/app/stock-entry/form-state";
import { StartCountButton } from "@/components/stock-entry/StartCountButton";
import { REOPEN_REASON_LABEL, REOPEN_THIS_COUNT } from "@/lib/count-messages";

/**
 * *Reopen this count*, and the reason it will not happen without (009 AC-18).
 *
 * THE REASON IS THE ONLY RECORD THAT SURVIVES. A reopen sets six columns back to `null` —
 * who submitted it, who signed it, when, who approved it, when, and the drawing itself —
 * so without the line it appends to the trail there would be no record at all that the
 * count had ever been approved, by whom, or why it was undone.
 *
 * ONE LINE, 1–200 CHARACTERS, AND THIS COMPONENT DECIDES NONE OF IT. `parseReopenReason`
 * is the rule, in a pure module the action calls before the service: a newline in a reason
 * would forge a second entry in a trail that is one line per event. There is deliberately
 * no `maxLength` attribute mirroring the constant here — importing it would be a THIRD
 * `components -> server` module, and `docs/architecture.md` says in terms that a third
 * means moving them all to `src/lib/`. 009 AC-31 requires this feature to add no new
 * dependency exception, so the refusal is the parser's and the screen renders it inline.
 *
 * IT NEEDS NO JAVASCRIPT. An ordinary `<form>`, an ordinary `<input>`, and a server action
 * (009 AC-10).
 */
export function ReopenForm({ countId }: { countId: string }): JSX.Element {
  const [state, formAction] = useActionState(reopenCountAction, EMPTY_COUNT_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="countId" value={countId} />

      {/* A ConflictError or a NotFoundError names no control and renders above the form. */}
      {state.error === null || state.field !== null ? null : (
        <p
          data-testid="reopen-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="reason">
        {REOPEN_REASON_LABEL}
        <input
          id="reason"
          data-testid="reopen-reason"
          type="text"
          name="reason"
          autoComplete="off"
          className="min-h-11 w-full rounded border border-slate-300 px-3 py-2 text-base font-normal"
        />
      </label>

      {/* A ValidationError renders INLINE beside the field it names. */}
      {state.error === null || state.field === null ? null : (
        <p
          data-testid="reopen-field-error"
          role="alert"
          data-field={state.field}
          className="text-sm font-medium text-red-700"
        >
          {state.error}
        </p>
      )}

      <StartCountButton testId="reopen-count">{REOPEN_THIS_COUNT}</StartCountButton>
    </form>
  );
}
