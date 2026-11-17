# 024 — Open items and one-step sign-off

**Feature id:** 24   **Status:** draft   **Depends on:** #9, #12, #22, #23

## Purpose

A yard count sometimes meets stock that is not in the item master: a job's worth of
something that arrived this month, or a one-off that will never be stocked again. Today the
only ways to record it are the two #5/#8 paths that *create master data* — search the master
and assign an item, or create a new item inline. Both make a permanent item for a temporary
fact. This feature adds a third, smaller thing: an **open item** that belongs to one count,
carries no master identity, and disappears from the master's point of view when the count is
closed.

The same feature closes a second gap. Today a counter signs a draft (`DRAFT → SUBMITTED`)
and an `ADMIN` approves it later (`SUBMITTED → APPROVED`); the person who counted cannot
finish the record, and the counter never sees the value of what they counted. The owner now
wants one review step: the counter sees every counted item, the open items and the total,
prices each open item, and signs the count off directly to `APPROVED`. There is no second
approver.

## Owner's decisions

- **D1 — Open items are not master items.** A new `StockCountOpenItem` row belongs to one
  `StockCount` and to nothing else. It has no `Item`, `ItemLocation` or `ItemPrice` row, and
  no master query ever sees it. Tradeoff: an open item is not available to the next count;
  if the same thing comes back, it is added again or promoted to the master deliberately.
- **D2 — Both roles may add, price and remove while DRAFT.** This follows #8, where any
  signed-in profile may edit any `DRAFT`. Tradeoff: there is still no per-person lock on a
  draft; the session is the actor and the audit names it.
- **D3 — One step, one approver.** Sign-off moves `DRAFT → APPROVED` directly and records who
  signed and when. The signer is the approver; `approvedById`/`approvedAt` hold the same
  person and instant as `signedById`/`signedAt`. Tradeoff: `signedAndApprovedBySamePerson`
  is true by construction for every count this feature signs.
- **D4 — The drawn signature stays.** "Sign-off" is still the existing signature pad and the
  existing SVG path data; it is not a typed name and not a second identity mechanism.
  Tradeoff: the review step keeps the pad #9 built.
- **D5 — The review shows money to the counter.** The counter sees the count's total and the
  open-item prices they must enter. This is a deliberate, scoped amendment to
  `specs/domain-model.md` Part 6 and #22 D5: **only the review/sign-off step** gains money
  for `YARD_STAFF`; every other staff surface stays money-free. *Flagged as Q1.*
- **D6 — Open items are priced on review, not while counting.** Adding one stores
  `unitPrice = null`; the add form has no price field. The only writer of an open item's
  price is the review action. Tradeoff: a count's open-item values are unknowable until the
  review, which is exactly when the owner wants the total.
- **D7 — The existing approve step is removed for new counts.** No new count reaches
  `SUBMITTED`. Rows that were already `SUBMITTED` before the migration may still be approved
  once by an `ADMIN`, so no historical row is stranded. Tradeoff: a legacy path remains in
  the code; it is not reachable from any new count.
- **D8 — Reopen is unchanged.** An `ADMIN` may reopen a signed-off count with a reason; that
  clears the signature and the approval and returns it to `DRAFT`. Open items and their
  prices survive and are editable again, because the count is a draft again. Tradeoff:
  "read-only after sign-off" is true until an audited reopen.
- **D9 — The export keeps the sheet's shape.** Open items are appended as rows after the
  master rows, in the same columns: description, unit, price, quantity, value. The optional
  job reference and note are shown on the count and review screens but are not added as new
  export columns. *Flagged as Q4.*
- **D10 — Values are derived, never stored.** Every open-item value is
  `quantity × unitPrice`, and every count total is the sum of the exact line values plus the
  exact open-item values. The existing decimal-string helpers are used; no `number` is used
  for money.

## User stories

- As a counter, while a count is a draft I can add a one-off item with a description, unit,
  quantity and an optional job reference or note, and I do not have to create a master item
  for it.
- As a counter, I can remove an open item I added by mistake while the count is still a
  draft.
- As a counter, when I have finished counting I see every counted item, every open item and
  the count's total on one review screen.
- As a counter, I enter a unit price for each open item on that review screen.
- As a counter, I cannot sign off until every open item has a price and every counted item
  has a quantity.
- As a counter, my signature signs the count off and locks it in one step; nobody has to
  approve it afterwards.
- As an `ADMIN`, I can see the open items in the count, its value in the export and its value
  in the records list, and I can still reopen a signed-off count with a reason.

## Data touched

`prisma/schema.prisma` gains one model and one relation:

```prisma
model StockCountOpenItem {
  id           String   @id @default(cuid())
  stockCountId String
  description  String
  unitLabel    String
  quantity     Decimal  @db.Decimal(12, 4)
  jobReference String?
  note         String?
  unitPrice    Decimal? @db.Decimal(18, 8)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  stockCount StockCount @relation(fields: [stockCountId], references: [id], onDelete: Cascade)

  @@index([stockCountId])
}
```

`StockCount` gains `openItems StockCountOpenItem[]`. The open item has **no** `itemId`, no
`ItemLocation`, no `ItemPrice` and no relation to `Item`. `unitPrice` is null until the
review. A migration creates the table; `TRUNCATED_TABLES` gains `StockCountOpenItem` and the
closure test stays green.

**Read and written by this feature:** `StockCountOpenItem`, `StockCount`,
`StockCountLine`, `ItemPrice` (for the existing line snapshots), and — for the records and
export totals — `Location`. **Never written:** `Item`, `ItemLocation`, `ItemPrice` by an
open-item path.

`specs/domain-model.md` must be amended on approval: Part 3 gains the model, Part 6 gains the
review-only money exception, and Invariant 2's "snapshot at submit" wording becomes "snapshot
at sign-off" for new counts.

## Contract

**Inputs** (`src/server/counts/open-item-input.ts`, pure)

| Function | Rules |
|---|---|
| `parseOpenItemInput(raw)` | `description` trimmed, 1–200 characters, required; `unitLabel` trimmed, 1–40, required; `quantity` parsed by the existing quantity parser and required (empty is not "not counted"); `jobReference` trimmed or null, at most 80; `note` trimmed or null, at most 500. A supplied `unitPrice` is ignored, never written. |
| `parseOpenItemPrice(raw)` | `unitPrice` required, decimal string matching `Decimal(18, 8)`: at most 10 digits before the point, at most 8 after, non-negative. Empty, a negative number and an exponent are refused with a typed `ValidationError`. |

**Services**

`src/server/counts/open-item-service.ts`

| Export | Behaviour |
|---|---|
| `listOpenItems(actor, countId)` | Any signed-in actor. Open items in the order they were added, with description, unit, quantity, job reference, note and — for the review and admin surfaces — the price and derived value. |
| `addOpenItem(actor, countId, raw)` | Any signed-in actor; count must be `DRAFT`; parses the input; creates one `StockCountOpenItem` with `unitPrice: null`; writes no `Item` row. |
| `removeOpenItem(actor, countId, openItemId)` | Any signed-in actor; count and item must exist and the count must be `DRAFT`; deletes exactly that row. |
| `setOpenItemPrices(actor, countId, prices)` | Any signed-in actor; count must be `DRAFT`; writes each open item's `unitPrice`; refuses an unknown id or a missing price for any open item. Used by the sign-off transaction. |

`src/server/counts/count-lifecycle-service.ts`

| Export | Behaviour |
|---|---|
| `signOffCount(actor, countId, { signaturePath, openItemPrices })` | Any signed-in actor. The count must exist and be `DRAFT`; the signature must parse; every line must be counted; every open item must have a price in the request. In one transaction: writes the line snapshots, writes the open-item prices, and compare-and-sets `DRAFT → APPROVED` with `submittedAt`, `signedById`, `signedAt`, `signatureSvg`, `approvedById` and `approvedAt` (signer and instant for both), and one `APPROVED` audit line. No `SUBMITTED` status is written. |
| `submitCount` | Removed from the new flow; no route or action calls it. |
| `approveCount` | Retained only for a row that was already `SUBMITTED` at migration time; it refuses a `DRAFT` that is waiting to be signed off. |

`src/server/counts/count-summary-service.ts` gains the review shape:
`ReviewForSignOff = { countId, locationName, periodLabel, countDate, status, totalValue,
lines, openItems, uncounted, lifecycle }`, where `lines` is **every** counted item (not only
the uncounted list) and `openItems` carries the price input's current value or null.
`totalValue` is the exact sum of all line values and all priced open-item values; an unpriced
open item contributes zero and is named in a warning and in the sign-off refusal.

**Routes and actions**

| Route | Access | Behaviour |
|---|---|---|
| `/stock-entry/counts/[id]` | both roles | Adds an Open items section while `DRAFT`: the add form and a remove control per row. After sign-off the section is read-only. No price or value on this page. |
| `/stock-entry/counts/[id]/submit` | both roles | The review and sign-off screen. Its URL is unchanged; its heading and content become the review summary. It shows the total, every counted item, every open item with a price input, the uncounted list, the signature pad, and the sign-off control. |
| `/stock-entry/counts/[id]/summary` | `ADMIN` or above | The valued summary, now including open-item rows and a total that includes them. No approve control for a count created by this flow. |
| `POST` server actions | both roles | Add, remove and sign off; each action reads the actor from the session and hands it to the service. |
| `/analysis/export` | `ADMIN` or above | The workbook includes open-item rows. |

## UI states

- **Count detail, DRAFT, no open items:** an Open items section with the add form and an
  empty sentence.
- **Count detail, DRAFT, with open items:** each row shows description, unit, quantity and
  the optional job reference/note, and a remove control. No price.
- **Count detail, signed off:** the open items are listed read-only, with no add or remove
  control. The count is read-only as #9 already makes it.
- **Review, ordinary:** total value, every counted item, open items with price inputs, the
  uncounted list if any, and the signature pad.
- **Review, an open item has no price:** the sign-off is still offered (like #9's signature
  control, it is not greyed out), and pressing it returns a sentence naming how many open
  items need a price.
- **Review, every line counted and every open item priced:** the signature pad and the
  sign-off control are usable; the signed-off response shows the record and no form.
- **Summary:** open-item rows appear among the valued lines; the total includes them; no
  approve button for a count that this flow signed.
- **Export:** open-item rows follow the master rows; the total row includes them; no error
  cell.
- **Records:** the total shown for the stock take includes open-item values.

## Acceptance criteria

**AC-1 — The schema adds one count-local model and no master link.** `StockCountOpenItem`
has exactly the fields above; `stockCountId` is required and cascades on count deletion; there
is no `itemId`, supplier, type or price-list relation. A migration creates the table, and
`TRUNCATED_TABLES` includes it. `src/server/schema/columns.db.test.ts`,
`src/server/schema/referential.db.test.ts` and `src/server/schema/constraints.db.test.ts`
cover the new table. *Proved by* those tests and
`src/server/counts/open-item-service.db.test.ts`.

**AC-2 — An open item can be added only to a DRAFT, and it never creates a master item.** With
a draft count, adding `{description: "Swept path markers", unitLabel: "Unit", quantity:
"580", jobReference: "TRANSDEV-24", note: null}` returns one open item with `unitPrice: null`;
a dump of `Item`, `ItemLocation` and `ItemPrice` before and after is byte-identical. A
supplied `unitPrice` in the add input is not written. Adding to a `SUBMITTED` or `APPROVED`
count is a `ConflictError`; a blank description, a blank unit, an empty quantity and a
quantity that fails the existing quantity grammar are each a `ValidationError` and write
nothing. Both a `YARD_STAFF` and an `ADMIN` actor can add. *Proved by*
`src/server/counts/open-item-service.db.test.ts` and `tests/unit/open-item-input.test.ts`.

**AC-3 — An open item is removable while the count is DRAFT.** Removing an existing row
deletes exactly that row and leaves the count and its other lines unchanged. Removing it
again is a `NotFoundError`; removing from a `SUBMITTED` or `APPROVED` count is a
`ConflictError` and writes nothing. Both roles may remove. The count detail page shows the
remove control only while the count is `DRAFT`. *Proved by*
`src/server/counts/open-item-service.db.test.ts` and `tests/e2e/open-items.spec.ts`.

**AC-4 — Open items belong to one count and are invisible to the master and to other
counts.** Two counts, one with an open item and one without, read back with different open
item lists. `listItems` and every item-master query return the same rows before and after the
open item is added. Deleting the count deletes its open items and no other row. A scan finds
no write to `Item`, `ItemLocation` or `ItemPrice` in `open-item-service.ts` or
`open-item-input.ts`. *Proved by* `src/server/counts/open-item-service.db.test.ts` and a
source scan in `tests/unit/count-open-items-contract.test.ts`.

**AC-5 — The review shows the total, every counted item and every open item.** For a count
with three counted lines, one uncounted line and two open items, the review response contains
the three counted descriptions, both open-item descriptions, the uncounted line in the
uncounted list, and a total equal to the exact sum of the three line values plus the priced
open-item values. An unpriced open item contributes zero, is listed, and adds a warning naming
it; the total is still rendered. A `YARD_STAFF` session receives this review (D5); no other
staff surface gains a price. *Proved by* `src/server/counts/count-summary-service.db.test.ts`
and `tests/e2e/open-items.spec.ts`.

**AC-6 — Open-item prices are entered on the review, and only while DRAFT.** A price
`"12.34567890"` is stored as its exact decimal and the item's value is
`quantity × 12.34567890`, computed on read. A missing price, a negative price, an exponent and
a ninth decimal place are each a `ValidationError` with `field === "unitPrice"` and write
nothing. The price cannot be set by the add form; it can be set only on a `DRAFT` count.
*Proved by* `tests/unit/open-item-input.test.ts` and
`src/server/counts/open-item-service.db.test.ts`.

**AC-7 — Sign-off refuses until every open item has a price and every line is counted.** With
one unpriced open item, `signOffCount` throws a `ValidationError` whose message names one open
item and writes no row, no snapshot and no audit line. With one uncounted line it throws the
existing uncounted refusal. With a missing or invalid signature it throws the existing
signature refusal before any write. With a count that is not `DRAFT` it throws the existing
already-away refusal. The order is: session, count, status, signature, uncounted lines, open
item prices — so a person who is already refused for a missing signature is not also told
about a price. *Proved by* `src/server/counts/open-item-service.db.test.ts` and
`src/server/counts/count-lifecycle-service.db.test.ts`.

**AC-8 — Sign-off is one transaction and one step.** On success, in one transaction, the
count becomes `APPROVED` with `submittedAt`, `signedById`, `signedAt`, `signatureSvg`,
`approvedById` and `approvedAt`, where the last four name the signer and the same instant;
every line with no snapshot receives the price in force on `countDate`; every open item
receives the submitted price; and exactly one `APPROVED` audit line is appended. No
`SUBMITTED` status is written. Two concurrent sign-offs produce one `APPROVED` row and one
`ConflictError`; the loser changes nothing. *Proved by*
`src/server/counts/count-lifecycle-service.db.test.ts`.

**AC-9 — A signed-off count is locked, and its open items are read-only.** After sign-off,
add, remove and price changes through the services each throw a `ConflictError`; no open item
or price changes. The count detail and review show the open items as text with no add,
remove or input control. `getLifecycleFacts` reports `signedByName`, `signedAt`,
`approvedByName` and `approvedAt` with the signer's name and the same instant, and
`signedAndApprovedBySamePerson` is true. An `ADMIN` may still reopen it by #9's rule; that
returns it to `DRAFT`, clears the signature and approval, and leaves the open items and their
prices in place and editable. *Proved by*
`src/server/counts/count-lifecycle-service.db.test.ts` and `tests/e2e/open-items.spec.ts`.

**AC-10 — The count's value includes open items everywhere it is shown.** The count summary,
the analysis total for the period, the export's total and the dashboard's record total each
equal the exact sum of the count's line values plus its open-item values. A count with no
open items is unchanged to the last digit. No surface stores a total; each computes it from
the same decimal-string helper. The summary renders each open item with its price and value,
and its total matches the sum. *Proved by*
`src/server/counts/count-summary-service.db.test.ts`,
`src/server/reporting/analysis-service.db.test.ts`,
`src/server/export/export-service.db.test.ts` and
`src/server/dashboard/record-service.db.test.ts`.

**AC-11 — The export carries the open items in the same sheet shape.** An approved count with
two master rows and one open item produces a depot sheet with the two master rows, then one
open-item row, then the total. The open-item row has its description in A, no value in B
(supplier) or C (type), its unit in D, its price in E as a number with the euro number format
(#22 AC-8), its quantity in the quantity column and its value in the value column. The total
formula's range covers the open-item row and equals the sum of all values. `showAll: false`
keeps an open item only when its quantity is held (> 0); `showAll: true` keeps every open
item. No `#REF!` or error cell is produced. The job reference and note are not exported (D9).
*Proved by* `src/server/export/export-service.db.test.ts` and
`tests/unit/export-workbook.test.ts`.

**AC-12 — The records view includes the open-item value.** A signed-off count with open items
appears in the dashboard's stock-take record with a total that includes them. Its signer and
sign-off instant are the signer and instant written by AC-8. The record is still one row for
the whole stock take, not one row per open item. *Proved by*
`src/server/dashboard/record-service.db.test.ts`.

**AC-13 — The second approver is gone for new counts.** No route, action or service creates a
new `SUBMITTED` count. The review page's control is *Sign off*, and the success response is
the signed record, not an approve form. `/summary` renders no approve control for a count
this flow signed. `canApprove` is false for a `DRAFT`; `approveCount` on a `DRAFT` throws the
existing "not submitted" refusal. A row that was already `SUBMITTED` before the migration can
still be approved once by an `ADMIN` (D7), and that is the only path to `APPROVED` that does
not go through `signOffCount`. *Proved by*
`src/server/counts/count-lifecycle-service.db.test.ts`,
`src/app/stock-entry/counts/[id]/summary/page.test.ts` and `tests/e2e/open-items.spec.ts`.

**AC-14 — Only the review gains money for staff, and it is the only new money surface.**
A `YARD_STAFF` response for the calendar, count detail, home menu, stock-takes history and
every other staff page still contains no price, value, total or amount at any depth. The
review response contains the total and open-item prices and nothing else monetary. The
existing money-boundary walks pass, and a new walk over the review page passes only when it
allows the review's `totalValue` and open-item `unitPrice`/`value` fields explicitly. The
staff shape on the count detail page still has no money. *Proved by*
`src/lib/money-boundary.test.ts`, the e2e money walks and
`tests/e2e/open-items.spec.ts`.

**AC-15 — The gate is green in full.** `npx prisma validate`, `npm run typecheck`,
`npm run lint`, `npm run test:unit`, `npx prisma migrate status`, `npm run test:db` and
`npm run test:e2e` pass; `./init.sh` ends with `[OK] Environment ready` having **executed**
the database checks. `git status --porcelain -- Samples` is empty. The new e2e file covers
add → remove → add → price → sign off → read-only, and the shipped submit/approve tests are
updated only where this feature changes the flow, with no assertion weakened. *Proved by*
the recorded gate run in `progress/impl_open_items_sign_off.md`.

## Changes to today's submit and approve flow

Every difference from #9/#12/#22/#23 is listed here. Nothing else in the flow changes.

1. **A new draft-only object exists.** `StockCountOpenItem` can be added and removed while
   the count is `DRAFT`, on the count detail page. Nothing like it exists today.
2. **The entry screen gains an Open items section.** It stays money-free for both roles; it
   gains an add form and a remove control, and no price or value.
3. **The review page is no longer money-free.** `/stock-entry/counts/[id]/submit` keeps its
   URL but becomes the review summary: total value, every counted item, every open item with
   a price input. Today it shows only the uncounted list and (for an `ADMIN`) the item names
   without prices.
4. **The signature requirement is kept.** The existing signature pad and
   `parseSignaturePath` remain; a missing or invalid signature still refuses.
5. **`submitCount` is replaced by `signOffCount`.** There is no `DRAFT → SUBMITTED` step for
   a new count. `submitCount` is no longer called by any route.
6. **The line snapshots move to sign-off.** `unitPriceSnapshot` is still written once, from
   the price in force on `countDate`, and never rewritten; the moment is sign-off instead of
   submission.
7. **The approve step is removed for new counts.** `/summary` still shows the valued record,
   but its `ApproveForm` is not rendered for a count this flow signed; `approveCount` refuses
   a `DRAFT`.
8. **The audit trail has one line, not two.** A new count gets one `APPROVED` entry naming the
   signer and the instant, instead of a `SUBMITTED` entry followed by an `APPROVED` entry.
   Existing historical `SUBMITTED` entries continue to parse and render.
9. **Lifecycle predicates change.** `canSubmit`/`canSignOff` is true only for `DRAFT`;
   `canApprove` is true only for a legacy `SUBMITTED`; `canReopen` is unchanged (`SUBMITTED`
   or `APPROVED`).
10. **The money boundary is amended.** `YARD_STAFF` sees the total and open-item prices on
    the review only. The count detail, calendar, home and all other staff surfaces stay
    money-free.
11. **The total changes on four surfaces.** The count summary, analysis period total, export
    total and dashboard record total include open-item values. Before this feature each was
    the sum of count lines alone.
12. **The export gains rows.** Open items are appended after the master rows in the same
    columns; the total formula's range covers them; the price cell follows #22's numeric
    euro format.
13. **The records view changes meaning for new counts.** The sign-off column is the signer
    and the sign-off instant, because the signer is the approver; `approvedBy` is written
    with the same actor and instant so #23's existing read still works.
14. **Reopen keeps the open items.** #9's reopen still clears the signature and approval and
    returns the count to `DRAFT`; the open items and their prices stay and become editable.
15. **Tests and fixtures move with the flow.** The shipped submit/approve e2e specs are
    updated where they assume two steps; the new `open-items.spec.ts` covers the one-step
    flow; the old approval tests are narrowed to the legacy `SUBMITTED` path rather than
    deleted. No test is weakened to make the new flow pass.

## Out of scope

- Promoting an open item into the item master, or searching an open item from another count.
- Reusing an open item across counts, or carrying one into a later count automatically.
- Open items on a blank printable sheet, in the item-master list, in housekeeping, or in
  analysis breakdowns by item. They affect totals only.
- A second approver, an approval queue, a rejection of a signed count, or an approval
  history separate from the audit line.
- Editing or removing an open item after sign-off without reopening the count.
- Changing the signature pad, its path format, or the reopen reason rules.
- Adding a price column, a job-reference column or a note column to the export (Q4).
- Changing #12's sheet count, sheet names or master headers.
- Any change to the item master's own create/edit/price paths.

## Open questions

- **Q1 — The money boundary conflict.** #22 D5 and `specs/domain-model.md` Part 6 say
  `YARD_STAFF` never sees a price; this feature's owner instruction says the counter sees the
  total and enters open-item prices, and the counter can be `YARD_STAFF`. This spec takes the
  owner's later instruction as the ruling and limits the exception to the review page. The
  owner must confirm that a `YARD_STAFF` counter may see the whole count's total.
- **Q2 — Who may sign off?** This spec lets any signed-in profile sign off any `DRAFT`, which
  matches today's "any signed-in profile may edit any draft". Should sign-off be limited to
  the profile that created the count?
- **Q3 — Legacy `SUBMITTED` rows.** This spec leaves them approvable once by an `ADMIN` so
  they are not stranded. Should they instead be converted by the migration, and if so to
  which state and with which signer?
- **Q4 — The export's optional fields.** This spec does not export the job reference or note
  because the sheet shape is fixed. Should one of them be carried in a new column, or in an
  existing cell?
- **Q5 — Zero values.** The existing quantity and price grammars allow `0`. This spec keeps
  that: an open item with quantity `0` or price `0` is accepted and contributes zero. Confirm
  that an open item must not require a strictly positive quantity or price.
- **Q6 — The drawn signature.** This spec keeps the existing signature pad as the act of
  signing off. Should signing off instead be a typed confirmation, with the pad removed?
- **Q7 — Open-item unit.** The unit is free text (1–40 characters), not a master `UnitKind`,
  because an open item has no master unit. Confirm that a free-text unit is acceptable.
- **Q8 — Reopened prices.** This spec keeps open-item prices across a reopen and lets them
  be edited while the count is a draft again. Should a reopen clear them and require fresh
  prices?
