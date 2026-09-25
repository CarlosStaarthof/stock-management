import { describe, expect, it } from "vitest";

import {
  ACCOUNT_LOCKED_MESSAGE,
  INCORRECT_SIGN_IN_MESSAGE,
  SIGN_IN_PAUSED_MESSAGE,
  SIGN_IN_UNAVAILABLE_MESSAGE,
} from "@/lib/auth-messages";
import { refusalMessage, SIGN_IN_REFUSALS } from "@/server/auth/sign-in-codes";

/**
 * 021 AC-32's page half, with no database: what the sign-in page renders for each refused
 * outcome, and that nothing unexpected can render anything but the one shared answer.
 */
describe("the sign-in refusal codes (021 AC-10, AC-12, AC-14, AC-32)", () => {
  it("AC-32: UNAVAILABLE renders SIGN_IN_UNAVAILABLE_MESSAGE, and each other outcome its own message", () => {
    expect(refusalMessage(SIGN_IN_REFUSALS.UNAVAILABLE)).toBe(SIGN_IN_UNAVAILABLE_MESSAGE);
    expect(refusalMessage(SIGN_IN_REFUSALS.INCORRECT)).toBe(INCORRECT_SIGN_IN_MESSAGE);
    expect(refusalMessage(SIGN_IN_REFUSALS.LOCKED)).toBe(ACCOUNT_LOCKED_MESSAGE);
    expect(refusalMessage(SIGN_IN_REFUSALS.PAUSED)).toBe(SIGN_IN_PAUSED_MESSAGE);
  });

  it("AC-10: any other code — Auth.js's default, an error's text, nothing — is the one shared answer", () => {
    for (const code of ["credentials", "CredentialsSignin", "", undefined, null, 42, "toString"]) {
      expect(refusalMessage(code), String(code)).toBe(INCORRECT_SIGN_IN_MESSAGE);
    }
  });
});
