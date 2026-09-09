# Current session

**Feature:** #4 `domain_schema`
**Spec:** `specs/features/004-domain_schema.md` (approved 2026-09-09, 31 criteria)
**Started:** 2026-09-09
**Status:** in_progress — spec approved by the user, implementation not started

## Plan

Create the eight stock-domain models of `specs/domain-model.md` Part 3, the repository's
second migration, and the model-level tests that prove the constraints are enforced by
Postgres rather than by a form. No UI, no route, no service.

### Files expected to be touched

- `prisma/schema.prisma` — eight models, two enums, three relation fields on `User`
- `prisma/migrations/<ts>_create_stock_domain/migration.sql` — additive; two hand-written
  `CHECK` constraints and the idempotent `Location` seed
- `src/server/test-db.ts` — moved from `src/server/auth/test-db.ts`, extended to the new
  tables, restoring `Location` to the two migration-seeded rows
- `src/server/schema/columns.db.test.ts`, `constraints.db.test.ts`, `referential.db.test.ts`
- `tests/unit/schema-and-migration.test.ts`, `tests/unit/project-contract.test.ts` — the
  #3 guard assertions **replaced**, not deleted, by set-equality over nine models and
  three enums
- Four existing `*.db.test.ts` files — import path only

## Approach

The schema is `specs/domain-model.md` Part 3 verbatim, with nothing added. Two things the
spec settles rather than leaves open, both approved by the user:

1. `Location` is seeded by this migration (`loc_dublin`, `loc_clonmel`), because the table
   belonged to no feature and Invariant 7 is undefined while it is empty.
2. `StockCount.periodMonth` carries a `CHECK (1..12)`.

Referential policy: **an entity history refers to cannot be deleted** (`Restrict`), and
rows that are parts of another row go with their parent (`Cascade`). Archival is
`active = false` throughout.

## Work log

<!-- Update as you go, not at the end. If the session dies, this file is what survives. -->

## Verification

Gate at the moment of approval — full run, database checks executed:

```
bash ./init.sh                                        ->  exit 0
    [ok]   18 features, 0 in progress
    [ok]   npm run typecheck / lint / test:unit / test:e2e
==> Database
    [ok]   database reachable
    [ok]   prisma migrate status
    [ok]   npm run test:db
[OK] Environment ready
```

<!-- Paste the closing run here, including the [OK] line. It must not say
     "(database checks skipped)" — CHECKPOINTS.md C2.1. -->

## Blockers

None.

## Next

Implementer run against the 31 approved criteria, then a reviewer run, then the user's
sign-off. Two things to carry forward beyond this feature:

- AC-15 records a real gap rather than hiding it: Postgres treats `NULL`s as distinct, so
  `(description, supplierId)` cannot stop two supplier-less items sharing a description.
  `Dublin!A45` is the row in question. De-duplication is **#5's** job and must appear in
  its spec.
- `unitKind` defaults to `UNIT`. Raised with the user at approval and deliberately kept:
  Part 2 derives it from `unitLabel` at import, and `needsReview` plus #15's housekeeping
  screen surface the items where it was never known.
