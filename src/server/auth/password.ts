import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import bcrypt from "bcryptjs";

import { DEVICE_TOKEN_MAX_AGE_DAYS } from "@/server/auth/attempt-budget";
import { SETUP_CODE_MIN_LENGTH } from "@/server/auth/credential-rules";

/**
 * The ONLY file in this repository allowed to import the password-hashing library, and the
 * one CREDENTIAL-CRYPTO module (spec 003 AC-5, 021 S3, S4, S5, S7, S9, AC-6; enforced by
 * tests/unit/hashing-boundary.test.ts). The PIN digest and hash, the pepper's fingerprint,
 * the lock key, the device token and the setup-code comparison all live here, so a second,
 * weaker hasher cannot appear in a later feature.
 *
 * It is the only reader of the three secrets `PIN_PEPPER`, `SETUP_CODE` and `AUTH_SECRET`.
 * Each is read when a function is called, never at import (AC-42), and none of them, nor
 * anything derived from them, is logged.
 *
 * Cost 10 is the floor the spec sets. bcrypt salts every hash, so the same PIN hashed twice
 * yields two different strings — comparison is `verifyPin`, never string equality.
 */
const BCRYPT_COST = 10;

// ---------------------------------------------------------------------------------------
// The secrets
// ---------------------------------------------------------------------------------------

export type CredentialSecret = "PIN_PEPPER" | "AUTH_SECRET";

/**
 * A secret this module needs is missing or unusable. The message names the variable and
 * never any part of its value. Callers fail closed on it: sign-in answers `UNAVAILABLE`,
 * and `/setup` stays unavailable (AC-32).
 */
export class CredentialSecretError extends Error {
  readonly variable: CredentialSecret;

  constructor(variable: CredentialSecret, problem: string) {
    super(`${variable} ${problem}`);
    this.name = "CredentialSecretError";
    this.variable = variable;
  }
}

/** S3: 32 or more random bytes. */
const PIN_PEPPER_MIN_BYTES = 32;

// Standard or URL-safe base64, padding only at the end. Node's decoder skips characters
// outside the alphabet instead of refusing them, so the shape is checked first: a value
// that is not base64 is a mistyped pepper, not a shorter one.
const BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;

/** The pepper's bytes, or `null` when `value` is not base64 of at least 32 bytes. */
function decodedPinPepper(value: string): Buffer | null {
  const trimmed = value.trim();
  const bytes = BASE64.test(trimmed) ? Buffer.from(trimmed, "base64") : Buffer.alloc(0);
  return bytes.length >= PIN_PEPPER_MIN_BYTES ? bytes : null;
}

/**
 * Whether `value` is a pepper this module accepts: the rule `pinPepper` applies, as a yes or
 * no that reads no environment. The `.env` check in `tests/unit/env-file.test.ts` asks it,
 * so the file is judged by this module's rule, not by a copy of it.
 */
export function isUsablePinPepper(value: string): boolean {
  return decodedPinPepper(value) !== null;
}

function pinPepper(): Buffer {
  const value = (process.env.PIN_PEPPER ?? "").trim();
  if (value === "") {
    throw new CredentialSecretError("PIN_PEPPER", "is not set");
  }

  const bytes = decodedPinPepper(value);
  if (bytes === null) {
    throw new CredentialSecretError(
      "PIN_PEPPER",
      `is not usable: it must be base64 that decodes to at least ${PIN_PEPPER_MIN_BYTES} bytes`,
    );
  }
  return bytes;
}

// Each use of a key gets its own label, so no value computed for one purpose can ever be
// presented as another (S3, S5, S7).
const PIN_DIGEST_LABEL = "macroads:pin:v1:";
const PIN_KEY_ID_LABEL = "macroads:pin-key-id:v1";
const ACCOUNT_KEY_LABEL = "macroads:account:v1:";
const DEVICE_TOKEN_KEY_LABEL = "macroads:device-token:v1";

function hmacSha256Hex(key: Buffer, message: string): string {
  return createHmac("sha256", key).update(message, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------------------
// PINs — S3, S4
// ---------------------------------------------------------------------------------------

/** 16 hex characters: which pepper a PIN was stored under. */
const PIN_KEY_ID_LENGTH = 16;

/**
 * The keyed digest bcrypt is run over: 64 lowercase hex characters. bcrypt reads at most
 * 72 bytes and some implementations stop at a zero byte; hex is under the limit and has
 * none, so every bit of the digest counts.
 */
export function pinDigest(pin: string): string {
  return hmacSha256Hex(pinPepper(), PIN_DIGEST_LABEL + pin);
}

/**
 * The fingerprint of the current pepper. An HMAC of a constant, so it reveals nothing
 * about the pepper; a stored PIN whose `pinKeyId` differs was made under another one.
 */
export function currentPinKeyId(): string {
  return hmacSha256Hex(pinPepper(), PIN_KEY_ID_LABEL).slice(0, PIN_KEY_ID_LENGTH);
}

export type PinCredential = { pinHash: string; pinKeyId: string };

/**
 * bcrypt over the keyed digest. bcrypt's own random salt is the per-profile salt, so two
 * equal PINs never produce equal stored values, and no stored value can be tested
 * without the pepper.
 */
export async function hashPin(pin: string): Promise<PinCredential> {
  const digest = pinDigest(pin);
  const pinKeyId = currentPinKeyId();

  return { pinHash: await bcrypt.hash(digest, BCRYPT_COST), pinKeyId };
}

// Made once per process, on first use, from random bytes nobody knows (S3, AC-10).
let unusablePinHash: Promise<string> | undefined;

function unusableHash(): Promise<string> {
  unusablePinHash ??= bcrypt.hash(randomBytes(32).toString("hex"), BCRYPT_COST);
  return unusablePinHash;
}

// A bcrypt hash as `hashPin` stores it. bcrypt answers anything else at once, without the
// work a real comparison costs, so anything else is compared against the unusable hash.
const BCRYPT_HASH = /^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Whether `pin` is the PIN `pinHash` was made from, under the current pepper.
 *
 * With `pinHash` `null` — an unknown username, a profile that cannot sign in, a PIN stored
 * under another pepper — it still performs exactly one bcrypt comparison, against a hash of
 * random bytes, and answers `false`. So the work, and the time it takes, does not say
 * whether a usable stored hash existed.
 */
export async function verifyPin(pin: string, pinHash: string | null): Promise<boolean> {
  const digest = pinDigest(pin);

  if (pinHash === null || !BCRYPT_HASH.test(pinHash)) {
    await bcrypt.compare(digest, await unusableHash());
    return false;
  }
  return bcrypt.compare(digest, pinHash);
}

// ---------------------------------------------------------------------------------------
// The lock key — S5
// ---------------------------------------------------------------------------------------

/**
 * 64 lowercase hex characters naming one username's lock, whether or not a profile holds
 * that username. Keyed by the pepper, so the lock table and the event log hold nothing a
 * reader could turn back into what was typed.
 */
export function accountKey(username: string): string {
  return hmacSha256Hex(pinPepper(), ACCOUNT_KEY_LABEL + username.toLowerCase());
}

// ---------------------------------------------------------------------------------------
// The device token — S7, S8
// ---------------------------------------------------------------------------------------

const DEVICE_ID_BYTES = 16;
const DEVICE_ID = /^[0-9a-f]{32}$/;
const SECONDS_PER_DAY = 86_400;

// `v1.<device id>.<expiry, Unix seconds>.<MAC, hex>`. The expiry has no leading zero, so
// every token has exactly one spelling, and the MAC is compared as text: every character of
// a token is significant, and changing any one of them makes it invalid.
const DEVICE_TOKEN = /^v1\.([0-9a-f]{32})\.([1-9][0-9]{0,14})\.([0-9a-f]{64})$/;

/**
 * The token's key: derived from `AUTH_SECRET` under its own label, never the pepper. A
 * pepper leak then threatens nothing but PINs, and a replaced pepper leaves every known
 * device known (S7). `null` when `AUTH_SECRET` is not set.
 */
function deviceTokenKey(): Buffer | null {
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.trim() === "") return null;

  return createHmac("sha256", secret).update(DEVICE_TOKEN_KEY_LABEL, "utf8").digest();
}

/**
 * A `macroads-device` token valid for `DEVICE_TOKEN_MAX_AGE_DAYS` from `now`. Given the id
 * of the device that already holds a valid token, it keeps that id and renews the expiry;
 * given `null`, it mints a new random id.
 */
export function signDeviceToken(deviceId: string | null, now: Date = new Date()): string {
  const key = deviceTokenKey();
  if (key === null) {
    throw new CredentialSecretError("AUTH_SECRET", "is not set");
  }

  const id =
    deviceId !== null && DEVICE_ID.test(deviceId)
      ? deviceId
      : randomBytes(DEVICE_ID_BYTES).toString("hex");
  const expiresAt =
    Math.floor(now.getTime() / 1000) + DEVICE_TOKEN_MAX_AGE_DAYS * SECONDS_PER_DAY;
  const payload = `v1.${id}.${expiresAt}`;

  return `${payload}.${hmacSha256Hex(key, payload)}`;
}

/**
 * The device id a token names, or `null` for anything that is not a token this server
 * signed and that has not expired. It never throws: a bad cookie is a new device, not an
 * error.
 */
export function verifyDeviceToken(token: unknown, now: Date = new Date()): string | null {
  try {
    if (typeof token !== "string") return null;

    const match = DEVICE_TOKEN.exec(token);
    if (match === null) return null;
    const [, id, expiresAt, mac] = match;
    if (id === undefined || expiresAt === undefined || mac === undefined) return null;

    const key = deviceTokenKey();
    if (key === null) return null;

    const expected = hmacSha256Hex(key, `v1.${id}.${expiresAt}`);
    if (!timingSafeEqual(Buffer.from(mac, "utf8"), Buffer.from(expected, "utf8"))) return null;

    return now.getTime() < Number(expiresAt) * 1000 ? id : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------
// The setup code — S9
// ---------------------------------------------------------------------------------------

function configuredSetupCode(): string | null {
  const code = (process.env.SETUP_CODE ?? "").trim();
  return Array.from(code).length >= SETUP_CODE_MIN_LENGTH ? code : null;
}

/** `SETUP_CODE` is set, to at least `SETUP_CODE_MIN_LENGTH` characters. */
export function setupCodeConfigured(): boolean {
  return configuredSetupCode() !== null;
}

/**
 * Whether `candidate` is exactly the configured setup code. Both sides are hashed with
 * SHA-256 and the two digests compared in constant time, so neither the code's content nor
 * its length leaks through timing. `false`, never a throw, for any input — including when
 * no usable code is configured.
 */
export function setupCodeMatches(candidate: unknown): boolean {
  const configured = configuredSetupCode();
  if (configured === null || typeof candidate !== "string") return false;

  const expected = createHash("sha256").update(configured, "utf8").digest();
  const given = createHash("sha256").update(candidate, "utf8").digest();
  return timingSafeEqual(given, expected);
}
