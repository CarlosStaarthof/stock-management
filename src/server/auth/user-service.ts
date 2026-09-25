import type { ProfileStatus } from "@/server/auth/profile-status";

import { landingPathForRole, type LandingPath } from "@/server/auth/landing";
import type { Role } from "@/server/auth/roles";
import { toSessionUser, type SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";

/**
 * Reading the profile behind a session (spec 003, reshaped by 021).
 *
 * Creating, verifying and deactivating a profile moved out: signing in is
 * `sign-in-service.ts`, and a profile is created by a request and an approval, by an
 * ADMIN, by first-run setup, or — for fixtures and the operator — by `operator-service.ts`.
 */

/** Everything `/api/users` shows an ADMIN (021 AC-33). No hash, no key, no money. */
export type UserListEntry = {
  id: string;
  username: string | null;
  name: string;
  role: Role;
  status: ProfileStatus;
};

/**
 * Read on every authenticated server-side request. Returns `null` unless the row exists,
 * is `ACTIVE`, holds a username, and carries the same `sessionEpoch` the session was minted
 * with — which is what makes a deactivation or a PIN reset end a session on its next
 * request instead of when the token expires (003 AC-11, 021 AC-17).
 */
export async function findActiveUserById(
  id: string,
  sessionEpoch: number,
): Promise<SessionUser | null> {
  const row = await db.user.findUnique({
    where: { id },
    select: { id: true, username: true, name: true, role: true, status: true, sessionEpoch: true },
  });

  if (row === null || row.status !== "ACTIVE" || row.sessionEpoch !== sessionEpoch) return null;
  if (row.username === null) return null;

  return toSessionUser({ id: row.id, username: row.username, name: row.name, role: row.role });
}

/**
 * Where a profile that has just signed in lands. Asked only AFTER a successful sign-in,
 * so it evaluates nothing and reveals nothing; it reads the role, never a credential. A
 * username that no longer names an active profile lands on the staff page, whose own
 * guard then decides.
 */
export async function landingPathForUsername(username: string): Promise<LandingPath> {
  const row = await db.user.findUnique({
    where: { username: username.trim().toLowerCase() },
    select: { role: true, status: true },
  });

  return landingPathForRole(row !== null && row.status === "ACTIVE" ? row.role : "YARD_STAFF");
}

/** What `/api/users` lists for an ADMIN, in username order (a request has none yet). */
export async function listUsers(): Promise<UserListEntry[]> {
  return db.user.findMany({
    orderBy: [{ username: "asc" }, { createdAt: "asc" }],
    select: { id: true, username: true, name: true, role: true, status: true },
  });
}
