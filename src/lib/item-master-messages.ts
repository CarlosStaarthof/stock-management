/**
 * Every user-facing literal spec 006 quotes, in one module.
 *
 * Spec 006 AC-28: the screen and the test read the SAME literal, so they cannot drift
 * apart — a message that exists twice is a message that will one day exist in two
 * spellings. `src/lib/auth-messages.ts` is the same idea for feature #3.
 *
 * Nothing here names the price column: AC-31 keeps `src/lib/**` at zero files naming it,
 * and these are strings a human reads, not a column a service selects.
 */

import type { ReviewReason } from "@/types/item-master";

/* ------------------------------------------------------------------ empty states */

export const NO_ITEMS_YET =
  "No items yet. Run npm run seed:workbook, or add the first item.";

export const NO_ITEMS_MATCH = "No items match those filters.";

/** Invariant 4: a line with no price counts as zero, and the count summary says so. */
export const NO_PRICE_RECORDED =
  "No price recorded. Lines for this item will count as 0 and raise a warning on the count summary.";

/** `No items are assigned to Dublin yet.` */
export function noItemsAssigned(locationName: string): string {
  return `No items are assigned to ${locationName} yet.`;
}

export const NO_PRICES_YET = "No prices recorded yet.";

export const NO_SUPPLIERS_YET = "No suppliers yet. Add the first one.";

export const NO_ITEM_TYPES_YET = "No item types yet. Add the first one.";

/* ------------------------------------------------------------ field placeholders */

export const NO_SUPPLIER = "No supplier";
export const NO_UNIT = "No unit";
export const NO_PRICE = "No price";
export const NO_CURRENT_PRICE = "No current price";
export const ARCHIVED_SUPPLIER_SUFFIX = "(archived)";

/* ----------------------------------------------------------------------- tags */

export const NEEDS_REVIEW_TAG = "Needs review";
export const NOTE_TAG = "Note";
export const ARCHIVED_TAG = "Archived";
export const CURRENT_PRICE_TAG = "Current";

/**
 * The two below-total fuel rows of 005 open question 1: flagged for provenance and
 * missing nothing, so they carry no reason tag (AC-18).
 */
export const FLAGGED_AT_IMPORT = "Flagged at import";

export const IMPORT_NOTES_HEADING = "Import notes";

/** The reason tags of AC-18, which are the same strings as the field placeholders. */
export const REVIEW_REASON_TAG: Record<ReviewReason, string> = {
  MISSING_SUPPLIER: NO_SUPPLIER,
  MISSING_UNIT: NO_UNIT,
  MISSING_PRICE: NO_PRICE,
};

/** The same three reasons as a sentence fragment, for `markItemReviewed`'s refusal. */
const REVIEW_REASON_PHRASE: Record<ReviewReason, string> = {
  MISSING_SUPPLIER: "no supplier",
  MISSING_UNIT: "no unit label",
  MISSING_PRICE: "no price recorded",
};

/* --------------------------------------------------------------------- controls */

export const ADD_ITEM = "Add item";
export const SAVE = "Save";
export const ADD_PRICE = "Add price";
export const ASSIGN = "Assign";
export const UNASSIGN = "Unassign";
export const MOVE_UP = "Move up";
export const MOVE_DOWN = "Move down";
export const DELETE = "Delete";
export const ARCHIVE = "Archive";
export const RESTORE = "Restore";
export const RENAME = "Rename";
export const MARK_REVIEWED = "Mark as reviewed";
export const CLEAR_FILTERS = "Clear filters";
export const SHOW_ARCHIVED = "Show archived";
export const SEARCH_LABEL = "Search items";

/* ------------------------------------------------------------- confirmations */

export const SAVED = "Saved.";
export const PRICE_ADDED = "Price added.";
export const ARCHIVED = "Archived.";
export const RESTORED = "Restored.";
export const MARKED_AS_REVIEWED = "Marked as reviewed.";
export const ASSIGNED = "Assigned.";
export const UNASSIGNED = "Unassigned.";
export const MOVED = "Moved.";
export const DELETED = "Deleted.";
export const SUPPLIER_SAVED = "Supplier saved.";
export const ITEM_TYPE_SAVED = "Item type saved.";

/* --------------------------------------------------------------- validation */

/** Invariant 9, at the form as well as at `Item_description_not_empty` (AC-8). */
export const DESCRIPTION_REQUIRED = "Description is required.";
export const ITEM_TYPE_REQUIRED = "An item type is required.";
export const SUPPLIER_NAME_REQUIRED = "Supplier name is required.";
export const ITEM_TYPE_CODE_REQUIRED = "An item type code is required.";
export const ITEM_TYPE_NAME_REQUIRED = "An item type name is required.";
export const PRICE_REQUIRED =
  "A price is required, as a number with at most 10 digits before the point and 8 after it.";
export const EFFECTIVE_FROM_REQUIRED = "A date in the form YYYY-MM-DD is required.";
export const DIRECTION_REQUIRED = "A direction of UP or DOWN is required.";

/** `Cannot mark reviewed: no price recorded.` */
export function cannotMarkReviewed(reasons: readonly ReviewReason[]): string {
  return `Cannot mark reviewed: ${reasons.map((reason) => REVIEW_REASON_PHRASE[reason]).join(", ")}.`;
}

/* ----------------------------------------------------------------- conflicts */

/**
 * `An item "Beads" already exists for supplier Kelly.`, and for the case Postgres cannot
 * see — two NULL suppliers — `An item "School Logo Triangle" already exists for no
 * supplier.` (AC-9).
 */
export function itemAlreadyExists(description: string, supplierName: string | null): string {
  const owner = supplierName === null ? "no supplier" : `supplier ${supplierName}`;
  return `An item "${description}" already exists for ${owner}.`;
}

/** `A price for "Beads" effective 2026-10-01 already exists. …` (AC-14). */
export function priceDateAlreadyUsed(description: string, effectiveFrom: string): string {
  return (
    `A price for "${description}" effective ${effectiveFrom} already exists. ` +
    "Prices are never overwritten: choose a later date."
  );
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** `"Beads" appears on 3 count lines and cannot be deleted. Archive it instead.` (AC-12). */
export function itemHasCountLines(description: string, lineCount: number): string {
  return `"${description}" appears on ${plural(lineCount, "count line", "count lines")} and cannot be deleted. Archive it instead.`;
}

/** `Kelly supplies 27 items and cannot be deleted. Archive it instead.` (AC-26). */
export function supplierHasItems(name: string, itemCount: number): string {
  return `${name} supplies ${plural(itemCount, "item", "items")} and cannot be deleted. Archive it instead.`;
}

/**
 * The same refusal for a type, with its own words: `ItemType` has no `active` column
 * (Part 3) and this feature adds no migration, so there is no archive to offer (AC-27).
 */
export function itemTypeHasItems(name: string, itemCount: number): string {
  return `${name} is used by ${plural(itemCount, "item", "items")} and cannot be deleted. Move them to another type first.`;
}

export function supplierNameAlreadyExists(name: string): string {
  return `A supplier named ${name} already exists.`;
}

export function itemTypeCodeAlreadyExists(code: string): string {
  return `An item type with code ${code} already exists.`;
}

/* ------------------------------------------------------------------ not found */

export function itemNotFound(id: string): string {
  return `No item with id ${id}.`;
}

export function supplierNotFound(id: string): string {
  return `No supplier with id ${id}.`;
}

export function itemTypeNotFound(id: string): string {
  return `No item type with id ${id}.`;
}

/** AC-21: assigning to an unknown `locationCode` names the code. */
export function locationNotFound(code: string): string {
  return `No yard with code ${code}.`;
}

export function itemNotAssigned(description: string, locationName: string): string {
  return `${description} is not assigned to ${locationName}.`;
}

/* --------------------------------------------------------------------- prose */

export const DELETE_CONFIRM_HEADING = "Delete this item?";

/** The delete page states what goes with the item (AC-12). */
export function deleteConfirmBody(
  description: string,
  priceCount: number,
  linkCount: number,
): string {
  return (
    `Deleting ${description} also deletes its ${plural(priceCount, "price", "prices")} ` +
    `and its ${plural(linkCount, "yard assignment", "yard assignments")}. ` +
    "This cannot be undone. Archive it instead if you may need it again."
  );
}

/* ------------------------------------------------------- post-redirect confirmation */

/**
 * A successful action redirects and the fresh page names what changed (AC-28). The KEY
 * travels in the query string, never the sentence: a link is something anybody can write,
 * and the words an admin reads come from this module or from nowhere.
 */
export const DONE_MESSAGE: Record<string, string> = {
  saved: SAVED,
  "price-added": PRICE_ADDED,
  archived: ARCHIVED,
  restored: RESTORED,
  reviewed: MARKED_AS_REVIEWED,
  assigned: ASSIGNED,
  unassigned: UNASSIGNED,
  moved: MOVED,
  deleted: DELETED,
  "supplier-saved": SUPPLIER_SAVED,
  "type-saved": ITEM_TYPE_SAVED,
};

/**
 * The sentence for a key, or `null`.
 *
 * `Object.hasOwn` and not `DONE_MESSAGE[key] ?? null`, because the key comes off a query
 * string and an object literal inherits `Object.prototype`. `?done=toString` would have
 * returned a FUNCTION from a lookup TypeScript believes returns a `string`, `Notices`
 * would have rendered it, and React would have thrown — a crash anybody could put in a
 * link. The same hole swallows `constructor` and `valueOf`; `__proto__` returns an object.
 */
export function doneMessage(key: string | undefined): string | null {
  if (key === undefined) return null;
  if (!Object.hasOwn(DONE_MESSAGE, key)) return null;

  const message = DONE_MESSAGE[key];
  return typeof message === "string" ? message : null;
}
