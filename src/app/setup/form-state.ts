/**
 * The state `useActionState` carries between submissions of first-run setup (021 UI
 * states, AC-28). It has no key for the setup code and none for a PIN: the code is never
 * rendered back, and the code and both PIN fields are empty after every outcome.
 */
export type SetupFormState = {
  /** `null` until a submission is refused; then one message from `auth-messages.ts`. */
  error: string | null;
  name: string;
  username: string;
  /** Bumped on every refusal; the code and both PIN fields are cleared whenever it changes. */
  attempt: number;
};

export const INITIAL_SETUP_STATE: SetupFormState = {
  error: null,
  name: "",
  username: "",
  attempt: 0,
};
