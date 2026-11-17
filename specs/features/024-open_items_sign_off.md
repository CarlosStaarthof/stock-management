# 024 — Open items, finish and sign-off

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
and an `ADMIN` approves it later (`SUBMITTED → APPROVED`). The owner now wants no second
approver behind a sign-off, but also no money for a `YARD_STAFF` counter. The result is two
paths:

- an `ADMIN` or `SUPER_ADMIN` who counts a draft sees the review, prices the open items and
  signs the count off directly to `APPROVED` in one step;
- a `YARD_STAFF` counter adds open items without prices and **finishes** the count without
  seeing a euro. It waits as `PENDING_SIGN_OFF`; an `ADMIN` or `SUPER_ADMIN` then sees the
  review, prices the open items and signs it off.

Open items are included in the count's value, its export and the records view, removable
while `DRAFT`, and read-only after sign-off.

## Owner's decisions

- **D1 — Open items are not master items.** A new `StockCountOpenItem` row belongs to one
  `StockCount` and to nothing else. It has no `Item`, `ItemLocation` or `ItemPrice` row, and
  no master query ever sees it. Tradeoff: an open item is not available to the next count;
  if the same thing comes back, it is added again or promoted to the master deliberately.
- **D2 — Both roles may add and remove while DRAFT; only administrators may price.** This
  follows #8, where any signed-in profile may edit any `DRAFT`. A `YARD_STAFF` counter may
  add or remove an open item but never sets or sees its price. Tradeoff: a staff counter who
  spots a wrong price cannot correct it; an `ADMIN` or `SUPER_ADMIN` must.
- **D3 — One sign-off, one approver, two routes to it.** An `ADMIN` or `SUPER_ADMIN` who
  counted signs off `DRAFT → APPROVED` directly. A `YARD_STAFF` counter finishes
  `DRAFT → PENDING_SIGN_OFF`; an `ADMIN` or `SUPER_ADMIN` then signs off
  `PENDING_SIGN_OFF → APPROVED`. In both cases the signer is the approver;
  `approvedById`/`approvedAt` hold the same person and instant as `signedById`/`signedAt`.
  Tradeoff: a staff count crosses two roles before it closes, which is exactly the owner's
  rule; an admin count closes in one step.
- **D4 — The drawn signature is the administrator's sign-off.** "Sign-off" is still the
  existing signature pad and SVG path data. Marking a count finished has no signature: it is
  not a closure and confers no record. Tradeoff: the sign-off is always the act of an
  `ADMIN` or `SUPER_ADMIN`.
- **D5 — Money only for ADMIN and SUPER_ADMIN.** `YARD_STAFF` sees no price, value or total
  on any surface — calendar, count, finish, history, export or home — and cannot sign off.
  This removes the draft's review-only exception and matches #22 D5 and
  `specs/domain-model.md` Part 6. Tradeoff: a staff counter cannot see the value of what they
  counted; only an administrator can confirm it.
- **D6 — Open items are priced on the administrator's review.** Adding one stores
  `unitPrice = null`; the add form has no price field. The only writer of an open item's
  price is the administrator's review/sign-off action. Tradeoff: a count's open-item values
  are unknowable until an administrator reviews it, which is exactly when the total is
  shown.
- **D7 — The old approve step is gone for new counts; legacy rows are not converted.** No new
  count reaches `SUBMITTED`. Rows that were already `SUBMITTED` before the migration may
  still be approved once by an `ADMIN` or `SUPER_ADMIN`, with no data conversion, so no
  historical row is stranded.
- **D8 — Reopen is unchanged.** An `ADMIN` or `SUPER_ADMIN` may reopen any count that is not
  `DRAFT` with a reason; that clears the signature and the approval and returns it to
  `DRAFT`. Because the existing rule is "not draft", it also covers a `PENDING_SIGN_OFF`
  count. Open items and their prices survive and are editable again.
- **D9 — The export keeps the sheet's shape.** Open items are appended as rows after the
  master rows, in the same columns: description, unit, price, quantity, value. The optional
  job reference and note are shown on the count and review screens but are not added as new
  export columns. *Flagged as Q1.*
- **D10 — Values are derived, never stored.** Every open-item value is
  `quantity × unitPrice`, and every count total is the sum of the exact line values plus the
  exact open-item values. The existing decimal-string helpers are used; no `number` is used
  for money.
- **D11 — A fourth status spells "finished, waiting for sign-off".** `PENDING_SIGN_OFF` is
  added to `CountStatus`; a `YARD_STAFF` finish writes it, and only `signOffCount` leaves it
  for `APPROVED`. `SUBMITTED` remains the legacy status and is never written for a new count.
  Tradeoff: one enum value, one migration and one label, in exchange for keeping the legacy
  approve path unambiguous.

## Owner rulings, 2026-11-17

- **R1 — `YARD_STAFF` never sees a price or total, not even at sign-off, and cannot sign
  off.** A `YARD_STAFF` counter adds open items without prices and marks the count finished;
  an `ADMIN` or `SUPER_ADMIN` then reviews, prices the open items and signs off. When an
  `ADMIN` or `SUPER_ADMIN` counts, review, pricing and sign-off stay one step by the same
  person. This is implemented by D2–D6 and D11 and replaces the draft's D5 exception.
- **R2 — The #22 migration promotes `carlos-staarthof` only if that profile exists** and
  never creates one. This feature adds no profile operation.
- **R3 — One row per approved `StockCount`** in the records view, one per depot per stock
  take, matching the one-file-per-depot export. AC-12 writes against that rule.
- **R4 — Legacy `SUBMITTED` counts stay approvable once by an `ADMIN` or `SUPER_ADMIN`**,
  with no data conversion. The retained `approveCount` path is exactly that and is the only
  route to `APPROVED` outside `signOffCount`.

## User stories

- As a counter, while a count is a draft I can add a one-off item with a description, unit,
  quantity and an optional job reference or note, and I do not have to create a master item
  for it.
- As a counter, I can remove an open item I added by mistake while the count is still a
  draft.
- As a `YARD_STAFF` counter, I can finish a count without seeing any price or total, and
  then wait for an administrator to sign it off.
- As an `ADMIN` or `SUPER_ADMIN` who counted, I see every counted item, every open item and
  the count's total on one review screen, I enter a unit price for each open item, and my
  signature signs the count off and locks it in one step.
- As an `ADMIN` or `SUPER_ADMIN`, I can open a count a `YARD_STAFF` finished, see the review
  summary, price its open items and sign it off.
- As an administrator, I cannot sign a count off until every open item has a price and every
  counted item has a quantity.
- As an administrator, I can see the open items in the count, its value in the export and its
  value in the records list, and I can still reopen a signed-off count with a reason.

## Data touched

`prisma/schema.prisma` gains one model, one relation and one enum value:

```prisma
enum CountStatus {
  DRAFT
  SUBMITTED
  PENDING_SIGN_OFF
  APPROVED
}

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
`ItemLocation`, no `ItemPrice` and no relation to `Item`. `unitPrice` is null until an
administrator's review. A migration adds the enum value and the table; `TRUNCATED_TABLES`
gains `StockCountOpenItem` and the closure test stays green. No existing `StockCount` row or
`SUBMITTED` value is converted or rewritten.

**Read and written by this feature:** `StockCountOpenItem`, `StockCount`,
`StockCountLine`, `ItemPrice` (for the existing line snapshots), and — for the records and
export totals — `Location`. **Never written:** `Item`, `ItemLocation`, `ItemPrice` by an
open-item path.

`specs/domain-model.md` must be amended on approval: Part 3 gains the status and the model,
Part 6 states that `YARD_STAFF` never sees money and cannot sign off while `ADMIN` and
`SUPER_ADMIN` do, and Invariant 2's "snapshot at submit" wording becomes "snapshot at
sign-off" for new counts.

## Contract

**Inputs** (`src/server/counts/open-item-input.ts`, pure)

| Function | Rules |
|---|---|
| `parseOpenItemInput(raw)` | `description` trimmed, 1–200 characters, required; `unitLabel` trimmed, 1–40, required; `quantity` parsed by the existing quantity parser and required (empty is not "not counted"); `jobReference` trimmed or null, at most 80; `note` trimmed or null, at most 500. A supplied `unitPrice` is ignored, never written. |
| `parseOpenItemPrice(raw)` | `unitPrice` required, decimal string matching `Decimal(18, 8)`: at most 10 digits before the point, at most 8 after, non-negative. Empty, a negative number and an exponent are refused with a typed `ValidationError`. |

**Open-item shapes** (`src/types/stock-count.ts`)

| Shape | Fields |
|---|---|
| `OpenItemForStaff` | `id, description, unitLabel, quantity, jobReference, note`; **no** money field. |
| `OpenItemForAdmin` | `OpenItemForStaff` plus `unitPrice: string \| null` and `value: string`. |

`listOpenItems` chooses the shape from `isAdminOrAbove(actor.role)` and never returns the
admin shape to a `YARD_STAFF` actor.

**Services**

`src/server/counts/open-item-service.ts`

| Export | Behaviour |
|---|---|
| `listOpenItems(actor, countId)` | Any signed-in actor. Open items in the order they were added. The staff shape carries description, unit, quantity, job reference and note only; the admin shape adds the price and derived value. |
| `addOpenItem(actor, countId, raw)` | Any signed-in actor; count must be `DRAFT`; parses the input; creates one `StockCountOpenItem` with `unitPrice: null`; writes no `Item` row. |
| `removeOpenItem(actor, countId, openItemId)` | Any signed-in actor; count and item must exist and the count must be `DRAFT`; deletes exactly that row. |
| `setOpenItemPrices(actor, countId, prices)` | `ADMIN` or `SUPER_ADMIN` only; count must be `DRAFT` or `PENDING_SIGN_OFF`; writes each open item's `unitPrice`; refuses an unknown id or a missing price for any open item. Used by the sign-off transaction. |

`src/server/counts/count-lifecycle-service.ts`

| Export | Behaviour |
|---|---|
| `finishCount(actor, countId)` | `YARD_STAFF` only. The count must exist and be `DRAFT`; every line must be counted. In one transaction it sets `PENDING_SIGN_OFF`, writes `submittedAt`, and appends one `FINISHED` audit line naming the actor. It writes no price, no snapshot and no signature. An `ADMIN`/`SUPER_ADMIN` uses `signOffCount` instead, so an administrator cannot park a count in `PENDING_SIGN_OFF` and leave the closure to a later step. |
| `signOffCount(actor, countId, { signaturePath, openItemPrices })` | `ADMIN` or `SUPER_ADMIN` only. The count must exist and be `DRAFT` or `PENDING_SIGN_OFF`; the signature must parse; every line must be counted; every open item must have a price in the request. In one transaction: writes the line snapshots, writes the open-item prices, and compare-and-sets the status to `APPROVED` with `submittedAt` (the finish instant if already set, otherwise the sign-off instant), `signedById`, `signedAt`, `signatureSvg`, `approvedById` and `approvedAt` (signer and instant for both), and one `APPROVED` audit line. No `SUBMITTED` status is written. |
| `submitCount` | Removed from the new flow; no route or action calls it. |
| `approveCount` | Retained only for a legacy row that was already `SUBMITTED` at migration time. `ADMIN` or `SUPER_ADMIN` only; writes `approvedById`/`approvedAt` and the audit line without touching the original signer. It refuses a `DRAFT` or `PENDING_SIGN_OFF` count, which must go through `signOffCount`. |

`src/lib/count-lifecycle.ts` gains `isPendingSignOff`, `canFinish` (draft only),
`canSignOff` (draft or pending sign-off; the role gate is in the service) and keeps
`canApprove` true only for legacy `SUBMITTED`. `canReopen` remains "not `DRAFT`", so it
covers `PENDING_SIGN_OFF` too. `COUNT_STATUS_LABEL` names the new status
"Awaiting sign-off". `AuditEvent` gains `FINISHED`, and `auditSentence` renders one line
naming who finished the count and when; existing `SUBMITTED`, `APPROVED` and `REOPENED`
sentences are unchanged.

`src/server/counts/count-summary-service.ts` gains two review shapes:

- `FinishReviewForStaff = { countId, locationName, periodLabel, countDate, status,
  uncounted, openItems: OpenItemForStaff[], lifecycle }` — **no** total, price or value.
- `ReviewForSignOff = { countId, locationName, periodLabel, countDate, status, totalValue,
  lines, openItems: OpenItemForAdmin[], uncounted, lifecycle }` — `lines` is **every**
  counted item (not only the uncounted list), and `totalValue` is the exact sum of all line
  values and all priced open-item values.

An unpriced open item contributes zero, is named in a warning and in the sign-off refusal.
The admin builder is reached only when `isAdminOrAbove` is true; the staff builder is the one
a `YARD_STAFF` actor can receive.

**Routes and actions**

| Route | Access | Behaviour |
|---|---|---|
| `/stock-entry/counts/[id]` | both roles | Adds an Open items section while `DRAFT`: the add form and a remove control per row. After finish or sign-off the section is read-only. No price or value on this page for either role. |
| `/stock-entry/counts/[id]/submit` | both roles | The URL is unchanged. A `YARD_STAFF` actor gets the money-free finish screen: the uncounted list, the open items without prices, and *Finish count* while `DRAFT`; once `PENDING_SIGN_OFF` it reads "Awaiting sign-off". An `ADMIN` or `SUPER_ADMIN` gets the review summary: total value, every counted item, every open item with a price input, the uncounted list, the signature pad and *Sign off*. |
| `/stock-entry/counts/[id]/summary` | `ADMIN` or above | The valued summary, now including open-item rows and a total that includes them. No approve control for a count created by this flow. |
| `POST` server actions | per service | Add and remove for both roles; finish for `YARD_STAFF`; price and sign-off for `ADMIN`/`SUPER_ADMIN`. Each action reads the actor from the session and hands it to the service. |
| `/analysis/export` | `ADMIN` or above | The workbook includes open-item rows. |

## UI states

- **Count detail, DRAFT, no open items:** an Open items section with the add form and an
  empty sentence, for both roles.
- **Count detail, DRAFT, with open items:** each row shows description, unit, quantity and
  the optional job reference/note, and a remove control. No price for `YARD_STAFF`; an
  administrator may also see the price from the review, never on this page.
- **Count detail, PENDING_SIGN_OFF or signed off:** the count and its open items are listed
  read-only, with no quantity input, add, remove or price control. The existing edit gate is
  `DRAFT`, so a finished count cannot be changed until an administrator reopens it.
- **Finish, `YARD_STAFF`, DRAFT:** the uncounted list if any, the open items without prices,
  and *Finish count*. No total, price or value at any depth.
- **Finish, `YARD_STAFF`, PENDING_SIGN_OFF:** "Awaiting sign-off", the open items read-only,
  and no money.
- **Review, `ADMIN`/`SUPER_ADMIN`, DRAFT or PENDING_SIGN_OFF:** total value, every counted
  item, open items with price inputs, the uncounted list if any, and the signature pad.
- **Review, an open item has no price:** the sign-off control is still offered (like #9's
  signature control, it is not greyed out), and pressing it returns a sentence naming how
  many open items need a price.
- **Review, every line counted and every open item priced:** the signature pad and *Sign off*
  are usable; the signed-off response shows the record and no form.
- **Summary:** open-item rows appear among the valued lines; the total includes them; no
  approve button for a count that this flow signed.
- **Export:** open-item rows follow the master rows; the total row includes them; no error
  cell.
- **Records:** one row per approved `StockCount`; its total includes open-item values.

## Acceptance criteria

**AC-1 — The schema adds one count-local model, one relation and one status value.**
`StockCountOpenItem` has exactly the fields above; `stockCountId` is required and cascades on
count deletion; there is no `itemId`, supplier, type or price-list relation. `CountStatus`
contains `PENDING_SIGN_OFF`; no existing status value is removed. A migration creates the
table and adds the enum value (carrying a `-- contract-step:` line for #16's migration-safety
test), and `TRUNCATED_TABLES` includes the table. Existing `SUBMITTED` rows are unchanged.
`src/server/schema/columns.db.test.ts`, `src/server/schema/referential.db.test.ts` and
`src/server/schema/constraints.db.test.ts` cover the new table. *Proved by* those tests and
`src/server/counts/open-item-service.db.test.ts`.

**AC-2 — An open item can be added only to a DRAFT, and it never creates a master item.**
With a draft count, adding `{description: "Swept path markers", unitLabel: "Unit", quantity:
"580", jobReference: "TRANSDEV-24", note: null}` returns one open item with
`unitPrice: null`; a dump of `Item`, `ItemLocation` and `ItemPrice` before and after is
byte-identical. A supplied `unitPrice` in the add input is not written. Adding to a
`PENDING_SIGN_OFF`, `SUBMITTED` or `APPROVED` count is a `ConflictError`; a blank
description, a blank unit, an empty quantity and a quantity that fails the existing quantity
grammar are each a `ValidationError` and write nothing. Both a `YARD_STAFF` and an `ADMIN`
actor can add. *Proved by* `src/server/counts/open-item-service.db.test.ts` and
`tests/unit/open-item-input.test.ts`.

**AC-3 — An open item is removable only while the count is DRAFT.** Removing an existing row
deletes exactly that row and leaves the count and its other lines unchanged. Removing it
again is a `NotFoundError`; removing from a `PENDING_SIGN_OFF`, `SUBMITTED` or `APPROVED`
count is a `ConflictError` and writes nothing. Both roles may remove. The count detail page
shows the remove control only while the count is `DRAFT`. *Proved by*
`src/server/counts/open-item-service.db.test.ts` and `tests/e2e/open-items.spec.ts`.

**AC-4 — Open items belong to one count and are invisible to the master and to other
counts.** Two counts, one with an open item and one without, read back with different open
item lists. `listItems` and every item-master query return the same rows before and after the
open item is added. Deleting the count deletes its open items and no other row. A scan finds
no write to `Item`, `ItemLocation` or `ItemPrice` in `open-item-service.ts` or
`open-item-input.ts`. *Proved by* `src/server/counts/open-item-service.db.test.ts` and a
source scan in `tests/unit/count-open-items-contract.test.ts`.

**AC-5 — The administrator's review shows the total, every counted item and every open
item; the staff finish screen shows no money.** For a count with three counted lines, one
uncounted line and two open items, the `ADMIN`/`SUPER_ADMIN` review contains the three
counted descriptions, both open-item descriptions, the uncounted line in the uncounted list,
and a total equal to the exact sum of the three line values plus the priced open-item values.
An unpriced open item contributes zero, is listed, and adds a warning naming it; the total is
still rendered. The `YARD_STAFF` finish shape for the same count contains the uncounted line
and both open-item descriptions and quantities, and no `unitPrice`, `value`, `totalValue` or
amount at any depth. *Proved by* `src/server/counts/count-summary-service.db.test.ts` and
`tests/e2e/open-items.spec.ts`.

**AC-6 — Open-item prices are entered only by an administrator, and only while DRAFT or
PENDING_SIGN_OFF.** A price `"12.34567890"` is stored as its exact decimal and the item's
value is `quantity × 12.34567890`, computed on read. A missing price, a negative price, an
exponent and a ninth decimal place are each a `ValidationError` with `field === "unitPrice"`
and write nothing. The price cannot be set by the add form. A `YARD_STAFF` call to
`setOpenItemPrices` is a `ForbiddenError` and writes nothing. After `APPROVED`, every price
write is a `ConflictError`. *Proved by* `tests/unit/open-item-input.test.ts` and
`src/server/counts/open-item-service.db.test.ts`.

**AC-7 — Finish requires every line counted; sign-off requires that plus a signature and a
price for every open item.** `finishCount` on a `DRAFT` with one uncounted line throws the
existing uncounted refusal and writes nothing; on a count that is not `DRAFT` it throws the
existing "already away" `ConflictError`; an `ADMIN` or `SUPER_ADMIN` caller is refused with
`ForbiddenError`, because that role signs off instead. `signOffCount` with one unpriced open
item throws a
`ValidationError` whose message names one open item and writes no row, no snapshot and no
audit line. With one uncounted line it throws the existing uncounted refusal. With a missing
or invalid signature it throws the existing signature refusal before any write. A
`YARD_STAFF` actor is refused with `ForbiddenError` before the count is read. The order is:
session, role, count, status, signature, uncounted lines, open-item prices — so a person
already refused for a missing signature is not also told about a price. *Proved by*
`src/server/counts/open-item-service.db.test.ts`,
`src/server/counts/count-lifecycle-service.db.test.ts` and `tests/e2e/open-items.spec.ts`.

**AC-8 — Sign-off is one transaction and one step from DRAFT or PENDING_SIGN_OFF.** On
success, in one transaction, the count becomes `APPROVED` with `submittedAt` (the finish
instant when present, otherwise the sign-off instant), `signedById`, `signedAt`,
`signatureSvg`, `approvedById` and `approvedAt`, where `signedById`/`signedAt` and
`approvedById`/`approvedAt` name the signing `ADMIN` or `SUPER_ADMIN` and the same instant;
every line with no snapshot receives the price in force on `countDate`; every open item
receives the submitted price; and exactly one `APPROVED` audit line is appended. No
`SUBMITTED` status is written. A direct `DRAFT → APPROVED` sign-off and a
`PENDING_SIGN_OFF → APPROVED` sign-off both produce that same shape. Two concurrent sign-offs
produce one `APPROVED` row and one `ConflictError`; the loser changes nothing. *Proved by*
`src/server/counts/count-lifecycle-service.db.test.ts`.

**AC-9 — A signed-off count is locked, and its open items are read-only.** After sign-off,
add, remove and price changes through the services each throw a `ConflictError`; no open item
or price changes. The count detail, finish and review show the open items as text with no
add, remove or input control. `getLifecycleFacts` reports `signedByName`, `signedAt`,
`approvedByName` and `approvedAt` with the administrator's name and the same instant, and
`signedAndApprovedBySamePerson` is true. An `ADMIN` or `SUPER_ADMIN` may still reopen it by
#9's rule; that returns it to `DRAFT`, clears the signature and approval, and leaves the open
items and their prices in place and editable. A `PENDING_SIGN_OFF` count is reopenable by the
same rule. *Proved by* `src/server/counts/count-lifecycle-service.db.test.ts` and
`tests/e2e/open-items.spec.ts`.

**AC-10 — The count's value includes open items everywhere an administrator sees it.** The
count summary, the analysis total for the period, the export's total and the dashboard's
record total each equal the exact sum of the count's line values plus its open-item values. A
count with no open items is unchanged to the last digit. No surface stores a total; each
computes it from the same decimal-string helper. The summary renders each open item with its
price and value, and its total matches the sum. A `YARD_STAFF` response never contains the
total. *Proved by* `src/server/counts/count-summary-service.db.test.ts`,
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

**AC-12 — The records view is one row per approved count and includes its open-item value.**
A signed-off count with open items appears in the dashboard's stock-take record with a total
that includes them. Its signer and sign-off instant are the administrator and instant written
by AC-8. The record is still one row for the whole `StockCount`, one per depot per stock take,
matching the export's one file per depot, not one row per open item and not one row per
period. A legacy `SUBMITTED` count that was approved through `approveCount` appears once
`APPROVED`, with its approver and approval instant (R4). *Proved by*
`src/server/dashboard/record-service.db.test.ts`.

**AC-13 — The second approver is gone for new counts, and only the legacy path survives.** No
route, action or service creates a new `SUBMITTED` count; a staff finish writes
`PENDING_SIGN_OFF`. The review page's control is *Sign off*, and the success response is the
signed record, not an approve form. `/summary` renders no approve control for a count this
flow signed. `canFinish` is true only for `DRAFT`; `canSignOff` is true for `DRAFT` and
`PENDING_SIGN_OFF` but the service refuses a `YARD_STAFF` actor; `canApprove` is true only for
a legacy `SUBMITTED`; `approveCount` on a `DRAFT` or `PENDING_SIGN_OFF` throws a
`ConflictError`. A `PENDING_SIGN_OFF` count is read-only to the counter: the existing
`DRAFT`-only edit gate leaves no quantity input and no add, remove or finish control until an
administrator reopens it. A row that was already `SUBMITTED` before the migration can still
be approved once by an `ADMIN` or `SUPER_ADMIN` (R4), and that is the only path to
`APPROVED` that does not go through `signOffCount`; no data conversion is performed.
*Proved by*
`src/server/counts/count-lifecycle-service.db.test.ts`,
`src/app/stock-entry/counts/[id]/summary/page.test.ts` and `tests/e2e/open-items.spec.ts`.

**AC-14 — The review is the only new money surface, and only for administrators.**
A `YARD_STAFF` response for the calendar, count detail, finish screen, home menu, stock-takes
history, review and every other staff page contains no price, value, total or amount at any
depth. The `ADMIN`/`SUPER_ADMIN` review response contains the total and open-item prices and
nothing else monetary. The existing money-boundary walks pass. A new walk over the finish
screen passes with no allowance; a new walk over the administrator review passes only when it
allows the review's `totalValue` and open-item `unitPrice`/`value` fields explicitly. The
staff shape on the count detail page still has no money. *Proved by*
`src/lib/money-boundary.test.ts`, the e2e money walks and `tests/e2e/open-items.spec.ts`.

**AC-15 — The gate is green in full.** `npx prisma validate`, `npm run typecheck`,
`npm run lint`, `npm run test:unit`, `npx prisma migrate status`, `npm run test:db` and
`npm run test:e2e` pass; `./init.sh` ends with `[OK] Environment ready` having **executed**
the database checks. `git status --porcelain -- Samples` is empty. The new e2e file covers
add → remove → add → finish by `YARD_STAFF` → review and price by `ADMIN` → sign off →
read-only, and a second path where an `ADMIN` counts and signs off in one step. The shipped
submit/approve tests are updated only where this feature changes the flow, the legacy
`SUBMITTED` approval test is narrowed rather than deleted, and no assertion is weakened.
*Proved by* the recorded gate run in `progress/impl_open_items_sign_off.md`.

## Changes to today's submit and approve flow

Every difference from #9/#12/#22/#23 is listed here. Nothing else in the flow changes.

1. **A new draft-only object exists.** `StockCountOpenItem` can be added and removed while
   the count is `DRAFT`, on the count detail page. Nothing like it exists today.
2. **The entry screen gains an Open items section.** It stays money-free for both roles; it
   gains an add form and a remove control, and no price or value.
3. **`YARD_STAFF` no longer sees a review with money and never signs off.** Today `/submit`
   is the signature screen for both roles. For a `YARD_STAFF` actor it becomes a money-free
   *Finish count* screen; the administrator's signature is the only closure.
4. **The review and sign-off screen is administrator-only for its money.** For an `ADMIN` or
   `SUPER_ADMIN`, `/submit` shows the total, every counted item, every open item with a price
   input, and *Sign off*. Today it shows only the uncounted list and, for an `ADMIN`, item
   names without prices.
5. **A new status sits between draft and approved for staff counts.** `PENDING_SIGN_OFF` is
   written by `finishCount`. It is not `SUBMITTED`; the legacy status is not reused, so an
   old `SUBMITTED` row and a new finished row cannot be confused.
6. **`submitCount` is replaced by `finishCount` and `signOffCount`.** There is no
   `DRAFT → SUBMITTED` step for a new count. `submitCount` is no longer called by any route.
   `finishCount` is a `YARD_STAFF` act; the `SignaturePad` calls the sign-off action and is
   rendered only for an `ADMIN`/`SUPER_ADMIN`.
7. **The signature requirement moves to sign-off and to the administrator.** The existing
   pad and `parseSignaturePath` remain; a missing or invalid signature still refuses. A
   `YARD_STAFF` finish does not sign and does not require a signature.
8. **The line snapshots move to sign-off.** `unitPriceSnapshot` is still written once, from
   the price in force on `countDate`, and never rewritten; the moment is sign-off instead of
   submission.
9. **The approve step is removed for new counts; the legacy path remains.** `/summary` still
   shows the valued record, but its `ApproveForm` is not rendered for a count this flow
   signed; `approveCount` refuses a `DRAFT` or `PENDING_SIGN_OFF`. A legacy `SUBMITTED` count
   can still be approved once by an `ADMIN` or `SUPER_ADMIN`, with no data conversion.
10. **The audit trail changes shape.** A staff count gets one `FINISHED` line and one
    `APPROVED` line; an administrator's one-step count gets one `APPROVED` line. Today a new
    count gets `SUBMITTED` then `APPROVED`. Existing historical `SUBMITTED` entries continue
    to parse and render.
11. **Lifecycle predicates change.** `canSubmit` is replaced by `canFinish` (draft only);
    `canSignOff` covers `DRAFT` and `PENDING_SIGN_OFF` with the role gate in the service;
    `canApprove` is true only for a legacy `SUBMITTED`; `canReopen` is unchanged in
    substance (`!DRAFT`) and therefore also covers `PENDING_SIGN_OFF`.
12. **The money boundary is narrowed, not widened.** `YARD_STAFF` sees no total and no
    open-item price anywhere, including the finish screen. Only the `ADMIN`/`SUPER_ADMIN`
    review gains money. The draft's "review exception for staff" is removed.
13. **The total changes on four surfaces.** The count summary, analysis period total, export
    total and dashboard record total include open-item values. Before this feature each was
    the sum of count lines alone.
14. **The export gains rows.** Open items are appended after the master rows in the same
    columns; the total formula's range covers them; the price cell follows #22's numeric euro
    format.
15. **The records view changes meaning for new counts.** The sign-off column is the
    administrator who signed off and the sign-off instant, because that person is also the
    approver; `approvedBy` is written with the same actor and instant so #23's existing read
    still works. For a legacy approved count the row names the approver, and the original
    signer remains on the count.
16. **Reopen keeps the open items.** #9's reopen still clears the signature and approval and
    returns the count to `DRAFT`; the open items and their prices stay and become editable.
    It now also applies to a `PENDING_SIGN_OFF` count.
17. **Tests and fixtures move with the flow.** The shipped submit/approve e2e specs are
    updated where they assume two steps; the new `open-items.spec.ts` covers both the
    staff-finish-then-admin-sign-off flow and the admin one-step flow; the old approval tests
    are narrowed to the legacy `SUBMITTED` path rather than deleted. No test is weakened to
    make the new flow pass.

## Out of scope

- Promoting an open item into the item master, or searching an open item from another count.
- Reusing an open item across counts, or carrying one into a later count automatically.
- Open items on a blank printable sheet, in the item-master list, in housekeeping, or in
  analysis breakdowns by item. They affect totals only.
- A second approver, an approval queue, a rejection of a signed count, or an approval
  history separate from the audit line.
- Letting a `YARD_STAFF` user see a price, total or value, or sign a count off.
- Editing or removing an open item after sign-off without reopening the count.
- Converting legacy `SUBMITTED` rows, or changing their signer, snapshots or signature.
- Changing the signature pad, its path format, or the reopen reason rules.
- Adding a price column, a job-reference column or a note column to the export (Q1).
- Changing #12's sheet count, sheet names or master headers.
- Any change to the item master's own create/edit/price paths.

## Open questions

- **Q1 — The export's optional fields.** This spec does not export the job reference or note
  because the sheet shape is fixed. Should one of them be carried in a new column, or in an
  existing cell?
- **Q2 — Zero values.** The existing quantity and price grammars allow `0`. This spec keeps
  that: an open item with quantity `0` or price `0` is accepted and contributes zero. Confirm
  that an open item must not require a strictly positive quantity or price.
- **Q3 — The signature at sign-off.** This spec keeps the existing signature pad as the act
  of signing off, now drawn by the `ADMIN` or `SUPER_ADMIN`; marking a count finished has no
  signature. Confirm that this is the intended division.
- **Q4 — Open-item unit.** The unit is free text (1–40 characters), not a master `UnitKind`,
  because an open item has no master unit. Confirm that a free-text unit is acceptable.
- **Q5 — Reopened prices.** This spec keeps open-item prices across a reopen and lets them
  be edited while the count is a draft again. Should a reopen clear them and require fresh
  prices?
- **Q6 — The finished-state name and label.** This spec spells the state `PENDING_SIGN_OFF`
  and labels it "Awaiting sign-off", keeping `SUBMITTED` for legacy rows. Confirm the label,
  or name a preferred one.
