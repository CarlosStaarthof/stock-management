import { randomBytes } from "node:crypto";

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ProfilesPage from "@/app/profiles/page";
import {
  ACCOUNT_LOCKED_LABEL,
  CLEAR_LOCK_LABEL,
  CREDENTIAL_NEEDS_RESET_LABEL,
  LAST_ADMIN_MESSAGE,
  NAME_CHARACTERS_MESSAGE,
  NAME_REQUIRED_MESSAGE,
  NAME_TOO_LONG_MESSAGE,
  NEW_DEVICES_PAUSED_MESSAGE,
  NO_PENDING_PROFILES,
  PIN_FAILURES_SUMMARY,
  RESUME_NEW_DEVICES_LABEL,
  USERNAME_FORMAT_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
} from "@/lib/auth-messages";
import { deepKeys, MONEY_KEY_PATTERN } from "@/lib/money-boundary";
import { PIN_FAILURE_BUDGET } from "@/server/auth/attempt-budget";
import { generatePin, parsePin } from "@/server/auth/credential-rules";
import { createActiveProfile } from "@/server/auth/operator-service";
import { accountKey, hashPin, pinDigest, signDeviceToken, verifyPin } from "@/server/auth/password";
import {
  approveProfile,
  changeProfileRole,
  clearAccountLock,
  createProfile,
  deactivateProfile,
  listProfiles,
  NOT_PENDING_MESSAGE,
  ONLY_ACTIVE_PROFILE_CHANGE,
  pinFailureSummary,
  rejectProfile,
  resetProfilePin,
  resumeNewDeviceSignIn,
} from "@/server/auth/profile-admin-service";
import type { Role } from "@/server/auth/roles";
import type { SessionUser } from "@/server/auth/session-user";
import { getCurrentUser } from "@/server/auth/session";
import { attemptSignIn } from "@/server/auth/sign-in-service";
import { db } from "@/server/db";
import {
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";
import { resetTestDb } from "@/server/test-db";

/**
 * `profile-admin-service.ts` against a real Postgres (021 AC-21 to AC-26, and the `/profiles`
 * halves of AC-22, AC-32, AC-33, AC-34 and AC-37), and the page rendered on the server from
 * it.
 *
 * The last-administrator rule (AC-23) is proved HERE and not end to end: the development
 * database holds administrators this suite does not control, and a spec may not depend on
 * how many there are. Here the test builds the whole population.
 *
 * Auth.js's `auth()` is stubbed, as in `pin-session.db.test.ts`: the stub keeps presenting
 * the same token, and the answer changes because the row changed. Every PIN is drawn at
 * runtime; every pepper is random bytes set with `vi.stubEnv` (AC-8).
 */
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/next-auth", () => ({ auth: authMock }));
// The identity header's sign-out action reaches the `next-auth` package itself, which needs
// Next's server runtime; the page is rendered here for its content, as
// `src/app/analysis/page.test.ts` renders its own.
vi.mock("@/app/auth-actions", () => ({ signOutAction: vi.fn() }));

// Vitest compiles JSX with the classic runtime, which expects a `React` in scope, as
// `setup-service.db.test.ts` and `src/app/analysis/page.test.ts` provide it.
(globalThis as { React?: typeof React }).React = React;

const FORBIDDEN = "ADMIN is required for this action";

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/** Begins with a letter that is not a hex digit, so it can never hide inside a hex key. */
function newUsername(): string {
  return `k${hex(8)}`;
}

function knownDevice(): { deviceToken: string } {
  return { deviceToken: signDeviceToken(null) };
}

const NEW_DEVICE = { deviceToken: null };

type Fixture = { user: SessionUser; pin: string };

async function active(role: Role = "YARD_STAFF", createdAt?: Date): Promise<Fixture> {
  const pin = generatePin(6);
  const user = await createActiveProfile({
    name: `Admin-service fixture ${hex(4)}`,
    username: newUsername(),
    role,
    pin,
  });
  if (createdAt !== undefined) {
    await db.user.update({ where: { id: user.id }, data: { createdAt } });
  }
  return { user, pin };
}

type Request = { id: string; requestedUsername: string; pin: string; name: string };

/** A `PENDING` request, written in the shape `requestProfile` writes, without its budget. */
async function request(requestedUsername = newUsername(), createdAt?: Date): Promise<Request> {
  const pin = generatePin(6);
  const name = `Request ${hex(4)}`;
  const { pinHash, pinKeyId } = await hashPin(pin);
  const row = await db.user.create({
    data: {
      name,
      requestedUsername,
      status: "PENDING",
      role: "YARD_STAFF",
      pinHash,
      pinKeyId,
      ...(createdAt === undefined ? {} : { createdAt }),
    },
    select: { id: true },
  });
  return { id: row.id, requestedUsername, pin, name };
}

/** A profile migrated from #3: an `ACTIVE` `ADMIN` with no username and no PIN. */
async function migratedAdmin(): Promise<SessionUser> {
  const row = await db.user.create({
    data: { name: `Migrated ${hex(4)}`, role: "ADMIN", status: "ACTIVE" },
    select: { id: true, name: true },
  });
  // It cannot sign in; this is the shape a service is handed, and only the role is read.
  return { id: row.id, username: newUsername(), name: row.name, role: "ADMIN" };
}

async function deactivatedHolder(): Promise<string> {
  const { user } = await active();
  await db.user.update({
    where: { id: user.id },
    data: { status: "DEACTIVATED", pinHash: null, pinKeyId: null },
  });
  return user.username;
}

/** Every row of the three tables the admin section can change, in a fixed order. */
async function snapshot(): Promise<string> {
  return JSON.stringify([
    await db.user.findMany({ orderBy: { id: "asc" } }),
    await db.accountLock.findMany({ orderBy: { accountKey: "asc" } }),
    await db.authEvent.findMany({ orderBy: { id: "asc" } }),
  ]);
}

async function caught(work: Promise<unknown>): Promise<unknown> {
  return work.then(
    () => null,
    (error: unknown) => error,
  );
}

function expectConflict(error: unknown, message: string): void {
  expect(error).toBeInstanceOf(ConflictError);
  expect((error as Error).message).toBe(message);
}

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

async function lockUsername(
  username: string,
  state: { consecutiveFailures: number; level: number; lockedUntil: Date | null },
): Promise<void> {
  await db.accountLock.upsert({
    where: { accountKey: accountKey(username) },
    create: { accountKey: accountKey(username), ...state },
    update: state,
  });
}

async function failureEvent(bucket: string, key: string | null, at = new Date()): Promise<void> {
  await db.authEvent.create({ data: { kind: "PIN_FAILURE", bucket, accountKey: key, at } });
}

function signedInAs(user: SessionUser, epoch = 0): void {
  authMock.mockResolvedValue({ user: { id: user.id }, epoch });
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

/** The text between the opening tag carrying `testId` and its closing tag. */
function elementHtml(html: string, testId: string): string | null {
  const start = html.indexOf(`data-testid="${testId}"`);
  if (start < 0) return null;
  const open = html.lastIndexOf("<", start);
  const tag = /^<(\w+)/.exec(html.slice(open))?.[1] ?? "";
  const bodyStart = html.indexOf(">", start) + 1;
  let depth = 1;
  let cursor = bodyStart;
  const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, "g");
  pattern.lastIndex = bodyStart;
  for (let match = pattern.exec(html); match !== null; match = pattern.exec(html)) {
    depth += match[1] === "/" ? -1 : 1;
    if (depth === 0) {
      cursor = match.index;
      break;
    }
  }
  return html.slice(bodyStart, cursor);
}

async function renderedPage(): Promise<string> {
  return renderToStaticMarkup(await ProfilesPage());
}

function digestOf(error: unknown): string {
  return typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : "";
}

beforeEach(async () => {
  authMock.mockReset();
  await resetTestDb();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ AC-22 */

describe("021 AC-22: /profiles is an ADMIN's, refused as a service", () => {
  it("AC-22: each of the ten functions refuses a YARD_STAFF actor as Forbidden and no actor as Unauthorized, and changes nothing", async () => {
    const admin = await active("ADMIN");
    const staff = await active();
    const pending = await request();
    await lockUsername(staff.user.username, {
      consecutiveFailures: 0,
      level: 1,
      lockedUntil: new Date(Date.now() + 600_000),
    });
    for (let i = 0; i < PIN_FAILURE_BUDGET; i += 1) await failureEvent("pin:new-devices", null);
    const before = await snapshot();

    const calls: [string, (actor: SessionUser | null) => Promise<unknown>][] = [
      ["listProfiles", (actor) => listProfiles(actor)],
      ["approveProfile", (actor) => approveProfile(actor, pending.id, "ADMIN")],
      ["rejectProfile", (actor) => rejectProfile(actor, pending.id)],
      ["changeProfileRole", (actor) => changeProfileRole(actor, admin.user.id, "YARD_STAFF")],
      ["resetProfilePin", (actor) => resetProfilePin(actor, staff.user.id, 6)],
      ["deactivateProfile", (actor) => deactivateProfile(actor, admin.user.id)],
      ["clearAccountLock", (actor) => clearAccountLock(actor, staff.user.id)],
      [
        "createProfile",
        (actor) =>
          createProfile(actor, { name: "Forbidden", username: newUsername(), role: "ADMIN", length: 6 }),
      ],
      ["pinFailureSummary", (actor) => pinFailureSummary(actor)],
      ["resumeNewDeviceSignIn", (actor) => resumeNewDeviceSignIn(actor)],
    ];
    expect(calls).toHaveLength(10);

    for (const [name, call] of calls) {
      const forbidden = await caught(call(staff.user));
      expect(forbidden, name).toBeInstanceOf(ForbiddenError);
      expect((forbidden as Error).message, name).toBe(FORBIDDEN);

      const unauthorized = await caught(call(null));
      expect(unauthorized, name).toBeInstanceOf(UnauthorizedError);
    }

    expect(await snapshot()).toBe(before);
  });

  it("AC-22: listProfiles lists every profile, PENDING first, then oldest first, with its name, username, role, status and creation date", async () => {
    const day = (n: number): Date => new Date(Date.UTC(2026, 0, n, 12));
    const oldest = await active("YARD_STAFF", day(1));
    const newerRequest = await request(newUsername(), day(4));
    const olderRequest = await request(newUsername(), day(2));
    const middle = await active("ADMIN", day(3));
    const leaver = await active("YARD_STAFF", day(5));
    await db.user.update({
      where: { id: leaver.user.id },
      data: { status: "DEACTIVATED", pinHash: null, pinKeyId: null },
    });
    const actor = await active("ADMIN");

    const listed = await listProfiles(actor.user);

    expect(listed.map((entry) => entry.id)).toEqual([
      olderRequest.id,
      newerRequest.id,
      oldest.user.id,
      middle.user.id,
      leaver.user.id,
      actor.user.id,
    ]);
    expect(listed[0]).toMatchObject({
      name: olderRequest.name,
      username: null,
      requestedUsername: olderRequest.requestedUsername,
      role: "YARD_STAFF",
      status: "PENDING",
      createdAt: day(2).toISOString(),
      credentialSet: false,
      lock: null,
    });
    expect(listed[3]).toMatchObject({
      name: middle.user.name,
      username: middle.user.username,
      requestedUsername: null,
      role: "ADMIN",
      status: "ACTIVE",
      createdAt: day(3).toISOString(),
      credentialSet: true,
      credentialNeedsReset: false,
    });
    expect(listed[4]).toMatchObject({ status: "DEACTIVATED", username: leaver.user.username, credentialSet: false });
  });

  it("AC-22: the page, rendered for a YARD_STAFF session, redirects to /stock-entry?denied=profiles and renders nothing", async () => {
    const staff = await active();
    signedInAs(staff.user);

    const thrown = await caught(ProfilesPage());

    expect(digestOf(thrown)).toMatch(/^NEXT_REDIRECT;\w+;\/stock-entry\?denied=profiles;307;/);
  });

  it("AC-22, AC-37: the page, rendered for an ADMIN, has the h1 Profiles, the one identity header, and a row per profile", async () => {
    const admin = await active("ADMIN");
    const staff = await active();
    signedInAs(admin.user);

    const html = await renderedPage();

    expect(html).toMatch(/<h1[^>]*>Profiles<\/h1>/);
    expect(elementHtml(html, "signed-in-name")).toBe(escapeHtml(admin.user.name));
    expect(html.match(/<header\b/g) ?? []).toHaveLength(1);
    expect(html).toContain('data-testid="sign-out"');
    for (const fixture of [admin, staff]) {
      expect(elementHtml(html, `profile-name-${fixture.user.id}`)).toBe(escapeHtml(fixture.user.name));
      expect(elementHtml(html, `profile-username-${fixture.user.id}`)).toBe(fixture.user.username);
      expect(elementHtml(html, `profile-role-${fixture.user.id}`)).toBe(fixture.user.role);
    }
  });
});

/* ------------------------------------------------------------------ AC-21 */

describe("021 AC-21: usernames are settled at approval, where only an ADMIN sees a collision", () => {
  it("AC-21: approval with the requested username makes it ACTIVE with the chosen role, keeps its PIN, zeroes that username's lock, and the requester signs in", async () => {
    const admin = await active("ADMIN");
    const pending = await request();
    const before = await db.user.findUniqueOrThrow({ where: { id: pending.id } });
    await lockUsername(pending.requestedUsername, {
      consecutiveFailures: 3,
      level: 2,
      lockedUntil: new Date(Date.now() + 3_600_000),
    });

    const entry = await approveProfile(admin.user, pending.id, "ADMIN");

    const after = await db.user.findUniqueOrThrow({ where: { id: pending.id } });
    expect(after).toMatchObject({
      status: "ACTIVE",
      username: pending.requestedUsername,
      requestedUsername: null,
      role: "ADMIN",
      pinHash: before.pinHash,
      pinKeyId: before.pinKeyId,
    });
    expect(await lockRow(pending.requestedUsername)).toEqual({
      consecutiveFailures: 0,
      level: 0,
      lockedUntil: null,
    });
    expect(entry).toMatchObject({ id: pending.id, status: "ACTIVE", username: pending.requestedUsername });
    const signedIn = await attemptSignIn(pending.requestedUsername, pending.pin, knownDevice());
    expect(signedIn.outcome).toBe("SIGNED_IN");
    expect(signedIn.outcome === "SIGNED_IN" ? signedIn.user.role : null).toBe("ADMIN");
  });

  it("AC-21: approval with a username the ADMIN gives uses it, after parseUsername, and the requester signs in with it", async () => {
    const admin = await active("ADMIN");
    const pending = await request();
    const edited = newUsername();

    await approveProfile(admin.user, pending.id, "YARD_STAFF", `  ${edited.toUpperCase()} `);

    expect(await db.user.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      status: "ACTIVE",
      username: edited,
      requestedUsername: null,
      role: "YARD_STAFF",
    });
    expect((await attemptSignIn(edited, pending.pin, knownDevice())).outcome).toBe("SIGNED_IN");
  });

  it("AC-21: a username held by an ACTIVE or a DEACTIVATED profile is refused with USERNAME_TAKEN_MESSAGE, and the request is unchanged", async () => {
    const admin = await active("ADMIN");
    const holders = [(await active()).user.username, await deactivatedHolder()];

    for (const held of holders) {
      const requested = await request(held);
      const other = await request();
      const before = await snapshot();

      expectConflict(await caught(approveProfile(admin.user, requested.id, "YARD_STAFF")), USERNAME_TAKEN_MESSAGE(held));
      expectConflict(
        await caught(approveProfile(admin.user, other.id, "YARD_STAFF", held.toUpperCase())),
        USERNAME_TAKEN_MESSAGE(held),
      );

      expect(await snapshot()).toBe(before);
    }
  });

  it("AC-21: a malformed username given at approval is refused with USERNAME_FORMAT_MESSAGE, and nothing changes", async () => {
    const admin = await active("ADMIN");
    const pending = await request();
    const before = await snapshot();

    for (const malformed of ["", "9abc", "ab", "a b c"]) {
      const error = await caught(approveProfile(admin.user, pending.id, "YARD_STAFF", malformed));
      expect(error, malformed).toBeInstanceOf(ValidationError);
      expect((error as Error).message, malformed).toBe(USERNAME_FORMAT_MESSAGE);
    }

    expect(await snapshot()).toBe(before);
  });

  it("AC-21: two approvals of two requests for one username, run together, give one ACTIVE profile and one ConflictError, every time", async () => {
    const admin = await active("ADMIN");

    for (let repetition = 0; repetition < 10; repetition += 1) {
      const username = newUsername();
      const first = await request(username);
      const second = await request(username);

      const results = await Promise.allSettled([
        approveProfile(admin.user, first.id, "YARD_STAFF"),
        approveProfile(admin.user, second.id, "YARD_STAFF"),
      ]);

      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
      expect(fulfilled, `repetition ${repetition}`).toHaveLength(1);
      expect(rejected, `repetition ${repetition}`).toHaveLength(1);
      expectConflict(rejected[0], USERNAME_TAKEN_MESSAGE(username));
      expect(await db.user.count({ where: { username, status: "ACTIVE" } })).toBe(1);
      expect(await db.user.count({ where: { requestedUsername: username, status: "PENDING" } })).toBe(1);
    }
  });

  it("AC-21: rejecting sets REJECTED, clears the requested username and the PIN, and keeps the row", async () => {
    const admin = await active("ADMIN");
    const pending = await request();

    const entry = await rejectProfile(admin.user, pending.id);

    expect(await db.user.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      status: "REJECTED",
      requestedUsername: null,
      username: null,
      pinHash: null,
      pinKeyId: null,
      name: pending.name,
    });
    expect(entry).toMatchObject({ id: pending.id, status: "REJECTED", requestedUsername: null });
  });

  it("AC-21: approving or rejecting a profile that is not PENDING raises ConflictError and changes nothing", async () => {
    const admin = await active("ADMIN");
    const live = await active();
    const refused = await request();
    await rejectProfile(admin.user, refused.id);
    const leaver = await active();
    await deactivateProfile(admin.user, leaver.user.id);
    const before = await snapshot();

    for (const id of [live.user.id, refused.id, leaver.user.id]) {
      expectConflict(await caught(approveProfile(admin.user, id, "YARD_STAFF")), NOT_PENDING_MESSAGE);
      expectConflict(await caught(rejectProfile(admin.user, id)), NOT_PENDING_MESSAGE);
    }

    expect(await snapshot()).toBe(before);
  });
});

/* ------------------------------------------------------------------ AC-23 */

describe("021 AC-23: role changes and deactivation bite on the next request, and the last ADMIN cannot go", () => {
  it("AC-23: a signed-in ADMIN demoted by another ADMIN is YARD_STAFF on its next request, and ADMIN again once promoted back", async () => {
    const admin = await active("ADMIN");
    const other = await active("ADMIN");
    signedInAs(other.user);
    expect((await getCurrentUser())?.role).toBe("ADMIN");

    await changeProfileRole(admin.user, other.user.id, "YARD_STAFF");
    expect((await getCurrentUser())?.role).toBe("YARD_STAFF");

    await changeProfileRole(admin.user, other.user.id, "ADMIN");
    expect((await getCurrentUser())?.role).toBe("ADMIN");
  });

  it("AC-23: a deactivated profile loses its session and its PIN, keeps its username, and its former PIN fails as AC-10 (d)", async () => {
    const admin = await active("ADMIN");
    const leaver = await active();
    signedInAs(leaver.user);
    expect(await getCurrentUser()).toEqual(leaver.user);

    const entry = await deactivateProfile(admin.user, leaver.user.id);

    expect(await getCurrentUser()).toBeNull();
    expect(await db.user.findUniqueOrThrow({ where: { id: leaver.user.id } })).toMatchObject({
      status: "DEACTIVATED",
      username: leaver.user.username,
      pinHash: null,
      pinKeyId: null,
    });
    expect(entry).toMatchObject({ status: "DEACTIVATED", credentialSet: false });
    expect(await attemptSignIn(leaver.user.username, leaver.pin, knownDevice())).toEqual({
      outcome: "INCORRECT",
    });
  });

  it("AC-23: the only ACTIVE ADMIN that can sign in cannot be demoted or deactivated, by itself or by another profile, and nothing changes", async () => {
    const only = await active("ADMIN");
    const another = await migratedAdmin();
    const staff = await active();
    const retired = await active("ADMIN");
    await db.user.update({
      where: { id: retired.user.id },
      data: { status: "DEACTIVATED", pinHash: null, pinKeyId: null },
    });
    const before = await snapshot();

    for (const actor of [only.user, another]) {
      expectConflict(await caught(changeProfileRole(actor, only.user.id, "YARD_STAFF")), LAST_ADMIN_MESSAGE);
      expectConflict(await caught(deactivateProfile(actor, only.user.id)), LAST_ADMIN_MESSAGE);
    }

    expect(await snapshot()).toBe(before);
    // Once another administrator who can sign in exists, the first one may step down.
    await changeProfileRole(only.user, staff.user.id, "ADMIN");
    await changeProfileRole({ ...staff.user, role: "ADMIN" }, only.user.id, "YARD_STAFF");
    expect(
      await db.user.findMany({
        where: { role: "ADMIN", status: "ACTIVE", username: { not: null } },
        select: { id: true },
      }),
    ).toEqual([{ id: staff.user.id }]);
  });

  it("AC-23: two ADMINs demoting each other at the same moment: exactly one succeeds, the other is LAST_ADMIN_MESSAGE, and one ADMIN remains", async () => {
    for (let repetition = 0; repetition < 10; repetition += 1) {
      await resetTestDb();
      const a = await active("ADMIN");
      const b = await active("ADMIN");

      const results = await Promise.allSettled([
        changeProfileRole(a.user, b.user.id, "YARD_STAFF"),
        changeProfileRole(b.user, a.user.id, "YARD_STAFF"),
      ]);

      const rejected = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
      expect(results.filter((result) => result.status === "fulfilled"), `repetition ${repetition}`).toHaveLength(1);
      expect(rejected, `repetition ${repetition}`).toHaveLength(1);
      expectConflict(rejected[0], LAST_ADMIN_MESSAGE);
      expect(await db.user.count({ where: { role: "ADMIN", status: "ACTIVE" } })).toBe(1);
    }
  });

  it("AC-23: two ADMINs deactivating each other at the same moment: exactly one succeeds, and one ADMIN remains", async () => {
    for (let repetition = 0; repetition < 5; repetition += 1) {
      await resetTestDb();
      const a = await active("ADMIN");
      const b = await active("ADMIN");

      const results = await Promise.allSettled([
        deactivateProfile(a.user, b.user.id),
        deactivateProfile(b.user, a.user.id),
      ]);

      const rejected = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
      expect(rejected, `repetition ${repetition}`).toHaveLength(1);
      expectConflict(rejected[0], LAST_ADMIN_MESSAGE);
      expect(await db.user.count({ where: { role: "ADMIN", status: "ACTIVE" } })).toBe(1);
    }
  });

  it("AC-23: changing the role of, or deactivating, a profile that is not ACTIVE raises ConflictError and changes nothing", async () => {
    const admin = await active("ADMIN");
    const pending = await request();
    const refused = await request();
    await rejectProfile(admin.user, refused.id);
    const leaver = await active("ADMIN");
    await deactivateProfile(admin.user, leaver.user.id);
    const before = await snapshot();

    for (const id of [pending.id, refused.id, leaver.user.id]) {
      for (const role of ["ADMIN", "YARD_STAFF"] as const) {
        expectConflict(await caught(changeProfileRole(admin.user, id, role)), ONLY_ACTIVE_PROFILE_CHANGE);
      }
      expectConflict(await caught(deactivateProfile(admin.user, id)), ONLY_ACTIVE_PROFILE_CHANGE);
    }

    expect(await snapshot()).toBe(before);
  });
});

/* ------------------------------------------------------------------ AC-25 */

describe("021 AC-25: an ADMIN can create a profile directly", () => {
  it("AC-25: it creates an ACTIVE profile of either role, with a PIN of the chosen length drawn at runtime, returned once, that signs in", async () => {
    const admin = await active("ADMIN");

    for (const [role, length] of [
      ["YARD_STAFF", 4],
      ["ADMIN", 6],
    ] as const) {
      const username = newUsername();
      const name = `Created ${hex(4)}`;

      const { profile, newPin } = await createProfile(admin.user, {
        name: ` ${name} `,
        username: ` ${username.toUpperCase()}`,
        role,
        length,
      });

      expect(newPin).toHaveLength(length);
      expect(parsePin(newPin)).toBe(newPin);
      expect(profile).toMatchObject({ name, username, role, status: "ACTIVE", credentialSet: true });
      expect(JSON.stringify(profile)).not.toContain(newPin);
      const row = await db.user.findUniqueOrThrow({ where: { id: profile.id } });
      expect(await verifyPin(newPin, row.pinHash)).toBe(true);
      const signedIn = await attemptSignIn(username, newPin, knownDevice());
      expect(signedIn.outcome === "SIGNED_IN" ? signedIn.user.role : signedIn.outcome).toBe(role);
    }
  });

  it("AC-25: it zeroes a lock the username collected before anyone held it", async () => {
    const admin = await active("ADMIN");
    const username = newUsername();
    await lockUsername(username, {
      consecutiveFailures: 2,
      level: 4,
      lockedUntil: new Date(Date.now() + 3_600_000),
    });

    const { newPin } = await createProfile(admin.user, { name: "Locked name", username, role: "YARD_STAFF", length: 6 });

    expect(await lockRow(username)).toEqual({ consecutiveFailures: 0, level: 0, lockedUntil: null });
    expect((await attemptSignIn(username, newPin, knownDevice())).outcome).toBe("SIGNED_IN");
  });

  it("AC-25: a held username is a ConflictError with USERNAME_TAKEN_MESSAGE, and an invalid name or username a ValidationError; neither creates a row", async () => {
    const admin = await active("ADMIN");
    const held = (await active()).user.username;
    const deactivated = await deactivatedHolder();
    const users = await db.user.count();

    for (const taken of [held, deactivated]) {
      expectConflict(
        await caught(createProfile(admin.user, { name: "Someone", username: taken.toUpperCase(), role: "YARD_STAFF", length: 6 })),
        USERNAME_TAKEN_MESSAGE(taken),
      );
    }
    for (const [name, username, message] of [
      ["   ", newUsername(), NAME_REQUIRED_MESSAGE],
      ["x".repeat(81), newUsername(), NAME_TOO_LONG_MESSAGE],
      ["Some<one>", newUsername(), NAME_CHARACTERS_MESSAGE],
      ["Someone", "9starts-with-a-digit", USERNAME_FORMAT_MESSAGE],
      ["Someone", "", USERNAME_FORMAT_MESSAGE],
    ] as const) {
      const error = await caught(createProfile(admin.user, { name, username, role: "YARD_STAFF", length: 6 }));
      expect(error, message).toBeInstanceOf(ValidationError);
      expect((error as Error).message).toBe(message);
    }

    expect(await db.user.count()).toBe(users);
  });

  it("AC-25: two creations of one username at the same moment give one profile and one USERNAME_TAKEN_MESSAGE", async () => {
    const admin = await active("ADMIN");
    const username = newUsername();

    const results = await Promise.allSettled([
      createProfile(admin.user, { name: "First", username, role: "YARD_STAFF", length: 6 }),
      createProfile(admin.user, { name: "Second", username, role: "YARD_STAFF", length: 6 }),
    ]);

    const rejected = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    expect(rejected).toHaveLength(1);
    expectConflict(rejected[0], USERNAME_TAKEN_MESSAGE(username));
    expect(await db.user.count({ where: { username } })).toBe(1);
  });
});

/* ------------------------------------------------------------------ AC-26 */

describe("021 AC-26: the owner sees every lock and failure, and can clear a lock or lift the pause", () => {
  it("AC-26: clearing a lock lets the correct PIN sign in at once, keeps the level, and writes no AuthEvent", async () => {
    const admin = await active("ADMIN");
    const staff = await active();
    await lockUsername(staff.user.username, {
      consecutiveFailures: 2,
      level: 3,
      lockedUntil: new Date(Date.now() + 3_600_000),
    });
    expect((await attemptSignIn(staff.user.username, staff.pin, knownDevice())).outcome).toBe("LOCKED");
    const events = await db.authEvent.count();

    const entry = await clearAccountLock(admin.user, staff.user.id);

    expect(await lockRow(staff.user.username)).toEqual({ consecutiveFailures: 0, level: 3, lockedUntil: null });
    expect(entry.lock).toMatchObject({ locked: false, lockedUntil: null, level: 3, consecutiveFailures: 0 });
    expect(await db.authEvent.count()).toBe(events);
    expect((await attemptSignIn(staff.user.username, staff.pin, knownDevice())).outcome).toBe("SIGNED_IN");
  });

  it("AC-26: each profile's entry carries its PIN failures in the last 30 days and its lock while locked, and none once the lock has ended", async () => {
    const admin = await active("ADMIN");
    const staff = await active();
    const key = accountKey(staff.user.username);
    await failureEvent(`pin:device:${hex(16)}`, key);
    await failureEvent("pin:new-devices", key, new Date(Date.now() - 29 * 86_400_000));
    await failureEvent("pin:new-devices", key, new Date(Date.now() - 31 * 86_400_000));
    await failureEvent("pin:new-devices", accountKey(admin.user.username));
    const until = new Date(Date.now() + 1_800_000);
    await lockUsername(staff.user.username, { consecutiveFailures: 0, level: 1, lockedUntil: until });

    const locked = (await listProfiles(admin.user)).find((entry) => entry.id === staff.user.id);
    expect(locked?.lock).toEqual({
      locked: true,
      lockedUntil: until.toISOString(),
      consecutiveFailures: 0,
      level: 1,
      failuresLast30Days: 2,
    });

    await lockUsername(staff.user.username, {
      consecutiveFailures: 0,
      level: 1,
      lockedUntil: new Date(Date.now() - 1_000),
    });
    const ended = (await listProfiles(admin.user)).find((entry) => entry.id === staff.user.id);
    expect(ended?.lock).toMatchObject({ locked: false, lockedUntil: null, failuresLast30Days: 2 });
  });

  it("AC-26: 3 failures from new devices and 1 from a known device, 2 naming no profile's username, summarise exactly", async () => {
    const admin = await active("ADMIN");
    const held = await active();
    const now = Date.now();
    await failureEvent("pin:new-devices", accountKey(held.user.username));
    await failureEvent("pin:new-devices", accountKey(newUsername()));
    await failureEvent("pin:new-devices", accountKey(newUsername()));
    await failureEvent(`pin:device:${hex(16)}`, accountKey(admin.user.username));
    // Outside what is counted: older than a day, and not a PIN failure.
    await failureEvent("pin:new-devices", accountKey(newUsername()), new Date(now - 25 * 3_600_000));
    await db.authEvent.create({ data: { kind: "PROFILE_REQUEST", bucket: "request:new-devices" } });
    await db.authEvent.create({ data: { kind: "SETUP_FAILURE", bucket: "setup" } });

    expect(await pinFailureSummary(admin.user)).toEqual({
      newDevices: 3,
      knownDevices: 1,
      unknownUsernames: 2,
      newDevicesPaused: false,
    });
  });

  it("AC-26: a failure with no account key, and none with a deactivated profile's, is what 'named no profile's username' counts", async () => {
    const admin = await active("ADMIN");
    const leaver = await deactivatedHolder();
    await failureEvent(`pin:device:${hex(16)}`, null);
    await failureEvent(`pin:device:${hex(16)}`, accountKey(leaver));

    expect(await pinFailureSummary(admin.user)).toEqual({
      newDevices: 0,
      knownDevices: 2,
      unknownUsernames: 1,
      newDevicesPaused: false,
    });
  });

  it("AC-26: with 10 from new devices it is paused; resuming records one BUDGET_RESET, deletes no event, and a new device is evaluated again", async () => {
    const admin = await active("ADMIN");
    const staff = await active();
    for (let i = 0; i < PIN_FAILURE_BUDGET; i += 1) {
      await failureEvent("pin:new-devices", accountKey(newUsername()));
    }
    expect((await pinFailureSummary(admin.user)).newDevicesPaused).toBe(true);
    expect(await attemptSignIn(staff.user.username, staff.pin, NEW_DEVICE)).toEqual({ outcome: "PAUSED" });
    const before = await db.authEvent.findMany({ orderBy: { id: "asc" } });

    await resumeNewDeviceSignIn(admin.user);

    const after = await db.authEvent.findMany({ orderBy: { id: "asc" } });
    const added = after.filter((event) => !before.some((old) => old.id === event.id));
    expect(before.every((old) => after.some((event) => event.id === old.id))).toBe(true);
    expect(added.map((event) => [event.kind, event.bucket, event.accountKey])).toEqual([
      ["BUDGET_RESET", "pin:new-devices", null],
    ]);
    expect(await pinFailureSummary(admin.user)).toEqual({
      newDevices: PIN_FAILURE_BUDGET,
      knownDevices: 0,
      unknownUsernames: PIN_FAILURE_BUDGET,
      newDevicesPaused: false,
    });
    expect((await attemptSignIn(staff.user.username, staff.pin, NEW_DEVICE)).outcome).toBe("SIGNED_IN");
  });

  it("AC-26: resuming while new devices are not paused writes nothing", async () => {
    const admin = await active("ADMIN");
    await failureEvent("pin:new-devices", null);
    const before = await snapshot();

    await resumeNewDeviceSignIn(admin.user);

    expect(await snapshot()).toBe(before);
  });

  it("AC-26: the page renders the summary, each row's failures, and the lock with its clear control only while locked", async () => {
    const admin = await active("ADMIN");
    const locked = await active();
    const open = await active();
    await failureEvent(`pin:device:${hex(16)}`, accountKey(locked.user.username));
    await failureEvent("pin:new-devices", accountKey(newUsername()));
    const until = new Date(Date.now() + 1_800_000);
    await lockUsername(locked.user.username, { consecutiveFailures: 0, level: 2, lockedUntil: until });
    signedInAs(admin.user);

    const html = await renderedPage();

    expect(elementHtml(html, "pin-failures")).toBe(escapeHtml(PIN_FAILURES_SUMMARY(1, 1, 1)));
    expect(html).not.toContain(escapeHtml(NEW_DEVICES_PAUSED_MESSAGE));
    expect(html).not.toContain(escapeHtml(RESUME_NEW_DEVICES_LABEL));
    expect(elementHtml(html, `failures-${locked.user.id}`)).toBe("1");
    expect(elementHtml(html, `failures-${open.user.id}`)).toBe("0");
    const lock = elementHtml(html, `lock-${locked.user.id}`) ?? "";
    expect(lock).toContain(escapeHtml(ACCOUNT_LOCKED_LABEL));
    expect(lock).toContain(`dateTime="${until.toISOString()}"`);
    expect(lock).toContain(escapeHtml(CLEAR_LOCK_LABEL));
    expect(html).not.toContain(`data-testid="lock-${open.user.id}"`);
    expect(html.split(escapeHtml(CLEAR_LOCK_LABEL))).toHaveLength(2);
  });

  it("AC-26: while new devices are paused the page says so and offers the resume control", async () => {
    const admin = await active("ADMIN");
    for (let i = 0; i < PIN_FAILURE_BUDGET; i += 1) await failureEvent("pin:new-devices", null);
    signedInAs(admin.user);

    const html = await renderedPage();

    expect(elementHtml(html, "pin-failures")).toBe(
      escapeHtml(PIN_FAILURES_SUMMARY(PIN_FAILURE_BUDGET, 0, PIN_FAILURE_BUDGET)),
    );
    expect(html).toContain(escapeHtml(NEW_DEVICES_PAUSED_MESSAGE));
    expect(html).toContain(escapeHtml(RESUME_NEW_DEVICES_LABEL));
  });

  it("AC-22: the page says no profile is waiting when none is, and lists a waiting one first when one is", async () => {
    const admin = await active("ADMIN");
    signedInAs(admin.user);

    const empty = await renderedPage();
    expect(empty).toContain(escapeHtml(NO_PENDING_PROFILES));

    const pending = await request();
    const html = await renderedPage();
    expect(html).not.toContain(escapeHtml(NO_PENDING_PROFILES));
    expect(html.indexOf(`data-testid="profile-${pending.id}"`)).toBeLessThan(
      html.indexOf(`data-testid="profile-${admin.user.id}"`),
    );
    expect(elementHtml(html, `profile-username-${pending.id}`)).toBe(pending.requestedUsername);
    expect(html).toMatch(new RegExp(`data-testid="approve-username-${pending.id}"[^>]*value="${pending.requestedUsername}"`));
  });
});

/* ------------------------------------------------------------------ AC-32 */

describe("021 AC-32: with a replaced pepper nobody is locked out, and /profiles says which PINs need a reset", () => {
  it("AC-32: listProfiles and the page mark a PIN stored under the old pepper, and a reset makes it sign in again", async () => {
    const admin = await active("ADMIN");
    const staff = await active();
    vi.stubEnv("PIN_PEPPER", randomBytes(32).toString("base64"));
    // The admin's own PIN is stale too; the stub session still reads its row.
    signedInAs(admin.user);

    const entry = (await listProfiles(admin.user)).find((candidate) => candidate.id === staff.user.id);
    expect(entry?.credentialNeedsReset).toBe(true);
    const html = await renderedPage();
    expect(elementHtml(html, `needs-reset-${staff.user.id}`)).toBe(escapeHtml(CREDENTIAL_NEEDS_RESET_LABEL));

    const { newPin } = await resetProfilePin(admin.user, staff.user.id, 6);

    expect((await listProfiles(admin.user)).find((candidate) => candidate.id === staff.user.id)?.credentialNeedsReset).toBe(false);
    expect((await attemptSignIn(staff.user.username, newPin, knownDevice())).outcome).toBe("SIGNED_IN");
  });
});

/* ------------------------------------------------------------------ AC-33 */

describe("021 AC-33: the admin section logs, returns and stores no PIN, digest, hash or key", () => {
  it("AC-33: approval, rejection, creation, reset and every other action print none of them, and no column holds a new PIN", async () => {
    const output: string[] = [];
    for (const method of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        output.push(args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "));
      });
    }
    const admin = await active("ADMIN");
    const staff = await active();
    const approved = await request();
    const refused = await request();

    const approvedEntry = await approveProfile(admin.user, approved.id, "YARD_STAFF");
    await rejectProfile(admin.user, refused.id);
    const created = await createProfile(admin.user, {
      name: "Created",
      username: newUsername(),
      role: "YARD_STAFF",
      length: 6,
    });
    const reset = await resetProfilePin(admin.user, staff.user.id, 6);
    await clearAccountLock(admin.user, staff.user.id);
    await changeProfileRole(admin.user, staff.user.id, "ADMIN");
    await pinFailureSummary(admin.user);
    await resumeNewDeviceSignIn(admin.user);
    await deactivateProfile(admin.user, staff.user.id);
    await listProfiles(admin.user);

    const pins = [approved.pin, refused.pin, created.newPin, reset.newPin, staff.pin, admin.pin];
    const rows = await db.user.findMany();
    const forbidden = [
      ...pins,
      ...pins.map((pin) => pinDigest(pin)),
      ...rows.flatMap((row) => [row.pinHash, row.pinKeyId]).filter((value): value is string => value !== null),
      ...rows.flatMap((row) => (row.username === null ? [] : [row.username, accountKey(row.username)])),
      approved.requestedUsername,
      refused.requestedUsername,
    ];
    const printed = output.join("\n");
    expect(forbidden.filter((value) => printed.includes(value))).toHaveLength(0);
    expect(approvedEntry.username).toBe(approved.requestedUsername);

    const stored = [
      ...rows,
      ...(await db.accountLock.findMany()),
      ...(await db.authEvent.findMany()),
    ].flatMap((row) => Object.values(row).map(String));
    for (const pin of [created.newPin, reset.newPin]) {
      expect(stored.filter((value) => value === pin)).toHaveLength(0);
    }
  });
});

/* ------------------------------------------------------------------ AC-34 */

describe("021 AC-34: the admin section sends no money", () => {
  it("AC-34: deepKeys of every value the ten functions return has no price, value, total or amount key, and the page has no euro", async () => {
    const admin = await active("ADMIN");
    const staff = await active();
    const other = await active();
    const approved = await request();
    const refused = await request();
    await lockUsername(staff.user.username, {
      consecutiveFailures: 1,
      level: 1,
      lockedUntil: new Date(Date.now() + 600_000),
    });
    await failureEvent("pin:new-devices", accountKey(staff.user.username));

    const returned: unknown[] = [
      await listProfiles(admin.user),
      await approveProfile(admin.user, approved.id, "YARD_STAFF"),
      await rejectProfile(admin.user, refused.id),
      await changeProfileRole(admin.user, other.user.id, "ADMIN"),
      await resetProfilePin(admin.user, staff.user.id, 4),
      await clearAccountLock(admin.user, staff.user.id),
      await createProfile(admin.user, { name: "Money free", username: newUsername(), role: "ADMIN", length: 6 }),
      await pinFailureSummary(admin.user),
      await resumeNewDeviceSignIn(admin.user),
      await deactivateProfile(admin.user, other.user.id),
    ];

    expect(returned).toHaveLength(10);
    const keys = deepKeys(returned);
    expect(keys).toContain("failuresLast30Days");
    expect(keys.filter((key) => MONEY_KEY_PATTERN.test(key))).toEqual([]);

    signedInAs(admin.user);
    const html = await renderedPage();
    expect(html).not.toContain("€");
    for (const row of await db.user.findMany()) {
      if (row.pinHash !== null) expect(html).not.toContain(row.pinHash);
    }
  });
});
