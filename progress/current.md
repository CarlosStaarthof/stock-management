# Current session

**Feature:** #6 `item_master_ui`
**Spec:** `specs/features/006-item_master_ui.md` (approved 2026-09-10, 34 criteria)
**Started:** 2026-09-10
**Status:** in_progress — spec approved by the user, implementation not started

## Plan

Seven `ADMIN`-only screens under `/item-master`: the item list with filters, item create and
edit, delete confirm, suppliers, item types, and the per-yard sheet. Plus the services in
`src/server/items/` they call. The first feature in this project with a real user interface.

### Files expected to be touched

- `src/app/item-master/**` — seven routes, `actions.ts`, all `force-dynamic`
- `src/components/item-master/**` — `ItemTable.tsx`, `PricePanel.tsx` and the forms
- `src/server/items/` — `item-service.ts`, `item-price-service.ts`, `price-selection.ts`,
  `item-master-input.ts` (Zod at the edge), plus `*.db.test.ts` for each
- `src/lib/item-master-messages.ts` — every user-facing string a criterion quotes
- `src/lib/auth-config.ts`, `src/middleware.ts` — add `/item-master` to the protected set
- `eslint.config.mjs`, `docs/architecture.md`, `tests/unit/lint-fence.test.ts` — AC-33
- `tests/unit/project-contract.test.ts` — AC-31's exact nine-file `unitPrice` list
- `tests/e2e/item-master*.spec.ts`

No migration. `prisma/schema.prisma` and `prisma/migrations/` must be byte-identical after.

## Approach

The money boundary here is a **route** boundary, not a response-shaping one: Part 6 puts the
item master and every monetary figure in the ADMIN column, so nothing is shaped for staff
because nothing is sent to staff. `shapeForRole` is deliberately not used.

Decisions the user approved, each recorded in the spec's Open questions:

1. `needsReview` clears by hand and is refused while a reason remains; it re-raises itself.
2. Archiving an item does not touch `ItemLocation`, so restoring returns it to its places.
3. A price typed wrongly today cannot be corrected today — the honest cost of Invariant 2.
4. Unassigning deactivates the link rather than deleting it, so `sortOrder` survives.
5. Gaps in `sortOrder` are never repaired; reordering is a swap.
6. `ItemType` has no archive — Part 3 gives it no `active` column and #6 adds no migration.
7. Desktop-first, phone-usable at 390 px (AC-30), not phone-first.

## Work log

<!-- Update as you go, not at the end. If the session dies, this file is what survives. -->

## Verification

Gate at the moment of approval — full run, database checks executed:

```
bash ./init.sh                                        ->  exit 0
    [ok]   18 features, 1 in progress
    [ok]   typecheck / lint / test:unit / test:e2e
==> Database
    [ok]   database reachable / prisma migrate status / npm run test:db
[OK] Environment ready
```

<!-- Paste the closing run here. It must not say "(database checks skipped)" — C2.1. -->

## Blockers

None.

## Next

Implementer run against the 34 approved criteria, then a reviewer run, then sign-off.

Two carried-forward debts are closed by this feature, not deferred again:

- **AC-33** — the three known ESLint holes (`@/./server/db`, `@/../src/server/db`,
  `await import(...)`), and `docs/architecture.md` stops promising something untrue.
- **AC-31** — 005 AC-29's `unitPrice` scan widened to an exact nine-file list. This is the
  first feature that legitimately renders a price.

Watch item, not a blocker: the #5 closing gate reported `25 passed, 1 flaky` — #3's
`role-access` spec timed out at 90s under three-worker contention and passed on retry in 24s.
Re-run in isolation with `--retries=0`: 6 passed. Machine noise, but `retries: 1` is exactly
what would hide a real intermittent regression, and this is the second sighting.
