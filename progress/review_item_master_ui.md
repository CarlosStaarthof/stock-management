# Review — feature 6 `item_master_ui`

**Verdict:** CHANGES_REQUESTED
**Spec:** `specs/features/006-item_master_ui.md` (35 criteria, including `## Post-approval amendments`)
**init:** green — `bash ./init.sh` exit 0, `[OK] Environment ready`, **database checks executed**
(`prisma migrate status` ran, `npm run test:db` = 13 files / 173 tests passed, `npm run test:unit`
= 23 files / 267 tests, `npm run test:e2e` = 56 passed / 0 failed / 0 flaky)

One criterion is short of its evidence. Everything else in this feature is unusually well
proved, and I could not break any of the five things I was asked to attack.

---

## What I ran, rather than read

| Check | Result |
|---|---|
| `bash ./init.sh` (full, database reachable) | exit 0, `[OK] Environment ready`, db checks **executed** |
| `npm run test:e2e` a second time, back to back | `56 passed (1.7m)` exit 0 |
| `grep -icE "flaky\|[0-9]+ failed\|did not run\|retry #"` over both transcripts | `0` and `0` |
| Development database snapshotted before / after **both** full e2e runs | every row of all 140 items, 129 prices, 152 links, 10 suppliers, 19 types, 2 locations **byte-identical**; `StockCountLine` 0 → 0, `StockCount` 0 → 0, `User` 0 → 0 |
| AC-3 reproduced from scratch (add `loading.tsx`, `next build`, `next start`, probe as `YARD_STAFF`) | `status=200 location=(none) bodyBytes=5052` — then removed and rebuilt: `status=307 location=/stock-entry?denied=item-master bodyBytes=5140`. `GET /` = 200 in both states |
| AC-29's five failures provoked independently, full 11-term scan on each rendered page | all five render the feature's own message, **zero** leaks of `prisma`/`Prisma`/`violates`/`constraint`/`SQLSTATE`/`23001`/`23505`/`23514`/`P2002`/`P2003`/`P2025` |
| AC-23 attacked with a new `*.db.test.ts` probe (archived row mid-sequence, restore, adjacent-across-a-gap, two moves in succession, first-up, last-down) | 4 tests, all green first try; multiset preserved every time; probe deleted |
| AC-33 fence attacked with 13 shapes through `ESLint.lintText` | 9 blocked, 4 escape — 3 of the 4 are runtime indirection, 1 is a real static hole (observation 1) |
| AC-32 re-run with all four URLs at `no-such-host.invalid` | `prisma validate` / `typecheck` / `lint` / `test:unit` / `build` all exit 0; 7/7 item-master routes build `ƒ (Dynamic)`; `init.sh` exit 0 ending `[OK] Environment ready (database checks skipped)` |
| `prisma/` and `Samples/` vs `HEAD` | `git status --porcelain` and `git diff HEAD --stat` both empty for each |
| `git status` on leaving | identical to the state I found it in; all my probes removed |

---

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `src/lib/auth-config.ts:15` has `"/item-master"`, `src/middleware.ts:43` the literal `"/item-master/:path*"`; `tests/e2e/item-master-access.spec.ts:85` asserts 302/307 + `callbackUrl=<encoded path>` + no heading / description / `€` for all seven URLs; `:107` signs in and lands on `/item-master/suppliers`; `tests/unit/item-master-actions-contract.test.ts:280,289` pin both literals and re-prove the middleware imports nothing from `@prisma/client`; `tests/unit/hashing-boundary.test.ts` green unchanged. |
| AC-2 | PASS | `tests/e2e/item-master-access.spec.ts:121` — `status()===307`, `location` contains `/stock-entry?denied=item-master`, and the body matches none of the description, `33.09`, `€`, `/unitPrice\|price\|value\|total\|amount/i`, on all seven; then `ACCESS_DENIED_MESSAGE` rendered. `tests/unit/item-master-actions-contract.test.ts:174` + my own tree-wide grep: `ItemForStaff` appears nowhere, `shapeForRole` only in `src/server/auth/role-shape.ts` and tests. |
| AC-3 | PASS | Reproduced by me end to end (table above): the numbers match the implementer's report exactly. The shipped tree has no `loading.tsx` at `src/app/` or `src/app/item-master/` (`find src/app -name loading.tsx` → only `src/app/(public)/loading.tsx`, `git diff HEAD` on it empty), `/` = 200, and `ac3-probe.txt`, `tests/e2e/zz-ac3-probe.spec.ts`, `src/lib/fence-breach.ts` are all gone. Crucially the assertion keys on the right thing: `tests/e2e/item-master-access.spec.ts:128-131` asserts `status()` **and** the `location` header, never a byte count — which is what makes it survive bodies of 5052 vs 5140. |
| **AC-4** | **FAIL** | 13 of the 17 functions the criterion names have a `YARD_STAFF` test; **`updateItem`, `setItemActive`, `deleteItem` and `markItemReviewed` have none**. `src/server/items/item-service.db.test.ts` contains exactly two AC-4 tests, at `:196` (`listItems`) and `:322` (`createItem`); `grep -rnE "(updateItem\|setItemActive\|deleteItem\|markItemReviewed)\(\s*(staff\|\{ \.\.\.ADMIN)" src/server/items/*.db.test.ts` returns nothing. See *Required changes* 1. |
| AC-5 | PASS | `tests/unit/item-master-actions-contract.test.ts:68,72,80,93` — exactly nineteen exported actions, one `await requireRole("ADMIN")` each, each action's **first** statement is that guard, and no `get("role"\|"actor"\|"actorId"\|"userId")`, no `headers()`, no `cookies()`, no `"YARD_STAFF"` in the code. `tests/e2e/item-master-items.spec.ts:559` POSTs `role=ADMIN, actor=ADMIN, userId=…` as a staff session and asserts the row is `toEqual` its before-image. |
| AC-6 | PASS | `src/server/items/item-service.db.test.ts:52,66,95,107` — one row per active item, case-insensitive `description` order, `q` substring in any case, AND across `supplierId`/`itemTypeId`/`locationCode`, and a row carrying supplier, type, unit, `€33.09` and both yard badges. `tests/e2e/item-master-items.spec.ts:136` proves no pagination control against the real 140-item master; `:162` proves `No items match those filters.` and a working *Clear filters*. (Scale caveat: observation 3.) |
| AC-7 | PASS | `item-service.db.test.ts:204` (`20 Kg` → `KILOGRAM` / `"20"` through `normaliseUnit` from `@/lib/units`, `active` true), `:225` (two-space description stored exactly, three-space search misses); `item-master-input.test.ts:54`; `tests/e2e/item-master-items.spec.ts:175,199` reload and re-read. |
| AC-8 | PASS | `item-master-input.test.ts:39` (`""` and `"   "` → `ValidationError` on `description`), `item-service.db.test.ts:243,430` (no row written, none changed), `tests/e2e/item-master-items.spec.ts:225` asserts the inline message, the kept `notes`/`itemTypeId`, and the absence of `Item_description_not_empty`, `violates`, `check constraint`, `23514`, `prisma`, `Prisma` in the HTML. (`P2000`–`P2999` not in that list — observation 6.) |
| AC-9 | PASS | `item-service.db.test.ts:257,276,299,396,415` — same `(description, supplier)` refused; **two supplier-less rows refused where Postgres cannot** (`findFirst` with an explicit `supplierId: null`, `item-service.ts:238`); the same description under a different supplier stays two items; rename-onto-another refused; save-onto-self allowed. e2e `:255` asserts `An item "…" already exists for supplier …`. |
| AC-10 | PASS | `item-service.db.test.ts:340` (all four fields, `Tonne` → `TONNE`/`1000`, price and link ids and values untouched), `:378` (`null`, not a placeholder); e2e `:276` reloads and reads `unitQuantityKg === "1000"` from the database. |
| AC-11 | PASS | `item-service.db.test.ts:598` — `Item.active=false` only; every `StockCountLine` byte-identical; gone from the default list and from both `listSheet`s; `ItemLocation` ids, `sortOrder` and `active` unchanged; restore returns it to the same yards and positions. e2e `:467` repeats it through the screen. |
| AC-12 | PASS | `item-service.db.test.ts:642,663,677,687`; `deleteItem` attempts and recovers (`item-service.ts:415-424`), no pre-check. e2e `:510` — no *Delete* control, `On 1 count line`, the confirm page renders the refusal instead, and the HTML holds none of `violates RESTRICT setting of foreign key constraint`, `PrismaClientUnknownRequestError`, `constraint`, `23001`. `:539` proves the cascade leaves no orphan price or link. |
| AC-13 | PASS | My own scan of every `itemPrice` occurrence in shipping code: only `findMany`, `findUnique`, `create` (`item-price-service.ts:42,66,76`) and #5's `findMany`/`createMany`. No aliasing route exists — `grep "db\[\|= db\.item\|prisma\["` over `src` and `scripts` is empty, so `db.itemPrice` is never captured in a variable or reached by computed key. `item-price-service.db.test.ts:33` proves the original row unchanged in `id`, `unitPrice`, `currency`, `effectiveFrom`, `label` **and `createdAt`**; `:176` scans tracked **and untracked** files under `src`/`scripts` (the right choice — this feature's files are untracked) with a non-vacuity assertion. `PricePanel.tsx` renders existing rows as `<td>` text; my live probe counted **0** `button`/`a`/`input` inside `[data-testid="price-row"]`. No `updatePriceAction`/`deletePriceAction`. |
| AC-14 | PASS | `item-price-service.ts:66-74` checks `itemId_effectiveFrom` and throws the service's own words; `item-price-service.db.test.ts:57` asserts the exact sentence, the absence of `Unique constraint`/`P2002`/`ItemPrice_itemId_effectiveFrom_key`/`prisma`, one surviving row at `33.09`. e2e `:304` adds a second price, re-submits the same date, and asserts the typed `40.00` / `2026-10-01` are kept. |
| AC-15 | PASS | `price-selection.test.ts` covers all five cases the criterion names plus four more; `src/lib/money.test.ts:11` asserts `€6.11764706`, `€33.09`, `€1,000.00`, `€0.00` and `:38` that the module converts nothing through `Number`; `item-price-service.db.test.ts:134,158` (`Current` on exactly one row, future-only → `currentPrice` null); e2e `:359,377` for `No current price` and the two no-price sentences. |
| AC-16 | PASS | `item-master-input.test.ts:102,111,117,126,130` — all five rejects naming `unitPrice`, all three accepts, `effectiveFrom` shape; `item-price-service.db.test.ts:79` reads back `"6.11764706"`, `EUR`, `2026-01-01T00:00:00.000Z`; `:99` proves nothing is written on the failure path. |
| AC-17 | PASS | `item-service.db.test.ts:138` asserts `counts` is exactly `{active:16, needsReview:15, notes:10, archived:0}`, the filtered page is exactly 15 rows, all flagged, `notes` 10 and `archived` 0. `FilterBar.tsx:62` renders `counts[countKey]` verbatim and links to `?filter=<key>`; e2e `:136` clicks it. (Fixture scale and the row→item link: observation 3.) |
| AC-18 | PASS | `review-reasons.test.ts:47` covers all eight combinations, `:55` blank label, `:64` the fuel rows, `:72` stable order; `item-service.db.test.ts:164`; e2e `:377,420` assert `Flagged at import` with no reason tag and the note text on a fuel row. |
| AC-19 | PASS | `item-service.db.test.ts:475,508,533,551,579` — raised by clearing the supplier **and** by clearing the unit label, never lowered by an ordinary save, refused while a reason remains, cleared once all three are supplied, fuel row reviewable at once. I confirmed independently that `needsReview: false` is written in exactly one place in the whole tree: `src/server/items/item-service.ts:401`, inside `markItemReviewed`, after the `reviewReasons` guard. |
| AC-20 | PASS | `items/[id]/page.tsx:137-151` renders `notes` verbatim in an `Import notes` panel above the form that edits the unit label; e2e `:441` asserts `Dublin!D50`, `1 Unit`, `'Clonmel '!D64`, `16kg`, then clears the note and asserts `needsReview` and `unitLabel` are unchanged. `item-service.db.test.ts:447` for the service half; `:138` for the `filter=notes` count of 10. |
| AC-21 | PASS | `item-assignment-service.db.test.ts:67` (3–84 → **85**), `:89` (inactive links counted in `max`), `:103` (inactive link reactivated, same id, same `sortOrder`, row count unchanged), `:117` (already-assigned is a silent no-op, so `@@unique` is never reached), `:127` (`NotFoundError` naming `CORK`). e2e `:136`. |
| AC-22 | PASS | `item-assignment-service.db.test.ts:140` — `active=false`, same id, same `sortOrder`, row count identical, other yard untouched, `StockCountLine` `toEqual` its before-image, and re-assign restores the place. Source scan at `item-price-service.db.test.ts:212` finds no `itemLocation.delete*` in any shipping module; my own grep agrees (the only hit is `src/server/test-db.ts`, excluded **by name**, not by directory). |
| AC-23 | PASS | `item-assignment-service.db.test.ts:181` builds Clonmel 3–70 + 75–76, moves 75 up, asserts 75↔70 exchanged and the **whole-yard multiset** identical, then three more moves and the same multiset; `:288` asserts first-up and last-down write nothing at all (`findMany` `toEqual` before). I attacked it further with my own probe — archived row mid-sequence (the swap skips it, its own `sortOrder` untouched), restore, adjacent-across-a-gap, two consecutive moves — all green. No unique index on `(locationId, sortOrder)` exists, so the two-update `$transaction` at `item-assignment-service.ts:243` cannot deadlock on itself. No renumber/compact action anywhere; `sortOrder` is displayed (`yards/[code]/page.tsx`, `sheet-sort-order`). |
| AC-24 | PASS | `item-assignment-service.db.test.ts:253` — 82 vs 84 on an 84-link fixture, `sortOrder` ascending, price and unit on the entry, both `includeArchived` rows marked with why; `:292` proves the `description` tie-break. |
| AC-25 | PASS | `supplier-service.db.test.ts:32,47,55,65,77,93,117,127` — alphabetical with item counts, trim, case-insensitive duplicate, blank name, rename touching no `Item` row, archive hiding it from a new choice while the item that names it keeps `supplierId` and shows `(archived)` (`ItemForm.tsx:116`), restore. e2e `:253,304`. |
| AC-26 | PASS | `supplier-service.db.test.ts:137,159,167` and `item-type-service.db.test.ts:131`; both services attempt-then-count (`supplier-service.ts:126`, `item-type-service.ts:163`); `tests/unit/item-master-actions-contract.test.ts:238` pins the singular/plural forms. Provoked live by me: supplier and both its items survive, zero DB text on the page. |
| AC-27 | PASS | `item-type-service.db.test.ts:42,60,72,83,96,123,131,156,183,193` — 19-style list in `sortOrder` with counts, next position on create, case-insensitive duplicate `code`, swap under the same multiset rule, no `setItemTypeActive`, and the screen renders no `Archive` and no `name="active"`. Schema clause verified by me: `git status --porcelain -- prisma` and `git diff HEAD -- prisma` both empty; the tree is still the two migrations plus `migration_lock.toml` and `schema.prisma`. |
| AC-28 | PASS | Every quoted literal is exported from `src/lib/item-master-messages.ts` and asserted **from that module** at `tests/unit/item-master-actions-contract.test.ts:195,204,211,219`; `SubmitButton.tsx` disables on `useFormStatus().pending` and e2e `tests/e2e/item-master-yards.spec.ts:422` proves a double click writes one row; every success path `redirect()`s and the fresh page carries the value (e2e `:175`, `:276`). (`doneMessage` prototype leak: observation 2.) |
| AC-29 | PASS | Verified by me directly against the served build: all five provocations render the feature's own sentence and **none** of the eleven forbidden strings. Structurally, `outcomeOf` (`actions.ts:70`) and `toFormState` (`form-state.ts:42`) surface only `ValidationError`/`ConflictError`/`NotFoundError` and re-throw everything else to #2's boundary; `actions.ts` is asserted to contain no `@prisma/client`, no `@/server/db` and no `db.` (`:120`). (Assertion breadth: observation 5; residual re-throw: observation 7.) |
| AC-30 | PASS | `tests/e2e/item-master-access.spec.ts:166` — at 390×844, `document.documentElement.scrollWidth <= clientWidth` on **all seven** URLs, tables confined to `overflow-x-auto` containers, controls `min-h-11`. Search box, filter link, *Add item*, *Save*, *Add price*, *Assign* each asserted visible. (The seventh named control: observation 4.) |
| AC-31 | PASS | `tests/unit/project-contract.test.ts:168,196,214,228` — the exact nine-file list, `src/lib/**` and `scripts/**` at zero, only the three named files under `src/app`/`src/components`, `unitPriceSnapshot` nowhere, each with a non-vacuity assertion (`src/server/db.ts`, `src/lib/excel/workbook-reader.ts`, `src/lib/money.ts`, `scripts/seed-workbook.ts`, `src/app/page-guards.ts`). I reproduced the scan by hand: exactly those nine files, no tenth, and `unitPriceSnapshot` has no non-test hit under `src/` or `scripts/`. It is a list of files, never a directory exemption. |
| AC-32 | PASS | Re-run by me with all four connection strings at `no-such-host.invalid`: `prisma validate`, `typecheck`, `lint`, `test:unit` (267 passed) and `build` all exit 0; the build lists all seven `/item-master` routes as `ƒ` (Dynamic); `bash ./init.sh` exits 0 ending `[OK] Environment ready (database checks skipped)`. Every page declares `export const dynamic = "force-dynamic"` (`tests/unit/item-master-actions-contract.test.ts:153` pins all seven). |
| AC-33 | PASS | `eslint.config.mjs:36` — one segment pattern `^(?!@/server/errors$).*(?:^|/)server(?:/|$)` replacing the two prefix patterns, plus `no-restricted-syntax` on `ImportExpression` built from the **same** constant so the two rules cannot drift. `tests/unit/lint-fence.test.ts` runs all twelve blocked shapes and the three permitted ones through `ESLint.lintText` with a `filePath` that does not exist, and asserts the `docs/architecture.md` paragraph is gone and the segment pattern is stated. I re-ran the fence myself with nine further shapes: `import db = require(…)`, `export * as ns from`, `@/SERVER/db`, `import type`, `@//server/db`, `@/lib/../server/db`, `../../src/server/db`, `@/./server/errors` and `@/lib/server/thing` are all blocked; `@/server/errors` dynamic import is correctly clean. `npm run lint` exits 0 on the shipped tree. (One residual static escape: observation 1.) |
| AC-34 | PASS | Gate green in full (top of this file). `npm run test:unit` runs 23 files, none a `*.db.test.ts` (`vitest.config.ts` excludes `"**/*.db.test.ts"`, pinned at `tests/unit/project-contract.test.ts:112`); every `*.db.test.ts` calls `resetTestDb()` in `beforeEach` and builds its own fixture; `npm run test:db` passed twice today (init run, plus my probe run). The self-cleaning half I verified the hard way rather than by reading the `afterAll`s: I snapshotted every column of every row of the development master before the suite and again after **two** full runs — 140 items, 129 prices, 152 links, 10 suppliers, 19 types, 2 locations all byte-identical, no seeded item edited, archived or deleted, and no leftover `User`, `StockCount` or `StockCountLine`. `tests/e2e/support/item-master.ts` earns that: a per-process `RUN_SUFFIX`, an id ledger, `cleanUp` deleting by id (never a `deleteMany` over a table), and a suffix-scoped sweep for rows the screen created. |
| AC-35 | PASS | `scripts/run-e2e.mjs:88-101` runs `next build` **once**, before Playwright starts, and aborts if it fails; `playwright.config.ts:63` sets `webServer.command: "npm run start"`, so the suite serves that build and Playwright still starts the application itself (002 AC-11); `retries: 0` at `:57`, `timeout: 45_000`, `expect.timeout: 10_000`. Reproduced: two consecutive full runs by me, `56 passed (1.5m)` and `56 passed (1.7m)`, both exit 0, neither transcript containing `flaky`, `failed`, `did not run` or `retry #`. The two unnamed config changes are justified rather than masking — see *Observations* 8. |

**34 pass, 1 fail.**

---

## Checkpoints

### C1 — Process
- C1.1 [x] One feature. Every change traces to a #6 criterion, including the two files belonging to earlier features (see *On the four flagged files*).
- C1.2 [x] `specs/features/006-item_master_ui.md`.
- C1.3 [ ] ← **AC-4 is not satisfied**: `updateItem`, `setItemActive`, `deleteItem` and `markItemReviewed` are never called with a `YARD_STAFF` actor in any test.
- C1.4 [x] `feature_list.json` `acceptance[]` holds 35 entries and they match the spec's 35.
- C1.5 [x] `progress/impl_item_master_ui.md` exists and its file list matches `git status`/`git diff` exactly — I checked each of the eleven modified files and the new directories. The report is honest, including its four self-flagged deviations.

### C2 — Verification
- C2.1 [x] `bash ./init.sh` exit 0, `[OK] Environment ready`, **not** `(database checks skipped)` — `prisma migrate status` and `npm run test:db` both executed. Run by me, not read.
- C2.2 [x] `npm run typecheck` exit 0.
- C2.3 [x] `npm run lint` exit 0.
- C2.4 [x] Every new service function has a success **and** a failure test. (`updateItem`, `setItemActive`, `deleteItem`, `markItemReviewed` all have domain-failure tests — the gap in C1.3 is specifically the *authorisation* failure AC-4 enumerates.)
- C2.5 [x] Assertions are on real values — `"6.11764706"`, `85`, `[3..70,75,76]`, `82`/`84`, `{active:16, needsReview:15, notes:10, archived:0}`, byte-identical row comparisons.
- C2.6 [x] Real Postgres (`resetTestDb` against the Neon test branch) and a real browser. No mock of Prisma or the filesystem anywhere.

### C3 — Architecture
- C3.1 [x] No component or route handler imports `PrismaClient`. `tests/unit/item-master-actions-contract.test.ts:120` asserts `actions.ts` contains no `@prisma/client`, no `@/server/db` and no `db.`; `tests/unit/hashing-boundary.test.ts` is green unchanged; my own grep found no `db.` in `src/app/**` or `src/components/**`.
- C3.2 [x] One module per aggregate under `src/server/items/`: item, price, assignment, supplier, type, plus three pure modules.
- C3.3 [x] `src/lib/excel/` untouched by this feature and still pure.
- C3.4 [x] No cycles: `item-service` → `price-selection`, `review-reasons`, `item-master-input`; `item-assignment-service` → `price-selection`, `item-master-input`; none of the three imports a service back.
- C3.5 [x] N/A and verified as such — no schema change, so no migration is owed. `git status --porcelain -- prisma` and `git diff HEAD -- prisma` are both empty.

### C4 — Domain integrity
- C4.1 [x] No `value` column written or read.
- C4.2 [x] No price, value or total in a `YARD_STAFF` body — asserted for all seven URLs and re-probed by me.
- C4.3 [x] Schema untouched; `Decimal(18,8)` / `(12,4)` unchanged.
- C4.4 [x] N/A — signatures are #8/#9.
- C4.5 [x] N/A — `unitPriceSnapshot` is named by no shipping module; #6 never writes one.
- C4.6 [x] N/A — approval is #9.
- C4.7 [x] Decimals cross every boundary as strings; `6.11764706` and `1000` proved to survive a full round trip.
- C4.8 [x] `Samples/` untouched (`git status`/`git diff` empty; `init` asserts it too).

### C5 — Conventions
- C5.1 [x] `PascalCase.tsx` components, `kebab-case.ts` services, `*.test.ts` mirroring source, tests named `AC-n: …`.
- C5.2 [x] Only `ValidationError`/`NotFoundError`/`ConflictError`/`ForbiddenError`; no bare `throw new Error` in the feature. (One residual re-throw path — observation 7.)
- C5.3 [x] No `console.log` under `src/` (the only match is the ban's own explanation in `src/lib/log.ts`).
- C5.4 [x] No `TODO` anywhere in `src/` or `tests/`.
- C5.5 [x] No secret or connection string committed; `repo-hygiene.test.ts` green. I did not open `.env`.

### C6 — Session hygiene
- C6.1 [x] `progress/current.md` is a step-by-step log written as the work happened (S1–S10), with the red-gate run and its two caught defects recorded at the time.
- C6.2 [x] No scratch files left: `ac3-probe.txt`, `tests/e2e/zz-ac3-probe.spec.ts`, `src/lib/fence-breach.ts` and `src/app/item-master/loading.tsx` are all absent. My own probes (`src/app/item-master/loading.tsx`, `src/lib/zz-fence-probe.ts`, `src/server/items/zz-reviewer-probe.db.test.ts`) were removed; `git status` is exactly as I found it.
- C6.3 [x] `feature_list.json` has #6 `in_progress`, which is the truth.

### C7 — Advisory
- C7.1 [x] Empty, error and success states exist on every screen and are single-sourced. "Loading" is deliberately the browser's own navigation plus the pending submit control — the absence of a `loading.tsx` is a requirement here (AC-3), not an omission.
- C7.2 [x] All seven screens are usable at 390 px; tables scroll inside their containers, controls are `min-h-11`.
- C7.3 [x] One formatter, `formatPriceExact`, string in and string out, thousands grouped, never through `Number`.

---

## On the note you asked me to confirm

**Confirmed: spec 006 has no changed-file criterion.** `grep -n "name-only\|changed-file\|git diff"` over `specs/features/006-item_master_ui.md` returns nothing; the only such clause in the project is `specs/features/005-seed_from_workbook.md:283`, which is #5's own AC-31 and scoped to #5's changed files. The implementer was carrying it forward. **No amendment is needed**, and the four files are simply ones the plan did not anticipate. Judged on their merits:

1. **`src/app/layout.tsx` — the blurb.** Accepted. Given AC-2's scan is on the *body* of every refused request, the two options were: reword one sentence, or carve a standing exception into a money-boundary assertion. The exception is the thing that rots — a later feature that *did* leak a price inside static metadata would sail through it. The new sentence is honest: `specs/product-brief.md` opens on counts and variances, and "totals" is a subset of what the dashboard derives, not a claim the app has dropped. Nothing asserted the old string. The coupling is real and worth knowing about — observation 9.
2. **`src/server/items/workbook-plan.test.ts` — the column sweep.** Accepted, and I checked the thing that actually matters: **no importer module escaped**. `git ls-tree --name-only f11fed1 src/server/items/` shows the non-test files at the point before #6 were exactly `workbook-plan.ts` and `workbook-import-service.ts` — precisely the two now named. `src/lib/excel` is still swept whole by `readdirSync`. The non-vacuity assertions bite: `MODULES` must contain all three scanned modules, the loop still reads each file and `matchAll`s every one- or two-letter uppercase literal against `[A,B,C,D,E]`, still forbids `getCell(<digit>`, and the sibling test's `expect(mentions).toBeGreaterThan(0)` proves the files were actually read. The guarantee over the same code is unchanged.
3. **`tests/support/item-master-fixture.ts`.** Accepted. Putting it under `src/server/items/` would have made it a tenth module naming `unitPrice` **and** the only module naming `unitPriceSnapshot`, breaking AC-31 for a file that never answers a request. `tests/e2e/support/users.ts` set the precedent.
4. **`tests/e2e/support/users.ts` — 60 s/30 s → 20 s/15 s.** Accepted. Waits longer than the 45 s test budget could never fire; leaving them would have made AC-35's timeout reduction cosmetic in the one helper every spec calls.

---

## Required changes

1. **`src/server/items/item-service.db.test.ts` — AC-4 is four functions short.**
   AC-4 names seventeen functions; the file tests two of the six it owns. Add `updateItem`,
   `setItemActive`, `deleteItem` and `markItemReviewed` to an AC-4 test, in the shape
   `supplier-service.db.test.ts:171` and `item-type-service.db.test.ts:160` already use —
   one `const staff = { ...ADMIN, role: "YARD_STAFF" } as const;`, a `tableCounts()`
   before-image, the four calls, then `expect(await tableCounts()).toEqual(before)`. That
   also satisfies AC-4's second half, which the two existing item-service tests only
   partly do: they check `db.item.count()`, not the row counts of `Item`, `ItemPrice`,
   `ItemLocation`, `Supplier` **and** `ItemType`.
   While you are there: AC-4 says "throws `ForbiddenError`", and no AC-4 test anywhere
   asserts the class — all thirteen use `.rejects.toThrow("ADMIN is required for this
   action")`. Add `.rejects.toBeInstanceOf(ForbiddenError)` on at least one call per
   service so the class is pinned at this layer and not only in `guards.test.ts`.

2. **`tests/e2e/item-master-access.spec.ts:195-196` — AC-30 asserts the wrong control.**
   The criterion names *Move up*; the locator is `[data-testid^="move-type-down-"]`, and
   even the variable is called `firstMoveUp`. The first row legitimately has no *Move up*
   (AC-23), so reach for the second row's — `page.getByTestId("sheet-row").nth(1)
   .getByRole("button", { name: "Move up" })` on `/item-master/yards/DUBLIN`, or the
   equivalent on `/item-master/types` — and rename the variable.

---

## Observations (non-blocking)

1. **The AC-33 fence has one static escape left, in the same class it was built to close.**
   The selector is `ImportExpression > Literal[value=/…/]` (`eslint.config.mjs:38`), and a
   no-substitution template literal is a `TemplateLiteral`, not a `Literal`. I put
   `src/lib/zz-fence-probe.ts` containing ``return import(`@/server/db`);`` into the tree:
   `npx eslint` exit 0, `npx tsc --noEmit` exit 0. It typechecks, it resolves, and it walks
   past the fence — which is exactly the complaint the #5 reviewer made about
   `await import("@/server/db")`. AC-33 does not name this shape and the twelve it does
   name all error, so this is not a failure of the criterion. But `docs/architecture.md`
   has now dropped its old hedge ("for every ordinary import form") in favour of "enforced
   by ESLint", and this is an ordinary import form. One-word fix:
   `ImportExpression > :matches(Literal, TemplateLiteral)[value=…]` will not work on a
   template's `value`; use two selectors, or match the raw source of the argument. Either
   way, add the shape to `BLOCKED` in `tests/unit/lint-fence.test.ts` so the claim stays
   true. (The three other escapes I found — a specifier in a `const`, `createRequire`, and
   a computed specifier — are runtime indirection no static rule can reach, and I would
   not try.)
2. **`doneMessage` inherits `Object.prototype`.** `src/lib/item-master-messages.ts:215`
   declares `DONE_MESSAGE: Record<string, string>` as an object literal and
   `doneMessage(key)` returns `DONE_MESSAGE[key] ?? null`. `doneMessage("toString")`
   therefore returns a **function**, not `null` — TypeScript believes it is a `string`, and
   `Notices.tsx:28` renders it, which React refuses. AC-28's "an unknown key renders
   nothing" is asserted at `tests/unit/item-master-actions-contract.test.ts:211` with a
   sentence, not with a prototype key. `Object.create(null)`, a `Map`, or
   `Object.hasOwn(DONE_MESSAGE, key)` closes it.
3. **AC-6 and AC-17 say "a fixture of 140 items"; nothing asserts at that scale.** The
   Level 2 fixtures are 3–16 rows (`item-service.db.test.ts:52`, `:138`) and the e2e runs
   against the real 140-item master but asserts only that no *next page* link exists
   (`item-master-items.spec.ts:145`) and that the badge is `not.toBeEmpty()` (`:158`). The
   behaviour is right — `listItems` has no `take`/`skip` and `ItemTable` maps every row, I
   checked — but "renders one row per active item, all of them" and "the badge reads 15"
   are inferred rather than measured. Two lines in the e2e would close it:
   `expect(await rows.count()).toBe(await db.item.count({ where: { active: true } }))`, and
   the same equality for `filter-count-needs-review`. AC-17's "each flagged row links to
   `/item-master/items/<id>`" is rendered (`ItemTable.tsx:64`) and never asserted either.
4. **AC-30's control list is 6½ of 7** — see required change 2. The load-bearing half
   (`scrollWidth <= clientWidth` on all seven URLs) is solid, and `toBeVisible` is a weaker
   claim than "clickable without horizontal scrolling"; the document-overflow assertion is
   what carries it.
5. **AC-29's eleven-term list is applied as five tailored sublists.** Each provocation
   checks the terms that failure would actually produce, which is good engineering, but no
   single page is checked against all eleven: the supplier-delete page never looks for
   `23514` or `P2002`, the price-date page never looks for `Prisma` or `violates`. I ran
   the full eleven against all five rendered pages myself and found nothing, so the
   criterion holds today. Hoisting one `const DATABASE_WORDS = [...]` into
   `tests/e2e/support/` and using it in all five would make it hold tomorrow too. The same
   applies to `tests/unit/item-master-actions-contract.test.ts:246`, whose `messages` array
   is nine hand-listed values rather than every export of the module.
6. **AC-8's `P2000`–`P2999` clause is not asserted.** `item-master-items.spec.ts:239`
   checks `Item_description_not_empty`, `violates`, `check constraint`, `23514`, `prisma`,
   `Prisma` — the range of Prisma error codes the criterion also names is absent. A
   `/P2\d{3}/` regex covers it.
7. **Three services re-throw the raw error when their recovery count is zero.**
   `item-service.ts:423`, `supplier-service.ts:134`, `item-type-service.ts:171`. The spec
   permits it ("Anything else reaches the shared error boundary from #2") and it is the
   right shape — better a boundary than a swallowed bug — but it is the one path on which
   AC-29's "every service throws only [the four]" is not literally true. Worth a sentence
   in the module doc rather than a code change.
8. **`fullyParallel: false` and `reuseExistingServer: false` are justified, not masking.**
   AC-35 names neither, so I looked at both. `fullyParallel: true` distributes one file's
   tests across three workers, which runs that file's `beforeAll` three times — three
   copies of the fixture in the user's real database at once, which is precisely what
   AC-34 forbids. Files still run three at a time, so this is not serialisation; the cost
   is 1.5 m → 1.7 m, and I measured both. `reuseExistingServer: false` is the opposite of
   masking: it refuses to adopt a stray `npm run dev` on port 3000, which would silently
   put the suite back on the development server AC-35 exists to get it off. Neither hides
   contention; the first removes a specific contention the fixtures create, and the second
   removes a way of being wrong quietly.
9. **AC-2's word scan now depends on the global `<meta name="description">`.** I agree with
   the call taken, but the consequence should be on the record: any future copy anywhere in
   `src/app/layout.tsx` containing `price`, `value`, `total` or `amount` will turn AC-2 red
   for a reason that has nothing to do with the money boundary, and the failure will point
   at the item master rather than at the layout. The comment at `layout.tsx:6-14` says why
   the sentence is what it is, which is most of the defence.
10. **`?error=` carries the service's whole sentence in the URL.** `actions.ts:88` puts the
    message in the query string, and `Notices.tsx:39` renders whatever arrives. React
    escapes it so it is text and never markup, but a hand-written link can still put an
    arbitrary sentence in a red banner on an admin's screen. The `done` side was
    deliberately designed to avoid exactly this by travelling as a key. Worth revisiting
    when #8 adds a second surface with the same pattern.
11. **`moveItemInSheet` passes an id where a description is expected.**
    `src/server/items/item-assignment-service.ts:225` calls
    `itemNotAssigned(itemId, location.name)`, but the helper's first parameter is a
    description everywhere else (`unassignItemFromLocation` at `:207` passes
    `item.description`). The message reads `cmxyz… is not assigned to Dublin.`. Unreachable
    from the screen — the control is only rendered on rows that are on the sheet — which is
    why no test caught it.
12. **`tests/support/item-master-fixture.ts` is imported relatively.** The db tests use
    `../../../tests/support/item-master-fixture`, which `docs/conventions.md` § Imports
    discourages. The `@/` alias maps only `src/`, so there is no alternative short of a
    second alias; `tests/e2e/` already does the same. Recording it so the next reader does
    not think it slipped through.
13. **The Level 2 suite is now most of the gate's wall time** — `npm run test:db` is 173
    tests and ~4 minutes, nearly all of it the nine `deleteMany`s `resetTestDb()` does in
    `beforeEach` against Neon. The implementer flagged this and it is not a correctness
    problem, but #7–#9 will each add to it. A per-file transaction rollback, or one reset
    per `describe` where the tests do not collide, is the obvious lever when it starts to
    hurt.

---

## What I could not break

Recorded because a reviewer's failed attacks are evidence too.

- **AC-13.** Every `itemPrice` reference in shipping code is a read or a `create`. There is
  no aliasing route: nothing in `src/` or `scripts/` captures `db.itemPrice` in a variable
  or reaches a delegate by computed key, so the regex scan cannot be defeated without a
  new and deliberate shape. The price panel renders zero controls inside an existing row —
  I counted them in a live browser, not in the JSX.
- **AC-23.** Six attacks, including the one the tests do not make (archiving a row in the
  middle of a sequence and then moving across it). The multiset held every time, the
  archived row's own `sortOrder` was never touched, and `ItemLocation` has no
  `@@unique([locationId, sortOrder])` for the two-step swap to trip over.
- **AC-19.** `needsReview: false` is written in exactly one place in the entire repository.
- **AC-34.** Two full suite runs against the user's real data left all 431 rows of the
  imported master byte-identical.

---

# Second pass — 2026-09-11

**Verdict:** APPROVED
**Spec:** `specs/features/006-item_master_ui.md`
**init:** green — `bash ./init.sh` exit 0, `[OK] Environment ready`, **database checks executed**

Both required changes are done, all three observations are closed, and the one disagreement
is well founded. I re-ran everything that could have moved and left the tree as I found it.

## What I ran this pass

| Check | Result |
|---|---|
| `bash ./init.sh`, full, database reachable | exit 0, `[OK] Environment ready` — **not** `(database checks skipped)`. `typecheck`, `lint` ok; `test:unit` **23 files / 273 tests**; `test:e2e` **56 passed (1.5m)**, no `flaky` / `failed` / `did not run`; `prisma migrate status` and `test:db` **13 files / 173 tests** both executed. |
| The lint fence, 34 shapes through `ESLint.lintText` | 26 that must be blocked are blocked, 4 that must be clean are clean, 4 escape — and all four are the runtime / computed class `docs/architecture.md` now names out loud. Zero surprises against expectation. |
| `doneMessage` against 13 keys including the whole of `Object.prototype` | the real key resolves; `toString`, `constructor`, `valueOf`, `hasOwnProperty`, `__proto__`, `prototype`, `isPrototypeOf`, `propertyIsEnumerable`, `toLocaleString`, `length`, `name` all return `null`. |
| **Mutation:** `take: 50` added to `listItems`' `findMany`, then `npm run test:e2e -- --grep "AC-6, AC-17"` | **1 failed**, at `tests/e2e/item-master-items.spec.ts:155` — `Expected: > 100, Received: 50`. Reverted; the same single test then passed in 19.8 s. `src/server/items/item-service.ts` confirmed byte-identical to its pre-mutation copy; the `test-results/` directory the failure produced was removed. |
| Development database re-snapshotted and compared to the **pass-1 baseline** | every row of all 140 items, 129 prices, 152 links, 10 suppliers, 19 types and 2 locations still byte-identical, `StockCountLine` / `StockCount` / `User` still 0 — after three full suite runs and four targeted ones across both passes. |
| AC-31 scan re-run by hand | still exactly the nine permitted files; `unitPriceSnapshot` still named by no shipping module. |
| `prisma/`, `Samples/`, `find src/app -name loading.tsx`, scratch-file sweep | unchanged / untouched / only `src/app/(public)/loading.tsx` / nothing left, including the implementer's own `src/lib/fence-probe-tmp.ts`. |

I agree there was no need to repeat the AC-3 reproduction, the AC-29 provocations or the
AC-23 probe: none of `requireAdminPage`, the page tree, `toFormState` / `outcomeOf`, the
message module's conflict sentences or `moveItemInSheet` was touched, and I checked that
rather than assuming it.

## The disagreement — AC-6 / AC-17

**The implementer is right, and my suggestion was the wrong fix.** Three spec files run in
three workers against one live development database; `item-master-access.spec.ts` and
`item-master-yards.spec.ts` both create and delete active items. A bare
`expect(rows.count()).toBe(await db.item.count({ where: { active: true } }))` compares two
readings taken at two different moments, and would have been a genuinely intermittent
failure — the exact defect AC-35 exists to remove, introduced in the name of closing a
lesser one. That objection stands on its own.

**Is the within-one-load comparison equivalent, or weaker?** Taken *alone*, weaker — and
more so than the code's own comment suggests. `src/server/items/item-service.ts:174-181`
computes `counts` and `rows` from the **same** in-memory `items` array, so a `take:` on the
`findMany` shrinks the badge and the rendered rows *together* and
`toHaveCount(activeBadge)` at line 156 still passes. The comment at line 153 — "a `take:`
or a page size would show a badge of 140 above 50 rows" — describes a slice applied *after*
the counts, not a truncated query, and is the one thing here that is not quite true.

**But it is not taken alone, and the test as shipped does measure what AC-6 asks.** I
proved that rather than reasoning about it: with `take: 50` on the query, the test fails at
**line 155**, `expect(activeBadge).toBeGreaterThan(100)` — `Received: 50`. That floor is
what stops the equality on the next line from being a tautology, by pinning the badge
against the real size of the master. Behind it stand two further, independent measurements
that would each have caught the same mutation: the poll at `:164-171` compares *rendered
rows* to a fresh `db.item.count({ where: { active: true } })` (50 against 146, never
converging), and the loop at `:188-200` does the same for all four badges. Polling is the
right instrument — a concurrent insert agrees on the next pass, a page size never agrees —
and because `retries: 0`, a poll that genuinely could not converge would fail the gate
rather than pass quietly.

So: **AC-6's "one row per active item, all of them" and AC-17's badge counts are now
measured against the database, not inferred**, and AC-17's "each flagged row links to
`/item-master/items/<id>`" is asserted for real at `:212-223` against each row's own
`data-item-id`. The criterion is satisfied and no race was introduced. My only residual
request is a comment, not a test — observation 14.

## The three observations

**1 — the fence.** Closed, and I attacked it harder than the first time. 34 shapes through
`lintText` with a `filePath` under `src/lib/`:

- *Blocked (26 of 26)* — the nineteen static and dynamic spellings from pass 1, plus the
  whole template family: the no-substitution `@/server/db`, `@/server/items/item-service`,
  `@/./server/db`, `@/../src/server/db` and `../server/db` backtick spellings, the
  substituting `@/server/${n}`, and a file carrying **both** the quoted and the backtick
  form, which produces **two** `no-restricted-syntax` errors rather than one.
- *Clean (4 of 4)* — the backtick `@/server/errors`, the backtick `@/lib/units`, an
  unrelated `./locales/${l}.json` dynamic import (an ordinary one is not the rule's
  business) and the quoted `@/server/errors`. No false positive.
- *Escapes (4)* — a template whose leading chunk is a substitution, a template with the
  directory substituted, two literals concatenated with `+`, and a specifier held in a
  `const`.

Building both selectors from one `LIB_TO_SERVER_ESQUERY` constant is the right call: the
two cannot drift into disagreeing about what `server` means, which was the failure mode of
the two prefix patterns they replaced. `tests/unit/lint-fence.test.ts` is now 15 blocked
and 5 permitted shapes, 23 tests, still through `lintText` against a `filePath` that does
not exist.

**Is the new `docs/architecture.md` wording honest, or merely longer?** Honest. I checked it
against what I could actually do to the fence, and every one of my four escapes falls inside
what it now admits: "a specifier assembled at runtime… a `createRequire` call, **or any
computed string** defeats every static rule, this one included". Two literals joined with
`+` are fully literal text and still escape — but that is a computed string, so the sentence
covers it rather than being surprised by it. Three things make the paragraph earn its place
rather than pad it: it sits under a bolded heading (**What it does not reach, stated rather
than implied**) so it cannot be skimmed past; it attributes the finding, so the claim is
traceable; and it closes by naming what actually holds the line — "the constraint it is a
proxy for … is ultimately kept by review". That last clause is the one that matters, and it
sits two paragraphs below the unhedged "**enforced by ESLint**" lead. The lead is now true
for the forms it enumerates, and the qualification is adjacent and explicit rather than
buried. This is a document that has stopped overstating itself, without swinging into
uselessly hedging instead.

**2 — `doneMessage`.** Closed. `Object.hasOwn` plus a `typeof` guard
(`src/lib/item-master-messages.ts:228-234`), and the new test at
`tests/unit/item-master-actions-contract.test.ts:219` covers five prototype keys. I ran
thirteen keys against the same logic independently: the real key resolves, everything off
the prototype returns `null`. The mutation transcript in the report
(`expected [Function toString] to be null`) is the right kind of proof — it shows the test
would have caught the bug it was written for.

**3 — AC-6 / AC-17.** Closed, by a better route than the one I suggested. See above.

## Required changes from the first pass

**1 — AC-4.** Done, and done wider than asked.
`src/server/items/item-service.db.test.ts:331` now drives **all six** functions the module
owns plus `getItem`, on a fixture carrying a supplier, a type, a price and a yard link; it
takes a `tableCounts()` before-image across `Item`, `ItemPrice`, `ItemLocation`, `Supplier`
and `ItemType` — exactly the five AC-4 names (`tests/support/item-master-fixture.ts:162`) —
and then compares the item row **field for field**
(`expect(await db.item.findUniqueOrThrow(…)).toEqual(beforeRow)`). That last step is the
implementer's own addition and it is the right instinct: a refusal that still edited a row
would pass a count check. `.rejects.toBeInstanceOf(ForbiddenError)` now appears in all five
service test files (`item-service.db.test.ts:205` and `:359`,
`item-price-service.db.test.ts:135`, `item-assignment-service.db.test.ts:324`,
`supplier-service.db.test.ts:182`, `item-type-service.db.test.ts:171`), so the class is
pinned at this layer and not only in `guards.test.ts`. `item-price-service.db.test.ts:129`
gained the same before-image and now covers `listPrices` as well as `addPrice`.
I re-ran the grep that found the gap: every one of AC-4's seventeen functions is now called
with a `YARD_STAFF` actor, and so are `getItem`, `listItems`, `listSheet` and `listPrices`.

**2 — AC-30.** Done, and the reasoning in its comment is correct rather than merely
plausible. `tests/e2e/item-master-access.spec.ts:203-216` reaches for a real *Move up* on
the **second** row of both `/item-master/yards/DUBLIN` and `/item-master/types`, asserting
`toBeVisible()` and `toBeEnabled()`. The first row is the wrong one precisely because AC-23
renders no *Move up* there, so an assertion on it would have been asserting the control is
absent under a name claiming it is reachable — which is, near enough, the bug the old test
had. Both `data-testid="sheet-row"` and `data-testid="type-row"` exist
(`src/app/item-master/yards/[code]/page.tsx:86`, `src/app/item-master/types/page.tsx:76`),
and the test guards `count() > 1` before indexing.

## Acceptance criteria — what changed since the first pass

| AC | First pass | Now | Evidence |
|----|-----------|-----|----------|
| AC-4 | **FAIL** | **PASS** | `item-service.db.test.ts:331` — all six functions plus `getItem`, `tableCounts()` over all five tables, row compared field for field; `ForbiddenError` asserted by class in all five services. |
| AC-6 | PASS (scale inferred) | PASS (scale **measured**) | `item-master-items.spec.ts:155` floors the badge above 100 against the real master, `:156` pins rows to it within one load, `:164` polls rendered rows against a fresh `db.item.count`. Mutation-proved by me with `take: 50`. |
| AC-17 | PASS (badge non-empty) | PASS (**every badge read**) | `:188-200` polls all four badges against independent `db.item.count(…)`; `:207` pins the flagged list to the flagged badge; `:212-223` asserts each flagged row's `href` is `/item-master/items/<its data-item-id>`. |
| AC-28 | PASS | PASS (**hole closed**) | `doneMessage` no longer answers a prototype key with a function; `item-master-actions-contract.test.ts:219`. |
| AC-30 | PASS (wrong control named) | PASS | `item-master-access.spec.ts:203-216`, a real *Move up* on two surfaces. |
| AC-33 | PASS (one escape) | PASS (**escape closed**) | Second selector on `TemplateLiteral[quasis.0.value.raw]`, built from the same pattern; 15 blocked / 5 permitted in `lint-fence.test.ts`; 26 of 26 blocked and 4 of 4 clean in my own 34-shape probe. |
| AC-34 | PASS | PASS | Gate green in full; the user's master byte-identical to the pass-1 baseline after every run of both passes. |
| AC-35 | PASS | PASS | `56 passed (1.5m)`, exit 0, no `flaky`, no `failed`. The new polls did not destabilise it, and `retries: 0` means a poll that could not converge would fail the gate rather than hide. |

All other criteria are unchanged from the first pass and re-confirmed green by this run.
**35 of 35 pass.**

## Checkpoints

Only the box that moved is restated; every other box from the first pass holds, re-verified
by this `init` run.

- C1.3 [x] ← was `[ ]`. Every numbered acceptance criterion is now satisfied: AC-4's four
  untested functions are tested, and AC-6, AC-17 and AC-30 are measured rather than inferred.
- C2.1 [x] `bash ./init.sh` exit 0, `[OK] Environment ready`, database checks executed
  (`prisma migrate status` + `test:db`, 173 tests). Run by me.
- C2.2 / C2.3 [x] `typecheck` and `lint` exit 0 inside that run.
- C6.2 [x] No scratch files: the implementer's `src/lib/fence-probe-tmp.ts` is gone, and so
  are my own mutation, its backup and the `test-results/` directory the failed run created.
- C6.3 [x] `feature_list.json` still says `in_progress`, which is still the truth. I have
  not marked #6 done.

**Sections C1–C6 are complete. The feature is approved.**

## Observations carried forward (still non-blocking)

Numbering continues from the first pass. Observations 1, 2 and 3 are closed above, and 4 is
closed by required change 2. These remain open, and none of them blocks:

- **5** — AC-29's eleven forbidden terms are still applied as five tailored sublists rather
  than one shared constant. I verified the behaviour directly in pass 1 against all five
  rendered pages, so the criterion holds; hoisting one `const DATABASE_WORDS` would make it
  keep holding.
- **6** — AC-8's `P2000`–`P2999` clause is still not in the e2e forbidden list.
- **7** — `item-service.ts:423`, `supplier-service.ts:134` and `item-type-service.ts:171`
  still re-throw the raw error when the recovery count is zero. Permitted by the spec;
  worth a line in each module's doc comment.
- **10** — `?error=` still carries the service's whole sentence in the URL. Revisit when #8
  adds a second surface with the same pattern.
- **11** — `item-assignment-service.ts:225` still passes an id where `itemNotAssigned`
  expects a description. Unreachable from the screen.
- **12** — the Level 2 fixture is still imported by relative path; unavoidable while `@/`
  maps only `src/`.
- **13** — `npm run test:db` is still around four minutes and most of the gate's wall time.
  #7–#9 will add to it.

New this pass:

- **14** — **`tests/e2e/item-master-items.spec.ts:153` misdescribes what saves the test.**
  The comment says "a `take:` or a page size would show a badge of 140 above 50 rows". It
  would not, for a `take:` on the query: `item-service.ts:174-181` derives `counts` and
  `rows` from one array, so both shrink together and line 156's equality still holds. What
  actually catches that mutation is line 155's `toBeGreaterThan(100)` floor — I proved it —
  with the two polls behind it. The risk is specific: a maintainer who believes line 156
  does the work could delete line 155 as redundant and turn the check into a tautology.
  One sentence in that comment removes the risk.
- **15** — `item-assignment-service.db.test.ts:316`'s AC-4 test uses a full
  `db.itemLocation.findMany()` row-equality instead of `tableCounts()`. That is stronger
  for the one table those three functions can write and weaker for the other four; the
  other four services cover those with `tableCounts()`, so AC-4's clause is satisfied
  across the set. Worth aligning on `tableCounts()` plus the row-equality when someone is
  next in that file.
- **16** — `lint-fence.test.ts:141` asserts `docs/architecture.md` contains
  `(^|/)server(/|$)` but pins nothing about the new **What it does not reach** paragraph.
  That paragraph is the honest half of the claim and is exactly the kind of prose a later
  edit tidies away; one `expect(architecture).toContain("What it does not reach")` would
  hold it.

## Closing note

The two defects my first pass found were both real, and both were fixed by widening the
proof rather than by narrowing the claim — which is the distinction that matters in this
repository. The disagreement was the best part of the response: the implementer declined a
reviewer's suggestion, said exactly why, and shipped something that measures the same
property without the race. That is the right way to disagree with a review, and it was
right on the merits.
