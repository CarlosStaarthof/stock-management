import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/server/auth/roles";
import type { SessionUser } from "@/server/auth/session-user";

/**
 * Spec 022 AC-4 and AC-7, the GUARD half, proved without a browser.
 *
 * `page-guards.ts` is not mocked here: it runs the real `session.ts` chain down to
 * `assertAdminOrAbove` and `isAdminOrAbove`, so a SUPER_ADMIN reaching an administrator
 * page is decided by the shipped predicate, not by a stand-in. Only the session token
 * (`next-auth`) and the database read (`user-service`) are replaced, and `redirect` is the
 * one Next throws.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  findActiveUserById: vi.fn(),
}));

vi.mock("@/server/auth/next-auth", () => ({ auth: mocks.auth }));
vi.mock("@/server/auth/user-service", () => ({ findActiveUserById: mocks.findActiveUserById }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    const error = new Error(`NEXT_REDIRECT:${path}`);
    (error as { digest?: string }).digest = `NEXT_REDIRECT;replace;${path};307;`;
    throw error;
  }),
}));

const { requireAdminPage, requireUserPage } = await import("./page-guards");

const USERS: Record<Role, SessionUser> = {
  YARD_STAFF: { id: "u-staff", username: "staff", name: "Yard Staff", role: "YARD_STAFF" },
  ADMIN: { id: "u-admin", username: "owner", name: "Owner", role: "ADMIN" },
  SUPER_ADMIN: {
    id: "u-super",
    username: "carlos-staarthof",
    name: "Carlos",
    role: "SUPER_ADMIN",
  },
};

/** Make the next request carry a session for `user`, or none at all. */
function session(user: SessionUser | null): void {
  if (user === null) {
    mocks.auth.mockResolvedValue(null);
    mocks.findActiveUserById.mockResolvedValue(null);
    return;
  }

  mocks.auth.mockResolvedValue({ user: { id: user.id }, epoch: 1 });
  mocks.findActiveUserById.mockResolvedValue(user);
}

/** The path inside the redirect Next throws. */
async function redirectPathOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const match = /^NEXT_REDIRECT:(.*)$/.exec(message);
    if (match !== null) return match[1];
    throw error;
  }
  throw new Error("expected a redirect, but the guard returned");
}

beforeEach(() => {
  mocks.auth.mockReset();
  mocks.findActiveUserById.mockReset();
});

describe("022 AC-7: an administrator page admits SUPER_ADMIN through the shipped predicate", () => {
  it.each(["ADMIN", "SUPER_ADMIN"] as const)(
    "AC-7: a %s session is returned by requireAdminPage",
    async (role) => {
      session(USERS[role]);

      await expect(requireAdminPage("analysis")).resolves.toEqual(USERS[role]);
    },
  );

  it("AC-7: a YARD_STAFF session is still refused, at the shipped denied URL", async () => {
    session(USERS.YARD_STAFF);

    await expect(redirectPathOf(() => requireAdminPage("analysis"))).resolves.toBe(
      "/stock-entry?denied=analysis",
    );
  });
});

describe("022 AC-4: every role has a home, and no session is sent to sign in", () => {
  it.each(["YARD_STAFF", "ADMIN", "SUPER_ADMIN"] as const)(
    "AC-4: a %s session reaches /home",
    async (role) => {
      session(USERS[role]);

      await expect(requireUserPage()).resolves.toEqual(USERS[role]);
    },
  );

  it("AC-4: no session redirects to /sign-in?reason=inactive", async () => {
    session(null);

    await expect(redirectPathOf(() => requireUserPage())).resolves.toBe(
      "/sign-in?reason=inactive",
    );
  });
});
