import type { JSX } from "react";

import { SignInForm } from "@/components/SignInForm";
import { INACTIVE_ACCOUNT_MESSAGE } from "@/lib/auth-messages";

/**
 * Public. Renders the form and, when the server sent the user here because their account
 * was deactivated, says so (AC-11).
 *
 * The layout is a single column with full-width controls, so a 390 px phone never scrolls
 * sideways (AC-32).
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

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>

      {reason === "inactive" ? (
        <p
          data-testid="inactive-message"
          role="alert"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {INACTIVE_ACCOUNT_MESSAGE}
        </p>
      ) : null}

      <SignInForm callbackUrl={callbackUrl} />
    </main>
  );
}
