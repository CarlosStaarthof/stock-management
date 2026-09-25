# Review: repairs outside feature #11 (2026-09-24)

**Verdict:** APPROVED. 0 blocking findings. This holds only if the coordinator's next full gate is green (see *init*).
**Scope:** A (the React #418 gate), B (the probe retry and 003 AC-24), C (the `$ACTION` capture and the security wait), D (two comments).
**Reports checked against the tree:** `progress/impl_hydration_418.md`, `progress/impl_action_capture.md` (with its coordinator's note).
**init:** **not run.** The coordinator forbade `test:db` while an e2e run is in progress, and `init` runs `test:db`. What I ran instead is listed below. None of these repairs touches `src/server/**` or `prisma/**`. The approval therefore depends on the next full gate: `init` with the database checks **not** skipped, plus both e2e phases.

## What I ran (unit level only; no Playwright, no `test:db`)

| Command | Result |
|---|---|
| `npx vitest run src/components/HydrationGate.test.ts tests/unit/db-connection-guard.test.ts` | 2 files, 15/15 passed (36 s; the probe tests are the long pole) |
| `npm run test:unit` | **57 files, 834/834 passed** |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0. See the note below. |
| `eslint` on the nine in-scope files, `--max-warnings 0` | exit 0 |
| `node scripts/db-probe.mjs DATABASE_URL` (healthy dev database) | `[probe] reachable ep-billowing-pine-…`, exit 0 |

**Lint note.** My first full `npm run lint` failed on 1 warning. The file that caused it, `tests/e2e/stock-entry-filters.spec.ts`, was being edited live by the other implementer. It is outside this review's scope and is not among these repairs. A re-run a minute later was green. The in-scope files were lint-clean both times.

**Mutations I ran myself.** Each file was byte-copied to the scratchpad first. Each restore was checked with sha256.

| Mutant | Expected | Observed |
|---|---|---|
| G-M1: `use(documentParsed())` changed to `documentParsed()` (listener kept, no wait) | the "while loading" test goes red | red at `HydrationGate.test.ts:85`, `expected true to be false` |
| G-M2: children wrapped in `<div>` | the server-markup test goes red | all 3 red, at the `toBe` markup comparisons (`:65`, `:91`, `:98`) |
| G-M3: guard `=== "loading"` changed to `!== "complete"` (a **hang** whenever the gate renders during `interactive`) | the "once parsed" test goes red | red on the 15 s test timeout. This is the hang itself, so failing on the clock is the correct failure here. |
| G-M4: `"DOMContentLoaded"` changed to `"load"` | the listener assertion goes red | red at `:86`, `expected [] to have a length of 1` |
| P-M1: `scripts/db-probe.mjs` `ATTEMPTS = 1` (the retry removed) | the three "twice" tests go red, and "asked once" stays green | exactly that. `expected 1 to be 2` ×3, 1 passed. |

The hashes after all of this match the reports' final hashes and the tree as I found it. `HydrationGate.tsx` is `604f4b895d4d6b65`, `db-probe.mjs` is `5c7787483df9720d`, and all eleven in-scope files were identical on re-hash.

---

## A. The React #418 fix: `HydrationGate`

### A1. Is the causal chain sound? **Yes. I read it in the source myself.**

File: `node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.production.js` (React `19.2.0-canary-0bdb9206-20250818`, Next 15.5.25).

1. **First pass.** `beginWork` case 5 (`:7606`), while hydrating, claims `nextHydratableInstance` through `canHydrateInstance` (`:7609`). It then sets `hydrationParentFiber` to the fiber and moves the cursor to the claimed node's `firstChild` (`:7618`). Only after that does it call `reconcileChildren`.
2. **The suspension.** A `$L` child whose Flight chunk is still pending throws from `resolveLazy` (`:3257`) as a `SuspenseException`. It does so inside that reconcile, so the unit of work that suspended is the **host** fiber itself. `handleThrow` sets reason 3 (`:10930`), and `renderRootConcurrent` turns that into 7 and yields.
3. **The replay.** On the next slice, if the thenable has resolved, case 7 (`:11108`–`:11112`) calls `replaySuspendedUnitOfWork`. For tag 5, that runs `resetHooksOnUnwind`, then falls through to `unwindInterruptedWork`, `resetWorkInProgress` and `beginWork` (`:11186`–`:11216`). `unwindInterruptedWork` case 5 only pops host context (`:8498`–`:8499`). **Nothing rewinds `nextHydratableInstance` or `hydrationParentFiber`.**
4. **The mismatch.** The second `beginWork` case 5 therefore tries to claim the element's own first child as the element. That fails `canHydrateInstance`, and `throwOnHydrationMismatch` fires (`:7622` → `:2739`) with `args[]=HTML`. This is exactly the state the report captured: parent is the element itself, cursor is on its first child.
5. **Upstream.** Standalone `react-dom` 19.2.8 in `node_modules` has the same case-5 fall-through, as the report says.

**Does the gate remove the precondition, or just move the timing? It removes it, for every model row.**
- Next feeds `self.__next_f` into the Flight stream synchronously, from each inline script (`node_modules/next/dist/client/app-index.js:37`–`:69`). The Flight reader then consumes each chunk in that script's microtask checkpoint.
- By `DOMContentLoaded` every inline script has run, and Next's own `DOMContentLoaded` handler has **closed** the stream (`app-index.js:106`–`:117`). That listener was registered at module evaluation, before the gate's, so it runs first. Next itself treats this event as "the RSC payload is complete".
- So once the gate lets go, no `$L` model reference under a host element can still be pending. The only thing that suspends is the gate, a tag-0 function component, and `replayFunctionComponent` touches no hydration cursor.

**One residual path, reasoned rather than measured (non-blocking, see O-3).** A row can still be pending after `DOMContentLoaded` if it is blocked on a client **module** chunk loaded by an async script. That happens with a client reference passed as a prop *value*, for example the `error` component on a nested `LayoutRouter`. It does not occur today:
- `src/app/layout.tsx` is the only layout in the tree (`find src/app -name layout.tsx`);
- the root `LayoutRouter` sits under the gate, not under a host element;
- client components used as element *types* become tag-16 lazy fibers, and replaying those is safe.

### A2. Is the server output unchanged? **Yes, and the assertion can fail.**
- `HydrationGate.tsx:42` is false on the server (`typeof document === "undefined"`), so the gate returns `<>{children}</>` with no wrapper element.
- `HydrationGate.test.ts:61`–`:69` compares `renderToString` with and without the gate and requires `<!-- -->` and the hidden field to be present (non-vacuity).
- G-M2, a `<div>` wrapper, turned all three tests red at the markup comparison. I reproduced this; it matches the report's M2.
- In Next, the payload gains one client-reference row and one element for the gate, and no data. The e2e money scans and byte comparisons passed in the implementer's full run.

### A3. Can it hang? **No realistic path.**
- **The guard.** `use()` is reached only while `readyState === "loading"` (`:42`). In that state `DOMContentLoaded` has not yet fired, and the listener is added synchronously in the same call (`:57`–`:59`), so the event cannot be missed. The promise is module-level and stable.
- **The retry.** A render that happens after parsing skips `use` altogether. React explicitly allows conditional `use`.
- G-M3 shows what the unit suite does if someone widens the guard into a hang: it fails. And `tests/e2e/support/hydration.ts` waits for `isDehydrated === false`, so a hung gate would fail every batch on its timeout.

Cases I walked:

| Case | Result |
|---|---|
| Client navigation / `router.refresh()` | `readyState` is `complete`. No `use`, and there is no hydration either. |
| `error.tsx` (`src/app/error.tsx`, client) | Renders inside the layout, below the gate. Only reachable after the gate has let go, or client-side when `complete`. |
| `not-found.tsx`, the sign-in page, `(public)` | All under the same root layout, with the same single wait. There is no `global-error.tsx`; Next's default one replaces the layout and has no gate, which is harmless. |
| Back/forward cache | A page still `loading` is not eligible for bfcache. A restored page is already hydrated and does not re-render. |
| POST (MPA) action responses | A new document, which loads like any other page. |
| **Stop button / `window.stop()`** | O-4: the only theoretical hang, and it is harmless. |

### A4. Does it change anything a user or a criterion depends on?
- **JS off.** The markup is identical (A2). JS-off users never run the gate. Progressive forms keep their `$ACTION_*` fields. In fact they now keep them for JS-on users too, which is the point of the fix.
- **Money boundary (C4).** The gate imports only `react` and carries no props or data. The new payload row is a module reference named `HydrationGate`. No price, value or total can pass through it.
- **Time to interactive.**
  - Hydration now starts no earlier than `DOMContentLoaded`: 4–230 ms later in the implementer's timelines.
  - That costs nothing in practice **because no protected page streams**. Each one deliberately has no Suspense boundary or `loading.tsx` (`src/app/stock-entry/page.tsx:34`, `src/app/stock-takes/page.tsx:72`, `src/app/analysis/page.tsx:66`), so there is no early shell that selective hydration could have made interactive sooner.
  - The gate's comment ("a page cannot finish hydrating before its last row arrives anyway", `HydrationGate.tsx:31`–`:32`) is true, but it depends on that fact without saying so (O-2).
- **E2E timing.** Hydration now lands systematically after `DOMContentLoaded`. The implementer's full run (phase 1 56/56; phase 2 141/142, the one failure pre-existing and measured as failing just as often without the gate) is the evidence that no spec depended on earlier hydration.

### A5. The regression test
- **Can it fail? Yes.**
  - Red: 20 of 168 loads, 6 of 6 batches, gate removed, `layout.tsx` = HEAD blob.
  - Green: 12/12 on the final bytes.
  - I could not re-run either (no e2e allowed), so I read `tests/e2e/support/hydration.ts` for ways it could pass without looking:
    - status 200 and an unchanged path are required, so a redirect cannot pass;
    - `watch.watching` must be true, so a detached watcher cannot pass;
    - the "done" signal is React's own root commit (`isDehydrated === false`), not a sleep or `networkidle`. Recoverable hydration errors are reported, and `<main>` is removed, inside that same commit, before the next `evaluate`.
  - On failure, Playwright restarts the worker, and `beforeAll` clears 2099 again. So the later batches rebuild their month-7 count cleanly, and red4's six failures were genuine assertion failures, not fixture collisions.
  - I found no vacuous-pass path.
- **Only `/summary`, and `/analysis` dropped: acceptable.**
  - A count-based test that was never seen red on the unfixed build (0 of 96 on the count-free companion) is not a regression test.
  - The gate is one component in the root layout, so `/summary` going red or green shows the mechanism for every page.
  - `/analysis` is still watched on every gate by 011 AC-18's byte comparison. That comparison is what caught the one known regeneration there.
- **Proportionality: recommend 3 batches, not 6, plus a free static test (R-1). Numbers below.**
  - A run misses a real regression with probability (1 − p)^N, where p is the per-load failure rate without the gate.
  - The measured two-page rate is 20/168 = **11.9%**; its Wilson 95% lower bound is **7.8%**.
  - The single-page rate (red3) is 3/96 = 3.1%. It is shown only for contrast: the test runs two pages at a time.

| Batches (loads) | Miss @ 11.9% | Miss @ 7.8% (lower bound) | Miss @ 3.1% | Time in phase 2 (one worker; the file is serial, `fullyParallel: false`) |
|---|---|---|---|---|
| 6 (168), current | 5.6e-10 | 1.2e-6 | 0.5% | ~3 min |
| **3 (84)** | **2.4e-5** | **1.1e-3** | 7% | **~1.5 min** |
| 2 (56) | 8.3e-4 | 1.1% | 17% | ~1 min |
| 1 (28) | 2.9% | 10% | 41% | ~0.5 min |

  - Three batches keep a miss chance of about 1 in 1,000 even at the pessimistic end of the measured rate, and they halve the cost.
  - The rate in the real gate, with three workers busy, is likely at least red4's, because red2 with one busy neighbour gave 12.5% on a single page.
  - Six batches buy nine orders of magnitude where three already buy four or five. That is more power than a guard for one component needs.

---

## B. The database probe's single retry: **sound**
- **Unreachable host.** Still exits 1. The real CLI against `db.invalid` was asked exactly twice and exited 1 (`db-connection-guard.test.ts`, "asked twice"). Real timings came in well under the 30 s test ceiling.
- **Healthy host.** Exits 0: the "asked once" test, plus my own run against the dev database.
- **Miss, then answer.** Exits 0 after 2 attempts.
- **Output.** Still one line, and it names only the host.
- **Red proof.** Reproduced independently (P-M1).
- **The async `spawn` and the 40 s per-test bound.** Justified. The bound follows the script's documented worst case (~22 s), is declared once with its reason (`db-connection-guard.test.ts` `PROBE_TEST_TIMEOUT_MS`), and no assertion changed.
- **`init`.** `init.sh:199`–`:209` and `init.ps1:223`–`:231` stop at the first failed probe. So an offline `init` pays ~22 s once, not twice.
- **The ~22 s bound.** Correct in substance, and 22.4 s was measured. One wording nit (O-5): the CLI's start-up time falls *inside* each attempt's 10 s `spawnSync` bound. The only time outside the bound is the probe's own Node start. "10 + 2 + 10, plus the time it takes to start the CLI" slightly overstates it.
- **003 AC-24 as amended.** Accurate. The spec's wording (`specs/features/003-auth_and_roles.md:200`) is: "opens a real session and exits `0` when the database answers within 10 seconds on either of two attempts, 2 seconds apart (about 22 seconds at worst), and `1` otherwise". That matches the code. `feature_list.json` carries identical AC-24 text, so C1.4 holds for #3. The dated "Post-approval amendments" note is the right way to record it.

## C. Server-action capture and the security wait: **now a real guard**
- **The capture** (`stock-entry-approve.spec.ts` `hiddenFieldsAsServed`, `:116`–`:134`) is sound:
  - `context.request.get` uses that context's cookies and runs no script;
  - `DOMParser` in a blank page is the browser's own parser, with no script execution and attribute decoding the same as a form post;
  - it selects the same forms as the old locator chain;
  - if the admin session were lost, the redirect page has no approve form, `hidden` is empty, and the non-vacuity guard at `:468` fails. The implementer proved that red twice.
- **The security wait** (`:508`–`:519`). `Request.response()` waits for the server's response. Next answers an MPA action only after the action has run: a 303 after a breached approve, a 307 from the page guard after a refusal, as the implementer's probe 3 observed. So the five row assertions at `:522`–`:527` now come after the service's decision.
  - Documented red, with the role check replaced by `assertUser`: it fails at `:522`/`:523` `after.status`, `Received: "APPROVED"`. That is the assertion that matters.
  - Before this fix the test passed vacuously, which is the evidence that the old test was hollow.
  - I did not re-run this proof, because it needs e2e and a breached service.
- **The coordinator's two unproven claims** are now covered by later evidence in `impl_hydration_418.md`, which ran on the final bytes of this spec (`f06db03d…`):
  - real harness on :3000: `stock-entry-approve.spec.ts` 12/12 dedicated, and phase 2 141/142 with the approve and quantities specs green;
  - census: 0 stock counts at 11:59 and identical at the end, so the 2099-01 debris was gone.
- **`stock-entry-quantities.spec.ts:423`–`:428`.** Comment only, and correct: that context has JavaScript disabled, so the live DOM is the server's HTML.

## D. Two comments corrected: **match the observations**
- **`tests/e2e/stock-takes-count.spec.ts:462`–`:471`.** Normal hydration keeps `<!-- -->` (246/246, 30/30 loads). A regeneration drops them. The 8-character difference fits a regeneration but is marked "not proven". All of this agrees with both reports. The three `expect`s below it are unchanged.
- **`tests/e2e/support/stock-takes.ts:127`–`:136`.** The correction is right: `load` fires only after the parser has finished the document. It correctly says the `networkidle` wait could not have prevented a regeneration and only orders the read after it. `waitForLoadState("networkidle")` and the `waitFor` are unchanged.

---

## Checkpoints (applied to a set of repairs, not to a feature)
- **C1: process.**
  - C1.1: n/a (harness and cross-cutting repairs, briefed by the leader, with no feature status change). Scope is respected: nothing under `src/server/**`, `prisma/**`, `package.json` or `Samples/` changed. The `feature_list.json` hunk for AC-24 is the spec sync; the rest belongs to #11.
  - C1.2, C1.3: n/a.
  - C1.4 [x]: AC-24 text is identical in spec and list.
  - C1.5 [x]: both impl reports exist and list their files. I verified the file lists against `git status`/`git diff`.
- **C2: verification.**
  - C2.1 [ ]: `init` **not run**. Forbidden by the coordinator while e2e runs; it must be run in the next gate with the DB checks not skipped.
  - C2.2 [x] typecheck. C2.3 [x] lint (see the lint note). C2.4 n/a (no service functions).
  - C2.5 [x]: real values (markup strings, attempt counts, row states).
  - C2.6 [x]: the probe tests run the real CLI and real temp files. The preload stubs only the `db execute` child, and only in the three plan-driven tests.
- **C3: architecture.** C3.1 [x]: `HydrationGate.tsx` imports only `react`. C3.2–C3.5 n/a.
- **C4: domain integrity.** C4.2 [x] (A4). C4.8 [x]: `Samples/` untouched. The rest n/a.
- **C5: conventions.**
  - C5.1 [x]: `PascalCase.tsx`, `"use client"` justified (`use`), and the unit test sits beside its source.
  - C5.3 [x]: no `console.log`. C5.4 [x]: no TODO. C5.5 [x]: the probe prints the host only.
- **C6: session hygiene.**
  - C6.1 [x] per the report.
  - C6.2 [x]: my mutants and copies are in the scratchpad only, and the tree is restored and hash-verified.
  - C6.3: n/a.

## Required changes
None.

## Recommendations and observations (non-blocking)
- **R-1 (proportionality).** Cut the #418 batches from 6 to 3 (84 loads) and add a static unit test pinning `<HydrationGate>{children}</HydrationGate>` as `<body>`'s only child in `src/app/layout.tsx`.
  - Today the gate's *removal from the layout*, the most likely regression, is caught only by the ~3-minute e2e. A source-level contract test catches it deterministically for nothing.
  - If adopted, re-prove red at the new shape. That is the only e2e run I would ask for: build with `git show HEAD:src/app/layout.tsx`, run `npx playwright test tests/e2e/stock-entry-approve.spec.ts --project=chromium-stock-entry --no-deps -g "#418"`, expect it red, then restore the layout and rebuild.
- **O-2.** Add one sentence to `HydrationGate.tsx:31`–`:32`. The "no visible cost" holds because protected pages have no Suspense boundaries. If a page ever streams slow content behind one, the gate holds its shell un-hydrated until the stream ends.
- **O-3.** Note in the gate's comment that the gate covers model rows. A row blocked on a client module (a client reference passed as a prop value under a host element, for example a future nested layout with its own `error.tsx`) could still be pending after `DOMContentLoaded`. Nothing in today's tree does this.
- **O-4.** The HTML spec's "abort a parser" (Stop, `window.stop()`) sets `readyState` to `complete` without firing `DOMContentLoaded`. Next's own code (`app-index.js:93`–`:99`) handles a stopped stream after `DOMContentLoaded`, which suggests Chromium fires it anyway.
  - The worst case is a page left as its server HTML, which is JS-off behaviour: progressive forms still work, and a reload recovers.
  - Resolving on `readystatechange` (as soon as `readyState !== "loading"`) would cover both paths. Optional.
- **O-5.** Wording at `scripts/db-probe.mjs:44`–`:47` and in `docs/verification.md` §5: CLI start-up falls inside each 10 s bound, and only the probe's own start-up is outside it.
- **O-6.** A third description of the probe is still stale, and it predates this change: `tests/e2e/support/database.ts:11` says the probe is "a TCP connection, no query". It has opened a session since 2026-09-17.
- **O-7.** `progress/impl_action_capture.md` still contains `HARNESS_RESULTS_PLACEHOLDER`, `CENSUS_AFTER_PLACEHOLDER` and `TOKENS_PLACEHOLDER`. The coordinator's note should point to the later evidence in `impl_hydration_418.md` (C above), so the record closes.
- **O-8.** For the leader, already reported by the implementer, pre-existing, and outside this scope: a staff-session approve POST is refused with a 307. The browser re-POSTs to `/stock-entry?denied=count-summary`, which returns a 500 (`Failed to find Server Action`). There is no data effect, but it is a 500 on a user-facing path and is worth a ticket.
- **O-9.** The #418 batches ran 26–33 s against the 45 s test budget, a margin of about 12 s under a busy gate. Worth watching. They also don't close their contexts on failure, but worker teardown covers that, and it is the same pattern as elsewhere in the file.

## Cost
About 145k tokens of this session's budget, by the harness counter (~15.00M → ~14.855M remaining). The split between input and output is not visible to me. Most of it was reading the React bundle and the reports. The tool runs were 5 mutation runs, 2 full unit/lint passes and 1 typecheck.
