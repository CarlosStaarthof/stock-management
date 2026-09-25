import { redirect } from "next/navigation";

import { SIGN_IN_PATH } from "@/lib/auth-config";
import { getCurrentUser, requireRole } from "@/server/auth/session";
import type { SessionUser } from "@/server/auth/session-user";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

/**
 * The page-shaped face of `src/server/auth/session.ts`: the same two services, with the
 * redirect a browser expects instead of a thrown error.
 *
 * A request only reaches a protected page when the middleware saw a session token, so
 * `getCurrentUser()` returning null here means the row is gone, is no longer ACTIVE, or its
 * PIN was reset since the session began (021 AC-17) — which is why the redirect says
 * `reason=inactive`, and the sign-in page says the session has ended (003 AC-11).
 */
export async function requireUserPage(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user === null) {
    redirect(`${SIGN_IN_PATH}?reason=inactive`);
  }
  return user;
}

/**
 * `deniedKey` names the page that was refused, so `/stock-entry` can say which one.
 * The refusal itself is `requireRole`'s, not this function's (AC-16).
 */
export async function requireAdminPage(deniedKey: string): Promise<SessionUser> {
  try {
    return await requireRole("ADMIN");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      redirect(`/stock-entry?denied=${encodeURIComponent(deniedKey)}`);
    }
    if (error instanceof UnauthorizedError) {
      redirect(`${SIGN_IN_PATH}?reason=inactive`);
    }
    throw error;
  }
}
