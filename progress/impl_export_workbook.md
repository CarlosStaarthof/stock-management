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
