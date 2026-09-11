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

describe("the money boundary, and where the first monetary column may be named", () => {
  // Spec 004 AC-31, AMENDED by 005 AC-29 and AMENDED AGAIN by 006 AC-31 - amended each
  // time, never deleted and never loosened into a directory exemption.
  //
  // #4 asserted that NO shipping module under src/ or scripts/ names `unitPrice`, because
  // none could legitimately need it yet. #5's writer must: it is the feature that puts the
  // workbook's 129 prices into `ItemPrice`. #6 is the first feature that RENDERS one, so
  // two presentation files join the list. The list is therefore nine files, and it is a
  // list of FILES rather than a directory exemption - a tenth module naming the column
  // turns this red, wherever it lives. Three assertions carry it:
  //
  //   * the whole tree names it in exactly those nine places;
  //   * src/lib/ and scripts/ stay at ZERO, which is why `formatPriceExact` takes
  //     `value: string`, and under src/app/ and src/components/ only the three named
  //     files may say it - each behind a route no YARD_STAFF session can reach (006 AC-2);
  //   * `unitPriceSnapshot` stays forbidden everywhere outside a test, because its first
  //     reader is still #9 and it must go through shapeForRole.
  //
  // Test files are excluded from the scan throughout: a test that names the string is
  // asserting about it, not returning it to a session - src/lib/money-boundary.test.ts has
  // used it as a fixture since #3.
  const IS_TEST = /\.test\.ts$/;

  /** Tracked and untracked source files under src/ and scripts/, tests excluded. */
  function shippingModules(): string[] {
    const tracked = spawnSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "src", "scripts"],
      { encoding: "utf8" },
    );

    return (tracked.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((file) => /\.(ts|tsx|mjs|cjs|js)$/.test(file))
      .filter((file) => !IS_TEST.test(file));
  }

  it("006 AC-31 amending 005 AC-29: exactly nine modules may name unitPrice", () => {
    const scanned = shippingModules();

    // The scan must have looked at something, or the assertion below is vacuous.
    expect(scanned).toContain("src/server/db.ts");

    const offenders = scanned
      .filter((file) => /unitPrice/.test(readFileSync(file, "utf8")))
      .sort();

    // #6 is the first feature that legitimately RENDERS a price, so the permitted list
    // grows from two to nine - and stays a list of FILES, never a directory exemption.
    // The two presentation files on it sit behind a route no YARD_STAFF session can
    // reach at all (006 AC-2), which is what justifies them being on it. A tenth module
    // naming the column turns this red.
    expect(offenders).toEqual([
      "src/app/item-master/actions.ts",
      "src/components/item-master/ItemTable.tsx",
      "src/components/item-master/PricePanel.tsx",
      "src/server/items/item-master-input.ts",
      "src/server/items/item-price-service.ts",
      "src/server/items/item-service.ts",
      "src/server/items/price-selection.ts",
      "src/server/items/workbook-import-service.ts",
      "src/server/items/workbook-plan.ts",
    ]);
  });

  it("006 AC-31: src/lib and scripts stay at ZERO files naming it", () => {
    const scanned = shippingModules().filter((file) =>
      /^(src\/lib\/|scripts\/)/.test(file),
    );

    // Non-vacuity: both directories gained a module in #5 or #6.
    expect(scanned).toContain("src/lib/excel/workbook-reader.ts");
    expect(scanned).toContain("src/lib/money.ts");
    expect(scanned).toContain("scripts/seed-workbook.ts");

    // This is why `formatPriceExact` takes `value: string`: the formatter is money-shaped
    // without being column-shaped, so the whole of `src/lib/` stays on the safe side of
    // the boundary and can be audited with a grep.
    const offenders = scanned.filter((file) => /unitPrice/.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });

  it("006 AC-31: under src/app and src/components only the three named files may name it", () => {
    const scanned = shippingModules().filter((file) =>
      /^(src\/app\/|src\/components\/)/.test(file),
    );

    expect(scanned).toContain("src/app/page-guards.ts");

    const offenders = scanned
      .filter((file) => /unitPrice/.test(readFileSync(file, "utf8")))
      .sort();

    expect(offenders).toEqual([
      "src/app/item-master/actions.ts",
      "src/components/item-master/ItemTable.tsx",
      "src/components/item-master/PricePanel.tsx",
    ]);
  });

  it("006 AC-31: unitPriceSnapshot is STILL named by no shipping module anywhere", () => {
    // Its first reader is #9. #6 renders a price and never a snapshot, and the fixture
    // that writes one for AC-11 lives under tests/, which this scan does not reach.
    const offenders = shippingModules().filter((file) =>
      /unitPriceSnapshot/.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});

describe("what feature 005 added to the project contract", () => {
  it("005 AC-30: exceljs is a pinned dependency and seed:workbook is a script", () => {
    const manifest = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      scripts?: Record<string, string>;
    };

    // Pinned exactly: an importer that reads a different ExcelJS from the one the 152 rows
    // were counted with is an importer nobody has verified.
    expect(manifest.dependencies?.exceljs).toBe("4.4.0");
    expect(manifest.scripts?.["seed:workbook"]).toBe("tsx scripts/seed-workbook.ts");

    const lockfile = readFileSync("package-lock.json", "utf8");
    expect(lockfile).toContain('"node_modules/exceljs"');
  });
});
