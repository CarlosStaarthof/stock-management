import { readFileSync } from "node:fs";
import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * Spec 006 AC-33: the fence from `src/lib/` to `src/server/`, proved BY MUTATION.
 *
 * `docs/architecture.md`'s dependency rule says `src/lib/**` may import `@/server/errors`
 * and nothing else from `src/server/`. Until this feature that promise was overstated:
 * the #5 reviewer found three spellings that walked past the rule — `@/./server/db`,
 * `@/../src/server/db` and `await import("@/server/db")` — all of which typecheck and
 * resolve perfectly well at runtime.
 *
 * Reading the config would not have caught them, and did not. So this test asks ESLint
 * itself, through `lintText` with `filePath` set under `src/lib/`: the text is never
 * written to the tree, nothing is created and nothing is deleted, and the answer is the
 * one `npm run lint` would give for a real file at that path.
 */
const FENCE_RULES = ["no-restricted-imports", "no-restricted-syntax"];

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({});
});

async function fenceErrorsFor(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${code}\nexport const probe = 1;\n`, { filePath });

  return result.messages
    .filter((message) => message.severity === 2)
    .filter((message) => message.ruleId !== null && FENCE_RULES.includes(message.ruleId))
    .map((message) => message.ruleId as string);
}

/**
 * The nine shapes the #5 reviewer already blocked, plus the three that slipped through.
 * Every one of them must produce at least one fence error from a file under `src/lib/`.
 */
const BLOCKED: { name: string; code: string }[] = [
  { name: "@/server/db", code: 'import { db } from "@/server/db";\nvoid db;' },
  {
    name: "@/server/items/item-service",
    code: 'import { listItems } from "@/server/items/item-service";\nvoid listItems;',
  },
  { name: 'export * from "@/server/db"', code: 'export * from "@/server/db";' },
  { name: 'export { db } from "@/server/db"', code: 'export { db } from "@/server/db";' },
  { name: "../server/db", code: 'import { db } from "../server/db";\nvoid db;' },
  { name: "./../server/db", code: 'import { db } from "./../server/db";\nvoid db;' },
  {
    name: "@/server/auth/session (a service, not an error class)",
    code: 'import { requireRole } from "@/server/auth/session";\nvoid requireRole;',
  },
  { name: 'import "@/server/db" for effect', code: 'import "@/server/db";' },
  {
    name: "@prisma/client",
    code: 'import { PrismaClient } from "@prisma/client";\nvoid PrismaClient;',
  },
  // The three the #5 reviewer reproduced and could not block (006 AC-33).
  { name: "@/./server/db", code: 'import { db } from "@/./server/db";\nvoid db;' },
  { name: "@/../src/server/db", code: 'import { db } from "@/../src/server/db";\nvoid db;' },
  {
    name: 'await import("@/server/db")',
    code: 'export async function reach() { return import("@/server/db"); }',
  },
  // Found by the #6 reviewer, in the very class this rule exists to close. A
  // no-substitution template literal is a `TemplateLiteral`, not a `Literal`, and has no
  // `value` property at all — so `ImportExpression > Literal[value=/…/]` could not see it
  // however good its regex was. It typechecked, it resolved, and `eslint` exited 0.
  {
    name: "import(`@/server/db`) — a TemplateLiteral, not a Literal",
    code: "export async function reach() { return import(`@/server/db`); }",
  },
  {
    name: "import(`@/server/items/item-service`)",
    code: "export async function reach() { return import(`@/server/items/item-service`); }",
  },
  {
    name: "import(`@/server/${name}`) — a template whose first chunk already reaches in",
    code: "export async function reach(name: string) { return import(`@/server/${name}`); }",
  },
];

const PERMITTED: { name: string; code: string; filePath: string }[] = [
  {
    name: "@/server/errors from src/lib/",
    code: 'import { ValidationError } from "@/server/errors";\nvoid ValidationError;',
    filePath: "src/lib/fence-probe.ts",
  },
  {
    name: "@/lib/units from src/lib/",
    code: 'import { normaliseUnit } from "@/lib/units";\nvoid normaliseUnit;',
    filePath: "src/lib/fence-probe.ts",
  },
  {
    name: "import(`@/server/errors`) - the exception holds in the template form too",
    code: "export async function reach() { return import(`@/server/errors`); }",
    filePath: "src/lib/fence-probe.ts",
  },
  {
    name: "import(`@/lib/units`) - an ordinary dynamic import is not the rule's business",
    code: "export async function reach() { return import(`@/lib/units`); }",
    filePath: "src/lib/fence-probe.ts",
  },
  {
    name: "@/server/db from src/server/",
    code: 'import { db } from "@/server/db";\nvoid db;',
    filePath: "src/server/items/fence-probe.ts",
  },
];

describe("AC-33: the lib -> server fence, asserted through ESLint itself", () => {
  it("AC-33: covers the nine blocked shapes, the three that slipped through, and the three template spellings", () => {
    expect(BLOCKED).toHaveLength(15);
  });

  for (const shape of BLOCKED) {
    it(`AC-33: \`${shape.name}\` is an error from src/lib/`, async () => {
      const errors = await fenceErrorsFor(shape.code, "src/lib/fence-probe.ts");

      expect(errors.length, `${shape.name} produced no fence error`).toBeGreaterThanOrEqual(1);
    });
  }

  for (const shape of PERMITTED) {
    it(`AC-33: \`${shape.name}\` produces zero fence errors`, async () => {
      const errors = await fenceErrorsFor(shape.code, shape.filePath);

      expect(errors).toEqual([]);
    });
  }

  it("AC-33: nothing was written to the tree - lintText takes TEXT", async () => {
    // The probe path is deliberately a file that does not exist. If `lintText` had needed
    // one, every assertion above would have failed rather than passed silently.
    expect(() => readFileSync("src/lib/fence-probe.ts", "utf8")).toThrow();
  });

  it("AC-33: docs/architecture.md no longer promises something untrue", () => {
    const architecture = readFileSync("docs/architecture.md", "utf8");

    expect(architecture).not.toContain("Three spellings currently slip through");
    expect(architecture).not.toContain("The fix, open for whoever next touches the lint config");
    // And it now states the guarantee it can keep.
    expect(architecture).toContain("(^|/)server(/|$)");
  });
});
