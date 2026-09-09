import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The `@/` alias must resolve in all four toolchains (spec 002 AC-15); this is
    // Vitest's copy of the mapping tsconfig.json declares.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Unit tests sit beside their source; Playwright specs live in tests/e2e and are
    // never run by `test:unit` (002 AC-10).
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    // `*.db.test.ts` needs a real Postgres and belongs to `npm run test:db`
    // (vitest.db.config.ts). The two suites are disjoint by name (003 AC-26), so
    // `test:unit` stays green on a machine with no database at all.
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**", "**/*.db.test.ts"],
    testTimeout: 15_000,
  },
});
