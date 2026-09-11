# Review — feature 7 entry_start

**Verdict:** CHANGES_REQUESTED
**Spec:** specs/features/007-entry_start.md (33 criteria, including the five amendments)
**init:** green — **on the coordinator's run, not on mine.** I was instructed not to run the
gate. What I ran myself, on this tree: `npm run typecheck` exit 0, `npm run lint` exit 0,
`npx vitest run` **378 passed / 31 files**, `npm run test:db` on
`count-service.db.test.ts` + `role-shaped-sheet.db.test.ts` **48 passed**, and
`item-master-items` + `item-master-yards` + `item-master-access` at the default three
workers **three times: 30 passed, 30 passed, 30 passed**.

This is a strong implementation. AC-14 — the decision of the feature and the thing I was
asked to attack hardest — holds under every test I could devise, and AC-33's race fix holds
under three consecutive runs of the exact configuration that went red on the gate. It is
rejected for one thing: **AC-13's atomicity clause has no test that exercises `startCount`**,
and two smaller clauses (AC-4, AC-18) whose named browser assertions were not written. All
three are small and precisely fixable; nothing about the design needs to change.

---

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `tests/unit/stock-entry-contract.test.ts:90` asserts `git status --porcelain` is empty for `src/lib/auth-config.ts` and `src/middleware.ts`; `:100` pins `"/stock-entry"`, `"/stock-entry/:path*"`, `pathname.startsWith(\`${path}/\`)` and the absence of any `@prisma/client` import. `tests/e2e/stock-entry-access.spec.ts:86` walks all four URLs signed out: 302/307, `callbackUrl=<encoded path+query>`, and the body carries none of `Start a count`, `Counting as`, `€`. `:106` covers the query, `:116` the sign-in landing. `hashing-boundary.test.ts` and `project-contract.test.ts` are unmodified and green in my `vitest run`. |
| AC-2 | PASS | `stock-entry-access.spec.ts:131` (parametrised over both roles) gets 200 on all four URLs; `:145` asserts `signed-in-email` carries the email, `sign-out` ends the session (a later `GET /stock-entry` is 307), and `access-denied` reads `You do not have access to that page.` for `?denied=item-master`, `analysis` **and** the empty value. `sign-in.spec.ts`, `role-access.spec.ts`, `item-master-access.spec.ts` are untouched per `git status`; `item-master-access.spec.ts` passed in each of my three runs. |
| AC-3 | PASS (with a spec defect recorded below) | `tests/unit/stock-entry-contract.test.ts:59` asserts no `loading.tsx`/`loading.ts` at `src/app`, `src/app/stock-entry`, `.../new`, `.../counts`; `:77` asserts `src/app/(public)/loading.tsx` exists, still contains `data-testid="loading"`, and is `git`-clean. `/` at 200 is held by the shipped `tests/e2e/home.spec.ts:6` and `route-protection.spec.ts:40`. The degradation transcript is in `progress/impl_entry_start.md` — **on `?month=banana` rather than on the unauthenticated GET, because the criterion's own vector is impossible**: the middleware refuses a signed-out request at the edge, before any Suspense boundary exists. The substituted vector proves the same thing (307 + `Location` without the file, 200 + no `Location` with it). No probe file survives: `git status --porcelain` shows no `loading.tsx`, no `ac3-probe.txt`, no `zz-ac3-probe.spec.ts`. |
| AC-4 | **PARTIAL** | Proved: `stock-entry-contract.test.ts:121` (`await requireUser()` appears exactly once, `const actor = await requireUser();` present, no `getCurrentUser\|requireRole\|requireAdminPage`), `:130` (no `.get("role"\|"actor"\|"actorId"\|"userId"\|"createdBy"\|"createdById")`, and `stringField(formData, …)` is read for **exactly** `["countDate","locationCode","period"]`); `count-service.db.test.ts:116` (all six exports reject a `null` actor with `UnauthorizedError` and leave `stockCount`/`stockCountLine` at 0) and `:141` (`createdById === staff.id`). **Not proved:** the criterion's browser clause — "submitting the start form with the extra fields `createdById=<an ADMIN user id>` and `role=ADMIN`". `tests/e2e/stock-entry-start.spec.ts:198` submits the form unmodified; `grep` finds no spec anywhere that injects those two fields into the start form. See required change 2. |
| AC-5 | PASS | `stock-entry-contract.test.ts:150` extracts every `name="…"` from `new/page.tsx` and asserts `["countDate","locationCode"]` exactly, each failing `/count(ed)?By\|createdBy\|name\|user/i`; `:144` asserts no file under `src/app/stock-entry/**` or `src/server/counts/**` matches `/signature/i`. `stock-entry-start.spec.ts:92` reads `counting-as` in the browser and asserts the live `input, select, textarea` name set is `["countDate","locationCode","locationCode"]`. `count-messages.test.ts:106` pins `Counting as Jo Byrne`. |
| AC-6 | PASS | `src/server/counts/period.test.ts:22` asserts Part 4's four worked examples in order (`2026-09-30`→{2026,9}, `2026-10-01`→{2026,9}, `2026-10-05`→{2026,9}, `2026-10-06`→{2026,10}); `:29` the four extras including `2026-01-03`→{2025,12} and `2024-03-05`→{2024,2}; `:36` sweeps day 1/5/6 in all twelve months; `:57` pins `field === "countDate"` and `Count date must be a real date, as YYYY-MM-DD.` for `2026-02-30` and six other shapes; `:85` the two formatters. I checked the table against `specs/domain-model.md:409-414` — it matches. |
| AC-7 | PASS | `stock-entry-start.spec.ts:148` does the `GET` with the criterion's own 2026 literals, asserts `This count closes September 2026.`, `<time datetime="2026-10-01">1 October 2026</time>`, `period-input` `type="month"` value `2026-09`, `getByLabel("Period this count closes")`, **and** that `reservedCountTotals(YEAR)` and `realCountIds()` are identical before and after. `count-service.db.test.ts:345` asserts the unchanged form writes `{2026, 9}` with `countDate = 2026-10-01`. |
| AC-8 | PASS | `count-service.db.test.ts:360` (override honoured, both facts kept), `:372` (`period=2025-12` with `countDate=2026-10-01` created exactly as asked), `:384` (five bad periods → `ValidationError`, `field === "period"`, the exact message, `stockCount.count() === 0`). `stock-entry-refusals.spec.ts:106` drives `2026-13` past the native picker, asserts the inline message with `data-field="period"` and that the page matches none of `prisma\|violates\|constraint\|23514\|23505\|P2002…`. |
| AC-9 | PASS | `stock-entry-contract.test.ts:162` scans every shipping module under `src/` for the five terms; `:173` asserts no weekday name in the feature trees and pins the seven headings. `period.test.ts:51`, `count-service.db.test.ts:407` (Saturday `2026-01-03`, Sunday `2025-11-30` created plainly), `stock-entry-start.spec.ts:255` scans the rendered page. |
| AC-10 | PASS | `count-service.db.test.ts:444` asserts the exact sentence `Count for DUBLIN in 2026-09 already exists`, that the message matches no driver string, and that the first count is unchanged in `id`, `countDate`, `status` and line count; `:476` the two successes; `:488` two concurrent `startCount`s → exactly one fulfilled, the loser a `ConflictError` with the same sentence, `stockCount.count() === 1`, `stockCountLine.count() === 82`. `stock-entry-refusals.spec.ts:66` renders the message above the form with `Open the existing count` resolving to the existing id. |
| AC-11 | PASS | `count-service.db.test.ts:512` (`findCountForPeriod` returns the four fields or `null`), `:531` (same `countId`, one row), `:544`. `stock-entry-start.spec.ts:260` asserts the full sentence, **`start-count` count 0 and `button[type="submit"]` count 0**, `Continue this count`, and that following it lands on the first count's URL. |
| AC-12 | PASS | `count-service.db.test.ts:163` — 82 Dublin lines, 70 Clonmel, `itemId` sets equal to the seeded sets; `:185` every line `quantity`, `unitPriceSnapshot`, `note` null; `:207` `count.lines.map(itemId)` equals `listSheet(...).map(itemId)` element for element and the same for `sortOrder`; `:219` an archived item and an unassigned link absent (80, not 82). |
| AC-13 | **FAIL** (clause 1) | Clauses 2 and 3 pass: `count-service.db.test.ts:283` and `:305` assert the exact `Clonmel has no items on its sheet. …` message with `field === "locationCode"` and zero counts; `:316` asserts `NotFoundError` / `No yard with code BANANA.`; `stock-entry-refusals.spec.ts:154` covers the screen. **Clause 1 is not tested.** `count-service.db.test.ts:241` never calls `startCount` — it reads the sheet, deletes an item, and then **re-implements the transaction body inline**. It proves Postgres rolls a transaction back; it proves nothing about `src/server/counts/count-service.ts:313`. Replacing `db.$transaction(async (tx) => …)` there with two sequential `db.…` calls leaves the entire suite green — I checked the concurrency test at `:488` on which the comment leans, and it cannot cover the gap: the loser fails on `tx.stockCount.create` (the **first** statement), so no line write is ever attempted and "82 rows and not 164" would hold with or without a transaction. `grep -rn '\$transaction' src tests` finds exactly two hits, and neither is a test of `startCount`. See required change 1. |
| AC-14 | PASS | This is the criterion I attacked hardest and it holds. `sheet-shape.test.ts:46` asserts `Object.hasOwn(entry,"currentPrice") === false` **and** `Object.keys(entry)` excludes it; `:56` asserts the price thunk is `toHaveBeenCalledTimes(0)` for a staff actor — a genuine `vi.fn()` passed as a parameter, not a closure, so the zero really is measured; `:66` asserts 2 calls for an `ADMIN`; `:101` asserts an empty sheet builds nothing for either role. `role-shaped-sheet.db.test.ts:88` repeats it against Postgres and pins the staff key set to exactly `["description","itemActive","itemId","linkActive","sortOrder","unitLabel"]`; `:107` pins the admin shape (`9.83`, and `null` for the unpriced item — 006 AC-24 unchanged); `:120` `moneyKeysIn(staff) === []` with a non-vacuity check that the admin sheet **does** contain `currentPrice`; `:145` the shape comes from `actor.role` alone; `:170` both read functions reject a `null` actor; `:180` all **seventeen** 006 AC-4 mutations still throw `ForbiddenError` / `ADMIN is required for this action` with `tableCounts()` unchanged — I diffed that list against `specs/features/006-item_master_ui.md:285` and it matches name for name. Structurally: `grep` shows only two callers of `listSheet` — the ADMIN-only yard page (which now reads through `currentPriceOf`, no rendered change) and `startCount`, which uses `entry.itemId` only. All seven `/item-master` routes still redirect a staff session: `item-master-access.spec.ts` is unmodified and passed in all three of my runs, as did `item-master-yards.spec.ts` (006 AC-24's rendered prices). The one shipped assertion edited is exactly the one AC-14 permits — `git diff` on `item-assignment-service.db.test.ts` shows that hunk and nothing else. |
| AC-15 | PASS | `stock-entry-contract.test.ts:185` scans the six named trees/files for `unitPrice` (with the tree list asserted non-empty first, so the scan cannot pass vacuously); `:202` for `quantity *`. `grep -rln unitPrice src` returns exactly the nine permitted shipping files plus tests — 006 AC-31's list is byte-for-byte unchanged, and `project-contract.test.ts` is unmodified and green. `count-service.db.test.ts:774` reads every line back with `unitPriceSnapshot === null`. |
| AC-16 | PASS | `count-shape.test.ts:47`/`:58` assert the unselected thunk runs **zero** times in both directions; `:102` asserts the admin thunk may be `async`, so the extra query is inside the branch; `count-service.db.test.ts:705` gives `itemsWithoutPrice === 11` on an 82/71 fixture and `Object.hasOwn(forStaff,"itemsWithoutPrice") === false`; `:720` asserts the two shapes are otherwise `toEqual`. `count-messages.test.ts:114` pins both spellings of the sentence. `stock-entry-refusals.spec.ts:168` asserts the staff page contains the sentence nowhere, no `No price`, no `€`. |
| AC-17 | PASS | `count-service.db.test.ts:735` — `assertNoMoneyKeys(getCount(staff))`, `moneyKeysIn === []`, non-vacuity via `deepKeys(...).toContain("quantity")` (so the walk really entered `lines[]`), and `moneyKeysIn(getCount(admin))` `toEqual(["itemsWithoutPrice"])` — exactly one offender and no other; `:752` the other three functions for both roles, plus `deepKeys` equality between the two roles' calendars. Browser: `stock-entry-access.spec.ts:171` fetches all four routes as staff and asserts the **body** contains no `€`, no `unitPrice`, no `unitPriceSnapshot` and not the literal text of a real `ItemPrice` read from the database. |
| AC-18 | **PARTIAL** | GET half fully proved: `stock-entry-access.spec.ts:195` sends `?role=ADMIN` + `x-user-role: ADMIN` + a `role=ADMIN` cookie simultaneously and asserts 200 with no `no price recorded`, no `€`, no `unitPrice`; `count-shape.test.ts:70` and `role-shaped-sheet.db.test.ts:145` assert the shape from `actor.role` alone. **POST half is vacuous:** `:220` posts `role=ADMIN&locationCode=…` to `/stock-entry/new/confirm`, but that is a plain request to a page route, not the Server Action, so **no count is created** — and the criterion's "the created row's `createdById`" is therefore asserted about nothing. The only assertions are `status < 500` and no `€`. See required change 2. |
| AC-19 | PASS | `calendar-month.test.ts:20` (Sep: 5 rows, 35 cells, 1 leading, 30 dated, 4 trailing, `grid[0][1] === "2026-09-01"`), `:37` (**Feb 2026 = 5 rows**, 6 leading, 28 dated, 1 trailing — the amendment), `:53` (Mar: 6 rows, 42 cells), `:65` (a padding cell's key set is exactly `["date"]`), `:83` (the rule over every month of four years). I re-derived the three cases independently: 1 Feb 2026 is a Sunday, `ceil((6+28)/7) = 5`. `stock-entry-calendar.spec.ts:97` asserts the `<h1>` and the seven headings in order in the browser. |
| AC-20 | PASS | `count-service.db.test.ts:615` (two badges, Dublin before Clonmel), `:630` (placed by `countDate` — absent from September, present in October, `periodKey === "2026-09"`), `:649`. `stock-entry-calendar.spec.ts:127` (`href`s, `Draft`, `title`), `:158` (placement, both grids, and the count page agreeing), `:179` (empty day → no badge, `start-count-day` href, and following it pre-fills the date), `:198` (`[data-today='true']` count 0 in a reserved year, 1 after *Today*). |
| AC-21 | PASS | `period.test.ts:127`–`:146` (`previousMonthKey("2026-01") === "2025-12"`, `nextMonthKey("2026-12") === "2027-01"`), `count-input.test.ts:139` (`banana`, `2026-13`, `2026-1`, `""`, repeated → `null`). `stock-entry-calendar.spec.ts:211` (hrefs + a year boundary), `:234` (six bad `?month` values, each **307** to `/stock-entry`, then rendering the calendar with `error-message` count 0). |
| AC-22 | PASS | `count-service.db.test.ts:557` (`defaultMonthKey === "2026-08"` against `2026-07-31` + `2026-08-31`), `:567` (empty table → a well-formed current month), `:575` (`countsInMonth`/`anyCountEver` in all three states). `stock-entry-calendar.spec.ts:257` asserts `No counts in this month.` with `no-counts-ever` and `start-a-count` absent — which is the only half the criterion asks of the browser. |
| AC-23 | PASS | `count-input.test.ts:16` (`Choose a yard.`, `field === "locationCode"`, for `undefined`/`null`/`""`/`"   "`), `:29` (`NotFoundError` naming the code), `:108`/`:159` (`?countDate` ignored when unusable). `count-service.db.test.ts:660` (`listCountableYards` is Dublin then Clonmel and drops an inactive yard). `stock-entry-start.spec.ts:67` (two radios, neither checked, `type="date"`), `:114` (the refusal keeps the typed date), `:135` (three bad `?countDate`s ignored). |
| AC-24 | PASS | `count-service.db.test.ts:677` pins `Dublin`, `September 2026`, `2026-09-01`, `Jo Byrne`, `DRAFT`, 82/0/82 and every quantity null; `count-messages.test.ts:107`/`:165` pin `0 of 82 counted`, `September 2026` and `1 September 2026`; `:696` and `stock-entry-refusals.spec.ts:133` cover `That count no longer exists.` with the way back. `stock-entry-start.spec.ts:183` runs the browser half in year 2093 with the same helpers, asserts `count-lines` contains **zero** `input, select, textarea`, and that every `count-quantity` reads `Not counted`. The `>= 82` row floor rather than `82` exactly is the amendment's consequence and is sound. |
| AC-25 | PASS | `stock-entry-contract.test.ts:212` scans both trees for `SUBMITTED`, `APPROVED`, `submittedAt`, `approvedAt`, `signatureSvg`; `:229` pins the amended layout (union at `src/types/stock-count.ts`, `Record<CountStatus,string>` in `count-messages.ts`, `status === "DRAFT"` in the confirm page); `:242` forbids `stockCount(Line)?.(update\|updateMany\|upsert\|delete\|deleteMany)`; `:250` makes the test-file exclusion auditable by asserting the offender list is exactly two named test files. `count-service.db.test.ts:792` reads all eight columns back null/`DRAFT`. |
| AC-26 | PASS | Every quoted literal is asserted from `src/lib/count-messages.ts` in `count-messages.test.ts` (19 tests). `stock-entry-contract.test.ts:265` asserts `count-messages.ts`, `calendar-month.ts`, `yard-time.ts` import nothing matching `(^\|/)server(/\|$)` except `@/server/errors`; `lint-fence.test.ts` (006 AC-33) is green. `StartCountButton.tsx:120` disables on `useFormStatus().pending`; `stock-entry-start.spec.ts:297` double-taps and asserts one count; `:183` reads the values from the redirected page. |
| AC-27 | PASS | `stock-entry-refusals.spec.ts` provokes all four failures and scans `page.content()` against a single regex covering `prisma\|violates\|constraint\|SQLSTATE\|23514\|23505\|P2002\|P2003\|P2025\|…` (`:66`, `:106`, `:133`, `:154`). Every throw in `src/server/counts/` is one of the five domain classes; `src/app/api/error-response.ts` is untouched. One wording caveat is in the observations. |
| AC-28 | PASS | `stock-entry-access.spec.ts:230` (320 px, all four routes, `scrollWidth <= clientWidth`); `stock-entry-calendar.spec.ts:270` (390 px, seven columns each `>= 40` px, three month controls `>= 44×44`); `stock-entry-start.spec.ts:318` walks the whole flow at 390×844 checking overflow at each step and 44×44 on `yard-DUBLIN`, `continue-to-confirm`, `start-count`, and asserting `type="month"` on the period field. |
| AC-29 | PASS (static half verified; the run is the coordinator's) | `stock-entry-contract.test.ts:277` asserts exactly four `page.tsx` under `src/app/stock-entry` and `export const dynamic = "force-dynamic";` in each; `:288` asserts no feature module imports `@prisma/client` in either form, constructs a client or reads `DATABASE_URL`; `:265` the fence. `npm run typecheck` and `npm run lint` exit 0 here. The no-database *run* I did not perform — it is gate-level, per this session's instruction. |
| AC-30 | PASS (static half verified; the two full runs are the coordinator's) | `stock-entry-contract.test.ts:304` pins `retries: 0`, `npm run start`, no `next dev`, `timeout: 45_000`, `expect: { timeout: 10_000 }`, `workers: 3`, `fullyParallel: false`; `:315` pins the two-project split; `:323` asserts `RESERVED_FLOOR = 2090`, that the delete is `where: { periodYear: year }` and **never** `periodYear: { gte: … }`, and that the four spec files hold four distinct reserved years. `tests/e2e/support/stock-entry.ts:47` deletes lines then counts for one year only; `seedCount` refuses a year or a `countDate` below the floor; each spec's `afterAll` asserts `realCountIds()` and `seededMasterCounts()` unchanged. `tests/e2e/support/item-master.ts` (the 2999 fixture) is untouched. |
| AC-31 | PASS | `yard-time.test.ts:14` (`2026-07-01T23:30:00Z` → `2026-07-02`), `:18` (`2026-01-01T23:30:00Z` → `2026-01-01`), `:10` names the zone, `:32` covers an unusable `Date`. `count-service.db.test.ts:419` sets `process.env.TZ = "America/New_York"` in a `try/finally` and asserts both the column round-trip and the service value. `src/server/items/price-selection.ts` is untouched (`git status`). |
| AC-32 | PASS | `stock-entry-contract.test.ts:348` asserts `git status --porcelain -- prisma` is empty and `migration_lock.toml` exists; `:357` the same for `Samples`. I re-ran both by hand: both empty. `count-service.db.test.ts:329` asserts `tableCounts()` and `location.count()` identical across a `startCount`; every e2e file asserts `seededMasterCounts()` in `afterAll`. |
| AC-33 | PASS | The two `expect.poll` blocks are gone (`git diff tests/e2e/item-master-items.spec.ts`); `expect(activeBadge).toBeGreaterThan(100)` and `toHaveCount(activeBadge)` remain; the per-file seeded rows are asserted present by description; each filter is measured within one page load with `/^\d+$/` on the badge. I verified the non-tautology claim structurally rather than taking the transcript on trust: `src/server/items/item-service.ts:174` builds `counts` **and** `rows` from one in-memory `items` array, so `take: 50` drives the badge to 50 and the floor — and only the floor — fails. 006 AC-6's and AC-17's exact figures were never in this file: they live in `item-service.db.test.ts:69` and `:162` (`{active: 16, needsReview: 15, notes: 10, archived: 0}`), so nothing of their substance was lost. **I ran the failing configuration three times** — `item-master-items` + `item-master-yards` + `item-master-access`, `--project=chromium`, default three workers — `30 passed (2.2m)`, `30 passed (1.8m)`, `30 passed (1.7m)`. |

---

## Checkpoints

- C1.1 [x] One feature. The only files outside `#7`'s own trees are `playwright.config.ts`
  and `tests/e2e/item-master-items.spec.ts`, both required by AC-30 and AC-33; no `#6`
  source file changed.
- C1.2 [x] `specs/features/007-entry_start.md` exists.
- C1.3 [ ] ← **AC-13's first clause has no test that exercises `startCount`**; AC-4's and
  AC-18's browser clauses are not written. See *Required changes*.
- C1.4 [x] I compared all 33 `feature_list.json` `acceptance[]` entries against the spec's
  numbered criteria programmatically: **0 mismatches**.
- C1.5 [x] `progress/impl_entry_start.md` exists, lists every file created and modified, and
  its file list matches `git status` exactly.
- C2.1 [x] (attributed) `init` green with the database checks **executed** — the
  coordinator's two runs, `89 passed`, `0 flaky`, nothing skipped. I did not run it; I was
  instructed not to. Everything I ran independently is listed at the top of this file.
- C2.2 [x] `npm run typecheck` → exit 0.
- C2.3 [x] `npm run lint` → exit 0.
- C2.4 [x] Every new exported service function has a success and a failure test:
  `defaultMonthKey`, `listCalendarMonth`, `listCountableYards`, `findCountForPeriod`,
  `startCount`, `getCount` each have both (the `null`-actor sweep at
  `count-service.db.test.ts:116` supplies the sixth failure case), and the two pure shape
  functions have spy-thunk tests in both directions.
- C2.5 [x] Tests assert values, not absence of throw — `82`, `70`, `11`, `"2026-09"`,
  `"1 October 2026"`, exact key sets, exact messages.
- C2.6 [x] Real Postgres (`npm run test:db` against the test branch, `resetTestDb()` per
  test) and a real served build for Playwright. Nothing mocks Prisma.
- C3.1 [x] `stock-entry-contract.test.ts:288` asserts no component or page imports
  `@prisma/client`; the only Prisma in the feature is in `src/server/counts/count-service.ts`.
- C3.2 [x] `src/server/counts/` is one module per concern; `src/server/items/sheet-shape.ts`
  sits with the aggregate it shapes.
- C3.3 [x] n/a — no Excel builder touched.
- C3.4 [x] No cycles: `types → (nothing)`, `lib/count-messages → types + lib`,
  `counts/period → lib + errors`, `counts/count-input → counts/period + items/item-master-input`,
  `counts/count-service → counts/* + items/item-assignment-service`,
  `items/item-assignment-service → items/sheet-shape → auth/role-shape`.
- C3.5 [x] n/a — `git status --porcelain -- prisma` is empty; this feature adds no migration
  and no schema edit.
- C4.1 [x] No `value` column, no multiplication (`stock-entry-contract.test.ts:202`).
- C4.2 [x] The central claim of the feature, and it holds — AC-14, AC-16, AC-17 above.
- C4.3 [x] n/a — no column changed.
- C4.4 [x] n/a — nothing here can reach `SUBMITTED`; AC-25's scan is what keeps it so.
- C4.5 [x] `unitPriceSnapshot` written by nothing; every created line reads back null
  (`count-service.db.test.ts:774`).
- C4.6 [x] Nothing in the feature updates or deletes a count
  (`stock-entry-contract.test.ts:242`).
- C4.7 [x] `quantity` crosses the boundary as `string | null`, never a JS number
  (`count-service.ts:430`).
- C4.8 [x] `git status --porcelain -- Samples` empty.
- C5.1 [x] `PascalCase.tsx` components, `kebab-case.ts` modules, mirrored test names,
  criterion-referencing test sentences.
- C5.2 [x] Only the five typed classes are thrown from `src/server/counts/`. One caveat in
  the observations.
- C5.3 [x] No `console.log` under `src/`.
- C5.4 [x] No `TODO` anywhere in the feature.
- C5.5 [x] No secret or connection string; `.env` untouched and unread.
- C6.1 [x] `progress/current.md` carries a per-step work log written as the work happened,
  including the two blockers and the two mid-flight discoveries.
- C6.2 [x] No scratch file survives — `ac3-probe.txt`, `tests/e2e/zz-ac3-probe.spec.ts` and
  `src/app/stock-entry/loading.tsx` are all absent from `git status`.
- C6.3 [x] `feature_list.json` says `in_progress`, which is the truth.
- C7.1 [x] Empty (two distinct calendar states, the empty sheet), loading (deliberately the
  browser's own, plus the pending button), error (inline and above-form), success (redirect
  and re-render) — all present and all asserted.
- C7.2 [x] 320 px and 390 px, whole flow, 44 px targets.
- C7.3 [x] n/a — this surface carries no monetary figure at all, by design.

---

## Required changes

1. **`src/server/counts/count-service.db.test.ts:241` — AC-13's atomicity clause is asserted
   about a copy of the code, not about `startCount`.** The test builds its own
   `db.$transaction(...)` with the same body and asserts Postgres rolls it back. Delete
   `src/server/counts/count-service.ts:313`'s `db.$transaction` wrapper, replace it with two
   sequential `db.stockCount.create` / `db.stockCountLine.createMany` calls, and the whole
   suite stays green — including `:488`, whose comment claims to cover this. It cannot: the
   loser of that race fails on `tx.stockCount.create`, the **first** statement in the
   transaction, so no line write is ever attempted and the `82` line total is what a
   non-transactional implementation would also produce. Write a test that drives
   **`startCount` itself** to fail at the line write and asserts zero `StockCount` rows for
   that yard and period. A deterministic, mock-free way that fits `docs/verification.md`:
   add a temporary constraint before the call and drop it in a `finally` —
   `ALTER TABLE "StockCountLine" ADD CONSTRAINT "tmp_ac13" CHECK (false) NOT VALID` /
   `DROP CONSTRAINT "tmp_ac13"` — so the count row is created and the `createMany` fails
   inside the transaction. Any equivalent that makes the real function fail at the second
   write is fine; re-implementing the body in the test is not. While you are there, correct
   the comment at `:246-252`, which asserts a coverage relationship that does not hold.

2. **AC-4 and AC-18's browser clauses — one test closes both.** AC-4 requires "submitting
   the start form with the extra fields `createdById=<an ADMIN user id>` and `role=ADMIN`
   creates a count whose `createdById` is the signed-in staff user's id, and the page renders
   that user's name"; AC-18 requires the same three vectors "on the `POST` that starts a
   count, plus the form field `role=ADMIN`", changing neither the shape nor the created row's
   `createdById`. Today `tests/e2e/stock-entry-start.spec.ts:198` submits the form untouched,
   and `tests/e2e/stock-entry-access.spec.ts:220` posts to `/stock-entry/new/confirm` as a
   plain request — which is not the Server Action, creates no row, and therefore asserts
   nothing about `createdById`; its only assertions are `status < 500` and no `€`. Add one
   test that, on the confirm page, injects the two hidden fields into the live form
   (`page.evaluate` appending `<input type="hidden" name="createdById" …>` and
   `name="role"`), sets the cookie and header vectors, clicks `start-count`, and then asserts
   `createdByIdOf(countId) === staff.id` — the helper already exists at
   `tests/e2e/support/stock-entry.ts:121` — together with `counting-as` naming the staff user
   and `items-without-price` absent. The structural half of AC-4 is already strong
   (`stock-entry-contract.test.ts:130` pins the read field set to exactly three names), so
   this is the last mile rather than a new guarantee.

---

## Observations (non-blocking)

- **The two changes to shipped things are both right.** The `playwright.config.ts` split is
  a correctness fix, not tidiness: #7's `startCount` pre-populates from the live sheet, so a
  count started mid-run pins #6's temporary items behind `StockCountLine_itemId_fkey`'s
  RESTRICT and legitimately hides the *Delete* control 006 AC-12 asserts. That is correct
  product behaviour colliding with a fixture, and sequencing the suites is the only fix that
  weakens neither spec. It does not hide a real defect. One structural cost worth knowing:
  `dependencies: ["chromium"]` means **any** failure in the first project leaves all four
  stock-entry files reported as "did not run" — the same shape AC-33 exists to eliminate,
  arriving now from a different direction. Nothing to change today; worth remembering the
  first time the gate goes red.
- **`prefetch={false}` costs a user nothing worth having.** The alternative on this page is
  thirty-odd speculative RSC requests for protected routes the moment a calendar opens on a
  yard phone — on the one connection `specs/product-brief.md` says is bad. Navigation now
  waits for one round trip it would sometimes have avoided. Changing the page rather than
  `sign-in.spec.ts` was the only option AC-2 allowed, and it was the better one anyway.
- **A fifth spec defect, found and handled but recorded as "none".** AC-3's stated vector —
  an unauthenticated `GET /stock-entry/new` degrading from 307 to 200 — cannot happen,
  because the middleware refuses at the edge before any Suspense boundary exists. The
  implementer proved the degradation on AC-21's `?month=banana` redirect instead, which is a
  server-component `redirect()` and therefore the right vector. That is the correct call, but
  `progress/impl_entry_start.md` § *Deviations from the spec* says "None" while the AC-3
  section describes exactly such a deviation. Say it in both places next time.
- **`isRealCalendarDate` is now defined twice.** `src/server/counts/period.ts:43` duplicates
  `src/server/items/item-master-input.ts:57`, and its comment claims the opposite —
  "one definition of 'a real calendar day' for the whole application". `item-master-input.ts`
  already exports `isoDateSchema` (regex + `.refine(isRealCalendarDate)`), and
  `count-input.ts` already imports from that module, so reuse was one import away.
- **`count-input.ts` contains no Zod.** The spec's Contract block calls it "Zod schemas
  parsed at the edge of `src/server/`" and `docs/architecture.md` § Validation says every
  input crossing a trust boundary is parsed with one. What ships is hand-written regex plus a
  `Date` round-trip, with only `locationCodeSchema` borrowed from #6. The behaviour is right
  and thoroughly tested; the layer convention is not followed. Worth settling before #8
  copies the pattern.
- **AC-27's blanket wording versus the code.** `startCount` re-throws a non-`P2002` Prisma
  error (`count-service.ts:342`), which is neither a bare `Error` nor one of the five domain
  classes. That is what the spec's *UI states* section intends ("anything else reaches the
  shared error boundary"), and `src/app/error.tsx` renders `error.message` — safe only
  because Next redacts server error messages in a production build, which is what the e2e
  suite serves. All four provoked failures are clean. Nothing to fix; the tension is between
  two sentences of the spec, not in the code.
- **`stock-entry-refusals.spec.ts:199` asserts the ADMIN price sentence conditionally**
  (`if ((await warning.count()) > 0)`), so on a development master where every Dublin item is
  priced that assertion is vacuous. The unconditional direction — the staff page never
  showing it — is the one that matters and is asserted plainly, and the exact `11` is pinned
  in `count-service.db.test.ts:705`. Acceptable, but the browser half of AC-16's ADMIN branch
  is weaker than it reads.
- **A pre-existing flake in #6's `tests/unit/lint-fence.test.ts`, not #7's.** On a cold cache
  my first `npx vitest run` failed with `Test timed out in 15000ms` on the first
  `fenceErrorsFor` call (ESLint's first `lintText` boot took 7.9 s warm, and longer under
  the parallel load of a 31-file cold run). The second full run was `378 passed` in 16 s, and
  the file alone is `23 passed`. The file is untouched by this feature, but its first test is
  one machine-load away from red at `retries: 0` semantics. Worth a `testTimeout` on that
  file in whatever feature next touches it.
- `progress/current.md` still opens "32 criteria" after AC-33 made it 33.
- The working tree is exactly as I found it: I ran only read-only commands, `typecheck`,
  `lint`, `vitest`, `test:db` and `playwright test`, and `git status --porcelain` is
  unchanged.

---

## Second pass — 2026-09-11

**Verdict:** APPROVED
**init:** green — the coordinator's run (`init exit=0`, `[OK] Environment ready`, database
checks **executed**, **90 e2e passed**, zero flaky, nothing skipped). Not observed by me; I
was instructed not to run the gate.

Only three source/test files moved since the first pass. I verified that rather than taking
it on trust — `find src tests specs playwright.config.ts feature_list.json -newermt` returns
exactly `src/server/counts/count-service.db.test.ts`, `tests/e2e/stock-entry-start.spec.ts`,
`src/server/counts/period.ts` and the three `progress/` files.
`src/server/counts/count-service.ts` also appears, but only because **I** mutated and
restored it; `cmp` against a byte copy taken before the mutation reports identical and
`db.$transaction` is back at `:313`. So AC-14, AC-33, the four earlier amendments, the
Playwright project split, `prefetch={false}`, AC-3's safety and the period model are
untouched, and I have not re-derived them.

### What I ran myself on this tree

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0 (three times: before, during and after my mutations) |
| `npm run lint` | exit 0 |
| `npx vitest run` | **378 passed / 31 files** — the same total as the first pass, which is itself the proof that no test was deleted to make the corrected counts true |
| `npm run test:db -- count-service.db.test.ts` | **40 passed** |
| `npm run test:db -- count-service.db.test.ts -t "AC-13"` | 4 passed |
| `npx playwright test stock-entry-start.spec.ts --project=chromium-stock-entry` | **11 passed**, including `:249` |
| `npx playwright test stock-entry-{refusals,calendar,access}.spec.ts` | **23 passed** |

### Required 1 — AC-13 atomicity: closed

The old test is gone; `count-service.db.test.ts:279` calls the real `startCount`. I checked
all four of the things asked, and two of them by mutation rather than by reading.

- **The test branch cannot be left poisoned, within the limits worth having.** The drop runs
  in a `finally` **and** again immediately before the add (`:294`), both with
  `DROP CONSTRAINT IF EXISTS`; the rejection is parked in a module-level
  `Symbol("startCount resolved")` sentinel (`:62`) and every assertion fires **after** the
  `finally`, so no failing expectation can return while the constraint is live. The residual
  exposure is a `SIGKILL` in the millisecond window between the two `$executeRawUnsafe`
  calls — `resetTestDb()` truncates rows, not DDL, so the constraint would survive it. Even
  then the damage is bounded and self-healing: the five tests before this one in the file
  would fail once, this test's leading drop would clear it, and the rest of that run and
  every run after would be clean. I confirmed the branch is healthy after my own mutation
  run by re-running the whole file — 40 passed, including every test that inserts a
  `StockCountLine`.
- **Are the three class exclusions sufficient?** On their own, no: any non-domain rejection
  satisfies them. What actually pins the attribution is the **non-vacuity pair** — the
  identical call, with nothing changed but the constraint's absence, then succeeds with one
  count and exactly 82 lines (`:316`). The only thing that constraint can affect is a
  `StockCountLine` insert, so the failure is causally located at the line write. My mutation
  supplies the direct positive evidence the exclusions cannot: under a non-transactional
  implementation the assertion that fails is `expected 1 to be +0` on
  `db.stockCount.count({ where })` — the count row demonstrably *was* created before the
  line write failed. Sufficient as built.
- **Non-vacuity** — present, as above.
- **The mutation, re-run by me, both directions.** I copied
  `src/server/counts/count-service.ts` aside, replaced the `db.$transaction(async (tx) => …)`
  wrapper at `:313` with two sequential `db.stockCount.create` / `db.stockCountLine.createMany`
  calls, and confirmed `npm run typecheck` still exits 0 — so it is a compiling, plausible
  implementation, which is what makes the mutation fair. Then:

  ```
  FAIL src/server/counts/count-service.db.test.ts > AC-13: startCount itself, failed at the
       LINE write, leaves zero counts
  AssertionError: expected 1 to be +0 // Object.is equality
   ❯ src/server/counts/count-service.db.test.ts:311:50
        Tests  1 failed | 3 passed | 36 skipped (40)
  ```

  The other three AC-13 tests stayed green, exactly as reported. Restored from the byte
  copy: `cmp` identical, `db.$transaction` back at `:313`, `-t "AC-13"` 4 passed, the full
  file 40 passed.
- **The replacement comment at `:258-271` is true, and I checked its load-bearing half
  empirically rather than by argument.** It claims the concurrency test does **not** cover
  this clause, because the loser fails on `tx.stockCount.create`, the first statement. I
  re-applied the same mutation and ran `-t "AC-10"`: **3 passed**, including
  `AC-10: two concurrent starts leave exactly one count, and the loser gets the same
  message`. So the old comment was false and the new one is exact — the test at `:279` is
  the only thing in the suite that catches a non-transactional `startCount`.

### Required 2 — AC-4 / AC-18 browser clauses: closed

`tests/e2e/stock-entry-start.spec.ts:249` turns on all four vectors at once — `?role=ADMIN`,
`x-user-role: ADMIN` via `setExtraHTTPHeaders`, a `role=ADMIN` cookie, and `createdById=<a
real ADMIN's id>` plus `role=ADMIN` appended to the **live** form — then clicks
`start-count`, which is the Server Action. It asserts `createdByIdOf(countId) === staff.id`
**and** `!== admin.id`, `countIdFor("DUBLIN", 2093, 5) === countId`, `Counting as E2E Yard
Staff`, `items-without-price` count 0, and a body carrying no `no price recorded`, no `€`,
no `E2E Administrator` and not the administrator's id. Year 2093 month 5 Dublin is a yard
and period no other test in the file uses, and the file runs in one worker in order.

**The wire capture is real, and I proved it is load-bearing rather than decorative.** The
`page.waitForRequest` promise is created before the click, matches the action's own `POST`,
and asserts `postData()` contains `createdById`, the administrator's id and `role` — an id
minted in this run, so nothing else could supply it. To be sure that assertion is what holds
the test up, I mutated the spec so the two hidden fields are injected, the form's own
`FormData` keys are read back (leaving the first non-vacuity check passing), and the nodes
are then **removed before submit**. The test failed exactly where it should:

```
> 301 |   expect(posted).toContain("createdById");
        at tests\e2e\stock-entry-start.spec.ts:301:18
  1 failed
```

Restored from a byte copy (`cmp` identical) and re-run: 1 passed, then the whole file 11
passed. So the assertions about `createdById` are about the server ignoring fields it
demonstrably received, not about a browser that never sent them. That closes the hole in
`stock-entry-access.spec.ts:220`, which is rightly left in place as AC-18's `GET` half.

### The four deferred observations — fairly deferred, all four

- **Conditional ADMIN assertion (`stock-entry-refusals.spec.ts`).** Accepted. Making it
  unconditional needs either a write into the user's development master — which AC-32
  forbids this feature — or a fixture that re-derives "which items have no price in force",
  which is the same re-implementation-in-the-test move required change 1 exists to reject.
  The direction that matters is unconditional, the exact `11` is pinned in
  `count-service.db.test.ts`, and it is recorded as a known weak spot rather than dressed up.
- **Zod in `count-input.ts`.** Half of it is done, and it is the half I actually complained
  about: the duplicated `isRealCalendarDate` is gone and `parseCountDate` now parses through
  #6's `isoDateSchema`. I verified the behaviour did not move — `period.test.ts`'s
  non-string, bad-shape and `2026-02-30` cases still raise `ValidationError("countDate", …)`
  with the same message, and the unit total is unchanged at 378. The remaining regex parsers
  are a layer decision, correctly escalated rather than silently kept.
- **`lint-fence.test.ts`'s cold-cache timeout.** #6's file; deferring it is the
  one-feature-at-a-time rule working as intended, and it is written down where the next
  feature to touch that file will find it.
- **`dependencies: ["chromium"]`.** I asked for nothing today and nothing was done. Correct.

### Four overstated test counts, found by the implementer and verified by me

`count-messages.test.ts` 18, `count-input.test.ts` 16, `count-shape.test.ts` 7,
`sheet-shape.test.ts` 8 — I ran those four files and the runner prints exactly those
numbers. The unit total is 378 both before and after the session, which is what rules out
tests having been deleted to make the corrected figures true. Self-reported, unprompted,
checked against the runner rather than against memory.

### Criteria table — the three that moved

| AC | First pass | Now | Evidence |
|----|-----------|-----|----------|
| AC-4 | PARTIAL | **PASS** | `stock-entry-start.spec.ts:249` — forged `createdById` and `role` proved on the wire, row belongs to the session — plus the first pass's source scan and the `count-service.db.test.ts` actor tests. |
| AC-13 | FAIL | **PASS** | `count-service.db.test.ts:279` exercises the real `startCount`; mutation red at `:311`, green restored, both re-run by me. |
| AC-18 | PARTIAL | **PASS** | The same test for the POST half; `stock-entry-access.spec.ts:195` for the GET half. |

The other thirty criteria stand exactly as assessed in the first pass, and nothing in this
session's diff touches them.

### Checkpoints — the one that moved

- C1.3 [x] Every numbered acceptance criterion is now satisfied by a test that exercises the
  shipping code. Every other box in C1–C6 stands as recorded in the first pass; C2.1 is
  still attributed to the coordinator's gate run, not to mine.

### Cleanliness

`git status --porcelain` is what it was when I started this pass — 33 entries, the same 33.
`git status --porcelain -- prisma Samples` is empty. Every file I mutated was restored from
a byte copy and checked with `cmp`; `test-results/` (gitignored, produced by my own failing
mutation run) was deleted. No scratch file, no probe, no leftover DDL on the test branch.

### One thing to carry into #8

`tmp_ac13_line_write_fails` is the first DDL any test in this repository issues. It is right
here and it is well guarded, but it is now a precedent, and the guard rails live inside one
test rather than in the harness. If #8 or #9 needs a second one, put the add/drop pair
behind a helper in `src/server/test-db.ts`, next to `resetTestDb()` — which is where someone
would look for the answer to "what does a test do about schema state?" — rather than copying
these twenty lines.
