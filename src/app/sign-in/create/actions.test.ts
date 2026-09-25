import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  NAME_REQUIRED_MESSAGE,
  PROFILE_REQUESTS_PAUSED,
  SIGN_IN_UNAVAILABLE_MESSAGE,
} from "@/lib/auth-messages";
import { generatePin } from "@/server/auth/credential-rules";
import { DEVICE_COOKIE } from "@/server/auth/sign-in-codes";
import { ValidationError } from "@/server/errors";

import { requestProfileAction } from "./actions";
import { INITIAL_CREATE_PROFILE_STATE } from "./form-state";

/**
 * *Create profile*'s action with no database (021 AC-18, AC-20, AC-32): what it reads from
 * the form, what it hands the service, and what it returns to the form for each outcome.
 * The service is mocked; `profile-request-service.db.test.ts` proves the service itself.
 */
const mocks = vi.hoisted(() => ({
  requestProfile: vi.fn(),
  redirect: vi.fn((url: string): never => {
    throw Object.assign(new Error("redirected"), { url });
  }),
  deviceToken: undefined as string | undefined,
}));

vi.mock("@/server/auth/profile-request-service", () => ({
  requestProfile: mocks.requestProfile,
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === DEVICE_COOKIE && mocks.deviceToken !== undefined
        ? { name, value: mocks.deviceToken }
        : undefined,
  }),
}));

type Submission = { name: string; username: string; pin: string; pinAgain: string };

function submission(): Submission {
  const pin = generatePin(6);
  return { name: `Requester ${randomBytes(4).toString("hex")}`, username: `r${randomBytes(6).toString("hex")}`, pin, pinAgain: pin };
}

function form(fields: Submission, extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("name", fields.name);
  data.set("requestedUsername", fields.username);
  data.set("pin", fields.pin);
  data.set("pinAgain", fields.pinAgain);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

beforeEach(() => {
  mocks.requestProfile.mockReset();
  mocks.redirect.mockClear();
  mocks.deviceToken = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("021 AC-18: the action asks, and cannot grant", () => {
  it("AC-18: it hands the service exactly the four typed fields and the device cookie; forged role, status, username and pinHash reach nothing", async () => {
    const fields = submission();
    mocks.deviceToken = randomBytes(8).toString("hex");
    mocks.requestProfile.mockResolvedValue({ outcome: "SENT" });

    const forged = form(fields, {
      role: "ADMIN",
      status: "ACTIVE",
      username: `forged${randomBytes(4).toString("hex")}`,
      pinHash: randomBytes(30).toString("base64"),
    });
    await expect(requestProfileAction(INITIAL_CREATE_PROFILE_STATE, forged)).rejects.toMatchObject({
      url: "/sign-in/requested",
    });

    expect(mocks.requestProfile).toHaveBeenCalledTimes(1);
    expect(mocks.requestProfile.mock.calls[0]).toEqual([
      { name: fields.name, username: fields.username, pin: fields.pin, pinAgain: fields.pinAgain },
      { deviceToken: mocks.deviceToken },
    ]);
  });

  it("AC-18: without a device cookie the request is a new device's", async () => {
    mocks.requestProfile.mockResolvedValue({ outcome: "SENT" });

    await expect(
      requestProfileAction(INITIAL_CREATE_PROFILE_STATE, form(submission())),
    ).rejects.toMatchObject({ url: "/sign-in/requested" });
    expect(mocks.requestProfile.mock.calls[0]?.[1]).toEqual({ deviceToken: null });
  });

  it("AC-18: a field error returns its message, keeps the name and username, and carries no PIN", async () => {
    const fields = submission();
    mocks.requestProfile.mockRejectedValue(new ValidationError("name", NAME_REQUIRED_MESSAGE));

    const state = await requestProfileAction(INITIAL_CREATE_PROFILE_STATE, form(fields));

    expect(state).toEqual({
      error: NAME_REQUIRED_MESSAGE,
      name: fields.name,
      username: fields.username,
      attempt: 1,
    });
    expect(JSON.stringify(state)).not.toContain(fields.pin);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("AC-18: an error that is not a field error is not swallowed", async () => {
    mocks.requestProfile.mockRejectedValue(new Error("boom"));

    await expect(requestProfileAction(INITIAL_CREATE_PROFILE_STATE, form(submission()))).rejects.toThrow(
      "boom",
    );
  });
});

describe("021 AC-20, AC-32: a refusal that is not a field error echoes nothing", () => {
  it("AC-20: PAUSED renders PROFILE_REQUESTS_PAUSED, identically whatever username was typed", async () => {
    mocks.requestProfile.mockResolvedValue({ outcome: "PAUSED" });

    const first = await requestProfileAction(INITIAL_CREATE_PROFILE_STATE, form(submission()));
    const second = await requestProfileAction(INITIAL_CREATE_PROFILE_STATE, form(submission()));

    expect(first).toEqual({ error: PROFILE_REQUESTS_PAUSED, name: "", username: "", attempt: 1 });
    expect(second).toEqual(first);
  });

  it("AC-32: UNAVAILABLE renders SIGN_IN_UNAVAILABLE_MESSAGE and nothing else", async () => {
    mocks.requestProfile.mockResolvedValue({ outcome: "UNAVAILABLE" });

    const state = await requestProfileAction(INITIAL_CREATE_PROFILE_STATE, form(submission()));

    expect(state).toEqual({ error: SIGN_IN_UNAVAILABLE_MESSAGE, name: "", username: "", attempt: 1 });
  });
});
