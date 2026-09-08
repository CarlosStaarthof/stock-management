// `npm run test:e2e` — Playwright, with its own browser.
//
// Spec 002 AC-11: the e2e suite must pass from a clean clone with no manual preparation,
// because AC-1 requires `init` to be green on a machine that has never run Playwright.
// A "remember to run playwright install" note in a README would fail that criterion, so
// this script installs Chromium itself when it is missing — and only then.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// Resolved through the package's own `bin` entry rather than a hard-coded path, so the
// script survives Playwright moving its CLI.
const playwrightPackageJson = require.resolve("@playwright/test/package.json");
const playwrightCli = join(
  dirname(playwrightPackageJson),
  require(playwrightPackageJson).bin.playwright,
);
const { chromium } = require("@playwright/test");

function runPlaywright(args) {
  const result = spawnSync(process.execPath, [playwrightCli, ...args], { stdio: "inherit" });
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

if (!chromiumIsInstalled()) {
  console.log("[e2e] Playwright's Chromium is not present on this machine; installing it.");
  const installStatus = runPlaywright(["install", "chromium"]);
  if (installStatus !== 0) {
    console.error("[e2e] browser install failed; cannot run the end-to-end suite.");
    process.exit(installStatus);
  }
}

process.exit(runPlaywright(["test", ...process.argv.slice(2)]));
