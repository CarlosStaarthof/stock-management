/**
 * The states `useActionState` carries for the admin section's forms (021 `/profiles`, UI
 * states). A module of its own because `actions.ts` carries `"use server"`, and every export
 * of such a file must be an async function.
 *
 * A NEW PIN LIVES HERE AND NOWHERE ELSE (AC-24, AC-25). It is the return value of the one
 * action that drew it, so it is in that action's response and in no later one: nothing
 * stores it, logs it or puts it in a URL, and a reload shows the page without it.
 */

/** Every form: one refused action's message, rendered beside the form it concerns. */
export type ProfileFormState = {
  /** `null` until an action is refused; then its one message. */
  error: string | null;
  /** Bumped on every response, so a form can key on "something happened". */
  attempt: number;
};

export const INITIAL_PROFILE_FORM_STATE: ProfileFormState = { error: null, attempt: 0 };

/** A reset or a direct creation: the new PIN, shown once, and whose it is. */
export type NewPinState = ProfileFormState & {
  newPin: string | null;
  /** The profile's display name, rendered beside the PIN. */
  pinFor: string | null;
};

export const INITIAL_NEW_PIN_STATE: NewPinState = {
  error: null,
  attempt: 0,
  newPin: null,
  pinFor: null,
};

/** A direct creation also echoes what was typed after a refusal, and nothing after success. */
export type CreateProfileAdminState = NewPinState & {
  name: string;
  username: string;
};

export const INITIAL_CREATE_PROFILE_ADMIN_STATE: CreateProfileAdminState = {
  ...INITIAL_NEW_PIN_STATE,
  name: "",
  username: "",
};
