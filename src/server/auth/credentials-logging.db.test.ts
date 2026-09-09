import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deepKeys } from "@/lib/money-boundary";
import { resetTestDb } from "@/server/test-db";
import { createUser, verifyCredentials } from "@/server/auth/user-service";

/**
 * Spec 003 AC-4: no plaintext password is ever written to a log or returned from a
 * service.
 *
 * "We are careful about logging" is not evidence. This test captures all four console
 * methods for the duration of a real successful sign-in and a real failed one, with a
 * password generated milliseconds earlier, and searches everything that was written.
 */
const captured: string[] = [];
const spies: ReturnType<typeof vi.spyOn>[] = [];

function capture(...args: unknown[]): void {
  captured.push(args.map((argument) => String(argument)).join(" "));
}

beforeEach(async () => {
  captured.length = 0;
  for (const method of ["log", "info", "warn", "error"] as const) {
    spies.push(vi.spyOn(console, method).mockImplementation(capture));
  }
  await resetTestDb();
});

afterEach(() => {
  while (spies.length > 0) spies.pop()?.mockRestore();
});

describe("credential checks and the console", () => {
  it("AC-4: the password reaches no console method, while the failed attempt logs the email", async () => {
    const email = `staff-${randomBytes(6).toString("hex")}@macroads.example`;
    const password = `Pw-${randomBytes(12).toString("hex")}`;

    await createUser({ email, name: "Yard Staff", password });

    const succeeded = await verifyCredentials(email, password);
    const capturedAfterSuccess = captured.join("\n");

    captured.length = 0;
    const failed = await verifyCredentials(email, `Pw-${randomBytes(12).toString("hex")}`);
    const capturedAfterFailure = captured.join("\n");

    expect(succeeded).not.toBeNull();
    expect(failed).toBeNull();

    // Nothing anywhere printed the password …
    expect(capturedAfterSuccess).not.toContain(password);
    expect(capturedAfterFailure).not.toContain(password);
    // … and the failure is not silent: it names the email that was attempted.
    expect(capturedAfterFailure).toContain(email);
  });

  it("AC-4: the attempted password of an unknown email is not logged either", async () => {
    const email = `ghost-${randomBytes(6).toString("hex")}@macroads.example`;
    const password = `Pw-${randomBytes(12).toString("hex")}`;

    const result = await verifyCredentials(email, password);
    const output = captured.join("\n");

    expect(result).toBeNull();
    expect(output).toContain(email);
    expect(output).not.toContain(password);
  });

  it("AC-4: what verifyCredentials returns has no key matching /password/i at any depth", async () => {
    const email = `staff-${randomBytes(6).toString("hex")}@macroads.example`;
    const password = `Pw-${randomBytes(12).toString("hex")}`;
    await createUser({ email, name: "Yard Staff", password });

    const result = await verifyCredentials(email, password);

    expect(deepKeys(result).filter((key) => /password/i.test(key))).toEqual([]);
    expect(JSON.stringify(result)).not.toContain(password);
  });
});
