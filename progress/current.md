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
- **Phase B gate green, committed.** Final gate (`scratchpad/gate21b2.txt`): `init` exit 0 in
  18.7 min, `[OK] Environment ready`, database checks executed, 0 connection errors. Unit
  950/950, e2e 79 + 139 passed with 0 failed, `test:db` 454/454. The 22 `bucket=new-devices` log
  lines all come after the database stage begins, so they are the sign-in database tests' own and
  AC-40's budget rule held on the development database. Dev database census before and after
  the gate: identical (33 users, 8 of them `ADMIN`; 140/19/10/129/152). Commits: `6aa3372`
  `spec(#21)` for the rulings, and `5644cf5` `feat(#21): Phase B`.
- **Keep-awake was broken until now.** In Windows PowerShell 5.1, the literal `0x80000001`
  parses as a negative `Int32`, so `SetThreadExecutionState` threw and nothing kept the machine
  awake. That includes this session's earlier 90-minute keep-awake. It is fixed in
  `scratchpad/gate.ps1` and `keepawake.ps1` by passing `[uint32]2147483649`, and the call was
  verified to return non-zero.
- **`lint-fence.test.ts`: a second intermittent failure, outside a gate.** It failed in a full
  `test:unit` run, just after the commit, with nothing else running, then passed alone (first
  test 3.7 s) and in the next full run (7.6 s). ESLint's cold start competes with the suite's
  own parallel files for CPU. The item stays deferred, now with this evidence. It is not
  #21's. **Never fix it by raising the timeout.**

## Feature 21 `pin_auth` — Phase C1 (the public side), implementer, started 2026-09-25

Brief: leader's scratchpad `impl21-c1.md`. #21 stays `in_progress`; `feature_list.json` untouched.
Report: appended to `progress/impl_pin_auth.md` -> `## Phase C1`.

### Files I expect to touch
- New: `src/server/auth/profile-request-service.ts` (`requestProfile`), `setup-service.ts`
  (`setupAvailable`, `completeSetup`), `auth-event-log.ts` (bucket lock, events, retention for
  the two new services).
- New pages: `src/app/sign-in/create/{page,actions,form-state}.ts(x)`,
  `src/app/sign-in/requested/page.tsx`, `src/app/setup/{page,actions,form-state}.ts(x)`;
  client forms `src/components/CreateProfileForm.tsx`, `SetupForm.tsx`.
- `profile-admin-service.ts`: export `toProfileListEntry` (setup returns a `ProfileListEntry`).
- `scripts/pin-reset.ts` (G2: reads before a dynamic import of `src/server`).
- Tests: new `profile-request-service.db.test.ts`, `setup-service.db.test.ts`,
  `src/app/sign-in/create/actions.test.ts`, `src/app/setup/actions.test.ts`;
  `tests/unit/pin-auth-contract.test.ts` (G1 AC-8, AC-19 scan, AC-27 scan, G2 order, AC-41
  `.env.example`, AC-43 for the three pages); `tests/unit/no-default-password.test.ts` (G1);
  `tests/unit/stock-takes-contract.test.ts` (010 AC-20's census, named by AC-43);
  new e2e `tests/e2e/pin-create.spec.ts`, `pin-setup.spec.ts`.
- `docs/operations.md`: the `/setup` paragraph replaces the marker.
- Not touched: `.env.example` (not read either), `Samples/`, `feature_list.json`,
  `tests/support/feature-scope.ts`.

### Approach
- requestProfile: pepper -> parse -> tx { bucket lock, events, budget; pending-cap lock, PENDING
  count, cap; bcrypt; insert PENDING row; PROFILE_REQUEST event; retention }. No read of User by
  any username, no verifyPin.
- completeSetup: setupAvailable() (else UNAVAILABLE, code not compared) -> tx { "setup" bucket
  lock, budget (PAUSED, code not compared), constant-time code check (wrong -> one
  SETUP_FAILURE), fields, bcrypt, ADMIN row, SetupClaim id 1 }. Unique violation -> UNAVAILABLE.
  The claim is the race guard.
- Pages force-dynamic, no loading.tsx; `/setup` 404s unless available; paused request echoes no
  field so its body cannot differ by username.
- Mutations on byte copies, restored and checked with `sha256sum -c`.

### Log
- Services, pages and forms written (`auth-event-log.ts`, `profile-request-service.ts`,
  `setup-service.ts`; `/sign-in/create`, `/sign-in/requested`, `/setup`; `CreateProfileForm`,
  `SetupForm`, `use-forget-on-hide`); `toProfileListEntry` exported. tsc 0, lint 0.
- Unit run with the three pages added: 1 red of 950, exactly 010 AC-20's census in
  `stock-takes-contract.test.ts` ("to have a length of 18 but got 21"). AC-43 names that
  census and requires it to pass with the number it derives; amending it next.
- 010 AC-20's census amended under AC-43 (floor 18, the three pages named). Unit checks added
  to `pin-auth-contract.test.ts` (G1 AC-8, AC-19 scan, AC-27, G2 order, AC-41, AC-43).
- G1 AC-41 (`no-default-password.test.ts`): new G1 test written first, RED under the old value
  rule (quoted letters-first value passed as code); rule changed, 5/5 green after two Phase B
  report lines in `impl_pin_auth.md` were reworded (the stricter rule read their angle-bracketed
  value after the variable name as a literal; disclosed in place).
- G1 AC-8: quoted-branch exemption put back on a byte copy -> the G1 test RED
  (`expected [] to have a length of 1`); restored, `sha256sum -c` OK (4625b5ff...).
- G2: `scripts/pin-reset.ts` reads both variables at the top, then dynamic imports. Mutation
  (NEW_USERNAME read moved after the errors import) -> both AC-30 order tests RED; restored,
  `sha256sum -c` OK (565e4477...), 2/2 green.
- `docs/operations.md`: *First-run setup* section replaces the marker; its unit test green.
- AC-41 `.env.example`: 3 tests RED because the two entries are not there yet (the owner is
  adding them). Left red, as the brief says. The assertions print no file content.
- Action unit tests (11) green; db tests written; tsc 0, lint 0. Running db files one at a time next.
- profile-request-service.db.test.ts: 11/11 green, 24 s.
- setup-service.db.test.ts: first run 36/37 (server render: 'React is not defined', the classic JSX runtime; fixed as src/app/analysis/page.test.ts does); rerun 37/37, 33 s.
- Security mutations, each on a byte copy, restored, `sha256sum -c` OK for all three files:
  M1 request row ACTIVE ADMIN -> AC-18 2 red; M2 held username answered PAUSED -> AC-19 db red
  and AC-19 scan red; M3 availability counts only live ADMINs -> AC-27 4 red; M4 long wrong code
  accepted -> AC-28/33 4 red; M5 claim insert removed -> AC-29 20/20 red (CREATED, CREATED);
  M6 code logged and returned in state -> AC-33 db, AC-28 db action and AC-28 unit red.
- e2e specs written: tests/e2e/pin-create.spec.ts, pin-setup.spec.ts. AC-8 scan caught the setup test's mock line (an unquoted call with arguments); reshaped. Unit 971 pass + the 3 .env.example reds.
- pin-reset.db.test.ts after G2: 21/21, 52 s.
- Dev DB census before e2e: users 33, admins 8, pending 0, claims 0, events 0, locks 0. Port 3000 free.
- setup-service.db.test.ts rerun after the mock reshape: 37/37, 33 s.
- e2e (`run-e2e.mjs` rebuilt first; its route table lists `/setup`, `/sign-in/create`, `/sign-in/requested`): `pin-create.spec.ts` + `pin-setup.spec.ts`
  14 passed, 0 failed, 27 s, first run. Census after: identical (33/8/0/0/0/0/0/0). Port 3000 free.
- `profile-admin-service.ts`: module comment names the setup service's use of `toProfileListEntry`.
- `sign-in.spec.ts` alone, rebuilt first (BUILD_ID 18:46:57, after the last source edit): 15 passed, 0 failed, 50 s. Census after: identical. Port 3000 free.
- Report appended: progress/impl_pin_auth.md -> ## Phase C1. Scans re-run over it: only the 3 .env.example reds. Session complete; nothing committed.
- **Phase C1 returned** (`progress/impl_pin_auth.md` → *Phase C1*). Coordinator rulings:
  - Finding 2 (010 AC-20's census, from exactly 18 to a floor of 18 plus the three new pages by
    name) is **accepted**. AC-43 names that census and says it passes with the number it derives
    from the tree, and 010 AC-2 already uses the floor pattern.
  - Finding 3 (the `sign-in.spec.ts` AC-36 port flake, about 0.6% per run) goes to C2.
  - Deviation 8 (a second copy of the bucket lock and sweep) goes to C2, gated on AC-10's
    statement sequence staying identical.
- **C1 gate** (`scratchpad/gate21c1.txt`): unit 971/974, e2e 93 + 139 passed with 0 failed,
  `test:db` 502/502, 0 connection errors, 19.8 min. `init` exit 1 **only** because of the three
  AC-41 `.env.example` checks, which wait on the owner's two entries. Dev database census
  identical before and after. **C1 is not committed.** It needs the owner's entries, then one
  fully green `init`. The C2 brief is ready in `scratchpad/impl21-c2.md`.

## Feature 21 `pin_auth` — C1 finish: `.env.example` retired, implementer, started 2026-09-25

Brief: leader's scratchpad `impl21-env.md`. Owner's decision: 021 → *Post-approval amendments* →
*`.env` is the only settings file*. #21 stays `in_progress`; `feature_list.json` untouched.
Report: `progress/impl_pin_auth.md` → `## Phase C1` → `### C1 finish: .env.example retired`.

### Files I expect to touch
- New: `tests/support/env-file.ts` (`envFileProblems(text)`, labels only, shared by two test
  files), `tests/unit/env-file.test.ts` (real `.env` by labels; breach proofs on synthetic text).
- `src/server/auth/password.ts`: export the pepper usability rule as a pure predicate, no
  behaviour change; `password.test.ts`: prove the predicate is the rule `pinDigest` applies.
- `tests/unit/repo-hygiene.test.ts`: no exemption; no file named `.env*`; AC-7 / 003 AC-30 doc
  halves on `docs/operations.md` → *Environment*; header comment.
- `tests/unit/pin-auth-contract.test.ts`: AC-8's `NEW_PIN` half by name via `envFileProblems`;
  AC-41's three template tests become checks on *Environment*.
- `docs/operations.md`: new `## Environment`; the `.env.example` pointer line replaced.
- `README.md`, `scripts/run-db-tests.mjs`, `src/lib/env.test.ts` (comment), `.gitignore`.
- `git rm .env.example` (not read).
- Not touched: `.env` (never read by me), `Samples/`, `feature_list.json`.

### Approach
- `.env` parsed with `node:util` `parseEnv` (the parser `process.loadEnvFile` uses in
  `run-db-tests.mjs`); hosts via `new URL(...).hostname`; every check returns a constant label.
- Breach proofs: a valid synthetic text built from `randomBytes`, hosts under `.invalid`,
  connection strings from halves; each breach returns exactly its one label.

### Log
- Plan written. `password.ts`: `isUsablePinPepper` exported (pure; `pinPepper` now calls the same private decoder, no behaviour change); `password.test.ts` test added. `tests/support/env-file.ts` written. `docs/operations.md`: `## Environment` added, the pointer line in *Databases* replaced. Not yet run.
- `repo-hygiene.test.ts`, `pin-auth-contract.test.ts`, `env-file.test.ts` written; README, `run-db-tests.mjs`, `src/lib/env.test.ts` comment, `.gitignore` edited. tsc 0, lint 0.
- First run of the five files: 2 red. (1) "no file named .env*": `.env.example` still tracked, expected before the removal. (2) the "DATABASE_URL blank" breach: `node:util` `parseEnv` takes the NEXT line as the value of a blank one (probed on synthetic text), so it would hide a `NEW_PIN` line after a blank value while Prisma's dotenv loads it. Switched the support module to dotenv 16's own line rule (`dotenv/lib/main.js`, the copy Prisma's config loader uses); added breaches for NEW_PIN after a blank value, with `export`, with a colon, quoted, and commented. `env-file.test.ts` 6/6, the real `.env` check included.
- **BLOCKER on step 6:** `git rm .env.example` refused: "the following file has local modifications". The file carries an uncommitted change (it was ` M` at session start, before I touched anything). Forcing (`-f`) would discard content nobody has reviewed; the brief did not anticipate it, so I did not force, stash or copy. A `git diff --numstat` for line counts only was denied by the permission system, so I have no size either. The file is still tracked and on disk, unread. Needs the coordinator: `git rm -f .env.example` if the owner's decision covers the uncommitted edit.
- Six mutations, each on the working file with a byte backup in the scratchpad, restored and `sha256sum -c` OK for all three files (`env-file.ts` 129276b7, `operations.md` bc466dd7, `password.ts` 2d5288b5; backups deleted after): M1 pooler check off -> breach red; M2 NEW_PIN by value -> "by name alone" breach red; M3 "because they fail through a pooler" removed -> AC-7 doc test red; M4 AUTH_SECRET's command at 16 bytes -> "shows AUTH_SECRET's command" and "a pepper password.ts accepts" red; M5 "only" removed -> SETUP_CODE one-phrase claim red; M6 predicate loosened -> password.test and the 31-byte breach red.
- docs: one sentence reworded (production host is a checklist, not a `.env`). Final: tsc 0, lint 0, `test:unit` 983 passed, 1 failed (the `.env*` name test, `.env.example` still tracked: the blocker). `git ls-files | grep -c '^\.env'` = 1.
- grep for the retired name outside `progress/` (file names only, `.env` and the file itself excluded): `.git/index`, `feature_list.json` (not mine to touch), and three `specs/` files.
- Report appended: `progress/impl_pin_auth.md` → `### C1 finish: .env.example retired`. Scans re-run over it: green, apart from the one expected red (template still tracked). Session ends blocked on step 6 only; nothing committed.
- **`.env.example` retired: the owner's decision, 2026-09-25.** Before deleting it, a
  yes/no-only script confirmed that `.env` meets every check the template tests stood for. The
  spec rulings are `012828f`. The conversion is in `c18dd10`:
  - `tests/unit/env-file.test.ts`, which parses `.env` the way Prisma's loader does;
  - `docs/operations.md` → *Environment*;
  - the credential scan with no exemption.

  The deletion stalled once: `git rm` refused because of the owner's uncommitted edit to the
  file. The coordinator forced it, under the owner's instruction to delete the file.
- **C1 gate, first attempt:** the database checks were **skipped**. The dev database's probe
  failed moments after e2e had used that same database, which was a network blip. That run was
  not accepted. After a probe of all three URLs and a latency check (median 27–40 ms), the
  re-run was green: `init` exit 0 in 30.2 min, unit 984, e2e 93 + 139, db 502, 0 skipped,
  0 connection errors, dev census identical. **Committed as `c18dd10`, Phase C1.** Phase C2 is
  next.

## Feature 21 `pin_auth` — Phase C2 (the admin side, `/profiles`), implementer, started 2026-09-25

Brief: coordinator's scratchpad `impl21-c2.md` (plus the correction: `.env.example` is retired,
984 unit tests green at `c18dd10`). #21 stays `in_progress`; `feature_list.json` untouched.
Report: `progress/impl_pin_auth.md` → `## Phase C2`.

### Files I expect to touch
- `src/server/auth/profile-admin-service.ts`: the nine functions (`listProfiles`,
  `approveProfile`, `rejectProfile`, `changeProfileRole`, `deactivateProfile`,
  `clearAccountLock`, `createProfile`, `pinFailureSummary`, `resumeNewDeviceSignIn`).
- `src/server/auth/auth-event-log.ts`: `recordEvent` takes an optional account key; a
  budget-reset writer. `src/server/auth/sign-in-service.ts`: onto `auth-event-log.ts`
  (C1 Deviation 8), with AC-10's statement sequence unchanged.
- `src/lib/auth-config.ts` (`"/profiles"`), `src/middleware.ts` (`"/profiles/:path*"`).
- New: `src/app/profiles/page.tsx`, `actions.ts`, `form-state.ts`; client forms under
  `src/components/profiles/`; a pure display helper if needed.
- Tests: new `src/server/auth/profile-admin-service.db.test.ts`, `src/app/profiles/*.test.ts`,
  `tests/e2e/pin-profiles.spec.ts`; `tests/unit/pin-auth-contract.test.ts` (AC-22 source
  check, AC-43 list), `tests/unit/stock-takes-contract.test.ts` (010 AC-20 census names
  `/profiles`), `tests/e2e/pin-header.spec.ts` (`/profiles` joins AC-37), `tests/e2e/sign-in.spec.ts`
  (AC-36 port flake: path, query and fragment only).
- Not touched: `Samples/`, `feature_list.json`, `tests/support/feature-scope.ts`, `.env`.

### Approach
- Every admin function asserts `ADMIN` first. Role and deactivation changes lock every
  `ACTIVE` `ADMIN` row `FOR UPDATE` (id order), then the target; refuse with
  `LAST_ADMIN_MESSAGE` when no `ACTIVE` `ADMIN` holding a username and a PIN would remain.
- Approval checks the username is free, and maps the unique index's violation to
  `USERNAME_TAKEN_MESSAGE` for the concurrent case.
- The page: server component, `requireAdminPage("profiles")`, `force-dynamic`, no
  `loading.tsx`. Forms are `useActionState` client components; a new PIN lives only in the
  action's returned state.
- Not adding the `/analysis` header link (Out of scope → Navigation): 011 AC-16's shipped
  "every link carries period and breakdown" test would turn red. Report as a finding.

### Log
- C1 Deviation 8 done: `sign-in-service.ts` now takes the bucket lock, the bucket's events and
  the event plus sweep from `auth-event-log.ts` (`recordEvent` gained an optional account key;
  omitted, the insert is unchanged). A scratch probe (copied into `src/server/auth/`, run,
  deleted) captured `attemptSignIn`'s statement texts for five cases before and after:
  byte-identical (sha256 `0e0466a0…` both). Then, one at a time: `sign-in-service.db` 14/14
  (85 s), `profile-request-service.db` 11/11 (39 s), `setup-service.db` 37/37 (53 s).
- `profile-admin-service.ts`: the nine functions written, plus one mapper, the admin-row lock
  and `settleLock` (a locked read of the lock row; `resetProfilePin` now uses it too). Page,
  eight actions, form states, six client components, `src/lib/profile-display.ts`. `/profiles`
  in `PROTECTED_PATHS` and the matcher. `tsc` 0, lint 0, `test:unit` 986/986.
- Contract tests: 010 AC-20 census names `/profiles`; 021 AC-43 lists four pages; new AC-22
  source checks (paths, matcher, the page's guard, `assertRole` first in all ten) and AC-37
  (the page's header). 66/66 in the two files.
- `profile-admin-service.db.test.ts`: 33/33 on its first run (78 s). `pin-session.db` re-run
  after the reset refactor: see next line.
- `pin-session.db` 10/10 (15 s) after the reset refactor. `src/app/profiles/actions.test.ts`
  7/7. `test:unit` 997/997. Dev census before e2e:
  `{"users":33,"admins":8,"pending":0,"setupClaims":0,"requestNewDevices":0,"pinNewDevices":0,"authEvents":0,"accountLocks":0}`.
- `pin-profiles.spec.ts` first run (after a rebuild): 13 passed, 1 failed — AC-24's reset showed
  `PIN_FORMAT_MESSAGE`, not a PIN. The trace showed the pressed button's `name=length` value
  never reached the action: React hands a form action the form's fields only. Fixed in the
  component (one form per length, the length in a hidden field). Census after: identical.
  Port 3000: no listener.
- AC-24's e2e then failed on reading the action's streamed body (`Network.getResponseBody`: no
  data); the spec now fetches that one POST through `page.route` and hands it on whole. Run 3
  of `pin-profiles.spec.ts`: **14 passed, 0 failed** (1.1 m).
- `sign-in.spec.ts` alone after the port fix: passed, 0 failed (`.last-run.json`; my output
  filter cut the count line). `pin-header` + `role-access` + `route-protection`: **21 passed**.
  Census identical before and after each run; no listener on 3000 afterwards.
- **AC-22 hand proof.** Byte copy of `src/lib/auth-config.ts` (sha256 `7245749e…`), `"/profiles"`
  and its comment removed from `PROTECTED_PATHS`, then `npm run test:e2e -- pin-profiles.spec.ts
  -g "AC-22"` (it rebuilt: "Compiled successfully"). Observed: a YARD_STAFF `GET /profiles`
  still answered `307` to `/stock-entry?denied=profiles` (test passed); signed out, `307` to
  `/sign-in?reason=inactive` instead of `?callbackUrl=%2Fprofiles` (the one red test: the page
  guard refused where the middleware no longer did); ADMIN `200`. Restored with `cp -p`;
  `sha256sum -c`: `src/lib/auth-config.ts: OK`.
- **AC-26 hand observation**, no other e2e run active: a scratch spec (copied into `tests/e2e/`,
  run once, deleted) wrote 10 `PIN_FAILURE` events in `pin:new-devices`, viewed `/profiles` as a
  fresh ADMIN, pressed the resume control, then deleted what it wrote. Counts: before 0/0/0
  (new-device failures / resets / all events); written 10/0/10; the page showed
  `PIN_FAILURES_SUMMARY(10, 0, 10)`, `NEW_DEVICES_PAUSED_MESSAGE` and the
  `RESUME_NEW_DEVICES_LABEL` control; after the press, neither, the same summary, and 10/1/11;
  11 deleted; after 0/0/0. Census identical before and after.
- **Security mutations**, each on the working file from byte copies (sha256
  `profile-admin-service.ts c1d0cc6c…`, `page.tsx 64d1ddfe…`, `actions.ts 1fd77473…`), each
  restored with `cp -p` and `sha256sum -c` OK for all three: M1 (no `assertRole` in
  `approveProfile`) red in db AC-22 and the unit source check; M2 (page guard →
  `requireUserPage`) red in the unit check, the db render and e2e (`500`, the service still
  refused); M3a (no free-username check) GREEN, the unique index and its mapping hold; M3b (no
  check, no mapping) red, a Prisma error not `ConflictError`; M4 (a taken username answers as
  success) red, 2 fulfilled; M5a/M5b (no last-admin guard on demote/deactivate) red, 2 tests
  each; M5c (admin rows read without `FOR UPDATE`) red, both concurrency tests; M6 (deactivation
  keeps the hash) red, the database's CHECK refused; M7 (PIN kept in server memory and rendered)
  red in e2e AC-24 and AC-25 at the later-GET assertion; M8 (clear = SUCCESS) red, level 0.
- Final: the four auth db files one at a time (14, 11, 37, 33, all green); e2e `sign-in` 15/15,
  `pin-profiles` + `pin-header` 18/18 (rebuilt on the final source); `typecheck` 0, `lint` 0,
  `test:unit` 997/997; census identical throughout; port 3000 free. Report appended:
  `progress/impl_pin_auth.md` -> `## Phase C2`. Nothing committed.

### After the rulings (C2-1, C2-2), implementer, 2026-09-25
- C2-1: `/analysis` header gets one `Link` to `/profiles` (IdentityHeader children, no query).
  011 AC-16 e2e test amended as its note says (one `/profiles` link, in the header; every other
  link keeps both parameters). pin-profiles: new AC-22 link test. C2-2: `SignOutForm` gains
  `inline-flex min-h-11 items-center`; AC-35 on `/profiles` now measures the header too.
  tsc 0, lint 0, `test:unit` 997/997.
- e2e: pin-profiles + pin-header 19/19; the seven header/overflow specs of the second project
  (--no-deps) 88/88, no shipped assertion changed. M9 (second /profiles link) red in 011 AC-16;
  M10 (sign-out back to 38 px) red in AC-35 at 390 and 320; both restored, sha256sum -c OK.
  Final rebuild on restored source: 19/19. Census identical throughout; port 3000 free. Report:
  `progress/impl_pin_auth.md` -> `### After the rulings`. Nothing committed.
- **C2 returned; rulings C2-1 to C2-3** (021 → *Three findings by Phase C2*):
  - the `/analysis` header gains its `/profiles` link, and 011 AC-16 gains exactly one
    exception;
  - sign-out is at least 44 px on every page;
  - two mutations can't reach states the database refuses, which is accepted.

  AC-40 now lists 011 AC-16's amended test as licensed.
- **C2 gate** (`scratchpad/gate21c2.txt`): unit 997, e2e 108 passed, then 138 passed and
  **1 failed**, db 535/535, 0 skipped, 0 connection errors, dev census identical. The failure
  was 010 AC-12/AC-13's money check (a price's digits, `890`, must not appear) meeting an AC-40
  test name `…5f41bdc1890dade2`. **Ruling C2-4:** AC-40's random suffixes use letters `a`–`p`
  only, so the entropy is unchanged, and 010's assertion is untouched. **Coordinator's
  disclosed exception:** the coordinator made the two-line generator change in
  `tests/e2e/support/users.ts` (`randomLetters`), and made the default label `tester`, because
  the old default had a digit. 100,000 draws gave no digit and no invalid username. The
  reviewer checks it with the rest.
- **Deferred observation (not #21's):** the same page renders random count cuids, which could
  in principle contain a price's digits. That predates #21 and is logged only.
- **Phase C2 committed** after a green re-gate (`scratchpad/gate21c2b.txt`): `init` exit 0 in
  19.9 min, unit 997, e2e 108 + 139 with 0 failed, db 535/535, 0 skipped, 0 connection
  errors, dev census identical. Commits: `5a04b64` `spec(#21)` for C2-1 to C2-4, and `8ee3748`
  `feat(#21): Phase C2`.
- **AC-43: two consecutive full `npm run test:e2e` runs** (`scratchpad/e2e2.ps1`, kept awake,
  Git Bash, on `8ee3748`, nothing else running):
  - run 1: exit 0 in 8.7 min, phase 1 108 passed, phase 2 139 passed;
  - run 2: exit 0 in 7.3 min, phase 1 108 passed, phase 2 139 passed.

  Each run had 0 failed, 0 flaky and 0 `Retry #`. The dev census was identical before and
  after. Counting the gate's own run just before, that is three consecutive clean full runs.
  The logs are `scratchpad/ac43-run1.txt` and `ac43-run2.txt`.

### Review repairs (R1, R2, R3; observations 2, 3, 4, 6), implementer, 2026-09-26
Brief: the coordinator's scratchpad `fix21.md`, against `progress/review_pin_auth.md` and the
rulings in 021 → *The review's findings, ruled by the coordinator*. Nothing is committed;
`feature_list.json`, `Samples/` and `tests/support/feature-scope.ts` are not touched.

**Plan, written before coding:**
- R1 first. Red e2e for a slash-backslash callback with JavaScript off, on the current code,
  and record its `Location`. Then `safeCallbackPath` becomes a pure exported function in a new
  module (`src/lib/callback-path.ts`: a `"use server"` file may export only async functions),
  imported by `src/app/auth-actions.ts`; unit test beside it; e2e for both shapes, JavaScript
  on and off, plus the valid `/analysis` callback.
- R2: the stricter line rule and four runtime-built non-vacuity shapes in
  `tests/unit/pin-auth-contract.test.ts`. Any non-PIN tracked line it flags is reported.
- R3: the device cookie's options as a pure exported function beside `next-auth.ts`, unit-tested
  over https and http; `pin-device.spec.ts` derives its list from `PROTECTED_PATHS`.
- Obs 2: AC-10 (e) through `requestProfile` + `rejectProfile` in `sign-in-service.db.test.ts`.
- Obs 3: the `test-db.db.test.ts` title; comments only in two e2e specs.
- Obs 4: a unit scan of who names `toProfileListEntry`.
- Obs 6: AC-14's typed-value check column by column; mutation-proved.
- Mutations from byte copies, restored and checked with `sha256sum -c`.

**Log (finished and verified steps only):**
- Dev census before any run: users 33, admins 8, pending 0, claims 0, events 0, locks 0
  (both census scripts). Port 3000 free.
- **R1 red, on the unfixed code** (fresh build, `sign-in.spec.ts -g` the new no-JS case, alone):
  1 failed, at the `Location` assertion. The POST's `Location` was a slash, a backslash, then
  the run's `offsite-<12 hex>.invalid/x`, which resolves to that host's origin instead of
  `http://localhost:3000`. Census identical after; port 3000 not listening; `test-results/` cleared.
- **R1 fixed.** `safeCallbackPath` moved to the pure `src/lib/callback-path.ts` (refuses a
  backslash, ASCII controls and whitespace; one leading slash; parsed against a fixed origin;
  returns path + query, re-checked for a leading `//` left by dot segments). `auth-actions.ts`
  imports it. Unit: `src/lib/callback-path.test.ts` 10/10. E2e (fresh build) `sign-in.spec.ts
  -g AC-9`: **8 passed** — `/analysis` honoured and all four off-site shapes ignored, with
  JavaScript on and off. Census identical after.
- **M-R1** (old rule restored from a byte copy): unit 6 of 10 red; e2e (rebuilt) both
  off-site tests red — without JavaScript at the `Location` assertion (the foreign host's
  origin), with JavaScript at the landing path (`/x`, not `/stock-takes`); the two `/analysis`
  tests stayed green, as they should. Restored with `cp -p`; `sha256sum -c` OK; unit 10/10.
- **R2 done.** Probe of the tree with the stricter line rule and the two new targeted shapes:
  **0 hits** (no non-PIN line to report). `pin-auth-contract.test.ts` gains `CALL_ARGUMENT`
  (a literal in a call whose name matches /pin/i or is `attemptSignIn`), `FILL_ON_PIN_VARIABLE`
  and `PIN_LINE`; the five targeted patterns are kept; the non-vacuity test gains five shapes
  × 2 lengths × 3 quotes, digits from `randomInt`, soft-asserted per rule. 37/37.
- **R2 mutations** (each rule removed from the scan's list, one at a time, from a byte copy):
  without `CALL_ARGUMENT` the hashPin, verifyPin and attemptSignIn shapes red (6 each); without
  `FILL_ON_PIN_VARIABLE` the fill shape red (6); without `PIN_LINE` hashPin, verifyPin, fill and
  the line-only shape red (6 each). Restored; `sha256sum -c` OK; 37/37. The mutation logs
  carried no quoted digit run and were deleted.
- **R3 code and unit half done.** `deviceCookieOptions(requestUrl)` is a pure export of
  `src/server/auth/sign-in-codes.ts` (beside `DEVICE_COOKIE`); `next-auth.ts` calls it.
  `sign-in-codes.test.ts` gains three AC-16 tests (https → Secure; http → not; lifetime), 5/5.
  `pin-device.spec.ts` now loops over `PROTECTED_PATHS` (asserting it holds `/profiles`).
  M-R3a (`Secure` always false): the https test red. M-R3b (always true, extra): the http test
  red. Each restored from a byte copy, `sha256sum -c` OK, 5/5. E2e still to run.
- **Obs 2 and Obs 6 done** in `sign-in-service.db.test.ts`. (e) is now a `requestProfile`
  (SENT) rejected by `rejectProfile` (row REJECTED), attempted with the chosen username and PIN.
  AC-14's check is column by column: hex columns must be keys the run can derive (account keys of
  its typed usernames; the bucket's device id is the run's device), never searched; `id`, `kind`
  and the bucket with its device id removed are searched for every typed username and PIN;
  counters are integers and never equal a typed value; times are Dates. Labels name the column,
  never the value. The malformed attempt's PIN is now six digits (a four-digit one could match
  inside the random 25-character id about once in ten thousand runs). `test:db` on the file:
  **14/14** (69.7 s).
- **M-14** (the service appends the typed PIN to the stored `AuthEvent.id` after each counted
  failure): the bookkeeping test red, "AuthEvent.id holds a typed PIN"; the log held no 6-digit
  run. Extra M-14b (raw username as the account key): red, but because the database's CHECK
  refuses a non-hex key, so it proves nothing about the test. Both restored from a byte copy;
  `sha256sum -c` OK.
- **Obs 3 done.** `test-db.db.test.ts:186` now titled "…exactly the tables in
  TRUNCATED_TABLES", assertion untouched. Comments only in `stock-takes-calendar.spec.ts`
  (the AC-19 lever block, `:570`, and the same fixture's comment at `:582-586`) and
  `analysis-access.spec.ts` (the AC-20 lever block, `:152`, and `:170`'s historical
  measurement): `git diff -U0` shows 0 non-comment lines and 0 `expect(`/`test(` lines changed.
  The two `UNBREAKABLE_LABEL` values and the `test(` title at `:147` are untouched.
- **Obs 4 done.** `pin-auth-contract.test.ts` AC-22: the non-test code files naming
  `toProfileListEntry` are exactly `profile-admin-service.ts` and `setup-service.ts`, and the
  only non-test named import of it is `setup-service.ts`'s. 38/38. Probe: a temporary untracked
  `src/app/profiles/zz-probe.ts` importing it turned the test red, naming that file; deleted,
  green again.
- **Verification on the final source:** `typecheck` 0, `lint` 0, `test:unit` 1011/1011 (72
  files); `test:db` `test-db.db.test.ts` 13/13; e2e (fresh build, nothing else running)
  `sign-in.spec.ts` + `pin-device.spec.ts` **23 passed**; `test:db` `sign-in-service.db.test.ts`
  14/14 after every service mutation was restored. Census identical before and after every e2e
  run; port 3000 free; `test-results/` holds only `.last-run.json`. Report:
  `progress/impl_pin_auth.md` → `## Review repairs`. Nothing committed.
- **Review of #21: CHANGES_REQUESTED** (`progress/review_pin_auth.md`). Four required changes,
  ruled in 021 → *The review's findings, ruled by the coordinator*:
  - R1, an **open redirect** after a no-JavaScript sign-in, a security defect Phase B
    introduced;
  - R2, gaps in AC-8's PIN scan;
  - R3, `Secure` unproved over https, and `/profiles` missing from the device-cookie check;
  - R4, the no-database `init` evidence.

  The repair (`progress/impl_pin_auth.md` → *Review repairs*):
  - R1 was proved red first. The no-JavaScript POST's `Location` resolved to a foreign
    `.invalid` host. Fixed in `src/lib/callback-path.ts`, which refuses any value holding a
    backslash, control or whitespace; accepts it only on the same origin; returns path and
    query only; and re-checks for a leading `//` after dot segments collapse.
  - R2 and R3 were closed, along with observations 2, 3, 4 and 6. Every mutation went red and
    was restored.
  - **Coordinator's disclosed exceptions:** AC-8's wording was corrected (the line rule alone
    can't catch `attemptSignIn`), and one stale comment pointer in
    `src/app/item-master/actions.ts:97` was fixed.
- **For #16, deploy checklist:** verify in production that the `macroads-device` cookie carries
  `Secure` behind Vercel's TLS proxy (repair finding 4). The unit test proves only what
  `deviceCookieOptions` does with the URL it is given.
- **Close-out run 1** (`scratchpad/close-1-gate.txt`): the gate with the database, `init` exit 0
  in 20 min, 0 connection errors, unit 1011, e2e 111 + 139, db 535, `[OK] Environment ready`
  with the database checks executed.
- **Close-out run 2** (`scratchpad/close-2-e2e.txt`): a full `npm run test:e2e`, exit 0 in 8.7
  min, 111 + 139 passed. Runs 1 and 2 each had 0 flaky, 0 failed and 0 `Retry #`. **AC-43 holds
  on the final tree:** two consecutive clean full runs.
- **R4 / AC-42, both no-database `init` runs**, with all four URLs at `macroads-nodns.invalid`:
  - `init.sh` (`close-3-nodb-sh.txt`): exit 0 in 3.0 min;
  - `init.ps1` (`close-4-nodb-ps1.txt`): exit 0 in 2.7 min.

  Each ran typecheck, lint, unit 1011/1011, and e2e (14 passed, 97 + 139 skipped as
  database-dependent). Each ended with
  `[skip] database unreachable at macroads-nodns.invalid - database-dependent checks skipped`,
  then `[OK] Environment ready (database checks skipped)`. The dev census was identical before
  and after the whole close-out.
- **Second-pass repair ("R2 again"), implementer, 2026-09-26.** In `pin-auth-contract.test.ts`
  only. Probe first: the parsed derivation finds 10 names (at least attempt, hashPin,
  verifyPin); **0 hits** for either new rule. Added `FILL_ANY_RECEIVER` and
  `CALL_TO_PIN_PARAMETER` (names derived from every scanned code file with the TypeScript
  compiler API), an "at least" test, and non-vacuity shapes built from `randomInt`: a fill on a
  variable named `field`, a call to `attempt`, and four runtime-declared helpers (declaration,
  arrow, function expression, method) found by the derivation and not by the scan's own set.
  M-R2d (fill rule removed), M-R2e (call rule removed) and M-R2f (derivation returns nothing)
  each red as expected; restored from a byte copy, `sha256sum -c` OK, 39/39. `typecheck` 0,
  `lint` 0, `test:unit` 1012/1012. No e2e, db or `init`; nothing committed. Report:
  `progress/impl_pin_auth.md` → `### Second-pass repair`.
- **Third-pass hardening (observations 1 and 2), implementer, 2026-09-26.** In
  `pin-auth-contract.test.ts` only. Probe: the same 10 derived names; the widened fill rule
  flags 0 of the 85 lines that call `.fill(`; the call rule flags 0. `FILL_ANY_RECEIVER` now
  catches the literal in any argument position (and with a space before the parenthesis); the
  non-vacuity test adds `page.fill` and spaced `frame.fill` shapes. A new test asserts the scan's
  name set equals a fresh derivation over the scanned files, that the rule is in the scan's list,
  and that its source equals the rule built from the fresh set; `callToPinParameter` now sorts
  names, so the rule is canonical for its set. M-R3a (fill narrowed back) red; M-R3b (fixed three)
  red; M-R3c (fixed complete ten) green today, then red once an untracked file adds a function
  with a PIN parameter, while the real code with that file stays green; M-R3d (rule from a fixed
  list) red. Restored from a byte copy, `sha256sum -c` OK, 40/40. `typecheck` 0, `lint` 0,
  `test:unit` 1013/1013. No e2e, db or `init`; nothing committed. Report:
  `progress/impl_pin_auth.md` → `### Third-pass hardening`.
- **Second review pass: CHANGES_REQUESTED on AC-8 alone.** Two clauses were unproved: a fill
  through a variable not named like a PIN, and a literal passed to the `attempt` helper.
  **Ruling:** the scan was strengthened rather than the promise narrowed. The repair added
  `FILL_ANY_RECEIVER` and `CALL_TO_PIN_PARAMETER`. The latter derives the functions with a
  `/pin/i` parameter using the TypeScript compiler API, and found 10 of them today, `attempt`
  included. **Third pass: APPROVED, and #21 APPROVED overall, 47 of 47.** Its two non-blocking
  observations were folded in before the commit: a literal in any argument of `.fill(`, and the
  scan's name set asserted equal to a fresh derivation. Unit 1013/1013.
- **Final gate on the repaired tree** (`scratchpad/gate21final.txt`): `init` exit 0 in 20.9 min,
  unit 1013, e2e 111 + 139 with 0 flaky, 0 failed and 0 retries, db 535, `[OK] Environment
  ready` with the database checks executed, 0 connection errors, dev census identical. **#21 is
  ready for the owner's sign-off.**
- **#21 closed, 2026-09-26, after the owner's sign-off:** `feature_list.json` status `done`,
  and a `progress/history.md` entry. With #21 no longer `in_progress`, the Phase 0 helper reads
  #21's own commits, and `npm run test:unit` is 1013/1013 on that basis.
- **`lint-fence.test.ts`, a third intermittent failure outside a gate.** A partial
  `npx vitest run tests/unit` failed its first test at 57 s. The full `npm run test:unit` run
  straight after passed. It has now failed three times, never in a gate. Still deferred and not
  a feature's. The fix direction is to take ESLint's cold start out of a unit test's time
  budget, **never** to raise the timeout.
- **Development database: the 33 leftover e2e profiles were deleted**, 2026-09-26, on the owner's
  instruction. They were 25 `E2E Yard Staff` and 8 `E2E Administrator` rows created between
  2026-09-14 and 2026-09-24, none with a username, PIN or requested username, and none
  referenced by any stock count or setup claim. The deletion was one transaction that required
  exactly 33 matches (`scratchpad/delete-e2e-users.cjs`). Census afterwards: users 0, admins 0,
  and stock data unchanged (140/19/10/129/152). **`/setup` is now available on the development
  database until the owner completes it.** Until then, don't run e2e there:
  `pin-setup.spec.ts` expects a 404, and the suite assumes a permanent `ADMIN` exists.

## Coordinator — #16 `deploy`: spec, owner facts and decisions, 2026-09-27 and 2026-09-28

- **The code is on GitHub**, private, at `CarlosStaarthof/stock-management`, pushed 2026-09-27
  after a scan of every historical blob for every `.env` value. Only `AUTH_URL`, which is
  `localhost`, was found. The owner chose the name and visibility, and to keep the workbook in
  the repository.
- **The #16 spec is drafted** (`specs/features/016-deploy.md`, 27 criteria;
  `progress/spec_deploy.md`).
- **Owner facts from screenshots, 2026-09-28:**
  - Neon: Free plan; branches `production` (the default), `dev` and `test`; London; **6-hour
    history**.
  - Vercel: team on **Hobby**. The project **already exists**, deploying `main` to
    `stock-management-zeta-one.vercel.app`.

  Probed anonymously, the live site answers as designed (`/setup` 404, `/api/session` 401,
  protected routes 307). Its environment variables are unknown.
- **Owner decisions, 2026-09-28:**
  - stay on Vercel **Hobby**, with the terms risk accepted;
  - stay on Neon **Free, plus a monthly copy outside Neon**, which becomes part of #16;
  - the address is the current `vercel.app` one.

  **The standing "Vercel Pro" requirement is replaced by the owner's Hobby decision.**
- **Pushing is paused.** Vercel deploys every push to `main`, so nothing more is pushed until
  #16's release flow (a separate `production` branch) is in place, or the owner says otherwise.
- **#16 spec approved by the owner, 2026-09-28** (`specs/features/016-deploy.md`, 31 criteria).
  The owner's answers:
  - Q4: a test account;
  - Q5: only the live site;
  - Q6: go live;
  - Q7: only the owner holds the secrets' copies (risk accepted);
  - Q8: sign-off releases, and "hold" stops a release;
  - Q9: the live site moves to Neon `production` at go-live;
  - the monthly copy lives in the owner's Google Drive, uploaded by hand and never through a
    connector.

  V5 (`lhr1` on Hobby) was confirmed. V2 and V6 were moved to go-live by the coordinator's ruling,
  because D3 and D18 hold their fallbacks. `specs/product-brief.md` → *Hosting* was amended to
  the owner's Hobby and Neon Free decisions. **#16 is now `in_progress`.** Phase A is repository
  work proved by `init`, and the spec suggests building it in two parts. Phase B is go-live,
  with the owner.

## Implementer — #16 `deploy`, Phase A1 (AC-1 to AC-10), started 2026-09-28

Brief: `scratchpad/impl16-a1.md`. Report: `progress/impl_deploy.md` → `## Phase A1`.
No push, no commit, no Vercel/Neon/live database; db tests one file at a time on the test
database; dev census before and after.

**Files I expect to touch**
- new: `vercel.json`; `src/server/deploy/build-plan.ts`, `census.ts`, `export.ts`,
  `restore.ts`, `target-schema.ts`; `src/server/items/item-master-seed.ts`;
  `scripts/vercel-build.ts`, `seed-if-empty.ts`, `db-census.ts`, `db-export.ts`,
  `db-restore.ts`, `operator-production.mjs`; tests `tests/unit/deploy-config.test.ts`,
  `vercel-build.test.ts`, `operator-production.test.ts`,
  `src/server/items/item-master-seed.db.test.ts`, `src/server/deploy/census.db.test.ts`,
  `export.db.test.ts`, `restore.db.test.ts`, `operator-production.db.test.ts`.
- modified: `package.json` (six scripts; `build` unchanged).

**Approach**
- Build plan and both guards are pure functions over a given env; one orchestrator takes an
  injected step runner, so the refusals are proved in-process without spawning `next build`.
- Export/restore are generic over `information_schema`; rows are rendered and parsed by
  Postgres (`json_agg`, `json_populate_recordset`), never by JS numbers, so every Decimal
  digit survives. Only `pinHash`/`pinKeyId` are named.
- Launcher is a plain Node ESM file with an injectable `run`/input/output for unit tests; the
  real run spawns tsx/prisma with the answers in the child's env only.

### Work log
- 2026-09-28, A1: census service + `scripts/db-census.ts` written first so the baseline could
  be taken with it. **Dev census BEFORE anything else ran** (read-only, `npm run db:census`):
  locations 2, suppliers 10, item types 19, items 140 (15 need review), prices 129, yard
  links 152, profiles `ADMIN ACTIVE 1`, stock counts `DRAFT 1`, count lines 82, migrations 3
  (latest `20260925120000_pin_profiles`), pins 1 of 1. `package.json`: six scripts added.
- A1: build plan (`src/server/deploy/build-plan.ts`) + runner (`scripts/vercel-build.ts`),
  `vercel.json`, seed-if-empty service/script, target-schema/export/restore services and
  scripts, launcher `.mjs`. Unit files `deploy-config`, `vercel-build`, `operator-production`
  green (59 tests). `typecheck` 0. Next: the five db test files, one at a time.
- A1: db files green, each run once, one at a time, on the test database:
  `item-master-seed` 6/6 (27 s), `census` 3/3, `export` 9/9 (26 s), `restore` 9/9 (61 s),
  `operator-production` 1/1. Shared test helpers: `tests/support/run-script.ts`,
  `tests/support/export-fixture.ts`.
- **FINDING (spec conflict, for a ruling):** the pin_profiles migration's CHECK requires a
  PENDING `User` row to hold a non-null `pinHash`; D20/AC-9 write every `pinHash` as null. So a
  copy taken while any profile request is PENDING cannot be restored (AC-10 would roll back).
  AC-9's fixture has no PENDING row, so the tests are green. To be proved by a throwaway probe
  and reported, not worked around.
- A1: **finding proved** with a throwaway probe (a `*.db.test.ts` created, run once, deleted):
  AC-9's fixture plus one PENDING profile request, exported, then restored into a throwaway
  schema → `db:restore` exit 1, `PrismaClientKnownRequestError (P2010)`, 0 `User` rows in the
  target (rolled back). The same fixture without the PENDING row restores identical. Reported;
  not worked around.
- A1 mutations, each on a byte copy, run, restored, `sha256sum` OK (copies in
  `scratchpad/a1-mut/`): M1 preview guard off → 5 AC-3 tests red; M2 required-setting check off →
  2 AC-4 tests red; M3 seed imports into a full master → the renamed-item SKIPPED/deep-equal test
  red; M4 export keeps `pinHash` → the null/omitted test red (made count-only first: the first
  red run's assertion would have printed a fixture hash to the log); M5 restore skips the
  empty-schema refusal → both refusal tests red (added a *migrated*-schema case: the "Occupied"
  table alone was also stopped by Prisma's own P3005); M6a launcher accepts `.env`'s value →
  red; M6b uses `.env`'s value → red (launcher test assertions made value-free); M6c fills an
  empty answer from `.env` → red in the real-process test (and the equality refusal catches it).
  `restore.db.test.ts` green again after, 10/10 (73 s).
- A1: full `test:unit` first found two scans red on my new text: (1) no-default-password read
  the launcher's question texts and one `SETUP_CODE` assignment in a test as written-down
  values → questions now built from name/hint pairs, test uses a variable; (2) 021 AC-31: the
  shared export fixture (not a test file) imported operator-service → it now writes profiles
  with `hashPin` directly. Unit 1072/1072 after. M6a/M6b repeated on the final launcher: red,
  restored, sha OK. Export 9/9, launcher 1/1 re-run green on the new fixture.
- A1 **complete** (2026-09-28): report `progress/impl_deploy.md` → `## Phase A1`. Final:
  typecheck 0, lint 0, unit 1072/1072, build exit 0 with an unreachable database, five db files
  green on the final code, dev census identical before/after. Not run, per brief: `init`, full
  `test:db`, full `test:e2e`. Open for the coordinator: F1 (PENDING rows vs D20, needs a
  ruling), F2 (`verify:deploy` file comes in A2), F3 (confirm Vercel's deploymentEnabled page),
  F4 (port 3000 held by a `next dev` from 2026-09-26, not mine; `.next` rebuilt under it).
- A1 after ruling A1-F1 (2026-09-28): export leaves `PENDING` `User` rows out and records
  `omittedPendingRequests` (count line printed); restore requires the field. Fixture gains a
  `requestProfile` request. export 10/10, restore 11/11 (round trip now restores with a pending
  request in the source; the second copy differs only in `exportedAt` and the count — flagged
  for AC-10's wording). M7 (export keeps PENDING) → both round-trip tests red; restored, sha OK.
  typecheck 0, lint 0, unit 1072/1072 on re-run (first run: lint-fence 16.4 s timeout, the known
  intermittent). Dev census unchanged. Report: `progress/impl_deploy.md` → `### After ruling A1-F1`.
- **#16 Phase A1 built.** AC-1 to AC-10, plus ruling A1-F1: the export leaves out `PENDING` rows
  and counts them. F3 was confirmed against Vercel's *Git Configuration* documentation: any
  `true` rule deploys, so `"**": false` plus `"production": true` deploys only `production`.
- **The A1 gate's only failure was environmental.** `stock-entry-start.spec.ts:148` uses 007
  AC-7's own literal date, which is Dublin, period September 2026. The owner's manual test count
  on `dev` was exactly that (DRAFT, dated 2026-09-26). The gate was otherwise green: unit 1072,
  e2e 111 + 138, db 566, 0 connection errors.
  - On the owner's instruction, that one count and its 82 lines were deleted, in one transaction
    requiring exactly one match. Nothing else changed.
  - **Operating note: never create a Dublin September-2026 count on the development database.**
    007 AC-7's e2e test uses that period. A durable fix, amending 007 AC-7 to a reserved year, is
    deferred.

## Implementer — #16 `deploy`, Phase A2 (AC-11 to AC-18), started 2026-09-28

Brief: `scratchpad/impl16-a2.md`. Report: `progress/impl_deploy.md` → `## Phase A2`. No push,
no commit, no Vercel/Neon dashboard/live database; the live check is proved against a stub
server and a local `next start` build only. Port 3000 left free. Dev census before and after.

**Dev baseline (read-only), 2026-09-28:** census 2/10/19/140 (15 review)/129/152, profiles
`ADMIN ACTIVE 1`, stock counts none, count lines 0, 3 migrations, pins 1 of 1; plus a scratch
count: users 1, counts 0, lock rows 1, auth events 1.

**Files I expect to touch**
- new: `src/app/api/version/route.ts`; `src/lib/deploy/money-scan.ts`;
  `scripts/verify-deployment.ts` (CLI) plus its modules under `scripts/verify/`;
  tests `tests/unit/security-headers.test.ts`, `src/app/api/version/route.test.ts`,
  `tests/unit/verify-deployment.test.ts`, `src/lib/deploy/money-scan.test.ts`,
  `tests/unit/migration-safety.test.ts`, `tests/unit/operations-runbook.test.ts`,
  e2e `tests/e2e/deploy-verify.spec.ts`.
- modified: `next.config.ts` (poweredByHeader false + six headers), `docs/operations.md`
  (three sections), `docs/conventions.md` (*Database* rule).

**Approach**
- The checks are functions over an origin, a fetch with `redirect: "manual"`, GET/HEAD only,
  printing name + rule, never a value. The anonymous pass takes an injectable http origin so
  the stub test can serve `https-only` from a second port.
- The signed-in pass takes a Browser; the CLI launches a headed Chromium. A session supplier
  exists only for tests and is refused for any host but localhost/127.0.0.1.
- The scripts read no `process.env`, import no fs/child_process/module API, so no `.env`.

### Work log
- A2: AC-11 `next.config.ts` (poweredByHeader false, six headers on `/:path*`), AC-12
  `src/app/api/version/route.ts`, AC-16 `src/lib/deploy/money-scan.ts`, the live check
  (`scripts/verify-deployment.ts` + `scripts/verify/{cli,common,anonymous-pass,signed-in-pass}.ts`).
  Unit files `security-headers`, `version/route`, `money-scan`, `verify-deployment`: 63/63.
  typecheck 0, lint 0. One fix on the way: the spawned CLI crashed on Windows at
  `process.exit` (0xC0000409) with unread response bodies open; the request helper now reads
  every body and the entry sets `process.exitCode`.
- A2: AC-17 `tests/unit/migration-safety.test.ts` (7/7) + `docs/conventions.md` rule; AC-18
  `docs/operations.md` (three sections appended) + `tests/unit/operations-runbook.test.ts`;
  repo scans green over the new text (one fix: a sentinel written as an indexed expression in
  the verify test read as an assigned value; now named variables). e2e
  `tests/e2e/deploy-verify.spec.ts` 5/5 on the local build. Two fixes on the way: a body the
  browser dropped (a prefetch cancelled by the next navigation) failed closed as unreadable;
  the pass now asks for it again (same GET, same headers, same session) and fails only if
  that fails too (7 of 76 re-read). The static GET-only rule was narrowed to the
  Playwright request API (`.request.<method>(`), since `request.method()` is a read.
- A2 mutations (byte copies + SHA256SUMS in `scratchpad/a2-mut/`), each red, restored,
  `sha256sum -c` OK: M1 X-Frame-Options removed -> security-headers red; M2 version echoes a
  malformed value -> route test red; M2b version adds the region -> 4 route tests red; M3
  csrf accepts no-Secure -> csrf test red; M4 scanner drops the euro sign -> 4 red
  (money-scan x2, public-no-money, leak test); M5a detector inverted on DROP -> 4 red; M5b any
  comment counts as contract-step -> 2 red; M5c a temporary `prisma/migrations/2099..._a2_probe`
  with DROP COLUMN -> main AC-17 test red naming migration + statement, green with the line,
  directory deleted; M6a `loadEnvFile(".env")` in cli.ts -> 2 static tests red; M6b csrf prints
  the Set-Cookie -> 2 red; M6c setup-404 quotes the body -> leak test red.
- A2 breach run (AC-15): `src/app/stock-entry/new/page.tsx` byte-copied, made to render a euro
  amount under its heading, rebuilt, AC-15 e2e run: `[verify] FAIL staff-no-money: money found
  in /stock-entry/new (euro-sign)`, a page reached only through a calendar link. Restored from
  the copy, `sha256sum -c` OK, `git status` clean for the file.
- A2 targeted e2e after a rebuild (deploy-verify, analysis-figures, sign-in,
  stock-entry-autosave, stock-takes-count): 155 passed, 0 failed/skipped/flaky, 6.1 min.
  Build with an unreachable `.invalid` database: exit 0. Real command against a local
  `next start`: 7 of 11, the four https/Vercel checks failing as expected; stopped the server.
  typecheck 0, lint 0, unit 1152/1152. Dev census and scratch count identical to baseline.
- **#16 Phase A2 complete** (2026-09-28): report `progress/impl_deploy.md` → `## Phase A2`.
  Findings for the coordinator: A2-F1 (the `x-vercel-id` region format is from memory; confirm
  before AC-24), A2-F2 (AC-14's ".env path" vs no-leftovers' `/.env` URL path, interpreted),
  A2-F3 (the e2e runs the passes against localhost under test:e2e). Feature stays `in_progress`.
- **#16 Phase A2 built** (AC-11 to AC-18). Rulings:
  - A2-F1: the function region is the last region code in `x-vercel-id`. Vercel's
    documentation doesn't state the order, so it was **observed on the live site**: `dub1::lhr1::<id>`
    on a function, `dub1::<id>` on a static page.
  - A2-F2: AC-14's `.env` rule is about the file system, not the URL `/.env` that the check asks of
    the server.
- **A2 gate** (`scratchpad/gate16a2.txt`): `init` exit 0 in 40.7 min, unit 1152, e2e 116 + 139 with
  0 flaky and 0 failed, db 566, database checks executed, 0 connection errors, dev census identical.
  **Phase A is complete.** Phase B, go-live, is next, with the owner. Pushing stays paused until
  AC-19's take-over steps say to resume.
- A2 review repair R3 (2026-09-28): stand-in browser in `tests/unit/verify-deployment.test.ts`, six tests for the signed-in pass's fail-closed branches (empty scan, start page on /sign-in, body unreadable after re-asking, non-YARD_STAFF role signs out and stops). The pass itself is unchanged. Mutations R3-M1 (line 292 deleted) and R3-M2 (role gate deleted) each red, restored, sha OK. typecheck 0, lint 0, unit 1161/1161. Report: `progress/impl_deploy.md` -> `### Review repairs (A2 side)`.
- A1 review repairs (2026-09-28): R1 read-back detection test; R2 export failure tests, the
  db:export refusal and `foreignKeyOrder` unit tests; R4 launcher notice by input mode plus a
  runbook sentence; Obs 1 comment; Obs 2 restore needs one host (the build's rule), one database
  and one schema; Obs 4 runbook relays the prefixed lines only. MR1, MR4 and MO2 red, restored,
  sha OK. MO2 showed that `migrate deploy` creates a missing database named by DIRECT_URL: one
  stray test-branch database was dropped by a throwaway probe, and the test now drops what it
  names. typecheck 0, lint 0, unit 1169/1169, export 13/13, restore 14/14. **The dev census
  changed, not by me:** stock counts none, count lines 0 (was DRAFT 1 / 82). Reported for the
  owner.
- **#16 Phase A review: CHANGES_REQUESTED** (`progress/review_deploy.md`). Every item was a
  test or a message; none changed behaviour. The rulings are in 016 → *The Phase A review's
  findings*. Two agents did the repairs. MO2 found that `prisma migrate deploy` **creates** a
  missing database named by `DIRECT_URL`, and the restore's new same-host-and-database rule now
  blocks that.
- **Repaired-tree gate** (`scratchpad/gate16rep.txt`): unit 1169, e2e 116 + 138 with **1 failed**,
  db 572, 0 connection errors, dev census identical. The failure is
  `stock-entry-submit.spec.ts:404`, 009 AC-21's "no euro", which asserts that the body does not
  contain the first price's digits (`890`). This build's Next server-action key was
  `kc890aba4ec2…` in a hidden `$ACTION_KEY` input. That is the same class of collision as C2-4, now
  from the framework. **Ruling, a harness fix:** in the six specs that use `anyUnitPriceText()`, the
  price must not appear as a **number token**, meaning no letter or digit immediately around it.
  A leaked price stays caught. A random identifier and a different number (`1890`) no longer trip
  it. It is being implemented, with a leaked-price mutation required to stay red.
- 2026-09-28 19:34, implementer: **harness fix, price as a number token** (brief
  `scratchpad/fix-price-token.md`, report `progress/impl_deploy.md` -> `## Harness fix: price as
  a number token`). Plan: `bodyShowsPrice(body, price)` beside `anyUnitPriceText` in
  `tests/e2e/support/stock-entry.ts` (no ASCII letter or digit either side of the whole price
  string); a unit test `tests/unit/price-token.test.ts` for every case the brief lists; the six
  `not.toContain(<price>)` assertions become `expect(bodyShowsPrice(...), <same message>).toBe(false)`
  in access, filters, submit, takes-count (two) and takes-calendar. `stock-entry-quantities` has
  no such assertion (it already uses its own boundary search, `priceSightings`) and is left alone.
  Then a leaked-price mutation on a staff page, red at the new assertion, restored by byte copy
  and `sha256sum -c`; then the six files once. Port 3000 was free at the start. No commit.
- 2026-09-28 19:41, implementer: price-token helper, unit test (56 cases, green; 6 helper
  mutations each red, restored, sha OK) and the six assertion edits are in. typecheck 0, lint 0,
  unit 84 files / 1225. Now the e2e breach mutation: a probe in `count-service.ts` rendering the
  first price as a bare number on the stock-entry count page and both stock-takes pages. Byte
  copies and `SHA256SUMS` in `scratchpad/price-token-mut/breach/`; restore by copy before
  anything else if this session dies.
- 2026-09-28 19:46, implementer: breach run 1 (probe on three staff pages) -> 6 of 6 price tests
  red, the five edited ones at their new `bodyShowsPrice` lines. Breach run 2 (probe outside
  `stock-takes-body`) -> takes-count red at the sixth edited line, the `html` one. Both
  restored from copies, `sha256sum -c` OK x4, `git status` clean for `src/app` and
  `src/server/counts`, port 3000 has no listener. Next: the six files once on the restored build.
- 2026-09-28 19:59, implementer: harness fix **complete**. Six files once on the restored build:
  `183 passed (6.6m)`, 67 of them the six files and 116 the `chromium` dependency project, 0
  failed. Dev census unchanged; users 1, lock rows 1, auth events 1, counts 0. Port 3000 free.
  Report: `progress/impl_deploy.md` -> `## Harness fix: price as a number token`. Not committed.
- A1 gate fix (2026-09-28): AC-5's five real dry runs hit the 12 s kill switch under the full
  gate. Now one real `npm run build:vercel -- --dry-run` (production) plus four runs of the same
  script via `node --import tsx`, in a sequential block; the kill switch is unchanged. Full unit
  3x in a row: 1225/1225 each, slowest 4.0 s (npm case). Beside a concurrent suite: slowest 4.4 s.
- **Harness fix: price as a number token** (`progress/impl_deploy.md`). Five specs moved to
  `bodyShowsPrice`, and 56 unit tests cover the helper. A breach run put a bare price on each page,
  and all six price checks went red. `stock-entry-quantities.spec.ts` was left alone: it already
  has its own self-tested boundary search. Its `.` rule differs slightly from the shared helper;
  unifying the two is deferred.
- **Gate fix: AC-5's dry-run tests under load.** Three timed out at the 12 s kill switch when
  the suite's workers saturated the CPU. The fix redesigned the test rather than raising the
  budget: one real `npm run`, and the rest through `node --import tsx`, run one after another.
  Three full unit runs in a row passed 1225/1225, with the slowest at 4.0 s.
- **Final gate for the repairs** (`scratchpad/gate16rep4.txt`): `init` exit 0 in 24.6 min, unit
  1225, e2e 116 + 139 with 0 flaky and 0 failed, db 572, database checks executed, 0 connection
  errors, dev census identical. The run before it (`gate16rep3.txt`) **skipped** its database
  checks after a probe blip and was not accepted. All three URLs were probed reachable before the
  re-run.
- **#16 Phase A second review: APPROVED for go-live** (`progress/review_deploy.md` → *Second
  pass*). It raised one non-blocking finding, **H1**, which is **a coordinator error**. The
  price-token brief claimed that "nothing is weaker", but `bodyShowsPrice` misses a decimal price
  in its padded forms (`€37.80`, `37.80000000`), because `Decimal#toString()` drops trailing zeros.
  That claim holds only for integer prices; the one the specs use today, `890`, is an integer. A
  follow-up `fix(harness)` is running: trailing zeros are absorbed, and
  `stock-entry-quantities.spec.ts` moves onto the shared helper. Observations S2 (both strings
  pooled fails closed) and S3 (a misnamed database fails on connection first) are recorded.
- 2026-09-28 21:21, implementer: **harness follow-up H1** (coordinator message; finding H1 in
  `progress/review_deploy.md` -> *Second pass*). Plan:
  - `bodyShowsPrice`: when the price text has a `.`, match `<price>0*` before the trailing
    boundary. `Decimal#toString()` drops trailing zeros, but the display and the column pad them.
  - Unit tests: a one-decimal and a two-decimal price drawn at runtime, plus the coordinator's
    literal decimal, with padded shapes under *still caught*. Integers get no absorption.
    `<p>9` and `1<p>` stay not found. Correct the two "nothing is weaker" comments.
  - `stock-entry-quantities.spec.ts`: its five `priceSightings` assertions move onto
    `bodyShowsPrice`, keeping the `applicationMarkup` scope and the action-key self-tests.
    `priceSightings` is removed.
  - Mutations: absorption removed (unit); a bare price on the staff count page (e2e), and a bare
    `<price>.00`, run against both the new and the old quantities spec.
  - Then `test:unit` and the six specs once. No commit.
- 2026-09-28 21:25, implementer: H1 helper change, the unit test (129, green) and the quantities
  move are done. H1-M1 to M4 were each red, then restored with sha OK. typecheck 0, lint 0. Now
  the e2e breaches on the staff count page: A is a bare price, B is a bare `<price>.00` run
  against the new and the old quantities spec. Copies and `SHA256SUMS` are in
  `scratchpad/price-token-mut/h1/breach/`. If this session dies, restore from them first.
- 2026-09-28 21:38, implementer: H1 follow-up **complete**.
  - Breach A (a bare price) and breach B (a bare `<price>.00`) were each red at
    `stock-entry-quantities.spec.ts:618`. The old spec was green under breach B, which is the gap.
    Everything was restored with sha OK.
  - `test:unit` 84 / 1298. Six files once: `183 passed (4.9m)`.
  - Dev census and row counts are unchanged, and port 3000 is free.
  - Report: `progress/impl_deploy.md` -> `### Follow-up: H1`. Not committed.
- **H1 follow-up green** (`scratchpad/gate-h1.txt`): `init` exit 0 in 24.1 min, unit 1298, e2e
  116 + 139 with 0 flaky and 0 failed, db 572, database checks executed, dev census identical. A
  decimal price absorbs trailing zeros; removing that turns 11 unit tests red.
  `stock-entry-quantities.spec.ts` now uses `bodyShowsPrice` within its `applicationMarkup`
  scope. A bare `<price>.00` turns it red, where the old rule stayed green, so #8's check is
  strictly stronger.
