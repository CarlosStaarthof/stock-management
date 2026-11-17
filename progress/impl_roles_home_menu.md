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
| AC-4 | `landingPathForRole` returns `/home` for every role; `/home` added to `PROTECTED_PATHS` and the middleware matcher; `safeCallbackPath` still wins. **E2E half unexecuted** (out of gate); `landing.test.ts` green. |
| AC-5 | `src/server/home-menu.ts` builds the exact tiles per role; `src/app/home/page.tsx` renders only those tiles with the identity header. **E2E half unexecuted**; `home-menu.test.ts` green. |
| AC-6 | No URL moved: `/stock-entry` and `/stock-takes` keep their shipped pages; the *Stock Calendar* tile resolves `YARD_STAFF → /stock-entry`, `ADMIN`/`SUPER_ADMIN → /stock-takes`. **Proved only by unexecuted e2e**; no route changed. |
| AC-7 | `requireAdminPage` / `requireAdminOrAbove` / `shapeForRole` use `isAdminOrAbove`, so `SUPER_ADMIN` gets the admin shape and the admin surfaces. **E2E half unexecuted**; `role-shape.test.ts` green. |
| AC-8 | `src/lib/excel/workbook-writer.ts` writes column E as a number with `numFmt = "\"€\"#,##0.00`; no price leaves the cell blank. Value and TOTAL unchanged. |
| AC-9 | Staff responses stay money-free; the menu adds no figure. **`/home` walk unexecuted**; `money-boundary.test.ts` green. |
| AC-10 | See the amended assertions below. |
| AC-12 | Only the enum value was added; `schema-and-migration.test.ts` updated for the third member; `TRUNCATED_TABLES` unchanged. |

## Amended assertions (spec 022 AC-10)

AC-10 names **exactly one** shipped unit assertion that may change. The branch changes three
(`export-workbook`, `item-master-actions-contract`, `pin-auth-contract`) and rewrites two test
titles; the guard rename in AC-1 forces the latter two. Each is recorded here in the 009 AC-33
form, and each unlisted one is raised as a `QUESTION` to the owner (below), because 022 AC-10
must be amended by the owner, not by the implementer.

1. `tests/unit/export-workbook.test.ts:165` — the one AC-10 names. **Before**
   `expect(valueOf(dublin, "E3")).toBe("€1.005")`; **after**
   `expect(valueOf(dublin, "E3")).toBe(1.005)` plus
   `expect(dublin.getCell("E3").numFmt).toBe('"€"#,##0.00')`, and a no-price row asserting E has
   no value (`toBeNull`). **Not weaker:** it asserts the machine-readable number and the euro
   display format separately, still round-trips the workbook, and adds the blank case the old
   assertion did not make. `valueOf` stays; no other assertion in that file changed.
2. `tests/unit/item-master-actions-contract.test.ts:72-90` — **unlisted in AC-10.** The title
   changes from "there is one `requireRole("ADMIN")` call per exported action" to "…one
   admin-or-above guard per exported action"; the scanned regex changes from
   `/await requireRole\("ADMIN"\)/g` to `/await requireAdminOrAbove\(\)/g`; the exact
   first-statement literal changes from `const actor = await requireRole("ADMIN");` to
   `const actor = await requireAdminOrAbove();`. **Why not weaker:** every structural assertion
   is unchanged (19 exported actions, one guard-before-anything per action, exact first
   statement); only the shipped guard's name changed, forced by AC-1.
3. `tests/unit/pin-auth-contract.test.ts:932-946` — **unlisted in AC-10.** The title changes
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

## Questions raised for the owner (spec 022 AC-10)

- `QUESTION: does the owner approve amending 022 AC-10 to list the item-master-actions and
  pin-auth contract-guard updates (and their two title renames) as forced follow-ons of AC-1?`
- `QUESTION: has the owner signed off feature #12, so it may be set done?` — this branch no
  longer flips it: `feature_list.json` keeps #12 `pending`, because the task set only #22
  `in_progress` and `init.sh` rejects more than one `in_progress` feature.

## Unrequested `done` flip reverted (review, required change 1)

The earlier commits changed `feature_list.json` feature #12 `export_workbook` from
`in_progress` to `done` without the task asking and without disclosing it. That flip is undone:
#12 is now `pending`, the only non-`done` state that leaves #22 the sole `in_progress` feature
for `init.sh:95`. #12's own review (`review_mva3eswl.md`) is not the owner's close, so `done`
is the owner's call. No other feature state changed.

## Gate

Each command was run on its own, from the repository root, on 2026-11-17.

```
$ npm run typecheck
> tsc --noEmit
exit 0

$ npm run lint
> eslint src tests --max-warnings 0
exit 0

$ npm run test:unit
 Test Files  90 passed (90)
      Tests  1347 passed (1347)
exit 0

$ npm run test:db
 Test Files  35 passed (35)
      Tests  589 passed (589)
exit 0
```

`npx prisma validate` → `The schema at prisma/schema.prisma is valid 🚀`, exit 0.
`git status --porcelain -- Samples` → empty. No dependency added.

`npm run test:e2e` is out of this goal's gate per the task instruction. The e2e specs that
cover AC-4, AC-5, AC-7 and AC-10 are in the tree for when the container can run Playwright.

### Review repairs, round 1 on `hermes/mwkr46sw` (2026-11-17)

Applied the three changes `progress/review_mwknuude.md` requires, no new scope:

1. #12 `done` -> `pending` (see above); `feature_list.json` now has exactly one `in_progress`
   feature (#22), as `init.sh:95` requires.
2. `tests/unit/pin-auth-contract.test.ts` restored to an exact per-function first-statement
   assertion (see the AC-10 section above). The two contract tests' changes and title renames
   are now recorded before/after/why-not-weaker there and raised as `QUESTION`s.
3. Added the `unexecuted` marker to the AC-4, AC-5, AC-6, AC-7 and AC-9 rows of the table.

Re-runs in this container: `npx prisma generate` (needed after the merged schema change),
`npm run typecheck` exit 0, `npm run lint` exit 0, `npm run test:unit` 89/90 files and
1346/1347 tests green — the only red is the standing, environment-only
`tests/unit/env-file.test.ts:146` (`.env` absent), as recorded by the reviewer.
`bash init.sh` feature-list block: `[ok] 23 features, 1 in progress`.

## Not done / remains

- Review, then the owner's approval. The feature stays `in_progress`.
- E2E execution (out of gate for now).
- Features #23 and #24 were not started.
