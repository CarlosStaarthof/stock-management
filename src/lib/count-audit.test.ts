import { describe, expect, it } from "vitest";

import {
  AUDIT_EVENTS,
  appendAuditLine,
  auditLine,
  latestAudit,
  parseAuditLines,
} from "@/lib/count-audit";
import type { AuditEntry } from "@/types/stock-count";

/**
 * Spec 009 AC-20, the pure half: the audit trail is append-only, single-format and parses
 * back, proved with no database (AC-31).
 */
const REOPENED: AuditEntry = {
  at: "2026-09-12T14:03:11.482Z",
  event: "REOPENED",
  actorName: "Ann Doyle",
  actorRef: "ann@macroads.ie",
  reason: "the MMA price was wrong",
};

const SUBMITTED: AuditEntry = {
  at: "2026-09-12T14:03:11.482Z",
  event: "SUBMITTED",
  actorName: "Jo Byrne",
  actorRef: "jo@macroads.ie",
  reason: null,
};

describe("AC-20: one format, written and read by one module", () => {
  it("AC-20: auditLine is exactly the line the criterion quotes", () => {
    expect(auditLine(REOPENED)).toBe(
      "2026-09-12T14:03:11.482Z REOPENED by Ann Doyle <ann@macroads.ie>: the MMA price was wrong",
    );
  });

  it("AC-20: without a reason the trailing colon is absent", () => {
    expect(auditLine(SUBMITTED)).toBe(
      "2026-09-12T14:03:11.482Z SUBMITTED by Jo Byrne <jo@macroads.ie>",
    );
    expect(auditLine({ ...SUBMITTED, reason: "" })).toBe(
      "2026-09-12T14:03:11.482Z SUBMITTED by Jo Byrne <jo@macroads.ie>",
    );
  });

  it("AC-20: the three events are the three the lifecycle has", () => {
    expect([...AUDIT_EVENTS]).toEqual(["SUBMITTED", "APPROVED", "REOPENED"]);
  });

  it("AC-20: every event round-trips through the line and back", () => {
    for (const event of AUDIT_EVENTS) {
      const entry: AuditEntry = { ...SUBMITTED, event };
      expect(parseAuditLines(auditLine(entry))).toEqual([entry]);
    }
  });

  it("AC-20: a reason containing a colon survives the round trip", () => {
    const entry: AuditEntry = { ...REOPENED, reason: "wrong price: the MMA row" };
    expect(parseAuditLines(auditLine(entry))).toEqual([entry]);
  });
});

describe("AC-20: appending is append-only", () => {
  it("AC-20: appendAuditLine(null, line) is the line", () => {
    expect(appendAuditLine(null, "one")).toBe("one");
    expect(appendAuditLine("", "one")).toBe("one");
  });

  it("AC-20: appendAuditLine(existing, line) is existing + newline + line", () => {
    expect(appendAuditLine("one", "two")).toBe("one\ntwo");
  });

  it("AC-20: existing is ALWAYS a prefix of the result, over three successive appends", () => {
    // The property, not an example: nothing in this product rewrites or removes a line.
    let notes: string | null = null;
    const written: string[] = [];

    for (const event of AUDIT_EVENTS) {
      const before: string | null = notes;
      const line = auditLine({ ...SUBMITTED, event });

      notes = appendAuditLine(before, line);
      written.push(line);

      if (before !== null) expect(notes.startsWith(before)).toBe(true);
      expect(notes.endsWith(line)).toBe(true);
    }

    expect(notes).toBe(written.join("\n"));
    expect(parseAuditLines(notes).map((entry) => entry.event)).toEqual([...AUDIT_EVENTS]);
  });
});

describe("AC-20: parsing never throws, whatever notes holds", () => {
  it("AC-20: null and the empty string are no entries at all", () => {
    expect(parseAuditLines(null)).toEqual([]);
    expect(parseAuditLines("")).toEqual([]);
  });

  it("AC-20: a line that does not match the format contributes nothing", () => {
    const notes = [
      "something a human typed about this count",
      auditLine(SUBMITTED),
      "",
      "2026-09-12 SUBMITTED by Jo Byrne <jo@macroads.ie>",
      "2026-09-12T14:03:11.482Z REJECTED by Jo Byrne <jo@macroads.ie>",
      auditLine(REOPENED),
    ].join("\n");

    expect(parseAuditLines(notes)).toEqual([SUBMITTED, REOPENED]);
  });

  it("AC-20: entries come back oldest first, in the order they were appended", () => {
    const first = auditLine({ ...SUBMITTED, at: "2026-09-12T14:03:11.482Z" });
    const second = auditLine({ ...REOPENED, at: "2026-09-12T15:02:44.900Z" });

    const entries = parseAuditLines(appendAuditLine(first, second));

    expect(entries.map((entry) => entry.at)).toEqual([
      "2026-09-12T14:03:11.482Z",
      "2026-09-12T15:02:44.900Z",
    ]);
  });
});

describe("AC-18, AC-20: the latest entry", () => {
  it("AC-20: latestAudit of nothing is null", () => {
    expect(latestAudit(null)).toBeNull();
    expect(latestAudit("not an audit line")).toBeNull();
  });

  it("AC-18: latestAudit finds the most recent REOPENED, which is the sentence the yard sees", () => {
    const notes = [
      auditLine(SUBMITTED),
      auditLine({ ...REOPENED, at: "2026-09-01T09:00:00.000Z", reason: "the first reason" }),
      auditLine({ ...SUBMITTED, at: "2026-09-02T09:00:00.000Z" }),
      auditLine({ ...REOPENED, at: "2026-09-03T09:00:00.000Z" }),
    ].join("\n");

    expect(latestAudit(notes, "REOPENED")?.reason).toBe("the MMA price was wrong");
    expect(latestAudit(notes)?.at).toBe("2026-09-03T09:00:00.000Z");
    expect(latestAudit(notes, "APPROVED")).toBeNull();
  });
});
