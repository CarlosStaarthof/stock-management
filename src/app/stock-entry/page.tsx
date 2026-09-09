import type { JSX } from "react";

import { signOutAction } from "@/app/auth-actions";
import { requireUserPage } from "@/app/page-guards";
import { SignOutForm } from "@/components/SignOutForm";
import { ACCESS_DENIED_MESSAGE } from "@/lib/auth-messages";

/**
 * PLACEHOLDER — feature #8 stock_entry_ui replaces this page. It exists so that
 * landing-by-role is observable today. It renders its own name, the signed-in user's
 * email and a sign-out control, and nothing else.
 *
 * It also carries the refusal message for an ADMIN-only page, because this is where a
 * YARD_STAFF user is sent when they ask for one (AC-15).
 */
export const dynamic = "force-dynamic";

export default async function StockEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const user = await requireUserPage();
  const denied = (await searchParams).denied;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Stock Entry</h1>

      {denied === undefined ? null : (
        <p
          data-testid="access-denied"
          role="alert"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {ACCESS_DENIED_MESSAGE}
        </p>
      )}

      <p data-testid="signed-in-email" className="text-base text-slate-700">
        {user.email}
      </p>

      <SignOutForm action={signOutAction} />
    </main>
  );
}
