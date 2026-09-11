# Current session

**Feature:** #7 `entry_start`
**Spec:** `specs/features/007-entry_start.md` (approved 2026-09-11, 32 criteria)
**Started:** 2026-09-11
**Status:** in_progress — spec approved by the user, implementation not started

## Plan

Four routes under `/stock-entry`, both roles: the calendar, *who / where / when*, the period
confirm, and the count itself. One server action, one write. **The first feature a
`YARD_STAFF` user will ever see.**

### Files expected to be touched

- `src/app/stock-entry/**` — four routes + `actions.ts`, all `force-dynamic`; the existing
  placeholder page is replaced but keeps its three test ids (`signed-in-email`, `sign-out`,
  `access-denied`) because three shipped e2e specs assert on them
- `src/components/stock-entry/**`
- `src/server/counts/` — `count-service.ts`, `period.ts` (pure), `count-input.ts` (pure)
- `src/lib/calendar-month.ts`, `src/lib/yard-time.ts`, `src/lib/count-messages.ts` — pure
- `src/server/items/item-assignment-service.ts` (+ its `.db.test.ts`) — AC-14 only
- `tests/e2e/stock-entry*.spec.ts`

No migration. `prisma/schema.prisma` and `prisma/migrations/` byte-identical after.

## Approach

Four pure modules are why a third of the criteria run with no database at all.

**AC-14 is the decision of the feature, made by the user at approval.** `listSheet` is the
one definition of a yard sheet (006 AC-24) and was ADMIN-only; a staff user starting a count
needs it. Rather than widen the guard and discard the price in the caller, `listSheet` is
**role-shaped through `shapeForRole`**: `currentPrice` for an `ADMIN`, **no such key** for a
`YARD_STAFF` actor, with a spy-thunk test asserting the admin branch is called zero times.
Part 6's rule is "not hidden — not sent", and built-then-discarded is weaker than never
constructed. #8, #9 and #14 inherit safety rather than a discipline to remember.

Other decisions the user approved (spec § Open questions): who is counting is the signed-in
user, displayed not typed; a count cannot be deleted; the period override is a free
`<input type="month">` because the workbook holds a count dated `2026-12-31` belonging to
`2025-12`; the calendar places a count by `countDate`, not by period; `todayInYard` is
`Europe/Dublin` while #6's `todayIso` stays as shipped; the calendar shows both yards.

## Work log

<!-- Update as you go, not at the end. If the session dies, this file is what survives. -->

## Verification

Gate at the moment of approval — full run, database checks executed:

```
bash ./init.sh                                        ->  exit 0
    [ok]   18 features, 1 in progress
==> Database
    [ok]   database reachable / prisma migrate status / npm run test:db
[OK] Environment ready
```

<!-- Paste the closing run here. It must not say "(database checks skipped)" — C2.1. -->

## Blockers

None. The Neon test-branch fault recorded during the spec session is cleared — it was the
branch dropping connections, never the tree, and `npm run test:db` passed 13 files / 173
tests on the same tree once it recovered.

Worth keeping: `scripts/db-probe.mjs` reports `reachable` even while the pooler is dropping
sessions a minute later, so a green probe does not clear a fault of that kind. Only a full
`npm run test:db` does.

## Next

Implementer run against the 32 approved criteria, then a reviewer run, then sign-off.

Carried in and not to be regressed:

- **The e2e suite runs against a served build at `retries: 0`** (006 AC-35). Every spec
  creates its own rows with a per-run suffix and leaves the seeded master untouched.
- **`listSheet` stays the one definition of a yard sheet.** Do not add a second query.
- **No `loading.tsx` at or above `src/app/stock-entry/`** — #3 and #6 both recorded why, and
  AC-3 re-proves it.
