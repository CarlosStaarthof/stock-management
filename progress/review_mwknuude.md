# Review — feature 22 `roles_home_menu`, branch `hermes/mwknuude`

**Verdict:** CHANGES_REQUESTED

Reviewer: strict reviewer, 2026-11-17. Contract: the task text and `specs/features/022-roles_home_menu.md`
(AC-1..AC-12) with its "Owner rulings, 2026-11-17" (R1..R4). Diff range checked: base `602eb2d`
(the tip of `main`) to `HEAD` `0722548` (three implementer commits: `2dac53c`, `1fd8350`, `0722548`).
`git status` was clean before and after my runs. I changed no code; `Samples/` is untouched and no
dependency was added (`git diff 602eb2d..HEAD --name-only` has no `package*.json`, `specs/`, `docs/`
or `Samples/` entries).

The feature itself is substantially correct and well tested. I request changes for two reasons:
an **unrequested, undisclosed `done` flip of feature #12** in `feature_list.json` (HERMES §10), and
**unit-assertion amendments that the spec says must not exist**, one of which is looser than what it
replaced. Details are under "Required changes".

## Gate result (each command run on its own, in my container)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (`--max-warnings 0`) |
| `npm run test:unit` | Test Files 1 failed / 89 passed (90); Tests 1 failed / 1346 passed (1347). The one failure is `tests/unit/env-file.test.ts:146`, "`.env` does not exist". |
| `npm run test:db` (bare) | 6 files / 36 tests failed: 34 are `CredentialSecretError: AUTH_SECRET is not set`, 1 is `operator-production.db.test.ts:48` (".env names a database"), 1 is a consequence of the missing secret. |
| `npm run test:db` with a throwaway `AUTH_SECRET` in the environment | Test Files 1 failed / 34 passed (35); Tests 1 failed / 588 passed (589). The single failure is again `operator-production.db.test.ts:48`, ".env names a database". |
| `bash init.sh` | FAILED: prisma validate (no `DATABASE_URL`), `test:unit`, `test:e2e`. Database checks skipped. |

My container has no `.env`, no `DATABASE_URL` and no `AUTH_SECRET`; this is the same environment-only
red recorded in `review_mva3eswl.md` and `review_mwkjd6rb.md`. Neither file the red lands on
(`env-file.test.ts`, `operator-production.db.test.ts`) is touched by this branch. Every test this feature
adds or changes passed in my runs, including `super-admin-migration.db.test.ts`,
`profile-admin-service.db.test.ts`, `export-service.db.test.ts`, `census.db.test.ts`,
`columns.db.test.ts`, `roles.test.ts`, `landing.test.ts`, `role-shape.test.ts`, `home-menu.test.ts`,
`role-hierarchy.test.ts`, `export-workbook.test.ts` and `schema-and-migration.test.ts`. The counts the
implementer pasted (1347 unit, 589 db) match mine exactly. I therefore do not hold the red gate against
the implementer. e2e is out of this goal's gate (task text), so `test:e2e` was not run and AC-4, AC-5,
AC-6 and AC-7's e2e halves are **unexecuted**; I read the specs only.

## Claims verified against the diff

- `feature_list.json`: 22 `spec_status` approved and `status` in_progress; 23 and 24 `spec_status`
  approved, `status` still `pending`. Correct. **But `id: 12` also changed `in_progress` -> `done`
  (diff hunk at `feature_list.json:625`). That is not in the task and not mentioned in
  `progress/impl_roles_home_menu.md` or `progress/current.md`.** See Required change 1.
- Migrations: `20261117120000_add_super_admin_role` (enum value, `-- contract-step:` line) and
  `20261117121000_promote_carlos_super_admin` (`UPDATE ... WHERE username='carlos-staarthof'`, no
  `INSERT`, `RAISE EXCEPTION` if more than one `SUPER_ADMIN`). Promote-only, as R2 requires.
- Features 23 and 24 were not started: no `/dashboard` page, no `StockCountOpenItem`.
- `src/server/auth/profile-admin-service.ts`: six target-mutating services refuse a `SUPER_ADMIN` target
  (`assertTargetIsNotSuperAdmin`, and the `user.id !== id` exception in `resetProfilePin`);
  `clearAccountLock` now locks the row with `lockProfile` first.

## Acceptance criteria

| AC | PASS/FAIL | Evidence |
|---|---|---|
| AC-1 role union and one predicate | PASS | `prisma/schema.prisma` Role has 3 values; `src/server/auth/roles.ts:14-25`; `src/server/auth/roles.test.ts`; source scans in `tests/unit/role-hierarchy.test.ts:38-58`. No remaining `assertRole(actor, "ADMIN")` / `requireRole("ADMIN")` under `src/` (grep). |
| AC-2 migration promotes or does nothing | PASS | `prisma/migrations/20261117121000_promote_carlos_super_admin/migration.sql`; `src/server/auth/super-admin-migration.db.test.ts:144` (absent / present / idempotent / second-SUPER_ADMIN refusal) and `:202` (no INSERT, contract-step line). Ran green. |
| AC-3 no application path writes SUPER_ADMIN | PASS | `profile-admin-service.ts` `parseRole` (:210), `assertTargetIsNotSuperAdmin`, `resetProfilePin` self-exception; `src/app/profiles/actions.ts:97`; db tests `profile-admin-service.db.test.ts:986-1060` (ValidationError x3; six services refuse with `ForbiddenError`, snapshot byte-identical, no PIN, lock intact; own reset allowed, epoch 1); scans `role-hierarchy.test.ts:60-92`. |
| AC-4 every role lands on `/home` | PASS (unit) / UNRUN (e2e) | `src/server/auth/landing.ts`; `landing.test.ts`; `/home` in `PROTECTED_PATHS` (`src/lib/auth-config.ts`) and matcher (`src/middleware.ts`); `tests/e2e/home-menu.spec.ts:62-78` exists but was not executed (out of gate). |
| AC-5 menu is exactly the role's tiles | PASS (unit) / UNRUN (e2e) | `src/server/home-menu.ts`; `src/server/home-menu.test.ts`; `src/app/home/page.tsx` renders only `homeTilesForRole`; `home-menu.spec.ts:80-120` matches the table incl. D4 href. Not executed. |
| AC-6 calendars keep their addresses | PASS (by diff) / UNRUN | No route moved or edited; `/stock-entry` and `/stock-takes` pages are absent from the diff. Existing calendar specs not run (out of gate). |
| AC-7 SUPER_ADMIN is an admin everywhere | PASS (unit) / UNRUN (e2e) | `role-shape.ts` uses `isAdminOrAbove`; `role-shape.test.ts`; every service/route guard converted (`git diff --stat`: analysis, export, items, counts, api/users, page-guards); `role-access.spec.ts` SUPER_ADMIN case present, not run. |
| AC-8 export Price is a euro number | PASS | `src/lib/excel/workbook-writer.ts:194-200` (number + `PRICE_FORMAT '"€"#,##0.00'`; null price leaves E untouched); `tests/unit/export-workbook.test.ts:165-176` (`1.005`, `numFmt`, blank `toBeNull`); `src/server/export/export-service.db.test.ts:243-244` reads back a round-tripped workbook (`9.99`, numFmt). Value/TOTAL code unchanged. Note: the spec's named proof `src/server/export/export-service.test.ts` was not touched; the db test supplies the read-back. |
| AC-9 YARD_STAFF receives no money | PASS (by diff) | Admin shape built only via `isAdminOrAbove`; menu carries no figure (`home-menu.spec.ts:123-136` walk, unrun); `money-boundary.test.ts` green. The spec says "a new walk over `/home`": it is an e2e walk only. |
| AC-10 shipped tests change mechanically, nothing weakened | **FAIL** | The one named amendment (`export-workbook.test.ts:165`) is exactly as listed and the diff of that file is confined to that test (12 changed lines). But the spec says "**Exactly one** shipped unit assertion changes"; the branch also changes `tests/unit/item-master-actions-contract.test.ts:72-90` (title renamed, regex and exact first-statement string changed) and `tests/unit/pin-auth-contract.test.ts:941-946` (exact string equality replaced by membership of two strings), which the spec does not list. AC-10 also says "no test title is deleted"; two titles were rewritten (`item-master-actions-contract.test.ts:72`, `pin-auth-contract.test.ts:932`). See Required change 2. The e2e landing updates (`sign-in.spec.ts`, `route-protection.spec.ts`) are mechanical and keep every title's substance; no timeout raised. |
| AC-11 gate green in full | PARTIAL | typecheck, lint, unit and db are green in the implementer's claim and reproduce here except the `.env`/`AUTH_SECRET` environment items above. `migrate status`, `test:e2e` and `init.sh` are out of this goal's gate per the task. Impl notes paste final summaries for all four commands. |
| AC-12 schema stays the domain model | PASS | Schema diff is the single enum value; `schema-and-migration.test.ts:250-251` updated; `columns.db.test.ts` label updated; `TRUNCATED_TABLES` unchanged. |

## CHECKPOINTS.md

`CHECKPOINTS.md` was read; the items below are those that apply to this change.

- [x] Spec exists and is approved; feature set `in_progress` (22), 23/24 only approved.
- [x] No `Samples/` change; no new dependency; no secrets committed.
- [x] Tests assert values (numbers, role strings, byte-identical snapshots), not survival.
- [x] Each new exported function has a success and a failure test (`isAdminOrAbove`, `assertAdminOrAbove`, `homeTilesForRole`).
- [ ] Work stays inside the feature's stated scope and no feature is marked `done` by the implementer: **fails** (#12 flipped to `done`).
- [ ] No existing assertion changed beyond what the spec lists: **fails** (item-master and pin-auth contract tests, unlisted).
- [ ] Full gate green in this container: red for environment reasons only (see Gate); not a defect of this work.

## Required changes

1. `feature_list.json:625` — feature #12 `export_workbook` was changed from `in_progress` to `done`.
   The task asked only to approve specs 22/23/24 and set 22 `in_progress`; HERMES §10 says an
   implementer never marks a feature `done` ("`done` happens after review and the owner's approval"),
   and nothing in `progress/impl_roles_home_menu.md` or `progress/current.md` discloses it. I found no
   owner sign-off for #12 on this branch (the existing `review_mva3eswl.md` approves it, which is not the
   owner's close). Undo the flip so #12 is not `done` through this branch. Because `init.sh:95` rejects
   two `in_progress` features, the implementer must not choose silently. Either leave #12 in whatever
   non-`done` state satisfies the checker and record it in the impl notes, or go `BLOCKED` with
   `QUESTION: has the owner signed off #12, so it may be set done now?`. Whatever is chosen must be
   written in `progress/impl_roles_home_menu.md`.
2. `tests/unit/item-master-actions-contract.test.ts:72-90` and `tests/unit/pin-auth-contract.test.ts:932-946`
   — these amend shipped unit assertions that spec 022 AC-10 says do not change ("exactly one"), and
   rename two test titles. The guard literal does have to change, so this is a spec finding for the owner,
   not something to wave through. Do two things.
   (a) In `pin-auth-contract.test.ts:941-946` restore an exact per-function assertion. `assertAdminOrAbove(actor);`
   must be the expected first statement for nine functions and `const user = assertAdminOrAbove(actor);`
   for `resetProfilePin` alone. A two-element `toContain` lets any function use either form, which is
   looser than the exact `toBe` it replaced.
   (b) Record each of these unit amendments in `progress/impl_roles_home_menu.md` in the 009 AC-33 form
   (before / after / why not weaker), and raise them as `QUESTION:` for the owner so the ruling is
   appended to spec 022 AC-10. The impl notes today call them "necessary mechanical follow-ons" with no
   before/after, and do not mention the loosened `toContain` or the title renames.
3. `progress/impl_roles_home_menu.md` — AC-4, AC-5, AC-6, AC-7 and the `/home` walk of AC-9 are proved
   only by e2e specs that were never executed (e2e is out of this gate). The notes say so, but they also
   list those ACs as built with no "unexecuted" marker in the table. Add that marker to each such row. This
   is a documentation change only; do not touch the specs.

## Observations (non-blocking)

- `tests/e2e/home-menu.spec.ts` and the extended `role-access.spec.ts` look correct against the spec's tile
  table. Their first real run will be the check on D4's per-role href and the signed-out 307; plan it.
- `/dashboard` is added to `PROTECTED_PATHS` and the matcher with no page behind it yet (spec allows this;
  #23 delivers it). Until then a signed-in `SUPER_ADMIN` tile leads to a 404.
- AC-8's named proof `src/server/export/export-service.test.ts` was not modified; the db test carries the
  read-back. Acceptable, but the spec text and the evidence differ.
- `src/app/profiles/actions.ts:97` and `profile-admin-service.ts:210` spell `role === "YARD_STAFF" || role === "ADMIN"`.
  That is an allow-list of assignable roles, not a second hierarchy, and `role-hierarchy.test.ts` does not
  flag it; correct per AC-3.
- `.env`-dependent tests (`env-file.test.ts`, `operator-production.db.test.ts`) and `AUTH_SECRET`-dependent db
  files fail in a container with no environment; this is a standing property of the harness, recorded again
  here, not a regression.
