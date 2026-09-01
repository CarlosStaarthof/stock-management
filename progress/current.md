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

## Blockers

None.

## Open questions for the user

Recorded in `specs/001-domain-model.md § Open questions` (Q1–Q5). Q4 blocks feature
#5, Q1 blocks #10, Q2 blocks #11, Q3 and Q5 block #12.

## Next

Feature #2 `app_scaffold` — but its spec (`specs/002-app_scaffold.md`) does not exist
yet, so the next action is a `spec-writer` run, not an `implementer` run.
