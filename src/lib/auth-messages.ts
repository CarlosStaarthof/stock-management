/**
 * The exact strings the acceptance criteria quote. They live in one module so the sign-in
 * page, the placeholder pages and the tests all read the same literal — a message that
 * exists twice drifts.
 *
 * This module imports nothing (021 AC-39): the credential rules import its three length
 * constants, and a rule and the sentence that states it must not be able to disagree.
 */

// ---------------------------------------------------------------------------------------
// Email and password (#3). Still rendered by the current sign-in; #21's Phase B removes
// both when the email sign-in goes.
// ---------------------------------------------------------------------------------------

/**
 * Shown for a wrong password, an unknown email AND a deactivated account. One message,
 * because three messages tell an attacker which emails have accounts (AC-10).
 */
export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";

export const INACTIVE_ACCOUNT_MESSAGE =
  "Your account is no longer active. Contact an administrator.";

export const ACCESS_DENIED_MESSAGE = "You do not have access to that page.";

// ---------------------------------------------------------------------------------------
// Username and PIN (#21).
// ---------------------------------------------------------------------------------------

/** S1: a username is 3 to 32 characters. */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

/**
 * A display name is at most 80 characters: it is written into #9's audit lines, and a
 * public form must bound what it stores (021 Open question 4).
 */
export const MAX_NAME_LENGTH = 80;

/**
 * Every failed sign-in, whatever the reason — wrong PIN, unknown username, a request not
 * yet approved, a rejected or deactivated profile, a PIN stored under another pepper, a
 * malformed entry. One answer, so the page never says whether a username exists (AC-10).
 */
export const INCORRECT_SIGN_IN_MESSAGE = "The username or PIN is incorrect.";

/**
 * Identical for a live username and an invented one (S5), and silent about when the lock
 * ends (*Out of scope*).
 */
export const ACCOUNT_LOCKED_MESSAGE =
  "This username is locked after too many incorrect PINs. Try again later, or ask an administrator.";

/** Decided before any username or PIN is looked at, so it reveals nothing (S8). */
export const SIGN_IN_PAUSED_MESSAGE =
  "Sign-in from this device is paused after too many incorrect PINs. Try again later, or ask an administrator.";

/** The server cannot evaluate PINs (its secret key is missing or unusable): fail closed. */
export const SIGN_IN_UNAVAILABLE_MESSAGE =
  "Sign-in is unavailable right now. Please tell an administrator.";

/**
 * A session refused on its next request: the profile was deactivated, or its PIN was
 * reset (which ends every session that used the old one).
 */
export const SESSION_ENDED_MESSAGE = "Your session has ended. Please sign in again.";

export const PIN_FORMAT_MESSAGE = "A PIN is exactly 4 or 6 digits.";

/** The rule is described, never illustrated: no PIN value is written down anywhere (AC-8). */
export const PIN_TOO_SIMPLE_MESSAGE =
  "That PIN is too easy to guess. Do not use one digit repeated, or digits counting up or down in order.";

export const PIN_MISMATCH_MESSAGE = "The two PINs do not match.";

export const USERNAME_FORMAT_MESSAGE =
  `A username is ${USERNAME_MIN_LENGTH} to ${USERNAME_MAX_LENGTH} characters: a letter a-z first, ` +
  'then letters a-z, digits 0-9, ".", "_" or "-".';

/** Shown only to an ADMIN, at approval or direct creation — never on a public page (S2). */
export function USERNAME_TAKEN_MESSAGE(username: string): string {
  return `The username "${username}" is already taken. Choose another.`;
}

export const NAME_REQUIRED_MESSAGE = "Enter a name.";

export const NAME_TOO_LONG_MESSAGE = `A name is at most ${MAX_NAME_LENGTH} characters.`;

export const NAME_CHARACTERS_MESSAGE =
  "A name cannot contain a line break, a tab, another control character, < or >.";

/** The one acknowledgement every accepted request sees, whatever username it asked for (S2). */
export const PROFILE_REQUEST_SENT =
  "Your request has been sent. An administrator must approve your profile before you can sign in, and will confirm your username.";

export const PROFILE_REQUESTS_PAUSED =
  "New profile requests are paused for now. Try again later, or ask an administrator.";

export const SETUP_CODE_INCORRECT_MESSAGE = "The setup code is incorrect.";

export const SETUP_PAUSED_MESSAGE =
  "Setup is paused after too many incorrect setup codes. Try again later.";

export const SETUP_COMPLETE_MESSAGE =
  "Your administrator profile is ready. Sign in with your username and PIN.";

/** S10: the change would leave no active administrator who can sign in. */
export const LAST_ADMIN_MESSAGE =
  "This is the last active administrator. Make another profile an administrator first.";

export const ONLY_ACTIVE_PIN_RESET = "Only an active profile can have its PIN reset.";

export const RESET_PIN_SHOWN_ONCE =
  "This PIN is shown only once. Give it to the person now; it cannot be shown again.";

export const NO_PENDING_PROFILES = "No profiles are waiting for approval.";

export const NEW_DEVICES_PAUSED_MESSAGE =
  "Sign-in from new devices is paused after too many incorrect PINs in the last 24 hours.";

export const RESUME_NEW_DEVICES_LABEL = "Resume sign-in from new devices";

/** The last day's incorrect PINs, as `pinFailureSummary` counts them. */
export function PIN_FAILURES_SUMMARY(
  newDevices: number,
  knownDevices: number,
  unknownUsernames: number,
): string {
  return (
    `Incorrect PINs in the last 24 hours: ${newDevices} from new devices, ` +
    `${knownDevices} from known devices; ${unknownUsernames} named no profile's username.`
  );
}

/** Rendered with the lock's end time beside it. */
export const ACCOUNT_LOCKED_LABEL = "Locked until";

export const CLEAR_LOCK_LABEL = "Clear lock";

/** S4: the PIN was stored under another PIN_PEPPER, so it can never match again. */
export const CREDENTIAL_NEEDS_RESET_LABEL = "PIN needs a reset";

/** Keyed by the four `ProfileStatus` values; this module imports nothing, so it spells them. */
export const PROFILE_STATUS_LABELS: Readonly<
  Record<"PENDING" | "ACTIVE" | "REJECTED" | "DEACTIVATED", string>
> = {
  PENDING: "Waiting for approval",
  ACTIVE: "Active",
  REJECTED: "Rejected",
  DEACTIVATED: "Deactivated",
};
