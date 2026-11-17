import { describe, expect, it } from "vitest";

import { landingPathForRole } from "@/server/auth/landing";
import { ROLES } from "@/server/auth/roles";

describe("landingPathForRole", () => {
  it("022 AC-4: YARD_STAFF lands on /home", () => {
    expect(landingPathForRole("YARD_STAFF")).toBe("/home");
  });

  it("022 AC-4: ADMIN lands on /home", () => {
    expect(landingPathForRole("ADMIN")).toBe("/home");
  });

  it("022 AC-4: SUPER_ADMIN lands on /home", () => {
    expect(landingPathForRole("SUPER_ADMIN")).toBe("/home");
  });

  it("022 AC-4: it is pure and total — every role has the same home landing", () => {
    for (const role of ROLES) {
      expect(landingPathForRole(role)).toBe("/home");
      expect(landingPathForRole(role)).toBe(landingPathForRole(role));
    }
  });
});
