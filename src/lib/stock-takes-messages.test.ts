import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import * as countMessages from "@/lib/count-messages";
import * as stockTakes from "@/lib/stock-takes-messages";

/**
 * Spec 010 AC-18: the strings are single-sourced BY RE-EXPORT, and the assertion is
 * IDENTITY rather than spelling — a test that compared the two spellings would pass on the
 * day someone copied the sentence, which is the failure it exists to catch.
 */
describe("AC-18: the literals #7 owns are re-exported, not restated", () => {
  it("AC-18: the status-label record is the SAME OBJECT as COUNT_STATUS_LABEL", () => {
    expect(stockTakes.COUNT_STATUS_LABEL).toBe(countMessages.COUNT_STATUS_LABEL);
  });

  it("AC-18: the two empty-state sentences are the same strings #7 exports", () => {
    expect(stockTakes.NO_COUNTS_RECORDED_YET).toBe(countMessages.NO_COUNTS_RECORDED_YET);
    expect(stockTakes.NO_COUNTS_IN_MONTH).toBe(countMessages.NO_COUNTS_IN_MONTH);

    // And they still say what the criteria quote.
    expect(stockTakes.NO_COUNTS_RECORDED_YET).toBe("No stock counts recorded yet.");
    expect(stockTakes.NO_COUNTS_IN_MONTH).toBe("No counts in this month.");
  });

  it("AC-18: every other re-export is identical to its source, by reference", () => {
    expect(stockTakes.NOT_COUNTED).toBe(countMessages.NOT_COUNTED);
    expect(stockTakes.NO_UNIT).toBe(countMessages.NO_UNIT);
    expect(stockTakes.START_A_COUNT).toBe(countMessages.START_A_COUNT);
    expect(stockTakes.BACK_TO_THE_CALENDAR).toBe(countMessages.BACK_TO_THE_CALENDAR);
    expect(stockTakes.COUNT_NO_LONGER_EXISTS).toBe(countMessages.COUNT_NO_LONGER_EXISTS);
    expect(stockTakes.PREVIOUS_MONTH).toBe(countMessages.PREVIOUS_MONTH);
    expect(stockTakes.NEXT_MONTH).toBe(countMessages.NEXT_MONTH);
    expect(stockTakes.TODAY).toBe(countMessages.TODAY);
    expect(stockTakes.formatMonthLabel).toBe(countMessages.formatMonthLabel);
    expect(stockTakes.formatDayLabel).toBe(countMessages.formatDayLabel);
    expect(stockTakes.facetOptionLabel).toBe(countMessages.facetOptionLabel);
  });

  it("AC-18: the re-exported formatters still answer what the criteria quote", () => {
    expect(stockTakes.formatMonthLabel("2026-09")).toBe("September 2026");
    expect(stockTakes.formatDayLabel("2026-09-01")).toBe("1 September 2026");
    expect(stockTakes.facetOptionLabel("Dublin", 4)).toBe("Dublin (4)");
    expect(stockTakes.COUNT_STATUS_LABEL.DRAFT).toBe("Draft");
    expect(stockTakes.NOT_COUNTED).toBe("Not counted");
    expect(stockTakes.NO_UNIT).toBe("No unit");
  });
});

describe("AC-18: this feature's own literals, asserted from the module", () => {
  it("AC-1: the heading is exactly the one #3 shipped and role-access.spec.ts asserts", () => {
    expect(stockTakes.STOCK_TAKES_HEADING).toBe("Stock Takes");
  });

  it("AC-6: the third scope option is `Both`, and it is a scope", () => {
    expect(stockTakes.BOTH_YARDS).toBe("Both");
    expect(stockTakes.facetOptionLabel(stockTakes.BOTH_YARDS, 3)).toBe("Both (3)");
  });

  it("AC-11: the two jumps are labelled `Previous count` and `Next count`", () => {
    expect(stockTakes.PREVIOUS_COUNT).toBe("Previous count");
    expect(stockTakes.NEXT_COUNT).toBe("Next count");
  });

  it("AC-9: the hidden summary is the sentence the criterion quotes, for 35 of 82", () => {
    expect(stockTakes.notHeldSummary(35, 82)).toBe(
      "35 of 82 items are not held and are hidden.",
    );
    expect(stockTakes.SHOW_ALL_ITEMS).toBe("Show all items");
    expect(stockTakes.SHOW_HELD_ONLY).toBe("Show held only");
  });

  it("UI states: the count with nothing held names the yard and the period", () => {
    expect(stockTakes.noItemsHeld("Dublin", "September 2026")).toBe(
      "No items were held at Dublin in September 2026.",
    );
  });

  it("AC-15: the one link into #9's tree has the label the criterion quotes", () => {
    expect(stockTakes.OPEN_IN_STOCK_ENTRY).toBe("Open this count in Stock Entry");
  });
});

describe("AC-12, AC-18: the module is money-free and server-free", () => {
  const source = readFileSync("src/lib/stock-takes-messages.ts", "utf8");

  it("AC-12: no exported value carries a currency symbol or a monetary word", () => {
    for (const [name, value] of Object.entries(stockTakes)) {
      if (typeof value !== "string") continue;

      expect(value, name).not.toContain("€");
      expect(name).not.toMatch(/price|value|total|amount/i);
    }
  });

  it("AC-12: the built sentences carry no euro either", () => {
    const built = [
      stockTakes.notHeldSummary(35, 82),
      stockTakes.noItemsHeld("Dublin", "September 2026"),
      stockTakes.facetOptionLabel("Clonmel", 2),
    ];

    for (const sentence of built) expect(sentence).not.toContain("€");
  });

  it("006 AC-31, AC-18: it names no price column and imports nothing from src/server", () => {
    expect(source).not.toContain("unitPrice");

    const imports = [...source.matchAll(/from "([^"]+)"/g)].map((match) => match[1]);
    expect(imports).toEqual(["@/lib/count-messages"]);
  });
});

describe("countedBy", () => {
  it("AC-8, AC-13: the label and the name are ONE string, built from the label", () => {
    expect(stockTakes.countedBy("Aisling")).toBe("Counted by Aisling");
    expect(stockTakes.countedBy("Aisling").startsWith(stockTakes.COUNTED_BY_LABEL)).toBe(true);

    // The reason it exists rather than being composed in the page: three React children
    // make the server emit an `<!-- -->` separator that hydration removes, and AC-13
    // compares the two sessions' bodies byte for byte.
    expect(stockTakes.countedBy("Aisling")).not.toContain("<!--");
  });
});
