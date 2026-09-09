import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 003 AC-5, automated: exactly one file may import the password-hashing library.
 *
 * The admin-creation script and the credentials provider both reach hashing through
 * `src/server/auth/password.ts`, so the cost factor is decided in one place. Without this
 * test, a later feature adds `import bcrypt from "bcryptjs"` at cost 4 in a seed script
 * and nothing complains.
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
  it("AC-5: exactly one file under src/, scripts/ and prisma/ imports the hashing library", () => {
    const importers = codeFiles().filter((file) =>
      importedModules(file).some((specifier) => HASHING_MODULES.includes(specifier)),
    );

    expect(importers).toEqual([THE_ONE_FILE]);
  });

  it("AC-5: that file is the module the contract names, and it exports both operations", () => {
    const source = readFileSync(THE_ONE_FILE, "utf8");

    expect(source).toContain("export async function hashPassword");
    expect(source).toContain("export async function verifyPassword");
  });

  it("AC-5: the admin-creation script reaches hashing through the service layer", () => {
    const specifiers = importedModules("scripts/admin-create.ts");

    expect(specifiers.some((specifier) => HASHING_MODULES.includes(specifier))).toBe(false);
    expect(specifiers).toContain("@/server/auth/user-service");
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

  it("AC-31: every database access this feature adds lives under src/server/auth/", () => {
    const touchesDb = codeFiles().filter((file) =>
      importedModules(file).some(
        (specifier) => specifier === "@/server/db" || specifier === "@prisma/client",
      ),
    );

    for (const file of touchesDb) {
      // src/server/db.ts and its test are feature #2's; everything #3 adds is under auth/.
      expect(file).toMatch(/^src\/server\/(auth\/|db(\.test)?\.ts$)/);
    }

    expect(touchesDb).toContain("src/server/auth/user-service.ts");
  });
});
