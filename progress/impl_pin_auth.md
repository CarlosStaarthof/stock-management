# Implementation — feature 21 pin_auth

**Spec:** specs/features/021-pin_auth.md

## Phase 0

**Scope:** AC-44, AC-45, AC-46 and AC-47's documentation half. No other #21 change was made:
no schema, migration, auth, screen or `feature_list.json` edit (#21 was already `in_progress`).
**Status:** complete for the implementer. Two parts of AC-47 belong to the coordinator and are
**not done here**: the `init` run with #21 `in_progress` while the tree differs from `HEAD` only
by this change, and the single `test(#21): ` commit. Per the brief I ran no `init`, e2e or `test:db`.

### Files created
- `tests/support/feature-scope.ts`: the one helper. It exports `isAttributedTo`, `featureStatus`,
  `commitsOf`, `filesTouchedBy`, `changedLinesBy`, `workingTreeChanges` and the types
  `FeatureScopeOptions` / `FeatureStatus`. It is read-only (`log`, `show`, `diff`, `status`,
  `ls-files`, `rev-parse` only). Every git call carries `--no-optional-locks --literal-pathspecs`,
  and `log` carries `--full-history`. It fails closed.
- `tests/unit/feature-scope.test.ts` (15 tests): the three `isAttributedTo` tests; AC-44 (a) to
  (h) on throwaway repositories, with the index and refs checked around every call; and the two
  AC-45 scans.

### Files modified
- `tests/unit/analysis-contract.test.ts`: row 1 is now `filesTouchedBy(11, <21 paths>)` plus
  `workingTreeChanges(["Samples"])`. Row 2 is `filesTouchedBy(11, ["package.json", "package-lock.json"])`.
  Row 2's comment spelled the withdrawn claim and was rewritten.
- `tests/unit/count-entry-contract.test.ts`: rows 3 to 6 are `filesTouchedBy(8, …)`. Row 6's `/api`
  check stays.
- `tests/unit/schema-and-migration.test.ts`: row 7 is `filesTouchedBy(4, [`${MIGRATIONS_DIR}/migration_lock.toml`])`.
  The provider check stays.
- `tests/unit/stock-entry-contract.test.ts`: rows 8 to 10 are `filesTouchedBy(7, …)`. The existence
  check, the `data-testid` check and the `migration_lock.toml` check stay. **Row 11 is byte-identical**:
  its `it(…)` block, cut with `sed` and compared with `cmp` against the byte copy, is identical.
- `tests/unit/stock-takes-contract.test.ts`: rows 12 to 14 are `filesTouchedBy(10, …)`. Row 15 is
  `filesTouchedBy(10, <nine paths>)` and must equal `[GRID]`. Row 16 is
  `changedLinesBy(10, ["playwright.config.ts"])`, length 4, with each line matched by the same
  regex. The block comment that spelled the tip-ended range was rewritten, and the now-unused
  `SPEC_APPROVAL_COMMIT` was removed. The seven configuration checks stay.
- `docs/conventions.md`: in *Tests*, the working-tree bullet was replaced. In *Commits*, `spec`
  was added to the types, with the scope rules and what a missing scope, a wrong number or a
  revert each does.
- `progress/current.md`: plan and log for this session.

### Acceptance criteria
| AC | Where it is satisfied | Test or proof |
|----|-----------------------|---------------|
| AC-44 exports and `{ cwd }` | `tests/support/feature-scope.ts`. Every export except `isAttributedTo` takes `options: FeatureScopeOptions = {}` last | typecheck 0 |
| AC-44 subjects (id 8 true ×4, false ×10; id 1 vs `feat(#10)`) | `FEATURE_SUBJECT = /^[a-z]+\(#(\d+)\): /`, and the captured digits must equal `String(id)` | `feature-scope.test.ts` → "AC-44: with id 8, every lower-case type…", "…another number, a padded or malformed scope…", "AC-44: with id 1, feat(#10)…" |
| AC-44 (a) | `filesTouchedBy` joins `changedInWorkingTree` while the feature is `in_progress`. That uses `status --porcelain=v1 -z --no-renames --untracked-files=all --ignored=no` | "AC-44 (a)". Covers a modified, a staged-only, a deleted, an untracked and a nested untracked file. The ignored `debug.log` and the change outside P are absent |
| AC-44 (b) | the same, gated on status | "AC-44 (b)". X gives `[]`, and Y (`in_progress`, no commits) gives the full list |
| AC-44 (c) | `commitsOf` reads `%s` only; `show --no-renames --name-only -z` per commit | "AC-44 (c)". `fix(#8)` and `spec(#8)` count. `feat(#80)`, `fix(app)` and a body-line-only `fix(#8): ` do not. `commitsOf` returns 4 SHAs in order |
| AC-44 (d) | commits plus working tree while `in_progress` | "AC-44 (d)" |
| AC-44 (e) | `patchLines` keeps `+`/`-` lines only inside a hunk. The working tree's `diff HEAD` lines follow, then the untracked files' lines | "AC-44 (e)". The expected output includes content lines shown as `+++ plus` and `--- minus`. The new file's headers and `\ No newline` are excluded, and the Y commit is excluded |
| AC-44 (f) | `workingTreeChanges` never reads `feature_list.json` | "AC-44 (f)". It returns `[]` when clean, and the same file under 3 status sets, with broken JSON and with no feature list |
| AC-44 (g) | `--literal-pathspecs` on every call | "AC-44 (g)". Non-vacuity: plain `git show -- guarded/[id]` does list `guarded/d` |
| AC-44 (h) | `featureStatus` throws on a missing file, bad JSON, an absent id or a bad status. `workOf` throws for a non-`in_progress` feature with no commits. `assertFullHistory` throws on a shallow clone. `git()` throws on a spawn error or a non-zero exit | three "AC-44 (h)" tests: the id throws, the shallow `file://` clone at `--depth 1` throws, and a directory outside any repository throws |
| AC-44 index and refs unchanged | `observe()` hashes `.git/index` (sha256) and `for-each-ref` before and after every call, whether it returns or throws | all AC-44 tests. Mutation M8 below shows the check fires |
| AC-44 temporary repositories removed | `afterEach` runs `rmSync`, then asserts `existsSync === false` | after both unit runs, `ls $TEMP \| grep -c ^feature-scope-` gave `0` |
| AC-45 conversions | the five files, as listed above | AC-46 R0 to R11. `it(` title lists are identical by sha256 and counts are 23/35/21/27/29 before and after in the five files |
| AC-45 porcelain scan | "AC-45: only the helper, and row 11 exactly once…". The files come from `ls-files --cached --others --exclude-standard` over `tests` and `src` (`*.test.ts` only for `src`). The scan reads string literals from the TypeScript AST, so comments are removed by construction. It needs exactly one hit in `stock-entry-contract.test.ts`, inside the span of row 11's `it(…)` | green in both unit runs |
| AC-45 banned strings | "AC-45: no scanned file, and not the conventions, spells…". Both strings are built from parts, and the file scans itself (non-vacuity is asserted) | green. Before the conventions edit it was red on `docs/conventions.md`, as it should have been |
| AC-46 | the proof below | 12 runs, 8 mutations, main before and after identical |
| AC-47 docs | `docs/conventions.md` → *Tests* and *Commits* | the banned-string scan; see the text |
| AC-47 `init` and commit | **coordinator** | not done here |

### Verification output

`npm run typecheck` gave exit 0 and `npm run lint` (`eslint src tests --max-warnings 0`) gave
exit 0. Both ran after the last code edit.

`npm run test:unit`, twice, after the AC-46 teardown:
```
run 1 exit=0
 ✓ tests/unit/feature-scope.test.ts (15 tests) 43672ms
 Test Files  59 passed (59)
      Tests  853 passed (853)
   Duration  67.77s
run 2 exit=0
 ✓ tests/unit/feature-scope.test.ts (15 tests) 42454ms
 Test Files  59 passed (59)
      Tests  853 passed (853)
   Duration  46.50s
```
The previous recorded baseline was 58 files and 838 tests. The difference, +1 file and +15 tests,
is exactly `feature-scope.test.ts`. The five converted files kept their test counts. In the main
checkout, with #21 `in_progress` and no other #21 change, the five files alone gave 135/135.

### AC-46: the twelve runs

**Worktree.** `git -c core.autocrlf=false -c core.eol=lf worktree add --detach <scratchpad>/p0/wt HEAD`
was created at `9bf1f82`. The Phase 0 files were copied in (sha256 identical to the main
checkout's), and the scratch commit **`cea3752 test(#21): phase 0 scratch, worktree only`**
(START) was made under a throwaway identity (`-c user.name=…`). `node_modules` is a junction to
the main checkout's copy. I tested first on a scratch repository that git treats the junction
as an ignored directory. The driver is `scratchpad/p0/proof.sh`, the row mapper is
`scratchpad/p0/rows.cjs`, and the JSON reports are in `scratchpad/p0/proof/R*.json`.

**Probe lines.** One line was appended to each probed file: `// phase 0 probe` in `schema.prisma`,
`test-db.ts`, `middleware.ts`, `error-response.ts`, `(public)/loading.tsx`, `count-service.ts`,
`stock-entry/page.tsx` and `playwright.config.ts`; `# phase 0 probe` in `migration_lock.toml`;
and a second trailing newline in `package.json`. `git diff --stat` showed 10 files changed, 10
insertions.

**Command, every run:**
`(cd <scratchpad>/p0/wt && npx vitest run tests/unit/analysis-contract.test.ts tests/unit/count-entry-contract.test.ts tests/unit/schema-and-migration.test.ts tests/unit/stock-entry-contract.test.ts tests/unit/stock-takes-contract.test.ts --reporter=json --outputFile=<scratchpad>/p0/proof/R<n>.json)`

| Run | Statuses changed (worktree `feature_list.json` only) | Probe | Commit subject | Result (135 tests) | Failing tests, all of them |
|---|---|---|---|---|---|
| R0 | none (#21 `in_progress`) | uncommitted | none | 135 passed | none |
| R1 | #4 `in_progress`, #21 `pending` | uncommitted | none | 134 / 1 | schema-and-migration › `004 AC-23: migration_lock.toml still records provider postgresql and is unmodified` |
| R2 | #7 `in_progress`, #21 `pending` | uncommitted | none | 132 / 3 | stock-entry-contract › `AC-3: the PUBLIC segment's loading.tsx is unchanged and still there`; `AC-1: auth-config.ts and middleware.ts are byte-identical to their shipped state`; `AC-32: prisma/ is byte-identical — this feature adds no migration` |
| R3 | #8 `in_progress`, #21 `pending` | uncommitted | none | 131 / 4 | count-entry-contract › `AC-27: src/app/api/error-response.ts is unchanged by this feature`; `AC-29: prisma/ is byte-identical — this feature adds no migration and no table`; `AC-29: TRUNCATED_TABLES is unchanged, because #8 adds no table`; `AC-1: the middleware gains no /api entry and no new pattern` |
| R4 | #10 `in_progress`, #21 `pending` | uncommitted | none | 130 / 5 | stock-takes-contract › `AC-4: count-service.ts is byte-identical to its shipped state`; `AC-22: the schema, the migrations and TRUNCATED_TABLES are unchanged`; `AC-4: /stock-entry/page.tsx is byte-identical, so #7's rendering cannot have moved`; `AC-22: CalendarGrid.tsx is the only changed file in #7's trees`; `AC-21, AC-22: playwright.config.ts changed by exactly its two route patterns` |
| R5 | #11 `in_progress`, #21 `pending` | uncommitted | none | 133 / 2 | analysis-contract › `AC-25: the schema, the migrations and the truncate list are untouched`; `AC-14: no charting library was added, so the fence has nothing new to hold` |
| R6 | none | committed, tree clean | `fix(#4): phase 0 probe` (b8d5ec0) | 134 / 1 | same as R1 |
| R7 | none | committed, tree clean | `fix(#7): phase 0 probe` (483675d) | 132 / 3 | same three as R2 |
| R8 | none | committed, tree clean | `fix(#8): phase 0 probe` (b5fcfe6) | 131 / 4 | same four as R3 |
| R9 | none | committed, tree clean | `fix(#10): phase 0 probe` (1c9ea30) | 130 / 5 | same five as R4 |
| R10 | none | committed, tree clean | `fix(#11): phase 0 probe` (5e754c3) | 133 / 2 | same two as R5 |
| R11 | none | committed, tree clean | `feat(#21): phase 0 probe` (c91d413) | 135 passed | none |

Between R1 and R5 the feature list was restored with `checkout -- feature_list.json`. Before
each of R6 to R11 the worktree was `reset --hard` to START, and the driver logged
`dirty: 0` after each commit. Each probe commit lists exactly the 10 probed files. In every
run, the failing tests outside the fifteen converted rows numbered **0**.

**Fifteen converted rows against twelve runs** (✗ = failed, · = passed):

| Row (owner) | R0 | R1 #4 | R2 #7 | R3 #8 | R4 #10 | R5 #11 | R6 #4 | R7 #7 | R8 #8 | R9 #10 | R10 #11 | R11 #21 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 (#11) | · | · | · | · | · | ✗ | · | · | · | · | ✗ | · |
| 2 (#11) | · | · | · | · | · | ✗ | · | · | · | · | ✗ | · |
| 3 (#8) | · | · | · | ✗ | · | · | · | · | ✗ | · | · | · |
| 4 (#8) | · | · | · | ✗ | · | · | · | · | ✗ | · | · | · |
| 5 (#8) | · | · | · | ✗ | · | · | · | · | ✗ | · | · | · |
| 6 (#8) | · | · | · | ✗ | · | · | · | · | ✗ | · | · | · |
| 7 (#4) | · | ✗ | · | · | · | · | ✗ | · | · | · | · | · |
| 8 (#7) | · | · | ✗ | · | · | · | · | ✗ | · | · | · | · |
| 9 (#7) | · | · | ✗ | · | · | · | · | ✗ | · | · | · | · |
| 10 (#7) | · | · | ✗ | · | · | · | · | ✗ | · | · | · | · |
| 12 (#10) | · | · | · | · | ✗ | · | · | · | · | ✗ | · | · |
| 13 (#10) | · | · | · | · | ✗ | · | · | · | · | ✗ | · | · |
| 14 (#10) | · | · | · | · | ✗ | · | · | · | · | ✗ | · | · |
| 15 (#10) | · | · | · | · | ✗ | · | · | · | · | ✗ | · | · |
| 16 (#10) | · | · | · | · | ✗ | · | · | · | · | ✗ | · | · |

Every cell matches the spec's table: #4 → 7; #7 → 8, 9, 10; #8 → 3 to 6; #10 → 12 to 16;
#11 → 1, 2; #21 → none. Row 11 passed in every run and was never probed. Nothing under
`Samples/` was modified in any checkout (`git status --porcelain -- Samples` is empty in main).

**A first attempt was discarded, and it is recorded here.** The first worktree was created
without `core.eol=lf`. Because of `.gitattributes` `* text=auto` and the Windows native eol, its
files were checked out **CRLF**, while the main checkout is LF. In that attempt the converted rows
already behaved exactly as in the table above. But 7 **unconverted** content tests in
`schema-and-migration.test.ts` failed in every run, R0 included: `004 AC-3` (enum values),
`004 AC-4` ×2, `003 AC-2 / 004 AC-5`, `004 AC-5`, `003 AC-2` (email unique) and `004 AC-8`. They
also failed **on the clean worktree with no probe**. The cause is that the test's schema parser
does not tolerate CRLF. That is not a Phase 0 matter; see the notes. The worktree was removed
(junction first) and re-created with `-c core.autocrlf=false -c core.eol=lf` on `worktree add`
and on every worktree git command. The table above is from the re-created worktree. The first
attempt's logs are kept in `scratchpad/p0/*crlf-checkout*`.

**Main checkout, before the worktree and after its removal** (`scratchpad/p0/main-before.txt`
and `main-after.txt`): `diff` found them identical, and both files have sha256 `040e09f2…0f64`.
- `git rev-parse HEAD`: `9bf1f823be66ba1aa69176de0a87b5fa13385562`
- `git for-each-ref`: one line, `9bf1f82… commit refs/heads/main`
- `git status --porcelain`: the same 10 lines both times (the Phase 0 change plus the two `progress/` files)
- `git worktree list`: only `C:/Users/User/Documents/Stock_Managment 9bf1f82 [main]`
- `git branch -a`: only `* main`

**Teardown.** The junction was removed on its own first (`cmd /c rmdir …\wt\node_modules`).
After that, the main checkout still had `node_modules\vitest\package.json` and 416 entries.
Then `git worktree remove` ran on the clean worktree. After that the directory was gone,
`.git/worktrees` did not exist, `git worktree prune --dry-run` printed nothing, and in main
`npx vitest --version` gave `vitest/3.2.7 win32-x64 node-v24.14.0`. The nine scratch and probe
commits (3f609b4, 5068838 and cea3752 from the three worktree setups, plus b8d5ec0, 483675d,
b5fcfe6, 1c9ea30, 5e754c3 and c91d413) are contained in 0 refs (`for-each-ref --contains`) and
appear in no reflog (`reflog --all`). They remain only as unreachable loose objects in the shared
object store, and git's normal gc will prune them. I did not run `gc` on the real repository.

### Helper mutations (extra, run in the worktree copy only)

Each mutation was applied to the worktree's `tests/support/feature-scope.ts`, followed by
`npx vitest run tests/unit/feature-scope.test.ts`, then restored from the worktree's HEAD. After
each restore the sha256 was `8313ab1d…`, equal to the main checkout's, and the worktree was clean
at the end. Logs are in `scratchpad/p0/mutations.txt` and `scratchpad/p0/mut/`.

| # | Mutation | Red |
|---|---|---|
| M1 | drop `--literal-pathspecs` | (g) |
| M2 | header filter replaced by the old `/^[+-][^+-]/` | (e) |
| M3 | subject regex `/^[a-z]+\(#(\d+)/i` (no `): `, case-insensitive) | "with id 8, another number…" |
| M4 | working tree never joined while `in_progress` | (a), (b), (g) |
| M5 | drop `--untracked-files=all` | (a), (b) |
| M6 | shallow check disabled | (h) shallow |
| M7 | the "not in progress and no commits" throw disabled | (h) ids |
| M8 | drop `--no-optional-locks` | (f), (g), with the message "the helper rewrote .git/index" |

### Deviations from the spec
None in what is asserted. These choices are stricter than the text or left open by it:
- **The helper throws in two more cases** than AC-44 lists: an empty `paths` list (git would
  read it as the whole repository), and a `status` outside `pending/in_progress/blocked/done`.
  It also drops `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and the other variables that
  redirect the repository or the pathspec mode from git's environment. A test run from inside a
  hook would otherwise read the wrong repository. `show` uses `--diff-merges=first-parent` and
  `--no-renames`, so a rename lists both names. The repository has no merge commits.
- **The porcelain scan reads string literals from the TypeScript AST** instead of regex-stripping
  comments. An argument is flagged when a literal's text has the flag at its start *or after
  whitespace*, which also catches a one-string command. For any non-TS file under `tests/` (there
  are none today), the raw text is checked instead.
- **Row 15 keeps `toEqual([GRID])`**. `GRID` is `"src/components/stock-entry/CalendarGrid.tsx"`
  (`stock-takes-contract.test.ts:274`), so the expectation text is unchanged.
- **Row 16's lines keep their leading `+`/`-` and are no longer trimmed.** The regex is the same
  and unanchored, and all four lines match. The helper returns them as git prints them.
- **Untracked-file lines**: the file is split on `\r?\n`, the final newline adds no line, and an
  empty file contributes nothing.
- The AC-44 `describe` block has `{ timeout: 60_000 }`. Each temp-repo test takes 0.5 to 5 s
  alone, and the file takes about 43 s inside the full suite.

### Notes for the reviewer
- **Found, not mine to fix:** `schema-and-migration.test.ts`'s schema parser fails 7 content
  tests on a CRLF checkout of `prisma/schema.prisma`. A fresh clone on this machine's defaults
  (`core.autocrlf=true`, `* text=auto`) produces exactly that. The main checkout is LF, so the
  gate is unaffected today. This is recorded in `progress/current.md` for the leader.
- **Cost:** each helper call runs 3 or more git processes (about 0.6 to 1 s under the parallel
  suite on Windows). `feature-scope.test.ts` is now the longest unit file at about 43 s. The
  suite ran in 46 to 68 s, against the earlier recorded 65 s.
- AC-45's "all sixteen pass with #21 `in_progress` before any other #21 change" is shown by the
  main-checkout run of the five files (135/135), by R0, and by both unit runs. "Again at #21's
  close" is for later.
- For AC-47's commit, `git show --name-only` must list exactly the eight test and doc files named
  there plus `progress/` files. `progress/current.md` and this file are the only `progress/`
  changes. `feature_list.json` is unchanged.

### Phase 0 gate — AC-47's `init` run (coordinator, 2026-09-25)

Made with #21 `in_progress` while the working tree differed from `HEAD` (`9bf1f82`) only by Phase 0's
change (the files listed in AC-47, plus `progress/`). Run through Git Bash, with the machine held
awake for the duration.

```
bash ./init.sh                               ->  init exit=0   (23.2 min)
    [ok]   feature_list.json parses
    [ok]   20 features, 1 in progress
    [ok]   Samples/ has no uncommitted changes
    [ok]   prisma schema valid / npm run typecheck / npm run lint
    [ok]   npm run test:unit     853 passed
    [ok]   npm run test:e2e      phase 1 56 passed; phase 2 139 passed
    [ok]   database reachable / prisma migrate status
    [ok]   npm run test:db       397 passed
[OK] Environment ready            (database checks executed; none skipped; no suspension)
```

A first attempt earlier the same day never ran: the coordinator invoked `bash` from PowerShell,
where it resolves to the Windows WSL launcher (`C:\Windows\System32\bash.exe`, no distribution
installed). That run died in 12 seconds with `execvpe(/bin/bash) failed` before any check. It was a
tooling error, not a result, and it's recorded here so the two runs aren't confused.

## Phase A

**Scope:** the pure and cryptographic modules only: `credential-rules.ts`, `account-lock.ts`,
`attempt-budget.ts`, `src/lib/auth-messages.ts`, and the nine new functions in `password.ts`, each
with unit tests. **Status:** complete for the implementer. It is purely additive: over the three tracked
files it changes, `git diff --stat HEAD -- src` shows 884 insertions and 2 deletions, and the two deleted
lines are the old `import` lines of `password.test.ts`. The other seven files are new. `hashPassword`, `verifyPassword`, `INVALID_CREDENTIALS_MESSAGE`,
`INACTIVE_ACCOUNT_MESSAGE` and `ACCESS_DENIED_MESSAGE` are unchanged, and `auth-actions.ts` and
`sign-in/page.tsx` still use them. Nothing under `prisma/`, `auth-config.ts`, `middleware.ts`, pages,
components, `tests/e2e/`, `tests/support/` or `feature_list.json` was touched (#21 was already
`in_progress`). Per the brief I ran no `init`, e2e or `test:db`.

### Files created
- `src/server/auth/credential-rules.ts`: `PIN_LENGTHS`, `PinLength`, `parsePin`, `isTrivialPin` (a rule,
  not a list), `generatePin` (`crypto.randomInt`, redraws trivial), `parseUsername`, `parseProfileName`,
  `SETUP_CODE_MIN_LENGTH`.
- `src/server/auth/account-lock.ts`: the three constants, `lockDurationMinutes`, `applyOutcome`, `isLocked`,
  plus the types `AccountLockState` and `LockOutcome`. It is pure.
- `src/server/auth/attempt-budget.ts`: the seven constants, `decideAttempt`, `bucketFor`, plus the types
  `AttemptEvent`, `AttemptEventKind`, `CountedEventKind` and `BudgetDecision`. It is pure.
- `src/server/auth/credential-rules.test.ts` (20 tests), `account-lock.test.ts` (10), `attempt-budget.test.ts`
  (11), `src/lib/auth-messages.test.ts` (7).

### Files modified
- `src/server/auth/password.ts`: added `pinDigest`, `hashPin`, `verifyPin`, `currentPinKeyId`, `accountKey`,
  `signDeviceToken`, `verifyDeviceToken`, `setupCodeConfigured`, `setupCodeMatches`, and the error class
  `CredentialSecretError`. It reads `process.env.PIN_PEPPER`, `.SETUP_CODE` and `.AUTH_SECRET` inside
  functions only, never at import. Nothing was removed.
- `src/server/auth/password.test.ts`: the five 003 tests are unchanged. 29 tests were added, for 34 in total.
- `src/lib/auth-messages.ts`: added every AC-39 message and label and the three length constants. It still
  imports nothing. The email-era messages stay until Phase B.

### Acceptance criteria
| AC | Phase A's part: where, and the test that proves it | Left to |
|----|------|------|
| AC-5 | All of it. `password.ts` `pinDigest`/`hashPin`/`verifyPin`/`currentPinKeyId`/`accountKey`. `password.test.ts`: "PIN hashing (021 S3, S4)", "the lock key (021 S5)", and six "with PIN_PEPPER {unset, empty, blank, 31 bytes, 16 bytes, not base64}" tests. Each checks that all five functions throw, that the message names `PIN_PEPPER`, and that it contains no 6-character window of the value. | none |
| AC-7 | All of it. `credential-rules.ts`. `credential-rules.test.ts`: 24 plus 20 trivial PINs are built from the rule at runtime, 1,000 random non-trivial PINs are drawn, 2,000 draws per length cover all ten digits per position, and `randomInt` is spied through `vi.mock("node:crypto")`, which delegates to the real function. | none |
| AC-11 | All of it. `account-lock.ts`. `account-lock.test.ts`: durations for k = 1 to 12, four failures then the fifth, the next lock after each lock ends, the ±1 ms boundary, SUCCESS, and CLEARED at level 3 then 120 min. | none |
| AC-13 | All of it, with `bucketFor`'s argument read as the **verified** device id (Deviation 1). `attempt-budget.test.ts`: the constants, 9 allow and 10 refuse, the exactly-24-h boundary, reset later than all ten, events before the latest reset, other kinds ignored, and the null, expired, malformed, tampered and forged tokens through `bucketFor(kind, verifyDeviceToken(t))`. | none |
| AC-16 | The token half. `password.test.ts` "the device token": a 180-day expiry to the second, renewal keeps the id, every single-character change at every position gives `null`, so does another `AUTH_SECRET`, the id survives a replaced or unset `PIN_PEPPER`, and it never throws (including a 1 MB string). | B: the cookie attributes, both transports, sign-out |
| AC-28 | The comparison half. `password.test.ts` "the setup code": true only for the exact code; false for empty, last character removed, one character appended, one letter's case changed; never throws at lengths 0 to 294 and 1 MB or for non-strings; the source has exactly two `createHash("sha256")` and the constant-time call on `(given, expected)`. | C: `completeSetup`, budget, events, e2e |
| AC-10 | The unit half: `verifyPin(pin, null)` (or a non-bcrypt value) makes **exactly one** bcrypt comparison, against one per-process hash of random bytes, and answers `false`. Test "AC-10: with no usable hash…", with bcrypt spied via `vi.doMock`. | B: the statement sequence, the call counts through `attemptSignIn`, e2e |
| AC-27 | The unit half of `setupCodeConfigured`: unset, empty and 15 characters are false; 16 is true; an unconfigured code matches nothing. | C: `setupAvailable`, `/setup` 404 |
| AC-39 | The module half: imports nothing; every listed string export is present, non-empty and distinct; the three constants; `USERNAME_TAKEN_MESSAGE` and `PIN_FAILURES_SUMMARY` contain their arguments; the length messages contain the lengths; four distinct status labels. | B: stop exporting the two email-era messages. The literal scan is blocked (Finding 1). |
| AC-42 | The unit half: `password.ts` loads with all three secrets unset, and reads each on call (test "AC-42: the module loads…"). The other three modules read no environment variable at all. | Gate: build and init with an unresolvable database |
| AC-6 | Not asserted by a test in A. Grep evidence below: under `src/`, `scripts/` and `prisma/`, only `password.ts` names `bcryptjs`, `createHmac` or `timingSafeEqual`, and under `src/server/auth/**` plus `auth-config.ts` the only `process.env.<NAME>` reads are the three secrets, all in `password.ts`. | B/C: the `hashing-boundary.test.ts` amendments (they name `hashPin`/`verifyPin` and `scripts/pin-reset.ts`) |
| All others | none | B or C, per the brief's phase table |

Evidence for AC-6 and AC-8 in the new files, from `grep` over the ten Phase A files and the repository:
```
4/6-digit string literals in the ten files:                  (none)
/setup_?code\w*\s*[:=]\s*["'`]/i in the ten files:           src/lib/auth-messages.ts:99 SETUP_CODE_INCORRECT_MESSAGE  (Finding 2)
files naming createHmac|timingSafeEqual (src scripts prisma): src/server/auth/password.ts
files naming bcryptjs (src scripts prisma):                   src/server/auth/password.ts
process.env.<NAME> under src/server/auth + auth-config.ts:    password.ts:64 PIN_PEPPER, :190 AUTH_SECRET, :249 SETUP_CODE
console.|logWarn|logError in the five modules:               (none)
```

### Verification output
Baseline before Phase A (Phase 0's record): 59 files / 853 tests.
```
npm run typecheck   exit=0
npm run lint        exit=0
npm run test:unit   run 1: exit=0  Test Files 63 passed (63)  Tests 930 passed (930)  66.05s
npm run test:unit   run 2: exit=0  Test Files 63 passed (63)  Tests 930 passed (930)  45.72s
five files, verbose: auth-messages 7, account-lock 10, attempt-budget 11, credential-rules 20, password 34 = 82
```
+4 files and +77 tests. That is 82 in the five files minus the 5 pre-existing password tests.

**Mutations.** There were eleven. Each was applied alone and its own test file was run. Each file was then
restored by byte copy from `scratchpad/pa/orig/`, and `sha256sum -c` passed for all five modules afterwards.

| # | Mutation | Red tests (all others green) |
|---|---|---|
| M1 | account-lock: the lock doesn't double (`* 2 ** (level - 1)` changed to `* 1`) | 3: durations; next lock at the next duration; clear at level 3 then 120 min |
| M2 | account-lock: CLEARED zeroes the level | 1: clear at level 3 then 120 min |
| M3 | password: the setup-code compare isn't constant-time (`candidate === configured`) | 1: the AC-28 source test. The behaviour tests stay green, which is why the source assertion exists |
| M4 | password: `verifyPin(pin, null)` skips the bcrypt | 1: AC-10's one-comparison test |
| M5 | password: the device-token MAC isn't checked (length only) | 2: single character changed; another `AUTH_SECRET` |
| M6 | password: the pepper minimum is 1 byte | 2: `PIN_PEPPER` 31 bytes and 16 bytes |
| M7 | credential-rules: a trivial PIN is accepted by `parsePin` | 1: the 24 + 20 trivial PINs test |
| M8 | credential-rules: the username is lower-cased before it's checked | 1: the refusals, via the Kelvin sign |
| M9 | attempt-budget: `BUDGET_RESET` is ignored | 3: the reset tests |
| M10 | attempt-budget: an event exactly 24 h old still counts (`>` changed to `>=`) | 2: the exactly-24-h test; same instant as the reset |
| M11 | auth-messages: the module imports something | 1: "it imports nothing" |

Restored sha256: account-lock `e5273fbd…`, password `7a132547…`, credential-rules `83dc2092…`,
attempt-budget `ce450ea6…`, auth-messages `d56ccbec…`. All matched the pre-mutation copies.

### Deviations from the spec
1. **`bucketFor(kind, deviceId)` takes the verified device id, not the token.** The table says
   `attempt-budget.ts` is **pure**, and AC-6 makes `password.ts` the only reader of `AUTH_SECRET`, so
   `bucketFor` can't verify a token itself. The caller passes `verifyDeviceToken(token)`, which is `null`
   for a missing, expired, malformed or forged token. AC-13's token cases are proven through that
   composition. `bucketFor` also sends any non-null string that isn't a 32-hex id to the new-device
   bucket, so a bucket name only ever takes a documented form. `kind` is an `AuthEventKind` value, and
   `"SETUP_FAILURE"` always gives `"setup"`.
2. **`parseProfileName` refuses more than AC-7 names.** It refuses line break, carriage return, tab, `<` and `>`,
   and also every other C0 control character, DEL, U+0085, U+2028 and U+2029. Postgres refuses U+0000 in a
   text column, so a public form would answer 500. The Unicode separators are line breaks by another name, and
   the rule exists to protect #9's audit lines. `NAME_CHARACTERS_MESSAGE` says "another control character". The
   test is titled "AC-7 (hardening…)". Code points are counted, so an astral character counts once.
3. **One runtime export beyond the table: `CredentialSecretError`** (with `variable`: `PIN_PEPPER` |
   `AUTH_SECRET`). Step 1 of sign-in (`UNAVAILABLE`) and `setupAvailable` must tell "pepper unusable" apart from a
   bug. The table gives no predicate, so a caller catches this class around `currentPinKeyId()`. Also exported are
   the types `PinCredential`, `CredentialSecret`, `PinLength` and the lock and budget types listed above.
4. **`verifyPin(pin, pinHash: string | null)`.** `null`, or anything not shaped like a bcrypt hash, is compared
   against a hash of 32 random bytes. That hash is made lazily, once per process, and `false` is returned. The
   dummy has to live in `password.ts` because it is the one file allowed to import bcrypt. Phase B's service
   therefore calls `verifyPin` exactly once in every evaluated case.
5. **Interpretations the spec left open.** The pepper is used as its **decoded bytes**. It is trimmed, must match
   the standard or URL-safe base64 alphabet, and must decode to at least 32 bytes, so the same key gives the same
   digests in either encoding. `accountKey` lower-cases but doesn't trim, because callers pass a parsed username.
   `SETUP_CODE` is trimmed and its length counted in code points; the candidate is compared exactly, untrimmed.
   The device token is `v1.<32-hex id>.<expiry in Unix seconds, no leading zero>.<64-hex MAC>`, with the MAC under
   `HMAC(AUTH_SECRET, "macroads:device-token:v1")`. It's compared as text, so every character is significant.
   Comparing decoded base64 would ignore a last character's padding bits. `applyOutcome(FAILURE)` on a locked
   state changes nothing. `lockDurationMinutes(k < 1 or non-integer)` throws `RangeError`, a programming error.
6. **Wording.** The spec names every message but quotes none, so all the text in `auth-messages.ts` is mine. Every
   message describes rules rather than illustrating them, and none contains a PIN or a code.

### Findings: where the spec is wrong or conflicts with itself
1. **AC-39's literal scan conflicts with AC-40.** Five e2e specs spell `ACCESS_DENIED_MESSAGE`'s 36-character text
   inside `toHaveText(…)`: `analysis-access.spec.ts:225`, `item-master-access.spec.ts:150`,
   `role-access.spec.ts:57`, `stock-entry-access.spec.ts:159` and `stock-entry-submit.spec.ts:168`. AC-39 forbids
   that. AC-40 allows only three mechanical substitutions in those specs, and "literal becomes an import" isn't
   one. One criterion must give way. I didn't write the scan: it would be red today, and the fix lies in files
   Phase A may not touch.
2. **AC-8's setup-code scan conflicts with AC-39.** AC-39 requires `SETUP_CODE_INCORRECT_MESSAGE`, which is a
   non-empty string literal assigned to a name matching `/setup_?code/i`, and AC-8's wording forbids exactly that.
   The AC-8 scan must exempt message constants, for example names ending `_MESSAGE`, or match only names that hold
   a code.
3. **AC-13 against the table's "pure".** `bucketFor(kind, device)` over tokens can't be pure while `password.ts`
   alone reads `AUTH_SECRET`. This is resolved by Deviation 1.
4. **A trivial PIN at sign-in.** `parsePin` refuses trivial PINs (AC-7). If Phase B's step 3 uses `parsePin`, a
   trivial PIN becomes "malformed": one device-bucket failure, no account key, no bcrypt. That's safe, because no
   stored PIN can be trivial, but AC-10 (f) doesn't list it, so Phase B should choose deliberately.
5. **`AUTH_SECRET` has no reader to move.** Today no file in AC-6's set reads `process.env.AUTH_SECRET`, because
   Auth.js reads it itself. `password.ts` is now its only reader in that set. The only other occurrence under `src/`
   is `src/app/api/users/route.test.ts`, which is outside AC-6's set.

### Notes for the reviewer
- **No PIN or setup-code value anywhere.** Every PIN is from `generatePin`, `randomInt`, or built by rule. Every
  code, pepper and secret is `randomBytes`. Full-width and Arabic-Indic digits are built with
  `String.fromCharCode`.
- **Real secrets are never read.** No test depends on the environment: every test that needs a secret sets
  its own random value with `vi.stubEnv` (or unsets it), and a file-level `afterEach(vi.unstubAllEnvs)`
  removes them. None of the five test files contains the text `process.env` (grep, exit 1), so none counts
  as a reader for AC-6.
- **Traps for Phases B and C.** AC-6 scans `src/`, tests included. So the AC-28 source test assembles the
  constant-time function's name from parts, and the AC-10 spy uses `vi.doMock` with the library name assembled
  from parts. Neither the current `hashing-boundary.test.ts` nor a stricter detector sees a test importing or
  calling them.
- **Nothing logs.** Nothing in Phase A logs, and no error message carries a value.
- **Cost.** `password.test.ts` takes about 4 s: bcrypt at cost 10 in pure JS.
- **Before my session.** `progress/impl_pin_auth.md` had a one-line change that isn't mine (a path escape fixed in
  the Phase 0 gate note). I only appended this section.

## Phase B

### Work log

Finished and verified steps only, in the order they were done.

1. **Schema (AC-1).** `prisma/schema.prisma`: `User` reshaped to the eleven scalar fields in
   Part 3's order; `ProfileStatus`, `AuthEventKind`, `AccountLock`, `AuthEvent`, `SetupClaim`
   added. `npx prisma validate` valid; `prisma format --check` clean; `prisma generate` ok.
   `specs/domain-model.md` Part 3 updated and names #21. `schema-and-migration.test.ts` (census
   twelve/five, field and relation lists, the two User tests, 004 AC-23's census re-spelled as
   #4's own claim through `filesTouchedBy(4, …)`) and `project-contract.test.ts` (twelve/five):
   35/35 green.
2. **Migration (AC-2).** `prisma/migrations/20260925120000_pin_profiles/migration.sql`,
   hand-ordered: enums, `status` added and backfilled from `active` before `active` is dropped,
   the four credential columns and `sessionEpoch` added (none set), `email`'s index and
   `email`/`passwordHash`/`active` dropped, three tables, indexes, the `SetupClaim` foreign
   key, the ten CHECKs. No `INSERT`. Applied first to the test database (through
   `npm run test:db`), then to the development database with `npx prisma migrate deploy`.
   Development database, counted by a scratch script that prints counts only:

   | | before | after |
   |---|---|---|
   | `User` rows | 33 | 33 |
   | `active = true` / `status = ACTIVE` | 33 | 33 |
   | `role = ADMIN` | 8 | 8 |
   | Item / ItemType / Supplier / ItemPrice / ItemLocation | 140 / 19 / 10 / 129 / 152 | 140 / 19 / 10 / 129 / 152 |
   | Location / StockCount / StockCountLine | 2 / 0 / 0 | 2 / 0 / 0 |
   | AccountLock / AuthEvent / SetupClaim | — | 0 / 0 / 0 |

   `prisma migrate status`: "Database schema is up to date!"; `_prisma_migrations` lists the
   three, each finished and not rolled back. **The leftover e2e users are 33, not 4:** all 33
   carry the e2e email domain, 8 are `ADMIN`, all were active. After the migration every one
   is `ACTIVE` with no username, no PIN and epoch 0, so none can sign in. None was deleted.
   Because 8 `ADMIN` rows exist, `/setup` is unavailable on the development database (S9).
3. **Truncate list (AC-4).** `TRUNCATED_TABLES` gains `AccountLock`, `AuthEvent`,
   `SetupClaim`; `test-db.test.ts`'s 020 AC-2 set assertion is the eleven; stock-takes'
   "TRUNCATED_TABLES still holds exactly its eight entries" is now
   `filesTouchedBy(10, ["prisma", "src/server/test-db.ts"])` empty (title kept). Rows 5 and 13
   were Phase 0's. `scripts/run-db-tests.mjs` gives its children a `PIN_PEPPER` and a
   `SETUP_CODE` generated per run. Unit: stock-takes 29/29, count-entry green;
   `test-db.test.ts` red on exactly one test, **Finding B1** below.
   *Resolved:* B1 was ruled (020 AC-6 amended by 021 AC-1), and the amended test is green. See *Continuation* → work log 1.

4. **Services, Auth.js, screens, every `email` reference in `src/` (compiles).**
   `sign-in-service.ts` (`attemptSignIn`, the eight steps), `operator-service.ts`
   (`createActiveProfile` only), `profile-admin-service.ts` (`ProfileListEntry` and
   `resetProfilePin` only), `sign-in-codes.ts`, `profile-status.ts`; `user-service.ts` keeps
   `findActiveUserById` (now also compares the epoch) and `listUsers`, adds
   `landingPathForUsername`, and loses the four removed functions; `SessionUser` is
   `{ id, username, name, role }`; the JWT carries `epoch`; `authorize` calls `attemptSignIn`
   only and sets `macroads-device`; `/sign-in` with `PinPad`; `IdentityHeader` on
   `/stock-entry`, `/stock-takes`, `/analysis`; `counting-as` shows the name only; audit lines
   carry `actorRef` = username. `password.ts` lost `hashPassword`/`verifyPassword`;
   `auth-messages.ts` lost the two email-era messages. `scripts/admin-create.ts`, its npm
   entry and the three superseded db test files were deleted. Unit and db test fixtures
   changed in how they build a `SessionUser`/`User` only. `tsc` over `src/`, `tests/unit`,
   `tests/support`: 0 errors; `eslint src tests/unit tests/support`: 0.
   `npm run test:unit`: 63 files, 3 failing tests, exactly: 020 AC-6 (Finding B1), and the
   two tests that read the reset script, which is Phase C's (Finding B4).
   *Resolved:* all three are green now. `npm run test:unit` is 66 files and 950 tests, none failing. See *Continuation* → work log 1, 4 and 5.

5. **Database tests.** New: `pin-schema.db.test.ts` (AC-3, 30 tests), `sign-in-service.db.test.ts`
   (AC-10 including the trivial-PIN ruling, AC-12 including 20 concurrent attempts, AC-14 including
   20 concurrent new-device attempts and retention, AC-32 sign-in half, AC-33 sign-in half; 14
   tests), `pin-session.db.test.ts` (AC-17 and AC-24 service halves, and `resetProfilePin`'s
   guards; 10 tests). Fixture-only edits elsewhere, plus `epoch: 0` in two stubbed sessions
   (`route.db.test.ts`, `count-lifecycle-service.db.test.ts`). The database halves of 004 AC-1
   (twelve tables), AC-5 (User's columns) and AC-19 (twelve foreign keys, `SetupClaim.userId`
   RESTRICT) were amended as Part 3 assertions (see B2). First full `npm run test:db`: 22 files,
   4 failing; after the fixes, the four affected files plus `pin-session` rerun: 5 files, 1
   failing test, exactly 004 AC-24's migration count (Finding B2).
   *Resolved:* 004 AC-24 is re-spelled per the B2 ruling, and `columns.db.test.ts` is 19/19. See *Continuation* → work log 2.
6. **Unit contract scans.** `tests/unit/pin-auth-contract.test.ts` (19 tests): AC-2's SQL text and
   its one-directory claim through `filesTouchedBy(21, …)`, AC-6's `process.env` readers, AC-8,
   AC-31, AC-37's retired test id (built from parts) and AC-39's literal scan. 19/19 green.
   `hashing-boundary.test.ts` amended per AC-6. The six criteria of 007, 010 and 011 that quoted
   the email now say name and the new test id (AC-37).
7. **e2e written.** `support/users.ts` per AC-40 (`TestUser = { id, username, name, pin, role }`,
   `createTestUser` through `createActiveProfile`, `signIn` adds a fresh known-device cookie,
   `enterCredentials`, `removeUser`/`deactivate`/`storedPinHash`, a `PIN_PEPPER is not set` skip);
   `support/stock-entry.ts` `actorFor` builds `{ id, username, name, role }`; `support/analysis.ts`
   and `support/item-master.ts` fixtures follow. Eighteen specs changed by the four substitutions
   only. `sign-in.spec.ts` rewritten (AC-9, AC-10, AC-12, AC-15, AC-17, AC-36, plus 003 AC-11 as
   amended and 003 AC-21). `route-protection.spec.ts`'s 390 px test replaced by AC-35's `/sign-in`
   half. New: `pin-device.spec.ts` (AC-16), `pin-boundary.spec.ts` (AC-33 response half, AC-34),
   `pin-header.spec.ts` (AC-37 on the three existing pages). `tsc` 0 errors over the whole
   project, `eslint src tests` 0, `npm run build` exit 0.

8. **AC-38.** `src/lib/count-audit-ref.test.ts` (2 tests, unit: a runtime username round-trips;
   an email line then a username line parse verbatim) and
   `src/server/auth/audit-username.db.test.ts` (the APPROVED line carries the approver's
   username; it lives under `auth/` because 007 AC-25's scan pins the exact files in the counts
   tree that may name the lifecycle calls). 009 AC-20's `count-audit.test.ts` changed only the
   field name in its calls.
9. **Security mutations**, each applied alone by `scratchpad/pb/mutate.py`, its db test run, then
   the file restored by byte copy and `sha256sum -c` passed for all three targets
   (`session.ts 2ffc86d8…`, `sign-in-service.ts 0c65587d…`, `profile-admin-service.ts ca572989…`):

   | # | Mutation | Red (and nothing else in the files run) |
   |---|---|---|
   | M1 | a staff session reaching money: `getCurrentUser` trusts the token's ADMIN role hint | 2 of 19: `pin-session` "the role in the token is never read"; `session.db` "AC-18: the role comes from the stored row" |
   | M2 | a wrong PIN signing in: an ACTIVE row signs in whatever bcrypt said | "AC-10: (a) to (e) … identical statement sequence" (1 of the 2 AC-10 tests run) |
   | M3 | a locked account evaluating a PIN: the lock check is skipped | all 3 AC-12 tests run |
   | M4 | a reset not ending sessions: `resetProfilePin` does not increment the epoch | 2 of 10: "after resetProfilePin the profile's existing session is refused"; "… and bumps the epoch" |

10. **First full `npm run test:e2e`** (both phases, one build): phase 1 **79 passed**, none
    skipped (so `PIN_PEPPER` is set in `.env`; its value was never read by me); phase 2 **132
    passed, 7 failed**. The seven are exactly Finding B3, each failing on a literal fixture name:
    `stock-entry-approve.spec.ts:208` (line 259) and `:347` (line 393),
    `stock-entry-start.spec.ts:92` (99), `:183` (209), `:265` (327), `:364` (381), and
    `stock-entry-submit.spec.ts:329` (344). Development database afterwards: `User` 33,
    `AccountLock` 0, no `pin:new-devices` event, and 5 `PIN_FAILURE` events in throwaway device
    buckets with no account key (AC-10 (f)'s malformed attempts), which I deleted; `sign-in.spec.ts`
    now removes its own (`forgetDevices`). After that run: `sign-in-codes.ts` gained an own-key
    check (a unit test found that `"toString"` rendered a function), and `page-guards.ts` a
    comment. The final e2e run below is after every edit.
    *Resolved:* no final e2e run was recorded before the session ended. After the fifth substitution, the three affected specs pass 26/26. See *Continuation* → work log 3.

11. **A full `test:db` attempt was abandoned, and it is recorded here.** After every edit I started
    the full suite. Four files in, the test branch stopped answering: `Can't reach database
    server`, `Server has closed the connection`, a pool timeout, then every hook in
    `count-entry-service.db.test.ts` timed out at 30 s (30 of 30, 930 s). All four files had
    passed in the earlier runs. I stopped the run (both node processes), then confirmed that the
    branch answered again (`session.db.test.ts` 9/9), and restarted the full suite.
   *Resolved:* the coordinator traced the collapsed runs to the network link, not the code: 428 of 432 on a quiet re-run (`progress/current.md` → *Coordinator — Phase B interrupted*).

### Findings: where the spec is wrong or conflicts with itself

Recorded as found. None was worked around.

- **B1. 020 AC-6's schema-text test cannot hold under AC-1.** `src/server/test-db.test.ts` →
  "AC-6: prisma/schema.prisma declares nine ids, every one of them @default(cuid())". AC-1
  mandates `AccountLock.accountKey String @id` and `SetupClaim.id Int @id`, neither a cuid, so
  the schema now has twelve `@id` lines, two without `@default(cuid())`. No #21 criterion
  names this test, and 021 says a shipped assertion that turns red is a finding, not a licence
  to edit it, so it is **left red**. What 020 AC-6 protects still holds: no id is
  `autoincrement`, and the database half (no sequence in `pg_class`) is unaffected, because an
  `Int @id` with no default creates no sequence. A ruling is needed: amend 020 AC-6's unit half
  to "no id is autoincrement, and every `@id` is either `@default(cuid())` or
  application-supplied with no default", or something else.
  *Resolved:* ruled B1. The unit half now asserts twelve `@id`s: ten cuids, and exactly those two with no `@default`. See *Continuation* → work log 1.
- **B2. 004 AC-24's database census of migrations cannot hold under AC-2.**
  `src/server/schema/columns.db.test.ts` → "AC-24: both migrations are applied, in order,
  and none was rolled back" asserts `_prisma_migrations` has exactly two rows. AC-2's
  migration makes three. 021's *Resolved* section re-spelled 004 AC-23's unit census (the
  directory count) as #4's own claim, but not this database twin of it, and no criterion
  names it, so it is **left red**. It needs the same treatment (the first two rows are
  `create_user` then `create_stock_domain`, finished and not rolled back, whatever follows).
  By contrast I **did** amend the same file's "AC-1: … exactly the nine tables of Part 3" and
  "AC-5: User still has the same eight columns …": those are the database halves of 004 AC-1
  and AC-5, which 021 AC-1 amends ("the shipped assertions of Part 3 are amended to match").
  I also amended `referential.db.test.ts`'s 004 AC-19 foreign-key census (eleven → twelve,
  `SetupClaim.userId` RESTRICT) on the same reading. That is my reading of AC-1; if the
  coordinator reads AC-1's list as exhaustive, those three edits are also findings.
  *Resolved:* ruled B2. AC-24 is re-spelled with no row count, and the three census amendments are confirmed: AC-1 now names them. See *Continuation* → work log 2.
- **B3. AC-40's display name for test profiles contradicts eleven shipped e2e expectations.**
  AC-40 makes `createTestUser` name a profile `<label>-<16 hex>`. The old helper named every
  profile `E2E Yard Staff` or `E2E Administrator`, and eleven shipped `expect(` lines quote
  those names as literals: `stock-entry-start.spec.ts:99, 209, 327, 336, 382`,
  `stock-entry-approve.spec.ts:260, 263, 297 (an `actorName` in an expected audit line),
  301, 394`, `stock-entry-submit.spec.ts:343`. None of AC-40's four substitutions turns a
  literal name into `user.name`, so they are **left unchanged**; none of them can match a
  `<label>-<16 hex>` name. A fifth
  substitution would fix it: "a string literal equal to the old fixture name → the test
  profile's `name`". I implemented AC-40's naming as written.
  *Resolved:* ruled B3. AC-40's fifth substitution is applied at the eleven sites. See *Continuation* → work log 3.
- **B4. Deleting `scripts/admin-create.ts` is forced in Phase B; its replacement is Phase
  C's.** The script imports `createUser`, which AC-43's table removes, so it no longer
  compiles once the schema changes. Two shipped unit tests read it:
  `hashing-boundary.test.ts` (amended here per AC-6 to name `scripts/pin-reset.ts`) and
  `no-default-password.test.ts` → "AC-7: the script has no fallback value to guess" (AC-41,
  left unamended). Both are **red until Phase C writes `scripts/pin-reset.ts`** (AC-30) and
  AC-41. Not a spec defect; a consequence of the phase split. I did not pull AC-30 forward,
  because the brief gives it to C.
  *Resolved:* ruled B4. AC-30 and the Phase B part of AC-41 moved into Phase B, and both are done. See *Continuation* → work log 4 and 5.
- **B5. AC-40's diff rule and the new `pin-*.spec.ts` files.** AC-40 says that outside five named
  files "no `test(` title … is added". The criteria's own preamble puts browser criteria in new
  `tests/e2e/pin-*.spec.ts` files, which necessarily add titles. I read the rule as governing the
  shipped specs and added three new files; the diff evidence below lists them separately.
  *Resolved:* ruled B5, reading confirmed. The diff evidence is in *Continuation* → *AC-40 diff evidence*.

### Scope and status

**Status: complete for the implementer, with the findings above left for a ruling.** Phase B is
the swap: schema, migration, the sign-in service and Auth.js, `/sign-in` with `PinPad`, one
`IdentityHeader`, every `email` reference in `src/`, the e2e helpers and substitutions.
`feature_list.json` is unchanged (#21 stays `in_progress`). I ran no `init`.
*Resolved:* the findings are ruled, and the work each ruling asks for is in *Continuation*.

Built early because a Phase B criterion needs them: `profile-admin-service.ts` holds only
`ProfileListEntry` and `resetProfilePin` (AC-17, AC-24); `operator-service.ts` holds only
`createActiveProfile` (AC-40's fixtures). **Left to Phase C:** the other nine admin functions,
`listProfilesForOperator` and `setCredentialsForOperator`, `requestProfile`, `setup-service`,
the `/sign-in/create`, `/sign-in/requested`, `/setup` and `/profiles` pages (the `/sign-in`
page already links to `/sign-in/create`, which is a 404 until then), `PROTECTED_PATHS` and the
matcher gaining `/profiles`, `scripts/pin-reset.ts` and `pin:reset`, `docs/operations.md` and
`.env.example` (AC-41; `.env.example` is outside my permissions, so I could not read it).
*Resolved:* under the B4 ruling, the two operator functions, `scripts/pin-reset.ts`, `pin:reset` and `docs/operations.md`'s migrated-profile, lockout and lost-pepper sections are now Phase B's, and are done. `.env.example` and the `/setup` paragraph stay in Phase C.

### Files created
- `prisma/migrations/20260925120000_pin_profiles/migration.sql`: the one migration (AC-2).
- `src/server/auth/sign-in-service.ts`: `attemptSignIn`, the eight steps.
- `src/server/auth/operator-service.ts`: `createActiveProfile` (fixtures; Phase C adds the rest).
- `src/server/auth/profile-admin-service.ts`: `ProfileListEntry`, `AccountLockView`, `resetProfilePin`.
- `src/server/auth/sign-in-codes.ts`: the device cookie's name, and the four refusal codes mapped to messages.
- `src/server/auth/profile-status.ts`: the `ProfileStatus` union, so only `db.ts` imports `@prisma/client`.
- `src/components/PinPad.tsx`: the keypad (client).
- `src/components/IdentityHeader.tsx`: display name, sign-out, optional links.
- Tests: `src/server/auth/pin-schema.db.test.ts` (AC-3), `sign-in-service.db.test.ts`,
  `pin-session.db.test.ts`, `audit-username.db.test.ts`, `sign-in-codes.test.ts`;
  `src/lib/count-audit-ref.test.ts`; `tests/unit/pin-auth-contract.test.ts`.
- `tests/e2e/pin-device.spec.ts` (AC-16), `pin-boundary.spec.ts` (AC-33, AC-34), `pin-header.spec.ts` (AC-37).

### Files modified
- `prisma/schema.prisma`, `specs/domain-model.md` Part 3: AC-1.
- `src/server/test-db.ts`: `TRUNCATED_TABLES` is eleven (AC-4).
- `scripts/run-db-tests.mjs`: a runtime `PIN_PEPPER` and `SETUP_CODE` per run.
- `package.json`: `admin:create` removed (B4).
- `src/server/auth/`: `user-service.ts`, `session-user.ts`, `session.ts` (epoch), `next-auth.ts`
  (username and PIN provider, device cookie), `password.ts` (password functions removed).
- `src/lib/auth-config.ts` (epoch in the JWT and the session), `src/types/next-auth.d.ts`.
- `src/app/sign-in/page.tsx`, `form-state.ts`, `src/app/auth-actions.ts`, `src/components/SignInForm.tsx`.
- `src/app/stock-entry/page.tsx`, `stock-takes/page.tsx`, `analysis/page.tsx` (the header),
  `stock-entry/new/page.tsx` (`counting-as` shows the name only), `page-guards.ts` (comment).
- `src/app/api/session/route.ts` (`username`); `/api/users` follows `listUsers`.
- `src/lib/count-audit.ts`, `src/types/stock-count.ts`, `src/server/counts/count-lifecycle-service.ts`: `actorRef`.
- `src/lib/auth-messages.ts`: the two email-era messages removed.
- Specs 007, 010, 011: the six criteria AC-37 names.
- Tests: the shipped unit and db tests listed in the work log (fixture-only, plus the amendments
  AC-1, AC-4, AC-6, AC-37 and AC-38 name); the e2e helpers and specs (AC-40).
- Deleted: `scripts/admin-create.ts`, `src/server/auth/admin-create.db.test.ts`,
  `user-service.db.test.ts`, `credentials-logging.db.test.ts` (AC-43's table).

### Acceptance criteria
| AC | Where it is satisfied | Test that proves it | Phase |
|----|----|----|----|
| AC-1 | `schema.prisma`, Part 3 | `schema-and-migration.test.ts`, `project-contract.test.ts`; db halves in `columns.db.test.ts`, `referential.db.test.ts` | B |
| AC-2 | the migration; applied to the development database (work log 2) | `pin-auth-contract.test.ts` "021 AC-2" (6); `schema-and-migration` 004 AC-23 re-spelled | B |
| AC-3 | the ten CHECKs, the unique index, the FK | `pin-schema.db.test.ts` (30) | B |
| AC-4 | `TRUNCATED_TABLES` | `test-db.test.ts` AC-2; `test-db.db.test.ts` AC-4 unmodified; stock-takes AC-22 re-spelled | B |
| AC-5, AC-7, AC-11, AC-13 | Phase A | Phase A | A |
| AC-6 | `password.ts` alone | `hashing-boundary.test.ts` (amended); `pin-auth-contract` AC-6 | B (the script check waits for C: B4) |
| AC-8 | no literal PIN or code anywhere | `pin-auth-contract` AC-8 (3) | B scan; the empty-database half is the gate's |
| AC-9 | `/sign-in`, `authorize`, `/api/session` | `sign-in.spec.ts` AC-9 (5); `session.db.test.ts` | B |
| AC-10 | `sign-in-service.ts` steps 3 to 8 | `sign-in-service.db.test.ts` AC-10 (2); `sign-in.spec.ts` AC-10 | B |
| AC-12 | step 4 | `sign-in-service.db.test.ts` AC-12 (3); `sign-in.spec.ts` AC-12 | B |
| AC-14 | step 2, retention | `sign-in-service.db.test.ts` AC-14 (6) | B |
| AC-15 | `authorize` is the one evaluation | `sign-in.spec.ts` AC-15 | B |
| AC-16 | `next-auth.ts` sets the cookie | `pin-device.spec.ts` (5); token half in Phase A | B |
| AC-17 | `session.ts` epoch, `resetProfilePin` | `pin-session.db.test.ts` (4); `sign-in.spec.ts` AC-17 (3) | B |
| AC-18 to AC-21, AC-25 to AC-30 | none yet | none yet | C |
| AC-22 | `resetProfilePin`'s guard only | `pin-session.db.test.ts` "AC-22, for this function" | C (the rest) |
| AC-23 | next-request deactivation only | `sign-in.spec.ts` "003 AC-11, amended by 021 AC-17" | C (the service) |
| AC-24 | `resetProfilePin` | `pin-session.db.test.ts` AC-24 (5) | B service half; C the `/profiles` rendering |
| AC-31 | imports, provider, `signIn(` | `pin-auth-contract` AC-31 (6) | B (see Deviation 1) |
| AC-32 | step 1 and step 7 | `sign-in-service.db.test.ts` AC-32 (2); `sign-in-codes.test.ts` | B; C `requestProfile`, `setupAvailable`, `/profiles` |
| AC-33 | nothing logged; `/api/users` shape | `sign-in-service.db.test.ts` AC-33; `pin-boundary.spec.ts` AC-33 | B; C the setup, request, approval and creation logs |
| AC-34 | `requireRole`/`shapeForRole` untouched | `pin-boundary.spec.ts` (3); `pin-session` deepKeys; mutation M1 | B; C the three new pages |
| AC-35 | `PinPad`, `SignInForm` | `route-protection.spec.ts` AC-35 (4) | B `/sign-in`; C the other three pages |
| AC-36 | `SignInForm` | `sign-in.spec.ts` AC-36 | B `/sign-in`; C `/sign-in/create` |
| AC-37 | `IdentityHeader` | `pin-header.spec.ts` (4); `pin-auth-contract` AC-37 | B; C `/profiles` |
| AC-38 | `count-audit.ts`, lifecycle | `count-audit-ref.test.ts` (2); `audit-username.db.test.ts`; `count-lifecycle` reopen line | B |
| AC-39 | module; the fourth substitution | `auth-messages.test.ts`; `pin-auth-contract` AC-39 | B |
| AC-40 | `support/users.ts`, specs | the diff evidence below | B (B3, B5) |
| AC-41 | none yet | none yet | C |
| AC-42, AC-43 | the gate | the gate | coordinator |

*Resolved:* AC-6's script check is green. AC-30 is now Phase B's and done. AC-40 is complete with the fifth substitution. AC-41's test and docs part is now Phase B's and done. See *Continuation* → *Acceptance criteria*.

### Deviations from the spec
1. **The one `signIn(` call passes `redirect: false`, not the redirect target.** The landing path
   depends on the role, which is known only after `authorize`. So the action calls
   `signIn("credentials", { username, pin, redirect: false })`. After a successful sign-in it
   redirects to the safe `callbackUrl`, or to `landingPathForUsername(username)`: one read of the
   role, after success, with no credential and no bcrypt. `authorize` still evaluates each
   attempt exactly once. The AC-31 scan asserts the keys are `{ username, pin, redirect }`.
2. **A refusal travels as a `CredentialsSignin` whose `code` names the outcome.** Auth.js rethrows
   it to the server action, which renders the matching message. The HTTP callback answers with
   Auth.js's usual redirect to `/sign-in?error=CredentialsSignin&code=<outcome>`. The page does
   not render from that query.
3. **Modules and exports beyond the table:** `sign-in-codes.ts`, `profile-status.ts`, and
   `user-service.ts`'s `landingPathForUsername`. `sign-in-service.ts` also exports `SignInOutcome`
   and `DeviceContext`.
4. **`resetProfilePin` on an `ACTIVE` profile with no username** (a row migrated from #3) raises
   `ConflictError(ONLY_ACTIVE_PIN_RESET)`. `User_pin_needs_username` forbids a PIN there, and only
   the operator's script can give such a row both. Phase C may want its own message.
5. **The e2e helpers do a little more than AC-40 lists.** `removeUser` also deletes the lock row
   and the events keyed by that username's account key. `deactivate` writes S14's shape directly,
   because `deactivateProfile` is Phase C's. `addKnownDevice` returns its bucket, and
   `forgetDevices` removes events that carry no account key. So a run leaves nothing behind.
6. **004's database censuses** (twelve tables, User's columns, twelve foreign keys) were amended
   under AC-1 (see B2).
   *Resolved:* confirmed by the B2 ruling. AC-1 now names all three.
7. `src/server/errors.test.ts` still uses `"email"` as an example `ValidationError` field. It is
   not an account reference, so I left it.

### Notes for the reviewer
- **No PIN, digest, hash, key or code is printed.** The census scripts printed counts only. I read
  no `.env` value. The one environment probe I tried was denied, and I did not retry it.
- **The first `test:db` run found that the stubbed sessions** in `route.db.test.ts` and
  `count-lifecycle-service.db.test.ts` carried no epoch. They now carry `epoch: 0`, a fixture
  change. That is AC-17's rule working: a token with no epoch is refused.
- **`sign-in-service.ts` holds the bucket's advisory lock and the account row lock across its one
  bcrypt.** That is what makes AC-12's and AC-14's concurrency hold. The transaction limits are
  60 s for that reason.
- **`/stock-entry/new`'s `counting-as` now wraps at any character too.** It is not one of AC-37's
  four pages, but an 80-character name would otherwise widen it.

### Continuation, after the rulings

Brief: the coordinator's scratchpad `impl21-b2.md`. It covers the five rulings in
`specs/features/021-pin_auth.md` → *Five findings by Phase B*. **Status: complete.** Nothing is
committed. `feature_list.json`, `Samples/`, `tests/support/feature-scope.ts` and `.env.example`
are untouched, and `.env.example` was not read. I ran no full `test:db`, no full `test:e2e` and no
`init`.

#### Work log

Finished and verified steps only, in the order they were done.

1. **B1: 020 AC-6's unit half, amended by 021 AC-1** (`src/server/test-db.test.ts`). The test
   is now titled "AC-6, amended by 021 AC-1: prisma/schema.prisma declares twelve ids, ten of
   them @default(cuid()) and exactly AccountLock.accountKey and SetupClaim.id with no
   @default". It walks `schema.prisma` model by model, so each `@id` line is named
   `Model.field`. It asserts:
   - twelve `@id`s;
   - ten carrying `@default(cuid())`;
   - no `@default` on exactly `["AccountLock.accountKey", "SetupClaim.id"]`, sorted.

   The separate "no id anywhere in the schema is an autoincrement" test is unchanged.

   Proved red on the real file, after a byte copy (`cp -p`) and with its sha256 recorded
   (`05da2fd10f9e5fe3…`):

   | Breach | Result |
   |---|---|
   | `SetupClaim.id Int @id @default(1)` | 1 of 8 red: `expected [ 'AccountLock.accountKey' ] to deeply equal [ 'AccountLock.accountKey', …(1) ]` |
   | `AccountLock.accountKey String @id @default(cuid())` | 1 of 8 red: the ten-cuid assertion, `to have a length of 10 but got 11` |

   After each breach I restored the byte copy, and `sha256sum -c` reported
   `prisma/schema.prisma: OK`. Green afterwards: 8/8.
2. **B2: 004 AC-24, re-spelled per 021 AC-2** (`src/server/schema/columns.db.test.ts`). The
   test is now titled "AC-24, amended by 021 AC-2: the first two migrations are create_user
   then create_stock_domain, and every migration is finished and none rolled back". Ordered by
   `started_at`:
   - `rows[0]` matches `/^\d{14}_create_user$/`;
   - `rows[1]` matches `/^\d{14}_create_stock_domain$/`;
   - every row is finished and none is rolled back.

   `toHaveLength(2)` is gone, and nothing replaced it.

   AC-2 also says "this criterion's own test pins the third row as `_pin_profiles`". No test
   did, so `src/server/auth/pin-schema.db.test.ts` gained one: "AC-2: ordered by started_at, the
   third _prisma_migrations row is <timestamp>_pin_profiles, finished and not rolled back".
   Runs: `columns.db.test.ts` 19/19 in 11 s; `pin-schema.db.test.ts` 31/31 in 13 s (the 30
   Phase B tests plus this one).
3. **B3: AC-40's fifth substitution, at the eleven named sites.** Each site's fixture-name
   literal became an interpolation of the named user's `name`, with the rest of the literal
   unchanged. A whole-literal name became `` `${user.name}` ``, which keeps the substitution
   mechanical. `grep "E2E Yard Staff\|E2E Administrator" tests/e2e` now finds nothing.

   | Site | Now reads | Why that user |
   |---|---|---|
   | `stock-entry-approve.spec.ts:260` `signedByMessage(…)` | `staff` | `submittedCount(staff, 2)` submitted and signed the count; `approved.signedById` is `staff.id` |
   | `stock-entry-approve.spec.ts:263` `approvedByMessage(…)` | `admin` | the page signed in as `admin` clicked approve; `approved.approvedById` is `admin.id` |
   | `stock-entry-approve.spec.ts:297` `actorName` in `auditSentence` | `admin` | the approver; the same call's `actorRef` is `admin.username` |
   | `stock-entry-approve.spec.ts:301` `"Approved by … on "` | `admin` | the same audit sentence's actor |
   | `stock-entry-approve.spec.ts:394` `reopenedNotice(…)` | `admin` | the AC-18 test reopens the count signed in as `admin` |
   | `stock-entry-start.spec.ts:99` `"Counting as …"` | `staff` | `counting-as` names the signed-in user, `staff` |
   | `stock-entry-start.spec.ts:209` `"Counting as …"` | `staff` | same: signed in as `staff`, who starts the count |
   | `stock-entry-start.spec.ts:327` `"Counting as …"` | `staff` | same: the row belongs to `staff` (`createdByIdOf` is `staff.id`) |
   | `stock-entry-start.spec.ts:336` `expect(body).not.toContain(…)` | `admin`, **still negative** | the forged ADMIN whose id the form carried; the staff page must not name him |
   | `stock-entry-start.spec.ts:382` `"…started by … on 10 June…"` | `staff` | `staff` started the draft earlier in the same test |
   | `stock-entry-submit.spec.ts:344` `"Signed by … on "` | `staff` | `submitAs(countId, staff)` signed it |

   `npm run build` exited 0 in 75 s, because the last build predated one Phase B edit (see the
   notes). Then I ran `npx playwright test` on the three files with
   `--project=chromium-stock-entry`, once, with nothing else running. It took 257 s: 105 passed,
   0 failed, 0 skipped. The config makes project `chromium` a dependency, so the 105 are 79 in
   `chromium` and 26 in `chromium-stock-entry`. The seven Phase B found red all pass:
   - `stock-entry-approve.spec.ts:208` and `:347`;
   - `stock-entry-start.spec.ts:92`, `:183`, `:265` and `:364`;
   - `stock-entry-submit.spec.ts:329`.

   The negative at `:336` sits in `:265`, which also passes. Port 3000 was free afterwards.
4. **AC-30, now Phase B's.**
   - `src/server/auth/operator-service.ts` gains the two functions the *Services* table names:
     - `listProfilesForOperator(now?)` gets the current key id first, so an unusable
       `PIN_PEPPER` fails before any row is read. It returns one `OperatorProfileLine` per
       profile, oldest first: `id`, `username`, `name`, `role`, `status`, `pinState` (`set`,
       `none` or `reset needed`) and `lockState` (`-` with no username, `not locked`, or
       `locked until <ISO>`).
     - `setCredentialsForOperator({ id, pin, username? })` parses the PIN, and the username if
       one is given, and hashes before the transaction. Inside it, the row is locked
       `FOR UPDATE`, and the function refuses, in this order: an unknown id (`NotFoundError`
       naming the id); a status other than `ACTIVE` (`ConflictError(ONLY_ACTIVE_PIN_RESET)`);
       a missing username for a profile that has none, or a given one for a profile that has
       one (`ValidationError("username", …)`); a taken username
       (`ConflictError(USERNAME_TAKEN_MESSAGE)`, with the unique index as the backstop).
       Otherwise it sets the username, if the profile had none, and the PIN and key id, and
       increments `sessionEpoch`. If the username has a lock row, it applies
       `applyOutcome(…, "CLEARED")`, which zeroes the count, ends the lock and keeps the level,
       as `resetProfilePin` does. It returns `{ id, username, name, role }`.
   - `scripts/pin-reset.ts` accepts exactly `--list` and `--profile <id>`. Anything else,
     `--create-admin` included, is refused with the usage lines and creates nothing. With
     `NEW_PIN` unset or empty it refuses before reading anything, and names `NEW_PIN`. It
     never prompts. A `ValidationError` prints as `NEW_PIN: <message>` or
     `NEW_USERNAME: <message>`. A conflict, not-found or pepper error prints its own message on
     its own line. Any other error prints its name and code only, never its message. It
     imports only `operator-service` and `errors`.
   - `package.json` gains `"pin:reset": "tsx scripts/pin-reset.ts"`, where `admin:create` was.
   - `src/server/auth/pin-reset.db.test.ts`: 21 tests. It spawns `npm run pin:reset --silent --
     …`, the pattern 003's `admin-create.db.test.ts` used. Every run goes through one helper,
     which counts how many forbidden values appear in stdout plus stderr and fails on any. The
     values are the `NEW_PIN` value, every `pinHash` and `pinKeyId` in the database before
     and after the run, the current key id, the account key of every stored username and of
     `NEW_USERNAME`, and every `AccountLock` key. It reports the count, never the value. Every
     refusal asserts a non-zero exit, its message, and an unchanged snapshot of every `User`
     and `AccountLock` row and of the `AuthEvent` count. The cases are:
     - `--list` over six profiles: active, locked, migrated, stale pepper, deactivated, and a
       pending request;
     - the migrated-profile repair;
     - the stale-pepper repair;
     - `NEW_PIN` unset, and empty;
     - a malformed `NEW_PIN` (five digits), and a trivial one (built by rule);
     - `NEW_USERNAME` missing, unwanted, malformed and taken;
     - `PENDING`, `REJECTED` and `DEACTIVATED` profiles;
     - an unknown id;
     - `PIN_PEPPER` unset, in both forms (see Deviation 1);
     - five other argument forms: `--create-admin`, none, `--profile` with no id, `--list`
       with `--profile`, and `--profile <id>` with `--create-admin`.

     First green run: 21/21 in 60 s.
   - **Breaches.** I byte-copied the script and the service and recorded their sha256
     (`pin-reset.ts 0f3f36e7…`, `operator-service.ts 2a102cb1…`). I applied each breach alone
     with `scratchpad/b2/mutate.py` and ran the file. Then I restored the byte copy, and
     `sha256sum -c` reported both files `OK` each time.

     | # | Breach | Red (nothing else in the file went red) |
     |---|---|---|
     | 1 | the script prints the `NEW_PIN` value after a successful repair | 2 of 21: both repair tests, "values printed that must never be … expected 1 to be +0" |
     | 2 | the service stops incrementing `sessionEpoch` | 2 of 21: both repair tests, `expected +0 to be 1` |
     | 3 | the script accepts `--create-admin` and creates an `ADMIN` through `createActiveProfile` | 1 of 21: `["--create-admin"]`, exit 0 (`expected +0 not to be +0`) |
     | 4 | the service drops its `ACTIVE` check | 3 of 21: `PENDING`, `REJECTED` and `DEACTIVATED`, `ONLY_ACTIVE_PIN_RESET` missing from stderr. The exit was still non-zero and no row changed, because the database's `CHECK`s (`User_pin_only_when_live`, `User_pending_shape`) refused the write. The message assertion caught the breach. |

     Final green run, after the last restore: 21/21 in 54 s.
   - `hashing-boundary.test.ts`'s script check ("the reset script reaches hashing through the
     service layer") is green.
5. **AC-41's Phase B part.**
   - `tests/unit/no-default-password.test.ts`:
     - The scan detects `NEW_PIN`, `PIN_PEPPER` and `SETUP_CODE`, alongside #3's
       `ADMIN_PASSWORD`, `DEFAULT_PASSWORD` and `SEED_PASSWORD`.
     - The documentation test requires `NEW_PIN=<choose-a-pin>` and
       `npm run pin:reset -- --profile <id>` in `docs/operations.md`.
     - "the script has no fallback value to guess" now reads `scripts/pin-reset.ts`, and
       requires `process.env.NEW_PIN ?? ""` and `NEW_PIN is not set` (see Deviation 5).
     - A new test proves the scan is not vacuous: a digit-first value, built at runtime, is
       caught under each of the three new names.
   - The wider scan found two existing assignments. I changed their shape, not what they do:
     - `scripts/run-db-tests.mjs` gave the pepper's key an inline `randomBytes(32)` call converted
       to base64, and gave the setup code's key the same. The detector captured the call's
       opening, up to the `32`, as a value. Each
       draw is now a zero-argument function, `runPepper()` and `runSetupCode()`, which the
       detector already reads as code. It is still drawn once per run and never printed.
     - `tests/unit/pin-auth-contract.test.ts:239`, the AC-8 non-vacuity sample
       was one template literal joining the variable's name, an equals sign and `${code}`. It is
       now built from parts with `.join("=")`. That is the file's own stated convention. It
       still asserts exactly one match.
       *(Reworded by the coordinator: these two sentences first quoted the old shapes verbatim,
       and the scan they describe then caught them in this file. The scan is right and is
       unchanged.)*
   - `docs/operations.md`: *Creating the first administrator*, which named `admin:create`, is
     replaced by *Profiles, usernames and PINs*. It contains:
     - the one-line marker "First-run setup: added with `/setup`.";
     - *The reset script*: both forms, and what each prints and refuses;
     - *One time, on a database migrated from #3*: `pin:reset -- --list`, then
       `NEW_USERNAME=<choose-a-username> NEW_PIN=<choose-a-pin> npm run pin:reset -- --profile <id>`;
     - *Lockout recovery*: S6's numbers, and a reset ends the lock but keeps the level;
     - *Recovery from a lost `PIN_PEPPER`*: S4's four steps, plus one sentence saying that
       until `/profiles` exists, the script is the way to reset every profile.

     It uses placeholders only. The `SETUP_CODE` paragraph stays for Phase C.
6. **AC-34's service-key check is complete and passes.** It is at
   `src/server/auth/pin-session.db.test.ts:114-115`, inside "AC-24: the new PIN has the chosen
   length…", and runs for both lengths:
   `expect(deepKeys({ profile: entry, newPin }).filter((key) => MONEY_KEY.test(key))).toEqual([])`.
   `MONEY_KEY` is AC-34's `/price|value|total|amount/i`. It is complete for Phase B's surface:
   - `profile-admin-service.ts` exports two types and one function that returns a value,
     `resetProfilePin`, and the check covers that function's whole return;
   - `deepKeys` recurses into `profile.lock`;
   - `setup-service.ts` does not exist yet, because it is Phase C's.

   Run: `pin-session.db.test.ts` 10/10 in 15 s.
7. **Final checks, after every edit:**
   - `npm run typecheck`: exit 0.
   - `npm run lint`: exit 0. `eslint scripts` is also clean.
   - `npm run test:unit`: 66 files, 950 tests, 0 failing.
   - `npx prisma validate`: valid.
   - `sha256sum -c` for `schema.prisma`, `pin-reset.ts` and `operator-service.ts`: all `OK`.
   - Database files, run one at a time with nothing else running: `pin-reset` 21/21,
     `columns` 19/19, `pin-schema` 31/31, `pin-session` 10/10. No run hit a connection error
     or a timeout, so none was repeated.

#### AC-40 diff evidence

**Base commit: `9bf1f82`**, #21's Phase 0 spec commit, where the Phase 0 worktree was cut.
- `git diff --quiet 5d28556 9bf1f82 -- tests/e2e` and `git diff --quiet 9bf1f82 HEAD -- tests/e2e`
  both exit 0.
- So for `tests/e2e`, `5d28556` (the last commit before #21's Phase 0), the base and `HEAD` (`1ac0045`) are identical.

Phase B is uncommitted, so the command compares the base with the working tree:
`git diff 9bf1f82 -- tests/e2e`. Once the phase is committed, `git diff 9bf1f82..HEAD -- tests/e2e`
shows the same diff.

`git diff --stat 9bf1f82 -- tests/e2e`:

```
 tests/e2e/analysis-access.spec.ts        |  13 +-
 tests/e2e/analysis-figures.spec.ts       |   8 +-
 tests/e2e/item-master-access.spec.ts     |  16 +-
 tests/e2e/item-master-items.spec.ts      |   8 +-
 tests/e2e/item-master-yards.spec.ts      |   6 +-
 tests/e2e/role-access.spec.ts            |  17 ++-
 tests/e2e/route-protection.spec.ts       | 118 +++++++++++----
 tests/e2e/sign-in.spec.ts                | 582 +++++++++++++++++++-------
 tests/e2e/stock-entry-access.spec.ts     |  20 +--
 tests/e2e/stock-entry-approve.spec.ts    |  18 +--
 tests/e2e/stock-entry-autosave.spec.ts   |   6 +-
 tests/e2e/stock-entry-calendar.spec.ts   |   8 +-
 tests/e2e/stock-entry-filters.spec.ts    |   6 +-
 tests/e2e/stock-entry-quantities.spec.ts |   6 +-
 tests/e2e/stock-entry-refusals.spec.ts   |   6 +-
 tests/e2e/stock-entry-signature.spec.ts  |   6 +-
 tests/e2e/stock-entry-start.spec.ts      |  18 +--
 tests/e2e/stock-entry-submit.spec.ts     |  11 +-
 tests/e2e/stock-takes-calendar.spec.ts   |  10 +-
 tests/e2e/stock-takes-count.spec.ts      |   8 +-
 tests/e2e/support/analysis.ts            |   2 +-
 tests/e2e/support/item-master.ts         |   5 +-
 tests/e2e/support/stock-entry.ts         |  18 +--
 tests/e2e/support/users.ts               | 137 ++++++++++++-----
 24 files changed, 764 insertions(+), 289 deletions(-)
```

The governed diff is every changed line outside the five exempt files, with leading indentation
collapsed and identical lines counted. It comes from
`git diff -U0 9bf1f82 -- tests/e2e ':!tests/e2e/support/users.ts' ':!tests/e2e/support/stock-entry.ts' ':!tests/e2e/sign-in.spec.ts' ':!tests/e2e/role-access.spec.ts' ':!tests/e2e/route-protection.spec.ts'`.
Each line is labelled with its substitution:

```
17 - for (const email of created.splice(0)) {        17 + for (const username of created.splice(0)) {      (1)
17 - created.push(user.email);                       17 + created.push(user.username);                     (1)
17 - await removeUser(email);                        17 + await removeUser(username);                      (1)
 3 - created.push(owner.email, approver.email);       3 + created.push(owner.username, approver.username); (1)
 3 - created.push(owner.email);                       3 + created.push(owner.username);                    (1)
 1 - created.push(staff.email);                       1 + created.push(staff.username);                    (1)
 1 - actorEmail: admin.email,                         1 + actorRef: admin.username,                        (1)
 1 - await expect(page.getByTestId("signed-in-email")).toHaveText(user.email);   -> signed-in-name / user.name   (2)
 1 - await expect(page.getByTestId("signed-in-email")).toHaveText(staff.email);  -> signed-in-name / staff.name  (2)
 1 - await expect(page.getByTestId("signed-in-email")).toHaveText(admin.email);  -> signed-in-name / admin.name  (2)
 1 - await expect(page.getByTestId("counting-as")).toContainText(staff.email);   -> staff.name                   (2)
 2 - await page.getByLabel("Email").fill(…); 2 - await page.getByLabel("Password").fill(…);
 2 - await page.getByTestId("sign-in-submit").click();   2 + await enterCredentials(page, staff|admin);        (3)
 2 - import { createTestUser, removeUser, signIn } …      2 + import { createTestUser, enterCredentials, removeUser, signIn } …  (3)
 4 - "You do not have access to that page.",             4 + ACCESS_DENIED_MESSAGE,                           (4)
                                                         4 + import { ACCESS_DENIED_MESSAGE } from "@/lib/auth-messages";  (4)
 1 - signedByMessage("E2E Yard Staff", signedAt),        1 + signedByMessage(`${staff.name}`, signedAt),      (5)
 1 - approvedByMessage("E2E Administrator", …),          1 + approvedByMessage(`${admin.name}`, …),           (5)
 1 - actorName: "E2E Administrator",                     1 + actorName: `${admin.name}`,                      (5)
 1 - ).toContain("Approved by E2E Administrator on ");   1 + ).toContain(`Approved by ${admin.name} on `);    (5)
 1 - reopenedNotice("E2E Administrator", …),             1 + reopenedNotice(`${admin.name}`, …),              (5)
 1 - …toContainText("Counting as E2E Yard Staff");       1 + …toContainText(`Counting as ${staff.name}`);     (5)
 2 - …toHaveText("Counting as E2E Yard Staff");          2 + …toHaveText(`Counting as ${staff.name}`);        (5)
 1 - expect(body).not.toContain("E2E Administrator");    1 + expect(body).not.toContain(`${admin.name}`);     (5, negative kept)
 1 - `…, started by E2E Yard Staff on 10 June …`,         1 + `…, started by ${staff.name} on 10 June …`,       (5)
 1 - …toContainText("Signed by E2E Yard Staff on ");     1 + …toContainText(`Signed by ${staff.name} on `);   (5)
 1 - export type Actor = { id: string; email: string; role: Role };   1 + … { id: string; username: string; name: string; role: Role };  (support/analysis.ts fixture type)
 1 - email: `count-…@macroads-e2e.invalid`,  1 - passwordHash: "fixture-not-a-hash",
                                              1 + status: "ACTIVE",  + two comment lines                          (support/item-master.ts fixture row)
 2 + (blank line after an import)
```

- No `test(` line is added, removed or altered in the governed files: counted with `grep`, the
  answer is 0.
- Every changed `expect(` line is one of substitutions (1) to (5).
- The only other changed lines are two fixture shapes in `support/analysis.ts` and
  `support/item-master.ts`, and neither is a `test(` or `expect(` line.
- In `route-protection.spec.ts`, the only changes are the imports and the 390 px test,
  replaced by AC-35's tests, which are exempt.
- **Listed separately (B5), new files:** `tests/e2e/pin-boundary.spec.ts`,
  `tests/e2e/pin-device.spec.ts` and `tests/e2e/pin-header.spec.ts`.

#### Files created
- `scripts/pin-reset.ts`: `npm run pin:reset`, `--list` and `--profile <id>`, no other form (AC-30).
- `src/server/auth/pin-reset.db.test.ts`: AC-30, 21 tests, with the scan for secrets in every run's output.

#### Files modified
- `src/server/test-db.test.ts`: 020 AC-6's unit half, amended by 021 AC-1 (B1).
- `src/server/schema/columns.db.test.ts`: 004 AC-24, re-spelled per 021 AC-2 (B2).
- `src/server/auth/pin-schema.db.test.ts`: plus "021 AC-2: the migration applied third is this feature's".
- `tests/e2e/stock-entry-approve.spec.ts`, `stock-entry-start.spec.ts`, `stock-entry-submit.spec.ts`:
  the fifth substitution at the eleven sites (B3).
- `src/server/auth/operator-service.ts`: plus `listProfilesForOperator`, `setCredentialsForOperator`
  and their types (AC-30).
- `package.json`: plus `pin:reset`.
- `tests/unit/no-default-password.test.ts`: amended per AC-41 (see step 5).
- `docs/operations.md`: *Creating the first administrator* replaced (AC-41, Phase B part).
- `scripts/run-db-tests.mjs`, `tests/unit/pin-auth-contract.test.ts`: the same values in a shape
  the widened detector reads as code (step 5).
- `progress/current.md`: plan and log for this continuation.

#### Acceptance criteria (this continuation)
| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 (020 AC-6's unit half) | `prisma/schema.prisma` | `test-db.test.ts` → "AC-6, amended by 021 AC-1: …" (red under both breaches) |
| AC-2 (004 AC-24, third row) | the migration | `columns.db.test.ts` → "AC-24, amended by 021 AC-2: …"; `pin-schema.db.test.ts` → "AC-2: … the third _prisma_migrations row is <timestamp>_pin_profiles …" |
| AC-6 (script half) | `scripts/pin-reset.ts` imports `operator-service` only | `hashing-boundary.test.ts` → "AC-5, amended by 021 AC-6: the reset script reaches hashing through the service layer" |
| AC-30 | `scripts/pin-reset.ts`; `operator-service.ts` `listProfilesForOperator`, `setCredentialsForOperator`; `package.json` | `pin-reset.db.test.ts` (21), red under all four breaches |
| AC-34 (service keys) | `profile-admin-service.ts` `resetProfilePin` | `pin-session.db.test.ts:114-115` in "AC-24: the new PIN has the chosen length…" |
| AC-40 | the eleven sites | the diff evidence above; the three specs green in `chromium-stock-entry` (26/26) |
| AC-41 (Phase B part) | `docs/operations.md`; `no-default-password.test.ts` | `no-default-password.test.ts` (4 tests); `npm run test:unit` green. `.env.example` and the `/setup` paragraph are Phase C's. |

#### Verification output

```
$ npm run typecheck                  -> exit 0
$ npm run lint                       -> exit 0
$ npm run test:unit
 Test Files  66 passed (66)
      Tests  950 passed (950)
$ npx prisma validate
The schema at prisma\schema.prisma is valid
$ npm run test:db -- src/server/auth/pin-reset.db.test.ts     Tests  21 passed (21)   54 s
$ npm run test:db -- src/server/schema/columns.db.test.ts     Tests  19 passed (19)   11 s
$ npm run test:db -- src/server/auth/pin-schema.db.test.ts    Tests  31 passed (31)   13 s
$ npm run test:db -- src/server/auth/pin-session.db.test.ts   Tests  10 passed (10)   15 s
$ npx playwright test stock-entry-approve stock-entry-start stock-entry-submit --project=chromium-stock-entry
  105 passed (3.9m)          [79 chromium (config dependency) + 26 chromium-stock-entry]
$ sha256sum -c
prisma/schema.prisma: OK
scripts/pin-reset.ts: OK
src/server/auth/operator-service.ts: OK
```

No `init` was run: the coordinator runs the gate.

#### Deviations from the spec
1. **"`PIN_PEPPER` unset" is driven by an empty value in the test.** When the command imports
   Prisma's client, the client loads the project's `.env` into every variable the environment
   lacks and never overrides one that is present. I checked this in
   `node_modules/.prisma/client/index.js` (`schemaEnvPath: "../../../.env"`) and the runtime's
   `dotenv.config`. So deleting the variable from the child's environment would hand the
   command whatever `.env` holds, on a machine that has one. The test passes `PIN_PEPPER=""`
   instead. `password.ts` refuses unset and empty through one branch
   (`(process.env.PIN_PEPPER ?? "").trim() === ""`) with one message, "PIN_PEPPER is not set".
   I confirmed first that an empty variable survives `spawnSync(…, { shell: true })` through
   `node` and `npx tsx`, using a scratch probe on a dummy variable. The script's behaviour is
   what AC-30 asks. Only the way the test produces "unset" differs.
2. **Shapes the spec leaves open, chosen here.** These are the signatures of the two operator
   functions, plus the exported types `OperatorPinState`, `OperatorProfileLine` and
   `OperatorCredentialsInput`, and the lock-state words (`-`, `not locked`,
   `locked until <ISO>`). `--list` prints tab-separated fields with no header, so every line
   is a profile.
3. **Refusal texts.** A PIN or username `ValidationError` prints as `NEW_PIN: <message>` or
   `NEW_USERNAME: <message>`. That both names the variable and carries the matching message.
   A taken username prints a line equal to `USERNAME_TAKEN_MESSAGE(username)`. The missing
   and unwanted `NEW_USERNAME` messages are this module's own sentences, not
   `auth-messages.ts` constants, because no screen renders them.
4. **`setCredentialsForOperator` checks that the username is free before it writes.** It
   still maps a unique-index violation to `USERNAME_TAKEN_MESSAGE` for a race.
5. **`no-default-password.test.ts` amends a third test that AC-41 does not name.** The test
   "the script has no fallback value to guess" read the deleted `scripts/admin-create.ts`.
   Phase B's finding B4 names it as the test the reset script's arrival turns green. It now
   reads `scripts/pin-reset.ts`, and its title says "amended by 021 AC-30". I also added one
   non-vacuity test.
6. **Two files changed shape so the widened detector passes** (step 5). This is not a
   loosening: the detector's value rules are unchanged.

#### Notes for the reviewer
- **The detector has an inherited blind spot, left as it was.** 003's `isNotAPassword` accepts
  any value shaped like an identifier (`/^[A-Za-z_$][\w$.]*\(?$/`). The capture also consumes an
  opening quote, so a quoted value passes too: `NAME: "abc123"` is read as code. With the three
  new names, it catches:
  - every PIN, because a PIN begins with a digit;
  - every padded base64 pepper, because of the `=`, `+` or `/`.

  It misses a letters-first, purely alphanumeric setup code. The AC-8 setup-code scan in
  `pin-auth-contract.test.ts` has the same identifier exemption. I did not tighten either one.
  AC-41 names the variables to detect, not the value rule, and tightening it would re-open
  #3's accepted cases. It may deserve a ruling.
- **A `NEW_PIN` in `.env` would be used.** Prisma loads `.env` before `main()` reads `NEW_PIN`,
  so a value written there would act as a default. `pin-auth-contract.test.ts` AC-8 asserts
  that `.env.example` assigns no `NEW_PIN`. Nothing can assert the same of a developer's
  `.env`.
- **The build was rebuilt before the e2e signal.** `.next/BUILD_ID` (14:40:01) predated Phase
  B's last `sign-in-codes.ts` edit (14:40:20).
- **Server log lines during the e2e run.** 31 `auth.pin_failed bucket=device` lines all came in
  the `chromium` phase, before the first `chromium-stock-entry` test. They are
  `sign-in.spec.ts`'s deliberate failures from known devices. Two `Failed to find Server
  Action` lines appeared during the stock-entry phase. All tests passed, and I did not
  investigate those two lines.
- **The script reports an unexpected error by name and code only.** A database error's
  message can quote the query's arguments, which here include a hash.
- **Timing.** The `pin-reset.db.test.ts` file spawns `npm` 26 times and takes about 55 to 60 s.
  Each test makes one spawn, or two for the pepper case, and stays well under the 30 s limit.
