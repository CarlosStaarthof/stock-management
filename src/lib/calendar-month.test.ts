import { describe, expect, it } from "vitest";

import { buildMonthGrid, daysInMonth, leadingPadding } from "@/lib/calendar-month";
import { ValidationError } from "@/server/errors";

/**
 * Spec 007 AC-19, as amended: rows are `ceil((leading + days) / 7)` complete Monday-first
 * weeks, never a fixed five or six. No database.
 */

function cellCount(grid: { date: string | null }[][]): number {
  return grid.reduce((total, row) => total + row.length, 0);
}

function datedCells(grid: { date: string | null }[][]): string[] {
  return grid.flat().flatMap((cell) => (cell.date === null ? [] : [cell.date]));
}

describe("buildMonthGrid", () => {
  it("AC-19: September 2026 begins on a Tuesday — 5 rows of 7, 1 leading pad, 30 days, 4 trailing", () => {
    const grid = buildMonthGrid("2026-09");

    expect(grid).toHaveLength(5);
    for (const row of grid) expect(row).toHaveLength(7);
    expect(cellCount(grid)).toBe(35);

    expect(grid[0][0].date).toBeNull();
    expect(grid[0][1].date).toBe("2026-09-01");
    expect(datedCells(grid)).toHaveLength(30);

    const last = grid[4];
    expect(last.filter((cell) => cell.date === null)).toHaveLength(4);
    expect(last[2].date).toBe("2026-09-30");
    expect(last[3].date).toBeNull();
  });

  it("AC-19: February 2026 begins on a Sunday — 6 leading, 28 days, 1 trailing, 35 cells, 5 rows", () => {
    // The largest leading pad that still fits in five rows, which is the case an
    // off-by-one in the pad arithmetic breaks. Corrected into the spec after the
    // implementer checked the arithmetic (007 § Post-approval amendments 1).
    const grid = buildMonthGrid("2026-02");

    expect(grid).toHaveLength(5);
    expect(cellCount(grid)).toBe(35);
    expect(leadingPadding(2026, 2)).toBe(6);
    expect(grid[0].filter((cell) => cell.date === null)).toHaveLength(6);
    expect(grid[0][6].date).toBe("2026-02-01");
    expect(datedCells(grid)).toHaveLength(28);
    expect(grid[4].filter((cell) => cell.date === null)).toHaveLength(1);
    expect(grid[4][5].date).toBe("2026-02-28");
  });

  it("AC-19: March 2026 also begins on a Sunday but has 31 days — 6 rows, 42 cells, 5 trailing", () => {
    // This is what stops the grid being assumed to be five.
    const grid = buildMonthGrid("2026-03");

    expect(grid).toHaveLength(6);
    expect(cellCount(grid)).toBe(42);
    expect(grid[0].filter((cell) => cell.date === null)).toHaveLength(6);
    expect(datedCells(grid)).toHaveLength(31);
    expect(grid[5].filter((cell) => cell.date === null)).toHaveLength(5);
    expect(grid[5][1].date).toBe("2026-03-31");
  });

  it("AC-19: a padding cell carries no date, and nothing else at all", () => {
    const padding = buildMonthGrid("2026-09")[0][0];

    expect(padding.date).toBeNull();
    expect(Object.keys(padding)).toEqual(["date"]);
  });

  it("AC-19: every dated cell is ascending, contiguous and inside its own month", () => {
    for (const monthKey of ["2026-02", "2026-03", "2026-09", "2024-02", "2027-01"]) {
      const dates = datedCells(buildMonthGrid(monthKey));

      expect(dates[0]).toBe(`${monthKey}-01`);
      expect(dates).toEqual([...dates].sort());
      expect(new Set(dates).size).toBe(dates.length);
      for (const date of dates) expect(date.startsWith(monthKey)).toBe(true);
    }
  });

  it("AC-19: the rule is ceil((leading + days) / 7) for every month of four whole years", () => {
    // Not a spot check: a fixed five or six, or a Sunday-first rotation, fails here.
    for (let year = 2024; year <= 2027; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const monthKey = `${year}-${String(month).padStart(2, "0")}`;
        const grid = buildMonthGrid(monthKey);
        const expected = Math.ceil((leadingPadding(year, month) + daysInMonth(year, month)) / 7);

        expect(grid, monthKey).toHaveLength(expected);
        expect(cellCount(grid), monthKey).toBe(expected * 7);
        expect(datedCells(grid), monthKey).toHaveLength(daysInMonth(year, month));
      }
    }
  });

  it("AC-19: a leap February is 29 days and a common one is 28", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2100, 2)).toBe(28);
  });

  it("AC-19: a month key that is not YYYY-MM with a month in 01-12 is refused", () => {
    for (const bad of ["banana", "2026-13", "2026-00", "2026-1", "", "2026-09-01", "26-09"]) {
      expect(() => buildMonthGrid(bad), bad).toThrow(ValidationError);
    }

    try {
      buildMonthGrid("2026-13");
      expect.unreachable("2026-13 is not a month");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("month");
    }
  });
});
