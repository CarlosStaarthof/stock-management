# Spec notes — feature #4 `domain_schema`

Written by the spec-writer on 2026-09-09. Output:
`specs/features/004-domain_schema.md`, 31 acceptance criteria, mirrored into
`feature_list.json` (`spec_status: draft`, `status: pending`).

## Gate

`./init.ps1` run before writing and again after. Green both times, Database step run for
real (`[ok] prisma migrate status`, `[ok] npm run test:db`), final line
`[OK] Environment ready`. One Playwright flake on the first run
(`AC-11 deactivation`, `ECONNRESET`, green on retry) — the same intermittent noise
`progress/history.md` records for #3; not caused by anything here, since nothing
executable was changed.

## Inputs read

`specs/domain-model.md` in full (Part 3 and its 12 invariants, Part 4 periods, Part 5
held/one-off/dormant, Part 6 roles and the money boundary), `specs/product-brief.md`,
`specs/features/003-auth_and_roles.md`, `docs/architecture.md`, `docs/conventions.md`,
`docs/verification.md`, `CHECKPOINTS.md`, `AGENTS.md`, `prisma/schema.prisma`, the one
existing migration, `tests/unit/schema-and-migration.test.ts`,
`tests/unit/project-contract.test.ts`, `vitest.db.config.ts`,
`scripts/run-db-tests.mjs`, `src/server/db.ts`, `src/server/auth/test-db.ts`,
`progress/history.md` (#3 entry), `progress/current.md`.

## Blocking check

`specs/domain-model.md § Still open` holds `Q7` and `Q8` only, both scoped to M7 and both
about the Trucks & Yard module, whose models this feature explicitly excludes. `Q5` is
answered; its residue (first day vs last day of the month) is absorbed by the period
model and touches no column. **Nothing #4 needs is unanswered — not blocked.**

## Decisions taken, and why

Two the task asked to be settled rather than deferred, plus five smaller ones that would
otherwise be picked by reflex during implementation.

1. **`Location` is seeded by #4's migration**, `INSERT … ON CONFLICT ("code") DO NOTHING`,
   ids `loc_dublin` / `loc_clonmel`. #5's brief lists Suppliers, ItemTypes, Items,
   ItemPrices and ItemLocation — not Location — so it belonged to nobody. Invariant 7
   ("a period is complete only when every `active` Location has an `APPROVED` count") is
   undefined against an empty table, and the two yards are a closed set fixed by the
   product brief rather than something the importer discovers. Seeding in the migration
   also means the test branch has both yards on every `npm run test:db`, with no fixture.
   AC-21.

2. **`onDelete` per relation**, tabulated in the spec with a reason each. The organising
   rule: *`Restrict` where history points at the row, `Cascade` where the row is part of
   another row.* The consequence worth stating is that an `Item` is deletable **exactly
   when no `StockCountLine` mentions it** — `Restrict` from the line, `Cascade` from
   `ItemPrice` and `ItemLocation` — which is both "history is undeletable" (Part 5) and
   "an item typed in by mistake can still be removed". `Item.supplier` is optional, so
   Prisma would have defaulted it to `SetNull`; that is called out explicitly because it
   silently turns a Kelly item into a supplier-less one. AC-19, AC-20.

3. **`Item.description` non-empty is a hand-written `CHECK`** — `btrim("description") <> ''`
   — added to the generated SQL after `migrate dev --create-only`. Prisma gives `NOT NULL`
   and nothing more, and Invariant 9 says "at the database **and** at every form". The
   criterion names the constraint (`Item_description_not_empty`) so the failure is
   observable in the error message. AC-17.

4. **`periodMonth BETWEEN 1 AND 12`** is added as a second hand-written `CHECK`. Flagged in
   *Open questions* as a decision the user may strike: it is the definition of a month
   rather than a rule the domain model spells out. AC-18.

5. **No `createdAt`/`updatedAt` beyond Part 3.** Part 3 names them on `User` and names
   `createdAt` on `ItemPrice`; nothing else gets them. Keeping the field set identical to
   Part 3 is what lets AC-4 assert field lists by equality, and it keeps the audit trail
   an explicit #9 decision instead of a default that arrived unnoticed.

6. **`(description, supplierId)` with a NULL supplier does not de-duplicate.** Postgres
   treats NULLs as distinct, so two supplier-less items with the same description both
   insert. `NULLS NOT DISTINCT` would fix it but Prisma cannot express it and hand-writing
   it invites drift for one workbook row (`Dublin!A45`). AC-15 **asserts the real
   behaviour** rather than leaving a reader to assume the database prevents it.

7. **`@db.Date` for `countDate` and `effectiveFrom`.** Part 3 writes `countDate Date`, and
   price selection is "the latest `effectiveFrom` on or before `countDate`" — a comparison
   between calendar days. A `timestamp` would let a timezone move a count into the
   previous month. AC-22.

## Traps found while reading, and how the spec handles them

- **`tests/unit/schema-and-migration.test.ts` and `tests/unit/project-contract.test.ts`
  both assert "exactly one model, exactly one enum" and actively scan for #4's ten
  names.** #4 cannot pass without changing them, and the lazy fix is deletion. AC-2 names
  both files, forbids deletion, requires replacement by set equality over the full
  expected model and enum sets, and demands a mutation proof in both directions (add a
  tenth model, delete `model ItemPrice`).

- **Relation fields on `User`.** Prisma requires the other side of the three `StockCount`
  → `User` relations, so `User` is edited by #4 — which looks like #4 crossing into #3's
  territory and would break 003 AC-2's "eight fields and no others". AC-5 resolves it:
  relation fields are not columns, the migration must contain no `ALTER TABLE "User"`,
  `information_schema` must return the same eight columns, and the 003 assertion is
  tightened to "eight scalar fields plus exactly these three relation fields" rather than
  loosened to a subset check.

- **`src/server/auth/test-db.ts` says in a comment that #4 extends it in the same change.**
  It is no longer auth-specific once it truncates nine tables, so AC-28 moves it to
  `src/server/test-db.ts`, restricts the change to the four existing `*.db.test.ts` files
  to their import line, and pins the reset semantics: everything emptied, `Location`
  restored to exactly the two migration rows (which the migration created and a naive
  `deleteMany` would destroy).

- **`vitest.db.config.ts` includes `src/**/*.db.test.ts` only.** Constraint tests placed
  under `tests/` would silently never run. AC-27 puts them at
  `src/server/schema/*.db.test.ts` so the config needs no change, and states that
  `src/server/schema/` holds tests only — #6 and #7 create `items/` and `counts/` for real.

- **`prisma migrate status` is part of the gate.** Hand-editing a migration is exactly the
  kind of thing that produces drift on the next run, so AC-24 and AC-25 pin it: deploy to
  an empty database, `status` clean, `init` green with no `[skip]`, and a red-gate proof
  (drop the `CHECK`, watch `test:db` fail and both scripts exit 1).

## Criteria map

| Concern | Criteria |
|---|---|
| Declaration and field sets, guard tests replaced | AC-1 to AC-5 |
| Column types in the generated SQL, not the Prisma source | AC-6 to AC-9 |
| Nullable quantity; `value` never a column | AC-10, AC-11 |
| The five unique constraints as domain rules | AC-12 to AC-16 |
| Hand-written `CHECK` constraints | AC-17, AC-18 |
| Referential behaviour; history survives archival | AC-19, AC-20 |
| The two `Location` rows | AC-21 |
| Dates as dates | AC-22 |
| Migration hygiene, additive, from scratch, `init` | AC-23 to AC-25 |
| Which checks survive with no database (mirrors 003 AC-23/24) | AC-26 |
| Suite separation and `resetTestDb` | AC-27, AC-28 |
| No regression, no application surface | AC-29 to AC-31 |

## Left for the user at approval

Nothing blocking. Two decisions are flagged in the spec's *Open questions* precisely so
they can be reversed cheaply: seeding `Location` in the migration, and the `periodMonth`
`CHECK`.
