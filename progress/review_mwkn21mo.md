# Review — goal mwkn21mo: fixes for `progress/review_mwkjd6rb.md` (specs 022, 023, 024)

**Verdict:** APPROVED

Reviewer: strict reviewer, 2026-11-17. Contract: the task text. Fast-forward to `origin/hermes/mwkjd6rb`,
address every required change of `review_mwkjd6rb.md`, add no new scope. Branch `hermes/mwkn21mo`, one
commit on top of the merged branch (`ac3221d` over `48bfaa0`).

## Claims verified against the diff

- `git merge-base --is-ancestor origin/hermes/mwkjd6rb HEAD` is true: the fast-forward was done and `48bfaa0` is in history.
- `git diff 48bfaa0..HEAD --name-status` is exactly five files: `feature_list.json`,
  `progress/spec_access_dashboard_open_items.md`, and the specs `022`, `023` and `024`.
  `git diff 48bfaa0..HEAD --stat -- src tests prisma scripts docs Samples package.json` is empty. No code, schema,
  test, doc or `Samples/` change. The lane is respected, the tree is clean, and the `progress/impl_*` and
  `progress/review_mwkjd6rb.md` files are untouched. (The implementer's report is the `Round 3` section appended to
  `progress/spec_access_dashboard_open_items.md`, a spec-lane file.)
- `feature_list.json`: ids 22, 23 and 24 are still `pending` / `draft`, with 12, 13 and 15 criteria. I checked every
  `acceptance` entry against its spec, ignoring markdown and punctuation: **all 40 appear verbatim in the spec** (the
  five old drifts are also gone). #12 is still the only `in_progress` feature and nothing is `done`.
- New scope: none. The changes are limited to the three required changes. The `-- contract-step:` clause in 024
  AC-1 and the "(R4)" cross-references are clarifications of existing decisions, not features.

## Gate result

| Command | Result |
|---|---|
| `bash init.sh` | `[FAILED] 3 problem(s)`: `prisma validate` (`DATABASE_URL` unset), `test:unit` (1 test), `test:e2e` (phase 1). Database checks `[skip]`. |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (`--max-warnings 0`) |
| `npm run test:unit` | 86 files passed, 1 failed; 1329 / 1330 tests |

Red items are the same environment-only set recorded in `review_mwkjd6rb.md` (no `.env`, no `DATABASE_URL`;
the one unit failure is `tests/unit/env-file.test.ts`). This round changes no gated file, so it cannot have turned
anything red, and the numbers are identical to the previous review. I do not count them against a spec-only
round. I did not run `test:db` / `test:e2e` (no database; no code to test).

## Required changes from `review_mwkjd6rb.md` — status

| # | Required change | PASS/FAIL | Evidence |
|---|---|---|---|
| 1 | Close the `SUPER_ADMIN` takeover path | PASS | 022:108-114 (Contract) and 022 AC-3 (`resetProfilePin`, `clearAccountLock`, `changeProfileRole`, `deactivateProfile`, `approveProfile`, `rejectProfile` refuse a `SUPER_ADMIN` target with a typed error and an unchanged row; own-PIN reset is the one exception; target role re-read inside the transaction). The test is named: `profile-admin-service.db.test.ts`, "`ADMIN` resets `SUPER_ADMIN`: no PIN returned, no column changed". 023 AC-7 now states the protection against every other actor. |
| 2 | Enumerate shipped assertions amended; fix the money-surface contradiction | PASS | 022 AC-10 names `tests/unit/export-workbook.test.ts:165` (verified: the line is `toBe("€1.005")`) with before / after / why-not-weaker. 024 AC-14 is reworded ("the administrator review is the new money surface … three euro-bearing routes") and amends 009 AC-21/22 and 011 AC-19 explicitly (checked against their text in `specs/features/009*.md`, `011*.md`). 024 AC-15 lists (a)-(j): money surfaces, the `project-contract.test.ts` exact `unitPrice` list (the "thirteen" test exists at `:210`), `stock-entry-contract.test.ts` (`MUTATION_EXEMPT` has two entries `:440-449`, offender list at `:502-520`, the `CountStatus` literal `:413`), audit format (`count-audit.ts:64`), `COUNT_STATUS_LABEL` (`count-messages.ts:133`), the money-key walks, status labels, `yardFigureFor`, schema/`TRUNCATED_TABLES`, and the approve/submit tests, each with before / after / not-weaker. 024 change-list item 18 (024:567) covers how `PENDING_SIGN_OFF` renders on the calendar, `/stock-takes` and `/analysis` with no euro. |
| 3 | Decide what Stock Calendar means for `ADMIN` | PASS | Option (a) chosen. 022 D4 (022:31-41) records the per-role resolution (`YARD_STAFF` → `/stock-entry`, `ADMIN`/`SUPER_ADMIN` → `/stock-takes`) and names the tradeoff; the tile table (022:136) has the per-role `href`; AC-5 and AC-6 assert it per role; Q2 is updated (022:311). Matches today's `landing.ts` (`ADMIN: "/stock-takes"`). |

## AC table (specs as amended)

| AC | PASS/FAIL | Evidence |
|---|---|---|
| 022 AC-1, 2, 4, 7, 8, 9, 11, 12 | PASS | Unchanged from the previous review, which passed them; diff touches none of these. |
| 022 AC-3 | PASS | Was FAIL. Now covers reset/clear/approve/reject as well as role change/deactivate; testable with an `ADMIN` actor; own-PIN exception stated. |
| 022 AC-5, AC-6 | PASS | Was FAIL (AC-6). Tile `href` asserted per role; both calendars' shipped tests are named as proof (`stock-takes-calendar`, `stock-takes-count`, `stock-entry-start`, `home-menu`). |
| 022 AC-10 | PASS | Was FAIL. One changed assertion, named, with the replacement (`toBe(1.005)` plus `numFmt`, blank not `""`). |
| 023 AC-1-6, 8-13 | PASS | Unchanged (AC-8 only gains an "(R4)" cross-reference). |
| 023 AC-7 | PASS | Was FAIL. Adds the other-actor refusal, no PIN returned, byte-identical row, and the `/profiles` guard rationale. |
| 024 AC-1-6, 8-13 | PASS | Unchanged in substance. AC-1 adds the `-- contract-step:` line; AC-7 adds that `finishCount` is refused to `ADMIN`/`SUPER_ADMIN`; AC-13 states a `PENDING_SIGN_OFF` count is read-only to the counter. All three are consistent with the rest of the spec. |
| 024 AC-7 | PASS | Wording check: the `finishCount` refusal for admin roles agrees with AC-13's `canFinish` and with 022 D5 (admins sign off in one step). |
| 024 AC-14 | PASS | Was FAIL. No longer claims "only new money surface"; the shipped criteria are amended by name, with the staff zero-euro check kept. |
| 024 AC-15 | PASS | Was FAIL. Ten amended assertion groups enumerated with before / after / why-not-weaker. |

Every criterion is a spec criterion and still independently testable. The spec size and 5-15 criteria cap are
unchanged (12 / 13 / 15).

## CHECKPOINTS.md

CHECKPOINTS.md describes the final state of the shipped product; walked at the level that applies to a spec-only round:

- [x] Spec-first: three specs with numbered criteria, owner decisions, out of scope and open questions.
- [x] No code, schema, migration, test or `Samples/` change on this branch's diff.
- [x] One feature per spec; `feature_list.json` valid, JSON matches spec text, nothing marked `done`.
- [x] Typecheck and lint green.
- [x] Specs consistent with the shipped specs they amend (the three inconsistencies of the previous review are closed).
- [ ] Full gate green: red in this container for environment reasons only (no `.env`, no `DATABASE_URL`); no gated file changed. Recorded, not a defect of this work, and not a blocker for a spec-only round.

## Required changes

None.

## Observations (non-blocking)

1. 024 AC-15(d) and the change list at 024:463 name `tests/unit/count-audit.test.ts`; the real file is
   `src/lib/count-audit.test.ts` (it asserts the exact `AUDIT_EVENTS` list at line 49). Fix the path when the spec is approved.
2. 024 AC-15(c) says `count-lifecycle-service.ts` performs "exactly four Prisma operations"; the shipped test is at
   `stock-entry-contract.test.ts:480`. The implementer should re-read it when extending the set. It is also worth naming there the `EXPORTED_ACTIONS`
   list (`:195-210`, five actions) and the `force-dynamic` page count (`toHaveLength(7)`, `:550`), which the new
   finish/sign-off actions and routes will move. Neither is listed in AC-15.
3. Observations 1 (owner rulings R1-R4 are not verifiable from the repository; the `PENDING_SIGN_OFF` reading of the
   task text needs the owner's explicit confirmation), 2 (024 is ~570 lines, well over the ~200-line aim; consider splitting),
   3 (022 AC-1 scan wording), 4 (`/home?denied=dashboard` needs a notice on `/home`), 5 (some referenced test files do not
   exist yet) and 6 (`init.sh` is not executable; run `bash init.sh`) of `review_mwkjd6rb.md` are still open. None blocks approval.
