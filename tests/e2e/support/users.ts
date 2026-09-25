import { randomBytes } from "node:crypto";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { generatePin } from "@/server/auth/credential-rules";
import { createActiveProfile } from "@/server/auth/operator-service";
import {
  accountKey,
  CredentialSecretError,
  currentPinKeyId,
  signDeviceToken,
  verifyDeviceToken,
} from "@/server/auth/password";
import type { Role } from "@/server/auth/roles";
import { DEVICE_COOKIE } from "@/server/auth/sign-in-codes";
import { db } from "@/server/db";

/**
 * Profiles for the end-to-end specs, created through the operator service — no fixture SQL,
 * no second definition of what a profile is (021 AC-40).
 *
 * These specs run against the DEVELOPMENT database, because that is the one the server
 * under test is connected to. So every profile they create is deleted again by
 * `removeUser`, and every username is unique per run.
 *
 * PINs are drawn at runtime by `generatePin`, never written down (021 AC-8). The served
 * build and this process read the same `.env`, so a PIN hashed here under `PIN_PEPPER`
 * verifies there, and a device token signed here under `AUTH_SECRET` is known there.
 */
export type TestUser = {
  id: string;
  username: string;
  name: string;
  pin: string;
  role: Role;
};

/**
 * With no usable `PIN_PEPPER` no profile can hold a PIN, so a spec that needs one skips —
 * annotated, because silence would let a missing secret look like a passing suite (the
 * same rule as `skipWithoutDatabase`).
 */
function skipWithoutPepper(): void {
  try {
    currentPinKeyId();
  } catch (error) {
    if (!(error instanceof CredentialSecretError)) throw error;
    test.info().annotations.push({ type: "skip", description: "PIN_PEPPER is not set" });
    test.skip(true, "PIN_PEPPER is not set");
  }
}

export async function createTestUser(role: Role, label = "e2e"): Promise<TestUser> {
  skipWithoutPepper();

  const username = `e2e-${randomBytes(10).toString("hex")}`;
  const name = `${label}-${randomBytes(8).toString("hex")}`;
  const pin = generatePin(6);

  const user = await createActiveProfile({ name, username, role, pin });

  return { id: user.id, username, name, pin, role };
}

/**
 * Deletes a test profile, with the lock row and the failures its username's key collected,
 * so a run leaves nothing of itself behind in the development database.
 */
export async function removeUser(username: string): Promise<void> {
  const key = accountKey(username);
  await db.authEvent.deleteMany({ where: { accountKey: key } });
  await db.accountLock.deleteMany({ where: { accountKey: key } });
  await db.user.deleteMany({ where: { username } });
}

/** What deactivating a leaver does (021 S14): DEACTIVATED, PIN cleared, username kept. */
export async function deactivate(username: string): Promise<void> {
  await db.user.update({
    where: { username },
    data: { status: "DEACTIVATED", pinHash: null, pinKeyId: null },
  });
}

/** The stored hash, so a test can assert no response body contains it (021 AC-33). */
export async function storedPinHash(username: string): Promise<string> {
  const row = await db.user.findUniqueOrThrow({
    where: { username },
    select: { pinHash: true },
  });
  if (row.pinHash === null) {
    throw new Error(`test profile ${username} holds no PIN hash`);
  }
  return row.pinHash;
}

/**
 * A known device for this context: a token signed now, for a fresh random id (021 AC-40).
 * Every spec's attempts then draw on that device's own budget, never on the one every new
 * device on the internet shares — which the development database's real users depend on.
 *
 * Returns the device's budget bucket, so a spec that records failures can remove them.
 */
export async function addKnownDevice(page: Page): Promise<string> {
  const origin = new URL(page.url()).origin;
  const token = signDeviceToken(null);
  await page.context().addCookies([{ name: DEVICE_COOKIE, value: token, url: origin }]);
  return `pin:device:${verifyDeviceToken(token) ?? "none"}`;
}

/** Deletes the failures recorded in the buckets of devices a spec minted. */
export async function forgetDevices(buckets: readonly string[]): Promise<void> {
  if (buckets.length === 0) return;
  await db.authEvent.deleteMany({ where: { bucket: { in: [...buckets] } } });
}

/** Types the username and the PIN and submits, asserting nothing about where it lands. */
export async function enterCredentials(page: Page, user: TestUser): Promise<void> {
  await page.getByLabel("Username").fill(user.username);
  await page.getByLabel("PIN", { exact: true }).fill(user.pin);
  await page.getByTestId("sign-in-submit").click();
}

/** Signs in through the form, exactly as a person does, from a known device. */
export async function signIn(page: Page, user: TestUser, from = "/sign-in"): Promise<void> {
  await page.goto(from);
  await addKnownDevice(page);
  await enterCredentials(page, user);

  // Two waits, so a failure says which half went wrong: the redirect, or the page.
  //
  // The numbers came down with the rest of them under 006 AC-35: the suite serves a
  // production build now, so there is no on-demand route compilation to wait through, and
  // a wait longer than the test's own 45 s budget could never have fired anyway.
  await page.waitForURL((url) => url.pathname !== "/sign-in", { timeout: 20_000 });
  await expect(page.getByTestId("signed-in-name")).toHaveText(user.name, { timeout: 15_000 });
}
