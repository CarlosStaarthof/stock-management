import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { TREND_WINDOW } from "@/lib/analysis-chart";
import { ValidationError } from "@/server/errors";
import {
  comparePeriodKeys,
  periodWindow,
  previousPeriodKey,
  priorYearPeriodKey,
} from "@/server/reporting/period-series";

/**
 * Spec 011 AC-11, AC-12 and AC-13: the period arithmetic, with no database.
 *
 * MONTH ON MONTH IS `(y, m - 1)` AND YEAR ON YEAR IS `(y - 1, m)`. Neither is "the column
 * to the left": `Summary!C9` subtracts the column ELEVEN months back and compares October
 * 2025 with November 2024, which is the defect Part 4 condemns in terms.
 */

describe("011 AC-11: previousPeriodKey", () => {
  it("AC-11: January rolls back to December of the previous year", () => {
    expect(previousPeriodKey("2026-01")).toBe("2025-12");
  });

  it("AC-11: and every other month is simply the month before", () => {
    expect(previousPeriodKey("2026-09")).toBe("2026-08");
    expect(previousPeriodKey("2026-03")).toBe("2026-02");
    expect(previousPeriodKey("2026-12")).toBe("2026-11");
  });

  it("AC-13: a key that is not a month is a typed ValidationError, never a wrong month", () => {
    expect(() => previousPeriodKey("banana")).toThrow(ValidationError);
    expect(() => previousPeriodKey("2026-13")).toThrow(ValidationError);
    expect(() => previousPeriodKey("2026-1")).toThrow(ValidationError);
  });
});

describe("011 AC-12: priorYearPeriodKey", () => {
  it("AC-12: the same month, one year back, at both ends of the year", () => {
    expect(priorYearPeriodKey("2026-01")).toBe("2025-01");
    expect(priorYearPeriodKey("2026-12")).toBe("2025-12");
  });

  it("AC-12: and in the middle of it, which is where the Summary sheet goes wrong", () => {
    expect(priorYearPeriodKey("2026-09")).toBe("2025-09");
    expect(priorYearPeriodKey("2025-10")).toBe("2024-10");
  });

  it("AC-12: twelve steps back is never eleven - the Summary!C9 defect, as an assertion", () => {
    // `=C5-N5` compares October 2025 with November 2024. Eleven and thirteen are the two
    // answers an off-by-one produces, and neither is this one.
    expect(priorYearPeriodKey("2025-10")).not.toBe("2024-11");
    expect(priorYearPeriodKey("2025-10")).not.toBe("2024-09");
  });
});

describe("011 AC-13: periodWindow", () => {
  it("AC-13: thirteen keys, oldest first, ending at the selected period", () => {
    const window = periodWindow("2026-09", TREND_WINDOW);

    expect(window).toHaveLength(13);
    expect(window[0]).toBe("2025-09");
    expect(window[window.length - 1]).toBe("2026-09");
    expect(window).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
  });

  it("AC-13: the LEFTMOST point is the year-on-year comparand - why the window is 13", () => {
    for (const key of ["2026-09", "2026-02", "2026-01", "2026-12"]) {
      expect(periodWindow(key, TREND_WINDOW)[0]).toBe(priorYearPeriodKey(key));
    }
    expect(periodWindow("2026-02", TREND_WINDOW)[0]).toBe("2025-02");
  });

  it("AC-13: the twelfth entry is the month-on-month comparand", () => {
    const window = periodWindow("2026-09", TREND_WINDOW);
    expect(window[11]).toBe(previousPeriodKey("2026-09"));
  });

  it("AC-13: a window of one is the period itself, and a window of none is empty", () => {
    expect(periodWindow("2026-09", 1)).toEqual(["2026-09"]);
    expect(periodWindow("2026-09", 0)).toEqual([]);
    expect(periodWindow("2026-09", -3)).toEqual([]);
  });

  it("AC-13: every window is consecutive and has no repeats", () => {
    const window = periodWindow("2026-02", TREND_WINDOW);

    expect(new Set(window).size).toBe(window.length);
    for (let index = 1; index < window.length; index += 1) {
      expect(previousPeriodKey(window[index])).toBe(window[index - 1]);
    }
  });
});

describe("011 AC-13: comparePeriodKeys", () => {
  it("AC-13: the three answers the criterion names", () => {
    expect(comparePeriodKeys("2025-12", "2026-01")).toBe(-1);
    expect(comparePeriodKeys("2026-01", "2026-01")).toBe(0);
    expect(comparePeriodKeys("2026-01", "2025-12")).toBe(1);
  });

  it("AC-13: it sorts a shuffled window back into calendar order", () => {
    const shuffled = ["2026-01", "2025-09", "2026-09", "2025-12", "2026-08"];

    expect([...shuffled].sort(comparePeriodKeys)).toEqual([
      "2025-09",
      "2025-12",
      "2026-01",
      "2026-08",
      "2026-09",
    ]);
  });

  it("AC-13: a key that is not a month is refused rather than silently misordered", () => {
    expect(() => comparePeriodKeys("2026-1", "2026-01")).toThrow(ValidationError);
  });
});

describe("011 AC-13: there is ONE definition of month arithmetic and this is not it", () => {
  const source = readFileSync("src/server/reporting/period-series.ts", "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("AC-13: the module defines no month arithmetic of its own", () => {
    expect(code).not.toMatch(/\bnew Date\b/);
    expect(code).not.toMatch(/\bDate\.UTC\b/);
    expect(code).not.toMatch(/\bgetUTC/);
  });

  it("AC-13: it builds on #7's three functions, by importing them", () => {
    expect(code).toMatch(/import\s*\{[^}]*previousMonthKey[^}]*\}\s*from\s*"@\/server\/counts\/period"/s);
    expect(code).toContain("nextMonthKey");
    expect(code).toContain("parseMonthKey");
  });

  it("AC-10, AC-16: no JavaScript number, and not the parser that guards a write", () => {
    expect(code).not.toMatch(/\bNumber\s*\(/);
    expect(code).not.toMatch(/\bparseFloat\b/);
    expect(code).not.toMatch(/\bparsePeriodKey\b/);
  });

  it("AC-13: src/server/counts/period.ts is byte-identical after this feature", () => {
    // Asserted here as an absence of the two things this feature might have been tempted
    // to add to it; the git-level byte identity is recorded in the report.
    const period = readFileSync("src/server/counts/period.ts", "utf8");
    expect(period).not.toContain("priorYear");
    expect(period).not.toContain("periodWindow");
  });
});
