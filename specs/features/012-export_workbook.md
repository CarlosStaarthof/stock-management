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

This feature writes one `.xlsx` with three sheets — `Summary`, `Dublin`, `Clonmel` — in the
sample's shape but generated from the database, so that:

- **every value is derived** (`quantity × unitPriceSnapshot`), never typed, so the €486 that was
  counted and never valued in June 2026 is impossible;
- **the totals are formulas over the value column**, so no `#REF!` can exist and no hardcoded
  cell can drift;
- **month-on-month and year-on-year join on the period**, never on "the column eleven to the
  left", so a skipped month cannot silently become an off-by-one comparison;
- **held items only by default**, so the 35 of 82 dead rows in the most recent Dublin count do
  not travel;
- **the signer and the signature travel onto each yard sheet**, which the workbook lost.

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
| OD2 | **The export prints the signer and the signature on each yard sheet.** | An `APPROVED` count always carries a signature (Invariant 11), so this never needs an alternative path. How the drawn stroke reaches a cell is Open question OQ1, because ExcelJS cannot embed SVG. |
| OD3 | **Only `APPROVED` counts contribute a euro**, and only for **complete periods** (Invariant 7). A `DRAFT` or `SUBMITTED` count is not exported. | A month not yet approved is missing from the file. That is the point: an unapproved count is not a figure anyone may rely on. |
| OD4 | **The export is generated on demand and never stored in the repository.** It is returned in the HTTP response and is the owner's to save. | Nothing is versioned. The database is the system of record; the file is a report (`specs/product-brief.md`). |

## Owner rulings, 2026-10-13

The owner answered the three open questions and corrected two of the answer-level points. Each
ruling is binding and resolves the OQ it names. **R3 corrects the first answer to OQ2:** an earlier
direction ("a default export covers every approved period") is **superseded** by "one approved
stock take per file".

| # | Ruling | Consequence |
|---|---|---|
| R1 | **Feature #16 `deploy` is live** (`progress/impl_deploy.md`, first release). | `feature_list.json` moves #16 to `done`; it is no longer `in_progress`. (Already `done` on this branch.) |
| R2 | **OQ1: the `AB` prints the signer's name and the signed date only, as text. The drawn stroke is NOT exported.** | No SVG rasteriser, no new dependency, and `signatureSvg` stays named by exactly `count-lifecycle-service.ts` (009 AC-26). The signer facts reach the writer through `getLifecycleFacts`, never by naming the column. AC-9 is met with name + date. |
| R3 | **OQ2 (corrected): one approved stock take per file, never several periods in one workbook.** The export page defaults to the latest approved stock take and lists the earlier approved stock takes, so any one can be downloaded as its own file. The file name is `stock-YYYY-MM-DD.xlsx`, using that stock take's date. | The workbook stops carrying a period range. Every multi-period figure (MoM, YoY) and the period-range filename are dropped; the period set is no longer a parameter. This supersedes the earlier "every approved period" answer. |
| R4 | **OQ3: column E is the item's current price, and each period keeps its frozen value.** | Column E is `formatPriceExact` of the item's current price; a `Value` is `quantity × unitPriceSnapshot` from that stock take's `APPROVED` count. Editing a price never moves a past `Value` (Invariant 2). |
| R5 | **The site sheets are named for the yard in the database, never hard-coded.** | The writer derives each yard sheet's name from the `Location.name` it is handed, so a rename in the data moves the sheet with it. The sample workbook's `Clonmel ` trailing-space typo is still not reproduced (AC-1). |

R2 and R4 close their `## Open questions` entries; R3 answers OQ2 with the corrected
single-stock-take shape and raises **OQ4** (below), which is needed before the reshape can be
coded. The reshape is **not yet in the code** — see *Implementation status* below.

### Findings, 2026-10-13 — the owner's "Cashel" contradicts the source of truth

The owner's covering note says the second site is **Cashel, never Clonmel**, and directs that the
seed data, the domain model or any spec that says Clonmel be changed to Cashel. **That change is
not made, because it is a domain fact the repository has already fixed on the other side, and
changing it is a feature of its own rather than a line in an export:**

- `Samples/Stock @ 01-Sep-2026.xlsx` — **read-only, the source of truth** — has worksheets
  `Summary`, `Dublin`, `Clonmel ` (trailing space) and `Clonmel Trucks & Yard`. There is no
  `Cashel` sheet.
- `prisma/migrations/20260909135148_create_stock_domain/migration.sql` inserts
  `('loc_clonmel', 'CLONMEL', 'Clonmel', true, 2)`. Applied migrations are history; the database
  the product runs on holds `Clonmel`.
- `specs/domain-model.md`, `docs/domain-glossary.md`, and the **done, approved** specs 004
  (AC-21) and 005 seed both yards as **Dublin** and **Clonmel**.
- `src/lib/excel/workbook-reader.ts` resolves the sheet `"Clonmel "`, and
  `src/server/items/workbook-plan.ts` / `workbook-import-service.ts` map it to `CLONMEL`.

Renaming the yard would rewrite an approved spec, add a migration, re-seed the item master and
touch the read-only sample. **Flagged to the owner (BLOCKED) — not worked around.** Until the owner
rules, the export keeps deriving its sheet names from `Location.name` (R5); for the data this
product holds those names are `Dublin` and `Clonmel`.

### Implementation status, 2026-10-13 (round 3)

- The service has moved to its own folder: `src/server/export/export-service.ts` (with
  `export-service.test.ts` and `export-service.db.test.ts`), out of `src/server/reporting/`.
  `tests/unit/project-contract.test.ts` AC-10 and the Contract table below name the new path;
  011's analysis-contract scans are untouched.
- The **R3 single-stock-take reshape is pending.** The current writer and its tests still build
  the superseded multi-period workbook. The feature stays `in_progress`; this is the next round's
  work, against the ACs as amended by R3.

## Amendment — the single-stock-take shape (R3)

R3 replaces the multi-period contract. Where the acceptance criteria below still describe a
period range (AC-2's "one `Qty` column and one `Value` column per exported period", AC-5's
newest-first columns, AC-6's MoM/YoY, AC-9's "count(s)", AC-12's range filename), the following
governs. The criteria are otherwise unchanged.

- **A-1 — One approved stock take per file.** The workbook carries exactly one approved period:
  `Summary`, then one sheet per active yard (the yard names come from `Location.name`, R5), each
  with a single `Qty | Value` pair for that period. No other period's data appears anywhere in
  the file, and there is no MoM or YoY row (`Summary` rows 7 and 9 are gone).
- **A-2 — The file name is `stock-YYYY-MM-DD.xlsx`**, where the date is that stock take's date
  (see the open question on which date when a period's yards were walked on different days).
- **A-3 — The export page.** A page lists the approved stock takes, newest first, defaulting to
  the latest; each entry downloads that one take as its own file. A `?period=YYYY-MM` selects one.
- **A-4 — Held-only and `showAll`** keep their meaning (AC-7): a row is held when `quantity > 0`
  in that one period.
- **A-5 — ADMIN only** keeps its meaning (AC-8), in the service.

**Open question OQ4 (needed before A-2 and A-3 can be implemented):** a `StockCount` is one yard
closing one month, so a "stock take" whose file carries **both** site sheets is one **period**
across the active yards — but the period's yards may carry different `countDate`s. Which date
names the file: the earliest, the latest, or the only one? And does the owner confirm the file
covers one period with both site sheets (not one yard alone)?

## User stories

- As an `ADMIN`, I download one `.xlsx` that opens with no `#REF!` and whose total matches
  `/analysis` to the cent, so that I can hand the accountant a file I trust.
- As an `ADMIN`, I see only what is held unless I ask for everything, so the report is not
  mostly rows that ran out a year ago.
- As an `ADMIN`, I can see who signed each yard sheet, because the paper count was signed and
  the workbook lost that.
- As a `YARD_STAFF` user, I get no export at all, because every cell in it carries a price.

## Data touched

- **No schema change and no migration.** `TRUNCATED_TABLES` is unchanged. No new npm dependency:
  `exceljs` is already a dependency (used by `src/lib/excel/workbook-reader.ts`).
- **Read:** `Location` (the active yards), `Item` and `ItemLocation` (the rows of each sheet),
  `Supplier` and `ItemType` (the columns of a row), `StockCount` (period, status, location,
  signer, signature), `StockCountLine` (`quantity`, `unitPriceSnapshot`), and `User.name` for
  the signer. Money is read from `unitPriceSnapshot` **only** — never from `ItemPrice`, exactly
  as #11 does.
- **Written:** nothing.

## Contract

| Artefact | What it is |
|---|---|
| `src/lib/excel/workbook-writer.ts` | **New, pure.** `buildWorkbook(input: ExportInput): Promise<Buffer>`, where `ExportInput` is plain data (yards, rows, periods, per-count facts). Imports `exceljs` and `src/lib/` only; imports nothing from `src/server/` |
| `src/server/export/export-service.ts` | **New.** `exportWorkbook(actor: SessionUser \| null, options: { showAll: boolean }): Promise<{ fileName: string; bytes: Buffer }>`. Asserts `ADMIN` first (OD, 003 AC-16), reads the database, maps to `ExportInput` field by field, calls the writer. Every euro crosses the boundary on a field the `ExportInput` shape declares. **Lives in its own `src/server/export/` folder** (owner direction, 2026-10-13), not under `src/server/reporting/` |
| `src/app/analysis/export/route.ts` | **New.** `GET` handler. `requireRole`/page-guard refuses a non-`ADMIN` before the service runs; returns `200` with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `Content-Disposition: attachment; filename="…"`, and `Cache-Control: no-store`. `?all=1` sets `showAll` |
| `src/app/analysis/page.tsx` | **Modified:** one link/control to `/analysis/export`. `011 AC-16`'s "every link carries period and breakdown" test is amended as its note allows: the export link is a plain `GET` and carries neither parameter |
| `src/lib/export-messages.ts` | **New**, optional: every literal a criterion quotes, in one place (the #10/#11 pattern) |
| `tests/unit/export-workbook.test.ts` | **New.** Level 3: builds a fixture, loads the buffer with ExcelJS, asserts cells |
| `src/server/export/export-service.db.test.ts` | **New.** Level 2: real database, approval lifecycle, role refusal. Lives beside the service in `src/server/export/` |
| `tests/e2e/analysis-export.spec.ts` | **New.** Level 4: an `ADMIN` downloads; a `YARD_STAFF` session does not |

## UI states

- **Empty:** no `APPROVED` count exists. The workbook still has three sheets and the five
  master columns; there are no `Qty | Value` pairs and no total. It is a valid file, not an
  error.
- **Loading:** the download is a normal navigation; the browser shows its own progress. There
  is no in-page spinner.
- **Error:** a non-`ADMIN` gets the refusal before the service runs. A database failure returns
  the app's standard error response (`src/app/api/error-response.ts`); no partial file is sent.
- **Success:** a `.xlsx` with three sheets, the held rows by default, and a total that equals
  `/analysis` to the cent.

## Acceptance criteria

1. **AC-1 — Three sheets, named exactly, generated purely.** `buildWorkbook` takes plain data
   and returns a `Buffer` that ExcelJS loads into exactly the worksheets `Summary`, `Dublin`
   and `Clonmel`, in that order, with no trailing space on `Clonmel` (`specs/domain-model.md`
   Part 1's typo is not reproduced). `src/lib/excel/workbook-writer.ts` imports `exceljs` and
   `src/lib/` only: a scan asserts it imports nothing from `@/server/` or `@prisma/client`, and
   builds without a database. *Proved by* `tests/unit/export-workbook.test.ts`, which loads the
   buffer and asserts `workbook.worksheets.map(sheet => sheet.name)`, and by a source scan.

2. **AC-2 — A yard sheet is the sample's shape.** On `Dublin` and `Clonmel`, row 2 holds the
   header `Description`, `Supplier`, `Type`, `Unit`, `Price` in columns A–E, then one `Qty`
   column and one `Value` column per exported period, in ascending period order, with the
   period label in row 1 above each `Qty` column. Data rows begin at row 3. `Supplier` reads
   `NO_SUPPLIER` where the item has none, `Type` reads the item type's name, `Unit` reads
   `unitLabel`, and `Price` is `formatPriceExact` of the item's price. *Proved by* loading the
   buffer and asserting the cells for a fixture with two periods, one item with a supplier and
   one without.

3. **AC-3 — Every value is derived, and the total is a formula.** A `Value` cell is the number
   `roundHalfUp(quantity × unitPriceSnapshot, 2)` for that period's `APPROVED` line, and an
   empty period contributes nothing. The yard TOTAL cell is a spreadsheet formula over its
   `Value` column (not a written constant), and it equals **the sum of the exact line values
   rounded once**, not the sum of the rounded cells. The fixture is a count whose lines round
   to a different total than the exact sum, so the two rules are distinguishable. *Proved by*
   `tests/unit/export-workbook.test.ts`, asserting the `Value` cells, that the TOTAL cell
   `isFormula`-like (a `{ formula }` object), and the total's value for that fixture.

4. **AC-4 — No `#REF!`, no error cell, no hardcoded total.** Walking every cell of every sheet,
   no value is an error (`#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#N/A`), and no `Value` or
   TOTAL cell is unrelated to the data: a mutation that changes one line's `quantity` in the
   fixture changes that `Value` cell and the TOTAL in the rebuilt buffer, and a fixture whose
   value column is empty yields no error. *Proved by* the unit test walking `eachRow`/`eachCell`
   for the error set, plus the mutation recorded in `progress/impl_export_workbook.md`.

5. **AC-5 — `Summary` mirrors the sample and is derived.** `Summary` row 1 holds the period
   labels, newest in column B. Row 3 is `South` (the `Clonmel` total), row 4 is `Dublin`, row 5
   is `Total Stock` (`South + Dublin`), row 7 is `MoM Variance`, row 9 is `YoY Variance`. Every
   figure is derived from the same values the yard sheets show; `Total Stock` exists only for a
   **complete** period (every active `Location` has an `APPROVED` count, Invariant 7). The
   `Bal per nl` block is **not** exported (Part 1 and the product brief both drop it). *Proved
   by* the unit test asserting the row labels and the `South`, `Dublin` and `Total Stock` cells
   for a two-period, two-yard fixture, and that row 16 is empty.

6. **AC-6 — MoM and YoY join on the period and refuse across a gap.** `MoM Variance` for a
   period is `total(period) − total(previous calendar month)` (Invariant: the immediately
   preceding month, never "the last complete one"); `YoY Variance` is
   `total(period) − total(year − 1, same month)` — never "twelve columns to the left". When
   either operand is not a complete period, the cell reads `NOT_COMPARABLE_PERIOD_INCOMPLETE`
   from `src/lib/analysis-messages.ts` and is never computed by reaching across the gap. The
   fixture is a series with July missing; the August `MoM` cell must **not** be
   June-to-August. *Proved by* the unit test.

7. **AC-7 — Held-only by default; `showAll` restores every assigned item.** With
   `showAll: false`, a row appears only when the item is held (`isHeld`, `quantity > 0`) in at
   least one exported period; with `showAll: true`, every item assigned to that yard
   (`ItemLocation`) appears, including one held in no period. A `DRAFT` line is never a reason
   to appear. *Proved by* the unit test counting data rows for a fixture with one held item,
   one counted-zero item and one null item, in both modes, and by the service test asserting
   the assignment rule against the database.

8. **AC-8 — `ADMIN` only, refused in the service.** `exportWorkbook` called with a `YARD_STAFF`
   actor raises `ForbiddenError` naming `ADMIN`, and called with no actor raises
   `UnauthorizedError` (003 AC-16); both are named tests. The route answers an unauthenticated
   `GET` with the standard redirect to `/sign-in?callbackUrl=%2Fanalysis%2Fexport`, and a
   `YARD_STAFF` `GET` with the denial the product already uses for `/analysis`; neither returns
   any workbook byte. Removing the route's own guard does not expose the export, because the
   service refuses first. *Proved by* `export-service.db.test.ts` and `analysis-export.spec.ts`,
   plus a breach run in the report that removes the route guard and watches the service still
   refuse.

9. **AC-9 — The signer and the signature are on each yard sheet.** Each yard sheet carries, for
   its `APPROVED` count(s), the **signer's name** and the **signed date** as text, and the
   signer's name is the `User.name` of `StockCount.signedById`. The values are obtained through
   `getLifecycleFacts` (`count-lifecycle-service.ts`), so `signatureSvg` stays named by exactly
   one module (009 AC-26) — a scan asserts the export service and the writer do not name the
   column. *Proved by* the unit test (a fixture with a signer name renders it on the sheet) and
   by the service test (the name matches the stored signer). The drawn stroke's rendering is
   OQ1.

10. **AC-10 — The money lists are amended, never loosened.** `tests/unit/project-contract.test.ts`
    adds `src/server/export/export-service.ts` to the exact `unitPriceSnapshot` list (now
    **four** files) and to the exact `unitPrice` list (now **thirteen** files), as a literal
    file, never a directory exemption. `src/lib/` and `scripts/` stay at **zero** files naming
    the column, which the writer obeys by receiving a value field rather than a price column,
    and the `signatureSvg` list stays at exactly `count-lifecycle-service.ts`. Every
    non-vacuity assertion in that file is kept. *Proved by* `npm run test:unit`.

11. **AC-11 — No new dependency, and the file is self-contained.** `package.json`'s
    `dependencies` is unchanged; the export adds no script and no migration. The response is a
    single `.xlsx` file; the writer embeds no host, connection string, secret or absolute path,
    so scanning the file's bytes finds none of the values the process was run with. *Proved by*
    a unit test asserting `dependencies` keys are unchanged and that the buffer contains none of
    a set of sentinel strings.

12. **AC-12 — The route contract.** `GET /analysis/export` defaults to held-only; `?all=1`
    sets `showAll`. The response is `200` with the xlsx `Content-Type`, `Cache-Control:
    no-store`, and a `Content-Disposition` attachment whose filename matches
    `macroads-stock-<first>-<last>.xlsx` for the exported period range (or
    `macroads-stock-empty.xlsx` when there is none). A `YARD_STAFF` or anonymous request never
    receives that `Content-Type`. *Proved by* `tests/e2e/analysis-export.spec.ts`.

13. **AC-13 — An `ADMIN` downloads a real, readable file end to end.** In a live build, an
    `ADMIN` follows the control on `/analysis`, the browser receives the attachment, and loading
    its bytes with ExcelJS yields the three sheets with the header of AC-2 and at least one
    `Value` cell matching the fixture the test seeded. *Proved by*
    `tests/e2e/analysis-export.spec.ts`.

14. **AC-14 — The rest of the product is unchanged.** `npm run test:unit`, `npm run test:db`,
    `npm run test:e2e`, `npm run typecheck` and `npm run lint` pass; no existing assertion is
    weakened, skipped or deleted; `git status` for `Samples/` is empty; the `/analysis` page
    keeps every figure it had and `011 AC-16`'s link test is the only one amended, under its
    own note. *Proved by* the gate.

## Out of scope

- **The printable blank count sheet** (#14). It lists every assigned item under no period and
  is a separate feature.
- **The Trucks & Yard sheets** (boilers, bags, yard bulk) — M7.
- **The `Bal per nl` reconciliation block.** Dropped from the product (Part 1, the brief).
- **Importing the workbook's 44 historical counts.** Counting starts fresh.
- **A scheduled or emailed export.** It is generated on demand only.
- **Any change to the money boundary, the role rules or the value derivation.** The export
  reads `unitPriceSnapshot`; it never reads or recomputes from `ItemPrice`.
- **Upgrading `exceljs`** or any other dependency.
- **A second export format** (CSV, PDF).

## Open questions

**All three were answered by the owner on 2026-10-13 — see *Owner rulings* (R2, R3, R4).** The
text below is kept as the record of what was asked; the rulings are the contract.

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
