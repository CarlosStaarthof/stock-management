import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  TREND_BAR_INSET,
  TREND_BAR_WIDTH,
  TREND_MIN_BAR_HEIGHT,
  TREND_PLOT_HEIGHT,
  TREND_SLOT_WIDTH,
  TREND_VIEWBOX_HEIGHT,
  TREND_VIEWBOX_WIDTH,
  TREND_WINDOW,
  buildTrendGeometry,
} from "@/lib/analysis-chart";
import type { TrendPoint } from "@/types/analysis";

/**
 * Spec 011 AC-14's geometry half, and all of AC-10 that reaches the chart.
 *
 * NO DATABASE AND NO BROWSER. A chart nobody can assert is decoration, so the layout is a
 * pure function over the same array that fills the table and every number in it is checked
 * here, in `npm run test:unit`, on a machine with no Postgres at all (AC-23).
 */

/** A point that carries a figure. Only a COMPLETE period ever does. */
function complete(periodKey: string, totalStock: string): TrendPoint {
  return { periodKey, periodLabel: `label ${periodKey}`, complete: true, totalStock };
}

/** A period nobody finished counting. It has no total, and it never gets a bar. */
function gap(periodKey: string): TrendPoint {
  return { periodKey, periodLabel: `label ${periodKey}`, complete: false, totalStock: null };
}

/** Thirteen points, as the window always is, with `overrides` replacing by index. */
function thirteen(overrides: Map<number, TrendPoint>): TrendPoint[] {
  return Array.from({ length: TREND_WINDOW }, (_unused, index) => {
    const override = overrides.get(index);
    return override ?? complete(`2026-${String(index + 1).padStart(2, "0")}`, "100");
  });
}

describe("011 AC-14: the constants cannot drift apart", () => {
  it("AC-14: 520 is exactly 13 x 40, asserted as an equality and not as two literals", () => {
    // The whole reason the module contains no division: thirteen slots divide the viewBox
    // with no remainder, so the layout is integer addition and multiplication only.
    expect(TREND_VIEWBOX_WIDTH).toBe(520);
    expect(TREND_SLOT_WIDTH).toBe(40);
    expect(TREND_WINDOW).toBe(13);
    expect(TREND_VIEWBOX_WIDTH).toBe(TREND_WINDOW * TREND_SLOT_WIDTH);
  });

  it("AC-14: the bar fits its slot, and the plot fits the viewBox", () => {
    expect(TREND_BAR_WIDTH + TREND_BAR_INSET + TREND_BAR_INSET).toBe(TREND_SLOT_WIDTH);
    expect(TREND_PLOT_HEIGHT).toBeLessThan(TREND_VIEWBOX_HEIGHT);
    expect(TREND_VIEWBOX_HEIGHT).toBe(180);
  });

  it("AC-14: a minimum bar is at least one unit tall, or it is not a bar", () => {
    expect(TREND_MIN_BAR_HEIGHT).toBeGreaterThanOrEqual(1);
  });
});

describe("011 AC-14: buildTrendGeometry", () => {
  it("AC-14: thirteen points in, thirteen entries out, in the same order", () => {
    const points = thirteen(new Map());

    const slots = buildTrendGeometry(points);

    expect(slots).toHaveLength(TREND_WINDOW);
    expect(slots.map((slot) => slot.periodKey)).toEqual(points.map((point) => point.periodKey));
    expect(slots.map((slot) => slot.periodLabel)).toEqual(points.map((point) => point.periodLabel));
  });

  it("AC-14: the largest total is the full plot height, and half of it is half the height", () => {
    const slots = buildTrendGeometry([
      complete("2026-01", "1000"),
      complete("2026-02", "500"),
      complete("2026-03", "250"),
    ]);

    // The criterion's `height === TREND_PLOT_HEIGHT`: the height is the integer STRING
    // `scaleToInteger` produced, because turning it into a JavaScript number would undo
    // the only reason the step is exact (AC-10).
    expect(slots[0].height).toBe(String(TREND_PLOT_HEIGHT));
    expect(slots[1].height).toBe(String(TREND_PLOT_HEIGHT / 2));
    expect(slots[2].height).toBe(String(TREND_PLOT_HEIGHT / 4));
  });

  it("AC-14: a COMPLETE period holding nothing gets the minimum bar, not a gap", () => {
    // Counted-and-empty is a real fact and a different one from never-counted. This is the
    // converse half of AC-6, and it is the harder half.
    const slots = buildTrendGeometry([complete("2026-01", "1000"), complete("2026-02", "0")]);

    expect(slots[1].bar).toBe(true);
    expect(slots[1].height).toBe(String(TREND_MIN_BAR_HEIGHT));
    expect(slots[1].amount).toBe("0");
  });

  it("AC-14: every period zero is thirteen minimum bars, not thirteen gaps", () => {
    const slots = buildTrendGeometry(
      thirteen(new Map(Array.from({ length: 13 }, (_u, index) => [index, complete(`2026-${String(index + 1).padStart(2, "0")}`, "0")]))),
    );

    expect(slots.every((slot) => slot.bar)).toBe(true);
    expect(slots.every((slot) => slot.height === String(TREND_MIN_BAR_HEIGHT))).toBe(true);
  });

  it("AC-14: a figure too small to be a pixel still gets a bar, because it was counted", () => {
    const slots = buildTrendGeometry([complete("2026-01", "1000000"), complete("2026-02", "0.01")]);

    expect(slots[1].bar).toBe(true);
    expect(slots[1].height).toBe(String(TREND_MIN_BAR_HEIGHT));
  });

  it("AC-14: an INCOMPLETE period gets no height at all, and no amount", () => {
    // A gap, not a zero-height bar: a zero-height bar reads as EUR 0, and a month nobody
    // counted is not a month holding nothing.
    const slots = buildTrendGeometry([complete("2026-01", "1000"), gap("2026-02")]);

    expect(slots[1].bar).toBe(false);
    expect(slots[1].height).toBeNull();
    expect(slots[1].y).toBeNull();
    expect(slots[1].amount).toBeNull();
  });

  it("AC-14: an incomplete period never sets the scale for the bars beside it", () => {
    // A partial total setting the height of its neighbours would make every bar in the
    // window wrong for a reason the reader cannot see.
    const withPartial: TrendPoint[] = [
      complete("2026-01", "100"),
      { periodKey: "2026-02", periodLabel: "x", complete: false, totalStock: "1000000" },
    ];

    const slots = buildTrendGeometry(withPartial);

    expect(slots[0].height).toBe(String(TREND_PLOT_HEIGHT));
    expect(slots[1].bar).toBe(false);
  });

  it("AC-14: x is strictly increasing and the last bar stays inside the viewBox", () => {
    const slots = buildTrendGeometry(thirteen(new Map()));

    const xs = slots.map((slot) => slot.x);
    for (let index = 1; index < xs.length; index += 1) {
      expect(xs[index]).toBeGreaterThan(xs[index - 1]);
    }

    expect(xs[0]).toBeGreaterThanOrEqual(0);
    expect(xs[xs.length - 1] + TREND_BAR_WIDTH).toBeLessThanOrEqual(TREND_VIEWBOX_WIDTH);
  });

  it("AC-14: the bar hangs from the baseline, so y plus height is the plot height", () => {
    const slots = buildTrendGeometry([
      complete("2026-01", "1000"),
      complete("2026-02", "500"),
      complete("2026-03", "0"),
    ]);

    for (const slot of slots) {
      // Read as strings and compared as strings: the module computes both in `bigint`, and
      // the page puts exactly these characters into the SVG attributes.
      expect(slot.y).not.toBeNull();
      expect(slot.height).not.toBeNull();
      expect(BigInt(slot.y ?? "0") + BigInt(slot.height ?? "0")).toBe(BigInt(TREND_PLOT_HEIGHT));
    }
  });

  it("AC-14: the amount on a bar is the EXACT string the service produced", () => {
    // The chart and the table cannot disagree, because they carry the same characters.
    const slots = buildTrendGeometry([complete("2026-01", "8896.637232378368")]);

    expect(slots[0].amount).toBe("8896.637232378368");
  });

  it("AC-14: thirteen gaps is a legal chart and draws no bar at all", () => {
    const slots = buildTrendGeometry(
      thirteen(new Map(Array.from({ length: 13 }, (_u, index) => [index, gap(`2026-${String(index + 1).padStart(2, "0")}`)]))),
    );

    expect(slots).toHaveLength(13);
    expect(slots.some((slot) => slot.bar)).toBe(false);
    expect(slots.every((slot) => slot.amount === null)).toBe(true);
  });

  it("AC-14: an empty window is an empty layout rather than a throw", () => {
    expect(buildTrendGeometry([])).toEqual([]);
  });
});

describe("011 AC-10, AC-22: what the chart module is allowed to contain", () => {
  const source = readFileSync("src/lib/analysis-chart.ts", "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("AC-10: no Number(, no parseFloat, no toFixed and no Math.round - no exemption taken", () => {
    expect(code).toContain("buildTrendGeometry");
    expect(code).not.toMatch(/\bNumber\s*\(/);
    expect(code).not.toMatch(/\bparseFloat\b/);
    expect(code).not.toMatch(/\btoFixed\b/);
    expect(code).not.toMatch(/\bMath\.round\b/);
  });

  it("AC-14: and no division either, which is why 520 is 13 x 40", () => {
    // The OPERATOR, not the character: `@/lib/money` is a module path. This is the same
    // `/\s\*\s/` shape 009 AC-24's multiplication census uses on `src/lib/money.ts`.
    const divisions = code
      .split("\n")
      .filter((line) => !/^\s*import\b/.test(line))
      .filter((line) => /\s\/\s/.test(line));

    expect(divisions).toEqual([]);
  });

  it("AC-22: it imports nothing from src/server, so the lint fence stays green", () => {
    expect(code).not.toMatch(/from\s+"[^"]*server/);
  });

  it("AC-26: it names the price column nowhere", () => {
    expect(source).not.toContain("unitPrice");
  });
});
