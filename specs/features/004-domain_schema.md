# 004 — Domain schema and first stock migration

**Feature id:** 4   **Status:** approved   **Approved:** 2026-09-09
**Depends on:** #3 `auth_and_roles` (owns `User` and `Role`, and the first migration)

## Purpose

Every feature from #5 onward writes to tables that do not exist yet. This feature creates
them: the eight stock-domain models of `specs/domain-model.md` Part 3, the second
migration, and the model-level tests that prove the constraints are enforced by
**Postgres** rather than by a form.

What breaks without it: #5 has nothing to seed, #7 has no `StockCount` to key by period,
#8 has no nullable `quantity` with which to say "nobody looked", and #9 has no
`unitPriceSnapshot` to freeze. More sharply — the four rules that make this app better
than the workbook it replaces are all schema rules. `value` is not a column (Invariant 1).
`quantity` is nullable, so *not counted* and *counted as none* are different facts
(Invariant 5). Money is `Decimal(18,8)`, so the totals do not drift from the file being
replaced (Invariant 10). One count per yard **per month**, not per day (Invariant 6).
If those are not true in the database, they are not true anywhere.

## Scope boundary

`specs/features/003-auth_and_roles.md` narrowed #4 deliberately: **#3 owns `User` and the
`Role` enum**, and **#4 owns every other model in Part 3**. This feature delivers exactly
that remainder, plus its migration and its tests, and delivers **no UI, no route, no
server action and no service**. Seeding real rows is #5; screens start at #6.

The M7 models — `Vehicle`, `BoilerReading`, `BagReading`, `YardBulkReading` and the
`BoilerMaterial` / `BagMaterial` enums — stay out, exactly as Part 3 says. `Q7` and `Q8`
in `specs/domain-model.md § Still open` block only M7 and do not touch this feature.

## User stories

- As an **ADMIN**, I can be sure that changing a price next year cannot alter last year's
  count total, because a submitted line carries its own `unitPriceSnapshot` column and the
  value is never stored.
- As an **ADMIN**, I can archive a one-off item that has not been on stock for a year and
  find every historical line that mentions it still intact, because archival is
  `active = false` and the database refuses to delete an item a count line references.
- As a **YARD_STAFF** user, I can leave a row untouched and have the system know I never
  looked at it, rather than record a zero I did not count.
- As the **owner**, I can be sure two people cannot open two competing counts for Dublin
  in September, because the database rejects the second one — not a screen that happened
  to check first.
- As an **implementer of #5–#12**, I can read one schema that matches
  `specs/domain-model.md` Part 3 field for field, and trust that any drift from it turns
  `npm run test:unit` red.

## Data touched

Eight new models, two new enums, one migration. `User` gains three **relation** fields and
no columns. Nothing existing is dropped, renamed or re-typed.

### The schema this feature adds

```prisma
enum CountStatus { DRAFT SUBMITTED APPROVED }

enum UnitKind { TONNE KILOGRAM LITRE UNIT LINEAR_METRE }

model Location {
  id          String  @id @default(cuid())
  code        String  @unique          // DUBLIN, CLONMEL
  name        String
  active      Boolean @default(true)
  sortOrder   Int     @default(0)

  itemLinks   ItemLocation[]
  stockCounts StockCount[]
}

model Supplier {
  id     String  @id @default(cuid())
  name   String  @unique
  active Boolean @default(true)

  items  Item[]
}

model ItemType {
  id        String @id @default(cuid())
  code      String @unique
  name      String
  sortOrder Int    @default(0)

  items     Item[]
}

model Item {
  id             String   @id @default(cuid())
  description    String                                  // NOT NULL + CHECK non-empty
  supplierId     String?                                 // Dublin!A45 has no supplier
  itemTypeId     String
  unitLabel      String?
  unitKind       UnitKind @default(UNIT)
  unitQuantityKg Decimal? @db.Decimal(12, 4)
  active         Boolean  @default(true)
  needsReview    Boolean  @default(false)
  notes          String?

  supplier  Supplier? @relation(fields: [supplierId], references: [id], onDelete: Restrict)
  itemType  ItemType  @relation(fields: [itemTypeId], references: [id], onDelete: Restrict)
  prices    ItemPrice[]
  locations ItemLocation[]
  lines     StockCountLine[]

  @@unique([description, supplierId])
  @@index([itemTypeId])
  @@index([supplierId])
}

model ItemPrice {
  id            String   @id @default(cuid())
  itemId        String
  unitPrice     Decimal  @db.Decimal(18, 8)              // Invariant 10
  currency      String   @default("EUR")
  effectiveFrom DateTime @db.Date
  label         String?
  createdAt     DateTime @default(now())

  item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

  @@unique([itemId, effectiveFrom])
}

model ItemLocation {
  id         String  @id @default(cuid())
  itemId     String
  locationId String
  sortOrder  Int     @default(0)
  active     Boolean @default(true)

  item     Item     @relation(fields: [itemId], references: [id], onDelete: Cascade)
  location Location @relation(fields: [locationId], references: [id], onDelete: Restrict)

  @@unique([itemId, locationId])
  @@index([locationId, sortOrder])
}

model StockCount {
  id           String      @id @default(cuid())
  locationId   String
  periodYear   Int
  periodMonth  Int                                       // CHECK 1..12
  countDate    DateTime    @db.Date
  status       CountStatus @default(DRAFT)
  createdById  String
  submittedAt  DateTime?
  approvedById String?
  approvedAt   DateTime?
  notes        String?
  signedById   String?
  signedAt     DateTime?
  signatureSvg String?                                   // SVG path data, Invariant 11

  location   Location @relation(fields: [locationId], references: [id], onDelete: Restrict)
  createdBy  User     @relation("StockCountCreatedBy",  fields: [createdById],  references: [id], onDelete: Restrict)
  approvedBy User?    @relation("StockCountApprovedBy", fields: [approvedById], references: [id], onDelete: Restrict)
  signedBy   User?    @relation("StockCountSignedBy",   fields: [signedById],   references: [id], onDelete: Restrict)
  lines      StockCountLine[]

  @@unique([locationId, periodYear, periodMonth])
  @@index([periodYear, periodMonth])
  @@index([createdById])
  @@index([approvedById])
  @@index([signedById])
}

model StockCountLine {
  id                String   @id @default(cuid())
  stockCountId      String
  itemId            String
  quantity          Decimal? @db.Decimal(12, 4)          // NULL = not counted; 0 = none held
  unitPriceSnapshot Decimal? @db.Decimal(18, 8)          // NULL while DRAFT, Invariant 2
  note              String?

  stockCount StockCount @relation(fields: [stockCountId], references: [id], onDelete: Cascade)
  item       Item       @relation(fields: [itemId], references: [id], onDelete: Restrict)

  @@unique([stockCountId, itemId])
  @@index([itemId])
}
```

The field lists above are the normative ones. They are `specs/domain-model.md` Part 3
verbatim, with nothing added: no `createdAt` / `updatedAt` beyond the `ItemPrice.createdAt`
Part 3 names, and no audit column. `Item.notes` is plural and `StockCountLine.note` is
singular because that is what Part 3 says; the asymmetry is preserved rather than tidied,
so schema and domain model can be compared line by line.

### What `User` gains

Prisma requires the opposite side of every relation, so `User` gains three relation fields
— `stockCountsCreated`, `stockCountsApproved`, `stockCountsSigned` — carrying the relation
names `StockCountCreatedBy`, `StockCountApprovedBy`, `StockCountSignedBy`. **Relation
fields are not columns**: the migration emits no `ALTER TABLE "User"`, and `User` keeps the
same eight columns #3 created. The foreign keys live on `StockCount`.

### Two things not left vague

**1. The two `Location` rows are created by this feature's migration.**
`feature_list.json` gives #5 "Suppliers, ItemTypes, Items, ItemPrices and ItemLocation" —
`Location` belongs to no feature, and a table that must never be empty for Invariant 7
("a period is complete only when every `active` Location has an `APPROVED` count") cannot
belong to nobody. `Location` is also not workbook-derived data in the way items are: it is
a closed set of two yards fixed by `specs/product-brief.md`, not something the importer
discovers. So the migration ends with an idempotent
`INSERT … ON CONFLICT ("code") DO NOTHING` of `DUBLIN`/`Dublin`/`1` and
`CLONMEL`/`Clonmel`/`2`, with the literal ids `loc_dublin` and `loc_clonmel` so that
development, test and production agree on them. Every database that has the migrations
applied — including the test branch, on every `npm run test:db` — has both yards.

**2. Referential behaviour, chosen per relation.** `docs/conventions.md` requires an
explicit `onDelete` on every foreign key. The policy below has one intent: **an entity that
history refers to cannot be deleted, and rows that are merely parts of another row go with
their parent.**

| Foreign key | `onDelete` | Why |
|---|---|---|
| `StockCountLine.item` | `Restrict` | The rule from Part 5 — "archiving never alters historical lines". Deleting an item that any count line mentions is refused by Postgres. Archival is `active = false`, and is the only way an item leaves a sheet. |
| `StockCountLine.stockCount` | `Cascade` | A line is part of its count, not an independent record. Deleting a `DRAFT` count takes its lines. (Refusing to delete an `APPROVED` count is #9's rule, not the schema's.) |
| `StockCount.location` | `Restrict` | Deleting a yard must not silently delete its count history. Yards are archived with `active = false`. |
| `StockCount.createdBy` / `approvedBy` / `signedBy` | `Restrict` | A count records who counted, approved and signed. #3 removes a person with `active = false`; deleting them would erase the signature's owner. |
| `ItemPrice.item` | `Cascade` | A price-list entry has no existence apart from its item. Combined with the `Restrict` above, an item is deletable **exactly when no count line mentions it** — which is the useful behaviour for an item typed in by mistake. |
| `ItemLocation.item` | `Cascade` | A yard assignment is a link, meaningless without the item. |
| `ItemLocation.location` | `Restrict` | Deleting a yard must not silently unassign every item on it. |
| `Item.supplier` (optional) | `Restrict` | Prisma would otherwise default an optional relation to `SetNull`, quietly turning a Kelly item into a supplier-less one. Suppliers carry `active`; archive, do not delete. |
| `Item.itemType` | `Restrict` | Same reasoning. |

`onUpdate` stays at Prisma's default (`Cascade`) throughout: every id is a `cuid` written
once and never changed, so no update can propagate.

### Constraints Prisma cannot express, written into the migration by hand

Two `CHECK` constraints are added to the generated SQL after
`npx prisma migrate dev --create-only --name create_stock_domain`, because Prisma's schema
language has no syntax for them:

```sql
ALTER TABLE "Item"
  ADD CONSTRAINT "Item_description_not_empty" CHECK (btrim("description") <> '');

ALTER TABLE "StockCount"
  ADD CONSTRAINT "StockCount_periodMonth_range" CHECK ("periodMonth" BETWEEN 1 AND 12);
```

The first is Invariant 9 taken literally — "required and non-empty, enforced at the
database **and** at every form". `NOT NULL` alone lets `''` and `'   '` through, which is
precisely the blank-description row Part 2 says the importer must fail loudly on. The
second is not a new domain rule; it is what "month" means, and it is the difference between
a mistyped period and a count that silently belongs to month 13 forever.

### Environment

None added. `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` already
exist from #2 and #3. The migration is created and applied through `DIRECT_URL`, because
`prisma migrate` fails through Neon's pooler.

## Contract

No route, no server action and no service function. The public surface of this feature is
the database schema itself, plus one test helper:

| Module | Export | Change |
|---|---|---|
| `src/server/test-db.ts` | `resetTestDb(): Promise<void>` | **Moved** from `src/server/auth/test-db.ts` — it is no longer auth-specific — and extended to empty the eight new tables in foreign-key-safe order, then restore `Location` to exactly the two migration-seeded rows. Its `MACROADS_TEST_DB` guard is unchanged. The four existing `*.db.test.ts` files change by import path only. |

New test files, all `*.db.test.ts` so `vitest.db.config.ts` (`src/**/*.db.test.ts`) picks
them up with no configuration change:

| File | Proves |
|---|---|
| `src/server/schema/columns.db.test.ts` | Column types, precision, nullability, and the absence of a stored value |
| `src/server/schema/constraints.db.test.ts` | The five unique constraints and the two `CHECK` constraints, as domain rules |
| `src/server/schema/referential.db.test.ts` | The `onDelete` policies, and that history survives archival |

`src/server/schema/` holds tests and nothing else. These assertions belong to the schema,
which no aggregate service owns; `docs/architecture.md`'s `src/server/` layout gains a
directory rather than these tests being smuggled into `items/` or `counts/`, which #6 and
#7 will create for real.

## UI states

**This feature ships no UI**, so empty / loading / error / success are not applicable: it
renders nothing, fetches nothing, and has no screen to be in a state. Recorded here so the
boundary is deliberate rather than forgotten:

- **Empty:** the only "empty" this feature defines is `StockCountLine.quantity IS NULL` —
  not counted. Rendering it as distinct from `0` is #8's obligation, and this schema is what
  makes that possible.
- **Loading / Success:** owned by #6 onward.
- **Error:** the errors this feature produces are Postgres constraint violations surfaced
  by Prisma (`P2002` unique, `P2003` foreign key, and a raw check-constraint error). Mapping
  them onto `ConflictError` and `ValidationError` from `src/server/errors.ts` — for example
  the message `Count for DUBLIN in 2026-09 already exists` — belongs to the service that
  first performs the write, which is #7. This feature proves only that the database refuses.

## Acceptance criteria

1. **AC-1** — `prisma/schema.prisma` declares exactly nine models — `User`, `Location`, `Supplier`, `ItemType`, `Item`, `ItemPrice`, `ItemLocation`, `StockCount`, `StockCountLine` — and exactly three enums — `Role`, `CountStatus`, `UnitKind`. Both are asserted as **sets compared by equality**, not by count. `Vehicle`, `BoilerReading`, `BagReading`, `YardBulkReading`, `BoilerMaterial` and `BagMaterial` appear in no declaration anywhere in the file. `npx prisma validate` and `npx prisma generate` each exit `0` with no reachable database.
2. **AC-2** — The two guard tests written for #3 are **replaced, not deleted**. `tests/unit/schema-and-migration.test.ts` no longer asserts "exactly one model and one enum" and no longer scans for the ten names it called `FEATURE_4_DECLARATIONS`; `tests/unit/project-contract.test.ts` no longer asserts `declarations` equals `["enum Role {", "model User {"]`. Both are replaced by equality assertions over the full expected model and enum sets of AC-1, so the schema still cannot drift silently. Proved by mutation: adding a tenth model to `prisma/schema.prisma` makes `npm run test:unit` exit non-zero and name the offending declaration, and so does deleting `model ItemPrice`.
3. **AC-3** — The enums carry exactly the values of `specs/domain-model.md` Part 3, in Part 3's order: `CountStatus { DRAFT SUBMITTED APPROVED }` and `UnitKind { TONNE KILOGRAM LITRE UNIT LINEAR_METRE }`, with `Role { YARD_STAFF ADMIN }` unchanged. The migration SQL creates the two new Postgres types with those labels in that order, and `SELECT enum_range(NULL::"UnitKind")` against the database returns the five labels in that order.
4. **AC-4** — Every model's scalar field list equals, exactly and in order, the block in this spec's *Data touched* section, which is `specs/domain-model.md` Part 3 with nothing added: no `createdAt` / `updatedAt` on any model except the `ItemPrice.createdAt` Part 3 names, and no audit column. A test reads `prisma/schema.prisma` and asserts field-name equality per model, so an extra convenience column cannot arrive without a spec change.
5. **AC-5** — `User` gains three relation fields — `stockCountsCreated`, `stockCountsApproved`, `stockCountsSigned`, with relation names `StockCountCreatedBy`, `StockCountApprovedBy`, `StockCountSignedBy` — and no columns. The new migration SQL contains no `ALTER TABLE "User"`, and `information_schema.columns` for `"User"` returns the same eight column names, types and nullabilities as before the migration. `tests/unit/schema-and-migration.test.ts`'s 003 AC-2 assertion is updated to "these eight scalar fields, and exactly these three relation fields" rather than being relaxed to a subset check.
6. **AC-6** — Money is `Decimal(18,8)` in the **database**, not merely in the Prisma source. A test queries `information_schema.columns` and asserts that `"ItemPrice"."unitPrice"` is `numeric` with `numeric_precision = 18`, `numeric_scale = 8` and `is_nullable = 'NO'`, and that `"StockCountLine"."unitPriceSnapshot"` is `numeric(18,8)` with `is_nullable = 'YES'` (Invariant 2: null while `DRAFT`). These are the only two monetary columns in the schema.
7. **AC-7** — Quantity is `Decimal(12,4)` in the database: `"StockCountLine"."quantity"` and `"Item"."unitQuantityKg"` are both `numeric` with `numeric_precision = 12` and `numeric_scale = 4`, asserted from `information_schema.columns`.
8. **AC-8** — `Float` appears nowhere. No column in any table of the `public` schema has `data_type` in (`double precision`, `real`); no field in `prisma/schema.prisma` is declared `Float`; and neither migration's SQL contains `DOUBLE PRECISION`, `REAL` or `FLOAT`.
9. **AC-9** — Precision survives a round trip through Postgres. Writing `quantity = "21.6128"` and `unitPriceSnapshot = "6.11764706"` (the 8-place value of the workbook formula `=5.2/0.85`) and reading the row back yields `Decimal` values whose `.toString()` is exactly `"21.6128"` and `"6.11764706"`. Writing `quantity = "0.475"` reads back as `0.475` — not `0.48` and not `0`.
10. **AC-10** — `NULL` and `0` are different facts (Invariant 5). `"StockCountLine"."quantity"` is nullable: the migration SQL declares it without `NOT NULL` and without a default, and `information_schema` reports `is_nullable = 'YES'`. Two lines created on the same count, one with `quantity: null` and one with `quantity: 0`, read back as `null` and as a `Decimal` equal to `0`; a query filtering `quantity: null` returns exactly the first, and a query filtering `quantity: 0` returns exactly the second.
11. **AC-11** — Value is never a column (Invariant 1). A test lists every column of every table in the `public` schema and asserts that no column name matches `/value|total|amount/i` — so `value`, `lineValue`, `totalValue`, `lineTotal` and `amount` are all excluded — and separately that the migration SQL creates no such column. `unitPrice` and `unitPriceSnapshot` survive that regex and are, by AC-6, the only monetary columns.
12. **AC-12** — One count per yard **per month, not per day**. Given a `StockCount` for `DUBLIN` at `2026-09`, creating a second for `DUBLIN` at `2026-09` with a **different** `countDate` and a different `status` is rejected by the database with Prisma error `P2002` naming the constraint `StockCount_locationId_periodYear_periodMonth_key`, and `StockCount` still holds one row for that yard and period. The same location at `2026-10`, and `CLONMEL` at `2026-09`, both succeed.
13. **AC-13** — An item is assigned to a yard at most once. A second `ItemLocation` for the same `(itemId, locationId)` fails with `P2002` naming `ItemLocation_itemId_locationId_key` and creates no row; the same item linked to the other location succeeds, and the item then has exactly two links.
14. **AC-14** — A price list is versioned, never overwritten (Part 2). A second `ItemPrice` for the same `(itemId, effectiveFrom)` fails with `P2002` naming `ItemPrice_itemId_effectiveFrom_key`; the same item with a later `effectiveFrom` succeeds; and after the failed attempt and the successful one, both surviving rows are readable and the earlier row's `unitPrice` is exactly what it was written with.
15. **AC-15** — An item is `(description, supplierId)`. Creating a second `Item` with the same trimmed description **and the same supplier** fails with `P2002` naming `Item_description_supplierId_key`; the same description under a **different** supplier succeeds, because `Bicycle Logo's 1200mm` under `Kestrel` and under `Kelly` are two real items. Asserted rather than assumed: because Postgres treats `NULL`s as distinct, two items with the same description and **no** supplier both insert successfully — the database tolerates the supplier-less `Dublin!A45` row but does not de-duplicate it, and preventing a duplicate there is #5's job.
16. **AC-16** — One line per item per count. A second `StockCountLine` for the same `(stockCountId, itemId)` fails with `P2002` naming `StockCountLine_stockCountId_itemId_key` and creates no row; the same item on a different count succeeds.
17. **AC-17** — `Item.description` is required and non-empty **at the database** (Invariant 9). The migration adds by hand the constraint `Item_description_not_empty` — `CHECK (btrim("description") <> '')`. Inserting `''` and inserting `'   '` each fail with a Postgres error whose message contains `Item_description_not_empty`, through `prisma.item.create` and through `prisma.$executeRaw` alike, and the `Item` row count is unchanged in both cases. `'  White Extrusion 80/20  '` inserts successfully — the constraint forbids emptiness, not untrimmed input, and trimming remains the importer's rule from Part 2. A `null` description is refused as `NOT NULL`.
18. **AC-18** — `StockCount.periodMonth` is a month. The migration adds by hand the constraint `StockCount_periodMonth_range` — `CHECK ("periodMonth" BETWEEN 1 AND 12)`. Inserting `0` and inserting `13` each fail with a Postgres error naming `StockCount_periodMonth_range` and create no row; `1` and `12` both succeed.
19. **AC-19** — Every foreign key has the `onDelete` policy of this spec's referential-behaviour table, asserted from the database rather than from the schema file: a query over `information_schema.referential_constraints` returns `delete_rule = 'RESTRICT'` for `StockCountLine.itemId`, `StockCount.locationId`, `StockCount.createdById`, `StockCount.approvedById`, `StockCount.signedById`, `ItemLocation.locationId`, `Item.supplierId` and `Item.itemTypeId`, and `delete_rule = 'CASCADE'` for `StockCountLine.stockCountId`, `ItemPrice.itemId` and `ItemLocation.itemId`. No foreign key has `SET NULL` or `NO ACTION`.
20. **AC-20** — History cannot be deleted, and archival does not touch it. (a) Setting `Item.active = false` leaves every `StockCountLine` referencing that item unchanged — same `id`, same `quantity`, same `unitPriceSnapshot` — and the line is still readable through its count. (b) `prisma.item.delete` on an item that has at least one line is refused with a foreign-key error (`P2003` / `P2014`), and both the item and the line still exist afterwards. (c) `prisma.user.delete` on a user who created a count is refused for the same reason — deactivation, not deletion, is how #3 removes a person. (d) Deleting a `StockCount` deletes its lines and nothing else. (e) Deleting an item that has prices and location links but **no** lines succeeds and removes its `ItemPrice` and `ItemLocation` rows with it.
21. **AC-21** — The two yards exist as soon as the migrations are applied. The new migration's SQL ends with an `INSERT INTO "Location" … ON CONFLICT ("code") DO NOTHING` for exactly two rows, and after `npx prisma migrate deploy` against an empty database `Location` holds exactly two rows: `code = 'DUBLIN'`, `name = 'Dublin'`, `sortOrder = 1`, `active = true`, `id = 'loc_dublin'`; and `code = 'CLONMEL'`, `name = 'Clonmel'`, `sortOrder = 2`, `active = true`, `id = 'loc_clonmel'`. Applying the migration a second time against a database that already has them adds no row and raises no error.
22. **AC-22** — Dates are dates. `"StockCount"."countDate"` and `"ItemPrice"."effectiveFrom"` both report `data_type = 'date'` in `information_schema.columns`, not `timestamp without time zone`. Writing `countDate` as `2026-09-30` and reading it back yields a value whose `toISOString().slice(0, 10)` is exactly `"2026-09-30"`, so the calendar day the yard was walked cannot shift by a timezone.
23. **AC-23** — Migration hygiene: additive, second, and the first one untouched. `prisma/migrations` holds exactly two directories; the new one matches `/^\d{14}_create_stock_domain$/`; its SQL contains no `DROP TABLE`, no `DROP TYPE`, no `TRUNCATE` and no statement whose target is `"User"` or `"Role"` — the only occurrences of `"User"` in it are inside `REFERENCES "User"("id")` clauses. `git log --oneline -- prisma/migrations/<the create_user directory>/migration.sql` lists exactly one commit, and `prisma/migrations/migration_lock.toml` still records provider `postgresql` and is unmodified.
24. **AC-24** — The migrations apply to an empty database from scratch. `npx prisma migrate deploy` against a database with no `_prisma_migrations` table applies both migrations in order and exits `0`; `npx prisma migrate status` then exits `0` reporting the schema is up to date, with no pending migration and no drift. `npm run test:db` performs exactly this against `TEST_DATABASE_URL` before running a test, so it is proved on every run.
25. **AC-25** — `init`'s Database step stays green and is not skipped. With the database reachable, `./init.ps1` and `./init.sh` both exit `0`, print `[ok] prisma migrate status` and `[ok] npm run test:db`, print no `[skip]` line about the database, and end with exactly `[OK] Environment ready`. The gate goes red as well as green: removing the `Item_description_not_empty` constraint from the migration and re-applying it to the test database makes `npm run test:db` fail and both scripts exit `1` naming that failure.
26. **AC-26** — **Which checks survive with no database.** Given a `.env` whose `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all point at a hostname that does not resolve, each of `npx prisma validate`, `npx prisma generate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` still exits `0`; both `init` scripts exit `0`, do not invoke `npm run test:db`, and end with `[OK] Environment ready (database checks skipped)`. Nothing this feature adds opens a connection at import time.
27. **AC-27** — The two suites stay disjoint, per 003 AC-26. Every constraint test added here is named `*.db.test.ts` and lives under `src/server/schema/`, so `vitest.db.config.ts` needs no change; `npm run test:unit` executes zero files matching `**/*.db.test.ts`; `npm run test:db` executes the three new files as well as the four pre-existing ones; and `npm run test:db` still exits non-zero, before loading a test, when `TEST_DATABASE_URL` is unset or equals `DATABASE_URL`.
28. **AC-28** — `resetTestDb()` covers the new tables. It moves to `src/server/test-db.ts`, keeps its `MACROADS_TEST_DB` guard unchanged, and the only change to the four pre-existing `*.db.test.ts` files is the import path. After a fixture that populates all nine tables, `resetTestDb()` leaves `StockCountLine`, `StockCount`, `ItemPrice`, `ItemLocation`, `Item`, `Supplier`, `ItemType` and `User` with zero rows and raises no foreign-key error, and leaves `Location` holding exactly `DUBLIN` and `CLONMEL` with their migration ids — any other `Location` row is removed, and those two are not. Calling it twice in succession succeeds, and `npm run test:db` passes twice in a row and with the file order reversed.
29. **AC-29** — Every foreign-key column is indexed, because Postgres does not index them automatically. A query over `pg_indexes` asserts that each of `Item.supplierId`, `Item.itemTypeId`, `ItemPrice.itemId`, `ItemLocation.itemId`, `ItemLocation.locationId`, `StockCount.locationId`, `StockCount.createdById`, `StockCount.approvedById`, `StockCount.signedById`, `StockCountLine.stockCountId` and `StockCountLine.itemId` is the leading column of at least one index — whether from a `@@unique`, a `@@index`, or the composite `@@index([locationId, sortOrder])`.
30. **AC-30** — Nothing #3 shipped regresses. `npm run test:unit`, `npm run test:db` and `npm run test:e2e` all pass; the four pre-existing `*.db.test.ts` files pass with no assertion weakened or removed; `npm run lint` and `npm run typecheck` exit `0`; and no file under `src/app/` or `src/components/` imports `PrismaClient`.
31. **AC-31** — This feature adds no application surface. The set of files it changes contains no path under `src/app/`, `src/components/` or `src/lib/`; it adds no server action, no route handler and no exported service function; and no query anywhere in the repository returns `unitPrice` or `unitPriceSnapshot` to a caller outside a `*.db.test.ts` file. `git diff --name-only` for the feature lists only `prisma/schema.prisma`, one new migration directory, `src/server/test-db.ts` (moved), the three new `src/server/schema/*.db.test.ts` files, the four import-path edits, `tests/unit/schema-and-migration.test.ts`, `tests/unit/project-contract.test.ts`, `specs/features/004-domain_schema.md`, `feature_list.json` and files under `progress/`.

## Out of scope

- **Any screen, route, server action or service.** No `src/server/items/`, no
  `src/server/counts/`, no `src/app/` page. #6 builds the item master UI, #7 creates a
  count, #8 enters quantities, #9 submits and approves.
- **Seeding real data.** No supplier, item type, item, price or yard assignment is
  created. #5 `seed_from_workbook` owns all of it, applying the normalisation rules in
  `specs/domain-model.md` Part 2. The only rows this feature writes are the two `Location`
  reference rows, for the reason given above.
- **Crossing the money boundary.** `unitPriceSnapshot` is the first monetary column in the
  schema, but **no query returning it exists yet** — nothing is sent to any session, so
  Invariant 12 cannot yet be violated. `shapeForRole` from #3
  (`src/server/auth/role-shape.ts`) is the mechanism the later features use to build
  `CountForStaff` / `CountForAdmin`, and the deep-key assertion from 003 AC-19 is the test
  that proves it. The first real pair arrives with #8.
- **The lifecycle rules that live in services, not in columns.** The schema holds `status`,
  `submittedAt`, `signatureSvg` and `unitPriceSnapshot`; it does **not** enforce Invariant 2
  (snapshot written once, at submit), Invariant 3 (an `APPROVED` count is immutable and only
  an `ADMIN` reopens it), Invariant 5 (a null quantity blocks submission), Invariant 11 (no
  submission without a signature) or the Part 4 period defaulting from `countDate`. Those
  are #7 and #9, and a criterion here would be one no test in this feature could write.
- **Invariant 4's warning** — a line whose item has no `ItemPrice` contributing `0` with a
  visible warning — is a reporting rule for #11, not a constraint.
- **A `CHECK` on the sign or size of `quantity` or `unitPrice`.** `specs/domain-model.md`
  does not forbid a negative quantity or a zero price, and inventing either would be
  inventing a domain rule. Entry validation is #8's.
- **`NULLS NOT DISTINCT` on `(description, supplierId)`.** Postgres would allow it, Prisma
  cannot express it, and hand-writing it invites schema drift for one workbook row. AC-15
  asserts the actual behaviour instead of pretending it away.
- **The M7 models.** `Vehicle`, `BoilerReading`, `BagReading`, `YardBulkReading`,
  `BoilerMaterial`, `BagMaterial` — not one field. `Q7` and `Q8` remain open and block only
  M7.
- **Historical count data.** `specs/product-brief.md` puts the 44 months of `Qty` / `Value`
  columns explicitly out of v1. No table here is shaped to receive them.
- **Row-level security, database roles, connection-pooling changes, and any Postgres
  extension.** The money boundary is enforced in `src/server/`, not by a database grant.
- **Performance work.** AC-29 asks only that foreign keys are indexed. No partial index, no
  `EXPLAIN` budget, no materialised view — totals are derived on read (Invariant 1) and #11
  owns whatever that costs.
- **CI.** `init` remains the gate.

## Open questions

None blocking. Two decisions this spec settles with a stated answer rather than leaving
open, both flagged here so the user can strike either at approval:

1. **`Location` is seeded by this feature's migration**, with literal ids `loc_dublin` and
   `loc_clonmel`. The alternative is to hand it to #5, whose brief does not mention it, or
   to leave the table empty until a screen creates a yard — which would leave Invariant 7
   undefined for every database until then.
2. **`StockCount_periodMonth_range` is added** as a `CHECK`. It is the definition of a month
   rather than a domain rule, but it is a constraint the domain model does not spell out,
   and it is cheap to remove.

`Q7` and `Q8` in `specs/domain-model.md § Still open` block M7 only and are unrelated to
this feature. `Q5`'s remaining half — whether counts settle on the first or the last day of
the month — is absorbed by the period model and changes nothing in this schema.
