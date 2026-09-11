# 008 — The counting screen

**Feature id:** 8   **Status:** approved   **Approved:** 2026-09-11
**Depends on:** #7 `entry_start` (the `DRAFT` count and its one-line-per-item pre-population,
`getCount`, `count-messages.ts`, `src/types/stock-count.ts`, the reserved-year e2e rule and
the `chromium-stock-entry` Playwright project), #6 `item_master_ui` (**`listSheet` — the one
definition of a yard sheet**, the single-sourced messages module, the exact nine-file
`unitPrice` list of AC-31, the served build at `retries: 0`), #4 `domain_schema`
(`StockCountLine.quantity Decimal(12,4)?` and `@@unique([stockCountId, itemId])`),
#3 `auth_and_roles` (`requireUser`, `assertUser`, `shapeForRole`, `deepKeys` /
`assertNoMoneyKeys`, the typed errors and `errorResponse`), #2 `app_scaffold` (Tailwind, the
shared error boundary, the two vitest configs), #20 `test_db_reset` (`TRUNCATED_TABLES`)

## Purpose

**This is the feature the product exists for.** Everything before it was preparation: #5 put
the workbook's items in the database, #6 made them editable, #7 created a count whose 82
lines all read `Not counted`. #8 is the moment a person standing in a yard, in the cold, on a
phone, one-handed, types the numbers in — and the moment the paper sheet stops being
necessary.

It is also where **`quantity = null` versus `quantity = 0` stops being a database subtlety
and becomes something a human sets deliberately.** The workbook's blank cell cannot tell
"nobody looked" from "looked, none held", which is why a third of its rows are ambiguous and
why Invariant 5 exists. On this screen the two are different to type, different to read, and
different in the row's markup — and `0` is one tap away, because 35 of Dublin's 82 rows were
zero or blank in the most recent count and a counter who has to type `0` thirty-five times
will go back to paper.

Two more things it settles, because a yard is where they actually bite:

1. **Signal drops, and nothing is lost.** Everything typed is held on the device until the
   server confirms it, survives a reload, and is re-sent when the connection returns.
   `docs/conventions.md`: *"The yard has bad signal — never lose a user's typed count."*
2. **The money boundary holds inside a screen a `YARD_STAFF` user uses for an hour at a
   time.** 007 AC-14 made `listSheet` role-shaped; this feature adds a JSON endpoint, and a
   JSON endpoint is exactly the thing Part 6 means by *"not hidden — not sent"*.

## Scope boundary with #7 and #9

**In:** the quantity inputs, the not-counted / counted-as-zero distinction, autosave with its
failure, offline and reload behaviour, the three filter categories, the progress line, and
the refusal to edit a count that is no longer a `DRAFT`.

**Out, and owned elsewhere:** the drawn signature, submission, the block on a null quantity
(Invariant 5), the `unitPriceSnapshot` write, the count summary with its per-line *no price*
warning, approval and the audited reopen are all #9 `entry_submit`. The yard selector, the
previous/next-count jumps and the read-only view of an approved count are #10
`stock_takes_history`. Every euro figure is #11 `analysis`. Adding an item mid-count is
deferred, and argued in *Out of scope*.

**No migration.** `prisma/schema.prisma` and every directory under `prisma/migrations/` are
byte-identical after this feature: `StockCountLine.quantity` has existed since #4 and has
been written as `null` since #7. So `TRUNCATED_TABLES` gains no entry and **020 AC-4 stays
green** — it fires when a feature adds a table, and this one does not (AC-29).

**One new route handler, and it is the first write in this product that a client makes with
JavaScript.** #7 had none; autosave needs one. It is a JSON endpoint under `/api/`, which is
what makes `docs/verification.md` Level 3b's response-body walk literally a response body
here rather than an HTML scan.

**`listSheet` is not called by this feature at all.** The lines already exist — #7 created
one per sheet item — so #8 reads the count, never the sheet. 006 AC-24 keeps its one
definition, and this feature does not become a second reader of it (AC-3).

## The thing this feature is really about

| | `quantity IS NULL` | `quantity = 0` |
|---|---|---|
| Means | Nobody has looked at this row yet | Somebody looked; none is held |
| Input | Empty | Contains `0` |
| Row also renders | The words `Not counted` | Nothing extra — the `0` is the fact |
| Row attribute | `data-counted="false"` | `data-counted="true"` |
| Counts toward `n of 82 counted` | No | **Yes** |
| How a human sets it | Clearing the input | Typing `0`, or one tap on *None held* |
| Invariant 5 at #9 | **Blocks submission** | Submits |

An empty input is never saved as `0`, and a `0` is never rendered as an empty input. Those
two sentences are the feature (AC-4, AC-5).

## User stories

- As a **YARD_STAFF** user standing in a yard, I type a quantity and it is saved without me
  pressing anything, so counting is walking and typing rather than walking, typing and
  remembering to save.
- As a **YARD_STAFF** user, I can mark a row *none held* with one tap, because on the most
  recent Dublin count 35 of 82 rows were zero or blank and typing `0` thirty-five times is
  how a screen gets abandoned for paper.
- As a **YARD_STAFF** user, I can see at a glance which rows nobody has reached yet, so I
  know what is left rather than guessing.
- As a **YARD_STAFF** user whose phone loses signal behind the shed, I keep typing, I can see
  that my changes have not been sent, and they are sent when I walk back out — and if the
  browser reloads, my typing is still on the screen.
- As a **YARD_STAFF** user counting only the Kelly thermoplastic, I select two suppliers and
  one type and the list shrinks to the rows I am standing in front of.
- As a **YARD_STAFF** user who has filtered, I am told how many rows the filter is hiding and
  how many of those nobody has counted, so a filter never lets me believe I have finished.
- As a **YARD_STAFF** user, I see no price, no line value and no total — on the page, or in
  anything the page fetches.
- As an **ADMIN**, I can count too, on the same screen with the same markup, and I am still
  told, as #7 told me, how many items on this sheet have no price recorded.
- As the **owner**, I can be sure that an hour of counting on a phone with poor signal ends
  with every number either in the database or visibly marked as not yet sent, and never
  silently discarded.

## Data touched

| Model | Read | Written |
|---|---|---|
| `StockCountLine` | yes | **`quantity` only** — updated in place, one row per edit |
| `StockCount` | yes — status, period, location, creator | **never** |
| `Item`, `Supplier`, `ItemType`, `ItemLocation`, `ItemPrice`, `Location`, `User` | yes, through `getCount` | never |

`unitPriceSnapshot` and `note` are written by nothing in this feature; #9 is still the first
writer of the snapshot column (Invariant 2). No row is inserted and no row is deleted
anywhere: #7 created the lines and #8 fills them in.

**New fields on an existing type, not on a table.** `CountLineRow` in
`src/types/stock-count.ts` gains `supplierName: string | null` and `typeName: string`, which
is where the Supplier and Type filters get their values; `unitLabel` is already there.
Neither new field matches `/price|value|total|amount/i`, so 007 AC-17's staff walk is
unaffected (AC-17).

## Contract

### Routes

| Route | What changes |
|---|---|
| `/stock-entry/counts/[id]` | #7's read-only rows become inputs. Query: `?supplier=`, `?type=`, `?unit=`, each repeatable. `export const dynamic = "force-dynamic"` unchanged |

No new page route. The calendar, `/stock-entry/new` and `/stock-entry/new/confirm` are
untouched.

### The JSON endpoint — `src/app/api/counts/[id]/lines/route.ts`

`POST /api/counts/<countId>/lines`, `export const dynamic = "force-dynamic"`.

```ts
// request
type SaveQuantitiesBody = {
  edits: { itemId: string; quantity: string | null }[];   // 1..200, decimal STRING or null
};

// response, 200 — ONE shape, for both roles, because it carries no money at all
type SaveQuantitiesResult = {
  countId: string;
  saved: { itemId: string; quantity: string | null }[];   // as persisted, read back
  lineCount: number;
  countedLineCount: number;
  uncountedLineCount: number;
};
```

It obtains its actor with `await requireUser()`, calls exactly one service, and ends in
`errorResponse` — `401` signed out, `404` unknown count or unknown line, `400`
`ValidationError` with `{ error, field }`, `409` a count that is no longer a `DRAFT`. It is
**not** matched by `src/middleware.ts`, whose matcher covers `/stock-entry/:path*` and three
siblings but not `/api/`, so a signed-out `POST` gets JSON `401` rather than an HTML redirect
a `fetch` cannot use — and `src/lib/auth-config.ts` and `src/middleware.ts` stay
byte-identical (AC-1).

A quantity crosses this boundary as a **decimal string**, never a JavaScript `number`:
`docs/architecture.md` § Money and quantities, and `21.6128` tonnes is the reason.

### The server action — `src/app/stock-entry/actions.ts`

`saveQuantitiesAction(prevState, formData)` — the **no-JavaScript** path required by
`docs/conventions.md` ("Forms are progressive: they work with a server action, and are
enhanced with client state for autosave"). It reads one form field per rendered input, calls
the same service the endpoint calls, and re-renders the page. `startCountAction` is
unchanged.

### Services and pure modules

| Module | Exports | Touches Prisma |
|---|---|---|
| `src/server/counts/count-entry-service.ts` | `saveQuantities(actor, countId, edits)` | yes — **the only writer** |
| `src/server/counts/quantity-input.ts` | `parseQuantity(raw)`, `QUANTITY_PATTERN` | no — **pure** |
| `src/server/counts/entry-filters.ts` | `buildEntryFacets`, `parseFilterSelection`, `filterEntryRows`, `isEmptySelection` | no — **pure** |
| `src/server/counts/count-input.ts` | *(extended)* `parseSaveQuantitiesBody` | no — **pure** |
| `src/lib/entry-queue.ts` | `readQueue`, `writeQueue`, `mergeEdit`, `dropConfirmed`, `QUEUE_KEY`, `QUEUE_MAX_AGE_MS` | no — **pure**, over a `Storage`-shaped interface |
| `src/lib/count-messages.ts` | *(extended)* every literal a criterion quotes | no — **pure** |
| `src/server/counts/count-service.ts` | *(extended)* `getCount` also selects supplier and type per line | yes |

Five pure modules are why a third of these criteria run in `npm run test:unit` with no
database (AC-32).

### Components

`src/components/stock-entry/CountSheet.tsx` (`"use client"`) holds the rows, the inputs, the
autosave queue and the filter state; `src/components/stock-entry/EntryFilters.tsx` renders
the three categories. Both are server-rendered into the HTML first, so the page is complete
before it hydrates and works with JavaScript disabled entirely (AC-16).

### The rules this contract encodes

**Every line of the count appears.** Part 5's table gives count entry **all** items assigned
to the yard — *"you cannot record stock with no row to type in"* — not held-only. There is no
held-only toggle on this screen, no pagination and no virtual scroller: 82 rows is one page,
and any control that silently drops a row is a control that drops an uncounted row (AC-3).

**One service, two transports.** The endpoint and the no-JavaScript action both call
`saveQuantities`. The rule the workbook broke — one calculation, one place — is kept by
giving the two paths nothing of their own except how they were called (AC-16).

**A batch is one transaction.** Every edit in one request is written together or none is, as
#7's `startCount` writes its 82 lines (007 AC-13). The client only ever queues values that
have already passed the same `parseQuantity` the server runs, so a `400` means a forged
request or a bug, and refusing the whole batch is then the right answer (AC-8).

**Last write wins, and nothing is locked.** The server writes what it is sent and returns
what it stored; the client shows the returned value unless the user has typed something newer
for that row. No concurrency token and no lock: a lost edit on one line is recoverable by
typing it again, and a lock held by a phone that walked out of signal is not (AC-34).

**Progress is about the whole count, never the filtered view.** `n of 82 counted` counts
lines whose quantity is not null — `0` included — over every line on the count. A filter
changes what you can see, never what you have done (AC-24).

**A filter must not be able to hide the fact that you have not finished.** Whenever any
filter is active the page says how many rows are hidden and how many of those are uncounted,
with one control to clear them (AC-23).

## The money boundary, which is now load-bearing

007 AC-14 settled the mechanism: a staff reader never has a price **built** for them. This is
the first feature where a staff session spends an hour on the surface and makes repeated
`fetch` calls from it, so the boundary is restated here as three separate facts.

1. **The page.** `getCount` is role-shaped through `shapeForRole` from `actor.role` alone. A
   `YARD_STAFF` value has no `itemsWithoutPrice` key and no `currentPrice` key at any depth;
   an `ADMIN` value carries `itemsWithoutPrice` and renders #7's sentence. Nothing else
   differs between the two roles' markup (AC-17).
2. **The endpoint.** `SaveQuantitiesResult` has **one** shape for both roles, because there
   is no monetary fact it could carry: an id, a quantity per edited line and three counts. It
   therefore does not go through `shapeForRole`, and a criterion asserts the two roles'
   bodies are deeply equal for the same request (AC-17).
3. **No running total, for either role, anywhere on this screen.** Stated explicitly because
   it is the obvious thing to add for an `ADMIN` who is counting. Three reasons, in order of
   weight. Part 6 makes Stock Takes money-free for *both* roles and insists on *"one version
   of the screen, not two"*. **Invariant 2 makes a draft total a different number from the
   real one**: `unitPriceSnapshot` is null until `SUBMITTED`, so a running total could only
   be computed from *today's* `ItemPrice`, and a price edited between the count and the
   approval would make the two disagree — which is precisely the workbook defect this
   product exists to remove. And a second number for the same count is the second source of
   truth `docs/architecture.md` forbids. **Where the first total comes from:** #9 writes
   `unitPriceSnapshot` on every line at `SUBMITTED`, from the `ItemPrice` effective on
   `countDate`; `value = quantity × unitPriceSnapshot` is derived on read from there, in #9's
   submit summary and in #11 `analysis`, for an `ADMIN`, and nowhere else (AC-18).

**The per-row *No price* tag is not added here, for anyone.** Invariant 4's warning is a
submit-time fact — it says what *will* value at zero when the snapshot is written — so it
belongs on #9's summary, beside the code that writes the snapshot. Keeping it off this screen
has a second, checkable benefit: **#8 introduces no new key matching
`/price|value|total|amount/i` for either role**, so 007 AC-17's admin clause ("exactly one
offender, `itemsWithoutPrice`, and no other") passes unmodified (AC-17, AC-18).

## UI states

- **Empty.** A count with no lines cannot be created — 007 AC-13 refuses a yard with an empty
  sheet before anything is written — but the page renders `This count has no items.` rather
  than an empty table if one is ever reached. A filter matching nothing renders
  `No items match these filters.` with a *Clear filters* control.
- **Loading.** The page is a server component, and there is still deliberately **no
  `loading.tsx`** at or above `src/app/stock-entry/` (007 AC-3: a Suspense boundary turns a
  server-side `redirect()` into a `200`). Saving is the only asynchronous thing a user
  starts, and its state is text rather than a spinner that hides the row — `Saving…` on the
  row and in the header.
- **Error.** A save that fails leaves the typed value in the input, marks the row
  `Not saved`, and shows `3 changes not saved. They will be sent when the connection
  returns.` with a *Retry now* control. A rejected value renders the service's own sentence
  beside the row it names. No Prisma or Postgres string reaches the screen or the JSON body
  (AC-27).
- **Success.** `All changes saved` in the header, every row `data-save-state="saved"`, the
  progress line updated, and — on a reload — the same numbers rendered by the server.

## Acceptance criteria

Tests that touch only `quantity-input.ts`, `entry-filters.ts`, `count-input.ts`,
`entry-queue.ts` or `count-messages.ts` are `*.test.ts` and run in `npm run test:unit` with no
database. Tests that write are `*.db.test.ts` under `src/server/counts/`, call `resetTestDb()`
in `beforeEach` and build their own fixture. Browser-level criteria are Playwright specs named
`tests/e2e/stock-entry-*.spec.ts`, which is what places them in the `chromium-stock-entry`
project (007's project split).

1. **AC-1** — **The new endpoint is closed to a signed-out request, and answers in JSON rather than in HTML.** An unauthenticated `POST /api/counts/<id>/lines` with a valid body responds `401` with the body `{"error":"Unauthorized"}`, sets no `Location` header, writes nothing, and never returns `307`; `/stock-entry/counts/<id>` still responds `307` to `/sign-in?callbackUrl=<the URL-encoded path>` for the same session, so the page redirects and the endpoint refuses. `src/lib/auth-config.ts` and `src/middleware.ts` are **byte-identical** to their state before this feature — `PROTECTED_PATHS` gains no `/api` entry and the matcher gains no pattern — and `tests/unit/hashing-boundary.test.ts` stays green unchanged. No `loading.tsx` exists at or above `src/app/stock-entry/` in the shipped tree (007 AC-3).
2. **AC-2** — **Both roles may count, and no yard is off limits.** Signed in as `YARD_STAFF` and again as `ADMIN`, `GET /stock-entry/counts/<id>` returns `200` with editable inputs and `POST /api/counts/<id>/lines` returns `200` and persists, for a count at either yard and whoever created it: `saveQuantities` calls `assertUser(actor)` and never `assertRole`, and a source scan of `src/server/counts/count-entry-service.ts` and `src/app/api/counts/` finds no `assertRole`, no `ForbiddenError` and no per-yard predicate. Called with a `null` actor, `saveQuantities` raises `UnauthorizedError` and writes nothing. This is Part 6 read literally: "create and edit a `DRAFT` count" sits in both role columns, and there is no yard-scoped user.
3. **AC-3** — **Every line of the count is on the page, and this feature reads no sheet.** For a Dublin count with 82 lines the page renders exactly **82** elements with `data-testid="count-line"` and exactly **82** with `data-testid="quantity-input"`, in `ItemLocation.sortOrder` then `description` order, with no pagination control, no "show more" control, no held-only toggle and no virtualised container — asserted by counting the inputs in the raw HTML of a single response, not after scrolling. Part 5's table is the reason and is quoted in the module comment: count entry defaults to **all** items assigned to the yard. A line whose item was archived or unassigned after the count started is still rendered, still editable, and still sorts last (007 AC-12). `listSheet` is called **zero** times by anything this feature adds: a source scan of `src/server/counts/count-entry-service.ts`, `src/app/api/counts/**`, `src/app/stock-entry/**` and `src/components/stock-entry/**` finds no `listSheet` import, and 006 AC-24 keeps its single definition.
4. **AC-4** — **`null` and `0` are different on the screen, and the difference is text, not colour.** A line with `quantity === null` renders an input whose `value` is the empty string, carries `data-counted="false"` on its `data-testid="count-line"` row, and renders a `data-testid="not-counted"` element whose text is exactly `Not counted`. A line with `quantity === "0"` renders an input whose `value` is `0`, carries `data-counted="true"`, and renders **no** `not-counted` element. Asserted with CSS disabled — the two states differ in `textContent` and in an attribute, so a counter in bright sunlight who cannot distinguish two greys can still distinguish the two states — and a criterion asserts the distinction is not carried by a `class` attribute alone by comparing the two rows' `textContent`.
5. **AC-5** — **A blank input is never saved as `0`, and `0` is never rendered as blank.** Typing `0` into an uncounted row and blurring stores `quantity` equal to `0` for that line — read back from the database as a `Decimal` whose `.toString()` is `"0"` and which is `!== null` — and the row becomes `data-counted="true"` with the progress line incremented by one. Clearing a row that holds `12.5` and blurring stores `null` — read back as `=== null`, **not** `0` — and the row returns to `data-counted="false"` with the `Not counted` text and the progress decremented. Focusing an empty input and blurring it without typing sends **no** request and leaves the row `null`. At the service level, `saveQuantities(actor, id, [{ itemId, quantity: null }])` and `[{ itemId, quantity: "0" }]` produce database rows that are distinguishable by `IS NULL`, and a `*.db.test.ts` asserts `SELECT count(*) WHERE quantity IS NULL` changes by exactly one in each direction.
6. **AC-6** — **`0` is one tap.** Each row carries a control with `data-testid="none-held"` whose accessible name is `None held`; tapping it sets that row's input to `0`, marks the row `data-counted="true"`, and saves `0` immediately with no debounce — one `POST`, asserted by counting requests. Tapping it on a row that already reads `0` sends no request. On the 390 px viewport its bounding box is at least 44 × 44 CSS px (AC-30). It exists because the most recent Dublin count has 35 of 82 rows at zero or blank, and it is the only control on the page that writes a value the user did not type.
7. **AC-7** — **The quantity parser is pure, refuses rather than rounds, and both transports use it.** `parseQuantity` is unit-tested with no database and returns a canonical decimal string or `null`: `""`, `"   "` and `null` give `null`; `"0"` gives `"0"`; `"21.6128"` gives `"21.6128"`; `"21,6128"` gives `"21.6128"` (a decimal comma is accepted and normalised); `" 9.83 "` gives `"9.83"`; `"0.475"` gives `"0.475"`. It raises `ValidationError` with `field === "quantity"` and the message `Quantity must be a number with up to 4 decimal places.` for `"abc"`, `"1e3"`, `"1.2.3"`, `"+1"`, `"1 2"` and `"21.61285"` — **five decimal places are refused, never rounded**, because `specs/product-brief.md` says never round; `Quantity cannot be negative.` for `"-1"` and `"-0.5"`; and `Quantity must be less than 100000000.` for `"100000000"` and `"1234567890"`, which is what keeps a `numeric field overflow` (SQLSTATE `22003`) from ever reaching a screen given `Decimal(12,4)`. The same function is called by the endpoint, by the server action and by the client before anything is queued, asserted by source scan: no other module contains a numeric regular expression for a quantity.
8. **AC-8** — **The save writes one column, all or nothing, and touches nothing else.** `saveQuantities(actor, countId, edits)` writes every edit inside **one** `db.$transaction`; a test that makes the second of three edits fail — a `tmp_ac8_quantity_check` `CHECK` on `StockCountLine`, added and dropped in the same test as 007 AC-13 does — leaves all three lines at their previous values, and a control run immediately afterwards with the constraint dropped writes all three. For each written line, `id`, `stockCountId`, `itemId`, `unitPriceSnapshot` and `note` are unchanged after the write, and every column of the parent `StockCount` row — including `status`, `countDate`, `periodYear`, `periodMonth`, `submittedAt`, `signatureSvg` — is unchanged. Row counts of `StockCount`, `StockCountLine`, `Item`, `ItemPrice`, `ItemLocation`, `Supplier`, `ItemType`, `Location` and `User` are identical before and after every test in this feature: this feature inserts nothing and deletes nothing. An `itemId` that is not a line of this count raises `NotFoundError` with the message `That item is not on this count.` and writes nothing, including the valid edits sent alongside it.
9. **AC-9** — **A count that is no longer a `DRAFT` cannot be edited, and the refusal is the domain's words.** With `status !== "DRAFT"`, `saveQuantities` raises `ConflictError` whose message is exactly `This count has been submitted and can no longer be edited.` and writes nothing; the endpoint answers `409` with that message in `error`; and the page renders the same sentence in `data-testid="count-read-only"`, renders the quantities as text, and renders **no** `input`, `select` or `textarea` inside `data-testid="count-lines"` and no `none-held` control. Neither the service, the endpoint, the action nor the page contains the strings `SUBMITTED` or `APPROVED` — the branch is written `status !== "DRAFT"` and the sentence lives in `src/lib/count-messages.ts`, which is the layout 007 AC-25 fixed.
10. **AC-10** — **The endpoint's contract, asserted on real HTTP.** `POST /api/counts/<id>/lines` with `{"edits":[{"itemId":"…","quantity":"12.5"},{"itemId":"…","quantity":null}]}` returns `200` with `content-type: application/json`, a body whose keys are exactly `countId`, `saved`, `lineCount`, `countedLineCount`, `uncountedLineCount`, `saved` echoing the values **as persisted** (read back after the write, not copied from the request), and `countedLineCount + uncountedLineCount === lineCount`. Sending the identical body twice returns the identical body both times and leaves the database identical after the second. A body that is not an object, an `edits` that is not an array, an empty `edits`, more than 200 edits, an `itemId` that is not a string, a `quantity` that is a JSON number rather than a string, and an unknown extra key each return `400` with a `ValidationError` message and write nothing. A `countId` that does not exist returns `404`. A `GET`, `PUT` or `DELETE` on the same path returns `405`.
11. **AC-11** — **Autosave fires on the events a counter actually produces, and not on every keystroke.** With the network instrumented, typing `12.5` into one input and waiting 1 s issues exactly **one** `POST`; typing `12.5` and blurring before the debounce elapses issues exactly **one** `POST` (the blur flushes and cancels the timer, it does not double-send); focusing and blurring with no change issues **none**; and typing into six rows in quick succession and then blurring issues at most **two** `POST`s carrying six edits in total, because a flush sends every pending edit in one batch. The debounce is 800 ms, declared as a named constant. A flush is also attempted on `pagehide` and on `visibilitychange` to `hidden` using `fetch` with `keepalive: true`. Nothing about the save is bound to a form submit: no `POST` to the page URL occurs at any point in the JavaScript-enabled flow.
12. **AC-12** — **What the user sees while a save is in flight, and one row's response never rewrites another row's input.** Each row carries `data-save-state` with one of `saved`, `pending`, `saving`, `error`; the header carries `data-testid="save-status"` reading `All changes saved`, `Saving…` or `3 changes not saved. They will be sent when the connection returns.`. With the endpoint delayed by 2 s, typing `10` into row A, then typing `20` into row B while A's request is in flight, leaves both inputs holding what was typed when A's response arrives, and both values are in the database afterwards. With the endpoint delayed by 2 s, typing `10` into row A, then `11` into the same row A before the response arrives, ends with `11` displayed and `11` stored: a server value is applied to an input only when no newer local edit for that item exists. Neither case is achieved by disabling the input — no input is ever `disabled` or `readonly` while the page is editable, asserted directly, because a counter who cannot type while the phone is talking to Neon is a counter who stops.
13. **AC-13** — **A failed save keeps the number and says so.** With the endpoint routed to fail (`500`, and separately an aborted connection), typing into three rows leaves all three values in their inputs, each row at `data-save-state="error"` with the text `Not saved`, the header reading `3 changes not saved. They will be sent when the connection returns.`, and a `data-testid="retry-now"` control present. Retries are automatic with backoff — 1 s, 2 s, 4 s, 8 s, capped at 30 s, declared as a named constant array — and *Retry now* sends immediately. When the route stops failing, the three edits are persisted in one batch and the header returns to `All changes saved` with every row `saved`. At no point is a typed value removed from an input, replaced by the server's older value, or lost from the queue; the failure path never calls `location.reload()` and never navigates.
14. **AC-14** — **Signal drops in a yard, and the count survives it.** With `context.setOffline(true)`, typing into three rows and blurring each leaves the three values on screen, the rows at `error`, and the header reading `3 changes not saved. They will be sent when the connection returns.`. With `context.setOffline(false)` and no further user action, the queued edits are sent within 2 s — the flush is bound to the `online` event and not to a poll — and the three values are in the database. The same flow with one row edited twice while offline sends the **latest** value only, once: the queue is keyed by `itemId`, so the wire never carries a value the user has already replaced.
15. **AC-15** — **A reload does not lose ten minutes of typing, and the queue is a pure module.** `src/lib/entry-queue.ts` is unit-tested with no database and no browser, over a fake `Storage`: `writeQueue` stores `{ userId, countId, edits, updatedAt }` under `QUEUE_KEY`; `readQueue` returns the edits only when `userId` **and** `countId` match the arguments and `updatedAt` is within `QUEUE_MAX_AGE_MS` (7 days), and returns an empty queue — discarding the stored value — for a different user, a different count, a stale timestamp, malformed JSON or a `Storage` that throws; `mergeEdit` replaces an earlier edit for the same `itemId`; `dropConfirmed` removes exactly the confirmed ids and keeps the rest. In the browser: with the endpoint routed to abort, typing into three rows and then reloading the page renders the server's values **and** re-applies the three queued edits over them, with those rows at `error` and the header showing `3 changes not saved…`; removing the route and pressing *Retry now* persists them. After a successful save the stored queue is empty, asserted by reading `localStorage` directly, so a later visit never re-applies a value the user has since changed elsewhere.
16. **AC-16** — **It still works with JavaScript disabled, and there is only one writer.** In a browser context created with `javaScriptEnabled: false`, `/stock-entry/counts/<id>` renders all 82 inputs with their current values, a visible control whose accessible name is `Save now`, and a `<form>` whose `action` is a server action; typing into two rows and submitting persists both, re-renders the page with the new values and the updated progress line, and renders no client-side error. The same submission with an invalid value re-renders with the message from AC-7 beside the named row and persists nothing. `saveQuantitiesAction` and the route handler both call `saveQuantities` and contain no Prisma query of their own (`docs/architecture.md`), asserted by source scan: `db.` appears in neither file. With JavaScript enabled, *Save now* flushes the queue instead of submitting the form, and no full-page navigation occurs.
17. **AC-17** — **The money-key walk, in the shape of 003 AC-19, on everything a `YARD_STAFF` session can obtain from this screen.** `assertNoMoneyKeys` from `src/lib/money-boundary.ts` is applied to the value returned by `getCount` and by `saveQuantities` for a staff actor, and `deepKeys` of each contains **no** key matching `/price|value|total|amount/i` at any depth, including inside `lines[]` and `saved[]`. The same walk is applied to the **parsed JSON body of the real HTTP response** from `POST /api/counts/<id>/lines` for a staff session and reports zero offenders. For an `ADMIN` actor the same walk over `getCount` still reports exactly one offender, `itemsWithoutPrice`, and no other — unchanged from 007 AC-17 — and the endpoint's body for an `ADMIN` is **deeply equal** to the body a `YARD_STAFF` session receives for the identical request, because that response has one shape and no money in it. At the browser level, the rendered HTML of `/stock-entry/counts/<id>` for a staff session, with every filter applied and with none, contains no `€` character, no `unitPrice` string, no `No price` string, and no `unitPrice` value of any item in the database; the staff page carries no `items-without-price` element and no per-row price tag, while the `ADMIN` page renders #7's `items-without-price` sentence and is otherwise identical markup.
18. **AC-18** — **There is no running total on this screen, for either role, and the source says where the first one comes from.** No element of `/stock-entry/counts/<id>` for either role contains a euro figure, a line value or a sum of any kind: the rendered HTML contains no `€`, and the only numbers it carries are quantities, the progress counts and the facet counts. A source scan of `src/server/counts/count-entry-service.ts`, `src/app/api/counts/**`, `src/app/stock-entry/**` and `src/components/stock-entry/**` finds no `*` or `reduce` applied to a quantity, no identifier matching `/total|value|price|amount/i` other than `countedLineCount`, `uncountedLineCount`, `lineCount` and `itemsWithoutPrice`, and no import of `src/lib/money.ts`. The permitted-identifier list is asserted as an **exact set**, so a tenth name turns it red. `tests/unit/project-contract.test.ts` records the reason in its assertion message: `unitPriceSnapshot` is null until `SUBMITTED` (Invariant 2), so a draft total could only come from today's prices and would disagree with the count's own total the moment a price changed.
19. **AC-19** — **Role and identity cannot be influenced by anything the client sets.** Signed in as `YARD_STAFF`, a `GET` of `/stock-entry/counts/<id>` and a `POST` to `/api/counts/<id>/lines` each carrying the query string `?role=ADMIN`, the header `x-user-role: ADMIN`, the cookie `role=ADMIN` and — for the `POST` — the body keys `role: "ADMIN"` and `userId: <an ADMIN user id>` simultaneously, render and return the staff shape, are accepted or refused exactly as they would be without them, and change no row's `createdById` anywhere. A source scan of the route handler and the action finds one `requireUser()` call each and no read of `role`, `actor`, `actorId`, `userId` or `createdById` from a request body, a header, a cookie or a `FormData`. The test asserts the response, not the source code alone.
20. **AC-20** — **The three filter categories are built from the count's own lines.** `buildEntryFacets(lines)` is pure and unit-tested with no database: it returns exactly three categories — `supplier`, `type`, `unit` — each an array of `{ value, count }` sorted by `value` ascending, case-insensitive, with the sentinel option last. An item with no supplier contributes the sentinel `No supplier` and an item with no unit label contributes `No unit`, both imported from `src/lib/item-master-messages.ts` so the two screens spell them the same way; `type` has no sentinel because `Item.itemTypeId` is required. Each `count` is the number of lines **on the whole count** carrying that value and does not change as other filters are applied — a facet count that moves makes options appear and vanish under a thumb, and the panel jump. On the rendered page the panel carries `data-testid="entry-filters"` with three groups labelled `Supplier`, `Type` and `Unit`, each option a checkbox whose accessible name is the value followed by its count, e.g. `Kelly (14)`.
21. **AC-21** — **Multi-select within a category, AND across categories, and the list shrinks.** `filterEntryRows(lines, selection)` is pure and unit-tested with no database: an empty selection returns every line; `{ supplier: ["Kelly", "Meon"] }` returns lines whose supplier is either (OR within a category); `{ supplier: ["Kelly"], type: ["Thermo-P"] }` returns only lines that satisfy both (AND across categories); `{ supplier: ["Kelly"], type: ["Thermo-P"], unit: ["Tonne"] }` narrows again; `{ supplier: ["No supplier"] }` returns lines whose supplier is null; a value present in no line contributes nothing and raises nothing. In the browser, on a count of 82 lines, selecting one supplier reduces the rendered `count-line` elements to that supplier's facet count, adding a second supplier increases it to the sum of the two, and adding a type reduces it again — each asserted against the number the facet itself displays, so the criterion cannot pass with a filter that merely renders a different number.
22. **AC-22** — **Filters live in the URL, survive a reload, and cost no round trip to change.** Toggling a checkbox updates the address to `?supplier=Kelly&supplier=Meon&type=Thermo-P` — repeated parameters, not a comma-joined list, so a value containing a comma is safe — using `history.replaceState`, with **no** request to the server, asserted by instrumenting the network. Reloading that address renders the same filtered list **from the server**, with the same checkboxes selected, because `parseFilterSelection` runs on the server render too. A parameter naming an unknown value, a repeated unknown value, an empty value or a parameter that is not one of the three is ignored and the page still returns `200`: no query string can make this page throw (007 AC-21). With JavaScript disabled the panel is a `<form method="get">` whose submit control, rendered inside `<noscript>`, is labelled `Apply filters` and produces the same URL and the same filtered list.
23. **AC-23** — **A filter can never let a counter believe they have finished.** With any filter active the page renders `data-testid="showing-summary"` reading `Showing 12 of 82 items` and `data-testid="filter-hiding"` reading `Filters are hiding 70 items, 31 not counted.`, followed by a `Clear filters` control that returns to the unfiltered URL. `filtersHiding` is pure and unit-tested: `(70, 31)` gives `Filters are hiding 70 items, 31 not counted.`; `(1, 1)` gives `Filters are hiding 1 item, 1 not counted.`; `(70, 0)` gives `Filters are hiding 70 items, all counted.`; `(0, 0)` gives the empty string and the element is not rendered at all. With no filter active neither element is rendered. A filter matching nothing renders `No items match these filters.` in `data-testid="no-matching-lines"` together with *Clear filters*, and still renders the hiding sentence, because that is the moment the trap is most likely to spring.
24. **AC-24** — **Progress means "quantity is not null", and filters do not touch it.** `data-testid="counted-summary"` reads `12 of 82 counted` using #7's `countedSummary`, where the numerator counts lines whose quantity is not null — **`0` counts as counted** — and the denominator is every line on the count. Applying a filter that hides 70 rows leaves that sentence byte-identical. Typing a value updates it immediately, before the save is confirmed, and clearing a value decrements it; the counterweight is AC-13's unsaved banner, so the page never claims a number is stored, only that it has been entered. On reload the sentence is rendered by the server from the database, plus any edits AC-15 restores. A `*.db.test.ts` asserts `getCount` reports `countedLineCount === 1` and `uncountedLineCount === 81` for a count in which exactly one line holds `0`.
25. **AC-25** — **Every state on this screen is handled.** A count whose lines are all null renders 82 empty inputs, `0 of 82 counted` and no error. A filter matching nothing renders AC-23's sentence. A `countId` that does not exist renders #7's `That count no longer exists.` with the link back, unchanged. A count that is not a `DRAFT` renders AC-9's read-only page. A count with zero lines renders `This count has no items.` rather than an empty table. A save rejected for a bad value renders the AC-7 message beside the row it names, keeping every other row's typed value. Anything that is not a domain error reaches the shared error boundary from #2 rather than being flattened into a message nobody can act on.
26. **AC-26** — **The strings are single-sourced, so the screen and the test cannot drift apart.** Every literal quoted by any criterion above is exported from `src/lib/count-messages.ts` and asserted from that module — `Not counted` and `None held`, `All changes saved`, `Saving…`, `Not saved`, `Retry now`, `Save now`, `Apply filters`, `Clear filters`, `Supplier`, `Type`, `Unit`, `No items match these filters.`, `This count has no items.`, `This count has been submitted and can no longer be edited.`, `That item is not on this count.`, the three quantity messages of AC-7, and the `changesNotSaved`, `showingSummary` and `filtersHiding` builders. `Clear filters`, `No supplier` and `No unit` are imported from `src/lib/item-master-messages.ts` rather than re-spelled, as #7 already does for `No unit`. `src/lib/count-messages.ts` and `src/lib/entry-queue.ts` import nothing from `src/server/` except `@/server/errors`, keeping `npm run lint`'s dependency fence green (006 AC-33), and `tests/unit/lint-fence.test.ts` passes unchanged.
27. **AC-27** — **No database error text ever reaches a screen or a JSON body.** For each of six provoked failures — a quantity of `abc`, a quantity of `21.61285`, a quantity of `100000000`, an `itemId` that is not on the count, a `countId` that does not exist, and a save against a count that is not a `DRAFT` — the JSON body and the rendered HTML contain the feature's own message and none of `prisma`, `Prisma`, `violates`, `constraint`, `SQLSTATE`, `22003`, `23502`, `23514`, `23505`, `P2002`, `P2003`, `P2025`, `numeric field overflow` or `StockCountLine_stockCountId_itemId_key`. Every function in `src/server/counts/count-entry-service.ts` throws only `ValidationError`, `NotFoundError`, `ConflictError` or `UnauthorizedError` from `src/server/errors.ts`, never a bare `Error`, and `src/app/api/error-response.ts` is **unchanged**.
28. **AC-28** — **#7's no-mutation scan is narrowed rather than deleted, and #8 is permitted exactly one mutation.** 007 AC-25's scan of `src/server/counts/**` and `src/app/stock-entry/**` for `.update`, `.updateMany`, `.upsert`, `.delete` and `.deleteMany` on `stockCount` or `stockCountLine` now exempts exactly one file, `src/server/counts/count-entry-service.ts`, named as a literal in an exact list so a second exemption turns the test red. In that file: no mutation of `stockCount` of any kind; no `.delete`, `.deleteMany`, `.create`, `.createMany` or `.upsert` of anything; and the only write is to `stockCountLine`, whose `data` object's keys are exactly `{ quantity }` — asserted structurally by a `*.db.test.ts` that compares every other column before and after (AC-8), not only by reading the source. All of 007 AC-25's other clauses hold unchanged, including that no file under either tree contains `SUBMITTED`, `APPROVED`, `submittedAt`, `approvedAt` or `signatureSvg`.
29. **AC-29** — **No migration, no new table, and the schema and the workbook are untouched.** `prisma/schema.prisma`, every directory under `prisma/migrations/` and `prisma/migrations/migration_lock.toml` are byte-identical to their state before this feature; `npx prisma migrate status` reports no drift and no pending migration; `TRUNCATED_TABLES` in `src/server/test-db.ts` is unchanged and **020 AC-4's `information_schema` equality passes untouched**; and `git status --porcelain -- Samples` is empty. Quantities round-trip at full precision: saving `21.6128` and `0.475` and reading them back through `getCount` gives the strings `21.6128` and `0.475` exactly, with no rounding and no JavaScript `number` anywhere on the path — asserted by a source scan finding no `Number(`, `parseFloat` or `toFixed` applied to a quantity in `src/server/counts/**` or `src/components/stock-entry/**`.
30. **AC-30** — **Phone-first, and this is the screen the constraint was written for.** At a 390 × 844 viewport, signed in as `YARD_STAFF`, on a count of 82 lines: `document.documentElement.scrollWidth` does not exceed its `clientWidth`, with the filter panel open and closed and with a filter applied; every `quantity-input` has a bounding box at least 64 px wide and 44 px tall and lies entirely within the viewport's horizontal bounds; every `none-held` control and every filter checkbox's tap target is at least 44 × 44 CSS px; each input has `inputmode="decimal"`, `autocomplete="off"`, `enterkeyhint="next"` and is **not** `type="number"` — so the phone offers a numeric keypad, and a scroll gesture over a focused input cannot change its value, asserted by dispatching a `wheel` event over a focused input and finding the value unchanged. The progress line and the save status sit in a container that is sticky to the **top** of the viewport, never the bottom, because the on-screen keyboard occupies the bottom and a bar there would cover the row being typed into; with the viewport then reduced to 390 × 380 — the space a keyboard leaves — the focused input's bounding box still lies entirely within the visual viewport, because focusing a row scrolls it into view. At a 320 px viewport the document still does not scroll sideways. Reaching the 82nd input requires only vertical scrolling: it is present in the DOM on first paint (AC-3) and reachable by pressing `Tab` from the 81st.
31. **AC-31** — **The `unitPrice` permitted list is not extended, and this feature renders no price.** 006 AC-31's exact nine-file list in `tests/unit/project-contract.test.ts` is **unchanged**: no file under `src/server/counts/`, `src/app/stock-entry/`, `src/app/api/counts/`, `src/components/stock-entry/`, `src/lib/count-messages.ts` or `src/lib/entry-queue.ts` contains the string `unitPrice`, `src/lib/**` and `scripts/**` stay at **zero** files naming it, and `unitPriceSnapshot` is still named by no shipping module anywhere — #9 remains its first reader and writer. Every `StockCountLine` this feature writes has `unitPriceSnapshot === null` after a fresh read (Invariant 2), and nothing in the feature multiplies a quantity by anything (AC-18).
32. **AC-32** — **Which checks survive with no database,** mirroring 003 AC-23, 004 AC-26, 005 AC-27, 006 AC-32 and 007 AC-29. With `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointing at a hostname that does not resolve: `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` each exit `0`, and both `init` scripts exit `0` ending with `[OK] Environment ready (database checks skipped)`. No module this feature adds opens a connection at import time; `/stock-entry/counts/[id]` and the new route handler each declare `export const dynamic = "force-dynamic"`, so neither is prerendered against a database during `build`. The criteria provable without Postgres are AC-7, AC-15's queue half, AC-18's scan half, AC-20's facet half, AC-21's filter half, AC-23's `filtersHiding` half, AC-26, AC-28's scan half, AC-29's scan half and AC-31; every other criterion needs a database or a browser and lives in `*.db.test.ts` or `tests/e2e/`.
33. **AC-33** — **The gate is green in full, and the e2e suite stays self-cleaning at `retries: 0`.** `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, `npx prisma migrate status` and `npm run test:db` all pass, and `./init.ps1` ends with `[OK] Environment ready` having **executed** the database checks. `playwright.config.ts` is **byte-identical**: the new specs are named `tests/e2e/stock-entry-quantities.spec.ts`, `stock-entry-filters.spec.ts` and `stock-entry-autosave.spec.ts`, so the existing `testMatch: /stock-entry-.*\.spec\.ts/` places them in the `chromium-stock-entry` project that already depends on `chromium`. `RESERVED_YEAR` in `tests/e2e/support/stock-entry.ts` gains one year per new file — `quantities: 2095`, `filters: 2096`, `autosave: 2097` — each file deletes only **its own** reserved year in `beforeAll` and `afterAll`, never the range, and asserts through `realCountIds()` that the set of `StockCount` ids with `periodYear < 2090` is identical before and after (007 AC-30). `Item`, `ItemPrice` and `ItemLocation` row counts are unchanged by the run. Two consecutive full `npm run test:e2e` runs report `0 flaky` and `0 failed`; if the suite is not stable at `retries: 0`, the implementer reports that rather than restoring retries or raising a timeout.
34. **AC-34** — **Two devices, one count: the last write wins and says so.** Two sessions for the same user open the same count; A saves `10` on a line and B, whose page was loaded before, saves `20` on the same line; the database holds `20`, B's response echoes `20`, and A's page shows `10` until it is reloaded, after which it shows `20`. No request is refused, no version token is sent, and `saveQuantities` contains no `version`, `updatedAt` comparison or `SELECT … FOR UPDATE`. The same two sessions editing **different** lines of one count both succeed with no interference, and the resulting `countedLineCount` is 2.

35. **AC-35** — **Exactly one shipped assertion changes, and it is named.** #8 replaces the rows on this page, so 007 AC-24's clause "there is no quantity input on this page" is superseded — deliberately, and in one line: `tests/e2e/stock-entry-start.spec.ts:228`, which asserts `page.getByTestId("count-lines").locator("input, select, textarea")` has count `0`, becomes an assertion that the line list holds exactly one `input` per rendered row, every one of them carrying `inputmode="decimal"`, and **no** `select` and **no** `textarea`. `git diff` on that file shows no other change. Every other clause of 007 AC-24 passes unmodified, including the one immediately above it: the quantity cell keeps its `data-testid="count-quantity"` and an uncounted line's cell still reads exactly `Not counted`, so a freshly started count still renders `0 of 82 counted` with every cell in that state. `tests/e2e/stock-entry-calendar.spec.ts`, `stock-entry-access.spec.ts`, `stock-entry-refusals.spec.ts`, `role-access.spec.ts`, `item-master-*.spec.ts` and every `*.db.test.ts` shipped by #4 through #20 pass **unmodified**, apart from the narrowing AC-28 names.

## Out of scope

- **Submitting, signing and approving.** The drawn signature, Invariant 5's block on a null
  quantity, the `unitPriceSnapshot` write, the per-line *no price* warning, the count summary
  with its total, the `SUBMITTED → APPROVED` transition, immutability and the audited reopen
  are all #9 `entry_submit`. This feature edits a `DRAFT` and refuses anything else (AC-9).
- **Adding an item during a count.** Part 5 gives two paths from the entry screen — search
  the master, or create inline — and **neither is built here**, deliberately. Both call
  `createItem` and `assignItemToLocation`, which 006 AC-4 and 007 AC-14 keep `ADMIN`-only,
  and which mutate the item master and the yard sheet permanently. Letting a `YARD_STAFF`
  session create master data is a **role-boundary decision**, not a UI addition: it widens
  two of the seventeen mutations 007 AC-14 asserts still refuse a staff actor, it creates
  items with `needsReview = true` that someone must then clear (#15's worklist), and it adds
  a line to a count whose other 82 lines were fixed at creation. Folding that into the
  feature that must not lose a typed number is how both get done badly. It is recorded in
  *Open questions* 1 as its own feature, to be scheduled after #9 and alongside #15
  `item_housekeeping`, which already owns `needsReview`.
- **A per-line note.** `StockCountLine.note` exists and stays null. A note is the wrong answer
  to "this item is not on my sheet" — the right answer is the inline add above — and a second
  writable column doubles the save contract this feature exists to get right.
- **Any monetary figure.** No price, no line value, no running total, no MoM, no YoY, and no
  per-row *No price* tag for either role (AC-18). The only money-adjacent fact on this
  surface is #7's `ADMIN`-only count of items with no price, unchanged.
- **Held-only, or any other view that hides a row.** Part 5 gives count entry **all** items
  assigned to the yard. The filters hide rows on purpose and announce it (AC-23); nothing
  else may.
- **Editing `countDate`, the period, the yard or the status.** All four are #7's or #9's.
  Nothing in this feature writes a column of `StockCount` (AC-8, AC-28).
- **Deleting a count or a line.** Nothing here deletes anything. A count started at the wrong
  yard is still the open question 007 recorded.
- **Sorting the sheet, or searching it by description.** The sheet order is
  `ItemLocation.sortOrder` — the order the yard walks — and re-sorting it would make a
  counter lose their place mid-aisle. Search is #6's, on the item master; here the three
  filters are the answer, and a fourth control is a fourth thing to mis-tap with cold hands.
- **A service worker, a cache manifest or an installable app.** The queue in `localStorage`
  is what keeps typed numbers safe (AC-15); making the page itself load with no network is a
  separate feature with its own upgrade and cache-invalidation problems.
- **Real-time updates between devices.** No websocket, no polling, no presence indicator.
  Last write wins (AC-34).
- **Per-yard permissions.** Any signed-in user may edit any `DRAFT` count at any yard, as
  #7 established (AC-2).
- **CI.** `init` remains the gate.

## Open questions

None blocking. Eight decisions this spec settles with a stated answer rather than leaving
undefined, each flagged so the user can strike it at approval:

1. **Adding an item mid-count is deferred to its own feature**, after #9 and alongside #15
   `item_housekeeping`. Striking this means #8 also widens `createItem` and
   `assignItemToLocation` to `YARD_STAFF` and grows an inline create form on the counting
   screen — a role-boundary change inside the feature that must not lose a typed number.
   Until it ships, an item that is not on the sheet is added by an `ADMIN` at
   `/item-master/yards/<code>`, and a count started afterwards includes it.
2. **An empty input means *not counted*, and clearing one is how you undo a count.** There is
   no separate *Clear* control: the row visibly returns to `Not counted` and the progress
   line decrements, so the change is never silent. Striking this means an explicit clear
   control and an input that cannot be emptied.
3. **There is no running total, for either role** (AC-18), and the reasons are argued above:
   Part 6, Invariant 2, and one number per count. Striking this means an `ADMIN`-only draft
   total computed from today's prices, which will disagree with the same count's total after
   approval whenever a price changes in between.
4. **No per-row *No price* tag on this screen, for anyone.** It is a submit-time fact and
   belongs on #9's summary. Striking this adds an `ADMIN`-only per-row tag and a second
   money-shaped key to the admin shape, which amends 007 AC-17.
5. **Last write wins, with no lock and no version token** (AC-34). Striking this means an
   optimistic-concurrency token and a conflict screen — on a device that may be offline when
   it has to be resolved.
6. **Facet counts are counts over the whole count, not over the current filter** (AC-20), so
   options never appear, vanish or renumber under a thumb. Striking this means live faceting.
7. **Filters update the URL with `history.replaceState`, not `pushState`.** The browser's
   back button therefore leaves the count rather than stepping back through filter states: a
   filter is not a place, and on a phone *back* means "out of here". Striking this means
   every toggle becomes a history entry.
8. **The autosave debounce is 800 ms and the backoff is 1, 2, 4, 8, 30 s** (AC-11, AC-13).
   Both are named constants so they can be changed in one place; they are quoted in the
   criteria so a change is deliberate rather than incidental.

`Q7` and `Q8` in `specs/domain-model.md § Still open` block only M7 and are unrelated to this
feature. Nothing this feature needs is unanswered in the domain model: Part 5's table settles
which lines appear, Part 6 settles the money boundary, and Invariant 5 settles `null` against
`0`.
