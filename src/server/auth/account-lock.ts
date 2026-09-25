/**
 * The per-account lock (021 S6, AC-11), as a pure function of a state, an outcome and a
 * moment. The sign-in service reads the `AccountLock` row, asks this module what the row
 * becomes, and writes it back; nothing here touches a database or a clock, so every rule
 * below is proved with no database.
 *
 * Five consecutive wrong PINs lock a username; lock k lasts 15 minutes x 2^(k-1), capped at
 * 24 hours. A timed lock repairs itself, so a stranger cannot lock anyone out for longer
 * than a day; for the same reason it never stops a patient guesser, it only slows one to
 * five guesses a day (see the spec's *Residual risk*).
 */

export const ACCOUNT_LOCK_THRESHOLD = 5;
export const ACCOUNT_LOCK_BASE_MINUTES = 15;
export const ACCOUNT_LOCK_CAP_HOURS = 24;

const MS_PER_MINUTE = 60_000;
const CAP_MINUTES = ACCOUNT_LOCK_CAP_HOURS * 60;

/** The columns of `AccountLock` the rule reads and writes. */
export type AccountLockState = {
  consecutiveFailures: number;
  /** Locks since the last successful sign-in. */
  level: number;
  lockedUntil: Date | null;
};

/**
 * `SUCCESS`: the right PIN. `FAILURE`: a wrong one, evaluated. `CLEARED`: an ADMIN's
 * clear, or a PIN reset from `/profiles` or the script.
 */
export type LockOutcome = "SUCCESS" | "FAILURE" | "CLEARED";

/** How long lock number `level` lasts, in minutes. `level` counts from 1. */
export function lockDurationMinutes(level: number): number {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`A lock level is an integer from 1, not ${String(level)}`);
  }
  // 2 ** (level - 1) grows past every cap long before it overflows to Infinity, and
  // Math.min handles Infinity, so a level no attacker can reach still answers the cap.
  return Math.min(ACCOUNT_LOCK_BASE_MINUTES * 2 ** (level - 1), CAP_MINUTES);
}

/** Locked strictly before `lockedUntil`, open from that instant on. */
export function isLocked(state: AccountLockState, now: Date): boolean {
  return state.lockedUntil !== null && now.getTime() < state.lockedUntil.getTime();
}

/**
 * The state after `outcome` at `now`. Returns a new object; the input is not changed.
 *
 * A `FAILURE` while the account is locked changes nothing: a locked attempt is never
 * evaluated or recorded (S6), and this keeps that true even if a caller forgets.
 */
export function applyOutcome(
  state: AccountLockState,
  outcome: LockOutcome,
  now: Date,
): AccountLockState {
  switch (outcome) {
    case "SUCCESS":
      return { consecutiveFailures: 0, level: 0, lockedUntil: null };

    case "CLEARED":
      // The level is kept: a clear in the middle of an attack gives the attacker five
      // more guesses, not a fresh run of thirty-five. The person's own next successful
      // sign-in zeroes it.
      return { consecutiveFailures: 0, level: state.level, lockedUntil: null };

    case "FAILURE": {
      if (state.lockedUntil !== null && isLocked(state, now)) {
        return {
          consecutiveFailures: state.consecutiveFailures,
          level: state.level,
          lockedUntil: new Date(state.lockedUntil.getTime()),
        };
      }

      const failures = state.consecutiveFailures + 1;
      if (failures < ACCOUNT_LOCK_THRESHOLD) {
        return { consecutiveFailures: failures, level: state.level, lockedUntil: null };
      }

      const level = state.level + 1;
      return {
        consecutiveFailures: 0,
        level,
        lockedUntil: new Date(now.getTime() + lockDurationMinutes(level) * MS_PER_MINUTE),
      };
    }

    default: {
      const unknown: never = outcome;
      throw new RangeError(`Unknown lock outcome: ${String(unknown)}`);
    }
  }
}
