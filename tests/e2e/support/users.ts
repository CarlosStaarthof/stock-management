import { randomBytes } from "node:crypto";

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { Role } from "@/server/auth/roles";
import {
  createUser,
  deleteUserByEmail,
  setUserActive,
} from "@/server/auth/user-service";
import { db } from "@/server/db";

/**
 * Accounts for the end-to-end specs, created through the same service the application
 * uses — no fixture SQL, no second definition of what a user is.
 *
 * These specs run against the DEVELOPMENT database, because that is the one the dev
 * server under test is connected to. So every account they create is deleted again by
 * `removeUser`, and every email is unique per run.
 *
 * Passwords are generated at runtime, never committed (AC-30).
 */
export type TestUser = {
  id: string;
  email: string;
  password: string;
  role: Role;
};

export async function createTestUser(role: Role, label = "e2e"): Promise<TestUser> {
  const email = `${label}-${randomBytes(8).toString("hex")}@macroads-e2e.invalid`;
  const password = `Pw-${randomBytes(12).toString("hex")}`;

  const user = await createUser({
    email,
    name: role === "ADMIN" ? "E2E Administrator" : "E2E Yard Staff",
    password,
    role,
  });

  return { id: user.id, email, password, role };
}

export async function removeUser(email: string): Promise<void> {
  await deleteUserByEmail(email);
}

export async function deactivate(email: string): Promise<void> {
  await setUserActive(email, false);
}

/** The stored hash, so a test can assert no response body contains it (AC-20). */
export async function storedPasswordHash(email: string): Promise<string> {
  const row = await db.user.findUniqueOrThrow({
    where: { email: email.toLowerCase() },
    select: { passwordHash: true },
  });
  return row.passwordHash;
}

/** Signs in through the form, exactly as a user does. */
export async function signIn(page: Page, user: TestUser, from = "/sign-in"): Promise<void> {
  await page.goto(from);
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByTestId("sign-in-submit").click();

  // Two waits, so a failure says which half went wrong: the redirect, or the page.
  await page.waitForURL((url) => url.pathname !== "/sign-in", { timeout: 60_000 });
  await expect(page.getByTestId("signed-in-email")).toHaveText(user.email, { timeout: 30_000 });
}
