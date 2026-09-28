import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Runs one of this repository's TypeScript scripts the way its `npm run` entry does — `tsx`
 * under this Node — but with no shell, so a path with spaces or an argument holding a
 * connection string is passed as one argument and never re-parsed.
 *
 * The child's environment is exactly `env`: a test that wants the real one passes
 * `process.env`, and one that needs a variable absent deletes it first.
 */

const require = createRequire(join(process.cwd(), "package.json"));

function cliOf(packageName: string): string {
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const manifest = require(manifestPath) as { bin: string | Record<string, string> };
  const bin = typeof manifest.bin === "string" ? manifest.bin : (manifest.bin[packageName] ?? "");
  return join(dirname(manifestPath), bin);
}

export type ScriptRun = { status: number; stdout: string; stderr: string; printed: string };

function run(args: string[], env: NodeJS.ProcessEnv, input?: string): ScriptRun {
  const result = spawnSync(process.execPath, args, { encoding: "utf8", env, input });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return { status: result.status ?? 1, stdout, stderr, printed: `${stdout}\n${stderr}` };
}

export function runScript(
  script: string,
  args: readonly string[],
  env: NodeJS.ProcessEnv,
  input?: string,
): ScriptRun {
  return run([cliOf("tsx"), script, ...args], env, input);
}

/** The Prisma CLI, e.g. `["migrate", "deploy"]`, under the same rules. Its output is captured. */
export function runPrisma(args: readonly string[], env: NodeJS.ProcessEnv): ScriptRun {
  return run([cliOf("prisma"), ...args], env);
}

/** `env` without the named variables. */
export function without(env: NodeJS.ProcessEnv, names: readonly string[]): NodeJS.ProcessEnv {
  const copy: NodeJS.ProcessEnv = { ...env };
  for (const name of names) delete copy[name];
  return copy;
}
