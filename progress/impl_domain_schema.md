# Implementation — feature 4 domain_schema

**Spec:** specs/features/004-domain_schema.md (approved 2026-09-09, amended 2026-09-09 —
see its `## Post-approval amendments`)
**Status:** complete

Nine models, three enums, the repository's second migration, and 50 model-level tests
against a real Postgres. `./init.ps1` and `bash ./init.sh` both end `[OK] Environment
ready` — the full form, database checks **executed**, not skipped.

**Reviewed and APPROVED**, no required changes — `progress/review_domain_schema.md`, and
§Review outcome at the end of this file.

This feature was `blocked` mid-session and resumed. AC-31's file list contradicted AC-27,
AC-28 and AC-30, so the implementer stopped rather than edit the spec or quietly touch a
forbidden file. The user amended the spec; the four findings that stop produced are
recorded under §Deviations, which is a record of what the harness caught rather than a list
of outstanding problems. One of the four amendments carried a false rationale of its own,
which the reviewer disproved by mutation and which is corrected here and in the code.

## Files created

- `prisma/migrations/20260909135148_create_stock_domain/migration.sql` — the second
  migration: two enum types, eight tables, five unique indexes, six plain indexes, eleven
  foreign keys, then the two hand-written `CHECK` constraints and the idempotent
  `Location` seed.
- `src/server/schema/columns.db.test.ts` — column types, precision, nullability, dates,
  the precision round trip, and the absence of a stored value. Reads
  `information_schema.columns` and `pg_indexes`, never `schema.prisma`.
- `src/server/schema/constraints.db.test.ts` — the five unique keys and the two `CHECK`
  constraints, each stated as the domain rule it enforces.
- `src/server/schema/referential.db.test.ts` — the `onDelete` policies read from
  `information_schema.referential_constraints` and then exercised, plus foreign-key
  indexing and `resetTestDb()`.

## Files modified

- `prisma/schema.prisma` — added `CountStatus` and `UnitKind`, and the eight models of
  `specs/domain-model.md` Part 3; `User` gained three relation fields and no column. Header
  comment rewritten: it no longer says #4's models are absent.
- `src/server/test-db.ts` — **moved** from `src/server/auth/test-db.ts` (`git mv`, so the
  history follows). Deletes the eight owned tables in foreign-key-safe order and restores
  `Location` to the two migration rows. `MACROADS_TEST_DB` guard unchanged, character for
  character. Exports `SEEDED_LOCATIONS` so the reset and its test cannot disagree.
- `src/server/auth/admin-create.db.test.ts`, `credentials-logging.db.test.ts`,
  `session.db.test.ts`, `user-service.db.test.ts` — the import specifier only, by `sed` on
  `@/server/auth/test-db` → `@/server/test-db`. No assertion touched.
- `tests/unit/schema-and-migration.test.ts` — #3's guards **replaced** by set equality over
  nine models and three enums, per-model scalar and relation field lists, and the
  migration-hygiene assertions of AC-23.
- `tests/unit/project-contract.test.ts` — the `["enum Role {", "model User {"]` equality
  replaced by the full twelve-declaration equality; suite-disjointness and the AC-31 money
  guard added.
- `tests/unit/hashing-boundary.test.ts` — #3's "every database access lives under
  `src/server/auth/`" **relaxed** to `/^src\/server\//`, per the amended AC-31: a bounded,
  forced weakening of that one predicate, and nothing `docs/architecture.md` permits is now
  unguarded. Title updated, and a second non-vacuity assertion added so the loop cannot
  pass on an empty list. Comment corrected after review — see §Review outcome.
- `feature_list.json` — #4's `status`, moved to `blocked` when the contradiction was
  raised and back to `in_progress` when the spec was amended. Its `acceptance[]` mirror of
  the amended AC-20 and AC-31 was re-derived by the coordinator, not by this session.
- `progress/current.md` — work log kept during the session, and the blocker.

## Acceptance criteria

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | `prisma/schema.prisma` | `tests/unit/schema-and-migration.test.ts` → "004 AC-1: declares exactly nine models and exactly three enums, compared as sets"; "004 AC-1: no M7 declaration appears anywhere in the file"; `tests/unit/project-contract.test.ts` → "AC-6 (002) … replaced by 004 AC-1"; `src/server/schema/columns.db.test.ts` → "AC-1: the public schema holds exactly the nine tables of Part 3". `npx prisma validate` exit `0`; `npx prisma generate` exit `0` (run by `postinstall` and by `migrate dev`). |
| AC-2 | `tests/unit/schema-and-migration.test.ts`, `tests/unit/project-contract.test.ts` | The two files themselves: `FEATURE_4_DECLARATIONS` and the "exactly one model" assertion are gone, replaced by equalities over the nine models and three enums. Proved by mutation — transcripts under §Mutation proofs. |
| AC-3 | `prisma/schema.prisma:38-55`; migration SQL lines 1-5 | `tests/unit/schema-and-migration.test.ts` → "004 AC-3: Role, CountStatus and UnitKind carry Part 3's values in Part 3's order" and "004 AC-3: it creates the two new enum types with their labels in Part 3's order"; `src/server/schema/columns.db.test.ts` → "AC-3: enum_range returns Part 3's labels, in Part 3's order" |
| AC-4 | `prisma/schema.prisma` | `tests/unit/schema-and-migration.test.ts` → "004 AC-4: every model's scalar field list equals Part 3, exactly and in order" and "004 AC-4: every model's relation field list is exactly the spec's, and no more" |
| AC-5 | `prisma/schema.prisma:73-77` (three relation fields); migration SQL has no `ALTER TABLE "User"` | `tests/unit/schema-and-migration.test.ts` → "003 AC-2 / 004 AC-5: User keeps its eight scalar fields and gains exactly three relations", "004 AC-5: the three User relations carry the relation names StockCount points back with", "004 AC-23: the migration is additive …"; `src/server/schema/columns.db.test.ts` → "AC-5: User still has the same eight columns, types and nullabilities as #3 created" |
| AC-6 | `prisma/schema.prisma` `ItemPrice.unitPrice`, `StockCountLine.unitPriceSnapshot` | `src/server/schema/columns.db.test.ts` → "AC-6: ItemPrice.unitPrice is numeric(18,8) and NOT NULL"; "AC-6: StockCountLine.unitPriceSnapshot is numeric(18,8) and nullable while DRAFT"; "AC-6: those two are the only monetary columns in the schema" |
| AC-7 | `prisma/schema.prisma` `StockCountLine.quantity`, `Item.unitQuantityKg` | `src/server/schema/columns.db.test.ts` → "AC-7: StockCountLine.quantity and Item.unitQuantityKg are numeric(12,4)" |
| AC-8 | schema and both migrations | `tests/unit/schema-and-migration.test.ts` → "004 AC-8: no field in the schema is declared Float" and "004 AC-8: neither migration mentions DOUBLE PRECISION, REAL or FLOAT"; `src/server/schema/columns.db.test.ts` → "AC-8: no column in the public schema is double precision or real" |
| AC-9 | `Decimal(18,8)` / `Decimal(12,4)` columns | `src/server/schema/columns.db.test.ts` → "AC-9: 21.6128 tonnes and the =5.2/0.85 price come back exactly as written"; "AC-9: 0.475 reads back as 0.475, not 0.48 and not 0" |
| AC-10 | migration SQL `"quantity" DECIMAL(12,4),` | `tests/unit/schema-and-migration.test.ts` → "004 AC-10: it declares quantity nullable - no NOT NULL, no DEFAULT"; `src/server/schema/columns.db.test.ts` → "AC-10: quantity is nullable in information_schema" and "AC-10: a null quantity and a zero quantity are stored and queried apart" |
| AC-11 | no such column exists | `src/server/schema/columns.db.test.ts` → "AC-11: no column in the public schema is named like a stored value or total" and "AC-11: unitPrice and unitPriceSnapshot survive that regex and still exist"; `tests/unit/schema-and-migration.test.ts` → "004 AC-11: it creates no value, total or amount column" |
| AC-12 | `@@unique([locationId, periodYear, periodMonth])` | `src/server/schema/constraints.db.test.ts` → "AC-12: a second Dublin count for 2026-09 is refused even with a different day and status"; "AC-12: the next month at the same yard, and the same month at the other yard, both succeed" |
| AC-13 | `@@unique([itemId, locationId])` | `src/server/schema/constraints.db.test.ts` → "AC-13: a second link for the same item and yard is refused and creates no row"; "AC-13: the same item on the other yard succeeds, and the item then has two links" |
| AC-14 | `@@unique([itemId, effectiveFrom])` | `src/server/schema/constraints.db.test.ts` → "AC-14: a second price for the same item and effective date is refused"; "AC-14: a later effective date succeeds and the earlier price is untouched" |
| AC-15 | `@@unique([description, supplierId])` | `src/server/schema/constraints.db.test.ts` → "AC-15: the same description under the same supplier is refused"; "AC-15: the same description under a different supplier is a different item"; "AC-15: two supplier-less items with the same description both insert - NULLs are distinct" |
| AC-16 | `@@unique([stockCountId, itemId])` | `src/server/schema/constraints.db.test.ts` → "AC-16: a second line for the same item on the same count is refused"; "AC-16: the same item on a different count succeeds" |
| AC-17 | migration SQL, `Item_description_not_empty` | `src/server/schema/constraints.db.test.ts` → five tests: "AC-17: an empty description is refused through prisma.item.create"; "… a whitespace-only description …"; "… both are refused through $executeRaw too …"; "… an untrimmed description inserts …"; "… a null description is refused as NOT NULL …". Also `tests/unit/schema-and-migration.test.ts` → "004 AC-17 / AC-18: it adds the two CHECK constraints Prisma cannot express" |
| AC-18 | migration SQL, `StockCount_periodMonth_range` | `src/server/schema/constraints.db.test.ts` → "AC-18: month 0 and month 13 are both refused, and create no row"; "AC-18: month 1 and month 12 both succeed" |
| AC-19 | eleven `onDelete` clauses in `prisma/schema.prisma` | `src/server/schema/referential.db.test.ts` → "AC-19: the eight Restrict foreign keys report delete_rule RESTRICT"; "AC-19: the three Cascade foreign keys report delete_rule CASCADE"; "AC-19: those eleven are all of them, and none is SET NULL or NO ACTION" |
| AC-20 | the `Restrict` / `Cascade` policy | `src/server/schema/referential.db.test.ts` → "AC-20a…" through "AC-20e…", five tests. **Deviation on the error code — see below.** |
| AC-21 | migration SQL, final `INSERT … ON CONFLICT` | `tests/unit/schema-and-migration.test.ts` → "004 AC-21: it ends with an idempotent insert of exactly the two yards"; `src/server/schema/columns.db.test.ts` → "AC-21: Location holds exactly the two migration-seeded yards" and "AC-21: re-running the migration's insert adds no row and raises no error" |
| AC-22 | `@db.Date` on `countDate` and `effectiveFrom` | `src/server/schema/columns.db.test.ts` → "AC-22: countDate and effectiveFrom are date, not timestamp"; "AC-22: the day the yard was walked does not shift by a timezone" |
| AC-23 | `prisma/migrations/` | `tests/unit/schema-and-migration.test.ts` → "004 AC-23: prisma/migrations holds exactly two directories, in order"; "004 AC-23: migration_lock.toml still records provider postgresql and is unmodified"; "004 AC-23: the migration is additive - no DROP, no TRUNCATE, nothing aimed at User or Role"; "004 AC-23: it was written once and has not been edited since" (`git log --oneline` on the create_user SQL → exactly one commit, `3420561`) |
| AC-24 | `scripts/run-db-tests.mjs` runs `prisma migrate deploy` before any test | `src/server/schema/columns.db.test.ts` → "AC-24: both migrations are applied, in order, and none was rolled back". Proved from an empty database — transcript under §Mutation proofs, "AC-24 from scratch". |
| AC-25 | `init.ps1` / `init.sh` Database step, unchanged | Both scripts exit `0` with `[ok] prisma migrate status`, `[ok] npm run test:db`, no `[skip]` line, ending exactly `[OK] Environment ready`. The gate is proved **red** as well as green — transcript under §Mutation proofs, "AC-25 red gate". |
| AC-26 | nothing added opens a connection at import time — `src/server/db.ts` is still a lazy proxy and the new files import only `@/server/db` | Re-proved with all four variables pointed at an RFC 2606 `.invalid` host — transcript under §Mutation proofs, "AC-26 with no database". |
| AC-27 | the three new files are `*.db.test.ts` under `src/server/schema/`; no config change | `tests/unit/project-contract.test.ts` → "004 AC-27: src/server/schema holds only *.db.test.ts files"; "004 AC-27 / 003 AC-26: test:unit excludes *.db.test.ts and test:db includes exactly them". `npm run test:db` executes 7 files (3 new + 4 pre-existing); `npm run test:unit` executes 14 files, none of them `*.db.test.ts`. |
| AC-28 | `src/server/test-db.ts` | `src/server/schema/referential.db.test.ts` → "AC-28: it empties all eight owned tables in foreign-key-safe order"; "AC-28: it restores Location to exactly the two migration rows"; "AC-28: calling it twice in succession succeeds". Order-independence proved — see §Mutation proofs, "AC-28 order independence". |
| AC-29 | `@@index` / `@@unique` on every foreign-key column | `src/server/schema/referential.db.test.ts` → "AC-29: each one leads at least one index - Postgres does not index them for us", plus "AC-29: the parser used above actually reads a leading column", which stops the first test passing vacuously |
| AC-30 | — | `npm run test:unit` 14 files / 79 tests, `npm run test:db` 7 files / 79 tests, `npm run test:e2e` green in `init`; `npm run lint` and `npm run typecheck` exit `0`. The four pre-existing `*.db.test.ts` files pass with no assertion weakened or removed — the only change to them is the import specifier. `tests/unit/hashing-boundary.test.ts` → "004 AC-31 replacing 003 AC-31 …" proves no `src/app/`, `src/components/` or `src/lib/` file imports `PrismaClient`. |
| AC-31 | no path under `src/app/`, `src/components/` or `src/lib/` was touched; no action, route or service added | `tests/unit/project-contract.test.ts` → "004 AC-31: no shipping module under src/ or scripts/ mentions unitPrice yet" (with the non-vacuity assertion that it inspected `src/server/db.ts`); `tests/unit/hashing-boundary.test.ts` → the replaced guard. `git status --porcelain` lists exactly the permitted set — reproduced under §Verification output. |

## Verification output

`bash ./init.sh` → exit `0`, and `./init.ps1` → exit `0`. Identical step lists; the bash
run in full:

```
==> Harness integrity
    [ok]   17 required files present
==> Feature list
    [ok]   feature_list.json parses
    [ok]   18 features, 1 in progress
==> Source workbook untouched
    [ok]   Samples/ has no uncommitted changes
==> Application
    [ok]   node v24.14.0
    [ok]   node_modules present
    [ok]   prisma schema valid
    [ok]   npm run typecheck
    [ok]   npm run lint
    [ok]   npm run test:unit
    [ok]   npm run test:e2e
==> Database
    [ok]   database reachable
    [ok]   prisma migrate status
    [ok]   npm run test:db

[OK] Environment ready
```

`[OK] Environment ready` in its **full** form — no `[skip]` line, not
`(database checks skipped)` — so CHECKPOINTS.md C2.1 is satisfied on both scripts.

The two suites inside that run:

```
npm run test:unit    Test Files  14 passed (14)    Tests  79 passed (79)
npm run test:db      Test Files   7 passed  (7)    Tests  79 passed (79)
```

`npx prisma migrate status`:

```
2 migrations found in prisma/migrations

Database schema is up to date!
```

The file set this feature changed — AC-31's list, and nothing else:

```
 M feature_list.json
 M prisma/schema.prisma
 M progress/current.md
 M specs/features/004-domain_schema.md
 M src/server/auth/admin-create.db.test.ts
 M src/server/auth/credentials-logging.db.test.ts
 M src/server/auth/session.db.test.ts
 M src/server/auth/user-service.db.test.ts
RM src/server/auth/test-db.ts -> src/server/test-db.ts
 M tests/unit/hashing-boundary.test.ts
 M tests/unit/project-contract.test.ts
 M tests/unit/schema-and-migration.test.ts
?? prisma/migrations/20260909135148_create_stock_domain/
?? progress/impl_domain_schema.md
?? src/server/schema/
```

No path under `src/app/`, `src/components/` or `src/lib/`. `Samples/` untouched
(`init`'s own check). `prisma/migrations/migration_lock.toml` clean.

## Mutation proofs

A green test proves nothing until it has been seen to go red for the right reason. Four
mutations, each reverted.

### AC-2 — the schema guard, mutated twice

**(a) Add a tenth model.** Appended `model Vehicle { id String @id @default(cuid()) }` to
`prisma/schema.prisma`. `npm run test:unit` → **exit 1**, three failures, each naming it:

```
FAIL tests/unit/project-contract.test.ts > project contract >
     AC-6 (002) narrowed by 003 AC-1, replaced by 004 AC-1: … exactly the nine models …
     AssertionError: expected [ 'enum Role {', …(12) ] to deeply equal [ 'enum Role {', …(11) ]
     +   "model Vehicle {",

FAIL tests/unit/schema-and-migration.test.ts > prisma schema declarations >
     004 AC-1: declares exactly nine models and exactly three enums, compared as sets
     AssertionError: expected [ 'Item', 'ItemLocation', …(8) ] to deeply equal [ …(7) ]
     +   "Vehicle",

FAIL tests/unit/schema-and-migration.test.ts > prisma schema declarations >
     004 AC-1: no M7 declaration appears anywhere in the file
     AssertionError: expected [ …(244) ] to not include 'model Vehicle {'
```

The third is the sharpest: `Vehicle` is an M7 model, and the guard says so by name.

**(b) Delete `model ItemPrice`.** `npm run test:unit` → **exit 1**, five failures:

```
FAIL tests/unit/project-contract.test.ts > project contract > AC-6 (002) … replaced by 004 AC-1
     -   "model ItemPrice {",
FAIL tests/unit/schema-and-migration.test.ts > 004 AC-1: declares exactly nine models …
     -   "ItemPrice",
FAIL tests/unit/schema-and-migration.test.ts > 004 AC-4: every model's scalar field list …
FAIL tests/unit/schema-and-migration.test.ts > 004 AC-4: every model's relation field list …
FAIL tests/unit/schema-and-migration.test.ts > 004 AC-8: no field in the schema is declared Float
```

**Reverted.** `npx prisma validate` exit `0`; `npm run test:unit` → 14 files, 79 tests,
exit `0`.

### AC-25 — the gate goes red, not only green

`ALTER TABLE "Item" DROP CONSTRAINT "Item_description_not_empty";` against
`TEST_DATABASE_URL`, confirmed gone (`SELECT conname FROM pg_constraint …` returned an
empty list).

```
npm run test:db   ->  exit 1
                      Test Files  1 failed | 6 passed (7)
                           Tests  3 failed | 76 passed (79)

  FAIL src/server/schema/constraints.db.test.ts
       > AC-17: an empty description is refused through prisma.item.create
       > AC-17: a whitespace-only description is refused through prisma.item.create
       > AC-17: both are refused through $executeRaw too - the rule is Postgres', not Prisma's

  Error: expected the database to refuse this write through Item_description_not_empty,
         but it succeeded

bash ./init.sh    ->  exit 1
./init.ps1        ->  exit 1

    [ok]   database reachable
    [ok]   prisma migrate status
    [FAIL] npm run test:db failed

[FAILED] 1 problem(s):
  - npm run test:db failed
```

Both scripts name the failure, and the failing assertion names the constraint.

> The first attempt at this transcript said only `expected the database to refuse, but the
> write succeeded`, which tells a reader that *something* stopped being enforced but not
> *what*. `rejection()` in both new test files now takes the name of the constraint that
> should have refused, and the transcript above was re-taken. That is the one thing this
> red-gate exercise changed in the code, and it made the gate more useful, not less strict.

**Restored** with the `ALTER TABLE … ADD CONSTRAINT` from the migration.
`pg_get_constraintdef` reads back `CHECK ((btrim(description) <> ''::text))`, and
`npm run test:db` → 7 files, 79 tests, exit `0`. **The test database is not left mutated.**

### AC-24 — from an empty database

`DROP SCHEMA public CASCADE; CREATE SCHEMA public;` on the test branch — no tables, no
`_prisma_migrations`.

```
prisma migrate deploy   ->  exit 0
    Applying migration `20260908224453_create_user`
    Applying migration `20260909135148_create_stock_domain`
    All migrations have been successfully applied.

prisma migrate status   ->  exit 0
    2 migrations found in prisma/migrations
    Database schema is up to date!
```

And the data the migration is responsible for came with it:

```
SELECT id, code, name, active, "sortOrder" FROM "Location" ORDER BY "sortOrder"
  [{"id":"loc_dublin","code":"DUBLIN","name":"Dublin","active":true,"sortOrder":1},
   {"id":"loc_clonmel","code":"CLONMEL","name":"Clonmel","active":true,"sortOrder":2}]

SELECT conname FROM pg_constraint WHERE contype='c' …
  Item_description_not_empty
  StockCount_periodMonth_range
```

`npm run test:db` immediately afterwards: 7 files, 79 tests, exit `0`.

### AC-28 — order independence

```
npm run test:db                                -> exit 0   7 files / 79 tests
npm run test:db                                -> exit 0   7 files / 79 tests  (twice in a row)
npm run test:db -- <the seven files, reversed>
                   --sequence.shuffle.files    -> exit 0   7 files / 79 tests
```

The executed order really did differ — the first run began
`admin-create → referential → constraints → columns …`, the reversed run began
`referential → constraints → columns → user-service …`, and the shuffled run began
`referential → credentials-logging → session …`.

### AC-26 — with no database at all

All four connection variables pointed at `db.invalid` / `test-db.invalid`, hostnames under
an RFC 2606 reserved TLD that can never resolve:

```
npx prisma validate   -> exit 0        npm run lint       -> exit 0
npx prisma generate   -> exit 0        npm run test:unit  -> exit 0
npm run typecheck     -> exit 0        npm run build      -> exit 0

bash ./init.sh        -> exit 0
./init.ps1            -> exit 0
==> Database
[skip] database unreachable at db.invalid - database-dependent checks skipped
[OK] Environment ready (database checks skipped)
```

Neither script invoked `npm run test:db` (`grep -c` on the transcript returned `0`).
Nothing this feature adds opens a connection at import time: `src/server/db.ts` is still a
lazy proxy, and the three new test files import only `@/server/db` and `@/server/test-db`.
The variables were set in the environment rather than by editing `.env`, which
`scripts/db-probe.mjs` documents as the supported way to do exactly this.

## Deviations from the spec — all four settled by amendment

Kept as a record: three of these are real defects the harness caught and one is a reading
the user ratified, and the reviewer should see both the finding and how it was settled.
**None of them was worked around, and the spec was not edited by the implementer.** The
implementation stopped at the one that made the
gate unsatisfiable, the user amended the spec, and the session resumed. All four are now
written up in `specs/features/004-domain_schema.md` § Post-approval amendments.

1. **AC-31's file list contradicted AC-27, AC-28 and AC-30.** — *Resolved, amendment §1.*
   AC-28 puts `resetTestDb()` at `src/server/test-db.ts` and AC-27 puts the three new
   tests under `src/server/schema/`; both must reach Prisma, and #3's
   `tests/unit/hashing-boundary.test.ts:143` asserted every such importer lives under
   `src/server/auth/`. AC-30 requires `npm run test:unit` to pass, and AC-31 did not permit
   changing that file. AC-28 ∧ AC-27 ∧ AC-30 ⟹ ¬AC-31, with no third way: a re-export shim
   under `src/server/auth/` would not help, because `src/server/test-db.ts` is itself an
   importer.

   The feature was set to `blocked` and the session ended rather than touch a forbidden
   file. The user extended AC-31's list and chose `/^src\/server\//` — `CLAUDE.md`'s
   dependency rule stated directly — over enumerating the permitted directories, which
   would need editing again for #6's `items/`, #7's `counts/` and #11's `reporting/`.

   **Corrected after review.** This paragraph originally called the new regex "a
   replacement, not a weakening … it additionally covers `src/lib/`, which neither existing
   test checked". That was false, and it came from the spec, which came from the
   coordinator — not from measurement. `codeFiles()` spans all of `src/`, `scripts/` and
   `prisma/`, so #3's regex was already applied to `src/lib/` files and already rejected
   them: `/^src\/server\/(auth\/|db(\.test)?\.ts$)/.test("src/lib/anything.ts")` is `false`.
   The reviewer disproved the claim by planting `src/lib/reviewer-leak.ts` importing
   `@/server/db`; both the old and the new regex reject it.

   What is true: as a predicate, `/^src\/server\//` accepts a **strict superset** of what
   #3's accepted. It is a **weakening** of that one assertion — bounded, forced by
   AC-27 ∧ AC-28 ∧ AC-30, and architecturally correct, because everything it now permits is
   permitted by `CLAUDE.md` and `docs/architecture.md`. Nothing documented is left
   unguarded. The code comment at `tests/unit/hashing-boundary.test.ts` now says exactly
   this, so #6, #7 and #11 inherit the measurement rather than the claim.

2. **AC-20 asked for an error AC-19 makes impossible.** — *Resolved, amendment §2.*
   AC-20(b) and (c) named Prisma `P2003` / `P2014`. Because AC-19 mandates
   `ON DELETE RESTRICT`, Postgres refuses with SQLSTATE `23001` (`restrict_violation`) and
   Prisma relays it as a `PrismaClientUnknownRequestError` with **no** `code`. `P2003` is
   `23503`, which is what a `NO ACTION` key gives — and `NO ACTION` is precisely what AC-19
   forbids. Observed verbatim:

   ```
   PostgresError { code: "23001", message: "update or delete on table \"Item\" violates
   RESTRICT setting of foreign key constraint \"StockCountLine_itemId_fkey\" on table
   \"StockCountLine\"" }
   ```

   `referential.db.test.ts` asserted the stronger true thing from the start — SQLSTATE
   `23001`, the text `violates RESTRICT setting of foreign key constraint`, and the
   constraint's own name — and needed no change when AC-20 was amended to say exactly that.
   The amended criterion is stricter than the one it replaces: the old one would have
   passed on a `NO ACTION` key.

3. **AC-12 – AC-16: what "a `P2002` naming the constraint" can mean.** — *Ratified,
   amendment §3.* Prisma 6 does not put the constraint name in a `P2002`; it reports the
   model and the offending fields, and the `$executeRaw` path yields Postgres' DETAIL
   (`Key (…)=(…) already exists`), which also omits the name.
   `expectUniqueViolation()` in `constraints.db.test.ts` therefore requires **both** halves,
   which together are stronger than the name alone: a `P2002` whose reported target is
   exactly the constraint's column list, from which the index name is composed, **and** a
   `CREATE UNIQUE INDEX` of exactly that name in `pg_indexes`.

4. **AC-31's `unitPrice` clause was over-literal.** — *Resolved, amendment §4.* Read
   literally, "no query … outside a `*.db.test.ts` file" fails on
   `src/lib/money-boundary.test.ts`, which has used the string as a fixture since #3, and
   on the two unit tests that quote the criterion itself. The criterion now scans
   **shipping** modules — anything under `src/` or `scripts/` that is not a `*.test.ts` —
   and asserts the scan inspected `src/server/db.ts` so it cannot pass vacuously. That is
   what the test implements.

## Notes for the reviewer

- **`prisma migrate dev` rewrites `prisma/migrations/migration_lock.toml`.** The installed
  CLI writes a different comment header from the one #3 committed. AC-23 requires that
  file unmodified, so it was restored with `git checkout --`. There is now a test that
  fails if it drifts again — "004 AC-23: migration_lock.toml still records provider
  postgresql and is unmodified" runs `git status --porcelain` on it. Worth knowing for #5.
- **Nothing imports `@prisma/client` outside `src/server/db.ts`.** The first draft of
  `columns.db.test.ts` imported `Prisma` for `Prisma.Decimal`; it was removed, because
  `src/server/db.ts` documents itself as the only such importer. Prisma accepts decimal
  strings for both writing and filtering, so the tests pass `"21.6128"` and `"0"` and the
  values still come back as `Decimal` instances.
- **The red-gate exercise changed one thing in the code, deliberately.** `rejection()` in
  both new test files now takes the name of the constraint that should have refused, so a
  red run says *which* rule stopped being enforced. Before that, AC-25's transcript read
  `expected the database to refuse, but the write succeeded`, which names nothing. This is
  the only code change the verification passes produced, and it makes the gate stricter to
  read, not looser.
- **AC-29's parser has a guard.** `leadingColumn()` returns `undefined` on an index
  definition it cannot parse, and `undefined === undefined` would have made the main
  assertion vacuous. The second test pins it against
  `ItemLocation_locationId_sortOrder_idx` and asserts it reads `locationId`.
- **AC-15 records a real gap rather than hiding it.** Two supplier-less items with the
  same description both insert, because Postgres treats `NULL`s as distinct. That is
  asserted, not worked around. `Dublin!A45` is the workbook row; de-duplicating it is #5's
  job and belongs in #5's spec.
- **`resetTestDb()` restores `Location` rather than preserving it.** A test that renames
  or archives `loc_dublin` would otherwise leave it that way for the next file. The reset
  deletes every invented `Location`, then upserts the two migration rows back to their
  migration values. `SEEDED_LOCATIONS` is exported so the assertion and the reset read the
  same constant.
- **The test database's SCHEMA is left exactly as the migrations make it.** It was emptied
  to bedrock (`DROP SCHEMA public CASCADE`) for the AC-24 proof and rebuilt by
  `prisma migrate deploy`, and the `Item_description_not_empty` constraint dropped for the
  AC-25 proof was restored and read back with `pg_get_constraintdef`. Its *rows* are
  another matter, and the reviewer was right to sharpen this: `resetTestDb()` runs in
  `beforeEach`, not `afterAll`, so a green suite leaves behind whatever the last file to
  run seeded — today one `User`, one `ItemType`, one `Item` and one `StockCount` from
  `columns.db.test.ts`. That is #3's design and harmless, because the next run empties
  them before its first assertion. The development database was never mutated by any of
  it — `npx prisma migrate status` against `DATABASE_URL` reports up to date.
- **`#4` is left `in_progress`.** Closing it is the user's call after a reviewer run.

## Review outcome

**APPROVED — no required changes.** Full report: `progress/review_domain_schema.md`.

All 31 criteria PASS. The reviewer did not take anything from this report: it re-executed
the AC-2 and AC-25 mutations itself, re-queried every `information_schema` and `pg_indexes`
assertion against the test branch, rebuilt that branch from `DROP SCHEMA public CASCADE`
for AC-24, ran `init` green with the database checks executed, and confirmed both databases
and the working tree were left clean. Six of its own mutations, all reverted.

Two things it proved that this report could not:

- **AC-9 anchored to the workbook.** `SELECT round(5.2/0.85, 8)` on the same database
  returns `6.11764706` — so the value round-tripped is the workbook formula's exact 8-place
  value, not a literal that happens to look like it.
- **AC-20's amendment is genuinely stricter.** The reviewer built a throw-away
  parent/child pair under `ON DELETE NO ACTION` and one under `ON DELETE RESTRICT` in a
  rolled-back transaction: `23503` and `23001` respectively. So the original `P2003` was
  obtainable *only* from a key AC-19 forbids — the old criterion could have been satisfied
  only by violating another one.

### Observation 1 — acted on, in this session

The comment at `tests/unit/hashing-boundary.test.ts` claimed the widened regex was
"stronger in one respect, because it also covers `src/lib/`". **That was false.** The
reviewer disproved it by planting `src/lib/reviewer-leak.ts` importing `@/server/db`: #3's
regex rejects it too, because `codeFiles()` already spanned `src/`, `scripts/` and
`prisma/`. The claim originated in the spec and in the coordinator's briefing, not in a
measurement.

The comment now states the measured truth — `/^src\/server\//` accepts a strict superset of
what #3's regex accepted, so it is a **bounded, forced, architecturally correct weakening**
— and points at both the spec's amendment §1 and the review's Observation 1. §1 of
*Deviations* above is corrected in the same terms. Nothing else changed: the assertion, the
two non-vacuity checks and the `it(...)` title are untouched, and `init` was re-run green
afterwards.

### Observations 2–6 — carried forward, none blocking

| # | What | Whose |
|---|------|-------|
| 2 | AC-6's "only two monetary columns" test filters column names by `/price/i`, so a future `cost`, `rate` or `eurPerTonne` would slip past **that** assertion. The gap is closed today by AC-4's exact per-model field lists and AC-11's `/value\|total\|amount/i` scan, and no such column exists. **Widen the filter when #5 or #9 next opens `columns.db.test.ts`.** | **#5 / #9** |
| 3 | `resetTestDb()` runs in `beforeEach`, not `afterAll`, so a green `npm run test:db` leaves the last file's rows behind. Harmless and #3's design — but do not write "the test database is left empty" in a report. Corrected in *Notes for the reviewer* above. **If #5's seed tests want a clean finish, that is an `afterAll` to add deliberately, not a bug to fix in passing.** | **#5** |
| 4 | `expectRestrictViolation` (`referential.db.test.ts`) matches `code: "23001"` inside `String(error)`, because Prisma leaves `error.code` undefined for a RESTRICT refusal. That couples it to Prisma's debug rendering of `ConnectorError`. It fails loudly rather than silently, which is the right failure mode — but **if any session bumps the `prisma` / `@prisma/client` version, check these two tests first before assuming a regression.** | whoever bumps Prisma |
| 5 | Import order in the four re-pointed `*.db.test.ts` files puts `@/server/test-db` before `@/server/db`. `docs/conventions.md` does not order within the `@/` group and lint is green. Cosmetic; left alone deliberately, because AC-28 says those files change by import **path** only. | nobody |
| 6 | `blockBody()` in `tests/unit/schema-and-migration.test.ts` fails with `expected -1 to be greater than or equal to 0` when a whole model is missing, which does not name the model. The two set-equality assertions in the same run do name it, so the AC-2 mutation is still diagnosable — but a `blockBody` that threw `model ItemPrice not found` would be kinder. **Worth doing when that file is next edited.** | whoever next edits that file |

### Status

`#4` stays `in_progress`. Closing a feature is the user's call, after this review — not the
implementer's and not the reviewer's.
