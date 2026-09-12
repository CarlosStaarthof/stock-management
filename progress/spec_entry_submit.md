# Spec notes — #9 `entry_submit`

Written 2026-09-12. Spec at `specs/features/009-entry_submit.md`, 34 criteria,
`spec_status: draft`, `status: pending`. Criteria mirrored verbatim into
`feature_list.json`.

No blocker found. `specs/domain-model.md § Still open` holds only Q7 and Q8, both M7.

## Sources read

`specs/domain-model.md` (Invariants 1–5, 10, 11, 12; Parts 3, 4, 5, 6; Q4),
`specs/product-brief.md`, `specs/features/006`, `007`, `008`, `docs/architecture.md`,
`docs/conventions.md`, `docs/verification.md` (Levels 3b, 3c, 5), `CHECKPOINTS.md` (C4),
`progress/history.md` #7 and #8, `prisma/schema.prisma`,
`tests/unit/project-contract.test.ts`, `tests/unit/stock-entry-contract.test.ts`,
`tests/unit/count-entry-contract.test.ts`, `playwright.config.ts`,
`tests/e2e/support/stock-entry.ts`, `src/server/counts/**`, `src/server/items/price-selection.ts`,
`src/lib/money.ts`, `src/lib/money-boundary.ts`, `src/lib/count-messages.ts`,
`src/types/stock-count.ts`, `src/server/auth/role-shape.ts`, `src/app/page-guards.ts`,
`src/app/api/error-response.ts`.

## Decisions settled, with the reasoning that is not in the spec body

### Where the money goes — the sharpest question

The task asked for an `ADMIN` total and per-row `No price` tags on **a screen both roles
use**. Part 6 says Stock Takes is money-free for *both* roles and demands "one version of
the screen, not two". Both are honoured by splitting the two facts:

- the **per-line `No price` warning** and `itemsWithoutPrice` are money-*shaped* keys with
  no euro in them, and they go on the shared `/submit` screen, through `shapeForRole` —
  that is the criterion in the shape of 003 AC-19 the task asked for (AC-21);
- **every euro** goes on `/summary`, which is `ADMIN`-only at the route (`307` for staff).

The payoff is concrete: `getCount`'s shape is untouched, so **007 AC-17 and 008 AC-17 pass
unmodified**, and the admin clause "exactly one offender, `itemsWithoutPrice`" survives.

### `unitPriceSnapshot` for an item with no price: `null`, not `0`

`0` would make "no price" indistinguishable from "the price was zero" forever and would
assert a price nobody set. `null` lets Invariant 4's warning be derived from the column
itself, and — decisively — it makes the reopen rule expressible: **write only where the
column is `null`**. So Invariant 2 ("never rewritten") and the obvious reason to reopen
("those 11 items had no price") coexist without a special case. AC-19 tests all three
outcomes in one run.

### The audit record, without a migration

`specs/domain-model.md` Part 3 is the schema field-for-field and 004 AC-1 asserts it, so a
`StockCountEvent` table would mean amending the domain model, a migration, a
`TRUNCATED_TABLES` entry and 020 AC-4 — for a feature all of whose columns #4 already
shipped. So the trail is `StockCount.notes`, append-only, one line per event, written and
parsed by one pure module (`src/lib/count-audit.ts`).

The *reason* it is needed at all is worth keeping: a reopen nulls `approvedById`,
`approvedAt`, `signedById`, `signedAt`, `submittedAt` and `signatureSvg`, so without the
lines there would be **no record that the count was ever approved, by whom, or why it was
undone**. The reason field is validated to a single line so a `\n` cannot forge an entry.
Recorded as *Open questions* 6 so the user can ask for the table.

### No migration, and the tables named

`prisma/schema.prisma` and `prisma/migrations/**` byte-identical. `TRUNCATED_TABLES` stays
at exactly `Item`, `ItemLocation`, `ItemPrice`, `ItemType`, `StockCount`, `StockCountLine`,
`Supplier`, `User`. **020 AC-4 stays green** because no table is added (AC-30).

### `signature-path.ts` goes in `src/lib/`, not `src/server/counts/`

`docs/architecture.md`'s #8 exception says in terms: *"If a third such module appears, the
better answer is to move all of them under `src/lib/`."* The pad and the service must share
one grammar, so this would have been the third `components → server` import. Putting it in
`src/lib/` from the start needs **no exception at all** (it imports only `@/lib/count-messages`
and the permitted `@/server/errors`) and leaves #8's two modules alone. `docs/architecture.md`
therefore gains nothing (AC-31).

### The scans amended, exactly six shipped assertions

Named in AC-33 so the reviewer can diff them: the nine-file `unitPrice` list → eleven; the
`unitPriceSnapshot` "nowhere" assertion → an exact two-file list; 007 AC-25's status-string
scan gains the same two-file exemption (and its `src/app/stock-entry/**` half is asserted
at **zero** offenders, because pages branch through `src/lib/count-lifecycle.ts` and label
through `COUNT_STATUS_LABEL`); 008 AC-28's `MUTATION_EXEMPT` 1 → 2; the `requireUser()`
count 2 → 5. `count-entry-service.ts` stays byte-identical, so 008 AC-9 and
`tests/unit/count-entry-contract.test.ts` are untouched.

### Reserved years — and a wall worth knowing about

`submit: 2098`, `approve: 2099`, `signature: 2100`. **2100 is the last reservable year**:
007 AC-8 caps a period at 2100 and every e2e count is created through that flow. The next
stock-entry spec file will need the cap raised or a file merged. AC-32 requires the
implementer to record this beside `RESERVED_YEAR`.

### Arithmetic checked by hand, so the criteria are not aspirational

- `21.6128 × 6.11764706 = 132.219482378368` (216128 × 611764706 = 132,219,482,378,368, scale 12)
- `0.475 × 33.09 = 15.71775`
- `9.83 × 890 = 8748.7` (the `docs/verification.md` Level 3 figure)
- total of the AC-25 fixture: `8748.7 + 132.219482378368 + 15.71775 + 0 + 0 = 8896.637232378368` → `€8,896.64`
- `roundHalfUp("2.675", 2) === "2.68"` where `Number(2.675).toFixed(2)` gives `"2.67"` — that
  cent is the reason the three new `money.ts` functions are string arithmetic.

### Things deliberately refused

- A `REJECTED` status. `CountStatus` has three members and gains none; disagreement is a
  reopen with a reason.
- A disabled *Sign and submit* button as the guard. Level 3c: the rejection is the
  service's. The button is enabled before anything is drawn and AC-6 asserts it.
- A fourth query parameter on the counting screen for "show only uncounted". It would edit
  008 AC-22. The route out of a filtered view is `/submit`'s list, whose links carry no
  query string at all (AC-4).
- Blocking self-approval. A two-person team cannot obey it. It is recorded on the page
  instead (`signedAndApprovedBySamePerson`) and is *Open questions* 2.

### Flagged for the user — nine strikeable decisions

Listed in the spec's *Open questions*. The three most consequential: reopen applies to a
`SUBMITTED` count too (1); self-approval permitted and recorded (2); the total is the sum of
the exact line values rounded once, so the rendered column may not add to the rendered total
to the last cent (3, and Invariant 10 is why).

### Mutation proofs required before closing

AC-34 names six, including the one #8 found the hard way: adding a money key to a staff
shape **typechecks cleanly**, and only the scans catch it.
