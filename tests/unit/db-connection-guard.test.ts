import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The two repository-side defences against the Neon test compute dropping the Level 2
 * suite, both asserted from what the scripts DO rather than from what their comments say.
 *
 *   * `scripts/run-db-tests.mjs` composes a capped `connection_limit` — and two timeouts —
 *     onto the URL it binds as the child's `DATABASE_URL`. Prisma otherwise opens
 *     `cpus × 2 + 1` connections, which against a small compute is most of its ceiling.
 *   * `scripts/db-probe.mjs` opens a real session. The version it replaced opened a TCP
 *     socket and reported `[probe] reachable` against a database that then refused every
 *     connection, so the test that matters here is the one where it must FAIL.
 *
 * All of it runs in `npm run test:unit`, with no database reachable — which is the point:
 * a health check that needs a healthy database to prove itself checks nothing.
 */

const RUNNER = resolve("scripts/run-db-tests.mjs");
const PROBE = resolve("scripts/db-probe.mjs");

// Not credentials. `.invalid` is reserved by RFC 2606 and can never resolve, and there is
// no user info at all — tests/unit/repo-hygiene.test.ts (002 AC-8) forbids a connection
// string in a test file, and this is deliberately not one.
const UNREACHABLE_URL = "postgresql://db.invalid:5432/nothing";
const DEVELOPMENT_SENTINEL = "sentinel-development-database";
const POOLED_URL = "postgresql://pooled.invalid:5432/neondb?sslmode=require&channel_binding=require";
const DIRECT_URL = "postgresql://direct.invalid:5432/neondb?sslmode=require&channel_binding=require";

/** Preloaded into the runner's children so the bound URL is read from the child itself. */
const CAPTURE = [
  'const { appendFileSync } = require("node:fs");',
  "",
  'if (process.env.MACROADS_TEST_DB === "1" && process.env.MACROADS_CAPTURE_FILE) {',
  "  appendFileSync(",
  "    process.env.MACROADS_CAPTURE_FILE,",
  "    JSON.stringify({",
  "      DATABASE_URL: process.env.DATABASE_URL ?? null,",
  "      DIRECT_URL: process.env.DIRECT_URL ?? null,",
  '    }) + "\\n",',
  "  );",
  "  process.exit(97);",
  "}",
].join("\n");

type CapturedEnv = { DATABASE_URL: string | null; DIRECT_URL: string | null };

/** A copy of this process's environment with every variable these scripts read removed. */
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
 * Runs a script in a working directory that holds no `.env`, so the only variables it
 * sees are the ones given here — the developer's real Neon strings never reach it.
 */
function inTemporaryDirectory<T>(body: (directory: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), "macroads-db-conn-"));
  try {
    return body(directory);
  } finally {
    // Windows refuses to remove a directory that was a process's working directory until
    // the last handle on it closes, and the probe spawns the Prisma CLI. Retry, and if it
    // still will not go, leave it to the operating system: a temp directory that outlives
    // the run is not a failed assertion about the probe, and turning it into one would be
    // a flake nobody could read.
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // Deliberately swallowed; see above.
    }
  }
}

function capturedChildUrl(variables: Record<string, string>): CapturedEnv[] {
  return inTemporaryDirectory((directory) => {
    const preload = join(directory, "capture.cjs");
    const capturePath = join(directory, "child-env.jsonl");
    writeFileSync(preload, CAPTURE, "utf8");
    writeFileSync(capturePath, "", "utf8");

    spawnSync(process.execPath, [RUNNER], {
      cwd: directory,
      encoding: "utf8",
      env: {
        ...cleanEnv(),
        ...variables,
        // Forward slashes: NODE_OPTIONS treats a backslash in a quoted value as an escape.
        NODE_OPTIONS: `--require "${preload.replaceAll("\\", "/")}"`,
        MACROADS_CAPTURE_FILE: capturePath,
      },
    });

    return readFileSync(capturePath, "utf8")
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CapturedEnv);
  });
}

function runProbe(
  argv: string[],
  variables: Record<string, string>,
): Promise<{ status: number | null; output: string }> {
  return inTemporaryDirectoryAsync(async (directory) => {
    const result = await runNode([PROBE, ...argv], {
      cwd: directory,
      env: { ...cleanEnv(), ...variables },
    });

    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  });
}

/**
 * HOW LONG A TEST OF THE PROBE MAY TAKE: the probe's own bound, with room. Since the probe
 * gained its one retry, a host that never answers costs two attempts of up to 10 s each
 * and a 2 s pause, and under a loaded `test:unit` an attempt against `db.invalid` was
 * measured taking the full 10 s — two such tests ran 22 s against the suite's 15 s default
 * and failed on the clock, not on an assertion. The number follows the script's documented
 * worst case; it does not paper over a slow assertion.
 */
const PROBE_TEST_TIMEOUT_MS = 40_000;

/**
 * `spawn`, not `spawnSync`, for the probe: a synchronous child that runs for twenty seconds
 * blocks the Vitest worker's event loop for all of it, and the worker then misses its own
 * RPC deadline ("Timeout calling onTaskUpdate") even when every assertion passes.
 */
function runNode(
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, { cwd: options.cwd, env: options.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (status) => resolvePromise({ status, stdout, stderr }));
  });
}

/** `inTemporaryDirectory`, for a body that awaits. */
async function inTemporaryDirectoryAsync<T>(body: (directory: string) => Promise<T>): Promise<T> {
  const directory = mkdtempSync(join(tmpdir(), "macroads-db-conn-"));
  try {
    return await body(directory);
  } finally {
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // Deliberately swallowed, for the reason `inTemporaryDirectory` gives.
    }
  }
}

describe("the suite runs under a capped connection pool", () => {
  it("composes connection_limit, pool_timeout and connect_timeout onto the child's URL", () => {
    const captured = capturedChildUrl({
      DATABASE_URL: DEVELOPMENT_SENTINEL,
      TEST_DATABASE_URL: POOLED_URL,
      TEST_DIRECT_URL: DIRECT_URL,
    });

    // One child — `prisma migrate deploy`, before any test file — stopped by the preload.
    expect(captured).toHaveLength(1);

    for (const bound of [captured[0]?.DATABASE_URL, captured[0]?.DIRECT_URL]) {
      const parameters = new URL(bound ?? "").searchParams;

      // The cap itself. Prisma's default is `cpus × 2 + 1`; nothing on the URL narrowed it.
      expect(parameters.get("connection_limit")).toBe("5");
      expect(parameters.get("pool_timeout")).toBe("20");
      // A silent hang against a sleeping compute becomes a legible error instead.
      expect(parameters.get("connect_timeout")).toBe("15");
    }
  });

  it("preserves the parameters already on the URL rather than replacing the query string", () => {
    const captured = capturedChildUrl({
      DATABASE_URL: DEVELOPMENT_SENTINEL,
      TEST_DATABASE_URL: POOLED_URL,
      TEST_DIRECT_URL: DIRECT_URL,
    });

    const bound = new URL(captured[0]?.DATABASE_URL ?? "");

    // Dropping either of these turns a working Neon connection into an authentication
    // failure, so composing must ADD to the query string and never rewrite it.
    expect(bound.searchParams.get("sslmode")).toBe("require");
    expect(bound.searchParams.get("channel_binding")).toBe("require");
    expect(bound.hostname).toBe("direct.invalid");
  });

  it("020 AC-15 still holds: it is the DIRECT endpoint that is capped and bound", () => {
    const captured = capturedChildUrl({
      DATABASE_URL: DEVELOPMENT_SENTINEL,
      TEST_DATABASE_URL: POOLED_URL,
      TEST_DIRECT_URL: DIRECT_URL,
    });

    expect(new URL(captured[0]?.DATABASE_URL ?? "").hostname).toBe("direct.invalid");
    expect(new URL(captured[0]?.DIRECT_URL ?? "").hostname).toBe("direct.invalid");
  });

  it("leaves a string it cannot parse exactly as it was given", () => {
    // A plain DSN or a sentinel must arrive untouched: the script may not corrupt a
    // connection string in the course of trying to improve it.
    const captured = capturedChildUrl({
      DATABASE_URL: DEVELOPMENT_SENTINEL,
      TEST_DATABASE_URL: "sentinel-test-pooled",
    });

    expect(captured[0]?.DATABASE_URL).toBe("sentinel-test-pooled");
    expect(captured[0]?.DIRECT_URL).toBe("sentinel-test-pooled");
  });
});

describe("the health check reports failure when the database will not answer", () => {
  it("exits 1 and says unreachable for a host that cannot resolve", async () => {
    const run = await runProbe(["TEST_DATABASE_URL"], { TEST_DATABASE_URL: UNREACHABLE_URL });

    // The whole point of the change: the TCP version of this script reported `reachable`
    // for anything that accepted a socket, and a green light wired to nothing is worse
    // than no light at all.
    expect(run.status).toBe(1);
    expect(run.output).toContain("[probe] unreachable db.invalid");
    expect(run.output).not.toContain("[probe] reachable");
  }, PROBE_TEST_TIMEOUT_MS);

  it("names the host and never the connection string", async () => {
    const run = await runProbe(["TEST_DATABASE_URL"], { TEST_DATABASE_URL: UNREACHABLE_URL });

    // 003 AC-24: the URL carries a user and a password even when this one does not.
    expect(run.output).not.toContain("nothing");
    expect(run.output).not.toContain("5432");
  }, PROBE_TEST_TIMEOUT_MS);

  it("exits 1 when the variable is not set, naming the last one it was given", async () => {
    const run = await runProbe(["TEST_DIRECT_URL", "TEST_DATABASE_URL"], {});

    // 003 AC-24 asks for `[skip] TEST_DATABASE_URL is not set`, so the fallback pair must
    // still name TEST_DATABASE_URL when neither is set.
    expect(run.status).toBe(1);
    expect(run.output).toContain("[probe] TEST_DATABASE_URL is not set");
  });

  it("probes the FIRST name that is set, which is the endpoint test:db uses", async () => {
    const run = await runProbe(["TEST_DIRECT_URL", "TEST_DATABASE_URL"], {
      TEST_DIRECT_URL: "postgresql://direct.invalid:5432/neondb",
      TEST_DATABASE_URL: "postgresql://pooled.invalid:5432/neondb",
    });

    // The pooled string is a DIFFERENT Neon compute. Probing it and then running the
    // suite against the direct one is what made four gate runs report a database that was
    // never asked anything.
    expect(run.output).toContain("direct.invalid");
    expect(run.output).not.toContain("pooled.invalid");
  }, PROBE_TEST_TIMEOUT_MS);
});

/**
 * Preloaded into every process the probe starts, it counts the CLI's `db execute` runs — the
 * attempts — and, when told to, answers for the database: `fail` exits 1 as a database that
 * did not answer would, `answer` exits 0 as one that did. A step it is not told about runs
 * the real CLI. The probe itself also loads it (NODE_OPTIONS is inherited) and is ignored.
 */
const ATTEMPTS = [
  'const { appendFileSync, readFileSync } = require("node:fs");',
  "",
  'if (process.argv.includes("execute") && process.env.MACROADS_ATTEMPT_FILE) {',
  '  appendFileSync(process.env.MACROADS_ATTEMPT_FILE, "attempt\\n");',
  "  const made = readFileSync(process.env.MACROADS_ATTEMPT_FILE, \"utf8\")",
  '    .split("\\n")',
  "    .filter(Boolean).length;",
  '  const step = (process.env.MACROADS_ATTEMPT_PLAN ?? "").split(",")[made - 1];',
  '  if (step === "fail") process.exit(1);',
  '  if (step === "answer") process.exit(0);',
  "}",
].join("\n");

function probeAttempts(
  variables: Record<string, string>,
  plan: string,
): Promise<{ status: number | null; stdout: string; attempts: number; seconds: number }> {
  return inTemporaryDirectoryAsync(async (directory) => {
    const preload = join(directory, "attempts.cjs");
    const attemptFile = join(directory, "attempts.txt");
    writeFileSync(preload, ATTEMPTS, "utf8");
    writeFileSync(attemptFile, "", "utf8");

    const started = Date.now();
    const result = await runNode([PROBE, "TEST_DATABASE_URL"], {
      cwd: directory,
      env: {
        ...cleanEnv(),
        ...variables,
        NODE_OPTIONS: `--require "${preload.replaceAll("\\", "/")}"`,
        MACROADS_ATTEMPT_FILE: attemptFile,
        MACROADS_ATTEMPT_PLAN: plan,
      },
    });

    return {
      status: result.status,
      stdout: result.stdout,
      attempts: readFileSync(attemptFile, "utf8").split("\n").filter(Boolean).length,
      seconds: (Date.now() - started) / 1000,
    };
  });
}

describe("the health check asks twice before it gives up, and only twice", () => {
  // On 2026-09-24 one slow moment of the development compute made the probe report it
  // unreachable, and `init` skipped every database check. One retry absorbs that.

  it("a host that never answers is asked twice, then reported unreachable", async () => {
    const run = await probeAttempts({ TEST_DATABASE_URL: UNREACHABLE_URL }, "");

    expect(run.attempts).toBe(2);
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("[probe] unreachable db.invalid");
    // The pause between the two is real, and the total stays inside the stated bound.
    expect(run.seconds).toBeGreaterThanOrEqual(2);
    expect(run.seconds).toBeLessThan(30);
  }, PROBE_TEST_TIMEOUT_MS);

  it("a database that misses the first attempt and answers the second is reachable", async () => {
    const run = await probeAttempts({ TEST_DATABASE_URL: UNREACHABLE_URL }, "fail,answer");

    expect(run.attempts).toBe(2);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("[probe] reachable db.invalid");
  }, PROBE_TEST_TIMEOUT_MS);

  it("a database that answers the first attempt is asked once", async () => {
    const run = await probeAttempts({ TEST_DATABASE_URL: UNREACHABLE_URL }, "answer");

    expect(run.attempts).toBe(1);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("[probe] reachable db.invalid");
  }, PROBE_TEST_TIMEOUT_MS);

  it("the output is still one line naming the host, whatever happened in between", async () => {
    const run = await probeAttempts({ TEST_DATABASE_URL: UNREACHABLE_URL }, "fail,fail");

    expect(run.attempts).toBe(2);
    expect(run.status).toBe(1);
    expect(run.stdout.trim().split("\n")).toEqual(["[probe] unreachable db.invalid"]);
  }, PROBE_TEST_TIMEOUT_MS);
});
