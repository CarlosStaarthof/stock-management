"use client";

import { useFormStatus } from "react-dom";
import type { JSX } from "react";

/**
 * A submit control that disables itself while its form is in flight (006 AC-28), so a
 * double click writes one row and not two.
 *
 * A Client Component only because `useFormStatus` needs one, and pushed as far down the
 * tree as it goes (docs/conventions.md): it reads the status of the `<form>` above it, so
 * a Server Component can render the form itself and still get a pending state.
 */
export function SubmitButton({
  children,
  testId,
  tone = "primary",
  title,
}: {
  children: string;
  testId?: string;
  tone?: "primary" | "secondary" | "danger";
  title?: string;
}): JSX.Element {
  const { pending } = useFormStatus();

  const palette = {
    primary: "bg-slate-900 text-white hover:bg-slate-700",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  }[tone];

  return (
    <button
      type="submit"
      data-testid={testId}
      title={title}
      disabled={pending}
      aria-busy={pending}
      className={`inline-flex min-h-11 items-center justify-center rounded px-3 py-2 text-sm font-medium disabled:opacity-60 ${palette}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
