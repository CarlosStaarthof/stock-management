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
- Rows with a description but no price (e.g. `Dublin!R29 Pedestrian Logo White`) are
  imported as items with `active: true` and **no** `ItemPrice`. They must be flagged in
  the import report, not silently dropped.
- `E` may itself be a formula (`=5.2/0.85`). Import the computed value.

### Prices

- The single price column becomes an `ItemPrice` row with
  `effectiveFrom = 2025-01-01` and a label of `2025 Prices`.
- Future price lists are added as new `ItemPrice` rows. Nothing is ever overwritten.

### Not imported

Historical `Qty`/`Value` columns, the `Summary` sheet, and all Trucks & Yard readings.
Vehicles and their role labels **are** imported; their readings are not.

---

## Part 3 — The schema

```prisma
enum Role            { COUNTER MANAGER ADMIN }
enum CountStatus     { DRAFT SUBMITTED APPROVED }
enum UnitKind        { TONNE KILOGRAM LITRE UNIT LINEAR_METRE }
enum BoilerMaterial  { WHITE_THERMO YELLOW_THERMO AS_BUFF AS_RED CATS_EYES }
enum BagMaterial     { WHITE_THERMO YELLOW_THERMO BEADS }

User            id  email(unique)  name  passwordHash  role  active
                createdAt  updatedAt

Location        id  code(unique)   name  active  sortOrder
                # DUBLIN "Dublin", CLONMEL "Clonmel"

Supplier        id  name(unique)   active

ItemType        id  code(unique)   name  sortOrder

Item            id  description  supplierId  itemTypeId
                unitLabel  unitKind  unitQuantityKg?  active  notes?
                @@unique([description, supplierId])

ItemPrice       id  itemId  unitPrice Decimal(12,4)  currency("EUR")
                effectiveFrom  label?  createdAt
                @@unique([itemId, effectiveFrom])

ItemLocation    id  itemId  locationId  sortOrder  active
                @@unique([itemId, locationId])

StockCount      id  locationId  countDate  status
                createdById  submittedAt?  approvedById?  approvedAt?  notes?
                @@unique([locationId, countDate])

StockCountLine  id  stockCountId  itemId
                quantity Decimal(12,4)  unitPriceSnapshot Decimal(12,4)?  note?
                @@unique([stockCountId, itemId])

Vehicle         id  registration(unique)  roleLabel  locationId  active

BoilerReading   id  stockCountId  vehicleId  material BoilerMaterial
                percentFull Decimal(5,4)  kgPerFullBoiler Decimal(8,2)
                @@unique([stockCountId, vehicleId, material])

BagReading      id  stockCountId  vehicleId  material BagMaterial
                bags Decimal(10,2)  kgPerBag Decimal(8,2)
                @@unique([stockCountId, vehicleId, material])

YardBulkReading id  stockCountId  materialLabel
                bags Decimal(10,2)  kgPerBag Decimal(8,2)
                @@unique([stockCountId, materialLabel])
```

### Invariants

1. **`value` is never a column.** It is `quantity × unitPriceSnapshot`, computed on read.
2. **`unitPriceSnapshot` is null while `DRAFT`.** It is written once, at `SUBMITTED`,
   from the `ItemPrice` effective on `countDate`. It is never rewritten.
3. **An `APPROVED` count is immutable.** Only an `ADMIN` may reopen it, and doing so is
   audited.
4. **A count line without a price** (item has no `ItemPrice`) contributes `0` to the
   total and is listed in a "missing price" warning on the count summary. It is never
   silently treated as zero-valued stock.
5. **`(locationId, countDate)` is unique.** One count per yard per day.
6. **Decimal everywhere** for money and quantity. Never `Float`.

### Derived queries (no storage)

| Report | Definition |
|---|---|
| Count total | `Σ (line.quantity × line.unitPriceSnapshot)` over approved lines |
| Yard total | Count total for the latest `APPROVED` count of that yard |
| Total stock | Sum of yard totals for the period |
| MoM variance | `total(period) − total(previous period)` |
| YoY variance | `total(period) − total(same month, previous year)` |
| Movement | Per-yard difference between consecutive counts |
| Boiler kg | `percentFull × kgPerFullBoiler` |
| Bag kg | `bags × kgPerBag` |

---

## Open questions

Recorded rather than guessed. Each blocks only the feature named.

| # | Question | Blocks |
|---|---|---|
| Q1 | Does Dublin have its own trucks, or is the Trucks & Yard sheet Clonmel-only? The workbook has one such sheet, named for Clonmel. | #10 `trucks_schema_seed` |
| Q2 | Should truck and yard-bulk material roll **into** the yard count total, or stay a separate figure? In the workbook they are separate sheets and the Summary uses only the yard sheet totals. | #11, #12 |
| Q3 | Is `Bal per nl` reconciliation still performed, and should the app capture the ledger figure to compute the difference? | #12 `dashboard_totals` |
| Q4 | Items with no price (`Pedestrian Logo White`, `Multigrip Signal Yellow`, `Clock Blue + Yellow Nos`, and 12 others) — obsolete, or priced but never filled in? | #5 `seed_from_workbook` |
| Q5 | Are counts always month-end, or ad hoc? Dublin's dates are irregular; Clonmel's are monthly. Affects how MoM is defined. | #12 |
