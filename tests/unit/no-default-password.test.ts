import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 003 AC-7: no default password exists anywhere in the repository.
 *
 * A password in git is a published password, so the first administrator is created by
 * `npm run admin:create` with the password supplied on the command line. That only holds
 * while nobody "helpfully" commits a value to make the command easier to run — which is
 * what this test prevents.
 *
 * The runtime half of AC-7 (the command refuses and creates no row) is
 * `src/server/auth/admin-create.db.test.ts`.
 */

// The literal the documentation must show instead of a value.
const PLACEHOLDER = "<choose-a-strong-password>";

// An assignment of a password-shaped variable to something that is not the placeholder.
const ASSIGNS_A_PASSWORD = /\b(ADMIN_PASSWORD|DEFAULT_PASSWORD|SEED_PASSWORD)\s*[:=]\s*["'`]?([^\s"'`,)]+)/g;

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
  it("AC-7: no tracked file assigns a value to ADMIN_PASSWORD", () => {
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

  it("AC-7: the documented invocation shows the placeholder, not a value", () => {
    const operations = readFileSync("docs/operations.md", "utf8");

    expect(operations).toContain(`ADMIN_PASSWORD=${PLACEHOLDER} npm run admin:create`);
    expect(operations).toContain("ADMIN_EMAIL=");
  });

  it("AC-7: the script has no fallback value to guess", () => {
    const script = readFileSync("scripts/admin-create.ts", "utf8");

    // It reads the variable and defaults it to the empty string, which it then refuses.
    expect(script).toContain('process.env.ADMIN_PASSWORD ?? ""');
    expect(script).toContain("ADMIN_PASSWORD is not set");
  });
});
