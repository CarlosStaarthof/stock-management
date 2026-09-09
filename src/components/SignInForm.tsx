"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { JSX } from "react";

import { signInAction } from "@/app/auth-actions";
import { INITIAL_SIGN_IN_STATE } from "@/app/sign-in/form-state";

/**
 * The sign-in form. A Client Component only because the three UI states the spec names —
 * empty, pending, error — need `useActionState` and `useFormStatus`. It still works with
 * JavaScript disabled: the action is a server action, so the form posts (see
 * docs/conventions.md, "Forms are progressive").
 *
 * It never decides anything about the user. It posts two fields and renders what the
 * server sends back.
 */
function SubmitButton(): JSX.Element {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid="sign-in-submit"
      disabled={pending}
      className="w-full rounded bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60"
    >
      {pending ? "Signing in…" : "Sign in"}
    </button>
  );
}

export function SignInForm({ callbackUrl }: { callbackUrl?: string }): JSX.Element {
  const [state, formAction] = useActionState(signInAction, INITIAL_SIGN_IN_STATE);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
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

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="email">
        Email
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={state.email}
          className="w-full rounded border border-slate-300 px-3 py-3 text-base"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="password">
        Password
        <input
          key={state.attempt}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded border border-slate-300 px-3 py-3 text-base"
        />
      </label>

      <SubmitButton />
    </form>
  );
}
