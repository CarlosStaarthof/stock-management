import {
  itemTypeCodeAlreadyExists,
  itemTypeHasItems,
  itemTypeNotFound,
} from "@/lib/item-master-messages";
import { assertRole } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";
import { parseItemTypeInput, parseMoveDirection } from "@/server/items/item-master-input";

/**
 * Item types — the groups the yard sheet is read in (`specs/domain-model.md` Part 2).
 *
 * There is NO archive here, and that is a schema fact rather than an omission: Part 3
 * gives `ItemType` no `active` column, and spec 006 adds no migration (AC-27, open
 * question 6). A type nothing references can be deleted; a type something references
 * cannot, and says so in its own words.
 *
 * `moveItemType` swaps `sortOrder` with its neighbour under the same rule as the yard
 * sheet: the multiset of values is identical before and after, so a gap somebody left on
 * purpose survives being reordered around.
 */

export type ItemTypeRow = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  itemCount: number;
};

export async function listItemTypes(actor: SessionUser): Promise<ItemTypeRow[]> {
  assertRole(actor, "ADMIN");

  const types = await db.itemType.findMany({
    select: {
      id: true,
      code: true,
      name: true,
      sortOrder: true,
      _count: { select: { items: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });

  return types.map((type) => ({
    id: type.id,
    code: type.code,
    name: type.name,
    sortOrder: type.sortOrder,
    itemCount: type._count.items,
  }));
}

async function requireItemType(
  id: string,
): Promise<{ id: string; code: string; name: string; sortOrder: number }> {
  const type = await db.itemType.findUnique({
    where: { id },
    select: { id: true, code: true, name: true, sortOrder: true },
  });
  if (type === null) throw new NotFoundError(itemTypeNotFound(id));
  return type;
}

/** A duplicate `code` in any case (AC-27). */
async function assertCodeFree(code: string, exceptId: string | null): Promise<void> {
  const clash = await db.itemType.findFirst({
    where: {
      code: { equals: code, mode: "insensitive" },
      ...(exceptId === null ? {} : { NOT: { id: exceptId } }),
    },
    select: { code: true },
  });

  if (clash !== null) throw new ConflictError(itemTypeCodeAlreadyExists(clash.code));
}

export async function createItemType(actor: SessionUser, raw: unknown): Promise<ItemTypeRow> {
  assertRole(actor, "ADMIN");

  const input = parseItemTypeInput(raw);
  await assertCodeFree(input.code, null);

  // The next position after the greatest, so a new type lands at the bottom of the sheet
  // rather than in the middle of a group staff already know the order of.
  const highest = await db.itemType.aggregate({ _max: { sortOrder: true } });

  const created = await db.itemType.create({
    data: {
      code: input.code,
      name: input.name,
      sortOrder: (highest._max.sortOrder ?? 0) + 1,
    },
    select: { id: true, code: true, name: true, sortOrder: true },
  });

  return { ...created, itemCount: 0 };
}

export async function updateItemType(
  actor: SessionUser,
  id: string,
  raw: unknown,
): Promise<ItemTypeRow> {
  assertRole(actor, "ADMIN");

  const input = parseItemTypeInput(raw);
  await requireItemType(id);
  await assertCodeFree(input.code, id);

  const updated = await db.itemType.update({
    where: { id },
    data: { code: input.code, name: input.name },
    select: {
      id: true,
      code: true,
      name: true,
      sortOrder: true,
      _count: { select: { items: true } },
    },
  });

  return {
    id: updated.id,
    code: updated.code,
    name: updated.name,
    sortOrder: updated.sortOrder,
    itemCount: updated._count.items,
  };
}

export async function moveItemType(
  actor: SessionUser,
  id: string,
  rawDirection: string,
): Promise<void> {
  assertRole(actor, "ADMIN");

  const direction = parseMoveDirection(rawDirection);
  await requireItemType(id);

  const ordered = await db.itemType.findMany({
    select: { id: true, sortOrder: true, code: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
  });

  const index = ordered.findIndex((type) => type.id === id);
  const neighbourIndex = direction === "UP" ? index - 1 : index + 1;
  // First row up, last row down: a no-op with no write, so no value is renumbered.
  if (index === -1 || neighbourIndex < 0 || neighbourIndex >= ordered.length) return;

  const type = ordered[index];
  const neighbour = ordered[neighbourIndex];

  await db.$transaction([
    db.itemType.update({ where: { id: type.id }, data: { sortOrder: neighbour.sortOrder } }),
    db.itemType.update({ where: { id: neighbour.id }, data: { sortOrder: type.sortOrder } }),
  ]);
}

export async function deleteItemType(actor: SessionUser, id: string): Promise<void> {
  assertRole(actor, "ADMIN");

  const type = await requireItemType(id);

  try {
    await db.itemType.delete({ where: { id } });
  } catch (error) {
    const itemCount = await db.item.count({ where: { itemTypeId: id } });
    if (itemCount > 0) {
      throw new ConflictError(itemTypeHasItems(type.name, itemCount));
    }
    throw error;
  }
}
