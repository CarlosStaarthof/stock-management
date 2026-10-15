# Review — feature 12 `export_workbook`, branch `hermes/mv8rd5vh`

**Verdict:** CHANGES_REQUESTED

Reviewer: strict reviewer, 2026-10-15. Base checked: `origin/hermes/mv700xeb` = `1675cbe`
(`git merge-base` confirms the branch already contains it; the diff under review is
`1675cbe..88f7d66`, 3 rounds, 6 files).

## Gate result — NOT GREEN, NOT REPRODUCIBLE HERE

| Command | Result in the reviewer's container |
|---|---|
| `TEST_DATABASE_URL` | **not set** (`env` shows no such variable) |
| `node_modules` | **absent** (`npm run test:unit` -> `sh: vitest: not found`) |
| `npm run test:unit` | could not run |
| `npm run test:db` | `[test:db] TEST_DATABASE_URL is not set.` (exit 1, before any test) |
| `npm run test:e2e` | not runnable: no Playwright browsers (`~/.cache/ms-playwright` absent) |

Per the task, I stopped on the missing `TEST_DATABASE_URL` rather than wait, and connected to
no database. The implementer's report states 1330 unit / 584 db tests green in its own
container; I could **not** confirm that. Rule: no approval without a green gate I have run.
Separately, even taking the report at face value, the e2e half of the gate was never run
(`progress/impl_export_workbook.md`, Round 3 "Verification"), and AC-14 requires
`npm run test:e2e`. That alone blocks approval.

## Diff verified (`1675cbe..HEAD`)

```
progress/impl_export_workbook.md                   | +77
src/server/deploy/census.db.test.ts                |  2  (3 -> 4 migrations)
src/server/export/export-service.ts                |  +9 (depot ordering in listExportStockTakes)
src/server/schema/columns.db.test.ts               | +24 (AC-21 amended for the rename)
src/server/schema/referential.db.test.ts           | +37/-18 (expectRestrictViolation rewritten)
src/server/schema/rename-clonmel-cashel.db.test.ts | +294 (new, Risk 1)
```
`Samples/` clean (`git status --porcelain -- Samples/` empty). `feature_list.json` unchanged
(#12 still `in_progress`; not marked done). Nothing outside the feature's lane by file, but see
Required changes 2 and 3.

## Risk 1 — Clonmel -> Cashel migration test (read, not run)

`src/server/schema/rename-clonmel-cashel.db.test.ts` is, by reading, the right test:
- fresh throwaway schema (`:64-80`, `:131-141`), applies every migration with name `< RENAME_DIR`
  (`:138`), seeds Clonmel data incl. an `APPROVED` count with 2 lines, signer and signature
  (`:88-129`), applies the real rename SQL (`:174-177`);
- no row lost, per-line `itemId|quantity|unitPriceSnapshot` unchanged (`:178-197`); Clonmel gone,
  `loc_cashel/CASHEL/Cashel` present, children followed via `ON UPDATE CASCADE` (`:199-218`);
- stock take still loads and exports: `exportWorkbook` -> `Cashel_Stocktake_15-06-2026.xlsx`,
  sheets `Summary`,`Cashel`, `G3=2.01`, `G4=6`, TOTAL `8.01` (`:220-257`);
- in place: asserts `UPDATE "Location"`, no `DROP|CREATE TABLE|TYPE|SCHEMA|INDEX`, no
  `ALTER TYPE` (`:211-213`). The migration SQL
  (`prisma/migrations/20261013120000_rename_clonmel_to_cashel/migration.sql`) is a single
  `UPDATE`. `Location.code` is a text column; the only enums in `schema.prisma` are `Role`,
  `CountStatus`, `UnitKind`, `ProfileStatus`, `AuthEventKind`, none holding a depot, so no
  `ALTER TYPE ... RENAME VALUE` is needed. Requirement met by reading.
- Caveat: the "still exports" half swaps `globalThis.macroadsPrismaClient` for a schema-scoped
  client (`:236-262`), which depends on `src/server/db.ts` caching on that global (it does,
  `db.ts:19-23`). Sound, but unproven by me because I could not run it.

## Risk 2 — Samples workbook still says Clonmel (read, not run)

`Samples/Stock @ 01-Sep-2026.xlsx` is unmodified. The reader declares
`YARD_SHEET_NAMES = ["Dublin","Cashel"]` and one `LEGACY_SAMPLE_SHEET = { Cashel: "Clonmel " }`
alias (`src/lib/excel/workbook-reader.ts:33,42`), resolved at `:369-372`. `workbook-reader.test.ts:92-98`
opens the real sample and asserts 70 `Cashel` rows, and `:104-117` the row ranges. The seed goes
through the same reader. By reading, Risk 2 holds; the unit run that proves it was not
reproducible by me. The old spelling survives only in the allowed places (grep: reader, its test,
the rename test, `columns.db.test.ts`, `test-db.ts` comment, `schema-and-migration.test.ts`, the
spec).

## Acceptance criteria

"Evidence" is the test that would prove it. **PASS** only where I could confirm by running;
otherwise **UNVERIFIED** (not a pass).

| AC | PASS/FAIL | evidence |
|---|---|---|
| AC-1 two sheets, pure writer | UNVERIFIED | `tests/unit/export-workbook.test.ts` (exists; unit suite not runnable here) |
| AC-2 depot sheet shape | UNVERIFIED | `tests/unit/export-workbook.test.ts` |
| AC-3 derived value, formula TOTAL | UNVERIFIED | `tests/unit/export-workbook.test.ts`; also `rename-clonmel-cashel.db.test.ts:244-257` (2.01 / 8.01) |
| AC-4 no error cell | UNVERIFIED | `tests/unit/export-workbook.test.ts` |
| AC-5 depot-only Summary | UNVERIFIED | `tests/unit/export-workbook.test.ts` |
| AC-6 one depot per file | UNVERIFIED | `tests/unit/export-workbook.test.ts` |
| AC-7 held-only / showAll | UNVERIFIED | unit test + `src/server/export/export-service.db.test.ts` |
| AC-8 ADMIN only in service | UNVERIFIED | `export-service.test.ts`, `export-service.db.test.ts`; e2e half never run; the "breach run" the AC requires is not in the report |
| AC-9 signer + date as text | UNVERIFIED | unit + db test |
| AC-10 money lists | UNVERIFIED | `tests/unit/project-contract.test.ts` |
| AC-11 no dependency / schema change | UNVERIFIED | unit test; migration SQL read: data-only `UPDATE` |
| AC-12 route contract | **FAIL (unproven)** | `tests/e2e/analysis-export.spec.ts` exists (271 lines) but has **never been run** (impl report, Round 3 "Verification") |
| AC-13 real file end to end | **FAIL (unproven)** | same e2e spec, never run |
| AC-14 rest of product unchanged | **FAIL** | `test:e2e` not run; and more than two existing assertions were amended (see Required change 2) |
| AC-15 listing page | **FAIL (partly unproven)** | `src/app/analysis/export/page.test.ts` + db `listExportStockTakes` unverified by me; e2e half never run |
| AC-16 `Cashel`, never `Clonmel` | UNVERIFIED (strong by reading) | `rename-clonmel-cashel.db.test.ts`, `columns.db.test.ts` AC-21 test, `schema-and-migration.test.ts` |

## CHECKPOINTS.md

`CHECKPOINTS.md` is not in the working tree under that name in this review's reach; I applied the
rules in the task instead:
- [ ] Gate green and reproduced — not met (no `TEST_DATABASE_URL`, no `node_modules`, e2e never run).
- [x] Only `TEST_DATABASE_URL` used; no other database touched (by the implementer's own statement; I connected to none).
- [x] `Samples/` untouched; `feature_list.json` not marked `done`.
- [x] Risk 1 test exists, from a fresh schema, in place, no enum drop/recreate.
- [x] Risk 2 documented and covered by an existing test on the real sample.
- [ ] No existing assertion weakened/changed outside the spec's stated amendments — see change 2.

## Required changes

1. **Run the full gate where `TEST_DATABASE_URL` is set and dependencies are installed, and
   include the evidence.** `npm run test:unit`, `npm run test:db`, and — because AC-12, AC-13,
   AC-14 and AC-15 name it — `npm run test:e2e` (needs Playwright browsers and a database the
   run is allowed to use). `progress/impl_export_workbook.md` (Round 3, "Verification" /
   "Remaining") concedes `tests/e2e/analysis-export.spec.ts` has never been executed. Until it
   has run green, AC-12/13/15 have no passing proof. If e2e cannot be run under the
   "TEST_DATABASE_URL only" rule, go `BLOCKED` with a QUESTION to the owner rather than leaving
   the AC unproven.
2. **Account for every existing assertion that was changed, and get the AC-14 amendment ruled.**
   AC-14 says *exactly two* existing assertions are amended. This branch's diff changes, beyond
   those: `src/server/schema/referential.db.test.ts:70-95` (`expectRestrictViolation` rewritten
   from a raw SQLSTATE `23001` check to `P2003` + `meta.constraint` + a `pg_constraint.confdeltype`
   lookup), `src/server/schema/columns.db.test.ts:227-250` (AC-21), and
   `src/server/deploy/census.db.test.ts:103` (3 -> 4 migrations). The census and AC-21 edits are
   forced by the rename migration and look legitimate; the `referential.db.test.ts` rewrite is
   not caused by this feature at all (it is a Prisma engine behaviour change) and is **not
   mentioned anywhere in `progress/impl_export_workbook.md`**. Document each in the report with
   why it is not a weakening, and ask the owner to amend AC-14's "exactly two" so the spec and the
   diff agree (a finding that contradicts the spec is a QUESTION, not a silent change).
3. **Report the `export-service.ts` change.** `src/server/export/export-service.ts:331-358`
   adds a depot-ordering sort to `listExportStockTakes`. It is plausible (AC-15 "one control per
   active depot", stable order) but is not described in the Round 3 report and has no stated
   test. Name the test that fails without it, or drop it.
4. **Update `progress/current.md`.** It still describes feature #11 (dated 2026-09) and was not
   maintained during these rounds (HERMES §9: written while working).

## Observations (non-blocking)

- Risk 1's new test is well-formed; its enum clause is satisfied by there being no depot enum.
  If a future migration ever renames an enum value, the `not.toMatch(/ALTER TYPE/)` assertion
  (`rename-clonmel-cashel.db.test.ts:213`) would need to be inverted for that migration; it is
  specific to this one.
- `statementsOf` splits on `;` (`:36-43`); fine for the current SQL, brittle for any future
  migration containing `;` inside a string or `$$` block.
- The test builds its own `PrismaClient` from `DATABASE_URL ?? TEST_DATABASE_URL` (`:58`).
  Under `npm run test:db` `DATABASE_URL` is rebound to the test database, so it is safe there;
  run bare, it would prefer `DATABASE_URL`. Prefer `TEST_DATABASE_URL`-only to honour the
  "never connect elsewhere" rule even outside the runner.
- The implementer's note that its `.env` was synthesised in an earlier round (Round 4) is
  gitignored and not in the diff; fine.
