# Review — feature 8 `stock_entry_ui`

**Verdict:** CHANGES_REQUESTED
**Spec:** `specs/features/008-stock_entry_ui.md` (35 criteria)
**init:** green — **on the coordinator's run** (`exit 0`, 581 s, `[OK] Environment ready`,
database checks **executed**, 117 e2e, 501 unit). Not re-run here: the session's working
rules reserve the full gate and the full `npm run test:e2e` to the coordinator.

**What I ran myself** (targeted, nothing else in flight — `Win32_Process` checked for
`run-db-tests.mjs` before every database command):

```
npm run typecheck                                              -> exit 0
npm run lint  (--max-warnings 0)                               -> exit 0
npx vitest run                                                 -> 37 files, 501 tests passed (11.8 s)
npm run test:db -- count-entry-service.db.test.ts -t "AC-5"    -> mutation 1a, 3 failed 1 passed (see below)
npm run build                                                  -> exit 0 (x3: mutant, restore, no-DNS)
npx playwright test stock-entry-quantities.spec.ts -g "AC-6"   -> mutant: 1 PASSED  <-- the finding
npx playwright test stock-entry-quantities.spec.ts -g "AC-6|AC-5" (restored) -> 2 passed
npx playwright test stock-entry-quantities.spec.ts -g "AC-16"  -> 2 passed (javaScriptEnabled: false)
AC-32 with DATABASE_URL/DIRECT_URL/TEST_* at `no-such-host.invalid`:
  prisma validate=0  typecheck=0  lint=0  test:unit=0  build=0
git status --porcelain                                         -> identical to the state I found
```

Everything I mutated was restored from a byte copy and verified with `cmp` + SHA-256:
`count-entry-service.ts` back to `d2a47984…f71ad7`, `CountSheet.tsx` back to
`bf9c17c7…dfd8b2` — both of which match the hashes the implementer recorded, which is an
independent corroboration of Phase C's restore discipline. `.next` was rebuilt from the
restored source.

---

## Priority 1 — mutation 5 reproduced: AC-6's "no debounce" clause is not tested

**Reproduced, and the implementer's report of itself is correct.**

```diff
  src/components/stock-entry/CountSheet.tsx:397
- edit(itemId, "0", true);
+ edit(itemId, "0", false);
```

`npm run build`, then
`npx playwright test tests/e2e/stock-entry-quantities.spec.ts --project=chromium-stock-entry --no-deps -g "AC-6"`
→ **`ok 1 … AC-6: None held is one tap, saves 0 with no debounce…` — 1 passed (16.2 s).**

The mechanism is exactly as reported, and it is visible in four lines:

- `tests/e2e/stock-entry-quantities.spec.ts:291` `await control.click();`
- `:292–293` `toHaveAttribute("data-counted","true")` and `toHaveValue("0")` — both are set
  synchronously by `edit()` **before** either branch of the debounce, so neither can see it;
- `:294` `await settled(page)` — the helper at `:104`, which waits up to **20 s** for
  `All changes saved`;
- `:297` `expect(posts).toHaveLength(1)`.

A count taken after the resting state cannot distinguish "sent now" from "sent in 800 ms";
both produce exactly one `POST`. The comment at `:296` ("it happened without waiting out the
debounce") asserts nothing. The *silent on a row already at 0* half at `:301–303` is
genuinely tested — the early return in `noneHeld()` is independent of the debounce — and so
is the 44 × 44 tap target and the accessible name. It is the timing clause, and only the
timing clause, that has no assertion.

**Does the same blind spot reach the neighbours?** No — I checked every criterion that uses
`settled()`:

- **AC-11** is the strong one and is safe in the opposite direction:
  `stock-entry-autosave.spec.ts:302–306` uses `pressSequentially("12.5")` (four keystrokes),
  then `waitForTimeout(1_000)` and `expect(posts).toHaveLength(1)` **before** `settled()` —
  a debounce that vanished would give four `POST`s and go red.
- **AC-12** (`:410`, `:430`) asserts `data-save-state="saving"` and input values *while* the
  route is held 2 s; **AC-13** (`:503–512`) asserts inter-request gaps from recorded
  timestamps; **AC-14** (`:617`) bounds the post-`online` flush at 2 s; **AC-5** (`:244–252`)
  counts posts after a fixed `waitForTimeout(1_500)`, not after settling. None of them
  depends on the resting state to make its point.

So the blast radius is one clause of one criterion — but it is a clause the spec states
twice (AC-6's body, and *Open questions* 8 pinning the 800 ms) and it is the difference
between "a tap is a decision" and "a tap is a keystroke somebody is still making". Under the
reviewer's rule — *a criterion whose only evidence is that the code looks correct is not
satisfied* — **AC-6 fails**.

**What would close it** (the cheapest is already in the repository):
`tests/e2e/stock-entry-autosave.spec.ts:95–104` already records `{ at: Date.now(), edits }`
per request. Give the AC-6 test the same recorder, take `const tappedAt = Date.now()` around
`:291`, and assert `expect(posts[0].at - tappedAt).toBeLessThan(400)`. Equivalently, and with
no clock arithmetic: after the click, `await page.waitForTimeout(400)` and assert
`posts).toHaveLength(1)` **before** `settled(page)` — a debounced tap has sent nothing at
400 ms. Either kills the mutation with ~400 ms of headroom against the 800 ms constant. A
fake timer is not available here (this is a served production build), and a route that
records timestamps is the same measurement with more machinery.

## Priority 2 — the four mutations that did go red

1. **An empty input saved as `0`** — re-run by me.
   `parseQuantity(edit.quantity)` → `parseQuantity(edit.quantity) ?? "0"` at
   `src/server/counts/count-entry-service.ts:63`, then
   `npm run test:db -- src/server/counts/count-entry-service.db.test.ts -t "AC-5"`:
   **3 failed, 1 passed**, with the failures exactly as reported —
   `count-entry-service.db.test.ts:157` `expect(stored).toBeNull()` (`+ "0"`),
   `:170` `SELECT count(*) … WHERE quantity = 0` (`expected 2 to be 1`), and
   `:183` `expect(cleared.countedLineCount).toBe(0)` (`+ 1`). The middle one is asked of
   Postgres itself, not of TypeScript. The test catches the bug.
2. **`0` rendered as blank** — read rather than re-run. The net is
   `stock-entry-quantities.spec.ts:258–260`: `await page.reload()` then
   `countedSummary(1, lineCount)` rendered **by the server**; and independently
   `:174–180`, which taps *None held*, reloads, and asserts `data-counted="true"` and
   `toHaveValue("0")`. A value written correctly and read back wrongly can only be seen
   after the round trip, and the round trip is where the assertion is.
3. **An edit dropped from the queue instead of retried** — read. The header assertion at
   `stock-entry-autosave.spec.ts:487` (`changesNotSaved(3)`) fires first, as the implementer
   states rather than glosses; and the reload marker at `:519–523`
   (`__macroadsNeverReloaded`, with its own failure message) plus the `framenavigated`
   record at `:463–466` are real, not decorative. `tests/unit/count-entry-contract.test.ts`
   ("AC-13: the failure path never reloads and never navigates") scans the stripped source
   for `location.reload`, `location.href`, `useRouter` and `redirect(`.
4. **Progress over the filtered view** — read. `stock-entry-filters.spec.ts:332` asserts
   `countedSummary(0, lineCount)` **while a supplier filter is active**, and `:337` again
   after counting one visible row. `0 of 83` against `0 of 11` is exactly what moves.
5. **Money on the staff shape / a total in the response** — read, and the layering is what
   matters: a source-scan of identifiers (`count-entry-contract.test.ts`, "the permitted
   money-shaped names are an exact set of eight", asserted in **both** directions), a
   `deepKeys` walk over the service result (`count-entry-service.db.test.ts:511,523,535`),
   and a `deepKeys` walk over the **parsed HTTP body** (`route.db.test.ts:313,324`). The
   report's observation that `npm run typecheck` stayed at exit 0 for both money mutations is
   the important one: the type system does not hold this boundary, those three do.

## Priority 3 — the three decisions and the two narrowings

- **Stacked list rather than a table — accepted.** 007 AC-28 already asserts this exact route
  does not scroll sideways at 320 px, so a 413 px five-column row is not a preference that
  lost, it is a shipped criterion that would have gone red. The compatibility surface is
  preserved: `count-lines`, `count-line` and `count-quantity` keep their test ids, and 007's
  "an uncounted line's cell reads exactly `Not counted`" still holds because an `<input>`
  contributes no `textContent` (`stock-entry-start.spec.ts` passes unmodified apart from
  AC-35's one line). The read-only branch at `page.tsx` uses the same shape.
- **`tabIndex={-1}` on *None held* — accepted, with a recorded cost.** AC-30 requires the
  82nd input to be one `Tab` from the 81st, and a per-row button between them makes it two;
  the control is a redundant shortcut for a character a keyboard user can simply type. The
  cost is that the control is now unreachable by keyboard at all (WCAG 2.1.1), which is worth
  an open question in #9 rather than a change here. Accessible name and 44 × 44 are still
  asserted (`stock-entry-quantities.spec.ts:286–289`).
- **Progressive enhancement — verified myself, and the claim holds.**
  `npx playwright test … -g "AC-16"` → 2 passed. In a real `javaScriptEnabled: false`
  context the test asserts all `lineCount` inputs in the **first** response, `method=POST`,
  `action=""`, a hidden `$ACTION…` field, a submit that persists both typed rows, the
  re-rendered page carrying the new values and the updated progress line, and an invalid
  value re-rendering `QUANTITY_INVALID` beside the named row having persisted nothing
  (`quantitiesByItem` compared before and after). This is a `<noscript>` path that has been
  executed, which is the only kind worth having.
- **007 AC-4 narrowed per action — the claim is true.** `tests/unit/stock-entry-contract.test.ts`
  now asserts the exported-action set equals exactly `["startCountAction","saveQuantitiesAction"]`,
  then, per action body, exactly one `await requireUser()` and the literal
  `const actor = await requireUser();`, and keeps #7's "no wrapper" scan. Under the old
  file-wide count a third action with no call at all kept the file at one and stayed green;
  under this one it turns red twice. Strictly stronger, and it was unavoidable — 008's
  Contract puts the second action in that file, which made the old spelling fail by
  construction.
- **AC-18's permitted set exact at 8 — the claim is true and the test is honest about it.**
  Only five of the eight match `/price|value|total|amount/i`; the test asserts
  `[...offenders].sort()` equals exactly those five *and* separately asserts the other three
  identifiers are present in the scan, so the list cannot be padded with names the scan can
  never see. Non-vacuity is asserted (`CountSheet`, `EntryFilters`, `saveQuantities` all
  appear in the scanned identifiers). The typed text living in `typed`/`quantities` rather
  than `values` is a real consequence, not a story: `Object.values` appears nowhere on the
  surface, and mutation 4b's single added identifier was named by this test on a tree `tsc`
  had already passed.

## Priority 4 — the hand-restored file

`src/server/counts/count-service.ts` is **clean**.

- `git diff --numstat c79a0ed` → `15  1` — two hunks, both Phase A: the `supplier` /
  `itemType` selects inside `getCount`'s line `select`, and the two mapped fields
  `supplierName` / `typeName`. Nothing else, no stray whitespace hunk, no reordering.
- Line endings: the file is **LF**. So are `CountSheet.tsx` and the rest of Phase B;
  `count-entry-service.ts` and `actions.ts` are CRLF. The working tree was already mixed
  before this session, `.gitattributes` declares `* text=auto`, so the committed blob is LF
  either way and the diff is byte-for-byte unaffected. This is cosmetic, not a defect.
- The three `*.db.test.ts` files that exercise it were green on the coordinator's gate, and
  `npx vitest run` is green here.

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `src/app/api/counts/[id]/lines/route.db.test.ts:105` (401 JSON, no `Location`, nothing written); `tests/e2e/stock-entry-autosave.spec.ts:128–164` (`401` for the endpoint, `307` to `/sign-in?callbackUrl=…` for the page, same signed-out session); `git diff c79a0ed -- src/lib/auth-config.ts src/middleware.ts` empty (I ran it); only `loading.tsx` in the tree is `src/app/(public)/loading.tsx` (`find src/app -name loading.tsx`) |
| AC-2 | PASS | `count-entry-service.db.test.ts:191` (null actor → `UnauthorizedError`, nothing written), `:204`, `:213` (staff on an admin's Dublin count, admin on a staff Clonmel count); `count-entry-contract.test.ts` "AC-2: … no role refusal and no yard predicate" scans identifiers, not prose; `stock-entry-quantities.spec.ts:110` renders editable rows for both roles |
| AC-3 | PASS | `stock-entry-quantities.spec.ts:124–141`: `count-line`, `quantity-input` and `count-quantity` each equal the count's own line count (`>= 82`, `:117`), plus zero show-more/load-more/held-only controls; `count-entry-contract.test.ts` "nothing … imports listSheet" over all four trees and "no pagination, no show-more, no virtualised container". Sort order and the unassigned-line clause are 007 AC-12's, inherited unchanged (see Observations 3) |
| AC-4 | PASS | `stock-entry-quantities.spec.ts:156–193`: `data-counted` both ways, `not-counted` text exactly `Not counted`, no such element on the zeroed row, and the two rows' `textContent` compared so the distinction cannot be carried by a class |
| AC-5 | PASS | `count-entry-service.db.test.ts:137,149,162,175` — including the raw `SELECT count(*) … WHERE quantity = 0` at `:169` and the null count moving by exactly one in each direction; `stock-entry-quantities.spec.ts:195–260` types `0`, clears `12.5`, asserts `quantityOf` is `"0"` then `null`, `uncountedLinesOf` moves by one, focus+blur sends nothing (`:252`), and the server re-renders `1 of N` after `reload()` (`:259`). **Mutation re-run by me: 3 failed, 1 passed.** |
| AC-6 | **FAIL** | The tap, the value, `data-counted`, the accessible name, the 44 × 44 box and the silent re-tap are all asserted (`stock-entry-quantities.spec.ts:286–304`). **"saves `0` immediately with no debounce" is not.** `:297` counts posts after `settled(page)` at `:294`; I rebuilt with `CountSheet.tsx:397` debounced and the test **passed**. See Priority 1 and Required change 1 |
| AC-7 | PASS | `src/server/counts/quantity-input.test.ts` — 13 tests covering every accepted and refused literal the criterion lists, including `21.61285` refused rather than rounded and `100000000` refused; `count-entry-contract.test.ts` "only quantity-input.ts declares the decimal pattern" scans `src`+`scripts` and asserts the result equals exactly that one file; the client calls the same function (`CountSheet.tsx` `edit()`), the action at `actions.ts` and the body parser at `count-input.ts:180` |
| AC-8 | PASS | `count-entry-service.db.test.ts:228` (`tmp_ac8_quantity_check` added and dropped, all three lines unchanged, control run writes all three), `:264` (every column except `quantity` compared **structurally**, plus the exact preserved-column set), `:281` (the parent count row deep-equal), `:290` (all-table row counts), `:299`/`:311` (a stray `itemId` refuses the whole batch with `NotFoundError`) |
| AC-9 | PASS | `count-entry-service.db.test.ts:323` (`ConflictError`, exact sentence, nothing written); `route.db.test.ts:261` (409 + sentence); `stock-entry-quantities.spec.ts:337–364` (read-only page, zero `input/select/textarea` in `count-lines`, no `none-held`, no `save-now`, quantity as text, and the endpoint's 409); `count-entry-contract.test.ts` asserts neither file names `SUBMITTED`/`APPROVED` and that the branch is `status !== "DRAFT"` |
| AC-10 | PASS | `route.db.test.ts:136–259` (five-key body, `saved` read back, idempotent repeat, seven malformed bodies each 400 writing nothing, 404s) and `stock-entry-autosave.spec.ts:165–255` over real HTTP, including the `405` on `GET`/`PUT`/`DELETE` at `:252–254`, which only real HTTP can see |
| AC-11 | PASS | `stock-entry-autosave.spec.ts:302` (four keystrokes → one `POST`, asserted **before** settling), `:314` (type-then-blur → one), `:324` (focus+blur → none), `:331–352` (six rows → ≤ 2 posts carrying 6 edits, with the first response held 1 s so batching is the mechanism and not a race), `:355–375` (`visibilitychange`→hidden and `pagehide` each flush once); `count-entry-contract.test.ts` pins `AUTOSAVE_DEBOUNCE_MS = 800`, the `keepalive` argument, the three listeners and the absence of `setInterval` |
| AC-12 | PASS | `stock-entry-autosave.spec.ts:404–437`: A in flight while B is typed, both values kept and both stored; the same row twice ending on the newer value; and zero `:disabled`/`[readonly]` quantity inputs measured **mid-flight** (`:417`), backed by a source scan for `disabled`/`readOnly` in `CountSheet.tsx` and `EntryFilters.tsx` |
| AC-13 | PASS | `stock-entry-autosave.spec.ts:440–542` (500) and `:545–575` (aborted connection): three values kept, three rows `error` with `Not saved`, the header sentence, `retry-now` present, two unprompted retries with a growing gap (`:509`), *Retry now* inside 1.5 s, recovery in **one batch of three** (`:533`), `retry-now` gone, and the reload marker + `framenavigated` record proving nothing reloaded or navigated |
| AC-14 | PASS | `stock-entry-autosave.spec.ts:578–637`: `setOffline(true)`, three values on screen at `error`, the header counting three; a row edited twice; `setOffline(false)` with **no user action** and `All changes saved` within a 2 s timeout (`:617`); the wire carries `["60"]` for that row and never `"6"` (`:627`) |
| AC-15 | PASS | `src/lib/entry-queue.test.ts` — 20 tests over a fake `Storage` covering every clause (other user, other count, stale, malformed, throwing storage, `mergeEdit` replace-in-place, `dropConfirmed`, non-mutation, a JSON-number quantity refused); `stock-entry-autosave.spec.ts:640–696` reads `localStorage` directly before and after, reloads with three aborted edits, re-applies them **over** the server's values at `error`, and drains on *Retry now* |
| AC-16 | PASS | Verified by me: `-g "AC-16"` → 2 passed. `stock-entry-quantities.spec.ts:388–450` (no-JS: all inputs in the first response, `method=POST`, `action=""`, `$ACTION…` hidden field, two rows persisted, progress updated, invalid value → AC-7 sentence beside the named row and nothing written) and `:453–479` (with JS, *Save now* posts only to `/api/counts/<id>/lines` and the URL never changes); `count-entry-contract.test.ts` "the action and the route handler both call saveQuantities and neither uses db." |
| AC-17 | PASS | `count-entry-service.db.test.ts:511` (staff result: zero money keys at any depth), `:523` (both roles deeply equal), `:535` (`getCount` still exactly one admin offender after the two new line fields); `route.db.test.ts:313,324` on the **parsed HTTP body**; `stock-entry-quantities.spec.ts:536–563` and `stock-entry-filters.spec.ts:380–413` walk the rendered HTML with every filter applied and with none: no `€`, no `unitPrice`, no `No price`, and no real `ItemPrice` value from the database |
| AC-18 | PASS | `count-entry-contract.test.ts` — the exact-eight identifier set over `count-entry-service.ts`, `src/app/api/counts/**` and both screen trees, asserted in both directions with non-vacuity; plus no `quantity *`, no `.reduce(`, no `@/lib/money` import and no `€` anywhere on the surface |
| AC-19 | PASS | `stock-entry-autosave.spec.ts:257–299`: query string, header and cookie all claiming `ADMIN` produce a byte-identical body; the body variant is refused `400` (AC-10's strict schema, the stronger answer, and the implementer flagged the tension rather than hiding it); `createdByIdOf` unmoved; `route.db.test.ts:337,355`; source scans for one `requireUser()` per action and no identity read from a body, header or cookie |
| AC-20 | PASS | `entry-filters.test.ts:56–103` (three categories, sort, sentinel last, counts over the whole count, empty count); `count-entry-service.db.test.ts:547` (a line really carries supplier and type); `stock-entry-filters.spec.ts:110–166` (three `fieldset`s, the three labels as ARIA groups, counts summing to `lineCount`, `Kelly (14)` as the accessible name) |
| AC-21 | PASS | `entry-filters.test.ts:106–164` (empty, OR, AND, narrowing, sentinel, unknown value, non-mutation); `stock-entry-filters.spec.ts:168–205` asserts the rendered row count against the **facet's own displayed number** and that the facet counts are unchanged after selecting |
| AC-22 | PASS | `entry-filters.test.ts:166–220`; `stock-entry-filters.spec.ts:207–270` (no `/stock-entry` request on toggle, repeated parameters, `goBack` leaves the page, reload renders the same list from the server with the boxes checked, seven hostile query strings each 200, unknown value ignored) and `:272–304` (no-JS `<form method="get">` + `Apply filters` producing the same URL); `count-entry-contract.test.ts` pins `replaceState`, forbids `pushState` and `join(",")` |
| AC-23 | PASS | `entry-filters.test.ts:222–255` and `count-messages.test.ts` for all four `filtersHiding` cases including the empty string; `stock-entry-filters.spec.ts:306–378`: nothing rendered unfiltered, both sentences and *Clear filters* when filtered, and the no-match state rendering the empty sentence **and** the hiding sentence together |
| AC-24 | PASS | `count-entry-service.db.test.ts:571` (one line at `0` → `1 of 82`); `stock-entry-quantities.spec.ts:309–334` (the line moves while the header still reads `Saving…`); `stock-entry-filters.spec.ts:332` (byte-identical under a filter); `:259` (rendered by the server after a reload) |
| AC-25 | PASS | `stock-entry-quantities.spec.ts:365–386` (missing count, empty count with `count-empty` and no `count-lines`), the read-only test, the no-JS invalid-value case, `stock-entry-filters.spec.ts` for the no-match state; `form-state.ts` `toSaveQuantitiesState` re-throws anything that is not a domain error, so it reaches #2's boundary |
| AC-26 | PASS | Every literal the criteria quote is exported from `src/lib/count-messages.ts` (I read the diff) with `Clear filters`, `No supplier`, `No unit` re-exported from `item-master-messages.ts`; `count-messages.test.ts` (26 tests) asserts them from the module; `count-entry-contract.test.ts` "the screen spells no literal of its own" scans the sheet, the panel and the page for ten re-spelled strings; `tests/unit/lint-fence.test.ts` unmodified and green (23 tests) |
| AC-27 | PASS | `count-entry-service.db.test.ts:435` (six provoked failures in the feature's own words) and `:469`; `route.db.test.ts:273`; `stock-entry-autosave.spec.ts:214` and `:537` scan the JSON bodies **and** `page.content()` for `prisma`/`22003`/`numeric field overflow`; `src/app/api/error-response.ts` unchanged (asserted by the test itself via `git status`, and by my own `git diff`) |
| AC-28 | PASS | `tests/unit/stock-entry-contract.test.ts` — one literal exemption with a non-vacuity check (`shipping` really contains it, and the list has length 1), plus a second test asserting that file's `stockCountLine` operations are exactly `["updateMany","findMany"]`, no `stockCount` mutation of any kind, and the literal `data: { quantity }`; the structural half is `count-entry-service.db.test.ts:264` |
| AC-29 | PASS | `git diff c79a0ed -- prisma Samples` empty (I ran it), and the contract test re-asserts it through `git status`; `TRUNCATED_TABLES` untouched; `count-entry-service.db.test.ts:582` round-trips `21.6128` and `0.475`; source scans for `Number(`, `parseFloat`, `toFixed` on the quantity path |
| AC-30 | **FAIL** | Nearly all of it is asserted at `stock-entry-quantities.spec.ts:566–674`: 390 px no sideways scroll, every input ≥ 64 × 44 and inside the viewport, `none-held` and every `facet-option` ≥ 44 × 44, `inputmode`/`autocomplete`/`enterkeyhint`/`type="text"`, the wheel event not changing a focused value, the status bar `position: sticky; top: 0`, the focused row inside a 390 × 380 viewport, `Tab` from the second-to-last input reaching the last, and 320 px. **Missing: the no-sideways-scroll check "with a filter applied"** — `:585` and `:672` both measure the unfiltered page. ("With the filter panel open and closed" is inapplicable: `EntryFilters.tsx` renders no collapse control, so the panel is always open — worth saying so rather than leaving it unaddressed.) See Required change 2 |
| AC-31 | PASS | `tests/unit/project-contract.test.ts` unmodified and green — the nine-file `unitPrice` list intact; `count-entry-contract.test.ts` scans both Phase A trees, both screen trees and `entry-queue.ts` for `unitPrice`; `count-entry-service.db.test.ts:558` and `snapshotsOf` in the AC-5 e2e assert every written line's snapshot is still null |
| AC-32 | **PARTIAL** | I ran the five commands with `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` pointing at `no-such-host.invalid`: `prisma validate`, `typecheck`, `lint`, `test:unit`, `build` **all exit 0**. `force-dynamic` is asserted on both the page and the route, and no added module imports `@prisma/client` or reads `DATABASE_URL`. **Not evidenced by anyone: `./init.ps1` and `bash ./init.sh` each ending `[OK] Environment ready (database checks skipped)`** — the implementer records it as out of reach, and the session's rules put the gate with the coordinator. See Required change 3 |
| AC-33 | PASS (one caveat) | Coordinator's gate: `init` exit 0 with the database checks executed, 117 e2e (90 + 27), 501 unit, `0 flaky` at `retries: 0`. `playwright.config.ts` byte-identical (`git diff` empty); the three specs are named so `testMatch` places them in `chromium-stock-entry`; `RESERVED_YEAR` gains 2095/2096/2097 and `stock-entry-contract.test.ts` now asserts **7 files, 7 distinct years** as an equality; each spec's `afterAll` compares `realCountIds()` and `seededMasterCounts()`. Caveat: "two consecutive full `npm run test:e2e` runs" is evidenced as one full gate run plus two consecutive full runs of the `chromium-stock-entry` project |
| AC-34 | PASS | `count-entry-service.db.test.ts:601,612`; `stock-entry-quantities.spec.ts:481–534` — B's page loaded first, A writes `10`, B writes `20`, the database holds `20`, B echoes `20`, A still shows `10` until it reloads and then shows `20`, and two different lines both succeed to `2 of N` |
| AC-35 | PASS | I read the diff myself: `tests/e2e/stock-entry-start.spec.ts` changes **one** assertion (the `toHaveCount(0)` at old `:228`) into one input per row, all `inputmode="decimal"`, zero `select`, zero `textarea`. No other hunk in that file. Every other shipped spec and `*.db.test.ts` is unmodified (`git status`), and the whole unit suite plus the coordinator's e2e run are green |

## Checkpoints

- C1.1 [x] Only #8's files are touched; `src/server/counts/count-service.ts`'s two hunks are
  the `getCount` extension the spec's Contract requires.
- C1.2 [x] `specs/features/008-stock_entry_ui.md`.
- C1.3 [ ] ← **AC-6's "no debounce" clause and AC-30's "with a filter applied" clause have no
  assertion.** AC-32's init half is unrecorded. This is the box that blocks.
- C1.4 [x] `feature_list.json` id 8 carries 35 `acceptance[]` entries matching the spec's text.
- C1.5 [x] `progress/impl_stock_entry_ui.md`, three phases, files listed per phase, deviations
  and unproven items named rather than glossed.
- C2.1 [x] Coordinator's run: `[OK] Environment ready`, database checks **executed** (not the
  skipped variant). Not re-run here by instruction.
- C2.2 [x] `npm run typecheck` → exit 0 (ran).
- C2.3 [x] `npm run lint --max-warnings 0` → exit 0 (ran).
- C2.4 [x] `saveQuantities` has 30 database tests spanning success and every refusal
  (`UnauthorizedError`, `ConflictError`, two `NotFoundError`s, `ValidationError`, atomicity).
- C2.5 [x] Assertions are values from Postgres and from parsed HTTP bodies — including raw
  `SELECT count(*) … WHERE quantity = 0`, not "no exception was thrown".
- C2.6 [x] Real Neon test branch via `npm run test:db`; the e2e run a real served build; no
  database mock anywhere. `auth()` is the only thing mocked, and only in `route.db.test.ts`.
- C3.1 [x] No component or route handler imports `PrismaClient`; asserted by
  `count-entry-contract.test.ts` over both screen trees and `src/app/api/counts/**`.
- C3.2 [x] The only writer is `src/server/counts/count-entry-service.ts`; both transports call
  it and neither contains `db.`.
- C3.3 [x] N/A — no Excel builder touched.
- C3.4 [x] No cycle: `src/server/**` imports nothing from `src/app/` or `src/components/`.
  (The reverse edge `components → server` is new; see Observation 1.)
- C3.5 [x] No schema change, so no migration is owed; `prisma/` byte-identical.
- C4.1 [x] Nothing computes or stores a value; no `*` on a quantity anywhere.
- C4.2 [x] Three independent walks (service result, parsed HTTP body, rendered HTML) report
  zero money keys for a staff session.
- C4.3 [x] No column changed.
- C4.4 [x] N/A — signature and submission are #9's; this feature refuses anything past `DRAFT`.
- C4.5 [x] `unitPriceSnapshot` written by nothing here and asserted null after every write.
- C4.6 [x] AC-9 refuses a non-`DRAFT` count at the service, the endpoint and the page.
- C4.7 [x] `21.6128` and `0.475` round-trip exactly; no `Number(`/`parseFloat`/`toFixed` on
  the path.
- C4.8 [x] `git status --porcelain -- Samples` empty.
- C5.1 [x] `kebab-case.ts` services, `PascalCase.tsx` components, tests named after their
  criteria.
- C5.2 [x] Only the four typed domain errors; asserted by scan.
- C5.3 [x] No `console.log` in `src/` (the only hit is the ban's own comment in `src/lib/log.ts`).
- C5.4 [x] No bare `TODO`.
- C5.5 [x] No credential or connection string added.
- C6.1 [x] `progress/current.md` was written as the work happened, phase by phase.
- C6.2 [x] No scratch file: `git status --porcelain` after my run is identical to before it.
- C6.3 [x] `#8` is `in_progress`, and the report says explicitly it must not be marked `done`
  before the review.
- C7.1 [x] Empty, error and "loading" all handled — and the deliberate absence of
  `loading.tsx` is documented in the page's own comment with 007 AC-3's reason.
- C7.2 [x] 390 px and 320 px both asserted; this is the most phone-tested screen in the repo.
- C7.3 [x] N/A — there is no currency or thousands-separated number on this surface, by design.

## Required changes

1. **`tests/e2e/stock-entry-quantities.spec.ts:262–307` — AC-6's "no debounce" clause needs an
   assertion that a debounce would fail.** As shipped, `:297`'s `expect(posts).toHaveLength(1)`
   runs after `settled(page)` at `:294`, which waits up to 20 s for the resting state; I
   rebuilt with `src/components/stock-entry/CountSheet.tsx:397` changed to
   `edit(itemId, "0", false)` and the test passed. Either:
   (a) reuse the recorder shape at `tests/e2e/stock-entry-autosave.spec.ts:95–104`
   (`{ at: Date.now(), edits }`), capture `const tappedAt = Date.now()` immediately before
   `:291`'s `control.click()`, and assert `posts[0].at - tappedAt` is under 400 ms; or
   (b) after the click, `await page.waitForTimeout(400)` and assert `posts` has length 1
   **before** calling `settled(page)`.
   Then re-run the mutation and record that it goes red.
2. **`tests/e2e/stock-entry-quantities.spec.ts:566` — AC-30's no-sideways-scroll clause is not
   checked with a filter applied.** `:585` and `:672` both measure the unfiltered page; the
   filtered page renders two extra flex-wrapped sentences and the *Clear filters* control.
   Apply one facet at 390 px (and again at 320 px) and re-run the `overflow()` helper. While
   there, state in the test that "panel open and closed" is inapplicable because
   `src/components/stock-entry/EntryFilters.tsx` renders no collapse control, so the panel is
   always in its widest state — an unaddressed clause reads as an overlooked one.
3. **AC-32's init half is unrecorded** (coordinator's, not the implementer's). I have verified
   `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and
   `npm run build` all exit 0 with every connection string pointing at
   `no-such-host.invalid`; what is still missing is `./init.ps1` and `bash ./init.sh` each
   ending `[OK] Environment ready (database checks skipped)`. Record that output before `#8`
   is marked `done`.

## Observations (non-blocking)

1. **`components/ → server/` is a new dependency edge.** `CountSheet.tsx` and
   `EntryFilters.tsx` import `parseQuantity`, `filterEntryRows`, `hiddenSummary`,
   `ENTRY_FACET_CATEGORIES` and the facet types from `src/server/counts/`. The spec's
   Contract puts those modules there and AC-7 requires the client to call the very same
   parser, so this is mandated rather than improvised, and both modules are genuinely pure
   (`quantity-input.ts` imports only `@/lib/count-messages` and `@/server/errors`;
   `entry-filters.ts` only `@/lib/count-messages` and a type) — no Prisma, no clock, no
   environment. But `docs/architecture.md`'s arrow list is `app → server`, `app → components`,
   `app → lib`, `server → lib`, and this edge is not in it. When #9 touches that document,
   it should gain a named, narrow exception the way `@/server/errors` did in #5 — or those
   two modules should move. Recording it in a review is not the same as writing it down where
   the next implementer will read it.
2. **`tabIndex={-1}` makes *None held* unreachable by keyboard.** Defensible here (typing `0`
   is the equivalent path, and AC-30 demanded the `Tab` path between inputs), but it is an
   accessibility trade-off the spec never weighed. Worth an open question in #9 — a roving
   `tabIndex`, or reaching the control with an arrow key, would give both.
3. **AC-3's archived/unassigned-line clause is inherited, not re-asserted.**
   `seedCountLines` (`tests/e2e/support/stock-entry.ts`) builds lines from the *current*
   `ItemLocation` links, so no #8 fixture contains a line whose item was later unassigned.
   "Still rendered … still sorts last" is 007 AC-12's assertion on `getCount`, which is
   unchanged; "still editable" follows structurally (the sheet renders one input per line it
   is given) but is not asserted by anything. Cheap to add to #9's fixture if it seeds one.
4. **AC-33's "two consecutive full `npm run test:e2e` runs"** is evidenced as one full gate
   run (117 passed, 0 flaky) plus two consecutive full runs of the `chromium-stock-entry`
   project. The suite looks stable at `retries: 0`; the second full run is simply not on
   record.
5. **The no-JavaScript path rewrites every rendered row.** `saveQuantitiesAction` reads one
   field per rendered input, so a *Save now* submits ~83 edits, re-writing untouched rows with
   their own values. That is consistent with AC-34's last-write-wins and stays inside the
   200-edit ceiling, but it means a no-JS submit from a stale page can overwrite another
   device's newer numbers wholesale, where the JavaScript path would only send what changed.
   Worth a sentence in #9's spec if the no-JS path survives into submission.
6. **Two hashes corroborated.** My pre-mutation SHA-256 of `count-entry-service.ts`
   (`d2a47984…f71ad7`) and of `CountSheet.tsx` (`bf9c17c7…dfd8b2`) match the values recorded
   in Phase C, which independently supports the report's restore claims.
7. **Honest self-reporting is the reason this review took the shape it did.** Mutation 5 was
   surfaced by the implementer rather than found by me; mutation 2a's "the assertion that
   fires is the header, not the drain" and 2b's "the second AC-13 test passed under this
   mutation" are both caveats that weaken the author's own case and were written down anyway.
   That is the behaviour that makes a report worth reading, and it should not be discouraged
   by the verdict: the two blocking gaps are small, named and mechanical.

---

## Second pass — 2026-09-12

**Verdict:** APPROVED
**init:** green — coordinator's second gate run (`exit 0`, 571 s, `[OK] Environment ready`,
database checks executed, **117 e2e**, zero flaky at `retries: 0`).

Scope of this pass, as agreed: the two required changes, the neighbour question I raised in
Priority 1, and the one non-test file that appeared since. Everything the first pass settled —
the four red mutations, the three Phase B decisions, both narrowings, the hand-restored
`count-service.ts`, and the 33 criteria outside AC-6 and AC-30 — stands and was not
re-derived. The diff since the first pass is `tests/e2e/stock-entry-quantities.spec.ts`
(untracked, +59 lines), `docs/architecture.md` (+24), and the two progress files; the three
tracked test files are byte-for-byte where they were (`git diff --numstat` identical: 22 /
117 / 106).

**What I ran:**

```
npm run typecheck                                          -> exit 0
npm run lint (--max-warnings 0)                            -> exit 0
npx vitest run                                             -> 37 files, 501 tests passed (11.0 s)
npm run build (mutant / restored)                          -> exit 0, exit 0
npx playwright test ... -g "AC-6|AC-30"  (mutated product) -> 2 FAILED, each at its own new line
npx playwright test ... -g "AC-6|AC-30"  (restored)        -> 2 passed (18.2 s)
rm -rf test-results ; git status --porcelain               -> the state I found it in
```

### Required 1 — AC-6's timing assertion: reproduced red, with my own hands

`tests/e2e/stock-entry-quantities.spec.ts:276-282` now records `{ at: Date.now(), url }` per
save, `:295` captures `tappedAt` immediately before `control.click()`, and `:308` asserts
`posts[0].at - tappedAt` is under 400 ms. Because the bound is computed from the moment the
request *left*, `settled(page)` at `:299` can no longer absorb the difference — which was the
entire defect.

I rebuilt with the original mutation, `src/components/stock-entry/CountSheet.tsx:397`
`edit(itemId, "0", true)` -> `false`:

```
x 1 ... AC-6: None held is one tap, saves 0 with no debounce... (5.9s)
    Expected: < 400
    Received:   883
  > 308 |   expect(posts[0].at - tappedAt).toBeLessThan(400);
```

**883 ms** here against the implementer's reported 871 — the same failure, twice, on two
different runs. The assertion has now been watched failing by both hands that matter.

**Is 400 ms the right number?** Yes, and the mutant's own figure is what proves it. The
debounced path measures 871-883 ms, i.e. `AUTOSAVE_DEBOUNCE_MS` (800) plus ~71-83 ms of
click-dispatch and `fetch` overhead. So the immediate path costs ~80 ms, and 400 ms sits at
almost exactly the midpoint: **~320 ms of headroom before a healthy save could flake it, and
~480 ms of margin before a debounced one could sneak under it.** A 300 ms bound (Phase C's
musing) would buy nothing and halve the green-side headroom; anything above ~600 ms starts
approaching the constant it exists to distinguish. It is also the natural number — half the
debounce — which is the kind that survives a later change to `AUTOSAVE_DEBOUNCE_MS` being
noticed rather than silently absorbed. Accepted as chosen.

### Required 2 — AC-30 with a filter applied: reproduced red against a *product* mutation

`:718-731`: the test now picks a supplier facet from the panel's own `data-count` that is
`> 0` and `< lineCount` (asserted to exist, so the case cannot silently degrade into a second
unfiltered measurement), checks it, asserts `showing-summary`, `filter-hiding` and
`clear-filters` are visible, and re-runs the same `overflow()` helper at **390 px and 320 px**
with the width in the failure label. `:600-604` states in the test why "panel open and closed"
has no second case — `EntryFilters.tsx` renders no `<details>` and no toggle, so the panel is
always in its widest state — which is the right way to answer a clause rather than leave it
silent.

The implementer proved non-vacuity with an injected 900 px element. I wanted the stronger
version, so I mutated the **product** instead, in a way that can only affect the filtered
page — `CountSheet.tsx:608`, the `filtering ? (...)` paragraph, given `style={{ width: 900 }}`:

```
x 2 ... AC-30: phone-first - 390 px and 320 px filtered and not... (4.5s)
    Error: filtered at 390 px
    Expected: <= 390
    Received:    916
  > 728 |     expect(filtered.scroll, `filtered at ${String(width)} px`)...
```

The test reached `:728` — meaning every earlier assertion, including the **unfiltered** 390 px
and 320 px measurements at `:585` and `:707`, passed under that regression. So the new
assertion is not merely live, it is the *only* net that catches a filtered-only overflow,
which is precisely the hole the first pass named. That also answers "is the filtered page
really the wider case": it is a different page — two flex-wrapped sentences and a link the
unfiltered one does not render — and a regression confined to those elements is invisible to
every other measurement in the file. The 320 px measurement is taken after
`setViewportSize({ width: 320 })` on the live filtered DOM, so it is the page a user at 320 px
would see.

Restored from the byte copy: `cmp` identical, `sha256 bf9c17c7...dfd8b2` (the same value Phase C
and my first pass recorded), `.next` rebuilt from the restored source, and
`-g "AC-6|AC-30"` -> **2 passed**.

### Required 3 — AC-32's init half

Recorded by the coordinator: both scripts exit 0 with all four connection strings at
`no-such-host.invalid`, `./init.ps1` printing `[skip] database unreachable ... - database-dependent
checks skipped` and `[OK] Environment ready (database checks skipped)`. Together with the five
commands I ran in the same condition in the first pass, **AC-32 is now evidenced end to end**.

### The neighbour question, answered exhaustively

I audited every assertion in the three specs that follows a `settled()` call, and every
assertion that makes a claim about *when* rather than *what*. The class of defect is narrow:
an assertion is only blind if it claims a timing property and is evaluated after an unbounded
wait for the resting state.

- **Safe by construction — the assertion precedes the settle or uses a fixed wait:**
  `stock-entry-autosave.spec.ts:314-316` (four keystrokes, one `POST`, asserted after a fixed
  1 s and *before* `:317`'s settle — a vanished debounce gives four and goes red);
  `:326-327` (settle, then a further 1.2 s > the 800 ms debounce, so a double-send would be
  counted); `:334-335`; `stock-entry-quantities.spec.ts:251-252` and `:313-315` (both fixed
  1.5 s waits, each longer than the debounce); `stock-entry-filters.spec.ts:228-229`.
- **Safe by direction — waiting can only admit *more* events, never fewer:**
  `autosave:356-357` (`posts.length <= 2` and six edits total), `:533`
  (`drained[0].edits` — the *first* post after recovery), `quantities:489` (`posts` equals
  exactly the endpoint path, a claim about *where*).
- **Safe because the bound is the claim:** `autosave:502-509` (gaps computed from recorded
  timestamps, polled *before* asserting), `:514` (*Retry now* inside 1.5 s while the scheduled
  backoff is already at 8 s), `:615` (`ALL_CHANGES_SAVED` with an explicit `timeout: 2_000`,
  which is AC-14's "within 2 s" rather than the 20 s helper).
- **Every other `settled()`** (`quantities:174, 216, 228, 234, 343, 356, 484, 511, 518, 536`;
  `autosave:317, 325, 375, 383, 421, 434, 530, 573, 647, 686`) precedes an assertion about
  persisted state — `quantityOf`, an input value, `data-counted`, `counted-summary` — for
  which settling is the correct synchronisation and no timing claim rides on it.

**One residue, and it is not the same severity — see Observation 8.** `autosave:365-383`
asserts the `visibilitychange`->hidden and `pagehide` flushes by polling for one `POST` within
3 s of dispatching the event, having just typed into a row. The 800 ms debounce started by
that keystroke would produce a `POST` inside the same window, so the e2e does not prove the
*listener* caused it. Unlike AC-6 before this pass, though, the clause is not without a test:
`tests/unit/count-entry-contract.test.ts` asserts the three `addEventListener` call sites, the
`void flush(true)` spelling and the `keepalive` argument as literals, so deleting a listener
turns a shipped test red. Non-blocking, with the one-line fix named below.

### Criteria updated

| AC | First pass | Now | Evidence |
|----|-----------|-----|----------|
| AC-6 | FAIL | **PASS** | `stock-entry-quantities.spec.ts:308` `expect(posts[0].at - tappedAt).toBeLessThan(400)`, seen failing by me at **883 ms** against the debounced build and passing on the restored one |
| AC-30 | FAIL | **PASS** | `:718-731` measures `scrollWidth <= clientWidth` at 390 px and 320 px **with a facet applied** that provably hides rows and renders all three extra elements; seen failing by me at **916 px** against a filtered-only product regression that every other assertion in the file ignored. `:600-604` answers the "panel open and closed" clause in the test |
| AC-32 | PARTIAL | **PASS** | My five commands (first pass) plus the coordinator's `bash ./init.sh` and `./init.ps1`, all with unresolvable hosts, ending `[OK] Environment ready (database checks skipped)` |
| AC-33 | PASS (caveat) | **PASS** | The caveat is closed: two full gate runs now exist — 581 s and 571 s, both `[OK] Environment ready` with the database checks executed, both 117 e2e at `retries: 0` with zero flaky, on code differing only in two test files |

All 35 criteria now have a named test, and every load-bearing one has been watched failing.

### Checkpoints re-walked (only what changed)

- C1.1 [x] Still one feature. `docs/architecture.md` is the one file outside the spec's list;
  see Observation 6 for why I accept it.
- C1.3 [x] <- **now checked.** AC-6 and AC-30 have assertions, and both have been seen red.
- C2.1 [x] Second gate run, database checks executed.
- C2.2 / C2.3 [x] Re-run here: exit 0 and exit 0.
- C2.5 [x] Strengthened: the two new assertions are numbers measured from the running
  browser (883 ms, 916 px), not the absence of an exception.
- C3.4 [x] The `components -> server` edge is now documented where the next implementer
  will meet it, and the pure-module claim in that paragraph matches what I verified in the
  first pass.
- Everything else in C1-C7 is unchanged from the first pass and still [x].

## Observations — second pass

6. **`docs/architecture.md` is outside the spec's file list, and I accept it.** It is the one
   non-test file this phase touched. It is a direct answer to my own Observation 1, the edge
   it documents is #8's rather than #9's, it changes no behaviour, and nothing a test reads
   was weakened — `tests/unit/lint-fence.test.ts` governs `src/lib/**` and is untouched and
   green (23 tests). I checked the paragraph against the code rather than accepting its
   wording: `quantity-input.ts` imports only `@/lib/count-messages` and `@/server/errors`,
   `entry-filters.ts` only `@/lib/count-messages` and a type, and `CountSheet.tsx` takes
   `DomainError` from `@/server/errors` — exactly as described. It names what is still
   forbidden (`PrismaClient`, `@/server/db`, anything touching a database, a clock or the
   environment), names the test that enforces that part, admits it is **not** ESLint-enforced,
   and prescribes the exit (a third such module means moving them all to `src/lib/`). That is
   the shape of #5's exception and it is honest about its own weakness. Had it quietly widened
   the arrow list without the paragraph, I would have objected.
7. **The deferred observations still look right deferred.** `tabIndex={-1}` (2) cannot change
   without breaking a shipped AC-30 assertion and is production code; AC-3's
   archived/unassigned-line clause (3) needs a new fixture, not a closed required change; the
   no-JS path rewriting every rendered row (5) is behaviour, not a test gap. All three belong
   to #9 with a spec sentence behind them, and the report repeats them so they do not
   evaporate — which is the right handling. My first-pass caveat on AC-33 (4) is now closed by
   the second gate run.
8. **New, non-blocking: AC-11's `pagehide` / `visibilitychange` clause is proved at source
   level but not exclusively in the browser.** `tests/e2e/stock-entry-autosave.spec.ts:368-374`
   and `:378-382` type into a row — starting the 800 ms debounce — then dispatch the event and
   poll up to 3 s for one `POST`. The debounce alone would satisfy that poll, so the e2e does
   not distinguish "the listener flushed" from "the timer fired". The binding itself is
   asserted as literal call sites in `tests/unit/count-entry-contract.test.ts`, so removing a
   listener does turn a test red — which is why this is an observation and not a third
   required change. **The fix is one line and the machinery is already there:** the recorder at
   `:95-104` stores `at`, so capture `const dispatchedAt = Date.now()` before the
   `page.evaluate` and assert `posts[0].at - dispatchedAt` is under 400 ms, exactly as AC-6 now
   does at `:308`. Worth folding into #9, which touches this file anyway.
9. **The `settled()` helper is not the defect; using it to bound a timing claim was.** It is
   the right synchronisation for the twenty end-state assertions listed above, and this feature
   would be flakier without it. The lesson worth carrying into #9 is narrower: *when a
   criterion says "immediately", "with no debounce" or "within N seconds", the assertion has to
   be a number measured from the event, not a count taken after the dust settles.* Both new
   assertions in this pass are that shape, and both have been watched failing.

**Approved.** This is the feature the product exists for, and it is the best-tested surface in
the repository: five pure modules with no database, 44 database tests, 27 browser tests across
three self-cleaning specs, three independent nets on the money boundary, and — now — a named,
red-proven assertion behind every clause of every criterion a person in a yard depends on.
`#8` remains `in_progress`; marking it `done` is the coordinator's.
