import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

// docs/architecture.md: `src/server/` is the only layer that touches Prisma. That rule is
// enforced here rather than left to a comment (spec 002 AC-17) — a comment does not fail
// a build, and this is the boundary that keeps calculation out of presentation.
const PRISMA_ONLY_IN_SERVER =
  "PrismaClient belongs to src/server/ only. Import a service from '@/server/…' instead; " +
  "see docs/architecture.md (dependency rule).";

const restrictPrisma = {
  paths: [
    { name: "@prisma/client", message: PRISMA_ONLY_IN_SERVER },
    { name: ".prisma/client", message: PRISMA_ONLY_IN_SERVER },
  ],
  patterns: [
    { group: ["@prisma/client/*", "**/.prisma/client", "**/.prisma/client/*"], message: PRISMA_ONLY_IN_SERVER },
  ],
};

const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["src/app/**/*.ts", "src/app/**/*.tsx", "src/components/**/*.ts", "src/components/**/*.tsx"],
    rules: {
      "no-restricted-imports": ["error", restrictPrisma],
    },
  },
  {
    // Tests may reach for globals and fixtures the application code may not.
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
];

export default config;
