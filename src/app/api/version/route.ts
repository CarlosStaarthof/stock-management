import { NextResponse } from "next/server";

/**
 * Which commit is being served (spec 016 AC-12, D13). Public, so the live check can prove
 * that what is live is what was gated; the repository is private, so the hash gives an
 * outsider nothing to use.
 *
 * It reads one thing, the commit Vercel built, and answers `null` for anything that is not
 * a full lower-case commit hash. So an unset variable, or one carrying anything else, is
 * never echoed back. It reads no database, no cookie, no header and no other setting, and
 * it is not under `PROTECTED_PATHS`.
 */
export const dynamic = "force-dynamic";

const FULL_COMMIT = /^[0-9a-f]{40}$/;

export function GET(): NextResponse {
  const built = process.env.VERCEL_GIT_COMMIT_SHA;
  const commit = typeof built === "string" && FULL_COMMIT.test(built) ? built : null;

  return NextResponse.json({ commit }, { headers: { "Cache-Control": "no-store" } });
}
