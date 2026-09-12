# Current session

**Feature:** #10 `stock_takes_history`
**Spec:** `specs/features/010-stock_takes_history.md` (approved 2026-09-12, 22 criteria)
**Started:** 2026-09-12
**Status:** in_progress — spec approved by the user, implementation not started

## Plan

Two routes — `/stock-takes` (the calendar, where an ADMIN lands) and
`/stock-takes/counts/<id>` (read-only detail) — a yard selector, previous/next count jumps,
and a held-only default. **Read-only: no route handler, no server action, no form, no client
component.** Every control is an `<a>`, so the whole screen works with the bundle dead and
emits no JSON.

Two cold phases, since this is smaller than #8 and #9:

- **Phase A** — the pure modules (`stock-takes-view.ts`, `held.ts`, `stock-takes-input.ts`,
  `stock-takes-messages.ts`), the read services, and their tests.
- **Phase B** — the two pages, the `CalendarGrid` optional props, the e2e specs, the mutation
  proofs and the report.

## Approach

**Money-free by design, and asserted rather than promised.** AC-13: the page body is
**byte-identical** between a `YARD_STAFF` session and an `ADMIN` session on the same URL — no
role branch anywhere. Stronger than 009 AC-23's "identical except one link", and affordable
only because this screen has nothing an admin needs that staff may not have.

An admin still reaches the money: one link, same `href` and label for both roles, to
`/stock-entry/counts/<id>` — #9's role-shaped screen, two clicks from the euros. **Nothing in
#10 links to `/summary`, for anybody.** The admin-only shortcut was rejected because it would
buy one click and cost the byte-identity assertion.

**The two calendars are one calendar.** `/stock-entry` (do something) and `/stock-takes` (read
something) call the **same** `listCalendarMonth`, `buildMonthGrid` and `CalendarGrid`. Yard
scope is a **pure filter over the result**, not a second query. Drift is prevented
mechanically: AC-4 asserts the badge sets rendered by both pages for the same month are
**equal**, and `src/app/stock-entry/page.tsx` must be **byte-identical** afterwards.

**No AC-33.** Per #9's ruling, no criterion counts other criteria. Every shipped assertion
this feature amends is named inside the criterion that forces it, and the two hand-maintained
lists it touches become **derivations from the tree**, so they fail in the session that causes
the change.

## Work log

<!-- Update as you go, not at the end. If the session dies, this file is what survives. -->

## Verification

Gate at the moment of approval — full run, database checks executed:

```
bash ./init.sh                        ->  init exit=0, 913 s
    [ok]   19 features, 1 in progress
    [ok]   typecheck / lint / test:unit (614) / test:e2e (133)
==> Database
    [ok]   database reachable / prisma migrate status / npm run test:db
[OK] Environment ready
```

<!-- Paste the closing run here. It must not say "(database checks skipped)" — C2.1. -->

## Blockers

None.

## Next

Phase A, gate, Phase B, gate, reviewer, sign-off. Then **#11 analysis**, then **#16 deploy** —
the order the user chose on 2026-09-12, so the first real users see a complete picture rather
than counting into something they cannot review.

### Rules in force

- **The coordinator runs `init`; agents run targeted commands only.**
- **Only one `npm run test:db` in flight at a time.**
- **No gate while an agent is active on the tree.**
- Cold phases, not resumed agents. Reviewers told what not to re-derive, starting from
  `git diff`.

### Carried in

- **The mapper rule** (#9): when a shape's key is a forbidden string, the boundary is crossed
  by a mapper in the service, not by a scan exemption for the screen.
- **A mutation turning something red is not evidence the right thing is protected.** #9 hit
  that three times — M7, M12, M14.
- **TypeScript does not protect the money boundary.** Assertions do.
- **020 AC-4** turns red if a table is added and not to `TRUNCATED_TABLES`. #10 needs no
  migration — every column it reads was shipped by #4.
- e2e: `retries: 0`, each spec reserving its **own** `periodYear` and deleting only its own
  (007 AC-30).
- The Neon test branch degraded twice on 2026-09-11 and recovered both times.
