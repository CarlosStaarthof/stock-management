import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * What `startCountAction` hands back to the confirm form when the write was refused.
 *
 * It is a module of its own because `actions.ts` carries `"use server"`, and every export
 * of such a file must be an async function — a type or a helper cannot live there. #6's
 * `src/app/item-master/form-state.ts` is the same idea; this one adds `existingCountId`.
 *
 * `field` is what turns a message into an inline one: a `ValidationError` names the input
 * that was wrong, so the screen puts the message beside it and keeps everything else
 * (AC-8, AC-23). A `ConflictError` names no field, renders above the form, and carries the
 * id of the count that already exists so the screen can offer it (AC-10).
 *
 * Anything that is not a domain error is re-thrown, so it reaches the shared error boundary
 * from #2 rather than being flattened into a message nobody can act on. That is also why no
 * Prisma or Postgres string can ever appear here (AC-27): only these three classes'
 * messages are copied, and every one of them is written in `src/lib/count-messages.ts`.
 */
export type StartCountState = {
  error: string | null;
  field: string | null;
  /** The count that already exists, when the refusal was a `ConflictError` (AC-10). */
  existingCountId: string | null;
  /** Bumped on every response, so a client can key on "something happened". */
  attempt: number;
};

export const EMPTY_START_COUNT_STATE: StartCountState = {
  error: null,
  field: null,
  existingCountId: null,
  attempt: 0,
};

/* ------------------------------------------------------------------ #8, the entry */

/**
 * One rendered quantity input's form field name (008 AC-16).
 *
 * The no-JavaScript path needs a field per row, and both ends have to agree on how a row
 * is named. Spelling it once here is why `saveQuantitiesAction` can be sure every field it
 * reads is a quantity and not somebody else's idea of one — and why nothing in this
 * feature reads a field whose name a sender chose freely.
 */
const QUANTITY_FIELD_PREFIX = "line.";

export function quantityFieldName(itemId: string): string {
  return `${QUANTITY_FIELD_PREFIX}${itemId}`;
}

/** The `itemId` a form field names, or `null` when the field is not one of ours. */
export function itemIdOfQuantityField(field: string): string | null {
  if (!field.startsWith(QUANTITY_FIELD_PREFIX)) return null;

  const itemId = field.slice(QUANTITY_FIELD_PREFIX.length);
  return itemId === "" ? null : itemId;
}

/**
 * What `saveQuantitiesAction` hands back when a no-JavaScript submission was refused.
 *
 * `itemId` is what turns the AC-7 message into an inline one. `ValidationError.field` is
 * `"quantity"`, which names the column and not the row, so the ACTION attributes the
 * refusal itself: it parses field by field, and the first field that refuses is the row
 * the sentence belongs beside (008 AC-16, AC-25). Everything else keeps its typed text,
 * because nothing was written.
 */
export type SaveQuantitiesState = {
  error: string | null;
  /** The row the message belongs beside, when the refusal names one. */
  itemId: string | null;
  /** Bumped on every response, so a client can key on "something happened". */
  attempt: number;
};

export const EMPTY_SAVE_QUANTITIES_STATE: SaveQuantitiesState = {
  error: null,
  itemId: null,
  attempt: 0,
};

export function toSaveQuantitiesState(
  error: unknown,
  itemId: string | null,
  attempt: number,
): SaveQuantitiesState {
  if (
    error instanceof ValidationError ||
    error instanceof ConflictError ||
    error instanceof NotFoundError
  ) {
    return { error: error.message, itemId, attempt: attempt + 1 };
  }

  // Anything that is not a domain error reaches the shared error boundary from #2 rather
  // than being flattened into a message nobody can act on (008 AC-25).
  throw error;
}

export function toStartCountState(
  error: unknown,
  existingCountId: string | null,
  attempt: number,
): StartCountState {
  if (error instanceof ValidationError) {
    return { error: error.message, field: error.field, existingCountId: null, attempt: attempt + 1 };
  }
  if (error instanceof ConflictError) {
    return { error: error.message, field: null, existingCountId, attempt: attempt + 1 };
  }
  if (error instanceof NotFoundError) {
    return { error: error.message, field: null, existingCountId: null, attempt: attempt + 1 };
  }
  throw error;
}
