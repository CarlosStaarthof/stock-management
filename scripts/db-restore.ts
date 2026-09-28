/**
 * `npm run db:restore -- --in <file>` — restore a copy into an EMPTY schema (spec 016 D21,
 * AC-10).
 *
 * The target is the schema `DATABASE_URL` and `DIRECT_URL` name (`public` without a `schema`
 * parameter). It refuses, before writing anything:
 *   - a file whose format is not `macroads-export/1`, whose migrations are not this
 *     repository's, or whose table counts disagree with its rows (checked before connecting);
 *   - a target schema that holds any table — so it can never write into a database in use,
 *     production included.
 * Then it applies the migrations with `prisma migrate deploy`, inserts every row in one
 * transaction, reads every table back and prints `<table>: restored <n>, identical <n>`. It
 * exits 0 only when every table is identical. It prints no row and no value.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

import { DomainError } from "@/server/errors";
import {
  compareWithFile,
  exportFileProblems,
  isIdentical,
  relationsInSchema,
  restoreRows,
} from "@/server/deploy/restore";
import { restoreSchema } from "@/server/deploy/target-schema";

const PREFIX = "[db:restore]";
const USAGE = "usage: npm run db:restore -- --in <file>";
const MIGRATIONS = "prisma/migrations";

function fail(message: string): never {
  console.error(`${PREFIX} ${message}`);
  process.exit(1);
}

function inArgument(argv: string[]): string {
  if (argv.length !== 2 || argv[0] !== "--in" || argv[1] === "" || argv[1].startsWith("--")) {
    fail(USAGE);
  }
  return resolve(argv[1]);
}

function migrationDirectories(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => statSync(join(MIGRATIONS, name)).isDirectory())
    .sort();
}

const require = createRequire(join(process.cwd(), "package.json"));

function prismaCli(): string {
  const manifestPath = require.resolve("prisma/package.json");
  const manifest = require(manifestPath) as { bin: Record<string, string> };
  return join(dirname(manifestPath), manifest.bin.prisma);
}

/**
 * `prisma migrate deploy` against `DIRECT_URL`. Its output is captured, never shown: Prisma
 * names the datasource's host, and a failure's detail is for `migrate:status`.
 */
function migrate(): void {
  const result = spawnSync(process.execPath, [prismaCli(), "migrate", "deploy"], {
    encoding: "utf8",
    env: process.env,
  });
  if (result.error !== undefined || result.status !== 0) {
    const code = /\bP\d{4}\b/.exec(`${result.stdout ?? ""}\n${result.stderr ?? ""}`)?.[0];
    fail(
      `prisma migrate deploy failed${code === undefined ? "" : ` (${code})`}. No row was restored.`,
    );
  }
  console.log(`${PREFIX} migrations applied: ${migrationDirectories().length}`);
}

async function main(): Promise<void> {
  const path = inArgument(process.argv.slice(2));
  if (!existsSync(path)) fail("the --in file does not exist.");
  const text = readFileSync(path, "utf8");

  const schema = restoreSchema(process.env);

  const problems = exportFileProblems(text, migrationDirectories());
  if (problems.length > 0) {
    for (const problem of problems) console.error(`${PREFIX} ${problem}`);
    fail("refused: nothing was written.");
  }

  const relations = await relationsInSchema(schema);
  if (relations > 0) {
    fail(
      `refused: the target schema holds ${relations} table(s). A copy is restored only into an ` +
        "empty schema, never into a database in use. Nothing was written.",
    );
  }

  migrate();
  await restoreRows(schema, text);

  const comparisons = await compareWithFile(schema, text);
  for (const comparison of comparisons) {
    console.log(
      `${PREFIX} ${comparison.table}: restored ${comparison.restored}, identical ${comparison.identical}`,
    );
  }

  const differing = comparisons.filter((comparison) => !isIdentical(comparison));
  if (differing.length > 0) {
    fail(`${differing.length} table(s) are not identical to the file: ${differing.map((c) => c.table).join(", ")}.`);
  }
  console.log(`${PREFIX} every table is identical to the file.`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    if (error instanceof DomainError) fail(error.message);
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? ` (${String((error as { code?: unknown }).code)})`
        : "";
    fail(`failed: ${error instanceof Error ? error.name : "unknown error"}${code}`);
  });
