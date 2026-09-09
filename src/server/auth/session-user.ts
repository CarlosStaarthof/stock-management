import type { Role } from "@/server/auth/roles";

/**
 * What a signed-in user looks like everywhere above `src/server/auth/`.
 *
 * There is deliberately no `passwordHash` on it: a route handler that forwards a service
 * result cannot leak a hash it was never given (spec 003 AC-20).
 */
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/** The columns `toSessionUser` needs. Narrower than the Prisma row on purpose. */
type UserRow = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

/**
 * The one place a database row becomes a `SessionUser`. Every field is copied by name,
 * so adding a column to `User` never widens what leaves this layer.
 */
export function toSessionUser(row: UserRow): SessionUser {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}
