# Current session

**Feature:** #1 `repo_harness`
**Started:** 2026-09-01
**Status:** in_progress

## Plan

Turn this directory into a system agents can work in, before any application code
exists. Establish the spec foundation from the source workbook so that every later
feature has something concrete to be checked against.

## Work log

- Read the four sheets of `Samples/Stock @ 01-Sep-2026.xlsx` by unzipping the package
  and parsing `xl/worksheets/sheet1..4.xml` against `xl/sharedStrings.xml`. Findings
  recorded in `specs/001-domain-model.md § Part 1`.
- Read the reference harness
  (github.com/betta-tech/ejemplo-harness-subagentes): `AGENTS.md`, the three agent
  definitions, `docs/verification.md`, `feature_list.json`. Ported the structure to
  this project in English, with a fifth agent (`spec-writer`) added because this
  project is spec-driven and the reference project is not.
- Wrote `AGENTS.md`, `CLAUDE.md`, `CHECKPOINTS.md`.
- Wrote `docs/{architecture,conventions,verification,domain-glossary}.md`.
- Wrote `specs/000-product-brief.md` and `specs/001-domain-model.md`.
- Wrote `.claude/agents/{leader,explorer,spec-writer,implementer,reviewer}.md` and
  `.claude/settings.json`.
- Wrote `feature_list.json` with 17 features across 6 milestones.
- Wrote `init.ps1` and `init.sh` — the verification gate, which validates harness
  integrity and skips application steps that do not exist yet.

## Verification

Positive run — `./init.ps1`:

```
==> Harness integrity
    [ok]   17 required files present

==> Feature list
    [ok]   feature_list.json parses
    [ok]   17 features, 1 in progress

==> Source workbook untouched
    [ok]   Samples/ has no uncommitted changes

==> Application
    [skip] no package.json yet (feature #2 app_scaffold)

[OK] Environment ready
```

Negative run — the gate must also *fail* when it should, otherwise green means
nothing. Temporarily set feature #2 to `in_progress` with `spec_status: approved`
for a spec file that does not exist, then reverted with `git checkout`:

```
    [FAIL] #2 app_scaffold declares spec_status 'approved' but specs/002-app_scaffold.md does not exist
    [FAIL] more than one feature in_progress: #1 repo_harness, #2 app_scaffold
[FAILED] 2 problem(s)
EXITCODE=1
```

`init.sh` run under Git Bash: identical output, exit code 0. Both gates agree.

## Spec revision (same session, after answers from the user)

Q1–Q5 answered. The answers changed scope and the schema, so the specs were revised
before any application code was written.

- **Q1/Q2 — Trucks & Yard deferred.** Moved to a new milestone M7 (features #17–#19).
  Vehicles are no longer imported by the seeder. Re-opened as Q6 and Q7, blocking only
  M7.
- **Q3 — `Bal per nl` dropped.** Not a figure this team owns. Removed from the product
  brief; the glossary keeps one line so the rows stay recognisable in the old workbook.
- **Q4 — description mandatory, incomplete items flagged.** `Item.needsReview` added.
  About 15 workbook rows have a description but no unit or price; they import flagged,
  contribute 0 value *with a warning*, and land on the housekeeping worklist. A row with
  a blank description fails the import loudly.
- **Q5 — the period model.** This was the significant one. Converting every date serial
  showed that the Dublin count dated `2025-09-01` is the Summary column headed
  `2025-08-31`; that `'Clonmel '!R1` is a year out and `Dublin!U1` is 16 months in the
  future; that counts fall on Saturdays and Sundays; and that Clonmel skipped July and
  August 2025 entirely. A count therefore cannot be keyed by date. `StockCount` is now
  keyed `(locationId, periodYear, periodMonth)` with `countDate` demoted to a recorded
  fact. Period defaults from the date (day ≤ 5 closes the previous month), overridable.
  Non-business-day dates warn but are allowed.
- **Side note — one-off items.** New Part 5 in `specs/001`. `held` / `one-off` /
  `dormant` defined; `StockCountLine.quantity` made **nullable** so "not counted" is
  distinguishable from "counted, none held" — the one thing the workbook's blank cells
  cannot express. Held-only is the default on every view and export; entry and the
  printable blank sheet still show everything. New feature #15 `item_housekeeping`.
- **Period completeness.** Total Stock, MoM and YoY appear only when every active yard
  has an approved count for the period. Incomplete periods show per-yard figures and no
  headline total.

Files revised: `specs/001-domain-model.md` (Parts 3–5 + answered questions),
`specs/000-product-brief.md` (scope), `feature_list.json` (19 features, 8 milestones),
`docs/domain-glossary.md`.

## Blockers

None.

## Open questions for the user

Only Q6 and Q7 remain, and both block M7 only. Everything before M7 is unblocked.

## Next

Feature #2 `app_scaffold`. Its spec (`specs/002-app_scaffold.md`) does not exist yet, so
the next action is a `spec-writer` run, not an `implementer` run.
