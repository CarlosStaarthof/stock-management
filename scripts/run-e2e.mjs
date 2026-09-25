// `npm run test:e2e` — Playwright, with its own browser.
//
// Spec 002 AC-11: the e2e suite must pass from a clean clone with no manual preparation,
// because AC-1 requires `init` to be green on a machine that has never run Playwright.
// A "remember to run playwright install" note in a README would fail that criterion, so
// this script installs Chromium itself when it is missing — and only then.
//
// Feature #3 adds the same argument for the session secret: signing in needs an
// AUTH_SECRET, and a machine whose operator has not generated one yet is not a machine
// with a broken test suite. When AUTH_SECRET is absent or empty this script mints an
// EPHEMERAL one for this run only and passes it to both Playwright and the dev server it
// starts. It is never written to a file, it changes on every run, and the APPLICATION
// keeps no fallback of its own: with no secret configured, Auth.js refuses every session,
// which is exactly what spec 003 AC-22 requires.
//
// Feature #6 adds the build. Spec 006 AC-35: the suite serves a PRODUCTION BUILD rather
// than `next dev`, because three workers against a server that compiles routes on demand
// is what made the suite flaky - `read ECONNRESET` twice in the last gate run, on requests
// that never reached the application. The build happens HERE, once, before Playwright
// starts: `playwright.config.ts`'s webServer then only has to `next start`, which is why
// its timeout could come down with the rest of them.
//
// A FULL run runs the config's two projects itself, one after the other. Spec 007 AC-30
// put the counting specs in a second project that DEPENDS on the first, and the
// dependency is there for ORDER: #6's specs edit the yard sheets, and a count started
// while they are editing references their items. But a Playwright dependency does a
// second thing nobody chose: one failure in the first project and the second is skipped
// WHOLE. On 2026-09-23 one #6 test failed and all 136 tests of the second project went
// unreported - every #11 test among them. The gate did not say "#11 failed"; it said
// nothing about #11 at all.
//
// So with no arguments this script runs `--project=chromium`, and when that has FINISHED,
// `--project=chromium-stock-entry --no-deps`. Order is kept, because the second phase
// cannot start before the first has ended; and nothing is hidden, because the second
// phase runs whatever the first did. That is the opposite of loosening the gate: a red
// first phase still makes this command red, and now the second phase's results are on
// the page beside it. The cost is a second `next start`, a few seconds.
//
// READ PHASE 2 WITH THAT IN MIND AFTER A RED PHASE 1: phase 2 runs on whatever phase 1 left
// behind. A phase-1 test that failed mid-way may not have cleaned up, and its item-master
// debris can sit on the yard sheets phase 2's fixtures pick items from, so phase-2 failures
// after a red phase 1 are ADVISORY until phase 1 is green again. Phase-2 results after a
// green phase 1 are the real thing.
//
// `playwright.config.ts` is deliberately untouched. Its `dependencies: ["chromium"]` is
// pinned by two unit tests, and it is what still orders a bare `npx playwright test`.
// With arguments - a spec, a `--project`, a `-g` - this script runs once with exactly
// those, as it always has: a caller who names what to run gets exactly that.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// The specs seed users and mint session tokens, so this process needs the same variables
// the dev server reads. Variables already in the environment still take precedence.
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // A machine with no .env runs the suite that needs neither database nor secret.
  }
}

const childEnv = { ...process.env };

if ((childEnv.AUTH_SECRET ?? "").trim() === "") {
  childEnv.AUTH_SECRET = randomBytes(32).toString("base64");
  console.log(
    "[e2e] AUTH_SECRET is not set in this environment; using an ephemeral secret for " +
      "this run only. Generate a real one for .env before running the app itself.",
  );
}

/** Resolved through each package's own `bin` entry, so a moved CLI does not break this. */
function cliOf(packageName) {
  const packageJsonPath = require.resolve(`${packageName}/package.json`);
  const bin = require(packageJsonPath).bin;
  return join(dirname(packageJsonPath), typeof bin === "string" ? bin : bin[packageName]);
}

// Resolved through the package's own `bin` entry rather than a hard-coded path, so the
// script survives Playwright moving its CLI.
const playwrightPackageJson = require.resolve("@playwright/test/package.json");
const playwrightCli = join(
  dirname(playwrightPackageJson),
  require(playwrightPackageJson).bin.playwright,
);
const { chromium } = require("@playwright/test");

function runPlaywright(args) {
  const result = spawnSync(process.execPath, [playwrightCli, ...args], {
    stdio: "inherit",
    env: childEnv,
  });
  if (result.error) {
    console.error(`[e2e] could not run playwright: ${result.error.message}`);
    return 1;
  }
  return result.status ?? 1;
}

function chromiumIsInstalled() {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

// One build, before any worker starts. 004 AC-26 and 005 AC-27 already prove
// `npm run build` exits 0 with no reachable database, so this does not change the
// no-database path: it fails there for the same reason it fails anywhere, or not at all.
console.log("[e2e] building the application; the suite runs against the build, not `next dev`.");
const buildResult = spawnSync(process.execPath, [cliOf("next"), "build"], {
  stdio: "inherit",
  env: childEnv,
});
if (buildResult.error) {
  console.error(`[e2e] could not run next build: ${buildResult.error.message}`);
  process.exit(1);
}
if ((buildResult.status ?? 1) !== 0) {
  console.error("[e2e] the build failed; there is nothing to serve.");
  process.exit(buildResult.status ?? 1);
}

if (!chromiumIsInstalled()) {
  console.log("[e2e] Playwright's Chromium is not present on this machine; installing it.");
  const installStatus = runPlaywright(["install", "chromium"]);
  if (installStatus !== 0) {
    console.error("[e2e] browser install failed; cannot run the end-to-end suite.");
    process.exit(installStatus);
  }
}

const callerArgs = process.argv.slice(2);
if (callerArgs.length > 0) {
  process.exit(runPlaywright(["test", ...callerArgs]));
}

const phases = [
  { name: "chromium", args: ["--project=chromium"] },
  { name: "chromium-stock-entry", args: ["--project=chromium-stock-entry", "--no-deps"] },
];

const outcomes = [];
for (const phase of phases) {
  console.log(`[e2e] phase ${outcomes.length + 1} of ${phases.length}: ${phase.name}`);
  outcomes.push({ name: phase.name, status: runPlaywright(["test", ...phase.args]) });
}

for (const [index, { name, status }] of outcomes.entries()) {
  console.log(
    `[e2e] phase ${index + 1} (${name}): ${status === 0 ? "passed" : `FAILED, exit ${status}`}`,
  );
}
process.exit(outcomes.find(({ status }) => status !== 0)?.status ?? 0);
