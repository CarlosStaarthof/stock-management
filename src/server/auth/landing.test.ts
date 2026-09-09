import { describe, expect, it } from "vitest";

import { landingPathForRole } from "@/server/auth/landing";
import { ROLES } from "@/server/auth/roles";

describe("landingPathForRole", () => {
  it("AC-14: YARD_STAFF lands on /stock-entry", () => {
    expect(landingPathForRole("YARD_STAFF")).toBe("/stock-entry");
  });

  it("AC-14: ADMIN lands on /stock-takes", () => {
    expect(landingPathForRole("ADMIN")).toBe("/stock-takes");
  });

  it("AC-14: it is pure — every role has a landing path and repeats it", () => {
    for (const role of ROLES) {
      expect(landingPathForRole(role)).toBe(landingPathForRole(role));
      expect(landingPathForRole(role)).toMatch(/^\/(stock-entry|stock-takes)$/);
    }

    // The two roles do not share a landing path; Part 6 gives them different screens.
    expect(landingPathForRole("YARD_STAFF")).not.toBe(landingPathForRole("ADMIN"));
  });
})
