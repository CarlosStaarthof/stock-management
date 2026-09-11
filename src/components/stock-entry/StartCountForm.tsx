"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { JSX } from "react";

import { startCountAction } from "@/app/stock-entry/actions";
import { EMPTY_START_COUNT_STATE } from "@/app/stock-entry/form-state";
import { OPEN_THE_EXISTING_COUNT, PERIOD_LABEL, START_COUNT } from "@/lib/count-messages";
import { StartCountButton } from "@/components/stock-entry/StartCountButton";

/**
 * *Start count*: the yard, the day and the period the user is about to commit to.
 *
 * A Client Component because `useActionState` is how a refusal comes back inline with the
 * typed values kept (AC-8, AC-23). The yard and the date are hidden fields carrying what
 * the previous screen already confirmed; the PERIOD is the one control, an
 * `<input type="month">` so a phone offers its native month picker rather than a bespoke
 * one (AC-7, AC-28). It accepts any month from 2000 to 2100 with no proximity check,
 * because the date and the period are independent facts — the workbook holds a count dated
 * `2026-12-31` that belongs to `2025-12` (open question 3).
 *
 * There is no identity field here and there is none anywhere in this feature: who is
 * counting is the session (AC-5).
 */
export function StartCountForm({
  locationCode,
  countDate,
  periodKey,
}: {
  locationCode: string;
  countDate: string;
  periodKey: string;
}): JSX.Element {
  const [state, formAction] = useActionState(startCountAction, EMPTY_START_COUNT_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="locationCode" value={locationCode} />
      <input type="hidden" name="countDate" value={countDate} />

      {/* A ConflictError renders ABOVE the form, with the link to the count that exists. */}
      {state.error === null || state.field !== null ? null : (
        <p
          data-testid="start-count-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
          {state.existingCountId === null ? null : (
            <>
              {" "}
              <Link
                data-testid="open-existing-count"
                href={`/stock-entry/counts/${state.existingCountId}`}
                className="font-medium underline underline-offset-2"
              >
                {OPEN_THE_EXISTING_COUNT}
              </Link>
            </>
          )}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="period">
        {PERIOD_LABEL}
        <input
          id="period"
          data-testid="period-input"
          type="month"
          name="period"
          defaultValue={periodKey}
          min="2000-01"
          max="2100-12"
          className="min-h-11 w-full rounded border border-slate-300 px-3 py-2 text-base font-normal"
        />
      </label>

      {/* A ValidationError renders INLINE beside the field it names. */}
      {state.error === null || state.field === null ? null : (
        <p
          data-testid="start-count-field-error"
          role="alert"
          className="text-sm font-medium text-red-700"
          data-field={state.field}
        >
          {state.error}
        </p>
      )}

      <StartCountButton testId="start-count">{START_COUNT}</StartCountButton>
    </form>
  );
}
