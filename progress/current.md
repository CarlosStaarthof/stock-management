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

Feature **#8 `stock_entry_ui`** — the phone counting screen. Its spec
`specs/features/008-stock_entry_ui.md` does not exist yet, so the next action is a
`spec-writer` run, not an `implementer` run.

**This is the largest remaining feature, and the one the whole project is for.** #7 creates
a count with every quantity `null`; #8 is where a person standing in a yard, holding a
phone, types the numbers in.

Feature #20 is closed; `progress/history.md` holds its summary.

## What #8 inherits

- **A gate that runs in 632 s**, down from ~20 minutes, and a Level 2 suite making ~470
  round-trips per run instead of ~2,430. #20 bought that deliberately before #8, because
  #8 adds the most service tests of any feature so far.
- **`shapeForRole` in real use** (007 AC-14): `listSheet` gives a `YARD_STAFF` actor entries
  with **no `currentPrice` key at all**. #8 must not undo that — Part 6 gives staff no line
  values, no running total and no "no price" tag.
- **`quantity = null` means *not counted*** and `0` means *counted, none held* (Invariant 5).
  #8 is where that distinction becomes a thing a human can see and set.
- **`listSheet` is the one definition of a yard sheet** (006 AC-24). Do not add a second.

## Two things that will fire during #8, by design

- **020 AC-4** turns red the moment #8 adds a table to the schema and not to
  `TRUNCATED_TABLES`. That is the drift guard working.
- **006 AC-31 / 005 AC-29's `unitPrice` scan** pins an exact list of modules permitted to
  name the column. #8 renders no price for staff, so it should not need to join that list;
  if it does, that is a finding worth arguing rather than a list to extend quietly.

## Working rules in force

Adopted with #7 and #20, and recorded in `progress/history.md`:

- **The coordinator runs `init`; agents run targeted commands only.**
- **Implementation is dispatched as cold phases**, not one resumed agent.
- **Reviewers are told what not to re-derive**, and start from `git diff`.
- The gate is invoked so its exit code propagates.
- **Only one `npm run test:db` in flight at a time** — two runs truncate the same tables in
  the same branch and corrupt each other.
- **No gate while an agent is active on the tree.** The coordinator broke this during #20
  and it cost a gate run; the implementer diagnosed it by finding the gate's process and by
  reproducing the failures against the previous implementation.

## Carried forward

- `TRUNCATE` (#20) and `tmp_ac13_line_write_fails` (#7) are the only DDL any test issues.
  A third belongs behind a helper in `src/server/test-db.ts`.
- The Neon test branch degraded twice on 2026-09-11 and recovered on its own both times.
  A failure reading `Can't reach database server` or `Server has closed the connection`
  rather than an assertion is the branch, not the tree. `scripts/db-probe.mjs` reports
  `reachable` throughout, so a green probe does not clear it.
