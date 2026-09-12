import { describe, expect, it } from "vitest";

import {
  QUANTITY_INVALID,
  SAVE_HAS_NO_EDITS,
  SAVE_HAS_TOO_MANY_EDITS,
  SAVE_REQUEST_INVALID,
} from "@/lib/count-messages";
import {
  parseCountDateOrDefault,
  parseMonthKeyParam,
  parseSaveQuantitiesBody,
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

/* ------------------------------------------------ 008 AC-10: the endpoint's body */

/** The `ValidationError` a body must be refused with, or a failure naming the body. */
function refusalFor(raw: unknown): ValidationError {
  try {
    parseSaveQuantitiesBody(raw);
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error(`${JSON.stringify(raw)} was accepted`);
}

describe("008 AC-10: parseSaveQuantitiesBody", () => {
  it("008 AC-10: a well-formed body becomes canonical edits, in the order sent", () => {
    const edits = parseSaveQuantitiesBody({
      edits: [
        { itemId: "item_a", quantity: "12.5" },
        { itemId: "item_b", quantity: null },
        { itemId: "item_c", quantity: "0" },
        { itemId: " item_d ", quantity: "21,6128" },
      ],
    });

    expect(edits).toEqual([
      { itemId: "item_a", quantity: "12.5" },
      { itemId: "item_b", quantity: null },
      { itemId: "item_c", quantity: "0" },
      { itemId: "item_d", quantity: "21.6128" },
    ]);
  });

  it("008 AC-5: an empty string is not counted, and is not a zero", () => {
    const edits = parseSaveQuantitiesBody({ edits: [{ itemId: "item_a", quantity: "" }] });

    expect(edits).toEqual([{ itemId: "item_a", quantity: null }]);
    expect(edits[0].quantity).not.toBe("0");
  });

  it("008 AC-10: a quantity that is a JSON number is refused, never converted", () => {
    // `docs/architecture.md` § Money and quantities: a quantity crosses this boundary as a
    // decimal string. A float round trip is where `21.6128` goes to be lost.
    const refusal = refusalFor({ edits: [{ itemId: "item_a", quantity: 12.5 }] });

    expect(refusal.message).toBe(SAVE_REQUEST_INVALID);
    expect(refusal.field).toBe("edits");
  });

  it("008 AC-10: a body that is not the documented shape is refused", () => {
    for (const raw of [
      null,
      undefined,
      "edits",
      42,
      [],
      {},
      { edits: "all of them" },
      { edits: {} },
      { edits: [{ itemId: 7, quantity: "1" }] },
      { edits: [{ itemId: "", quantity: "1" }] },
      { edits: [{ itemId: "item_a" }] },
      { edits: [{ quantity: "1" }] },
    ]) {
      expect(refusalFor(raw).message, JSON.stringify(raw) ?? "undefined").toBe(
        SAVE_REQUEST_INVALID,
      );
    }
  });

  it("008 AC-10, AC-19: an unknown extra key is refused rather than ignored", () => {
    // A body carrying an identity is a forged body. It is refused outright, so there is no
    // question of the key having been honoured (AC-19).
    expect(refusalFor({ edits: [], role: "ADMIN" }).message).toBeTruthy();
    expect(
      refusalFor({ edits: [{ itemId: "item_a", quantity: "1" }], role: "ADMIN" }).message,
    ).toBe(SAVE_REQUEST_INVALID);
    expect(
      refusalFor({ edits: [{ itemId: "item_a", quantity: "1", note: "x" }] }).message,
    ).toBe(SAVE_REQUEST_INVALID);
    expect(
      refusalFor({
        edits: [{ itemId: "item_a", quantity: "1" }],
        userId: "user_admin",
      }).message,
    ).toBe(SAVE_REQUEST_INVALID);
  });

  it("008 AC-10: a save carries between 1 and 200 edits", () => {
    expect(refusalFor({ edits: [] }).message).toBe(SAVE_HAS_NO_EDITS);

    const many = Array.from({ length: 201 }, (_unused, index) => ({
      itemId: `item_${index}`,
      quantity: "1",
    }));
    expect(refusalFor({ edits: many }).message).toBe(SAVE_HAS_TOO_MANY_EDITS);

    // The boundary itself is accepted: 200 is a ceiling, not a refusal.
    expect(parseSaveQuantitiesBody({ edits: many.slice(0, 200) })).toHaveLength(200);
  });

  it("008 AC-7: a bad quantity is the parser's own sentence, naming the field", () => {
    const refusal = refusalFor({
      edits: [
        { itemId: "item_a", quantity: "12.5" },
        { itemId: "item_b", quantity: "21.61285" },
      ],
    });

    expect(refusal.message).toBe(QUANTITY_INVALID);
    expect(refusal.field).toBe("quantity");
  });

  it("008 AC-27: no refusal carries a Zod, Prisma or Postgres string", () => {
    for (const raw of [null, { edits: [] }, { edits: [{ itemId: "a", quantity: 1 }] }]) {
      const message = refusalFor(raw).message;

      for (const forbidden of ["Zod", "zod", "expected", "prisma", "Prisma", "SQLSTATE"]) {
        expect(message, forbidden).not.toContain(forbidden);
      }
    }
  });
});
