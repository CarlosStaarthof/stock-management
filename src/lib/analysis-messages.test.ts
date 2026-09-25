import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ANALYSIS_HEADING,
  BREAKDOWN_LABEL,
  COUNT_STATUS_LABEL,
  GO_TO_STOCK_TAKES,
  INCOMPLETE_TOTAL,
  MINUS_SIGN,
  NEXT_PERIOD,
  NOTHING_HELD_IN_PERIOD,
  NOT_COMPARABLE_PERIOD_INCOMPLETE,
  NOT_COUNTED,
  NO_APPROVED_STOCK_TAKES_YET,
  NO_SUPPLIER,
  PREVIOUS_PERIOD,
  TREND_CHART_TITLE,
  formatFigure,
  formatMonthLabel,
  formatPeriodLabelOf,
  formatVarianceAmount,
  missingYardsMessage,
  notComparableAgainstIncomplete,
  notComparableAgainstMissing,
  unvaluedHeldLinesMessage,
} from "@/lib/analysis-messages";
import {
  COUNT_STATUS_LABEL as COUNT_MESSAGES_STATUS_LABEL,
  NOT_COUNTED as COUNT_MESSAGES_NOT_COUNTED,
  formatMonthLabel as countFormatMonthLabel,
  formatPeriodLabelOf as countFormatPeriodLabelOf,
} from "@/lib/count-messages";
import { NO_SUPPLIER as ITEM_MASTER_NO_SUPPLIER } from "@/lib/item-master-messages";

/**
 * Spec 011 AC-22: every literal a criterion quotes is exported from ONE module, so the
 * screen and the test read the same string and cannot drift apart.
 *
 * THE RE-EXPORTS ARE ASSERTED BY IDENTITY, NOT BY SPELLING. A test that compared
 * `"Not counted"` with `"Not counted"` would pass on the day somebody wrote the sentence
 * out a second time, which is the thing 006 AC-24 exists to prevent.
 */

describe("011 AC-22: the literals #6 and #7 own are re-exported, not restated", () => {
  it("AC-22: the status record is the SAME OBJECT #7 built", () => {
    expect(COUNT_STATUS_LABEL).toBe(COUNT_MESSAGES_STATUS_LABEL);
    expect(COUNT_STATUS_LABEL.SUBMITTED).toBe("Submitted");
    expect(COUNT_STATUS_LABEL.DRAFT).toBe("Draft");
    expect(COUNT_STATUS_LABEL.APPROVED).toBe("Approved");
  });

  it("AC-22: Not counted and No supplier are the same strings, from #7 and #6", () => {
    expect(NOT_COUNTED).toBe(COUNT_MESSAGES_NOT_COUNTED);
    expect(NOT_COUNTED).toBe("Not counted");
    expect(NO_SUPPLIER).toBe(ITEM_MASTER_NO_SUPPLIER);
    expect(NO_SUPPLIER).toBe("No supplier");
  });

  it("AC-22: the two period formatters are #7's functions, not second copies", () => {
    expect(formatMonthLabel).toBe(countFormatMonthLabel);
    expect(formatPeriodLabelOf).toBe(countFormatPeriodLabelOf);
    expect(formatMonthLabel("2026-09")).toBe("September 2026");
    expect(formatPeriodLabelOf({ periodYear: 2026, periodMonth: 9 })).toBe("September 2026");
  });

  it("AC-1: the heading is #3's, verbatim, because role-access.spec.ts asserts it", () => {
    expect(ANALYSIS_HEADING).toBe("Analysis");
  });
});

describe("011 AC-6: a missing month is a gap, and it says which yard", () => {
  it("AC-6: one yard reads has, two yards read have, and both name the period", () => {
    expect(missingYardsMessage(["Clonmel"], "September 2026")).toBe(
      "Clonmel has no approved count for September 2026.",
    );
    expect(missingYardsMessage(["Dublin", "Clonmel"], "September 2026")).toBe(
      "Dublin and Clonmel have no approved count for September 2026.",
    );
  });

  it("AC-6: three yards would still read as a sentence, not as an array", () => {
    expect(missingYardsMessage(["Dublin", "Clonmel", "Cork"], "September 2026")).toBe(
      "Dublin, Clonmel and Cork have no approved count for September 2026.",
    );
  });

  it("AC-6: an incomplete period's TOTAL has its own word, which is not the yard's", () => {
    // Amended 2026-09-24: `total-stock` and every breakdown row's total read this; the yard
    // cells keep `Not counted`. The screen and the tests read it from here (AC-22).
    expect(INCOMPLETE_TOTAL).toBe("Incomplete");
    expect(INCOMPLETE_TOTAL).not.toBe(NOT_COUNTED);
    expect(INCOMPLETE_TOTAL).not.toContain("€");
  });

  it("AC-6: the empty-database state offers one way out and no euro", () => {
    expect(NO_APPROVED_STOCK_TAKES_YET).toBe("No approved stock takes yet.");
    expect(GO_TO_STOCK_TAKES).toBe("Go to Stock Takes");
    expect(NO_APPROVED_STOCK_TAKES_YET).not.toContain("€");
    expect(NOTHING_HELD_IN_PERIOD).toBe("Nothing was held in this period.");
  });
});

describe("011 AC-9: what Analysis owes an unpriced held line", () => {
  it("AC-9: the plural and the singular are both the criterion's sentence", () => {
    expect(unvaluedHeldLinesMessage(3)).toBe("3 held lines have no price and counted as zero.");
    expect(unvaluedHeldLinesMessage(1)).toBe("1 held line has no price and counted as zero.");
    expect(unvaluedHeldLinesMessage(2)).toBe("2 held lines have no price and counted as zero.");
  });
});

describe("011 AC-11, AC-12: the three refusals, each naming a different fact", () => {
  it("AC-11: the selected period, the comparand, and the comparand's absence", () => {
    expect(NOT_COMPARABLE_PERIOD_INCOMPLETE).toBe("Not comparable — this period is incomplete.");
    expect(notComparableAgainstIncomplete("August 2026")).toBe(
      "Not comparable — August 2026 is incomplete.",
    );
    expect(notComparableAgainstMissing("August 2026")).toBe(
      "Not comparable — there is no count for August 2026.",
    );
  });

  it("AC-11: the dash is an em dash, because the criterion quotes one", () => {
    expect(NOT_COMPARABLE_PERIOD_INCOMPLETE).toContain("—");
  });

  it("AC-12: the same three sentences serve year on year, against its own period", () => {
    expect(notComparableAgainstIncomplete("September 2025")).toBe(
      "Not comparable — September 2025 is incomplete.",
    );
    expect(notComparableAgainstMissing("September 2025")).toBe(
      "Not comparable — there is no count for September 2025.",
    );
  });
});

describe("011 AC-7, AC-11: the two ways a figure reaches a screen", () => {
  it("AC-7: a figure is rounded ONCE, here, and never before", () => {
    expect(formatFigure("8880.919482378368")).toBe("€8,880.92");
    expect(formatFigure("15.71775")).toBe("€15.72");
    expect(formatFigure("8896.637232378368")).toBe("€8,896.64");
    // The converse of AC-6: a complete period holding nothing renders a euro sign.
    expect(formatFigure("0")).toBe("€0.00");
  });

  it("AC-11: a fall carries a TRUE MINUS and a rise carries no sign at all", () => {
    expect(formatVarianceAmount("-1234.56")).toBe("−€1,234.56");
    expect(formatVarianceAmount("1234.56")).toBe("€1,234.56");
    expect(MINUS_SIGN).toBe("−");
    // A hyphen at that size reads as a dash between two figures rather than as a sign.
    expect(formatVarianceAmount("-1234.56").startsWith("-")).toBe(false);
  });

  it("AC-11: a zero variance is a zero, with no sign on either side of it", () => {
    expect(formatVarianceAmount("0")).toBe("€0.00");
    expect(formatVarianceAmount("-0.001")).toBe("€0.00");
  });

  it("AC-11: rounding is half away from zero on both sides of zero", () => {
    expect(formatVarianceAmount("2.675")).toBe("€2.68");
    expect(formatVarianceAmount("-2.675")).toBe("−€2.68");
  });
});

describe("011 AC-14, AC-15, AC-16: the remaining literals", () => {
  it("AC-14: the chart's accessible name", () => {
    expect(TREND_CHART_TITLE).toBe("Total stock by period");
  });

  it("AC-15: both groupings are labelled, and there is no third", () => {
    expect(Object.keys(BREAKDOWN_LABEL).sort()).toEqual(["supplier", "type"]);
    expect(BREAKDOWN_LABEL.type).toBe("By type");
    expect(BREAKDOWN_LABEL.supplier).toBe("By supplier");
  });

  it("AC-16: the two jumps keep their label when there is nowhere to jump", () => {
    expect(PREVIOUS_PERIOD).toBe("Previous period");
    expect(NEXT_PERIOD).toBe("Next period");
  });
});

describe("011 AC-22, AC-26: what this module is allowed to contain", () => {
  const source = readFileSync("src/lib/analysis-messages.ts", "utf8");

  it("AC-22: it imports nothing from src/server, so the lint fence stays green", () => {
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/from\s+"[^"]*server/);
  });

  it("AC-26: it names the price column nowhere, in code or in a comment", () => {
    expect(source).not.toContain("unitPrice");
  });
});
