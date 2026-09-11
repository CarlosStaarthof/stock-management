"use client";

import { useFormStatus } from "react-dom";
import type { JSX } from "react";

/**
 * The *Start count* control, disabled while its form is in flight (AC-26).
 *
 * A double tap on a cold phone therefore writes ONE count, not two — and the second would
 * be refused by AC-10's unique constraint anyway, so this is the courtesy and that is the
 * guarantee.
 *
 * A Client Component only because `useFormStatus` needs one, and pushed as far down the
 * tree as it goes (`docs/conventions.md`): it reads the status of the `<form>` above it,
 * so a Server Component can render the form itself and still get a pending state.
 *
 * `min-h-11` and `min-w-11` are 44 px, which is AC-28's tap target.
 */
export function StartCountButton({
  children,
  testId,
}: {
  children: string;
  testId: string;
}): JSX.Element {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      data-testid={testId}
      disabled={pending}
      aria-busy={pending}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded bg-slate-900 px-4 py-2 text-base font-medium text-white hover:bg-slate-700 disabled:opacity-60"
    >
      {pending ? "Working…" : children}
    </button>
  );
}
