# Implementation — feature 16 deploy

**Spec:** specs/features/016-deploy.md (approved 2026-09-28, commit `2ba37ac`)

## Phase A1

**Scope:** AC-1 to AC-10 (build pipeline and data tools). AC-11 to AC-18 are Phase A2; AC-19
onward is Phase B.
**Status:** complete, with one finding that needs a ruling (F1 below: a copy taken while a
profile request is `PENDING` cannot be restored).
**Brief:** `scratchpad/impl16-a1.md`. Nothing pushed, nothing committed, and nothing touched
Vercel, Neon's dashboard, GitHub settings, `production`, or any `.env` value.

### Work log

Each line records a step that was finished and verified.

- 2026-09-28, start: read `AGENTS.md`, the spec (all of it), `progress/spec_deploy.md`,
  `docs/architecture.md`, `docs/conventions.md`, and every *Notes for the reviewer* in
  `progress/impl_pin_auth.md`. #16 was already `in_progress`. Wrote the plan to
  `progress/current.md` before any code.
- Wrote the census (`src/server/deploy/census.ts`, `scripts/db-census.ts`) first, so the
  development baseline could be taken with it. **Development census before anything else
  ran** (read-only): 2 locations, 10 suppliers, 19 item types, 140 items with 15 needing
  review, 129 prices, 152 yard links, profiles `ADMIN ACTIVE 1`, stock counts `DRAFT 1`, 82
  count lines, 3 migrations with the latest `20260925120000_pin_profiles`, and pins 1 of 1.
- Wrote the build plan, the two guards and the runner (`src/server/deploy/build-plan.ts`,
  `scripts/vercel-build.ts`), `vercel.json`, the six `package.json` scripts, the guarded seed
  (`src/server/items/item-master-seed.ts`, `scripts/seed-if-empty.ts`), the export and the
  restore (`src/server/deploy/{target-schema,export,restore}.ts`, `scripts/db-export.ts`,
  `scripts/db-restore.ts`), and the launcher (`scripts/operator-production.mjs`).
  `typecheck` exit 0.
- Unit files `deploy-config`, `vercel-build` and `operator-production`: 59 tests green. The one
  red run on the way was my test's own prefix match (`TEST_DATABASE_URL is set` contains
  `DATABASE_URL is set`). I fixed the test, not the code.
- Ran the database files one at a time on the **test** database. Each was green on its first
  run, with no connection error and no timeout:
  - `item-master-seed` 6/6, 27 s;
  - `census` 3/3, 7 s;
  - `export` 9/9, 26 s;
  - `restore` 9/9, 61 s;
  - `operator-production` 1/1, 5 s.
- **F1 proved** with a throwaway probe, a `*.db.test.ts` that was created, run once and
  deleted. I took AC-9's fixture plus one `PENDING` profile request, exported it and restored
  it into a throwaway schema. `db:restore` exited 1 with `PrismaClientKnownRequestError
  (P2010)` and left 0 `User` rows in the target. The same fixture without the `PENDING` row
  restores identical. I recorded this and did not work around it.
- Ran six mutations: M1 to M6, with M6 in three forms, a, b and c (table below). For each one I
  made a byte copy, applied the mutation, watched the test go red, restored the copy and got
  `sha256sum -c` OK.
  - M4's first red run showed that the "pinHash is null" assertion would have printed a fixture
    hash into the log if it failed. I rewrote it to assert counts only, and re-ran M4 against
    it.
  - For M5, a table-only target was also stopped by Prisma's own P3005 refusal, so I added a
    target that has already been migrated, as a database in use would be.
  - The launcher assertions now compare values as yes or no, so a failure prints no answer.
- The full `test:unit` found two existing scans red on my new text:
  - `no-default-password` read the launcher's question texts, and one `SETUP_CODE` assignment
    in a test, as written-down values.
  - 021 AC-31: the shared export fixture, which is not a test file, imported the operator
    service.

  I fixed both: the questions are now built from name/hint pairs, the test uses a variable,
  and the fixture writes profiles with `hashPin`. I then repeated M6a and M6b on the final
  launcher: red, restored, sha OK.
- Re-ran on the final code:
  - `test:unit` 1072/1072;
  - `export` 9/9;
  - `operator-production` 1/1;
  - `restore` 10/10, 71 s;
  - `typecheck` 0 and `lint` 0;
  - `npm run build` exit 0, with `DATABASE_URL` and `DIRECT_URL` pointed at an unresolvable
    `.invalid` host.
- **Development census after:** identical to the baseline, line for line.
- Port 3000 is **not free**, and not because of me. It is held by `next dev --port 3000`
  (PID 13116, parent 24176), started 2026-09-26 23:54, two days before this session. I did not
  kill it (F4).

### Files created

- `vercel.json`: `regions` `["lhr1"]`, `buildCommand` `npm run build:vercel`, and
  `git.deploymentEnabled` `{"**": false, "production": true}`.
- `src/server/deploy/build-plan.ts`: pure. `planVercelBuild`, `STEP_COMMANDS`,
  `previewDatabaseProblems` (AC-3), `productionSettingsProblems` (AC-4), and `vercelBuild`, the
  runner with an injected step runner (AC-5).
- `scripts/vercel-build.ts`: `npm run build:vercel`. It wires `vercelBuild` to the real env and
  spawns each package's CLI with no shell.
- `src/server/items/item-master-seed.ts`: `seedItemMasterIfEmpty` and `readMasterCounts`
  (AC-6).
- `scripts/seed-if-empty.ts`: the `seed-if-empty` step. It prints `[seed] SEEDED` or
  `[seed] SKIPPED`.
- `src/server/deploy/census.ts`: `databaseCensus` and `renderCensus` (AC-7).
- `scripts/db-census.ts`: `npm run db:census`.
- `src/server/deploy/target-schema.ts`: the `schema` parameter of the connection strings,
  defaulting to `public`, and SQL identifier quoting.
- `src/server/deploy/export.ts`: `exportDatabase(schema)`. It reads in one read-only
  repeatable-read transaction and is generic over `information_schema` (AC-9).
- `scripts/db-export.ts`: `npm run db:export -- --out <file>`, with the refusals, the
  exclusive write and the SHA-256.
- `src/server/deploy/restore.ts`: `exportFileProblems`, `relationsInSchema`, `restoreRows`
  (one transaction, foreign-key order, insert only), `compareWithFile` and `isIdentical`
  (AC-10).
- `scripts/db-restore.ts`: `npm run db:restore -- --in <file>`.
- `scripts/operator-production.mjs`: the launcher (AC-8). It exports `planCommand`,
  `runLauncher`, `ACCEPTED_FORMS` and `PROMPTED_NAMES` for the unit tests, and runs only when
  invoked directly.
- `tests/unit/deploy-config.test.ts`: AC-1.
- `tests/unit/vercel-build.test.ts`: AC-2 to AC-5.
- `tests/unit/operator-production.test.ts`: AC-8, the launcher's half.
- `src/server/items/item-master-seed.db.test.ts`: AC-6.
- `src/server/deploy/census.db.test.ts`: AC-7.
- `src/server/deploy/export.db.test.ts`: AC-9.
- `src/server/deploy/restore.db.test.ts`: AC-10.
- `src/server/deploy/operator-production.db.test.ts`: AC-8, the database half.
- `tests/support/run-script.ts`: runs a repository script (`tsx`) or the Prisma CLI under this
  Node with no shell, plus `without(env, names)`.
- `tests/support/export-fixture.ts`: AC-9's fixture, with at least one row in every table and
  the two exact figures. It also provides `schemaModels()`.

### Files modified

- `package.json`: adds `build:vercel`, `db:census`, `db:export`, `db:restore`,
  `operator:production` and `verify:deploy`. `build` is unchanged (`next build`).
  `verify:deploy` points at `scripts/verify-deployment.ts`, which Phase A2 creates (F2).
- `progress/current.md`: plan and work log.

### Acceptance criteria

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | `vercel.json`; `package.json` scripts | `tests/unit/deploy-config.test.ts`: "AC-1: declares regions equal to [lhr1] and buildCommand…", "AC-1: enables Git deployments for the branch production and disables them for every other branch, main included", "AC-1: it has no env and no build.env key", "AC-1: gains build:vercel, db:census…", "AC-1: build stays exactly next build", "AC-1: neither init.sh nor init.ps1 invokes one", "AC-1: no test:* script invokes one, and neither do the runner files they name", plus two non-vacuity cases |
| AC-2 | `build-plan.ts` → `planVercelBuild`, `STEP_COMMANDS` | `vercel-build.test.ts`: one case each for production, preview, development, any other value and unset, and "AC-2: migrate-deploy runs prisma migrate deploy…" |
| AC-3 | `build-plan.ts` → `previewDatabaseProblems`, checked in `vercelBuild` before any step | `vercel-build.test.ts`: "AC-3: VERCEL_ENV preview/development/staging/unset: each database setting alone refuses, before next build, naming only itself" (4 cases), "all four set print one line for each", "with VERCEL unset… the refusal does not apply", "an empty setting is not a setting…". Every run is checked for every sentinel. |
| AC-4 | `build-plan.ts` → `productionSettingsProblems` (the `check-settings` step) | `vercel-build.test.ts`: one test per rule: the five required settings unset or empty; TEST_* set; `-pooler` on each side; hosts differing; no host; AUTH_URL (seven malformed shapes); PIN_PEPPER; AUTH_SECRET at 31 and 32; SETUP_CODE short, 16 and unset. Also "lists every problem", and "a complete, well-formed set passes and prints the names it checked". The sentinels and hosts are asserted absent throughout. |
| AC-5 | `build-plan.ts` → `vercelBuild`; `scripts/vercel-build.ts` | `vercel-build.test.ts`: "runs the plan's steps in order and prints <step> ok", "a failed next-build / migrate-deploy / seed-if-empty / census … runs no later step", "--dry-run prints the plan and runs nothing", and five real `npm run build:vercel -- --dry-run` runs, one per VERCEL_ENV of AC-2 |
| AC-6 | `item-master-seed.ts`; `scripts/seed-if-empty.ts` | `item-master-seed.db.test.ts`: "returns SEEDED with 10, 19, 140, 129 and 152", "the script prints [seed] SEEDED … then [seed] SKIPPED … exits 0", "after an ADMIN renamed an item, it returns SKIPPED and writes nothing: … deep-equal", "(non-vacuity): importWorkbook, given that same state, creates one item", "a partly filled item master throws ConflictError naming each of the five tables with its count, and writes nothing", "the script exits non-zero for a partly filled item master" |
| AC-7 | `census.ts`; `scripts/db-census.ts` | `census.db.test.ts`: "npm run db:census prints one [db:census] line each, in order, and says pins: 1 of 2". This asserts the exact eleven lines, and that no username, name, price, key id, hash, host or connection string appears. |
| AC-8 | `scripts/operator-production.mjs` | `tests/unit/operator-production.test.ts` (12 tests): every accepted form and its prompts; every refusal; CRLF lines; a terminal stand-in, typed at run time, shows nothing and toggles raw mode; backspace and Ctrl+C; an answer equal to `.env`'s is refused for each name; `.env`'s value is never used; no file-writing API; the real process refuses. Also `src/server/deploy/operator-production.db.test.ts`: "db:census through the launcher reports what the test database holds". |
| AC-9 | `export.ts`; `scripts/db-export.ts` | `export.db.test.ts`: the set equals the 12 schema models and every count equals its table's (plus git working tree unchanged); both figures appear exactly; `pinHash`/`pinKeyId` null and `omitted`; the exact output lines and SHA-256 with no username, name or price; no setting value appears in the file or the output; the repeatable-read, read-only transaction; the refusals (inside the repo ×3, an existing file, a missing `--out`), made with an unreachable database |
| AC-10 | `restore.ts`; `scripts/db-restore.ts` | `restore.db.test.ts` (10 tests): the round trip (every table identical, and a second export equals the first apart from `exportedAt`); census on the restored schema equals the source's with `pins: 0 of 0`; refusals: a table in the schema, a migrated schema, format, migrations, count vs rows, and differing schemas; a constraint-breaking row leaves no restored row; a differing migration-written `Location` rolls everything back |

### Mutations

Each mutation was applied to a byte copy, run, and then restored from the copy, with `sha256sum
-c` OK. The copies are in `scratchpad/a1-mut/`.

| # | Mutation | File | Result |
|---|---|---|---|
| M1 | A preview build with a database setting builds: the guard always returns no problem | `build-plan.ts` | 5 AC-3 tests red (preview, development, staging, unset, and all four) |
| M2 | A production build with a missing setting builds: the required-setting check is skipped | `build-plan.ts` | 2 AC-4 tests red ("each of the five required settings…", "lists every problem…") |
| M3 | The seed runs into a non-empty item master: the importer runs, then `SKIPPED` is reported | `item-master-seed.ts` | "after an ADMIN renamed an item… deep-equal" red, 1 of 6 |
| M4 | The export includes a `pinHash`: removed from `OMITTED_COLUMNS` | `export.ts` | "every User.pinHash and User.pinKeyId is null…" red, with the count-only message `User rows holding a PIN credential: expected 2 to be +0` |
| M5 | The restore writes into a schema that has tables: the refusal is skipped | `db-restore.ts` | Both refusal tests red. With the mutation, the migrated target **was written into**, and the restore exited 0. |
| M6a | The launcher accepts an answer equal to `.env`'s | `operator-production.mjs` | "an answer equal to the value .env holds…" red. Repeated on the final file: red. |
| M6b | The launcher uses `.env`'s value instead of the answer | `operator-production.mjs` | "a value .env holds is never used…" red. Repeated on the final file: red. |
| M6c | The launcher fills an empty answer from `.env` | `operator-production.mjs` | The real-process test went red. In-process, the equality refusal also stops the filled value. |

### Verification output

I did not run `init`, the full `test:db` or the full `test:e2e`: the brief says the coordinator
runs the gate. What I ran:

```
$ npm run typecheck        -> exit 0
$ npm run lint             -> exit 0
$ npm run test:unit
 Test Files  75 passed (75)
      Tests  1072 passed (1072)
   Duration  47.13s
$ DATABASE_URL=<unresolvable .invalid host> DIRECT_URL=<same> npm run build
ƒ Middleware                             87.3 kB
build exit 0
$ npm run test:db -- <one file at a time>   (final code)
 ✓ src/server/items/item-master-seed.db.test.ts (6 tests) 27148ms
 ✓ src/server/deploy/census.db.test.ts (3 tests) 6569ms
 ✓ src/server/deploy/export.db.test.ts (9 tests) 26945ms
 ✓ src/server/deploy/operator-production.db.test.ts (1 test) 3799ms
 ✓ src/server/deploy/restore.db.test.ts (10 tests) 71178ms
$ npm run db:census   (development, read-only; before and after, identical)
[db:census] locations: 2
[db:census] suppliers: 10
[db:census] item types: 19
[db:census] items: 140, 15 need review
[db:census] prices: 129
[db:census] yard links: 152
[db:census] profiles: ADMIN ACTIVE 1
[db:census] stock counts: DRAFT 1
[db:census] count lines: 82
[db:census] migrations: 3 applied, latest 20260925120000_pin_profiles
[db:census] pins: 1 of 1 made under the given PIN_PEPPER
```

The seed and census files were last run before two edits: the export fixture change, and the
launcher's question texts. Neither file uses the changed code.

### Findings, for a ruling or for the coordinator

- **F1: a copy holding a `PENDING` profile request cannot be restored.** The pin_profiles
  migration's CHECK requires a `PENDING` row to hold a non-null `pinHash`, while D20 and AC-9
  write every `pinHash` as null. `restoreRows` is one transaction, so the whole restore rolls
  back. The probe in the work log shows it: exit 1, P2010, 0 rows. AC-9's fixture has no
  `PENDING` row, so every AC-9 and AC-10 test is green. The risk is real, though: a monthly copy
  taken while a staff request awaits approval would fail AC-28's drill, or a real restore. I
  did not work around it. The spec has to say which of these it wants:
  - the export leaves `PENDING` rows out;
  - the restore writes them as `REJECTED`;
  - the CHECK is relaxed by a migration;
  - or the owner accepts that a request is lost and re-made.
- **F2: `verify:deploy` exists in `package.json`, but its file does not yet.** AC-1 (A1) lists
  the script, and AC-13 (A2) creates `scripts/verify-deployment.ts`. Until A2 lands,
  `npm run verify:deploy` fails with "cannot find module". Nothing in the gate runs it, and
  AC-1's test asserts that.
- **F3: the Vercel rule for `git.deploymentEnabled` comes from memory, not from a page opened
  in this session.** I had no web access here. The address AC-1 asks me to cite is
  <https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled>. From
  that page, as I know it: branches match by minimatch; a branch matching no key deploys; a
  branch matching several keys deploys if any of them is `true`; `"deploymentEnabled": false`
  turns everything off. The file uses `"**": false` plus `"production": true`. **Before
  go-live, the coordinator should open that page and confirm both the any-true rule and that
  `**` matches every branch.** AC-26 then observes the behaviour live.
- **F4: port 3000.** A `next dev --port 3000` started on 2026-09-26 at 23:54 (PID 13116, parent
  24176) still listens. It is not mine, so I left it running. My `npm run build` rewrote
  `.next` beneath it, so that dev server may need a restart. The e2e gate needs the port free.
- **F5 (observation): a restore rejects a `Location` row that differs from the migration's.**
  No application path writes `Location` today, so a production copy always matches. A future
  feature that edits yards would turn this rule into a restore failure.
- **Not confirmed here:** D18's "Prisma's default connect timeout is 5 s". It is not in the
  JavaScript bundles; it lives in the query engine. It is not an A1 criterion.

### Deviations from the spec

- **The census, with no usable pepper.** The spec does not say what the `pins` line shows when
  `PIN_PEPPER` is absent. It prints `pins: <n> stored, not checked: PIN_PEPPER is not set or
  not usable` and exits 0. Through the launcher, the pepper is always asked for.
- **`--dry-run` applies no guard.** It prints the plan and runs nothing, the preview refusal
  included.
- **The launcher stops at the first refused answer.** It exits 2 without asking the rest, and
  does not ask again. Answers are trimmed; a pasted value with spaces is the same value. Ctrl+C
  exits 130. Prompts and refusals go to stderr. The command inherits stdout and stderr; its
  stdin is closed.
- **Extra refusals, beyond the spec's:**
  - the restore refuses when `DATABASE_URL` and `DIRECT_URL` name different schemas;
  - the export refuses a schema with no `_prisma_migrations`, a table with no primary key, and
    a `User` table missing either credential column;
  - the restore refuses when the file's tables are not the migrated schema's.
- **The restore reads back after its transaction commits.** A non-identical result exits
  non-zero, but the rows stay in the target, which was empty before.
- **The restore hides `prisma migrate deploy`'s output.** It prints `migrations applied: N` on
  success, and only Prisma's error code on failure, because Prisma's output names the host.
- **What "set" means for `SETUP_CODE` in AC-4.** "Set" means defined, so an empty value is
  refused too.
- **The seed's counts and its import are two transactions,** because `importWorkbook` owns its
  own. A write between them is not guarded; see the notes below.

### Notes for the reviewer

- **No secret, PIN or code anywhere.** Every setting in the tests is a runtime sentinel: random
  hex, hosts under `.invalid`, and connection strings joined from parts. Every PIN comes from
  `generatePin`. Every pepper and secret is `randomBytes`; `AUTH_SECRET` is `vi.stubEnv`'d in
  the export test. Every failure that could quote a value asserts counts or yes/no instead. I
  read no `.env` value. The launcher's database test checks by name only that `.env` assigns
  `DATABASE_URL`, as 021 AC-8's test does.
- **The money-column scan (006 AC-31) is untouched.** No new shipping module names the price
  columns. The export and the restore name only `User.pinHash` and `User.pinKeyId`. The fixture
  that writes a snapshot lives under `tests/support/`.
- **Nothing is restored into `public`.** Every restore targets a `restore_<hex>` schema that
  the test creates and drops in `afterEach`, and the probe dropped its own in `finally`. The
  `public` export source is the test database, emptied by `resetTestDb`.
- **Exact digits.** Rows are rendered by `row_to_json` and read back by
  `json_populate_recordset(... $1::json)`. The file's row text is split out by Postgres
  (`json_each`), never parsed into JavaScript numbers.
- **The `vercel-build` dry-run tests pass `timeout: 12_000` to `spawnSync`.** It is a kill
  switch for a broken dry run, which would otherwise start a real `next build` under a blocked
  worker. It is below vitest's 15 s, not a raised timeout.
- **Why the seed guard is not in one transaction with the import.** A concurrent writer
  during a production build is not a realistic case: the first build is the only one that
  seeds, and every later one sees five non-zero tables.
- **Cost.** The token cost of this task cannot be measured from inside the agent; read it from
  the transcript.

### After ruling A1-F1

The coordinator's ruling (spec → *Findings from Phase A1*, and AC-9's new bullet) says the
export leaves out every `User` row whose `status` is `PENDING` and records their number as
`omittedPendingRequests`. A1-F3 is confirmed from Vercel's page, so nothing changed there.
A1-F2 and A1-F5 are recorded as they stand. Port 3000 belongs to the owner and is left
running.

#### Work log

Each line records a step that was finished and verified.

- 2026-09-28: read the ruling and AC-9's amended text.
- **The export.** `OMITTED_ROWS` names `User.status = PENDING`. Inside the same read-only,
  repeatable-read transaction, the export counts those rows and selects `User` with the same
  test negated, so the number counted is exactly the number left out. The file gains
  `omittedPendingRequests` after `omitted`. `db:export` prints it as a count line after the
  table lines: `[db:export] omittedPendingRequests: <n>`.
  - The export refuses a `User` table with no `status` column, as it already refuses one
    missing a credential column.
  - `restore.ts` now requires `omittedPendingRequests` to be a non-negative integer, before it
    connects.
  - `typecheck` 0, `lint` 0.
- **AC-9's fixture** (`tests/support/export-fixture.ts`) gains one `PENDING` request. It is
  made through `requestProfile` from a new device, with a runtime PIN, and outcome `SENT` is
  required. The requester's name and username are added to the "never printed" set, and its
  credentials to the "never in the file" set.
- **`export.db.test.ts`, 10/10, 34 s.** One test is new: "AC-9 (ruling A1-F1): leaves out
  every PENDING User row, records omittedPendingRequests, and changes nothing in the database".
  It checks that the database held 1 pending row; the file has `omittedPendingRequests` 1, no
  `PENDING` row and 2 `ACTIVE` rows; neither the requester's name nor username is in the file;
  and the database still holds its 1 pending row. Two tests changed:
  - "every count equals its table's" now compares `User` against its non-`PENDING` rows;
  - the output test expects the new last line.
- **`restore.db.test.ts`, first run 10 passed, 1 failed.** The round trip's "a second export
  equals the first apart from `exportedAt`" failed. That follows from the ruling itself: the
  restored schema holds no pending request, so the second copy counts 0 where the first
  counted 1. The test now does four things:
  - asserts that the first copy counts 1 and the second counts 0;
  - compares the two texts without those two lines;
  - asserts that **exactly** two lines differ, `exportedAt` and `omittedPendingRequests`;
  - still requires every table `restored n, identical n` and exit 0.

  The census test now expects the source's profiles line with `YARD_STAFF PENDING 1` and
  `pins: 3 of 3`, and the restored one without the pending pair and with `pins: 0 of 0`. All
  other lines are equal. I added one refusal test: a file with no `omittedPendingRequests`.
  **Re-run: 11/11, 79 s.** The copy restores and reads back identical even though a request
  was pending in the source.
- **Mutation M7: the export keeps `PENDING` rows** (the filter's condition forced false). I made
  a byte copy first, sha prefix `2e9c8d96f05185aa`. Ran `restore.db.test.ts -t "round trip"`.
  **Both round-trip tests went red** on the restore's exit status, `expected 1 to be +0`, which
  is the probe's failure. Restored from the copy: `sha256sum -c` OK.
- **`npm run test:unit`:** the first run had 1 failure out of 1072. `lint-fence.test.ts`, "AC-33:
  `@/server/db` is an error from src/lib/", failed at 16.4 s, against a 15 s limit. That is the
  intermittent ESLint cold start `progress/current.md` already records; this change does not
  touch that file. Re-run once, as the brief allows: **75 files, 1072/1072.** I did not raise
  any timeout.
- **Development census,** read-only: unchanged, line for line, from the baseline.

#### Files modified (this step)

- `src/server/deploy/export.ts`: `OMITTED_ROWS`, the count and the filter in one transaction,
  and `omittedPendingRequests` in the result and in the file.
- `scripts/db-export.ts`: prints the count line.
- `src/server/deploy/restore.ts`: requires `omittedPendingRequests` in the file.
- `tests/support/export-fixture.ts`: the `PENDING` request, and `pendingRequest` in the result.
- `src/server/deploy/export.db.test.ts`, `src/server/deploy/restore.db.test.ts`: as described
  above.

#### Verification output

```
$ npm run typecheck        -> exit 0
$ npm run lint             -> exit 0
$ npm run test:db -- src/server/deploy/export.db.test.ts
 ✓ src/server/deploy/export.db.test.ts (10 tests) 33764ms
$ npm run test:db -- src/server/deploy/restore.db.test.ts
 ✓ src/server/deploy/restore.db.test.ts (11 tests) 79297ms
$ npm run test:unit        (second run; the first lost lint-fence to a 16.4 s timeout)
 Test Files  75 passed (75)
      Tests  1072 passed (1072)
```

#### For the coordinator

- **AC-10's wording.** "A second export equals the first apart from `exportedAt`" is no longer
  exact once the source holds a pending request: the counts differ, 1 before and 0 after. The
  test proves the narrower claim, that exactly those two lines differ. The spec may want "apart
  from `exportedAt` and `omittedPendingRequests`".
- **The ruled rule names more of the schema.** The export now names `User.status` and the value
  `PENDING`, in addition to the two credential columns. That still touches no money column, and
  006 AC-31's scan is green.
- **Not re-run, because they do not touch this change:** `item-master-seed`, `census` and
  `operator-production`. The census's `profiles` line already renders any role-and-status pair
  present.
