# Review — feature 12 `export_workbook`, branch `hermes/mva3eswl`

**Verdict:** APPROVED

Reviewer: strict reviewer, 2026-10-15. Contract: the task text, `specs/features/012-export_workbook.md`
(AC-1..AC-16) under the owner rulings of 2026-10-15 (R9-R13). `git merge --ff-only
origin/hermes/mv9ycfs7` -> "Already up to date" (HEAD `081c3ac`, which contains `mv9ycfs7`).
No code was changed by this run; `git status` is clean and `Samples/` is untouched
(`git diff main..HEAD --stat -- Samples` empty).

## Gate result (each command run on its own, in my container)

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0, no diagnostics |
| `npm run lint` | exit 0 (`--max-warnings 0`) |
| `npm run test:unit` | **Test Files 1 failed / 86 passed (87); Tests 1 failed / 1329 passed (1330)**. The single failure is `tests/unit/env-file.test.ts` "`.env` does not exist". |
| `npm run test:db` (bare) | 6 files / 36 tests failed: 34 are `CredentialSecretError: AUTH_SECRET is not set` (auth db files), 1 is `operator-production.db.test.ts` ("`.env` names a database"), 1 a consequence of the missing secret (`UNAVAILABLE` vs `SIGNED_IN`). |
| `npm run test:db` with a throwaway `AUTH_SECRET` and `PIN_PEPPER` in the environment | **Test Files 1 failed / 33 passed (34); Tests 1 failed / 583 passed (584)**; the one failure is again `operator-production.db.test.ts`, "`.env` names a database". |

Why I do not treat the red as a defect of feature 12. All the failures are environment, not code:
this container has no `.env` (it is gitignored, `.gitignore:14`) and no `AUTH_SECRET`. No file in
the failing set is touched by the branch relative to `main` (`git diff main..HEAD --stat` on
`env-file.test.ts` and `operator-production.db.test.ts` is empty). I proved this rather than assumed it:

- A synthetic, gitignored-shape `.env` (the `validSettings` shape from the test itself) in a
  scratch export of `HEAD` under `/tmp/opencode/wt` makes `env-file.test.ts` pass (6/6).
- A one-line placeholder `.env` (`DATABASE_URL=...invalid`, removed afterwards) in the repository makes
  `npm run test:db -- src/server/deploy/operator-production.db.test.ts` pass (1/1).
- With `AUTH_SECRET` supplied, every auth db file passes.

Together that is 87/87 unit and 34/34 db, matching the implementer's claim of 1330 and 584 in
`progress/impl_export_workbook.md` (R9 table). The repository was left clean (`.env` removed).
The files that carry feature 12 were green in every run: `export-service.db.test.ts` (11),
`rename-clonmel-cashel.db.test.ts` (1), `referential.db.test.ts` (13), `columns.db.test.ts` (19),
`census.db.test.ts` (3), and `tests/unit/export-workbook.test.ts` (21+), `project-contract.test.ts`,
`stock-entry-contract.test.ts`, `schema-and-migration.test.ts`.
End-to-end is out of this feature's gate (R9), so `test:e2e` was not run.

## Claims verified against the diff

- R11: `src/server/schema/rename-clonmel-cashel.db.test.ts:69-77` reads `TEST_DATABASE_URL` only and throws at module load
  when it is empty. No reference to `DATABASE_URL` as a connection source remains (only in comments).
- R12: the depot sort is kept at `src/server/export/export-service.ts:353-357`; the named test is
  `export-service.db.test.ts:297-311` (`AC-15: one stock take, one download per depot, newest first`),
  expecting `[DUBLIN, CASHEL]`. The mutation run is reported in the impl report (R12 section); I did not
  re-run it (it would mean editing code), I confirmed by reading that the test's expectation is order-specific.
- R10: `progress/impl_export_workbook.md` ("R10 — every existing assertion this feature changes, before vs now")
  covers all five amended assertions listed in AC-14, each with before / now / why not weaker. Census: `project-contract.test.ts`
  keeps the file-literal lists (`:210`, `:283`, `:303`) as equalities.
- R13: `progress/current.md` now describes feature 12.
- No dependency change (`git diff main..HEAD -- package.json` empty), `feature_list.json` only changed spelling in acceptance text
  (#12 not marked `done`).

## Acceptance criteria

| AC | PASS/FAIL | evidence |
|---|---|---|
| AC-1 two sheets, pure writer | PASS | `tests/unit/export-workbook.test.ts:118,123,128,135` (green) |
| AC-2 depot sheet shape | PASS | `export-workbook.test.ts:144,157`; `export-service.db.test.ts:228` |
| AC-3 derived value, formula total | PASS | `export-workbook.test.ts:175,189`; `export-service.db.test.ts:248` |
| AC-4 no error cell, total moves with data | PASS | `export-workbook.test.ts:206,225` |
| AC-5 summary for one depot | PASS | `export-workbook.test.ts:244,254` |
| AC-6 one depot per file | PASS | `export-workbook.test.ts:268,277`; `export-service.db.test.ts:260` |
| AC-7 held-only / showAll | PASS | `export-workbook.test.ts:290,309`; `export-service.db.test.ts:266` |
| AC-8 ADMIN only, service refuses | PASS (service); route/redirect half NOT RUN (R9) | `export-service.db.test.ts:186` (Forbidden / Unauthorized); route half is in `tests/e2e/analysis-export.spec.ts` |
| AC-9 signer and date on sheet | PASS | `export-workbook.test.ts:321,331`; `export-service.db.test.ts:284` |
| AC-10 money lists amended | PASS | `tests/unit/project-contract.test.ts:210,283,303` (green in `test:unit`) |
| AC-11 no dependency/schema change, self-contained | PASS | `export-workbook.test.ts:340,356`; `census.db.test.ts` (4 migrations) |
| AC-12 route contract | PASS (file name and refusal in service); HTTP half NOT RUN (R9) | `export-service.db.test.ts:206,216`; `tests/e2e/analysis-export.spec.ts` unrun |
| AC-13 live ADMIN download | NOT RUN (R9: e2e out of gate) | `tests/e2e/analysis-export.spec.ts` in the tree |
| AC-14 rest of product unchanged | PASS | typecheck, lint, unit and db as above; R10 enumeration in the impl report |
| AC-15 listing page | PASS (service); browser half NOT RUN (R9) | `export-service.db.test.ts:297,313`; `src/app/analysis/export/page.test.ts` |
| AC-16 Cashel, never Clonmel | PASS | `rename-clonmel-cashel.db.test.ts` (lossless, in place, still exports `Cashel_Stocktake_15-06-2026.xlsx`); `columns.db.test.ts` |

## CHECKPOINTS.md

- C1: [x] one feature; [x] spec exists; [x] criteria satisfied within R9; [x] `impl_export_workbook.md` lists files; [x] `feature_list.json` unchanged in status.
- C2: [x] typecheck 0; [x] lint 0; [x] full unit/db run (red only on missing `.env`/`AUTH_SECRET`, shown green with them; see above);
  [x] new service functions have success and failure tests (`exportWorkbook`, `listExportStockTakes`); [x] tests assert values (cells, names, totals); [x] real database, no mocks.
- C3: [x] writer imports `exceljs` and `src/lib/` only (`export-workbook.test.ts:128`); [x] data access in `src/server/export/`; [x] writer is pure.
- C4: [x] value derived, never stored; [x] money-free for `YARD_STAFF` (service refuses first); [x] `Samples/` unmodified; [x] snapshot is read, never rewritten.
- C5: [x] typed errors (`ForbiddenError`, `UnauthorizedError`); [x] no secret committed (`.env` ignored; my scratch `.env` removed).
- C6: [x] `progress/current.md` updated; [x] tree clean.
- C7 (advisory): empty and error states are in the spec and page; no phone-width run (e2e out of gate).

## Required changes

None.

## Observations (non-blocking)

1. The gate depends on a local `.env` and an `AUTH_SECRET` in the environment, which a fresh container does
   not have. A reviewer or CI container without them sees 2 + ~36 red tests that are unrelated to feature 12.
   Consider a documented, scripted way to provide them for the gate.
2. AC-8's route half, AC-12's HTTP half, AC-13 and AC-15's browser half remain unproved until the e2e container is
   fixed (R9). Re-run `tests/e2e/analysis-export.spec.ts` then, before the owner sets the feature `done`.
3. `progress/current.md` shrank by ~1,950 lines versus `main` (old content moved out). Harmless, but check `progress/history.md` holds it.
