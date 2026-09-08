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
    // never run by `test:unit` (AC-10).
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**"],
    testTimeout: 15_000,
  },
});
