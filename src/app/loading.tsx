import type { JSX } from "react";

/** Rendered while a segment suspends. Every screen states its loading case explicitly. */
export default function Loading(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <p data-testid="loading" className="text-base text-slate-600">
        Loading…
      </p>
    </main>
  );
}
