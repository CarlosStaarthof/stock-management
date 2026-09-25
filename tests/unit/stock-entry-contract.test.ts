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

/**
 * THE TWO MODULES FEATURE #9 ADDED TO THESE TREES, and the only two in them permitted to
 * name a status past `DRAFT`, a lifecycle column or the price snapshot (009 AC-26).
 *
 * 007 AC-25 asserted that NO shipping module in these trees named any of them, because #7
 * only ever creates a `DRAFT`. #9 is the feature that moves a count out of one, so the
 * assertion is AMENDED to an exact two-file exemption rather than deleted or loosened into
 * a directory. Each addition earns its place:
 *
 *   * `count-lifecycle-service.ts` performs every transition and is the only writer of
 *     `unitPriceSnapshot` (Invariant 2), the signature and the approval columns;
 *   * `count-summary-service.ts` reads the snapshot to value a line on the one ADMIN-only
 *     surface that carries a euro.
 *
 * Every other module in both trees — and every page #9 adds in its second phase — branches
 * through `src/lib/count-lifecycle.ts` and labels through `COUNT_STATUS_LABEL`, so the
 * `src/app/stock-entry/**` half of this scan stays at ZERO offenders.
 */
const LIFECYCLE_EXEMPT: string[] = [
  "src/server/counts/count-lifecycle-service.ts",
  "src/server/counts/count-summary-service.ts",
];

describe("AC-3: the refusal is the server's answer and stays one", () => {
  it("AC-3, 010 AC-2: no loading.tsx sits on the path to any protected page, derived from the tree", () => {
    // A loading.tsx puts a Suspense boundary above every page below it; once the shell has
    // flushed, a `redirect()` thrown later by a Server Component can no longer be a 307 -
    // Next has to finish the 200 and redirect from the browser instead. #3 and #6 both
    // recorded it, and this feature's refusals must stay the server's answer. The
    // implementer reproduced the degradation before closing and recorded both status codes
    // in progress/impl_entry_start.md, and #10's implementer reproduced it again for
    // `/stock-takes/counts/<id>` in progress/impl_stock_takes_history.md.
    //
    // 010 AC-2 REPLACES THE HAND-LISTED FIVE DIRECTORIES WITH THIS DERIVATION, and the
    // argument is #9's post-approval ruling: the list was hand-maintained, was found stale
    // once, and NOTHING CATCHES AN ASSERTION THAT IS MISSING. Every directory on the path
    // from `src/app` to any `page.tsx` outside `src/app/(public)/` is computed here, so a
    // route added in a later feature is covered by the session that adds it rather than
    // three phases later.
    const guarded = new Set<string>();
    for (const page of shippingModulesUnder("src/app").filter((file) =>
      file.endsWith("page.tsx"),
    )) {
      // The public segment is the one place a loading.tsx is CORRECT: it sits in a route
      // group precisely so that it covers `/` and nothing protected.
      if (page.startsWith("src/app/(public)/")) continue;

      const segments = page.split("/").slice(0, -1);
      for (let depth = 2; depth <= segments.length; depth += 1) {
        guarded.add(segments.slice(0, depth).join("/"));
      }
    }

    // The derivation is meaningful only if it really walked the tree: 010 AC-2 puts the
    // floor at 10 and the expectation at 14, and today it yields 23.
    expect(guarded.size).toBeGreaterThanOrEqual(10);
    expect(guarded.size).toBeGreaterThanOrEqual(14);

    // Every one of the five it replaces, and the two routes #10 adds. `[id]` is a PARENT:
    // 009 puts `/submit`, `/summary` and `/reopen` under it and two of those answer a
    // YARD_STAFF session with a 307 (009 AC-1), which a loading.tsx here would degrade
    // into 200s carrying a shell.
    for (const directory of [
      "src/app",
      "src/app/stock-entry",
      "src/app/stock-entry/new",
      "src/app/stock-entry/counts",
      "src/app/stock-entry/counts/[id]",
      "src/app/stock-takes",
      "src/app/stock-takes/counts/[id]",
    ]) {
      expect(guarded, `${directory} is not on the derived path`).toContain(directory);
    }

    for (const directory of guarded) {
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

  /**
   * NARROWED BY 008 AC-19 — per action rather than per file, and strictly stronger.
   *
   * #7 shipped one action in this file and counted `await requireUser()` over the whole
   * file, which was the same thing. #8 adds the second and last one, `saveQuantitiesAction`
   * (008 AC-16's no-JavaScript transport), and 008 AC-19 requires "one `requireUser()` call
   * each" — so the count moves from the file to each action's own body, and the number of
   * actions in the file is itself asserted. A third action, or a second call inside either
   * of these two, turns this red; under the old spelling a third action with no call at all
   * would have kept it green.
   *
   * It is the same narrowing 008 AC-28 made to the mutation scan below: name what is
   * allowed, exactly, rather than widen the scan to a directory.
   */
  /**
   * GROWN FROM TWO TO FIVE BY 009 AC-2, which asks for the count in those words: "a source
   * scan of `src/app/stock-entry/actions.ts` finds exactly FIVE `await requireUser()`
   * calls, one inside each of the five actions". #9's three are the three deliberate acts
   * that close a count, and each is a `<form>` posting to a server action rather than a
   * `fetch`, because each must still work when the bundle does not (009 AC-10).
   *
   * The number is an equality and not a floor: a sixth action, or a second call inside any
   * of these five, turns this red.
   */
  const EXPORTED_ACTIONS = [
    "startCountAction",
    "saveQuantitiesAction",
    "submitCountAction",
    "approveCountAction",
    "reopenCountAction",
  ];

  /** One exported action's source, from its signature to the end of the file or the next. */
  function bodyOf(name: string): string {
    const starts = EXPORTED_ACTIONS.map((action) => ({
      action,
      at: actions.indexOf(`export async function ${action}(`),
    }))
      .filter((found) => found.at !== -1)
      .sort((left, right) => left.at - right.at);

    const index = starts.findIndex((found) => found.action === name);
    expect(index, `${name} is not exported from actions.ts`).toBeGreaterThanOrEqual(0);

    const from = starts[index].at;
    const to = index + 1 < starts.length ? starts[index + 1].at : actions.length;
    return actions.slice(from, to);
  }

  it("AC-4, 008 AC-19, 009 AC-2: each action obtains its actor with exactly one requireUser() call", () => {
    // Exactly five actions in the file, and they are these five.
    const exported = [...actions.matchAll(/export async function (\w+)\(/g)].map(
      (match) => match[1],
    );
    expect(exported.sort()).toEqual([...EXPORTED_ACTIONS].sort());

    for (const action of EXPORTED_ACTIONS) {
      // Call sites, not mentions: the file's own comment says there is exactly one per
      // action, and a scan that counted the comment would be asserting about prose.
      expect(bodyOf(action).match(/await requireUser\(\)/g), action).toHaveLength(1);
      expect(bodyOf(action), action).toContain("const actor = await requireUser();");
    }

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

  it("AC-5 amended by 009: the signature is #9's, and only #9's modules refer to it", () => {
    // 007 AC-5 held this at zero for the whole tree: #7 must not invent a second identity,
    // and a typed "signed by" field is exactly that. #9 ships the drawn signature, so the
    // assertion becomes an EXACT LIST of the modules that own it rather than disappearing.
    // Who you are is still the session (007 AC-5); the signature is the second, deliberate
    // artefact, and there is still no third.
    // Phase A put the two modules that OWN the grammar and the column on this list; Phase
    // B adds the two that own the transport and the screen, and no others:
    //
    //   * `actions.ts` reads the `signature` field a form posts — 009 AC-6 names that field
    //     and asserts that a submission with it ABSENT is refused identically;
    //   * `submit/page.tsx` renders the pad, which is `SignaturePad.tsx`, and an import
    //     names what it imports.
    //
    // `form-state.ts`, `counts/[id]/page.tsx` and `summary/page.tsx` are NOT on it and do
    // not say the word: the record block is `CountRecord`, which takes the whole lifecycle
    // shape, so a page renders a drawing without naming one. Who you are is still the
    // session (007 AC-5); the drawn signature is the second, deliberate artefact, and there
    // is still no third.
    const SIGNATURE_MODULES = [
      "src/app/stock-entry/actions.ts",
      "src/app/stock-entry/counts/[id]/submit/page.tsx",
      "src/server/counts/count-lifecycle-service.ts",
      "src/server/counts/submit-input.ts",
    ];

    const offenders = shippingModulesUnder(...FEATURE_TREES)
      .filter((file) => /signature/i.test(read(file)))
      .sort();

    expect(offenders).toEqual(SIGNATURE_MODULES);
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

    // AMENDED BY 009 AC-26. #7 reads and writes no price at all and still does not; #9 is
    // the first writer of the snapshot column, so its two services are exempt BY NAME and
    // nothing else in either tree - or in the three `src/lib/` modules scanned alongside
    // them - may say the word.
    for (const file of scanned) {
      if (LIFECYCLE_EXEMPT.includes(file)) continue;

      expect(read(file), file).not.toContain("unitPrice");
    }

    // Non-vacuity: both exempt files really are in the scan, and really do name it.
    for (const file of LIFECYCLE_EXEMPT) {
      expect(scanned, file).toContain(file);
      expect(read(file), file).toContain("unitPriceSnapshot");
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

  it("AC-25 amended by 009 AC-26: only the two lifecycle modules name a status past DRAFT", () => {
    expect(shipping).toContain("src/server/counts/count-service.ts");

    for (const file of shipping) {
      if (LIFECYCLE_EXEMPT.includes(file)) continue;

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

  it("AC-25, 009 AC-26: the src/app/stock-entry half stays at ZERO offenders", () => {
    // The exemption is for two SERVICES. No page, no layout and no component branches on a
    // status by naming one: they ask `src/lib/count-lifecycle.ts` and label through
    // `COUNT_STATUS_LABEL`.
    const pages = shippingModulesUnder("src/app/stock-entry", "src/components/stock-entry");
    expect(pages.length).toBeGreaterThan(0);

    for (const file of pages) {
      const source = read(file);
      for (const forbidden of [
        "SUBMITTED",
        "APPROVED",
        "submittedAt",
        "approvedAt",
        "signatureSvg",
        "unitPrice",
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

  /**
   * NARROWED BY 008 AC-28 — not deleted, and not loosened into a directory exemption.
   *
   * #8 is the feature that types the numbers in, so exactly one module in these two trees
   * may now write a line: `saveQuantities`. It is named as a LITERAL in an exact list, so
   * a second exemption turns this test red, which is the whole difference between a
   * permission and a hole. What that one file may write is asserted immediately below, and
   * asserted structurally by `count-entry-service.db.test.ts` (008 AC-8), which compares
   * every other column of every line before and after the write.
   */
  /**
   * GROWN FROM ONE FILE TO TWO by 009 AC-26 — and by exactly one file, named as a literal.
   *
   * #9 is the feature that moves a count out of `DRAFT`, so `count-lifecycle-service.ts`
   * is the second and last module in these trees that may write. What it may write is
   * asserted immediately below as an EXACT SET of Prisma operations, and structurally by
   * `count-lifecycle-service.db.test.ts`, which compares whole rows before and after every
   * transition (009 AC-14, AC-16).
   */
  const MUTATION_EXEMPT: string[] = [
    "src/server/counts/count-entry-service.ts",
    "src/server/counts/count-lifecycle-service.ts",
  ];

  it("AC-25, 008 AC-28, 009 AC-26: no update, upsert or delete except in the two exempt files", () => {
    // Non-vacuity: the exemption names files that really are in the scanned tree, and
    // there are exactly two of them.
    for (const file of MUTATION_EXEMPT) expect(shipping).toContain(file);
    expect(MUTATION_EXEMPT).toHaveLength(2);

    for (const file of shipping) {
      if (MUTATION_EXEMPT.includes(file)) continue;

      expect(read(file), file).not.toMatch(
        /stockCount(Line)?\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/,
      );
    }
  });

  it("008 AC-28: the exempt file writes one column of one model, and nothing else", () => {
    const source = read(MUTATION_EXEMPT[0]);

    // No mutation of a count of ANY kind, and no insert or delete of anything at all: #7
    // created the lines and #8 only ever fills them in.
    expect(source).not.toMatch(
      /stockCount\s*\.\s*(update|updateMany|upsert|create|createMany|delete|deleteMany)\b/,
    );
    expect(source).not.toMatch(
      /stockCountLine\s*\.\s*(upsert|create|createMany|delete|deleteMany)\b/,
    );

    // The only operations it performs on a line, in the order it performs them.
    const operations = [...source.matchAll(/stockCountLine\s*\.\s*(\w+)/g)].map(
      (match) => match[1],
    );
    expect(operations).toEqual(["updateMany", "findMany"]);
    expect(source).toContain("data: { quantity }");
  });

  it("009 AC-26: the second exempt file performs exactly four Prisma operations", () => {
    const source = read(MUTATION_EXEMPT[1]);

    // The exact set, in no particular order of appearance: read the count, compare-and-set
    // the count, read the lines, fill the snapshots. No create, no delete, no upsert, on
    // either model - so this feature inserts nothing and deletes nothing (009 AC-14).
    const operations = new Set(
      [...source.matchAll(/stockCount(Line)?\s*\.\s*(\w+)/g)].map(
        (match) => `stockCount${match[1] ?? ""}.${match[2]}`,
      ),
    );

    expect(operations).toEqual(
      new Set([
        "stockCount.findUnique",
        "stockCount.updateMany",
        "stockCountLine.findMany",
        "stockCountLine.updateMany",
      ]),
    );
  });

  it("AC-25: the only files in those trees naming the forbidden strings are tests", () => {
    // The exclusion above, made explicit. A shipping module that grew one of these would
    // appear here as well as in the first test of this block.
    // Sorted, because `git ls-files --cached --others` lists tracked and untracked files
    // in two runs and the answer must not depend on what has been committed yet.
    const offenders = everyFileUnder(...FEATURE_TREES)
      .filter((file) => /SUBMITTED|APPROVED|submittedAt|approvedAt|signatureSvg|unitPrice/.test(read(file)))
      .sort();

    // AMENDED BY 009 AC-26: the two lifecycle modules join the list, and they are the only
    // shipping modules on it. Everything else naming one of these strings is a test.
    expect(offenders).toEqual([
      "src/server/counts/count-lifecycle-service.db.test.ts",
      "src/server/counts/count-lifecycle-service.ts",
      "src/server/counts/count-service.db.test.ts",
      "src/server/counts/count-shape.test.ts",
      "src/server/counts/count-summary-service.db.test.ts",
      "src/server/counts/count-summary-service.ts",
    ]);

    const shippingOffenders = offenders.filter((file) => !/\.test\.ts$/.test(file));
    expect(shippingOffenders).toEqual(LIFECYCLE_EXEMPT);
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

    // #7 shipped four. 009's Contract adds THREE — `/submit`, `/summary` and `/reopen` —
    // and 009 AC-31 requires every one of them to declare it, so that `npm run build`
    // prerenders none of them against a database. The number moves with the routes rather
    // than being loosened into a `toBeGreaterThan`: the value of this assertion is that it
    // is an equality, so a page added without the declaration turns it red.
    expect(pages).toHaveLength(7);
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

/**
 * EVERY SPEC THAT RESERVES A YEAR, SELECTED BY WHAT IT DOES rather than by what it is
 * called (010 AC-21).
 *
 * The census below used to match the filename prefix `stock-entry-`, and #10 adds two
 * specs called `stock-takes-*` that reserve two years — files the prefix could not see, so
 * a reused year would have gone unnoticed until two of them collided on
 * `@@unique([locationId, periodYear, periodMonth])` in the middle of a parallel run. A
 * spec RESERVES A YEAR by importing `RESERVED_YEAR`, so that is what is selected on.
 */
function specsReservingAYear(): string[] {
  return shippingModulesUnder("tests/e2e")
    .filter((file) => /\.spec\.ts$/.test(file))
    .filter((file) => read(file).includes("RESERVED_YEAR"));
}

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

  it("AC-30, 010 AC-21: the count specs run after the specs that edit the yard sheets", () => {
    // A count pre-populates from the live sheet, so it must not run while another spec is
    // adding items to one. The separation is the config's, not a fixture's.
    //
    // 010 AC-21 WIDENS THE TWO PATTERNS AND NOTHING ELSE. #10's specs seed counts against
    // the yard sheets exactly as #7's, #8's and #9's do, so they belong in the second
    // project for the same reason; leaving them in the first would put a `startCount`-shaped
    // fixture back beside the item-master specs, which is the collision this split exists
    // to avoid. The assertion is strictly stricter than the one it replaces: it names both
    // prefixes, so a spec of either name landing in the wrong project turns it red.
    expect(config).toContain('dependencies: ["chromium"]');
    expect(config).toMatch(/testIgnore: \/\(stock-entry\|stock-takes\|analysis\)-\.\*\\.spec\\.ts\//);
    expect(config).toMatch(/testMatch: \/\(stock-entry\|stock-takes\|analysis\)-\.\*\\.spec\\.ts\//);

    // And every spec that reserves a year really is matched by that pattern - the census
    // below counts fourteen of them, and a file the projects do not cover would run in the
    // wrong phase without anything noticing.
    //
    // 011 AC-24 WIDENS THE TWO PATTERNS AND NOTHING ELSE, for the second time and for the
    // same reason 010 AC-21 gives: #11's two specs SEED COUNTS against the yard sheets, so
    // they belong in the second project exactly as #7's, #8's, #9's and #10's do. Leaving
    // them in the first would put a count-shaped fixture back beside the item-master specs,
    // which is the collision this split exists to avoid.
    for (const spec of specsReservingAYear()) {
      expect(/(stock-entry|stock-takes|analysis)-.*\.spec\.ts$/.test(spec), spec).toBe(true);
    }
  });

  it("AC-30, 011 AC-24: no reserved year is named by two spec files", () => {
    const support = read("tests/e2e/support/stock-entry.ts");

    expect(support).toContain("export const RESERVED_FLOOR = 2090;");
    // Scoped to ONE year. A `gte` here would delete a sibling file's rows mid-run, and the
    // `periodYear: 2999` fixture tests/e2e/support/item-master.ts has seeded since #6.
    expect(support).toContain("where: { periodYear: year }");
    expect(support).not.toMatch(/periodYear:\s*\{\s*gte:/);

    // EVERY `RESERVED_YEAR.<key>` IN EACH FILE, not the first one (011 AC-24). The
    // previous selection was a single `exec`, which could see only one key per file, and
    // `tests/e2e/analysis-figures.spec.ts` owns TWO adjacent years — year on year is
    // `(y - 1, m)`, so no single year can hold that fixture, and there is no free adjacent
    // pair at or below 2100. A census that stopped at the first match would have reported
    // fourteen files and fourteen years and been quietly wrong about the fifteenth.
    const owner = new Map<string, string>();
    const reserving = specsReservingAYear();
    for (const spec of reserving) {
      const keys = [...read(spec).matchAll(/RESERVED_YEAR\.(\w+)/g)].map((match) => match[1]);
      expect(keys, spec).not.toHaveLength(0);

      for (const key of new Set(keys)) {
        // THE INVARIANT IS NO LONGER "ONE YEAR PER FILE" — it is that no year key is named
        // by two different files. Two specs on the same year collide on
        // `@@unique([locationId, periodYear, periodMonth])`, at `retries: 0`, mid-run, in
        // whichever of the three workers lost. A file owning two years cannot collide with
        // itself; a year owned by two files always can.
        expect(owner.get(key) ?? spec, `${key} is named by ${owner.get(key) ?? ""} too`).toBe(
          spec,
        );
        owner.set(key, spec);
      }
    }

    // #7 shipped four, 008 AC-33 added three, 009 AC-32 three more, 010 AC-21 two, and
    // 011 AC-24 adds `analysisAccess`, `analysisPrior` and `analysisFigures` across TWO
    // files. FOURTEEN files, FIFTEEN distinct years — the first time those two numbers
    // differ, and the reason they may. Both are derived from the tree above rather than
    // copied from a spec, and both stay equalities rather than being loosened into a
    // `toBeGreaterThan`: a spec file that quietly reused a sibling's year turns them red.
    expect(reserving).toHaveLength(14);
    expect(owner.size).toBe(15);

    // KEYS ARE NOT YEARS (review observation O10). Everything above counts year KEYS, so
    // two keys holding the same number - `analysisPrior: 2104, analysisFigures: 2104` -
    // would pass it and collide at run time exactly as two files on one key would. So the
    // VALUES are read from the object itself, comments stripped so a year quoted in a note
    // cannot count, and every value must be a distinct year: across the whole object, and
    // across the fifteen keys the spec files actually name.
    const declaration = /export const RESERVED_YEAR = \{([\s\S]*?)\n\}/.exec(support);
    expect(declaration, "RESERVED_YEAR must be an object literal").not.toBeNull();
    const entries = [
      ...(declaration?.[1] ?? "")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ")
        .matchAll(/(\w+):\s*(\d{4})\b/g),
    ].map((match) => [match[1], Number.parseInt(match[2], 10)] as const);
    const yearOf = new Map(entries);

    expect(yearOf.size, "no key declared twice").toBe(entries.length);
    expect(new Set(yearOf.values()).size, "no year held by two keys").toBe(yearOf.size);

    const ownedYears = [...owner.keys()].map((key) => yearOf.get(key));
    expect(ownedYears, "every key a spec names is declared").not.toContain(undefined);
    expect(new Set(ownedYears).size).toBe(15);

    // Non-vacuity: the selection really does reach past the prefix it used to match, and
    // it really does see both of the keys the two-year file names.
    expect(reserving).toContain("tests/e2e/stock-takes-calendar.spec.ts");
    expect(reserving).toContain("tests/e2e/analysis-figures.spec.ts");
    expect(owner.get("analysisPrior")).toBe("tests/e2e/analysis-figures.spec.ts");
    expect(owner.get("analysisFigures")).toBe("tests/e2e/analysis-figures.spec.ts");
    expect(support).toContain("takesCount: 2102");
    expect(support).toContain("analysisAccess: 2103");
    expect(support).toContain("analysisPrior: 2104");
    expect(support).toContain("analysisFigures: 2105");
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
