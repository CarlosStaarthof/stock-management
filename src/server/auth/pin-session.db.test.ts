import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ONLY_ACTIVE_PIN_RESET } from "@/lib/auth-messages";
import { deepKeys } from "@/lib/money-boundary";
import { generatePin, parsePin } from "@/server/auth/credential-rules";
import { createActiveProfile } from "@/server/auth/operator-service";
import { accountKey, currentPinKeyId, signDeviceToken, verifyPin } from "@/server/auth/password";
import type { SessionUser } from "@/server/auth/session-user";
import { attemptSignIn } from "@/server/auth/sign-in-service";
import { db } from "@/server/db";
import { ConflictError, ForbiddenError, UnauthorizedError } from "@/server/errors";
import { resetTestDb } from "@/server/test-db";

/**
 * 021 AC-17 and AC-24, their service halves: a session follows the row INCLUDING its epoch,
 * and a reset issues a fresh PIN once and ends every session that used the old one.
 *
 * Auth.js's `auth()` is stubbed, as in session.db.test.ts: the stub keeps presenting the
 * same token, and the answer changes because the row changed. Every PIN is drawn at
 * runtime; nothing here writes one down (AC-8).
 */
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/next-auth", () => ({ auth: authMock }));

const { getCurrentUser } = await import("@/server/auth/session");
const { resetProfilePin } = await import("@/server/auth/profile-admin-service");

const MONEY_KEY = /price|value|total|amount/i;

function newUsername(): string {
  return `k${randomBytes(8).toString("hex")}`;
}

async function profile(role: "ADMIN" | "YARD_STAFF"): Promise<{ user: SessionUser; pin: string }> {
  const pin = generatePin(6);
  const user = await createActiveProfile({
    name: `Session fixture ${randomBytes(4).toString("hex")}`,
    username: newUsername(),
    role,
    pin,
  });
  return { user, pin };
}

function device(): { deviceToken: string } {
  return { deviceToken: signDeviceToken(null) };
}

beforeEach(async () => {
  authMock.mockReset();
  await resetTestDb();
});

describe("021 AC-17: sessions follow the row, including its epoch", () => {
  it("AC-17: a token with no epoch claim is refused, although its user is ACTIVE", async () => {
    const { user } = await profile("YARD_STAFF");
    authMock.mockResolvedValue({ user: { id: user.id, role: "YARD_STAFF" } });

    expect(await getCurrentUser()).toBeNull();
  });

  it("AC-17: a token whose epoch differs from the row's is refused", async () => {
    const { user } = await profile("YARD_STAFF");
    authMock.mockResolvedValue({ user: { id: user.id }, epoch: 1 });

    expect(await getCurrentUser()).toBeNull();
  });

  it("AC-17: after resetProfilePin the profile's existing session is refused on its next request", async () => {
    const admin = await profile("ADMIN");
    const staff = await profile("YARD_STAFF");
    const signedIn = await attemptSignIn(staff.user.username, staff.pin, device());
    expect(signedIn.outcome).toBe("SIGNED_IN");
    const epoch = signedIn.outcome === "SIGNED_IN" ? signedIn.sessionEpoch : -1;
    authMock.mockResolvedValue({ user: { id: staff.user.id }, epoch });

    expect(await getCurrentUser()).toEqual(staff.user);

    await resetProfilePin(admin.user, staff.user.id, 4);

    // The same token, presented again: the row's epoch moved on.
    expect(await getCurrentUser()).toBeNull();
  });

  it("AC-17: the role in the token is never read — an ADMIN claim on a YARD_STAFF row is staff", async () => {
    const { user } = await profile("YARD_STAFF");
    authMock.mockResolvedValue({ user: { id: user.id, role: "ADMIN" }, epoch: 0 });

    expect((await getCurrentUser())?.role).toBe("YARD_STAFF");
  });
});

describe("021 AC-24: a reset issues a fresh random PIN once, and ends the old one", () => {
  it("AC-24: the new PIN has the chosen length, is stored under the current pepper, and bumps the epoch", async () => {
    const admin = await profile("ADMIN");
    const staff = await profile("YARD_STAFF");

    for (const length of [4, 6] as const) {
      const before = await db.user.findUniqueOrThrow({ where: { id: staff.user.id } });

      const { profile: entry, newPin } = await resetProfilePin(admin.user, staff.user.id, length);

      expect(newPin).toHaveLength(length);
      expect(parsePin(newPin)).toBe(newPin);
      const after = await db.user.findUniqueOrThrow({ where: { id: staff.user.id } });
      expect(after.sessionEpoch).toBe(before.sessionEpoch + 1);
      expect(after.pinKeyId).toBe(currentPinKeyId());
      expect(await verifyPin(newPin, after.pinHash)).toBe(true);
      expect(entry).toMatchObject({ id: staff.user.id, credentialSet: true, credentialNeedsReset: false });
      expect(JSON.stringify(entry)).not.toContain(newPin);
      // AC-34: nothing the admin service returns is shaped like money.
      expect(deepKeys({ profile: entry, newPin }).filter((key) => MONEY_KEY.test(key))).toEqual([]);
    }
  });

  it("AC-24: the old PIN then fails as a wrong PIN, and the new one signs in", async () => {
    const admin = await profile("ADMIN");
    const staff = await profile("YARD_STAFF");

    const { newPin } = await resetProfilePin(admin.user, staff.user.id, 6);

    expect(await attemptSignIn(staff.user.username, staff.pin, device())).toEqual({
      outcome: "INCORRECT",
    });
    expect((await attemptSignIn(staff.user.username, newPin, device())).outcome).toBe("SIGNED_IN");
  });

  it("AC-24: it ends the lock and zeroes the failures, and keeps the level", async () => {
    const admin = await profile("ADMIN");
    const staff = await profile("YARD_STAFF");
    const key = accountKey(staff.user.username);
    await db.accountLock.create({
      data: {
        accountKey: key,
        consecutiveFailures: 3,
        level: 3,
        lockedUntil: new Date(Date.now() + 3_600_000),
      },
    });

    await resetProfilePin(admin.user, staff.user.id, 6);

    expect(
      await db.accountLock.findUnique({
        where: { accountKey: key },
        select: { consecutiveFailures: true, level: true, lockedUntil: true },
      }),
    ).toEqual({ consecutiveFailures: 0, level: 3, lockedUntil: null });
  });

  it("AC-24: no column of any User, AccountLock or AuthEvent row equals the new PIN", async () => {
    const admin = await profile("ADMIN");
    const staff = await profile("YARD_STAFF");
    await attemptSignIn(staff.user.username, generatePin(4), device());

    const { newPin } = await resetProfilePin(admin.user, staff.user.id, 6);

    const rows = [
      ...(await db.user.findMany()),
      ...(await db.accountLock.findMany()),
      ...(await db.authEvent.findMany()),
    ];
    for (const row of rows) {
      for (const value of Object.values(row)) {
        expect(String(value)).not.toBe(newPin);
      }
    }
  });

  it("AC-24: on a profile that is not ACTIVE it raises ConflictError with ONLY_ACTIVE_PIN_RESET and changes nothing", async () => {
    const admin = await profile("ADMIN");
    const leaver = await profile("YARD_STAFF");
    await db.user.update({
      where: { id: leaver.user.id },
      data: { status: "DEACTIVATED", pinHash: null, pinKeyId: null },
    });
    const before = await db.user.findUniqueOrThrow({ where: { id: leaver.user.id } });

    const error = await resetProfilePin(admin.user, leaver.user.id, 6).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as Error).message).toBe(ONLY_ACTIVE_PIN_RESET);
    expect(await db.user.findUniqueOrThrow({ where: { id: leaver.user.id } })).toEqual(before);
  });

  it("AC-22, for this function: a YARD_STAFF actor is Forbidden, no actor is Unauthorized, and nothing changes", async () => {
    const staff = await profile("YARD_STAFF");
    const before = await db.user.findUniqueOrThrow({ where: { id: staff.user.id } });

    const forbidden = await resetProfilePin(staff.user, staff.user.id, 6).catch((caught: unknown) => caught);
    const unauthorized = await resetProfilePin(null, staff.user.id, 6).catch((caught: unknown) => caught);

    expect(forbidden).toBeInstanceOf(ForbiddenError);
    expect((forbidden as Error).message).toBe("ADMIN is required for this action");
    expect(unauthorized).toBeInstanceOf(UnauthorizedError);
    expect(await db.user.findUniqueOrThrow({ where: { id: staff.user.id } })).toEqual(before);
  });
});
