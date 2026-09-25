# Current session

**Feature:** #11 `analysis`
**Spec:** `specs/features/011-analysis.md` (being written)
**Started:** 2026-09-14
**Status:** in_progress — spec-writer dispatched, nothing implemented

## Plan

The **inverse of #10**. #10 proved a screen carries no money for either role; #11 is the one
screen that carries all of it, for one role. Everything built to keep euros away from staff has
to hold while an admin looks at nothing but euros.

ADMIN-only, refusal in the **service layer** so removing the middleware entry does not expose
it (003 AC-16). Per-yard values, total stock, period completeness, MoM and YoY joined on
**period** rather than on date arithmetic, a trend chart, and breakdowns by type and supplier.
Desktop grid, stacks on phone.

## Approach

**Value is derived, never stored** — `quantity x unitPriceSnapshot`, read from the count's own
snapshot and never from today's price, or last September's total changes when a price is edited
next March (Invariant 2). **An unpriced item contributes 0 and the screen must say so**
(Invariant 4): the workbook's original sin was EUR 486 counted and never valued, invisible. The
total is the sum of **exact** line values rounded once, not the sum of rounded lines (#9).

Four questions the spec must decide rather than defer: which count statuses Analysis counts; how
a never-counted month is distinguished from a EUR 0 month in every figure, comparison and the
chart; what the chart is mechanically, given there is no charting library and a dependency fence;
and whether this screen needs a client component at all (#10 shipped none).

## Inherited defect, to be fixed here

`src/app/analysis/page.tsx:21` carries the identity header that overflowed on two other routes
in #10, at `text-base` -- wider, so it overflows sooner. Neighbours measured `scrollWidth` 424
against 390 px and 104 px of overflow at 320 px. This page is #11's, so #11 fixes it, with the
measurement in the criterion and a **56**-character unbreakable label, not 40.

## Work log

<!-- Update as you go, not at the end. If the session dies, this file is what survives. -->

- 2026-09-24 14:45, implementer: **#8 e2e race repair** (brief `scratchpad/fix-filters-race.md`,
  report `progress/impl_filters_race.md`). `stock-entry-filters.spec.ts:302` navigates while the
  *None held* save is in flight. Plan: wait on the header's `ALL_CHANGES_SAVED` after the tap
  (default expect timeout), assertion text unchanged; audit the other `stock-entry-*.spec.ts`;
  prove red/green under a proof-only `page.route` delay, then 5 clean runs. Tests only, no `src/`.
  Original spec sha256 `a324ca9a63e72377...` (byte copy in scratchpad).
- 2026-09-24 15:00, implementer: race repair **complete**. The wait was added at
  `stock-entry-filters.spec.ts:345`.
  - Proof: under an ordered `page.route` injection, the unfixed test was red twice with
    `82 not counted` and the fixed one green twice. The brief's plain 2 s hold does NOT make the
    unfixed test fail, because of the 008 AC-15 queue restore.
  - 5/5 clean file runs.
  - No other spec shares the pattern. Details are in `progress/impl_filters_race.md`.

## Verification

<!-- Paste the closing run here. It must not say "(database checks skipped)" -- C2.1. -->

## Blockers

### RESOLVED then RE-SCOPED: it was authentication, and the branch has a load ceiling, 2026-09-17

**The blocker was authentication, not connections.** Both test endpoints returned `P1000` on
unmodified `HEAD` while both development endpoints accepted theirs. The Neon branches had been
replaced (`ep-cold-sound`/`ep-odd-boat` -> `ep-billowing-pine`/`ep-rapid-tooth`), which is why
credentials stopped working mid-session. New `.env` verified 2026-09-17: all four endpoints
authenticate, and `TEST_DIRECT_URL` is correctly **unpooled** after a second fix (it had
duplicated the pooled host, which would have silently undone 020 AC-15 with no shipped test
catching it).

**The coordinator's connection-exhaustion diagnosis was wrong and measurement disproved it.**
The claim was ~374 connection slots requested against a ~112 ceiling. Measured peak: **9**,
falling to **5**. Prisma's pool is lazy and `fileParallelism: false` had already serialised the
files. A 1.8x reduction, not 75x.

**Three consecutive `test:db` runs against the healthy branch, 2026-09-17:**

| Run | Duration | Files | Connection failures | Assertion failures |
|---|---|---|---|---|
| 1 | 777 s | **22/22 passed** | 0 | 0 |
| 2 | 744 s | **22/22 passed** | 0 | 0 |
| 3 | **1859 s** | 2 failed / 20 passed | **20** | **0** |

Run 3: 6 test timeouts, 6 hook timeouts, 6 `Can't reach database server`, 2 `Server has closed
the connection`. **Zero assertions failed in any of the three**, as in every run before them.

**What this establishes.** The suite is correct and the fix works: two clean back-to-back runs,
~26 % faster than the pre-change baseline. What the branch cannot do is sustain **~50 minutes of
continuous load** — it handled 26 minutes across runs 1 and 2 and collapsed in the third. That
is a Free-plan capacity ceiling, not a repository defect, and the next diagnostic is the Neon
console's Usage page rather than more code.

**The rule held: no re-running.** The coordinator committed to stopping on the first reappearance
of drops rather than re-rolling until green, and did.

### React #418 escalated from "ticket for later" to the critical path, 2026-09-24

The gate after #11's second repair: unit **827** green, e2e phase 1 **56/56**, phase 2
**135/136**, no-DNS `init` green, and the **database section skipped** because the probe reported
the dev branch unreachable seconds after e2e had used it.

**The one failure was #11's AC-18, and it isn't about roles.** Both bodies were the admin's. The
first difference is the sign-out form. One side has the **server** markup (`action=""` plus a
hidden `$ACTION_ID`); the other has the **client-rendered** form
(`action="javascript:throw new Error('A React form was unexpectedly submitted…`). That's a #418
hydration failure regenerating `<main>` on one side. It's the same defect the capture fix found on
`/summary`, now on `/analysis`, a page with no client component of its own.

**Why it's now the critical path.** #418 is cross-cutting. Every e2e test that compares markup
across two JS-enabled loads is exposed to it: #11 AC-18, #9 AC-23, and five comparisons in #10's
stock-takes specs. It probably also explains #10's original "8-character inequality", which was
put down to `<!-- -->` being removed at hydration. Probes show normal hydration keeps them; a #418
regeneration drops them. **Decision:** fix the root cause instead of re-targeting each comparison.
The comparisons found a real bug and stay exactly as they are. A root-cause investigation is
dispatched, with a regression test required and "no speculative fix" if the cause isn't found.

**Probe false negative.** `db-probe.mjs` makes one attempt (8 s connect, 10 s bound) and no retry,
so one slow Neon moment silently turns a gate into a "database checks skipped" run that can't
close anything. One retry is being added in the same pass.

### Deferred on purpose, from the #11 review (2026-09-24) — do not lose these

- **Before building #21 (blocking for #21, not #11):** other features' "untouched files" tests
  read the **working tree** (`git status --porcelain -- <paths>` must be empty). They are
  durable only *after* a later feature commits. #21 edits `src/app/stock-entry`,
  `src/app/stock-takes`, `src/server/auth/**` and removes a `package.json` script, so #11's AC-25
  test (`analysis-contract.test.ts:274`, `:333`) and #7/#8/#10's equivalents go **red during
  #21's build**, and C2.1 needs a green gate *before* the commit. That is a deadlock unless 021's
  amendment table names these tests and changes them. The durable form: assert on the feature's
  **own commits** (a fixed, closed range), not the working tree. `docs/conventions.md`'s "absence
  is fine forever" is wrong in this one respect and needs the same correction.
- **#6 follow-up (a product question, not a test fix):** Next's action queue discards a pending
  server action's result when a navigation starts (`app-router-instance.js:131-140`). Two quick
  *Move* clicks on one page is a real user flow; the write still reaches the database, but the
  screen may show a stale order until the next render. The hardened test now starts every move
  from a clean page, so nothing covers back-to-back moves any more. Candidate for #15
  housekeeping.
- **App defect, `/summary` (found 2026-09-24):** about 3 % of JS loads throw React #418 (a
  hydration mismatch on an element), and React re-renders `<main>` on the client. Content looks
  the same to the user, but the page renders twice and client-rendered forms lose their
  progressive-enhancement `$ACTION` fields. Root cause not established; the next step is
  reproducing under `next dev`, which prints the diff. Evidence in
  `progress/impl_action_capture.md`.
- **App defect, a user-facing 500 (found 2026-09-24):** when a staff session posts the approve
  action, the refusal answers with a **307**, so the browser **re-POSTs** the action body to
  `/stock-entry?denied=count-summary`. That returns **500** (`Failed to find Server Action`).
  No data effect, but it is a 500 on a real path. A 303 would stop the re-POST.
- **Evidence rule, learned 2026-09-24:** a security test that passed with the security removed.
  #9's AC-15/AC-27 e2e read the rows ~65 ms after a forged POST left, before the server acted, so
  "nothing moved" held because nothing had happened yet. Only the brief's instruction to break
  the service and watch the test fail exposed it. **Every security assertion needs a
  red-by-breach proof, not just a green run.**
- **Watched, not fixed (2026-09-24): `tests/unit/lint-fence.test.ts` cold start.** Its first test
  pays ESLint's one-time start-up: **4.5 s against the 15 s `testTimeout`**. Every other test in
  the file runs under 50 ms. It timed out once, while an agent ran a build and e2e on the same
  machine concurrently, which the gate never does: the gate runs unit tests alone. It has passed in
  every gate this session. Revisit only if it fails in a gate.
- Skipped as overkill, with reasons: *Sign out* on `/analysis` (same component proven at
  `sign-in.spec.ts:197`); the small unvalued-lines tap target (exempt by the spec, a UX look
  later); `localeCompare` versus SQL collation for ties inside a test band.

### Gate after six days' rest, 2026-09-23 — test:db green, one #6 flake under a slow branch

**`test:db` passed inside a full gate for the first time: 22/22 files, zero connection
failures.** #11's database half is verified. Unit green (55 files). The allowance theory was
disproved by the owner's Neon usage screenshots: ~6 CU-hrs total across three branches since
1 Sep, a small fraction of any Free-plan allowance.

**e2e failed on one test that is not #11's:** `item-master-yards.spec.ts:397`, 006 AC-26/27, the
item-type reorder. Expected sortOrder 9001, rendered 9000 for the full 10 s. Only 56 of 192 e2e
tests ran, because `chromium-stock-entry` declares `dependencies: ["chromium"]` and one failure
in the first project skips all 136 of the second — including every #11 e2e test.

**Diagnosed as far as the evidence goes, and no further:**
- **Not debris.** The new dev branch was checked: 140 items, 19 types, 10 suppliers, no e2e rows.
  The previous explanation for this same symptom does not apply and was not reused.
- **Not a deterministic bug in #6.** The spec file run alone: **8/8 passed**, test 7 included.
- **Shape of the failure:** the test makes two writes in a row. *Move up* landed and rendered;
  *Move down*, the second, did not render within 10 s. The database was slow during that gate —
  `test:db` took **1278 s** against ~750 s on a healthy branch, 1.7x.
- **Unresolved:** pure timing under a slow compute, or a race between two consecutive actions.
  Not claimed either way.

**Not done, deliberately:** the 10 s `expect` timeout was not raised. Doing so would turn the
gate green while hiding the signal.

**Likely lever, the owner's to check:** compute size on **both** branches. Owner's usage figures
imply the test compute ran near 0.25 CU (0.49 CU-hrs over roughly two hours of heavy activity) —
an inference, not a measurement. e2e runs against **dev** and `test:db` against **test**, and both
were slow in the same run, so both matter. Raising the autoscaling maximum is the one change
that plausibly addresses the flake, the 1.7x slowdown and the earlier collapses together.

### Superseded: the unpooled test compute drops connections, 2026-09-14

**Phase A is built and cannot be gated.** Three consecutive full `init` runs, **zero assertion
failures in any of them**:

| Run | `test:db` | `test:e2e` | Failure signature |
|---|---|---|---|
| 1 | died at `prisma migrate deploy` | 13 failed / 130 ran | `P1001` unpooled; e2e timeouts |
| 2 | died at `prisma migrate deploy` | 6 failed / 37 ran | `P1001` unpooled; different tests |
| 3 (computes pre-warmed) | **ran**: 20 of 22 files passed | 1 failed / 56 ran | 3x `Can't reach database server`, **mid-run** |

Every failing test named a dropped connection. **No test disagreed with the code**, and the
tests that failed were different each time — the signature of infrastructure, not a defect.

**Pre-warming helped and did not fix it.** Opening a real Postgres session on each endpoint
first (~6.5 s each, a Neon cold start) got run 3 past `migrate deploy`, which the first two
never reached. The drops then moved into the middle of the suite.

**This is the answer to the question #20 wrote down.** 020's amendment framed the move to the
unpooled endpoint as an experiment in terms: *"If the unpooled endpoint still drops connections,
the pooler was innocent and the fault is the branch or the allowance."* It still drops
connections. **The pooler was innocent.** Reverting AC-15 would therefore not help, and the
three green runs #20 recorded were a healthy branch rather than a fixed one — which #20 itself
said it could not distinguish.

**Two things follow, and only one of them is ours.**

1. **Ours:** the gate's `[ok] database reachable` check is a **TCP probe** (`scripts/db-probe.mjs`
   opens a socket and holds no session), so it reports a sleeping or failing compute as healthy
   -- it printed `[ok]` immediately before `test:db` failed to connect, in all three runs. It
   also defaults to `TEST_DATABASE_URL`, the **pooler**, while the suite runs on
   `TEST_DIRECT_URL`, a **different compute**. A health check that answers about the wrong
   endpoint, by a method that cannot detect the fault, is worse than none. **Proposed fix, not
   yet made:** open a real session against the endpoint the suite will use, which both detects
   and warms. Deferred so it does not land mid-feature.
2. **The user's:** the Neon console -- the branch's compute state and autosuspend, and the
   project's compute allowance for the month. An exhausted allowance suspends computes and looks
   exactly like this. This is Part 1 of the plan written on 2026-09-11 and never carried out,
   because the branch recovered on its own both times and the question was dropped.

## Next

Spec, user approval, cold-phase implementation, gate, review, sign-off. Then **#16 deploy** --
the order the user chose on 2026-09-12, so the first real users see a complete picture rather
than counting into something they cannot review.

### Rules in force

- **The coordinator runs `init`; agents run targeted commands only.**
- **Only one `npm run test:db` in flight at a time.**
- **No gate while an agent is active on the tree.**
- Cold phases, not resumed agents. Reviewers told what not to re-derive, starting from
  `git diff`.
- **Report the token cost of every individual task, input and output separately** — the
  user's rule, 2026-09-14. One blended figure hides where the cost is. Measured on #10: input
  ran **462×** output and **97.7%** of input was *cache reads*, the conversation re-sent on
  every tool call. So an expensive task is almost always one that made many tool calls, not one
  that wrote a long report — which means the lever is fewer, more targeted commands, and
  never a shorter hand-back. Source of truth is the retained subagent transcripts
  (`~/.claude/projects/<project>/<session>/subagents/agent-<id>.jsonl`): input is
  `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`, output is
  `output_tokens`, **each `message.id` counted once**: a response is logged once per content
  block, and summing every record inflated input ~1.7–2x until this was found on 2026-09-24. The `<subagent_tokens>` figure in a completion notification is a different,
  smaller number and does not reconcile with those sums — do not present them as the same.

### Carried in

- **A layout guarantee asserted only against fixture data is a guarantee about the fixture.**
  #10's sharpest finding. Three routes each had a no-sideways-scroll assertion; all three
  passed; all three overflowed, because every fixture email is hyphenated and browsers break
  after a hyphen. `/analysis` still carries the bug and #11 owns the fix.
- **A claim about what an assertion protects, written without measuring, is wrong twice as
  often as it feels.** Both coordinator errors in #10 had that shape -- the one-sided badge
  bound and the 40-character floor. Measure, and let the measurement be what lands in the file.
- **A test added to satisfy a review finding is not evidence the finding's defect is gone.**
  #10's ADMIN repetition was correct, required, and would have passed with the bug still in.
  Verify the reasoning, not just the instruction.

- **The mapper rule** (#9): when a shape's key is a forbidden string, the boundary is crossed
  by a mapper in the service, not by a scan exemption for the screen.
- **A mutation turning something red is not evidence the right thing is protected.** #9 hit
  that three times — M7, M12, M14.
- **TypeScript does not protect the money boundary.** Assertions do.
- **020 AC-4** turns red if a table is added and not to `TRUNCATED_TABLES`. #10 needs no
  migration — every column it reads was shipped by #4.
- e2e: `retries: 0`, each spec reserving its **own** `periodYear` and deleting only its own
  (007 AC-30).
- The Neon test branch degraded twice on 2026-09-11 and recovered both times.

---

## Phase B — plan, started 2026-09-12

**Scope:** the two pages, `CalendarGrid`'s two optional props, the e2e specs, the mutation
proofs, the finished report. Phase A (pure modules + read services) is done and gated.

### Files expected to change

- `src/components/stock-entry/CalendarGrid.tsx` — two optional props, defaults reproducing
  today's rendering exactly (AC-4). The ONLY shipped source file this feature edits.
- `src/app/stock-takes/page.tsx` — the history calendar, replacing #3's placeholder.
- `src/app/stock-takes/counts/[id]/page.tsx` — the read-only detail, held-only by default.
- `src/components/stock-takes/ScopeSelector.tsx`, `CountJump.tsx`, `HistoryLines.tsx` — so
  AC-13's scan of that tree has something to read rather than passing by being empty.
- `src/lib/stock-takes-view.ts` — one added export, `stockTakesHref`, so the reading mode is
  spelled in ONE place across nine kinds of link on two pages (AC-16). Recorded as a
  deviation: the spec's module table lists two exports for it.
- `tests/unit/stock-takes-contract.test.ts` — Phase B's scan halves.
- `tests/unit/stock-entry-contract.test.ts` — AC-2's derived `loading.tsx` set, AC-21's
  census, and the two `playwright.config.ts` route patterns its AC-30 block pins.
- `playwright.config.ts`, `tests/e2e/support/stock-entry.ts` — AC-21.
- `tests/e2e/stock-takes-calendar.spec.ts` (2101), `tests/e2e/stock-takes-count.spec.ts` (2102).

### Approach

- The calendar calls `listCalendarMonth` ONCE, with no yard argument, then filters purely.
- `findNeighbourCounts` takes ONE cursor: the calendar calls it TWICE (month's first day for
  `previous`, its last day for `next`), the detail once with `{ date, countId }`.
- Every mapper field by field. No spread — typecheck does not hold this boundary.
- No role branch, no `loading.tsx`, no migration, no `"use client"`, no form on the detail.
- The default scope is never spelled into a URL; `?yard` rides every link when it is not it.

### Work log

- [x] `CalendarGrid` — two optional props, defaults are the old body. `/stock-entry/page.tsx`
      untouched; `git status` on it is empty, asserted.
- [x] `src/app/stock-takes/page.tsx`, `src/app/stock-takes/counts/[id]/page.tsx`,
      `src/components/stock-takes/{ScopeSelector,CountJump,HistoryLines}.tsx`.
- [x] `stockTakesHref` added to `src/server/counts/stock-takes-input.ts` (beside the parser
      it inverts), with five unit tests. Deviation, recorded in the report.
- [x] AC-2's derived `loading.tsx` set — 23 directories derived, floor 10, expectation 14.
- [x] AC-21 — `playwright.config.ts` two patterns (exactly four changed lines),
      `RESERVED_YEAR.takesCalendar = 2101` / `takesCount = 2102`, the 2100 note corrected,
      and the census now selects on `RESERVED_YEAR` rather than on a filename prefix.
- [x] `tests/e2e/stock-takes-calendar.spec.ts`, `tests/e2e/stock-takes-count.spec.ts`,
      `tests/e2e/support/stock-takes.ts` (new module, so the shipped support file is
      amended only as AC-21 names).
- [x] Phase B's scan halves in `tests/unit/stock-takes-contract.test.ts`.
      `npm run test:unit` 679 -> 699. lint and typecheck exit 0.
      **Three of my own new assertions went red against my own doc comments** — `/summary`,
      `itemsWithoutPrice` and a `listCalendarMonth(...)` in a comment. The comments were
      reworded; no assertion was loosened. That is the third and fourth time this project
      has hit it.
- [x] the AC-2 degradation proof. The signed-out GET stays a **307** — that refusal is the
      MIDDLEWARE's, which answers before any Suspense boundary — but the page's own
      `?yard=banana` redirect degrades from **307 with a Location** to **200 with none**, and
      the derived assertion goes red (`src/app/stock-takes/loading.tsx: expected true to be
      false`). Both codes and both failing test names are in the report. File removed;
      only `(public)/loading.tsx` remains.
- [x] the four mutation proofs. All four turned a test red; byte copies restored and verified
      by sha256. **No mutation is in the tree.** M4 also showed the compiler REFUSING the
      extra key (TS2353) as long as the mapper stays field by field — the mirror of Phase A's
      spread finding.
- [x] two defects found by my own tests and fixed at the source, not papered over:
      React's `<!-- -->` text separator made AC-13's byte comparison a race (8 characters,
      both directions, unreproducible in isolation), and both "no neighbour" e2e assertions
      depended on ANOTHER spec file's reserved year. Transcripts in the report.
- [x] the report — `progress/impl_stock_takes_history.md`, all 22 criteria across both phases.

**Phase B verification (targeted; the coordinator runs the gate):** `prisma validate`,
`typecheck`, `lint` exit 0; `test:unit` 48 files / **700 tests** (679 after Phase A);
`npm run build` exit 0 with both routes dynamic; `test:db` on the history service 26 tests;
the two new e2e specs **34 passed, 0 failed, 0 flaky, twice consecutively**; #7's
`stock-entry-calendar.spec.ts` (9) and #3's `role-access` + `sign-in` (14) pass **unmodified**.
E2E total goes 133 -> 167.

**One criterion is not met and is not mine to settle:** AC-19's 44 x 44 for a count BADGE.
Measured 47.14 x 29 on both calendars; making it taller would change #7's rendering, which
AC-4 forbids. Argued in the report under *What I could not prove*.

---

## Repair pass on #10 `stock_takes_history` — 2026-09-12 (CHANGES_REQUESTED)

Narrow repair. **Two test files only; nothing under `src/` changes.**

- [x] B1 — `tests/e2e/stock-takes-calendar.spec.ts` AC-19 and
      `tests/e2e/stock-takes-count.spec.ts` AC-19 loop over `["YARD_STAFF", "ADMIN"]`,
      following the AC-14 shape already in each file. Watch the 320 px measurement on
      `/stock-takes`: the identity header is outside `stock-takes-body` and `{user.email}`
      has no `break-words`. If it goes red I report it, I do not widen the viewport.
- [x] B3 code half — add `expect(takes?.height ?? 0).toBeGreaterThanOrEqual(24)` to
      *"AC-4, AC-19: the badge is the SAME box on both calendars…"*, with a comment saying
      why the bound is two-sided.
- [x] Prove the new lower bound by mutation in BOTH directions: shrink the badge in
      `src/components/stock-entry/CalendarGrid.tsx` (byte copy first), rebuild, run the one
      spec, show RED; restore, `sha256sum` against the copy, rebuild, show GREEN.
- [x] `npm run typecheck`, `npm run lint`. No `init`, no full `test:e2e` — the coordinator
      runs both.
- [x] Append `# Repair pass` to `progress/impl_stock_takes_history.md`.

**Result: all four boxes closed, and nothing under `src/` moved** —
`src/app/stock-takes/page.tsx` and `src/components/stock-entry/CalendarGrid.tsx` hash to the
values the reviewer recorded. The badge floor was watched going RED (`Expected: >= 24 /
Received: 8`) under the reviewer's own mutation and GREEN again after the restore; the three
older assertions in that test all passed under the same mutation, which is the finding. The
ADMIN repetition passes on both pages at 390 px and at 320 px, and a temporary
`expect(role).toBe("YARD_STAFF")` probe proved the second iteration really runs.

**One thing found that nobody asked for, and it is a source change so I did not make it:**
the identity header on `/stock-takes` DOES overflow — a hyphen-free 56-character email local
part gives `scrollWidth 394 > clientWidth 390`, failing at 390 px before 320 px is reached.
The shipped fixture cannot produce one, because `createTestUser`'s labels are full of hyphens
and browsers break after a hyphen, so the added ADMIN pass is green for a reason unrelated to
the role. The fix is `break-words` on `src/app/stock-takes/page.tsx:157` plus one long-label
case. Argued in the report under *What I found that was not asked for*; the coordinator rules.

Targeted verification only: typecheck 0, lint 0, 56 unit contract tests, three builds, and the
two e2e specs **34 passed** after every restore. `init` and the two full e2e runs are the
coordinator's. Database left clean: reserved-year counts 0, e2e users 0.

### Repair pass 2 — started 2026-09-12

**Ruling received: fix the identity-header overflow the previous pass found.** Two files, and
they land in the order that makes the fix a guarantee: TEST FIRST, watched RED against the
unfixed source; THEN the one-line source change, watched GREEN.

Files expected to change (only these two):

- `tests/e2e/stock-takes-calendar.spec.ts` — AC-19's calendar measurement signs one session in
  with an email whose local part is a single unbreakable run of >= 40 characters (no hyphens,
  no dots), with a comment naming what it is for.
- `src/app/stock-takes/page.tsx` — `break-words` on `<p data-testid="signed-in-email">`.
  `data-testid`, element type and text unchanged, because `sign-in.spec.ts` and
  `role-access.spec.ts` assert on that test id and must pass unmodified.

Baseline hashes (byte copies in the session scratchpad):

```
e19d220b70e1f4d060f4184b60cf3132a71c9dd69f6aa5c1f6dd5fc453ebc71b  src/app/stock-takes/page.tsx
c18abc21b16ccf1d35a74a9a352159154554e08eb28d31d5b6be541c28e7a6ad  tests/e2e/stock-takes-calendar.spec.ts
36f5940b1e944b15a66257060a0fab54cec75deda7edf096ec90e2cf7c95f4de  src/app/stock-entry/page.tsx   (MUST NOT MOVE - AC-22)
```

**Result: both files landed, in the order that makes the fix a guarantee.**

- [x] Test change alone; build; run the one spec; record RED. **First label (45 chars, over
      AC-19's floor of 40) went GREEN against the broken page, so I stopped before touching
      `src/` and diagnosed it**: at ~6.6 px per character a 45-char run is ~297 px and a 320 px
      viewport leaves 296 px inside `p-3` — one pixel inside the threshold. Lengthened to 61
      characters and got the RED the brief required: `YARD_STAFF 390 DUBLIN`,
      `Expected: <= 390 / Received: 424`. The shipped guard is set at the measured floor of 56,
      not at the spec's 40, because 40 admits a run that cannot fail.
- [x] Source fix — `break-words` (not `break-all`; it holds at 320 px) on
      `src/app/stock-takes/page.tsx:158`. Build, then the WHOLE calendar spec: **17 passed**.
- [x] `/stock-entry` measured with the same email, through a temporary probe that was restored
      byte-for-byte: `scrollWidth 424` against `clientWidth 390` and again against 320 —
      **identical to `/stock-takes`, to the pixel**. Evidence for the 008 AC-30 debt; the file
      itself still hashes to `36f5940b…c7c95f4de`, unopened for writing.
- [x] typecheck 0, lint 0, build 0 (twice each), 69 contract unit tests green. No `init`, no
      full `test:e2e` — the coordinator's.
- [x] `# Repair pass 2` appended to `progress/impl_stock_takes_history.md`.

Final hashes: `src/app/stock-takes/page.tsx` `ff4885130d5592…a9d7b0ae92`,
`tests/e2e/stock-takes-calendar.spec.ts` `53b7117c812307…8a771cb91`,
`src/app/stock-entry/page.tsx` unchanged at `36f5940b1e944b…c7c95f4de`.

**Found, not fixed:** `src/app/analysis/page.tsx:21` has the same unprotected header at
`text-base`, so it overflows sooner than either measured page, and nothing measures that route
on a phone. Recorded in the report beside the `/stock-entry` debt.

Database left clean: e2e users 0, long-label probe users 0, reserved-year counts 0.

---

## Phase A — plan, started 2026-09-14

**Scope: the arithmetic, not the screen.** The spec's *Services and pure modules* table with its
tests. `src/app/analysis/**`, `src/components/analysis/**` and `tests/e2e/**` are Phase B, and
the placeholder page — overflowing header included — is left byte-identical.

### Files expected to change

- `src/types/analysis.ts` (new) — every shape, no runtime.
- `src/lib/money.ts` — **extended**, two exports: `subtractDecimals`, `scaleToInteger` (bigint).
- `src/lib/analysis-chart.ts` (new) — pure integer layout, `buildTrendGeometry`.
- `src/lib/analysis-messages.ts` (new) — every literal a criterion quotes, #6/#7 re-exported.
- `src/server/reporting/period-series.ts` (new) — pure, built on `@/server/counts/period`.
- `src/server/reporting/analysis-input.ts` (new) — parsers + `analysisHref`.
- `src/server/reporting/analysis-service.ts` (new) — `getAnalysis`, `listApprovedPeriods`.
- `tests/unit/project-contract.test.ts` — AC-26's two permitted lists, 11 -> 12 and 2 -> 3.
- `*.test.ts` beside each pure module; `analysis-service.db.test.ts` for the database half.

### Approach, and the four things that decide the code

1. **Only `APPROVED` contributes a euro**; `SUBMITTED`/`DRAFT` are states, not zeros.
2. **A gap is never a zero, and a complete-but-empty period IS `"0"`** — six figures turn on it.
3. **No `Number(` anywhere under `src/server/reporting/**` or in the chart.** This is the rule
   that shapes the queries: the service can never build `{periodYear, periodMonth}` from a
   `"YYYY-MM"` string, so it reads the `StockCount` rows (at most one per yard per month) and
   derives each row's key with `formatPeriodKey` from the numbers **the database** gave it.
4. **No path to the price list.** `unitPriceSnapshot` only; nothing under `src/server/reporting/`
   imports `@/server/items/price-selection`.

### Work log

- [x] `src/types/analysis.ts`, `src/lib/money.ts` (+2 exports), `src/lib/analysis-chart.ts`,
      `src/lib/analysis-messages.ts`, `src/server/reporting/{period-series,analysis-input,
      analysis-service}.ts` — with a `*.test.ts` each and one `*.db.test.ts` (38 tests).
- [x] `tests/unit/analysis-contract.test.ts` — Phase A's scan halves (AC-4, AC-8, AC-10,
      AC-16, AC-17, AC-19, AC-21, AC-22, AC-25). 20 tests.
- [x] `tests/unit/project-contract.test.ts` — AC-26: `unitPrice` 11 -> 12 files,
      `unitPriceSnapshot` 2 -> 3, both as EXACT lists with the reason in the comment.
- [x] `src/lib/money.test.ts` — 009 AC-24's multiplication census amended from two entries
      to three (`scaleToInteger`'s step), as an exact list. Recorded in the report.
- [x] Two of my own doc comments went red against my own AC-8 scan (`ItemPrice`,
      `@/server/items/price-selection`). The comments were reworded; no assertion loosened.
      Fifth time this project has hit that.
- [x] All SIX of AC-27's mutations — every guarantee it names lives in Phase A's code. Each
      turned a named test red; both files restored and verified by sha256.
- [x] Targeted verification: typecheck 0, lint 0, `prisma validate` 0, src unit 581 passed,
      `tests/unit` 223 passed / **2 failed, both pre-existing** (see below), db file 38/38
      in 201 s.

### Found, and NOT mine to fix

`tests/unit/stock-takes-contract.test.ts` AC-22's two assertions read the WORKING TREE
(`git status --porcelain` / `git diff -- playwright.config.ts`) and expect #10's changes to
be uncommitted. They went red the moment `b468f60 feat(#10)` was committed and they are red
on a clean checkout of `c9b980c`. My tree touches none of the paths they watch. 011's
"passes unmodified" list names **010 AC-22**, so the spec's own instruction applies: report,
do not edit.

---

## Repair pass 3 — 010 AC-22's two expiring assertions (2026-09-14, separate session)

Dispatched against 010's seventh post-approval amendment, to unblock #11's gate. **Closed.**

- Only file changed: `tests/unit/stock-takes-contract.test.ts`. Both assertions moved from the
  working tree to the fixed range `ee448cb..HEAD`, base SHA in `SPEC_APPROVAL_COMMIT` with the
  reasoning in a block comment. Nothing loosened; no `src/`, spec, `feature_list.json` or #11
  file touched; nothing committed.
- Both proved still capable of failing, by committed mutation on a detached HEAD (`main` never
  moved, both probe commits abandoned). Restores verified by sha256 against byte copies.
- `npm run test:unit` 808/808 green (was 2 failed), typecheck 0, lint 0. `init`, e2e and db
  deliberately not run — the coordinator runs the gate.
- Full write-up, transcripts, hashes, the git audit and three reviewer notes:
  `progress/impl_stock_takes_history.md` -> "Repair pass 3".

---

## Feature 11 `analysis` — Phase B (the screen), started 2026-09-14

**Spec:** `specs/features/011-analysis.md` (approved `c9b980c`, 27 criteria).
**Brief:** Phase B owns the page, four components, the e2e specs, and whatever
`tests/unit/analysis-contract.test.ts` gains. Phase A's modules are gated and are NOT to be
edited — if one needs a change, report it.

### Files I expect to touch

- `src/app/analysis/page.tsx` — REPLACES the placeholder (not created: the `force-dynamic`
  census stays at 18).
- `src/components/analysis/PeriodGrid.tsx`, `VariancePanel.tsx`, `TrendChart.tsx`,
  `BreakdownTable.tsx` — new, none a client component.
- `tests/e2e/analysis-access.spec.ts`, `tests/e2e/analysis-figures.spec.ts` — new.
- `tests/e2e/support/analysis.ts` — new (fixtures; `tests/e2e/support/stock-entry.ts` is a
  shipped file and AC-25 lets me amend only `RESERVED_YEAR` there, as #10 did).
- `tests/e2e/support/stock-entry.ts` — `RESERVED_YEAR` gains `analysisAccess: 2103`,
  `analysisPrior: 2104`, `analysisFigures: 2105` (AC-24).
- `playwright.config.ts` — the two route patterns only (AC-24).
- `tests/unit/stock-entry-contract.test.ts` — the reserved-year census: every
  `RESERVED_YEAR.<key>` per file, 14 files / 15 keys, no key in two files (AC-24).
- `tests/unit/analysis-contract.test.ts` — Phase B's scan clauses.

### Approach

1. Page first: `requireAdminPage("analysis")`, `redirect("/analysis")` when
   `raw !== undefined && parsed === null` (Phase A deviation 7 — the parser cannot tell
   absent from unreadable), default period = last of `listApprovedPeriods` else the month
   containing today, then ONE `getAnalysis` call. The page computes nothing.
2. Four presentational components, handed values already built.
3. The identity header (AC-20): land the e2e measurement FIRST, watch it fail against the
   unfixed `text-base` header, then fix. Stop and report if it passes before the fix.
4. e2e specs, then the unit scan clauses.

### Log

- [ ] page + components
- [ ] header transcript (red before the fix)
- [ ] e2e specs
- [ ] contract clauses

- [x] `src/app/analysis/page.tsx` replaced; four components written. typecheck 0, lint 0,
      `npm run test:unit` 808/808 (Phase A's 20 contract scans pass over the new trees).
- [x] `RESERVED_YEAR` +3, `playwright.config.ts` two patterns (4 changed lines exactly),
      `tests/unit/stock-entry-contract.test.ts` census -> every key per file, 14 files /
      15 keys, invariant "no key in two files".
- [x] `tests/e2e/support/analysis.ts`, `analysis-access.spec.ts`, `analysis-figures.spec.ts`.
- [ ] NEXT: AC-20 — run the phone test against the UNFIXED `text-base` header and record
      the red transcript BEFORE touching it. Stop and report if it passes.
- [x] AC-20 landed RED first (`scrollWidth` 478 vs 390 = 88 px), measured the break-even at
      `text-base` (51 chars at 390, 42 at 320, ~7.1 px/char), then `break-words`. Green.
- [x] AC-2 proof (PROTECTED_PATHS without /analysis -> still 307) and AC-3 proof
      (loading.tsx -> 200, no Location). Both restored; auth-config sha256 identical.
- [x] `tests/unit/analysis-contract.test.ts` +2 clauses (AC-25's seven screen trees,
      AC-14's no-charting-library). `npm run test:unit` 809/809.
- [x] Both analysis specs together: 25/25.
- [ ] BLOCKER FOR THE GATE, NOT MINE: the development database holds orphaned item-master
      fixture rows from an aborted earlier run (`*_E2E-A9B9C08BB514` item types at
      sortOrder 9001, 2 suppliers, 4 items, 1 StockCount at 2095). They sit inside the
      sortOrder band `item-master-yards.spec.ts` reserves for worker 0, so its AC-26/AC-27
      test fails (9001 where it expects 9000) - which fails the `chromium` project and
      makes the whole `chromium-stock-entry` project (136 tests, mine included) not run.
      Reported, NOT deleted. See progress/impl_analysis.md -> Phase B.
- [x] Whole `chromium-stock-entry` project, `--no-deps`, 3 workers: **136 passed (4.0m)**,
      0 flaky, exit 0 — every spec that shares the count tables with `/analysis`, mine
      included. That is the strongest run available while the orphans block the first
      project.
- [x] `progress/impl_analysis.md` -> `## Phase B` written: files, the AC table, the AC-20
      transcript both ways round with the measured sweep, the AC-2 and AC-3 proofs, the
      restore hashes, seven deviations, what could not be verified, six findings and the
      reviewer notes.
- [x] Left clean: no probe, no `.bak`, no `loading.tsx`, `test-results/` removed.

**Phase B complete. Not marked done — that is the reviewer's.**

## Repair pass 4 (subagent, 2026-09-14) — the three flaky assertions

- [x] AC-9 (`stock-takes-count.spec.ts:307`) and AC-12/AC-13 (`:404`): byte identity kept,
      the two globally-derived neighbour ids masked by `maskForeignNeighbours`, the owned
      jumps asserted directly. Length assertion and the hydration guards untouched.
- [x] AC-17 (`stock-entry-quantities.spec.ts:602`): the bare-number-vs-whole-HTML test is
      now a standalone-number search over the application's own markup plus the rendered
      text, with the action-key collision pinned as a permanent non-vacuity case.
- [x] Both directions proved for all three; the pair run three consecutive times, green.
      Full write-up, transcripts and restore hashes: `progress/impl_stock_takes_history.md`
      -> "Repair pass 4".
- [ ] NOT MINE, FOUND ON THE WAY: `stock-takes-count.spec.ts:360` (AC-11) asserts the
      approved 2102 count has no *Next count*, but #11 reserved 2103/2104/2105 and seeds
      DUBLIN counts in them. That assertion is false whenever an analysis spec is running
      beside it. Also `:481` (AC-14) has the same neighbour exposure the mask fixes
      elsewhere. Neither touched.

## Repair pass 5 (subagent, 2026-09-14) — the two assertions repair pass 4 reported

Brief: 010's **tenth** post-approval amendment. Only `tests/e2e/stock-takes-count.spec.ts`
(and `tests/e2e/support/stock-takes.ts` if needed). No `src/`, no spec, no
`feature_list.json`. No `init`, no full `test:e2e`, no `test:db`.

- [x] Byte copies + `sha256sum` taken before any mutation.
      `stock-takes-count.spec.ts` = `1872f8f5…2b128b`, `support/stock-takes.ts` = `0924c38d…cf2ae6`
      (both identical to repair pass 4's recorded finals).
- [x] Baseline red: the trio (`stock-takes-count` + `analysis-access` + `analysis-figures`)
      against the UNREPAIRED file, to reproduce the AC-11 failure the tenth amendment predicts.
- [x] Repair 1 (AC-11, ~386-391): drop "2102 is the highest reserved year". Replace with a
      scenario whose neighbours this file owns.
- [x] Repair 2 (AC-14, :481): `maskForeignNeighbours` at the assertion + `jumpTargets` on the
      owned jump, exactly as AC-9/AC-13 were repaired in pass 4.
- [x] Red transcripts for both, mutations on byte copies, restores verified by hash.
- [x] The trio run SEVEN times: three green (42 passed, exit 0), four lost to the Neon
      branch dropping connections. Never an assertion. See the Outcome below.
- [x] `# Repair pass 5` appended to `progress/impl_stock_takes_history.md`.

**Outcome.** Repair 1 removed the "nothing exists after" claim entirely — it is not repairable
in any spec against a shared database — and replaced it with February's count, whose BOTH
neighbours this file created. Repair 2 applied `maskForeignNeighbours` + `jumpTargets` at
AC-14's assertion. Baseline red reproduced the tenth amendment's failure exactly; eight
mutations proved both directions; the trio ran seven times, three of them `42 passed` exit 0
(the other four fell to the Neon branch dropping connections, never to an assertion), and
AC-11 and AC-14 passed in every invocation in which they ran.

- [ ] NOT MINE, FOUND ON THE WAY: `stock-takes-calendar.spec.ts:330` asserts the SAME false
      premise ("2102 is the highest reserved year") at `?month=2103-01`, and
      `analysis-access.spec.ts` seeds approved DUBLIN counts dated 2103-10-31, -11-30 and
      -12-31. Expect it to fail on the full gate run. Once it is repaired the same way,
      `CountJump`'s DISABLED rendering has no browser-level owner left; a component test of
      `CountJump` with `href: null` is the durable home. See "Repair pass 5" -> Findings.

---

## Repair pass on #11 `analysis` (subagent, 2026-09-24) — CHANGES_REQUESTED, B1 + B2

Brief: scratchpad `fix11.md`. Review: `progress/review_analysis.md`. Spec's 2026-09-24
post-approval amendment (AC-6, AC-9, AC-16, AC-20, AC-25). Spec and `feature_list.json` NOT
edited. No `init`; one `test:db` (the analysis-service file, under M6) at most.

### Files expected to change

- `src/app/analysis/page.test.ts` (new) — B1: server render of the page, services mocked, no DB.
- `tests/e2e/analysis-access.spec.ts` — B1 comment + dead branch; O2 cookie order; O7 clicks;
  AC-6 `Incomplete` assertion.
- `tests/e2e/support/analysis.ts` — `approvedCountTally` goes if the dead branch goes.
- `tests/e2e/analysis-figures.spec.ts` — `Incomplete` in the total cells.
- `tests/unit/analysis-contract.test.ts` — B2 two absences; O1 anchored staff-thunk scan.
- `tests/unit/project-contract.test.ts` — B2 bound on the twelfth entry.
- `src/lib/analysis-messages.ts` (+ test) — `INCOMPLETE`; O9 `SEE_THE_ITEMS`.
- `src/components/analysis/PeriodGrid.tsx`, `BreakdownTable.tsx` — `Incomplete` total cells.
- `tests/unit/stock-entry-contract.test.ts` — O10 distinct values.
- `scripts/run-e2e.mjs` — header caveat sentence.
- `progress/impl_analysis.md` — `## Repair pass` appended.

### Log
- [x] Baseline byte copies + sha256 in scratchpad `fix11/` (page `3ad2c86f…`, service `1eec466b…`).
- [x] B1: `src/app/analysis/page.test.ts` — 5 tests, server render, no DB. Needed `React` on
      `globalThis` (Vitest's esbuild uses the classic JSX runtime under `jsx: preserve`); done
      in the test file only, no config edited. RED with `€0.00` planted in the empty branch;
      restored, hash `3ad2c86f…` identical.
- [x] `INCOMPLETE_TOTAL` added, `SEE_THE_ITEMS` removed (spec never quotes it); PeriodGrid and
      BreakdownTable total cells use it.
- [x] B2 clauses (analysis-contract), bound (project-contract), O1 anchored scan, O10 values,
      O2/O7/AC-6 e2e edits, dead branch deleted, runner caveat. typecheck 0, lint 0, 5 unit
      files 90/90.
- [x] M6 (review's, verbatim): 3 new clauses RED, 40 old green, `tsc` 0. `test:db` on the one
      file under M6: 1 failed / 37 passed, exit 1 — operation 4 at `.db.test.ts:605`, Clonmel
      15.71775 -> 582.71775 exactly as the reviewer predicted. Restored, `1eec466b…` identical.
- [x] O1 variants A and B on the staff thunk: new scan RED in both; the OLD clause stayed GREEN
      under B (throw kept, object returned). Restored, `1eec466b…` identical.
- [x] AC-16 extra: UTC month instead of the yard's -> pinned test RED. Restored `3ad2c86f…`.
- [x] Targeted e2e (both analysis specs, chromium-stock-entry, --no-deps, fresh build):
      **25 passed**, exit 0.
- [x] `## Repair pass` appended to `progress/impl_analysis.md`, plus two correction lines in
      Phase B. Final hashes recorded there. Nothing committed; `init` not run.

**Repair pass complete. Not marked done; that is the reviewer's.** Left for the leader: the trend
table's gap cells still read `Not counted` (outside the brief's two named cells), and a
`vitest.config.ts` JSX-runtime alternative that would need an AC-25 amendment.

---

## Root-cause pass: React #418 hydration failure (subagent, 2026-09-24)

Brief: scratchpad `fix-418.md`. Report: `progress/impl_hydration_418.md`. No `init`; e2e on
port 3000 (mine for this pass); `test:db` only if needed, one at a time.

### Plan
1. Reproduce on a production build with the raw document bytes captured per load, plus a
   `pageerror` listener; then under `next dev` for React's printed diff. Rebuild after dev.
2. Find the cause from the evidence; fix in `src/` only if the evidence names it.
3. Regression e2e: many loads of the affected pages, zero hydration errors; red by putting
   the cause back, then green.
4. Correct the `<!-- -->` comments in `stock-takes-count.spec.ts` / `support/stock-takes.ts`
   only if the root cause confirms it.
5. `scripts/db-probe.mjs`: one retry after a short pause; prove unreachable -> exit 1
   (bounded) and healthy -> exit 0; note in `docs/verification.md`.

### Log
- [x] Reproduced on a production build (dev: 0/40, too slow to race). Raw HTML of failing and
      clean loads is byte-identical (sha256), so the server is not the variable.
- [x] Instrumented the built React chunk (temporary, `.next` only): every mismatch is a
      REPLAY of a suspended host fiber during hydration (`main` on /summary, `tbody` on
      /item-master), cursor already on its own first child. Cause: Flight defers elements
      past 3,200 chars into lazy rows; hydration starts before the parser reaches them.
- [x] Fix: `src/components/HydrationGate.tsx` + `src/app/layout.tsx` (hold hydration until
      the document is parsed). Fixed build: 0 mismatches / 0 host replays / 0 pageerrors in
      300 loads (5 pages x 60).
- [ ] Regression e2e, red then green. [ ] comments in stock-takes specs. [ ] db-probe retry.
- [x] RED (layout.tsx = HEAD, gate unused): `npm run test:e2e -- <2 files> --no-deps -g loads`
      -> all 6 `/summary` batches failed, 12 of 96 loads (#418 + `<main>` removed, every one).
      The count-free file (`/analysis`, `/item-master`, `/stock-takes`, 32 loads each) stayed
      green on the unfixed build: 0 of 96. Dropped it -- a test never seen red is not a
      regression test; `/summary` is the proven detector. Copy kept in scratchpad.
- [x] Test hardened: two pages load `/summary` at once per batch (6 batches x 2 x 14 = 168
      loads). RED on the unfixed layout: 6/6 batches failed, 20/168 loads (#418 + `<main>`
      removed). Fixed layout restored from byte copy, sha256 a7afeed2... identical.
- [x] db-probe: one retry after 2 s (`ATTEMPTS = 2`, `PAUSE_MS = 2_000`), output unchanged.
      Real runs: dev + test endpoints exit 0 on attempt 1 (4.0 s, 5.4 s); db.invalid exit 1
      after 2 attempts (6.9 s); 10.255.255.1 exit 1 after 2 attempts (22.4 s); first attempt
      forced to fail + real dev DB -> exit 0 on attempt 2. 4 new unit tests; 3 go red on the
      probe without the retry (restored, sha256 5c778748... identical to the retry copy).
- [x] `src/components/HydrationGate.test.ts` (3 tests): server markup identical, waits for
      DOMContentLoaded while loading, no wait once parsed. M1 (no wait) and M2 (wrapper div)
      each turn it red; restored, sha256 604f4b89... . typecheck 0, lint 0, test:unit 56
      files / 831 green before this file was added.
- [x] Comments corrected: `stock-takes-count.spec.ts` (~:462), `support/stock-takes.ts`
      (`bodyOf`). Assertions untouched.
- [ ] Full `npm run test:e2e` on the final tree (running).
- [x] Full `npm run test:e2e` on the final tree: phase 1 56/56; phase 2 141 passed, 1 failed:
      `stock-entry-filters.spec.ts:302` (expected "81 not counted", got 82). Trace: the
      autosave POST took 959 ms and the next `goto` began 382 ms after it, so the server
      rendered before the write. PRE-EXISTING: on the UNFIXED layout it failed 2 of 3 runs,
      same text; with the gate 2 of 3. Not caused by this pass; not fixed (not mine).
- [x] Full test:unit after the retry: 2 existing probe tests timed out (22 s vs 15 s; one
      `db.invalid` attempt took its full 10 s under load). Harness fixed, assertions not:
      async spawn + `PROBE_TEST_TIMEOUT_MS = 40_000` (the probe's documented worst case).
      Red re-proved (3 fail without the retry). Two full runs: 57 files / 834 green.
- [x] Fixed build at 4x CPU, instrumented: 0/120 mismatches (unfixed at 4x: 6/60).
- [x] Clean final `npm run build` (chunk sha256 back to 2c752a40..., no hooks). Dev DB census
      identical to the start (4/4/2/10/19/140/129/152/0/0).
- [x] `docs/operations.md`: the probe's "ten second timeout" line updated for the retry.
- [x] Report written: `progress/impl_hydration_418.md`. Nothing committed; `init` not run;
      `feature_list.json` untouched. For the leader: 003 AC-24's "within 10 seconds" wording
      vs the retry, and the pre-existing `stock-entry-filters.spec.ts:302` autosave race.

## Final pass on the #418 fix (review_repairs_0924 R-1, O-2..O-6), started 2026-09-24 15:03

Brief: leader's scratchpad `fix-trims.md`. No feature status change; `init`/`test:db` not run.
Files: `tests/e2e/stock-entry-approve.spec.ts` (6 -> 3 batches), `src/app/layout.test.ts` (new,
static pin of `<HydrationGate>{children}</HydrationGate>` as `<body>`'s only child, via the
TypeScript AST), `src/components/HydrationGate.tsx` (resolve on `readystatechange` too; O-2/O-3
comment), `src/components/HydrationGate.test.ts` (new path + mutation re-proofs),
`scripts/db-probe.mjs` + `docs/verification.md` (O-5 wording), `tests/e2e/support/database.ts`
(O-6 comment only). Byte copies in `scratchpad/trims/before/`.
Red proof: build with HEAD layout -> `-g "#418"` red; static test red on HEAD layout; restore
(sha256 a7afeed2...), rebuild, green.
- [x] Gate: resolves on `readystatechange` (readyState !== "loading") as well as on
      DOMContentLoaded; O-2/O-3 sentences added. Unit test: +2 cases (interactive, complete),
      5/5 green. Mutations G-M1..G-M7 all red where expected (old four unchanged in effect;
      new: listener removed, check removed, check narrowed to "complete"). Restored, sha256
      a5cc932b... = scratchpad copy.
- [x] `src/app/layout.test.ts` (2 tests, TypeScript AST): green on current layout.
- [x] RED at the new shape (layout.tsx = HEAD blob, sha256 1f2f01ba...): `layout.test.ts` 2/2
      red; build + `-g "#418"` -> 3 failed, 10 of 84 loads (#418 + `<main>` removed each).
      Layout restored from byte copy, sha256 a7afeed2... .
- [x] Static pin: layout mutations L-M1..L-M4 (wrapper div, host under gate, sibling,
      stand-in import) each red; restored a7afeed2... .
- [x] GREEN: restored layout, new gate, rebuild -> `-g "#418"` 3 passed (1.1m); whole
      approve file 9 passed (2.4m).
- [x] O-5 (db-probe.mjs header, verification.md §5) and O-6 (support/database.ts) comments.
- [x] typecheck 0, lint 0. test:unit: run 1 one timeout in lint-fence.test.ts (cold ESLint,
      15 s default; whole run slow, 65 s); runs 2 and 3 green, 58 files / 838 tests.
      Not mine to fix; noted for the leader. Dev DB census 4/4/2/10/19/140/129/152/0/0.
- [x] Report: `progress/impl_hydration_418.md` -> "Final pass (review recommendations)".

## Feature 21 `pin_auth` — Phase 0 only (AC-44..AC-47), implementer, started 2026-09-25

Brief: leader's scratchpad `impl21-p0.md`. #21 already `in_progress`. No other #21 change; no
`init`, e2e or `test:db` (coordinator runs the gate). Report: `progress/impl_pin_auth.md`.

### Files I expect to touch
- `tests/support/feature-scope.ts` (new) — the one helper: `isAttributedTo`, `featureStatus`,
  `commitsOf`, `filesTouchedBy`, `changedLinesBy`, `workingTreeChanges`; read-only git
  (`--no-optional-locks --literal-pathspecs`, `log --full-history`), fails closed.
- `tests/unit/feature-scope.test.ts` (new) — AC-44 on throwaway temp repos (a)-(h), index and
  refs unchanged across every call; AC-45's scan (porcelain arguments, the two banned strings).
- The five test files of the Phase 0 table: rows 1-10, 12-16 converted; row 11 byte-identical.
- `docs/conventions.md` — *Tests* bullet replaced, *Commits* scope rules (AC-47).

### Approach
Per-commit `git show --no-renames` (files / zero-context patch, hunk-state parser so content lines
starting `++`/`--` survive and headers do not); working tree via `status --porcelain=v1 -z
--no-renames --untracked-files=all` and `diff HEAD` + untracked file lines. AC-46 proofs in a
detached `git worktree` under the scratchpad (scratch commit of Phase 0 on HEAD), node_modules
junction removed on its own before `git worktree remove`; main's HEAD / for-each-ref / status
recorded before and after.

### Log
- Helper `tests/support/feature-scope.ts` + `tests/unit/feature-scope.test.ts` written; rows 1-10,
  12-16 converted, row 11 byte-identical (sed range cmp vs byte copy); conventions updated.
  typecheck 0, lint 0; five files 135/135; feature-scope 15/15.
- AC-46: main state recorded (`scratchpad/p0/main-before.txt`); worktree `scratchpad/p0/wt`
  detached, scratch commit 3f609b4 `test(#21): phase 0 scratch, worktree only`; node_modules
  junction inside it (git sees it as an ignored dir -- tested first on a scratch repo).
  Remove the junction ON ITS OWN (`cmd /c rmdir`) before `git worktree remove`.
- AC-46 first attempt: converted rows behaved exactly per the table, but 7 schema-and-migration
  CONTENT tests failed in every run incl. R0 -- and on the clean worktree with no probe. Cause:
  the worktree was checked out CRLF (system core.autocrlf=true); main is LF. NOT MINE: that
  test's schema parser is not CRLF-tolerant (a fresh Windows clone would fail it too). Noted for
  the leader. Junction removed alone, worktree removed; re-creating it with
  `-c core.autocrlf=false` so it matches main. First logs kept: `p0/*-crlf-checkout*`.
- AC-46 LF worktree (START cea3752): R0-R5 exactly per table, 0 other failures. Running R6-R11.
- AC-46 R6-R11 exactly per table; 8 helper mutations all red (M8 via index bytes); worktree torn down, main before/after identical. Running test:unit x2.
- test:unit x2 green: 59 files / 853 tests (was 58/838; +feature-scope's 15). typecheck 0, lint 0.
  Five files' test titles identical (sha256) and counts unchanged. No temp repos left in $TEMP.
  Scratch/probe commits unreachable (0 refs, no reflog). Report: `progress/impl_pin_auth.md`
  -> "## Phase 0". Coordinator still owes AC-47's init run and the `test(#21): ` commit.

## Feature 21 `pin_auth` — Phase A (pure + crypto modules), implementer, started 2026-09-25

Brief: leader's scratchpad `impl21-a.md`. #21 already `in_progress`. Purely additive: the email
sign-in keeps working. No `prisma/`, `auth-config.ts`, `middleware.ts`, page, component or
`tests/e2e/` edit; no `init`, e2e or `test:db`. Report: `progress/impl_pin_auth.md` -> `## Phase A`.

### Files I expect to touch
- `src/lib/auth-messages.ts` — ADD every AC-39 message/label + the three length constants; keep
  the two email-era messages (Phase B removes them).
- `src/server/auth/credential-rules.ts` (new) + `.test.ts` — AC-7.
- `src/server/auth/account-lock.ts` (new) + `.test.ts` — AC-11.
- `src/server/auth/attempt-budget.ts` (new) + `.test.ts` — AC-13.
- `src/server/auth/password.ts` — ADD the nine PIN/device/setup functions; keep hashPassword /
  verifyPassword. `password.test.ts` gains AC-5, AC-16 token half, AC-28 comparison half.
- `src/lib/auth-messages.test.ts` (new) — AC-39's module half.

### Approach
- Secrets read lazily per call as `process.env.<NAME>` in password.ts only; tests set synthetic
  values with `vi.stubEnv` (no `process.env.X` text in tests). Pepper: base64 alphabet, >= 32
  decoded bytes, else a named error whose message names the variable and no part of the value.
- `verifyPin(pin, null)` compares against a once-per-process bcrypt of random bytes, so the
  service always pays exactly one bcrypt.
- Device token `v1.<32 hex id>.<exp s>.<hex mac>` under a key derived from AUTH_SECRET; the MAC
  compared as a string so every character is significant.
- `bucketFor(kind, deviceId)` takes the VERIFIED id (the module is pure; password.ts is the only
  AUTH_SECRET reader); token cases tested through `bucketFor(kind, verifyDeviceToken(t))`.
- Tests: no PIN/setup-code literal; test sources build the two crypto-call names from parts so
  AC-6's future detector sees one file.

### Log
- Five modules + tests written; the five files 82 tests green after two test-defect fixes (fresh-module error class; over-broad source regex). typecheck 0, lint 0.
- 11 mutations (M1-M11) each red in its own file, restored by byte copy; sha256sum -c OK x5.
- Report written: progress/impl_pin_auth.md -> ## Phase A. typecheck 0, lint 0, test:unit x2 = 63 files / 930 tests. Phase A complete for the implementer; Findings 1-2 (AC-39 vs AC-40, AC-8 vs AC-39) need the leader.

## Feature 21 `pin_auth` — Phase B (the swap), implementer, started 2026-09-25

Brief: leader's scratchpad `impl21-b.md`. #21 already `in_progress`. One pass: schema +
migration, services, Auth.js, `/sign-in` + `PinPad`, `IdentityHeader`, every `email` reference,
e2e helpers + the four permitted substitutions. No `init`. Report: `progress/impl_pin_auth.md`
-> `## Phase B` (work log there, finished and verified steps only).

### Files I expect to touch
- `prisma/schema.prisma`, new `prisma/migrations/<ts>_pin_profiles/`, `specs/domain-model.md` Part 3,
  `tests/unit/schema-and-migration.test.ts`, `tests/unit/project-contract.test.ts` (AC-1, AC-2).
- `src/server/test-db.ts` + `test-db.test.ts`, `stock-takes-contract.test.ts` eight-entry check (AC-4).
- `src/server/auth/`: new `sign-in-service.ts`, `operator-service.ts`, `profile-admin-service.ts`
  (`resetProfilePin` only, for AC-17/AC-24); `user-service.ts`, `session-user.ts`, `session.ts`,
  `next-auth.ts`; `src/lib/auth-config.ts` (epoch in the JWT); `src/types/next-auth.d.ts`.
- `/sign-in` page, `auth-actions.ts`, form state, `src/components/PinPad.tsx`, `SignInForm.tsx`,
  `src/components/IdentityHeader.tsx`; headers of `/stock-entry`, `/stock-takes`, `/analysis`,
  `/stock-entry/new` (`counting-as`).
- `src/lib/count-audit.ts`, `count-lifecycle-service.ts`, `types/stock-count.ts` (actorRef, S13).
- `/api/session`, `/api/users` shapes. `src/lib/auth-messages.ts` loses the two email-era messages.
- Every unit/db test fixture that built a `SessionUser`/`User` with email/hash (fixture only).
- `tests/e2e/support/users.ts`, `support/stock-entry.ts`, the 19 specs (four substitutions only),
  `sign-in.spec.ts` rewrite, `route-protection.spec.ts` phone test -> AC-35, new `pin-*.spec.ts`.

### Approach
- Outcome channel: `authorize` calls `attemptSignIn` only; a non-success throws a coded
  `CredentialsSignin` subclass so the server action (raw mode rethrows) and the HTTP callback
  (redirect `?code=`) both see one evaluation. Device cookie read from the request's cookie
  header, set with `next/headers` `cookies()` on success in both transports.
- Epoch: `authorize` returns `sessionEpoch`; the JWT carries `epoch`; `getCurrentUser` requires
  `ACTIVE` + a username + `epoch === row.sessionEpoch`; no epoch claim -> refused.
- Known phase-boundary problem: deleting `scripts/admin-create.ts` (it cannot compile once
  `createUser` goes) turns two shipped unit tests red whose amendments (AC-6, AC-41) name
  Phase C's `scripts/pin-reset.ts`. Decide once the core is green; report either way.

### Log
- Schema + `20260925120000_pin_profiles` written; applied to test DB then dev DB (`migrate deploy`).
  Dev census before/after identical for stock tables; User 33/33 (33 active -> 33 ACTIVE, 8 ADMIN).
  The brief said 4 leftover e2e users; there are 33 (all e2e domain). None deleted.
- Services, Auth.js, `/sign-in` + PinPad, IdentityHeader, audit `actorRef`, every src email ref: done;
  tsc 0, lint 0. Unit: only 020 AC-6 (finding B1) and the two reset-script tests (B4) red.
- New db tests (AC-3, sign-in service, session/reset, AC-38) green; 004 AC-24 db census red (B2).
- 4 security mutations red then restored (sha256 OK). e2e run 1: phase 1 79/79, phase 2 132/139,
  the 7 = finding B3 (literal fixture names). Report: `progress/impl_pin_auth.md` -> `## Phase B`.
- Full test:db attempt stalled on test-branch connectivity (infra); killed, re-probed, restarted.

## Coordinator — Phase B interrupted; findings ruled; database-run collapse diagnosed, 2026-09-25

- The Phase B implementer was killed by an API network error (`ENOTFOUND`) mid-task. Its log
  (`progress/impl_pin_auth.md` → Phase B, work-log steps 1–11) matches the tree. Typecheck and
  lint are clean; the three unit tests that fail are exactly B1 and B4.
- **B1–B5 ruled** in `specs/features/021-pin_auth.md` → *Five findings by Phase B*: AC-1, AC-2
  and AC-40 amended, 020 AC-6 and 004 AC-24 annotated, `feature_list.json` re-mirrored (only #21
  changed). B4 moves AC-30 and AC-41's test-and-docs part into Phase B, so its gate can be
  green before its commit.
- **The collapsed full `test:db` runs (340 of 432 failing) are the network, not the code.** A
  full re-run with nothing else running, sampling `pg_stat_activity` every 15 s, gave 428 of
  432, with every Phase B file passing:
  - one failure is B2;
  - one is a dropped connection at the same second the sampler's own connection dropped;
  - two are 30 s timeouts; both files then passed 57/57 on a re-run.

  Postgres stayed idle throughout (at most 5 backends, no lock waits, no transaction older than
  2 s), and the machine was fine. The link was not: `SELECT 1` ran at 78–102 ms median against a
  22–37 ms best, and the Wi-Fi hop to the router alone measured 13 ms median and 38 ms at p90. A
  suite of sequential round trips runs about 3× slower on that link, and 30 s timeouts begin to
  fire. My first hypothesis, that the new sign-in tests slow what runs after them, was **wrong**:
  the same slowdown appeared with those tests running last.
- **Operating rule from this:** a full-suite failure made of connection errors or timeouts is
  first checked against the link (`scratchpad/rtt.cjs`, `sampler.cjs`) before any code is
  suspected. The gate is never "fixed" by raising a timeout or adding a retry.

## Feature 21 `pin_auth` — Phase B continuation, after the rulings, implementer, started 2026-09-25

Brief: leader's scratchpad `impl21-b2.md`. #21 stays `in_progress`. Report: appended to
`progress/impl_pin_auth.md` -> `## Phase B` -> `### Continuation, after the rulings`.

### Files I expect to touch
- `src/server/test-db.test.ts` (B1, 020 AC-6 unit half amended by 021 AC-1).
- `src/server/schema/columns.db.test.ts` (B2, 004 AC-24 re-spelled by 021 AC-2).
- `tests/e2e/stock-entry-approve.spec.ts`, `stock-entry-start.spec.ts`, `stock-entry-submit.spec.ts`
  (B3, AC-40's fifth substitution, eleven sites).
- `src/server/auth/operator-service.ts` (+ `listProfilesForOperator`, `setCredentialsForOperator`),
  new `scripts/pin-reset.ts`, `package.json` (`pin:reset`), new `src/server/auth/pin-reset.db.test.ts` (AC-30).
- `tests/unit/no-default-password.test.ts`, `docs/operations.md` (AC-41's Phase B part).
- Not touched: `.env.example`, `Samples/`, `feature_list.json`, `tests/support/feature-scope.ts`.

### Approach
- B1/B2: amend exactly per the rulings; prove B1 red on a byte copy (two breaches), sha256 restore.
- B3: interpolate the denoted user's `name`; `stock-entry-start.spec.ts:336` stays negative.
- AC-30: script spawned with `tsx` like 003's admin-create test; every exit covered; output scanned
  for the NEW_PIN value, pinHash, pinKeyId, account key. Four breaches red, restored by sha256.
- Targeted db runs only, one at a time; re-run once on a connection error/timeout.

### Log
- B3 applied: 11 sites, 5th substitution (template interpolation of the denoted user's `name`);
  `stock-entry-start.spec.ts:336` stays `.not.toContain`. No `E2E Yard Staff`/`E2E Administrator` left in tests/e2e.
- B1 done: `test-db.test.ts` AC-6 amended by 021 AC-1; red under `SetupClaim.id @default(1)` (noDefault = [AccountLock.accountKey])
  and under `accountKey @default(cuid())` (11 cuids); schema restored, `sha256sum -c` OK (05da2fd1…); 8/8 green.
- B2 edited: columns.db AC-24 re-spelled (first two rows, all finished, no count); pin-schema.db gains 021 AC-2 third-row pin. Not yet run.
- AC-30 written: operator-service (+listProfilesForOperator, +setCredentialsForOperator), scripts/pin-reset.ts,
  `pin:reset`, src/server/auth/pin-reset.db.test.ts. Not yet run.
- AC-41 Phase B part written: no-default-password amended; docs/operations.md sections replaced.
  Shaped to the widened detector: run-db-tests.mjs (runPepper()/runSetupCode()), pin-auth-contract:239 (built from parts).
- Breach prints-pin: 2 red (both success runs, leak count 1), 19 green; restored, sha256 OK.
- Breach no-epoch: 2 red (both success runs, epoch 0 not 1), 19 green; restored, sha256 OK.
- Breach create-admin: 1 red (["--create-admin"], exit 0), 20 green; restored, sha256 OK.
- Breach not-active: 3 red (PENDING, REJECTED, DEACTIVATED: ONLY_ACTIVE_PIN_RESET missing), 18 green; restored, sha256 OK.
- Green after restore: pin-reset 21/21, columns 19/19, pin-schema 31/31 (incl. new 021 AC-2 third-row test), pin-session 10/10 (AC-34 check included). Unit 66 files/950 green; tsc 0; lint 0.
- Build 75 s; e2e (3 files, --project=chromium-stock-entry; the config runs project chromium first as its dependency): 105 passed (79 chromium + 26 stock-entry), 0 failed, 0 skipped, 257 s. Port 3000 free after.
- impl_pin_auth.md: 14 Resolved annotations added under stale Phase B sentences; Continuation section appended. Session complete; nothing committed.
- **Phase B continuation returned** (`progress/impl_pin_auth.md` → *Continuation, after the
  rulings*). Its first gate failed one unit test, and it was right to: the report quoted two old
  code shapes verbatim, and `no-default-password`'s scan caught them in the tracked report. The
  coordinator reworded the two sentences, disclosed in place, and left the scan unchanged.
- **Two gaps from its notes, ruled for Phase C** (021 → *Two gaps found by Phase B's
  continuation*):
  - G1: both secret scans exempt a quoted identifier-shaped value. For AC-8 that is a defect;
    AC-41 gains the value rule.
  - G2: a `NEW_PIN` in `.env` would act as a default. AC-30 now requires the reads before the
    Prisma client loads.
