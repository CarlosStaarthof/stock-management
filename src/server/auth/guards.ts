import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import type { Role } from "@/server/auth/roles";
import type { SessionUser } from "@/server/auth/session-user";

/**
 * The decisions `requireUser` and `requireRole` make, separated from how the current
 * user is obtained. Pure, so all three paths of AC-16 are unit-testable with no database
 * and no request — and so the refusal cannot differ between a page and a route handler.
 */

export function assertUser(user: SessionUser | null): SessionUser {
  if (user === null) {
    throw new UnauthorizedError();
  }
  return user;
}

export function assertRole(user: SessionUser | null, role: Role): SessionUser {
  const current = assertUser(user);
  if (current.role !== role) {
    throw new ForbiddenError(`${role} is required for this action`);
  }
  return current;
}
