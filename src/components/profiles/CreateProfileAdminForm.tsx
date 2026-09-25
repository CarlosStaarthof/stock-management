"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { JSX } from "react";

import { createProfileAction } from "@/app/profiles/actions";
import { INITIAL_CREATE_PROFILE_ADMIN_STATE } from "@/app/profiles/form-state";
import { FormError } from "@/components/profiles/FormError";
import { NewPinNotice } from "@/components/profiles/NewPinNotice";

/**
 * An `ADMIN` creates a profile directly (021 AC-25): a name, a username, a role (`ADMIN`
 * included) and the length of the PIN the server draws. The PIN is shown once, exactly as a
 * reset's is. Nobody types a PIN here: a PIN an administrator chose is one somebody else
 * knows.
 *
 * After a refusal the name and username are kept; after a creation the form is empty.
 */
const FIELD = "min-h-11 w-full min-w-0 rounded border border-slate-300 px-3 py-2 text-base";

function CreateButton(): JSX.Element {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid="create-profile-admin-submit"
      disabled={pending}
      className="min-h-11 self-start rounded bg-slate-900 px-4 py-2 text-base font-medium text-white disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create profile"}
    </button>
  );
}

export function CreateProfileAdminForm(): JSX.Element {
  const [state, create] = useActionState(createProfileAction, INITIAL_CREATE_PROFILE_ADMIN_STATE);

  return (
    <div className="flex flex-col gap-2">
      <form action={create} autoComplete="off" className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="create-name">
          Name
          <input
            key={`name-${state.attempt}`}
            id="create-name"
            name="name"
            type="text"
            autoComplete="off"
            defaultValue={state.name}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="create-username">
          Username
          <input
            key={`username-${state.attempt}`}
            id="create-username"
            name="username"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            defaultValue={state.username}
            className={FIELD}
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="create-role">
            Role
            <select id="create-role" name="role" defaultValue="YARD_STAFF" className={FIELD}>
              <option value="YARD_STAFF">YARD_STAFF</option>
              <option value="ADMIN">ADMIN</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="create-length">
            PIN length
            <select id="create-length" name="length" defaultValue="6" className={FIELD}>
              <option value="6">6 digits</option>
              <option value="4">4 digits</option>
            </select>
          </label>
        </div>
        <CreateButton />
      </form>
      <FormError testId="create-profile-admin-error" message={state.error} />
      {state.newPin !== null && state.pinFor !== null ? (
        <NewPinNotice pin={state.newPin} name={state.pinFor} />
      ) : null}
    </div>
  );
}
