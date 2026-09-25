import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { operationsEnvironment } from "../support/env-file";

/**
 * Spec 002 AC-7 and AC-8 and 003 AC-30, automated, as amended by the owner's decision of
 * 2026-09-25 (021 → Post-approval amendments → *`.env` is the only settings file*). Run by
 * `npm run test:unit`, so the checks cannot rot into a paragraph nobody executes. It reads
 * files from disk on purpose: the point is what the repository contains, not what anybody
 * remembers putting there.
 *
 * AC-8's detector is used verbatim, and no file is exempt from it. A hit is an offence
 * unless it is a documented placeholder: fake credentials against a host that cannot
 * resolve, with no dot in it or under an RFC 2606 reserved name such as `.invalid` or
 * `example.com`. This allowance exists because AC-9 dictates the fixture strings `…u:p@h/db`
 * and `…u:p@h2/db`, which the spec and `feature_list.json` both quote: AC-8's detector fires
 * on the spec that defines it. See progress/impl_app_scaffold.md. Source, test, script and
 * configuration files get no allowance at all: see the third test.
 *
 * There is no committed settings template any more, and no file whose name begins with
 * `.env` may be committed. `.env` itself is checked by `tests/unit/env-file.test.ts`, which
 * prints no value. AC-7's and AC-30's documentation halves are checked here, against
 * `docs/operations.md` → *Environment*, which says what each setting is and how to make it.
 */

// Assembled from two halves so that this file does not itself contain the string it
// forbids. It is the pattern AC-8 names, character for character.
const CREDENTIAL_PATTERN = new RegExp("postgres(ql)?://[^\\s]*:[^\\s]*" + "@");

// Same shape, with the user-info and host captured so a hit can be judged.
const CREDENTIAL_PARTS = new RegExp("postgres(?:ql)?://([^\\s@]*)" + "@([^\\s/?\"'`\\\\)\\]]*)", "g");

// Empty since 2026-09-25: its one entry, the settings template, was retired with the file.
const CREDENTIAL_EXEMPT: ReadonlySet<string> = new Set();

const PLACEHOLDER_USER_INFO = new Set(["u:p", "USER:PASSWORD"]);

// RFC 2606 / RFC 6761 reserved names. A host under one of these can never resolve, so a
// connection string pointing at it is documentation, not a credential. Added 2026-09-08:
// the original rule accepted only dotless hosts, which rejected `…@host.invalid` — the
// unresolvable host the reviewer used to prove AC-5, quoted in its own report. A real
// host such as `neon.tech` still fails this test; see the mutation proof in
// progress/history.md.
const RESERVED_HOST = /(^|\.)(invalid|test|example|localhost)$|(^|\.)example\.(com|net|org)$/i;

/** True when the host is provably not a real machine. */
function isUnresolvableHost(host: string): boolean {
  const withoutPort = host.replace(/:\d+$/, "");
  return !withoutPort.includes(".") || RESERVED_HOST.test(withoutPort);
}

// Code and configuration, as opposed to documents. `feature_list.json` and everything
// under `specs/` are documents: they quote AC-9's fixture strings and are judged by the
// placeholder-aware test above.
const CODE_PATHS = /^(src|tests|scripts|prisma)\/|^[^/]+\.(ts|tsx|mjs|cjs|js)$|^(package|tsconfig)\.json$/;

const MAX_SCANNED_BYTES = 8 * 1024 * 1024;

function git(args: string[]): { status: number; stdout: string } {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return { status: result.status ?? 1, stdout: result.stdout ?? "" };
}

/** Everything git would carry: tracked files plus new files that are not ignored. */
function repositoryFiles(): string[] {
  const { stdout } = git(["ls-files", "--cached", "--others", "--exclude-standard"]);
  return stdout
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

function matchingLines(content: string): string[] {
  return content.split("\n").filter((line) => CREDENTIAL_PATTERN.test(line));
}

/** True when every connection string on the line is fake credentials at an unresolvable host. */
function isPlaceholderLine(line: string): boolean {
  const matches = [...line.matchAll(CREDENTIAL_PARTS)];
  if (matches.length === 0) return false;
  return matches.every(([, userInfo, host]) => {
    return PLACEHOLDER_USER_INFO.has(userInfo ?? "") && isUnresolvableHost(host ?? "");
  });
}

describe("repository hygiene", () => {
  it("AC-8: .env is ignored by git and is not tracked", () => {
    const ignored = git(["check-ignore", ".env"]);
    const tracked = git(["ls-files", ".env"]);

    expect(ignored.status).toBe(0);
    expect(tracked.stdout.trim()).toBe("");
  });

  it("AC-8: no file in the repository holds a real connection string", () => {
    const offenders: string[] = [];

    for (const file of repositoryFiles()) {
      if (CREDENTIAL_EXEMPT.has(file)) continue;
      const content = readIfScannable(file);
      if (content === undefined) continue;

      const hits = matchingLines(content);
      if (hits.length > 0 && !hits.every(isPlaceholderLine)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it("AC-8: no source, test, script or configuration file holds a connection string at all", () => {
    const offenders: string[] = [];

    for (const file of repositoryFiles()) {
      if (!CODE_PATHS.test(file)) continue;
      const content = readIfScannable(file);
      if (content === undefined) continue;

      if (matchingLines(content).length > 0) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it("AC-8, amended 2026-09-25: no file in the repository has a name beginning with .env", () => {
    // Tracked files and new files git would carry: a negation added to .gitignore would let
    // a settings file through, and this is what catches it.
    const offenders = repositoryFiles().filter((file) =>
      (file.split("/").pop() ?? "").startsWith(".env"),
    );

    expect(offenders).toEqual([]);
  });

  describe("docs/operations.md → Environment says what each setting is", () => {
    const section = operationsEnvironment();
    // A document, not a secret: still, each check is a labelled yes or no, so a failure
    // names the missing statement instead of printing the section.
    const says = (pattern: RegExp): boolean => pattern.test(section);

    it("AC-7 and 003 AC-30: the section exists and names the four settings and the two test ones", () => {
      expect(section !== "", "docs/operations.md has a ## Environment section").toBe(true);

      for (const variable of [
        "DATABASE_URL",
        "DIRECT_URL",
        "AUTH_SECRET",
        "AUTH_URL",
        "TEST_DATABASE_URL",
        "TEST_DIRECT_URL",
      ]) {
        expect(section.includes(`\`${variable}\``), `Environment names ${variable}`).toBe(true);
      }
    });

    it("AC-7: it says DATABASE_URL is pooled, with -pooler in its host, that DIRECT_URL is unpooled, and that migrations use DIRECT_URL because they fail through a pooler", () => {
      const statements: [string, RegExp][] = [
        ["the pooled host contains -pooler", /\bpooled\b[^.]*host contains `-pooler`/i],
        ["DATABASE_URL is the pooled string", /`DATABASE_URL` is the pooled\b/],
        ["DIRECT_URL is the unpooled string", /`DIRECT_URL` is the unpooled\b/],
        [
          "migrations use DIRECT_URL because they fail through a pooler",
          /\bmigrations? use `DIRECT_URL`[^.]*\bbecause\b[^.]*\bfail[^.]*\bpooler\b/i,
        ],
      ];
      for (const [statement, pattern] of statements) {
        expect(says(pattern), `Environment says ${statement}`).toBe(true);
      }
    });

    it("003 AC-30: it says what the test database is for, and that npm run test:db empties it", () => {
      const statements: [string, RegExp][] = [
        ["npm run test:db empties the test database", /`npm run test:db` empties the test database\b/],
        ["the test database is separate", /\bseparate\b/i],
        ["TEST_DIRECT_URL is unpooled", /`TEST_DIRECT_URL` is its unpooled\b/],
        ["TEST_DIRECT_URL is on a different host from DIRECT_URL", /different host from `DIRECT_URL`/],
      ];
      for (const [statement, pattern] of statements) {
        expect(says(pattern), `Environment says ${statement}`).toBe(true);
      }
    });
  });
});
