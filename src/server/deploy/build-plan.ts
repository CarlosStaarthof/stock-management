import { SETUP_CODE_MIN_LENGTH } from "@/server/auth/credential-rules";
import { isUsablePinPepper } from "@/server/auth/password";

/**
 * What Vercel's build does, decided from where it runs (spec 016 D4, D8, D9, AC-2 to AC-5).
 *
 * Pure: every function here reads the settings it is GIVEN, never `process.env`, and runs
 * nothing itself. `scripts/vercel-build.ts` passes the real environment and a runner that
 * spawns the real commands; the unit tests pass sentinels and stand-in steps.
 *
 * Every problem this module reports names a variable and a rule. None carries a value, a
 * host or any part of one, because Vercel's build log is relayed by hand (D1).
 */

export type BuildStep = "check-settings" | "next-build" | "migrate-deploy" | "seed-if-empty" | "census";

export type Env = Record<string, string | undefined>;

const PRODUCTION_PLAN: readonly BuildStep[] = [
  "check-settings",
  "next-build",
  "migrate-deploy",
  "seed-if-empty",
  "census",
];

/**
 * AC-2: only a production build touches a database. Preview, development, anything else and
 * nothing at all get `next build` alone.
 */
export function planVercelBuild(env: Env): BuildStep[] {
  return env.VERCEL_ENV === "production" ? [...PRODUCTION_PLAN] : ["next-build"];
}

/**
 * The command each spawned step runs: a package's own CLI and its arguments. The
 * `check-settings` step is not spawned; it is `productionSettingsProblems` below.
 */
export const STEP_COMMANDS: Readonly<
  Record<Exclude<BuildStep, "check-settings">, { cli: "next" | "prisma" | "tsx"; args: readonly string[] }>
> = {
  "next-build": { cli: "next", args: ["build"] },
  "migrate-deploy": { cli: "prisma", args: ["migrate", "deploy"] },
  "seed-if-empty": { cli: "tsx", args: ["scripts/seed-if-empty.ts"] },
  census: { cli: "tsx", args: ["scripts/db-census.ts"] },
};

/** The four settings that name a database. A preview or development build carries none (D4). */
export const DATABASE_SETTINGS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "TEST_DATABASE_URL",
  "TEST_DIRECT_URL",
] as const;

/**
 * AC-3: on Vercel (`VERCEL` is `1`), a build that is not production and finds a database
 * setting refuses to build. Off Vercel — a developer's computer — this does not apply.
 */
export function previewDatabaseProblems(env: Env): string[] {
  if (env.VERCEL !== "1" || env.VERCEL_ENV === "production") return [];

  return DATABASE_SETTINGS.filter((name) => (env[name] ?? "") !== "").map(
    (name) =>
      `${name} is set, but preview and development deployments carry no database setting. ` +
      "Remove it from this Vercel environment.",
  );
}

const REQUIRED_IN_PRODUCTION = [
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "PIN_PEPPER",
] as const;

/** Every name `check-settings` looks at, printed when the set passes. */
export const CHECKED_SETTINGS: readonly string[] = [
  ...REQUIRED_IN_PRODUCTION,
  "SETUP_CODE",
  "TEST_DATABASE_URL",
  "TEST_DIRECT_URL",
];

const AUTH_SECRET_MIN_LENGTH = 32;
const POOLER_MARK = "-pooler";

/** The host of a connection string, or `null` when the value is not a URL with a host. */
export function hostOf(value: string): string | null {
  try {
    const host = new URL(value).hostname;
    return host === "" ? null : host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * The host rule: a pooled and an unpooled host name one database endpoint when they are
 * equal once `-pooler` is removed. The production build checks the two settings with it, and
 * so does a restore (`target-schema.ts`), so the two can never disagree about it.
 */
export function sameEndpoint(pooledHost: string, directHost: string): boolean {
  return pooledHost.replaceAll(POOLER_MARK, "") === directHost.replaceAll(POOLER_MARK, "");
}

/** `value` is exactly an `https:` origin: no path, query, fragment or user-info. */
function isHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.origin === value;
  } catch {
    return false;
  }
}

/**
 * AC-4: what is wrong with a production build's settings, every problem at once. Each line
 * names the variable and the rule; the rules compare hosts, but no host is ever returned.
 */
export function productionSettingsProblems(env: Env): string[] {
  const problems: string[] = [];

  for (const name of REQUIRED_IN_PRODUCTION) {
    if ((env[name] ?? "") === "") problems.push(`${name} is not set or is empty.`);
  }

  for (const name of ["TEST_DATABASE_URL", "TEST_DIRECT_URL"] as const) {
    if (env[name] !== undefined) {
      problems.push(`${name} is set. A production build never carries a test database setting.`);
    }
  }

  const pooled = env.DATABASE_URL ?? "";
  const direct = env.DIRECT_URL ?? "";
  const pooledHost = pooled === "" ? null : hostOf(pooled);
  const directHost = direct === "" ? null : hostOf(direct);

  if (pooled !== "" && pooledHost === null) {
    problems.push("DATABASE_URL is not a connection string with a host.");
  }
  if (direct !== "" && directHost === null) {
    problems.push("DIRECT_URL is not a connection string with a host.");
  }
  if (pooledHost !== null && !pooledHost.includes(POOLER_MARK)) {
    problems.push(`DATABASE_URL must be the pooled connection: its host must contain ${POOLER_MARK}.`);
  }
  if (directHost !== null && directHost.includes(POOLER_MARK)) {
    problems.push(`DIRECT_URL must be the unpooled connection: its host must not contain ${POOLER_MARK}.`);
  }
  if (pooledHost !== null && directHost !== null && !sameEndpoint(pooledHost, directHost)) {
    problems.push(
      `DATABASE_URL and DIRECT_URL must name the same database: their hosts differ once ${POOLER_MARK} is removed.`,
    );
  }

  const authUrl = env.AUTH_URL ?? "";
  if (authUrl !== "" && !isHttpsOrigin(authUrl)) {
    problems.push("AUTH_URL must be an https: origin, with no path, query or fragment.");
  }

  const pepper = env.PIN_PEPPER ?? "";
  if (pepper !== "" && !isUsablePinPepper(pepper)) {
    problems.push("PIN_PEPPER is not usable: it must be base64 that decodes to at least 32 bytes.");
  }

  const secret = env.AUTH_SECRET ?? "";
  if (secret !== "" && Array.from(secret).length < AUTH_SECRET_MIN_LENGTH) {
    problems.push(`AUTH_SECRET is shorter than ${AUTH_SECRET_MIN_LENGTH} characters.`);
  }

  const setupCode = env.SETUP_CODE;
  if (setupCode !== undefined && Array.from(setupCode.trim()).length < SETUP_CODE_MIN_LENGTH) {
    problems.push(`SETUP_CODE is set and shorter than ${SETUP_CODE_MIN_LENGTH} characters once trimmed.`);
  }

  return problems;
}

export const BUILD_PREFIX = "[vercel-build]";

export type RunStep = (step: Exclude<BuildStep, "check-settings">) => number | Promise<number>;

export type VercelBuildInput = {
  argv: readonly string[];
  env: Env;
  runStep: RunStep;
  print: (line: string) => void;
};

/**
 * AC-3 to AC-5: the whole of `npm run build:vercel`. It returns the exit code.
 *
 * With `--dry-run` it prints the plan and runs nothing. Otherwise it refuses a preview build
 * that carries a database setting, then runs the plan's steps in order, printing
 * `<step> ok` after each, and stops at the first that fails, so a failed `next build`
 * never reaches the database and a failed migration never reaches the seed.
 */
export async function vercelBuild(input: VercelBuildInput): Promise<number> {
  const { argv, env, runStep, print } = input;
  const say = (line: string): void => print(`${BUILD_PREFIX} ${line}`);

  const unknown = argv.filter((argument) => argument !== "--dry-run");
  if (unknown.length > 0) {
    say("usage: npm run build:vercel [-- --dry-run]");
    return 2;
  }

  const plan = planVercelBuild(env);

  if (argv.includes("--dry-run")) {
    say(`plan: ${plan.join(", ")}`);
    say("dry run: nothing was run.");
    return 0;
  }

  const refusals = previewDatabaseProblems(env);
  if (refusals.length > 0) {
    for (const refusal of refusals) say(refusal);
    say("refused: nothing was built.");
    return 1;
  }

  for (const step of plan) {
    if (step === "check-settings") {
      const problems = productionSettingsProblems(env);
      if (problems.length > 0) {
        for (const problem of problems) say(`check-settings: ${problem}`);
        say("check-settings failed");
        return 1;
      }
      say(`check-settings: checked ${CHECKED_SETTINGS.join(", ")}`);
      say("check-settings ok");
      continue;
    }

    let code: number;
    try {
      code = await runStep(step);
    } catch {
      code = 1;
    }
    if (code !== 0) {
      say(`${step} failed`);
      return code;
    }
    say(`${step} ok`);
  }

  return 0;
}
