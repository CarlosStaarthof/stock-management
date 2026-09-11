# Implementation — feature 6 `item_master_ui`

**Spec:** `specs/features/006-item_master_ui.md` (approved 2026-09-10, 35 criteria)
**Status:** complete
**Gate:** `bash ./init.sh` and `./init.ps1` both end `[OK] Environment ready` with the
database checks **executed**. The gate was also proved to go **red** — transcript below.

---

## Files created

### Pure modules — no database, no clock, no Prisma

- `src/types/item-master.ts` — `ReviewReason`, the one type `src/lib/`, `src/server/` and
  `src/components/` all need. It lives here and not in `review-reasons.ts` because
  `src/lib/item-master-messages.ts` maps every reason to words, and the dependency rule
  forbids `src/lib/**` from importing anything under `src/server/` but `@/server/errors`
  — a `type` import included, which is exactly what ESLint reports.
- `src/lib/money.ts` — `formatPriceExact(value: string)`. String in, string out; no
  `Number(`, `parseFloat`, `toFixed` or `Intl` anywhere in the code.
- `src/lib/item-master-messages.ts` — every literal a criterion quotes, plus `DONE_MESSAGE`
  keyed by a short token so a confirmation travels as a KEY and never as a sentence.
- `src/server/items/price-selection.ts` — `selectCurrentPrice`, `toCurrentPrice`,
  `priceAmountOf`, `toPriceRows`, `isoDateOf`, `todayIso`.
- `src/server/items/review-reasons.ts` — `reviewReasons(item)`.
- `src/server/items/item-master-input.ts` — the Zod schemas and the `parse*` helpers that
  turn a `ZodError` into a `ValidationError` carrying the field.

### Services — the only layer that touches Prisma

- `src/server/items/item-service.ts` — `listItems`, `getItem`, `createItem`, `updateItem`,
  `setItemActive`, `deleteItem`, `markItemReviewed`.
- `src/server/items/item-price-service.ts` — `listPrices`, `addPrice`. **Inserts only.**
- `src/server/items/item-assignment-service.ts` — `listSheet`, `locationName`,
  `assignItemToLocation`, `unassignItemFromLocation`, `moveItemInSheet`.
- `src/server/items/supplier-service.ts` — `listSuppliers`, `createSupplier`,
  `renameSupplier`, `setSupplierActive`, `deleteSupplier`.
- `src/server/items/item-type-service.ts` — `listItemTypes`, `createItemType`,
  `updateItemType`, `moveItemType`, `deleteItemType`.

### Routes — seven, all `ADMIN`-only, all `force-dynamic`

- `src/app/item-master/page.tsx` — the list.
- `src/app/item-master/items/new/page.tsx` — create.
- `src/app/item-master/items/[id]/page.tsx` — edit, prices, yards, notes, lifecycle.
- `src/app/item-master/items/[id]/delete/page.tsx` — confirm, or the refusal.
- `src/app/item-master/suppliers/page.tsx`
- `src/app/item-master/types/page.tsx`
- `src/app/item-master/yards/[code]/page.tsx`
- `src/app/item-master/actions.ts` — the nineteen server actions.
- `src/app/item-master/form-state.ts` — `FormState` and `toFormState`; a separate module
  because every export of a `"use server"` file must be an async function.

### Components

- `src/components/item-master/ItemTable.tsx`, `PricePanel.tsx`, `ItemForm.tsx`,
  `FilterBar.tsx`, `SupplierPanel.tsx`, `ItemTypePanel.tsx`, `Notices.tsx`,
  `SubmitButton.tsx`, `ItemMasterNav.tsx`, `Field.tsx`.

### Tests

| File | Tests |
|---|---|
| `src/lib/money.test.ts` | 5 |
| `src/server/items/price-selection.test.ts` | 11 |
| `src/server/items/review-reasons.test.ts` | 4 |
| `src/server/items/item-master-input.test.ts` | 18 |
| `tests/unit/item-master-actions-contract.test.ts` | 19 |
| `tests/unit/lint-fence.test.ts` | 18 |
| `src/server/items/item-service.db.test.ts` | 30 |
| `src/server/items/item-price-service.db.test.ts` | 11 |
| `src/server/items/item-assignment-service.db.test.ts` | 14 |
| `src/server/items/supplier-service.db.test.ts` | 12 |
| `src/server/items/item-type-service.db.test.ts` | 11 |
| `tests/e2e/item-master-access.spec.ts` | 5 |
| `tests/e2e/item-master-items.spec.ts` | 17 |
| `tests/e2e/item-master-yards.spec.ts` | 8 |
| `tests/support/item-master-fixture.ts` | Level 2 fixtures (not a test file) |
| `tests/e2e/support/item-master.ts` | Level 4 fixtures, self-cleaning |

**78 new Level 2 tests, 75 new Level 1 tests, 30 new Playwright tests.**

## Files modified

- `src/lib/auth-config.ts` — `PROTECTED_PATHS` gains `"/item-master"` (AC-1).
- `src/middleware.ts` — the matcher gains the static literal `"/item-master/:path*"` (AC-1).
- `eslint.config.mjs` — AC-33: the two prefix patterns become one **segment** pattern,
  `^(?!@/server/errors$).*(?:^|/)server(?:/|$)`, and a `no-restricted-syntax` rule on
  `ImportExpression` closes the dynamic-import hole.
- `docs/architecture.md` — AC-33: the paragraph beginning `Three spellings currently slip
  through` is gone; the rule now states the guarantee it can keep and names the test.
- `tests/unit/project-contract.test.ts` — AC-31: the `unitPrice` list goes from two files
  to the exact nine, plus a new assertion that `src/app/**` and `src/components/**` name it
  in only the three permitted places.
- `playwright.config.ts`, `scripts/run-e2e.mjs` — AC-35 (below).
- `tests/e2e/support/users.ts` — AC-35: the sign-in helper's two internal timeouts come
  down from 60 s / 30 s to 20 s / 15 s, with the rest.
- `src/app/layout.tsx` — AC-2 (below; **flagged as a deviation**).
- `src/server/items/workbook-plan.test.ts` — 005 AC-25's directory sweep becomes a list
  (**flagged as a deviation**).
- `progress/current.md` — the work log.

**No migration.** `prisma/schema.prisma`, both migration directories and
`migration_lock.toml` are byte-identical: `git status --porcelain -- prisma` and
`git diff HEAD -- prisma` are both empty (AC-27).

---

## Acceptance criteria

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | `src/lib/auth-config.ts:15`, `src/middleware.ts:39` | `tests/e2e/item-master-access.spec.ts` → "AC-1: a signed-out request to any of the seven URLs is redirected and sent no content"; "AC-1: signing in from that redirect lands on the requested path"; `tests/unit/item-master-actions-contract.test.ts` → "AC-1: PROTECTED_PATHS carries /item-master and the matcher carries the literal"; "AC-1: the middleware still imports nothing from @prisma/client" |
| AC-2 | `requireAdminPage("item-master")`, first statement of all seven pages | `tests/e2e/item-master-access.spec.ts` → "AC-2: a YARD_STAFF session is refused at all seven URLs and sent no item and no money"; `tests/unit/item-master-actions-contract.test.ts` → "AC-2: there is no ItemForStaff and no call to shapeForRole" |
| AC-3 | absence of `src/app/item-master/loading.tsx` and `src/app/loading.tsx` | transcript below; `tests/unit/item-master-actions-contract.test.ts` → "AC-3: neither src/app/item-master/loading.tsx nor src/app/loading.tsx exists"; "AC-3: the public loading.tsx spec 002 shipped is untouched"; "AC-3: every page under /item-master declares force-dynamic and guards first" |
| AC-4 | `assertRole(actor, "ADMIN")`, first statement of every service function | `item-service.db.test.ts` → "AC-4: listItems refuses…", "AC-4: createItem refuses…"; `item-price-service.db.test.ts` → "AC-4: addPrice refuses…"; `item-assignment-service.db.test.ts` → "AC-4: every assignment mutation refuses…"; `supplier-service.db.test.ts` → "AC-4: every supplier mutation refuses…"; `item-type-service.db.test.ts` → "AC-4: every item-type mutation refuses…" |
| AC-5 | `src/app/item-master/actions.ts` — one `await requireRole("ADMIN")` per exported action, as its first statement | `tests/unit/item-master-actions-contract.test.ts` → "AC-5: the file exports exactly the nineteen actions the contract names"; "AC-5: there is one requireRole(\"ADMIN\") call per exported action"; "AC-5: every action's FIRST statement is the guard"; "AC-5: nothing reads a role or an identity out of a FormData"; `tests/e2e/item-master-items.spec.ts` → "AC-5: a form body carrying role=ADMIN does not make a YARD_STAFF session an admin" |
| AC-6 | `item-service.ts` `listItems`; `ItemTable.tsx`; `FilterBar.tsx` | `item-service.db.test.ts` → four "AC-6:" tests; `item-master-input.test.ts` → four "AC-6:" tests; `tests/e2e/item-master-items.spec.ts` → "AC-6, AC-17: the list finds an item by substring in any case…"; "AC-6, AC-28: a filter matching nothing says so…" |
| AC-7 | `item-service.ts` `createItem` → `normaliseUnit` from `@/lib/units` | `item-service.db.test.ts` → "AC-7: derives unitKind and unitQuantityKg with normaliseUnit…"; "AC-7: internal whitespace in a description is preserved exactly"; `item-master-input.test.ts` → "AC-7: the description is trimmed…"; `tests/e2e/item-master-items.spec.ts` → "AC-7, AC-28: creating an item derives its unit…"; "AC-7: two spaces in a description survive…" |
| AC-8 | `item-master-input.ts` `trimmedNonEmpty` + `DESCRIPTION_REQUIRED` | `item-master-input.test.ts` → "AC-8: an empty or whitespace-only description raises ValidationError on description"; `item-service.db.test.ts` → "AC-8: an empty or whitespace-only description writes no row"; "AC-8: an empty description on update changes nothing"; `tests/e2e/item-master-items.spec.ts` → "AC-8, AC-29: an empty description is refused inline, with no database word on the page" |
| AC-9 | `item-service.ts` `assertIdentityFree` — `findFirst` on `(description, supplierId)` with an explicit `null` | `item-service.db.test.ts` → four "AC-9:" tests, including "AC-9: two supplier-less items with one description are refused where Postgres cannot"; `tests/e2e/item-master-items.spec.ts` → "AC-9, AC-29: a duplicate identity is refused above the form…" |
| AC-10 | `item-service.ts` `updateItem` | `item-service.db.test.ts` → "AC-10: persists all four fields, re-derives the unit, and leaves prices and links alone"; "AC-10: setting the supplier to none stores null…"; `tests/e2e/item-master-items.spec.ts` → "AC-10, AC-19: an edit persists, re-derives the unit…" |
| AC-11 | `item-service.ts` `setItemActive` — writes `Item.active` and nothing else | `item-service.db.test.ts` → "AC-11: archiving does not touch history, the links, or the yards it returns to"; `tests/e2e/item-master-items.spec.ts` → "AC-11: archiving keeps history and restoring returns the item to its yards" |
| AC-12 | `item-service.ts` `deleteItem` (attempt, then count); `items/[id]/delete/page.tsx` | `item-service.db.test.ts` → four "AC-12:" tests; `tests/e2e/item-master-items.spec.ts` → "AC-12, AC-29: an item a count names offers no Delete and refuses one readably"; "AC-12: deleting an unreferenced item takes its prices and links with it" |
| AC-13 | `item-price-service.ts` — no `.update`/`.upsert`/`.delete` on `itemPrice`; `PricePanel.tsx` renders existing rows as text | `item-price-service.db.test.ts` → "AC-13: changing a price adds a row and leaves the original byte-identical"; "AC-13: no shipping module applies update, upsert or delete to itemPrice"; "AC-13: there is no updatePriceAction and no deletePriceAction"; `tests/unit/item-master-actions-contract.test.ts` → "AC-13: there is no action that edits or deletes a price"; `tests/e2e/item-master-items.spec.ts` → "AC-13, AC-14, AC-15, AC-29: a price is added, never overwritten" |
| AC-14 | `item-price-service.ts` `addPrice` → `priceDateAlreadyUsed` | `item-price-service.db.test.ts` → "AC-14: a date the item already has is refused in the service's own words"; `tests/e2e/item-master-items.spec.ts` → "AC-13, AC-14, AC-15, AC-29: a price is added, never overwritten" |
| AC-15 | `price-selection.ts` `selectCurrentPrice`; `src/lib/money.ts` `formatPriceExact` | `price-selection.test.ts` → nine "AC-15:" tests (the five the criterion names, plus four); `src/lib/money.test.ts` → five tests including the four exact values; `item-price-service.db.test.ts` → two "AC-15:" tests; `tests/e2e/item-master-items.spec.ts` → "AC-15: a future-only price leaves the header saying No current price"; "AC-15, AC-18: an item with no price shows both sentences" |
| AC-16 | `item-master-input.ts` `priceInputSchema`, `DECIMAL_18_8`, `isoDateSchema` | `item-master-input.test.ts` → five "AC-16:" tests; `item-price-service.db.test.ts` → "AC-16: stores 6.11764706 exactly, as EUR, on the date given with no timezone shift"; "AC-16 failure path: an amount Decimal(18, 8) cannot hold writes nothing" |
| AC-17 | `item-service.ts` `listItems` counts; `FilterBar.tsx` badges | `item-service.db.test.ts` → "AC-17: the four counts are of the whole master, not of the filtered page" (fixture: 16 active, 15 flagged, 10 noted, 0 archived); `tests/e2e/item-master-items.spec.ts` → "AC-6, AC-17: …the badges count" |
| AC-18 | `review-reasons.ts`; `ItemTable.tsx`; `items/[id]/page.tsx` | `review-reasons.test.ts` → "AC-18: covers all eight combinations…" and three more; `item-service.db.test.ts` → "AC-18: a flagged row with nothing missing carries no reason, and a price-less one does"; `tests/e2e/item-master-items.spec.ts` → "AC-18: a below-total fuel row carries no reason and can be reviewed at once" |
| AC-19 | `item-service.ts` — `needsReview` raised on save, lowered only by `markItemReviewed` | `item-service.db.test.ts` → five "AC-19:" tests; `tests/e2e/item-master-items.spec.ts` → "AC-18, AC-19: a flag clears only once every reason is gone" |
| AC-20 | `items/[id]/page.tsx` *Import notes* panel; `notes` is an ordinary editable field | `item-service.db.test.ts` → "AC-20: notes are editable and clearing them changes nothing else"; `tests/e2e/item-master-items.spec.ts` → "AC-20: the cross-sheet note is rendered verbatim beside the unit label that fixes it" (asserts `Dublin!D50`, `1 Unit`, `'Clonmel '!D64`, `16kg`) |
| AC-21 | `item-assignment-service.ts` `assignItemToLocation` — `max + 1` across active and inactive | `item-assignment-service.db.test.ts` → five "AC-21:" tests (fixture 3–84 → 85); `item-master-input.test.ts` → "AC-21: only the two yards of the product brief are codes"; `tests/e2e/item-master-yards.spec.ts` → "AC-21, AC-22: assigning puts an item last, unassigning keeps its place" |
| AC-22 | `unassignItemFromLocation` sets `active = false` and nothing else | `item-assignment-service.db.test.ts` → "AC-22: deactivates the row, keeps its id, sortOrder and every count line"; `item-price-service.db.test.ts` → "AC-22: no shipping module deletes an ItemLocation either"; `tests/e2e/item-master-yards.spec.ts` → "AC-21, AC-22: …" |
| AC-23 | `moveItemInSheet` — a two-row swap in one `db.$transaction` | `item-assignment-service.db.test.ts` → "AC-23: a move is a swap and the multiset of sortOrder values never changes" (Clonmel 3–70 + 75–76, gap intact); "AC-23: UP on the first row and DOWN on the last write nothing at all"; `tests/e2e/item-master-yards.spec.ts` → "AC-23, AC-24: the sheet shows sortOrder, and a move is a swap that keeps the gaps"; "AC-23: the first row has no Move up and the last has no Move down" |
| AC-24 | `listSheet` — `ItemLocation.active` **and** `Item.active`, ordered `sortOrder`, then `description` | `item-assignment-service.db.test.ts` → "AC-24: active links of active items only…" (82 and 84 on the fixture); "AC-24: a tie on sortOrder is broken by description…" |
| AC-25 | `supplier-service.ts`; `items/[id]/page.tsx` supplier choices | `supplier-service.db.test.ts` → eight "AC-25:" tests; `item-master-input.test.ts` → two; `tests/e2e/item-master-yards.spec.ts` → "AC-25, AC-26, AC-29: suppliers are created, renamed, archived and refused readably"; "AC-25: archiving a supplier leaves the item that names it unchanged and marked" |
| AC-26 | `deleteSupplier` / `deleteItemType` — attempt, then count, then `ConflictError` | `supplier-service.db.test.ts` → three "AC-26:" tests; `item-type-service.db.test.ts` → "AC-26, AC-27: a type with items is refused readably; an unused one is deleted"; `tests/unit/item-master-actions-contract.test.ts` → "AC-26: one item, one line, one type - the refusals pluralise" |
| AC-27 | `item-type-service.ts`; `types/page.tsx` — no archive control, no `active` field | `item-type-service.db.test.ts` → nine "AC-27:" tests, including "AC-27: the item-type screen renders no archive control and no active field"; `tests/unit/item-master-actions-contract.test.ts` → "AC-27: there is no action that archives an item type"; `tests/e2e/item-master-yards.spec.ts` → "AC-26, AC-27: …and never archived". `prisma/` byte-identical: `git diff HEAD -- prisma` empty. |
| AC-28 | `src/lib/item-master-messages.ts`; `Notices.tsx`; `SubmitButton.tsx` | `tests/unit/item-master-actions-contract.test.ts` → four "AC-28:" tests asserting every quoted literal from the module; `item-assignment-service.db.test.ts` → "AC-28: a yard with no assignments returns an empty sheet rather than throwing"; `tests/e2e/item-master-yards.spec.ts` → "AC-28: a submit control is disabled while pending, so a double click writes one row"; "AC-28: a yard with nothing assigned says so" |
| AC-29 | services throw only the four typed errors; `form-state.ts` `toFormState` re-throws anything else | `tests/unit/item-master-actions-contract.test.ts` → "AC-29: no message this feature can render carries a database word"; "AC-29: the actions file never imports Prisma and writes no query of its own". Five provoked failures, each asserting the rendered HTML: e2e "AC-8, AC-29" (empty description), "AC-9, AC-29" (duplicate identity), "AC-13, AC-14, AC-15, AC-29" (duplicate price date), "AC-12, AC-29" (delete an item with a line), "AC-25, AC-26, AC-29" (delete a supplier with items) |
| AC-30 | every table inside `overflow-x-auto`; controls `min-h-11`; `break-words` on descriptions | `tests/e2e/item-master-access.spec.ts` → "AC-30: at 390 px the document never scrolls sideways on any of the seven URLs" |
| AC-31 | `tests/unit/project-contract.test.ts` | → "006 AC-31 amending 005 AC-29: exactly nine modules may name unitPrice"; "006 AC-31: src/lib and scripts stay at ZERO files naming it"; "006 AC-31: under src/app and src/components only the three named files may name it"; "006 AC-31: unitPriceSnapshot is STILL named by no shipping module anywhere" |
| AC-32 | every page `export const dynamic = "force-dynamic"`; no module opens a connection at import | `tests/unit/item-master-actions-contract.test.ts` → "AC-3: every page under /item-master declares force-dynamic and guards first"; and executed end to end against an unresolvable host — transcript below |
| AC-33 | `eslint.config.mjs` `LIB_TO_SERVER_PATTERN` + `LIB_TO_SERVER_SELECTOR`; `docs/architecture.md` | `tests/unit/lint-fence.test.ts` → 18 tests: twelve blocked shapes each an error from a `filePath` under `src/lib/`, three permitted shapes at zero, "AC-33: nothing was written to the tree - lintText takes TEXT", "AC-33: docs/architecture.md no longer promises something untrue". Also proved live: the red gate run below |
| AC-34 | `tests/e2e/support/item-master.ts` — per-run suffix, ledger, `cleanUp`, `seededMasterCounts` | every item-master spec's `afterAll` asserts `expect(await seededMasterCounts()).toEqual(before)`; gate transcript below |
| AC-35 | `scripts/run-e2e.mjs` builds once; `playwright.config.ts` serves `npm run start`, `retries: 0`, `timeout: 45_000`, `expect.timeout: 10_000` | two consecutive full runs, transcripts below |

---

## Verification output

### AC-3 — the refusal degrades into a 200, and is put back

Both halves measured with the same probe against the served build, signed in as a
`YARD_STAFF` user, `GET /item-master` with `maxRedirects: 0`.

```
WITH src/app/item-master/loading.tsx present:
  status=200 location=(none) bodyBytes=5052

WITHOUT it (the shipped tree):
  status=307 location=/stock-entry?denied=item-master bodyBytes=5140
             carriesHeading=false carriesEuro=false
```

The load-bearing difference is not the body size — Next's own redirect scaffolding is
about 5 KB either way — it is the **status code and the absent `Location`**. With the
`loading.tsx` in place the Suspense boundary above the page flushes the shell before
`requireAdminPage`'s `redirect()` runs, so the server answers `200` with no `Location` at
all: a refusal `curl` would accept, and `tests/e2e/item-master-access.spec.ts`'s
`expect(response.status()).toBe(307)` fails on it. The file was deleted again in the same
session; `find src/app -name loading.tsx` now returns only `src/app/(public)/loading.tsx`,
which is unchanged (`git diff HEAD` on it is empty), and `/` still answers `200`.

### AC-35 — two consecutive clean runs against a served build

```
run 1:  npm run test:e2e
        [e2e] building the application; the suite runs against the build, not `next dev`.
        56 passed (1.4m)                       exit 0

run 2:  npm run test:e2e
        [e2e] building the application; the suite runs against the build, not `next dev`.
        56 passed (1.7m)                       exit 0
```

Neither transcript contains `flaky`, `failed`, `retry` or `did not run`; both report 56
`ok` lines and exit `0`. Config now: `retries: 0`, `timeout: 45_000`,
`expect.timeout: 10_000`, `webServer.command: "npm run start"`,
`reuseExistingServer: false`. The build happens once, in `scripts/run-e2e.mjs`, before
Playwright starts — Playwright still starts the application itself (002 AC-11).

### The gate goes red

Deliberate break: `src/lib/fence-breach.ts` containing `import { db } from "@/server/db"`.

```
    npm run lint
    C:\Users\User\Documents\Stock_Managment\src\lib\fence-breach.ts
      3:1  error  '@/server/db' import is restricted from being used by a pattern. …
                  no-restricted-imports
    [FAIL] npm run lint failed
    npm run test:unit
     Test Files  3 failed | 20 passed (23)
          Tests  4 failed | 263 passed (267)
    [FAIL] npm run test:unit failed
    npm run test:e2e
    3:1  Error: '@/server/db' import is restricted from being used by a pattern. …
    [FAIL] npm run test:e2e failed
==> Database
    [ok]   database reachable
    [ok]   prisma migrate status
     Test Files  13 passed (13)
          Tests  173 passed (173)
    [ok]   npm run test:db

[FAILED] 3 problem(s):
  - npm run lint failed
  - npm run test:unit failed
  - npm run test:e2e failed

Do not mark any feature done. Record the blocker in progress/current.md.
exit=1
```

One import turned four independent guards red across three steps: AC-33's fence in
`npm run lint`, #3/#4's "every file that touches the database lives under `src/server/`"
in `tests/unit/hashing-boundary.test.ts`, and `next build`'s own ESLint pass inside
`npm run test:e2e`.

**That run also caught two real defects of mine** — see *Deviations* 1 and 2. Both are
fixed; the breach file is deleted.

### The gate is green — `bash ./init.sh`

```
==> Harness integrity
    [ok]   17 required files present
==> Feature list
    [ok]   feature_list.json parses
    [ok]   18 features, 1 in progress
==> Source workbook untouched
    [ok]   Samples/ has no uncommitted changes
==> Application
    [ok]   node v24.14.0
    [ok]   node_modules present
    [ok]   prisma schema valid
    [ok]   npm run typecheck
    [ok]   npm run lint
     Test Files  23 passed (23)
          Tests  267 passed (267)
    [ok]   npm run test:unit
      56 passed (1.7m)
    [ok]   npm run test:e2e
==> Database
    [ok]   database reachable
    [ok]   prisma migrate status
     Test Files  13 passed (13)
          Tests  173 passed (173)
    [ok]   npm run test:db

[OK] Environment ready
```

Not `(database checks skipped)` — `prisma migrate status` and `npm run test:db` both ran
(CHECKPOINTS.md C2.1).

### The gate is green — `./init.ps1`

```
==> Harness integrity
    [ok]   17 required files present
==> Feature list
    [ok]   feature_list.json parses
    [ok]   18 features, 1 in progress
==> Source workbook untouched
    [ok]   Samples/ has no uncommitted changes
==> Application
    [ok]   node v24.14.0
    [ok]   node_modules present
    [ok]   prisma schema valid
    [ok]   npm run typecheck
    [ok]   npm run lint
     Test Files  23 passed (23)
          Tests  267 passed (267)
    [ok]   npm run test:unit
      56 passed (1.5m)
    [ok]   npm run test:e2e
==> Database
    [ok]   database reachable
    [ok]   prisma migrate status
     Test Files  13 passed (13)
          Tests  173 passed (173)
    [ok]   npm run test:db

[OK] Environment ready
exit=0
```

### AC-32 — the same tree with no reachable database

All four connection strings pointed at `no-such-host.invalid`:

```
npx prisma validate    exit=0
npm run typecheck      exit=0
npm run lint           exit=0
npm run test:unit      exit=0
npm run build          exit=0

  Route (app)
  f /item-master                     f /item-master/items/[id]
  f /item-master/items/[id]/delete   f /item-master/items/new
  f /item-master/suppliers           f /item-master/types
  f /item-master/yards/[code]
  -- all seven Dynamic; nothing was prerendered against a database.

bash ./init.sh   exit=0
./init.ps1       exit=0
  [skip] database unreachable at no-such-host.invalid - database-dependent checks skipped
  [OK] Environment ready (database checks skipped)
```


---

## Deviations from the spec

### 1. `src/app/layout.tsx` — the site description no longer says "totals" (AC-2)

AC-2 requires the body of each refused request to match none of
`/unitPrice|price|value|total|amount/i`. The 307 Next returns carries its own redirect
scaffolding, and inside it the app's `<meta name="description">` — emitted on **every**
response the application makes. It said `Yard stock counts, totals and variances for
Macroads.`, and the word `totals` was the only match in the whole body.

I narrowed it to `Yard stock counts and variances for Macroads.` rather than carving a
permanent exception into a money-boundary assertion. Nothing asserted the old string, and
the new one is no less true. **This is a change to a #2 file that AC-31's changed-file set
does not name, and it is here because AC-2 forces it — flagging it for an amendment.**

The alternative the reviewer may prefer: leave the blurb alone and let AC-2's word scan
exclude the static site metadata. I did not do that, because an exception carved into a
money-boundary check is the thing that rots.

### 2. `src/server/items/workbook-plan.test.ts` — 005 AC-25's sweep becomes a list

005 AC-25 asserts "the importer reads no worksheet column beyond E" by scanning every
one- or two-letter uppercase string literal in **every non-test `.ts` under `src/lib/excel`
and `src/server/items`**. Spec 006 § Contract puts eight item-master modules in
`src/server/items/`, and `moveItemInSheet`'s direction — which the Contract spells
`"UP" | "DOWN"` literally, so I cannot rename it — reads as a spreadsheet column. The
green gate would have failed on:

```
AssertionError: src/server/items/item-assignment-service.ts names column UP:
  expected [ 'A', 'B', 'C', 'D', 'E' ] to include 'UP'
```

I narrowed the `src/server/items` half from a directory sweep to the two importer modules
by name (`workbook-plan.ts`, `workbook-import-service.ts`) and added non-vacuity
assertions naming all three scanned importer modules. `src/lib/excel` is still swept
whole, because everything there **is** the reader. The guarantee is unchanged over the
same code — this is the same lesson AC-31 states for the money scan, "a list of files,
never a directory exemption". **This modifies a #5 test and is not in AC-31's changed-file
set — flagging it.**

### 3. `tests/support/item-master-fixture.ts` sits under `tests/`, not `src/server/`

The Level 2 fixtures need to write an `ItemPrice` and a `StockCountLine`, which means
naming `unitPrice` and `unitPriceSnapshot`. AC-31's scan reads every non-test file under
`src/` and `scripts/`, so a fixture at `src/server/items/item-master-fixture.ts` would be
a **tenth** module naming the price column and would name `unitPriceSnapshot`, which AC-31
requires no shipping module to name at all. Putting it under `tests/` — where
`tests/e2e/support/users.ts` already imports `@/server/db` — keeps both assertions exact
with no exemption. The db tests import it relatively (`../../../tests/support/…`), which
is the one place in this feature that does not use the `@/` alias, because the alias maps
only `src/`. **`tests/support/` is a new directory AC-31's set does not name — flagging
it.**

### 4. `tests/e2e/support/users.ts` — two internal timeouts lowered

AC-35 brings `timeout` and `expect.timeout` down. The sign-in helper carried its own
`60_000` and `30_000` waits, both larger than the new 45 s test budget, so neither could
ever have fired. Lowered to 20 s / 15 s so a failure says which half went wrong. **A #3
file, not in AC-31's set — flagging it.**

### 5. `playwright.config.ts` — `fullyParallel: false` and `reuseExistingServer: false`

AC-35 names `retries`, `timeout` and `expect.timeout`. Two further changes were forced:

- **`fullyParallel: false`.** With it true, Playwright distributes ONE file's tests across
  three workers, so each worker runs that file's `beforeAll` — putting three copies of the
  fixture into the user's development database at once, which AC-34 forbids. Files still
  run in parallel across the three workers. Cost: the suite went from ~1.5 min to ~1.7 min.
- **`reuseExistingServer: false`.** Left true, a stray `npm run dev` on port 3000 would be
  silently adopted and the suite would once again be testing the development server that
  AC-35 exists to stop it testing.

### 6. A successful action redirects with `?done=<key>`, a refused one with `?error=<message>`

The spec says the action "either redirects on success or returns a `{ error, field? }`
form state rendered inline". Five actions do exactly that (`createItemAction`,
`updateItemAction`, `addItemPriceAction`, `createSupplierAction`, `createItemTypeAction`)
— they are the ones with typed values worth keeping. The other fourteen are row controls
with nothing to retype, and they redirect either way, which is what makes AC-28's "the new
value is present on the freshly rendered page" true rather than optimistic. The
confirmation travels as a **key** looked up in `item-master-messages.ts`, never as a
sentence, so a hand-written link cannot put words on an admin's screen; the refusal is the
service's own message, which is dynamic and has to travel whole. `safeReturnPath` and
`encodeURIComponent` stop either from steering a redirect.

### 7. `renameSupplierAction` and `renameItemTypeAction` take only `FormData`

They are row controls rendered by Server Components, so they cannot be `useActionState`
actions. Both still appear in the nineteen the Contract names.

---

## Notes for the reviewer

**The Level 2 suite is slow, and it is `resetTestDb`.** The 78 new `*.db.test.ts` tests run
at roughly 2–6 s each against the Neon test branch, almost all of it the nine
`deleteMany`s plus two upserts that `resetTestDb()` does in `beforeEach`. `npm run test:db`
is now 173 tests and about 4.5 minutes, and it is most of the gate's wall time. Two of the
heavier fixtures (an 84-row Dublin sheet, a 70-row Clonmel sheet) use `createMany` with
explicit ids for that reason. Nothing here is a correctness problem; it is worth knowing
before #7–#9 add more.

**AC-2's word scan is satisfied only because of deviation 1.** Worth a moment's thought at
review: the refusal body is Next's redirect scaffolding, and the only reason it now
matches nothing is that the app's own `<meta description>` was reworded. If the reviewer
prefers the blurb restored, AC-2's scan needs an explicit, narrow exemption for static
site metadata instead.

**Two accessibility bugs the e2e specs found, both fixed in `Field.tsx`.** A `<label>` that
*wraps* a `<select>` takes its accessible name from its whole text content — every
`<option>` included — so the Type field was announced as `TypeChoose a typeThermo-PBeads…`.
The same trap swallows an inline error: put it inside the label and `Description` becomes
`Description Description is required.` the moment the field is wrong. Every field now
renders label, control, hint and error as siblings, tied together with `htmlFor` and
`aria-describedby`. Both were invisible on screen and both are exactly what a screen
reader announces.

**Three source scans in this feature strip comments before scanning**
(`src/lib/money.test.ts`, `tests/unit/item-master-actions-contract.test.ts`). A module's
doc comment naming the thing it must not do is not a breach of the rule — it is the
reason the rule is worth asserting. The AC-31 and AC-13 scans deliberately do **not**
strip comments, because they inherit #4's and #5's raw-text form; that is why
`src/lib/money.ts` and `src/lib/item-master-messages.ts` had their comments reworded
rather than the scans relaxed.

**`item-service.ts` selects the five price columns by name.** AC-31's permitted list names
`src/server/items/item-service.ts`, but after I moved the row-to-boundary mapping into
`price-selection.ts` (so that `item-assignment-service.ts` would not become a tenth module
naming the column) `item-service.ts` no longer needed to say `unitPrice` at all, and the
exact-list assertion went red at nine-versus-eight. I gave it an explicit
`prices: { select: { … } }` instead of `prices: true`, which is a narrower query and states
which five columns a screen may learn about a price. Flagging it because the shape of the
code was chosen partly to match the list.

**`markItemReviewed`'s refusal is a `ValidationError` on the field `needsReview`.** There
is no such input on the screen, so it renders above the form via `?error=`. If a reviewer
would rather it were a `ConflictError`, the message and the behaviour are unchanged.

---

## Review outcome

**Verdict:** `CHANGES_REQUESTED` — `progress/review_item_master_ui.md`, 2026-09-11.
All five items are addressed below. Both gate scripts were re-run afterwards.

### The changed-file question is closed, with no amendment needed

I flagged four files as sitting outside "AC-31's changed-file set":
`src/app/layout.tsx`, `src/server/items/workbook-plan.test.ts`, `tests/support/` and
`tests/e2e/support/users.ts`. **There is no such set.** Spec 006 contains no changed-file
criterion — no `git diff --name-only` clause anywhere in it. I was carrying forward #5's
AC-31, which did have one, and applying it to a spec that does not. The reviewer confirmed
it. **No amendment is required and none is requested;** Deviations 1–4 above stand as a
record of *why* each file was touched, not as a request for anything.

### 1. Required — AC-4 was four functions short, and no test pinned the class

`src/server/items/item-service.db.test.ts` tested `listItems` and `createItem` and left
`updateItem`, `setItemActive`, `deleteItem` and `markItemReviewed` — four of the six
functions the module owns — with no refusal test at all. The two that existed checked
`db.item.count()` alone, where AC-4 requires the counts of `Item`, `ItemPrice`,
`ItemLocation`, `Supplier` **and** `ItemType`. And all thirteen refusal tests across the
five services asserted the message string, never that the thing thrown is a
`ForbiddenError`.

Fixed:

- `item-service.db.test.ts` → "AC-4: every item mutation refuses a YARD_STAFF actor and
  writes nothing" now drives **all six** functions plus `getItem`, on a fixture that has a
  supplier, a type, a price and a yard link, and takes a `tableCounts()` before-image over
  all five tables. It also compares the item row **field for field** afterwards — a
  refusal that still edited a row would pass a count.
- `.rejects.toBeInstanceOf(ForbiddenError)` added to at least one call in every service:
  `item-service.db.test.ts` (twice — `listItems` and `createItem`),
  `item-price-service.db.test.ts`, `item-assignment-service.db.test.ts`,
  `supplier-service.db.test.ts`, `item-type-service.db.test.ts`.
- `item-price-service.db.test.ts`'s AC-4 test gained the same `tableCounts()` before-image
  and now covers `listPrices` as well as `addPrice`.

### 2. Required — AC-30 asserted the wrong control

`tests/e2e/item-master-access.spec.ts` named the locator `[data-testid^="move-type-down-"]`
while the variable was called `firstMoveUp` and the criterion names *Move up*. It asserted
a control the criterion does not mention, under a name that claimed otherwise.

Fixed: the assertion now reaches for a real *Move up*, on the **second** row — the first
legitimately has none, because AC-23 renders no *Move up* on the row a move up would be a
no-op for, so asserting on the first row would have been asserting the control is absent
while claiming it is reachable. Both surfaces are covered:

```ts
await page.goto("/item-master/yards/DUBLIN");
const secondRowMoveUp = sheetRows.nth(1).getByRole("button", { name: "Move up" });
await expect(secondRowMoveUp).toBeVisible();
await expect(secondRowMoveUp).toBeEnabled();
// …and the same on /item-master/types
```

### 3. The fence's last static escape — a `TemplateLiteral` is not a `Literal`

Reproduced before fixing, with the backtick spelling of the dynamic import in a file under
`src/lib/`:

```
$ npx eslint src/lib/fence-probe-tmp.ts
eslint exit=0          <-- walks straight past
```

`ImportExpression > Literal[value=/…/]` cannot see it: the argument node is a
`TemplateLiteral`, which has no `value` property for an attribute selector to read.
`[value=…]` was never going to match, however good the regex.

Fixed with a **second** selector on the same pattern, so the two cannot drift into
disagreeing about what `server` means:

```js
const LIB_TO_SERVER_SELECTORS = [
  "ImportExpression > Literal[value=/<pattern>/]",
  "ImportExpression > TemplateLiteral[quasis.0.value.raw=/<pattern>/]",
];
```

Mutation transcript after the fix — the blocked shapes error, the permitted ones do not:

```
# import(`@/server/db`)
  2:17  error  src/lib/ may import '@/server/errors' and nothing else …  no-restricted-syntax
eslint exit=1

# a three-shape probe: @/server/items/item-service, @/server/${name}, then the permitted
  1:43  error  …  no-restricted-syntax
  2:55  error  …  no-restricted-syntax
✖ 2 problems (2 errors, 0 warnings)
  -- the backtick spellings of @/server/errors and @/lib/units, and the quoted
     @/server/errors, each produce nothing.
```

`BLOCKED` in `tests/unit/lint-fence.test.ts` goes from 12 shapes to 15, and `PERMITTED`
from 3 to 5 (the backtick spellings of `@/server/errors` and `@/lib/units`); the file is
now 23 tests. A template **with** substitutions is blocked when its first chunk already
reaches into `@/server/`, which is the honest answer there.

`docs/architecture.md` is amended twice over: it now says "two `no-restricted-syntax`
selectors", names both dynamic spellings and the reason the second is needed, and — new —
states plainly **what the fence does not reach**: a specifier held in a `const`, a
`createRequire` call, or any computed string. The coordinator removed the "every ordinary
import form" hedge, so the document now earns the unhedged claim for the forms a person
writes, and admits in its own words that runtime indirection is kept out by review rather
than by ESLint. The three runtime escapes the reviewer found are left alone, as instructed.

### 4. `doneMessage("toString")` returned a function

`DONE_MESSAGE: Record<string, string>` is an object literal, so it inherits
`Object.prototype`, and `DONE_MESSAGE[key] ?? null` answered `?done=toString` with a
**function** from a lookup TypeScript believes returns a `string`. `Notices.tsx` renders
it and React throws — a crash anybody could put in a link, on an admin-only page.

Fixed with `Object.hasOwn`, plus a `typeof === "string"` belt:

```ts
if (!Object.hasOwn(DONE_MESSAGE, key)) return null;
const message = DONE_MESSAGE[key];
return typeof message === "string" ? message : null;
```

New test, `tests/unit/item-master-actions-contract.test.ts` → "AC-28: a key off
Object.prototype renders nothing, and does not crash the page", over `toString`,
`constructor`, `valueOf`, `hasOwnProperty` and `__proto__`. **Proved by mutation** — with
the old one-liner restored:

```
AssertionError: doneMessage("toString"): expected [Function toString] to be null
      Tests  1 failed | 19 passed (20)
```

and green again once the fix is back.

### 5. AC-6 and AC-17 were inferred rather than measured

The list test asserted only that no *next page* link exists and that the flagged badge was
`not.toBeEmpty()`. Neither is a measurement, and AC-17's "each flagged row links to
`/item-master/items/<id>`" was rendered and never asserted at all.

Fixed, and made concurrency-proof — three spec files run in three workers against the same
development database, so a bare `rows === await db.item.count(...)` would have been a new
source of flakiness, which is the last thing AC-35 wants:

- **Within one page load**, rendered rows must equal the `Active` badge. Both come from
  the same `listItems` call and therefore the same snapshot, so this is immune to a
  parallel worker writing — and it is exactly the property at stake.
- **Polled** across reloads, the rendered row count and each of the four badges must agree
  with a fresh `db.item.count(...)`. A concurrent insert agrees on the next pass; a page
  size never agrees.
- The flagged list's row count must equal the flagged badge, same load.
- Each flagged row's link is asserted to be `/item-master/items/<its data-item-id>`.

**Proved by mutation.** With a temporary 50-row slice in `listItems`:

```
Error: expect(locator).toHaveCount(expected) failed
  Expected: 146
  Received: 50
  13 × locator resolved to 50 elements
  > 156 |   await expect(page.getByTestId("item-row")).toHaveCount(activeBadge);
1 failed
```

A badge of 146 above 50 rows — precisely the failure a page control produces. Restored and
green.

### The gate, after all five

```
bash ./init.sh
==> Application
    [ok]   prisma schema valid
    [ok]   npm run typecheck
    [ok]   npm run lint
     Test Files  23 passed (23)      Tests  273 passed (273)
    [ok]   npm run test:unit
      56 passed (1.9m)
    [ok]   npm run test:e2e
==> Database
    [ok]   database reachable
    [ok]   prisma migrate status
     Test Files  13 passed (13)      Tests  173 passed (173)
    [ok]   npm run test:db

[OK] Environment ready
```

```
./init.ps1
==> Application
    [ok]   prisma schema valid
    [ok]   npm run typecheck
    [ok]   npm run lint
     Test Files  23 passed (23)      Tests  273 passed (273)
    [ok]   npm run test:unit
      56 passed (1.4m)
    [ok]   npm run test:e2e
==> Database
    [ok]   database reachable
    [ok]   prisma migrate status
     Test Files  13 passed (13)      Tests  173 passed (173)
    [ok]   npm run test:db

[OK] Environment ready
exit=0
```

The unit suite goes from 267 to 273 (the prototype-key test, three template-literal
shapes, two permitted template shapes); `test:db` stays at 173, because item 1 replaced
two narrow tests with two wider ones rather than adding any. Neither run says
"(database checks skipped)".

### Second review pass — APPROVED, 2026-09-11

`progress/review_item_master_ui.md` § Second pass. Both required changes and all three
observations closed. The reviewer re-ran the full gate, attacked the fence with 34 shapes
(26 blocked, 4 permitted clean, 4 escaping — all four inside the class
`docs/architecture.md` now names out loud), ran `doneMessage` against thirteen keys
including the whole of `Object.prototype`, and re-snapshotted the development database
against its pass-1 baseline: every row of all 140 items, 129 prices and 152 links still
byte-identical after three full suite runs and four targeted ones.

On the AC-6 / AC-17 disagreement it sided with the implementer — "the implementer is right,
and my suggestion was the wrong fix" — and then checked whether the substitute was actually
equivalent, finding it weaker than the code claimed. Hence the one correction below.

### Comment correction at `tests/e2e/item-master-items.spec.ts:148` — made by the coordinator

**Who made this change and why it is not an implementer change.** The implementer was killed
by an account rate limit for the fifth time on this project, on this one-comment task, before
it could write. The coordinator made the edit rather than spend a sixth agent run on a
comment. It is **provably comment-only**: `git diff` on the file yields zero changed lines
that are not comment lines. No assertion, no test logic and no production code was touched,
the feature was already APPROVED, and the reviewer had specified exactly what the comment
must say. Recorded here so the deviation from role separation is visible rather than
discovered later.

**What was wrong.** The comment claimed "a `take:` or a page size would show a badge of 140
above 50 rows". It would not. `src/server/items/item-service.ts:174-181` computes `counts`
and `rows` from the same in-memory array, so a `take:` shrinks the badge and the rendered
rows together and `toHaveCount(activeBadge)` still passes. The reviewer proved it: with
`take: 50` the failure lands on `expect(activeBadge).toBeGreaterThan(100)` (`Received: 50`),
one line earlier than the comment implied.

**Why it mattered.** A reader trusting the old comment would have concluded the `> 100`
floor was redundant and deleted it, turning a real measurement back into a tautology. The
comment now names the floor as load-bearing, says plainly that the within-one-load equality
is not sufficient alone, records why the obvious `db.item.count()` shape was rejected
(the AC-35 race), and explains why the polled comparisons are the independent measurement.

