import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The Level 2 suite (docs/verification.md): services against a real Postgres.
 *
 * Disjoint from `npm run test:unit` by naming convention — this config runs only
 * `*.db.test.ts`, and `vitest.config.ts` excludes exactly those files (spec 003 AC-26).
 *
 * It is never invoked directly: `npm run test:db` goes through
 * `scripts/run-db-tests.mjs`, which refuses to run against the development database
 * before any test file is loaded.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
    // One database, one `User` table, and every test truncates it: files run one at a
    // time. Order between them does not matter — each seeds what it needs (AC-27).
    fileParallelism: false,
    // Neon is a network hop away and bcrypt at cost 10 is deliberately slow.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
