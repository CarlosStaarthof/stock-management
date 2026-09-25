import { PIN_MISMATCH_MESSAGE, USERNAME_TAKEN_MESSAGE } from "@/lib/auth-messages";
import { logWarn } from "@/lib/log";
import {
  BUDGET_WINDOW_HOURS,
  bucketFor,
  decideAttempt,
  SETUP_FAILURE_BUDGET,
} from "@/server/auth/attempt-budget";
import {
  AUTH_TRANSACTION_OPTIONS,
  bucketEvents,
  isUniqueViolation,
  lockBucket,
  recordEvent,
} from "@/server/auth/auth-event-log";
import { parsePin, parseProfileName, parseUsername } from "@/server/auth/credential-rules";
import {
  CredentialSecretError,
  currentPinKeyId,
  hashPin,
  setupCodeConfigured,
  setupCodeMatches,
} from "@/server/auth/password";
import { toProfileListEntry, type ProfileListEntry } from "@/server/auth/profile-admin-service";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";

/**
 * First-run setup (spec 021 D10, D11, S9, AC-27 to AC-29): the one way the first `ADMIN`
 * comes to exist on a fresh database.
 *
 * Imported by `src/app/setup/` and by tests only (AC-31). It creates no session: the new
 * administrator signs in like everyone else.
 *
 * WHETHER SETUP IS AVAILABLE IS DECIDED BY THE DATA, on every call: no `User` row with the
 * `ADMIN` role, in any status. Nothing records that setup happened. A deactivated `ADMIN`
 * keeps its role and the last active one cannot be removed (S10), so once an `ADMIN` row
 * exists, one exists for good and this page never comes back.
 *
 * THE CLAIM IS THE RACE GUARD, NOT THE AVAILABILITY RULE. Two submissions made together can
 * both find no `ADMIN`. Each then creates its `ADMIN` and the single `SetupClaim` row, whose
 * key can only be `1`, in one transaction; the second insert of that row fails, the second
 * transaction rolls back whole, and its caller is told setup is no longer available (AC-29).
 *
 * THE CODE IS NEVER LOGGED, RETURNED OR RENDERED. It is compared in constant time by
 * `setupCodeMatches`, and only when the budget allows a comparison (AC-28).
 */

export type SetupOutcome =
  | { outcome: "CREATED"; profile: ProfileListEntry }
  | { outcome: "CODE_INCORRECT" }
  | { outcome: "PAUSED" }
  | { outcome: "UNAVAILABLE" };

export type SetupInput = {
  code: string;
  name: string;
  username: string;
  pin: string;
  pinAgain: string;
};

function pepperUsable(): boolean {
  try {
    currentPinKeyId();
    return true;
  } catch (error) {
    if (error instanceof CredentialSecretError) return false;
    throw error;
  }
}

/**
 * `true` exactly when `PIN_PEPPER` is usable, `SETUP_CODE` is set to at least
 * `SETUP_CODE_MIN_LENGTH` characters, and no profile holds the `ADMIN` role in any status.
 */
export async function setupAvailable(): Promise<boolean> {
  if (!pepperUsable() || !setupCodeConfigured()) return false;

  const admins = await db.user.count({ where: { role: "ADMIN" } });
  return admins === 0;
}

const SETUP_BUCKET = bucketFor("SETUP_FAILURE", null);

/** The first field that is wrong, in the order the form shows them. */
function parseFields(input: SetupInput): { name: string; username: string; pin: string } {
  const name = parseProfileName(input.name);
  const username = parseUsername(input.username);
  const pin = parsePin(input.pin);
  if (input.pinAgain !== pin) {
    throw new ValidationError("pinAgain", PIN_MISMATCH_MESSAGE);
  }
  return { name, username, pin };
}

/**
 * In this order: availability (else `UNAVAILABLE`, the code not compared); the setup
 * budget (else `PAUSED`, the code not compared); the code (wrong → one `SETUP_FAILURE`
 * event); the fields (`ValidationError`, nothing written); then the `ADMIN` and the claim.
 */
export async function completeSetup(input: SetupInput): Promise<SetupOutcome> {
  if (!(await setupAvailable())) {
    return { outcome: "UNAVAILABLE" };
  }

  try {
    return await db.$transaction(async (tx): Promise<SetupOutcome> => {
      const now = new Date();

      await lockBucket(tx, SETUP_BUCKET);
      const events = await bucketEvents(tx, SETUP_BUCKET, "SETUP_FAILURE", now);
      if (
        decideAttempt(events, "SETUP_FAILURE", now, SETUP_FAILURE_BUDGET, BUDGET_WINDOW_HOURS) ===
        "REFUSE"
      ) {
        return { outcome: "PAUSED" };
      }

      if (!setupCodeMatches(input.code)) {
        await recordEvent(tx, "SETUP_FAILURE", SETUP_BUCKET, now);
        logWarn("auth.setup_code_incorrect", { bucket: SETUP_BUCKET });
        return { outcome: "CODE_INCORRECT" };
      }

      // A field error after a correct code throws, and the transaction writes nothing.
      const fields = parseFields(input);

      // Setup can run while other profiles exist (only none may be an ADMIN), so the chosen
      // username may already be held. The person here has the setup code: naming the
      // username to them reveals nothing a stranger could use.
      const holder = await tx.user.findUnique({
        where: { username: fields.username },
        select: { id: true },
      });
      if (holder !== null) {
        throw new ValidationError("username", USERNAME_TAKEN_MESSAGE(fields.username));
      }

      const { pinHash, pinKeyId } = await hashPin(fields.pin);
      const created = await tx.user.create({
        data: {
          name: fields.name,
          username: fields.username,
          role: "ADMIN",
          status: "ACTIVE",
          pinHash,
          pinKeyId,
        },
        select: { id: true },
      });
      await tx.setupClaim.create({ data: { id: 1, userId: created.id }, select: { id: true } });

      return { outcome: "CREATED", profile: await toProfileListEntry(tx, created.id, now) };
    }, AUTH_TRANSACTION_OPTIONS);
  } catch (error) {
    // The claim's key was taken by a setup that committed first (or, in the same instant,
    // the username): either way this transaction rolled back whole. What the caller is told
    // depends on what the data now says, never on the database's error text.
    if (isUniqueViolation(error)) {
      if (!(await setupAvailable())) return { outcome: "UNAVAILABLE" };
      throw new ValidationError("username", USERNAME_TAKEN_MESSAGE(parseUsername(input.username)));
    }
    throw error;
  }
}
