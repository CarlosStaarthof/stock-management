import type { Role } from "@/server/auth/roles";

/**
 * What a signed-in profile looks like everywhere above `src/server/auth/`.
 *
 * There is deliberately no PIN hash, no pepper fingerprint and no epoch on it: a route
 * handler that forwards a service result cannot leak what it was never given (spec 003
 * AC-20, 021 AC-33). `username` is the stored, lower-case one; `name` is the display name.
 */
export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: Role;
};

/** The columns `toSessionUser` needs. Narrower than the Prisma row on purpose. */
type UserRow = {
  id: string;
  username: string;
  name: string;
  role: Role;
};

/**
 * The one place a database row becomes a `SessionUser`. Every field is copied by name,
 * so adding a column to `User` never widens what leaves this layer.
 */
export function toSessionUser(row: UserRow): SessionUser {
  return { id: row.id, username: row.username, name: row.name, role: row.role };
}
