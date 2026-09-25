import { randomBytes } from "node:crypto";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { INITIAL_SETUP_STATE } from "@/app/setup/form-state";
import { setupAction } from "@/app/setup/actions";
import SetupPage from "@/app/setup/page";
import {
  NAME_REQUIRED_MESSAGE,
  PIN_FORMAT_MESSAGE,
  PIN_MISMATCH_MESSAGE,
  PIN_TOO_SIMPLE_MESSAGE,
  USERNAME_FORMAT_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
} from "@/lib/auth-messages";
import { deepKeys, MONEY_KEY_PATTERN } from "@/lib/money-boundary";
import { SETUP_FAILURE_BUDGET } from "@/server/auth/attempt-budget";
import { generatePin, isTrivialPin, SETUP_CODE_MIN_LENGTH } from "@/server/auth/credential-rules";
import { createActiveProfile } from "@/server/auth/operator-service";
import {
  accountKey,
  pinDigest,
  setupCodeMatches,
  signDeviceToken,
  verifyPin,
} from "@/server/auth/password";
import { completeSetup, setupAvailable, type SetupInput } from "@/server/auth/setup-service";
import { attemptSignIn } from "@/server/auth/sign-in-service";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { resetTestDb } from "@/server/test-db";

/**
 * First-run setup against a real Postgres (021 AC-27 to AC-29, AC-32 and AC-33's setup
 * half), and the `/setup` page and its action rendered and called on the server.
 *
 * WHY THE AVAILABLE SIDE IS PROVED HERE. The development database always holds an `ADMIN`,
 * so `/setup` answers 404 there and no end-to-end spec may claim setup. So the page is
 * rendered by React's server renderer against the test database, and the action is called
 * with a real form, in both states.
 *
 * `setupCodeMatches` is wrapped, not replaced, so "the code was not compared" is a count of
 * real calls. Every setup code is random bytes drawn at runtime, set with `vi.stubEnv`; every
 * PIN comes from `generatePin`; a trivial one is built by rule (AC-8).
 */
// Vitest compiles JSX with the classic runtime, which expects a `React` in scope; no module
// of the app imports one, because Next never needs it. Met here, for this file only, as
// `src/app/analysis/page.test.ts` meets it. The page's JSX runs only when it renders.
(globalThis as { React?: typeof React }).React = React;

vi.mock("@/server/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/password")>();
  const compare = vi.fn(actual.setupCodeMatches);
  return { ...actual, setupCodeMatches: compare };
});

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** A setup code of this run, long enough to be usable. */
function freshSetupCode(): string {
  return randomBytes(24).toString("base64url");
}

function newUsername(): string {
  return `s${hex(8)}`;
}

let code = "";

function setup(overrides: Partial<SetupInput> = {}): SetupInput {
  const pin = generatePin(6);
  return {
    code,
    name: `Owner ${hex(4)}`,
    username: newUsername(),
    pin,
    pinAgain: pin,
    ...overrides,
  };
}

function wrongCode(): string {
  for (;;) {
    const candidate = freshSetupCode();
    if (candidate !== code) return candidate;
  }
}

const compared = (): number => vi.mocked(setupCodeMatches).mock.calls.length;

async function counts(): Promise<{ users: number; events: number; claims: number }> {
  return {
    users: await db.user.count(),
    events: await db.authEvent.count(),
    claims: await db.setupClaim.count(),
  };
}

/** What Next put on the error it threw for a redirect or a 404. */
function digestOf(error: unknown): string {
  return typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : "";
}

function form(input: SetupInput): FormData {
  const data = new FormData();
  data.set("setupCode", input.code);
  data.set("name", input.name);
  data.set("username", input.username);
  data.set("pin", input.pin);
  data.set("pinAgain", input.pinAgain);
  return data;
}

beforeEach(async () => {
  await resetTestDb();
  code = freshSetupCode();
  vi.stubEnv("SETUP_CODE", code);
  vi.mocked(setupCodeMatches).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("021 AC-27: /setup exists only while the data says so", () => {
  it("AC-27: it is available on an empty database with a usable pepper and code", async () => {
    expect(await setupAvailable()).toBe(true);
  });

  it("AC-27: a single DEACTIVATED ADMIN row makes it unavailable", async () => {
    await db.user.create({
      data: { name: "Former owner", username: newUsername(), role: "ADMIN", status: "DEACTIVATED" },
    });

    expect(await setupAvailable()).toBe(false);
  });

  it("AC-27: a single ACTIVE ADMIN with no username and no PIN (a row migrated from #3) makes it unavailable", async () => {
    await db.user.create({ data: { name: "Migrated owner", role: "ADMIN", status: "ACTIVE" } });

    expect(await setupAvailable()).toBe(false);
  });

  it("AC-27: with only YARD_STAFF rows and a SetupClaim referencing one of them it is available: availability reads the profiles, not the claim", async () => {
    const staff = await createActiveProfile({
      name: `Staff ${hex(3)}`,
      username: newUsername(),
      role: "YARD_STAFF",
      pin: generatePin(6),
    });
    await db.user.create({ data: { name: "Another staff", role: "YARD_STAFF", status: "ACTIVE" } });
    await db.setupClaim.create({ data: { id: 1, userId: staff.id } });

    expect(await setupAvailable()).toBe(true);
  });

  it("AC-27: with SETUP_CODE unset, or one character short of the minimum, it is unavailable", async () => {
    vi.stubEnv("SETUP_CODE", "");
    expect(await setupAvailable()).toBe(false);

    vi.stubEnv("SETUP_CODE", code.slice(0, SETUP_CODE_MIN_LENGTH - 1));
    expect(await setupAvailable()).toBe(false);

    vi.stubEnv("SETUP_CODE", code.slice(0, SETUP_CODE_MIN_LENGTH));
    expect(await setupAvailable()).toBe(true);
  });

  it("AC-27: while it is unavailable, completeSetup returns UNAVAILABLE without comparing the code and writes nothing", async () => {
    await db.user.create({ data: { name: "Migrated owner", role: "ADMIN", status: "ACTIVE" } });
    const before = await counts();

    expect(await completeSetup(setup())).toEqual({ outcome: "UNAVAILABLE" });
    expect(await completeSetup(setup({ code: wrongCode() }))).toEqual({ outcome: "UNAVAILABLE" });

    expect(compared()).toBe(0);
    expect(await counts()).toEqual(before);
  });

  it("AC-27: the page, rendered on the server, is Next's 404 while setup is unavailable", async () => {
    await db.user.create({ data: { name: "Migrated owner", role: "ADMIN", status: "ACTIVE" } });

    const thrown = await SetupPage().then(
      () => null,
      (error: unknown) => error,
    );

    expect(digestOf(thrown)).toMatch(/404/);
  });

  it("AC-27, AC-34: while setup is available the page renders the form, with a masked setupCode field, no euro and no copy of the code", async () => {
    const html = renderToStaticMarkup(await SetupPage());

    expect(html).toContain("<h1");
    expect(html).toContain("Set up Macroads Stock");
    expect(html).toMatch(/<input[^>]*name="setupCode"[^>]*>/);
    expect(/<input[^>]*name="setupCode"[^>]*>/.exec(html)?.[0]).toContain('type="password"');
    for (const field of ["name", "username", "pin", "pinAgain"]) {
      expect(html).toMatch(new RegExp(`<input[^>]*name="${field}"`));
    }
    expect(html).toContain("Create administrator");
    expect(html).not.toContain("€");
    expect(html).not.toContain(code);
    // Nothing on it names a session.
    expect(html).not.toMatch(/session-token/);
  });
});

describe("021 AC-28: setup creates the first ADMIN once, and guards its code", () => {
  it("AC-28, AC-34: the correct code creates one ACTIVE ADMIN and the one SetupClaim, which then signs in, and setup is gone", async () => {
    const input = setup({ username: `  ${newUsername().toUpperCase()} ` });
    const username = input.username.trim().toLowerCase();

    const result = await completeSetup(input);

    expect(result.outcome).toBe("CREATED");
    const users = await db.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({
      status: "ACTIVE",
      role: "ADMIN",
      username,
      name: input.name,
      requestedUsername: null,
    });
    expect(await verifyPin(input.pin, users[0]?.pinHash ?? null)).toBe(true);
    expect(await db.setupClaim.findMany()).toEqual([
      expect.objectContaining({ id: 1, userId: users[0]?.id }),
    ]);

    expect(result).toMatchObject({
      profile: { id: users[0]?.id, username, role: "ADMIN", status: "ACTIVE", credentialSet: true },
    });
    expect(deepKeys(result).filter((key) => MONEY_KEY_PATTERN.test(key))).toEqual([]);
    expect(deepKeys(result).filter((key) => /pin|hash|code/i.test(key))).toEqual([]);

    const signedIn = await attemptSignIn(username, input.pin, { deviceToken: signDeviceToken(null) });
    expect(signedIn).toMatchObject({ outcome: "SIGNED_IN", user: { role: "ADMIN", username } });
    expect(await setupAvailable()).toBe(false);
  });

  it("AC-28: a wrong code returns CODE_INCORRECT and writes one SETUP_FAILURE event in bucket setup, and no profile", async () => {
    expect(await completeSetup(setup({ code: wrongCode() }))).toEqual({ outcome: "CODE_INCORRECT" });

    expect(await db.user.count()).toBe(0);
    const events = await db.authEvent.findMany();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: "SETUP_FAILURE", bucket: "setup", accountKey: null });
  });

  it("AC-28: after 10 wrong codes within 24 hours the correct code returns PAUSED, with the code not compared and no event written", async () => {
    for (let index = 0; index < SETUP_FAILURE_BUDGET; index += 1) {
      expect(await completeSetup(setup({ code: wrongCode() })), `wrong code ${index + 1}`).toEqual({
        outcome: "CODE_INCORRECT",
      });
    }
    vi.mocked(setupCodeMatches).mockClear();

    expect(await completeSetup(setup())).toEqual({ outcome: "PAUSED" });

    expect(compared()).toBe(0);
    expect(await db.authEvent.count()).toBe(SETUP_FAILURE_BUDGET);
    expect(await db.user.count()).toBe(0);
  });

  it("AC-28: invalid fields after a correct code raise ValidationError with the field's message and write no row and no event", async () => {
    const trivial = String(Number.parseInt(hex(1), 16) % 10).repeat(6);
    expect(isTrivialPin(trivial)).toBe(true);
    const pin = generatePin(6);
    let other = generatePin(6);
    while (other === pin) other = generatePin(6);

    const cases: [string, Partial<SetupInput>, string][] = [
      ["a blank name", { name: " " }, NAME_REQUIRED_MESSAGE],
      ["a malformed username", { username: `1${hex(4)}` }, USERNAME_FORMAT_MESSAGE],
      ["a malformed PIN", { pin: pin.slice(0, 5), pinAgain: pin.slice(0, 5) }, PIN_FORMAT_MESSAGE],
      ["a trivial PIN", { pin: trivial, pinAgain: trivial }, PIN_TOO_SIMPLE_MESSAGE],
      ["two different PINs", { pin, pinAgain: other }, PIN_MISMATCH_MESSAGE],
    ];

    for (const [label, overrides, message] of cases) {
      const error = await completeSetup(setup(overrides)).catch((thrown: unknown) => thrown);
      expect(error, label).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message, label).toBe(message);
    }
    expect(await counts()).toEqual({ users: 0, events: 0, claims: 0 });
    expect(await setupAvailable()).toBe(true);
  });

  it("AC-28: a username a YARD_STAFF profile already holds is refused, after a correct code, by name, and nothing is written", async () => {
    const staff = await createActiveProfile({
      name: `Staff ${hex(3)}`,
      username: newUsername(),
      role: "YARD_STAFF",
      pin: generatePin(6),
    });
    const before = await counts();

    const error = await completeSetup(setup({ username: staff.username })).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).message).toBe(USERNAME_TAKEN_MESSAGE(staff.username));
    expect(await counts()).toEqual(before);
  });

  it("AC-28: the action creates the ADMIN and answers with Next's redirect to /sign-in?setup=done, with no session", async () => {
    const input = setup();

    const thrown = await setupAction(INITIAL_SETUP_STATE, form(input)).then(
      () => null,
      (error: unknown) => error,
    );

    // Outside a request there is no cookie store: an action that tried to set one would
    // have thrown something other than the redirect.
    expect(digestOf(thrown)).toMatch(/^NEXT_REDIRECT;\w+;\/sign-in\?setup=done;/);
    expect(await db.user.count({ where: { role: "ADMIN", username: input.username } })).toBe(1);
  });

  it("AC-28: the action returns a wrong code to the form with no copy of the code and no code key", async () => {
    const input = setup({ code: wrongCode() });

    const state = await setupAction(INITIAL_SETUP_STATE, form(input));

    expect(Object.keys(state).sort()).toEqual(["attempt", "error", "name", "username"]);
    expect(JSON.stringify(state)).not.toContain(input.code);
    expect(JSON.stringify(state)).not.toContain(code);
  });
});

describe("021 AC-29: two simultaneous setups cannot both succeed", () => {
  for (let repetition = 1; repetition <= 20; repetition += 1) {
    it(`AC-29: repetition ${repetition} of 20, from a freshly reset database: one CREATED, one UNAVAILABLE, one ADMIN, one claim`, async () => {
      const results = await Promise.allSettled([completeSetup(setup()), completeSetup(setup())]);

      expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
      const outcomes = results
        .map((result) => (result.status === "fulfilled" ? result.value.outcome : "THREW"))
        .sort();
      expect(outcomes).toEqual(["CREATED", "UNAVAILABLE"]);
      expect(await db.user.count({ where: { role: "ADMIN" } })).toBe(1);
      expect(await db.setupClaim.count()).toBe(1);

      // A third call afterwards is turned away before the code is compared.
      vi.mocked(setupCodeMatches).mockClear();
      expect(await completeSetup(setup())).toEqual({ outcome: "UNAVAILABLE" });
      expect(compared()).toBe(0);
    });
  }
});

describe("021 AC-32: without its pepper, setup is unavailable", () => {
  it("AC-32: with PIN_PEPPER unset setupAvailable() is false and completeSetup writes nothing", async () => {
    vi.stubEnv("PIN_PEPPER", "");

    expect(await setupAvailable()).toBe(false);
    expect(await completeSetup(setup())).toEqual({ outcome: "UNAVAILABLE" });
    expect(await counts()).toEqual({ users: 0, events: 0, claims: 0 });
  });
});

describe("021 AC-33: setup logs no code, PIN, digest, hash, key or username", () => {
  it("AC-33: a wrong code and then the right one print none of them", async () => {
    const spies = (["log", "info", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => {}),
    );
    const wrong = setup({ code: wrongCode() });
    const right = setup();

    expect(await completeSetup(wrong)).toEqual({ outcome: "CODE_INCORRECT" });
    expect((await completeSetup(right)).outcome).toBe("CREATED");

    const row = await db.user.findFirstOrThrow({ where: { role: "ADMIN" } });
    const output = spies
      .flatMap((spy) => spy.mock.calls.flat())
      .map(String)
      .join("\n");
    expect(output).toMatch(/^auth\.setup_code_incorrect/m);
    for (const secret of [
      code,
      wrong.code,
      right.pin,
      wrong.pin,
      pinDigest(right.pin),
      row.pinHash ?? "",
      accountKey(right.username),
      right.username,
      wrong.username,
    ]) {
      expect(secret).not.toBe("");
      expect(output).not.toContain(secret);
    }
  });
});
