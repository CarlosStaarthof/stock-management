import type { JSX } from "react";

/** Rendered for an unknown route. Next serves it with HTTP 404. */
export default function NotFound(): JSX.Element {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p data-testid="not-found" className="text-base text-slate-700">
        That page does not exist in Macroads Stock.
      </p>
    </main>
  );
}
