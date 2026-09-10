# Spec notes — #6 `item_master_ui`

Written while drafting `specs/features/006-item_master_ui.md`. Records the decisions the
spec makes and the evidence behind them, so a reviewer can check the reasoning without
re-reading every source document.

## Gate

`./init.ps1` run at the start of this session: **green, database reachable, database
checks executed** — 191 unit tests, 26 e2e, 95 db tests, `prisma migrate status` up to
date. Re-run at the end.

## What I read

`specs/product-brief.md`, `specs/domain-model.md` (Parts 2, 3, 5, 6 and the Invariants),
`specs/features/003-auth_and_roles.md`, `004-domain_schema.md` (AC-19, AC-20, AC-26,
AC-28), `005-seed_from_workbook.md` including its `## Post-approval amendments` and
`## Open questions`, `progress/history.md` §#3 and §#5, `docs/architecture.md`,
`docs/conventions.md`, `docs/verification.md`, `CHECKPOINTS.md`, plus the shipped code
that #6 must reuse: `src/middleware.ts`, `src/lib/auth-config.ts`, `src/app/page-guards.ts`,
`src/server/auth/guards.ts`, `src/server/auth/role-shape.ts`, `src/app/api/error-response.ts`,
`src/server/errors.ts`, `src/lib/units.ts`, `src/server/test-db.ts`, `eslint.config.mjs`,
`tests/unit/project-contract.test.ts`, `prisma/schema.prisma`.

`specs/domain-model.md § Still open` holds only Q7 and Q8, both M7. Nothing blocks #6.

## The eleven decisions this spec makes rather than leaves open

Each is stated in the spec with its reasoning, and flagged in `## Open questions` so the
user can strike it at approval.

1. **`/item-master` is one section, one protected path.** `PROTECTED_PATHS` gains one
   entry and the middleware matcher one pattern; seven routes hang off it. A staff request
   is refused by #3's existing three mechanisms — middleware, `requireAdminPage`,
   `assertRole` — and lands on `/stock-entry?denied=item-master`, which already renders
   `ACCESS_DENIED_MESSAGE` for any `denied` value. No new guard, no new message, no
   `…ForStaff` shape: here the money boundary is a **route** boundary.
2. **No `loading.tsx` at or above `src/app/item-master/`.** #3's history records the
   defect exactly: a `loading.tsx` flushes a shell and turns a server `redirect()` into a
   200. The refusal in AC-2 is only real if it stays a 307, so AC-3 requires the
   implementer to reproduce the degradation and record it.
3. **A price is added, never edited.** The price panel offers one action. `@@unique([itemId,
   effectiveFrom])` refuses a second price on a date already taken; the spec pins the
   message and forbids `UPDATE`/`DELETE` on `ItemPrice` by source scan, as #5 AC-22 did
   for the importer. The cost — correcting a same-day typo needs a later date — is stated
   in the open questions rather than hidden.
4. **Current price = latest `effectiveFrom` on or before the as-of date**, chosen by a
   pure function `selectCurrentPrice`, which #8/#9 will reuse to write
   `unitPriceSnapshot` on `countDate`. Future-dated prices are listed but are not current.
5. **Archive is `active = false`; delete is attempted, not pre-checked.** #4 AC-20b
   proves Postgres refuses a delete when a line references the item, and relays a
   `PrismaClientUnknownRequestError` mentioning `violates RESTRICT setting of foreign key
   constraint`. `docs/architecture.md` § Error handling forbids surfacing that, so the
   service catches it, counts the lines and throws `ConflictError`. No pre-check, so
   there is no race between the check and the delete.
6. **`needsReview` is raised by the system and cleared only by a human — and clearing is
   refused while a reason remains.** Auto-clearing would silently drop the flag on the two
   below-total fuel rows, which carry no missing field at all (005 open question 1); a
   purely manual flag would let an admin mark a price-less item reviewed. Both failure
   modes are closed by one rule.
7. **The 8 cross-sheet conflicts are surfaced here, not deferred to #15.** 005's own
   *Out of scope* says "choosing the right unit for `MMA Paints - Red` is a housekeeping
   edit in #6", and Part 5 defines #15's worklist by enumeration — `needsReview`, missing
   `unitLabel`, no `ItemPrice` — which a cross-sheet disagreement is none of. They get a
   `Note` tag, a `filter=notes` view and the verbatim text on the edit page, next to the
   fields that fix them.
8. **Unassigning a yard sets `ItemLocation.active = false` and keeps `sortOrder`.** No
   `ItemLocation` row is ever deleted here. Re-assigning reactivates the same row, so an
   item returns to its old place on the sheet — and a blind insert would hit
   `@@unique([itemId, locationId])` anyway.
9. **Reordering is a swap, and gaps are never renumbered.** Clonmel's 71–74 gap records
   that the fuel rows sit below the total row (005 open question 4). The spec turns that
   into an assertable invariant: the multiset of `sortOrder` values at a yard is identical
   before and after any sequence of moves. A new assignment takes `max + 1`.
10. **`ItemType` cannot be archived**, because Part 3 gives it no `active` column and #6
    adds no migration. It can be created, renamed, reordered and deleted while unused.
11. **This screen is desktop-first and must not be broken on a phone.** The brief makes
    phone-first a constraint on *counting*; an admin prices at a laptop. The criterion
    mirrors 003 AC-32 with one relaxation stated in advance: the document must not scroll
    sideways at 390 px, while the item table may scroll inside its own container.

## Carried-forward work folded in

`docs/architecture.md` records three spellings that defeat the `src/lib/** → src/server/**`
ESLint fence: `@/./server/db`, `@/../src/server/db` and `await import("@/server/db")`.
AC-33 closes all three, proves each by mutation through ESLint's `lintText` API (no file
written to the tree), keeps the nine shapes #5's reviewer already blocked red, keeps the
permitted `@/server/errors` import green, and requires the doc's wording to be corrected in
the same change. It is here because it is small and touches the same lint config #6 amends
for AC-31.

## The money-naming scan

`tests/unit/project-contract.test.ts` currently permits exactly two modules to name
`unitPrice` and bans the string from `src/app/`, `src/components/`, `src/lib/` and
`scripts/`. #6 is the first feature that legitimately renders a price. AC-31 amends the
list the way #5 AC-29 amended #4 AC-31 — exact list, not a directory exemption —
keeps `src/lib/` and `scripts/` at **zero**, and keeps `unitPriceSnapshot` named nowhere
outside a test, since its first reader is still #9.

## Figures used

From #5's close, re-stated rather than re-derived: 10 suppliers, 19 item types, 140 items,
129 prices, 152 links, 15 `needsReview` (13 incomplete + 2 below-total), 10 items with a
`notes` string (2 below-total + 8 cross-sheet conflicts), 11 items with **no** `ItemPrice`
row at all. Dublin links run 3–84, Clonmel 3–70 and 75–76.

Criteria that quote an exact number are asserted against a **fixture** built after
`resetTestDb()`, not against whatever the development database happens to hold, so a later
admin edit cannot turn the suite red. The e2e specs create their own items with unique
descriptions and delete them, because Playwright runs against the development database.
