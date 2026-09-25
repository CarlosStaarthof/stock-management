import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TREND_WINDOW } from "@/lib/analysis-chart";
import {
  ANALYSIS_HEADING,
  GO_TO_STOCK_TAKES,
  INCOMPLETE_TOTAL,
  NOT_COUNTED,
  NO_APPROVED_STOCK_TAKES_YET,
  formatFigure,
  formatMonthLabel,
} from "@/lib/analysis-messages";
import { CURRENCY_SYMBOL } from "@/lib/money";
import { todayInYard } from "@/lib/yard-time";
import type { SessionUser } from "@/server/auth/session-user";
import { monthKeyOf } from "@/server/counts/period";
import { periodWindow } from "@/server/reporting/period-series";
import type {
  AnalysisForAdmin,
  AnalysisInput,
  BreakdownRow,
  PeriodFigures,
  Variance,
  YardFigure,
} from "@/types/analysis";

/**
 * Spec 011 AC-6 and AC-16, the PAGE half, rendered by the page itself with no database
 * (post-approval amendment, 2026-09-24; review finding B1).
 *
 * WHY THIS TEST EXISTS. "No approved count anywhere in the database" is a fact about the
 * WHOLE database, and the shared end-to-end database can never be in it: other specs'
 * reserved-year counts always exist, and `analysis-access.spec.ts` approves three of its
 * own before any of its tests run. The browser test that used to "cover" the empty state
 * branched on the database being empty, so its asserting branch could never execute, and a
 * euro planted in the empty branch passed the whole gate. That is the top-level form of the
 * mistake this feature is shaped around.
 *
 * SO THE PAGE IS RENDERED HERE, ON THE SERVER, WITH ITS THREE COLLABORATORS MOCKED. The
 * session guard answers an administrator, the reporting service answers "nothing approved,
 * ever", and the sign-out action is a stub. Everything else is the real module graph: the
 * real page, the real components, the real `next/link`, the real messages, the real clock
 * helper. `react-dom/server` produces the HTML a browser would receive for that branch, and
 * the assertions read that HTML.
 *
 * THE SERVICE MOCK IS NOT A SECOND SERVICE. It returns the shape the real service returns
 * for a period nobody counted — the state `analysis-service.db.test.ts` proves on a
 * truncated database — and it echoes the period it was ASKED for, so the heading this page
 * renders is the period this page chose.
 */

const mocks = vi.hoisted(() => ({
  requireAdminPage: vi.fn(),
  listApprovedPeriods: vi.fn(),
  getAnalysis: vi.fn(),
  signOutAction: vi.fn(),
}));

vi.mock("@/app/page-guards", () => ({ requireAdminPage: mocks.requireAdminPage }));
vi.mock("@/server/reporting/analysis-service", () => ({
  getAnalysis: mocks.getAnalysis,
  listApprovedPeriods: mocks.listApprovedPeriods,
}));
vi.mock("@/app/auth-actions", () => ({ signOutAction: mocks.signOutAction }));

/*
 * THE JSX RUNTIME, AND WHY `React` IS PUT ON `globalThis` BEFORE THE PAGE IS IMPORTED.
 * `tsconfig.json` says `"jsx": "preserve"` because Next compiles JSX itself, with the
 * automatic runtime. Vitest's esbuild cannot preserve JSX for Node to run, so it falls back
 * to the CLASSIC transform, which writes `React.createElement(...)` and expects a `React` in
 * scope — which no module of this app imports, correctly, because Next never needs it. The
 * classic runtime's one requirement is met here, for this file only, rather than by editing
 * `vitest.config.ts` (a shipped file 011 AC-25 does not list) or by adding a `React` import
 * to the page (a source change made for a test's sake). The rendered HTML is the same under
 * either runtime: they build the same elements.
 */
(globalThis as { React?: typeof React }).React = React;
const { default: AnalysisPage } = await import("./page");

const ADMIN: SessionUser = {
  id: "admin-render-test",
  username: "owner",
  name: "Owner",
  role: "ADMIN",
};

const YARDS = [
  { code: "DUBLIN", name: "Dublin" },
  { code: "CLONMEL", name: "Clonmel" },
] as const;

/* ------------------------------------------------------------------ the shapes */

function yardFigure(
  yard: (typeof YARDS)[number],
  approved: { countId: string; yardValue: string } | null,
): YardFigure {
  return {
    locationCode: yard.code,
    locationName: yard.name,
    countStatus: approved === null ? null : "APPROVED",
    countId: approved === null ? null : approved.countId,
    countDate: null,
    yardValue: approved === null ? null : approved.yardValue,
    heldLineCount: 0,
    unvaluedHeldLineCount: 0,
  };
}

function variance(againstPeriodKey: string, state: Variance["state"]): Variance {
  return {
    againstPeriodKey,
    againstPeriodLabel: formatMonthLabel(againstPeriodKey),
    againstTotal: null,
    varianceAmount: null,
    state,
  };
}

/** Field by field, like every shape in this feature — no spread carries a fact in. */
function analysisOf(
  input: AnalysisInput,
  period: PeriodFigures,
  breakdown: BreakdownRow[],
  anyApprovedCountEver: boolean,
): AnalysisForAdmin {
  const window = periodWindow(input.periodKey, TREND_WINDOW);

  return {
    periodKey: period.periodKey,
    periodLabel: period.periodLabel,
    breakdownKey: input.breakdownKey,
    period,
    monthOnMonth: variance(window[TREND_WINDOW - 2], "PERIOD_INCOMPLETE"),
    yearOnYear: variance(window[0], "PERIOD_INCOMPLETE"),
    trend: window.map((key) => ({
      periodKey: key,
      periodLabel: formatMonthLabel(key),
      complete: key === period.periodKey ? period.complete : false,
      totalStock: key === period.periodKey ? period.totalStock : null,
    })),
    breakdown,
    previousApprovedPeriodKey: null,
    nextApprovedPeriodKey: null,
    anyApprovedCountEver,
  };
}

/** What the real service answers for a period nobody counted, on an empty database. */
function nothingApprovedEver(input: AnalysisInput): AnalysisForAdmin {
  const periodLabel = formatMonthLabel(input.periodKey);

  return analysisOf(
    input,
    {
      periodKey: input.periodKey,
      periodLabel,
      complete: false,
      missingYardNames: YARDS.map((yard) => yard.name),
      yards: YARDS.map((yard) => yardFigure(yard, null)),
      totalStock: null,
      unvaluedHeldLineCount: 0,
    },
    [],
    false,
  );
}

/* ------------------------------------------------------------------ the render */

async function renderPage(query: Record<string, string> = {}): Promise<string> {
  const element = await AnalysisPage({ searchParams: Promise.resolve(query) });
  return renderToStaticMarkup(element);
}

/**
 * Every element carrying `data-testid="<testId>"`, as outer HTML — found by its opening
 * tag and closed by counting that tag name, so a `<div>` holding `<div>`s is read whole.
 */
function elementsByTestId(html: string, testId: string): string[] {
  const opener = new RegExp(`<(\\w+)\\b[^>]*\\bdata-testid="${testId}"[^>]*>`, "g");
  const found: string[] = [];

  for (const open of html.matchAll(opener)) {
    const tag = open[1];
    const start = open.index;
    const tags = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
    tags.lastIndex = start + open[0].length;

    let depth = 1;
    for (let next = tags.exec(html); next !== null; next = tags.exec(html)) {
      depth += next[1] === "/" ? -1 : 1;
      if (depth === 0) {
        found.push(html.slice(start, next.index + next[0].length));
        break;
      }
    }
  }

  return found;
}

function onlyElement(html: string, testId: string): string {
  const found = elementsByTestId(html, testId);
  expect(found, `exactly one data-testid="${testId}"`).toHaveLength(1);
  return found[0];
}

function openingTagOf(element: string): string {
  return element.slice(0, element.indexOf(">") + 1);
}

function textOf(element: string): string {
  return element.replace(/<[^>]*>/g, "");
}

beforeEach(() => {
  mocks.requireAdminPage.mockReset().mockResolvedValue(ADMIN);
  mocks.listApprovedPeriods.mockReset().mockResolvedValue([]);
  mocks.getAnalysis
    .mockReset()
    .mockImplementation(async (_actor: SessionUser, input: AnalysisInput) =>
      nothingApprovedEver(input),
    );
});

afterEach(() => {
  vi.useRealTimers();
});

/* ------------------------------------------------------------------ AC-6 */

describe("011 AC-6: with no approved count anywhere, the page renders the empty state", () => {
  it("AC-6: the sentence, one link to /stock-takes, and not one euro character in the HTML", async () => {
    const html = await renderPage();

    // Non-vacuity: this is the real page, signed in, and in the empty branch.
    expect(html).toContain(`<h1 class="text-2xl font-semibold tracking-tight">${ANALYSIS_HEADING}</h1>`);
    expect(html).toContain(ADMIN.name);
    expect(html).toContain('data-testid="sign-out"');

    const empty = onlyElement(html, "no-approved-counts");
    expect(textOf(empty)).toContain(NO_APPROVED_STOCK_TAKES_YET);

    const link = onlyElement(html, "go-to-stock-takes");
    expect(openingTagOf(link)).toMatch(/^<a\b/);
    expect(openingTagOf(link)).toContain('href="/stock-takes"');
    expect(textOf(link)).toBe(GO_TO_STOCK_TAKES);

    // No grid, no chart, no breakdown: nothing that could carry a figure is rendered.
    for (const absent of ["period-grid", "total-stock", "trend-chart", "breakdown", "breakdown-links"]) {
      expect(elementsByTestId(html, absent), absent).toHaveLength(0);
    }

    // THE CENSUS: the WHOLE document, not a region of it. React writes the euro sign as
    // itself, and the entity spellings are checked too so an escaped one cannot slip past.
    expect(CURRENCY_SYMBOL).toBe("€");
    expect(html).not.toContain(CURRENCY_SYMBOL);
    expect(html.toLowerCase()).not.toMatch(/&euro;|&#8364;|&#x20ac;/);
  });

  it("AC-6: the census can see a euro — the same page, once a period is approved, renders €0.00", async () => {
    // The converse, so the zero above is a fact about the branch and not about a page that
    // never renders money: a COMPLETE period holding nothing is `"0"`, and it is drawn.
    mocks.listApprovedPeriods.mockResolvedValue(["2026-09"]);
    mocks.getAnalysis.mockImplementation(async (_actor: SessionUser, input: AnalysisInput) =>
      analysisOf(
        input,
        {
          periodKey: input.periodKey,
          periodLabel: formatMonthLabel(input.periodKey),
          complete: true,
          missingYardNames: [],
          yards: YARDS.map((yard) => yardFigure(yard, { countId: `c-${yard.code}`, yardValue: "0" })),
          totalStock: "0",
          unvaluedHeldLineCount: 0,
        },
        [],
        true,
      ),
    );

    const html = await renderPage();

    expect(elementsByTestId(html, "no-approved-counts")).toHaveLength(0);
    expect(textOf(onlyElement(html, "total-stock"))).toContain(formatFigure("0"));
    expect(html).toContain(CURRENCY_SYMBOL);
  });
});

/* ------------------------------------------------------------------ AC-16 */

describe("011 AC-16: with nothing approved, the page opens on the month containing today in the yard", () => {
  it("AC-16: the period the page asks for, and the heading it renders, are today's month in the yard", async () => {
    const today = monthKeyOf(todayInYard());

    const html = await renderPage();

    expect(mocks.listApprovedPeriods).toHaveBeenCalledWith(ADMIN);
    expect(mocks.getAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.getAnalysis).toHaveBeenCalledWith(ADMIN, { periodKey: today, breakdownKey: "type" });

    const heading = onlyElement(html, "period-heading");
    expect(openingTagOf(heading)).toMatch(/^<h2\b/);
    expect(textOf(heading)).toBe(formatMonthLabel(today));
  });

  it("AC-16: IN THE YARD — at 23:30 UTC on 30 September it is already October in Dublin", async () => {
    // Pinned so the assertion is a literal rather than the function under test compared
    // with itself. UTC is still in September; Europe/Dublin (IST, UTC+1) is in October.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T23:30:00Z"));

    const html = await renderPage();

    expect(mocks.getAnalysis).toHaveBeenCalledWith(ADMIN, {
      periodKey: "2026-10",
      breakdownKey: "type",
    });
    expect(textOf(onlyElement(html, "period-heading"))).toBe("October 2026");
    expect(elementsByTestId(html, "no-approved-counts")).toHaveLength(1);
  });
});

/* ------------------------------------------------- AC-6, the incomplete period's totals */

describe("011 AC-6 (amended): an incomplete period's TOTAL cells read Incomplete; a yard reads Not counted", () => {
  it("AC-6: total-stock and every breakdown row's total say Incomplete, and carry no euro", async () => {
    mocks.listApprovedPeriods.mockResolvedValue(["2026-09"]);
    mocks.getAnalysis.mockImplementation(async (_actor: SessionUser, input: AnalysisInput) =>
      analysisOf(
        input,
        {
          periodKey: input.periodKey,
          periodLabel: formatMonthLabel(input.periodKey),
          complete: false,
          missingYardNames: ["Clonmel"],
          yards: [
            yardFigure(YARDS[0], { countId: "c-dublin", yardValue: "1234.5" }),
            yardFigure(YARDS[1], null),
          ],
          totalStock: null,
          unvaluedHeldLineCount: 0,
        },
        ["Thermo-P", "Kelly"].map((groupLabel) => ({
          groupKey: groupLabel,
          groupLabel,
          perYard: [
            { locationCode: "DUBLIN", amount: "617.25" },
            { locationCode: "CLONMEL", amount: null },
          ],
          amount: null,
          unvaluedHeldLineCount: 0,
        })),
        true,
      ),
    );

    const html = await renderPage({ period: "2026-09" });

    const total = textOf(onlyElement(html, "total-stock"));
    expect(total).toContain(INCOMPLETE_TOTAL);
    expect(total).not.toContain(NOT_COUNTED);
    expect(total).not.toContain(CURRENCY_SYMBOL);

    const rowTotals = elementsByTestId(html, "breakdown-total").map(textOf);
    expect(rowTotals).toEqual([INCOMPLETE_TOTAL, INCOMPLETE_TOTAL]);

    // The yard is not a total: the one nobody counted keeps #7's word.
    const clonmel = textOf(onlyElement(html, "yard-cell-CLONMEL"));
    expect(clonmel).toContain(NOT_COUNTED);
    expect(clonmel).not.toContain(CURRENCY_SYMBOL);
    const perYard = elementsByTestId(html, "breakdown-cell").map(textOf);
    expect(perYard).toEqual([formatFigure("617.25"), NOT_COUNTED, formatFigure("617.25"), NOT_COUNTED]);

    // Non-vacuity: Dublin's approved figure IS drawn, beside the total that is not.
    expect(textOf(onlyElement(html, "yard-cell-DUBLIN"))).toContain(formatFigure("1234.5"));
    expect(INCOMPLETE_TOTAL).not.toBe(NOT_COUNTED);
  });

  it("AC-6: the trend's cell and gap marker for that period say Incomplete too — it is the period's total", async () => {
    // The same period as above, Dublin approved and Clonmel not, but with the month before
    // it COMPLETE, so the trend holds one real bar beside the gap and the census below can
    // tell a figure from a word.
    mocks.listApprovedPeriods.mockResolvedValue(["2026-08", "2026-09"]);
    mocks.getAnalysis.mockImplementation(async (_actor: SessionUser, input: AnalysisInput) => {
      const analysis = analysisOf(
        input,
        {
          periodKey: input.periodKey,
          periodLabel: formatMonthLabel(input.periodKey),
          complete: false,
          missingYardNames: ["Clonmel"],
          yards: [
            yardFigure(YARDS[0], { countId: "c-dublin", yardValue: "1234.5" }),
            yardFigure(YARDS[1], null),
          ],
          totalStock: null,
          unvaluedHeldLineCount: 0,
        },
        [],
        true,
      );
      // Field by field, as everywhere in this file: the one point that changes is rebuilt.
      analysis.trend = analysis.trend.map((point) =>
        point.periodKey === "2026-08"
          ? { periodKey: point.periodKey, periodLabel: point.periodLabel, complete: true, totalStock: "999.5" }
          : point,
      );
      return analysis;
    });

    const html = await renderPage({ period: "2026-09" });

    // The row's `<td>`, the figure column: the `<th>` beside it is the period's label.
    const row = elementsByTestId(html, "trend-row").find((element) =>
      openingTagOf(element).includes('data-period="2026-09"'),
    );
    expect(row, "the trend row for the incomplete period").toBeDefined();
    const cell = textOf(/<td\b[^>]*>[\s\S]*?<\/td>/.exec(row ?? "")?.[0] ?? "");
    expect(cell).toBe(INCOMPLETE_TOTAL);
    expect(cell).not.toContain(NOT_COUNTED);

    const gap = elementsByTestId(html, "trend-gap").find((element) =>
      openingTagOf(element).includes('data-period="2026-09"'),
    );
    expect(gap, "the gap marker for the incomplete period").toBeDefined();
    expect(textOf(gap ?? "")).toBe(`${formatMonthLabel("2026-09")}: ${INCOMPLETE_TOTAL}`);

    // NOT ONE `Not counted` in the whole trend — every gap in it is a period's total — while
    // the complete month beside it is a figure, so the census is not reading an empty chart.
    const trend = [
      ...elementsByTestId(html, "trend-chart"),
      ...elementsByTestId(html, "trend-table"),
    ].join("");
    expect(trend).not.toContain(NOT_COUNTED);
    expect(trend).toContain(formatFigure("999.5"));
    expect(textOf(onlyElement(html, "yard-cell-CLONMEL"))).toContain(NOT_COUNTED);
  });
});
