"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { redirect } from "next/navigation";

import { INCORRECT_SIGN_IN_MESSAGE } from "@/lib/auth-messages";
import { safeCallbackPath } from "@/lib/callback-path";
import { signIn, signOut } from "@/server/auth/next-auth";
import { refusalMessage } from "@/server/auth/sign-in-codes";
import { landingPathForUsername } from "@/server/auth/user-service";

import type { SignInState } from "@/app/sign-in/form-state";

/**
 * The sign-in form's action. It evaluates nothing itself: `signIn` reaches the credentials
 * provider, whose `authorize` is the one place an attempt is decided (021 AC-15, AC-31), so
 * an attempt through this form is counted exactly once. A refusal comes back as a
 * `CredentialsSignin` whose code names which of the four answers to render.
 *
 * The landing path depends on the role, which is known only once the PIN has matched, so
 * the redirect is made here after a successful sign-in rather than handed to `signIn`. That
 * redirect reaches `Location` as given, so a `callbackUrl` is honoured only as the same-origin
 * path and query `safeCallbackPath` rebuilds from it (AC-9).
 */
export async function signInAction(
  previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const username = String(formData.get("username") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const callbackUrl = safeCallbackPath(formData.get("callbackUrl"));

  try {
    await signIn("credentials", { username, pin, redirect: false });
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      return { error: refusalMessage(error.code), username, attempt: previous.attempt + 1 };
    }
    // Any other Auth.js refusal is still one answer, never a stack trace (AC-10).
    if (error instanceof AuthError) {
      return { error: INCORRECT_SIGN_IN_MESSAGE, username, attempt: previous.attempt + 1 };
    }
    throw error;
  }

  redirect(callbackUrl ?? (await landingPathForUsername(username)));
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/sign-in" });
}
