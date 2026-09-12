import { COUNT_NO_LONGER_EXISTS, COUNT_READ_ONLY, ITEM_NOT_ON_COUNT } from "@/lib/count-messages";
import { assertUser } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { parseQuantity } from "@/server/counts/quantity-input";
import { db } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";
import type { QuantityEdit, SaveQuantitiesResult } from "@/types/stock-count";

/**
 * TYPING THE NUMBERS IN — the one write the counting screen makes, and the only write in
 * this feature at all.
 *
 * `specs/domain-model.md` Part 5: count entry gives a yard **all** the items assigned to
 * it, because *"you cannot record stock with no row to type in"*. #7 created those rows
 * with `quantity = null`; this module is what a person standing in the cold, on a phone,
 * one-handed, fills them in with.
 *
 * SIX RULES IT ENCODES, each with a criterion rather than a comment keeping it true.
 *
 *  1. `null` IS NOT `0`, AND THIS IS WHERE THE DIFFERENCE IS MADE PERMANENT. An empty
 *     input is stored as SQL NULL — *nobody has looked at this row* — and a typed `0` is
 *     stored as the number zero — *somebody looked, none is held*. The workbook's blank
 *     cell could not tell the two apart, which is why a third of its rows are ambiguous
 *     and why Invariant 5 exists. The two are distinguishable afterwards by `IS NULL`
 *     (008 AC-5), and #9 blocks a submission on the first and accepts the second.
 *  2. THE ACTOR IS THE SESSION, AND BOTH ROLES MAY COUNT. `assertUser` and never
 *     `assertRole`: Part 6 puts "create and edit a DRAFT count" in both role columns, and
 *     there is no yard-scoped user in this product (008 AC-2).
 *  3. A BATCH IS ONE TRANSACTION. Every edit in one request is written together or none
 *     is, as #7 writes its 82 lines. The client only ever queues numbers that have already
 *     passed the same `parseQuantity` the server runs, so a refusal means a forged request
 *     or a bug — and refusing the whole batch is then the right answer (008 AC-8).
 *  4. IT WRITES ONE COLUMN. `data: { quantity }` and nothing else, ever. No row is
 *     inserted and no row is deleted, no column of the parent `StockCount` is touched, and
 *     the price snapshot stays null until #9 writes it at submit time (Invariant 2). This
 *     file is the ONE exemption 008 AC-28 adds to 007 AC-25's no-mutation scan, named as a
 *     literal so a second exemption turns that test red.
 *  5. LAST WRITE WINS, AND NOTHING IS LOCKED. No version token, no `SELECT … FOR UPDATE`.
 *     A lost edit on one line is recoverable by typing it again; a lock held by a phone
 *     that walked out of signal behind the shed is not (008 AC-34).
 *  6. NO MONEY, FOR EITHER ROLE. The result carries an id, a quantity per edited line and
 *     three counts. There is no running total here and none on the screen: a draft total
 *     could only be computed from *today's* prices, and a price edited between the count
 *     and its approval would make it disagree with the count's own total — which is
 *     precisely the workbook defect this product exists to remove. It therefore needs no
 *     `shapeForRole`: one shape, both roles, because there is no monetary fact in it
 *     (008 AC-17, AC-18).
 */

/**
 * A save's edits, de-duplicated by `itemId`, latest wins.
 *
 * Two edits for one line in a single batch is what a double tap on *None held* followed by
 * a typed number looks like. The later one is what the user meant, and writing both would
 * write the earlier one for no reason.
 */
function latestPerItem(edits: readonly QuantityEdit[]): QuantityEdit[] {
  const byItem = new Map<string, string | null>();
  for (const edit of edits) {
    // `parseQuantity` again, deliberately: each transport parses at its own edge, and this
    // is the last gate before Postgres. It is idempotent on a canonical string, so calling
    // it twice costs nothing and forgetting it once would cost a `numeric field overflow`.
    byItem.set(edit.itemId, parseQuantity(edit.quantity));
  }

  // Insertion order, which is the order the counter typed in and the order `saved` echoes.
  return [...byItem.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

/**
 * The edits grouped by the quantity they write, so one `updateMany` writes every line that
 * takes the same number.
 *
 * On the most recent Dublin count 35 of 82 rows were zero or blank; a *None held* sweep is
 * therefore one statement rather than thirty-five round trips to Neon, and a transaction
 * that is short is a transaction that does not time out on a phone in a yard.
 */
function groupByQuantity(edits: readonly QuantityEdit[]): [string | null, string[]][] {
  const groups = new Map<string | null, string[]>();
  for (const edit of edits) {
    const itemIds = groups.get(edit.quantity) ?? [];
    itemIds.push(edit.itemId);
    groups.set(edit.quantity, itemIds);
  }
  return [...groups.entries()];
}

/**
 * Write the quantities a counter typed, and answer with what is now stored.
 *
 * Everything is refused BEFORE anything is written: no session, no count, a count that is
 * no longer a `DRAFT`, or an `itemId` that is not a line of this count — and in the last
 * case the valid edits sent alongside it are refused too, because a batch is one
 * transaction and a client that sent one bad id has a bug rather than a stale row.
 *
 * `saved` is READ BACK after the write rather than copied from the request (008 AC-10), so
 * the client is told what Postgres holds and not what it hoped Postgres would hold.
 */
export async function saveQuantities(
  actor: SessionUser | null,
  countId: string,
  edits: readonly QuantityEdit[],
): Promise<SaveQuantitiesResult> {
  assertUser(actor);

  const wanted = latestPerItem(edits);

  const count = await db.stockCount.findUnique({
    where: { id: countId },
    select: { id: true, status: true, lines: { select: { itemId: true } } },
  });
  if (count === null) throw new NotFoundError(COUNT_NO_LONGER_EXISTS);

  // Written `!== "DRAFT"` and never by naming the two statuses past it: those words live
  // in `src/types/stock-count.ts` and the sentence in `src/lib/count-messages.ts`, which is
  // the layout 007 AC-25 fixed (008 AC-9).
  if (count.status !== "DRAFT") throw new ConflictError(COUNT_READ_ONLY);

  const onCount = new Set(count.lines.map((line) => line.itemId));
  for (const edit of wanted) {
    if (!onCount.has(edit.itemId)) throw new NotFoundError(ITEM_NOT_ON_COUNT);
  }

  return db.$transaction(
    async (tx) => {
      for (const [quantity, itemIds] of groupByQuantity(wanted)) {
        await tx.stockCountLine.updateMany({
          where: { stockCountId: count.id, itemId: { in: itemIds } },
          // The whole of what this feature writes. Every other column of the line, and every
          // column of the count, is left exactly as it was (008 AC-8, AC-28).
          data: { quantity },
        });
      }

      const stored = await tx.stockCountLine.findMany({
        where: { stockCountId: count.id },
        select: { itemId: true, quantity: true },
      });

      const quantityByItem = new Map(
        // A decimal STRING, converted from Prisma's Decimal. Never a JS number: `21.6128`
        // tonnes is the reason (`docs/architecture.md` § Money and quantities).
        stored.map((line): [string, string | null] => [
          line.itemId,
          line.quantity === null ? null : line.quantity.toString(),
        ]),
      );

      const countedLineCount = stored.filter((line) => line.quantity !== null).length;

      return {
        countId: count.id,
        saved: wanted.map((edit) => ({
          itemId: edit.itemId,
          quantity: quantityByItem.get(edit.itemId) ?? null,
        })),
        lineCount: stored.length,
        // `0` counts as counted: progress means "somebody has looked at this row", which is
        // the same rule #7's `countedSummary` renders (008 AC-24).
        countedLineCount,
        uncountedLineCount: stored.length - countedLineCount,
      };
    },
    {
      // A batch may carry 200 edits, and Neon is a network hop away: the default 5 s
      // interactive-transaction budget is a timeout waiting to happen on a yard phone,
      // and a timeout here would discard a counter's whole batch.
      maxWait: 10_000,
      timeout: 20_000,
    },
  );
}
