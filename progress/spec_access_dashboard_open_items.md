# Specs written — access, dashboard and one-step sign-off

**Date:** 2026-11-17   **Round:** 1 of 5   **Role:** spec-writer

## What was written

Three draft specs, and three pending entries in `feature_list.json`:

| Feature | Spec | Criteria |
|---|---|---|
| #22 `roles_home_menu` | `specs/features/022-roles_home_menu.md` | 12 |
| #23 `super_admin_dashboard` | `specs/features/023-super_admin_dashboard.md` | 13 |
| #24 `open_items_sign_off` | `specs/features/024-open_items_sign_off.md` | 15 |

`feature_list.json` gained milestone `M8 — Access, dashboard and one-step sign-off` and the
three `pending` / `draft` features. No implementation, schema, migration, test or source file
was changed. Feature #12 remains the only `in_progress` feature.

## Evidence read before writing

- `feature_list.json`, `specs/domain-model.md`, `specs/features/003-auth_and_roles.md`,
  `specs/features/006-item_master_ui.md`, `specs/features/009-entry_submit.md`,
  `specs/features/010-stock_takes_history.md`, `specs/features/011-analysis.md`,
  `specs/features/012-export_workbook.md` and `specs/features/021-pin_auth.md`.
- `prisma/schema.prisma` and `prisma/migrations/20260925120000_pin_profiles/migration.sql`.
- The role, landing, guard, shape, profile-admin, item-master, stock-entry, submit, summary,
  lifecycle, export, analysis and calendar source.
- `docs/architecture.md`, `CHECKPOINTS.md`, `init.sh`.

## Verification performed

```
node -e '<feature_list validation from init.sh>'
  -> 23 features, one in progress (#12 export_workbook), no problems
  -> #22 pending/draft 12 ACs; #23 pending/draft 13 ACs; #24 pending/draft 15 ACs
git status --porcelain
  -> feature_list.json modified; the three specs untracked; no source file touched
git diff --stat
  -> feature_list.json only
```

`npm run test:unit`, `typecheck`, `lint`, `test:db` and `test:e2e` were not run: this round
changed no TypeScript, test or schema file, and #12's working tree already owns the gate.

## Decisions that need the owner

The specs record every decision and open question. The three that block final approval:

1. **#22 Q1/Q2/Q3** — the migration's display name for a missing `carlos-staarthof` row, and
   whether the one-super-admin rule is also a database constraint.
2. **#23 Q1** — "one row per stock take" is read as one row per approved `StockCount` (one
   depot, one count date), not one per period.
3. **#24 Q1/Q2/Q3** — the direct conflict between #22's "`YARD_STAFF` never sees a price" and
   #24's "the counter sees the total and signs off". This spec limits the exception to the
   review page, but it is the owner's ruling to make. Q2 (who may sign off) and Q3 (legacy
   `SUBMITTED` rows) also need one answer each.

No spec is `approved`; no feature is `pending` implementation until the owner approves these
answers.
