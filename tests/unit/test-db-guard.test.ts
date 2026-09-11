import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resetTestDb } from "@/server/test-db";

/**
 * The two guards that stand between `npm run test:db` and a developer's own database, and
 * the binding spec 020 AC-15 changed. All of it runs in `npm run test:unit`, with no
 * database reachable — which is the point: a refusal that needs a database to prove itself
 * would not be a refusal.
 *
 * `MACROADS_TEST_DB` is what stops this suite ever truncating the development database,
 * which holds the real item master.
 */

type DbGlobal = { macroadsPrismaClient?: unknown };

const SCRIPT = resolve("scripts/run-db-tests.mjs");

const REFUSAL = "resetTestDb() refuses to run: MACROADS_TEST_DB is not set";

// Not connection strings: the script checks only that TEST_DATABASE_URL is non-empty and
// differs from DATABASE_URL, and no child ever parses them (see CAPTURE below). Real-looking
// strings in a tracked file would also fail tests/unit/repo-hygiene.test.ts, 002 AC-8.
const DEVELOPMENT_SENTINEL = "sentinel-development-database";
const POOLED_SENTINEL = "sentinel-test-pooled";
const DIRECT_SENTINEL = "sentinel-test-direct";

/**
 * Preloaded through NODE_OPTIONS into every process the script spawns, so the child
 * environment is read from the child itself rather than from a comment (AC-15).
 *
 * `MACROADS_TEST_DB` is set by the script only on its children, never on itself, so the
 * script's own process runs as far as the binding and only then is this body reached. It
 * writes with `appendFileSync` rather than to stdout because `process.exit()` can truncate
 * an asynchronous pipe write on Windows.
 */
const CAPTURE = [
  'const { appendFileSync } = require("node:fs");',
  "",
  'if (process.env.MACROADS_TEST_DB === "1" && process.env.MACROADS_CAPTURE_FILE) {',
  "  appendFileSync(",
  "    process.env.MACROADS_CAPTURE_FILE,",
  "    JSON.stringify({",
  "      argv: process.argv.slice(1, 3),",
  "      DATABASE_URL: process.env.DATABASE_URL ?? null,",
  "      DIRECT_URL: process.env.DIRECT_URL ?? null,",
  '    }) + "\\n",',
  "  );",
  "  process.exit(97);",
  "}",
].join("\n");

type CapturedEnv = { argv: string[]; DATABASE_URL: string | null; DIRECT_URL: string | null };

type ScriptRun = { status: number | null; output: string; captured: CapturedEnv[] };

/** A copy of this process's environment with every variable the script reads removed. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of [
    "DATABASE_URL",
    "DIRECT_URL",
    "TEST_DATABASE_URL",
    "TEST_DIRECT_URL",
    "MACROADS_TEST_DB",
    "MACROADS_CAPTURE_FILE",
    "NODE_OPTIONS",
  ]) {
    delete env[name];
  }
  return env;
}

/**
 * Runs `node scripts/run-db-tests.mjs` in a working directory that contains no `.env`, so
 * the only variables it sees are the ones given here.
 */
function runScript(
  variables: Record<string, string>,
  options: { capture?: boolean } = {},
): ScriptRun {
  const directory = mkdtempSync(join(tmpdir(), "macroads-test-db-"));
  const capturePath = join(directory, "child-env.jsonl");

  try {
    const env: NodeJS.ProcessEnv = { ...cleanEnv(), ...variables };

    if (options.capture === true) {
      const preload = join(directory, "capture.cjs");
      writeFileSync(preload, CAPTURE, "utf8");
      writeFileSync(capturePath, "", "utf8");
      // Forward slashes, not the Windows separator: NODE_OPTIONS treats a backslash inside
      // a quoted value as an escape, so `C:\a\b.cjs` arrives as `C:ab.cjs`. Node resolves
      // the forward-slash spelling on Windows perfectly well, and the quotes survive a
      // directory with a space in it.
      env.NODE_OPTIONS = `--require "${preload.replaceAll("\\", "/")}"`;
      env.MACROADS_CAPTURE_FILE = capturePath;
    }

    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: directory,
      env,
      encoding: "utf8",
    });

    const captured =
      options.capture === true
        ? readFileSync(capturePath, "utf8")
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .map((line) => JSON.parse(line) as CapturedEnv)
        : [];

    return {
      status: result.status,
      output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
      captured,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("AC-10: the script refuses before a migration is deployed or a test file is loaded", () => {
  it("AC-10: exits 1 when TEST_DATABASE_URL is not set", () => {
    const run = runScript({ DATABASE_URL: DEVELOPMENT_SENTINEL });

    expect(run.status).toBe(1);
    expect(run.output).toContain("[test:db] TEST_DATABASE_URL is not set");
  });

  it("AC-10: exits 1 when TEST_DATABASE_URL equals DATABASE_URL", () => {
    const run = runScript({
      DATABASE_URL: DEVELOPMENT_SENTINEL,
      TEST_DATABASE_URL: DEVELOPMENT_SENTINEL,
    });

    expect(run.status).toBe(1);
    expect(run.output).toContain("[test:db] TEST_DATABASE_URL must not equal DATABASE_URL");
  });

  it("AC-10: neither refusal deploys a migration or loads a test file", () => {
    const runs = [
      runScript({ DATABASE_URL: DEVELOPMENT_SENTINEL }),
      runScript({ DATABASE_URL: DEVELOPMENT_SENTINEL, TEST_DATABASE_URL: DEVELOPMENT_SENTINEL }),
    ];

    for (const run of runs) {
      // "prisma migrate" is what a deploy prints; "Test Files" is vitest's summary line;
      // "TRUNCATE" would mean resetTestDb() had run. None of the three may appear.
      for (const forbidden of ["prisma migrate", "Test Files", "TRUNCATE"]) {
        expect(run.output, forbidden).not.toContain(forbidden);
      }
    }
  });
});

describe("AC-15: the suite runs against the unpooled endpoint", () => {
  it("AC-15: binds the child's DATABASE_URL and DIRECT_URL to TEST_DIRECT_URL", () => {
    const run = runScript(
      {
        DATABASE_URL: DEVELOPMENT_SENTINEL,
        TEST_DATABASE_URL: POOLED_SENTINEL,
        TEST_DIRECT_URL: DIRECT_SENTINEL,
      },
      { capture: true },
    );

    // Exactly one child was spawned - `prisma migrate deploy`, before any test file - and
    // the preload stopped it there, so the script exits non-zero and vitest never runs.
    expect(run.captured).toHaveLength(1);
    expect(run.captured[0]?.argv.join(" ")).toContain("prisma");
    expect(run.captured[0]?.DATABASE_URL).toBe(DIRECT_SENTINEL);
    expect(run.captured[0]?.DIRECT_URL).toBe(DIRECT_SENTINEL);
    expect(run.status).not.toBe(0);
  });

  it("AC-15: falls back to TEST_DATABASE_URL for both when TEST_DIRECT_URL is unset", () => {
    const run = runScript(
      {
        DATABASE_URL: DEVELOPMENT_SENTINEL,
        TEST_DATABASE_URL: POOLED_SENTINEL,
      },
      { capture: true },
    );

    // A plain Postgres has no pooler and needs no second string.
    expect(run.captured).toHaveLength(1);
    expect(run.captured[0]?.DATABASE_URL).toBe(POOLED_SENTINEL);
    expect(run.captured[0]?.DIRECT_URL).toBe(POOLED_SENTINEL);
  });
});

describe("AC-11: resetTestDb refuses before any SQL is built or sent", () => {
  const original = process.env.MACROADS_TEST_DB;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MACROADS_TEST_DB;
    } else {
      process.env.MACROADS_TEST_DB = original;
    }
  });

  async function refusalFor(value: string | undefined): Promise<Error> {
    if (value === undefined) {
      delete process.env.MACROADS_TEST_DB;
    } else {
      process.env.MACROADS_TEST_DB = value;
    }

    try {
      await resetTestDb();
    } catch (error) {
      return error as Error;
    }

    throw new Error(`resetTestDb() did not refuse with MACROADS_TEST_DB = ${String(value)}`);
  }

  for (const value of [undefined, "", "0", "true", "2"]) {
    it(`AC-11: refuses with MACROADS_TEST_DB = ${String(value)}`, async () => {
      const error = await refusalFor(value);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain(REFUSAL);

      // The rejection is the guard's message and never a Prisma connection error or a
      // failed TRUNCATE - which is what proves no statement left the process. This suite
      // has no database reachable, so a statement would have failed with one of those.
      expect(error.message).not.toMatch(/TRUNCATE|reach database|PrismaClient/i);
      expect((globalThis as unknown as DbGlobal).macroadsPrismaClient).toBeUndefined();
    });
  }

  it("AC-11: only the exact string 1 passes the guard", async () => {
    // The guard is an equality, not a truthiness test: "true" and "2" are both truthy and
    // both refused, and neither " 1" nor "1 " is trimmed into passing.
    for (const value of ["", "0", "true", "2", "01", " 1", "1 ", "yes"]) {
      const error = await refusalFor(value);
      expect(error.message, value).toContain(REFUSAL);
    }
  });
});
