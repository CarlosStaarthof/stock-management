import {
  supplierHasItems,
  supplierNameAlreadyExists,
  supplierNotFound,
} from "@/lib/item-master-messages";
import { assertRole } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { db } from "@/server/db";
import { ConflictError, NotFoundError } from "@/server/errors";
import { parseSupplierName } from "@/server/items/item-master-input";

/**
 * Suppliers.
 *
 * Archiving is `active = false` and it changes NO `Item` row: an item that already names
 * an archived supplier keeps naming it, marked `(archived)` on the form, because the
 * historical fact "Kelly supplied this" is not undone by Kelly leaving (006 AC-25).
 * `Item_supplierId_fkey` is `ON DELETE RESTRICT`, so a delete is attempted and Postgres
 * decides — the same shape as `deleteItem`, and for the same reason (AC-26).
 *
 * `name` is unique in the schema, case-sensitively. #5 already collapsed `Kellys` onto
 * `Kelly`, so the duplicate check here is case-INSENSITIVE: two suppliers differing only
 * in case are the mistake that produced that clean-up.
 */

export type SupplierRow = {
  id: string;
  name: string;
  active: boolean;
  itemCount: number;
};

export type ListSuppliersOptions = {
  includeArchived?: boolean;
};

export async function listSuppliers(
  actor: SessionUser,
  options: ListSuppliersOptions = {},
): Promise<SupplierRow[]> {
  assertRole(actor, "ADMIN");

  const suppliers = await db.supplier.findMany({
    where: options.includeArchived === true ? {} : { active: true },
    select: { id: true, name: true, active: true, _count: { select: { items: true } } },
  });

  return suppliers
    .map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      active: supplier.active,
      itemCount: supplier._count.items,
    }))
    .sort((left, right) => left.name.toLowerCase().localeCompare(right.name.toLowerCase()));
}

async function requireSupplier(id: string): Promise<{ id: string; name: string }> {
  const supplier = await db.supplier.findUnique({ where: { id }, select: { id: true, name: true } });
  if (supplier === null) throw new NotFoundError(supplierNotFound(id));
  return supplier;
}

/** `kelly` against `Kelly` is a duplicate (AC-25). Postgres's unique index sees two names. */
async function assertNameFree(name: string, exceptId: string | null): Promise<void> {
  const clash = await db.supplier.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId === null ? {} : { NOT: { id: exceptId } }),
    },
    select: { name: true },
  });

  if (clash !== null) throw new ConflictError(supplierNameAlreadyExists(clash.name));
}

export async function createSupplier(actor: SessionUser, raw: unknown): Promise<SupplierRow> {
  assertRole(actor, "ADMIN");

  const { name } = parseSupplierName(raw);
  await assertNameFree(name, null);

  const created = await db.supplier.create({ data: { name }, select: { id: true, name: true, active: true } });

  return { ...created, itemCount: 0 };
}

export async function renameSupplier(
  actor: SessionUser,
  id: string,
  raw: unknown,
): Promise<SupplierRow> {
  assertRole(actor, "ADMIN");

  const { name } = parseSupplierName(raw);
  await requireSupplier(id);
  await assertNameFree(name, id);

  // Every item's displayed supplier changes because no item stores the name — only the
  // foreign key. Nothing in `Item` is touched (AC-25).
  const updated = await db.supplier.update({
    where: { id },
    data: { name },
    select: { id: true, name: true, active: true, _count: { select: { items: true } } },
  });

  return {
    id: updated.id,
    name: updated.name,
    active: updated.active,
    itemCount: updated._count.items,
  };
}

export async function setSupplierActive(
  actor: SessionUser,
  id: string,
  active: boolean,
): Promise<void> {
  assertRole(actor, "ADMIN");

  await requireSupplier(id);
  await db.supplier.update({ where: { id }, data: { active } });
}

export async function deleteSupplier(actor: SessionUser, id: string): Promise<void> {
  assertRole(actor, "ADMIN");

  const supplier = await requireSupplier(id);

  try {
    await db.supplier.delete({ where: { id } });
  } catch (error) {
    const itemCount = await db.item.count({ where: { supplierId: id } });
    if (itemCount > 0) {
      throw new ConflictError(supplierHasItems(supplier.name, itemCount));
    }
    throw error;
  }
}
