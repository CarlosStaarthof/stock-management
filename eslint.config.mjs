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

// The one named exception in docs/architecture.md's dependency rule, and its fence.
const LIB_MAY_ONLY_IMPORT_SERVER_ERRORS =
  "src/lib/ may import '@/server/errors' and nothing else from src/server/. The rule is a " +
  "proxy for 'nothing in src/lib/ reaches a database or a server-only runtime'; four " +
  "stateless error classes compromise neither, a service does. See docs/architecture.md " +
  "(dependency rule) and progress/review_seed_from_workbook.md, observation 3.";

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
    // docs/architecture.md, dependency rule: `src/lib/**` never imports from `src/server/`
    // or prisma, WITH ONE NAMED EXCEPTION - it may import the typed error classes from
    // `@/server/errors`, because spec 005 AC-2, AC-6 and AC-7 require the workbook reader
    // itself to throw `ValidationError`.
    //
    // That exception is enforced here rather than left to a comment (#5 review,
    // observation 3). A comment does not fail a build, and the constraint the rule is a
    // proxy for - nothing in `src/lib/` may reach a database or a server-only runtime -
    // stops holding the moment the exception widens to a service or to `@/server/db`.
    //
    // Test files are NOT excluded: a test under `src/lib/` that reached the database would
    // need one, and there is no reason for one to.
    files: ["src/lib/**/*.ts", "src/lib/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: restrictPrisma.paths,
          patterns: [
            ...restrictPrisma.patterns,
            // Everything under @/server/ except @/server/errors itself.
            { regex: "^@/server/(?!errors$)", message: LIB_MAY_ONLY_IMPORT_SERVER_ERRORS },
            // And no relative path may sneak in behind the alias. docs/conventions.md
            // requires `@/` for internal imports, so this forbids the whole shape.
            { regex: "^\\.{1,2}/.*\\bserver\\b", message: LIB_MAY_ONLY_IMPORT_SERVER_ERRORS },
          ],
        },
      ],
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
