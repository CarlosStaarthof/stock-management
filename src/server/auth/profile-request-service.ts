import { PIN_MISMATCH_MESSAGE } from "@/lib/auth-messages";
import { logWarn } from "@/lib/log";
import {
  BUDGET_WINDOW_HOURS,
  bucketFor,
  decideAttempt,
  PENDING_PROFILE_CAP,
  PROFILE_REQUEST_BUDGET,
} from "@/server/auth/attempt-budget";
import {
  AUTH_TRANSACTION_OPTIONS,
  bucketEvents,
  lockBucket,
  recordEvent,
} from "@/server/auth/auth-event-log";
import { parsePin, parseProfileName, parseUsername } from "@/server/auth/credential-rules";
import {
  CredentialSecretError,
  currentPinKeyId,
  hashPin,
  verifyDeviceToken,
} from "@/server/auth/password";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";

/**
 * *Create profile* (spec 021 D2, D3, S2, AC-18 to AC-20): anyone may ASK for a profile, and
 * nobody can grant themselves one.
 *
 * A request becomes one `PENDING`, `YARD_STAFF` row with no username: the username the
 * person typed is kept in `requestedUsername`, which is not unique and is compared with
 * nothing. So a request is accepted the same way — the same statements, the same answer —
 * whether that username is free, held by a live profile, held by a leaver, or already
 * requested by someone else. The public page never confirms that a username exists (S2); an
 * `ADMIN` settles the username at approval.
 *
 * The role, the status and the username column are set here and never read from the input,
 * so a forged field has nothing to reach (AC-18). The database refuses anything else
 * (`User_pending_shape`).
 *
 * In this order:
 *
 *  1. `PIN_PEPPER` unusable → `UNAVAILABLE`, nothing read or written (AC-32).
 *  2. Parse. Bad input → `ValidationError`, nothing read or written.
 *  3. The device's request budget, under its bucket's lock. Spent → `PAUSED`.
 *  4. The pending cap, under one lock for every request, so concurrent requests cannot all
 *     read "nineteen". The count of `PENDING` rows is the only query against `User` before
 *     the insert (AC-19).
 *  5. One bcrypt, the insert, and one `PROFILE_REQUEST` event in the device's bucket.
 */

export type RequestOutcome = { outcome: "SENT" } | { outcome: "PAUSED" } | { outcome: "UNAVAILABLE" };

export type ProfileRequestInput = {
  name: string;
  username: string;
  pin: string;
  pinAgain: string;
};

export type RequestDevice = { deviceToken: string | null };

type ParsedRequest = { name: string; username: string; pin: string };

/**
 * One message, for the first field that is wrong, in the order the form shows them. Only
 * the four named fields are read: whatever else a caller passes is never looked at.
 */
function parseRequest(input: ProfileRequestInput): ParsedRequest {
  const name = parseProfileName(input.name);
  const username = parseUsername(input.username);
  const pin = parsePin(input.pin);
  if (input.pinAgain !== pin) {
    throw new ValidationError("pinAgain", PIN_MISMATCH_MESSAGE);
  }
  return { name, username, pin };
}

// One key for every request: the cap is a count across all of them.
const PENDING_CAP_LOCK = "macroads:pending-cap";

export async function requestProfile(
  input: ProfileRequestInput,
  device: RequestDevice,
): Promise<RequestOutcome> {
  // Step 1. The PIN could not be stored under any pepper without it.
  try {
    currentPinKeyId();
  } catch (error) {
    if (error instanceof CredentialSecretError) {
      logWarn("auth.profile_request_unavailable", { variable: error.variable });
      return { outcome: "UNAVAILABLE" };
    }
    throw error;
  }

  // Step 2.
  const request = parseRequest(input);

  const bucket = bucketFor("PROFILE_REQUEST", verifyDeviceToken(device.deviceToken));

  return db.$transaction(async (tx): Promise<RequestOutcome> => {
    const now = new Date();

    // Step 3.
    await lockBucket(tx, bucket);
    const events = await bucketEvents(tx, bucket, "PROFILE_REQUEST", now);
    if (
      decideAttempt(events, "PROFILE_REQUEST", now, PROFILE_REQUEST_BUDGET, BUDGET_WINDOW_HOURS) ===
      "REFUSE"
    ) {
      return { outcome: "PAUSED" };
    }

    // Step 4.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${PENDING_CAP_LOCK}, 0))`;
    const pending = await tx.user.count({ where: { status: "PENDING" } });
    if (pending >= PENDING_PROFILE_CAP) {
      return { outcome: "PAUSED" };
    }

    // Step 5. Hashed only once the request is certain to be kept, so a refused request
    // costs the server no bcrypt.
    const { pinHash, pinKeyId } = await hashPin(request.pin);
    await tx.user.create({
      data: {
        name: request.name,
        requestedUsername: request.username,
        role: "YARD_STAFF",
        status: "PENDING",
        pinHash,
        pinKeyId,
      },
      select: { id: true },
    });
    await recordEvent(tx, "PROFILE_REQUEST", bucket, now);

    return { outcome: "SENT" };
  }, AUTH_TRANSACTION_OPTIONS);
}
