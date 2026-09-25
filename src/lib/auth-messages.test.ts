import { randomBytes, randomInt } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as messages from "@/lib/auth-messages";

/**
 * 021 AC-39's module half, with no database. The scan of tests for message literals is in
 * tests/unit/pin-auth-contract.test.ts.
 */

const STRING_EXPORTS = [
  "INCORRECT_SIGN_IN_MESSAGE",
  "ACCOUNT_LOCKED_MESSAGE",
  "SIGN_IN_PAUSED_MESSAGE",
  "SIGN_IN_UNAVAILABLE_MESSAGE",
  "SESSION_ENDED_MESSAGE",
  "PIN_FORMAT_MESSAGE",
  "PIN_TOO_SIMPLE_MESSAGE",
  "PIN_MISMATCH_MESSAGE",
  "USERNAME_FORMAT_MESSAGE",
  "NAME_REQUIRED_MESSAGE",
  "NAME_TOO_LONG_MESSAGE",
  "NAME_CHARACTERS_MESSAGE",
  "PROFILE_REQUEST_SENT",
  "PROFILE_REQUESTS_PAUSED",
  "SETUP_CODE_INCORRECT_MESSAGE",
  "SETUP_PAUSED_MESSAGE",
  "SETUP_COMPLETE_MESSAGE",
  "LAST_ADMIN_MESSAGE",
  "ONLY_ACTIVE_PIN_RESET",
  "RESET_PIN_SHOWN_ONCE",
  "NO_PENDING_PROFILES",
  "NEW_DEVICES_PAUSED_MESSAGE",
  "RESUME_NEW_DEVICES_LABEL",
  "ACCOUNT_LOCKED_LABEL",
  "CLEAR_LOCK_LABEL",
  "CREDENTIAL_NEEDS_RESET_LABEL",
  "ACCESS_DENIED_MESSAGE",
] as const;

const exported = messages as Record<string, unknown>;

describe("the auth messages module (021 AC-39)", () => {
  it("AC-39: it imports nothing", () => {
    const source = readFileSync("src/lib/auth-messages.ts", "utf8");

    expect(source).not.toMatch(/^\s*import\b/m);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/^\s*export\s[^\n]*\bfrom\s*["']/m);
  });

  it("AC-39: it exports every message and label as a non-empty string, and no two are the same", () => {
    for (const name of STRING_EXPORTS) {
      expect(typeof exported[name], name).toBe("string");
      expect((exported[name] as string).trim(), name).not.toBe("");
    }

    const texts = STRING_EXPORTS.map((name) => exported[name]);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it("AC-39: it no longer exports the two messages of the email sign-in", () => {
    expect(Object.keys(exported)).not.toContain("INVALID_CREDENTIALS_MESSAGE");
    expect(Object.keys(exported)).not.toContain("INACTIVE_ACCOUNT_MESSAGE");
  });

  it("AC-39: it exports the three length constants the rules import", () => {
    expect(messages.USERNAME_MIN_LENGTH).toBe(3);
    expect(messages.USERNAME_MAX_LENGTH).toBe(32);
    expect(messages.MAX_NAME_LENGTH).toBe(80);
  });

  it("AC-39: USERNAME_TAKEN_MESSAGE names the username", () => {
    const username = `u${randomBytes(6).toString("hex")}`;

    expect(messages.USERNAME_TAKEN_MESSAGE(username)).toContain(username);
  });

  it("AC-39: PIN_FAILURES_SUMMARY contains its three numbers", () => {
    const [a, b, c] = [randomInt(100, 400), randomInt(400, 700), randomInt(700, 1000)];

    const summary = messages.PIN_FAILURES_SUMMARY(a, b, c);

    for (const count of [a, b, c]) {
      expect(summary).toMatch(new RegExp(`(^|\\D)${count}(\\D|$)`));
    }
  });

  it("AC-39: the length messages state the lengths they enforce", () => {
    expect(messages.NAME_TOO_LONG_MESSAGE).toContain(String(messages.MAX_NAME_LENGTH));
    expect(messages.USERNAME_FORMAT_MESSAGE).toContain(String(messages.USERNAME_MIN_LENGTH));
    expect(messages.USERNAME_FORMAT_MESSAGE).toContain(String(messages.USERNAME_MAX_LENGTH));
  });

  it("AC-39: PROFILE_STATUS_LABELS has one distinct label for each of the four statuses", () => {
    const labels = messages.PROFILE_STATUS_LABELS;

    expect(Object.keys(labels).sort()).toEqual(["ACTIVE", "DEACTIVATED", "PENDING", "REJECTED"]);
    expect(new Set(Object.values(labels)).size).toBe(4);
    for (const label of Object.values(labels)) {
      expect(label.trim()).not.toBe("");
    }
  });
});
