import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { auditLine, parseAuditLines } from "@/lib/count-audit";
import type { AuditEntry } from "@/types/stock-count";

/**
 * 021 AC-38's pure half: audit lines name a username, keep #9's grammar, and the lines
 * already stored with an email in the brackets still read. No database.
 */
describe("021 AC-38: the bracketed reference is a username, and old lines still read", () => {
  it("AC-38: a line built from a runtime-generated username parses back equal", () => {
    const entry: AuditEntry = {
      at: new Date().toISOString(),
      event: "APPROVED",
      actorName: `Approver ${randomBytes(3).toString("hex")}`,
      actorRef: `k${randomBytes(6).toString("hex")}`,
      reason: null,
    };

    expect(parseAuditLines(auditLine(entry))).toEqual([entry]);
  });

  it("AC-38: an email line followed by a username line parses to two entries, references verbatim", () => {
    const username = `k${randomBytes(6).toString("hex")}`;
    const notes = [
      "2026-09-12T14:03:11.482Z SUBMITTED by Jo Byrne <jo@macroads.ie>",
      `2026-09-25T09:00:00.000Z APPROVED by Ann Doyle <${username}>`,
    ].join("\n");

    const entries = parseAuditLines(notes);

    expect(entries.map((entry) => entry.actorRef)).toEqual(["jo@macroads.ie", username]);
    expect(entries.map((entry) => entry.event)).toEqual(["SUBMITTED", "APPROVED"]);
  });
});
