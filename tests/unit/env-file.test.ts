import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SETUP_CODE_MIN_LENGTH, generatePin } from "@/server/auth/credential-rules";

import {
  ALL_ENV_FILE_LABELS,
  ENV_FILE_LABELS,
  ENV_FILE_SETTINGS,
  envFileProblems,
} from "../support/env-file";

/**
 * `.env` is the only settings file (021 → Post-approval amendments → *`.env` is the only
 * settings file*). This checks that it holds what 002 AC-7, 003 AC-30 and 021 AC-8 and
 * AC-41 require of it, and never prints a value.
 *
 * The real `.env` is read through the file system and judged by `envFileProblems`, which
 * answers with fixed labels. Every other text here is synthetic: built at runtime from random
 * bytes, with hosts under `.invalid` (RFC 2606) and connection strings assembled from halves,
 * so this file holds no value and no connection string. Each synthetic breach changes exactly
 * one fact and must get exactly that fact's label back, which is what proves the check can
 * fail.
 */

const MISSING_ENV =
  ".env does not exist: create it as docs/operations.md → Environment describes";

// Built in two pieces, so no line of this file holds the shape the credential scan forbids.
const SCHEME = "postgresql" + "://";

function token(bytes = 4): string {
  return randomBytes(bytes).toString("hex");
}

/** A connection string with random user info, to `host`, assembled from halves. */
function connectionString(host: string): string {
  const userInfo = `${SCHEME}${token()}:${token(12)}`;
  return [userInfo, `${host}/neondb?sslmode=require`].join("@");
}

/** A synthetic `.env`'s settings, all eight valid, and the hosts they were built on. */
function validSettings(): { settings: Map<string, string>; directHost: string; region: string } {
  const region = `${token(2)}.aws.neon.invalid`;
  const development = `ep-${token()}-a`;
  const test = `ep-${token()}-b`;
  const directHost = `${development}.${region}`;

  const settings = new Map<string, string>([
    ["DATABASE_URL", connectionString(`${development}-pooler.${region}`)],
    ["DIRECT_URL", connectionString(directHost)],
    ["AUTH_SECRET", randomBytes(32).toString("base64")],
    ["AUTH_URL", `http://${token()}.invalid:3000`],
    ["TEST_DATABASE_URL", connectionString(`${test}-pooler.${region}`)],
    ["TEST_DIRECT_URL", connectionString(`${test}.${region}`)],
    ["PIN_PEPPER", randomBytes(32).toString("base64")],
    ["SETUP_CODE", randomBytes(24).toString("base64url")],
  ]);
  return { settings, directHost, region };
}

/** `.env`-shaped text: a comment, then one `NAME=value` per line. */
function envText(
  settings: Map<string, string>,
  { lineEnd = "\n", quote = "" }: { lineEnd?: string; quote?: string } = {},
): string {
  const lines = [...settings].map(([name, value]) => `${name}=${quote}${value}${quote}`);
  return ["# synthetic, made for this test", ...lines].join(lineEnd) + lineEnd;
}

type Breach = { fact: string; label: string; apply: (settings: Map<string, string>) => void };

/** Each breach breaks exactly one fact of a valid synthetic `.env`. */
function breaches(directHost: string, region: string): Breach[] {
  return [
    ...ENV_FILE_SETTINGS.flatMap((name): Breach[] => [
      { fact: `${name} removed`, label: ENV_FILE_LABELS.missing(name), apply: (s) => s.delete(name) },
      { fact: `${name} empty`, label: ENV_FILE_LABELS.missing(name), apply: (s) => s.set(name, "") },
      { fact: `${name} blank`, label: ENV_FILE_LABELS.missing(name), apply: (s) => s.set(name, "   ") },
    ]),
    {
      fact: "DATABASE_URL unpooled",
      label: ENV_FILE_LABELS.databaseUrlUnpooled,
      apply: (s) => s.set("DATABASE_URL", connectionString(`ep-${token()}-c.${region}`)),
    },
    {
      fact: "DIRECT_URL pooled",
      label: ENV_FILE_LABELS.directUrlPooled,
      apply: (s) => s.set("DIRECT_URL", connectionString(`ep-${token()}-c-pooler.${region}`)),
    },
    {
      fact: "TEST_DIRECT_URL pooled",
      label: ENV_FILE_LABELS.testDirectUrlPooled,
      apply: (s) => s.set("TEST_DIRECT_URL", connectionString(`ep-${token()}-c-pooler.${region}`)),
    },
    {
      fact: "TEST_DIRECT_URL on DIRECT_URL's host",
      label: ENV_FILE_LABELS.testDirectUrlOnDirectUrlHost,
      apply: (s) => s.set("TEST_DIRECT_URL", connectionString(directHost)),
    },
    {
      fact: "TEST_DIRECT_URL on DIRECT_URL's host, in other letter case",
      label: ENV_FILE_LABELS.testDirectUrlOnDirectUrlHost,
      apply: (s) => s.set("TEST_DIRECT_URL", connectionString(directHost.toUpperCase())),
    },
    ...(["DATABASE_URL", "DIRECT_URL", "TEST_DIRECT_URL"] as const).map(
      (name): Breach => ({
        fact: `${name} with no host`,
        label: ENV_FILE_LABELS.noHost(name),
        apply: (s) => s.set(name, token(16)),
      }),
    ),
    {
      fact: `SETUP_CODE one character short of ${SETUP_CODE_MIN_LENGTH}`,
      label: ENV_FILE_LABELS.codeTooShort,
      apply: (s) =>
        s.set("SETUP_CODE", randomBytes(24).toString("base64url").slice(0, SETUP_CODE_MIN_LENGTH - 1)),
    },
    {
      fact: "PIN_PEPPER of 31 bytes",
      label: ENV_FILE_LABELS.pepperUnusable,
      apply: (s) => s.set("PIN_PEPPER", randomBytes(31).toString("base64")),
    },
    {
      fact: "PIN_PEPPER that is not base64",
      label: ENV_FILE_LABELS.pepperUnusable,
      apply: (s) => s.set("PIN_PEPPER", `${randomBytes(32).toString("base64")}!${token()}`),
    },
    {
      fact: "NEW_PIN assigned a PIN",
      label: ENV_FILE_LABELS.newPinPresent,
      apply: (s) => s.set("NEW_PIN", generatePin(6)),
    },
    {
      fact: "NEW_PIN assigned nothing, by name alone",
      label: ENV_FILE_LABELS.newPinPresent,
      apply: (s) => s.set("NEW_PIN", ""),
    },
  ];
}

describe(".env holds the eight settings, each in the shape the app needs", () => {
  it("002 AC-7, 003 AC-30, 021 AC-8 and AC-41: .env exists and envFileProblems finds nothing wrong with it", () => {
    expect(existsSync(".env"), MISSING_ENV).toBe(true);

    // Labels only: each names a setting and a fact, never a value (proved below).
    const problems = envFileProblems(readFileSync(".env", "utf8"));

    expect(problems).toEqual([]);
  });
});

describe("envFileProblems, proved on synthetic text only", () => {
  it("finds nothing wrong with a valid synthetic .env, with LF or CRLF line ends and with quoted values", () => {
    const { settings } = validSettings();

    expect(envFileProblems(envText(settings))).toEqual([]);
    expect(envFileProblems(envText(settings, { lineEnd: "\r\n" }))).toEqual([]);
    expect(envFileProblems(envText(settings, { quote: '"' }))).toEqual([]);
  });

  it("accepts a SETUP_CODE of exactly the minimum length", () => {
    const { settings } = validSettings();
    settings.set("SETUP_CODE", randomBytes(24).toString("base64url").slice(0, SETUP_CODE_MIN_LENGTH));

    expect(envFileProblems(envText(settings))).toEqual([]);
  });

  it("each breach of exactly one fact returns exactly that fact's label", () => {
    const { settings: valid, directHost, region } = validSettings();
    const all = breaches(directHost, region);

    for (const { fact, label, apply } of all) {
      const settings = new Map(valid);
      apply(settings);

      expect(envFileProblems(envText(settings)), fact).toEqual([label]);
    }
    // Every setting is removed, emptied and blanked, and every other fact is broken once.
    expect(all.length).toBe(ENV_FILE_SETTINGS.length * 3 + 13);
  });

  it("021 AC-8: NEW_PIN is found by name in every form dotenv loads, even after a blank value, and a comment is not an assignment", () => {
    const { settings } = validSettings();
    const valid = envText(settings);
    // Interpolated, so no line here is an assignment the credential scans would read.
    const name = "NEW_PIN";
    const pin = generatePin(4);
    const blank = [`OTHER_${token().toUpperCase()}`, "   "].join("=");

    const forms: [string, string][] = [
      ["after a line whose value is blank", `${blank}\n${name}=${pin}\n`],
      ["with export in front", `export ${name}=${pin}\n`],
      ["with a colon", `${name}: ${pin}\n`],
      ["in quotes", `${name}="${pin}"\n`],
    ];
    for (const [form, lines] of forms) {
      expect(envFileProblems(valid + lines), form).toEqual([ENV_FILE_LABELS.newPinPresent]);
    }

    expect(envFileProblems(`${valid}# ${name}=${pin}\n`), "in a comment").toEqual([]);
  });

  it("every label it returns is one of its fixed sentences, so no value can reach a test's output", () => {
    const { settings: valid, directHost, region } = validSettings();
    const everything = new Map(valid);
    for (const { apply } of breaches(directHost, region)) apply(everything);

    const returned = [
      ...breaches(directHost, region).flatMap(({ apply }) => {
        const settings = new Map(valid);
        apply(settings);
        return envFileProblems(envText(settings));
      }),
      ...envFileProblems(envText(everything)),
      ...envFileProblems(""),
    ];

    expect(returned.length).toBeGreaterThan(0);
    for (const label of returned) {
      expect(ALL_ENV_FILE_LABELS.has(label), "a fixed label").toBe(true);
    }
  });
});
