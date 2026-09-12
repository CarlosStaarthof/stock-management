# Implementation — feature 8 `stock_entry_ui`

**Spec:** `specs/features/008-stock_entry_ui.md` (approved 2026-09-11, 35 criteria)
**Status:** complete — **`#8` is NOT `done`.** Four phases: A, B and C implemented, tested and
mutation-proved; **Phase D closes the reviewer's two required changes** (see
`## Review outcome` at the end — AC-6's timing assertion, now seen to fail against the
debounce mutation, and AC-30's filtered no-sideways-scroll measurement). AC-32's no-DNS run is
recorded there too. What is outstanding is the coordinator's gate (`./init.ps1` with the
database checks executed, two consecutive full `npm run test:e2e` runs) and the reviewer's
re-read. The feature is not `done` until it has been re-reviewed.

---

## Phase A

Everything in the spec's **Contract** except the screen: the pure modules, the Zod schema at
the edge of `src/server/`, `saveQuantities`, and the JSON endpoint. No component, no client,
no e2e spec, no server action.

### Files created

- `src/server/counts/quantity-input.ts` — `parseQuantity` / `QUANTITY_PATTERN`: the one place
  that decides what a quantity looks like. Pure, refuses rather than rounds, never `Number(`.
- `src/server/counts/quantity-input.test.ts` — AC-7 in full, 13 tests, no database.
- `src/server/counts/entry-filters.ts` — `buildEntryFacets`, `parseFilterSelection`,
  `filterEntryRows`, `isEmptySelection`, plus `emptySelection` and `hiddenSummary`. Pure.
- `src/server/counts/entry-filters.test.ts` — AC-20, AC-21, AC-22, AC-23 halves, 20 tests.
- `src/server/counts/count-entry-service.ts` — `saveQuantities`: the only writer in the feature.
- `src/server/counts/count-entry-service.db.test.ts` — 30 tests against a real Postgres.
- `src/app/api/counts/[id]/lines/route.ts` — `POST`, `force-dynamic`, outside the middleware matcher.
- `src/app/api/counts/[id]/lines/route.db.test.ts` — 14 tests through the real handler,
  only `auth()` mocked.
- `tests/unit/count-entry-contract.test.ts` — #8's source scans for the trees Phase A builds.
- `tests/support/count-fixture.ts` — the post-`DRAFT` status literal, the preserved-column
  list, `SELECT count(*) … IS NULL`, and the row-count helpers.

### Files modified

- `src/lib/count-messages.ts` — a `#8` block with every literal AC-26 names; `Clear filters`,
  `No supplier` and `No unit` re-exported from `src/lib/item-master-messages.ts`.
- `src/lib/count-messages.test.ts` — 8 tests asserting those literals from the module.
- `src/server/counts/count-input.ts` — `parseSaveQuantitiesBody`, strict Zod, quantity as a
  decimal string or `null` and never a JSON number.
- `src/server/counts/count-input.test.ts` — 9 tests for the body parser.
- `src/server/counts/count-service.ts` — `getCount` also selects the supplier and the item
  type per line, which is where the Supplier and Type filters get their values.
- `src/types/stock-count.ts` — `CountLineRow` gains `supplierName` and `typeName`;
  `QuantityEdit`, `SaveQuantitiesBody` and `SaveQuantitiesResult` added.
- `src/server/counts/count-shape.test.ts` — its `CountLineRow` fixture gains the two fields.
- `tests/unit/stock-entry-contract.test.ts` — **007 AC-25's mutation scan narrowed per 008
  AC-28**: exactly one exempt file, named as a literal, plus a new test asserting what that
  file is allowed to write. Nothing else in that file changed.

### Acceptance criteria satisfied in Phase A

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 (endpoint half) | `src/app/api/counts/[id]/lines/route.ts:56` | `route.db.test.ts` → "AC-1: a signed-out POST … is 401 JSON, with no Location header"; `count-entry-contract.test.ts` → "AC-1: the middleware gains no /api entry" |
| AC-2 (service half) | `count-entry-service.ts:104` (`assertUser`) | `count-entry-service.db.test.ts` → the three "AC-2:" tests; `count-entry-contract.test.ts` → "AC-2: … no role refusal and no yard predicate" |
| AC-3 (no-sheet half) | nothing imports `listSheet` | `count-entry-contract.test.ts` → "AC-3: nothing Phase A adds imports listSheet" |
| **AC-5 (service half)** | `count-entry-service.ts:127` (`data: { quantity }`) | `count-entry-service.db.test.ts` → the four "AC-5:" tests, including `SELECT count(*) … IS NULL` changing by exactly one in each direction |
| AC-7 | `src/server/counts/quantity-input.ts:46` | `quantity-input.test.ts` (13 tests); `count-entry-contract.test.ts` → "AC-7: only quantity-input.ts declares the decimal pattern" |
| AC-8 | `count-entry-service.ts:124` (`$transaction`) | `count-entry-service.db.test.ts` → the six "AC-8:" tests (atomicity via `tmp_ac8_quantity_check`, every other column compared, no row inserted or deleted) |
| AC-9 (service + endpoint) | `count-entry-service.ts:117` (`status !== "DRAFT"`) | `count-entry-service.db.test.ts` → "AC-9: the refusal is a ConflictError…"; `route.db.test.ts` → "AC-9: … is 409" |
| AC-10 (service + handler) | `route.ts:56`, `count-input.ts:173` | `route.db.test.ts` → the eight "AC-10:" tests; `count-input.test.ts` → the body parser tests |
| AC-16 (one writer half) | `route.ts` has no `db.` | `count-entry-contract.test.ts` → "AC-16: the route handler has no Prisma query of its own" |
| AC-17 (service + endpoint) | one shape, no `shapeForRole` | `count-entry-service.db.test.ts` → the three "AC-17:" tests; `route.db.test.ts` → "AC-17: the parsed JSON body … zero monetary keys" and "deeply equal" |
| AC-18 (Phase A scan half) | `count-entry-service.ts`, `api/counts/**` | `count-entry-contract.test.ts` → "AC-18: no money-shaped identifier reaches the service or the endpoint" |
| AC-19 (endpoint half) | `route.ts:63` (one `requireUser()`) | `route.db.test.ts` → the two "AC-19:" tests; `count-entry-contract.test.ts` → "AC-19: the endpoint reads no identity…" |
| AC-20 (facet half) | `entry-filters.ts:80` | `entry-filters.test.ts` → the four "AC-20:" tests; `count-entry-service.db.test.ts` → "AC-20: a line carries the supplier and the type" |
| AC-21 (predicate half) | `entry-filters.ts:143` | `entry-filters.test.ts` → the seven "AC-21:" tests |
| AC-22 (parse half) | `entry-filters.ts:117` | `entry-filters.test.ts` → the five "AC-22:" tests |
| AC-23 (arithmetic half) | `entry-filters.ts:165`, `count-messages.ts` (`filtersHiding`) | `entry-filters.test.ts` → the four "AC-23:" tests; `count-messages.test.ts` → "008 AC-23: showing and hiding…" |
| AC-24 (service half) | `count-entry-service.ts:146` | `count-entry-service.db.test.ts` → "AC-24: one line holding 0 makes a Dublin count 1 of 82 counted" |
| AC-26 (module half) | `src/lib/count-messages.ts` | `count-messages.test.ts` → the eight "008 AC-26/AC-20/AC-13/AC-23/AC-9/AC-7/AC-24" tests; `tests/unit/lint-fence.test.ts` unchanged and green |
| AC-27 (service + endpoint) | typed errors only | `count-entry-service.db.test.ts` → "AC-27: six provoked failures…"; `route.db.test.ts` → "AC-27: no refusal body carries a driver or a Postgres string" |
| **AC-28** | `tests/unit/stock-entry-contract.test.ts` | → "AC-25, 008 AC-28: no update, upsert or delete except in the one exempt file" and "008 AC-28: the exempt file writes one column of one model" |
| AC-29 | no schema change; string arithmetic only | `count-entry-contract.test.ts` → the four "AC-29:" tests; `count-entry-service.db.test.ts` → "AC-29: quantities round-trip at full precision" |
| AC-31 | nothing added names the price column | `tests/unit/project-contract.test.ts` unchanged and green (nine-file list intact); `count-entry-service.db.test.ts` → "AC-31: every line this feature writes still has no price snapshot" |
| AC-34 (service half) | no lock, no version token | `count-entry-service.db.test.ts` → the two "AC-34:" tests |

### Criteria left to Phase B (the screen) — explicitly

- **Whole criteria:** AC-4, AC-6, AC-11, AC-12, AC-13, AC-14, AC-15, AC-30, AC-35.
  (AC-15's pure half, `src/lib/entry-queue.ts`, is Phase B's too — it is the autosave queue.)
- **The remaining half of:** AC-1 (the page's `307` and the no-`loading.tsx` clause in the
  shipped tree), AC-2 (`GET` renders editable inputs for both roles), AC-3 (82 `count-line`
  and 82 `quantity-input` elements, no pagination, plus the `listSheet` scan over
  `src/app/stock-entry/**` and `src/components/stock-entry/**`), AC-5 (typing and blurring in
  a browser), AC-7 (the client calls `parseQuantity` before queueing), AC-9 (the read-only
  page), AC-10 (real HTTP, including the `405` on `GET`/`PUT`/`DELETE`), AC-16 (the server
  action `saveQuantitiesAction` and the JavaScript-disabled flow), AC-17 (the rendered HTML
  walk), AC-18 (the scan over `src/app/stock-entry/**` and `src/components/stock-entry/**`,
  and the rendered-HTML clause), AC-19 (the page), AC-20 (the panel), AC-21 (the browser),
  AC-22 (`history.replaceState`, the `<noscript>` form), AC-23 (the two elements), AC-24 (the
  sentence on the page), AC-25 (the screen's five states), AC-26 (the screen reads the
  literals), AC-27 (the rendered HTML), AC-32 (the no-DNS run — the coordinator's gate),
  AC-33 (the gate and the three e2e specs), AC-34 (two browser sessions).

### Verification output

Targeted commands only; the coordinator runs `init`.

```
npm run typecheck                                    -> exit 0
npm run lint                                         -> exit 0
npm run test:unit                                    -> 36 files, 464 tests passed (11.0 s)
npx prisma validate                                  -> schema is valid
git status --porcelain -- prisma Samples             -> empty
npm run build                                        -> exit 0;  ƒ /api/counts/[id]/lines
npm run test:db                                      -> 18 files, 278 tests passed (298.6 s)
      src/server/counts/count-entry-service.db.test.ts      30 passed
      src/app/api/counts/[id]/lines/route.db.test.ts        14 passed
```

`npm run test:db` was run once, whole-suite, with nothing else in flight (checked with
`Get-CimInstance Win32_Process`); 020's `information_schema` equality and every `*.db.test.ts`
shipped by #4–#20 passed unmodified. The Neon branch did not degrade during this session.

### Deviations from the spec

1. **`route.db.test.ts` lives beside the route, not under `src/server/counts/`.** The spec
   says writing tests are `*.db.test.ts` under `src/server/counts/`; this one exercises the
   real handler, so it belongs beside it. It reaches the database **only** through
   `tests/support/`, never through `@/server/db` directly, so 004 AC-31 ("every file that
   touches the database lives under `src/server/`") stays green unmodified — which is the
   constraint that rule is actually a proxy for.
2. **`tests/support/count-fixture.ts` holds the post-`DRAFT` status literal and the price
   snapshot column.** AC-9 needs a count past `DRAFT` and AC-31 needs the snapshot asserted
   null, and 007 AC-25's exact offenders list names exactly two test files under the scanned
   trees. Putting the two literals in a fixture — the move #6 made for `unitPrice` — keeps
   that list **byte-identical** rather than growing it.
3. **`entry-filters.ts` exports three names the spec's module table does not list:**
   `ENTRY_FACET_CATEGORIES`, `emptySelection` and `hiddenSummary`. The first two are how the
   other four avoid repeating themselves; `hiddenSummary` is AC-23's arithmetic, which had to
   live somewhere pure and is tested with no database.
4. **`parseFilterSelection` takes the facets as a second argument.** AC-22 requires an unknown
   value to be *ignored* rather than treated as a filter matching nothing, and only the facets
   know which values exist.
5. **`saveQuantities` re-runs `parseQuantity` on every edit.** The service is entitled to
   assume valid data, but this is the last gate before Postgres and the function is idempotent
   on a canonical string. It is what makes `saveQuantities(actor, id, [{ itemId, quantity: "0" }])`
   safe to call directly, as AC-5 does.
6. **`db.$transaction` is given `maxWait: 10_000, timeout: 20_000`.** A 200-edit batch against
   a Neon branch a network hop away does not fit the default 5 s budget, and a timeout here
   would discard a counter's whole batch.

### Notes for the reviewer

1. **AC-19 and AC-10 pull in opposite directions on one clause, and I chose AC-10.** AC-10
   requires `400` for an unknown extra key; AC-19 says a `POST` carrying `role: "ADMIN"` and
   `userId: …` in the body is "accepted or refused exactly as they would be without them".
   The strict schema answers such a body with `400` — the identity is refused outright rather
   than dropped silently, which is the stronger guarantee, but it is a refusal a clean body
   would not get. The query string, the header and the cookie are ignored and the response is
   byte-identical (`route.db.test.ts` → "AC-19: a query string, a header and a cookie claiming
   ADMIN change nothing"). **Phase B's e2e must assert `400` for the body variant**, not `200`.
2. **`405` is the framework's answer, not a handler of mine.** Next auto-implements every
   unexported method with a `405`
   (`next/dist/server/route-modules/app-route/helpers/auto-implement-methods.js`, read and
   quoted in the route comment). It cannot be asserted through a direct handler call, so
   AC-10's `405` clause needs Phase B's e2e over real HTTP.
3. **`quantity-input.ts` imports only `@/lib/count-messages` and `@/server/errors`,** so a
   `"use client"` component can import it and AC-7's "the client calls the same function"
   clause is reachable without moving the module out of `src/server/counts/`, where the spec's
   table puts it.
4. **`ValidationError.field` is `"quantity"`, which does not name the row.** AC-25 wants the
   AC-7 message rendered beside the row it names. Phase B knows which `itemId` it sent, so a
   single-edit save can attribute it; a mixed batch cannot. Worth a decision in Phase B rather
   than a surprise.
5. **`tests/unit/stock-entry-contract.test.ts` asserts `years.size === 4`** for the e2e specs
   with a reserved year. AC-33 adds three more files (`quantities: 2095`, `filters: 2096`,
   `autosave: 2097`), so **Phase B must take that number to 7** — it is a #7 unit contract
   test, not one of the shipped e2e specs AC-35 freezes.
6. **The AC-18 identifier scan strips comments and string literals before it reads
   identifiers.** The module comments of this feature argue at length about why there is no
   running total, and a scan that could not tell a symbol from a sentence would forbid the
   explanation. Note also that of AC-18's four permitted names only `itemsWithoutPrice`
   actually matches `/price|value|total|amount/i`; the two trees scanned in Phase A carry
   **none**.
7. **`saveQuantities` groups edits by quantity and issues one `updateMany` per distinct
   value.** A *None held* sweep over 35 rows is then one statement rather than 35 round trips.
   AC-8's atomicity test uses three distinct quantities, so the failing statement is genuinely
   the second of three.

---

## Phase B

The screen, the autosave client, the offline queue, the three filter categories, and the
three e2e specs. **`#8` is still not done** — Phase C is outstanding (see the end).

### Files created

- `src/lib/entry-queue.ts` — AC-15's pure queue over a `Storage`-shaped interface:
  `QUEUE_KEY`, `QUEUE_MAX_AGE_MS`, `readQueue`, `writeQueue`, `mergeEdit`, `dropConfirmed`.
  Imports nothing from `src/server/` at all — not even the error classes, because it has no
  refusal to make.
- `src/lib/entry-queue.test.ts` — 20 tests, no browser and no database.
- `src/components/stock-entry/CountSheet.tsx` — `"use client"`. The rows, the inputs, the
  *None held* control, the autosave queue with its debounce and backoff, the filter state,
  the save-state header, the progress line and the hiding sentence.
- `src/components/stock-entry/EntryFilters.tsx` — the three categories as a real
  `<form method="get">` whose `<noscript>` submit is *Apply filters*.
- `tests/e2e/stock-entry-quantities.spec.ts` — reserved year **2095**, 12 tests.
- `tests/e2e/stock-entry-filters.spec.ts` — reserved year **2096**, 6 tests.
- `tests/e2e/stock-entry-autosave.spec.ts` — reserved year **2097**, 9 tests.

### Files modified

- `src/app/stock-entry/counts/[id]/page.tsx` — builds the facets, parses the query string
  into a selection, and renders `CountSheet` for a `DRAFT`. Keeps #7's missing-count branch,
  adds AC-9's read-only branch and AC-25's empty-count branch. `counted-summary` moved into
  the sheet, because AC-24 requires it to move as a number is typed.
- `src/app/stock-entry/actions.ts` — `saveQuantitiesAction`, the no-JavaScript transport.
  One `requireUser()`, one service call, no Prisma query, and the row-attributed parse.
- `src/app/stock-entry/form-state.ts` — `SaveQuantitiesState`, `toSaveQuantitiesState`,
  `quantityFieldName` / `itemIdOfQuantityField`.
- `tests/e2e/support/stock-entry.ts` — three reserved years, `seedCountLines`,
  `seedCountWithLines`, `quantitiesByItem`, `quantityOf`, `uncountedLinesOf`, `snapshotsOf`,
  `markPastDraft`.
- `tests/unit/count-entry-contract.test.ts` — **+14 tests**: the screen's half of AC-3,
  AC-11, AC-12, AC-13, AC-16, AC-18, AC-22, AC-26 and AC-31.
- `tests/unit/stock-entry-contract.test.ts` — `years.size` 4 -> 7 plus a spec-file count
  (AC-33), and 007's AC-4 `requireUser()` scan narrowed per action (deviation 1 below).
- `tests/e2e/stock-entry-start.spec.ts` — **AC-35's one named assertion, and nothing else.**

### Acceptance criteria satisfied in Phase B

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 (page half) | the page is inside the matcher, the endpoint is outside it | `stock-entry-autosave.spec.ts` -> "AC-1: a signed-out POST is a JSON 401, while the page for the same session is a 307"; `stock-entry-contract.test.ts` -> "AC-3: no loading.tsx exists at or above src/app/stock-entry/" |
| AC-2 (page half) | `page.tsx:139` renders `CountSheet` for both roles | `stock-entry-quantities.spec.ts` -> "AC-2, AC-3, AC-35: both roles get one editable row per line…" |
| AC-3 | `CountSheet.tsx` renders `visible` with no pagination | same test (rows = `quantity-input` = `count-quantity` = the database's own line count, >= 82); `count-entry-contract.test.ts` -> the two "AC-3:" tests |
| AC-4 | `CountSheet.tsx` `data-counted` + the `not-counted` span | `stock-entry-quantities.spec.ts` -> "AC-4: null and 0 differ in text and in an attribute, never in colour alone" (compares the two rows' `textContent`) |
| **AC-5 (browser half)** | `CountSheet.tsx` `edit()` / `typedQuantity` | `stock-entry-quantities.spec.ts` -> "AC-5, AC-24: a blank input is never saved as 0, and a 0 is never saved as blank" — `quantityOf` is `"0"` one way and `null` the other, and `uncountedLinesOf` moves by exactly one |
| **AC-6** | `CountSheet.tsx` `noneHeld()`, `tabIndex={-1}`, `min-h-11 min-w-11` | `stock-entry-quantities.spec.ts` -> "AC-6: None held is one tap, saves 0 with no debounce, and is silent on a row already at 0" — one `POST` counted, then zero |
| AC-7 (client half) | `CountSheet.tsx` calls `parseQuantity` before queueing | `count-entry-contract.test.ts` -> "AC-7: only quantity-input.ts declares the decimal pattern" (unchanged, now with the screen in the scan); `stock-entry-quantities.spec.ts` -> the no-JavaScript invalid-value case renders `QUANTITY_INVALID` beside the named row |
| AC-9 (page half) | `page.tsx:101` `status === "DRAFT"` | `stock-entry-quantities.spec.ts` -> "AC-9, AC-25: a count that is no longer a DRAFT is read-only, in the domain's words" |
| AC-10 (real HTTP) | the shipped route, unchanged | `stock-entry-autosave.spec.ts` -> "AC-10, AC-27: the endpoint's contract, on real HTTP" — including the **`405`** on `GET`/`PUT`/`DELETE`, which is Next's own answer and could be asserted nowhere else |
| **AC-11** | `AUTOSAVE_DEBOUNCE_MS = 800`, the single-in-flight flush loop | `stock-entry-autosave.spec.ts` -> "AC-11: autosave fires on the events a counter produces…" — 1 POST for four keystrokes, 1 for type-then-blur, 0 for focus-and-blur, <= 2 carrying 6 edits for six rows, and one each on `visibilitychange`/`pagehide`; `count-entry-contract.test.ts` -> the `keepalive` / `online` binding test |
| **AC-12** | the per-row revision map in `CountSheet.tsx` | `stock-entry-autosave.spec.ts` -> "AC-12: one row's response never rewrites another row's input" — A then B in flight, then A twice; and zero `:disabled` / `[readonly]` inputs asserted mid-flight |
| **AC-13** | `RETRY_BACKOFF_MS`, `markFailed` (which removes nothing from the queue) | `stock-entry-autosave.spec.ts` -> "AC-13, AC-27: a failed save keeps the number, backs off, and drains when the route recovers" **and** "AC-13: an aborted connection is the same answer, and it recovers the same way" |
| **AC-14** | the `online` listener | `stock-entry-autosave.spec.ts` -> "AC-14: signal drops in a yard, and the count survives it" — three offline edits, one row edited twice, `setOffline(false)`, settled within 2 s, and the wire carrying `60` once and never `6` |
| **AC-15** | `entry-queue.ts` + the restore effect | `entry-queue.test.ts` (20 tests) and `stock-entry-autosave.spec.ts` -> "AC-15: a reload does not lose ten minutes of typing" — `localStorage` read directly, before and after |
| **AC-16** | `saveQuantitiesAction` + `<form action={formAction} onSubmit={…}>` | `stock-entry-quantities.spec.ts` -> "AC-16: it still works with JavaScript disabled, and Save now is a real submit" and "AC-11, AC-16: with JavaScript, Save now flushes the queue and never posts to the page"; `count-entry-contract.test.ts` -> "AC-16: the action and the route handler both call saveQuantities and neither uses db." |
| AC-17 (HTML walk) | nothing on the screen builds a price | `stock-entry-quantities.spec.ts` -> "AC-17: a YARD_STAFF session can obtain no price from this screen…"; `stock-entry-filters.spec.ts` -> "AC-17: with every filter applied and with none…" |
| **AC-18 (screen half)** | the screen adds no money-shaped identifier | `count-entry-contract.test.ts` -> "AC-18: the permitted money-shaped names are an exact set of eight", plus the multiply/reduce/euro tests |
| AC-19 (page + action) | one `requireUser()` each, nothing read from a body | `stock-entry-autosave.spec.ts` -> "AC-19: nothing a client sets can change who is saving"; `stock-entry-contract.test.ts` -> "AC-4, 008 AC-19: each action obtains its actor with exactly one requireUser() call" |
| AC-20 (panel half) | `EntryFilters.tsx` | `stock-entry-filters.spec.ts` -> "AC-20: the three categories are built from the count's own lines" — order, sentinel last, counts summing to the whole count, `Kelly (14)` as the accessible name |
| AC-21 (browser half) | `filterEntryRows(live, selection)` | `stock-entry-filters.spec.ts` -> "AC-20, AC-21: OR within a category, AND across them, and the counts never renumber" — asserted against the facet's **own** displayed count |
| AC-22 | `replaceUrl` -> `history.replaceState`; the `<noscript>` GET form | `stock-entry-filters.spec.ts` -> the two "AC-22:" tests; `count-entry-contract.test.ts` -> "AC-22: replaceState, never pushState, and repeated parameters" |
| AC-23 | `showing-summary`, `filter-hiding`, `clear-filters`, `no-matching-lines` | `stock-entry-filters.spec.ts` -> "AC-23, AC-24, AC-25: a filter can never let a counter believe they have finished" |
| AC-24 (screen half) | `live` / `counted` in `CountSheet.tsx` | `stock-entry-quantities.spec.ts` -> "AC-24: the progress line moves as a number is typed, before the save is confirmed" (header still `Saving…`), and the byte-identical sentence under a filter in the filters spec |
| AC-25 | the five branches | `stock-entry-quantities.spec.ts` -> "AC-25: a countId that does not exist, and a count with no lines" + the read-only test + the no-JavaScript invalid-value case; filters spec for the no-match state |
| AC-26 (screen half) | every literal imported from `@/lib/count-messages` | `count-entry-contract.test.ts` -> "AC-26: the screen spells no literal of its own"; the e2e specs assert **from the module**, never from a re-typed string |
| AC-27 (rendered HTML) | typed errors only, `errorResponse` unchanged | `stock-entry-autosave.spec.ts` -> the `prisma`/`22003` scans on both the JSON bodies and `page.content()` |
| AC-30 | the stacked list, the sticky top bar, `scrollIntoView`, `type="text"` | `stock-entry-quantities.spec.ts` -> "AC-30: phone-first — 390 px, 320 px, the keyboard's 380 px, and Tab from the 81st" |
| AC-31 (screen half) | no `unitPrice` anywhere the screen adds | `count-entry-contract.test.ts` -> "AC-31: nothing the screen adds names a price column"; `project-contract.test.ts` unchanged and green; `snapshotsOf` asserted all-null in the AC-5 test |
| **AC-33 (specs half)** | three files, three reserved years | `stock-entry-contract.test.ts` -> "AC-30: every stock-entry spec owns one reserved year…" now asserts **7 files, 7 years**; each file's `afterAll` asserts `realCountIds()` and `seededMasterCounts()` are identical |
| AC-34 (browser half) | no lock, no version token | `stock-entry-quantities.spec.ts` -> "AC-34: two devices, one count — the last write wins and says so" |
| **AC-35** | `tests/e2e/stock-entry-start.spec.ts` | `git diff` on that file shows **one** changed assertion and nothing else; every other clause of 007 AC-24 passes unmodified |

### Verification output

Targeted commands only; the coordinator runs `init`.

```
npm run typecheck                                         -> exit 0
npm run lint                                              -> exit 0  (--max-warnings 0)
npm run test:unit                                         -> 37 files, 501 tests passed (23.9 s)
npx prisma validate                                       -> the schema is valid
git status --porcelain -- prisma Samples                  -> empty
npm run build                                             -> exit 0;  f /stock-entry/counts/[id]  4.39 kB

npx playwright test --project=chromium-stock-entry --no-deps      (run 1)
  61 passed (2.2m)          0 failed, 0 flaky, retries: 0, 3 workers
npx playwright test --project=chromium-stock-entry --no-deps      (run 2)
  61 passed (2.2m)          0 failed, 0 flaky, retries: 0, 3 workers

npm run test:db -- count-entry-service.db.test.ts route.db.test.ts count-service.db.test.ts
  3 files, 84 tests passed (338.7 s)
```

Two consecutive runs of the whole `chromium-stock-entry` project, `0 flaky` and `0 failed`
both times, at `retries: 0`, with `playwright.config.ts` byte-identical. The project went
from 34 tests to 61: **+27**, which is 12 + 6 + 9. `npm run test:db` was run once, with
nothing else in flight (checked with `Get-CimInstance Win32_Process`); nothing under
`src/server/` changed in Phase B, which is why three files rather than the whole suite.

### Deviations from the spec

1. **007's `AC-4: startCountAction obtains its actor with exactly one requireUser() call` is
   narrowed to each action's own body.** The spec's Contract puts `saveQuantitiesAction` in
   `src/app/stock-entry/actions.ts`, and that test counted `await requireUser()` over the
   **whole file** — so a second action made it fail by construction. It is now asserted per
   action, plus the number of exported actions in the file, which is **strictly stronger**:
   under the old spelling a third action with no `requireUser()` at all would have kept it
   green. This is the same narrowing 008 AC-28 already made to the mutation scan in the same
   file: name what is allowed, exactly, rather than widen a scan to a directory. The
   alternative — putting the action in a file of its own — would have kept 007 byte-identical
   at the cost of contradicting 008's Contract, and one service with two transports is the
   rule that matters here.
2. **The sheet is a stacked list (`<ul>`/`<li>`), not a `<table>`.** A five-column row
   (description, unit, input, *None held*, state) measures **413 CSS px** and AC-30 requires
   the document not to scroll sideways at **320**. Reproduced before changing it. 007 AC-28
   already asserts this exact route never scrolls sideways at 320 px, so this was not
   optional. `data-testid="count-line"`, `count-lines` and `count-quantity` are unchanged, so
   every shipped assertion about them still holds — including "an uncounted line's cell reads
   exactly `Not counted`", because the input contributes no `textContent`. The read-only
   branch of the page follows the same shape for the same reason.
3. **The *None held* button is `tabIndex={-1}`.** AC-30 requires the 82nd input to be
   "reachable by pressing `Tab` from the 81st"; a per-row button between them makes that two
   presses. The control is a redundant shortcut for typing `0` — a keyboard user types the
   zero — so it is removed from the tab order rather than the criterion being reinterpreted.
   Its accessible name is still exactly `None held` and it is still 44 x 44 CSS px.
4. **A filter option's 44 x 44 tap target is the `<label>`, not the `<input>`.** A native
   checkbox is about 13 px and cannot be resized without `appearance: none` and a hand-drawn
   tick. The label is what a tap actually lands on, which is what "tap target" means; the
   e2e measures the label's own bounding box.
5. **`CountSheet.tsx` and `EntryFilters.tsx` import three pure modules from
   `src/server/counts/`** — `parseQuantity`, `filterEntryRows`/`hiddenSummary` and the facet
   types. Phase A's note 3 established this deliberately: those modules touch no Prisma, no
   clock and no environment, the lint fence applies to `src/lib/**` rather than to components,
   and AC-7's "the client calls the same function" clause is unreachable otherwise.
6. **`onSubmit` prevents the form action rather than the button being wired separately.**
   React skips a form action whose submit event was already default-prevented, so one handler
   covers both *Save now* and the Enter key, and AC-11's "no `POST` to the page URL at any
   point in the JavaScript-enabled flow" is asserted directly by recording every `POST`.
7. **The e2e counts are seeded through Prisma and no assertion hard-codes 82.** The Dublin
   sheet is the user's own master — it currently holds **83** links — so every count is
   asserted against the number of lines the database really holds for it, and that number is
   asserted `>= 82`. `stock-entry-start.spec.ts` made and recorded the same choice in #7.

### Notes for the reviewer

1. **AC-13's recovery is tested, not just its failure.** The test drives a `500`, asserts the
   three typed values are still in their inputs with `Not saved` on each row and
   `3 changes not saved…` in the header, watches **two automatic retries arrive with no user
   action and the second gap longer than the first**, clicks *Retry now* and sees a send
   inside 1.5 s, then stops the failure and asserts the queue drains in **one batch of three**
   and every row returns to `saved`. That nothing reloaded is proved rather than asserted: a
   marker is written onto the JavaScript context after load and is still there at the end — a
   `location.reload()` would have built a new context and lost it. `framenavigated` is also
   recorded and never carries a URL other than the one the test started on.
2. **Nothing is ever removed from the queue on a failure, including a `4xx`.** The automatic
   backoff loop stops for a `4xx` (re-sending identical bytes would be refused identically),
   but the edits stay queued, the header keeps counting them and *Retry now* still sends. A
   value the counter typed is never silently discarded by any path.
3. **An invalid value is caught by the client's own `parseQuantity` and never queued.** The
   AC-7 sentence is rendered beside the row and every other row keeps its typed value — which
   is AC-25's requirement reached without a round trip. The same sentence on the
   no-JavaScript path is attributed to a row by the **action**, because
   `ValidationError.field` is `"quantity"` and names the column rather than the line (Phase
   A's note 4).
4. **The body of a `404` is #3's generic `Not Found`.** `errorResponse` flattens every
   `NotFoundError` that way and 008 AC-27 requires that file to be byte-identical, so the
   e2e asserts the status and the key set rather than the domain sentence. The sentences
   themselves (`That count no longer exists.`, `That item is not on this count.`) are
   asserted on the service in `count-entry-service.db.test.ts` and on the page.
5. **AC-18's permitted-identifier set is exact at eight, and the screen adds none of them.**
   `countedLineCount`, `defaultValue`, `hasPriceWarning`, `itemsWithoutPrice`,
   `itemsWithoutPriceMessage`, `lineCount`, `uncountedLineCount`, `value`. Five were already
   in the scanned trees before this feature; `value` is a DOM attribute and a facet option's
   own text. The spec says "a tenth name turns it red" and there are eight, with room for
   one. **This is why the typed text on the sheet lives in `quantities`/`typed` and never in
   `values`, and why `Object.values` appears nowhere** — those names match
   `/price|value|total|amount/i` and would have consumed the remaining headroom for no
   reason. Only five of the eight match the pattern at all, so the test asserts the offender
   set equals exactly those five and separately asserts the other three are present.
6. **Progressive enhancement is real, not assumed.** In a `javaScriptEnabled: false` context
   React renders `<form action="" method="POST">` with a hidden `$ACTION_REF_1`, all 83
   inputs carry their current values in the first response, *Save now* submits, both typed
   rows persist, the page re-renders with the new values and the updated progress line, and
   an invalid value re-renders with the AC-7 sentence beside the named row having persisted
   nothing. **The screen works in a yard with a dead JavaScript bundle.**
7. **The batching in AC-11 is made deterministic rather than left to Neon's latency.** The
   six-rows test holds the first response for one second through a route, so "a flush sends
   every pending edit in one batch" is the mechanism under test rather than a race. Without
   that hold the assertion would pass or fail on round-trip time, which is exactly the kind
   of thing that is `0 flaky` twice and red on the gate.
8. **The retry attempt counter is one per queue, not one per row.** Three blurred failures
   therefore start the automatic schedule several steps into `RETRY_BACKOFF_MS`, which is the
   point of a backoff rather than a defect — so the e2e asserts the *shape* (more attempts
   arrive unprompted, each waits longer than the last, the first gap >= 900 ms) and the unit
   contract pins the array's literal text.
9. **`src/app/api/error-response.ts`, `src/lib/auth-config.ts`, `src/middleware.ts`,
   `playwright.config.ts` and `prisma/` are all byte-identical**, and the only `loading.tsx`
   in the tree is `(public)`'s.

### Left to Phase C

- The **mutation proofs** (`docs/verification.md` Level 4): break each of the load-bearing
  behaviours in turn and show the named test goes red — at minimum, an empty input saved as
  `0`, a `0` rendered as blank, the queue emptied on failure, `pushState` for `replaceState`,
  the progress line computed over the filtered view, and the *None held* control returned to
  the tab order.
- The **no-DNS run** (AC-32): `prisma validate`, `typecheck`, `lint`, `test:unit` and `build`
  each exit `0` with every connection string pointing at a hostname that does not resolve,
  and both `init` scripts end with `[OK] Environment ready (database checks skipped)`.
- The **full gate** (AC-33): `./init.ps1` green with the database checks **executed**, and
  two consecutive full `npm run test:e2e` runs at `0 flaky` — the coordinator's, not an
  agent's. Expect **117 e2e tests** (90 + 27) and **501 unit tests**.
- The **final report** and the work-log close-out. **`#8` must not be marked `done` before
  the review.**

---

## Phase C — the mutation proofs, and the feature in one table

No new feature code. This phase breaks the load-bearing behaviours on purpose, records what
went red and why, and puts the three phases into one map. Every mutation was reverted and
the restore verified byte-for-byte with `cmp` plus a SHA-256 before and after (the one
exception is recorded under *What I could not prove*).

### The 35 criteria, mapped across the three phases

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | `src/app/api/counts/[id]/lines/route.ts:56` (outside the middleware matcher); the page inside it | `route.db.test.ts` -> "AC-1: a signed-out POST … is 401 JSON, with no Location header"; `stock-entry-autosave.spec.ts` -> "AC-1: a signed-out POST is a JSON 401, while the page for the same session is a 307"; `count-entry-contract.test.ts` -> "AC-1: the middleware gains no /api entry"; `stock-entry-contract.test.ts` -> "AC-3: no loading.tsx exists at or above src/app/stock-entry/" |
| AC-2 | `count-entry-service.ts:104` `assertUser`; `page.tsx:139` renders `CountSheet` for both roles | `count-entry-service.db.test.ts` -> the three "AC-2:" tests; `count-entry-contract.test.ts` -> "AC-2: … no role refusal and no yard predicate"; `stock-entry-quantities.spec.ts` -> "AC-2, AC-3, AC-35: both roles get one editable row per line…" |
| AC-3 | `CountSheet.tsx` renders `visible` with no pagination; nothing imports `listSheet` | `stock-entry-quantities.spec.ts` -> "AC-2, AC-3, AC-35: …" (rows = `quantity-input` = `count-quantity` = the database's own line count, >= 82); `count-entry-contract.test.ts` -> the three "AC-3:" tests |
| AC-4 | `CountSheet.tsx` `data-counted` + the `not-counted` span | `stock-entry-quantities.spec.ts` -> "AC-4: null and 0 differ in text and in an attribute, never in colour alone" |
| **AC-5** | `count-entry-service.ts:127` `data: { quantity }`; `CountSheet.tsx` `edit()` / `typedQuantity` | `count-entry-service.db.test.ts` -> the four "AC-5:" tests (`SELECT count(*) … IS NULL` moves by exactly one in each direction); `stock-entry-quantities.spec.ts` -> "AC-5, AC-24: a blank input is never saved as 0, and a 0 is never saved as blank". **Mutation 1 below.** |
| AC-6 | `CountSheet.tsx` `noneHeld()`, `tabIndex={-1}`, `min-h-11 min-w-11` | `stock-entry-quantities.spec.ts` -> "AC-6: None held is one tap, saves 0 with no debounce, and is silent on a row already at 0". Mutation 5 below was a FINDING at the end of Phase C and is **CLOSED in Phase D**: `posts[0].at - tappedAt < 400` now makes the debounced spelling fail at 871 ms. See *Review outcome*. |
| AC-7 | `src/server/counts/quantity-input.ts:46`; the client calls the same function before queueing | `quantity-input.test.ts` (13 tests); `count-entry-contract.test.ts` -> "AC-7: only quantity-input.ts declares the decimal pattern"; `stock-entry-quantities.spec.ts` -> the no-JavaScript invalid-value case |
| AC-8 | `count-entry-service.ts:124` `$transaction` | `count-entry-service.db.test.ts` -> the six "AC-8:" tests |
| AC-9 | `count-entry-service.ts:117` `status !== "DRAFT"`; `page.tsx:101` | `count-entry-service.db.test.ts` -> "AC-9: the refusal is a ConflictError…"; `route.db.test.ts` -> "AC-9: … is 409"; `stock-entry-quantities.spec.ts` -> "AC-9, AC-25: a count that is no longer a DRAFT is read-only, in the domain's words" |
| AC-10 | `route.ts:56`, `count-input.ts:173` | `route.db.test.ts` -> the eight "AC-10:" tests; `count-input.test.ts`; `stock-entry-autosave.spec.ts` -> "AC-10, AC-27: the endpoint's contract, on real HTTP" (the `405` needs real HTTP — it is Next's own answer) |
| AC-11 | `AUTOSAVE_DEBOUNCE_MS = 800`, the single-in-flight flush loop | `stock-entry-autosave.spec.ts` -> "AC-11: autosave fires on the events a counter produces…"; `count-entry-contract.test.ts` -> the `keepalive` / `online` binding test |
| AC-12 | the per-row revision map in `CountSheet.tsx` | `stock-entry-autosave.spec.ts` -> "AC-12: one row's response never rewrites another row's input" |
| **AC-13** | `RETRY_BACKOFF_MS`; `markFailed`, which removes nothing from the queue | `stock-entry-autosave.spec.ts` -> "AC-13, AC-27: a failed save keeps the number, backs off, and drains when the route recovers" and "AC-13: an aborted connection is the same answer…". **Mutation 2 below.** |
| AC-14 | the `online` listener | `stock-entry-autosave.spec.ts` -> "AC-14: signal drops in a yard, and the count survives it" |
| AC-15 | `src/lib/entry-queue.ts` + the restore effect | `entry-queue.test.ts` (20 tests); `stock-entry-autosave.spec.ts` -> "AC-15: a reload does not lose ten minutes of typing" |
| AC-16 | `saveQuantitiesAction` + the form's `onSubmit`; the route has no `db.` | `stock-entry-quantities.spec.ts` -> the two "AC-16:" tests; `count-entry-contract.test.ts` -> "AC-16: the action and the route handler both call saveQuantities and neither uses db." |
| **AC-17** | one shape, no `shapeForRole` on the save; nothing on the screen builds a price | `count-entry-service.db.test.ts` -> the three "AC-17:" tests; `route.db.test.ts` -> "AC-17: the parsed JSON body … zero monetary keys"; `count-service.db.test.ts` -> "AC-17: the staff value carries no monetary key at any depth, lines included"; `stock-entry-quantities.spec.ts` / `stock-entry-filters.spec.ts` -> the two "AC-17:" HTML walks. **Mutation 4 below.** |
| AC-18 | the screen adds no money-shaped identifier; the permitted set is exact at 8 | `count-entry-contract.test.ts` -> "AC-18: no money-shaped identifier reaches the service or the endpoint" and "AC-18: the permitted money-shaped names are an exact set of eight", plus the multiply/reduce/euro tests |
| AC-19 | `route.ts:63` and each action: one `requireUser()`, nothing read from a body | `route.db.test.ts` -> the two "AC-19:" tests; `stock-entry-autosave.spec.ts` -> "AC-19: nothing a client sets can change who is saving"; `stock-entry-contract.test.ts` -> "AC-4, 008 AC-19: each action obtains its actor with exactly one requireUser() call" |
| **AC-20** | `entry-filters.ts:80` `buildEntryFacets`; `EntryFilters.tsx` | `entry-filters.test.ts` -> the four "AC-20:" tests; `count-entry-service.db.test.ts` -> "AC-20: a line carries the supplier and the type"; `stock-entry-filters.spec.ts` -> "AC-20: the three categories are built from the count's own lines". **Mutation 3 below (the progress line).** |
| AC-21 | `entry-filters.ts:143` `filterEntryRows` | `entry-filters.test.ts` -> the seven "AC-21:" tests; `stock-entry-filters.spec.ts` -> "AC-20, AC-21: OR within a category, AND across them, and the counts never renumber" |
| AC-22 | `entry-filters.ts:117` `parseFilterSelection`; `replaceUrl` -> `history.replaceState`; the `<noscript>` GET form | `entry-filters.test.ts` -> the five "AC-22:" tests; `stock-entry-filters.spec.ts` -> the two "AC-22:" tests; `count-entry-contract.test.ts` -> "AC-22: replaceState, never pushState, and repeated parameters" |
| AC-23 | `entry-filters.ts:165` `hiddenSummary`; `showing-summary`, `filter-hiding`, `clear-filters`, `no-matching-lines` | `entry-filters.test.ts` -> the four "AC-23:" tests; `count-messages.test.ts` -> "008 AC-23: showing and hiding…"; `stock-entry-filters.spec.ts` -> "AC-23, AC-24, AC-25: a filter can never let a counter believe they have finished" |
| **AC-24** | `count-entry-service.ts:146`; `live` / `counted` in `CountSheet.tsx`, over the WHOLE count | `count-entry-service.db.test.ts` -> "AC-24: one line holding 0 makes a Dublin count 1 of 82 counted"; `stock-entry-quantities.spec.ts` -> "AC-24: the progress line moves as a number is typed, before the save is confirmed"; `stock-entry-filters.spec.ts` -> the byte-identical sentence under a filter. **Mutation 3 below.** |
| AC-25 | the five branches of the page and the sheet | `stock-entry-quantities.spec.ts` -> "AC-25: a countId that does not exist, and a count with no lines", the read-only test and the no-JavaScript invalid-value case; `stock-entry-filters.spec.ts` for the no-match state |
| AC-26 | `src/lib/count-messages.ts`; every screen literal imported from it | `count-messages.test.ts` -> the eight 008 tests; `count-entry-contract.test.ts` -> "AC-26: the screen spells no literal of its own"; `tests/unit/lint-fence.test.ts` unchanged and green |
| AC-27 | typed errors only; `src/app/api/error-response.ts` byte-identical | `count-entry-service.db.test.ts` -> "AC-27: six provoked failures…"; `route.db.test.ts` -> "AC-27: no refusal body carries a driver or a Postgres string"; `stock-entry-autosave.spec.ts` -> the `prisma`/`22003` scans on the JSON bodies and on `page.content()` |
| AC-28 | `tests/unit/stock-entry-contract.test.ts` | -> "AC-25, 008 AC-28: no update, upsert or delete except in the one exempt file" and "008 AC-28: the exempt file writes one column of one model" |
| AC-29 | no schema change; string arithmetic only | `count-entry-contract.test.ts` -> the four "AC-29:" tests; `count-entry-service.db.test.ts` -> "AC-29: quantities round-trip at full precision" |
| AC-30 | the stacked list, the sticky top bar, `scrollIntoView`, `type="text"`, `tabIndex={-1}` | `stock-entry-quantities.spec.ts` -> "AC-30: phone-first — 390 px and 320 px filtered and not, the keyboard's 380 px, and Tab from the 81st". **Phase D** adds the filtered measurement at both widths and states why "panel open and closed" has no second case. |
| AC-31 | nothing added names the price column | `tests/unit/project-contract.test.ts` unchanged and green (the nine-file list intact); `count-entry-contract.test.ts` -> "AC-31: nothing the screen adds names a price column"; `count-entry-service.db.test.ts` -> "AC-31: every line this feature writes still has no price snapshot"; `snapshotsOf` asserted all-null in the AC-5 e2e |
| AC-32 | `force-dynamic` on the page and the route; no module opens a connection at import time | **PROVED, by two hands.** The reviewer ran `prisma validate` / `typecheck` / `lint` / `test:unit` / `build` with all four connection strings at `no-such-host.invalid` (all exit 0); the coordinator then ran **both `init` scripts** in the same condition, each exiting 0 on the skipped branch. Transcript in *Review outcome*. |
| AC-33 | three new e2e specs, three reserved years (2095 / 2096 / 2097), each self-cleaning | `stock-entry-contract.test.ts` -> "AC-30: every stock-entry spec owns one reserved year…" now asserts **7 files, 7 years**; each spec's `afterAll` asserts `realCountIds()` and `seededMasterCounts()` are unchanged. The full gate is the coordinator's. |
| AC-34 | no lock, no version token anywhere | `count-entry-service.db.test.ts` -> the two "AC-34:" tests; `stock-entry-quantities.spec.ts` -> "AC-34: two devices, one count — the last write wins and says so" |
| AC-35 | `tests/e2e/stock-entry-start.spec.ts` | `git diff` on that file shows **one** changed assertion and nothing else; every other clause of 007 AC-24 passes unmodified |

### Mutation proofs — `docs/verification.md` Level 4

Method for each: SHA-256 the file, apply the mutation, `npm run build` when the mutation is
in client code (the e2e project serves `npm run start`, a real production build), run the
named test, restore from a byte copy, then `cmp` **and** compare the SHA-256. Every restore
below is byte-identical.

#### Mutation 1a — AC-5. `saveQuantities` treats an empty input as `0`

The single most damaging plausible bug in this application: it silently converts *nobody
looked* into *counted, none held*, which is exactly the workbook defect this product exists
to remove.

```diff
- byItem.set(edit.itemId, parseQuantity(edit.quantity));
+ byItem.set(edit.itemId, parseQuantity(edit.quantity) ?? "0");
```

`npm run test:db -- src/server/counts/count-entry-service.db.test.ts -t "AC-5"` — **3 failed, 1 passed**:

```
FAIL  AC-5: clearing a row stores NULL, not 0, and the null count rises by exactly one
      count-entry-service.db.test.ts:157   expect(stored).toBeNull()
      - Expected: null
      + Received: "0"

FAIL  AC-5: the two are distinguishable by IS NULL, which is the whole feature
      count-entry-service.db.test.ts:170
      SELECT count(*) AS n FROM "StockCountLine" WHERE quantity = 0
      - Expected 1   + Received 2

FAIL  AC-5, AC-24: `0` counts as counted and clearing it decrements the progress
      count-entry-service.db.test.ts:183   expect(cleared.countedLineCount).toBe(0)
      - Expected 0   + Received 1
```

The `IS NULL` assertion is asked of Postgres itself, not of TypeScript, and it is the one
that fails. Restored: `cmp` identical, `sha256 d2a47984…f71ad7` before and after.

#### Mutation 1b — AC-5, the other direction. A `0` renders as a blank input

```diff
- Object.fromEntries(lines.map((line) => [line.itemId, line.quantity ?? ""])),
+ Object.fromEntries(lines.map((line) => [line.itemId, line.quantity === "0" ? "" : (line.quantity ?? "")])),
```

`npx playwright test tests/e2e/stock-entry-quantities.spec.ts --project=chromium-stock-entry --no-deps -g "AC-5"`:

```
1) AC-5, AC-24: a blank input is never saved as 0, and a 0 is never saved as blank
   expect(locator).toHaveText failed
   Locator:  getByTestId('counted-summary')
   Expected: "1 of 83 counted"
   Received: "0 of 83 counted"
   stock-entry-quantities.spec.ts:259   // On reload the sentence is rendered by the SERVER
```

The round trip is what catches it: the value is written correctly and read back wrongly, so
only the assertion made **after `page.reload()`** can see it. A second test independently
turns red on the same mutation:

```
1) AC-4: null and 0 differ in text and in an attribute, never in colour alone
   stock-entry-quantities.spec.ts:178   expect(zeroed).toHaveAttribute("data-counted", "true")
```

Restored: `cmp` identical, `sha256 bf9c17c7…dfd8b2`.

#### Mutation 2a — AC-13. The failure path drops the edit instead of retrying

```diff
+ putQueue(dropConfirmed(queueRef.current, failedBatch.map((e) => e.itemId)));
- if (retryable) scheduleRetry(() => void flush());
+ void retryable;
```

`-g "AC-13"` — **both AC-13 tests failed**, and so did AC-14 and AC-15 when run under the
same mutation. The recovery test dies at the queue-count assertion:

```
1) AC-13, AC-27: a failed save keeps the number, backs off, and drains when the route recovers
   Locator:  getByTestId('save-status')
   Expected: "3 changes not saved. They will be sent when the connection returns."
   Received: "All changes saved"
   stock-entry-autosave.spec.ts:491

2) AC-13: an aborted connection is the same answer, and it recovers the same way
   Expected: "1 change not saved. It will be sent when the connection returns."
   Received: "All changes saved"          stock-entry-autosave.spec.ts:569

3) AC-14: signal drops in a yard, and the count survives it        :605
4) AC-15: a reload does not lose ten minutes of typing             :662
```

Stated honestly: the assertion that fires is the header's count of queued edits, not the
later `expect(drained[0].edits).toHaveLength(3)` — Playwright stops a test at its first
failed assertion, so the drain assertions are never reached under this mutation. What is
proved is that the **recovery test** goes red, and that it does so because the edits are
gone. The drain assertions are exercised live by the shipped green run, not by this
mutation. Restored: `cmp` identical, `sha256 bf9c17c7…dfd8b2`.

#### Mutation 2b — AC-13. The failure path calls `location.reload()`

```diff
- if (retryable) scheduleRetry(() => void flush());
+ if (retryable) window.location.reload();
```

```
1) AC-13, AC-27: a failed save keeps the number, backs off, and drains when the route recovers
   expect(received).toBeGreaterThan(expected)
   Expected: > 1132
   Received:   335
   stock-entry-autosave.spec.ts:509   expect(gaps[1]).toBeGreaterThan(gaps[0]);
```

A reload loop re-sends at the page's own cadence rather than backing off, and the backoff
assertion is what sees it first. The second AC-13 test — the aborted connection — **passed**
under this mutation, because `localStorage` restores its single edit and *Retry now* still
recovers it; that test does not claim to detect a reload, but the reviewer should know which
of the two is load-bearing here.

To show that the `__macroadsNeverReloaded` marker is itself load-bearing and not decoration,
a second variant reloads **once** and then behaves as shipped, so the backoff shape survives:

```diff
+ if (retryable && window.sessionStorage.getItem("__mutant2b") === null) {
+   window.sessionStorage.setItem("__mutant2b", "1");
+   window.location.reload();
+   return;
+ }
  if (retryable) scheduleRetry(() => void flush());
```

```
1) AC-13, AC-27: a failed save keeps the number, backs off, and drains when the route recovers
   Error: the failure path reloaded the document
   expect(received).toBe(expected)   Expected: true   Received: false
   stock-entry-autosave.spec.ts:523
```

The marker fires, with its own message. Restored: `cmp` identical, `sha256 bf9c17c7…dfd8b2`.

#### Mutation 3 — AC-20, AC-24. Progress counts only the filtered rows

```diff
- const counted = live.filter((line) => line.quantity !== null).length;
+ const counted = visible.filter((line) => line.quantity !== null).length;
- {countedSummary(counted, lines.length)}
+ {countedSummary(counted, visible.length)}
```

```
1) AC-23, AC-24, AC-25: a filter can never let a counter believe they have finished
   Locator:  getByTestId('counted-summary')
   Expected: "0 of 83 counted"
   Received: "0 of 11 counted"
   stock-entry-filters.spec.ts:332
   // The progress line is about the whole count and is byte-identical under the filter.
```

That is the criterion's whole point: a progress line that renumbers under a filter is how a
count gets submitted half done. Restored: `cmp` identical, `sha256 bf9c17c7…dfd8b2`.

#### Mutation 4a — the money boundary. A `currentPrice` on the staff line shape

007 AC-14 and `specs/domain-model.md` Part 6 Invariant 12. The field was declared
**optional** so that `npm run typecheck` stays at exit 0 — the point is that the runtime
scan catches it when the type system does not.

```diff
  typeName: line.item.itemType.name,
+ currentPrice: null,
```

`npm run typecheck` -> **exit 0**. `npm run test:db … -t "AC-17"` -> **2 failed**:

```
FAIL  count-service.db.test.ts > getCount >
      AC-17: the staff value carries no monetary key at any depth, lines included
      Error: getCount(YARD_STAFF) carries monetary keys a YARD_STAFF session must never be
      sent: currentPrice, currentPrice, currentPrice, … (one per line, 83 of them)
      assertNoMoneyKeys   src/lib/money-boundary.ts:57

FAIL  count-entry-service.db.test.ts >
      AC-17: getCount stays role-shaped after #8 adds two fields to a line
      expected [ 'currentPrice', 'currentPrice', 'currentPrice', 'currentPrice' ] to deeply equal []
```

Both #7's shipped walk and #8's own walk fire. Restored — see *What I could not prove* for
the one caveat on this file.

#### Mutation 4b — the money boundary. A running total on the save response

```diff
+ const runningTotal = stored.length.toFixed(2);
  return {
+   runningTotal,
    countId: count.id,
```

`npm run typecheck` -> **exit 0** again: TypeScript does not refuse the extra key here.
Three independent nets catch it instead.

`npx vitest run tests/unit/count-entry-contract.test.ts` -> **3 failed**:

```
FAIL  AC-18: no money-shaped identifier reaches the service or the endpoint
      AssertionError: runningTotal is not a permitted money-shaped name
FAIL  AC-18: the permitted money-shaped names are an exact set of eight
      AssertionError: runningTotal is not a permitted money-shaped name
FAIL  AC-29: nothing on the quantity path converts through a JavaScript number
      count-entry-service.ts: expected source not to contain 'toFixed'
```

`npm run test:db … -t "AC-17"` -> **3 failed**:

```
FAIL  count-entry-service.db.test.ts > AC-17: a staff actor's result carries no monetary key at any depth
FAIL  count-entry-service.db.test.ts > AC-17: the two roles receive deeply equal bodies for the identical request
FAIL  route.db.test.ts             > AC-17: the parsed JSON body of a staff response reports zero monetary keys
      all three: expected [ 'runningTotal' ] to deeply equal []
```

A source scan at the identifier, a deep-key walk on the service result, and a deep-key walk
on the parsed HTTP body. It is not possible to add a total here quietly. Restored: `cmp`
identical, `sha256 d2a47984…f71ad7`.

#### Mutation 5 — AC-6. *None held* debounces like a typed value

```diff
- // No debounce. A tap is a decision, not a keystroke somebody is still making.
- edit(itemId, "0", true);
+ edit(itemId, "0", false);
```

**THIS MUTATION DID NOT TURN ANYTHING RED. It was a finding, not a proof.**
*(Reproduced by the reviewer, then closed in Phase D — the same mutation now fails at
`stock-entry-quantities.spec.ts:308`. See `## Review outcome`.)*

```
npx playwright test … -g "AC-6"                       ->  1 passed (15.4s)
npx playwright test --project=chromium-stock-entry    -> 61 passed (1.7m)
npx vitest run                                        -> 37 files, 501 tests passed
```

The whole suite is green with the tap debounced by 800 ms. The reason is in the test:

```ts
await control.click();
await settled(page);                 // waits up to 20 s for "All changes saved"
// ONE post, and it happened without waiting out the debounce: a tap is a decision.
expect(posts).toHaveLength(1);
```

`settled()` waits for the resting state, so a debounced tap still produces exactly one
`POST` and a count assertion cannot tell the two apart. The comment claims a timing property
that no assertion makes. The *silent on a row already at 0* half of AC-6 is genuinely tested
— the early return is independent of the debounce — but the *no debounce* half is not. Per
the working rules this is reported rather than patched: whether AC-6 needs a timing
assertion (the obvious one being that the `POST` arrives within, say, 300 ms of the click,
which an 800 ms debounce cannot satisfy) is the reviewer's call. Restored: `cmp` identical,
`sha256 bf9c17c7…dfd8b2`.

### The three Phase B decisions, argued

A reviewer reading the diff cold would otherwise read these as arbitrary.

1. **The sheet is a stacked list (`<ul>`/`<li>`), not a `<table>`.** Reproduced before it was
   changed: a five-column row — description, unit, input, *None held*, state — measures
   **413 CSS px**, and 007 AC-28 already asserts that this exact route does not scroll
   sideways at **320 px**. The choice was therefore not a preference between two layouts; the
   table fails a shipped criterion of the previous feature. `data-testid="count-line"`,
   `count-lines` and `count-quantity` are unchanged, so every shipped assertion about them
   still holds — including 007's "an uncounted line's cell reads exactly `Not counted`",
   because an `<input>` contributes no `textContent`. The read-only branch of the page
   follows the same shape for the same reason.
2. **The *None held* button is `tabIndex={-1}`.** AC-30 requires the 82nd input to be
   reachable by pressing `Tab` from the 81st. A per-row button sitting between them makes
   that two presses, so either the control leaves the tab order or the criterion gets
   reinterpreted. The control is a redundant shortcut for typing `0` — a keyboard user types
   the zero and loses nothing — so the control left the tab order. Its accessible name is
   still exactly `None held` and its tap target is still 44 x 44 CSS px, both asserted.
3. **Progressive enhancement is proved in a real `javaScriptEnabled: false` context, not
   assumed from the presence of a `<form>`.** In that context React renders
   `<form action="" method="POST">` with a hidden `$ACTION_REF_1`, all 83 inputs carry their
   current values in the first response, *Save now* submits, both typed rows persist, the
   page re-renders with the new values and the updated progress line, and an invalid value
   re-renders with the AC-7 sentence beside the named row having persisted nothing. A
   `<noscript>` block that has never been executed is not a claim anyone should accept; this
   one has been executed.

### The two narrowings of shipped tests, each strictly stricter

1. **007 `AC-4: startCountAction obtains its actor with exactly one requireUser() call`.**
   It counted `await requireUser()` over the **whole file**, and 008's Contract puts
   `saveQuantitiesAction` in that same file — so a second action made the test fail by
   construction. It is now asserted **per action body**, plus the number of exported actions
   in the file. That is stronger, not weaker: under the old spelling a third action with no
   `requireUser()` at all would have kept the file's count at one and stayed green; under the
   new one it turns red twice, once for the missing call and once for the action count. It is
   also the same shape of narrowing 008 AC-28 makes to the mutation scan in the same file —
   name exactly what is allowed rather than widen a scan to a directory. The alternative,
   putting the action in a file of its own, would have kept 007 byte-identical at the cost of
   contradicting 008's Contract; one service with two transports is the rule that matters.
2. **AC-18's permitted-identifier set is EXACT and stands at 8.** `countedLineCount`,
   `defaultValue`, `hasPriceWarning`, `itemsWithoutPrice`, `itemsWithoutPriceMessage`,
   `lineCount`, `uncountedLineCount`, `value`. Five were already in the scanned trees before
   this feature; `value` is a DOM attribute and a facet option's own text. **The screen adds
   none of them.** The spec says "a tenth name turns it red" and there are eight, so there is
   headroom for exactly one — which is why the typed text lives in `quantities`/`typed` and
   never in `values`, and why `Object.values` appears nowhere on this screen. An exact set is
   stricter than a permitted prefix or a directory-level exemption: mutation 4b above added
   one identifier and the set named it, in two separate tests, on a tree TypeScript had
   already passed.

### What I could not prove

1. **AC-32, the no-DNS run.** *(CLOSED in Phase D — the reviewer ran the five commands and
   the coordinator ran both `init` scripts; transcript under `## Review outcome`.)* It needs
   `./init.ps1` and `bash ./init.sh` end to end, which
   this session's working rules reserve to the coordinator. The preconditions are in place
   and individually checked — the page and the route both declare
   `export const dynamic = "force-dynamic"`, no module this feature adds opens a connection
   at import time, and `npm run test:unit` needs no database — but the criterion's own
   sentence, both scripts ending `[OK] Environment ready (database checks skipped)`, is
   unverified by me.
2. **AC-33, the full gate.** `./init.ps1` with the database checks executed, and two
   consecutive full `npm run test:e2e` runs at `0 flaky`, are the coordinator's. Expect
   **117 e2e** and **501 unit**.
3. **AC-6's "no debounce" clause is not tested.** See mutation 5. Reported, not patched.
   *(CLOSED in Phase D, at the reviewer's instruction: the clause now has an assertion and
   the mutation has been seen to fail it.)*
4. **One restore is verified by content rather than by bytes.**
   `src/server/counts/count-service.ts` was mutated for mutation 4a before I had taken a byte
   copy of it, so its restore was done by removing the one inserted line rather than by `cp`
   + `cmp`. Its **content** is proved restored — `git diff` on that file shows exactly the
   two Phase A hunks (the `supplier` / `itemType` selects, and the two line fields) and
   nothing else, and the three `*.db.test.ts` files that exercise it are green — but its
   on-disk **line endings** may have changed from CRLF to LF, which I cannot establish either
   way. This repository's working tree is already mixed (32 CRLF and 78 LF among tracked
   files under `src/`, including files both touched and untouched this session),
   `.gitattributes` declares `* text=auto` and `core.autocrlf` is `true`, so the committed
   blob is LF regardless and `git diff` is byte-for-byte unaffected. It is recorded here
   because "verify the restore byte-identically" was the instruction and this one file falls
   short of it.

### Verification output — the restored tree

Targeted commands only; the coordinator runs `init`. Run after the last revert, with
`grep -rn MUTANT src/ tests/` returning nothing.

```
sha256 / cmp, all six byte-copied files vs the copies taken before Phase C:
    IDENTICAL  src/server/counts/count-entry-service.ts
    IDENTICAL  src/components/stock-entry/CountSheet.tsx
    IDENTICAL  src/lib/entry-queue.ts
    IDENTICAL  src/app/stock-entry/counts/[id]/page.tsx
    IDENTICAL  src/server/counts/count-shape.ts
    IDENTICAL  src/types/stock-count.ts

npm run typecheck                                              -> exit 0
npm run lint                                                   -> exit 0  (--max-warnings 0)
npm run build                                                  -> exit 0
npx vitest run                                                 -> 37 files, 501 tests passed (11.2 s)
npx playwright test --project=chromium-stock-entry --no-deps   -> 61 passed (1.7m), 0 flaky, retries: 0
npm run test:db -- count-entry-service.db.test.ts
                   count-service.db.test.ts
                   api/counts/[id]/lines/route.db.test.ts      -> 3 files, 84 tests passed (164.9 s)

git status --porcelain      -> the same modified and untracked paths as before Phase C,
                               and no stray file of any kind
```

`npm run test:db` was run with nothing else in flight, checked with
`Get-CimInstance Win32_Process` before each invocation. The Neon test branch did not degrade
during this session.

### Deviations from the spec — Phase C

None. Phase C wrote no feature code.

### Notes for the reviewer — Phase C

1. **Mutation 5 is the one thing in this feature that a green suite does not actually
   defend.** Everything else on the spec's load-bearing list was broken and seen to go red
   for the right reason. AC-6's timing clause was not.
2. **TypeScript caught neither money mutation.** 4a had to be declared optional to keep
   `typecheck` at exit 0, but 4b needed no such help — an extra key on the object returned
   from inside the `$transaction` callback passes `tsc` unremarked. The runtime deep-key
   walks and the source scan are what hold that boundary, which is an argument for keeping
   all three rather than any one of them.
3. **The restore discipline is `cmp` plus SHA-256**, the same method #7's implementer used
   and #7's reviewer checked. The single exception is named above rather than glossed.
4. **`#8` is not `done`.** The gate is the coordinator's and the sign-off is the reviewer's.

---

## Review outcome

**Verdict:** `CHANGES_REQUESTED` (`progress/review_stock_entry_ui.md`) — two required changes
owed by me, both in `tests/e2e/stock-entry-quantities.spec.ts`, and a third owed by the
coordinator. **No production code changed in this phase.** The design, the three Phase B
decisions and both narrowings of shipped tests were upheld; the reviewer also restored its own
mutations to the *same* SHA-256 values recorded in Phase C
(`count-entry-service.ts` `d2a47984…f71ad7`, `CountSheet.tsx` `bf9c17c7…dfd8b2`).

### Files modified in Phase D

- `tests/e2e/stock-entry-quantities.spec.ts` — AC-6 gains a timing assertion; AC-30 gains the
  filtered no-sideways-scroll measurement and a written reason why "panel open and closed" has
  no second case. Nothing else in the file changed.
- `docs/architecture.md` — the `components/ → server/` edge is now written down as a named,
  narrow exception (Observation 1; see *Observations, acted on and not* below).

### Required change 1 — AC-6's "no debounce" clause now has an assertion, and it has been seen failing

Option **(a)**, the reviewer's stronger one. The recorder now keeps the moment of each save,
the tap's own moment is captured immediately before the click, and the bound is asserted from
those two numbers — so `settled(page)`, which waits up to 20 s for the resting state, can no
longer hide a debounced save:

```ts
const posts: { at: number; url: string }[] = [];
page.on("request", (request) => {
  if (request.method() === "POST" && request.url().includes("/api/counts/")) {
    posts.push({ at: Date.now(), url: request.url() });
  }
});
…
const tappedAt = Date.now();
await control.click();
…
await settled(page);
expect(posts).toHaveLength(1);
expect(posts[0].at - tappedAt).toBeLessThan(400);   // :308
```

Why (a) rather than (b): the timestamp is recorded when the request leaves, so the assertion
is independent of *when* it is evaluated, and the test spends no extra wall-clock time. The
400 ms bound sits between "immediate" (the test passes, repeatedly) and the
`AUTOSAVE_DEBOUNCE_MS = 800` that a debounced tap must wait out.

**The mutation proof — the same mutation, now red.** Method as in Phase C: SHA-256, byte copy
to the scratchpad, mutate, `npm run build` (the e2e project serves a real production build),
run, restore by `cp`, `cmp` **and** SHA-256, rebuild, re-run.

```diff
  src/components/stock-entry/CountSheet.tsx:397
- edit(itemId, "0", true);
+ edit(itemId, "0", false);
```

```
sha256 before            bf9c17c7c615153d73a313e7afa4b525e3cd5dd13152d616ce5feb6cd2fdf8b2
npm run build (mutant)   -> exit 0

npx playwright test tests/e2e/stock-entry-quantities.spec.ts
    --project=chromium-stock-entry --no-deps -g "AC-6"

  x  1 [chromium-stock-entry] › …:262:5 › AC-6: None held is one tap, saves 0 with no
     debounce, and is silent on a row already at 0 (5.7s)

    Error: expect(received).toBeLessThan(expected)
    Expected: < 400
    Received:   871

    > 308 |   expect(posts[0].at - tappedAt).toBeLessThan(400);
  1 failed
```

871 ms against a 400 ms bound — the mutant misses by 471 ms, which is also the headroom this
assertion has on the green side before a slow machine could flake it. Restored and
re-verified:

```
cp scratchpad/CountSheet.tsx.orig -> src/components/stock-entry/CountSheet.tsx
cmp                      -> identical
sha256 after             bf9c17c7c615153d73a313e7afa4b525e3cd5dd13152d616ce5feb6cd2fdf8b2
grep -n 'edit(itemId, "0"' -> 397:      edit(itemId, "0", true);
npm run build (restored) -> exit 0

npx playwright test … -g "AC-6|AC-30"
  ok 1 … AC-6: None held is one tap, saves 0 with no debounce… (6.3s)
  ok 2 … AC-30: phone-first — 390 px and 320 px filtered and not… (3.9s)
  2 passed (18.0s)
```

### Required change 2 — AC-30 is now measured with a filter applied, at 390 px and 320 px

After the two unfiltered measurements, the test selects a **supplier facet that really hides
rows** (chosen from the panel's own `data-count`, asserted to exist and to be `< lineCount`,
so the run cannot silently degrade into another unfiltered measurement), asserts the three
extra elements are on screen — `showing-summary`, `filter-hiding`, `clear-filters` — and then
re-runs the same `overflow()` helper at **390 px and 320 px**, with the width in the failure
label. The test name now reads *"390 px and 320 px filtered and not"*.

The "panel open and closed" clause is now answered in the test rather than left silent:

```ts
// WHY "with the filter panel open and closed" IS NOT A SECOND CASE HERE.
// `src/components/stock-entry/EntryFilters.tsx` renders no collapse control — no
// `<details>`, no toggle button — so the panel is always open and therefore always in its
// widest state, which is the state every measurement in this test is taken against. There
// is no closed state to measure; the clause is satisfied by construction, not skipped.
```

**Non-vacuity, checked rather than assumed.** A new measurement that has never been seen fail
is the same defect this review was about, so I mutated the *test* (not the product): a
`900 px` element appended to `document.body` immediately before the filtered measurement.

```
  Error: filtered at 390 px
  expect(received).toBeLessThanOrEqual(expected)
  Expected: <= 390
  Received:    900
  > 734 |     expect(filtered.scroll, `filtered at ${String(width)} px`)…
  1 failed
```

The probe was reverted and verified: `cmp` identical, `sha256 fca98330…eab0124e`,
`grep -c "wide.style.width"` → `0`, and the test green again (`1 passed (13.6s)`). The
assertion is live, and its label names the width that failed.

### Required change 3 — AC-32's `init` half (the coordinator's, recorded here)

With `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointing at
`no-such-host.invalid`:

```
bash ./init.sh   -> exit 0
./init.ps1       -> exit 0
   [skip] database unreachable at no-such-host.invalid - database-dependent checks skipped
   [OK] Environment ready (database checks skipped)
   (105 e2e skipped, the database-free specs still ran)
```

Together with the reviewer's five commands in the same condition (`prisma validate`,
`typecheck`, `lint`, `test:unit`, `build` — all exit 0), AC-32 is now evidenced end to end by
two independent hands, and the AC table above is updated accordingly.

### Observations, acted on and not

1. **`components/ → server/` is a new dependency edge — ACTED ON.** `docs/architecture.md`
   now carries the edge in its arrow list and a named exception beneath it, dated and
   attributed to #8, in the same shape as #5's `lib → @/server/errors` paragraph: what it
   permits (a pure shared **rule**), what it still forbids (`PrismaClient`, `@/server/db`,
   anything reaching a database, a clock or the environment), why the spec's Contract forces
   it (AC-7 is only guaranteed if the browser and the server call the *same* function), the
   exact identifiers imported, that it is **not** ESLint-enforced, and what to do if a third
   such module appears (move them all to `src/lib/` rather than widen the paragraph). The
   reviewer's point was that recording it in a review is not the same as writing it where the
   next implementer reads it — and the edge is #8's, so leaving the sentence to #9 would have
   been leaving my own mess for someone else. `tests/unit/lint-fence.test.ts`, the only test
   that reads that document, is green (23 tests).
   **Not done:** an ESLint rule enforcing the narrow edge, and moving the two modules into
   `src/lib/`. The first is new machinery the reviewer did not ask for and would touch the
   fence config #6 stabilised; the second is production code, which this phase is forbidden to
   change, and it contradicts the spec's Contract, which names `src/server/counts/` as their
   home. Both belong to #9, with a spec sentence behind them.
2. **`tabIndex={-1}` makes *None held* unreachable by keyboard — NOT ACTED ON, deliberately.**
   Changing it is production code and would break AC-30's "one `Tab` from the 81st to the
   82nd", which is a shipped assertion. It is an open question for #9 (a roving `tabIndex`, or
   arrow-key reachability, would give both), not a change to smuggle into a test-only phase.
3. **AC-3's archived/unassigned-line clause is inherited — NOT ACTED ON.** Asserting it needs
   a *fixture* that seeds a line whose `ItemLocation` link was later removed — new code in
   `tests/e2e/support/stock-entry.ts` plus another count — which is a new test surface rather
   than the closing of a required change. The reviewer marked it cheap to add to #9's fixture
   and I agree that is where it belongs; it is repeated here so it does not evaporate.
4. **AC-33's second consecutive full `npm run test:e2e` — NOT MINE.** The gate is the
   coordinator's under this session's working rules.
5. **The no-JS path rewrites every rendered row — NOT ACTED ON.** It is behaviour, not a test
   gap, it is consistent with AC-34's last-write-wins, and changing it is production code. It
   is a sentence #9's spec should carry if the no-JS path survives into submission.

### Verification output — Phase D

Targeted only; no gate and no full `npm run test:e2e` (the coordinator's), and `Win32_Process`
checked for `run-db-tests.mjs` before any run that touches the database — nothing was in
flight.

```
npm run typecheck                                         -> exit 0
npm run lint  (--max-warnings 0)                          -> exit 0
npx vitest run                                            -> 37 files, 501 tests passed (11.3 s)
npx vitest run tests/unit/lint-fence.test.ts              -> 23 tests passed
npm run build (mutant / restored)                         -> exit 0, exit 0
npx playwright test … -g "AC-6"     (fix, clean tree)     -> 1 passed (16.3 s)
npx playwright test … -g "AC-30"    (fix, clean tree)     -> 1 passed (13.4 s)
npx playwright test … -g "AC-6"     (mutant, after fix)   -> 1 FAILED at :308, 871 ms vs 400
npx playwright test … -g "AC-6|AC-30" (restored)          -> 2 passed (18.0 s)
npx playwright test … -g "AC-30"    (overflow probe)      -> 1 FAILED, "filtered at 390 px"
npx playwright test … -g "AC-30"    (probe reverted)      -> 1 passed (13.6 s)
git status --porcelain                                    -> the state I found, plus no new
                                                             untracked file
rm -rf test-results                                       -> Playwright artifacts (gitignored)
```

### Deviations from the spec — Phase D

None. Phase D changed two tests and one document: no feature code, no schema, no migration,
`prisma/` byte-identical, `Samples/` untouched.

### Notes for the reviewer — Phase D

1. **Both new assertions have been seen to fail for the right reason**, which was the point of
   the two required changes. AC-6's fails against the real product mutation at 871 ms;
   AC-30's fails against an injected 900 px element, because there is no product mutation for
   "the filtered page overflows" that does not amount to shipping a broken layout.
2. **The 400 ms bound is a choice.** It is half the 800 ms debounce and far above the observed
   immediate send. A tighter bound (300 ms, as Phase C mused) buys nothing and would be the
   first thing to flake on a loaded machine; a looser one approaches the constant it exists to
   distinguish from.
3. **`docs/architecture.md` is the only non-test file Phase D touched.** If the reviewer holds
   that the document belongs to #9 despite the edge being #8's, that paragraph is one revert
   away and nothing depends on it.
4. **`#8` is still `in_progress`.** Marking it `done` is not mine.
