import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
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

  it("AC-6 (002) narrowed by 003 AC-1, replaced by 004 AC-1: a generator, a postgresql datasource, and exactly the nine models and three enums of Part 3", () => {
    expect(schema).toMatch(/generator\s+\w+\s*\{/);
    expect(schema).toMatch(/datasource\s+\w+\s*\{/);
    expect(schema).toMatch(/provider\s*=\s*"postgresql"/);
    expect(schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
    expect(schema).toMatch(/directUrl\s*=\s*env\("DIRECT_URL"\)/);

    // Spec 002 AC-6 required zero declarations. 003 AC-1 superseded that for `User` and
    // `Role` only. 004 AC-1 supersedes it again, for the whole of specs/domain-model.md
    // Part 3 and not one declaration more - so this assertion is REPLACED, not relaxed.
    // It stays an equality rather than a count, so a tenth model cannot arrive quietly
    // and neither can a swap. Comments mention both words, so declarations are counted at
    // the start of a line.
    const declarations = schema
      .split("\n")
      .filter((line) => /^\s*(model|enum)\s+\w+\s*\{/.test(line));

    expect(declarations).toEqual([
      "enum Role {",
      "enum CountStatus {",
      "enum UnitKind {",
      "model User {",
      "model Location {",
      "model Supplier {",
      "model ItemType {",
      "model Item {",
      "model ItemPrice {",
      "model ItemLocation {",
      "model StockCount {",
      "model StockCountLine {",
    ]);
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

describe("the two test suites stay disjoint", () => {
  it("004 AC-27: src/server/schema holds only *.db.test.ts files", () => {
    // These assertions need a real Postgres; naming them `.db.test.ts` is what keeps
    // `npm run test:unit` green on a machine with no database at all. The directory holds
    // tests and nothing else - the schema has no service to own it.
    const entries = readdirSync("src/server/schema", { withFileTypes: true });

    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.isFile(), `${entry.name} is a file`).toBe(true);
      expect(entry.name.endsWith(".db.test.ts"), `${entry.name} is a *.db.test.ts`).toBe(true);
    }
  });

  it("004 AC-27 / 003 AC-26: test:unit excludes *.db.test.ts and test:db includes exactly them", () => {
    const unitConfig = readFileSync("vitest.config.ts", "utf8");
    const dbConfig = readFileSync("vitest.db.config.ts", "utf8");

    expect(unitConfig).toContain('"**/*.db.test.ts"');
    expect(dbConfig).toContain('include: ["src/**/*.db.test.ts"]');
  });
});

describe("the money boundary has not been crossed yet", () => {
  // Spec 004 AC-31. `unitPriceSnapshot` is the first monetary column in the schema, and
  // this feature ships no QUERY that returns it: the first real reader is #8, and it must
  // go through shapeForRole. So no shipping module - nothing under src/ or scripts/ that
  // is not itself a test - may so much as name the column yet. Test files are excluded
  // because a test that names the string is asserting about it, not returning it to a
  // session: src/lib/money-boundary.test.ts has used it as a fixture since #3.
  const IS_TEST = /\.test\.ts$/;

  it("004 AC-31: no shipping module under src/ or scripts/ mentions unitPrice yet", () => {
    const tracked = spawnSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "src", "scripts"],
      { encoding: "utf8" },
    );

    const scanned = (tracked.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((file) => /\.(ts|tsx|mjs|cjs|js)$/.test(file))
      .filter((file) => !IS_TEST.test(file));

    // The scan must have looked at something, or the assertion below is vacuous.
    expect(scanned).toContain("src/server/db.ts");

    const offenders = scanned.filter((file) => /unitPrice/.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });
});
