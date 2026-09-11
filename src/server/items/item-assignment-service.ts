import { itemNotAssigned, itemNotFound, locationNotFound } from "@/lib/item-master-messages";
import { assertRole, assertUser } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import { parseLocationCode, parseMoveDirection } from "@/server/items/item-master-input";
import type { MoveDirection } from "@/server/items/item-master-input";
import { toCurrentPrice, toPriceRows, todayIso } from "@/server/items/price-selection";
import type { PriceRecord } from "@/server/items/price-selection";
import { sheetEntriesForRole } from "@/server/items/sheet-shape";
import type { SheetEntry, StaffSheetEntry } from "@/server/items/sheet-shape";

/**
 * The per-yard sheet: which items a yard counts, and in what order it walks them.
 *
 * `listSheet` is the one definition of a yard sheet, and #7 will read it here rather than
 * re-deriving it (006 AC-24). Three rules make it stable:
 *
 *  * UNASSIGNING KEEPS THE ROW. `ItemLocation.active = false`, never a delete, so
 *    `sortOrder` — and therefore the item's place on the printed sheet — survives a
 *    mistake. Re-assigning puts it back where it was (AC-22, open question 4).
 *  * REORDERING IS A SWAP, IN ONE TRANSACTION. Two rows exchange `sortOrder`, so the
 *    MULTISET of `sortOrder` values at a yard is identical before and after any sequence
 *    of moves. Clonmel's 71-74 gap records that the fuel rows sit below the total row, and
 *    `sortOrder` is the workbook's own source row number (005 open question 4) — so there
 *    is no renumber action here and never will be (AC-23, open question 5).
 *  * A NEW ASSIGNMENT TAKES `max + 1`, counting inactive links too, so a re-used number
 *    can never collide with a row somebody unassigned last month (AC-21).
 *
 * This module deliberately does not name the price column: it reads whole `ItemPrice`
 * rows and hands them to `price-selection.ts`, which is one of the nine modules AC-31
 * permits to name it.
 */

/**
 * A sheet row. TWO SHAPES SINCE #7, and which one you get is the session's business:
 * `AdminSheetEntry` carries `currentPrice`, `StaffSheetEntry` has no such key at all
 * (007 AC-14). They live in `sheet-shape.ts` with the function that chooses between them.
 */
export type { AdminSheetEntry, SheetEntry, StaffSheetEntry } from "@/server/items/sheet-shape";

export type ListSheetOptions = {
  /** Include unassigned links and archived items, each marked with why (AC-24). */
  includeArchived?: boolean;
};

type LinkRecord = {
  id: string;
  sortOrder: number;
  active: boolean;
  item: {
    id: string;
    description: string;
    unitLabel: string | null;
    active: boolean;
    prices: PriceRecord[];
  };
};

async function locationByCode(code: string): Promise<{ id: string; name: string; code: string }> {
  const parsed = parseLocationCodeOrNotFound(code);

  const location = await db.location.findUnique({
    where: { code: parsed },
    select: { id: true, name: true, code: true },
  });
  if (location === null) throw new NotFoundError(locationNotFound(parsed));

  return location;
}

/**
 * A yard code that is not one of the two is a `NotFoundError` naming the code (AC-21),
 * not a `ValidationError`: the caller asked for a yard that does not exist, and there is
 * no form field on the screen to put a message beside.
 */
function parseLocationCodeOrNotFound(code: string): string {
  try {
    return parseLocationCode(code);
  } catch {
    throw new NotFoundError(locationNotFound(code));
  }
}

/** One link to the non-money half of a sheet row: the same fields for either role. */
function toStaffEntry(link: LinkRecord): StaffSheetEntry {
  return {
    itemId: link.item.id,
    description: link.item.description,
    unitLabel: link.item.unitLabel,
    sortOrder: link.sortOrder,
    linkActive: link.active,
    itemActive: link.item.active,
  };
}

/**
 * The yard sheet, ROLE-SHAPED (007 AC-14).
 *
 * THE GUARD MOVED, AND ONLY HERE. Until #7 every screen that could reach a sheet was
 * `ADMIN`-only, so `assertRole(actor, "ADMIN")` was enough. `specs/domain-model.md` Part 6
 * puts "create and edit a DRAFT count" in BOTH role columns, and the caller that needs a
 * sheet most is now a `YARD_STAFF` user starting a count — so this function and
 * `locationName` accept any signed-in actor, and `listSheet`'s RETURN VALUE is shaped from
 * `actor.role` instead. Every mutation below keeps `assertRole(actor, "ADMIN")`.
 *
 * A staff reader never has a price BUILT for them: `sheetEntriesForRole` takes the price
 * builder as a thunk and calls it only in the admin branch, so "not hidden — not sent"
 * (Part 6) is a mechanism rather than a discipline every future caller has to remember.
 * #8, #9 and #14 inherit safety.
 *
 * This function still does not name the price column: it reads whole `ItemPrice` rows and
 * hands them to `price-selection.ts`, which is one of the nine modules 006 AC-31 permits
 * to name it.
 */
export async function listSheet(
  actor: SessionUser,
  locationCode: string,
  options: ListSheetOptions = {},
  asOf: string = todayIso(),
): Promise<SheetEntry[]> {
  assertUser(actor);

  const location = await locationByCode(locationCode);
  const includeArchived = options.includeArchived === true;

  const links = (await db.itemLocation.findMany({
    where: {
      locationId: location.id,
      ...(includeArchived ? {} : { active: true, item: { active: true } }),
    },
    // Whole `ItemPrice` rows, handed straight to `price-selection.ts`. Naming the
    // columns here would make this a tenth module naming the price column, which spec
    // 006 AC-31 forbids - and the sheet needs only what `toCurrentPrice` needs.
    include: { item: { include: { prices: true } } },
  })) as LinkRecord[];

  // Sorted BEFORE shaping, so both roles read the sheet in one order and the comparator
  // never has to see a field one of the shapes does not have. `sortOrder` ascending, then
  // `description` ascending so a tie is deterministic and the sheet reads the same on two
  // consecutive loads (006 AC-24).
  const ordered = [...links].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.item.description.localeCompare(right.item.description),
  );

  return sheetEntriesForRole(actor, ordered, toStaffEntry, (link) =>
    toCurrentPrice(toPriceRows(link.item.prices), asOf),
  );
}

/**
 * The yard sheet's own name for a yard, for an empty-state message.
 *
 * Widened with `listSheet` (007 AC-14): a yard's NAME is not money, and #7's confirm
 * screen has to say `Dublin` to a staff user.
 */
export async function locationName(actor: SessionUser, locationCode: string): Promise<string> {
  assertUser(actor);
  return (await locationByCode(locationCode)).name;
}

async function requireItem(itemId: string): Promise<{ id: string; description: string }> {
  const item = await db.item.findUnique({
    where: { id: itemId },
    select: { id: true, description: true },
  });
  if (item === null) throw new NotFoundError(itemNotFound(itemId));
  return item;
}

export async function assignItemToLocation(
  actor: SessionUser,
  itemId: string,
  locationCode: string,
): Promise<void> {
  assertRole(actor, "ADMIN");

  const location = await locationByCode(locationCode);
  await requireItem(itemId);

  const existing = await db.itemLocation.findUnique({
    where: { itemId_locationId: { itemId, locationId: location.id } },
    select: { id: true, active: true },
  });

  if (existing !== null) {
    // Already on the sheet: a no-op rather than an error, so `@@unique([itemId,
    // locationId])` is never reached and a double click writes nothing (AC-21).
    if (existing.active) return;

    // An inactive link is REACTIVATED, same id and same sortOrder, so an item returns to
    // the position it held rather than to the bottom of the sheet.
    await db.itemLocation.update({ where: { id: existing.id }, data: { active: true } });
    return;
  }

  // `max + 1` across active AND inactive links: a number an unassigned row still holds is
  // not free.
  const highest = await db.itemLocation.aggregate({
    where: { locationId: location.id },
    _max: { sortOrder: true },
  });

  await db.itemLocation.create({
    data: {
      itemId,
      locationId: location.id,
      sortOrder: (highest._max.sortOrder ?? 0) + 1,
      active: true,
    },
  });
}

export async function unassignItemFromLocation(
  actor: SessionUser,
  itemId: string,
  locationCode: string,
): Promise<void> {
  assertRole(actor, "ADMIN");

  const location = await locationByCode(locationCode);
  const item = await requireItem(itemId);

  const existing = await db.itemLocation.findUnique({
    where: { itemId_locationId: { itemId, locationId: location.id } },
    select: { id: true, active: true },
  });
  if (existing === null) {
    throw new NotFoundError(itemNotAssigned(item.description, location.name));
  }
  if (!existing.active) return;

  // Deactivated, never deleted: `sortOrder` and `id` survive (AC-22).
  await db.itemLocation.update({ where: { id: existing.id }, data: { active: false } });
}

export async function moveItemInSheet(
  actor: SessionUser,
  itemId: string,
  locationCode: string,
  rawDirection: string,
): Promise<void> {
  assertRole(actor, "ADMIN");

  const direction: MoveDirection = parseMoveDirection(rawDirection);
  const location = await locationByCode(locationCode);
  await requireItem(itemId);

  const rows = await db.itemLocation.findMany({
    where: { locationId: location.id, active: true, item: { active: true } },
    select: { id: true, itemId: true, sortOrder: true, item: { select: { description: true } } },
  });

  const ordered = rows.sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.item.description.localeCompare(right.item.description),
  );

  const index = ordered.findIndex((row) => row.itemId === itemId);
  if (index === -1) {
    throw new NotFoundError(itemNotAssigned(itemId, location.name));
  }

  const neighbourIndex = direction === "UP" ? index - 1 : index + 1;
  // UP on the first row and DOWN on the last are no-ops: no error, and no write at all,
  // so the multiset of sortOrder values is untouched (AC-23).
  if (neighbourIndex < 0 || neighbourIndex >= ordered.length) return;

  const row = ordered[index];
  const neighbour = ordered[neighbourIndex];

  // One transaction, so the two rows are never briefly both at the same position.
  await db.$transaction([
    db.itemLocation.update({ where: { id: row.id }, data: { sortOrder: neighbour.sortOrder } }),
    db.itemLocation.update({ where: { id: neighbour.id }, data: { sortOrder: row.sortOrder } }),
  ]);
}
