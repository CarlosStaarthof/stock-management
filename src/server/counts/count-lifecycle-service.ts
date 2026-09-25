import { appendAuditLine, auditLine, parseAuditLines } from "@/lib/count-audit";
import { canApprove, canReopen, canSubmit, isApproved } from "@/lib/count-lifecycle";
import {
  COUNT_ALREADY_APPROVED,
  COUNT_ALREADY_DRAFT,
  COUNT_ALREADY_SUBMITTED,
  COUNT_NOT_SUBMITTED,
  COUNT_NO_LONGER_EXISTS,
  uncountedBlocksSubmit,
} from "@/lib/count-messages";
import { logWarn } from "@/lib/log";
import { parseSignaturePath } from "@/lib/signature-path";
import { assertRole, assertUser } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { isoDateOf, selectCurrentPrice } from "@/server/items/price-selection";
import type {
  AuditEvent,
  CountLifecycleFacts,
  CountStatus,
  SubmitCountInput,
} from "@/types/stock-count";

/**
 * THE MOMENT A COUNT STOPS BEING A WORKING DOCUMENT AND BECOMES A FACT.
 *
 * Everything before this feature is editable: #7 creates a count, #8 fills it in. This
 * module is the only writer of the columns that close it — and it is the ONLY writer in
 * this feature at all, which is what makes the rules below assertable in one place.
 *
 * FIVE INVARIANTS STOP BEING PARAGRAPHS HERE.
 *
 *  5. `quantity IS NULL` BLOCKS SUBMISSION. Not a warning, not a default of zero: a line
 *     nobody looked at is a fact the workbook's blank cell could not express, and the
 *     refusal names how many there are so a person knows what they are going back for.
 * 11. NO SIGNATURE, NO SUBMISSION. The paper sheet was signed, the workbook lost that, and
 *     this puts it back. `parseSignaturePath` is called here as well as at the form's edge
 *     because the last gate before Postgres is the one that matters.
 *  2. `unitPriceSnapshot` IS WRITTEN ONCE, from the `ItemPrice` in force on `countDate`,
 *     and NEVER REWRITTEN. The condition is `unitPriceSnapshot: null` in the `where` of
 *     the update — a WHERE CLAUSE, not a comment — so a re-submit after a reopen fills
 *     only the gaps and cannot touch a value that was already captured (AC-19).
 *  4. A LINE WITH NO PRICE KEEPS `null`, NOT `0`. Writing `0` would make "no price" and
 *     "the price was zero" indistinguishable forever, and would assert a price nobody set.
 *     `null` values at zero, raises the warning `count-summary-service.ts` renders, and can
 *     still be filled by a later `ItemPrice` on a re-submit.
 *  3. AN APPROVED COUNT IS IMMUTABLE. Six refusals, each a named error with a named
 *     sentence, and the only way out is an audited reopen by an `ADMIN`.
 *
 * THE ACTOR IS THE SESSION, NEVER A FIELD. Every function takes an explicit actor and
 * begins with `assertUser` or `assertRole(actor, "ADMIN")`. It comes from `requireUser()`,
 * `requireUserPage()` or `requireAdminPage()` and from nowhere else (AC-2, AC-27).
 *
 * EVERY WRITE IS A COMPARE-AND-SET. `updateMany({ where: { id, status: <the only status it
 * may leave> } })`, with an assertion that exactly one row matched. Two phones submitting
 * at once therefore produce one submission and one `ConflictError`, with no lock and no
 * version token — a lock held by a phone that walked out of signal behind the shed is
 * worse than the race it prevents (AC-13).
 *
 * THE ORDER OF THE REFUSALS IS FIXED AND DELIBERATE: the session, then the count's
 * existence, then its status, then the input, then the state of its lines. A person who
 * submits a count somebody else already approved is told that, rather than being told
 * their signature is unreadable.
 *
 * IT NAMES `SUBMITTED`, `APPROVED`, `submittedAt`, `approvedAt`, `signatureSvg` AND THE
 * PRICE SNAPSHOT COLUMN, and it is one of exactly two files in the whole tree permitted to
 * (009 AC-26, amending 006 AC-31 and 007 AC-25). Every other module asks
 * `src/lib/count-lifecycle.ts` a question instead.
 */

/** The three statuses, spelled once. Read through `src/lib/count-lifecycle.ts` elsewhere. */
const DRAFT = "DRAFT";
const SUBMITTED = "SUBMITTED";
const APPROVED = "APPROVED";

/** The count, its status and its date — the three facts every transition needs. */
async function countHeadOrThrow(countId: string): Promise<{
  id: string;
  status: CountStatus;
  countDate: string;
  notes: string | null;
}> {
  const row = await db.stockCount.findUnique({
    where: { id: countId },
    select: { id: true, status: true, countDate: true, notes: true },
  });

  if (row === null) throw new NotFoundError(COUNT_NO_LONGER_EXISTS);

  return {
    id: row.id,
    status: row.status as CountStatus,
    countDate: isoDateOf(row.countDate),
    notes: row.notes,
  };
}

/** One audit line for `actor`, stamped now. The trail is `notes`, append-only (AC-20). */
function auditFor(
  actor: SessionUser,
  event: AuditEvent,
  at: Date,
  reason: string | null = null,
): string {
  return auditLine({
    at: at.toISOString(),
    event,
    actorName: actor.name,
    actorRef: actor.username,
    reason,
  });
}

/**
 * The price in force on `countDate`, per item, from `selectCurrentPrice` and nothing else.
 *
 * EVERY PRICE ROW OF THESE ITEMS IS READ AND THE CHOICE IS MADE IN ONE FUNCTION. Filtering
 * by `effectiveFrom` in the query would be a second implementation of "the price in force",
 * in SQL, where it could drift from the one the item master's `Current` badge uses — and
 * then the screen and the snapshot would eventually disagree about what the price was
 * (AC-11). The whole `ItemPrice` table is 129 rows.
 */
export async function pricesInForceOn(
  itemIds: readonly string[],
  countDate: string,
): Promise<Map<string, string>> {
  const prices = await db.itemPrice.findMany({
    where: { itemId: { in: [...itemIds] } },
    select: { itemId: true, unitPrice: true, effectiveFrom: true },
  });

  const byItem = new Map<string, { unitPrice: string; effectiveFrom: string }[]>();
  for (const price of prices) {
    const rows = byItem.get(price.itemId) ?? [];
    // A decimal STRING, straight from Prisma's Decimal. Never a JS number: `6.11764706` is
    // a non-terminating workbook formula and a `Number` round trip loses its tail.
    rows.push({ unitPrice: price.unitPrice.toString(), effectiveFrom: isoDateOf(price.effectiveFrom) });
    byItem.set(price.itemId, rows);
  }

  const inForce = new Map<string, string>();
  for (const [itemId, rows] of byItem) {
    const current = selectCurrentPrice(rows, countDate);
    // Invariant 4: an item with no price in force keeps NO ENTRY here, so its line keeps
    // `null` — never `0`, which would assert a price nobody set.
    if (current !== null) inForce.set(itemId, current.unitPrice);
  }

  return inForce;
}

/** Item ids grouped by the price they take, so one statement writes every line at it. */
function itemsByPrice(
  itemIds: readonly string[],
  inForce: ReadonlyMap<string, string>,
): [string, string[]][] {
  const groups = new Map<string, string[]>();

  for (const itemId of itemIds) {
    const price = inForce.get(itemId);
    if (price === undefined) continue;

    const members = groups.get(price) ?? [];
    members.push(itemId);
    groups.set(price, members);
  }

  return [...groups.entries()];
}

/* ------------------------------------------------------------------------ submit */

/**
 * Sign a count and close it (Invariants 5, 11 and 2).
 *
 * Both roles may submit, at either yard, whoever created the count: Part 6 puts "submit a
 * count" in both columns and there is no yard-scoped user in this product (AC-15).
 */
export async function submitCount(
  actor: SessionUser | null,
  countId: string,
  input: SubmitCountInput,
): Promise<CountLifecycleFacts> {
  const user = assertUser(actor);

  const count = await countHeadOrThrow(countId);

  if (!canSubmit(count.status)) {
    throw new ConflictError(isApproved(count.status) ? COUNT_ALREADY_APPROVED : COUNT_ALREADY_SUBMITTED);
  }

  // Invariant 11, at the service. The screen's disabled state is a courtesy; this is the
  // rule (AC-6).
  const signaturePath = parseSignaturePath(input.signaturePath);

  const lines = await db.stockCountLine.findMany({
    where: { stockCountId: count.id },
    select: { itemId: true, quantity: true },
  });

  // Invariant 5. `0` does not block: it means counted, none held, and 35 of the most recent
  // Dublin count's 82 rows are exactly that (AC-3).
  const uncounted = lines.filter((line) => line.quantity === null).length;
  if (uncounted > 0) throw new ValidationError("lines", uncountedBlocksSubmit(uncounted));

  const inForce = await pricesInForceOn(
    lines.map((line) => line.itemId),
    count.countDate,
  );
  const groups = itemsByPrice(
    lines.map((line) => line.itemId),
    inForce,
  );

  const at = new Date();

  await db.$transaction(
    async (tx) => {
      // The compare-and-set. `status: DRAFT` in the WHERE is the whole of the concurrency
      // control: the loser of a race matches no row and is told the count is already away.
      const claimed = await tx.stockCount.updateMany({
        where: { id: count.id, status: DRAFT },
        data: {
          status: SUBMITTED,
          submittedAt: at,
          signedById: user.id,
          // The same instant, not a second call to `new Date()`: a count is signed when it
          // is submitted, and two clock reads would eventually disagree by a millisecond.
          signedAt: at,
          signatureSvg: signaturePath,
          notes: appendAuditLine(count.notes, auditFor(user, "SUBMITTED", at)),
        },
      });

      if (claimed.count !== 1) throw new ConflictError(COUNT_ALREADY_SUBMITTED);

      for (const [price, members] of groups) {
        await tx.stockCountLine.updateMany({
          // `unitPriceSnapshot: null` IS INVARIANT 2. A line that already holds a snapshot
          // is never touched again, by anything, ever - which is what makes a reopen and a
          // re-submit safe (AC-19).
          where: { stockCountId: count.id, itemId: { in: members }, unitPriceSnapshot: null },
          data: { unitPriceSnapshot: price },
        });
      }
    },
    {
      // A Dublin count is 82 lines and Neon is a network hop away; the default 5 s
      // interactive-transaction budget is a timeout waiting to happen, and a timeout here
      // would leave a person who has signed with nothing to show for it.
      maxWait: 10_000,
      timeout: 20_000,
    },
  );

  return getLifecycleFacts(user, count.id);
}

/* ----------------------------------------------------------------------- approve */

/**
 * Approve a submitted count. `ADMIN` only, at the service (Part 6, AC-15).
 *
 * SELF-APPROVAL IS PERMITTED AND RECORDED, not refused (Open question 2): the team is two
 * people at most, and an administrator alone in the office must be able to close the month.
 * `signedAndApprovedBySamePerson` makes it visible on the page and in the audit trail —
 * a fact, rather than a rule a two-person company could not obey.
 */
export async function approveCount(
  actor: SessionUser | null,
  countId: string,
): Promise<CountLifecycleFacts> {
  const user = assertRole(actor, "ADMIN");

  const count = await countHeadOrThrow(countId);

  if (!canApprove(count.status)) {
    throw new ConflictError(isApproved(count.status) ? COUNT_ALREADY_APPROVED : COUNT_NOT_SUBMITTED);
  }

  const at = new Date();

  const claimed = await db.stockCount.updateMany({
    where: { id: count.id, status: SUBMITTED },
    data: {
      status: APPROVED,
      approvedById: user.id,
      approvedAt: at,
      notes: appendAuditLine(count.notes, auditFor(user, "APPROVED", at)),
    },
  });

  // Two concurrent approvals: one row, one conflict. No line is touched either way, so
  // every `unitPriceSnapshot` on the count is byte-identical afterwards (AC-16).
  if (claimed.count !== 1) throw new ConflictError(COUNT_ALREADY_APPROVED);

  return getLifecycleFacts(user, count.id);
}

/* ------------------------------------------------------------------------ reopen */

/**
 * Put a count back to `DRAFT`, with a reason, and destroy the signature.
 *
 * A SIGNATURE THAT SURVIVES AN EDIT IS WORTHLESS, so six columns go back to `null` and a
 * fresh signature is demanded. THE SNAPSHOTS DO NOT: the count was priced at what was in
 * force when it was walked, and a later correction to the price list is not a correction to
 * history (AC-19).
 *
 * The reason is the only record that survives the six nulls, which is why it is required
 * and why it is validated to a single line (AC-18).
 */
export async function reopenCount(
  actor: SessionUser | null,
  countId: string,
  reason: string,
): Promise<CountLifecycleFacts> {
  const user = assertRole(actor, "ADMIN");

  const count = await countHeadOrThrow(countId);

  if (!canReopen(count.status)) throw new ConflictError(COUNT_ALREADY_DRAFT);

  const at = new Date();

  const claimed = await db.stockCount.updateMany({
    where: { id: count.id, status: count.status },
    data: {
      status: DRAFT,
      submittedAt: null,
      signedById: null,
      signedAt: null,
      signatureSvg: null,
      approvedById: null,
      approvedAt: null,
      notes: appendAuditLine(count.notes, auditFor(user, "REOPENED", at, reason)),
    },
  });

  if (claimed.count !== 1) throw new ConflictError(COUNT_ALREADY_DRAFT);

  // A reopen is the one operation in this feature that DESTROYS information, so it belongs
  // in the server log as well as in the row. The reason is not logged: it is on the count,
  // and a log is not where a person's words belong.
  logWarn("count.reopened", {
    countId: count.id,
    actorId: user.id,
    previousStatus: count.status,
  });

  return getLifecycleFacts(user, count.id);
}

/* ------------------------------------------------------------------------- facts */

/**
 * Who signed, who approved, when, the signature itself, and the trail.
 *
 * ONE SHAPE FOR BOTH ROLES (AC-21): there is no monetary fact here, so there is nothing to
 * withhold, and a criterion asserts that a staff actor and an `ADMIN` get deeply equal
 * values for the same count. That is the difference between a screen that is money-free
 * and a screen that merely hides its money.
 */
export async function getLifecycleFacts(
  actor: SessionUser | null,
  countId: string,
): Promise<CountLifecycleFacts> {
  assertUser(actor);

  const row = await db.stockCount.findUnique({
    where: { id: countId },
    select: {
      id: true,
      status: true,
      submittedAt: true,
      signedById: true,
      signedAt: true,
      signatureSvg: true,
      approvedById: true,
      approvedAt: true,
      notes: true,
      signedBy: { select: { name: true } },
      approvedBy: { select: { name: true } },
    },
  });

  if (row === null) throw new NotFoundError(COUNT_NO_LONGER_EXISTS);

  return {
    countId: row.id,
    status: row.status as CountStatus,
    submittedAt: row.submittedAt === null ? null : row.submittedAt.toISOString(),
    signedByName: row.signedBy?.name ?? null,
    signedAt: row.signedAt === null ? null : row.signedAt.toISOString(),
    // The exact stored `d`, byte for byte. No escaping, no re-serialisation: what was
    // drawn is what is stored and what is rendered (AC-7).
    signaturePath: row.signatureSvg,
    approvedByName: row.approvedBy?.name ?? null,
    approvedAt: row.approvedAt === null ? null : row.approvedAt.toISOString(),
    signedAndApprovedBySamePerson:
      row.signedById !== null && row.signedById === row.approvedById,
    audit: parseAuditLines(row.notes),
  };
}
