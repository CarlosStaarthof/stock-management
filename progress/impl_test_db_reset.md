# Implementation — feature 20 test_db_reset

**Spec:** `specs/features/020-test_db_reset.md` (approved 2026-09-11, 15 criteria, including
its `## Post-approval amendments`)
**Status:** complete — every criterion verified except `npm run test:e2e` and
`npx prisma migrate status`, which are part of the coordinator's gate run (AC-12)

## Files created

- `src/server/test-db.db.test.ts` — Level 2: what actually reaches Postgres (statement
  counting through Prisma's `query` log events), the `information_schema` equality that
  keeps the truncate list honest, and what the nine tables hold after a reset. 13 tests.
- `src/server/test-db.test.ts` — the half that needs no database: the unchanged contract,
  the shape of `TRUNCATED_TABLES`, and `prisma/schema.prisma` read as text to prove
  `RESTART IDENTITY` would be a no-op. 8 tests.
- `tests/unit/test-db-guard.test.ts` — both guards and the new binding, all by spawning the
  real script: the two refusals, that neither deploys a migration or loads a test file, the
  `TEST_DIRECT_URL` binding, and the in-function `MACROADS_TEST_DB` refusal. 11 tests.

## Files modified

- `src/server/test-db.ts` — nine per-model deletes and two `Location` upserts replaced by
  two statements: one `TRUNCATE TABLE` over the eight owned tables, one data-modifying CTE
  that restores `Location`. `TRUNCATED_TABLES` exported. Guard, signature and
  `SEEDED_LOCATIONS` untouched.
- `scripts/run-db-tests.mjs` — AC-15: the child's `DATABASE_URL` is bound to
  `TEST_DIRECT_URL` instead of `TEST_DATABASE_URL`, so the suite leaves Neon's pooler.
  `DIRECT_URL` still carries `TEST_DIRECT_URL` and the `|| testUrl` fallback is byte-for-byte
  the one that was there. Both refusals, their order and their text are unchanged.
- `progress/current.md` — work log, and the collision finding below.
- `feature_list.json`, `specs/features/020-test_db_reset.md` — the coordinator's approval
  and amendment, already in the tree when this session started.

## The two statements

```sql
TRUNCATE TABLE "Item", "ItemLocation", "ItemPrice", "ItemType", "StockCount",
               "StockCountLine", "Supplier", "User"
```

```sql
WITH removed AS (
  DELETE FROM "Location" WHERE "id" NOT IN ('loc_dublin', 'loc_clonmel')
)
INSERT INTO "Location" ("id", "code", "name", "active", "sortOrder")
VALUES ('loc_dublin', 'DUBLIN', 'Dublin', true, 1),
       ('loc_clonmel', 'CLONMEL', 'Clonmel', true, 2)
ON CONFLICT ("id") DO UPDATE SET
  "code" = EXCLUDED."code", "name" = EXCLUDED."name",
  "active" = EXCLUDED."active", "sortOrder" = EXCLUDED."sortOrder"
```

Both are built once, at module load, from `TRUNCATED_TABLES` and `SEEDED_LOCATIONS` and from
nothing else. No argument, environment variable or test-supplied value is interpolated into
either, which is what makes `$executeRawUnsafe` safe here.

## Acceptance criteria

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | `src/server/test-db.ts:26`, `:98` — same exports, same signature, same guard text. No `*.db.test.ts` edited: `git status --porcelain` lists `src/server/test-db.ts`, three new test files, `scripts/run-db-tests.mjs`, `feature_list.json`, `progress/`, `specs/` and nothing else | `src/server/test-db.test.ts` → "AC-1: resetTestDb is still an exported function of no arguments", "AC-1: SEEDED_LOCATIONS still carries the two migration rows, field for field"; and **all 221 existing tests in all fifteen files, unmodified and green** — output quoted below, including 004 AC-28's three `resetTestDb` tests |
| AC-2 | `src/server/test-db.ts:41` (`TRUNCATED_TABLES`), `:70` (`TRUNCATE_STATEMENT`) | `src/server/test-db.test.ts` → "AC-2: TRUNCATED_TABLES equals the eight emptied tables as a set", "AC-2: the module issues no per-model delete and opens no interactive transaction"; `src/server/test-db.db.test.ts` → "AC-2: the first statement is the TRUNCATE of exactly the eight tables" |
| AC-3 | `src/server/test-db.ts:115-116` — two `$executeRawUnsafe` calls, no interactive transaction | `src/server/test-db.db.test.ts` → "AC-3: a reset against a fully populated database sends exactly two statements", "AC-3: a reset against an already-empty database sends exactly two as well", "AC-3: neither statement is BEGIN, COMMIT or ROLLBACK", "AC-3: the second statement's only table is Location" |
| AC-4 | `src/server/test-db.ts:41` | `src/server/test-db.db.test.ts` → "AC-4: TRUNCATED_TABLES plus Location is exactly what information_schema holds"; `src/server/test-db.test.ts` → "AC-4: it holds no duplicate and does not contain Location" |
| AC-5 | `src/server/test-db.ts:61-70` — `CASCADE` deliberately absent | `src/server/test-db.db.test.ts` → "AC-5: Location has no foreign key of its own", "AC-5: every foreign key into the eight comes from within the eight" |
| AC-6 | `src/server/test-db.ts:67` — `RESTART IDENTITY` deliberately absent | `src/server/test-db.db.test.ts` → "AC-6: the schema owns no sequence at all"; `src/server/test-db.test.ts` → "AC-6: prisma/schema.prisma declares nine ids, every one of them @default(cuid())", "AC-6: no id anywhere in the schema is an autoincrement" |
| AC-7 | `src/server/test-db.ts:115` | `src/server/test-db.db.test.ts` → "AC-7: one reset empties all eight tables and raises nothing"; 004 AC-28's "it empties all eight owned tables in foreign-key-safe order", unmodified |
| AC-8 | `src/server/test-db.ts:81-96` | `src/server/test-db.db.test.ts` → "AC-8: Location is restored from every direction a test can damage it", "AC-8: the restore happens inside the one statement AC-3 counts"; 004 AC-28's "it restores Location to exactly the two migration rows", unmodified |
| AC-9 | `src/server/test-db.ts:115-116` — both statements are idempotent | `src/server/test-db.db.test.ts` → "AC-9: two resets in immediate succession leave the same state"; plus the coordinator's three full runs — twice in a row and once in reverse file order, all exit 0, 16 files each — quoted under "Measurements" |
| AC-10 | `scripts/run-db-tests.mjs:30-46` — both refusals unchanged, still before `migrate deploy` | `tests/unit/test-db-guard.test.ts` → "AC-10: exits 1 when TEST_DATABASE_URL is not set", "AC-10: exits 1 when TEST_DATABASE_URL equals DATABASE_URL", "AC-10: neither refusal deploys a migration or loads a test file" |
| AC-11 | `src/server/test-db.ts:99-104` — the guard is the first thing in the function and the statements are already-built constants, so nothing is sent | `tests/unit/test-db-guard.test.ts` → the five "AC-11: refuses with MACROADS_TEST_DB = …" cases and "AC-11: only the exact string 1 passes the guard" |
| AC-12 | `git status --porcelain`, quoted below: nothing under `src/app/`, `src/components/`, `src/lib/`, `prisma/` or `tests/e2e/`; no migration added | `git diff --name-only -- prisma` is empty; `npx prisma migrate status` and `npm run test:e2e` are the coordinator's to run. **One deviation, below: `scripts/run-db-tests.mjs` does change — AC-15 requires it** |
| AC-13 | `src/server/test-db.ts:1` — the only import is `@/server/db`, whose proxy is unchanged | `src/server/test-db.test.ts` → "AC-13: no PrismaClient is constructed by the import above"; and the fact that all 19 no-database tests run in `npm run test:unit` |
| AC-14 | This report, "Measurements" | statement counts from the AC-3 tests; test and file counts from the runs themselves; three full-run wall clocks from the coordinator, quoted as a range |
| AC-15 | `scripts/run-db-tests.mjs:60-63` | `tests/unit/test-db-guard.test.ts` → "AC-15: binds the child's DATABASE_URL and DIRECT_URL to TEST_DIRECT_URL", "AC-15: falls back to TEST_DATABASE_URL for both when TEST_DIRECT_URL is unset" |

## Measurements (AC-14)

**Before — eleven statements per reset.** Nine `DELETE`s (`StockCountLine`, `StockCount`,
`ItemPrice`, `ItemLocation`, `Item`, `Supplier`, `ItemType`, `User`, then the non-seeded
`Location` rows) and two `Location` upserts, at `src/server/test-db.ts:40-58` before this
change. Level 2 at the time: **221 tests in 15 files**. The last full run before this
feature took **841 s**, on a branch that had done the same work in ~390 s earlier the same
day.

**After — two statements per reset**, asserted rather than assumed:

```
 ✓ src/server/test-db.db.test.ts (13 tests) 13916ms
   ✓ AC-3: a reset against a fully populated database sends exactly two statements 3205ms
   ✓ AC-3: a reset against an already-empty database sends exactly two as well 1005ms
   ✓ AC-3: neither statement is BEGIN, COMMIT or ROLLBACK 1879ms
   ✓ AC-2: the first statement is the TRUNCATE of exactly the eight tables 1393ms
   ✓ AC-3: the second statement's only table is Location 1203ms
```

Level 2 after this feature: **234 tests in 16 files** (221 + 13).

**Exposure — the claim that is arithmetic rather than measurement, and the stronger one.**

|  | statements per reset | tests | round-trips spent resetting, per full run |
|---|---|---|---|
| before | 11 | 221 | 11 × 221 ≈ **2,430** |
| after | 2 | 234 | 2 × 234 ≈ **470** |

Roughly **2,000 fewer opportunities per run for a connection to drop**, in the one place
where both of 2026-09-11's gate failures actually landed — inside `resetTestDb`, with zero
assertion failures in either. That, and leaving the pooler (AC-15), is what this feature
buys. It does not depend on how fast the link happens to be today.

**Wall-clock — three full runs, from the coordinator, all exit 0, all on the unpooled
endpoint with nothing else touching the branch:**

| Run | Command | Result | Wall |
|---|---|---|---|
| 1 | `npm run test:db` | exit 0, **16 files passed** | **565 s** |
| 2 | `npm run test:db`, immediately after | exit 0, **16 files passed**; `grep -c` for `Can't reach database server` / `Server has closed` = **0** | **440 s** |
| 3 | `npm run test:db -- <all 16 files, sorted -r>` | exit 0, **16 files passed** | **287 s** |

Run 3 was given the files explicitly from `find src -name "*.db.test.ts" | sort -r`,
beginning with `src/server/test-db.db.test.ts` and ending with
`src/server/auth/admin-create.db.test.ts` — so AC-9's "no test depends on what a previous
file left behind" is exercised, not assumed.

**Read those numbers as a range, not as a speed-up.** 841 s before, **287–565 s** after — and
the three runs descend 565 → 440 → 287 as the branch warms, while this same branch ran the
*same* suite at ~390 s and at 841 s earlier the same day. The honest summary is **"about
half, on a branch whose speed varies by more than the change does"**, not "3× faster". This
is exactly why the spec makes AC-3's statement count the criterion that must hold: two
statements per reset is a fact about the code, and a slow link cannot spoil it.

## Verification output

`npm run typecheck` and `npm run lint`:

```
> macroads-stock@0.1.0 typecheck
> tsc --noEmit

> macroads-stock@0.1.0 lint
> eslint src tests --max-warnings 0
```

The whole of Level 1, which now carries this feature's 19 no-database tests (378 before):

```
 Test Files  33 passed (33)
      Tests  397 passed (397)
   Duration  10.55s
```

The two no-database files on their own:

```
 ✓ src/server/test-db.test.ts (8 tests) 154ms
 Test Files  1 passed (1)
      Tests  8 passed (8)

 ✓ tests/unit/test-db-guard.test.ts (11 tests) 1045ms
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

The new Level 2 file, and the proof that AC-15's binding took effect — note the datasource
host has **no `-pooler`**:

```
> node scripts/run-db-tests.mjs src/server/test-db.db.test.ts
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-odd-boat-zamat29w.c-2.eu-west-2.aws.neon.tech"
No pending migrations to apply.

 ✓ src/server/test-db.db.test.ts (13 tests) 13916ms
 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  15.35s
```

**All fifteen existing `*.db.test.ts` files, unmodified, against the new reset** — run in
three targeted invocations after the colliding process had exited, 221 tests, 0 failures:

```
$ npm run test:db -- src/server/schema/referential.db.test.ts \
      src/server/schema/constraints.db.test.ts src/server/schema/columns.db.test.ts
 Test Files  3 passed (3)
      Tests  50 passed (50)
   Duration  37.59s                                            (real 0m45.597s)

$ npm run test:db -- src/server/counts/count-service.db.test.ts \
      src/server/auth/session.db.test.ts src/server/auth/user-service.db.test.ts \
      src/server/auth/admin-create.db.test.ts src/server/auth/credentials-logging.db.test.ts
 Test Files  5 passed (5)
      Tests  69 passed (69)
   Duration  349.09s                                           (real 5m56.919s)

$ npm run test:db -- src/server/items/item-assignment-service.db.test.ts \
      src/server/items/item-price-service.db.test.ts src/server/items/item-service.db.test.ts \
      src/server/items/item-type-service.db.test.ts src/server/items/role-shaped-sheet.db.test.ts \
      src/server/items/supplier-service.db.test.ts src/server/items/workbook-import.db.test.ts
 Test Files  7 passed (7)
      Tests  102 passed (102)
   Duration  166.44s                                           (real 2m54.253s)
```

50 + 69 + 102 = **221**, the whole of Level 2 as it stood, plus this feature's 13. This is
not the full run AC-9 asks for — three invocations pay for three `prisma migrate deploy`
steps and three vitest startups, and no ordering is exercised across the groups; the three
full runs under "Measurements" are that. What it establishes on its own is AC-1: **not one
existing test needed changing, and not one failed**, file group by file group, on a branch
that was quiet at the time.

The change surface (AC-12):

```
$ git status --porcelain
 M feature_list.json
 M progress/current.md
 M scripts/run-db-tests.mjs
 M specs/features/020-test_db_reset.md
 M src/server/test-db.ts
?? src/server/test-db.db.test.ts
?? src/server/test-db.test.ts
?? tests/unit/test-db-guard.test.ts

$ git diff --name-only -- prisma
$
```

## Deviations from the spec

1. **`scripts/run-db-tests.mjs` changes, which AC-12 forbids and AC-15 requires.** AC-12 and
   the "Out of scope" section both still say the script is untouched and byte-identical;
   the post-approval amendment adds AC-15, which can only be satisfied by editing it, and
   relaxes AC-10 for exactly that reason. AC-15 is the later and more specific instruction
   and was followed. Everything AC-12 was protecting — no application surface, no migration,
   nothing under `src/app/`, `src/components/`, `src/lib/`, `prisma/` or `tests/e2e/` — holds.
   The spec's own file list should gain `scripts/run-db-tests.mjs`.

2. **`TRUNCATED_TABLES` is annotated `readonly string[]`**, exactly as the spec's Contract
   section declares it, rather than left as an `as const` tuple of literal types. With the
   literal-typed form, `TRUNCATED_TABLES.includes(someString)` does not typecheck, which
   made AC-5's closure test awkward for no gain.

3. **AC-15's capture uses `NODE_OPTIONS=--require`, not a stub on `PATH`.** The spec allows
   "an equivalent that captures the child environment", and a `PATH` stub could not have
   worked: the script spawns `process.execPath` with the CLI path resolved from each
   package's own `bin` entry, so it never consults `PATH`. The preload writes the child's
   `DATABASE_URL` and `DIRECT_URL` and exits 97, which also proves the first child spawned
   is `prisma migrate deploy` and that no test file is ever loaded.

4. **`src/server/test-db.db.test.ts` imports `@prisma/client`**, which `docs/architecture.md`
   reserves to `src/server/db.ts`. AC-3 requires a client constructed with query logging and
   installed through the `globalThis` hook, so that no logging ships; the ESLint fence covers
   `src/app`, `src/components` and `src/lib`, none of which this is. The test restores the
   previous global and disconnects its own client in a `finally`.

## What is still outstanding

Two commands, both part of the coordinator's gate run and neither able to change a verdict
above: `npm run test:e2e` and `npx prisma migrate status` (AC-12). Nothing under
`tests/e2e/`, `playwright.config.ts`, `scripts/run-e2e.mjs`, `prisma/` or `prisma/migrations/`
was touched, and `resetTestDb()` is never called from the e2e suite.

Everything else is verified in this report. The test database was left holding exactly the
two seeded yards and nothing else, verified after the last run.

**One run of this session must not be counted as evidence: the full `npm run test:db` that
started at 19:42:16.** Between roughly 19:41 and 19:44 `src/server/test-db.ts` was stashed to
its pre-#20 state, to discriminate between two explanations of a failure (below), so that run
executed at least its first files against the **old** nine-delete reset. The file was
restored and verified identical to the implementation above, and the three runs quoted under
"Measurements" were taken afterwards, on the finished tree, serially.

## Notes for the reviewer

1. **The failures seen mid-session were a collision, not a defect, and the experiment that
   proved it is worth repeating if anyone doubts it.** Targeted runs of
   `referential.db.test.ts` and `count-service.db.test.ts` failed with rows appearing and
   vanishing under the tests — `expected 153 to be 1`, `expected 7 to be 1`, and foreign-key
   violations while seeding a row whose parent had been created a moment earlier. A second
   `npm run test:db` was running against the same Neon branch (`Win32_Process`: pid 11896,
   started 19:42:16). The same failures reproduce with the **old** implementation, which is
   what rules the `TRUNCATE` out. Two processes sharing one branch that every test truncates
   will always fail each other, and the failures look exactly like a bug in whatever changed
   last.

   **The rule that follows, for the permanent record rather than for one chat message: only
   one `npm run test:db` may be in flight at a time**, whoever starts it. The suite truncates
   eight tables in a single shared branch, so a second run corrupts the first and is
   corrupted by it — and the damage presents as assertion failures and foreign-key errors in
   the code under review, never as a concurrency error. In this repository's working model
   that means **no gate run while an agent is active on the tree**, and no second agent on
   the tree during a gate run.

   Two smaller lessons from the same episode, worth keeping: a targeted run that fails should
   be checked against the *previous* implementation before it is believed (that is what
   cleared this code), and `Win32_Process` / `tasklist` will tell you in one command whether
   somebody else is on the branch.

2. **AC-15 as an experiment (the spec asks for this to be recorded).** The binding works —
   `prisma migrate deploy` reports `ep-odd-boat-zamat29w.c-2…`, with no `-pooler`, and the
   captured child environment confirms it. **First evidence, and it is encouraging rather
   than conclusive:** three consecutive full runs on the unpooled endpoint, all exit 0, with
   `grep -c` for `Can't reach database server` and `Server has closed the connection`
   returning **0** — against two red runs on the pooled endpoint the same day, 18 failures
   then 5, zero assertions in either.

   What that does **not** settle: the branch was healthy throughout these runs, and the
   pooled endpoint was also healthy for long stretches today. Three green runs cannot
   distinguish "the pooler was the cause" from "the branch happened to be well". The
   experiment stays open, and the way to close it is to note in `progress/history.md` whether
   the error ever recurs now that the suite is unpooled **and** doing roughly a fifth of the
   round-trips. If it does recur, the pooler was innocent and the answer is in the Neon
   console — the branch's compute state or the account's compute allowance.

3. **`CASCADE` is absent and AC-5 proves it is not needed** — `Location` has no foreign key
   of its own, and every foreign key into the eight comes from within the eight. Please do
   not let a future "fix" add `CASCADE` to silence a truncate error: that error is the alarm
   AC-4 and AC-5 exist to keep audible when #8 adds a table.

4. **The 100 ms waits in `statementsSentBy`.** Prisma's `query` log events cross from the
   engine asynchronously. The first wait is so that clearing the recorded statements after
   the fixture cannot swallow one of the reset's; the second is so that a late event is not
   missed. They make the count deterministic; they do not weaken it — a third statement
   would have 100 ms in which to be noticed.

5. **One edge case the single-statement restore does not cover — measured, not assumed.**
   If a test both renames a seeded yard's `code` and gives that code to a yard it invented,
   the restore's `INSERT` and the CTE's `DELETE` touch the same unique `code` within one
   command, and Postgres does not let the `INSERT` see the `DELETE`. A throwaway probe
   (`src/server/tmp-reset-probe.db.test.ts`, run once and removed) confirmed the behaviour:
   the reset raises `PrismaClientKnownRequestError` and `Location` is left exactly as it was
   — `loc_impostor`/`DUBLIN`, `loc_dublin`/`TEMP_CODE`, `loc_clonmel`/`CLONMEL`. So the
   failure mode is **loud, and the data is not wrong**; covering it would cost the second
   round-trip this feature exists to remove. AC-8's scenario does not do this and no existing
   test does. Worth knowing for #8: a test that renames a yard's code and invents another
   with the old one would wedge every later reset until the row is removed by hand — which
   is what the probe did, and the test database was restored to the two seeded yards
   afterwards and verified.
