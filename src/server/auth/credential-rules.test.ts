import { randomInt } from "node:crypto";
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

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
import {
  PIN_LENGTHS,
  type PinLength,
  SETUP_CODE_MIN_LENGTH,
  generatePin,
  isTrivialPin,
  parsePin,
  parseProfileName,
  parseUsername,
} from "@/server/auth/credential-rules";
import { ValidationError } from "@/server/errors";

// `generatePin` must draw from `crypto.randomInt` (AC-7). The real function still does the
// drawing; the wrapper only records that it was asked.
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

/**
 * 021 AC-7, with no database. No PIN value is written in this file (AC-8): every PIN is
 * built at runtime — trivial ones from the rule's own definition, the rest by drawing
 * digits — and every username and name is built the same way.
 */

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const USERNAME_TAIL = `${LETTERS}0123456789._-`;

function draw(alphabet: string, length: number): string {
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
}

function randomDigits(length: number): string {
  return Array.from({ length }, () => String(randomInt(10))).join("");
}

/** Every trivial PIN of `length`, constructed from the rule — never listed. */
function trivialPinsOfLength(length: number): string[] {
  const pins = new Set<string>();
  for (let digit = 0; digit <= 9; digit += 1) {
    pins.add(String(digit).repeat(length));
  }
  for (let start = 0; start + length - 1 <= 9; start += 1) {
    pins.add(Array.from({ length }, (_, i) => String(start + i)).join(""));
    pins.add(Array.from({ length }, (_, i) => String(9 - start - i)).join(""));
  }
  return [...pins];
}

const TRIVIAL = new Set(PIN_LENGTHS.flatMap((length) => trivialPinsOfLength(length)));

/** A PIN of `length` drawn at random from the non-trivial ones, independently of the module. */
function randomNonTrivialPin(length: number): string {
  for (;;) {
    const pin = randomDigits(length);
    if (!TRIVIAL.has(pin)) return pin;
  }
}

/** The `ValidationError` `run` throws. Anything else — or nothing — fails the test. */
function refusal(run: () => unknown): ValidationError {
  try {
    run();
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error("expected a ValidationError, but nothing was thrown");
}

function fullWidth(digits: string): string {
  return Array.from(digits, (digit) => String.fromCharCode(0xff10 + Number(digit))).join("");
}

function arabicIndic(digits: string): string {
  return Array.from(digits, (digit) => String.fromCharCode(0x0660 + Number(digit))).join("");
}

describe("PIN rules", () => {
  it("AC-7: a PIN is 4 or 6 digits, and the message says so", () => {
    expect([...PIN_LENGTHS]).toEqual([4, 6]);

    for (const length of PIN_LENGTHS) {
      expect(PIN_FORMAT_MESSAGE).toContain(String(length));
    }
  });

  it("AC-7: parsePin accepts exactly 4 or exactly 6 ASCII digits", () => {
    for (const length of PIN_LENGTHS) {
      const pin = randomNonTrivialPin(length);

      expect(parsePin(pin)).toBe(pin);
    }
  });

  it("AC-7: parsePin refuses every other shape with PIN_FORMAT_MESSAGE", () => {
    const four = randomNonTrivialPin(4);
    const six = randomNonTrivialPin(6);
    const malformed = [
      randomDigits(3),
      randomDigits(5),
      randomDigits(7),
      "",
      ` ${four}`,
      `${four} `,
      ` ${six}`,
      `${six} `,
      `${four}\n`,
      `${four.slice(0, 3)}${draw(LETTERS, 1)}`,
      `${draw(LETTERS.toUpperCase(), 1)}${six.slice(1)}`,
      `+${randomDigits(3)}`,
      `-${randomDigits(3)}`,
      `+${randomDigits(5)}`,
      `${randomDigits(2)}.${randomDigits(1)}`,
      `${randomDigits(3)}.${randomDigits(2)}`,
      fullWidth(four),
      fullWidth(six),
      arabicIndic(four),
    ];

    for (const input of malformed) {
      expect(refusal(() => parsePin(input)).message, JSON.stringify(input)).toBe(PIN_FORMAT_MESSAGE);
      expect(refusal(() => parsePin(input)).field).toBe("pin");
    }

    for (const input of [undefined, null, Number(four), [four], { pin: four }]) {
      expect(refusal(() => parsePin(input)).message).toBe(PIN_FORMAT_MESSAGE);
    }
  });

  it("AC-7: the rule yields 24 trivial PINs of four digits and 20 of six, and parsePin refuses each as too simple", () => {
    const four = trivialPinsOfLength(4);
    const six = trivialPinsOfLength(6);

    expect(four).toHaveLength(24);
    expect(six).toHaveLength(20);

    for (const pin of [...four, ...six]) {
      expect(isTrivialPin(pin), pin).toBe(true);
      expect(refusal(() => parsePin(pin)).message, pin).toBe(PIN_TOO_SIMPLE_MESSAGE);
    }
  });

  it("AC-7: isTrivialPin is false for 1,000 PINs drawn at random from the rest, and parsePin accepts them", () => {
    for (let i = 0; i < 1000; i += 1) {
      const pin = randomNonTrivialPin(PIN_LENGTHS[i % PIN_LENGTHS.length]);

      expect(isTrivialPin(pin), pin).toBe(false);
      expect(parsePin(pin)).toBe(pin);
    }
  });

  it("AC-7: a run does not wrap around from 9 to 0, or from 0 to 9", () => {
    // Built from the rule: the digits count up (or down) by one modulo ten, starting where
    // the count has to cross the 9/0 boundary.
    for (const length of PIN_LENGTHS) {
      const up = Array.from({ length }, (_, i) => String((9 - 1 + i) % 10)).join("");
      const down = Array.from({ length }, (_, i) => String((1 - i + 10) % 10)).join("");

      expect(isTrivialPin(up), up).toBe(false);
      expect(isTrivialPin(down), down).toBe(false);
    }
  });
});

describe("generatePin", () => {
  beforeEach(() => {
    vi.mocked(randomInt).mockClear();
  });

  it("AC-7: over 2,000 draws of each length, every PIN is accepted, none is trivial, and every position takes all ten digits", () => {
    for (const length of PIN_LENGTHS) {
      const seen = Array.from({ length }, () => new Set<string>());

      for (let i = 0; i < 2000; i += 1) {
        const pin = generatePin(length);

        expect(pin).toHaveLength(length);
        expect(parsePin(pin)).toBe(pin);
        expect(TRIVIAL.has(pin), pin).toBe(false);
        Array.from(pin).forEach((digit, position) => seen[position].add(digit));
      }

      for (const digits of seen) {
        expect(digits.size).toBe(10);
      }
    }
  });

  it("AC-7: it draws its digits with crypto.randomInt, and nothing else", () => {
    const pin = generatePin(6);

    expect(pin).toHaveLength(6);
    expect(vi.mocked(randomInt).mock.calls.length).toBeGreaterThanOrEqual(6);
    for (const call of vi.mocked(randomInt).mock.calls) {
      expect(call).toEqual([10]);
    }

    const source = readFileSync("src/server/auth/credential-rules.ts", "utf8");
    expect(source).toMatch(/import \{ randomInt \} from "node:crypto";/);
    expect(source).not.toMatch(/Math\.random/);
  });

  it("AC-7: it refuses a length that is not a PIN length", () => {
    for (const length of [0, 3, 5, 7]) {
      expect(refusal(() => generatePin(length as PinLength)).message).toBe(PIN_FORMAT_MESSAGE);
    }
  });
});

describe("usernames", () => {
  function username(length: number): string {
    return draw(LETTERS, 1) + draw(USERNAME_TAIL, length - 1);
  }

  it("AC-7: the length bounds come from the messages module, and the message names them", () => {
    expect(USERNAME_MIN_LENGTH).toBe(3);
    expect(USERNAME_MAX_LENGTH).toBe(32);
    expect(USERNAME_FORMAT_MESSAGE).toContain(String(USERNAME_MIN_LENGTH));
    expect(USERNAME_FORMAT_MESSAGE).toContain(String(USERNAME_MAX_LENGTH));
  });

  it("AC-7: parseUsername accepts 3 to 32 characters, a letter first, then a-z, 0-9, '.', '_' or '-'", () => {
    for (const length of [USERNAME_MIN_LENGTH, 4, 17, USERNAME_MAX_LENGTH - 1, USERNAME_MAX_LENGTH]) {
      const name = username(length);

      expect(parseUsername(name)).toBe(name);
    }

    const everyKind = `${draw(LETTERS, 2)}.${randomDigits(2)}_${draw(LETTERS, 1)}-${draw(LETTERS, 1)}`;
    expect(parseUsername(everyKind)).toBe(everyKind);
  });

  it("AC-7: parseUsername refuses every other shape with USERNAME_FORMAT_MESSAGE", () => {
    const refused = [
      username(USERNAME_MIN_LENGTH - 1),
      username(USERNAME_MAX_LENGTH + 1),
      `${randomDigits(1)}${username(5)}`,
      randomDigits(6),
      `.${username(5)}`,
      `_${username(5)}`,
      `-${username(5)}`,
      `${username(3)} ${username(3)}`,
      `${username(3)}@${username(3)}`,
      `${username(3)}é`,
      `é${username(3)}`,
      // The Kelvin sign lower-cases to an ASCII k: refused as typed, never folded into one.
      `K${username(3)}`,
      `${username(3)}ı`,
      `${username(3)}+${username(3)}`,
      `${username(3)}/${username(3)}`,
      "",
      "   ",
    ];

    for (const input of refused) {
      const error = refusal(() => parseUsername(input));

      expect(error.message, JSON.stringify(input)).toBe(USERNAME_FORMAT_MESSAGE);
      expect(error.field).toBe("username");
    }

    for (const input of [undefined, null, 42, [username(5)]]) {
      expect(refusal(() => parseUsername(input)).message).toBe(USERNAME_FORMAT_MESSAGE);
    }
  });

  it("AC-7: two inputs that differ only in letter case and surrounding spaces are one username, stored lower-case", () => {
    const lower = username(12);
    const shouted = `  ${lower.toUpperCase()} \t`;

    expect(parseUsername(shouted)).toBe(lower);
    expect(parseUsername(lower)).toBe(lower);
    expect(parseUsername(shouted)).toMatch(/^[a-z][a-z0-9._-]{2,31}$/);
  });
});

describe("display names", () => {
  it("AC-7: parseProfileName trims, and accepts 1 to MAX_NAME_LENGTH characters", () => {
    expect(MAX_NAME_LENGTH).toBe(80);
    expect(NAME_TOO_LONG_MESSAGE).toContain(String(MAX_NAME_LENGTH));

    const short = draw(LETTERS, 1);
    const longest = draw(LETTERS, MAX_NAME_LENGTH);
    const spoken = `Seán O'Brien-Doyle ${draw(LETTERS, 4)}`;

    expect(parseProfileName(`  ${short}  `)).toBe(short);
    expect(parseProfileName(longest)).toBe(longest);
    expect(parseProfileName(` ${spoken}\n`)).toBe(spoken);
  });

  it("AC-7: a blank name is refused with NAME_REQUIRED_MESSAGE", () => {
    for (const input of ["", "   ", " \t\n ", undefined, null, 7]) {
      const error = refusal(() => parseProfileName(input));

      expect(error.message).toBe(NAME_REQUIRED_MESSAGE);
      expect(error.field).toBe("name");
    }
  });

  it("AC-7: 81 characters are refused with NAME_TOO_LONG_MESSAGE", () => {
    const tooLong = draw(LETTERS, MAX_NAME_LENGTH + 1);

    expect(refusal(() => parseProfileName(tooLong)).message).toBe(NAME_TOO_LONG_MESSAGE);
  });

  it("AC-7: a character outside the Basic Multilingual Plane counts once", () => {
    const astral = String.fromCodePoint(0x1f477);

    expect(parseProfileName(astral.repeat(MAX_NAME_LENGTH))).toBe(astral.repeat(MAX_NAME_LENGTH));
    expect(refusal(() => parseProfileName(astral.repeat(MAX_NAME_LENGTH + 1))).message).toBe(
      NAME_TOO_LONG_MESSAGE,
    );
  });

  it("AC-7: a line break, a carriage return, a tab, < or > inside a name is refused with NAME_CHARACTERS_MESSAGE", () => {
    for (const character of ["\n", "\r", "\t", "<", ">"]) {
      const name = `${draw(LETTERS, 3)}${character}${draw(LETTERS, 3)}`;

      expect(refusal(() => parseProfileName(name)).message, JSON.stringify(name)).toBe(
        NAME_CHARACTERS_MESSAGE,
      );
    }
  });

  it("AC-7 (hardening, see the Phase A report): any other control character and the Unicode line separators are refused too", () => {
    for (const codePoint of [0x00, 0x0b, 0x0c, 0x1b, 0x1f, 0x7f, 0x85, 0x2028, 0x2029]) {
      const name = `${draw(LETTERS, 3)}${String.fromCodePoint(codePoint)}${draw(LETTERS, 3)}`;

      expect(refusal(() => parseProfileName(name)).message, codePoint.toString(16)).toBe(
        NAME_CHARACTERS_MESSAGE,
      );
    }
  });
});

describe("setup code", () => {
  it("AC-7: SETUP_CODE_MIN_LENGTH is 16", () => {
    expect(SETUP_CODE_MIN_LENGTH).toBe(16);
  });
});
