/**
 * The device budgets (021 S8, AC-13), as pure functions. The services read a bucket's
 * events inside a transaction that holds the bucket's advisory lock, and ask this module
 * whether one more attempt may be evaluated. Nothing here touches a database, a clock or
 * the environment.
 *
 * The budget is the secondary bound: the per-account lock bounds guesses at one username,
 * and the budget bounds what the untrusted internet can do across usernames, however many
 * addresses it controls.
 */

/** Wrong PINs per bucket in any rolling window. */
export const PIN_FAILURE_BUDGET = 10;
/** Profile requests per bucket in any rolling window. */
export const PROFILE_REQUEST_BUDGET = 10;
/** Wrong setup codes in any rolling window, one bucket for everyone. */
export const SETUP_FAILURE_BUDGET = 10;
export const BUDGET_WINDOW_HOURS = 24;
/** At most this many profiles wait for approval at once. */
export const PENDING_PROFILE_CAP = 20;
/** A known device stays known this long after its last successful sign-in. */
export const DEVICE_TOKEN_MAX_AGE_DAYS = 180;
/** Events, and lock rows whose lock has ended, are kept this long. */
export const EVENT_RETENTION_DAYS = 30;

const MS_PER_HOUR = 3_600_000;

/** The values of the `AuthEventKind` enum, spelled here so the module stays pure. */
export type AttemptEventKind = "PIN_FAILURE" | "PROFILE_REQUEST" | "SETUP_FAILURE" | "BUDGET_RESET";

/** The kinds a budget counts. `BUDGET_RESET` is a marker, never counted. */
export type CountedEventKind = Exclude<AttemptEventKind, "BUDGET_RESET">;

export type AttemptEvent = { kind: AttemptEventKind; at: Date };

export type BudgetDecision = "ALLOW" | "REFUSE";

/**
 * `REFUSE` when `budget` or more events of `kind` fall inside the window ending at `now`
 * and after the bucket's latest `BUDGET_RESET`; otherwise `ALLOW`.
 *
 * An event exactly `windowHours` old has left the window. An event at the same instant as
 * the latest reset was cleared by it. Events of any other kind are ignored.
 */
export function decideAttempt(
  events: readonly AttemptEvent[],
  kind: CountedEventKind,
  now: Date,
  budget: number,
  windowHours: number,
): BudgetDecision {
  const windowStart = now.getTime() - windowHours * MS_PER_HOUR;

  let latestReset = Number.NEGATIVE_INFINITY;
  for (const event of events) {
    if (event.kind === "BUDGET_RESET") {
      latestReset = Math.max(latestReset, event.at.getTime());
    }
  }

  const since = Math.max(windowStart, latestReset);
  let counted = 0;
  for (const event of events) {
    if (event.kind === kind && event.at.getTime() > since) counted += 1;
  }

  return counted >= budget ? "REFUSE" : "ALLOW";
}

// The id `signDeviceToken` mints: 16 random bytes, as hex. Anything else is not a device
// id, so it can never widen the documented bucket forms (AC-14).
const DEVICE_ID = /^[0-9a-f]{32}$/;

const BUCKET_PREFIX: Record<Exclude<CountedEventKind, "SETUP_FAILURE">, string> = {
  PIN_FAILURE: "pin",
  PROFILE_REQUEST: "request",
};

/**
 * The bucket an attempt draws on: its device's own when it carries a valid device token,
 * otherwise the one shared by every new device on the internet. Setup has one bucket for
 * everyone.
 *
 * `deviceId` is what `verifyDeviceToken` returned for the request's token — `null` for a
 * missing, expired, malformed or forged one. The token is verified there, not here,
 * because `password.ts` is the one reader of `AUTH_SECRET` and this module is pure.
 */
export function bucketFor(kind: CountedEventKind, deviceId: string | null): string {
  if (kind === "SETUP_FAILURE") return "setup";

  const prefix = BUCKET_PREFIX[kind];
  return deviceId !== null && DEVICE_ID.test(deviceId)
    ? `${prefix}:device:${deviceId}`
    : `${prefix}:new-devices`;
}
