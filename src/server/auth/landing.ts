import type { Role } from "@/server/auth/roles";

/**
 * Where each role lands after signing in — feature #22 D3: every role lands on the one
 * home menu, and chooses a section from there. The calendar is no longer an automatic
 * landing.
 *
 * Pure, and deliberately total over the union: adding a fourth role without deciding its
 * landing is a type error here rather than a silent redirect to the wrong screen.
 */
export type LandingPath = "/home";

const LANDING_BY_ROLE: Record<Role, LandingPath> = {
  YARD_STAFF: "/home",
  ADMIN: "/home",
  SUPER_ADMIN: "/home",
};

export function landingPathForRole(role: Role): LandingPath {
  return LANDING_BY_ROLE[role];
}
