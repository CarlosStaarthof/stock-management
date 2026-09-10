# Implementation — feature 5 `seed_from_workbook`

**Spec:** `specs/features/005-seed_from_workbook.md` (approved 2026-09-09, 31 criteria;
AC-17 amended by the user on 2026-09-10 — see the spec's `## Post-approval amendments`)
**Status:** complete

## Files created

- `src/lib/excel/workbook-reader.ts` — reads columns A–E of `Dublin` and `'Clonmel '` into
  152 plain `YardSheetRow`s; concatenates rich-text runs; carries prices as decimal strings.
- `src/lib/excel/workbook-reader.test.ts` — AC-1 to AC-7, against the real workbook plus
  four in-memory fixtures for the defects the real file does not have.
- `src/lib/units.ts` — `normaliseUnit` and `UNIT_KINDS`, Part 2's unit table.
- `src/lib/units.test.ts` — AC-10's table, row by row, plus the schema-text check.
- `src/server/items/workbook-plan.ts` — `buildImportPlan`, `diffPlan`, `buildImportReport`,
  `describeSource`. Pure; imports no Prisma and opens no connection.
- `src/server/items/workbook-plan.test.ts` — AC-8 to AC-17, the plan half of AC-23, and
  AC-25's source scans.
- `src/server/items/workbook-import-service.ts` — `importWorkbook`, the one module that
  touches Prisma. One transaction, insert-only.
- `src/server/items/workbook-import.db.test.ts` — AC-18 to AC-25 against a real Postgres.
- `scripts/seed-workbook.ts` — `npm run seed:workbook [-- --file <p>] [--dry-run]
  [--report <p>]`, renders the report to stdout.

## Files modified

- `package.json` — `exceljs` pinned at `4.4.0` in `dependencies`; `seed:workbook` script.
- `package-lock.json` — `exceljs` and its tree; `npm ci` succeeds from it (exit 0).
- `tests/unit/project-contract.test.ts` — 004 AC-31's `unitPrice` scan amended per AC-29 to
  an exact permitted list, plus two new assertions and an AC-30 package check.
- `progress/current.md` — work log and closing gate.

**Not touched:** `prisma/schema.prisma`, `prisma/migrations/**`, `migration_lock.toml` —
`git status --porcelain -- prisma` is empty. No `prisma migrate dev` was run. Nothing under
`src/app/`, `src/components/` or `Samples/`.

## Acceptance criteria

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | `src/lib/excel/workbook-reader.ts:333` `readYardSheets`, row shape at `:35` | `workbook-reader.test.ts` → "AC-1: returns 152 rows…", "…exactly the eight declared fields", "…no field carries a quantity, a value, a count or a date" |
| AC-2 | `workbook-reader.ts:31` `YARD_SHEET_NAMES`, `:333` exact-name resolution | `workbook-reader.test.ts` → "AC-2: resolves the worksheet whose name is exactly 'Clonmel '…", "AC-2: a workbook with no 'Clonmel ' sheet is a ValidationError…", "AC-2: a sheet named Clonmel without the trailing space is not the sheet" |
| AC-3 | `workbook-reader.ts:257` `findTotalRow`, `:271` `readSheet` | `workbook-reader.test.ts` → "AC-3: Dublin's item block is rows 3-84…", "AC-3: 'Clonmel ' gives rows 3-70 plus…75 and 76", "AC-3: the TOTAL rows are not items, and Dublin's empty row 85 is skipped silently" |
| AC-4 | `workbook-reader.ts:173` `unwrapCellValue`, rich-text branch | `workbook-reader.test.ts` → "AC-4: the five rich-text descriptions concatenate every run…", "AC-4: each of the five is strictly longer than its own first run", "AC-4: every description is a string…", "AC-4: no description begins with a lower-case t" |
| AC-5 | `workbook-reader.ts:231` `cellText` (UTF-8 throughout) | `workbook-reader.test.ts` → "AC-5: text is read as UTF-8, so the euro sign survives"; `workbook-import.db.test.ts` → "AC-5: the euro sign survives the round trip into Item.description" |
| AC-6 | `workbook-reader.ts:139` `toDecimalString`, `:241` `cellPrice`, `:173` formula branch | `workbook-reader.test.ts` → "AC-6: a formula price is imported as its computed value…", "AC-6: the workbook's binary-float artefacts normalise", "AC-6: every price is a decimal string…", "AC-6: a price formula with no cached result names the sheet and the cell", plus the three `toDecimalString` cases |
| AC-7 | `workbook-reader.ts:271` `readSheet`, blank-span skip and blank-description throw | `workbook-reader.test.ts` → "AC-7: a row with a supplier and a price but no description names the sheet and the row", "AC-7: a row that is empty across A-E is skipped rather than refused", "AC-7: all 152 rows of the real workbook carry a description" |
| AC-8 | `workbook-plan.ts:80` `SUPPLIER_VARIANTS`, `:296` `canonicalSupplierName` | `workbook-plan.test.ts` → "AC-8: collapse to exactly the ten canonical names", "AC-8: Kelly (7), Kellys (19) and Kelly's (1) are one supplier", "AC-8: Meon and Visever lose their trailing space…", "AC-8: there is no leading-t strip rule, so tMeon plans a supplier named tMeon", "AC-8: one Dublin row has no supplier at all" |
| AC-9 | `workbook-plan.ts:47` `ITEM_TYPE_ORDER`, `:70` `ITEM_TYPE_VARIANTS`, `:303` | `workbook-plan.test.ts` → "AC-9: are exactly Part 2's nineteen, in Part 2's order, with sortOrder 1-19", "AC-9: Logo's collapses into Logo…" |
| AC-10 | `src/lib/units.ts:69` `normaliseUnit`, `:21` `UNIT_KINDS` | `units.test.ts` → 22 table rows + "…an empty cell is UNIT…", "…null for every kind except TONNE and KILOGRAM", "…20 Kg and 20kg stay two labels", "…11 distinct (kind, kg) pairs", "…I Unit is a capital i", "…a label the table does not name falls to UNIT", "UNIT_KINDS equals the UnitKind labels declared in prisma/schema.prisma"; `workbook-plan.test.ts` → "AC-10: the tally across the 140 items is 24 / 38 / 6 / 71 / 1" |
| AC-11 | `workbook-plan.ts:309` `itemKeyOf` + `:362` `buildImportPlan` (trim only, no collapse) | `workbook-plan.test.ts` → "AC-11: 152 source rows become 140 items and 152 yard links", "…exactly twelve items are held at both yards, and they are these twelve", "…trailing space is trimmed", "…internal whitespace is preserved, so the bicycle logos are four items" (asserts 140 against a collapsed 138), "…the same description under two suppliers is two items", "…every link's sortOrder is its source row number" |
| AC-12 | `workbook-plan.ts:362` review reasons; price omitted when null | `workbook-plan.test.ts` → "AC-12: each is imported and flagged needsReview", "…Dublin!A43 Clock Blue + Yellow Nos is NOT one of them", "…eleven of the thirteen get no ItemPrice at all", "…the other two keep the price they carry", "…129 of the 140 items carry a price"; `workbook-import.db.test.ts` → "AC-12: every imported item is active, and exactly fifteen need review" |
| AC-13 | `workbook-plan.ts:362` below-total note and `BELOW_TOTAL_ROW` reason | `workbook-plan.test.ts` → "AC-13: are imported in full, linked to Clonmel, priced and flagged", "…each carries a note naming its cell…", "…Dublin contributes no below-total row", "…fifteen items are flagged needsReview and no others"; `workbook-import.db.test.ts` → "AC-13: the two below-total fuel rows are linked to Clonmel, priced and flagged" |
| AC-14 | `workbook-plan.ts:362` merge branches (first non-null wins; price conflict throws) | `workbook-plan.test.ts` → "AC-14: five items disagree on the unit label, and Dublin wins each time", "…five items disagree on the item type…", "…the ten disagreements fall on eight distinct items, each with a note", "…zero items disagree on price", "…a price disagreement refuses the whole run, naming both cells and both prices" |
| AC-15 | `workbook-plan.ts:362` `notes` joined, `null` when empty | `workbook-plan.test.ts` → "AC-15: exactly ten items carry a note, and the other 130 carry none"; `workbook-import.db.test.ts` → "AC-15: exactly ten items carry a note" |
| AC-16 | `workbook-plan.ts:847` `buildImportReport`, `:220` `describeSource` | `workbook-plan.test.ts` → "AC-16: names the source, the sheets and the counts", "…lists the fifteen flagged items…", "…lists the four collapsed supplier spellings with their row counts", "…lists the twelve shared items and the ten conflicts", "…every array is ordered by sheet then row", "…building it twice…gives two identical JSON strings" |
| AC-17 (as amended 2026-09-10) | `workbook-plan.ts:210` `ReportCount` (a list of tables, not a `prices` key); `divergences[]` exempt | `workbook-plan.test.ts` → "AC-17: the ordinary report, whose divergences[] is empty, carries no money", "AC-17: a report whose divergences[] is NOT empty carries no money outside it either", "AC-17 with AC-22: the exempt array does carry both figures, so the exemption earns itself", "AC-17: MISSING_PRICE is a reason code, which is a value and not a key"; corroborated in `workbook-import.db.test.ts` → "AC-22: four ADMIN corrections survive a third run…" |
| AC-18 | `workbook-import-service.ts:183` `importWorkbook` | `workbook-import.db.test.ts` → "AC-18: creates 10 suppliers, 19 types, 140 items, 129 prices and 152 links" (also asserts Location 2, User 0, StockCount 0, StockCountLine 0) |
| AC-19 | `workbook-plan.ts:611` `diffPlan` location resolution (`NotFoundError`) | `workbook-import.db.test.ts` → "AC-19: are used and never created, and the 152 links split 82 / 70", "AC-19: a database with no CLONMEL row fails with NotFoundError and writes nothing"; `workbook-plan.test.ts` → "AC-19: refuses a database with no CLONMEL yard, and names the code" |
| AC-20 | `workbook-import-service.ts:311` price rows; `workbook-plan.ts:36-39` constants | `workbook-import.db.test.ts` → "AC-20: land exactly as the workbook computes them, on the 2025 list" (asserts `6.11764706` and `33.09` through Prisma), "AC-20: every item has at most one price…" |
| AC-21 | insert-only diff at `workbook-plan.ts:611` | `workbook-import.db.test.ts` → "AC-21: creates nothing, changes nothing, and does not recreate a single row" (full dump, ids included) |
| AC-22 | `workbook-plan.ts:655` second matching pass; no write path in the service | `workbook-import.db.test.ts` → "AC-22: four ADMIN corrections survive a third run, and each is reported as a divergence", "AC-22: the service module contains no update, no delete and no upsert"; `workbook-plan.test.ts` → "AC-22: a stored row that differs is reported, never changed" |
| AC-23 | `workbook-plan.ts:309` `itemKeyOf` (two nulls equal), `:640` exact match pass | `workbook-plan.test.ts` → "AC-23: two supplier-less rows with the same description collapse into one item", "AC-23: a supplier-less item already in the database is matched, not duplicated"; `workbook-import.db.test.ts` → "AC-23: two runs leave exactly one School Logo Triangle", "AC-23: an item inserted by hand with a null supplier is matched, not copied" |
| AC-24 | `workbook-import-service.ts:188` one `$transaction`, `:373` explicit timeout | `workbook-import.db.test.ts` → "AC-24: a plan whose second item is refused leaves zero rows, not one" |
| AC-25 | `workbook-reader.ts:73-77` columns A–E only; exclusions in the header comment | `workbook-plan.test.ts` → "AC-25: reads no worksheet column beyond E", "AC-25: names Summary and Clonmel Trucks & Yard only in a comment that excludes them"; `workbook-import.db.test.ts` → "AC-25: imports no historical count data at all" |
| AC-26 | `scripts/seed-workbook.ts` | Transcripts below: default run exit 0 with the 140 count and the 15 entries; second run exit 0; `--report` writes JSON; `Samples/` untouched; a failing run names the database and exits 1 |
| AC-27 | pure plan/report path; `workbook-import-service.ts:383` `planWorkbook` | Transcripts below: four commands, the dry run and both `init` scripts at exit 0 against unresolvable hosts; the non-dry run exits 1 |
| AC-28 | file names as specified; `vitest.db.config.ts` unchanged | `tests/unit/project-contract.test.ts` → "004 AC-27 / 003 AC-26: test:unit excludes *.db.test.ts…"; `npm run test:unit` runs 0 `*.db.test.ts`; `npm run test:db` passed twice in a row |
| AC-29 | `tests/unit/project-contract.test.ts:104` onwards | Same file → "005 AC-29 amending 004 AC-31: exactly two modules may name unitPrice", "005 AC-29: nothing under src/app, src/components, src/lib or scripts names it at all", "005 AC-29: unitPriceSnapshot is still named by no shipping module anywhere" |
| AC-30 | `package.json`, `package-lock.json` | `tests/unit/project-contract.test.ts` → "005 AC-30: exceljs is a pinned dependency and seed:workbook is a script"; `npm ci` exit 0; `npx prisma validate` valid; `npx prisma migrate status` up to date; both `init` scripts `[OK] Environment ready`; `git status --porcelain -- prisma` empty |
| AC-31 | — | `git status --porcelain` below: nine paths, none under `src/app/` or `src/components/`; grep shows `src/lib/excel/workbook-reader.ts` and `src/lib/units.ts` import neither `@prisma/client` nor `@/server/db`, so `tests/unit/hashing-boundary.test.ts` needed no change |

## Verification output

### Both gates, green, database checks EXECUTED

```
./init.ps1                                              ->  exit 0
==> Harness integrity        [ok]   17 required files present
==> Feature list             [ok]   18 features, 1 in progress
==> Source workbook untouched[ok]   Samples/ has no uncommitted changes
==> Application              [ok]   node v24.14.0 / node_modules present / prisma schema valid
                             [ok]   npm run typecheck
                             [ok]   npm run lint
                             [ok]   npm run test:unit
                             [ok]   npm run test:e2e
==> Database                 [ok]   database reachable
                             [ok]   prisma migrate status
                             [ok]   npm run test:db
[OK] Environment ready
init.ps1 exit 0

bash ./init.sh                                          ->  exit 0
    (identical block)
[OK] Environment ready
init.sh exit 0
```

Neither ends `(database checks skipped)`.

```
npm run test:unit    ->  Test Files 17 passed (17)   Tests 183 passed (183)
npm run test:db      ->  Test Files  8 passed  (8)   Tests  95 passed  (95)
                         of which src/server/items/workbook-import.db.test.ts: 16 passed
npm ci               ->  exit 0
npx prisma validate  ->  The schema at prisma\schema.prisma is valid
npx prisma migrate status -> 2 migrations found; Database schema is up to date!
git status --porcelain -- prisma   ->  (empty)
git status --porcelain -- Samples  ->  (empty)
```

### AC-26 — `npm run seed:workbook`, end to end against the development database

```
$ npm run seed:workbook
[seed:workbook] source
  file    Samples/Stock @ 01-Sep-2026.xlsx
  bytes   90567
  sha256  6308ae040163d3d008cb0622fc83c70987ceaf44389d59a457ab5e6a2f54bff0

[seed:workbook] sheets
  "Dublin"     rows 3-84, 82 read, 0 below the total row
  "Clonmel "   rows 3-70, 68 read, 2 below the total row

[seed:workbook] counts
  table           planned  created  skipped
  Supplier             10       10        0
  ItemType             19       19        0
  Item                140      140        0
  ItemPrice           129      129        0
  ItemLocation        152      152        0

[seed:workbook] needs review (15)
  Dublin!A9        Ultraforce L247 MMA Kit (3 Part Kit)   MISSING_UNIT
  Dublin!A12       Anti-skid re-instatement               MISSING_PRICE
  Dublin!A18       Bicycle Logo's  1200mm                 MISSING_UNIT, MISSING_PRICE
  Dublin!A29       Pedestrian Logo White                  MISSING_UNIT, MISSING_PRICE
  Dublin!A44       600mm x 100mm White Strips             MISSING_UNIT, MISSING_PRICE
  Dublin!A45       School Logo Triangle                   MISSING_SUPPLIER, MISSING_UNIT, MISSING_PRICE
  Dublin!A46       Click & Collect                        MISSING_UNIT, MISSING_PRICE
  Dublin!A47       Ultaline 210 White                     MISSING_PRICE
  Dublin!A48       Ultaline 210 Yellow                    MISSING_PRICE
  Dublin!A62       Multigrip Signal Yellow                MISSING_PRICE
  Dublin!A63       Multigrip Chrome Yellow                MISSING_PRICE
  Dublin!A78       CP Primer                              MISSING_UNIT
  'Clonmel '!A54   Pedestrian Logo 980 White              MISSING_PRICE
  'Clonmel '!A75   Road Diesel - White                    BELOW_TOTAL_ROW
  'Clonmel '!A76   Marked Gas Oil - Green                 BELOW_TOTAL_ROW

[seed:workbook] supplier spellings collapsed (4)
  "Kellys"     -> "Kelly"      19 row(s), first at Dublin!B18
  "Visever "   -> "Visever"    2 row(s), first at Dublin!B75
  "Meon "      -> "Meon"       1 row(s), first at Dublin!B80
  "Kelly's"    -> "Kelly"      1 row(s), first at 'Clonmel '!B53

[seed:workbook] items held at both yards (12)          ... 12 rows, Dublin!Ann + 'Clonmel '!Ann
[seed:workbook] cross-sheet disagreements (10)         ... 5 unitLabel + 5 itemType, Dublin wins each
[seed:workbook] workbook/database divergences left untouched (0)

[seed:workbook] created 140 items, 10 suppliers, 19 types, 129 prices, 152 yard links.
EXIT 0

$ npm run seed:workbook               # the nervous re-run
  Supplier             10        0       10
  ItemType             19        0       19
  Item                140        0      140
  ItemPrice           129        0      129
  ItemLocation        152        0      152
[seed:workbook] created 0 items, 0 suppliers, 0 types, 0 prices, 0 yard links.
EXIT 0

$ git status --porcelain -- Samples
(empty)

$ npm run seed:workbook -- --dry-run --report <scratch>/report.json
EXIT 0
[seed:workbook] report written to <scratch>/report.json
[seed:workbook] dry run: nothing was written and no database was opened.
   report.json: counts [Supplier 10, ItemType 19, Item 140, ItemPrice 129, ItemLocation 152]
                needsReview 15  variants 4  shared 12  conflicts 10
                source Samples/Stock @ 01-Sep-2026.xlsx 90567 6308ae040163d3d0
```

With `--report` omitted the run writes no file: `git status --porcelain` lists only the
nine paths below, and no report file anywhere.

### AC-27 — with all four URLs pointing at hosts that do not resolve

`DATABASE_URL` / `DIRECT_URL` = `postgresql://u:p@host.invalid:5432/db`,
`TEST_DATABASE_URL` / `TEST_DIRECT_URL` = `postgresql://u:p@host2.invalid:5432/db`.

```
npm run typecheck                 -> exit 0
npm run lint                      -> exit 0
npm run test:unit                 -> exit 0
npm run build                     -> exit 0
npm run seed:workbook -- --dry-run-> exit 0
      table           planned  created  skipped
      Item                140      140        0

npm run seed:workbook             -> exit 1
      [seed:workbook] the import failed against the database and nothing was written:
      Can't reach database server at `host.invalid:5432`

bash ./init.sh                    -> exit 0
      [skip] database unreachable at host.invalid - database-dependent checks skipped
      [OK] Environment ready (database checks skipped)

./init.ps1                        -> exit 0
      [skip] database unreachable at host.invalid - database-dependent checks skipped
      [OK] Environment ready (database checks skipped)
```

`npm run test:db` still refuses the development database:

```
$ TEST_DATABASE_URL=<same as DATABASE_URL> npm run test:db
[test:db] TEST_DATABASE_URL must not equal DATABASE_URL. These tests delete every row
between tests; point TEST_DATABASE_URL at a separate database or Neon branch.
exit 1
```

### Proving the gate goes red — five mutations, each reverted

**Mutation 1 — plan one extra item** (`buildImportPlan` pushes a 141st item):

```
$ npm run test:unit
 × items > AC-11: 152 source rows become 140 items and 152 yard links
   → expected [ { …(12) }, { …(12) }, …(139) ] to have a length of 140 but got 141
 × items > AC-11: exactly twelve items are held at both yards, and they are these twelve
 × items > AC-11: internal whitespace is preserved, so the bicycle logos are four items
   → expected 139 to be 138
 × the two rows below Clonmel's total > AC-13: fifteen items are flagged needsReview and no others
 × notes > AC-15: exactly ten items carry a note, and the other 130 carry none
 × the import report > AC-16: names the source, the sheets and the counts
 × the import report > AC-16: lists the twelve shared items and the ten conflicts
 × the import report > AC-16: every array is ordered by sheet then row
 Test Files  1 failed | 16 passed (17)
      Tests  14 failed | 169 passed (183)
$ (reverted)  ->  Tests 183 passed (183)
```

**Mutation 2 — the `tBriteline` regression** (the reader takes the first `<t>` run alone):

```
$ npm run test:unit
 × AC-4: the five rich-text descriptions concatenate every run, not just the first
   → expected 'White -' to be 'White - Briteline'
     Expected: "White - Briteline"
     Received: "White -"
 × AC-4: each of the five is strictly longer than its own first run
 Test Files  1 failed | 16 passed (17)
$ (reverted)  ->  Tests 183 passed (183)
```

**Mutation 3 — glue a price into `needsReview[].description`** (the leak the amended AC-17
must catch). This is the mutation that found my first scan wanting: with the old block it
stayed **green**, which is why scan (b) exists. With scan (b) in place:

```
$ npx vitest run src/server/items/workbook-plan.test.ts
 × AC-17: the ordinary report, whose divergences[] is empty, carries no money
   → ordinary report: "Ultraforce L247 MMA Kit (3 Part Kit) 173.29" carries 173.29:
     expected true to be false
 × AC-17: a report whose divergences[] is NOT empty carries no money outside it either
   → report with a corrected price: "Ultraforce L247 MMA Kit (3 Part Kit) 173.29" carries 173.29
 Test Files  1 failed (1)
$ (reverted)  ->  Tests 46 passed (46)
```

**Mutation 4 — stop reporting price divergences** (`recordDivergence` returns early for
`ItemPrice`), which would make the exemption vacuous again:

```
$ npx vitest run src/server/items/workbook-plan.test.ts
 × AC-17: a report whose divergences[] is NOT empty carries no money outside it either
   → expected [] to not deeply equal []
 × AC-17 with AC-22: the exempt array does carry both figures, so the exemption earns itself
   → expected [] to deeply equal [ { entity: 'ItemPrice', …(4) } ]
 × AC-22: a stored row that differs is reported, never changed
   → expected [ 'active', 'unitLabel' ] to deeply equal [ 'active', 'unitLabel', 'unitPrice' ]
 Test Files  1 failed (1)
$ (reverted)  ->  Tests 46 passed (46)
```

**Mutation 5 — remove the supplier-less second matching pass** (`diffPlan`):

```
$ npm run test:db -- src/server/items/workbook-import.db.test.ts
 × a re-run never overwrites a human's edit > AC-22: four ADMIN corrections survive a
   third run, and each is reported as a divergence
   → expected { suppliers: +0, itemTypes: +0, …(3) } to deeply equal { … }
 Test Files  1 failed (1)
$ (reverted)  ->  Test Files 1 passed (1)   Tests 16 passed (16)
```

### AC-31 — the changed-file list

```
$ git status --porcelain
 M package-lock.json
 M package.json
 M progress/current.md
 M tests/unit/project-contract.test.ts
?? scripts/seed-workbook.ts
?? src/lib/excel/workbook-reader.ts
?? src/lib/excel/workbook-reader.test.ts
?? src/lib/units.ts
?? src/lib/units.test.ts
?? src/server/items/workbook-plan.ts
?? src/server/items/workbook-plan.test.ts
?? src/server/items/workbook-import-service.ts
?? src/server/items/workbook-import.db.test.ts
                                        (+ progress/impl_seed_from_workbook.md, this file)
```

No path under `src/app/`, `src/components/`, `prisma/` or `Samples/`. `feature_list.json`
and the spec are unchanged: #5 was already `in_progress` with its 31 criteria mirrored, and
the implementer does not mark a feature `done`.

## Deviations from the spec

Five, all in the Contract's shapes rather than in a criterion. Every one of AC-1 to AC-31
is satisfied as written; each deviation exists because a criterion could not otherwise be
met.

1. **`YardSheetRow.supplier` is NOT trimmed** — the Contract's comment says "cell text,
   trimmed". It returns the cell text as written, `null` when blank or all spaces.
   *Why:* AC-16 requires `supplierVariants[]` to name `Meon ` and `Visever ` — the
   trailing-space spellings — as collapsed variants with row counts 1 and 2. If the reader
   trimmed, those two spellings would be indistinguishable from their canonical form, the
   variant list would hold two entries rather than four, and `Meon` would show a row count
   of 31 rather than 1. AC-16 would be unsatisfiable. The trim and the collapse happen in
   `buildImportPlan`, which is where the spec's own field-by-field table puts them
   ("`Supplier.name` **after** trimming and collapsing"), and AC-8's "no planned supplier
   name has leading or trailing whitespace" is asserted on the plan and passes.
   `description` and `itemType` are trimmed by the reader exactly as the Contract says.

2. **`ImportPlan` carries four extra sections** — `sheets`, `supplierVariants`,
   `sharedItems`, `conflicts` — and `ImportPlan.items[]` two extra fields, `cells` and
   `reviewReasons`. The three declared sections and the eleven declared item fields are
   present, unchanged, with their declared meanings.
   *Why:* AC-16 asks `buildImportReport` for a variant's original spelling and for a
   conflict's two cells and two readings. Neither is recoverable from
   `{ suppliers, itemTypes, items }`, so a two-argument `buildImportReport(plan, diff)`
   could not produce them. Every added section is derived from `rows` alone, so
   `buildImportPlan(rows)` keeps the single argument the module table gives it, and every
   added field is non-monetary, so AC-17 is unaffected.

3. **`buildImportReport` takes a third argument, `source`** — the module table writes
   `buildImportReport(plan, diff)`.
   *Why:* AC-16 requires the report's `source` section to carry the file name, byte length
   and SHA-256 of the bytes read. None of the three is a property of a plan or of a diff,
   so the two-argument signature cannot produce them. `describeSource(fileName, bytes)` in
   the same module builds the value.

4. **The report's `counts` is a list of `{ table, planned, created, skipped }`** rather
   than an object with a `prices` field.
   *Why:* AC-17 forbids any key matching `/price|value|amount/i` at any depth, and
   `prices` matches `/price/i`. As a list, `ItemPrice` is a *value* — the same distinction
   AC-17 draws for the `MISSING_PRICE` reason code. `ImportOutcome.created` and
   `.skipped` keep the Contract's `{ suppliers, itemTypes, items, prices, links }` exactly,
   because AC-17 constrains the report and not the outcome.

5. **Two extra exports**: `ImportWorkbookInput` accepts `{ source, plan }` as well as
   `{ fileName, bytes }`, and the service also exports `planWorkbook`.
   *Why:* AC-24 proves atomicity with "a plan whose second item has a whitespace-only
   description". The reader refuses that before a row is written (AC-7), so without a
   plan-shaped input the rollback could not be exercised at all. `planWorkbook` is what
   AC-27's `--dry-run` calls; it opens no connection.

Both input shapes are parsed by the Zod schema at `workbook-import-service.ts:143`, as
`docs/architecture.md` § Validation requires. `description` there is `z.string()` with no
`.min(1)` on purpose: Invariant 9 is the database's hand-written
`Item_description_not_empty`, and AC-24 proves that CHECK — inside the transaction — is
what rolls the import back. A `.min(1)` in Zod would replace that proof with a proof that
Zod works.

## Notes for the reviewer

**1. The AC-17 / AC-22 collision I flagged has been ruled on, and the test — not the code —
changed.** The user ruled on 2026-09-10 that the report shows both figures, inside
`divergences[]` and nowhere else; AC-17 is amended to "no money **outside
`divergences[]`**" with the reasoning in the spec's new `## Post-approval amendments`
section. **No production code changed:** `recordDivergence` and its callers already did
exactly that.

What did change is `workbook-plan.test.ts`'s AC-17 block, because the amendment closes the
vacuity I had noted in passing — the exemption had never met a report with a price in it.
There are now four tests where there were four, but they cover three things the old block
did not:

- `assertMoneyFreeOutsideDivergences(...)` runs **twice**: once on the ordinary report
  (`divergences: []`, asserted) and once on a report built from a database in which an
  ADMIN has corrected `Beads` from the workbook's `790` to `800`, whose `divergences` is
  asserted **non-empty** before the scan. The array is removed on a **structural copy**
  (`{ ...report }` then `delete copy.divergences`), never by surgery on serialised JSON.
- a positive assertion that the exempt array **does** carry both figures — the whole
  divergence is matched, `workbook: "790"` and `database: "800"` — so the exemption cannot
  quietly stop carrying what AC-22 requires of it.
- **a third scan I had to add**, because the mutation test found the old one wanting. My
  original technique — `JSON.stringify(outside)` must not contain `JSON.stringify(price)` —
  is exactly "no string leaf and no key **equals** a price", and it is kept. But a price
  *glued into* a longer string is not a whole leaf: mutating `buildImportReport` to render
  `needsReview[].description` as `"Ultraforce L247 MMA Kit (3 Part Kit) 173.29"` left the
  suite **green**. Every price carrying a decimal point is now also searched for **inside**
  each string leaf, which turns that mutation red. Only the decimal prices: an integer
  price cannot be told from a row number or a colour code without false positives, and the
  workbook proves it — `102` is a real price and `ViaLine  Traffic Red RAL1023` is a real
  description. I measured the collisions rather than guessing: over the real report's
  string leaves, every price containing a `.` has **zero** collisions and `102` has six.
  That residue — an integer price embedded mid-string — is covered by scan (a) when it is a
  whole leaf and by scan (c), the exact nine structural number-keys, when it is a number.

A corroborating assertion is also in `workbook-import.db.test.ts`'s AC-22 test, on a report
the service really produced after a real ADMIN price correction. The **proof** of AC-17
stays in the pure suite, because AC-27 requires AC-1 to AC-17 to be provable in
`npm run test:unit` with no database.

**2. AC-22's third run needs one rule AC-23 does not state.** AC-23 fixes the match on
`(description, supplierId ?? null)`. That rule alone makes AC-22 fail: once an ADMIN sets
`School Logo Triangle`'s supplier to `Kestrel`, the stored row no longer sits under the key
the workbook plans it under, so the next run would insert a second, blank copy — and AC-22
says the third run "creates nothing". `diffPlan` therefore runs a **second pass**
(`workbook-plan.ts:655`), after AC-23's exact pass, in which a planned item **with no
supplier** may claim a stored row of the same description that no other planned item has
claimed. It is deliberately narrow: it never applies to a planned item that has a supplier,
so AC-11's "the same description under two suppliers is two items" is untouched.

**3. AC-17's second clause is asserted in its exact, satisfiable form.** A literal
substring search for every price would fail on `"3"` against the report's `firstRow: 3`.
Since prices are decimal *strings* everywhere in this feature, the test searches for
`JSON.stringify(price)` — which can only match a string leaf or a key equal to the price —
and closes the numeric gap with a separate assertion that the set of keys holding numbers
in the report is exactly nine structural names. A price leaked as a number would need a
tenth.

**4. `src/lib/excel/workbook-reader.ts` imports `@/server/errors`.** AC-2, AC-6 and AC-7
require the reader to throw `ValidationError`. `errors.ts` is four classes and no state; it
imports nothing. The rule that matters — and the one AC-31 states — is that the reader
imports neither `@prisma/client` nor `@/server/db`, and it imports neither, so
`tests/unit/hashing-boundary.test.ts` needed no change.

**5. `describeSource` lives in the plan module, not the service,** so that AC-22's scan for
`.update` can stay a plain unqualified search. Node's digest API is
`createHash(…).update(…)`, and with it in the service the criterion's own literal scan would
have gone red on a call that touches no table. Moving it also puts the report's `source`
beside `buildImportReport`, which is where it belongs.

**6. Two behaviours the spec does not pin, chosen and commented in the code.** An
unrecognised unit label falls to `UNIT` rather than throwing (`prisma/schema.prisma` says
that is what the default means, and Part 2 says a row is never silently dropped); an item
type outside Part 2's nineteen is created with a sort order after them rather than refused.
Neither occurs in this workbook — the file yields exactly the 22 labels and 19 types the
spec names — so neither affects a criterion.

**7. Every figure in the spec was re-derived before any code was written,** by unzipping
the workbook into a scratch directory and parsing `xl/worksheets/sheet2.xml`,
`sheet3.xml` and `xl/sharedStrings.xml` with a throwaway script, independently of ExcelJS.
All of them agreed: 152 rows, 140 items, 12 shared, 152 links (82/70), 10 suppliers, 19
types, 129 prices, 13 + 2 = 15 flagged, 10 conflicts over 8 items, 24/38/6/71/1, 22 labels
plus 7 blanks, 11 `(unitKind, unitQuantityKg)` pairs. I found no figure in the spec to
disagree with. `git status --porcelain -- Samples` was empty before and after.

**8. The development database now holds the import** (140 items, 129 prices, 152 links),
because AC-26 asks for an end-to-end run and that is where an ADMIN runs it. The test
branch is emptied between tests by `resetTestDb()`. No migration was applied or created.

---

## Review outcome

**Verdict: CHANGES_REQUESTED**, on test coverage only — no production logic was found wrong.
Full report: `progress/review_seed_from_workbook.md`. The reviewer re-derived every figure
with its own parser and agreed with all of them, and built six adversarial fixtures against
`diffPlan`'s second matching pass and found it correctly narrow. All five items are done.

### 1. `describeSource` had no test — AC-16's `source` clause had no proof (required)

The report tests fed `buildImportReport` a fabricated `SOURCE`, so they would have passed on
a function that returned a constant. Two tests added to `workbook-plan.test.ts`:

- **"AC-16: names the file and digests the bytes that were actually read"** — calls
  `describeSource` on the real workbook and asserts the whole object, with the two figures
  the coordinator verified independently (Python `hashlib` and `sha256sum`) as literals:
  `byteLength: 90567`, `sha256: 6308ae040163d3d008cb0622fc83c70987ceaf44389d59a457ab5e6a2f54bff0`.
- **"AC-16: one byte changed is a different digest, so the digest is of the bytes"** — flips
  one byte, asserts the length is unchanged and the digest is not. This is what stops the
  first test passing on a constant.

### 2. `planWorkbook` had no test at all (required)

Three tests added, in `workbook-plan.test.ts` and **not** in a `*.db.test.ts`, so they run
in `npm run test:unit`: needing no database is the whole point of the function and AC-27
requires that provable without one. They live in the plan test rather than a new file so
that AC-28's and AC-31's file lists stay exactly as the spec states them.

- success: real workbook bytes in → `plan.items.length === 140`, the report's `Item` count
  row is `{ planned: 140, created: 140, skipped: 0 }`, 15 `needsReview` entries, no
  divergences, and `source.byteLength` 90567.
- failure: a buffer that is not an `.xlsx` → `ValidationError` mentioning `xlsx`.
- failure: a workbook with a `Dublin` sheet and no `Clonmel ` → `ValidationError` naming
  `Clonmel`.

**One production change was needed for the first failure case.** `readYardSheets` now wraps
a failed `workbook.xlsx.load` in `ValidationError`. Unwrapped, `npm run seed:workbook --file
wrong.pdf` printed a ZIP library's stack trace, which AC-26 forbids and which
`docs/architecture.md` § Error handling forbids of a service. Importing the service into the
pure suite pulls in `@/server/db`, which is a lazy proxy — AC-27 was re-run afterwards and
`npm run test:unit` still exits 0 with every URL pointing at a host that does not resolve,
so nothing connects.

### 3. Determinism in the read that feeds matching (non-blocking, done)

`orderBy: { id: "asc" }` added to **all six** `findMany` calls in the import transaction.
`tx.item.findMany` is the load-bearing one: `diffPlan`'s second pass walks `existing.items`
for the first unclaimed row of a description, and unordered, two runs can claim two
different rows — the reviewer reproduced `item_kelly` on one run and `item_kestrel` on the
next. Nothing was ever corrupted, because the importer is insert-only, but `divergences[]`
would differ between runs and AC-16 promises a deterministic report. The reason is written
into the code above the reads, not left to this document.

### 4. The second matching pass pinned as a stated rule (non-blocking, done)

It was proved only indirectly — the database test went red when the pass was deleted — so
the reviewer had to discover its safety properties by experiment. Three pure tests in
`workbook-plan.test.ts` now state them:

- **"a planned item WITH a supplier never claims another supplier's row"** — `Thing` stored
  under Kelly, `Thing` planned under Kestrel: the import creates the second rather than
  adopting the first, so AC-11's "the same description under two suppliers is two items"
  cannot be eroded by widening the pass.
- **"an exact key match always beats the loose one"** — both stored rows carry the planned
  description and the supplier-less one is listed **second**, so a loose-first
  implementation would claim the wrong row and then create a duplicate. Neither is created.
- **"a row an exact match already claimed cannot be claimed a second time"** — the claimed
  set is what stops the loose pass stealing a row.

### 5. The `src/lib` → `src/server` boundary is now lint-enforced (non-blocking, done)

`docs/architecture.md` was amended by the coordinator, not by me: the rule was a proxy for
"nothing in `src/lib/` may reach a database or a server-only runtime", and four stateless
error classes compromise neither. The doc now says the narrow exception is **enforced by
ESLint**, so I made that true. `eslint.config.mjs` gains a block for `src/lib/**` that
applies the existing Prisma restriction and two further patterns: everything under
`@/server/` except `@/server/errors` itself, and any relative path reaching into `server`
behind the alias's back.

**Mutation transcript.** A scratch file `src/lib/boundary-probe.ts` was created, linted,
and deleted; `git status --porcelain -- src/lib` afterwards lists only this feature's own
files.

```
$ cat src/lib/boundary-probe.ts
import { db } from "@/server/db";
export const probe = db;

$ npm run lint
src/lib/boundary-probe.ts
  1:1  error  '@/server/db' import is restricted from being used by a pattern.
              src/lib/ may import '@/server/errors' and nothing else from src/server/. …
              no-restricted-imports
✖ 1 problem (1 error, 0 warnings)
lint exit 1

$ cat src/lib/boundary-probe.ts          # a service, and a relative reach-around
import { buildImportPlan } from "@/server/items/workbook-plan";
import { ValidationError } from "../server/errors";

$ npm run lint
  1:1  error  '@/server/items/workbook-plan' import is restricted …  no-restricted-imports
  2:1  error  '../server/errors' import is restricted …              no-restricted-imports
✖ 2 problems (2 errors, 0 warnings)

$ cat src/lib/boundary-probe.ts          # the one permitted import
import { ValidationError } from "@/server/errors";

$ npm run lint
lint exit 0

$ rm src/lib/boundary-probe.ts && npm run lint
lint exit 0
```

The pre-existing `@/server/errors` import in `src/lib/excel/workbook-reader.ts` stays clean,
which is the point: the exception holds and cannot widen.

### Gate after the review changes

```
npm run typecheck  -> exit 0
npm run lint       -> exit 0
npm run test:unit  -> Tests 191 passed (191)      (was 183; +8 from items 1, 2 and 4)
npm run test:db    -> Tests  95 passed  (95)      (16 of them this feature's)

./init.ps1         -> [OK] Environment ready      database checks EXECUTED
bash ./init.sh     -> [OK] Environment ready      database checks EXECUTED
```

AC-27 re-verified after the new service import, with `DATABASE_URL`, `DIRECT_URL`,
`TEST_DATABASE_URL` and `TEST_DIRECT_URL` all at hosts that do not resolve:

```
npm run typecheck / lint / test:unit / build   -> exit 0
npm run seed:workbook -- --dry-run             -> exit 0,  Item  140  140  0
```

### One file outside AC-31's list

`eslint.config.mjs` is changed, and AC-31's changed-file list does not name it. It is there
because the review required it and because `docs/architecture.md` — amended in the same
review — now states the boundary is lint-enforced. `docs/architecture.md`,
`specs/features/005-seed_from_workbook.md`, `feature_list.json` and
`progress/review_seed_from_workbook.md` were changed by the coordinator and the reviewer,
not by me. Nothing under `src/app/`, `src/components/`, `prisma/` or `Samples/` is touched.
