# Implementation — feature 11 `analysis`

**Spec:** `specs/features/011-analysis.md` (approved at `c9b980c`, 27 criteria)
**Status:** COMPLETE. Phase A — the pure modules and the read service. Phase B — the page,
the four components, the two e2e specs and the identity-header fix. Both phases are written
up below, in order; Phase A's text is left exactly as it was handed over.

---

## Phase A

### What Phase A owns

Everything in the spec's *Services and pure modules* table, with its tests, plus the two
shipped assertions AC-26 and AC-10 force. Nothing under `src/app/analysis/**`,
`src/components/analysis/**` or `tests/e2e/**`.

## Files created

- `src/types/analysis.ts` — every shape #11 moves across a boundary, and no runtime.
- `src/lib/analysis-chart.ts` — pure integer layout: the seven constants and
  `buildTrendGeometry`.
- `src/lib/analysis-messages.ts` — every literal a criterion quotes, re-exporting #6's and
  #7's rather than restating them.
- `src/server/reporting/period-series.ts` — `previousPeriodKey`, `priorYearPeriodKey`,
  `periodWindow`, `comparePeriodKeys`. Pure, built on `@/server/counts/period`.
- `src/server/reporting/analysis-input.ts` — `parseAnalysisPeriodParam`,
  `parseBreakdownParam`, `DEFAULT_BREAKDOWN`, `analysisHref`. Pure, never throws.
- `src/server/reporting/analysis-service.ts` — `getAnalysis`, `listApprovedPeriods`,
  `analysisForRole`. Read only; the only module in this feature that names `db`.
- `src/lib/analysis-chart.test.ts` (19), `src/lib/analysis-messages.test.ts` (20),
  `src/server/reporting/period-series.test.ts` (18),
  `src/server/reporting/analysis-input.test.ts` (13),
  `src/server/reporting/analysis-service.test.ts` (6, spy thunks, no database).
- `src/server/reporting/analysis-service.db.test.ts` — 38 tests, the whole database half.
- `tests/unit/analysis-contract.test.ts` — 20 tests: Phase A's scan halves.

## Files modified

- `src/lib/money.ts` — `subtractDecimals` and `scaleToInteger` added (AC-10). `scaleToInteger`
  is `bigint` throughout, which is what lets AC-10 refuse the usual chart exemption.
- `src/lib/money.test.ts` — the new figures, **and** 009 AC-24's multiplication census
  amended from an exact list of two to an exact list of three. See *Deviations*.
- `tests/unit/project-contract.test.ts` — AC-26: the `unitPrice` list 11 → 12 files and the
  `unitPriceSnapshot` list 2 → 3, both as exact lists, each with the reason in its comment.
  The `signatureSvg` assertion is untouched at one file.
- `progress/current.md` — the Phase A plan and work log.

## Acceptance criteria

`P` = Phase A's half is satisfied here; `B` = the rest belongs to Phase B.

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | **B** — the page. Nothing in Phase A touches `auth-config.ts` or `middleware.ts`, asserted | `tests/unit/analysis-contract.test.ts` → "AC-25: the schema, the migrations and the truncate list are untouched" |
| AC-2 | `analysis-service.ts:analysisForRole`, `getAnalysis`, `listApprovedPeriods` | `analysis-service.test.ts` → "AC-2: for a YARD_STAFF actor the admin builder is called ZERO times" + 3 more. **B**: the `PROTECTED_PATHS` removal proof |
| AC-3 | **B** — no `loading.tsx` added; the degradation probe is a browser check | — |
| AC-4 | `getAnalysis`/`listApprovedPeriods` signatures; `assertRole` first; no writer anywhere | `analysis-contract.test.ts` → "AC-4: no create, update, upsert or delete…", "AC-4: `db.` appears in exactly one module"; `analysis-service.db.test.ts` → "AC-4: every row count is identical before and after…" |
| AC-5 | `yardFigureFor` — `count.status === APPROVED` and nothing else | `.db.test.ts` → "AC-5: a SUBMITTED yard is named, linked, and worth nothing"; "AC-5: DRAFT is the same answer…"; "AC-5: a SUBMITTED count contributes to no figure on the whole screen". **B**: the `€`-free yard cell |
| AC-6 | `periodFiguresFor` — `totalStock` null unless complete; `missingYardNames` | `.db.test.ts` → "AC-6: one yard approved, one absent…", "AC-6: THE CONVERSE — a complete period holding nothing is zero", "AC-6: an empty database is an empty shape"; `analysis-messages.test.ts` → "AC-6: one yard reads has, two yards read have". **B**: the rendered sentence |
| AC-7 | `sumDecimals` over exact line values; `formatFigure` rounds once | `.db.test.ts` → "AC-7: the three literal figures…" (`8880.919482378368`, `15.71775`, `8896.637232378368`), "AC-7: the total is the sum of the EXACT yards, not the sum of the rounded ones", "AC-7: the total is stored nowhere" |
| AC-8 | The absence: no query, no import, no string | `analysis-contract.test.ts` → "AC-8: none of the six names appears anywhere in the three trees", "AC-8: and no module of this feature imports the price-list module", "AC-8: the service selects the snapshot column…"; `.db.test.ts` → "AC-8: five operations, and the whole shape is deeply equal after each" |
| AC-9 | `unvaluedHeld: held && snapshot === null` | `.db.test.ts` → "AC-9: the count is 3 — the four zero-quantity unpriced lines are counted nowhere", "AC-9: the three lines contribute exactly nothing", "AC-9: a group whose only held lines are unpriced is NEVER omitted"; `analysis-messages.test.ts` → "AC-9: the plural and the singular…" |
| AC-10 | `money.ts`'s two new functions; the scan | `money.test.ts` → "011 AC-10: the four differences…", "the eight values the criterion names", "the whole module still uses no JavaScript number"; `analysis-contract.test.ts` → "AC-10: no Number(, no parseFloat, no toFixed and no Math.round — chart included" |
| AC-11 | `varianceAgainst`, `previousPeriodKey` | `period-series.test.ts` → "AC-11: January rolls back…"; `.db.test.ts` → the five MoM tests, including "AC-11: an incomplete comparand REFUSES and does not reach back to July" |
| AC-12 | `priorYearPeriodKey` | `period-series.test.ts` → "AC-12: the same month, one year back…", "AC-12: twelve steps back is never eleven"; `.db.test.ts` → "AC-12: year on year is (y-1, m) and never an ordinal walk" |
| AC-13 | `period-series.ts` | `period-series.test.ts` → the whole file, including "AC-13: the module defines no month arithmetic of its own" |
| AC-14 | `analysis-chart.ts`; the service's `trend` | `analysis-chart.test.ts` → 19 tests; `.db.test.ts` → "AC-14: thirteen points, oldest first…", "AC-14: the chart's numbers ARE the table's". **B**: the `<svg>`, the `data-*` attributes and the chart-vs-table tuple comparison in a browser |
| AC-15 | `breakdownFor` | `.db.test.ts` → the five breakdown tests, including "AC-15: the exact sums agree with the period total" and "AC-15: by supplier, name ascending, with No supplier LAST". **B**: the two links and `aria-current` |
| AC-16 | `analysis-input.ts`; `approvedPeriodKeysIn` | `analysis-input.test.ts` → 13 tests; `.db.test.ts` → the four navigation tests; `analysis-contract.test.ts` → "AC-16: parsePeriodKey is called nowhere in this feature". **B**: the links themselves and the `307` |
| AC-17 | The six money keys, by naming | `.db.test.ts` → "AC-17: exactly six money-shaped keys, as a set", "AC-17: and every euro-bearing field is one of those six"; `analysis-contract.test.ts` → "AC-17: there is no staff branch that returns an object" |
| AC-18 | `shapeForRole` from `actor.role` alone | `analysis-service.test.ts` → "AC-18: the choice comes from actor.role and from nothing else on the actor". **B**: the three request vectors |
| AC-19 | The import graph | `analysis-contract.test.ts` → "AC-19: nothing under the staff trees imports an analysis module", "AC-19: and there is no staff rendering of this screen". **B**: the `€` census over six routes |
| AC-20 | **B** — measured layout, and the identity header | — |
| AC-21 | The parsers never throw; the service throws only typed errors | `analysis-input.test.ts` → "AC-21: nothing a URL can carry makes it throw"; `analysis-contract.test.ts` → "AC-21: it throws only the typed domain errors"; `.db.test.ts` → "AC-21: a period far outside any data is the never-counted state, not an error" |
| AC-22 | `analysis-messages.ts` re-exports | `analysis-messages.test.ts` → "AC-22: the status record is the SAME OBJECT #7 built" + 3 more; `analysis-contract.test.ts` → "AC-22: the two src/lib modules import nothing from src/server", "AC-22: this feature ships no client component". **B**: the JavaScript-disabled run |
| AC-23 | Every Phase A test above runs with no database except the one `*.db.test.ts` | `npm run typecheck`, `npm run lint`, `npx vitest run src/lib src/server` all green; no module opens a connection at import time (`analysis-service.test.ts` imports the service and issues no query) |
| AC-24 | **B** — the e2e specs, `playwright.config.ts`, `RESERVED_YEAR` | — |
| AC-25 | Nothing outside this feature's files is touched | `analysis-contract.test.ts` → "AC-25: the schema, the migrations and the truncate list are untouched"; `git status --porcelain` below |
| AC-26 | `tests/unit/project-contract.test.ts` | → "011 AC-26 amending 009 AC-26: exactly twelve modules may name unitPrice", "…unitPriceSnapshot is named by exactly those three files" |
| AC-27 | **Done in full** — all six guarantees live in Phase A's code | See *Mutation proofs* below |

## Verification output

Targeted only — the coordinator runs `init` and the full suites.

```
$ npm run typecheck        -> exit 0
$ npm run lint             -> exit 0   (eslint src tests --max-warnings 0)
$ npx prisma validate      -> The schema at prisma\schema.prisma is valid

$ npx vitest run src/lib src/server
 Test Files  40 passed (40)
      Tests  581 passed (581)
   Duration  20.13s

$ npx vitest run tests/unit
 Test Files  1 failed | 12 passed (13)
      Tests  2 failed | 223 passed (225)
   ^ both failures are PRE-EXISTING; see "What I found that was not asked for"

$ npm run test:db -- src/server/reporting/analysis-service.db.test.ts
 Test Files  1 passed (1)
      Tests  38 passed (38)
   Duration  200.92s
```

Unit-test count: **698 → 804** (`581` under `src/` plus `223` under `tests/unit/`).

`git status --porcelain` at hand-back — eleven entries, and not one of them outside this
feature:

```
 M progress/current.md
 M src/lib/money.test.ts
 M src/lib/money.ts
 M tests/unit/project-contract.test.ts
?? src/lib/analysis-chart.test.ts
?? src/lib/analysis-chart.ts
?? src/lib/analysis-messages.test.ts
?? src/lib/analysis-messages.ts
?? src/server/reporting/
?? src/types/analysis.ts
?? tests/unit/analysis-contract.test.ts
```

`src/app/analysis/page.tsx` is untouched, including its overflowing identity header, which
Phase B fixes under AC-20.

## Mutation proofs (AC-27), all six

AC-27 names six guarantees; **every one of them lives in Phase A's code**, so all six were
done now rather than deferred. Baseline byte copies were taken first; both files were
restored afterwards and verified by `sha256sum`.

| # | Mutation | Test that went red | Exit |
|---|----------|--------------------|------|
| 1 | `yardFigureFor`: `status !== "DRAFT"` — a `SUBMITTED` count carries a euro | AC-5 × 3, incl. *"a SUBMITTED yard is named, linked, and worth nothing"* (`expected '0' to be null`) | 1 |
| 2 | `yardFigureFor`: `yardValue: … : "0"` — a missing yard renders as zero | AC-6 × 3, incl. *"one yard approved, one absent"* (`expected true to be false` — the period became complete) | 1 |
| 3 | `readValuedLines`: the price read from the price list in force on `countDate` | AC-8 *"five operations, and the whole shape is deeply equal after each"* — failed on the **first** operation, a price effective BEFORE `countDate` | 1 |
| 4 | `unvaluedHeld: snapshot === null` — zero-quantity unpriced lines counted | AC-9 × 2 (`expected 7 to be 3`) | 1 |
| 5 | Month on month walks back to the nearest complete period | AC-11 × 2: *"an incomplete comparand REFUSES and does not reach back to July"* (`expected 'COMPARABLE' to be 'AGAINST_INCOMPLETE'`) and *"no count at all for the comparand is a THIRD answer"* (`expected '2025-08' to be '2026-08'`) | 1 |
| 6 | `buildTrendGeometry`: an incomplete period drawn as a zero-height bar | AC-14 × 3, incl. *"an INCOMPLETE period gets no height at all, and no amount"* | 1 |

**AC-27 (3)'s recorded observation: `npm run typecheck` stayed exit `0` while the service was
reading last September's stock at today's prices.** The compiler had nothing to say about a
change that reintroduces the defect the entire product exists to fix. Only AC-8's five-way
database assertion caught it.

Restored, and verified:

```
1eec466b382583861454368dc6f934d0ab8a613664e10b1ca3dabc09cd2ba990  src/server/reporting/analysis-service.ts
49cd538508aedb6513cb5e7cc491778fa446a7040f34e542642d947bc32c676e  src/lib/analysis-chart.ts
```

Both hashes are identical to the pre-mutation baseline, and the tree is green again
(`analysis-chart.test.ts` 19/19; AC-8 passes).

**Mutation 5 is worth reading twice.** The fallback did not stop at July: with no count at
all for August it walked back to **2025-08**, and reported a thirteen-month movement labelled
*month on month*. That is `Summary!C9`'s defect, reproduced by three lines of plausible code.

---

## Deviations from the spec

1. **`analysisForRole` is a third export of `analysis-service.ts`.** The spec's module table
   lists two. AC-2 requires a spy-thunk test that passes thunks and counts calls, and a thunk
   cannot be spied through a closure — #9 solved this with `countForRole` in a separate module
   (`count-shape.ts`), which the spec's table does not list for #11. Adding a third export to
   the named module seemed the smaller deviation than adding an unlisted module. It is three
   lines and it is what `getAnalysis` actually calls.

2. **`TrendSlot.height` and `.y` are integer STRINGS, not numbers.** AC-14 says *"a point with
   the largest `totalStock` gets `height === TREND_PLOT_HEIGHT`"* and *"`height` equal to
   `TREND_PLOT_HEIGHT / 2`"*, which reads as a number. It cannot be one: `scaleToInteger`
   returns a string by AC-10's own contract, and turning it into a number needs `Number(`,
   `parseFloat` or unary `+` — the first two banned by name and the third the same thing
   wearing a hat. The tests assert `String(TREND_PLOT_HEIGHT)` and `String(TREND_PLOT_HEIGHT / 2)`;
   the division is in the test, never in the module. `x` and `centreX` stay numbers because
   they are positions derived from constants, and no euro passes through them.

3. **`src/lib/money.test.ts`'s multiplication census was amended.** 009 AC-24 pins every `*`
   in `money.ts` as an exact list of two lines. `scaleToInteger` adds a third
   (`const scaled = top * span;`). The list is now three, still exact, with the reason in the
   comment — amended, never loosened, the way AC-26 amends the permitted-module lists. The
   spec's *"everything else passes unmodified"* list does not name 009 AC-24, and AC-10
   requires the function that breaks it, so this is forced rather than chosen. **It is a
   shipped assertion the spec did not name, and the reviewer should confirm the amendment.**

4. **The service keeps its own `@db.Date` → `YYYY-MM-DD` one-liner** instead of importing
   `isoDateOf`, which four other services import. `isoDateOf` lives in
   `src/server/items/price-selection.ts` — the price list's own module. AC-8 asks for **no
   path** from this feature to the price list, and a static import is a path even when the
   function it reaches for cannot carry a price. `workbook-import-service.ts` already keeps
   its own copy of the same line, so this is the third and not a new habit. **The opposite
   call is defensible** — a pure `Date → string` adapter carries no price — and if the
   reviewer prefers one definition, the change is one import and one deletion, and AC-8's
   scan stays green either way (the module path contains none of the six forbidden names).
   I chose the absence because AC-8 is the spec's own "single most damaging thing".

5. **`listApprovedPeriods` and the two jumps count approved counts at ACTIVE yards only.**
   The shape's comment says *"at least one `APPROVED` count"*. A period whose only approved
   count belongs to a deactivated yard shows a grid of `Not counted` and no total, so a jump
   landing there is a dead end. Identical in the real database, where both yards are active.
   Named in the service's own comment.

6. **A period with zero active yards is `complete: false`, not vacuously true.** Invariant 7
   read literally makes "every active Location has an approved count" true when there are
   none, which would render `€0.00` for a product with no yards. Guarded, and commented.

7. **`parseAnalysisPeriodParam(undefined)` is `null`, exactly as AC-16 requires — so the PAGE
   must distinguish absent from unreadable.** AC-16 fixes the parser's answer for `undefined`
   at `null`; AC-21 requires the six unreadable values to `307` while no `?period` at all must
   render the latest approved period. The parser cannot tell Phase B which case it is in.
   **Phase B must write `if (raw !== undefined && parsed === null) redirect("/analysis")`**,
   and that is the whole of the difference. It is recorded here because a Phase B implementer
   reading only the parser would get it wrong.

8. **`analysisHref` writes `breakdown` even when it is the default.** #10's `stockTakesHref`
   omits its default because 010 AC-16 required the bare URL to be one the product produces;
   011 AC-16 requires the opposite — *every link carries the current `?period` and
   `?breakdown`* — so one rule covers every link and a browser test can assert it as one rule.

## What I found that was not asked for — and what the spec got wrong

### 1. Two shipped assertions are already red on a clean tree, and one of them is on 011's "passes unmodified" list

`tests/unit/stock-takes-contract.test.ts` → *"AC-22: the one shipped source file this feature
edits"*, both of its assertions:

- *"AC-22: CalendarGrid.tsx is the only changed file in #7's trees"* —
  `expected [] to deeply equal [ "src/components/stock-entry/CalendarGrid.tsx" ]`
- *"AC-21, AC-22: playwright.config.ts changed by exactly its two route patterns"* —
  `expected [] to have a length of 4 but got +0`

Both read the **working tree** (`git status --porcelain -- …`, `git diff -- playwright.config.ts`)
and expect #10's changes to be **uncommitted**. They passed while #10 was in flight and went
red the moment `b468f60 feat(#10): the history calendar` was committed. They are not mine:

```
$ git status --porcelain -- src/app/stock-entry src/components/stock-entry \
    src/lib/count-messages.ts src/server/counts src/lib/auth-config.ts \
    src/middleware.ts playwright.config.ts
(empty)
```

My eleven changed paths include none of those. **011's *"Everything else passes unmodified"*
list names 010 AC-22 explicitly**, and the spec's own instruction for that case is *"that is a
blocker to report in `progress/impl_analysis.md`, not a licence to edit it"* — so it is
reported and not touched. It will keep the gate red until the coordinator rules.

The general defect, which is worth more than this instance: **an assertion whose subject is
the working tree is an assertion that expires at the commit.** #9 and #10 both added several;
this class of test passes exactly once, during the session that wrote it. The durable spelling
is a diff against the feature's base commit, or a hash of the file's content.

### 2. My own doc comments broke my own AC-8 scan — twice

AC-8 scans the **raw** source, comments included (as 006 AC-31 does for `unitPrice`: *"in code
and in a comment alike"*). My service's module comment said *"no path from here to
`ItemPrice`"* and my `asIsoDate` comment named `@/server/items/price-selection` — both
explaining why the path is absent, both violating the rule they explained. The comments were
reworded; no assertion was loosened. This is the **fifth** recorded instance in this project
(#10 hit it three times, #9 once). It is now predictable enough to be a rule worth writing
down: *if a criterion bans a string, the comment explaining the ban cannot spell it either.*

### 3. The spec is right about `Number(` and it costs more than it looks

AC-10's ban on `Number(` under `src/server/reporting/**` has a consequence the spec does not
mention: **the service can never build a `{ periodYear, periodMonth }` filter**, because that
means turning `"2026-09"` into two integers, and `parsePeriodKey` — the one function that
would do it — is banned by AC-16. So there is no way to write
`where: { periodYear: 2026, periodMonth: 9 }` at all.

The service therefore reads **every** `StockCount` row for the active yards and derives each
row's period key from the integers **the database** supplied, through `formatPeriodKey`. That
is sound — `@@unique([locationId, periodYear, periodMonth])` caps the table at one row per
yard per month, a few hundred rows after a decade — and it makes four questions one query.
But it is a design the two criteria *forced*, not one anybody chose, and a reviewer should
know the table scan is deliberate. If `StockCount` ever grows a row per day, this is the line
that has to change, and the change needs an integer the reporting tree is not allowed to
compute.

### 4. `npm run test:db` gets 200 seconds longer

38 tests × (reset + fixture + 2–4 service calls) against a Neon branch in another region.
The first draft, using one `create` per row, took **358 s and dropped the connection twice**;
bulk `createMany` fixtures brought it to **201 s with no drops**. It is still the most
expensive file in the database suite (38 tests; `count-service.db.test.ts` has 40). If the
gate's wall-clock matters, the lever is merging tests that share a fixture — each merge saves
about 8 round trips — and I did not do it because one criterion per named test is the
convention and I would rather hand back the measurement than a quietly thinned suite.

### 5. Not a defect, but the reviewer should check it deliberately

`AnalysisForAdmin` is the first shape in this product that `assertNoMoneyKeys` is **not**
applied to, on purpose (AC-17). The only thing standing between it and a staff session is
`assertRole` plus `shapeForRole` — both asserted, neither typed. The staff thunk in
`getAnalysis` throws and is **unreachable** while `assertRole` stands above it; that is
deliberate defence in depth and is commented as such, but it is dead code by any static
reading, and a reviewer who wants it removed should say so rather than assume it was an
oversight.

## Notes for the reviewer

- **Where the boundary actually is.** `analysis-service.ts` is the only module in the feature
  that names `unitPriceSnapshot` (AC-26's twelfth/third file). Every euro leaves it on a field
  the *shape* declares — `yardValue`, `totalStock`, `againstTotal`, `varianceAmount`, `amount`
  — so Phase B's page and components can render money without naming the column, and 006
  AC-31's `src/app`/`src/components` half stays at the three item-master files.
- **Every mapper is field by field.** No shape is built by spreading a database row. #10
  proved the compiler catches the extra key only when the mapper is written out.
- **What Phase B inherits, concretely:** `getAnalysis(actor, { periodKey, breakdownKey })`
  returns everything the screen needs and the screen computes nothing —
  `previousApprovedPeriodKey` / `nextApprovedPeriodKey` for the jumps, `anyApprovedCountEver`
  for the empty state, `trend` for both the chart and its table, and `breakdown[].perYard` in
  `Location.sortOrder`. `buildTrendGeometry` returns `x`, `y`, `height`, `amount` and
  `centreX` ready to become attributes: the component needs no arithmetic of its own, which
  is what keeps AC-10's scan green over `src/components/analysis/**`.
- **`tests/unit/analysis-contract.test.ts` already scans `src/components/analysis`** (empty
  today) and `src/app/analysis` (the placeholder). Phase B's files fall under those scans the
  moment they are written — no `use client`, no `Number(`, no `db.`, no price-list name, no
  `YARD_STAFF` — so Phase B should expect them to bite rather than add new ones.
- **The database was left clean.** Every test resets in `beforeEach`; the run touched
  `TEST_DATABASE_URL` only, and the development database was never opened.

---

## Phase B

**Status:** complete — the page, the four components, the two e2e specs, the identity-header
fix and the `RESERVED_YEAR` / `playwright.config.ts` / census amendments AC-24 forces.

Phase A's modules were treated as gated: nothing under `src/server/reporting/**`,
`src/lib/analysis-*` or `src/lib/money.ts` was edited, and where one of them could not do
what a criterion asked, it is **reported below** rather than changed.

## Files created

- `src/components/analysis/PeriodGrid.tsx` — the per-yard cells and the total, as siblings
  in one box so AC-20's stacking is measurable; renders `Not counted` / `Draft` /
  `Submitted` where there is no figure, and the missing-yard sentence beneath.
- `src/components/analysis/VariancePanel.tsx` — one element always carries the answer: a
  signed figure, or the sentence naming why there is none.
- `src/components/analysis/TrendChart.tsx` — the inline `<svg>` AND the table beside it,
  both mapped from ONE `buildTrendGeometry` call, so the two cannot disagree.
- `src/components/analysis/BreakdownTable.tsx` — the two grouping links and the table, per
  yard in `Location.sortOrder` and together.
- `tests/e2e/support/analysis.ts` — the fixture builders. A new module rather than an edit
  to `tests/e2e/support/stock-entry.ts`, exactly as #10 added `support/stock-takes.ts`.
- `tests/e2e/analysis-access.spec.ts` — 12 tests: the route, the role, the query string,
  the euro census, the no-JavaScript run and the phone measurements. Owns year **2103**.
- `tests/e2e/analysis-figures.spec.ts` — 13 tests: the figures, the disclosure, the two
  variances, the chart, the breakdown and the navigation. Owns years **2104 and 2105**.

## Files modified

- `src/app/analysis/page.tsx` — **replaced**, not created (so 010 AC-20's derived
  `force-dynamic` census stays at 18 and the derived `loading.tsx` directory set is
  unchanged). Keeps #3's `<h1>Analysis</h1>`, `signed-in-email` and `sign-out` verbatim,
  and adds `break-words` to the identity header (AC-20 — see the transcript below).
- `playwright.config.ts` — the two route patterns, and nothing else:
  `git diff --unified=0` reports exactly **4** changed lines.
- `tests/e2e/support/stock-entry.ts` — `RESERVED_YEAR` gains `analysisAccess: 2103`,
  `analysisPrior: 2104`, `analysisFigures: 2105`, and the one-year-per-file note becomes
  one-or-two. Nothing else.
- `tests/unit/stock-entry-contract.test.ts` — the reserved-year census now reads **every**
  `RESERVED_YEAR.<key>` per file instead of the first; its invariant becomes *no year key
  is named by two different spec files*; its equalities become **14** spec files and **15**
  distinct year keys; the two project patterns gain `analysis`.
- `tests/unit/analysis-contract.test.ts` — two clauses added, both **absence** assertions,
  which is the direction that survives a commit: AC-25's porcelain list widened to the
  seven screen trees the criterion names, and AC-14's *no charting library was added*.
- `progress/current.md` — the Phase B plan and work log.

## Acceptance criteria

`A` = Phase A satisfied it; the rest is Phase B's half.

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | `page.tsx:125` `requireAdminPage("analysis")`; the heading, the two identity test ids and the `<h2>` | `analysis-access.spec.ts` → "AC-1: a signed-out GET is a 307…", "AC-1, AC-2: a YARD_STAFF GET is refused…", "AC-1: an ADMIN gets 200, the heading…" |
| AC-2 | The refusal is `assertRole`'s, above the middleware | **Mutation proof below** — `PROTECTED_PATHS` without `/analysis`, rebuilt, still `307`; plus Phase A's spy thunks |
| AC-3 | No `loading.tsx` anywhere on the path | **Degradation proof below** — `200` with no `Location` when one is added; `tests/unit/stock-entry-contract.test.ts` → the derived census, unmodified |
| AC-4 | The page calls two read functions and nothing else | `analysis-access.spec.ts` → "AC-4: reading this screen writes nothing"; `analysis-contract.test.ts` → the writer scan, now over the component tree too |
| AC-5 | `PeriodGrid.tsx:101` — the status word is the link, and there is no figure without an approved count | `analysis-figures.spec.ts` → "AC-5: a SUBMITTED yard is named and linked, and is worth nothing anywhere" |
| AC-6 | `PeriodGrid.tsx:137` `NOT_COUNTED` for an absent total; `page.tsx:264` the empty state | `analysis-figures.spec.ts` → "AC-6: a complete period holding nothing renders €0.00…"; `analysis-access.spec.ts` → "AC-6: the incomplete period names the yard…", "AC-6: the page follows the database into the empty state, or out of it" **(conditional — see the findings)** |
| AC-7 | `formatFigure` in the three components, and nowhere else | `analysis-figures.spec.ts` → "AC-7: every rendered figure is the sum of the rows this file seeded" |
| AC-8 | The page and the components name none of the six | `analysis-contract.test.ts` → the AC-8 scans, which now read `src/components/analysis` |
| AC-9 | `PeriodGrid.tsx:118` and `:141`, `BreakdownTable.tsx:128` | `analysis-figures.spec.ts` → "AC-9: the unvalued-line sentence, both numbers of it, and the route to the names" |
| AC-10 | No arithmetic in any Phase B file | `analysis-contract.test.ts` → "AC-10: no Number(, no parseFloat, no toFixed and no Math.round — chart included", now over four more files |
| AC-11 | `VariancePanel.tsx:37` `varianceText` | `analysis-figures.spec.ts` → "AC-11, AC-12: month on month rises, year on year falls…", "AC-11: the three refusals name the reason and never reach further back", "AC-11: the rendered variance is exactly the difference of the two totals" |
| AC-12 | The same panel, fed `yearOnYear` | `analysis-figures.spec.ts` → the `data-against-period` assertions, and the chart's leftmost point |
| AC-13 | **A** | — |
| AC-14 | `TrendChart.tsx` — one `buildTrendGeometry` call feeding both the bars and the rows | `analysis-figures.spec.ts` → "AC-14: the chart is thirteen assertable slots and cannot disagree with its table"; `analysis-contract.test.ts` → "AC-14: no charting library was added…" |
| AC-15 | `BreakdownTable.tsx` | `analysis-figures.spec.ts` → "AC-15: the breakdown groups by type and by supplier…", "AC-15: an incomplete period keeps the per-yard figures and loses the row total" |
| AC-16 | `page.tsx:130-149` (the two parsers, the two redirects, the default), `analysisHref` on every link | `analysis-figures.spec.ts` → the three AC-16 tests; `analysis-access.spec.ts` → "AC-21: six unreadable parameters redirect…" |
| AC-17 | **A** | — |
| AC-18 | The role comes from the session and from nothing else | `analysis-access.spec.ts` → "AC-18: a query parameter, a header and a cookie cannot change the role" |
| AC-19 | The euro is on `/analysis` and on no other route this feature can reach | `analysis-access.spec.ts` → "AC-19: /analysis carries the euro and the five money-free routes still do not"; `analysis-contract.test.ts` → the import-graph scan |
| AC-20 | `page.tsx:205` `break-words`; the flex column/row grid | `analysis-access.spec.ts` → "AC-20: the screen never scrolls sideways at 390 px or 320 px, in any state", "AC-20: and the grid is a ROW on the desktop…" — **red before the fix, green after; transcript below** |
| AC-21 | The page throws for no query string | `analysis-access.spec.ts` → "AC-21: six unreadable parameters redirect, and no database string reaches the screen" |
| AC-22 | No `"use client"`, no form, no `fetch` | `analysis-access.spec.ts` → "AC-22: with JavaScript disabled the screen renders and every control navigates"; `analysis-contract.test.ts` → "AC-22: this feature ships no client component" |
| AC-23 | `npm run build` green; no module opens a connection at import time | The build ran clean before every e2e run below. **The no-DNS variant was not re-run — that is `init`'s, and the coordinator runs the gate.** |
| AC-24 | `playwright.config.ts`, `RESERVED_YEAR`, the census | `tests/unit/stock-entry-contract.test.ts` → "AC-30, 011 AC-24: no reserved year is named by two spec files"; the full e2e run below |
| AC-25 | Nothing outside the permitted list is touched | `analysis-contract.test.ts` → "AC-25: the schema, the migrations and the truncate list are untouched", now covering the seven screen trees as well |
| AC-26 | **A** | — |
| AC-27 | **A — all six, in Phase A**, because every guarantee it names lives in Phase A's code | See Phase A's table |

## Verification output

Targeted only — the coordinator runs `init` and the full gate.

```
$ npm run typecheck                                        -> exit 0
$ npm run lint                                             -> exit 0
$ npm run test:unit
 Test Files  54 passed (54)
      Tests  809 passed (809)

$ npm run test:e2e -- --project=chromium-stock-entry --no-deps \
      tests/e2e/analysis-access.spec.ts tests/e2e/analysis-figures.spec.ts
  25 passed (54.0s)$ npm run test:e2e -- --project=chromium-stock-entry --no-deps     # ALL FOURTEEN FILES
  136 passed (4.0m)                                                # exit 0, 0 flaky

$ npm run test:e2e                                                 # the whole gate
  1 failed | 136 did not run | 55 passed
  ^ the failure is `item-master-yards.spec.ts` on ORPHANED FIXTURE ROWS in the development
    database, left by an earlier aborted run. Not this feature's, not this feature's tests,
    and it stops the second project from running at all. Diagnosed below; NOT repaired.
```

The 136-test run is the one that matters for this feature: it is every spec file that shares
the count tables with `/analysis`, at three workers, `retries: 0`, with both of this
feature's specs seeding and deleting inside it. **0 failed, 0 flaky, exit 0.**

Unit-test count: **808 → 809** (the one clause AC-14 gains; AC-25's is a widened list, not
a new test). E2E: **25 new tests**, in two files.

## AC-20 — the identity header, both ways round

**The test landed first and the page was left unfixed**, exactly as the criterion requires.

### Red, against the unfixed `text-base text-slate-700`

```
Running 1 test using 1 worker
  x  1 [chromium-stock-entry] › analysis-access.spec.ts:457:5 › AC-20: the screen never
        scrolls sideways at 390 px or 320 px, in any state (6.4s)

    Error: 390 /analysis?period=2103-12&breakdown=type
    expect(received).toBeLessThanOrEqual(expected)
    Expected: <= 390
    Received:    478
  1 failed
```

**88 px of sideways scroll at the WIDER viewport**, on the first measurement the test takes.
010's `/stock-takes` measured 424 against 390 — 34 px — at `text-sm`. This page is worse by
54 px for the same email, which is the criterion's own prediction confirmed.

### The measurement, by a temporary probe that was removed and verified gone

The probe replaced the text of `data-testid="signed-in-email"` in place and re-read
`document.documentElement.scrollWidth`, so every figure is this element, this page, this
stylesheet — not an estimate:

```
PROBE 390 real scrollWidth=478 client=390 emailLen=99
PROBE 390 control(an ordinary hyphenated fixture email) scrollWidth=390
PROBE 390 sweep 30:390 … 50:390 51:393 52:400 53:408 54:415 55:422 56:430 57:437 58:444
                59:452 60:459 61:466 62:474 63:481 … 70:532
PROBE 320 real scrollWidth=478 client=320 emailLen=99
PROBE 320 control(an ordinary hyphenated fixture email) scrollWidth=320
PROBE 320 sweep 30:320 … 41:320 42:327 43:334 44:342 45:349 46:356 47:364 48:371 49:378
                50:386 51:393 … 70:532
```

Three things worth keeping:

1. **The break-even label at `text-base` is 51 characters at 390 px and 42 at 320 px.** The
   unbreakable token is the label plus the hyphen after it, so those are runs of 52 and 43.
   The slope is `(532 − 466) / (70 − 61)` = **7.33 px per character** by the endpoints and
   **7.14** by `(sw − 24) / (label + 1)` at every sampled point — against 010's measured
   **6.6** at `text-sm`. Wider text, shorter break-even: 51 here, 56 there.
2. **The control fitted exactly.** An ordinary hyphenated fixture email measured 390 at 390
   and 320 at 320 — to the pixel, on the same page, with the grid, the chart, the thirteen
   trend rows and the four-column breakdown all rendered. So the 478 is the header and
   nothing else, and every other part of this screen already fits a 320 px phone.
3. **A 40-character label would have passed**, and so would a 45 — the numbers 010's sixth
   amendment corrected. At 390 px nothing below 51 moves the document at all.

The shipped guard is `/^[a-z0-9]{51,}$/` — **the measured figure for this page**, with the
arithmetic beside it — while the label actually used is 61, for margin against a machine
whose font is a shade narrower.

### Green, after `break-words`

```
  ok 10 [chromium-stock-entry] › AC-20: the screen never scrolls sideways at 390 px or
        320 px, in any state (5.9s)
  ok 11 [chromium-stock-entry] › AC-20: and the grid is a ROW on the desktop, so the
        stacking above means something (1.7s)
  … 25 passed
```

The fix is twelve characters, in one class attribute, and it is the **third** instance of
this defect. `/stock-entry` is **not** fixed here and remains a recorded debt against 008
AC-30 — and it is now guarded: AC-25's porcelain assertion covers `src/app/stock-entry/**`,
so a future implementer who reaches in to "just fix it" turns this feature's own test red.

## AC-2 — the refusal without the middleware entry

`"/analysis"` removed from `PROTECTED_PATHS` in `src/lib/auth-config.ts`, `next build` run,
the suite served from that build:

```
  ok 1 [chromium-stock-entry] › AC-1, AC-2: a YARD_STAFF GET is refused by the service and
        sends no part of the body (2.9s)
  1 passed
```

That test asserts `307`, `Location: /stock-entry?denied=analysis`, no `period-heading`, no
`trend-chart`, no `total-stock` and no `€` in the body. **All of it still held with the
middleware entry gone**, which is the criterion: the refusal is the service's.

Restored, and verified:

```
bf902c9831088a3f8106f5aeca078ebdbc5d3b94c8522c0e931b5a11aa973f3b  src/lib/auth-config.ts
$ git status --porcelain -- src/lib/auth-config.ts
(empty)
```

The hash is identical to the pre-mutation baseline.

## AC-3 — the degradation, on the request that can actually degrade

`src/app/analysis/loading.tsx` added, `next build` run, the **`YARD_STAFF`** request made:

```
PROBE status=200 location=(none) bodyLen=5048
```

In the shipped tree the same request is `307` with `Location: /stock-entry?denied=analysis`
and no page body at all. **A Suspense boundary above this page turns the role refusal into a
`200` carrying a shell** — the sixth time this project has reproduced it, and the first on
the route where the request that degrades is the refusal itself rather than a query-string
redirect.

`src/app/analysis/` now holds `page.tsx` and nothing else; the probe test was removed and
`grep -c PROBE tests/e2e/analysis-access.spec.ts` is `0`.

## Mutation proofs and restores

| # | File | What was done | Restore verified |
|---|------|---------------|------------------|
| 1 | `src/lib/auth-config.ts` | `"/analysis"` removed from `PROTECTED_PATHS`, rebuilt, AC-2 re-run | sha256 `bf902c98…` identical; porcelain empty |
| 2 | `src/app/analysis/loading.tsx` | created, rebuilt, the staff refusal measured | file deleted; the directory holds only `page.tsx` |
| 3 | `tests/e2e/analysis-access.spec.ts` | two temporary probe tests appended, run, removed | sha256 `3e89e57a…` identical to the byte copy taken first, `diff` clean |
| 4 | `src/app/analysis/page.tsx` | the AC-20 measurement run against the unfixed header | not a mutation — the fix landed after the measurement, which is the order the criterion requires |

## Deviations from the spec

1. **Every link into a count carries `?period` and `?breakdown`, including the one AC-9
   quotes as a bare path.** AC-16 states one rule — *every link the page renders … carries
   the current `?period` and `?breakdown`* — and names *every link into a count* inside it;
   AC-9 quotes the unvalued-lines anchor's `href` as
   `/stock-entry/counts/<id>/summary` with no query. The two cannot both be literal. I took
   AC-16's one rule, because that is the rule `analysisHref`'s deliberate
   write-the-default-too behaviour exists to make assertable (Phase A's deviation 8), and
   because a link that silently drops the reading state is the bug the criterion is for.
   **The e2e asserts both halves separately**: the `pathname` is exactly
   `/stock-entry/counts/<the Dublin count id>/summary`, and the two parameters are asserted
   as parameters. Nothing is weaker; one criterion's punctuation is.

2. **An absent figure renders `Not counted`, everywhere, rather than a blank or a dash.**
   The spec fixes this for a yard cell and for the trend's gap marker; for the period total
   and the breakdown row total it says only *no `€`*. One mechanism, one literal — #7's
   `NOT_COUNTED`, re-exported by `analysis-messages.ts` — because every absence on this
   screen has the same cause, and because an em dash would have been a new user-facing
   string in a feature whose messages module Phase B may not edit. The `period-incomplete`
   sentence sits directly beneath the total and names the yards.

3. **`data-testid="total-stock"` is the total CELL, not a bare figure element**, so it
   contains `Total stock`, the figure, and the unvalued sentence when there is one. **AC-20
   forces this**: it measures the left edge of every `yard-cell-*` against the left edge of
   `total-stock` and allows 4 px, and a figure element nested inside a padded cell can never
   share a left edge with the cell beside it — the padding alone is 12 px. Making the total
   a sibling cell of the yard cells is the only layout in which that measurement means
   *stacked*. The e2e therefore uses `toContainText` for AC-7's figures, and `not.toContain`
   for AC-6's euro census, which is unaffected.

4. **AC-18's administrator half compares `<main>.outerHTML`, not the whole response.** See
   the findings — this is a framework fact, not a choice about what to assert.

5. **`test.setTimeout(180_000)` in `analysis-figures.spec.ts`'s `beforeAll`.** Eleven counts
   are submitted and approved through the real lifecycle service against a database in
   another region. It is the HOOK's budget: `playwright.config.ts`'s `timeout: 45_000`,
   `expect: { timeout: 10_000 }`, `workers: 3`, `retries: 0` and `fullyParallel: false` are
   byte-identical and no test gets a second longer than any other test in the suite. AC-24
   forbids raising the config's numbers, and none was raised.

6. **Two `<title>` strings inside the chart are composed in the component** —
   `` `${periodLabel}: ${formatFigure(amount)}` `` and `` `${periodLabel}: ${NOT_COUNTED}` ``.
   Both are built from literals `analysis-messages.ts` already owns; neither is quoted by any
   criterion. They are composed rather than exported because **Phase A owns that module and it
   is gated**, and adding an export to it was out of scope for this phase. If the reviewer
   wants them single-sourced, it is two exports and two imports.

7. **The AC-20 guard is 51, not 010's 56.** 56 is `/stock-takes`'s break-even at `text-sm`;
   51 is this page's at `text-base`, measured here. The criterion says to guard at the
   measured figure, and the measurement had to be this page's own.

## What I could not verify, and why

**The empty state cannot be reached from the e2e suite, and it is not a fixture problem.**
*No `APPROVED` count anywhere in the database* is a fact about the whole database. The suite
runs against the DEVELOPMENT database with three workers and fourteen spec files, several of
which approve counts in their own reserved years — including both of this feature's. No spec
can create that state and none can wait for it.

So `analysis-access.spec.ts` → *"AC-6: the page follows the database into the empty state, or
out of it"* asks the database first and asserts **the branch the database actually puts the
page in**: with no approved count it asserts the whole of AC-6's empty state, `€` census
included; with some, it asserts the grid renders and the empty state does not. That is always
a real assertion about this page's branching, and on a clean database it is the criterion in
full. **In the gate it will take the non-empty branch.**

> **Correction (repair pass, 2026-09-24):** the sentence above, "on a clean database it is the
> criterion in full", was false. The same file's `beforeAll` approves three counts before any
> of its tests runs, so the asserting branch could not execute on any database, clean or not
> (review finding B1). That branch has been deleted. The page half of the empty state is now
> proved by `src/app/analysis/page.test.ts` (see *Repair pass*).

The shape half — `anyApprovedCountEver` false on an empty database, and the whole shape empty
— is proved unconditionally in Phase A's `analysis-service.db.test.ts`
(*"AC-6: an empty database is an empty shape"*), which truncates and owns its rows.

Consequently **AC-20's five measured states are: no query, `?breakdown=supplier`, a complete
period, an incomplete one, and `?period=1999-01`** — the never-counted-period state, which is
the nearest state to "empty" that a browser can be put into here. The document does not scroll
sideways in any of them at either width.

> **Correction (repair pass, 2026-09-24):** `?period=1999-01` is the never-counted *period*,
> not the empty state, and it is measured as itself. AC-20 (amended) records the empty state
> as not measurable in the browser, because the shared e2e database is never empty.

**The no-DNS run of AC-23 was not repeated.** It is `init`'s, the coordinator runs the gate,
and nothing Phase B adds opens a connection at import time.

## What I found that was not asked for — and what the spec got wrong

### 1. AC-18's "the rendered body is byte-identical" cannot be asserted on the response

Next echoes the **request URL** into its own RSC flight payload — a `<script>` that is a
sibling of `<main>` — so two responses to `/analysis?period=X&breakdown=type` and to the same
URL plus `&role=YARD_STAFF` differ by construction, no matter what the page renders. The first
run of the test failed on exactly that and nothing else:

```
Expected: …"c":["","analysis?period=2103-12&breakdown=type"]…
Received: …"c":["","analysis?period=2103-12&breakdown=type&role=YARD_STAFF"]…
```

— one difference, at character 17120, inside `self.__next_f.push`. Every byte of `<main>` was
identical.

The shipped test compares `document.querySelector("main").outerHTML`, which is the criterion's
own words — *the rendered body* — and is **stronger** than a normalised whole-document
comparison, because nothing is normalised away. **This is a general fact about every
"byte-identical body" criterion in this project on a query-string vector**; 010 AC-13's
equality is on `stock-takes-body`'s `innerHTML` and is already on the right side of it.

### 2. The user's master contains items with no price — and it broke the fixture, correctly

`analysis-figures.spec.ts` first built its counts from arbitrary items on each yard's sheet.
AC-9's *"with zero such lines the element is absent entirely"* then failed:

```
expect(locator).toHaveCount(0) failed
Expected: 0   Received: 1
> 271 | await expect(page.getByTestId("yard-cell-DUBLIN").getByTestId("unvalued-lines"))
```

The period it asserted on had an unvalued held line the fixture never created. **The item is
the master's**: `submitCount` wrote a null snapshot because the item has no `ItemPrice` at
all. That is `Dublin!AH25`'s defect alive in the real data — the thing Invariant 4 and this
feature's disclosure exist for — and it is the strongest evidence available that AC-9 is not
theoretical.

Two consequences, both shipped:

- `pickSheetItems` now returns **only items with at least one price**, so
  `clearPriceSnapshots` is the *only* source of an unpriced line and `3 held lines have no
  price` is exactly what the fixture asked for rather than what the master happened to hold.
- The *absent* case is asserted on the **all-zero period** instead, where nothing is held and
  so nothing can be a held line without a price — true whatever the master contains.

**The general rule this is an instance of:** a criterion that asserts *zero of something* over
the user's own data is asserting about their data. #7's start spec and #8 both recorded the
positive form of this; this is the negative form, and it is the one that fails.

### 3. AC-16's "every link carries the current `?period`" is not true of the period jumps

*Previous period* and *Next period* carry their **target** period — that is what they are.
The first draft of the one-rule test asserted the current period on every anchor and failed on
the jump, correctly:

```
Error: /analysis?period=2105-08&breakdown=supplier
Expected: "2105-09"   Received: "2105-08"
```

The shipped rule is the one the criterion was reaching for and is still a single rule: **every
link carries both parameters**; what each carries depends on what the link is for — a jump
carries its target period and the current grouping, a breakdown link carries the current
period and its target grouping, and everything else carries both current. All three are
asserted, and the test also asserts the two jumps really do differ from the current period, so
the exclusion cannot swallow a link that had simply lost it.

### 4. The default-period criterion depends on a sibling fixture's status

AC-16's *opens on the latest period holding an approved count* is assertable in a browser only
because `analysis-figures.spec.ts` owns the two **highest** reserved years and because
`tests/e2e/support/item-master.ts`'s `periodYear: 2999` count is a **DRAFT**. If a future
feature ever approves that fixture, 2999 becomes the latest approved period in the development
database and this criterion's browser half fails for a reason that has nothing to do with
`/analysis`. Recorded here rather than left to be discovered; the spec does not mention it.

### 5. AC-20's 44 x 44 rule exempts the one link that leads to the item names

*Every control the flow touches … has a bounding box of at least 44 × 44, except links inside
a sentence.* The unvalued-lines anchor **is** a link inside a sentence and is exempt, which is
right — but it is also the only link on the screen that leads to the item names, so on a phone
it is the smallest tap target on the page. Not a defect against the criterion, and worth a
look from the reviewer: the exemption is the spec's, the consequence is a 14 px underline.


### 6. THE GATE IS BLOCKED BY ORPHANED FIXTURE ROWS IN THE DEVELOPMENT DATABASE — not by this feature

A full `npm run test:e2e` **stops in the first project**, on a spec this feature never
touches, and takes all 136 tests of the second project down with it:

```
  x   39 [chromium] › item-master-yards.spec.ts:347:5 › AC-26, AC-27: item types are
        created, reordered and refused readably, and never archived (15.1s)

    Locator:  locator('[data-type-code="UPPER_TYPE_E2E-E86BD327CF00"]')
                .getByTestId('type-sort-order')
    Expected: "9000"
    Received: "9001"

  1 failed
  136 did not run
  55 passed (1.5m)
```

`chromium-stock-entry` declares `dependencies: ["chromium"]`, so a failure in the first
project means **the second one never runs at all** — every stock-entry, stock-takes and
analysis spec, including all 25 of this feature's.

**The cause is debris, and it is identifiable.** A read-only query of the development
database:

```
itemTypes matching E2E:
  BEADS_E2E-D6532408EDF9        sortOrder 20
  YARD_TYPE_E2E-A9B9C08BB514    sortOrder 23
  UPPER_TYPE_E2E-A9B9C08BB514   sortOrder 9001
  LOWER_TYPE_E2E-A9B9C08BB514   sortOrder 9001
suppliers matching "e2e-": 2      items matching "e2e-": 4
stockCount rows by year: [{ periodYear: 2095, count: 1 }]
```

Two run suffixes, `A9B9C08BB514` and `D6532408EDF9`, neither of them this session's. They
are `tests/e2e/support/item-master.ts`'s own fixture rows, left behind by a run that died
before `cleanUp` — consistent with the three aborted gate runs the brief describes.

**Why they break that test specifically.** `item-master-yards.spec.ts` seeds two types at
`typeBand(parallelIndex)` and `band + 1` — 9000 and 9001 for worker 0 — and its own comment
says why: *"Two types this run owns, at two CONSECUTIVE positions, so 'move the lower one up'
can only ever swap it with the upper one."* Two orphans **already sit at 9001**, inside that
band, so the precondition is false: the swap no longer has a unique neighbour and the row
renders 9001 where the test requires 9000.

**Reported, not repaired.** These are not my feature's rows and deleting rows from the user's
development database is not a workaround I am willing to improvise. The remedy is one
statement, and it is the one `cleanUp` would have run:

```sql
DELETE FROM "ItemType" WHERE code LIKE '%\_E2E-%';   -- the four above; none is a real type
DELETE FROM "Item"     WHERE description LIKE '%e2e-%';
DELETE FROM "Supplier" WHERE name LIKE '%e2e-%';
```

(`Item` before `Supplier`, and `ItemPrice` / `ItemLocation` cascade from `Item`.)

**The `StockCount` orphan needs nothing.** Year 2095 is `RESERVED_YEAR.quantities`, and
`stock-entry-quantities.spec.ts` calls `clearReservedYear(2095)` in its own `beforeAll` —
which is exactly the design 007 AC-30 chose so that a crashed run cannot poison the next one.
**The item-master fixture has no equivalent**, because its rows are keyed by a per-run random
suffix rather than by a reserved range, so nothing can recognise a previous run's rows as
sweepable. That is the general defect, and it is worth more than this instance: *a fixture
that can only be cleaned by the process that created it cannot be cleaned by the process that
finds it.*

**What I ran instead, and what it proves.** The second project, alone, at three workers, with
`--no-deps` — every spec that shares the count tables with this feature, including its two:

```
$ npm run test:e2e -- --project=chromium-stock-entry --no-deps
```

The result is below. It does not discharge AC-24's *two consecutive full runs report 0 flaky
and 0 failed* — that needs the orphans gone — and I am not claiming it does.

## Notes for the reviewer

- **Nothing under `src/server/reporting/**`, `src/lib/analysis-*` or `src/lib/money.ts` was
  touched.** `git diff --stat` shows `src/lib/money.ts` and `money.test.ts` as modified, and
  both of those are **Phase A's** uncommitted changes, not Phase B's.
- **The screen really does compute nothing.** There is no `+`, no `sum`, no comparison of two
  euros and no `Number(` in `src/app/analysis/**` or `src/components/analysis/**`. The only
  transformation applied to a figure anywhere in Phase B is `formatFigure`, which is
  `formatPriceExact(roundHalfUp(v, 2))` from `analysis-messages.ts`.
- **The chart and its table are one `buildTrendGeometry` call.** That is what makes AC-14's
  tuple equality a real assertion rather than a coincidence: two `.map`s over one array cannot
  disagree. If a later change splits them, the equality will still pass the day it is written
  and fail the day the two drift — so keep the single call.
- **The four-column breakdown does not fit a 320 px phone, and it is not supposed to.** Both
  tables sit in a `w-full overflow-x-auto` wrapper: the WRAPPER scrolls, the document does not,
  which is what AC-20 measures. Removing that wrapper puts 88 px of sideways scroll back on a
  different element.
- **`analysis-access.spec.ts` navigates with an explicit `?period` everywhere except the two
  places that are about the default**, because "the latest approved period" is a global fact
  and three workers are running fourteen files. The periods are also chosen so the
  thirteen-month window holds no sibling's rows: the window of `2103-12` is `2102-12` through
  `2103-12`, and `stock-takes-count.spec.ts` seeds only January to March of 2102.
- **The reserved-year census is now a map, not a set.** `owner` maps key → the file that names
  it, so the failure message names both files rather than reporting a size mismatch. That is
  the assertion that would have caught a reused year at the moment it was reused.

---

## Repair pass (2026-09-24): review CHANGES_REQUESTED, B1 and B2

**Brief:** the coordinator's `fix11.md`.
**Review:** `progress/review_analysis.md` (B1, B2, O1, O2, O6, O7, O9, O10, and the runner caveat).
**Spec:** the 2026-09-24 post-approval amendment, and the amended AC-6, AC-9, AC-16, AC-20 and AC-25.
**Status:** complete.
- The spec and `feature_list.json` were not edited; their hashes are unchanged (listed at the end).
- `init` was not run.
- One `test:db` was run, on the one file the brief named, with M6 applied.

### Files created
**`src/app/analysis/page.test.ts`** closes B1.
- It renders the real `page.tsx` on the server with `react-dom/server`. It needs no database and runs in `npm run test:unit`.
- Three collaborators are mocked:
  - `@/app/page-guards` answers an ADMIN.
  - `@/server/reporting/analysis-service`: `listApprovedPeriods` returns `[]`, and `getAnalysis` returns the never-counted shape for the period it was asked for.
  - `@/app/auth-actions` is a stub.
- Everything else is the real module graph, including `next/link`.

It holds five tests:
1. **AC-6.** It asserts:
   - the literal;
   - exactly one *Go to Stock Takes* `<a>`, with `href="/stock-takes"`;
   - no grid, total, chart or breakdown;
   - zero `€` in the whole HTML, including entity spellings.
2. **AC-6, the converse.** The same page renders `€0.00` once a complete, empty period is approved. This proves the census can see a euro at all.
3. **AC-16, real clock.** `getAnalysis` is called with `{ periodKey: monthKeyOf(todayInYard()), breakdownKey: "type" }`, and the `<h2>` heading is that month's label.
4. **AC-16, pinned clock.** This one was not asked for. At `2026-09-30T23:30:00Z` the page asks for `2026-10` and renders `October 2026`. UTC is still September at that moment, so the page is using the yard's month, not the server's.
5. **AC-6, amended.** For an incomplete period:
   - `total-stock` and both breakdown-row totals read `Incomplete`, with no `€` and no `Not counted`;
   - the Clonmel yard cell and the Clonmel per-yard breakdown cells read `Not counted`;
   - Dublin's figure is drawn.

### Files modified
**Source**
- `src/lib/analysis-messages.ts`:
  - Adds `INCOMPLETE_TOTAL = "Incomplete"` (amended AC-6, AC-22).
  - Removes `SEE_THE_ITEMS` (O9). The spec quotes it nowhere. AC-9 makes the sentence itself the link, so a separate "See the items" label would be a second link to the same place.
- `src/components/analysis/PeriodGrid.tsx`: the total cell renders `INCOMPLETE_TOTAL` when `totalStock` is null. The yard cells are unchanged, and the header comment is updated.
- `src/components/analysis/BreakdownTable.tsx`: `breakdown-total` renders `INCOMPLETE_TOTAL`. The per-yard `breakdown-cell` keeps `NOT_COUNTED`.

**Unit tests**
- `src/lib/analysis-messages.test.ts`: `INCOMPLETE_TOTAL` equals `"Incomplete"`, differs from `NOT_COUNTED`, and contains no `€`.
- `tests/unit/analysis-contract.test.ts`:
  - **B2:** two new absences under AC-8, over the three trees:
    - raw source must not match `/unitPrice(?!Snapshot)/`;
    - `codeOf` output must not match `/\bprices\b/`.
  - **O1:** the AC-17 scan is now anchored on the real argument (details under the O1 mutation below). It uses a new helper, `topLevelArguments`.
- `tests/unit/project-contract.test.ts` (**B2**):
  - `ANALYSIS_SERVICE` is named once and reused in `SNAPSHOT_READERS`.
  - A new test sits next to that list. In the service, the set of `unitPrice\w*` tokens must be exactly `{ "unitPriceSnapshot" }`, with a non-vacuity count.
- `tests/unit/stock-entry-contract.test.ts` (**O10**): `RESERVED_YEAR`'s values are read from the object literal, comments stripped. The test asserts:
  - no key is declared twice;
  - no year is held by two keys;
  - every key a spec names is declared;
  - the 15 owned keys map to 15 distinct years.

**End-to-end tests**
- `tests/e2e/analysis-access.spec.ts`:
  - **B1:** the dead branch is deleted and the comment rewritten (see the next section).
  - **O2:** both plain reads are taken with no `role` cookie, and that absence is asserted. Only then are the cookie and header added, and their presence is asserted too.
  - **O7:** the JS-disabled run now clicks:
    - both breakdown links: *By supplier*, then *By type*;
    - both jumps: *Previous period* lands on `INCOMPLETE`, then *Next period* returns to `COMPLETE`. Each landing is asserted by URL and heading.
  - **Amended AC-6:** `total-stock` contains `INCOMPLETE_TOTAL` and not `NOT_COUNTED`. The yard cell's literal now comes from the messages module.
  - **AC-20:** a comment at the `?period=1999-01` state says it is the never-counted period, measured as itself, and not the empty state.
- `tests/e2e/analysis-figures.spec.ts` (**amended AC-6**):
  - AC-5 (the submitted period) and AC-6 (`LATEST`): `total-stock` contains `INCOMPLETE_TOTAL`.
  - AC-15: every `breakdown-total` in the incomplete period equals `INCOMPLETE_TOTAL`, and the Clonmel `breakdown-cell` equals `NOT_COUNTED`.
- `tests/e2e/support/analysis.ts`: the doc comment on `approvedCountTally` now says it is used only as a precondition, never as a branch.

**Other**
- `scripts/run-e2e.mjs`: header comment only. It now says that after a red phase 1, phase 2 runs on whatever phase 1 left behind, so phase-2 failures are advisory until phase 1 is green. **This file belongs to the separate cascade repair's commit, not to #11's.**
- `progress/impl_analysis.md`: two correction lines added under Phase B's *What I could not verify*. Nothing above them was rewritten.

### Where each review finding is closed

| Finding | Closed by | Proof |
|---|---|---|
| **B1**, AC-6 page half | `src/app/analysis/page.test.ts` → "AC-6: the sentence, one link to /stock-takes, and not one euro character in the HTML" | Red with `€0.00` planted in the empty branch (below) |
| **B1**, AC-16 page half | Same file, the two AC-16 tests | Red when the default uses the UTC month instead of the yard's (below) |
| **B1**, AC-20 | Recorded as unreachable (spec amended), with a comment at the `1999-01` state | None possible: the state cannot be reached in the shared database |
| **B1**, false sentence | Correction line in Phase B, *What I could not verify* | n/a |
| **B2**, scan | `analysis-contract.test.ts` → "AC-8: the price column is named in the three trees only as the snapshot" and "AC-8: and no code in the three trees reaches through the item's price relation" | Both red under M6, with `tsc` at exit 0 |
| **B2**, bound | `project-contract.test.ts` → "011 AC-26, bounded after review B2: the twelfth entry may name the snapshot and nothing else" | Red under M6 |
| **B2**, runtime | `analysis-service.db.test.ts:584` (unchanged) | Red under M6; `test:db` exit 1 (below) |
| **O1** | `analysis-contract.test.ts` → "AC-17: there is no staff branch that returns an object" | Red under both variants; the old clause stayed green under variant B |
| **O2** | `analysis-access.spec.ts` → AC-18 | E2E run below |
| **O6**, now AC-6 | `INCOMPLETE_TOTAL`, the two components, the unit render, three e2e tests | Unit and e2e runs below |
| **O7** | `analysis-access.spec.ts` → AC-22 | E2E run below |
| **O9** | `SEE_THE_ITEMS` removed | `typecheck` exit 0; nothing referenced it |
| **O10** | `stock-entry-contract.test.ts` → "AC-30, 011 AC-24: no reserved year is named by two spec files" | Green on today's tree |
| Runner caveat | `scripts/run-e2e.mjs` header | Comment only |

### The dead branch: deleted, not kept as a guarded no-op
The brief left this decision to me. I deleted the `if (approved === 0)` branch.
- A guarded no-op is still a test whose title claims a criterion it can never check. That is exactly the failure B1 describes.
- The half that can actually be reached is kept and now runs unconditionally. Its title says what it proves: "AC-6: with an approved count in the database the page is never in the empty state".
- `approvedCountTally()` stays, but only as a precondition (`>= 3`, which the file's own `beforeAll` guarantees). It is never a branch.
- The rewritten comment says two things. The state is unreachable in the shared database. The proof now lives in `src/app/analysis/page.test.ts` (page half) and `analysis-service.db.test.ts` (shape half).

### A test-harness change the render test needed
The first run failed with `ReferenceError: React is not defined` at `page.tsx:190`.

**Cause.**
- `tsconfig.json` sets `"jsx": "preserve"`, because Next compiles JSX itself.
- Vitest's esbuild cannot hand preserved JSX to Node, so it falls back to the classic transform (`React.createElement`).
- The classic transform needs `React` in scope, and no app module imports it (correctly).

**Fix, inside the test file only.**
- It sets `globalThis.React = React`, then loads the page with `await import("./page")`, so the global exists before the page module runs.
- Both JSX runtimes build the same elements, so the rendered HTML is the same.

**Two alternatives were rejected.**
- `esbuild: { jsx: "automatic" }` in `vitest.config.ts`: 011 AC-25 does not list that file. If the leader prefers this route, it needs an AC-25 amendment, and the test would then drop its two lines.
- `import React` in the page: a source change made only for a test.

**`next/link`** rendered outside the router without trouble, as a plain `<a href>`. So the empty branch did not need to be extracted into a component. The page renders it as before, and `page.tsx` is byte-identical to the reviewed tree (`3ad2c86f…`).

### Mutation proofs
Every mutation was made on a byte copy, and every restore was verified by sha256.

**B1: `€0.00` planted in the empty branch** (`src/app/analysis/page.tsx`)
```
--- MUTATION B1 (diff vs byte copy):
267a268
>           <p data-testid="planted">€0.00</p>
 × 011 AC-6: … > AC-6: the sentence, one link to /stock-takes, and not one euro character in the HTML
   → expected '<main class="mx-auto flex w-full max-…' not to contain '€'
   ✓ AC-6: the census can see a euro …   ✓ AC-16 (both)   ✓ AC-6 (amended)
 Tests  1 failed | 4 passed (5)
--- RESTORED:
3ad2c86f0ae4131df66ad800c950ce5446c601e75b53500ca31e78c72d01cfa0 *src/app/analysis/page.tsx   (identical to baseline)
```

**AC-16: the server's month instead of the yard's** (`page.tsx:149`)

This mutation was not asked for. I ran it to show that the pinned-clock test is load-bearing.
```
<   const periodKey = parsedPeriod ?? latestApproved ?? monthKeyOf(todayInYard());
>   const periodKey = parsedPeriod ?? latestApproved ?? new Date().toISOString().slice(0, 7);
 × AC-16: IN THE YARD — at 23:30 UTC on 30 September it is already October in Dublin
   → expected "spy" to be called with arguments: [ …(2) ]
 Tests  1 failed | 4 passed (5)
--- RESTORED: 3ad2c86f…cfa0 (identical)
```

**B2: the reviewer's M6, verbatim** (`src/server/reporting/analysis-service.ts`)
```
193a194
>           prices: { select: { unitPrice: true }, orderBy: { createdAt: "desc" }, take: 1 },
207c208
<     const snapshot = row.unitPriceSnapshot === null ? null : row.unitPriceSnapshot.toString();
---
>     const snapshot = row.unitPriceSnapshot?.toString() ?? row.item.prices[0]?.unitPrice.toString() ?? null;
(mutated hash f6942227caaa361175c1a6a7569446493b8afe237b71b0fa68171f6afb6ba467)

npx tsc --noEmit  -> tsc exit 0

npx vitest run tests/unit/analysis-contract.test.ts tests/unit/project-contract.test.ts src/server/reporting/analysis-service.test.ts
 × 011 AC-26, bounded after review B2: the twelfth entry may name the snapshot and nothing else
   → expected Set{ 'unitPriceSnapshot', 'unitPrice' } to deeply equal Set{ 'unitPriceSnapshot' }
 × AC-8: the price column is named in the three trees only as the snapshot
   → src/server/reporting/analysis-service.ts names a price column that is not the snapshot: … not to match /unitPrice(?!Snapshot)/
 × AC-8: and no code in the three trees reaches through the item's price relation
   → src/server/reporting/analysis-service.ts reaches the item's price relation: … not to match /\bprices\b/
 Test Files  2 failed | 1 passed (3)
      Tests  3 failed | 40 passed (43)
```
- All three new clauses went red.
- The 40 tests that existed at review time stayed green, as the review recorded.
- `tsc` stayed at exit 0.

**B2 runtime half, with M6 still applied.** One run of the one file, 07:33:56Z to 07:35:23Z. That is 87 s overall; vitest itself reported 78.36 s.
```
npm run test:db -- src/server/reporting/analysis-service.db.test.ts
No pending migrations to apply.
 × 011 AC-8: no price-list edit moves a figure on this screen > AC-8: five operations, and the whole shape is deeply equal after each
   → a FIRST-EVER price for the item that had none must not move a figure: expected { periodKey: '2026-09', …(10) } to deeply equal { periodKey: '2026-09', …(10) }
 ❯ src/server/reporting/analysis-service.db.test.ts:605:65
-       "amount": "8896.637232378368",
+       "amount": "9463.637232378368",
-           "amount": "15.71775",
+           "amount": "582.71775",
-       "unvaluedHeldLineCount": 1,
+       "unvaluedHeldLineCount": 0,
-     "totalStock": "8896.637232378368",
+     "totalStock": "9463.637232378368",
-         "yardValue": "15.71775",
+         "yardValue": "582.71775",
 Test Files  1 failed (1)
      Tests  1 failed | 37 passed (38)
test:db exit 1
```
**The reviewer's prediction held exactly.** Operation 4 (a first-ever price) caught M6.
- Clonmel moved from `15.71775` to `582.71775`, and the total moved by the same `567`.
- `unvaluedHeldLineCount` fell from `1` to `0`. So the Invariant 4 warning would have disappeared from the screen at the same moment the figure became wrong.
- Operations 1–3 (back-dated, same-day and later prices) did not fail first. Under M6, a list price only reaches a line with no snapshot. The fixture's one such line is on the item that had no price until operation 4.
- There was no connection error. The Neon branch was healthy.

Restore:
```
--- M6 RESTORED:
1eec466b382583861454368dc6f934d0ab8a613664e10b1ca3dabc09cd2ba990 *src/server/reporting/analysis-service.ts   (identical to baseline and to the review's recorded hash)
```

**O1: the staff thunk returns an object**, in two variants. I evaluated the old AC-17 clause verbatim against each mutated file with a scratch script (`codeOf` plus its two assertions).
```
=== variant A: the throw replaced by `return { refused: true } as never;`
old AC-17 clause -> RED (only because the file's one `throw new ForbiddenError` is gone)
 × AC-17: there is no staff branch that returns an object
   → expected '(): never => {\n      return { refuse…' to contain 'throw new ForbiddenError'
 × AC-21: it throws only the typed domain errors (expected [] to not have a length of +0)
 Tests  2 failed | 21 passed (23)
--- restored: 1eec466b…a990

=== variant B: `if (user.role !== "ADMIN") throw new ForbiddenError(…); return { refused: true } as never;`
old AC-17 clause -> GREEN      <- O1 demonstrated: the old regex never sees the positional thunk
 × AC-17: there is no staff branch that returns an object
   → expected '(): never => {\n      if (user.role !…' not to match /\breturn\b/
 Tests  1 failed | 22 passed (23)
--- restored: 1eec466b…a990
```
**How the anchored scan works.**
1. It reads `analysisForRole`'s parameter list from the signature and asserts it is exactly `["actor", "forStaff", "forAdmin"]`.
2. It takes `forStaff`'s position.
3. It asserts there is exactly one `analysisForRole(` call inside `getAnalysis`, and takes the argument at that position.
4. That argument must:
   - have a block body (`=>\s*\{`), which rules out an expression body such as `() => ({…})`;
   - contain `throw new ForbiddenError`;
   - contain no `return`.

### Verification output
Targeted commands only; the coordinator runs `init`.
```
npm run typecheck  -> tsc --noEmit                          exit 0
npm run lint       -> eslint src tests --max-warnings 0     exit 0

npx vitest run src/app/analysis/page.test.ts src/lib/analysis-messages.test.ts tests/unit/analysis-contract.test.ts tests/unit/project-contract.test.ts tests/unit/stock-entry-contract.test.ts
 Test Files  5 passed (5)
      Tests  90 passed (90)

npx vitest run tests/unit/analysis-contract.test.ts tests/unit/project-contract.test.ts src/server/reporting/analysis-service.test.ts   (after the last restore)
 Test Files  3 passed (3)
      Tests  43 passed (43)

npx vitest run tests/unit/{repo-hygiene,stock-takes-contract,count-entry-contract,entry-submit-contract,hashing-boundary,no-default-password,lint-fence,schema-and-migration}.test.ts
 Test Files  8 passed (8)
      Tests  134 passed (134)

npm run test:e2e -- tests/e2e/analysis-access.spec.ts tests/e2e/analysis-figures.spec.ts --project=chromium-stock-entry --no-deps
   (production build of the final tree, then:)
Running 25 tests using 2 workers
  ok  5 … analysis-access.spec.ts:251:5 › AC-18: a query parameter, a header and a cookie cannot change the role (11.7s)
  ok  8 … analysis-figures.spec.ts:311:5 › AC-5: a SUBMITTED yard is named and linked, and is worth nothing anywhere (3.8s)
  ok  9 … analysis-figures.spec.ts:337:5 › AC-6: a complete period holding nothing renders €0.00, and a gap renders neither (3.5s)
  ok 16 … analysis-access.spec.ts:419:5 › AC-22: with JavaScript disabled the screen renders and every control navigates (10.3s)
  ok 17 … analysis-figures.spec.ts:555:5 › AC-15: an incomplete period keeps the per-yard figures and loses the row total (3.0s)
  ok 20 … analysis-access.spec.ts:473:5 › AC-6: with an approved count in the database the page is never in the empty state (3.3s)
  ok 21 … analysis-access.spec.ts:504:5 › AC-20: the screen never scrolls sideways at 390 px or 320 px, in any state (11.6s)
  ok 25 … analysis-access.spec.ts:618:5 › AC-6: the incomplete period names the yard and never renders a euro for it (4.4s)
  … (17 more, all ok)
  25 passed (1.6m)
e2e exit 0
```
The e2e run has 25 tests, as before: the empty-state test was renamed in place, not added or removed.

`npm run test:unit` grows by 9 tests:
- 5 in the page render;
- 1 for the new message literal;
- 2 for the AC-8 absences;
- 1 for the twelfth-entry bound.

The AC-17 test was replaced in place, and O10 added assertions to an existing test, so neither changes the count.

### Final hashes
| File | sha256 |
|---|---|
| `src/app/analysis/page.test.ts` (new) | `e566b4da445e596a8db3130a63cad79bff9308b3d11548ea7a3b7f45006b3899` |
| `src/app/analysis/page.tsx` (unchanged from review) | `3ad2c86f0ae4131df66ad800c950ce5446c601e75b53500ca31e78c72d01cfa0` |
| `src/server/reporting/analysis-service.ts` (unchanged from review) | `1eec466b382583861454368dc6f934d0ab8a613664e10b1ca3dabc09cd2ba990` |
| `src/server/reporting/analysis-service.db.test.ts` (unchanged) | `64e8b3d9507bba389c2d9a1e8e6bb5fc97ccdc71c0a8bf274851ca6b27bc38e9` |
| `src/lib/analysis-messages.ts` | `b9e0d1a2bfc302b2cd3eaf364ed69dacfc49a7e76c63c7d4636a0d17287b423c` |
| `src/lib/analysis-messages.test.ts` | `89098c90aa8e1a8b75104cc3510e760ed62bbf8ab648b172a1d126b6b40eb3d9` |
| `src/components/analysis/PeriodGrid.tsx` | `fe80a09e64b6e21812e21192b170050f5273f96945fe10a69d47335dddb6014c` |
| `src/components/analysis/BreakdownTable.tsx` | `aa725c090b9c3978029d130187cf8a3e20ce979708d14721ec0231d30230842c` |
| `tests/unit/analysis-contract.test.ts` | `b974d48e54c310e0f1543815b4b86f8fb5617fcad8e66dda31f947c310502193` |
| `tests/unit/project-contract.test.ts` | `c6e19375f0354351c99ecf1bc94136af2122ad0af7bc5fbbd3141899ef645639` |
| `tests/unit/stock-entry-contract.test.ts` | `3d960b39558697606dd7e6893c76c467e6d309544f8284ccf440d56594fc9db2` |
| `tests/e2e/analysis-access.spec.ts` | `967429bec8864aff61d774d5beed467dabd02c2203de6b2a91a38a90d4cb7268` |
| `tests/e2e/analysis-figures.spec.ts` | `5b6163ae596a530e55edaa79835bf6a9d5f4c98c91e783a515d766cc7c684dce` |
| `tests/e2e/support/analysis.ts` | `689b412704c917a1203ba487486c11e7d7c55a9a056817004c7528526ab9f91d` |
| `scripts/run-e2e.mjs` (separate repair's file) | `7efb3d015f5c8a095c114fb789100645d2c9b0724e6c9c3cda4922899e10ed93` |
| `tests/e2e/item-master-yards.spec.ts` (out of scope, untouched) | `51b1988f8c841bfc8ba319bd8d68e04386a48d00817737a3b1c092f00f409850` |
| `playwright.config.ts` (out of scope, untouched) | `71f50c57f4f594fe3bd156642e2a76ed3d28c88e4376b85dd87c1eeb984cf1be` |
| `feature_list.json` (not edited) | `628610da7ce125b63e5532cb8867babc8d8a7df10180529460df58ceeb081fab` |
| `specs/features/011-analysis.md` (not edited) | `b311c5ace3c2dca6311f0e247a5ecb67a5be7b4d2a2027b6f1a9759aa757967c` |

The only new line in `git status --porcelain` is `?? src/app/analysis/page.test.ts`. Every other path was already modified or untracked before this pass.

Untouched, as the brief required:
- `src/server/counts/**`, `src/server/items/**`, `src/server/auth/**`, `src/app/stock-entry/**`, `src/app/stock-takes/**`, `Samples/`: AC-25's absence test passes inside `analysis-contract.test.ts`.
- The three out-of-scope files listed in the hash table: hashes identical to the baseline taken before the first edit.

### Deviations from the brief and the spec
1. **The React global in the render test.** It is a test-harness adaptation, explained above. It adds no config edit and no source edit.
2. **One mutation more than asked:** the AC-16 UTC-month mutation, and variant B of O1. Both were run to show that a specific assertion is load-bearing.
3. **Otherwise none.** The O1 wording "the first argument to `analysisForRole(`" was read as the argument in the `forStaff` position, which is the first thunk. The actor is the literal first argument. The scan derives that position from the signature rather than hard-coding it.

### Notes for the reviewer
- **The trend table still prints `Not counted` for an incomplete period.** This applies to `TrendChart.tsx` in two places: line 138 (the table's gap cell) and line 66 (the gap's `<title>`).
  - Those cells are period totals. For a period where Dublin *was* approved, they have the same misreading that O6 fixed in the grid.
  - The amendment's general sentence ("the **total** cells for an incomplete period now read `Incomplete`") arguably covers them. But amended AC-6 and the brief name only `total-stock` and the breakdown-row totals, and AC-14 quotes no text for a gap.
  - I left them unchanged. This is the leader's call; it would be a two-line change plus assertions.
- **AC-18's plain reads are now isolated from all three vectors.** The first `cookies()` check proves no `role` cookie exists before the plain reads, and the second proves it exists before the vector reads. This makes the byte comparison a true before-and-after.
- **The O10 parse depends on `RESERVED_YEAR` staying an object literal whose closing brace is at column 0.** If the declaration is reshaped, the `not.toBeNull()` on the regex fails loudly, rather than the test silently passing on an empty map.
- **Nothing was committed.** The cascade repair's two files (`scripts/run-e2e.mjs`, `tests/e2e/item-master-yards.spec.ts`) still need to be kept out of #11's commit, as the review said. This pass added one comment block to the first of them, at the brief's request.

## Repair pass 2

**Date:** 2026-09-24
**Brief:** the second review's O1 and the trend follow-up from *The coordinator's amendments*.
**Files changed:** the four the brief allowed. No other file was changed. `analysis-service.ts` is still `1eec466b…`, and `git status --porcelain` and `--ignored` are identical to the snapshot taken before the first edit.

### 1. The trend's words for an incomplete period are now `Incomplete`

- `src/components/analysis/TrendChart.tsx:144`: the trend table cell for `amount === null` now renders `INCOMPLETE_TOTAL`.
- `src/components/analysis/TrendChart.tsx:72`: the gap marker's `<title>` now reads `<label>: Incomplete`.
- The `NOT_COUNTED` import was left unused, so it is removed and `INCOMPLETE_TOTAL` is imported in its place (`:12`).
- The header comment has a new paragraph explaining why: the trend is the third place a period's total is printed.
- **New test:** `src/app/analysis/page.test.ts:383`, "AC-6: the trend's cell and gap marker for that period say Incomplete too". It renders the real page with Dublin approved, Clonmel not, and the month before complete (`999.5`). It asserts:
  - the `<td>` of the `2026-09` trend row is exactly `Incomplete`, and does not contain `Not counted`;
  - the `2026-09` gap's text is `September 2026: Incomplete`;
  - there is no `Not counted` anywhere in `trend-chart` or `trend-table`.

  For non-vacuity, it also asserts that the complete month's figure is present and that the Clonmel yard cell still says `Not counted`.
- **New e2e assertion:** `tests/e2e/analysis-figures.spec.ts:361-369`, at the end of "AC-6: a complete period holding nothing renders €0.00…". This is the real `LATEST` fixture, with Dublin approved and Clonmel never counted. It asserts that the trend row's `td` has the text `Incomplete`, that the row does not contain `Not counted`, and that the gap `title` is `October <Y>: Incomplete`.
- **The brief's pointer at `:~576` was not changed, deliberately.** That assertion (`analysis-figures.spec.ts:585` after this edit) reads the per-yard breakdown cell `[data-location-code='CLONMEL']`. Under amended AC-6, a yard keeps `Not counted`, so that assertion is correct as it stands. None of the pre-existing `NOT_COUNTED` assertions in the e2e files reads the trend:
  - figures `:353` checks the yard cell `yard-cell-CLONMEL`;
  - figures `:356` checks that `total-stock` does not contain it;
  - figures `:585` checks the per-yard breakdown cell;
  - access `:626` checks the Clonmel yard cell;
  - access `:637` checks that the total does not contain it.

  So no existing assertion expected the old trend text. The only new use is this pass's `not.toContainText` at figures `:365`.
- **AC-14 check.** `tuplesOf` (`analysis-figures.spec.ts:235-245`) builds each tuple only from `data-period` and `data-amount`, so the gap's text is **not** part of the chart-versus-table comparison. The gap still carries no `data-amount`, on either side. The AC-14 test (`:458`) passed in the e2e run below.

**Red proof.** Both mutants were made from a byte copy of the post-edit file (`58e9fa77…`). Each also re-imports `NOT_COUNTED`, so the failure is the assertion and not a `ReferenceError`. Command: `npx vitest run src/app/analysis/page.test.ts`.

| # | Mutation | Mutated sha256 | Result |
|---|---|---|---|
| T1 | `:144` cell back to `NOT_COUNTED` | `06b951e3c44b…` | **Red**, 1 failed / 5 passed: `expected 'Not counted' to be 'Incomplete'` |
| T2 | `:72` gap `<title>` back to `NOT_COUNTED` | `2a97ea9511fc…` | **Red**, 1 failed / 5 passed: `expected 'September 2026: Not counted' to be 'September 2026: Incomplete'` |

Restored from the byte copy each time. `sha256sum -c` gives `TrendChart.tsx: OK` at `58e9fa77…`.

### 2. O1: the staff-thunk scan is anchored at both ends, and the block body is pinned

At `tests/unit/analysis-contract.test.ts:273-282`, the unanchored `/=>\s*\{/` is replaced by two anchored clauses:
- **`:273`, the reviewer's regex, verbatim:** `/^\([^)]*\)\s*(:\s*\w+\s*)?=>\s*\{[\s\S]*\}$/`. The thunk's own arrow must open a block, and the argument must end with that block.
- **`:279-281`, the tighter form I argue for:** `/^\(\s*\)\s*(:\s*never\s*)?=>\s*\{\s*throw\s+new\s+ForbiddenError\([^()]*\)\s*;?\s*\}$/`. The block must be exactly one statement, the refusal.
  - **Why it is better.** A block with no `return` cannot return an object, but it can still **fall through**. `() => { if (cond) throw new ForbiddenError(…); }` gives a staff actor `undefined` instead of a refusal, and it passes the reviewer's regex together with the old `toContain`/no-`return` clauses (row `falls_through` below).
  - **The trade-off.** Any second statement in the staff branch now fails loudly. That is intended: a staff branch has nothing else to do.
- The `toContain("throw new ForbiddenError")` and `not.toMatch(/\breturn\b/)` clauses are kept. They are now redundant, but their failure messages are clearer.

**Red proof, without touching the service.** The script `scratchpad/fix11c/o1.mjs` takes a byte copy of a version of the contract test. It rewrites that test's AC-17 `const code = codeOf(read(SERVICE))` to `codeOf(read(SERVICE).replace(REAL, MUTANT))` and runs `npx vitest run tests/unit/analysis-contract.test.ts -t "AC-17"`. The filter selects that describe's 3 tests (AC-17 and the two AC-21 tests). The script checks that the anchor and the real thunk each occur exactly once, and it restores the live test file in a `finally`. The whole path is exercised: `codeOf`, the signature parse and the argument extraction. I ran it against both the new clauses and the pre-pass clauses (`orig/analysis-contract.test.ts`, `b974d48e…`) for contrast.

| Staff thunk | New clauses | Pre-pass clauses |
|---|---|---|
| real code (`(): never => { throw new ForbiddenError(…); }`) | **green**, 3 passed | green, 3 passed |
| O1e: `(): never => user.role !== "ADMIN" ? ({ refused: true } as never) : (() => { throw new ForbiddenError("x"); })()` | **red** at `:273` (the reviewer's regex) | green: the residual hole |
| returns an object: `(): never => ({ refused: true }) as never` | **red** at `:273` | red at `/=>\s*\{/` |
| O1d: `(): never => { if (…) return { refused: true } as never; throw new ForbiddenError("x"); }` | **red** at `:280` (the pinned body) | red at `/\breturn\b/` |
| falls through: `() => { if (user.role === "ADMIN") throw new ForbiddenError("x"); }` | **red** at `:280` | green: a second hole, closed by the pinned body |

- In the "returns an object" row, the new run reported 2 failed, not 1. The second failure is AC-21's `expect(thrown).not.toHaveLength(0)`: the service has exactly one `throw new` (`grep -c` → 1, at `:545`), and this mutant removes it.
- After both runs, `sha256sum -c` gives `analysis-contract.test.ts: OK` at the post-edit `9fbed26d…`. `analysis-service.ts` is unchanged at `1eec466b…`.

### Verification

- `npx vitest run src/app/analysis/page.test.ts tests/unit/analysis-contract.test.ts src/lib/analysis-messages.test.ts src/lib/analysis-chart.test.ts`: 4 files, **69 passed**.
- `npm run typecheck`: exit 0. `npm run lint` (`eslint src tests --max-warnings 0`): exit 0.
- `npm run test:e2e -- tests/e2e/analysis-figures.spec.ts tests/e2e/analysis-access.spec.ts --project=chromium-stock-entry --no-deps`: **run once**, exit 0.
  ```
    ok  9 [chromium-stock-entry] › tests\e2e\analysis-figures.spec.ts:337:5 › AC-6: a complete period holding nothing renders €0.00, and a gap renders neither (5.6s)
    ok 14 [chromium-stock-entry] › tests\e2e\analysis-figures.spec.ts:458:5 › AC-14: the chart is thirteen assertable slots and cannot disagree with its table (4.5s)
    ok 17 [chromium-stock-entry] › tests\e2e\analysis-figures.spec.ts:564:5 › AC-15: an incomplete period keeps the per-yard figures and loses the row total (3.4s)
    ok 25 [chromium-stock-entry] › tests\e2e\analysis-access.spec.ts:618:5 › AC-6: the incomplete period names the yard and never renders a euro for it (5.0s)

    25 passed (2.0m)
  ```
- **Not run, per the brief:** `init` and `test:db`. The new e2e assertion was **not** proven red in a browser, because only one e2e run was allowed. Its red proof is the render-level T1/T2 above, which exercises the same component.

### Final hashes

| File | sha256 |
|---|---|
| `src/components/analysis/TrendChart.tsx` | `58e9fa7740368a11c791701e46e5a881c88cad9f7fc2e0af8f44b088fdba54d6` |
| `src/app/analysis/page.test.ts` | `cc8dd31ebe94efdc054b8d83355c78660beed9c10aacabb5adff41560ae86882` |
| `tests/e2e/analysis-figures.spec.ts` | `aa67af0130b6f001e9c5c264e972213f76a77456cfe05814499172ee61a583a2` |
| `tests/unit/analysis-contract.test.ts` | `9fbed26d61e247c12ad652cf301ec8b739d717874d14c51cc69b7473d5f74f3f` |
| `src/server/reporting/analysis-service.ts` (unchanged) | `1eec466b382583861454368dc6f934d0ab8a613664e10b1ca3dabc09cd2ba990` |

The pre-pass byte copies are in `scratchpad/fix11c/orig/`.

### Notes for the reviewer

- In `page.test.ts`, the new test sets `analysis.trend = …` on the object `analysisOf` built, with the changed point written out field by field. This avoids a spread, following the file's "no spread carries a fact in" convention.
- The pinned-body clause needs the staff thunk to take no parameters and to be annotated `never` or not at all. A future `(): Promise<never>` would fail loudly. That is intended, not an oversight.
- `progress/current.md` was not updated in this pass, because the brief limited the files to four plus this report.
