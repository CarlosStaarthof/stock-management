"use client";

import type { JSX } from "react";

/**
 * The route-segment error boundary. It is a Client Component because Next requires the
 * reset handler to run in the browser — the one place in this feature where a component
 * may not be a Server Component.
 *
 * The message is shown, never swallowed (docs/conventions.md).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Something went wrong</h1>
      <p data-testid="error-message" className="text-base text-slate-700">
        {error.message}
      </p>
      <button
        type="button"
        onClick={reset}
        className="w-fit rounded border border-slate-300 px-3 py-2 text-sm"
      >
        Try again
      </button>
    </main>
  );
}
