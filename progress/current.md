# Current session

**Feature:** none
**Status:** idle

## Plan

<!-- On starting a feature: record the feature, the time, and a brief plan here BEFORE
     writing any code. See AGENTS.md section 4. -->

## Work log

<!-- Update as you go, not at the end. If the session dies, this file is what survives. -->

## Verification

<!-- Paste the tail of the init run, including the [OK] line. -->

## Blockers

None.

## Next

Feature #5 `seed_from_workbook`. Its spec `specs/features/005-seed_from_workbook.md` does
not exist yet, so the next action is a `spec-writer` run, not an `implementer` run.

Feature #4 is closed; `progress/history.md` holds its summary. Two things #5 inherits:

- **De-duplicating supplier-less items is #5's job.** Postgres treats `NULL`s as distinct,
  so `@@unique([description, supplierId])` cannot stop two items sharing a description when
  both have no supplier. `Dublin!A45` `School Logo Triangle` is the workbook row. This must
  appear in #5's spec as a criterion, not be discovered again.
- **Check `prisma/migrations/migration_lock.toml` after any `prisma migrate dev`.** The
  installed CLI rewrites its comment header; a test now fails if it drifts.
