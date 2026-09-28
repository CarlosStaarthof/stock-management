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

## Phase A2

**Scope:** AC-11 to AC-18: the security headers, `GET /api/version`, the live check (both
passes), the money scanner, the destructive-migration guard and the runbook. AC-19 onward is
Phase B, not built here.
**Status:** complete. Two findings for the coordinator (A2-F1, A2-F2 below), neither blocking.
**Brief:** `scratchpad/impl16-a2.md`. Nothing pushed, nothing committed. Nothing touched Vercel,
Neon's dashboard, GitHub settings, the live address or any live database: the live check was
proved against stub servers and the local production build (`next start`) only. No `.env` value
was read into a file, a test or this report. `Samples/` and `tests/support/feature-scope.ts`
untouched.

### Work log

Each line records a step that was finished and verified.

- 2026-09-28, start: read the brief, the spec in full (decisions, owner decisions, both rulings,
  contract, go-live, backup and restore, rollback, AC-11 to AC-18), `## Phase A1` of this file,
  `docs/architecture.md`, `docs/conventions.md`, and the repository scans the new text has to
  pass (`repo-hygiene`, `no-default-password`, 021 AC-8's line and G1 rules, 006 AC-31's
  money-column scan). #16 was already `in_progress`. Plan written to `progress/current.md`
  before any code.
- **Development baseline** (read-only), before anything ran: the census printed 2 locations, 10
  suppliers, 19 item types, 140 items with 15 needing review, 129 prices, 152 yard links,
  profiles `ADMIN ACTIVE 1`, stock counts none, 0 count lines, 3 migrations (latest
  `20260925120000_pin_profiles`), pins 1 of 1. A read-only scratch count, since the census does
  not print them: 1 user, 0 counts, 1 lock row, 1 auth event. The owner's test count had already
  been deleted, as the coordinator said. Port 3000 free.
- AC-11, AC-12 and AC-16 written (`next.config.ts`, `src/app/api/version/route.ts`,
  `src/lib/deploy/money-scan.ts`), then the live check: `scripts/verify-deployment.ts`, the entry,
  over four modules in `scripts/verify/`. `typecheck` 0.
- Unit files `security-headers`, `version/route`, `money-scan` and `verify-deployment`: first
  run 60 passed, 3 failed, all three in my tests, not the code:
  - the spawned command exited with Windows status 0xC0000409. `process.exit()` was called
    while response bodies it had never read were still open. **Fixed in the code:** the request
    helper now reads every body to its end, and the entry sets `process.exitCode` instead of
    calling `process.exit()`;
  - two static rules matched prose and type annotations (a comment in `auth-config.ts` naming
    the database client; `body: string` parameters). I rewrote them to match what they are
    about: import specifiers, and the one `fetch` call's options, which the test pins exactly.
  - Re-run: 63 of 63. `typecheck` 0, `lint` 0.
- AC-17: `tests/unit/migration-safety.test.ts`, 6 of 7 on its first run. The failure was the
  rule not yet written into `docs/conventions.md` → *Database*. Wrote it: 7 of 7. The detector
  reports the real statement, not a masked copy. The failing line reads, for example,
  `20990101000000_a2_probe: drops a column: ALTER TABLE "User" DROP COLUMN "requestedUsername"`.
- AC-18: three sections appended to `docs/operations.md`, plus
  `tests/unit/operations-runbook.test.ts`. Ran it with `repo-hygiene`, `no-default-password`,
  `pin-auth-contract`, `project-contract`, `deploy-config` and `env-file`: 96 passed, 1 failed.
  The failure was `no-default-password`, on my own verify test: a sentinel handed to the pepper
  setting was written as an indexed array element, which its detector does not read as code.
  It is now a named variable. Re-run green.
- e2e, the new spec alone (`npm run test:e2e -- tests/e2e/deploy-verify.spec.ts`, which builds
  first): 4 passed, 1 failed. `staff-no-money` failed on `/stock-entry`. I split what the pass
  reports by rule, and it said `body unreadable`: a response the browser no longer held, which
  was a prefetch that the pass's next navigation cancelled. **Fixed in the pass:** such a body is
  asked for again, with the same GET, the headers the browser sent and the same session. It
  fails closed only if that fails too. Re-run: 5 of 5, "scanned 76 responses (7 asked for
  again)". Then I narrowed the static GET-only rule to Playwright's request API
  (`.request.<method>(`), since `request.method()` is a read. `verify-deployment` 42 of 42.
- Full `test:unit`: **81 files, 1152 of 1152.**
- Ran the mutations in the table below. For each one I made a byte copy first, with
  `SHA256SUMS` in `scratchpad/a2-mut/`, watched the test go red, restored the copy, and got
  `sha256sum -c` OK for all seven files.
- **The breach run (AC-15).** I made a byte copy of `src/app/stock-entry/new/page.tsx` and made
  the page render a euro amount under its heading. That page is reached only through a calendar
  link. I rebuilt, then ran the AC-15 test:
  `[verify] FAIL staff-no-money: money found in /stock-entry/new (euro-sign)`, and the test went
  red. Restored from the copy: `sha256sum -c` OK, and `git status` shows the file clean.
- **Targeted e2e, after a rebuild, with nothing else running:** `deploy-verify`,
  `analysis-figures`, `sign-in`, `stock-entry-autosave` and `stock-takes-count`. **155 passed in
  6.1 min: 0 failed, 0 skipped, 0 flaky.** In that run the signed-in pass opened 41 linked
  pages, 2 of them count pages, which another spec's fixture had put on the calendar. It scanned
  79 responses, 14 of them asked for again. `analysis-figures` and `stock-entry-autosave` are
  green, so hydration and #11's page still work under the headers.
- **`npm run build` with no database** (002 AC-5): `DATABASE_URL` and `DIRECT_URL` pointed at
  an unresolvable `.invalid` host. Exit 0, and `/api/version` is listed as dynamic.
- **The real command, against the local production build** (`next start` on port 3000, started
  by me and stopped by me): 7 of 11 checks passed. The four that failed are the four that need
  HTTPS or Vercel: `https-only`, `csrf-cookie-secure`, `protected-redirects` (http Location) and
  `region`. Exit 1, clean. `--url http://stock-management-zeta-one.vercel.app` was refused with
  exit 2 **before any request**, so nothing reached the live address.
- `typecheck` 0, `lint` 0, `test:unit` 1152 of 1152 on the final code.
- **Development census after:** identical to the baseline, line for line: 1 user, 0 counts, 1
  lock row, 1 auth event. The scratch counter was deleted. Port 3000 free.

### Files created

- `src/app/api/version/route.ts`: `GET` → `200`, `Cache-Control: no-store`, `{ "commit": … }`,
  where the value is `VERCEL_GIT_COMMIT_SHA` only when it is 40 lower-case hex, else `null`
  (AC-12). `force-dynamic`, takes no request, and reads nothing else.
- `src/app/api/version/route.test.ts`: AC-12.
- `src/lib/deploy/money-scan.ts`: `scanForMoney(body, contentType): Finding[]` (AC-16). It
  reuses `moneyKeysIn` from `src/lib/money-boundary.ts` for the JSON key rule. The three field
  names are assembled at run time.
- `src/lib/deploy/money-scan.test.ts`: AC-16, one case per form.
- `scripts/verify-deployment.ts`: the `npm run verify:deploy` entry. It launches a headed
  Chromium only for `--signed-in`, and sets `process.exitCode`.
- `scripts/verify/cli.ts`: `parseArguments` and `main(argv, dependencies)`. Exit 0 only if every
  check passed, 1 otherwise, and 2 for refused arguments.
- `scripts/verify/common.ts`: the one `fetch` (GET or HEAD, `redirect: "manual"`, 20 s, every
  body read to its end), `cookieFlags`, which keeps a cookie's name and flags and drops its
  value, `isLocalHost`, `runCheck` and `printResult`.
- `scripts/verify/anonymous-pass.ts`: the eleven checks of AC-13 plus `commit`, in the spec's
  order. Also `functionRegion(x-vercel-id)`.
- `scripts/verify/signed-in-pass.ts`: AC-15. `signedInPass({ origin, browser, print,
  supplySession? })`, `assertSessionSupplierAllowed`, `isCountPage`, and `SIGN_IN_PROMPT`.
- `tests/unit/security-headers.test.ts`: AC-11 (the configuration's `headers()`).
- `tests/unit/verify-deployment.test.ts`: AC-13, AC-14 and the browser-free parts of AC-15. It
  runs two stub HTTP servers, the site and its plain-http address.
- `tests/unit/migration-safety.test.ts`: AC-17. The detector lives in the test file, as the
  contract names only the test.
- `tests/unit/operations-runbook.test.ts`: AC-18.
- `tests/e2e/deploy-verify.spec.ts`: AC-11 and AC-12 (served), AC-13 observed on the local build,
  and AC-15 with a fixture `YARD_STAFF` session.

### Files modified

- `next.config.ts`: `poweredByHeader: false`, and `headers()` giving `/:path*` exactly the six
  AC-11 headers, exported as `SECURITY_HEADERS`. `reactStrictMode` is unchanged, and there is no
  script-source policy.
- `docs/operations.md`: `## Production`, `## Backup and restore` and `## Rollback`, appended
  after the existing sections, so *Environment*, which three tests parse, is untouched.
- `docs/conventions.md` → *Database*: the rule that after go-live a migration must leave the
  previous release working, with the `-- contract-step:` line.
- `progress/current.md`: plan and work log.

### Acceptance criteria

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-11 | `next.config.ts` → `poweredByHeader`, `SECURITY_HEADERS`, `headers()` | `tests/unit/security-headers.test.ts`: "AC-11: poweredByHeader is false", "AC-11: headers() gives the source /:path* exactly the six headers, and nothing else", "AC-11 (D12): there is no script-source policy…". `tests/e2e/deploy-verify.spec.ts`: "AC-11: /sign-in on the local production build carries all six security headers and no X-Powered-By", plus "AC-11: a JSON answer, a not-found page and a sign-in redirect carry them too" |
| AC-12 | `src/app/api/version/route.ts` | `route.test.ts`: set to a full commit; unset; malformed (8 shapes) with no echo; "no other setting reaches the answer…"; "the route reads one setting…"; "not under PROTECTED_PATHS, and the middleware does not match it". e2e: "AC-12: GET /api/version on the local build answers 200, no-store, and { commit: null }" |
| AC-13 | `scripts/verify/anonymous-pass.ts`, `cli.ts` → `parseArguments` | `verify-deployment.test.ts`: "AC-13: runs the eleven checks in order, prints PASS for each, and exits 0"; the commit check runs last with `--expect-commit` and not without it; one "against a stub made to fail it" test per check (https-only ×4, hsts ×2, security-headers ×11, csrf ×4, session-401 ×4, api-401, protected-redirects ×4, setup-404, public-no-money ×4, no-leftovers ×5, region ×3, commit ×2), each asserting **only** that check failed and the exit was 1; a failed request names its path; the `--url` rule and argument refusals. Observed on the local build: e2e "AC-13, observed on the local build…" |
| AC-14 | every module of the command (`scripts/verify-deployment.ts` and `scripts/verify/*`, plus the three `src/lib` modules they import) | `verify-deployment.test.ts`: a closure test pinning the eight files and the two external packages; no `loadEnvFile`, no `dotenv`, no `process.env`, no fs/child_process/module API, no `require(`; no path ending in `.env` except the URL path no-leftovers asks for; nothing from the server layer or the database client; one `fetch`, GET or HEAD, no body; Playwright's request API used for `get` only; no `unitPrice`; non-vacuity for each rule. Dynamic: "prints no cookie value, no Set-Cookie header and no body text, when every check fails as well as when every check passes", "sends only GET and HEAD, never with a body…", "a --url with a user name or password is refused, and not quoted", "accepts no other argument, and never quotes one it refuses", and "the real command, spawned with sentinel settings…" |
| AC-15 | `scripts/verify/signed-in-pass.ts`; `scripts/verify-deployment.ts` launches `chromium.launch({ headless: false })` | e2e "AC-15: the signed-in pass, with a fixture YARD_STAFF session on the local build: staff-role, staff-no-money and signed-out pass, and over http both cookie checks fail". Unit: the prompt's exact text; a supplied session refused for every origin but `localhost` and `127.0.0.1` (5 refused, 3 allowed), and refused before any context opens; the command line never names the supplier; `isCountPage`; never types into, reads or records a field (static). **Breach run** in the work log above. |
| AC-16 | `src/lib/deploy/money-scan.ts` | `money-scan.test.ts`: the euro sign; `&euro;` (3 cases); `&#8364;`; `&#x20ac;` (3 cases); `€` (3 cases); each field name; JSON keys at depth (4); key rule JSON-only and `+json`; a staff-shaped body reports nothing; no body in a finding; no field name in the source |
| AC-17 | `tests/unit/migration-safety.test.ts`; `docs/conventions.md` → *Database* | the main test over every directory after `20260925120000_pin_profiles` (none yet); the anchor; non-vacuity on pin_profiles (exactly its `DROP COLUMN` statement); 20 synthetic destructive examples; 16 safe ones; the `-- contract-step:` line rule; the conventions text |
| AC-18 | `docs/operations.md` → `## Production`, `## Backup and restore`, `## Rollback` | `operations-runbook.test.ts`: the three headings; the literals; `OD1`–`OD3`, `F1`–`F9` and `V1`–`V8`; the fact table with a *Confirmed on* cell per row; each decision with its risk; the export before a migration; the no-secret sentence; all eight operator forms and both passes; both layers, the schedule, the copy log, Drive with its SHA-256 check, the restore with the first `ADMIN`'s PIN and both drills; R1 to R3; placeholders only. The repository's own scans (`repo-hygiene`, `no-default-password`, 021 AC-8) pass over the new text in the full unit run |

### Mutations

Each mutation was made on a byte copy, run, and then restored from the copy, with `sha256sum -c`
OK. The copies and `SHA256SUMS` are in `scratchpad/a2-mut/`.

| # | Mutation | File | Result |
|---|---|---|---|
| M1 | A header removed: `X-Frame-Options` | `next.config.ts` | "headers() gives … exactly the six headers" red |
| M2 | `/api/version` leaks an environment value: a malformed variable is echoed instead of `null` | `route.ts` | "with the variable malformed … never echoes it" red |
| M2b | `/api/version` adds `VERCEL_REGION` | `route.ts` | 4 route tests red, on "no other key" and "no other setting" |
| M3 | The anonymous pass accepts a CSRF cookie without `Secure` | `anonymous-pass.ts` | "csrf-cookie-secure: fails for a cookie without Secure…" red |
| M4 | The scanner misses the euro sign itself | `money-scan.ts` | 4 red: two money-scan tests, `public-no-money`, and the all-fail leak test |
| M4-breach | A staff page renders a price (the AC-15 breach run) | `src/app/stock-entry/new/page.tsx` | e2e AC-15 red: `FAIL staff-no-money: money found in /stock-entry/new (euro-sign)` |
| M5a | The detector's column-drop rule inverted | `migration-safety.test.ts` | 4 non-vacuity tests red |
| M5b | Any comment line counts as a contract step | `migration-safety.test.ts` | 2 red, including "only a line beginning with it counts" |
| M5c | A destructive migration with no `-- contract-step:` line: a temporary directory `prisma/migrations/20990101000000_a2_probe` holding a `DROP COLUMN` | new directory | The main AC-17 test went red, naming the migration and the statement. With the line added it went green. The directory was then deleted, and `prisma/migrations` lists the three real ones only. |
| M6a | The live check reads `.env`: a `loadEnvFile` call in `cli.ts` | `cli.ts` | 2 static tests red |
| M6b | The live check prints a cookie value: the CSRF check's reason carries the cookie header | `anonymous-pass.ts` | 2 red: the CSRF test and the leak test |
| M6c | A failing check quotes the body it read (`setup-404`) | `anonymous-pass.ts` | the leak test red |

### Verification output

As the brief says, I did not run `init`, the full `test:db` or the full `test:e2e`. What I ran:

```
$ npm run typecheck        -> exit 0
$ npm run lint             -> exit 0
$ npm run test:unit
 Test Files  81 passed (81)
      Tests  1152 passed (1152)
   Duration  43.26s
$ DATABASE_URL=<unresolvable .invalid host> DIRECT_URL=<same> npm run build
 ✓ Compiled successfully in 7.6s
├ ƒ /api/version                           142 B         103 kB
ƒ Middleware                             87.3 kB
build exit=0
$ npm run test:e2e -- tests/e2e/deploy-verify.spec.ts tests/e2e/analysis-figures.spec.ts \
    tests/e2e/sign-in.spec.ts tests/e2e/stock-entry-autosave.spec.ts tests/e2e/stock-takes-count.spec.ts
Running 155 tests using 3 workers
[verify] Sign in as a YARD_STAFF profile in the window that opened
[verify] PASS staff-role
[verify] FAIL device-cookie-secure: macroads-device: lacks Secure
[verify] FAIL session-cookie-secure: __Secure-authjs.session-token: the browser holds no such cookie
[verify] staff-no-money: scanned 79 responses (14 asked for again); opened 41 linked pages, 2 of them count pages
[verify] PASS staff-no-money
[verify] PASS signed-out
  155 passed (6.1m)
$ npx tsx scripts/verify-deployment.ts --url http://localhost:3000     (local next start)
[verify] FAIL https-only: http://<host>/ does not answer 301 or 308
[verify] PASS hsts
[verify] PASS security-headers
[verify] FAIL csrf-cookie-secure: /api/auth/csrf: sets no cookie named __Host-authjs.csrf-token
[verify] PASS session-401
[verify] PASS api-401
[verify] FAIL protected-redirects: /stock-entry, /stock-takes, /analysis, /item-master, /profiles: does not redirect to https://<host>/sign-in?callbackUrl=<the path, encoded>
[verify] PASS setup-404
[verify] PASS public-no-money
[verify] PASS no-leftovers
[verify] FAIL region: /api/session: x-vercel-id does not name lhr1 as the region that ran the function
[verify] 7 of 11 checks passed
exit=1
$ npm run db:census   (development, read-only; before and after, identical)
[db:census] locations: 2
[db:census] suppliers: 10
[db:census] item types: 19
[db:census] items: 140, 15 need review
[db:census] prices: 129
[db:census] yard links: 152
[db:census] profiles: ADMIN ACTIVE 1
[db:census] stock counts: none
[db:census] count lines: 0
[db:census] migrations: 3 applied, latest 20260925120000_pin_profiles
[db:census] pins: 1 of 1 made under the given PIN_PEPPER
(scratch, read-only) users 1, counts 0, lock rows 1, auth events 1
```

### Findings, for the coordinator

- **A2-F1: the `region` check's reading of `x-vercel-id` comes from memory, not from a page
  opened in this session.** I had no web access. The check takes the region codes in the header
  (the `::`-separated parts shaped like `lhr1`) and treats the **last** one as the region that
  ran the function. It requires at least two, the edge's and the function's; one alone fails.
  If Vercel's format differs, `region` fails closed at AC-24, not open. **Before AC-24, confirm
  against Vercel's documentation of the `x-vercel-id` header** that the function region is the
  last region code before the request id. `functionRegion` and its unit test are the one place
  to change.
- **A2-F2: AC-14's "no path ending in `.env`" and AC-13's `no-leftovers` pull against each
  other.** `no-leftovers` must request the URL path `/.env` from the server, which is itself a
  path ending in `.env`. I read AC-14 as being about the file system. The static test allows
  exactly one such literal: the URL path, in the `LEFTOVERS` list of
  `scripts/verify/anonymous-pass.ts`, and asserts that it sits there. It also asserts that no
  module of the command imports a file-system, process or module-loading API or reads
  `process.env` at all, so nothing in the command can open a file. The spec may want to say so.
- **A2-F3 (observation): AC-1's "no `test:*` script invokes `verify:deploy`".** AC-15 requires a
  test that runs the signed-in pass against the local build, so `tests/e2e/deploy-verify.spec.ts`
  imports the pass's modules and runs them against `localhost` under `test:e2e`. AC-1's test
  checks the npm scripts and the runner files they name, and stays green. Nothing in the gate
  runs the command itself or touches a non-local origin, and the supplier that stands in for a
  person is refused anywhere but `localhost` and `127.0.0.1`.

### Deviations from the spec

- **Additions, beyond the contract:** `scripts/verify/{cli,common,anonymous-pass,signed-in-pass}.ts`.
  The contract names only `scripts/verify-deployment.ts`. AC-14 covers "every module it imports",
  and the closure test pins all eight files.
- **`--expect-commit` together with `--signed-in` is refused** (exit 2, with a message naming the
  anonymous pass). The spec's synopsis shows both flags as optional, and does not say what the
  combination does.
- **Exit codes:** 0 when every check passed, 1 when any check failed, and 2 for refused
  arguments. The spec says only "non-zero".
- **What a failure line names.** A failure names the path and the rule, as AC-14 says. For the
  two money checks it adds the rule's kind in brackets (`euro-sign`, `field-name`, `json-key`,
  `unreadable-json`, `body unreadable`). That is the scanner's category, never text from the
  body. AC-15 says "names the path only"; the kind is what made the dropped-prefetch problem
  diagnosable.
- **The scanner has a fourth finding, `unreadable-json`:** a body whose content type says JSON
  but which does not parse. Without it, such a body could not be shown to be free of money keys.
- **The signed-in pass asks again for a body the browser dropped** (see the work log), and fails
  closed if it still cannot read it. Every run so far has needed this, 6 to 14 times.
- **`staff-no-money` also fails** when a start page answers with the sign-in page (the session
  was lost) or when nothing was scanned, so an empty scan cannot pass.
- **AC-17's "adds a `NOT NULL` column with no `DEFAULT` in the same statement" is judged per
  action.** One `ALTER TABLE` holding two `ADD COLUMN`s, one with a `DEFAULT` and one without,
  is flagged; a per-statement reading would pass it. Destructive statements inside a `DO $$`
  block are flagged too.
- **The runbook's F and V table** marks facts still to confirm with *when* they must be
  confirmed (for example "before go-live"). AC-21 and AC-22 fill in the dates in Phase B.

### Notes for the reviewer

- **No secret, PIN or code anywhere.** Every cookie value, body text, commit and setting in the
  tests is made at run time (random hex). The e2e staff profile's PIN comes from `generatePin`.
  It is typed by the test standing in for the person, through the support helper's own
  `signIn`, never by the pass, and the test asserts it is absent from the pass's output. The
  runbook has placeholders only, and its test checks the new sections for connection strings,
  assigned settings and quoted PIN-shaped numbers.
- **The money boundary is unchanged.** No application file changed except `next.config.ts` and
  the new public route. The staff pages were only read. The breach page was restored byte for
  byte.
- **The e2e AC-15 test sets its own timeout to 240 s.** The pass opens both start pages, up to
  50 linked pages and four more, and waits for each to settle. That took 47.5 s in the targeted
  run, and the suite's 45 s is for one page flow. No other timeout was raised.
- **Why the headers cannot break hydration:** there is no script-source policy (D12).
  `frame-ancestors`, `X-Frame-Options`, `nosniff`, the referrer policy and the permissions
  policy do not affect a same-origin page's scripts. The HSTS header is ignored by browsers over
  plain http, so local development is unaffected. `analysis-figures` and `stock-entry-autosave`
  were green in the targeted run.
- **The e2e also shows the headers on a JSON answer, a 404 page and the middleware's 307**, so
  "every response" is observed beyond the `/sign-in` the AC names.
- **`--url` also refuses** a URL holding a user name or password, a path, a query or a fragment,
  and it never quotes a refused argument.
- **Port 3000** is free. I started one `next start` for the real-command run, identified it by
  its command line, and stopped it.
- **Cost.** The token cost of this task cannot be measured from inside the agent; read it from
  the transcript.
