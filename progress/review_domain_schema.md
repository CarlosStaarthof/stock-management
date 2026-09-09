# Review — feature 4 domain_schema

**Verdict:** APPROVED
**Spec:** `specs/features/004-domain_schema.md` (approved 2026-09-09, amended 2026-09-09)
**init:** green — `bash ./init.sh` → exit `0`, `[OK] Environment ready` in its **full**
form, database checks **executed** (`[ok] database reachable`, `[ok] prisma migrate
status`, `[ok] npm run test:db`), no `[skip]` line. Run by the reviewer at 16:11–16:15 on
2026-09-09: 14 unit files / 79 tests, 26 e2e (26 passed), 7 db files / 79 tests.

Nothing in this review is taken from the implementer's report or from the coordinator's
run. Every claim below was re-executed or re-queried. Six mutations were performed and
every one reverted; `git status --porcelain` is byte-identical to the state at the start
of the review, and `git clean -nd` lists only the three intended untracked paths.

---

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `tests/unit/schema-and-migration.test.ts:203` compares model and enum **sets** by equality; `:209` rejects the six M7 names as declarations; `tests/unit/project-contract.test.ts:35` asserts the full twelve-declaration list. `src/server/schema/columns.db.test.ts:118` asserts the nine base tables from `information_schema.tables` — I re-queried it: exactly `Item, ItemLocation, ItemPrice, ItemType, Location, StockCount, StockCountLine, Supplier, User` (+ `_prisma_migrations`). Reviewer ran `npx prisma validate` and `npx prisma generate` with `DATABASE_URL`/`DIRECT_URL` at `db.invalid`: both exit `0`. |
| AC-2 | PASS | Diff confirms `FEATURE_4_DECLARATIONS`, the "exactly one model / one enum" assertion and the `["enum Role {", "model User {"]` equality are gone, replaced by equalities. **Re-run by the reviewer, not read**: appending `model Vehicle {…}` → `npx vitest run tests/unit/` exit `1`, 3 failures, including `expected […] to not include 'model Vehicle {'` and `+ "Vehicle"`; deleting `model ItemPrice` → exit `1`, 5 failures, including `- "model ItemPrice {"` and `- "ItemPrice"`. Schema restored; `sha256` of `prisma/schema.prisma` identical before and after (`de1524e0…7929a`). |
| AC-3 | PASS | `tests/unit/schema-and-migration.test.ts:218` (schema order), `:380` (migration `CREATE TYPE` order), `src/server/schema/columns.db.test.ts:138` (`enum_range`). Migration SQL lines 1–5 read verbatim. |
| AC-4 | PASS | `tests/unit/schema-and-migration.test.ts:235` and `:243` compare per-model scalar and relation field lists, in order, against `EXPECTED_SCALARS` / `EXPECTED_RELATIONS`. I diffed those tables against the spec's *Data touched* block line by line: identical, including `Item.notes` plural / `StockCountLine.note` singular and `ItemPrice.createdAt` as the only extra timestamp. |
| AC-5 | PASS | `prisma/schema.prisma` gives `User` three `StockCount[]` relation fields and no column; `tests/unit/schema-and-migration.test.ts:251`, `:270`. `src/server/schema/columns.db.test.ts:151` asserts the eight `User` columns with types and nullabilities from `information_schema`. Baseline corroborated independently against #3's committed SQL (`prisma/migrations/20260908224453_create_user/migration.sql:9-16`): eight columns, all `NOT NULL`. The new migration contains no `ALTER TABLE "User"` (`tests/unit/schema-and-migration.test.ts:360`, and I read the SQL). |
| AC-6 | PASS | `src/server/schema/columns.db.test.ts:219,228,237`. Re-queried by the reviewer against `TEST_DATABASE_URL`: `ItemPrice.unitPrice numeric 18/8 is_nullable NO`, `StockCountLine.unitPriceSnapshot numeric 18/8 is_nullable YES`. Reads `information_schema.columns`, never `schema.prisma`. |
| AC-7 | PASS | `src/server/schema/columns.db.test.ts:247`. Re-queried: `StockCountLine.quantity numeric 12/4`, `Item.unitQuantityKg numeric 12/4`. |
| AC-8 | PASS | `tests/unit/schema-and-migration.test.ts:291` (no `Float` field), `:411` (neither migration mentions `DOUBLE PRECISION` / `REAL` / `FLOAT`), `src/server/schema/columns.db.test.ts:262`. Re-queried: no `public` column has `data_type` in (`double precision`,`real`) — empty set. |
| AC-9 | PASS | `src/server/schema/columns.db.test.ts:272,292`. **Re-executed by the reviewer** in a rolled-back transaction: wrote `quantity='21.6128'`, `unitPriceSnapshot='6.11764706'`; raw SQL read-back `{"q":"21.6128","p":"6.11764706"}`, Prisma `Decimal.toString()` identical. `SELECT round(5.2/0.85, 8)` on the same database returns `6.11764706`, so the stored value is the workbook formula's 8-place value exactly. `0.475` round-trips as `0.475`. |
| AC-10 | PASS | `tests/unit/schema-and-migration.test.ts:389` (migration line is exactly `"quantity" DECIMAL(12,4),`), `src/server/schema/columns.db.test.ts:309,315`. **Re-executed**: on one count, a `null` line and a `0` line read back as `null` and `0.0000`; `where: { quantity: null }` returned exactly the null line's id, `where: { quantity: "0" }` exactly the zero line's id. |
| AC-11 | PASS | `src/server/schema/columns.db.test.ts:350` (no `public` column matches `/value|total|amount/i`), `:358` (the regex is not passing because the money columns vanished), `tests/unit/schema-and-migration.test.ts:402` (neither migration creates such a column). I re-ran the scan with a **wider** regex (`value|total|amount|cost|eur|sum`): the only hit in the whole `public` schema is `_prisma_migrations.checksum`. Value is genuinely not a column. |
| AC-12 | PASS | `src/server/schema/constraints.db.test.ts:128` (different day **and** different status, one row survives with the original date and `DRAFT`), `:166` (next month and other yard both succeed). `expectUniqueViolation` at `:58` — see the AC-12–AC-16 note below. |
| AC-13 | PASS | `src/server/schema/constraints.db.test.ts:205,218`; `ItemLocation_itemId_locationId_key` present in `pg_indexes` (verified live). |
| AC-14 | PASS | `src/server/schema/constraints.db.test.ts:230,246`; both surviving rows read back and the earlier `unitPrice` is still `6.11764706`. |
| AC-15 | PASS | `src/server/schema/constraints.db.test.ts:277,293,307`. The `NULL`s-are-distinct behaviour is asserted, not hidden — the third test records that two supplier-less items with the same description both insert, which is what #5 must be told. |
| AC-16 | PASS | `src/server/schema/constraints.db.test.ts:324,351`. |
| AC-17 | PASS | `src/server/schema/constraints.db.test.ts:382,395,408,426,437` — `''` and `'   '` refused through both `prisma.item.create` and `$executeRaw`, row count unchanged, `'  White Extrusion 80/20  '` inserts, `NULL` refused as `23502`. Live `pg_get_constraintdef`: `CHECK ((btrim(description) <> ''::text))`. |
| AC-18 | PASS | `src/server/schema/constraints.db.test.ts:469,482`. Live: `CHECK ((("periodMonth" >= 1) AND ("periodMonth" <= 12)))`. |
| AC-19 | PASS | `src/server/schema/referential.db.test.ts:181,189,197` — read from `information_schema.referential_constraints`, not from the schema file, and `:197` asserts those eleven are *all* of them. **Re-queried independently**: all eleven foreign keys present with exactly the spec's `RESTRICT`/`CASCADE` split; none is `SET NULL` or `NO ACTION`; `update_rule` is `CASCADE` throughout as the spec states. |
| AC-20 | PASS | `src/server/schema/referential.db.test.ts:209,228,241,261,274` (a–e). **Re-executed**: `prisma.item.delete` on an item with a line threw `PrismaClientUnknownRequestError`, `error.code === undefined`, message containing `PostgresError { code: "23001", … violates RESTRICT setting of foreign key constraint "StockCountLine_itemId_fkey" …}` — the amended criterion verbatim. See the amendment audit below for why this is stricter than `P2003`. |
| AC-21 | PASS | `tests/unit/schema-and-migration.test.ts:431` (the SQL *ends* with `ON CONFLICT ("code") DO NOTHING;`, exactly two `('loc_…',` rows), `src/server/schema/columns.db.test.ts:183,203`. Re-queried live after a from-scratch deploy: `loc_dublin/DUBLIN/Dublin/true/1`, `loc_clonmel/CLONMEL/Clonmel/true/2`, and nothing else. |
| AC-22 | PASS | `src/server/schema/columns.db.test.ts:369,377`. Re-queried: both `countDate` and `effectiveFrom` are `data_type = 'date'`. |
| AC-23 | PASS | `tests/unit/schema-and-migration.test.ts:341,347,360,322`. Verified by the reviewer directly: `prisma/migrations` holds exactly two directories; `git log --oneline -- prisma/migrations/20260908224453_create_user/migration.sql` → one commit, `3420561`; `git status --porcelain` on that directory and on `migration_lock.toml` → empty. I read the new SQL: no `DROP`, no `TRUNCATE`, the only `"User"` occurrences are three `ALTER TABLE "StockCount" … REFERENCES "User"("id")` lines, and `"Role"` never appears. |
| AC-24 | PASS | **Re-executed from bedrock by the reviewer.** `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` on the test branch (zero tables), then `npm run test:db` → `Applying migration 20260908224453_create_user`, `Applying migration 20260909135148_create_stock_domain`, `All migrations have been successfully applied.`, then 7 files / 79 tests green, exit `0`. `prisma migrate status` with the env pointed at the test branch → `Database schema is up to date!`, exit `0`. `scripts/run-db-tests.mjs:80` does the `migrate deploy` on every run, so this is proved on every `npm run test:db`. Asserted in-suite at `src/server/schema/columns.db.test.ts:101`. |
| AC-25 | PASS | **Red gate re-executed by the reviewer.** `ALTER TABLE "Item" DROP CONSTRAINT "Item_description_not_empty"` against `TEST_DATABASE_URL` (confirmed absent from `pg_constraint`), then `bash ./init.sh` → exit `1`, `[FAIL] npm run test:db failed`, `[FAILED] 1 problem(s)`, with 3 failures in `src/server/schema/constraints.db.test.ts` each reading `expected the database to refuse this write through Item_description_not_empty, but it succeeded`. Constraint restored with the migration's own `ADD CONSTRAINT`; `pg_get_constraintdef` reads back the identical definition and `npm run test:db` is 79/79 green. Green run: see the `init` header above. |
| AC-26 | PASS | **Re-executed**: with all four connection variables at `db.invalid` / `test-db.invalid`, `bash ./init.sh` → exit `0`, `[skip] database unreachable at db.invalid - database-dependent checks skipped`, `[OK] Environment ready (database checks skipped)`, `npm run test:db` never invoked, `test:unit` 14/79 green, e2e `12 passed / 14 skipped`. `npx prisma validate` and `npx prisma generate` under the same variables both exit `0`. |
| AC-27 | PASS | `tests/unit/project-contract.test.ts:82` (the directory holds only `*.db.test.ts`), `:95` (config include/exclude). Neither vitest config was changed (both read clean in `git status`). The reviewer's own runs: `test:unit` executed 14 files, none `*.db.test.ts`; `test:db` executed the 3 new + 4 pre-existing. `TEST_DATABASE_URL=""` → exit `1` naming the variable; `TEST_DATABASE_URL == DATABASE_URL` → exit `1` naming the collision — both **before** a test file is loaded. |
| AC-28 | PASS | `src/server/test-db.ts`; the `MACROADS_TEST_DB` guard is character-for-character unchanged (`git diff -M` shows only the doc comment, the new deletes and the `Location` restore). The four pre-existing `*.db.test.ts` files differ by the import specifier and nothing else — I read all four diffs. Tests at `src/server/schema/referential.db.test.ts:334,354,369`. Order independence re-run by the reviewer: `npm run test:db` with the seven files listed in reverse plus `--sequence.shuffle.files` → 7 files / 79 tests, exit `0`. |
| AC-29 | PASS | `src/server/schema/referential.db.test.ts:306`, with the anti-vacuity guard at `:321`. Re-checked by hand against the live `pg_indexes` dump: every one of the eleven foreign-key columns leads an index (`Item_supplierId_idx`, `Item_itemTypeId_idx`, `ItemPrice_itemId_effectiveFrom_key`, `ItemLocation_itemId_locationId_key`, `ItemLocation_locationId_sortOrder_idx`, `StockCount_locationId_periodYear_periodMonth_key`, `StockCount_createdById_idx`, `StockCount_approvedById_idx`, `StockCount_signedById_idx`, `StockCountLine_stockCountId_itemId_key`, `StockCountLine_itemId_idx`). |
| AC-30 | PASS | Reviewer's `init` run: `typecheck`, `lint`, `test:unit` (79), `test:e2e` (26), `test:db` (79) all green. The four pre-existing db tests keep every assertion (diff is one line each). `tests/unit/hashing-boundary.test.ts:95` still forbids `PrismaClient` under `src/app/` and `src/components/`. |
| AC-31 | PASS | `git status --porcelain` lists exactly the permitted set and nothing else — 12 modified/renamed paths plus the new migration directory, `src/server/schema/`, and `progress/impl_domain_schema.md`; no path under `src/app/`, `src/components/` or `src/lib/`; no action, route handler or exported service function added. Money scan at `tests/unit/project-contract.test.ts:113` with the non-vacuity assertion on `src/server/db.ts`. **Proved non-vacuous by mutation**: adding `src/server/reviewer-price-probe.ts` returning the string `unitPriceSnapshot` turned it red naming the file; reverted. The widened dependency guard at `tests/unit/hashing-boundary.test.ts:134` is present and **proved red by mutation** for a `@/server/db` importer under `src/lib/` *and* under `src/app/`; both reverted. See amendment audit §1 for a correction to the rationale. |

---

## Audit of the four post-approval amendments

The reviewer was asked to judge these adversarially. Verdicts, with evidence.

### §1 — AC-31's file list and the `/^src\/server\//` regex — **necessary and correct, but the stated rationale is wrong**

The *file-list* half is unarguable: `AC-27 ∧ AC-28 ∧ AC-30 ⟹` that guard must change, and no
shim avoids it because `src/server/test-db.ts` is itself an importer. The implementer was
right to stop, and the extension is the right resolution.

The *rationale* is not right. The spec says the new regex is "**replaced, not weakened**"
and "stronger … in one respect, because it covers `src/lib/`, which neither existing test
checks"; the code comment at `tests/unit/hashing-boundary.test.ts:141-148` repeats it.
Mutation says otherwise:

- With `src/lib/reviewer-leak.ts` importing `@/server/db`, the **new** guard goes red:
  `expected 'src/lib/reviewer-leak.ts' to match /^src\/server\//`.
- The **old** guard would have gone red on precisely the same file. Evaluated directly:
  `/^src\/server\/(auth\/|db(\.test)?\.ts$)/.test("src/lib/reviewer-leak.ts")` → `false`.
  The old assertion applied the same predicate to the same file population
  (`codeFiles()` covers all of `src/`, `scripts/`, `prisma/`), so `src/lib/` was already
  covered by the very assertion that was edited.

As predicates, `/^src\/server\//` accepts a **strict superset** of what the old regex
accepted (`src/server/items/…`, `src/server/schema/…`, `src/server/test-db.ts` are newly
permitted; nothing newly forbidden). It is therefore a weakening of that one assertion —
a *bounded, forced, and architecturally correct* weakening, because everything it now
permits is permitted by `CLAUDE.md` and `docs/architecture.md` anyway. No documented rule
is left unguarded, so this does not block approval. But the sentence as written will be
cited by #6, #7 and #11 when they touch that guard, and it should not tell them the guard
got stronger. Recommended replacement wording is in Observation 1.

The coordinator's briefing repeated the same premise ("confirm the old regex would **not**
have caught the `src/lib/` case"). It would have.

### §2 — AC-20's SQLSTATE `23001` — **correct, and genuinely stricter**

Verified against the live test database, not read:

- `ON DELETE RESTRICT` (what AC-19 mandates): `PostgresError { code: "23001", … violates
  RESTRICT setting of foreign key constraint "StockCountLine_itemId_fkey" … }`, surfaced by
  Prisma as `PrismaClientUnknownRequestError` with `error.code === undefined`.
- `ON DELETE NO ACTION` (what AC-19 forbids): I created a throw-away parent/child pair with
  each policy inside a rolled-back transaction; the `NO ACTION` delete failed with
  `Code: 23503`, the `RESTRICT` delete with `23001`.

So the original `P2003` (= `23503`) was only ever obtainable from a key AC-19 forbids: the
old criterion could have been satisfied *only* by violating AC-19. The amended one asserts
the SQLSTATE, the message text and the constraint name, and is the stricter assertion. The
amendment is right.

### §3 — "`P2002` naming the constraint" — **the strongest available reading, not a dodge**

Observed directly: a duplicate `(locationId, periodYear, periodMonth)` yields
`code: P2002`, `meta: {"modelName":"StockCount","target":["locationId","periodYear","periodMonth"]}`,
message `Unique constraint failed on the fields: (…)`. The constraint name is nowhere in
the error. `expectUniqueViolation` (`src/server/schema/constraints.db.test.ts:58`) therefore
requires **both** that the reported model+fields compose the expected index name **and**
that `pg_indexes` holds a `CREATE UNIQUE INDEX` under exactly that name. That pair is
strictly more than the name alone would have been: it additionally pins the default index
naming, so a `map:`-renamed constraint would turn it red. Accepted.

### §4 — the `unitPrice` scan over shipping modules — **correct, and non-vacuous**

The literal reading was unsatisfiable (`src/lib/money-boundary.test.ts` has used the string
as a fixture since #3). The narrowed scan still covers every module that could ship a price
to a caller: all of `src/` and `scripts/` minus `*.test.ts`. It carries an explicit
non-vacuity assertion (`toContain("src/server/db.ts")`), and I proved it bites: a new
`src/server/reviewer-price-probe.ts` returning `"unitPriceSnapshot"` made it red naming the
file. Reverted.

### The `rejection(action, refusedBy)` change — **stricter, not looser**

`refusedBy` is used only to build the failure message thrown when the database *fails* to
refuse. It adds no accepted outcome and removes no assertion; every write still has to be
rejected, and the separate `expectUniqueViolation` / `expectRestrictViolation` /
`toContain(constraintName)` assertions are unchanged. My AC-25 red run shows what it bought:
the failure now reads `expected the database to refuse this write through
Item_description_not_empty, but it succeeded` — it names the rule that stopped being
enforced. Strictly an improvement to a gate that had already been proved red.

---

## Cleanliness of the databases and the tree

- **Test branch emptied to bedrock and rebuilt** — corroborated before I touched it:
  `_prisma_migrations` held both rows with `finished_at` within 0.3 s of each other on
  2026-09-09T14:43:47, i.e. both applied by one `migrate deploy`, not #3's original run.
  I then repeated the exercise myself (`DROP SCHEMA public CASCADE` → `npm run test:db`)
  and left it rebuilt and green.
- **`Item_description_not_empty` restored** — `pg_get_constraintdef` on the test branch
  reads `CHECK ((btrim(description) <> ''::text))`, identical to the migration's, both
  before and after my own AC-25 red-gate run.
- **Development database never mutated by the proofs** — queried directly: `create_user`
  still carries its original 2026-09-08T22:45 timestamp (so it was never dropped and
  redeployed), `create_stock_domain` applied 2026-09-09T13:52 by `migrate dev` as intended,
  both `CHECK` constraints present, the two `Location` rows present, and every other table
  holds zero rows. No test data, no drift (`prisma migrate status` exit `0` inside `init`).
- **Working tree** — `git status --porcelain` matches AC-31's permitted set exactly and is
  byte-identical to the state before this review; `git clean -nd` would remove only
  `prisma/migrations/20260909135148_create_stock_domain/`, `progress/impl_domain_schema.md`
  and `src/server/schema/`. No scratch files. `Samples/` clean (`init`'s own check plus
  `git status -- Samples`). `.env` is gitignored (`.gitignore:14-15`) and untracked.
- **All six reviewer mutations reverted**: two schema mutations (sha256 of
  `prisma/schema.prisma` identical before/after), two `@/server/db` importer files deleted,
  one `unitPrice` probe deleted, one dropped `CHECK` restored. My database probes ran in
  rolled-back transactions or cleaned up after themselves; the only rows in the test branch
  are the ordinary residue of the last `*.db.test.ts` file to run.

## Checkpoints

**C1 — Process**
- C1.1 [x] Only #4's files changed; `git status` contains no path belonging to another feature.
- C1.2 [x] `specs/features/004-domain_schema.md` exists, 31 numbered criteria.
- C1.3 [x] All 31 satisfied — table above; each has a named test, and the database-backed ones were re-queried by the reviewer.
- C1.4 [x] Verified programmatically: `feature_list.json` `acceptance[]` has 31 entries and each is the spec's criterion **verbatim** (0 mismatches after stripping the `N. **AC-N** — ` prefix), including the amended AC-20 and AC-31. `spec_file` matches the convention.
- C1.5 [x] `progress/impl_domain_schema.md` exists and its file list matches `git status --porcelain` exactly.

**C2 — Verification**
- C2.1 [x] `bash ./init.sh` run by the reviewer: `[OK] Environment ready`, database checks executed, no `[skip]`. The gate was also proved red (AC-25) and re-greened.
- C2.2 [x] `npm run typecheck` — `[ok]` in the reviewer's run.
- C2.3 [x] `npm run lint` — `[ok]` in the reviewer's run.
- C2.4 [x] No service function is added by this feature (that is AC-31's point). The one exported helper, `resetTestDb()`, has three tests, and its `MACROADS_TEST_DB` failure path is #3's, unchanged.
- C2.5 [x] Assertions are on values — `numeric 18/8`, `"6.11764706"`, `delete_rule RESTRICT`, `23001`, index names — not on "no exception thrown". Every "it is refused" test also asserts the row count is unchanged.
- C2.6 [x] Real Neon test branch throughout; nothing is mocked. Reviewer re-queried the same database independently.

**C3 — Architecture**
- C3.1 [x] `tests/unit/hashing-boundary.test.ts:95` and `:134`; no file under `src/app/` or `src/components/` was touched at all.
- C3.2 [x] Everything Prisma-facing is under `src/server/`; `@prisma/client` is imported only by `src/server/db.ts` (grep confirms; the other four matches are prose in comments).
- C3.3 [x] `src/lib/excel/` does not exist yet; nothing added under `src/lib/`.
- C3.4 [x] `src/server/test-db.ts` imports only `@/server/db`; the three new files import `@/server/db` and `@/server/test-db`. No cycle.
- C3.5 [x] `prisma/migrations/20260909135148_create_stock_domain/migration.sql` ships with the schema edit, and applies from an empty database (AC-24, re-executed).

**C4 — Domain integrity**
- C4.1 [x] No stored value — re-queried with a regex wider than the test's; the only match in `public` is `_prisma_migrations.checksum`.
- C4.2 [x] No response body exists yet; the `unitPrice` scan (proved red by mutation) keeps it that way until #8 goes through `shapeForRole`.
- C4.3 [x] `numeric(18,8)` for both money columns, `numeric(12,4)` for both quantity columns, zero `double precision`/`real` columns — all re-queried live.
- C4.4 [x] Not enforceable at the schema layer and explicitly assigned to #7/#9 by the spec's *Out of scope*; the columns (`status`, `submittedAt`, `signedById`, `signatureSvg`) exist so #9 can enforce it. Nothing here contradicts the rule.
- C4.5 [x] Same: `unitPriceSnapshot` exists, is nullable-while-`DRAFT` (asserted), and no code yet writes it. Invariant 2's write-once rule is #9's.
- C4.6 [x] Same: `CountStatus` exists; immutability is a service rule, deliberately out of scope.
- C4.7 [x] `21.6128`, `0.475` and `6.11764706` round-trip exactly — re-executed by the reviewer against Postgres, both through Prisma and through raw SQL.
- C4.8 [x] `git status -- Samples` empty; `init`'s own check `[ok]`.

**C5 — Conventions**
- C5.1 [x] `test-db.ts` kebab-case, models `PascalCase` singular, columns `camelCase`, enum values `SCREAMING_SNAKE`, tests named `AC-n: …` sentences. `src/server/schema/` holding only tests is what AC-27 mandates.
- C5.2 [x] No service errors are added. The only `throw new Error` are inside test helpers, which is where `docs/conventions.md` permits it.
- C5.3 [x] No `console.log` in `src/` (the only hit is prose in `src/lib/log.ts`'s comment).
- C5.4 [x] No `TODO` in `src/`, `scripts/` or `prisma/`.
- C5.5 [x] `.env` gitignored and untracked; no connection string in any changed file (the tests read `@/server/db`, never a URL).

**C6 — Session hygiene**
- C6.1 [x] `progress/current.md` is a running log, including the blocker at the moment it was raised and the resumption.
- C6.2 [x] `git clean -nd` shows only the three intended untracked paths.
- C6.3 [x] `#4` is `in_progress`, which is reality: implementation complete, reviewed, awaiting the user's close. The implementer correctly did not mark it `done`.

**C7 — Advisory:** not applicable. This feature ships no screen, so empty/loading/error
states, phone-width layout and number formatting have nothing to attach to; the spec's
*UI states* section records that boundary deliberately.

## Required changes

None. The feature is approved as it stands.

## Observations (non-blocking)

1. **The rationale on the dependency guard overstates it.** `tests/unit/hashing-boundary.test.ts:141-148` — the comment says the widened regex "is stronger in one respect, because it also covers `src/lib/`, which no other test checks". The assertion it replaced already covered `src/lib/` by the same mechanism (proved above), so as a predicate the new regex is strictly weaker, not stronger. Suggested honest wording, for whoever next edits that file: *"#3 wrote `/^src\/server\/(auth\/|db(\.test)?\.ts$)/`, when `auth/` was the only aggregate. #4 relaxes it to the minimum `CLAUDE.md` actually requires — data access goes through `src/server/` — because AC-27 and AC-28 put database importers under `src/server/schema/` and at `src/server/test-db.ts`. It permits more paths than #3's did, and every path it now permits is one `docs/architecture.md` permits. Enumerating `auth/|schema/|test-db.ts` would need editing again for #6, #7 and #11, and every edit to a guard rail is a chance to weaken it."* The same correction applies to `specs/features/004-domain_schema.md` § Post-approval amendments §1 and to AC-31's last sentence, which the user approved on the strength of that claim. Worth fixing before #5 cites it; not a defect in the code.
2. **AC-6's "only two monetary columns" test is narrower than the sentence it proves.** `src/server/schema/columns.db.test.ts:237` filters column names by `/price/i`, so a future `cost`, `rate` or `eurPerTonne` would not trip it. In practice the gap is closed by AC-4's exact per-model field lists and AC-11's regex, and I confirmed live that no such column exists today. Worth widening when #5 or #9 next touches that file.
3. **A `*.db.test.ts` run leaves the rows of whichever file ran last.** `resetTestDb()` runs in `beforeEach`, not `afterAll`, so after a green suite the test branch holds one `User`, one `Item` and one `StockCount` from `columns.db.test.ts`. Harmless, and #3's design, but it makes the report's "the test database is left exactly as the migrations make it" slightly stronger than the truth.
4. **`expectRestrictViolation` matches on the rendered error string** (`src/server/schema/referential.db.test.ts:85` looks for `code: "23001"` inside `String(error)`). That is the only way to reach the SQLSTATE, since Prisma leaves `error.code` undefined here — but it is coupled to Prisma's debug rendering of `ConnectorError`, so a Prisma upgrade may make it red for a reason that is not a regression. It will fail loudly rather than silently, which is the right failure mode; worth a note in #5's session if Prisma is bumped.
5. **Import order in the four re-pointed test files** puts `@/server/test-db` before `@/server/db`. `docs/conventions.md` does not order within the `@/` group and lint is green, so this is cosmetic only.
6. **`AC-4`'s failure message when a whole model is deleted** is `expected -1 to be greater than or equal to 0` (from `blockBody`), which does not name the missing model. The two set-equality assertions in the same run do name it, so the mutation is still diagnosable — but a `blockBody` that threw `model ItemPrice not found` would be kinder to the next person.
