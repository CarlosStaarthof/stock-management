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

/**
 * A path with `server` as one of its SEGMENTS, except the single permitted specifier.
 *
 * Spec 006 AC-33. The two prefix patterns this replaces compared strings, so
 * `@/./server/db` and `@/../src/server/db` walked straight past them while typechecking
 * and resolving perfectly well at runtime. A segment match cannot be fooled by a leading
 * `.` or by a longer route to the same directory, and the one exception is spelled
 * exactly: `@/server/errors`, and nothing else.
 *
 * Matches `@/server/db`, `@/server/items/item-service`, `@/./server/db`,
 * `@/../src/server/db`, `../server/db`, `./../server/db`. Does not match
 * `@/server/errors`, `@/lib/units`, or a directory merely spelled `serverside`.
 */
const LIB_TO_SERVER_PATTERN = "^(?!@/server/errors$).*(?:^|/)server(?:/|$)";

/** The same pattern as an esquery attribute regex, where `/` must be escaped. */
const LIB_TO_SERVER_ESQUERY = LIB_TO_SERVER_PATTERN.replace(/\//g, "\\/");

/**
 * The dynamic form, in BOTH of its static spellings.
 *
 * `import("@/server/db")` puts a `Literal` under the `ImportExpression`; the backtick
 * spelling puts a `TemplateLiteral`, which has no `value` property at all — so the first
 * selector cannot see it however good its regex is. It typechecks, it resolves, and it was
 * walking straight past the rule: exactly the complaint #5's reviewer made about
 * `await import("@/server/db")`, one node type along.
 *
 * A template WITH substitutions is matched too when its first chunk already reaches into
 * `@/server/`, which is the honest answer there. A specifier assembled at runtime — held
 * in a `const`, or built by `createRequire` — is beyond any static rule, and
 * `docs/architecture.md` says so rather than claiming otherwise.
 */
const LIB_TO_SERVER_SELECTORS = [
  `ImportExpression > Literal[value=/${LIB_TO_SERVER_ESQUERY}/]`,
  `ImportExpression > TemplateLiteral[quasis.0.value.raw=/${LIB_TO_SERVER_ESQUERY}/]`,
];

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
      // `no-restricted-imports` visits ImportDeclaration and the two export-from forms,
      // and does NOT visit ImportExpression - so `await import("@/server/db")` was the
      // third hole the #5 reviewer found (006 AC-33). It is closed here, on the SAME
      // pattern, so the two rules cannot drift into disagreeing about what `server` means.
      "no-restricted-syntax": [
        "error",
        ...LIB_TO_SERVER_SELECTORS.map((selector) => ({
          selector,
          message: LIB_MAY_ONLY_IMPORT_SERVER_ERRORS,
        })),
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: restrictPrisma.paths,
          patterns: [
            ...restrictPrisma.patterns,
            // ONE pattern, matching the path SEGMENT rather than a prefix.
            { regex: LIB_TO_SERVER_PATTERN, message: LIB_MAY_ONLY_IMPORT_SERVER_ERRORS },
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
