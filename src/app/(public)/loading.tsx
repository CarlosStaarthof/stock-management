import type { JSX } from "react";

/**
 * The loading fallback for the PUBLIC segment (spec 002: "loading.tsx renders while a
 * segment suspends").
 *
 * It sits in a route group rather than at the root of `src/app/` on purpose. A
 * loading.tsx puts a Suspense boundary above every page beneath it, and once a boundary
 * has flushed the shell, a `redirect()` thrown later by a Server Component can no longer
 * be an HTTP 307 — Next has to finish the 200 and redirect from the browser instead.
 * The protected pages refuse a deactivated or unauthorised session with `redirect()`
 * (spec 003 AC-11, AC-15), and that refusal must be the server's answer, not a
 * suggestion the client is free to ignore. Spec 003 also states that loading is not
 * applicable to those pages: they fetch no data beyond the session.
 */
export default function Loading(): JSX.Element {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <p data-testid="loading" className="text-base text-slate-600">
        Loading…
      </p>
    </main>
  );
}
