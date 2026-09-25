import { randomBytes } from "node:crypto";

import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generatePin, isTrivialPin } from "@/server/auth/credential-rules";
import { createActiveProfile } from "@/server/auth/operator-service";
import {
  accountKey,
  hashPin,
  pinDigest,
  signDeviceToken,
  verifyDeviceToken,
  verifyPin,
} from "@/server/auth/password";
import { resetProfilePin } from "@/server/auth/profile-admin-service";
import type { Role } from "@/server/auth/roles";
import type { SessionUser } from "@/server/auth/session-user";
import { attemptSignIn } from "@/server/auth/sign-in-service";
import { db } from "@/server/db";
import { resetTestDb } from "@/server/test-db";

/**
 * `attemptSignIn` against a real Postgres (021 AC-10, AC-12, AC-14, AC-32, and AC-33's
 * sign-in half).
 *
 * `verifyPin` is wrapped, not replaced: every call reaches the real bcrypt comparison, and
 * the wrapper only counts them, so "one comparison per evaluated attempt" is a count of the
 * real work. Statements are counted from Prisma's query log, as 020 AC-3 counts them.
 *
 * Every PIN is drawn at runtime by `generatePin`; trivial PINs are built by rule; every
 * pepper is random bytes set with `vi.stubEnv` and removed afterwards (AC-8).
 */
vi.mock("@/server/auth/password", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/password")>();
  return { ...actual, verifyPin: vi.fn(actual.verifyPin) };
});

type DbGlobal = { macroadsPrismaClient?: PrismaClient };

const verifyCalls = (): number => vi.mocked(verifyPin).mock.calls.length;

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** Begins with a letter that is not a hex digit, so it can never hide inside a hex key. */
function newUsername(): string {
  return `k${hex(8)}`;
}

function wrongPin(pin: string): string {
  for (;;) {
    const other = generatePin(6);
    if (other !== pin) return other;
  }
}

/** A trivial PIN, built from the rule at runtime: one digit repeated, of a random digit. */
function trivialPin(length: 4 | 6): string {
  const digit = String(Number.parseInt(hex(1), 16) % 10);
  const pin = digit.repeat(length);
  expect(isTrivialPin(pin)).toBe(true);
  return pin;
}

type Profile = { user: SessionUser; pin: string };

async function activeProfile(role: Role = "YARD_STAFF"): Promise<Profile> {
  const pin = generatePin(6);
  const user = await createActiveProfile({
    name: `Sign-in fixture ${hex(4)}`,
    username: newUsername(),
    role,
    pin,
  });
  return { user, pin };
}

/** A known device of its own: a token this server signed, for a fresh random id. */
function knownDevice(): { deviceToken: string } {
  return { deviceToken: signDeviceToken(null) };
}

const NEW_DEVICE = { deviceToken: null };

/**
 * Every statement `action` sends, parameters removed, from a client with query logging
 * installed on the hook `src/server/db.ts` reads (020 AC-3's method).
 */
async function statementsSentBy(action: () => Promise<unknown>): Promise<string[]> {
  const client = new PrismaClient({ log: [{ level: "query", emit: "event" }] });
  const statements: string[] = [];
  client.$on("query", (event) => {
    statements.push(event.query);
  });

  const dbGlobal = globalThis as unknown as DbGlobal;
  const previous = dbGlobal.macroadsPrismaClient;
  dbGlobal.macroadsPrismaClient = client;
  try {
    await client.$connect();
    await new Promise((resolve) => setTimeout(resolve, 100));
    statements.length = 0;
    await action();
    await new Promise((resolve) => setTimeout(resolve, 100));
  } finally {
    dbGlobal.macroadsPrismaClient = previous;
    await client.$disconnect();
  }
  return statements;
}

const READS_USER = /"User"/;
const READS_ACCOUNT_LOCK = /"AccountLock"/;

async function lockRow(username: string): Promise<{
  consecutiveFailures: number;
  level: number;
  lockedUntil: Date | null;
} | null> {
  return db.accountLock.findUnique({
    where: { accountKey: accountKey(username) },
    select: { consecutiveFailures: true, level: true, lockedUntil: true },
  });
}

beforeEach(async () => {
  await resetTestDb();
  vi.mocked(verifyPin).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("021 AC-10: every failure is one answer, and costs the same work", () => {
  it("AC-10: (a) to (e) issue the identical statement sequence and exactly one bcrypt each", async () => {
    const active = await activeProfile();

    // (c) a PENDING request, (d) a DEACTIVATED profile, (e) a REJECTED request, each with
    // the username and PIN the person chose.
    const pendingPin = generatePin(6);
    const pendingUsername = newUsername();
    const { pinHash, pinKeyId } = await hashPin(pendingPin);
    await db.user.create({
      data: {
        name: "Pending request",
        requestedUsername: pendingUsername,
        status: "PENDING",
        pinHash,
        pinKeyId,
      },
    });

    const leaver = await activeProfile();
    await db.user.update({
      where: { id: leaver.user.id },
      data: { status: "DEACTIVATED", pinHash: null, pinKeyId: null },
    });

    const rejectedUsername = newUsername();
    await db.user.create({ data: { name: "Rejected request", status: "REJECTED" } });

    const cases: [string, string, string][] = [
      ["(a) a username no profile holds", newUsername(), generatePin(6)],
      ["(b) an ACTIVE profile with a wrong PIN", active.user.username, wrongPin(active.pin)],
      ["(c) a PENDING request", pendingUsername, pendingPin],
      ["(d) a DEACTIVATED profile's former PIN", leaver.user.username, leaver.pin],
      ["(e) a REJECTED request", rejectedUsername, generatePin(6)],
    ];

    const sequences: string[][] = [];
    for (const [label, username, pin] of cases) {
      vi.mocked(verifyPin).mockClear();
      const device = knownDevice();
      let outcome: unknown;

      const statements = await statementsSentBy(async () => {
        outcome = await attemptSignIn(username, pin, device);
      });

      expect(outcome, label).toEqual({ outcome: "INCORRECT" });
      expect(verifyCalls(), label).toBe(1);
      sequences.push(statements);
    }

    // Non-vacuity: the sequence reads the profile and writes the failure.
    expect(sequences[0]?.some((statement) => READS_USER.test(statement))).toBe(true);
    expect(sequences[0]?.some((statement) => /INSERT INTO "public"\."AuthEvent"/.test(statement))).toBe(
      true,
    );
    for (const sequence of sequences.slice(1)) {
      expect(sequence).toEqual(sequences[0]);
    }
  });

  it("AC-10 (f): malformed input calls verifyPin zero times, reads no User and records one account-less failure", async () => {
    const active = await activeProfile();
    const malformed: [string, string, string][] = [
      ["a 3-digit PIN", active.user.username, generatePin(4).slice(0, 3)],
      ["a 5-digit PIN", active.user.username, generatePin(6).slice(0, 5)],
      ["a trivial 4-digit PIN", active.user.username, trivialPin(4)],
      ["a trivial 6-digit PIN", active.user.username, trivialPin(6)],
      ["a username beginning with a digit", `7${hex(6)}`, active.pin],
    ];

    for (const [label, username, pin] of malformed) {
      vi.mocked(verifyPin).mockClear();
      const device = knownDevice();
      const deviceId = verifyDeviceToken(device.deviceToken);
      let outcome: unknown;

      const statements = await statementsSentBy(async () => {
        outcome = await attemptSignIn(username, pin, device);
      });

      expect(outcome, label).toEqual({ outcome: "INCORRECT" });
      expect(verifyCalls(), label).toBe(0);
      expect(statements.filter((statement) => READS_USER.test(statement)), label).toEqual([]);
      const events = await db.authEvent.findMany({ where: { bucket: `pin:device:${deviceId}` } });
      expect(events.map((event) => [event.kind, event.accountKey]), label).toEqual([
        ["PIN_FAILURE", null],
      ]);
    }

    // The profile's own lock was never touched by any of them.
    expect(await lockRow(active.user.username)).toBeNull();
  });
});

describe("021 AC-12: the lock bites at sign-in, reveals nothing, and holds under concurrency", () => {
  for (const [label, live] of [
    ["(i) an ACTIVE profile's username", true],
    ["(ii) a well-formed username nobody holds", false],
  ] as const) {
    it(`AC-12: ${label} — five wrong PINs, then the sixth is LOCKED unevaluated`, async () => {
      const profile = live ? await activeProfile() : null;
      const username = profile?.user.username ?? newUsername();
      const correct = profile?.pin ?? generatePin(6);
      const device = knownDevice();

      for (let attempt = 1; attempt <= 5; attempt += 1) {
        expect(await attemptSignIn(username, wrongPin(correct), device)).toEqual({
          outcome: "INCORRECT",
        });
      }

      vi.mocked(verifyPin).mockClear();
      const eventsBefore = await db.authEvent.count();
      let sixth: unknown;
      const statements = await statementsSentBy(async () => {
        sixth = await attemptSignIn(username, correct, device);
      });

      expect(sixth).toEqual({ outcome: "LOCKED" });
      expect(verifyCalls()).toBe(0);
      expect(statements.filter((statement) => READS_USER.test(statement))).toEqual([]);
      expect(await db.authEvent.count()).toBe(eventsBefore);

      if (profile !== null) {
        await db.accountLock.update({
          where: { accountKey: accountKey(username) },
          data: { lockedUntil: new Date(Date.now() - 1_000) },
        });

        const signedIn = await attemptSignIn(username, correct, device);

        expect(signedIn.outcome).toBe("SIGNED_IN");
        expect(await lockRow(username)).toMatchObject({ consecutiveFailures: 0, level: 0 });
      }
    });
  }

  it("AC-12: twenty concurrent wrong PINs at one username from twenty known devices are five evaluations", async () => {
    const { user, pin } = await activeProfile();
    const key = accountKey(user.username);

    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () => attemptSignIn(user.username, wrongPin(pin), knownDevice())),
    );

    const kinds = outcomes.map((result) => result.outcome);
    expect(kinds.filter((kind) => kind === "INCORRECT")).toHaveLength(5);
    expect(kinds.filter((kind) => kind === "LOCKED")).toHaveLength(15);
    expect(verifyCalls()).toBe(5);
    expect(await db.authEvent.count({ where: { kind: "PIN_FAILURE", accountKey: key } })).toBe(5);
    expect((await lockRow(user.username))?.lockedUntil?.getTime() ?? 0).toBeGreaterThan(Date.now());
  });
});

describe("021 AC-14: a spent budget refuses before anything is read", () => {
  it("AC-14: after ten new-device failures a correct new-device attempt is PAUSED, and a known device still signs in", async () => {
    const target = await activeProfile();
    const [first, second] = [newUsername(), newUsername()];
    for (const username of [first, second]) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await attemptSignIn(username, generatePin(6), NEW_DEVICE);
      }
    }
    expect(await db.authEvent.count({ where: { bucket: "pin:new-devices" } })).toBe(10);

    vi.mocked(verifyPin).mockClear();
    let paused: unknown;
    const statements = await statementsSentBy(async () => {
      paused = await attemptSignIn(target.user.username, target.pin, NEW_DEVICE);
    });

    expect(paused).toEqual({ outcome: "PAUSED" });
    expect(verifyCalls()).toBe(0);
    expect(
      statements.filter((statement) => READS_USER.test(statement) || READS_ACCOUNT_LOCK.test(statement)),
    ).toEqual([]);
    expect(await db.authEvent.count()).toBe(10);

    const deviceA = knownDevice();
    const signedIn = await attemptSignIn(target.user.username, target.pin, deviceA);
    expect(signedIn.outcome).toBe("SIGNED_IN");
  });

  it("AC-14: one known device spends only its own budget", async () => {
    const deviceA = knownDevice();
    const deviceB = knownDevice();
    for (const username of [newUsername(), newUsername()]) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await attemptSignIn(username, generatePin(6), deviceA);
      }
    }

    expect(await attemptSignIn(newUsername(), generatePin(6), deviceA)).toEqual({ outcome: "PAUSED" });
    expect(await attemptSignIn(newUsername(), generatePin(6), deviceB)).toEqual({
      outcome: "INCORRECT",
    });
    expect(await attemptSignIn(newUsername(), generatePin(6), NEW_DEVICE)).toEqual({
      outcome: "INCORRECT",
    });
  });

  it("AC-14: twenty concurrent new-device failures at twenty usernames record exactly ten", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 20 }, () => attemptSignIn(newUsername(), generatePin(6), NEW_DEVICE)),
    );

    const kinds = outcomes.map((result) => result.outcome);
    expect(kinds.filter((kind) => kind === "INCORRECT")).toHaveLength(10);
    expect(kinds.filter((kind) => kind === "PAUSED")).toHaveLength(10);
    expect(
      await db.authEvent.count({ where: { kind: "PIN_FAILURE", bucket: "pin:new-devices" } }),
    ).toBe(10);
  });

  it("AC-14: a successful sign-in writes no AuthEvent and removes none", async () => {
    const { user, pin } = await activeProfile();
    const device = knownDevice();
    await attemptSignIn(user.username, wrongPin(pin), device);
    const before = await db.authEvent.findMany({ orderBy: { id: "asc" } });

    const result = await attemptSignIn(user.username, pin, device);

    expect(result.outcome).toBe("SIGNED_IN");
    expect(await db.authEvent.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });

  it("AC-14: the bookkeeping holds ids, kinds, bucket forms, hex keys and times — never a PIN or a username", async () => {
    const { user, pin } = await activeProfile();
    const typed: string[] = [user.username, pin];
    const device = knownDevice();
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const username = attempt === 0 ? user.username : newUsername();
      const guess = generatePin(6);
      typed.push(username, guess);
      await attemptSignIn(username, guess, attempt === 2 ? NEW_DEVICE : device);
    }
    const malformedUsername = `9${hex(5)}`;
    typed.push(malformedUsername);
    await attemptSignIn(malformedUsername, generatePin(4), device);
    await attemptSignIn(user.username, pin, device);

    const events = await db.authEvent.findMany();
    const locks = await db.accountLock.findMany();
    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(locks.length).toBeGreaterThanOrEqual(3);

    const BUCKET = /^(pin:new-devices|pin:device:[0-9a-f]{32}|request:new-devices|request:device:[0-9a-f]{32}|setup)$/;
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(["accountKey", "at", "bucket", "id", "kind"]);
      expect(event.bucket).toMatch(BUCKET);
      expect(event.accountKey === null || /^[0-9a-f]{64}$/.test(event.accountKey)).toBe(true);
    }

    const stored = JSON.stringify([events, locks]);
    for (const value of typed) {
      expect(stored).not.toContain(value);
    }
  });

  it("AC-14: writing an event deletes what is past retention, and nothing younger", async () => {
    const day = 86_400_000;
    const now = Date.now();
    const oldKey = hex(32);
    const lockedKey = hex(32);
    const youngKey = hex(32);
    await db.$executeRaw`
      INSERT INTO "AuthEvent" ("id", "kind", "bucket", "accountKey", "at") VALUES
        ('old_event', 'PIN_FAILURE', 'pin:new-devices', NULL, ${new Date(now - 31 * day)}),
        ('young_event', 'PIN_FAILURE', 'pin:new-devices', NULL, ${new Date(now - 29 * day)})`;
    await db.$executeRaw`
      INSERT INTO "AccountLock" ("accountKey", "consecutiveFailures", "level", "lockedUntil", "updatedAt") VALUES
        (${oldKey}, 2, 1, ${new Date(now - 31 * day)}, ${new Date(now - 31 * day)}),
        (${lockedKey}, 0, 8, ${new Date(now + day)}, ${new Date(now - 31 * day)}),
        (${youngKey}, 1, 0, NULL, ${new Date(now - 29 * day)})`;

    await attemptSignIn(newUsername(), generatePin(6), knownDevice());

    expect((await db.authEvent.findMany({ select: { id: true } })).map((event) => event.id)).toContain(
      "young_event",
    );
    expect(await db.authEvent.count({ where: { id: "old_event" } })).toBe(0);
    const keys = (await db.accountLock.findMany({ select: { accountKey: true } })).map(
      (row) => row.accountKey,
    );
    expect(keys).not.toContain(oldKey);
    expect(keys).toContain(lockedKey);
    expect(keys).toContain(youngKey);
  });
});

describe("021 AC-32: without its pepper sign-in fails closed; with a replaced one it locks nobody", () => {
  it("AC-32: with PIN_PEPPER unset, attemptSignIn is UNAVAILABLE and records nothing", async () => {
    const { user, pin } = await activeProfile();
    vi.stubEnv("PIN_PEPPER", "");

    expect(await attemptSignIn(user.username, pin, knownDevice())).toEqual({
      outcome: "UNAVAILABLE",
    });
    expect(await db.authEvent.count()).toBe(0);
    expect(await db.accountLock.count()).toBe(0);
  });

  it("AC-32: under a replaced pepper the correct PIN is INCORRECT, unlogged against the account, and a reset repairs it", async () => {
    const { user, pin } = await activeProfile();
    const admin: SessionUser = { id: "admin_actor", username: "admin", name: "Admin", role: "ADMIN" };
    vi.stubEnv("PIN_PEPPER", randomBytes(32).toString("base64"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const device = knownDevice();

    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect(await attemptSignIn(user.username, pin, device)).toEqual({ outcome: "INCORRECT" });
    }

    expect(await db.authEvent.count()).toBe(0);
    const lock = await lockRow(user.username);
    expect(lock === null || (lock.consecutiveFailures === 0 && lock.lockedUntil === null)).toBe(true);
    const lines = warn.mock.calls.map((call) => String(call[0]));
    expect(lines.filter((line) => line.startsWith("auth.pin_key_mismatch"))).toHaveLength(6);
    for (const line of lines) {
      expect(line).not.toContain(user.username);
    }

    const { newPin } = await resetProfilePin(admin, user.id, 6);
    expect((await attemptSignIn(user.username, newPin, device)).outcome).toBe("SIGNED_IN");
  });
});

describe("021 AC-33, the sign-in half: nothing secret reaches the console", () => {
  it("AC-33: a success, a wrong PIN, a lock, a pause and a reset log no PIN, digest, hash, key or username", async () => {
    const console4 = (["log", "info", "warn", "error"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const output = (): string[] =>
      console4.flatMap((spy) => spy.mock.calls.map((call) => call.map(String).join(" ")));

    const { user, pin } = await activeProfile("ADMIN");
    const staff = await activeProfile();
    const secrets: string[] = [pin, staff.pin, user.username, staff.user.username];

    const device = knownDevice();
    expect((await attemptSignIn(user.username, pin, device)).outcome).toBe("SIGNED_IN");

    const before = output().length;
    const guess = wrongPin(staff.pin);
    secrets.push(guess);
    expect(await attemptSignIn(staff.user.username, guess, device)).toEqual({
      outcome: "INCORRECT",
    });
    const incorrectLines = output().slice(before);
    expect(incorrectLines.filter((line) => line.startsWith("auth.pin_failed"))).toEqual([
      "auth.pin_failed bucket=device",
    ]);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const next = wrongPin(staff.pin);
      secrets.push(next);
      await attemptSignIn(staff.user.username, next, device);
    }
    expect(await attemptSignIn(staff.user.username, staff.pin, device)).toEqual({
      outcome: "LOCKED",
    });

    const other = knownDevice();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const name = newUsername();
      const next = generatePin(6);
      secrets.push(name, next);
      await attemptSignIn(name, next, other);
    }
    expect(await attemptSignIn(user.username, pin, other)).toEqual({ outcome: "PAUSED" });

    const { newPin } = await resetProfilePin(user, staff.user.id, 6);
    secrets.push(newPin);

    const stored = await db.user.findMany({ select: { pinHash: true } });
    for (const row of stored) {
      if (row.pinHash !== null) secrets.push(row.pinHash);
    }
    for (const value of [pin, staff.pin, newPin]) secrets.push(pinDigest(value));
    for (const name of [user.username, staff.user.username]) secrets.push(accountKey(name));

    const text = output().join("\n");
    expect(text.length).toBeGreaterThan(0);
    for (const secret of secrets) {
      expect(text).not.toContain(secret);
    }
  });
});
