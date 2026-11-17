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
- **D2 — One super administrator, fixed by migration.** Exactly one profile holds
  `SUPER_ADMIN`, with the username `carlos-staarthof`. The role is written by a migration,
  never by a screen, an API or a seed. Tradeoff: the profile is created by deployment, and
  its PIN must be set once with the existing operator command (`npm run pin:reset`).
- **D3 — The home menu is the landing.** After sign-in every role lands on `/home` unless a
  valid `callbackUrl` was supplied. The calendar is no longer the automatic landing.
  Tradeoff: every existing sign-in test moves one navigation further on.
- **D4 — The calendar keeps its address.** The existing calendar is the *Stock Calendar*
  section and keeps `/stock-entry`; moving the URL would touch every count link and every
  shipped calendar test for no user-visible gain. Tradeoff: the word "Stock Calendar" is a
  label on the home menu and the section heading, not a new route.
- **D5 — Money visibility is unchanged by role.** `ADMIN` and `SUPER_ADMIN` see prices;
  `YARD_STAFF` sees none. Feature #24 is expected to amend this for the sign-off review
  only, and that amendment belongs to #24, not here.
- **D6 — Export prices are numbers.** Column E is a numeric cell with a euro number format,
  not a formatted string. Tradeoff: a workbook test now reads `cell.value` as a number and
  `cell.numFmt` for the currency, rather than reading cell text.

## User stories

- As the owner, I sign in and choose the section I want from one menu, instead of being
  dropped on whichever screen my role happened to land on.
- As a `YARD_STAFF` user, I see the calendar and can start a count, and I am not offered
  Export, Stock or Dashboard.
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
  2. ensure the one `carlos-staarthof` profile holds it.
- `User` is written only by migration 2. No new table. `TRUNCATED_TABLES` is unchanged.
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
| `home-calendar` | Stock Calendar | `/stock-entry` | yes | yes | yes |
| `home-export` | Export | `/analysis/export` | no | yes | yes |
| `home-stock` | Stock | `/item-master` | no | yes | yes |
| `home-dashboard` | Dashboard | `/dashboard` | no | no | yes |

Count entry remains reachable from the calendar exactly as today (an empty day, `Start a
count`, or a count badge); the home menu adds no second entry path.

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

**AC-2 — The migration leaves exactly one SUPER_ADMIN.** Applying the two migrations to an
empty database leaves exactly one `User` row with role `SUPER_ADMIN`: username
`carlos-staarthof`, status `ACTIVE`, no `pinHash`, no `pinKeyId`. Applying them to a database
that already holds `carlos-staarthof` changes that row's role to `SUPER_ADMIN` and changes no
other column. The data migration raises an error, and the migration fails, if it cannot leave
exactly one such row. The enum migration carries a `-- contract-step:` line, so #16's
migration-safety test accepts the enum addition. *Proved by*
`src/server/auth/super-admin-migration.db.test.ts`.

**AC-3 — No normal path creates, promotes or removes a SUPER_ADMIN.** Every profile form and
server action accepts only `YARD_STAFF` and `ADMIN`; `approveProfile`, `createProfile` and
`changeProfileRole` refuse a requested `SUPER_ADMIN` with a typed `ValidationError`;
`changeProfileRole` and `deactivateProfile` refuse a target whose current role is
`SUPER_ADMIN`. The operator/test helper `createActiveProfile` remains the only code that can
create a `SUPER_ADMIN` fixture; no route or form reaches it, and e2e specs delete every
fixture they create. *Proved by* `src/server/auth/profile-admin-service.db.test.ts` and a
source scan in `tests/unit/role-hierarchy.test.ts`.

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
A `SUPER_ADMIN` response contains all four. Each tile's label and `href` are the table's, and
the identity header's `signed-in-name` and `sign-out` controls are present for every role.
*Proved by* `tests/e2e/home-menu.spec.ts`.

**AC-6 — The Stock Calendar section keeps working as the calendar.** The Stock Calendar tile
leads to `/stock-entry`; that page still renders the month grid, still starts a count from an
empty day, and still opens a count badge, with the shipped calendar tests passing. It is no
longer the automatic landing. The page does not become a second count-entry screen: the only
count actions on it remain the ones it has today. *Proved by* the existing
`tests/e2e/stock-takes-calendar.spec.ts`, `tests/e2e/stock-entry-start.spec.ts` and
`tests/e2e/home-menu.spec.ts`.

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

**AC-9 — YARD_STAFF still receives no money.** On the home menu, the calendar, count entry,
the count detail, the review page and every other staff-readable response there is no price,
value, total or amount at any depth, and the existing money-boundary walks still pass. The
home menu adds no figure of any kind. The role change does not widen a staff response: the
admin shape is built only when `isAdminOrAbove` is true. *Proved by* the existing
`src/lib/money-boundary.test.ts`, the e2e money walks, and a new walk over `/home`.

**AC-10 — The shipped role and sign-in tests change mechanically, and nothing is weakened.**
`tests/e2e/support/users.ts` can create a `SUPER_ADMIN` fixture, and its sign-in helper learns
the new landing without hiding a failure. Every existing spec that signs in and expects a
specific landing either supplies that path as `callbackUrl` or navigates from `/home`; no
test title is deleted, no assertion is removed, and no timeout is raised. The role-access
spec gains one case for `SUPER_ADMIN`; the existing `ADMIN` and `YARD_STAFF` cases stay.
Review records the base commit and the `git diff` range used to check this. *Proved by*
`tests/e2e/sign-in.spec.ts`, `tests/e2e/role-access.spec.ts` and recorded review evidence.

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
- Any new money for `YARD_STAFF`. #24 may amend the sign-off review; this feature does not.
- Renaming `/stock-entry`, `/stock-takes`, `/analysis` or `/item-master`.
- Adding a second super administrator, a UI to promote to `SUPER_ADMIN`, or a seeded PIN.
- Moving any stock-domain model, adding a table, or changing a count line.
- Changing the export's Value column, its formula or its sheet shape.

## Open questions

- **Q1:** Is `Carlos Staarthof` the display name the migration should create when the
  `carlos-staarthof` profile does not exist yet? The migration can create the row with that
  name and no PIN, and the owner then sets a PIN with `npm run pin:reset`.
- **Q2:** Should the "exactly one" rule also be a database constraint (a partial unique index
  on the `SUPER_ADMIN` role), which would make e2e fixtures unable to create a second
  super administrator? This spec enforces it in the migration and in the profile services.
- **Q3:** The owner's instruction says the calendar is "moved to its own section". This spec
  keeps the `/stock-entry` address and makes it a menu section. Confirm that no URL rename is
  wanted.
