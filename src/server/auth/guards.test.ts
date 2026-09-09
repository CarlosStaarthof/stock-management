import { describe, expect, it } from "vitest";

import { assertRole, assertUser } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

const staff: SessionUser = {
  id: "u_staff",
  email: "staff@macroads.example",
  name: "Yard Staff",
  role: "YARD_STAFF",
};

const admin: SessionUser = { ...staff, id: "u_admin", email: "admin@macroads.example", role: "ADMIN" };

describe("assertUser", () => {
  it("AC-16: returns the user when there is a session", () => {
    expect(assertUser(staff)).toBe(staff);
  });

  it("AC-16: raises UnauthorizedError when there is no session", () => {
    expect(() => assertUser(null)).toThrowError(UnauthorizedError);
  });
});

describe("assertRole", () => {
  it("AC-16: returns the user when the role matches", () => {
    expect(assertRole(admin, "ADMIN")).toBe(admin);
  });

  it("AC-16: raises ForbiddenError naming the required role when the role does not match", () => {
    let thrown: unknown;
    try {
      assertRole(staff, "ADMIN");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ForbiddenError);
    expect((thrown as Error).message).toContain("ADMIN");
  });

  it("AC-16: raises UnauthorizedError — not ForbiddenError — when there is no session", () => {
    let thrown: unknown;
    try {
      assertRole(null, "ADMIN");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(UnauthorizedError);
    expect(thrown).not.toBeInstanceOf(ForbiddenError);
  });

  it("AC-15: YARD_STAFF is refused an ADMIN-only action, ADMIN is not refused a YARD_STAFF one", () => {
    expect(() => assertRole(staff, "ADMIN")).toThrowError(ForbiddenError);
    expect(() => assertRole(admin, "YARD_STAFF")).toThrowError(ForbiddenError);
  });
});
