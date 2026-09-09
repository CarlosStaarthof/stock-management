import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { baseAuthConfig, PROTECTED_PATHS, SIGN_IN_PATH } from "@/lib/auth-config";

/**
 * Route protection at the edge: a signed-out request never reaches a protected page, so
 * none of its content is sent (spec 003 AC-12).
 *
 * This file imports NOTHING from `@prisma/client` and nothing that does — that is why
 * `baseAuthConfig` is a separate, provider-free module (AC-31). The token is only asked
 * "is there a session?"; the role and the right to be here are decided server-side, from
 * the database, by `src/server/auth/session.ts`.
 */
const { auth } = NextAuth(baseAuthConfig);

function isProtected(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

export default auth((request: NextRequest & { auth: unknown }) => {
  const { pathname, search } = request.nextUrl;

  if (!isProtected(pathname)) return NextResponse.next();
  if (request.auth !== null && request.auth !== undefined) return NextResponse.next();

  const signIn = new URL(SIGN_IN_PATH, request.nextUrl.origin);
  // URLSearchParams percent-encodes the path, so the query is ?callbackUrl=%2Fstock-entry
  signIn.searchParams.set("callbackUrl", `${pathname}${search}`);

  return NextResponse.redirect(signIn);
});

// Matcher patterns must be static literals — Next reads them at build time.
export const config = {
  matcher: ["/stock-entry/:path*", "/stock-takes/:path*", "/analysis/:path*"],
};
