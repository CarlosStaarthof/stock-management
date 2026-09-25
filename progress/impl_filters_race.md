# Implementation: #8 e2e race repair, `stock-entry-filters.spec.ts` AC-23/24/25

**Brief:** `scratchpad/fix-filters-race.md` (the leader's). This is a repair to feature #8's test,
not a feature session, so `feature_list.json` was left alone.
**Status:** complete

## Files modified
- `tests/e2e/stock-entry-filters.spec.ts`: imports `ALL_CHANGES_SAVED` (line 5). After the *None
  held* tap it now waits for the save-state header to read it (line 345), with a comment saying why
  (lines 339-344). Nothing else changed. No assertion's expected text changed, no timeout was
  added (it uses the config's `expect.timeout`, 10 s), and there is no sleep and no retry.
- `progress/current.md`: one entry in the work log.

Nothing under `src/`. No other spec needed the fix (see *Audit*).

## The fix, and why that signal
```ts
await page.getByTestId("count-line").first().getByTestId("none-held").click();
await expect(page.getByTestId("counted-summary")).toHaveText(countedSummary(1, lineCount));
await expect(page.getByTestId("save-status")).toHaveText(ALL_CHANGES_SAVED);   // new
```
- **It is the product's own acknowledgement.** `status` in `CountSheet.tsx` reads
  `ALL_CHANGES_SAVED` only when nothing is sending and the queue is empty. The queue is emptied
  only in `flush()`'s `response.ok` branch, and only for the rows the server lists in `saved`.
  `markFailed` never empties it, so a failed save can never show the sentence.
- **It cannot read a header left over from before the tap.** The one click handler runs `edit()`
  (`putTyped` + `putQueue`) and the synchronous start of `flush()` (`setSending(true)`), so React
  commits them in a single render. The preceding assertion waits for *1 counted*, and that same
  render reads *Saving…*.
- Of the two signals the brief allowed, I chose the header over `waitForResponse`. It is what a
  counter sees, and it is the `settled()` signal `stock-entry-quantities` and `-autosave` already
  use, minus their 20 s timeout.

## Proof
Every proof variant was a scratchpad copy of the spec with injected code, copied over the spec for
one run with `-g "AC-23, AC-24, AC-25"`. After each batch, `fixed.spec.ts` was copied back over it.

### Finding: the brief's suggested 2 s hold does not make the unfixed test fail
**Variant A.** The unfixed test, with `page.route` holding every lines `POST` for 2 s and then
calling `route.continue()`: **1 passed**.
```
PROOF lines POST held at 2026-09-24T13:46:27.887Z
PROOF lines POST failed: net::ERR_ABORTED
PROOF navigation committed: ?...?type=A-S&unit=1 2026-09-24T13:46:28.822Z
  ok 1 ... AC-23, AC-24, AC-25: a filter can never let a counter believe they have finished (8.6s)
```
- **Why it passed.** The navigation aborted the held request before it reached the server. The
  edit was still in the `localStorage` queue, and the next page re-applied it (008 AC-15, the
  restore effect in `CountSheet.tsx`). So the sentence the client rendered read 81, and the
  save never reached the server during the test.
- **Why that is a different path from the flake.** The recorded failure needs two things at
  once. First, the server renders the next page **before** the save commits. Second, the old page
  has already **received the 200 and emptied its queue**, so there is nothing to restore.
  Holding the request cannot produce both.

### The deterministic red: forcing the measured interleaving
- **Variants B and D.** They are the unfixed and the fixed spec, with the same proof-only code.
  - The lines `POST` is held for 2 s. If a navigation starts inside those 2 s, it is held until
    the server has rendered that page instead.
  - The document request for `?type=` is fetched with `route.fetch()`, so the server renders it
    at that moment. The save is then let through, and the page is delivered only after the old
    page has acknowledged the save.
  - The old page's acknowledgement is observed through an init script that wraps
    `Storage.prototype.setItem` and logs when the queue key is written empty.
  - It is read through `console` because a locator waits for the pending navigation. My first
    attempt used a locator, and that failed both variants with `waiting for ... navigation to
    finish`, before the logic under test was reached.
- **B, unfixed: red, twice, with the identical received text.**
```
PROOF 13:50:41.304 lines POST held
PROOF 13:50:41.678 navigation requested ?type=A-S&unit=1
PROOF 13:50:42.425 page rendered by the server 200
PROOF 13:50:42.425 lines POST released to the server
PROOF 13:50:43.106 lines POST committed, server answered 200
PROOF 13:50:43.119 old page acknowledged the save (its queue is empty) - delivering the page
PROOF 13:50:43.137 navigation committed ?...?type=A-S&unit=1
  x  1 ... AC-23, AC-24, AC-25: a filter can never let a counter believe they have finished (19.1s)
    Locator:  getByTestId('filter-hiding')
    Expected: "Filters are hiding 82 items, 81 not counted."
    Received: "Filters are hiding 82 items, 82 not counted."
    13 × locator resolved to <span data-testid="filter-hiding" ...>Filters are hiding 82 items, 82 not counted.</span>
```
  The repeat run at 13:53 logged the same sequence, `Received: "Filters are hiding 82 items, 82
  not counted."`, and `1 failed`.
- **D, fixed, same injection: green, twice.** The navigation now starts only after the save is
  acknowledged:
```
PROOF 13:51:16.850 lines POST held
PROOF 13:51:18.856 lines POST released to the server
PROOF 13:51:19.753 lines POST committed, server answered 200
PROOF 13:51:20.171 navigation requested ?type=A-S&unit=1
PROOF 13:51:20.962 page rendered by the server 200
  ok 1 ... AC-23, AC-24, AC-25: a filter can never let a counter believe they have finished (10.9s)
```
  The repeat run at 13:54 gave the same order: committed 16.093, requested 16.641, `1 passed`.
- **C, fixed, under the brief's plain 2 s hold: green.** The `POST` was answered with 200 at
  13:46:54.091, and the navigation committed at 13:46:55.652, after it.

### No injection code remains
```
restored: 21c962b45c997b204504a0d1cacc1affd21a58eb221a11895b59048c45500fc4
fixed:    21c962b45c997b204504a0d1cacc1affd21a58eb221a11895b59048c45500fc4
page.route/PROOF lines in committed spec: 0
```
The sha256 of the original spec is `a324ca9a63e72377…`, and a byte copy is in `scratchpad/race/`.

## Verification output
With no delay: five consecutive runs of the whole file, `npx playwright test
tests/e2e/stock-entry-filters.spec.ts --project=chromium-stock-entry --no-deps`, 14:54-14:58.
```
=== clean run 1  14:54:20   exit 0   6 passed (52.0s)
=== clean run 2  14:55:17   exit 0   6 passed (52.6s)
=== clean run 3  14:56:15   exit 0   6 passed (48.0s)
=== clean run 4  14:57:08   exit 0   6 passed (49.6s)
=== clean run 5  14:58:03   exit 0   6 passed (47.6s)
  ok 5 [chromium-stock-entry] › tests\e2e\stock-entry-filters.spec.ts:303:5 › AC-23, AC-24, AC-25: ... (5.2s)   <- run 5
npx eslint tests/e2e/stock-entry-filters.spec.ts --max-warnings 0   exit 0
npm run typecheck (tsc --noEmit)                                    exit 0
```
- `init` and `test:db` were not run, per the brief.
- The `.next` build served was current: no file in `src/`, `prisma/`, `package.json` or
  `next.config.*` is newer than `.next/BUILD_ID`.
- No Neon connection errors occurred in any run.

**Dev database.** This file's `afterAll` asserts that `realCountIds()` and `seededMasterCounts()`
are the same as they were before the run. It clears reserved year 2096 and removes the users it
created. All 11 runs (6 proof runs, 5 clean runs) finished with no hook error in their logs, the
two red runs included. I did not take an independent row-count census.

## Audit: the same pattern in the other `stock-entry-*.spec.ts`
The pattern is a tap or keystroke that saves, followed by a navigation or a server read, with no
wait for the save in between. **No other instance was found, so no other file changed.**
- **`stock-entry-quantities`.** Every UI save is followed by `settled(page)` before its reload or
  `quantityOf` read: :173-175, :214-218, :226-229, :232-236, :296-309, :355-359, :487-491,
  :514-517, :521-527, :539-543.
  - The no-JS *Save now* submits (:444, :459) are themselves the navigation. The installed
    `playwright-core` (1.59.1, `server/frames.js`: `waitForSignalsCreatedBy` / `SignalBarrier`)
    makes `click()` wait until a navigation it triggered has committed. A POST navigation commits
    only once the server action has answered.
  - The `first.fill("5")` at :750 queues a save that nothing ever reads, so no assertion can race
    it.
- **`stock-entry-autosave`.** Every save is followed by `settled(page)` or by an assertion on the
  failed state before any `quantityOf` read or reload. The reload in AC-15 comes after saves that
  are deliberately aborted, plus a `changesNotSaved(3)` wait.
- **`stock-entry-approve`, `-submit`, `-start`, `-signature`.** Every saving click is followed by
  one of these before any database read:
  - `waitForURL` on the redirect: approve :372, submit :314, start :198/:352/:371/:463, signature
    :171.
  - A UI assertion on the result: approve :223/:325 (`count-status` *Approved*), approve :365 and
    submit :287 (a refusal, where nothing is saved).
  - A no-JS form navigation that `click()` waits for: approve :547/:560.
- **`-access`, `-calendar`, `-refusals`.** No saving action is followed by a server read without
  a wait. Quantities elsewhere are seeded through `fillQuantities` (a database helper, not the UI).

## Deviations from the brief
- **The red proof uses an ordered injection, not a plain 2 s hold.** The plain hold was tried
  first and left the unfixed test green (variant A, above), because it tests the offline-restore
  path rather than the race. The injection used still holds the lines `POST` through `page.route`
  (2 s, or until the next page is rendered). It adds a document route and a proof-only
  `setItem` wrapper so the interleaving from the 2026-09-24 trace happens every time.
- The fix is **tests only**: no support helper was needed for a single call site.

## Notes for the reviewer
- The sentence the test asserts is the guarantee, and it is unchanged: `filtersHiding(lineCount,
  lineCount - 1)`.
- The proof variants and their logs are in `scratchpad/race/`:
  - The specs: `A-unfixed-delay2s`, `B-unfixed-ordered`, `C-fixed-delay2s`, `D-fixed-ordered`.
  - The logs: the four matching `*.log` files, `background.log`, and `clean-1..5.log`.
  - They are outside the repository. Nothing in `test-results/` is tracked.
