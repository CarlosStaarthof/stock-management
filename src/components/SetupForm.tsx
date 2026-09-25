"use client";

import { useActionState, useCallback, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { JSX } from "react";

import { setupAction } from "@/app/setup/actions";
import { INITIAL_SETUP_STATE } from "@/app/setup/form-state";
import { useForgetOnHide } from "@/components/use-forget-on-hide";

/**
 * First-run setup's form (021 S9, UI states): the setup code, then the first
 * administrator's name, username and PIN typed twice.
 *
 * The setup code and both PINs live in component state only and are emptied after every
 * outcome, when the page is hidden and when it is restored from the back-forward cache.
 * The code is never rendered back: the server returns no copy of it (AC-28).
 */
const FIELD_CLASS = "min-h-11 w-full rounded border border-slate-300 px-3 py-3 text-base";

function CreateButton(): JSX.Element {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid="setup-submit"
      disabled={pending}
      className="min-h-11 w-full rounded bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
    >
      {pending ? "Creating…" : "Create administrator"}
    </button>
  );
}

export function SetupForm(): JSX.Element {
  const [state, formAction] = useActionState(setupAction, INITIAL_SETUP_STATE);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [pinAgain, setPinAgain] = useState("");

  const forget = useCallback((): void => {
    setCode("");
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
          data-testid="setup-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="setupCode">
        Setup code
        <input
          id="setupCode"
          name="setupCode"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          className={FIELD_CLASS}
        />
      </label>

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

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="username">
        Username
        <input
          key={`username-${state.attempt}`}
          id="username"
          name="username"
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

      <CreateButton />
    </form>
  );
}
