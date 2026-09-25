"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { SIGN_IN_PATH } from "@/lib/auth-config";
import { PIN_FORMAT_MESSAGE } from "@/lib/auth-messages";
import { PIN_LENGTHS, type PinLength } from "@/server/auth/credential-rules";
import {
  approveProfile,
  changeProfileRole,
  clearAccountLock,
  createProfile,
  deactivateProfile,
  rejectProfile,
  resetProfilePin,
  resumeNewDeviceSignIn,
  ROLE_REQUIRED_MESSAGE,
} from "@/server/auth/profile-admin-service";
import { isRole, type Role } from "@/server/auth/roles";
import { getCurrentUser } from "@/server/auth/session";
import type { SessionUser } from "@/server/auth/session-user";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";

import type {
  CreateProfileAdminState,
  NewPinState,
  ProfileFormState,
} from "@/app/profiles/form-state";

/**
 * The admin section's eight actions (021 D4, `/profiles`): approve, reject, change role,
 * reset a PIN, deactivate, clear a lock, create a profile, resume new devices.
 *
 * THE REFUSAL IS THE SERVICE'S. Each action reads the session's profile from the stored row
 * (`getCurrentUser`) and hands it to one service, which asserts `ADMIN` before it reads
 * anything (003 AC-16). Nothing here reads a role, an actor or a user id for the actor from
 * the form: a form field is something the sender chooses. A refused session is sent where
 * the page would send it — signed out to sign in, staff to `/stock-entry?denied=profiles`.
 *
 * A NEW PIN IS RETURNED, NEVER STORED (AC-24, AC-25): it is part of this one response and
 * of no later one, and nothing here logs it or writes it to a cookie or a URL.
 *
 * Nothing here signs in or touches a session cookie (AC-31).
 */

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Runs one service for the session's profile. A domain error a person can act on becomes
 * its message; a refused session is redirected; anything else is a bug and reaches the
 * shared error boundary, never a form.
 */
async function run<T>(work: (actor: SessionUser | null) => Promise<T>): Promise<Outcome<T>> {
  const actor = await getCurrentUser();
  let value: T;
  try {
    value = await work(actor);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      redirect(`${SIGN_IN_PATH}?reason=inactive`);
    }
    if (error instanceof ForbiddenError) {
      redirect("/stock-entry?denied=profiles");
    }
    if (
      error instanceof ValidationError ||
      error instanceof ConflictError ||
      error instanceof NotFoundError
    ) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/profiles");
  return { ok: true, value };
}

function roleField(formData: FormData): Role | null {
  const role = field(formData, "role");
  return isRole(role) ? role : null;
}

function lengthField(formData: FormData): PinLength | null {
  const length = field(formData, "length");
  return PIN_LENGTHS.find((candidate) => String(candidate) === length) ?? null;
}

function formState(outcome: Outcome<unknown>, previous: ProfileFormState): ProfileFormState {
  return { error: outcome.ok ? null : outcome.error, attempt: previous.attempt + 1 };
}

export async function approveProfileAction(
  previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const role = roleField(formData);
  if (role === null) {
    return { error: ROLE_REQUIRED_MESSAGE, attempt: previous.attempt + 1 };
  }
  const outcome = await run((actor) =>
    approveProfile(actor, field(formData, "id"), role, field(formData, "username")),
  );
  return formState(outcome, previous);
}

export async function rejectProfileAction(
  previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const outcome = await run((actor) => rejectProfile(actor, field(formData, "id")));
  return formState(outcome, previous);
}

export async function changeProfileRoleAction(
  previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const role = roleField(formData);
  if (role === null) {
    return { error: ROLE_REQUIRED_MESSAGE, attempt: previous.attempt + 1 };
  }
  const outcome = await run((actor) => changeProfileRole(actor, field(formData, "id"), role));
  return formState(outcome, previous);
}

export async function resetProfilePinAction(
  previous: NewPinState,
  formData: FormData,
): Promise<NewPinState> {
  const attempt = previous.attempt + 1;
  const length = lengthField(formData);
  if (length === null) {
    return { error: PIN_FORMAT_MESSAGE, attempt, newPin: null, pinFor: null };
  }

  const outcome = await run((actor) => resetProfilePin(actor, field(formData, "id"), length));
  if (!outcome.ok) {
    return { error: outcome.error, attempt, newPin: null, pinFor: null };
  }
  return { error: null, attempt, newPin: outcome.value.newPin, pinFor: outcome.value.profile.name };
}

export async function deactivateProfileAction(
  previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const outcome = await run((actor) => deactivateProfile(actor, field(formData, "id")));
  return formState(outcome, previous);
}

export async function clearAccountLockAction(
  previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const outcome = await run((actor) => clearAccountLock(actor, field(formData, "id")));
  return formState(outcome, previous);
}

export async function createProfileAction(
  previous: CreateProfileAdminState,
  formData: FormData,
): Promise<CreateProfileAdminState> {
  const name = field(formData, "name");
  const username = field(formData, "username");
  const attempt = previous.attempt + 1;
  const refused = (error: string): CreateProfileAdminState => ({
    error,
    attempt,
    newPin: null,
    pinFor: null,
    name,
    username,
  });

  const role = roleField(formData);
  if (role === null) return refused(ROLE_REQUIRED_MESSAGE);
  const length = lengthField(formData);
  if (length === null) return refused(PIN_FORMAT_MESSAGE);

  const outcome = await run((actor) => createProfile(actor, { name, username, role, length }));
  if (!outcome.ok) return refused(outcome.error);

  return {
    error: null,
    attempt,
    newPin: outcome.value.newPin,
    pinFor: outcome.value.profile.name,
    name: "",
    username: "",
  };
}

export async function resumeNewDeviceSignInAction(
  previous: ProfileFormState,
): Promise<ProfileFormState> {
  const outcome = await run((actor) => resumeNewDeviceSignIn(actor));
  return formState(outcome, previous);
}
