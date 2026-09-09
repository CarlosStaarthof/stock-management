import { logWarn } from "@/lib/log";
import { assertRole, assertUser } from "@/server/auth/guards";
import { auth } from "@/server/auth/next-auth";
import type { Role } from "@/server/auth/roles";
import type { SessionUser } from "@/server/auth/session-user";
import { findActiveUserById } from "@/server/auth/user-service";

/**
 * Who is making this request?
 *
 * The session token says only *which* user id signed in. The role, the name and the
 * right to be here are read from the `User` row on every request, so:
 *
 *  - deactivating a leaver locks them out on their very next request rather than when
 *    their token expires (AC-11), and
 *  - nothing a client can set — a query parameter, a header, a cookie, a form field —
 *    can influence the answer (AC-18).
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  let userId: string | undefined;

  try {
    const session = await auth();
    userId = session?.user?.id;
  } catch (error) {
    // A missing or unusable AUTH_SECRET degrades to "not signed in", never to access
    // (AC-22). Fail closed, and say so.
    logWarn("auth.session_unreadable", {
      reason: error instanceof Error ? error.name : "unknown",
    });
    return null;
  }

  if (typeof userId !== "string" || userId === "") return null;

  return findActiveUserById(userId);
}

/** The current user, or `UnauthorizedError`. */
export async function requireUser(): Promise<SessionUser> {
  return assertUser(await getCurrentUser());
}

/**
 * The current user when they hold `role`; `ForbiddenError` when they do not, and
 * `UnauthorizedError` when there is no session at all. Both `/api/users` and `/analysis`
 * go through this, so removing the middleware entry alone exposes neither (AC-16).
 */
export async function requireRole(role: Role): Promise<SessionUser> {
  return assertRole(await getCurrentUser(), role);
}
