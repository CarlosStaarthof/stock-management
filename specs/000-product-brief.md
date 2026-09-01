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
- **Half the sheet is noise.** In Dublin's most recent count, roughly 42 of 82 rows are
  zero or blank. One-off items — a job's worth of `Swept Path Markers for Transdev`, say
  — arrive, get counted for a month or two, and then linger on the printed sheet forever
  because nothing ever removes them.
- **A count cannot be identified by its date.** The same stock take appears as
  `2025-09-01` on the Dublin sheet and `2025-08-31` on the Summary sheet. Two dates are
  outright wrong (`'Clonmel '!R1` is a year out; `Dublin!U1` is 16 months in the future),
  some fall on weekends, and whole months are skipped.

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

**In — the Dublin and Clonmel yard sheets, end to end:**

- Item master: description, supplier, type, unit, versioned price list, per-yard
  assignment and ordering.
- **Monthly stock counts** per yard, with a `DRAFT → SUBMITTED → APPROVED` lifecycle.
  A count belongs to the month it closes, not to the day it was walked — see
  `specs/001-domain-model.md § Part 4`.
- **Held-only reporting.** Every view and export shows what is actually on hand;
  showing the full list is an option, never the default.
- **Housekeeping.** Dormant items are flagged for one-click archive by a manager;
  nothing is auto-archived. Incomplete items appear on a worklist.
- Dashboard: totals by yard, MoM and YoY variance, breakdown by type and supplier.
- Excel export reproducing the yard and summary sheet layouts, plus a printable blank
  count sheet as a paper fallback.
- Accounts with the three roles above.

**Deferred — the Trucks & Yard module (M7):**

Per-truck boiler `% full`, per-truck bag counts, and yard bulk bags. The sheet's shape
is documented in `specs/001-domain-model.md § Part 1` so the work is ready to start,
but it is the last milestone. Whether truck material rolls into the yard total is
re-opened then.

**Out (explicitly):**

- Importing the 40 months of historical counts. The item master is seeded from the
  workbook; counting starts fresh from the next count. The old workbook stays as the
  archive.
- Purchase orders, goods-in, deliveries, job consumption.
- Stock movements between yards.
- **Nominal-ledger reconciliation.** The `Bal per nl` block on the Summary sheet is not
  a figure this team owns. It is out of scope and is not modelled.
- Barcode or RFID scanning.

## What success looks like

Six months in:

- No one prints a stock sheet in order to record a count.
- The month-end total is available the same day the count finishes, not days later.
- Changing a supplier price does not alter any historical figure.
- The accountant receives an `.xlsx` that opens with no `#REF!` in it.
- A month's stock report lists what is held, not 40 rows of items that ran out a year
  ago — and a one-off item that has gone can be archived in one click by the person who
  noticed.
- No one has to work out whether a count dated the 1st belongs to this month or the last.

## Constraints

- **Phone-first for counting.** Yards are outdoors; the counting screen is used
  one-handed, in the cold, on a small screen, with unreliable signal.
- **The vocabulary does not change.** Staff know these items by the exact strings in
  the workbook. Do not rename `MultiGrip X440 Admiralty Grey`.
- **Fractional quantities are real.** `21.6128` tonnes, `0.475` units. Never round.
- **Counting happens at the start of a month, or on the last business day of the month
  before.** Both close the same month.
- **Two-person team at most.** Operational simplicity beats architectural ambition.

## Related

- Domain model: `specs/001-domain-model.md`
- Glossary: `docs/domain-glossary.md`
- Source workbook: `Samples/Stock @ 01-Sep-2026.xlsx` (read only)
