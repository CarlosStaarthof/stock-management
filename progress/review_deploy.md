# Review: #16 deploy, Phase A

**Verdict:** CHANGES_REQUESTED
**Spec:** specs/features/016-deploy.md (approved 2026-09-28, with *Findings from Phase A1* and *Phase A2*, ruled). Phase A is AC-1 to AC-18. Phase B (AC-19 to AC-31) is out of scope.
**Reviewed:** `git diff 2ba37ac..HEAD`: `1c8e691` spec(#16), `c203069` feat(#16) A1, `a943770` spec(#16), `74ab531` feat(#16) A2
**init:** green (the coordinator's gate on this tree, `scratchpad/gate16a2.txt`; I did not re-run it, as the brief says)

The work is careful. The build pipeline, the seed guard, the launcher, the export and the live check all behave as the brief requires. I checked each of them in the code, in the tests, and with runtime probes (below). I am not approving yet, for two reasons:

- Two criterion clauses have no test. Both describe **fail-closed** behaviour: AC-10's "exits 0 **only** when every table is identical", and AC-15's "`staff-role` … otherwise it reports FAIL, signs out and stops".
- CHECKPOINTS C2.4 is unchecked: three new service functions have no failure test.

There is also one text defect in the launcher's prompt. Every fix is a test or a message. None changes behaviour.

## What I ran

| Run | Result |
|---|---|
| Read the gate, `scratchpad/gate16a2.txt` (UTF-16, converted to a UTF-8 copy in the scratchpad) | unit `81 passed`, `1152 passed` (lines 178-179); e2e `116 passed (3.5m)` (1038) and `139 passed (5.9m)` (1211); `[ok] database reachable` (1217); db `32 passed`, `566 passed` (2176-2177); `[OK] Environment ready` (2183), **not** "database checks skipped". A grep for `flaky`, `Retry`, ` failed (`, `P1001`, `P1017` and `Can't reach` finds nothing. The AC-15 e2e passed in 50.0 s (line 287) and printed `scanned 79 responses (11 asked for again); opened 41 linked pages, 2 of them count pages`. |
| `npm run test:unit`, on this tree | **81 files, 1152/1152**, 42.6 s |
| `git status`, `git diff --name-status --diff-filter=MDR 2ba37ac..HEAD` | Tree clean. Modified: `docs/conventions.md`, `docs/operations.md`, `feature_list.json`, `next.config.ts`, `package.json`, `progress/current.md`, the spec. **No existing test file was modified.** Everything else is new. |
| A pattern scan of every added line: connection strings with user-info, `neon.tech`, `ep-…` endpoints, `npg_…`, 40+ character base64, quoted 4- or 6-digit numbers | No match |
| `feature_list.json` #16 `acceptance[]` against the spec's 31 criteria, whitespace-normalised | 31 = 31, text identical, status `in_progress` |
| `cmp` of `scratchpad/a2-mut/*` against the committed files | All seven mutated files, and the breach page, are byte-identical to HEAD, and `src/app/stock-entry/**` is absent from the diff |
| A probe: resolve each build CLI through `bin`, as `scripts/vercel-build.ts:24-29` does | `next ./dist/bin/next true`, `prisma build/index.js true`, `tsx ./dist/cli.mjs true` |
| A probe, `scratchpad/probe16.ts` / `probe16b.ts`: `signedInPass` driven by a stand-in browser (no network), `functionRegion`, `productionSettingsProblems` / `planVercelBuild` on Neon-shaped strings built at run time, and `restoreSchema` | `empty scan: staff-no-money passed=false reason=no response was scanned`; `lands on sign-in: … reason=/stock-entry: answered with the sign-in page`; `clean: … passed=true`; `euro on page: … money found in /stock-entry (euro-sign)`; `role ADMIN: results [["staff-role",false]]` and the sign-out control was clicked. `functionRegion("dub1::lhr1::<id>") = lhr1`; `("dub1::<id>") = null`; `("lhr1") = null`. A Neon-shaped production set (`sslmode`, `channel_binding`, `connect_timeout=15`) gives `[]` and the full plan. A trailing-slash `AUTH_URL` gives 1 problem, and swapped strings give 2. `restoreSchema` with `DIRECT_URL` naming **another database** on the same host returns `public` (Observation 2). |

I did not read `.env`, contact the live site or contact any database. I wrote only this file and scratchpad files.

## Acceptance criteria (Phase A)

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `vercel.json` has `regions ["lhr1"]`, `buildCommand "npm run build:vercel"` and `git.deploymentEnabled {"**": false, "production": true}`, with no `env` and no `build.env`. The address is cited at `impl_deploy.md:215`, and ruling A1-F3 confirms the any-true rule. Tests: `tests/unit/deploy-config.test.ts:52`, `:57` (main, dev and three other branches do not deploy), `:67` (non-vacuity), `:73`, `:80`, `:95` (`build` is `next build`), `:104`, `:109`. |
| AC-2 | PASS | `build-plan.ts:31-33`: anything but exactly `production` gets `["next-build"]`. Tests: `tests/unit/vercel-build.test.ts:123`, `:133`, `:137`, `:141` (`Production`, `staging`, `""`, `" production"`), `:147`, `:151` (`prisma migrate deploy`). `migrate deploy` uses `DIRECT_URL` because `schema.prisma` has `directUrl = env("DIRECT_URL")`, which `tests/unit/schema-and-migration.test.ts:337` pins. `vercel-build.ts:33-36` passes the environment through unchanged. |
| AC-3 | PASS | `build-plan.ts:60-68`, checked at `:213-218` before any step. `vercel-build.test.ts:160-175`: one case per setting under preview, development, staging and unset, `ran` is `[]`, and one line names only that setting. Also `:177`, `:191` (`VERCEL` unset), `:201`. Every run is checked for every sentinel (`:106`). |
| AC-4 | PASS | `build-plan.ts:113-174`. `vercel-build.test.ts:210` (a complete set passes and prints the names), `:224` (the five, unset or empty; nothing ran), `:239`, `:247`, `:256`, `:265`, `:273`, `:280` (seven malformed `AUTH_URL`s), `:298`, `:306` (31 is refused, 32 passes), `:315` (`SETUP_CODE` of 15 trimmed, 16, unset), `:327` (every problem listed). The sentinels include host labels (`:66-84`). |
| AC-5 | PASS | `build-plan.ts:220-244`: the first non-zero code is returned at `:239-242`, and a thrown step counts as 1 (`:236-238`). `vercel-build.test.ts:346` (order, and `ok` after each), `:367-376` (a failed next-build, migrate-deploy, seed or census runs no later step), `:378`, `:385`, `:396`, and `:413-432`, five real `npm run build:vercel -- --dry-run` runs. |
| AC-6 | PASS | `item-master-seed.ts:46-62`. `item-master-seed.db.test.ts:61` (SEEDED, 10/19/140/129/152), `:70` (script: SEEDED then SKIPPED, both exit 0), `:87` (renamed item: SKIPPED, the five tables deep-equal with ids), `:97` (non-vacuity: `importWorkbook` creates 1), `:107` (three partial shapes: `ConflictError` names each table and count, nothing written), `:142` (script exits non-zero). The two-transaction gap: Observation 1. |
| AC-7 | PASS | `census.ts:72-159`. `census.db.test.ts:87` checks the exact eleven lines, including `pins: 1 of 2`, with the usernames, names, both key ids, both hashes, the price, the host and `DATABASE_URL` absent (`:66-79`, at least 9 sentinels). Also `:111`, and `:121` (no pepper). |
| AC-8 | PASS | `operator-production.mjs:72-111` holds the eight forms. `tests/unit/operator-production.test.ts:180` covers each form and its prompts, and `:189` shows the answers reach the command's env only, never its arguments. `:215` refuses 20 malformed forms before reading any input (`readableLength > 0`). Also: `:255` (CRLF), `:267` (terminal: raw mode on then off, nothing echoed), `:286` (backspace, Ctrl+C), `:300` (empty answers), `:319` (short input), `:328` (equal to `.env`, per name, trimmed), `:349` (never filled from `.env`), `:372` (no file-writing API), `:381` (real process). The DB half: `operator-production.db.test.ts:33` passes the test DB's strings at the prompt while `.env` names dev, and the census reports the run-time supplier count; the host is not printed and the tree is unchanged. The non-TTY prompt text: Required change 4. |
| AC-9 | PASS | `export.ts:66` (`REPEATABLE READ, READ ONLY`, verified at `:68-75`), `:148` (credentials are `NULL`), `:121-127` and `:163` (PENDING counted and filtered in the same transaction). `db-export.ts:69` refuses before `exportDatabase` at `:72`, and `:75` writes with `wx`. Tests `export.db.test.ts`: `:61` (the table set equals the 12 models; each count equals its table's; the tree is unchanged), `:92` (`21.6128`, `6.11764706`), `:104` (no credential; `omitted`), `:126` (A1-F1), `:146` (exact output lines), `:165` (none of the five settings in the file or the output), `:178` (snapshot settings), `:196`, `:210`, `:222` (refusals, against an unreachable host). One extra printed line: Observation 3. |
| AC-10 | **FAIL (one clause)** | Proven: the refusals (`restore.db.test.ts:179` a table present, `:191` a migrated schema with no row written, `:206` format, `:220` migrations, `:234` count, `:249` no pending count, `:263` two schemas); the round trip, where the second export differs in exactly `exportedAt` and `omittedPendingRequests` (`:125`); the census with `pins: 0 of 0` (`:154`); a constraint break leaves no restored row (`:278`); a differing `Location` rolls back (`:292`). **Not proven:** "compares it row for row … and exits 0 **only** when every table is identical". No test makes a restored table differ from the file and watches `compareWithFile` (`restore.ts:244-273`), `isIdentical` (`:276-278`) or `db-restore.ts:110` report it. If `isIdentical` returned `true` unconditionally, every test would stay green, and so would the AC-28 drill's "every table identical". Required change 1. |
| AC-11 | PASS | `next.config.ts`: `SECURITY_HEADERS`, `poweredByHeader: false`, `headers()` on `/:path*`. `tests/unit/security-headers.test.ts:23`, `:27` (exactly six, with the values written out), `:35` (no script-source policy). e2e `tests/e2e/deploy-verify.spec.ts:38` (`/sign-in`, no `X-Powered-By`) and `:51` (JSON, 404, 307). They break nothing: the full e2e (116 + 139) and db (566) passed under them. |
| AC-12 | PASS | `src/app/api/version/route.ts:17-22` reads only `VERCEL_GIT_COMMIT_SHA`, `force-dynamic`, and takes no request. `route.test.ts:36` (set), `:47` (unset), `:57` (8 malformed, never echoed), `:79` (no other key or setting), `:93` (reads one setting, no server, cookie or header), `:104` (not in `PROTECTED_PATHS`; the middleware doesn't name it). e2e `deploy-verify.spec.ts:68` (`{ commit: null }`, `no-store`). |
| AC-13 | PASS | `scripts/verify/anonymous-pass.ts:205-217` runs the checks in the spec's order, with `commit` last (`:225-226`). `verify-deployment.test.ts:246` (all pass, exit 0), `:270`, `:278`, then one fail case per check at `:287-485`, each asserting that only that check failed. `region` follows ruling A2-F1 (`:459`, `:470`; my probe agrees). The `--url` rule: `cli.ts:64-66`, tests `:504`, `:518` (no request made), `:531`. Observed on the local build: e2e `:78`. |
| AC-14 | PASS | Static, over the import closure pinned to eight files and two packages (`verify-deployment.test.ts:665`): no `loadEnvFile`, `dotenv`, `process.env`, fs, child_process or module API, and no `require(` (`:680`). The only `.env` literal is the URL path in `LEFTOVERS` (`:688`, ruling A2-F2). Nothing from `@/server/` or Prisma (`:698`). One `fetch`, GET or HEAD, no body; Playwright's request API is `get` only (`:704`). No `unitPrice` (`:722`); non-vacuity at `:732`. Dynamic: no cookie value, `Set-Cookie` or body text, whether every check passes or fails (`:583`); GET/HEAD only, no body (`:599`); credentials in `--url` refused and not quoted (`:558`, `:567`); the real command with sentinel settings (`:615`). |
| AC-15 | **FAIL (one clause)** | Proven: the fresh context (`signed-in-pass.ts:319`); the prompt text (`verify-deployment.test.ts:749`); the five-minute wait (`:25`); never touching a field (static, `:726`); the supplier refused off localhost and before any context opens (`:753`, `:768`); the CLI cannot supply one (`:792`); a visible browser (`:797`); the e2e with a fixture session, where `staff-role`, `staff-no-money` and `signed-out` pass and both cookie checks fail over http (`deploy-verify.spec.ts:104`, gate line 287); the breach run (`impl_deploy.md:440-444`, `:528`). **Not proven:** "`staff-role` … Otherwise it reports `FAIL`, signs out and stops" (`signed-in-pass.ts:336-345`). No test gives the pass a non-`YARD_STAFF` session. My probe shows the code does it (`[["staff-role",false]]`, sign-out clicked), but that probe is not in the repository. Required change 3. |
| AC-16 | PASS | `src/lib/deploy/money-scan.ts`. `money-scan.test.ts:35` (€), `:39`, `:45`, `:49`, `:55` (escaped forms, any case), `:61` (three field names), `:71` (JSON keys at depth), `:83` (JSON only, `+json`), `:91`, `:95` (staff-shaped body: nothing), `:101` (no body quoted), `:109` (no field-name literal). |
| AC-17 | PASS | `tests/unit/migration-safety.test.ts:163` (every migration after the anchor; none yet), `:176`, `:182` (pin_profiles: exactly its one `DROP COLUMN` statement), `:193` (20 synthetic destructive shapes, including one inside `DO $$`), `:222` (16 safe ones), `:246` (only a line beginning `-- contract-step:` counts), `:256` (the conventions text). `docs/conventions.md` → *Database* has the rule. M5a to M5c were run (`impl_deploy.md:529-531`). |
| AC-18 | PASS | `docs/operations.md` → `## Production`, `## Backup and restore`, `## Rollback`, all placeholders. `tests/unit/operations-runbook.test.ts:26`, `:32` (literals), `:48` (OD, F, V), `:59` (four cells per fact), `:71` (risks, export before a migration, the no-secret sentence), `:81` (eight forms, both passes), `:98` (both layers, schedule, log, Drive with SHA-256, restore with the first ADMIN's PIN, drills), `:119` (R1 to R3), `:126` (no connection string, no assigned secret, no quoted PIN-shaped number). `repo-hygiene` and 021 AC-8 pass over it in the unit run. |

## The brief's points of focus

1. **`vercel-build` / `build-plan`.**
   - A preview can never migrate or seed: `build-plan.ts:32`, AC-2 tests.
   - A wrong or missing production setting refuses before any spawned step: `check-settings` is the plan's first step and returns before `runStep` (`:221-227`); AC-4 asserts `ran` is `[]`.
   - `migrate deploy` uses `DIRECT_URL`: see AC-2.
   - The first failure stops the build: `:239-242`, AC-5.
   - The unit gate's own dry run under `production` cannot migrate even if `--dry-run` broke, because it deletes the four database settings (`vercel-build.test.ts:417`), so `check-settings` would refuse.
2. **`seed-if-empty` never writes into a non-empty item master.** All-five-non-zero returns before any write (`item-master-seed.ts:49-51`), and a partial master throws (`:53-59`). Both are tested. The gap between `:46` and `:61` is Observation 1: I found no path to it in the procedure.
3. **`operator:production`.**
   - On a TTY, answers are read in raw mode, and nothing is written back but a line break (`:181-234`).
   - An answer is never taken from `.env`: the prompted names are deleted from the inherited env before the answers are set (`:296-298`).
   - An answer equal to `.env`'s value is refused (`:282-289`).
   - No answer is on the command line, so none reaches shell history.
   - The launcher writes no file.
   - The one weakness is a non-TTY terminal: Required change 4.
4. **`db:export` / `db:restore`.**
   - The export reads one read-only, repeatable-read snapshot, writes no `pinHash`/`pinKeyId` and no `PENDING` row, and prints counts and a SHA-256.
   - The restore refuses a schema holding any relation (`restore.ts:85-93`, `db-restore.ts:91-97`) before `migrate()` (`:99`), so it cannot write into production. Mutation M5 proved the refusal is load-bearing.
   - It reads back every table, but the read-back is never shown to detect a difference: Required change 1.
   - The restore checks emptiness through `DATABASE_URL` while migrating through `DIRECT_URL`: Observation 2.
5. **`verify:deploy`.**
   - It holds no secret, reads no `.env` and prints no cookie value (AC-14).
   - The signed-in pass never receives or types a PIN: the CLI passes no supplier (`cli.ts:108`), and a supplier is refused off localhost (`signed-in-pass.ts:310`).
   - An empty scan fails (`:292`), and so does a start page that lands on sign-in (`:291`). My probe confirms both, but **no test does**: Required change 3.
   - `region` reads `x-vercel-id` as ruled.
6. **Headers and `/api/version`.** AC-11 and AC-12 pass, and the full e2e is green under the headers.
7. **AC-17 and AC-18.** Both pass. The runbook has placeholders only, confirmed by my scan and by `operations-runbook.test.ts:126`.
8. **Standing rules.**
   - No secret, PIN or code: my scan is clean, and 021 AC-8 is green.
   - The money boundary is unchanged: no staff page or service is in the diff.
   - No existing test was modified.
   - The one raised timeout is the new AC-15 e2e's own: Observation 5.
   - `vercel.json`: see AC-1.

## Checkpoints

### C1 — Process
- [x] Exactly one feature changed: every commit is `(#16)`, and the diff is #16's files only.
- [x] The spec exists, `specs/features/016-deploy.md`.
- [ ] Every numbered acceptance criterion is satisfied. Phase A: AC-10 and AC-15 each have one clause without a test (see the table). Phase B is out of scope.
- [x] `feature_list.json` `acceptance[]` matches the spec: 31 entries, text identical.
- [x] `progress/impl_deploy.md` exists and lists every file in the diff (A1 `:79-125`, the A1-F1 step `:340-348`, A2 `:462-501`).

### C2 — Verification
- [x] `init` finished with `[OK] Environment ready`, database checks executed (gate lines 1217, 2181, 2183), on the coordinator's run.
- [x] `npm run typecheck` passes (gate line 17).
- [x] `npm run lint` passes (gate line 19).
- [ ] Every new service function has a success test and a failure test. Four have no failure test:
  - `compareWithFile` and `isIdentical`: no case where a table differs;
  - `exportDatabase`: none of its own refusals at `export.ts:73-75`, `:98-101`, `:103-110`, `:115-119` and `:141-143` is tested (the tested refusals are in the script, before it is called);
  - `foreignKeyOrder`: the cycle refusal (`restore.ts:153-155`) is untested.

  Required change 2.
- [x] Tests assert real values: the exact census lines, `21.6128` and `6.11764706`, exact output lines, exact counts.
- [x] Real test database, throwaway schemas and real temporary files; nothing is mocked but the browser-free stubs AC-13 asks for.

### C3 — Architecture
- [x] No component or route handler imports `PrismaClient`: `route.ts` imports `next/server` only.
- [x] Data access is in `src/server/deploy/` and `src/server/items/item-master-seed.ts`; the scripts call them.
- [x] No Excel builder is touched.
- [x] No circular imports: `restore.ts` → `export.ts` → `target-schema.ts`, with no edge back. `build-plan.ts` and `census.ts` reach only `auth/credential-rules` and `auth/password`.
- [x] No schema change, so no migration was needed. `prisma/` is not in the diff.

### C4 — Domain integrity
- [x] No value column; no schema change.
- [x] No price is sent to `YARD_STAFF`: no staff surface is in the diff, and the e2e staff scan is green with 79 responses and 2 count pages.
- [x] The Decimal types are unchanged, and the export keeps every digit (AC-9 `:92`).
- [x] Signature and reopen rules are untouched.
- [x] Nothing rewrites `unitPriceSnapshot`. A restore inserts a copy into an empty database only.
- [x] Approved counts are untouched.
- [x] `21.6128` survives the export and the restore.
- [x] `Samples/` is unmodified (gate line 10; not in the diff). It is read by the seed only.

### C5 — Conventions
- [x] Naming: kebab-case modules, and tests mirror their subjects.
- [x] Services throw `ConflictError` and `ValidationError`. The `Error` subclasses in `scripts/verify/common.ts` and `signed-in-pass.ts` are in scripts that AC-14 bars from importing `@/server/`.
- [x] No `console.log` in any new `src/` file (grep).
- [x] No TODO in the new files.
- [x] No secret, connection string or credential, by my scan and the repository's own scans. `.env` is gitignored and not in the diff.

### C6 — Session hygiene
- [x] `progress/current.md` has the A1 and A2 plans and work logs, written while the work was done.
- [x] No scratch file is in the repository: `git status` is clean, and `test-results/` and `*.tsbuildinfo` are ignored.
- [x] `feature_list.json` says `in_progress`, which is correct while Phase B is not done.

### C7 — Advisory
- n/a: there are no new screens.

## Required changes

1. **AC-10 / C2.4, the read-back must be shown to detect a difference.** In `src/server/deploy/restore.db.test.ts`:
   - Restore AC-9's fixture into a throwaway schema, as `:125` does.
   - Then, in the target, directly:
     - update one non-key column of one row (e.g. an `AuthEvent.bucket`);
     - delete one row of a second table (e.g. the `AccountLock` row);
     - insert one extra row into a third (e.g. a `Supplier`).
   - Call `compareWithFile(schema, text)`. Assert that those three tables, and only those, have `isIdentical(...) === false`, with the expected `restored` and `identical` numbers, and that the other nine stay identical.
   - Run and record a mutation in `impl_deploy.md`: `isIdentical` forced to `true` turns the new test red.
2. **C2.4, failure tests for the other untested service functions.**
   - `exportDatabase` rejects with `ConflictError` for a throwaway schema with no `_prisma_migrations` (`export.ts:98-101`) and, if cheap, for a table with no primary key (`:141-143`). `scripts/db-export.ts` pointed at that schema through `?schema=` exits non-zero and writes no file.
   - `foreignKeyOrder` (`restore.ts:144-161`, exported and pure) orders parents first, and throws `ConflictError` for a two-table cycle. This is a unit test; no database is needed.
3. **AC-15 and the brief's point 5, the fail-closed branches of the signed-in pass need tests.** In `tests/unit/verify-deployment.test.ts`, with a stand-in browser, context and page (as in my `scratchpad/probe16.ts`), or by exporting the verdict as a pure function, prove that:
   - `staff-no-money` FAILs when no response was scanned (`signed-in-pass.ts:292`);
   - `staff-no-money` FAILs when a start page lands on `/sign-in` (`:291`);
   - `staff-no-money` FAILs when a body cannot be read even when asked for again (`:202-205`);
   - with a session whose role is not `YARD_STAFF`, `staff-role` FAILs, the sign-out control is clicked, and no later check runs (`:336-345`).

   Run and record a mutation: delete `:292`, and the empty-scan test goes red.
4. **The brief's point 3, the launcher must not promise a hidden prompt it cannot give.**
   - The problem: `scripts/operator-production.mjs:264` prints "Nothing you type is shown, stored or printed." whether or not `terminal` (`:261`) is true. When a person types into a terminal that Node does not see as a TTY, the terminal itself echoes every character of a production connection string or the pepper. Git Bash's mintty without winpty is such a terminal. AC-8's "On a terminal, the typed characters are not shown" then fails in practice.
   - The fix: when `terminal` is false, print a different line. It should say that input is not a terminal, that answers are read one per line and may be visible, and that the person should stop with Ctrl+C and use PowerShell or Windows Terminal.
   - Unit-test the line in both modes (`operator-production.test.ts` already has both harnesses).
   - Add one sentence to `docs/operations.md` → *Operator commands* naming the terminal to use.
   - Keep what the launcher reads unchanged. Non-TTY line input is what the spec and the DB test need.

## Observations (non-blocking)

1. **The seed's two-transaction gap** (`item-master-seed.ts:46` counts, `:61` imports in `importWorkbook`'s own transaction). I found no writer that could fill the master in between during go-live:
   - Step 3 leaves the old deployment with no database setting.
   - No `ADMIN` exists before the first build.
   - Hobby builds one at a time.
   - A second concurrent import would collide on `Supplier.name`, `ItemType.code` and `Item(description, supplierId)` (`schema.prisma:163`, `:173`, `:207`) and roll back, rather than duplicate.

   I accept it. A comment at `:61` saying why would help the next reader.
2. **The restore checks one database and migrates through the other.**
   - Emptiness is checked through `DATABASE_URL` (`db-restore.ts:91`, via `db`), while `prisma migrate deploy` writes through `DIRECT_URL` (`:64-68`).
   - `restoreSchema` compares only the `schema` parameter (`target-schema.ts:39-50`). My probe: `DIRECT_URL` naming another database on the same host is accepted.
   - I traced the likely slip, editing only one string when restoring into a new database in the `production` branch. Production is not written: the file's migrations must equal the repository's, `migrate deploy` on an up-to-date database applies nothing, and `restoreRows` then finds no tables and refuses (`restore.ts:190-198`).
   - Hardening, for later: before connecting, require both strings to name the same host once `-pooler` is removed, and the same database. The build's host rule (`build-plan.ts:137-151`) already exists to reuse.
3. **`db:export` prints one line AC-9 does not list:** `[db:export] omittedPendingRequests: <n>` (`db-export.ts:83`). AC-9 says the output is the path, the SHA-256 and the table lines, "and nothing else". The line is a count, and it helps reconcile AC-28's census, which counts `PENDING` rows. **For the coordinator:** ratify it in AC-9's print rule, or have it removed.
4. **Prisma's own output names the datasource host.** It appears in the Vercel build log (the `migrate-deploy` step inherits stdio, `vercel-build.ts:34`) and in `operator:production -- migrate:status` and `migrate:resolve`. The host is not a secret, and the owner relays only the prefixed lines. But `db-restore.ts:60-63` hides the same output for this very reason. For R3, the runbook could ask the owner to relay the migration status lines, not the `Datasource … at "<host>"` line.
5. **The AC-15 e2e's own timeout is 240 s** (`deploy-verify.spec.ts:111`). It is the only raised timeout and applies to that one test. It is justified: the pass opens up to 56 pages (the two start pages, up to 50 links, four more) and waits for each to settle, and it took 47.5 s and 50.0 s in the two recorded runs. I accept it. The suite's 45 s is unchanged.
6. **A2-F3.** The unit and db gates run `build:vercel -- --dry-run`, `db-export.ts`, `db-restore.ts` and the launcher, against the test database only. That is what AC-5, AC-8, AC-9 and AC-10 require, and AC-1's test reads "invokes" as the npm scripts and their runner files. That reading is consistent.
7. **`public-no-money` accepts a `200` with an empty body.** A public page that rendered nothing would pass the scan. This is minor, since the other checks would notice a broken site.
8. **Claims checked against the diff.**
   - The file lists, the `1152` unit count, the eight forms and each refusal all match.
   - The mutation copies in `scratchpad/a2-mut/` equal HEAD.
   - The "Deviations" sections of `impl_deploy.md` are accurate, except that Observation 3's extra line appears in the A1-F1 work log (`:297-298`) and not among the deviations.

## Second pass, 2026-09-28

**Verdict:** APPROVED. **Phase A (AC-1 to AC-18) is APPROVED for go-live.**
**Scope:** the repairs only, `git diff 74ab531..HEAD`:
- `cd85783` spec(#16), the rulings;
- `a5adc65` fix(harness);
- `f3518a0` fix(#16).

**init:** green (`scratchpad/gate16rep4.txt`, the coordinator's run; I did not run it)

Every required change is done and proved by a test. A mutation turns each proof red. The two clauses that failed the first pass (AC-10's read-back, AC-15's `staff-role` stop) are now proven, and C2.4 is closed.

The harness fix does not weaken the check for the price the six assertions use today. That price is an integer, and for an integer every displayed and JSON form is still caught. It is weaker for a price with decimals (Finding H1). H1 does not block go-live, for the reasons given there. It should be closed with a one-token follow-up.

### What I ran

| Run | Result |
|---|---|
| Read `gate16rep4.txt`, converted from UTF-16 in the scratchpad | typecheck and lint `[ok]` (lines 17, 19). Unit `84 passed`, `1225 passed` (204-205). e2e `116 passed (2.4m)` (1064) and `139 passed (4.4m)` (1237). `[ok] database reachable` (1243). `[ok] prisma migrate status` (1251). db `32 passed`, `572 passed` (2125-2126). `[OK] Environment ready` (2132), **not** "database checks skipped". A grep for `flaky`, `Retry #`, `P1001`, `P1017` and `Can't reach` finds nothing. The file was written at 21:10:28; both repair commits are at 21:11. |
| `npm run test:unit` on HEAD | **84 files, 1225/1225**, 43.8 s |
| `git diff --quiet 74ab531..HEAD` over the paths the repairs must not touch | Untouched: `scripts/verify/`, `src/app`, `src/components`, `src/lib`, `prisma`, `Samples`, and `tests/e2e/stock-entry-quantities.spec.ts`. The five e2e specs change only their `bodyShowsPrice` import and the six price assertions, and each loop still asserts no `€` and no `unitPrice` (checked in all five). |
| `feature_list.json` #16 against the spec, whitespace-normalised | 31 of 31 identical, AC-9's ratified print rule included. `in_progress`. |
| A probe, `scratchpad/probe16c.ts`: prices of five shapes built at run time, stored as `Decimal(18, 8)` text. The price text is taken exactly as `anyUnitPriceText()` does (`Prisma.Decimal#toString`). Bodies are built with the app's own `formatPriceExact` and `roundHalfUp`, and as JSON. The old substring check is compared with `bodyShowsPrice`. | Integer: all six bodies caught by both. **One decimal** (`37.8`): the app's own display `€37.80`, the same without `€`, `37.80` from `roundHalfUp`, and the stored text `37.80000000` in JSON were **caught before and missed now**. Two decimals: only the stored text in JSON is newly missed. Eight decimals: no change. 1000 or more: the app's `€1,447.00` is missed by both, old and new, so that gap was already there. |
| A probe, `scratchpad/probe16d.mjs`: the same rule, but letting a price with a `.` absorb trailing zeros (`<price>0*`) | It catches every newly missed shape above. It still does **not** trip on `<p>9`, `1<p>`, a `kc…aba` action key or a `cmx…` cuid. |
| A probe, `scratchpad/probe16e.ts`: `restoreSchema` on Neon-shaped strings built at run time | The pooled and unpooled strings of one endpoint and one database are accepted. `DIRECT_URL` left on `neondb`, or `DATABASE_URL` left on `neondb`, is **refused, different databases**. Another branch's endpoint is **refused, different hosts**. An upper-case host is accepted. Both strings pooled is accepted (Observation S2). No message names a host or a database. |

I did not read `.env`, contact the live site or contact any database. I wrote only this section and scratchpad files.

### The required changes

| # | Status | Evidence |
|---|---|---|
| R1 | DONE | `restore.db.test.ts:190`. After a real restore it updates an `AuthEvent`, deletes the `AccountLock` row and inserts a `Supplier`. `compareWithFile` then reports exactly those three not identical, with exact numbers: AuthEvent `identical n-1`; AccountLock `restored 0, identical 0`; Supplier `restored n+1`. The other nine stay identical. Mutation MR1 (`isIdentical` forced `true`) turned it red (`impl_deploy.md:815`). **AC-10 now PASS.** |
| R2 | DONE | `export.db.test.ts:246` (no `_prisma_migrations`), `:256` (a table with no primary key), `:269` (`db:export` via `?schema=` exits non-zero and writes no file). `src/server/deploy/restore.test.ts:48`, `:57`, `:65` (a cycle throws `ConflictError` naming both tables). Throwaway schemas are dropped in `afterEach`. **C2.4 now [x].** |
| R3 | DONE | `verify-deployment.test.ts:943-1045`, on a stand-in browser; `signed-in-pass.ts` is unchanged. The tests cover: non-vacuity (`:943`); an empty scan (`:961`); a start page landing on `/sign-in` (`:976`); an unreadable body (`:992`); its complement, where a re-read body is scanned and a `€` in it still fails (`:1012`); and a non-staff or missing role, which gives exactly one `staff-role` FAIL, clicks sign-out once, reads no cookie and opens no staff page (`:1029`). Mutations R3-M1 (line 292 deleted) and R3-M2 (the role gate deleted) each turned one test red (`impl_deploy.md:713-719`). **AC-15 now PASS.** |
| R4 | DONE | `operator-production.mjs:70-73` and `:276`: the notice is chosen by `terminal`, and printed before the first question. `NOT_A_TERMINAL_NOTICE` says input is not a terminal, answers are read one per line and may be visible, stop with Ctrl+C, and use PowerShell or Windows Terminal. What is read is unchanged. Tests: `operator-production.test.ts:302` (terminal: no warning), `:316` (piped: the warning, each phrase, the answers still reach the command), `:336` (the real process with piped stdin). MR4 turned two of them red. `docs/operations.md` → *Operator commands* names the terminals. |

### The observations taken in

- **1, the seed gap.** A comment at `item-master-seed.ts:61-67` gives the four reasons. No behaviour changed.
- **2, one target for a restore.**
  - `target-schema.ts:52-78` refuses, before anything connects, strings that name different hosts once `-pooler` is removed, or different databases. It reuses the build's rule: `sameEndpoint` is now exported from `build-plan.ts`, and `productionSettingsProblems` uses it with the same semantics (the AC-4 tests are unchanged and green).
  - Proven by `target-schema.test.ts:48-97`, with no host or database name in any refusal, and by the pre-connection refusals at `restore.db.test.ts:323` and `:339`, where the target schema holds no table afterwards. MO2 turned all four red.
  - **MO2's finding matters.** With the rule removed, `prisma migrate deploy` *created* the missing database that `DIRECT_URL` named (`impl_deploy.md:819-830`). My first-pass trace missed that. So the slip I rated harmless could have left a stray database on the `production` branch. The new rule refuses it before anything connects.
  - The test now drops any database it names (`restore.db.test.ts:38-55`). The names are random `other_<hex>` only.
- **3, the `omittedPendingRequests` line.** Ratified in AC-9's print rule, in the spec and `feature_list.json` alike. **AC-9 PASS**, with no deviation left.
- **4, relaying the build log.** Go-live step 12 and R3 in `docs/operations.md` now ask for the prefixed lines only, never Prisma's `Datasource … at "<host>"` line.

### AC-5's dry-run redesign still proves AC-5

`vercel-build.test.ts:425-474`:
- `production`, the longest plan, runs through the literal `npm run --silent build:vercel -- --dry-run` (`:445`).
- The other four environments run `node --import tsx scripts/vercel-build.ts --dry-run` (`:464`). That is the same file by the same loader, with the same argument and a fresh environment each time.

This still proves AC-5's "dry run under each `VERCEL_ENV` of AC-2", for three reasons:
- `npm run` adds only argument forwarding, and the production case proves that end to end.
- `deploy-config.test.ts` pins `build:vercel` to exactly `tsx scripts/vercel-build.ts`, so the two entries cannot drift apart.
- The per-environment plan is also proved in process by `vercelBuild` (AC-2, AC-5 above).

What did not change:
- The 12 s kill switch is unchanged, and no budget was raised.
- The block is `describe.sequential`.
- Each case now also asserts `result.error` is undefined, so a kill cannot pass for a status.
- The spawned env still deletes the four database settings, so even a broken dry run would stop at `check-settings`.

The recorded runs under load peak at 4.4 s (`impl_deploy.md:1112-1128`). The gate's unit run is green.

### Finding H1 on the harness fix (`a5adc65`), non-blocking, with a follow-up

**The breach evidence is sound for what it tested.** `impl_deploy.md:983-1007`:
- The real price was rendered as a bare number with no euro sign.
- All six edited assertions were seen red (B1 at five lines, B2 at `stock-takes-count.spec.ts:514`), each with its message unchanged.
- The files were restored byte for byte.

My probe agrees that for an **integer** price every displayed and JSON form is still caught: `€<p>.00`, bare, `"<p>"`, a JSON number, and the stored `<p>.00000000`. By the coordinator's brief (`scratchpad/fix-price-token.md`), the price the specs use reads `890`, and both collisions held those digits.

**But "nothing is weaker" does not hold in general.**
- **The problem.** `bodyShowsPrice` (`tests/e2e/support/stock-entry.ts:228-234`) takes `Decimal#toString()`, which drops trailing zeros, and then treats a following digit as "another number". For a price with decimals, the forms the app itself produces carry trailing zeros:
  - `formatPriceExact` pads a one-decimal price to two places (`37.8` becomes `€37.80`);
  - a `Decimal(18, 8)` column's own text is `37.80000000`.

  The old substring check caught both; the new one catches neither. `price-token.test.ts:98-103` ("applies the boundary at both ends", with `${price}9`) and the doc comments at `stock-entry.ts:218-223` and `price-token.test.ts:13` describe the rule as losing nothing, which is true only for integers.
- **Why it does not block go-live.**
  - No application code changed.
  - The price in use is an integer, so today's six checks lost only the false positives they were meant to lose.
  - Every one of those loops still asserts no `€` and no `unitPrice`, and the app's formatter always prints `€`.
  - #16's own live scanner (AC-16) is independent of this helper.
- **Follow-up, as a `fix(harness)`, before the e2e price source can change.**
  - Let a price that contains `.` absorb trailing zeros: `` `(?<![0-9A-Za-z])${escaped}${price.includes(".") ? "0*" : ""}(?![0-9A-Za-z])` ``. `probe16d.mjs` shows this restores every lost shape, and none of the fixed false positives come back.
  - Add a one-decimal price built at run time to `PRICES` in `price-token.test.ts`, with the `€<p>0` and `<p>0000000` shapes under *still caught*.
  - Correct the two "nothing is weaker" comments.
  - Optionally, also match the thousands-grouped form (`1,447`), which neither the old nor the new check finds.

**`stock-entry-quantities.spec.ts`**, left on its own `priceSightings` rule, is recorded as deferred. I agree that deferring it is in scope. As the implementer notes (`impl_deploy.md:924-928`), that rule counts `.` as breaking the boundary, so a bare integer price followed by `.00` is not a sighting there. It should move onto the shared helper, once H1's fix is in.

### Observations (second pass, non-blocking)

- **S1, the development census.** The "for the coordinator" alarm at `impl_deploy.md:866-883` reports the owner's draft count gone. The A2 baseline had already recorded it before any repair: `impl_deploy.md:399-404` says "stock counts none … The owner's test count had already been deleted, as the coordinator said." It is not a repair side effect.
- **S2, both strings pooled.** `restoreSchema` accepts two pooled strings of one endpoint (probe). `migrate deploy` through the pooler then fails before any row is written, so this fails closed. For symmetry with `check-settings`, the restore could also require `-pooler` on `DATABASE_URL` only.
- **S3, a database named by both strings that does not exist.** `relationsInSchema` connects through `DATABASE_URL` first (`db-restore.ts:91`), before `migrate()` (`:99`). So a database misnamed identically in both strings fails on connection before Prisma could create it. I read this from the code order; no test covers it.
- The first pass's Observations 5 to 8 stand as ruled.

### Checkpoints, changes since the first pass

- C1.3 [x]: AC-1 to AC-18 all PASS. AC-10 and AC-15 are now proven; AC-9's print rule is ratified. Phase B is out of scope.
- C2.1 [x]: `gate16rep4.txt`, `[OK] Environment ready` with the database checks executed. `gate16rep3.txt`, which skipped them, was rightly not accepted.
- C2.4 [x]: `compareWithFile`/`isIdentical`, `exportDatabase` and `foreignKeyOrder` each now have a failure test.
- Every other box is as in the first pass, re-checked on the repair diff:
  - C3.4: no new cycle. `target-schema` → `build-plan` → `auth/*`, and nothing points back.
  - C4.8: `Samples/` is untouched.
  - C5: no secret in the added lines. The new tests build every string at run time under `.invalid`.
  - C6.2: the tree is clean.
