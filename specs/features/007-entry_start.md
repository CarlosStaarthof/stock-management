# 007 — Start a stock count

**Feature id:** 7   **Status:** approved   **Approved:** 2026-09-11
**Depends on:** #3 `auth_and_roles` (the session, `requireUserPage`, `assertUser`,
**`shapeForRole`**, `deepKeys` / `assertNoMoneyKeys`, the typed errors and the 307-not-200
lesson), #4 `domain_schema` (`StockCount`, `StockCountLine`, `@@unique([locationId,
periodYear, periodMonth])`, the `StockCount_periodMonth_range` CHECK and the two `date`
columns), #5 `seed_from_workbook` (the 140 items and 152 yard links this pre-populates
from), #6 `item_master_ui` (**`listSheet` — the one definition of a yard sheet**, the
single-sourced messages module, and the served-build e2e suite at `retries: 0`),
#2 `app_scaffold` (Tailwind, the shared error boundary, the two vitest configs)

## Purpose

This is **the first screen a `YARD_STAFF` user will ever see**, and the first feature that
sends real domain data to a staff session. It turns the period model of
`specs/domain-model.md` Part 4 from a paragraph into a screen: a calendar of what has been
counted, then a confirmation of who is counting, at which yard, on which date — and the
period that date closes, shown before anything is written and overridable.

Without it there is no `StockCount` row, so #8 has nothing to type into and #9 has nothing
to sign. The database today holds **zero** `StockCount` rows; every count the product will
ever hold starts here.

It is also the feature that settles two things every later one inherits:

1. **The money boundary stops being a route boundary.** Until now every screen was
   `ADMIN`-only, so refusing at the door was enough (006 AC-2). Part 6 puts "create and
   edit a `DRAFT` count" in **both** role columns, so from here the boundary is a
   *response-shaping* one and `shapeForRole` — shipped by #3, unused until now — gets its
   first real caller.
2. **A count is not a date.** `countDate` is a recorded fact; `(locationId, periodYear,
   periodMonth)` is the key. The workbook could express neither, and nine of its 31 count
   columns have a date that is missing, mistyped or not a date at all.

## Scope boundary with #8 and #9

**In:** the calendar, the confirm-and-start flow, the period rule, the one-count-per-yard-
per-month refusal, resuming a draft, and the creation of a `DRAFT` count pre-populated with
one `StockCountLine` per item on that yard's sheet with `quantity = null`.

**Out, and owned elsewhere:** typing a quantity, autosave, the three filter categories and
adding a one-off item mid-count are #8 `stock_entry_ui`; the drawn signature, submission,
the `unitPriceSnapshot` write and approval are #9 `entry_submit`; the yard selector, the
previous/next-count jumps and the read-only history of an approved count are #10
`stock_takes_history`. This feature creates the thing all three operate on and does nothing
to it afterwards. See *Out of scope*.

**No migration.** `prisma/schema.prisma` and every directory under `prisma/migrations/` are
byte-identical after this feature. Part 3's `StockCount` and `StockCountLine` are what #4
shipped; this is the first feature that writes a row into either.

**No route handler and no client-side fetch.** Every read is a server component; the one
write is a server action. So this feature emits no JSON, and the only body a session can
obtain from it is HTML — which is why AC-17 walks the object the service returns *and*
scans the rendered text, rather than a response envelope.

## User stories

- As a **YARD_STAFF** user, I sign in and land on a calendar of stock takes, so the first
  thing I see is when the yard was last counted rather than a menu.
- As a **YARD_STAFF** user, I confirm my name, my yard and today's date before I start
  counting, so a count is never attributed to the wrong yard or the wrong month.
- As a **YARD_STAFF** user, I am told which month the count closes — `This count closes
  September 2026.` — before anything is written, and I can change it if the yard is closing
  a different month.
- As a **YARD_STAFF** user standing in a yard on a Saturday, nothing tells me I may not
  count today. The workbook counted on Saturdays and Sundays; so does this.
- As a **YARD_STAFF** user whose phone lost signal halfway through, I come back to the same
  yard and continue the same count instead of starting a second one.
- As an **ADMIN**, I can start a count too, and I am additionally told how many items on
  that sheet have no price recorded, because those lines will value at zero (Invariant 4).
- As an **ADMIN**, I can see at a glance, on one month of a calendar, which yards were
  counted and which counts are still drafts.
- As the **owner**, I can be sure the yard phone was sent no euro figure, because the
  object the server built for that session has no monetary key in it at any depth.
- As the **implementer of #8 and #9**, I inherit a `DRAFT` count whose lines already exist,
  one per sheet item, every `quantity` null and every `unitPriceSnapshot` null.

## Data touched

| Model | Read | Written |
|---|---|---|
| `StockCount` | yes | **insert only** — one row, `status = DRAFT` |
| `StockCountLine` | yes | **insert only** — one row per sheet item, `quantity = null` |
| `ItemLocation`, `Item`, `ItemPrice` | yes, **only through `listSheet`** | never |
| `Location` | yes — the active yards, in `sortOrder` | never |
| `User` | yes — the actor's name, for `createdById` and the header | never |

Nothing here updates or deletes any row in any table. `submittedAt`, `approvedById`,
`approvedAt`, `signedById`, `signedAt`, `signatureSvg` and `notes` are written by nothing in
this feature (AC-25), and `unitPriceSnapshot` is written by nothing before #9 (Invariant 2).

**No new field, no new column, no migration.**

## The refusal, and the one guard that moves

Three mechanisms, all shipped, and **none of them changes**:

1. **Middleware.** `PROTECTED_PATHS` already contains `"/stock-entry"` and the matcher
   already contains `"/stock-entry/:path*"`; `isProtected` already matches every sub-path.
   `src/lib/auth-config.ts` and `src/middleware.ts` are byte-identical after this feature
   (AC-1).
2. **The page guard.** Every page under `/stock-entry` begins with
   `await requireUserPage()` from `src/app/page-guards.ts` — **not** `requireAdminPage`.
   Part 6 gives both roles the calendar, the count and the `DRAFT`; there is no role
   refusal on any route in this feature.
3. **The service.** Every function in `src/server/counts/` takes an explicit
   `actor: SessionUser` and starts with `assertUser(actor)` from
   `src/server/auth/guards.ts`, throwing `UnauthorizedError`. The actor comes from
   `requireUser()` / `requireUserPage()` and from nowhere else — never from a form field
   (AC-4).

**No `loading.tsx` at or above `src/app/stock-entry/`.** #3 and #6 both recorded why: a
`loading.tsx` puts a Suspense boundary above every page below it, the shell flushes, and a
server-side `redirect()` degrades from a 307 into a 200 carrying the page shell — a refusal
`curl` would accept. AC-3 re-proves it here, because `/stock-entry` is now a page with real
work to do and a loading state is exactly what someone will reach for.

### The one guard that moves: `listSheet`

`listSheet` today begins `assertRole(actor, "ADMIN")`. It cannot stay that way and also be
the one definition of a yard sheet (006 AC-24), because the caller that needs it most is a
`YARD_STAFF` user starting a count.

**Decided by the user at approval, 2026-09-11.** Two options were put:

| | What it does | Why not |
|---|---|---|
| Widen the guard, discard the price in the caller | `listSheet` returns `currentPrice` to any signed-in actor; `startCount` throws it away before writing | The guarantee rests on **every future caller remembering**. #8, #9 and #14 all read sheets for staff. And 006 AC-31's scan catches the *name* `unitPrice`, not a price passed onward under another field name |
| **Never build it for staff** ✅ | `listSheet` selects its shape through `shapeForRole` from `actor.role` alone: `currentPrice` for an `ADMIN`, **no such key** for a `YARD_STAFF` actor | — |

The chosen option is the one Part 6 already mandates for `CountForStaff` / `CountForAdmin`,
applied at the first place it bites. Part 6's rule is "**not hidden — not sent**", and
"built, then discarded by a conscientious caller" is a weaker thing than "never
constructed". `shapeForRole` has been shipped since #3 and unused until now; this is what
it was written for, and 003 AC-17's spy-thunk test — the unselected builder called **zero**
times — is the assertion AC-14 reuses.

So: the guard on the two **read** functions (`listSheet`, `locationName`) widens from
`assertRole(actor, "ADMIN")` to `assertUser(actor)`, and `listSheet`'s **return value** is
role-shaped. Every mutation in that module keeps `assertRole(actor, "ADMIN")`; all seventeen
still refuse a staff actor, and all seven `/item-master` routes still redirect a staff
session (AC-14).

Consequences held by criteria rather than by care:

- **A staff-facing value never contains a price at all.** #8 and #9 inherit safety rather
  than a discipline to remember.
- `startCount` writes lines with no `unitPriceSnapshot` (Invariant 2), nothing under
  `src/server/counts/` or `src/app/stock-entry/` names `unitPrice` or `unitPriceSnapshot`,
  006 AC-31's nine-file list is unchanged, and #9 is still the first reader of the snapshot
  column (AC-15).
- `/item-master/yards/<code>` still renders prices for an `ADMIN` exactly as 006 AC-24
  requires — the admin branch is unchanged.

One shipped assertion changes with it: `src/server/items/item-assignment-service.db.test.ts`
asserts today that `listSheet(staff, "DUBLIN")` rejects. That line is replaced by the
assertions AC-14 names. **No criterion of #6 is contradicted** — 006 AC-4 lists the
seventeen mutations and does not name `listSheet`, and 006 AC-24 pins the admin shape,
which is untouched.

The alternative nobody proposed — a second, staff-safe sheet query — is exactly the second
definition 006 AC-24 exists to prevent, and would have to be kept in step forever.

## Contract

### Routes — four, both roles, all `export const dynamic = "force-dynamic"`

| Route | What it is |
|---|---|
| `/stock-entry` | **The calendar.** One month of days. Query: `?month=YYYY-MM`, and `?denied=` which #3 and #6 still send here |
| `/stock-entry/new` | **Who, where, when.** The signed-in name (read-only), the yard, the count date. Query: `?countDate=YYYY-MM-DD`, `?locationCode=` |
| `/stock-entry/new/confirm` | **The period, before anything is written.** Yard, date, derived period with an override, and *Start count*. `GET` changes nothing. Query: `?locationCode=`, `?countDate=` |
| `/stock-entry/counts/[id]` | **The count.** Header plus the sheet in order, every quantity `Not counted`. #8 replaces the rows with inputs |

`/stock-entry` replaces #3's placeholder and keeps its three test ids — `signed-in-email`,
`sign-out` and `access-denied` — because three shipped e2e specs assert on them (AC-2).

### The server action — `src/app/stock-entry/actions.ts`

`startCountAction(prevState, formData)`. It obtains its actor with `await requireUser()`,
calls exactly one service (`startCount`), and on success `redirect`s to
`/stock-entry/counts/<id>`; on a domain error it returns `{ error, field? }` rendered
inline. It is the **only** write in this feature.

### Services — `src/server/counts/`

| Module | Exports | Touches Prisma |
|---|---|---|
| `count-service.ts` | `listCalendarMonth(actor, monthKey)`, `defaultMonthKey(actor)`, `listCountableYards(actor)`, `findCountForPeriod(actor, locationCode, period)`, `startCount(actor, input)`, `getCount(actor, countId)` | yes |
| `period.ts` | `periodForCountDate`, `formatPeriodKey`, `parsePeriodKey`, `formatPeriodLabel`, `monthKeyOf`, `previousMonthKey`, `nextMonthKey` | no — **pure** |
| `count-input.ts` | Zod schemas parsed at the edge of `src/server/` | no — **pure** |
| `src/lib/calendar-month.ts` | `buildMonthGrid(monthKey)` — Monday-first weeks of 7 | no — **pure** |
| `src/lib/yard-time.ts` | `YARD_TIME_ZONE`, `todayInYard(now?)` | no — **pure** |
| `src/lib/count-messages.ts` | every literal a criterion quotes | no — **pure** |

`count-input.ts` imports `locationCodeSchema` from `@/server/items/item-master-input`
rather than restating which yards exist. Four pure modules are why a third of these
criteria run in `npm run test:unit` with no database.

```ts
type Period = { periodYear: number; periodMonth: number };
type CountStatus = "DRAFT" | "SUBMITTED" | "APPROVED";

type CountBadge = {
  countId: string;
  locationCode: string;        // "DUBLIN"
  locationName: string;        // "Dublin"
  status: CountStatus;
  periodKey: string;           // "2026-09"
};

type CalendarDay = { date: string; counts: CountBadge[] };   // date is "YYYY-MM-DD"

type CalendarMonth = {
  monthKey: string;            // "2026-09"
  monthLabel: string;          // "September 2026"
  previousMonthKey: string;
  nextMonthKey: string;
  todayKey: string;            // today in the yard's zone, "YYYY-MM-DD"
  days: CalendarDay[];         // every day of the month, ascending
  countsInMonth: number;
  anyCountEver: boolean;
};

type CountLineRow = {
  itemId: string;
  description: string;
  unitLabel: string | null;
  sortOrder: number;
  quantity: string | null;     // decimal string or null, never a JS number
};

type CountForStaff = {
  countId: string;
  locationCode: string;
  locationName: string;
  periodKey: string;
  periodLabel: string;
  countDate: string;           // "YYYY-MM-DD"
  status: CountStatus;
  createdById: string;
  createdByName: string;
  lineCount: number;
  countedLineCount: number;
  uncountedLineCount: number;
  lines: CountLineRow[];
};

type CountForAdmin = CountForStaff & {
  /** Items on this sheet with no ItemPrice in force. Invariant 4: their lines value at 0. */
  itemsWithoutPrice: number;
};

type StartCountInput = {
  locationCode: string;
  countDate: string;           // "YYYY-MM-DD"
  period: Period;              // derived, then possibly overridden by the user
};
```

Quantity crosses the service boundary as a **string**, converted from Prisma `Decimal` with
`.toString()`. `docs/architecture.md` § Money and quantities forbids a JavaScript `number`
for anything the database stores as a decimal, and `21.6128` tonnes is the reason.

### The rules this contract encodes

**A count is keyed by its period, dated by its day (Part 4).** `periodForCountDate` is one
pure function: `day <= 5` gives the *previous* month, otherwise the date's own month, with
January rolling back to December of the previous year. It is shown to the user before the
write and overridden with one control. Nothing recomputes it afterwards, and nothing
validates the date against the period: a count dated `2026-10-01` that closes `2026-09` is
the ordinary case, not an anomaly.

**There is no business-day rule.** No screen warns about a Saturday, a Sunday or a holiday,
and no module contains the logic to (AC-9). The date is recorded as given.

**One count per yard per month.** `@@unique([locationId, periodYear, periodMonth])` is the
database's answer; `ConflictError` with the message `Count for DUBLIN in 2026-09 already
exists` is the domain's, and the screen offers the existing count instead of a second one.
`docs/architecture.md` forbids a Postgres string reaching a screen, so the service checks
first and still maps `P2002` to the same message if two requests race (AC-10).

**Who is counting is the session, not a text field.** `createdById` is the signed-in user's
id. The screen displays that user's name and email read-only. There is no "counted by"
input and no second identity mechanism: 003 AC-18 already established that nothing the
client sets decides who you are, and #9's drawn signature is the second, deliberate
artefact — a typed name here would be an unverifiable third.

**A new count is empty, not zero.** One `StockCountLine` per item on the yard's sheet, with
`quantity = null` — *not counted* — which is the distinction the workbook could not express
(Invariant 5) and the reason its blank cells are ambiguous. `0` means counted and none
held, and only a human writes it, in #8.

## UI states

- **Empty.** No counts anywhere: the calendar renders the current month with
  `No stock counts recorded yet.` and the *Start a count* control. A month with no counts
  in it, when others exist: `No counts in this month.` A yard with no items on its sheet is
  refused before anything is written: `Dublin has no items on its sheet. An administrator
  must assign items before this yard can be counted.`
- **Loading.** Month navigation is a plain link, so the browser's own progress is the
  loading state. *Start count* shows a pending state and cannot be submitted twice, so a
  double tap on a cold phone writes one count, not two — and the second would be refused by
  AC-10 anyway. There is deliberately **no `loading.tsx`** at or above
  `src/app/stock-entry/` (see *The refusal*).
- **Error.** A `ValidationError` renders inline beside the field it names, with the typed
  values kept. A `ConflictError` renders above the form, with the link to the existing
  count. Neither ever shows a Prisma or Postgres string. Anything else reaches the shared
  error boundary from #2.
- **Success.** The action redirects to `/stock-entry/counts/<id>`, which names the yard,
  the period, the date, who is counting, `Draft`, and `0 of 82 counted` — read from the
  freshly rendered page, not from client state.

## Acceptance criteria

Tests that touch only `period.ts`, `count-input.ts`, `calendar-month.ts`, `yard-time.ts` or
`count-messages.ts` are `*.test.ts` and run in `npm run test:unit` with no database. Tests
that write are `*.db.test.ts` under `src/server/counts/`, call `resetTestDb()` in
`beforeEach` and build their own fixture. Browser-level criteria are Playwright specs under
`tests/e2e/`.

1. **AC-1** — The section is closed to a signed-out request, and needs no new route protection. An unauthenticated `GET` of each of `/stock-entry`, `/stock-entry/new`, `/stock-entry/new/confirm` and `/stock-entry/counts/<id>` responds `307` (or `302`) to `/sign-in?callbackUrl=<the URL-encoded path and query>` and sends none of the page's content; signing in from that page lands on the requested path. `src/lib/auth-config.ts` and `src/middleware.ts` are **byte-identical** to their state before this feature, and `src/middleware.ts` still imports nothing from `@prisma/client`, so `tests/unit/hashing-boundary.test.ts` stays green unchanged.
2. **AC-2** — Both roles reach every route, and the three test ids #3 left on `/stock-entry` survive its replacement. Signed in as `YARD_STAFF` and again as `ADMIN`, each of the four URLs returns `200`. `/stock-entry` renders `data-testid="signed-in-name"` carrying the signed-in profile's name (amended by 021 AC-37, which retired the email), a `data-testid="sign-out"` control that ends the session, and — for any value of `?denied=` — `data-testid="access-denied"` carrying #3's `ACCESS_DENIED_MESSAGE`, `You do not have access to that page.`, from `src/lib/auth-messages.ts` unchanged. `tests/e2e/sign-in.spec.ts`, `tests/e2e/role-access.spec.ts` and `tests/e2e/item-master-access.spec.ts` pass **unmodified**, so 003 AC-14, AC-15, AC-21 and 006 AC-2 still hold against the new page.
3. **AC-3** — The refusal is the server's answer and stays one. In the shipped tree no `loading.tsx` exists at `src/app/stock-entry/`, at `src/app/stock-entry/counts/`, at `src/app/stock-entry/new/` or at `src/app/`; `src/app/(public)/loading.tsx` is unchanged and `/` still returns `200` with its loading fallback present. The implementer reproduces the degradation before closing — adding `src/app/stock-entry/loading.tsx` turns AC-1's unauthenticated `GET` of `/stock-entry/new` from a `307` with a `Location` header into a `200` with none — and records both status codes in `progress/impl_entry_start.md`.
4. **AC-4** — The actor is never taken from the request. `startCountAction` obtains its actor by calling `requireUser()`, asserted by a source scan of `src/app/stock-entry/actions.ts` that finds one such call and finds no read of `role`, `actor`, `actorId`, `userId`, `createdBy` or `createdById` from a `FormData`. Signed in as `YARD_STAFF`, submitting the start form with the extra fields `createdById=<an ADMIN user id>` and `role=ADMIN` creates a count whose `createdById` is the signed-in staff user's id, and the page renders that user's name. Every exported function of `count-service.ts` called with a `null` actor raises `UnauthorizedError` and writes nothing.
5. **AC-5** — Who is counting is confirmed, not typed. `/stock-entry/new` renders the signed-in user's `name` as text inside `data-testid="counting-as"` (the email beside it went with 021 AC-37), reading `Counting as Jo Byrne`, and the page contains **no** input, select or textarea whose name matches `/count(ed)?By|createdBy|name|user/i`. The created `StockCount.createdById` equals the session user's id, and `/stock-entry/counts/<id>` renders that user's name. There is no second identity mechanism anywhere in the feature: a source scan of `src/app/stock-entry/**` and `src/server/counts/**` finds no reference to a signature field, which is #9's.
6. **AC-6** — **The period is derived by one pure function, and Part 4's table is the test.** `periodForCountDate` is unit-tested with no database and returns, for `2026-09-30` → `{2026, 9}`, for `2026-10-01` → `{2026, 9}`, for `2026-10-05` → `{2026, 9}`, for `2026-10-06` → `{2026, 10}` — Part 4's four worked examples, in order — and additionally `2026-01-03` → `{2025, 12}` (January rolls back a year), `2026-01-06` → `{2026, 1}`, `2026-03-01` → `{2026, 2}` and `2024-03-05` → `{2024, 2}` (a leap February is still February). `formatPeriodKey({2026, 9})` is `"2026-09"` and `formatPeriodLabel({2026, 9})` is `"September 2026"`. A `countDate` that is not `YYYY-MM-DD`, or not a real calendar day (`2026-02-30`), raises `ValidationError` whose `field` is `countDate` and whose message is `Count date must be a real date, as YYYY-MM-DD.`
7. **AC-7** — **The period is shown to the user before anything is written, and is overridable.** `GET /stock-entry/new/confirm?locationCode=DUBLIN&countDate=2026-10-01` returns `200`, renders `This count closes September 2026.`, renders the count date as `1 October 2026` inside a `<time dateTime="2026-10-01">`, and creates **no** row — `StockCount` and `StockCountLine` counts are identical before and after the `GET`. The override is a single control, `<input type="month" name="period">`, pre-filled `2026-09`, labelled `Period this count closes`, so a phone shows its native month picker. Submitting the form unchanged creates a count with `periodYear = 2026, periodMonth = 9`.
8. **AC-8** — **The override is honoured, and the date and the period stay two separate facts.** Submitting the same confirm form with `period=2026-10` creates one count with `periodYear = 2026`, `periodMonth = 10` and `countDate = 2026-10-01`, and the count page renders both — `October 2026` and `1 October 2026`. No warning, message or field error is rendered for a period that differs from the count date's own month, at any distance: `countDate = 2026-10-01` with `period = 2025-12` is created exactly as asked. A `period` that is not `YYYY-MM`, or whose year is outside 2000–2100, raises `ValidationError` whose `field` is `period` and whose message is `Period must be a month between 2000 and 2100.`, and writes nothing; `periodMonth` therefore never reaches the `StockCount_periodMonth_range` CHECK, and the rendered page contains none of `StockCount_periodMonth_range`, `violates`, `check constraint` or `23514`.
9. **AC-9** — **There is no business-day rule, and no wording that implies one.** A count with `countDate = 2026-01-03` (a Saturday) and one with `2025-11-30` (a Sunday) are each created with no warning, no confirmation step and no field error, and the rendered confirm and count pages contain none of the strings `business day`, `business-day`, `weekend`, `holiday` or `working day`, and no weekday name attached to a date. A source scan of every file under `src/` finds none of `business day`, `businessDay`, `isWeekend`, `workingDay` or `holiday`. The only weekday names anywhere in the feature are the calendar's seven column headers, `Mon Tue Wed Thu Fri Sat Sun`, asserted present in that order (AC-19).
10. **AC-10** — **One count per yard per month, and the refusal is the domain's words, not Postgres's.** Given a `DUBLIN` count for `2026-09`, `startCount` for `DUBLIN` at `2026-09` with a *different* `countDate` raises `ConflictError` whose message is exactly `Count for DUBLIN in 2026-09 already exists`, writes no `StockCount` and no `StockCountLine`, and leaves the existing count byte-identical in `id`, `countDate`, `status` and line count. The same yard at `2026-10`, and `CLONMEL` at `2026-09`, both succeed. On the screen that message renders above the form together with a link reading `Open the existing count` that resolves to `/stock-entry/counts/<the existing id>`, and the rendered HTML contains none of `Unique constraint`, `P2002`, `StockCount_locationId_periodYear_periodMonth_key`, `prisma` or `constraint`. The service checks for the existing row first **and** maps a racing `P2002` to the same `ConflictError`, proved by a test that calls `startCount` twice concurrently and asserts exactly one count exists and the loser threw that message.
11. **AC-11** — **Coming back never starts a second count.** `findCountForPeriod(actor, "DUBLIN", {2026, 9})` returns the existing count's id, status, `countDate` and creator name, or `null`. When it is non-null and `DRAFT`, `/stock-entry/new/confirm` for that yard and period renders `Dublin already has a draft count for September 2026, started by Jo Byrne on 1 September 2026.`, replaces the *Start count* control with a link reading `Continue this count` to `/stock-entry/counts/<id>`, and renders **no** submit control at all — so the second count cannot be attempted from the screen, and AC-10 is the backstop for a direct POST. When it is `SUBMITTED` or `APPROVED` the link instead reads `Open the existing count`. End to end: a staff user starts a Dublin count, navigates away to `/stock-entry`, returns through the same flow with the same date, and arrives at the **same** `countId`, with `StockCount` holding one row for that yard and period.
12. **AC-12** — **Pre-population comes from `listSheet`, in its order, with every quantity null.** `startCount` creates one `StockCountLine` per entry returned by `listSheet(actor, locationCode)` and no others: on a fixture reproducing today's master — 82 active Dublin links, 70 active Clonmel links — a Dublin count has exactly **82** lines and a Clonmel count exactly **70**, and the set of `itemId`s equals the set `listSheet` returns for that yard. Every created line has `quantity === null`, `unitPriceSnapshot === null` and `note === null`. Sheet order is **not** copied onto the line — it is `ItemLocation.sortOrder`, read at display time — and reading the count's lines ordered by that `sortOrder` ascending then `description` ascending reproduces `listSheet`'s order element for element. An archived item and an unassigned link are absent from the new count even though `StockCountLine` rows naming them may exist on older counts.
13. **AC-13** — **Creation is all or nothing, and an empty sheet is refused before anything is written.** `startCount` creates the count and its lines in **one** `db.$transaction`: a test that makes the line write fail — an item deleted between the sheet read and the write — leaves **zero** `StockCount` rows for that yard and period. A yard whose sheet is empty, every link inactive or every item archived, raises `ValidationError` whose `field` is `locationCode` and whose message is `Dublin has no items on its sheet. An administrator must assign items before this yard can be counted.`, and writes no `StockCount`. An unknown `locationCode` raises `NotFoundError` naming the code and writes nothing.
14. **AC-14** — **`listSheet` becomes role-shaped: a staff reader never has a price built for them, and nothing else about the item master moves.** `listSheet` and `locationName` accept any signed-in actor — called with a `null` actor both raise `UnauthorizedError` — and `listSheet` selects its result shape through `shapeForRole` (`src/server/auth/role-shape.ts`, shipped by #3 and until now unused) from `actor.role` alone. For an `ADMIN` each entry carries `currentPrice`; for a `YARD_STAFF` actor the entry has **no `currentPrice` key at all** — `Object.hasOwn(entry, "currentPrice")` is `false`, so the value is never constructed rather than constructed and discarded. A unit test with spy thunks asserts the unselected builder is called **zero** times, as 003 AC-17 does. The shape is chosen from the session role and from nothing a client can set: the same call carrying `?role=ADMIN`, an `x-user-role` header and a `role=ADMIN` cookie still returns the staff shape. `/item-master/yards/<code>` renders prices unchanged for an `ADMIN` (006 AC-24). Every other exported function of `item-assignment-service.ts` — `assignItemToLocation`, `unassignItemFromLocation`, `moveItemInSheet` — still raises `ForbiddenError` with the message `ADMIN is required for this action` for a staff actor, as do the other fourteen mutations 006 AC-4 names, and every row count in `Item`, `ItemPrice`, `ItemLocation`, `Supplier` and `ItemType` is unchanged after all seventeen refusals. All seven `/item-master` routes still respond `307` to `/stock-entry?denied=item-master` for a staff session (006 AC-2, unmodified spec). The only shipped assertion this feature edits is the `listSheet(staff, "DUBLIN")` rejection in `src/server/items/item-assignment-service.db.test.ts`, replaced by the two assertions above; `git diff` on that file shows no other change.
15. **AC-15** — **Nothing in this feature reads or writes a price.** The nine-file permitted list of 006 AC-31 is unchanged: no file under `src/server/counts/`, `src/app/stock-entry/`, `src/components/stock-entry/`, `src/lib/count-messages.ts`, `src/lib/calendar-month.ts` or `src/lib/yard-time.ts` contains the string `unitPrice`, and `unitPriceSnapshot` is still named by **no** shipping module anywhere — `tests/unit/project-contract.test.ts` passes unchanged. Every `StockCountLine` this feature creates has `unitPriceSnapshot === null` after a fresh read, satisfying Invariant 2, and nothing in the feature multiplies a quantity by anything.
16. **AC-16** — **`shapeForRole`'s first real caller, and the shape is chosen from the session role alone.** `getCount(actor, id)` returns through `shapeForRole(actor, { forStaff, forAdmin })`: for a `YARD_STAFF` actor the result has no `itemsWithoutPrice` key and the `forAdmin` thunk is called **zero** times; for an `ADMIN` actor the result carries `itemsWithoutPrice` as a non-negative integer and `forStaff` is called zero times — asserted with spy thunks, and again against the database on a fixture where 11 of the 82 Dublin items have no `ItemPrice`, giving `itemsWithoutPrice === 11`. The `ADMIN` page renders `11 items on this sheet have no price recorded. Their lines will count as 0 when this count is submitted.`; the `YARD_STAFF` page renders that sentence nowhere, carries no per-row `No price` tag, and is otherwise identical markup. `getCount` takes no argument derived from a request other than `countId`, asserted by its signature and by AC-18.
17. **AC-17** — **The money-key walk, in the shape of 003 AC-19, on everything a `YARD_STAFF` session can obtain here.** `assertNoMoneyKeys` from `src/lib/money-boundary.ts` is applied to the value returned by `getCount`, `listCalendarMonth`, `listCountableYards` and `findCountForPeriod` for a staff actor, and `deepKeys` of each contains **no** key matching `/price|value|total|amount/i` at any depth — including inside `lines[]`. For an `ADMIN` actor the same walk over `getCount` reports exactly one offender, `itemsWithoutPrice`, and no other; the three other functions return the same money-free shape for both roles, because Part 6 makes the calendar one screen and not two. At the browser level, the rendered HTML of all four routes for a staff session contains no `€` character, no `unitPrice` string, and no `unitPrice` value of any item in the database — the same assertion 006 AC-2 makes about a refused page, made here about a page that is actually served.
18. **AC-18** — **Role cannot be influenced by anything the client sets.** Signed in as `YARD_STAFF`, a `GET` of `/stock-entry/counts/<id>` carrying the query string `?role=ADMIN`, the header `x-user-role: ADMIN` and the cookie `role=ADMIN` simultaneously renders the staff page — no `itemsWithoutPrice` sentence, no `€` — and the same three vectors on the `POST` that starts a count, plus the form field `role=ADMIN`, change neither the shape nor the created row's `createdById`. The test asserts the response, not the source code.
19. **AC-19** — **The calendar is one month of days, Monday first.** `buildMonthGrid("2026-09")` is pure and unit-tested with no database: September 2026 begins on a Tuesday, so the grid is **5 rows of 7**, the first row has **1** leading padding cell and then the 1st, the month contributes **30** day cells, and the last row has **4** trailing padding cells — 35 cells in all, of which 30 carry a date. Padding cells carry no date, no link and no count. `buildMonthGrid("2026-02")` — February 2026 begins on a Sunday, so **6** leading pads, **28** day cells, **1** trailing pad, **35** cells, **5** rows: the largest leading pad that still fits in five, and the case that catches an off-by-one in the pad arithmetic. `buildMonthGrid("2026-03")` — March 2026 also begins on a Sunday but has 31 days, so **6** leading, **31** days, **5** trailing, **42** cells, **6** rows, which is what stops the grid being assumed to be five. Rows are always `ceil((leading + days) / 7)` complete Monday-first weeks. The rendered page has the column headers `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`, `Sun` in that order, and its `<h1>` reads `September 2026`.
20. **AC-20** — **A day cell says which yard and what status.** A day with a count renders, inside `data-testid="day-2026-09-01"`, one badge per count carrying the yard's `name` and its status as `Draft`, `Submitted` or `Approved`, each linking to `/stock-entry/counts/<id>`; today's cell carries `data-today="true"` and no other cell does. A day with counts at both yards renders **two** badges, Dublin before Clonmel, in `Location.sortOrder`. A day with none renders no badge and carries a *Start a count* link to `/stock-entry/new?countDate=<that day>`, and following it pre-fills the date field with that day (AC-23). Counts are placed by `countDate`, not by period: a count with `countDate = 2026-10-01` and period `2026-09` appears in **October's** grid and not in September's, and its badge carries the period `2026-09` in its `title`.
21. **AC-21** — **Moving between months.** `/stock-entry?month=2026-08` renders `August 2026`; the *Previous month* and *Next month* controls are plain links to `?month=2026-07` and `?month=2026-09`, and `previousMonthKey("2026-01")` is `"2025-12"` while `nextMonthKey("2026-12")` is `"2027-01"` — unit-tested with no database. A *Today* link resolves to the month containing `todayInYard()`. A `?month` value that is not `YYYY-MM` with a month in `01`–`12` — `banana`, `2026-13`, `2026-1`, an empty string, or the parameter repeated twice — responds `307` to `/stock-entry` and renders no error; no query parameter can make this page throw.
22. **AC-22** — **The calendar opens on the last stock take, and says so when there is none.** `defaultMonthKey` returns the month of the greatest `countDate` in `StockCount`, and when the table is empty returns the month containing `todayInYard()`. Against a database with counts dated `2026-07-31` and `2026-08-31`, `GET /stock-entry` with no `?month` renders `August 2026`. Against an empty one it renders the current month and the message `No stock counts recorded yet.` together with the *Start a count* control — which is the state of the development database today, where `StockCount` holds **0** rows. A month with no counts, in a database that has some, renders `No counts in this month.` and no empty-state instruction. The first three are `*.db.test.ts` assertions on `listCalendarMonth` and `defaultMonthKey`; the browser half asserts only the last, because the e2e suite shares a live database with other specs.
23. **AC-23** — **Choosing a yard is deliberate.** `/stock-entry/new` renders one control per **active** `Location`, in `Location.sortOrder` — `Dublin` then `Clonmel` — as two tap targets, with **none** preselected; `listCountableYards` excludes an inactive location. Submitting with no yard chosen raises `ValidationError` whose `field` is `locationCode` and whose message is `Choose a yard.`, keeps the typed date, and writes nothing. The date field is `<input type="date" name="countDate">` defaulted to `todayInYard()`, and `?countDate=2026-09-01` pre-fills it with that day; a `?countDate` that is not a real date is ignored and the default is used, rather than throwing. Choosing a yard and a date leads to `/stock-entry/new/confirm` carrying both as query parameters, and that `GET` writes nothing (AC-7).
24. **AC-24** — **The count page shows what was created.** After *Start count*, `/stock-entry/counts/<id>` returns `200` and renders the yard name, the period, the count date in a `<time>`, `Counting as <the signed-in name>`, the status `Draft`, and `0 of 82 counted`, and lists **82** rows in sheet order, each with the item description, its unit label (or `No unit`) and a quantity cell reading `Not counted`. There is no quantity input, no submit control and no signature control on this page — those are #8's and #9's — asserted by the absence of any `input`, `select` or `textarea` within the line list. A `countId` that does not exist renders `That count no longer exists.` with a link back to `/stock-entry`, and does not throw. **Where the exact 2026 literals are asserted:** `September 2026`, `1 September 2026` and the full sentence set are pinned in `*.db.test.ts` against the test branch and in `count-messages.test.ts`, both of which may write any year; the **browser** half runs the same flow inside the spec file's reserved year and asserts the same sentences for that year — `September 2090`, `1 September 2090` — built from the same `src/lib/count-messages.ts` helpers, so AC-26's "the screen and the test cannot drift apart" still holds. This is required because AC-30 forbids an e2e spec writing a `StockCount` below `periodYear` 2090, and `/stock-entry/counts/<id>` is reachable only by creating one. AC-7's `GET /stock-entry/new/confirm` keeps its 2026 literals in e2e exactly as written, because that `GET` writes nothing.
25. **AC-25** — **This feature only ever creates a `DRAFT`.** Every `StockCount` it writes has `status === "DRAFT"`, `submittedAt === null`, `approvedById === null`, `approvedAt === null`, `signedById === null`, `signedAt === null`, `signatureSvg === null` and `notes === null` on a fresh read. A source scan of `src/server/counts/**` and `src/app/stock-entry/**` finds no `SUBMITTED`, no `APPROVED`, no `submittedAt`, no `approvedAt`, no `signatureSvg`, which requires and fixes one layout: the `CountStatus` union is declared **outside both scanned trees**, at `src/types/stock-count.ts`, following the precedent `src/types/item-master.ts` set in #6; the three status labels live in `src/lib/count-messages.ts` as a `Record<CountStatus, string>`; and any branch on status is written `status !== "DRAFT"` rather than naming the other two members. AC-11's confirm-page branch and AC-20's `Draft` / `Submitted` / `Approved` badges are satisfied by that layout, not in spite of it. The scan also finds and no `.update`, `.updateMany`, `.upsert`, `.delete` or `.deleteMany` applied to `stockCount` or `stockCountLine` — this feature inserts and reads, and does nothing else.
26. **AC-26** — **Every screen handles empty, loading, error and success, and the strings are single-sourced.** Each literal quoted by any criterion above is exported from `src/lib/count-messages.ts` and asserted from that module, so the screen and the test cannot drift apart. The *Start count* control is disabled while pending, so a double tap writes one count: a test that fires the submit twice within one render leaves exactly one `StockCount` row. After a successful start the action **redirects** and the new values are read from the freshly rendered page rather than from client state. `src/lib/count-messages.ts` and `src/lib/calendar-month.ts` import nothing from `src/server/` except `@/server/errors`, keeping `npm run lint`'s dependency fence green (006 AC-33).
27. **AC-27** — **No database error text ever reaches a screen.** For each of four provoked failures — a second count for the same yard and period, a `period` of `2026-13`, a yard with an empty sheet, and a `countId` that does not exist — the rendered HTML contains the feature's own message and none of `prisma`, `Prisma`, `violates`, `constraint`, `SQLSTATE`, `23514`, `23505`, `P2002`, `P2003`, `P2025` or `StockCount_locationId_periodYear_periodMonth_key`. Every function in `src/server/counts/` throws only `ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError` or `UnauthorizedError` from `src/server/errors.ts`, never a bare `Error`, and `src/app/api/error-response.ts` — unchanged — maps those five to 400, 404, 409, 403 and 401.
28. **AC-28** — **Phone-first, and this is the screen the requirement was written for.** At a 390 × 844 viewport, signed in as `YARD_STAFF`, the whole flow completes in a browser — `/stock-entry` → a day cell's *Start a count* → choose `Dublin` → confirm → *Start count* → the count page — and at **every** step `document.documentElement.scrollWidth` does not exceed its `clientWidth`, so the document never scrolls sideways. Every control the flow touches has a bounding box at least **44 × 44** CSS px, except links inside a sentence; the calendar's seven columns all fit, each day cell at least 40 px wide; the date field is `type="date"` and the period field `type="month"`, so the phone offers its native pickers rather than a bespoke one; and on each step the primary action is visible without horizontal scrolling. At a 320 px viewport the document still does not scroll sideways on any of the four routes. This is the primary case, not a "not broken" case: no criterion above requires a control that exists only at desktop width.
29. **AC-29** — **Which checks survive with no database,** mirroring 003 AC-23, 004 AC-26, 005 AC-27 and 006 AC-32. With `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointing at a hostname that does not resolve: `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` each exit `0`, and both `init` scripts exit `0` ending with `[OK] Environment ready (database checks skipped)`. No module this feature adds opens a connection at import time, and no page under `/stock-entry` is statically prerendered against a database during `build` — each declares `export const dynamic = "force-dynamic"`. The criteria provable without Postgres are AC-6, AC-9's source-scan half, AC-15, AC-16's spy-thunk half, AC-19's grid half, AC-21's arithmetic half, AC-25's scan half, AC-26's message-module half and AC-31's clock half; every other criterion needs a database or a browser and lives in `*.db.test.ts` or `tests/e2e/`.
30. **AC-30** — **The gate is green in full, and the e2e suite stays self-cleaning at `retries: 0`.** `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, `npx prisma migrate status` and `npm run test:db` all pass, and `./init.ps1` ends with `[OK] Environment ready` having **executed** the database checks. `playwright.config.ts` keeps `retries: 0` and the served build of 006 AC-35 — no `next dev`, no retry, no raised timeout. Because a count is keyed by `(locationId, periodYear, periodMonth)` and cannot carry a per-run suffix in a name, the e2e specs reserve `periodYear >= 2090`: each spec file owns one reserved year, sets its counts' `countDate` inside that year too so the real calendar default is untouched, and deletes every `StockCount` **carrying its own reserved `periodYear`** in `beforeAll` **and** `afterAll` — **never the whole `>= 2090` range**, because `playwright.config.ts` runs three files at once, so a range delete would remove a sibling file's rows mid-run and fail intermittently at `retries: 0`, which is the flakiness this criterion exists to forbid. It would also destroy the `periodYear: 2999` fixture `tests/e2e/support/item-master.ts` has seeded since #6 and on which `tests/e2e/item-master-items.spec.ts` depends for its whole file. No spec writes or deletes a row outside `periodYear >= 2090`, and none touches a reserved year that is not its own. Each spec asserts that the set of `StockCount` ids with `periodYear < 2090` is identical before and after the run — today, empty — and that `Item`, `ItemPrice` and `ItemLocation` row counts are unchanged. Two consecutive full `npm run test:e2e` runs report `0 flaky` and `0 failed`.
31. **AC-31** — **Today is today in the yard, and a date never shifts.** `todayInYard(now)` is pure, unit-tested with no database, and returns the `YYYY-MM-DD` of `now` in `Europe/Dublin`: `2026-07-01T23:30:00Z` gives `2026-07-02` (IST, UTC+1) and `2026-01-01T23:30:00Z` gives `2026-01-01` (GMT). It is the default for the count date field, for the *Today* link and for the empty calendar's month. Against the database, a count started with `countDate = 2026-09-01` reads back with `countDate.toISOString().slice(0, 10) === "2026-09-01"` (004 AC-22) and renders `1 September 2026`, on a machine whose `TZ` is `America/New_York` for the duration of the test. `src/server/items/price-selection.ts`'s `todayIso` is **not** changed by this feature; see *Open questions* 5.
32. **AC-32** — **Nothing here touches the master data, the schema or the workbook.** Across every test in this feature the row counts of `Item`, `ItemPrice`, `ItemLocation`, `Supplier`, `ItemType` and `Location` are identical before and after. `prisma/schema.prisma`, every directory under `prisma/migrations/` and `prisma/migrations/migration_lock.toml` are byte-identical to their state before this feature — it adds no migration — and `git status --porcelain -- Samples` is empty.

33. **AC-33** — **The unsound polled row-count cross-checks in #6's `item-master-items.spec.ts` are removed, because polling cannot converge on a moving population.** `tests/e2e/item-master-items.spec.ts:176` (and the sibling poll for the four badges) reloads `/item-master` and compares the rendered row count to a fresh `db.item.count({ where: { active: true } })`. Its own comment argues "a concurrent insert agrees on the next pass" — true of a *transient* disagreement, false while `item-master-yards.spec.ts` and `item-master-access.spec.ts` create and archive items throughout the window, because the render and the count are taken at different instants and there is no moment at which the predicate holds. Observed on the coordinator's gate run for this feature: `Timeout 10000ms exceeded while waiting on the predicate`, `1 failed`, `33 did not run`; the same file alone on one worker is `17 passed`. Each polled global comparison is replaced by an assertion that does not depend on a population other specs are moving: the `toBeGreaterThan(100)` floor stays (the #6 reviewer's `take: 50` mutation fails **there**, which is what makes the criterion non-tautological), the within-one-page-load equality between rendered rows and the `Active` badge stays, and the spec's own created items are asserted present by description. 006 AC-6 and AC-17 keep their substance — "one row per active item, all of them" is still measured, by the floor and the within-load equality together — and the `take: 50` mutation must still fail. Proved by mutation both ways: with `take: 50` the suite goes red at the floor, and the full `npm run test:e2e` runs clean twice in a row at `retries: 0` with **no** `did not run`.

## Out of scope

- **Typing a quantity.** #8 `stock_entry_ui` owns the inputs, the autosave that survives a
  dropped signal, the not-counted / counted-as-zero distinction at the keyboard, and the
  three filter categories. #7 creates the lines and renders them read-only as
  `Not counted`; it ships no input, no autosave and no filter.
- **Adding a one-off item during a count.** Part 5's two paths — search the master, or
  create inline — are #8's, and they call `createItem` and `assignItemToLocation` from #6.
- **Submitting, signing and approving.** The drawn signature, the `unitPriceSnapshot`
  write, the block on a null quantity (Invariant 5), the `SUBMITTED → APPROVED` transition,
  immutability and the audited reopen are all #9 `entry_submit`. This feature writes
  `status = DRAFT` and never reads or writes any other value of it (AC-25).
- **Deleting or abandoning a count.** A started count cannot be deleted from any screen.
  Nothing in this feature deletes a `StockCount`. A count started at the wrong yard is a
  real problem and it is **not solved here** — see *Open questions* 2.
- **Editing `countDate` or the period after creation.** Both are chosen once, before the
  write. Changing them later moves a count between months, which is a history edit and
  needs the audit trail #9 owns.
- **The Stock Takes history screen.** The Dublin / Clonmel / Both selector, the
  previous/next-count jumps and the read-only view of an approved count are #10
  `stock_takes_history`. `/stock-takes` is untouched by this feature.
- **Any monetary figure.** No price, no line value, no yard total, no MoM, no YoY. The only
  money-adjacent fact on this surface is the `ADMIN`-only count of items with no price
  (AC-16), and it is a count of items, not a euro. Totals live in #11 `analysis`.
- **A count of anything other than yard stock.** Boilers, bags and yard bulk are M7.
- **Per-yard permissions.** Any signed-in user may start a count at any yard; there is no
  yard-scoped user and no third role (003, Part 6).
- **Notifications, reminders or a "count is due" prompt.** Nothing tells a yard when to
  count — the same rule as "no business-day rule", seen from the other side.
- **Bulk or scheduled creation.** No "start counts for both yards", no cron, no template.
  One count, one yard, one deliberate confirmation.
- **A migration, an index or a performance change.** 82 rows render in one page, and the
  `@@index([periodYear, periodMonth])` #4 shipped is what the calendar reads through.
- **CI.** `init` remains the gate.

## Post-approval amendments

Four, all on 2026-09-11, all found by the implementer **before it wrote a single source
file**. It verified the spec's own arithmetic first and stopped rather than implement around
two criteria that do not hold. Eleven other claims it checked — the eight period examples,
two weekday assertions, `82 + 70 = 152`, the month arithmetic, both `Europe/Dublin`
conversions, the middleware claim, the error mapping and the `shapeForRole` design — were
all sound, so these are corrections, not a general doubt about the spec.

### 1. AC-19's February figure was arithmetically impossible

AC-19 pinned September 2026 to **5 rows / 35 cells** with 1 leading and 4 trailing pads,
which fixes the rule as `rows = ceil((leading + days) / 7)` — complete Monday-first weeks.
Under that same rule February 2026, which AC-19 itself correctly says begins on a **Sunday**,
is `ceil((6 + 28) / 7)` = **5** rows, not the **6** it asserted. Verified independently by
the coordinator:

| Month | First day | Days | Leading | Rows | Cells | Trailing |
|---|---|---|---|---|---|---|
| 2026-09 | Tue | 30 | 1 | 5 | 35 | 4 |
| 2026-02 | Sun | 28 | 6 | **5** | 35 | 1 |
| 2026-03 | Sun | 31 | 6 | 6 | 42 | 5 |

No rule gives 5 for September and 6 for February, and "always 6 rows" would break
September's own 35-cell count. February is now stated as 5 rows — which makes it a *third*
case rather than a duplicate of March: the largest leading pad that still fits in five rows,
and the case that catches an off-by-one in the pad arithmetic. March still carries the
criterion's stated purpose, that the grid is not assumed to be five.

### 2. AC-30's cleanup predicate deleted a fixture #6 shipped, and raced its own siblings

AC-30 required every spec file to delete every `StockCount` with `periodYear >= 2090` in
both `beforeAll` and `afterAll`. But `tests/e2e/support/item-master.ts` has seeded a fixture
count at `periodYear: 2999` since #6, and `tests/e2e/item-master-items.spec.ts` depends on it
for its whole file — it is what makes `deleteItem` refuse. Obeyed literally, #7's specs would
delete a shipped spec's fixture mid-run. And because `playwright.config.ts` runs three files
at once, sibling #7 files would delete each other's rows — an intermittent failure at
`retries: 0`, which is the exact flakiness AC-30 exists to forbid.

Both deletes are now scoped to the file's **own** reserved year. The reservation rule
(`periodYear >= 2090`, nothing written or deleted outside it) is unchanged. Per-file scoping
is needed for the sibling race regardless of the 2999 fixture, so raising the floor alone
would not have fixed it.

### 3. AC-24's 2026 literals versus AC-30's reservation

`/stock-entry/counts/<id>` is reachable only by creating a count, and AC-30 forbids an e2e
spec writing one below `periodYear` 2090 — so the exact literals `September 2026` and
`1 September 2026` could not be asserted in a browser. They are now pinned where a write is
free (`*.db.test.ts` and `count-messages.test.ts`), while the browser half runs the same
flow in the file's reserved year and asserts the same sentences built from the same
`count-messages.ts` helpers, so AC-26's "the screen and the test cannot drift apart" still
holds. AC-7's `GET /stock-entry/new/confirm` keeps its 2026 literals in e2e unchanged,
because that request writes nothing.

The rejected alternative was carving one 2026 period per yard out of the reservation. It was
refused because `defaultMonthKey` reads the greatest `countDate` in the table, so a 2026 e2e
count left behind by a crashed run would change what a real user sees on `/stock-entry`.

### 4. AC-25's source scan fixes where `CountStatus` may live

AC-25 forbids the strings `SUBMITTED` and `APPROVED` anywhere under `src/server/counts/**`
or `src/app/stock-entry/**`, while AC-11 branches on those statuses, AC-20 renders them as
badges, and the Contract block declared the union under *Services — `src/server/counts/`* —
the one directory the scan forbids it in. The criterion is satisfiable under exactly one
layout, which it now states rather than leaving to be discovered at review: the union lives
at `src/types/stock-count.ts` (the precedent `src/types/item-master.ts` set in #6), the
labels are a `Record<CountStatus, string>` in `src/lib/count-messages.ts`, and a status
branch is written `status !== "DRAFT"`.

### 5. AC-33 added 2026-09-11 — a latent race in #6, surfaced by this feature's gate

Not a defect in #7. The coordinator's independent gate run for #7 went **red** on
`tests/e2e/item-master-items.spec.ts:176`, a #6 test, while the implementer's own two full
runs had been clean. Running that file alone on one worker: `17 passed`. It is a
concurrency race that had never happened to fire.

The history is worth recording, because three careful passes missed it. #6's reviewer first
proposed comparing rendered rows to a fresh `db.item.count()`. The implementer **rejected
that as a race** and substituted a within-one-page-load comparison — and was upheld, the
reviewer writing "the implementer is right, and my suggestion was the wrong fix". But the
implementation also *kept* polled cross-checks against that same global count, and the
reviewer — having found the within-load comparison weaker than its comment claimed —
credited those polls as "two further, independent measurements". **The synthesis contained
the flaw of the option both had already rejected.**

The error in reasoning is precise: polling fixes a *transient* disagreement, not a
*continuous* one. While sibling spec files write throughout the window, there is no instant
at which render and count agree.

What actually measures 006 AC-6 is the `toBeGreaterThan(100)` floor — the #6 reviewer's own
`take: 50` mutation failed **there**, one line above the poll. That, with the within-load
equality, survives; the polls go.

Surfaced only because 006 AC-35 set `retries: 0`. Under the `retries: 1` that preceded it,
this would have been a silent retry and a green gate.

## Open questions

None blocking. Six decisions this spec settles with a stated answer rather than leaving
undefined, each flagged so the user can strike it at approval:

1. **Who is counting is the signed-in user, displayed and not typed** (AC-5). Striking this
   means a free-text "counted by" field, which is a second, unverifiable identity next to
   the session and next to #9's signature — and `createdById` would then disagree with the
   name on the page. If the phone is shared, the answer is to sign out and sign in.
2. **A count cannot be deleted, and a count started at the wrong yard stays.** Nothing in
   this feature or #8 removes a `StockCount`; a wrong-yard count is left as an empty
   `DRAFT`. The alternative is an `ADMIN`-only *discard an empty draft* action — safe only
   while every quantity is null, and worth adding the moment someone hits it. It is not
   invented here because nobody has hit it yet.
3. **The override is an `<input type="month">`, not a list of nearby months.** It accepts
   any month from 2000 to 2100 with no proximity check, because Part 4's whole argument is
   that the date and the period are independent facts — the workbook has a count dated
   `2026-12-31` that belongs to `2025-12`. Striking this means a select of, say, three
   months either side, which would refuse the correction of exactly that kind of typo.
4. **The calendar places a count by `countDate`, not by period** (AC-20). It is a calendar
   of days, so it shows the day the yard was walked; the period rides along in the badge.
   The alternative — placing a count in the month it closes — makes a count dated the 1st
   vanish from the day it happened.
5. **Two definitions of "today" now exist, deliberately.** `todayInYard` (`Europe/Dublin`)
   is used for every user-visible date here; `todayIso` (the server's local zone) stays as
   #6 shipped it, because it is only a default `asOf` for a price lookup and changing it
   would edit a closed feature's behaviour and its tests. Converging them is a one-line
   change #8 or #9 may make. Striking this means making that change now.
6. **The calendar shows both yards, always.** Part 6 makes Stock Takes money-free and
   common to both roles, and "one version of the screen, not two". A per-yard selector
   arrives with #10, which owns the history screen.

One carried-forward item, closed here rather than left open: **`listSheet`'s guard**, which
006 wrote as `ADMIN` because no staff caller existed yet. AC-14 widens the two read
functions to any signed-in reader and makes the return value role-shaped, so a staff reader
never has a price built for them — the user's decision at approval, argued above under
*The one guard that moves*.

`Q7` and `Q8` in `specs/domain-model.md § Still open` block only M7 and are unrelated to
this feature.
