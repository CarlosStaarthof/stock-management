# Feature 22 — Roles, home menu and export price format

**Spec:** `specs/features/022-roles_home_menu.md` (approved; owner rulings 2026-11-17)
**Branch:** `hermes/mwknuude`
**Status:** implementation complete, gate green; stays `in_progress` until review and the
owner's approval (never set `done` by the implementer).

## What was built

| AC | What landed |
|---|---|
| AC-1 | `prisma/schema.prisma` `Role { YARD_STAFF ADMIN SUPER_ADMIN }`; `src/server/auth/roles.ts` exports `ROLES`, `Role`, `isRole`, `isAdminOrAbove`; `assertAdminOrAbove` in `src/server/auth/guards.ts`; every admin surface uses the one predicate. |
| AC-2 | `prisma/migrations/20261117120000_add_super_admin_role` (enum value, with a `-- contract-step:` line) and `20261117121000_promote_carlos_super_admin` (promotes `carlos-staarthof` only if it exists; inserts nothing; idempotent; rolls back if the result would hold more than one `SUPER_ADMIN`). |
| AC-3 | `parseRole` accepts only `YARD_STAFF` and `ADMIN` in `createProfile`, `approveProfile` and `changeProfileRole`; `changeProfileRole`, `deactivateProfile`, `resetProfilePin`, `clearAccountLock`, `approveProfile` and `rejectProfile` refuse a `SUPER_ADMIN` target, except the same `SUPER_ADMIN` resetting its own PIN (AC-3 / #23 AC-7). Target role is re-read under `FOR UPDATE`. |
| AC-4 | `landingPathForRole` returns `/home` for every role; `/home` added to `PROTECTED_PATHS` and the middleware matcher; `safeCallbackPath` still wins. **Unit-proved** by `landing.test.ts`, `page-guards.test.ts` and `home-contract.test.ts`; the live signed-out 307 is still e2e-only. |
| AC-5 | `src/server/home-menu.ts` builds the exact tiles per role; `src/app/home/page.tsx` renders only those tiles with the identity header. **Unit-proved** by `home-menu.test.ts` and `home/page.test.ts`; the browser response through the full server is still e2e-only. |
| AC-6 | No URL moved: `/stock-entry` and `/stock-takes` keep their shipped pages; the *Stock Calendar* tile resolves `YARD_STAFF → /stock-entry`, `ADMIN`/`SUPER_ADMIN → /stock-takes`. **Addresses and hrefs unit-proved** by `home/page.test.ts` and `home-contract.test.ts`; the calendars' rendered behaviour remains e2e-only. |
| AC-7 | `requireAdminPage` / `requireAdminOrAbove` / `shapeForRole` use `isAdminOrAbove`, so `SUPER_ADMIN` gets the admin shape and the admin surfaces. **Predicate and page guard unit-proved** by `guards.test.ts`, `page-guards.test.ts` and `role-shape.test.ts`; the five HTTP surfaces are still e2e-only. |
| AC-8 | `src/lib/excel/workbook-writer.ts` writes column E as a number with `numFmt = "\"€\"#,##0.00`; no price leaves the cell blank. Value and TOTAL unchanged. |
| AC-9 | Staff responses stay money-free; the menu adds no figure. **`/home` walk unit-proved** by `home/page.test.ts`; the other e2e money walks remain e2e-only. |
| AC-10 | See the amended assertions below. |
| AC-12 | Only the enum value was added; `schema-and-migration.test.ts` updated for the third member; `TRUNCATED_TABLES` unchanged. |

## Amended assertions (spec 022 AC-10)

AC-10 originally named **exactly one** shipped unit assertion that may change. The branch
changes three (`export-workbook`, `item-master-actions-contract`, `pin-auth-contract`) and
rewrites two test titles; the guard rename in AC-1 forces the latter two. The owner has now
ruled (R5, 2026-11-17) that AC-10 lists all three as forced follow-ons of AC-1, so none is an
unlisted amendment any more. Each is recorded here in the 009 AC-33 form:

1. `tests/unit/export-workbook.test.ts:165` — the original AC-10 item. **Before**
   `expect(valueOf(dublin, "E3")).toBe("€1.005")`; **after**
   `expect(valueOf(dublin, "E3")).toBe(1.005)` plus
   `expect(dublin.getCell("E3").numFmt).toBe('"€"#,##0.00')`, and a no-price row asserting E has
   no value (`toBeNull`). **Not weaker:** it asserts the machine-readable number and the euro
   display format separately, still round-trips the workbook, and adds the blank case the old
   assertion did not make. `valueOf` stays; no other assertion in that file changed.
2. `tests/unit/item-master-actions-contract.test.ts:72-90` — **listed by R5.** The title
   changes from "there is one `requireRole("ADMIN")` call per exported action" to "…one
   admin-or-above guard per exported action"; the scanned regex changes from
   `/await requireRole\("ADMIN"\)/g` to `/await requireAdminOrAbove\(\)/g`; the exact
   first-statement literal changes from `const actor = await requireRole("ADMIN");` to
   `const actor = await requireAdminOrAbove();`. **Why not weaker:** every structural assertion
   is unchanged (19 exported actions, one guard-before-anything per action, exact first
   statement); only the shipped guard's name changed, forced by AC-1.
3. `tests/unit/pin-auth-contract.test.ts:932-946` — **listed by R5.** The title changes
   from "…asserts ADMIN as its first statement" to "…asserts admin-or-above as its first
   statement". The assertion changes from an exact `toBe('assertRole(actor, "ADMIN");')` to an
   exact per-function `toBe`: `const user = assertAdminOrAbove(actor);` for `resetProfilePin`
   alone, `assertAdminOrAbove(actor);` for the other nine. **Why not weaker:** it remains an
   exact first-statement equality per function and is strictly narrower than the two-element
   `toContain` an earlier draft used (review required this restoration); the one bound form is
   the AC-3 self-reset, the only function that needs the actor's id.

Other forced, non-assertion updates (same behaviour, no assertion weakened):

- `src/server/export/export-service.db.test.ts` — column E now reads `9.99` and asserts the euro
  `numFmt`.
- `tests/unit/schema-and-migration.test.ts` — `Role` now has the third member.
- `tests/e2e/{home-menu,role-access,route-protection,sign-in}.spec.ts` — new landing `/home`,
  third role, `SUPER_ADMIN` fixture support. E2E is out of this goal's gate.

## Owner rulings applied, round 2 on `hermes/mwkr46sw` (2026-11-17)

The owner answered both questions and added a third ruling; all are recorded in spec 022
under "Owner rulings, 2026-11-17" as R5, R6 and R7.

- **R5 — AC-10 is amended** to list the item-master-actions and pin-auth contract-guard
  updates and their two title renames as forced follow-ons of AC-1. AC-10 and the matching
  `feature_list.json` summary now name all three unit amendments; the exact per-function
  `toBe` assertion in `pin-auth-contract.test.ts` stays as restored in round 1.
- **R6 — Feature #12 is signed off.** `export_workbook` was released to production on
  2026-11-17, so `feature_list.json` sets it `done`. #22 remains the single `in_progress`
  feature, which keeps `init.sh:95` satisfied.
- **R7 — AC-4 to AC-7 and the `/home` half of AC-9 are now proved in the gate.** New unit
  tests where the logic lives, with the e2e specs left as written (see below).

## Criteria proved inside today's gate, and what is still e2e-only

Added in round 2, no new scope:

| Proof | Covers |
|---|---|
| `src/app/home/page.test.ts` (new) | AC-5 rendered response (exact tiles, labels, hrefs, identity header), AC-6 per-role calendar href, AC-9 `/home` money walk — every role. |
| `src/app/page-guards.test.ts` (new) | AC-7 `SUPER_ADMIN`/`ADMIN` pass the administrator page guard and `YARD_STAFF` is refused; AC-4 every role has a home and no session redirects. Runs the real `session → assertAdminOrAbove → isAdminOrAbove` chain. |
| `tests/unit/home-contract.test.ts` (new) | AC-4 `/home` in `PROTECTED_PATHS` and the middleware matcher; AC-6 both calendar pages still exist and the calendar tile points at a shipped page for every role. |
| `src/server/auth/landing.test.ts`, `src/server/home-menu.test.ts`, `src/server/auth/{guards,roles,role-shape}.test.ts` (existing) | AC-4 landing totality, AC-5 tile list, AC-7 predicate and shape. |

Still proved **only by e2e** (kept as written, to run once Chromium works in the workers):

- AC-4: the live middleware answers a signed-out `/home` with a 307 to
  `/sign-in?callbackUrl=%2Fhome` (the contract test proves the source says so, not the
  running edge).
- AC-5: the real browser response for each role through the full server and middleware.
- AC-6: `/stock-entry` and `/stock-takes` still render their grids and shipped calendar
  behaviour under the shipped e2e calendar specs.
- AC-7: the five HTTP surfaces (`/analysis`, `/analysis/export`, `/item-master`,
  `/profiles`, `GET /api/users`) answering a real `SUPER_ADMIN` and `YARD_STAFF` session.
- AC-10: the sign-in and role-access e2e updates.

## Feature #12 status

Earlier commits changed feature #12 `export_workbook` from `in_progress` to `done` without
the task asking, and round 1 reverted it to `pending`. The owner has now signed it off (R6:
released to production on 2026-11-17), so it is `done` again — this time disclosed and ruled.
#22 is still the only `in_progress` feature. No other feature state changed.

## Gate

The implementation rounds' full run (2026-11-17) was green except the environment items:
`npm run typecheck` exit 0, `npm run lint` exit 0, `npm run test:unit` 90/90 files and
1347/1347 tests, `npm run test:db` 35/35 files and 589/589 tests, `npx prisma validate`
valid, `Samples/` clean, no dependency added.

Round 2 (this round) re-ran the fast gate after adding the three unit-test files:

```
$ npm run typecheck
> tsc --noEmit
exit 0

$ npm run lint
> eslint src tests --max-warnings 0
exit 0

$ npm run test:unit
 Test Files  1 failed | 92 passed (93)
      Tests  1 failed | 1367 passed (1368)
```

The only red is the standing, environment-only `tests/unit/env-file.test.ts:146` (`.env`
absent), the same one the reviewer recorded; every new test passes. `test:db` was not re-run
this round because no database code or schema changed. Feature-list check:
`in_progress: #22 roles_home_menu`, `#12: done approved 14 ACs`, no invalid `done`.

`npm run test:e2e` is out of this goal's gate per the task instruction. The e2e specs stay in
the tree for when the container can run Playwright; the e2e-only list is above.

### Review repairs, round 1 on `hermes/mwkr46sw` (2026-11-17)

Applied the three changes `progress/review_mwknuude.md` requires, no new scope:

1. #12 `done` -> `pending` (see above); `feature_list.json` now has exactly one `in_progress`
   feature (#22), as `init.sh:95` requires.
2. `tests/unit/pin-auth-contract.test.ts` restored to an exact per-function first-statement
   assertion (see the AC-10 section above). The two contract tests' changes and title renames
   are now recorded before/after/why-not-weaker there; the owner resolved them in R5 this
   round.
3. Added the `unexecuted` marker to the AC-4, AC-5, AC-6, AC-7 and AC-9 rows of the table.

Re-runs in this container: `npx prisma generate` (needed after the merged schema change),
`npm run typecheck` exit 0, `npm run lint` exit 0, `npm run test:unit` 89/90 files and
1346/1347 tests green — the only red is the standing, environment-only
`tests/unit/env-file.test.ts:146` (`.env` absent), as recorded by the reviewer.
`bash init.sh` feature-list block: `[ok] 23 features, 1 in progress`.

## Not done / remains

- Re-review, then the owner's approval. The feature stays `in_progress`.
- E2E execution (out of gate for now); the e2e-only parts are listed above.
- Features #23 and #24 were not started.
