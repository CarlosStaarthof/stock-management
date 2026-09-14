# Review — feature 10 `stock_takes_history`

**Verdict:** CHANGES_REQUESTED
**Spec:** `specs/features/010-stock_takes_history.md` (22 criteria + 3 post-approval amendments)
**init:** green — coordinator's full run, database checks **executed** (not re-run here, per brief)
**Blocking findings:** 3

This is a strong implementation. Every substantive guarantee the feature exists for — the
money-free walk for an `ADMIN`, the byte-identical body, the one-calendar equality, the
read-only-ness — I attacked with my own mutations and each held at the assertion its
criterion names. The three blocking items below are all **verification gaps and one false
claim in the amended spec**, not defects in shipped behaviour. Two of the three are the
coordinator's to close, not the implementer's.

---

## What I verified myself, rather than reading

All mutations were byte-copied first and restored against `sha256sum`. Hashes at the end.

### The three amendments, judged adversarially

**Amendment 1 — AC-19, the badge excluded from 44 × 44. Ruling SOUND; the justification
attached to it is NOT.**

The conflict is real. The badge is rendered by `src/components/stock-entry/CalendarGrid.tsx:136-145`,
one element shared by both calendars. AC-4 pins `src/app/stock-entry/page.tsx` byte-identical
**and** pins `CalendarGrid` at *exactly two* optional props — and that second half is a shipped,
executing assertion (`tests/unit/stock-takes-contract.test.ts:334`, `expect(optional).toHaveLength(2)`).
There is therefore no route by which #10 could have made the badge 44 px tall without either
editing #7's rendering or adding a third prop and turning a shipped assertion red. AC-4 wins.
The ruling stands.

**But the amendment's central claim is false, and I proved it by mutation.** The amendment says:

> its height asserted **below 44** … *A later change to the badge in either direction turns
> that red.* … the number is now recorded in a place that fails when it moves.

I shrank the shared badge from 29 px to 8 px tall (`h-2 overflow-hidden`, `py-0.5` dropped) in
`CalendarGrid.tsx`, rebuilt, and ran the replacement assertion:

```
ok 3  AC-4, AC-19: the badge is the SAME box on both calendars, and is not a 44 px target (2.8s)
```

It passed. It cannot do otherwise: `tests/e2e/stock-takes-calendar.spec.ts:635` is
`expect(takes?.height ?? 0).toBeLessThan(44)`, which no reduction can falsify; line 625 bounds
**width** only; and the `takes.height === entry.height` equality at line 623 is blind to a change
in a component both pages render. The assertion catches exactly three things — the badge growing
past 43 px tall, the badge narrowing below 40 px, and the two calendars diverging. It does not
catch the badge shrinking, which is the direction an accidental style change most often goes.

See blocking finding **B3**.

**Amendment 2 — AC-20, 18 pages not 19. CORRECT, and independently confirmed.**

```
git ls-files --cached --others --exclude-standard src/app | grep 'page\.tsx$' | grep -v '^src/app/(public)/' | wc -l
  -> 18
git log --oneline -- src/app/stock-takes/page.tsx
  -> 3420561 feat(#3): identity, roles, and the first migration
```

The shipped assertion follows the **tree** (`tests/unit/stock-takes-contract.test.ts:470-476`),
and I confirmed it goes red for the right reason, naming the file:

| Mutation | Result |
|---|---|
| add `src/app/stock-takes/probe/page.tsx` **with** no declaration | RED — `expected [ …(19) ] to have a length of 18 but got 19` |
| remove `export const dynamic = "force-dynamic";` from an existing page (count stays 18) | RED — `src/app/stock-takes/page.tsx: expected '…' to contain 'export const dynamic = "force-dynamic…'` |

The second is the one that matters: the per-page loop fires independently of the count, so the
equality is a tripwire and not the whole assertion. Phase B was right to follow the tree.

**Amendment 3 — AC-2, the criterion named a request that cannot degrade. CORRECT. Reproduced
end to end by me, not read.**

I added `src/app/stock-takes/loading.tsx`, ran `npm run build`, and measured both requests
against the served build:

| Request | With `loading.tsx` |
|---|---|
| signed-out `GET /stock-takes` and `GET /stock-takes/counts/<id>` | **`307`, unchanged** — `AC-1: a signed-out GET …` passed |
| signed-in `GET /stock-takes?yard=banana` | **`200`** — `AC-6, AC-17: an unreadable ?yard is a 307 and no error` RED, `Expected: 307 / Received: 200` |
| `tests/unit/stock-entry-contract.test.ts` → `AC-3, 010 AC-2: no loading.tsx sits on the path…` | RED |

Removed, rebuilt, re-measured: all three green again. The coordinator's ruling is right and
Phase B's transcript is accurate. AC-1's request is the middleware's refusal and is the wrong
probe; the page's own `redirect()` is the one that degrades.

### The three things Phase B asked me to start with

**The `<!-- -->` finding — a FIX, not a mask, and I pinned it with the mutation that matters.**

The open question was whether AC-13 still goes red for a *genuine* role branch. So I built the
hard case: a role branch spelled so that **no source scan can see it** —

```tsx
const ELEVATED = ["AD", "MIN"].join("");
const elevated = String((user as unknown as Record<string, unknown>)["role"] ?? "") === ELEVATED;
…
{elevated ? <p data-testid="elevated-note">Administrator view</p> : null}
```

Result, in two parts:

1. `npx vitest run tests/unit/stock-takes-contract.test.ts tests/unit/stock-entry-contract.test.ts`
   → **56 passed.** Every scan missed it, including `AC-13: there is no role branch anywhere in
   the two trees this feature adds`. The scan alone protects nothing against a determined spelling.
2. `tests/e2e/stock-takes-count.spec.ts` → `AC-12, AC-13: for a draft, a submitted and an approved
   count, one body and no euro` → **RED**, `Expected: 32914 / Received: 32967` — the 53 characters
   of the injected paragraph, exactly.

Both `expect(body).not.toContain("<!-- -->")` assertions passed in that run and the equality
still fired, so the separator guard is not swallowing the interesting difference. It narrows the
comparison's instability without narrowing what it compares. That is a fix.

Worth naming for the record: **AC-13 rests entirely on the e2e byte-identity.** The source scan
is a convenience that catches the honest spelling; it caught my first, literal `"ADMIN"` branch
(`tests/unit/stock-takes-contract.test.ts` → `AC-13: there is no role branch anywhere in the two
trees this feature adds`, RED) and missed the second. Phase B says as much in M1 and is correct
to.

**M4 — the bounded exception to "TypeScript does not protect the money boundary". CONFIRMED, both
halves.**

| Step | Result |
|---|---|
| `totalValue: count.lineCount` added to `getCountHistory`'s field-by-field mapper | `npx tsc --noEmit` → `src/server/counts/count-history-service.ts(100,5): error TS2353: Object literal may only specify known properties, and 'totalValue' does not exist in type 'CountHistoryView'.` |
| `totalValue: number` then added to `CountHistoryView` (what a real change would do) | typecheck clean |
| `npm run test:db -- count-history-service.db.test.ts` | **RED** — `AC-12: no monetary key at any depth, for a staff actor AND for an admin`: `expected [ 'totalValue' ] to deeply equal []` (1 failed, 25 passed) |

The boundary of the claim is exactly where Phase B draws it: the compiler refuses the extra key
**only while the object literal has no spread**, because an object literal with a spread gets no
excess-property check. The type system is not the guard; the field-by-field rule is what lets the
type system be a guard at all, and once the type is widened, only the **key walk** is left — the
browser-level text scans look for `€`, `No price` and `unitPrice`, none of which `totalValue` is.

**AC-19's badge** — see Amendment 1 above and B3 below.

### AC-12 and AC-13 — the feature's reason to exist

Attacked and satisfied.

- `src/server/counts/count-history-service.db.test.ts:293` walks `getCountHistory` for a
  **staff** actor *and* an **`ADMIN`** actor with `moneyKeysIn(...)` and `assertNoMoneyKeys`,
  and is non-vacuous (`expect(deepKeys(forAdmin)).toContain("quantity")` — the walk really
  descended into `lines[]`).
- `:329` `AC-13: the SERVICE drops itemsWithoutPrice, not the page` is non-vacuous in the way
  that matters: it re-reads `getCount(admin, countId)` and asserts the key **was** there
  (`expect(moneyKeysIn(raw)).not.toEqual([])`) before asserting the mapper removed it. This is
  the one assertion that could most easily have passed against a shape that never carried the
  key, and it does not.
- `:571` and `:639` do the same for `findNeighbourCounts` and for the three scopes of
  `filterCalendarByYard(await listCalendarMonth(...))`, with deep equality between roles.
- The browser half covers a `DRAFT`, a `SUBMITTED` and an `APPROVED` count — and the submitted
  and approved ones go through `submitAs`/`approveAs`, so the price snapshot is really written.
  A test over three drafts would have proved nothing; this one does.

### AC-4's byte-identity — settled in one command

`git status --porcelain` lists neither `src/app/stock-entry/page.tsx` nor
`src/server/counts/count-service.ts`. Both are additionally pinned by shipped assertions at
`tests/unit/stock-takes-contract.test.ts:106` and `:318`, and by the stricter replacement at
`:534` (`expect(files).toEqual(["src/components/stock-entry/CalendarGrid.tsx"])`).

### The four amended shipped assertions — each forced, each stronger

| Assertion | Forced by | Verdict |
|---|---|---|
| `tests/unit/stock-entry-contract.test.ts:82` — the hand-listed five `loading.tsx` directories | AC-2 | **Stronger.** Derives 23 directories from the tree, still names all five explicitly plus the two new ones, and carries both floors (≥10, ≥14) the criterion states. Verified red with `loading.tsx` present. |
| `:602` + `:633` — the reserved-year census | AC-21 | **Stronger.** Selects on `read(spec).includes("RESERVED_YEAR")` rather than on a filename prefix, keeps the equality at twelve/twelve rather than loosening to `toBeGreaterThan`, and adds a non-vacuity check naming the two new specs. The prefix form could not have seen `stock-takes-*` at all. |
| `:602` — the two `playwright.config.ts` route patterns | AC-21 | **Stronger.** Pins the widened patterns and *additionally* requires every year-reserving spec to be matched by one of them — a check the old form did not make. |
| `tests/unit/stock-takes-contract.test.ts:513` — `src/components/stock-entry` byte-identical | AC-4 | **Stronger.** An equality on a list of exactly one changed file, over nine paths, is tighter than an emptiness check over a directory. |

No shipped assertion was weakened. `git diff -- playwright.config.ts` is 4 changed lines, all
route patterns, and that is itself asserted (`tests/unit/stock-takes-contract.test.ts:539`).

### Restores and tree hygiene — verified independently

```
2801fc634081cf872962ac027975692129f6d8c216948f767f916a4984ee88c7  src/app/stock-takes/counts/[id]/page.tsx
d889b37a64f50b7cef3730799974dab144aefbd4d17c96286af6253cb2f3fc14  src/components/stock-entry/CalendarGrid.tsx
27cfd5f287662802d23a7fed13a96d6d07a1a68a6331e17e8aa62ada8f5add9b  src/server/counts/count-history-service.ts
e19d220b70e1f4d060f4184b60cf3132a71c9dd69f6aa5c1f6dd5fc453ebc71b  src/app/stock-takes/page.tsx
```

Identical before and after every mutation I ran. Two of these (`count-history-service.ts`,
`stock-takes/page.tsx`) match the hashes Phase B recorded, which corroborates its restore claim;
the detail page differs from Phase B's recorded hash by the `countedBy` edit it says was made
after the mutations, and `git diff` bears that out.

- `find src/app -name "loading.ts*"` → only `src/app/(public)/loading.tsx`.
- `git status --porcelain -- Samples` → empty.
- `git status --porcelain` → 28 entries, all inside AC-22's permitted set, identical before and
  after my session. No probe file, no `.bak`, no mutation residue (`grep -rn "totalHeld\|totalValue\|admin-note" src tests` → none).
- Database left clean: after my e2e runs, `StockCount` rows with `periodYear >= 2090` → **0**,
  users matching `stock-takes-` → **0**. The specs really are self-cleaning at `retries: 0`.
- `src/types/stock-count.ts` back to Phase A's `+94`.

---

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | **PARTIAL** | `tests/e2e/stock-takes-calendar.spec.ts:100` proves the signed-out `307`, the `callbackUrl`, and that no page content travels with it; `:117` proves `200`, the `<h1>`, `signed-in-email`, the `<h2>` `month-heading` and `sign-out` for both roles. `src/lib/auth-config.ts` and `src/middleware.ts` unchanged (`git status`, and pinned at `tests/unit/stock-takes-contract.test.ts:513`). `role-access.spec.ts` / `sign-in.spec.ts` unmodified. **Untested clause:** "signing in from that page lands on the requested path" is not exercised for either `/stock-takes` URL — 003 AC-12 (`tests/e2e/sign-in.spec.ts:152`) proves the mechanism, but on `/analysis`. Non-blocking: shared, unchanged mechanism. |
| AC-2 | PASS | `tests/unit/stock-entry-contract.test.ts:82` derives 23 directories from the tree, contains all five it replaces plus `src/app/stock-takes` and `src/app/stock-takes/counts/[id]`, and carries both floors. Degradation reproduced by me — see above. |
| AC-3 | PASS | `count-history-service.db.test.ts:137,414` (null actor → `UnauthorizedError`, both functions), `:352` (no row or column changes); `tests/unit/stock-takes-contract.test.ts:53,72,196` (signatures, no write operation, `new Set(operations) === {findFirst}` non-vacuity, no `db.` outside the service); e2e `AC-3: reading the calendar writes nothing` / `AC-3: reading a count writes nothing`, plus both `afterAll`s comparing `realCountIds()` and `seededMasterCounts()`. |
| AC-4 | PASS | Byte-identity by `git status` and by two shipped assertions; `tests/unit/stock-takes-contract.test.ts:322` (exactly two optional props, defaults are #7's verbatim), `:344` (`buildMonthGrid` called from one module; the new tree holds no grid builder and no weekday literal); e2e `AC-4: the two calendars render the SAME badges for the same month` is an **array** equality over `(day cell, count id, location code, status)` in two different months. |
| AC-5 | PASS | `tests/e2e/stock-takes-calendar.spec.ts:167` — zero `start-count-day`, zero `<a>` in an empty cell, zero `yard-scope`/`previous-count`/`next-count` on `/stock-entry`, seven headings in order on both, and the two divergent badge `href`s in one test. |
| AC-6 | PASS | `:216` (three options, `Dublin (1) / Clonmel (1) / Both (2)`, exactly one `aria-current`), `:240` (Clonmel-only day under all three scopes; both yards on 30 April, Dublin first), `:257` (four unreadable `?yard` values → `307`, no error). Order is `Location.sortOrder` — `listCountableYards` at `src/server/counts/count-service.ts:213`. |
| AC-7 | PASS | `src/lib/stock-takes-view.test.ts` (12 assertions, no database, including the structured-clone non-mutation check and `scopeTallies` = `{DUBLIN:1, CLONMEL:2, BOTH:3}`); `tests/unit/stock-takes-contract.test.ts:366` proves the page calls `listCalendarMonth` exactly once with no yard argument, after stripping imports and comments so the count is of calls. |
| AC-8 | PASS | `count-history-service.db.test.ts:148,173,198,257,280`; e2e `:131,161,183,203,227`. The archived-item case is a real archive followed by an unchanged read. `listSheet` banned from both trees (`tests/unit/stock-takes-contract.test.ts:296`). The no-`input`/`select`/`textarea`/`button`/`form` absence check runs on three URLs including `show=all`. |
| AC-9 | PASS | The criterion's **exact** fixture is asserted at the service — `count-history-service.db.test.ts:234`, 82 lines / 47 held / 23 zero / 12 null → `held 47`, `hidden 35`, `uncountedLineCount 12`. The e2e derives its numbers from the count the fixture actually built (`tests/e2e/support/stock-takes.ts:31`), which is right and does not weaken anything, because the literal numbers live in the db test. `data-counted="zero"` / `"no"` distinguished at `stock-takes-count.spec.ts:296`; `?show=held` byte-equal to no `?show` at `:317`; the `307` keeping `yard` at `:326`. |
| AC-10 | PASS | `src/lib/money.test.ts` (five comparisons + exactness past `Number.MAX_SAFE_INTEGER`), `src/lib/held.test.ts` (the six cases, the partition invariant), `tests/unit/stock-takes-contract.test.ts:144,158,282` (the `Number(`/`parseFloat`/`toFixed`/`Math.round` scan over `held.ts`, the service and both new trees, with comments stripped first; and `src/lib/**` still zero files naming the price column). |
| AC-11 | PASS | Seven db tests at `count-history-service.db.test.ts:423-558`, including the shared-`countDate` pair reachable exactly once and neither being its own neighbour, and the `monthKey`-vs-`periodKey` distinction. Browser: `stock-takes-calendar.spec.ts:283` (April → January under `DUBLIN`, April → March under `BOTH`) and `:311` (`aria-disabled`, non-anchor, same `data-testid` and label); `stock-takes-count.spec.ts:331` (same-yard, the Clonmel count dated between two Dublin ones is *not* jumped to). |
| AC-12 | PASS | See above. Both roles, all three services, three statuses, four URLs, both text scan and key walk, non-vacuous on both sides. |
| AC-13 | PASS | Byte equality of `stock-takes-body` across sessions for all four URLs; the scan; the mapper test with its non-vacuity half. Verified red under a scan-evading role branch — see above. |
| AC-14 | PASS | `stock-takes-calendar.spec.ts:388` and `stock-takes-count.spec.ts:411` — query, header and cookie together, in both directions, asserted on the response. |
| AC-15 | PASS | `stock-takes-count.spec.ts:432` — one anchor, same `href` and text for both roles, no `/summary` substring anywhere in either rendered page, no anchor beneath `/stock-entry/counts/<id>/`, and 009 AC-1's `307`/`200` pair still holds. Source half at `tests/unit/stock-takes-contract.test.ts:441`. |
| AC-16 | PASS | `stock-takes-calendar.spec.ts:419` (every non-selector link carries `yard=CLONMEL`, checked by **kind** rather than by a count that would assert about the fixture; the three selector links; `/stock-takes` bare renders no `yard=` anywhere) and `stock-takes-count.spec.ts:479` (badge → `Show all items` → `Previous count` → `Back to the calendar`, with `show` riding the jump and dropped by the calendar link). |
| AC-17 | PASS | Twelve query combinations on the calendar plus three malformed ids on the detail, all asserted `200` with no Prisma/Postgres/stack string; `?show` and `?yard` refusals asserted as `307`s. "Throws only typed errors, never a bare `Error`" holds by construction — `count-history-service.ts` contains no `throw` statement at all, and the two propagated types (`NotFoundError`, `ValidationError`) are pinned at `:280` and `:558`. See observation O3. |
| AC-18 | PASS | `src/lib/stock-takes-messages.test.ts` asserts re-export **identity** (same object / same string), not spelling; `tests/unit/stock-takes-contract.test.ts:219` (import fence), `:449` (no `use client` in either tree); `javaScriptEnabled: false` navigation exercised for the scope links, month links, count jumps and the held toggle in both specs. |
| AC-19 | **FAIL** | Everything except two clauses is proven. Blocking: **(a)** the `ADMIN` repetition is never executed — `tests/e2e/stock-takes-calendar.spec.ts:541` and `tests/e2e/stock-takes-count.spec.ts:572` both call `newUser()`, whose default is `"YARD_STAFF"`; **(b)** the replacement badge assertion does not do what the amendment says it does. See B1 and B3. |
| AC-20 | PASS | 18 confirmed independently; the shipped check derives the set from the tree and its per-page loop fires on its own (mutation above). No module opens a connection at import time (`tests/unit/stock-takes-contract.test.ts:491`). The no-database `init` path was run by the coordinator. |
| AC-21 | **PARTIAL** | `playwright.config.ts` diff is exactly the two patterns (4 lines), everything AC-21 lists byte-identical and asserted at `tests/unit/stock-takes-contract.test.ts:539`; `RESERVED_YEAR` gains `takesCalendar: 2101` / `takesCount: 2102` and the 2100 note is corrected; the census is twelve/twelve and selects on behaviour; each spec deletes only its own year and both `afterAll`s prove it. Full gate green. **Not performed:** "Two consecutive full `npm run test:e2e` runs report `0 flaky` and `0 failed`." Phase B ran the *two new files* twice; the full suite ran once, in the coordinator's gate. See B2. |
| AC-22 | PASS | Schema, migrations, `TRUNCATED_TABLES` unchanged and asserted; `CalendarGrid.tsx` is the only changed file across nine pinned paths, asserted as a **list equality**; `git status --porcelain -- Samples` empty; the three permitted non-source edits are each exactly what AC-2/AC-4/AC-21 name. |

---

## Checkpoints

- C1.1 [x] Exactly one feature changed — every path in `git status` is inside AC-22's permitted set.
- C1.2 [x] Spec exists at `specs/features/010-stock_takes_history.md`.
- C1.3 [ ] **Not every criterion is satisfied** — AC-19 (B1, B3), AC-21 (B2).
- C1.4 [x] `feature_list.json` `acceptance[]` mirrors the amended spec — I diffed all three amended
  criteria (AC-2, AC-19, AC-20) and they match the spec body word for word.
- C1.5 [x] `progress/impl_stock_takes_history.md` exists and lists every file touched; I checked the
  list against `git status` and it is complete and accurate, including the `src/lib/money.ts` /
  `src/types/stock-count.ts` attribution to Phase A.
- C2.1 [x] `init` green with database checks **executed** (coordinator's run, not re-run here).
- C2.2 [x] `npm run typecheck` — zero errors (run by me on the restored tree).
- C2.3 [x] `npm run lint` — zero errors (coordinator's gate).
- C2.4 [x] Both new service functions have success **and** failure tests: `getCountHistory`
  (`:148` success, `:137` null actor, `:280` `NotFoundError`), `findNeighbourCounts`
  (`:423` success, `:414` null actor, `:558` `ValidationError`).
- C2.5 [x] Tests assert real values — `held 47 / hidden 35`, `21.6128`, `0.475`, `32914` characters,
  `Dublin (1) / Clonmel (1) / Both (2)`, `?month=2101-01&yard=DUBLIN`. Nothing asserts "did not throw".
- C2.6 [x] Real Postgres (`*.db.test.ts` via `run-db-tests.mjs` against the test branch) and a real
  served build for e2e. Nothing mocked.
- C3.1 [x] No component or route handler imports `PrismaClient` — asserted at
  `tests/unit/stock-takes-contract.test.ts:255,491` over both new trees, and true by inspection.
- C3.2 [x] Data access in `src/server/counts/count-history-service.ts`, one module for the history read.
- C3.3 [x] No Excel builder in this feature.
- C3.4 [x] No cycle: `count-history-service` → `count-service`, `period`, `price-selection`, `db`;
  nothing imports it back.
- C3.5 [x] No schema change, so no migration needed — asserted.
- C4.1 [x] No stored value; this feature stores nothing at all.
- C4.2 [x] No price, value or total in **any** response body — for *either* role, which is stronger
  than the checkpoint asks and is the point of the feature.
- C4.3 [x] No column touched.
- C4.4 [x] Lifecycle untouched; `count-lifecycle-service.ts` byte-identical.
- C4.5 [x] `unitPriceSnapshot` untouched.
- C4.6 [x] Nothing written, so immutability is not at risk; `AC-3: reading a count changes no row and
  no column of it` proves the read is inert.
- C4.7 [x] `21.6128` and `0.475` render character for character; `held.ts` decides on the decimal
  through `compareDecimals`, never a `number`.
- C4.8 [x] `git status --porcelain -- Samples` empty.
- C5.1 [x] Naming follows `docs/conventions.md` — `*-service.ts` / `*-input.ts` / `*-messages.ts`
  / `*-view.ts`, `*.db.test.ts` for database tests, `tests/e2e/stock-takes-*.spec.ts`.
- C5.2 [x] Typed domain errors only; `count-history-service.ts` has no `throw` of its own and
  propagates `NotFoundError` / `ValidationError`.
- C5.3 [x] No `console.log` in `src/` (only `src/lib/log.ts`, which exists for that rule).
- C5.4 [x] No `TODO` in any file this feature adds.
- C5.5 [x] No secret or connection string; `.env` still gitignored.
- C6.1 [x] `progress/current.md` records both phases as they happened, including the two defects
  found and the one criterion not met.
- C6.2 [x] No scratch file in the repository; I removed the `test-results/` directory my own runs
  produced (it is gitignored in any case) and left `git status` at the 28 entries I found.
- C6.3 [x] `feature_list.json` has `#10` at `in_progress`, which is correct — closing it is not the
  implementer's.
- C7.1 [x] Empty, loading and error states all exist and are tested: `no-counts-ever` +
  *Start a count*, `no-counts-in-month`, `no-items-held`, `count-missing`, and the deliberate
  absence of a `loading.tsx` with the reason recorded.
- C7.2 [x] Usable at 390 px and 320 px — measured, in three scopes and both views. (The two gaps
  are B1 and B3, both narrow.)
- C7.3 [x] No user-facing number is formatted by this feature; quantities cross as stored strings,
  which is the correct choice here.

---

## Required changes

1. **`tests/e2e/stock-takes-calendar.spec.ts:541` and `tests/e2e/stock-takes-count.spec.ts:572`
   — B1, blocking, implementer.** AC-19 says "At a 390 × 844 viewport, signed in as `YARD_STAFF`
   **and again as `ADMIN`**, and again at 320 px". Both tests call `newUser()`, which defaults to
   `"YARD_STAFF"`, so no measurement is ever taken in an administrator's session. Loop each test
   over `["YARD_STAFF", "ADMIN"]` the way the AC-12/AC-13 tests already do.

   This is not purely formal. On `/stock-takes/counts/<id>` the whole page is inside
   `stock-takes-body`, so AC-13's byte equality makes the admin measurement redundant — but on
   `/stock-takes` the identity header is **outside** the compared element, and
   `src/app/stock-takes/page.tsx:157` renders `{user.email}` in a `<p className="text-sm
   text-slate-600">` with no `break-words` or `break-all`. An email is one unbreakable token; at
   320 px a long one is precisely the thing that makes `scrollWidth` exceed `clientWidth`, and it
   is the *only* part of either page whose content varies per session. Nothing in the suite
   measures it for the second role today. (In the current fixture both roles' emails are the same
   length — `createTestUser` at `tests/e2e/support/users.ts:32` builds them identically — so I
   expect the added repetition to pass; that is an argument for it being cheap, not for it being
   unnecessary.)

2. **`specs/features/010-stock_takes_history.md:475-480` (and the mirror in `feature_list.json`)
   — B3, blocking, coordinator.** The AC-19 amendment states that the replacement assertion means
   "A later change to the badge in either direction turns that red" and that "the number is now
   recorded in a place that fails when it moves". Both claims are false. I shrank the shared badge
   to 8 px tall and `tests/e2e/stock-takes-calendar.spec.ts:600` passed. `toBeLessThan(44)` at
   line 635 cannot fail on a reduction; line 625 bounds width only; and the cross-page equality at
   line 623 is blind to a change in the one component both pages render.

   Two ways to close it, and they are not equivalent:
   - **Correct the amendment's text** to say what is actually pinned — "the badge may not grow
     past 43 px tall, may not narrow below 40 px, and may not differ between the two calendars" —
     which is honest and costs nothing; or
   - **Add the lower bound the text promises** — `expect(takes?.height ?? 0).toBeGreaterThanOrEqual(24)`
     beside line 635 — which makes the text true.

   I recommend the second, then the first. An approved spec that overstates what a test protects is
   the same species of defect the spec's own *There is no AC-33 here* section was written to prevent:
   a claim nothing recomputes, read later as a completed guarantee. The coordinator asked to be told
   if a ruling let the implementation off the hook — the *ruling* did not, but its justification does.

3. **AC-21's stability clause — B2, blocking, coordinator (verification, not code).** AC-21 requires
   "Two consecutive full `npm run test:e2e` runs report `0 flaky` and `0 failed`". What was done:
   Phase B ran the two new spec files twice (34 passed, 0 flaky each time) and the gate ran the full
   suite **once** (167 passed). The clause exists because #10 adds 34 tests to a `retries: 0` suite
   and because this session found *two* cross-file order dependencies — the `<!-- -->` race and the
   "no previous neighbour" assertion that depended on `stock-takes-calendar.spec.ts`'s reserved year.
   Both were fixed, and the second is exactly the class of defect that only a second full run in a
   different worker ordering exposes. Run `npm run test:e2e` twice consecutively and record both
   lines, or strike the clause with a reason.

---

## Observations (non-blocking)

- **O1 — `src/app/stock-takes/page.tsx:253`.** AC-13 says "Everything on each page except the
  identity header sits inside `data-testid="stock-takes-body"`". `<SignOutForm>` is a third sibling
  of `<header>` (line 154-161) and the body `<div>` (line 163), so it is in neither. It takes no role
  input and renders identically for both sessions, so nothing is wrong today — but it is the second
  element outside the byte-compared region, and it is the reason B1's gap exists at all. Either move
  it inside `<header>` or widen the criterion's wording in a later feature; do not widen the
  assertion.
- **O2 — AC-1's "signing in from that page lands on the requested path"** is proven for the
  mechanism (`tests/e2e/sign-in.spec.ts:152`, 003 AC-12, on `/analysis`) but not for either
  `/stock-takes` URL. AC-1 itself requires that spec to pass unmodified and it does, so the
  mechanism is under test; only this feature's two paths are not walked through it. One extra
  `await page.getByTestId("sign-in-submit").click()` in the existing AC-1 test would close it.
- **O3 — AC-17's "never a bare `Error`" has no scan.** It is true today by construction —
  `src/server/counts/count-history-service.ts` contains no `throw` statement — and the two
  propagated types are pinned behaviourally. But nothing would catch a `throw new Error(...)` added
  to that file later. Other features in this repo assert this by source scan; consider carrying that
  forward.
- **O4 — two yard-code spellings.** `src/app/stock-takes/page.tsx:118` comments that "no yard is
  spelled in this feature's source". The *names* are data, which is what the comment means, but the
  *codes* are spelled twice: `SCOPE_OF_CODE` at `src/lib/stock-takes-view.ts:27` and `yardCodesIn`
  at `src/server/counts/count-history-service.ts:110`. Both are load-bearing and neither is wrong;
  the comment slightly overstates.
- **O5 — M3's single thread, confirmed.** Phase B recorded that exactly one assertion catches
  held-only being dropped. I agree with the recording and with the choice not to add a redundant
  one; the count is derived from the fixture, which is right. Worth carrying into #11 if the held
  default is reused.
- **O6 — `expect(guarded.size).toBeGreaterThanOrEqual(10)` at `tests/unit/stock-entry-contract.test.ts:110`
  is subsumed by the `>= 14` on the next line.** Harmless, and it does mirror both numbers AC-2
  names, so I would leave it.
- **O7 — Credit where it is due.** Three defects in this session were found by the implementation's
  own tests and reported rather than worked around: the `<!-- -->` race, the cross-file reserved-year
  dependency, and four scans tripped by the implementer's own doc comments. In every case the source
  moved and no assertion was loosened. That is the behaviour this process exists to produce.

---

# Second pass — 2026-09-14

**Verdict:** APPROVED
**Blocking findings:** 0
**Spec:** `specs/features/010-stock_takes_history.md` (22 criteria + 6 amendments)
**init:** not re-run here, per the brief — the coordinator's gate ran full and green with the
database checks executed, followed by two consecutive full `npm run test:e2e` runs at 167
passed each, zero `flaky`, zero `failed`. **I did not verify those three transcripts myself**;
B2 is closed on the coordinator's word plus the two targeted runs below, which is the extent of
what this pass was scoped to.

This is a verification pass. Everything approved in the first pass above — the mutations on
AC-12/AC-13, AC-4's byte-identity, the four amended shipped assertions, the read-only walk —
was not re-examined, and nothing in the diff touches it. What follows is only the delta.

## What I ran, and it is two commands

One mutation and two targeted runs. The source file was copied to the scratchpad first and
restored from that copy afterwards; `sha256sum src/app/stock-takes/page.tsx` is
`ff4885130d559228cdda802ae91ebe418d7d1d98d88592e34c1a9aa7d3b0ae92` both before and after, and
`git status --porcelain` is byte-for-byte the list it was at the start of this session.

## B1 — closed, and the loop demonstrably runs twice

`tests/e2e/stock-takes-calendar.spec.ts:580` and `tests/e2e/stock-takes-count.spec.ts:574` are
both `for (const role of ["YARD_STAFF", "ADMIN"] as const)`. I read each loop to its closing
brace (calendar 580-649, count 574-634): no `break`, no `continue`, no early `return`, and each
iteration ends at `await context.close()` inside the body.

**The probe is gone and I do not take its word for anything** — the evidence that the second
iteration executes is the restored-tree run below, in which both tests pass. A test that reaches
its own end has been through the loop twice, because there is no path out of it. (Contrast the
mutated run, which aborted at `YARD_STAFF 390 DUBLIN` — the *first* iteration — and therefore
proves nothing about the second. Only the green run does.)

Worth recording: the ADMIN pass deliberately keeps an ordinary hyphenated email
(`stock-takes-calendar.spec.ts:584-587`), which makes it the plain-email control B1 asked for
rather than a second copy of the pressured measurement. That is a better answer than the one I
asked for.

## B3 — closed

`tests/e2e/stock-takes-calendar.spec.ts:699`:
`expect(takes?.height ?? 0).toBeGreaterThanOrEqual(24)`, beside the `toBeLessThan(44)` at :688,
with the reasoning and my own 29 to 8 transcript in the comment at :690-698.

I did **not** re-run the 29 to 8 mutation. The reason is not economy: the floor reads the same
`takes?.height` expression whose liveness I established in the first pass by moving it, and its
failure mode is arithmetic rather than structural — there is no way for
`toBeGreaterThanOrEqual(24)` to survive a height of 8 once it executes, and the restored-tree run
shows it executing against the real badge. The bound is now two-sided in fact, and the
amendment's text has been rewritten to claim only that.

## Finding 4 — the shipping bug. Attacked the way I attacked the badge, and it holds.

The question the brief put to me was the right one: *does the long-email test fail if
`break-words` is removed?* It does.

Mutation: `text-sm break-words text-slate-600` to `text-sm text-slate-600` at
`src/app/stock-takes/page.tsx:158`, nothing else touched, then
`npm run test:e2e -- tests/e2e/stock-takes-calendar.spec.ts -g "AC-19"`:

```
1) stock-takes-calendar.spec.ts:564:5 > AC-19: the calendar never scrolls sideways ...
    Error: YARD_STAFF 390 DUBLIN
    expect(received).toBeLessThanOrEqual(expected)
    Expected: <= 390
    Received:    424
  1 failed
  57 passed (2.6m)
```

at `tests/e2e/stock-takes-calendar.spec.ts:607`. That is the fifth amendment's number exactly —
**424 against a 390 px viewport, 34 px of sideways scroll** — at the wider of the two viewports,
in the very first measurement the test takes. The fix is load-bearing, the test is pressured,
and the claim is not decoration.

Restored, and on the restored tree
`npm run test:e2e -- tests/e2e/stock-takes-calendar.spec.ts tests/e2e/stock-takes-count.spec.ts -g "AC-19"`:

```
[57/59] stock-takes-calendar.spec.ts:564  AC-19: the calendar never scrolls sideways ...
[58/59] stock-takes-count.spec.ts:562     AC-19: the record never scrolls sideways ...
[59/59] stock-takes-calendar.spec.ts:653  AC-4, AC-19: the badge is the SAME box ...
  59 passed (2.4m)
```

The lever is the email's content, as the amendment says: the label at
`stock-takes-calendar.spec.ts:123` is 61 characters, hyphen-free and dot-free (measured, not
eyeballed), and the guard at :578, `/^[a-z0-9]{56,}$/`, accepts it. Shorten or hyphenate that
label and the guard reddens before the measurement can go quietly unpressured — which is the one
thing that would have made this test green for the wrong reason.

## Amendments 4, 5 and 6 — judged adversarially

**Fourth (the one-sided badge bound). Sound, and it does not flatter itself.** It states the
original claim was false, quotes it, and names the reduction it could not catch. The shipped
assertion now matches the amended text rather than the other way round.

**Fifth (the email that actually overflows). Every checkable claim is true, and none is
overstated.** Three I checked rather than read:

- `src/app/stock-entry/page.tsx:83` does carry the identical unprotected header
  (`<p data-testid="signed-in-email" className="text-sm text-slate-600">`), and
  `git diff --stat` on that path is empty — the debt is real, it is recorded against 008 AC-30,
  and AC-22 holds.
- `/stock-takes/counts/<id>` renders no identity header at all: `grep -rn signed-in-email src/app`
  returns exactly `analysis/page.tsx:21`, `stock-entry/page.tsx:83`, `stock-takes/page.tsx:158`.
  Confining the fix to one file is therefore the correct scope, not a shortcut.
- the 390 px overflow it reports is the one I reproduced above.

It also does not claim more than it landed: **no test asserts that the header wraps**, and the
amendment does not pretend one does — what is asserted is the document measurement, which is the
guarantee that matters and the one I just falsified.

**Sixth (the 40-character floor). Correct, and if anything harder on its author than the facts
require.** AC-19 (spec line 370) now reads "at least **56** characters"; the shipped guard is
`{56,}`; the two agree. The arithmetic corroborates independently: my mutation overflowed by
34 px at 61 characters, and 34 / 6.6 px per character is about 5.2 characters, putting
break-even at about 56. The amendment understates nothing.

AC-19's text and the tests now say the same thing on every number I checked: 56 characters,
44 x 44 on the named controls, badge height below 44 and at least 24, badge width at least 40,
day cells at least 40, both viewports, both roles, three scopes, both views.

## Tree

- `git status --porcelain` — identical to the list at the start of this session; my run added
  nothing (`test-results/` and `playwright-report/` are ignored at `.gitignore:20-21`)
- no `.bak`, no `.orig`, no probe among the untracked files
- `find src/app -name loading.tsx` gives `src/app/(public)/loading.tsx`, and nothing else
- `git diff --stat -- src/app/stock-entry/page.tsx` is empty. AC-22 holds; the counting screen
  still carries the same header bug, deliberately, with a numbered debt against it
- `git status --porcelain -- Samples` is empty

## Acceptance criteria — delta only

| AC | First pass | Now | Evidence |
|----|-----------|-----|----------|
| AC-19 | FAIL (B1, B3) | **PASS** | Role loop at `stock-takes-calendar.spec.ts:580` and `stock-takes-count.spec.ts:574`, no early exit, both green on the restored tree. Two-sided badge bound at `stock-takes-calendar.spec.ts:688` and `:699`. The header measurement falsified by removing `break-words` — 424 v 390 at `stock-takes-calendar.spec.ts:607` — and green with it. |

All other criteria stand as recorded in the first pass; nothing in the diff touches them.

## Checkpoints

Unchanged from the first pass except the one that hung on AC-19, which is now `[x]`: the phone
measurements are taken in both sessions, the badge is bounded in both directions, and the
identity header no longer widens the document.

## Required changes

None.

## Observations (non-blocking)

1. `tests/e2e/stock-takes-calendar.spec.ts:117-121` is now stale on the one number that matters
   to it: "AC-19's floor is 40 characters ... The guard below is set at that measured floor rather
   than at the criterion's 40." The criterion's floor is **56** since the sixth amendment
   (spec line 370). The constant and the guard are both right; only the sentence beside them
   misquotes the contract it cites. One line — and it is exactly the species of sentence this
   feature has now been bitten by twice.
2. AC-19 says "at least one of the sessions signs in with an email whose local part is a single
   unbreakable run of at least 56 characters" inside a criterion that spans **both** pages, yet
   only `stock-takes-calendar.spec.ts` does it. That is correct — the count page renders no
   email — but the criterion does not say so, so `stock-takes-count.spec.ts` reads as
   non-compliant on a literal reading. The test comment at `stock-takes-count.spec.ts:569-572`
   explains it; the criterion could, in one clause.
3. The badge floor at 24 leaves 5 px of margin under a 29 px badge. That is the coordinator's
   number to choose and it sits beside its arithmetic; noted only so a future reader knows the
   margin is deliberate rather than measured.

## On the brief's five claims

None is overstated. Claim 4 is the one I tried hardest to break and it is the strongest of them:
the fix is falsifiable, the falsification produces the exact number the amendment records, and
the test that carries it guards its own lever.
