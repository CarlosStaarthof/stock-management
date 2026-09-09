import { z } from "zod";

import { logWarn } from "@/lib/log";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { ROLES, type Role } from "@/server/auth/roles";
import { toSessionUser, type SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ConflictError, ValidationError } from "@/server/errors";

/**
 * Accounts. The only module in this feature that reads or writes the database
 * (spec 003 AC-31); everything above it receives a `SessionUser`, which has no
 * `passwordHash` on it.
 */

/** Spec 003 "Open questions" fixes this at 12, with no composition rules. */
export const MINIMUM_PASSWORD_LENGTH = 12;

/**
 * Compared against when no user is found, so an unknown email costs the same bcrypt
 * work as a known one. The hash is of 32 random bytes nobody kept — it can never match.
 */
const ABSENT_USER_HASH = "$2b$10$5wAs5nZpgNaWySB3msybceSLp/FSWG.BxZfLf40nCIkBPBtLAmBk.";

const createUserSchema = z.object({
  // Stored lower-cased, so ADMIN@EXAMPLE.COM and admin@example.com are one account.
  email: z
    .string({ error: "email must be a string" })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: "email is not a valid email address" })),
  name: z.string({ error: "name must be a string" }).trim().min(1, { error: "name must not be blank" }),
  password: z.string({ error: "password must be a string" }).min(MINIMUM_PASSWORD_LENGTH, {
    error: `password must be at least ${MINIMUM_PASSWORD_LENGTH} characters`,
  }),
  role: z.enum(ROLES).default("YARD_STAFF"),
});

export type CreateUserInput = {
  email: string;
  name: string;
  password: string;
  role?: Role;
};

/** Everything `/api/users` shows an ADMIN. No hash, no password, no money. */
export type UserListEntry = {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
};

/**
 * Validation happens here, at the edge of `src/server/` (docs/architecture.md), and the
 * error names the offending field so a form can say which one.
 */
function parseCreateUserInput(input: CreateUserInput): {
  email: string;
  name: string;
  password: string;
  role: Role;
} {
  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = typeof issue?.path[0] === "string" ? issue.path[0] : "input";
    throw new ValidationError(field, issue?.message ?? `${field} is invalid`);
  }
  return parsed.data;
}

/** True for Prisma's unique-constraint violation, without importing PrismaClient's types. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function createUser(input: CreateUserInput): Promise<SessionUser> {
  const { email, name, password, role } = parseCreateUserInput(input);

  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (existing !== null) {
    throw new ConflictError(`A user with email ${email} already exists`);
  }

  const passwordHash = await hashPassword(password);

  try {
    const created = await db.user.create({
      data: { email, name, passwordHash, role },
      select: { id: true, email: true, name: true, role: true },
    });
    return toSessionUser(created);
  } catch (error) {
    // Two operators running admin:create at the same second; the unique index wins.
    if (isUniqueViolation(error)) {
      throw new ConflictError(`A user with email ${email} already exists`);
    }
    throw error;
  }
}

/**
 * The single answer to "are these credentials good?".
 *
 * Wrong password, unknown email and a deactivated account are indistinguishable to the
 * caller — all three return `null` after the same bcrypt comparison — because telling
 * them apart tells an attacker which emails have accounts (AC-10).
 */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<SessionUser | null> {
  const normalisedEmail = email.trim().toLowerCase();

  const row = await db.user.findUnique({
    where: { email: normalisedEmail },
    select: { id: true, email: true, name: true, role: true, active: true, passwordHash: true },
  });

  const passwordMatches = await verifyPassword(password, row?.passwordHash ?? ABSENT_USER_HASH);

  if (row === null || !row.active || !passwordMatches) {
    // The attempted email is recorded; the attempted password never is.
    logWarn("auth.sign_in_failed", { email: normalisedEmail });
    return null;
  }

  return toSessionUser(row);
}

/**
 * Read on every authenticated server-side request. Returns `null` when the row is gone
 * or `active` is false, which is what makes deactivation bite on the next request
 * instead of when the token expires (AC-11).
 */
export async function findActiveUserById(id: string): Promise<SessionUser | null> {
  const row = await db.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true, active: true },
  });

  if (row === null || !row.active) return null;

  return toSessionUser(row);
}

/** What `/api/users` lists for an ADMIN. */
export async function listUsers(): Promise<UserListEntry[]> {
  return db.user.findMany({
    orderBy: { email: "asc" },
    select: { id: true, email: true, name: true, role: true, active: true },
  });
}

/**
 * Deactivate or reactivate an account.
 *
 * There is no user-management screen yet (spec 003 "Out of scope"), so this is how a
 * leaver is locked out — from an operator's console, and from the end-to-end test that
 * proves AC-11.
 */
export async function setUserActive(email: string, active: boolean): Promise<void> {
  await db.user.update({
    where: { email: email.trim().toLowerCase() },
    data: { active },
  });
}

/** Removes an account. Used to clean up after the end-to-end suite. */
export async function deleteUserByEmail(email: string): Promise<void> {
  await db.user.deleteMany({ where: { email: email.trim().toLowerCase() } });
}
