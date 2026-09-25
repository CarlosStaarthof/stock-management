import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/server/auth/roles";
import { resetTestDb } from "@/server/test-db";
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

function newUsername(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}`;
}

/**
 * An ACTIVE profile holding a username, written straight to the table (021 replaced
 * `createUser`). No PIN: nothing here signs in, and `getCurrentUser` never reads one.
 */
async function createUser(input: {
  username: string;
  name: string;
  role?: Role;
}): Promise<{ id: string }> {
  return db.user.create({
    data: { ...input, status: "ACTIVE" },
    select: { id: true },
  });
}

/**
 * What Auth.js hands back for a signed-in user: an id, a role hint we do not trust, and the
 * epoch the session was minted under (021), which a fresh profile holds at 0.
 */
function sessionFor(
  id: string,
  roleHint = "YARD_STAFF",
): { user: { id: string; role: string }; epoch: number } {
  return { user: { id, role: roleHint }, epoch: 0 };
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
    const username = newUsername("staff");
    const created = await createUser({ username, name: "Yard Staff" });
    authMock.mockResolvedValue(sessionFor(created.id));

    const user = await getCurrentUser();

    expect(user).toEqual({ id: created.id, username, name: "Yard Staff", role: "YARD_STAFF" });
  });

  it("AC-18: the role comes from the stored row, not from the session token", async () => {
    const created = await createUser({
      username: newUsername("staff"),
      name: "Yard Staff",
    });
    // The token claims ADMIN. The row says YARD_STAFF. The row wins.
    authMock.mockResolvedValue(sessionFor(created.id, "ADMIN"));

    const user = await getCurrentUser();

    expect(user?.role).toBe("YARD_STAFF");
    await expect(requireRole("ADMIN")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("AC-11: deactivation takes effect on the next call, with the session untouched", async () => {
    const username = newUsername("staff");
    const created = await createUser({ username, name: "Yard Staff" });
    authMock.mockResolvedValue(sessionFor(created.id));

    expect(await getCurrentUser()).not.toBeNull();

    await db.user.update({ where: { username }, data: { status: "DEACTIVATED" } });

    // Same stubbed session, same token, next request: refused.
    expect(await getCurrentUser()).toBeNull();
    await expect(requireUser()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("AC-11: a session for a user whose row has been deleted is refused", async () => {
    const created = await createUser({
      username: newUsername("gone"),
      name: "Departed",
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
    const username = newUsername("admin");
    const created = await createUser({
      username,
      name: "Administrator",
      role: "ADMIN",
    });
    authMock.mockResolvedValue(sessionFor(created.id, "ADMIN"));

    const user = await requireRole("ADMIN");

    expect(user).toEqual({ id: created.id, username, name: "Administrator", role: "ADMIN" });
  });

  it("AC-16: raises ForbiddenError naming the required role when the session role does not match", async () => {
    const created = await createUser({
      username: newUsername("staff"),
      name: "Yard Staff",
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
