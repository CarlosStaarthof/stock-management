import { randomInt } from "node:crypto";

import {
  MAX_NAME_LENGTH,
  NAME_CHARACTERS_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  NAME_TOO_LONG_MESSAGE,
  PIN_FORMAT_MESSAGE,
  PIN_TOO_SIMPLE_MESSAGE,
  USERNAME_FORMAT_MESSAGE,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from "@/lib/auth-messages";
import { ValidationError } from "@/server/errors";

/**
 * The shape of every credential a person types: PIN, username, display name (021 S1, D6,
 * AC-7). Pure apart from `generatePin`'s randomness — no database, no clock, no
 * environment — so the browser-facing forms, the services and the reset script all refuse
 * exactly the same input.
 *
 * The trivial-PIN rule is a RULE, not a list. A list of refused values would be a list of
 * PINs written down in the repository, which AC-8 forbids.
 */

/** D6: every role, 4 or 6 digits. */
export const PIN_LENGTHS = [4, 6] as const;

export type PinLength = (typeof PIN_LENGTHS)[number];

/** S9: a setup code shorter than this leaves `/setup` unavailable. */
export const SETUP_CODE_MIN_LENGTH = 16;

const ASCII_DIGITS = /^[0-9]+$/;

// S1. Tested against the input BEFORE it is lower-cased: `toLowerCase` maps a few
// non-ASCII letters onto ASCII ones, and a username must be ASCII as typed.
const USERNAME_SHAPE = new RegExp(
  `^[A-Za-z][A-Za-z0-9._-]{${USERNAME_MIN_LENGTH - 1},${USERNAME_MAX_LENGTH - 1}}$`,
);

// AC-7 names a line break, a carriage return, a tab, < and >. This also refuses every
// other C0 control character, DEL, NEL and the Unicode line and paragraph separators:
// they are line breaks by another name, or (U+0000) a character Postgres refuses in a
// text column — either would reach #9's audit lines or the database from a public form.
function isForbiddenNameCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    codePoint <= 0x1f ||
    codePoint === 0x7f ||
    codePoint === 0x85 ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    character === "<" ||
    character === ">"
  );
}

function isPinLength(length: number): length is PinLength {
  return (PIN_LENGTHS as readonly number[]).includes(length);
}

/**
 * One digit repeated, or every digit exactly one above — or exactly one below — the digit
 * before it. No wrap-around: after 9 comes nothing, not 0.
 */
export function isTrivialPin(pin: string): boolean {
  if (pin.length < 2 || !ASCII_DIGITS.test(pin)) return false;

  const step = pin.charCodeAt(1) - pin.charCodeAt(0);
  if (step !== 0 && step !== 1 && step !== -1) return false;

  for (let i = 2; i < pin.length; i += 1) {
    if (pin.charCodeAt(i) - pin.charCodeAt(i - 1) !== step) return false;
  }
  return true;
}

/**
 * Exactly 4 or exactly 6 ASCII digits, and not trivial. Nothing is trimmed: a PIN with a
 * space in it is not a PIN, and the pad never produces one.
 */
export function parsePin(input: unknown): string {
  if (typeof input !== "string" || !isPinLength(input.length) || !ASCII_DIGITS.test(input)) {
    throw new ValidationError("pin", PIN_FORMAT_MESSAGE);
  }
  if (isTrivialPin(input)) {
    throw new ValidationError("pin", PIN_TOO_SIMPLE_MESSAGE);
  }
  return input;
}

/**
 * A uniformly random non-trivial PIN of that length, from `crypto.randomInt`. A trivial
 * draw is thrown away and drawn again, which keeps the result uniform over the PINs
 * `parsePin` accepts.
 */
export function generatePin(length: PinLength): string {
  if (!isPinLength(length)) {
    throw new ValidationError("length", PIN_FORMAT_MESSAGE);
  }

  for (;;) {
    let pin = "";
    for (let i = 0; i < length; i += 1) {
      pin += String(randomInt(10));
    }
    if (!isTrivialPin(pin)) return pin;
  }
}

/** S1: trimmed, lower-cased, 3 to 32 ASCII characters, a letter first. */
export function parseUsername(input: unknown): string {
  const trimmed = typeof input === "string" ? input.trim() : "";
  if (!USERNAME_SHAPE.test(trimmed)) {
    throw new ValidationError("username", USERNAME_FORMAT_MESSAGE);
  }
  return trimmed.toLowerCase();
}

/**
 * A display name: trimmed, 1 to 80 characters, and nothing that could forge a second
 * audit line or be read as markup. Characters are counted as code points, so a character
 * outside the Basic Multilingual Plane counts once, not twice.
 */
export function parseProfileName(input: unknown): string {
  const name = typeof input === "string" ? input.trim() : "";
  if (name === "") {
    throw new ValidationError("name", NAME_REQUIRED_MESSAGE);
  }

  const characters = Array.from(name);
  if (characters.length > MAX_NAME_LENGTH) {
    throw new ValidationError("name", NAME_TOO_LONG_MESSAGE);
  }
  if (characters.some(isForbiddenNameCharacter)) {
    throw new ValidationError("name", NAME_CHARACTERS_MESSAGE);
  }
  return name;
}
