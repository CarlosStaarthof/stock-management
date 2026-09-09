import { describe, expect, it } from "vitest";

import {
  ConflictError,
  DomainError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";

describe("domain errors", () => {
  it("AC-16: UnauthorizedError and ForbiddenError are distinguishable types", () => {
    const unauthorized = new UnauthorizedError();
    const forbidden = new ForbiddenError("ADMIN is required");

    expect(unauthorized).toBeInstanceOf(UnauthorizedError);
    expect(unauthorized).not.toBeInstanceOf(ForbiddenError);
    expect(forbidden).toBeInstanceOf(ForbiddenError);
    expect(forbidden).not.toBeInstanceOf(UnauthorizedError);
    expect(unauthorized.message).toBe("Unauthorized");
    expect(forbidden.message).toBe("ADMIN is required");
  });

  it("AC-16: every domain error is a DomainError and an Error, and names itself", () => {
    const errors = [
      new NotFoundError("no such user"),
      new ValidationError("email", "email is not a valid address"),
      new ConflictError("already exists"),
      new ForbiddenError("ADMIN is required"),
      new UnauthorizedError(),
    ];

    for (const error of errors) {
      expect(error).toBeInstanceOf(DomainError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(error.constructor.name);
    }
  });

  it("AC-8: ValidationError carries the offending field", () => {
    const error = new ValidationError("password", "password must be at least 12 characters");

    expect(error.field).toBe("password");
    expect(error.message).toContain("password");
  });
});
