"use client";

import { useActionState } from "react";
import type { JSX } from "react";

import { approveCountAction } from "@/app/stock-entry/actions";
import { EMPTY_COUNT_ACTION_STATE } from "@/app/stock-entry/form-state";
import { StartCountButton } from "@/components/stock-entry/StartCountButton";
import { APPROVE_THIS_COUNT } from "@/lib/count-messages";

/**
 * *Approve this count* — one button, one hidden id, and no JavaScript required (009 AC-10).
 *
 * An ordinary `<form>` posting to a server action: with the bundle disabled the browser
 * posts it and the server renders the answer, which is the whole reason approve and reopen
 * are forms rather than `fetch` calls. `useActionState` is here only so that a refusal
 * comes back ON THE PAGE — and React renders that state into the HTML response too, so it
 * works in both browsers.
 *
 * THE ROLE IS NOT THIS COMPONENT'S BUSINESS. `/summary` is a `307` for a staff session and
 * `approveCount` raises `ForbiddenError` for a staff actor: this control not being
 * rendered is the third and weakest of the three layers, and the criterion names the
 * innermost one (009 AC-15).
 *
 * IT CANNOT BE PRESSED TWICE. `StartCountButton` disables itself while its form is in
 * flight; the compare-and-set in `approveCount` is the backstop, and two concurrent
 * approvals produce one approved row and one `ConflictError` (009 AC-16).
 */
export function ApproveForm({ countId }: { countId: string }): JSX.Element {
  const [state, formAction] = useActionState(approveCountAction, EMPTY_COUNT_ACTION_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="countId" value={countId} />

      {state.error === null ? null : (
        <p
          data-testid="approve-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <StartCountButton testId="approve-count">{APPROVE_THIS_COUNT}</StartCountButton>
    </form>
  );
}
