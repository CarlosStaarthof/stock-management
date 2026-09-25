import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 003 AC-5, automated, and widened by 021 AC-6: exactly one file may compute a
 * credential digest — import the hashing library, or call the keyed-hash or constant-time
 * comparison primitives of `node:crypto`.
 *
 * The reset script and the credentials provider both reach hashing through
 * `src/server/auth/password.ts`, so the cost factor and the pepper are decided in one
 * place. Without this test, a later feature adds `import bcrypt from "bcryptjs"` at cost 4
 * in a seed script, or an HMAC under a second key, and nothing complains.
 *
 * It reads what the repository contains, not what anybody remembers putting there.
 */

// Hashing libraries a JavaScript project might reach for. The point is not to enumerate
// every one, it is that the SET of files importing any of them stays a single file.
const HASHING_MODULES = [
  "bcrypt",
  "bcryptjs",
  "@node-rs/bcrypt",
  "argon2",
  "@node-rs/argon2",
  "scrypt-kdf",
];

const THE_ONE_FILE = "src/server/auth/password.ts";

// 021 AC-6: the two `node:crypto` operations a credential digest or its comparison is made
// of. Built from parts, so this file's own source never looks like a caller.
const CRYPTO_CALLS = [`create${"Hmac"}`, `timing${"SafeEqual"}`].map(
  (name) => new RegExp(String.raw`\b${name}\s*\(`),
);

/** Whether the file's source calls one of `CRYPTO_CALLS`. */
function callsCredentialCrypto(file: string): boolean {
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  return CRYPTO_CALLS.some((pattern) => pattern.test(source));
}

/** Tracked files plus new files git would carry, under the three code directories. */
function codeFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });

  return (result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(src|scripts|prisma)\//.test(line))
    .filter((line) => /\.(ts|tsx|mjs|cjs|js)$/.test(line));
}

/** Every module specifier the file imports or requires. */
function importedModules(file: string): string[] {
  // `git ls-files` still lists a file that has been deleted but not yet staged, and a
  // scan that crashes on one is a scan that stops finding offenders.
  let source: string;
  try {
    source = readFileSync(file, "utf8");
  } catch {
    return [];
  }

  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

describe("the hashing boundary", () => {
  it("AC-5, amended by 021 AC-6: exactly one file under src/, scripts/ and prisma/ imports the hashing library or calls the digest primitives", () => {
    const importers = codeFiles().filter(
      (file) =>
        importedModules(file).some((specifier) => HASHING_MODULES.includes(specifier)) ||
        callsCredentialCrypto(file),
    );

    expect(importers).toEqual([THE_ONE_FILE]);
  });

  it("AC-5, amended by 021 AC-6: that file is the module the contract names, and it exports both operations", () => {
    const source = readFileSync(THE_ONE_FILE, "utf8");

    expect(source).toContain("export async function hashPin");
    expect(source).toContain("export async function verifyPin");
  });

  it("AC-5, amended by 021 AC-6: the reset script reaches hashing through the service layer", () => {
    const specifiers = importedModules("scripts/pin-reset.ts");

    expect(specifiers.some((specifier) => HASHING_MODULES.includes(specifier))).toBe(false);
    expect(callsCredentialCrypto("scripts/pin-reset.ts")).toBe(false);
    expect(specifiers).toContain("@/server/auth/operator-service");
  });
});

describe("the dependency rule", () => {
  it("AC-31: no file under src/app/ or src/components/ imports PrismaClient", () => {
    const offenders = codeFiles()
      .filter((file) => file.startsWith("src/app/") || file.startsWith("src/components/"))
      .filter((file) =>
        importedModules(file).some((specifier) => /^[.@]*\/?(@prisma\/client|\.prisma\/client)/.test(specifier)),
      );

    expect(offenders).toEqual([]);
  });

  it("AC-31: src/middleware.ts imports nothing from @prisma/client, transitively", () => {
    // The edge runtime cannot load Prisma, so it is not enough that the file itself is
    // clean — everything it pulls in must be too.
    const visited = new Set<string>();
    const queue = ["src/middleware.ts"];
    const reached: string[] = [];

    while (queue.length > 0) {
      const file = queue.shift() as string;
      if (visited.has(file)) continue;
      visited.add(file);
      reached.push(file);

      for (const specifier of importedModules(file)) {
        expect(specifier).not.toBe("@prisma/client");
        expect(specifier).not.toBe(".prisma/client");

        if (!specifier.startsWith("@/")) continue;
        const base = `src/${specifier.slice(2)}`;
        for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
          if (codeFiles().includes(candidate)) queue.push(candidate);
        }
      }
    }

    // The walk must actually have followed something, or the assertion above is vacuous.
    expect(reached).toContain("src/lib/auth-config.ts");
  });

  it("004 AC-31 replacing 003 AC-31: every file that touches the database lives under src/server/", () => {
    const touchesDb = codeFiles().filter((file) =>
      importedModules(file).some(
        (specifier) => specifier === "@/server/db" || specifier === "@prisma/client",
      ),
    );

    for (const file of touchesDb) {
      // #3 wrote `/^src\/server\/(auth\/|db(\.test)?\.ts$)/` here, when auth/ was the only
      // aggregate. #4 RELAXES it to the minimum CLAUDE.md actually requires - data access
      // goes through src/server/ - because AC-27 and AC-28 put database importers under
      // src/server/schema/ and at src/server/test-db.ts.
      //
      // Say it plainly: this predicate accepts a STRICT SUPERSET of what #3's accepted.
      // It is a weakening of this one assertion - bounded, forced, and architecturally
      // correct, because every path it now permits is one docs/architecture.md permits.
      // It is NOT "stronger because it covers src/lib/": #3's regex already rejected
      // src/lib/ files, since codeFiles() spans all of src/, scripts/ and prisma/ and
      // /^src\/server\/(auth\/|db(\.test)?\.ts$)/.test("src/lib/anything.ts") is false.
      // The reviewer disproved that claim by planting a src/lib/ importer; both regexes
      // reject it.
      //
      // Enumerating auth/|schema/|test-db.ts instead would need editing again for #6's
      // items/, #7's counts/ and #11's reporting/, and every edit to a guard rail is a
      // chance to weaken it. See specs/features/004-domain_schema.md "Post-approval
      // amendments" §1 and progress/review_domain_schema.md, Observation 1.
      expect(file).toMatch(/^src\/server\//);
    }

    // Non-vacuity: the filter must actually have found the database layer.
    expect(touchesDb).toContain("src/server/auth/user-service.ts");
    expect(touchesDb).toContain("src/server/db.ts");
  });
});
