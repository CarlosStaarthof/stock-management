import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as messages from "@/lib/auth-messages";
import { generatePin } from "@/server/auth/credential-rules";

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
  const SETUP_CODE_ASSIGNMENT = new RegExp(
    String.raw`\b\w*setup_?code\w*["']?\s*[:=]\s*["'\x60]?([^\s"'\x60,;)]{16,})`,
    "gi",
  );

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

  it("AC-8: no literal that could be a setup code is assigned to a setup-code name, and .env.example assigns no NEW_PIN", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const source = read(file);
      if (source === undefined) continue;
      for (const match of source.matchAll(SETUP_CODE_ASSIGNMENT)) {
        const value = match[1] ?? "";
        // An identifier or a call is a value computed at runtime, not a written-down code.
        if (PLACEHOLDERS.has(value) || /^[A-Za-z_$][\w$.]*\(?$/.test(value)) continue;
        offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);

    const example = read(".env.example") ?? "";
    expect(example).not.toMatch(/^\s*NEW_PIN\s*=\s*\S/m);
  });

  it("AC-8: the scans are not vacuous — each pattern catches the shape it names", () => {
    const digits = generatePin(4);
    expect(pinPatterns[0]?.test(`const newPin = "${digits}";`)).toBe(true);
    expect(pinPatterns[1]?.test(`if (pin === "${digits}")`)).toBe(true);
    expect(pinPatterns[4]?.test(`page.getByLabel("PIN").fill("${digits}")`)).toBe(true);
    const code = "x".repeat(20);
    expect([...["SETUP_CODE", code].join("=").matchAll(SETUP_CODE_ASSIGNMENT)]).toHaveLength(1);
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
