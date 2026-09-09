/**
 * The exact strings the acceptance criteria quote. They live in one module so the sign-in
 * page, the placeholder pages and the tests all read the same literal — a message that
 * exists twice drifts.
 */

/**
 * Shown for a wrong password, an unknown email AND a deactivated account. One message,
 * because three messages tell an attacker which emails have accounts (AC-10).
 */
export const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";

export const INACTIVE_ACCOUNT_MESSAGE =
  "Your account is no longer active. Contact an administrator.";

export const ACCESS_DENIED_MESSAGE = "You do not have access to that page.";
