import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { resetTestDb } from "@/server/auth/test-db";
import { db } from "@/server/db";

/**
 * Spec 003 AC-6 and AC-7: `npm run admin:create`, run for real, against the test
 * database — not a unit test of an exported function, because what the criteria describe
 * is the behaviour of the command an operator types.
 *
 * The password is generated per test, so no test password is a committed literal (AC-30),
 * and the assertions look for it in everything the command printed.
 */
function runAdminCreate(env: Record<string, string | undefined>): {
  status: number;
  stdout: string;
  stderr: string;
} {
  const childEnv = { ...process.env, ...env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
  }

  const result = spawnSync("npm run admin:create --silent", {
    shell: true,
    encoding: "utf8",
    env: childEnv,
  });

  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function newPassword(): string {
  return `Pw-${randomBytes(12).toString("hex")}`;
}

/** Shorter than the 12-character minimum, and still not a literal in the repository. */
function newTooShortPassword(): string {
  return randomBytes(5).toString("hex");
}

function newEmail(): string {
  return `admin-${randomBytes(6).toString("hex")}@macroads.example`;
}

beforeEach(async () => {
  await resetTestDb();
});

describe("npm run admin:create", () => {
  it("AC-6: creates an ADMIN, exits 0, and prints the email and the role but no secret", async () => {
    const email = newEmail();
    const password = newPassword();

    const result = runAdminCreate({ ADMIN_EMAIL: email, ADMIN_PASSWORD: password });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(email);
    expect(result.stdout).toContain("ADMIN");

    const row = await db.user.findUniqueOrThrow({ where: { email } });
    expect(row.role).toBe("ADMIN");
    expect(row.active).toBe(true);

    const everythingPrinted = `${result.stdout}\n${result.stderr}`;
    expect(everythingPrinted).not.toContain(password);
    expect(everythingPrinted).not.toContain(row.passwordHash);
  });

  it("AC-6: a second run with the same email refuses, and changes nothing", async () => {
    const email = newEmail();
    const first = runAdminCreate({ ADMIN_EMAIL: email, ADMIN_PASSWORD: newPassword() });
    expect(first.status).toBe(0);

    const before = await db.user.findUniqueOrThrow({ where: { email } });

    const second = runAdminCreate({ ADMIN_EMAIL: email, ADMIN_PASSWORD: newPassword() });

    expect(second.status).not.toBe(0);
    expect(`${second.stdout}${second.stderr}`).toContain("already exists");
    expect(`${second.stdout}${second.stderr}`).toContain(email);

    const after = await db.user.findUniqueOrThrow({ where: { email } });
    expect(after.passwordHash).toBe(before.passwordHash);
    expect(after.role).toBe(before.role);
    expect(await db.user.count()).toBe(1);
  });

  it("AC-7: with ADMIN_PASSWORD unset it refuses, names the variable, and creates no row", async () => {
    const email = newEmail();

    const result = runAdminCreate({ ADMIN_EMAIL: email, ADMIN_PASSWORD: undefined });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("ADMIN_PASSWORD");
    expect(await db.user.count()).toBe(0);
  });

  it("AC-7: with ADMIN_PASSWORD empty it refuses too — there is no default to fall back to", async () => {
    const result = runAdminCreate({ ADMIN_EMAIL: newEmail(), ADMIN_PASSWORD: "" });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("ADMIN_PASSWORD");
    expect(await db.user.count()).toBe(0);
  });

  it("AC-8: a password shorter than 12 characters is refused by the service, and creates no row", async () => {
    const result = runAdminCreate({
      ADMIN_EMAIL: newEmail(),
      ADMIN_PASSWORD: newTooShortPassword(),
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("password");
    expect(await db.user.count()).toBe(0);
  });
});
