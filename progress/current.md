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

Feature **#20 `test_db_reset`**. Its spec `specs/features/020-test_db_reset.md` does not
exist yet, so the next action is a `spec-writer` run, not an `implementer` run.

**Why #20 and not #8.** AGENTS.md §4 says to take the lowest `pending` id, which is #8.
#20 is dispatched ahead of it deliberately, and this note exists so the ordering does not
look like a mistake:

1. `resetTestDb` costs about 6.5 minutes of every gate run and grows with every feature.
   #8 adds the most service tests of any feature so far, so fixing it first makes #8
   cheaper and narrows the window a rate-limit kill can land in.
2. #20 is small. It is the first feature dispatched under the new working rules, and if
   those rules have a flaw it should surface somewhere cheap rather than on the largest
   feature left.

Feature #7 is closed; `progress/history.md` holds its summary.

## Working rules adopted 2026-09-11, from the plan the user approved

- **The coordinator runs `init`; agents never do.** Agents run targeted commands only
  (`npx vitest run <file>`, `npx playwright test <file> --project=...`). A gate run is ~480
  lines that an agent then re-sends on every later tool call, and the coordinator re-runs it
  independently anyway. Measured on #7: ~1.6–2.1k tokens per tool call, against #6's ~10.8k.
  It also earned itself immediately — the coordinator's independent run found the #6 race
  two clean agent runs had missed.
- **Implementation is dispatched as cold phases, not one resumed agent.** A resumed agent
  re-sends its whole transcript on every request; #6's reached 585k.
- **Reviewers are told what not to re-derive**, and start from `git diff` rather than from
  the repository.
- **Invoke the gate so its exit code means something:**
  `bash ./init.sh > f 2>&1; ec=$?; echo "init exit=$ec"; exit $ec`. Until 2026-09-11 the
  trailing `echo` swallowed the status, and every gate notification reported `exit 0`
  regardless of the verdict. The transcript was always read directly, so nothing was ever
  closed on a red gate — but the reported code was meaningless.

Carried into #8 from #7's review: `tmp_ac13_line_write_fails` is the first DDL any test in
this repository issues. If a second is ever needed, the add/drop pair belongs behind a
helper in `src/server/test-db.ts`, beside `resetTestDb()`.
