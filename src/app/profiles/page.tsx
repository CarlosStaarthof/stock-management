import type { JSX } from "react";

import { requireAdminPage } from "@/app/page-guards";
import { IdentityHeader } from "@/components/IdentityHeader";
import { ActiveProfileActions } from "@/components/profiles/ActiveProfileActions";
import { ClearLockForm } from "@/components/profiles/ClearLockForm";
import { CreateProfileAdminForm } from "@/components/profiles/CreateProfileAdminForm";
import { PendingProfileActions } from "@/components/profiles/PendingProfileActions";
import { ResumeNewDevicesForm } from "@/components/profiles/ResumeNewDevicesForm";
import {
  ACCOUNT_LOCKED_LABEL,
  CREDENTIAL_NEEDS_RESET_LABEL,
  NEW_DEVICES_PAUSED_MESSAGE,
  NO_PENDING_PROFILES,
  PIN_FAILURES_SUMMARY,
  PROFILE_STATUS_LABELS,
} from "@/lib/auth-messages";
import { yardDate, yardDateTime } from "@/lib/profile-display";
import {
  listProfiles,
  pinFailureSummary,
  type ProfileListEntry,
} from "@/server/auth/profile-admin-service";

/**
 * PROFILES — the admin section (021 D4, D12, AC-21 to AC-26).
 *
 * `ADMIN` only, and the refusal is the SERVICE's: `requireAdminPage("profiles")` below, and
 * `assertRole` inside every function of `profile-admin-service.ts`. The middleware's entry
 * only turns a signed-out request away before anything renders (003 AC-16).
 *
 * EVERY PROFILE, `PENDING` FIRST, THEN OLDEST FIRST, with what an owner needs to notice an
 * attack rather than suffer one quietly (D12): the last day's incorrect PINs and whether
 * new devices are paused, and per profile its failures in the last 30 days, its lock while
 * locked, and whether its PIN predates the current pepper.
 *
 * A NEW PIN IS NEVER PART OF THIS PAGE. It is the return value of the action that drew it
 * and is rendered from that response only (AC-24), so a later `GET` of this page cannot
 * contain it.
 *
 * NO `loading.tsx` AT OR ABOVE THIS SEGMENT (AC-43): a Suspense boundary above a page turns
 * the server's `redirect()` into a `200` carrying a shell, and here the request that would
 * degrade is the staff refusal itself.
 *
 * NO MONEY (AC-34): nothing here reads a price, a value or a total.
 */
export const dynamic = "force-dynamic";

function ProfileRow({ profile }: { profile: ProfileListEntry }): JSX.Element {
  const shownUsername = profile.status === "PENDING" ? profile.requestedUsername : profile.username;
  const lock = profile.lock;

  return (
    <li
      data-testid={`profile-${profile.id}`}
      className="flex min-w-0 flex-col gap-2 rounded border border-slate-200 p-3"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p
          data-testid={`profile-name-${profile.id}`}
          className="text-base font-medium [overflow-wrap:anywhere]"
        >
          {profile.name}
        </p>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">{profile.status === "PENDING" ? "Requested username" : "Username"}</dt>
          <dd data-testid={`profile-username-${profile.id}`} className="[overflow-wrap:anywhere]">
            {shownUsername ?? "-"}
          </dd>
          <dt className="text-slate-500">Role</dt>
          <dd data-testid={`profile-role-${profile.id}`}>{profile.role}</dd>
          <dt className="text-slate-500">Status</dt>
          <dd data-testid={`profile-status-${profile.id}`}>{PROFILE_STATUS_LABELS[profile.status]}</dd>
          <dt className="text-slate-500">Created</dt>
          <dd data-testid={`profile-created-${profile.id}`}>
            <time dateTime={profile.createdAt}>{yardDate(profile.createdAt)}</time>
          </dd>
          <dt className="text-slate-500">Incorrect PINs, 30 days</dt>
          <dd data-testid={`failures-${profile.id}`}>{lock === null ? 0 : lock.failuresLast30Days}</dd>
        </dl>
      </div>

      {profile.credentialNeedsReset ? (
        <p
          data-testid={`needs-reset-${profile.id}`}
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {CREDENTIAL_NEEDS_RESET_LABEL}
        </p>
      ) : null}

      {lock !== null && lock.locked && lock.lockedUntil !== null ? (
        <div
          data-testid={`lock-${profile.id}`}
          className="flex flex-wrap items-center gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          <p>
            {ACCOUNT_LOCKED_LABEL}{" "}
            <time dateTime={lock.lockedUntil}>{yardDateTime(lock.lockedUntil)}</time>
          </p>
          <ClearLockForm id={profile.id} />
        </div>
      ) : null}

      {profile.status === "PENDING" && profile.requestedUsername !== null ? (
        <PendingProfileActions id={profile.id} requestedUsername={profile.requestedUsername} />
      ) : null}
      {profile.status === "ACTIVE" ? (
        <ActiveProfileActions
          id={profile.id}
          name={profile.name}
          role={profile.role}
          hasUsername={profile.username !== null}
        />
      ) : null}
    </li>
  );
}

export default async function ProfilesPage(): Promise<JSX.Element> {
  const user = await requireAdminPage("profiles");
  const [profiles, summary] = await Promise.all([listProfiles(user), pinFailureSummary(user)]);
  const anyPending = profiles.some((profile) => profile.status === "PENDING");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-6">
      <IdentityHeader
        name={user.name}
        heading={<h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>}
      />

      <section className="flex flex-col gap-2 rounded border border-slate-200 p-3">
        <p data-testid="pin-failures" className="text-sm">
          {PIN_FAILURES_SUMMARY(summary.newDevices, summary.knownDevices, summary.unknownUsernames)}
        </p>
        {summary.newDevicesPaused ? (
          <div data-testid="new-devices-paused" className="flex flex-col gap-2">
            <p className="text-sm font-medium text-red-800">{NEW_DEVICES_PAUSED_MESSAGE}</p>
            <ResumeNewDevicesForm />
          </div>
        ) : null}
      </section>

      {anyPending ? null : (
        <p data-testid="no-pending-profiles" className="text-sm text-slate-600">
          {NO_PENDING_PROFILES}
        </p>
      )}

      <ul data-testid="profile-list" className="flex flex-col gap-3">
        {profiles.map((profile) => (
          <ProfileRow key={profile.id} profile={profile} />
        ))}
      </ul>

      <section
        data-testid="create-profile-section"
        className="flex flex-col gap-3 rounded border border-slate-200 p-3"
      >
        <h2 className="text-lg font-semibold">Create a profile</h2>
        <CreateProfileAdminForm />
      </section>
    </main>
  );
}
