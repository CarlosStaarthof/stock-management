import type { AuditEntry, AuditEvent } from "@/types/stock-count";

/**
 * The audit trail, as one line of text per event, written and read by one module.
 *
 * ```
 * 2026-09-12T14:03:11.482Z SUBMITTED by Jo Byrne <jo.byrne>
 * 2026-09-12T15:02:44.900Z REOPENED by Ann Doyle <ann>: the MMA price was wrong
 * ```
 *
 * The bracketed reference is the actor's USERNAME (021 S13): display names are not
 * unique, usernames are and are never reissued. Lines written before #21 carry an email
 * address there instead; the grammar is unchanged, so they parse back verbatim (AC-38).
 *
 * WHY IT IS TEXT IN A COLUMN AND NOT A TABLE (009 Open question 6): `specs/domain-model.md`
 * Part 3 is the schema field for field and 004 AC-1 asserts it, so a `StockCountEvent`
 * model would mean amending the domain model, writing a migration, adding an entry to
 * `TRUNCATED_TABLES` and touching 020 AC-4 — for a feature every one of whose columns
 * already exists. That is a decision for the user, not a side effect of this one.
 *
 * WHAT IT IS FOR: reopening nulls every column that records who submitted a count, who
 * signed it, who approved it, when — and the signature. Without these lines there would be
 * no record at all
 * that the count had ever been approved, by whom, or why it was undone (009 AC-18, AC-20).
 *
 * The writer and the reader are the same module deliberately: a format spelled twice is a
 * format that will one day be spelled two ways. It is pure — a type and no runtime — so
 * 009 AC-20's half runs with no database.
 */

/** Declaration order, so a list of events always reads the same way. */
export const AUDIT_EVENTS = [
  "SUBMITTED",
  "APPROVED",
  "REOPENED",
] as const satisfies readonly AuditEvent[];

/**
 * One entry, as the exact line 009 AC-20 quotes. Without a reason the trailing colon is
 * absent — an empty reason is not a reason, and `…<ann>: ` would parse back
 * as one.
 */
export function auditLine(entry: AuditEntry): string {
  const reason = entry.reason === null || entry.reason === "" ? "" : `: ${entry.reason}`;
  return `${entry.at} ${entry.event} by ${entry.actorName} <${entry.actorRef}>${reason}`;
}

/**
 * APPEND-ONLY, and the property that says so: `existing` is always a prefix of the result
 * (009 AC-20). Nothing in this product ever rewrites or removes a line.
 */
export function appendAuditLine(existing: string | null, line: string): string {
  return existing === null || existing === "" ? line : `${existing}\n${line}`;
}

/**
 * The line grammar, and the reason `parseReopenReason` refuses a newline: a reason
 * carrying one would forge a second entry in a column the reader trusts.
 *
 * The reason is the rest of the line, so it may contain a colon; it may not contain a
 * line break, because it is matched to the end of one line.
 */
const AUDIT_LINE =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z) (SUBMITTED|APPROVED|REOPENED) by (.+?) <([^<>\s]+)>(?:: (.*))?$/;

/**
 * The entries of a `notes` value, oldest first.
 *
 * A line that does not match is IGNORED and contributes nothing (009 AC-20). `notes` is a
 * plain text column: a sentence typed by a human, or written by a later feature, must
 * never be able to make the summary page throw.
 */
export function parseAuditLines(notes: string | null): AuditEntry[] {
  if (notes === null || notes === "") return [];

  const entries: AuditEntry[] = [];
  for (const line of notes.split("\n")) {
    const matched = AUDIT_LINE.exec(line);
    if (matched === null) continue;

    const [, at, event, actorName, actorRef, reason] = matched;
    entries.push({
      at,
      event: event as AuditEvent,
      actorName,
      actorRef,
      reason: reason === undefined || reason === "" ? null : reason,
    });
  }

  return entries;
}

/** The most recent entry, of one event or of any. `null` when there is none. */
export function latestAudit(notes: string | null, event?: AuditEvent): AuditEntry | null {
  const entries = parseAuditLines(notes).filter(
    (entry) => event === undefined || entry.event === event,
  );
  return entries.length === 0 ? null : entries[entries.length - 1];
}
