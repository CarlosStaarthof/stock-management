# 005 — Seed the item master from the source workbook

**Feature id:** 5   **Status:** approved   **Approved:** 2026-09-09
**Depends on:** #4 `domain_schema` (owns every table this writes into, and seeds the two
`Location` rows), #3 `auth_and_roles` (owns `src/server/db.ts` and the typed errors), #2
`app_scaffold` (owns `package.json` and the two vitest configs)

## Purpose

The app has nine tables and no data. Every screen from #6 onward — the item master, the
count entry sheet, the printable blank sheet, the export — needs the 140 items the yard
actually holds, with their suppliers, types, units and 2025 prices. Re-typing them by hand
would reintroduce exactly the re-keying error this project exists to remove, and would be
unrepeatable: the importer is run against the development database, again against the test
branch, and once more against production at go-live (#16), and all three must end up
identical.

What breaks without it: #6 has an empty item master to render, #7 can create a count with
no lines, and #8 has nothing to type a quantity against. More sharply — this is the one
feature that reads the workbook into the system of record, and it is the last chance to
notice that 13 rows are incomplete, that two rows of real stock sit below a total that has
never included them, and that one row has no supplier at all. An importer that quietly
dropped those rows would make the app *look* right and *be* wrong.

## Scope boundary

This feature reads **columns A–E of the two yard sheets** (`Dublin` and `'Clonmel '`) and
writes **`Supplier`, `ItemType`, `Item`, `ItemPrice` and `ItemLocation`**. It ships a
service and a script (`npm run seed:workbook`) and **no UI, no route and no server action**
— the item master screen is #6.

`Location` is **not** written. #4's migration seeded `loc_dublin` / `DUBLIN` and
`loc_clonmel` / `CLONMEL`; the importer resolves them by `code` and fails if they are
absent.

Not imported, per `specs/domain-model.md` Part 2 *Not imported*: the historical
`Qty` / `Value` column pairs (16 on Dublin, 15 on Clonmel), the `Summary` sheet, and the
entire `Clonmel Trucks & Yard` sheet. Counting starts fresh from the next count, so no
`StockCount` or `StockCountLine` row is created by this feature at all.

## The numbers in this spec were re-derived from the workbook, in this session

`specs/domain-model.md` Part 2 is the normative source for the *rules*. Its *figures* were
nevertheless re-checked cell by cell before being written into a criterion, by unzipping
`Samples/Stock @ 01-Sep-2026.xlsx` and reading `xl/worksheets/sheet2.xml`,
`xl/worksheets/sheet3.xml` and `xl/sharedStrings.xml` directly. Nothing under `Samples/`
was modified; `git status --porcelain -- Samples` was empty before and after.

This paragraph is here because the project has a history with these numbers: earlier
sessions recorded **152** items, then **151**, before **150 rows** was confirmed, and
recorded supplier typos (`tMeon`, `tKelly's`, `tBriteline`) that do not exist in the file.
Every figure below is one this session counted.

| Quantity | Verified value |
|---|---|
| Dublin item block | `A3:A84` — **82** rows, all with a description |
| Clonmel item block | `A3:A70` — **68** rows, all with a description |
| Below-total rows | `'Clonmel '!A75` and `A76` — **2**. Dublin has **none** |
| Source rows the importer reads | **152** |
| Rows with a blank description | **0** |
| `Item` rows created | **140** |
| Items appearing on both yard sheets | **12** |
| `ItemLocation` rows created | **152** |
| `Supplier` rows created | **10** |
| `ItemType` rows created | **19** |
| `ItemPrice` rows created | **129** (11 items have no price) |
| Items flagged `needsReview` | **15** (13 incomplete rows + 2 below-total rows) |
| Items with a non-null `notes` | **10** (2 below-total + 8 cross-sheet conflicts) |

`'Clonmel '!A71` is the string `TOTAL`, not an item. `Dublin!A86` is `TOTAL`; `Dublin!A85`
is entirely empty across A–E and is skipped, not read and not an error.

## User stories

- As an **ADMIN**, I can run one command against a fresh database and get the same 140
  items, 10 suppliers and 129 prices the workbook holds, so the first count I open is not
  an empty sheet.
- As an **ADMIN**, I can run that command a second time — because I am not sure whether it
  finished the first time — and be certain it changed nothing, so a nervous re-run is never
  a reason to restore a backup.
- As an **ADMIN**, I can fix `School Logo Triangle`'s missing supplier in the item master
  and re-run the importer later without my fix being silently reverted to the workbook's
  blank.
- As an **ADMIN**, I get a report naming every one of the 15 items the importer could not
  fully populate, with the cell each came from, so I can walk the yard sheet and fix them
  at source instead of discovering them one at a time during a count.
- As the **owner**, I can be sure the two fuel rows sitting below Clonmel's total row are in
  the system and marked, rather than either dropped or quietly folded into a total that has
  never included them.

## Data touched

**Read:** `Location` (by `code`), and everything already in `Supplier`, `ItemType`, `Item`,
`ItemPrice` and `ItemLocation`, so a re-run can tell what already exists.

**Written:** `Supplier`, `ItemType`, `Item`, `ItemPrice`, `ItemLocation` — **inserts only**.
This feature performs no `UPDATE` and no `DELETE` against any table (see AC-22).

**Never touched:** `Location`, `User`, `StockCount`, `StockCountLine`.

**No migration.** #4's schema is sufficient; nothing here changes `prisma/schema.prisma`.

### Field by field, what a source row becomes

| Column | Becomes |
|---|---|
| `A` Description | `Item.description`, trimmed. Internal whitespace is **not** collapsed |
| `B` Supplier | `Supplier.name` after trimming and collapsing the `Kelly` variants; blank → `Item.supplierId = null` |
| `C` Type | `ItemType.code` and `.name` after `Logo's` → `Logo` |
| `D` Unit | `Item.unitLabel` verbatim; `Item.unitKind` and `Item.unitQuantityKg` derived |
| `E` 2025 Prices | one `ItemPrice` per item: `unitPrice`, `effectiveFrom = 2025-01-01`, `label = "2025 Prices"`, `currency = "EUR"` |
| the row itself | one `ItemLocation` linking the item to the sheet's yard, `sortOrder` = the source row number, `active = true` |

`Item.active` is `true` for every imported item, including the 13 incomplete ones
(Part 2: "never silently dropped"). `Item.needsReview` is `true` for the 15 named in
AC-12 and AC-13, and `false` for the other 125.

### The normalisation tables, as verified

**Suppliers — 10.** `Ennis Flint`, `Kelly`, `Kestrel`, `M & E`, `Meon`, `Mid-West`,
`Pittman`, `Roadcraft`, `Roadstuds`, `Visever`. Collapsed: `Kelly` (7 rows) + `Kellys`
(19) + `Kelly's` (1) → `Kelly`; `Meon ` (1) → `Meon`; `Visever ` (2, and the bare
`Visever` never occurs) → `Visever`. One row, `Dublin!B45`, is blank.

**Item types — 19,** with `sortOrder` 1–19 in `specs/domain-model.md` Part 2's order:
`Thermo-P`, `Beads`, `C-E`, `A-S`, `Cold A-S`, `Primer`, `M-Grip`, `Vialine`, `Paint`,
`MMA`, `Logo`, `Sealer`, `Cleaner`, `F&F`, `Ramps`, `Aerosol`, `Bauxite`, `Glue`, `Fuel`.
`Logo's` (`'Clonmel '!C66`) collapses into `Logo`. Part 2 introduces that list as "the
order they appear on the yard sheets", but it is neither sheet's first-appearance order —
Dublin meets `A-S` fourth and Clonmel meets `C-E` third — so this spec pins **Part 2's
list, literally**, rather than a derivation rule that would produce a different answer.

**Units.** The 22 distinct labels in the file, plus the 7 rows with no unit, map onto 11
distinct `(unitKind, unitQuantityKg)` pairs per Part 2's table. `unitLabel` keeps the
original string exactly as written — `20 Kg`, `20kg`, `20Kg` and `20kgs` stay four
different labels — because yard staff recognise them.

## Contract

No route, no server action, no component. Five modules and one npm script.

| Module | Export | Touches Prisma |
|---|---|---|
| `src/lib/excel/workbook-reader.ts` | `readYardSheets(buffer: Buffer): Promise<YardSheetRow[]>` | no |
| `src/lib/units.ts` | `normaliseUnit(raw: string \| null): NormalisedUnit`, `UNIT_KINDS` | no |
| `src/server/items/workbook-plan.ts` | `buildImportPlan(rows)`, `diffPlan(plan, existing)`, `buildImportReport(plan, diff)` | no |
| `src/server/items/workbook-import-service.ts` | `importWorkbook(input): Promise<ImportOutcome>` | **yes — the only one** |
| `scripts/seed-workbook.ts` | `npm run seed:workbook` | no (calls the service) |

```ts
type YardSheetRow = {
  sheet: "Dublin" | "Clonmel ";   // the trailing space is the workbook's, and is preserved
  row: number;                    // the 1-based worksheet row, e.g. 45
  belowTotal: boolean;            // true only for 'Clonmel ' rows 75 and 76
  description: string;            // trimmed, never empty
  supplier: string | null;        // cell text, trimmed; null when blank
  itemType: string;               // cell text, trimmed
  unitLabel: string | null;       // cell text, verbatim; null when blank
  price: string | null;           // canonical decimal string, never a JS number
};

type NormalisedUnit = {
  unitLabel: string | null;
  unitKind: "TONNE" | "KILOGRAM" | "LITRE" | "UNIT" | "LINEAR_METRE";
  unitQuantityKg: string | null;  // "1000" for TONNE, the parsed kg for KILOGRAM, else null
};

type ImportPlan = {
  suppliers: { name: string }[];
  itemTypes: { code: string; name: string; sortOrder: number }[];
  items: {
    description: string;
    supplierName: string | null;
    itemTypeCode: string;
    unitLabel: string | null;
    unitKind: NormalisedUnit["unitKind"];
    unitQuantityKg: string | null;
    needsReview: boolean;
    notes: string | null;
    unitPrice: string | null;            // null for the 11 items with no price
    links: { locationCode: "DUBLIN" | "CLONMEL"; sortOrder: number }[];
  }[];
};

type ImportOutcome = {
  created: { suppliers: number; itemTypes: number; items: number; prices: number; links: number };
  skipped: { suppliers: number; itemTypes: number; items: number; prices: number; links: number };
  report: ImportReport;
};
```

The pipeline is deliberately three steps — **read → plan → write** — with a pure boundary
between the second and the third. `diffPlan` takes the plan and the master data already in
the database and returns what is missing; only the last step opens a transaction. That is
what makes AC-1 to AC-17 testable with no database at all, and it is why `Location`,
`Supplier` and `ItemType` resolution happens against real rows rather than being assumed.

`importWorkbook` parses its input with a Zod schema at the edge of `src/server/`, as
`docs/architecture.md` § Validation requires of a seed script, and throws
`ValidationError`, `NotFoundError` or `ConflictError` from `src/server/errors.ts` — never a
bare `Error`.

### The script

```
npm run seed:workbook [-- --file <path>] [--dry-run] [--report <path>]
```

- `--file` defaults to `Samples/Stock @ 01-Sep-2026.xlsx`, opened **read-only**.
- `--dry-run` builds the plan, prints the report and **opens no database connection**.
- `--report <path>` additionally writes the `ImportReport` as JSON to that path. With the
  flag omitted the run writes no file anywhere: the report goes to stdout.
- Exit `0` on success, including a re-run that creates nothing. Non-zero on any failure,
  with a message naming the sheet and cell or the missing `Location` code.

### The import report

One object, rendered to stdout as text and, with `--report`, written as JSON. Ordered
deterministically by sheet then row throughout, so the plan half of two runs is
byte-identical. It carries:

| Section | Contents |
|---|---|
| `source` | file name, byte length and SHA-256 of the workbook that was read |
| `sheets[]` | per sheet: name, item-block first and last row, rows read, below-total rows |
| `counts` | planned, and created / skipped per table |
| `needsReview[]` | every flagged item: `sheet!cell`, description, reasons (`MISSING_SUPPLIER`, `MISSING_UNIT`, `MISSING_PRICE`, `BELOW_TOTAL_ROW`) |
| `supplierVariants[]` | every collapsed spelling: variant, canonical, row count, cells |
| `sharedItems[]` | the 12 items linked to both yards |
| `conflicts[]` | every cross-sheet disagreement: field, both cells, both values, which won |
| `divergences[]` | rows the workbook and the database disagree about, which the importer did not overwrite |

## UI states

**This feature ships no UI.** It is a command-line importer, so empty / loading / error /
success have no screen to attach to. Recorded so the boundary is deliberate:

- **Empty:** the database before the run. The importer's own "empty" is a diff with nothing
  in it — a re-run — which is a success printed as `created 0`, not an error.
- **Loading:** one progress line per table on stdout. No spinner, no screen.
- **Error:** a failure names the sheet and cell (`'Clonmel ' row 54`) or the missing
  `Location` code, exits non-zero, and leaves no partial write.
- **Success:** the report on stdout and exit `0`. The user-facing surfaces for the 15
  flagged items are #6's item master and #15's housekeeping worklist, not this feature.

## Acceptance criteria

Every number below is one this session counted from `Samples/Stock @ 01-Sep-2026.xlsx`.
Tests that touch only the reader, the unit table, the plan or the report are `*.test.ts`
and run in `npm run test:unit` with no database; tests that write are `*.db.test.ts` under
`src/server/`, which `vitest.db.config.ts` already picks up.

1. **AC-1** — `readYardSheets(buffer)` reads only the two yard sheets and only columns A–E. Against the real workbook it returns **152** rows whose `sheet` values are exactly `Dublin` and `Clonmel ` and nothing else, and each row object's keys are exactly `sheet`, `row`, `belowTotal`, `description`, `supplier`, `itemType`, `unitLabel`, `price`. No returned field carries a quantity, a value or a count date: no key matches `/qty|quantity|value|count|date/i`.
2. **AC-2** — The trailing space in the sheet name `'Clonmel '` is handled, not tidied away: the reader resolves the worksheet whose name is exactly `"Clonmel "`, and the rows it returns carry `sheet: "Clonmel "`. Given an in-memory workbook that has a `Dublin` sheet and no `Clonmel ` sheet, `readYardSheets` throws `ValidationError` whose message contains `Clonmel` and the word `sheet`, and returns nothing.
3. **AC-3** — The item block of each sheet runs from row 3 to the row above the one whose column A trims to `TOTAL`, and any row below that whose column A holds a description is a below-total row. Against the real workbook: `Dublin` gives rows 3–84, **82** in-block rows and **0** below-total rows; `Clonmel ` gives rows 3–70, **68** in-block rows and **2** below-total rows (75 and 76). `'Clonmel '!A71` (`TOTAL`) is not returned as a row, and `Dublin` row 85, which is empty across A–E, is skipped silently — neither returned nor an error.
4. **AC-4** — A rich-text description is read by concatenating **every** `<t>` descendant of the shared string, never the first run alone. `'Clonmel '!A9`, `A10`, `A22`, `A23` and `A24` come back as the strings `White - Briteline`, `Yellow  - Briteline`, `Stick On Studs - Meon`, `Stick On Studs - Roadcraft  1st July` and `Anti Skid Buff  - Kelly's`, each asserted individually, and each is strictly longer than its first run (`White - `, `Yellow  - `, `Stick On Studs - `, `Stick On Studs -`, `Anti Skid Buff  - `). Every returned `description` is a `string`, never an object carrying a `richText` key, and none of the 152 begins with a lower-case `t`.
5. **AC-5** — Text is read as UTF-8 and not mangled: `'Clonmel '!A28` comes back as `Anti Skid Grains (€550 p/T)`, containing `U+20AC`, and the same string reads back from `Item.description` after the import.
6. **AC-6** — A price is imported as its **computed** value, carried as a decimal string and never as a JavaScript number. `'Clonmel '!E19` (`=5.2/0.85`) yields `"6.11764706"`, `E20` (`=2.45/0.85`) `"2.88235294"`, `E21` (`=5.89/0.85`) `"6.92941176"` and `E23` (`=1.4/0.9`) `"1.55555556"` — eight decimal places, rounded half-up. The workbook's binary-float artefacts normalise: `Dublin!E10` yields `"33.09"` and not `33.090000000000003`, `E31` `"2252.8"`, `E55` `"137.11"`, `E72` `"155.55"`. A price cell that is a formula with no cached result raises `ValidationError` naming the sheet and the cell.
7. **AC-7** — A blank description fails loudly and is never imported. Given an in-memory workbook whose `Dublin` row 7 has an empty column A but a supplier and a price, `readYardSheets` throws `ValidationError` whose message contains `Dublin` and `7`, and returns no rows. A row whose whole A–E span is empty is skipped instead. All 152 rows of the real workbook carry a description, so the real import never trips this.
8. **AC-8** — Suppliers collapse to exactly **10** names: `Ennis Flint`, `Kelly`, `Kestrel`, `M & E`, `Meon`, `Mid-West`, `Pittman`, `Roadcraft`, `Roadstuds`, `Visever`. `Kelly` (7 rows), `Kellys` (19) and `Kelly's` (1) all become `Kelly`; `Meon ` becomes `Meon`; `Visever ` becomes `Visever`. No planned supplier name has leading or trailing whitespace. **There is no leading-`t` strip rule:** a row whose supplier cell reads `tMeon` plans a supplier named `tMeon`, unchanged — the `t` prefixes an earlier draft described were a defect in a reader, not in the file (Part 2), and stripping a character the workbook does not contain would corrupt a real name.
9. **AC-9** — Item types are exactly the **19** of Part 2, with `code` and `name` both the workbook's own string and `sortOrder` 1–19 in Part 2's order: `Thermo-P`, `Beads`, `C-E`, `A-S`, `Cold A-S`, `Primer`, `M-Grip`, `Vialine`, `Paint`, `MMA`, `Logo`, `Sealer`, `Cleaner`, `F&F`, `Ramps`, `Aerosol`, `Bauxite`, `Glue`, `Fuel`. `Logo's` (`'Clonmel '!C66`) is planned as `Logo`, and no type named `Logo's` is created.
10. **AC-10** — `normaliseUnit` implements Part 2's table and preserves the label. `Tonne` → `TONNE` / `1000`; `20kg`, `20 Kg`, `20Kg`, `20kgs`, `18KG`, `21 Kg`, `22 Kg`, `16kg`, `14kg`, `14 kgs`, `900 Kgs`, `900kg` → `KILOGRAM` with `unitQuantityKg` the parsed number; `25L` and `Ltrs` → `LITRE`; `1 Unit`, `I Unit` (a capital i), `2 Unit`, `3 Unit`, `Unit`, `1` and an empty cell → `UNIT`; `lin.m` → `LINEAR_METRE`. `unitQuantityKg` is null for every kind except `TONNE` and `KILOGRAM`, and `unitLabel` is the original string unchanged, so `20 Kg` and `20kg` remain two labels. Over the 140 planned items the tally is `TONNE` 24, `KILOGRAM` 38, `LITRE` 6, `UNIT` 71, `LINEAR_METRE` 1. `UNIT_KINDS` equals the `UnitKind` labels declared in `prisma/schema.prisma`, asserted by reading the schema file as text so the check needs no database and `src/lib/` imports no Prisma.
11. **AC-11** — An item is `(trimmed description, canonical supplier)`, and the plan holds exactly **140** of them from **152** source rows. **12** items carry two `links` — `White Extrusion 80/20`, `Yellow Extrusion 55/20`, `Red - KestrelFlex - Anti-Skid`, `Beads`, `MMA Paints - Red`, `MMA Paints - Blue`, `MMA Paints - White`, `MultiGrip X440 Traffic Green RAL6024`, `MultiGrip X440 Traffic Purple. RAL 4006`, `ViaLine  Traffic Red RAL1023`, `ViaLine Traffic Yellow (RAL 1023)` and `ViaLine White` — so the plan holds **152** links. Trailing space is trimmed (`White Extrusion 80/20 ` → `White Extrusion 80/20`, `Click & Collect ` → `Click & Collect`) but **internal whitespace is preserved**, so `Bicycle Logo's  1200mm` (`Dublin!A16`, two spaces) and `Bicycle Logo's   1200mm` (`'Clonmel '!A52`, three) stay two items — collapsing internal runs would give 138 items, and the test asserts 140. The same description under two suppliers is two items: `Bicycle Logo's  1200mm` under `Kestrel` (`Dublin!A16`) and under `Kelly` (`Dublin!A18`).
12. **AC-12** — Exactly **13** source rows are incomplete, and each becomes an item with `active: true` and `needsReview: true`: `Dublin!A9`, `A12`, `A18`, `A29`, `A44`, `A45`, `A46`, `A47`, `A48`, `A62`, `A63`, `A78` and `'Clonmel '!A54`. `Dublin!A43` `Clock Blue + Yellow Nos` is **not** among them — `D43` is `1 Unit` and `E43` is `350`. Eleven of the thirteen have no price and therefore **no `ItemPrice` row at all**, rather than a zero price: `Dublin!A12`, `A18`, `A29`, `A44`, `A45`, `A46`, `A47`, `A48`, `A62`, `A63` and `'Clonmel '!A54`. The other two keep the price they carry — `Dublin!A9` `173.29` and `Dublin!A78` `253` — and are flagged for their missing unit alone. `ItemPrice` rows therefore number **129** against **140** items.
13. **AC-13** — The two rows below Clonmel's total row are imported and flagged, never dropped and never added to a total. `'Clonmel '!A75` `Road Diesel - White` and `A76` `Marked Gas Oil - Green` each become an item with supplier `Mid-West`, type `Fuel`, `unitLabel` `Ltrs`, `unitKind` `LITRE`, one `ItemLocation` link to `CLONMEL`, an `ItemPrice` of `1.23` and `0.96` respectively, `needsReview: true`, and a `notes` string containing the cell reference (`'Clonmel '!A75` / `'Clonmel '!A76`) and the words `below the total row`. Both appear in the report's `needsReview[]` with reason `BELOW_TOTAL_ROW`. With AC-12 that makes **15** items flagged `needsReview` and no others. `Dublin` contributes no below-total row: column A below `Dublin!A86` is empty, and the truck block at `Dublin!AM87:AZ104` is never read.
14. **AC-14** — Where the two sheets disagree about an item they share, the disagreement is resolved deterministically and recorded, never averaged and never duplicated into two items. Sheets are processed in the fixed order `Dublin` then `Clonmel `, and the first value wins. **Five** items disagree on the unit label — `MMA Paints - Red` (`Dublin!D50` `1 Unit` against `'Clonmel '!D64` `16kg`), `MMA Paints - Blue` (`1 Unit` / `16kg`), `MMA Paints - White` (`2 Unit` / `16kg`), `ViaLine  Traffic Red RAL1023` (`20 Kg` / `20kg`) and `ViaLine Traffic Yellow (RAL 1023)` (`20 Kg` / `20kg`) — and **five** disagree on the item type: `MultiGrip X440 Traffic Green RAL6024` (`Paint` / `M-Grip`), `MultiGrip X440 Traffic Purple. RAL 4006` (`Paint` / `M-Grip`), `ViaLine White` (`Paint` / `Vialine`), `ViaLine  Traffic Red RAL1023` and `ViaLine Traffic Yellow (RAL 1023)` (`Paint` / `Vialine`). Those are **eight** distinct items; each gets a `notes` string naming both cells and both values, and each appears in the report's `conflicts[]`. **Zero** items disagree on price — all twelve shared items carry the same price on both sheets — and a test asserts that count is zero. Should a price conflict ever arise, the importer refuses the whole run with a `ConflictError` naming both cells and both prices rather than picking one, because a silently chosen price would make the app disagree with the file it replaces (Invariant 10).
15. **AC-15** — Exactly **10** items carry a non-null `notes`: the 2 of AC-13 and the 8 of AC-14. The other 130 have `notes: null`, so the field stays a signal rather than provenance boilerplate on every row.
16. **AC-16** — The report is complete enough for a reviewer to check against the workbook by hand, and it is deterministic. `buildImportReport` returns an object holding: `source` with the file name, byte length and SHA-256 of the bytes read; `sheets[]` giving for each sheet its name, item-block first and last row, in-block row count and below-total row count (`Dublin` 3, 84, 82, 0 and `Clonmel ` 3, 70, 68, 2); `counts` with 10 suppliers, 19 item types, 140 items, 129 prices and 152 links; `needsReview[]` with exactly the 15 entries of AC-12 and AC-13, each carrying its `sheet!cell`, its description and its reasons drawn from `MISSING_SUPPLIER`, `MISSING_UNIT`, `MISSING_PRICE` and `BELOW_TOTAL_ROW`; `supplierVariants[]` with exactly the four collapsed spellings `Kellys`, `Kelly's`, `Meon ` and `Visever ` mapped to their canonical names with their row counts 19, 1, 1 and 2; `sharedItems[]` with the 12 items of AC-11; and `conflicts[]` with the 10 disagreements of AC-14. Every array is sorted by sheet then row, and building the report twice from the same workbook yields two byte-identical JSON strings.
17. **AC-17** — The report carries no money **outside `divergences[]`**. With that one array removed, `JSON.stringify(report)` contains no key matching `/price|value|amount/i` at any depth and none of the workbook's price strings appears anywhere in it; a missing price is reported as the reason code `MISSING_PRICE`, which is a value and not a key. `divergences[]` is exempt because AC-22 requires it to carry the workbook value and the stored value of every field the importer declined to overwrite, and a price is such a field — an admin running the seed already holds every price, so the exemption crosses no money boundary (Invariant 12 governs what a `YARD_STAFF` *session* is sent, and this report reaches no session). **The exemption must not be proved vacuously:** the assertion is made on a report built against a database in which a price *has* been corrected, so `divergences[]` is non-empty and holds both figures, and the same assertion is made on the ordinary report whose `divergences[]` is `[]`. Both pass.
18. **AC-18** — One run against a database holding only the two migration-seeded `Location` rows creates exactly **10** `Supplier`, **19** `ItemType`, **140** `Item`, **129** `ItemPrice` and **152** `ItemLocation` rows, and the returned `created` counts say the same. `Location`, `User`, `StockCount` and `StockCountLine` still hold exactly what they held before — 2, 0, 0 and 0 rows — so no yard and no historical count is invented.
19. **AC-19** — `Location` is used and never created. The importer resolves the two yards by `code` (`DUBLIN`, `CLONMEL`), the `Location` row count is 2 before and 2 after, and the 152 links point at `loc_dublin` and `loc_clonmel` — **82** to Dublin and **70** to Clonmel. Against a database from which the `CLONMEL` row has been deleted, the run throws `NotFoundError` whose message contains `CLONMEL`, exits non-zero, and creates no `Supplier`, `ItemType`, `Item`, `ItemPrice` or `ItemLocation` row.
20. **AC-20** — Prices land in the database exactly as the workbook computes them. All 129 `ItemPrice` rows have `effectiveFrom` = `2025-01-01`, `label` = `2025 Prices` — which is also what `Dublin!E2` and `'Clonmel '!E2` read — and `currency` = `EUR`. Read back through Prisma, `Cast Iron Studs` (`'Clonmel '!E19`, the formula `=5.2/0.85`) has `unitPrice.toString()` equal to `6.11764706`, and `Bauxite Buff  for MMA` (`Dublin!E10`) equal to `33.09` — not `33.090000000000003` and not `6.12`. Every item has at most one price, so `@@unique([itemId, effectiveFrom])` is never violated.
21. **AC-21** — **Idempotency.** A second run immediately after the first creates nothing and changes nothing. Its `created` counts are all `0` and its `skipped` counts are 10 / 19 / 140 / 129 / 152; the row count of each of the five tables is unchanged; and a dump of all five tables — every column of every row, ordered by `id` — is deep-equal to the dump taken after the first run, **ids included**, so no row was deleted and recreated. `npm run seed:workbook` exits `0` on the second run: a no-op re-run is a success, not an error.
22. **AC-22** — **A re-run never overwrites a human's edit.** The importer is insert-only: it creates rows whose natural key is absent and leaves every existing row untouched, because from #6 onward the database is the system of record and the workbook is a historical file — an importer that overwrote would undo the very corrections the 15 `needsReview` flags exist to prompt. Proved by a third run: after the first import, an `ADMIN` sets `School Logo Triangle`'s supplier to `Kestrel`, changes an item's `unitLabel` from `Tonne` to `tonne`, corrects a price, and archives an item with `active: false`; the third run creates nothing, all four edits survive byte for byte, and it exits `0`. The service performs no `UPDATE` and no `DELETE` — asserted by scanning its module for `.update`, `.updateMany`, `.upsert`, `.delete` and `.deleteMany` — and every workbook value that differs from the stored one is listed in the report's `divergences[]` with its entity, key, field, workbook value and database value.
23. **AC-23** — **The supplier-less duplicate gap carried forward from 004 AC-15 is closed here.** Postgres treats `NULL`s as distinct, so `@@unique([description, supplierId])` cannot stop two `School Logo Triangle` rows that both have no supplier. The importer matches existing items in application code on `(description, supplierId ?? null)`, treating two nulls as equal. Three assertions: after two runs there is exactly **one** item whose description is `School Logo Triangle`; if that item is inserted by hand with `supplierId: null` **before** the first run, the import creates no second copy and reports it as skipped; and a plan built from a source holding two supplier-less rows with the same description collapses them into one item with two links, rather than planning two items the database would accept.
24. **AC-24** — **The write is atomic.** The whole import runs inside one transaction with an explicit timeout, so a failure part-way leaves the database exactly as it was. Given a plan whose second item has a whitespace-only description — which `Item_description_not_empty` refuses — `importWorkbook` rejects, and afterwards `Supplier`, `ItemType`, `Item`, `ItemPrice` and `ItemLocation` all hold zero rows: the first item and its supplier were rolled back too, not left behind for the next run to trip over.
25. **AC-25** — No historical count data is imported. After a full run `StockCount` and `StockCountLine` hold zero rows; no module under `src/lib/excel/` or `src/server/items/` reads a worksheet column beyond `E`; and the strings `Summary` and `Clonmel Trucks & Yard` appear nowhere in the importer's source except in a comment recording that they are excluded.
26. **AC-26** — `npm run seed:workbook` runs the importer end to end and leaves the source workbook untouched. With no arguments it reads `Samples/Stock @ 01-Sep-2026.xlsx`, prints the report to stdout — including the 140-item count and the 15 `needsReview` entries — and exits `0`, and `git status --porcelain -- Samples` is empty afterwards. `--file <path>` reads another workbook; `--report <path>` additionally writes the report as JSON; with that flag absent the run writes no file anywhere in the repository. A failing run exits non-zero with a message naming the sheet and cell or the missing `Location` code, not a bare stack trace.
27. **AC-27** — **Which checks survive with no database,** mirroring 004 AC-26 and 003 AC-23. Parsing and planning are pure. With `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointing at a hostname that does not resolve: `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` each exit `0`; `npm run seed:workbook -- --dry-run` exits `0`, prints the same report, states 140 planned items and opens no connection; and both `init` scripts exit `0`, ending with `[OK] Environment ready (database checks skipped)`. Under the same variables `npm run seed:workbook` **without** `--dry-run` exits non-zero, names the database, and creates nothing. AC-1 to AC-17 are each proved by a test that runs in `npm run test:unit`; AC-18 to AC-25 need Postgres and live in `*.db.test.ts`.
28. **AC-28** — **Where the tests live,** and the two suites stay disjoint. The pure tests are `src/lib/excel/workbook-reader.test.ts`, `src/lib/units.test.ts` and `src/server/items/workbook-plan.test.ts`; the database tests are `src/server/items/workbook-import.db.test.ts`, picked up by `vitest.db.config.ts`'s existing `src/**/*.db.test.ts` with no configuration change. `npm run test:unit` executes zero files matching `*.db.test.ts`. The database test calls `resetTestDb()` in `beforeEach`, seeds nothing it does not need, and `npm run test:db` passes twice in a row and with its files in any order.
29. **AC-29** — **004 AC-31's `unitPrice` scan is amended, not deleted, and stays a money-boundary guard.** #4 asserted that no shipping module under `src/` or `scripts/` names `unitPrice`, because none could legitimately need it yet; this feature's writer must. The scan in `tests/unit/project-contract.test.ts` now asserts an **exact** permitted list, `toEqual(["src/server/items/workbook-import-service.ts", "src/server/items/workbook-plan.ts"])`, so a third module naming the column turns it red; it keeps its non-vacuity assertion that it inspected `src/server/db.ts`; and it additionally asserts that **no** file under `src/app/`, `src/components/`, `src/lib/` or `scripts/` names `unitPrice` or `unitPriceSnapshot` at all. `unitPriceSnapshot` stays forbidden everywhere outside a test: the first reader of a snapshot is still #8, and it must go through `shapeForRole`.
30. **AC-30** — The gate is green, in full. `exceljs` is added to `dependencies` in `package.json` at an exact pinned version and appears in `package-lock.json`; `seed:workbook` is added to `scripts`; `npm ci` succeeds from the lockfile. `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, `npx prisma migrate status` and `npm run test:db` all pass, and `./init.ps1` ends with `[OK] Environment ready` having **executed** the database checks rather than skipping them. `prisma/schema.prisma`, every directory under `prisma/migrations/` and `prisma/migrations/migration_lock.toml` are byte-identical to their state before this feature: #5 adds no migration and changes no schema.
31. **AC-31** — The feature adds no application surface. Its changed-file list contains no path under `src/app/` or `src/components/`, no route handler, no server action and no React component: `git diff --name-only` lists only `package.json`, `package-lock.json`, `src/lib/excel/workbook-reader.ts`, `src/lib/units.ts`, their two test files, `src/server/items/workbook-plan.ts`, `src/server/items/workbook-import-service.ts`, their two test files, `scripts/seed-workbook.ts`, `tests/unit/project-contract.test.ts`, `eslint.config.mjs`, `docs/architecture.md`, `specs/features/005-seed_from_workbook.md`, `feature_list.json` and files under `progress/`. Nothing under `Samples/` is modified, and `src/lib/excel/workbook-reader.ts` and `src/lib/units.ts` import neither `@prisma/client` nor `@/server/db`, so `tests/unit/hashing-boundary.test.ts` needs no change.

## Out of scope

- **Any screen, route or server action.** The 15 flagged items are surfaced by #6's item
  master and #15's housekeeping worklist. This feature's only user interface is stdout.
- **Historical quantities.** The 16 Dublin and 15 Clonmel `Qty` / `Value` column pairs are
  not read and not stored, and no table here is shaped to receive them. Counting starts
  fresh (Part 2 *Not imported*, `specs/product-brief.md`).
- **The `Summary` sheet.** Total Stock, MoM, YoY and movement are all derivable from count
  totals and belong to #11, computed on read.
- **The `Clonmel Trucks & Yard` sheet, and `Dublin!AM87:AZ104`.** Vehicles, boilers, bags
  and yard bulk are M7 (#17–#19); `Q7` and `Q8` in `specs/domain-model.md § Still open`
  block only that milestone and nothing here.
- **Creating or editing `Location`.** #4's migration owns both yards. This feature reads
  them and fails if either is missing.
- **Repairing the workbook's defects.** The `#REF!` cells, the two year-typo headers, the
  two prose date headers, the eight drifted `Value` cells and the `AH` column's
  kilogram-shaped quantities all sit in columns this feature never reads. They stay
  recorded in Part 1 and are neither fixed, reproduced nor reported here.
- **Writing back to the workbook.** `Samples/` is opened read-only and stays byte-identical;
  the export direction is #12.
- **Deciding whether the two below-total fuel rows belong in a yard total.** They are
  imported, linked to Clonmel and flagged. Whether a future count includes them is a
  counting decision for #7–#9 and an `ADMIN`, not the importer's.
- **Resolving the five unit and five type conflicts properly.** The importer takes Dublin's
  value, records the alternative in `notes` and reports it. Choosing the right unit for
  `MMA Paints - Red` is a housekeeping edit in #6, not a rule the workbook settles.
- **De-duplicating items that differ only by internal whitespace.** `Bicycle Logo's  1200mm`
  and `Bicycle Logo's   1200mm` stay two items. Part 2 says trim, not collapse, and merging
  them would silently drop a row a yard can hold stock against.
- **`NULLS NOT DISTINCT` on `(description, supplierId)`.** #4 put it out of scope and handed
  de-duplication to the application; AC-23 does it there. No migration is added.
- **Updating existing rows.** AC-22 makes the importer insert-only. A reconciliation tool
  that replays workbook changes onto an edited master is a different feature, and nobody has
  asked for one: from #6 the master is edited in the app.
- **Refusing to run against a database that already holds counts.** Insert-only means a run
  after go-live can only add missing master rows, so no guard is added.
- **Seeding users or any password.** #3 owns `npm run admin:create`, and no account is
  seeded with a committed password.
- **Widening 004 AC-6's `/price/i` filter on monetary columns** (#4 review, observation 2).
  This feature adds no column, so the gap it names cannot widen here.
- **Performance work.** The import is one transaction of batched writes; there is no
  benchmark, no index and no `EXPLAIN` budget in this feature.
- **CI.** `init` remains the gate.

## Post-approval amendments

### AC-17 exempts `divergences[]` — ruled by the user on 2026-09-10

The implementer built AC-17 and AC-22 both as written rather than choosing between them,
and reported the collision instead of hiding it. AC-17 said the report carries no money at
any depth; AC-22 requires `divergences[]` to hold the workbook value and the stored value
of every field the importer declined to overwrite, and its own scenario has an `ADMIN`
correcting a price. A price divergence therefore puts a price string in the report.

The two collide **only** in that case: every report built from the workbook against a
consistent database has `divergences: []`, which is the report AC-17's original test
asserted on — so the collision never fired, and the exemption was never exercised either.

**Ruling: the report shows both figures, inside `divergences[]` and nowhere else.** The
reasoning the user accepted: an `ADMIN` running `npm run seed:workbook` already holds every
price in the system, so the exemption discloses nothing, and Invariant 12 governs what a
`YARD_STAFF` **session** is sent — this report reaches no session at all. The alternative,
reporting only that a price differs, was rejected as making the one field where drift
matters most the one field the report will not name.

The amendment closes the vacuity the original wording allowed: AC-17 now requires the
money-free assertion to be proved on a report whose `divergences[]` is **non-empty and
holds both figures**, as well as on the ordinary empty one. Before this, the criterion
passed without ever meeting the case it was written about.

### AC-31's file list gains `eslint.config.mjs` and `docs/architecture.md` — 2026-09-10

Both changes were required by the review, not chosen by the implementer.

`docs/architecture.md` said `src/lib/excel/` **never** imports from `src/server/`, and the
workbook reader does — it imports `ValidationError`, because AC-2, AC-6 and AC-7 all require
*the reader* to throw it. The reviewer flagged that the doc and the code disagree in writing
and that one of them had to change.

The coordinator amended the doc rather than the code: the rule was a proxy for the
constraint that matters — nothing under `src/lib/` may reach a database or a server-only
runtime — and `src/server/errors.ts` is four stateless classes that import nothing, so it
compromises neither. **The exception is narrow and is enforced by ESLint**, which is why
`eslint.config.mjs` is now in scope: `src/lib/**` may import `@/server/errors` and nothing
else from `@/server/`. Before this feature no lint rule covered `lib → server` at all, so
the boundary is stricter after the amendment than the original rule ever was in practice.

The cleaner alternative — moving the error classes to `src/lib/errors.ts` and re-exporting
them from `src/server/errors.ts` — remains open and is recorded in `docs/architecture.md`.
It was not done here because it would touch every file feature #3 committed.

## Open questions

None blocking. Four decisions this spec settles with a stated answer rather than leaving
open, each flagged so the user can strike it at approval:

1. **The two below-total fuel rows get `needsReview = true`** as well as a `notes` string,
   because Part 2 says "imported and flagged" and `needsReview` is the only flag column the
   schema has. The alternative is `notes` alone, which would keep `needsReview` meaning
   exactly "missing supplier, unit or price" — but would leave the two rows invisible on
   #15's housekeeping worklist, the one screen built to ask a human about them.
2. **The five unit conflicts and five type conflicts do *not* set `needsReview`.** They are
   recorded in `notes` and in the report only, because Part 5 defines the housekeeping
   worklist by enumeration — `needsReview = true`, missing `unitLabel`, or no `ItemPrice` —
   and a cross-sheet disagreement is none of those. Flipping this would add the 8 items of
   AC-14 to the 15 of AC-13.
3. **`ItemType.code` and `ItemType.name` are both the workbook's own string** (`Thermo-P`,
   `Cold A-S`, `F&F`). `docs/conventions.md` forbids tidying domain spellings, and
   `docs/domain-glossary.md` already heads that column "Code". The alternative is a
   slug-style code (`THERMO_P`, `F_AND_F`), which reads better in a URL but invents a second
   spelling for a label yard staff recognise, under a mangling rule no document specifies.
4. **`ItemLocation.sortOrder` is the source row number** (Dublin 3–84, Clonmel 3–70 and
   75–76). It sorts identically to the printed yard sheet and lets any row be traced back to
   its cell, and the gap at 71–74 records that the fuel rows sit below the total. The
   alternative is a dense 1-based sequence per yard.

5. **Internal whitespace is preserved, so the two Kestrel bicycle logos are four items, not
   two.** *Raised with the user at approval and decided by them on 2026-09-09; recorded here
   so it is not re-litigated, and so nobody "tidies" these rows later.* Exactly two pairs in
   the workbook differ **only** by internal spacing, and in each pair the supplier, type,
   unit and price are identical:

   | Collapsed description | Dublin | Clonmel |
   |---|---|---|
   | `Bicycle Logo's 1200mm` | `A16`, two spaces — Kestrel, `1 Unit`, `20` | `A52`, three spaces — identical otherwise |
   | `Bicycle Logo's 2750mm` | `A17`, two spaces — Kestrel, `1 Unit`, `95` | `A51`, three spaces — identical otherwise |

   Collapsing internal runs when matching would make each pair one item held at both yards,
   giving **138** items and 14 shared items. The user chose to preserve the spelling exactly,
   giving **140** items and 12 shared items, as AC-11 states: the importer is faithful to the
   file and does not decide that a difference in the source is a mistake.

   The consequence, accepted knowingly: the item master will show two pairs of rows that only
   a character count tells apart, each yard counts its own, and #15's housekeeping cannot
   surface them — all four are complete and held, so no `needsReview` reason applies. If they
   are later judged to be duplicates, merging them is an item-master action in #6, not a
   re-import.

Two corrections to non-normative prose, noted rather than made, since neither is a rule this
feature depends on:

- `docs/domain-glossary.md` § Units says "21 distinct unit strings normalise to 13". **21**
  is right only for the 150 in-range rows; including the two fuel rows the file holds **22**
  distinct unit strings plus 7 empty cells. I could not reproduce **13** under any counting:
  the distinct `(unitKind, unitQuantityKg)` pairs are **11**. Part 2's table is what AC-10
  pins.
- `specs/domain-model.md` Part 2 lists `Visever` and `Visever ` as a variant pair. Only the
  trailing-space form occurs in the file; a trim covers it either way.
