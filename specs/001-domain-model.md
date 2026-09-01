# 001 — Domain model

Derived by reading the XML parts of `Samples/Stock @ 01-Sep-2026.xlsx` directly.
This document is the reference the schema, the seed importer and the Excel exporter
are all checked against.

---

## Part 1 — What the workbook actually contains

### Sheets

| Sheet | Rows | Columns | Shape |
|---|---|---|---|
| `Summary` | 1–22 | A–AT | 40 months of totals and variance |
| `Dublin` | 1–88 | A–V | Item master + 8 stock counts |
| `Clonmel ` | 1–75 | A–AE | Item master + 12 stock counts |
| `Clonmel Trucks & Yard` | 1–45 | A–M | Boilers, bags, yard bulk |

Note the trailing space in the sheet name `Clonmel `. The exporter must not reproduce
that typo.

### Yard sheet layout (`Dublin`, `Clonmel `)

Row 1 holds count dates as Excel serials, above each `Qty` column.
Row 2 is the header:

```
A Description | B Supplier | C Type | D Unit | E "2025 Prices" | then repeating: Qty | Value
```

Dublin runs counts from column `G/H` to `U/V`; Clonmel from `F/G` to `AD/AE`.

Each data row is one item. `Value = Qty × E`, written in the workbook as
`=+G3*E3`, `=SUM(J3*E3)`, or `=E3*F3` — three spellings of the same formula, which is
itself a symptom of hand maintenance.

The total row is `SUBTOTAL(9, …)` — `Dublin!86`, `Clonmel!72`.

**Known defects to be fixed, not reproduced:**

| Cell | Defect |
|---|---|
| `Dublin!Q13`, `Dublin!U13` | `=+#REF!` — the referenced cell was deleted |
| `Dublin!R86`, `Dublin!V86` | Total row evaluates to `#REF!` |
| `Summary!AK3`, `Summary!AP4` | `#REF!` propagating into `Total Stock` |
| `Summary!B18` | `=+B12+1` — an unexplained `+1` fudge |
| `Summary!R19` | `Dublin diff` of `1` — a manual plug |
| `'Clonmel '!R1` | Date header `2025-01-05`, positioned between `2025-12-01` and `2026-02-03` — a year typo |
| `Dublin!U1` | Date header `2026-12-31`, 16 months after the file's own date of 01-Sep-2026 |

### Summary sheet layout

| Row | Label | Content |
|---|---|---|
| 1 | — | Month-end dates, newest in column B, going back to `AT` |
| 3 | `South` | `='Clonmel '!AE72` — the Clonmel total |
| 4 | `Dublin` | `=Dublin!T86` — the Dublin total |
| 5 | `Total Stock` | `=B3+B4` |
| 7 | `MoM Variance` | `=+B5-C5` (this month minus last month) |
| 9 | `YoY Variance` | `=+B5-M5` (this month minus the same month last year) |
| 11–14 | movement | per-yard movement and total |
| 16–20 | `Bal per nl` | manual reconciliation against the nominal ledger |

**Every one of these is derivable from count totals.** None of it needs storage.

### Trucks & Yard layout

| Block | Cells | Content |
|---|---|---|
| Boilers | `A8:H22` | Truck reg, role, `% Full`, `KG per Full Boiler` (250), computed kg — for White and Yellow thermo |
| A/S boilers | `A41:G43` | Same idea for `A/S - BUFF`, `A/S - RED`, `Cats Eyes` |
| Bags on trucks | `A26:K37` | Per truck: bag counts × 25 kg (White/Yellow), × 20 kg (Beads) |
| Yard bulk | `J13:M20` | `White, Yellow, Buff, Red, Hi-Grade W, Hi-Grade Y, Hi-Grade W (Kestrel)` — bags × kg per bag |
| Rollup | `C3:M3` | Totals feeding the yard sheet |

Sheet notes, to be preserved as constants with citations:

- `A5`: "Full Hand Truck Boiler = 10 bags or 250 Kgs"
- `A45`: "Note: Material in 25kgs, 40 bags = 1 Tonne"

Truck registrations present: `03 TN 3317`, `05 TS 8347`, `06 TN 2651`, `06 TN 3308`,
`06 TN 3378`, `06 TS 3308`, `06 TS 8391`, `07 TN 3217`, `132 D 23712`, `132 D 23815`,
`132 TS 1108`, `141 D 41062`, `192 D 22122`, `201 D 6447`, `212 D 22432`,
`221 D 4378`, `251 D 23451`, `252 D 26246`, `262 D 1654`.

Role labels: `Feeder T`, `Extruder`, `Spare`, `ToD`, `KoD`, `LK`, `JB`, `KoS`, `PH`,
`GS`, `MoG`, `A/S - BUFF`, `A/S - RED`, `Cats Eyes`.

---

## Part 2 — Normalisation rules for the importer

### Suppliers

Collapse these spelling variants to one supplier each:

| Variants in workbook | Canonical |
|---|---|
| `Kelly`, `Kellys`, `Kelly's`, `tKelly's` | `Kelly` |
| `Meon`, `Meon ` (trailing space), `tMeon` | `Meon` |
| `Visever`, `Visever ` | `Visever` |
| `Kestrel` | `Kestrel` |
| `Ennis Flint`, `Roadstuds`, `Roadcraft`, `Pittman`, `M & E`, `Mid-West` | as written |

The leading-`t` variants (`tMeon`, `tKelly's`, `tBriteline`) appear to be typing slips
in the source. Strip a leading `t` only when the remainder matches a known supplier.

### Item types

Canonical set, with `sortOrder` matching the order they appear on the yard sheets:

`Thermo-P`, `Beads`, `C-E`, `A-S`, `Cold A-S`, `Primer`, `M-Grip`, `Vialine`, `Paint`,
`MMA`, `Logo`, `Sealer`, `Cleaner`, `F&F`, `Ramps`, `Aerosol`, `Bauxite`, `Glue`,
`Fuel`.

`Logo's` collapses into `Logo`.

### Units

Preserve the original string as `unitLabel` (staff recognise it), and derive:

| `unitLabel` examples | `unitKind` | `unitQuantityKg` |
|---|---|---|
| `Tonne` | `TONNE` | 1000 |
| `20kg`, `20 Kg`, `20 Kgs`, `20kgs`, `18KG`, `21 Kg`, `22 Kg`, `16kg`, `14kg`, `14 kgs`, `900 Kgs`, `900kg` | `KILOGRAM` | parsed number |
| `25L` | `LITRE` | — |
| `Ltrs` | `LITRE` | — |
| `1 Unit`, `I Unit`, `2 Unit`, `3 Unit`, `Unit`, `1` | `UNIT` | — |
| `lin.m` | `LINEAR_METRE` | — |
| empty | `UNIT` | — |

`I Unit` is a capital i, not the digit one. Both map to `UNIT`.

### Items

- An item is identified by `(description, supplierId)` after trimming whitespace.
- Descriptions carry trailing spaces in the source (`White Extrusion 80/20 `) — trim.
- The same description can appear on both yard sheets with a different price
  (`Red - KestrelFlex - Anti-Skid` is 885 in both; `Bicycle Logo's 1200mm` appears
  under both `Kestrel` and `Kellys` — those are two distinct items).
- Rows with a description but no unit or price (e.g. `Dublin!A29 Pedestrian Logo White`,
  `Dublin!A62 Multigrip Signal Yellow`, `Dublin!A43 Clock Blue + Yellow Nos` — about 15
  in total) are imported as items with `active: true`, `needsReview: true` and **no**
  `ItemPrice`. They appear in the import report and on the housekeeping worklist. They
  are never silently dropped, and never silently treated as zero-valued stock.
- A row with a blank description is **not** importable — `description` is required.
  The importer fails loudly and names the sheet and row so it can be fixed at source.
- `E` may itself be a formula (`=5.2/0.85`). Import the computed value.

### Prices

- The single price column becomes an `ItemPrice` row with
  `effectiveFrom = 2025-01-01` and a label of `2025 Prices`.
- Future price lists are added as new `ItemPrice` rows. Nothing is ever overwritten.

### Not imported

Historical `Qty`/`Value` columns, the `Summary` sheet, and the entire
`Clonmel Trucks & Yard` sheet — including vehicles, which move to M7 with the rest of
that module. Counting starts fresh from the next count.

---

## Part 3 — The schema

```prisma
enum Role        { COUNTER MANAGER ADMIN }
enum CountStatus { DRAFT SUBMITTED APPROVED }
enum UnitKind    { TONNE KILOGRAM LITRE UNIT LINEAR_METRE }

User            id  email(unique)  name  passwordHash  role  active
                createdAt  updatedAt

Location        id  code(unique)   name  active  sortOrder
                # DUBLIN "Dublin", CLONMEL "Clonmel"

Supplier        id  name(unique)   active

ItemType        id  code(unique)   name  sortOrder

Item            id  description   # REQUIRED, non-empty after trim
                supplierId  itemTypeId
                unitLabel?  unitKind  unitQuantityKg?
                active  needsReview Boolean @default(false)
                notes?
                @@unique([description, supplierId])

ItemPrice       id  itemId  unitPrice Decimal(12,4)  currency("EUR")
                effectiveFrom  label?  createdAt
                @@unique([itemId, effectiveFrom])

ItemLocation    id  itemId  locationId  sortOrder  active
                @@unique([itemId, locationId])

StockCount      id  locationId
                periodYear Int   periodMonth Int   # the month this count CLOSES
                countDate  Date                    # the day the yard was walked
                status  createdById  submittedAt?
                approvedById?  approvedAt?  notes?
                @@unique([locationId, periodYear, periodMonth])

StockCountLine  id  stockCountId  itemId
                quantity Decimal(12,4)?   # NULL = not counted; 0 = counted, none held
                unitPriceSnapshot Decimal(12,4)?
                note?
                @@unique([stockCountId, itemId])
```

**Deferred to M7** — `Vehicle`, `BoilerReading`, `BagReading`, `YardBulkReading`, and
the `BoilerMaterial` / `BagMaterial` enums. The Trucks & Yard sheet is out of v1 scope;
its shape is documented in Part 1 so the model is ready when M7 starts.

### Invariants

1. **`value` is never a column.** It is `quantity × unitPriceSnapshot`, computed on read.
2. **`unitPriceSnapshot` is null while `DRAFT`.** It is written once, at `SUBMITTED`,
   from the `ItemPrice` effective on `countDate`. It is never rewritten.
3. **An `APPROVED` count is immutable.** Only an `ADMIN` may reopen it, and doing so is
   audited.
4. **A count line without a price** (item has no `ItemPrice`) contributes `0` to the
   total **and raises a warning** on the count summary. It is never silently treated as
   zero-valued stock.
5. **`quantity = null` blocks submission.** Every line must be either counted (including
   counted as `0`) or explicitly dismissed as not stocked at that yard. This is the one
   rule the workbook cannot express, and the reason its blank cells are ambiguous.
6. **`(locationId, periodYear, periodMonth)` is unique.** One count per yard per month —
   *not* per day. See Part 4.
7. **A period is complete** only when every `active` Location has an `APPROVED` count
   for it. Total Stock, MoM and YoY exist only for complete periods.
8. **Decimal everywhere** for money and quantity. Never `Float`.
9. **`Item.description` is required and non-empty.** Enforced at the database and at
   every form.

### Derived queries (no storage)

| Report | Definition |
|---|---|
| Line value | `quantity × unitPriceSnapshot` |
| Yard total | `Σ` line values for that yard's `APPROVED` count in the period |
| Total stock | `Σ` yard totals — **only for complete periods** |
| MoM variance | `total(period) − total(previous complete period)` |
| YoY variance | `total(y, m) − total(y − 1, m)` |
| Movement | Per-yard difference between consecutive counted periods |
| Held | `quantity > 0` |
| Dormant | `quantity = 0` across the last 3 counted periods |
| One-off | held in exactly one period |

---

## Part 4 — Periods, and why a count is not a date

### The evidence

Every date serial in the workbook, converted:

**Dublin:** `2025-05-30 Fri` · `06-30 Mon` · `07-31 Thu` · `09-01 Mon` · `10-01 Wed` ·
`10-31 Fri` · `11-30 Sun` · `2026-12-31 Thu`

**Clonmel:** `2025-06-30` · `09-01` · `10-01` · `11-01 Sat` · `12-01` · `2025-01-05` ·
`2026-02-03` · `03-02` · `04-01` · `05-01` · `06-02` · `06-30`

**Summary headers:** strict calendar month-ends — `2025-10-31`, `09-30`, `08-31`,
`07-31`, `06-30`, `05-31`, …

Four facts:

1. **The Dublin count dated `2025-09-01` is the Summary column headed `2025-08-31`.**
   One stock take, two different dates on two sheets.
2. **Two dates are wrong.** Clonmel's `2025-01-05` sits positionally between `2025-12-01`
   and `2026-02-03` — a year typo. Dublin's `2026-12-31` is 16 months after the file's
   own date of 01-Sep-2026.
3. **Some counts fall on weekends** — `11-01 Sat`, `11-30 Sun` — despite the stated rule
   that counting happens on a business day.
4. **Months get skipped.** Clonmel jumps `2025-06-30` → `2025-09-01`, so July and August
   2025 have no Clonmel count at all.

### The rule

A stock take is done at the **start of a month**, or on the **last business day of the
month before**. Both close the same month. Therefore:

- `(periodYear, periodMonth)` identifies the count. This is what MoM and YoY join on.
- `countDate` records when the yard was actually walked. It is a fact, not a key.

**Period defaulting.** From `countDate`: if `day <= 5` the period is the *previous*
month, otherwise it is `countDate`'s own month. The derived period is shown to the user
on the create screen and can be overridden.

| `countDate` | Default period |
|---|---|
| `2026-09-30` (Wed) | 2026-09 |
| `2026-10-01` (Thu) | 2026-09 |
| `2026-10-05` (Mon) | 2026-09 |
| `2026-10-06` (Tue) | 2026-10 |

**Business day.** A `countDate` on a weekend or an Irish public holiday raises a
confirmation prompt but does **not** block. The workbook proves it happens.

**YoY** is `(periodYear − 1, periodMonth)` — never "twelve columns to the left", which
is what the Summary sheet does today and which breaks the moment a month is skipped.

---

## Part 5 — Held, one-off and dormant items

### The problem

Items appear on stock for a month and are gone the next. From the Dublin sheet:

| Item | Quantities across the 8 counts |
|---|---|
| `Swept Path Markers for Transdev` | `–, –, –, –, 580, 580, 65, –` |
| `EV ONLY text for Epower` | `0, –, 0, 0, 60, –, 105, 0` |
| `Disabled Logo on Purple B'ground` | `–, –, –, –, –, 1, 1, 1` |
| `Pre-form for Lucan ETNS` | `0, –, 0, 1, 1, 1, 0, –` |

**In Dublin's most recent count, roughly 42 of 82 rows are zero or blank.** Half the
printed sheet is asking about stock that is not there.

### Definitions

| Term | Definition |
|---|---|
| **Held** | `quantity > 0` in that period |
| **One-off** | Held in exactly one period across its history |
| **Dormant** | `quantity = 0` across the last 3 counted periods |
| **Not counted** | `quantity IS NULL` — nobody looked. Blocks submission |

### Where each surface defaults

| Surface | Default | Why |
|---|---|---|
| Count entry | **All** items assigned to that yard | You cannot record stock with no row to type in |
| Count summary / view | **Held only** | "See what we have, not what we don't" |
| Dashboard | **Held only** | |
| Excel yard export | **Held only**, with a "show all" option | The export stops carrying 40 dead rows |
| Printable blank sheet | **All** items | Nothing should be unaskable on paper |

### Adding a one-off during a count

Two paths, both from the entry screen:

1. **Search the master** for an item not assigned to this yard → creates an
   `ItemLocation` link and a line, effective this period forward.
2. **Create a new item inline** — `description` required; `supplier`, `type`, `unit` and
   price may be filled in later, in which case the item is created with
   `needsReview = true`.

### Housekeeping

Dormant items surface on a housekeeping screen where a `MANAGER` archives them in one
click. **Nothing is auto-archived.** Archiving sets `Item.active = false`: it disappears
from entry sheets, and every historical line referencing it is untouched.

The same screen lists **incomplete items** — `needsReview = true`, missing `unitLabel`,
or no `ItemPrice`.

---

## Answered questions

Resolved with the user on 2026-09-01. Recorded here so later sessions do not re-open them.

| # | Question | Answer |
|---|---|---|
| Q1 | Does Dublin have its own trucks, or is Trucks & Yard Clonmel-only? | **Deferred.** Focus on the Dublin and Clonmel yard sheets. Trucks & Yard moves to M7 and is re-opened there. |
| Q2 | Does truck and yard-bulk material roll into the yard total? | **Deferred to M7** with Q1. |
| Q3 | Is `Bal per nl` reconciliation still performed? | **Dropped from scope.** Not a figure this team owns. Removed from the product brief and the glossary. |
| Q4 | Items with no price — obsolete, or never filled in? | **Import them, flag them.** `description` becomes mandatory going forward; items missing description, unit or price are imported with `needsReview = true` and appear on the housekeeping worklist. Their lines contribute `0` with a visible warning. |
| Q5 | Are counts month-end or ad hoc? | **Start of the month, or the last business day of the month before — a business day.** This is the origin of the period model in Part 4. Non-business-day dates warn but are allowed. |

### Still open — M7 only

Nothing scheduled before M7 is blocked by these.

| # | Question | Blocks |
|---|---|---|
| Q6 | Does Dublin have its own trucks, or is Trucks & Yard Clonmel-only? | #17 `trucks_schema_seed` |
| Q7 | Do truck and yard-bulk materials roll **into** the yard count total, or stay a separate figure? If they roll in, #10 `dashboard_totals` and #12 `export_yard_sheet` change too. | #18 `trucks_entry_ui` |
