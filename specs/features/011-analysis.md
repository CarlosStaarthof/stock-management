# 011 — Analysis

**Feature id:** 11   **Status:** draft
**Depends on:** #9 `entry_submit` (**`unitPriceSnapshot` — the only source of a euro in this
product, written once at submit and never rewritten**, `multiplyDecimal`, `sumDecimals`,
`roundHalfUp`, `formatPriceExact`, the `APPROVED` lifecycle and the exact-file permitted lists
of AC-26), #10 `stock_takes_history` (`compareDecimals`, `isHeld` / `partitionHeld`, the
single-sourced messages-by-re-export layout, the derived `loading.tsx` and `force-dynamic`
censuses, and the **three recorded instances of the identity-header overflow, the third of
which is this page**), #7 `entry_start` (`period.ts` — `parseMonthKey`, `previousMonthKey`,
`nextMonthKey`, `formatPeriodKey`, `formatPeriodLabel`; `formatMonthLabel`;
`COUNT_STATUS_LABEL`; `NOT_COUNTED`; the `loading.tsx` rule), #6 `item_master_ui`
(`formatPriceExact`, `NO_SUPPLIER`, the single-sourced messages modules, the served-build e2e
suite at `retries: 0`, and **AC-31's exact permitted list for the string `unitPrice`**),
#4 `domain_schema` (`StockCount`, `StockCountLine`, `Location`, `ItemType`, `Supplier` and
`@@index([periodYear, periodMonth])` — **every column this feature reads already exists**),
#3 `auth_and_roles` (`requireAdminPage`, `requireRole`, `assertRole`, `shapeForRole`,
`deepKeys` / `assertNoMoneyKeys`, and the `/analysis` placeholder page this feature replaces),
#20 `test_db_reset` (`TRUNCATED_TABLES`)

## Purpose

`/analysis` has been a heading, an email and a sign-out button since
`feat(#3): identity, roles, and the first migration`. Its own comment says what it is for:

> PLACEHOLDER — feature #11 analysis replaces this page. Today it demonstrates one thing:
> role refusal.

This feature makes it the screen the product brief promises: **per-yard values, total stock,
period completeness, month-on-month and year-on-year joined on period, a trend chart, and a
breakdown by type and supplier.** It is the thing the `Summary` sheet does today by hand, and
stops doing correctly after October 2025.

Without it the product can count, sign, submit, approve and read back a stock take, and can
answer no question anybody actually asks: *what is the yard worth, is it up or down on last
month, and is it up or down on last September.*

**It is the exact inverse of #10.** #10 was the first surface that is money-free *by design*
for both roles, and it proved that by asserting the page body is byte-identical between a
`YARD_STAFF` session and an `ADMIN` one. #11 is the one screen in this product that carries
**all** of the money, for **one** role. Everything the project has built to keep euros away
from the yard now has to hold while an administrator looks at nothing but euros:

| Guarantee | Where it was built | What #11 does to it |
|---|---|---|
| `YARD_STAFF` is never *sent* money | Part 6, #3's `deepKeys`, #9's three-surface walk | Puts the largest monetary shape in the product behind it |
| Value is never stored | Invariant 1, #9's `countTotal` | Derives **every** figure on the screen, every time |
| Prices are frozen at approval | Invariant 2, #9 AC-11 and AC-19 | Reads `unitPriceSnapshot` only, and **never** reads `ItemPrice` at all |
| An unpriced line counts zero **and says so** | Invariant 4, #9 AC-12 | Carries the disclosure onto an aggregate, where it is easiest to lose |
| Decimals, never a JavaScript `number` | Invariant 8, #9 AC-24, #10 AC-10 | Extends it to a chart, which is where a `number` usually creeps in |

## The five things this feature settles

### 1. Analysis counts `APPROVED` counts, and nothing else

**Only an `APPROVED` count contributes a euro.** Three reasons, in order of weight.

1. **The domain model already says so.** Invariant 7: *"A period is complete only when every
   `active` Location has an `APPROVED` count for it. Total Stock, MoM and YoY exist only for
   complete periods."* That sentence is the whole of this decision; the rest is why it is
   right.
2. **A figure that moves because somebody is still typing is not an analysis.** A `DRAFT` has
   no `unitPriceSnapshot` at all (Invariant 2), so valuing one means valuing it at *today's*
   prices — which is exactly the reading #8 refused when it declined to put a running total on
   the counting screen, and it would make September's total change in March.
3. **A `SUBMITTED` count is priced but is not yet a record.** Its snapshots exist, so it
   *could* be valued — and it must not be, because an `ADMIN` may still reopen it, and a total
   that falls when a count is sent back for correction is a total nobody can quote. The
   separation of *who typed the number* from *who signed it off* is the point of the whole
   lifecycle; Analysis is downstream of the signature, not beside it.

**But the non-approved states are still visible, because the admin's job is to act on them.**
A yard with a `SUBMITTED` count for the selected period renders `Submitted` and a link to that
count, and contributes **nothing**. A yard with a `DRAFT` renders `Draft` and contributes
nothing. A yard with no count at all renders `Not counted`. Three different sentences for three
different facts, and one of them is not a euro (AC-5, AC-6).

### 2. A missing month is a gap, never a zero

**A yard that was never counted in March is not a yard with €0 of stock in March.** This is the
single rule that decides how six different figures render, so it is stated once here and
enforced six times below.

| Figure | When the yard / period is not fully approved |
|---|---|
| Per-yard value | `Not counted` (or `Draft` / `Submitted`), **never** `€0.00` |
| Total stock | absent, with the sentence naming which yards are missing — Invariant 7 |
| Month on month | `Not comparable — …`, naming the period that is incomplete |
| Year on year | the same |
| Trend chart | a **gap marker**, not a zero-height bar — a zero-height bar reads as €0 |
| Breakdown total column | absent for an incomplete period; the per-yard columns still render |

And the converse, which is the harder half: **a period that *is* complete and holds nothing
renders `€0.00`, and that is a different fact from a gap.** Both yards counted, everything
zero, is a real state, and it is why the chart draws a minimum-height bar for a complete period
whose total is `0` and draws no bar at all for an incomplete one (AC-14).

### 3. Prices are read from the count, never from the price list

`unitPriceSnapshot` is a **historical fact** captured at submit time (`docs/architecture.md`
§ Derived values are never stored). Analysis reads it and reads nothing else.

The mechanical form of that guarantee is an absence, and it is the strongest criterion in this
spec: **`src/server/reporting/**` contains no reference to `itemPrice`, `ItemPrice`,
`selectCurrentPrice`, `effectiveFrom` or `todayIso`** (AC-8). There is no path from this screen
to the price list, so no price-list edit can reach a figure on it — asserted by a scan *and* by
a database test that adds, edits and back-dates prices after approval and compares every figure
on the screen byte for byte.

This is the single most damaging thing this screen could get wrong. Last September's total
changing because somebody corrected the MMA price next March is the defect the whole product
exists to fix: the workbook's `Value` columns reference the single price column `E`, so editing
a price silently rewrites the value of every historical count.

### 4. What Analysis owes an unpriced line

Invariant 4: a line whose item has no `ItemPrice` contributes `0` **and raises a warning**. The
workbook's original sin is `Dublin!AH25` and `!AH51` — `Motorcycle Logo` 9 × €45 and
`MMA Paints - Blue` 1 × €81, **€486.00 counted and never valued, and invisible**: the June 2026
total reads €47,428.28 where the quantities give €47,914.28.

**A total that silently omits unpriced lines is worse than no total.** #9 put the warning on
one count's submit review as a *list of item names*, which is right for one count and wrong for
an aggregate: across thirteen periods and two yards a list of names is a wall nobody reads. So
Analysis owes three things instead, and all three are on the **same surface as the figure**,
never a footnote on another page:

1. **A count, beside every figure it affects** — the yard cell, the period total, and the
   breakdown row each carry `unvaluedHeldLineCount` and render
   `3 held lines have no price and counted as zero.` when it is above zero.
2. **A route to the names** — the sentence is a link to `/stock-entry/counts/<id>/summary`,
   which is #9's surface and already lists `linesWithoutPrice` by name. Analysis states the
   size of the hole; #9's screen names what is in it.
3. **The figure itself, never suppressed.** €486 was invisible because it was absent. Here it
   is visible as *counted, not valued*, next to a total that is honest about being short.

**Only a held line counts.** `unvaluedHeldLineCount` counts lines where `quantity > 0`
(`isHeld`, #10's decimal comparison) **and** `unitPriceSnapshot IS NULL`. A line counted as `0`
with no price contributes zero either way and warning about it would be noise — 35 of 82 rows
in the most recent Dublin count are zero or blank, and a warning that fires on all of them is a
warning nobody reads. A line with `quantity IS NULL` cannot exist on an `APPROVED` count
(Invariant 5).

### 5. The chart is server-rendered SVG, and every part of it is assertable

This project ships **no charting library** and has a dependency fence (`npm run lint`,
`tests/unit/lint-fence.test.ts`). Adding one would put a client bundle, a licence and a second
rendering path into a screen that needs none of them, and #10's finding stands: *a screen that
needs JavaScript is a screen that breaks.*

So the chart is an **inline `<svg>` rendered on the server from the same array that fills the
table**, and it is built in two pieces so that all of it can be checked without a browser:

- `src/lib/analysis-chart.ts` is **pure integer layout**. The viewBox is `520 × 180` because
  520 is exactly `13 × 40`, so thirteen slots divide it with no remainder and the module
  contains no division at all.
- the decimal → coordinate step is `scaleToInteger` in `src/lib/money.ts`, in **`bigint`**,
  beside the arithmetic that is already exact at any size. **There is therefore no `Number(`
  anywhere on this feature's path, not even in the chart** — the usual exemption is not taken,
  and AC-10's scan covers the chart module too.

*A chart nobody can assert is decoration*, so every bar carries the facts a test reads:
`data-testid`, `data-period`, `data-amount` (the exact decimal string the service produced),
and a `<title>`. AC-14 asserts the chart's tuples are **equal** to the table's, so the picture
and the numbers cannot disagree.

### And the answer to "does this screen need a client component"

**No.** Zero `"use client"` modules, as #10 shipped. Every control is an `<a>`; the chart is
markup; there is no form, no server action, no route handler and no `fetch`. The whole screen
works with the JavaScript bundle dead (AC-22).

## Scope boundary with #9, #10 and #12

**In:** the per-yard grid, period completeness, total stock, MoM, YoY, the trend chart, the
breakdown by type and supplier, the unvalued-line disclosure, the period navigation, and the
fix to this page's own identity header.

**Out, and owned elsewhere:**

- **One count's total, its per-line prices and values, the `No price` tags and the approve
  control** are #9's, on `/stock-entry/counts/[id]/summary`. This feature links there and
  computes nothing that surface computes. It joins counts; #9 values one.
- **The calendar, the yard scope selector, the count jumps and the read-only count view** are
  #10's, on `/stock-takes`. Untouched, and money-free for both roles.
- **The `.xlsx` workbook** — Summary, Dublin and Clonmel — is #12. Every figure this screen
  derives is a figure #12 will write into a cell, and #12 will read the same service.
- **Per-yard movement** (`Summary` rows 11–14) is a per-yard difference between *consecutive
  counted* periods — a different join from MoM, over a different completeness rule — and it is
  not in this feature's description. #10 sent it here; this spec sends it to #12 with the
  Summary sheet it belongs to, and records the hand-off in *Out of scope* rather than letting
  it evaporate.
- **Dormant and one-off items and the archive control** are #15.

**No migration, no new table, no new page.** Every column this feature reads was shipped by #4;
`src/app/analysis/page.tsx` has existed since #3 and is **replaced, not created**, so the
`force-dynamic` census stays at the eighteen pages #10 left behind and the derived `loading.tsx`
directory set is unchanged — `src/app/analysis` has been on it since the day the placeholder
shipped (AC-3, AC-23, AC-25).

## User stories

- As an **ADMIN**, I open Analysis and see what each yard was worth in the selected period,
  what the two yards were worth together, and whether that figure is complete.
- As an **ADMIN**, I see this month against last month and against the same month last year,
  joined on the period rather than on "the column to the left", so a skipped month cannot
  quietly compare August with June.
- As an **ADMIN**, when Clonmel has not been counted I am told **that**, and I am not shown a
  total that pretends Clonmel holds nothing.
- As an **ADMIN**, I see thirteen periods of total stock at a glance, with the months nobody
  counted drawn as gaps, so the shape of the year is not a lie.
- As an **ADMIN**, I see which types and which suppliers the money is sitting in, per yard and
  together, so I know where the stock actually is.
- As an **ADMIN**, I am told when a figure is short because something held has no price, how
  much of it there is, and one tap takes me to the count that names the items.
- As the **owner**, I can change a supplier price this afternoon and know that every figure on
  this screen is the same afterwards, to the last of eight decimal places.
- As a **YARD_STAFF** user, I cannot reach this page at all, and the refusal is a service's and
  not a screen's — so no future change to a component can start leaking a price to the yard.
- As a **phone user**, the grid stacks and the document never scrolls sideways at 320 px, even
  when the signed-in address is long.

## Data touched

| Model | Read | Written |
|---|---|---|
| `StockCount` | yes — `APPROVED` for figures, every status for completeness | **never** |
| `StockCountLine` | yes — `quantity` and `unitPriceSnapshot` | **never** |
| `Location` | yes — `active`, `code`, `name`, `sortOrder` | **never** |
| `Item` | yes — `itemTypeId`, `supplierId`, for the breakdown | **never** |
| `ItemType`, `Supplier` | yes — labels and order for the breakdown | **never** |
| `ItemPrice` | **never read, anywhere, by anything in this feature** (AC-8) | never |
| `ItemLocation`, `User` | not read | never |

**This feature writes nothing, anywhere.** No `create`, `update`, `upsert`, `delete` or
`deleteMany` on any model, asserted by source scan and by row counts before and after every
test (AC-4). No new field, no new column, no migration.

**New types** in `src/types/analysis.ts`, a module that holds no runtime. `src/types/stock-count.ts`
is unchanged, which is why 007 AC-17, 009 AC-21 and 010 AC-12 pass unmodified.

## Contract

### Route — one, replaced not created, `export const dynamic = "force-dynamic"`

| Route | Guard | Query |
|---|---|---|
| `/analysis` | `requireAdminPage("analysis")` | `?period=YYYY-MM`, `?breakdown=type\|supplier` |

It keeps #3's `<h1>Analysis</h1>` **verbatim**, because `tests/e2e/role-access.spec.ts` asserts
that exact heading for an `ADMIN` and must pass unmodified, and it keeps
`data-testid="signed-in-email"` and `data-testid="sign-out"`, because an administrator who
lands here must be able to leave. The period label is an `<h2>` carrying
`data-testid="period-heading"`.

`src/lib/auth-config.ts` and `src/middleware.ts` are **byte-identical**: `PROTECTED_PATHS` has
contained `"/analysis"` and the matcher `"/analysis/:path*"` since #3.

**No route handler, no server action, no form, no client component, and no second page.** This
feature only reads, and it emits no JSON: the only body a session can obtain from it is HTML.

### Services and pure modules

| Module | Exports | Touches Prisma |
|---|---|---|
| `src/server/reporting/analysis-service.ts` | `getAnalysis`, `listApprovedPeriods` | yes — **read only** |
| `src/server/reporting/period-series.ts` | `previousPeriodKey`, `priorYearPeriodKey`, `periodWindow`, `comparePeriodKeys` | no — **pure** |
| `src/server/reporting/analysis-input.ts` | `parseAnalysisPeriodParam`, `parseBreakdownParam`, `DEFAULT_BREAKDOWN`, `analysisHref` | no — **pure** |
| `src/lib/analysis-chart.ts` | `TREND_VIEWBOX_WIDTH`, `TREND_VIEWBOX_HEIGHT`, `TREND_PLOT_HEIGHT`, `TREND_SLOT_WIDTH`, `TREND_BAR_WIDTH`, `TREND_MIN_BAR_HEIGHT`, `TREND_WINDOW`, `buildTrendGeometry` | no — **pure** |
| `src/lib/analysis-messages.ts` | every literal a criterion quotes | no — **pure** |
| `src/lib/money.ts` | *(extended)* `subtractDecimals`, `scaleToInteger` | no — **pure** |

`period-series.ts` and `analysis-input.ts` live under `src/server/` because they build on
`parseMonthKey`, `previousMonthKey` and `nextMonthKey` from `@/server/counts/period` rather than
restating month arithmetic, and `docs/architecture.md` forbids `src/lib/**` from importing
`src/server/`. **There is one definition of "the month before this one" in this repository and
this feature does not add a second** — the rule 006 AC-24 exists to enforce. `analysis-chart.ts`
and `analysis-messages.ts` compare and lay out plain values, so they live in `src/lib/` and cost
no new dependency exception.

`src/lib/analysis-messages.ts` **re-exports** the literals #6 and #7 already own —
`COUNT_STATUS_LABEL`, `NOT_COUNTED`, `NO_SUPPLIER`, `formatMonthLabel`, `formatPeriodLabelOf`
— rather than restating them, and AC-22 asserts the identity rather than the spelling. This is
the layout #10 used for `stock-takes-messages.ts`.

### Components

`src/components/analysis/PeriodGrid.tsx`, `VariancePanel.tsx`, `TrendChart.tsx` and
`BreakdownTable.tsx`. None is a client component; none imports anything from `src/server/`.

### Shapes

```ts
type BreakdownKey = "type" | "supplier";

/** COMPARABLE is the only state that carries a number. The other three name the reason. */
type VarianceState =
  | "COMPARABLE"
  | "PERIOD_INCOMPLETE"
  | "AGAINST_INCOMPLETE"
  | "AGAINST_MISSING";

/** One yard in one period. `yardValue` is null unless that yard's count is APPROVED. */
type YardFigure = {
  locationCode: string;
  locationName: string;
  /** The status of that yard's count for this period, or null when there is none. */
  countStatus: CountStatus | null;
  countId: string | null;
  countDate: string | null;          // "YYYY-MM-DD"
  /** Σ (quantity × (unitPriceSnapshot ?? 0)) over the APPROVED count. Exact, unrounded. */
  yardValue: string | null;
  heldLineCount: number;
  /** Held lines with no snapshot: counted, not valued. Invariant 4. */
  unvaluedHeldLineCount: number;
};

type PeriodFigures = {
  periodKey: string;                 // "2026-09"
  periodLabel: string;               // "September 2026"
  /** Invariant 7: every ACTIVE Location has an APPROVED count for this period. */
  complete: boolean;
  /** The names of the active yards without one, in sortOrder. Empty when complete. */
  missingYardNames: string[];
  yards: YardFigure[];               // every ACTIVE Location, in sortOrder
  /** Σ yardValue, exact — ONLY when `complete`. Null otherwise, and NEVER "0". */
  totalStock: string | null;
  unvaluedHeldLineCount: number;
};

type Variance = {
  againstPeriodKey: string;
  againstPeriodLabel: string;
  againstTotal: string | null;
  /** totalStock − againstTotal, exact. Null unless `state` is COMPARABLE. */
  varianceAmount: string | null;
  state: VarianceState;
};

type BreakdownRow = {
  groupKey: string;                  // ItemType.code, Supplier.id, or "" for no supplier
  groupLabel: string;                // "Thermo-P" | "Kelly" | "No supplier"
  perYard: { locationCode: string; amount: string | null }[];
  /** Σ perYard, exact — only when the period is complete. */
  amount: string | null;
  unvaluedHeldLineCount: number;
};

/** One bar of the chart. `totalStock` null is a GAP, and a gap is not a zero. */
type TrendPoint = {
  periodKey: string;
  periodLabel: string;
  complete: boolean;
  totalStock: string | null;
};

/**
 * ADMIN ONLY. `/analysis` is a 307 for a staff session and this shape is never built.
 * It is ALLOWED to carry every monetary fact in this product, and it does.
 */
type AnalysisForAdmin = {
  periodKey: string;
  periodLabel: string;
  breakdownKey: BreakdownKey;
  period: PeriodFigures;
  monthOnMonth: Variance;
  yearOnYear: Variance;
  /** TREND_WINDOW points, oldest first, ending at the selected period. */
  trend: TrendPoint[];
  breakdown: BreakdownRow[];
  /** The previous / next period holding at least one APPROVED count, or null. */
  previousApprovedPeriodKey: string | null;
  nextApprovedPeriodKey: string | null;
  anyApprovedCountEver: boolean;
};

getAnalysis(
  actor: SessionUser | null,
  input: { periodKey: string; breakdownKey: BreakdownKey },
): Promise<AnalysisForAdmin>;

listApprovedPeriods(actor: SessionUser | null): Promise<string[]>;   // ascending
```

### The rules this contract encodes

**Every monetary field carries a money-shaped key, on purpose.** `yardValue`, `totalStock`,
`againstTotal`, `varianceAmount`, `amount` and `unvaluedHeldLineCount` are the six keys
`MONEY_KEY_PATTERN` matches, and they are **all** of the euro-bearing fields on the shape. The
variance is `varianceAmount` and not `difference` precisely so that `deepKeys` is a **census of
this feature's euros** rather than an accident of naming. AC-17 asserts that set exactly, so a
seventh money-shaped key turns it red, and the naming rule is what makes the assertion mean
something.

**What an admin's shape is allowed to contain: everything.** Part 6 gives `ADMIN` every
monetary figure in the product, and this is the surface that carries them. The guarantee is not
that the shape is clean — it is that **the shape is never built for anybody else**:
`getAnalysis` goes through `shapeForRole` from `actor.role` alone, the staff thunk throws
`ForbiddenError`, and the admin builder is asserted to be called **zero** times for a staff
actor with spy thunks and no database (AC-2), exactly as 003 AC-17 and 009 AC-22 do.

**The total is the sum of the exact figures, rounded once.** `totalStock` is
`sumDecimals` over the exact yard values; each figure is rendered
`formatPriceExact(roundHalfUp(v, 2))`. The consequence is stated rather than hidden, as #9
stated it: **the rendered per-yard column may not add to the rendered total to the last cent,
and the total is the correct figure.** The same holds for the breakdown, whose rows are summed
exactly before rounding. Invariant 10 is the reason — four Clonmel prices are non-terminating
workbook formulas, and a stock system that disagrees with the file it replaced, by any amount,
will not be trusted.

**MoM is `(y, m − 1)` and YoY is `(y − 1, m)`, and neither is "the column to the left".**
Part 4 settles YoY in terms: *"never 'twelve columns to the left', which is what the Summary
sheet does today and which breaks the moment a month is skipped"* — `Summary!C9` subtracts the
column **11** months back and compares October 2025 with November 2024. MoM is the same defect
one month wide, and this spec rules it the same way: **month on month means the month before,
or it means nothing.** When `(y, m − 1)` is not complete, the screen says so and names it, and
it does **not** reach further back for the nearest complete period. See *Open questions* 1,
where the one line of the domain model that reads otherwise is recorded.

**The period parameter is parsed with `parseMonthKey`, not `parsePeriodKey`.** `parsePeriodKey`
refuses any year outside 2000–2100, and that cap exists to keep a **write** away from the
`StockCount_periodMonth_range` CHECK #4 shipped. This feature writes nothing, and the e2e suite
reserves years 2103–2105 (AC-24), which `parsePeriodKey` would refuse — producing a `307` that
looks like a routing bug and is a validator doing its job on the wrong side of the boundary. A
source scan asserts `parsePeriodKey` is called nowhere in this feature (AC-16).

**Completeness is computed against the yards that are active now.** Invariant 7 says
*"every `active` Location"*, and `Location` carries no history of its `active` flag, so there is
no other implementable reading. The consequence — deactivating a yard would make historical
periods complete that were not — is real, is not hidden, and is *Open questions* 2.

## UI states

- **Empty.** No `APPROVED` count anywhere: the page renders
  `No approved stock takes yet.` and a single link *Go to Stock Takes* to `/stock-takes`, and
  renders **no** grid, **no** chart, **no** breakdown and **no `€` character at all**. An empty
  database must never render `€0.00`, which is the top-level form of the mistake this whole
  feature is shaped around. A selected period with no approved count at any yard renders the
  grid with every yard `Not counted`, the completeness sentence, and no total. A breakdown with
  no held lines renders `Nothing was held in this period.`
- **Loading.** Every control is a plain link, so the browser's own progress is the loading
  state. There is deliberately **no `loading.tsx`** at or above `src/app/analysis/` (AC-3), and
  the reason is the one #3, #6, #7, #9 and #10 each recorded: a Suspense boundary above a page
  turns a server-side `redirect()` from a `307` into a `200` carrying a shell — and on this
  route the request that degrades is the **`YARD_STAFF` refusal itself**.
- **Error.** A `?period` or `?breakdown` value that cannot be read redirects to `/analysis` and
  renders no error — no query parameter can make the page throw. No Prisma or Postgres string
  ever reaches the screen. A `YARD_STAFF` session is refused before any shape is built.
  Anything else reaches the shared error boundary from #2.
- **Success.** There is no success state, because this feature writes nothing.
- **No JavaScript.** One Server Component tree rendering links and an inline `<svg>`. The
  feature ships no `"use client"` module, so every control — the two breakdown links, the
  period jumps, and every link into a count — works with the bundle disabled (AC-22).

## Acceptance criteria

Tests that touch only `analysis-chart.ts`, `analysis-messages.ts`, `money.ts`,
`period-series.ts` or `analysis-input.ts` are `*.test.ts` and run in `npm run test:unit` with no
database. Tests that read the database are `*.db.test.ts` under `src/server/reporting/`, call
`resetTestDb()` in `beforeEach` and build their own fixture — **every literal euro figure in
these criteria is asserted there, on a hand-built fixture, never against the user's seeded item
master.** Browser-level criteria are Playwright specs named `tests/e2e/analysis-*.spec.ts`,
and they assert **relationships** — that a rendered figure equals one independently recomputed
from the rows they seeded — because a literal euro asserted against the real master would be an
assertion about the user's data, which is the choice 007's start spec recorded and 008 repeated.

1. **AC-1** — **The route is closed to a signed-out request, refused to a staff session, open to an `ADMIN`, and no route protection is added.** An unauthenticated `GET` of `/analysis` responds `307` (or `302`) to `/sign-in?callbackUrl=%2Fanalysis` and sends none of the page's content; signing in from there lands on `/analysis`. Signed in as `YARD_STAFF`, `GET /analysis` responds `307` to `/stock-entry?denied=analysis`, sends **no part of the page body** — asserted on the raw response, not on the rendered DOM — and `/stock-entry` then renders #3's `ACCESS_DENIED_MESSAGE` in `data-testid="access-denied"`. Signed in as `ADMIN` it returns `200` and renders an `<h1>` whose text is exactly `Analysis`, a `data-testid="signed-in-email"` carrying the signed-in email, a `data-testid="sign-out"` control that ends the session, and a `data-testid="period-heading"` `<h2>`. `src/lib/auth-config.ts` and `src/middleware.ts` are **byte-identical** to their state before this feature, and `tests/e2e/role-access.spec.ts`, `tests/e2e/route-protection.spec.ts` and `tests/e2e/sign-in.spec.ts` pass **unmodified**, so 003 AC-9, AC-14, AC-15 and AC-16 still hold against the real page rather than against a placeholder.
2. **AC-2** — **The refusal is the service's, not the middleware's and not the screen's, and the admin shape is never built for a staff actor.** `getAnalysis(staffActor, input)` and `listApprovedPeriods(staffActor)` each raise `ForbiddenError` whose message is exactly `ADMIN is required for this action` — the string 006 AC-4 pins — and `getAnalysis` routes through `shapeForRole` from `actor.role` alone: a unit test with **no database** passes spy thunks and asserts the admin builder is called **zero** times for a `YARD_STAFF` actor and exactly once for an `ADMIN`, as 003 AC-17 does. Called with a `null` actor each raises `UnauthorizedError`. The implementer then reproduces 003 AC-16 against the **real** page rather than the placeholder: with `"/analysis"` removed from `PROTECTED_PATHS` in `src/lib/auth-config.ts` and the tree rebuilt, a `YARD_STAFF` `GET /analysis` **still** responds `307` to `/stock-entry?denied=analysis` and its body contains no `€`; the file is then restored and `git status --porcelain -- src/lib/auth-config.ts` is empty and its hash identical. Both observations and the restored hash are recorded in `progress/impl_analysis.md`.
3. **AC-3** — **The refusal stays the server's answer, and the probe is the one that can actually degrade.** In the shipped tree no `loading.tsx` or `loading.ts` exists in any directory on the path from `src/app` to any `page.tsx` outside `src/app/(public)/`, and the derived assertion in `tests/unit/stock-entry-contract.test.ts` — which already covers `src/app/analysis`, because the placeholder page has been in the tree since #3 — passes **unmodified**. The implementer reproduces the degradation before closing: adding `src/app/analysis/loading.tsx` turns the **`YARD_STAFF` refusal** of `/analysis` from a `307` with a `Location` header into a `200` with none, and the file is then removed and the tree rebuilt. That request is the correct probe and the **unauthenticated** one is not, for the reason 010's third amendment recorded: the signed-out refusal is the middleware's, `PROTECTED_PATHS` has held `/analysis` since #3, and the middleware answers before any Suspense boundary exists. Both status codes are recorded in `progress/impl_analysis.md`.
4. **AC-4** — **Every service function takes an explicit actor, reads nothing else from the request, and this feature writes nothing anywhere.** `getAnalysis` and `listApprovedPeriods` each take `actor: SessionUser | null` as their first parameter and begin with `assertRole(actor, "ADMIN")`; the actor comes from `requireAdminPage("analysis")` and from nowhere else. `getAnalysis`'s only other argument is `{ periodKey, breakdownKey }` — asserted by its signature, which accepts no filter, no role and no page state. A source scan of `src/server/reporting/**`, `src/app/analysis/**` and `src/components/analysis/**` finds no `.create`, `.createMany`, `.update`, `.updateMany`, `.upsert`, `.delete` or `.deleteMany` applied to any model, and no `db.` reference at all outside `analysis-service.ts`. Across every test in this feature the row counts of `StockCount`, `StockCountLine`, `Item`, `ItemPrice`, `ItemLocation`, `Supplier`, `ItemType`, `Location` and `User` are identical before and after, and so is every column of every fixture count and every fixture line.
5. **AC-5** — **Only an `APPROVED` count carries a euro, and the other two statuses are shown rather than hidden.** On a fixture period where Dublin's count is `APPROVED`, Clonmel's is `SUBMITTED`, and a third active yard would be absent: `getAnalysis` returns Dublin's `yardValue` as the exact sum of its line values, Clonmel's `yardValue` as **`null`** with `countStatus === "SUBMITTED"` and its `countId` populated, and `period.complete === false`. Changing Clonmel's count to `DRAFT` gives `yardValue === null` and `countStatus === "DRAFT"`; approving it gives a non-null `yardValue` and `complete === true`, and **no other field of the Dublin figure changes**. On the page, the Clonmel cell renders `Submitted` from `COUNT_STATUS_LABEL` with a link to `/stock-takes/counts/<id>`, renders **no** `€` character inside `data-testid="yard-cell-CLONMEL"`, and in particular does not render `€0.00`. A `*.db.test.ts` asserts that a `SUBMITTED` count whose lines already hold `unitPriceSnapshot` values contributes **nothing** to `totalStock`, `trend`, `monthOnMonth`, `yearOnYear` or any `breakdown` row — the snapshots exist and are deliberately not read.
6. **AC-6** — **A missing month is a gap and never a zero, in every figure on the screen.** For a period where Dublin is `APPROVED` and Clonmel has no count at all: `period.complete` is `false`, `missingYardNames` is `["Clonmel"]`, `totalStock` is **`null`** (not `"0"`), every `breakdown[].amount` is `null` while every `breakdown[].perYard` entry for Dublin is a figure, and both variances have a `state` other than `COMPARABLE`. The page renders `Clonmel has no approved count for September 2026.` in `data-testid="period-incomplete"`, renders `Not counted` in `data-testid="yard-cell-CLONMEL"`, and renders **no** `€` inside `data-testid="total-stock"`: it renders `Incomplete` there, and in every breakdown row's total cell, never a figure and never `Not counted` — a total is not a yard, and `Not counted` printed beside Dublin's figure reads as if nobody counted at all. With both yards missing the sentence is `Dublin and Clonmel have no approved count for September 2026.`. **The converse is asserted in the same test:** a period in which both yards are `APPROVED` and every quantity is `0` has `complete === true` and `totalStock === "0"`, and the page renders `€0.00` in `data-testid="total-stock"` — counted-and-empty and never-counted are two different facts and render differently. With **no** approved count anywhere in the database the page renders `No approved stock takes yet.`, a link *Go to Stock Takes* whose `href` is `/stock-takes`, and its entire HTML contains **zero** `€` characters. The page half of that sentence is proved by rendering `src/app/analysis/page.tsx` on the server with its services mocked, in a test the gate runs with no database: a database with **no** approved count anywhere cannot exist in the shared end-to-end suite, because other specs' reserved-year counts always do (post-approval amendment, 2026-09-24).
7. **AC-7** — **The per-yard figures and the total, against a fixture whose arithmetic is done by hand.** On a `*.db.test.ts` fixture of two yards in one period — Dublin holding `9.83 × 890`, `21.6128 × 6.11764706` and `0 × 45`, Clonmel holding `0.475 × 33.09` and one held line of quantity `7` whose `unitPriceSnapshot` is `null` — `getAnalysis` returns Dublin's `yardValue` as exactly `"8880.919482378368"`, Clonmel's as exactly `"15.71775"`, and `totalStock` as exactly `"8896.637232378368"`, each asserted as that literal string. The page renders them `€8,880.92`, `€15.72` and `€8,896.64` through `formatPriceExact(roundHalfUp(v, 2))`, in `data-testid="yard-cell-DUBLIN"`, `data-testid="yard-cell-CLONMEL"` and `data-testid="total-stock"`. **The total is the sum of the exact yard values rounded once, not the sum of the rounded yards:** a unit test builds a fixture for which the two differ and asserts the service returns the former. `totalStock` is stored nowhere — a `*.db.test.ts` asserts no column of `StockCount` or `StockCountLine` holds it and `prisma/schema.prisma` has no `value` or `total` column (Invariant 1).
8. **AC-8** — **Prices are frozen at approval: this feature cannot read the price list, and no price-list edit moves a figure.** A source scan of `src/server/reporting/**`, `src/app/analysis/**` and `src/components/analysis/**` finds no occurrence of `itemPrice`, `ItemPrice`, `selectCurrentPrice`, `priceAmountOf`, `effectiveFrom` or `todayIso`, and `analysis-service.ts` selects `unitPriceSnapshot` from `StockCountLine` and from nothing else. Against the database: capture the complete `AnalysisForAdmin` value for a period of two approved counts; then perform each of five operations — add an `ItemPrice` effective **before** `countDate`, add one effective **on** `countDate`, add one effective **after** it, add a first-ever `ItemPrice` for the item that had none, and archive an item (`active = false`) that the count references — and after **each**, `getAnalysis` returns a value **deeply equal** to the captured one, including every `yardValue`, `totalStock`, every `breakdown` row and every `trend` point. This is the single most damaging thing this screen could do, so it is asserted five ways and by an absence, not by a comment.
9. **AC-9** — **Invariant 4: a held line with no price counts zero, says so beside the figure it shortens, and links to the names.** On a fixture where Dublin holds 3 lines with `quantity > 0` and `unitPriceSnapshot IS NULL`, 4 lines counted as `0` with no snapshot, and 40 priced lines: `unvaluedHeldLineCount` is **`3`** on the Dublin `YardFigure`, is `3` on `PeriodFigures`, and is the per-group count on each affected `breakdown` row — **the four zero-quantity unpriced lines are counted nowhere**, because a line counted as none is not stock that failed to be valued. The three lines contribute `0` to `yardValue`, which is asserted by comparing the figure with the same fixture minus those three lines: the two are equal. The page renders `3 held lines have no price and counted as zero.` in `data-testid="unvalued-lines"` beside the Dublin cell, `1 held line has no price and counted as zero.` when there is one, and the sentence is an anchor whose **path** is `/stock-entry/counts/<the Dublin count id>/summary`, carrying the current `?period` and `?breakdown` under AC-16's one rule for every link. With zero such lines the element is absent entirely, asserted by absence. A group whose only held lines are unpriced renders its row with `€0.00` **and** the sentence — it is never omitted from the breakdown, because €486 counted and never valued was invisible and that is the defect this criterion exists for.
10. **AC-10** — **Decimal arithmetic everywhere, including inside the chart: no JavaScript `number` touches a quantity, a price or a figure on this path.** `subtractDecimals` and `scaleToInteger` in `src/lib/money.ts` are unit-tested with no database: `subtractDecimals("8896.637232378368", "8748.7")` is `"147.937232378368"`; `subtractDecimals("100", "150")` is `"-50"`; `subtractDecimals("9.50", "9.5")` is `"0"`; `subtractDecimals("0", "0.0001")` is `"-0.0001"`. `scaleToInteger(value, max, range)` returns an integer **string**, half away from zero, clamped to `[0, range]`: `scaleToInteger("50", "100", 160)` is `"80"`, `("100","100",160)` is `"160"`, `("0","100",160)` is `"0"`, `("1","3",160)` is `"53"`, `("2","3",160)` is `"107"`, `("0","0",160)` is `"0"`, `("200","100",160)` is `"160"`, and `("0.0001","1000000",160)` is `"0"`. A source scan finds **no** `Number(`, `parseFloat`, `toFixed` or `Math.round` anywhere in `src/lib/analysis-chart.ts`, `src/server/reporting/**`, `src/app/analysis/**` or `src/components/analysis/**` — **no exemption is taken for the chart**, because `scaleToInteger` is `bigint` arithmetic and `TREND_VIEWBOX_WIDTH` is `520 = 13 × 40` exactly, so the layout needs no division at all. `src/lib/money.ts` still names `unitPrice` **nowhere**, so 006 AC-31's `src/lib/**` zero-file assertion passes unmodified, and the two new functions take neutrally named parameters for that reason.
11. **AC-11** — **Month on month is `(y, m − 1)`, joined on the period, and it refuses rather than reaching further back.** With `2026-08` and `2026-09` both complete, `monthOnMonth.againstPeriodKey` is `2026-08`, `state` is `COMPARABLE`, and `varianceAmount` is exactly `subtractDecimals(total(2026-09), total(2026-08))` — asserted as a literal string on a hand-built fixture, positive when stock rose and negative when it fell, with the page rendering `−€1,234.56` for a fall and `€1,234.56` for a rise in `data-testid="mom-variance"`. With `2026-08` **incomplete** — one yard approved, one not — `state` is `AGAINST_INCOMPLETE`, `varianceAmount` is `null`, the page renders `Not comparable — August 2026 is incomplete.` and **does not** fall back to `2026-07`, which is complete in the same fixture: asserted directly, because silently comparing September with July is the workbook defect this rule exists to prevent. With no count at all for `2026-08`, `state` is `AGAINST_MISSING` and the sentence is `Not comparable — there is no count for August 2026.`. With the **selected** period incomplete, `state` is `PERIOD_INCOMPLETE` and the sentence is `Not comparable — this period is incomplete.`. `previousPeriodKey("2026-01")` is `"2025-12"`, asserted in `npm run test:unit`.
12. **AC-12** — **Year on year is `(y − 1, m)` and never twelve columns to the left.** With `2025-09` and `2026-09` both complete and **`2025-10` through `2026-08` containing gaps**, `yearOnYear.againstPeriodKey` is `2025-09` — not the twelfth-most-recent period with a count, and not the eleventh, which is the `Summary!C9` defect (`=C5-N5` compares October 2025 with November 2024). The fixture is built to make the three answers differ: a test asserts the returned key is `2025-09`, and that the two keys an ordinal walk would produce are **not** returned. `priorYearPeriodKey("2026-01")` is `"2025-01"` and `priorYearPeriodKey("2026-12")` is `"2025-12"`, asserted in `npm run test:unit`. The four `VarianceState` outcomes of AC-11 are asserted again for YoY with the same sentences, against `2025-09`.
13. **AC-13** — **The period arithmetic is pure, unit-tested with no database, and there is only one definition of it.** `periodWindow("2026-09", 13)` returns exactly thirteen keys, oldest first, `["2025-09", …, "2026-09"]`, so the **leftmost point of the window is the year-on-year comparand** — that is why the constant is 13 and not 12. `periodWindow("2026-02", 13)[0]` is `"2025-02"`. `comparePeriodKeys("2025-12", "2026-01")` is `-1`, `("2026-01","2026-01")` is `0`, `("2026-01","2025-12")` is `1`. Every function in `src/server/reporting/period-series.ts` is pure: it imports `previousMonthKey`, `nextMonthKey` and `parseMonthKey` from `@/server/counts/period` and defines no month arithmetic of its own, asserted by a source scan finding no `new Date` and no `Date.UTC` in the module. `src/server/counts/period.ts` is **byte-identical** after this feature.
14. **AC-14** — **The chart is server-rendered SVG, its geometry is pure, a gap is not a zero, and the picture cannot disagree with the table.** `buildTrendGeometry(points)` is unit-tested with no database and no browser: given thirteen points it returns thirteen entries in the same order; `TREND_VIEWBOX_WIDTH` is `520`, `TREND_SLOT_WIDTH` is `40`, `TREND_WINDOW` is `13` and `520 === 13 * 40` is asserted as an equality so the constants cannot drift apart; a point with the largest `totalStock` gets `height === TREND_PLOT_HEIGHT`; a point at exactly half of it gets `height` equal to `TREND_PLOT_HEIGHT / 2`; a **complete** point whose total is `"0"` gets `height === TREND_MIN_BAR_HEIGHT` and `TREND_MIN_BAR_HEIGHT` is at least `1`; an **incomplete** point gets `bar: false` and no height at all; `x` values are strictly increasing and the last bar's `x + TREND_BAR_WIDTH` does not exceed `TREND_VIEWBOX_WIDTH`. In the browser, `data-testid="trend-chart"` is one `<svg>` carrying a `viewBox` of `0 0 520 180`, `role="img"`, a `<title>` reading `Total stock by period`, and **no fixed pixel width**; it contains one `data-testid="trend-bar"` per complete period and one `data-testid="trend-gap"` per incomplete one, their sum is exactly `13`, each carries `data-period`, each bar carries `data-amount` equal to the exact decimal string the service produced, and each gap carries **no** `data-amount`. **The chart and the table are the same numbers:** the list of `(data-period, data-amount)` tuples parsed from the chart is **equal**, in order, to the list parsed from `data-testid="trend-row"` elements in the accompanying table. `package.json`'s `dependencies` and `devDependencies` are **byte-identical** — no charting library is added — and `tests/unit/lint-fence.test.ts` passes unmodified.
15. **AC-15** — **The breakdown, by type and by supplier, per yard and together.** `?breakdown=type` (and no `?breakdown` at all) renders `data-testid="breakdown"` with one `data-testid="breakdown-row"` per `ItemType` holding at least one held line in the period, in `ItemType.sortOrder`, each carrying the type name, one amount cell per active yard in `Location.sortOrder`, and a total cell. `?breakdown=supplier` renders one row per `Supplier` with something held, ordered by name ascending with **`No supplier` last**, that row covering every item whose `supplierId` is `null` — `Dublin!A45` `School Logo Triangle` is the real case. Both links are present, the current one carries `aria-current="true"` and the other does not, and both carry the current `?period`. Against a hand-built `*.db.test.ts` fixture the per-yard amounts and the row totals are asserted as literal strings, `sumDecimals` of the rows equals `period.totalStock` **exactly**, and the rendered column is permitted to differ from the rendered total by the rounding of individual rows — the stated cost of rounding once, asserted as *the exact sums agree* rather than *the printed strings add up*. A group with nothing held does not appear; with no rows at all the page renders `Nothing was held in this period.` in `data-testid="breakdown-empty"`. For an incomplete period every `amount` is `null` and the total cell renders no `€`, while the per-yard cell of an approved yard still renders its figure.
16. **AC-16** — **The period and breakdown parameters, the default view, the jumps, and the parser that is not `parsePeriodKey`.** With no `?period`, `/analysis` opens on the **latest period holding at least one `APPROVED` count**, and when there is none it opens on the month containing today in the yard and renders the empty state — asserted directly (the page half by AC-6's server render), including that it does **not** open on the latest *complete* period when a later incomplete one exists, because a yard that has not counted is the thing an administrator most needs to see. `?period=2026-09` selects that period; `?breakdown=supplier` selects that grouping; every link the page renders — the two breakdown links, *Previous period*, *Next period*, and every link into a count — carries the current `?period` and `?breakdown` except where the criterion above says otherwise. *Previous period* and *Next period* jump to the nearest **earlier / later period holding an `APPROVED` count**, skipping the months nobody counted; where there is none the control still renders, with the same `data-testid` and label, as a non-anchor carrying `aria-disabled="true"`. `parseAnalysisPeriodParam` is pure and unit-tested with no database: it accepts `"2026-09"` and **`"2105-03"`**, and returns `null` for `"banana"`, `"2026-13"`, `"2026-1"`, `""`, an array of two values, and `undefined`; a source scan asserts `parsePeriodKey` is called **nowhere** under `src/server/reporting/**` or `src/app/analysis/**`, because its 2000–2100 cap guards a write and this feature performs none. A `?period` or `?breakdown` value it refuses responds `307` to `/analysis` and renders no error.
17. **AC-17** — **The money-key walk, for both roles, over every shape this feature adds — and the admin's set is asserted exactly.** For a `YARD_STAFF` actor, `getAnalysis` and `listApprovedPeriods` **raise before building anything**, so there is no value to walk: the criterion is AC-2's zero-call assertion plus this one, that no code path exists which returns a shape to a staff actor — asserted by a source scan finding no `forStaff` branch in `analysis-service.ts` that returns an object. For an **`ADMIN`** actor, `deepKeys(await getAnalysis(admin, input))` filtered by `MONEY_KEY_PATTERN` is, as a **set**, exactly `{ againstTotal, amount, totalStock, unvaluedHeldLineCount, varianceAmount, yardValue }` — six keys, no more and no fewer, so a seventh money-shaped key turns it red — and `assertNoMoneyKeys` is **not** applied to it, deliberately: this is the one shape in the product that is allowed to carry every monetary fact, and the guarantee is that it is never built for anybody else. A second assertion pins the naming rule that makes the first one a census: **every field of `AnalysisForAdmin` that carries a euro is one of those six**, asserted by walking the value and checking that no key outside the set holds a string matching `^-?\d+(\.\d+)?$` that is also equal to one of the six figures the fixture computed.
18. **AC-18** — **Role cannot be influenced by anything the client sets.** Signed in as `YARD_STAFF`, a `GET` of `/analysis`, of `/analysis?period=2026-09` and of `/analysis?breakdown=supplier`, each carrying the query string `?role=ADMIN`, the header `x-user-role: ADMIN` and the cookie `role=ADMIN` simultaneously, still responds `307` to `/stock-entry?denied=analysis` and still sends no part of the page body. Signed in as `ADMIN`, the same three vectors carrying `YARD_STAFF` change nothing: the rendered body is byte-identical to the same request without them. The test asserts the responses, not the source code.
19. **AC-19** — **The euro lives on exactly two surfaces in this product, and this is the second.** Fetched for an `ADMIN`, the HTML of `/analysis` contains `€`; fetched for an `ADMIN`, the HTML of `/stock-entry`, `/stock-entry/counts/<id>`, `/stock-entry/counts/<id>/submit`, `/stock-takes` and `/stock-takes/counts/<id>` still contains **none** — so 009 AC-21, 009 AC-22 and 010 AC-12 pass unmodified and the only two euro-bearing routes in the tree are `/analysis` and `/stock-entry/counts/[id]/summary`. No page, component or service this feature adds is reachable by a `YARD_STAFF` session: a test enumerates every module under `src/app/analysis/**`, `src/components/analysis/**` and `src/server/reporting/**` and asserts none is imported from any module under `src/app/stock-entry/**`, `src/app/stock-takes/**` or `src/server/counts/**`, so no future edit to a shared screen can pull one in. A source scan of those three trees finds no occurrence of `"YARD_STAFF"` — there is no staff rendering of this screen to keep money-free, because there is no staff rendering of it at all.
20. **AC-20** — **Phone-first, measured, and the identity header that has overflowed on three routes is fixed here.** At a 390 × 844 viewport and again at **320 px**, signed in as `ADMIN`, on `/analysis` with no query, with `?breakdown=supplier`, on a complete period and on an incomplete one: `document.documentElement.scrollWidth` does not exceed its `clientWidth` — the document never scrolls sideways. The empty state is **not** measured in the browser: it cannot be reached in the shared end-to-end database (AC-6), and that is recorded here rather than silently replaced by a different period. **The session signs in with an email whose local part is a single unbreakable run of at least 61 characters** — no hyphen, no dot, no other break opportunity — because `createTestUser` builds `${label}-${16 hex}@macroads-e2e.invalid` and every fixture label in this suite is hyphenated, and *a layout guarantee asserted only against fixture data is a guarantee about the fixture* (010's seventh amendment). 61 is the length that produced `scrollWidth 424` against a 390 px viewport at `text-sm`; **`src/app/analysis/page.tsx:21` renders the same element at `text-base`, which is wider and therefore overflows sooner**, so the implementer **watches the test fail before the source change**, records the measured `scrollWidth` at 390 px and at 320 px and the measured break-even character count at `text-base` in `progress/impl_analysis.md`, guards the test's constant at the **measured** figure with the arithmetic in a comment beside it, and stops and reports if the test goes green before the fix. The header wraps rather than widening the document. The grid **stacks on the phone and is a grid on the desktop**: at 390 px every `data-testid="yard-cell-*"` has its left edge within 4 px of the left edge of `data-testid="total-stock"` (one column), and at 1280 px they do not (a row) — asserted as bounding boxes, not as class names. The trend chart's bounding box lies entirely within the viewport at both widths. Every control the flow touches — the two breakdown links, *Previous period*, *Next period* and every link into a count — has a bounding box of at least **44 × 44** CSS px, except links inside a sentence.
21. **AC-21** — **No database error text ever reaches the screen, and no query parameter can make the page throw.** For each of six provoked inputs — `?period=banana`, `?period=2026-13`, `?period=` (empty), `?period` repeated twice, `?breakdown=banana` and `?breakdown` repeated twice — the response is a `307` to `/analysis` or the page's own content, never a `500`, and the rendered HTML contains none of `prisma`, `Prisma`, `violates`, `constraint`, `SQLSTATE`, `23514`, `23505`, `P2002`, `P2025` or a stack frame. Every function in `src/server/reporting/analysis-service.ts` throws only `NotFoundError`, `ValidationError`, `ForbiddenError` or `UnauthorizedError` from `src/server/errors.ts`, never a bare `Error`, asserted by source scan. A period far outside any data — `?period=1999-01` — returns `200` and renders the never-counted state for that period rather than an error.
22. **AC-22** — **The strings are single-sourced by re-export, nothing here needs JavaScript, and the fence stays green.** Every literal quoted by any criterion above is exported from `src/lib/analysis-messages.ts` and asserted **from that module**, so the screen and the test cannot drift apart. The literals #6 and #7 already own are **re-exported, not restated**: a unit test asserts equality by identity — the status-label record is the same object as `COUNT_STATUS_LABEL`, and `Not counted` and `No supplier` are the same strings as `NOT_COUNTED` and `NO_SUPPLIER`. `src/lib/analysis-messages.ts` and `src/lib/analysis-chart.ts` import nothing from `src/server/` except `@/server/errors`, keeping `npm run lint`'s dependency fence green and `tests/unit/lint-fence.test.ts` passing unmodified. **This feature ships no `"use client"` module**: a source scan of `src/app/analysis/**` and `src/components/analysis/**` finds none, `docs/architecture.md` gains **no** new dependency exception, and in a `javaScriptEnabled: false` context the page renders with its grid, its chart and its breakdown, and the two breakdown links, both period jumps and every link into a count all navigate.
23. **AC-23** — **Which checks survive with no database,** mirroring 003 AC-23, 006 AC-32, 007 AC-29, 008 AC-32, 009 AC-31 and 010 AC-20. With `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointing at a hostname that does not resolve: `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` each exit `0`, and both `init` scripts exit `0` ending with `[OK] Environment ready (database checks skipped)`. No module this feature adds opens a connection at import time. This feature adds **no** `page.tsx` — `src/app/analysis/page.tsx` has existed since #3 and is **replaced** — so 010 AC-20's derived `force-dynamic` census still finds the same set it found before, and the number it asserts is **derived from the tree by the test rather than copied from this sentence**; if the derivation disagrees with any count written in this spec, the tree wins and the spec is amended, as 010's second amendment ruled when a stated 19 turned out to be 18. The criteria provable without Postgres are AC-2's spy-thunk half, AC-4's scan half, AC-8's scan half, AC-10, AC-13, AC-14's geometry half, AC-16's parser half, AC-19's import-graph half, AC-21's throw-scan half, AC-22's module half, AC-23 itself, AC-25's scan half and AC-26; every other criterion needs a database or a browser and lives in `*.db.test.ts` or `tests/e2e/`.
24. **AC-24** — **The gate is green in full, and the e2e suite stays self-cleaning at `retries: 0`.** `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, `npx prisma migrate status` and `npm run test:db` all pass, and `./init.ps1` ends with `[OK] Environment ready` having **executed** the database checks. Two new specs, `tests/e2e/analysis-access.spec.ts` and `tests/e2e/analysis-figures.spec.ts`, run in the **`chromium-stock-entry`** project — they seed counts against the yard sheets, which is the collision `playwright.config.ts` separates the two projects to avoid — so the only change to that file is its two route patterns, which become `/(stock-entry|stock-takes|analysis)-.*\.spec\.ts/` in both the `chromium` `testIgnore` and the `chromium-stock-entry` `testMatch`; `git diff -- playwright.config.ts` shows no other changed line, and `retries: 0`, `workers: 3`, `fullyParallel: false`, both timeouts, the `dependencies` array and the `webServer` block are byte-identical. `RESERVED_YEAR` in `tests/e2e/support/stock-entry.ts` gains `analysisAccess: 2103`, `analysisPrior: 2104` and `analysisFigures: 2105`; the figures spec owns **two adjacent years**, deliberately and for the first time, because a year-on-year fixture needs `(y − 1, m)` and there is no free adjacent pair at or below 2100 — and it deletes **both of its own** in `beforeAll` and `afterAll`, never the range, and asserts through `realCountIds()` that the set of `StockCount` ids with `periodYear < 2090` is identical before and after (007 AC-30). Because a spec may now name more than one year, the census in `tests/unit/stock-entry-contract.test.ts` changes from reading the **first** `RESERVED_YEAR.<key>` in each file to reading **every** one of them, its invariant becomes *no year key is named by two different spec files*, and its two equalities become **14** spec files and **15** distinct year keys — each derived by the test from the tree, not copied from here. Two consecutive full `npm run test:e2e` runs report `0 flaky` and `0 failed`; if the suite is not stable at `retries: 0`, the implementer reports that rather than restoring retries or raising a timeout.
25. **AC-25** — **No migration, no new table, and an exact list of what this feature is allowed to touch.** `prisma/schema.prisma`, every directory under `prisma/migrations/` and `prisma/migrations/migration_lock.toml` are **byte-identical** to their state before this feature — every column it reads was shipped by #4 — and `npx prisma migrate status` reports no drift and no pending migration. `TRUNCATED_TABLES` in `src/server/test-db.ts` is unchanged and still equal as a set to exactly `["Item", "ItemLocation", "ItemPrice", "ItemType", "StockCount", "StockCountLine", "Supplier", "User"]`, so **020 AC-4's `information_schema` equality passes untouched**. The following are **byte-identical** after this feature: `src/middleware.ts`, `src/lib/auth-config.ts`, `src/types/stock-count.ts`, `src/lib/money-boundary.ts`, `src/lib/count-messages.ts`, `src/lib/stock-takes-messages.ts`, `src/lib/held.ts`, `src/lib/stock-takes-view.ts`, and every file under `src/app/stock-entry/**`, `src/app/stock-takes/**`, `src/app/item-master/**`, `src/app/api/**`, `src/components/stock-entry/**`, `src/components/stock-takes/**`, `src/components/item-master/**`, `src/server/counts/**`, `src/server/items/**` and `src/server/auth/**` — in particular `/stock-entry`'s identical unprotected identity header is **not** fixed here and stays a recorded debt against 008 AC-30, for the same reason #10 gave: a feature does not reach into another screen, even to improve it. The only shipped source file this feature edits is `src/lib/money.ts` (AC-10); the only shipped page it replaces is `src/app/analysis/page.tsx`; the only shipped non-source files it edits are `playwright.config.ts`, `tests/e2e/support/stock-entry.ts`, `tests/unit/stock-entry-contract.test.ts`, `tests/unit/project-contract.test.ts` and `src/lib/money.test.ts`, each amended exactly as AC-24, AC-26 and AC-10 name and no further. `git status --porcelain -- Samples` is empty.
26. **AC-26** — **The permitted-module lists are amended as exact lists of files, never as a directory exemption.** In `tests/unit/project-contract.test.ts`, 009 AC-26's eleven-file `unitPrice` list becomes **twelve**, the single addition being `src/server/reporting/analysis-service.ts`, and a thirteenth module naming the column turns it red; its companion assertion, which held `unitPriceSnapshot` to exactly the two lifecycle modules, becomes an exact **three**-file list with the same addition. `src/lib/**` and `scripts/**` stay at **zero** files naming `unitPrice` — which is why `scaleToInteger` and `subtractDecimals` take `value`, `max`, `range`, `left` and `right` — and under `src/app/**` and `src/components/**` the permitted list stays at exactly the three item-master files #6 named: **this feature's screens render a euro without naming the column**, because every figure crosses the boundary on a field the shape declares. The `signatureSvg` assertion is unchanged at one file. Each amendment keeps its non-vacuity assertion, and the reason for the addition is written into the test's own comment: **the price snapshot is the only source of a euro in this product, and Analysis is the feature that joins them across periods — the alternative is to forbid the only module that can value history from naming the column it values it from.**
27. **AC-27** — **The guarantees are proved by mutation, because TypeScript does not protect any of them.** Before closing, the implementer breaks each of six guarantees on purpose, records the failing test name and the exit code in `progress/impl_analysis.md`, and restores the tree byte-identically (verified by `git status --porcelain` and a hash): (1) value `SUBMITTED` counts as well as `APPROVED` — AC-5 goes red; (2) render a missing yard as `"0"` instead of `null` — AC-6 goes red; (3) read the price from `ItemPrice` in force on `countDate` instead of from `unitPriceSnapshot` — AC-8 goes red, and the implementer records that `npm run typecheck` stayed exit `0` while it was broken; (4) count zero-quantity unpriced lines in `unvaluedHeldLineCount` — AC-9 goes red; (5) fall back to the nearest earlier complete period when `(y, m − 1)` is incomplete — AC-11 goes red; (6) draw a zero-height bar for an incomplete period instead of a gap — AC-14 goes red. If any mutation leaves the suite green, **that is the finding**, and it is reported rather than patched over.

## There is no criterion about criteria here, deliberately

#9's ruling, restated by #10: **a criterion whose subject is other criteria has no mechanical
check and no owner**, so any change anywhere falsifies it and nothing recomputes it. It was
wrong four times in #9. This spec therefore contains **no criterion that counts or enumerates
other criteria**. Every shipped assertion this feature amends is named inside the criterion that
forces it, and nowhere else:

| Shipped assertion amended | Forced by | Why it cannot stay as it is |
|---|---|---|
| `tests/unit/project-contract.test.ts` — the eleven-file `unitPrice` list | **AC-26** | The reporting service must read the snapshot to value anything |
| `tests/unit/project-contract.test.ts` — the two-file `unitPriceSnapshot` list | **AC-26** | The same module, the same column |
| `tests/unit/stock-entry-contract.test.ts` — the reserved-year census | **AC-24** | Two new specs, and one of them owns two years, which the `exec`-based selection cannot see |
| `tests/unit/stock-entry-contract.test.ts` — the two project-pattern assertions | **AC-24** | The analysis specs seed against the yard sheets and must run in the second project |
| `playwright.config.ts` — two route patterns | **AC-24** | The same |
| `tests/e2e/support/stock-entry.ts` — `RESERVED_YEAR` | **AC-24** | Three years added, and the one-year-per-file note becomes one-or-two |
| `src/lib/money.ts` — two new exported functions | **AC-10** | Subtraction and the decimal → coordinate step, in the one module that does exact arithmetic |

Everything else passes **unmodified**: 003 AC-9, AC-14, AC-15, AC-16, AC-17; 006 AC-4, AC-24,
AC-31's `src/lib` and `src/app`/`src/components` halves; 007 AC-3, AC-17, AC-25, AC-30;
008 AC-9, AC-18, AC-22; 009 AC-21, AC-22, AC-26's `signatureSvg` half, AC-30; 010 AC-2, AC-12,
AC-20, AC-22; 020 AC-4; `tests/unit/lint-fence.test.ts`; `tests/unit/hashing-boundary.test.ts`;
and every `*.db.test.ts` and `tests/e2e/*.spec.ts` shipped by #3 through #20. If any of those
cannot pass unmodified, that is a blocker to report in `progress/impl_analysis.md`, not a
licence to edit it.

## Out of scope

- **Any figure that belongs to one count.** Per-line prices, per-line values, the `No price`
  tag, one count's total and the approve control are #9's, on
  `/stock-entry/counts/[id]/summary`. This feature links there and duplicates none of it.
- **The calendar, the yard scope selector, the count jumps and the read-only count view.**
  #10's, on `/stock-takes`, money-free for both roles and byte-identical after this feature.
- **Per-yard movement between consecutive counted periods** (`Summary` rows 11–14). It is a
  different join from MoM — *consecutive counted*, not *adjacent period* — over a different
  completeness rule, it is not in this feature's description, and putting two variance
  definitions on one screen is how the `Summary` sheet ended up comparing October 2025 with
  November 2024. It goes to **#12** with the Summary sheet it is a row of. Recorded here so the
  hand-off #10 made has an owner rather than evaporating.
- **A percentage change.** The `Summary` sheet shows an absolute difference and so does this
  screen. A percentage of a euro total needs a division and a rounding policy nobody has set,
  and a percentage against a zero or an incomplete base is a number that misleads.
- **`Bal per nl` reconciliation.** Q3: dropped from scope, not a figure this team owns, and not
  modelled.
- **Trucks, boilers, bags and yard bulk.** M7. Q7 — whether truck and yard-bulk material rolls
  into the yard total — is still open and is scheduled against #18; nothing before M7 is blocked
  by it, and if it is answered *yes* this feature's totals change and this spec is amended then.
- **Any writing at all.** No approve, no reopen, no edit, no note, no export. This feature has
  no server action, no route handler, no form and no write.
- **A held / all toggle.** Part 5 puts the dashboard at **held only**, and nothing here lists
  items: the breakdown groups them. A group with nothing held does not appear, and there is no
  control to show it.
- **Sorting, searching, filtering or paging the breakdown.** Two groupings, fixed orders, every
  row rendered. The three facet filters are #8's, on the counting screen.
- **A yard selector.** The yards are the columns of the grid and of the breakdown; there is
  nothing to select. `Both` is #10's calendar scope and means something else.
- **A configurable trend window, a date range, or a comparison of two arbitrary periods.** The
  window is `TREND_WINDOW = 13` because thirteen periods put the year-on-year comparand at the
  left edge, and that constant is asserted rather than offered.
- **An export of this screen, a print stylesheet, or a CSV.** The `.xlsx` workbook is #12 and
  the printable blank count sheet is #14.
- **Dormant items, one-off items and the archive control.** #15.
- **Caching, memoisation or a materialised total.** Every figure is derived on read, every
  time (Invariant 1). If this screen is ever slow, the answer is an index, and there is no
  evidence it is: the `@@index([periodYear, periodMonth])` #4 shipped is what this queries
  through, and thirteen periods of two yards is a few thousand lines.
- **Per-yard permissions or a third role.** Any `ADMIN` sees every yard; no `YARD_STAFF` sees
  any of it (003, Part 6).
- **CI.** `init` remains the gate.

## Post-approval amendments

### Review findings B1 and B2, and five criteria brought into line, 2026-09-24

The #11 review returned CHANGES_REQUESTED with two blocking findings. Both are the species this
project has now met repeatedly: **a guarantee that reads as tested and is not.**

**B1: the page's empty state was asserted by a branch that can never run.** AC-6 and AC-16 require
the page to render `No approved stock takes yet.` when no approved count exists anywhere in the
database. The only browser test gated its assertion on `approvedCountTally() === 0`, but the same
file's `beforeAll` approves three counts first, so the branch was dead code. Phase B's report said
"on a clean database it is the criterion in full"; that was false. A `€0.00` added to the empty
branch would have passed the whole gate, which is the top-level form of the mistake this feature is
shaped around.

The state itself is **unreachable in the shared end-to-end database**: other specs' reserved-year
counts always exist. So the page half moves to a **server render of `page.tsx` with its services
mocked**, which the gate runs with no database, and it must be watched going red when a `€` is
planted in the empty branch. AC-20's browser measurement of the empty state is **recorded as
unreachable** rather than replaced by an arbitrary empty period, which would measure a different
screen.

**B2: "prices come only from the snapshot" had a path the absence scan could not see.** AC-8's
scan forbids six names. The reviewer added the most tempting mistake possible to the service: a
fallback to the latest `unitPrice` through the `Item.prices` relation when a line has no snapshot,
which is exactly the workbook's column-E defect. It passed **40 static tests and `tsc` at exit 0**,
because the scan never names that relation or the bare `unitPrice` column, and the AC-26
allow-list already admits the file. Only a database test would catch it. The scan gains two
absences (`unitPrice` not followed by `Snapshot`; the `prices` relation in code). The twelfth
allow-list entry is bounded to `unitPriceSnapshot` alone, so the widening carries its own limit
instead of relying on another test to remember it.

**Also brought into line.** Every cell that shows a period's **total** now reads `Incomplete` for
an incomplete period, never `Not counted`: `total-stock`, each breakdown row's total, the trend
table's cell and the chart gap's label. Per-yard cells keep `Not counted`, because there it is
true. *(Corrected by the second review: the first version of this sentence said so before the
trend table and chart gap had been changed.)* That also matches the decision table's *"absent"* and the UI-states *"no
total"*, from which Phase B had drifted. AC-9's link is specified by **path**, with the parameters
AC-16's one rule adds. `src/lib/money.test.ts`, whose census Phase A amended under AC-10, joins
AC-25's list of edited files.

**What AC-20's amendment costs, stated rather than left implicit.** The empty state is the
screen the owner sees **on day one in production**, before any count is approved. Its one
unmeasured piece is the `no-approved-counts` block: two fixed short strings, no user data, in a
column. Every other element on that screen is the same element, with the same classes, as in
the states measured at 390 px and 320 px. That is the cost accepted.

**One strengthening beyond the letter of AC-24**, recorded for completeness: the reserved-year
census in `tests/unit/stock-entry-contract.test.ts` now also requires the years' **values** to
be distinct, not only their keys (first-pass O10).

**What the review confirmed held under attack**, recorded so it isn't re-derived: no `YARD_STAFF`
session reached the admin shape through any of six vectors, including RSC and prefetch headers
and a forged action id. The `unitPrice` widening is forced (no other module could value history
without creating the price-list path AC-8 forbids) and bounded by file. The chart's tuples equal
the table's, and the identity-header fix is load-bearing.

## Open questions

None blocking. Four decisions this spec settles with a stated answer rather than leaving them
undefined, each flagged so the user can strike it at approval, and one defect in an inherited
document that is recorded rather than silently obeyed.

1. **Month on month is `(y, m − 1)` and refuses to reach further back — and one line of
   `specs/domain-model.md` reads otherwise.** Part 3's *Derived queries* table says
   `MoM variance = total(period) − total(previous complete period)`. Read literally, when July
   is uncounted, August's "month on month" becomes June-to-August: a two-month movement labelled
   as one month — which is the same species of defect as `Summary!C9`'s eleven-month "year on
   year", and Part 4 condemns that in terms (*"never 'twelve columns to the left'… which breaks
   the moment a month is skipped"*). This spec follows Part 4 and AC-11 refuses rather than
   reaching. **The two sentences cannot both stand**; if the user prefers the table's reading,
   AC-11 changes and Part 3's row should be reworded to say so explicitly, because it currently
   reads as an oversight rather than a decision.
2. **Period completeness is computed against the yards active *now*.** Invariant 7 says
   *"every `active` Location"*, and nothing records when a `Location` stopped being active, so
   this is the only implementable reading. The consequence: deactivating Clonmel tomorrow would
   make every historical period that Dublin alone counted retrospectively *complete*, and their
   totals would appear where a gap is today. Striking this means a history of yard activation,
   which is a schema change and a migration.
3. **Analysis opens on the latest period with any approved count, not on the latest complete
   one** (AC-16). Opening on a complete period would hide the yard that has not counted, which
   is the thing an administrator most needs to act on. The cost is that the screen's first view
   is frequently an incomplete one with no total. Striking it means opening on the latest
   complete period and surfacing the incomplete one some other way.
4. **A `SUBMITTED` count is shown and is worth nothing** (AC-5). Its snapshots exist, so it
   could be valued, and it is deliberately not — a total that falls when a count is sent back
   for correction is a total nobody can quote. Striking it means `SUBMITTED` contributes, and
   then Invariant 7's definition of a complete period has to change with it.
