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
  Dublin is at **16 counts**, out to column `AL`; Clonmel at **15**, out to `AI`. There
  is no natural end to this, and the sheet is already wider than its own filter range —
  which is how an earlier reading of it missed half the history.
- **It is already broken.** Live `#REF!` errors sit in `Dublin!Q13`, `Dublin!U13`,
  `Dublin!R86` and `Dublin!V86` (both TOTAL cells), `Summary!AK3` and `Summary!AP4`.
  Those errors propagate into totals that people rely on. One Clonmel column reads
  €452,535 — four times any other — from quantities that look like kilograms typed into
  a tonnes column.
- **History is not safe.** The `Value` columns reference the single price column `E`.
  Editing a price silently rewrites the value of every historical count.
- **Double entry.** Data is written twice — once on paper, once into Excel — with a
  re-keying error at every step.
- **A third of the sheet is noise.** In Dublin's November 2025 count (column `S`), 27 of
  82 rows are zero or never counted; in the most recent count (`AI`, 2026-07-31), 35 of 82. One-off items — a job's worth of `Swept Path Markers for Transdev`, say
  — arrive, get counted for a month or two, and then linger on the printed sheet forever
  because nothing ever removes them.
- **A count cannot be identified by its date.** The same stock take appears as
  `2025-09-01` on the Dublin sheet and `2025-08-31` on the Summary sheet. Two dates are
  a year out (`'Clonmel '!R1`, `Dublin!U1`), four more columns have no usable date at
  all, and whole months are skipped.

## The product

A web app where:

- Yard staff enter counts directly on a phone, in the yard, item by item.
- An admin approves a count, which freezes its prices permanently.
- A dashboard shows what the `Summary` sheet shows today — total stock by yard, MoM
  and YoY variance — computed live rather than maintained by hand.
- Excel becomes an **export** for further detailing and for the accountants, generated
  on demand from the database.

Excel stops being the system of record. It becomes a report.

## Users

| Role | Who | Lands on | Primary need |
|---|---|---|---|
| **YARD_STAFF** | Yard staff | **Stock Entry** | Enter a count quickly on a phone, without losing work when signal drops. Sees no monetary figure anywhere. |
| **ADMIN** | Owner / office / manager | **Stock Takes** | Approve counts, keep the item master and prices current, read Analysis, export Excel, manage users. |

Two roles, not three. The person who counts is not the person who signs off — that is the
point of the `SUBMITTED → APPROVED` step.

## Scope of v1

**In — the Dublin and Clonmel yard sheets, end to end:**

- Item master: description, supplier, type, unit, versioned price list, per-yard
  assignment and ordering.
- **Monthly stock counts** per yard, with a `DRAFT → SUBMITTED → APPROVED` lifecycle.
  A count belongs to the month it closes, not to the day it was walked — see
  `specs/domain-model.md § Part 4`.
- **Held-only reporting.** Every view and export shows what is actually on hand;
  showing the full list is an option, never the default.
- **Housekeeping.** Dormant items are flagged for one-click archive by a manager;
  nothing is auto-archived. Incomplete items appear on a worklist.
- **Analysis** (admin only): totals by yard, MoM and YoY variance, breakdown by type and
  supplier. Every monetary figure in the product lives here.
- **Excel export** of the full workbook — Summary, Dublin and Clonmel — matching the
  sample's shape but generated clean, so no `#REF!`, no drifted hardcoded cells and no
  off-by-one YoY can occur. Plus a printable blank count sheet as a paper fallback.
- Accounts with the two roles above.
- **A signature.** A count is signed on the phone before it is submitted, and the
  signature travels onto the Excel export. The paper sheet was signed; the workbook lost
  that, and this puts it back.

**Deferred — the Trucks & Yard module (M7):**

Per-truck boiler `% full`, per-truck bag counts, and yard bulk bags. The sheet's shape
is documented in `specs/domain-model.md § Part 1` so the work is ready to start,
but it is the last milestone. Whether truck material rolls into the yard total is
re-opened then.

**Out (explicitly):**

- Importing the 44 months of historical counts. The item master is seeded from the
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
- **Counting happens at the start of a month, or at the end of the month before.** Both
  close the same month. There is no business-day rule: the workbook shows counts on
  Saturdays and Sundays, and the app does not tell a yard when it may count.
- **Two-person team at most.** Operational simplicity beats architectural ambition.
- **Yard staff must never see a price.** This is a hard constraint on the API, not a
  preference about screens. A stock system where the yard can read supplier pricing is a
  different product.

## Hosting

Vercel Pro (~$20/month) with Neon Postgres — a `dev` branch for development and `main`
for production. Vercel's free Hobby tier prohibits commercial use, which this is.
Deployment happens **early**, once counting works, rather than at the end: the tool is
tested on real phones in the real yard months before Excel export exists.

## Related

- Domain model: `specs/domain-model.md`
- Glossary: `docs/domain-glossary.md`
- Source workbook: `Samples/Stock @ 01-Sep-2026.xlsx` (read only)
