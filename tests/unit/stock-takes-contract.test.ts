import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { changedLinesBy, filesTouchedBy } from "../support/feature-scope";

/**
 * The parts of spec 010 that are facts about the repository's own files rather than about
 * its runtime behaviour. They need no database and no browser, which is why AC-20 lists
 * them among the checks that survive with no Postgres at all.
 *
 * PHASE A ONLY. This feature ships in two phases and this file covers the first: the pure
 * modules and the two read services. The halves of AC-3, AC-10, AC-13 and AC-18 that scan
 * `src/app/stock-takes/**` and `src/components/stock-takes/**` belong to Phase B and are
 * NOT asserted here — a scan over a directory that does not exist yet passes by being
 * empty, and an assertion that passes for that reason is worse than no assertion. Each one
 * is listed in `progress/impl_stock_takes_history.md` as Phase B's, by criterion.
 *
 * TEST FILES ARE EXCLUDED FROM EVERY SCAN, the precedent `tests/unit/project-contract.test.ts`
 * set in #4: a test that names a string is asserting about it, not returning it to a session.
 */

/** Tracked and untracked files, tests excluded. */
function shippingModules(...paths: string[]): string[] {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", ...paths],
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

const SERVICE = "src/server/counts/count-history-service.ts";
const PARSER = "src/server/counts/stock-takes-input.ts";

/** The three modules AC-13's scan names that Phase A ships. */
const PHASE_A_SCANNED = [SERVICE, "src/lib/stock-takes-view.ts", "src/lib/held.ts"];

describe("AC-3: the actor is explicit, and this feature writes nothing", () => {
  it("AC-3: both service functions take an actor first and begin with assertUser", () => {
    const source = read(SERVICE);

    expect(source).toMatch(
      /export async function getCountHistory\(\s*actor: SessionUser,\s*countId: string,\s*\): Promise<CountHistoryView>/,
    );
    expect(source).toMatch(
      /export async function findNeighbourCounts\(\s*actor: SessionUser,\s*scope: YardScope,\s*cursor: CountCursor,\s*\): Promise<CountNeighbours>/,
    );

    // The actor comes from `requireUserPage()` and from nowhere else: there is no request,
    // no header and no cookie read in this module at all.
    expect(source).toContain("assertUser(actor)");
    expect(source).not.toMatch(/headers\(\)|cookies\(\)|searchParams|process\.env/);
  });

  it("AC-3: the service applies no write operation to any model", () => {
    const source = read(SERVICE);

    for (const operation of [
      "create",
      "createMany",
      "update",
      "updateMany",
      "upsert",
      "delete",
      "deleteMany",
    ]) {
      expect(source, `${SERVICE} applies .${operation}`).not.toMatch(
        new RegExp(`\\.\\s*${operation}\\b`),
      );
    }

    // Non-vacuity: it really does reach Prisma, and only to read.
    const operations = [...source.matchAll(/db\.\w+\s*\.\s*(\w+)/g)].map((match) => match[1]);
    expect(new Set(operations)).toEqual(new Set(["findFirst"]));
  });

  it("AC-7: neither pure module reaches a database, a clock or the environment", () => {
    for (const file of ["src/lib/stock-takes-view.ts", "src/lib/held.ts", PARSER]) {
      const source = read(file);

      expect(source, file).not.toContain("@/server/db");
      expect(source, file).not.toMatch(/\bdb\./);
      expect(source, file).not.toMatch(/new Date\(|Date\.now\(|process\.env/);
    }
  });
});

describe("AC-4: there is no second calendar query", () => {
  it("AC-4: count-service.ts is byte-identical to its shipped state", () => {
    // `listCalendarMonth` is called identically by both pages; the yard scope is a pure
    // filter over its result, so there is no `where` clause that could disagree with #7's.
    // #10's own work (021 Phase 0): #10's commits, plus the working tree while #10 is
    // `in_progress`.
    expect(filesTouchedBy(10, ["src/server/counts/count-service.ts"])).toEqual([]);
  });

  it("AC-4: listCalendarMonth is the only function that returns a CalendarMonth", () => {
    const declaring = shippingModules("src", "scripts").filter((file) =>
      /Promise<CalendarMonth>/.test(read(file)),
    );

    expect(declaring).toEqual(["src/server/counts/count-service.ts"]);

    // And the scope filter takes one and returns one, rather than building one.
    expect(read("src/lib/stock-takes-view.ts")).toContain(
      "export function filterCalendarByYard(month: CalendarMonth, scope: YardScope): CalendarMonth",
    );
    expect(read("src/lib/stock-takes-view.ts")).not.toContain("buildMonthGrid");
  });
});

describe("AC-10: held is decided on the decimal, never on a JavaScript number", () => {
  it("AC-10: no Number(, parseFloat, toFixed or Math.round in held.ts or the service", () => {
    for (const file of ["src/lib/held.ts", SERVICE]) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(code, file).not.toMatch(/Number\s*\(/);
      expect(code, file).not.toMatch(/parseFloat/);
      expect(code, file).not.toMatch(/toFixed/);
      expect(code, file).not.toMatch(/Math\.round/);
    }
  });

  it("006 AC-31: money.ts still names the price column nowhere, so src/lib stays at zero", () => {
    const offenders = shippingModules("src/lib", "scripts").filter((file) =>
      /unitPrice/.test(read(file)),
    );

    expect(offenders).toEqual([]);
    expect(read("src/lib/money.ts")).toContain("export function compareDecimals");
  });
});

describe("AC-13: there is no role branch to scan for", () => {
  it("AC-13: no role name, role field or role-shaped chooser in the modules Phase A ships", () => {
    for (const file of PHASE_A_SCANNED) {
      const source = read(file);

      for (const forbidden of [
        '"ADMIN"',
        "ADMIN",
        "YARD_STAFF",
        "actor.role",
        "user.role",
        "shapeForRole",
        "countForRole",
      ]) {
        expect(source, `${file} names ${forbidden}`).not.toContain(forbidden);
      }
    }

    // Non-vacuity: these files were really read, and they really are this feature's.
    for (const file of PHASE_A_SCANNED) {
      expect(read(file).length).toBeGreaterThan(500);
      expect(shippingModules("src")).toContain(file);
    }
  });

  it("AC-13: the mapper is written field by field, so a later key cannot ride along", () => {
    const source = read(SERVICE);

    // A spread of `getCount`'s result would carry `itemsWithoutPrice` for an administrator
    // and whatever a later feature adds to `CountForStaff` for everybody.
    expect(source).not.toMatch(/\.\.\.count\b/);
    expect(source).not.toMatch(/\.\.\.line\b/);
    expect(source).toContain("countedByName: count.createdByName");
  });
});

describe("AC-12, AC-18: money-free, and single-sourced", () => {
  it("AC-12: no module Phase A ships names a currency symbol or a price column", () => {
    for (const file of [...PHASE_A_SCANNED, PARSER, "src/lib/stock-takes-messages.ts"]) {
      const source = read(file);

      expect(source, file).not.toContain("€");
      expect(source, file).not.toContain("unitPrice");
      expect(source, file).not.toContain("CURRENCY_SYMBOL");
      expect(source, file).not.toContain("formatPriceExact");
    }
  });

  it("AC-18: the three src/lib modules import nothing from src/server but @/server/errors", () => {
    for (const file of [
      "src/lib/stock-takes-messages.ts",
      "src/lib/stock-takes-view.ts",
      "src/lib/held.ts",
    ]) {
      const imports = [...read(file).matchAll(/from "([^"]+)"/g)].map((match) => match[1]);

      expect(imports.length, file).toBeGreaterThan(0);
      for (const specifier of imports) {
        if (/(^|\/)server(\/|$)/.test(specifier)) {
          expect(specifier, `${file} imports ${specifier}`).toBe("@/server/errors");
        }
      }
    }
  });

  it("AC-18: Phase A ships no `use client` module", () => {
    for (const file of [...PHASE_A_SCANNED, PARSER, "src/lib/stock-takes-messages.ts"]) {
      expect(read(file), file).not.toContain("use client");
    }
  });
});

describe("AC-22: nothing this feature does not own has been touched", () => {
  it("AC-22: the schema, the migrations and TRUNCATED_TABLES are unchanged", () => {
    // #10's own work (021 Phase 0). A later feature's migration, table or route is not #10's.
    expect(
      filesTouchedBy(10, [
        "prisma/schema.prisma",
        "prisma/migrations",
        "src/server/test-db.ts",
        "src/lib/auth-config.ts",
        "src/middleware.ts",
        // `src/app/stock-entry` and `src/components/stock-entry` LEAVE THIS LIST IN PHASE
        // B, and are not dropped: AC-4 lets exactly one file in them change, so they move
        // to the stricter assertion at the end of this file, which names that file and
        // requires every other one in both trees to be untouched. An equality on a list of
        // one is a tighter claim than an emptiness check over a directory.
        "src/lib/count-messages.ts",
        "src/server/counts/count-entry-service.ts",
        "src/server/counts/count-lifecycle-service.ts",
        "src/server/counts/count-summary-service.ts",
      ]),
    ).toEqual([]);
  });

  it("AC-22: TRUNCATED_TABLES still holds exactly its eight entries", () => {
    // 020 AC-4 compares the truncate list with `information_schema`, and #10 added no table,
    // so #10 left the list and the schema as it found them. Re-spelled by 021 AC-4 as a
    // claim about #10's own commits (021 Phase 0's helper): a later feature that adds a
    // table legitimately extends the list, and that is not #10's work.
    expect(filesTouchedBy(10, ["prisma", "src/server/test-db.ts"])).toEqual([]);
  });
});

/* ===================================================================== PHASE B ===== */

/**
 * The scan halves Phase A deliberately left alone, now that the tree they read exists.
 *
 * Each one is listed in `progress/impl_stock_takes_history.md` as Phase B's, by criterion:
 * a scan over a directory that does not exist yet passes by being empty, and an assertion
 * that passes for that reason is worse than no assertion.
 */
const PAGE_TREE = "src/app/stock-takes";
const COMPONENT_TREE = "src/components/stock-takes";
const GRID = "src/components/stock-entry/CalendarGrid.tsx";

/** Every shipping module of the two trees this feature adds. */
function featureModules(): string[] {
  return shippingModules(PAGE_TREE, COMPONENT_TREE);
}

describe("AC-3, AC-10: the pages read, and they never touch a decimal as a number", () => {
  it("AC-3: no db. reference and no write operation anywhere outside the service", () => {
    const modules = featureModules();
    expect(modules.length).toBeGreaterThanOrEqual(5);

    for (const file of modules) {
      const source = read(file);

      expect(source, `${file} reaches Prisma`).not.toMatch(/\bdb\./);
      expect(source, `${file} imports the client`).not.toContain("@/server/db");

      for (const operation of [
        "create",
        "createMany",
        "update",
        "updateMany",
        "upsert",
        "delete",
        "deleteMany",
      ]) {
        expect(source, `${file} applies .${operation}`).not.toMatch(
          new RegExp(`\\.\\s*${operation}\\b`),
        );
      }
    }
  });

  it("AC-10: no Number(, parseFloat, toFixed or Math.round under src/app/stock-takes", () => {
    for (const file of featureModules()) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      expect(code, file).not.toMatch(/Number\s*\(/);
      expect(code, file).not.toMatch(/parseFloat/);
      expect(code, file).not.toMatch(/toFixed/);
      expect(code, file).not.toMatch(/Math\.round/);
    }
  });

  it("AC-8: listSheet is called nowhere in this feature", () => {
    // A sheet is what a yard stocks NOW; a count is what a yard held THEN. 008 AC-3 bans
    // the name from every shipping module under `src/server/counts/`; this is the half of
    // that scan covering the tree it does not reach.
    for (const file of [...featureModules(), SERVICE]) {
      expect(read(file), file).not.toContain("listSheet");
    }
  });
});

describe("AC-4: one calendar, rendered at two addresses", () => {
  it("AC-4: /stock-entry/page.tsx is byte-identical, so #7's rendering cannot have moved", () => {
    // Moved by #10, that is (021 Phase 0): a later feature's edit to the header is not #10's.
    expect(filesTouchedBy(10, ["src/app/stock-entry/page.tsx"])).toEqual([]);
  });

  it("AC-4: CalendarGrid gains exactly two optional props, and their defaults are #7's", () => {
    const source = read(GRID);

    expect(source).toContain("badgeHref?: (badge: CountBadge) => string;");
    expect(source).toContain("emptyDayHref?: (date: string) => string | null;");

    // EXACTLY two. A third would be a third way the two calendars could drift.
    const optional = source.match(/^\s+\w+\?:/gm) ?? [];
    expect(optional).toHaveLength(2);

    // The defaults ARE the old body: this is why `/stock-entry/page.tsx` needs no edit.
    expect(source).toContain("badgeHref = (badge) => `/stock-entry/counts/${badge.countId}`");
    expect(source).toContain("emptyDayHref = (date) => `/stock-entry/new?countDate=${date}`");
  });

  it("AC-4: buildMonthGrid is called from exactly one module, and not from this feature", () => {
    const callers = shippingModules("src", "scripts").filter(
      (file) => /buildMonthGrid\s*\(/.test(read(file)) && file !== "src/lib/calendar-month.ts",
    );

    expect(callers).toEqual([GRID]);
    expect(read("src/lib/calendar-month.ts")).toContain("export function buildMonthGrid");

    // And the new tree holds no grid builder and no weekday heading of its own.
    for (const file of featureModules()) {
      const source = read(file);
      expect(source, file).not.toContain("buildMonthGrid");
      expect(source, file).not.toContain("WEEKDAY_HEADINGS");
      for (const heading of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
        expect(source, `${file} spells ${heading}`).not.toContain(`"${heading}"`);
      }
    }
  });

  it("AC-7: the page calls listCalendarMonth exactly once, and passes it no yard", () => {
    // Neither the import nor the doc comment is a call, so both are dropped before
    // counting: the criterion is about how many times the month is FETCHED per render,
    // which is once.
    const source = read(`${PAGE_TREE}/page.tsx`);
    const page = source
      .slice(source.lastIndexOf('from "'))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const calls = page.match(/listCalendarMonth\s*\(/g) ?? [];

    expect(calls).toHaveLength(1);
    expect(page).toContain("await listCalendarMonth(user, monthKey)");
    expect(page).not.toMatch(/listCalendarMonth\([^)]*scope/);
    // The scope is applied afterwards, to the value that call returned.
    expect(page).toContain("filterCalendarByYard(month, scope)");
  });
});

describe("AC-13, AC-15, AC-18: one screen, one link out, and no JavaScript", () => {
  it("AC-13: there is no role branch anywhere in the two trees this feature adds", () => {
    for (const file of featureModules()) {
      const source = read(file);

      for (const forbidden of [
        '"ADMIN"',
        "ADMIN",
        "YARD_STAFF",
        "actor.role",
        "user.role",
        "shapeForRole",
        "countForRole",
      ]) {
        expect(source, `${file} names ${forbidden}`).not.toContain(forbidden);
      }
    }

    // Non-vacuity: the two pages and the three components really were read.
    const modules = featureModules();
    expect(modules).toContain(`${PAGE_TREE}/page.tsx`);
    expect(modules).toContain(`${PAGE_TREE}/counts/[id]/page.tsx`);
    expect(
      modules.filter((file) => file.startsWith(COMPONENT_TREE)).length,
    ).toBeGreaterThanOrEqual(3);
    for (const file of modules) expect(read(file).length).toBeGreaterThan(400);
  });

  it("AC-15: no page this feature adds names /summary or any URL beneath a count", () => {
    for (const file of featureModules()) {
      const source = read(file);

      expect(source, file).not.toContain("/summary");
      expect(source, file).not.toContain("COUNT_SUMMARY_LINK");
    }

    // The one link into #9's tree, and it is the count itself.
    expect(read(`${PAGE_TREE}/counts/[id]/page.tsx`)).toContain(
      "href={`/stock-entry/counts/${encodeURIComponent(count.countId)}`}",
    );
  });

  it("AC-18: this feature ships no `use client` module", () => {
    for (const file of featureModules()) {
      expect(read(file), file).not.toContain("use client");
    }
  });

  it("AC-12: no module in either tree names a currency symbol or a price column", () => {
    for (const file of featureModules()) {
      const source = read(file);

      expect(source, file).not.toContain("€");
      expect(source, file).not.toContain("unitPrice");
      expect(source, file).not.toContain("CURRENCY_SYMBOL");
      expect(source, file).not.toContain("formatPriceExact");
      expect(source, file).not.toContain("itemsWithoutPrice");
    }
  });
});

describe("AC-20: the checks that survive with no database", () => {
  it("AC-20: every page outside the public segment declares force-dynamic, derived", () => {
    const pages = shippingModules("src/app")
      .filter((file) => file.endsWith("page.tsx"))
      .filter((file) => !file.startsWith("src/app/(public)/"));

    // DERIVED FROM THE TREE, not typed out: a page added without the declaration turns
    // this red in the session that adds it, and `npm run build` would otherwise try to
    // prerender it against a database that is not there.
    //
    // THE CRITERION'S ARITHMETIC IS OFF BY ONE AND THE TEST FOLLOWS THE TREE. AC-20 says
    // "true of all 17 today and of the 19 this feature leaves behind": 17 today is right,
    // but this feature adds ONE page file, not two - `/stock-takes/page.tsx` has existed
    // since #3 as a placeholder and is replaced rather than created. 17 + 1 = 18. Recorded
    // in progress/impl_stock_takes_history.md rather than silently rounded.
    expect(pages).toHaveLength(18);
    expect(pages).toContain(`${PAGE_TREE}/page.tsx`);
    expect(pages).toContain(`${PAGE_TREE}/counts/[id]/page.tsx`);

    for (const page of pages) {
      expect(read(page), page).toContain('export const dynamic = "force-dynamic";');
    }

    // The public segment is the one place a page may be prerendered, and it still is.
    expect(read("src/app/(public)/page.tsx")).not.toContain('dynamic = "force-dynamic"');
  });

  it("AC-20: no module this feature adds opens a connection at import time", () => {
    for (const file of featureModules()) {
      const source = read(file);

      expect(source, file).not.toMatch(/from "@prisma\/client"/);
      expect(source, file).not.toContain("new PrismaClient");
      expect(source, file).not.toContain("process.env");
    }
  });
});

/**
 * BOTH ASSERTIONS BELOW MAKE A PRESENCE CLAIM about #10's own work: "exactly one file in #7's
 * trees changed", "playwright.config.ts changed by exactly four lines". They read #10's own
 * commits through the one helper (021 Phase 0), plus the working tree while #10 is
 * `in_progress`.
 *
 * Not the working tree alone: it empties at the commit, and these two went red the moment
 * `b468f60 feat(#10)` was committed, in a feature nobody was working on. And not a range from
 * #10's spec approval to the tip of the branch, which is what replaced it: that range keeps
 * absorbing every later feature's edits to the same paths. It had already taken in #11's
 * rewrite of the two route patterns, and #21's edits to `src/app/stock-entry` and the
 * middleware would have turned the first assertion red for work that is not #10's. See 010's
 * seventh post-approval amendment, 021's Phase 0 amendment and `docs/conventions.md` -> Tests.
 */

describe("AC-22: the one shipped source file this feature edits", () => {
  it("AC-22: CalendarGrid.tsx is the only changed file in #7's trees", () => {
    // AMENDED FROM PHASE A, and forced by AC-4: that assertion required the whole of
    // `src/components/stock-entry` to be byte-identical, which was true until the two
    // optional props landed. The replacement is stricter, not looser - it names the ONE
    // file that may differ and still requires every other file in both trees to be
    // untouched, so a second edit anywhere in them turns it red.
    const files = filesTouchedBy(10, [
      "src/app/stock-entry",
      "src/components/stock-entry",
      "src/lib/count-messages.ts",
      "src/server/counts/count-service.ts",
      "src/server/counts/count-entry-service.ts",
      "src/server/counts/count-lifecycle-service.ts",
      "src/server/counts/count-summary-service.ts",
      "src/lib/auth-config.ts",
      "src/middleware.ts",
    ]);

    expect(files).toEqual([GRID]);
  });

  it("AC-21, AC-22: playwright.config.ts changed by exactly its two route patterns", () => {
    // Each line keeps its `+` or `-`; the pattern below is unanchored, as it was.
    const changedLines = changedLinesBy(10, ["playwright.config.ts"]);

    expect(changedLines).toHaveLength(4);
    for (const line of changedLines) {
      expect(line, line).toMatch(/test(Ignore|Match): \/\(?stock-entry/);
    }

    const config = read("playwright.config.ts");
    expect(config).toContain("retries: 0");
    expect(config).toContain("workers: 3");
    expect(config).toContain("fullyParallel: false");
    expect(config).toContain("timeout: 45_000");
    expect(config).toContain("expect: { timeout: 10_000 }");
    expect(config).toContain('dependencies: ["chromium"]');
    expect(config).toContain('command: "npm run start"');
  });
});
