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

## Round 2 — owner rulings applied, 2026-11-17

The owner answered the four blocking questions. All three specs now carry a
`## Owner rulings, 2026-11-17` section, and the affected decisions, criteria, out-of-scope
boundaries and open questions were amended; no implementation or schema file was touched.

| Ruling | Applied in |
|---|---|
| R1 — `YARD_STAFF` never sees a price or total and cannot sign off. A staff counter finishes unsigned; an `ADMIN`/`SUPER_ADMIN` reviews, prices and signs off. An administrator who counts signs off in one step. | #22 D5/AC-9; #24 D2–D6, D11, AC-5–AC-8, AC-13, AC-14 and the change list |
| R2 — The #22 migration promotes `carlos-staarthof` only if it exists and never creates a profile. | #22 D2, AC-2, AC-3, Data touched, out of scope, Q3 |
| R3 — One records row per approved `StockCount`, one per depot per stock take, matching the export. | #23 D3/AC-8; #24 AC-12 |
| R4 — Legacy `SUBMITTED` counts stay approvable once by an `ADMIN` or `SUPER_ADMIN`, with no conversion. | #23 D3/AC-8/dependency note; #24 D7, AC-13, change list, out of scope |

### #24 design consequence

The draft's review-only money exception is gone. To keep the legacy `SUBMITTED` approval
unambiguous, #24 adds a fourth status, `PENDING_SIGN_OFF` ("Awaiting sign-off"): a staff
finish writes it, and only `signOffCount` (an `ADMIN`/`SUPER_ADMIN`) leaves it for
`APPROVED`. `SUBMITTED` is never written for a new count. This is recorded as D11, AC-1,
AC-13 and changes 5, 6, 9 and 11.

### Verification

```
node -e "require('./feature_list.json')"
  -> parses; #22 pending/draft 12 ACs, #23 pending/draft 13 ACs, #24 pending/draft 15 ACs
git diff --stat
  -> feature_list.json, the three specs and this progress file; no source, schema,
     migration or test file
```

No gate was run: this round changes Markdown and the feature registry only. No feature is
`approved`; all three remain `pending` with `spec_status: draft` for the owner's approval.

## Round 3 — review fixes applied, 2026-11-17

Closed `progress/review_mwkjd6rb.md` (CHANGES_REQUESTED). Spec-only; no code, schema,
migration, test or `Samples/` change. No new scope.

| Required change | Applied in |
|---|---|
| 1 — Close the `SUPER_ADMIN` takeover path | #22 AC-3 and the guards paragraph: `resetProfilePin`, `clearAccountLock`, `changeProfileRole`, `deactivateProfile` and (as defence in depth) `approveProfile`/`rejectProfile` refuse a `SUPER_ADMIN` target with a typed error and an unchanged row, except an own-PIN reset; the `ADMIN`-resets-`SUPER_ADMIN` test returns no PIN and changes no column. #23 AC-7 states the same protection from every other actor. |
| 2 — Enumerate the shipped assertions each feature amends | #22 AC-10 names `tests/unit/export-workbook.test.ts:165` before/after/why-not-weaker. #24 AC-14 reworded so the administrator review adds a third, admin-only euro-bearing route rather than contradicting 009 AC-21/22 and 011 AC-19; #24 AC-15 lists every changed shipped assertion (a)–(j); change-list item 18 adds how `PENDING_SIGN_OFF` renders on the calendar, `/stock-takes` and `/analysis` with no euro. |
| 3 — Decide what Stock Calendar means for `ADMIN` | #22 D4 now records the per-role tile: `/stock-entry` for `YARD_STAFF`, `/stock-takes` for `ADMIN`/`SUPER_ADMIN`; the tradeoff is named, the tile table, AC-5 and AC-6 assert the `href` per role, and Q2 is updated. |

`feature_list.json` acceptance arrays for #22, #23 and #24 were regenerated from the amended
specs (no other file changed). The five pre-existing spec/JSON drifts the review noted are
included in that regeneration.

### Verification

```
node feature-list validation (same logic as init.sh)
  -> 23 features, 1 in progress (#12 export_workbook), problems: none
node spec-vs-feature_list acceptance diff (#22/#23/#24)
  -> diffs 0
git status --porcelain -- Samples
  -> empty
```

No `npm` gate was run: this round changes Markdown and the feature registry only, and the
container has no `.env`/`DATABASE_URL` (the review recorded the same environment-only reds).
No feature is `approved`; all three remain `pending` with `spec_status: draft` for review and
the owner's approval.
