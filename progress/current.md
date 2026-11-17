# Current session

**Feature:** #22 `roles_home_menu`
**Spec:** `specs/features/022-roles_home_menu.md` (owner rulings 2026-11-17)
**Started:** 2026-11-17
**Status:** in_progress — review changes applied, awaiting re-review

## Plan

Feature #22 is built on this branch across three rounds:

- **Round 1:** `SUPER_ADMIN` enum + promote-only migration, `roles.ts` hierarchy and
  `assertAdminOrAbove`, role-shaped admin surfaces, `/home` menu and landing, export Price as a
  number with the euro format, guard/unit tests.
- **Round 2:** stabilised the DB tests for the third role, fixed the promote rollback test,
  updated the shipped landing/export assertions and added the e2e home-menu/role-access cases.
- **Round 3:** re-ran the full gate (typecheck, lint, test:unit, test:db), each as its own
  command, and recorded the summaries in `progress/impl_roles_home_menu.md`.
- **Round 4 (this round, `hermes/mwkr46sw`):** applied every required change in
  `progress/review_mwknuude.md` — reverted #12's unrequested `done`, restored the exact
  per-function guard assertion in `pin-auth-contract.test.ts`, recorded all unit amendments in
  the AC-33 form and raised the two forced spec amendments as `QUESTION`s, and marked the
  e2e-only ACs as unexecuted. No new scope.

## Verification

```
npm run typecheck   -> exit 0
npm run lint        -> exit 0 (--max-warnings 0)
npm run test:unit   -> Test Files 90 passed (90); Tests 1347 passed (1347)
npm run test:db     -> Test Files 35 passed (35); Tests 589 passed (589)
npx prisma validate -> schema valid
```

`npm run test:e2e` is out of this goal's gate. `Samples/` unchanged; no dependency added.

## Round 4 verification

```
npx prisma generate -> client regenerated for the third Role member
npm run typecheck   -> exit 0
npm run lint        -> exit 0 (--max-warnings 0)
npm run test:unit   -> 89/90 files, 1346/1347 tests; only tests/unit/env-file.test.ts (.env absent)
bash init.sh        -> "[ok] 23 features, 1 in progress"; prisma validate red for no DATABASE_URL
```

## Not done / remains

- Review and the owner's approval; the feature stays `in_progress` until then.
- E2E remains unrun while Playwright cannot run in the container.
- #23 (`super_admin_dashboard`) and #24 (`open_items_sign_off`) were not started.
