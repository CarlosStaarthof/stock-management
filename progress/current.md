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

Feature #7 `entry_start`. Its spec `specs/features/007-entry_start.md` does not exist yet,
so the next action is a `spec-writer` run, not an `implementer` run.

Feature #6 is closed; `progress/history.md` holds its summary. M1 is complete: the master
data is in the database and there is a screen to maintain it. M2 begins — the first feature
a YARD_STAFF user will ever see.

Carried into #7:

- **`listSheet` is the one definition of a yard sheet** (006 AC-24): `ItemLocation.active`
  and `Item.active` both true, ordered by `sortOrder` then `description`. #7 pre-populates
  a count from it rather than writing a second query.
- **The e2e suite runs against a served build at `retries: 0`** (006 AC-35). Every spec
  creates its own rows with a per-run suffix and asserts the seeded master is untouched.
  Seven full suites have now run clean; do not reintroduce `next dev` or a retry.
- **The lint fence cannot reach a computed specifier.** `docs/architecture.md` says so
  plainly; review is what holds that line.
- Five agent runs on #6 were killed by account rate limits. Work in an order that leaves a
  coherent partial state, and keep this file ticking as you go.
