#!/usr/bin/env node
// scripts/db-probe.mjs — will a database answer a query?
//
// Spec 003 AC-24: `init.ps1` and `init.sh` must reach the SAME verdict about the
// database, so they must not each implement their own idea of "reachable". They both
// run this file.
//
// It used to open a bare TCP socket and hold no session. That is not reachability: a
// Neon endpoint accepts the socket while its compute is suspended, and it accepts the
// socket when the password on the URL is stale. This script printed
// `[probe] reachable <host>` immediately before `npm run test:db` failed to connect, in
// four consecutive gate runs — a green light wired to nothing. It now opens a real
// session and runs `SELECT 1`, which is the only thing that separates "a database will
// answer" from "a port is open". The session also WAKES a suspended Neon compute, so the
// step that follows does not pay the cold start as a timeout.
//
// It runs that statement through the PRISMA CLI rather than by importing PrismaClient,
// and that is not an accident:
//
//   * 004 AC-31 (tests/unit/hashing-boundary.test.ts) says every file importing
//     `@prisma/client` or `@/server/db` lives under `src/server/`. A script under
//     `scripts/` that imported the client would break that rule, and the rule is worth
//     more than the convenience — so this spawns the CLI the repository already depends
//     on and already runs here for `prisma migrate deploy`;
//   * the URL is passed to the child in its ENVIRONMENT, never as `--url` on the command
//     line, because argv is readable by other processes and this string is a credential.
//
// What it still does NOT do:
//
//   * it does not read or write an application table. `SELECT 1` touches no schema, so
//     this stays a health check rather than a data access;
//   * it does not print the connection string, and it does not let the child print one
//     either: the child's output is captured, never inherited, and only the line below is
//     written. The output names the host and nothing else (AC-24).
//
// Usage:  node scripts/db-probe.mjs [ENV_VAR_NAME...]     (default TEST_DATABASE_URL)
//
//   Several names may be given. The FIRST one that is set and non-empty is probed — the
//   same fallback `scripts/run-db-tests.mjs` applies, so `init` can probe the endpoint
//   `npm run test:db` will actually use: `TEST_DIRECT_URL TEST_DATABASE_URL`. When none
//   of them is set the message names the LAST, which is the variable a developer is
//   expected to have set.
//
// Exits:  0 = the database answered, 1 = not set, unparseable, or no answer on either of
//         TWO attempts (AC-24). Each attempt is bounded at 10 seconds and the second starts
//         2 seconds after the first gives up, so an unreachable host is reported within
//         about 22 seconds: 10 + 2 + 10. Starting the Prisma CLI happens INSIDE each
//         attempt's 10 seconds; only this script's own start-up falls outside them.
//
// ONE RETRY, AND WHY. On 2026-09-24 this script reported the development database
// unreachable seconds after the e2e suite had finished using it, and `init` then skipped
// every database check: one slow moment of a Neon compute threw away the whole gate. A
// second attempt after a short pause absorbs that; a database that is really gone still
// fails both, and is still reported, only later. Nothing else changed: the same session,
// the same `SELECT 1`, the same endpoint, and still one line of output.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const TIMEOUT_MS = 10_000;
const ATTEMPTS = 2;
const PAUSE_MS = 2_000;

// .env is gitignored and denied to agents; loading it programmatically is how every tool
// here reads it. Variables already in the environment win, which is what lets the
// verification runs point this at an unreachable host.
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // An unreadable .env is not this script's problem; the variable check below reports it.
  }
}

const names = process.argv.slice(2);
if (names.length === 0) names.push("TEST_DATABASE_URL");

const variable = names.find((name) => (process.env[name] ?? "").trim() !== "");

if (variable === undefined) {
  console.log(`[probe] ${names[names.length - 1]} is not set`);
  process.exit(1);
}

const value = process.env[variable].trim();

let host;
try {
  host = new URL(value).hostname;
} catch {
  // Never echo the value back: it is a credential even when it is malformed.
  console.log(`[probe] ${variable} is not a URL`);
  process.exit(1);
}

if (host === "") {
  console.log(`[probe] ${variable} has no host`);
  process.exit(1);
}

/**
 * The schema, resolved from THIS file rather than from the working directory, so the
 * probe reaches the same verdict wherever it is run from.
 */
const schema = fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url));

/** The Prisma CLI, through its own `bin` entry — the same resolution run-db-tests.mjs uses. */
function prismaCli() {
  const packageJsonPath = require.resolve("prisma/package.json");
  return join(dirname(packageJsonPath), require(packageJsonPath).bin.prisma);
}

const finish = (code, message) => {
  console.log(message);
  process.exit(code);
};

let cli;
try {
  cli = prismaCli();
} catch {
  // `npm ci` has not run, or the CLI moved. Nothing can be proved about the database, and
  // a probe that cannot prove reachability must not claim it.
  finish(1, `[probe] unreachable ${host}`);
}

// `connect_timeout` bounds the driver's own attempt; `spawnSync`'s timeout bounds
// everything else, including a TLS handshake that stalls without ever failing. AC-24's
// ten seconds is the outer number of EACH attempt; the header states the total.
const url = (() => {
  const parsed = new URL(value);
  if (!parsed.searchParams.has("connect_timeout")) parsed.searchParams.set("connect_timeout", "8");
  return parsed.toString();
})();

/** One session, one `SELECT 1`, bounded at `TIMEOUT_MS`. True when the database answered. */
function answers() {
  const result = spawnSync(process.execPath, [cli, "db", "execute", "--schema", schema, "--stdin"], {
    // Captured, not inherited: the CLI prints the datasource and its own errors, and this
    // script promises one line naming the host.
    stdio: ["pipe", "pipe", "pipe"],
    input: "SELECT 1",
    encoding: "utf8",
    timeout: TIMEOUT_MS,
    env: {
      ...process.env,
      // Both, because `db execute` prefers `directUrl` when the schema declares one — and
      // this one does. Setting the pair means the endpoint probed is the endpoint named.
      DATABASE_URL: url,
      DIRECT_URL: url,
    },
  });
  return result.status === 0;
}

/** Blocks for `ms` without spinning: this script has nothing else to do while it waits. */
function pause(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

let reachable = answers();
for (let attempt = 2; !reachable && attempt <= ATTEMPTS; attempt += 1) {
  pause(PAUSE_MS);
  reachable = answers();
}

// One vocabulary, unchanged: `init.sh` and `init.ps1` turn "[probe] unreachable <host>"
// into their "[skip] database unreachable at <host>" line (AC-24), and neither of them
// cares WHY a database did not answer. The distinction between a suspended compute, a
// rejected password and a missing host belongs in the failure a developer then reproduces
// by hand — `npm run test:db` prints the Prisma error in full.
if (reachable) finish(0, `[probe] reachable ${host}`);
finish(1, `[probe] unreachable ${host}`);
