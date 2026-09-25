import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BUDGET_WINDOW_HOURS,
  DEVICE_TOKEN_MAX_AGE_DAYS,
  EVENT_RETENTION_DAYS,
  PENDING_PROFILE_CAP,
  PIN_FAILURE_BUDGET,
  PROFILE_REQUEST_BUDGET,
  SETUP_FAILURE_BUDGET,
  type AttemptEvent,
  type AttemptEventKind,
  bucketFor,
  decideAttempt,
} from "@/server/auth/attempt-budget";
import { signDeviceToken, verifyDeviceToken } from "@/server/auth/password";

/**
 * 021 AC-13, with no database. The device tokens are signed under an `AUTH_SECRET`
 * generated for this run, never the developer's.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-09-25T12:00:00.000Z");

function at(offsetMs: number): Date {
  return new Date(NOW.getTime() + offsetMs);
}

function events(kind: AttemptEventKind, count: number, firstAt: Date, stepMs = 60_000): AttemptEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    kind,
    at: new Date(firstAt.getTime() + i * stepMs),
  }));
}

function decide(list: AttemptEvent[]): ReturnType<typeof decideAttempt> {
  return decideAttempt(list, "PIN_FAILURE", NOW, PIN_FAILURE_BUDGET, BUDGET_WINDOW_HOURS);
}

describe("the budget constants", () => {
  it("AC-13: every budget, window, cap and age is the spec's", () => {
    expect(PIN_FAILURE_BUDGET).toBe(10);
    expect(PROFILE_REQUEST_BUDGET).toBe(10);
    expect(SETUP_FAILURE_BUDGET).toBe(10);
    expect(BUDGET_WINDOW_HOURS).toBe(24);
    expect(PENDING_PROFILE_CAP).toBe(20);
    expect(DEVICE_TOKEN_MAX_AGE_DAYS).toBe(180);
    expect(EVENT_RETENTION_DAYS).toBe(30);
  });
});

describe("decideAttempt", () => {
  it("AC-13: nine events in the preceding 24 hours allow the attempt, and ten refuse it", () => {
    expect(decide([])).toBe("ALLOW");
    expect(decide(events("PIN_FAILURE", 9, at(-3 * HOUR)))).toBe("ALLOW");
    expect(decide(events("PIN_FAILURE", 10, at(-3 * HOUR)))).toBe("REFUSE");
    expect(decide(events("PIN_FAILURE", 25, at(-3 * HOUR)))).toBe("REFUSE");
  });

  it("AC-13: when the oldest of the ten is exactly 24 hours old, the attempt is allowed", () => {
    const oldest = { kind: "PIN_FAILURE" as const, at: at(-DAY) };
    const justInside = { kind: "PIN_FAILURE" as const, at: at(-DAY + 1) };
    const nine = events("PIN_FAILURE", 9, at(-HOUR));

    expect(decide([oldest, ...nine])).toBe("ALLOW");
    expect(decide([justInside, ...nine])).toBe("REFUSE");
    expect(decide(events("PIN_FAILURE", 10, at(-30 * HOUR)))).toBe("ALLOW");
  });

  it("AC-13: a BUDGET_RESET later than all ten allows the attempt", () => {
    const ten = events("PIN_FAILURE", 10, at(-5 * HOUR));
    const reset = { kind: "BUDGET_RESET" as const, at: at(-HOUR) };

    expect(decide(ten)).toBe("REFUSE");
    expect(decide([...ten, reset])).toBe("ALLOW");
    expect(decide([reset, ...ten])).toBe("ALLOW");
  });

  it("AC-13: events earlier than the latest BUDGET_RESET are not counted, and those after it are", () => {
    const before = events("PIN_FAILURE", 10, at(-10 * HOUR));
    const olderReset = { kind: "BUDGET_RESET" as const, at: at(-12 * HOUR) };
    const latestReset = { kind: "BUDGET_RESET" as const, at: at(-6 * HOUR) };
    const afterNine = events("PIN_FAILURE", 9, at(-5 * HOUR));
    const afterTen = events("PIN_FAILURE", 10, at(-5 * HOUR));

    expect(decide([...before, olderReset, latestReset, ...afterNine])).toBe("ALLOW");
    expect(decide([...before, latestReset, olderReset, ...afterTen])).toBe("REFUSE");
  });

  it("AC-13: an event at the same instant as the latest reset was cleared by it", () => {
    const reset = { kind: "BUDGET_RESET" as const, at: at(-HOUR) };
    const atReset = events("PIN_FAILURE", 1, reset.at);
    const nineAfter = events("PIN_FAILURE", 9, at(-30 * 60_000));

    expect(decide([reset, ...atReset, ...nineAfter])).toBe("ALLOW");
  });

  it("AC-13: events of another kind are ignored", () => {
    const requests = events("PROFILE_REQUEST", 10, at(-HOUR));
    const setups = events("SETUP_FAILURE", 10, at(-HOUR));
    const nine = events("PIN_FAILURE", 9, at(-HOUR));

    expect(decide([...requests, ...setups, ...nine])).toBe("ALLOW");
    expect(
      decideAttempt([...requests, ...nine], "PROFILE_REQUEST", NOW, PROFILE_REQUEST_BUDGET, BUDGET_WINDOW_HOURS),
    ).toBe("REFUSE");
    expect(
      decideAttempt([...setups, ...nine], "SETUP_FAILURE", NOW, SETUP_FAILURE_BUDGET, BUDGET_WINDOW_HOURS),
    ).toBe("REFUSE");
  });
});

describe("bucketFor", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("base64"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("AC-13: a valid device token draws on its own device's bucket", () => {
    const token = signDeviceToken(null, NOW);
    const id = verifyDeviceToken(token, NOW);

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(bucketFor("PIN_FAILURE", id)).toBe(`pin:device:${id}`);
    expect(bucketFor("PROFILE_REQUEST", id)).toBe(`request:device:${id}`);
  });

  it("AC-13: a null, expired, malformed or forged device token draws on the shared new-device bucket", () => {
    const valid = signDeviceToken(null, NOW);
    const expired = signDeviceToken(null, at(-(DEVICE_TOKEN_MAX_AGE_DAYS * DAY + HOUR)));
    const lastCharacter = valid.slice(-1) === "0" ? "1" : "0";
    const tampered = `${valid.slice(0, -1)}${lastCharacter}`;

    vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("base64"));
    const forged = signDeviceToken(null, NOW);
    vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("base64"));

    const tokens = [null, expired, "", "not-a-token", randomBytes(40).toString("hex"), tampered, forged];

    for (const token of tokens) {
      const id = verifyDeviceToken(token, NOW);

      expect(bucketFor("PIN_FAILURE", id), String(token)).toBe("pin:new-devices");
      expect(bucketFor("PROFILE_REQUEST", id), String(token)).toBe("request:new-devices");
    }
  });

  it("AC-13: a string that is not a device id never becomes part of a bucket name", () => {
    const id = randomBytes(16).toString("hex");

    for (const notAnId of [id.toUpperCase(), `${id}0`, id.slice(1), `../${id.slice(3)}`, ""]) {
      expect(bucketFor("PIN_FAILURE", notAnId)).toBe("pin:new-devices");
    }
  });

  it("AC-13: setup has one bucket for everyone", () => {
    const id = randomBytes(16).toString("hex");

    expect(bucketFor("SETUP_FAILURE", null)).toBe("setup");
    expect(bucketFor("SETUP_FAILURE", id)).toBe("setup");
  });
});
