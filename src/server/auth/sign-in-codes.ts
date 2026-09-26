import {
  ACCOUNT_LOCKED_MESSAGE,
  INCORRECT_SIGN_IN_MESSAGE,
  SIGN_IN_PAUSED_MESSAGE,
  SIGN_IN_UNAVAILABLE_MESSAGE,
} from "@/lib/auth-messages";
import { DEVICE_TOKEN_MAX_AGE_DAYS } from "@/server/auth/attempt-budget";

/**
 * The two names the sign-in transports share (021 S8, AC-16): the device cookie, with its
 * attributes, and the code a refused attempt carries from `authorize` back to the sign-in
 * form.
 *
 * Pure: no database, no environment. The codes name an outcome and nothing else — never a
 * username, a PIN or whether a username exists.
 */

/** The known-device token's cookie. HttpOnly, SameSite=Lax, 180 days. */
export const DEVICE_COOKIE = "macroads-device";

const SECONDS_PER_DAY = 86_400;

export type DeviceCookieOptions = {
  httpOnly: true;
  sameSite: "lax";
  path: "/";
  maxAge: number;
  secure: boolean;
};

/**
 * The device cookie's attributes for a sign-in answered at `requestUrl` (AC-16). HttpOnly,
 * because no script needs it; `Secure` exactly when the request came over `https`, so the
 * cookie is never sent in the clear there, and still works over plain `http` in development.
 */
export function deviceCookieOptions(requestUrl: string | URL): DeviceCookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_TOKEN_MAX_AGE_DAYS * SECONDS_PER_DAY,
    secure: new URL(requestUrl).protocol === "https:",
  };
}

export type SignInRefusal = "incorrect" | "locked" | "paused" | "unavailable";

export const SIGN_IN_REFUSALS: Readonly<
  Record<"INCORRECT" | "LOCKED" | "PAUSED" | "UNAVAILABLE", SignInRefusal>
> = {
  INCORRECT: "incorrect",
  LOCKED: "locked",
  PAUSED: "paused",
  UNAVAILABLE: "unavailable",
};

const MESSAGES: Readonly<Record<SignInRefusal, string>> = {
  incorrect: INCORRECT_SIGN_IN_MESSAGE,
  locked: ACCOUNT_LOCKED_MESSAGE,
  paused: SIGN_IN_PAUSED_MESSAGE,
  unavailable: SIGN_IN_UNAVAILABLE_MESSAGE,
};

/**
 * What the sign-in page renders for a refusal. Anything that is not one of the four codes
 * is the one answer every failure shares (AC-10), so no unexpected error can say more.
 */
export function refusalMessage(code: unknown): string {
  // Own keys only: `"toString" in MESSAGES` is true, and would render a function.
  return typeof code === "string" && Object.hasOwn(MESSAGES, code)
    ? MESSAGES[code as SignInRefusal]
    : INCORRECT_SIGN_IN_MESSAGE;
}
