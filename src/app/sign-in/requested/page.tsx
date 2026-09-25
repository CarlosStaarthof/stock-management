import Link from "next/link";
import type { JSX } from "react";

import { PROFILE_REQUEST_SENT } from "@/lib/auth-messages";

/**
 * Public. The one acknowledgement every accepted request sees (021 S2, AC-18, AC-19).
 *
 * It reads nothing — no query, no cookie, no database — so it is byte-identical for every
 * request, whatever username was asked for.
 */
export const dynamic = "force-dynamic";

export default function ProfileRequestedPage(): JSX.Element {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Request sent</h1>

      <p data-testid="profile-request-sent" role="status" className="text-base">
        {PROFILE_REQUEST_SENT}
      </p>

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
