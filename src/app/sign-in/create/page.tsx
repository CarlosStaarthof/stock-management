import Link from "next/link";
import type { JSX } from "react";

import { CreateProfileForm } from "@/components/CreateProfileForm";

/**
 * Public. *Create profile* (021 D2, D3): anyone may ask for a profile, and an `ADMIN`
 * approves it. The page says nothing about any username or PIN (S2, AC-19).
 *
 * A single column with full-width controls, every one at least 44 px tall, so a phone at
 * 390 or 320 px never scrolls sideways (AC-35).
 */
export const dynamic = "force-dynamic";

export default function CreateProfilePage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Create profile</h1>

      <CreateProfileForm />

      <Link
        href="/sign-in"
        data-testid="back-to-sign-in"
        prefetch={false}
        className="inline-flex min-h-11 items-center justify-center rounded border border-slate-300 px-4 py-2 text-base"
      >
        Sign in
      </Link>
    </main>
  );
}
