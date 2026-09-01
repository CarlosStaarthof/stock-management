# 000 — Product brief

## The problem

Macroads tracks yard stock in a single Excel workbook,
`Samples/Stock @ 01-Sep-2026.xlsx`. The current process is:

1. Print the yard sheet.
2. Walk the yard and fill in quantities by hand.
3. Re-key those quantities into Excel back at the office.
4. Excel multiplies each quantity by a price and sums a total.
5. The total is copied into a `Summary` sheet to produce month-on-month and
   year-on-year variance.

This fails in four concrete ways:

- **The file grows sideways.** Every count adds a new `Qty | Value` column pair.
  Dublin is at 8 counts (columns G–V), Clonmel at 12 (columns F–AE). There is no
  natural end to this.
- **It is already broken.** Live `#REF!` errors sit in `Dublin!H13`, `Dublin!R86`
  (the TOTAL row), `Summary!AK3` and `Summary!AP4`. Those errors propagate into
  totals that people rely on.
- **History is not safe.** The `Value` columns reference the single price column `E`.
  Editing a price silently rewrites the value of every historical count.
- **Double entry.** Data is written twice — once on paper, once into Excel — with a
  re-keying error at every step.

## The product

A web app where:

- Yard staff enter counts directly on a phone, in the yard, item by item.
- Managers approve a count, which freezes its prices permanently.
- A dashboard shows what the `Summary` sheet shows today — total stock by yard, MoM
  and YoY variance — computed live rather than maintained by hand.
- Excel becomes an **export** for further detailing and for the accountants, generated
  on demand from the database.

Excel stops being the system of record. It becomes a report.

## Users

| Role | Who | Primary need |
|---|---|---|
| **COUNTER** | Yard staff | Enter a count quickly on a phone, without losing work when signal drops. |
| **MANAGER** | Yard / operations manager | Approve counts, keep the item master and price list current, read the dashboard, export Excel. |
| **ADMIN** | Owner / office | Everything, plus users and reopening a mistakenly approved count. |

## Scope of v1

**In:**

- Item master: description, supplier, type, unit, versioned price list, per-yard
  assignment and ordering.
- Stock counts per yard, with `DRAFT → SUBMITTED → APPROVED` lifecycle.
- Trucks & Yard module: per-truck boiler `% full` and bag counts, plus yard bulk bags.
- Dashboard: totals by yard, MoM and YoY variance, breakdown by type and supplier.
- Excel export reproducing the current sheet layouts, plus a printable blank count
  sheet as a paper fallback.
- Accounts with the three roles above.

**Out (explicitly, for now):**

- Importing the 40 months of historical counts. The item master is seeded from the
  workbook; counting starts fresh from the next count. The old workbook stays as the
  archive.
- Purchase orders, goods-in, deliveries, job consumption.
- Stock movements between yards.
- Integration with the nominal ledger. `Bal per nl` reconciliation stays manual.
- Barcode or RFID scanning.

## What success looks like

Six months in:

- No one prints a stock sheet in order to record a count.
- The month-end total is available the same day the count finishes, not days later.
- Changing a supplier price does not alter any historical figure.
- The accountant receives an `.xlsx` that opens with no `#REF!` in it.

## Constraints

- **Phone-first for counting.** Yards are outdoors; the counting screen is used
  one-handed, in the cold, on a small screen, with unreliable signal.
- **The vocabulary does not change.** Staff know these items by the exact strings in
  the workbook. Do not rename `MultiGrip X440 Admiralty Grey`.
- **Fractional quantities are real.** `21.6128` tonnes, `0.475` units. Never round.
- **Two-person team at most.** Operational simplicity beats architectural ambition.

## Related

- Domain model: `specs/001-domain-model.md`
- Glossary: `docs/domain-glossary.md`
- Source workbook: `Samples/Stock @ 01-Sep-2026.xlsx` (read only)
