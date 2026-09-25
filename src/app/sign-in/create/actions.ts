"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { PROFILE_REQUESTS_PAUSED, SIGN_IN_UNAVAILABLE_MESSAGE } from "@/lib/auth-messages";
import { requestProfile } from "@/server/auth/profile-request-service";
import { DEVICE_COOKIE } from "@/server/auth/sign-in-codes";
import { ValidationError } from "@/server/errors";

import type { CreateProfileState } from "@/app/sign-in/create/form-state";

/**
 * *Create profile*'s action (021 AC-18 to AC-20). It reads exactly four fields — the name,
 * the requested username and the PIN twice — so a forged `role`, `status`, `username` or
 * `pinHash` field has nothing to reach.
 *
 * Every accepted request gets the same `303` to the same page, whatever username it asked
 * for (AC-19). A refusal for a spent budget or a full queue echoes NOTHING back: the body
 * then cannot differ by the username typed (AC-20). A field error echoes the name and the
 * username, so only what was wrong has to be typed again; a PIN is never echoed.
 */
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function requestProfileAction(
  previous: CreateProfileState,
  formData: FormData,
): Promise<CreateProfileState> {
  const name = field(formData, "name");
  const username = field(formData, "requestedUsername");
  const attempt = previous.attempt + 1;

  let outcome: Awaited<ReturnType<typeof requestProfile>>["outcome"];
  try {
    const deviceToken = (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
    ({ outcome } = await requestProfile(
      { name, username, pin: field(formData, "pin"), pinAgain: field(formData, "pinAgain") },
      { deviceToken },
    ));
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.message, name, username, attempt };
    }
    throw error;
  }

  if (outcome === "PAUSED") {
    return { error: PROFILE_REQUESTS_PAUSED, name: "", username: "", attempt };
  }
  if (outcome === "UNAVAILABLE") {
    return { error: SIGN_IN_UNAVAILABLE_MESSAGE, name: "", username: "", attempt };
  }

  redirect("/sign-in/requested");
}
