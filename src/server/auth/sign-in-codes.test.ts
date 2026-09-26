import { describe, expect, it } from "vitest";

import {
  ACCOUNT_LOCKED_MESSAGE,
  INCORRECT_SIGN_IN_MESSAGE,
  SIGN_IN_PAUSED_MESSAGE,
  SIGN_IN_UNAVAILABLE_MESSAGE,
} from "@/lib/auth-messages";
import { DEVICE_TOKEN_MAX_AGE_DAYS } from "@/server/auth/attempt-budget";
import { deviceCookieOptions, refusalMessage, SIGN_IN_REFUSALS } from "@/server/auth/sign-in-codes";

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

describe("021 AC-16: the device cookie's attributes", () => {
  const BASE = {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 180 * 86_400,
  } as const;

  it("AC-16: over https the cookie is Secure, HttpOnly, SameSite=Lax, Path=/, for 180 days", () => {
    for (const url of [
      "https://stock.example.com/api/auth/callback/credentials",
      "https://stock.example.com:8443/sign-in",
      new URL("https://localhost/sign-in"),
    ]) {
      expect(deviceCookieOptions(url), String(url)).toEqual({ ...BASE, secure: true });
    }
  });

  it("AC-16: over http the cookie is not Secure, and every other attribute is the same", () => {
    for (const url of [
      "http://localhost:3000/api/auth/callback/credentials",
      "http://stock.example.com/sign-in",
      new URL("http://127.0.0.1:3000/sign-in"),
    ]) {
      expect(deviceCookieOptions(url), String(url)).toEqual({ ...BASE, secure: false });
    }
  });

  it("AC-16: the lifetime is the device token's own, in seconds", () => {
    expect(DEVICE_TOKEN_MAX_AGE_DAYS).toBe(180);
    expect(deviceCookieOptions("https://stock.example.com/").maxAge).toBe(DEVICE_TOKEN_MAX_AGE_DAYS * 86_400);
  });
});
