import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetTestDb } from "@/server/auth/test-db";
import { createUser, setUserActive } from "@/server/auth/user-service";
import { db } from "@/server/db";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";

/**
 * `getCurrentUser` / `requireUser` / `requireRole` against a real database.
 *
 * Auth.js's `auth()` is stubbed — it needs an HTTP request, and there is none here — but
 * NOTHING about Prisma is: the row these tests read is a row a real Postgres wrote
 * (AC-27). Stubbing the session is also what makes the point of AC-11 and AC-18
 * checkable: the stub keeps claiming a valid session, and the answer still changes when
 * the stored row changes, because the row is what decides.
 */
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/next-auth", () => ({ auth: authMock }));

const { getCurrentUser, requireRole, requireUser } = await import("@/server/auth/session");

function newPassword(): string {
  return `Pw-${randomBytes(12).toString("hex")}`;
}

function newEmail(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}@macroads.example`;
}

/** What Auth.js hands back for a signed-in user: an id, and a role hint we do not trust. */
function sessionFor(id: string, roleHint = "YARD_STAFF"): { user: { id: string; role: string } } {
  return { user: { id, role: roleHint } };
}

beforeEach(async () => {
  authMock.mockReset();
  await resetTestDb();
});

describe("getCurrentUser", () => {
  it("AC-13: returns null when there is no session", async () => {
    authMock.mockResolvedValue(null);

    expect(await getCurrentUser()).toBeNull();
  });

  it("AC-9: returns the stored user for a session carrying their id", async () => {
    const email = newEmail("staff");
    const created = await createUser({ email, name: "Yard Staff", password: newPassword() });
    authMock.mockResolvedValue(sessionFor(created.id));

    const user = await getCurrentUser();

    expect(user).toEqual({ id: created.id, email, name: "Yard Staff", role: "YARD_STAFF" });
  });

  it("AC-18: the role comes from the stored row, not from the session token", async () => {
    const created = await createUser({
      email: newEmail("staff"),
      name: "Yard Staff",
      password: newPassword(),
    });
    // The token claims ADMIN. The row says YARD_STAFF. The row wins.
    authMock.mockResolvedValue(sessionFor(created.id, "ADMIN"));

    const user = await getCurrentUser();

    expect(user?.role).toBe("YARD_STAFF");
    await expect(requireRole("ADMIN")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("AC-11: deactivation takes effect on the next call, with the session untouched", async () => {
    const email = newEmail("staff");
    const created = await createUser({ email, name: "Yard Staff", password: newPassword() });
    authMock.mockResolvedValue(sessionFor(created.id));

    expect(await getCurrentUser()).not.toBeNull();

    await setUserActive(email, false);

    // Same stubbed session, same token, next request: refused.
    expect(await getCurrentUser()).toBeNull();
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("AC-11: a session for a user whose row has been deleted is refused", async () => {
    const created = await createUser({
      email: newEmail("gone"),
      name: "Departed",
      password: newPassword(),
    });
    authMock.mockResolvedValue(sessionFor(created.id));

    await db.user.delete({ where: { id: created.id } });

    expect(await getCurrentUser()).toBeNull();
  });

  it("AC-22: an unreadable session — a missing AUTH_SECRET — degrades to null, not to access", async () => {
    authMock.mockRejectedValue(new Error("MissingSecret"));

    expect(await getCurrentUser()).toBeNull();
    await expect(requireRole("ADMIN")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe("requireRole", () => {
  it("AC-16: returns the user when the session role matches", async () => {
    const email = newEmail("admin");
    const created = await createUser({
      email,
      name: "Administrator",
      password: newPassword(),
      role: "ADMIN",
    });
    authMock.mockResolvedValue(sessionFor(created.id, "ADMIN"));

    const user = await requireRole("ADMIN");

    expect(user).toEqual({ id: created.id, email, name: "Administrator", role: "ADMIN" });
  });

  it("AC-16: raises ForbiddenError naming the required role when the session role does not match", async () => {
    const created = await createUser({
      email: newEmail("staff"),
      name: "Yard Staff",
      password: newPassword(),
    });
    authMock.mockResolvedValue(sessionFor(created.id));

    await expect(requireRole("ADMIN")).rejects.toThrowError(/ADMIN/);
    await expect(requireRole("ADMIN")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("AC-16: raises UnauthorizedError when there is no session at all", async () => {
    authMock.mockResolvedValue(null);

    await expect(requireRole("ADMIN")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
