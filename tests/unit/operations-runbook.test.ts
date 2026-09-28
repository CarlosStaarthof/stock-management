import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Spec 016 AC-18: `docs/operations.md` is the runbook. It gains three sections, carries the
 * literals the release depends on, and holds placeholders only: the repository's credential
 * and placeholder scans (`repo-hygiene`, `no-default-password`, 021 AC-8) read it with every
 * other tracked file, and pass over the new text.
 *
 * Every assertion is a labelled yes or no, so a failure names the missing statement rather
 * than printing the document.
 */
const operations = readFileSync("docs/operations.md", "utf8");

/** From `## <heading>` to the next `## ` heading. */
function section(heading: string): string {
  const lines = operations.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `## ${heading}`);
  if (start === -1) return "";
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

describe("016 AC-18: docs/operations.md is the runbook", () => {
  it("AC-18: it has ## Production, ## Backup and restore and ## Rollback", () => {
    for (const heading of ["Production", "Backup and restore", "Rollback"]) {
      expect(section(heading) !== "", `## ${heading}`).toBe(true);
    }
  });

  it("AC-18: it carries each literal the release depends on", () => {
    for (const literal of [
      "Pushing `main` deploys nothing.",
      "lhr1",
      "stock-management-zeta-one.vercel.app",
      "npm run verify:deploy",
      "npm run operator:production",
      "db:export",
      "db:restore",
      "-- contract-step:",
      "SKIPPED",
    ]) {
      expect(operations.includes(literal), literal).toBe(true);
    }
  });

  it("AC-18: it names OD1 to OD3, F1 to F9 and V1 to V8", () => {
    const names = [
      ...[1, 2, 3].map((n) => `OD${n}`),
      ...Array.from({ length: 9 }, (_, i) => `F${i + 1}`),
      ...Array.from({ length: 8 }, (_, i) => `V${i + 1}`),
    ];
    for (const name of names) {
      expect(new RegExp(`\\b${name}\\b`).test(operations), name).toBe(true);
    }
  });

  it("AC-18: the facts are one table, F1 to F9 and V1 to V8, each row with a Confirmed on cell", () => {
    const production = section("Production");
    expect(production.includes("| # | Fact | Value, as read | Confirmed on |"), "the table's header").toBe(true);

    for (const name of [...Array.from({ length: 9 }, (_, i) => `F${i + 1}`), ...Array.from({ length: 8 }, (_, i) => `V${i + 1}`)]) {
      const row = production.split("\n").find((line) => line.startsWith(`| ${name} |`)) ?? "";
      const cells = row.split("|").slice(1, -1).map((cell) => cell.trim());
      expect(cells.length, `${name} has four cells`).toBe(4);
      expect((cells[3] ?? "") !== "", `${name} has a Confirmed on cell`).toBe(true);
    }
  });

  it("AC-18: every owner decision carries its risk, and the release procedure exports before a migration", () => {
    const production = section("Production");
    for (const name of ["OD1", "OD2", "OD3"]) {
      const row = production.split("\n").find((line) => line.startsWith(`| ${name} |`)) ?? "";
      expect(row.split("|").slice(1, -1).filter((cell) => cell.trim() !== "").length, `${name} has a decision and a risk`).toBe(3);
    }
    expect(/If the release carries a migration, the owner first exports a copy/.test(production), "export before a migration").toBe(true);
    expect(/No secret value ever goes into a chat, a file in the repository or a log\./.test(production), "no secret in chat, repository or log").toBe(true);
  });

  it("AC-18: every form of npm run operator:production and both passes of npm run verify:deploy are shown", () => {
    for (const form of [
      "db:census",
      "db:export --out <file>",
      "db:restore --in <file>",
      "pin:reset --list",
      "pin:reset --profile <id>",
      "migrate:status",
      "migrate:resolve --rolled-back <migration>",
      "migrate:resolve --applied <migration>",
    ]) {
      expect(operations.includes(`npm run operator:production -- ${form}`), form).toBe(true);
    }
    expect(operations.includes("npm run verify:deploy -- --url https://stock-management-zeta-one.vercel.app --expect-commit <")).toBe(true);
    expect(operations.includes("npm run verify:deploy -- --url https://stock-management-zeta-one.vercel.app --signed-in")).toBe(true);
  });

  it("AC-18: backup and restore covers both layers, the schedule, the copy log, Drive with its SHA-256 check, the restore with the first ADMIN's PIN, and both drills", () => {
    const backup = section("Backup and restore");
    const statements: [string, RegExp][] = [
      ["layer 1", /Layer 1: Neon's 6-hour history/],
      ["layer 2", /Layer 2: the copy/],
      ["the schedule", /after each month's counts are approved, and \*\*before every release that carries a\s+migration\*\*/],
      ["the copy log", /\*\*The copy log\.\*\*/],
      ["the owner's Google Drive, uploaded by hand", /the owner's Google Drive\.\*\* The owner uploads each export by hand/],
      ["checked against the export's SHA-256", /checks its SHA-256\s+against the one the export printed/],
      ["restoring production from the copy", /### Restoring production from the copy/],
      ["giving the first ADMIN a PIN", /\*\*Give the first `ADMIN` a PIN\.\*\*/],
      ["the copy drill and what it proves", /The copy drill \(AC-28\)\.\*\*[\s\S]*\*\*It proves\*\*/],
      ["the history drill and what it proves", /The history drill \(AC-29\)\.\*\*[\s\S]*\*\*It proves\*\*/],
      ["what neither proves", /\*\*Neither drill proves\*\* that restoring `production` in place works/],
      ["where the secrets are kept", /### Secrets kept outside the server/],
    ];
    for (const [label, pattern] of statements) {
      expect(pattern.test(backup), label).toBe(true);
    }
  });

  it("AC-18: rollback carries R1 to R3", () => {
    const rollback = section("Rollback");
    for (const name of ["R1", "R2", "R3"]) {
      expect(rollback.includes(`**${name},`), name).toBe(true);
    }
  });

  it("AC-18: the new sections hold placeholders only: no connection string, no assigned secret and no quoted PIN-shaped number", () => {
    const added = [section("Production"), section("Backup and restore"), section("Rollback")].join("\n");
    const connection = new RegExp(["postgres(ql)?", "://"].join(""), "i");
    const assigned = /\b(?:DATABASE_URL|DIRECT_URL|AUTH_SECRET|PIN_PEPPER|SETUP_CODE|NEW_PIN)\s*[:=]/;
    const quotedNumber = /["'`](?:\d{4}|\d{6})["'`]/;

    expect(connection.test(added), "a connection string").toBe(false);
    expect(assigned.test(added), "an assigned setting").toBe(false);
    expect(quotedNumber.test(added), "a quoted 4- or 6-digit number").toBe(false);
  });
});
