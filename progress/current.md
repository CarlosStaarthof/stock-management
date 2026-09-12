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

Feature **#10 `stock_takes_history`**. Its spec `specs/features/010-stock_takes_history.md`
does not exist yet, so the next action is a `spec-writer` run.

**M2 is complete.** #9 is closed; `progress/history.md` holds its summary. A count can be
started, walked on a phone, signed, submitted and approved with its prices frozen.

## Order from here, decided by the user on 2026-09-12

**#10 history → #11 analysis → #16 deploy.** The user was offered deploying now — counting
works, and they had asked early on to deploy "after counting works" — and chose to finish the
read-only screens first so the first real users see a complete picture.

The reason that is right: a yard user can currently count and submit but **cannot look at
anything they submitted**. Deploying before #10 would hand someone a phone app that takes
numbers and shows nothing back, which is how people quietly return to the paper sheet.

## What #10 is

Part 6: **Stock Takes is money-free for BOTH roles**, and **"one version of the screen, not
two"** — a screen that renders differently per role is a screen whose every future change has
to be checked twice. This is the first screen where that is the design, rather than a
consequence of splitting routes as #9 did.

A calendar of historical counts, a Dublin / Clonmel / Both selector, previous- and next-count
jumps, and a read-only detail of item, quantity and unit. Phone-first.

Note the starting state: the database holds the counts #7, #8 and #9's own e2e specs created
in reserved years (2090+), and whatever real counts have been made. #10's empty state and its
reserved-year hygiene both matter (007 AC-30: a spec deletes only counts carrying **its own**
reserved `periodYear`, never a range).

## Rules in force

- The coordinator runs `init`; agents run targeted commands only.
- **Only one `npm run test:db` in flight at a time.**
- **No gate while an agent is active on the tree.**
- Cold phases, not resumed agents. Reviewers told what not to re-derive, starting from
  `git diff`.

## Carried into #10 and #11

- **Do not write another AC-33.** #9's amendments explain why: a criterion whose subject is
  *other criteria* has no mechanical check and no owner, and it was wrong four times — six,
  nine, fourteen, fifteen. Worse, a stale count reads as a *completed* reconciliation, which
  is how two findings travelled three phases inside a report that said it was satisfied. If
  the guarantee is wanted, derive it from the tree: intersect `git diff -U0` with each
  `it()`'s line range, subtract new blocks and module-level consts, and assert the set. That
  fails in the session that causes it.
- **The mapper rule:** when a shape's key is a forbidden string, the boundary is crossed by a
  **mapper in the service**, not by a scan exemption for the screen.
- **A mutation turning something red is not evidence that the right thing is protected.** #9
  hit that three times: M7 (red in #9, green in #8's own suite), M12 (red at the wrong
  refusal, sharing a guard), M14 (the reviewer's own, which broke only the route's response
  mapping and was the only one that proved the assertion under test).
- **TypeScript does not protect the money boundary.** Assertions do — #8 proved it with
  `typecheck` exit 0 twice.
- **020 AC-4 turns red** if a table is added to the schema and not to `TRUNCATED_TABLES`.
- The Neon test branch degraded twice on 2026-09-11 and recovered both times. A failure
  reading `Can't reach database server` rather than an assertion is the branch, not the tree.
