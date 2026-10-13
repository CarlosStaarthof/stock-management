import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CURRENCY_SYMBOL } from "@/lib/money";
import { EXPORT_EMPTY, EXPORT_HEADING } from "@/lib/export-messages";
import type { SessionUser } from "@/server/auth/session-user";
import type { ExportStockTake } from "@/server/export/export-service";

/**
 * Spec 012 AC-15, the PAGE half, rendered by the page itself with no database.
 *
 * The session guard and the export service are mocked; everything else is the real module
 * graph — the real page, the real `next/link`, the real messages. `react-dom/server` produces
 * the HTML a browser would receive, and the assertions read that HTML: the approved stock
 * takes list newest first, each with one download control per depot, and the page carries no
 * euro at all.
 */

const mocks = vi.hoisted(() => ({
  requireAdminPage: vi.fn(),
  listExportStockTakes: vi.fn(),
  signOutAction: vi.fn(),
}));

vi.mock("@/app/page-guards", () => ({ requireAdminPage: mocks.requireAdminPage }));
vi.mock("@/server/export/export-service", () => ({
  listExportStockTakes: mocks.listExportStockTakes,
}));
vi.mock("@/app/auth-actions", () => ({ signOutAction: mocks.signOutAction }));

/*
 * The classic JSX runtime, as in `src/app/analysis/page.test.ts`: `tsconfig.json` preserves
 * JSX for Next, and Vitest's esbuild falls back to the classic transform, which needs a
 * `React` on `globalThis`. Met here, for this file only.
 */
(globalThis as { React?: typeof React }).React = React;
const { default: ExportPage } = await import("./page");

const ADMIN: SessionUser = {
  id: "admin-export-test",
  username: "owner",
  name: "Owner",
  role: "ADMIN",
};

const TAKES: ExportStockTake[] = [
  {
    periodKey: "2026-09",
    periodLabel: "September 2026",
    depots: [
      { code: "DUBLIN", name: "Dublin", countDate: "2026-09-30" },
      { code: "CASHEL", name: "Cashel", countDate: "2026-09-28" },
    ],
  },
  {
    periodKey: "2026-08",
    periodLabel: "August 2026",
    depots: [{ code: "DUBLIN", name: "Dublin", countDate: "2026-08-31" }],
  },
];

async function renderPage(): Promise<string> {
  return renderToStaticMarkup(await ExportPage());
}

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

function openingTagOf(element: string): string {
  return element.slice(0, element.indexOf(">") + 1);
}

beforeEach(() => {
  mocks.requireAdminPage.mockReset().mockResolvedValue(ADMIN);
  mocks.listExportStockTakes.mockReset().mockResolvedValue([]);
  mocks.signOutAction.mockReset();
});

describe("012 AC-15: the export page lists the approved stock takes", () => {
  it("AC-15: with nothing approved it renders the empty state and no euro", async () => {
    const html = await renderPage();

    expect(html).toContain(EXPORT_HEADING);
    expect(html).toContain(ADMIN.name);
    expect(mocks.listExportStockTakes).toHaveBeenCalledWith(ADMIN);

    const empty = elementsByTestId(html, "export-empty");
    expect(empty).toHaveLength(1);
    expect(empty[0]).toContain(EXPORT_EMPTY);
    expect(html).not.toContain(CURRENCY_SYMBOL);
  });

  it("AC-15: one download per depot, newest stock take first, each pointing at its own file", async () => {
    mocks.listExportStockTakes.mockResolvedValue(TAKES);
    const html = await renderPage();

    const takes = elementsByTestId(html, "stock-take-2026-09").length + elementsByTestId(html, "stock-take-2026-08").length;
    expect(takes).toBe(2);

    // Newest first: September's block opens before August's in the document.
    expect(html.indexOf("September 2026")).toBeLessThan(html.indexOf("August 2026"));

    const dublin = elementsByTestId(html, "download-DUBLIN");
    const cashel = elementsByTestId(html, "download-CASHEL");
    expect(dublin).toHaveLength(2); // one per stock take
    expect(cashel).toHaveLength(1); // Cashel only approved in September

    expect(openingTagOf(cashel[0])).toContain(
      'href="/analysis/export/download?location=CASHEL&amp;period=2026-09"',
    );
    expect(html).not.toContain(CURRENCY_SYMBOL);
  });
});
