# Current session

**Feature:** #5 `seed_from_workbook`
**Spec:** `specs/features/005-seed_from_workbook.md` (approved 2026-09-09, 31 criteria)
**Started:** 2026-09-09
**Status:** in_progress — spec approved by the user, implementation not started

## Plan

Read the Dublin and Clonmel sheets of `Samples/Stock @ 01-Sep-2026.xlsx` into `Supplier`,
`ItemType`, `Item`, `ItemPrice` and `ItemLocation`. Insert-only, atomic, idempotent. No UI:
the only interface is `npm run seed:workbook` and the report it prints.

### Files expected to be touched

- `src/lib/excel/workbook-reader.ts` (+ test) — reads columns A–E of the two yard sheets
- `src/lib/units.ts` (+ test) — Part 2's unit table
- `src/server/items/workbook-plan.ts` (+ test) — pure planning, no database
- `src/server/items/workbook-import-service.ts` (+ `.db.test.ts`) — the transactional write
- `scripts/seed-workbook.ts`, `package.json` (`seed:workbook`, `exceljs` pinned)
- `tests/unit/project-contract.test.ts` — 004 AC-31's `unitPrice` scan amended to an exact
  permitted list (AC-29), not deleted

No migration. `prisma/schema.prisma` and `prisma/migrations/` must be byte-identical after.

## Approach

The numbers were re-derived from the workbook in the spec session, not inherited: **152**
source rows → **140** items (12 appear on both sheets), 10 suppliers, 19 types, 129 prices,
152 links, 15 flagged `needsReview`.

Decisions the user made at approval:

- **Internal whitespace is preserved**, so the two Kestrel bicycle-logo pairs stay four
  items rather than two. Recorded with cell references in the spec's Open questions §5,
  including the accepted consequence: housekeeping cannot surface them.
- The two below-total fuel rows get `needsReview`; cross-sheet conflicts do not;
  `ItemType.code` keeps the workbook's own spelling.

Two properties carry the feature: **AC-22** (insert-only, so a re-run never reverts a
human's correction — proved by editing four rows and re-running) and **AC-24** (one
transaction, so a part-way failure leaves zero rows).

## Work log

<!-- Update as you go, not at the end. If the session dies, this file is what survives. -->

## Verification

Gate at the moment of approval — full run, database checks executed:

```
bash ./init.sh                                        ->  exit 0
    [ok]   18 features, 1 in progress
    [ok]   typecheck / lint / test:unit / test:e2e
==> Database
    [ok]   database reachable
    [ok]   prisma migrate status
    [ok]   npm run test:db
[OK] Environment ready
```

<!-- Paste the closing run here. It must not say "(database checks skipped)" — C2.1. -->

## Blockers

None.

## Next

Implementer run against the 31 approved criteria, then a reviewer run, then the user's
sign-off. Carried in from #4:

- `prisma migrate dev` rewrites `prisma/migrations/migration_lock.toml`. This feature adds
  no migration, so it should never run it — AC-30 asserts the file is untouched.
- The reviewer's #4 observation that AC-6's monetary-column test filters on `/price/i` is
  still open; this feature touches `src/server/items/`, not that test.
