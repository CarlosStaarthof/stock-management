import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CHECKED_SETTINGS,
  DATABASE_SETTINGS,
  STEP_COMMANDS,
  planVercelBuild,
  previewDatabaseProblems,
  productionSettingsProblems,
  vercelBuild,
  type BuildStep,
  type Env,
} from "@/server/deploy/build-plan";

/**
 * Spec 016 AC-2 to AC-5: the build plan, the preview guard, the production settings check
 * and the runner that stops at the first failed step.
 *
 * Every setting here is a sentinel drawn at run time: random tokens, hosts under `.invalid`,
 * connection strings joined from parts. Every run's output is checked for every sentinel, so
 * a line that quoted a value, a host or part of one would turn the test red.
 */

const SCHEME = "postgres" + "ql";

function token(): string {
  return randomBytes(9).toString("hex");
}

function connection(host: string): string {
  return `${SCHEME}://${token()}:${token()}@${host}/${token()}?sslmode=require`;
}

function newPepper(): string {
  return randomBytes(32).toString("base64");
}

function newSecret(): string {
  return randomBytes(32).toString("base64");
}

function newCode(): string {
  return randomBytes(24).toString("base64url");
}

/** A complete, well-formed production set, fresh each call. */
function productionEnv(): Env {
  const endpoint = `ep-${token()}`;
  const domain = `${token()}.invalid`;
  return {
    VERCEL: "1",
    VERCEL_ENV: "production",
    DATABASE_URL: connection(`${endpoint}-pooler.${domain}`),
    DIRECT_URL: connection(`${endpoint}.${domain}`),
    AUTH_SECRET: newSecret(),
    AUTH_URL: `https://${token()}.invalid`,
    PIN_PEPPER: newPepper(),
    SETUP_CODE: newCode(),
  };
}

/** Every value in `env`, and every host in it, that output must never contain. */
function sentinelsOf(env: Env): string[] {
  const found = new Set<string>();
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.trim().length < 6 || name.startsWith("VERCEL")) continue;
    found.add(value.trim());
    try {
      const url = new URL(value.trim());
      for (const part of [url.hostname, url.username, url.password, url.pathname.slice(1)]) {
        if (part.length >= 6) found.add(part);
      }
      for (const label of url.hostname.split(".")) {
        if (label.length >= 6 && label !== "invalid") found.add(label.replace(/-pooler$/, ""));
      }
    } catch {
      // Not a URL; the value itself is the sentinel.
    }
  }
  return [...found];
}

/** How many sentinels the text carries. A count, so a failure never prints what it caught. */
function leaks(text: string, env: Env): number {
  return sentinelsOf(env).filter((sentinel) => text.includes(sentinel)).length;
}

type Run = { code: number; lines: string[]; ran: BuildStep[] };

async function build(env: Env, options: { argv?: string[]; failAt?: BuildStep; failCode?: number } = {}): Promise<Run> {
  const lines: string[] = [];
  const ran: BuildStep[] = [];
  const code = await vercelBuild({
    argv: options.argv ?? [],
    env,
    runStep: (step) => {
      ran.push(step);
      return step === options.failAt ? (options.failCode ?? 1) : 0;
    },
    print: (line) => lines.push(line),
  });

  expect(leaks(lines.join("\n"), env), "sentinels printed").toBe(0);
  return { code, lines, ran };
}

function problemsFor(env: Env): string[] {
  const problems = productionSettingsProblems(env);
  expect(leaks(problems.join("\n"), env), "sentinels in the problems").toBe(0);
  return problems;
}

function withOnly(env: Env, changes: Env): Env {
  const next: Env = { ...env, ...changes };
  for (const [name, value] of Object.entries(changes)) if (value === undefined) delete next[name];
  return next;
}

describe("016 AC-2: the build plan depends on where it runs", () => {
  it("AC-2: production gets check-settings, next-build, migrate-deploy, seed-if-empty and census, in that order", () => {
    expect(planVercelBuild({ VERCEL_ENV: "production" })).toEqual([
      "check-settings",
      "next-build",
      "migrate-deploy",
      "seed-if-empty",
      "census",
    ]);
  });

  it("AC-2: preview gets next-build alone", () => {
    expect(planVercelBuild({ VERCEL_ENV: "preview" })).toEqual(["next-build"]);
  });

  it("AC-2: development gets next-build alone", () => {
    expect(planVercelBuild({ VERCEL_ENV: "development" })).toEqual(["next-build"]);
  });

  it("AC-2: any other value gets next-build alone", () => {
    for (const value of ["Production", "staging", "", " production"]) {
      expect(planVercelBuild({ VERCEL_ENV: value }), value).toEqual(["next-build"]);
    }
  });

  it("AC-2: unset gets next-build alone", () => {
    expect(planVercelBuild({})).toEqual(["next-build"]);
  });

  it("AC-2: migrate-deploy runs prisma migrate deploy, and next-build runs next build", () => {
    expect(STEP_COMMANDS["migrate-deploy"]).toEqual({ cli: "prisma", args: ["migrate", "deploy"] });
    expect(STEP_COMMANDS["next-build"]).toEqual({ cli: "next", args: ["build"] });
    expect(STEP_COMMANDS["seed-if-empty"]).toEqual({ cli: "tsx", args: ["scripts/seed-if-empty.ts"] });
    expect(STEP_COMMANDS.census).toEqual({ cli: "tsx", args: ["scripts/db-census.ts"] });
  });
});

describe("016 AC-3: a preview build carrying a database setting does not build", () => {
  for (const vercelEnv of ["preview", "development", "staging", undefined]) {
    it(`AC-3: VERCEL_ENV ${vercelEnv ?? "unset"}: each database setting alone refuses, before next build, naming only itself`, async () => {
      for (const name of DATABASE_SETTINGS) {
        const env = withOnly({ VERCEL: "1", VERCEL_ENV: vercelEnv }, { [name]: connection(`${token()}.invalid`) });

        const run = await build(env);

        expect(run.code, name).not.toBe(0);
        expect(run.ran, name).toEqual([]);
        const naming = run.lines.filter((line) => DATABASE_SETTINGS.some((other) => line.includes(other)));
        expect(naming, name).toHaveLength(1);
        expect(naming[0]).toContain(name);
        expect(naming[0]).toMatch(/preview and development deployments carry no database setting/);
      }
    });
  }

  it("AC-3: all four set print one line for each", async () => {
    const env: Env = { VERCEL: "1", VERCEL_ENV: "preview" };
    for (const name of DATABASE_SETTINGS) env[name] = connection(`${token()}.invalid`);

    const run = await build(env);

    expect(run.code).not.toBe(0);
    expect(run.ran).toEqual([]);
    for (const name of DATABASE_SETTINGS) {
      expect(run.lines.filter((line) => line.startsWith(`[vercel-build] ${name} is set`)), name).toHaveLength(1);
    }
    expect(previewDatabaseProblems(env)).toHaveLength(4);
  });

  it("AC-3: with VERCEL unset, as on a developer's computer, the refusal does not apply", async () => {
    const env: Env = { VERCEL_ENV: "preview", DATABASE_URL: connection(`${token()}.invalid`) };

    const run = await build(env);

    expect(previewDatabaseProblems(env)).toEqual([]);
    expect(run.code).toBe(0);
    expect(run.ran).toEqual(["next-build"]);
  });

  it("AC-3: an empty setting is not a setting, and a clean preview builds", async () => {
    const run = await build({ VERCEL: "1", VERCEL_ENV: "preview", DATABASE_URL: "", DIRECT_URL: "" });

    expect(run.code).toBe(0);
    expect(run.ran).toEqual(["next-build"]);
  });
});

describe("016 AC-4: a production build with incomplete or wrong settings does not build", () => {
  it("AC-4: a complete, well-formed set passes and prints the names it checked", async () => {
    const env = productionEnv();

    expect(problemsFor(env)).toEqual([]);
    const run = await build(env);

    expect(run.code).toBe(0);
    const checked = run.lines.find((line) => line.includes("check-settings: checked"));
    for (const name of CHECKED_SETTINGS) expect(checked).toContain(name);
    expect(CHECKED_SETTINGS).toEqual(
      expect.arrayContaining(["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "AUTH_URL", "PIN_PEPPER"]),
    );
  });

  it("AC-4: each of the five required settings, unset or empty, is refused by name before next build", async () => {
    for (const name of ["DATABASE_URL", "DIRECT_URL", "AUTH_SECRET", "AUTH_URL", "PIN_PEPPER"]) {
      for (const value of [undefined, ""]) {
        const env = withOnly(productionEnv(), { [name]: value });

        const run = await build(env);

        expect(run.code, name).not.toBe(0);
        expect(run.ran, name).toEqual([]);
        expect(run.lines.some((line) => line.includes(`${name} is not set`)), name).toBe(true);
        expect(run.lines).toContain("[vercel-build] check-settings failed");
      }
    }
  });

  it("AC-4: TEST_DATABASE_URL or TEST_DIRECT_URL set is refused", () => {
    for (const name of ["TEST_DATABASE_URL", "TEST_DIRECT_URL"]) {
      const problems = problemsFor({ ...productionEnv(), [name]: connection(`${token()}.invalid`) });
      expect(problems, name).toHaveLength(1);
      expect(problems[0]).toContain(name);
    }
  });

  it("AC-4: DATABASE_URL whose host lacks -pooler is refused", () => {
    const env = productionEnv();
    const direct = env.DIRECT_URL ?? "";
    const problems = problemsFor({ ...env, DATABASE_URL: direct.replace(/^[^@]*@/, `${SCHEME}://${token()}:${token()}@`) });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^DATABASE_URL .*-pooler/);
  });

  it("AC-4: DIRECT_URL whose host contains -pooler is refused", () => {
    const env = productionEnv();
    const pooled = env.DATABASE_URL ?? "";
    const problems = problemsFor({ ...env, DIRECT_URL: pooled.replace(/^[^@]*@/, `${SCHEME}://${token()}:${token()}@`) });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^DIRECT_URL .*-pooler/);
  });

  it("AC-4: two hosts that differ once -pooler is removed are refused", () => {
    const env = productionEnv();
    const problems = problemsFor({ ...env, DIRECT_URL: connection(`ep-${token()}.${token()}.invalid`) });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/DATABASE_URL and DIRECT_URL .*differ/);
  });

  it("AC-4: a connection string with no host is refused, naming the variable", () => {
    for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
      const problems = problemsFor({ ...productionEnv(), [name]: `not-a-url-${token()}` });
      expect(problems.some((problem) => problem.startsWith(`${name} is not a connection string`)), name).toBe(true);
    }
  });

  it("AC-4: AUTH_URL must be an https: origin with no path, query or fragment", () => {
    const host = `${token()}.invalid`;
    for (const value of [
      `http://${host}`,
      `https://${host}/`,
      `https://${host}/${token()}`,
      `https://${host}?${token()}=1`,
      `https://${host}#${token()}`,
      `https://${token()}@${host}`,
      host,
    ]) {
      const problems = problemsFor({ ...productionEnv(), AUTH_URL: value });
      expect(problems, "one problem per value").toHaveLength(1);
      expect(problems[0]).toMatch(/^AUTH_URL must be an https: origin/);
    }
    expect(problemsFor({ ...productionEnv(), AUTH_URL: `https://${host}` })).toEqual([]);
  });

  it("AC-4: PIN_PEPPER that fails isUsablePinPepper is refused", () => {
    for (const value of [randomBytes(31).toString("base64"), `${token()}!${token()}`]) {
      const problems = problemsFor({ ...productionEnv(), PIN_PEPPER: value });
      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(/^PIN_PEPPER is not usable/);
    }
  });

  it("AC-4: AUTH_SECRET shorter than 32 characters is refused, and 32 passes", () => {
    const secret = randomBytes(24).toString("base64");
    const problems = problemsFor({ ...productionEnv(), AUTH_SECRET: secret.slice(0, 31) });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^AUTH_SECRET is shorter than 32/);
    expect(problemsFor({ ...productionEnv(), AUTH_SECRET: secret.slice(0, 32) })).toEqual([]);
  });

  it("AC-4: SETUP_CODE set and shorter than 16 characters once trimmed is refused; 16, or unset, passes", () => {
    const code = newCode();
    const short = `  ${code.slice(0, 15)}   `;
    const problems = problemsFor({ ...productionEnv(), SETUP_CODE: short });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/^SETUP_CODE is set and shorter than 16/);
    const sixteen = code.slice(0, 16);
    expect(problemsFor({ ...productionEnv(), SETUP_CODE: sixteen })).toEqual([]);
    expect(problemsFor(withOnly(productionEnv(), { SETUP_CODE: undefined }))).toEqual([]);
  });

  it("AC-4: it lists every problem it finds, each naming its variable", async () => {
    const env = withOnly(productionEnv(), {
      AUTH_SECRET: newSecret().slice(0, 10),
      AUTH_URL: `http://${token()}.invalid`,
      PIN_PEPPER: undefined,
      TEST_DIRECT_URL: connection(`${token()}.invalid`),
    });

    const run = await build(env);

    expect(run.code).not.toBe(0);
    expect(run.ran).toEqual([]);
    for (const name of ["AUTH_SECRET", "AUTH_URL", "PIN_PEPPER", "TEST_DIRECT_URL"]) {
      expect(run.lines.some((line) => line.startsWith(`[vercel-build] check-settings: ${name}`)), name).toBe(true);
    }
  });
});

describe("016 AC-5: the build stops at the first failed step", () => {
  it("AC-5: runs the plan's steps in order and prints <step> ok after each", async () => {
    const run = await build(productionEnv());

    expect(run.code).toBe(0);
    expect(run.ran).toEqual(["next-build", "migrate-deploy", "seed-if-empty", "census"]);
    expect(run.lines.filter((line) => line.endsWith(" ok"))).toEqual([
      "[vercel-build] check-settings ok",
      "[vercel-build] next-build ok",
      "[vercel-build] migrate-deploy ok",
      "[vercel-build] seed-if-empty ok",
      "[vercel-build] census ok",
    ]);
  });

  const failures: [BuildStep, BuildStep[]][] = [
    ["next-build", ["next-build"]],
    ["migrate-deploy", ["next-build", "migrate-deploy"]],
    ["seed-if-empty", ["next-build", "migrate-deploy", "seed-if-empty"]],
    ["census", ["next-build", "migrate-deploy", "seed-if-empty", "census"]],
  ];

  for (const [failing, ran] of failures) {
    it(`AC-5: a failed ${failing} prints "${failing} failed", exits non-zero and runs no later step`, async () => {
      const run = await build(productionEnv(), { failAt: failing, failCode: 3 });

      expect(run.code).toBe(3);
      expect(run.ran).toEqual(ran);
      expect(run.lines.at(-1)).toBe(`[vercel-build] ${failing} failed`);
      expect(run.lines).not.toContain(`[vercel-build] ${failing} ok`);
    });
  }

  it("AC-5: a failed next-build on preview stops there too", async () => {
    const run = await build({ VERCEL: "1", VERCEL_ENV: "preview" }, { failAt: "next-build" });

    expect(run.code).not.toBe(0);
    expect(run.lines.at(-1)).toBe("[vercel-build] next-build failed");
  });

  it("AC-5: --dry-run prints the plan and runs nothing, even with settings that would be refused", async () => {
    const run = await build(
      { VERCEL: "1", VERCEL_ENV: "preview", DATABASE_URL: connection(`${token()}.invalid`) },
      { argv: ["--dry-run"] },
    );

    expect(run.code).toBe(0);
    expect(run.ran).toEqual([]);
    expect(run.lines).toContain("[vercel-build] plan: next-build");
  });

  it("AC-5: an unknown argument runs nothing", async () => {
    const run = await build(productionEnv(), { argv: ["--force"] });

    expect(run.code).not.toBe(0);
    expect(run.ran).toEqual([]);
  });
});

/**
 * AC-5's dry run, for real, under each VERCEL_ENV of AC-2.
 *
 * Why it is built this way. The first version spawned `npm run build:vercel -- --dry-run` five
 * times. On Windows each one starts a shell, npm, the `tsx` CLI and the Node it launches, about
 * 1.8 s on a quiet machine. Under the full gate, the unit suite's parallel workers saturate the
 * CPU, and three of those five start-ups ran into the kill switch at 12 s. The kill switch is not
 * raised: it exists so that a broken dry run cannot start a real `next build` under a blocked
 * worker. The cost is cut instead:
 *
 * - ONE case goes through the literal `npm run build:vercel -- --dry-run`. That proves the npm
 *   entry end to end, and it takes production, the plan with the most steps.
 * - The other four run the SAME script by the same code path, `scripts/vercel-build.ts` under
 *   tsx's loader: `node --import tsx scripts/vercel-build.ts --dry-run`. That is one process,
 *   about 0.55 s on a quiet machine. `deploy-config.test.ts` pins `build:vercel` to exactly
 *   `tsx scripts/vercel-build.ts`, so the two entries cannot drift apart.
 * - The describe block is sequential, so no two of these spawns ever overlap each other.
 *
 * The plan for every environment is also proved in-process, by `vercelBuild` above; these runs
 * prove the wiring of the real entry.
 */
describe.sequential("016 AC-5: npm run build:vercel -- --dry-run, for real, under each VERCEL_ENV of AC-2", () => {
  // The kill switch, for a broken dry run only. Not a budget, and never raised.
  const KILL_SWITCH_MS = 12_000;

  function dryRunEnv(vercelEnv: string | undefined): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...process.env, VERCEL: "1", VERCEL_ENV: vercelEnv };
    if (vercelEnv === undefined) delete env.VERCEL_ENV;
    for (const name of DATABASE_SETTINGS) delete env[name];
    return env;
  }

  function expectDryRun(result: ReturnType<typeof spawnSync>, plan: string): void {
    const stdout = String(result.stdout ?? "");
    expect(result.error, "the run was not killed and did start").toBeUndefined();
    expect(result.status).toBe(0);
    expect(stdout).toContain(`[vercel-build] plan: ${plan}\n`);
    expect(stdout).toContain("[vercel-build] dry run: nothing was run.");
    expect(stdout).not.toMatch(/ ok$/m);
  }

  it("AC-5: VERCEL_ENV production, through npm run build:vercel -- --dry-run itself, prints its plan and runs nothing", () => {
    const result = spawnSync("npm run --silent build:vercel -- --dry-run", {
      shell: true,
      encoding: "utf8",
      env: { ...dryRunEnv("production"), npm_config_update_notifier: "false" },
      timeout: KILL_SWITCH_MS,
    });

    expectDryRun(result, "check-settings, next-build, migrate-deploy, seed-if-empty, census");
  });

  const cases: [string | undefined, string][] = [
    ["preview", "next-build"],
    ["development", "next-build"],
    ["staging", "next-build"],
    [undefined, "next-build"],
  ];

  for (const [vercelEnv, plan] of cases) {
    it(`AC-5: VERCEL_ENV ${vercelEnv ?? "unset"}, through the same script under tsx's loader, prints its plan and runs nothing`, () => {
      const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/vercel-build.ts", "--dry-run"], {
        encoding: "utf8",
        env: dryRunEnv(vercelEnv),
        timeout: KILL_SWITCH_MS,
      });

      expectDryRun(result, plan);
    });
  }
});
