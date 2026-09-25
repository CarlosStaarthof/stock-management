import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PIN_MISMATCH_MESSAGE,
  SETUP_CODE_INCORRECT_MESSAGE,
  SETUP_PAUSED_MESSAGE,
} from "@/lib/auth-messages";
import { generatePin } from "@/server/auth/credential-rules";
import { ValidationError } from "@/server/errors";

import { setupAction } from "./actions";
import { INITIAL_SETUP_STATE, type SetupFormState } from "./form-state";

/**
 * First-run setup's action with no database (021 AC-27, AC-28, AC-33): the setup code goes
 * to `completeSetup` and nowhere else — never into the state returned to the form, never
 * to the console — and each outcome gets its answer. The service is mocked here;
 * `setup-service.db.test.ts` proves it against Postgres. `next/navigation` is the real one,
 * so the redirect and the 404 are what Next itself throws.
 */
const mocks = vi.hoisted(() => ({ completeSetup: vi.fn() }));

vi.mock("@/server/auth/setup-service", () => ({ completeSetup: mocks.completeSetup }));

type Fields = { code: string; name: string; username: string; pin: string; pinAgain: string };

function fields(): Fields {
  const pin = generatePin(6);
  return {
    code: randomBytes(18).toString("base64url"),
    name: `Owner ${randomBytes(4).toString("hex")}`,
    username: `o${randomBytes(6).toString("hex")}`,
    pin,
    pinAgain: pin,
  };
}

function form(typed: Fields): FormData {
  const data = new FormData();
  data.set("setupCode", typed.code);
  data.set("name", typed.name);
  data.set("username", typed.username);
  data.set("pin", typed.pin);
  data.set("pinAgain", typed.pinAgain);
  return data;
}

/** What Next put on the error it threw for a redirect or a 404. */
function digestOf(error: unknown): string {
  return typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : "";
}

const consoleMethods = ["log", "info", "warn", "error"] as const;

beforeEach(() => {
  mocks.completeSetup.mockReset();
  for (const method of consoleMethods) vi.spyOn(console, method).mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function printed(): string {
  return consoleMethods
    .flatMap((method) => vi.mocked(console[method]).mock.calls.flat())
    .map(String)
    .join("\n");
}

describe("021 AC-28: the setup code is compared once and returned nowhere", () => {
  it("AC-28: completeSetup receives the code, the name, the username and both PINs from the form", async () => {
    const typed = fields();
    mocks.completeSetup.mockResolvedValue({ outcome: "CODE_INCORRECT" });

    await setupAction(INITIAL_SETUP_STATE, form(typed));

    expect(mocks.completeSetup.mock.calls).toEqual([[typed]]);
  });

  it("AC-28: after every outcome that returns to the form, the state has no code key and holds no code or PIN", async () => {
    const outcomes: [string, () => void, string][] = [
      ["CODE_INCORRECT", () => mocks.completeSetup.mockResolvedValue({ outcome: "CODE_INCORRECT" }), SETUP_CODE_INCORRECT_MESSAGE],
      ["PAUSED", () => mocks.completeSetup.mockResolvedValue({ outcome: "PAUSED" }), SETUP_PAUSED_MESSAGE],
      [
        "a field error after a correct code",
        () => mocks.completeSetup.mockRejectedValue(new ValidationError("pinAgain", PIN_MISMATCH_MESSAGE)),
        PIN_MISMATCH_MESSAGE,
      ],
    ];

    for (const [label, arrange, message] of outcomes) {
      const typed = fields();
      arrange();

      const state: SetupFormState = await setupAction(INITIAL_SETUP_STATE, form(typed));

      expect(state, label).toEqual({
        error: message,
        name: typed.name,
        username: typed.username,
        attempt: 1,
      });
      expect(Object.keys(state).filter((key) => /code/i.test(key)), label).toEqual([]);
      const serialised = JSON.stringify(state);
      expect(serialised, label).not.toContain(typed.code);
      expect(serialised, label).not.toContain(typed.pin);
    }
  });

  it("AC-28: CREATED is a redirect to /sign-in?setup=done, and nothing else is returned", async () => {
    mocks.completeSetup.mockResolvedValue({ outcome: "CREATED", profile: {} });

    const thrown = await setupAction(INITIAL_SETUP_STATE, form(fields())).then(
      () => null,
      (error: unknown) => error,
    );

    expect(digestOf(thrown)).toMatch(/^NEXT_REDIRECT;\w+;\/sign-in\?setup=done;/);
  });

  it("AC-27, AC-29: UNAVAILABLE is the same 404 the page gives", async () => {
    mocks.completeSetup.mockResolvedValue({ outcome: "UNAVAILABLE" });

    const thrown = await setupAction(INITIAL_SETUP_STATE, form(fields())).then(
      () => null,
      (error: unknown) => error,
    );

    expect(digestOf(thrown)).toMatch(/404/);
    expect(digestOf(thrown)).not.toMatch(/REDIRECT/);
  });
});

describe("021 AC-33: the action writes nothing to the console", () => {
  it("AC-33: no outcome prints the code, a PIN or the username", async () => {
    const typed = fields();
    for (const outcome of ["CODE_INCORRECT", "PAUSED", "CREATED", "UNAVAILABLE"]) {
      mocks.completeSetup.mockResolvedValue({ outcome, profile: {} });
      await setupAction(INITIAL_SETUP_STATE, form(typed)).catch(() => undefined);
    }

    const output = printed();
    for (const secret of [typed.code, typed.pin, typed.username]) {
      expect(output).not.toContain(secret);
    }
  });
});
