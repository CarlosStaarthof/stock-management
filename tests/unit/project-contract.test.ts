import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The parts of spec 002 that are facts about the project's own files rather than about
 * its runtime behaviour. `init` proves the four commands run; these tests pin the
 * contract they run under, so a later feature cannot quietly rename a script, drop the
 * Node floor, or slip a model into the scaffold's schema.
 */

type PackageJson = {
  engines?: { node?: string };
  scripts?: Record<string, string>;
};

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
const schema = readFileSync("prisma/schema.prisma", "utf8");
const tsconfig = readFileSync("tsconfig.json", "utf8");

describe("project contract", () => {
  it("AC-2: package.json defines the seven scripts init and the developer rely on", () => {
    const scripts = packageJson.scripts ?? {};

    for (const name of ["dev", "build", "start", "typecheck", "lint", "test:unit", "test:e2e"]) {
      expect(Object.keys(scripts)).toContain(name);
      expect(scripts[name]).toBeTruthy();
    }
  });

  it("AC-3: package.json declares engines.node >=20", () => {
    expect(packageJson.engines?.node).toBe(">=20");
  });

  it("AC-6 (002) narrowed by 003 AC-1: a generator, a postgresql datasource, and only User and Role", () => {
    expect(schema).toMatch(/generator\s+\w+\s*\{/);
    expect(schema).toMatch(/datasource\s+\w+\s*\{/);
    expect(schema).toMatch(/provider\s*=\s*"postgresql"/);
    expect(schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
    expect(schema).toMatch(/directUrl\s*=\s*env\("DIRECT_URL"\)/);

    // Spec 002 AC-6 required zero declarations. Spec 003 AC-1 supersedes that for
    // `User` and `Role` only - authentication cannot be tested against a table that
    // does not exist. Every OTHER model is still feature #4 domain_schema, and this is
    // an equality rather than a count, so #4 cannot slip one in early. Comments mention
    // both words, so declarations are counted at the start of a line.
    const declarations = schema
      .split("\n")
      .filter((line) => /^\s*(model|enum)\s+\w+\s*\{/.test(line));

    expect(declarations).toEqual(["enum Role {", "model User {"]);
  });

  it("AC-14: tsconfig.json turns strict mode on", () => {
    expect(tsconfig).toMatch(/"strict"\s*:\s*true/);
  });

  it("AC-15: tsconfig.json maps the @/ alias onto src/", () => {
    const parsed = JSON.parse(
      tsconfig.replace(/^\s*\/\/.*$/gm, ""),
    ) as { compilerOptions?: { paths?: Record<string, string[]> } };

    expect(parsed.compilerOptions?.paths?.["@/*"]).toEqual(["./src/*"]);
  });
});
