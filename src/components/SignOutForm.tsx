import type { JSX } from "react";

/**
 * Presentational: it is handed the action and renders a button. Signing out is a POST,
 * not a link, so it cannot be triggered from someone elses image tag.
 */
export function SignOutForm({ action }: { action: () => Promise<void> }): JSX.Element {
  return (
    <form action={action}>
      <button
        type="submit"
        data-testid="sign-out"
        className="rounded border border-slate-300 px-3 py-2 text-sm"
      >
        Sign out
      </button>
    </form>
  );
}
