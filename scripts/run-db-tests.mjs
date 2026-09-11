#!/usr/bin/env node
// `npm run test:db` — the Level 2 suite, against a real Postgres.
//
// Spec 003 AC-26: these tests truncate tables between tests. Pointed at the developer's
// database they would delete the developer's data, so the refusal below happens BEFORE a
// single test file is loaded, not inside a fixture that a future `--no-setup` flag could
// skip.
//
// It then applies the migrations to the test database and runs vitest with
// DATABASE_URL rebound to the test database, so `src/server/db.ts` — unchanged, unmocked
// — connects to the test branch.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Variables may equally come from the real environment; the checks below decide.
  }
}

const testUrl = (process.env.TEST_DATABASE_URL ?? "").trim();
const developmentUrl = (process.env.DATABASE_URL ?? "").trim();

if (testUrl === "") {
  console.error(
    "[test:db] TEST_DATABASE_URL is not set. These tests truncate tables between tests, " +
      "so they need their own database or Neon branch. See .env.example.",
  );
  process.exit(1);
}

if (testUrl === developmentUrl) {
  console.error(
    "[test:db] TEST_DATABASE_URL must not equal DATABASE_URL. These tests delete every " +
      "row between tests; point TEST_DATABASE_URL at a separate database or Neon branch.",
  );
  process.exit(1);
}

// TEST_DIRECT_URL is the unpooled string for the same test database; `prisma migrate`
// fails through Neon's pooler. Falling back to the pooled URL is better than failing for
// a plain Postgres, which has no pooler and needs no second string.
const testDirectUrl = (process.env.TEST_DIRECT_URL ?? "").trim() || testUrl;

// Spec 020 AC-15: the tests themselves run against the UNPOOLED endpoint, not the pooled
// one. `vitest.db.config.ts` sets `fileParallelism: false`, so at most one client is ever
// live and the suite gains nothing from a connection pooler — while transaction-mode
// pooling is a classic source of `Server has closed the connection` under many short
// exchanges, the error that failed #7's closing gate twice with zero assertion failures.
// `DIRECT_URL` carries the same string, so `prisma migrate deploy` is unaffected. When
// TEST_DIRECT_URL is unset both fall back to the pooled string above, so a plain Postgres
// still works.
const childEnv = {
  ...process.env,
  DATABASE_URL: testDirectUrl,
  DIRECT_URL: testDirectUrl,
  // Read by resetTestDb(): a truncation that cannot prove it is on the test database
  // refuses to run.
  MACROADS_TEST_DB: "1",
};

/** Resolved through each package's own `bin` entry, so a moved CLI does not break this. */
function cliOf(packageName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  return join(dirname(packageJsonPath), require(packageJsonPath).bin[packageName]);
}

function run(packageName, args) {
  const result = spawnSync(process.execPath, [cliOf(packageName), ...args], {
    stdio: "inherit",
    env: childEnv,
  });
  if (result.error) {
    console.error(`[test:db] could not run ${packageName}: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

// The schema the tests run against is the committed migration history, not `db push`:
// a migration that does not apply cleanly fails here rather than in production.
const migrateStatus = run("prisma", ["migrate", "deploy"]);
if (migrateStatus !== 0) {
  console.error("[test:db] prisma migrate deploy failed against TEST_DATABASE_URL.");
  process.exit(migrateStatus);
}

// Extra arguments are forwarded, so a specific file or a specific order can be run:
//   npm run test:db -- src/server/auth/session.db.test.ts
process.exit(run("vitest", ["run", "--config", "vitest.db.config.ts", ...process.argv.slice(2)]));
