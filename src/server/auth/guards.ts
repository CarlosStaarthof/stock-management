import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import { isAdminOrAbove, type Role } from "@/server/auth/roles";
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

/**
 * The administrator gate, and the only one a service should use for an admin surface:
 * `ADMIN` and `SUPER_ADMIN` pass, `YARD_STAFF` does not (022 AC-1, AC-7). The message is
 * unchanged so every existing refusal still names ADMIN.
 */
export function assertAdminOrAbove(user: SessionUser | null): SessionUser {
  const current = assertUser(user);
  if (!isAdminOrAbove(current.role)) {
    throw new ForbiddenError("ADMIN is required for this action");
  }
  return current;
}
