/**
 * The two roles of `specs/domain-model.md` Part 6, declared as a plain string union
 * rather than imported from `@prisma/client`.
 *
 * Why not import Prisma's generated `Role`? Because `src/middleware.ts` runs on the edge
 * runtime and must not pull `@prisma/client` in (spec 003 AC-31), and because the sign-in
 * page needs the type too. The union is structurally identical to the generated enum, so
 * a value from the database assigns to it without a cast.
 */

export const ROLES = ["YARD_STAFF", "ADMIN"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
