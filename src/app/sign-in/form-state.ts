/** The state `useActionState` carries between submissions of the sign-in form. */
export type SignInState = {
  /** `null` while nothing has failed; otherwise the one message AC-10 allows. */
  error: string | null;
  /** Echoed back so a failed attempt does not make the user retype their email. */
  email: string;
  /** Bumped on every failure; the password input is keyed on it, so it remounts empty. */
  attempt: number;
};

export const INITIAL_SIGN_IN_STATE: SignInState = { error: null, email: "", attempt: 0 };
