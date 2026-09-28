import { randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { exportDatabase } from "@/server/deploy/export";
import { resetTestDb } from "@/server/test-db";
import { buildExportFixture, schemaModels } from "../../../tests/support/export-fixture";
import { runPrisma, runScript } from "../../../tests/support/run-script";

/**
 * Spec 016 AC-10: a copy restores only into an empty schema, and proves it restored.
 *
 * Every restore here writes into a throwaway schema that the test creates in the TEST
 * database and drops afterwards; nothing is ever restored into `public`. The copy is AC-9's
 * fixture, exported from the test database's `public`.
 */

type ExportFile = {
  format: string;
  exportedAt: string;
  migrations: string[];
  omitted: string[];
  omittedPendingRequests: number;
  tables: Record<string, { count: number; rows: Record<string, unknown>[] }>;
};

const MIGRATION_COUNT = readdirSync("prisma/migrations").filter((name) =>
  statSync(join("prisma/migrations", name)).isDirectory(),
).length;

let scratch = "";
let schemas: string[] = [];

beforeEach(async () => {
  await resetTestDb();
  scratch = mkdtempSync(join(tmpdir(), "macroads-restore-"));
  schemas = [];
});

afterEach(async () => {
  for (const schema of schemas) {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
  rmSync(scratch, { recursive: true, force: true });
});

/** A new, empty schema in the test database, dropped after the test. */
async function throwawaySchema(): Promise<string> {
  const schema = `restore_${randomBytes(6).toString("hex")}`;
  schemas.push(schema);
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  return schema;
}

/** This run's environment, with both connection strings naming `schema`. */
function envFor(schema: string, directSchema: string = schema): NodeJS.ProcessEnv {
  const pointed = (value: string | undefined, name: string): string => {
    const url = new URL(value ?? "");
    url.searchParams.set("schema", name);
    return url.toString();
  };
  return {
    ...process.env,
    DATABASE_URL: pointed(process.env.DATABASE_URL, schema),
    DIRECT_URL: pointed(process.env.DIRECT_URL, directSchema),
  };
}

/** AC-9's fixture, exported from `public` and written to a file outside the repository. */
async function exportedFixture(): Promise<{ path: string; text: string; printedNever: string[] }> {
  const { printedNever } = await buildExportFixture();
  const { text } = await exportDatabase("public");
  const path = join(scratch, `copy-${randomBytes(4).toString("hex")}.json`);
  writeFileSync(path, text, "utf8");
  return { path, text, printedNever };
}

/** A tampered copy, written beside the original. */
function tampered(text: string, change: (file: ExportFile) => void): string {
  const file = JSON.parse(text) as ExportFile;
  change(file);
  const path = join(scratch, `tampered-${randomBytes(4).toString("hex")}.json`);
  writeFileSync(path, JSON.stringify(file, null, 2), "utf8");
  return path;
}

async function relationsIn(schema: string): Promise<string[]> {
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT c.relname::text AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm', 'f') ORDER BY 1`,
    schema,
  );
  return rows.map((row) => row.name);
}

/** Each application table's row count in `schema`. */
async function rowCountsIn(schema: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of schemaModels()) {
    const [row] = await db.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${schema}"."${table}"`);
    counts[table] = row?.n ?? -1;
  }
  return counts;
}

/** What the migrations alone leave: the two yards, and nothing else. */
function migrationsOnly(): Record<string, number> {
  return Object.fromEntries(schemaModels().map((table) => [table, table === "Location" ? 2 : 0]));
}

/**
 * The text without its `exportedAt` line and, since ruling A1-F1, without its
 * `omittedPendingRequests` line: the restored schema holds no pending request to leave out, so
 * the second copy counts 0 where the first counted 1. The test asserts both counts itself.
 */
function comparable(text: string): string {
  return text.replace(/^ {2}"exportedAt": .*$/m, "").replace(/^ {2}"omittedPendingRequests": .*$/m, "");
}

describe("016 AC-10: the round trip", () => {
  it("AC-10: restores AC-9's fixture into an empty schema, every table identical, and a second export equals the first apart from exportedAt and the pending-request count", async () => {
    const { path, text, printedNever } = await exportedFixture();
    const schema = await throwawaySchema();

    const run = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema));

    expect(run.status, "exit status").toBe(0);
    const file = JSON.parse(text) as ExportFile;
    // The copy was taken while a request was pending (ruling A1-F1), and it still restores.
    expect(file.omittedPendingRequests).toBe(1);
    expect(run.stdout.trim().split(/\r?\n/)).toEqual([
      `[db:restore] migrations applied: ${MIGRATION_COUNT}`,
      ...Object.entries(file.tables).map(
        ([table, content]) => `[db:restore] ${table}: restored ${content.count}, identical ${content.count}`,
      ),
      "[db:restore] every table is identical to the file.",
    ]);
    expect(printedNever.filter((value) => run.printed.includes(value)).length, "a row value printed").toBe(0);

    const again = await exportDatabase(schema);
    expect(comparable(again.text)).toBe(comparable(text));
    expect(again.omittedPendingRequests).toBe(0);
    expect((JSON.parse(again.text) as ExportFile).omittedPendingRequests).toBe(0);
    // Exactly two lines differ: the moment, and the count.
    const firstLines = text.split("\n");
    const differing = again.text.split("\n").filter((line, index) => line !== firstLines[index]);
    expect(differing.map((line) => line.split(":")[0]?.trim())).toEqual(['"exportedAt"', '"omittedPendingRequests"']);
  });

  it("AC-10: db:census on the restored schema reports AC-9's counts and pins: 0 of 0", async () => {
    const { path } = await exportedFixture();
    const schema = await throwawaySchema();
    const source = runScript("scripts/db-census.ts", [], process.env);
    expect(source.status).toBe(0);

    const restore = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema));
    expect(restore.status, "restore exit status").toBe(0);
    const census = runScript("scripts/db-census.ts", [], envFor(schema));

    expect(census.status).toBe(0);
    const lines = census.stdout.trim().split(/\r?\n/);
    const sourceLines = source.stdout.trim().split(/\r?\n/);
    const profiles = (all: string[]): string => all.find((line) => line.startsWith("[db:census] profiles:")) ?? "";
    const others = (all: string[]): string[] => all.slice(0, -1).filter((line) => line !== profiles(all));
    expect(others(lines)).toEqual(others(sourceLines));
    // The pending request was left out of the copy (ruling A1-F1); every other profile is back.
    expect(profiles(sourceLines)).toBe("[db:census] profiles: ADMIN ACTIVE 1, YARD_STAFF ACTIVE 1, YARD_STAFF PENDING 1");
    expect(profiles(lines)).toBe("[db:census] profiles: ADMIN ACTIVE 1, YARD_STAFF ACTIVE 1");
    expect(sourceLines.at(-1)).toBe("[db:census] pins: 3 of 3 made under the given PIN_PEPPER");
    expect(lines.at(-1)).toBe("[db:census] pins: 0 of 0 made under the given PIN_PEPPER");
  });
});

describe("016 AC-10: the refusals", () => {
  it("AC-10: refuses, before writing anything, a target schema that holds any table", async () => {
    const { path } = await exportedFixture();
    const schema = await throwawaySchema();
    await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."Occupied" ("id" int PRIMARY KEY)`);

    const run = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema));

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("the target schema holds 1 table(s)");
    expect(await relationsIn(schema)).toEqual(["Occupied"]);
  });

  it("AC-10: refuses a migrated schema, as a database in use is, and writes no row into it", async () => {
    const { path } = await exportedFixture();
    const schema = await throwawaySchema();
    const migrated = runPrisma(["migrate", "deploy"], envFor(schema));
    expect(migrated.status, "the throwaway schema was migrated").toBe(0);
    const tablesBefore = await relationsIn(schema);

    const run = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema));

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(`the target schema holds ${tablesBefore.length} table(s)`);
    expect(await relationsIn(schema)).toEqual(tablesBefore);
    expect(await rowCountsIn(schema)).toEqual(migrationsOnly());
  });

  it("AC-10: refuses a file whose format is not macroads-export/1", async () => {
    const { text } = await exportedFixture();
    const schema = await throwawaySchema();
    const path = tampered(text, (file) => {
      file.format = "macroads-export/2";
    });

    const run = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema));

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("format is not macroads-export/1");
    expect(await relationsIn(schema)).toEqual([]);
  });

  it("AC-10: refuses a file whose migrations differ from prisma/migrations/", async () => {
    const { text } = await exportedFixture();
    const schema = await throwawaySchema();
    const path = tampered(text, (file) => {
      file.migrations = file.migrations.slice(0, -1);
    });

    const run = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema));

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("migrations differ from prisma/migrations/");
    expect(await relationsIn(schema)).toEqual([]);
  });

  it("AC-10: refuses a file where a table's count differs from its number of rows", async () => {
    const { text } = await exportedFixture();
    const schema = await throwawaySchema();
    const path = tampered(text, (file) => {
      const users = file.tables.User;
      if (users !== undefined) users.count += 1;
    });

    const run = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema));

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("User: its count differs from its number of rows");
    expect(await relationsIn(schema)).toEqual([]);
  });

  it("AC-10: refuses a file that does not say how many pending requests it left out", async () => {
    const { text } = await exportedFixture();
    const schema = await throwawaySchema();
    const path = tampered(text, (file) => {
      delete (file as Partial<ExportFile>).omittedPendingRequests;
    });

    const run = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema));

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("how many pending requests it left out");
    expect(await relationsIn(schema)).toEqual([]);
  });

  it("AC-10: refuses when DATABASE_URL and DIRECT_URL name different schemas", async () => {
    const { path } = await exportedFixture();
    const schema = await throwawaySchema();
    const other = await throwawaySchema();

    const run = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema, other));

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("name different schemas");
    expect(await relationsIn(schema)).toEqual([]);
    expect(await relationsIn(other)).toEqual([]);
  });
});

describe("016 AC-10: one transaction, insert only", () => {
  it("AC-10: a file with one row tampered to break a constraint leaves no restored row in the target", async () => {
    const { text } = await exportedFixture();
    const schema = await throwawaySchema();
    const path = tampered(text, (file) => {
      const item = file.tables.Item?.rows[0];
      if (item !== undefined) item.description = "   ";
    });

    const run = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema));

    expect(run.status).not.toBe(0);
    expect(await rowCountsIn(schema)).toEqual(migrationsOnly());
  });

  it("AC-10: a row the migrations wrote that differs from the file's row with the same id rolls everything back", async () => {
    const { text } = await exportedFixture();
    const schema = await throwawaySchema();
    const path = tampered(text, (file) => {
      const yard = file.tables.Location?.rows.find((row) => row.id === "loc_dublin");
      if (yard !== undefined) yard.name = `Dublin ${randomBytes(3).toString("hex")}`;
    });

    const run = runScript("scripts/db-restore.ts", ["--in", path], envFor(schema));

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("Location: 1 row(s) the migrations wrote differ");
    expect(await rowCountsIn(schema)).toEqual(migrationsOnly());
    const [yard] = await db.$queryRawUnsafe<{ name: string }[]>(
      `SELECT "name" FROM "${schema}"."Location" WHERE "id" = 'loc_dublin'`,
    );
    expect(yard?.name).toBe("Dublin");
  });
});
