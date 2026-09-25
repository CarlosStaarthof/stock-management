import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The parts of spec 011 that are facts about the repository's own files rather than about
 * its runtime behaviour — the scan halves AC-23 lists among the checks that survive with
 * no Postgres at all: AC-4's, AC-8's, AC-10, AC-16's, AC-19's import-graph half, AC-21's
 * throw scan, AC-22's module half and AC-25's.
 *
 * IT COVERS THE TREES PHASE A BUILDS: `src/server/reporting/` and the `src/lib/` modules it
 * reads its sentences from, plus `src/app/analysis/` — which has held a page since #3, so
 * the scan is not vacuous even before the screen is replaced. The clauses that scan
 * `src/components/analysis/**` arrive with the components, in the same change as the
 * components, because a scan of a tree that does not exist yet asserts nothing. The trees
 * are listed here so those clauses are added rather than invented.
 *
 * TEST FILES ARE EXCLUDED FROM EVERY SCAN, the precedent `tests/unit/project-contract.test.ts`
 * set in #4: a test that names a string is asserting about it, not returning it to a session.
 */

/** Tracked and untracked files under a directory, tests excluded. */
function shippingModulesUnder(...directories: string[]): string[] {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", ...directories],
    { encoding: "utf8" },
  );

  return (listed.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !/\.test\.ts$/.test(file));
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

/**
 * The source with its comments and its string literals removed, so a scan for IDENTIFIERS
 * reads code rather than prose. This feature's module comments discuss the price list at
 * length — on purpose, because AC-8 is an argument about why there is no path to it — and a
 * scan that could not tell a sentence from a symbol would forbid explaining itself.
 */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

/**
 * The arguments of the call (or the parameters of the signature) whose `(` is at `openAt`,
 * split at depth one. Run on `codeOf` output, so no bracket inside a string or a comment
 * can unbalance it; generic arguments in this service's call sites carry no comma.
 */
function topLevelArguments(code: string, openAt: number): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = openAt + 1;

  for (let index = openAt; index < code.length; index += 1) {
    const character = code[index];
    if ("([{".includes(character)) {
      depth += 1;
    } else if (")]}".includes(character)) {
      depth -= 1;
      if (depth === 0) {
        found.push(code.slice(start, index));
        return found.map((argument) => argument.trim()).filter((argument) => argument !== "");
      }
    } else if (character === "," && depth === 1) {
      found.push(code.slice(start, index));
      start = index + 1;
    }
  }

  throw new Error(`unbalanced brackets from offset ${String(openAt)}`);
}

/** The three trees this feature owns. `src/components/analysis` arrives with Phase B. */
const ANALYSIS_TREES = [
  "src/server/reporting",
  "src/app/analysis",
  "src/components/analysis",
] as const;

const SERVICE = "src/server/reporting/analysis-service.ts";

const PURE_MODULES = [
  "src/server/reporting/period-series.ts",
  "src/server/reporting/analysis-input.ts",
  "src/lib/analysis-chart.ts",
  "src/lib/analysis-messages.ts",
] as const;

describe("011 AC-4: this feature writes nothing, anywhere", () => {
  const files = shippingModulesUnder(...ANALYSIS_TREES);

  it("AC-4: the scan sees the service and the page, so it is not vacuous", () => {
    expect(files).toContain(SERVICE);
    expect(files).toContain("src/app/analysis/page.tsx");
  });

  it("AC-4: no create, update, upsert or delete is applied to any model", () => {
    const writers = /\.(createMany|create|updateMany|update|upsert|deleteMany|delete)\s*\(/;

    for (const file of files) {
      expect(codeOf(read(file)), `${file} must not write`).not.toMatch(writers);
    }
  });

  it("AC-4: `db.` appears in exactly one module, and it is the service", () => {
    const touching = files.filter((file) => /\bdb\./.test(codeOf(read(file))));

    expect(touching).toEqual([SERVICE]);
  });

  it("AC-4: and the pure modules reach no database at all", () => {
    for (const file of PURE_MODULES) {
      const code = codeOf(read(file));
      expect(code, `${file} must not import the database`).not.toMatch(/@\/server\/db/);
      expect(code, `${file} must not import Prisma`).not.toMatch(/@prisma\/client/);
    }
  });
});

describe("011 AC-8: there is no path from this feature to the price list", () => {
  const files = shippingModulesUnder(...ANALYSIS_TREES);

  it("AC-8: none of the six names appears anywhere in the three trees", () => {
    // The scan is on the RAW source, comments included: AC-8 asks for no reference at all,
    // and a module comment naming `selectCurrentPrice` would be a reader's first hint that
    // one is reachable. The six are the price list's own vocabulary.
    const forbidden = ["itemPrice", "ItemPrice", "selectCurrentPrice", "priceAmountOf", "effectiveFrom", "todayIso"];

    for (const file of files) {
      for (const name of forbidden) {
        expect(read(file), `${file} must not name ${name}`).not.toContain(name);
      }
    }
  });

  it("AC-8: and no module of this feature imports the price-list module", () => {
    // A static import is a path even when the function it reaches for cannot carry a
    // price, which is why this feature keeps its own `@db.Date` conversion.
    for (const file of files) {
      expect(read(file), `${file} must not import the price list`).not.toContain(
        "@/server/items/price-selection",
      );
    }
  });

  it("AC-8: the price column is named in the three trees only as the snapshot", () => {
    // Added after review finding B2. The six names above are the price LIST's vocabulary,
    // but its column shares a stem with the snapshot's, and the service is on 011 AC-26's
    // permitted list for that stem - so a fallback to the list's column read through the
    // item passed every scan, and `tsc`, while valuing history at today's price. RAW source,
    // comments included, for the same reason as the six: a sentence naming the list's
    // column is a reader's first hint that it is reachable.
    for (const file of files) {
      expect(read(file), `${file} names a price column that is not the snapshot`).not.toMatch(
        /unitPrice(?!Snapshot)/,
      );
    }
  });

  it("AC-8: and no code in the three trees reaches through the item's price relation", () => {
    // The relation from an item to its dated prices is the other half of that path, and
    // neither the six names nor the model list below can see a NESTED select: `db.\w+.`
    // matches top-level delegates only. CODE, not prose - the module comments argue at
    // length about why there is no such path, and `codeOf` strips them.
    for (const file of files) {
      expect(codeOf(read(file)), `${file} reaches the item's price relation`).not.toMatch(
        /\bprices\b/,
      );
    }
  });

  it("AC-8: the service selects the snapshot column, from StockCountLine and nowhere else", () => {
    const code = codeOf(read(SERVICE));

    expect(code).toContain("unitPriceSnapshot");
    expect(code).toContain("db.stockCountLine.findMany");
    // The three models it reads, and no fourth.
    expect(code.match(/db\.\w+\./g)?.sort()).toEqual([
      "db.location.",
      "db.stockCount.",
      "db.stockCountLine.",
    ]);
  });
});

describe("011 AC-10: no JavaScript number touches a figure on this path", () => {
  const files = [...shippingModulesUnder(...ANALYSIS_TREES), "src/lib/analysis-chart.ts"];

  it("AC-10: no Number(, no parseFloat, no toFixed and no Math.round — chart included", () => {
    // NO EXEMPTION IS TAKEN FOR THE CHART. `scaleToInteger` is `bigint` arithmetic and
    // `TREND_VIEWBOX_WIDTH` is 520 = 13 x 40 exactly, so the layout needs no division at
    // all and the usual chart exemption has nothing to buy.
    for (const file of files) {
      const code = codeOf(read(file));

      expect(code, `${file} must not call Number(`).not.toMatch(/\bNumber\s*\(/);
      expect(code, `${file} must not call parseFloat`).not.toMatch(/\bparseFloat\b/);
      expect(code, `${file} must not call toFixed`).not.toMatch(/\btoFixed\b/);
      expect(code, `${file} must not call Math.round`).not.toMatch(/\bMath\.round\b/);
    }
  });

  it("AC-10: the scan actually read the chart and the service", () => {
    expect(files).toContain("src/lib/analysis-chart.ts");
    expect(files).toContain(SERVICE);
  });
});

describe("011 AC-16: the parser that is not parsePeriodKey", () => {
  it("AC-16: parsePeriodKey is called nowhere in this feature", () => {
    // Its 2000-2100 cap guards a WRITE against the `StockCount_periodMonth_range` CHECK,
    // and this feature performs none; the e2e suite reserves 2103-2105.
    for (const file of shippingModulesUnder(...ANALYSIS_TREES)) {
      expect(codeOf(read(file)), `${file} must not call parsePeriodKey`).not.toMatch(
        /\bparsePeriodKey\b/,
      );
    }
  });

  it("AC-16: and the period parser it does use is #7's month key", () => {
    expect(codeOf(read("src/server/reporting/analysis-input.ts"))).toContain("parseMonthKey");
  });
});

describe("011 AC-17, AC-21: what the service may return and what it may throw", () => {
  const code = codeOf(read(SERVICE));

  it("AC-17: there is no staff branch that returns an object", () => {
    // The criterion's mechanical form: for a staff actor the service RAISES before
    // building anything, so there is no value to walk. A staff thunk that returned would
    // be a shape reaching a session Part 6 gives nothing to.
    //
    // ANCHORED ON THE ACTUAL ARGUMENT (review observation O1). The thunk is passed to
    // `analysisForRole` POSITIONALLY, so a scan keyed on the parameter's name never saw it:
    // the name occurs only in the signature. So the position is read from the signature,
    // and the argument in that position is read from the one call inside `getAnalysis`.
    const signatureAt = code.indexOf("(", code.indexOf("function analysisForRole"));
    const parameters = topLevelArguments(code, signatureAt).map((parameter) =>
      parameter.split(":")[0].trim(),
    );
    const staffPosition = parameters.indexOf("forStaff");
    expect(parameters).toEqual(["actor", "forStaff", "forAdmin"]);

    const getAnalysisAt = code.indexOf("export async function getAnalysis(");
    const body = code.slice(getAnalysisAt, code.indexOf("export ", getAnalysisAt + 1));
    expect(body.match(/\banalysisForRole\s*\(/g)).toHaveLength(1);

    const callAt = getAnalysisAt + body.search(/\banalysisForRole\s*\(/);
    const staffThunk = topLevelArguments(code, code.indexOf("(", callAt))[staffPosition];

    // A block body that throws the refusal, and returns nothing at all: no `return`, and
    // no expression body (`() => ({ ... })`) that would return without the word.
    //
    // ANCHORED AT BOTH ENDS (second review, O1). An unanchored `=> {` matched ANY arrow in
    // the argument, so an expression body whose false branch was an IIFE that threw —
    // `(): never => cond ? ({ ... } as never) : (() => { throw ... })()` — passed while
    // returning an object. So the thunk's OWN arrow must open the block, and the argument
    // must END with that block: an expression body, a wrapped IIFE and a call on the end all
    // fail here.
    expect(staffThunk).toMatch(/^\([^)]*\)\s*(:\s*\w+\s*)?=>\s*\{[\s\S]*\}$/);
    // And that block is ONE statement, the refusal, and nothing else. A block with no
    // `return` cannot hand back an object, but it can still FALL THROUGH — `{ if (cond)
    // throw ...; }` hands a staff actor `undefined` instead of a refusal — so the body is
    // pinned rather than merely searched. A second statement in the staff branch fails this
    // loudly, which is the point: there is nothing else for a staff branch to do.
    expect(staffThunk).toMatch(
      /^\(\s*\)\s*(:\s*never\s*)?=>\s*\{\s*throw\s+new\s+ForbiddenError\([^()]*\)\s*;?\s*\}$/,
    );
    expect(staffThunk).toContain("throw new ForbiddenError");
    expect(staffThunk).not.toMatch(/\breturn\b/);
  });

  it("AC-21: it throws only the typed domain errors, never a bare Error", () => {
    const thrown = [...code.matchAll(/throw\s+new\s+(\w+)/g)].map((match) => match[1]);

    expect(thrown).not.toHaveLength(0);
    for (const name of thrown) {
      expect(["NotFoundError", "ValidationError", "ForbiddenError", "UnauthorizedError"]).toContain(
        name,
      );
    }
  });

  it("AC-21: no Prisma or Postgres string can reach a screen through this feature", () => {
    for (const file of shippingModulesUnder(...ANALYSIS_TREES)) {
      const source = read(file);
      for (const leak of ["SQLSTATE", "23514", "23505", "P2002", "P2025"]) {
        expect(source, `${file} must not carry ${leak}`).not.toContain(leak);
      }
    }
  });
});

describe("011 AC-19: no module of this feature is reachable from a staff screen", () => {
  it("AC-19: nothing under the staff trees imports an analysis module", () => {
    // So no future edit to a shared screen can pull one in. The direction matters: this
    // feature IMPORTS `@/server/counts/period`, which AC-13 requires — what it must never
    // do is be imported BY a tree a YARD_STAFF session can reach.
    const staffTrees = shippingModulesUnder(
      "src/app/stock-entry",
      "src/app/stock-takes",
      "src/server/counts",
      "src/components/stock-entry",
      "src/components/stock-takes",
    );

    expect(staffTrees).toContain("src/server/counts/count-service.ts");

    for (const file of staffTrees) {
      const code = codeOf(read(file));
      expect(code, `${file} must not import reporting`).not.toMatch(/@\/server\/reporting/);
      expect(code, `${file} must not import an analysis module`).not.toMatch(/@\/lib\/analysis-/);
      expect(code, `${file} must not import an analysis component`).not.toMatch(
        /@\/components\/analysis/,
      );
    }
  });

  it("AC-19: and there is no staff rendering of this screen to keep money-free", () => {
    for (const file of shippingModulesUnder(...ANALYSIS_TREES)) {
      expect(codeOf(read(file)), `${file} must not name the staff role`).not.toContain(
        "YARD_STAFF",
      );
    }
  });
});

describe("011 AC-22: the strings are single-sourced, and the fence stays green", () => {
  it("AC-22: the two src/lib modules import nothing from src/server", () => {
    for (const file of ["src/lib/analysis-chart.ts", "src/lib/analysis-messages.ts"]) {
      const withoutComments = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");

      // Not even `@/server/errors`, which the fence permits: neither module throws.
      expect(withoutComments, `${file} may not reach into src/server`).not.toMatch(
        /from\s+"(@\/|\.\.?\/)[^"]*server/,
      );
      expect(withoutComments, `${file} must import something, or this is vacuous`).toMatch(
        /from\s+"@\//,
      );
    }
  });

  it("AC-22: this feature ships no client component", () => {
    for (const file of shippingModulesUnder(...ANALYSIS_TREES)) {
      expect(read(file), `${file} must not be a client component`).not.toContain("use client");
    }
  });
});

describe("011 AC-25: what this feature is allowed to touch", () => {
  it("AC-25: the schema, the migrations and the truncate list are untouched", () => {
    const changed = spawnSync(
      "git",
      [
        "status",
        "--porcelain",
        "--",
        "prisma/schema.prisma",
        "prisma/migrations",
        "src/server/test-db.ts",
        "src/middleware.ts",
        "src/lib/auth-config.ts",
        "src/types/stock-count.ts",
        "src/lib/money-boundary.ts",
        "src/lib/count-messages.ts",
        "src/lib/stock-takes-messages.ts",
        "src/lib/held.ts",
        "src/lib/stock-takes-view.ts",
        "src/server/counts",
        "src/server/items",
        "src/server/auth",
        // AC-25's other half, added with Phase B because these are the trees a SCREEN
        // could reach into. `/stock-entry` renders the identical unprotected identity
        // header AC-20 fixes here, and it is a recorded debt against 008 AC-30 rather than
        // a twelve-character edit this feature is allowed to make: a feature does not
        // reach into another screen, even to improve it (#10's ruling, restated).
        "src/app/stock-entry",
        "src/app/stock-takes",
        "src/app/item-master",
        "src/app/api",
        "src/components/stock-entry",
        "src/components/stock-takes",
        "src/components/item-master",
        "Samples",
      ],
      { encoding: "utf8" },
    );

    expect((changed.stdout ?? "").trim()).toBe("");
  });

  it("AC-25: no new model, and no value or total column anywhere in the schema", () => {
    // Invariant 1: value is `quantity x the snapshot`, derived on read, every time.
    const schema = read("prisma/schema.prisma");

    expect(schema).not.toMatch(/^\s*value\s+/m);
    expect(schema).not.toMatch(/^\s*total\w*\s+/m);
    expect(schema).not.toContain("model Analysis");
  });

  it("AC-14: no charting library was added, so the fence has nothing new to hold", () => {
    // The chart is an inline `<svg>` rendered on the server from the same array that fills
    // the table. A library would have put a client bundle, a licence and a second
    // rendering path into a screen that needs none of them - and #10's finding stands: a
    // screen that needs JavaScript is a screen that breaks.
    //
    // ASSERTED AS AN ABSENCE, which is the direction that survives the commit (010's
    // seventh amendment): "this file was never touched" stays true forever, while "this
    // file was changed" passes only during the session that writes it.
    const changed = spawnSync(
      "git",
      ["status", "--porcelain", "--", "package.json", "package-lock.json"],
      { encoding: "utf8" },
    );

    expect((changed.stdout ?? "").trim()).toBe("");

    // Non-vacuity: the dependency list really was read, and the chart's own module really
    // does build the geometry this feature renders.
    const packaged = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const named = [...Object.keys(packaged.dependencies), ...Object.keys(packaged.devDependencies)];
    expect(named).toContain("next");
    for (const candidate of named) {
      expect(candidate, `${candidate} looks like a charting library`).not.toMatch(
        /chart|d3|recharts|victory|plotly|highcharts|echarts/i,
      );
    }
  });
});
