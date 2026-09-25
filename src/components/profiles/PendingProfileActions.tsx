"use client";

import { useActionState } from "react";
import type { JSX } from "react";

import { approveProfileAction, rejectProfileAction } from "@/app/profiles/actions";
import { INITIAL_PROFILE_FORM_STATE } from "@/app/profiles/form-state";
import { FormError } from "@/components/profiles/FormError";

/**
 * A request's two actions (021 AC-21): approve — with the requested username pre-filled,
 * which the `ADMIN` may change, and a role the `ADMIN` chooses — or reject.
 *
 * It decides nothing: a taken username, a malformed one or a request that is no longer
 * waiting is the server's refusal, rendered beside the form it concerns.
 */
const CONTROL = "min-h-11 rounded border border-slate-300 px-3 py-2 text-base disabled:opacity-60";

export function PendingProfileActions({
  id,
  requestedUsername,
}: {
  id: string;
  requestedUsername: string;
}): JSX.Element {
  const [approved, approve, approving] = useActionState(approveProfileAction, INITIAL_PROFILE_FORM_STATE);
  const [rejected, reject, rejecting] = useActionState(rejectProfileAction, INITIAL_PROFILE_FORM_STATE);

  return (
    <div className="flex flex-col gap-2">
      <form action={approve} autoComplete="off" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} />
        <label
          className="flex min-w-0 flex-1 basis-48 flex-col gap-1 text-sm font-medium"
          htmlFor={`approve-username-${id}`}
        >
          Username
          <input
            key={`username-${approved.attempt}`}
            id={`approve-username-${id}`}
            data-testid={`approve-username-${id}`}
            name="username"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            defaultValue={requestedUsername}
            className={`${CONTROL} w-full min-w-0`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor={`approve-role-${id}`}>
          Role
          <select
            id={`approve-role-${id}`}
            data-testid={`approve-role-${id}`}
            name="role"
            defaultValue="YARD_STAFF"
            className={CONTROL}
          >
            <option value="YARD_STAFF">YARD_STAFF</option>
            <option value="ADMIN">ADMIN</option>
          </select>
        </label>
        <button
          type="submit"
          data-testid={`approve-${id}`}
          disabled={approving}
          className="min-h-11 rounded bg-slate-900 px-4 py-2 text-base font-medium text-white disabled:opacity-60"
        >
          Approve
        </button>
      </form>
      <FormError testId={`approve-error-${id}`} message={approved.error} />

      <form action={reject}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" data-testid={`reject-${id}`} disabled={rejecting} className={CONTROL}>
          Reject
        </button>
      </form>
      <FormError testId={`reject-error-${id}`} message={rejected.error} />
    </div>
  );
}
