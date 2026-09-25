"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { JSX } from "react";

import { requestProfileAction } from "@/app/sign-in/create/actions";
import { INITIAL_CREATE_PROFILE_STATE } from "@/app/sign-in/create/form-state";
import { useForgetOnHide } from "@/components/use-forget-on-hide";

/**
 * *Create profile* (021 D2, UI states, AC-18, AC-35, AC-36): a name, a username, and a PIN
 * typed twice.
 *
 * It decides nothing. Every refusal is the server's, with one message from the messages
 * module, so the browser never refuses something the server would accept or the reverse.
 * It works with JavaScript disabled: the action is a server action, and the form posts.
 *
 * Both PINs live in component state only — never in storage, a cookie or the URL — and are
 * emptied after every refusal, when the page is hidden and when it is restored from the
 * back-forward cache. The name and the username are uncontrolled and keyed on the attempt,
 * so a field error shows again what was typed there.
 */
const FIELD_CLASS = "min-h-11 w-full rounded border border-slate-300 px-3 py-3 text-base";

function SendButton(): JSX.Element {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid="create-profile-submit"
      disabled={pending}
      className="min-h-11 w-full rounded bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send for approval"}
    </button>
  );
}

export function CreateProfileForm(): JSX.Element {
  const [state, formAction] = useActionState(requestProfileAction, INITIAL_CREATE_PROFILE_STATE);
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");

  const forget = useCallback((): void => {
    setPin("");
    setPinAgain("");
  }, []);

  useEffect(() => {
    forget();
  }, [state.attempt, forget]);

  useForgetOnHide(forget);

  return (
    <form action={formAction} autoComplete="off" className="flex w-full flex-col gap-4">
      {state.error === null ? null : (
        <p
          data-testid="create-profile-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="name">
        Your name
        <input
          key={`name-${state.attempt}`}
          id="name"
          name="name"
          type="text"
          autoComplete="off"
          defaultValue={state.name}
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="requestedUsername">
        Username
        <input
          key={`username-${state.attempt}`}
          id="requestedUsername"
          name="requestedUsername"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          defaultValue={state.username}
          className={FIELD_CLASS}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="pin">
        PIN
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className={`${FIELD_CLASS} tracking-widest`}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="pinAgain">
        PIN again
        <input
          id="pinAgain"
          name="pinAgain"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pinAgain}
          onChange={(event) => setPinAgain(event.target.value)}
          className={`${FIELD_CLASS} tracking-widest`}
        />
      </label>

      <SendButton />
    </form>
  );
}
