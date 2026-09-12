# 009 — Sign, submit and approve

**Feature id:** 9   **Status:** approved   **Approved:** 2026-09-12
**Depends on:** #8 `stock_entry_ui` (the counting screen, `saveQuantities` and its
`status !== "DRAFT"` refusal, the three filters, `quantity-input.ts`, the
`chromium-stock-entry` project and the reserved-year rule), #7 `entry_start` (the `DRAFT`
count, `getCount`, `count-messages.ts`, `src/types/stock-count.ts`, `countForRole`,
`itemsWithoutPriceMessage`, the four-route `/stock-entry` tree), #6 `item_master_ui`
(**`selectCurrentPrice` — the one definition of "the price in force"**, `formatPriceExact`,
the single-sourced messages modules, and **AC-31's exact permitted list for the string
`unitPrice`**, which this feature is the first to have to amend), #5 `seed_from_workbook`
(the 129 `ItemPrice` rows and the 13 items that have none), #4 `domain_schema`
(`status`, `submittedAt`, `approvedById`, `approvedAt`, `signedById`, `signedAt`,
`signatureSvg`, `notes`, `unitPriceSnapshot` — **every column this feature writes already
exists**), #3 `auth_and_roles` (`requireUser`, `requireAdminPage`, `assertUser`,
`assertRole`, `shapeForRole`, `deepKeys` / `assertNoMoneyKeys`, the typed errors and
`errorResponse`), #20 `test_db_reset` (`TRUNCATED_TABLES`)

## Purpose

**This is the feature that turns a draft into a record.** Everything before it is
editable: #7 creates a count, #8 fills it in, and until now nothing in this product has
ever been finished. #9 is the moment a count stops being a working document and becomes a
fact — signed by the person who walked the yard, priced at the prices that were in force
on the day they walked it, and approved by somebody else.

It is the last feature of **M2**, and it is where five of the domain model's twelve
invariants stop being paragraphs:

| Invariant | What #9 makes real |
|---|---|
| **5** | `quantity = null` blocks submission. #8 made `null` and `0` different to type; here `null` has teeth |
| **11** | No signature, no submission. The paper sheet was signed; the workbook lost that, and this puts it back |
| **2** | `unitPriceSnapshot` is written **once**, at submit, from the `ItemPrice` effective on `countDate`, and never rewritten. **This feature is its first writer** |
| **4** | A line whose item has no price contributes `0` **and raises a warning**. Never silently zero-valued stock |
| **3** | An `APPROVED` count is immutable, and only an `ADMIN` reopens it, audited — and reopening clears the signature |

And Part 6's sentence — *"the person who typed the number is not the person who signs it
off"* — becomes a refusal in a service rather than a hidden button.

Without #9 there is no `SUBMITTED` count, so #10 has no history to show, #11 has no total
to analyse and #12 has no `Qty | Value` pair to export. Every euro figure this product will
ever show is derived from a column that nothing has written yet.

## Scope boundary with #8, #10 and #11

**In:** the review-and-sign screen, the drawn signature and its storage, Invariant 5's
block and the route out of it, the `unitPriceSnapshot` write, Invariant 4's warning, the
`ADMIN`-only valued summary with its total, approval, immutability and the audited reopen.

**Out, and owned elsewhere:** typing a quantity, autosave, the three filters and the
progress line are #8 and are untouched. The Dublin / Clonmel / Both selector, the
previous/next-count jumps and the history calendar are #10 `stock_takes_history`. Yard
totals across periods, period completeness, MoM, YoY and the breakdowns are #11 `analysis`
— **this feature computes one count's total and nothing that spans two counts.** The Excel
export of the signature is #12.

**No migration, and this is the whole of the schema story.** #4 shipped `status`,
`submittedAt`, `approvedById`, `approvedAt`, `signedById`, `signedAt`, `signatureSvg`,
`notes` and `unitPriceSnapshot`. #9 writes columns that already exist and **adds no
table**, so `TRUNCATED_TABLES` keeps exactly its eight entries — `Item`, `ItemLocation`,
`ItemPrice`, `ItemType`, `StockCount`, `StockCountLine`, `Supplier`, `User` — and
**020 AC-4's `information_schema` equality passes untouched** (AC-30). The audit trail is
deliberately built on `StockCount.notes` rather than a new `StockCountEvent` table, for the
reason argued under *The audit record* and recorded as *Open questions* 6.

**Three new page routes, no new route handler.** #8's `POST /api/counts/[id]/lines` is the
only JSON endpoint this product has, and #9 adds none: submit, approve and reopen are each
one deliberate action a person takes once, so each is a server action behind a confirming
screen, and none of them needs to work while offline.

**`count-entry-service.ts` is byte-identical after this feature.** #8's refusal —
`ConflictError` with `This count has been submitted and can no longer be edited.` for any
`status !== "DRAFT"` — is already the immutability rule for the quantity path, and 008 AC-9
already pins its wording. #9 re-asserts it against an `APPROVED` count (AC-17) rather than
re-spelling it, so 008 AC-9 and its scan pass unmodified.

## The five things this feature settles

### 1. Invariant 5 — `null` blocks submission, and the way out is one tap

`submitCount` refuses while **any** line holds `quantity IS NULL`, at the service, with a
sentence that names the number: `12 items have not been counted. Every line must hold a
number, or 0, before this count can be submitted.`

The hard case is a **filtered** view. #8's filters hide rows on purpose, and a counter who
has filtered to `Kelly` and counted every visible row has finished nothing. #8 already
refuses to let a filter change the progress line (008 AC-24) and already states how many
hidden rows are uncounted (008 AC-23). #9 adds the way out, and it deliberately adds **no
fourth query parameter** to the counting screen, so 008 AC-22's "a parameter that is not
one of the three is ignored" stays literally true:

- `/stock-entry/counts/[id]/submit` **ignores every filter parameter** and always reads the
  whole count.
- When blocked it lists **every** uncounted item, in sheet order, description and unit.
- Each entry is a link to `/stock-entry/counts/<id>#line-<itemId>` — **no query string**,
  so the filter does not travel, the row is guaranteed to be rendered, and the browser
  scrolls to it.
- The *Review and sign* control on the counting screen is **always present and never
  disabled**. A disabled button is not a rule; the refusal is the service's, and taking
  someone to the list of what is missing is more use than greying out the only way forward.

### 2. Invariant 11 — the signature, and what is actually stored

`signatureSvg` holds **SVG path data, not a raster, and not a document**: the `d` attribute
of the strokes, in a fixed coordinate space, and nothing else. A few hundred bytes that
scale onto the Excel export and a printed sheet without going fuzzy.

- The pad is an inline `<svg viewBox="0 0 600 300">` with `<path>` elements, drawn with
  **Pointer Events** — so a finger, a stylus and a mouse are **one code path**, not three —
  and `touch-action: none`, so a drag across it draws instead of scrolling the page.
- Points are mapped into the viewBox, rounded to one decimal place, and clamped; a point
  within `MIN_POINT_DISTANCE` of the previous one is dropped, which is what keeps a
  signature a few hundred bytes rather than a few thousand.
- The stored grammar is a whitelist — `M`, `L`, digits, a dot and single spaces — so what
  goes into the column cannot be markup, cannot be a `<script>` and cannot be a `data:`
  URL. Every stroke must have at least one `L`: **a dot is not a signature**, and that rule
  lives in the pattern rather than in an extra check.
- `SIGNATURE_MAX_POINTS` (400) caps the client; `SIGNATURE_MAX_CHARS` (6000) is the
  server's backstop for a forged body. The client cap is the one a person meets, and it
  says so — `That is as much as this signature can hold. Clear it and sign again.` —
  rather than silently dropping the end of a stroke.
- **Reopening clears it.** A signature that survives an edit is worthless.

What is drawn is what is stored: the pad renders the same `d` strings it submits, so there
is no raster-to-vector step in which the two could differ.

### 3. Invariant 2 — the snapshot, written once

At submit, inside one transaction, every line whose `unitPriceSnapshot` **is null** is set
to the `unitPrice` of the `ItemPrice` whose `effectiveFrom` is the latest date **on or
before `countDate`** — `selectCurrentPrice` from `src/server/items/price-selection.ts`, the
same function the item master's `Current` badge uses, so the screen and the snapshot cannot
disagree about what "the price" was.

A line that **already holds** a snapshot is never touched again, by anything, ever. That is
the whole of Invariant 2, and it is what makes a reopen safe (AC-19).

A line whose item has **no** `ItemPrice` in force on `countDate` keeps `unitPriceSnapshot =
null`. Invariant 4: it contributes `0` to the total and **raises a warning**. Two spellings
were considered and one rejected:

| | Why |
|---|---|
| Write `0` | Makes "no price" indistinguishable from "the price was zero" forever, and asserts a price nobody set. Rejected |
| **Leave `null`** ✅ | `null` means exactly what it means — no price was in force — the value computation reads it as `0`, the warning is derivable from the column itself, and an `ItemPrice` added later can still fill it on a re-submit |

**This feature is therefore the first writer and the first reader of
`unitPriceSnapshot`,** so 006 AC-31's permitted-module list must be amended. It is amended
the way that list has always been amended: **as an exact list of files, never a directory
exemption** (AC-26).

### 4. Invariant 3 — immutable, and what that means concretely

"Immutable" is not a comment. It is six refusals, each with a named error and a named
message, asserted column by column (AC-17):

| Write | Refused with | Message |
|---|---|---|
| `saveQuantities` on a `SUBMITTED` or `APPROVED` count | `ConflictError` → 409 | `This count has been submitted and can no longer be edited.` (008, unchanged) |
| `POST /api/counts/<id>/lines` | 409 | the same |
| `submitCount` on a `SUBMITTED` count | `ConflictError` | `This count has already been submitted.` |
| `submitCount` on an `APPROVED` count | `ConflictError` | `This count has already been approved.` |
| `approveCount` on a `DRAFT` count | `ConflictError` | `This count has not been submitted yet.` |
| `approveCount` on an `APPROVED` count | `ConflictError` | `This count has already been approved.` |

And nothing anywhere deletes a `StockCount` or a `StockCountLine` — 007's rule, carried
forward and re-asserted.

**The only permitted transition out of `APPROVED` is an audited reopen by an `ADMIN`.**

### 5. Part 6 — `YARD_STAFF` submits, and never approves

`submitCount` calls `assertUser`. `approveCount` and `reopenCount` call
`assertRole(actor, "ADMIN")` and raise `ForbiddenError` with `ADMIN is required for this
action` — the message 006 AC-4 already pins for the seventeen item-master mutations. The
refusal is at the **service**, proved in a `*.db.test.ts` with no browser involved; the
screen not rendering the control is a second, weaker fact asserted alongside it, and
`/summary` and `/reopen` are additionally refused at the **route** with a `307`, so there
are three independent layers and the innermost one is the one the criterion names.

## The money boundary, at its hardest point

#8 carried no money for either role. #9 has to show an `ADMIN` a total and per-line `No
price` warnings, and show a `YARD_STAFF` user none of it. The resolution is a deliberate
split, and it keeps Part 6's *"Stock Takes is money-free for **both** roles"* literally
true rather than nearly true:

| Surface | Reachable by | Carries |
|---|---|---|
| `/stock-entry/counts/[id]` | both roles | **No euro, for either role.** Item, quantity, unit, status, who signed and when, the signature itself, and a reopen notice. `getCount`'s shape is **unchanged** by this feature |
| `/stock-entry/counts/[id]/submit` | both roles | **No euro, for either role.** For an `ADMIN` only: `itemsWithoutPrice` and the list of which items they are, so a warning is a list of names rather than a number. This is the shared screen `shapeForRole` exists for |
| `/stock-entry/counts/[id]/summary` | **`ADMIN` only, 307 for staff** | Every euro in this feature: the unit price per line, the line value, the count total, the `No price` tag, and *Approve this count* |
| `/stock-entry/counts/[id]/reopen` | **`ADMIN` only, 307 for staff** | No euro. What reopening destroys, and a required reason |

So the money-key walk of `docs/verification.md` Level 3b runs on **three** surfaces with
three different expected answers, all of them exact (AC-21, AC-22):

- staff, any surface it can reach: **zero** offenders at any depth;
- admin, `getCount`: **exactly** `itemsWithoutPrice` — unchanged from 007 AC-17, so that
  criterion passes **unmodified**;
- admin, `getCountForSubmit`: **exactly** `{ itemsWithoutPrice, linesWithoutPrice }`, and
  neither is a euro figure;
- admin, `getCountSummary`: **exactly**
  `{ itemsWithoutPrice, linesWithoutPrice, unitPriceSnapshot, lineValue, countTotal, noPrice }`
  — asserted as a set, so a seventh money-shaped key turns it red.

**TypeScript does not protect this.** #8 proved it: a `currentPrice` added to the staff
shape typechecked cleanly, exit 0, twice, and six scans caught it. So every guarantee here
is an assertion over a value or a response body, never a type (AC-34).

### What each role sees, in three moments

|  | `YARD_STAFF` | `ADMIN` |
|---|---|---|
| **At submit** | The review, the uncounted list, the pad, *Sign and submit*. No euro, no `No price` | The same, **plus** `11 items on this sheet have no price recorded…` and the list of which items |
| **At approval** | Nothing. `/summary` is a `307` and there is no approve control in its DOM | The valued summary: per-line price and value, `No price` tags, the total, *Approve this count* |
| **Afterwards** | `/stock-entry/counts/<id>`: item, quantity, unit, `Approved`, `Signed by Jo Byrne on 1 September 2026.`, `Approved by Ann Doyle on 2 September 2026.`, and the signature rendered. **Part 6's row, exactly** | The same page, identical markup, plus the link to `/summary` |

## User stories

- As a **YARD_STAFF** user who has finished walking the yard, I sign with my finger on the
  phone — **after** the counting, not before — and submit, and the count stops being mine.
- As a **YARD_STAFF** user who thought I had finished, I am told *how many* rows nobody
  counted and *which* ones, and one tap takes me to the first of them, even though I had
  filtered the sheet down to two suppliers an hour ago.
- As a **YARD_STAFF** user, I can open the count I submitted and see what I recorded — item,
  quantity, unit — and my own signature on it. I see no price, no value and no total, here
  or anywhere.
- As an **ADMIN**, before I approve I see what this count is worth, which lines had no price
  and therefore valued at zero, and who signed it — because approving a number I have not
  seen is not approving.
- As an **ADMIN**, I approve a count and it becomes immutable: nobody can edit a quantity,
  and no later price-list change can alter what it was worth.
- As an **ADMIN**, when something is wrong I reopen the count, giving a reason. It goes back
  to `DRAFT`, the signature is destroyed and a fresh one will be demanded — and the yard can
  see why I reopened it, because they are the ones who have to walk it again.
- As the **owner**, I can be sure that editing a supplier price tomorrow does not change what
  last month's stock was worth, because the price is on the line and was written once.
- As the **accountant**, the signature on the count is real path data, so it scales onto the
  Excel export and a printed sheet at #12 without turning into a smudge.

## Data touched

| Model | Read | Written |
|---|---|---|
| `StockCount` | yes | `status`, `submittedAt`, `signedById`, `signedAt`, `signatureSvg`, `approvedById`, `approvedAt`, `notes` — **update only** |
| `StockCountLine` | yes | **`unitPriceSnapshot` only**, and only where it is currently `null` |
| `ItemPrice` | yes — through `selectCurrentPrice`, as of `countDate` | never |
| `Item`, `ItemLocation`, `Supplier`, `ItemType`, `Location`, `User` | yes | never |

`quantity`, `note`, `countDate`, `periodYear`, `periodMonth`, `locationId` and
`createdById` are written by **nothing** in this feature. No row is inserted and no row is
deleted anywhere.

**No new field on any table, and no migration** (AC-30).

**New types, in modules that hold no runtime**: `src/types/stock-count.ts` gains
`CountLifecycleFacts`, `AuditEntry`, `SubmitReviewForStaff`, `SubmitReviewForAdmin`,
`CountSummaryForStaff`, `CountSummaryForAdmin` and `SubmitCountInput`. `CountForStaff`,
`CountForAdmin`, `CountLineRow` and `SaveQuantitiesResult` are **unchanged**, which is why
007 AC-17 and 008 AC-17 pass unmodified.

## Contract

### Routes — three new, all `export const dynamic = "force-dynamic"`

| Route | Guard | What it is |
|---|---|---|
| `/stock-entry/counts/[id]/submit` | `requireUserPage()` | **Review and sign.** The uncounted list when blocked; otherwise the pad and *Sign and submit*. Once the count is not a `DRAFT`, the signed record, read-only |
| `/stock-entry/counts/[id]/summary` | `requireAdminPage("count-summary")` | **The valued summary.** Price, value, `No price`, the total, the audit trail, and *Approve this count* while `SUBMITTED` |
| `/stock-entry/counts/[id]/reopen` | `requireAdminPage("count-reopen")` | **What reopening destroys**, a required reason, *Reopen this count*. `GET` changes nothing |

`/stock-entry/counts/[id]` is extended, not replaced: a `DRAFT` gains a *Review and sign*
link; anything else renders #8's read-only rows plus the signature, the lifecycle sentences
and — for an `ADMIN` — the link to `/summary`.

`src/lib/auth-config.ts` and `src/middleware.ts` are **byte-identical**: the matcher already
covers `/stock-entry/:path*`.

### Server actions — `src/app/stock-entry/actions.ts`

Three more, alongside `startCountAction` and `saveQuantitiesAction`, each obtaining its
actor with exactly one `await requireUser()` and calling exactly one service:

```ts
submitCountAction(prevState, formData)    // countId, signature
approveCountAction(prevState, formData)   // countId
reopenCountAction(prevState, formData)    // countId, reason
```

There is no JSON endpoint for any of them, and no `fetch` from the browser: each is one
deliberate act, and a `<form>` posting to a server action is the transport that still works
when the bundle does not.

### Services and pure modules

| Module | Exports | Touches Prisma |
|---|---|---|
| `src/server/counts/count-lifecycle-service.ts` | `submitCount`, `approveCount`, `reopenCount`, `getLifecycleFacts` | yes — **the only writer** |
| `src/server/counts/count-summary-service.ts` | `getCountForSubmit`, `getCountSummary` | yes — read only |
| `src/server/counts/submit-input.ts` | `parseSubmitCountInput`, `parseReopenReason` | no — **pure** |
| `src/lib/signature-path.ts` | `SIGNATURE_VIEWBOX`, `SIGNATURE_WIDTH`, `SIGNATURE_HEIGHT`, `SIGNATURE_PATH_PATTERN`, `SIGNATURE_MAX_CHARS`, `SIGNATURE_MAX_POINTS`, `MIN_POINT_DISTANCE`, `parseSignaturePath`, `strokesToPath`, `pointInViewBox` | no — **pure** |
| `src/lib/count-lifecycle.ts` | `isDraft`, `isSubmitted`, `isApproved`, `canSubmit`, `canApprove`, `canReopen` | no — **pure** |
| `src/lib/count-audit.ts` | `AUDIT_EVENTS`, `auditLine`, `appendAuditLine`, `parseAuditLines`, `latestAudit` | no — **pure** |
| `src/lib/money.ts` | *(extended)* `multiplyDecimal`, `sumDecimals`, `roundHalfUp` | no — **pure** |
| `src/lib/count-messages.ts` | *(extended)* every literal a criterion quotes | no — **pure** |

**`signature-path.ts` lives in `src/lib/`, deliberately.** `docs/architecture.md` records a
named `components → server` exception for #8's `quantity-input.ts` and `entry-filters.ts`
and says in terms: *"If a third such module appears, the better answer is to move all of
them under `src/lib/`."* The signature pad and the service must share one grammar, so this
would have been the third. Putting it in `src/lib/` from the start needs **no exception at
all** — it imports only `@/lib/count-messages` and `@/server/errors`, which is the
permitted `lib → errors` exception #5 established — and leaves #8's two modules untouched
(AC-31).

Seven pure modules are why a third of these criteria run in `npm run test:unit` with no
database.

### Components

`src/components/stock-entry/SignaturePad.tsx` (`"use client"`) — the pad, the point
reduction and the hidden `signature` field. `src/components/stock-entry/ValuedLines.tsx`
renders the admin summary's table. Neither imports anything from `src/server/`.

### Shapes

```ts
/** Carries no money at all, so it has ONE shape for both roles (AC-21). */
type CountLifecycleFacts = {
  countId: string;
  status: CountStatus;
  submittedAt: string | null;       // ISO instant
  signedByName: string | null;
  signedAt: string | null;
  signaturePath: string | null;     // the exact stored `d`, byte for byte
  approvedByName: string | null;
  approvedAt: string | null;
  signedAndApprovedBySamePerson: boolean;
  audit: AuditEntry[];
};

type AuditEntry = {
  at: string;                       // ISO instant
  event: "SUBMITTED" | "APPROVED" | "REOPENED";
  actorName: string;
  actorEmail: string;
  reason: string | null;            // REOPENED only
};

type UncountedLine = { itemId: string; description: string; unitLabel: string | null };

type SubmitReviewForStaff = {
  countId: string;
  locationName: string;
  periodKey: string;
  periodLabel: string;
  countDate: string;                // "YYYY-MM-DD"
  status: CountStatus;
  lineCount: number;
  countedLineCount: number;
  uncountedLineCount: number;
  /** Every uncounted line, in sheet order. Never truncated, never filtered. */
  uncounted: UncountedLine[];
  lifecycle: CountLifecycleFacts;
};

type SubmitReviewForAdmin = SubmitReviewForStaff & {
  itemsWithoutPrice: number;
  /** Which ones. A warning that names the items is actionable; a number is not. */
  linesWithoutPrice: { itemId: string; description: string }[];
};

type ValuedLine = {
  itemId: string;
  description: string;
  unitLabel: string | null;
  quantity: string | null;
  /** Decimal STRING or null. Null is Invariant 4: no ItemPrice was in force. */
  unitPriceSnapshot: string | null;
  /** `quantity × (unitPriceSnapshot ?? 0)`, exact, computed on read (Invariant 1). */
  lineValue: string;
  noPrice: boolean;
};

/** ADMIN ONLY. `/summary` is a 307 for a staff session, and this shape is never built. */
type CountSummaryForAdmin = {
  countId: string;
  locationName: string;
  periodLabel: string;
  countDate: string;
  status: CountStatus;
  lines: ValuedLine[];
  /** Σ lineValue, exact, unrounded. Rendered rounded; stored nowhere (Invariant 1). */
  countTotal: string;
  itemsWithoutPrice: number;
  linesWithoutPrice: { itemId: string; description: string }[];
  lifecycle: CountLifecycleFacts;
};

type SubmitCountInput = { signaturePath: string };
```

`CountSummaryForStaff` exists and is `never`-shaped in practice: `getCountSummary` raises
`ForbiddenError` for a staff actor rather than returning a reduced object, because there is
no money-free thing this function could usefully answer — that is `getCount`'s job, and it
already exists. The staff branch of `shapeForRole` here **throws**, and a criterion asserts
the admin builder is called zero times for a staff actor (AC-22).

### The rules this contract encodes

**The value is derived, every time, and rounded only for display.** `lineValue` and
`countTotal` cross the boundary as exact decimal strings; the screen renders
`formatPriceExact(roundHalfUp(v, 2))`. The total is the sum of the **exact** line values,
rounded once — not the sum of the rounded lines. Invariant 10 is the reason: four Clonmel
prices are non-terminating workbook formulas, and *"a stock system that disagrees with the
file it replaced, by any amount, will not be trusted."* The consequence is stated rather
than hidden: the rendered column may not add to the rendered total to the last cent, and
the total is the correct figure. See *Open questions* 3.

**No JavaScript `number` touches money or a quantity, anywhere on this path.**
`multiplyDecimal`, `sumDecimals` and `roundHalfUp` are string arithmetic. `roundHalfUp
("2.675", 2)` is `"2.68"`; `Number(2.675).toFixed(2)` is `"2.67"`, and that one cent is the
whole argument (AC-24).

**Approval is a compare-and-set, and so is submission.** Each write is
`updateMany({ where: { id, status: <the only status it may leave> }, … })` with an assertion
that exactly one row matched. Two phones submitting at once therefore produce one
submission and one `ConflictError`, without a lock (AC-13).

**The actor is the session, never a field.** As 007 AC-4 and 008 AC-19 established, and
re-asserted here for three more actions.

## The audit record, given the schema #4 shipped

There is **no audit table**, and #9 does not add one. `specs/domain-model.md` Part 3 is the
schema field for field — 004 AC-1 asserts it — so a `StockCountEvent` model would require
amending the domain model, writing a migration, adding an entry to `TRUNCATED_TABLES` and
touching 020 AC-4, for a feature whose own columns already exist. That is a decision for
the user, not a side effect of this one (*Open questions* 6).

So an audit record is three things:

1. **The columns.** `submittedAt`, `signedById`, `signedAt` record the submission;
   `approvedById`, `approvedAt` record the approval. They are the primary record while the
   count holds them.
2. **`StockCount.notes`, append-only, one line per event**, in a format built and parsed by
   one pure module so the writer and the reader cannot drift:

   ```
   2026-09-12T14:03:11.482Z SUBMITTED by Jo Byrne <jo@macroads.ie>
   2026-09-12T14:20:02.001Z APPROVED by Ann Doyle <ann@macroads.ie>
   2026-09-12T15:02:44.900Z REOPENED by Ann Doyle <ann@macroads.ie>: the MMA price was wrong
   ```

   This is what survives a reopen. Reopening nulls `approvedById`, `approvedAt`,
   `signedById`, `signedAt`, `submittedAt` and `signatureSvg`, so without these lines there
   would be **no record at all** that the count had ever been approved, or by whom, or why
   it was undone. The reason is validated to one line of 1–200 characters, precisely so a
   newline cannot forge a second audit entry.
3. **A log line** through `src/lib/log.ts`: `logWarn("count.reopened", { countId, actorId,
   previousStatus })`. A reopen is the one operation here that destroys information, and it
   is the one that belongs in the server log as well as in the row.

## UI states

- **Empty.** A count with no lines cannot exist (007 AC-13); `/submit` renders `This count
  has no items.` and no submit control if one is ever reached. A count with nothing
  uncounted renders no blocked list at all, not an empty one. A count with no audit lines
  yet renders no audit block.
- **Loading.** Still **no `loading.tsx`** at or above `src/app/stock-entry/` (007 AC-3: a
  Suspense boundary degrades a server-side `redirect()` from a 307 into a 200). *Sign and
  submit*, *Approve this count* and *Reopen this count* each show a pending state and
  cannot be submitted twice; the compare-and-set is the backstop.
- **Error.** A `ValidationError` renders inline beside the field it names, keeping the drawn
  signature on screen — a rejected submission must never make somebody sign twice for a
  reason that was not the signature. A `ConflictError` renders above the form with a link to
  reload the count. Neither ever shows a Prisma or Postgres string. Anything else reaches
  the shared error boundary from #2.
- **Success.** Each action **redirects** — submit to `/stock-entry/counts/<id>`, approve to
  `/stock-entry/counts/<id>/summary`, reopen to `/stock-entry/counts/<id>` — and every new
  value is read from the freshly rendered page rather than from client state.
- **No JavaScript.** `/submit` renders the review and the uncounted list normally, and in
  place of the pad renders `A signature is drawn on screen, so this step needs JavaScript.
  Open this count in a browser with JavaScript enabled to sign it.` and **no** submit
  control. Approve and reopen are ordinary forms and work with the bundle disabled.

## Acceptance criteria

Tests that touch only `signature-path.ts`, `count-lifecycle.ts`, `count-audit.ts`,
`money.ts`, `submit-input.ts` or `count-messages.ts` are `*.test.ts` and run in
`npm run test:unit` with no database. Tests that write are `*.db.test.ts` under
`src/server/counts/`, call `resetTestDb()` in `beforeEach` and build their own fixture.
Browser-level criteria are Playwright specs named `tests/e2e/stock-entry-*.spec.ts`, which
is what places them in the `chromium-stock-entry` project.

1. **AC-1** — **The three new routes are closed to a signed-out request, two of them are closed to a staff session at the route, and no route protection is added.** An unauthenticated `GET` of each of `/stock-entry/counts/<id>/submit`, `/stock-entry/counts/<id>/summary` and `/stock-entry/counts/<id>/reopen` responds `307` (or `302`) to `/sign-in?callbackUrl=<the URL-encoded path>` and sends none of the page's content. Signed in as `YARD_STAFF`, `/submit` returns `200` while `/summary` responds `307` to `/stock-entry?denied=count-summary` and `/reopen` responds `307` to `/stock-entry?denied=count-reopen`, each sending no part of the page body — asserted on the raw response, not on the rendered DOM — and `/stock-entry` then renders #3's `ACCESS_DENIED_MESSAGE` in `data-testid="access-denied"`. Signed in as `ADMIN`, all three return `200`. `src/lib/auth-config.ts` and `src/middleware.ts` are **byte-identical** to their state before this feature, and `tests/unit/hashing-boundary.test.ts` stays green unchanged. No `loading.tsx` exists at or above `src/app/stock-entry/` in the shipped tree (007 AC-3).
2. **AC-2** — **Every lifecycle function takes an explicit actor, and a null actor writes nothing.** `submitCount`, `approveCount`, `reopenCount`, `getLifecycleFacts`, `getCountForSubmit` and `getCountSummary` each take `actor: SessionUser` as their first parameter and begin with `assertUser` or `assertRole`; called with a `null` actor each raises `UnauthorizedError`, and after all six refusals every column of the `StockCount` row and of all 82 `StockCountLine` rows is unchanged. The actor comes from `requireUser()` / `requireUserPage()` / `requireAdminPage()` and from nowhere else: a source scan of `src/app/stock-entry/actions.ts` finds exactly **five** `await requireUser()` calls, one inside each of the five actions, and finds no read of `role`, `actor`, `actorId`, `userId`, `createdById`, `signedById` or `approvedById` from a `FormData`.
3. **AC-3** — **Invariant 5: one uncounted line blocks submission, at the service.** On a count of 82 lines with 12 quantities left `null` and a valid signature supplied, `submitCount` raises `ValidationError` whose `field` is `lines` and whose message is exactly `12 items have not been counted. Every line must hold a number, or 0, before this count can be submitted.`; the row's `status` is still `DRAFT`, and `submittedAt`, `signedById`, `signedAt`, `signatureSvg` and `notes` are all still `null`, and every line's `unitPriceSnapshot` is still `null`. With exactly one line left `null` the message is `1 item has not been counted. Every line must hold a number, or 0, before this count can be submitted.`. **A line holding `0` does not block:** a count whose 82 lines are 47 positive quantities and 35 zeros submits successfully, which is the single most important half of this criterion because 35 of 82 is what the most recent Dublin count actually looks like. `uncountedBlocksSubmit(12)` and `(1)` are asserted from `src/lib/count-messages.ts` with no database.
4. **AC-4** — **The way from blocked to submittable, including out of a filtered view.** When blocked, `/stock-entry/counts/<id>/submit` renders `data-testid="uncounted-list"` holding exactly **12** `data-testid="uncounted-line"` entries, one per uncounted line, in `ItemLocation.sortOrder` then `description` order, each carrying the item description and its unit label (or `No unit`), and each an anchor whose `href` is exactly `/stock-entry/counts/<id>#line-<itemId>` — **with no query string**. The list is never truncated and carries no "show more" control. Following one lands on the counting screen with **no filter applied**, and the row with `id="line-<itemId>"` is present in the DOM and scrolled into the viewport. **The blocked list is identical with and without a filter**: navigating to `/stock-entry/counts/<id>?supplier=Kelly&type=Thermo-P` first, then to `/submit`, renders the same 12 entries in the same order — `getCountForSubmit` reads no query parameter, asserted by its signature taking only `actor` and `countId`. The counting screen's *Review and sign* control is present and **not disabled** even when the count is blocked, asserted directly on the `disabled` property. #8's filter contract is untouched: `/stock-entry/counts/<id>` still ignores any parameter that is not `supplier`, `type` or `unit` (008 AC-22, unmodified), because this feature adds none.
5. **AC-5** — **The signature grammar is pure, is a whitelist, and a dot is not a signature.** `src/lib/signature-path.ts` is unit-tested with no database and no browser. `SIGNATURE_VIEWBOX` is `"0 0 600 300"`, `SIGNATURE_WIDTH` is `600`, `SIGNATURE_HEIGHT` is `300`, `SIGNATURE_MAX_CHARS` is `6000` and `SIGNATURE_MAX_POINTS` is `400`, each a named exported constant. `parseSignaturePath` returns the trimmed string unchanged for `"M 10 10 L 20 20"`, for `"M 10.5 10.5 L 20 20.1 L 30 40 M 100 100 L 120 130"` and for a 3-stroke 380-point path built by `strokesToPath`. It raises `ValidationError` with `field === "signature"` and the message `Draw your signature before submitting this count.` for `""`, `"   "`, `null` and `undefined`; and `That signature could not be read. Clear it and sign again.` for `"M 10 10"` (**one point is a dot, not a signature — refused by the pattern, which requires at least one `L` per stroke**), `"M10 10L20 20"` (no spaces), `"m 10 10 l 20 20"` (lowercase), `"M 10 10 C 1 2 3 4 5 6"` (a command outside the whitelist), `"M 10 10 L 20 20.55"` (two decimal places), `"M -1 10 L 20 20"` (a sign), `"M 10 10 L 700 20"` (x beyond `SIGNATURE_WIDTH`), `"M 10 10 L 20 400"` (y beyond `SIGNATURE_HEIGHT`), `"M 10 10 L 20 20  L 30 30"` (a double space), `'<svg onload="x"/>'`, `"M 10 10 L 20 20 <script>alert(1)</script>"` and `"javascript:alert(1)"`; and `That signature is too long to store. Clear it and sign again.` for a syntactically valid path of `SIGNATURE_MAX_CHARS + 1` characters, while one of exactly `SIGNATURE_MAX_CHARS` characters is accepted. `pointInViewBox({ left, top, width, height }, clientX, clientY)` is pure: it maps a client point into viewBox units, rounds to **one** decimal place and clamps to `[0, 600] × [0, 300]`, so a pointer released outside the pad yields an in-bounds point rather than an invalid path.
6. **AC-6** — **Invariant 11: no signature, no submission — and the button is not the guard.** On a fully counted count, `submitCount(actor, id, { signaturePath: "" })` raises `ValidationError` with `field === "signature"` and the message above, and the row's `status`, `submittedAt`, `signedById`, `signedAt`, `signatureSvg` and `notes` are all unchanged; the same holds for `"   "`, for `"M 10 10"` and for a 6001-character path. `submitCountAction` invoked with the `signature` field **absent from the `FormData` entirely** produces the same `ValidationError` and writes nothing. At the browser, on a 390 px viewport, *Sign and submit* is rendered and **enabled** before anything is drawn — asserted on the `disabled` property — and pressing it renders `Draw your signature before submitting this count.` beside the pad, leaves the count a `DRAFT`, and does not navigate. This is `docs/verification.md` Level 3c read literally: the rejection is the service's, and the screen is a courtesy.
7. **AC-7** — **The signature round-trips intact, byte for byte.** A submitted count's `signatureSvg`, read straight from Postgres, is **exactly equal** to the string passed to `submitCount` — same length, same characters, no escaping, no trimming beyond the parser's own trim, no re-serialisation — for a 3-stroke path containing decimals, and for a 390-point path near the size limit. `getLifecycleFacts` returns it as `signaturePath` with the same equality, and `/stock-entry/counts/<id>` renders `data-testid="signature"` as an inline `<svg>` whose `viewBox` attribute is exactly `0 0 600 300` and which contains one `<path>` per stroke whose `d` attributes, joined by a single space, equal the stored string exactly. End to end: a signature drawn with real pointer input, submitted, then read from the database, matches `SIGNATURE_PATH_PATTERN`, holds at least two points, and reloading the page renders the same `d`. `signedById` is the submitting session's user id and `signedAt` is within 30 s of the submission.
8. **AC-8** — **One code path for a finger, a stylus and a mouse — and what the pad stores is what it shows.** `SignaturePad.tsx` registers exactly three listeners — `pointerdown`, `pointermove`, `pointerup` (plus `pointercancel` mapped to the same handler as `pointerup`) — and registers **no** `touchstart`, `touchmove`, `mousedown` or `mousemove` listener, asserted by source scan. The pad element carries `touch-action: none`. On the desktop project, drawing with `page.mouse` produces a path matching `SIGNATURE_PATH_PATTERN`; in a touch-enabled 390 px context, the same gesture with `page.touchscreen` produces one too, and the two are produced by the same component with no branch on input type. A second stroke after lifting starts a new `M`, so the stored path holds exactly two `M` commands. *Clear*, `data-testid="clear-signature"`, empties the pad, empties the hidden `signature` field, and re-enables drawing. Drawing more than `SIGNATURE_MAX_POINTS` points stops recording and renders `That is as much as this signature can hold. Clear it and sign again.`, and the resulting value is still a valid path under `SIGNATURE_MAX_CHARS` — so the client cap keeps the server cap unreachable in ordinary use, asserted by a test that emits 600 pointer moves and finds at most 400 points and fewer than 6000 characters. Points closer together than `MIN_POINT_DISTANCE` are dropped, asserted by a pure test of the reducer: 200 collinear points 0.5 units apart reduce to fewer than 60.
9. **AC-9** — **Phone-first, and this is the step the whole constraint was written for: a finger at 390 px.** At a 390 × 844 viewport with touch enabled, signed in as `YARD_STAFF`, the whole flow completes — `/stock-entry/counts/<id>` → *Review and sign* → draw with `page.touchscreen` → *Sign and submit* → the submitted count page — and at **every** step `document.documentElement.scrollWidth` does not exceed its `clientWidth`. The pad's bounding box is at least **320 × 150** CSS px and lies entirely within the viewport's horizontal bounds. **A 200 px drag across the pad draws and does not scroll the page:** `window.scrollY` is identical before and after the gesture, and the hidden `signature` field gains at least two points — the single assertion this constraint exists for. *Clear* and *Sign and submit* each have a bounding box of at least 44 × 44 CSS px and the primary action is visible without horizontal scrolling. At a 320 px viewport the document still does not scroll sideways on any of `/submit`, `/summary` and `/reopen`, and the pad is still at least 260 px wide. The same three routes are checked at 390 px for an `ADMIN`, with the valued table present, because a table is what overflows.
10. **AC-10** — **It fails honestly with no JavaScript, and approve and reopen do not need it.** In a browser context created with `javaScriptEnabled: false`: `/stock-entry/counts/<id>/submit` returns `200`, renders the review and the uncounted list exactly as it does with the bundle, renders `A signature is drawn on screen, so this step needs JavaScript. Open this count in a browser with JavaScript enabled to sign it.` in `data-testid="signature-needs-js"`, and renders **no** submit control — asserted by the absence of any element whose accessible name is `Sign and submit`. In the same context an `ADMIN` completes `/summary` → *Approve this count* and `/reopen` → a typed reason → *Reopen this count*, both persisting and re-rendering from the server, because both are ordinary forms posting to server actions.
11. **AC-11** — **Invariant 2: the snapshot is written once, at submit, from the price in force on `countDate`.** For a count with `countDate = 2026-06-15` and an item carrying three `ItemPrice` rows at `effectiveFrom` `2025-01-01`, `2026-06-15` and `2026-07-01`, submission writes `unitPriceSnapshot` equal to the `2026-06-15` row's price — **a price effective exactly on `countDate` is in force on `countDate`** — and never the `2026-07-01` row's. The selection goes through `selectCurrentPrice` from `src/server/items/price-selection.ts` and no module re-implements it, asserted by source scan finding no second `effectiveFrom` comparison outside that file. Precision is exact: a price of `6.11764706` — one of the four Clonmel workbook formulas — reads back from `unitPriceSnapshot` with `.toString() === "6.11764706"`, with no rounding and no JavaScript `number` on the path. **After submission the snapshot is inert:** adding a new `ItemPrice` with an earlier, later or identical `effectiveFrom`, editing the item, archiving the item, and approving the count each leave every `unitPriceSnapshot` on the count byte-identical, asserted by comparing all 82 values before and after each of the four operations.
12. **AC-12** — **Invariant 4: a line with no price values at zero and says so, and is never silently zero-valued stock.** On a fixture where 3 of 82 Dublin items have no `ItemPrice` in force on `countDate`, submission leaves those three lines' `unitPriceSnapshot` **`null`** — not `0` — and writes the other 79. `getCountSummary` gives each of the three `noPrice === true`, `lineValue === "0"`, and lists them in `linesWithoutPrice` with their `itemId` and `description`; `itemsWithoutPrice === 3`. The `/summary` page renders `No price` in `data-testid="no-price"` on exactly those three rows and on no others, renders their value cell as `€0.00`, and renders `3 lines on this count have no price recorded and counted as zero.` above the table; with one such line the sentence is `1 line on this count has no price recorded and counted as zero.`. Before submission, the `ADMIN` half of `/submit` renders #7's `itemsWithoutPriceMessage` — `3 items on this sheet have no price recorded. Their lines will count as 0 when this count is submitted.` — together with `data-testid="lines-without-price"` naming those three items; the `YARD_STAFF` half renders neither, and no `No price` string at all (AC-21).
13. **AC-13** — **Submission is one transaction and one compare-and-set.** `submitCount` performs the status write and all 82 snapshot writes inside a single `db.$transaction`: a test that makes the snapshot write fail — a `tmp_ac13_snapshot_check` `CHECK` on `StockCountLine`, added and dropped in the same test, behind the helper 007's reviewer asked for in `src/server/test-db.ts` — leaves the count at `DRAFT` with `submittedAt`, `signedById`, `signedAt` and `signatureSvg` all `null` and every `unitPriceSnapshot` `null`, and a control run immediately afterwards with the constraint dropped submits and writes all 82. The status write is `updateMany({ where: { id, status: <DRAFT> } })` and the service asserts exactly one row matched, so two concurrent `submitCount` calls on the same count produce exactly one `SUBMITTED` row, one `ConflictError` with the message `This count has already been submitted.`, one set of snapshots, and a `signedById` equal to the winner's; the loser's signature is not stored. No lock and no version token: a source scan finds no `FOR UPDATE` and no `version` field.
14. **AC-14** — **What submission writes, and the long list of what it does not.** After `submitCount`, the row's `status` is the value whose label is `Submitted`, `submittedAt` is within 30 s of now, `signedById` is the actor's id, `signedAt` equals `submittedAt`, `signatureSvg` is the parsed path, and `notes` holds exactly one audit line. `approvedById` and `approvedAt` are still `null`. `locationId`, `periodYear`, `periodMonth`, `countDate` and `createdById` are byte-identical to before. On every line, `id`, `stockCountId`, `itemId`, `quantity` and `note` are byte-identical, and the only column that changed is `unitPriceSnapshot`. Row counts of `StockCount`, `StockCountLine`, `Item`, `ItemPrice`, `ItemLocation`, `Supplier`, `ItemType`, `Location` and `User` are identical before and after every test in this feature: **this feature inserts nothing and deletes nothing.**
15. **AC-15** — **Part 6: `YARD_STAFF` submits and never approves, and the refusal is the service's.** `submitCount` accepts a `YARD_STAFF` actor and succeeds, at either yard, whoever created the count. `approveCount(staffActor, id)` and `reopenCount(staffActor, id, reason)` each raise `ForbiddenError` whose message is exactly `ADMIN is required for this action` — the string 006 AC-4 pins — and after both refusals every column of the `StockCount` row and of all 82 lines is unchanged and `notes` has gained no line. In the browser, a staff session's `/stock-entry/counts/<id>` and `/submit` contain **no** element whose accessible name is `Approve this count` or `Reopen this count` and no link whose `href` ends `/summary` or `/reopen`; and a staff session posting the approve server action directly — with the action reference captured from an `ADMIN` render, plus the form field `role=ADMIN` — leaves the count `SUBMITTED` with `approvedById === null`. The service assertion is the criterion; the two browser assertions are corroboration, and the criterion fails if the service one is removed.
16. **AC-16** — **Approval, its conflicts, and self-approval permitted but recorded.** `approveCount(admin, id)` on a `SUBMITTED` count sets `status` to the value labelled `Approved`, `approvedById` to the admin's id and `approvedAt` to within 30 s of now, appends one `APPROVED` audit line, and changes **nothing else** — every other column of the count and every column of every line, including all 82 `unitPriceSnapshot` values, byte-identical. On a `DRAFT` count it raises `ConflictError` with `This count has not been submitted yet.`; on an already-`APPROVED` count, `This count has already been approved.`; on a count id that does not exist, `NotFoundError` with `That count no longer exists.`. The write is a compare-and-set on the submitted status, so two concurrent approvals yield one `APPROVED` row and one `ConflictError`. **An `ADMIN` who signed a count may approve it**: the call succeeds, `approvedById === signedById`, `signedAndApprovedBySamePerson` is `true`, and both `/summary` and `/stock-entry/counts/<id>` render `Signed and approved by the same person.` — a fact recorded rather than a rule that a two-person team could not obey (*Open questions* 2).
17. **AC-17** — **Invariant 3: what "immutable" means, enumerated, with a full-row comparison after each refusal.** Against an `APPROVED` count, each of these is refused and writes nothing: `saveQuantities` raises `ConflictError` with `This count has been submitted and can no longer be edited.` (008 AC-9's message, unchanged); `POST /api/counts/<id>/lines` returns `409` with that message in `error`; `submitCount` raises `ConflictError` with `This count has already been approved.`; `approveCount` raises `ConflictError` with `This count has already been approved.`; `startCount` for the same yard and period raises `ConflictError` with `Count for DUBLIN in 2026-09 already exists` (007 AC-10, unchanged). After **all five**, a full row read of the `StockCount` and of all 82 `StockCountLine` rows is deeply equal to the read taken before them, `notes` included. `src/server/counts/count-entry-service.ts` is **byte-identical** after this feature and 008 AC-9 passes unmodified. Nothing in this feature deletes a `StockCount` or a `StockCountLine`: the mutation scan of 007 AC-25 as narrowed by 008 AC-28 finds no `.delete`, `.deleteMany`, `.create`, `.createMany` or `.upsert` of either model in any file of either tree, including the two files this feature exempts (AC-26). The `/stock-entry/counts/<id>` page for an `APPROVED` count renders the quantities as text and contains no `input`, `select` or `textarea` inside `data-testid="count-lines"`.
18. **AC-18** — **The reopen: who, when, what it clears, and what it records.** `reopenCount(admin, id, reason)` is permitted on a count that is `SUBMITTED` **or** `APPROVED` and raises `ConflictError` with `This count is already a draft.` on a `DRAFT`. It sets `status` back to `DRAFT` and sets `submittedAt`, `signedById`, `signedAt`, `signatureSvg`, `approvedById` and `approvedAt` **all to `null`** — asserted individually, six columns — and appends one `REOPENED` audit line carrying the reason. `parseReopenReason` is pure and unit-tested: it trims; raises `ValidationError` with `field === "reason"` and `Give a reason for reopening this count.` for `""`, `"   "`, `null` and `undefined`; `A reason may be at most 200 characters.` for 201 characters, while 200 is accepted; and `A reason must be a single line.` for a value containing `\n`, `\r` or ` ` — **precisely so a newline cannot forge a second audit line**. `logWarn("count.reopened", { … })` is called exactly once per successful reopen, asserted with a spy, and carries `countId`, the actor id and the previous status and no reason text. After a reopen the count is editable again: `saveQuantities` succeeds, and `/submit` demands a fresh signature because `signatureSvg` is `null` (AC-6). **A `YARD_STAFF` session sees why:** `/stock-entry/counts/<id>` renders `Reopened by Ann Doyle on 3 September 2026: the MMA price was wrong.` in `data-testid="reopen-notice"`, because the person who has to walk the yard again is the person who needs the reason — and that sentence contains no `€`.
19. **AC-19** — **A reopened count keeps its price snapshots, and a re-submit fills only the gaps.** Submit a count, capture all 82 `unitPriceSnapshot` values, reopen it, and assert **all 82 are byte-identical** — reopening writes no snapshot. Then, before re-submitting: change the `ItemPrice` in force for a priced item by adding a new `ItemPrice` effective on `countDate`, and add a first `ItemPrice` effective on `countDate` for one of the three items that had none. Re-submit. The priced item's snapshot is **unchanged** — Invariant 2: written once, never rewritten, even across a reopen, because the count was priced at what was in force when it was counted and a later correction to the price list is not a correction to history. The previously priceless item's snapshot is **now written**, because a null snapshot was never a written value and Invariant 4's warning was the product asking for exactly this; it drops out of `linesWithoutPrice` and its `noPrice` becomes `false`. A `*.db.test.ts` asserts all three outcomes in one run, and the service's condition is `unitPriceSnapshot IS NULL`, asserted by source scan rather than inferred.
20. **AC-20** — **The audit trail is append-only, single-format, and parses back.** `src/lib/count-audit.ts` is pure and unit-tested with no database: `auditLine({ at: "2026-09-12T14:03:11.482Z", event: "REOPENED", actorName: "Ann Doyle", actorEmail: "ann@macroads.ie", reason: "the MMA price was wrong" })` is exactly `2026-09-12T14:03:11.482Z REOPENED by Ann Doyle <ann@macroads.ie>: the MMA price was wrong`, and without a reason the trailing colon is absent. `appendAuditLine(null, line)` is `line`; `appendAuditLine(existing, line)` is `existing + "\n" + line`, and **`existing` is always a prefix of the result** — asserted as a property over three successive appends. `parseAuditLines` returns the entries oldest first; a line that does not match the format is **ignored** and contributes nothing, so a `notes` value typed by a human or written by a later feature can never make the page throw; `parseAuditLines(null)` and `parseAuditLines("")` are `[]`. Against the database: submit, approve, reopen, submit, approve leaves `notes` holding exactly **five** lines in that order, with the earlier four byte-identical to what they were after step four, and `/summary` renders them for an `ADMIN` in `data-testid="audit-trail"`, oldest first, each with its actor and a formatted date.
21. **AC-21** — **The money-key walk, in the shape of 003 AC-19, on both shared screens.** `assertNoMoneyKeys` from `src/lib/money-boundary.ts` is applied to the value returned by `getCount`, `getCountForSubmit` and `getLifecycleFacts` for a `YARD_STAFF` actor, and `deepKeys` of each contains **no** key matching `/price|value|total|amount/i` at any depth, including inside `lines[]`, `uncounted[]` and `audit[]`. For an `ADMIN` actor the same walk over `getCount` reports **exactly one** offender, `itemsWithoutPrice` — unchanged from 007 AC-17, which therefore passes **unmodified** — and over `getCountForSubmit` reports exactly the set `{ itemsWithoutPrice, linesWithoutPrice }` and no other. `getLifecycleFacts` returns **one shape for both roles**: the values for a staff actor and an `ADMIN` on the same count are **deeply equal**, because there is no monetary fact it could carry. At the browser level, the rendered HTML of `/stock-entry/counts/<id>` and `/stock-entry/counts/<id>/submit` for a staff session — for a `DRAFT`, a `SUBMITTED` and an `APPROVED` count, with a filter applied and with none — contains no `€` character, no `No price` string, no `unitPrice` string, and no `unitPrice` value of any item in the database. The `ADMIN` renders of the same two routes contain no `€` either: this feature puts no euro on a screen a staff session can reach, and none on the two shared screens for anybody.
22. **AC-22** — **The euro lives on exactly one surface, and the staff shape is never built for it.** `getCountSummary` goes through `shapeForRole` from `actor.role` alone: for a `YARD_STAFF` actor it raises `ForbiddenError` with `ADMIN is required for this action` and the admin builder is called **zero** times, asserted with spy thunks in `npm run test:unit` as 003 AC-17 does; for an `ADMIN` the returned value's money keys are exactly the set `{ itemsWithoutPrice, linesWithoutPrice, unitPriceSnapshot, lineValue, countTotal, noPrice }` and no other, asserted as a set so a seventh turns it red. `/stock-entry/counts/<id>/summary` is the **only** route in this feature whose HTML contains a `€`, asserted by fetching all four routes for an `ADMIN` and finding the character in exactly one of them. The shape is chosen from the session and from nothing a client can set: the same requests carrying `?role=ADMIN`, the header `x-user-role: ADMIN` and the cookie `role=ADMIN` simultaneously still give a staff session a `307` on `/summary` and a money-free body everywhere else (AC-27).
23. **AC-23** — **What a `YARD_STAFF` user sees after submitting — Part 6's row, read literally.** Signed in as the staff user who submitted it, `GET /stock-entry/counts/<id>` for a `SUBMITTED` count and again for an `APPROVED` count returns `200` and renders: the yard name, the period, the count date, the status label `Submitted` / `Approved`, all 82 rows with description, quantity and unit label, `Signed by Jo Byrne on 1 September 2026.` in `data-testid="signed-by"`, the signature as an inline `<svg>` (AC-7), and — once approved — `Approved by Ann Doyle on 2 September 2026.` in `data-testid="approved-by"`. It renders **no** quantity input, **no** `None held` control, **no** `€`, **no** value column, **no** total and **no** `No price` tag, asserted by absence. The `ADMIN` render of the same URL is **identical markup** except for one added link to `/summary`, asserted by comparing the two DOMs with that link removed — one version of the screen, not two, exactly as Part 6 requires.
24. **AC-24** — **The value arithmetic is exact, pure, and never a JavaScript `number`.** `multiplyDecimal`, `sumDecimals` and `roundHalfUp` in `src/lib/money.ts` are unit-tested with no database: `multiplyDecimal("9.83", "890")` is `"8748.7"` (the figure `docs/verification.md` Level 3 uses); `multiplyDecimal("21.6128", "6.11764706")` is `"132.219482378368"` exactly; `multiplyDecimal("0.475", "33.09")` is `"15.71775"`; `multiplyDecimal("0", "890")` is `"0"`. `sumDecimals(["8748.7", "132.219482378368", "0"])` is `"8880.919482378368"`; `sumDecimals([])` is `"0"`. `roundHalfUp("132.219482378368", 2)` is `"132.22"`; **`roundHalfUp("2.675", 2)` is `"2.68"`**, which `Number(2.675).toFixed(2)` gets wrong, and that one cent is why this function is string arithmetic; `roundHalfUp("0.005", 2)` is `"0.01"`; `roundHalfUp("8748.7", 2)` is `"8748.70"`. A source scan finds no `Number(`, `parseFloat`, `toFixed`, `Math.round` or `*` operator applied to a price, a quantity or a value anywhere in `src/lib/money.ts`, `src/server/counts/count-summary-service.ts` or `src/components/stock-entry/ValuedLines.tsx`. `src/lib/money.ts` still names `unitPrice` **nowhere** (006 AC-31), which is why the three new functions take neutrally named parameters.
25. **AC-25** — **The `ADMIN` summary: a price, a value, a tag and a total, against a fixture whose total is computed by hand.** On a fixture of 5 lines — `9.83 × 890`, `21.6128 × 6.11764706`, `0.475 × 33.09`, `0 × 45` and one line whose item has no price with quantity `7` — `getCountSummary` returns `lineValue` of `"8748.7"`, `"132.219482378368"`, `"15.71775"`, `"0"` and `"0"`, and `countTotal` of exactly `"8896.637232378368"` — the exact sum of the five, asserted as that literal string, and rendered as `€8,896.64`. `/summary` renders each line's price with `formatPriceExact`, each value as `formatPriceExact(roundHalfUp(v, 2))`, the total in `data-testid="count-total"`, and `No price` on exactly the fifth row. The total is the sum of the **exact** line values rounded once, not the sum of the rounded lines: a unit test asserts the two differ for a fixture chosen to make them differ, and that the service returns the former (*Open questions* 3). The total is stored nowhere — a `*.db.test.ts` asserts no column of `StockCount` or `StockCountLine` holds it, and `prisma/schema.prisma` has no `value` or `total` column (Invariant 1).
26. **AC-26** — **The permitted-module lists are amended, deliberately, as exact lists — never a directory exemption.** In `tests/unit/project-contract.test.ts`, 006 AC-31's list grows from nine files to **eleven**, the two additions being `src/server/counts/count-lifecycle-service.ts` and `src/server/counts/count-summary-service.ts`, and a twelfth module naming `unitPrice` turns it red. Its companion assertion changes from "`unitPriceSnapshot` is named by **no** shipping module anywhere" to "named by **exactly those two** files", asserted as an exact sorted list. `src/lib/**` and `scripts/**` stay at **zero** files naming `unitPrice`, and under `src/app/**` and `src/components/**` the permitted list stays at exactly the three item-master files 006 named — **this feature's screens render a price without naming the column**, because the value crosses the boundary on a field the shape declares. A parallel assertion pins `signatureSvg` to the same two files and to nothing else. In `tests/unit/stock-entry-contract.test.ts`, 007 AC-25's scan of `src/server/counts/**` and `src/app/stock-entry/**` for `SUBMITTED`, `APPROVED`, `submittedAt`, `approvedAt` and `signatureSvg` gains an exact two-file exemption — the same two — and the `src/app/stock-entry/**` half is asserted to have **zero** offenders, because every page branches through `src/lib/count-lifecycle.ts` and every label through `COUNT_STATUS_LABEL`. 008 AC-28's `MUTATION_EXEMPT` grows from one file to **two**, the addition being `count-lifecycle-service.ts`, whose Prisma operations are asserted as the exact set `{ stockCount.findUnique, stockCount.updateMany, stockCountLine.findMany, stockCountLine.updateMany }` — no `create`, no `delete`, no `upsert`, on either model. Every one of these lists is a list of **files**, and each addition is justified in the test's own comment by naming the invariant it serves.
27. **AC-27** — **Role and identity cannot be influenced by anything the client sets.** Signed in as `YARD_STAFF`, a `GET` of each of the four count routes and a `POST` of each of the three new server actions, every one of them carrying `?role=ADMIN`, the header `x-user-role: ADMIN`, the cookie `role=ADMIN` and the form fields `role=ADMIN`, `userId=<an ADMIN id>`, `approvedById=<an ADMIN id>` and `signedById=<an ADMIN id>` simultaneously, behave exactly as they do without them: `/summary` and `/reopen` still `307`, `submitCountAction` still records `signedById` equal to the **staff** user's id, and `approveCountAction` and `reopenCountAction` are still refused with `ADMIN is required for this action` leaving every column unchanged. The test asserts the responses and the rows, not the source code alone, with the captured action body proving the forged fields really reached the server (007 AC-4's method).
28. **AC-28** — **No database error text ever reaches a screen.** For each of eight provoked failures — an uncounted line, an empty signature, an unreadable signature, an oversized signature, a second submission, an approval of a draft, a reopen with no reason, and a `countId` that does not exist — the rendered HTML and any JSON body contain the feature's own message and none of `prisma`, `Prisma`, `violates`, `constraint`, `SQLSTATE`, `22003`, `23502`, `23514`, `23505`, `P2002`, `P2003`, `P2025`, `numeric field overflow` or `StockCount_locationId_periodYear_periodMonth_key`. Every function in `src/server/counts/count-lifecycle-service.ts` and `count-summary-service.ts` throws only `ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError` or `UnauthorizedError` from `src/server/errors.ts`, never a bare `Error`, and `src/app/api/error-response.ts` is **unchanged**.
29. **AC-29** — **Every state on every new screen is handled, and the strings are single-sourced.** Each literal quoted by any criterion above is exported from `src/lib/count-messages.ts` (or, for the signature messages, re-exported from there) and asserted **from that module**, so the screen and the test cannot drift apart. `/submit` handles: blocked (the list), ready (the pad), already submitted (the signed record read-only, no submit control), no items (`This count has no items.`), and no JavaScript (AC-10). `/summary` handles: submitted (with *Approve this count*), approved (no approve control, the audit trail), a count with no priced lines at all (total `€0.00`, every row tagged), and a `countId` that does not exist (`That count no longer exists.` with the link back, not a throw). `/reopen` handles: a reopenable count, a `DRAFT` (the conflict sentence, no control), and a missing reason. A rejected submission keeps the drawn signature on screen, asserted by reading the hidden field after the error renders. `src/lib/count-messages.ts`, `src/lib/signature-path.ts`, `src/lib/count-audit.ts`, `src/lib/count-lifecycle.ts` and `src/lib/money.ts` import nothing from `src/server/` except `@/server/errors`, keeping `npm run lint`'s dependency fence green and `tests/unit/lint-fence.test.ts` passing unchanged (006 AC-33).
30. **AC-30** — **No migration, no new table, and the workbook untouched.** `prisma/schema.prisma`, every directory under `prisma/migrations/` and `prisma/migrations/migration_lock.toml` are **byte-identical** to their state before this feature — every column #9 writes was shipped by #4 — and `npx prisma migrate status` reports no drift and no pending migration. `TRUNCATED_TABLES` in `src/server/test-db.ts` is unchanged and still equal as a set to exactly `["Item", "ItemLocation", "ItemPrice", "ItemType", "StockCount", "StockCountLine", "Supplier", "User"]`, so **020 AC-4's `information_schema` equality passes untouched**: this feature adds no table, and the audit trail is `StockCount.notes` for the reason argued under *The audit record*. `git status --porcelain -- Samples` is empty.
31. **AC-31** — **Which checks survive with no database,** mirroring 003 AC-23, 004 AC-26, 005 AC-27, 006 AC-32, 007 AC-29 and 008 AC-32. With `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointing at a hostname that does not resolve: `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` each exit `0`, and both `init` scripts exit `0` ending with `[OK] Environment ready (database checks skipped)`. No module this feature adds opens a connection at import time, and each of the three new pages declares `export const dynamic = "force-dynamic"`, so none is prerendered against a database during `build`. The criteria provable without Postgres are AC-3's message half, AC-5, AC-8's reducer and scan halves, AC-18's `parseReopenReason` half, AC-20's pure half, AC-22's spy-thunk half, AC-24, AC-25's rounding half, AC-26, AC-29's message half and AC-30's scan half; every other criterion needs a database or a browser and lives in `*.db.test.ts` or `tests/e2e/`. `docs/architecture.md` gains **no** new dependency exception, because `signature-path.ts` lives in `src/lib/` (see *Services*).
32. **AC-32** — **The gate is green in full, and the e2e suite stays self-cleaning at `retries: 0`.** `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, `npx prisma migrate status` and `npm run test:db` all pass, and `./init.ps1` ends with `[OK] Environment ready` having **executed** the database checks. `playwright.config.ts` is **byte-identical**: the three new specs are named `tests/e2e/stock-entry-submit.spec.ts`, `stock-entry-approve.spec.ts` and `stock-entry-signature.spec.ts`, so the existing `testMatch: /stock-entry-.*\.spec\.ts/` places them in the `chromium-stock-entry` project. `RESERVED_YEAR` in `tests/e2e/support/stock-entry.ts` gains `submit: 2098`, `approve: 2099`, `signature: 2100`; each file deletes only **its own** year in `beforeAll` and `afterAll`, never the range, and asserts through `realCountIds()` that the set of `StockCount` ids with `periodYear < 2090` is identical before and after (007 AC-30). `Item`, `ItemPrice` and `ItemLocation` row counts are unchanged by the run, and no spec adds or removes an `ItemPrice` outside a transaction it reverses. **2100 is the last reservable year**, because 007 AC-8 caps a submitted period at 2100 and every e2e count is created through that flow; the next stock-entry spec file needs that cap raised or a file merged, and the implementer records this in `tests/e2e/support/stock-entry.ts` beside `RESERVED_YEAR`. Two consecutive full `npm run test:e2e` runs report `0 flaky` and `0 failed`; if the suite is not stable at `retries: 0`, the implementer reports that rather than restoring retries or raising a timeout.
33. **AC-33** — **Exactly which shipped assertions change, and they are named.** Six, and no others: (a) `tests/unit/project-contract.test.ts`'s nine-file `unitPrice` list becomes eleven; (b) its `unitPriceSnapshot` "no shipping module anywhere" assertion becomes an exact two-file list; (c) `tests/unit/stock-entry-contract.test.ts`'s "no shipping module names a status or a column past DRAFT" gains the same exact two-file exemption; (d) the same file's "the only files in those trees naming the forbidden strings are tests" list gains those two files; (e) its `MUTATION_EXEMPT` grows from one file to two; (f) its "each action obtains its actor with exactly one `requireUser()` call" expects **five** actions rather than two. `git diff` on those two test files shows no other change. Everything else passes **unmodified**: 006 AC-2 and AC-24, 007 AC-17 (whose admin clause is still "exactly one offender, `itemsWithoutPrice`", because `getCount`'s shape is untouched), 007 AC-25's `src/app/stock-entry/**` half, 008 AC-9, AC-17, AC-22, AC-24 and AC-31, 020 AC-4, `tests/unit/hashing-boundary.test.ts`, `tests/unit/lint-fence.test.ts`, `tests/unit/count-entry-contract.test.ts`, and every `*.db.test.ts` and `tests/e2e/*.spec.ts` shipped by #3 through #20. If any of those cannot pass unmodified, that is a blocker to report in `progress/impl_entry_submit.md`, not a licence to edit it.
34. **AC-34** — **The guarantees are proved by mutation, because TypeScript does not protect any of them.** Before closing, the implementer breaks each of six guarantees on purpose, records the failing test name and the exit code in `progress/impl_entry_submit.md`, and restores the tree byte-identically (verified by `git status --porcelain` and a hash): (1) add `currentPrice` to `SubmitReviewForStaff` and populate it — `npm run typecheck` stays exit `0`, and AC-21's walk goes red; (2) write `unitPriceSnapshot = 0` instead of `null` for a priceless line — AC-12 goes red; (3) rewrite an existing snapshot on re-submit — AC-19 goes red; (4) let `submitCount` proceed with one `null` quantity — AC-3 goes red; (5) let `submitCount` accept an empty signature — AC-6 goes red; (6) leave `signatureSvg` in place on reopen — AC-18 goes red. Mutation (1) is reported explicitly against #8's finding that a money leak typechecks cleanly and is caught only by scans. If any mutation leaves the suite green, that is the finding, and it is reported rather than patched over.

## Out of scope

- **Anything that spans two counts.** Yard totals per period, period completeness
  (Invariant 7), MoM, YoY, the trend chart and the breakdowns by type and supplier are all
  #11 `analysis`. This feature computes **one count's** total, on one admin-only screen, as
  the figure an approval decision needs. It joins nothing to a previous period and reads no
  other count.
- **The Stock Takes history screen.** The Dublin / Clonmel / Both selector, the
  previous/next-count jumps and the read-only history are #10. `/stock-takes` is untouched.
- **The Excel export of the signature.** #12 renders `signatureSvg` into the workbook; this
  feature only guarantees it is path data that will scale when it does (AC-7).
- **A printable count sheet.** #13.
- **Editing a quantity, the filters, autosave or the progress line.** All #8's, all
  unchanged; `count-entry-service.ts` is byte-identical (AC-17).
- **Editing `countDate`, the period or the yard, on a reopened count or any other.** A
  reopen returns the count to `DRAFT` and nothing more. Moving a count between months is a
  history edit with its own consequences for MoM and YoY, and it is not invented here.
- **Deleting a count.** Still nothing in this product deletes a `StockCount`. 007's open
  question about a count started at the wrong yard stays open, and a reopen is **not** the
  answer to it.
- **A partial or per-line approval.** A count is approved whole or not at all.
- **A rejection that is not a reopen.** There is no `REJECTED` status; `CountStatus` has
  three members and gains none. An `ADMIN` who disagrees with a submitted count reopens it
  with a reason, which puts it back where it can be fixed (AC-18).
- **A notification to the yard that a count was approved or reopened.** No email, no push,
  no badge. The reason is on the count page, which is where the person who has to act on it
  already goes.
- **An audit table.** `StockCount.notes` carries the trail; a `StockCountEvent` model is a
  schema change, a domain-model amendment and a `TRUNCATED_TABLES` entry, and it is
  *Open questions* 6.
- **A typed note on a count.** `StockCount.notes` is the audit trail in this feature and
  nothing writes free text into it (*Open questions* 6). `StockCountLine.note` stays null,
  as #8 left it.
- **A second identity mechanism.** The signature is drawn, not typed; there is no "signed
  by" text field and no PIN. 007 AC-5 settled that who you are is the session, and the
  signature is the second, deliberate artefact — a third would be unverifiable.
- **Signature verification of any kind.** The pad records what was drawn. It does not check
  that it resembles a previous signature, and nothing in this product ever will.
- **Per-yard permissions.** Any signed-in user may submit any `DRAFT` at any yard; any
  `ADMIN` may approve any count. No yard-scoped user, no third role (Part 6).
- **A service worker or offline submission.** #8's queue keeps typed numbers safe; signing
  is one deliberate act at the end, with the phone in hand, and it may require a connection.
- **Bulk approval.** No "approve both yards", no "approve everything for September".
- **CI.** `init` remains the gate.

## Open questions

None blocking. Nine decisions this spec settles with a stated answer rather than leaving
undefined, each flagged so the user can strike it at approval:

1. **A `SUBMITTED` count can be reopened too, not only an `APPROVED` one** (AC-18). Part 6's
   table names the `APPROVED` case; a submitted count with a wrong number is the ordinary
   case, and forcing an `ADMIN` to approve it first in order to undo it would put a
   known-wrong count into the history and into #11's totals. Striking this means an
   `ADMIN` must approve before reopening, or that a `SUBMITTED` count needs a fourth status.
2. **Self-approval is permitted and recorded, not refused** (AC-16). `specs/product-brief.md`
   says the team is two people at most, and an `ADMIN` who is the only person in the office
   must be able to close the month. `signedAndApprovedBySamePerson` makes it visible on the
   page and in the audit trail. Striking this means `approveCount` raises a `ConflictError`
   when `approvedById === signedById` — and a single-admin yard cannot close a count it
   counted.
3. **The total is the sum of the exact line values, rounded once** (AC-25), not the sum of
   the rounded lines. Invariant 10 is the reason: the product must not disagree with the
   workbook by any amount. The cost is stated rather than hidden — the rendered column may
   not add to the rendered total to the last cent. Striking this rounds each line first, the
   column adds up on screen, and the total can differ from the workbook's.
4. **The signature is SVG path data in a fixed `0 0 600 300` space, capped at 400 points and
   6000 characters** (AC-5). Those numbers are named constants quoted in the criteria so a
   change is deliberate. Striking the cap means an uncapped pad and a column that can hold
   tens of kilobytes per count.
5. **Signing needs JavaScript, and the screen says so** (AC-10). You cannot draw with a
   finger without it. Everything else in this feature works with the bundle disabled.
   Striking this means a typed-name fallback, which is the unverifiable second identity
   007 AC-5 refused.
6. **The audit trail is `StockCount.notes`, append-only, and there is no audit table.**
   Part 3 is the schema field for field (004 AC-1), so a `StockCountEvent` model means
   amending the domain model, a migration, a `TRUNCATED_TABLES` entry and 020 AC-4 —
   a decision for the user, not a side effect of this feature. The cost is that `notes`
   cannot also be a free-text note on a count. Striking this schedules the audit table as
   its own feature, and `notes` is freed.
7. **The reopen reason is shown to both roles** (AC-18); the full audit trail with
   timestamps and emails is `ADMIN`-only. The person who has to walk the yard again needs
   the reason. Striking this hides the reason from staff.
8. **Approve and reopen each have their own confirming screen**, rather than a button in a
   header. Both are consequential and one of them destroys a signature; a confirmation
   screen also gives each a route-level `ADMIN` refusal a browser test can assert with a
   status code (AC-1). Striking this makes approve a single button on `/summary`.
9. **`/stock-entry/counts/[id]` and `/submit` stay money-free for both roles**, and every
   euro in this feature lives on `/summary`, which no staff session can reach at all. This
   keeps Part 6's *"Stock Takes is money-free for both roles"* and *"one version of the
   screen, not two"* literally true, and it is why 007 AC-17 and 008 AC-17 pass unmodified.
   Striking this puts the total on the shared count page for an `ADMIN` and amends both.

`Q7` and `Q8` in `specs/domain-model.md § Still open` block only M7 and are unrelated to
this feature. Nothing this feature needs is unanswered in the domain model: Invariants 2, 3,
4, 5 and 11 settle the lifecycle, Part 4 settles the period, Part 6 settles the money
boundary and Q4 settles what happens to an item with no price.
