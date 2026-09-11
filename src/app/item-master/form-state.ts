import { ConflictError, ValidationError } from "@/server/errors";

/**
 * What a server action hands back to a form that failed.
 *
 * It is a module of its own because `actions.ts` carries `"use server"`, and every export
 * of such a file must be an async function — a type or a helper cannot live there.
 *
 * `field` is what turns a message into an inline one: `ValidationError` names the input
 * the admin got wrong, so the screen can put the message beside it and keep everything
 * else they typed (006 AC-8). A `ConflictError` names no field and renders above the form.
 */
export type FormState = {
  error: string | null;
  field: string | null;
  /** Every value the admin typed, echoed back so a refusal costs them no work. */
  values: Record<string, string>;
  /** Bumped on every response, so a client can key on "something happened". */
  attempt: number;
};

export const EMPTY_FORM_STATE: FormState = {
  error: null,
  field: null,
  values: {},
  attempt: 0,
};

export function initialFormState(values: Record<string, string> = {}): FormState {
  return { error: null, field: null, values, attempt: 0 };
}

/**
 * A domain error becomes form state, exactly as `src/app/api/error-response.ts` turns the
 * same four classes into status codes — one mapping per surface, and neither of them ever
 * shows the caller a Prisma string (006 AC-29).
 *
 * Anything that is not a domain error is re-thrown, so it reaches the shared error
 * boundary from #2 rather than being flattened into a form message nobody can act on.
 */
export function toFormState(
  error: unknown,
  values: Record<string, string>,
  attempt: number,
): FormState {
  if (error instanceof ValidationError) {
    return { error: error.message, field: error.field, values, attempt: attempt + 1 };
  }
  if (error instanceof ConflictError) {
    return { error: error.message, field: null, values, attempt: attempt + 1 };
  }
  throw error;
}

/** The values a `FormData` carried, as strings, for echoing back on a refusal. */
export function valuesOf(formData: FormData, keys: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of keys) {
    const value = formData.get(key);
    values[key] = typeof value === "string" ? value : "";
  }
  return values;
}
