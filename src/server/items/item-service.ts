import { normaliseUnit } from "@/lib/units";
import type { UnitKind } from "@/lib/units";
import {
  itemAlreadyExists,
  itemHasCountLines,
  itemNotFound,
  cannotMarkReviewed,
} from "@/lib/item-master-messages";
import { assertRole } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { parseItemInput } from "@/server/items/item-master-input";
import type { ItemInput, ItemListQuery } from "@/server/items/item-master-input";
import { toCurrentPrice, toPriceRows, todayIso } from "@/server/items/price-selection";
import type { CurrentPrice, PriceRecord, PriceRow } from "@/server/items/price-selection";
import { reviewReasons } from "@/server/items/review-reasons";
import type { ReviewReason } from "@/types/item-master";

/**
 * The item master, as the screen sees it.
 *
 * Three rules live here rather than in a page, because #7, #8 and #15 will call the same
 * functions and must get the same answers:
 *
 *  1. IDENTITY IS `(description, supplierId ?? null)`, matched in application code.
 *     Postgres treats NULLs as distinct, so `@@unique([description, supplierId])` does not
 *     stop two supplier-less rows sharing a description — the same hole #5 AC-23 closed
 *     for the importer (006 AC-9).
 *  2. `needsReview` IS RAISED BY THE SYSTEM AND CLEARED ONLY BY A HUMAN. Every save that
 *     leaves an item with no supplier, no unit label or no price sets it to `true`;
 *     `markItemReviewed` is the ONLY thing in this feature that sets it to `false`, and it
 *     refuses while any reason remains (006 AC-19).
 *  3. DELETE IS ATTEMPTED, NOT PRE-CHECKED. Postgres refuses with a RESTRICT violation and
 *     the service turns that into a `ConflictError` in its own words. A pre-check leaves a
 *     window between the check and the delete; the raw message never leaves this layer
 *     (docs/architecture.md § Error handling, 006 AC-12).
 *
 * Every decimal crosses this boundary as a STRING. `unitQuantityKg` and a price are
 * `Decimal` columns and a JavaScript number cannot hold them (docs/architecture.md).
 */

export type ItemRow = {
  id: string;
  description: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierActive: boolean | null;
  itemTypeId: string;
  itemTypeName: string;
  unitLabel: string | null;
  unitKind: UnitKind;
  unitQuantityKg: string | null;
  currentPrice: CurrentPrice | null;
  yards: string[];
  active: boolean;
  needsReview: boolean;
  reviewReasons: ReviewReason[];
  hasNote: boolean;
};

export type ItemListCounts = {
  active: number;
  needsReview: number;
  notes: number;
  archived: number;
};

export type ItemListPage = {
  rows: ItemRow[];
  counts: ItemListCounts;
  /** Every item in the master, before any filter — so "empty" and "no match" differ. */
  totalItems: number;
};

export type ItemDetail = ItemRow & {
  notes: string | null;
  prices: (PriceRow & { isCurrent: boolean })[];
  links: {
    locationId: string;
    locationCode: string;
    locationName: string;
    sortOrder: number;
    active: boolean;
  }[];
  lineCount: number;
};

/** The Prisma shape every read below asks for. One selection, one mapping, one truth. */
const ITEM_INCLUDE = {
  supplier: { select: { id: true, name: true, active: true } },
  itemType: { select: { id: true, name: true } },
  // Named columns rather than `prices: true`: this is the module that decides what a
  // screen learns about a price, so it says which five columns that is. `createdAt` is
  // deliberately absent - it is an insert-time fact, not something a screen shows.
  prices: {
    select: {
      id: true,
      unitPrice: true,
      currency: true,
      effectiveFrom: true,
      label: true,
    },
  },
  locations: {
    include: { location: { select: { id: true, code: true, name: true, sortOrder: true } } },
  },
} as const;

type ItemWithRelations = {
  id: string;
  description: string;
  supplierId: string | null;
  itemTypeId: string;
  unitLabel: string | null;
  unitKind: UnitKind;
  unitQuantityKg: { toString(): string } | null;
  active: boolean;
  needsReview: boolean;
  notes: string | null;
  supplier: { id: string; name: string; active: boolean } | null;
  itemType: { id: string; name: string };
  prices: PriceRecord[];
  locations: {
    sortOrder: number;
    active: boolean;
    location: { id: string; code: string; name: string; sortOrder: number };
  }[];
};

function toRow(item: ItemWithRelations, asOf: string): ItemRow {
  const prices = toPriceRows(item.prices);

  return {
    id: item.id,
    description: item.description,
    supplierId: item.supplierId,
    supplierName: item.supplier?.name ?? null,
    supplierActive: item.supplier?.active ?? null,
    itemTypeId: item.itemTypeId,
    itemTypeName: item.itemType.name,
    unitLabel: item.unitLabel,
    unitKind: item.unitKind,
    unitQuantityKg: item.unitQuantityKg === null ? null : item.unitQuantityKg.toString(),
    currentPrice: toCurrentPrice(prices, asOf),
    yards: item.locations
      .filter((link) => link.active)
      .sort((left, right) => left.location.sortOrder - right.location.sortOrder)
      .map((link) => link.location.code),
    active: item.active,
    needsReview: item.needsReview,
    reviewReasons: reviewReasons({
      supplierId: item.supplierId,
      unitLabel: item.unitLabel,
      hasPrice: item.prices.length > 0,
    }),
    hasNote: item.notes !== null,
  };
}

/** `description` ascending, case-insensitively — the order an admin scans a list in. */
function byDescription(left: { description: string }, right: { description: string }): number {
  const compared = left.description.toLowerCase().localeCompare(right.description.toLowerCase());
  return compared !== 0 ? compared : left.description.localeCompare(right.description);
}

export async function listItems(
  actor: SessionUser,
  query: ItemListQuery,
  asOf: string = todayIso(),
): Promise<ItemListPage> {
  assertRole(actor, "ADMIN");

  const items = (await db.item.findMany({ include: ITEM_INCLUDE })) as ItemWithRelations[];

  const counts: ItemListCounts = {
    active: items.filter((item) => item.active).length,
    needsReview: items.filter((item) => item.active && item.needsReview).length,
    notes: items.filter((item) => item.active && item.notes !== null).length,
    archived: items.filter((item) => !item.active).length,
  };

  const needle = query.q === null ? null : query.q.toLowerCase();

  const rows = items
    .filter((item) => {
      // Filters combine with AND across categories (AC-6).
      if (query.filter === "archived" ? item.active : !item.active) return false;
      if (query.filter === "needs-review" && !item.needsReview) return false;
      if (query.filter === "notes" && item.notes === null) return false;
      if (needle !== null && !item.description.toLowerCase().includes(needle)) return false;
      if (query.supplierId !== null && item.supplierId !== query.supplierId) return false;
      if (query.itemTypeId !== null && item.itemTypeId !== query.itemTypeId) return false;
      if (
        query.locationCode !== null &&
        !item.locations.some((link) => link.active && link.location.code === query.locationCode)
      ) {
        return false;
      }
      return true;
    })
    .sort(byDescription)
    .map((item) => toRow(item, asOf));

  return { rows, counts, totalItems: items.length };
}

async function loadItem(id: string): Promise<ItemWithRelations> {
  const item = (await db.item.findUnique({
    where: { id },
    include: ITEM_INCLUDE,
  })) as ItemWithRelations | null;

  if (item === null) throw new NotFoundError(itemNotFound(id));
  return item;
}

export async function getItem(
  actor: SessionUser,
  id: string,
  asOf: string = todayIso(),
): Promise<ItemDetail> {
  assertRole(actor, "ADMIN");

  const item = await loadItem(id);
  const prices = toPriceRows(item.prices);
  const current = toCurrentPrice(prices, asOf);
  const lineCount = await db.stockCountLine.count({ where: { itemId: id } });

  return {
    ...toRow(item, asOf),
    notes: item.notes,
    prices: prices.map((price) => ({
      ...price,
      isCurrent: current !== null && price.effectiveFrom === current.effectiveFrom,
    })),
    links: item.locations
      .sort((left, right) => left.location.sortOrder - right.location.sortOrder)
      .map((link) => ({
        locationId: link.location.id,
        locationCode: link.location.code,
        locationName: link.location.name,
        sortOrder: link.sortOrder,
        active: link.active,
      })),
    lineCount,
  };
}

/**
 * AC-9. `findFirst` on `(description, supplierId)` with an explicit `null`, because
 * Prisma turns `supplierId: null` into `IS NULL` — which is exactly the comparison the
 * unique index cannot make.
 */
async function assertIdentityFree(
  input: ItemInput,
  exceptItemId: string | null,
): Promise<void> {
  const clash = await db.item.findFirst({
    where: {
      description: input.description,
      supplierId: input.supplierId,
      ...(exceptItemId === null ? {} : { NOT: { id: exceptItemId } }),
    },
    select: { id: true, supplier: { select: { name: true } } },
  });

  if (clash !== null) {
    throw new ConflictError(
      itemAlreadyExists(input.description, clash.supplier?.name ?? null),
    );
  }
}

async function assertReferencesExist(input: ItemInput): Promise<void> {
  const itemType = await db.itemType.findUnique({
    where: { id: input.itemTypeId },
    select: { id: true },
  });
  if (itemType === null) {
    throw new ValidationError("itemTypeId", `No item type with id ${input.itemTypeId}.`);
  }

  if (input.supplierId !== null) {
    const supplier = await db.supplier.findUnique({
      where: { id: input.supplierId },
      select: { id: true },
    });
    if (supplier === null) {
      throw new ValidationError("supplierId", `No supplier with id ${input.supplierId}.`);
    }
  }
}

export async function createItem(actor: SessionUser, raw: unknown): Promise<ItemDetail> {
  assertRole(actor, "ADMIN");

  const input = parseItemInput(raw);
  await assertReferencesExist(input);
  await assertIdentityFree(input, null);

  // One rule in one place: `unitKind` and `unitQuantityKg` are derived from the label by
  // the same function #5 used, never typed by hand (006 § Out of scope).
  const unit = normaliseUnit(input.unitLabel);

  const created = await db.item.create({
    data: {
      description: input.description,
      supplierId: input.supplierId,
      itemTypeId: input.itemTypeId,
      unitLabel: input.unitLabel,
      unitKind: unit.unitKind,
      unitQuantityKg: unit.unitQuantityKg,
      notes: input.notes,
      active: true,
      // A brand-new item has no price, so it is always flagged. That is the rule, not an
      // accident: the admin is being told to price it before a count asks for it.
      needsReview:
        reviewReasons({
          supplierId: input.supplierId,
          unitLabel: input.unitLabel,
          hasPrice: false,
        }).length > 0,
    },
    select: { id: true },
  });

  return getItem(actor, created.id);
}

export async function updateItem(
  actor: SessionUser,
  id: string,
  raw: unknown,
): Promise<ItemDetail> {
  assertRole(actor, "ADMIN");

  const input = parseItemInput(raw);
  const existing = await loadItem(id);
  await assertReferencesExist(input);
  await assertIdentityFree(input, id);

  const unit = normaliseUnit(input.unitLabel);
  const raised =
    reviewReasons({
      supplierId: input.supplierId,
      unitLabel: input.unitLabel,
      hasPrice: existing.prices.length > 0,
    }).length > 0;

  await db.item.update({
    where: { id },
    data: {
      description: input.description,
      supplierId: input.supplierId,
      itemTypeId: input.itemTypeId,
      unitLabel: input.unitLabel,
      unitKind: unit.unitKind,
      unitQuantityKg: unit.unitQuantityKg,
      notes: input.notes,
      // Raised, never lowered. `markItemReviewed` is the only path to `false` (AC-19).
      ...(raised ? { needsReview: true } : {}),
    },
  });

  return getItem(actor, id);
}

/**
 * Archive and restore. `ItemLocation` is deliberately untouched (AC-11, open question 2):
 * `Item.active` is the single answer to "is this item on a sheet?", so restoring returns
 * the item to exactly the yards and exactly the positions it left.
 */
export async function setItemActive(
  actor: SessionUser,
  id: string,
  active: boolean,
): Promise<ItemDetail> {
  assertRole(actor, "ADMIN");

  await loadItem(id);
  await db.item.update({ where: { id }, data: { active } });

  return getItem(actor, id);
}

export async function markItemReviewed(actor: SessionUser, id: string): Promise<ItemDetail> {
  assertRole(actor, "ADMIN");

  const item = await loadItem(id);
  const outstanding = reviewReasons({
    supplierId: item.supplierId,
    unitLabel: item.unitLabel,
    hasPrice: item.prices.length > 0,
  });

  if (outstanding.length > 0) {
    throw new ValidationError("needsReview", cannotMarkReviewed(outstanding));
  }

  await db.item.update({ where: { id }, data: { needsReview: false } });

  return getItem(actor, id);
}

/**
 * AC-12. The delete is issued and Postgres decides. `StockCountLine_itemId_fkey` is
 * `ON DELETE RESTRICT`, so a referenced item fails with SQLSTATE 23001 before Prisma's own
 * referential layer sees it (004 AC-20b) — which is why the recovery counts the lines
 * rather than reading a Prisma error code that is not there.
 */
export async function deleteItem(actor: SessionUser, id: string): Promise<void> {
  assertRole(actor, "ADMIN");

  const item = await loadItem(id);

  try {
    await db.item.delete({ where: { id } });
  } catch (error) {
    const lineCount = await db.stockCountLine.count({ where: { itemId: id } });
    if (lineCount > 0) {
      throw new ConflictError(itemHasCountLines(item.description, lineCount));
    }
    throw error;
  }
}
