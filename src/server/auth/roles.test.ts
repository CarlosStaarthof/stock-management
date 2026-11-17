import { describe, expect, it } from "vitest";

import { isAdminOrAbove, isRole, ROLES, type Role } from "@/server/auth/roles";

describe("ROLES", () => {
  it("022 AC-1: the union is exactly the schema's three labels, in order", () => {
    expect([...ROLES]).toEqual(["YARD_STAFF", "ADMIN", "SUPER_ADMIN"]);
  });
});

describe("isRole", () => {
  it("022 AC-1: accepts each of the three labels", () => {
    for (const role of ROLES) {
      expect(isRole(role)).toBe(true);
    }
  });

  it("022 AC-1: refuses anything else, including a role-shaped object", () => {
    for (const value of [null, undefined, "", "admin", "OWNER", 3, {}, ["ADMIN"]]) {
      expect(isRole(value), JSON.stringify(value)).toBe(false);
    }
  });
});

describe("isAdminOrAbove", () => {
  it("022 AC-1: true for ADMIN and SUPER_ADMIN, false for YARD_STAFF", () => {
    const expected: Record<Role, boolean> = {
      YARD_STAFF: false,
      ADMIN: true,
      SUPER_ADMIN: true,
    };

    for (const role of ROLES) {
      expect(isAdminOrAbove(role), role).toBe(expected[role]);
    }
  });
});
