"use client";

import { useActionState } from "react";
import type { JSX } from "react";

import { clearAccountLockAction } from "@/app/profiles/actions";
import { INITIAL_PROFILE_FORM_STATE } from "@/app/profiles/form-state";
import { FormError } from "@/components/profiles/FormError";
import { CLEAR_LOCK_LABEL } from "@/lib/auth-messages";

/** Ends a profile's lock at once, keeping its level (021 S6, AC-26). Writes no event. */
export function ClearLockForm({ id }: { id: string }): JSX.Element {
  const [state, clear, clearing] = useActionState(clearAccountLockAction, INITIAL_PROFILE_FORM_STATE);

  return (
    <>
      <form action={clear}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          data-testid={`clear-lock-${id}`}
          disabled={clearing}
          className="min-h-11 rounded border border-slate-300 bg-white px-3 py-2 text-base disabled:opacity-60"
        >
          {CLEAR_LOCK_LABEL}
        </button>
      </form>
      <FormError testId={`clear-error-${id}`} message={state.error} />
    </>
  );
}
