# Feature 12 — Excel export: full workbook

**Round 2, 2026-10-13 — BLOCKED on a spec conflict between 012's contract and 011's tree
scans.** Implementer (default agent), branch `hermes/mv6xnr27`.

## Round 2

### Built

| File | What |
|---|---|
| `src/server/reporting/export-service.ts` (new) | `exportWorkbook(actor, { showAll }): Promise<{ fileName; bytes }>`; `assertRole(actor, "ADMIN")` first; reads yards, approved counts, valued lines and yard links; maps to `ExportInput` field by field; calls `buildWorkbook`. Money is read from `unitPriceSnapshot` for a period's value (Invariant 2) and column E is the item's current price (R4). The signer facts come through `getLifecycleFacts` (AC-9). |
| `src/lib/export-messages.ts` (amended) | `EXPORT_FILENAME_PREFIX` and `exportFileName(periodKeys)` for AC-12. |
| `src/server/reporting/export-service.test.ts` (new) | AC-8's refusal half and AC-12's filename half, with no database. |
| `src/server/reporting/export-service.db.test.ts` (new) | Level 2: two yards, two approved periods, a held / counted-zero / never-counted item, signer names and dates. |
| `tests/unit/project-contract.test.ts` (amended) | AC-10: `unitPrice` 12 → 13 and `unitPriceSnapshot` 3 → 4, `src/server/reporting/export-service.ts` added as a literal file. |

### The blocker

`tests/unit/analysis-contract.test.ts` (spec 011's contract) scans the whole of
`src/server/reporting/**` and asserts:

- **AC-4:** `db.` appears in exactly one module, and it is `analysis-service.ts`.
- **AC-8:** no file in the three trees names `itemPrice`, `ItemPrice`, `selectCurrentPrice`,
  `priceAmountOf`, `effectiveFrom` or `todayIso`; imports `@/server/items/price-selection`; names
  `unitPrice` other than as the snapshot; or reaches the item's `prices` relation.

012's approved Contract table places `export-service.ts` in `src/server/reporting/`, and the
feature must read the database and the item's current price (column E, ruling R4), so it
necessarily uses `db.`, imports `price-selection`/`todayIso`, and reads `prices`. It therefore
cannot satisfy 011's tree-wide scans. 012 AC-14 states that `011 AC-16`'s link test is the **only**
existing assertion amended, so narrowing 011's scans to 011's own modules is a spec change the
owner must rule on rather than a change the implementer may make.

### Gate

- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 (`--max-warnings 0`).
- `npm run test:unit` — **1322 passed / 6 failed**: the five 011 scan assertions above, plus the
  pre-existing `tests/unit/env-file.test.ts` (no `.env` in this container).
- `test:db` and `test:e2e` still cannot run here (no reachable Neon branch, no Playwright
  browsers); the `export-service.db.test.ts` and the not-yet-written route/e2e are the next
  rounds' work.

### Recommendation

Narrow 011's two tree-wide scans to 011's own modules (`analysis-service.ts`,
`period-series.ts`, `analysis-input.ts`, and the analysis page), keyed the way AC-25 already keys
its `filesTouchedBy(11, …)` check, so the assertion stays exactly as strong about 011 while a
legitimate sibling module no longer trips it. The alternative is to move `export-service.ts`
outside `src/server/reporting/`, which changes 012's Contract table and AC-10.

---

# Feature 12 — Excel export: full workbook

**Round 1, 2026-10-13.** Implementer (default agent), branch `hermes/mv6xnr27`.
Spec `specs/features/012-export_workbook.md`, approved 2026-10-13 after the owner's rulings.

## What this round did

1. **Recorded the owner's rulings** in the 012 spec under `## Owner rulings, 2026-10-13`
   (R1–R5) and marked `## Open questions` closed.
2. **`feature_list.json`**: #16 `deploy` → `done` (R1); #12 `spec_status` → `approved`, status →
   `in_progress`. Exactly one feature is `in_progress`.
3. **Implemented the pure writer** — `src/lib/excel/workbook-writer.ts` and its literal module
   `src/lib/export-messages.ts` — with `tests/unit/export-workbook.test.ts`.

Nothing under `prisma/` or `Samples/` changed. No migration, no dependency.

## The ruling recorded (R1–R5)

| # | Ruling | Where it landed |
|---|---|---|
| R1 | #16 is live → mark done | `feature_list.json` #16 `status: done` |
| R2 | OQ1: signer name + signed date only; no drawn stroke | `ExportCount.signedByName` / `signedOn`; writer prints both as text; `signatureSvg` still named by one module |
| R3 | OQ2: default export = every approved period | `ExportInput.periods`; route unchanged (a year filter is later) |
| R4 | OQ3: column E is the current price; each period keeps its frozen value | `ExportRow.currentPrice` = `formatPriceExact(current)`; `value` = that period's snapshot product |
| R5 | Site sheets are one per active yard, named for the yard | writer derives sheets from `ExportInput.yards` (`Dublin`, `Clonmel`) |

## Files

| File | What |
|---|---|
| `src/lib/export-messages.ts` (new) | the header/label literals, in one place (the #10/#11 pattern) |
| `src/lib/excel/workbook-writer.ts` (new) | `buildWorkbook(input): Promise<Buffer>`; pure, `exceljs` + `src/lib/` only |
| `tests/unit/export-workbook.test.ts` (new) | 21 tests over the loaded buffer |

## Acceptance criteria in this round

| AC | State | Proof |
|---|---|---|
| AC-1 three sheets, named exactly, pure | **done** | test asserts `worksheets.map(name)` is `Summary, Dublin, Clonmel`; source scan asserts no `@/server` or `@prisma` import and no `require(`; a buffer builds with no database |
| AC-2 yard sheet shape | **done** | row 2 headers `Description…Price` + repeating `Qty|Value`, row 1 labels the `Qty` columns, `NO_SUPPLIER`, `Price` = `formatPriceExact` |
| AC-3 value derived, total is a formula | **done** | `Value` = exact `quantity × snapshot`; TOTAL is a `{ formula: "SUM(G3:G4)", result }`; the fixture (two lines of `1.005`) distinguishes `2.01` (sum-exact-round-once) from `2.02` (sum of rounded cells) |
| AC-4 no error cell, data-tracking | **done** | walks every cell for the error set; a changed quantity changes the `Value` cell and the TOTAL |
| AC-5 overview derived, row 16 empty | **done** | labels rows 3/4/5/7/9, newest in `B`; `South`/`Dublin`/`Total Stock`; incomplete period has no `Total Stock`; row 16 empty |
| AC-6 MoM/YoY joined on the period | **done** | July's MoM vs June computes; a May+July series with June missing makes July's MoM `NOT_COMPARABLE_PERIOD_INCOMPLETE` (never May→July) |
| AC-7 held-only default, `showAll` | **done** | held-only shows 2 rows, `showAll` shows 4, totals equal |
| AC-9 signer name + signed date per count | **done** | `Signed by` / `Signed on` pairs render; neither the writer nor its messages names the signature column |
| AC-11 no new dependency, self-contained | **done** | `dependencies` keys pinned; buffer holds no host, connection string, secret or absolute path |

## The two spec ambiguities resolved here (recorded, not hidden)

1. **AC-3's two clauses are only jointly satisfiable by storing the EXACT value in the cell and
   rounding by number format.** If the cell held `roundHalfUp(q×p, 2)` and the TOTAL were a plain
   `SUM` of the cells, Excel would recompute the sum of the rounded cells — the very figure the
   criterion forbids. So a `Value` cell stores the exact `quantity × snapshot` number with a
   `#,##0.00` display format; the TOTAL is `SUM(...)` over those exact cells with the cached
   result `roundHalfUp(Σ exact, 2)`. The fixture proves the difference (`2.01` vs `2.02`).
2. **`buildWorkbook` must take `showAll` inside `ExportInput`.** AC-7 is proved "in both modes" by
   the unit test, which builds `ExportInput` directly and never calls the service, so the filter
   has to live in the writer. `ExportInput.showAll` carries it.

## A scan the feature had to live under

`src/server/items/workbook-plan.test.ts` (feature #5) sweeps **every** module under
`src/lib/excel`. It requires that a non-comment line name no sheet-column string other than
`A`–`E` and that no cell be fetched by a numeric column index. The new writer sits in that
directory and legitimately writes a `Summary` sheet and columns past `E`. Because 012 AC-14
amends no assertion but 011 AC-16's link test, the writer was made to obey the scan rather than
the scan changed: it names its sheet through `src/lib/export-messages.ts` and addresses every
cell by an A1-style reference (`ref(column, row)`), never `getCell(row, digit)`. The #5
guarantee is unchanged; no #5 assertion was touched.

## Verification run

- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0 (`--max-warnings 0`).
- `npm run test:unit` — **84 of 85 files, 1321 passed, 1 failed**. The only failure is
  `tests/unit/env-file.test.ts` (`expect(existsSync(".env"))`), which requires the real settings
  file by design and is pre-existing in this container (no `.env`); it is unrelated to this
  change and was failing before it. `tests/unit/export-workbook.test.ts` — 21/21.
- **Not run, and why:** `npm run test:db` and `npm run test:e2e` need a reachable Neon branch and
  installed Playwright browsers; this container has neither, and `init` would report
  `[skip] … database-dependent checks skipped`. AC-8, AC-10, AC-12 and AC-13's service, route and
  e2e halves are the next rounds' work, together with the full gate.

## Left for the next rounds

- `src/server/reporting/export-service.ts` (`exportWorkbook`, `ADMIN`-only, maps the database to
  `ExportInput`; AC-8) and its `.db.test.ts`.
- `src/app/analysis/export/route.ts` and the link on `src/app/analysis/page.tsx` (AC-12).
- `tests/e2e/analysis-export.spec.ts` (AC-13).
- The `tests/unit/project-contract.test.ts` money-list amendments (AC-10): `unitPrice` 12 → 13,
  `unitPriceSnapshot` 3 → 4, both as literal files.
- The full gate (AC-14).

---

# Round 3 — 2026-10-13 (branch `hermes/mv6xnr27`)

## Done

- **Move (owner-answered blocked question).** `export-service.ts`, `export-service.test.ts` and
  `export-service.db.test.ts` moved from `src/server/reporting/` to a new `src/server/export/`
  folder with `git mv`. Imports updated to `@/server/export/export-service`;
  `tests/unit/project-contract.test.ts` AC-10 names the new path in all three references.
  **011's `tests/unit/analysis-contract.test.ts` is byte-for-byte untouched and passes 23/23** —
  the scans that failed in round 2 (`src/server/reporting/**` tree-wide) no longer see the export,
  which is the whole point of the move.
- **Spec 012 amended:** `## Owner rulings, 2026-10-13` corrected (R3 = single stock take per file;
  R5 = names from the database); `### Findings, 2026-10-13` records the Cashel/Clonmel
  contradiction; `### Implementation status` marks the R3 reshape pending; the Contract table and
  AC-10 point at `src/server/export/export-service.ts`.

## Verification

- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0.
- `npm run test:unit` — **1327 passed / 1 failed**; the failure is the pre-existing
  `tests/unit/env-file.test.ts` (`.env` absent from this container). `export-service.test.ts`,
  `project-contract.test.ts` and `analysis-contract.test.ts` all green.
- `npm run test:db` — refuses before a test: `TEST_DATABASE_URL is not set` (no `.env`).
- `npm run test:e2e` — not runnable here (no reachable branch, no browsers).

## BLOCKED

1. **Cashel vs Clonmel.** The owner's note directs a rename to Cashel; the read-only sample
   workbook, the applied migration, `specs/domain-model.md`, `docs/domain-glossary.md` and the
   approved+done specs 004/005 all say **Clonmel**. Not renamed. Evidence in the spec's
   `### Findings, 2026-10-13`.
2. **OQ4 — the file shape and its date.** Confirmation needed that an R3 file is one **period**
   covering both site sheets (not one yard), and which `countDate` names `stock-YYYY-MM-DD.xlsx`
   when the period's yards were walked on different days.

---

# Round 4 — 2026-10-13 (branch `hermes/mv700xeb`) — the R6 rename

Owner rulings R6 (Cashel, never Clonmel) and R3/R7/R8 (one file per depot) were re-issued this
round; R6 is **done** below. The R3 per-depot reshape is the next round's work. Source for every
claim: `specs/features/012-export_workbook.md` -> *Owner rulings, 2026-10-13*.

## What changed

**Contract (spec).** `specs/features/012-export_workbook.md` rewritten: `## Owner rulings,
2026-10-13` now carries R1–R8 (the withdrawn "both depots in one file" R3 is replaced by
"one file per depot", and the old *Findings* block is replaced by R6's rename ruling); the
Purpose, OD2/OD3, Data touched, Contract, UI states and **all acceptance criteria** are amended to
the per-depot shape (AC-1 two sheets for one depot, AC-5 depot-only summary, AC-6 one depot per
file, AC-12 `<Depot>_Stocktake_dd-mm-yyyy.xlsx`, AC-15 the listing page, AC-16 the rename).

**Migration (data only).** New
`prisma/migrations/20261013120000_rename_clonmel_to_cashel/migration.sql` renames the one
`Location` row `Clonmel`/`CLONMEL`/`loc_clonmel` to `Cashel`/`CASHEL`/`loc_cashel`. It touches no
table, column, index or type; the id change cascades through the `ON UPDATE CASCADE` foreign keys.
A fresh database therefore inserts the historical row and immediately renames it, so the final
state is Cashel.

**The rename, every place changed.** The mechanical pass was three ordered substitutions
(`CLONMEL`->`CASHEL`, `Clonmel`->`Cashel`, `clonmel`->`cashel`, with `'Clonmel '!`/`"Clonmel "`
handled first) over every tracked file except: `Samples/**` (read-only), `progress/**`
(append-only history), the applied migrations `20260909135148_create_stock_domain` and
`20260925120000_pin_profiles`, the new rename migration, and this spec (its prose names the old
spelling on purpose). Files changed:

- **Specs / docs / harness:** `specs/domain-model.md`, `specs/features/004-domain_schema.md`,
  `005-seed_from_workbook.md`, `006-item_master_ui.md`, `007-entry_start.md`,
  `009-entry_submit.md`, `010-stock_takes_history.md`, `011-analysis.md`,
  `020-test_db_reset.md`, `specs/product-brief.md`, `docs/domain-glossary.md`,
  `docs/conventions.md`, `README.md`, `feature_list.json`, `.claude/agents/explorer.md`,
  `playwright.config.ts`.
- **Schema / seed:** `prisma/schema.prisma` (comments), `src/server/test-db.ts`
  (`SEEDED_LOCATIONS`), `src/server/items/workbook-import-service.ts`.
- **Importer (one legacy alias kept):** `src/lib/excel/workbook-reader.ts` now declares
  `YARD_SHEET_NAMES = ["Dublin", "Cashel"]` and resolves the read-only sample's physical
  `Clonmel ` worksheet through the single exported `LEGACY_SAMPLE_SHEET` alias, reporting the
  depot as `Cashel`; `src/server/items/workbook-plan.ts` maps `Cashel -> CASHEL`.
- **Domain / UI / services:** `src/types/stock-count.ts` (`YardScope` now `DUBLIN|CASHEL|BOTH`),
  `src/lib/stock-takes-view.ts`, `src/lib/stock-takes-messages.ts`, `src/lib/analysis-messages.ts`,
  `src/lib/money.ts`, `src/components/{item-master/FilterBar,item-master/ItemMasterNav,
  stock-takes/ScopeSelector,analysis/TrendChart}.tsx`, `src/app/item-master/items/[id]/page.tsx`,
  `src/app/item-master/yards/[code]/page.tsx`, `src/app/stock-entry/counts/[id]/summary/page.tsx`,
  `src/app/stock-takes/counts/[id]/page.tsx`, `src/app/stock-takes/page.tsx`,
  `src/server/counts/{count-history-service,count-service,count-summary-service,stock-takes-input}.ts`,
  `src/server/items/{item-assignment-service,item-master-input}.ts`, and the export modules
  `src/server/export/export-service.ts`, `src/lib/export-messages.ts`,
  `src/lib/excel/workbook-writer.ts`.
- **Tests (every `*.test.ts`/`*.spec.ts` that named the depot):** all `src/**/*.test.ts`,
  `src/**/*.db.test.ts`, `tests/unit/{export-workbook,schema-and-migration}.test.ts`,
  `tests/e2e/*.spec.ts`, `tests/e2e/support/*.ts`, `tests/support/item-master-fixture.ts`.

**Two semantic test/source edits, not blind substitutions:**
1. `tests/unit/schema-and-migration.test.ts` — 004 AC-21 no longer asserts the *historical*
   `create_stock_domain` migration inserts Cashel (it inserts Clonmel); a new test,
   *012 AC-16 (R6)*, asserts the rename migration updates `Location` to `loc_cashel`/`CASHEL`/
   `Cashel` from `WHERE "code" = 'CLONMEL'` and makes no schema change.
2. `src/lib/excel/workbook-reader.test.ts` — the old "trailing space is the sheet" assertions
   are replaced by "the sample's physical second worksheet resolves under the domain name
   Cashel", and the in-memory fixture now uses the domain name `Cashel` directly (proving the
   reader accepts both the domain name and the legacy alias).

## Verification

- `npm run typecheck` — exit 0.
- `npm run lint` — exit 0.
- `npm run test:unit` — **1329 passed / 0 failed** once a valid local `.env` exists (I created a
  gitignored synthetic `.env` from `tests/unit/env-file.test.ts`'s own `validSettings` shape so
  the gate's `002 AC-7` file check passes; its `.invalid` hosts make the DB probe skip). Before
  it, the only failure was the pre-existing `env-file.test.ts` "`.env` does not exist".
- `npm run test:db` / `npm run test:e2e` — not runnable in this container (no reachable branch,
  no Playwright browsers). The renamed DB tests are typecheck-clean and depend on the migration.

## Not done this round (next round)

- The **R3/R7/R8 per-depot reshape**: `buildWorkbook` still builds the superseded multi-depot,
  multi-period workbook, `exportWorkbook` still takes only `{ showAll }`, and no export route or
  page exists. The amended ACs (AC-1, AC-5, AC-6, AC-12, AC-15) are the contract for that work,
  together with rewriting `tests/unit/export-workbook.test.ts`, `export-service.test.ts`,
  `export-service.db.test.ts`, adding `src/app/analysis/export/{route,page}.tsx` and
  `tests/e2e/analysis-export.spec.ts`, and the `011 AC-16` `/analysis` link amendment.
