import { notFound } from "next/navigation";
import type { JSX } from "react";

import { SetupForm } from "@/components/SetupForm";
import { setupAvailable } from "@/server/auth/setup-service";

/**
 * Public, and only while the data says so (021 S9, AC-27): no profile holds the `ADMIN`
 * role, `SETUP_CODE` is set to at least 16 characters and `PIN_PEPPER` is usable. Otherwise
 * it answers `404`, exactly as an address that never existed. Nothing links here.
 *
 * Decided on every request: nothing records that setup happened.
 */
export const dynamic = "force-dynamic";

export default async function SetupPage(): Promise<JSX.Element> {
  if (!(await setupAvailable())) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Set up Macroads Stock</h1>
      <SetupForm />
    </main>
  );
}
