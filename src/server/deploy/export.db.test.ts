import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { ConflictError } from "@/server/errors";
import { EXPORT_FORMAT, exportDatabase } from "@/server/deploy/export";
import { resetTestDb } from "@/server/test-db";
import { buildExportFixture, QUANTITY, schemaModels, SNAPSHOT } from "../../../tests/support/export-fixture";
import { workingTreeChanges } from "../../../tests/support/feature-scope";
import { runScript } from "../../../tests/support/run-script";

/**
 * Spec 016 AC-9: `npm run db:export -- --out <file>` — every table, one moment, no credential.
 *
 * Against the test database, emptied before every test, with AC-9's fixture. Every file is
 * written under the system's temporary directory, outside the repository, and removed after.
 * `AUTH_SECRET` is stubbed with random bytes, so no secret of the developer's is compared.
 */

type ExportFile = {
  format: string;
  exportedAt: string;
  migrations: string[];
  omitted: string[];
  omittedPendingRequests: number;
  tables: Record<string, { count: number; rows: Record<string, unknown>[] }>;
};

let scratch = "";
/** Throwaway schemas a test created in the TEST database, dropped after it. */
let schemas: string[] = [];

beforeEach(async () => {
  await resetTestDb();
  scratch = mkdtempSync(join(tmpdir(), "macroads-export-"));
  schemas = [];
  vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("base64"));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  rmSync(scratch, { recursive: true, force: true });
  for (const schema of schemas) {
    await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
});

/** A new schema in the test database, holding only what the test puts in it. */
async function throwawaySchema(): Promise<string> {
  const schema = `export_${randomBytes(6).toString("hex")}`;
  schemas.push(schema);
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  return schema;
}

/** The values of the five settings, as this test's environment holds them. */
function settingValues(): string[] {
  return ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER", "AUTH_SECRET", "SETUP_CODE"]
    .map((name) => process.env[name] ?? "")
    .filter((value) => value.length >= 8);
}

function leaks(text: string, values: readonly string[]): number {
  return values.filter((value) => text.includes(value)).length;
}

const MIGRATION_DIRECTORIES = readdirSync("prisma/migrations")
  .filter((name) => statSync(join("prisma/migrations", name)).isDirectory())
  .sort();

describe("016 AC-9: the copy", () => {
  it("AC-9: writes every table of the schema, whose set equals the models of prisma/schema.prisma, each count equal to its table's", async () => {
    await buildExportFixture();
    const out = join(scratch, "copy.json");
    const changesBefore = workingTreeChanges(["."]);

    const run = runScript("scripts/db-export.ts", ["--out", out], process.env);

    expect(run.status, "exit status").toBe(0);
    const text = readFileSync(out, "utf8");
    const file = JSON.parse(text) as ExportFile;

    expect(Object.keys(file.tables).sort()).toEqual(schemaModels());
    expect(schemaModels()).toHaveLength(12);
    for (const [table, content] of Object.entries(file.tables)) {
      // Every row of the table, except the pending requests ruling A1-F1 leaves out.
      const leftOut = table === "User" ? ` WHERE "status"::text <> 'PENDING'` : "";
      const [row] = await db.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "public"."${table}"${leftOut}`,
      );
      expect(content.count, table).toBe(row?.n);
      expect(content.rows, table).toHaveLength(content.count);
      expect(content.count, `${table} holds at least one row`).toBeGreaterThan(0);
    }

    expect(file.format).toBe(EXPORT_FORMAT);
    expect(file.migrations).toEqual(MIGRATION_DIRECTORIES);
    expect(new Date(file.exportedAt).toISOString()).toBe(file.exportedAt);
    // The file lies outside the repository: the working tree is as it was.
    expect(workingTreeChanges(["."])).toEqual(changesBefore);
  });

  it("AC-9: a Decimal(12, 4) quantity and a Decimal(18, 8) snapshot keep every digit", async () => {
    await buildExportFixture();
    const out = join(scratch, "copy.json");

    const run = runScript("scripts/db-export.ts", ["--out", out], process.env);

    expect(run.status).toBe(0);
    const text = readFileSync(out, "utf8");
    expect(text).toContain(`"quantity":${QUANTITY}`);
    expect(text).toContain(`"unitPriceSnapshot":${SNAPSHOT}`);
  });

  it("AC-9: every User.pinHash and User.pinKeyId is null, both are listed under omitted, and no fixture credential appears", async () => {
    const { credentials } = await buildExportFixture();
    const out = join(scratch, "copy.json");

    const run = runScript("scripts/db-export.ts", ["--out", out], process.env);

    expect(run.status).toBe(0);
    const text = readFileSync(out, "utf8");
    const file = JSON.parse(text) as ExportFile;
    const users = file.tables.User?.rows ?? [];

    expect(users.length).toBeGreaterThanOrEqual(2);
    // Counts, never the rows: a failing assertion must not print the credential it caught.
    const withoutBothKeys = users.filter((user) => !("pinHash" in user) || !("pinKeyId" in user)).length;
    const holdingOne = users.filter((user) => user.pinHash !== null || user.pinKeyId !== null).length;
    expect(withoutBothKeys, "User rows missing pinHash or pinKeyId").toBe(0);
    expect(holdingOne, "User rows holding a PIN credential").toBe(0);
    expect(file.omitted).toEqual(["User.pinHash", "User.pinKeyId"]);
    expect(credentials.length).toBeGreaterThanOrEqual(4);
    expect(leaks(text, credentials), "credentials in the file").toBe(0);
  });

  it("AC-9 (ruling A1-F1): leaves out every PENDING User row, records omittedPendingRequests, and changes nothing in the database", async () => {
    const { pendingRequest } = await buildExportFixture();
    const pendingBefore = await db.user.count({ where: { status: "PENDING" } });
    const out = join(scratch, "copy.json");

    const run = runScript("scripts/db-export.ts", ["--out", out], process.env);

    expect(run.status).toBe(0);
    const text = readFileSync(out, "utf8");
    const file = JSON.parse(text) as ExportFile;
    const users = file.tables.User?.rows ?? [];
    expect(pendingBefore).toBe(1);
    expect(file.omittedPendingRequests).toBe(1);
    expect(users.filter((user) => user.status === "PENDING")).toHaveLength(0);
    expect(users.filter((user) => user.status === "ACTIVE")).toHaveLength(2);
    const found = pendingRequest.filter((value) => text.includes(value)).length;
    expect(found, "the request's name or username in the file").toBe(0);
    expect(await db.user.count({ where: { status: "PENDING" } })).toBe(pendingBefore);
  });

  it("AC-9: prints the path, the SHA-256 and one line per table with its count, and nothing else", async () => {
    const { printedNever } = await buildExportFixture();
    const out = join(scratch, "copy.json");

    const run = runScript("scripts/db-export.ts", ["--out", out], process.env);

    expect(run.status).toBe(0);
    const file = JSON.parse(readFileSync(out, "utf8")) as ExportFile;
    const digest = createHash("sha256").update(readFileSync(out)).digest("hex");
    expect(run.stdout.trim().split(/\r?\n/)).toEqual([
      `[db:export] wrote ${out}`,
      `[db:export] sha256 ${digest}`,
      ...Object.entries(file.tables).map(([table, content]) => `[db:export] ${table}: ${content.count}`),
      "[db:export] omittedPendingRequests: 1",
    ]);
    expect(run.stderr.trim()).toBe("");
    expect(leaks(run.printed, printedNever), "a username, name or price printed").toBe(0);
  });

  it("AC-9: no value of DATABASE_URL, DIRECT_URL, PIN_PEPPER, AUTH_SECRET or SETUP_CODE appears in the file or the output", async () => {
    await buildExportFixture();
    const out = join(scratch, "copy.json");
    const values = settingValues();

    const run = runScript("scripts/db-export.ts", ["--out", out], process.env);

    expect(run.status).toBe(0);
    expect(values).toHaveLength(5);
    expect(leaks(readFileSync(out, "utf8"), values), "settings in the file").toBe(0);
    expect(leaks(run.printed, values), "settings in the output").toBe(0);
  });

  it("AC-9: reads in one read-only, repeatable-read transaction", async () => {
    await buildExportFixture();

    const result = await exportDatabase("public");

    expect(result.snapshot).toEqual({ isolation: "repeatable read", readOnly: true });
    expect(result.tables.map((table) => table.name).sort()).toEqual(schemaModels());
  });
});

describe("016 AC-9: the refusals, made before connecting", () => {
  /** The environment with a database that cannot be reached, so connecting would fail loudly. */
  function unreachable(): NodeJS.ProcessEnv {
    const scheme = "postgres" + "ql";
    const url = `${scheme}://${randomBytes(6).toString("hex")}:${randomBytes(6).toString("hex")}@${randomBytes(6).toString("hex")}.invalid/db`;
    return { ...process.env, DATABASE_URL: url, DIRECT_URL: url };
  }

  it("AC-9: refuses an --out inside the repository's working tree", () => {
    for (const out of [
      join(process.cwd(), `copy-${randomBytes(4).toString("hex")}.json`),
      join(process.cwd(), "progress", `copy-${randomBytes(4).toString("hex")}.json`),
      `copy-${randomBytes(4).toString("hex")}.json`,
    ]) {
      const run = runScript("scripts/db-export.ts", ["--out", out], unreachable());

      expect(run.status, out).not.toBe(0);
      expect(run.stderr).toContain("inside the repository's working tree");
      expect(existsSync(out)).toBe(false);
    }
  });

  it("AC-9: refuses an --out naming a file that already exists, and leaves it as it was", () => {
    const out = join(scratch, "existing.json");
    const content = randomBytes(16).toString("hex");
    writeFileSync(out, content, "utf8");

    const run = runScript("scripts/db-export.ts", ["--out", out], unreachable());

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("already exists");
    expect(readFileSync(out, "utf8")).toBe(content);
  });

  it("AC-9: refuses a missing --out", () => {
    const run = runScript("scripts/db-export.ts", [], unreachable());

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("usage: npm run db:export");
  });
});

describe("016 AC-9 (review R2): the export refuses a schema it cannot copy faithfully", () => {
  it("R2: exportDatabase rejects with ConflictError for a schema with no _prisma_migrations", async () => {
    const schema = await throwawaySchema();
    await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."Lonely" ("id" int PRIMARY KEY)`);

    const attempt = exportDatabase(schema);

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toThrow(/no _prisma_migrations table/);
  });

  it("R2: exportDatabase rejects with ConflictError for a table with no primary key", async () => {
    const schema = await throwawaySchema();
    await db.$executeRawUnsafe(
      `CREATE TABLE "${schema}"."_prisma_migrations" ("migration_name" text PRIMARY KEY, "finished_at" timestamptz, "rolled_back_at" timestamptz)`,
    );
    await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."Keyless" ("value" int)`);

    const attempt = exportDatabase(schema);

    await expect(attempt).rejects.toBeInstanceOf(ConflictError);
    await expect(attempt).rejects.toThrow(/Keyless has no primary key/);
  });

  it("R2: db:export pointed at that schema through ?schema= exits non-zero and writes no file", async () => {
    const schema = await throwawaySchema();
    await db.$executeRawUnsafe(`CREATE TABLE "${schema}"."Lonely" ("id" int PRIMARY KEY)`);
    const url = new URL(process.env.DATABASE_URL ?? "");
    url.searchParams.set("schema", schema);
    const out = join(scratch, "copy.json");

    const run = runScript("scripts/db-export.ts", ["--out", out], { ...process.env, DATABASE_URL: url.toString() });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/no _prisma_migrations table/);
    expect(run.stdout).not.toContain("[db:export] wrote");
    expect(existsSync(out)).toBe(false);
  });
});
