import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as messages from "@/lib/auth-messages";
import { SETUP_CODE_MIN_LENGTH, generatePin } from "@/server/auth/credential-rules";
import { isUsablePinPepper } from "@/server/auth/password";

import {
  ENV_FILE_LABELS,
  entryFor,
  envFileProblems,
  operationsEnvironment,
} from "../support/env-file";
import { filesTouchedBy } from "../support/feature-scope";

/**
 * Spec 021, the halves that need neither a database nor a browser: the migration's SQL
 * (AC-2), the three secrets' one reader (AC-6), no credential written down (AC-8), no second
 * way in (AC-31), the retired header test id (AC-37) and the single-sourced messages (AC-39).
 *
 * Several of these scans forbid a string. Where they do, this file builds the string from
 * parts, so its own source never contains what it forbids — and it scans itself.
 */

const MAX_SCANNED_BYTES = 8 * 1024 * 1024;

/** Tracked files, plus new files git would carry. */
function repositoryFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  expect(result.status, "git ls-files").toBe(0);
  return (result.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function read(file: string): string | undefined {
  try {
    if (statSync(file).size > MAX_SCANNED_BYTES) return undefined;
    return readFileSync(file, "utf8");
  } catch {
    // Listed but deleted in the working tree: nothing to scan.
    return undefined;
  }
}

const SELF = "tests/unit/pin-auth-contract.test.ts";

const CODE = /\.(ts|tsx|mjs|cjs|js)$/;

/** Every module specifier a file imports, statically or dynamically. */
function importedModules(source: string): string[] {
  const specifiers: string[] = [];
  for (const pattern of [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s+["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\(\s*["']([^"']+)["']\s*\)/g,
  ]) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1] ?? "");
  }
  return specifiers;
}

function isTestFile(file: string): boolean {
  return /\.(test|spec)\.tsx?$/.test(file);
}

/* ------------------------------------------------------------------ AC-2 */

describe("021 AC-2: one migration, which keeps every row and seeds nothing", () => {
  const touched = filesTouchedBy(21, ["prisma/migrations"]);
  const directories = [...new Set(touched.map((file) => file.split("/")[2] ?? ""))];

  it("AC-2: #21's files under prisma/migrations lie in exactly one directory, <timestamp>_pin_profiles", () => {
    expect(directories).toHaveLength(1);
    expect(directories[0]).toMatch(/^\d{14}_pin_profiles$/);
  });

  const sql = read(`prisma/migrations/${directories[0] ?? "missing"}/migration.sql`) ?? "";
  const position = (pattern: RegExp): number => {
    const match = pattern.exec(sql);
    return match === null ? -1 : match.index;
  };

  it("AC-2: it creates both enum types and the three tables", () => {
    for (const statement of [
      /CREATE TYPE "ProfileStatus" AS ENUM \('PENDING', 'ACTIVE', 'REJECTED', 'DEACTIVATED'\)/,
      /CREATE TYPE "AuthEventKind" AS ENUM \('PIN_FAILURE', 'PROFILE_REQUEST', 'SETUP_FAILURE', 'BUDGET_RESET'\)/,
      /CREATE TABLE "AccountLock"/,
      /CREATE TABLE "AuthEvent"/,
      /CREATE TABLE "SetupClaim"/,
    ]) {
      expect(sql).toMatch(statement);
    }
  });

  it("AC-2: status is added and set from active, ACTIVE for true and DEACTIVATED for false, before active is dropped", () => {
    const added = position(/ADD COLUMN "status" "ProfileStatus"/);
    const backfilled = position(
      /UPDATE "User"\s+SET "status" = CASE WHEN "active" THEN 'ACTIVE'::"ProfileStatus" ELSE 'DEACTIVATED'::"ProfileStatus" END/,
    );
    const dropped = position(/DROP COLUMN "active"/);

    expect(added).toBeGreaterThanOrEqual(0);
    expect(backfilled).toBeGreaterThan(added);
    expect(dropped).toBeGreaterThan(backfilled);
  });

  it("AC-2: it adds the five columns and sets none of the four credential columns on any row", () => {
    for (const column of ["username", "requestedUsername", "pinHash", "pinKeyId", "sessionEpoch"]) {
      expect(sql).toMatch(new RegExp(`ADD COLUMN "${column}" `));
    }
    // The only UPDATE sets status; nothing assigns a credential column.
    expect(sql.match(/^\s*UPDATE\s+"/gm) ?? []).toHaveLength(1);
    for (const column of ["username", "requestedUsername", "pinHash", "pinKeyId"]) {
      expect(sql).not.toMatch(new RegExp(`"${column}"\\s*=\\s*[^=]`));
    }
  });

  it("AC-2: it drops the email index, email, passwordHash and active", () => {
    expect(sql).toMatch(/DROP INDEX "User_email_key"/);
    for (const column of ["email", "passwordHash", "active"]) {
      expect(sql).toMatch(new RegExp(`DROP COLUMN "${column}"`));
    }
  });

  it("AC-2: it creates the username index, the claim's foreign key and the ten CHECKs", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX "User_username_key" ON "User"\("username"\)/);
    expect(sql).toMatch(
      /ADD CONSTRAINT "SetupClaim_userId_fkey" FOREIGN KEY \("userId"\) REFERENCES "User"\("id"\) ON DELETE RESTRICT/,
    );
    const checks = [...sql.matchAll(/ADD CONSTRAINT "(\w+)"\s+CHECK/g)].map((match) => match[1]);
    expect(checks.sort()).toEqual(
      [
        "User_username_format",
        "User_requested_username_format",
        "User_request_only_when_pending",
        "User_pending_shape",
        "User_pin_needs_username",
        "User_pin_only_when_live",
        "User_pin_key_with_pin",
        "SetupClaim_single_row",
        "AccountLock_key_format",
        "AuthEvent_account_key_format",
      ].sort(),
    );
  });

  it("AC-2: it inserts no row into User, SetupClaim, AccountLock or AuthEvent", () => {
    expect(sql).not.toMatch(/INSERT INTO "(User|SetupClaim|AccountLock|AuthEvent)"/);
  });
});

/* ------------------------------------------------------------------ AC-6 */

describe("021 AC-6: the three secrets have one reader", () => {
  it("AC-6: under src/server/auth and in auth-config.ts, exactly AUTH_SECRET, PIN_PEPPER and SETUP_CODE are read, all in password.ts", () => {
    const scope = repositoryFiles().filter(
      (file) =>
        (file.startsWith("src/server/auth/") && CODE.test(file)) || file === "src/lib/auth-config.ts",
    );
    expect(scope).toContain("src/server/auth/password.ts");

    const readers = new Map<string, Set<string>>();
    for (const file of scope) {
      const source = read(file) ?? "";
      for (const match of source.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) {
        const name = match[1] ?? "";
        readers.set(name, (readers.get(name) ?? new Set()).add(file));
      }
    }

    expect([...readers.keys()].sort()).toEqual(["AUTH_SECRET", "PIN_PEPPER", "SETUP_CODE"]);
    for (const [name, files] of readers) {
      expect([...files], name).toEqual(["src/server/auth/password.ts"]);
    }
  });
});

/* ------------------------------------------------------------------ AC-8 */

describe("021 AC-8: no PIN and no setup code is written down anywhere", () => {
  const files = repositoryFiles().filter((file) => file !== SELF);
  const QUOTED_PIN = String.raw`["'\x60](?:\d{4}|\d{6})["'\x60]`;
  const PIN_NAME = String.raw`\w*pin\w*`;
  const pinPatterns = [
    // assigned to, or a key of, a name matching /pin/i
    new RegExp(String.raw`\b${PIN_NAME}["']?\s*[:=]\s*${QUOTED_PIN}`, "i"),
    // compared with one, either way round
    new RegExp(String.raw`\b${PIN_NAME}\s*[!=]==?\s*${QUOTED_PIN}`, "i"),
    new RegExp(String.raw`${QUOTED_PIN}\s*[!=]==?\s*${PIN_NAME}\b`, "i"),
    // a form field named pin carrying a value
    new RegExp(String.raw`name=["']${PIN_NAME}["'][^>]*value=${QUOTED_PIN}`, "i"),
    // a fill of a PIN input with a literal
    new RegExp(String.raw`\(\s*["'\x60][^"'\x60]*pin[^"'\x60]*["'\x60][^)]*\)\s*\.fill\(\s*["'\x60][^"'\x60]*["'\x60]`, "i"),
  ];
  const PLACEHOLDERS = new Set(["REPLACE_WITH_A_GENERATED_SECRET", "<choose-a-setup-code>"]);
  // Either a quoted literal, read whole up to its closing quote, or an unquoted value.
  const SETUP_CODE_ASSIGNMENT = new RegExp(
    String.raw`\b\w*setup_?code\w*["']?\s*[:=]\s*(?:(["'\x60])((?:(?!\1)[^\n])*)\1|([^\s"'\x60,;)]{16,}))`,
    "gi",
  );
  const IDENTIFIER_OR_CALL = /^[A-Za-z_$][\w$.]*\(?$/;

  /**
   * The assignments in `source` of a value that could be a setup code (G1, 021 AC-8). A
   * QUOTED literal is a written-down value whatever it looks like: it could be a code when it
   * has no whitespace and at least 16 characters, so a sentence such as a message constant
   * is exempt by its content. Only an UNQUOTED identifier or call is read as code computed
   * at runtime. The two placeholders are exempt either way.
   */
  function setupCodeOffences(source: string): string[] {
    const offences: string[] = [];
    for (const match of source.matchAll(SETUP_CODE_ASSIGNMENT)) {
      const [whole, quote, quoted, unquoted] = match;
      if (quote !== undefined) {
        const literal = quoted ?? "";
        const couldBeACode = !/\s/.test(literal) && Array.from(literal).length >= 16;
        if (couldBeACode && !PLACEHOLDERS.has(literal)) offences.push(whole);
        continue;
      }
      const value = unquoted ?? "";
      if (PLACEHOLDERS.has(value) || IDENTIFIER_OR_CALL.test(value)) continue;
      offences.push(whole);
    }
    return offences;
  }

  it("AC-8: no 4- or 6-digit literal is assigned to, passed as or compared with a PIN, and no PIN input is filled with a literal", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = read(file);
      if (source === undefined) continue;
      source.split("\n").forEach((line, index) => {
        if (pinPatterns.some((pattern) => pattern.test(line))) {
          offenders.push(`${file}:${index + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("AC-8: no literal that could be a setup code is assigned to a setup-code name", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = read(file);
      if (source === undefined) continue;
      for (const offence of setupCodeOffences(source)) {
        offenders.push(`${file}: ${offence}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("AC-8: .env assigns nothing to NEW_PIN, checked by name, with no value read out", () => {
    // `.env` is ignored by git, so the scans above never read it. This reads it through the
    // file system and answers yes or no; a missing `.env` assigns nothing, and
    // tests/unit/env-file.test.ts fails on its absence.
    const env = existsSync(".env") ? readFileSync(".env", "utf8") : "";
    const assignsNewPin = envFileProblems(env).includes(ENV_FILE_LABELS.newPinPresent);

    expect(assignsNewPin, ".env assigns nothing to NEW_PIN").toBe(false);
  });

  it("AC-8: the scans are not vacuous — each pattern catches the shape it names", () => {
    const digits = generatePin(4);
    expect(pinPatterns[0]?.test(`const newPin = "${digits}";`)).toBe(true);
    expect(pinPatterns[1]?.test(`if (pin === "${digits}")`)).toBe(true);
    expect(pinPatterns[4]?.test(`page.getByLabel("PIN").fill("${digits}")`)).toBe(true);
    const code = "x".repeat(20);
    expect([...["SETUP_CODE", code].join("=").matchAll(SETUP_CODE_ASSIGNMENT)]).toHaveLength(1);
  });

  it("AC-8 (G1): a letters-first value in quotes is caught under every setup-code name, and only an unquoted identifier or call is read as code", () => {
    // Built at runtime and letters first, as an identifier is: the shape the old exemption
    // let through when it sat inside quotes.
    const value = `k${randomBytes(12).toString("hex")}`;
    const names = ["SETUP_CODE", "setupCode", "setup_code", "TEST_SETUP_CODE", "firstSetupCode"];

    for (const name of names) {
      for (const quote of ['"', "'", "`"]) {
        for (const operator of ["=", ": ", " = "]) {
          const line = `${name}${operator}${quote}${value}${quote}`;
          expect(setupCodeOffences(line), line).toHaveLength(1);
        }
      }
      // A quoted key, as in an object literal or JSON.
      expect(setupCodeOffences(`"${name}": "${value}"`), name).toHaveLength(1);
    }

    // Read as code: an unquoted identifier, or a call. (The name is interpolated, so the
    // repository's other credential scan does not read these lines as assignments.)
    const [name] = names;
    expect(setupCodeOffences(`${name}: ${value}`)).toEqual([]);
    expect(setupCodeOffences(`setupCode = ${value}()`)).toEqual([]);
    // A sentence cannot be a code, and neither can a short literal; the placeholders pass.
    expect(setupCodeOffences(`${name}_INCORRECT_MESSAGE = "${value} is ${value}"`)).toEqual([]);
    expect(setupCodeOffences(`${name} = "${value.slice(0, 15)}"`)).toEqual([]);
    expect(setupCodeOffences(`${name}="REPLACE_WITH_A_GENERATED_SECRET"`)).toEqual([]);
    expect(setupCodeOffences(`${name}=<choose-a-setup-code>`)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ AC-31 */

describe("021 AC-31: there is no second way in", () => {
  const files = repositoryFiles().filter((file) => CODE.test(file));

  it("AC-31: operator-service is imported only by the reset script, tests and the e2e users helper", () => {
    const importers = files.filter((file) =>
      importedModules(read(file) ?? "").some((specifier) =>
        /(^|\/)operator-service$/.test(specifier),
      ),
    );
    expect(importers.length).toBeGreaterThan(0);
    for (const file of importers) {
      const allowed =
        file === "scripts/pin-reset.ts" ||
        file === "tests/e2e/support/users.ts" ||
        isTestFile(file);
      expect(allowed, file).toBe(true);
    }
    expect(
      importers.filter(
        (file) =>
          file.startsWith("src/app/") ||
          file.startsWith("src/components/") ||
          file === "src/middleware.ts",
      ),
    ).toEqual([]);
  });

  it("AC-31: setup-service, where it exists, is imported only under src/app/setup/ and by tests", () => {
    const importers = files.filter((file) =>
      importedModules(read(file) ?? "").some((specifier) => /(^|\/)setup-service$/.test(specifier)),
    );
    for (const file of importers) {
      expect(file.startsWith("src/app/setup/") || isTestFile(file), file).toBe(true);
    }
    // It exists now (Phase C1): the page and its action are what reach it.
    expect(importers).toEqual(
      expect.arrayContaining(["src/app/setup/page.tsx", "src/app/setup/actions.ts"]),
    );
  });

  it("AC-31: the one provider is the credentials provider, and its authorize reaches one service", () => {
    const source = read("src/server/auth/next-auth.ts") ?? "";
    const providers = source.slice(source.indexOf("providers:"));

    expect(providers.match(/\b[A-Z]\w*\(\{/g)).toEqual(["Credentials({"]);
    const services = importedModules(source).filter((specifier) => /-service$/.test(specifier));
    expect(services).toEqual(["@/server/auth/sign-in-service"]);
    const authorize = source.slice(source.indexOf("async authorize("));
    expect(authorize).toContain("attemptSignIn(");
  });

  it("AC-31: toSessionUser is called from sign-in-service.ts and user-service.ts only", () => {
    const callers = files
      .filter((file) => file.startsWith("src/") && !isTestFile(file))
      .filter((file) => /\btoSessionUser\(/.test(read(file) ?? ""))
      .filter((file) => file !== "src/server/auth/session-user.ts");
    expect(callers.sort()).toEqual([
      "src/server/auth/sign-in-service.ts",
      "src/server/auth/user-service.ts",
    ]);
  });

  it("AC-31: there is exactly one signIn( call under src/, in auth-actions.ts, carrying the typed username and PIN", () => {
    const calls = files
      .filter((file) => file.startsWith("src/"))
      .flatMap((file) =>
        [...(read(file) ?? "").matchAll(/\bsignIn\(([^)]*)\)/g)].map((match) => ({
          file,
          args: match[1] ?? "",
        })),
      );
    expect(calls.map((call) => call.file)).toEqual(["src/app/auth-actions.ts"]);
    const object = /\{([^}]*)\}/.exec(calls[0]?.args ?? "")?.[1] ?? "";
    const keys = object.split(",").map((entry) => entry.split(":")[0]?.trim());
    // The two typed fields, and the redirect handling: nothing a client could set as a role.
    expect(new Set(keys)).toEqual(new Set(["username", "pin", "redirect"]));
  });

  it("AC-31: nothing under src/app/setup/ or src/app/profiles/ signs in or sets a session cookie", () => {
    const offenders = files
      .filter((file) => file.startsWith("src/app/setup/") || file.startsWith("src/app/profiles/"))
      .filter((file) => /\bsignIn\(|session-token/.test(read(file) ?? ""));
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ AC-37 */

describe("021 AC-37: the retired header test id is gone", () => {
  it("AC-37: it occurs nowhere under src/ or tests/, in code and in comments alike", () => {
    const retired = ["signed", "in", "email"].join("-");
    const offenders = repositoryFiles()
      .filter((file) => file.startsWith("src/") || file.startsWith("tests/"))
      .filter((file) => (read(file) ?? "").includes(retired));

    expect(offenders).toEqual([]);
    // The scan reads this file too, and would find a spelled-out copy here.
    expect(repositoryFiles()).toContain(SELF);
  });
});

/* ------------------------------------------------------------------ AC-39 */

describe("021 AC-39: tests import the messages, and never spell them", () => {
  it("AC-39: no file under tests/ and no *.test.ts under src/ holds a message of 20 or more characters as a literal", () => {
    const exported = messages as Record<string, unknown>;
    const texts = Object.values(exported).flatMap((value) =>
      typeof value === "string"
        ? [value]
        : typeof value === "object" && value !== null
          ? Object.values(value).filter((entry): entry is string => typeof entry === "string")
          : [],
    );
    const long = texts.filter((text) => text.length >= 20);
    expect(long.length).toBeGreaterThan(20);

    const scanned = repositoryFiles().filter(
      (file) => file.startsWith("tests/") || (file.startsWith("src/") && file.endsWith(".test.ts")),
    );
    const offenders: string[] = [];
    for (const file of scanned) {
      const source = read(file) ?? "";
      for (const text of long) {
        for (const quote of ['"', "'", "`"]) {
          if (source.includes(`${quote}${text}${quote}`)) offenders.push(`${file}: ${text}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ------------------------------------------------------------------ AC-19 */

describe("021 AC-19: Create profile compares no username and no PIN", () => {
  it("AC-19: profile-request-service.ts has no where naming username or requestedUsername, and never calls verifyPin", () => {
    const source = read("src/server/auth/profile-request-service.ts") ?? "";
    expect(source).toContain("export async function requestProfile(");

    // Every Prisma `where` object, and every raw SQL WHERE clause, in the file.
    const whereClauses = [
      ...source.matchAll(/\bwhere\s*:\s*\{[^}]*\}/g),
      ...source.matchAll(/\bWHERE\b[^`;]*/g),
    ].map((match) => match[0]);
    expect(whereClauses.length).toBeGreaterThan(0);
    for (const clause of whereClauses) {
      expect(clause).not.toMatch(/username/i);
    }
    expect(source).not.toMatch(/\bverifyPin\b/);
  });
});

/* ------------------------------------------------------------------ AC-27 */

describe("021 AC-27: nothing leads to /setup", () => {
  it("AC-27: /setup is not a protected path, and the middleware does not match it", () => {
    const config = read("src/lib/auth-config.ts") ?? "";
    const paths = /PROTECTED_PATHS\s*=\s*\[([^\]]*)\]/.exec(config)?.[1] ?? "";
    expect(paths).toContain('"/stock-entry"');
    expect(paths).not.toContain("/setup");
    expect(read("src/middleware.ts") ?? "").not.toContain("/setup");
  });

  it("AC-27: no href naming /setup appears under src/", () => {
    const HREF_TO_SETUP = /\bhref\s*[=:]\s*\{?\s*["'\x60][^"'\x60]*\/setup\b/;
    const offenders = repositoryFiles()
      .filter((file) => file.startsWith("src/") && CODE.test(file))
      .filter((file) => HREF_TO_SETUP.test(read(file) ?? ""));
    expect(offenders).toEqual([]);

    // Not vacuous: the same pattern finds a link to /setup written the way the sign-in page
    // writes its link to Create profile.
    const signInLink = /\bhref\s*=\s*"\/sign-in\/create"/.exec(read("src/app/sign-in/page.tsx") ?? "");
    expect(signInLink).not.toBeNull();
    expect(HREF_TO_SETUP.test((signInLink?.[0] ?? "").replace("/sign-in/create", "/setup"))).toBe(
      true,
    );
  });
});

/* ------------------------------------------------------------------ AC-30 (G2) */

/** Comments removed, so a comment naming a variable is not read as a read of it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

const UNDER_SRC_SERVER = /^(@\/server\/|(\.\.?\/)+src\/server\/)/;

/**
 * What stops `NEW_PIN` and `NEW_USERNAME` being read before anything that reaches Prisma's
 * client is evaluated: a static import of a module under `src/server/` other than `import
 * type`, a missing read or a missing dynamic import, or a read after the first dynamic
 * `import(` of one.
 */
function readOrderProblems(raw: string): string[] {
  const source = withoutComments(raw);
  const problems: string[] = [];

  const staticImports = [
    ...source.matchAll(/^\s*import\s+(?!type\b)[^;]*?\bfrom\s+["']([^"']+)["']/gm),
    ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
    ...source.matchAll(/^\s*export\s+[^;]*?\bfrom\s+["']([^"']+)["']/gm),
  ];
  for (const match of staticImports) {
    if (UNDER_SRC_SERVER.test(match[1] ?? "")) problems.push(`static import of ${match[1]}`);
  }
  for (const match of source.matchAll(/\brequire\(\s*["']([^"']+)["']\s*\)/g)) {
    if (UNDER_SRC_SERVER.test(match[1] ?? "")) problems.push(`require of ${match[1]}`);
  }

  const firstImport = [...source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)].find((match) =>
    UNDER_SRC_SERVER.test(match[1] ?? ""),
  );
  if (firstImport?.index === undefined) problems.push("no dynamic import( of src/server");

  for (const variable of ["NEW_PIN", "NEW_USERNAME"]) {
    const reads = new RegExp(
      String.raw`process\.env(?:\.${variable}\b|\[\s*["']${variable}["']\s*\])`,
    );
    const index = reads.exec(source)?.index;
    if (index === undefined) {
      problems.push(`${variable} is never read`);
    } else if (firstImport?.index !== undefined && index > firstImport.index) {
      problems.push(`${variable} is read after the first dynamic import( of src/server`);
    }
  }
  return problems;
}

describe("021 AC-30 (G2): the reset script reads its two variables before Prisma's client can fill them", () => {
  it("AC-30: scripts/pin-reset.ts has no static import of src/server other than import type, and reads NEW_PIN and NEW_USERNAME before its first dynamic import( of one", () => {
    expect(readOrderProblems(read("scripts/pin-reset.ts") ?? "")).toEqual([]);
  });

  it("AC-30: the order check is not vacuous: a moved read, a static import and a missing import are each caught", () => {
    const script = read("scripts/pin-reset.ts") ?? "";
    const pinRead = /^const \w+ = process\.env\.NEW_PIN \?\? "";\r?\n/m.exec(script)?.[0] ?? "";
    const usernameRead =
      /^const \w+ = process\.env\.NEW_USERNAME \?\? "";\r?\n/m.exec(script)?.[0] ?? "";
    expect(pinRead).not.toBe("");
    expect(usernameRead).not.toBe("");

    // Each read moved to the end of the file, after every import.
    for (const moved of [pinRead, usernameRead]) {
      expect(readOrderProblems(script.replace(moved, "") + moved)).toHaveLength(1);
    }
    const staticImport = ["import { db } from ", '"@/server/db";\n'].join("");
    expect(readOrderProblems(staticImport + script)).toEqual(["static import of @/server/db"]);
    const typeImport = ["import type { SessionUser } from ", '"@/server/auth/session-user";\n'];
    expect(readOrderProblems(typeImport.join("") + script)).toEqual([]);
    expect(readOrderProblems(script.replaceAll("import(", "load("))).toContain(
      "no dynamic import( of src/server",
    );
  });
});

/* ------------------------------------------------------------------ AC-41 */

describe("021 AC-41: the operations document says how to make each setting and how to set up", () => {
  // `docs/operations.md` → *Environment*, one `### ` entry per setting. Since 2026-09-25 it
  // holds what the retired settings template held (021 → Post-approval amendments).
  const section = operationsEnvironment();
  const entry = (variable: string): string => entryFor(section, variable);
  const COMMAND_WORD = /^(openssl|node|npx|npm|pnpm|python3?|head|pwsh|powershell|bun|deno)\b/;

  /** The commands an entry shows for generating a value: its code spans that begin with one. */
  function generationCommands(block: string): string[] {
    const spans = [...block.matchAll(/`([^`\n]+)`/g)]
      .map((match) => (match[1] ?? "").trim())
      .filter((span) => COMMAND_WORD.test(span));
    return [...new Set(spans)];
  }

  // Every assertion is a yes or no with a label, so a failure names the missing statement
  // without printing the document.
  const has = (text: string, pattern: RegExp): boolean => pattern.test(text);

  it("AC-41: PIN_PEPPER and SETUP_CODE each show the placeholder and the command AUTH_SECRET shows", () => {
    const commands = generationCommands(entry("AUTH_SECRET"));
    expect(commands.length, "a generation command in the AUTH_SECRET entry").toBeGreaterThan(0);

    for (const variable of ["PIN_PEPPER", "SETUP_CODE"]) {
      const block = entry(variable);
      expect(block !== "", `an entry for ${variable}`).toBe(true);
      const placeholder = new RegExp(
        String.raw`^${variable}=REPLACE_WITH_A_GENERATED_SECRET\s*$`,
        "m",
      );
      expect(has(block, placeholder), `${variable} shows REPLACE_WITH_A_GENERATED_SECRET`).toBe(true);
      commands.forEach((command, index) => {
        expect(block.includes(command), `${variable} shows AUTH_SECRET's command ${index + 1}`).toBe(
          true,
        );
      });
    }
  });

  it("AC-41: the command AUTH_SECRET shows makes a pepper password.ts accepts, long enough for a setup code", () => {
    const [command] = generationCommands(entry("AUTH_SECRET"));
    const script = /^node -e "([^"]+)"$/.exec(command ?? "")?.[1];
    expect(script !== undefined, "the command is node -e with a double-quoted script").toBe(true);

    // Run by this Node, with no shell. What it prints is a fresh random value, made for this
    // check only, and it is judged by yes or no, never printed.
    const result = spawnSync(process.execPath, ["-e", script ?? ""], { encoding: "utf8" });
    const made = (result.stdout ?? "").trim();

    expect(result.status, "the command exits 0").toBe(0);
    expect(isUsablePinPepper(made), "its output is a pepper password.ts accepts").toBe(true);
    expect(
      Array.from(made).length >= SETUP_CODE_MIN_LENGTH,
      `its output has at least ${SETUP_CODE_MIN_LENGTH} characters`,
    ).toBe(true);
  });

  it("AC-41: PIN_PEPPER differs per environment, is backed up outside the server like AUTH_SECRET, and changing or losing it invalidates every PIN", () => {
    const block = entry("PIN_PEPPER");
    const claims: [string, RegExp][] = [
      [
        "differs per environment",
        /\b(each|every|per|its own)\s+environment\b|\benvironment\s+(has|needs|gets)\s+its\s+own\b/i,
      ],
      ["is backed up", /\bback(ed)?[\s-]*(it\s+)?up\b/i],
      ["outside the server", /\boutside\b|\boff the server\b|\baway from the server\b/i],
      ["like AUTH_SECRET", /AUTH_SECRET/],
      ["changing or losing it", /\b(chang|los)/i],
      ["invalidates", /\binvalidat/i],
      ["every PIN", /\bevery\s+PIN\b|\ball\s+PINs\b/i],
      // The same claims, each held to one sentence, so words scattered across the entry
      // cannot pass for them.
      [
        "backed up outside the server like AUTH_SECRET, in one sentence",
        /\bback(ed)?[\s-]*(it\s+)?up\b[^.]*\boutside the server\b[^.]*AUTH_SECRET/i,
      ],
      [
        "changing or losing it invalidates every PIN, in one sentence",
        /\b(chang|los)[^.]*\binvalidat[^.]*\b(every\s+PIN|all\s+PINs)\b/i,
      ],
    ];
    expect(block !== "", "a PIN_PEPPER entry").toBe(true);
    for (const [claim, pattern] of claims) {
      expect(has(block, pattern), `PIN_PEPPER says ${claim}`).toBe(true);
    }
  });

  it("AC-41: SETUP_CODE is at least 16 characters and is used only until the first ADMIN exists", () => {
    const block = entry("SETUP_CODE");
    const claims: [string, RegExp][] = [
      ["16", /\b16\b/],
      ["characters", /\bcharacters?\b/i],
      ["the first ADMIN", /\bfirst\s+(ADMIN|administrator)\b/i],
      ["only until", /\b(only|until)\b/i],
      ["at least 16 characters, in one phrase", /\bat least 16 characters\b/i],
      [
        "used only until the first ADMIN exists, in one phrase",
        /\bonly until the first (ADMIN|administrator) exists\b/i,
      ],
    ];
    expect(block !== "", "a SETUP_CODE entry").toBe(true);
    for (const [claim, pattern] of claims) {
      expect(has(block, pattern), `SETUP_CODE says ${claim}`).toBe(true);
    }
  });

  it("AC-41: docs/operations.md describes first-run setup at /setup with the setup-code placeholder, and no marker is left", () => {
    const operations = readFileSync("docs/operations.md", "utf8");

    expect(operations).toContain("SETUP_CODE=<choose-a-setup-code>");
    expect(operations).toMatch(/^### First-run setup/m);
    expect(operations).toContain("`/setup`");
    expect(operations).not.toMatch(/added with `\/setup`/);
  });
});

/* ------------------------------------------------------------------ AC-43 */

describe("021 AC-43: the four new pages are dynamic and have no loading.tsx above them", () => {
  const PAGES = [
    "src/app/sign-in/create/page.tsx",
    "src/app/sign-in/requested/page.tsx",
    "src/app/setup/page.tsx",
    "src/app/profiles/page.tsx",
  ];

  it("AC-43: each declares force-dynamic", () => {
    for (const page of PAGES) {
      expect(read(page), page).toContain('export const dynamic = "force-dynamic";');
    }
  });

  it("AC-43: no loading.tsx or loading.ts sits at or above any of them", () => {
    for (const page of PAGES) {
      const segments = page.split("/").slice(0, -1);
      for (let depth = 2; depth <= segments.length; depth += 1) {
        const directory = segments.slice(0, depth).join("/");
        expect(existsSync(`${directory}/loading.tsx`), `${directory}/loading.tsx`).toBe(false);
        expect(existsSync(`${directory}/loading.ts`), `${directory}/loading.ts`).toBe(false);
      }
    }
  });
});

/* ------------------------------------------------------------------ AC-22 */

describe("021 AC-22: /profiles is an ADMIN's, refused as a service", () => {
  const ADMIN_FUNCTIONS = [
    "listProfiles",
    "approveProfile",
    "rejectProfile",
    "changeProfileRole",
    "resetProfilePin",
    "deactivateProfile",
    "clearAccountLock",
    "createProfile",
    "pinFailureSummary",
    "resumeNewDeviceSignIn",
  ];

  it("AC-22: PROTECTED_PATHS carries /profiles, and the matcher carries its static pattern", () => {
    const config = read("src/lib/auth-config.ts") ?? "";
    const paths = /PROTECTED_PATHS\s*=\s*\[([^\]]*)\]/.exec(config)?.[1] ?? "";
    expect(paths).toContain('"/profiles"');
    expect(read("src/middleware.ts") ?? "").toContain('"/profiles/:path*"');
  });

  it("AC-22: the page asks requireAdminPage for the key profiles before it reads anything", () => {
    const page = read("src/app/profiles/page.tsx") ?? "";
    const body = page.slice(page.indexOf("export default async function"));
    expect(body.indexOf('await requireAdminPage("profiles")')).toBeGreaterThan(0);
    expect(body.indexOf('await requireAdminPage("profiles")')).toBeLessThan(body.indexOf("listProfiles("));
  });

  it("AC-22: each of the ten exported functions of profile-admin-service.ts asserts ADMIN as its first statement", () => {
    const source = read("src/server/auth/profile-admin-service.ts") ?? "";
    const exported = [...source.matchAll(/^export async function (\w+)\(/gm)].map((match) => match[1]);
    expect(exported.filter((name) => name !== "toProfileListEntry").sort()).toEqual([...ADMIN_FUNCTIONS].sort());

    for (const name of ADMIN_FUNCTIONS) {
      const start = source.indexOf(`export async function ${name}(`);
      const bodyStart = source.indexOf("{\n", source.indexOf("): Promise<", start));
      const firstStatement = source.slice(bodyStart + 2).trimStart().split("\n")[0];
      expect(firstStatement, name).toBe('assertRole(actor, "ADMIN");');
    }
  });
});

/* ------------------------------------------------------------------ AC-37 */

describe("021 AC-37: /profiles carries the one identity header", () => {
  it("AC-37: the page renders IdentityHeader with the profile's name, and no header of its own", () => {
    const page = read("src/app/profiles/page.tsx") ?? "";
    expect(page).toContain('import { IdentityHeader } from "@/components/IdentityHeader";');
    expect(page).toContain("<IdentityHeader");
    expect(page).toContain("name={user.name}");
    expect(page).not.toMatch(/<header\b/);
    expect(page).not.toContain("user.username");
  });
});
