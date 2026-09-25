import { describe, expect, it } from "vitest";

import {
  DEFAULT_BREAKDOWN,
  analysisHref,
  parseAnalysisPeriodParam,
  parseBreakdownParam,
} from "@/server/reporting/analysis-input";

/**
 * Spec 011 AC-16's parser half, and AC-21's "no query parameter can make the page throw".
 *
 * NEITHER PARSER THROWS. A query string is a NAVIGATION, not a submission: an unreadable
 * value is `null`, the page turns `null` into a `307` to `/analysis`, and no Prisma or
 * Postgres string can reach a screen through here.
 */

describe("011 AC-16: parseAnalysisPeriodParam", () => {
  it("AC-16: it accepts a month key, including one the WRITE validator would refuse", () => {
    expect(parseAnalysisPeriodParam("2026-09")).toBe("2026-09");
    // 2105 is reserved by this feature's e2e suite. `parsePeriodKey` caps at 2100 because
    // it guards a WRITE against the `StockCount_periodMonth_range` CHECK; this feature
    // writes nothing, and a `307` here would look like a routing bug.
    expect(parseAnalysisPeriodParam("2105-03")).toBe("2105-03");
    expect(parseAnalysisPeriodParam("2103-01")).toBe("2103-01");
    expect(parseAnalysisPeriodParam("1999-01")).toBe("1999-01");
  });

  it("AC-16: it returns null for each of the six values the criterion names", () => {
    expect(parseAnalysisPeriodParam("banana")).toBeNull();
    expect(parseAnalysisPeriodParam("2026-13")).toBeNull();
    expect(parseAnalysisPeriodParam("2026-1")).toBeNull();
    expect(parseAnalysisPeriodParam("")).toBeNull();
    expect(parseAnalysisPeriodParam(["2026-09", "2026-08"])).toBeNull();
    expect(parseAnalysisPeriodParam(undefined)).toBeNull();
  });

  it("AC-16: a repeated parameter is two values and therefore no value", () => {
    // Taking the first would let `?period=2026-09&period=banana` mean something, and the
    // page would have a state that depends on which one Next happened to put first.
    expect(parseAnalysisPeriodParam(["2026-09"])).toBeNull();
    expect(parseAnalysisPeriodParam([])).toBeNull();
  });

  it("AC-21: nothing a URL can carry makes it throw", () => {
    for (const raw of ["2026-00", "0000-00", "2026-09-01", " 2026-09 ", "%2F", "../../etc"]) {
      expect(() => parseAnalysisPeriodParam(raw)).not.toThrow();
      expect(parseAnalysisPeriodParam(raw)).toBeNull();
    }
  });
});

describe("011 AC-16: parseBreakdownParam", () => {
  it("AC-15, AC-16: no ?breakdown at all is the same view as ?breakdown=type", () => {
    expect(DEFAULT_BREAKDOWN).toBe("type");
    expect(parseBreakdownParam(undefined)).toBe(DEFAULT_BREAKDOWN);
    expect(parseBreakdownParam("type")).toBe("type");
  });

  it("AC-15: ?breakdown=supplier selects the other grouping, and there is no third", () => {
    expect(parseBreakdownParam("supplier")).toBe("supplier");
  });

  it("AC-21: banana, an empty string and a repeated parameter are all null", () => {
    expect(parseBreakdownParam("banana")).toBeNull();
    expect(parseBreakdownParam("")).toBeNull();
    expect(parseBreakdownParam(["type", "supplier"])).toBeNull();
    expect(parseBreakdownParam(["type"])).toBeNull();
  });

  it("AC-16: the comparison is case-sensitive, as every other code in this product is", () => {
    expect(parseBreakdownParam("Type")).toBeNull();
    expect(parseBreakdownParam("SUPPLIER")).toBeNull();
  });
});

describe("011 AC-16: analysisHref", () => {
  it("AC-16: every link carries the current period AND the current breakdown", () => {
    expect(analysisHref("/analysis", { period: "2026-09", breakdown: "supplier" })).toBe(
      "/analysis?period=2026-09&breakdown=supplier",
    );
  });

  it("AC-16: the default grouping is written too, so one rule covers every link", () => {
    // #10 omitted its default scope because its AC-16 required `/stock-takes` with no
    // query to be a URL the product produces. Here the requirement is the opposite one.
    expect(analysisHref("/analysis", { period: "2026-09", breakdown: "type" })).toBe(
      "/analysis?period=2026-09&breakdown=type",
    );
  });

  it("AC-16: with nothing to carry it is the bare path, and never a trailing question mark", () => {
    expect(analysisHref("/analysis")).toBe("/analysis");
    expect(analysisHref("/analysis", {})).toBe("/analysis");
  });

  it("AC-16: either parameter alone is spelled alone", () => {
    expect(analysisHref("/analysis", { period: "2026-09" })).toBe("/analysis?period=2026-09");
    expect(analysisHref("/analysis", { breakdown: "supplier" })).toBe(
      "/analysis?breakdown=supplier",
    );
  });

  it("AC-16, AC-21: what it writes, the parser reads back - asserted against each other", () => {
    const href = analysisHref("/analysis", { period: "2105-03", breakdown: "supplier" });
    const query = new URLSearchParams(href.slice(href.indexOf("?") + 1));

    expect(parseAnalysisPeriodParam(query.get("period") ?? undefined)).toBe("2105-03");
    expect(parseBreakdownParam(query.get("breakdown") ?? undefined)).toBe("supplier");
  });
});
