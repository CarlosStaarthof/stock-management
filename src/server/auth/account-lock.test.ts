import { describe, expect, it } from "vitest";

import {
  ACCOUNT_LOCK_BASE_MINUTES,
  ACCOUNT_LOCK_CAP_HOURS,
  ACCOUNT_LOCK_THRESHOLD,
  type AccountLockState,
  applyOutcome,
  isLocked,
  lockDurationMinutes,
} from "@/server/auth/account-lock";

/** 021 AC-11, with no database: the lock is a pure function of a state, an outcome and a moment. */

const MINUTE = 60_000;
const START = new Date("2026-09-25T08:00:00.000Z");
const ZERO: AccountLockState = { consecutiveFailures: 0, level: 0, lockedUntil: null };

function fail(state: AccountLockState, times: number, now: Date): AccountLockState {
  let next = state;
  for (let i = 0; i < times; i += 1) next = applyOutcome(next, "FAILURE", now);
  return next;
}

describe("the account lock", () => {
  it("AC-11: the constants are five, fifteen minutes and twenty-four hours", () => {
    expect(ACCOUNT_LOCK_THRESHOLD).toBe(5);
    expect(ACCOUNT_LOCK_BASE_MINUTES).toBe(15);
    expect(ACCOUNT_LOCK_CAP_HOURS).toBe(24);
  });

  it("AC-11: lock k lasts 15 minutes doubling, and 1,440 from the eighth on", () => {
    const durations = Array.from({ length: 12 }, (_, i) => lockDurationMinutes(i + 1));

    expect(durations).toEqual([15, 30, 60, 120, 240, 480, 960, 1440, 1440, 1440, 1440, 1440]);
    expect(lockDurationMinutes(5000)).toBe(1440);
  });

  it("AC-11: a lock level is an integer from 1", () => {
    for (const level of [0, -1, 1.5, Number.NaN]) {
      expect(() => lockDurationMinutes(level)).toThrow(RangeError);
    }
  });

  it("AC-11: four failures leave the account unlocked with four counted; the fifth locks it for exactly 15 minutes", () => {
    const four = fail(ZERO, 4, START);

    expect(four).toEqual({ consecutiveFailures: 4, level: 0, lockedUntil: null });
    expect(isLocked(four, START)).toBe(false);

    const fifth = applyOutcome(four, "FAILURE", START);

    expect(fifth.level).toBe(1);
    expect(fifth.consecutiveFailures).toBe(0);
    expect(fifth.lockedUntil?.getTime()).toBe(START.getTime() + 15 * MINUTE);
    expect(isLocked(fifth, START)).toBe(true);
  });

  it("AC-11: after each lock ends, five more failures start the next lock at the next duration", () => {
    const expected = [15, 30, 60, 120, 240, 480, 960, 1440, 1440, 1440, 1440, 1440];
    let state = ZERO;
    let now = START;

    for (const [index, minutes] of expected.entries()) {
      state = fail(state, ACCOUNT_LOCK_THRESHOLD - 1, now);
      expect(isLocked(state, now)).toBe(false);

      state = applyOutcome(state, "FAILURE", now);

      expect(state.level).toBe(index + 1);
      expect(state.consecutiveFailures).toBe(0);
      expect(state.lockedUntil?.getTime()).toBe(now.getTime() + minutes * MINUTE);

      now = state.lockedUntil ?? now;
      expect(isLocked(state, now)).toBe(false);
    }
  });

  it("AC-11: isLocked is true one millisecond before lockedUntil and false at it", () => {
    const locked = fail(ZERO, ACCOUNT_LOCK_THRESHOLD, START);
    const until = locked.lockedUntil?.getTime() ?? Number.NaN;

    expect(isLocked(locked, new Date(until - 1))).toBe(true);
    expect(isLocked(locked, new Date(until))).toBe(false);
    expect(isLocked(locked, new Date(until + 1))).toBe(false);
    expect(isLocked(ZERO, START)).toBe(false);
  });

  it("AC-11: a failure while locked changes nothing, because a locked attempt is not evaluated", () => {
    const locked = fail(ZERO, ACCOUNT_LOCK_THRESHOLD, START);
    const during = new Date(START.getTime() + MINUTE);

    expect(applyOutcome(locked, "FAILURE", during)).toEqual(locked);
    expect(fail(locked, 20, during)).toEqual(locked);
  });

  it("AC-11: SUCCESS sets consecutiveFailures and level to 0 and lockedUntil to null", () => {
    const deep = fail(fail(ZERO, ACCOUNT_LOCK_THRESHOLD, START), 3, new Date(START.getTime() + 15 * MINUTE));

    expect(deep.level).toBe(1);
    expect(deep.consecutiveFailures).toBe(3);
    expect(applyOutcome(deep, "SUCCESS", START)).toEqual(ZERO);
  });

  it("AC-11: CLEARED ends the lock and zeroes the count but keeps the level, so five failures after a clear at level 3 lock for 120 minutes", () => {
    let state = ZERO;
    let now = START;
    for (let lock = 0; lock < 3; lock += 1) {
      state = fail(state, ACCOUNT_LOCK_THRESHOLD, now);
      now = state.lockedUntil ?? now;
    }
    expect(state.level).toBe(3);

    const midLock = new Date(now.getTime() - MINUTE);
    expect(isLocked(state, midLock)).toBe(true);
    const withCount = { ...state, consecutiveFailures: 2 };
    const cleared = applyOutcome(withCount, "CLEARED", midLock);

    expect(cleared).toEqual({ consecutiveFailures: 0, level: 3, lockedUntil: null });
    expect(isLocked(cleared, midLock)).toBe(false);

    const relocked = fail(cleared, ACCOUNT_LOCK_THRESHOLD, midLock);

    expect(relocked.level).toBe(4);
    expect(relocked.lockedUntil?.getTime()).toBe(midLock.getTime() + 120 * MINUTE);
  });

  it("AC-11: applyOutcome returns a new object and leaves its input unchanged", () => {
    const locked = fail(ZERO, ACCOUNT_LOCK_THRESHOLD, START);
    const snapshot = { ...locked, lockedUntil: new Date(locked.lockedUntil?.getTime() ?? 0) };

    for (const outcome of ["SUCCESS", "FAILURE", "CLEARED"] as const) {
      const next = applyOutcome(locked, outcome, START);

      expect(next).not.toBe(locked);
      expect(locked).toEqual(snapshot);
    }
  });
});
