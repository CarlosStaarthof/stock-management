/** The state `useActionState` carries between submissions of the sign-in form. */
export type SignInState = {
  /** `null` while nothing has failed; otherwise one of the four refusal messages (AC-10). */
  error: string | null;
  /** Echoed back so a retry is only the PIN (021 *Phone-first*). The PIN never is. */
  username: string;
  /** Bumped on every failure; the PIN field is cleared whenever it changes. */
  attempt: number;
};

export const INITIAL_SIGN_IN_STATE: SignInState = { error: null, username: "", attempt: 0 };
