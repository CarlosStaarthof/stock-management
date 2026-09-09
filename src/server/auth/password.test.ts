import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "@/server/auth/password";

/**
 * Level 1: no database, no environment. Passwords are generated at runtime (AC-30) so
 * that no test password is ever a committed literal.
 */
function newPassword(): string {
  return `Pw-${randomBytes(12).toString("hex")}`;
}

// A bcrypt hash at cost 10 or above — AC-3 quotes this expression.
const BCRYPT_AT_COST_10_OR_ABOVE = /^\$2[aby]\$(1[0-9]|[2-9][0-9])\$/;

describe("password hashing", () => {
  it("AC-3: the hash is neither the plaintext nor contains it", async () => {
    const plain = newPassword();

    const hash = await hashPassword(plain);

    expect(hash).not.toBe(plain);
    expect(hash).not.toContain(plain);
  });

  it("AC-3: hashing the same input twice yields two different strings, and both verify", async () => {
    const plain = newPassword();

    const first = await hashPassword(plain);
    const second = await hashPassword(plain);

    expect(first).not.toBe(second);
    expect(await verifyPassword(plain, first)).toBe(true);
    expect(await verifyPassword(plain, second)).toBe(true);
  });

  it("AC-3: verifyPassword returns false for a different plaintext against the same hash", async () => {
    const plain = newPassword();
    const other = newPassword();

    const hash = await hashPassword(plain);

    expect(await verifyPassword(other, hash)).toBe(false);
  });

  it("AC-3: the hash is bcrypt at cost 10 or above", async () => {
    const hash = await hashPassword(newPassword());

    expect(hash).toMatch(BCRYPT_AT_COST_10_OR_ABOVE);
  });

  it("AC-3: verifyPassword returns false against a hash that is not a bcrypt hash", async () => {
    expect(await verifyPassword(newPassword(), "not-a-hash")).toBe(false);
  });
});
