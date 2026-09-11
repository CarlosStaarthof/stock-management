import { describe, expect, it } from "vitest";

import {
  parseCountDateOrDefault,
  parseMonthKeyParam,
  parseStartCountInput,
  parseYardChoice,
  parseYardChoiceOrNull,
} from "@/server/counts/count-input";
import { NotFoundError, ValidationError } from "@/server/errors";

/**
 * Spec 007 AC-8, AC-21 and AC-23, with no database.
 */
describe("parseYardChoice", () => {
  it("AC-23: nothing chosen is a ValidationError naming locationCode", () => {
    for (const nothing of [undefined, null, "", "   "]) {
      try {
        parseYardChoice(nothing);
        expect.unreachable("nothing chosen is not a yard");
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).field).toBe("locationCode");
        expect((error as ValidationError).message).toBe("Choose a yard.");
      }
    }
  });

  it("AC-13: a code that is not one of the two is a NotFoundError naming the code", () => {
    // Not a ValidationError: the caller asked for a yard that does not exist, and there is
    // no field on the screen to put a message beside.
    try {
      parseYardChoice("BANANA");
      expect.unreachable("BANANA is not a yard");
    } catch (error) {
      expect(error).toBeInstanceOf(NotFoundError);
      expect((error as NotFoundError).message).toBe("No yard with code BANANA.");
    }
  });

  it("AC-23: the two real yards are accepted, and surrounding whitespace is not an error", () => {
    expect(parseYardChoice("DUBLIN")).toBe("DUBLIN");
    expect(parseYardChoice("CLONMEL")).toBe("CLONMEL");
    expect(parseYardChoice("  DUBLIN  ")).toBe("DUBLIN");
  });

  it("AC-13: the yard list is not restated here — a lowercase code is not a yard", () => {
    expect(() => parseYardChoice("dublin")).toThrow(NotFoundError);
  });
});

describe("parseStartCountInput", () => {
  it("AC-7: the three fields of the confirm form become a yard, a day and a period", () => {
    expect(
      parseStartCountInput({ locationCode: "DUBLIN", countDate: "2026-10-01", period: "2026-09" }),
    ).toEqual({
      locationCode: "DUBLIN",
      countDate: "2026-10-01",
      period: { periodYear: 2026, periodMonth: 9 },
    });
  });

  it("AC-8: the override is honoured — the date and the period stay two separate facts", () => {
    expect(
      parseStartCountInput({ locationCode: "DUBLIN", countDate: "2026-10-01", period: "2026-10" }),
    ).toEqual({
      locationCode: "DUBLIN",
      countDate: "2026-10-01",
      period: { periodYear: 2026, periodMonth: 10 },
    });

    // At any distance, with no warning and no field error: the workbook holds a count
    // dated 2026-12-31 that belongs to 2025-12 (open question 3).
    expect(
      parseStartCountInput({ locationCode: "DUBLIN", countDate: "2026-10-01", period: "2025-12" }),
    ).toEqual({
      locationCode: "DUBLIN",
      countDate: "2026-10-01",
      period: { periodYear: 2025, periodMonth: 12 },
    });
  });

  it("AC-8: a period that is not YYYY-MM, or outside 2000-2100, names `period` and writes nothing", () => {
    for (const bad of ["2026-13", "2026-00", "1999-12", "2101-01", "banana", "2026-9"]) {
      try {
        parseStartCountInput({ locationCode: "DUBLIN", countDate: "2026-10-01", period: bad });
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

  it("AC-7: a missing period derives from the date, exactly as the screen's default does", () => {
    expect(
      parseStartCountInput({ locationCode: "DUBLIN", countDate: "2026-10-01", period: undefined }),
    ).toEqual({
      locationCode: "DUBLIN",
      countDate: "2026-10-01",
      period: { periodYear: 2026, periodMonth: 9 },
    });
  });

  it("AC-23: the yard is refused before the date, so a bad date does not hide a missing yard", () => {
    try {
      parseStartCountInput({ locationCode: "", countDate: "banana", period: "2026-09" });
      expect.unreachable("no yard was chosen");
    } catch (error) {
      expect((error as ValidationError).field).toBe("locationCode");
    }
  });

  it("AC-6: a countDate that is not a real day names countDate", () => {
    try {
      parseStartCountInput({ locationCode: "DUBLIN", countDate: "2026-02-30", period: "2026-01" });
      expect.unreachable("2026-02-30 is not a day");
    } catch (error) {
      expect((error as ValidationError).field).toBe("countDate");
    }
  });

  it("AC-9: a Saturday and a Sunday parse like any other day", () => {
    expect(
      parseStartCountInput({ locationCode: "DUBLIN", countDate: "2026-01-03", period: undefined })
        .period,
    ).toEqual({ periodYear: 2025, periodMonth: 12 });
    expect(
      parseStartCountInput({ locationCode: "CLONMEL", countDate: "2025-11-30", period: undefined })
        .period,
    ).toEqual({ periodYear: 2025, periodMonth: 11 });
  });
});

describe("the query parameters, which navigate and never throw", () => {
  it("AC-21: a good month key survives", () => {
    expect(parseMonthKeyParam("2026-08")).toBe("2026-08");
    expect(parseMonthKeyParam("2026-01")).toBe("2026-01");
  });

  it("AC-21: banana, 2026-13, 2026-1, an empty string and a repeated parameter all give null", () => {
    expect(parseMonthKeyParam("banana")).toBeNull();
    expect(parseMonthKeyParam("2026-13")).toBeNull();
    expect(parseMonthKeyParam("2026-1")).toBeNull();
    expect(parseMonthKeyParam("")).toBeNull();
    expect(parseMonthKeyParam(["2026-08", "2026-09"])).toBeNull();
    expect(parseMonthKeyParam(undefined)).toBeNull();
  });

  it("AC-21: no value of ?month throws — the page redirects instead", () => {
    for (const raw of ["banana", "2026-13", "", ["a", "b"], undefined, "../../etc/passwd"]) {
      expect(() => parseMonthKeyParam(raw)).not.toThrow();
    }
  });

  it("AC-23: a ?countDate that is not a real date is ignored and the default is used", () => {
    expect(parseCountDateOrDefault("2026-09-01", "2026-09-11")).toBe("2026-09-01");
    expect(parseCountDateOrDefault("2026-02-30", "2026-09-11")).toBe("2026-09-11");
    expect(parseCountDateOrDefault("banana", "2026-09-11")).toBe("2026-09-11");
    expect(parseCountDateOrDefault(undefined, "2026-09-11")).toBe("2026-09-11");
    expect(parseCountDateOrDefault(["2026-09-01", "2026-09-02"], "2026-09-11")).toBe("2026-09-11");
  });

  it("AC-23: ?locationCode is a yard or it is null, and never an error", () => {
    expect(parseYardChoiceOrNull("DUBLIN")).toBe("DUBLIN");
    expect(parseYardChoiceOrNull("CLONMEL")).toBe("CLONMEL");
    expect(parseYardChoiceOrNull("BANANA")).toBeNull();
    expect(parseYardChoiceOrNull(undefined)).toBeNull();
    expect(parseYardChoiceOrNull(["DUBLIN", "CLONMEL"])).toBeNull();
  });
});
