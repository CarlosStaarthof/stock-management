import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Spec 016 AC-17: a destructive migration has to say so.
 *
 * `prisma migrate deploy` runs in the production build BEFORE the new release is promoted
 * (D8), so for a moment the previous release serves on the new schema, and an Instant
 * Rollback (R1) puts it back there for good. Every migration after go-live must therefore
 * keep the previous release working. A statement that removes, renames, retypes or
 * tightens something the previous release may still use ships only in a migration whose
 * SQL carries a line beginning `-- contract-step:`, saying which earlier release stopped
 * using it (`docs/conventions.md` → *Database*).
 *
 * The rule starts after `20260925120000_pin_profiles`, the last migration written before
 * the first release. That one is the detector's non-vacuity case: it drops three columns.
 */

const MIGRATIONS_DIR = "prisma/migrations";
const LAST_BEFORE_GO_LIVE = "20260925120000_pin_profiles";
const CONTRACT_STEP = /^-- contract-step:/m;

type Offence = { statement: string; shapes: string[] };

/**
 * Two same-length copies of the SQL: `clean`, with every comment blanked out, and
 * `masked`, which also blanks the inside of every quoted string and quoted identifier. The
 * rules read `masked`, so a keyword inside a name, a string or a comment cannot trigger
 * one; a failure quotes `clean`, so it names the real statement. Dollar-quoted bodies are
 * kept: they are code, and a destructive statement inside one still counts.
 */
function prepare(sql: string): { clean: string; masked: string } {
  // Split by UTF-16 unit, as `sql[index]` indexes it, so the two copies stay aligned.
  const clean = sql.split("");
  const masked = sql.split("");
  const blank = (from: number, to: number, copies: string[][], filler: string): void => {
    for (let index = from; index < to; index += 1) {
      for (const copy of copies) if (copy[index] !== "\n") copy[index] = filler;
    }
  };

  let index = 0;
  while (index < sql.length) {
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index);
      const stop = end === -1 ? sql.length : end;
      blank(index, stop, [clean, masked], " ");
      index = stop;
    } else if (sql.startsWith("/*", index)) {
      const end = sql.indexOf("*/", index + 2);
      const stop = end === -1 ? sql.length : end + 2;
      blank(index, stop, [clean, masked], " ");
      index = stop;
    } else if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index];
      let end = index + 1;
      while (end < sql.length) {
        if (sql[end] === quote && sql[end + 1] === quote) end += 2;
        else if (sql[end] === quote) break;
        else end += 1;
      }
      blank(index + 1, end, [masked], "_");
      index = end + 1;
    } else {
      index += 1;
    }
  }
  return { clean: clean.join(""), masked: masked.join("") };
}

/** Where `text` splits on `separator` outside parentheses, as [start, end) pairs. */
function topLevelSpans(text: string, separator: string): [number, number][] {
  const spans: [number, number][] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === separator && depth === 0) {
      spans.push([start, index]);
      start = index + 1;
    }
  }
  spans.push([start, text.length]);
  return spans;
}

const oneLine = (text: string): string => text.replace(/\s+/g, " ").trim();

const STATEMENT_RULES: readonly [string, RegExp][] = [
  ["drops a table", /\bDROP\s+TABLE\b/i],
  ["drops a type", /\bDROP\s+TYPE\b/i],
  ["renames something", /\bRENAME\b/i],
  ["adds an enum value", /\bALTER\s+TYPE\b.*\bADD\s+VALUE\b/i],
  ["deletes rows", /\bDELETE\s+FROM\b/i],
  ["truncates rows", /\bTRUNCATE\b/i],
];

const NOT_A_COLUMN = /^(?:CONSTRAINT|PRIMARY|UNIQUE|FOREIGN|CHECK|EXCLUDE)\b/i;

/** The shapes one action of an `ALTER TABLE` statement has. */
function actionShapes(action: string): string[] {
  const shapes: string[] = [];
  const drop = /^DROP\s+(?:COLUMN\s+)?(?:IF\s+EXISTS\s+)?(.*)$/i.exec(action);
  if (drop !== null && !NOT_A_COLUMN.test(drop[1] ?? "")) shapes.push("drops a column");

  const alter = /^ALTER\s+(?:COLUMN\s+)?\S+\s+(.*)$/i.exec(action);
  if (alter !== null) {
    const change = alter[1] ?? "";
    if (/^(?:SET\s+DATA\s+)?TYPE\b/i.test(change)) shapes.push("changes a column's type");
    if (/^SET\s+NOT\s+NULL\b/i.test(change)) shapes.push("sets a column NOT NULL");
  }

  const add = /^ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(.*)$/i.exec(action);
  if (add !== null && !NOT_A_COLUMN.test(add[1] ?? "")) {
    if (/\bNOT\s+NULL\b/i.test(action) && !/\bDEFAULT\b/i.test(action)) {
      shapes.push("adds a NOT NULL column with no DEFAULT");
    }
  }
  return shapes;
}

/** Every statement of `sql` that does something the previous release may not survive. */
function destructiveStatements(sql: string): Offence[] {
  const { clean, masked } = prepare(sql);
  const offences: Offence[] = [];
  for (const [start, end] of topLevelSpans(masked, ";")) {
    const statement = oneLine(masked.slice(start, end));
    if (statement === "") continue;
    const shapes = STATEMENT_RULES.filter(([, rule]) => rule.test(statement)).map(([shape]) => shape);

    const alterTable = /^ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?\S+\s+(.*)$/i.exec(statement);
    if (alterTable !== null) {
      const actions = alterTable[1] ?? "";
      for (const [from, to] of topLevelSpans(actions, ",")) {
        shapes.push(...actionShapes(oneLine(actions.slice(from, to))));
      }
    }

    if (shapes.length > 0) {
      offences.push({ statement: oneLine(clean.slice(start, end)), shapes: [...new Set(shapes)] });
    }
  }
  return offences;
}

/** The migrations the rule covers: every directory named after the last one before go-live. */
function migrationsAfterGoLive(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name > LAST_BEFORE_GO_LIVE)
    .map((entry) => entry.name)
    .sort();
}

function migrationSql(name: string): string {
  return readFileSync(join(MIGRATIONS_DIR, name, "migration.sql"), "utf8");
}

describe("016 AC-17: a destructive migration has to say so", () => {
  it("AC-17: no migration after 20260925120000_pin_profiles has a destructive statement without a -- contract-step: line", () => {
    const failures: string[] = [];
    for (const name of migrationsAfterGoLive()) {
      const sql = migrationSql(name);
      if (CONTRACT_STEP.test(sql)) continue;
      for (const offence of destructiveStatements(sql)) {
        failures.push(`${name}: ${offence.shapes.join(", ")}: ${offence.statement}`);
      }
    }

    expect(failures).toEqual([]);
  });

  it("AC-17: the rule starts where it should: the anchor migration exists and is not itself covered", () => {
    expect(existsSync(join(MIGRATIONS_DIR, LAST_BEFORE_GO_LIVE, "migration.sql"))).toBe(true);
    expect(migrationsAfterGoLive()).not.toContain(LAST_BEFORE_GO_LIVE);
    expect("20260925120001_next" > LAST_BEFORE_GO_LIVE).toBe(true);
  });

  it("AC-17 (non-vacuity): the detector flags the DROP COLUMN statement of 20260925120000_pin_profiles, and nothing else in it", () => {
    const offences = destructiveStatements(migrationSql(LAST_BEFORE_GO_LIVE));

    expect(offences).toHaveLength(1);
    expect(offences[0]?.shapes).toEqual(["drops a column"]);
    expect(offences[0]?.statement).toBe(
      'ALTER TABLE "User" DROP COLUMN "email", DROP COLUMN "passwordHash", DROP COLUMN "active"',
    );
    expect(CONTRACT_STEP.test(migrationSql(LAST_BEFORE_GO_LIVE))).toBe(false);
  });

  it("AC-17 (non-vacuity): it flags a synthetic example of each shape", () => {
    const examples: [string, string][] = [
      ['DROP TABLE "Item";', "drops a table"],
      ['DROP TABLE IF EXISTS "Item" CASCADE;', "drops a table"],
      ['ALTER TABLE "Item" DROP COLUMN "note";', "drops a column"],
      ['ALTER TABLE "Item" DROP "note";', "drops a column"],
      ['DROP TYPE "Role";', "drops a type"],
      ['ALTER TABLE "Item" RENAME COLUMN "note" TO "remark";', "renames something"],
      ['ALTER TABLE "Item" RENAME TO "Article";', "renames something"],
      ["ALTER TYPE \"Role\" RENAME VALUE 'ADMIN' TO 'OWNER';", "renames something"],
      ['ALTER INDEX "Item_pkey" RENAME TO "Article_pkey";', "renames something"],
      ['ALTER TABLE "Item" ALTER COLUMN "note" SET DATA TYPE VARCHAR(10);', "changes a column's type"],
      ['ALTER TABLE "Item" ALTER COLUMN "note" TYPE TEXT USING "note"::TEXT;', "changes a column's type"],
      ['ALTER TABLE "Item" ALTER COLUMN "note" SET NOT NULL;', "sets a column NOT NULL"],
      ['ALTER TABLE "Item" ADD COLUMN "code" TEXT NOT NULL;', "adds a NOT NULL column with no DEFAULT"],
      ['ALTER TABLE "Item" ADD "code" TEXT NOT NULL;', "adds a NOT NULL column with no DEFAULT"],
      ['ALTER TABLE "Item" ADD COLUMN "a" TEXT NOT NULL DEFAULT \'\', ADD COLUMN "b" INTEGER NOT NULL;', "adds a NOT NULL column with no DEFAULT"],
      ["ALTER TYPE \"Role\" ADD VALUE 'AUDITOR';", "adds an enum value"],
      ["ALTER TYPE \"Role\" ADD VALUE IF NOT EXISTS 'AUDITOR' BEFORE 'ADMIN';", "adds an enum value"],
      ["DELETE FROM \"AuthEvent\" WHERE \"kind\" = 'PIN_FAILURE';", "deletes rows"],
      ['TRUNCATE TABLE "AuthEvent";', "truncates rows"],
      ["DO $$ BEGIN EXECUTE 'x'; DROP TABLE \"Item\"; END $$;", "drops a table"],
    ];
    for (const [sql, shape] of examples) {
      const shapes = destructiveStatements(sql).flatMap((offence) => offence.shapes);
      expect(shapes, sql).toContain(shape);
    }
  });

  it("AC-17 (non-vacuity): it passes CREATE TABLE, CREATE INDEX, a nullable ADD COLUMN and a NOT NULL DEFAULT one", () => {
    const safe = [
      'CREATE TABLE "Note" ("id" TEXT NOT NULL, "body" TEXT NOT NULL, CONSTRAINT "Note_pkey" PRIMARY KEY ("id"));',
      'CREATE INDEX "Note_body_idx" ON "Note"("body");',
      'CREATE UNIQUE INDEX "Note_id_key" ON "Note"("id");',
      'ALTER TABLE "Item" ADD COLUMN "code" TEXT;',
      "ALTER TABLE \"Item\" ADD COLUMN \"code\" TEXT NOT NULL DEFAULT '';",
      'ALTER TABLE "Item" ADD COLUMN "count" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "tag" TEXT;',
      'ALTER TABLE "Item" ALTER COLUMN "note" DROP NOT NULL;',
      'ALTER TABLE "Item" ALTER COLUMN "note" SET DEFAULT 0;',
      'ALTER TABLE "Item" ADD CONSTRAINT "Item_code_present" CHECK ("code" IS NOT NULL);',
      'ALTER TABLE "Item" DROP CONSTRAINT "Item_code_present";',
      'ALTER TABLE "Item" ADD CONSTRAINT "Item_x_fkey" FOREIGN KEY ("x") REFERENCES "X"("id") ON DELETE RESTRICT ON UPDATE CASCADE;',
      'DROP INDEX "User_email_key";',
      "CREATE TYPE \"Kind\" AS ENUM ('A', 'B');",
      "INSERT INTO \"Location\" (\"id\", \"name\") VALUES ('x', 'Rename, drop table and delete from are only words here');",
      '-- DROP TABLE "Item"; a comment is not a statement',
      'ALTER TABLE "Item" ADD COLUMN "renamedAt" TIMESTAMP(3);',
    ];
    for (const sql of safe) {
      expect(destructiveStatements(sql), sql).toEqual([]);
    }
  });

  it("AC-17 (non-vacuity): a migration carrying a -- contract-step: line is let through, and only a line beginning with it counts", () => {
    const destructive = 'ALTER TABLE "Item" DROP COLUMN "note";';
    const declared = `-- contract-step: release abc1234 stopped reading Item.note\n${destructive}`;
    const mentioned = `-- this is not a -- contract-step: line\n${destructive}`;

    expect(CONTRACT_STEP.test(declared)).toBe(true);
    expect(CONTRACT_STEP.test(mentioned)).toBe(false);
    expect(destructiveStatements(declared)).toHaveLength(1);
  });

  it("AC-17: docs/conventions.md → Database states the rule", () => {
    const conventions = readFileSync("docs/conventions.md", "utf8");
    const database = conventions.slice(conventions.indexOf("## Database"), conventions.indexOf("## Tests"));

    expect(database).toContain("-- contract-step:");
    expect(database).toMatch(/after go-live, a migration must leave the previous release working/i);
    expect(database).toMatch(/a destructive step ships only after the release that stopped using what it removes/i);
  });
});
