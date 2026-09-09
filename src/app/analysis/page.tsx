import type { JSX } from "react";

import { signOutAction } from "@/app/auth-actions";
import { requireAdminPage } from "@/app/page-guards";
import { SignOutForm } from "@/components/SignOutForm";

/**
 * PLACEHOLDER — feature #11 analysis replaces this page. Today it demonstrates one
 * thing: role refusal. The refusal comes from requireRole("ADMIN") in the service layer,
 * so removing the middleware entry would not expose it (AC-16).
 */
export const dynamic = "force-dynamic";

export default async function AnalysisPage(): Promise<JSX.Element> {
  const user = await requireAdminPage("analysis");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>

      <p data-testid="signed-in-email" className="text-base text-slate-700">
        {user.email}
      </p>

      <SignOutForm action={signOutAction} />
    </main>
  );
}
