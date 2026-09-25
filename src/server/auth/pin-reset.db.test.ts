import { spawnSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  ONLY_ACTIVE_PIN_RESET,
  PIN_FORMAT_MESSAGE,
  PIN_TOO_SIMPLE_MESSAGE,
  USERNAME_FORMAT_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
} from "@/lib/auth-messages";
import { generatePin } from "@/server/auth/credential-rules";
import { createActiveProfile } from "@/server/auth/operator-service";
import { accountKey, currentPinKeyId, hashPin, verifyPin } from "@/server/auth/password";
import type { Role } from "@/server/auth/roles";
import { db } from "@/server/db";
import { resetTestDb } from "@/server/test-db";

/**
 * 021 AC-30: `npm run pin:reset`, run for real against the test database, as 003's
 * `admin:create` test ran its script — what the criterion describes is the command an
 * operator types, not an exported function.
 *
 * Every PIN is drawn at runtime, and a trivial one is built by rule (AC-8). Every run goes
 * through `pinReset`, which fails the test if anything the command printed contains the
 * `NEW_PIN` value, a `pinHash`, a `pinKeyId` or an account key, before or after the run —
 * so the scan holds across every run in this file, not only where a test remembers it.
 */

type Run = { status: number; stdout: string; stderr: string; printed: string };
type Env = { NEW_PIN?: string; NEW_USERNAME?: string; PIN_PEPPER?: string };

beforeEach(async () => {
  await resetTestDb();
});

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function newUsername(): string {
  return `r${hex(8)}`;
}

function newName(label: string): string {
  return `Reset ${label} ${hex(3)}`;
}

/** Six digits counting up, built by rule: trivial by AC-7's definition, never written down. */
function trivialPin(): string {
  const first = randomInt(0, 5);
  return Array.from({ length: 6 }, (_, index) => String(first + index)).join("");
}

/** A well-formed PIN for a run whose point is something else. */
function freshPin(): string {
  return generatePin(6);
}

/** Five digits: the wrong length, so malformed whatever they are. */
function fiveDigits(): string {
  return generatePin(6).slice(1);
}

/** Every value the command must never print, as the database holds them now. */
async function secretsNow(): Promise<string[]> {
  const users = await db.user.findMany({ select: { username: true, pinHash: true, pinKeyId: true } });
  const locks = await db.accountLock.findMany({ select: { accountKey: true } });
  return [
    currentPinKeyId(),
    ...users.flatMap((user) => [
      user.pinHash,
      user.pinKeyId,
      user.username === null ? null : accountKey(user.username),
    ]),
    ...locks.map((lock) => lock.accountKey),
  ].filter((value): value is string => value !== null && value !== "");
}

/**
 * One run of the command. `NEW_PIN` and `NEW_USERNAME` are absent unless given, so a
 * value in this process's environment can never leak into a run.
 */
async function pinReset(args: string[], env: Env = {}): Promise<Run> {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NEW_PIN: undefined,
    NEW_USERNAME: undefined,
    ...env,
  };
  for (const [key, value] of Object.entries(childEnv)) {
    if (value === undefined) delete childEnv[key];
  }

  const before = await secretsNow();
  const result = spawnSync(["npm run pin:reset --silent --", ...args].join(" "), {
    shell: true,
    encoding: "utf8",
    env: childEnv,
  });
  const after = await secretsNow();

  const run = {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    printed: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };

  const forbidden = new Set([...before, ...after]);
  if (env.NEW_PIN !== undefined && env.NEW_PIN !== "") forbidden.add(env.NEW_PIN);
  if (env.NEW_USERNAME !== undefined && env.NEW_USERNAME !== "") {
    forbidden.add(accountKey(env.NEW_USERNAME));
  }
  let leaked = 0;
  for (const secret of forbidden) {
    if (run.printed.includes(secret)) leaked += 1;
  }
  // The count, never the value: a failing assertion must not print what it caught.
  expect(leaked, `values printed that must never be (args: ${args.join(" ")})`).toBe(0);

  return run;
}

/** Every row the command could change, so a refusal can be shown to have changed none. */
async function everyRow(): Promise<unknown> {
  return {
    users: await db.user.findMany({ orderBy: { id: "asc" } }),
    locks: await db.accountLock.findMany({ orderBy: { accountKey: "asc" } }),
    events: await db.authEvent.count(),
  };
}

async function activeProfile(role: Role = "YARD_STAFF"): Promise<{
  id: string;
  username: string;
  name: string;
  role: Role;
  pin: string;
}> {
  const pin = generatePin(6);
  const user = await createActiveProfile({ name: newName("active"), username: newUsername(), role, pin });
  return { ...user, pin };
}

/** An account migrated from #3: ACTIVE, with no username and no PIN. */
async function migratedProfile(role: Role = "ADMIN"): Promise<{ id: string; name: string; role: Role }> {
  return db.user.create({
    data: { name: newName("migrated"), role, status: "ACTIVE" },
    select: { id: true, name: true, role: true },
  });
}

async function lockFor(username: string, lockedUntil: Date | null): Promise<string> {
  const key = accountKey(username);
  await db.accountLock.create({
    data: { accountKey: key, consecutiveFailures: 4, level: 2, lockedUntil },
  });
  return key;
}

function lines(output: string): string[] {
  return output.split(/\r?\n/).filter((line) => line.length > 0);
}

describe("021 AC-30: --list", () => {
  it("AC-30: --list prints one line per profile: exactly its id, username or -, name, role, status, PIN state and lock state", async () => {
    const active = await activeProfile();
    const locked = await activeProfile("ADMIN");
    const until = new Date(Date.now() + 3_600_000);
    await lockFor(locked.username, until);
    const migrated = await migratedProfile();
    const stale = await activeProfile();
    await db.user.update({ where: { id: stale.id }, data: { pinKeyId: hex(8) } });
    const leaver = await db.user.create({
      data: { name: newName("leaver"), username: newUsername(), status: "DEACTIVATED" },
    });
    const request = await db.user.create({
      data: {
        name: newName("request"),
        requestedUsername: newUsername(),
        status: "PENDING",
        ...(await hashPin(generatePin(6))),
      },
    });
    const storedUntil = (await db.accountLock.findUniqueOrThrow({
      where: { accountKey: accountKey(locked.username) },
    })).lockedUntil as Date;

    const run = await pinReset(["--list"]);

    expect(run.status, run.stderr).toBe(0);
    const printed = lines(run.stdout).map((line) => line.split("\t"));
    expect(printed).toHaveLength(await db.user.count());
    expect(printed.sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""))).toEqual(
      [
        [active.id, active.username, active.name, "YARD_STAFF", "ACTIVE", "set", "not locked"],
        [
          locked.id,
          locked.username,
          locked.name,
          "ADMIN",
          "ACTIVE",
          "set",
          `locked until ${storedUntil.toISOString()}`,
        ],
        [migrated.id, "-", migrated.name, "ADMIN", "ACTIVE", "none", "-"],
        [stale.id, stale.username, stale.name, "YARD_STAFF", "ACTIVE", "reset needed", "not locked"],
        [leaver.id, leaver.username, leaver.name, "YARD_STAFF", "DEACTIVATED", "none", "not locked"],
        [request.id, "-", request.name, "YARD_STAFF", "PENDING", "set", "-"],
      ].sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? "")),
    );
  });
});

describe("021 AC-30: --profile repairs an ACTIVE profile", () => {
  it("AC-30: a migrated profile gets NEW_USERNAME and NEW_PIN under the current pepper, its username's lock ends, its epoch is bumped, and it prints id, username, name and role", async () => {
    const migrated = await migratedProfile();
    const username = newUsername();
    const key = await lockFor(username, new Date(Date.now() + 3_600_000));
    const pin = generatePin(6);
    const before = await db.user.findUniqueOrThrow({ where: { id: migrated.id } });

    const run = await pinReset(["--profile", migrated.id], { NEW_USERNAME: username, NEW_PIN: pin });

    expect(run.status, run.stderr).toBe(0);
    for (const fact of [migrated.id, username, migrated.name, "ADMIN"]) {
      expect(run.stdout).toContain(fact);
    }

    const after = await db.user.findUniqueOrThrow({ where: { id: migrated.id } });
    expect(after.username).toBe(username);
    expect(after.status).toBe("ACTIVE");
    expect(after.role).toBe("ADMIN");
    expect(after.pinKeyId).toBe(currentPinKeyId());
    expect(await verifyPin(pin, after.pinHash)).toBe(true);
    expect(after.sessionEpoch).toBe(before.sessionEpoch + 1);
    expect(
      await db.accountLock.findUnique({
        where: { accountKey: key },
        select: { consecutiveFailures: true, level: true, lockedUntil: true },
      }),
    ).toEqual({ consecutiveFailures: 0, level: 2, lockedUntil: null });
  });

  it("AC-30: a profile with a username and a PIN from another pepper gets NEW_PIN under the current one, its lock ends, and its epoch is bumped", async () => {
    const staff = await activeProfile();
    await db.user.update({ where: { id: staff.id }, data: { pinKeyId: hex(8) } });
    const key = await lockFor(staff.username, new Date(Date.now() + 3_600_000));
    const pin = generatePin(6);
    const before = await db.user.findUniqueOrThrow({ where: { id: staff.id } });

    const run = await pinReset(["--profile", staff.id], { NEW_PIN: pin });

    expect(run.status, run.stderr).toBe(0);
    for (const fact of [staff.id, staff.username, staff.name, "YARD_STAFF"]) {
      expect(run.stdout).toContain(fact);
    }

    const after = await db.user.findUniqueOrThrow({ where: { id: staff.id } });
    expect(after.username).toBe(staff.username);
    expect(after.pinKeyId).toBe(currentPinKeyId());
    expect(await verifyPin(pin, after.pinHash)).toBe(true);
    expect(await verifyPin(staff.pin, after.pinHash)).toBe(false);
    expect(after.sessionEpoch).toBe(before.sessionEpoch + 1);
    expect(
      await db.accountLock.findUnique({
        where: { accountKey: key },
        select: { consecutiveFailures: true, level: true, lockedUntil: true },
      }),
    ).toEqual({ consecutiveFailures: 0, level: 2, lockedUntil: null });
    expect(await db.user.count()).toBe(1);
  });
});

describe("021 AC-30: every refusal exits non-zero and changes no row", () => {
  it.each([
    ["unset", undefined],
    ["empty", ""],
  ])("AC-30: with NEW_PIN %s it names NEW_PIN; there is no prompt, no default and no generated PIN", async (_label, value) => {
    const staff = await activeProfile();
    const before = await everyRow();

    const run = await pinReset(["--profile", staff.id], { NEW_PIN: value });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("NEW_PIN");
    expect(await everyRow()).toEqual(before);
  });

  it.each([
    { label: "malformed", draw: fiveDigits, message: PIN_FORMAT_MESSAGE },
    { label: "trivial", draw: trivialPin, message: PIN_TOO_SIMPLE_MESSAGE },
  ])("AC-30: with a $label NEW_PIN it prints the matching PIN message", async ({ draw, message }) => {
    const staff = await activeProfile();
    const before = await everyRow();

    const run = await pinReset(["--profile", staff.id], { NEW_PIN: draw() });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(message);
    expect(await everyRow()).toEqual(before);
  });

  it("AC-30: with NEW_USERNAME missing for a profile that has none, it names NEW_USERNAME", async () => {
    const migrated = await migratedProfile();
    const before = await everyRow();

    const run = await pinReset(["--profile", migrated.id], { NEW_PIN: freshPin() });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("NEW_USERNAME");
    expect(await everyRow()).toEqual(before);
  });

  it("AC-30: with NEW_USERNAME given for a profile that has one, it names NEW_USERNAME", async () => {
    const staff = await activeProfile();
    const before = await everyRow();

    const run = await pinReset(["--profile", staff.id], {
      NEW_PIN: freshPin(),
      NEW_USERNAME: newUsername(),
    });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("NEW_USERNAME");
    expect(await everyRow()).toEqual(before);
  });

  it("AC-30: with a malformed NEW_USERNAME, it names NEW_USERNAME with the username message", async () => {
    const migrated = await migratedProfile();
    const before = await everyRow();

    const run = await pinReset(["--profile", migrated.id], {
      NEW_PIN: freshPin(),
      NEW_USERNAME: `9${hex(4)}`,
    });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("NEW_USERNAME");
    expect(run.stderr).toContain(USERNAME_FORMAT_MESSAGE);
    expect(await everyRow()).toEqual(before);
  });

  it("AC-30: with a NEW_USERNAME another profile holds, it prints USERNAME_TAKEN_MESSAGE", async () => {
    const holder = await activeProfile();
    const migrated = await migratedProfile();
    const before = await everyRow();

    const run = await pinReset(["--profile", migrated.id], {
      NEW_PIN: freshPin(),
      NEW_USERNAME: holder.username,
    });

    expect(run.status).not.toBe(0);
    expect(lines(run.stderr)).toContain(USERNAME_TAKEN_MESSAGE(holder.username));
    expect(await everyRow()).toEqual(before);
  });

  it.each(["PENDING", "REJECTED", "DEACTIVATED"] as const)(
    "AC-30: for a %s profile it prints ONLY_ACTIVE_PIN_RESET",
    async (status) => {
      const profile =
        status === "PENDING"
          ? await db.user.create({
              data: {
                name: newName("request"),
                requestedUsername: newUsername(),
                status,
                ...(await hashPin(generatePin(6))),
              },
            })
          : await db.user.create({ data: { name: newName(status.toLowerCase()), status } });
      const before = await everyRow();

      const run = await pinReset(["--profile", profile.id], {
        NEW_PIN: freshPin(),
        NEW_USERNAME: newUsername(),
      });

      expect(run.status).not.toBe(0);
      expect(lines(run.stderr)).toContain(ONLY_ACTIVE_PIN_RESET);
      expect(await everyRow()).toEqual(before);
    },
  );

  it("AC-30: for an unknown id it names the id", async () => {
    await activeProfile();
    const unknown = `c${hex(12)}`;
    const before = await everyRow();

    const run = await pinReset(["--profile", unknown], { NEW_PIN: freshPin() });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain(unknown);
    expect(await everyRow()).toEqual(before);
  });

  it("AC-30: with PIN_PEPPER unset it names PIN_PEPPER, in both forms", async () => {
    // Unset as the command sees it. When the command imports Prisma's client, the client
    // loads the project's `.env` into every variable the environment lacks and never
    // overrides one that is present. Deleting the variable here would therefore hand the
    // command whatever `.env` holds, on a machine that has one. Passed empty, it reaches
    // `password.ts` as nothing, which refuses unset and empty alike, with the one message
    // "PIN_PEPPER is not set" (021 AC-5).
    const staff = await activeProfile();
    const before = await everyRow();

    const repair = await pinReset(["--profile", staff.id], { NEW_PIN: freshPin(), PIN_PEPPER: "" });
    const list = await pinReset(["--list"], { PIN_PEPPER: "" });

    for (const run of [repair, list]) {
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain("PIN_PEPPER");
    }
    expect(list.stdout).toBe("");
    expect(await everyRow()).toEqual(before);
  });

  it.each([
    [["--create-admin"]],
    [[]],
    [["--profile"]],
    [["--list", "--profile", "PROFILE"]],
    [["--profile", "PROFILE", "--create-admin"]],
  ])("AC-30: any other form is refused and creates no profile: %j", async (form) => {
    const staff = await activeProfile();
    const args = form.map((arg) => (arg === "PROFILE" ? staff.id : arg));
    const before = await everyRow();

    // Valid credentials alongside, so a command that did create a profile could.
    const run = await pinReset(args, { NEW_PIN: freshPin(), NEW_USERNAME: newUsername() });

    expect(run.status).not.toBe(0);
    expect(run.stderr).toContain("usage: npm run pin:reset");
    if (args.includes("--create-admin")) expect(run.stderr).toContain("--create-admin");
    expect(await everyRow()).toEqual(before);
  });
});
