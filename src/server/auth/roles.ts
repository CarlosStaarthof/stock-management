/**
 * The roles of `specs/domain-model.md` Part 6, extended by feature #22 (D1), declared as a
 * plain string union rather than imported from `@prisma/client`.
 *
 * Why not import Prisma's generated `Role`? Because `src/middleware.ts` runs on the edge
 * runtime and must not pull `@prisma/client` in (spec 003 AC-31), and because the sign-in
 * page needs the type too. The union is structurally identical to the generated enum, so
 * a value from the database assigns to it without a cast.
 *
 * `isAdminOrAbove` is the ONE spelling of the hierarchy (022 AC-1). Every administrator
 * surface asks this predicate rather than comparing a role itself.
 */

export const ROLES = ["YARD_STAFF", "ADMIN", "SUPER_ADMIN"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** True for ADMIN and SUPER_ADMIN; false for YARD_STAFF. */
export function isAdminOrAbove(role: Role): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}
