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
