# Spec notes — #20 `test_db_reset`

Spec: `specs/features/020-test_db_reset.md` (`spec_status: draft`, `status: pending`).
14 criteria, mirrored verbatim into `feature_list.json` → id 20 `acceptance[]`.

## What was read

`src/server/test-db.ts` (whole file), `scripts/run-db-tests.mjs`, `vitest.config.ts`,
`vitest.db.config.ts`, `prisma/schema.prisma` (models + defaults), 004 AC-28 / AC-30 /
AC-31, 005 AC-28, `src/server/schema/referential.db.test.ts:330-378` (the existing
`resetTestDb` tests), `src/server/schema/columns.db.test.ts:118-135` (the existing
`information_schema.tables` assertion this spec reuses the shape of), `docs/verification.md`,
`docs/architecture.md`, `docs/conventions.md`, `CHECKPOINTS.md`, `progress/current.md`,
`progress/history.md` (#7 entry), `specs/domain-model.md § Still open`.

No open domain question blocks this feature: `Still open` holds only Q7 and Q8, both M7.

## Measured facts the spec rests on

- `resetTestDb()` issues **eleven** statements per call, not nine: eight `deleteMany`
  (`test-db.ts:40-47`), the `Location` `deleteMany` at `:51`, and **two** `location.upsert`
  at `:54`. The feature-list description's "nine" counts only the deletes. The spec states
  eleven and describes the suite cost as "on the order of two thousand round-trips" rather
  than repeating the brief's 1,550, which does not reconcile with 221 × 9.
- 15 `*.db.test.ts` files exist today, every one of them calling `resetTestDb()` in
  `beforeEach`.
- Nine base tables, all `PascalCase`, **no `@@map` anywhere** — Prisma model name equals the
  quoted SQL identifier, so the `TRUNCATE` list is literal.
- Every `@id` is `@default(cuid())`; the string `autoincrement` does not appear in
  `prisma/schema.prisma`. Hence AC-6: the schema owns no sequence and `RESTART IDENTITY`
  would reset nothing. It is omitted, and that is asserted (`pg_class relkind = 'S'` is
  empty) rather than assumed.
- `Location` declares **no foreign key column** (`model Location` is id/code/name/active/
  sortOrder plus two back-relations). So no `CASCADE` path from the eight can reach it —
  the fear in the brief's point 2 is provably not reachable, and AC-5 asserts it rather than
  arguing it.

## Decisions that needed an argument, not an idiom

1. **`CASCADE` is omitted.** The eight tables are closed under "is referenced by" (every FK
   child of a member is a member), so Postgres accepts the bare statement — asserted in
   AC-5. Omitting `CASCADE` also converts the dangerous drift case into a loud one: a future
   table referencing one of the eight and missing from the list fails *every* reset with
   `cannot truncate a table referenced in a foreign key constraint`, instead of being
   silently emptied by a list nobody maintained. The FK-less new table is caught by AC-4's
   `information_schema` equality.
2. **`RESTART IDENTITY` is omitted** — see above.
3. **`Location` is not in the `TRUNCATE`.** Beyond "reference data, not test data": if the
   link drops between statement 1 and statement 2, excluding `Location` leaves the two yards
   intact. Truncating and re-inserting would leave a yard-less database on exactly the
   failure this feature exists to reduce.
4. **Two round-trips, not four.** The `Location` restore is specified as **one** statement
   (delete-the-strangers and upsert-the-two together, e.g. a data-modifying CTE), not the
   current delete + two upserts. The spec fixes the two properties (one statement, AC-8's
   end state) and leaves the SQL shape to the implementer. Multi-statement strings in a
   single `$executeRawUnsafe` are *not* specified — Postgres refuses multiple commands in a
   prepared statement — so it is two statements, not one.
5. **No `$transaction`.** It would add `BEGIN`/`COMMIT` round-trips, which is the cost being
   removed, and there is nothing to be atomic against (`fileParallelism: false`).
6. **How the round-trip count is asserted.** By statements reaching Postgres, not by timing
   and not by counting Prisma method calls: a `PrismaClient` built with
   `log: [{ level: "query", emit: "event" }]` installed on `globalThis.macroadsPrismaClient`
   — the hook `src/server/db.ts` already exposes (`getDb()` only constructs when the global
   is `undefined`). This needs **no change to shipping code** and is not a mock: the real
   function runs the real SQL against the real test database. AC-3 allows an equivalent
   counter.
7. **The guard is verified, never touched.** AC-10 spawns `scripts/run-db-tests.mjs` in a
   directory with no `.env` — necessary, because the script calls `process.loadEnvFile(".env")`
   from the cwd and would otherwise import the real `TEST_DATABASE_URL` — and asserts both
   refusals, exit `1`, and that neither `prisma migrate` nor vitest ran. AC-11 covers the
   in-function refusal with no database, which is what proves the check precedes the SQL.
8. **New files, and only new files.** `src/server/test-db.db.test.ts` (Level 2),
   `src/server/test-db.test.ts` (no database: the guard and the schema-text assertions),
   `tests/unit/test-db-guard.test.ts` (spawns the script). No existing test is edited —
   AC-1 makes an unavoidable edit a blocker to report, per the brief.

## Things checked so the spec cannot collide with shipped work

- `src/server/items/item-price-service.db.test.ts:189` lists `src/server/test-db.ts` in
  `NOT_A_SHIPPING_MODULE` for its price-column scan. The new SQL names no price column, and
  the file is excluded anyway → no edit needed.
- `tests/unit/hashing-boundary.test.ts` permits database importers anywhere under
  `src/server/` since #4 → the new `src/server/test-db.db.test.ts` and
  `src/server/test-db.test.ts` need no relaxation of that guard.
- `vitest.config.ts` includes `src/**/*.test.ts` and excludes `**/*.db.test.ts`, so
  `src/server/test-db.test.ts` runs in `test:unit` and `src/server/test-db.db.test.ts` in
  `test:db`, with no config change.
- `count-service.db.test.ts`'s `tmp_ac13_line_write_fails` DDL is untouched (out of scope);
  `TRUNCATE` and that add/drop never overlap, the suite being serial.

## Not settled here, deliberately

Whether the Level 2 suite should retry a dropped connection. It is out of scope and named as
such: a retry can mask a real failure, and that is its own decision.
