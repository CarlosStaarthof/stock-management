import type { JSX } from "react";

import { signOutAction } from "@/app/auth-actions";
import { requireUserPage } from "@/app/page-guards";
import { SignOutForm } from "@/components/SignOutForm";

/**
 * PLACEHOLDER — feature #10 stock_takes_history replaces this page.
 *
 * Both roles reach it: specs/domain-model.md Part 6 makes Stock Takes money-free and
 * common to both, one version of the screen rather than two.
 */
export const dynamic = "force-dynamic";

export default async function StockTakesPage(): Promise<JSX.Element> {
  const user = await requireUserPage();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Stock Takes</h1>

      <p data-testid="signed-in-email" className="text-base text-slate-700">
        {user.email}
      </p>

      <SignOutForm action={signOutAction} />
    </main>
  );
}
