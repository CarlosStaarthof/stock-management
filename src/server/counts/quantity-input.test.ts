import { describe, expect, it } from "vitest";

import {
  QUANTITY_INVALID,
  QUANTITY_NEGATIVE,
  QUANTITY_TOO_LARGE,
} from "@/lib/count-messages";
import { QUANTITY_PATTERN, parseQuantity } from "@/server/counts/quantity-input";
import { ValidationError } from "@/server/errors";

/**
 * Spec 008 AC-7, in full, with no database (AC-32): the quantity parser is pure, it
 * refuses rather than rounds, and both transports call this one function.
 */

/** The error a refusal must be, with the field a form needs to place the sentence. */
function refusalFor(raw: string): ValidationError {
  try {
    parseQuantity(raw);
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error(`parseQuantity(${JSON.stringify(raw)}) was accepted`);
}

describe("AC-7: what a counted row may hold", () => {
  it("AC-7: an empty input is not counted, and is never a zero", () => {
    // The feature, in one assertion: `""` is `null`, and `null` is not `0` (AC-4, AC-5).
    expect(parseQuantity("")).toBeNull();
    expect(parseQuantity("   ")).toBeNull();
    expect(parseQuantity(null)).toBeNull();
    expect(parseQuantity(undefined)).toBeNull();

    expect(parseQuantity("0")).toBe("0");
    expect(parseQuantity("0")).not.toBeNull();
  });

  it("AC-7: the workbook's own numbers survive unchanged", () => {
    // `21.6128` tonnes and `0.475` units are real rows of the file this replaces.
    expect(parseQuantity("21.6128")).toBe("21.6128");
    expect(parseQuantity("0.475")).toBe("0.475");
    expect(parseQuantity("9.83")).toBe("9.83");
    expect(parseQuantity("82")).toBe("82");
  });

  it("AC-7: a decimal comma is accepted and normalised", () => {
    expect(parseQuantity("21,6128")).toBe("21.6128");
    expect(parseQuantity("0,475")).toBe("0.475");
  });

  it("AC-7: surrounding whitespace is not part of the number", () => {
    expect(parseQuantity(" 9.83 ")).toBe("9.83");
    expect(parseQuantity("\t12.5\n")).toBe("12.5");
  });

  it("AC-7: the same number typed two ways canonicalises to one string", () => {
    // So a queued edit, a sent edit and a stored edit compare as one value (AC-14).
    expect(parseQuantity("007")).toBe("7");
    expect(parseQuantity("1.5000")).toBe("1.5");
    expect(parseQuantity("0.0")).toBe("0");
    expect(parseQuantity("00.50")).toBe("0.5");
  });

  it("AC-7: the widest value Decimal(12, 4) holds is accepted", () => {
    expect(parseQuantity("99999999.9999")).toBe("99999999.9999");
  });
});

describe("AC-7: what it refuses, and in whose words", () => {
  it("AC-7: five decimal places are refused, never rounded", () => {
    // specs/product-brief.md says never round. Decimal(12, 4) would round it silently,
    // which is the drift this product exists to remove.
    const refusal = refusalFor("21.61285");

    expect(refusal.message).toBe(QUANTITY_INVALID);
    expect(refusal.field).toBe("quantity");
    expect(() => parseQuantity("21.61285")).toThrow(ValidationError);
  });

  it("AC-7: anything that is not a number is refused with one sentence", () => {
    for (const raw of ["abc", "1e3", "1.2.3", "+1", "1 2", "21.61285"]) {
      const refusal = refusalFor(raw);

      expect(refusal.message, raw).toBe(QUANTITY_INVALID);
      expect(refusal.field, raw).toBe("quantity");
    }
  });

  it("AC-7: a negative quantity is told about the minus sign", () => {
    for (const raw of ["-1", "-0.5"]) {
      const refusal = refusalFor(raw);

      expect(refusal.message, raw).toBe(QUANTITY_NEGATIVE);
      expect(refusal.field, raw).toBe("quantity");
    }
  });

  it("AC-7, AC-27: a value wider than the column is refused before Postgres sees it", () => {
    for (const raw of ["100000000", "1234567890"]) {
      const refusal = refusalFor(raw);

      expect(refusal.message, raw).toBe(QUANTITY_TOO_LARGE);
      expect(refusal.field, raw).toBe("quantity");
    }
  });

  it("AC-27: no refusal carries a driver or a Postgres string", () => {
    for (const raw of ["abc", "21.61285", "100000000", "-1"]) {
      const message = refusalFor(raw).message;

      for (const forbidden of ["prisma", "Prisma", "SQLSTATE", "22003", "numeric field overflow"]) {
        expect(message, `${raw} / ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});

describe("AC-7: the pattern is the one the client will use too", () => {
  it("AC-7: it accepts a canonical quantity and rejects a sign or an exponent", () => {
    expect(QUANTITY_PATTERN.test("0")).toBe(true);
    expect(QUANTITY_PATTERN.test("21.6128")).toBe(true);

    expect(QUANTITY_PATTERN.test("-1")).toBe(false);
    expect(QUANTITY_PATTERN.test("1e3")).toBe(false);
    expect(QUANTITY_PATTERN.test("21.61285")).toBe(false);
    expect(QUANTITY_PATTERN.test("")).toBe(false);
  });

  it("AC-7: it is not sticky, so two tests in a row see the same answer", () => {
    // A /g or /y regex used with .test() carries lastIndex between calls, and the second
    // call then disagrees with the first for no reason a reader can see.
    expect(QUANTITY_PATTERN.flags).toBe("");
    expect(QUANTITY_PATTERN.test("12.5")).toBe(true);
    expect(QUANTITY_PATTERN.test("12.5")).toBe(true);
  });
});
