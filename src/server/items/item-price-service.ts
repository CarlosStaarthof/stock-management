import { itemNotFound, priceDateAlreadyUsed } from "@/lib/item-master-messages";
import { assertRole } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";
import { parsePriceInput } from "@/server/items/item-master-input";
import { toPriceRows } from "@/server/items/price-selection";
import type { PriceRecord, PriceRow } from "@/server/items/price-selection";

/**
 * The price list — INSERT ONLY.
 *
 * `specs/domain-model.md` Part 2, Invariant 2: a price is added, never overwritten. There
 * is no `updatePrice`, no `deletePrice` and no upsert in this module or anywhere else in
 * the feature, and `item-price-service.db.test.ts` scans the shipping tree to prove it
 * (006 AC-13). The reason is not tidiness: every `StockCountLine` already submitted
 * carries a price snapshot taken from one of these rows, and a count approved in
 * March must still read in September exactly what it read in March.
 *
 * The cost is stated rather than engineered around (006 open question 3): a price typed
 * wrongly today CANNOT be corrected today, because `@@unique([itemId, effectiveFrom])`
 * refuses a second row on the same date. `addPrice` says so in its own words, and the
 * admin dates the correction tomorrow.
 *
 * `unitPrice` is a string from the form to Postgres. Prisma accepts a decimal string for
 * a `Decimal` column, and `docs/architecture.md` § Money and quantities forbids the
 * JavaScript number that would round `6.11764706` on the way past.
 */

const PRICE_SELECT = {
  id: true,
  unitPrice: true,
  currency: true,
  effectiveFrom: true,
  label: true,
} as const;

/** Newest `effectiveFrom` first — the order the price panel reads (006 § Contract). */
export async function listPrices(actor: SessionUser, itemId: string): Promise<PriceRow[]> {
  assertRole(actor, "ADMIN");

  const prices = (await db.itemPrice.findMany({
    where: { itemId },
    select: PRICE_SELECT,
    orderBy: { effectiveFrom: "desc" },
  })) as PriceRecord[];

  return toPriceRows(prices);
}

export async function addPrice(actor: SessionUser, raw: unknown): Promise<PriceRow> {
  assertRole(actor, "ADMIN");

  const input = parsePriceInput(raw);

  const item = await db.item.findUnique({
    where: { id: input.itemId },
    select: { id: true, description: true },
  });
  if (item === null) throw new NotFoundError(itemNotFound(input.itemId));

  // `@db.Date` holds a day, not an instant. Building it at UTC midnight is what makes
  // `2026-01-01` read back as `2026-01-01` west of Greenwich as well as east of it.
  const effectiveFrom = new Date(`${input.effectiveFrom}T00:00:00.000Z`);

  const taken = await db.itemPrice.findUnique({
    where: { itemId_effectiveFrom: { itemId: input.itemId, effectiveFrom } },
    select: { id: true },
  });
  if (taken !== null) {
    // The service's own words. `Unique constraint failed on the fields: (itemId,
    // effectiveFrom)` is Prisma's, and AC-14 forbids it reaching a screen.
    throw new ConflictError(priceDateAlreadyUsed(item.description, input.effectiveFrom));
  }

  const created = (await db.itemPrice.create({
    data: {
      itemId: input.itemId,
      unitPrice: input.unitPrice,
      effectiveFrom,
      label: input.label,
    },
    select: PRICE_SELECT,
  })) as PriceRecord;

  return toPriceRows([created])[0];
}
