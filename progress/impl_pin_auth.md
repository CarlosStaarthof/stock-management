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
