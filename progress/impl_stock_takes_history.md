# Implementation — feature 10 `stock_takes_history`

**Spec:** `specs/features/010-stock_takes_history.md`
**Status:** complete — **both phases.** All 22 criteria are mapped below, one clause of AC-19
excepted and argued. `#10` stays `in_progress`: marking it `done` is the reviewer's.

## Phase A

Scope, as the coordinator set it and as the spec's *Contract* names it: the pure modules, the
read services, and their tests. No page, no component, no `CalendarGrid` prop, no e2e spec.

### Files created

- `src/lib/held.ts` — `isHeld`, `partitionHeld`. Held is `quantity > 0`, decided on the
  decimal through `compareDecimals` and never on a JavaScript number.
- `src/lib/held.test.ts` — AC-10's six cases, the partition, and the source scan.
- `src/lib/stock-takes-view.ts` — `filterCalendarByYard`, `scopeTallies`. A pure filter over
  `listCalendarMonth`'s result; no query, no `where`, no second grid builder.
- `src/lib/stock-takes-view.test.ts` — AC-7 in full, with no database.
- `src/lib/stock-takes-messages.ts` — every literal a criterion quotes; #7's are re-exported
  by reference, not restated.
- `src/lib/stock-takes-messages.test.ts` — AC-18's identity assertions and the sentences.
- `src/server/counts/stock-takes-input.ts` — `parseYardScope`, `parseHeldView`. Pure; builds
  on `locationCodeSchema` rather than restating which yards exist; never throws.
- `src/server/counts/stock-takes-input.test.ts` — AC-6, AC-9 and AC-17's parameter halves.
- `src/server/counts/count-history-service.ts` — `getCountHistory`, `findNeighbourCounts`.
  Read only, one shape for both roles, no role branch.
- `src/server/counts/count-history-service.db.test.ts` — Level 2, against a real Postgres.
- `tests/unit/stock-takes-contract.test.ts` — the file-level halves of AC-3, AC-4, AC-10,
  AC-12, AC-13, AC-18 and AC-22 **for the modules Phase A ships**. Its header records which
  halves are Phase B's, and why they are not asserted here.

### Files modified

- `src/types/stock-count.ts` — added `YardScope`, `YARD_SCOPES`, `HeldView`, `CountRef`,
  `CountNeighbours`, `CountHistoryLine`, `CountHistoryView`, `CountCursor`. They live here
  for the reason `CountStatus` does: `src/lib/stock-takes-view.ts` needs `YardScope` and
  `docs/architecture.md` forbids `src/lib/**` from importing `src/server/**`.
- `src/lib/money.ts` — added `compareDecimals`, on the `bigint` digits-and-scale machinery
  #9 built. Still names the price column nowhere, so 006 AC-31's `src/lib/**` zero-file
  assertion passes unmodified.
- `src/lib/money.test.ts` — AC-10's five comparisons plus exactness past `Number.MAX_SAFE_INTEGER`.
- `progress/current.md` — the Phase A plan and work log.

Nothing else is touched. `src/server/counts/count-service.ts`, `src/app/stock-entry/**`,
`src/components/stock-entry/**`, `src/lib/count-messages.ts`, `src/lib/auth-config.ts`,
`src/middleware.ts`, `prisma/schema.prisma`, `prisma/migrations/**` and
`src/server/test-db.ts` are byte-identical, asserted by
`tests/unit/stock-takes-contract.test.ts` (AC-4, AC-22).

### Acceptance criteria — what Phase A satisfies

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-3 (services) | `src/server/counts/count-history-service.ts:72,174` | `count-history-service.db.test.ts` → "AC-3: a null actor raises UnauthorizedError…" ×2; "AC-3: reading a count changes no row and no column of it"; `tests/unit/stock-takes-contract.test.ts` → "AC-3: both service functions take an actor first…", "AC-3: the service applies no write operation to any model" |
| AC-4 (no second query) | `src/lib/stock-takes-view.ts:49` | `tests/unit/stock-takes-contract.test.ts` → "AC-4: count-service.ts is byte-identical…", "AC-4: listCalendarMonth is the only function that returns a CalendarMonth"; `stock-takes-view.test.ts` → "AC-7: BOTH returns a value deeply equal to the input" |
| AC-6 (parser + scope meaning) | `src/server/counts/stock-takes-input.ts:55` | `stock-takes-input.test.ts` → "AC-6: …", ×4; `count-history-service.db.test.ts` → "AC-6: on a day only Clonmel was counted, DUBLIN leaves the cell plain" |
| AC-7 (whole) | `src/lib/stock-takes-view.ts:49,76` | `stock-takes-view.test.ts` → 12 assertions; `count-history-service.db.test.ts` → "AC-7: the scope filter over listCalendarMonth answers the three scopes" |
| AC-8 (service half) | `count-history-service.ts:72` | `count-history-service.db.test.ts` → "AC-8: the yard, the period, the date…", "AC-8: every line comes back, in ItemLocation.sortOrder…", "AC-8: the quantity is exactly as stored…", "AC-8: a line whose item was archived after the count still appears, unchanged", "AC-8, AC-17: a countId that does not exist is a typed NotFoundError" |
| AC-9 (the partition, the sentence) | `src/lib/held.ts:48`, `src/lib/stock-takes-messages.ts:120` | `count-history-service.db.test.ts` → "AC-9: null and 0 survive the read as different facts", "AC-9: the held partition over an 82-line count is 47 held and 35 hidden"; `stock-takes-messages.test.ts` → "AC-9: the hidden summary…"; `stock-takes-input.test.ts` → "AC-9: …" ×3 |
| AC-10 (whole) | `src/lib/money.ts:225`, `src/lib/held.ts:34,48` | `money.test.ts` → "AC-10: …" ×5; `held.test.ts` → "AC-10: …" ×7; `stock-takes-contract.test.ts` → "AC-10: no Number(, parseFloat…", "006 AC-31: money.ts still names the price column nowhere" |
| AC-11 (the ordering and the jumps) | `count-history-service.ts:174` | `count-history-service.db.test.ts` → "AC-11: …" ×7, including "two counts at one yard sharing a countDate are reachable exactly once" |
| AC-12 (the service half of the walk) | `count-history-service.ts:80-101` (the mapper) | `count-history-service.db.test.ts` → "AC-12: no monetary key at any depth, for a staff actor AND for an admin", "AC-12: the neighbours carry no monetary key, for either role, and are deeply equal", "AC-12: the scoped month carries no monetary key…"; `stock-takes-messages.test.ts` → "AC-12: …" ×2 |
| AC-13 (the mapper and the scan of Phase A's modules) | `count-history-service.ts:91-104` | `count-history-service.db.test.ts` → "AC-13: the SERVICE drops itemsWithoutPrice, not the page", "AC-12, AC-13: the two roles get deeply equal values, and one shape"; `stock-takes-contract.test.ts` → "AC-13: no role name, role field or role-shaped chooser…", "AC-13: the mapper is written field by field…" |
| AC-17 (the service half) | `count-history-service.ts:181` | `count-history-service.db.test.ts` → "AC-17: a cursor date that is not a real day is a typed ValidationError", "AC-8, AC-17: a countId that does not exist is a typed NotFoundError"; `stock-takes-input.test.ts` → "AC-17: no input makes it throw" ×2 |
| AC-18 (the module half) | `src/lib/stock-takes-messages.ts` | `stock-takes-messages.test.ts` → "AC-18: the status-label record is the SAME OBJECT…", "AC-18: the two empty-state sentences are the same strings…", "AC-18: every other re-export is identical to its source, by reference"; `stock-takes-contract.test.ts` → "AC-18: the three src/lib modules import nothing from src/server but @/server/errors" |
| AC-20 (the no-database path, for what exists) | — | `npm run typecheck`, `npm run lint`, `npm run test:unit` all green; no module Phase A adds opens a connection at import time (`stock-takes-contract.test.ts` → "AC-7: neither pure module reaches a database, a clock or the environment") |
| AC-22 (no migration, nothing else touched) | — | `stock-takes-contract.test.ts` → "AC-22: the schema, the migrations and TRUNCATED_TABLES are unchanged", "AC-22: TRUNCATED_TABLES still holds exactly its eight entries" |

### Left to Phase B, explicitly

Every one of these needs a page, a component or a browser, and none of them is asserted
anywhere yet:

- **AC-1** — both routes, the `<h1>`, `signed-in-email`, `sign-out`, the `<h2>` month
  heading, and the signed-out `307`. Needs `src/app/stock-takes/**`.
- **AC-2** — the derived `loading.tsx` assertion replacing the five hand-listed directories
  in `tests/unit/stock-entry-contract.test.ts`, **and the degradation the criterion requires
  the implementer to reproduce** (adding `src/app/stock-takes/loading.tsx`, recording both
  status codes and the failing test name). Both need the routes to exist.
- **AC-3, second half** — the scan of `src/app/stock-takes/**` for `db.` and for write
  operations. The service half is done; the page half has nothing to scan yet.
- **AC-4, second half** — the two optional `CalendarGrid` props, `/stock-entry/page.tsx`
  staying byte-identical, the end-to-end badge-set equality, and the scan that
  `buildMonthGrid` is called from exactly one module and that `src/app/stock-takes/**`
  holds no weekday-heading literal.
- **AC-5** — what each calendar owns, by absence, at the browser.
- **AC-6, second half** — the rendered selector, `aria-current`, and the `307` for a bad
  `?yard`.
- **AC-7, last sentence** — `src/app/stock-takes/page.tsx` calls `listCalendarMonth` exactly
  once per render and passes it no yard argument.
- **AC-8, AC-9, second halves** — the rendered rows, `data-testid="history-line"`,
  `hidden-summary`, `data-counted="zero"` / `"no"`, and the `?show` redirect.
- **AC-10, last clause** — the scan of `src/app/stock-takes/**` for `Number(` and friends.
- **AC-11, the placements** — the calendar's two cursors and the detail's, as links, and the
  `aria-disabled` control where there is no neighbour. *(The service takes ONE cursor. On the
  calendar the page must call it twice — with the month's first day, taking `previous`, and
  with its last day, taking `next` — because the two ends of a month are two cursors. This is
  documented on `findNeighbourCounts` and is the only non-obvious thing Phase B inherits.)*
- **AC-12, the browser half** — no `€`, no `No price`, no `unitPrice` in the rendered HTML of
  the four URLs, for both roles, for a draft, a submitted and an approved count.
- **AC-13, the byte-identity** — `data-testid="stock-takes-body"` equal between sessions, and
  the scan of `src/app/stock-takes/**` and `src/components/stock-takes/**`.
- **AC-14, AC-15, AC-16, AC-19, AC-21** — entirely Phase B.
- **AC-17, second half** — the twelve query-parameter combinations against both pages.
- **AC-18, second half** — no `"use client"` module under the two page trees, and the
  `javaScriptEnabled: false` navigation.
- **AC-20, the derived `force-dynamic` census** — every `page.tsx` outside `src/app/(public)/`
  declares it, "true of all 17 today and of the 19 this feature leaves behind".
- **AC-21** — the two e2e specs, the `playwright.config.ts` route patterns, `RESERVED_YEAR`
  gaining `takesCalendar: 2101` and `takesCount: 2102`, and the amended census in
  `tests/unit/stock-entry-contract.test.ts`.

## Verification output

The coordinator runs the gate. Phase A was verified with targeted commands only:

```
npm run typecheck                      ->  exit 0
npm run lint                           ->  exit 0   (eslint src tests --max-warnings 0)
npm run test:unit                      ->  exit 0   48 files, 679 tests   (614 before this session)
npm run test:db                        ->  exit 0   21 files, 359 tests, 421 s
   src/server/counts/count-history-service.db.test.ts  ->  26 tests, 25.7 s
```

`npm run test:unit` went from 614 to 679 tests (+65) and `npm run test:db` from 333 to 359
(+26); no
shipped test was edited, deleted or skipped.

## Deviations from the spec

None in behaviour. Three choices the spec left to the implementation, recorded because a
reviewer would otherwise have to derive them:

1. **The shapes live in `src/types/stock-count.ts`.** The spec's *Shapes* block does not say
   which file. They cannot live in `stock-takes-input.ts`, because `src/lib/stock-takes-view.ts`
   needs `YardScope` and may not import from `src/server/`. This is the layout 007 AC-25
   settled for `CountStatus`, for the same reason.
2. **`parseYardScope` and `parseHeldView` return the default for an ABSENT parameter and
   `null` for an unreadable one.** AC-16 requires `/stock-takes` with no query string not to
   be redirected, and AC-6 requires `?yard=banana` to be a `307`; a parser that answered
   `null` to both could not tell the page which to do. `null` means *redirect*.
3. **`findNeighbourCounts` takes one cursor, so the calendar asks twice.** See the AC-11 note
   above. The alternative — a second signature, or a month-shaped argument — would have
   changed the signature the spec fixes.

## Notes for the reviewer

**One shipped assertion went red during this session, and the CODE was changed, not the
test.** `tests/unit/count-entry-contract.test.ts` → "AC-3: nothing Phase A adds imports
listSheet" bans the **substring** `listSheet` from every shipping module under
`src/server/counts/`, not merely the import. The first draft of
`count-history-service.ts` named it in a doc comment explaining that it is deliberately not
called. The comment was reworded; nothing else moved. Worth knowing for Phase B: 008 AC-3
already enforces 010 AC-8's "`listSheet` is called nowhere" for `src/server/counts/**`, but
**not** for `src/app/stock-takes/**` — that tree is Phase B's to scan.

**The db test names no status past `DRAFT`, on purpose.** 007 AC-25 as amended by 009 AC-26
holds an EXACT list of six files under `src/server/counts/` that may contain
`SUBMITTED|APPROVED|submittedAt|approvedAt|signatureSvg|unitPrice`, and that list includes
test files. A seventh would turn it red. `count-history-service.db.test.ts` therefore reaches
the other two statuses positionally through `COUNT_STATUSES`
(`const [DRAFT, SIGNED_OFF_PENDING, SIGNED_OFF] = COUNT_STATUSES;`). It is indirection, and
it is the cheapest thing that keeps a shipped assertion honest; the alternative was editing
that assertion, which is not mine to do.

**Two mutations, run and reverted, with what they proved.**

| Mutation | `npm run typecheck` | What went red |
|---|---|---|
| `return { ...count, countId: … }` in `getCountHistory`'s mapper | **exit 0** | `tests/unit/stock-takes-contract.test.ts` → "AC-13: the mapper is written field by field, so a later key cannot ride along" |
| `isHeld` returns `compareDecimals(quantity, NONE) >= 0` | exit 0 | `src/lib/held.test.ts` → 6 of 10 tests, including "AC-10: answers the six cases the criterion names" |

The first is the one that matters: **TypeScript passed with the spread in place.** An object
literal with a spread gets no excess-property check, so `itemsWithoutPrice` would have
travelled to an administrator's screen with `typecheck` green — #8's finding, reproduced a
third time. The assertion, not the compiler, is what holds the money boundary here.

**A weakness I could not close, stated rather than hidden.** `isHeld` rewritten as
`Number(quantity) > 0` passes every behavioural test in `held.test.ts` — the only thing that
catches it is the source scan for `Number(`. That is AC-10's design and it is the same
mechanism 009 relied on, but it is a scan, and a scan is defeated by a computed spelling. The
behavioural backstop is that `compareDecimals` is exact past `Number.MAX_SAFE_INTEGER` and
`held.test.ts` asserts that, so a `number` rewrite of *`compareDecimals`* is caught
behaviourally even though a `number` rewrite of *`isHeld`* is not.

**`anyCountEver` is deliberately not rescoped by `filterCalendarByYard`.** It answers "has
this product ever recorded a stock take", which is what the never-counted-anything empty
state asks (spec, *UI states*). Rescoping it would make `?yard=CLONMEL` on a month with no
Clonmel counts render `No stock counts recorded yet.` and a *Start a count* link, which is
the wrong sentence and the wrong affordance. The scoped-but-empty state is
`No counts in this month.`, which `countsInMonth === 0` already selects.

**The cost the spec accepts, confirmed in practice.** An administrator opening the history
detail causes one `itemsWithoutPrice` query whose answer is discarded by the mapper. It is
one `db.item.count` inside `getCount`'s admin thunk; the db test asserts the discard
(`Object.hasOwn(view, "itemsWithoutPrice") === false`) **and** that `getCount` really
returned it, so the assertion cannot pass vacuously against a shape that never carried it.

---

# Phase B

**Status:** complete. `#10` stays `in_progress` — marking it `done` is the reviewer's, not mine.

Scope, as the coordinator set it: the two pages, `CalendarGrid`'s two optional props, the e2e
specs, the mutation proofs and this report.

## Files created

- `src/app/stock-takes/counts/[id]/page.tsx` — the read-only record. Held only by default, the
  three Invariant-5 states kept apart in the DOM, one link into #9's tree, no form and no
  button anywhere on it.
- `src/components/stock-takes/ScopeSelector.tsx` — the three scope links, `aria-current` on
  exactly one. It is handed its options already built, so it spells no URL and no yard.
- `src/components/stock-takes/CountJump.tsx` — one control in its two states: an anchor, or a
  non-anchor `aria-disabled="true"` under the same `data-testid` and the same label.
- `src/components/stock-takes/HistoryLines.tsx` — item, quantity, unit, and
  `data-counted="yes" | "zero" | "no"`.
- `tests/e2e/stock-takes-calendar.spec.ts` — 17 tests, reserved year **2101**.
- `tests/e2e/stock-takes-count.spec.ts` — 17 tests, reserved year **2102**.
- `tests/e2e/support/stock-takes.ts` — #10's own e2e fixtures. A NEW module rather than an
  edit to `tests/e2e/support/stock-entry.ts`, because AC-22 permits that shipped file to be
  amended "exactly as AC-21 names and no further" — which is `RESERVED_YEAR` and its note.

## Files modified

- `src/components/stock-entry/CalendarGrid.tsx` — **the one shipped source file this feature
  edits.** Two optional props, `badgeHref` and `emptyDayHref`, whose defaults are the old
  body verbatim. `src/app/stock-entry/page.tsx` is byte-identical and asserted so.
- `src/app/stock-takes/page.tsx` — #3's placeholder replaced by the history calendar.
- `src/lib/stock-takes-messages.ts` — `YARD_LABEL` (re-export) and `countedBy(name)`. The
  second one is not decoration; see *The finding that mattered most* below.
- `src/lib/stock-takes-messages.test.ts` — one test for `countedBy`.
- `src/server/counts/stock-takes-input.ts` — `stockTakesHref`, the inverse of the two parsers
  beside them. Deviation, argued below.
- `src/server/counts/stock-takes-input.test.ts` — five tests for it, including a round trip
  through `parseYardScope` / `parseHeldView`.
- `tests/unit/stock-takes-contract.test.ts` — Phase B's scan halves (17 more assertions).
- `tests/unit/stock-entry-contract.test.ts` — AC-2's derived `loading.tsx` set, AC-21's
  census, and the two route patterns its AC-30 block pins. Each named below.
- `playwright.config.ts` — two route patterns. `git diff` shows **four changed lines** and
  nothing else, asserted.
- `tests/e2e/support/stock-entry.ts` — `takesCalendar: 2101`, `takesCount: 2102`, and the
  2100 note corrected to say the cap binds only counts created through `startCount`.
- `progress/current.md` — the Phase B plan and work log.

**`src/lib/money.ts`, `src/lib/money.test.ts` and `src/types/stock-count.ts` are PHASE A's,
not Phase B's.** The coordinator asked why they are modified when the Phase B plan does not
list them: they carry `compareDecimals` and this feature's nine shapes, both recorded in the
Phase A *Files modified* list above, and Phase B added nothing to either. `git diff` on them
today is the same diff the Phase A gate ran against (+37 and +94 lines). Nothing to revert.

## Acceptance criteria — all 22, across both phases

Phase A's half of each is in the table above; this one is the whole criterion.

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | `src/app/stock-takes/page.tsx:154`, `counts/[id]/page.tsx` | `stock-takes-calendar.spec.ts` → "AC-1: a signed-out GET is a 307 to sign-in carrying the path, and sends no content", "AC-1: both roles get 200, the heading, the email and a way out"; `role-access.spec.ts` and `sign-in.spec.ts` pass **unmodified** (9 + 14 tests, re-run this session) |
| AC-2 | no `loading.tsx` under `src/app/` but `(public)`'s | `tests/unit/stock-entry-contract.test.ts` → "AC-3, 010 AC-2: no loading.tsx sits on the path to any protected page, derived from the tree" (23 directories derived, floor 10, expectation 14), "AC-3: the PUBLIC segment's loading.tsx is unchanged and still there". Degradation reproduced — transcript below |
| AC-3 | `count-history-service.ts:72,174`; the pages hold no `db.` | `stock-takes-contract.test.ts` → "AC-3: no db. reference and no write operation anywhere outside the service", + Phase A's four; `stock-takes-calendar.spec.ts` → "AC-3: reading the calendar writes nothing"; `stock-takes-count.spec.ts` → "AC-3: reading a count writes nothing"; both `afterAll`s compare `realCountIds()` and `seededMasterCounts()` |
| AC-4 | `CalendarGrid.tsx:52-70`, `src/lib/stock-takes-view.ts:49` | `stock-takes-contract.test.ts` → "AC-4: /stock-entry/page.tsx is byte-identical…", "AC-4: CalendarGrid gains exactly two optional props, and their defaults are #7's", "AC-4: buildMonthGrid is called from exactly one module…"; `stock-takes-calendar.spec.ts` → "AC-4: the two calendars render the SAME badges for the same month", "AC-4, AC-19: the badge is the SAME box on both calendars…" |
| AC-5 | `page.tsx:245` (`emptyDayHref={() => null}`) | `stock-takes-calendar.spec.ts` → "AC-5: what each calendar owns, asserted by absence" |
| AC-6 | `page.tsx:126-148`, `ScopeSelector.tsx` | `stock-takes-calendar.spec.ts` → "AC-6: three scope links, labelled and tallied for the displayed month", "AC-6: what Both means on a day only one yard was counted", "AC-6, AC-17: an unreadable ?yard is a 307 and no error"; `stock-takes-input.test.ts` → four |
| AC-7 | `src/lib/stock-takes-view.ts` | `stock-takes-view.test.ts` (12 assertions, no database); `stock-takes-contract.test.ts` → "AC-7: the page calls listCalendarMonth exactly once, and passes it no yard" |
| AC-8 | `counts/[id]/page.tsx`, `HistoryLines.tsx` | `stock-takes-count.spec.ts` → "AC-8: the record is the yard, the period, the day, who counted it and its status", "AC-8: this page cannot be typed into…", "AC-8: the quantity is exactly as stored, never rounded", "AC-8: the rows are in the order getCount returns…", "AC-8, AC-17: a count that does not exist is a sentence and a way back"; `count-history-service.db.test.ts` → the archived-item test; `stock-takes-contract.test.ts` → "AC-8: listSheet is called nowhere in this feature" |
| AC-9 | `counts/[id]/page.tsx:118`, `src/lib/held.ts` | `stock-takes-count.spec.ts` → "AC-9: held only is the default, and the page says what it hid", "AC-9: show=all renders every row, and 0 stays distinguishable from never counted", "AC-9: ?show=held renders identically to no ?show at all", "AC-9: an unreadable ?show is a 307 that keeps the yard" |
| AC-10 | `src/lib/money.ts:225`, `src/lib/held.ts` | `money.test.ts` ×5, `held.test.ts` ×7, `stock-takes-contract.test.ts` → "AC-10: no Number(, parseFloat, toFixed or Math.round under src/app/stock-takes" + Phase A's |
| AC-11 | `page.tsx:110-114` (two cursors), `counts/[id]/page.tsx:148` (one) | `stock-takes-calendar.spec.ts` → "AC-11: Previous count skips the months nobody counted at that yard", "AC-11: with no neighbour the control still renders, disabled and not an anchor"; `stock-takes-count.spec.ts` → "AC-11: the jumps are same-yard, and carry the reading mode"; `count-history-service.db.test.ts` ×7 |
| AC-12 | the mapper, and every page | `count-history-service.db.test.ts` → "AC-12: no monetary key at any depth, for a staff actor AND for an admin" (+2); `stock-takes-calendar.spec.ts` → "AC-12, AC-13: the calendar body is byte-identical between the two roles, and has no euro"; `stock-takes-count.spec.ts` → "AC-12, AC-13: for a draft, a submitted and an approved count, one body and no euro"; `stock-takes-contract.test.ts` → "AC-12: no module in either tree names a currency symbol or a price column" |
| AC-13 | there is no role branch to point at, which is the criterion | the two "AC-12, AC-13" e2e tests (byte equality of `stock-takes-body`, three statuses, four URLs, both roles); `stock-takes-contract.test.ts` → "AC-13: there is no role branch anywhere in the two trees this feature adds"; Phase A's mapper test |
| AC-14 | nothing reads a header, a cookie or a query for identity | `stock-takes-calendar.spec.ts` → "AC-14: nothing the client sets changes what either session is sent"; `stock-takes-count.spec.ts` → "AC-14: role cannot be influenced by a query, a header or a cookie" |
| AC-15 | `counts/[id]/page.tsx:253` | `stock-takes-count.spec.ts` → "AC-15: one link into Stock Entry, the same for both roles, and nothing to /summary" (including 009 AC-1's 307/200 pair); `stock-takes-contract.test.ts` → "AC-15: no page this feature adds names /summary or any URL beneath a count" |
| AC-16 | `stockTakesHref`, used by every link on both pages | `stock-takes-calendar.spec.ts` → "AC-16: every link on a scoped calendar carries the scope, and the default is never spelled"; `stock-takes-count.spec.ts` → "AC-16: badge, Show all items, Previous count, Back to the calendar — the scope rides"; `stock-takes-input.test.ts` → five |
| AC-17 | the two parsers, and the `NotFoundError` branch | `stock-takes-calendar.spec.ts` → "AC-17: no query parameter combination returns a 500 or a database string" (twelve combinations); `stock-takes-count.spec.ts` → "AC-8, AC-17: a count that does not exist…", "AC-9: an unreadable ?show is a 307 that keeps the yard"; `count-history-service.db.test.ts` ×2 |
| AC-18 | `src/lib/stock-takes-messages.ts`; no `"use client"` | `stock-takes-messages.test.ts` ×14; `stock-takes-contract.test.ts` → "AC-18: this feature ships no `use client` module"; `stock-takes-calendar.spec.ts` → "AC-18: with the bundle disabled, every control on the calendar still navigates"; `stock-takes-count.spec.ts` → "AC-18: the held toggle and the jumps work with the bundle disabled" |
| AC-19 | the page markup (`min-h-11 min-w-11` on every control) | `stock-takes-calendar.spec.ts` → "AC-19: the calendar never scrolls sideways at 390 px or 320 px, in any scope"; `stock-takes-count.spec.ts` → "AC-19: the record never scrolls sideways at 390 px or 320 px, in either view". **One clause of this criterion is NOT met — the count badge. See *What I could not prove*.** |
| AC-20 | both pages declare `force-dynamic` | `stock-takes-contract.test.ts` → "AC-20: every page outside the public segment declares force-dynamic, derived", "AC-20: no module this feature adds opens a connection at import time"; `npx prisma validate`, `typecheck`, `lint`, `test:unit`, `npm run build` all exit 0. **The criterion's arithmetic is off by one — see *Deviations*.** |
| AC-21 | `playwright.config.ts`, `RESERVED_YEAR`, the two specs | `stock-entry-contract.test.ts` → "AC-30, 010 AC-21: the count specs run after the specs that edit the yard sheets", "AC-30: every stock-entry spec owns one reserved year and deletes only that year" (twelve files, twelve years); `stock-takes-contract.test.ts` → "AC-21, AC-22: playwright.config.ts changed by exactly its two route patterns". Two consecutive runs of both new specs: **34 passed, 0 failed, 0 flaky** |
| AC-22 | nothing else is touched | `stock-takes-contract.test.ts` → "AC-22: CalendarGrid.tsx is the only changed file in #7's trees", "AC-22: the schema, the migrations and TRUNCATED_TABLES are unchanged", "AC-22: TRUNCATED_TABLES still holds exactly its eight entries"; `git status --porcelain -- Samples prisma` is empty |

## AC-2 — the degradation, reproduced

Byte copy taken, `src/app/stock-takes/loading.tsx` added, `npm run build`, measured, removed,
rebuilt, re-measured. **Both status codes, as the criterion asks:**

| Request | Shipped tree | With `src/app/stock-takes/loading.tsx` |
|---|---|---|
| signed-out `GET /stock-takes` | `307`, `location: /sign-in?callbackUrl=%2Fstock-takes` | **`307`, same `Location` — unchanged** |
| signed-out `GET /stock-takes/counts/abc` | `307`, `location: /sign-in?callbackUrl=%2Fstock-takes%2Fcounts%2Fabc` | **`307`, same `Location` — unchanged** |
| signed-in `GET /stock-takes?yard=banana` | **`307`** with a `Location` | **`200` with none** |

**AC-2 names the wrong request, and this is worth the reviewer's attention.** The
criterion predicts the signed-out `GET` of `/stock-takes/counts/<id>` degrades from a `307`
to a `200`. It does not, and cannot: that refusal is the **middleware's** — `PROTECTED_PATHS`
has held `/stock-takes` since #3 — and the middleware answers before any Suspense boundary
exists. The refusal that *does* degrade is the one this page issues itself, the query-parameter
`redirect()`, and it degrades exactly as #3, #6, #7 and #9 each recorded: `307` with a
`Location` header becomes `200` with none. The rule is right; the example in the criterion is
not, and a future reader trusting it would conclude the rule had stopped mattering.

**The tests that went red with the file present:**

- `tests/unit/stock-entry-contract.test.ts` → **"AC-3, 010 AC-2: no loading.tsx sits on the
  path to any protected page, derived from the tree"** — `src/app/stock-takes/loading.tsx:
  expected true to be false`.
- `tests/e2e/stock-takes-calendar.spec.ts` → **"AC-6, AC-17: an unreadable ?yard is a 307 and
  no error"** — `Expected: 307, Received: 200`.

Restored: `find src/app -name "loading.ts*"` lists only `src/app/(public)/loading.tsx`, and
both tests are green again.

## Mutation proofs

Byte copy before each edit; restore verified by `sha256sum` against the copy taken first.
**No mutation remains in the tree** — the three hashes at the end of this section are the
hashes from before the first mutation.

### M1 — a role branch that adds something for an administrator

```tsx
{user.role === "ADMIN" ? <p data-testid="admin-note">Administrator view</p> : null}
```

| Check | Result |
|---|---|
| `npm run typecheck` | **exit 0** |
| `tests/unit/stock-takes-contract.test.ts` → "AC-13: there is no role branch anywhere in the two trees this feature adds" | **RED** — `src/app/stock-takes/counts/[id]/page.tsx names "ADMIN"` |
| `tests/e2e/stock-takes-count.spec.ts` → "AC-12, AC-13: for a draft, a submitted and an approved count, one body and no euro" | **RED** — `Expected: 32958, Received: 33008` |

Both halves fire: the scan sees the branch in the source, and the browser sees the two bodies
diverge by the 50 characters the extra paragraph costs. The byte-identity assertion does not
depend on the scan, which matters — a role branch spelled without the literal `"ADMIN"`
(`user.role !== STAFF`, say) would slip the scan and still be caught at the browser.

### M2 — the yard filter as a second definition that disagrees with #7

`filterCalendarByYard`'s result re-derived with an off-by-one on the month's last day —
what a second `where` clause invites.

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `tests/e2e/stock-takes-calendar.spec.ts` → "AC-4: the two calendars render the SAME badges for the same month" | **RED** — the 30 April badges are on `/stock-entry` and absent from `/stock-takes` |
| `tests/e2e/stock-takes-calendar.spec.ts` → "AC-4, AC-19: the badge is the SAME box on both calendars…" | RED (collaterally: the badge it measures no longer exists) |

### M3 — held-only dropped

`const shown = count.lines;`

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `tests/e2e/stock-takes-count.spec.ts` → "AC-9: held only is the default, and the page says what it hid" | **RED** — `Expected: 71, Received: 83` |
| the other three AC-9 tests | **still green** |

Worth recording plainly: exactly ONE assertion catches this. "`?show=held` renders identically
to no `?show` at all" is trivially true when the filter is gone, and the `show=all` test is
unaffected by definition. The default is protected by a single count, and that count is
derived from the fixture rather than hard-coded — which is right, but it is one thread.

### M4 — a total added to the returned shape

`totalHeld: lines.length` in `getCountHistory`'s mapper.

| Check | Result |
|---|---|
| `npm run typecheck`, mapper unchanged otherwise | **RED — `TS2353: 'totalHeld' does not exist in type 'CountHistoryView'`** |
| after also adding `totalHeld: number` to `CountHistoryView` (what a real change would do) | exit 0 |
| `src/server/counts/count-history-service.db.test.ts` → "AC-12: no monetary key at any depth, for a staff actor AND for an admin" | **RED** — `moneyKeysIn` returned `["totalHeld"]` |
| the browser-level AC-12 text scans (`€`, `No price`, `unitPrice`) | **would NOT have caught it** |

**This is the counterpart to Phase A's finding and it deserves to be read beside it.** Phase A
showed that `return { ...count, … }` compiles clean while shipping `itemsWithoutPrice` to an
administrator. M4 shows the other half: *because* the mapper is written field by field, the
compiler refuses the very same class of mistake at the first attempt. The field-by-field rule
is not belt-and-braces on top of the type system — it is the thing that lets the type system
help at all. And when the type is widened too, only the **key walk** catches it: the browser
scan looks for `€`, `No price` and `unitPrice`, and `totalHeld` is none of those.

### Restore, verified

```
27cfd5f287662802d23a7fed13a96d6d07a1a68a6331e17e8aa62ada8f5add9b  src/server/counts/count-history-service.ts
d78968d523bf60b9d24a7ee44d1087bd5c518a171a2b1ce29151fba33527da64  src/app/stock-takes/counts/[id]/page.tsx
e19d220b70e1f4d060f4184b60cf3132a71c9dd69f6aa5c1f6dd5fc453ebc71b  src/app/stock-takes/page.tsx
```

Identical to the pre-mutation hashes. `src/types/stock-count.ts` is back to Phase A's `+94`
diff, and `grep -c totalHeld` is `0` in both files it touched. (The detail page's hash above
is its pre-mutation hash; the `countedBy` change described below was made **after** the
mutations, so the shipped file differs from it by that one edit and by nothing else.)

## The finding that mattered most — AC-13 was a race, twice, before it was a proof

The byte-identity comparison failed twice with the two bodies differing by **exactly eight
characters**, once with the administrator's longer and once with the staff one's. Both times
the URL was a `?show=all` detail. It did not reproduce when the test was run alone, which is
the shape of a defect that reaches `done`.

Instrumenting the comparison to dump both bodies found it in one run:

```
STAFF: …<span class="text-slate-500">Counted by</span> <!-- -->E2E Yard Staff</p>…
ADMIN: …<span class="text-slate-500">Counted by</span> E2E Yard Staff</p>…
```

`<!-- -->` is React's **text separator**: the server emits it between two adjacent children so
that hydration can tell the text nodes apart, and hydration then **removes it**. So the body
of these pages is eight characters shorter a moment after it arrives, and an equality between
two fetches is an equality between two moments. Nothing to do with roles at all — but it would
have failed the feature's headline criterion, intermittently, at `retries: 0`, in front of the
reviewer.

Fixed at the source rather than papered over: the sentence is now one expression,
`countedBy(name)` in `src/lib/stock-takes-messages.ts`, so no separator is emitted at all. Both
e2e specs additionally assert `expect(body).not.toContain("<!-- -->")` **before** comparing, so
the class of instability is now caught by a test rather than by luck. Two consecutive runs of
both files: 34 passed, 0 failed, 0 flaky.

A second cross-file defect surfaced the same way: both "no neighbour, so the control is
disabled" assertions depended on **another spec file's** reserved year (`stock-takes-calendar`
owns 2101 and seeds Dublin counts in it; the eight stock-entry files own 2091–2100), and the
two files run in parallel. Both were rewritten to depend on "nothing exists AFTER", which is a
fact about the whole reservation scheme — 2102 is the highest reserved year, the item-master
`periodYear: 2999` fixture belongs to the `chromium` project which has completed, and a real
count is always below `RESERVED_FLOOR`. That is 007 AC-30's rule applied to *reads* as well as
to writes, and it is worth carrying forward: a spec may not assume it is the only file in the
database, even for an assertion that writes nothing.

## Shipped assertions amended, and the argument that each is forced or stricter

| Assertion | Forced by | Why it could not stay, and why the replacement is not weaker |
|---|---|---|
| `tests/unit/stock-entry-contract.test.ts` → the hand-listed five `loading.tsx` directories | **AC-2** | Two new protected routes it could not see. The replacement DERIVES the set from the tree — 23 directories today against the 5 typed out, with a floor of 10 and an expectation of 14 — and still names all five explicitly, so it is strictly stronger and it goes red in the session that adds a route rather than three phases later |
| `tests/unit/stock-entry-contract.test.ts` → the reserved-year census | **AC-21** | It matched the filename prefix `stock-entry-`, and #10's two specs are called `stock-takes-*`. Now selects **every spec under `tests/e2e/` that imports `RESERVED_YEAR`** — twelve files, twelve distinct years, both equalities — so a spec of any name that reuses a sibling's year turns it red |
| `tests/unit/stock-entry-contract.test.ts` → the two `playwright.config.ts` route patterns | **AC-21** | The config's patterns changed, so the assertion that pinned the old ones had to move with them. The new form names both prefixes AND additionally requires every spec that reserves a year to be matched by the pattern — a check the old one did not make |
| `tests/unit/stock-takes-contract.test.ts` (Phase A's own) → `src/components/stock-entry` byte-identical | **AC-4** | AC-4 requires exactly one file in that tree to change. Replaced by an equality on the list of changed files — `["src/components/stock-entry/CalendarGrid.tsx"]` — which still forbids every other file in both trees and is a tighter claim than an emptiness check over a directory |
| three of my own new scans, against my own doc comments | — | `/summary`, `itemsWithoutPrice` and a `listCalendarMonth(...)` inside a comment each turned a Phase B scan red. **The comments were reworded; no assertion was loosened.** Phase A hit the same thing with `listSheet`. That is four occurrences in one feature, and the rule it teaches is now written into the detail page's own header: these scans are on SUBSTRINGS and a doc comment is not an exemption |

No other shipped assertion went red at any point in Phase B.

## Deviations from the spec

1. **`stockTakesHref` lives in `src/server/counts/stock-takes-input.ts`, which the spec's
   module table gives two exports.** The two pages between them render nine kinds of link and
   AC-16 requires every one of them to carry the reading mode; nine hand-built query strings
   are nine chances to drop `yard`. It sits beside the parsers because it is their inverse —
   the module is now "how this feature spells its query string, in both directions" — and
   because `DEFAULT_YARD_SCOPE` is stated there, so "the default is never spelled into a URL"
   is one fact in one place. It could not go in `src/lib/stock-takes-view.ts` without
   restating `"BOTH"` there, `src/lib/**` being unable to import from `src/server/`.
2. **AC-20's census is 18 pages, not 19.** The criterion says "true of all 17 today and of the
   19 this feature leaves behind". 17 today is correct; this feature adds **one** page file,
   because `/stock-takes/page.tsx` has existed since #3 as a placeholder and is replaced rather
   than created. The assertion follows the tree (`expect(pages).toHaveLength(18)`) and the
   arithmetic is recorded rather than rounded — an equality that agreed with a wrong number
   would be a test asserting a typo.
3. **AC-2's degradation is reproduced on the page's own refusal, not on the signed-out GET.**
   See the transcript above. The criterion's rule holds; its example does not.
4. **`countedBy(name)` is a new export of the messages module.** Forced by AC-13 — see *The
   finding that mattered most*. `COUNTED_BY_LABEL` is still the only spelling of the label.
5. **`YARD_LABEL` re-exported** for the selector's accessible name, rather than a second
   spelling of `Yard` in a component.

## What I could not prove

**AC-19's "each count badge has a bounding box of at least 44 × 44 CSS px" is NOT met, and it
cannot be met by this feature.** Measured at 390 px, on both calendars: **47.14 × 29**.

The badge belongs to `CalendarGrid`, which is #7's. AC-4 allows this feature **exactly two
optional props** on that component and requires `/stock-entry`'s rendering to be unchanged —
so making the badge 44 px tall would change #7's calendar, and a 44 px badge does not fit two
counts in a 64 px day cell anyway (30 April in the fixture carries two). The two criteria
disagree, and the disagreement is not mine to settle: restyling #7's calendar from inside #10
is exactly the "tweak" the brief forbids.

What is asserted instead, in `tests/e2e/stock-takes-calendar.spec.ts` → "AC-4, AC-19: the
badge is the SAME box on both calendars, and is not a 44 px target": the badge's width and
height are **identical** on `/stock-entry` and `/stock-takes` (AC-4, measured rather than
scanned), its width is at least 40 px, and its height is pinned below 44 with the reason in the
comment — so a later change to it is visible rather than silent. **Every other control AC-19
lists is asserted at 44 × 44, at 390 px and at 320 px, in both views and all three scopes**, and
neither document scrolls sideways at either width.

The choices for the user, stated so the decision is theirs: leave it (a badge is a 47 × 29 tap
target inside a 55 × 64 day cell, which is a large target in practice); or amend AC-19 to say
so; or give #7's calendar taller cells in a later feature, which is a change to #7's screen and
belongs in a session that owns it.

## Verification output

The coordinator runs the gate. Phase B was verified with targeted commands only:

```
npx prisma validate                    ->  exit 0   "The schema at prisma\schema.prisma is valid"
npm run typecheck                      ->  exit 0
npm run lint                           ->  exit 0   (eslint src tests --max-warnings 0)
npm run test:unit                      ->  exit 0   48 files, 700 tests   (679 after Phase A)
npm run build                          ->  exit 0   both new routes listed as (Dynamic)
npm run test:db -- count-history-service.db.test.ts
                                       ->  exit 0   26 tests, 22.9 s
npx playwright test stock-takes-calendar.spec.ts stock-takes-count.spec.ts
        --project=chromium-stock-entry --no-deps
                                       ->  34 passed, 0 failed, 0 flaky   (1.6 m)
        and again, consecutively       ->  34 passed, 0 failed, 0 flaky   (1.6 m)
npx playwright test stock-entry-calendar.spec.ts --project=chromium-stock-entry --no-deps
                                       ->  9 passed    (#7's calendar, unmodified)
npx playwright test role-access.spec.ts sign-in.spec.ts --project=chromium
                                       ->  14 passed   (#3's, unmodified — AC-1)
```

`npm run test:unit` went from 679 to 700 (+21) and the e2e suite from 133 to **167** (+34).
`npm run test:db` is unchanged at 359: the service is byte-identical to the state Phase A's
gate ran against. No shipped test was deleted or skipped; the four that were amended are named
above with the criterion that forces each.

## Notes for the reviewer

**Start with three things.** The `<!-- -->` transcript, because it is the one defect that would
have reached you as an intermittent failure of the feature's headline criterion. M4, because it
shows the field-by-field mapper rule earning its keep in the compiler, which is the opposite of
what Phase A found and completes the picture. And AC-19's badge, because it is a genuine
conflict between two criteria of this spec and it needs a decision rather than a fix.

**The default scope is never spelled into a URL, and the default view is not either.** Every
link this feature renders omits `yard` when the scope is `BOTH` and omits `show` when the view
is `held`. The one exception is deliberate and AC-9 requires it: *Show held only* links to
`?show=held` explicitly, because it is the control that leaves `?show=all`. The second half of
that rule was not free — carrying `show=held` into the two count jumps made `?show=held` and no
`?show` render different bodies, which AC-9 forbids, and the e2e test caught it.

**The detail page has no sign-out control, on purpose.** AC-8 asserts by absence that it holds
no `button` or `form` anywhere; a sign-out is a `POST` and a `POST` needs a form. AC-1 asks for
the control on `/stock-takes`, which has it, and every path off the detail leads back there.

**`emptyDayHref={() => null}` is the whole of AC-5.** A day with no counts renders its number
in a `<div>` and no anchor at all, which is why `/stock-takes` can be scanned for zero
`start-count-day` elements and zero `<a>` in an empty cell. The default, which `/stock-entry`
uses by not passing the prop, is the old `<Link>` verbatim.

**The e2e fixtures derive their numbers.** AC-9 quotes the user's real sheet — 82 lines, 47
held, 35 hidden — and the spec builds `zeros: 5, nulls: 7` against whatever the Dublin sheet
actually holds today (83 lines, so 71 held, 12 hidden) and computes the sentence from that. A
test asserting `82` would be asserting about the user's data, which 007's calendar spec
recorded as the wrong thing to do.

---

# Repair pass

**Trigger:** `progress/review_stock_takes_history.md`, verdict CHANGES_REQUESTED.
**Scope:** B1 (implementer) and the **code half** of B3 (the one-sided badge bound). B2 and the
text half of B3 are the coordinator's and were already closed in
`specs/features/010-stock_takes_history.md` before this pass started.
**Status:** complete.

**Two test files changed. Nothing under `src/` changed** — proved by hash, not asserted:

```
e19d220b70e1f4d060f4184b60cf3132a71c9dd69f6aa5c1f6dd5fc453ebc71b  src/app/stock-takes/page.tsx
d889b37a64f50b7cef3730799974dab144aefbd4d17c96286af6253cb2f3fc14  src/components/stock-entry/CalendarGrid.tsx
```

Both are byte-for-byte the values the reviewer recorded at the end of its own session.

## The two edits

- `tests/e2e/stock-takes-calendar.spec.ts:545` — *"AC-19: the calendar never scrolls sideways at
  390 px or 320 px, in any scope"* now wraps its whole body in
  `for (const role of ["YARD_STAFF", "ADMIN"] as const)`, the same shape the AC-14 test in the
  same file already uses at `:374` (and the AC-1 test at `:119`). `newUser(role)` replaces
  `newUser()`, and every assertion message now names the role first, so a failure says which
  session it was in. 76 insertions / 52 deletions, all of it the loop and the re-indent.
- `tests/e2e/stock-takes-count.spec.ts:574` — the same, for *"AC-19: the record never scrolls
  sideways…"*. `longestDescription("DUBLIN")` is hoisted **above** the role loop rather than being
  re-queried per role, because it is a property of the database and not of the session.
  52 insertions / 46 deletions.
- `tests/e2e/stock-takes-calendar.spec.ts:659` —
  `expect(takes?.height ?? 0).toBeGreaterThanOrEqual(24);` added beside the existing
  `toBeLessThan(44)` at `:648`, with a comment at `:650-658` stating why the bound has to be
  two-sided and naming the reviewer's 29 px -> 8 px mutation that the one-sided form let through.
  This is what 010 AC-19 and its fourth amendment now require.

## B3 — the new lower bound, watched failing and watched passing

Byte copy of `CalendarGrid.tsx` taken first. The mutation is the reviewer's, reproduced verbatim:
`py-0.5` dropped and `h-2 overflow-hidden` added to the badge's `className`, then `npm run build`,
then the one spec.

**Mutated — RED, on the new line and only on the new line:**

```
  1) [chromium-stock-entry] > stock-takes-calendar.spec.ts:613:5 > AC-4, AC-19: the badge is the
     SAME box on both calendars, and is not a 44 px target

    Error: expect(received).toBeGreaterThanOrEqual(expected)

    Expected: >= 24
    Received:    8

    > 659 |   expect(takes?.height ?? 0).toBeGreaterThanOrEqual(24);
  1 failed
```

`Received: 8` is the reviewer's 8 px, to the pixel. **The transcript is also the proof of the
finding itself:** the three assertions above line 659 — the cross-page width equality, the
cross-page height equality and `width >= 40` — all *passed* under the same mutation, which is why
this test previously went green with a badge shrunk to 8 px. Only the line added in this pass
falsified it.

**Restored — hash equal to the pre-mutation copy, rebuilt, GREEN:**

```
d889b37a64f50b7cef3730799974dab144aefbd4d17c96286af6253cb2f3fc14 *src/components/stock-entry/CalendarGrid.tsx
d889b37a64f50b7cef3730799974dab144aefbd4d17c96286af6253cb2f3fc14 *<scratchpad>/pre/CalendarGrid.tsx

  ok 1 [chromium-stock-entry] > stock-takes-calendar.spec.ts:613:5 > AC-4, AC-19: the badge is the
       SAME box on both calendars, and is not a 44 px target (3.9s)
  1 passed
```

## B1 — the ADMIN measurement, and proof it is really taken

Both pages, both roles, both viewports, all three scopes, both views: **green.**

```
  ok 16 stock-takes-calendar.spec.ts:536:5 > AC-19: the calendar never scrolls sideways at 390 px
        or 320 px, in any scope (11.0s)
  ok 17 stock-takes-count.spec.ts:562:5   > AC-19: the record never scrolls sideways at 390 px or
        320 px, in either view (10.9s)
  ...
  34 passed (1.7m)          # both spec files together, after the restore
```

A passing loop proves nothing about whether the second iteration ran, so I forced it. Temporary
probe `expect(role).toBe("YARD_STAFF")` as the first line of each role loop, both files:

```
  x 1 stock-takes-calendar.spec.ts:536:5 > AC-19: … Expected: "YARD_STAFF"  Received: "ADMIN"
  x 2 stock-takes-count.spec.ts:562:5   > AC-19: … Expected: "YARD_STAFF"  Received: "ADMIN"
  2 failed
```

Both reached the administrator pass, and both reached it *after* completing the staff pass — so
the second session's measurements are executed, not skipped. Probe removed; both files restored
and verified:

```
c18abc21b16ccf1d35a74a9a352159154554e08eb28d31d5b6be541c28e7a6ad  tests/e2e/stock-takes-calendar.spec.ts
ba518aaf37319dba1b1517fb2f182d7ccb8cdf54ff1a9b939f1cf1e0bca22a35  tests/e2e/stock-takes-count.spec.ts
```

(`grep -c "NON-VACUITY PROBE" tests src` -> 0.)

## What I found that was not asked for — the identity header CAN overflow, and no test pressures it

The reviewer's argument for B1 is that `src/app/stock-takes/page.tsx:157` renders `{user.email}`
with no `break-words`, that an email is one unbreakable token, and that at 320 px this is the thing
that would push `scrollWidth` past `clientWidth`. I set out to verify that rather than trust it,
and the answer is in two halves.

**The overflow is real.** I temporarily gave the calendar spec's `newUser` a hyphen-free label —
`createTestUser(role, "stocktakescalendarlongunbreakablelocalpartformeasurement")` — and ran the
AC-19 test unchanged:

```
  x 1 stock-takes-calendar.spec.ts:536:5 > AC-19: the calendar never scrolls sideways …
    Error: YARD_STAFF 390 DUBLIN
    expect(received).toBeLessThanOrEqual(expected)
    Expected: <= 390
    Received:    394
```

It fails at **390 px**, before 320 px is even reached. So the header is genuinely unprotected, and
the assertion is genuinely capable of seeing it.

**But the shipped fixture cannot produce such an email, and the reason is not the role.**
`createTestUser` (`tests/e2e/support/users.ts:32`) builds
`${label}-${16 hex}@macroads-e2e.invalid`, and the labels this feature passes —
`stock-takes-calendar`, `stock-takes-count` — are full of hyphens. Browsers take a line break
**after a hyphen**, so the longest unbreakable run in a fixture email is about 25 characters and it
fits at 320 px. That is why the added ADMIN repetition passes, and it would pass just as surely
if the header were wrapped or not.

Three consequences, all for the coordinator rather than for me:

1. **B1 is now satisfied as written** — AC-19's measurements are taken in an administrator's
   session on both pages, at both viewports. Nothing goes red, exactly as the reviewer predicted.
2. **The role was never the variable that mattered.** Both roles' emails are the same length *and*
   the same shape by construction, so the administrator pass can only ever agree with the staff
   pass. What varies in production is the email's **content**, and no test in this suite pressures
   it. The reviewer's diagnosis of the mechanism is right; its choice of lever is one step to the
   side of the defect.
3. **The fix is one line and it is a source change, so I have not made it.** `break-words` (or
   `break-all`) on the `<p data-testid="signed-in-email">` at `src/app/stock-takes/page.tsx:157`,
   plus either a long hyphen-free label in one of the two AC-19 tests or a dedicated case, would
   turn the transcript above from a probe into a shipped guarantee. The brief reserves that ruling;
   `src/` is byte-identical and this is recorded rather than improvised. Related: the same `<p>` is
   the element O1 already flags as sitting outside `stock-takes-body`.

## Verification run in this pass

Targeted only — the coordinator runs `init` and the two full e2e passes.

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 |
| `npx vitest run tests/unit/stock-takes-contract.test.ts tests/unit/stock-entry-contract.test.ts` | 56 passed (no scan tripped by the new comments) |
| `npm run build` | exit 0, three times (baseline, mutated, restored) |
| `npx playwright test tests/e2e/stock-takes-calendar.spec.ts --project=chromium-stock-entry --no-deps` | 17 passed |
| `npx playwright test tests/e2e/stock-takes-count.spec.ts --project=chromium-stock-entry --no-deps` | 17 passed |
| both specs together, after every restore | **34 passed** |

Tree and database left as found: `git status --porcelain` is the reviewer's set with no probe file
and no `.bak`; `find src/app -name "loading.ts*"` -> only `src/app/(public)/loading.tsx`;
`test-results/` removed; `Samples/` untouched; and after all runs, `StockCount` rows with
`periodYear >= 2090` -> **0**, users at `macroads-e2e.invalid` -> **0**, probe-labelled users ->
**0**.

## Not done, deliberately

- No source file touched, including the `break-words` above.
- `init` not run, full `npm run test:e2e` not run — the coordinator's, per the brief.
- `specs/features/010-stock_takes_history.md` and `feature_list.json` not edited; both were already
  amended, and AC-19's "at least 24" text now matches the shipped assertion.

---

# Repair pass 2

**Ruling implemented:** the identity-header overflow the first repair pass found and left to the
coordinator. Two files, landed in the order that makes the fix a guarantee rather than a
decoration: the **test first, watched RED against the unfixed source**, then the one-line source
change, watched GREEN.

## What changed

| File | Change |
|---|---|
| `tests/e2e/stock-takes-calendar.spec.ts` | AC-19's calendar measurement signs its **`YARD_STAFF`** session in with a 61-character hyphen-free, dot-free local part; `newUser` gained an optional `label`; a guard asserts the constant still matches `/^[a-z0-9]{56,}$/`. |
| `src/app/stock-takes/page.tsx:158` | `className="text-sm text-slate-600"` -> `className="text-sm break-words text-slate-600"` on `<p data-testid="signed-in-email">`. Nothing else in the file moved. |

`data-testid`, element type and text are untouched, so the four shipped assertions on that test id
(`tests/e2e/sign-in.spec.ts:77`, `tests/e2e/stock-entry-access.spec.ts:152`,
`tests/e2e/support/users.ts:75` inside `signIn`, and this file's own AC-1) pass unmodified — the
last two ran 17 times in the green run below, against the 61-character email.

**Which session carries the long email, and why that one.** The `YARD_STAFF` pass, which is the
loop's first iteration: it costs no extra context, no extra user and no extra navigation — the
cheapest possible wall clock, since it reuses a session the test already creates — and an overflow
regression now aborts the test at its *first* measurement instead of after a complete second
session. The `ADMIN` pass keeps an ordinary hyphenated email, which leaves the reviewer's B1
repetition intact *and* turns it into a plain-email control: if one pass fails and the other does
not, the email's **content** is named as the cause rather than the role.

## Hashes at every step

| Step | `src/app/stock-takes/page.tsx` | `tests/e2e/stock-takes-calendar.spec.ts` | `src/app/stock-entry/page.tsx` |
|---|---|---|---|
| Baseline (byte copies taken) | `e19d220b…3ebc71b` | `c18abc21…8e7a6ad` | `36f5940b…c7c95f4de` |
| Test change, 45-char label | `e19d220b…3ebc71b` *(unchanged)* | `d80b8a88…11e5c94e` | `36f5940b…c7c95f4de` |
| Test change, 61-char label — **the RED state** | `e19d220b…3ebc71b` *(unchanged)* | `53b7117c…771cb91` | `36f5940b…c7c95f4de` |
| Temporary `/stock-entry` probe, then restored | `e19d220b…3ebc71b` | back to `53b7117c…771cb91` | `36f5940b…c7c95f4de` |
| Source fix — **the GREEN state** | `ff488513…d7b0ae92` | `53b7117c…771cb91` | `36f5940b…c7c95f4de` |

`src/app/stock-entry/page.tsx` holds the same hash at every step, including now: **AC-22's byte pin
is intact and I never opened it for writing**, not even to measure it.

Full final values:

```
ff4885130d559228cdda802ae91ebe418d7d1d98d88592e34c1a9aa7d3b0ae92  src/app/stock-takes/page.tsx
53b7117c8123076212267d45d39a4ad00890ef4252fe16ff8dcb2339a771cb91  tests/e2e/stock-takes-calendar.spec.ts
36f5940b1e944b15a66257060a0fab54cec75deda7edf096ec90e2cf7c95f4de  src/app/stock-entry/page.tsx
```

## The first label was too short, and the test went GREEN before the fix

This is the outcome the brief told me to stop on, so it is reported rather than quietly corrected.

**Attempt 1 — a 45-character label** (`stocktakescalendarunbreakablelocalpartforac19`, comfortably
over AC-19's floor of 40). Against the **unfixed** `page.tsx`:

```
  ok 1 [chromium-stock-entry] > stock-takes-calendar.spec.ts:557:5 > AC-19: the calendar never
       scrolls sideways at 390 px or 320 px, in any scope (14.6s)
  1 passed (24.2s)
```

I stopped there rather than touch the source. The brief names two possible causes — the label is
not long enough, or it is being broken somewhere unexpected — and the arithmetic says the first,
unambiguously. The header is `text-sm` (14 px) inside `p-3`; the first repair pass measured a
56-character run at `scrollWidth 394` against a 390 px viewport, which is **~6.6 px per
character**. 45 characters is ~297 px, and a 320 px viewport leaves 296 px inside the padding — the
45-character run sat about one pixel inside the threshold at the narrower viewport, and 69 px
inside it at 390 px. Nothing was breaking the token; the token was simply not wide enough.

So **AC-19's floor of 40 characters is satisfiable by a run that cannot fail.** That is worth the
spec's attention, and it is why the guard in the test is set at the **measured** floor of 56 rather
than at the criterion's 40, with the arithmetic written above it in the file.

**Attempt 2 — 61 characters**: `stocktakescalendarunbreakableemaillocalpartthatmustwrapatac19`.

## RED — the test alone, against the unfixed `page.tsx` (`e19d220b…`)

`npm run typecheck` 0, `npm run lint` 0, `npm run build` 0 first, because
`playwright.config.ts` serves a **build** (`npm run start`, `reuseExistingServer: false`) — so the
server under test really was the unfixed source.

```
$ npx playwright test tests/e2e/stock-takes-calendar.spec.ts --project=chromium-stock-entry \
    --no-deps -g "AC-19: the calendar never scrolls sideways"
Running 1 test using 1 worker

    Error: YARD_STAFF 390 DUBLIN

    expect(received).toBeLessThanOrEqual(expected)

    Expected: <= 390
    Received:    424

      605 |           clientWidth: document.documentElement.clientWidth,
      606 |         }));
    > 607 |         expect(overflow.scrollWidth, `${role} ${String(width)} ${yard}`).toBeLessThanOrEqual(
          |                                                                          ^
      608 |           overflow.clientWidth,
      609 |         );
        at tests\e2e\stock-takes-calendar.spec.ts:607:74

  1 failed
    [chromium-stock-entry] > tests\e2e\stock-takes-calendar.spec.ts:564:5 > AC-19: the calendar
    never scrolls sideways at 390 px or 320 px, in any scope
```

**424 against 390 — 34 px of sideways scroll, at the wider of the two viewports**, in the very
first measurement the test takes. That is the defect, shipping, caught by a shipped assertion.

## GREEN — after `break-words`, with nothing else changed

`npm run typecheck` 0, `npm run lint` 0, `npm run build` 0, then the **whole** spec file rather
than the one test, because the source change is on the page all 17 of them load:

```
$ npx playwright test tests/e2e/stock-takes-calendar.spec.ts --project=chromium-stock-entry --no-deps
Running 17 tests using 1 worker
  ok  1 ... AC-1: a signed-out GET is a 307 to sign-in carrying the path, and sends no content (468ms)
  ok  2 ... AC-1: both roles get 200, the heading, the email and a way out (5.7s)
  ok  3 ... AC-4: the two calendars render the SAME badges for the same month (2.4s)
  ok  4 ... AC-5: what each calendar owns, asserted by absence (1.8s)
  ok  5 ... AC-6: three scope links, labelled and tallied for the displayed month (2.8s)
  ok  6 ... AC-6: what Both means on a day only one yard was counted (2.8s)
  ok  7 ... AC-6, AC-17: an unreadable ?yard is a 307 and no error (3.0s)
  ok  8 ... AC-11: Previous count skips the months nobody counted at that yard (2.2s)
  ok  9 ... AC-11: with no neighbour the control still renders, disabled and not an anchor (1.6s)
  ok 10 ... AC-12, AC-13: the calendar body is byte-identical between the two roles, and has no euro (5.9s)
  ok 11 ... AC-14: nothing the client sets changes what either session is sent (5.9s)
  ok 12 ... AC-16: every link on a scoped calendar carries the scope, and the default is never spelled (1.9s)
  ok 13 ... AC-17: no query parameter combination returns a 500 or a database string (4.6s)
  ok 14 ... AC-3: reading the calendar writes nothing (2.5s)
  ok 15 ... AC-18: with the bundle disabled, every control on the calendar still navigates (2.8s)
  ok 16 ... AC-19: the calendar never scrolls sideways at 390 px or 320 px, in any scope (10.8s)
  ok 17 ... AC-4, AC-19: the badge is the SAME box on both calendars, and is not a 44 px target (2.1s)

  17 passed (1.2m)
```

Test 16 is the one that was red 34 px ago. Tests 2, 10 and 12 prove the change disturbed neither
the header's text, nor the byte-identical body, nor the links — and every one of the 17 signs in
through `signIn`, which asserts `toHaveText(user.email)` on that same `<p>`.

## Which utility class, and why

**`break-words`** (`overflow-wrap: break-word`), not `break-all`.

`break-words` breaks a word **only when it cannot fit on a line by itself**, which is exactly the
condition here, and leaves every ordinary address — the hyphenated fixture ones and every real
Macroads one — breaking at its natural opportunities. `break-all` breaks *any* word at *any*
character, so a short address would wrap mid-word for no reason.

The brief allowed `break-all` as a fallback if `break-words` did not hold at 320 px. **It holds.**
The green run measures 320 px as well as 390 px, under all three scopes, and the probe below shows
the unwrapped page reports `424` at *both* widths — so 320 px passing is the text wrapping, not a
measurement artefact of the narrower viewport.

## `/stock-entry` with the same email — the 008 AC-30 debt, now with a number

Measured with a **temporary probe inside the test file, run once and restored**. The restored file
hashes back to `53b7117c…771cb91`, the exact RED-state bytes, and `grep -c PROBE` is 0. The probe
only read `document.documentElement`; `src/app/stock-entry/page.tsx` was never opened for writing.

```
PROBE /stock-entry 390 scrollWidth=424 clientWidth=390
PROBE /stock-takes 390 scrollWidth=424 clientWidth=390
PROBE /stock-entry 320 scrollWidth=424 clientWidth=320
PROBE /stock-takes 320 scrollWidth=424 clientWidth=320
```

**Yes, `/stock-entry` overflows, and by exactly as much: 34 px at 390 px and 104 px at 320 px.**
The number is identical to `/stock-takes`'s, to the pixel, at both viewports — the strongest
available evidence that it is the same defect in the same element rather than a coincidence, since
the document's width is set by the unbroken email token plus the shared `p-3` and so does not
depend on what else the page draws. `/stock-entry` is left alone per AC-22 and per the fifth
amendment; the session that pays the debt inherits `424 / 390` and `424 / 320` rather than a
suspicion, and the fix is the identical twelve characters at `src/app/stock-entry/page.tsx:83`.

## Also found — a third instance nobody has recorded

`src/app/analysis/page.tsx:21` carries the same shape at a larger size:
`<p data-testid="signed-in-email" className="text-base text-slate-700">`. **Not touched** — it is
outside this feature's two pages and outside `/stock-entry`'s debt — but `text-base` is wider than
`text-sm`, so it overflows *sooner* than either of the two measured above, and no criterion
anywhere measures that route on a phone. Worth filing beside the 008 AC-30 debt.

`/stock-takes/counts/<id>` does **not** render the identity header at all — `grep -rn
signed-in-email src/` returns exactly four hits: analysis, stock-entry, stock-takes and one
comment — so AC-19's second page needed no change and got none.

## Verification run in this pass

Targeted only. `init` and the full `npm run test:e2e` are the coordinator's; neither was run.

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 (twice: test-only state, and final) |
| `npm run lint` | exit 0 (twice) |
| `npm run build` | exit 0 (twice: the RED build and the GREEN build) |
| the one AC-19 test, 45-char label, unfixed source | **1 passed** — reported above, not shipped |
| the one AC-19 test, 61-char label, unfixed source | **1 failed**, `424 > 390` |
| `npx playwright test tests/e2e/stock-takes-calendar.spec.ts --project=chromium-stock-entry --no-deps` | **17 passed**, after the fix |
| `npx vitest run tests/unit/stock-takes-contract.test.ts tests/unit/stock-entry-contract.test.ts tests/unit/project-contract.test.ts` | **69 passed** — no source scan trips on `break-words` |

`tests/e2e/stock-takes-count.spec.ts` was not re-run: it reads neither file this pass touches, and
the source change is on a page it never loads.

Tree and database left as found: `git status --porcelain` is the same set as before this pass, with
no probe file, no `.bak` and no `test-results/`; `find src/app -name "loading.ts*"` → only
`src/app/(public)/loading.tsx`; `Samples/` untouched; and after every run, users at
`macroads-e2e.invalid` → **0**, users carrying the long probe label → **0**, `StockCount` rows with
`periodYear >= 2090` → **0**.

## Not done, deliberately

- `src/app/stock-entry/page.tsx` and `src/app/analysis/page.tsx` not changed, though both carry the
  same defect and the first is now measured.
- `specs/features/010-stock_takes_history.md` and `feature_list.json` not edited; both were already
  amended and mirrored. **One thing for the coordinator to weigh:** AC-19 says "at least 40
  characters", and this pass proved a 40-to-45-character run passes against the *broken* page. The
  shipped test guards at 56 and carries the arithmetic in a comment, so the criterion is
  over-satisfied rather than contradicted — but the number in the spec is not the number with teeth.
- `init` not run, full `npm run test:e2e` not run.

---

# Repair pass 3 — AC-22's expiring assertions

**Ruling:** `specs/features/010-stock_takes_history.md`, seventh post-approval amendment,
*"Two of AC-22's assertions expired at the commit, 2026-09-14"*.
**General rule now in:** `docs/conventions.md` -> Tests.
**Status:** complete. **Files changed: one** — `tests/unit/stock-takes-contract.test.ts`.
Nothing under `src/`, no spec edit, no `feature_list.json` edit, nothing belonging to #11.
Nothing committed.

## The defect, restated in one line

Both assertions read the **working tree** and required #10's changes to be uncommitted, so
they passed only while #10 was being written and went red at `b468f60 feat(#10)` —
`expected [] to deeply equal [ "src/components/stock-entry/CalendarGrid.tsx" ]`.

## The rewrite

A named constant now carries the base SHA, with the reasoning attached so the next reader does
not tidy it back. It sits immediately above `describe("AC-22: the one shipped source file this
feature edits")`:

```ts
/**
 * `ee448cb` is `spec(#10): approve stock_takes_history` - the commit this feature was built
 * on, and the base of the two assertions below.
 *
 * THE RANGE IS FIXED ON PURPOSE. Both assertions make a PRESENCE claim: "exactly one file in
 * #7's trees changed", "playwright.config.ts changed by exactly four lines". Read against the
 * WORKING TREE (`git status --porcelain`, a bare `git diff`) a presence claim passes only
 * during the session that writes it and then fails forever - these two went red the moment
 * `b468f60 feat(#10)` was committed, in a feature nobody was working on. Read against
 * `ee448cb..HEAD` the same claim is true before that commit and after it, and it survives
 * #11, #12 and #16 landing on top.
 *
 * Do not "tidy" this back to the working tree, and do not move the base forward: a later base
 * would stop the range from containing #10's own edit, and the claim would silently empty out
 * into a comparison of nothing against nothing. See 010's seventh post-approval amendment and
 * `docs/conventions.md` -> Tests.
 */
const SPEC_APPROVAL_COMMIT = "ee448cb";
```

### 1. *"AC-22: CalendarGrid.tsx is the only changed file in #7's trees"*

| | before | after |
|---|---|---|
| subject | `git status --porcelain -- <10 paths>` | `git diff --name-only ${SPEC_APPROVAL_COMMIT}..HEAD -- <the same 10 paths>` |
| parse | `line.slice(3).trim()` (strips the porcelain status column) | `line.trim()` (`--name-only` prints bare paths) |
| assertion | `expect(files).toEqual([GRID])` | **unchanged** |

The ten watched paths are unchanged and in the same order: `src/app/stock-entry`,
`src/components/stock-entry`, `src/lib/count-messages.ts`, `count-service.ts`,
`count-entry-service.ts`, `count-lifecycle-service.ts`, `count-summary-service.ts`,
`src/lib/auth-config.ts`, `src/middleware.ts`. The equality is still an equality against a
one-element list, so every other file in both trees is still required to be identical. Nothing
was loosened; the `.slice(3)` removal is forced by the output format, not a relaxation (a
`--name-only` path passed through `.slice(3)` would have silently truncated `src/app/…` to
`/app/…` and the equality would have been red for the wrong reason).

### 2. *"AC-21, AC-22: playwright.config.ts changed by exactly its two route patterns"*

| | before | after |
|---|---|---|
| subject | `git diff --unified=0 -- playwright.config.ts` | `git diff --unified=0 ${SPEC_APPROVAL_COMMIT}..HEAD -- playwright.config.ts` |
| everything else | — | **unchanged** |

Still `expect(changedLines).toHaveLength(4)`, still every line matched against
`/test(Ignore|Match): ...stock-entry/` (the literal regex in the file is untouched), and still
all seven `toContain` pins: `retries: 0`, `workers: 3`, `fullyParallel: false`,
`timeout: 45_000`, `expect: { timeout: 10_000 }`, `dependencies: ["chromium"]`,
`command: "npm run start"`. The four lines the range yields are the same four: two
`testIgnore` / `testMatch` deletions and their two replacements.

## Mutation transcripts

Both probes had to be **commits**, not working-tree edits: a commit-range assertion does not
watch the working tree, which is the entire point of the repair. Each probe was committed on a
**detached HEAD** so `main` never moved; both probe commits were then abandoned (reachable only
from the reflog). `main` is `c9b980c` before and after, no branch or tag was created, and
nothing is staged.

### Probe 0 — the control, and it is worth recording

Appended `// MUTATION PROBE - working tree only, to be removed` to
`src/components/stock-entry/CountSheet.tsx`, left it **uncommitted**, re-ran:

```
git status --porcelain -- src/components/stock-entry
 M src/components/stock-entry/CountSheet.tsx

 ✓ tests/unit/stock-takes-contract.test.ts (29 tests) 1487ms
 Test Files  1 passed (1)
      Tests  29 passed (29)
```

Green, correctly: the assertion's subject is now the commit range, not the tree. This is the
coverage the amendment knowingly traded away — see *Notes for the reviewer*.

### Probe 1 — a second file in #7's trees, committed (proves assertion 1 can still fail)

Same one-line comment, `git add` + commit on detached HEAD `8053490`:

```
HEAD now: 8053490 (detached; main still c9b980c)

 × AC-22: the one shipped source file this feature edits > AC-22: CalendarGrid.tsx is the only changed file in #7's trees 80ms
   → expected [ …(2) ] to deeply equal [ Array(1) ]

 FAIL tests/unit/stock-takes-contract.test.ts > AC-22: the one shipped source file this feature edits > AC-22: CalendarGrid.tsx is the only changed file in #7's trees
AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]

- Expected
+ Received

  [
    "src/components/stock-entry/CalendarGrid.tsx",
+   "src/components/stock-entry/CountSheet.tsx",
  ]

 ❯ tests/unit/stock-takes-contract.test.ts:555:19

 Test Files  1 failed (1)
```

Red, naming the offending file, exactly as before the repair. The other 28 tests stayed green.

**Restore.** `git checkout main` re-materialised the file with **CRLF** (`core.autocrlf=true`,
`.gitattributes` `* text=auto`), which is *not* the byte state it was found in:

```
sha256  9b7362a6e086949ecb87876fb93e8787f936daa67c0547e38aadab09a8182ad1  (after checkout - WRONG)
sha256  374479542df0d883c40c1cc6ae1b7ca8c1e06730aac51f8842b2f236b4624999  (scratchpad byte copy)
```

The byte copy was therefore copied back and re-verified:

```
374479542df0d883c40c1cc6ae1b7ca8c1e06730aac51f8842b2f236b4624999 *src/components/stock-entry/CountSheet.tsx
374479542df0d883c40c1cc6ae1b7ca8c1e06730aac51f8842b2f236b4624999 */…/scratchpad/CountSheet.tsx.copy
```

Identical to the pre-probe file. One extra step was needed: after the CRLF round trip the
index's stat cache stayed dirty, so `git status --porcelain` reported ` M CountSheet.tsx` while
`git diff` reported no change at all — and twelve assertions in this repository depend on that
porcelain being empty. `git update-index --really-refresh` did not clear it; `git add -- <file>`
did, and it staged nothing, because the blob the file converts to *is* HEAD's blob:

```
git diff --cached --name-only   ->  (empty: index identical to HEAD)
git status --porcelain -- src/components/stock-entry playwright.config.ts   ->  (empty)
```

Re-ran: `Test Files 1 passed (1) / Tests 29 passed (29)`.

### Probe 2 — one more changed line in playwright.config.ts (proves assertion 2 can still fail)

Rewrote one **comment** line (line 5, unpinned and not a route pattern) so the range carries one
deletion and one addition more than the two route patterns. Committed on detached HEAD
`fc75db1`:

```
HEAD=fc75db1 main=c9b980c
git diff --unified=0 ee448cb..HEAD -- playwright.config.ts | grep -cE '^[+-][^+-]'  ->  6

 FAIL tests/unit/stock-takes-contract.test.ts > AC-22: the one shipped source file this feature edits > AC-21, AC-22: playwright.config.ts changed by exactly its two route patterns
AssertionError: expected [ …(6) ] to have a length of 4 but got 6

- Expected
+ Received

- 4
+ 6

 ❯ tests/unit/stock-takes-contract.test.ts:570:26
```

Red on the line count, as required.

**Restore.** `git checkout main` returned this file byte-identical on its own (no CRLF drift),
confirmed against the copy before anything else was done:

```
3ad1305525e533aabb7798b4431d910c94d8589e8dfd1d511b143ef6de57a4fc *playwright.config.ts
3ad1305525e533aabb7798b4431d910c94d8589e8dfd1d511b143ef6de57a4fc */…/scratchpad/playwright.config.ts.copy
```

`git diff --cached --name-only` empty, `git status --porcelain -- playwright.config.ts` empty.

## The audit — verified independently, and the amendment's split is off by one

Counted across the whole of `tests/`:

**Fourteen `git status --porcelain` call sites in five files** — the amendment's count is
right:

| file | lines | direction |
|---|---|---|
| `tests/unit/analysis-contract.test.ts` | 279 | absence — `.toBe("")` |
| `tests/unit/count-entry-contract.test.ts` | 173, 264, 272, 284 | absence — `.toBe("")` ×4 |
| `tests/unit/schema-and-migration.test.ts` | 353 | absence — `.toBe("")` |
| `tests/unit/stock-entry-contract.test.ts` | 143, 154, 665, 674 | absence — `.toBe("")` ×4 |
| `tests/unit/stock-takes-contract.test.ts` | 103, 227, 343 | absence — `.toBe("")` ×3 |
| `tests/unit/stock-takes-contract.test.ts` | 513 (was) | **presence** — repaired here |

That is **thirteen absence and one presence**, not twelve and two. The amendment's
"twelve … only these two" folds the `git diff --unified=0` line-count site — `stock-takes`
line 537, which is not a `--porcelain` call at all — into the porcelain tally. The conclusion
is unaffected: **exactly two expiring assertions existed, and both are the ones repaired
here.** Only the arithmetic inside the sentence is wrong. Flagged rather than corrected,
because the spec is not mine to edit.

**Every other assertion in `tests/` whose subject is git:**

- `git diff`: **one** call site in the whole of `tests/` (the one repaired here). No other test
  counts diff lines.
- `git ls-files --cached --others --exclude-standard`: seven call sites —
  `stock-takes-contract.test.ts:22`, `entry-submit-contract.test.ts:27`,
  `hashing-boundary.test.ts:31`, `no-default-password.test.ts:26`,
  `project-contract.test.ts:145`, `repo-hygiene.test.ts:64`, plus `analysis-contract.test.ts`'s
  `shippingModulesUnder`. These enumerate *which files exist and what is in them*. They do not
  read change state at all, they are unaffected by any commit, and they are durable.
- `git check-ignore .env` / `git ls-files .env` (`repo-hygiene.test.ts:95-96`): durable.
- `tests/e2e/` and `tests/support/`: **no** git invocation of any kind.

**So: beyond these two, there is no assertion anywhere in `tests/` whose subject is the working
tree in the expiring direction.** Stated explicitly, as asked. None of the above was changed.

## Verification output

Targeted, per the brief — `init`, `test:e2e` and `test:db` deliberately not run; the
coordinator runs the gate.

```
$ npx vitest run tests/unit/stock-takes-contract.test.ts
 ✓ tests/unit/stock-takes-contract.test.ts (29 tests) 1411ms
 Test Files  1 passed (1)
      Tests  29 passed (29)

$ npm run typecheck        # tsc --noEmit
(no output, exit 0)

$ npm run lint             # eslint src tests --max-warnings 0
(no output, exit 0)

$ npm run test:unit        # vitest run - the suite that was red
 Test Files  54 passed (54)
      Tests  808 passed (808)
   Duration  14.83s
```

`npm run test:unit` was red with 2 failures at the start of this pass and is now **808 passed,
0 failed**. Both previously failing tests are the two repaired here.

## Deviations from the spec

None. The spelling is the amendment's, verbatim: `git diff --name-only ee448cb..HEAD -- <paths>`
and `git diff --unified=0 ee448cb..HEAD -- playwright.config.ts`.

## Notes for the reviewer

1. **The trade the amendment made, stated plainly.** A commit-range assertion cannot see an
   uncommitted edit. Probe 0 above is the demonstration: a second file modified in #7's trees
   but not committed leaves the assertion green. AC-22 is therefore now a claim about the
   repository's **history**, not about the reviewer's checkout. That is what the ruling chose
   and it is the right choice — a presence claim about the working tree is false the day after
   it is written — but it is a real reduction and should be visible rather than discovered.
2. **The range is open at the top, and that has a maturity date.** `ee448cb..HEAD` grows with
   every future commit, so the first legitimate edit any later feature makes to
   `count-service.ts`, `src/middleware.ts`, `auth-config.ts` or anything else on the ten-path
   list will turn *#10's* assertion red — the same "red in a feature nobody is working on"
   failure mode, one step further out. Closing both ends (`ee448cb..b468f60`) would pin it
   permanently. I did **not** do that: the amendment specifies `..HEAD`, and "the spec is the
   contract". It is worth an eighth amendment before #12 touches those files.
3. **A CRLF trap that cost me a restore, and that will catch the next agent.** With
   `core.autocrlf=true` and `.gitattributes` `* text=auto`, `git checkout` materialises these
   `.tsx` files with CRLF, while the working copies in this tree are LF. A file restored by
   `git checkout` is therefore **not** byte-equal to the one you copied, and `git status` will
   then disagree with `git diff` about whether it changed — status says ` M`, diff says nothing,
   and `git update-index --really-refresh` does not settle it. Restoring the byte copy and then
   running `git add -- <file>` (which stages nothing, since the converted blob equals HEAD's)
   is what clears it. Any future mutation probe in this repository should restore from a byte
   copy, not from `git checkout`, and should re-check `git status --porcelain` afterwards —
   twelve assertions here depend on it being empty.
4. **Test file line numbers moved.** The two assertions now start at lines 528 and 559 (from 503
   and 536); the 19-line constant block above the `describe` is the shift. Any external
   reference to the old line numbers is stale.
5. `docs/conventions.md` -> Tests and the seventh amendment already carry the general rule, so
   nothing further was written there. Both were read before editing and neither was modified.

---

# Repair pass 4 — three flaky assertions

**Brief:** repair the three assertions blocking #11's gate. Diagnosis given, not re-derived:
010's **eighth** post-approval amendment (the two byte-identity comparisons) and **ninth**
(AC-17's bare number). No `src/` change of any kind; specs, `feature_list.json` and
`Samples/` untouched. `init` and the full suites left to the coordinator.

## What changed

| File | Change |
|---|---|
| `tests/e2e/support/stock-takes.ts` | **new** `FOREIGN_NEIGHBOUR`, `maskForeignNeighbours()`, `jumpTargets()` (lines 168-236). `bodyOf` is unchanged. |
| `tests/e2e/stock-takes-count.spec.ts` | `ownCounts()` / `ownNeighboursOf()` (136-163); AC-9 (307-329); AC-12/AC-13 (421-459). |
| `tests/e2e/stock-entry-quantities.spec.ts` | `applicationMarkup()` / `priceSightings()` (546-599); AC-17 (602-659). |

Working-tree diff: `tests/e2e` +263 / -7 over four files — the fourth,
`tests/e2e/support/stock-entry.ts`, was already modified when this session opened and is
**not mine**.

## Repair 1 and 2 — AC-9 and AC-13 keep byte identity

### The approach, and why this one

The amendment offered two shapes. **"A count whose neighbours cannot move" is not available
here**, and that is worth recording rather than asserting: pinning the draft's *Previous
count* means seeding a Dublin count inside year 2102 dated before 31 January, and
`@@unique([locationId, periodYear, periodMonth])` (`prisma/schema.prisma:210`) refuses a
second Dublin row for period 2102-01. The only way past it is a count whose **period month
and count date name different months** — a fixture that lies about the domain in order to
make a test pass, in a file whose whole subject is what a count date means. So:
**normalisation**, cut as narrow as it will go.

`maskForeignNeighbours(body, ownCountIds)` replaces `/stock-takes/counts/<id>` **only when
`<id>` is not one of the four counts this file created**. Consequences:

- the two globally-derived values — the draft's *previous* (the whole yard's previous count,
  chosen across every year) and the approved count's *next* — stop being compared;
- **every other count id in the body is still compared byte for byte**, including
  `show-all-items`, `open-in-stock-entry` and the three neighbour links this file owns;
- the query each jump carries, the element, its attributes and every other byte are
  untouched.

What the mask stops comparing, the test now **asserts directly**, which is the amendment's
stated condition: `jumpTargets()` reads both jumps from the page, AC-9 asserts the draft's
*Next count* is February's count in **both** readings, and AC-13 asserts, **for both roles**,
draft to next = submitted, submitted to previous = draft, submitted to next = approved,
approved to previous = submitted. Those four are pinned by this file's own fixture: no other
spec writes into 2102, so nothing can be dated between two of them. The draft's *previous*
and the approved count's *next* are asserted nowhere, because there is nothing true to
assert about them.

**Kept, unchanged, as instructed:** `expect(adminBody.length, url).toBe(staffBody.length)` on
the **raw** bodies, so a role difference that changes length is caught before any masking —
and both hydration-separator guards.

### Proof the mask is load-bearing — the flake caught live, and absorbed

An instrumented paired run (probe added, run, removed, restore hash verified below) printed
the two *Previous count* neighbours of the **same** URL as fetched by the two sessions:

```
PROBE AC-9  previous=cmu1l0xka009jjzyom7ktykrv masked=true
PROBE AC-13 /stock-takes/counts/cmu1l0gyl0003jzok6n8fqdr9
  staffPrev=cmu1l15nx00ecjzyosau9gjxh adminPrev=cmu1l1a3e00gpjzyomr9909za
  staffNext=cmu1l0hln002hjzok2ocs32ks adminNext=cmu1l0hln002hjzok2ocs32ks masked=true
PROBE AC-13 /stock-takes/counts/cmu1l0hln002hjzok2ocs32ks
  staffPrev=cmu1l0gyl0003jzok6n8fqdr9 adminPrev=cmu1l0gyl0003jzok6n8fqdr9
  staffNext=cmu1l0jbr004tjzoksjgfilxh adminNext=cmu1l0jbr004tjzoksjgfilxh masked=false
  29 passed (1.5m)
```

The second line **is the reported failure, reproducing**: two different neighbours, seconds
apart, in a run that now passes. The third shows the owned neighbours identical and **not**
masked — the mask fires exactly where the value is another spec's, and nowhere else.

### Red direction — still fails when the guarantee is broken

Two mutation sets, each applied to a byte copy of the repaired file and each reverted from it
with a hash check.

**Set A — a real mode difference (AC-9) and a real role difference (AC-13).** AC-9's second
read changed to `?show=all`; AC-13's admin body given one element the staff body has not.

```
x 1 stock-takes-count.spec.ts:307 > AC-9: ?show=held renders identically to no ?show at all
    Error: expect(received).toBe(expected)
      > 330 |   expect(maskForeignNeighbours(withHeld, ownCounts())).toBe(
x 2 stock-takes-count.spec.ts:404 > AC-12, AC-13: ... one body and no euro
    Error: /stock-takes/counts/cmu1kpt1l0003jzygzew8rmh1
      Expected: 32470   Received: 32516
      > 437 |       expect(adminBody.length, url).toBe(staffBody.length);
  2 failed
```

**Set B — a role/mode difference that is exactly cuid-shaped**, so the length assertion
cannot see it: one **owned** count id swapped for another owned one in one of the two bodies.
This is the mutation that proves the mask is not over-broad.

```
x 1 stock-takes-count.spec.ts:307 > AC-9: ?show=held renders identically to no ?show at all
    Error: expect(received).toBe(expected) // Object.is equality
      > 330 |   expect(maskForeignNeighbours(withHeld, ownCounts())).toBe(
x 2 stock-takes-count.spec.ts:407 > AC-12, AC-13: ... one body and no euro
    Error: expect(received).toBe(expected) // Object.is equality
      > 463 |       expect(maskForeignNeighbours(adminBody, ownCounts()), url).toBe(
  2 failed
```

Both reached the **equality** — the length assertion passed, as it must when a cuid is
swapped for a cuid — and both failed on it. A jump pointing at a different one of this file's
own counts for one role is still a failure.

## Repair 3 — AC-17 still asserts that no price reaches a staff session

The old assertion compared a bare number against the whole HTML. It is replaced by **two**
checks, both narrower and both stronger than "does this string appear anywhere":

1. `priceSightings(applicationMarkup(staffBody), aRealPrice)` — the price as **a number of
   its own** (nothing alphanumeric and no decimal point either side of it) in the markup the
   application itself produced. `applicationMarkup` removes `script`, `style`, the server
   action fields, `/_next/` URLs and `class`/`id` values — every one of them a place where
   the framework writes a hash, an id or a chunk number, which is exactly the list the ninth
   amendment says a bare containment test cannot tell from a price. `data-*` attributes and
   form values are **not** removed: "not hidden — not sent".
2. `priceSightings(readable, aRealPrice)` on the **rendered text** of the hydrated page
   (`textContent`, scripts and styles removed) — what a yard hand can actually read.

The serialised payload keeps being checked by **name** rather than by value — the euro sign,
the column name, the *no price* sentence and the money-key walk all still read the whole,
unfiltered response — because that payload legitimately contains bare numbers (`[890,` and
`"890"` are both shapes the bundler emits there), and a bare-number test inside it can only
ever be luck.

Three **permanent** non-vacuity assertions now sit in the test: the search finds a price in a
cell (`toHaveLength(1)`); it does **not** fire on the exact bytes that made this flaky, the
32-character action-key hash from the amendment; and it does not fire on that same hash
sitting in plain text either, so the **boundary** and not only the removal is doing work. Two
further guards say the filter has not quietly emptied the document: the response really does
contain a server action field, and the filtered markup really does still contain
`count-line`.

### Red direction

**C1 — a real price in the staff response**, injected as a cell before the check:

```
x 1 stock-entry-quantities.spec.ts:602 > AC-17: a YARD_STAFF session can obtain no price ...
    Error: staff response
    + Array [
    +   "/main><!--$--><!--/$-->        <td data-testid=\"line-value\">890</td></body></html>",
    + ]
      > 621 |     expect(priceSightings(applicationMarkup(staffBody), aRealPrice), "staff response")
```

**C2 — a real price a person can read**, injected into the live DOM before the text check:

```
x 1 stock-entry-quantities.spec.ts:602 > AC-17: a YARD_STAFF session can obtain no price ...
    Error: rendered text
    + Array [
    +   "e heldSave nowBack to the calendarReview and signUnit price 890 per tonne",
    + ]
      > 661 |     expect(priceSightings(readable, aRealPrice), "rendered text").toEqual([]);
```

Both name the leak and print its sixty characters of context. C1 also confirms the price the
fixture currently picks really is the three-digit one from the ninth amendment.

## Green direction — the pair, three consecutive times

`stock-takes-count.spec.ts` **with** `stock-entry-quantities.spec.ts` in one invocation is
how the flake reproduces, so that is what was run, against the existing build, three times in
a row with nothing changed in between:

```
node node_modules/@playwright/test/cli.js test tests/e2e/stock-takes-count.spec.ts \
  tests/e2e/stock-entry-quantities.spec.ts --project=chromium-stock-entry --no-deps

run 1 exit=0   29 passed (1.6m)
run 2 exit=0   29 passed (2.0m)
run 3 exit=0   29 passed (1.8m)
```

Plus a fourth immediately after the repair (`29 passed (1.6m)`, exit 0) and the instrumented
fifth quoted above (`29 passed (1.5m)`, exit 0). Five green paired runs, no flake, no retry —
`retries: 0` throughout, no timeout touched. `npx tsc --noEmit` and
`npx eslint tests/e2e/... --max-warnings 0` are both clean. `--no-deps` is used because the
`chromium` project is still blocked by the orphaned item-master rows recorded in Phase B of
`progress/impl_analysis.md`; it is the same instrument the previous session used.

## Restore hashes

Every mutation was made on a byte copy and reverted from it, never by `git checkout` (note 3
of the previous pass). `sha256`:

| File | before the repair | after (final, and after every revert) |
|---|---|---|
| `tests/e2e/support/stock-takes.ts` | `5225d469...7342a0` | `0924c38d...cf2ae6` |
| `tests/e2e/stock-takes-count.spec.ts` | `ba518aaf...a22a35` | `1872f8f5...2b128b` |
| `tests/e2e/stock-entry-quantities.spec.ts` | `fca98330...0124e` | `1f7f1e03...4d1632` |

Each of the five reverts (set A, set B, C1, C2, probe) was verified by `diff` against the
recorded hash file and printed `RESTORE VERIFIED`. `test-results/` removed;
`git status --porcelain` carries only the three files above beyond what this session found.

## Findings — not repaired, because they are not mine

1. **#11 has put Dublin counts ABOVE year 2102, and AC-11 in this file says there are none.**
   `tests/unit/stock-entry-contract.test.ts` pins `analysisAccess: 2103`,
   `analysisPrior: 2104` and `analysisFigures: 2105`, and both analysis specs seed **DUBLIN**
   counts in them (`analysis-access.spec.ts:101-112`, `analysis-figures.spec.ts:149-200`).
   `stock-takes-count.spec.ts:360` asserts the approved count's *Next count* is **disabled**,
   justified in its own comment by "2102 is the highest reserved year ... twelve files,
   twelve years". There are now fourteen files and fifteen years, three of them higher, and
   all of these files sit in one project with three workers — so that assertion is false
   whenever an analysis spec's rows exist at that moment. It passed in all five of my runs
   only because the analysis specs were not in the invocation. **Expect it to fail on the
   full gate run.** It is #11's to reconcile; it is not a flake and not mine to edit.
2. The same fact makes the approved count's *next* a globally-derived neighbour of exactly
   the eighth amendment's species. AC-9 and AC-13 are covered — that is what the mask is for
   — but **AC-14** (`stock-takes-count.spec.ts:481`), which compares two bodies of the
   approved count fetched at different moments, is **not**. One line of the same helper would
   cover it. I did not write that line: the brief scopes me to three assertions.
3. **A second, narrower race survives in AC-13, deliberately.** The draft's *Previous count*
   renders as a disabled `span` when this file runs **alone** (visible in the set A
   transcript) and as an anchor when `stock-entry-quantities.spec.ts` runs beside it (the
   probe run) — the yard holds no count before 2102 except another spec's. If that presence
   flips **between** the staff fetch and the admin fetch, the raw lengths differ and
   `expect(adminBody.length).toBe(staffBody.length)` fails. The window is one `beforeAll` or
   one `afterAll` of another file landing between two navigations. I did not absorb it: the
   brief requires that assertion to stay, and masking the control's *state* would hide a real
   role difference — "the jump is a link for the administrator and dead for the yard" is a
   fault this comparison should catch. It is not the diagnosed cause, which was two anchors
   with different ids and identical lengths.
4. **AC-17's residual false positive**, named so nobody rediscovers it: an `Item.description`
   containing the price as a standalone number would be reported. It is loud and printed with
   its context, not silent, and narrowing further would mean requiring a euro sign — which is
   the thing this assertion exists in order not to depend on.

## Notes for the reviewer

- `bodyOf` is **unchanged**, and its comment still says "no normalisation" — which remains
  true of `bodyOf`. The masking is applied by the two callers, at the assertion, where it can
  be read beside the claim it qualifies.
- `jumpTargets` returns the href **whole** when it is not a count URL, rather than `null`, so
  a malformed jump fails an equality with something readable in it instead of passing as
  "disabled".
- `FOREIGN_NEIGHBOUR` is deliberately not cuid-shaped: if the mask ever lands somewhere it
  should not, the diff says so in words rather than in one hex string that looks like
  another.
- The two AC-17 helpers are local to `stock-entry-quantities.spec.ts`. They are #8's, not
  #10's, and `tests/e2e/support/stock-entry.ts` is a shipped file that 010 AC-22 permits this
  feature to amend only as AC-21 names — so nothing was added to it.
- No `src/` file, no spec, no `feature_list.json` and nothing under `Samples/` was touched.
  The red-direction proofs are therefore test-side, which is also why no rebuild was needed
  and why every run served the same build the coordinator's would.

# Repair pass 5 — the two assertions repair pass 4 reported

**Brief:** implement the ruling in 010's **tenth** post-approval amendment — *"2102 is the
highest reserved year" stopped being true when #11 reserved three more*. Two assertions in
`tests/e2e/stock-takes-count.spec.ts`. No `src/` change, no spec edit, no
`feature_list.json` edit, nothing under `Samples/`. No `init`, no full `npm run test:e2e`,
no `npm run test:db` — the coordinator gates.

## What changed

| File | Change |
|---|---|
| `tests/e2e/stock-takes-count.spec.ts` | AC-11 (376-434) and AC-14 (516-552). **+71 / -19** against the state repair pass 4 left. |
| `tests/e2e/support/stock-takes.ts` | **nothing.** `jumpTargets` and `maskForeignNeighbours` were already what repair 2 needed; the helper's hash is unchanged. |

Nothing else in the repository was opened for writing.

---

## Repair 1 — AC-11: "nothing exists after" is gone, and no third spelling replaced it

### The failure, reproduced first

The trio the brief names, against the **unrepaired** file:

```
node node_modules/@playwright/test/cli.js test tests/e2e/stock-takes-count.spec.ts \
  tests/e2e/analysis-access.spec.ts tests/e2e/analysis-figures.spec.ts \
  --project=chromium-stock-entry --no-deps

  x  30 [chromium-stock-entry] > stock-takes-count.spec.ts:360:5 > AC-11: the jumps are same-yard, and carry the reading mode (12.9s)

  1) AC-11: the jumps are same-yard, and carry the reading mode

    Error: expect(locator).toHaveAttribute(expected) failed
    Locator:  getByTestId('next-count')
    Expected: "true"
    Received: ""
    Call log:
      - waiting for getByTestId('next-count')
        13 x locator resolved to <a data-testid="next-count"
             href="/stock-takes/counts/cmu1lisve000kjztwcwfsjqnc" ...>Next count</a>

      393 |   await expect(next).toHaveAttribute("aria-disabled", "true");
  1 failed
  41 passed (2.2m)
```

`cmu1lisve000kjztwcwfsjqnc` is an analysis spec's Dublin count. The prediction repair pass 4
filed — *"expect it to fail on the full gate run"* — is exactly right, and this is the only
failure in that invocation.

### Why the obvious repairs are all the same repair, and none of them is available

`findNeighbourCounts` (`src/server/counts/count-history-service.ts:174-214`) chooses the
neighbour by `(countDate, id)` over `{ location: { code: { in: yardCodesIn(scope) } } }` —
**every row at that yard, in every year**. So for any count at either of the two yards,
*"there is no neighbour in this direction"* is a claim about **every StockCount row in the
database**. That is not a property of the assertion's wording; it is a property of the query.

Three consequences, each checked rather than assumed:

1. **There is no yard this file owns.** `locationCodeSchema` is `z.enum(["DUBLIN",
   "CLONMEL"])` and there are two `Location` rows. DUBLIN is seeded by #11 at 2103, 2104 and
   2105; CLONMEL by `stock-entry-calendar` (2092), `stock-entry-quantities` (2095),
   `stock-takes-calendar` (2101) and `analysis-figures` (2104, 2105). Both yards have rows
   above **and** below this file's 2102 window.
2. **Moving the year does not fix it, it moves the boundary.** Reserving a year above 2105 —
   or dating a 2102 count into 9999 — is literally the same sentence with a different number,
   which is what the amendment forbids, and it fails again the next time a feature reserves a
   year. A fixture whose `countDate` and period differ by thousands of years would also be a
   fixture that lies about the domain, in the one file whose whole subject is what a count
   date means. Repair pass 4 rejected that species of fixture for the same reason.
3. **Seeding more counts cannot create an absence.** The file can pin a *presence* absolutely
   — two owned counts adjacent in `(countDate, id)` with nothing datable between them — but
   every extra count simply becomes the new last one, whose own `next` is global again.

So the "nothing exists after" claim is not repairable in this file. It is **removed**, and
what replaces it is a scenario in which every value the assertion names is a row this file
created.

### What is asserted instead, and why this is a fact rather than a hope

February's count (`submittedId`, DUBLIN, period 2102-02, dated `2102-02-28`) is a count at a
yard/period **both of whose neighbours are this file's own**: January's draft (`2102-01-31`)
before it and March's approved count (`2102-03-31`) after it. No other spec writes into 2102
— 007 AC-30's per-spec reservation, asserted in `tests/unit/stock-entry-contract.test.ts` —
so no row that is not this file's can be dated between two of them. Both jumps out of that
count are therefore determined by this file's own fixture and by nothing else in the
database, whatever else is running in the other two workers.

The assertion pins, for each direction:

- the control exists **exactly once** under its `data-testid`;
- it carries its label, `Previous count` / `Next count`;
- its `href` is the owned neighbour's URL;
- it is an `A`;
- and it carries **no** `aria-disabled`.

The last of those is not decoration. It is the other half of `CountJump`'s two states: a
component that regressed to rendering the disabled `span` unconditionally fails here. What
is no longer covered by this file is the opposite direction — the span branch rendering when
there genuinely is no neighbour.

A second, smaller block then reads the top of **this file's own** sequence, saying nothing
about what is above it: the approved count's *Previous count* is February's count, an anchor
with the owned `href` and the label.

### The absence branch keeps the one owner that can actually claim it

`src/server/counts/count-history-service.db.test.ts` calls `resetTestDb()` and therefore owns
the whole of `StockCount`. It already asserts the null neighbour six times over —
`expect(earliest.previous).toBeNull()`, `expect(latest.next).toBeNull()`,
`expect(clonmel.previous).toBeNull()`, `expect(clonmel.next).toBeNull()`,
`expect(fromEarlier.previous).toBeNull()`, `expect(fromLater.next).toBeNull()` (lines
490-531). **Those are true by construction**, because that test truncates the table it then
makes a claim about. The e2e assertion removed here was a *duplicate* of a claim that already
has a durable owner — made from the one place in the repository that cannot support it.

That is the whole shape of this defect and it is worth naming: the claim was not wrong, and
it was not unowned. It was owned twice, and the second owner could not hold it.

### Red direction — three mutations, each on a byte copy, each reverted with a hash check

Run as `-g "AC-11"` against `tests/e2e/stock-takes-count.spec.ts` alone.

**R1-A — the page resolved a different neighbourhood.** The navigation changed from
February's count to January's, so the two controls are read on a count whose neighbours are
not the owned pair:

```
  1) AC-11: the jumps are same-yard, and carry the reading mode
    Error: previous-count
    expect(locator).toHaveAttribute(expected) failed
    Locator:  getByTestId('previous-count')
    Expected: "/stock-takes/counts/cmu1lq69e0003jzg4qec99if6"
    Received: ""
    Call log:
        13 x locator resolved to <span aria-disabled="true" data-testid="previous-count"
             ...>Previous count</span>
      > 420 |     await expect(control, testId).toHaveAttribute("href", ...);
  1 failed
```

Note what that transcript also shows: running **alone**, the draft's *Previous count* is a
disabled `span`; in the probe run beside the analysis specs it is an anchor. That is the
"one narrower race" the tenth amendment records as accepted, observed live, and it is the
direct evidence that the disabled state is not a fact any spec can assert.

**R1-B — `CountJump` regressed to always-disabled.** The expected tag and `aria-disabled`
were flipped to the disabled rendering; the live DOM says otherwise:

```
    Error: previous-count
    expect(received).toBe(expected) // Object.is equality
    Expected: "SPAN"
    Received: "A"
      > 421 |     expect(await control.evaluate((node) => node.tagName), testId).toBe("SPAN");
  1 failed
```

**R1-C — the same-yard rule broken: the jump points at the Clonmel count.** This is the fault
AC-11 exists to catch, and the fourth count in this fixture exists to be *not* jumped to:

```
    Error: next-count
    Expected: "/stock-takes/counts/cmu1lra39002fjzfkdg9urtki"   (the Clonmel count)
    Received: "/stock-takes/counts/cmu1lrc3i004tjzfk3fkcuc8t"   (March's Dublin count)
    Call log:
        13 x locator resolved to <a data-testid="next-count"
             href="/stock-takes/counts/cmu1lrc3i004tjzfk3fkcuc8t" ...>Next count</a>
  1 failed
```

---

## Repair 2 — AC-14: the same mask, at the assertion

`stock-takes-count.spec.ts:516` compares two bodies of the **approved** count fetched at
different moments, and that count's *next* is now a globally-derived neighbour of the eighth
amendment's species. The repair is the one repair pass 4 applied to AC-9 and AC-13, in the
same place and the same way:

- `jumpTargets(page)` is read after each of the two navigations;
- the jump this file **owns** — the approved count's *Previous count*, which is February's —
  is asserted **directly**, for both readings, so the mask absorbs nothing that is assertable;
- the byte comparison is then taken through `maskForeignNeighbours(..., ownCounts())`, **at
  the assertion**, not inside `bodyOf`, so the masking is read beside the claim it qualifies
  and `bodyOf`'s "no normalisation" comment stays true of `bodyOf`.

What is still compared byte for byte: everything except the *id* of a count this file does
not own — the element, its attributes, the carried query, every owned count id, and every
other character of the body.

### Red direction — five mutations

Run as `-g "AC-14"`. The first two are one pair: **the same input**, once through the old
assertion and once through the repaired one.

**R2-incidental — the neighbour moved between the two navigations.** Both bodies were given
a *Next count* anchor with a different, cuid-shaped, foreign id (`cmu1aaaa…` / `cmu1bbbb…`),
and the assertion put back to the unmasked `expect(spoofed).toBe(plain)`:

```
  1) AC-14: role cannot be influenced by a query, a header or a cookie
    Error: YARD_STAFF
    expect(received).toBe(expected) // Object.is equality
      > 548 |     expect(spoofedX, role).toBe(plainX);
  1 failed

    Expected: len=39175  tail=...Stock Entry</a></div><a href="/stock-takes/counts/cmu1aaaaaaaaaaaaaaaaaaaaa">Next count</a>"
    Received: len=39175  tail=...Stock Entry</a></div><a href="/stock-takes/counts/cmu1bbbbbbbbbbbbbbbbbbbbb">Next count</a>"
```

**Identical lengths, one differing id** — the signature the eighth amendment says to
recognise, reproduced deterministically rather than waited for.

**R2-absorbed — the same input through the repaired assertion:**

```
  ok 1 AC-14: role cannot be influenced by a query, a header or a cookie (9.2s)
  1 passed (23.7s)
```

That pair is the whole claim of the repair: the incidental difference stops failing, and it
stops failing **because of the mask** and not because the run got lucky.

**R2-owned — the mask is not over-broad.** The same injection with two ids this file *does*
own (`draftId` / `submittedId`), again cuid-shaped and length-identical:

```
    Error: YARD_STAFF
    expect(received).toBe(expected) // Object.is equality
      > 548 |     expect(maskForeignNeighbours(spoofedX, ownCounts()), role).toBe(
    Expected: len=39175  tail=...<a href="/stock-takes/counts/cmu1lt9fg0003jzpoizn7povd">Next count</a>"
    Received: len=39175  tail=...<a href="/stock-takes/counts/cmu1lta3c002hjzpoz8irlz27">Next count</a>"
  1 failed
```

A spoofed request that led to a different one of **this file's own** counts is still a
failure.

**R2-real — a genuine difference between the two responses.** `<b>x</b>` appended to the
spoofed body only:

```
    Error: YARD_STAFF
    expect(received).toBe(expected) // Object.is equality
      > 548 |     expect(maskForeignNeighbours(spoofedX, ownCounts()), role).toBe(
  1 failed
```

**R2-jump — the new direct assertion is live.** The unspoofed navigation pointed at the draft
instead of the approved count, so the page really does lead somewhere else:

```
    Error: YARD_STAFF
    expect(received).toBe(expected) // Object.is equality
    Expected: "cmu1lu83v002hjz6gqb5zgtk1"
    Received: null
      > 536 |     expect(plainJumps.previous, role).toBe(submittedId);
  1 failed
```

### Evidence the exposure is real rather than theoretical

An instrumented probe (added, run, removed, restore hash verified below) printed the approved
count's *next* in both AC-14 readings while the analysis specs ran beside it:

```
PROBE AC-14 YARD_STAFF plainNext=null spoofedNext=null plainOwned=false maskChangedBody=false rawEqual=true
PROBE AC-14 ADMIN      plainNext=null spoofedNext=null plainOwned=false maskChangedBody=false rawEqual=true
  42 passed (1.7m)
```

**In that run the mask did not fire, and that is the honest result**: AC-14 is the 37th of 42
tests, and by the time it ran both analysis specs had already deleted their reserved years.
AC-11 runs earlier and caught the anchor every time. So the exposure is a **timing** window,
not a constant — which is exactly why it must be closed by construction rather than by
observation, and why the deterministic R2-incidental / R2-absorbed pair above is the proof
that matters. `plainNext=null` in that transcript is also the residual the tenth amendment
accepts: the control's *state* flips between a `span` and an anchor as another spec's rows
come and go, and masking a state would hide a real role difference.

---

## The trio, run seven times

```
node node_modules/@playwright/test/cli.js test tests/e2e/stock-takes-count.spec.ts \
  tests/e2e/analysis-access.spec.ts tests/e2e/analysis-figures.spec.ts \
  --project=chromium-stock-entry --no-deps
```

| # | exit | summary | AC-11 | AC-14 |
|---|---|---|---|---|
| baseline (unrepaired) | 1 | `1 failed / 41 passed (2.2m)` | **failed — the defect** | ok |
| probe (repaired + probe) | 0 | `42 passed (1.7m)` | ok | ok |
| 1 | 1 | `1 failed / 41 passed (2.1m)` — `analysis-figures.spec.ts:358`, `page.waitForURL` timeout inside `signIn` | ok (3.7s) | ok (6.6s) |
| **2** | **0** | **`42 passed (2.5m)`** | ok (3.4s) | ok (6.8s) |
| 3 | 1 | `1 failed / 16 did not run / 25 passed` — `beforeAll` hook timeout, **`Can't reach database server`** | did not run | did not run |
| 4 | 1 | `2 failed / 27 did not run / 13 passed` — **`PrismaClientInitializationError: Can't reach database server`** | did not run | did not run |
| **5** | **0** | **`42 passed (2.9m)`** | ok (4.0s) | ok (43.3s) |
| **6** | **0** | **`42 passed (1.7m)`** | ok (4.1s) | ok (6.6s) |
| 7 | 1 | `5 failed / 6 did not run / 31 passed` — all five in the two analysis specs, **`Can't reach database server`** | ok (3.3s) | ok (6.6s) |

**Three green trio runs — 2, 5 and 6 — each `42 passed`, exit 0, `retries: 0`, no timeout
touched.** They are not literally consecutive and this report will not pretend they are: runs
3 and 4 fell to the Neon branch dropping connections, which the brief names as the branch and
not the code, and I stopped rather than looping. Runs 5 and 6 **are** consecutive. Across the
six invocations in which this file's tests executed at all, **AC-11 and AC-14 passed in every
one** — including run 7, where five analysis tests failed on `Can't reach database server`
around them.

Run 1's failure is worth one sentence because it is not an assertion either: it is
`page.waitForURL` timing out inside `signIn` at `tests/e2e/support/users.ts:74`, on a
navigation that authenticates against the same branch. Same cause, different symptom.

`npx tsc --noEmit` exit 0 and
`npx eslint tests/e2e/stock-takes-count.spec.ts tests/e2e/support/stock-takes.ts
--max-warnings 0` exit 0, after the repair and with the tree in its final state.

## Restore hashes

Every mutation and the probe were applied to the working file and reverted from a **byte
copy** taken before any of them, never by `git checkout`. Each revert was verified by `diff`
against the copy and by `sha256sum`.

| File | before this pass | after this pass (final) |
|---|---|---|
| `tests/e2e/stock-takes-count.spec.ts` | `1872f8f52d9e6926b09513aafc3b71dea4c661e92b0b494e8b16b310952b128b` | `4df5a1ec4064792fa41bbeec33425821fb52413341d6c48ebda5ce6aa2a3aa2e` |
| `tests/e2e/support/stock-takes.ts` | `0924c38d7681d2ed3dbe87f14e2fefcbb2a274d26f5de94de4c077a361cf2ae6` | `0924c38d7681d2ed3dbe87f14e2fefcbb2a274d26f5de94de4c077a361cf2ae6` (**unchanged**) |

Both "before" hashes are identical to the finals repair pass 4 recorded, so this pass started
from exactly the tree that pass left.

Nine reverts in all — R1-A, R1-B, R1-C, R2-incidental, R2-absorbed, R2-owned, R2-real,
R2-jump and the probe — each printing `RESTORE VERIFIED
4df5a1ec4064792fa41bbeec33425821fb52413341d6c48ebda5ce6aa2a3aa2e`. `test-results/` removed;
`git status --porcelain` carries nothing this session created beyond the one changed file.

## Findings — not repaired, because they are not in this brief's scope

1. **`tests/e2e/stock-takes-calendar.spec.ts:330` carries the identical defect, and it is the
   last place the disabled branch is asserted at the browser.** Its test *"AC-11: with no
   neighbour the control still renders, disabled and not an anchor"* navigates to
   `/stock-takes?month=2103-01` with the default `BOTH` scope and asserts `next-count` has
   `aria-disabled="true"`, justified by the same sentence — *"Nothing after 2103-01 is a
   fact: 2102 is the highest reserved year"* (lines 336-342). `analysis-access.spec.ts` seeds
   **approved DUBLIN counts dated `2103-10-31`, `2103-11-30` and `2103-12-31`**, and both
   files run in `chromium-stock-entry`. **Expect that test to fail on the full gate run for
   exactly the reason AC-11 in this file just did.** It was not in my invocations, and the
   brief scopes me to `stock-takes-count.spec.ts`.
   The consequence matters more than the instance: once that one is repaired the same way,
   **`CountJump`'s disabled rendering has no browser-level owner at all.** The service half
   is safe in `count-history-service.db.test.ts`; the `span`-with-`aria-disabled` markup would
   not be. The durable home for it is a component-level render test of `CountJump` with
   `href: null` — no database, no neighbour, nothing to race — and that is the shape I would
   propose rather than a third attempt to find an empty direction in a shared database.
2. **`analysis-figures.spec.ts:579` is the same species and is not yet wrong.** It asserts
   `/analysis`'s *Next period* is disabled at the latest approved period, 2105-10, which is
   true only while nothing in the repository approves a count in a later period. No spec
   reserves above 2105 today, so it passes; the item-master fixture's 2999 count is the one
   row whose lifecycle status I did not chase down. Flagged for #11's reviewer as an
   observation, **not** as a defect I verified.
3. **AC-14's residual state flip is not closed and cannot be by masking.** The approved
   count's *Next count* is a `span` when this file runs alone and an anchor when the analysis
   specs' rows exist; if that flips between the two navigations, the masked bodies differ by
   the whole element. Masking the *state* would hide "the jump is a link for one role and
   dead for the other", which is a fault this comparison exists to catch. A narrower
   alternative exists and I did not take it: moving AC-14's subject from the approved count
   to **February's** count would remove the flip entirely, because both of that count's
   neighbours are owned and both are therefore always anchors — the same principle repair 1
   is built on. It changes the criterion's subject, the brief named the change to make, and I
   made that one. Recorded so the option has an owner.

## Notes for the reviewer

- **`bodyOf` is still unchanged**, and its "no normalisation" comment is still true of it.
  Both maskings live at their assertions.
- **`ownNeighboursOf` is untouched** and still describes three owned neighbours; repair 1 does
  not use it (it is AC-9's and AC-13's helper), and repair 1's new block names its two targets
  literally so the assertion reads without a second lookup.
- **The first block of the AC-11 test is unchanged** — February's jumps under
  `?yard=CLONMEL&show=all`, and the `not.toContain(clonmelId)` check. The new block asserts
  the same two jumps **without** a carried query, plus the label, the count, the tag and the
  absence of `aria-disabled`; the overlap is deliberate, because the two blocks pin different
  things about the same pair of links.
- **Nothing in this pass depends on what any other spec does**, which is the point. The two
  repaired assertions name only ids this file created, and the one comparison that cannot
  avoid touching a foreign id masks exactly that id and nothing else.
- No `src/` file, no spec, no `feature_list.json`, nothing under `Samples/`. Every red proof
  is therefore test-side, which is also why no rebuild was needed and why every run served the
  same build the coordinator's would.
