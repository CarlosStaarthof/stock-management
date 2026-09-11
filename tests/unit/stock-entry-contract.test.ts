import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The parts of spec 007 that are facts about the repository's own files rather than about
 * its runtime behaviour. They need no database and no browser, which is why AC-29 lists
 * them among the checks that survive with no Postgres at all.
 *
 * TEST FILES ARE EXCLUDED FROM EVERY SCAN, and that is the precedent
 * `tests/unit/project-contract.test.ts` set in #4 and kept through #5 and #6: "a test that
 * names the string is asserting about it, not returning it to a session". AC-25 requires
 * both that no shipping module under `src/server/counts/` names `submittedAt`, AND that
 * every count this feature writes reads back with `submittedAt === null` — and the second
 * assertion has to name the column somewhere. It names it in
 * `src/server/counts/count-service.db.test.ts`, and the last test in this file makes that
 * exclusion explicit and auditable rather than silent: the ONLY files in those trees that
 * name the forbidden strings are tests.
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

/** Every file under those directories, tests INCLUDED. */
function everyFileUnder(...directories: string[]): string[] {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", ...directories],
    { encoding: "utf8" },
  );

  return (listed.stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((file) => /\.(ts|tsx)$/.test(file));
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

const FEATURE_TREES = ["src/app/stock-entry", "src/server/counts"] as const;

describe("AC-3: the refusal is the server's answer and stays one", () => {
  it("AC-3: no loading.tsx exists at or above src/app/stock-entry/", () => {
    // A loading.tsx puts a Suspense boundary above every page below it; once the shell has
    // flushed, a `redirect()` thrown later by a Server Component can no longer be a 307 -
    // Next has to finish the 200 and redirect from the browser instead. #3 and #6 both
    // recorded it, and this feature's refusals must stay the server's answer. The
    // implementer reproduced the degradation before closing and recorded both status codes
    // in progress/impl_entry_start.md.
    for (const directory of [
      "src/app",
      "src/app/stock-entry",
      "src/app/stock-entry/new",
      "src/app/stock-entry/counts",
    ]) {
      expect(existsSync(`${directory}/loading.tsx`), `${directory}/loading.tsx`).toBe(false);
      expect(existsSync(`${directory}/loading.ts`), `${directory}/loading.ts`).toBe(false);
    }
  });

  it("AC-3: the PUBLIC segment's loading.tsx is unchanged and still there", () => {
    // It sits in a route group precisely so that it covers `/` and nothing protected.
    expect(existsSync("src/app/(public)/loading.tsx")).toBe(true);
    expect(read("src/app/(public)/loading.tsx")).toContain('data-testid="loading"');

    const changed = spawnSync("git", ["status", "--porcelain", "--", "src/app/(public)/loading.tsx"], {
      encoding: "utf8",
    });
    expect((changed.stdout ?? "").trim()).toBe("");
  });
});

describe("AC-1: the section needs no new route protection", () => {
  it("AC-1: auth-config.ts and middleware.ts are byte-identical to their shipped state", () => {
    const changed = spawnSync(
      "git",
      ["status", "--porcelain", "--", "src/lib/auth-config.ts", "src/middleware.ts"],
      { encoding: "utf8" },
    );

    expect((changed.stdout ?? "").trim()).toBe("");
  });

  it("AC-1: /stock-entry is already protected, and every sub-path with it", () => {
    const config = read("src/lib/auth-config.ts");
    const middleware = read("src/middleware.ts");

    expect(config).toContain('"/stock-entry"');
    expect(middleware).toContain('"/stock-entry/:path*"');
    // `isProtected` matches the path itself and everything under it, so /stock-entry/new,
    // /stock-entry/new/confirm and /stock-entry/counts/<id> need no new entry.
    expect(middleware).toContain("pathname.startsWith(`${path}/`)");
    // AC-1 again: the edge still IMPORTS nothing from Prisma, so
    // tests/unit/hashing-boundary.test.ts stays green unchanged. The scan is on the import
    // form rather than the string, because the file's own comment explains that it does
    // not import it - and a comment is not an import.
    expect(middleware).not.toMatch(/from "@prisma\/client"/);
    expect(middleware).not.toMatch(/import\(["'`]@prisma\/client/);
  });
});

describe("AC-4, AC-5: the actor is the session and there is no second identity", () => {
  const actions = read("src/app/stock-entry/actions.ts");

  it("AC-4: startCountAction obtains its actor with exactly one requireUser() call", () => {
    // Call sites, not mentions: the file's own comment says there is exactly one, and a
    // scan that counted the comment would be asserting about prose.
    expect(actions.match(/await requireUser\(\)/g)).toHaveLength(1);
    expect(actions).toContain("const actor = await requireUser();");
    // No wrapper that could grow a second path.
    expect(actions).not.toMatch(/getCurrentUser|requireRole|requireAdminPage/);
  });

  it("AC-4: nothing in the action reads an identity out of a FormData", () => {
    for (const key of ["role", "actor", "actorId", "userId", "createdBy", "createdById"]) {
      expect(actions, key).not.toContain(`formData.get("${key}")`);
      expect(actions, key).not.toContain(`stringField(formData, "${key}")`);
      expect(actions, key).not.toContain(`.get("${key}")`);
    }

    // The three fields it does read, and there are no others.
    const read = [...actions.matchAll(/stringField\(formData, "(\w+)"\)/g)].map(
      (match) => match[1],
    );
    expect(read.sort()).toEqual(["countDate", "locationCode", "period"]);
  });

  it("AC-5: no file in the feature refers to the artefact #9 owns", () => {
    for (const file of shippingModulesUnder(...FEATURE_TREES)) {
      expect(read(file), file).not.toMatch(/signature/i);
    }
  });

  it("AC-5: /stock-entry/new renders no input, select or textarea that names a person", () => {
    const page = read("src/app/stock-entry/new/page.tsx");
    const names = [...page.matchAll(/\bname="([^"]+)"/g)].map((match) => match[1]);

    expect(names.sort()).toEqual(["countDate", "locationCode"]);
    for (const name of names) {
      expect(name, name).not.toMatch(/count(ed)?By|createdBy|name|user/i);
    }
  });
});

describe("AC-9: there is no business-day rule, and no wording that implies one", () => {
  it("AC-9: no file under src/ contains any of the five terms", () => {
    const scanned = shippingModulesUnder("src");
    expect(scanned).toContain("src/server/counts/period.ts");

    for (const file of scanned) {
      expect(read(file), file).not.toMatch(
        /business day|businessDay|isWeekend|workingDay|holiday/i,
      );
    }
  });

  it("AC-9: the only weekday names in the feature are the calendar's seven headings", () => {
    const headings = read("src/lib/count-messages.ts");
    expect(headings).toContain('["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]');

    // No weekday is attached to a date anywhere: the day formatter is `1 September 2026`.
    for (const file of shippingModulesUnder(...FEATURE_TREES, "src/components/stock-entry")) {
      expect(read(file), file).not.toMatch(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/);
    }
  });
});

describe("AC-15: nothing in this feature reads or writes a price", () => {
  it("AC-15: no shipping module in the feature names the price column", () => {
    const scanned = shippingModulesUnder(
      ...FEATURE_TREES,
      "src/components/stock-entry",
      "src/lib/count-messages.ts",
      "src/lib/calendar-month.ts",
      "src/lib/yard-time.ts",
    );

    expect(scanned).toContain("src/server/counts/count-service.ts");
    expect(scanned).toContain("src/lib/count-messages.ts");

    for (const file of scanned) {
      expect(read(file), file).not.toContain("unitPrice");
    }
  });

  it("AC-15: nothing in the feature multiplies a quantity by anything", () => {
    for (const file of shippingModulesUnder(...FEATURE_TREES, "src/components/stock-entry")) {
      expect(read(file), file).not.toMatch(/quantity\s*\*|\*\s*quantity/);
    }
  });
});

describe("AC-25: this feature inserts and reads, and does nothing else", () => {
  const shipping = shippingModulesUnder(...FEATURE_TREES);

  it("AC-25: no shipping module names a status or a column past DRAFT", () => {
    expect(shipping).toContain("src/server/counts/count-service.ts");

    for (const file of shipping) {
      const source = read(file);
      for (const forbidden of [
        "SUBMITTED",
        "APPROVED",
        "submittedAt",
        "approvedAt",
        "signatureSvg",
      ]) {
        expect(source, `${file} names ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("AC-25: the CountStatus union lives outside both scanned trees, as AC-25 fixes", () => {
    // The layout the amendment settles: the union at src/types/stock-count.ts following
    // src/types/item-master.ts, the labels as a Record in src/lib/count-messages.ts, and
    // every branch written `status !== "DRAFT"`.
    expect(read("src/types/stock-count.ts")).toContain(
      'export type CountStatus = "DRAFT" | "SUBMITTED" | "APPROVED";',
    );
    expect(read("src/lib/count-messages.ts")).toContain(
      "export const COUNT_STATUS_LABEL: Record<CountStatus, string>",
    );
    expect(read("src/app/stock-entry/new/confirm/page.tsx")).toContain('status === "DRAFT"');
  });

  it("AC-25: no update, upsert or delete of a count or a line anywhere in the feature", () => {
    for (const file of shipping) {
      expect(read(file), file).not.toMatch(
        /stockCount(Line)?\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/,
      );
    }
  });

  it("AC-25: the only files in those trees naming the forbidden strings are tests", () => {
    // The exclusion above, made explicit. A shipping module that grew one of these would
    // appear here as well as in the first test of this block.
    const offenders = everyFileUnder(...FEATURE_TREES).filter((file) =>
      /SUBMITTED|APPROVED|submittedAt|approvedAt|signatureSvg|unitPrice/.test(read(file)),
    );

    expect(offenders).toEqual([
      "src/server/counts/count-service.db.test.ts",
      "src/server/counts/count-shape.test.ts",
    ]);
  });
});

describe("AC-26, AC-29: the layering and the no-database path", () => {
  it("AC-26: count-messages.ts and calendar-month.ts import nothing from src/server but errors", () => {
    for (const file of ["src/lib/count-messages.ts", "src/lib/calendar-month.ts", "src/lib/yard-time.ts"]) {
      const imports = [...read(file).matchAll(/from "([^"]+)"/g)].map((match) => match[1]);

      for (const specifier of imports) {
        if (/(^|\/)server(\/|$)/.test(specifier)) {
          expect(specifier, `${file} imports ${specifier}`).toBe("@/server/errors");
        }
      }
    }
  });

  it("AC-29: every page under /stock-entry declares force-dynamic", () => {
    const pages = shippingModulesUnder("src/app/stock-entry").filter((file) =>
      file.endsWith("page.tsx"),
    );

    expect(pages).toHaveLength(4);
    for (const page of pages) {
      expect(read(page), page).toContain('export const dynamic = "force-dynamic";');
    }
  });

  it("AC-29: no module this feature adds opens a connection at import time", () => {
    // `src/server/db.ts` is the only module that may touch @prisma/client, and it defers
    // construction behind a Proxy. Nothing here constructs a client or reads a URL.
    for (const file of shippingModulesUnder(...FEATURE_TREES, "src/components/stock-entry")) {
      const source = read(file);
      expect(source, file).not.toMatch(/from "@prisma\/client"/);
      expect(source, file).not.toMatch(/import\(["'`]@prisma\/client/);
      expect(source, file).not.toContain("new PrismaClient");
      expect(source, file).not.toContain("process.env.DATABASE_URL");
    }
  });
});

describe("AC-30: the e2e suite keeps 006 AC-35's shape", () => {
  const config = read("playwright.config.ts");

  it("AC-30: retries stay at 0, the suite serves a build, and no timeout was raised", () => {
    expect(config).toContain("retries: 0");
    expect(config).toContain('command: "npm run start"');
    expect(config).not.toContain("next dev");
    // The three numbers 006 AC-35 brought down when it moved to a served build.
    expect(config).toContain("timeout: 45_000");
    expect(config).toContain("expect: { timeout: 10_000 }");
    expect(config).toContain("workers: 3");
    expect(config).toContain("fullyParallel: false");
  });

  it("AC-30: the stock-entry specs run after the specs that edit the yard sheets", () => {
    // A count pre-populates from the live sheet, so it must not run while another spec is
    // adding items to one. The separation is the config's, not a fixture's.
    expect(config).toContain('dependencies: ["chromium"]');
    expect(config).toMatch(/testIgnore: \/stock-entry-\.\*\\.spec\\.ts\//);
    expect(config).toMatch(/testMatch: \/stock-entry-\.\*\\.spec\\.ts\//);
  });

  it("AC-30: every stock-entry spec owns one reserved year and deletes only that year", () => {
    const support = read("tests/e2e/support/stock-entry.ts");

    expect(support).toContain("export const RESERVED_FLOOR = 2090;");
    // Scoped to ONE year. A `gte` here would delete a sibling file's rows mid-run, and the
    // `periodYear: 2999` fixture tests/e2e/support/item-master.ts has seeded since #6.
    expect(support).toContain("where: { periodYear: year }");
    expect(support).not.toMatch(/periodYear:\s*\{\s*gte:/);

    const years = new Set<string>();
    for (const spec of shippingModulesUnder("tests/e2e").filter((file) =>
      /stock-entry-.*\.spec\.ts$/.test(file),
    )) {
      const match = /RESERVED_YEAR\.(\w+)/.exec(read(spec));
      expect(match, spec).not.toBeNull();
      years.add(match?.[1] ?? "");
    }

    // Four spec files, four distinct years: two files can never collide on a yard and a
    // month, which `@@unique([locationId, periodYear, periodMonth])` would otherwise refuse.
    expect(years.size).toBe(4);
  });
});

describe("AC-32: nothing here touches the schema or the workbook", () => {
  it("AC-32: prisma/ is byte-identical — this feature adds no migration", () => {
    const changed = spawnSync("git", ["status", "--porcelain", "--", "prisma"], {
      encoding: "utf8",
    });

    expect((changed.stdout ?? "").trim()).toBe("");
    expect(existsSync("prisma/migrations/migration_lock.toml")).toBe(true);
  });

  it("AC-32: the source workbook is untouched", () => {
    const changed = spawnSync("git", ["status", "--porcelain", "--", "Samples"], {
      encoding: "utf8",
    });

    expect((changed.stdout ?? "").trim()).toBe("");
  });
});
