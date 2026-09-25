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
import { randomBytes } from "node:crypto";
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
      "so they need their own database or Neon branch. See the Environment section of " +
      "docs/operations.md.",
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

// The connection parameters the suite runs under, composed HERE rather than written into
// `.env`: the string in `.env` is the developer's, this is a property of how the test run
// uses it, and composing it here keeps every environment that runs these tests identical.
//
//   connection_limit  Prisma otherwise opens `cpus × 2 + 1` — 17 on an 8-core machine.
//                     `vitest.db.config.ts` runs the whole suite sequentially in ONE
//                     process, so one connection is ever in use; 5 leaves margin for an
//                     interactive transaction, which holds a second.
//   pool_timeout      how long a query waits for a slot in that pool of 5.
//   connect_timeout   turns a silent 30-second hang against a sleeping compute — which
//                     used to surface as `Hook timed out in 30000ms` inside whichever
//                     `beforeEach` happened to be running — into a fast, legible error
//                     that names the connection. It does NOT change what passes.
const CHILD_URL_PARAMETERS = {
  connection_limit: "5",
  pool_timeout: "20",
  connect_timeout: "15",
};

/**
 * The URL with those parameters added, PRESERVING everything already on it — Neon's
 * strings carry `sslmode` and `channel_binding`, and dropping either turns a working
 * connection into an authentication failure.
 *
 * A parameter already spelled on the URL wins: this adds defaults, it does not override a
 * deliberate choice. A string that is not a parseable URL is returned untouched — the
 * script cannot compose onto what it cannot parse, and a plain `postgres` DSN or a test
 * sentinel must still arrive at the child exactly as it was given.
 */
function withConnectionParameters(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  for (const [name, value] of Object.entries(CHILD_URL_PARAMETERS)) {
    if (!parsed.searchParams.has(name)) parsed.searchParams.set(name, value);
  }

  return parsed.toString();
}

const childUrl = withConnectionParameters(testDirectUrl);

/** 32 random bytes, base64: this run's PIN_PEPPER (021 S3). Drawn once, never printed. */
function runPepper() {
  return randomBytes(32).toString("base64");
}

/** 24 random bytes, base64url: this run's SETUP_CODE, well over its 16-character minimum. */
function runSetupCode() {
  return randomBytes(24).toString("base64url");
}

const childEnv = {
  ...process.env,
  DATABASE_URL: childUrl,
  DIRECT_URL: childUrl,
  // Read by resetTestDb(): a truncation that cannot prove it is on the test database
  // refuses to run.
  MACROADS_TEST_DB: "1",
  // Spec 021: the suite runs under a PIN_PEPPER and a SETUP_CODE generated for this run
  // only, and never under the developer's. Neither is printed or written anywhere.
  PIN_PEPPER: runPepper(),
  SETUP_CODE: runSetupCode(),
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
