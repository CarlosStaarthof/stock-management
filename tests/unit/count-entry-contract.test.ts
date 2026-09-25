import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { filesTouchedBy } from "../support/feature-scope";

/**
 * The parts of spec 008 that are facts about the repository's own files rather than about
 * its runtime behaviour — the half of AC-18, AC-28, AC-29 and AC-31 that AC-32 lists among
 * the checks surviving with no Postgres at all.
 *
 * IT COVERS THE TREES PHASE A BUILDS: `src/server/counts/`, `src/app/api/counts/` and the
 * `src/lib/` modules they read their sentences from. The clauses of AC-3, AC-16, AC-18 and
 * AC-29 that scan `src/components/stock-entry/**` arrive with the screen, in the same
 * change as the screen, because a scan of a tree that does not exist yet asserts nothing.
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
 * reads code rather than prose. The module comments of this feature discuss prices and
 * totals at length — on purpose, because AC-18 is an argument about why there is no total —
 * and a scan that could not tell a sentence from a symbol would forbid explaining itself.
 */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

function identifiersIn(source: string): string[] {
  return [...codeOf(source).matchAll(/[A-Za-z_$][\w$]*/g)].map((match) => match[0]);
}

const PHASE_A_TREES = ["src/server/counts", "src/app/api/counts"] as const;

const SERVICE = "src/server/counts/count-entry-service.ts";
const ENDPOINT = "src/app/api/counts/[id]/lines/route.ts";
const PARSER = "src/server/counts/quantity-input.ts";

describe("AC-2: both roles may count, and no yard is off limits", () => {
  it("AC-2: the service and the endpoint contain no role refusal and no yard predicate", () => {
    // Part 6 read literally: "create and edit a DRAFT count" sits in both role columns, and
    // there is no yard-scoped user in this product.
    for (const file of [SERVICE, ...shippingModulesUnder("src/app/api/counts")]) {
      // Identifiers, not prose: the module comments explain WHY there is no role refusal
      // here, and a scan that could not tell a symbol from a sentence would forbid that.
      const identifiers = new Set(identifiersIn(read(file)));

      for (const forbidden of [
        "assertRole",
        "requireRole",
        "ForbiddenError",
        "YARD_STAFF",
        "locationCode",
        "locationId",
      ]) {
        expect([...identifiers], `${file} uses ${forbidden}`).not.toContain(forbidden);
      }
    }

    expect(read(SERVICE)).toContain("assertUser(actor)");
  });
});

describe("AC-3: this feature reads no sheet", () => {
  it("AC-3: nothing Phase A adds imports listSheet — 006 AC-24 keeps its one definition", () => {
    // The lines already exist: #7 created one per sheet item, so #8 reads the count and
    // never the sheet.
    for (const file of shippingModulesUnder(...PHASE_A_TREES)) {
      if (file === "src/server/counts/count-service.ts") continue; // #7's caller, unchanged.

      expect(read(file), file).not.toContain("listSheet");
    }
  });
});

describe("AC-7: one quantity parser, and one numeric regular expression for a quantity", () => {
  it("AC-7: only quantity-input.ts declares the decimal pattern", () => {
    const declaring = shippingModulesUnder("src", "scripts").filter((file) =>
      /\\d\{1,4\}/.test(read(file)),
    );

    expect(declaring).toEqual([PARSER]);
    expect(read(PARSER)).toContain("export const QUANTITY_PATTERN");
  });

  it("AC-7: both server transports reach the parser, and neither re-implements it", () => {
    // The endpoint goes through `parseSaveQuantitiesBody`, which calls `parseQuantity`;
    // the service calls it again as the last gate before Postgres.
    expect(read("src/server/counts/count-input.ts")).toContain("parseQuantity");
    expect(read(SERVICE)).toContain("parseQuantity");
    expect(read(ENDPOINT)).toContain("parseSaveQuantitiesBody");
  });
});

describe("AC-9: the branch is written `status !== \"DRAFT\"`", () => {
  it("AC-9: neither the service nor the endpoint names a status past DRAFT", () => {
    for (const file of [SERVICE, ...shippingModulesUnder("src/app/api/counts")]) {
      const source = read(file);

      for (const forbidden of ["SUBMITTED", "APPROVED", "submittedAt", "approvedAt", "signatureSvg"]) {
        expect(source, `${file} names ${forbidden}`).not.toContain(forbidden);
      }
    }

    expect(read(SERVICE)).toContain('status !== "DRAFT"');
  });
});

describe("AC-16, AC-27: one writer, typed errors, and one place they become status codes", () => {
  it("AC-16: the route handler has no Prisma query of its own", () => {
    // `docs/architecture.md`: a route handler never writes a query inline. It calls the
    // same service the no-JavaScript action calls, so the two transports share everything
    // except how they were called.
    const source = read(ENDPOINT);

    expect(source).not.toMatch(/\bdb\./);
    expect(source).toContain("saveQuantities(actor, id, edits)");
    expect(source.match(/await requireUser\(\)/g)).toHaveLength(1);
  });

  it("AC-19: the endpoint reads no identity from a body, a header or a cookie", () => {
    const source = read(ENDPOINT);

    for (const key of ["role", "actorId", "userId", "createdById"]) {
      expect(source, key).not.toContain(`.get("${key}")`);
      expect(source, key).not.toContain(`["${key}"]`);
      expect(source, key).not.toContain(`.${key}`);
    }
    expect(source).not.toContain("headers.get");
    expect(source).not.toContain("cookies");
  });

  it("AC-27: the service throws only the four typed domain errors", () => {
    const thrown = new Set(
      [...read(SERVICE).matchAll(/throw new (\w+)/g)].map((match) => match[1]),
    );

    for (const name of thrown) {
      expect(["ValidationError", "NotFoundError", "ConflictError", "UnauthorizedError"]).toContain(
        name,
      );
    }
    // Never a bare Error: the caller cannot tell one from a bug.
    expect(thrown.has("Error")).toBe(false);
  });

  it("AC-27: src/app/api/error-response.ts is unchanged by this feature", () => {
    // "By this feature": #8's commits, plus the working tree while #8 is `in_progress`
    // (021 Phase 0). A later feature's edit to the file is not #8's.
    expect(filesTouchedBy(8, ["src/app/api/error-response.ts"])).toEqual([]);
  });
});

describe("AC-18: there is no running total, and no arithmetic on a quantity", () => {
  it("AC-18: the service and the endpoint multiply nothing and reduce nothing", () => {
    for (const file of [SERVICE, ...shippingModulesUnder("src/app/api/counts")]) {
      const source = codeOf(read(file));

      expect(source, file).not.toMatch(/quantity\s*\*|\*\s*quantity/);
      expect(source, file).not.toContain(".reduce(");
      expect(read(file), file).not.toContain("@/lib/money");
    }
  });

  it("AC-18: no money-shaped identifier reaches the service or the endpoint", () => {
    // An EXACT set, so a tenth name turns this red. The reason, recorded where a reader
    // will meet it: `unitPriceSnapshot` is null until a count is submitted (Invariant 2),
    // so a draft total could only come from today's prices and would disagree with the
    // count's own total the moment a price changed — which is the workbook defect this
    // product exists to remove.
    //
    // AC-18's four permitted names are below. Only one of them, `itemsWithoutPrice`,
    // actually matches the pattern at all — and it is #7's, on the page, so neither file
    // scanned here carries any money-shaped identifier whatsoever. The screen's half of
    // this scan arrives with the screen.
    const PERMITTED = ["countedLineCount", "itemsWithoutPrice", "lineCount", "uncountedLineCount"];

    const scanned: string[] = [];
    const offenders = new Set<string>();
    for (const file of [SERVICE, ...shippingModulesUnder("src/app/api/counts")]) {
      for (const identifier of identifiersIn(read(file))) {
        scanned.push(identifier);
        if (/price|value|total|amount/i.test(identifier)) offenders.add(identifier);
      }
    }

    // Non-vacuity: the scan really did read these two files' code.
    expect(scanned).toContain("saveQuantities");
    expect(scanned).toContain("countedLineCount");

    for (const offender of offenders) {
      expect(PERMITTED, `${offender} is not a permitted money-shaped name`).toContain(offender);
    }
    expect([...offenders]).toEqual([]);
  });
});

describe("AC-29, AC-31: no rounding, no price, no migration", () => {
  it("AC-29: nothing on the quantity path converts through a JavaScript number", () => {
    for (const file of [PARSER, SERVICE, "src/server/counts/entry-filters.ts"]) {
      const source = read(file);

      expect(source, file).not.toContain("Number(");
      expect(source, file).not.toContain("parseFloat");
      expect(source, file).not.toContain("toFixed");
    }
  });

  it("AC-31 amended by 009 AC-26: nothing but #9's two services names a price column", () => {
    // 008 held this at ZERO for both trees, because the snapshot column had no legitimate
    // writer yet: `unitPriceSnapshot` stays null while a count is a DRAFT (Invariant 2).
    // #9 is its first writer and its first reader, so the two modules it adds are exempt
    // BY NAME - an exact list, never a directory - and #8's own files are unchanged and
    // still name nothing. `src/lib/count-messages.ts` stays at zero as well, which is why
    // `itemsWithoutPriceMessage` counts ITEMS.
    const LIFECYCLE_EXEMPT = [
      "src/server/counts/count-lifecycle-service.ts",
      "src/server/counts/count-summary-service.ts",
    ];

    for (const file of [
      ...shippingModulesUnder(...PHASE_A_TREES),
      "src/lib/count-messages.ts",
    ]) {
      if (LIFECYCLE_EXEMPT.includes(file)) continue;

      expect(read(file), file).not.toContain("unitPrice");
    }

    // #8's three modules, named, so this cannot pass by the scan finding nothing.
    for (const file of [SERVICE, PARSER, ENDPOINT]) {
      expect(read(file), file).not.toContain("unitPrice");
    }
  });

  it("AC-29: prisma/ is byte-identical — this feature adds no migration and no table", () => {
    // #8's own work (021 Phase 0): a later feature's migration is not #8's.
    expect(filesTouchedBy(8, ["prisma"])).toEqual([]);
  });

  it("AC-29: TRUNCATED_TABLES is unchanged, because #8 adds no table", () => {
    // #8's own work (021 Phase 0): a later feature that adds a table extends the list, and
    // that edit is not #8's.
    expect(filesTouchedBy(8, ["src/server/test-db.ts"])).toEqual([]);
  });
});

describe("AC-1, AC-32: the endpoint is outside the matcher, and opens no connection", () => {
  it("AC-1: the middleware gains no /api entry and no new pattern", () => {
    // #8's own work (021 Phase 0); a later feature may protect a new route there.
    expect(filesTouchedBy(8, ["src/lib/auth-config.ts", "src/middleware.ts"])).toEqual([]);
    // A signed-out POST must reach the handler and get a JSON 401, because a 307 to an
    // HTML sign-in form is not something a `fetch` in a save loop can use.
    expect(read("src/middleware.ts")).not.toContain("/api");
  });

  it("AC-32: the endpoint is force-dynamic and opens no connection at import time", () => {
    const source = read(ENDPOINT);

    expect(source).toContain('export const dynamic = "force-dynamic";');

    for (const file of shippingModulesUnder(...PHASE_A_TREES)) {
      const scanned = read(file);

      expect(scanned, file).not.toMatch(/from "@prisma\/client"/);
      expect(scanned, file).not.toContain("new PrismaClient");
      expect(scanned, file).not.toContain("process.env.DATABASE_URL");
    }
  });
});

/* ===================================================================================
 * The screen's half of the same scans (008 AC-3, AC-11, AC-12, AC-13, AC-16, AC-18,
 * AC-22, AC-26, AC-29, AC-31).
 *
 * These arrive WITH the screen, in the same change as the screen, because a scan of a tree
 * that does not exist yet asserts nothing. Everything below reads files and needs no
 * database and no browser (008 AC-32).
 * =================================================================================== */

const SCREEN_TREES = ["src/app/stock-entry", "src/components/stock-entry"] as const;
const SHEET = "src/components/stock-entry/CountSheet.tsx";
const PANEL = "src/components/stock-entry/EntryFilters.tsx";
const ACTIONS = "src/app/stock-entry/actions.ts";
const PAGE = "src/app/stock-entry/counts/[id]/page.tsx";
const QUEUE = "src/lib/entry-queue.ts";

describe("AC-3: every line is on the page, and the screen reads no sheet", () => {
  it("AC-3: nothing on the screen imports listSheet — 006 AC-24 keeps its one definition", () => {
    // #7 created one line per sheet item, so #8 reads the COUNT and never the sheet.
    for (const file of shippingModulesUnder(...SCREEN_TREES)) {
      expect(read(file), file).not.toContain("listSheet");
    }
  });

  it("AC-3: there is no pagination, no show-more and no virtualised container", () => {
    // 82 rows is one page, and any control that silently drops a row is a control that
    // drops an UNCOUNTED row.
    for (const file of shippingModulesUnder(...SCREEN_TREES)) {
      const source = codeOf(read(file));

      expect(source, file).not.toMatch(/pageSize|perPage|paginat|virtuali[sz]|showMore/i);
    }

    // The sheet renders the filtered view of EVERY line it was given, and filtering is a
    // view rather than a fetch.
    expect(read(SHEET)).toContain("filterEntryRows(live, selection)");
  });
});

describe("AC-11, AC-13: the two numbers the criteria quote are named constants", () => {
  it("AC-11: the debounce is 800 ms and is declared once", () => {
    expect(read(SHEET)).toContain("export const AUTOSAVE_DEBOUNCE_MS = 800;");

    // No magic 800 anywhere else on the screen.
    for (const file of shippingModulesUnder(...SCREEN_TREES)) {
      if (file === SHEET) continue;
      expect(codeOf(read(file)), file).not.toMatch(/\b800\b/);
    }
  });

  it("AC-13: the backoff is 1, 2, 4, 8 and 30 seconds, as one named array", () => {
    expect(read(SHEET)).toContain(
      "export const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 30_000] as const;",
    );
  });

  it("AC-11, AC-14: the flush is bound to the three events, and the last one keeps alive", () => {
    // The RAW source for the bindings, because the event names are string literals and
    // `codeOf` blanks those; the stripped source for the negative, so a comment could not
    // satisfy it.
    const source = read(SHEET);

    // `pagehide` and a hidden tab each get one last attempt the BROWSER finishes after this
    // document has stopped running — which is what `keepalive` is for and what a plain
    // `fetch` on unload cannot promise.
    expect(source).toContain('window.addEventListener("pagehide", flushKeepalive)');
    expect(source).toContain('document.addEventListener("visibilitychange", onVisibility)');
    expect(source).toContain("keepalive,");
    expect(source).toContain("void flush(true)");

    // Bound to `online`, and NOT to a poll: no interval anywhere on this screen.
    expect(source).toContain('window.addEventListener("online", flushNow)');
    expect(codeOf(source)).not.toContain("setInterval");
  });

  it("AC-13: the failure path never reloads and never navigates", () => {
    // The whole guarantee: a save that fails keeps the number on the screen. A reload or a
    // navigation would throw away exactly what the queue exists to protect.
    const source = codeOf(read(SHEET));

    expect(source).not.toContain("location.reload");
    expect(source).not.toContain("location.href");
    expect(source).not.toContain("location.assign");
    expect(source).not.toContain("useRouter");
    expect(source).not.toContain("router.refresh");
    expect(source).not.toContain("redirect(");
  });
});

describe("AC-12: no input is ever disabled or read-only while the page is editable", () => {
  it("AC-12: the sheet sets neither `disabled` nor `readOnly` on anything", () => {
    // A counter who cannot type while the phone is talking to Neon is a counter who stops.
    for (const file of [SHEET, PANEL]) {
      const source = codeOf(read(file));

      expect(source, file).not.toMatch(/\bdisabled\b/);
      expect(source, file).not.toMatch(/\breadOnly\b/);
    }
  });
});

describe("AC-16: one writer, two transports, and neither has a query of its own", () => {
  it("AC-16: the action and the route handler both call saveQuantities and neither uses db.", () => {
    for (const file of [ACTIONS, ENDPOINT]) {
      const source = read(file);

      expect(source, file).toContain("saveQuantities(actor,");
      expect(codeOf(source), file).not.toMatch(/\bdb\./);
    }

    // The screen posts to the endpoint; the page posts to the action. No third path.
    expect(read(SHEET)).toContain("saveQuantitiesAction");
    expect(read(SHEET)).toContain("/api/counts/");
  });

  it("AC-16: no component under the screen imports Prisma or opens a connection", () => {
    for (const file of [...shippingModulesUnder(...SCREEN_TREES), QUEUE]) {
      const source = read(file);

      expect(source, file).not.toMatch(/from "@prisma\/client"/);
      expect(source, file).not.toContain("new PrismaClient");
      expect(source, file).not.toContain("process.env.DATABASE_URL");
      expect(source, file).not.toContain("@/server/db");
    }
  });
});

describe("AC-22: the filters rewrite the address and never push a history entry", () => {
  it("AC-22: replaceState, never pushState, and repeated parameters", () => {
    const source = codeOf(read(SHEET));

    // On a phone, *back* means "out of here": a counter who tapped four filters should not
    // have to tap *back* four times to leave.
    expect(source).toContain("window.history.replaceState");
    expect(source).not.toContain("pushState");
    // `append`, not `set`: a value containing a comma is safe because there is no join.
    expect(source).toContain("params.append(category, option)");
    expect(source).not.toContain('.join(",")');
  });

  it("AC-22: the panel is a GET form whose noscript submit is the no-JavaScript path", () => {
    const source = read(PANEL);

    expect(source).toContain('method="get"');
    expect(source).toContain("<noscript>");
    expect(source).toContain("APPLY_FILTERS");
  });
});

describe("AC-18: there is no running total on this screen, for either role", () => {
  /**
   * THE PERMITTED SET, EXACT, over the four trees AC-18 names.
   *
   * Five of these eight are #7's and were already in the scanned trees before this feature
   * started; `value` is a DOM attribute and a facet option's own text, and `defaultValue`
   * is #7's month input. THE SCREEN ADDS NONE OF THEM — which is why the typed text on the
   * counting sheet is held in `typed` and never in `values`, and why there is no `total`
   * anywhere on this surface. AC-18 says a tenth name turns this red; there are eight.
   *
   * The reason, recorded where a reader will meet it: the price snapshot is null until a
   * count is submitted (Invariant 2), so a draft total could only come from today's prices
   * and would disagree with the count's own total the moment a price changed — which is
   * the workbook defect this product exists to remove. #9's submit summary is where the
   * first total comes from.
   */
  const PERMITTED = [
    "countedLineCount",
    "defaultValue",
    "hasPriceWarning",
    "itemsWithoutPrice",
    "itemsWithoutPriceMessage",
    "lineCount",
    // 009 AC-12: the ADMIN half of `/submit` names WHICH items have no price, because a
    // warning that names the items is actionable and a number is not. It is a list of item
    // descriptions and a heading over it — no figure, and no euro (009 AC-21).
    "LINES_WITHOUT_PRICE_HEADING",
    "linesWithoutPrice",
    "uncountedLineCount",
    "value",
  ];

  const SCANNED = [SERVICE, "src/app/api/counts", ...SCREEN_TREES] as const;

  /**
   * THE TWO FILES 009 ADDS TO THESE TREES THAT DO CARRY A EURO, and the only two.
   *
   * AC-18 held all four trees at zero money-shaped names because #8's screen has none:
   * the price snapshot is null until a count is submitted, so a draft total could only
   * come from today's prices. #9 is the feature that submits one, and its ADMIN-only
   * valued summary is where the first total in this product comes from — 009 AC-25 quotes
   * the rendered figures and 009 AC-24 names
   * `src/components/stock-entry/ValuedLines.tsx` BY PATH in a source scan, so that file
   * has to exist, has to be in this tree, and has to be called that.
   *
   * So the assertion is AMENDED to an exact TWO-FILE exemption rather than deleted or
   * loosened into a directory, exactly as 009 AC-26 amended the four scans before it. Both
   * files sit behind `/stock-entry/counts/[id]/summary`, which is a 307 for every
   * YARD_STAFF session at the route (009 AC-1, AC-22) — the money boundary here is a SPLIT
   * OF SURFACES, and these two files are the far side of it.
   *
   * Every other file in the four trees stays at zero, which is the assertion that still
   * matters: #8's counting screen, #9's `/submit` and #9's `/reopen` carry no euro for
   * either role.
   */
  const SUMMARY_SURFACE = [
    "src/app/stock-entry/counts/[id]/summary/page.tsx",
    "src/components/stock-entry/ValuedLines.tsx",
  ];

  /** Every scanned file that is not the ADMIN-only summary. */
  function moneyFreeSurface(): string[] {
    return shippingModulesUnder(...SCANNED).filter((file) => !SUMMARY_SURFACE.includes(file));
  }

  it("009 AC-22: the exempt surface is exactly two files, and both really exist", () => {
    // Non-vacuity, in both directions: the exemption names files that are really in the
    // scanned trees, and each really does what it is exempted for.
    const scanned = shippingModulesUnder(...SCANNED);

    for (const file of SUMMARY_SURFACE) expect(scanned, file).toContain(file);
    expect(SUMMARY_SURFACE).toHaveLength(2);

    expect(read(SUMMARY_SURFACE[0])).toContain("count-total");
    expect(read(SUMMARY_SURFACE[1])).toContain("formatPriceExact");

    // And they are the ONLY files in the four scanned trees carrying a euro, which is the
    // fact 009 AC-22 turns into a browser assertion: of the four count routes, an ADMIN
    // finds the character in exactly one.
    //
    // It belongs HERE rather than beside the per-file loop below, where it could never fail
    // on its own: that loop already refuses a euro in every non-exempt file, so the same
    // claim made after it was a restatement. Here the two anchors above carry it, and they
    // are about RENDERED OUTPUT - `count-total` on the page and `formatPriceExact` in the
    // component - rather than about a doc comment that happens to spell the character.
    const carriers = scanned.filter((file) => read(file).includes("€")).sort();

    for (const file of carriers) expect(SUMMARY_SURFACE, file).toContain(file);
  });

  it("AC-18, 009 AC-12: the permitted money-shaped names are an exact set of ten", () => {
    const scanned: string[] = [];
    const offenders = new Set<string>();

    for (const file of moneyFreeSurface()) {
      for (const identifier of identifiersIn(read(file))) {
        scanned.push(identifier);
        if (/price|value|total|amount/i.test(identifier)) offenders.add(identifier);
      }
    }

    // Non-vacuity: the scan really did read the sheet, the panel and the service.
    expect(scanned).toContain("CountSheet");
    expect(scanned).toContain("EntryFilters");
    expect(scanned).toContain("saveQuantities");

    for (const offender of offenders) {
      expect(PERMITTED, `${offender} is not a permitted money-shaped name`).toContain(offender);
    }

    // EXACT, in both directions: a permitted name that DISAPPEARS is as interesting as one
    // that appears, because it means the thing it was permitted for has gone.
    //
    // Only five of the eight match the pattern at all — `countedLineCount`, `lineCount`
    // and `uncountedLineCount` are permitted by AC-18 by name but carry no money word, so
    // the scan can never see them. They are asserted present separately, below, which is
    // what keeps the list honest rather than padded.
    // Sorted, because the list is kept in the reading order of the thing it describes and
    // a SCREAMING_SNAKE constant does not sort where its lowercase neighbours do.
    const visibleToTheScan = PERMITTED.filter((name) =>
      /price|value|total|amount/i.test(name),
    ).sort();
    // Seven of the ten now, the two additions being #9's list of unpriced ITEMS.
    expect(visibleToTheScan).toHaveLength(7);
    expect([...offenders].sort()).toEqual(visibleToTheScan);

    for (const counted of ["countedLineCount", "lineCount", "uncountedLineCount"]) {
      expect(scanned, counted).toContain(counted);
    }
  });

  it("AC-18: nothing on the screen multiplies, reduces or imports money", () => {
    for (const file of moneyFreeSurface()) {
      const source = codeOf(read(file));

      expect(source, file).not.toMatch(/quantity\s*\*|\*\s*quantity/);
      expect(source, file).not.toContain(".reduce(");
      expect(read(file), file).not.toContain("@/lib/money");
    }
  });

  it("AC-18: no euro sign is written anywhere on this surface", () => {
    for (const file of [...moneyFreeSurface(), QUEUE]) {
      expect(read(file), file).not.toContain("€");
    }
  });
});

describe("AC-26, AC-31: single-sourced strings, and still no price", () => {
  it("AC-26: entry-queue.ts imports nothing from src/server at all", () => {
    // `src/lib/**` may import `@/server/errors` and nothing else (006 AC-33); this module
    // has no refusal to make, so it imports none of it.
    const imports = [...read(QUEUE).matchAll(/from "([^"]+)"/g)].map((match) => match[1]);

    for (const specifier of imports) {
      expect(specifier, `entry-queue.ts imports ${specifier}`).not.toMatch(/(^|\/)server(\/|$)/);
    }
  });

  it("AC-26: the screen spells no literal of its own", () => {
    // A message that exists twice is a message that will one day exist in two spellings.
    for (const file of [SHEET, PANEL, PAGE]) {
      const source = read(file);

      for (const literal of [
        "Not counted",
        "None held",
        "All changes saved",
        "Not saved",
        "Retry now",
        "Save now",
        "Apply filters",
        "Clear filters",
        "No items match these filters.",
        "This count has no items.",
      ]) {
        expect(source, `${file} spells ${literal} itself`).not.toContain(`"${literal}"`);
        expect(source, `${file} spells ${literal} itself`).not.toContain(`>${literal}<`);
      }

      expect(source, file).toContain('from "@/lib/count-messages"');
    }
  });

  it("AC-31: nothing the screen adds names a price column", () => {
    for (const file of [...shippingModulesUnder(...SCREEN_TREES), QUEUE]) {
      expect(read(file), file).not.toContain("unitPrice");
    }
  });
});
