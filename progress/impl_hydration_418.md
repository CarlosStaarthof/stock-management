# Implementation — root cause of React #418 (hydration failure), plus one retry in the db probe

**Brief:** leader's scratchpad `fix-418.md` (an application defect and a harness fix; no spec,
no `feature_list.json` change)
**Status:** complete. Root cause found and evidenced, fixed in application code, regression
test proven red and then green. The db-probe retry is proven in both directions.

## In six lines

1. **It is a race, not bad markup.** On failing and passing loads the server sent
   byte-identical HTML (same sha256). What varies is when React starts hydrating compared
   with how far the browser has got in parsing the document.
2. **Mechanism, observed in the production bundle.** React's Flight server cuts each RSC row
   at **3,200 characters**. Every later element goes out as a separate row, referenced lazily
   (`$L<id>`) from inside its parent element. Next starts hydrating while the parser is still
   reading those rows. React reaches `<main>` (or `<tbody>`), finds a child row not yet
   there, and suspends *inside that host element*. If the row gets parsed during React's
   yield, React **replays** the element. Its replay of a host component does not rewind the
   hydration cursor, so it tries to claim `<main>`'s own first child (`<header>`) as `<main>`.
   That fails and throws #418. React then regenerates the page on the client.
3. **Proof of cause.** I instrumented the built React chunk (temporarily, in `.next` only).
   In the runs that had the replay hook, **18 of 18** mismatches came straight after a replay
   of a host fiber during hydration, and **every** such replay produced a mismatch. Every
   mismatch sat on the replayed element, with the cursor on its first child.
4. **Fix: `src/components/HydrationGate.tsx`**, placed in `src/app/layout.tsx` directly
   inside `<body>`. It suspends hydration of the page tree until the document is parsed
   (`DOMContentLoaded`). By then every row is in the Flight client, so nothing inside a host
   element can suspend. The server HTML is unchanged, byte for byte.
5. **Regression test:** 6 tests in `tests/e2e/stock-entry-approve.spec.ts`, 168 loads of
   `/summary`, and each load must hydrate without a `pageerror` and without `<main>` being
   removed. **Red** with the gate taken out: all 6 tests failed, on 20 of 168 loads. **Green**
   with the gate: 12/12 in the whole spec.
6. **db-probe:** now makes two attempts, 2 s apart. An unreachable host is still reported
   (exit 1) within about 22 s (22.4 s measured). A healthy host still exits 0 on the first
   attempt. A first miss followed by an answer now exits 0.

## 1. Reproduction

### `next dev` did not reproduce it

`next dev` on :3000, 40 loads each of `/summary` and `/analysis`, with a `pageerror` +
console listener: **0 of 80**. Dev bundles are larger and slower, so hydration starts after
the parser has finished and there is no race to lose. The dev diff message the brief asked
for was therefore not obtained. The element and the cursor state came from the production
bundle instead (§2), which is the build users get. `npm run build` was run straight after
the dev session, and every later measurement served a production build.

### Production build, raw bytes captured on every load

`scratchpad/p418/probe.mts`. This used an admin session, a SUBMITTED Dublin count in 2099-01
(82 lines) and an APPROVED Clonmel count in 2103-12, all created by the probe and deleted by
it. Each load recorded the document's response body, the `pageerror`s and `<main>`.

| Page | Loads | #418 |
|---|---|---|
| `/stock-entry/counts/<id>/summary` | 40 | **2** (loads 4, 5) |
| `/analysis?period=2103-12&breakdown=supplier` | 40 | 0 |
| `/stock-takes` | 40 | 0 |

**The server is not the variable.** The raw HTML of both failing loads and two clean loads
hashes to the same value, `45c13c0786094971…`, at 195,216 bytes each.

**What a #418 load loses, counted from the same capture:**

| `<main>` as… | `<!-- -->` separators | `$ACTION` fields |
|---|---|---|
| the server sent it (raw bytes) | 246 | 4 |
| hydrated normally (clean loads) | 246 | 4 |
| after the #418 regeneration (loads 4 and 5) | **0** | **0** |

## 2. Root cause

### Which element, and in what state: the production chunk, instrumented

I patched a copy of `.next/static/chunks/4bd1b696-c023c6e3521b1417.js` (react-dom client,
the Next 15.5.25 vendored build, React `19.2.0-canary-0bdb9206-20250818`) in place, in
`.next` only, rebuilt afterwards, and never touched it in `node_modules`:
- **`throwOnHydrationMismatch`** (minified `rD`) calls a page hook with the fiber and with
  React's hydration state: `nextHydratableInstance` (`rN`), `hydrationParentFiber` (`rP`) and
  `rootOrSingletonContext` (`r_`).
- **`replaySuspendedUnitOfWork`** (minified `iw`) calls a page hook with the fiber and with
  `isHydrating` (`rL`).

Probe: `scratchpad/p418/probe2.mts` + `instrument.js`.

| Run (unfixed build) | Page | Loads | Mismatches | Host-fiber replays while hydrating | Both on the same load | Reported as `pageerror` |
|---|---|---|---|---|---|---|
| prod2 (no replay hook yet) | `/summary` | 60 | 9 | n/a | n/a | 6 |
| prod2 | `/analysis` | 60 | 0 | n/a | n/a | 0 |
| prod3 | `/summary` | 60 | 1 | 1 | 1 | 1 |
| prod3 | `/analysis` | 60 | 0 | 0 | 0 | 0 |
| prod3 | `/stock-takes` | 60 | 1 | 1 | 1 | 0 |
| prod-cpu4 (4x CPU throttle) | `/summary` | 60 | 6 | 6 | 6 | 0 |
| prod-cpu4 | `/stock-takes`, `/analysis` | 60 + 60 | 0 | 0 | 0 | 0 |
| prod-im | `/item-master` | 40 | 7 | 7 | 7 | 2 |
| prod-im | `/item-master/yards/DUBLIN` | 40 | 3 | 3 | 3 | 0 |
| prod-im | `/stock-entry` | 40 | 0 | 0 | 0 | 0 |

- **Where each mismatch sat.** Every one was on the element being replayed. It was `main` on
  `/summary` and `/stock-takes` (17 of 17) and `tbody` on the two item-master pages. In each
  case `hydrationParentFiber` was that element itself, `rootOrSingletonContext` was `false`,
  and `nextHydratableInstance` was that element's own first child (`<header>` under
  `<main>`, the first `<tr>` under `<tbody>`). In other words, React was trying to claim
  `<main>` from `<main>`'s first child.
- **The correlation is 18 of 18.** With the replay hook installed (prod3, prod-cpu4,
  prod-im), every mismatch came straight after a replay of a tag-5 (host) fiber during
  hydration, in the same millisecond. Every such replay produced a mismatch. Function
  components are also replayed during hydration on almost every load (tag 0, 60 per run),
  and those never led to a mismatch.
- **Not every mismatch is reported.** Reported as `pageerror`: 6 of 9, 1 of 2, 0 of 6 and
  2 of 10 above. My inference, not proven: the unreported ones are hydration attempts React
  discarded and restarted (several item-master loads logged two or three mismatches each).
- **A `pageerror` and a removed `<main>` always went together.** 5 of 5 in a real-load probe
  (4 on `/summary`, 1 on `/item-master`); 12 of 12, 3 of 3 and 20 of 20 in the three e2e red
  runs (§4).

### Why a replay of a host element fails

These are read from React's own production source in
`node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js`:
- **`handleThrow` → `renderRootConcurrent`.** A child that suspends sets reason `3`
  (`SuspenseException`), then React yields (`workInProgressSuspendedReason = 7`). On the next
  slice, if the thenable has resolved, React calls **`replaySuspendedUnitOfWork(fiber)`**.
- **`replaySuspendedUnitOfWork`, case 5 (HostComponent).** It calls `resetHooksOnUnwind`,
  then `unwindInterruptedWork` (which pops host context only), `resetWorkInProgress` and
  `beginWork` again. **Nothing resets `nextHydratableInstance` or `hydrationParentFiber`.**
- **So the replay starts from where the first attempt stopped.** The first `beginWork` had
  already claimed the DOM `<main>` and moved the cursor to its first child. `beginWork`
  (case 5, `isHydrating`) therefore calls `canHydrateInstance(<header>, "main", …)`. That
  returns `null`, so `throwOnHydrationMismatch` fires with `args[]=HTML`.
- **Singletons are safe.** `<html>` and `<body>` (tag 27) are re-resolved from the document
  on a replay, not taken from the cursor.
- **Still present upstream.** The standalone `react-dom` 19.2.8 in `node_modules` has the
  same `replaySuspendedUnitOfWork`.

### Why a host element's children can be pending: 3,200 characters

These are read from the payload inlined in the captured HTML
(`self.__next_f.push`, reassembled).
- **Where the cut happens.** In `react-server-dom-webpack-server.node.production.js`,
  `renderModelDestructive` returns `deferTask(...)`, i.e. `"$L" + id`, for any element once
  `3200 < serializedSize`. Each row starts counting from zero.
- **`/summary`.** Row `5` is `<main>`, 4,851 characters. It references **86** later rows by
  `$L`. `$L10` to `$L60` are the valued lines (two of them spans of the line where the cut
  fell). `$L61` to `$L65` are `<main>`'s own last children: the total, both `<section>`s,
  the approve form and the back link. They are the last rows in the payload, so they are the
  last bytes the parser reaches.
- **`/analysis`.** Row `5`, `<main>`, is 4,178 characters. `$L11` to `$L15` are the last
  elements: the year-on-year panel's two lines, the chart and breakdown `<section>`s, and
  the sign-out `<form>`. The form is a direct child of `<main>`, and it is the element that
  differed between the two sides in AC-18's failure.
- **Timing, from the instrumented timelines.** Next takes over `self.__next_f` 15–116 ms
  into the load (mostly 40–60 ms), while `document.readyState` is still `loading`, with
  between 0 and 22 of the 87 pushes parsed. Hydration begins there.

**Why it is intermittent.** Two things must coincide. React has to reach the element before
its rows are parsed, and the parser has to reach them within the few milliseconds React
yields. If the rows are already there, nothing suspends. If they arrive later than the
yield, React unwinds instead of replaying, which is safe. Load on the machine moves the rate
(below).

### This explains the byte-comparison failures

- **The regeneration renders `<main>` from the RSC payload on the client.** Forms come back
  with the client `action="javascript:throw new Error('A React form was unexpectedly
  submitted…`, without `$ACTION_*` fields, and every `<!-- -->` separator is gone.
- **AC-18's two sides differed by exactly that.** The server form against the client form,
  13,524 bytes against 13,666.

## 3. The fix

**`src/components/HydrationGate.tsx`** (new, a client component, about 20 lines of code):

```tsx
export function HydrationGate({ children }: { children: ReactNode }): JSX.Element {
  if (typeof document !== "undefined" && document.readyState === "loading") {
    use(documentParsed()); // one module-level promise, resolved on DOMContentLoaded
  }
  return <>{children}</>;
}
```

**`src/app/layout.tsx`**: `<body …><HydrationGate>{children}</HydrationGate></body>`.

**Why this is the root cause fixed at the application level:**
- **The precondition goes away.** The page hydrates only after the parser has finished the
  document, so every Flight row has already been enqueued and processed. A host element can
  then never suspend on a missing row, and there is nothing to replay.
- **The one thing that still suspends is safe to replay.** That is the gate itself, and it is
  a function component. React replays function components by calling them again, with no
  hydration cursor involved. `<html>` and `<body>` sit above it, and they are singletons.
- **Nothing changes on the server.** `typeof document === "undefined"` there, so the gate
  renders exactly its children. There is no wrapper element, and `renderToString` and
  `prerender` output is identical (unit-tested). No money, no data and no new prop crosses
  the boundary. The only payload change is one client-reference row and one element for
  the gate.
- **No cost a user can see.** A page could not finish hydrating before its last row arrived
  anyway. The timelines show `DOMContentLoaded` about 4–230 ms after hydration started.

**The fixed build, instrumented exactly as in §2** (`scratchpad/p418/fixed1`; the two
throttled rows are `fixed-cpu4`):

| Page | Loads | Mismatches | Host replays while hydrating | `pageerror` |
|---|---|---|---|---|
| `/summary` | 60 | 0 | 0 | 0 |
| `/item-master` | 60 | 0 | 0 | 0 |
| `/item-master/yards/DUBLIN` | 60 | 0 | 0 | 0 |
| `/analysis?period=2103-12&breakdown=supplier` | 60 | 0 | 0 | 0 |
| `/stock-takes` | 60 | 0 | 0 | 0 |
| `/summary`, **4x CPU throttle** (unfixed at 4x: 6 mismatches in 60) | 60 | 0 | 0 | 0 |
| `/item-master`, **4x CPU throttle** | 60 | 0 | 0 | 0 |

**Alternatives rejected:**
- **Patching React, or upgrading Next or React.** This is not application code, and
  `package.json` is pinned: `analysis-contract.test.ts:427` asserts it is untouched. The same
  replay code is in react-dom 19.2.8.
- **Keeping rows under 3,200 characters.** Impossible to guarantee: any page with real data
  crosses the limit (82 summary lines, 140 items).
- **Adding a `<Suspense>` around the page.** It does not stop React replaying the host fiber.
- **Re-targeting the byte comparisons.** Forbidden by the brief, and the comparisons were
  right.

## 4. Regression test

**`tests/e2e/support/hydration.ts`** (new) holds the check. `openWatchedPages` gives N
contexts signed in as one admin. An init script records the page's `error` events and every
`<main>` removed from `<body>`. It watches only `<body>`'s children, so it does not record
every node the parser inserts and does not alter the timing. For each load, `failedLoads`
then:
- requires status 200 and the path unchanged (so a sign-in redirect cannot pass);
- waits until React's root on `document` reports `isDehydrated === false`, which means the
  hydrated or regenerated tree has been committed, and React reports a hydration failure in
  that same commit;
- requires the watcher to have attached (non-vacuity);
- records a failure for any `pageerror` or in-page error, or any removed `<main>`.

If a future React renames `isDehydrated`, the wait never ends and the test fails on its
timeout. It never passes without having looked.

**`tests/e2e/stock-entry-approve.spec.ts`** gains six tests: `#418, batch 1..6`. Each has two
pages loading `/summary` at the same time, 14 loads each, so 168 loads in total. They share
one SUBMITTED count in the file's own reserved year, month 7 (months 1–6 are taken). The
file's `afterAll` already clears 2099. There is no new reserved year, so the census in
`tests/unit/stock-entry-contract.test.ts` (14 files, 15 keys) is untouched.

**Why two pages at once.** The rate depends on how busy the machine is:

| Red run (gate removed: `layout.tsx` = HEAD blob) | Shape | Failed loads | Tests red |
|---|---|---|---|
| red2: this file plus a count-free file in a second worker | 1 page × 16 loads × 6 | **12 / 96** | 6 / 6 |
| red3: this file alone | 1 page × 16 loads × 6 | **3 / 96** | 3 / 6 (batches 4–6) |
| red4: this file alone, **final shape** | 2 pages × 14 loads × 6 | **20 / 168** | **6 / 6** |

- **Every failed load showed both symptoms.** In red4, all 20 were `<main> removed 1x` plus
  `Minified React error #418 … args[]=HTML`.
- **Timing.** Batches ran 26–33 s, inside the 45 s budget. No timeout was raised and no retry
  added.
- **What red4's rate implies.** At that rate a single batch misses with probability of about
  3 %, and all six miss together with probability below one in a billion. At the single-page
  rate (red3), the 168 loads would still give about a 99 % chance of turning red.

**Green, gate restored** (`src/app/layout.tsx` sha256 `a7afeed2…` = byte copy):
`npm run test:e2e -- tests/e2e/stock-entry-approve.spec.ts --project=chromium-stock-entry
--no-deps` → **12 passed (4.6m)**. That is the six existing #9 tests and the six batches.

**Dropped on evidence: a count-free file.** `tests/e2e/hydration.spec.ts` loaded `/analysis`,
`/item-master` and `/stock-takes`, 32 loads each. It stayed **green on the unfixed build** in
red2 (0 of 96). A test that has never been seen red is not a regression test, so I removed
it. A copy is in the scratchpad (`bytes/hydration.spec.dropped.ts`). `/analysis`'s natural
rate on the unfixed build was 0 in 282 real loads across my probes and red runs, against the
one AC-18 hit in the gate, which is too rare to catch by counting. The gate is one
component in the root layout, so every page gets the same fix, and AC-18 itself re-runs
`/analysis` on every gate.

**Unit test, `src/components/HydrationGate.test.ts`** (new, 3 tests):
- the server markup is identical with and without the gate, `<!-- -->` and the hidden field
  included;
- while the document is `loading`, rendering waits and one `DOMContentLoaded` listener is
  registered; firing it completes the render with identical markup;
- once parsed, nothing waits and no listener is registered.

Mutation proofs:
- **M1**, the wait removed: the second test fails (`expected true to be false`).
- **M2**, the children wrapped in a `<div>`: all three fail.

Restored to sha256 `604f4b89…`.

## 5. The record, corrected (comments only; no assertion changed)

The root cause confirms what the capture report suspected: normal hydration **keeps** every
`<!-- -->`, and a #418 regeneration **drops** all of them (246 → 0, above).
- **`tests/e2e/stock-takes-count.spec.ts` (~:462).** It said the separator is "REMOVED when
  the page hydrates". It now says hydration keeps it, and a regeneration removes it. It also
  says the one eight-character difference fits a regeneration on one side but was never
  reproduced, so it is not proven.
- **`tests/e2e/support/stock-takes.ts` (`bodyOf`).** It blamed streaming ("the last chunk may
  not be inserted at `load`"). That was wrong: `load` fires only after the whole document is
  parsed. The comment now names the regeneration, says the `networkidle` wait could not have
  prevented it and only makes the read come after it, and names the fix.

Both `expect`s next to that comment and the `networkidle` wait are byte-unchanged.

## 6. `scripts/db-probe.mjs`: one retry

- `ATTEMPTS = 2` and `PAUSE_MS = 2_000`.
- `answers()` runs the same `prisma db execute` with `SELECT 1`, the same env-only URL, the
  same `connect_timeout=8`, and the same 10 s `spawnSync` bound per attempt.
- The probe runs `answers()` once, then pauses and runs it once more only if it failed.
- Output is unchanged: one line, host only.
- The endpoint choice, the variable fallback and the real session are untouched.
- The header comment states the bound: 10 + 2 + 10 s plus CLI start-up.

**Proofs, real endpoints.** The attempt count comes from a `NODE_OPTIONS` preload that counts
`db execute` children.

| Case | Exit | Attempts | Time |
|---|---|---|---|
| `DATABASE_URL` (dev, healthy) | **0** `[probe] reachable ep-billowing-pine-…` | 1 | 4.0 s |
| `TEST_DIRECT_URL TEST_DATABASE_URL` (what `init` probes; healthy) | **0** `reachable ep-rapid-tooth-…` | 1 | 5.4 s |
| `postgresql://db.invalid:5432/nothing` (cannot resolve) | **1** `[probe] unreachable db.invalid` | 2 | 6.9 s |
| `postgresql://10.255.255.1:5432/nothing` (non-routable: timeout path) | **1** `[probe] unreachable 10.255.255.1` | 2 | **22.4 s** |
| dev, first attempt forced to fail by the preload, second real | **0** `reachable ep-billowing-pine-…` | 2 | 5.8 s |

**Unit tests, `tests/unit/db-connection-guard.test.ts`** (4 new, no database needed; the
attempt count comes from a counting preload):
- an unreachable host is asked exactly twice, exits 1, and takes at least 2 s and under 30 s;
- a first miss followed by an answer exits 0 after 2 attempts;
- a first answer means 1 attempt;
- two misses still produce exactly one output line.

**Red** against the probe without the retry (the `HEAD` bytes restored): the three
"twice" tests fail (`expected 1 to be 2`), and the "asked once" test passes, as it should.
Restored to sha256 `5c778748…`, identical to the retry copy.

**The retry broke two existing tests on the clock, and I fixed their harness, not their
assertions.** The first full `test:unit` after the retry passed (56 files / 831). The second,
once the gate's unit test had been added, failed 2 of 834: `exits 1 and says
unreachable…` and `names the host…`, both with `Test timed out in 15000ms` after about 22 s,
plus a Vitest `Timeout calling "onTaskUpdate"`. Under a loaded
run, each `db.invalid` attempt used its full 10 s bound. The probe's new worst case (about
22 s) is longer than the suite's 15 s default, and `spawnSync` blocked the worker for all of
it. The fix, in the test file only:
- the probe is run with an async `spawn` (`runNode`), so the worker's event loop stays free;
- tests that run the real CLI against a host that does not answer carry
  `PROBE_TEST_TIMEOUT_MS = 40_000`, derived from the script's documented worst case and
  explained where it is declared.

Every assertion is unchanged. After the change: 12/12 on the file alone, and **57 files /
834 tests green in two consecutive full `npm run test:unit` runs**. The red proof was
repeated on the converted file, with the same three failures.

**Cost.** The probe test file now takes about 40 s in a full run and is the suite's long
pole: `test:unit` took 41 s wall-clock in both final runs.

**Recorded** in `docs/verification.md`, §5 (Database), directly after the probe description.

## Files created

- `src/components/HydrationGate.tsx`: holds hydration until the document is parsed; renders
  exactly its children.
- `src/components/HydrationGate.test.ts`: server markup unchanged; waits only while
  `loading`.
- `tests/e2e/support/hydration.ts`: the per-load hydration check (errors plus `<main>`
  removal, React-root commit wait).
- `progress/impl_hydration_418.md`: this report.

## Files modified

- `src/app/layout.tsx`: `{children}` wrapped in `<HydrationGate>`, with a comment.
- `tests/e2e/stock-entry-approve.spec.ts`: one import, and six `#418` batch tests at the end.
- `tests/e2e/stock-takes-count.spec.ts`: one comment corrected (§5).
- `tests/e2e/support/stock-takes.ts`: one comment corrected (§5).
- `scripts/db-probe.mjs`: one retry after 2 s; the header states the bound and the reason.
- `tests/unit/db-connection-guard.test.ts`: four retry tests with a counting preload. The
  probe runs through an async `spawn`, with a per-test bound derived from the probe's worst
  case (§6). No assertion was changed.
- `docs/verification.md`: the retry, its bound and its reason, next to the probe description.
- `docs/operations.md`: "ten second timeout" became "per attempt, and one retry", so the
  second description of the probe is not left wrong.
- `progress/current.md`: this pass's plan and log, appended at the end.

Nothing under `Samples/`, `src/server/**`, `prisma/**`, `package.json`, `playwright.config.ts`,
any spec, or `feature_list.json` was touched.

## Deviations from the brief

- **No `next dev` diff message.** Dev reproduced 0 of 80. The element and React's hydration
  state were captured from the production bundle instead (§2). That is stronger evidence,
  but it is not what the brief named.
- **The regression test covers `/summary` only.** The count-free companion was written, run
  red-first, stayed green on the unfixed build, and was removed (§4).
- **Two pages load at once in the regression test.** This was chosen deliberately to make
  the race observable (§4). It adds no timeout and no retry.
- **The probe's unit tests carry a 40 s per-test bound** (§6). They are not among the
  byte-comparison tests whose timeouts the brief forbids raising. The bound follows the
  probe's own documented worst case, which the requested retry created. It is stated here so
  the reviewer can rule on it.

## Notes for the reviewer and the leader

- **003 AC-24's wording is now inexact.** It says the probe "exits `0` when the database
  answers within 10 seconds and `1` otherwise". With the brief's retry, a database that first
  answers on the second attempt exits `0`, and an unreachable one takes about 22 s. The
  per-attempt bound is still 10 s. The spec text is the leader's to amend. I did not edit
  it.
- **The defect is React's, and the gate works around it.** If a later Next or React
  release fixes `replaySuspendedUnitOfWork` for host components during hydration, the gate
  can go. The regression test will say whether it is still needed.
- **The instrumentation was temporary and lived in `.next` only.** Every later build replaced
  it. The final build is described under Verification.
- **`src/app/layout.tsx` line endings.** The working copy is CRLF, as it was before my edit.
  `git diff` shows 11 content lines. The unfixed red runs used the HEAD blob via
  `git show HEAD:src/app/layout.tsx`.

## Verification output

All on the final tree. No `init` was run and no `test:db` was needed: nothing under
`src/server/**` or `prisma/**` changed.

```
npm run typecheck                    exit 0
npm run lint                         exit 0   (eslint src tests --max-warnings 0)
npm run test:unit   (run 1)          Test Files 57 passed (57)   Tests 834 passed (834)
npm run test:unit   (run 2)          Test Files 57 passed (57)   Tests 834 passed (834)
npm run test:e2e    (both phases, final src, 13:58-14:09)
  [e2e] phase 1 of 2: chromium                56 passed (2.4m)
  [e2e] phase 2 of 2: chromium-stock-entry    1 failed, 141 passed (6.9m)
        x stock-entry-filters.spec.ts:302  AC-23, AC-24, AC-25: a filter can never let a
          counter believe they have finished   (pre-existing, see below; not caused here)
        ok  #418, batch 1..6 (all six, in the full run under three workers)
npm run test:e2e -- tests/e2e/stock-entry-approve.spec.ts --project=chromium-stock-entry --no-deps
        12 passed (4.6m)
npm run build   (final, clean)       exit 0; react-dom chunk sha256 2c752a40… = the
                                     uninstrumented original; no hook left in it
```

AC-18 (the test at `analysis-access.spec.ts:251`, whose comparison at `:321` failed the
2026-09-24 gate)
passed in the full run, as did every other byte comparison (#9 AC-23 and #10's five).

**The one e2e failure is pre-existing, and I measured that rather than assumed it.**
`stock-entry-filters.spec.ts:302` expected `Filters are hiding 82 items, 81 not counted.`
and received `… 82 not counted.`

- **What the trace shows.** The *None held* tap's `POST /api/counts/<id>/lines` started at
  13:04:40.693 and took **959 ms**. The test's next `page.goto(...?type=A-S&unit=1)` started
  **382 ms** after it. That page is the one the final assertion reads, and the server
  rendered it before the save had committed.
- **Nothing in the test waits for the save to be acknowledged.** It is a race between the
  autosave and a server read, and the database's latency decides it. Hydration plays no
  part: the tap happened on a page that had already hydrated.
- **The unfixed layout fails it as often.** I restored the HEAD `layout.tsx`, built, and ran
  `npx playwright test tests/e2e/stock-entry-filters.spec.ts --project=chromium-stock-entry
  --no-deps` three times: **fail, pass, fail**, with the identical received text. With the
  gate: fail (full run), fail, pass.
- **Not fixed.** It is another feature's test, and this pass is scoped to #418. It is
  reported here for the leader.

**Dev database, census before (11:59) and after (final):** identical.

| users | e2e users | locations | suppliers | item types | items | item prices | item-locations | stock counts | count lines |
|---|---|---|---|---|---|---|---|---|---|
| 4 | 4 | 2 | 10 | 19 | 140 | 129 | 152 | 0 | 0 |

The `SUBMITTED` 2099 count named as known debris in the brief was already gone at 11:59 (0
stock counts). Every probe user and fixture I created was deleted by the script that created
it. The 4 e2e users are the pre-existing ones.

**Final hashes (sha256, first 16).** Restores were verified against the scratchpad byte
copies in `scratchpad/bytes/`.

| File | sha256 |
|---|---|
| `src/app/layout.tsx` | `a7afeed260408f0a` |
| `src/components/HydrationGate.tsx` | `604f4b895d4d6b65` |
| `src/components/HydrationGate.test.ts` | `9b5ce4af85f9ffb6` |
| `tests/e2e/support/hydration.ts` | `fee92086ec315023` |
| `tests/e2e/stock-entry-approve.spec.ts` | `f06db03da5e88ab2` |
| `tests/e2e/stock-takes-count.spec.ts` | `9704498fb3a6bdf3` |
| `tests/e2e/support/stock-takes.ts` | `f0cebc192e3c301b` |
| `scripts/db-probe.mjs` | `5c7787483df9720d` |
| `tests/unit/db-connection-guard.test.ts` | `eba8fe585c6cacab` |
| `docs/verification.md` | `24cebf65a1e63beb` |
| `docs/operations.md` | `af23bcde8863ece9` (was `43b8dc2bf09f72fd`) |

## Cost

Measured from this session's transcript
(`~/.claude/projects/<project>/b45b64e1-…/subagents/agent-a8082fe7a5a8f8f27.jsonl`, 167
API calls, deduplicated by message id), shortly before this section was written:

- **Input: 47,548,888 tokens.** That is `input_tokens` 334 + `cache_creation_input_tokens`
  2,618,801 + `cache_read_input_tokens` 44,929,753. 94.5 % of it is cache reads.
- **Output: 254,423 tokens.**

Most of the input comes from the number of tool calls. The long e2e and probe runs were
single calls.

## Final pass (review recommendations)

**Brief:** leader's scratchpad `fix-trims.md`, adopting R-1 and O-2 to O-6 from
`progress/review_repairs_0924.md` (APPROVED). Run on 2026-09-24, 15:03 to 15:30.
**Status:** complete. Every item is done and has evidence. `init` and `test:db` were not run
(the brief forbade them). Nothing was committed.

### 1. R-1: the regression test, right-sized

- **`tests/e2e/stock-entry-approve.spec.ts`:** the `#418` batch loop now runs `[1, 2, 3]`
  (84 loads) instead of six batches. Its comment now gives the reason (R-1's numbers), this
  shape's red result, and a pointer to the static test. The test body is byte-unchanged.
- **New `src/app/layout.test.ts` (2 tests; no browser, no database; 97 ms in a full run).**
  It parses `src/app/layout.tsx` with the TypeScript compiler API. `typescript` 5.9.3 is
  already a devDependency. Two assertions:
  - there is exactly one `<body>`, its only rendered child is `<HydrationGate>`, and the
    gate's only rendered child is `{children}`. Whitespace and JSX comments are ignored,
    because they render nothing;
  - `HydrationGate` is imported from `@/components/HydrationGate`, and from no stand-in.

**Red at the new shape.** `src/app/layout.tsx` was replaced with
`git show HEAD:src/app/layout.tsx` (sha256 `1f2f01ba0ab7f98c`; `git diff --quiet HEAD` exit 0).

| Check on the HEAD layout | Result |
|---|---|
| `npx vitest run src/app/layout.test.ts` | **2 of 2 red:** `expected [ '{children}' ] to deeply equal [ '<HydrationGate>' ]` and `expected [] to deeply equal [ '@/components/HydrationGate' ]` |
| `npm run build` | exit 0 |
| `npx playwright test tests/e2e/stock-entry-approve.spec.ts --project=chromium-stock-entry --no-deps -g "#418"` | **3 failed**, on **10 of 84 loads** (5, 4, 1). Every failed load read `<main> removed 1x; errors: Minified React error #418 … args[]=HTML`. The batches took 25.1 s, 23.8 s and 20.7 s. |

The layout was then restored from the byte copy: sha256 `a7afeed260408f0a`, identical to
the copy taken before the pass.

**Green, restored layout and the new gate (§2), after a rebuild (exit 0):**
- the same `-g "#418"` command gave **3 passed (1.1m)**, with batches of 26.0 s, 16.7 s and
  14.8 s;
- the whole file (`npx playwright test tests/e2e/stock-entry-approve.spec.ts
  --project=chromium-stock-entry --no-deps`) gave **9 passed (2.4m)**: the six #9 tests and
  the three batches.

10 of 84 is 11.9%, the same rate as red4's 20 of 168.

**The static test also catches the gate being moved, not only removed.** Each mutant below
was applied to a byte copy of the layout. The layout was restored afterwards and re-hashed:
`a7afeed260408f0a`.

| Mutant of `layout.tsx` | Observed |
|---|---|
| L-M1: `<div><HydrationGate>{children}</HydrationGate></div>` | red: `expected [ '<div>' ] to deeply equal [ '<HydrationGate>' ]` |
| L-M2: `<HydrationGate><main>{children}</main></HydrationGate>` | red: `expected [ '<main>' ] to deeply equal [ '{children}' ]` |
| L-M3: a `<footer />` added beside the gate | red: `expected [ '<HydrationGate>', '<footer />' ] to deeply equal [ '<HydrationGate>' ]` |
| L-M4: the import changed to `./gate-stand-in` | red: `expected [ './gate-stand-in' ] to deeply equal [ '@/components/HydrationGate' ]` |

### 2. O-4: the gate also resolves on `readystatechange`

`documentParsed()` in `src/components/HydrationGate.tsx` now registers two listeners on the
same module-level promise:
- `DOMContentLoaded`, as before;
- `readystatechange`, which resolves once `document.readyState !== "loading"`.

The `readyState === "loading"` guard in the component is unchanged. The `readystatechange`
listener is deliberately left registered: it fires once more at `complete`, and a second
`resolve()` does nothing. The function's comment gives the reason. An aborted parse (Stop,
`window.stop()`) goes straight to `complete`, and the standard's abort steps fire no
`DOMContentLoaded`.

**A timing change the reviewer should know about.** On a normal load the gate now opens at
`interactive`. That is slightly *earlier* than `DOMContentLoaded`: before deferred scripts,
and before Next's own `DOMContentLoaded` handler closes the Flight stream. Why this still
removes the precondition:
- `interactive` is set only once the parser has finished, so every inline
  `self.__next_f.push` has run;
- per the review's A1, the Flight reader consumes each chunk in that script's microtask
  checkpoint, so every model row is present;
- closing the stream adds no row.

The runtime evidence is the green runs in §1, which used this build: 84 loads, 0 failures,
and 9 of 9 tests in the file. The reasoning above is not a separate measurement.

**`src/components/HydrationGate.test.ts`: 3 tests became 5.**
- The fake document also records `readystatechange` listeners.
- A new `it.each` covers `interactive` and `complete`. In each case, while the document is
  `loading`:
  - nothing settles, and exactly one `readystatechange` listener is registered;
  - a `readystatechange` fired while the document is still `loading` does not open the gate;
  - once `readyState` changes and the event fires (with no `DOMContentLoaded`), the render
    completes with markup identical to the page alone. This is checked against a 1 s bound,
    so a gate that stays shut fails on the assertion rather than on the clock.
- "Once parsed" also asserts that no `readystatechange` listener was registered.

**Mutations.** Each ran against a byte copy of the final gate. The gate was restored
afterwards and re-hashed: `a5cc932bfc2c4db9`.

| Mutant | Expected | Observed |
|---|---|---|
| G-M1: `use(documentParsed())` changed to `documentParsed()` | the waiting tests go red | the DCL test and both new cases are red (`expected true to be false`); 2 pass |
| G-M2: children wrapped in `<div>` | every markup comparison goes red | 5 of 5 red, at the `toBe` markup comparisons |
| G-M3: guard changed to `!== "complete"` (a hang) | "once parsed" goes red | red on `Test timed out in 15000ms` (the hang itself); 4 pass |
| G-M4: `"DOMContentLoaded"` changed to `"load"` | the listener assertion goes red | red: `expected [] to have a length of 1`; the new cases still pass, as they should |
| G-M5 (new): the `readystatechange` listener removed | both new cases go red | red: `expected [] to have a length of 1`; 3 pass |
| G-M6 (new): the `!== "loading"` check removed | both new cases go red | red at the "still loading" step: `expected true to be false` |
| G-M7 (new): the check narrowed to `=== "complete"` | the `interactive` case goes red | red: `expected 'still waiting' to be '<main class="p-4">…'`; the `complete` case passes |

The four earlier mutants still go red under unchanged assertions. After these runs, the two
`it.each` titles were reworded, and nothing else changed. The final file is green in the full
runs below.

### 3. O-2 and O-3: the gate's comment

The following was added to the module comment of `src/components/HydrationGate.tsx`:
- **O-2:** "no visible cost" holds because no protected page has a Suspense boundary. A page
  that streamed slow content behind one would have its whole shell held un-hydrated until the
  stream ended.
- **O-3:** the gate covers the page's *model* rows. A row blocked on a client *module* (a
  client component passed as a prop value under a host element, for example a future nested
  layout's `error.tsx`) could still be pending after parsing. Nothing in today's tree does
  this: `src/app/layout.tsx` is the only layout.
- The placement sentence now names `src/app/layout.test.ts` as the test that pins the gate.

### 4. O-5 and O-6: stale descriptions of the probe (comments and docs only)

- **`scripts/db-probe.mjs` header ("Exits:").** It now says "10 + 2 + 10. Starting the Prisma
  CLI happens INSIDE each attempt's 10 seconds; only this script's own start-up falls outside
  them." No code changed.
- **`docs/verification.md` §5.** Now reads "10 + 2 + 10, with 22.4 s measured …". CLI
  start-up is inside each attempt's 10 s bound, and only the probe's own start-up is outside
  it.
- **`tests/e2e/support/database.ts:11`.** The comment now says that this check is a TCP
  connection with no session and no query. It also says this is **not** what
  `scripts/db-probe.mjs` does: that probe was rewritten on 2026-09-17 to open a real session
  and run `SELECT 1` (the date is from spec 003's post-approval amendment, line 261; the
  commit is `94a33cb`, 2026-09-23). This is a comment-only change, and the code below it is
  byte-unchanged.
- `docs/operations.md` was checked and already had no "plus starting the CLI" wording. No
  other stale description of the probe was found by grep.

### Verification (final tree)

```
npx vitest run src/app/layout.test.ts src/components/HydrationGate.test.ts   7 passed (2 files)
npm run typecheck                                   exit 0
npm run lint                                        exit 0   (eslint src tests --max-warnings 0)
npm run test:unit   run 1   Test Files 1 failed | 57 passed (58)   Tests 1 failed | 837 passed (838)
                            x lint-fence.test.ts "AC-33: `@/server/db` is an error from src/lib/"
                              Test timed out in 15000ms   (whole run slow: 65.1 s, collect 70 s)
npm run test:unit   run 2   Test Files 58 passed (58)   Tests 838 passed (838)   41.6 s
npm run test:unit   run 3   Test Files 58 passed (58)   Tests 838 passed (838)   45.1 s
e2e, HEAD layout,  -g "#418"          3 failed  (10 of 84 loads)
e2e, final tree,   -g "#418"          3 passed (1.1m)
e2e, final tree,   whole approve file 9 passed (2.4m)
```

The count went from 57 files / 834 tests to 58 / 838: one new file (`layout.test.ts`, 2
tests) and 2 new gate cases.

**The run-1 failure is not in this pass's files, and I did not change it.**
`tests/unit/lint-fence.test.ts` is untouched. Its first test pays ESLint's cold start (config
and plugins) inside the 15 s default. That took 9.5 s in green run 3, a margin of about
5.5 s. Run 1 came straight after the e2e server's teardown and was slow throughout (65 s
against 41–45 s, collect 70 s against 25–31 s). The new `layout.test.ts` took 97 ms of test
time in that run. I cannot rule out that its `typescript` import adds some load at collection.
Runs 2 and 3 were green on the same bytes. I raised no timeout and added no retry. **For the
leader:** this test's margin is thin under load, and that predates this pass.

**Dev database census, after the e2e runs:** 4 users (4 e2e), 2 locations, 10 suppliers, 19
item types, 140 items, 129 item prices, 152 item-locations, 0 stock counts, 0 count lines.
This matches the brief's figures and the census at the end of the earlier pass. I did not take
a separate census at the start of this pass.

Port 3000 is free: Playwright started and stopped `next start` for each run. `.next` holds the
final build (restored layout, new gate).

### Files

| File | Change | sha256 (first 16) |
|---|---|---|
| `src/app/layout.test.ts` | **new**: the static pin (2 tests) | `48408ec513529791` |
| `src/components/HydrationGate.tsx` | `readystatechange` path; O-2/O-3 sentences | `a5cc932bfc2c4db9` (was `604f4b895d4d6b65`) |
| `src/components/HydrationGate.test.ts` | +2 cases, fake records `readystatechange` | `44dd34a1e2533176` (was `9b5ce4af85f9ffb6`) |
| `tests/e2e/stock-entry-approve.spec.ts` | 6 → 3 batches; comment | `21090c678e4bb346` (was `f06db03da5e88ab2`) |
| `scripts/db-probe.mjs` | header comment only (O-5) | `cce9a00811a78811` (was `5c7787483df9720d`) |
| `docs/verification.md` | §5 wording (O-5) | `413166aeec745285` (was `24cebf65a1e63beb`) |
| `tests/e2e/support/database.ts` | comment only (O-6) | `18bf1b45d91349c5` (was `b99388f429bf69ac`) |
| `src/app/layout.tsx` | **unchanged**: swapped temporarily, restored | `a7afeed260408f0a` |
| `tests/e2e/support/hydration.ts` | unchanged | `fee92086ec315023` |

`progress/current.md` also had this pass's plan and log appended, as the implementer
protocol requires. No other file was touched. The pre-pass byte copies, the mutation helper
and the run logs are in `scratchpad/trims/`.

### Deviations from the brief

- **The red e2e run predates one comment sentence.** It ran before the spec's comment gained
  the sentence that reports its result ("all three failed, on 10 of their 84 loads"). That
  edit is comment-only. Both green runs used the final bytes.
- **The whole approve file was run once as well (9 passed).** This was in addition to the two
  `-g "#418"` runs the brief named, because this pass changed that file's test count.

### Cost

Measured from this session's transcript (`subagents/agent-a328522530a80848f.jsonl`, 47 API
calls, deduplicated by message id), shortly before this section was written:
- **Input: 3,998,660 tokens.** That is `input_tokens` 94 + `cache_creation_input_tokens`
  109,250 + `cache_read_input_tokens` 3,889,316.
- **Output: 41,448 tokens.**
