import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LAST_ADMIN_MESSAGE, PIN_FORMAT_MESSAGE, USERNAME_TAKEN_MESSAGE } from "@/lib/auth-messages";
import { generatePin } from "@/server/auth/credential-rules";
import type { SessionUser } from "@/server/auth/session-user";
import { ConflictError, ForbiddenError, UnauthorizedError } from "@/server/errors";

import {
  approveProfileAction,
  changeProfileRoleAction,
  clearAccountLockAction,
  createProfileAction,
  deactivateProfileAction,
  rejectProfileAction,
  resetProfilePinAction,
  resumeNewDeviceSignInAction,
} from "./actions";
import {
  INITIAL_CREATE_PROFILE_ADMIN_STATE,
  INITIAL_NEW_PIN_STATE,
  INITIAL_PROFILE_FORM_STATE,
} from "./form-state";

/**
 * The admin section's eight actions with no database (021 AC-22, AC-24, AC-25): each hands
 * the SESSION's profile — never a form field — to exactly one service, which is the one that
 * refuses; a refused session is redirected where the page would send it; a domain error
 * becomes the form's one message; and a new PIN is in the returned state and on no console.
 *
 * The services are mocked here; `profile-admin-service.db.test.ts` proves them against
 * Postgres. `next/navigation` is the real one, so a redirect is what Next itself throws.
 */
const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  revalidatePath: vi.fn(),
  approveProfile: vi.fn(),
  rejectProfile: vi.fn(),
  changeProfileRole: vi.fn(),
  resetProfilePin: vi.fn(),
  deactivateProfile: vi.fn(),
  clearAccountLock: vi.fn(),
  createProfile: vi.fn(),
  resumeNewDeviceSignIn: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/auth/profile-admin-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/profile-admin-service")>();
  return {
    ROLE_REQUIRED_MESSAGE: actual.ROLE_REQUIRED_MESSAGE,
    approveProfile: mocks.approveProfile,
    rejectProfile: mocks.rejectProfile,
    changeProfileRole: mocks.changeProfileRole,
    resetProfilePin: mocks.resetProfilePin,
    deactivateProfile: mocks.deactivateProfile,
    clearAccountLock: mocks.clearAccountLock,
    createProfile: mocks.createProfile,
    resumeNewDeviceSignIn: mocks.resumeNewDeviceSignIn,
  };
});

const SERVICES = [
  "approveProfile",
  "rejectProfile",
  "changeProfileRole",
  "resetProfilePin",
  "deactivateProfile",
  "clearAccountLock",
  "createProfile",
  "resumeNewDeviceSignIn",
] as const;

const admin: SessionUser = { id: "admin-id", username: "owner", name: "Owner", role: "ADMIN" };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

function digestOf(error: unknown): string {
  return typeof error === "object" && error !== null && "digest" in error
    ? String((error as { digest: unknown }).digest)
    : "";
}

/** Every action, with a form carrying a forged actor alongside its real fields. */
const ACTIONS: [string, (typeof SERVICES)[number], () => Promise<unknown>][] = [
  [
    "approve",
    "approveProfile",
    () =>
      approveProfileAction(
        INITIAL_PROFILE_FORM_STATE,
        form({ id: "p1", role: "YARD_STAFF", username: "kname", actor: "forged", userId: "forged" }),
      ),
  ],
  ["reject", "rejectProfile", () => rejectProfileAction(INITIAL_PROFILE_FORM_STATE, form({ id: "p1", actor: "forged" }))],
  [
    "change role",
    "changeProfileRole",
    () => changeProfileRoleAction(INITIAL_PROFILE_FORM_STATE, form({ id: "p1", role: "ADMIN", actor: "forged" })),
  ],
  [
    "reset",
    "resetProfilePin",
    () => resetProfilePinAction(INITIAL_NEW_PIN_STATE, form({ id: "p1", length: "6", actor: "forged" })),
  ],
  [
    "deactivate",
    "deactivateProfile",
    () => deactivateProfileAction(INITIAL_PROFILE_FORM_STATE, form({ id: "p1", actor: "forged" })),
  ],
  [
    "clear lock",
    "clearAccountLock",
    () => clearAccountLockAction(INITIAL_PROFILE_FORM_STATE, form({ id: "p1", actor: "forged" })),
  ],
  [
    "create",
    "createProfile",
    () =>
      createProfileAction(
        INITIAL_CREATE_PROFILE_ADMIN_STATE,
        form({ name: "New", username: "knew", role: "ADMIN", length: "4", actor: "forged" }),
      ),
  ],
  ["resume", "resumeNewDeviceSignIn", () => resumeNewDeviceSignInAction(INITIAL_PROFILE_FORM_STATE)],
];

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getCurrentUser.mockResolvedValue(admin);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("021 AC-22: the actions hand the session's profile to one service, which refuses", () => {
  it("AC-22: each of the eight actions calls exactly its one service, with the session's profile as the actor", async () => {
    expect(ACTIONS).toHaveLength(8);
    mocks.resetProfilePin.mockResolvedValue({ profile: { name: "P" }, newPin: generatePin(6) });
    mocks.createProfile.mockResolvedValue({ profile: { name: "P" }, newPin: generatePin(4) });

    const argumentsOf = new Map<string, unknown[]>();
    for (const [label, service, run] of ACTIONS) {
      for (const name of SERVICES) mocks[name].mockClear();

      await run();

      for (const name of SERVICES) {
        expect(mocks[name].mock.calls.length, `${label}: ${name}`).toBe(name === service ? 1 : 0);
      }
      expect(mocks[service].mock.calls[0]?.[0], label).toBe(admin);
      argumentsOf.set(service, mocks[service].mock.calls[0] ?? []);
    }
    expect(argumentsOf.get("approveProfile")).toEqual([admin, "p1", "YARD_STAFF", "kname"]);
    expect(argumentsOf.get("changeProfileRole")).toEqual([admin, "p1", "ADMIN"]);
    expect(argumentsOf.get("resetProfilePin")).toEqual([admin, "p1", 6]);
    expect(argumentsOf.get("createProfile")).toEqual([
      admin,
      { name: "New", username: "knew", role: "ADMIN", length: 4 },
    ]);
    expect(argumentsOf.get("resumeNewDeviceSignIn")).toEqual([admin]);
  });

  it("AC-22: a staff session the service refuses is sent to /stock-entry?denied=profiles, and no session to sign in", async () => {
    for (const [label, service, run] of ACTIONS) {
      mocks[service].mockRejectedValueOnce(new ForbiddenError("ADMIN is required for this action"));
      expect(digestOf(await run().catch((error: unknown) => error)), label).toMatch(
        /^NEXT_REDIRECT;\w+;\/stock-entry\?denied=profiles;/,
      );

      mocks[service].mockRejectedValueOnce(new UnauthorizedError());
      expect(digestOf(await run().catch((error: unknown) => error)), label).toMatch(
        /^NEXT_REDIRECT;\w+;\/sign-in\?reason=inactive;/,
      );
    }
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("AC-21, AC-23: a domain error becomes the form's one message, and nothing is revalidated", async () => {
    mocks.approveProfile.mockRejectedValueOnce(new ConflictError(USERNAME_TAKEN_MESSAGE("kname")));
    mocks.changeProfileRole.mockRejectedValueOnce(new ConflictError(LAST_ADMIN_MESSAGE));

    const approved = await approveProfileAction(
      INITIAL_PROFILE_FORM_STATE,
      form({ id: "p1", role: "YARD_STAFF", username: "kname" }),
    );
    const demoted = await changeProfileRoleAction(
      INITIAL_PROFILE_FORM_STATE,
      form({ id: "p1", role: "YARD_STAFF" }),
    );

    expect(approved).toEqual({ error: USERNAME_TAKEN_MESSAGE("kname"), attempt: 1 });
    expect(demoted).toEqual({ error: LAST_ADMIN_MESSAGE, attempt: 1 });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("AC-22: a success revalidates /profiles, and an error that is not a domain error is not turned into a message", async () => {
    mocks.rejectProfile.mockResolvedValueOnce({});
    expect(await rejectProfileAction(INITIAL_PROFILE_FORM_STATE, form({ id: "p1" }))).toEqual({
      error: null,
      attempt: 1,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/profiles");

    const bug = new Error("not a domain error");
    mocks.rejectProfile.mockRejectedValueOnce(bug);
    expect(await rejectProfileAction(INITIAL_PROFILE_FORM_STATE, form({ id: "p1" })).catch((error: unknown) => error)).toBe(bug);
  });

  it("AC-24, AC-25: a length that is not 4 or 6 is refused with PIN_FORMAT_MESSAGE before any service is called", async () => {
    for (const length of ["", "5", "four"]) {
      expect(
        (await resetProfilePinAction(INITIAL_NEW_PIN_STATE, form({ id: "p1", length }))).error,
      ).toBe(PIN_FORMAT_MESSAGE);
      expect(
        (
          await createProfileAction(
            INITIAL_CREATE_PROFILE_ADMIN_STATE,
            form({ name: "N", username: "kname", role: "ADMIN", length }),
          )
        ).error,
      ).toBe(PIN_FORMAT_MESSAGE);
    }
    expect(mocks.resetProfilePin).not.toHaveBeenCalled();
    expect(mocks.createProfile).not.toHaveBeenCalled();
  });
});

describe("021 AC-24, AC-25, AC-33: a new PIN is returned once, in the action's state, and printed nowhere", () => {
  it("AC-24, AC-25: reset and create return the PIN with the profile's name, and print it to no console", async () => {
    const printed: string[] = [];
    for (const method of ["log", "info", "warn", "error"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        printed.push(args.map(String).join(" "));
      });
    }
    const resetPin = generatePin(6);
    const createdPin = generatePin(4);
    const name = `Person ${randomBytes(4).toString("hex")}`;
    mocks.resetProfilePin.mockResolvedValue({ profile: { name }, newPin: resetPin });
    mocks.createProfile.mockResolvedValue({ profile: { name }, newPin: createdPin });

    const reset = await resetProfilePinAction(INITIAL_NEW_PIN_STATE, form({ id: "p1", length: "6" }));
    const created = await createProfileAction(
      INITIAL_CREATE_PROFILE_ADMIN_STATE,
      form({ name, username: "kname", role: "YARD_STAFF", length: "4" }),
    );

    expect(reset).toEqual({ error: null, attempt: 1, newPin: resetPin, pinFor: name });
    expect(created).toEqual({ error: null, attempt: 1, newPin: createdPin, pinFor: name, name: "", username: "" });
    expect(printed.filter((line) => line.includes(resetPin) || line.includes(createdPin))).toEqual([]);
  });

  it("AC-25: a refused creation keeps the name and username and carries no PIN", async () => {
    mocks.createProfile.mockRejectedValueOnce(new ConflictError(USERNAME_TAKEN_MESSAGE("kname")));

    const refused = await createProfileAction(
      INITIAL_CREATE_PROFILE_ADMIN_STATE,
      form({ name: "Somebody", username: "kname", role: "YARD_STAFF", length: "6" }),
    );

    expect(refused).toEqual({
      error: USERNAME_TAKEN_MESSAGE("kname"),
      attempt: 1,
      newPin: null,
      pinFor: null,
      name: "Somebody",
      username: "kname",
    });
  });
});
