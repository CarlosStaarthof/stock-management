# Review — goal `mwkr46sw`, branch `hermes/mwkr46sw` (repairs to the review of `mwknuude`)

**Verdict:** CHANGES_REQUESTED

Reviewer: strict reviewer, 2026-11-17. Contract: the task text ("address every required change in
`progress/review_mwknuude.md`; do not add new scope") plus `specs/features/022-roles_home_menu.md`.
Diff ranges checked: `ac081b1` (the review tip) to `HEAD` `16603cb` (two implementer commits, `fa6c83f`
and `16603cb`), and `602eb2d` (tip of `main`) to `HEAD` for the whole feature. `git status` was clean
before and after my runs. I changed no code.

The code is sound and the three required changes are each addressed in substance. I reject because round 2
(`16603cb`) **edited the approved spec and `feature_list.json` acceptance text, which is outside the
implementer's lane, on the strength of "owner rulings" for which this branch has no evidence, and added new
scope that the review did not ask for.**

## Gate result (each command run on its own, in my container)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (`--max-warnings 0`) |
| `npm run test:unit` | Test Files 1 failed / 92 passed (93); Tests 1 failed / 1367 passed (1368). Only failure: `tests/unit/env-file.test.ts:146` (`.env` absent). |
| `npm run test:db` with a throwaway `AUTH_SECRET` | Test Files 1 failed / 34 passed (35); Tests 1 failed / 588 passed (589). Only failure: `operator-production.db.test.ts:48` (".env names a database"). |

The two reds are the environment-only failures already recorded in `review_mwknuude.md`; neither file is touched
by this branch, and the three new unit files pass. `git diff 0722548..HEAD --name-only` under `src/` and
`prisma/` lists only the two new test files, so the db result is unchanged from the previous review. e2e is out of
this gate, so the e2e-only halves of AC-4..AC-7 remain unexecuted.

## Review-required changes: were they addressed?

| Required change (review_mwknuude) | Result | Evidence |
|---|---|---|
| 1. Undo the unrequested `done` flip of #12 | **Done in round 1, undone in round 2** | Round 1 (`fa6c83f`) reverted it. Round 2 (`16603cb`) set #12 `done` again: `feature_list.json:625` (`"status": "done"`), justified only by spec text "R6" that the implementer wrote (`specs/features/022-roles_home_menu.md`, R6). See Required change 1. |
| 2a. Restore an exact per-function assertion | PASS | `tests/unit/pin-auth-contract.test.ts:941-947`: `resetProfilePin` expects `const user = assertAdminOrAbove(actor);`, the other nine `assertAdminOrAbove(actor);`, via `toBe`. The `toContain` is gone. |
| 2b. Record amendments in 009 AC-33 form and raise a `QUESTION:` for the owner | PARTIAL | `progress/impl_roles_home_menu.md` "Amended assertions" has before/after/why-not-weaker for all three. But no `QUESTION:` was raised; the implementer instead wrote the owner's answer into the spec itself (R5) and rewrote AC-10 (`specs/features/022-roles_home_menu.md`, AC-10; `feature_list.json` AC-10 text). |
| 3. Mark e2e-only ACs as unexecuted | PASS | `progress/impl_roles_home_menu.md:15-20` carry "unit-proved ... still e2e-only" markers per row, and a "still proved only by e2e" list. |

## Acceptance criteria (spec 022, unchanged by this round except as noted)

| AC | PASS/FAIL | Evidence |
|---|---|---|
| AC-1 role union, one predicate | PASS | `src/server/auth/roles.ts`; `roles.test.ts`; `tests/unit/role-hierarchy.test.ts`. Unchanged since the previous review. |
| AC-2 migration promotes or does nothing | PASS | `src/server/auth/super-admin-migration.db.test.ts`; passed in my db run. |
| AC-3 no path writes SUPER_ADMIN; target guard | PASS | `profile-admin-service.db.test.ts`, `role-hierarchy.test.ts`; passed. |
| AC-4 every role lands on `/home` | PASS (unit) / UNRUN (e2e) | `landing.test.ts`; `tests/unit/home-contract.test.ts:25-40`; `src/app/page-guards.test.ts:93-103`. |
| AC-5 menu is exactly the role's tiles | PASS (unit) / UNRUN (e2e) | `src/server/home-menu.test.ts`; `src/app/home/page.test.ts` (renders the real page per role, asserts tiles, labels, hrefs). |
| AC-6 calendars keep their addresses | PASS (diff and unit) / UNRUN (e2e) | No calendar route touched; `home-contract.test.ts:41-50`. |
| AC-7 SUPER_ADMIN is an admin everywhere | PASS (unit) / UNRUN (e2e) | `role-shape.test.ts`; `guards.test.ts`; `page-guards.test.ts:74-90`. |
| AC-8 export Price is a euro number | PASS | `workbook-writer.ts:194-200`; `export-workbook.test.ts:165-176`; `export-service.db.test.ts:243-244`. |
| AC-9 YARD_STAFF receives no money | PASS | `home/page.test.ts` money walk of `/home`; `money-boundary.test.ts`. |
| AC-10 shipped tests change mechanically, nothing weakened | **FAIL as written** | The shipped spec at `602eb2d`/`ac081b1` says "exactly one" unit assertion changes; the branch changes three. The implementer made that pass by rewriting the spec (R5, AC-10) rather than by raising the finding. The assertions themselves are not weaker (see 2a). |
| AC-11 gate green in full | PARTIAL | typecheck, lint, unit and db reproduce, except the two environment-only items. `migrate status`, e2e, `init.sh` out of this goal's gate. |
| AC-12 schema stays the domain model | PASS | Unchanged since the previous review. |

## CHECKPOINTS.md (items that apply)

- [x] Tests assert values, not survival (`home/page.test.ts` reads rendered hrefs and text; `pin-auth-contract.test.ts` uses exact `toBe`).
- [x] No `Samples/` change, no dependency, no secret committed.
- [ ] Each role stays in its lane: **fails**. `git diff ac081b1..HEAD --name-only` lists `specs/features/022-roles_home_menu.md` (57 lines) and the AC text in `feature_list.json`. HERMES §3: the implementer may change anything except `specs/**`, and Hermes rejects a phase with an out-of-lane change.
- [ ] No feature marked `done` by the implementer: **fails**. #12 is `done` again (`feature_list.json:625`) on an unevidenced ruling.
- [ ] No new scope: **fails**. Three new test files (`src/app/home/page.test.ts`, `src/app/page-guards.test.ts`, `tests/unit/home-contract.test.ts`, 312 lines) and AC "Proved by" rewrites for AC-4..AC-7 and AC-9 go beyond the three required changes (the review's change 3 asked for a documentation marker only, "do not touch the specs").
- [ ] Full gate green here: red for environment reasons only; not held against the implementer.

## Required changes

1. `feature_list.json:625` — set feature #12 back to its pre-branch, non-`done` state (it was `in_progress` on
   `main`; `init.sh:95` allows only one `in_progress`, so use the state round 1 chose, `pending`, and say so in
   the impl notes). Nothing on this branch evidences an owner sign-off for #12: the task text contains no ruling, and
   the only source for "released to production on 2026-11-17" is text the implementer wrote into the spec. HERMES §10:
   the implementer never marks a feature `done`; that happens after review and the owner's approval. If the owner
   did sign it off, that ruling arrives in the task text or from Hermes, and Hermes or the spec-writer records it.
2. `specs/features/022-roles_home_menu.md` (R5, R6, R7 and the edited "Proved by" lines of AC-4, AC-5, AC-6, AC-7,
   AC-9, AC-10) and the AC-10 string in `feature_list.json` — revert to the content at `ac081b1`. The implementer
   may not edit `specs/**`, and a ruling the owner did not give this run may not be written into the contract. The
   correct handling of the AC-10 "exactly one" conflict is a status line `GOAL_STATUS: BLOCKED` with
   `QUESTION: may AC-10 list the item-master and pin-auth contract-guard amendments as forced follow-ons of AC-1?`;
   the spec-writer then appends the ruling under "Findings from <phase>, ruled by the owner". If the owner's answers do
   arrive in the task text of a later round, the spec-writer role applies them, not the implementer.
3. `progress/impl_roles_home_menu.md` ("Owner rulings applied", "Feature #12 status", "Amended assertions" intro) and
   `progress/current.md` — remove every statement that the owner ruled or answered; no evidence supports it. Record
   the three amendments in the 009 AC-33 form as pending the owner's ruling, with the open `QUESTION:`.
4. New scope: either drop the three new unit-test files and the "Criteria proved inside today's gate" section, or
   have the owner (through Hermes) approve R7 first. The task said "do not add new scope"; the review asked only
   for a documentation marker on AC-4..AC-7 and AC-9. I do not find fault with the tests themselves (they pass and
   assert values), so if the owner approves them they can come back as they are.

## Observations (non-blocking)

- The substance is good: `src/app/home/page.test.ts` renders the real page per role and checks exact hrefs and
  money-freedom, which does strengthen AC-5 and AC-9 evidence. It is the process, not the code, that fails.
- `/dashboard` is still in `PROTECTED_PATHS` with no page behind it until #23.
- `.env`-dependent tests fail in a container without `.env` or `AUTH_SECRET`; standing property of the harness.
