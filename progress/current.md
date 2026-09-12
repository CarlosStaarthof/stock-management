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

Feature **#9 `entry_submit`** — sign, submit, approve. Its spec
`specs/features/009-entry_submit.md` does not exist yet, so the next action is a
`spec-writer` run.

**This is the last feature of M2.** #7 creates a count, #8 fills it in, #9 closes it: a
drawn signature, submission blocked while any line is `null`, the price snapshot written
once at submit, and an ADMIN approval that makes the count immutable.

Feature #8 is closed; `progress/history.md` holds its summary.

## What #9 inherits

- **Invariant 5 becomes enforceable.** #8 made `null` vs `0` a thing a human sets
  deliberately; #9 is where `null` **blocks submission**.
- **Invariant 2** — `unitPriceSnapshot` is null while `DRAFT` and written **once**, at
  submit, from the `ItemPrice` effective on `countDate`. #9 is the first writer of that
  column; 006 AC-31's permitted-module list is exact and will need amending, deliberately.
- **Invariant 11** — no submission without a signature; `signatureSvg` holds SVG path data,
  not a raster; reopening an APPROVED count **clears** the signature.
- **Invariant 3** — an APPROVED count is immutable, and only an ADMIN reopens it, audited.
- **The per-row *No price* tag and the count total both belong here**, on the submit summary
  — #8 deliberately carries neither (spec 008 Open questions 3 and 4).
- **Part 6**: YARD_STAFF submits but never approves. The person who typed the number is not
  the person who signs it off.

## Rules in force

- The coordinator runs `init`; agents run targeted commands only.
- **Only one `npm run test:db` in flight at a time.**
- **No gate while an agent is active on the tree.**
- Implementation is dispatched as **cold phases**; reviewers are told what not to re-derive
  and start from `git diff`.

## Carried forward

- **TypeScript does not protect the money boundary.** Adding a `currentPrice` to a staff
  shape typechecked cleanly; six scans caught it. #9 writes the first snapshot — the scans
  are what hold the line.
- 008's Observation 8: the `pagehide` flush e2e cannot prove the *listener* fired, because a
  keystroke's own debounce would produce the same `POST`. Unit tests pin the call sites.
- `TRUNCATE` (#20) and `tmp_ac13_line_write_fails` (#7) are the only DDL any test issues.
  A third belongs behind a helper in `src/server/test-db.ts`.
- The Neon test branch degraded twice on 2026-09-11 and recovered both times.
