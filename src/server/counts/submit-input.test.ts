import { describe, expect, it } from "vitest";

import {
  REOPEN_REASON_REQUIRED,
  REOPEN_REASON_SINGLE_LINE,
  REOPEN_REASON_TOO_LONG,
  SIGNATURE_REQUIRED,
  SIGNATURE_UNREADABLE,
} from "@/lib/count-messages";
import { auditLine, parseAuditLines } from "@/lib/count-audit";
import {
  REOPEN_REASON_MAX_LENGTH,
  parseReopenReason,
  parseSubmitCountInput,
} from "@/server/counts/submit-input";
import { ValidationError } from "@/server/errors";

/**
 * Spec 009 AC-18's `parseReopenReason` half and AC-6's missing-field half, both pure and
 * both in `npm run test:unit` (AC-31).
 */
function refusal(parse: () => unknown): { field: string; message: string } {
  try {
    parse();
  } catch (error) {
    if (error instanceof ValidationError) return { field: error.field, message: error.message };
    throw error;
  }
  throw new Error("the input was accepted");
}

describe("AC-6: parseSubmitCountInput carries one value, and refuses a missing field", () => {
  it("AC-6: a valid path becomes the service's input", () => {
    expect(parseSubmitCountInput("M 10 10 L 20 20")).toEqual({
      signaturePath: "M 10 10 L 20 20",
    });
  });

  it("AC-6: a field absent from the FormData entirely is the same refusal as an empty one", () => {
    // `FormData.get` returns `null` for a field that was never sent.
    expect(refusal(() => parseSubmitCountInput(null))).toEqual({
      field: "signature",
      message: SIGNATURE_REQUIRED,
    });
    expect(refusal(() => parseSubmitCountInput(undefined)).message).toBe(SIGNATURE_REQUIRED);
    expect(refusal(() => parseSubmitCountInput("")).message).toBe(SIGNATURE_REQUIRED);
  });

  it("AC-6: an unreadable path is refused here, not merely at the service", () => {
    expect(refusal(() => parseSubmitCountInput("M 10 10"))).toEqual({
      field: "signature",
      message: SIGNATURE_UNREADABLE,
    });
  });
});

describe("AC-18: parseReopenReason", () => {
  it("AC-18: it trims, and returns what is left", () => {
    expect(parseReopenReason("  the MMA price was wrong  ")).toBe("the MMA price was wrong");
  });

  it("AC-18: nothing typed is refused, whatever shape the nothing has", () => {
    for (const value of ["", "   ", null, undefined]) {
      expect(refusal(() => parseReopenReason(value))).toEqual({
        field: "reason",
        message: REOPEN_REASON_REQUIRED,
      });
    }
  });

  it("AC-18: 200 characters are accepted and 201 are not", () => {
    expect(REOPEN_REASON_MAX_LENGTH).toBe(200);

    const longest = "r".repeat(REOPEN_REASON_MAX_LENGTH);
    expect(parseReopenReason(longest)).toBe(longest);

    expect(refusal(() => parseReopenReason(`${longest}r`))).toEqual({
      field: "reason",
      message: REOPEN_REASON_TOO_LONG,
    });
  });

  it("AC-18: a line break is refused — precisely so it cannot forge a second audit entry", () => {
    for (const value of ["one\ntwo", "one\rtwo", "one\u2028two", "one\u2029two"]) {
      expect(refusal(() => parseReopenReason(value))).toEqual({
        field: "reason",
        message: REOPEN_REASON_SINGLE_LINE,
      });
    }
  });

  it("AC-18, AC-20: a reason that passed can never split its own audit line in two", () => {
    const reason = parseReopenReason("the MMA price was wrong: line 8 of the sheet");

    const notes = auditLine({
      at: "2026-09-12T15:02:44.900Z",
      event: "REOPENED",
      actorName: "Ann Doyle",
      actorRef: "ann@macroads.ie",
      reason,
    });

    expect(notes.split("\n")).toHaveLength(1);
    expect(parseAuditLines(notes)).toEqual([
      {
        at: "2026-09-12T15:02:44.900Z",
        event: "REOPENED",
        actorName: "Ann Doyle",
        actorRef: "ann@macroads.ie",
        reason: "the MMA price was wrong: line 8 of the sheet",
      },
    ]);
  });
});
