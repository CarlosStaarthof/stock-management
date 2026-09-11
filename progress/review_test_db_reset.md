# Review — feature 20 test_db_reset

**Verdict:** APPROVED
**Spec:** `specs/features/020-test_db_reset.md` (15 criteria, including its
`## Post-approval amendments`)
**init:** green — `bash ./init.sh` → `init exit=0`, `[OK] Environment ready`, **database
checks executed** (not skipped), 90 e2e, 632 s. Run by the coordinator, per this session's
working rules; not re-run here.

**Reviewed from `git diff` against `6b9f313`, not from the report.** Working tree at review
time:

```
 M progress/current.md
 M scripts/run-db-tests.mjs
 M src/server/test-db.ts
?? progress/impl_test_db_reset.md
?? src/server/test-db.db.test.ts
?? src/server/test-db.test.ts
?? tests/unit/test-db-guard.test.ts
```

`git ls-files 'src/**/*.db.test.ts'` = **15**, and `git diff --name-only` lists **none** of
them. `git status --porcelain -- prisma Samples src/app src/components src/lib tests/e2e
playwright.config.ts` is **empty**: no migration, no schema edit, no application surface.

## What I ran

Nothing else was on the database (`Win32_Process`: only Adobe's `node.exe`; no
`run-db-tests.mjs`). One database command at a time.

| Command | Result |
|---|---|
| `npm run typecheck` | exit 0, no output |
| `npm run lint` | exit 0, no output |
| `npx vitest run src/server/test-db.test.ts tests/unit/test-db-guard.test.ts` | 19/19 passed |
| `npx vitest run` with all four URLs pointing at `nonexistent.invalid` | **33 files, 397 tests passed**, 11.89 s (AC-13, verified rather than argued) |
| `npx prisma validate` | `The schema at prisma\schema.prisma is valid` |
| `npm run test:db -- src/server/test-db.db.test.ts` | 13/13 passed, 11.99 s, datasource `ep-odd-boat-zamat29w.c-2…` — **no `-pooler`** |
| `npm run test:db -- src/server/zz-review-probe.db.test.ts` (adversarial probe, written and deleted in one command) | passed; output below |

The probe file was removed in the same shell invocation that ran it, and `git status` is
byte-for-byte as I found it. The test database was left holding exactly the two seeded
yards (`loc_dublin`/`DUBLIN`/1, `loc_clonmel`/`CLONMEL`/2) — printed by the probe's last
assertion.

### The probe (priority 1 and 2: try to break AC-5 and AC-4)

I created `"ZzProbeChild" ("id" text PK, "itemId" text NOT NULL REFERENCES "Item"("id"))`
— a table referencing one of the eight and absent from `TRUNCATED_TABLES` — and asserted
the three things the spec's argument rests on. All three held:

```
PROBE tables: ["Item","ItemLocation","ItemPrice","ItemType","Location","StockCount",
               "StockCountLine","Supplier","User","ZzProbeChild"]
PROBE outside referencers: [{"referencing":"ZzProbeChild","referenced":"Item"}]
PROBE reset error: Raw query failed. Code: `0A000`. Message: `ERROR: cannot truncate a
  table referenced in a foreign key constraint DETAIL: Table "ZzProbeChild" references
  "Item". HINT: Truncate table "ZzProbeChild" at the same time, or use TRUNCATE ...
  CASCADE.`
PROBE Location rows after refusal: [{"n":2}]
PROBE final Location: [loc_dublin/DUBLIN/1, loc_clonmel/CLONMEL/2]
```

1. **AC-4 goes red.** I ran the AC-4 test's own assertion verbatim
   (`expect(names).toEqual([...TRUNCATED_TABLES,"Location"].sort())`) and asserted it
   **throws**. It threw. The drift guard is not decorative: #8 adding a table turns
   `src/server/test-db.db.test.ts:216` red.
2. **AC-5's closure query catches it.** I ran the `information_schema` join from
   `src/server/test-db.db.test.ts:233-242` unchanged; it returned exactly
   `ZzProbeChild → Item`, so the "every FK into the eight comes from within the eight"
   assertion at `:253` would also have failed. The query is not vacuous and it is not
   satisfied by wording.
3. **The reset fails loudly, and empties nothing.** `resetTestDb()` rejected with
   Postgres' `cannot truncate a table referenced in a foreign key constraint`, and
   `Location` still held its 2 rows afterwards — the failure is raised by the first
   statement, so neither statement lands. This is the exact failure mode that justifies
   omitting `CASCADE`, demonstrated rather than asserted.
4. **Reversibility.** After `DROP TABLE "ZzProbeChild"`, `information_schema` equals
   `[...TRUNCATED_TABLES,"Location"]` again, the closure set is empty again, and
   `resetTestDb()` succeeds and leaves the two seeded yards.

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | Contract unchanged: `src/server/test-db.ts:26` (`SEEDED_LOCATIONS`, both rows byte-identical to the diff's `-`/`+` context), `:98` (`resetTestDb(): Promise<void>`). Proven by `src/server/test-db.test.ts:33` and `:38` (green in my run). **Not one existing `*.db.test.ts` edited — verified from `git diff --name-only`, which lists only `src/server/test-db.ts`, `scripts/run-db-tests.mjs`, `progress/current.md`.** 004 AC-28's three `resetTestDb` tests in `src/server/schema/referential.db.test.ts` are untracked-unchanged and passed in the coordinator's three full runs (16 files, exit 0) and in the implementer's group run (`3 files / 50 tests`). |
| AC-2 | PASS | `src/server/test-db.ts:41` exports the eight; `:70` builds `TRUNCATE TABLE` from that constant alone. Set equality and absence of `deleteMany`/`$transaction`/`upsert` from the module text: `src/server/test-db.test.ts:47`, `:56`. What actually reaches Postgres: `src/server/test-db.db.test.ts:187-195` asserts the first `query` event starts `TRUNCATE TABLE `, its quoted identifiers equal `TRUNCATED_TABLES`, and it contains no `"Location"`, no `CASCADE`, no `RESTART IDENTITY`. Green in my run. |
| AC-3 | PASS | `src/server/test-db.db.test.ts:130-160` — counts **`query` log events from a `PrismaClient({ log: [{ level: "query", emit: "event" }] })`**, i.e. statements the engine reports sending, not Prisma method calls. Two events with a populated database (`:167`), two with an empty one (`:173`), first is the `TRUNCATE` (`:187`), second names only `"Location"` (`:197`). `BEGIN`/`COMMIT`/`ROLLBACK` excluded by assertion at `:179-185` — and that assertion is the load-bearing one: Prisma emits those as `query` events too, so a hidden interactive transaction would have shown up as four events, not two. **No leak:** the client is installed on `globalThis.macroadsPrismaClient` at `:142`, and `:154-157` restores the previous value and `$disconnect()`s in a `finally`; `src/server/db.ts` is unchanged (its proxy re-reads the global on every access, which is why the counting works at all). |
| AC-4 | PASS | `src/server/test-db.db.test.ts:205-217` (information_schema equality) and `src/server/test-db.test.ts:51` (no duplicate, no `"Location"`). **Proved red, not read:** with `ZzProbeChild` present the same assertion throws (probe, above). |
| AC-5 | PASS | `src/server/test-db.db.test.ts:221-231` — `Location` has zero `FOREIGN KEY` constraints. `:232-254` — the `referential_constraints` ⋈ `key_column_usage` ⋈ `constraint_column_usage` join, with a non-vacuity guard at `:245`, filtered to FKs whose *referenced* table is one of the eight and asserting the *referencing* table is among the eight. I re-ran that query against a deliberately broken schema and it named the intruder (probe, above), and `resetTestDb()` refused with Postgres' own `cannot truncate a table referenced in a foreign key constraint` while emptying nothing. `CASCADE` is absent (`src/server/test-db.ts:70`) and its absence is now evidenced, not argued. |
| AC-6 | PASS | `src/server/test-db.db.test.ts:258-267` — `pg_class` reports **0** sequences in `public`. `src/server/test-db.test.ts:71` — nine `@id` lines in `prisma/schema.prisma`, every one `@default(cuid())`; `:79` — `autoincrement` nowhere. `RESTART IDENTITY` absent at `src/server/test-db.ts:70`. Both halves green in my runs. |
| AC-7 | PASS | `src/server/test-db.db.test.ts:271-285`: `seedEverything()` (`:46-94`) writes `User`, `ItemType`, `Supplier`, `Item`, `ItemPrice`, `ItemLocation`, `StockCount`, `StockCountLine`; the test asserts every one of the eight is `> 0` **before** and `0` **after** one `resetTestDb()`, with no error. Passed in 1320 ms. See Observation 3 on the ninth table. |
| AC-8 | PASS | `src/server/test-db.db.test.ts:287-301` damages `Location` in all five directions the spec names — rename, `active: false`, `sortOrder: 99`, an invented third yard, `loc_clonmel` deleted outright — and asserts field-for-field equality with `SEEDED_LOCATIONS` afterwards (a `toEqual` on the whole row, so an extra column would fail it). `:303-316` re-asserts the same end state **and** that the whole reset was still two statements. Both green. |
| AC-9 | PASS | `src/server/test-db.db.test.ts:318-328` — two resets back to back leave eight zeros and the two rows. Full-run clauses from the coordinator's record: `npm run test:db` twice in a row, exit 0, 16 files each; and `npm run test:db -- <16 files, sort -r>` exit 0, 16 files, beginning with `src/server/test-db.db.test.ts` and ending with `admin-create.db.test.ts`. Reverse order changes nothing. See Observation 4 on the "same test count" wording. |
| AC-10 | PASS | Both refusals still stand at `scripts/run-db-tests.mjs:31-37` and `:39-45`, still written against `TEST_DATABASE_URL`, still **before** `migrate deploy` at `:89` and before vitest at `:97` — the diff touches neither block. `tests/unit/test-db-guard.test.ts:130`, `:137`, `:147` spawn the real script in a `mkdtemp` directory with no `.env`, assert exit `1` and each exact message, and assert the combined output contains none of `prisma migrate`, `Test Files`, `TRUNCATE`. I ran the file: 11/11 green, in `test:unit`, with no database. |
| AC-11 | PASS | `src/server/test-db.ts:99-104` is the first statement of the function; both SQL strings are module constants built at **load** (`:70`, `:81`), so at call time there is nothing left to build and nothing to send. `tests/unit/test-db-guard.test.ts:226-239` covers `undefined`, `""`, `"0"`, `"true"`, `"2"` and asserts the message contains `resetTestDb() refuses to run: MACROADS_TEST_DB is not set`, asserts it does **not** match `/TRUNCATE\|reach database\|PrismaClient/i`, and asserts `globalThis.macroadsPrismaClient` is still `undefined` — three independent ways of proving no statement left the process. `:241` adds `"01"`, `" 1"`, `"1 "`, `"yes"`: it is an equality, not a truthiness test. Green with no database reachable. |
| AC-12 | PASS (one spec-level deviation, correctly resolved) | Verified from `git status --porcelain`: nothing under `src/app/`, `src/components/`, `src/lib/`, `prisma/`, `tests/e2e/`; no migration directory added; `prisma/schema.prisma` and every migration byte-identical. `npx prisma migrate status` and `npm run test:e2e` ran inside the coordinator's green `init` (90 e2e). **Deviation:** `scripts/run-db-tests.mjs` *does* change, which AC-12's file list and "Out of scope" forbid and AC-15 requires. The post-approval amendment is later and more specific, and explicitly relaxed AC-10 for this reason; the implementer followed AC-15 and declared the conflict at `progress/impl_test_db_reset.md:230-236` rather than hiding it. That is the right call. The unamended text in AC-12 and "Out of scope" is a **spec defect**, not an implementation defect — see Required changes. |
| AC-13 | PASS | Verified directly: `npx vitest run` with `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all at `nonexistent.invalid` → **33 files, 397 tests passed**. `npx prisma validate`, `npm run typecheck`, `npm run lint` all exit 0. `src/server/test-db.ts:1` imports only `@/server/db`, whose deferred proxy (`src/server/db.ts:29-36`) is unchanged, and `src/server/test-db.test.ts:85` asserts importing the module constructs no client. The `init` skip-path wording is untouched by this feature (`init.sh:223`); `init` itself ran green **with** the database checks, which is the stronger evidence C2.1 requires. |
| AC-14 | PASS | `progress/impl_test_db_reset.md:79-130`. Before: eleven statements, itemised, with the pre-change line reference; 221 tests in 15 files. After: two, with the AC-3 test output quoted; 234 tests in 16 files. Wall-clock: three full runs, 565/440/287 s. **The framing is correct**: the exposure arithmetic (≈2,430 → ≈470 round-trips) is stated first and called "the claim that is arithmetic rather than measurement, and the stronger one"; the wall-clocks are given as a **range** with the explicit instruction "Read those numbers as a range, not as a speed-up", the summary "about half, on a branch whose speed varies by more than the change does", and the note that the same branch ran the same suite at ~390 s and at 841 s the same day. **841 → 287 is never quoted as a speedup.** AC-3's statement count is named as the guarantee that must hold, twice (`:108`, `:129`). |
| AC-15 | PASS | `scripts/run-db-tests.mjs:60-63` — the child's `DATABASE_URL` is now `testDirectUrl`; `DIRECT_URL` unchanged; the fallback at `:50` (`(process.env.TEST_DIRECT_URL ?? "").trim() \|\| testUrl`) is byte-identical to the pre-change line, so `prisma migrate deploy` at `:89` is unaffected and a plain Postgres still works. Asserted from the child's actual environment, not a comment: `tests/unit/test-db-guard.test.ts:164-181` preloads a capture into every spawned child via `NODE_OPTIONS=--require`, and asserts exactly one child was spawned, that it is `prisma`, and that its `DATABASE_URL` and `DIRECT_URL` both equal the `TEST_DIRECT_URL` sentinel; `:183-196` asserts both fall back to the `TEST_DATABASE_URL` sentinel when `TEST_DIRECT_URL` is unset. Green in my run. Confirmed at runtime in my own `test:db` invocations: `Datasource "db": … at "ep-odd-boat-zamat29w.c-2.eu-west-2.aws.neon.tech"` — **no `-pooler`** — followed by `No pending migrations to apply.`, so migrate deploy still runs and still succeeds. The experiment is recorded as one at `progress/impl_test_db_reset.md:299-313`; see "On the honesty of the AC-15 claim". |

## On the honesty of the AC-15 claim

The report calls the result **"encouraging rather than conclusive"** and says three green
runs cannot distinguish "the pooler was the cause" from "the branch happened to be well".
**That is the right call, and if anything it under-claims by exactly the right amount.**

It names a confound the coordinator's brief did not: the two variables moved *together*.
This feature cut round-trips roughly fivefold **and** left the pooler in the same change,
so even a permanent disappearance of the error would not isolate which one did it —
`progress/impl_test_db_reset.md:311` says so explicitly ("unpooled **and** doing roughly a
fifth of the round-trips"). It also states what would close the experiment (a note in
`progress/history.md` if the error ever recurs) and what the answer would then be (the
branch's compute state or the account's allowance, in the Neon console). The one thing it
asserts flatly — that the binding took effect — is the one thing it can prove, from the
captured child environment and from the datasource line, and I reproduced both.

Over-claiming would have looked like "the pooler was the problem and it is fixed".
Under-claiming would have looked like dropping the finding. It does neither.

## On the invalid run

`progress/impl_test_db_reset.md:266-271` flags the full `npm run test:db` that began at
19:42:16 as **not evidence**, because `src/server/test-db.ts` was stashed to its pre-#20
state for part of it. I checked whether any figure leans on it: **none does.** The three
wall-clocks quoted under "Measurements" (565/440/287 s) are the coordinator's post-change
runs and match the coordinator's own record exactly. The "841 s before" figure is
identified in `progress/current.md` as the recovered pre-change run of 221 tests, and is a
*before* number, so the stash could not have flattered it. The disclosure is the
implementer's own and is made in the body of the report rather than in a footnote. The
same episode also produced the session's most useful finding — that two concurrent
`test:db` runs corrupt each other and present as assertion failures in the code under
review — and it is written into `progress/current.md` as a standing rule rather than left
in chat.

## Checkpoints

- C1.1 [x] Exactly one feature changed: `#20`, three files touched plus three new tests.
- C1.2 [x] `specs/features/020-test_db_reset.md`, approved 2026-09-11.
- C1.3 [x] All 15 criteria satisfied — table above.
- C1.4 [x] `feature_list.json` `acceptance[]` holds all 15 entries, AC-1…AC-15, verbatim
  against the spec including the amended AC-10 and the added AC-15.
- C1.5 [x] `progress/impl_test_db_reset.md` exists, lists every file created and modified,
  and its file list matches `git status` (see Observation 1).
- C2.1 [x] `init exit=0`, `[OK] Environment ready`, **without** "(database checks
  skipped)" — `prisma migrate status`, `npm run test:db` and 90 e2e all executed.
- C2.2 [x] `npm run typecheck` — zero errors (run by me).
- C2.3 [x] `npm run lint` — zero errors (run by me). The new `@prisma/client` import sits
  in `src/server/`, outside the fence's `src/app`/`src/components`/`src/lib` scope
  (`eslint.config.mjs:81`, `:86-121`).
- C2.4 [x] No new service function ships. The one function changed, `resetTestDb()`, has
  both: success (`src/server/test-db.db.test.ts:271`, `:287`, `:318`) and failure
  (`tests/unit/test-db-guard.test.ts:227` × 5, and the probe's loud `TRUNCATE` refusal).
- C2.5 [x] Real values: statement **texts** and **counts**, row counts, field-for-field row
  equality, `information_schema` contents. Nothing asserts merely "did not throw".
- C2.6 [x] Real Neon test branch; real `mkdtemp` directories and real spawned processes for
  the guard tests. Nothing mocked.
- C3.1 [x] No component or route handler imports `PrismaClient`; nothing under `src/app/`
  changed at all.
- C3.2 [x] Data access stays in `src/server/`.
- C3.3 [x] `src/lib/excel/` untouched.
- C3.4 [x] No new imports between `src/server/` modules; `test-db.ts` still imports only
  `@/server/db`.
- C3.5 [x] No schema change, so no migration is owed — `git status -- prisma` is empty.
- C4.1–C4.8 [x] Vacuous but checked: no domain behaviour, no money, no `value` column, no
  role shaping, no count lifecycle. `Samples/` untouched (`git status -- Samples` empty).
- C5.1 [x] Naming follows `docs/conventions.md`; `TRUNCATED_TABLES` is the spec's own name.
- C5.2 [x] The one `throw new Error` at `src/server/test-db.ts:100` is pre-existing and its
  text is **pinned byte-for-byte by AC-11**; it is a test-fixture guard, not a domain
  error. See Observation 5.
- C5.3 [x] No `console.log` in `src/` (only the comment in `src/lib/log.ts:4` that names
  the ban).
- C5.4 [x] No `TODO` anywhere in `src`, `tests` or `scripts`.
- C5.5 [x] No connection string committed. `tests/unit/test-db-guard.test.ts:29-31` uses
  sentinels deliberately chosen not to look like URLs, with the reason written down.
- C6.1 [x] `progress/current.md` was written during the work, including the collision
  finding and the standing rule. See Observation 2 for a stale header line.
- C6.2 [x] No scratch files: the implementer's `src/server/tmp-reset-probe.db.test.ts` is
  gone, and my `src/server/zz-review-probe.db.test.ts` was removed in the same command that
  ran it. `git status` is exactly as I found it.
- C6.3 [x] `feature_list.json` status is `in_progress` — reality; closing it is the
  coordinator's call, not mine.
- C7.1–C7.3 [x] Vacuous: this feature renders nothing, as the spec's "UI states" says.

## Required changes

None blocking. One item for the **coordinator**, not the implementer:

1. `specs/features/020-test_db_reset.md:112` (AC-12's file list) and `:120-123`
   ("Out of scope → `scripts/run-db-tests.mjs`. Not modified… pins it byte-identical")
   still contradict the amended AC-15, which cannot be satisfied without editing that file.
   The amendment at `:151-181` relaxed AC-10 for exactly this reason but did not carry the
   edit through to AC-12 or to "Out of scope". Add `scripts/run-db-tests.mjs` to AC-12's
   list and reword the out-of-scope entry to "only the `DATABASE_URL` binding changes; the
   `MACROADS_TEST_DB` handshake and both refusals are pinned". I do not edit specs; this is
   recorded so the next feature does not inherit a contradiction.

## Observations (non-blocking)

1. **The report's quoted `git status` is one commit stale.** `progress/impl_test_db_reset.md:215-218`
   shows `M feature_list.json` and `M specs/features/020-test_db_reset.md`; both are now
   committed in `6b9f313`, so the live tree shows only three modified files. The snapshot
   was taken before the approval commit landed. Nothing about the verdict changes, and the
   remaining entries match exactly.
2. **`progress/current.md:6` still reads "implementation not started"** while the work log
   below it records the implementation complete and the verification section already holds
   a green gate. The header line was not updated; the substance was. Worth a one-line fix
   at close.
3. **AC-7's fixture writes eight tables, not nine.** `seedEverything()` uses the
   pre-existing `loc_dublin` rather than inserting into `Location`, so the spec's "writes at
   least one row into each of the nine tables" is met in effect (the `beforeEach` reset
   guarantees `Location` holds exactly two rows) but not literally. The AC-8 test does
   insert a third yard. No practical gap.
4. **AC-9's "same test count both times" is evidenced by file count, not test count.** The
   coordinator's record and the report both quote "16 files passed, exit 0" for runs 1 and
   2; neither quotes `234 tests` for both. A silently skipped file would have changed the
   file count, and a skipped test would have shown in vitest's summary as `skipped`, so the
   risk is small — but if the number matters, it is one `grep` away on the next full run.
5. **`resetTestDb()` throws a bare `Error`,** which `docs/conventions.md:40-47` would
   normally reject. It is pre-existing, it is a test-harness guard rather than a domain
   error, and AC-11 pins its message text, so changing it here would have broken the
   criterion. Correct not to touch it.
6. **One edge case the single-statement restore does not cover, and the implementer found
   it rather than waiting for a reviewer to.** `progress/impl_test_db_reset.md:326-338`: if
   a test renames a seeded yard's `code` **and** gives that code to a yard it invents, the
   CTE's `DELETE` and the `INSERT` collide on the unique `code` within one command and the
   reset raises `PrismaClientKnownRequestError`. The failure is loud and the data is left
   intact; covering it would cost back the second round-trip this feature exists to remove.
   No existing test does this and AC-8's scenario does not. I agree with the trade and with
   recording it — it is the kind of thing that becomes a two-hour mystery for #8 otherwise.
7. **`src/server/test-db.db.test.ts:3` imports `@prisma/client`**, which
   `docs/architecture.md:10` reserves to `src/server/db.ts` in spirit. AC-3 requires a
   query-logging client installed through the existing `globalThis` hook precisely so that
   **no logging ships**, the ESLint fence does not cover `src/server/`, and the client is
   restored and disconnected in a `finally`. Declared as a deviation at
   `progress/impl_test_db_reset.md:250-254`. Acceptable, and the alternative — shipping a
   logging extension in `src/server/db.ts` — would have been worse.
8. **The carried note from #7 is now due.** `resetTestDb()` issues the repository's second
   piece of DDL (`count-service.db.test.ts`'s `tmp_ac13_line_write_fails` was the first).
   `progress/current.md` already says a third should move behind a helper in
   `src/server/test-db.ts`. My probe was a third, and it wanted exactly that helper.
