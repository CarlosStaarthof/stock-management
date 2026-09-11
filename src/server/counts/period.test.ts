import { describe, expect, it } from "vitest";

import { ValidationError } from "@/server/errors";
import {
  formatPeriodKey,
  formatPeriodLabel,
  monthBounds,
  monthKeyOf,
  nextMonthKey,
  parseCountDate,
  parseMonthKey,
  parsePeriodKey,
  periodForCountDate,
  previousMonthKey,
} from "@/server/counts/period";

/**
 * Spec 007 AC-6 and AC-21, with no database: the period rule is one pure function, and
 * `specs/domain-model.md` Part 4's table is its test.
 */
describe("periodForCountDate", () => {
  it("AC-6: Part 4's four worked examples, in order", () => {
    expect(periodForCountDate("2026-09-30")).toEqual({ periodYear: 2026, periodMonth: 9 });
    expect(periodForCountDate("2026-10-01")).toEqual({ periodYear: 2026, periodMonth: 9 });
    expect(periodForCountDate("2026-10-05")).toEqual({ periodYear: 2026, periodMonth: 9 });
    expect(periodForCountDate("2026-10-06")).toEqual({ periodYear: 2026, periodMonth: 10 });
  });

  it("AC-6: January rolls back a year, and a leap February is still February", () => {
    expect(periodForCountDate("2026-01-03")).toEqual({ periodYear: 2025, periodMonth: 12 });
    expect(periodForCountDate("2026-01-06")).toEqual({ periodYear: 2026, periodMonth: 1 });
    expect(periodForCountDate("2026-03-01")).toEqual({ periodYear: 2026, periodMonth: 2 });
    expect(periodForCountDate("2024-03-05")).toEqual({ periodYear: 2024, periodMonth: 2 });
  });

  it("AC-6: the boundary is day 5, asserted on both sides of it in every month of a year", () => {
    // Not a spot check: an off-by-one at `<` versus `<=` fails here twelve times.
    for (let month = 1; month <= 12; month += 1) {
      const key = String(month).padStart(2, "0");
      const previous = month === 1 ? { periodYear: 2025, periodMonth: 12 } : { periodYear: 2026, periodMonth: month - 1 };

      expect(periodForCountDate(`2026-${key}-01`), `2026-${key}-01`).toEqual(previous);
      expect(periodForCountDate(`2026-${key}-05`), `2026-${key}-05`).toEqual(previous);
      expect(periodForCountDate(`2026-${key}-06`), `2026-${key}-06`).toEqual({
        periodYear: 2026,
        periodMonth: month,
      });
    }
  });

  it("AC-9: there is no business-day rule — a Saturday and a Sunday derive like any day", () => {
    // 2026-01-03 is a Saturday; 2025-11-30 is a Sunday. Neither is refused or flagged.
    expect(periodForCountDate("2026-01-03")).toEqual({ periodYear: 2025, periodMonth: 12 });
    expect(periodForCountDate("2025-11-30")).toEqual({ periodYear: 2025, periodMonth: 11 });
  });

  it("AC-6: a date that is not YYYY-MM-DD, or not a real day, names countDate", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "banana", "2026-9-1", "", "2026/09/01", "20260901"]) {
      try {
        periodForCountDate(bad);
        expect.unreachable(`${bad} is not a date`);
      } catch (error) {
        expect(error, bad).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).field, bad).toBe("countDate");
        expect((error as ValidationError).message, bad).toBe(
          "Count date must be a real date, as YYYY-MM-DD.",
        );
      }
    }
  });

  it("AC-6: a non-string is refused rather than coerced", () => {
    for (const bad of [undefined, null, 20260901, {}, ["2026-09-01"]]) {
      expect(() => periodForCountDate(bad)).toThrow(ValidationError);
    }
  });

  it("AC-6: a real date round-trips unchanged through parseCountDate", () => {
    expect(parseCountDate("2024-02-29")).toBe("2024-02-29");
    expect(() => parseCountDate("2026-02-29")).toThrow(ValidationError);
  });
});

describe("formatting and parsing a period", () => {
  it("AC-6: formatPeriodKey and formatPeriodLabel", () => {
    expect(formatPeriodKey({ periodYear: 2026, periodMonth: 9 })).toBe("2026-09");
    expect(formatPeriodKey({ periodYear: 2025, periodMonth: 12 })).toBe("2025-12");
    expect(formatPeriodLabel({ periodYear: 2026, periodMonth: 9 })).toBe("September 2026");
  });

  it("AC-8: parsePeriodKey accepts a month and returns the two numbers", () => {
    expect(parsePeriodKey("2026-09")).toEqual({ periodYear: 2026, periodMonth: 9 });
    expect(parsePeriodKey("2025-12")).toEqual({ periodYear: 2025, periodMonth: 12 });
    expect(parsePeriodKey("2000-01")).toEqual({ periodYear: 2000, periodMonth: 1 });
    expect(parsePeriodKey("2100-12")).toEqual({ periodYear: 2100, periodMonth: 12 });
  });

  it("AC-8: a period that is not YYYY-MM, or outside 2000-2100, names `period` and is refused", () => {
    for (const bad of ["2026-13", "2026-00", "1999-12", "2101-01", "banana", "2026-9", "", "2026-09-01"]) {
      try {
        parsePeriodKey(bad);
        expect.unreachable(`${bad} is not a period`);
      } catch (error) {
        expect(error, bad).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).field, bad).toBe("period");
        expect((error as ValidationError).message, bad).toBe(
          "Period must be a month between 2000 and 2100.",
        );
      }
    }
  });

  it("AC-8: `2026-13` never becomes a periodMonth, so the CHECK is never reached", () => {
    // StockCount_periodMonth_range is #4's backstop. This is the front stop, and it is the
    // one a user sees — AC-8 requires the rendered page to contain none of
    // `StockCount_periodMonth_range`, `violates`, `check constraint` or `23514`.
    expect(() => parsePeriodKey("2026-13")).toThrow(ValidationError);
    try {
      parsePeriodKey("2026-13");
    } catch (error) {
      expect((error as ValidationError).message).not.toMatch(/23514|violates|check constraint/i);
    }
  });
});

describe("moving between months", () => {
  it("AC-21: previousMonthKey and nextMonthKey cross a year boundary", () => {
    expect(previousMonthKey("2026-01")).toBe("2025-12");
    expect(nextMonthKey("2026-12")).toBe("2027-01");
  });

  it("AC-21: and do not cross one when they should not", () => {
    expect(previousMonthKey("2026-09")).toBe("2026-08");
    expect(nextMonthKey("2026-08")).toBe("2026-09");
    expect(previousMonthKey("2026-03")).toBe("2026-02");
  });

  it("AC-21: twelve steps forward and twelve back return to the same month", () => {
    let key = "2026-01";
    for (let step = 0; step < 12; step += 1) key = nextMonthKey(key);
    expect(key).toBe("2027-01");
    for (let step = 0; step < 12; step += 1) key = previousMonthKey(key);
    expect(key).toBe("2026-01");
  });

  it("AC-21: a month key that is not YYYY-MM with a month in 01-12 is refused", () => {
    for (const bad of ["banana", "2026-13", "2026-1", "", "2026-00", "2026-09-01"]) {
      expect(() => parseMonthKey(bad), bad).toThrow(ValidationError);
      expect(() => previousMonthKey(bad), bad).toThrow(ValidationError);
      expect(() => nextMonthKey(bad), bad).toThrow(ValidationError);
    }
  });

  it("AC-20: monthKeyOf places a day in the month it happened in, not the one it closes", () => {
    // A count dated 2026-10-01 closes 2026-09 and appears in OCTOBER's grid.
    expect(monthKeyOf("2026-10-01")).toBe("2026-10");
    expect(formatPeriodKey(periodForCountDate("2026-10-01"))).toBe("2026-09");
    expect(monthKeyOf("2026-09-30")).toBe("2026-09");
  });

  it("AC-22: monthBounds spans the whole month, February and December included", () => {
    expect(monthBounds("2026-09")).toEqual({ first: "2026-09-01", last: "2026-09-30" });
    expect(monthBounds("2026-02")).toEqual({ first: "2026-02-01", last: "2026-02-28" });
    expect(monthBounds("2024-02")).toEqual({ first: "2024-02-01", last: "2024-02-29" });
    expect(monthBounds("2026-12")).toEqual({ first: "2026-12-01", last: "2026-12-31" });
  });

  it("AC-22: monthBounds refuses a key it cannot bound rather than returning NaN", () => {
    expect(() => monthBounds("2026-13")).toThrow(ValidationError);
  });
});
