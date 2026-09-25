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

  it("AC-6 (002) narrowed by 003 AC-1, replaced by 004 AC-1: a generator, a postgresql datasource, and exactly the twelve models and five enums of Part 3 (021 AC-1)", () => {
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
      "enum ProfileStatus {",
      "enum AuthEventKind {",
      "model User {",
      "model AccountLock {",
      "model AuthEvent {",
      "model SetupClaim {",
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
  //   * `unitPriceSnapshot` is named by EXACTLY the two modules #9 added.
  //
  // AMENDED AGAIN by 009 AC-26, and for the reason the whole mechanism exists: #9 is the
  // FIRST WRITER AND THE FIRST READER of `unitPriceSnapshot`, so the list grows from nine
  // files to ELEVEN. The two additions are named as literals, never as a directory:
  //
  //   * `src/server/counts/count-lifecycle-service.ts` writes the column, once, at submit,
  //     from the `ItemPrice` in force on `countDate` (Invariant 2). It cannot be written
  //     by anything that may not name it.
  //   * `src/server/counts/count-summary-service.ts` reads it, values the line on it, and
  //     declares `ValuedLine` - which is why that type is NOT in `src/types/`. The ADMIN
  //     summary is the one surface in this product that carries a euro, and it is a 307
  //     for every staff session (009 AC-22).
  //
  // #9's own screens still name it NOWHERE: the value crosses the boundary on a field the
  // shape declares, so the list below for src/app/ and src/components/ stays at the three
  // item-master files #6 put on it.
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

  /**
   * The two modules 009 AC-26 adds, and the only two files in the tree that may name the
   * price snapshot column or the signature column.
   */
  const LIFECYCLE_MODULES = [
    "src/server/counts/count-lifecycle-service.ts",
    "src/server/counts/count-summary-service.ts",
  ];

  /**
   * AMENDED BY 011 AC-26, as an exact list and never as a directory exemption: Analysis is
   * the feature that joins snapshots ACROSS periods, so it has to read the column it values
   * history from. The alternative is to forbid the only module that can value history from
   * naming the column it values it from. Its screens still name it NOWHERE - every euro
   * crosses the boundary on a field the shape declares (`yardValue`, `totalStock`,
   * `againstTotal`, `varianceAmount`, `amount`) - so the src/app and src/components list
   * below stays at the three item-master files #6 put on it.
   */
  const ANALYSIS_SERVICE = "src/server/reporting/analysis-service.ts";

  const SNAPSHOT_READERS = [...LIFECYCLE_MODULES, ANALYSIS_SERVICE].sort();

  it("011 AC-26, bounded after review B2: the twelfth entry may name the snapshot and nothing else", () => {
    // The list below admits FILES, and the scan it runs is the bare stem - which the price
    // list's own column also answers to. The other eleven entries need that column; the
    // twelfth needs only the snapshot, so its permission is bounded HERE, beside the list
    // that grants it, instead of relying on 011 AC-8's scan to remember. Review mutation M6
    // (a fallback to the list's column through the item's price relation) passed every
    // scan and `tsc` until this assertion existed.
    const named = [...readFileSync(ANALYSIS_SERVICE, "utf8").matchAll(/unitPrice\w*/g)].map(
      (match) => match[0],
    );

    // Non-vacuity: the service really does read the snapshot, several times over.
    expect(named.length).toBeGreaterThan(0);
    expect(new Set(named)).toEqual(new Set(["unitPriceSnapshot"]));
  });

  it("011 AC-26 amending 009 AC-26: exactly twelve modules may name unitPrice", () => {
    const scanned = shippingModules();

    // The scan must have looked at something, or the assertion below is vacuous.
    expect(scanned).toContain("src/server/db.ts");

    const offenders = scanned
      .filter((file) => /unitPrice/.test(readFileSync(file, "utf8")))
      .sort();

    // #6 is the first feature that legitimately RENDERS a price, so the permitted list
    // grew from two to nine; #9 is the first that WRITES the snapshot, so it grew to
    // eleven; #11 is the first that values HISTORY from it, so it grows to twelve - and it
    // stays a list of FILES, never a directory exemption. The two presentation files on it
    // sit behind a route no YARD_STAFF session can reach at all (006 AC-2), and the three
    // service modules are ones no session reaches directly: `/analysis` is a 307 for every
    // staff session before `getAnalysis` is called at all. A THIRTEENTH module naming the
    // column turns this red.
    expect(offenders).toEqual([
      "src/app/item-master/actions.ts",
      "src/components/item-master/ItemTable.tsx",
      "src/components/item-master/PricePanel.tsx",
      "src/server/counts/count-lifecycle-service.ts",
      "src/server/counts/count-summary-service.ts",
      "src/server/items/item-master-input.ts",
      "src/server/items/item-price-service.ts",
      "src/server/items/item-service.ts",
      "src/server/items/price-selection.ts",
      "src/server/items/workbook-import-service.ts",
      "src/server/items/workbook-plan.ts",
      "src/server/reporting/analysis-service.ts",
    ]);
    expect(offenders).toHaveLength(12);
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

  it("011 AC-26 amending 009 AC-26: unitPriceSnapshot is named by exactly those three files", () => {
    // 006 AC-31 held this at ZERO because the column had no legitimate reader yet. #9 is
    // both its first writer and its first reader, so the assertion became an EXACT LIST
    // rather than being deleted; #11 is the second reader - THE PRICE SNAPSHOT IS THE ONLY
    // SOURCE OF A EURO IN THIS PRODUCT, AND ANALYSIS IS THE FEATURE THAT JOINS THEM ACROSS
    // PERIODS - so the list grows to three. A FOURTH module naming the snapshot turns this
    // red, and the addition is a FILE rather than `src/server/reporting/**`.
    const offenders = shippingModules()
      .filter((file) => /unitPriceSnapshot/.test(readFileSync(file, "utf8")))
      .sort();

    expect(offenders).toEqual(SNAPSHOT_READERS);
    expect(offenders).toHaveLength(3);

    // Non-vacuity, kept with the amendment: the scan must have read the tree.
    expect(shippingModules()).toContain("src/server/reporting/analysis-service.ts");
  });

  it("009 AC-26: signatureSvg is named by the lifecycle service and by nothing else", () => {
    // The parallel assertion. The signature crosses every other boundary as
    // `signaturePath` on a shape, so the column itself is named by the one module that
    // writes it - and by no page, no component and no other service.
    const offenders = shippingModules()
      .filter((file) => /signatureSvg/.test(readFileSync(file, "utf8")))
      .sort();

    expect(offenders).toEqual(["src/server/counts/count-lifecycle-service.ts"]);
    for (const file of offenders) {
      expect(LIFECYCLE_MODULES, `${file} may not name the signature column`).toContain(file);
    }
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
