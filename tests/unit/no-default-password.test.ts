import { spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 003 AC-7, amended by 021 AC-41: no default password, PIN, pepper or setup code
 * exists anywhere in the repository.
 *
 * A credential in git is a published credential. #3 made the operator supply the first
 * password on the command line; #21 makes the operator supply a PIN to `npm run pin:reset`
 * the same way, and each environment generate its own `PIN_PEPPER` and `SETUP_CODE`. That
 * only holds while nobody "helpfully" commits a value to make a command easier to run —
 * which is what this test prevents.
 *
 * The runtime half (the command refuses and changes no row) is
 * `src/server/auth/pin-reset.db.test.ts`.
 */

// The literal the documentation must show instead of a PIN (021 AC-41).
const PLACEHOLDER = "<choose-a-pin>";

// An assignment of a credential-shaped variable to something that is not a placeholder.
// #3's three password names stay; 021 AC-41 adds the PIN, the pepper and the setup code.
const ASSIGNS_A_PASSWORD =
  /\b(ADMIN_PASSWORD|DEFAULT_PASSWORD|SEED_PASSWORD|NEW_PIN|PIN_PEPPER|SETUP_CODE)\s*[:=]\s*["'`]?([^\s"'`,)]+)/g;

const MAX_SCANNED_BYTES = 8 * 1024 * 1024;

function repositoryFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });

  return (result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function readIfScannable(file: string): string | undefined {
  try {
    if (statSync(file).size > MAX_SCANNED_BYTES) return undefined;
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/** Values that are documentation or code rather than a password. */
function isNotAPassword(value: string): boolean {
  return (
    value === PLACEHOLDER ||
    value.startsWith("<") ||
    value === "" ||
    // An identifier or a call - `ADMIN_PASSWORD: password`, `ADMIN_PASSWORD: newPassword(`
    // - is a value computed at runtime, which is what AC-30 asks for. A quoted literal is
    // not an identifier and is still caught.
    /^[A-Za-z_$][\w$.]*\(?$/.test(value)
  );
}

describe("no default password", () => {
  it("AC-7, amended by 021 AC-41: no tracked file assigns a value to ADMIN_PASSWORD, NEW_PIN, PIN_PEPPER or SETUP_CODE", () => {
    const offenders: string[] = [];

    for (const file of repositoryFiles()) {
      const content = readIfScannable(file);
      if (content === undefined) continue;

      for (const [match, , value] of content.matchAll(ASSIGNS_A_PASSWORD)) {
        // This test file itself defines the detector; skip its own definitions.
        if (file === "tests/unit/no-default-password.test.ts") continue;
        if (!isNotAPassword(value)) offenders.push(`${file}: ${match}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("AC-7, amended by 021 AC-41: the documented invocation shows the <choose-a-pin> placeholder, not a value", () => {
    const operations = readFileSync("docs/operations.md", "utf8");

    expect(operations).toContain(`NEW_PIN=${PLACEHOLDER}`);
    expect(operations).toContain("npm run pin:reset -- --profile <id>");
  });

  it("AC-7, amended by 021 AC-30: the reset script has no fallback value to guess", () => {
    const script = readFileSync("scripts/pin-reset.ts", "utf8");

    // It reads the variable and defaults it to the empty string, which it then refuses.
    expect(script).toContain('process.env.NEW_PIN ?? ""');
    expect(script).toContain("NEW_PIN is not set");
  });

  it("021 AC-41: the detector is not vacuous: it catches a literal under each new name", () => {
    // Built at runtime, so this file never holds an assignment of its own. A digit first,
    // as a PIN has: a value shaped like an identifier is read as code by isNotAPassword.
    for (const name of ["NEW_PIN", "PIN_PEPPER", "SETUP_CODE"]) {
      const literal = `${randomInt(1, 10)}${randomBytes(6).toString("hex")}`;
      const found = [...`${name}=${literal}`.matchAll(ASSIGNS_A_PASSWORD)];
      expect(found, name).toHaveLength(1);
      expect(isNotAPassword(found[0]?.[2] ?? ""), name).toBe(false);
    }
  });
});
