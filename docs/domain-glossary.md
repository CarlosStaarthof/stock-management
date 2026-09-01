# Domain glossary

Vocabulary taken from the source workbook `Samples/Stock @ 01-Sep-2026.xlsx` and from
road-marking practice. When a term appears in the UI, use the spelling in this table.

## Places

| Term | Meaning |
|---|---|
| **Yard** | A physical depot holding stock. Two exist: **Dublin** and **Clonmel**. |
| **South** | How the `Summary` sheet labels the Clonmel yard. Same thing. |
| **Trucks** | Road-marking vehicles. Material sitting in a truck is still company stock and is counted separately from the yard. |

## Counting

| Term | Meaning |
|---|---|
| **Stock count** | A full stock-take of one yard, closing one month. In the workbook this is a `Qty \| Value` column pair; in the app it is a `StockCount` with one line per item. |
| **Period** | The month a count closes, as `(periodYear, periodMonth)`. A count taken on 1 October closes September. This — not the date — identifies a count, because the workbook records the same stock take as `2025-09-01` on one sheet and `2025-08-31` on another. |
| **Count date** | The day the yard was actually walked. A fact about the count, never a key. Should be a business day; a weekend or public holiday warns but is allowed. |
| **Complete period** | A period in which *every* active yard has an `APPROVED` count. Total Stock, MoM and YoY exist only for complete periods. |
| **Qty** | Quantity on hand, in the item's unit. Fractional — `21.6128` tonnes is a real recorded value. |
| **Not counted** | `quantity IS NULL` — nobody looked. Distinct from `0`, and blocks submission. The workbook cannot tell these apart; the app must. |
| **Held** | `quantity > 0` in a period. The default filter on every view and export. |
| **One-off** | An item held in exactly one period. Arrives for a job, then gone. `Swept Path Markers for Transdev` ran `580 → 65 → 0`. |
| **Dormant** | An item at `0` across the last three counted periods. Flagged for a manager to archive; never archived automatically. |
| **Value** | `Qty × unit price`. Always derived, never stored. |
| **MoM variance** | Month-on-month change in total stock value, joined on period. `Summary` row 7. |
| **YoY variance** | Change against `(periodYear − 1, periodMonth)`. `Summary` row 9 does this by counting twelve columns left, which breaks whenever a month is skipped. |
| **Movement (`m/ment`)** | Change in one yard's value between two counted periods. `Summary` rows 11–14. |
| **Bal per nl** | "Balance per nominal ledger" — the accounting figure the workbook reconciles against, in `Summary` rows 16–20. **Out of scope**: not a figure this team owns, and not modelled. Listed here only so the rows are recognisable in the old workbook. |

## Material types (the `Type` column)

| Code | Meaning |
|---|---|
| **Thermo-P** | Thermoplastic road-marking material, supplied in bags or extruded. |
| **A-S** | Anti-skid surfacing material. |
| **Cold A-S** | Cold-applied anti-skid (MMA-based kits). |
| **Beads** | Glass beads applied to markings for retro-reflectivity. |
| **C-E** | Cats-eyes and road studs, plus the bitumen grout that fixes them. |
| **MMA** | Methyl methacrylate cold-applied paints. |
| **M-Grip** | MultiGrip branded coloured surfacing paints. |
| **Vialine** | ViaLine branded line paints. |
| **Paint** | General road paints not in the two branded families above. |
| **Primer** | Surface primer applied before marking (concrete, tarmac). |
| **Sealer** | Joint and crack sealing material. |
| **Cleaner** | Solvent cleaners. |
| **Logo** / **Logo's** | Pre-formed thermoplastic symbols: bicycle, pedestrian, disabled, E-car, school. Counted in units. |
| **F&F** | Fixtures and fittings — bollards, ramp pieces, speed bumps. |
| **Ramps** | Wheel stops and ramp units. |
| **Aerosol** | Aerosol marking paint tins. |
| **Bauxite** | Calcined bauxite aggregate for anti-skid. |
| **Glue** | PU bond resin kits. |
| **Fuel** | Road diesel (white) and marked gas oil (green). |

## Suppliers

`Kestrel`, `Meon`, `Kelly` / `Kellys` / `Kelly's` (one supplier, three spellings in the
workbook — normalise on import), `Ennis Flint`, `Roadstuds`, `Roadcraft`, `Pittman`,
`Visever`, `M & E`, `Mid-West`.

## Trucks and boilers

> **Deferred to M7.** The Trucks & Yard module is out of v1 scope. These terms are
> recorded now so the vocabulary is settled when that milestone starts.

| Term | Meaning |
|---|---|
| **Boiler** | Heated vessel on a truck holding molten thermoplastic. |
| **% Full** | How full a boiler is, recorded as a fraction (`0.75` = three-quarters). |
| **Full hand-truck boiler** | 250 kg, equivalently 10 bags. *(Sheet note, row 5.)* |
| **Bag** | 25 kg for thermoplastic, 20 kg for beads. 40 bags = 1 tonne. *(Sheet note, row 45.)* |
| **Feeder T** | Truck role: feeder truck. |
| **Extruder** | Truck role: extrusion machine truck. |
| **Spare** | Truck held in reserve. |
| **ToD, KoD, LK, JB, KoS, PH, GS, MoG** | Driver initials used as the truck's role label in the workbook. |
| **Hi-Grade W / Y** | High-grade white / yellow thermoplastic held as yard bulk. |

## Units

The workbook's `Unit` column is inconsistent (`20kg`, `20 Kg`, `20 Kgs`, `1 Unit`,
`I Unit` — that is a capital i, not a one). The app normalises these into a
`unitLabel` (display string, preserved as written) and a `unitKind`
(`TONNE | KILOGRAM | LITRE | UNIT | LINEAR_METRE`). See `specs/001-domain-model.md`.

## Roles

| Role | Can |
|---|---|
| **COUNTER** | Create and edit draft counts, submit them. Yard staff. |
| **MANAGER** | Everything a counter can, plus approve counts, edit the item master and prices, export. |
| **ADMIN** | Everything, plus user management and reopening approved counts. |
