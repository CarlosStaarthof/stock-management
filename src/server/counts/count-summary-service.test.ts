import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import type { SessionUser } from "@/server/auth/session-user";
import { getCountSummary } from "@/server/counts/count-summary-service";
import { countForRole } from "@/server/counts/count-shape";
import { ForbiddenError } from "@/server/errors";

/**
 * Spec 009 AC-22's spy-thunk half, in `npm run test:unit` WITH NO DATABASE (AC-31) — the
 * shape of 003 AC-17, applied to the one surface in this feature that carries a euro.
 *
 * The second test is the stronger of the two: if `getCountSummary` read the count before
 * choosing the shape, this file would fail with a Prisma error instead of a
 * `ForbiddenError`, because there is no database here at all. "The admin builder is called
 * zero times" is therefore proved by the absence of a connection, not only by a spy.
 */
const STAFF: SessionUser = {
  id: "user_staff",
  email: "jo@macroads.ie",
  name: "Jo Byrne",
  role: "YARD_STAFF",
};

describe("AC-22: the euro shape is never built for a staff actor", () => {
  it("AC-22: countForRole runs the staff thunk and NEVER the admin one", () => {
    const forStaff = vi.fn((): never => {
      throw new ForbiddenError("ADMIN is required for this action");
    });
    const forAdmin = vi.fn(() => ({ countTotal: "8896.637232378368" }));

    expect(() => countForRole(STAFF, forStaff, forAdmin)).toThrow(ForbiddenError);

    expect(forStaff).toHaveBeenCalledTimes(1);
    expect(forAdmin).toHaveBeenCalledTimes(0);
  });

  it("AC-22: getCountSummary refuses a staff actor before it reads anything", async () => {
    await expect(getCountSummary(STAFF, "count_anything")).rejects.toThrow(ForbiddenError);

    // The exact sentence 006 AC-4 pinned for the seventeen item-master mutations. One
    // refusal spelled two ways is two refusals.
    await expect(getCountSummary(STAFF, "count_anything")).rejects.toThrow(
      "ADMIN is required for this action",
    );
  });

  it("AC-22: the role comes from the session and from nothing a client can set", () => {
    const source = readFileSync("src/server/counts/count-summary-service.ts", "utf8");

    // No request, no header, no cookie, no form field reaches the choice: `countForRole`
    // takes a `SessionUser` and reads `role` off it (AC-27).
    expect(source).toContain("countForRole(");
    expect(source).not.toMatch(/headers\(|cookies\(|searchParams|formData/);
    expect(source).not.toMatch(/role\s*===/);
  });

  it("AC-28, AC-26: the read-only service writes nothing and throws only typed errors", () => {
    const source = readFileSync("src/server/counts/count-summary-service.ts", "utf8");

    expect(source).not.toMatch(
      /stockCount(Line)?\s*\.\s*(update|updateMany|upsert|create|createMany|delete|deleteMany)\b/,
    );
    expect(source).not.toMatch(/throw new Error\(/);
  });
});
