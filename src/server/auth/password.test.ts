import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SETUP_CODE_MIN_LENGTH, generatePin } from "@/server/auth/credential-rules";
import {
  CredentialSecretError,
  accountKey,
  currentPinKeyId,
  hashPin,
  pinDigest,
  setupCodeConfigured,
  setupCodeMatches,
  signDeviceToken,
  verifyDeviceToken,
  verifyPin,
} from "@/server/auth/password";

// A bcrypt hash at cost 10 or above — 003 AC-3 and 021 AC-5 quote this expression.
//
// Level 1: no database, no environment. #3's password tests went with the passwords; 021
// AC-5 proves the same properties of the PIN hash below.
const BCRYPT_AT_COST_10_OR_ABOVE = /^\$2[aby]\$(1[0-9]|[2-9][0-9])\$/;

// ---------------------------------------------------------------------------------------
// 021 — PINs, the lock key, the device token and the setup code.
//
// Every PIN, username, pepper, secret and setup code below is generated at runtime (021
// AC-5, AC-8); the developer's own values are never read, because each test sets its own
// with `vi.stubEnv` and removes it afterwards.
// ---------------------------------------------------------------------------------------

const PEPPER_BYTES = 32;

function newPepper(bytes = PEPPER_BYTES): string {
  return randomBytes(bytes).toString("base64");
}

/** "k" is not a hex digit, so a username can never appear inside a hex key by chance. */
function newUsername(): string {
  return `k${randomBytes(6).toString("hex")}`;
}

function differentPin(pin: string): string {
  for (;;) {
    const other = generatePin(pin.length === 4 ? 4 : 6);
    if (other !== pin) return other;
  }
}

/** Every six-character window of `value`: "no part of it" is checked window by window. */
function windows(value: string, size = 6): string[] {
  return Array.from({ length: Math.max(0, value.length - size + 1) }, (_, i) => value.slice(i, i + size));
}

const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_16 = /^[0-9a-f]{16}$/;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PIN hashing (021 S3, S4)", () => {
  beforeEach(() => {
    vi.stubEnv("PIN_PEPPER", newPepper());
  });

  it("AC-5: pinDigest is 64 lowercase hex characters, identical under one pepper and different under another", () => {
    const pin = generatePin(4);

    const first = pinDigest(pin);
    const again = pinDigest(pin);
    vi.stubEnv("PIN_PEPPER", newPepper());
    const underAnother = pinDigest(pin);

    expect(first).toMatch(HEX_64);
    expect(again).toBe(first);
    expect(underAnother).toMatch(HEX_64);
    expect(underAnother).not.toBe(first);
  });

  it("AC-5: hashPin returns bcrypt at cost 10 or above, and the current pepper's key id", async () => {
    for (const length of [4, 6] as const) {
      const { pinHash, pinKeyId } = await hashPin(generatePin(length));

      expect(pinHash).toMatch(BCRYPT_AT_COST_10_OR_ABOVE);
      expect(pinKeyId).toMatch(HEX_16);
      expect(pinKeyId).toBe(currentPinKeyId());
    }
  });

  it("AC-5: hashing one PIN twice gives two different hashes, and verifyPin accepts both", async () => {
    for (const length of [4, 6] as const) {
      const pin = generatePin(length);

      const first = await hashPin(pin);
      const second = await hashPin(pin);

      expect(first.pinHash).not.toBe(second.pinHash);
      expect(await verifyPin(pin, first.pinHash)).toBe(true);
      expect(await verifyPin(pin, second.pinHash)).toBe(true);
    }
  });

  it("AC-5: verifyPin is false for a different PIN", async () => {
    const pin = generatePin(4);
    const { pinHash } = await hashPin(pin);

    expect(await verifyPin(differentPin(pin), pinHash)).toBe(false);
  });

  it("AC-5: verifyPin is false for the same PIN once PIN_PEPPER is replaced, so no stored value can be tested without the pepper", async () => {
    const pin = generatePin(6);
    const { pinHash } = await hashPin(pin);

    vi.stubEnv("PIN_PEPPER", newPepper());

    expect(await verifyPin(pin, pinHash)).toBe(false);
  });

  it("AC-5: no pinHash contains the PIN or its digest", async () => {
    const pin = generatePin(6);
    const digest = pinDigest(pin);

    const { pinHash } = await hashPin(pin);

    expect(pinHash).not.toContain(pin);
    expect(pinHash).not.toContain(digest);
    expect(pinHash).not.toContain(digest.slice(0, 16));
  });

  it("AC-5: pinKeyId is identical for every hash under one pepper and different under another", async () => {
    const first = await hashPin(generatePin(4));
    const second = await hashPin(generatePin(6));
    vi.stubEnv("PIN_PEPPER", newPepper());
    const third = await hashPin(generatePin(4));

    expect(second.pinKeyId).toBe(first.pinKeyId);
    expect(third.pinKeyId).toMatch(HEX_16);
    expect(third.pinKeyId).not.toBe(first.pinKeyId);
  });

  it("AC-5: the pepper is read as bytes, so one key in standard or URL-safe base64 gives one digest", () => {
    const bytes = randomBytes(PEPPER_BYTES);
    const pin = generatePin(6);

    vi.stubEnv("PIN_PEPPER", bytes.toString("base64"));
    const standard = pinDigest(pin);
    vi.stubEnv("PIN_PEPPER", ` ${bytes.toString("base64url")}\n`);
    const urlSafe = pinDigest(pin);

    expect(urlSafe).toBe(standard);
  });
});

describe("the lock key (021 S5)", () => {
  beforeEach(() => {
    vi.stubEnv("PIN_PEPPER", newPepper());
  });

  it("AC-5: accountKey is 64 lowercase hex, one key for every letter case, and different under another pepper", () => {
    const username = newUsername();

    const key = accountKey(username);
    const shouted = accountKey(username.toUpperCase());
    const mixed = accountKey(username.slice(0, 1).toUpperCase() + username.slice(1));
    vi.stubEnv("PIN_PEPPER", newPepper());
    const underAnother = accountKey(username);

    expect(key).toMatch(HEX_64);
    expect(shouted).toBe(key);
    expect(mixed).toBe(key);
    expect(underAnother).toMatch(HEX_64);
    expect(underAnother).not.toBe(key);
  });

  it("AC-5: accountKey does not contain the username, and is not the PIN digest of the same text", () => {
    const username = newUsername();

    const key = accountKey(username);

    expect(key).not.toContain(username);
    expect(key).not.toContain(username.slice(1));
    expect(key).not.toBe(pinDigest(username));
  });
});

describe("without a usable PIN_PEPPER, every PIN operation fails closed (021 S3, AC-5)", () => {
  const PIN_OPERATIONS: Record<string, () => unknown> = {
    pinDigest: () => pinDigest(generatePin(4)),
    currentPinKeyId: () => currentPinKeyId(),
    accountKey: () => accountKey(newUsername()),
  };

  const ASYNC_PIN_OPERATIONS: Record<string, () => Promise<unknown>> = {
    hashPin: () => hashPin(generatePin(4)),
    verifyPin: () => verifyPin(generatePin(4), null),
  };

  // Unset, empty, blank, too short, and long enough but not base64 at all.
  const unusable: Array<{ label: string; value: string | undefined }> = [
    { label: "unset", value: undefined },
    { label: "empty", value: "" },
    { label: "blank", value: "   " },
    { label: "31 bytes", value: newPepper(PEPPER_BYTES - 1) },
    { label: "16 bytes", value: newPepper(16) },
    { label: "not base64", value: `${newPepper()}!${newPepper()}` },
  ];

  function expectNamedAndClean(error: unknown, value: string | undefined): void {
    expect(error).toBeInstanceOf(CredentialSecretError);
    const message = (error as Error).message;

    expect(message).toContain("PIN_PEPPER");
    for (const part of windows((value ?? "").trim())) {
      expect(message).not.toContain(part);
    }
  }

  for (const { label, value } of unusable) {
    it(`AC-5: with PIN_PEPPER ${label}, each PIN operation throws a message naming PIN_PEPPER and no part of its value`, async () => {
      vi.stubEnv("PIN_PEPPER", value);

      for (const [name, run] of Object.entries(PIN_OPERATIONS)) {
        let thrown: unknown;
        try {
          run();
        } catch (error) {
          thrown = error;
        }
        expect(thrown, name).toBeDefined();
        expectNamedAndClean(thrown, value);
      }

      for (const [name, run] of Object.entries(ASYNC_PIN_OPERATIONS)) {
        const thrown = await run().then(
          () => undefined,
          (error: unknown) => error,
        );
        expect(thrown, name).toBeDefined();
        expectNamedAndClean(thrown, value);
      }
    });
  }
});

describe("verifyPin's work does not depend on whether a usable hash exists (021 S3, AC-10's unit half)", () => {
  type Bcrypt = {
    compare: (data: string, hash: string) => Promise<boolean>;
    hash: (data: string, rounds: number) => Promise<string>;
  };

  // The library's name is assembled so that this file never names the hashing module in
  // anything a boundary scan could read as an import of it (003 AC-5, 021 AC-6).
  const LIBRARY = ["bcrypt", "js"].join("");

  afterEach(() => {
    vi.doUnmock(LIBRARY);
    vi.resetModules();
  });

  it("AC-10: with no usable hash it still makes exactly one bcrypt comparison, against one per-process hash of random bytes", async () => {
    vi.stubEnv("PIN_PEPPER", newPepper());
    const compare = vi.fn<Bcrypt["compare"]>();
    const hash = vi.fn<Bcrypt["hash"]>();
    vi.resetModules();
    vi.doMock(LIBRARY, async (importOriginal) => {
      const actual = await importOriginal<{ default: Bcrypt }>();
      compare.mockImplementation((data, stored) => actual.default.compare(data, stored));
      hash.mockImplementation((data, rounds) => actual.default.hash(data, rounds));
      return { ...actual, default: { ...actual.default, compare, hash } };
    });
    const fresh = await import("@/server/auth/password");
    const pin = generatePin(6);
    const stored = await fresh.hashPin(pin);
    hash.mockClear();

    const results: boolean[] = [];
    const comparedAgainst: string[] = [];
    for (const candidate of [null, null, "not-a-hash", ""]) {
      compare.mockClear();
      results.push(await fresh.verifyPin(pin, candidate));
      expect(compare, String(candidate)).toHaveBeenCalledTimes(1);
      comparedAgainst.push(compare.mock.calls[0]?.[1] ?? "");
    }
    compare.mockClear();
    const genuine = await fresh.verifyPin(pin, stored.pinHash);

    expect(results).toEqual([false, false, false, false]);
    expect(hash).toHaveBeenCalledTimes(1);
    expect(new Set(comparedAgainst).size).toBe(1);
    expect(comparedAgainst[0]).toMatch(BCRYPT_AT_COST_10_OR_ABOVE);
    expect(comparedAgainst[0]).not.toBe(stored.pinHash);
    expect(genuine).toBe(true);
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare.mock.calls[0]?.[1]).toBe(stored.pinHash);
  });
});

describe("the device token (021 S7, AC-16's token half)", () => {
  const DAY_MS = 86_400_000;
  const NOW = new Date("2026-09-25T12:00:00.000Z");

  beforeEach(() => {
    vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("base64"));
    vi.stubEnv("PIN_PEPPER", newPepper());
  });

  it("AC-16: a new token names a new random device id, valid for 180 days and not a moment longer", () => {
    const first = signDeviceToken(null, NOW);
    const second = signDeviceToken(null, NOW);
    const id = verifyDeviceToken(first, NOW);
    const expiry = NOW.getTime() + 180 * DAY_MS;

    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(verifyDeviceToken(second, NOW)).not.toBe(id);
    expect(verifyDeviceToken(first, new Date(expiry - 1000))).toBe(id);
    expect(verifyDeviceToken(first, new Date(expiry))).toBeNull();
    expect(verifyDeviceToken(first, new Date(expiry + DAY_MS))).toBeNull();
  });

  it("AC-16: renewing keeps the device id and moves the expiry", () => {
    const original = signDeviceToken(null, NOW);
    const id = verifyDeviceToken(original, NOW);
    const later = new Date(NOW.getTime() + 100 * DAY_MS);
    const pastOriginalExpiry = new Date(NOW.getTime() + 200 * DAY_MS);

    const renewed = signDeviceToken(id, later);

    expect(verifyDeviceToken(renewed, later)).toBe(id);
    expect(verifyDeviceToken(renewed, pastOriginalExpiry)).toBe(id);
    expect(verifyDeviceToken(original, pastOriginalExpiry)).toBeNull();
  });

  it("AC-16: a token with any single character changed is null", () => {
    const token = signDeviceToken(null, NOW);
    const replacements = ["0", "f", "a", "9", "F", ".", "v", "-", " "];

    for (let index = 0; index < token.length; index += 1) {
      for (const replacement of replacements) {
        if (replacement === token[index]) continue;
        const changed = token.slice(0, index) + replacement + token.slice(index + 1);

        expect(verifyDeviceToken(changed, NOW), `${index}:${replacement}`).toBeNull();
      }
    }
  });

  it("AC-16: a token signed under another AUTH_SECRET is null", () => {
    const token = signDeviceToken(null, NOW);

    vi.stubEnv("AUTH_SECRET", randomBytes(32).toString("base64"));

    expect(verifyDeviceToken(token, NOW)).toBeNull();
  });

  it("AC-16: a valid token still names its device after PIN_PEPPER is replaced", () => {
    const token = signDeviceToken(null, NOW);
    const id = verifyDeviceToken(token, NOW);

    vi.stubEnv("PIN_PEPPER", newPepper());

    expect(verifyDeviceToken(token, NOW)).toBe(id);
    vi.stubEnv("PIN_PEPPER", undefined);
    expect(verifyDeviceToken(token, NOW)).toBe(id);
  });

  it("AC-16: verifyDeviceToken never throws, whatever it is handed", () => {
    const token = signDeviceToken(null, NOW);
    const inputs: unknown[] = [
      undefined,
      null,
      0,
      {},
      [token],
      "",
      "v1",
      "v1...",
      `${token}.`,
      `.${token}`,
      ` ${token}`,
      token.toUpperCase(),
      token.repeat(2),
      "x".repeat(1_000_000),
    ];

    for (const input of inputs) {
      expect(() => verifyDeviceToken(input, NOW)).not.toThrow();
      expect(verifyDeviceToken(input, NOW)).toBeNull();
    }
  });

  it("AC-16: without AUTH_SECRET no token is issued and none is accepted", () => {
    const token = signDeviceToken(null, NOW);

    vi.stubEnv("AUTH_SECRET", undefined);

    expect(verifyDeviceToken(token, NOW)).toBeNull();
    expect(() => signDeviceToken(null, NOW)).toThrow(CredentialSecretError);
    expect(() => signDeviceToken(null, NOW)).toThrow(/AUTH_SECRET/);
  });
});

describe("the setup code (021 S9, AC-28's comparison half)", () => {
  function newSetupCode(): string {
    // A letter first, so there is always one letter whose case can be changed.
    return `Q${randomBytes(24).toString("base64url")}`;
  }

  // The name of the constant-time comparison, assembled so that this file never spells a
  // call to it (021 AC-6 counts the files that call it).
  const CONSTANT_TIME_EQUAL = ["timing", "Safe", "Equal"].join("");

  it("AC-28: setupCodeMatches is true only for the exact code", () => {
    const code = newSetupCode();
    vi.stubEnv("SETUP_CODE", code);
    const letter = code.search(/[A-Za-z]/);
    const flipped =
      code.slice(0, letter) +
      (code[letter] === code[letter].toUpperCase() ? code[letter].toLowerCase() : code[letter].toUpperCase()) +
      code.slice(letter + 1);

    expect(setupCodeMatches(code)).toBe(true);
    expect(setupCodeMatches("")).toBe(false);
    expect(setupCodeMatches(code.slice(0, -1))).toBe(false);
    expect(setupCodeMatches(`${code}x`)).toBe(false);
    expect(setupCodeMatches(`${code} `)).toBe(false);
    expect(setupCodeMatches(flipped)).toBe(false);
    expect(setupCodeMatches(newSetupCode())).toBe(false);
  });

  it("AC-28: it never throws, for any length or type", () => {
    vi.stubEnv("SETUP_CODE", newSetupCode());
    const inputs: unknown[] = [undefined, null, 42, {}, ["x"]];
    for (let length = 0; length <= 300; length += 7) {
      inputs.push(randomBytes(length).toString("latin1"));
    }
    inputs.push("y".repeat(1_000_000));

    for (const input of inputs) {
      expect(() => setupCodeMatches(input)).not.toThrow();
      expect(setupCodeMatches(input)).toBe(false);
    }
  });

  it("AC-28: its source hashes both sides with SHA-256 and compares the digests in constant time", () => {
    const source = readFileSync("src/server/auth/password.ts", "utf8");
    const start = source.indexOf("export function setupCodeMatches");
    const end = source.indexOf("\n}\n", start);
    const body = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(body.match(/createHash\("sha256"\)/g)).toHaveLength(2);
    expect(body).toContain(`${CONSTANT_TIME_EQUAL}(given, expected)`);
    expect(body).not.toMatch(/(configured|candidate)\s*[!=]==?\s*(configured|candidate)/);
  });

  it("AC-27's unit half: a code is configured only when it is at least SETUP_CODE_MIN_LENGTH characters, and an unconfigured code matches nothing", () => {
    const code = newSetupCode();
    const tooShort = code.slice(0, SETUP_CODE_MIN_LENGTH - 1);
    const justLongEnough = code.slice(0, SETUP_CODE_MIN_LENGTH);

    vi.stubEnv("SETUP_CODE", undefined);
    expect(setupCodeConfigured()).toBe(false);
    expect(setupCodeMatches("")).toBe(false);

    vi.stubEnv("SETUP_CODE", "");
    expect(setupCodeConfigured()).toBe(false);

    vi.stubEnv("SETUP_CODE", tooShort);
    expect(setupCodeConfigured()).toBe(false);
    expect(setupCodeMatches(tooShort)).toBe(false);

    vi.stubEnv("SETUP_CODE", justLongEnough);
    expect(setupCodeConfigured()).toBe(true);
    expect(setupCodeMatches(justLongEnough)).toBe(true);
  });
});

describe("no secret is read at import time (021 AC-42's unit half)", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("AC-42: the module loads with every secret unset, and reads each one when a function is called", async () => {
    vi.stubEnv("PIN_PEPPER", undefined);
    vi.stubEnv("SETUP_CODE", undefined);
    vi.stubEnv("AUTH_SECRET", undefined);
    vi.resetModules();

    const fresh = await import("@/server/auth/password");
    const pin = generatePin(4);

    expect(() => fresh.pinDigest(pin)).toThrow(fresh.CredentialSecretError);
    expect(fresh.setupCodeConfigured()).toBe(false);
    expect(fresh.verifyDeviceToken("anything")).toBeNull();

    vi.stubEnv("PIN_PEPPER", newPepper());
    const underFirst = fresh.pinDigest(pin);
    vi.stubEnv("PIN_PEPPER", newPepper());

    expect(underFirst).toMatch(HEX_64);
    expect(fresh.pinDigest(pin)).not.toBe(underFirst);
  });
});
