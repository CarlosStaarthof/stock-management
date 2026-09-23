# 010 — Stock takes history

**Feature id:** 10   **Status:** approved   **Approved:** 2026-09-12
**Depends on:** #7 `entry_start` (**`listCalendarMonth`, `defaultMonthKey`, `buildMonthGrid`
and `CalendarGrid` — the one definition of a calendar month**, `getCount`, `period.ts`,
`count-input.ts`'s `parseMonthKeyParam`, `src/types/stock-count.ts`, the four-route
`/stock-entry` tree, the `loading.tsx` rule and the **reserved-year rule, AC-30**),
#8 `stock_entry_ui` (the `null` / `0` distinction this screen reads back, the stacked-list
finding of 008 AC-30, and `seedCountWithLines` / `fillQuantities`), #9 `entry_submit`
(`submitAs`, `approveAs`, the `/summary` split that keeps the euro off every shared screen,
and **the mapper rule**), #6 `item_master_ui` (`locationCodeSchema`, the single-sourced
messages modules, and the served-build e2e suite at `retries: 0`), #4 `domain_schema`
(`StockCount`, `StockCountLine` — **every column this feature reads already exists**),
#3 `auth_and_roles` (`requireUserPage`, `assertUser`, `deepKeys` / `assertNoMoneyKeys`, and
`landingPathForRole`, which has pointed an `ADMIN` at `/stock-takes` since #3),
#20 `test_db_reset` (`TRUNCATED_TABLES`)

## Purpose

`/stock-takes` is where an **`ADMIN` lands** (`specs/product-brief.md` § Users,
`specs/domain-model.md` Part 6) and it has been a placeholder with a heading and an email on
it since #3. This feature makes it the screen its name promises: a day calendar of every
stock take, one month at a time, opening on the last one, with a Dublin / Clonmel / Both
selector, previous/next-count jumps that skip the empty months the workbook is full of, and a
read-only view of what a count actually recorded — item, quantity, unit.

Without it the product can create, walk, sign and approve a count and then offer **no way to
read one back as a record**. `/stock-entry/counts/[id]` is the working sheet: all 82 rows,
inputs while it is a `DRAFT`, and the route a user is sent down in order to *do* something.
Part 5 says a count *view* defaults to **held only** — "see what we have, not what we don't"
— and 35 of 82 rows in the most recent Dublin count are zero or blank. That view does not
exist yet. This is it.

It is also the feature that makes Part 6's last sentence mechanical:

> Stock Takes shows the calendar, which yards were counted, and item / quantity / unit.
> **One version of the screen, not two** — a screen that renders differently per role is a
> screen whose every future change must be checked twice.

## Money-free by design, not by accident — and why there is no admin variant

Every money-free surface so far got there a different way:

| Feature | Why it carried no euro |
|---|---|
| #7 | Scope. A `DRAFT` has no `unitPriceSnapshot` to show (Invariant 2) |
| #8 | Scope, argued: no running total **for either role**, because a draft total from today's prices would disagree with the approved total |
| #9 | **Route split.** Every euro moved to `/stock-entry/counts/[id]/summary`, which is a `307` for a staff session |

**#10 is the first surface that is money-free by design, for both roles, on one screen.** The
reason is Part 6's, quoted above, and the cost of ignoring it is concrete: a screen with an
`if (role === "ADMIN")` in it has two renderings, and every later change — a new column, a new
badge, a reordered header — has to be reasoned about twice, in a product whose hardest
invariant is that one of those two renderings must never contain a number.

So this feature ships **no role branch at all**, and that is asserted rather than promised
(AC-13): the body of every page it adds is **byte-identical** between a `YARD_STAFF` session
and an `ADMIN` session on the same URL. That is a strictly stronger claim than 009 AC-23's
"identical markup except one added link", and it is available here only because this feature
has nothing an admin needs that a staff user may not have.

**Where the euro went, and how an admin still reaches it.** #9 put every euro on
`/stock-entry/counts/[id]/summary`, which an `ADMIN` reaches from a link on
`/stock-entry/counts/[id]`. This feature's detail page carries **one** link into that tree —
*Open this count in Stock Entry*, to `/stock-entry/counts/<id>` — and that link has the same
`href` and the same label for both roles (AC-15). The admin's route to the money is therefore
**two clicks away, through a role-shaped screen that is #9's and not this one's**. Nothing in
#10 links to `/summary`, for anybody. That is consistent with "one version of the screen, not
two" read literally: the sentence governs *a screen*, and no screen this feature adds renders
differently per role.

The alternative — an admin-only *View the valued summary* link on the history detail — was
rejected. It would buy one click and cost the byte-identity assertion, which is the only thing
that makes the guarantee checkable at all.

## Scope boundary with #7, and what each owns

`/stock-entry` already renders a month of days with counts on it. Two calendars that drift
apart would be the second-definition problem 006 AC-24 exists to prevent, so the question is
settled explicitly rather than left to taste.

**They are the same calendar, rendered at two addresses with different affordances.** Not a
replacement (three shipped e2e specs require `/stock-entry` to answer `200` with its calendar,
and `/stock-entry?denied=…` is where every refused admin route sends a staff session), and not
a sibling implementation (that is the drift).

| | `/stock-entry` — #7 | `/stock-takes` — #10 |
|---|---|---|
| Purpose | **Do something.** Start a count, resume a draft | **Read something.** What was counted, and when |
| Landed on by | `YARD_STAFF` | `ADMIN` |
| The month grid | `CalendarGrid`, `buildMonthGrid`, `listCalendarMonth` | **the same three**, called with the same arguments |
| An empty day | *Start a count* link to `/stock-entry/new?countDate=…` | nothing — a plain cell |
| A badge links to | `/stock-entry/counts/<id>` | `/stock-takes/counts/<id>` |
| Yard selector | no | **yes** |
| Previous/next **count** jumps | no | **yes** |
| Held-only view of a count | no — the working sheet shows every row | **yes, and it is the default** |

The shared pieces are shared by **calling the same functions**, not by copying them:

- `listCalendarMonth(actor, monthKey)` is **unchanged** — same signature, same body, same
  arguments from both pages. The yard scope is applied afterwards by a **pure** filter over
  its result (AC-7), so there is no second query and no `where` clause that could disagree
  with #7's.
- `CalendarGrid` gains two optional props whose defaults reproduce today's behaviour, so
  `src/app/stock-entry/page.tsx` is **byte-identical** after this feature (AC-4).
- AC-4 asserts the absence of drift directly: for the same month, the set of count badges
  rendered by `/stock-entry?month=X` and by `/stock-takes?month=X&yard=BOTH` is **equal**.

**Out, and owned elsewhere:** starting, editing, submitting, signing, approving and reopening
a count are #7, #8 and #9 and are untouched; every euro figure, every total, MoM, YoY and
period completeness are #11 `analysis`; the Excel export is #12; archiving a dormant item is
#14. See *Out of scope*.

**No migration, and no new table.** Every column this feature reads was shipped by #4, so
`TRUNCATED_TABLES` keeps exactly its eight entries and **020 AC-4's `information_schema`
equality passes untouched** (AC-22).

**No route handler, no server action, no form, and no client component.** This feature only
reads. Every control on it is an `<a>`, so the whole of it works with the JavaScript bundle
dead, and it emits no JSON — the only body a session can obtain from it is HTML, which is why
AC-12 walks the objects the services return *and* scans the rendered text.

## User stories

- As an **ADMIN**, I sign in and land on a calendar of stock takes opened on the most recent
  one, so the first thing I see is the state of the yards rather than a menu.
- As an **ADMIN**, I jump from April's count straight to the previous one without paging
  through the months nobody counted — the workbook skips July and August 2025 entirely.
- As a **YARD_STAFF** user, I can look up what Dublin held last month without being able to
  change it, and without being shown a price, a value or a total anywhere.
- As either role, I choose Dublin, Clonmel or Both and the calendar answers for that scope.
- As either role, I open a count and see **what was held** — not 35 rows of zero — and can ask
  for the full list in one tap when I need to check that something really was counted as none.
- As a **first-time user** with an empty database, the screen tells me there are no stock takes
  yet and offers the one thing I can do about it.
- As the **owner**, I can be sure the yard phone was sent no euro figure from this screen,
  because the objects the server built for that session have no monetary key at any depth —
  and because the admin's page body is byte-identical to the staff one, there is no second
  rendering for a future change to leak from.
- As a **phone user**, at 320 px the document never scrolls sideways, in either view.

## Data touched

| Model | Read | Written |
|---|---|---|
| `StockCount` | yes — through `listCalendarMonth`, `getCount` and the neighbour query | **never** |
| `StockCountLine` | yes — through `getCount` only | **never** |
| `Location` | yes — through `listCalendarMonth` and `listCountableYards` | **never** |
| `Item` | yes — through `getCount` only | **never** |
| `ItemLocation` | yes — through `getCount`'s sort-order read only | **never** |
| `ItemPrice`, `Supplier`, `ItemType`, `User` | not read by this feature | never |

**This feature writes nothing, anywhere.** No `create`, `update`, `upsert`, `delete` or
`deleteMany` on any model, asserted by source scan (AC-3). No new field, no new column, no
migration.

**A historical count is read from its own lines, never from today's sheet.** `listSheet` is
the one definition of a *yard sheet* (006 AC-24) and this feature calls it **nowhere**: a
sheet is what a yard stocks *now*, and a count is what a yard held *then*. An item archived
since the count must still appear in it, which is exactly what `getCount` already does and
what AC-8 pins.

## Contract

### Routes — two, both roles, both `export const dynamic = "force-dynamic"`

| Route | What it is |
|---|---|
| `/stock-takes` | **The history calendar.** One month of days. Query: `?month=YYYY-MM`, `?yard=DUBLIN\|CLONMEL\|BOTH` |
| `/stock-takes/counts/[id]` | **One count, read only.** Held items by default. Query: `?show=held\|all`, `?yard=` (carried, not applied) |

Both begin with `await requireUserPage()` — **not** `requireAdminPage`. Part 6 gives both
roles the calendar and the count view, and there is no role refusal on either route.

`/stock-takes` replaces #3's placeholder and keeps its `<h1>Stock Takes</h1>` verbatim,
because `tests/e2e/role-access.spec.ts` asserts that exact heading for both roles and must
pass unmodified; the month label becomes an `<h2>` carrying `data-testid="month-heading"`. It
keeps `data-testid="signed-in-email"` and the `data-testid="sign-out"` control, because an
`ADMIN` lands here and must be able to leave.

`src/lib/auth-config.ts` and `src/middleware.ts` are **byte-identical**: `PROTECTED_PATHS` has
contained `"/stock-takes"` and the matcher `"/stock-takes/:path*"` since #3.

**No `loading.tsx` at or above either route** — 007 AC-3's rule, and this feature replaces the
hand-maintained directory list that enforces it with one **derived from the route tree**
(AC-2).

### Services and pure modules

| Module | Exports | Touches Prisma |
|---|---|---|
| `src/server/counts/count-history-service.ts` | `getCountHistory`, `findNeighbourCounts` | yes — **read only** |
| `src/server/counts/stock-takes-input.ts` | `parseYardScope`, `parseHeldView` | no — **pure** |
| `src/lib/stock-takes-view.ts` | `filterCalendarByYard`, `scopeTallies` | no — **pure** |
| `src/lib/held.ts` | `isHeld`, `partitionHeld` | no — **pure** |
| `src/lib/money.ts` | *(extended)* `compareDecimals` | no — **pure** |
| `src/lib/stock-takes-messages.ts` | every literal a criterion quotes | no — **pure** |
| `src/components/stock-entry/CalendarGrid.tsx` | *(two optional props added)* | no |

`stock-takes-input.ts` lives under `src/server/` because it builds on `locationCodeSchema`
from `@/server/items/item-master-input` rather than restating which yards exist, and
`docs/architecture.md` forbids `src/lib/**` from importing it. `stock-takes-view.ts` and
`held.ts` compare plain strings and need no schema, so they live in `src/lib/` and cost no new
dependency exception. Five pure modules are why a third of these criteria run in
`npm run test:unit` with no database.

`src/lib/stock-takes-messages.ts` **re-exports** the literals #7 already owns —
`NO_COUNTS_RECORDED_YET`, `NO_COUNTS_IN_MONTH`, `COUNT_STATUS_LABEL`, `NOT_COUNTED`, `NO_UNIT`,
`START_A_COUNT`, `BACK_TO_THE_CALENDAR`, `COUNT_NO_LONGER_EXISTS`, `formatMonthLabel`,
`formatDayLabel`, `facetOptionLabel` — rather than restating them, and AC-18 asserts the
identity rather than the spelling. This is the layout #6 used when `count-messages.ts` took
`NO_UNIT` from `item-master-messages.ts`.

### Shapes

```ts
/** Both yards, or one of them. `BOTH` is a SCOPE, not a claim that both were counted. */
type YardScope = "DUBLIN" | "CLONMEL" | "BOTH";

/** Which rows a count view shows. Part 5: a count view defaults to HELD. */
type HeldView = "held" | "all";

/** A count, as a jump target. Money-free, and one shape for both roles. */
type CountRef = {
  countId: string;
  locationCode: string;
  locationName: string;
  countDate: string;          // "YYYY-MM-DD"
  monthKey: string;           // "2026-09" — the month it SITS in, for the calendar jump
  periodKey: string;          // "2026-09" — the month it CLOSES
  status: CountStatus;
};

type CountNeighbours = { previous: CountRef | null; next: CountRef | null };

/** One line of a historical count. Item, quantity, unit — Part 6's row, and nothing more. */
type CountHistoryLine = {
  itemId: string;
  description: string;
  unitLabel: string | null;
  /** A decimal STRING or null, exactly as stored. `null` is "nobody looked". Never rounded. */
  quantity: string | null;
  sortOrder: number;
};

/**
 * ONE SHAPE FOR BOTH ROLES (AC-12, AC-13). There is no `…ForAdmin` variant, because there is
 * no monetary fact this screen may carry for anybody.
 */
type CountHistoryView = {
  countId: string;
  locationCode: string;
  locationName: string;
  periodKey: string;          // "2026-09"
  periodLabel: string;        // "September 2026"
  countDate: string;          // "YYYY-MM-DD"
  status: CountStatus;
  countedByName: string;
  lineCount: number;
  uncountedLineCount: number;
  /** EVERY line, in sheet order. The held view is applied by a pure predicate, not here. */
  lines: CountHistoryLine[];
};

getCountHistory(actor: SessionUser, countId: string): Promise<CountHistoryView>;

findNeighbourCounts(
  actor: SessionUser,
  scope: YardScope,
  cursor: { date: string; countId: string | null },
): Promise<CountNeighbours>;
```

### The rules this contract encodes

**`getCountHistory` is a mapper over `getCount`, and that is the point.** It calls
`getCount(actor, countId)` and maps its result onto `CountHistoryView`. For an `ADMIN`,
`getCount` returns `itemsWithoutPrice` — a key that matches `/price/i` and that 007 AC-17
counts as the one permitted offender on that surface. **This feature's screens may carry
none**, so the key is dropped **in the service**, by a mapper, exactly as #9 ruled: *when a
shape's key is a forbidden string, the boundary is crossed by a mapper in the service, not by
a scan exemption for the screen.* The cost is stated rather than hidden: an `ADMIN` opening
the history detail causes one `itemsWithoutPrice` query whose answer is thrown away. That is
accepted, because the alternative — a second query of a count's lines — is the second
definition 006 AC-24 exists to prevent, and because a discard performed **once, in a service,
under a criterion** is not the "every future caller remembers" arrangement 007 rejected.

**The yard scope is a pure filter, never a second query.** `listCalendarMonth` is called
identically by both calendars; `filterCalendarByYard(month, scope)` then drops the badges
outside the scope and recomputes `countsInMonth`. This is what makes AC-4's badge-set equality
true by construction rather than by vigilance, and it leaves #7's service byte-identical.

**Counts are placed by `countDate`, not by period — the same rule, and no argument with it.**
007 open question 4 settled it for the calendar and 007 AC-20 pins it: a count dated
`2026-10-01` closing `2026-09` sits in **October's** grid with `2026-09` in its badge title.
The jumps use the same ordering, for the same reason — the calendar is a calendar of days, and
a jump that moved by period would land the user on a month the count is not drawn in.

**The ordering of counts is `(countDate, id)` ascending, and `id` is what makes it total.** Two
counts at one yard *can* share a `countDate` — `@@unique([locationId, periodYear, periodMonth])`
permits September and October both walked on 1 October — so an ordering on `countDate` alone is
not deterministic. `id` is unique, so the pair always is.

**All three statuses appear, for both roles.** A `DRAFT` is visible work in progress: a staff
user needs to see that Dublin is being counted right now (it is why #7's confirm screen offers
the existing count instead of a second one), and an `ADMIN` who lands here must see a
`SUBMITTED` count in order to go and approve it — hiding it would hide the one thing the
admin's landing page exists to surface. The badge says which, so "someone's working document"
and "the record" are never confused. Showing `APPROVED` only would also make the two calendars
disagree about the same day, which is a worse second definition than sharing a query.

**Held means `quantity > 0`, compared as a decimal, never as a JavaScript number.**
`docs/architecture.md` § Money and quantities forbids converting a stored decimal to a `number`
outside the presentation boundary, and `0.0001` tonnes of something is held. `isHeld` is one
pure function over the decimal string, built on `compareDecimals`.

**The detail's jumps are same-yard, always.** The "previous count" of a Dublin count is
Dublin's previous count. Clonmel's stock is different stock; putting it next in a sequence the
user is reading as one yard's history would invite exactly the comparison Part 4 spent a page
forbidding. The `?yard=` scope is therefore **carried** across the detail page (so *Back to the
calendar* returns to what you were looking at) but **not applied** to its jumps.

## UI states

- **Empty.** No counts anywhere: the calendar renders the month containing today with
  `No stock counts recorded yet.` and a single *Start a count* link to `/stock-entry/new` — the
  same string and the same destination #7 uses, for both roles. This is the state of the
  database today. A month with no counts in the current scope, when counts exist elsewhere:
  `No counts in this month.` and no instruction. A count in which nothing is held:
  `No items were held at Dublin in September 2026.` with the *Show all items* link beside it.
- **Loading.** Every control is a plain link, so the browser's own progress is the loading
  state. There is deliberately **no `loading.tsx`** at or above either route (AC-2), and the
  reason is the one #3, #6, #7 and #9 each recorded: a Suspense boundary above a page turns a
  server-side `redirect()` from a `307` into a `200` carrying a shell.
- **Error.** A `countId` that does not exist renders `That count no longer exists.` with a link
  back to `/stock-takes`, and does not throw. A `?month`, `?yard` or `?show` value that cannot
  be read redirects to the page's own base URL and renders no error — no query parameter can
  make either page throw. No Prisma or Postgres string ever reaches either screen. Anything
  else reaches the shared error boundary from #2.
- **Success.** There is no success state, because this feature writes nothing.
- **No JavaScript.** Both pages are Server Components rendering links only. The feature ships
  no `"use client"` module, so every control works with the bundle disabled (AC-18).

## Acceptance criteria

Tests that touch only `stock-takes-view.ts`, `held.ts`, `money.ts`, `stock-takes-input.ts` or
`stock-takes-messages.ts` are `*.test.ts` and run in `npm run test:unit` with no database.
Tests that read the database are `*.db.test.ts` under `src/server/counts/`, call
`resetTestDb()` in `beforeEach` and build their own fixture. Browser-level criteria are
Playwright specs named `tests/e2e/stock-takes-*.spec.ts`.

1. **AC-1** — **Both routes are closed to a signed-out request, open to both roles, and no route protection is added.** An unauthenticated `GET` of `/stock-takes` and of `/stock-takes/counts/<id>` responds `307` (or `302`) to `/sign-in?callbackUrl=<the URL-encoded path and query>` and sends none of the page's content; signing in from that page lands on the requested path. Signed in as `YARD_STAFF` and again as `ADMIN`, both URLs return `200`. `/stock-takes` renders an `<h1>` whose text is exactly `Stock Takes`, a `data-testid="signed-in-email"` carrying the signed-in email, and a `data-testid="sign-out"` control that ends the session; the month label is an `<h2>` carrying `data-testid="month-heading"`. `src/lib/auth-config.ts` and `src/middleware.ts` are **byte-identical** to their state before this feature, and `tests/e2e/role-access.spec.ts` and `tests/e2e/sign-in.spec.ts` pass **unmodified**, so 003 AC-9, AC-14 and AC-15 still hold against the new page.
2. **AC-2** — **The refusal stays the server's answer, and the guard that protects it is derived from the route tree instead of typed out.** In the shipped tree no `loading.tsx` or `loading.ts` exists in any directory on the path from `src/app` to any `page.tsx` outside `src/app/(public)/`. The assertion in `tests/unit/stock-entry-contract.test.ts` that today lists five directories by hand is replaced by one that **computes that set from the tree**: it derives at least **14** directories, the derived set contains every one of the five it replaces and additionally `src/app/stock-takes` and `src/app/stock-takes/counts/[id]`, and the test fails if the derivation yields fewer than 10 directories. This implements the replacement #9's post-approval ruling required — the previous list was hand-maintained, was found stale once, and *nothing catches an assertion that is missing*. `src/app/(public)/loading.tsx` is unchanged and `/` still returns `200` with its loading fallback present. The implementer reproduces the degradation before closing — adding `src/app/stock-takes/loading.tsx` turns the **page's own** refusal, the `?yard=banana` `redirect()`, from a `307` with a `Location` header into a `200` with none, **and turns the derived assertion red** — and records both status codes and the failing test name in `progress/impl_stock_takes_history.md`. AC-1's unauthenticated `GET` is **not** the request that degrades and must not be used as the probe: that refusal is the **middleware's** — `PROTECTED_PATHS` has held `/stock-takes` since #3 — and the middleware answers before any Suspense boundary exists. See the amendment below.
3. **AC-3** — **Every service function takes an explicit actor, reads nothing else from the request, and this feature writes nothing anywhere.** `getCountHistory` and `findNeighbourCounts` each take `actor: SessionUser` as their first parameter and begin with `assertUser`; called with a `null` actor each raises `UnauthorizedError`. The actor comes from `requireUserPage()` and from nowhere else. `getCountHistory`'s only other argument is `countId`, and `findNeighbourCounts`'s only other arguments are the scope and the cursor — asserted by their signatures. A source scan of `src/server/counts/count-history-service.ts`, `src/app/stock-takes/**` and `src/lib/stock-takes-view.ts` finds no `.create`, `.createMany`, `.update`, `.updateMany`, `.upsert`, `.delete` or `.deleteMany` applied to any model, and no `db.` reference at all outside the service. Across every test in this feature the row counts of `StockCount`, `StockCountLine`, `Item`, `ItemPrice`, `ItemLocation`, `Supplier`, `ItemType`, `Location` and `User` are identical before and after, and so is every column of the fixture counts.
4. **AC-4** — **One calendar, not two: the two pages render the same badges because they call the same function with the same arguments.** `src/server/counts/count-service.ts` and `src/app/stock-entry/page.tsx` are **byte-identical** after this feature; `listCalendarMonth`'s signature is unchanged and it is the only function in the repository that returns a `CalendarMonth`. `src/components/stock-entry/CalendarGrid.tsx` gains exactly two optional props — the badge `href` builder and the empty-day `href` builder, the latter accepting `null` for "render no link" — whose defaults reproduce today's behaviour, which is why `/stock-entry/page.tsx` needs no edit. End to end, against a fixture with counts at both yards on the same day and a count in a neighbouring month: for the same `?month`, the set of `(day cell test id, data-count-id, data-location-code, badge status text)` tuples parsed from `/stock-entry?month=X` equals the set parsed from `/stock-takes?month=X&yard=BOTH`, exactly and in the same per-day order. A source scan finds **no** second month-grid builder: `buildMonthGrid` is called from exactly one module, `CalendarGrid.tsx`, and `src/app/stock-takes/**` contains neither `buildMonthGrid` nor a weekday-heading literal.
5. **AC-5** — **What each calendar owns, asserted by absence.** `/stock-takes` renders **zero** elements with `data-testid="start-count-day"`, and a day cell with no counts contains no `<a>` at all; `/stock-entry` renders **zero** elements with `data-testid="yard-scope"`, `data-testid="previous-count"` or `data-testid="next-count"`. Both pages render exactly one `data-testid="calendar"` table with the seven headings `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun` in that order. For the same count, `/stock-takes` links its badge to `/stock-takes/counts/<id>` while `/stock-entry` links it to `/stock-entry/counts/<id>`, asserted in one test so the divergence is deliberate and visible.
6. **AC-6** — **The Dublin / Clonmel / Both selector, and what "Both" means on a day only one yard was counted.** `/stock-takes` renders `data-testid="yard-scope"` holding exactly three links, in `Location.sortOrder` then `Both` — labelled `Dublin (n)`, `Clonmel (n)` and `Both (n)` through `facetOptionLabel`, where `n` is the number of counts that scope has **in the displayed month** — and marks the current one with `aria-current="true"` and no other. The default with no `?yard` is `BOTH`. On a day when only Clonmel was counted: under `?yard=BOTH` that day's cell holds **one** badge, the Clonmel one; under `?yard=CLONMEL` it holds the same one; under `?yard=DUBLIN` it holds **none** and the cell is plain. On a day both yards were counted, `?yard=BOTH` renders two badges, Dublin before Clonmel. A `?yard` value that is not one of the three — `banana`, `dublin`, an empty string, or the parameter repeated twice — responds `307` to `/stock-takes` and renders no error.
7. **AC-7** — **The scope is a pure filter over one query's result, unit-tested with no database.** `filterCalendarByYard(month, scope)` and `scopeTallies(month)` are pure: given a `CalendarMonth` literal with three counts across two days — Dublin and Clonmel on the 1st, Clonmel on the 14th — `filterCalendarByYard(m, "DUBLIN").countsInMonth` is `1` and every remaining badge has `locationCode === "DUBLIN"`; `"CLONMEL"` gives `2`; `"BOTH"` returns a value **deeply equal** to the input; every call leaves the input unmutated, asserted against a structured clone taken beforehand; the returned `days` array still holds one entry per day of the month, in the same order, including the days the filter emptied; and `scopeTallies(m)` is `{ DUBLIN: 1, CLONMEL: 2, BOTH: 3 }`. `src/app/stock-takes/page.tsx` calls `listCalendarMonth` exactly once per render and passes it no yard argument, asserted by source scan.
8. **AC-8** — **The read-only detail: item, quantity, unit, and the count's own lines.** `/stock-takes/counts/<id>` returns `200` and renders the yard name, the period label, the count date inside a `<time dateTime="YYYY-MM-DD">`, the status as `Draft`, `Submitted` or `Approved` from `COUNT_STATUS_LABEL`, and who counted it. Each row in `data-testid="history-line"` carries the item description, its `unitLabel` or `No unit`, and the quantity **exactly as stored, never rounded** — `21.6128` renders `21.6128` and `0.475` renders `0.475`. The page contains **no** `input`, `select`, `textarea`, `button` or `form` element anywhere, asserted by absence, and its rows appear in `ItemLocation.sortOrder` then `description` order, the same order `getCount` returns. A line whose item was archived (`Item.active = false`) **after** the count still appears with its description: a `*.db.test.ts` archives an item and asserts the line survives in `getCountHistory` unchanged, and a source scan finds that `listSheet` is called nowhere in this feature. A `countId` that does not exist renders `That count no longer exists.` with a link back to `/stock-takes` and does not throw.
9. **AC-9** — **Held only is the default, the toggle is one tap, and the page says what it hid.** With no `?show`, `/stock-takes/counts/<id>` renders only the lines whose `quantity > 0`. On a fixture of 82 lines — 47 held, 23 counted as `0`, 12 never counted — it renders **47** `data-testid="history-line"` elements, the sentence `35 of 82 items are not held and are hidden.` in `data-testid="hidden-summary"`, and a link `Show all items` to the same URL with `?show=all`. `?show=all` renders **82** rows, no `hidden-summary`, and a link `Show held only` back to `?show=held`; in that view a line counted as `0` renders `0` and a line never counted renders `Not counted`, and the two are distinguishable in the DOM by `data-counted="zero"` and `data-counted="no"` respectively — the distinction #8 exists to preserve. `?show=held` renders identically to no `?show` at all. A `?show` value that is neither — `banana`, an empty string, or the parameter repeated twice — responds `307` to `/stock-takes/counts/<id>` with the `yard` parameter preserved, and renders no error.
10. **AC-10** — **Held is `quantity > 0`, decided on the decimal and never on a JavaScript number.** `compareDecimals` in `src/lib/money.ts` and `isHeld` / `partitionHeld` in `src/lib/held.ts` are unit-tested with no database: `compareDecimals("0.0000", "0")` is `0`, `("0.0001", "0")` is `1`, `("9.50", "9.5")` is `0`, `("10", "9")` is `1`, `("-1", "0")` is `-1`; `isHeld(null)` is `false`, `isHeld("0")` is `false`, `isHeld("0.0000")` is `false`, `isHeld("-3")` is `false`, `isHeld("0.0001")` is `true`, `isHeld("21.6128")` is `true`. `partitionHeld(lines)` returns `{ held, hidden }` preserving input order in both, with `held.length + hidden.length === lines.length` for every input. A source scan finds no `Number(`, `parseFloat`, `toFixed` or `Math.round` applied to a quantity anywhere in `src/lib/held.ts`, `src/server/counts/count-history-service.ts` or `src/app/stock-takes/**`, and `src/lib/money.ts` still names `unitPrice` **nowhere**, so 006 AC-31's `src/lib/**` zero-file assertion passes unmodified.
11. **AC-11** — **Previous and next count: one ordering, two placements, and the empty months skipped.** Counts are ordered by `countDate` ascending, then by `id` ascending, and `findNeighbourCounts` returns the nearest count strictly before and strictly after the cursor in that order within the scope's yards, or `null`. **On the calendar** the cursor is the displayed month, so *Previous count* resolves to the month of the latest count with `countDate` before the month's first day and *Next count* to the month of the earliest count after its last day, both links carrying the current `?yard`. Against a fixture with Dublin counts dated `<Y>-01-31`, `<Y>-04-30` and `<Y>-05-31` and one Clonmel count dated `<Y>-03-31`: from `?month=<Y>-04&yard=DUBLIN`, *Previous count* links to `?month=<Y>-01&yard=DUBLIN` — **three months back, skipping the two nobody counted at that yard** — while from `?month=<Y>-04&yard=BOTH` it links to `?month=<Y>-03&yard=BOTH`. **On the detail** the scope is that count's **own yard**, whatever `?yard` says, and the cursor is its own `(countDate, id)`, so the jumps link to `/stock-takes/counts/<neighbour id>` carrying the current `?yard` and `?show`; from the `<Y>-04-30` Dublin count, *Previous count* is the `<Y>-01-31` Dublin count and not the `<Y>-03-31` Clonmel one. Where there is no neighbour the control still renders, with the same `data-testid` and label, as a non-anchor element carrying `aria-disabled="true"`. Two counts at one yard sharing a `countDate` are reachable from each other exactly once, and neither is its own neighbour, asserted in a `*.db.test.ts`.
12. **AC-12** — **The money-key walk, for BOTH roles, over every surface this feature adds.** `assertNoMoneyKeys` from `src/lib/money-boundary.ts` is applied, for a `YARD_STAFF` actor **and** for an `ADMIN` actor, to the value returned by `getCountHistory`, by `findNeighbourCounts`, and by `filterCalendarByYard(await listCalendarMonth(actor, m), scope)` for each of the three scopes: `deepKeys` of each contains **no** key matching `/price|value|total|amount/i` at any depth, including inside `lines[]` and `days[].counts[]` — **zero offenders for the admin as well as for the staff user**, which is what makes this feature different from every one before it. For each of the three, the value returned for a staff actor and the value returned for an `ADMIN` on the same input are **deeply equal**. At the browser level, for a `DRAFT`, a `SUBMITTED` and an `APPROVED` count, and for **each** role, the rendered HTML of `/stock-takes`, of `/stock-takes?yard=DUBLIN`, of `/stock-takes/counts/<id>` and of `/stock-takes/counts/<id>?show=all` contains no `€` character, no `No price` string, no `unitPrice` string, and no `unitPrice` value of any item in the database.
13. **AC-13** — **One version of the screen, not two — asserted byte for byte.** Everything on each page except the identity header sits inside `data-testid="stock-takes-body"`. For every one of the four URLs in AC-12, the `innerHTML` of that element fetched in a `YARD_STAFF` session is **exactly equal** to the `innerHTML` fetched in an `ADMIN` session — same length, same characters, no normalisation beyond the equality itself. A source scan of `src/app/stock-takes/**`, `src/components/stock-takes/**`, `src/lib/stock-takes-view.ts`, `src/lib/held.ts` and `src/server/counts/count-history-service.ts` finds no occurrence of `"ADMIN"`, `"YARD_STAFF"`, `actor.role`, `user.role`, `shapeForRole` or `countForRole` — there is no role branch to scan for, which is the guarantee Part 6 asks for. The one place a role is consulted is inside `getCount`, and `getCountHistory`'s mapper is what drops its `itemsWithoutPrice`: a test asserts `Object.hasOwn(view, "itemsWithoutPrice") === false` for an `ADMIN` actor and that the service, not the page, removed it.
14. **AC-14** — **Role and scope cannot be influenced by anything the client sets.** Signed in as `YARD_STAFF`, a `GET` of each of the four URLs in AC-12 carrying the query string `?role=ADMIN`, the header `x-user-role: ADMIN` and the cookie `role=ADMIN` simultaneously returns a `data-testid="stock-takes-body"` byte-identical to the same request without them. Signed in as `ADMIN`, the same three vectors carrying `YARD_STAFF` change nothing either. The test asserts the responses, not the source code.
15. **AC-15** — **One link into a count, the same for both roles, and no euro anywhere near it.** `/stock-takes/counts/<id>` renders exactly one `data-testid="open-in-stock-entry"` anchor, whose `href` is `/stock-entry/counts/<id>` and whose text is `Open this count in Stock Entry`, present with the identical `href` and text for both roles. No page this feature adds contains the substring `/summary`, or an anchor to any URL beneath `/stock-entry/counts/<id>/`, for either role — asserted by scanning the rendered HTML of all four URLs for both roles. `/stock-entry/counts/<id>/summary` still responds `307` to `/stock-entry?denied=count-summary` for a staff session and `200` for an `ADMIN`, so 009 AC-1 passes unmodified.
16. **AC-16** — **The reading mode survives navigation.** Starting at `/stock-takes?yard=CLONMEL&month=<Y>-04`, every link the page renders — the three scope links, *Previous month*, *Next month*, *Today*, *Previous count*, *Next count* and every count badge — carries `yard=CLONMEL`. Following a badge, then *Show all items*, then *Previous count*, then *Back to the calendar*, ends on `/stock-takes` still carrying `yard=CLONMEL`; the URL after the *Previous count* step carries both `yard=CLONMEL` and `show=all` and that page still renders all rows. *Back to the calendar* carries `yard` and **not** `show`, because `show` means nothing to a calendar. The default scope is never spelled into a URL: `/stock-takes` with no query string is not redirected and renders the `Both` scope.
17. **AC-17** — **No database error text ever reaches a screen, and no query parameter can make either page throw.** For each of five provoked failures — a `countId` that does not exist, a `countId` that is not a valid id at all, `?month=2026-13`, `?yard=banana` and `?show=banana` — the response is either the feature's own message or a `307`, and the rendered HTML contains none of `prisma`, `Prisma`, `violates`, `constraint`, `SQLSTATE`, `23514`, `23505`, `P2002`, `P2025` or a stack frame. Every function in `src/server/counts/count-history-service.ts` throws only `NotFoundError`, `ValidationError`, `ForbiddenError` or `UnauthorizedError` from `src/server/errors.ts`, never a bare `Error`. Each of `?month`, `?yard` and `?show` is additionally sent repeated twice and as an empty string, and neither page returns a `500` for any of the twelve combinations.
18. **AC-18** — **The strings are single-sourced by re-export, and nothing here needs JavaScript.** Every literal quoted by any criterion above is exported from `src/lib/stock-takes-messages.ts` and asserted **from that module**, so the screen and the test cannot drift apart. The literals #7 already owns are **re-exported, not restated**: a unit test asserts equality by identity — the status-label record is the same object as `COUNT_STATUS_LABEL`, and the two empty-state sentences are the same strings as `NO_COUNTS_RECORDED_YET` and `NO_COUNTS_IN_MONTH`. `src/lib/stock-takes-messages.ts`, `src/lib/stock-takes-view.ts` and `src/lib/held.ts` import nothing from `src/server/` except `@/server/errors`, keeping `npm run lint`'s dependency fence green and `tests/unit/lint-fence.test.ts` passing unmodified. **This feature ships no `"use client"` module**: a source scan of `src/app/stock-takes/**` and `src/components/stock-takes/**` finds none, `docs/architecture.md` gains no new dependency exception, and in a `javaScriptEnabled: false` context both pages render and the scope links, the month links, the count jumps and the *Show all items* toggle all navigate.
19. **AC-19** — **Phone-first, measured in the state most likely to overflow.** At a 390 × 844 viewport, signed in as `YARD_STAFF` and again as `ADMIN`, and again at **320 px**: on `/stock-takes` under each of the three scopes, in a month where one day carries two badges, and on `/stock-takes/counts/<id>` in **both** the held and the `show=all` views, `document.documentElement.scrollWidth` does not exceed its `clientWidth` — the document never scrolls sideways. The `show=all` measurement is taken on a count containing the longest `Item.description` in the database and a four-decimal quantity, because 008 AC-30 recorded that the overflow appears in the fuller state and not in the default one. **At least one of the sessions signs in with an email whose local part is a single unbreakable run of at least 56 characters** — the header is `text-sm` inside `p-3`, measured at roughly **6.6 px per character**, so a 40-character run is about 264 px and cannot overflow either viewport; 56 is the measured floor and the test guards the constant against it, and the identity header wraps rather than widening the document — on `/stock-takes`, which is the only page of the two that renders one, `/stock-takes/counts/<id>` having no identity header at all — that header renders `{user.email}` *outside* the byte-compared body, an email is one unbreakable token, and every fixture label this suite builds contains hyphens, which browsers break after. A suite built only from those labels cannot reach the state that overflows. See the fifth amendment below. Every control the flow touches — the three scope links, the month links, *Today*, *Previous count*, *Next count*, the *Show all items* toggle, *Open this count in Stock Entry* and *Back to the calendar* — has a bounding box of at least **44 × 44** CSS px, except links inside a sentence. **The count badge is excluded, narrowly and deliberately** — it is #7's element and AC-4 forbids changing how #7 renders it; what is asserted in its place is that its width and height are **identical** on `/stock-entry` and on `/stock-takes` (AC-4 measured rather than scanned), that its width is at least **40** px, and that its height is bounded on **both** sides — below **44** and at least **24** — so a change to it in either direction is visible rather than silent. See the amendment below for why the two criteria could not both be met. The calendar's seven columns all fit, each day cell at least 40 px wide. This is the primary case: no criterion above requires a control that exists only at desktop width.
20. **AC-20** — **Which checks survive with no database,** mirroring 003 AC-23, 006 AC-32, 007 AC-29, 008 AC-32 and 009 AC-31. With `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointing at a hostname that does not resolve: `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` each exit `0`, and both `init` scripts exit `0` ending with `[OK] Environment ready (database checks skipped)`. No module this feature adds opens a connection at import time, and both new pages declare `export const dynamic = "force-dynamic"` — additionally asserted by a derived check that **every** `page.tsx` under `src/app/` outside `src/app/(public)/` declares it, which is true of all 17 today and of the **18** this feature leaves behind — this feature adds **one** page file, `src/app/stock-takes/counts/[id]/page.tsx`, because `src/app/stock-takes/page.tsx` has existed since #3 as a placeholder and is **replaced rather than created**. The criteria provable without Postgres are AC-2, AC-3's scan half, AC-4's scan half, AC-7, AC-10, AC-13's scan half, AC-18's module half and AC-20 itself; every other criterion needs a database or a browser and lives in `*.db.test.ts` or `tests/e2e/`.
21. **AC-21** — **The gate is green in full, and the e2e suite stays self-cleaning at `retries: 0`.** `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, `npx prisma migrate status` and `npm run test:db` all pass, and `./init.ps1` ends with `[OK] Environment ready` having **executed** the database checks. Two new specs, `tests/e2e/stock-takes-calendar.spec.ts` and `tests/e2e/stock-takes-count.spec.ts`, run in the **`chromium-stock-entry`** project — they seed counts against the yard sheets, which is the collision `playwright.config.ts` separates the two projects to avoid — so the only change to that file is its two route patterns, which become `/(stock-entry|stock-takes)-.*\.spec\.ts/` in both the `chromium` `testIgnore` and the `chromium-stock-entry` `testMatch`; `git diff -- playwright.config.ts` shows no other changed line, and `retries: 0`, `workers: 3`, `fullyParallel: false`, both timeouts, the `dependencies` array and the `webServer` block are byte-identical. `RESERVED_YEAR` in `tests/e2e/support/stock-entry.ts` gains `takesCalendar: 2101` and `takesCount: 2102`; each file deletes only **its own** year in `beforeAll` and `afterAll`, never the range, and asserts through `realCountIds()` that the set of `StockCount` ids with `periodYear < 2090` is identical before and after (007 AC-30). Those two years are reachable although 007 AC-8 caps a submitted period at 2100, because these specs build their counts with the existing `seedCountWithLines`, `fillQuantities`, `submitAs` and `approveAs` helpers, which go through Prisma and the lifecycle service rather than through the period-validating start flow; the note beside `RESERVED_YEAR` recording "2100 is the last reservable year" is corrected to say that the cap binds only counts created through `startCount`. The shipped assertion in `tests/unit/stock-entry-contract.test.ts` that censuses the stock-entry specs and their years is amended, in exactly one `it()` block, to select **every spec under `tests/e2e/` that imports `RESERVED_YEAR`** — twelve files, twelve distinct years — rather than matching a filename prefix, so it goes red for a new spec of either name that reuses a year. `Item`, `ItemPrice` and `ItemLocation` row counts are unchanged by the run. Two consecutive full `npm run test:e2e` runs report `0 flaky` and `0 failed`; if the suite is not stable at `retries: 0`, the implementer reports that rather than restoring retries or raising a timeout.
22. **AC-22** — **No migration, no new table, and nothing touched that this feature does not own.** `prisma/schema.prisma`, every directory under `prisma/migrations/` and `prisma/migrations/migration_lock.toml` are **byte-identical** to their state before this feature — every column it reads was shipped by #4 — and `npx prisma migrate status` reports no drift and no pending migration. `TRUNCATED_TABLES` in `src/server/test-db.ts` is unchanged and still equal as a set to exactly `["Item", "ItemLocation", "ItemPrice", "ItemType", "StockCount", "StockCountLine", "Supplier", "User"]`, so **020 AC-4's `information_schema` equality passes untouched**. `src/app/stock-entry/**`, `src/server/counts/count-service.ts`, `src/server/counts/count-entry-service.ts`, `src/server/counts/count-lifecycle-service.ts`, `src/server/counts/count-summary-service.ts`, `src/lib/count-messages.ts`, `src/lib/auth-config.ts` and `src/middleware.ts` are byte-identical; the only shipped source file this feature edits is `src/components/stock-entry/CalendarGrid.tsx` (AC-4), and the only shipped non-source files it edits are `playwright.config.ts`, `tests/e2e/support/stock-entry.ts` and `tests/unit/stock-entry-contract.test.ts`, each amended exactly as AC-2, AC-4 and AC-21 name and no further. `git status --porcelain -- Samples` is empty.

## There is no AC-33 here, deliberately

#9's ruling, recorded in its *Post-approval amendments*: **a criterion whose subject is other
criteria has no mechanical check and no owner**, so any change anywhere falsifies it and
nothing recomputes it. It was wrong four times, and its failure mode is worse than being wrong
— a stale count reads as a completed reconciliation.

This spec therefore contains **no criterion that counts or enumerates other criteria**. Every
shipped assertion this feature amends is named inside the criterion that forces it, and
nowhere else:

| Shipped assertion amended | Forced by | Why it cannot stay as it is |
|---|---|---|
| `tests/unit/stock-entry-contract.test.ts` — the hand-listed `loading.tsx` directories | **AC-2** | Two new protected routes; the list becomes a derivation from the tree, which is #9's own prescribed replacement |
| `tests/unit/stock-entry-contract.test.ts` — the stock-entry spec and reserved-year census | **AC-21** | Two new spec files reserve two new years under a filename the census's prefix match cannot see |
| `playwright.config.ts` — two route patterns | **AC-21** | The new specs seed against the yard sheets and must run in the second project |
| `tests/e2e/support/stock-entry.ts` — `RESERVED_YEAR` and its 2100 note | **AC-21** | Two years added; the note's claim is true only of counts made through `startCount` |
| `src/components/stock-entry/CalendarGrid.tsx` — two optional props | **AC-4** | Reusing the one grid rather than writing a second |

Where AC-2's and AC-21's replacements are **derived from the tree** rather than typed out, they
go red in the session that causes the change instead of three phases later. If any other
shipped assertion turns red, that is a finding to report in
`progress/impl_stock_takes_history.md` — not a licence to edit it.

## Out of scope

- **Any monetary figure at all.** No price, no line value, no count total, no yard total, no
  MoM, no YoY, no breakdown — for **either** role, on **every** surface this feature adds.
  Totals and variances are #11 `analysis`, and Part 6 puts every euro in the product there.
- **Editing anything.** No quantity input, no autosave, no *None held*, no signature, no
  submit, no approve, no reopen, no delete. This feature has no server action, no route
  handler, no form and no write. A wrong number in an approved count is corrected through #9's
  audited reopen, from `/stock-entry`.
- **Starting a count.** `/stock-takes` offers one *Start a count* link, and only in the
  never-counted-anything empty state; it points at `/stock-entry/new`, which is #7's. Day cells
  here are not start affordances.
- **The three filter categories.** Supplier, Type and Unit multi-select is #8's, on the
  counting screen. The only filters here are the yard scope and held / all, and neither is a
  facet panel.
- **Sorting, searching or paging a count.** Rows appear in sheet order, all of them, never
  truncated and with no "show more". 82 rows render in one page.
- **The signature, the lifecycle sentences and the audit trail.** `Signed by …`,
  `Approved by …`, the drawn signature and the reopen history are #9's, on
  `/stock-entry/counts/[id]` and `/summary`; the one link this feature renders into that tree
  is how they are reached. Adding them here would mean this page reads `submittedAt` and
  `approvedAt`, which 007 AC-25's scan forbids outside two named files, and the honest answer
  to that is a second mapper for facts a history calendar does not need.
- **Comparing two counts.** No side by side, no "changed since last month", no movement
  column. Movement is a derived figure and it belongs with the other derived figures in #11.
- **Cross-yard sequencing on the detail.** The jumps are same-yard by design (see *The rules
  this contract encodes*); `Both` is a calendar scope, not a reading order.
- **A scope-aware default month.** `defaultMonthKey` stays the month of the most recent count
  **anywhere**, unchanged from #7, so there is one definition of "the month this opens on".
  Choosing Clonmel when Clonmel was last counted three months ago therefore lands on a month
  with no Clonmel counts, and *Previous count* is one tap away. See *Open questions* 1.
- **Housekeeping.** Dormant and one-off items, and the archive control, are #14. This feature
  renders what a count held; it never proposes an action about an item.
- **Trucks, boilers, bags and yard bulk.** M7.
- **Per-yard permissions.** Any signed-in user may read any yard's history; there is no
  yard-scoped user and no third role (003, Part 6).
- **Printing or exporting this view.** The `.xlsx` workbook and the printable blank sheet are
  #12 and #13.
- **A migration, an index or a performance change.** The `@@index([periodYear, periodMonth])`
  and the `countDate` reads #4 and #7 shipped are what this queries through.
- **CI.** `init` remains the gate.

## Post-approval amendments

All three were found by Phase B, reported rather than quietly worked around, and ruled on by
the coordinator before the review. Each is a defect in the spec, not in the implementation.

### AC-19 — the count badge is excluded from 44 × 44, 2026-09-12

**The conflict.** AC-19 requires every control the flow touches to have a bounding box of at
least 44 × 44 CSS px, and lists the count badge among them. AC-4 requires that
`/stock-entry`'s calendar render exactly as it does today — `src/app/stock-entry/page.tsx`
byte-identical, `CalendarGrid` gaining two optional props whose defaults reproduce today's
behaviour. **The badge belongs to `CalendarGrid`, which is #7's.** Measured at 390 px on both
calendars, it is **47.14 × 29**. The two criteria cannot both be satisfied.

**The ruling: AC-4 wins, and AC-19 gives up the badge.** Three reasons, in order of weight.

1. **Meeting AC-19 would change #7's screen from inside #10.** A read-only feature whose
   headline guarantee is *the two calendars are one calendar* cannot restyle the other
   calendar to satisfy its own ergonomics criterion. That is the "tweak" the brief forbids,
   and AC-4's byte-identity is the mechanical guarantee that prevents the drift this whole
   feature was shaped to prevent.
2. **The geometry does not fit.** A day cell is 64 px tall and must hold **two** badges — the
   real case, both yards counted the same day, which AC-6 requires and the fixture builds. Two
   44 px badges plus the gap is ~92 px. Honouring AC-19 means a calendar roughly half again as
   tall, which then has to be re-measured against AC-19's own no-sideways-scroll assertion and
   against #7's shipped criteria at 320 px. That is a redesign of #7's calendar, and it belongs
   in a session that owns #7.
3. **The cost is small and bounded.** 47 × 29 is under the 44 px guidance in one dimension
   only, and the badge sits inside a 55 × 64 cell with nothing adjacent to mis-tap — an empty
   day renders no anchor at all (AC-5), and the two badges in a shared cell are the only
   neighbours. Every *other* control AC-19 lists is asserted at 44 × 44, at 390 px and at
   320 px, in both views and all three scopes.

**What replaces it is a pinned box, and the pin is bounded on both sides.** The badge's width
and height must be **identical** on `/stock-entry` and `/stock-takes` — which is AC-4 measured
rather than scanned, and a better assertion than AC-19 ever was — its width at least **40** px,
its height **below 44**, and its height at least **24** px. The lower bound is not decoration:
without it the assertion is one-sided, and shrinking is the direction an accidental style change
most often goes. The fourth amendment below records that this spec first claimed a two-sided
guarantee it did not have.

**The debt is real and is not being hidden.** If the badge should be a 44 px target, the change
is taller day cells in `CalendarGrid`, it changes both calendars, and it is a feature of its
own. Recorded here so the decision has an owner rather than evaporating.

### AC-20 — the census is 18 pages, not 19, 2026-09-12

The criterion said the derived `force-dynamic` check is "true of all 17 today and of the 19
this feature leaves behind". 17 today is right; **18** is what this feature leaves behind. It
adds **one** page file, not two: `src/app/stock-takes/page.tsx` has existed since
`feat(#3): identity, roles, and the first migration` as a placeholder and is **replaced**, not
created. Verified independently of the implementer by counting `page.tsx` under `src/app/`
outside `(public)` — 18 — and by `git log` on that path, which names #3.

Phase B followed the tree rather than the spec (`expect(pages).toHaveLength(18)`) and recorded
the arithmetic instead of rounding to the stated number. That is the right call and worth
naming: **an equality that agreed with a wrong number would be a test asserting a typo**, and
it would have gone green for exactly as long as nobody checked.

### AC-2 — the criterion named a request that cannot degrade, 2026-09-12

AC-2 predicted that adding `src/app/stock-takes/loading.tsx` turns AC-1's **unauthenticated**
`GET` of `/stock-takes/counts/<id>` from a `307` with a `Location` header into a `200` with
none. Phase B reproduced the experiment properly — byte copy, file added, build, measure,
remove, rebuild, re-measure — and that request is **`307` in both trees, with the same
`Location`**. It does not degrade and it cannot: that refusal is the **middleware's**,
`PROTECTED_PATHS` has held `/stock-takes` since #3, and the middleware answers before any
Suspense boundary exists.

The refusal that *does* degrade is the one the page issues itself — the query-parameter
`redirect()` — and it degrades exactly as #3, #6, #7 and #9 each recorded: `307` with a
`Location` becomes `200` with none. **The rule was right; the example was wrong**, and the
example is the part a future reader would run. Left uncorrected it would have produced a probe
that passes with the guard broken, and then the conclusion that the guard had stopped
mattering — the same species of defect as a stale AC-33, arriving by a different road.

The criterion now names `?yard=banana` as the probe and states why AC-1's request is not one.

### AC-19's replacement assertion was one-sided, and the amendment said it was not, 2026-09-12

Found by the #10 reviewer, by mutation rather than by reading, and it is the **coordinator's
error, not the implementer's**. The amendment above originally read:

> its height asserted **below 44** … *A later change to the badge in either direction turns
> that red.* … the number is now recorded in a place that fails when it moves.

Both sentences were false. The reviewer shrank the shared badge from 29 px to 8 px tall in
`CalendarGrid.tsx`, rebuilt, and the replacement assertion **passed**:

```
ok 3  AC-4, AC-19: the badge is the SAME box on both calendars, and is not a 44 px target (2.8s)
```

It could not have done otherwise. `toBeLessThan(44)` cannot be falsified by a reduction; the
width bound is a width bound; and the cross-page height equality is blind to a change in a
component **both** pages render, which is every change to the badge. The assertion caught three
things — the badge growing past 43 px, the badge narrowing below 40 px, and the two calendars
diverging — and not the fourth, which is the direction an accidental style change most often
goes.

**Both halves are closed, and the order matters.** The assertion gains
`expect(takes?.height ?? 0).toBeGreaterThanOrEqual(24)`, making the guarantee two-sided in fact;
and the amendment's text above is rewritten to state exactly what is pinned. Correcting only the
text would have been honest and cheap, but it would have left a 47 × 29 badge with no floor
under it in a feature whose ergonomics criterion was already waived once.

**Why this is recorded at length rather than quietly fixed.** It is the same species of defect
as a stale `AC-33`, which this spec has a whole section explaining that it will not write: *a
claim about a guarantee, with nothing that recomputes it, read later as a completed
reconciliation.* The amendment was written in the same session that argued against exactly this,
and it still happened — which is the argument for the reviewer role, not against it. It is the
fourth coordinator overstatement this project has had corrected by a reviewer reading the diff,
after #4's lint regex, #9's 008 AC-18 scan and #9's AC-33 replacement. The pattern is
consistent: each was a claim that a change made something *stronger*, asserted without a
mutation to back it. **A guarantee is worth nothing until it has been watched failing** — and
that applies to the sentences the coordinator writes about assertions, not only to the
assertions.

### AC-19 gains the email that actually overflows, 2026-09-12

Found during the repair pass, by an implementer sent to satisfy B1 and asked to **verify the
reviewer's reasoning rather than trust it**. It did, and the reasoning turned out to be right
about the mechanism and one step to the side about the lever.

**The chain.** The reviewer required AC-19's viewport measurements be repeated in an `ADMIN`
session, because the identity header sits *outside* `stock-takes-body` — so AC-13's byte
equality cannot cover it — and `{user.email}` is rendered with no `break-words`. That header is
the only part of either page whose content varies per session, and an email is one unbreakable
token: at 320 px it is exactly what pushes `scrollWidth` past `clientWidth`.

**Every step of that is true except the conclusion that the role is the lever.** The
implementer proved the overflow is real by giving the fixture a hyphen-free local part, and the
existing assertion caught it **at 390 px, before 320 px was even reached**. It then proved why
the suite never sees it: `createTestUser` builds `${label}-${16 hex}@macroads-e2e.invalid`, and
this feature's labels — `stock-takes-calendar`, `stock-takes-count` — are full of hyphens.
**Browsers take a line break after a hyphen**, so the longest unbreakable run in any fixture
email is about 25 characters, which fits at 320 px. Both roles' emails are the same length *and*
the same shape by construction, so the administrator pass can only ever agree with the staff
pass.

**The added ADMIN repetition therefore passes, and would pass just as surely with the header
broken.** It is kept — AC-19 asks for it in plain words, it is cheap, and a measurement that
names its role is a better failure message — but it is not what closes the defect. What varies
in production is the email's **content**, and nothing pressured it.

So AC-19 now requires the measurement to be taken with a long unbreakable local part, and
requires the header to wrap. The one-line source fix and the fixture that pressures it land
together, which is the only arrangement in which the transcript above becomes a shipped
guarantee instead of a probe somebody once ran.

**`/stock-entry` has the identical unprotected header** (`src/app/stock-entry/page.tsx`, the
same `<p data-testid="signed-in-email" className="text-sm text-slate-600">`), and it is **not**
fixed here. AC-22 pins `src/app/stock-entry/**` byte-identical for this feature, and AC-19's
scope is this feature's two pages. That is the same ruling as the badge: a read-only history
feature does not reach into the counting screen, even to improve it. **Recorded as a debt
against 008 AC-30**, whose no-sideways-scroll measurement has the same blind spot for the same
reason, with the reproduction above as the evidence and a session of its own as the owner.

**What this is an instance of.** The reviewer's finding was correct and would have been closed
by a change that did not close the defect — a green test, a satisfied criterion, and the bug
still shipping. It was caught only because the implementer was asked to verify a claim it had
been handed, and did, against a prediction that it would pass. *A test added to satisfy a
finding is not evidence the finding's defect is gone.* That is the same lesson as #9's M7 and
M12, arriving from the reviewer's side of the handoff rather than the implementer's.

### AC-19's 40-character floor was satisfiable by a run that cannot fail, 2026-09-12

The fifth amendment, written by the coordinator one pass earlier, required a local part of "at
least **40** characters". **That number was picked by eye and it is wrong.** It is corrected to
**56** above.

The implementer sent to land the fix was told to watch the test fail first, and to stop and
report if it went green before the source change. It did go green, and it stopped:

```
attempt 1 — a 45-character label, against the UNFIXED page.tsx
  ok 1  AC-19: the calendar never scrolls sideways at 390 px or 320 px, in any scope (14.6s)
  1 passed
```

The arithmetic it then wrote down is the part worth keeping. The header is `text-sm` (14 px)
inside `p-3`; a 56-character run measures `scrollWidth 394` against a 390 px viewport, so the
token costs roughly **6.6 px per character**. Forty characters is ~264 px, and a 320 px viewport
leaves 296 px inside the padding — a 40-character run sits *inside* the threshold at both
viewports. Nothing was breaking the token. **The criterion's floor simply admitted labels that
cannot overflow**, which would have shipped a test that passes for the wrong reason, against a
page with the bug still in it. Exactly the outcome the fifth amendment was written to prevent,
reproduced one level down, in the number rather than in the lever.

At 61 characters the same test, unchanged, against the same unfixed page:

```
  Error: YARD_STAFF 390 DUBLIN
  expect(received).toBeLessThanOrEqual(expected)
  Expected: <= 390
  Received:    424
  1 failed
```

**34 px of sideways scroll at the wider viewport**, in the first measurement the test takes.
After `break-words`, all 17 tests in the file pass, 320 px included.

The shipped test guards its constant at the **measured** 56 rather than the criterion's number,
with the arithmetic in a comment beside it — so a future reader who shortens the label to tidy it
turns the guard red instead of quietly restoring the blind spot.

**This is the second coordinator error inside this feature's own amendments**, after the
one-sided badge bound, and both have the same shape: *a claim about what an assertion protects,
written without measuring.* The badge bound was caught by a reviewer's mutation; this one by an
implementer following an instruction to distrust the brief. Neither was caught by writing the
amendment more carefully, which is the point — **the number has to be measured, and the
measurement has to be the thing that lands in the file.**

### The same header overflows on two other routes, 2026-09-12 — debts with numbers

Measured by a temporary read-only probe, run once and restored, with
`src/app/stock-entry/page.tsx` never opened for writing (its hash is identical at every step of
the repair pass):

```
PROBE /stock-entry 390  scrollWidth=424  clientWidth=390     PROBE /stock-takes 390  424 / 390
PROBE /stock-entry 320  scrollWidth=424  clientWidth=320     PROBE /stock-takes 320  424 / 320
```

**`/stock-entry` overflows by exactly as much as `/stock-takes` did — 34 px at 390 and 104 px at
320, identical to the pixel at both widths.** That identity is the evidence it is the same defect
in the same element: the document's width is set by the unbroken token plus the shared `p-3`, so
it does not depend on what else the page draws. It is left alone here because AC-22 pins
`src/app/stock-entry/**` byte-identical and AC-19's scope is this feature's two pages. **The debt
against 008 AC-30 now carries its numbers**, and the fix is the identical twelve characters at
`src/app/stock-entry/page.tsx:83`.

**A third instance, previously unrecorded:** `src/app/analysis/page.tsx:21` carries the same
element at `text-base`, which is *wider* than `text-sm` and therefore overflows sooner, and no
criterion anywhere measures that route on a phone. It is #11's page and #11 is the next feature,
so it is carried into #11's spec rather than filed as a debt.

Three instances of one defect, in a project whose brief is *phone-first*. The general lesson,
recorded here because it will outlive this feature: **a layout guarantee asserted only against
fixture data is a guarantee about the fixture.** Every one of these routes had a
no-sideways-scroll assertion. All three passed. The emails were hyphenated.

### Two of AC-22's assertions expired at the commit, 2026-09-14 — after #10 closed

Found by #11's Phase A implementer on a clean tree, reported rather than edited, and it is a
**class defect worth more than the instance**.

Both assertions in `tests/unit/stock-takes-contract.test.ts` -> *"AC-22: the one shipped source
file this feature edits"* read the **working tree** and require #10's changes to be
**uncommitted**:

- *"CalendarGrid.tsx is the only changed file in #7's trees"* — `git status --porcelain`,
  `expect(files).toEqual([GRID])`
- *"playwright.config.ts changed by exactly its two route patterns"* — `git diff --unified=0`,
  `expect(changedLines).toHaveLength(4)`

They passed for the whole of #10 and went red the moment `b468f60 feat(#10)` was committed:
`expected [] to deeply equal [ "src/components/stock-entry/CalendarGrid.tsx" ]`.

**The general rule: an assertion whose subject is the working tree is an assertion that expires
at the commit.** It passes exactly once — during the session that writes it — and then fails
forever, in a feature nobody is working on, for a reason unrelated to anything the next author
did. That is worse than a test that never ran: it teaches the next person that a red suite is
normal.

**The distinction is precise, and most of this project's tree assertions are on the right side
of it.** An audit found fourteen `git status --porcelain` call sites across five files, of which
**thirteen** assert **absence** — `expect(porcelain).toBe("")`, "this file was never touched"
— which stays true after a commit, forever, and one asserts **presence**. The second expiring
assertion is not a porcelain call at all but the `git diff --unified=0` line count beside it;
an earlier draft of this amendment folded it into the porcelain tally and said "twelve … only
these two", which is off by one. Corrected by the repairing implementer. **Exactly two
expiring assertions existed and both are repaired here** — that conclusion never moved. Presence is the expiring direction. #11's own AC-25 assertion, written the same
week, is the durable kind.

**The durable spelling is a fixed commit range**, not the working tree: `git diff --name-only
ee448cb..HEAD -- <paths>`, where `ee448cb` is `spec(#10): approve stock_takes_history`, the
commit #10 was built on. That claim — *"between the spec's approval and now, exactly one file in
#7's trees changed"* — is the claim AC-22 was always making, it is true before the commit and
after it, and it keeps working when #11, #12 and #16 land on top.

Both assertions are rewritten to that form. Nothing about what they require is loosened: the
first still names exactly one permitted file and still requires every other file in both trees
to be identical; the second still requires exactly four changed lines, each matching the route
pattern, and still pins `retries: 0`, `workers: 3`, `fullyParallel: false`, both timeouts, the
`dependencies` array and the `webServer` command.

**Why this is recorded against #10 rather than fixed silently in #11.** The defect is #10's, it
was found on a tree #11 had not yet touched, and #11's implementer was explicitly forbidden to
edit it — *"that is a blocker to report, not a licence to edit it"*. Reporting it was the
correct move and cost #11 a gate. The repair is dispatched as its own pass, against this
amendment.

### Two byte-identity comparisons embed globally-derived values, 2026-09-14 — found during #11

Neither is a hydration race, and the `<!-- -->` guard cannot see either. Both were diagnosed by
extracting the two strings and diffing them character by character rather than by reading the
truncated reporter output.

**AC-9 — `?show=held` renders identically to no `?show`** (`stock-takes-count.spec.ts:278`).
The two bodies were **exactly the same length**, 33,811 characters, and differed at char 859:

```
expected  .../stock-takes/counts/cmu1kbxop009jjz24s7umws9d">Previous count</a>
received  .../stock-takes/counts/cmu1kc1xe00bwjz244fczep5p">Previous count</a>
```

**The *Previous count* neighbour resolved to a different count between the two navigations.**
`findNeighbourCounts` orders by `(countDate, id)` across **the whole yard's history**, so while
any other spec is concurrently creating or deleting Dublin counts — `workers: 3`, and the
stock-entry specs do exactly that — the neighbour changes underneath the comparison. Cuids are
fixed width, which is why the **lengths matched**: the equality failed while
`expect(adminBody.length).toBe(staffBody.length)` passed, and that is the signature to
recognise.

This is why it was *"unreproducible in isolation"*: alone, nothing mutates the neighbour.

**AC-13's role comparison has the identical exposure** — two bodies fetched at different
moments, both embedding neighbour hrefs — and it failed on the same run for the same reason.
010's Phase B fixed two assertions that *named* another spec's reserved year, and correctly
rewrote them to depend on "nothing exists after". **It did not reach the ones that depend on a
neighbour id transitively, through the rendered href.** 007 AC-30's per-spec reserved years do
not help here: a neighbour is chosen across every year, so another spec's 2090-series count is
a perfectly good "previous count" for a 2102 one.

**The claim these tests make is role- and mode-invariance, not neighbour identity.** The repair
must keep the claim and drop the accidental dependency: normalise the two count-jump `href`s
before comparing (asserting separately, in a test that owns its own data, that the jumps point
where they should), or assert the equality on a count whose neighbours cannot move. The
byte-identity guarantee is worth keeping — it is the whole point of the feature — but it must
not be a hostage to what another spec happens to be doing in another worker.

### AC-17's price check compares a bare number against the whole HTML, 2026-09-14

Not #10's, but found in the same run and it is the same species, so it is recorded here and
repaired with it. `stock-entry-quantities.spec.ts:560` asserts the staff body does not contain
`aRealPrice`, a price taken from the database as a plain string. After the e2e debris was
cleared from the development database the chosen price became **`"890"`**, and the assertion
failed on:

```
<input type="hidden" name="$ACTION_KEY" value="k934edebf36a890835fd557e0f4833e0b"/>
```

A three-digit price inside a random 32-character hex action key. **No money leaked** — the same
test's `unitPrice` and `No price` assertions passed, and the money-key walk over the JSON
passed — but a guarantee that fails on a coincidence is a guarantee that will one day be
*silenced* on a coincidence, which is the real cost.

The repair is to make the comparison specific: search the rendered **text**, or exclude
framework-generated attributes, or require the price to appear in a money-shaped context. A
bare `toContain` of a short numeric string against raw HTML cannot distinguish a price from a
hash, an id, a class name or a timestamp.

**What both share.** An assertion is only as strong as the *specificity* of what it compares.
Each of these compares something broad — a whole rendered body, a whole HTML document — against
something that is not fully under the test's control. They passed for many features by luck,
and the luck ran out when a neighbouring spec's timing changed and when four rows were deleted
from a database.

### "2102 is the highest reserved year" stopped being true when #11 reserved three more, 2026-09-14

Found by the implementer repairing the eighth and ninth amendments, on a run in which it could
not itself reproduce the failure, and reported with the prediction *"expect it to fail on the
full gate run"* — which is the most useful form a finding can take.

`tests/e2e/stock-takes-count.spec.ts:386` justifies asserting that an approved count's *Next
count* control is **disabled** with a comment: *"'Nothing after' is a fact this file can rely
on: 2102 is the highest reserved year."* It was true when written — twelve spec files, twelve
years, 2102 the top.

**#11 reserved `analysisAccess: 2103`, `analysisPrior: 2104` and `analysisFigures: 2105`, and
both analysis specs seed DUBLIN counts in them.** Fourteen files, fifteen years, three of them
above 2102. Every one of these files runs in the `chromium-stock-entry` project with three
workers, so whenever an analysis spec's rows exist, that Dublin count **does** have a next
count and the control is an anchor. The assertion is simply false now, and it passed in five
consecutive repair runs only because the analysis specs were not in those invocations.

**#11 is not at fault.** Reserving its own year per spec is exactly what 007 AC-30 requires,
and #11 followed it. The defect is in the assertion, which took a fact about *the suite at one
moment* and wrote it down as a fact about *the yard*. That is the ninth amendment's lesson
arriving a third time: **an assertion is only as strong as the specificity of what it compares,
and "nothing exists after" is a claim about every other spec in the repository.**

It is also, exactly, what 010's Phase B thought it had fixed. Its report records rewriting two
assertions that named another spec's reserved year "to depend on 'nothing exists after'"
instead. **That substitution traded a dependency on one named spec for a dependency on all of
them** — narrower-looking, in fact broader, and invisible until a feature added a higher year.
The repair must not reach for a third version of the same idea: the assertion needs a scenario
whose neighbours this file *controls*, not a fact about what else happens to exist.

**AC-14 carries the same exposure, one line from being covered.**
`stock-takes-count.spec.ts:481` compares two bodies of the approved count fetched at different
moments, and the approved count's *next* is now a globally-derived neighbour of the eighth
amendment's species. AC-9 and AC-13 are masked; AC-14 is not, purely because the repair brief
scoped that pass to three assertions. It is repaired here.

**One narrower race is left in place deliberately, and recorded rather than hidden.** The
draft's *Previous count* renders as a disabled `span` when this file runs alone and as an
anchor when another spec's counts exist beside it. If that flips **between** the staff fetch
and the admin fetch, the raw lengths differ and `expect(adminBody.length).toBe(staffBody.length)`
fails. It is not masked, because masking the control's *state* would hide a genuine role
difference — *"the jump is a link for the administrator and dead for the yard staff"* is a
fault this comparison exists to catch. The window is one `beforeAll` or `afterAll` landing
between two navigations. Accepted, with its cost stated.

## Open questions

None blocking. Three decisions this spec settles with a stated answer rather than leaving them
undefined, each flagged so the user can strike it at approval:

1. **The month this opens on ignores the yard scope** (*Out of scope*, AC-11). Reusing
   `defaultMonthKey` unchanged keeps one definition of "the last stock take" and leaves #7's
   service byte-identical, at the cost of one extra tap when one yard is behind the other.
   Striking this means a scope-aware default and a second query, and 007 AC-22 would need
   re-reading.
2. **Drafts and submitted counts appear on Stock Takes, not only approved ones** (AC-8's status
   labels, and *The rules this contract encodes*). The alternative — approved only — would make
   the two calendars disagree about the same day and would hide from the admin's own landing
   page the submitted counts that are waiting for them. Striking it means deciding what the
   calendar shows on a day whose only count is a draft.
3. **The detail links into `/stock-entry/counts/<id>` rather than carrying the lifecycle facts
   itself** (AC-15, *Out of scope*). It keeps this feature to one query path and no role branch.
   Striking it means #10 renders the signature and the approval sentences, which needs a second
   mapper over `getLifecycleFacts` — cheap, but it widens a read-only screen into the
   lifecycle, and the lifecycle is where the role-shaped link lives.
