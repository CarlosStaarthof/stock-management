# Spec notes — #10 `stock_takes_history`

Written 2026-09-12. Spec at `specs/features/010-stock_takes_history.md`, 22 criteria,
`spec_status: draft`, `status: pending`. Criteria mirrored verbatim into
`feature_list.json` (`git diff --stat` = 25 insertions, 2 deletions; nothing else moved).

## Not blocked

`specs/domain-model.md § Still open` holds only Q7 and Q8, both M7 and both about trucks.
Neither is read by this feature.

## The eight things the task asked to settle, and what the spec says

1. **Relationship to #7's calendar.** *Same calendar, two addresses, different affordances.*
   Not a replacement (`/stock-entry` must keep answering `200` — `sign-in.spec.ts`,
   `role-access.spec.ts`, `item-master-access.spec.ts` and `/stock-entry?denied=` all depend
   on it) and not a sibling implementation. Shared by **calling the same functions**:
   `listCalendarMonth` is byte-identical, and the yard scope is a **pure post-filter** over
   its result, so both pages issue the same query with the same arguments. `CalendarGrid`
   gains two optional props with today's behaviour as defaults, so
   `src/app/stock-entry/page.tsx` stays byte-identical. AC-4 asserts the anti-drift claim
   directly: the badge tuples rendered by the two calendars for the same month are equal.
   AC-5 asserts the ownership split by absence.
2. **Which counts appear.** All three statuses, for both roles, with the badge saying which.
   Reasons in the spec: a `DRAFT` is visible work in progress (a staff user must see that
   Dublin is being counted now — #7's confirm screen already depends on that); an `ADMIN`
   landing here must see a `SUBMITTED` count in order to go and approve it; and
   `APPROVED`-only would make the two calendars disagree about the same day, which is a
   worse second definition than sharing a query. Flagged as *Open questions* 2.
3. **Held-only.** Default `held` on `/stock-takes/counts/[id]` per Part 5's table, with a
   `?show=all` toggle. AC-9 pins the 82-line fixture (47 held / 23 zero / 12 uncounted →
   47 rows and `35 of 82 items are not held and are hidden.`), keeps #8's `0` vs `Not counted`
   distinction visible in the `show=all` view, and gives the nothing-held empty state its own
   sentence. AC-10 makes `isHeld` a pure decimal comparison (`compareDecimals` added to
   `money.ts`) rather than `Number(q) > 0`.
4. **Previous / next count jumps.** One ordering — `(countDate, id)` ascending — in two
   placements. By `countDate`, consistent with 007 open question 4 and 007 AC-20, argued in
   the spec (a jump by period would land on a month the count is not drawn in). `id` is the
   tiebreak because two counts at one yard *can* share a `countDate`. The calendar's jumps
   respect the yard scope; the detail's are **same-yard always**, and the spec argues why.
5. **The selector.** `?yard=DUBLIN|CLONMEL|BOTH`, default `BOTH`, invalid → `307` (007
   AC-21's treatment of a bad `?month`). `Both` is a **scope**, not a claim that both yards
   were counted — AC-6 pins the day where only Clonmel was counted, under all three scopes.
   The option labels carry per-scope tallies through the existing `facetOptionLabel`.
6. **Empty state.** Three of them, all in AC-14's place inside AC-6/AC-9 and the UI states
   section: no counts anywhere (`No stock counts recorded yet.` — reused from #7 — plus one
   *Start a count* link to `/stock-entry/new`, which is the state of the database today);
   none in this month/scope (`No counts in this month.`, reused); nothing held in this count.
7. **Phone-first.** AC-19, in the style of 003 AC-32 / 006 AC-30 / 008 AC-30, and measured in
   the state most likely to overflow — the `show=all` view on the longest description in the
   database, which is the lesson #8 recorded when its filtered state overflowed and its
   default one did not. 390 px and 320 px, both roles, 44 × 44 targets.
8. **Which checks survive with no database.** AC-20, naming the criteria provable without
   Postgres, plus a derived `force-dynamic` assertion over every page outside `(public)`
   (true of all 17 pages today).

## The money question, which is the point of this feature

`#10` is the first surface money-free **by design for both roles on one screen**, rather than
by scope (#7, #8) or by route split (#9). Two criteria carry it:

- **AC-12** walks `getCountHistory`, `findNeighbourCounts` and the filtered calendar for
  **both** roles and demands **zero** offenders for the admin as well as the staff user, and
  deep equality between the two roles' values. Browser half covers all four URLs × both roles
  × `DRAFT` / `SUBMITTED` / `APPROVED`.
- **AC-13** is the flagship: the `data-testid="stock-takes-body"` `innerHTML` is **byte-identical**
  between the two sessions — strictly stronger than 009 AC-23's "identical except one link" —
  plus a scan proving there is no role branch in the feature at all.

**The `/summary` question the task raised.** #9 put every euro on
`/stock-entry/counts/[id]/summary`, reached from an admin-only link on
`/stock-entry/counts/[id]`. #10's detail carries **one** link, *Open this count in Stock
Entry*, identical for both roles; **nothing in #10 links to `/summary` for anybody** (AC-15).
So the euro is two clicks away and the role-shaped screen in that path is #9's, not this one's
— which is what lets AC-13 be an exact equality. The alternative (an admin-only summary link
here) was rejected in the spec: one click saved, the only checkable form of the guarantee lost.

**The mapper rule applied.** `getCountHistory` calls `getCount` and drops `itemsWithoutPrice`
in the service. Cost stated rather than hidden: one wasted query per admin detail view. The
alternative — a second query of a count's lines — is the 006 AC-24 second definition.

## Things found while reading the tree that the implementer will hit

- **`role-access.spec.ts` pins `/stock-takes`'s `<h1>` to exactly `Stock Takes`** for both
  roles, and must pass unmodified. So the month label becomes an `<h2>` with
  `data-testid="month-heading"`. AC-1.
- **2090–2100 are all reserved and 2100 is the last year the *start flow* permits** (007 AC-8
  caps a period at 2100; the note in `tests/e2e/support/stock-entry.ts` says there is no
  eleventh year). #10 gets 2101 and 2102 anyway, because `seedCountWithLines` /
  `fillQuantities` / `submitAs` / `approveAs` go through Prisma and the lifecycle service, not
  through `startCount`. AC-21 requires the note to be corrected rather than left misleading.
- **The new specs must run in `chromium-stock-entry`.** They seed counts against the real yard
  sheets, which is exactly the `StockCountLine_itemId_fkey` collision with #6's specs that
  `playwright.config.ts` splits the projects to avoid. Named `stock-takes-*.spec.ts`, so the
  two route patterns become `/(stock-entry|stock-takes)-.*\.spec\.ts/`; AC-21 pins everything
  else in that file byte-identical (`retries: 0`, workers, timeouts, `dependencies`,
  `webServer`).
- **`tests/unit/stock-entry-contract.test.ts`'s reserved-year census matches a filename
  prefix** and would not see the new specs. AC-21 makes it select every spec that imports
  `RESERVED_YEAR` instead — derived, not a bigger literal.
- **The `loading.tsx` guard is a hand-maintained directory list** — the exact artefact #9's
  review found stale, and the one whose failure mode is "nothing catches an assertion that is
  missing". AC-2 replaces it with a derivation over the route tree, which is #9's own
  prescribed replacement, and requires the implementer to prove it bites.

## No AC-33

The spec has a short section saying so and tabulating each shipped assertion it amends against
**the criterion that forces it** — AC-2, AC-4 and AC-21 — with no criterion whose subject is
other criteria, and no count of them. Two of the three replacements are derivations from the
tree, so they go red in the session that causes the change.

## Size

22 criteria against #9's 34 and #7's 33, as asked: this feature writes nothing, ships no
action, no route handler, no form and no client component.
