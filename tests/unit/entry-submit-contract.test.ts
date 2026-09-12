import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CLEAR_SIGNATURE,
  SIGNATURE_NEEDS_JS,
  SIGN_AND_SUBMIT,
} from "@/lib/count-messages";

/**
 * The parts of spec 009 that are facts about the repository's own FILES, for the screens
 * Phase B adds — the halves of AC-8, AC-10, AC-24, AC-26, AC-29 and AC-31 that need no
 * database and no browser, and that therefore survive with no Postgres at all (AC-31).
 *
 * They live in their own file rather than in `tests/unit/stock-entry-contract.test.ts`
 * because that file is #7's and #8's, and 009 AC-33 names exactly which of its assertions
 * change. Everything NEW belongs here, where a reviewer can read it as one change.
 *
 * TEST FILES ARE EXCLUDED FROM EVERY SCAN, the precedent #4 set: a test that names a
 * string is asserting about it, not returning it to a session.
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
    .filter((file) => !/\.test\.tsx?$/.test(file));
}

function read(file: string): string {
  return readFileSync(file, "utf8");
}

/** The source with comments and string literals blanked, so a scan reads code. */
function codeOf(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");
}

const PAD = "src/components/stock-entry/SignaturePad.tsx";
const LINES = "src/components/stock-entry/ValuedLines.tsx";
const RECORD = "src/components/stock-entry/CountRecord.tsx";
const ACTIONS = "src/app/stock-entry/actions.ts";
const SUBMIT_PAGE = "src/app/stock-entry/counts/[id]/submit/page.tsx";
const SUMMARY_PAGE = "src/app/stock-entry/counts/[id]/summary/page.tsx";
const REOPEN_PAGE = "src/app/stock-entry/counts/[id]/reopen/page.tsx";

const SCREEN_TREES = ["src/app/stock-entry", "src/components/stock-entry"] as const;

describe("AC-8: one code path for a finger, a stylus and a mouse", () => {
  it("AC-8: the pad registers the four pointer handlers and NO touch or mouse listener", () => {
    const source = read(PAD);

    // Exactly the handlers the criterion names, and `pointercancel` bound to the SAME
    // function as `pointerup`: a gesture the browser takes away is a stroke that ended.
    expect(source).toContain("onPointerDown={startStroke}");
    expect(source).toContain("onPointerMove={extendStroke}");
    expect(source).toContain("onPointerUp={endStroke}");
    expect(source).toContain("onPointerCancel={endStroke}");

    const handlers = [...source.matchAll(/on(Pointer|Touch|Mouse)(\w+)=/g)].map(
      (match) => `on${match[1]}${match[2]}`,
    );
    expect([...new Set(handlers)].sort()).toEqual([
      "onPointerCancel",
      "onPointerDown",
      "onPointerMove",
      "onPointerUp",
    ]);

    // No second family of events anywhere on the screen, and no hand-rolled listener that
    // a scan of JSX props could not see.
    for (const file of shippingModulesUnder(...SCREEN_TREES)) {
      const code = codeOf(read(file));
      for (const forbidden of ["touchstart", "touchmove", "mousedown", "mousemove"]) {
        expect(code, `${file} binds ${forbidden}`).not.toContain(forbidden);
      }
    }
    expect(codeOf(source)).not.toContain("addEventListener");

    // And no branch on WHAT KIND of pointer it was: one code path, or it is three.
    expect(codeOf(source)).not.toMatch(/pointerType|isMobile|ontouchstart/);
  });

  it("AC-8: a drag draws instead of scrolling, and the cap is the library's constant", () => {
    const source = read(PAD);

    // `touch-action: none`, as a class the browser turns into exactly that.
    expect(source).toContain("touch-none");

    // ONE grammar, ONE reducer, ONE cap - all from `src/lib/signature-path.ts`, which the
    // SERVICE also reads. A browser that accepted what the server refuses would be a
    // person signing twice (009 AC-5, AC-8).
    expect(source).toContain('from "@/lib/signature-path"');
    expect(source).toContain("SIGNATURE_MAX_POINTS");
    expect(source).toContain("reducePoints(");
    expect(source).toContain("strokesToPath(");
    expect(source).toContain("pointInViewBox(");

    // No second pattern, no magic number: the pad may not invent its own grammar.
    expect(codeOf(source)).not.toMatch(/new RegExp|\/\^M/);
    expect(codeOf(source)).not.toMatch(/\b(400|600|300|6000)\b/);
  });

  it("AC-7: the pad and the record block render strokes the same way, from one function", () => {
    // What is drawn is what is stored is what is shown: both call `splitStrokes`, so there
    // is no raster-to-vector step in which the two could differ.
    for (const file of [PAD, RECORD]) {
      expect(read(file), file).toContain("splitStrokes(");
      expect(read(file), file).toContain("SIGNATURE_VIEWBOX");
    }
  });
});

describe("AC-10: it fails honestly with no JavaScript, and nothing else needs any", () => {
  it("AC-10: the pad renders the sentence and no control until it has mounted", () => {
    const source = read(PAD);

    // The gate: until the effect has run there is no submit control in the markup at all,
    // which is the state a bundle-less browser stays in permanently.
    expect(source).toContain("SIGNATURE_NEEDS_JS");
    expect(source).toContain('data-testid="signature-needs-js"');
    expect(source).toContain("if (!ready) {");
    expect(source.indexOf("if (!ready) {")).toBeLessThan(source.indexOf("<form"));
  });

  it("AC-10: every act in this feature is a form post, and none of them is a fetch", () => {
    // #8's endpoint is the only JSON endpoint this product has and #9 adds none: each of
    // these is ONE deliberate act, so a `<form>` posting to a server action is the
    // transport - the one that still works when the bundle does not.
    for (const file of shippingModulesUnder(...SCREEN_TREES)) {
      if (file === "src/components/stock-entry/CountSheet.tsx") continue;

      expect(codeOf(read(file)), file).not.toMatch(/\bfetch\(/);
    }

    for (const file of [
      PAD,
      "src/components/stock-entry/ApproveForm.tsx",
      "src/components/stock-entry/ReopenForm.tsx",
    ]) {
      expect(read(file), file).toContain("<form action={formAction}");
    }
  });
});

describe("AC-24: the value arithmetic never reaches a screen as a number", () => {
  it("AC-24: the three files the criterion names hold no float arithmetic at all", () => {
    for (const file of [
      "src/lib/money.ts",
      "src/server/counts/count-summary-service.ts",
      LINES,
    ]) {
      const code = codeOf(read(file));

      expect(code, file).not.toMatch(/\bNumber\(/);
      expect(code, file).not.toMatch(/\bparseFloat\b/);
      expect(code, file).not.toMatch(/\btoFixed\b/);
      expect(code, file).not.toMatch(/\bMath\.round\b/);
    }

    // The component formats and rounds for DISPLAY and computes nothing: no operator of
    // any kind is applied to a figure in it.
    const rendered = codeOf(read(LINES));
    expect(rendered).not.toMatch(/[-+*/]\s*(row\.|quantity|lineValue|unitAmount)/);
    expect(rendered).not.toMatch(/(row\.\w+|quantity|lineValue|unitAmount)\s*[-+*/]/);
    expect(read(LINES)).toContain("formatPriceExact(roundHalfUp(row.lineValue, 2))");
  });

  it("AC-26: no page and no component names the price snapshot column", () => {
    // 006 AC-31's `src/app` / `src/components` half stays at the three item-master files:
    // the value crosses the last boundary on `unitAmount`, which `summaryRows` maps it on
    // to inside the one service that may say both words.
    for (const file of shippingModulesUnder(...SCREEN_TREES)) {
      expect(read(file), file).not.toContain("unitPriceSnapshot");
    }

    expect(read("src/server/counts/count-summary-service.ts")).toContain(
      "export function summaryRows(",
    );
    expect(read(SUMMARY_PAGE)).toContain("summaryRows(summary)");
    expect(read(LINES)).toContain("row.unitAmount");
  });
});

describe("AC-29, AC-31: single-sourced strings, and no new dependency exception", () => {
  it("AC-29: the three screens spell no literal of their own", () => {
    // A message that exists twice is a message that will one day exist in two spellings.
    for (const file of [SUBMIT_PAGE, SUMMARY_PAGE, REOPEN_PAGE, PAD, LINES, RECORD]) {
      const source = read(file);

      for (const literal of [
        SIGN_AND_SUBMIT,
        CLEAR_SIGNATURE,
        "No price",
        "Approve this count",
        "Reopen this count",
        SIGNATURE_NEEDS_JS,
        "have not been counted",
        "no price recorded",
      ]) {
        expect(source, `${file} spells ${literal}`).not.toContain(`"${literal}"`);
        expect(source, `${file} spells ${literal}`).not.toContain(`>${literal}<`);
      }

      expect(source, file).toContain('from "@/lib/count-messages"');
    }
  });

  it("AC-31: the components import from src/server exactly what #8's exception permits", () => {
    // `docs/architecture.md` gains NO new exception in this feature, and that is why
    // `signature-path.ts` lives in `src/lib/`: it would have been the THIRD
    // `components -> server` module, and the document says in terms that a third means
    // moving all of them. This is the assertion that keeps that promise.
    const PERMITTED = [
      "@/server/counts/entry-filters",
      "@/server/counts/quantity-input",
      "@/server/errors",
    ];

    const imported = new Set<string>();
    for (const file of shippingModulesUnder("src/components/stock-entry")) {
      for (const match of read(file).matchAll(/from "(@\/server[^"]*)"/g)) {
        imported.add(match[1]);
      }
    }

    expect([...imported].sort()).toEqual(PERMITTED);

    // Non-vacuity: the pad and the record block, which need the grammar, take it from
    // `src/lib/` and reach into `src/server/` for nothing at all.
    for (const file of [PAD, RECORD, LINES]) {
      expect(read(file), file).not.toMatch(/from "@\/server/);
    }
  });

  it("AC-22: only the ADMIN-only summary reads the shape that carries a euro", () => {
    // The stripped source, because `/reopen`'s own comment explains why it reads the
    // money-free shape instead - and a comment is not a call.
    const readers = shippingModulesUnder(...SCREEN_TREES)
      .filter((file) => codeOf(read(file)).includes("getCountSummary"))
      .sort();

    expect(readers).toEqual([SUMMARY_PAGE]);

    // And that page is the one guarded by `requireAdminPage`, together with `/reopen`.
    const guarded = shippingModulesUnder("src/app/stock-entry")
      .filter((file) => read(file).includes("requireAdminPage("))
      .sort();
    expect(guarded).toEqual([REOPEN_PAGE, SUMMARY_PAGE]);

    expect(read(SUMMARY_PAGE)).toContain('requireAdminPage("count-summary")');
    expect(read(REOPEN_PAGE)).toContain('requireAdminPage("count-reopen")');
  });

  it("AC-2: the three new actions read a count id, a drawing and a reason, and no identity", () => {
    const source = read(ACTIONS);

    const fields = [...source.matchAll(/formData\.get\("(\w+)"\)/g)].map((match) => match[1]);
    expect([...new Set(fields)].sort()).toEqual(["countId", "reason", "signature"]);

    for (const identity of [
      "role",
      "actorId",
      "userId",
      "createdById",
      "signedById",
      "approvedById",
    ]) {
      expect(source, identity).not.toContain(`"${identity}"`);
    }

    // One service call each, and no Prisma query anywhere in the file.
    expect(codeOf(source)).not.toMatch(/\bdb\./);
    for (const call of ["submitCount(actor,", "approveCount(actor,", "reopenCount(actor,"]) {
      expect(source, call).toContain(call);
    }
  });
});
