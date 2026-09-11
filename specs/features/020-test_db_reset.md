# 020 — Fast, single-statement test database reset

**Feature id:** 20   **Status:** approved   **Approved:** 2026-09-11
**Depends on:** #3 `auth_and_roles` (the `MACROADS_TEST_DB` guard and `scripts/run-db-tests.mjs`), #4 `domain_schema` (the nine tables, the two migration-seeded `Location` rows, 004 AC-28), #5 `seed_from_workbook` (005 AC-28)

## Purpose

`resetTestDb()` runs in `beforeEach` in all fifteen `*.db.test.ts` files and issues
**eleven statements per call**: nine `DELETE`s — `StockCountLine`, `StockCount`,
`ItemPrice`, `ItemLocation`, `Item`, `Supplier`, `ItemType`, `User`, then the non-seeded
`Location` rows — and two `Location` upserts (`src/server/test-db.ts:40-58`). The Level 2
suite is 221 tests, so a gate run spends on the order of **two thousand round-trips to a
database in another region**, about **6.5 minutes**, and the figure grows with every
feature. #8 adds the most service tests so far.

Wall-clock is the smaller cost. The larger one is **exposure**: every round-trip is an
opportunity for a dropped link to fail the gate. Both of 2026-09-11's red runs landed
*inside* `resetTestDb` — `db.item.deleteMany()` at `test-db.ts:44` — with 18 failures on
one run and 5 on the next, **zero assertion failures in either**, every error being
`Can't reach database server` or `Server has closed the connection`. Fewer statements is
less surface for exactly that.

This feature replaces the nine deletes with one `TRUNCATE`, and the `Location` cleanup plus
two upserts with one statement: **two round-trips per reset instead of eleven**. Nothing
else changes — not the guard, not the function's signature, not one existing test.

## User stories

There is no end-user story. This feature is invisible to `YARD_STAFF` and `ADMIN` alike; it
ships no route, no screen and no service.

- As the **agent or developer running the gate**, I get the Level 2 verdict in a fraction of
  the time, so a feature is not paid for in six-minute waits.
- As the **reviewer**, I see a suite whose red runs mean "a test failed" rather than "the
  link dropped during the two-thousandth delete".

## Data touched

**No schema change, no migration, no new column, no new row.** The set of models is
unchanged.

| Table | What the reset does to it |
|---|---|
| `Item`, `ItemLocation`, `ItemPrice`, `ItemType`, `StockCount`, `StockCountLine`, `Supplier`, `User` | emptied — all eight in **one** `TRUNCATE TABLE` |
| `Location` | **not truncated.** Restored to exactly the two migration-seeded rows, in one statement |
| `_prisma_migrations` | never touched. It is Prisma's, and emptying it would make `prisma migrate status` report an unapplied history |

`Location` is handled differently for the reason `src/server/test-db.ts` already gives: it
is **reference data, not test data**. `20260909135148_create_stock_domain` writes
`loc_dublin` / `DUBLIN` / `Dublin` / `active true` / `sortOrder 1` and `loc_clonmel` /
`CLONMEL` / `Clonmel` / `active true` / `sortOrder 2`; every count test depends on them, and
Invariant 7 is undefined while the table is empty. Keeping it out of the `TRUNCATE` also
means a link that drops **between** the two statements leaves the yards present: the worst
case is a stale test row, not a database with no yards in it.

## Contract

`src/server/test-db.ts` — the only shipping file that changes. Same module, same exports,
one new exported constant:

```ts
export const SEEDED_LOCATIONS: readonly SeededLocation[];   // unchanged, same two rows
export const TRUNCATED_TABLES: readonly string[];           // new: the eight emptied tables
export async function resetTestDb(): Promise<void>;         // unchanged signature
```

`resetTestDb()`, in order:

1. **Guard, unchanged.** `process.env.MACROADS_TEST_DB !== "1"` throws the existing message,
   before any SQL is built or sent.
2. **One statement** through `$executeRawUnsafe`, built only from `TRUNCATED_TABLES`:
   `TRUNCATE TABLE "Item", "ItemLocation", "ItemPrice", "ItemType", "StockCount",
   "StockCountLine", "Supplier", "User"` — no `CASCADE`, no `RESTART IDENTITY` (AC-5, AC-6).
   Order within the list is irrelevant: a single `TRUNCATE` over a set that is closed under
   its foreign keys has no ordering requirement, so the child-before-parent comment goes
   with the deletes it described.
3. **One statement** that leaves `Location` holding exactly the two seeded rows at their
   migration values — whether a test renamed them, archived them, re-sorted them, added a
   third yard or deleted one outright. For example a data-modifying CTE pairing
   `DELETE FROM "Location" WHERE "id" NOT IN (…)` with
   `INSERT … VALUES (…), (…) ON CONFLICT ("id") DO UPDATE SET …`. The shape is the
   implementer's; the two properties are not: **one statement**, and the end state of AC-8.

No `db.$transaction`: an interactive transaction adds `BEGIN` and `COMMIT` round-trips, and
the two statements need no atomicity between them — the suite runs `fileParallelism: false`
against one database and nothing else is writing.

`$executeRawUnsafe` receives a string assembled **only** from module constants. No argument,
environment variable or test-supplied value is ever interpolated into it.

*What "round-trip" means here:* a statement sent to Postgres, as counted by Prisma's `query`
log events — not TCP packets, and not calls to Prisma methods.

## UI states

None. This feature renders nothing. `Empty`, `Loading`, `Error` and `Success` have no
meaning for a test fixture, and inventing them here would be noise.

## Acceptance criteria

1. **AC-1** — **Same contract, and not one existing test edited.** `src/server/test-db.ts` still exports `resetTestDb(): Promise<void>` and `SEEDED_LOCATIONS`, whose two entries still carry exactly `{ id: "loc_dublin", code: "DUBLIN", name: "Dublin", active: true, sortOrder: 1 }` and `{ id: "loc_clonmel", code: "CLONMEL", name: "Clonmel", active: true, sortOrder: 2 }`. All fifteen existing `*.db.test.ts` files are unmodified — `git diff --name-only` for this feature lists none of them — and `npm run test:db` runs the 221 existing tests plus this feature's new file, all passing, with no existing assertion weakened, deleted, skipped or renamed. In particular 004 AC-28's three `resetTestDb` tests in `src/server/schema/referential.db.test.ts` pass byte-identical. If an existing test cannot pass unmodified, that is a blocker to report in `progress/impl_test_db_reset.md`, not a licence to edit it.
2. **AC-2** — **Nine deletes become one statement.** `src/server/test-db.ts` exports `TRUNCATED_TABLES` equal as a set to exactly `["Item", "ItemLocation", "ItemPrice", "ItemType", "StockCount", "StockCountLine", "Supplier", "User"]`, and the module contains no `deleteMany` call and no `db.$transaction`. The statement observed reaching Postgres (AC-3) begins with `TRUNCATE TABLE`, the set of double-quoted identifiers in it equals `TRUNCATED_TABLES`, and it contains no identifier `"Location"`, no `CASCADE` and no `RESTART IDENTITY`.
3. **AC-3** — **Exactly two round-trips per reset, asserted by counting statements rather than by timing.** With a `PrismaClient` constructed with `log: [{ level: "query", emit: "event" }]` installed on `globalThis.macroadsPrismaClient` before its first use — the hook `src/server/db.ts` already provides, so no shipping code changes — or any equivalent that counts statements actually sent rather than Prisma method calls: one `resetTestDb()` against a fully populated database emits exactly **two** `query` events, the `TRUNCATE` of AC-2 followed by one statement whose only table is `"Location"`; and exactly **two** again against an already-empty database. Neither event is `BEGIN`, `COMMIT` or `ROLLBACK`. The test restores the previous global and disconnects its client afterwards, so no later file inherits it.
4. **AC-4** — **The truncate list cannot silently drift when #8 adds a table.** A test reads `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'` and asserts that this list, sorted, equals `[...TRUNCATED_TABLES, "Location"]` sorted; and separately that `TRUNCATED_TABLES` holds no duplicate and does not contain `"Location"`. A table added by a later feature and not added to the list turns this test red.
5. **AC-5** — **`Location` cannot be reached, and `CASCADE` is omitted on purpose.** A query over `information_schema.table_constraints` for `table_name = 'Location' AND constraint_type = 'FOREIGN KEY'` returns zero rows, so `Location` references none of the eight and no cascade could reach it. Every foreign key whose referenced table is one of the eight has its referencing table among the eight as well — asserted from `information_schema.referential_constraints` joined to `key_column_usage` and `constraint_column_usage` — so the set is closed and Postgres accepts the statement without `CASCADE`, which AC-2 asserts is absent. The rationale is the failure mode: without `CASCADE`, a later table that references one of the eight and is missing from `TRUNCATED_TABLES` makes every reset fail loudly with Postgres' `cannot truncate a table referenced in a foreign key constraint`, instead of being emptied silently by a list nobody maintained.
6. **AC-6** — **`RESTART IDENTITY` is omitted, and that is proved a no-op rather than an oversight.** `SELECT count(*) FROM pg_class WHERE relkind = 'S' AND relnamespace = 'public'::regnamespace` returns `0`: the schema owns no sequence, because every id is an application-supplied `cuid`. A unit test with no database reads `prisma/schema.prisma` as text and asserts it holds nine `@id` declarations, every one of them `@default(cuid())`, and the string `autoincrement` nowhere. `RESTART IDENTITY` would therefore reset nothing, and AC-2 asserts the statement does not carry it.
7. **AC-7** — **All eight tables end empty, with no foreign-key error and no ordering requirement.** After a fixture that writes at least one row into each of the nine tables, a single `resetTestDb()` leaves `StockCountLine`, `StockCount`, `ItemPrice`, `ItemLocation`, `Item`, `Supplier`, `ItemType` and `User` at zero rows and raises nothing, despite the `Restrict` delete policies spec 004 chose — the property 004 AC-28 already asserts, now holding through one statement instead of a hand-maintained child-before-parent order.
8. **AC-8** — **`Location` ends with exactly the two migration-seeded rows, in every direction a test can damage it.** Starting from a state in which a test has renamed `loc_dublin`, set its `active` to `false`, set its `sortOrder` to `99`, inserted a third yard, and deleted `loc_clonmel` outright, one `resetTestDb()` leaves `Location` holding exactly two rows, equal field for field to `SEEDED_LOCATIONS`: `loc_dublin` / `DUBLIN` / `Dublin` / `true` / `1` and `loc_clonmel` / `CLONMEL` / `Clonmel` / `true` / `2`. The restore both re-creates a missing seeded row and corrects a mutated one, within the single statement AC-3 counts.
9. **AC-9** — **Idempotent, twice in a row, and order-free.** Two `resetTestDb()` calls in immediate succession both succeed and leave the same state — eight tables empty, `Location` at exactly the two rows. `npm run test:db` passes twice in a row with the same test count both times, and passes with its files given in reverse order (`npm run test:db -- <every db test file, reversed>`), no test depending on what a previous file left behind.
10. **AC-10** — **The refusal still fires before any test file loads.** `scripts/run-db-tests.mjs` keeps both refusals **before any migration is deployed and any test file is loaded** — the byte-identity clause is dropped because AC-15 changes one binding in that file, and byte-identity was never what this criterion protected. Both refusals are still written against `TEST_DATABASE_URL`, which remains the variable a developer would point at their own database by mistake. A test running in `npm run test:unit` — needing no database — spawns `node scripts/run-db-tests.mjs` in a working directory containing no `.env`, twice: (a) with `TEST_DATABASE_URL` absent from the child environment, and (b) with `TEST_DATABASE_URL` set to the same string as `DATABASE_URL`. Each exits `1`; (a) prints `[test:db] TEST_DATABASE_URL is not set` and (b) prints `[test:db] TEST_DATABASE_URL must not equal DATABASE_URL`; and neither child's combined output contains `prisma migrate`, `Test Files` or `TRUNCATE` — no migration was deployed and no test file was loaded.
11. **AC-11** — **The in-function guard refuses before any SQL is built or sent.** With `MACROADS_TEST_DB` unset, and again with each of `""`, `"0"`, `"true"` and `"2"`, `resetTestDb()` rejects with an `Error` whose message contains `resetTestDb() refuses to run: MACROADS_TEST_DB is not set` — the text unchanged from today — so only the exact string `"1"` passes. The test runs in `npm run test:unit`, where the database is not reachable; the rejection is that message and never a Prisma connection error or a `TRUNCATE` failure, which is what proves no statement left the process.
12. **AC-12** — **No application surface, no migration, no drift.** `git diff --name-only` for this feature lists exactly `src/server/test-db.ts`, the new `src/server/test-db.db.test.ts`, the new `src/server/test-db.test.ts`, the new `tests/unit/test-db-guard.test.ts`, `specs/features/020-test_db_reset.md`, `feature_list.json` and files under `progress/`. Nothing under `src/app/`, `src/components/`, `src/lib/`, `prisma/`, `tests/e2e/` or `scripts/` changes; no migration directory is added; `prisma/schema.prisma` is untouched and `npx prisma migrate status` reports no drift and nothing pending. `npm run test:e2e` passes unchanged.
13. **AC-13** — **Which checks survive with no database,** as every feature since #3 has stated. Given `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointing at a hostname that does not resolve: `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` each exit `0`; both `init` scripts exit `0`, do not invoke `npm run test:db`, and end with `[OK] Environment ready (database checks skipped)`. Importing `src/server/test-db.ts` constructs no `PrismaClient` and opens no connection — `src/server/db.ts`'s deferred proxy is unchanged — so AC-6's schema-text test and AC-10 and AC-11's guard tests all run on a machine with no database at all.
14. **AC-14** — **The improvement is recorded, not assumed.** `progress/impl_test_db_reset.md` states, from runs whose output it quotes: the statement count per reset before the change (eleven — nine `DELETE`s and two `Location` upserts) and after (two, per AC-3); the number of Level 2 tests and files at the time of the run; and the wall-clock of one full `npm run test:db` after the change. Wall-clock is evidence, not a threshold — the link's latency varies, which is why AC-3 and not a stopwatch is the criterion that must hold.

15. **AC-15** — **The Level 2 suite stops connecting through Neon's pooler.** `scripts/run-db-tests.mjs` binds the child's `DATABASE_URL` to **`TEST_DIRECT_URL`** rather than `TEST_DATABASE_URL`, so the tests reach the unpooled endpoint; `DIRECT_URL` still carries `TEST_DIRECT_URL`, so `prisma migrate deploy` is unaffected and still runs before any test. The existing fallback is kept exactly as it is — when `TEST_DIRECT_URL` is unset the pooled string is used, because a plain Postgres has no pooler and needs no second string. Asserted from the value the script actually binds rather than from a comment: a test spawns the script with a stub on `PATH` (or an equivalent that captures the child environment) with `TEST_DATABASE_URL` and `TEST_DIRECT_URL` set to two distinguishable strings, and asserts the child's `DATABASE_URL` equals the `TEST_DIRECT_URL` value and its `DIRECT_URL` equals it too; and with `TEST_DIRECT_URL` unset, that both equal `TEST_DATABASE_URL`. **Why:** `vitest.db.config.ts` sets `fileParallelism: false`, so at most one client is live and the suite gains nothing from a connection pooler — while transaction-mode pooling is a well-known source of `Server has closed the connection` under many short exchanges, which is the error that failed #7's closing gate twice with **zero** assertion failures. This criterion is also an experiment and is recorded as one: if the unpooled endpoint still drops connections, the pooler was innocent and the fault is the branch or the account's compute allowance, which is a finding worth having either way and belongs in `progress/impl_test_db_reset.md`.

## Out of scope

- **`scripts/run-db-tests.mjs`.** Not modified. AC-10 *verifies* its two refusals and pins it
  byte-identical; nothing here may relax, move or re-implement the `MACROADS_TEST_DB`
  handshake. A faster reset that could run against `DATABASE_URL` would be a catastrophe,
  not an improvement.
- **Playwright.** `tests/e2e/**`, `playwright.config.ts` and `scripts/run-e2e.mjs` are
  untouched. The e2e suite runs against the development database and cleans up by the
  reserved-year convention #6 and #7 established; `resetTestDb()` is never called from it.
- **Retries, backoff or reconnection around dropped Neon connections.** The dropped-link
  episodes are this feature's *motivation*; cutting the number of statements is its whole
  mechanism. Whether the Level 2 suite should also retry a connection error is a separate
  decision with its own risk — a retry can mask a real failure — and belongs in its own
  feature.
- **Moving the test database.** No local Postgres, no Docker, no change of Neon branch, no
  change to any connection string, no pooled/unpooled change.
- **Parallelising the Level 2 suite.** `fileParallelism: false` stays exactly as it is: one
  database, one truncate, and tests that would otherwise empty each other's rows.
- **A per-test transaction-rollback strategy.** Wrapping each test in a transaction and
  rolling back would be faster still and is deliberately *not* done: it changes what the
  tests observe (visibility, `Restrict` timing, the DDL `count-service.db.test.ts` issues)
  and would break AC-1's "not one existing test edited".
- **`src/server/db.ts`.** Unchanged. AC-3's query-logging client is installed by the test
  through the existing `globalThis` hook; no logging, no extension and no instrumentation
  ships.
- **The DDL helper #7's review asked for.** `tmp_ac13_line_write_fails` stays in
  `count-service.db.test.ts`. Moving an add/drop-constraint pair beside `resetTestDb()` is a
  separate change and would violate AC-1.
- **Any domain behaviour.** No invariant, no service, no query, no role shaping, no money.
  Nothing here is reachable from a session, so Part 6's boundary cannot be touched by it.

## Post-approval amendments

### AC-15 added and AC-10 relaxed, 2026-09-11 — before implementation began

Both changes were made by the coordinator after the spec was written and before it was
approved, on evidence from #7's closing gate, and the user chose to fold them in here
rather than run a second feature.

**The problem.** #7's closing gate went red, twice, on `npm run test:db` alone —
18 failures then 5, **zero assertions** in either, every error being
`Can't reach database server at ep-odd-boat-zamat29w-pooler…` or
`Server has closed the connection.` `typecheck`, `lint`, 378 unit tests and 90 end-to-end
tests passed throughout. It was the second such episode of the day; the first, during #7's
spec session, cleared on its own after four runs.

**What the repository was doing.** `scripts/run-db-tests.mjs` binds the child's
`DATABASE_URL` to `TEST_DATABASE_URL` — the **pooled** endpoint — while `TEST_DIRECT_URL`,
the unpooled string it already reads, reaches only `prisma migrate deploy`. But
`vitest.db.config.ts` sets `fileParallelism: false`: the suite runs one file at a time, so
at most one client is ever live. **It gains nothing from a pooler**, and transaction-mode
pooling is the classic source of exactly that error under many short exchanges. With
`resetTestDb` issuing eleven round-trips per test across 221 tests, the suite was pushing
roughly 2,400 exchanges through it — and both failures landed *inside* the reset.

**AC-15** moves the tests to the unpooled endpoint. **AC-10** drops only its
byte-identity clause, because AC-15 changes one binding in that file; everything AC-10 was
actually protecting — both refusals firing before a migration is deployed or a test file is
loaded, written against `TEST_DATABASE_URL` — is asserted exactly as before.

**It is also an experiment.** If the unpooled endpoint still drops connections, the pooler
was innocent and the answer is in the Neon console — the branch's compute state, or the
account's monthly compute allowance. The current setup cannot distinguish those two
explanations; this change can.

## Open questions

None blocking. Two notes for the implementer, neither of them a guess about a domain rule:

1. If a later feature adds a table that is **reference data like `Location`** — seeded by a
   migration and expected to survive a reset — AC-4's equality forces that decision to be
   made explicitly then, by adding the table to a named exception rather than by leaving it
   out of a list silently. That is AC-4 working, not a gap in it.
2. If Prisma turns out to send either statement as more than one protocol exchange, AC-3
   stands as written: it counts `query` events, which is the unit of exposure that matters
   and the unit in which the "eleven" figure was measured.
