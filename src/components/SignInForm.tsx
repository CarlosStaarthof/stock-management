"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import type { JSX } from "react";

import { signInAction } from "@/app/auth-actions";
import { INITIAL_SIGN_IN_STATE } from "@/app/sign-in/form-state";
import { PinPad } from "@/components/PinPad";

/**
 * The sign-in form: a username typed once, and a PIN (021 AC-9, AC-35, AC-36).
 *
 * A Client Component for the keypad and for the three UI states — empty, pending, error.
 * It still works with JavaScript disabled: the action is a server action, so the form
 * posts, and with no script the keypad is simply not rendered.
 *
 * It never decides anything about the user. It posts two fields and renders what the
 * server sends back.
 *
 * A half-typed PIN is never kept (AC-36). The PIN lives in component state only — never in
 * storage, a cookie or the URL — and is emptied when the page is hidden, when it is
 * restored from the back-forward cache, and after every attempt. Nothing is asked of the
 * browser's own memory either: both fields are `autocomplete="off"`.
 */
function SubmitKey({ inPad }: { inPad: boolean }): JSX.Element {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid="sign-in-submit"
      disabled={pending}
      className={
        inPad
          ? "flex min-h-14 min-w-11 items-center justify-center rounded bg-slate-900 px-2 text-base font-medium text-white disabled:opacity-60"
          : "min-h-11 w-full rounded bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
      }
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function SignInForm({ callbackUrl }: { callbackUrl?: string }): JSX.Element {
  const [state, formAction] = useActionState(signInAction, INITIAL_SIGN_IN_STATE);
  const [pin, setPin] = useState("");
  const [enhanced, setEnhanced] = useState(false);

  // Rendered on the server and before hydration without the keypad, so a browser with no
  // JavaScript never shows keys that could not work.
  useEffect(() => {
    setEnhanced(true);
  }, []);

  // After every attempt the PIN field is empty; the username stays (UI states).
  useEffect(() => {
    setPin("");
  }, [state.attempt]);

  useEffect(() => {
    const forget = (): void => setPin("");
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") forget();
    };
    const onPageShow = (event: PageTransitionEvent): void => {
      if (event.persisted) forget();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  return (
    <form action={formAction} autoComplete="off" className="flex w-full flex-col gap-4">
      {state.error === null ? null : (
        <p
          data-testid="sign-in-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      {callbackUrl === undefined ? null : (
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="username">
        Username
        <input
          // Keyed on the attempt so the server's echo of what was typed is shown again.
          key={`username-${state.attempt}`}
          id="username"
          name="username"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          defaultValue={state.username}
          className="min-h-11 w-full rounded border border-slate-300 px-3 py-3 text-base"
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
          required
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className="min-h-11 w-full rounded border border-slate-300 px-3 py-3 text-base tracking-widest"
        />
      </label>

      {enhanced ? (
        <PinPad
          onDigit={(digit) => setPin((current) => current + digit)}
          onDelete={() => setPin((current) => current.slice(0, -1))}
          submit={<SubmitKey inPad />}
        />
      ) : (
        <SubmitKey inPad={false} />
      )}
    </form>
  );
}
