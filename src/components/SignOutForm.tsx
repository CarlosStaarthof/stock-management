import type { JSX } from "react";

/**
 * Presentational: it is handed the action and renders a button. Signing out is a POST,
 * not a link, so it cannot be triggered from someone elses image tag.
 *
 * At least 44 px tall, like every other control a gloved thumb has to hit (021 C2-2, AC-35).
 * Only its height changed, so it widens no page.
 */
export function SignOutForm({ action }: { action: () => Promise<void> }): JSX.Element {
  return (
    <form action={action}>
      <button
        type="submit"
        data-testid="sign-out"
        className="inline-flex min-h-11 items-center rounded border border-slate-300 px-3 py-2 text-sm"
      >
        Sign out
      </button>
    </form>
  );
}
