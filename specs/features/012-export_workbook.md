# 012 — Excel export: full workbook

**Feature id:** 12   **Status:** approved   **Depends on:** #4 `domain_schema` (every table and
column the export reads already exists), #5 `seed_from_workbook` (`src/lib/excel/workbook-reader.ts`
and the workbook this export is checked against), #6 `item_master_ui` (`formatPriceExact`,
`NO_SUPPLIER`, the money-column census of 006 AC-31), #7 `entry_start` (`period.ts` —
`formatPeriodKey`, `formatPeriodLabel`, `formatMonthLabel`, `previousMonthKey` — and the count
status labels), #9 `entry_submit` (`multiplyDecimal`, `sumDecimals`, `roundHalfUp`,
`unitPriceSnapshot` written once at submit, `APPROVED` immutability), #10 `stock_takes_history`
(`isHeld` / `partitionHeld`, `formatPriceExact`, the money-free calendar), #11 `analysis`
(`subtractDecimals`, the per-yard and total-stock derivation, `INCOMPLETE_TOTAL` and
`NOT_COMPARABLE_PERIOD_INCOMPLETE`), #3 `auth_and_roles` (`requireAdminPage`, `requireRole`,
`assertRole`), #21 `pin_auth` (`getLifecycleFacts` — the signer and the signature)

## Purpose

The workbook this product replaces is the thing it is meant to stop using, but the accountants
still need a file. Today the only way to get one is to open the old `.xlsx`, whose `Value`
columns reference a single price (`specs/domain-model.md` Part 1), whose `Summary` stops at
October 2025, and whose `#REF!` cells sit in two total rows and two dashboard cells.
Re-exporting the database into the **same shape** is the one piece of the old process that must
survive.

This feature writes **one `.xlsx` per depot per stock take** — `Summary` and one depot sheet
named for the depot in the database (`Dublin`, `Cashel`) — in the sample's shape but generated
from the database, so that:

- **every value is derived** (`quantity × unitPriceSnapshot`), never typed, so the €486 that was
  counted and never valued in June 2026 is impossible;
- **the totals are formulas over the value column**, so no `#REF!` can exist and no hardcoded
  cell can drift;
- **never both depots in one file** (R3), so the accountants get one depot's file at a time and
  no figure can mix the two sites;
- **held items only by default**, so the 35 of 82 dead rows in the most recent Dublin count do
  not travel;
- **the signer and the signature travel onto the depot sheet**, which the workbook lost.

It reads money, so it is `ADMIN`-only, refused **in the service layer** (the same rule as #11,
003 AC-16), and it is the second and last monetary surface in the product. Without it the
accountant has no file and the old workbook never retires.

**This feature absorbs the former #13.** The printable blank count sheet is **#14**, still
separate, and is out of scope here. The Trucks & Yard sheets are M7 and are out of scope.

## Owner's decisions

The owner's approved summary of #12 fixes four things. Each is treated here as binding, and
each names the risk it accepts.

| # | Decision | Risk accepted |
|---|---|---|
| OD1 | **Held-only is the default**, with a "show all" option. A row appears when `quantity > 0` in at least one exported period. | An item held in no exported period is absent from a default export. It is one query parameter away, and the same rule every other surface uses (`specs/domain-model.md` Part 5). |
| OD2 | **The export prints the signer and the signed date on the depot sheet.** | An `APPROVED` count always carries a signature (Invariant 11), so this never needs an alternative path. How the drawn stroke reaches a cell is answered by R2 (text only). |
| OD3 | **Only `APPROVED` counts contribute a euro.** A `DRAFT` or `SUBMITTED` count is not exported. | A stock take not yet approved is missing from the page. That is the point: an unapproved count is not a figure anyone may rely on. |
| OD4 | **The export is generated on demand and never stored in the repository.** It is returned in the HTTP response and is the owner's to save. | Nothing is versioned. The database is the system of record; the file is a report (`specs/product-brief.md`). |

## Owner rulings, 2026-10-13

The owner has ruled on the three open questions and on the export's shape. Each ruling is binding
and resolves the open question or direction it names. The rulings were re-issued this round: the
rename ruling (R6) supersedes the earlier *Findings, 2026-10-13* (which had recorded the rename as
blocked pending the owner), and the one-file-per-depot ruling (R3) supersedes the earlier R3
("one approved stock take per file" covering both depots), which is withdrawn.

| # | Ruling | Consequence |
|---|---|---|
| R1 | **Feature #16 `deploy` is live** (`progress/impl_deploy.md`, first release). | `feature_list.json` keeps #16 `done`. |
| R2 | **OQ1: the signer's name and the signed date are printed as text on the yard sheet; the drawn stroke is NOT exported.** | No SVG rasteriser, no new dependency; `signatureSvg` stays named by exactly `count-lifecycle-service.ts` (009 AC-26); the facts reach the writer through `getLifecycleFacts`. AC-9 is met with name + date. |
| R3 | **One file per depot, never both depots in one file.** Each file holds that depot's own sheet and a summary for that depot only. | The workbook stops carrying both yards together. Every cross-depot figure (the `South`/`Dublin`/`Total Stock` rows and MoM/YoY) is dropped: a file describes exactly one depot's stock take. This supersedes the withdrawn "both depots in one approved stock take per file". |
| R4 | **OQ3: column E is the item's current price, and each value keeps that stock take's frozen `unitPriceSnapshot`.** | Column E is `formatPriceExact` of the item's current price; a `Value` is `quantity × unitPriceSnapshot` from the `APPROVED` line. Editing a price never moves a past `Value` (Invariant 2). |
| R5 | **The sheet is named for the depot in the database, never hard-coded.** | The writer derives each depot sheet's name from the `Location.name` it is handed, so a rename in the data moves the sheet with it. The sample workbook's `Clonmel ` trailing-space typo is still not reproduced (AC-1). |
| R6 | **The second depot is `Cashel`, never `Clonmel`.** Rename it everywhere in this goal: seed data, domain model, every spec, every test and all code, plus a database migration that renames the existing `Location` row from `Clonmel`/`CLONMEL` to `Cashel`/`CASHEL`. | The location row becomes `id = loc_cashel`, `code = CASHEL`, `name = Cashel`. `YardScope` becomes `DUBLIN \| CASHEL \| BOTH`. Every changed place is listed in `progress/impl_export_workbook.md`. The read-only sample is the one documented exception — see *The read-only sample* below. |
| R7 | **The file name is `<Depot>_Stocktake_dd-mm-yyyy.xlsx`,** using that depot's own stock take's `countDate` (for example `Dublin_Stocktake_13-10-2026.xlsx`). | The superseded `macroads-stock-<first>-<last>.xlsx` range name is dropped. The date is that depot count's own `countDate`, formatted day-month-year. |
| R8 | **The export page shows the latest approved stock take with one download button per depot, and lists earlier approved stock takes the same way.** | For each approved stock take the page offers one download per depot, each producing that depot's own file. Selecting one downloads exactly that one file. |

R2 and R4 close their `## Open questions` entries. R3, R6, R7 and R8 define the shape: the writer
builds **one depot's** workbook (its yard sheet plus a summary for that depot alone), the service
selects one depot and one `APPROVED` count, and the page lists the approved stock takes. The
read-only sample remains the only place the old spelling survives in code.

### The read-only sample (R6 exception)

`Samples/Stock @ 01-Sep-2026.xlsx` is the historical source of truth and is never modified
(AGENTS.md): its second worksheet is physically named `Clonmel ` (with a trailing space) and there
is no `Cashel` sheet inside the file. The importer therefore keeps **one** explicitly named legacy
alias — the physical worksheet name of that one read-only file — and maps it to the `CASHEL`
location. Everywhere else the depot is `Cashel`; the alias is a fact about a file this repository
may not change, not a depot name.

### Implementation status, 2026-10-13 (round 5)

- The service lives at `src/server/export/export-service.ts` (with `export-service.test.ts` and
  `export-service.db.test.ts`), moved out of `src/server/reporting/` in round 3.
- The **R6 rename is done** (source, tests, specs, docs, the seed and one new migration).
- The **R3/R7/R8 per-depot reshape is built**: `buildWorkbook` takes one depot and one stock
  take and writes exactly two sheets (AC-1, AC-5, AC-6); the service takes `{ showAll,
  locationCode, periodKey }` and builds `<Depot>_Stocktake_dd-mm-yyyy.xlsx` (AC-3, AC-12) and
  exposes `listExportStockTakes` (AC-15); the download route and the listing page exist, and
  `/analysis` links to the page. `typecheck`, `lint`, `test:unit` and `next build` are green.
- **Still to do:** the `test:db` and `test:e2e` halves (`export-service.db.test.ts` is rewritten
  and typechecks but this container has no reachable database, and `tests/e2e/analysis-export.spec.ts`
  is not yet written). The feature stays `in_progress` until the full gate is green.

## Owner rulings, 2026-10-15

The owner has ruled on the required changes in the review of goal `mv8rd5vh`
(`progress/review_mv8rd5vh.md`). Each is binding and is carried out in the same run.

| # | Ruling | Consequence |
|---|---|---|
| R9 | **End-to-end tests are out of this feature's gate.** A diagnosis on `main` (goal `mv9f61be`) showed the e2e suite cannot run in the container yet — Chromium lacks its system libraries and `PIN_PEPPER` is unset — and that is being fixed separately. The gate for 012 is `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run test:db`, each run as its own command with its **final summary lines** pasted into `progress/impl_export_workbook.md`. | AC-12/AC-13/AC-15's browser halves are not claimed as proved here; the runnable gate is. `tests/e2e/analysis-export.spec.ts` stays in the tree for when the container is fixed. |
| R10 | **AC-14 may be amended to match the diff, but only for test changes that follow directly from the R6 rename and the new migration.** For every changed existing assertion, `progress/impl_export_workbook.md` states what it checked **before**, what it checks **now**, and **why it is not weaker**. | AC-14 (below) is rewritten to enumerate the amended assertions. The rewritten `expectRestrictViolation` in `referential.db.test.ts` stays and **must still fail when no restrict violation occurs** (it is a strengthening, not a loosening). |
| R11 | **`rename-clonmel-cashel.db.test.ts` connects through `TEST_DATABASE_URL` only, never `DATABASE_URL`, and fails fast if `TEST_DATABASE_URL` is unset.** | The file never touches the developer's database, even when run bare. |
| R12 | **The depot ordering in `listExportStockTakes` is kept.** Name the test that fails without it; add one if none exists. | The AC-15 listing test (`export-service.db.test.ts`) is named as the test whose expectation breaks without the sort. |
| R13 | **`progress/current.md` is updated to feature 12.** It had still described feature #11. | The report is written while the work happens, not at the end (HERMES §9). |

## User stories

- As an `ADMIN`, I download one `.xlsx` that opens with no `#REF!` and whose total matches
  `/analysis` to the cent, so that I can hand the accountant a file I trust.
- As an `ADMIN`, I see only what is held unless I ask for everything, so the report is not
  mostly rows that ran out a year ago.
- As an `ADMIN`, I can see who signed each yard sheet, because the paper count was signed and
  the workbook lost that.
- As a `YARD_STAFF` user, I get no export at all, because every cell in it carries a price.

## Data touched

- **No schema change.** `TRUNCATED_TABLES` is unchanged and no model or column is added or
  dropped. One **data** migration is added for R6: it renames the single existing `Location` row
  `Clonmel`/`CLONMEL` to `Cashel`/`CASHEL` (and its id `loc_clonmel` to `loc_cashel`, which
  cascades through the `ON UPDATE CASCADE` foreign keys). No new npm dependency: `exceljs` is
  already a dependency (used by `src/lib/excel/workbook-reader.ts`).
- **Read:** `Location` (the active depots and their names), `Item` and `ItemLocation` (the rows
  of one depot's sheet), `Supplier` and `ItemType` (the columns of a row), `StockCount` (period,
  status, location, count date, signer, signature), `StockCountLine` (`quantity`,
  `unitPriceSnapshot`), and `User.name` for the signer. Money is read from `unitPriceSnapshot`
  **only** — never from `ItemPrice`, exactly as #11 does.
- **Written:** nothing.

## Contract

| Artefact | What it is |
|---|---|
| `src/lib/excel/workbook-writer.ts` | **New, pure.** `buildWorkbook(input: ExportInput): Promise<Buffer>`, where `ExportInput` is plain data for **one depot's one stock take** (the depot's name, its rows, its single period, its per-count facts). ExcelJS loads it into exactly two worksheets: `Summary`, then the depot sheet. Imports `exceljs` and `src/lib/` only; imports nothing from `src/server/` |
| `src/server/export/export-service.ts` | **New.** `exportWorkbook(actor: SessionUser \| null, options: { showAll: boolean; locationCode: string; periodKey: string }): Promise<{ fileName: string; bytes: Buffer }>`. Asserts `ADMIN` first (003 AC-16), resolves the one `APPROVED` count for that depot and period, reads the depot's rows, maps to `ExportInput` field by field, calls the writer. **Lives in its own `src/server/export/` folder.** A separate read function, `listExportStockTakes(actor)`, returns the approved stock takes the page lists |
| `src/app/analysis/export/download/route.ts` | **New.** `GET` handler. `requireRole`/page-guard refuses a non-`ADMIN` before the service runs; requires `?location=DUBLIN\|CASHEL` and `?period=YYYY-MM`; returns `200` with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="<Depot>_Stocktake_dd-mm-yyyy.xlsx"`, and `Cache-Control: no-store`. `?all=1` sets `showAll`. **One segment below the page**, because Next refuses a `page.tsx` and a `route.ts` in the same segment: the page keeps `/analysis/export` and the download sits at `/analysis/export/download` |
| `src/app/analysis/export/page.tsx` | **New.** ADMIN-only page listing the approved stock takes, newest first, each with one download button per depot (R8) |
| `src/app/analysis/page.tsx` | **Modified:** one link/control to `/analysis/export`. `011 AC-16`'s "every link carries period and breakdown" test is amended as its note allows: the export link is a plain `GET` and carries neither parameter |
| `src/lib/export-messages.ts` | **New**, optional: every literal a criterion quotes, in one place (the #10/#11 pattern), including the `<Depot>_Stocktake_dd-mm-yyyy.xlsx` name rule |
| `tests/unit/export-workbook.test.ts` | **New.** Level 3: builds a fixture, loads the buffer with ExcelJS, asserts cells |
| `src/server/export/export-service.db.test.ts` | **New.** Level 2: real database, approval lifecycle, role refusal. Lives beside the service in `src/server/export/` |
| `tests/e2e/analysis-export.spec.ts` | **New.** Level 4: an `ADMIN` downloads one depot's file; a `YARD_STAFF` session does not |

## UI states

- **Empty:** no `APPROVED` count exists for the requested depot and period, so the route
  refuses with no file (AC-12) and the page renders its "nothing to export" state. A depot with
  an `APPROVED` count but no assigned items still produces a valid file: two sheets, the five
  master columns, the `Qty | Value` pair and a zero total.
- **Loading:** the download is a normal navigation; the browser shows its own progress. There
  is no in-page spinner.
- **Error:** a non-`ADMIN` gets the refusal before the service runs. A missing/invalid
  `location` or `period` is a `400`. A database failure returns the app's standard error response
  (`src/app/api/error-response.ts`); no partial file is sent.
- **Success:** an ADMIN sees the latest approved stock take with one download button per depot,
  earlier stock takes listed the same way, and each file holds that depot's held rows and a
  depot-only summary.

## Acceptance criteria

1. **AC-1 — One depot, two sheets, named exactly, generated purely.** `buildWorkbook` takes
   plain data for **one depot's one stock take** and returns a `Buffer` that ExcelJS loads into
   exactly two worksheets: `Summary`, then the depot sheet, in that order. The depot sheet's
   name is the `Location.name` handed in — `Dublin` or `Cashel` — never hard-coded, and with no
   trailing space (`specs/domain-model.md` Part 1's `Clonmel ` typo is not reproduced).
   `src/lib/excel/workbook-writer.ts` imports `exceljs` and `src/lib/` only: a scan asserts it
   imports nothing from `@/server/` or `@prisma/client`, and builds without a database. *Proved
   by* `tests/unit/export-workbook.test.ts`, which loads the buffer and asserts
   `workbook.worksheets.map(sheet => sheet.name)`, and by a source scan.

2. **AC-2 — A depot sheet is the sample's shape.** On the depot sheet, row 2 holds the header
   `Description`, `Supplier`, `Type`, `Unit`, `Price` in columns A–E, then exactly one `Qty`
   column and one `Value` column (F and G) for the single stock take, with the period label in
   row 1 above the `Qty` column. Data rows begin at row 3. `Supplier` reads `NO_SUPPLIER` where
   the item has none, `Type` reads the item type's name, `Unit` reads `unitLabel`, and `Price`
   is `formatPriceExact` of the item's current price. *Proved by* loading the buffer and
   asserting the cells for a fixture with one item with a supplier and one without.

3. **AC-3 — Every value is derived, and the total is a formula.** A `Value` cell holds the
   **exact** `quantity × unitPriceSnapshot` for that stock take's `APPROVED` line, displayed at
   two places by a number format, and an item with no line has a blank cell, never a zero. The
   depot TOTAL cell is a spreadsheet formula over its `Value` column (not a written constant),
   and its result equals **the sum of the exact line values rounded once**, not the sum of the
   rounded cells — which is why the cell stores the exact number rather than a pre-rounded one,
   or a spreadsheet that recalculated the `SUM` would total the rounded cells. The fixture is a
   count whose lines round to a different total than the exact sum (`1.005 + 1.005` is `2.01`
   exact, while the sum of the rounded cells would be `2.02`), so the two rules are
   distinguishable. *Proved by* `tests/unit/export-workbook.test.ts`, asserting the `Value`
   cells, that the TOTAL cell is a `{ formula, result }` object, and the total's result for
   that fixture.

4. **AC-4 — No `#REF!`, no error cell, no hardcoded total.** Walking every cell of every sheet,
   no value is an error (`#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`), and no `Value` or
   TOTAL cell is unrelated to the data: a mutation that changes one line's `quantity` in the
   fixture changes that `Value` cell and the TOTAL in the rebuilt buffer, and a fixture whose
   value column is empty yields no error. *Proved by* the unit test walking `eachRow`/`eachCell`
   for the error set, plus the mutation recorded in `progress/impl_export_workbook.md`.

5. **AC-5 — `Summary` is for that depot alone and is derived.** The `Summary` sheet carries
   the depot's **own name** and that depot's total for the stock take, and no cross-period or
   cross-depot figure: row 3 is the depot name in column A with its total in column B. There is
   no `South`, no `Dublin`-compared-to-`Cashel`, no `Total Stock`, no `MoM Variance` and no
   `YoY Variance` row — a single-depot, single-stock-take file has neither a second depot nor a
   second period to compare against. The depot total equals the sum of the exact line values the
   depot sheet shows. The `Bal per nl` block is **not** exported (Part 1 and the product brief
   both drop it). *Proved by* the unit test asserting the summary cells and that the strings
   `South`, `Total Stock`, `MoM Variance` and `YoY Variance` appear nowhere in the workbook.

6. **AC-6 — A file carries exactly one depot and no other.** Building the `Dublin` file yields
   no cell whose text is `Cashel`, and building the `Cashel` file yields no cell whose text is
   `Dublin`; each file's rows are that depot's `ItemLocation` assignments only. When the same
   depot is exported for two different stock takes, each file carries only its own stock take's
   `Qty`/`Value` pair. *Proved by* the unit test, which builds both files from a two-depot,
   two-period fixture and asserts the absence string by string.

7. **AC-7 — Held-only by default; `showAll` restores every assigned item.** With
   `showAll: false`, a row appears only when the item is held (`isHeld`, `quantity > 0`) in the
   one exported stock take; with `showAll: true`, every item assigned to that depot
   (`ItemLocation`) appears, including one held in no period. A `DRAFT` line is never a reason
   to appear. *Proved by* the unit test counting data rows for a fixture with one held item,
   one counted-zero item and one null item, in both modes, and by the service test asserting
   the assignment rule against the database.

8. **AC-8 — `ADMIN` only, refused in the service.** `exportWorkbook` called with a `YARD_STAFF`
   actor raises `ForbiddenError` naming `ADMIN`, and called with no actor raises
   `UnauthorizedError` (003 AC-16); both are named tests. The route answers an unauthenticated
   `GET` with the standard redirect to `/sign-in?callbackUrl=%2Fanalysis%2Fexport%3Flocation…`,
   and a `YARD_STAFF` `GET` with the denial the product already uses for `/analysis`; neither
   returns any workbook byte. Removing the route's own guard does not expose the export, because
   the service refuses first. *Proved by* `export-service.db.test.ts` and `analysis-export.spec.ts`,
   plus a breach run in the report that removes the route guard and watches the service still
   refuse.

9. **AC-9 — The signer and the signature are on the depot sheet.** The depot sheet carries, for
   its one `APPROVED` count, the **signer's name** and the **signed date** as text, and the
   signer's name is the `User.name` of `StockCount.signedById`. The values are obtained through
   `getLifecycleFacts` (`count-lifecycle-service.ts`), so `signatureSvg` stays named by exactly
   one module (009 AC-26) — a scan asserts the export service and the writer do not name the
   column. *Proved by* the unit test (a fixture with a signer name renders it on the sheet) and
   by the service test (the name matches the stored signer). The drawn stroke is not exported
   (R2).

10. **AC-10 — The money lists are amended, never loosened.** `tests/unit/project-contract.test.ts`
    keeps `src/server/export/export-service.ts` in the exact `unitPriceSnapshot` list (now
    **four** files) and in the exact `unitPrice` list (now **thirteen** files), as a literal
    file, never a directory exemption. `src/lib/` and `scripts/` stay at **zero** files naming
    the column, which the writer obeys by receiving a value field rather than a price column,
    and the `signatureSvg` list stays at exactly `count-lifecycle-service.ts`. Every
    non-vacuity assertion in that file is kept. *Proved by* `npm run test:unit`.

11. **AC-11 — No new dependency, no schema change, and the file is self-contained.**
    `package.json`'s `dependencies` is unchanged and the export adds no script. The one
    migration this feature adds is R6's **data** rename of the `Location` row: it adds and drops
    no table, column or type, so `TRUNCATED_TABLES` is unchanged and `prisma migrate status` is
    clean after it. The response is a single `.xlsx` file; the writer embeds no host, connection
    string, secret or absolute path, so scanning the file's bytes finds none of the values the
    process was run with. *Proved by* a unit test asserting `dependencies` keys are unchanged
    and that the buffer contains none of a set of sentinel strings.

12. **AC-12 — The route contract.** `GET /analysis/export/download` requires `?location=DUBLIN|CASHEL`
    and `?period=YYYY-MM`; it defaults to held-only and `?all=1` sets `showAll`. The response is
    `200` with the xlsx `Content-Type`, `Cache-Control: no-store`, and a `Content-Disposition`
    attachment whose filename matches `<Depot>_Stocktake_dd-mm-yyyy.xlsx`, where `dd-mm-yyyy` is
    that depot's own count's `countDate` (for example `Dublin_Stocktake_13-10-2026.xlsx`). A
    missing or invalid `location`/`period`, or a period with no `APPROVED` count for that depot,
    is a refusal (no file). A `YARD_STAFF` or anonymous request never receives that
    `Content-Type`. *Proved by* `tests/e2e/analysis-export.spec.ts`.

13. **AC-13 — An `ADMIN` downloads a real, readable file end to end.** In a live build, an
    `ADMIN` follows the control on `/analysis/export`, the browser receives the attachment, and
    loading its bytes with ExcelJS yields the two sheets with the header of AC-2, the depot
    sheet named for the depot actually asked for, and at least one `Value` cell matching the
    fixture the test seeded; the file name matches `<Depot>_Stocktake_dd-mm-yyyy.xlsx` for that
    depot's seeded count date. *Proved by* `tests/e2e/analysis-export.spec.ts`.

14. **AC-14 — The rest of the product is unchanged.** `npm run typecheck`, `npm run lint`,
    `npm run test:unit` and `npm run test:db` pass (end-to-end tests are out of this feature's
    gate — owner ruling R9, the container cannot run them yet); no existing assertion is
    weakened, skipped or deleted; `git status` for `Samples/` is empty; the `/analysis` page
    keeps every figure it had. The existing assertions this feature amends are enumerated below;
    each is not weakened, and `progress/impl_export_workbook.md` states for each what it checked
    **before**, what it checks **now**, and **why it is not weaker** (owner ruling R10):
    - `011 AC-16`'s link test (`tests/e2e/analysis-figures.spec.ts`) counts the `/analysis/export`
      link as a second exception, under its own note;
    - `tests/unit/stock-entry-contract.test.ts`'s reserved-year census moved from **fourteen files
      / fifteen years** to **fifteen / sixteen**, because AC-15's e2e spec reserves
      `analysisExport: 2106`; the census remains an equality, not a floor;
    - `src/server/deploy/census.db.test.ts`'s migration count moved from **3** to **4**, forced by
      the new `20261013120000_rename_clonmel_to_cashel` migration; it is still an equality over the
      applied migrations;
    - `src/server/schema/columns.db.test.ts`'s AC-21 test now reseeds the historical insert and
      then applies R6's rename, so the test reaches today's two yards; the idempotency it proves
      (two inserts, two rows) is unchanged;
    - `src/server/schema/referential.db.test.ts`'s `expectRestrictViolation` helper reads the
      Prisma engine's `P2003` + `meta.constraint` and `pg_constraint.confdeltype`. This one is
      **not** caused by R6: the engine now maps the PostgreSQL `RESTRICT` refusal to `P2003`
      instead of relaying the raw SQLSTATE `23001`, so the old raw-message assertion no longer
      matches. It is kept per R10, strengthened rather than loosened: it still names the refusing
      constraint, still asserts the key is `RESTRICT` (`confdeltype = 'r'`), and the `rejection`
      helper still throws when the delete succeeds, so the test still fails when no restrict
      violation occurs.
    *Proved by* the gate.

15. **AC-15 — The export page lists the approved stock takes (R8).** `GET /analysis/export`
    renders the approved stock takes, newest first, the latest first; for each stock take it
    shows **one download control per active depot**, each pointing at that depot's own file.
    A stock take with only one depot approved shows one control; a `YARD_STAFF` session is
    refused the page. The list is derived from the database, not hard-coded. *Proved by*
    `tests/e2e/analysis-export.spec.ts` and by `listExportStockTakes` in the service test.

16. **AC-16 — `Cashel`, never `Clonmel` (R6).** After the rename migration the `Location` row
    is `Cashel`/`CASHEL`/`loc_cashel` (proved by `npm run test:db`), and the domain, UI and
    export use `CASHEL`/`Cashel` throughout — `YardScope`, the item-master filter and nav, the
    stock-takes scope, the export sheet name. The only surviving occurrences of the old
    spelling are facts about files this goal may not change: the applied
    `create_stock_domain` migration, the read-only sample's physical worksheet (reached through
    the single `LEGACY_SAMPLE_SHEET` alias in `src/lib/excel/workbook-reader.ts`), and the
    migration that performs the rename. Every place changed is listed in
    `progress/impl_export_workbook.md`.

## Out of scope

- **The printable blank count sheet** (#14). It lists every assigned item under no period and
  is a separate feature.
- **The Trucks & Yard sheets** (boilers, bags, yard bulk) — M7.
- **The `Bal per nl` reconciliation block.** Dropped from the product (Part 1, the brief).
- **A single workbook holding both depots, or a multi-period column range.** Withdrawn by R3;
  every file is one depot and one stock take, and `South`/`Total Stock`/`MoM`/`YoY` do not exist.
- **Importing the workbook's 44 historical counts.** Counting starts fresh.
- **A scheduled or emailed export.** It is generated on demand only.
- **Any change to the money boundary, the role rules or the value derivation.** The export
  reads `unitPriceSnapshot`; it never reads or recomputes from `ItemPrice`.
- **Upgrading `exceljs`** or any other dependency.
- **A second export format** (CSV, PDF).

## Open questions

**All three were answered by the owner on 2026-10-13 — see *Owner rulings* (R2 signer text,
R3/R7/R8 the per-depot file and its name and page, R4 the price).** The text below is kept as the
record of what was asked; the rulings are the contract. There are no open questions blocking
implementation.

- **OQ1 — How does the drawn signature reach the sheet?** ExcelJS can add a PNG/JPEG image but
  cannot embed the stored SVG path. The owner's summary says "signature and signer printed".
  Recommendation: `AB` prints the **signer's name and the signed date** now (that is the
  "signer"), and embedding the **drawn stroke** waits on a rasteriser, which is a new dependency
  and its own decision. If the owner wants the stroke on the sheet in #12, choose (a) add a pure
  SVG-path rasteriser, (b) accept the stored path data as a cell string, or (c) defer.
- **OQ2 — What period range does a default export cover?** Recommendation: **every period the
  database holds an `APPROVED` count for**, newest first in the `Summary` and ascending on the
  yard sheets, matching the sample. A year filter can follow as its own feature.
- **OQ3 — The `Price` column on a historical export.** A count keeps its `unitPriceSnapshot`,
  but the workbook's column E is the *current* price. Recommendation: column E is the item's
  current price (`formatPriceExact`), and each period's `Value` uses that period's frozen
  snapshot, so editing a price never changes a past `Value` (Invariant 2). Confirm this is the
  intended reading, because the two can differ.
