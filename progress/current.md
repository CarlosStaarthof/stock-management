# Current session

**Feature:** #22 `roles_home_menu`
**Spec:** `specs/features/022-roles_home_menu.md` (owner rulings 2026-11-17, R1–R7)
**Started:** 2026-11-17
**Status:** in_progress — owner rulings applied, ready for re-review

## Plan

Feature #22 is built on this branch across four rounds:

- **Round 1:** `SUPER_ADMIN` enum + promote-only migration, `roles.ts` hierarchy and
  `assertAdminOrAbove`, role-shaped admin surfaces, `/home` menu and landing, export Price as a
  number with the euro format, guard/unit tests.
- **Round 2:** stabilised the DB tests for the third role, fixed the promote rollback test,
  updated the shipped landing/export assertions and added the e2e home-menu/role-access cases.
- **Round 3:** re-ran the full gate (typecheck, lint, test:unit, test:db), each as its own
  command, and recorded the summaries in `progress/impl_roles_home_menu.md`.
- **Round 4 (`hermes/mwkr46sw`):** applied every required change in
  `progress/review_mwknuude.md` — restored the exact per-function guard assertion in
  `pin-auth-contract.test.ts`, recorded all unit amendments in the AC-33 form, and marked the
  e2e-only ACs as unexecuted.
- **Round 5 (this round, `hermes/mwkr46sw`):** applied the owner's rulings. Recorded R5–R7 in
  spec 022: AC-10 now lists the item-master and pin-auth contract amendments and their two
  title renames (R5); feature #12 is signed off and set `done` (R6); and AC-4 to AC-7 plus the
  `/home` half of AC-9 gain unit proofs in `src/app/home/page.test.ts`,
  `src/app/page-guards.test.ts` and `tests/unit/home-contract.test.ts`, with the e2e specs
  left as written (R7). No new scope.

## Verification (this round, fast gate)

```
npm run typecheck   -> exit 0
npm run lint        -> exit 0 (--max-warnings 0)
npm run test:unit   -> 92 passed / 1 failed files (93); 1367 passed / 1 failed tests (1368)
                       only red: tests/unit/env-file.test.ts:146 (.env absent, environment-only)
feature_list check  -> in_progress: #22; #12: done approved 14 ACs; no invalid done
```

The earlier full run recorded `test:db` 35/35 files and 589/589 tests; it was not re-run this
round because no database code or schema changed. `npm run test:e2e` is out of this goal's
gate. `Samples/` unchanged; no dependency added.

## Not done / remains

- Re-review and the owner's approval; the feature stays `in_progress` until then.
- E2E remains unrun while Playwright cannot run in the container; the e2e-only criteria are
  listed in `progress/impl_roles_home_menu.md`.
- #23 (`super_admin_dashboard`) and #24 (`open_items_sign_off`) were not started.
