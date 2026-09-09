# Working notes — spec for feature #5 `seed_from_workbook`

Written while drafting `specs/features/005-seed_from_workbook.md`. Everything numeric in
the spec was re-derived from `Samples/Stock @ 01-Sep-2026.xlsx` in this session by
unzipping the `.xlsx` and reading `xl/worksheets/*.xml` + `xl/sharedStrings.xml` directly
(read-only; `git status --porcelain -- Samples` stayed empty throughout). Nothing was
inherited from `specs/domain-model.md` without being checked.

## Gate

`./init.ps1` run at the start: green, **database checks executed** (`[ok] database
reachable`, `[ok] prisma migrate status`, `[ok] npm run test:db` — 7 files / 79 tests),
14 unit files / 79 tests, 26 e2e. No `[skip]` line.

## Figures verified against the workbook (not inherited)

| Fact | Verified value |
|---|---|
| Dublin item block | `A3:A84`, **82** rows, every one has a description |
| Clonmel item block | `A3:A70`, **68** rows, every one has a description |
| `'Clonmel '!A71` | the string `TOTAL` — not an item |
| `Dublin!A86` | the string `TOTAL`; `Dublin!A85` is entirely empty (A–E) |
| Below-total rows | `'Clonmel '!A75` `Road Diesel - White`, `A76` `Marked Gas Oil - Green`; **Dublin has none** — column A below its TOTAL row is empty (its truck block is in `AM87:AZ104`) |
| Source rows imported | **152** = 150 in-range + 2 below-total |
| Rows with a blank description | **0** |
| Distinct items `(trim(description), canonical supplier)` | **140** |
| Items on both sheets | **12** → `ItemLocation` rows **152**, of which 12 items have two links |
| Suppliers after collapsing | **10** |
| Item types after collapsing `Logo's` → `Logo` | **19** — exactly Part 2's list |
| Rows missing supplier, unit or price | **13**, exactly the cells Part 2 names |
| Items with no price at all | **11** → `ItemPrice` rows **129** |
| Distinct unit strings | **22** over the 152 rows (21 over the 150 in-range rows: `Ltrs` occurs only on the two fuel rows), plus 7 rows with an empty unit → **11** distinct `(unitKind, unitQuantityKg)` pairs |

Supplier row tally: `Kestrel` 61, `Meon` 49 + `Meon ` 1, `Kellys` 19 + `Kelly` 7 +
`Kelly's` 1, `Visever ` 2 (the bare `Visever` never occurs), `M & E` 2, `Mid-West` 2,
`Pittman` 2, `Roadcraft` 2, `Roadstuds` 2, `Ennis Flint` 1, none 1 → 152.

Part 2's "no leading-`t` variants" is confirmed: no cell in column B of either sheet
begins with `t`, and the five multi-run shared strings resolve to the strings Part 2
lists.

## Things I found that Part 2 does not settle, and how the spec handles them

1. **Cross-sheet field conflicts.** Of the 12 items on both sheets, **5 disagree on the
   unit label** (3 of them on `unitKind`: `1 Unit`/`2 Unit` on Dublin vs `16kg` on
   Clonmel for MMA Paints Red/Blue/White) and **5 disagree on the item type**
   (`Paint` on Dublin vs `M-Grip`/`Vialine` on Clonmel), 8 distinct items in all.
   **0 disagree on price.** `Item` has one `unitLabel` and one `itemTypeId`, so a rule is
   forced. Spec: fixed sheet order Dublin → Clonmel, first wins, the losing value written
   into `Item.notes` naming both cells, and every conflict listed in the report. Flagged
   in *Open questions* as strikeable.
2. **Two rows sit below Clonmel's total.** Part 2 says "imported and flagged" without
   naming the flag. Spec: `needsReview = true` plus `notes` citing the cell — `needsReview`
   is the only flag column the schema has. Also in *Open questions*.
3. **`ItemType.code` vs `name`.** The workbook and `docs/domain-glossary.md` give exactly
   one label per type (the glossary's column is even headed "Code"). Spec: both are the
   workbook string verbatim; inventing a second spelling would create a second source of
   truth for a label yard staff recognise (`docs/conventions.md`: do not tidy them).
4. **`ItemType.sortOrder`.** Part 2 says "matching the order they appear on the yard
   sheets" and then gives a list — but that list is neither sheet's first-appearance order
   (Dublin meets `A-S` fourth, Clonmel meets `C-E` third). Spec pins **Part 2's list order
   literally**, 1–19, rather than deriving it.
5. **`ItemLocation.sortOrder`.** Not specified anywhere. Spec: the source row number
   (Dublin 3–84, Clonmel 3–70 and 75–76), which sorts identically to sheet order and lets
   any row be traced back to its cell.
6. **Internal whitespace.** Part 2 says "after trimming whitespace". Trim only: collapsing
   internal runs of spaces as well would merge `Bicycle Logo's  1200mm` (Dublin!A16, two
   spaces) with `Bicycle Logo's   1200mm` (`'Clonmel '!A52`, three) and
   `Bicycle Logo's  2750mm` with `Bicycle Logo's   2750mm `, taking 140 items down to 138.

## Collisions with existing tests that #5 must resolve

- **`tests/unit/project-contract.test.ts` "004 AC-31: no shipping module under `src/` or
  `scripts/` mentions `unitPrice` yet" goes red the moment the importer writes
  `ItemPrice.unitPrice`.** This is a real, forced amendment — the same class of problem
  that blocked #4 mid-session. AC-27 handles it: the scan keeps an **exact** expected list
  of two importer modules, and still forbids the string under `src/app/`,
  `src/components/`, `src/lib/` and `scripts/`.
- **ExcelJS is not installed.** `CLAUDE.md` names it in the stack; `package.json` has no
  `exceljs`. #5 adds it (AC-28).
- `tests/unit/hashing-boundary.test.ts` requires every importer of `@prisma/client` or
  `@/server/db` to sit under `src/server/`. So the reader in `src/lib/excel/` and the unit
  normaliser in `src/lib/units.ts` must not import the `UnitKind` enum from Prisma — hence
  the local string union plus a parity test that reads `prisma/schema.prisma` as text.
- The seven-scripts test uses containment, so adding `seed:workbook` is safe.

## Documentation discrepancies noticed (non-blocking, not fixed here)

- `docs/domain-glossary.md` § Units says "21 distinct unit strings normalise to 13".
  **21** is right for the 150 in-range rows and wrong (22) once the two fuel rows below
  Clonmel's total are included. **13** I could not reproduce under any counting I tried:
  the distinct `(unitKind, unitQuantityKg)` pairs are **11**. Prose, not normative — Part 2's
  table is what the spec pins — but worth correcting when someone next edits the glossary.
- `specs/domain-model.md` Part 2 gives `Visever`, `Visever ` as the variant pair. Only the
  trailing-space form occurs; a trim covers it, and the spec says so.

## Blocked on nothing

`Q7` and `Q8` in `§ Still open` are M7-only and do not touch this feature. `Q4` (items with
no price) is answered: import them, flag them.
