import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { deepKeys } from "@/lib/money-boundary";
import { resetTestDb } from "@/server/auth/test-db";
import {
  createUser,
  listUsers,
  setUserActive,
  verifyCredentials,
} from "@/server/auth/user-service";
import { db } from "@/server/db";
import { ConflictError, ValidationError } from "@/server/errors";

/**
 * Level 2 (docs/verification.md): a real Postgres, no mock of PrismaClient anywhere.
 * Each test seeds exactly what it needs after `resetTestDb()`.
 *
 * Passwords are generated at runtime, never committed as literals (AC-30).
 */
function newPassword(): string {
  return `Pw-${randomBytes(12).toString("hex")}`;
}

/** Shorter than the 12-character minimum, and still not a literal in the repository. */
function newTooShortPassword(): string {
  return randomBytes(5).toString("hex");
}

function newEmail(prefix: string): string {
  return `${prefix}-${randomBytes(6).toString("hex")}@macroads.example`;
}

async function userCount(): Promise<number> {
  return db.user.count();
}

beforeEach(async () => {
  await resetTestDb();
});

describe("createUser", () => {
  it("AC-8: creates a user, defaulting role to YARD_STAFF and active to true", async () => {
    const email = newEmail("staff");

    const created = await createUser({ email, name: "Yard Staff", password: newPassword() });

    expect(created.email).toBe(email);
    expect(created.role).toBe("YARD_STAFF");

    const row = await db.user.findUniqueOrThrow({ where: { email } });
    expect(row.active).toBe(true);
    expect(row.role).toBe("YARD_STAFF");
    expect(row.name).toBe("Yard Staff");
  });

  it("AC-20: the value it returns has no key matching /password/i at any depth", async () => {
    const password = newPassword();

    const created = await createUser({ email: newEmail("staff"), name: "Yard Staff", password });

    expect(deepKeys(created)).toEqual(["id", "email", "name", "role"]);
    expect(JSON.stringify(created)).not.toContain(password);
  });

  it("AC-6: stores a bcrypt hash, never the plaintext", async () => {
    const email = newEmail("admin");
    const password = newPassword();

    await createUser({ email, name: "Administrator", password, role: "ADMIN" });

    const row = await db.user.findUniqueOrThrow({ where: { email } });
    expect(row.passwordHash).not.toBe(password);
    expect(row.passwordHash).not.toContain(password);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$(1[0-9]|[2-9][0-9])\$/);
    expect(row.role).toBe("ADMIN");
  });

  it("AC-8: an invalid email raises ValidationError naming email and creates nothing", async () => {
    const before = await userCount();

    let thrown: unknown;
    try {
      await createUser({ email: "not-an-address", name: "Nobody", password: newPassword() });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).field).toBe("email");
    expect((thrown as Error).message).toContain("email");
    expect(await userCount()).toBe(before);
  });

  it("AC-8: a password shorter than 12 characters raises ValidationError and creates nothing", async () => {
    const before = await userCount();

    let thrown: unknown;
    try {
      await createUser({
        email: newEmail("short"),
        name: "Nobody",
        password: newTooShortPassword(),
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).field).toBe("password");
    expect((thrown as Error).message).toContain("password");
    expect(await userCount()).toBe(before);
  });

  it("AC-8: a blank name raises ValidationError naming name and creates nothing", async () => {
    const before = await userCount();

    let thrown: unknown;
    try {
      await createUser({ email: newEmail("blank"), name: "   ", password: newPassword() });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ValidationError);
    expect((thrown as ValidationError).field).toBe("name");
    expect((thrown as Error).message).toContain("name");
    expect(await userCount()).toBe(before);
  });

  it("AC-8: a duplicate email raises ConflictError whose message contains the email", async () => {
    const email = newEmail("dup");
    await createUser({ email, name: "First", password: newPassword() });

    let thrown: unknown;
    try {
      await createUser({ email, name: "Second", password: newPassword() });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ConflictError);
    expect((thrown as Error).message).toContain(email);
    expect(await userCount()).toBe(1);
  });

  it("AC-8: emails are stored lower-cased, and case does not create a second account", async () => {
    const local = `admin-${randomBytes(6).toString("hex")}`;
    const mixedCase = `${local[0].toUpperCase()}${local.slice(1)}@Macroads.EXAMPLE`;
    const password = newPassword();

    const created = await createUser({ email: mixedCase, name: "Administrator", password });

    expect(created.email).toBe(mixedCase.toLowerCase());

    // Signing in with a shouted email finds the same account …
    const signedIn = await verifyCredentials(mixedCase.toUpperCase(), password);
    expect(signedIn?.id).toBe(created.id);

    // … and creating it again, shouted, is still a conflict.
    await expect(
      createUser({ email: mixedCase.toUpperCase(), name: "Impostor", password: newPassword() }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await userCount()).toBe(1);
  });
});

describe("verifyCredentials", () => {
  it("AC-9: returns the session user for a correct email and password", async () => {
    const email = newEmail("staff");
    const password = newPassword();
    const created = await createUser({ email, name: "Yard Staff", password });

    const result = await verifyCredentials(email, password);

    expect(result).toEqual({
      id: created.id,
      email,
      name: "Yard Staff",
      role: "YARD_STAFF",
    });
  });

  it("AC-10: a wrong password, an unknown email and a deactivated account are one answer", async () => {
    const email = newEmail("staff");
    const password = newPassword();
    await createUser({ email, name: "Yard Staff", password });

    const wrongPassword = await verifyCredentials(email, newPassword());
    const unknownEmail = await verifyCredentials(newEmail("ghost"), password);

    await setUserActive(email, false);
    const deactivated = await verifyCredentials(email, password);

    expect(wrongPassword).toBeNull();
    expect(unknownEmail).toBeNull();
    expect(deactivated).toBeNull();
    // Indistinguishable: the three failures are literally the same value.
    expect([wrongPassword, unknownEmail, deactivated]).toEqual([null, null, null]);
  });

  it("AC-11: reactivating the account makes the same credentials work again", async () => {
    const email = newEmail("staff");
    const password = newPassword();
    await createUser({ email, name: "Yard Staff", password });

    await setUserActive(email, false);
    expect(await verifyCredentials(email, password)).toBeNull();

    await setUserActive(email, true);
    expect(await verifyCredentials(email, password)).not.toBeNull();
  });
});

describe("listUsers", () => {
  it("AC-20: lists accounts with no hash and no monetary key", async () => {
    await createUser({ email: newEmail("admin"), name: "Administrator", password: newPassword(), role: "ADMIN" });
    await createUser({ email: newEmail("staff"), name: "Yard Staff", password: newPassword() });

    const users = await listUsers();

    expect(users).toHaveLength(2);
    expect([...new Set(deepKeys(users))].sort()).toEqual([
      "active",
      "email",
      "id",
      "name",
      "role",
    ]);
  });
});
