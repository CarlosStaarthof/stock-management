# 023 — Super Admin dashboard

**Feature id:** 23   **Status:** draft   **Depends on:** #21, #22

## Purpose

`/profiles` already lets an `ADMIN` see every profile, reset a PIN, deactivate a leaver and
change a role. What is missing is the owner's own screen: one place above `ADMIN` that can
also bring a deactivated profile back, that shows the lock state plainly, and that answers
"what has been signed off, for how much, by whom" without opening every count.

Without this feature the `SUPER_ADMIN` role from #22 has a home tile and no destination, and
the records the product now holds are readable only one count at a time.

## Owner's decisions

- **D1 — The dashboard is SUPER_ADMIN only.** It is a new route at `/dashboard`; no `ADMIN`
  or `YARD_STAFF` request receives any of its content. The service refuses below the page,
  so removing the middleware entry exposes nothing.
- **D2 — Reuse the profile rules; do not fork them.** Reset, role change, deactivation and
  the last-administrator guard are #21's `profile-admin-service` behaviour. This feature adds
  one operation it did not have — *activate* — and otherwise calls the same services. The
  tradeoff: the self-protection rule must live in the service, because `/profiles` can also
  be opened by a `SUPER_ADMIN`.
- **D3 — A record is a signed-off stock take, one row per approved count.** The records view
  lists `APPROVED` counts, one row per `StockCount` — which is one row per depot per stock
  take, matching the export's one depot file. A `DRAFT` or `PENDING_SIGN_OFF` count has no
  final value and no sign-off; a legacy `SUBMITTED` count has not been signed off yet but can
  still be approved once by an `ADMIN` or `SUPER_ADMIN` (#24), after which it appears like
  any other approved count. Tradeoff: the view answers "what is closed", not "what is in
  progress", and the calendar already answers the second question.
- **D4 — More record kinds are expected.** The view renders a common `DashboardRecord` shape
  from a list of sources. Adding a second kind (for example a truck reading later) is one
  source and no change to the page's JSX. Tradeoff: the shared shape is the narrow set of
  columns a record can show; a kind needing a different column needs a new decision.
- **D5 — Activating issues a fresh PIN.** Deactivation clears the PIN by #21's rule, so an
  activated profile cannot sign in without one. The activation response returns a newly
  generated PIN once, exactly as a reset does. Tradeoff: activation is never silent; the
  person at the screen must hand the PIN over.

## Owner rulings, 2026-11-17

- **R1 — `YARD_STAFF` never sees money and cannot sign off.** The dashboard is unaffected:
  it remains `SUPER_ADMIN` only, and no `ADMIN` or `YARD_STAFF` response contains its totals.
- **R2 — The #22 migration promotes `carlos-staarthof` only if that profile exists** and
  never creates one. The dashboard adds no migration and creates no profile.
- **R3 — One row per approved `StockCount`.** That is one per depot per stock take, matching
  the one-file-per-depot export. This answers the draft's Q1 and fixes D3 and AC-8.
- **R4 — Legacy `SUBMITTED` counts stay approvable once by an `ADMIN` or `SUPER_ADMIN`**,
  with no data conversion. They are absent from Records while `SUBMITTED` and appear once
  approved, carrying the approver and the approval instant. #24 owns that retained path.

## User stories

- As the `SUPER_ADMIN`, I see every profile with its role, its status and whether it is
  locked, so I can tell a leaver from a forgotten PIN.
- As the `SUPER_ADMIN`, I can reset one profile's PIN and read the new one once.
- As the `SUPER_ADMIN`, I can deactivate a leaver and activate someone who has come back.
- As the `SUPER_ADMIN`, I can move a profile between `ADMIN` and `YARD_STAFF` without making
  it a `SUPER_ADMIN`.
- As the `SUPER_ADMIN`, I cannot demote or deactivate myself, so the one account above
  `ADMIN` cannot disappear by a mis-click.
- As the `SUPER_ADMIN`, I can read one row per signed-off stock take with its depot, count
  date, total value, signer and sign-off time.

## Data touched

- **Read:** `User` (id, username, requestedUsername, name, role, status, createdAt, pinHash
  presence, pinKeyId), `AccountLock`, `AuthEvent` (failure counts), `StockCount` (approved
  only), `StockCountLine` and, once #24 lands, `StockCountOpenItem`.
- **Written:** `User` (role, status, pinHash, pinKeyId, sessionEpoch) and `AccountLock`
  through the existing profile-admin services; no new model, no new column, no migration.
- No monetary value is stored. A record's total is derived from line and open-item values.

## Contract

**Routes and guards**

| Route | Method | Access | Behaviour |
|---|---|---|---|
| `/dashboard` | GET | `SUPER_ADMIN` | Profiles section and Records section. `force-dynamic`; no `loading.tsx` at or above it. |
| `/dashboard` | POST (server actions) | `SUPER_ADMIN` in the service | Reset PIN, activate, deactivate, change role. |

`requireSuperAdminPage("dashboard")` is the page guard and sends an `ADMIN` or `YARD_STAFF`
request to `/home?denied=dashboard`; `assertSuperAdmin` is the first statement of every
dashboard service, so a direct call is a `ForbiddenError` naming `SUPER_ADMIN`.

**Services**

`src/server/dashboard/dashboard-service.ts`

| Export | Behaviour |
|---|---|
| `listDashboardProfiles(actor)` | Every profile, `PENDING` first and then oldest first, with id, username, requestedUsername, name, role, status and lock state. |
| `resetDashboardPin(actor, id, length)` | Calls #21's reset; returns `{ profile, newPin }`. |
| `deactivateDashboardProfile(actor, id)` | Calls #21's deactivation; refuses a `SUPER_ADMIN` target and the actor's own id. |
| `activateDashboardProfile(actor, id, length)` | `DEACTIVATED → ACTIVE` with a fresh PIN returned once; refuses every other status, a `SUPER_ADMIN` target and the actor's own id. |
| `changeDashboardRole(actor, id, role)` | `ACTIVE` target only; `role` must be `ADMIN` or `YARD_STAFF`; refuses a `SUPER_ADMIN` target and the actor's own id. |

`src/server/dashboard/record-service.ts`

| Export | Shape |
|---|---|
| `DashboardRecord` | `{ id, kind, depotName, countDate, totalValue, signedOffByName, signedOffAt }`; `totalValue` is a decimal string, `countDate` is `YYYY-MM-DD`, `signedOffAt` is an ISO instant or `null`. |
| `DASHBOARD_RECORD_SOURCES` | `{ kind: string; list: (actor) => Promise<DashboardRecord[]> }[]`, beginning with the `stock_take` source. |
| `listDashboardRecords(actor, sources?)` | Asserts `SUPER_ADMIN`, awaits every source, returns one flat array. Duplicate ids are a bug and throw. |

`listDashboardRecords` reads all approved counts and their lines in a bounded number of
queries; it never queries per row. The `stock_take` source reads `approvedBy` and
`approvedAt` as the sign-off. For a count created under #24 the signer and approver are the
same person and instant, so this is exactly the sign-off. For a legacy `SUBMITTED` count
approved through #24's retained path, `approvedBy`/`approvedAt` are the approver and the
approval instant — the act that closed the record — while the original `signedBy` stays
untouched. Its total is `Σ quantity × unitPriceSnapshot` for the count's lines, plus (after
#24) each open item's `quantity × unitPrice`, using the same decimal-string helpers as
`/summary`, `/analysis` and the export.

**Profile row**

| Field | Source |
|---|---|
| Name | `User.name` |
| Username | `User.username` for an active or deactivated row; `requestedUsername` for a pending one |
| Role | `User.role` |
| Status | `User.status`, as `PROFILE_STATUS_LABELS` |
| Lock | `AccountLock` for the profile's username: locked / not locked, `lockedUntil` when locked, and failures in the last 30 days |

A `PENDING` or `REJECTED` profile has no dashboard activation control: `PENDING` is handled
by #21's approval on `/profiles`, and `REJECTED` is not a profile until a new request is
made. A `SUPER_ADMIN` row has no role or status control at all.

**Records columns**

| Column | Value |
|---|---|
| Depot | `Location.name` for the count |
| Count date | `StockCount.countDate` |
| Total value | derived, formatted with the product's euro formatter |
| Signed off by | `User.name` of `approvedById` |
| Signed off at | `approvedAt`, in the yard's display format |

Rows are ordered by `countDate` descending, then depot name. The section renders its empty
state when there is no approved count.

## UI states

- **Ordinary:** a Profiles section and a Records section, both server-rendered. Every profile
  row names its lock state; the records section names its five columns.
- **Empty records:** one sentence saying nothing has been signed off yet; the profile section
  still renders.
- **New PIN:** the generated PIN and the profile name are shown once, in the response that
  generated them, with a control to dismiss. A later `GET` of `/dashboard` never contains
  the PIN, and the PIN is never in a URL, a log, a cookie or a stored field.
- **Refused action:** the typed domain message is shown beside the row it concerns; no stack
  trace and no database error text.
- **Refused session:** `ADMIN` and `YARD_STAFF` are redirected to
  `/home?denied=dashboard`, and the response contains no profile or record content.
- **Phone width:** at 390 px the profile rows, the actions and the records table are usable
  without the document scrolling sideways; the records table may scroll inside its own box.

## Acceptance criteria

**AC-1 — SUPER_ADMIN only, at the page and at the service.** A `SUPER_ADMIN` GET of
`/dashboard` answers `200` and contains the Profiles and Records sections. An `ADMIN` or
`YARD_STAFF` GET answers a `307` to `/home?denied=dashboard` and the body contains no profile
name, username, role, status, lock, depot, count date, value or signer. Each dashboard service
called directly with an `ADMIN` or `YARD_STAFF` actor throws `ForbiddenError` before reading
any row. `/dashboard` is in `PROTECTED_PATHS` and the middleware matcher. *Proved by*
`tests/e2e/dashboard-access.spec.ts` and `src/server/dashboard/dashboard-service.db.test.ts`.

**AC-2 — Every profile is listed with role, status and lock state.** With three fixtures — an
active unlocked `ADMIN`, a deactivated profile whose username has a lock row, and a pending
request — the Profiles section lists all three. Each row shows the name, the correct username
(or requested username), the role, the status label and a lock state; the locked row names
its `lockedUntil` and a non-locked row does not. `PENDING` rows come first. A row with no lock
row reads as not locked with zero recent failures. *Proved by*
`tests/e2e/dashboard-profiles.spec.ts` and the service test.

**AC-3 — Reset PIN returns one new PIN and ends the old sessions.** Resetting an active
profile's PIN returns a PIN that is not the old one, the old PIN no longer signs in, a session
obtained with the old PIN is refused on its next request, and the new PIN signs in. The new
PIN appears once in the action's response, and a later `GET /dashboard` contains neither it
nor its hash. The profile's lock is cleared and its failure count zeroed. Resetting a
non-active profile is refused with #21's message. *Proved by*
`tests/e2e/dashboard-profiles.spec.ts` and `src/server/dashboard/dashboard-service.db.test.ts`.

**AC-4 — Deactivation is a leaver's exit, and the SUPER_ADMIN cannot take it.** Deactivating
an `ACTIVE` `ADMIN` or `YARD_STAFF` sets `DEACTIVATED`, clears `pinHash` and `pinKeyId`, keeps
the username, and ends any session the profile holds on its next request. Deactivating an
already deactivated profile is refused. Deactivating the `SUPER_ADMIN`, whether the actor is
that profile or a direct service call, is refused and leaves role and status unchanged. The
last active `ADMIN` remains protected by #21's existing rule. *Proved by*
`tests/e2e/dashboard-profiles.spec.ts` and the service test.

**AC-5 — Activation gives a deactivated profile a fresh PIN.** Activating a `DEACTIVATED`
profile sets it `ACTIVE`, keeps its username, increments its `sessionEpoch`, clears any lock,
and returns one newly generated PIN that signs in; a later `GET` does not contain it. The
activated profile keeps its role. Activating a `PENDING`, `REJECTED`, already `ACTIVE` or
`SUPER_ADMIN` profile is refused with a typed `ConflictError`, and the row is unchanged.
*Proved by* `tests/e2e/dashboard-profiles.spec.ts` and
`src/server/dashboard/dashboard-service.db.test.ts`.

**AC-6 — Role changes are only between ADMIN and YARD_STAFF.** Changing an `ACTIVE` profile
between `ADMIN` and `YARD_STAFF` writes the new role, takes effect on the profile's next
request, and leaves `SUPER_ADMIN` unreachable. A forged request for `SUPER_ADMIN`, a request
for an unknown role, a target that is not `ACTIVE` and a target that is already
`SUPER_ADMIN` are each refused; no row changes. The last active `ADMIN` rule of #21 still
applies when the target is an `ADMIN`. *Proved by*
`tests/e2e/dashboard-profiles.spec.ts` and `src/server/dashboard/dashboard-service.db.test.ts`.

**AC-7 — Self-protection is in the service, not only on the dashboard page.** A
`SUPER_ADMIN` actor cannot change its own role, deactivate itself or activate itself through
the dashboard **or** through `/profiles`: each refusal is a typed error, and the actor's row
still has role `SUPER_ADMIN` and status `ACTIVE` afterwards. A reset of its own PIN is
allowed. A second `SUPER_ADMIN` cannot be created or promoted by either surface, so the row
protected here is the only one. *Proved by* `src/server/dashboard/dashboard-service.db.test.ts`,
`src/server/auth/profile-admin-service.db.test.ts` and `tests/e2e/dashboard-profiles.spec.ts`.

**AC-8 — The records view is one row per approved StockCount.** For two approved counts at
different depots and dates, the Records section shows exactly two rows, ordered newest count
date first, with the depot name, the count date, the exact derived total, the signer's name
and the sign-off instant. That is one row per depot per stock take, matching the export's one
file per depot; two counts at the same depot and different dates are two rows, and a count is
never split by line. The total equals the sum of the count's exact line values, formatted
once for display; a count with no lines totals zero and is still a row. A `DRAFT`,
`PENDING_SIGN_OFF` or still-`SUBMITTED` legacy count is not listed; a legacy `SUBMITTED` count
approved once after #24 appears with its approver and approval instant (R4). A signed-off
count whose `approvedById` is null is shown with a missing-signer marker rather than being
hidden. *Proved by* `tests/e2e/dashboard-records.spec.ts` and
`src/server/dashboard/record-service.db.test.ts`.

**AC-9 — More record kinds need no page change.** `DASHBOARD_RECORD_SOURCES` is an exported
array of sources, each with a `kind` and a `list`. `listDashboardRecords` returns the flat
concatenation of every source's rows and throws on a duplicate id. A unit test supplies a
second fake source and gets its rows beside the stock-take rows; the page imports no
`@/server/db`, no `@prisma/client` and no service other than the record list, and renders
whatever the common shape contains. *Proved by*
`src/server/dashboard/record-service.test.ts` and a source scan in
`tests/unit/dashboard-contract.test.ts`.

**AC-10 — The dashboard's writes are POSTs with typed refusals, and a PIN never travels in a
URL.** Every profile action is a form POST to a server action; a `GET` of `/dashboard` writes
nothing. Each refusal is a `ValidationError`, `ConflictError` or `ForbiddenError` rendered as
a sentence beside the row; no Prisma text reaches the page. The new PIN is in the action's
response only. No dashboard module logs a PIN, a hash, an account key or a cookie. *Proved
by* `tests/e2e/dashboard-profiles.spec.ts` and `tests/unit/dashboard-contract.test.ts`.

**AC-11 — The dashboard adds no schema, no migration and no money to any other role.**
`git diff` over `prisma/` is empty, `TRUNCATED_TABLES` is unchanged, and no migration is
created. An `ADMIN` response never contains a dashboard total or a records row. The existing
`/profiles` page keeps its content for an `ADMIN`, and gains only the `SUPER_ADMIN` access
that #22 grants. *Proved by* `tests/unit/dashboard-contract.test.ts`,
`tests/e2e/dashboard-access.spec.ts` and the recorded diff.

**AC-12 — Empty, error and phone states exist.** With no approved count, the Records section
renders its empty sentence and the Profiles section still renders. A failed action renders
its message and leaves the row readable. At 390 px the profile controls and the records table
are reachable without horizontal document scrolling. *Proved by*
`tests/e2e/dashboard-profiles.spec.ts` at 390 px and a unit test of the empty records
renderer.

**AC-13 — The gate is green in full.** `npx prisma validate`, `npm run typecheck`,
`npm run lint`, `npm run test:unit`, `npx prisma migrate status`, `npm run test:db` and
`npm run test:e2e` pass; `./init.sh` ends with `[OK] Environment ready` having **executed** the
database checks. `git status --porcelain -- Samples` is empty. *Proved by* the recorded gate
run in `progress/impl_super_admin_dashboard.md`.

## Out of scope

- Creating, approving or rejecting a profile request. Those stay on `/profiles` for an
  `ADMIN` or above.
- Resetting another profile's password, changing a display name, or deleting a profile.
- A history of profile changes, an audit log of dashboard actions, or a second super
  administrator.
- Anything a `YARD_STAFF` or `ADMIN` can see from the dashboard. Refusal is the whole
  answer for both.
- A dashboard chart, a trend, or a comparison between periods.
- Exporting the records view.
- Any new record kind beyond the stock-take source. D4 defines how one would be added.

## Open questions

- **Q1:** For a legacy `SUBMITTED` count approved after #24, should the Records row name the
  original signer or the approver who closed it? This spec follows the five requested
  columns and names the approver, because that is who signed it off in the product's current
  sense.
- **Q2:** Should activating a deactivated profile reuse the existing PIN if it survived, or
  always issue a new one? #21 clears the PIN on deactivation, so this spec always issues a
  new one.
- **Q3:** Should an `ADMIN` be able to see the records view without the profile controls (a
  narrower read-only dashboard)? This spec keeps the whole dashboard `SUPER_ADMIN` only.

*Dependency note:* #24 adds `PENDING_SIGN_OFF` and open items, and makes sign-off an
`ADMIN`/`SUPER_ADMIN` act. #23's records source is written against the common total helper
so that #24 changes the helper and the status filter, not the dashboard's columns or row
model. Legacy `SUBMITTED` rows remain approvable and appear once approved (R4).
