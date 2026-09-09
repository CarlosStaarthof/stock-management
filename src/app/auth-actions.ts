"use server";

import { AuthError } from "next-auth";

import { INVALID_CREDENTIALS_MESSAGE } from "@/lib/auth-messages";
import { landingPathForRole } from "@/server/auth/landing";
import { signIn, signOut } from "@/server/auth/next-auth";
import { verifyCredentials } from "@/server/auth/user-service";

import type { SignInState } from "@/app/sign-in/form-state";

/**
 * A relative path of our own, or nothing.
 *
 * `//evil.example` and `https://evil.example` are both rejected: a callbackUrl is a
 * redirect target an attacker can put in a link, so only a single-slash path survives.
 */
function safeCallbackPath(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export async function signInAction(
  previous: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = safeCallbackPath(formData.get("callbackUrl"));

  // Asked before signing in, because the landing path depends on the role and the role is
  // known only once the credentials are good. Wrong password, unknown email and a
  // deactivated account all come back as null — one answer, one message (AC-10).
  const user = await verifyCredentials(email, password);
  if (user === null) {
    return { error: INVALID_CREDENTIALS_MESSAGE, email, attempt: previous.attempt + 1 };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl ?? landingPathForRole(user.role),
    });
  } catch (error) {
    // signIn signals its redirect by throwing; that throw must reach Next untouched.
    if (error instanceof AuthError) {
      return { error: INVALID_CREDENTIALS_MESSAGE, email, attempt: previous.attempt + 1 };
    }
    throw error;
  }

  return { error: null, email, attempt: previous.attempt };
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/sign-in" });
}
