import { normaliseUnit } from "@/lib/units";
import { db } from "@/server/db";
import type { SessionUser } from "@/server/auth/session-user";

/**
 * Level 2 fixtures for feature #6 (`docs/verification.md`): real rows in a real Postgres,
 * built through Prisma rather than through the services under test — a fixture that used
 * `createItem` could not fail independently of the thing it is meant to prove.
 *
 * It lives under `tests/` rather than under `src/server/items/` for one specific reason:
 * spec 006 AC-31 permits exactly nine SHIPPING modules to name the price column, and the
 * scan that enforces it reads every non-test file under `src/` and `scripts/`. A fixture
 * is not a shipping module, and a tenth file naming the column would turn AC-31 red for a
 * file that never answers a request. `tests/e2e/support/users.ts` sets the precedent of a
 * fixture importing `@/server/db`.
 */

export const ADMIN: SessionUser = {
  id: "user_admin_fixture",
  username: "admin",
  name: "Fixture Administrator",
  role: "ADMIN",
};

export const STAFF: SessionUser = {
  id: "user_staff_fixture",
  username: "staff",
  name: "Fixture Yard Staff",
  role: "YARD_STAFF",
};

export const DUBLIN_ID = "loc_dublin";
export const CLONMEL_ID = "loc_clonmel";

export async function makeSupplier(name: string, active = true): Promise<string> {
  const supplier = await db.supplier.create({ data: { name, active }, select: { id: true } });
  return supplier.id;
}

export async function makeItemType(code: string, sortOrder: number, name = code): Promise<string> {
  const type = await db.itemType.create({
    data: { code, name, sortOrder },
    select: { id: true },
  });
  return type.id;
}

export type MakeItemInput = {
  description: string;
  supplierId?: string | null;
  itemTypeId: string;
  unitLabel?: string | null;
  active?: boolean;
  needsReview?: boolean;
  notes?: string | null;
};

export async function makeItem(input: MakeItemInput): Promise<string> {
  const unit = normaliseUnit(input.unitLabel ?? null);

  const item = await db.item.create({
    data: {
      description: input.description,
      supplierId: input.supplierId ?? null,
      itemTypeId: input.itemTypeId,
      unitLabel: unit.unitLabel,
      unitKind: unit.unitKind,
      unitQuantityKg: unit.unitQuantityKg,
      active: input.active ?? true,
      needsReview: input.needsReview ?? false,
      notes: input.notes ?? null,
    },
    select: { id: true },
  });

  return item.id;
}

/** A price. The amount stays a STRING all the way to Prisma (docs/architecture.md). */
export async function makePrice(
  itemId: string,
  amount: string,
  effectiveFrom: string,
  label: string | null = null,
): Promise<string> {
  const price = await db.itemPrice.create({
    data: {
      itemId,
      unitPrice: amount,
      effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`),
      label,
    },
    select: { id: true },
  });
  return price.id;
}

export async function makeLink(
  itemId: string,
  locationId: string,
  sortOrder: number,
  active = true,
): Promise<string> {
  const link = await db.itemLocation.create({
    data: { itemId, locationId, sortOrder, active },
    select: { id: true },
  });
  return link.id;
}

/** A user row, so a `StockCount` has a creator. */
export async function makeUser(role: "ADMIN" | "YARD_STAFF" = "ADMIN"): Promise<string> {
  const user = await db.user.create({
    data: {
      username: `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 10)}`,
      name: "Fixture user",
      // No PIN: no test here signs in. ACTIVE, because a profile with no status given is a
      // request, and a request has no username (021 `User_pending_shape`).
      status: "ACTIVE",
      role,
    },
    select: { id: true },
  });
  return user.id;
}

/**
 * A count with one line naming `itemId`, so `Item_id`'s RESTRICT foreign key has
 * something to refuse (AC-11, AC-12).
 */
export async function makeCountLine(
  itemId: string,
  options: { quantity?: string; unitPriceSnapshot?: string | null; note?: string | null } = {},
): Promise<{ countId: string; lineId: string }> {
  const createdById = await makeUser("ADMIN");

  const count = await db.stockCount.create({
    data: {
      locationId: DUBLIN_ID,
      periodYear: 2026,
      periodMonth: 8,
      countDate: new Date("2026-08-31T00:00:00.000Z"),
      createdById,
    },
    select: { id: true },
  });

  const line = await db.stockCountLine.create({
    data: {
      stockCountId: count.id,
      itemId,
      quantity: options.quantity ?? "12.5000",
      unitPriceSnapshot: options.unitPriceSnapshot ?? "33.09000000",
      note: options.note ?? null,
    },
    select: { id: true },
  });

  return { countId: count.id, lineId: line.id };
}

/** Every row count this feature must be able to prove it did not change (AC-4). */
export async function tableCounts(): Promise<Record<string, number>> {
  return {
    item: await db.item.count(),
    itemPrice: await db.itemPrice.count(),
    itemLocation: await db.itemLocation.count(),
    supplier: await db.supplier.count(),
    itemType: await db.itemType.count(),
  };
}

/** The multiset AC-23 asserts is identical before and after any sequence of moves. */
export async function sortOrdersAt(locationId: string): Promise<number[]> {
  const links = await db.itemLocation.findMany({
    where: { locationId },
    select: { sortOrder: true },
  });
  return links.map((link) => link.sortOrder).sort((left, right) => left - right);
}

/**
 * Bulk fixtures. AC-23 needs a 70-row Clonmel sheet and AC-24 an 84-row Dublin one; built
 * one `create` at a time against a Neon branch that is a network hop away, those two
 * tests alone cost minutes. `createMany` with explicit ids is the same rows in two
 * statements — and the ids have to be explicit because `createMany` returns none.
 */
export function fixtureId(prefix: string, index: number): string {
  return `${prefix}_${String(index).padStart(4, "0")}`;
}

export type BulkItemSpec = {
  id: string;
  description: string;
  itemTypeId: string;
  supplierId?: string | null;
  unitLabel?: string | null;
  active?: boolean;
  needsReview?: boolean;
  notes?: string | null;
};

export async function makeItemsBulk(specs: readonly BulkItemSpec[]): Promise<void> {
  await db.item.createMany({
    data: specs.map((spec) => {
      const unit = normaliseUnit(spec.unitLabel ?? null);
      return {
        id: spec.id,
        description: spec.description,
        supplierId: spec.supplierId ?? null,
        itemTypeId: spec.itemTypeId,
        unitLabel: unit.unitLabel,
        unitKind: unit.unitKind,
        unitQuantityKg: unit.unitQuantityKg,
        active: spec.active ?? true,
        needsReview: spec.needsReview ?? false,
        notes: spec.notes ?? null,
      };
    }),
  });
}

export async function makeLinksBulk(
  links: readonly { itemId: string; locationId: string; sortOrder: number; active?: boolean }[],
): Promise<void> {
  await db.itemLocation.createMany({
    data: links.map((link) => ({
      itemId: link.itemId,
      locationId: link.locationId,
      sortOrder: link.sortOrder,
      active: link.active ?? true,
    })),
  });
}

/**
 * Prices in one statement (feature #9).
 *
 * A count is 82 lines, and 82 `itemPrice.create` calls is 82 round trips to a database in
 * another region — which is slow enough to matter and long enough to drop a link. The
 * amount stays a STRING all the way to Prisma, exactly as `makePrice` keeps it.
 */
export async function makePricesBulk(
  prices: readonly { itemId: string; amount: string; effectiveFrom: string; label?: string | null }[],
): Promise<void> {
  await db.itemPrice.createMany({
    data: prices.map((price) => ({
      itemId: price.itemId,
      unitPrice: price.amount,
      effectiveFrom: new Date(`${price.effectiveFrom}T00:00:00.000Z`),
      label: price.label ?? null,
    })),
  });
}
