import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 002 AC-8, automated. Run by `npm run test:unit`, so the check cannot rot into a
 * paragraph nobody executes. It reads files from disk on purpose: the point is what the
 * repository contains, not what anybody remembers putting there.
 *
 * AC-8's detector is used verbatim. Two things then decide whether a hit is a problem:
 *
 *  - `.env.example` is exempt by AC-8 itself, and the exemption is closed by the third
 *    test below, which proves the file is still a placeholder.
 *  - Anywhere else, a hit is an offence unless it is a documented placeholder — fake
 *    credentials against a host that cannot resolve - no dot in it, or under an RFC 2606
 *    reserved name such as `.invalid` or `example.com`. This
 *    allowance exists because AC-9 dictates the fixture strings `…u:p@h/db` and
 *    `…u:p@h2/db`, which the spec and `feature_list.json` both quote: AC-8's detector
 *    fires on the spec that defines it. See progress/impl_app_scaffold.md.
 *
 * Source, test, script and configuration files get no allowance at all — see the second
 * test.
 */

// Assembled from two halves so that this file does not itself contain the string it
// forbids. It is the pattern AC-8 names, character for character.
const CREDENTIAL_PATTERN = new RegExp("postgres(ql)?://[^\\s]*:[^\\s]*" + "@");

// Same shape, with the user-info and host captured so a hit can be judged.
const CREDENTIAL_PARTS = new RegExp("postgres(?:ql)?://([^\\s@]*)" + "@([^\\s/?\"'`\\\\)\\]]*)", "g");

const CREDENTIAL_EXEMPT = new Set([".env.example"]);

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

  it("AC-8: .env.example is a placeholder, not a real credential", () => {
    const example = readFileSync(".env.example", "utf8");

    // The exemption above is a hole unless the exempt file is proved harmless: a real
    // Neon string pasted into .env.example would otherwise pass unnoticed.
    expect(example).toContain("USER:PASSWORD");
    expect(example).not.toContain("neon.tech");

    // Stronger than the two literal checks AC-8 asks for: every host in the file is
    // under .invalid, a TLD reserved by RFC 2606 that can never resolve.
    const hosts = [...example.matchAll(CREDENTIAL_PARTS)].map(([, , host]) => host ?? "");
    expect(hosts.length).toBeGreaterThan(0);
    for (const host of hosts) {
      expect(host.endsWith(".invalid")).toBe(true);
    }
  });

  it("003 AC-30: .env.example documents the test database alongside the other four", () => {
    const example = readFileSync(".env.example", "utf8");

    // `npm run test:db` deletes every row between tests. The template has to say which
    // variable points at the database it is allowed to do that to, or the first person to
    // run it points it at their own.
    for (const variable of ["TEST_DATABASE_URL", "TEST_DIRECT_URL"]) {
      expect(example).toMatch(new RegExp(`^${variable}=`, "m"));
    }

    // Placeholders, not credentials: the user info is USER:PASSWORD and the host is
    // under .invalid, which can never resolve (RFC 2606).
    const assignments = example
      .split("\n")
      .filter((line) => /^TEST_(DATABASE|DIRECT)_URL=/.test(line));

    expect(assignments).toHaveLength(2);
    for (const line of assignments) {
      const [, userInfo, host] = [...line.matchAll(CREDENTIAL_PARTS)][0] ?? [];
      expect(userInfo).toBe("USER:PASSWORD");
      expect((host ?? "").replace(/:\d+$/, "").endsWith(".invalid")).toBe(true);
    }
  });

  it("AC-7: .env.example documents all four variables and the pooled/direct split", () => {
    const example = readFileSync(".env.example", "utf8");

    for (const variable of ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "AUTH_URL"]) {
      expect(example).toMatch(new RegExp(`^${variable}=`, "m"));
    }

    expect(example).toContain("-pooler");
    expect(example).toMatch(/pooled/i);
    expect(example).toMatch(/unpooled/i);
    expect(example).toMatch(/migrat/i);
  });
});
