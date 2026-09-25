# 001 — Domain model

Derived by reading the XML parts of `Samples/Stock @ 01-Sep-2026.xlsx` directly.
This document is the reference the schema, the seed importer and the Excel exporter
are all checked against.

---

## Part 1 — What the workbook actually contains

### Sheets

| Sheet | Rows | Columns | Shape |
|---|---|---|---|
| `Summary` | 1–22 | A–AT | **44** month columns (`B1:AT1`), back to `2019-06-30`. `B1` is text; the other 43 are date serials |
| `Dublin` | 1–104 | A–AZ | Item master (rows 3–84) + **16 counts** + a truck/boiler block below the total row |
| `Clonmel ` | 1–76 | A–AI | Item master (rows 3–70) + **15 counts** + 2 fuel rows below the total row |
| `Clonmel Trucks & Yard` | 1–45 | A–M | Boilers, bags, yard bulk |

Note the trailing space in the sheet name `Clonmel `. The exporter must not
reproduce that typo.

> **These extents were wrong in an earlier draft of this document.** Dublin was
> recorded as columns A–V with 8 counts, because that is the range its
> `_FilterDatabase` defined name covers. The sheet is far wider. Anything checked
> against the old table — the seed importer, the exporter — would have been
> checked against half the data. This section is now generated directly from the
> workbook XML.

### Yard sheet layout (`Dublin`, `Clonmel `)

Row 1 holds the count date above each `Qty` column. Row 2 is the header:

```
A Description | B Supplier | C Type | D Unit | E Price | then repeating: Qty | Value
```

Each data row is one item. `Value = Qty × E`. The total row is `Dublin!86` /
`'Clonmel '!72`.

#### Dublin — 16 count columns

| Qty / Value | Row-1 header | Reads as | Total | Total formula |
|---|---|---|---|---|
| `G`/`H` | `45807` | 2025-05-30 | €61,251.44 | `SUBTOTAL(9,H3:H84)` |
| `I`/`J` | `45838` | 2025-06-30 | €64,096.02 | `SUBTOTAL(9,J3:J84)` |
| `K`/`L` | `45869` | 2025-07-31 | €53,982.67 | `SUBTOTAL(9,L3:L84)` |
| `M`/`N` | `45901` | 2025-09-01 | €53,147.73 | `SUBTOTAL(9,N3:N84)` |
| `O`/`P` | `45931` | 2025-10-01 | €60,895.28 | `SUBTOTAL(9,P3:P84)` |
| `Q`/`R` | `45961` | 2025-10-31 | `#REF!` | `SUBTOTAL(9,R3:R84)` |
| `S`/`T` | `45991` | 2025-11-30 | €45,421.09 | `SUBTOTAL(9,T3:T84)` |
| `U`/`V` | `46387` | 2026-12-31 | `#REF!` | `SUBTOTAL(9,V3:V84)` |
| `W`/`X` | `46053` | 2026-01-31 | €55,306.39 | `SUBTOTAL(9,X3:X84)` |
| `Y`/`Z` | `46081` | 2026-02-28 | €52,444.14 | `SUBTOTAL(9,Z3:Z84)` |
| `AA`/`AB` | `46112` | 2026-03-31 | €38,321.61 | `SUBTOTAL(9,AB3:AB84)` |
| `AC`/`AD` | `46142` | 2026-04-30 | €29,537.97 | `SUBTOTAL(9,AD3:AD84)` |
| `AE`/`AF` | `46173` | 2026-05-31 | €40,572.70 | `SUBTOTAL(9,AF3:AF84)` |
| `AG`/`AH` | `46203` | 2026-06-30 | €47,428.28 | `SUBTOTAL(9,AH3:AH84)` |
| `AI`/`AJ` | `46234` | 2026-07-31 | €44,929.63 | `SUBTOTAL(9,AJ3:AJ84)` |
| `AK`/`AL` | *(none)* | **no header** | €47,958.53 | `SUBTOTAL(9,AL3:AL84)` |

#### Clonmel — 15 count columns

| Qty / Value | Row-1 header | Reads as | Total | Total formula |
|---|---|---|---|---|
| `F`/`G` | `45838` | 2025-06-30 | €134,493.69 | `SUBTOTAL(9,G3:G64)` |
| `H`/`I` | *(none)* | **no header** | €136,038.72 | `SUBTOTAL(9,I3:I64)` |
| `J`/`K` | `45901` | 2025-09-01 | €125,692.62 | `SUBTOTAL(9,K3:K64)` |
| `L`/`M` | `45931` | 2025-10-01 | €114,756.22 | `SUM(M3:M71)` |
| `N`/`O` | `45962` | 2025-11-01 | €108,533.61 | `SUM(O3:O71)` |
| `P`/`Q` | `45992` | 2025-12-01 | €113,023.94 | `SUM(Q3:Q71)` |
| `R`/`S` | `45662` | 2025-01-05 | €89,279.12 | `SUM(S3:S71)` |
| `T`/`U` | `46056` | 2026-02-03 | €103,779.47 | `SUM(U3:U71)` |
| `V`/`W` | `46083` | 2026-03-02 | €99,853.51 | `SUM(W3:W71)` |
| `X`/`Y` | `46113` | 2026-04-01 | €111,075.10 | `SUM(Y3:Y71)` |
| `Z`/`AA` | `46143` | 2026-05-01 | €90,845.80 | `SUM(AA3:AA71)` |
| `AB`/`AC` | `46175` | 2026-06-02 | €106,376.57 | `SUM(AC3:AC71)` |
| `AD`/`AE` | `46203` | 2026-06-30 | €104,846.22 | `SUBTOTAL(9,AE3:AE71)` |
| `AF`/`AG` | `31st July ` | **text, not a date** | €84,956.58 | `SUM(AG3:AG71)` |
| `AH`/`AI` | `31st Aug` | **text, not a date** | €452,535.69 | `SUBTOTAL(9,AI3:AI71)` |

#### Dublin has its own trucks — `Dublin!AM87:AZ104`

Below the total row, undocumented until now, sits a boiler and bag block of the same
shape as the `Clonmel Trucks & Yard` sheet:

| Cells | Content |
|---|---|
| `AM88`, `AM89` | `Shed`, `Trucks` — pallet / bag / boiler split, totals in `AS`, `AW`, `AZ` |
| `AM92:AR92` | `Full Boiler  equates to ` · `200` · `or 10 Bags` |
| `AM94:AS96` | Trucks **`09D`**, **`10D`**, **`141D`** — White and Yellow percent-full and kg |
| `AM99:AS103` | Bags block, the same three trucks, 50 bags = 1,000 kg each |

**This answers Q6.** Dublin does hold material in its own trucks, and names three of
them. The Trucks & Yard module at M7 covers **both** yards, not Clonmel alone.

It also exposes a contradiction the app must not inherit: **Dublin says a full boiler is
200 kg** (`Dublin!AQ92`), while `Clonmel Trucks & Yard!A5` says **250 kg**. One of them
is wrong, or the two yards genuinely run different boilers. Q8, below.

### Known defects — to be fixed, not reproduced

| Cell | Defect |
|---|---|
| `Dublin!Q13`, `Dublin!U13` | `=+#REF!` — the referenced cell was deleted |
| `Dublin!R86`, `Dublin!V86` | Total row evaluates to `#REF!` |
| `Dublin!U1` | Header `2026-12-31`, sitting between `2025-11-30` and `2026-01-31`. The sequence says it should read **`2025-12-31`** — a year typo |
| `Dublin!AK1` | A 16th count pair with **no header at all**: 42 populated quantities and a real total of €47,958.53 that belongs to no month |
| `'Clonmel '!H1` | Same defect — an unheaded count pair totalling €136,038.72 |
| `'Clonmel '!R1` | Header `2025-01-05`, sitting between `2025-12-01` and `2026-02-03`. Should read **`2026-01-05`** |
| `'Clonmel '!AF1`, `!AH1` | Headers are **text** (`31st July `, `31st Aug`), not dates. They cannot sort, filter or subtract |
| `'Clonmel '!AH3:AH71` | Quantities roughly 10–15× plausible — `White Extrusion 80/20` reads **227.6875 tonnes** against 15.5 the month before. The column totals **€452,535.69**, four times any other. Consistent with kilograms typed into a tonnes column |
| `'Clonmel '!G72`, `!I72`, `!K72` | `SUBTOTAL(9, ·3:·64)` — stops **six rows short** of the item range, which runs to row 70. Harmless today because those cells are empty in those three columns; it will silently drop the first quantity anyone enters there |
| `'Clonmel '!72` | Three different formula styles in one total row: `SUBTOTAL(9,…3:64)`, `SUM(…3:71)` and `SUBTOTAL(9,…3:71)` |
| `Dublin!AH25`, `!AH51` | Two rows carry a **quantity and a price but no value cell** — `Motorcycle Logo` 9 × €45 and `MMA Paints - Blue` 1 × €81. **€486.00 counted and never valued**: the June 2026 total reads €47,428.28 where the quantities give €47,914.28. Impossible once value is derived rather than typed |
| `'Clonmel '!AA3:AA71` | All 62 populated cells are typed numbers rather than formulas; **8 have drifted** from `qty × price`, summing to **−€362.05**. `Beads` 1 t × €790 = €790 but the cell reads €900; `MultiGrip X440 Stong Blue` 28 × €121.30 = €3,396.40 but reads €3,220 |
| `Summary!AK3`, `Summary!AP4` | `#REF!` propagating into `Total Stock` |
| `Summary!B1` | Header `31-11-25` typed as **text** — a date that does not exist |
| `Summary!B5` | Adds `'Clonmel '!AE72` (2026-06-30) to `Dublin!T86` (2025-11-30) — two counts **seven months apart** — under that non-existent date |
| `Summary!B18` | `=+B12+1` — an unexplained `+1` |
| `Summary!K19`, `!L19`, `!R19` | Manual plugs of `-1`, `-1` and `1` |
| `Summary!C9`, `Summary!B9` | Year-on-year subtracts the column **11** months back, not 12 — `=C5-N5` compares Oct 2025 with Nov 2024. `D9` leftward are correct |
| `Summary` generally | Not maintained past **October 2025**, while both yard sheets are current to mid-2026 |

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
| `Kelly`, `Kellys`, `Kelly's` | `Kelly` |
| `Meon`, `Meon ` (trailing space) | `Meon` |
| `Visever`, `Visever ` | `Visever` |
| `Kestrel` | `Kestrel` |
| `Ennis Flint`, `Roadstuds`, `Roadcraft`, `Pittman`, `M & E`, `Mid-West` | as written |

**No leading-`t` variants exist.** An earlier draft of this document described `tMeon`,
`tKelly's` and `tBriteline` as supplier typos needing a strip rule. They are not in the
workbook. They were an artifact of the *reader*: five item descriptions on the Clonmel
sheet are stored as **rich text** - several `<r>` runs inside one `<si>` - and the
extraction script used at the time returned the element name instead of the text,
producing a spurious leading `t`. The real strings are:

| Cell | Actually reads |
|---|---|
| `'Clonmel '!A9` | `White - Briteline` |
| `'Clonmel '!A10` | `Yellow  - Briteline` |
| `'Clonmel '!A22` | `Stick On Studs - Meon` |
| `'Clonmel '!A23` | `Stick On Studs - Roadcraft  1st July` |
| `'Clonmel '!A24` | `Anti Skid Buff  - Kelly's` |

**Rule for the importer:** a shared string may contain multiple runs. Concatenate every
`<t>` descendant of the `<si>`; never read the first run alone. Column `B` never carries
a leading `t`, and no strip rule is needed.

One Dublin row has **no supplier at all** — `Dublin!A45` `School Logo Triangle` — which the `(description, supplierId)` key
must tolerate - those rows import with `needsReview = true` and a null supplier.

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
| `20kg`, `20 Kg`, `20Kg`, `20kgs`, `18KG`, `21 Kg`, `22 Kg`, `16kg`, `14kg`, `14 kgs`, `900 Kgs`, `900kg` | `KILOGRAM` | parsed number |
| `25L` | `LITRE` | — |
| `Ltrs` | `LITRE` | — |
| `1 Unit`, `I Unit`, `2 Unit`, `3 Unit`, `Unit`, `1` | `UNIT` | — |
| `lin.m` | `LINEAR_METRE` | — |
| empty | `UNIT` | — |

`I Unit` is a capital i, not the digit one. Both map to `UNIT`.

### Items

**How many items there are, and why.** 82 populated descriptions on Dublin
(`A3:A84`) and 68 on Clonmel (`A3:A70`) = **150 item rows**. (`'Clonmel '!A71` is the
string `TOTAL`, not an item.) Two more sit *below* Clonmel's total row —
`'Clonmel '!A75` `Road Diesel - White` and `A76` `Marked Gas Oil - Green` — outside
`SUBTOTAL(9, AE3:AE71)`, so the workbook has never counted them in its stock total. They
are real stock; they are imported and flagged, not silently added to a total that has
never included them.

- An item is identified by `(description, supplierId)` after trimming whitespace.
- Descriptions carry trailing spaces in the source (`White Extrusion 80/20 `) — trim.
- The same description can appear on both yard sheets with a different price
  (`Red - KestrelFlex - Anti-Skid` is 885 in both; `Bicycle Logo's 1200mm` appears
  under both `Kestrel` and `Kellys` — those are two distinct items).
- Rows missing a supplier, a unit or a price - **13 exactly**: `Dublin!A9`, `A12`,
  `A18`, `A29` (`Pedestrian Logo White`), `A44`, `A45`, `A46`, `A47`, `A48`, `A62`
  (`Multigrip Signal Yellow`), `A63`, `A78`, and `'Clonmel '!A54`. (`Dublin!A43`
  `Clock Blue + Yellow Nos` was cited in an earlier draft and is **not** one of them -
  `D43` is `1 Unit` and `E43` is `350`.) are imported as items with `active: true`, `needsReview: true` and **no**
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
enum Role        { YARD_STAFF ADMIN }
enum CountStatus { DRAFT SUBMITTED APPROVED }
enum UnitKind    { TONNE KILOGRAM LITRE UNIT LINEAR_METRE }
enum ProfileStatus { PENDING ACTIVE REJECTED DEACTIVATED }                # 021
enum AuthEventKind { PIN_FAILURE PROFILE_REQUEST SETUP_FAILURE BUDGET_RESET } # 021

User            id  username?(unique)  requestedUsername?  name  role
                status  pinHash?  pinKeyId?  sessionEpoch  createdAt  updatedAt
                @@index([status])            # 021: username + PIN, never an email

AccountLock     accountKey(id)  consecutiveFailures  level  lockedUntil?  updatedAt  # 021

AuthEvent       id  kind  bucket  accountKey?  at                               # 021
                @@index([bucket, kind, at])  @@index([accountKey, at])

SetupClaim      id Int(id)  userId(unique)  claimedAt    # 021; CHECK id = 1
                user -> User  onDelete: Restrict

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

ItemPrice       id  itemId  unitPrice Decimal(18,8)  currency("EUR")   # see Invariant 10
                effectiveFrom  label?  createdAt
                @@unique([itemId, effectiveFrom])

ItemLocation    id  itemId  locationId  sortOrder  active
                @@unique([itemId, locationId])

StockCount      id  locationId
                periodYear Int   periodMonth Int   # the month this count CLOSES
                countDate  Date                    # the day the yard was walked
                status  createdById  submittedAt?
                approvedById?  approvedAt?  notes?
                signedById?  signedAt?  signatureSvg?   # see Invariant 11
                @@unique([locationId, periodYear, periodMonth])

StockCountLine  id  stockCountId  itemId
                quantity Decimal(12,4)?   # NULL = not counted; 0 = counted, none held
                unitPriceSnapshot Decimal(18,8)?
                note?
                @@unique([stockCountId, itemId])
```

**Feature #21 `pin_auth` reshaped `User` and added the rest marked `# 021`**, on the owner's
decisions D1–D12 (`specs/features/021-pin_auth.md`): people sign in with a username and a
PIN, `email`, `passwordHash` and `active` are gone, and `status` says which of four states a
profile is in. No column stores a PIN: `pinHash` is bcrypt over a digest keyed by a secret the
database does not hold. `AccountLock`, `AuthEvent` and `SetupClaim` hold the per-account lock,
the budget bookkeeping and the first-run setup guard, and none of them holds a PIN, a code, a
typed username or a user id beyond `SetupClaim.userId`.

**Deferred to M7** — `Vehicle`, `BoilerReading`, `BagReading`, `YardBulkReading`, and
the `BoilerMaterial` / `BagMaterial` enums. The Trucks & Yard sheet is out of v1 scope;
its shape is documented in Part 1 so the model is ready when M7 starts.

### Invariants

1. **`value` is never a column.** It is `quantity × unitPriceSnapshot`, computed on read.
2. **`unitPriceSnapshot` is null while `DRAFT`.** It is written once, at `SUBMITTED`,
   from the `ItemPrice` effective on `countDate`. It is never rewritten.
3. **An `APPROVED` count is immutable.** Only an `ADMIN` may reopen it, and doing so is
   audited. Reopening **clears the signature** — see Invariant 11.
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
10. **Money is `Decimal(18,8)`, not `Decimal(12,4)`.** Four Clonmel prices are stored in
   the workbook as *formulas* — `=5.2/0.85`, `=2.45/0.85`, `=5.89/0.85`, `=1.4/0.9` — and
   do not terminate in decimal. At 4 places, `Road Studs 301 Type` alone is 2.7c out on a
   quantity of 2,285, and the June 2026 count lands **1.4c** away from the workbook. A
   stock system that disagrees with the file it replaced, by any amount, will not be
   trusted.
11. **A count cannot be `SUBMITTED` without a signature.** `signatureSvg` holds SVG path
   data, not a raster: a few hundred bytes, and it scales onto the Excel export and a
   printed sheet without going fuzzy. The signature is part of the immutable record — a
   signature that survives an edit is worthless, so reopening clears it and demands a
   fresh one.
12. **`YARD_STAFF` is never sent a monetary value.** Not hidden — not sent. See Part 6.

### Derived queries (no storage)

| Report | Definition |
|---|---|
| Line value | `quantity × unitPriceSnapshot` |
| Yard total | `Σ` line values for that yard's `APPROVED` count in the period |
| Total stock | `Σ` yard totals — **only for complete periods** |
| MoM variance | `total(y, m) − total(y, m − 1)` — the **immediately preceding** month, never "the last one that happens to be complete"; refuses when either period is incomplete |
| YoY variance | `total(y, m) − total(y − 1, m)` |
| Movement | Per-yard difference between consecutive counted periods |
| Held | `quantity > 0` |
| Dormant | `quantity = 0` across the last 3 counted periods |
| One-off | held in exactly one period |

**Why MoM names a fixed offset.** This row read `total(previous complete period)` until
2026-09-14. Read literally, an uncounted July made August's *month on month* a June-to-August
movement — two months of change labelled as one — which is the same defect as `Summary!C9`'s
eleven-month "year on year" that Part 4 condemns in terms (*never "twelve columns to the
left"… which breaks the moment a month is skipped*). The two sentences could not both stand.
Found by #11's spec-writer, which followed Part 4; **011 AC-11 refuses rather than reaching**,
and this row now says so. *Movement* below is the same species and is deliberately left as it
is, to be settled by the feature that implements it rather than by a passing edit here.


---

## Part 4 — Periods, and why a count is not a date

### The evidence

The full count-date series for both yards is in Part 1. What matters here:

**Dublin** runs `2025-05-30` → `2026-07-31` across 15 dated columns, plus one with no
header at all (`AK`). **Clonmel** runs `2025-06-30` → `2026-06-30` across 12 dated
columns, plus one unheaded (`H`) and two headed with the *text* `31st July ` and
`31st Aug`. **Summary** uses strict calendar month-ends — `2025-10-31`, `09-30`,
`08-31`, … — and stops at October 2025.

Five facts fall out, and together they are the whole argument for the period model:

1. **The Dublin count dated `2025-09-01` is the Summary column headed `2025-08-31`.**
   One stock take, two different dates on two sheets.
2. **Two dates are a year out.** `'Clonmel '!R1` reads `2025-01-05` but sits between
   `2025-12-01` and `2026-02-03`. `Dublin!U1` reads `2026-12-31` but sits between
   `2025-11-30` and `2026-01-31`. Both are off by exactly one year.
3. **Four columns cannot be dated at all** — two with no header (`Dublin!AK1`,
   `'Clonmel '!H1`) and two whose header is prose (`'Clonmel '!AF1`, `!AH1`). Together
   they hold over €270,000 of counted stock that belongs to no month.
4. **Counts fall on weekends** — `2025-11-01 Sat`, `2025-11-30 Sun` — which is ordinary
   practice, and the reason there is no business-day rule.
5. **Months get skipped.** Clonmel jumps `2025-06-30` → `2025-09-01`, so July and August
   2025 have no dated Clonmel count.

A count therefore cannot be keyed by its date. Nine of this workbook's 31 count columns
have a date that is missing, mistyped, or not a date at all.

### The rule

A stock take is done at the **start of a month**, or at the **end of the month before**.
Both close the same month. Therefore:

- `(periodYear, periodMonth)` identifies the count. This is what MoM and YoY join on.
- `countDate` records when the yard was actually walked. It is a fact, not a key.

**Period defaulting.** From `countDate`: if `day <= 5` the period is the *previous*
month, otherwise it is `countDate`'s own month. The derived period is shown to the user
on the create screen and can be overridden.

| `countDate` | Default period |
|---|---|
| `2026-09-30` | 2026-09 |
| `2026-10-01` | 2026-09 |
| `2026-10-05` | 2026-09 |
| `2026-10-06` | 2026-10 |

**No business-day rule.** An earlier draft warned when a `countDate` fell on a weekend or
a public holiday. Dropped at the user's request: the warning was noise, the workbook shows
counts on Saturdays and Sundays as normal practice, and the app has no business telling a
yard when it may count. The date is recorded as given.

**YoY** is `(periodYear − 1, periodMonth)` — never "twelve columns to the left", which
is what the Summary sheet does today and which breaks the moment a month is skipped.

---

## Part 5 — Held, one-off and dormant items

### The problem

Items appear on stock for a month and are gone the next. From the Dublin sheet:

| Item | Quantities across the 16 counts, `G` → `AK` |
|---|---|
| `Swept Path Markers for Transdev` | `–` · `–` · `–` · `–` · `580` · `580` · `65` · `–` · `65` · `–` · `–` · `–` · `–` · `–` · `–` · `–` |
| `EV ONLY text for Epower` | `0` · `–` · `0` · `0` · `60` · `–` · `105` · `0` · `24` · `32` · `24` · `–` · `18` · `18` · `18` · `–` |
| `Disabled Logo on Purple B'ground` | `–` · `–` · `–` · `–` · `–` · `1` · `1` · `1` · `1` · `1` · `1` · `–` · `–` · `–` · `–` · `–` |
| `Pre-form for Lucan ETNS` | `0` · `–` · `0` · `1` · `1` · `1` · `0` · `–` · `1` · `–` · `–` · `–` · `–` · `–` · `–` · `–` |

**In Dublin's November 2025 count (column `S`), 27 of 82 rows are zero or never counted** — 18 blank and 9 explicit zeros. A third of the printed sheet is asking about
stock that is not there. The most recent count, `AI` (2026-07-31), gives **35 of 82** —
the argument holds right across the series.

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

Dormant items surface on a housekeeping screen where an `ADMIN` archives them in one
click. **Nothing is auto-archived.** Archiving sets `Item.active = false`: it disappears
from entry sheets, and every historical line referencing it is untouched.

The same screen lists **incomplete items** — `needsReview = true`, missing `unitLabel`,
or no `ItemPrice`.

---

## Part 6 — Roles, and the money boundary

Two roles. `YARD_STAFF` counts; `ADMIN` approves and sees money.

| | `YARD_STAFF` | `ADMIN` |
|---|---|---|
| Lands on | **Stock Entry** | **Stock Takes** |
| Calendar and stock-take history | ✅ | ✅ |
| View an approved count — item, quantity, unit | ✅ | ✅ |
| Create and edit a `DRAFT` count | ✅ | ✅ |
| Submit a count | ✅ | ✅ |
| **Approve** a count | ❌ | ✅ |
| Edit or reopen an `APPROVED` count | ❌ | ✅ (audited) |
| Item master, prices, per-yard assignment | ❌ | ✅ |
| **Any monetary figure at all** | ❌ | ✅ |
| Analysis — totals, MoM, YoY, breakdowns | ❌ | ✅ |
| Excel export | ❌ | ✅ |
| Housekeeping, user management | ❌ | ✅ |

The person who typed the number is not the person who signs it off. That is the whole
value of `SUBMITTED → APPROVED`, and it is why `YARD_STAFF` submits but never approves.

### The money boundary is a server rule, not a styling rule

**Hiding a price in CSS does not hide it.** It stays in the network response, in the page
source, and in any screenshot of dev tools. So:

- `src/server/counts/` exposes **two shapes**:

  ```
  CountForStaff  { item, quantity, unit, note }
  CountForAdmin  { …CountForStaff, unitPriceSnapshot, lineValue, totals }
  ```

- The shape is chosen from the **session role**. Never from a query parameter, a header,
  or anything else the client can set.
- Money never enters a `YARD_STAFF` response, so no component can leak it, and no future
  change to a component can start leaking it.

**Test that proves it, not a UI assertion:** walk the entire JSON response for a
`YARD_STAFF` session and fail if any key matching `/price|value|total|amount/i` exists at
any depth. See `docs/verification.md`.

### Stock Takes is money-free for *both* roles

Every euro figure lives in Analysis. Stock Takes shows the calendar, which yards were
counted, and item / quantity / unit. One version of the screen, not two — a screen that
renders differently per role is a screen whose every future change must be checked twice.

---

## Answered questions

Resolved with the user on 2026-09-01. Recorded here so later sessions do not re-open them.

| # | Question | Answer |
|---|---|---|
| Q1 | Does Dublin have its own trucks, or is Trucks & Yard Clonmel-only? | **Deferred.** Focus on the Dublin and Clonmel yard sheets. Trucks & Yard moves to M7 and is re-opened there. |
| Q2 | Does truck and yard-bulk material roll into the yard total? | **Deferred to M7** with Q1. |
| Q3 | Is `Bal per nl` reconciliation still performed? | **Dropped from scope.** Not a figure this team owns. Removed from the product brief and the glossary. |
| Q4 | Items with no price — obsolete, or never filled in? | **Import them, flag them.** `description` becomes mandatory going forward; items missing description, unit or price are imported with `needsReview = true` and appear on the housekeeping worklist. Their lines contribute `0` with a visible warning. |
| Q5 | Are counts month-end or ad hoc? | **Start of the month, or the end of the month before.** This is the origin of the period model in Part 4. Whether the first or the last day prevails is still to be settled with management; the period model absorbs either. |

### Still open — M7 only

Nothing scheduled before M7 is blocked by these.

| # | Question | Blocks |
|---|---|---|
| Q6 | ~~Does Dublin have its own trucks?~~ **Answered by the workbook**: `Dublin!AM94:AS96` names trucks `09D`, `10D`, `141D` with boiler and bag readings. M7 covers both yards. | *(closed)* |
| Q8 | A full boiler is **200 kg** on `Dublin!AQ92` and **250 kg** on `Clonmel Trucks & Yard!A5`. Different boilers, or is one wrong? | #17 `trucks_schema_seed` |
| Q7 | Do truck and yard-bulk materials roll **into** the yard count total, or stay a separate figure? If they roll in, #11 `analysis` and #12 `export_workbook` change too. | #18 `trucks_entry_ui` |
