"use server";

import { notFound, redirect } from "next/navigation";

import { SETUP_CODE_INCORRECT_MESSAGE, SETUP_PAUSED_MESSAGE } from "@/lib/auth-messages";
import { completeSetup } from "@/server/auth/setup-service";
import { ValidationError } from "@/server/errors";

import type { SetupFormState } from "@/app/setup/form-state";

/**
 * First-run setup's action (021 S9, AC-27 to AC-29). It creates the first `ADMIN` and no
 * session: success is a `303` to `/sign-in?setup=done`, where the new administrator signs
 * in like everyone else.
 *
 * The code is read from the form, handed to `completeSetup`, and dropped. It is never
 * logged and never part of the state returned to the form (AC-28, AC-33). When setup is not
 * available — never was, or another submission has just claimed it — the answer is the
 * same `404` the page gives.
 */
function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function setupAction(
  previous: SetupFormState,
  formData: FormData,
): Promise<SetupFormState> {
  const name = field(formData, "name");
  const username = field(formData, "username");
  const attempt = previous.attempt + 1;

  let outcome: Awaited<ReturnType<typeof completeSetup>>["outcome"];
  try {
    ({ outcome } = await completeSetup({
      code: field(formData, "setupCode"),
      name,
      username,
      pin: field(formData, "pin"),
      pinAgain: field(formData, "pinAgain"),
    }));
  } catch (error) {
    if (error instanceof ValidationError) {
      return { error: error.message, name, username, attempt };
    }
    throw error;
  }

  if (outcome === "CODE_INCORRECT") {
    return { error: SETUP_CODE_INCORRECT_MESSAGE, name, username, attempt };
  }
  if (outcome === "PAUSED") {
    return { error: SETUP_PAUSED_MESSAGE, name, username, attempt };
  }
  if (outcome === "UNAVAILABLE") {
    notFound();
  }

  redirect("/sign-in?setup=done");
}
