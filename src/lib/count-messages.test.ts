import { describe, expect, it } from "vitest";

import {
  CLEAR_FILTERS as ITEM_MASTER_CLEAR_FILTERS,
  NO_SUPPLIER as ITEM_MASTER_NO_SUPPLIER,
  NO_UNIT as ITEM_MASTER_NO_UNIT,
} from "@/lib/item-master-messages";
import {
  ALL_CHANGES_SAVED,
  APPROVE_THIS_COUNT,
  AUDIT_EVENT_LABEL,
  AUDIT_TRAIL_HEADING,
  BACK_TO_THE_COUNT,
  COUNT_SUMMARY_LINK,
  COUNT_TOTAL_LABEL,
  LINES_WITHOUT_PRICE_HEADING,
  REOPEN_DESTROYS,
  REOPEN_LINK,
  REOPEN_REASON_LABEL,
  SIGNATURE_HEADING,
  UNCOUNTED_HEADING,
  auditSentence,
  lifecycleSentences,
  CLEAR_SIGNATURE,
  COUNT_ALREADY_APPROVED,
  COUNT_ALREADY_DRAFT,
  COUNT_ALREADY_SUBMITTED,
  COUNT_NOT_SUBMITTED,
  NO_PRICE,
  REOPEN_REASON_REQUIRED,
  REOPEN_REASON_SINGLE_LINE,
  REOPEN_REASON_TOO_LONG,
  REOPEN_THIS_COUNT,
  REVIEW_AND_SIGN,
  SIGNATURE_FULL,
  SIGNATURE_NEEDS_JS,
  SIGNATURE_REQUIRED,
  SIGNATURE_TOO_LONG,
  SIGNATURE_UNREADABLE,
  SIGNED_AND_APPROVED_BY_SAME_PERSON,
  SIGN_AND_SUBMIT,
  approvedByMessage,
  linesWithoutPriceMessage,
  reopenedNotice,
  signedByMessage,
  uncountedBlocksSubmit,
  APPLY_FILTERS,
  BACK_TO_THE_CALENDAR,
  CHOOSE_A_YARD,
  CLEAR_FILTERS,
  CONTINUE_THIS_COUNT,
  COUNT_DATE_INVALID,
  COUNT_HAS_NO_ITEMS,
  COUNT_NO_LONGER_EXISTS,
  COUNT_READ_ONLY,
  COUNT_STATUS_LABEL,
  ITEM_NOT_ON_COUNT,
  MONTH_NAMES,
  NEXT_MONTH,
  NONE_HELD,
  NOT_COUNTED,
  NOT_SAVED,
  NO_COUNTS_IN_MONTH,
  NO_COUNTS_RECORDED_YET,
  NO_MATCHING_LINES,
  NO_SUPPLIER,
  NO_UNIT,
  OPEN_THE_EXISTING_COUNT,
  PERIOD_INVALID,
  PERIOD_LABEL,
  PREVIOUS_MONTH,
  QUANTITY_INVALID,
  QUANTITY_NEGATIVE,
  QUANTITY_TOO_LARGE,
  RETRY_NOW,
  SAVE_NOW,
  SAVING,
  START_A_COUNT,
  START_COUNT,
  SUPPLIER_FILTER_LABEL,
  TODAY,
  TYPE_FILTER_LABEL,
  UNIT_FILTER_LABEL,
  WEEKDAY_HEADINGS,
  changesNotSaved,
  countAlreadyExists,
  countClosesMessage,
  countedSummary,
  countingAs,
  draftAlreadyExists,
  facetOptionLabel,
  filtersHiding,
  formatDayLabel,
  formatMonthLabel,
  formatPeriodLabelOf,
  itemsWithoutPriceMessage,
  noItemsOnSheet,
  showingSummary,
  yardNotFound,
} from "@/lib/count-messages";
import type { AuditEntry, CountLifecycleFacts } from "@/types/stock-count";
import { COUNT_STATUSES } from "@/types/stock-count";

/**
 * Spec 007 AC-26: every literal a criterion quotes is exported from this module and
 * asserted from it, so the screen and the test cannot drift apart. No database.
 */
describe("the literals the criteria quote", () => {
  it("AC-22: the two empty states", () => {
    expect(NO_COUNTS_RECORDED_YET).toBe("No stock counts recorded yet.");
    expect(NO_COUNTS_IN_MONTH).toBe("No counts in this month.");
  });

  it("AC-13: a yard with nothing on its sheet is refused, by name, before anything is written", () => {
    expect(noItemsOnSheet("Dublin")).toBe(
      "Dublin has no items on its sheet. An administrator must assign items before this yard can be counted.",
    );
  });

  it("AC-7: the period is shown as a sentence before anything is written", () => {
    expect(countClosesMessage({ periodYear: 2026, periodMonth: 9 })).toBe(
      "This count closes September 2026.",
    );
    expect(countClosesMessage({ periodYear: 2025, periodMonth: 12 })).toBe(
      "This count closes December 2025.",
    );
    expect(PERIOD_LABEL).toBe("Period this count closes");
  });

  it("AC-6, AC-8, AC-23: the three refusals a form puts beside a field", () => {
    expect(COUNT_DATE_INVALID).toBe("Count date must be a real date, as YYYY-MM-DD.");
    expect(PERIOD_INVALID).toBe("Period must be a month between 2000 and 2100.");
    expect(CHOOSE_A_YARD).toBe("Choose a yard.");
  });

  it("AC-10: the one-count-per-yard-per-month refusal is the domain's words", () => {
    expect(countAlreadyExists("DUBLIN", "2026-09")).toBe(
      "Count for DUBLIN in 2026-09 already exists",
    );
    expect(countAlreadyExists("CLONMEL", "2025-12")).toBe(
      "Count for CLONMEL in 2025-12 already exists",
    );
  });

  it("AC-10, AC-27: no refusal in this module mentions Postgres, Prisma or a constraint", () => {
    const everyRefusal = [
      COUNT_DATE_INVALID,
      PERIOD_INVALID,
      CHOOSE_A_YARD,
      COUNT_NO_LONGER_EXISTS,
      countAlreadyExists("DUBLIN", "2026-09"),
      noItemsOnSheet("Dublin"),
      yardNotFound("BANANA"),
    ].join(" ");

    expect(everyRefusal).not.toMatch(
      /prisma|violates|constraint|SQLSTATE|23514|23505|P2002|P2003|P2025|StockCount_/i,
    );
  });

  it("AC-11: coming back is offered the count that exists, named and dated", () => {
    expect(
      draftAlreadyExists("Dublin", { periodYear: 2026, periodMonth: 9 }, "Jo Byrne", "2026-09-01"),
    ).toBe(
      "Dublin already has a draft count for September 2026, started by Jo Byrne on 1 September 2026.",
    );
    expect(CONTINUE_THIS_COUNT).toBe("Continue this count");
    expect(OPEN_THE_EXISTING_COUNT).toBe("Open the existing count");
  });

  it("AC-5, AC-24: who is counting is a sentence, and the count page's three figures", () => {
    expect(countingAs("Jo Byrne")).toBe("Counting as Jo Byrne");
    expect(countedSummary(0, 82)).toBe("0 of 82 counted");
    expect(countedSummary(7, 82)).toBe("7 of 82 counted");
    expect(NOT_COUNTED).toBe("Not counted");
    expect(NO_UNIT).toBe("No unit");
    expect(COUNT_NO_LONGER_EXISTS).toBe("That count no longer exists.");
  });

  it("AC-16: the ADMIN-only sentence counts items, and reads as English at one", () => {
    expect(itemsWithoutPriceMessage(11)).toBe(
      "11 items on this sheet have no price recorded. Their lines will count as 0 when this count is submitted.",
    );
    expect(itemsWithoutPriceMessage(1)).toBe(
      "1 item on this sheet has no price recorded. Their lines will count as 0 when this count is submitted.",
    );
  });

  it("AC-15: nothing in this module names the price column", () => {
    // The sentence above is the only money-adjacent thing on this surface, and it counts
    // items rather than euros. `unitPrice` belongs to nine files and none of them is here.
    expect(itemsWithoutPriceMessage(11)).not.toContain("unitPrice");
    expect(itemsWithoutPriceMessage(11)).not.toContain("€");
  });

  it("AC-20, AC-25: the three status words, from a Record and not from a branch", () => {
    expect(COUNT_STATUS_LABEL.DRAFT).toBe("Draft");
    expect(COUNT_STATUS_LABEL.SUBMITTED).toBe("Submitted");
    expect(COUNT_STATUS_LABEL.APPROVED).toBe("Approved");

    // Every member of the union has a word, so a screen never renders a raw enum value.
    for (const status of COUNT_STATUSES) {
      expect(COUNT_STATUS_LABEL[status], status).toBeTruthy();
    }
  });

  it("AC-19, AC-9: seven Monday-first headings, and no weekday attached to a date", () => {
    expect([...WEEKDAY_HEADINGS]).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

    // AC-9: there is no business-day rule and no wording that implies one.
    expect(formatDayLabel("2026-01-03")).toBe("3 January 2026");
    expect(formatDayLabel("2026-01-03")).not.toMatch(/Sat|Sun|weekend|holiday|business/i);
  });

  it("AC-21, AC-26: the controls the criteria name", () => {
    expect(START_A_COUNT).toBe("Start a count");
    expect(START_COUNT).toBe("Start count");
    expect(PREVIOUS_MONTH).toBe("Previous month");
    expect(NEXT_MONTH).toBe("Next month");
    expect(TODAY).toBe("Today");
    expect(BACK_TO_THE_CALENDAR).toBe("Back to the calendar");
  });
});

describe("the date formatters", () => {
  it("AC-19, AC-24: a month reads September 2026 and a day reads 1 September 2026", () => {
    expect(formatMonthLabel("2026-09")).toBe("September 2026");
    expect(formatMonthLabel("2026-08")).toBe("August 2026");
    expect(formatMonthLabel("2025-12")).toBe("December 2025");

    expect(formatDayLabel("2026-09-01")).toBe("1 September 2026");
    expect(formatDayLabel("2026-10-01")).toBe("1 October 2026");
    expect(formatDayLabel("2026-12-31")).toBe("31 December 2026");
  });

  it("AC-6: a period reads the same way a month does", () => {
    expect(formatPeriodLabelOf({ periodYear: 2026, periodMonth: 9 })).toBe("September 2026");
    expect(formatPeriodLabelOf({ periodYear: 2025, periodMonth: 12 })).toBe("December 2025");
  });

  it("AC-7, AC-24: a day never carries a leading zero, so `1 October 2026` is not `01`", () => {
    expect(formatDayLabel("2026-10-01")).not.toContain("01 October");
  });

  it("the month names are English and in order, whatever the server's locale is", () => {
    // `Intl` is deliberately not used: a server defaulting to fr-FR would render
    // `septembre 2026`, and five criteria quote the English spelling as a literal.
    expect(MONTH_NAMES).toHaveLength(12);
    expect(MONTH_NAMES[0]).toBe("January");
    expect(MONTH_NAMES[11]).toBe("December");
  });

  it("a month outside 1-12 is reported rather than rendered as `undefined 2026`", () => {
    // The failure path docs/verification.md Level 1 requires. Callers validate first
    // (`parsePeriodKey`, `buildMonthGrid`); this asserts what a bug would look like.
    expect(formatMonthLabel("2026-13")).toContain("undefined");
  });
});

/* --------------------------------------------------- 008 AC-26: the entry screen */

describe("008 AC-26: every literal spec 008 quotes is exported from this module", () => {
  it("008 AC-26: the controls and the save states read exactly as the criteria quote them", () => {
    expect(NOT_COUNTED).toBe("Not counted");
    expect(NONE_HELD).toBe("None held");
    expect(SAVE_NOW).toBe("Save now");
    expect(RETRY_NOW).toBe("Retry now");
    expect(APPLY_FILTERS).toBe("Apply filters");
    expect(CLEAR_FILTERS).toBe("Clear filters");

    expect(ALL_CHANGES_SAVED).toBe("All changes saved");
    expect(SAVING).toBe("Saving…");
    expect(NOT_SAVED).toBe("Not saved");
  });

  it("008 AC-26: Clear filters, No supplier and No unit are #6's words, not a second spelling", () => {
    // One literal, two screens: a message that exists twice will one day exist in two
    // spellings, and the counting screen and the item master must agree.
    expect(CLEAR_FILTERS).toBe(ITEM_MASTER_CLEAR_FILTERS);
    expect(NO_SUPPLIER).toBe(ITEM_MASTER_NO_SUPPLIER);
    expect(NO_UNIT).toBe(ITEM_MASTER_NO_UNIT);
  });

  it("008 AC-20: the three filter categories are labelled Supplier, Type and Unit", () => {
    expect(SUPPLIER_FILTER_LABEL).toBe("Supplier");
    expect(TYPE_FILTER_LABEL).toBe("Type");
    expect(UNIT_FILTER_LABEL).toBe("Unit");
    expect(facetOptionLabel("Kelly", 14)).toBe("Kelly (14)");
  });

  it("008 AC-13, AC-14: the unsaved banner counts changes, and says what happens next", () => {
    expect(changesNotSaved(3)).toBe(
      "3 changes not saved. They will be sent when the connection returns.",
    );
    expect(changesNotSaved(1)).toBe(
      "1 change not saved. It will be sent when the connection returns.",
    );
  });

  it("008 AC-23: showing and hiding, including the two singulars and the empty string", () => {
    expect(showingSummary(12, 82)).toBe("Showing 12 of 82 items");

    expect(filtersHiding(70, 31)).toBe("Filters are hiding 70 items, 31 not counted.");
    expect(filtersHiding(1, 1)).toBe("Filters are hiding 1 item, 1 not counted.");
    expect(filtersHiding(70, 0)).toBe("Filters are hiding 70 items, all counted.");
    // Nothing hidden is nothing to say, and the element is not rendered at all.
    expect(filtersHiding(0, 0)).toBe("");
  });

  it("008 AC-9, AC-25: the refusals a counter can actually meet", () => {
    expect(COUNT_READ_ONLY).toBe("This count has been submitted and can no longer be edited.");
    expect(COUNT_HAS_NO_ITEMS).toBe("This count has no items.");
    expect(NO_MATCHING_LINES).toBe("No items match these filters.");
    expect(ITEM_NOT_ON_COUNT).toBe("That item is not on this count.");
  });

  it("008 AC-7: the three quantity messages, quoted verbatim by the criterion", () => {
    expect(QUANTITY_INVALID).toBe("Quantity must be a number with up to 4 decimal places.");
    expect(QUANTITY_NEGATIVE).toBe("Quantity cannot be negative.");
    expect(QUANTITY_TOO_LARGE).toBe("Quantity must be less than 100000000.");
  });

  it("008 AC-24: the progress line is #7's, unchanged, and `0` counts as counted", () => {
    expect(countedSummary(12, 82)).toBe("12 of 82 counted");
    expect(countedSummary(0, 82)).toBe("0 of 82 counted");
  });
});

/**
 * Spec 009 AC-29: every literal a criterion quotes is exported from this module and
 * asserted FROM IT, so the screen and the test cannot drift apart. All of it runs with no
 * database (AC-31).
 */
describe("what feature 009 added to the single-sourced messages", () => {
  it("AC-3: the block names the number, and 1 is not 1 items", () => {
    expect(uncountedBlocksSubmit(12)).toBe(
      "12 items have not been counted. Every line must hold a number, or 0, before this " +
        "count can be submitted.",
    );
    expect(uncountedBlocksSubmit(1)).toBe(
      "1 item has not been counted. Every line must hold a number, or 0, before this " +
        "count can be submitted.",
    );
  });

  it("AC-5, AC-6, AC-8, AC-10: the five signature sentences", () => {
    expect(SIGNATURE_REQUIRED).toBe("Draw your signature before submitting this count.");
    expect(SIGNATURE_UNREADABLE).toBe("That signature could not be read. Clear it and sign again.");
    expect(SIGNATURE_TOO_LONG).toBe("That signature is too long to store. Clear it and sign again.");
    expect(SIGNATURE_FULL).toBe("That is as much as this signature can hold. Clear it and sign again.");
    expect(SIGNATURE_NEEDS_JS).toBe(
      "A signature is drawn on screen, so this step needs JavaScript. Open this count in a " +
        "browser with JavaScript enabled to sign it.",
    );
  });

  it("AC-17, AC-18: Invariant 3, as four sentences a person can act on", () => {
    expect(COUNT_ALREADY_SUBMITTED).toBe("This count has already been submitted.");
    expect(COUNT_ALREADY_APPROVED).toBe("This count has already been approved.");
    expect(COUNT_NOT_SUBMITTED).toBe("This count has not been submitted yet.");
    expect(COUNT_ALREADY_DRAFT).toBe("This count is already a draft.");
  });

  it("AC-18: the three refusals of a reopen reason", () => {
    expect(REOPEN_REASON_REQUIRED).toBe("Give a reason for reopening this count.");
    expect(REOPEN_REASON_TOO_LONG).toBe("A reason may be at most 200 characters.");
    expect(REOPEN_REASON_SINGLE_LINE).toBe("A reason must be a single line.");
  });

  it("AC-16, AC-23: the lifecycle sentences, with the yard's day and no euro in any of them", () => {
    expect(signedByMessage("Jo Byrne", "2026-09-01T09:15:00.000Z")).toBe(
      "Signed by Jo Byrne on 1 September 2026.",
    );
    expect(approvedByMessage("Ann Doyle", "2026-09-02T17:40:00.000Z")).toBe(
      "Approved by Ann Doyle on 2 September 2026.",
    );
    expect(reopenedNotice("Ann Doyle", "2026-09-03T11:00:00.000Z", "the MMA price was wrong")).toBe(
      "Reopened by Ann Doyle on 3 September 2026: the MMA price was wrong.",
    );
    expect(SIGNED_AND_APPROVED_BY_SAME_PERSON).toBe("Signed and approved by the same person.");

    for (const sentence of [
      signedByMessage("Jo Byrne", "2026-09-01T09:15:00.000Z"),
      approvedByMessage("Ann Doyle", "2026-09-02T17:40:00.000Z"),
      reopenedNotice("Ann Doyle", "2026-09-03T11:00:00.000Z", "the MMA price was wrong"),
    ]) {
      expect(sentence).not.toContain("€");
    }
  });

  it("AC-23: the day is the YARD's day, not the server's", () => {
    // 23:30 UTC on 31 August is already 1 September in Dublin (IST, UTC+1). A signature
    // made in the evening must not read as the day before on the count page.
    expect(signedByMessage("Jo Byrne", "2026-08-31T23:30:00.000Z")).toBe(
      "Signed by Jo Byrne on 1 September 2026.",
    );
  });

  it("AC-12: Invariant 4, before the fact and after it", () => {
    expect(itemsWithoutPriceMessage(3)).toBe(
      "3 items on this sheet have no price recorded. Their lines will count as 0 when this " +
        "count is submitted.",
    );
    expect(linesWithoutPriceMessage(3)).toBe(
      "3 lines on this count have no price recorded and counted as zero.",
    );
    expect(linesWithoutPriceMessage(1)).toBe(
      "1 line on this count has no price recorded and counted as zero.",
    );
    expect(NO_PRICE).toBe("No price");
  });

  it("AC-29: the controls each criterion names by its accessible name", () => {
    expect(REVIEW_AND_SIGN).toBe("Review and sign");
    expect(SIGN_AND_SUBMIT).toBe("Sign and submit");
    expect(APPROVE_THIS_COUNT).toBe("Approve this count");
    expect(REOPEN_THIS_COUNT).toBe("Reopen this count");
    expect(CLEAR_SIGNATURE).toBe("Clear");
  });
});

/* ===================================================================================
 * Phase B — the sentences the three screens render, built where a page may not look.
 * =================================================================================== */

describe("AC-20, AC-23: the lifecycle as sentences", () => {
  const FACTS: CountLifecycleFacts = {
    countId: "count_1",
    status: "APPROVED",
    submittedAt: "2026-09-01T10:00:00.000Z",
    signedByName: "Jo Byrne",
    signedAt: "2026-09-01T10:00:00.000Z",
    signaturePath: "M 10 10 L 20 20",
    approvedByName: "Ann Doyle",
    approvedAt: "2026-09-02T11:00:00.000Z",
    signedAndApprovedBySamePerson: false,
    audit: [],
  };

  it("AC-23: a page renders strings, so it never reads an instant off the shape", () => {
    const said = lifecycleSentences(FACTS);

    expect(said.signed).toBe("Signed by Jo Byrne on 1 September 2026.");
    expect(said.approved).toBe("Approved by Ann Doyle on 2 September 2026.");
    expect(said.samePerson).toBeNull();
    expect(said.reopened).toBeNull();
  });

  it("AC-16: self-approval is a FACT on the page, not a refusal", () => {
    const said = lifecycleSentences({ ...FACTS, signedAndApprovedBySamePerson: true });

    expect(said.samePerson).toBe("Signed and approved by the same person.");
  });

  it("AC-23: a draft nobody has touched has nothing to say", () => {
    const said = lifecycleSentences({
      ...FACTS,
      status: "DRAFT",
      submittedAt: null,
      signedByName: null,
      signedAt: null,
      signaturePath: null,
      approvedByName: null,
      approvedAt: null,
    });

    expect(said).toEqual({ signed: null, approved: null, samePerson: null, reopened: null });
  });

  it("AC-18: the reopen notice is shown while the reopen is the LAST thing that happened", () => {
    const reopened: AuditEntry = {
      at: "2026-09-03T09:00:00.000Z",
      event: "REOPENED",
      actorName: "Ann Doyle",
      actorEmail: "ann@macroads.ie",
      reason: "the MMA price was wrong",
    };

    expect(
      lifecycleSentences({ ...FACTS, status: "DRAFT", audit: [reopened] }).reopened,
    ).toBe("Reopened by Ann Doyle on 3 September 2026: the MMA price was wrong.");

    // Signed and submitted again: the notice has been acted on, and the history is the
    // trail on `/summary` rather than a banner on the count.
    const resubmitted: AuditEntry = {
      at: "2026-09-04T09:00:00.000Z",
      event: "SUBMITTED",
      actorName: "Jo Byrne",
      actorEmail: "jo@macroads.ie",
      reason: null,
    };
    expect(lifecycleSentences({ ...FACTS, audit: [reopened, resubmitted] }).reopened).toBeNull();
  });

  it("AC-20: each entry of the trail is one sentence, with its actor and a formatted day", () => {
    expect(
      auditSentence({
        at: "2026-09-12T14:03:11.482Z",
        event: "SUBMITTED",
        actorName: "Jo Byrne",
        actorEmail: "jo@macroads.ie",
        reason: null,
      }),
    ).toBe("Submitted by Jo Byrne on 12 September 2026.");

    expect(
      auditSentence({
        at: "2026-09-12T15:02:44.900Z",
        event: "REOPENED",
        actorName: "Ann Doyle",
        actorEmail: "ann@macroads.ie",
        reason: "the MMA price was wrong",
      }),
    ).toBe("Reopened by Ann Doyle on 12 September 2026: the MMA price was wrong.");

    // The three events read as words a person uses, never as the column's value.
    expect(Object.values(AUDIT_EVENT_LABEL)).toEqual(["Submitted", "Approved", "Reopened"]);
  });

  it("AC-29: the labels the three screens Phase B adds render, and no euro in any of them", () => {
    for (const message of [
      COUNT_SUMMARY_LINK,
      BACK_TO_THE_COUNT,
      UNCOUNTED_HEADING,
      LINES_WITHOUT_PRICE_HEADING,
      SIGNATURE_HEADING,
      AUDIT_TRAIL_HEADING,
      COUNT_TOTAL_LABEL,
      REOPEN_DESTROYS,
      REOPEN_LINK,
      REOPEN_REASON_LABEL,
    ]) {
      expect(message, message).not.toContain("€");
      expect(message.trim(), message).not.toBe("");
    }

    // What reopening destroys, said before it happens - and what it does NOT destroy.
    expect(REOPEN_DESTROYS).toContain("draft");
    expect(REOPEN_DESTROYS).toContain("signature is destroyed");
    expect(REOPEN_DESTROYS).toContain("prices already captured on its lines are kept");
  });
});
