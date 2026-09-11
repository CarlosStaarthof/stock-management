# Current session

**Feature:** #8 `stock_entry_ui`
**Spec:** `specs/features/008-stock_entry_ui.md` (approved 2026-09-11, 35 criteria)
**Started:** 2026-09-11
**Status:** in_progress — spec approved by the user, implementation not started

## Plan

The phone counting screen. #7's read-only rows on `/stock-entry/counts/[id]` become inputs,
plus one JSON endpoint, autosave with an offline queue, and three filter categories.
**No new page route and no migration.**

Dispatched as cold phases, per the working rules:

- **Phase A** — pure modules and the service, with their tests: quantity parsing/validation,
  the filter predicate, facet counts, progress arithmetic, `saveQuantities`, the Zod schema
  at the edge of `src/server/`, and `src/app/api/counts/[id]/lines/route.ts`.
- **Phase B** — the screen: inputs, the *None held* control, the filter UI, the save-state
  header, the offline queue and its backoff, plus the e2e specs.
- **Phase C** — mutation proofs, the report, the work log.

## Approach

**The feature, in two sentences (spec § The thing this feature is really about):** an empty
input is never saved as `0`, and a `0` is never rendered as an empty input. Everything else
serves that.

Decisions the user approved, each in the spec's Open questions and strikeable:

1. Adding an item mid-count is deferred to its own feature after #9 — doing it here would
   widen `createItem` to `YARD_STAFF` **and** grow an inline form on the one screen that must
   never lose a typed number.
2. Clearing an input is how you undo a count; no separate *Clear* control.
3. **No running total, for either role** — a draft total from today's prices would disagree
   with the same count's approved total if a price changed in between (Invariant 2).
4. **No per-row *No price* tag** here; it is a submit-time fact and belongs on #9's summary.
5. Last write wins — no lock, no version token. A lock held by a phone that walked out of
   signal is worse than a conflict.
6. Facet counts are over the whole count, not the current filter, so options never renumber
   under a thumb.
7. Filters use `history.replaceState` — on a phone, *back* means "out of here".
8. Debounce 800 ms; backoff 1, 2, 4, 8, 30 s. Both named constants, quoted in criteria.

## Work log

<!-- Update as you go, not at the end. If the session dies, this file is what survives. -->

## Verification

Gate at the moment of approval — full run, database checks executed:

```
bash ./init.sh                        ->  init exit=0, 500 s
    [ok]   19 features, 1 in progress
    [ok]   typecheck / lint / test:unit / test:e2e (90 passed)
==> Database
    [ok]   database reachable / prisma migrate status / npm run test:db
[OK] Environment ready
```

<!-- Paste the closing run here. It must not say "(database checks skipped)" — C2.1. -->

## Blockers

None.

## Next

Phase A, then B, then C; reviewer; sign-off.

### Rules in force

- **The coordinator runs `init`; agents run targeted commands only.**
- **Only one `npm run test:db` in flight at a time** — two runs truncate the same tables in
  the same branch and corrupt each other.
- **No gate while an agent is active on the tree.** Broken once during #20 and it cost a run.
- Implementation is dispatched as **cold phases**, not one resumed agent.
- Reviewers are told what not to re-derive, and start from `git diff`.

### Things that will fire during #8, by design

- **020 AC-4** turns red if a table is added to the schema and not to `TRUNCATED_TABLES`.
  #8 should add no table at all — if it needs one, that is a finding to report.
- **006 AC-31's `unitPrice` list is exact.** #8 renders no price for either role on this
  screen, so it should not need to join that list.
- **007 AC-14** gives a `YARD_STAFF` actor sheet entries with **no `currentPrice` key**.
  Do not undo it.

### Carried forward

- `TRUNCATE` (#20) and `tmp_ac13_line_write_fails` (#7) are the only DDL any test issues.
  A third belongs behind a helper in `src/server/test-db.ts`.
- The Neon test branch degraded twice on 2026-09-11 and recovered both times. A failure
  reading `Can't reach database server` or `Server has closed the connection` rather than an
  assertion is the branch, not the tree.
