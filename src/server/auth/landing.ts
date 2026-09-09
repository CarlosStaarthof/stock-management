import type { Role } from "@/server/auth/roles";

/**
 * Where each role lands after signing in — `specs/domain-model.md` Part 6:
 * YARD_STAFF counts, so counting starts in one tap; ADMIN approves, so the first thing
 * an administrator sees is what needs approving.
 *
 * Pure, and deliberately total over the union: adding a third role would be a type error
 * here rather than a silent redirect to the wrong screen.
 */
export type LandingPath = "/stock-entry" | "/stock-takes";

const LANDING_BY_ROLE: Record<Role, LandingPath> = {
  YARD_STAFF: "/stock-entry",
  ADMIN: "/stock-takes",
};

export function landingPathForRole(role: Role): LandingPath {
  return LANDING_BY_ROLE[role];
}
