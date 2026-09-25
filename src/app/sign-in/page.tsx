import Link from "next/link";
import type { JSX } from "react";

import { SignInForm } from "@/components/SignInForm";
import { SESSION_ENDED_MESSAGE, SETUP_COMPLETE_MESSAGE } from "@/lib/auth-messages";

/**
 * Public. A username and a PIN (021 D1, D8), and a link to ask for a profile (D2).
 *
 * It renders one of two notices from the query: the session ended (a deactivation, or a PIN
 * reset, refused it on its last request — AC-17, AC-23), or first-run setup has just
 * created the administrator (AC-28). Neither says anything about any username.
 *
 * The layout is a single column with full-width controls, so a phone at 390 or 320 px
 * never scrolls sideways (AC-35).
 */
export const dynamic = "force-dynamic";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const params = await searchParams;
  const callbackUrl = firstValue(params.callbackUrl);
  const reason = firstValue(params.reason);
  const setup = firstValue(params.setup);

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>

      {reason === "inactive" ? (
        <p
          data-testid="inactive-message"
          role="alert"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {SESSION_ENDED_MESSAGE}
        </p>
      ) : null}

      {setup === "done" ? (
        <p
          data-testid="setup-complete"
          role="status"
          className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {SETUP_COMPLETE_MESSAGE}
        </p>
      ) : null}

      <SignInForm callbackUrl={callbackUrl} />

      <Link
        href="/sign-in/create"
        data-testid="create-profile-link"
        prefetch={false}
        className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 px-4 py-2 text-base"
      >
        Create profile
      </Link>
    </main>
  );
}
