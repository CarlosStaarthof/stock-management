# Implementation: e2e phase cascade (harness) and the fragile #6 reorder tests

**Brief:** `scratchpad/impl-cascade.md`, and Part 2 of the approved plan
(`~/.claude/plans/i-want-to-develop-greedy-twilight.md`)
**Status:** complete. Both repairs are proven red and green. `init` was not run: the coordinator runs the gate.
**Suggested commits (plan, "Then" 5):** Repair 1 as `fix(harness)`, Repair 2 as `fix(#6)`.

## Files changed (nothing else touched)

| File | sha256 before | sha256 after |
|---|---|---|
| `scripts/run-e2e.mjs` | `2d6c2b9ddac160187d23d8fa204bce9d73914735dbb20b9d815f9e3d2b5a27cf` | `37699f2700cc6e8f6ce776922a966687c9aebbf477f9bc19b55b8a6257ef83bc` |
| `tests/e2e/item-master-yards.spec.ts` | `72089cf627d4fa7256f146463b132240a44423ecd8f11cc9246eac8ee7d76958` | `51b1988f8c841bfc8ba319bd8d68e04386a48d00817737a3b1c092f00f409850` |
| `playwright.config.ts` (NOT edited; #11's uncommitted change is still in it) | `71f50c57f4f594fe3bd156642e2a76ed3d28c88e4376b85dd87c1eeb984cf1be` | `71f50c57f4f594fe3bd156642e2a76ed3d28c88e4376b85dd87c1eeb984cf1be` (same) |

Byte copies of both originals are in the scratchpad (`run-e2e.mjs.orig`, `item-master-yards.spec.ts.orig`).
Both edited files are still CRLF throughout, like the rest of the tree. No helper under `tests/e2e/support/` was
needed. I did not touch `src/`, `feature_list.json`, `progress/current.md`, the specs or any #11 file.

Targeted checks: `npx eslint tests/e2e/item-master-yards.spec.ts --max-warnings 0` clean; `npx tsc --noEmit`
exit 0; `node --check scripts/run-e2e.mjs` ok. The two unit files that pin `dependencies: ["chromium"]`
(`stock-entry-contract.test.ts`, `stock-takes-contract.test.ts`): 56/56 pass.

---

## Repair 1: one failure no longer hides the second project

### Change (`scripts/run-e2e.mjs` only)
- **No caller arguments (a full run):** after the build and the Chromium check, which are unchanged, the script
  runs Playwright twice, one after the other. First `test --project=chromium`, then
  `test --project=chromium-stock-entry --no-deps`. It prints `[e2e] phase N of 2: <name>` before each phase and a
  one-line verdict per phase at the end. It exits with the first non-zero status, or 0 if both passed.
- **With caller arguments** (a spec, `--project`, `-g`): one run with exactly those arguments, as before.
- The reasoning is a comment block in the header, in the file's existing voice. It covers 007 AC-30's reason for
  the dependency, the 2026-09-23 incident, why the order is kept and nothing is hidden, the cost (a second
  `next start`), and why `playwright.config.ts` stays untouched. A bare `npx playwright test` still orders
  through the dependency.

### init exit status
- `init.sh:154` runs `npm run "$s" --silent && ok ... || bad ...`. `init.ps1:176` runs `& npm run $s --silent`
  and then checks `$LASTEXITCODE`. Both read npm's exit code, and npm passes on the script's `process.exit`
  status.
- `--silent` is used by npm itself and never reaches the script. The proof below ran exactly
  `npm run test:e2e --silent`, took the two-phase path, and got **exit 1** in bash.
- I did not run PowerShell separately. The exit path is the same `process.exit` → npm → `$LASTEXITCODE`
  that the single-run script already used.

### Proof: a planted first-project failure (red phase 1, second phase still reported, non-zero exit)
Planted file `tests/e2e/planted-cascade-proof.spec.ts`. Its name does not start with `stock-entry-`,
`stock-takes-` or `analysis-`, and `--list` placed it in `[chromium]`. Its test was
`expect("planted").toBe("removed")`. Command: `npm run test:e2e --silent` (23:25:46 to 23:36:08 UTC). Excerpt,
with ANSI codes and `[WebServer]` lines removed:
```
[e2e] building the application; the suite runs against the build, not `next dev`.
[e2e] phase 1 of 2: chromium
Running 57 tests using 3 workers
  x  15 [chromium] › tests\e2e\planted-cascade-proof.spec.ts:4:5 › PLANTED: a deliberate failure in the first project (10ms)
  1) [chromium] › tests\e2e\planted-cascade-proof.spec.ts:4:5 › PLANTED: a deliberate failure in the first project
    Error: expect(received).toBe(expected) // Object.is equality
  1 failed
  56 passed (2.2m)
[e2e] phase 2 of 2: chromium-stock-entry
Running 136 tests using 3 workers
  ...
  ok 136 [chromium-stock-entry] › tests\e2e\stock-takes-count.spec.ts:691:5 › AC-19: the record never scrolls sideways at 390 px or 320 px, in either view (21.0s)
  136 passed (7.0m)
[e2e] phase 1 (chromium): FAILED, exit 1
[e2e] phase 2 (chromium-stock-entry): passed
npm run test:e2e --silent exit=1
```
- (a) The second project ran and reported all **136** tests, **25 of them #11's `analysis-*` specs**, all
  passing.
- (b) The command exited **1**.
- Without the planted test the totals are 56 + 136 = 192, which is the figure the plan's gate expects.

**Planted file removed and shown to be gone:**
- `ls tests/e2e/planted*` → `No such file or directory`.
- `git status --short --untracked-files=all | grep -i planted` → no match.
- `npx playwright test --list` → `Total: 192 tests in 22 files`, and `grep -c planted` → `0`.

---

## Repair 2: the fragile #6 reorder tests

### Step 1: reproduction before any change (gate conditions: the whole `chromium` project, dev branch)
- **Ten runs of the unchanged file.**
  - Run 1 went through `node scripts/run-e2e.mjs --project=chromium`, which builds first.
  - Runs 2 to 10 were `npx playwright test --project=chromium` against that same build.
  - Runs 5 to 10 used `--output` in the scratchpad, so their traces would survive. Runs 9 and 10 also used
    `--trace=on`. Recording is the same as the config's `retain-on-failure`; only the files are kept.
- **Band watcher:** alongside every run, a read-only watcher (`scratchpad/band-watch.mjs`) sampled every ~150 ms.
  It logged every change to item types above `sortOrder` 19 and to Clonmel links above 84.

| Run | Result | Project time |
|---|---|---|
| 1 | 56 passed | 1.9 m |
| **2** | **1 failed**: `item-master-yards.spec.ts:186` (the SHEET test), at its **third** move (line 220) | **2.6 m** (slowest) |
| 3 to 10 | 56 passed each | 1.7 to 2.2 m |

Run 2's failure:
```
Locator:  locator('[data-item-id="cmuepb1wy0005jztcu6rd4xje"]').getByTestId('sheet-sort-order')
Expected: "802"
Received: "801"
Timeout:  10000ms
  13 × locator resolved to <td class="px-2 py-2" data-testid="sheet-sort-order">801</td>
at expectRenderedOrder (item-master-yards.spec.ts:124) at item-master-yards.spec.ts:220
```

**The type test (`:347`) never failed in ten runs.** The 2026-09-23 failure (stuck at 9000 on *Move down*,
line 397) **did not reproduce**. I make no claim about which mechanism caused it.

**What the one failure that did reproduce shows (run 2, sheet test, third move):**
- **Mechanism 1 (foreign row): excluded for this failure.** No foreign row sat in the Clonmel band 801-805 at any
  sample in any of the ten runs.
  - The type pair's span 9000-9001 was also clean in all ten runs.
  - The only other row in the 9000s was this file's own *Fresh Type* at **9002**, in every run.
- **Mechanism 2 as the plan states it ("the click lost"): not what happened.** The third swap did reach the
  database. The watcher shows Row 1 → 801 and Row 0 → 802 at 22:55:55.12.
- **Mechanism 3 (slowness): consistent with everything observed, not proven.**
  - Run 2 was the slowest run: 2.6 m against 1.7 to 2.2 m, and the type test took 15.2 s against ~10 s.
  - The watcher timestamps for the three writes are 22:55:34.15, 22:55:41.01 and 22:55:55.12. Moves 2 and 3
    therefore took far longer than in a healthy run, where a click reaches its write in about 1 to 2 s.
  - From the test's 33.5 s duration, I estimate the third click at about 22:55:50-51. On that estimate the swap
    committed about 4 s after the click, and the screen still showed 801 about 6 s later, when the 10 s clock ran
    out. That is an estimate from the reporter's duration, not a measurement.
  - A client-side discard of that move's result (see below) would give the same picture. Without a trace of the
    failing run I cannot tell the two apart. Run 2 was before I started preserving traces: run 3 wiped
    `test-results/`.

**What a trace of a passing run shows (run 9, `--trace=on`):**
- In 4 of the 5 moves traced across the two tests, a second server request followed the action's POST. It was an
  RSC `GET …?done=moved&_rsc=…` (the redirect's own client navigation), issued 0.05 to 0.8 s after the POST
  answered.
- In the moves where it could be timed, the number changed on screen only after that GET completed. Excerpt from
  the sheet test:
  ```
  18.197 STEP  Click … Move down            (third move)
  18.275 NET   644ms ACTION  POST /item-master/yards/CLONMEL?done=moved -> 303
  18.314 STEP  1976ms Expect "toHaveText"
  19.689 NET   447ms RSC-NAV GET /item-master/yards/CLONMEL?done=moved&_rsc=… -> 200
  ```
- So the old 10 s `expect` clock had to cover **two** full server renders per move.
- The test clicked the next move about 0.1 s after the number appeared.
- The Next source (`node_modules/next/dist/client/components/redirect-boundary.js`,
  `router-reducer/reducers/server-action-reducer.js`) explains that second request. After an action redirects,
  the action's promise is rejected with a redirect error. `RedirectErrorBoundary` then unmounts its subtree and
  calls `router.push(redirect)`.
- `app-router-instance.js:131-140` shows a hazard for back-to-back clicks. A navigation dispatched while a server
  action is pending marks that action **discarded**, so its state is never applied, and queues a refresh instead.
  That is a real hazard for back-to-back clicks on one page. It is not shown to be what happened on 23 Sep or in
  run 2.

### Step 2: the fixture's promise, now checked
Two new helpers:
- **`expectTypePairAlone()`** reads all item types in `moveItemType`'s own order (`sortOrder` asc, then `code`
  asc). It asserts that:
  - no other type holds a `sortOrder` inside the pair's span;
  - both reserved types exist;
  - nothing sits between them in that order.
  Each failure message names the rows by `code`, `"name"` and `sortOrder`.
- **`expectSheetRowsAlone()`** checks the same for the three Clonmel rows. It reads through `moveItemInSheet`'s
  own filter (active link, active item) and order (`sortOrder`, then description `localeCompare`), and names
  strangers by description, item id and `sortOrder`.
- **When they run:** before the first move and after every move. The after-move check comes before the value
  assertions, so a stranger that crept in is named instead of surfacing as a wrong number.

**"The band" is the pair's own span (9000-9001 for worker 0), not the ten numbers `typeBand` spaces the workers
by.** The ten are not owned. In every one of the ten runs, this file's own *Fresh Type* landed at `band + 2`, and
another file's max+1 seed can too. A check over all ten would fail on the test's own row. Rows above the pair are
harmless: a move of the pair never reaches them. The `typeBand` doc comment now says this.

### Step 3: each move waits on its own completion signal
The new helper **`move(page, control)`** does four things:
1. If the page URL already carries a query (a previous outcome), it `goto`s the bare path first. A move therefore
   always starts from a page with no outcome on it, and with no router work from the previous move still in
   flight.
2. It clicks.
3. It runs `page.waitForURL(/[?&](done|error)=/)`. That waits for the moved outcome itself, and nothing else can
   set it on that page. It is a signal, not a clock, and no timeout is raised. Like every `waitForURL` already in
   the suite, it is bounded by the test's 45 s limit.
4. It asserts `searchParams.get("error")` is null (a refusal fails in the service's words) and that the
   `item-master-done` notice reads `MOVED`.

Both reorder tests now move through it:
- The first move on each page costs no extra load.
- Later moves cost one page load each: 1 extra in the type test, 2 in the sheet test.
- Nothing raises `timeout` or `expect.timeout`, and nothing adds retries.
- The claims are intact:
  - the swap assertions on both rows;
  - the multiset check (`ourSortOrders()` equals the seeded positions after the moves, and after the first move);
  - the type-pair `sort` equality and the "back to the original values" checks.

**Residual:** the rendered-number and notice assertions after `waitForURL` still use the 10 s `expect`. They now
cover one client step, the redirect's remount, which can be one RSC GET, instead of a POST **and** that GET.

### Step 4: the sheet test (`:186`, now `:306`) shares the assumption, so it gets the same treatment
- `moveItemInSheet` swaps with the neighbour among every active Clonmel row.
- The test assumed its three rows (801, 802, 805) were each other's only neighbours. It asserted that 805 moved
  up swaps with 802, and so on. A foreign active row at 803 or 804, or at one of those numbers sorting between,
  would break it.
- It is also the test that reproduced the failure, on its third same-page move.
- It now uses `expectSheetRowsAlone` before and after every move, and `move` for all three moves.
- `SHEET_POSITIONS = [801, 802, 805]` is now one constant, used by the seeding and the checks.

### One addition beyond the letter of the brief (flagged for the reviewer)
In `beforeAll`, the pair is now seeded **upper first (`band + 1`), then lower (`band`)**. The swap is two lines
plus a comment.
- **The race:** `item-master-items` (Beads) and `item-master-access` (Access Type) seed their types at "greatest
  plus one" in their own `beforeAll`, at the same moment this file does. The watcher saw them about 2 s before the
  band in run 1, and in that run two of them both landed on 20.
- **With lower first:** a seed that read the greatest between the two creates would land on `band + 1`, a foreign
  row in the band, which is exactly the 14 Sep signature.
- **With upper first:** the greatest is already `band + 1` before `band` is taken, so such a seed lands above.
- The check would catch this race anyway. The reorder only stops it from happening. Revert it if it is judged out
  of scope; the check stays valid without it.

### Step 5: proof in both directions

**Red:** a foreign row planted in each band. `scratchpad/plant.mjs plant` created item type
`PLANTED_FOREIGN_E2E-RED` at 9001, and an item `"Planted foreign row e2e-red"` assigned to Clonmel at 803.
Then `npx playwright test tests/e2e/item-master-yards.spec.ts -g "AC-23, AC-24|AC-26, AC-27"` ran, one worker, so
the band is 9000. Then `plant.mjs remove` → `{"removed":{"items":1,"itemTypes":1}}`.
```
1) item-master-yards.spec.ts:306:5 › AC-23, AC-24: the sheet shows sortOrder, and a move is a swap that keeps the gaps
   Error: another Clonmel row sits in this run's sheet band 801-805, so a move could swap with it
   + Array [
   +   "\"Planted foreign row e2e-red\" (item cmueq44ks0002jzroomsn32fc) at sortOrder 803",
   + ]
   at expectSheetRowsAlone (item-master-yards.spec.ts:234:5)  at item-master-yards.spec.ts:312:3
2) item-master-yards.spec.ts:471:5 › AC-26, AC-27: item types are created, reordered and refused readably, and never archived
   Error: another item type holds this run's reorder band 9000-9001, so a move could swap with it
   + Array [
   +   "PLANTED_FOREIGN_E2E-RED \"Planted foreign type e2e-red\" at sortOrder 9001",
   + ]
   at expectTypePairAlone (item-master-yards.spec.ts:194:5)  at item-master-yards.spec.ts:510:3
  2 failed
```
Both failed **before any move**, naming the planted row.

**Green: three consecutive runs of the `chromium` project**, spec sha256 `51b1988f…9850`, run straight after one
another:

| Run | Result | Sheet test (`:306`) | Type test (`:471`) |
|---|---|---|---|
| green 1 (23:18:43 to 23:20:54) | 56 passed, 2.1 m | 15.4 s | 11.4 s |
| green 2 (23:20:55 to 23:23:07) | 56 passed, 2.1 m | 15.5 s | 11.5 s |
| green 3 (23:23:07 to 23:25:17) | 56 passed, 2.1 m | 13.8 s | 12.4 s |

The cascade-proof run's phase 1 also passed all 56 real tests with this spec, so that is **four consecutive
passing project runs**.

---

## Development database (dev branch)
| | Before (22:49 UTC) | After (final, 23:37 UTC) |
|---|---|---|
| items | 140 | 140 |
| item types | 19 | 19 |
| suppliers | 10 | 10 |
| item types above `sortOrder` 19 | none (range 1-19) | none (range 1-19) |
| Clonmel links above 84 | none | none |
| e2e debris: items, types, suppliers | none | none |
| e2e debris: users | **2, pre-existing** | the same 2 |

**Pre-existing debris, reported and not deleted:**
- `stock-takes-count-owner-544ba0269fbb5b2f@macroads-e2e.invalid`
- `stock-takes-count-approver-7639e09cb882ba20@macroads-e2e.invalid`

They were there before my first run, from an earlier `stock-takes-count` run.

Everything I planted was removed. The planted type and item were checked by census straight after the red run. The
planted spec file is covered above. The watcher logged a handful of single-sample query errors. Those were Neon
blips on my read-only sampler, not test failures.

## What the plan got wrong, or left open
1. **"Band" is two numbers, not ten.** Checking the whole `typeBand` decade would fail on the test's own *Fresh
   Type* (observed at 9002 in 10 of 10 runs). The fixture comment claiming the worker "owns" the band is corrected.
2. **Mechanism 1 does not fit the 23 Sep signature on its own.**
   - The signature is *Move up* correct (lines 389-393 passed), then *Move down* stuck at 9000 (line 397).
   - A stranger present all along cannot produce it:
     - At 9000, it must sort before `LOWER_TYPE_…` for *Move up* to work, and after `UPPER_TYPE_…` for *Move down*
       to no-op. That is impossible, since `UPPER_` sorts after `LOWER_`.
     - At 9001, it would make *Move down* land on 9001 and fail at line 398, not 397.
   - So it needs a row arriving at 9000, sorting after `UPPER_TYPE_…`, **between** the two moves. No phase-1 spec
     writes item types except by max+1, so I rate mechanism 1 unlikely for 23 Sep. That is reasoning, not a
     reproduction.
3. **The failure that reproduced was in the sheet test, not the type test.** The plan treated `:186` as "only if it
   shares the assumption". It shares it, and it was the one that failed today.
4. **"The click lost" (mechanism 2)** is better stated as a client-side result that may never be applied: the
   action queue can discard a pending action when a navigation starts. In the one reproduction the write did reach
   the database.
5. **Where the Step 1 cost is recorded.** The plan says to record it in 007 AC-30's comment in
   `playwright.config.ts`. The brief forbids editing that file, so it is recorded in `run-e2e.mjs`'s header.

## Scratchpad artefacts (not in the repo)
- `census.mjs`, `band-watch.mjs`, `plant.mjs`, `timeline.mjs`: read-only census, watcher, planter/remover, and trace
  timeline tools.
- `repro1-10.log`, `watch-repro*.log`, `results-5..10/`: the reproduction runs.
- `red.log`, `results-red/`: the red proof.
- `green1-3.log`: the green proof.
- `cascade.log`: the Repair 1 proof.
