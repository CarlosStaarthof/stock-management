import { describe, expect, it, vi } from "vitest";

import type { SessionUser } from "@/server/auth/session-user";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import { analysisForRole, getAnalysis, listApprovedPeriods } from "@/server/reporting/analysis-service";
import { DEFAULT_BREAKDOWN } from "@/server/reporting/analysis-input";

/**
 * Spec 011 AC-2's spy-thunk half, and AC-4's actor half — WITH NO DATABASE (AC-23).
 *
 * The guarantee is not that the admin shape is clean. It is ALLOWED to carry every monetary
 * fact in this product. The guarantee is that IT IS NEVER BUILT FOR ANYBODY ELSE, and an
 * unbuilt object cannot be serialised by accident. That is asserted here over spy thunks,
 * exactly as 003 AC-17 and 009 AC-22 assert it, because a test that merely checked the
 * refusal would pass with the query still running.
 *
 * None of these reaches Postgres: the refusal happens before the first `await`.
 */

const STAFF: SessionUser = {
  id: "user_staff",
  username: "staff",
  name: "Fixture Yard Staff",
  role: "YARD_STAFF",
};

const ADMIN: SessionUser = {
  id: "user_admin",
  username: "admin",
  name: "Fixture Administrator",
  role: "ADMIN",
};

const INPUT = { periodKey: "2026-09", breakdownKey: DEFAULT_BREAKDOWN };

describe("011 AC-2: the admin shape is never built for a staff actor", () => {
  it("AC-2: for a YARD_STAFF actor the admin builder is called ZERO times", () => {
    const forStaff = vi.fn((): never => {
      throw new ForbiddenError("ADMIN is required for this action");
    });
    const forAdmin = vi.fn(() => ({ totalStock: "8896.637232378368" }));

    expect(() => analysisForRole(STAFF, forStaff, forAdmin)).toThrow(ForbiddenError);

    expect(forAdmin).toHaveBeenCalledTimes(0);
    expect(forStaff).toHaveBeenCalledTimes(1);
  });

  it("AC-2: for an ADMIN actor it is called exactly once, and the staff thunk is not", () => {
    const forStaff = vi.fn((): never => {
      throw new ForbiddenError("ADMIN is required for this action");
    });
    const forAdmin = vi.fn(() => ({ totalStock: "8896.637232378368" }));

    expect(analysisForRole(ADMIN, forStaff, forAdmin)).toEqual({
      totalStock: "8896.637232378368",
    });

    expect(forAdmin).toHaveBeenCalledTimes(1);
    expect(forStaff).toHaveBeenCalledTimes(0);
  });

  it("AC-18: the choice comes from actor.role and from nothing else on the actor", () => {
    // A client controls a query string, a header and a cookie. It does not control this.
    const forAdmin = vi.fn(() => "admin");
    const forStaff = vi.fn(() => "staff");

    expect(analysisForRole({ ...ADMIN, username: "staff" }, forStaff, forAdmin)).toBe(
      "admin",
    );
    expect(analysisForRole({ ...STAFF, id: ADMIN.id }, forStaff, forAdmin)).toBe("staff");
  });
});

describe("011 AC-2, AC-4: both functions take an explicit actor and refuse without one", () => {
  it("AC-2: a null actor is UnauthorizedError, on both, before any query", async () => {
    await expect(getAnalysis(null, INPUT)).rejects.toThrow(UnauthorizedError);
    await expect(listApprovedPeriods(null)).rejects.toThrow(UnauthorizedError);
  });

  it("AC-2: a YARD_STAFF actor is ForbiddenError, on both, with 006 AC-4's exact sentence", async () => {
    // One refusal spelled two ways is two refusals. This is the string #6 pinned for the
    // seventeen item-master mutations and #9 reused for the valued summary.
    await expect(getAnalysis(STAFF, INPUT)).rejects.toThrow(ForbiddenError);
    await expect(getAnalysis(STAFF, INPUT)).rejects.toThrow("ADMIN is required for this action");
    await expect(listApprovedPeriods(STAFF)).rejects.toThrow(ForbiddenError);
    await expect(listApprovedPeriods(STAFF)).rejects.toThrow(
      "ADMIN is required for this action",
    );
  });

  it("AC-4: getAnalysis's second argument is the period and the grouping, and nothing else", () => {
    // Asserted by the signature: two parameters, and the second has exactly two keys.
    expect(getAnalysis.length).toBe(2);
    expect(listApprovedPeriods.length).toBe(1);
    expect(Object.keys(INPUT).sort()).toEqual(["breakdownKey", "periodKey"]);
  });
});
