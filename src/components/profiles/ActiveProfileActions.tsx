"use client";

import { useActionState } from "react";
import type { JSX } from "react";

import {
  changeProfileRoleAction,
  deactivateProfileAction,
  resetProfilePinAction,
} from "@/app/profiles/actions";
import { INITIAL_NEW_PIN_STATE, INITIAL_PROFILE_FORM_STATE } from "@/app/profiles/form-state";
import { FormError } from "@/components/profiles/FormError";
import { NewPinNotice } from "@/components/profiles/NewPinNotice";

/**
 * An active profile's actions (021 AC-23, AC-24): change its role, reset its PIN to a fresh
 * 4- or 6-digit one shown once, or deactivate it.
 *
 * DEACTIVATING CANNOT BE UNDONE: nothing reactivates a profile, and its username is never
 * reissued (*Out of scope*). So it sits behind a second, deliberate tap: a native
 * disclosure, which works with or without JavaScript.
 *
 * A profile migrated from #3 has no username, so it cannot hold a PIN and offers no reset;
 * only the operator's script can give it both (S11).
 *
 * The last active administrator's refusal, like every refusal, is the server's.
 */
const CONTROL = "min-h-11 rounded border border-slate-300 px-3 py-2 text-base disabled:opacity-60";

export function ActiveProfileActions({
  id,
  name,
  role,
  hasUsername,
}: {
  id: string;
  name: string;
  role: "ADMIN" | "YARD_STAFF";
  hasUsername: boolean;
}): JSX.Element {
  const [roleState, changeRole, changingRole] = useActionState(
    changeProfileRoleAction,
    INITIAL_PROFILE_FORM_STATE,
  );
  const [pinState, resetPin, resetting] = useActionState(resetProfilePinAction, INITIAL_NEW_PIN_STATE);
  const [deactivated, deactivate, deactivating] = useActionState(
    deactivateProfileAction,
    INITIAL_PROFILE_FORM_STATE,
  );
  const otherRole = role === "ADMIN" ? "YARD_STAFF" : "ADMIN";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <form action={changeRole}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="role" value={otherRole} />
          <button
            type="submit"
            data-testid={`make-${otherRole}-${id}`}
            disabled={changingRole}
            className={CONTROL}
          >
            {`Make ${otherRole}`}
          </button>
        </form>

        {/*
          One form per length, each carrying its length in a hidden field: a form action
          dispatched by React is handed the form's own fields, not the pressed button's
          name and value, so two buttons in one form could not say which length was meant.
        */}
        {hasUsername
          ? (["4", "6"] as const).map((length) => (
              <form key={length} action={resetPin}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="length" value={length} />
                <button
                  type="submit"
                  data-testid={`reset-${length}-${id}`}
                  disabled={resetting}
                  className={CONTROL}
                >
                  {`New ${length}-digit PIN`}
                </button>
              </form>
            ))
          : null}
      </div>
      <FormError testId={`role-error-${id}`} message={roleState.error} />
      <FormError testId={`reset-error-${id}`} message={pinState.error} />
      {pinState.newPin !== null && pinState.pinFor !== null ? (
        <NewPinNotice pin={pinState.newPin} name={pinState.pinFor} />
      ) : null}

      <details>
        <summary
          data-testid={`deactivate-open-${id}`}
          className="flex min-h-11 cursor-pointer items-center text-base text-red-800"
        >
          Deactivate…
        </summary>
        <form action={deactivate} className="flex flex-col gap-2 pt-2">
          <input type="hidden" name="id" value={id} />
          <p className="text-sm text-slate-700 [overflow-wrap:anywhere]">
            {`${name} will be signed out and can never sign in again. This cannot be undone.`}
          </p>
          <button
            type="submit"
            data-testid={`deactivate-${id}`}
            disabled={deactivating}
            className="min-h-11 self-start rounded bg-red-700 px-4 py-2 text-base font-medium text-white disabled:opacity-60"
          >
            Deactivate
          </button>
        </form>
      </details>
      <FormError testId={`deactivate-error-${id}`} message={deactivated.error} />
    </div>
  );
}
