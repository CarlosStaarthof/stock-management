import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

// The specs seed users and mint session tokens, so this process needs the same
// connection strings and AUTH_SECRET the dev server reads. .env is gitignored and denied
// to agents; loading it programmatically is how every tool here reads it, and variables
// already in the environment still win.
if (existsSync(".env")) {
  try {
    process.loadEnvFile(".env");
  } catch {
    // No .env is a legitimate state: specs that need a database skip themselves (AC-28).
  }
}

const PORT = 3000;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  // The dev server compiles each route the first time a worker asks for it, and several
  // workers ask at once. 10 s was tight enough that a cold /stock-entry could lose the
  // race; the assertion is about behaviour, not speed.
  expect: { timeout: 25_000 },
  fullyParallel: true,
  // One dev server serves every worker, and it compiles each route the first time it is
  // asked for. Beyond a handful of workers the contention, not the application, is what
  // decides whether an assertion arrives in time.
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  // One retry, and one only. The dev server occasionally resets a keep-alive socket
  // under parallel load on Windows (`read ECONNRESET` on a request that never reached
  // the application); that is infrastructure, not behaviour. A real regression still
  // fails both attempts, and `init` still goes red.
  retries: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Playwright starts the application itself (spec 002 AC-11): no separately launched
  // dev server, so `init` is green on a machine where nothing is already running.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
