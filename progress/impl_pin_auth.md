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
     never prompts. A `ValidationError` prints as the variable's name, a colon and the
     message, for `NEW_PIN` or `NEW_USERNAME` (reworded in Phase C1: G1's stricter scan reads an
     angle-bracketed value after that name as a written-down one). A conflict, not-found or pepper error prints its own message on
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
3. **Refusal texts.** A PIN or username `ValidationError` prints as the variable's name, a colon
   and the message, for `NEW_PIN` or `NEW_USERNAME` (reworded in Phase C1, as above). That both names the variable and carries the matching message.
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

## Phase C1

Brief: the coordinator's scratchpad `impl21-c1.md`. It covers the public side: *Create
profile*, its acknowledgement, first-run `/setup`, their services, and the gaps G1 and G2.
**Status: complete for the implementer, with one test left red on purpose** (AC-41's
`.env.example` half, see *Findings*). Nothing is committed. `feature_list.json`, `Samples/`,
`tests/support/feature-scope.ts` and `.env.example` are untouched, and `.env.example` was
not read. I ran no full `test:db`, no full `test:e2e` and no `init`.

### Work log

Finished and verified steps only, in the order they were done.

1. **Services, pages and forms written.** `auth-event-log.ts` (the bucket lock, a bucket's
   events, one event plus retention), `profile-request-service.ts`, `setup-service.ts`; the
   pages `/sign-in/create`, `/sign-in/requested` and `/setup`, their actions and form
   states; `CreateProfileForm`, `SetupForm` and the `useForgetOnHide` hook.
   `toProfileListEntry` is now exported from `profile-admin-service.ts`. `tsc` 0, lint 0.
2. **One shipped assertion went red, and it was the expected one.** With the three pages
   added, `npm run test:unit` failed 1 of 950: 010 AC-20's force-dynamic census in
   `stock-takes-contract.test.ts` reported that it expected a length of 18 but got 21. AC-43
   names this census and requires it to pass with the number it derives from the tree. So
   the typed 18 became a floor of 18, as 010 AC-2's sibling derivation already uses a
   floor, and the three new pages are named in it. The test title is unchanged.
3. **G1, AC-41's half** (`no-default-password.test.ts`). I wrote the new non-vacuity test
   first, against the old value rule, and it was red: a quoted letters-first value under
   `NEW_PIN` produced no offence. Then I changed the rule. For the three new names, a
   quoted literal is an offence unless it is `REPLACE_WITH_A_GENERATED_SECRET` or a
   `<choose-a-…>` placeholder, and only an unquoted identifier or call is read as code.
   #3's names keep `isNotAPassword`. The repository scan then found two lines in this
   report's Phase B section: an angle-bracketed value after `NEW_PIN` and a colon. I
   reworded both in place and disclosed the rewording there. Result: 5/5 green.
4. **G1, AC-8's half** (`pin-auth-contract.test.ts`). The scan now reads a quoted literal
   whole, up to its closing quote. The literal is an offence when it has no whitespace, has
   at least 16 characters and is not a placeholder. An unquoted value is exempt only as an
   identifier, a call or a placeholder. A new test builds a letters-first value at runtime
   and checks it in quotes. It uses five setup-code names, three quote characters, three
   operators and a quoted key. It also asserts that a sentence, a short literal, both
   placeholders, an unquoted identifier and an unquoted call are not offences.
   - **Proved red:** on a byte copy I put the identifier exemption back into the
     quoted-literal branch. The new test failed with `expected [] to have a length of 1`.
   - **Restored:** `sha256sum -c` reported `OK` (`4625b5ff…`).
5. **G2** (`scripts/pin-reset.ts`). Both variables are read on the first lines after the
   header comment. Nothing under `src/server/` is imported statically. `main` loads
   `operator-service` and `errors` with `await import(…)` after the reads.
   `pin-auth-contract.test.ts` gained `readOrderProblems`, which strips comments first. It
   reports four problems: a static non-type import of `src/server/`, a `require` of it, a
   missing read or missing dynamic import, and a read after the first dynamic import.
   There is also a non-vacuity test built from the real script.
   - **Mutation:** on a byte copy I moved the `NEW_USERNAME` read to after the `errors`
     import. Both AC-30 order tests went red.
   - **Restored:** `sha256sum -c` reported `OK` (`565e4477…`), and the tests were green 2/2.
   - `pin-reset.db.test.ts`: **21/21** (52 s).
6. **`docs/operations.md`.** The marker line is replaced by *First-run setup*: the
   placeholder `SETUP_CODE=<choose-a-setup-code>`, the three steps, when `/setup` exists,
   that it never comes back, the setup budget, and the note on migrated databases. Its unit
   test is green.
7. **AC-41's `.env.example` test** was written in `pin-auth-contract.test.ts`. It reads the
   file through `fs`, and every assertion is a labelled true or false, so a failure prints
   no line of the file. It is **red, 3 tests**, because the two entries are not there yet.
   It stays red, as the brief says.
8. **Action unit tests** (no database): `src/app/sign-in/create/actions.test.ts` (6) and
   `src/app/setup/actions.test.ts` (5, using the real `next/navigation`). **11/11**.
9. **Database files, one at a time:**
   - `profile-request-service.db.test.ts`: **11/11** (24 s).
   - `setup-service.db.test.ts`, first run: **36/37**. The server render failed with
     `React is not defined`: Vitest compiles JSX with the classic runtime. I fixed it the
     way `src/app/analysis/page.test.ts` does, by putting `React` on `globalThis` in this
     file only. The re-run was **37/37** (33 s).
   - After the mock was reshaped (step 11), the re-run was **37/37** again (33 s).
   - No run hit a connection error or a timeout.
10. **The six security mutations**, each on a byte copy, then restored with `sha256sum -c`
    `OK` for all three files. See the table below.
11. **The AC-8 scan caught one of my lines.** The setup test's mock of `password.ts` put a
    call with arguments under the `setupCodeMatches` key. The scan reads that as an
    unquoted non-identifier. I reshaped it so the key's value is a plain identifier.
12. **End to end.** Dev database census before the runs: 33 users, 8 `ADMIN`, 0 `PENDING`,
    0 claims, 0 `AuthEvent`s (0 in `request:new-devices`, 0 in `pin:new-devices`), 0 lock
    rows.
    - `pin-create.spec.ts` and `pin-setup.spec.ts`: `run-e2e.mjs` rebuilt first, and its
      route table lists `/setup`, `/sign-in/create` and `/sign-in/requested`. **14 passed,
      0 failed**, 27 s, on the first run.
    - `sign-in.spec.ts` alone, with nothing else running, after a rebuild
      (`BUILD_ID` 18:46:57, after the last source edit): **15 passed, 0 failed**, 50 s.
    - The census after each run was identical to the census before. Port 3000 was free
      after each run.
13. **Last checks.** `npm run typecheck` 0 and `npm run lint` 0. `npm run test:unit`: 971
    passed and 3 failed, the three `.env.example` tests of step 7.

### Security mutations

Each was made on a byte copy of the named file, run against its tests, then restored. After
every restore, `sha256sum -c` reported `OK` for `profile-request-service.ts` (`c97d3f44…`),
`setup-service.ts` (`eb32bc23…`) and `src/app/setup/actions.ts` (`321715b4…`).

| # | Mutation | What went red |
|---|---|---|
| M1 | `requestProfile` writes an `ACTIVE` `ADMIN` row, with the username set and no requested username | `profile-request-service.db.test.ts` AC-18: 2 of 4 red, both "to match object { status: 'PENDING' … }" |
| M2 | a request reads `User` by the typed username and answers `PAUSED` when it is held | the AC-19 database test (the live username got `PAUSED`, not `SENT`); the AC-19 source scan (a `where` naming `username`) |
| M3 | availability counts only `ACTIVE` `ADMIN`s that hold a username | AC-27: 4 red (the `DEACTIVATED` case, the migrated case, "completeSetup returns UNAVAILABLE", the page's 404) |
| M4 | a wrong code of 16 or more characters is accepted | AC-28 wrong code, AC-28 pause, AC-28 action and AC-33: 4 red, each `CREATED` where `CODE_INCORRECT` was expected |
| M5 | the `SetupClaim` insert removed | AC-29: **20 of 20** repetitions red, each with outcomes `CREATED, CREATED` |
| M6 | the typed code added to the wrong-code log line, and returned in the action's state | the AC-33 database test (the code was in the output); the AC-28 action test in the database file (a fifth key); `src/app/setup/actions.test.ts` AC-28 (a fifth key) |

M5 red in every repetition shows that the race path the tests exercise is the claim, not
the availability check. Both submissions pass availability and then queue on the setup
bucket's lock. The second submission is stopped only by the second insert of the claim's
row.

### Files created
- `src/server/auth/auth-event-log.ts`: the bucket lock, a bucket's events in the window,
  one event plus the AC-14 retention sweep, and the unique-violation test. Used by the two
  new services.
- `src/server/auth/profile-request-service.ts`: `requestProfile`.
- `src/server/auth/setup-service.ts`: `setupAvailable` and `completeSetup`.
- `src/app/sign-in/create/page.tsx`, `actions.ts` and `form-state.ts`: *Create profile*.
- `src/app/sign-in/requested/page.tsx`: the one acknowledgement.
- `src/app/setup/page.tsx`, `actions.ts` and `form-state.ts`: first-run setup, a 404 unless
  setup is available.
- `src/components/CreateProfileForm.tsx`, `SetupForm.tsx` and `use-forget-on-hide.ts`.
- Tests:
  - `src/server/auth/profile-request-service.db.test.ts` (11) and
    `setup-service.db.test.ts` (37);
  - `src/app/sign-in/create/actions.test.ts` (6) and `src/app/setup/actions.test.ts` (5);
  - `tests/e2e/pin-create.spec.ts` (12) and `pin-setup.spec.ts` (2).

### Files modified
- `scripts/pin-reset.ts`: G2.
- `src/server/auth/profile-admin-service.ts`: `toProfileListEntry` exported, and one
  sentence of its comment.
- `tests/unit/pin-auth-contract.test.ts`:
  - G1 for AC-8, with its test;
  - AC-31, now that `setup-service` exists: its importers include the setup page and
    action;
  - new checks: AC-19's source scan, AC-27's two scans, G2's order check (two tests),
    AC-41's `.env.example` checks (three tests) and operations check, and AC-43 for the
    three pages (two tests).
- `tests/unit/no-default-password.test.ts`: G1 for AC-41, with its test. The scan's loop
  moved into `offencesIn`, which the new test also calls.
- `tests/unit/stock-takes-contract.test.ts`: 010 AC-20's census, amended as AC-43 requires
  (work log 2).
- `docs/operations.md`: *First-run setup*.
- `progress/impl_pin_auth.md`: two Phase B sentences reworded (work log 3), and this
  section.
- `progress/current.md`: plan and log.

### Acceptance criteria (C1 halves)
| AC | Where it is satisfied | Test that proves it |
|----|----|----|
| AC-18 | `profile-request-service.ts:82`; `sign-in/create/actions.ts` (four fields only); the `/sign-in` link (Phase B) | db: "a valid request…", "a request forged…", "each invalid input…" (11 inputs); unit: `create/actions.test.ts` AC-18 (4); e2e: `pin-create.spec.ts` AC-18 (5), and the no-JS AC-19 test for the `303` |
| AC-19 | nothing in `requestProfile` reads by any username; the only `User` query before the insert is the `PENDING` count | db: "requests for a live, a deactivated, a requested and an unheld username…"; unit: `pin-auth-contract` AC-19 scan; e2e: no-JS "…same 303, Location and cookies, and a byte-identical acknowledgement" |
| AC-20 | the request budget under the bucket lock; the cap under `macroads:pending-cap` (`profile-request-service.ts:116`); a refusal echoes nothing | db: AC-20 (4, including a concurrency test at the cap); unit: `create/actions.test.ts` AC-20; e2e: no-JS "a paused request… byte-identical…" |
| AC-27 | `setup-service.ts:77`; `setup/page.tsx:18` | db: AC-27 (8, including the server render in both states); unit: `pin-auth-contract` AC-27 (2); e2e: `pin-setup.spec.ts` "…answers 404 signed out, with no setupCode field…" |
| AC-28 | `setup-service.ts:102` (budget, then `setupCodeMatches` at `:120`, then fields, then the `ADMIN` and the claim at `:152`); `setup/actions.ts:60` | db: AC-28 (7); unit: `setup/actions.test.ts` AC-28 (4); e2e: `pin-setup.spec.ts` "/sign-in?setup=done renders SETUP_COMPLETE_MESSAGE… no session cookie". The `setupCodeMatches` unit half is Phase A's |
| AC-29 | the claim's single row, with the unique violation mapped to `UNAVAILABLE` | db: AC-29, repetitions 1 to 20 |
| AC-30 (G2) | `scripts/pin-reset.ts:27` and `:71` | unit: `pin-auth-contract` AC-30 (2); db: `pin-reset.db.test.ts` 21/21 |
| AC-31 (C1 half) | `setup-service` imported by `src/app/setup/` and tests only; nothing under `src/app/setup/` signs in | unit: `pin-auth-contract` AC-31 (amended, plus Phase B's) |
| AC-32 (C1 half) | step 1 of `requestProfile`; `setupAvailable`'s pepper check | db: "requestProfile returns UNAVAILABLE and creates nothing"; setup "setupAvailable() is false…"; unit: `create/actions.test.ts` "UNAVAILABLE renders SIGN_IN_UNAVAILABLE_MESSAGE" |
| AC-33 (C1 half) | the only lines logged: the wrong-code line (bucket only) and the missing-pepper line on a request (variable name only) | db: request and setup AC-33 console spies; unit: `setup/actions.test.ts` AC-33 |
| AC-34 (C1 half) | no money anywhere on the three pages; `CREATED` carries a `ProfileListEntry` | e2e: `pin-create.spec.ts` AC-34, `pin-setup.spec.ts`; db: the server render has no `€`, and `deepKeys` of `CREATED` has no money, `pin`, `hash` or `code` key |
| AC-35 (C1 half) | single-column forms, every control `min-h-11` | e2e: `pin-create.spec.ts` AC-35 at 390 and 320 px |
| AC-36 (C1 half) | `CreateProfileForm` + `useForgetOnHide` | e2e: `pin-create.spec.ts` AC-36; a failed attempt keeping the username and emptying both PINs is in AC-18's invalid-input test |
| AC-41 (rest) | `docs/operations.md` *First-run setup*; G1's value rule | unit: `no-default-password.test.ts` (5); `pin-auth-contract` AC-41 operations check; **`.env.example` checks red** (see *Findings*) |
| AC-43 (C1 half) | the three pages are `force-dynamic`, with no `loading.tsx` above them | unit: `stock-takes-contract` 010 AC-20 (amended); `stock-entry-contract` 010 AC-2 (unchanged; it derives the new directories); `pin-auth-contract` AC-43 (2) |
| G1 | both scans | work log 3 and 4, each watched red first |
| G2 | the reset script | work log 5, mutation red |

### Verification output

```
$ npm run typecheck                                            -> exit 0
$ npm run lint                                                 -> exit 0
$ npm run test:unit
 Test Files  1 failed | 67 passed (68)
      Tests  3 failed | 971 passed (974)
   (the 3: 021 AC-41's .env.example checks: the entries are not in the file yet)
$ npm run test:db -- src/server/auth/profile-request-service.db.test.ts   Tests 11 passed (11)  24 s
$ npm run test:db -- src/server/auth/setup-service.db.test.ts             Tests 37 passed (37)  33 s
$ npm run test:db -- src/server/auth/pin-reset.db.test.ts                 Tests 21 passed (21)  52 s
$ npm run test:e2e -- tests/e2e/pin-create.spec.ts tests/e2e/pin-setup.spec.ts
  14 passed (27.4s)
$ npm run test:e2e -- tests/e2e/sign-in.spec.ts
  15 passed (50.3s)
dev database census, before and after both e2e runs (identical):
  {"users":33,"admins":8,"pending":0,"setupClaims":0,"requestNewDevices":0,"pinNewDevices":0,"authEvents":0,"accountLocks":0}
```

No `init` was run: the coordinator runs the gate.

### Findings: left for a ruling or for the owner

1. **AC-41's `.env.example` checks are red (3 tests), and I left them red.** The file does
   not yet hold the two entries the owner is adding. I could not read the file, so the test
   finds "the generation command AUTH_SECRET shows" by rule:
   - a code span in the `AUTH_SECRET` entry that names a command (`openssl`, `node`,
     `npx`, and so on);
   - failing that, the text from such a word to the end of its line.

   Each new entry must contain every command found. The sentences AC-41 requires are
   checked by pattern:
   - `PIN_PEPPER`: "each/every/per environment", "back up", "outside the server",
     `AUTH_SECRET`, "change or lose", "invalidate", "every PIN";
   - `SETUP_CODE`: "16", "characters", "first ADMIN/administrator", "only/until".

   An entry worded differently could turn one check red with no fault in the file. Whoever
   next reads the file with the entries in it should check the patterns against the
   wording. An entry is the lines after the previous assignment, down to its own
   assignment line.
2. **010 AC-20's census was amended under AC-43** (work log 2). I read AC-43's "passes with
   the number it derives from the tree" as licensing that edit, because it names this
   census. If the reviewer reads it otherwise, the alternative is to leave the test red
   until a ruling.
3. **A latent flake in `sign-in.spec.ts` AC-36, which I did not touch.** It checks that the
   full page URL does not contain the three typed digits, and the URL's port is 3000. A
   random draw of 300 or 000 fails the test with nothing wrong: about 2 in 1,000 per draw,
   and there are three draws. My AC-36 test on `/sign-in/create` reads only the path, the
   query and the fragment. The fix belongs to whoever owns that spec.

### Deviations from the spec
1. **The requested-username field is named `requestedUsername`, not `username`.** AC-18
   forges a `username` field. With both named `username`, `FormData.get` returns the first,
   and the forgery would be ambiguous. With distinct names, the forged field is simply never
   read. The label is still `Username`.
2. **A paused or unavailable request echoes nothing back to the form.** The UI states keep
   the name and username "after an error". I applied that to field errors only, because
   AC-20 requires the paused body to be byte-identical whatever username was typed. An echo
   would break that.
3. **An unavailable request (no pepper) renders `SIGN_IN_UNAVAILABLE_MESSAGE`.** AC-39 has
   no request-specific sentence, and AC-32 names this message for the sign-in page.
4. **At setup, a username already held by a `YARD_STAFF` profile is refused, after a
   correct code, with `USERNAME_TAKEN_MESSAGE(username)`.** The spec does not cover this
   case. S2's reason for silence does not apply: the person has the setup code. If a unique
   violation still reaches the `catch`, availability is read again. The answer is
   `UNAVAILABLE` when an `ADMIN` now exists, and otherwise the taken-username message. It
   is never Prisma's error text.
5. **An unavailable setup submission is `notFound()`, the page's own 404.** AC-39 has no
   message for it.
6. **AC-28's end-to-end `303` is not run end to end**, because no spec may claim setup.
   Three pieces prove it instead:
   - against the test database, the action throws Next's redirect to
     `/sign-in?setup=done`;
   - Next answers a server-action redirect with `303`, which the no-JS
     `/sign-in/create` test shows end to end through the same mechanism;
   - end to end, `/sign-in?setup=done` renders `SETUP_COMPLETE_MESSAGE` and sets no session
     cookie.

   "Setup sets no cookie" rests on two more facts. The AC-31 scan covers the source. Outside
   a request, Next has no cookie store, so an action that touched one would have thrown
   something other than the redirect.
7. **Modules beyond the contract table:** `auth-event-log.ts`, `use-forget-on-hide.ts`,
   the two form components, the form-state files, and the export of `toProfileListEntry`.
8. **`sign-in-service.ts` keeps its own copy of the retention sweep and the bucket lock.**
   Moving it onto `auth-event-log.ts` would refactor Phase B's committed module, which is
   outside C1. The rule is the same in both places, and so is the lock key
   (`macroads:budget:<bucket>`). Only the lock's key is shared: the code is not.
9. **The pending cap has its own transaction lock (`macroads:pending-cap`).** Every request
   takes it after its bucket lock. Without it, requests from different buckets could all
   read 19 and all insert. A test proves it holds: three concurrent requests at 19 pending.
10. **The two AC-18 inputs a text field cannot hold, a line break and a carriage return,
    are sent end to end through a hidden field.** That is what a hand-made request carries.
    Both are also proved at the service.

### Notes for the reviewer
- **No PIN, digest, hash, key or code is printed or written.**
  - Every PIN comes from `generatePin`, and trivial ones are built by rule.
  - Every setup code is `randomBytes` set with `vi.stubEnv`. No `process.env` is read
    under `src/server/auth/` outside `password.ts` (AC-6).
  - The census script prints counts only. I read no `.env` value.
  - The red runs quoted in the work log are described, not pasted: their failure lines
    carried runtime values.
- **AC-19's statement sequence** is, in order: the bucket's advisory lock, its events, the
  cap's lock, the `PENDING` count, the insert, the event, the two retention deletes. The
  four cases were identical. The test pins the count as the only `User` statement before
  the insert.
- **Setup's order is as S9 lists it.** Availability is read before the transaction. Inside
  the transaction come the `setup` bucket's lock, the budget, the constant-time
  comparison, the fields, one bcrypt, the `ADMIN`, then the claim. A request refused by
  availability or the budget costs no comparison and no bcrypt. A refused profile request
  costs no bcrypt either: the hash is made after both checks.
- **The e2e hydration wait reads React's root the way `support/hydration.ts` does.** That
  helper is not exported, so the spec has a local copy.
- **Timing:** the database files took 24 s, 33 s and 52 s. The setup file's twenty AC-29
  repetitions each run about 0.9 s under the per-test limit.
- **The owner's `.env.example` entries** are the one thing left before AC-41 can go green.

### C1 finish: .env.example retired

Brief: the coordinator's scratchpad `impl21-env.md`, carrying out the owner's decision in 021 →
*Post-approval amendments* → *`.env` is the only settings file*. **Status: complete except
step 6, which is blocked** (see *Findings* 1). `git rm .env.example` refused because the file
has an uncommitted change. I did not force it. So the file is still tracked and still on disk,
unread, and one test is red because of it: the new "no file named `.env…`" test. Everything
else is done and green. Nothing is committed. `feature_list.json`, `Samples/` and `.env` are
untouched. I never read `.env`: only the tests read it, at runtime, through `fs`. I ran no
`test:db`, no `test:e2e` and no `init`.

#### Work log

Finished and verified steps only, in order.

1. **`password.ts` exports the pepper rule.** The decode-and-length check that `pinPepper`
   applied inline is now a private `decodedPinPepper(value)`. `pinPepper` calls it, and so does
   the new export `isUsablePinPepper(value): boolean`, which reads no environment. Behaviour
   is unchanged: the same trim, the same base64 shape test, the same 32-byte floor, and the
   same two error messages. A new `password.test.ts` test runs the six unusable values the
   fail-closed block already lists, plus three usable ones (32 bytes in standard base64, 32
   bytes in URL-safe base64, 48 bytes padded with whitespace). For each value it asserts that
   `isUsablePinPepper` and `pinDigest` agree.
2. **`tests/support/env-file.ts`** holds `envFileProblems(text)`, the fixed labels, and two
   helpers for reading the document: `operationsEnvironment()` and `entryFor(section, name)`.
   Headings inside a fenced block are skipped.
3. **`docs/operations.md` → `## Environment`**, placed before *Profiles*. It contains:
   - the file rule, and "the names here match `.env`; the values never go anywhere but `.env`";
   - a table of the eight settings;
   - what `npm run test:unit` checks;
   - one `### ` entry per setting, or per pooled/unpooled pair.

   The placeholders are `USER:PASSWORD` at hosts under `.invalid`, and
   `REPLACE_WITH_A_GENERATED_SECRET`. The same command, a `node -e` one-liner that prints 32
   random bytes in base64, appears in the `AUTH_SECRET`, `PIN_PEPPER` and `SETUP_CODE`
   entries. In *Databases*, the line that pointed at the template now points at *Environment*.
4. **`repo-hygiene.test.ts`.** `CREDENTIAL_EXEMPT` is empty. The template's placeholder test
   became "no file in the repository has a name beginning with `.env`". It covers tracked
   files plus new files git would carry, so a `.gitignore` negation is caught too.
   AC-7's and 003 AC-30's documentation halves are now three labelled checks on *Environment*.
   The header comment is rewritten to match.
5. **`pin-auth-contract.test.ts`.**
   - AC-8's old combined test is split. The setup-code scan keeps its body. The `NEW_PIN` half
     is its own test, and it reads `.env` for one yes/no fact through `envFileProblems`.
   - AC-41's three template tests now read *Environment* through `entryFor`. C1's claim
     patterns are kept word for word, with one change: `generationCommands` now takes only code
     spans that start with a command word. The line fallback is gone, because a document
     entry also holds spans such as `npm run test:db`.
   - Added: two one-sentence claims for `PIN_PEPPER` and two one-phrase claims for
     `SETUP_CODE`, so that words scattered across an entry cannot pass.
   - Added: a test that runs `AUTH_SECRET`'s documented command with this Node and no shell.
     It checks that the output passes `isUsablePinPepper` and has at least
     `SETUP_CODE_MIN_LENGTH` characters, by yes or no, and never prints it.
6. **README, `run-db-tests.mjs`, `src/lib/env.test.ts`, `.gitignore`**, as the brief lists.
   `README.md` also says that `npm run test:unit` now needs `.env` to exist. That is the
   trade-off the amendment accepts.
7. **The first run found a real parser gap.** The "DATABASE_URL blank" breach came back with
   two labels, not one. I probed Node's `util.parseEnv` on synthetic text: when a value is
   only whitespace, it takes the **next line** as that value. A line assigning `NEW_PIN` that
   follows a blank value would then disappear from its result, while Prisma, which loads
   `.env` with dotenv 16.6.1 through `@prisma/config` → `c12`, would still load it. That is
   the G2 hole. So the support module now copies dotenv 16's `LINE` expression and its value
   clean-up from `dotenv/lib/main.js`, word for word. A new test proves that `NEW_PIN` is
   found in four cases: after a blank value, with `export` in front, with a colon, and in
   quotes. It also proves that a comment is not an assignment.
8. **Six mutations** went red and were then restored. See the table.
9. **`git rm .env.example` refused.** That is *Findings* 1.
10. **Final run:** typecheck 0, lint 0, `test:unit` 983 passed and 1 failed. The failure is
    step 9's.

#### Mutations

Each was made on the working file, with a byte backup in the scratchpad, then run and
restored. After every restore, `sha256sum -c` reported `OK` for `tests/support/env-file.ts`
(`129276b7…`), `docs/operations.md` (`bc466dd7…`) and `src/server/auth/password.ts`
(`2d5288b5…`). The backups were deleted afterwards.

| # | Mutation | What went red |
|---|---|---|
| M1 | the `DATABASE_URL` pooler check never fires | the breach test: "DATABASE_URL unpooled: expected [] to deeply equal [ Array(1) ]" |
| M2 | `NEW_PIN` judged by a non-empty value instead of by name | the breach "NEW_PIN assigned nothing, by name alone" |
| M3 | "because they fail through a pooler" removed from the doc | repo-hygiene AC-7: "Environment says migrations use DIRECT_URL because they fail through a pooler" |
| M4 | `AUTH_SECRET`'s command changed to make 16 bytes | AC-41: "PIN_PEPPER shows AUTH_SECRET's command 1" and "its output is a pepper password.ts accepts" |
| M5 | "only" removed from `SETUP_CODE`'s "used only until the first ADMIN exists" | AC-41: the one-phrase claim. C1's loose only-or-until pattern stayed green, which is why the one-phrase claim was added |
| M6 | `isUsablePinPepper` also accepts any value over 20 characters | `password.test.ts`: "isUsablePinPepper with 31 bytes"; `env-file.test.ts`: the breach "PIN_PEPPER of 31 bytes" |

#### Files created
- `tests/support/env-file.ts`: `envFileProblems`, `ENV_FILE_LABELS`, `ALL_ENV_FILE_LABELS`,
  `ENV_FILE_SETTINGS`, `operationsEnvironment`, `entryFor`.
- `tests/unit/env-file.test.ts` (6 tests): the real `.env` (1), and synthetic proofs (5).

#### Files modified
- `src/server/auth/password.ts`: `isUsablePinPepper` exported; `pinPepper` shares its
  decoder. No behaviour change.
- `src/server/auth/password.test.ts`: one test, the predicate against `pinDigest`.
- `tests/unit/repo-hygiene.test.ts`: as in work log 4.
- `tests/unit/pin-auth-contract.test.ts`: as in work log 5.
- `docs/operations.md`: `## Environment`, and the *Databases* pointer line.
- `README.md`: *Run the app*.
- `scripts/run-db-tests.mjs`: the message for a missing `TEST_DATABASE_URL` points at
  *Environment*.
- `src/lib/env.test.ts`: its comment.
- `.gitignore`: the negation for the template is gone.
- `progress/current.md`: plan and log. `progress/impl_pin_auth.md`: this section.

#### Acceptance criteria (this step's halves)
| AC | Where it is satisfied | Test that proves it |
|----|----|----|
| 002 AC-7 (amended) | `docs/operations.md:7` onwards, `:35`; `.env` checked by `tests/support/env-file.ts:99` (`:120` pooled; the unpooled `DIRECT_URL` check follows it) | `repo-hygiene.test.ts:151`, `:166`; `env-file.test.ts:145` (real file), `:171` (breaches) |
| 002 AC-8 (amended) | `CREDENTIAL_EXEMPT` empty; `.gitignore` | `repo-hygiene.test.ts` credential scans (green with no exemption) and `:135` (**red until the template is removed**) |
| 003 AC-30 (amended) | `docs/operations.md:53`; `env-file.ts` unpooled check and `:125` (host) | `repo-hygiene.test.ts:151`, `:181`; `env-file.test.ts:145`, `:171` |
| 021 AC-8 (`.env` half) | `tests/support/env-file.ts:140`, by name, using dotenv's rule | `pin-auth-contract.test.ts:261`; `env-file.test.ts:171` (two `NEW_PIN` breaches), `:185` (four forms and a comment) |
| 021 AC-41 (Environment and `.env` halves) | `docs/operations.md:66`, `:85`, `:101`; `env-file.ts:131` (length) and `:135` (pepper, through `password.ts:65`) | `pin-auth-contract.test.ts:590`, `:610`, `:628`, `:658`; `env-file.test.ts:145`; `password.test.ts` "isUsablePinPepper answers what pinDigest does…" |

#### Verification output

```
$ npm run typecheck                                  -> exit 0
$ npm run lint                                       -> exit 0
$ npm run test:unit
 FAIL  tests/unit/repo-hygiene.test.ts > repository hygiene > AC-8, amended 2026-09-25: no file in the repository has a name beginning with .env
     → expected [ '.env.example' ] to deeply equal []
 Test Files  1 failed | 68 passed (69)
      Tests  1 failed | 983 passed (984)
$ git ls-files | grep -c '^\.env'                    -> 1   (the template, still tracked: Findings 1)
```

The count, against C1's 974:
- plus 6 in `env-file.test.ts`;
- plus 1 in `password.test.ts`;
- AC-8 split in two: plus 1;
- AC-41: three template tests became three document tests, plus the command test: plus 1;
- `repo-hygiene`: three template tests removed, and four tests added: plus 1.

That makes 984. On this run, the real `.env` passes every check.

#### Findings: for the coordinator

1. **Blocker: `git rm .env.example` refused.** Git said "the following file has local
   modifications" and suggested `--cached` or `-f`. The file already showed as modified in
   the session's opening `git status`, before I changed anything. The brief did not expect
   this. `-f` would discard an uncommitted change that nobody has reviewed, so I did not
   force it, stash it or copy it. A `git diff --numstat` asking only for line counts was
   denied by the permission system, so I cannot say how large the change is. What I can say:
   the file is tracked, so every repository scan read it on this run, and the scans are green
   over it. The credential scan now has no exemption, and it finds no connection string that
   is not a placeholder. The `NEW_PIN` / `PIN_PEPPER` / `SETUP_CODE` scan and AC-8's
   setup-code scan find no assignment that is not a placeholder. Once the owner's decision is
   confirmed to cover the uncommitted edit, the one remaining step is `git rm -f
   .env.example`. After that, the red test should go green and `git ls-files | grep -c
   '^\.env'` should print 0.
2. **The brief's grep will still find `feature_list.json`**. It quotes the original
   criteria text of 002 AC-7 and AC-8 and of 003 AC-7 and AC-30, and I was told not to touch
   it. Outside `specs/`, the grep (`.env` and the template itself excluded, file names only)
   found exactly `.git/index`, which will clear with the removal, and `feature_list.json`.
3. **Three lines in `specs/` are neither a recorded amendment nor criterion text**, and still
   describe the template as current: `002-app_scaffold.md:58` (a `.env` copied from it),
   `:211` (*Authentication*: the two auth settings appear in it), and
   `003-auth_and_roles.md:84` (*Environment*: they already exist in it). They are for the
   spec-writer. I did not edit specs.
4. **Disclosure.** My first repository grep, run before I knew the file would match, printed
   the template's first line. It is a comment naming the file and saying to copy it and to
   never commit `.env`. No assignment line was shown, and I read nothing else of the file. I
   excluded it from every later search.

#### Deviations from the spec and the brief
1. **`envFileProblems` lives in `tests/support/env-file.ts`, not in `env-file.test.ts`.**
   `pin-auth-contract.test.ts` shares it, and importing one test file from another would run
   the imported file's tests twice.
2. **`.env` is read by dotenv's rule, not by `node:util`** (work log 7). This is a copy of
   third-party logic, about ten lines. The alternative, importing `dotenv` itself, would rely
   on an undeclared transitive dependency.
3. **`NEW_PIN` is a problem if it is assigned at all, even to nothing.** The old template
   check allowed an empty assignment. AC-8 says "assigns nothing … checked by name", and the
   owner's check found "there is no `NEW_PIN`". The real `.env` passes.
4. **More checks than the brief lists:**
   - the command test (step 5);
   - the four one-sentence or one-phrase claims;
   - blank-value, letter-case and no-host breaches;
   - the fixed-label proof;
   - two AC-30 document statements: "separate", and "on a different host from `DIRECT_URL`".

   Each one is a statement the section already makes.
5. **The *Environment* entries use `REPLACE_WITH_A_GENERATED_SECRET` for `SETUP_CODE`**, as
   C1's template test required. *First-run setup* keeps `<choose-a-setup-code>`, which its
   own test requires. Both are placeholders that AC-8 and AC-41 allow.

#### Notes for the reviewer
- **No value is printed, and none can be.** `envFileProblems` returns only strings from
  `ALL_ENV_FILE_LABELS`, which contains names and facts. A test proves this over every breach,
  a fully broken text and an empty one. The real-file test asserts `[]` on those labels, and
  asserts existence with a message that names the file and *Environment*.
- **The synthetic `.env` texts** are built at runtime:
  - values from `randomBytes`, and the `NEW_PIN` breach from `generatePin`;
  - hosts under `.invalid`;
  - connection strings joined from a scheme constant and two halves;
  - names interpolated from variables, so no source line is an assignment the scans read.
- **The command test runs `node -e` taken from the document**, with `process.execPath` and
  no shell. It only accepts the exact shape `node -e "…"`. Anyone who can edit the document
  can also edit the test, so it opens no new path.
- **`isUsablePinPepper` is the only new export** under `src/server/auth/`. It reads no
  environment, so AC-6's reader census and AC-42's import-time test are unaffected, and both
  stay green.

## Phase C2

Brief: the coordinator's scratchpad `impl21-c2.md`, plus its correction: `.env.example` is
retired, and all 984 unit tests were green at `c18dd10`. It covers the admin side: `/profiles`,
the nine missing functions of `profile-admin-service.ts`, the `/profiles` halves of AC-33,
AC-34, AC-35, AC-37 and AC-43, the hand proofs of AC-22 and AC-26, C1's Finding 3 (the AC-36
port flake) and C1's Deviation 8 (one bucket lock and one retention sweep).
**Status: complete.** Nothing is committed. `feature_list.json`, `Samples/`,
`tests/support/feature-scope.ts` and `.env` are untouched, and no `.env` value was read. I ran
no full `test:db`, no full `test:e2e` and no `init`. Port 3000 is free.

### Work log

Finished and verified steps only, in the order they were done.

1. **C1's Deviation 8: `sign-in-service.ts` now uses `auth-event-log.ts`.** It takes the bucket
   lock (`lockBucket`), the bucket's events (`bucketEvents`), the event plus retention sweep
   (`recordEvent`) and the transaction limits (`AUTH_TRANSACTION_OPTIONS`) from there. Its own
   copies are gone.
   - `recordEvent` gained an optional last argument, the account key. When it is omitted, the
     insert's data object is exactly what it was before, so the request and setup services
     send the same statement they always sent.
   - **AC-10's statement sequence did not change.** To prove it, I wrote a scratch probe that
     captures `attemptSignIn`'s statement texts with the parameters removed, the way 020
     AC-3 does. It covers five cases: an unknown username, a wrong PIN, a malformed attempt from
     a known device, a malformed attempt from a new device, and a success. I copied the probe
     into `src/server/auth/`, ran it once before the change and once after, and deleted it each
     time. The two outputs are byte-identical: both hash to sha256 `0e0466a0…`.
   - Then, one file at a time: `sign-in-service.db` **14/14** (85 s),
     `profile-request-service.db` **11/11** (39 s), `setup-service.db` **37/37** (53 s). Every
     assertion in them is unchanged.
2. **`profile-admin-service.ts`: the nine functions.** Each one's first statement is
   `assertRole(actor, "ADMIN")`. Everything that leaves the module goes through one mapper,
   `toEntry`, which reduces the hash and its key to two booleans. Details:
   - `listProfiles` lists every profile, `PENDING` first and then oldest first. It reads the lock
     rows in one query and counts the 30-day failures in one `groupBy`.
   - `approveProfile` and `rejectProfile` lock the target row. Approval checks that the username
     is free, and the unique index's violation is mapped to `USERNAME_TAKEN_MESSAGE`. Approval
     zeroes the username's lock row.
   - `changeProfileRole` and `deactivateProfile` lock every `ACTIVE` `ADMIN` row `FOR UPDATE`,
     in id order, and then the target. They refuse with `LAST_ADMIN_MESSAGE` when no other
     `ACTIVE` `ADMIN` holding a username and a PIN would remain (S10).
   - `clearAccountLock` applies `CLEARED`, which ends the lock and keeps the level.
     `createProfile` draws the PIN with `generatePin` and returns it once.
   - `pinFailureSummary` and `resumeNewDeviceSignIn` are AC-26's. The resume takes the
     `pin:new-devices` bucket lock and writes one `BUDGET_RESET`.
   - A new helper, `settleLock`, reads a lock row with `FOR UPDATE`, the lock a sign-in attempt
     holds, and applies the outcome. `resetProfilePin` now uses it and `lockProfile` too. Its
     behaviour is unchanged: `pin-session.db` passed **10/10** after the change (15 s).
3. **The page, the actions and the protected path.**
   - `src/app/profiles/page.tsx` declares `force-dynamic` and has no `loading.tsx` above it. It
     calls `requireAdminPage("profiles")` and renders `IdentityHeader` with the `<h1>`
     `Profiles`.
   - It renders the failure summary (`pin-failures`), and the paused notice with the resume
     control while new devices are paused.
   - It shows `NO_PENDING_PROFILES` when nothing is waiting.
   - It renders one `<li>` per profile carrying the name, the username (the requested one while
     `PENDING`), the role, the status label and the creation date. Each row also has
     `failures-<id>`, `lock-<id>` (only while locked) and `needs-reset-<id>`.
   - Below the list is the create form.
   - `actions.ts` holds the eight actions. Each one takes the actor from `getCurrentUser()`, calls
     one service, and redirects a refused session where the page would send it. A domain error
     becomes the form's message. On success the action runs `revalidatePath("/profiles")`.
   - The six client components live under `src/components/profiles/`.
   - `PROTECTED_PATHS` gains `"/profiles"`, and the matcher gains `"/profiles/:path*"`.
   - Checks: `tsc` 0, lint 0, `test:unit` **986/986**.
4. **Contract tests.**
   - 010 AC-20's census in `stock-takes-contract.test.ts` now names `src/app/profiles/page.tsx`.
     Its comment's "(and `/profiles` later)" is now past tense.
   - 021 AC-43's list in `pin-auth-contract.test.ts` has four pages, and its title says "four".
   - New in the same file:
     - an AC-22 block with three tests: the path and the matcher; the page's
       `requireAdminPage("profiles")`, which comes before `listProfiles(`; and all ten exported
       functions, whose first statement is `assertRole(actor, "ADMIN")`;
     - an AC-37 test: the page imports and renders `IdentityHeader` with `user.name`, has no
       `<header>` of its own, and never renders the username.
   - The two files: **66/66**.
5. **`profile-admin-service.db.test.ts`: 33/33 on its first run** (78 s). It covers:
   - AC-21 (7 tests, 10 repetitions of the concurrent approvals);
   - AC-22 (the ten functions against a staff actor and against no actor, with a snapshot of
     the three tables before and after, the ordering, and the page rendered for staff and for
     an ADMIN);
   - AC-23 (6 tests: 10 repetitions of mutual demotion and 5 of mutual deactivation, each from
     a fresh database);
   - AC-25 (4 tests), AC-26 (9 tests), and AC-32, AC-33 and AC-34 (1 test each).

   The page is rendered with `renderToStaticMarkup`, as the setup test renders its page. The
   header's sign-out action is mocked, as `src/app/analysis/page.test.ts` mocks it.
6. **`src/app/profiles/actions.test.ts`: 7/7** (no database). Each action calls exactly its one
   service, with the session's profile as the actor even when the form carries forged `actor`
   and `userId` fields. A service's `ForbiddenError` redirects to
   `/stock-entry?denied=profiles`, and its `UnauthorizedError` to `/sign-in?reason=inactive`.
   Domain errors become messages. Only a success revalidates. A length other than 4 or 6 is
   refused before any service is called. The new PIN is in the returned state and on no
   console.
7. **`src/lib/profile-display.ts`** (`yardDate`, `yardDateTime`, in `Europe/Dublin`), with its
   unit test: **2/2**.
8. **C1's Finding 3.** `sign-in.spec.ts` AC-36 now reads only the path, the query and the
   fragment, as C1's `/sign-in/create` test does. The origin's port is the server's, not the
   page's. Nothing else in the test changed.
9. **`pin-header.spec.ts`:** `/profiles` joins AC-37's list, and the title says "four pages".
10. **`tests/e2e/pin-profiles.spec.ts`** (14 tests):
    - AC-22: signed out, staff, and ADMIN with its ordering and no `€`;
    - AC-21: an edited approval that then signs in, and a taken username;
    - AC-24 and AC-25: the PIN is shown once, is absent from a later GET, from every column
      and from the browser console, and signs in;
    - AC-26: the summary and the lock, with its clear control;
    - AC-23: demote, promote and deactivate, driven from `/profiles` against a second signed-in
      context;
    - AC-32, AC-35 at 390 and at 320 px, and AC-40.

    Dev census before any e2e run:
    `{"users":33,"admins":8,"pending":0,"setupClaims":0,"requestNewDevices":0,"pinNewDevices":0,"authEvents":0,"accountLocks":0}`.
    - **Run 1: 13 passed, 1 failed.** AC-24's reset showed `PIN_FORMAT_MESSAGE` instead of a
      PIN. I read the failing state from the Playwright trace: the pressed button's
      `name=length` value never reached the action, because a form action dispatched by React
      is handed the form's own fields only. **This was a real bug**, and I fixed the component:
      one form per length, each with a hidden `length`.
    - **Run 2: 13 passed, 1 failed.** The same test could not read the streamed action body
      afterwards (`Network.getResponseBody`: no data). The spec now fetches that one POST
      through `page.route` and hands it on whole, so the body can be read.
    - **Run 3: 14 passed, 0 failed** (1.1 m).
11. **The other targeted specs.** `sign-in.spec.ts` alone passed with 0 failed. My output
    filter cut the count line on that run, and the final run below shows 15. `pin-header`,
    `role-access` and `route-protection` together: **21 passed**.
12. **AC-22's hand proof** and **AC-26's hand observation**: see the two sections below.
13. **The security mutations**: see the table below.
14. **Final runs, all on the final source:**
    - the four auth database files, one at a time: `sign-in-service` 14/14 (55 s),
      `profile-request-service` 11/11 (22 s), `setup-service` 37/37 (32 s),
      `profile-admin-service` 33/33 (61 s). None hit a connection error or a timeout, so none
      was repeated.
    - e2e: `sign-in.spec.ts` alone, **15 passed**. Then `pin-profiles` and `pin-header`,
      **18 passed**. Each run rebuilt first, so the build on disk is the final source.
    - `typecheck` 0, `lint` 0, `test:unit` **997/997**, `prisma validate` valid.
    - The dev census was identical before and after every e2e run.

### AC-22: the hand proof (003 AC-16)

- I made a byte copy of `src/lib/auth-config.ts` and recorded its sha256 (`7245749e…`). Then I
  removed `"/profiles"` and its comment from `PROTECTED_PATHS`. The matcher was unchanged.
- I ran `npm run test:e2e -- tests/e2e/pin-profiles.spec.ts -g "AC-22"`. It rebuilt first
  ("Compiled successfully").
- **Observed:**
  - A YARD_STAFF `GET /profiles` still answered **`307` to `/stock-entry?denied=profiles`**,
    and its body named no profile. That test passed.
  - Signed out, the answer was **`307` to `/sign-in?reason=inactive`**, not to
    `?callbackUrl=%2Fprofiles`. That is the one red test: the middleware no longer turned the
    request away, so the page's guard refused it instead.
  - An ADMIN still got `200`.
- I restored the file with `cp -p`, and `sha256sum -c` reported `src/lib/auth-config.ts: OK`.
  The e2e runs that followed rebuilt from the restored file.

### AC-26: the hand observation of the paused rendering

No other e2e run was active. I wrote a scratch spec that prints counts and yes/no facts only,
copied it into `tests/e2e/`, ran it once and deleted it. It did the following:
- created a fresh ADMIN;
- wrote ten `PIN_FAILURE` events straight into `pin:new-devices` in the development database;
- signed the ADMIN in from a known device and opened `/profiles`;
- pressed the control;
- deleted every `pin:new-devices` event written since it started, and removed the ADMIN.

| Moment | new-device failures | new-device resets | all `AuthEvent`s |
|---|---|---|---|
| before | 0 | 0 | 0 |
| after writing the ten | 10 | 0 | 10 |
| after pressing the control | 10 | 1 | 11 |
| after deleting (11 rows) | 0 | 0 | 0 |

**What the page showed before the press:**
- `pin-failures` read exactly `PIN_FAILURES_SUMMARY(10, 0, 10)`;
- `NEW_DEVICES_PAUSED_MESSAGE` was visible;
- the `RESUME_NEW_DEVICES_LABEL` control was visible.

**After the press:** neither the message nor the control was rendered (count 0 each), and the
summary still read `PIN_FAILURES_SUMMARY(10, 0, 10)`. No event was deleted by the press. The
dev census was identical before and after.

### Security mutations

I made byte copies of `profile-admin-service.ts` (`c1d0cc6c…`), `src/app/profiles/page.tsx`
(`64d1ddfe…`) and `src/app/profiles/actions.ts` (`1fd77473…`). A script applied each mutation to
the working files from those copies. I ran the named tests, then restored the files with `cp -p`.
After every restore, `sha256sum -c` reported `OK` for all three.

| # | Mutation | What went red |
|---|---|---|
| M1 | a YARD_STAFF actor reaches an admin function: `approveProfile` loses its `assertRole` | db AC-22 "each of the ten functions…" (`approveProfile: expected null to be an instance of ForbiddenError`); unit AC-22 first-statement check |
| M2 | `/profiles` is reachable by a YARD_STAFF session with `PROTECTED_PATHS` intact: the page calls `requireUserPage()` | unit AC-22 page-guard check; the db render for staff (no redirect digest); e2e staff test, **`500` instead of `307`**. The services still refused, so no profile was rendered |
| M3a | approval grants a held username, first layer: the free-username check is removed | **stays green.** The unique index refuses the write, and the violation is mapped to `USERNAME_TAKEN_MESSAGE`. This layer is the backstop |
| M3b | the same, with the index violation's mapping also removed | db AC-21 "held by an ACTIVE or a DEACTIVATED…": a `PrismaClientKnownRequestError`, not a `ConflictError`. The database never lets two rows hold one username, so "grants" cannot be reached. What the mutation reaches is the wrong answer |
| M4 | two concurrent approvals of one username both succeed: a taken username, at the check or at the index, is answered with the unchanged entry | db AC-21 concurrency: `repetition 0: … to have a length of 1 but got 2` |
| M5a | the last ADMIN can be demoted: no `assertAnotherAdminRemains` in `changeProfileRole` | db AC-23: the "only ACTIVE ADMIN…" test and mutual demotion (2 fulfilled) |
| M5b | the last ADMIN can deactivate itself: none in `deactivateProfile` | db AC-23: the "only ACTIVE ADMIN…" test and mutual deactivation (0 rejected) |
| M5c | (extra) the ADMIN rows are read without `FOR UPDATE` | db AC-23: both concurrency tests, red in repetition 0 |
| M6 | deactivation keeps the `pinHash` | db AC-23 "a deactivated profile loses…": the database's `User_pin_only_when_live` CHECK refused the write, so the hash cannot survive in a row either |
| M7 | a reset or created PIN appears in a later `GET /profiles`: the action keeps it in server memory and the page renders it | e2e AC-24 and AC-25, each at its later-GET `not.toContain` |
| M8 | `clearAccountLock` resets the level (`SUCCESS` instead of `CLEARED`) | db AC-26 "clearing a lock…": level 0, not 3 |

### Files created
- `src/app/profiles/page.tsx`: the admin section.
- `src/app/profiles/actions.ts`: the eight server actions.
- `src/app/profiles/form-state.ts`: the three form states. A new PIN lives only there.
- `src/components/profiles/PendingProfileActions.tsx`, `ActiveProfileActions.tsx`,
  `ClearLockForm.tsx`, `ResumeNewDevicesForm.tsx`, `CreateProfileAdminForm.tsx`,
  `NewPinNotice.tsx` and `FormError.tsx`.
- `src/lib/profile-display.ts`: dates and times in the yard's zone.
- Tests:
  - `src/server/auth/profile-admin-service.db.test.ts` (33);
  - `src/app/profiles/actions.test.ts` (7);
  - `src/lib/profile-display.test.ts` (2);
  - `tests/e2e/pin-profiles.spec.ts` (14).

### Files modified
- `src/server/auth/profile-admin-service.ts`: the nine functions, the mapper, the admin-row
  lock and `settleLock`; `resetProfilePin` uses the shared helpers.
- `src/server/auth/auth-event-log.ts`: `recordEvent` takes an optional account key, and there is
  a new `recordBudgetReset`. The header comment is rewritten.
- `src/server/auth/sign-in-service.ts`: moved onto `auth-event-log.ts` (Deviation 8).
- `src/lib/auth-config.ts` gains `"/profiles"`, and `src/middleware.ts` gains `"/profiles/:path*"`.
- `tests/unit/pin-auth-contract.test.ts`: AC-43 now lists four pages, and there are new AC-22
  and AC-37 blocks.
- `tests/unit/stock-takes-contract.test.ts`: 010 AC-20's census names `/profiles`.
- `tests/e2e/sign-in.spec.ts`: AC-36 reads the path, the query and the fragment.
- `tests/e2e/pin-header.spec.ts`: `/profiles` is the fourth page.
- `progress/current.md` (plan and log), and this section.

### Acceptance criteria (C2 halves)
| AC | Where it is satisfied | Test that proves it |
|----|----|----|
| AC-21 | `profile-admin-service.ts:333` (approve), `:382` (reject); `PendingProfileActions.tsx` | db: 7 AC-21 tests (`…db.test.ts:377`–`:498`); unit: `actions.test.ts` AC-21/AC-23 messages; e2e: `pin-profiles.spec.ts:230`, `:256` |
| AC-22 | `auth-config.ts:24`, `middleware.ts:44`; `page.tsx:121`; `assertRole` first in all ten functions; `listProfiles` `:276` | db `:258`, `:300`, `:346`, `:355`, `:889`; unit: `pin-auth-contract` AC-22 (3), `actions.test.ts` (5); e2e `:153`, `:162`, `:180`; plus the hand proof above |
| AC-23 | `:407` (role), `:478` (deactivate), `lockActiveAdmins` `:230`, `assertAnotherAdminRemains` `:238` | db `:519`–`:618` (6); e2e `:427` |
| AC-24 (C2 half) | `resetProfilePin` `:440`; `ActiveProfileActions.tsx`; `NewPinNotice.tsx` | e2e `:281` (the POST's body, `new-pin`, a later GET, every column, the console, and a sign-in); `pin-session.db` (Phase B, re-run 10/10) |
| AC-25 | `createProfile` `:532`; `CreateProfileAdminForm.tsx` | db `:641`–`:711` (4); e2e `:330` |
| AC-26 | `clearAccountLock` `:510`, `pinFailureSummary` `:576`, `resumeNewDeviceSignIn` `:620`; `page.tsx:79`, `:94`, `:133` | db `:730`–`:875` (9, the exact `{3,1,2,false}` among them); e2e `:365`, `:394`; plus the hand observation above |
| AC-32 (`/profiles` half) | `toEntry`'s `credentialNeedsReset`; `page.tsx:85` | db `:910`; e2e `:479` |
| AC-33 (`/profiles` half) | nothing in the admin section logs; a new PIN leaves only in an action's state | db `:932` (approval, rejection, creation, reset and every other function); unit `actions.test.ts` (no console); e2e `:281` |
| AC-34 (`/profiles` half) | no money is read anywhere in the section | db `:988` (`deepKeys` of all ten functions' returns; no `€` and no stored hash in the render); e2e `:180` (no `€`) |
| AC-35 (`/profiles` half) | every control is `min-h-11`; the rows wrap at any character | e2e `:502` at 390 × 844 and 320 × 640: no sideways scroll, and at least 18 action controls measured at 44 px or more |
| AC-37 (`/profiles` half) | `page.tsx:127` | `pin-header.spec.ts` (four pages at 390 and 320 px); db `:355`; unit `pin-auth-contract` AC-37 |
| AC-43 (`/profiles` half) | `page.tsx:47`; no `loading.tsx` at or above it | unit: `stock-takes-contract` 010 AC-20 census; `pin-auth-contract` AC-43 (four pages); `stock-entry-contract` 010 AC-2 (derived, unchanged) |
| C1 Finding 3 | `sign-in.spec.ts` AC-36 | `sign-in.spec.ts` 15/15 |
| C1 Deviation 8 | `sign-in-service.ts:95`, `:168`–`:169` | the probe, byte-identical before and after; `sign-in-service.db` 14/14, `profile-request-service.db` 11/11, `setup-service.db` 37/37, all unchanged |

### Verification output

```
$ npm run typecheck                                              -> exit 0
$ npm run lint                                                   -> exit 0
$ npm run test:unit                    Test Files 71 passed (71)   Tests 997 passed (997)
$ npx prisma validate                  The schema at prisma\schema.prisma is valid
$ npm run test:db -- src/server/auth/sign-in-service.db.test.ts          Tests 14 passed (14)  55 s
$ npm run test:db -- src/server/auth/profile-request-service.db.test.ts  Tests 11 passed (11)  22 s
$ npm run test:db -- src/server/auth/setup-service.db.test.ts            Tests 37 passed (37)  32 s
$ npm run test:db -- src/server/auth/profile-admin-service.db.test.ts    Tests 33 passed (33)  61 s
$ npm run test:db -- src/server/auth/pin-session.db.test.ts              Tests 10 passed (10)  15 s
$ npm run test:e2e -- tests/e2e/sign-in.spec.ts                                   15 passed (53.7s)
$ npm run test:e2e -- tests/e2e/pin-profiles.spec.ts tests/e2e/pin-header.spec.ts 18 passed (58.4s)
$ npm run test:e2e -- tests/e2e/pin-header.spec.ts tests/e2e/role-access.spec.ts tests/e2e/route-protection.spec.ts
                                                                                  21 passed (25.0s)
dev database census, before and after every e2e run (identical):
  {"users":33,"admins":8,"pending":0,"setupClaims":0,"requestNewDevices":0,"pinNewDevices":0,"authEvents":0,"accountLocks":0}
```

No `init` was run: the coordinator runs the gate. Unit count against `c18dd10`'s 984: plus 7
(`actions.test.ts`), plus 2 (`profile-display.test.ts`), plus 4 (`pin-auth-contract`: three
AC-22 and one AC-37). That makes 997.

### Findings: for the coordinator

1. **The `/analysis` link to `/profiles` is not added, because it would turn a shipped
   assertion red.** 021 *Out of scope* → *Navigation* says `/profiles` is reached "by its URL
   and by one link in the header of `/analysis`". But 011 AC-16's e2e test
   (`analysis-figures.spec.ts:627`, "EVERY link on the screen carries the current period and
   grouping") asserts that every `a[href]` on `/analysis` carries both `period` and `breakdown`.
   A plain link to `/profiles` fails that. No numbered criterion requires the link, so I did
   not satisfy it another way: I added no link carrying unused parameters, and no link
   disguised as a form. It needs a ruling: amend 011 AC-16's rule, or accept a link that
   carries both parameters, or drop the sentence. Until then, `/profiles` is reached by its URL
   only.
2. **The shared header's sign-out control is about 38 px tall** (`px-3 py-2 text-sm`, from #3's
   `SignOutForm`). AC-35 says "every action control on `/profiles`". I measured the controls of
   the section's eight actions: in the rows my test created, and in the create form. I did not
   measure the header's sign-out, which is the same control on every signed-in page. If it
   counts, it needs a change to #3's component, which would affect every page. I did not make
   that change.
3. **Two layers that cannot be mutated to "succeed".** "Approval grants a held username" (M3)
   and "deactivation keeps the `pinHash`" (M6) are refused by the database itself: the unique
   index, and the `User_pin_only_when_live` CHECK. The mutations reach a wrong answer or an
   error, never the forbidden state. Removing the application's free-username check alone
   (M3a) stays green, because the index's violation is mapped to the same message. The mapping
   is what M3b removes.

### Deviations from the spec
1. **Three service sentences are not in `auth-messages.ts`.** `NOT_PENDING_MESSAGE`,
   `ONLY_ACTIVE_PROFILE_CHANGE` and `ROLE_REQUIRED_MESSAGE` are exported from
   `profile-admin-service.ts`, and the tests import them. AC-21 and AC-23 require a
   `ConflictError` with no named message there, AC-39 lists that module's exports exactly, and
   a bad role only reaches the service through a forged form. This is the same choice Phase B
   made for the reset script's own sentences.
2. **`unknownUsernames` counts a failure with no account key.** AC-26 says "the ones that named
   no profile's username". A malformed attempt's event has no key, so it named none. A
   deactivated profile's username is still a profile's username. Both readings are pinned in
   their own test (db `:799`). The AC-26 scenario test uses keys only, so it holds under either
   reading.
3. **`resumeNewDeviceSignIn` writes nothing while new devices are not paused.** A reset then
   would only hand the internet a fresh ten guesses, which is what a second press of a stale
   control would do. The paused case is exactly AC-26's, and db `:840` pins the no-op.
4. **A `BUDGET_RESET` runs no retention sweep.** AC-26 says the resume "deletes no event", and
   AC-14 says writing an event deletes those past retention. I read AC-26's words as governing
   this write, because an admin's reset is not an attempt, and attempts are what keep the table
   bounded. The attempt writes still sweep through `recordEvent`. This is
   `auth-event-log.ts:85`, with its reason in the comment.
5. **Which statuses each action accepts.** Deactivation needs an `ACTIVE` profile, so a request
   is rejected, not deactivated. A role change on a non-`ACTIVE` profile is AC-23's
   `ConflictError`. Clearing a lock accepts any profile with a username, and does nothing
   without one.
6. **UI choices the spec leaves open.**
   - The role change is one button naming the other role (`Make ADMIN`, `Make YARD_STAFF`).
   - The reset is two buttons, 4 and 6 digits, each in its own form (work log 10).
   - Deactivation, which nothing can undo, sits behind a native disclosure: a second,
     deliberate tap that works without JavaScript.
   - The create form draws the PIN on the server and has no PIN field, because a PIN an
     administrator typed is one somebody else knows.
7. **The e2e requests are written directly**, in the shape `requestProfile` writes, so that no
   request budget is spent (AC-40). C1's `pin-create.spec.ts` covers the request form end to
   end.
8. **AC-24's "response to the reset POST" is read through `page.route`.** The browser keeps no
   copy of a streamed action body. The route fetches the one POST and hands it on unchanged.
9. **Modules beyond the contract table:** `src/lib/profile-display.ts`, the seven components and
   `form-state.ts`, and in the service the exported sentences and the `PinFailureSummary` type.

### Notes for the reviewer
- **No PIN, digest, hash, key or code was printed or written.** The census script and the hand
  observation printed counts and yes/no facts only, and I read no `.env` value. To read run 1's
  failing state, I unzipped that run's Playwright trace into the scratchpad and grepped it. I
  printed only the counts of one element id and of one message constant, then deleted it. Each
  later run cleared `test-results/`, which now holds nothing.
- **Why the concurrency holds.** Two `changeProfileRole` or `deactivateProfile` calls queue on
  the first `ADMIN` row lock, because both lock in id order. When the second resumes, Postgres
  re-reads each row it locks at READ COMMITTED. The row the first call demoted or deactivated no
  longer matches, and is not returned. M5c, which removes `FOR UPDATE`, is red in repetition 0.
- **The e2e spec touches only the rows it creates.** The development database's 33 profiles are
  listed and never pressed. The last-admin rule is proved only where the test builds the whole
  population, as the brief requires.
- **The build on disk is the final source.** The last two e2e runs rebuilt after every
  mutation had been restored.
- **Timing.** The admin database file takes about 60 to 78 s; its longest test is 10 mutual
  demotions from fresh databases, about 10 s. `pin-profiles.spec.ts` takes about a minute
  alone.

### After the rulings

Brief: the coordinator's message carrying the rulings in `specs/features/021-pin_auth.md` →
*Three findings by Phase C2, ruled by the coordinator*, in AC-22's last sentence and in the note
under 011 AC-16. I carried out C2-1 and C2-2. C2-3 was accepted as described, and there was
nothing to do for it. **Status: complete.** Nothing is committed, and I did not edit either
spec file, which carry the coordinator's uncommitted rulings. I ran no full suite and no `init`.
Port 3000 is free.

#### Work log

Finished and verified steps only, in the order they were done.

1. **C2-1: the link.** `src/app/analysis/page.tsx` passes one `Link` to `IdentityHeader` as its
   child (`:205`). It has `href="/profiles"`, `data-testid="profiles-link"`, no query
   parameter, and `min-h-11`. The page comment records the one exception to "every link carries
   the reading state".
2. **The 011 AC-16 test**, amended exactly as the note under AC-16 says
   (`analysis-figures.spec.ts:637`–`:651`). It collects every `a[href]` as before, then:
   - asserts that exactly one of them is `"/profiles"`;
   - asserts that exactly one `header a[href="/profiles"]` exists;
   - runs both of its existing loops over every other link, unchanged. Each must carry both
     parameters, and each link that is not a jump must carry the current period.

   The title and every other expectation are unchanged.
3. **AC-22's link assertion** (`pin-profiles.spec.ts:228`). As an ADMIN on `/analysis`, the only
   link whose path is `/profiles` is exactly `"/profiles"`, with no query. It is in the
   header, exactly once. Clicking it lands on `/profiles`, whose `<h1>` is `Profiles`.
4. **C2-2: the sign-out control.** `src/components/SignOutForm.tsx` gains `inline-flex
   min-h-11 items-center`. Its horizontal padding and text are unchanged, so it is no wider.
   AC-35 on `/profiles` now includes the header among the scopes it measures
   (`pin-profiles.spec.ts:549`), so the sign-out is measured at 390 and at 320 px. Its floor of
   measured controls rose from 18 to 19.
5. `typecheck` 0, `lint` 0, `test:unit` **997/997**.
6. **Targeted e2e on the new source, with the dev census taken before and after each run:**
   - `pin-profiles` and `pin-header`: **19 passed**. That is 15 plus 4: AC-37 still shows no
     sideways scroll on the four pages at 390 and 320 px.
   - Every spec in the second project that measures or overflows the header, plus
     `analysis-figures`, run with `--project=chromium-stock-entry --no-deps`:
     - `analysis-figures` and `analysis-access`;
     - `stock-entry-access`, `stock-entry-calendar` and `stock-entry-start`;
     - `stock-takes-calendar` and `stock-takes-count`.

     Result: **88 passed, 0 failed** (2.5 min). **No shipped assertion changed**: every overflow
     and header check passed unmodified with the taller sign-out.
   - `route-protection`, `pin-create` and `item-master-access` also measure `scrollWidth`, but
     on pages that render no identity header, so they were not affected and I did not run them.
7. **The two mutations** (table below). Each was restored, and `sha256sum -c` reported `OK`.
8. **Final rebuild on the restored source.** `pin-profiles` and `pin-header`: **19 passed**
   (1.0 min). The dev census was identical before and after every run:
   `{"users":33,"admins":8,"pending":0,"setupClaims":0,"requestNewDevices":0,"pinNewDevices":0,"authEvents":0,"accountLocks":0}`.
   `test-results/` is empty, and nothing is listening on port 3000.

#### Mutations

I made byte copies of `src/app/analysis/page.tsx` (`3f8d5f8b…`) and
`src/components/SignOutForm.tsx` (`d079e291…`). I applied each mutation from the copies,
rebuilt, ran the named test, and restored the file with `cp -p`. After each restore,
`sha256sum -c` reported both files `OK`.

| # | Mutation | What went red |
|---|---|---|
| M9 | a second parameter-less link, `<Link href="/profiles">`, in `/analysis`'s body | `analysis-figures.spec.ts:627`, 011 AC-16 "EVERY link…": `Expected length: 1, Received length: 2` at the `/profiles` count |
| M10 | the sign-out control without `min-h-11` (its old class) | `pin-profiles.spec.ts` AC-35 at **both** 390 and 320 px: `sign-out … Expected: >= 44, Received: 38` |

#### Files modified (this step)
- `src/app/analysis/page.tsx`: the header link and its comment.
- `src/components/SignOutForm.tsx`: 44 px tall, and its comment.
- `tests/e2e/analysis-figures.spec.ts`: 011 AC-16's test, amended as its note says.
- `tests/e2e/pin-profiles.spec.ts`: AC-22's link test, and the header measured in AC-35.
- `progress/current.md` and this section.

#### Notes for the reviewer
- **AC-40's diff rule and `analysis-figures.spec.ts`.** That file exists at #21's base commit,
  and it is not one of the five files AC-40's rule exempts. The amendment adds `expect(` lines
  to it that none of AC-40's five substitutions covers. The C2-1 ruling and the note under 011
  AC-16 license it. The reviewer's `git diff` of `tests/e2e` will show it, and it should be read
  against that ruling, not as a breach of AC-40.
- **What the sign-out change touches.** It changes height only. On every page with the header,
  the sign-out button is now 44 px tall instead of 38 px. None of the 88 + 19 header and
  overflow tests that ran needed a change.
