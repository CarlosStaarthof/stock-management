# Implementation — feature 7 entry_start

**Spec:** specs/features/007-entry_start.md (approved, then amended five times — the four the
implementer found before writing a source file, and AC-33, added after the coordinator's
gate run)
**Status:** complete

Thirty-three criteria. Four routes under `/stock-entry`, one server action, one write, and
the first feature a `YARD_STAFF` user ever sees. A third of the criteria run with no
database at all, because the period rule, the calendar grid, the yard clock and every
user-visible string are pure modules.

## Files created

- `src/types/stock-count.ts` — every data shape the Contract block names, and the
  `CountStatus` union, which AC-25's source scan requires to live outside both scanned trees.
- `src/lib/count-messages.ts` — every literal any criterion quotes, plus the two date
  formatters and `COUNT_STATUS_LABEL` as a `Record`, so no branch names a later status.
- `src/lib/count-messages.test.ts` — 18 tests; each quoted literal asserted from the module. (This line said 19 until the review session counted them: `npx vitest run src/lib/count-messages.test.ts` reports 18.)
- `src/lib/calendar-month.ts` — `buildMonthGrid`, pure: complete Monday-first weeks,
  `rows = ceil((leading + days) / 7)`.
- `src/lib/calendar-month.test.ts` — 8 tests, including the rule applied to every month of
  four whole years.
- `src/lib/yard-time.ts` — `todayInYard`, `Europe/Dublin`, pure.
- `src/lib/yard-time.test.ts` — 6 tests (AC-31).
- `src/server/counts/period.ts` — Part 4's `day <= 5` rule as one function, plus the month
  arithmetic and every parse that keeps a bad value away from a CHECK constraint.
- `src/server/counts/period.test.ts` — 18 tests.
- `src/server/counts/count-input.ts` — the confirm form and the query parameters, parsed.
- `src/server/counts/count-input.test.ts` — 16 tests.
- `src/server/counts/count-shape.ts` — `countForRole`, a thunk seam over `shapeForRole`.
- `src/server/counts/count-shape.test.ts` — 7 tests with spy thunks.
- `src/server/counts/count-service.ts` — `startCount`, `findCountForPeriod`, `getCount`,
  `listCountableYards`, `defaultMonthKey`, `countsInMonth`, `anyCountEver`, `monthView`.
- `src/server/counts/count-service.db.test.ts` — 40 tests against the test branch.
- `src/server/items/sheet-shape.ts` — `sheetEntriesForRole` / `currentPriceOf`, the seam that
  makes `listSheet` role-shaped without a second query (AC-14).
- `src/server/items/sheet-shape.test.ts` — 8 tests with spy thunks.
- `src/server/items/role-shaped-sheet.db.test.ts` — 8 tests: the widened guard through a real
  database, including all seventeen 006 AC-4 mutations still refusing a staff actor.
- `src/app/stock-entry/new/page.tsx` — who / where / when.
- `src/app/stock-entry/new/confirm/page.tsx` — the period, shown before anything is written.
- `src/app/stock-entry/counts/[id]/page.tsx` — the count itself.
- `src/app/stock-entry/actions.ts` — `startCountAction`, the one write.
- `src/app/stock-entry/form-state.ts` — the action's result type, shared with the form.
- `src/components/stock-entry/CalendarGrid.tsx`, `StartCountForm.tsx`,
  `StartCountButton.tsx` — the three pieces of UI; the button is disabled while pending.
- `tests/unit/stock-entry-contract.test.ts` — 24 source scans (AC-1, AC-3, AC-4, AC-5, AC-9,
  AC-15, AC-25, AC-26, AC-29, AC-30, AC-32).
- `tests/e2e/stock-entry-access.spec.ts` (reserved year 2091),
  `tests/e2e/stock-entry-calendar.spec.ts` (2092),
  `tests/e2e/stock-entry-start.spec.ts` (2093),
  `tests/e2e/stock-entry-refusals.spec.ts` (2094) — one reserved year each, both deletes
  scoped to that year (AC-30 as amended).
- `tests/e2e/support/stock-entry.ts` — the four specs' shared fixtures.

## Files modified

- `src/app/stock-entry/page.tsx` — the #3 placeholder becomes the calendar, keeping its three
  test ids (`signed-in-email`, `sign-out`, `access-denied`) because three shipped specs
  assert on them (AC-2).
- `src/server/items/item-assignment-service.ts` — AC-14: `listSheet` and `locationName`
  widen from `assertRole(actor, "ADMIN")` to `assertUser`, and `listSheet` returns through
  `sheetEntriesForRole`. A staff reader has **no** `currentPrice` key, and the admin builder
  is never called for them. The seventeen mutations are untouched.
- `src/server/items/item-assignment-service.db.test.ts` — the one shipped assertion that
  `listSheet` refuses a staff actor, replaced by the widened behaviour.
- `src/app/item-master/yards/[code]/page.tsx` — reads the price through `currentPriceOf`
  now that the sheet entry is a union; no rendered output changes.
- `playwright.config.ts` — a second project, `chromium-stock-entry`, depending on
  `chromium`. #6's specs edit the yard sheets while #7's specs count them; a count started
  mid-run referenced another spec's items, hid the *Delete* control 006 AC-12 asserts and
  broke its `cleanUp` on `StockCountLine_itemId_fkey`. Fixed at the config, not by weakening
  either spec. `retries: 0`, the served build, three workers and every timeout unchanged.
- `tests/e2e/item-master-items.spec.ts` — **AC-33**: the two polled global comparisons
  removed, the floor and the within-load equality kept, presence-by-description added, and
  the long comment rewritten. Detail below.
- `specs/features/007-entry_start.md`, `feature_list.json`, `progress/current.md` — the spec
  amendments, the mirrored 33 criteria, and the work log.

`prisma/` is byte-identical: no migration. `git status --porcelain -- Samples prisma` is
empty.

## AC-33 — what changed in `tests/e2e/item-master-items.spec.ts`

Removed: the `expect.poll` at the old `:176` comparing rendered rows to a fresh
`db.item.count({ where: { active: true } })`, and the sibling `expect.poll` loop doing the
same for the four badges. Polling repairs a *transient* disagreement; while
`item-master-yards.spec.ts` and `item-master-access.spec.ts` create and archive items
throughout the window, the render and the count are taken at different instants and there is
no pass on which either predicate holds.

Kept, unchanged: `expect(activeBadge).toBeGreaterThan(100)` — the assertion the #6 reviewer's
`take: 50` mutation actually fails, and therefore the only thing standing between 006 AC-6
and a tautology — and the within-one-page-load equality
`expect(page.getByTestId("item-row")).toHaveCount(activeBadge)`.

Added in the polls' place, all of them about populations no other spec can move:

- every item this file seeds in `beforeAll` is on the rendered list, found by its unique
  description (`pricedItem`, `flaggedItem`, `fuelItem`, `notedItem`, `referencedItem`;
  `deletableItem` is deliberately left out because a later test in the file removes it);
- for each of the four filters, one page load of `/item-master?filter=<f>`: the badge
  matches `/^\d+$/` — AC-17's "reads a real number" — and the rendered rows equal it, from
  the same `listItems` snapshot;
- this file's flagged rows appear under `needs-review`, its noted rows under `notes`, and an
  active row of its own does **not** appear under `archived`.

The long comment above the floor no longer credits the polls as independent measurements; it
records why they were removed and that the floor is what the mutation fails.

## Acceptance criteria

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | `src/middleware.ts`, `src/lib/auth-config.ts` — **unchanged** | `tests/unit/stock-entry-contract.test.ts:90` "AC-1: auth-config.ts and middleware.ts are byte-identical…", `:100`; `tests/e2e/stock-entry-access.spec.ts:86`, `:106`, `:116` |
| AC-2 | `src/app/stock-entry/page.tsx` (three test ids kept) | `tests/e2e/stock-entry-access.spec.ts:145` "AC-2: the three test ids #3 left on /stock-entry survive its replacement" |
| AC-3 | no `loading.tsx` at or above `src/app/stock-entry/` | `tests/unit/stock-entry-contract.test.ts:59`, `:77`; degradation transcript below |
| AC-4 | `src/app/stock-entry/actions.ts` — `requireUser()`, once | `tests/unit/stock-entry-contract.test.ts:121`, `:130`; `src/server/counts/count-service.db.test.ts:132`, `:157`; **`tests/e2e/stock-entry-start.spec.ts:249`** "AC-4, AC-18: a cookie, a header, ?role=ADMIN and two forged form fields change neither the row nor the shape" — the browser clause, added at review |
| AC-5 | `src/app/stock-entry/new/page.tsx` — `counting-as` is text | `tests/unit/stock-entry-contract.test.ts:144`, `:150`; `src/lib/count-messages.test.ts:105`; `tests/e2e/stock-entry-start.spec.ts:92` |
| AC-6 | `src/server/counts/period.ts` — `periodForCountDate` | `src/server/counts/period.test.ts:22`, `:29`, `:36`, `:57`, `:72`, `:78`, `:85`; `src/server/counts/count-input.test.ts:117` |
| AC-7 | `src/app/stock-entry/new/confirm/page.tsx` | `src/lib/count-messages.test.ts:54`; `src/server/counts/count-input.test.ts:53`, `:98`; `count-service.db.test.ts:384`; `tests/e2e/stock-entry-start.spec.ts:148` (the 2026 literals, GET only) |
| AC-8 | `src/server/counts/count-input.ts`, `period.ts` `parsePeriodKey` | `period.test.ts:91`, `:98`, `:113`; `count-input.test.ts:63`, `:83`; `count-service.db.test.ts:399`, `:411`, `:423`; `tests/e2e/stock-entry-start.spec.ts:324`; `stock-entry-refusals.spec.ts:106` |
| AC-9 | nothing anywhere implements one | `tests/unit/stock-entry-contract.test.ts:162`, `:173`; `period.test.ts:51`; `count-input.test.ts:126`; `count-service.db.test.ts:446` |
| AC-10 | `src/server/counts/count-service.ts` — `startCount` | `src/lib/count-messages.test.ts:70`, `:79`; `count-service.db.test.ts:483`, `:515`, `:527` (two concurrent starts); `tests/e2e/stock-entry-refusals.spec.ts:66` |
| AC-11 | `count-service.ts` — `findCountForPeriod` | `count-service.db.test.ts:551`, `:570`, `:583`; `count-messages.test.ts:95`; `tests/e2e/stock-entry-start.spec.ts:348` |
| AC-12 | `count-service.ts` — `startCount` reads `listSheet` | `count-service.db.test.ts:179` (82 and 70), `:201`, `:223` (order, element for element), `:235` |
| AC-13 | `count-service.ts` — one `db.$transaction` | **`count-service.db.test.ts:279`** "AC-13: startCount itself, failed at the LINE write, leaves zero counts" — rewritten at review to drive the real function, and proved by mutation both ways below — `:322`, `:344`, `:355`; `count-input.test.ts:29`, `:47`; `count-messages.test.ts:48`; `tests/e2e/stock-entry-refusals.spec.ts:154` |
| AC-14 | `src/server/items/item-assignment-service.ts` + `sheet-shape.ts` | `src/server/items/sheet-shape.test.ts:46`–`:111` (9 tests); `role-shaped-sheet.db.test.ts:88`–`:180` (8 tests) |
| AC-15 | no module in the feature names the price column | `tests/unit/stock-entry-contract.test.ts:185`, `:202`; `count-shape.test.ts:95`; `count-messages.test.ts:123`; `count-service.db.test.ts:201`, `:813` |
| AC-16 | `src/server/counts/count-shape.ts` + `getCount` | `count-shape.test.ts:47`, `:58`, `:70`, `:102` (the admin branch is `async`, so the extra **query** is inside it); `count-service.db.test.ts:744` (11 of 82), `:759`; `count-messages.test.ts:114`; `tests/e2e/stock-entry-refusals.spec.ts:168` |
| AC-17 | `assertNoMoneyKeys` over every staff-obtainable value | `count-shape.test.ts:81`, `:89`; `sheet-shape.test.ts:94`; `count-service.db.test.ts:774`, `:791`; `role-shaped-sheet.db.test.ts:120`; `tests/e2e/stock-entry-access.spec.ts:171` |
| AC-18 | role comes from `actor.role` alone | `count-shape.test.ts:70`; `role-shaped-sheet.db.test.ts:145`; `tests/e2e/stock-entry-access.spec.ts:195` (the `GET` half); **`tests/e2e/stock-entry-start.spec.ts:249`** (the `POST` half — the Server Action, with all four vectors and the created row read back), added at review |
| AC-19 | `src/lib/calendar-month.ts` | `calendar-month.test.ts:20` (Sep), `:37` (Feb, 5 rows — amendment 1), `:53` (Mar), `:65`, `:72`, `:83` (four whole years), `:98`, `:104`; `count-messages.test.ts:141`, `:160`; `count-service.db.test.ts:633`; `tests/e2e/stock-entry-calendar.spec.ts:97` |
| AC-20 | `src/components/stock-entry/CalendarGrid.tsx` | `count-service.db.test.ts:654`, `:669`, `:688`; `period.test.ts:154`; `count-messages.test.ts:130`; `tests/e2e/stock-entry-calendar.spec.ts:127`, `:158`, `:179`, `:198` |
| AC-21 | `period.ts` `previousMonthKey` / `nextMonthKey`; `src/app/stock-entry/page.tsx` | `period.test.ts:127`, `:132`, `:138`, `:146`; `count-input.test.ts:139`, `:144`, `:153`; `count-service.db.test.ts:633`, `:647`; `tests/e2e/stock-entry-calendar.spec.ts:211`, `:234` |
| AC-22 | `count-service.ts` — `defaultMonthKey`, `anyCountEver` | `count-service.db.test.ts:596`, `:606`, `:614`; `period.test.ts:161`, `:168`; `count-messages.test.ts:43`; `tests/e2e/stock-entry-calendar.spec.ts:257` |
| AC-23 | `src/app/stock-entry/new/page.tsx`, `count-input.ts` | `count-input.test.ts:16`, `:41`, `:108`, `:159`, `:167`; `count-service.db.test.ts:699`; `tests/e2e/stock-entry-start.spec.ts:67`, `:114`, `:135` |
| AC-24 | `src/app/stock-entry/counts/[id]/page.tsx` | `count-service.db.test.ts:716`, `:735`; `count-messages.test.ts:105`, `:160`, `:175` (the 2026 literals — amendment 3); `tests/e2e/stock-entry-start.spec.ts:183` (the same sentences in year 2093); `stock-entry-refusals.spec.ts:133` |
| AC-25 | `src/types/stock-count.ts` (amendment 4) | `tests/unit/stock-entry-contract.test.ts:212`, `:229`, `:242`, `:250`; `count-service.db.test.ts:831`; `count-messages.test.ts:130` |
| AC-26 | `src/lib/count-messages.ts`; `StartCountButton.tsx` disabled while pending | every test in `count-messages.test.ts`; `tests/unit/stock-entry-contract.test.ts:265` (the dependency fence); `tests/e2e/stock-entry-start.spec.ts:183` (read from the redirected page), `:385` (a double tap writes one count) |
| AC-27 | `src/app/api/error-response.ts` — unchanged | `count-messages.test.ts:79` (no refusal names Postgres, Prisma or a constraint); `tests/e2e/stock-entry-refusals.spec.ts:66`, `:106`, `:133`, `:154` |
| AC-28 | Tailwind, phone first | `tests/e2e/stock-entry-access.spec.ts:230` (320 px, all four routes); `stock-entry-calendar.spec.ts:270` (390 px); `stock-entry-start.spec.ts:406` (the whole flow at 390 × 844) |
| AC-29 | `force-dynamic` on all four pages; no import-time connection | `tests/unit/stock-entry-contract.test.ts:277`, `:288`, `:265`. **The no-database RUN itself is gate-level** — the coordinator's `init`, per this session's instruction |
| AC-30 | `playwright.config.ts`; per-file reserved years (amendment 2) | `tests/unit/stock-entry-contract.test.ts:304`, `:315`, `:323`. **The full-gate half is the coordinator's run** |
| AC-31 | `src/lib/yard-time.ts` | `yard-time.test.ts:10`, `:14`, `:18`, `:22`, `:27`, `:32`; `count-service.db.test.ts:458` |
| AC-32 | nothing writes master data | `tests/unit/stock-entry-contract.test.ts:348`, `:357`; `count-service.db.test.ts:368`; every e2e spec's `seededMasterCounts()` before and after |
| AC-33 | `tests/e2e/item-master-items.spec.ts:146`–`:186` and `:198`–`:233` | `tests/e2e/item-master-items.spec.ts:136` "AC-6, AC-17: the list finds an item by substring in any case, and the badges count" — proved by mutation both ways, transcripts below |

## Verification output

The **gate itself is the coordinator's run**, and was deliberately not run in this session: a
full `init` inside an agent costs ~480 lines of transcript that is re-sent on every later
tool call, and the coordinator re-runs it independently. What follows is the targeted
evidence this session produced.

### AC-33, mutation 1 — `take: 50` must go red, and must go red **at the floor**

`src/server/items/item-service.ts:174`, `findMany({ include: ITEM_INCLUDE, take: 50 })`,
`npm run build`, then:

```
$ npx playwright test tests/e2e/item-master-items.spec.ts --project=chromium --workers=1

  1) [chromium] › tests\e2e\item-master-items.spec.ts:136:5 › AC-6, AC-17: the list finds an item by substring in any case, and the badges count

    Error: expect(received).toBeGreaterThan(expected)

    Expected: > 100
    Received:   50

      173 |   // "Timeout 10000ms exceeded while waiting on the predicate", 1 failed, 33 did not run.
      174 |   const activeBadge = Number(await page.getByTestId("filter-count-active").innerText());
    > 175 |   expect(activeBadge).toBeGreaterThan(100);
          |                       ^
        at tests\e2e\item-master-items.spec.ts:175:23

  1 failed
```

The whole file under the same mutation: `2 failed, 15 passed (2.4m)` — the floor above, and
`AC-11: archiving keeps history…:603`, which a truncated list also breaks. 006 AC-6 is still
non-tautological, and the failure lands exactly where the #6 reviewer found it.

### AC-33, mutation 2 — reverted, green at the default three workers

`git diff src/server/items/item-service.ts` empty, `npm run build`, then:

```
$ npx playwright test tests/e2e/item-master-items.spec.ts --project=chromium
  ...
  ok 17 [chromium] › tests\e2e\item-master-items.spec.ts:660:5 › AC-5: a form body carrying role=ADMIN does not make a YARD_STAFF session an admin (2.6s)

  17 passed (2.0m)
```

And — because one file alone is not the configuration that failed — the three specs that
move the population, together, three workers, which is exactly what went red on the
coordinator's gate:

```
$ npx playwright test tests/e2e/item-master-items.spec.ts tests/e2e/item-master-yards.spec.ts tests/e2e/item-master-access.spec.ts --project=chromium

  30 passed (2.2m)
```

### S10 red proof, unit half — a #7 module, a named failure

`src/server/counts/period.ts:29`, `PREVIOUS_MONTH_THROUGH_DAY` 5 → 4:

```
$ npx vitest run src/server/counts/period.test.ts

 FAIL  src/server/counts/period.test.ts > periodForCountDate > AC-6: the boundary is day 5, asserted on both sides of it in every month of a year
 AssertionError: 2026-01-05: expected { periodYear: 2026, periodMonth: 1 } to deeply equal { periodYear: 2025, periodMonth: 12 }

 Test Files  1 failed (1)
      Tests  3 failed | 15 passed (18)
```

Reverted:

```
$ npx vitest run src/server/counts/period.test.ts
 ✓ src/server/counts/period.test.ts (18 tests) 52ms
 Test Files  1 passed (1)
      Tests  18 passed (18)
```

### S10 red proof, e2e half — a defect only the browser can catch

`src/app/stock-entry/counts/[id]/page.tsx:88`, `dateTime={count.countDate}` →
`dateTime={count.countDate.slice(0, 7)}`. It typechecks, it lints, and:

```
$ npx vitest run
 Test Files  31 passed (31)
      Tests  378 passed (378)
```

The whole unit suite is blind to it. The e2e suite is not:

```
$ npm run build && npx playwright test tests/e2e/stock-entry-start.spec.ts --project=chromium-stock-entry

  1) [chromium-stock-entry] › tests\e2e\stock-entry-start.spec.ts:183:5 › AC-8, AC-24, AC-26: Start count writes one DRAFT and the page names what was created

    Error: expect(locator).toHaveAttribute(expected) failed

    Locator:  getByTestId('count-date')
    Expected: "2093-09-10"
    Received: "2093-09"

      202 |   await expect(page.getByTestId("count-heading")).toHaveText("Dublin");
      203 |   await expect(page.getByTestId("count-period")).toHaveText(`September ${YEAR_TEXT}`);
    > 204 |   await expect(page.getByTestId("count-date")).toHaveAttribute(
        at tests\e2e\stock-entry-start.spec.ts:204:48

  1 failed
  65 passed (3.3m)
```

Reverted and rebuilt, the same command:

```
  ok 62 [chromium-stock-entry] › tests\e2e\stock-entry-start.spec.ts:183:5 › AC-8, AC-24, AC-26: Start count writes one DRAFT and the page names what was created (12.0s)
  ...
  66 passed (3.2m)
```

66 rather than 11, because `chromium-stock-entry` declares `dependencies: ["chromium"]` and
the whole first project runs ahead of it. That is the AC-33 fix passing a third time, under
the configuration that used to fail.

### AC-3 — the degradation, reproduced, and the provocation deleted

Recorded when it was observed, earlier in this feature's implementation.
`src/app/stock-entry/loading.tsx` was created, the behaviour observed, and the file
**deleted** the same minute; only the work-log entry survives it, so this is the observation
rather than a pasted console buffer:

| `src/app/stock-entry/loading.tsx` | `GET /stock-entry?month=banana`, signed in |
|---|---|
| absent — the shipped tree | **307**, with a `Location` header: the redirect the Server Component threw is the server's own answer |
| present | **200**, and **no** `Location` header: the shell had already flushed, so Next finished the 200 and redirected from the browser instead |

The unauthenticated `GET` stays 307 either way, because the **middleware** refuses it at the
edge before any Suspense boundary exists — which is why the degradation had to be shown on
AC-21's `?month=banana` redirect instead. `tests/unit/stock-entry-contract.test.ts:59` is the
shipped guard, and `git status --porcelain` confirms no `loading.tsx` is in the tree.

### Cheap checks on the tree being handed over

```
npm run typecheck                                  ->  exit 0
npx eslint tests/e2e/item-master-items.spec.ts     ->  exit 0
npx vitest run                                     ->  31 files, 378 tests, all passed
git status --porcelain -- Samples prisma           ->  empty
```

## Deviations from the spec

**One, and it is AC-3's vector.** AC-3 asks for the degradation to be proved on an
*unauthenticated* `GET /stock-entry/new` going from `307` to `200` once a `loading.tsx`
exists. That request cannot degrade: `src/middleware.ts` refuses it at the edge, before any
Suspense boundary is reached, so the criterion's own vector is impossible on this tree. The
same degradation was proved instead on AC-21's `?month=banana` redirect, which is a
server-component `redirect()` and therefore the shape the criterion is really about — `307`
with a `Location` header without the file, `200` with no `Location` and the calendar's HTML
with it. The transcript is in § AC-3 below. The rest of AC-3 — no `loading.tsx` at or above
`src/app/stock-entry/`, `src/app/(public)/loading.tsx` untouched, `/` still 200 — is met as
written. This is a fifth spec defect of the same family as the four found before
implementation began; it was found late, handled correctly, and this section said "None"
until #7's review pointed out that the AC-3 section already described a deviation.

Five things the spec was amended to say — four before implementation began, AC-33
during this session — are implemented as amended: February 2026 is 5 rows, the e2e cleanup
is scoped per reserved year, AC-24's 2026 literals live in `*.db.test.ts` with the browser
half in year 2093, `CountStatus` lives in `src/types/stock-count.ts`, and AC-33's polls are
gone.

Two choices made inside this session that a reviewer should see as choices:

1. **`deletableItem` is excluded from AC-33's presence check.** A later test in the same file
   deletes it; including it would make the first test depend on file order in a way that
   `fullyParallel: false` happens to satisfy today.
2. **The four-badge poll became a per-filter page load**, not one load. A single load can
   only compare the rows of the filter it is on, and AC-17 asks about all four.

## Notes for the reviewer

- **AC-29 and AC-30 are the only criteria this report does not close by itself.** Both are
  gate-level: the no-database run, and the full `init`. Everything they assert statically is
  in `tests/unit/stock-entry-contract.test.ts`; the runs are the coordinator's.
- **AC-33 touches a `done` feature's test file, and only that file.** No #6 source changed:
  `git diff --numstat` shows `tests/e2e/item-master-items.spec.ts` alone among #6's files, 59
  insertions and 41 deletions, and `src/server/items/item-service.ts` back at its shipped
  bytes after the mutation.
- **The `take: 50` mutation still fails.** That is why the floor was kept, and it is the one
  thing worth re-running before accepting AC-33.
- **The two-project split in `playwright.config.ts` is load-bearing**, not tidiness: #6's
  specs edit yard sheets and #7's specs count them, and a count started mid-run hides the
  *Delete* control 006 AC-12 asserts. Both failure modes were observed before the split.
- **`listSheet` is still the one definition of a yard sheet.** AC-14 widened its guard and
  role-shaped its return value through a thunk seam; there is no second sheet query, and the
  admin builder is provably never called for a staff actor (`sheet-shape.test.ts:56`).
- **Nothing unsafe is left in the tree.** Every mutation in this report was reverted and each
  revert re-verified: the `take: 50`, the `PREVIOUS_MONTH_THROUGH_DAY`, the `count-date`
  `dateTime`, and AC-3's `loading.tsx`.
- **#7 is left `in_progress`.** Marking it `done` is the reviewer's call, not mine.

## Review outcome

`progress/review_entry_start.md` — **CHANGES_REQUESTED**, two required changes, both about
tests. Nothing about the design moved, no migration, `prisma/` and `Samples/` untouched
(`git status --porcelain -- prisma Samples` empty). #7 is still `in_progress`.

### Required 1 — AC-13's atomicity clause, asserted about `startCount` itself

**The complaint was right.** The old test at `count-service.db.test.ts:241` built its own
`db.$transaction(...)` with a copy of the service's body and asserted Postgres rolled it
back. It proved Postgres. And the comment it carried — that the concurrency test covers
`startCount`'s own atomicity — does not hold: the loser of that race fails on
`tx.stockCount.create`, the **first** statement, so no line write is ever attempted and its
`82 lines and not 164` is exactly what a non-transactional implementation would produce.

**What replaces it** (`src/server/counts/count-service.db.test.ts`, test
`AC-13: startCount itself, failed at the LINE write, leaves zero counts`): a constraint no
`StockCountLine` insert can satisfy is added for the duration of ONE call —

```
ALTER TABLE "StockCountLine" ADD CONSTRAINT "tmp_ac13_line_write_fails" CHECK (false) NOT VALID
… await startCount(staff, { locationCode: "DUBLIN", countDate: "2026-09-01", period: "2026-09" }) …
ALTER TABLE "StockCountLine" DROP CONSTRAINT IF EXISTS "tmp_ac13_line_write_fails"
```

— so the real function gets past its guards, creates the count row, and fails on its
`createMany`, inside its own transaction. It is deterministic and mock-free
(`docs/verification.md`): no race decides it and no part of Prisma is stubbed.

Four details worth the reviewer's eye:

- **The drop is in a `finally`, and runs again before the add.** A surviving constraint
  would fail every line write on the test branch from then on, and `resetTestDb()` deletes
  rows, not DDL. The rejection is captured in a sentinel and asserted *after* the `finally`,
  so an assertion failure can never leave the constraint in place.
- **It asserts the failure reached the write**: the thrown error is none of
  `ValidationError`, `NotFoundError`, `ConflictError` — each of which returns before any row
  is created.
- **Non-vacuity**: the identical call succeeds once the constraint is gone (1 count, 82
  lines), so what failed was the line write and nothing before it.
- **The false comment is gone**, replaced by one that says plainly what the concurrency test
  does and does not prove.

**Mutation proof — the only thing that distinguishes this test from the one it replaces.**

1. Baseline, new test against the shipped service:

```
npm run test:db -- src/server/counts/count-service.db.test.ts -t "AC-13"

 ✓ src/server/counts/count-service.db.test.ts (40 tests | 36 skipped) 26187ms
   ✓ startCount pre-populates from listSheet > AC-13: startCount itself, failed at the LINE write, leaves zero counts  9427ms
   ✓ startCount pre-populates from listSheet > AC-13: a yard whose sheet is empty is refused before anything is written  5731ms
   ✓ startCount pre-populates from listSheet > AC-13: every item archived is the same refusal as no links at all  5768ms
   ✓ startCount pre-populates from listSheet > AC-13: an unknown locationCode is a NotFoundError naming the code, and writes nothing  5256ms

 Test Files  1 passed (1)
      Tests  4 passed | 36 skipped (40)
```

2. **The mutation the reviewer named**, applied to `src/server/counts/count-service.ts:313`:
   the `db.$transaction(async (tx) => …)` wrapper deleted and replaced by two sequential
   calls, `await db.stockCount.create(...)` then `await db.stockCountLine.createMany(...)`,
   returning `count.id`. `npm run typecheck` still exit 0 — the mutation is a compiling,
   plausible implementation, which is what makes it a fair test.

```
npm run test:db -- src/server/counts/count-service.db.test.ts -t "AC-13"

 FAIL  src/server/counts/count-service.db.test.ts > startCount pre-populates from listSheet > AC-13: startCount
itself, failed at the LINE write, leaves zero counts
AssertionError: expected 1 to be +0 // Object.is equality
- Expected
+ Received
- 0
+ 1
 ❯ src/server/counts/count-service.db.test.ts:311:50
    309|
    310|     // The count row WAS created inside the transaction, and went back…
    311|     expect(await db.stockCount.count({ where })).toBe(0);
       |                                                  ^
    312|     expect(await db.stockCount.count()).toBe(0);
    313|     expect(await db.stockCountLine.count()).toBe(0);

 Test Files  1 failed (1)
      Tests  1 failed | 3 passed | 36 skipped (40)
```

   The orphaned count row is exactly the defect AC-13 exists to forbid, and the other three
   AC-13 tests stayed green under the mutation — which is why this one had to be written.

3. **Restored and re-verified.** The service was put back from a byte copy taken before the
   mutation: `cmp <backup> src/server/counts/count-service.ts` → identical, and
   `grep -n 'db.$transaction' src/server/counts/count-service.ts` → `313:    return await db.$transaction(async (tx) => {`.

```
npm run test:db -- src/server/counts/count-service.db.test.ts

 Test Files  1 passed (1)
      Tests  40 passed (40)
   Duration  233.22s
```

   And once more at the end of the session, after observation 1 changed
   `src/server/counts/period.ts`:

```
npm run test:db -- src/server/counts/count-service.db.test.ts

 Test Files  1 passed (1)
      Tests  40 passed (40)
   Duration  242.76s
```

### Required 2 — AC-4's and AC-18's browser clauses

One new test, `tests/e2e/stock-entry-start.spec.ts` (reserved year 2093, Dublin, month 5 —
a yard and period no other test in the file uses):

`AC-4, AC-18: a cookie, a header, ?role=ADMIN and two forged form fields change neither the
row nor the shape`

Signed in as `YARD_STAFF`, it turns on **all four vectors at once**: `?role=ADMIN` on the
confirm URL, `x-user-role: ADMIN` via `page.setExtraHTTPHeaders`, a `role=ADMIN` cookie via
`context.addCookies`, and two hidden fields appended to the **live** form by
`page.evaluate` — `createdById=<a real ADMIN user's id>` and `role=ADMIN`. Then it clicks
`start-count`, which is the Server Action, and asserts:

- `createdByIdOf(countId) === staff.id`, and `!== admin.id` — the row belongs to the
  session, not to the id the form carried;
- `countIdFor("DUBLIN", 2093, 5) === countId` — one row, where it should be;
- `counting-as` reads `Counting as E2E Yard Staff`;
- `items-without-price` has count 0, and the response body contains no
  `no price recorded`, no `€`, no `E2E Administrator` and not the administrator's id.

**Two non-vacuity checks, because the whole test is worthless if the forged fields never
left the browser.** The injected field names are read back from the form
(`[...new FormData(form).keys()]` must contain `createdById` and `role`), and the Server
Action's own `POST` is captured with `page.waitForRequest` and its `postData()` asserted to
contain `createdById`, the administrator's id, and `role`. So the assertions above are about
the server ignoring the fields, not about the browser never having sent them. This is what
`stock-entry-access.spec.ts:220` could not do: a plain `request.post` to
`/stock-entry/new/confirm` is not the action, creates no row, and can assert nothing about
`createdById`. That older test is left as it is — it is AC-18's `GET` half plus a
"the route does not blow up" check, and it is still true.

```
npx playwright test tests/e2e/stock-entry-start.spec.ts --project=chromium-stock-entry --no-deps

  ok  7 [chromium-stock-entry] › stock-entry-start.spec.ts:249:5 › AC-4, AC-18: a cookie, a header, ?role=ADMIN and two forged form fields change neither the row nor the shape (3.6s)
  11 passed (50.2s)
```

After the wire-level assertions were added and `src/server/counts/period.ts` changed (see
below), the build was remade and both files that exercise the write were re-run:

```
npm run build                                                     ->  exit 0
npx playwright test tests/e2e/stock-entry-start.spec.ts \
    tests/e2e/stock-entry-refusals.spec.ts \
    --project=chromium-stock-entry --no-deps --workers=1

  ok 12 [chromium-stock-entry] › stock-entry-start.spec.ts:249:5 › AC-4, AC-18: a cookie, a header, ?role=ADMIN and two forged form fields change neither the row nor the shape (3.4s)
  16 passed (1.1m)
```

### Observations — what was done, and what was not

**Done.**

1. **The duplicate `isRealCalendarDate` is gone.** `src/server/counts/period.ts` defined its
   own copy while its comment claimed "one definition of 'a real calendar day' for the whole
   application". `parseCountDate` now parses with #6's `isoDateSchema` (`regex` +
   `.refine(isRealCalendarDate)`) from `@/server/items/item-master-input`, which
   `count-input.ts` already imports from, so no new dependency direction and no cycle. Same
   two rules, same `ValidationError("countDate", …)`, one definition. `period.test.ts` 18
   tests, `count-input.test.ts` 16, `stock-entry-contract.test.ts` 24 — 58 passed — plus the
   two e2e files above and the 40-test database file, all green afterwards. It also moves
   one of `count-input.ts`'s two parsers onto Zod, which is the direction observation 4 asks
   for.
2. **§ Deviations no longer says "None".** AC-3's substituted vector is recorded there as the
   deviation it is.
3. **`progress/current.md` says 33 criteria**, not 32.

**Not done, deliberately.**

4. **`stock-entry-refusals.spec.ts:199`'s conditional ADMIN assertion stays conditional.**
   The page renders `items-without-price` only when the number is non-zero, so making the
   assertion unconditional means controlling the data — either by writing an unpriced item
   into the user's development master, which AC-32 forbids this feature to touch, or by
   re-deriving "which items have no effective price" in a fixture, which is precisely the
   move required change 1 rejects. The direction that matters (a staff session never sees
   the sentence) is unconditional, and the exact `11` is pinned in
   `count-service.db.test.ts:744`. Recorded as a known weak spot rather than papered over.
5. **`count-input.ts` still has no Zod beyond `locationCodeSchema` and now `isoDateSchema`.**
   Rewriting the period and month parsers as schemas would change validation code the
   reviewer has just verified line by line, for a convention rather than a behaviour. It is
   a layer decision for the leader, and the natural moment is #8, which is the next thing to
   parse a count input. Flagged, not silently carried.
6. **`tests/unit/lint-fence.test.ts`'s cold-cache timeout is #6's file**, untouched by #7,
   and the hard rule is one feature per session. It is worth a `testTimeout` in whatever
   feature next touches it — recorded here so it is not lost.
7. **`dependencies: ["chromium"]` in `playwright.config.ts`** stands: the reviewer agrees the
   split is a correctness fix and asks for nothing today. The cost noted — a failure in the
   first project reports all four stock-entry files as "did not run" — is real and is the
   first thing to look at if the gate ever goes red there.

### Four test counts in § Files created were wrong, and are corrected

Checked against `vitest` rather than against memory this time:
`count-messages.test.ts` is **18**, not 19; `count-input.test.ts` **16**, not 19;
`count-shape.test.ts` **7**, not 8; `sheet-shape.test.ts` **8**, not 9. Every other figure in
that list matches (`period` 18, `calendar-month` 8, `yard-time` 6,
`role-shaped-sheet.db` 8, `count-service.db` 40, `stock-entry-contract` 24). No test was
removed to make those numbers true — they were overstated in the original report and are now
the numbers the runner prints.

### Line numbers in this report have been re-derived

Both edited test files grew, so every citation above them moved. The § Acceptance criteria
table has been renumbered against the files as they now stand — in
`count-service.db.test.ts` everything before the AC-13 test shifted by +16 (the two DDL
constants and the sentinel) and everything after it by +39; in
`tests/e2e/stock-entry-start.spec.ts` the four tests after the new one shifted by +88. The
review's own citations (`:241`, `:488`, `:705`, `:198`, `:220`) refer to the tree as the
reviewer read it and are left alone; the map above is how to follow them.

### State of the tree

```
npm run typecheck                                  ->  exit 0
npm run lint                                       ->  exit 0
git status --porcelain -- prisma Samples           ->  empty
```

Three files changed in this session and nothing else:
`src/server/counts/count-service.db.test.ts` (the AC-13 test and its comment),
`tests/e2e/stock-entry-start.spec.ts` (one new test),
`src/server/counts/period.ts` (observation 1). `src/server/counts/count-service.ts` is
byte-identical to its pre-session state, proved with `cmp` after the mutation was reverted.
The gate is the coordinator's run.
