"use server";

import { redirect } from "next/navigation";

import { requireRole } from "@/server/auth/session";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import {
  assignItemToLocation,
  moveItemInSheet,
  unassignItemFromLocation,
} from "@/server/items/item-assignment-service";
import { addPrice } from "@/server/items/item-price-service";
import {
  createItem,
  deleteItem,
  markItemReviewed,
  setItemActive,
  updateItem,
} from "@/server/items/item-service";
import {
  createItemType,
  deleteItemType,
  moveItemType,
  updateItemType,
} from "@/server/items/item-type-service";
import {
  createSupplier,
  deleteSupplier,
  renameSupplier,
  setSupplierActive,
} from "@/server/items/supplier-service";

import { toFormState, valuesOf } from "@/app/item-master/form-state";
import type { FormState } from "@/app/item-master/form-state";

/**
 * Every write this feature makes, and the only place a screen may make one.
 *
 * TWO RULES, both asserted by a source scan of this file (006 AC-5).
 *
 * 1. THE ACTOR COMES FROM THE SESSION. Every exported action begins with
 *    `await requireRole("ADMIN")` — one call each, no wrapper, no helper that could grow
 *    a second path — and the role is read from the stored `User` row on every request
 *    (003 AC-18). Nothing here reads `role`, `actor`, `actorId` or `userId` from a
 *    `FormData`: a form field is something the sender chooses.
 * 2. ONE SERVICE PER ACTION. An action parses the form, calls one service, and either
 *    redirects or hands back inline form state. No Prisma query lives here
 *    (docs/architecture.md, dependency rule).
 *
 * ON SUCCESS AN ACTION REDIRECTS, and the fresh page names what changed. That is
 * deliberate rather than incidental: AC-28 requires the new value to be present in a
 * freshly rendered page, so the test proves the row was written and not that a component
 * rendered optimistically.
 */

/* --------------------------------------------------------------------- plumbing */

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * The three domain errors a screen can act on, as a message. Anything else is a bug and
 * is re-thrown to the shared error boundary from #2 (docs/architecture.md).
 */
async function outcomeOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError
    ) {
      return error.message;
    }
    throw error;
  }
}

/**
 * `?done=<key>` on success, `?error=<the service's message>` on a refusal. The KEY, never
 * the sentence: the words come from `src/lib/item-master-messages.ts` (AC-28).
 */
function outcomePath(path: string, doneKey: string, error: string | null): string {
  const query = new URLSearchParams(
    error === null ? { done: doneKey } : { error },
  );
  return `${path}?${query.toString()}`;
}

/**
 * Where a yard-sheet control returns to. It is a form field, so it is something the
 * sender chooses — and a redirect target an attacker can put in a link is exactly the
 * shape `safeCallbackPath` in `src/app/auth-actions.ts` already refuses. Only a path
 * INSIDE this feature survives; anything else falls back to the item.
 */
function itemPath(itemId: string): string {
  // Encoded, so an id carrying `/` or `..` cannot steer the redirect somewhere else.
  return `/item-master/items/${encodeURIComponent(itemId)}`;
}

function safeReturnPath(raw: string, fallback: string): string {
  if (!raw.startsWith("/item-master") || raw.startsWith("//")) return fallback;
  return raw;
}

const ITEM_FIELDS = ["description", "supplierId", "itemTypeId", "unitLabel", "notes"] as const;
const PRICE_FIELDS = ["itemId", "unitPrice", "effectiveFrom", "label"] as const;

/* ------------------------------------------------------------------------ items */

export async function createItemAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireRole("ADMIN");
  const values = valuesOf(formData, ITEM_FIELDS);

  let createdId: string;
  try {
    const created = await createItem(actor, {
      description: values.description,
      supplierId: values.supplierId,
      itemTypeId: values.itemTypeId,
      unitLabel: values.unitLabel,
      notes: values.notes,
    });
    createdId = created.id;
  } catch (error) {
    return toFormState(error, values, previous.attempt);
  }

  redirect(outcomePath(itemPath(createdId), "saved", null));
}

export async function updateItemAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireRole("ADMIN");
  const values = valuesOf(formData, ITEM_FIELDS);
  const itemId = stringField(formData, "itemId");

  try {
    await updateItem(actor, itemId, {
      description: values.description,
      supplierId: values.supplierId,
      itemTypeId: values.itemTypeId,
      unitLabel: values.unitLabel,
      notes: values.notes,
    });
  } catch (error) {
    return toFormState(error, values, previous.attempt);
  }

  redirect(outcomePath(itemPath(itemId), "saved", null));
}

export async function archiveItemAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const itemId = stringField(formData, "itemId");

  const error = await outcomeOf(() => setItemActive(actor, itemId, false));

  redirect(outcomePath(itemPath(itemId), "archived", error));
}

export async function restoreItemAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const itemId = stringField(formData, "itemId");

  const error = await outcomeOf(() => setItemActive(actor, itemId, true));

  redirect(outcomePath(itemPath(itemId), "restored", error));
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const itemId = stringField(formData, "itemId");

  const error = await outcomeOf(() => deleteItem(actor, itemId));

  // A deleted item has no page left to return to, so success lands on the list; a refusal
  // goes back to the item, which still exists (AC-12).
  redirect(
    error === null
      ? outcomePath("/item-master", "deleted", null)
      : outcomePath(itemPath(itemId), "deleted", error),
  );
}

export async function markItemReviewedAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const itemId = stringField(formData, "itemId");

  const error = await outcomeOf(() => markItemReviewed(actor, itemId));

  redirect(outcomePath(itemPath(itemId), "reviewed", error));
}

/* ----------------------------------------------------------------------- prices */

export async function addItemPriceAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireRole("ADMIN");
  const values = valuesOf(formData, PRICE_FIELDS);

  try {
    await addPrice(actor, {
      itemId: values.itemId,
      unitPrice: values.unitPrice,
      effectiveFrom: values.effectiveFrom,
      label: values.label,
    });
  } catch (error) {
    return toFormState(error, values, previous.attempt);
  }

  redirect(outcomePath(itemPath(values.itemId), "price-added", null));
}

/* ------------------------------------------------------------------ assignments */

export async function assignItemAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const itemId = stringField(formData, "itemId");
  const locationCode = stringField(formData, "locationCode");
  const returnTo = stringField(formData, "returnTo");

  const error = await outcomeOf(() => assignItemToLocation(actor, itemId, locationCode));

  redirect(
    outcomePath(safeReturnPath(returnTo, itemPath(itemId)), "assigned", error),
  );
}

export async function unassignItemAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const itemId = stringField(formData, "itemId");
  const locationCode = stringField(formData, "locationCode");
  const returnTo = stringField(formData, "returnTo");

  const error = await outcomeOf(() => unassignItemFromLocation(actor, itemId, locationCode));

  redirect(
    outcomePath(safeReturnPath(returnTo, itemPath(itemId)), "unassigned", error),
  );
}

export async function moveItemInSheetAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const itemId = stringField(formData, "itemId");
  const locationCode = stringField(formData, "locationCode");
  const direction = stringField(formData, "direction");

  const error = await outcomeOf(() =>
    moveItemInSheet(actor, itemId, locationCode, direction),
  );

  // A yard code the service refused is not a page, so a refusal returns to the list.
  redirect(
    outcomePath(
      error === null ? `/item-master/yards/${encodeURIComponent(locationCode)}` : "/item-master",
      "moved",
      error,
    ),
  );
}

/* -------------------------------------------------------------------- suppliers */

export async function createSupplierAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireRole("ADMIN");
  const values = valuesOf(formData, ["name"]);

  try {
    await createSupplier(actor, { name: values.name });
  } catch (error) {
    return toFormState(error, values, previous.attempt);
  }

  redirect(outcomePath("/item-master/suppliers", "supplier-saved", null));
}

/**
 * Renaming is a row control rather than a form with state: the input is rendered from the
 * stored name, so a refusal costs nothing to recover from and the message belongs above
 * the table rather than beside one row of it.
 */
export async function renameSupplierAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const supplierId = stringField(formData, "supplierId");
  const name = stringField(formData, "name");

  const error = await outcomeOf(() => renameSupplier(actor, supplierId, { name }));

  redirect(outcomePath("/item-master/suppliers", "supplier-saved", error));
}

export async function archiveSupplierAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const supplierId = stringField(formData, "supplierId");

  const error = await outcomeOf(() => setSupplierActive(actor, supplierId, false));

  redirect(outcomePath("/item-master/suppliers", "archived", error));
}

export async function restoreSupplierAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const supplierId = stringField(formData, "supplierId");

  const error = await outcomeOf(() => setSupplierActive(actor, supplierId, true));

  redirect(outcomePath("/item-master/suppliers", "restored", error));
}

export async function deleteSupplierAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const supplierId = stringField(formData, "supplierId");

  const error = await outcomeOf(() => deleteSupplier(actor, supplierId));

  redirect(outcomePath("/item-master/suppliers", "deleted", error));
}

/* ------------------------------------------------------------------ item types */

export async function createItemTypeAction(
  previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const actor = await requireRole("ADMIN");
  const values = valuesOf(formData, ["code", "name"]);

  try {
    await createItemType(actor, { code: values.code, name: values.name });
  } catch (error) {
    return toFormState(error, values, previous.attempt);
  }

  redirect(outcomePath("/item-master/types", "type-saved", null));
}

export async function renameItemTypeAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const itemTypeId = stringField(formData, "itemTypeId");
  const code = stringField(formData, "code");
  const name = stringField(formData, "name");

  const error = await outcomeOf(() => updateItemType(actor, itemTypeId, { code, name }));

  redirect(outcomePath("/item-master/types", "type-saved", error));
}

export async function moveItemTypeAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const itemTypeId = stringField(formData, "itemTypeId");
  const direction = stringField(formData, "direction");

  const error = await outcomeOf(() => moveItemType(actor, itemTypeId, direction));

  redirect(outcomePath("/item-master/types", "moved", error));
}

export async function deleteItemTypeAction(formData: FormData): Promise<void> {
  const actor = await requireRole("ADMIN");
  const itemTypeId = stringField(formData, "itemTypeId");

  const error = await outcomeOf(() => deleteItemType(actor, itemTypeId));

  redirect(outcomePath("/item-master/types", "deleted", error));
}
