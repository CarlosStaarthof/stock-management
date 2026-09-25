"use client";

import { useActionState } from "react";
import type { JSX } from "react";

import { resumeNewDeviceSignInAction } from "@/app/profiles/actions";
import { INITIAL_PROFILE_FORM_STATE } from "@/app/profiles/form-state";
import { FormError } from "@/components/profiles/FormError";
import { RESUME_NEW_DEVICES_LABEL } from "@/lib/auth-messages";

/** Lifts the pause on sign-in from new devices (021 S8, AC-26). Deletes no failure. */
export function ResumeNewDevicesForm(): JSX.Element {
  const [state, resume, resuming] = useActionState(
    resumeNewDeviceSignInAction,
    INITIAL_PROFILE_FORM_STATE,
  );

  return (
    <>
      <form action={resume}>
        <button
          type="submit"
          data-testid="resume-new-devices"
          disabled={resuming}
          className="min-h-11 rounded bg-slate-900 px-4 py-2 text-base font-medium text-white disabled:opacity-60"
        >
          {RESUME_NEW_DEVICES_LABEL}
        </button>
      </form>
      <FormError testId="resume-error" message={state.error} />
    </>
  );
}
