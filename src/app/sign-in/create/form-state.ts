/**
 * The state `useActionState` carries between submissions of *Create profile* (021 UI
 * states). Neither PIN is ever part of it: both PIN fields are empty after every outcome.
 */
export type CreateProfileState = {
  /** `null` until a submission is refused; then one message from `auth-messages.ts`. */
  error: string | null;
  /** Echoed after a field error, so only what was wrong has to be typed again. */
  name: string;
  username: string;
  /** Bumped on every refusal; both PIN fields are cleared whenever it changes. */
  attempt: number;
};

export const INITIAL_CREATE_PROFILE_STATE: CreateProfileState = {
  error: null,
  name: "",
  username: "",
  attempt: 0,
};
