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
    // Hands the connection back when a file ends; see the file for why it is per-file.
    setupFiles: ["./vitest.db.setup.ts"],
    include: ["src/**/*.db.test.ts"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
    // One database, one `User` table, and every test truncates it: files run one at a
    // time. Order between them does not matter — each seeds what it needs (AC-27).
    fileParallelism: false,
    // ...and in ONE PROCESS. Vitest's default is a fresh fork per file, so `src/server/db.ts`
    // built a PrismaClient per file — 22 of them, each with Prisma's default pool of
    // `cpus × 2 + 1` — against a test compute that cannot supply that many backends. The
    // suite was asking for hundreds of connection slots per run and failing with zero
    // assertion failures, a different file each time. One fork means one client, stashed
    // on `globalThis` and shared by every file. `isolate` stays at its default, so module
    // registries still reset per file: only the process is shared.
    poolOptions: { forks: { singleFork: true } },
    // Neon is a network hop away and bcrypt at cost 10 is deliberately slow.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
