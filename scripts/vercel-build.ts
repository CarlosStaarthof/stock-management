/**
 * `npm run build:vercel` — Vercel's build command (`vercel.json` → `buildCommand`, spec 016
 * AC-1 to AC-5).
 *
 *   npm run build:vercel [-- --dry-run]
 *
 * Every decision lives in `src/server/deploy/build-plan.ts`, which the unit tests drive with
 * stand-in steps. This file only wires it to the real environment and to real commands: each
 * spawned step runs a package's own CLI with `process.execPath`, no shell, inheriting this
 * process's output so Vercel's log shows it, and its environment unchanged.
 *
 * `init` and the `test:*` scripts never run this file (AC-1): it is Vercel's, and a
 * production run of it migrates and seeds whatever `DIRECT_URL` names.
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { STEP_COMMANDS, vercelBuild, type RunStep } from "@/server/deploy/build-plan";

const require = createRequire(join(process.cwd(), "package.json"));

/** A package's CLI, through its own `bin` entry, so a moved CLI does not break the build. */
function cliOf(packageName: string): string {
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const manifest = require(manifestPath) as { bin: string | Record<string, string> };
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin[packageName];
  return join(dirname(manifestPath), bin);
}

const runStep: RunStep = (step) => {
  const command = STEP_COMMANDS[step];
  const result = spawnSync(process.execPath, [cliOf(command.cli), ...command.args], {
    stdio: "inherit",
    env: process.env,
  });
  return result.error === undefined ? (result.status ?? 1) : 1;
};

vercelBuild({
  argv: process.argv.slice(2),
  env: process.env,
  runStep,
  print: (line) => console.log(line),
})
  .then((code) => {
    process.exit(code);
  })
  .catch(() => {
    console.error("[vercel-build] failed: the runner itself stopped unexpectedly");
    process.exit(1);
  });
