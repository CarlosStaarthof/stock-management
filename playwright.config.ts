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

/**
 * Spec 006 AC-35: the suite serves a BUILD, and cannot hide a failure.
 *
 * The flaky count over the last three gate runs went 0 -> 1 -> 2, and both failures in the
 * third were `read ECONNRESET` — the server dropping a connection, not an assertion
 * failing. The cause was structural: three workers against `npm run dev`, which compiles
 * each route on demand, in one process, the first time a worker asks for it. Two previous
 * sessions absorbed that by raising `timeout` to 90 s and `expect.timeout` to 25 s, and
 * raising the limit is what turned one flaky test into two.
 *
 * So `scripts/run-e2e.mjs` builds once, this config serves that build with `next start`,
 * and the three numbers below come down to what a served build meets comfortably. With no
 * on-demand compilation there is no cold-route race left to lose.
 *
 * `retries: 0`, so a failure is a failure. #4's reviewer wrote the warning down at the
 * time: `retries: 1` means a genuinely intermittent regression can still reach `done`, and
 * #6 is the first feature whose criteria are mostly browser-level.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  // Files run in parallel across the three workers; the tests INSIDE a file run in order,
  // in one worker. That is not a performance choice: the item-master specs share a
  // per-file `beforeAll` fixture, and `fullyParallel` distributes one file's tests across
  // workers - which runs that `beforeAll` once per worker and puts three copies of the
  // fixture into the user's development database at once (006 AC-34). Eight spec files
  // and three workers is still three files at a time.
  fullyParallel: false,
  workers: 3,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Playwright starts the application itself (spec 002 AC-11): no separately launched
  // server, so `init` is green on a machine where nothing is already running.
  //
  // `reuseExistingServer` is false, and deliberately: a stray `npm run dev` on port 3000
  // would otherwise be silently adopted, and the suite would once again be testing the
  // development server AC-35 exists to stop it testing. Failing fast on a busy port says
  // what is wrong; passing against the wrong server does not.
  webServer: {
    command: "npm run start",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
