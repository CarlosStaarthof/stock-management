# 022 — Roles, home menu and export price format

**Feature id:** 22   **Status:** draft   **Depends on:** #3, #6, #11, #12, #21

## Purpose

Two roles have served the product until now: `YARD_STAFF` counts and `ADMIN` sees money. The
owner now needs a role above `ADMIN` that can administer profiles and see the whole record
without a second person, and every role needs one place to start from instead of landing
directly on the calendar or the history screen.

The Excel export is the other half of the same problem. Its `Price` column is currently a
formatted string, so a reader cannot sort it, sum it or use it as a price. A workbook that
exists to replace the old spreadsheet must not put money in a text cell.

## Owner's decisions

- **D1 — One role above ADMIN.** `SUPER_ADMIN` is added to the role enum, above `ADMIN` and
  `YARD_STAFF`. A single `isAdminOrAbove` predicate decides the existing administrator
  surfaces; there is no second permission system. Tradeoff: every existing `ADMIN` guard is
  touched once, and a missed guard is a security defect, so the role matrix is tested.
- **D2 — One super administrator, set by migration, never created by it.** At most one
  profile holds `SUPER_ADMIN`, with the username `carlos-staarthof`. The role is written by
  a migration, never by a screen, an API or a seed. The migration promotes the existing row
  if it exists and does nothing if it does not; it never inserts a profile. Tradeoff: if the
  profile is missing at deploy time there is no `SUPER_ADMIN` until the owner creates it and
  a later migration promotes it; its PIN, when present, is set with `npm run pin:reset`.
- **D3 — The home menu is the landing.** After sign-in every role lands on `/home` unless a
  valid `callbackUrl` was supplied. The calendar is no longer the automatic landing.
  Tradeoff: every existing sign-in test moves one navigation further on.
- **D4 — The calendar keeps its addresses, and the tile resolves per role.** The two
  existing calendars keep their URLs: `/stock-entry` stays the counting calendar and
  `/stock-takes` stays the history calendar where an administrator finds what needs
  approving. The *Stock Calendar* home tile therefore resolves per role: `YARD_STAFF` →
  `/stock-entry`, `ADMIN` and `SUPER_ADMIN` → `/stock-takes`, mirroring today's landing (staff
  count in one tap; administrators review first). No URL moves,
  so every shipped count link and calendar test stays. Tradeoff: one tile label opens two
  different screens depending on role, and an administrator no longer lands on the calendar
  automatically (D3) but reaches the history/approvals calendar in one tap. This is a
  clarification recorded at review, not new scope. *(Clarified 2026-11-17 after review; see
  also Q2.)*
- **D5 — Money visibility is a role rule with no exception.** `ADMIN` and `SUPER_ADMIN` see
  prices; `YARD_STAFF` sees no price, value or total on any surface, including the review and
  sign-off of a count. `YARD_STAFF` cannot sign off. Feature #24 implements the two-step
  finish-then-sign-off flow this requires; it does not create a staff money exception.
- **D6 — Export prices are numbers.** Column E is a numeric cell with a euro number format,
  not a formatted string. Tradeoff: a workbook test now reads `cell.value` as a number and
  `cell.numFmt` for the currency, rather than reading cell text.

## Owner rulings, 2026-11-17

- **R1 — `YARD_STAFF` never sees money and cannot sign off.** No price, value or total on
  any staff surface, at sign-off included. A `YARD_STAFF` counter finishes the count and an
  `ADMIN` or `SUPER_ADMIN` prices the open items and signs it off. When an `ADMIN` or
  `SUPER_ADMIN` counts, review, pricing and sign-off remain one step for that same person.
  This replaces the draft's allowance in D5 for a review-only exception and is implemented
  by #24.
- **R2 — The migration promotes; it never creates.** If `carlos-staarthof` exists its role
  becomes `SUPER_ADMIN`; if it does not the migration does nothing. It never inserts a
  profile. This replaces the draft AC-2 behaviour that created the row when absent.
- **R3 — A record is one approved `StockCount`**, one per depot per stock take, matching the
  export's one file per depot. Recorded and implemented in #23; this spec is unchanged.
- **R4 — Legacy `SUBMITTED` counts stay approvable once by an `ADMIN` or `SUPER_ADMIN`**,
  with no data conversion. #24 owns the retained legacy path; the `isAdminOrAbove` predicate
  in this spec is what lets `SUPER_ADMIN` use it.

## User stories

- As the owner, I sign in and choose the section I want from one menu, instead of being
  dropped on whichever screen my role happened to land on.
- As the owner, the migration makes my existing `carlos-staarthof` profile the only
  super administrator, without creating a second profile.
- As a `YARD_STAFF` user, I see the calendar and can start a count, I am not offered
  Export, Stock or Dashboard, and I never see a price or total.
- As an `ADMIN`, I see Export and Stock beside the calendar, and every price those screens
  already showed me.
- As the `SUPER_ADMIN`, I see the Dashboard tile as well, and I am treated as an
  administrator by every existing admin-only page and service.
- As an accountant reading the export, I can sort and sum the `Price` column because it is a
  number displayed in euros.

## Data touched

- `prisma/schema.prisma`: `Role` gains `SUPER_ADMIN`. No other model changes.
- Two migrations, in this order:
  1. add the enum value `SUPER_ADMIN`;
  2. promote the existing `carlos-staarthof` profile, if any, and insert nothing.
- `User` is written only by migration 2, and only when that row already exists. No new
  table and no new column. `TRUNCATED_TABLES` is unchanged.
- No stock-domain model, count, line, price or item is touched.

## Contract

**Role module** (`src/server/auth/roles.ts`)

| Export | Shape |
|---|---|
| `ROLES` | `["YARD_STAFF", "ADMIN", "SUPER_ADMIN"]` |
| `Role` | the union of `ROLES` |
| `isRole` | `(value: unknown) => value is Role` |
| `isAdminOrAbove` | `(role: Role) => boolean` — true for `ADMIN` and `SUPER_ADMIN`, false for `YARD_STAFF` |

`src/server/auth/guards.ts` gains an admin-or-above assertion beside the existing
`assertUser`/`assertRole`; every existing administrator gate uses it rather than comparing
the role itself. `requireAdminPage` and `shapeForRole` use the same predicate, so a
`SUPER_ADMIN` gets the admin shape and a `YARD_STAFF` still gets the staff shape.

The profile-admin services additionally protect the `SUPER_ADMIN` row itself, because the
admin-or-above guard now lets an `ADMIN` reach every service: `changeProfileRole`,
`deactivateProfile`, `resetProfilePin`, `clearAccountLock`, `approveProfile` and
`rejectProfile` refuse a target whose current role is `SUPER_ADMIN` with a typed error and
leave the row unchanged, except a `SUPER_ADMIN` resetting its own PIN. The target role is
re-read and locked inside the service transaction, so a missed page guard cannot turn an
`ADMIN` into the `SUPER_ADMIN` by resetting and reading its PIN (AC-3).

**Routes**

| Route | Access | Behaviour |
|---|---|---|
| `/home` | any signed-in profile | The one menu. Added to `PROTECTED_PATHS` and the middleware matcher. |
| `/stock-entry` | any signed-in profile | The existing calendar and count entry, unchanged. |
| `/analysis/export` | admin or above | The existing export listing, unchanged apart from the file's price cell. |
| `/item-master` | admin or above | The existing item master, where items and prices are managed. |
| `/dashboard` | `SUPER_ADMIN` only | Delivered by #23. #22 owns the home tile and the route's place in the protected list. |

**Landing**

`landingPathForRole(role)` returns `"/home"` for every member of the union. The type is still
total over the roles, so adding a fourth role without deciding its landing is a type error.
`src/app/auth-actions.ts` still honours `safeCallbackPath` before the landing.

**Home tiles**

| Test id | Label | Href | `YARD_STAFF` | `ADMIN` | `SUPER_ADMIN` |
|---|---|---|---|---|---|
| `home-calendar` | Stock Calendar | `/stock-entry` for `YARD_STAFF`; `/stock-takes` for `ADMIN`/`SUPER_ADMIN` | yes | yes | yes |
| `home-export` | Export | `/analysis/export` | no | yes | yes |
| `home-stock` | Stock | `/item-master` | no | yes | yes |
| `home-dashboard` | Dashboard | `/dashboard` | no | no | yes |

Count entry remains reachable from `/stock-entry` exactly as today (an empty day, `Start a
count`, or a count badge); the home menu adds no second entry path. The history and
approval calendar remains at `/stock-takes` exactly as #10 shipped it, and the administrator
reaches it from the *Stock Calendar* tile (D4).

**Export**

`src/lib/excel/workbook-writer.ts` writes column E from `ExportRow.currentPrice` as a
number. The number format is `"€"#,##0.00`. A row with no current price writes no value
(blank), never an empty string. The Value and TOTAL cells are unchanged.

## UI states

- **`/home`, ordinary:** the identity header (display name and sign-out) and only the tiles
  the role is allowed. No prices, counts, totals or stock figures on the menu.
- **`/home`, signed out:** the middleware sends the request to `/sign-in` with the home path
  as `callbackUrl`; no part of the menu is sent.
- **`/home`, `YARD_STAFF`:** exactly one tile, Stock Calendar. The other three are absent
  from the response, not hidden by styling.
- **`/home`, `ADMIN`:** three tiles, no Dashboard.
- **`/home`, `SUPER_ADMIN`:** four tiles.
- **Export, item with no price:** column E is blank; the rest of the row is unchanged.
- **Export, ordinary:** column E is a number displayed with a euro sign and two decimals.

## Acceptance criteria

**AC-1 — The role union is closed and the hierarchy has one predicate.** `prisma/schema.prisma`
declares `Role { YARD_STAFF ADMIN SUPER_ADMIN }`; `src/server/auth/roles.ts` exports the same
three strings, the matching union and `isRole`; and a single `isAdminOrAbove(role)` returns
true for `ADMIN` and `SUPER_ADMIN` and false for `YARD_STAFF`. Unit tests cover all three
inputs, and a source scan finds no second spelling of the hierarchy in `src/server/` or
`src/app/`. *Proved by* `src/server/auth/roles.test.ts` and `tests/unit/role-hierarchy.test.ts`
(created by this feature).

**AC-2 — The migration promotes the existing profile or does nothing.** Applying the two
migrations to a database with no `carlos-staarthof` row inserts no `User` row, leaves zero
`SUPER_ADMIN` rows and succeeds. Applying them to a database that already holds
`carlos-staarthof` changes that row's role to `SUPER_ADMIN` and changes no other column: its
status, username, PIN columns and epoch are byte-identical. Neither migration creates a
profile. The data migration is idempotent and refuses, rolling back, if applying it would
leave more than one `SUPER_ADMIN`. The enum migration carries a `-- contract-step:` line, so
#16's migration-safety test accepts the enum addition. *Proved by*
`src/server/auth/super-admin-migration.db.test.ts`.

**AC-3 — No application path creates, promotes, demotes or removes a SUPER_ADMIN.** Every
profile form and server action accepts only `YARD_STAFF` and `ADMIN`; `approveProfile`,
`createProfile` and `changeProfileRole` refuse a requested `SUPER_ADMIN` with a typed
`ValidationError`. In the profile-admin service, `changeProfileRole`, `deactivateProfile`,
`resetProfilePin`, `clearAccountLock`, `approveProfile` and `rejectProfile` refuse a target
whose current role is `SUPER_ADMIN` with a typed error and leave the target row byte-identical,
**except** that the same `SUPER_ADMIN` may reset its own PIN (the one allowed case, per #23
AC-7 and D2). In particular, an `ADMIN` actor's `resetProfilePin` or `clearAccountLock` on the
`SUPER_ADMIN` returns no PIN, changes no column and ends no session, so widening
`assertRole(actor, "ADMIN")` to admin-or-above cannot turn an `ADMIN` into the `SUPER_ADMIN`
by reading a freshly reset PIN. `approveProfile` and `rejectProfile` only ever act on a
`PENDING` row, which can never hold `SUPER_ADMIN`; they carry the same explicit target-role
refusal as defence in depth, so a future status change cannot reopen the hole. The migrations
are the only code that writes the role, and they only promote an existing row. The
operator/test helper `createActiveProfile` remains the only other code that can create a
`SUPER_ADMIN` fixture; no route or form reaches it, and e2e specs delete every fixture they
create. *Proved by* `src/server/auth/profile-admin-service.db.test.ts` (including the
`ADMIN`-resets-`SUPER_ADMIN` case: no PIN returned, no column changed) and a source scan in
`tests/unit/role-hierarchy.test.ts`.

**AC-4 — Every role lands on `/home`.** After a successful sign-in with no `callbackUrl`,
`YARD_STAFF`, `ADMIN` and `SUPER_ADMIN` all land on `/home`; with a valid `callbackUrl` they
land on that same-origin path instead. `/home` is in `PROTECTED_PATHS` and the middleware
matcher, and a signed-out request for it is a redirect to `/sign-in` with `callbackUrl=/home`.
A request for `/home` with no session sends none of the menu. *Proved by*
`tests/e2e/home-menu.spec.ts` and `src/server/auth/landing.test.ts`.

**AC-5 — The home menu is exactly the role's tiles.** The rendered response contains the
tiles in the table above and no others. A `YARD_STAFF` response contains one `home-*` test id,
`home-calendar`, and no link to `/analysis/export`, `/item-master` or `/dashboard`. An `ADMIN`
response contains `home-calendar`, `home-export` and `home-stock`, and no `home-dashboard`.
A `SUPER_ADMIN` response contains all four. Each tile's label and `href` are the table's: the
`home-calendar` tile's `href` is `/stock-entry` for a `YARD_STAFF` response and `/stock-takes`
for an `ADMIN` or `SUPER_ADMIN` response, and the other three tiles' `href`s are the table's
for every role. The identity header's `signed-in-name` and `sign-out` controls are present
for every role. *Proved by* `tests/e2e/home-menu.spec.ts`.

**AC-6 — The Stock Calendar section keeps working, and both calendars keep their addresses.**
For a `YARD_STAFF` actor the *Stock Calendar* tile leads to `/stock-entry`; for an `ADMIN` or
`SUPER_ADMIN` it leads to `/stock-takes` (D4). `/stock-entry` still renders the month grid,
still starts a count from an empty day, and still opens a count badge; `/stock-takes` still
renders its month grid, its yard/scope links and its history count page, with the shipped
calendar tests passing. Neither page is the automatic landing any more. The pages do not
become a second count-entry screen: the only count actions on `/stock-entry` remain the ones
it has today, and `/stock-takes` stays read-only (#10). *Proved by* the existing
`tests/e2e/stock-takes-calendar.spec.ts`, `tests/e2e/stock-takes-count.spec.ts`,
`tests/e2e/stock-entry-start.spec.ts` and `tests/e2e/home-menu.spec.ts`.

**AC-7 — SUPER_ADMIN is an administrator on every shipped admin surface.** With a
`SUPER_ADMIN` session, `/analysis`, `/analysis/export`, `/item-master`, `/profiles` and
`GET /api/users` answer as they do for an `ADMIN`, including every price and value the page
already rendered. With a `YARD_STAFF` session the same paths still refuse exactly as they do
today; with an `ADMIN` session nothing about them changes. `shapeForRole` returns the admin
shape for `SUPER_ADMIN`, so the count detail page's `itemsWithoutPrice` and the admin sheet
shapes are built for that role. *Proved by* `tests/e2e/role-access.spec.ts` (extended for the
third role) and `src/server/auth/role-shape.test.ts`.

**AC-8 — The export's Price column is a number in euros.** In a workbook built from a row
whose current price is `1234.5`, cell E of that row has a numeric value (`1234.5`, not the
string `"€1,234.50"`), its `numFmt` is exactly `"€"#,##0.00`, and it has no string value. A
row with no current price has no value in E (blank, not `""`). The Value column and the TOTAL
formula keep the values they have today. A downloaded workbook can be read back with
ExcelJS and yields a number in E. *Proved by*
`tests/unit/export-workbook.test.ts` and `src/server/export/export-service.test.ts`.

**AC-9 — YARD_STAFF receives no money on any surface.** On the home menu, the calendar, count
entry, the count detail, the staff rendering of the review/finish page and every other
staff-readable response there is no price, value, total or amount at any depth, and the
existing money-boundary walks still pass. The home menu adds no figure of any kind. The role
change does not widen a staff response: the admin shape is built only when `isAdminOrAbove`
is true. #24's review may carry money for an `ADMIN` or `SUPER_ADMIN`; the staff rendering of
that page remains money-free and is asserted by #24's money walk. *Proved by* the existing
`src/lib/money-boundary.test.ts`, the e2e money walks, and a new walk over `/home`.

**AC-10 — The shipped role, sign-in and export tests change mechanically, and nothing is
weakened.** `tests/e2e/support/users.ts` can create a `SUPER_ADMIN` fixture, and its sign-in
helper learns the new landing without hiding a failure. Every existing spec that signs in and
expects a specific landing either supplies that path as `callbackUrl` or navigates from
`/home`; no test title is deleted, no assertion is removed, and no timeout is raised. The
role-access spec gains one case for `SUPER_ADMIN`; the existing `ADMIN` and `YARD_STAFF` cases
stay. Exactly one shipped unit assertion changes, and its before/after/why-not-weaker is named
here, in the form of 009 AC-33:

- `tests/unit/export-workbook.test.ts:165` — **before:** `expect(valueOf(dublin, "E3")).toBe("€1.005")`,
  a text equality that passed only because the cell happened to be the formatted string.
  **after:** `expect(valueOf(dublin, "E3")).toBe(1.005)` and
  `expect(dublin.getCell("E3").numFmt).toBe('"€"#,##0.00')`, plus the no-price row asserting
  E has no value (`toBeNull`/`toBeUndefined`, not `""`). **Not weaker:** the new pair asserts
  the machine-readable number and the euro display format separately, which the old text
  assertion could not distinguish; it still reads the cell back from a round-tripped
  workbook, and it adds the blank case the old assertion did not make. The same file's
  `valueOf` helper stays and no other assertion in it changes. `git diff` on that file shows
  no other changed line. Review records the base commit and the `git diff` range used to
  check this. *Proved by* `tests/unit/export-workbook.test.ts`, `tests/e2e/sign-in.spec.ts`,
  `tests/e2e/role-access.spec.ts` and recorded review evidence.

**AC-11 — The gate is green in full.** `npx prisma validate`, `npm run typecheck`,
`npm run lint`, `npm run test:unit`, `npx prisma migrate status`, `npm run test:db` and
`npm run test:e2e` pass; `./init.sh` ends with `[OK] Environment ready` having **executed** the
database checks. `git status --porcelain -- Samples` is empty. No new dependency is added.
*Proved by* the recorded gate run in `progress/impl_roles_home_menu.md`.

**AC-12 — The schema stays the domain model.** The only schema change is the added enum value;
no model, column, index or relation is added or removed. `tests/unit/schema-and-migration.test.ts`
is updated for the third enum member and passes. `TRUNCATED_TABLES` is unchanged and
`src/server/test-db.db.test.ts` still asserts the closure. *Proved by* those tests.

## Out of scope

- The Dashboard's contents. #23 owns the profile list, profile actions and records view.
- Any change to what `ADMIN` can see or do, other than `SUPER_ADMIN` also being allowed.
- Any new money for `YARD_STAFF`, including on #24's review or sign-off. #24 adds money only
  for `ADMIN` and `SUPER_ADMIN`.
- Renaming `/stock-entry`, `/stock-takes`, `/analysis` or `/item-master`.
- Creating the `carlos-staarthof` profile when it is missing. Per R2 the migration inserts
  nothing; the owner or deployment creates the profile first.
- Adding a second super administrator, a UI to promote to `SUPER_ADMIN`, or a seeded PIN.
- Moving any stock-domain model, adding a table, or changing a count line.
- Changing the export's Value column, its formula or its sheet shape.

## Open questions

- **Q1:** Should the "at most one" rule also be a database constraint (a partial unique index
  on the `SUPER_ADMIN` role), which would make e2e fixtures unable to create a second
  super administrator? This spec enforces it in the migration and in the profile services.
- **Q2:** The owner's instruction says the calendar is "moved to its own section". This spec
  keeps both existing addresses (`/stock-entry` for counting, `/stock-takes` for history) and
  makes *Stock Calendar* a menu section whose tile resolves per role (D4). Confirm that no URL
  rename is wanted.
- **Q3:** If `carlos-staarthof` does not exist at deploy time, should the owner expect to
  create the profile and run a follow-up promotion, or is a future deployment script expected
  to cover it? This spec follows R2 and does nothing in the migration.
