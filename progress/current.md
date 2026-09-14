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

## Verification

<!-- Paste the closing run here. It must not say "(database checks skipped)" -- C2.1. -->

## Blockers

None.

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
  `output_tokens`. The `<subagent_tokens>` figure in a completion notification is a different,
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
