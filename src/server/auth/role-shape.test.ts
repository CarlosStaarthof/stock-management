import { describe, expect, it, vi } from "vitest";

import { shapeForRole } from "@/server/auth/role-shape";
import type { SessionUser } from "@/server/auth/session-user";

const staff: SessionUser = {
  id: "u_staff",
  email: "staff@macroads.example",
  name: "Yard Staff",
  role: "YARD_STAFF",
};

const admin: SessionUser = { ...staff, id: "u_admin", email: "admin@macroads.example", role: "ADMIN" };

describe("shapeForRole", () => {
  it("AC-17: a YARD_STAFF user gets the staff shape and forAdmin is never called", () => {
    const forStaff = vi.fn(() => ({ item: "White Extrusion 80/20", quantity: "9.8300" }));
    const forAdmin = vi.fn(() => ({ item: "White Extrusion 80/20", lineValue: "8748.7000" }));

    const result = shapeForRole(staff, { forStaff, forAdmin });

    expect(result).toEqual({ item: "White Extrusion 80/20", quantity: "9.8300" });
    expect(forStaff).toHaveBeenCalledTimes(1);
    expect(forAdmin).toHaveBeenCalledTimes(0);
  });

  it("AC-17: an ADMIN user gets the admin shape and forStaff is never called", () => {
    const forStaff = vi.fn(() => ({ item: "White Extrusion 80/20", quantity: "9.8300" }));
    const forAdmin = vi.fn(() => ({ item: "White Extrusion 80/20", lineValue: "8748.7000" }));

    const result = shapeForRole(admin, { forStaff, forAdmin });

    expect(result).toEqual({ item: "White Extrusion 80/20", lineValue: "8748.7000" });
    expect(forAdmin).toHaveBeenCalledTimes(1);
    expect(forStaff).toHaveBeenCalledTimes(0);
  });

  it("AC-18: a role-looking property on the user object is ignored — only user.role decides", () => {
    const forStaff = vi.fn(() => "staff" as const);
    const forAdmin = vi.fn(() => "admin" as const);

    // Everything a request could carry, smuggled onto the argument. Only `role` counts.
    const smuggled = { ...staff, requestedRole: "ADMIN", "x-user-role": "ADMIN" } as SessionUser;

    expect(shapeForRole(smuggled, { forStaff, forAdmin })).toBe("staff");
    expect(forAdmin).toHaveBeenCalledTimes(0);
  });
});
