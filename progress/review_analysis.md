# Review — feature 11 analysis

**Verdict:** CHANGES_REQUESTED
**Blocking findings:** 2 (B1, B2). Both need test changes only; no product-code defect was found.
**Spec:** specs/features/011-analysis.md (approved at `c9b980c`, 27 criteria)
**init:** green, per the coordinator's gate on this exact tree (unit 817, e2e 192/192, db 397, database checks executed). I did not re-run it, as the brief instructed.
**Reviewed tree:** `git status --porcelain` is byte-identical before and after this review, and so is the ignored set. All mutations are listed in the ledger at the end, and every restore was verified with sha256.

---

## Attack first: the `unitPrice` allow-list widening (AC-26)

### Is it forced? Yes.
- Analysis cannot value history without reading the snapshot. The one existing module that values a count's lines is `src/server/counts/count-summary-service.ts` (`getCountSummary`).
  - It imports `pricesInForceOn` from the lifecycle service and `isoDateOf` from `@/server/items/price-selection` (lines 6 and 11).
  - So routing through it would create the static path to the price list that AC-8 exists to forbid.
  - It would also mean about three queries for each of up to 26 counts, and it returns no type or supplier for the breakdown.
- A snapshot-only helper added to `src/server/counts/**` is ruled out by AC-25, which makes that tree byte-identical.
- Every other route would still name the column (raw SQL) or dodge the scan dishonestly (building the key from string pieces).
- So naming `unitPriceSnapshot` in the one reporting service is the least-bad option. The spec's own argument holds.

### Is it bounded? By file, yes. By name, no — see B2.
- **It is an exact list of files, not a directory.**
  - Probe M1: an untracked `src/server/reporting/zz-review-probe.ts` naming `unitPrice` sits in the same directory as the permitted file. It turned `project-contract.test.ts:181` ("exactly twelve") red: `expected [ …(13) ] to deeply equal [ …(12) ]`, naming the file.
  - Probe M2: an untracked `src/components/analysis/ZzReviewProbe.tsx` naming `unitPriceSnapshot` turned three assertions red at once:
    - `:181` (twelve modules);
    - `:234` (the three `src/app`/`src/components` files);
    - `:252` (the three snapshot readers).
  - Both probe files were deleted, and `git status` is unchanged.
- **The screens name it nowhere.** `grep unitPrice` over `src/app/analysis/**`, `src/components/analysis/**` and `src/types/analysis.ts` returns nothing. Every euro crosses on a field the shape declares: `yardValue`, `totalStock`, `againstTotal`, `varianceAmount`, `amount`.
- **The name is not bounded.** The permission the list grants is the token `/unitPrice/`, which is broader than the need (`unitPriceSnapshot`).
  - `unitPrice` is also the price list's own column (`prisma/schema.prisma:156`, `ItemPrice.unitPrice`).
  - The price list is reachable through `Item.prices` (`schema.prisma:139`), and AC-8's absence list does not name that relation.
  - Mutation M6 put a "helpful" price-list fallback into the service. All 40 tests of `analysis-contract`, `project-contract` and `analysis-service.test` stayed green, and `tsc --noEmit` exited 0. Details in B2.

---

## Blocking findings

### B1 — AC-6's page-level empty state is not tested by anything the gate runs. Nor are AC-16's and AC-20's halves of it.

**What the criteria require:**
- **AC-6:** "With no approved count anywhere in the database the page renders `No approved stock takes yet.`, a link *Go to Stock Takes* whose `href` is `/stock-takes`, and its entire HTML contains zero `€` characters."
- **AC-16:** "when there is none it opens on the month containing today in the yard and renders the empty state — asserted directly."
- **AC-20:** measures the empty state at 390 px and at 320 px.

**The only browser test is `tests/e2e/analysis-access.spec.ts:444-477`, and its asserting branch can never run.**
- The branch is gated on `approvedCountTally() === 0` (`:460`, `tests/e2e/support/analysis.ts:219`), which counts every `APPROVED` count in the database.
- The same file's `beforeAll` (`:66-119`) submits and approves three counts at `:101-103` before any test in the file runs.
- So `approved >= 3` is guaranteed, not merely likely, and the `if (approved === 0)` branch is dead code.
- The claim in `progress/impl_analysis.md` (Phase B, "What I could not verify") that "on a clean database it is the criterion in full" is therefore false.

**What is covered:**
- The shape half (`anyApprovedCountEver === false`, no `€` in the serialised shape) is proved at `src/server/reporting/analysis-service.db.test.ts:463` and `:481`.
- The literal is proved at `src/lib/analysis-messages.test.ts:87`.

**What is not covered:** the page's own branch at `src/app/analysis/page.tsx:231` / `:257-277`, and the default-to-today path at `page.tsx:149`. A `formatFigure("0")` added to the empty branch would pass the whole gate. That is the "top-level form of the mistake this whole feature is shaped around", according to the spec's own UI-states section.

**Required (implementer; or leader, for the option that changes the spec):**
1. Add a test that the gate executes, needs no database, and renders the page's empty branch. For example, a `*.test.ts` that:
   - calls `AnalysisPage({ searchParams: Promise.resolve({}) })` with `@/app/page-guards`, `@/server/reporting/analysis-service` and `@/app/auth-actions` mocked (`listApprovedPeriods` → `[]`; `getAnalysis` → an empty shape);
   - renders the result with `react-dom/server`;
   - asserts the literal, the `/stock-takes` href, the period heading equal to `formatMonthLabel(monthKeyOf(todayInYard()))`, and **zero `€`** in the whole output.

   It must be shown to go red when a `€0.00` is put into that branch. Extracting the empty branch into a component is fine if `next/link` cannot render outside the router. This closes AC-6 and AC-16's page halves.
2. Alternatively, the **leader** amends AC-6, AC-16 and AC-20 to record that a DB-global state cannot be reached in the shared-database e2e suite, and moves the page half to the test in (1). An amendment that only removes the assertion is not acceptable: it would leave the branch untested.
3. Either way, fix the false sentence in `impl_analysis.md` and the comment at `analysis-access.spec.ts:449-459`. AC-20's empty-state measurement should be recorded as unreachable rather than silently replaced by `?period=1999-01`.

### B2 — AC-8's "selects `unitPriceSnapshot` from `StockCountLine` and from nothing else" is not asserted, and the AC-26 widening makes the gap reachable

**The mutation (M6), since restored and hash-verified.** In `readValuedLines`:
- `src/server/reporting/analysis-service.ts:192` gained:
  ```ts
  prices: { select: { unitPrice: true }, orderBy: { createdAt: "desc" }, take: 1 },
  ```
- `:207` became:
  ```ts
  const snapshot = row.unitPriceSnapshot?.toString() ?? row.item.prices[0]?.unitPrice.toString() ?? null;
  ```

That means valuing unpriced held lines at today's price-list price. It is exactly the plausible "helpful" change that Invariant 2 and Invariant 4 forbid, and it rewrites history the way the workbook's column `E` does.

**Result:**
```
npx vitest run tests/unit/analysis-contract.test.ts tests/unit/project-contract.test.ts src/server/reporting/analysis-service.test.ts
 Test Files  3 passed (3)
      Tests  40 passed (40)
npx tsc --noEmit  -> exit 0
```

**Why every static guard passes:**
- AC-8's name scan (`analysis-contract.test.ts:107-118`) forbids `itemPrice`, `ItemPrice`, `selectCurrentPrice`, `priceAmountOf`, `effectiveFrom` and `todayIso`. The mutation names `prices` and `unitPrice`, which are neither.
- The model list at `:130-141` (`db\.\w+\.`) sees only top-level delegates, never a nested relation select.
- The `unitPrice` allow-list (`project-contract.test.ts:181`) already admits this file.

**What would catch it:** only the database assertion `analysis-service.db.test.ts:584` (operation 4, "a FIRST-EVER price for the item that had none", on the Clonmel quantity-7 line with a null snapshot). By reading, the Clonmel figure would move from `15.71775` to `582.71775` and the deep equality would fail. I did not spend the single `test:db` run on this: the brief requires a check with the coordinator first, and I have no channel to do that.
- The runtime half of AC-8 therefore stands.
- The absence half, which the spec calls "the strongest criterion in this spec" and says is asserted "by an absence, not by a comment", does not establish that there is no path to the price list.

**Required (implementer; test-only, both green on today's tree — I checked):**
1. In `tests/unit/analysis-contract.test.ts`, under AC-8, over all three trees:
   - `expect(read(file)).not.toMatch(/unitPrice(?!Snapshot)/)`. Today it matches nothing under those trees.
   - `expect(codeOf(read(file))).not.toMatch(/\bprices\b/)`. Today "prices" appears only in the comment at `analysis-service.ts:41`, which `codeOf` strips.
2. In `tests/unit/project-contract.test.ts`, next to `SNAPSHOT_READERS` (`:176`), bound the twelfth entry's permission to what it needs: in `src/server/reporting/analysis-service.ts`, every `unitPrice` occurrence is `unitPriceSnapshot`. The amendment then carries its own bound, rather than relying on AC-8's list to remember it.
3. Re-run M6 (or an equivalent mutation) and record that both new clauses go red while `typecheck` stays at exit 0.

---

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `analysis-access.spec.ts:182` (signed-out 307 with `callbackUrl=%2Fanalysis`, no content), `:199` (staff 307 to `/stock-entry?denied=analysis`, raw body with no `€`, `access-denied` text), `:224` (ADMIN 200, `<h1>Analysis</h1>`, `signed-in-email`, `sign-out`, `H2` period heading). Sign-in landing on `/analysis`: `sign-in.spec.ts:157-166`, unmodified. `role-access`, `route-protection` and `sign-in` specs are unmodified (porcelain). `auth-config.ts` and `middleware.ts` are untouched (`analysis-contract.test.ts:274`). |
| AC-2 | PASS | Spy thunks: `analysis-service.test.ts` (admin builder called 0 times for staff, once for admin; exact `ADMIN is required for this action`; null gives `UnauthorizedError`). `PROTECTED_PATHS` removal reproduced, with restore hash `bf902c98…`, in `impl_analysis.md` (Phase B, "AC-2"). |
| AC-3 | PASS | The derived `loading.tsx` census in `stock-entry-contract.test.ts` is unchanged by the diff. The degradation is recorded: staff refusal became `200` with no `Location` when `loading.tsx` was added (`impl_analysis.md`, "AC-3"). `src/app/analysis/` holds only `page.tsx`. |
| AC-4 | PASS | Signature check at `analysis-service.test.ts` ("AC-4: getAnalysis's second argument…"). Writer and `db.` scans at `analysis-contract.test.ts:81`, `:89`. Row and column identity at `analysis-service.db.test.ts:1013`. e2e `analysis-access.spec.ts:385`. |
| AC-5 | PASS | `.db.test.ts:344`, `:357`, `:375`, `:396` (a SUBMITTED count with snapshots contributes nowhere). e2e `analysis-figures.spec.ts:309` (`Submitted`, link to `/stock-takes/counts/<id>`, no `€` in the cell or the total). Phase A mutation 1 went red. |
| AC-6 | **FAIL** | Shape: `.db.test.ts:419`, `:444` (converse is `"0"` / `€0.00`), `:463`, `:481`. Page, incomplete: `analysis-access.spec.ts:590` (sentence, `Not counted`, no `€` in `total-stock`, the two-yard plural). Page, converse: `analysis-figures.spec.ts:333`. **Page, empty state: untested — B1.** |
| AC-7 | PASS | `.db.test.ts:266` (the three literal strings), `:277` (`€8,880.92` / `€15.72` / `€8,896.64`), `:287` (a fixture where the sum of rounded figures differs from rounding the exact sum), `:314` (stored nowhere). e2e `analysis-figures.spec.ts:247` (relationship). |
| AC-8 | **FAIL (scan half)** | Runtime half PASS: `.db.test.ts:584`, five operations each deep-equal; Phase A mutation 3 went red and `typecheck` stayed at 0. Scan half: the six-name absence passes, but "selects `unitPriceSnapshot` … from nothing else" is not asserted. M6 passes every scan — B2. |
| AC-9 | PASS | `.db.test.ts:508` (3, not 7), `:524` (the same figure without the lines), `:549` (an unpriced-only group appears at `"0"` with count 1). `analysis-messages.test.ts:96` (plural and singular). e2e `analysis-figures.spec.ts:266` (sentence, pathname `/stock-entry/counts/<id>/summary`, absence on the all-zero period). Phase A mutation 4 went red. |
| AC-10 | PASS | `money.test.ts` (four differences, eight scale values, half-away-from-zero, clamping, still no `Number(`, still no `unitPrice`). Scan at `analysis-contract.test.ts:147`, which includes the chart module. |
| AC-11 | PASS | `.db.test.ts:632`, `:644`, `:659` (refuses; July is not used), `:680`, `:689`. `period-series.test.ts:22`. e2e `analysis-figures.spec.ts:358`, `:409`, `:663`. Phase A mutation 5 went red. |
| AC-12 | PASS | `.db.test.ts:706` (`2025-09`, not the ordinal walks), `:729`. `period-series.test.ts:40`, `:50`. |
| AC-13 | PASS | `period-series.test.ts:59`, `:82`, `:111`, `:138` (no `new Date` / `Date.UTC`), `:156` (`period.ts` byte-identical). |
| AC-14 | PASS | Geometry: `analysis-chart.test.ts:44`, `:75`, `:90` (complete zero gets `TREND_MIN_BAR_HEIGHT`), `:116` (incomplete gets no height and no amount), `:141`. Browser: `analysis-figures.spec.ts:443` (viewBox, role, title, no width, 13 slots, the all-zero bar `data-amount="0"`, gaps with no amount, exact decimal on the last bar). **Tuple equality proven load-bearing by M5:** with the table rows emitting `data-amount="0"` for gaps, `:467` went red with a 9-line diff (`"2104-10|"` against `"2104-10|0"` …). No charting library (`analysis-contract.test.ts:324`). Phase A mutation 6 went red. |
| AC-15 | PASS | `.db.test.ts:816`, `:832` (`No supplier` last), `:849` (exact sums agree), `:860`, `:885`. e2e `analysis-figures.spec.ts:505` (`aria-current` at `:544`), `:549`, `breakdown-empty` at `:344`. |
| AC-16 | PARTIAL | Parser: `analysis-input.test.ts:19-104`. `parsePeriodKey` scan: `analysis-contract.test.ts:168`. Jumps: `.db.test.ts:915-940`, e2e `analysis-figures.spec.ts:579`. Every link: `:603`. Default is the latest *approved* period: `:566`. Refused parameter gives 307: `analysis-access.spec.ts:339`. **"None approved → opens on this month and renders the empty state": untested — B1.** |
| AC-17 | PASS | `.db.test.ts:969` (exactly six money-shaped keys, as a set), `:981` (no euro outside them). Staff branch: `analysis-contract.test.ts:186`. See observation O1 on its regex half. |
| AC-18 | PASS | `analysis-access.spec.ts:246`: staff with query, header and cookie gets 307 with no body; admin `<main>` is byte-identical. The framework reason for comparing `<main>` rather than the whole document is sound. My probe P added the RSC, prefetch, `_rsc`, trailing-slash, HEAD and `Next-Action` vectors; all clean (below). See O2. |
| AC-19 | PASS | `analysis-access.spec.ts:312` (`€` on `/analysis`, none on the five routes). `analysis-contract.test.ts:216` (import graph), `:240` (no `YARD_STAFF`). |
| AC-20 | PARTIAL | `analysis-access.spec.ts:481` and `:566`. **`break-words` proven load-bearing by M4:** without it the test went red at `Error: 390 /analysis?period=2103-12&breakdown=type — Expected: <= 390, Received: 478`, exactly Phase B's recorded figure. Stacking, chart box and 44×44 are asserted. **Empty-state measurement: never taken — B1.** |
| AC-21 | PASS | e2e `analysis-access.spec.ts:339` (six inputs, no leak strings, `1999-01` returns 200). Throw scan: `analysis-contract.test.ts:194`. `analysis-input.test.ts:45`. `.db.test.ts:951`. |
| AC-22 | PASS | `analysis-messages.test.ts:45-66` (identity of the re-exports). `analysis-contract.test.ts:250` (the lib modules import nothing from `src/server`), `:266` (no `use client`). JS-disabled run: `analysis-access.spec.ts:403`. See O7. |
| AC-23 | PASS (my run) / OPEN (init half) | Run by me with `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all at `no-such-host.invalid`: `prisma validate` 0, `typecheck` 0, `lint` 0, `test:unit` 0 (55 files / 817 tests), `build` 0 (`ƒ /analysis`). **The "both init scripts end `(database checks skipped)`" half was not run by anyone on this tree.** It is the coordinator's; I am barred from running `init`. |
| AC-24 | PARTIAL (coordinator) | `playwright.config.ts` diff is exactly the two patterns. `RESERVED_YEAR` has 2103, 2104 and 2105. Census is 14 files / 15 keys (`stock-entry-contract.test.ts`). Figures spec clears both of its own years (`analysis-figures.spec.ts:114-115`, `:206-207`), plus `realCountIds`. **Two consecutive full runs with 0 failed / 0 flaky: one qualifying run is on record (the gate).** The cascade-proof run passed all 192 real tests but reported 1 failed (the planted test). The fixes for B1 and B2 need a new gate anyway; run it twice. |
| AC-25 | PASS | `analysis-contract.test.ts:274` (schema, migrations, truncate list and every named tree untouched). Porcelain matches. See O3 and O4 (`money.test.ts` is outside AC-25's literal list). |
| AC-26 | PASS (letter) — bound: see B2 | `project-contract.test.ts:181` (twelve, exact), `:252` (three snapshot readers, with non-vacuity), `:234` (app/components still three), `signatureSvg` unchanged. The reason is written in the comment at `:166-180` and `:253-258`. M1 and M2 prove it is a file list, not a directory. |
| AC-27 | PASS | All six mutations are recorded with test names and exit codes. `typecheck` exit 0 is recorded for (3). Restore hashes are recorded (`impl_analysis.md`, Phase A "Mutation proofs"). I re-verified two of them from the other side (M4, M5). |

---

## The brief's specific questions

### 1. Can a staff session reach the admin shape? No — every vector I could find was refused.

The brief's standing lesson is that TypeScript does not protect the money boundary. What does protect it:
- Every render path of the page runs `requireAdminPage` first (`page.tsx:125`).
- Both service functions run `assertRole` (`analysis-service.ts:540`, `:621`).
- There is no route handler, no server action and no client component.
- The spec's three vectors are covered by AC-18.

I added a temporary probe spec (P), ran it on a build of the restored tree and then removed it. As a control, an ADMIN request with `RSC: 1` returned `200` and the payload contained `period-heading`. With a staff session:

| Vector | Status | Body |
|---|---|---|
| `GET /analysis`, `RSC: 1` | 200 | 2,558 bytes (a redirect flight); no `€`, no `period-heading`, no `yardValue` |
| `RSC: 1` + `Next-Router-Prefetch: 1` | 200 | 163 bytes; clean |
| `?period=2105-09&breakdown=supplier&_rsc=…` + `Next-Url` | 200 | 2,610 bytes; clean |
| `/analysis/` | 308 → `/analysis` | clean |
| `HEAD /analysis` | 307 → `/stock-entry?denied=analysis` | — |
| `POST /analysis`, bogus `Next-Action` | 404 | 24 bytes; clean |

### 2. The unreachable staff thunk: KEEP IT. It is spec-mandated defence in depth, not an oversight.
- AC-4 requires `assertRole(actor, "ADMIN")` first.
- AC-2 requires routing through `shapeForRole`, whose signature makes a `forStaff` thunk mandatory. The only honest body for that thunk is a refusal.
- By static reading it is unreachable: after `assertRole`, `user.role === "ADMIN"`, so `shapeForRole` always calls `forAdmin`.
- Its value is what happens if the guard is ever weakened: the answer is still `ForbiddenError("ADMIN is required for this action")`, the same sentence, rather than a reduced object.
- I tried to demonstrate that live (mutation M3: `assertRole` replaced by `assertUser`, then the spy file run). The environment's permission classifier refused the edit before it ran. The file hash was re-verified as unchanged (`1eec466b…`). So this ruling rests on static reading, not a run.
- Do not remove the thunk. See O1 for the scan that is meant to guard it.

### 3. Prices come from the snapshot only (AC-8)
- **Verified:** the absence of the six names. The runtime proof is the five-operation deep-equality test (`.db.test.ts:584`, with back-dated, same-day, later and first-ever prices, plus archiving), shown red by Phase A mutation 3.
- **Not verified:** that the absence means what the spec says it means — B2.
- I did not run a separate "edit an existing `ItemPrice` row" probe, because it would need `test:db`. The service reads no `ItemPrice` at all, so an edit and an add are the same fact to it, provided B2's guard exists.

### 4. The `Number(` ban and the table scan: acceptable, and no amendment is needed now
- `StockCount` is capped at one row per active yard per month (`@@unique`), about 24 rows a year.
- The read selects six scalar columns (`analysis-service.ts:151-161`), and the one large table, the lines, is scoped to the approved counts in the window (`:184`).
- Minor: `readCounts()` runs twice per page view, once from `listApprovedPeriods` and once from `getAnalysis`.
- Phase A says the table scan was forced, not chosen, and that is right for this feature.
- The proper lever, when it is ever needed, is a `Period`-returning month-key parser without the write cap, in `src/server/counts/period.ts`. That is a #7-module change, and 011 AC-25 correctly forbids it here.
- An existing escape exists: `periodForCountDate(monthBounds(key).last)` yields the integers with no `Number(` in the reporting tree. It is a semantic trick (a count-date rule used as a parser) and I do not recommend it.
- Recommend the leader records the lever in #12's spec, since #12 reads the same service.

### 5. A gap is never a zero; a complete empty period is `€0.00` — tested at every level
- **Unit:**
  - `analysis-chart.test.ts:90` — a complete zero gets the minimum bar;
  - `:100` — thirteen zeros are thirteen bars;
  - `:109` — a sub-pixel total is still a bar;
  - `:116` — an incomplete period gets no height and no amount.
- **Database:** `.db.test.ts:444`.
- **Browser:** `analysis-figures.spec.ts:443` — the all-zero period is a `trend-bar` with `data-amount="0"` and no `trend-gap`, and every gap has no `data-amount`. `:333` renders `€0.00`.
- **Mutation:** Phase A mutation 6 (zero-height bar for an incomplete period) went red.

### 6. The chart's tuples equal the table's (AC-14) — proven load-bearing
M5 changed only the table rows' `data-amount` for gaps. `analysis-figures.spec.ts:467` went red and listed each of the nine diverging periods.

### 7. The identity-header fix is load-bearing
M4 removed `break-words` from `page.tsx:205`. `analysis-access.spec.ts:521` went red on its first measurement with **478 against 390**, matching Phase B's transcript to the pixel. Restored; hash identical.

### 8. Phase A's amendment of `money.test.ts`'s multiplication census (Deviation 3): confirmed forced and strictly bounded
- `scaleToInteger` must live in `money.ts` (AC-10) and needs one `bigint` multiplication.
- The list stays exact (2 → 3), so a fourth multiplication turns it red.
- Not blocking. The leader should add it to the spec's amendment table and to AC-25's list of edited files (O4).

---

## Checkpoints

**C1 — Process**
- [x] Exactly one feature changed — **conditional.** The working tree also carries two repairs from a separate brief (`scripts/run-e2e.mjs`, `tests/e2e/item-master-yards.spec.ts`). #11's reports list neither, and the other report's hashes show #11 did not touch them. #11's commit must exclude them, as the coordinator plans.
- [x] Spec exists.
- [ ] Every numbered AC satisfied ← AC-6 and AC-8 FAIL; AC-16 and AC-20 PARTIAL (B1, B2); AC-23 and AC-24 have open gate halves.
- [x] `feature_list.json` `acceptance[]` matches (27 entries; the first and last are verbatim spec text).
- [x] `progress/impl_analysis.md` exists and lists the files touched (Phase A and Phase B).

**C2 — Verification**
- [x] `init` green with the database checks executed — the coordinator's gate on this tree; not re-run by me, per the brief.
- [x] `typecheck` exit 0 (my no-DNS run).
- [x] `lint` exit 0 (my no-DNS run).
- [x] Every new service function has success and failure tests (`getAnalysis` and `listApprovedPeriods`: `.db.test.ts` and `analysis-service.test.ts`).
- [x] Tests assert real values (literal decimal strings, sets, deep equality).
- [x] Real test database (`resetTestDb` in `beforeEach`). The only doubles are AC-2's spy thunks, as the spec requires.

**C3 — Architecture**
- [x] No component or route handler imports `PrismaClient`. `db.` appears in the service only (`analysis-contract.test.ts:89`).
- [x] Data access is in `src/server/reporting/analysis-service.ts`.
- [x] Excel builders — N/A.
- [x] No circular imports (reporting → counts/period → items/item-master-input; nothing points back).
- [x] Schema changes — N/A (no schema change; `analysis-contract.test.ts:274`).

**C4 — Domain integrity**
- [x] Value is never stored (`.db.test.ts:314`, schema scan `:315`).
- [x] No price, value or total in a `YARD_STAFF` body (AC-1, AC-18, AC-19 and probe P).
- [x] Decimal columns untouched.
- [x] Signature / reopen — untouched (the feature writes nothing).
- [x] Snapshot never rewritten (the feature writes nothing; AC-4).
- [x] Approved counts are immutable — untouched.
- [x] Quantity precision (`21.6128` in the AC-7 fixture, exact).
- [x] `Samples/` untouched (`analysis-contract.test.ts:307`).

**C5 — Conventions**
- [x] Naming.
- [x] Typed errors only (`analysis-contract.test.ts:194`).
- [x] No `console.` in the new `src/` files (grep empty).
- [x] No TODO or FIXME (grep empty).
- [x] No secrets.

**C6 — Session hygiene**
- [x] `progress/current.md` updated.
- [x] No temporary files: my five probes and mutations were removed; porcelain and the ignored set are identical.
- [x] `feature_list.json` status is `in_progress`, which matches reality.

**C7 — Advisory**
- [x] Empty, loading and error states exist. The empty state exists but is untested (B1). No `loading.tsx`, by design.
- [x] Phone-usable (AC-20; M4 proves the guard).
- [x] Figures formatted consistently (`formatFigure`, a true minus sign).

---

## Required changes (summary)
1. **B1 (implementer, or leader for the spec option):** add a test the gate runs, with no database, that renders `page.tsx`'s empty branch and today's-month default. It asserts the literal, the `/stock-takes` href, the period heading and zero `€`, and is shown red by planting a `€0.00`. Correct the false "criterion in full" claim (`impl_analysis.md`; `analysis-access.spec.ts:449-459`).
2. **B2 (implementer):** add `/unitPrice(?!Snapshot)/` (raw) and `\bprices\b` (code) absences to AC-8's scan in `tests/unit/analysis-contract.test.ts`. Bound the twelfth `unitPrice` entry to `unitPriceSnapshot` in `tests/unit/project-contract.test.ts` next to `:176`. Record M6 or an equivalent going red with `typecheck` at 0.
3. **Coordinator, next gate:** two consecutive full `npm run test:e2e` runs at 0 failed / 0 flaky (AC-24), and the no-DNS `init` half of AC-23.

## Observations (non-blocking)
- **O1.**
  - The AC-17 regex half, `/forStaff[^}]*return\s*\{/s` (`analysis-contract.test.ts:191`), never sees the real staff thunk. That thunk is passed positionally at `analysis-service.ts:544`, and `forStaff` appears only in `analysisForRole`'s signature (`:517`).
  - The `toContain("throw new ForbiddenError")` half is what guards it today.
  - Suggest anchoring the scan on the first argument to `analysisForRole(` inside `getAnalysis`.
- **O2.**
  - In AC-18's admin half, the `role=YARD_STAFF` cookie is added to the context (`analysis-access.spec.ts:286-288`) before the "plain" read (`:299`). So the cookie vector is on both sides of the byte comparison.
  - A cookie-driven downgrade would still fail `:300` (`period-heading`), so the role question is covered.
  - Add the cookie after the plain read so all three vectors are isolated.
- **O3.** The working-tree absence tests will go red while #21 is being built, until #21 commits. The same is true of #7's, #8's and #10's equivalents.
  - The affected tests are `analysis-contract.test.ts:274` (AC-25) and `:333` (`package.json`).
  - #21's triggering edits: 021 AC-37 edits `src/app/stock-entry`, `src/app/stock-takes` and `src/server/auth/**`, and 021 AC-30 removes a `package.json` script.
  - `docs/conventions.md:96-101` calls absence "fine … forever", but that is only true once the later feature commits.
  - 021's amendment table does not list these tests. Leader: add them, or move absence claims to a fixed range (`c9b980c..<#11 commit>`).
- **O4.** `src/lib/money.test.ts`'s census amendment is forced and bounded (confirmed above). But neither 011's amendment table nor AC-25's list of edited non-source files names that file. That is spec housekeeping for the leader.
- **O5.** Deviation 1: the AC-9 href carries `?period&breakdown` because of AC-16's one rule. The e2e asserts the pathname exactly and the parameters separately. The leader should reconcile the wording of the two criteria.
- **O6.** Deviation 2:
  - `Not counted` is the text of the **total** cell and the breakdown-total cell for an incomplete period (`PeriodGrid.tsx`, total cell; `BreakdownTable.tsx`, `breakdown-total`). It reads as "nobody counted" when Dublin's figure is right beside it.
  - The `period-incomplete` sentence names the missing yard, so this does not block.
  - A dedicated "Incomplete" literal would be clearer. Leader's call.
- **O7.** The AC-22 JS-disabled run (`analysis-access.spec.ts:403`) clicks one breakdown link, *Previous period* only, and the first count link. The mechanism is proven, but *Next period* and the second breakdown link are never clicked with JS off.
- **O8.** *Sign out* is never clicked on `/analysis`. The same `SignOutForm action={signOutAction}` is proven at `sign-in.spec.ts:197`, and `page.tsx:279` renders it unchanged from the placeholder.
- **O9.** `SEE_THE_ITEMS` (`analysis-messages.ts:123`) is exported but used by no screen.
- **O10.** The reserved-year census counts year **keys**, not values. Two keys with the same number would pass. This predates #11, and the new two-year file makes a value check more worthwhile.
- **O11.** The only link to the item names, the unvalued-lines sentence, is the smallest tap target on the phone. The spec exempts it (Phase B finding 5). Worth a UX look, not a defect.

---

## Separately: the two repairs outside #11 (not part of this verdict)

**`scripts/run-e2e.mjs` (two-phase runner) — can it report green with a failed phase? No.**
- How the exit status is decided:
  - The exit status is that of the first failing phase (`outcomes.find(status !== 0)`).
  - A spawn error returns 1.
  - A death by signal leaves `status` as `null`, which becomes 1.
  - Playwright itself exits non-zero when it finds no tests.
- The planted-failure run shows exit 1 with phase 2 still reported (`impl_e2e_cascade_and_type_reorder.md`, Repair 1).
- One caveat worth writing into the header comment: after a red phase 1, phase 2 runs against whatever phase 1 left behind. Phase 1's item-master debris can sit on the yard sheets that phase-2 fixtures pick from, so phase-2 failures after a red phase 1 are advisory.
- A call with arguments keeps the old single-run behaviour, including the dependency skip. That is correct.

**`tests/e2e/item-master-yards.spec.ts`**
- **Seed-order swap (upper at `band + 1` first, then lower at `band`): keep it.**
  - It changes no assertion.
  - It strictly narrows the race with the other files' "greatest + 1" seeds: a concurrent seed now lands above the pair instead of on `band + 1`.
  - Ordering is by `(sortOrder, code)`, so creation order has no other effect.
  - It is beyond the brief but within the file's own purpose. Commit it under `fix(#6)` with the reason already in the comment.
- **`move()` helper (`goto` the bare path before each move): it does not weaken 006 AC-23, AC-26 or AC-27.**
  - The `goto` happens before the click, so each post-move render still comes from the action's own redirect.
  - The swap assertions on both rows and the database, the multiset equality (`ourSortOrders()` before and after), and the "back to the original values" checks are all intact.
  - `waitForURL(/[?&](done|error)=/)` cannot match stale, because the URL is bare before every click.
  - **What it removes** is the suite's only incidental coverage of two moves in a row on one page. That is a real user flow, and the report's own source reading (`app-router-instance.js:131-140`: a navigation dispatched while an action is pending discards that action's result) describes a hazard in exactly that flow.
  - Recommend a #6 follow-up that tests back-to-back moves as a product question, rather than leaving the hazard documented only in a progress file.
- **Minor:** `expectSheetRowsAlone` orders ties with JS `localeCompare`. If `moveItemInSheet` orders in SQL, a Postgres collation difference on unusual descriptions could disagree with it. This only matters for rows that tie on `sortOrder` within the band.

---

## Mutation and restore ledger

Baseline byte copies and hashes are in `scratchpad/rev11/`.

| # | What | Result | Restore |
|---|---|---|---|
| M1 | Untracked `src/server/reporting/zz-review-probe.ts` naming `unitPrice` | `project-contract.test.ts:181` red (13 ≠ 12, file named) | Deleted; porcelain identical |
| M2 | Untracked `src/components/analysis/ZzReviewProbe.tsx` naming `unitPriceSnapshot` | `:181`, `:234`, `:252` red | Deleted; porcelain identical |
| M3 | `getAnalysis`: `assertRole` → `assertUser` | **Refused by the environment's permission classifier; never ran** | Hash re-verified `1eec466b…` (unchanged) |
| M4 | `page.tsx:205` without `break-words` | `analysis-access.spec.ts:521` red, 478 > 390 | `3ad2c86f…` identical |
| M5 | `TrendChart.tsx:131` `data-amount={slot.amount ?? "0"}` | `analysis-figures.spec.ts:467` red (9 tuples differ) | `67d7f12c…` identical |
| P | Temporary `tests/e2e/analysis-zzreviewprobe.spec.ts` | First run failed on my malformed `//analysis` vector (Playwright read it as a host). Re-run without it on a build of the restored tree: passed; results above | Deleted; porcelain identical |
| M6 | Service price-list fallback via `Item.prices.unitPrice` | 3 contract/spy files, 40/40 **green**; `tsc` exit 0 → B2 | `1eec466b…` identical |
| — | No-DNS `validate` / `typecheck` / `lint` / `test:unit` / `build` | All exit 0 (817 tests) | Read-only; the final `.next` is a build of the unmodified tree |

- **`npm run test:db`:** not run. The brief requires a check with the coordinator first, and there is no channel for that. No database-dependent conclusion above depends on a run of mine.
- **Final state:** `git status --porcelain` and `git status --porcelain --ignored` are identical to the snapshot taken before the first mutation.

---

# Second pass

**Verdict:** APPROVED
**Blocking findings:** 0. B1 and B2 are closed, and both were attacked rather than read.
**Scope of this approval:** everything except AC-24's two consecutive clean full e2e runs.
- AC-24 is **open**, and it belongs to the coordinator, as the brief says.
- Run 2 went red on #9's `stock-entry-approve.spec.ts:378`, at its non-vacuity guard, which is not a #11 test.
- This approval does **not** allow #11 to be marked `passes: true`, or committed as done, until the pair is recorded clean.

**init:** green on the reviewed tree, per the coordinator's gate: exit 0; unit 826; e2e 56 + 136; db 397; database checks executed. No-DNS `init` also exited 0. I did not re-run it. As the brief instructed, I ran no Playwright command and no `test:db`.

**Tree:**
- Since the first pass, `git status --porcelain` differs only by the coordinator's `feature_list.json` and spec edits, this review file, and `?? src/app/analysis/page.test.ts`.
- `page.tsx` (`3ad2c86f…`) and `analysis-service.ts` (`1eec466b…`) are byte-identical to the tree I reviewed the first time.
- All 19 hashes in the repair's final table match the tree.
- After this pass, porcelain, the ignored set and those 19 hashes are identical to the snapshot taken before my first mutation. Ledger at the end.

## B1: closed

**What the page actually renders.** The empty branch is not extracted into a component. It is inline in `src/app/analysis/page.tsx:231` (`analysis.anyApprovedCountEver ? … : …`, else-branch `:257-277`), and `src/app/analysis/page.test.ts:80` imports that real page. Only three modules are mocked: `page-guards`, `analysis-service` and `auth-actions`. `next/link` and every component are real. So my two plants went into the rendered branch itself, not into a copy.

| # | Plant, in `page.tsx` | Result (`npx vitest run src/app/analysis/page.test.ts`) |
|---|---|---|
| R1 | `:267` text: `{NO_APPROVED_STOCK_TAKES_YET} {"€"}0.00` | **Red**, 1 failed / 4 passed. `page.test.ts:260`: `expected '<main …' not to contain '€'`. The received HTML shows `No approved stock takes yet. €0.00` inside `data-testid="no-approved-counts"`. |
| R2 | `:264` attribute, not text: `aria-label={"€0.00"}` on the empty block | **Red** at the same assertion. The census is the whole document, attributes included. |

- The implementer's own plant was a third form: a new `<p>`. So there are three independent plant forms, all red.
- The converse (`page.test.ts:264-290`) shows the census can see a euro once a period is approved. So the zero is a fact about the branch, not about a page that never renders money.
- **The seam between the two halves holds.** `analysis-service.db.test.ts:463-479` proves that with nothing approved, the real service answers `anyApprovedCountEver === false` and `listApprovedPeriods → []`. That is exactly the mock's input. The branch then renders no field of the shape except `periodLabel`, so the mock's hand-built figures cannot hide a euro.
- **AC-16's page half** (`page.test.ts:296-324`) asserts:
  - the call `getAnalysis(ADMIN, { periodKey: monthKeyOf(todayInYard()), breakdownKey: "type" })`;
  - the `<h2>` label.

  The pinned-clock test (`2026-09-30T23:30Z → 2026-10`) goes further than the spec asks, and the implementer's UTC-month mutation shows it is load-bearing.
- **The page test is in the gate.** `vitest.config.ts:17` includes `src/**/*.test.ts`, and the unit count moved 817 → 826 (+5 from this file). The no-DNS `init` passed with it.
- **The dead e2e branch is deleted, not guarded.** `tests/e2e/analysis-access.spec.ts:473-503` now:
  - asserts only the reachable half, unconditionally;
  - uses `approvedCountTally() >= 3` as a precondition, never as a branch;
  - says in its title and comment where the empty state is proved instead.

  No test in the tree still claims the empty state while being unable to assert it.
- **The false claim is corrected in place.** "Criterion in full" now carries dated correction lines in `impl_analysis.md` (Phase B, *What I could not verify*), and nothing above them was rewritten.

## B2: closed

**M6, re-run verbatim.** The mutated file's hash is `f6942227caaa…`, identical to the hash the repair recorded. So its `test:db` transcript was taken against the same bytes.
```
npx tsc --noEmit -> exit 0
npx vitest run tests/unit/analysis-contract.test.ts tests/unit/project-contract.test.ts src/server/reporting/analysis-service.test.ts
 × 011 AC-26, bounded after review B2 …   → Set{ 'unitPriceSnapshot', 'unitPrice' } ≠ Set{ 'unitPriceSnapshot' }
 × AC-8: the price column is named in the three trees only as the snapshot   → … not to match /unitPrice(?!Snapshot)/
 × AC-8: and no code in the three trees reaches through the item's price relation → … not to match /\bprices\b/
 Tests  3 failed | 40 passed (43)
```
- All three new clauses went red.
- The 40 tests that let M6 through the first time stayed green, which is exactly the gap they closed.
- `typecheck` stayed at 0.

**The recorded `test:db` transcript is credible.** It matches my first-pass prediction to the digit:
- Clonmel `15.71775 → 582.71775`;
- the total moves by the same `567`;
- operation 4 (the first-ever price) fails.

It also shows something I had not predicted: `unvaluedHeldLineCount` goes `1 → 0`, so the Invariant-4 warning would have disappeared together with the figure going wrong. The failure is reported at `:605:65`, the assertion inside operation 4's block; my `:584` was that test's start.

**Do the clauses bite legitimate code? No, with one cosmetic caveat.**
- All three are green on today's tree.
- `\bprices\b` runs on `codeOf` output, so the service's prose comment at `:41` is stripped.
- `/unitPrice(?!Snapshot)/` is raw source by design, the same as the six names.
- **Is there a way round them?** Any reach from `StockCountLine` to `ItemPrice` must name the relation `prices`, because Prisma has no field aliases, and must read `unitPrice` or name `ItemPrice` in raw SQL. Each of those is now caught. Only string-built keys could get through, and the first pass already ruled those out of scope as dishonest.
- **Caveat.** The project-contract bound is `unitPrice\w*` = exactly `{unitPriceSnapshot}`. A future local variable named `unitPriceSnapshots` would trip it loudly, not silently. That is acceptable.

## O1: fixed for the realistic form, with a residual hole (non-blocking)

The scan at `tests/unit/analysis-contract.test.ts:241-269`:
1. reads the `forStaff` position from `analysisForRole`'s signature;
2. takes that argument from the one call in `getAnalysis`;
3. asserts a block body, `throw new ForbiddenError`, and no `return`.

| # | Staff thunk (`analysis-service.ts:544`) mutated to… | tsc | Result |
|---|---|---|---|
| O1d | `{ if (user.role !== "ADMIN") return { refused: true } as never; throw new ForbiddenError(…); }` | 0 | **Red**: `:268` `not to match /\breturn\b/`. The old clause stayed green on the repair's comparable variant B. |
| O1e | expression body: `(): never => user.role !== "ADMIN" ? ({ refused: true } as never) : (() => { throw new ForbiddenError(…); })()` | 0 | **Green**, 29/29 |

**Why O1e passes.**
- `:266` `/=>\s*\{/` is unanchored, so it matches the *inner* IIFE's arrow.
- The literal `throw new ForbiddenError` is present.
- There is no `return` word.

For a staff actor this thunk returns an object. So the comment at `:265` ("no expression body (`() => ({ ... })`) that would return without the word") claims more than the scan delivers.

**Why this does not block.** The thunk is unreachable while `assertRole` stands in `getAnalysis`. AC-2's zero-call spy and the runtime refusals are the real guard, and O1 was non-blocking in the first pass. The form is also contrived.

**Suggested fix:** require the thunk's *own* arrow to open a block, and the argument to end with that block, e.g. `expect(staffThunk).toMatch(/^\([^)]*\)\s*(:\s*\w+\s*)?=>\s*\{[\s\S]*\}$/)`. The implementer can take this in any later pass on the file.

## O6 → amended AC-6: confirmed, and red-tested

- `PeriodGrid.tsx:139` renders `INCOMPLETE_TOTAL`, and `BreakdownTable.tsx:157` does the same for the row total.
- The per-yard cells keep `NOT_COUNTED`: `BreakdownTable.tsx:144` and `PeriodGrid.tsx:50`.
- All four come from `src/lib/analysis-messages.ts`, with `:97` `INCOMPLETE_TOTAL = "Incomplete"`, and `analysis-messages.test.ts:91-93` pins that value.

| # | Mutation | Result |
|---|---|---|
| O6a | `PeriodGrid.tsx:139` → `NOT_COUNTED` | **Red**: `page.test.ts` `expected 'Total stockNot counted' to contain 'Incomplete'` |
| O6b | `BreakdownTable.tsx:157` → `NOT_COUNTED` | **Red**: `expected [ 'Not counted', 'Not counted' ] to deeply equal [ 'Incomplete', 'Incomplete' ]` |

The e2e side reads the literals from the module: `analysis-figures.spec.ts:331`, `:355-356`, `:573-576` and `analysis-access.spec.ts:626`, `:636-637`.

## O2, O7, O9, O10, and the runner caveat: confirmed

- **O2.** `analysis-access.spec.ts:301-321`:
  - both plain reads are taken with no `role` cookie, and its absence is asserted first;
  - the cookie and header are added after, and their presence is asserted;
  - the query parameter goes only on the second read.

  All three vectors now sit on one side of the byte comparison.
- **O7.** `:419-470` clicks, with JS off: *By supplier*, *By type*, *Previous period* (asserting `INCOMPLETE` by URL and heading), *Next period* (back to `COMPLETE`), and a count link.
  - I did not run e2e.
  - The implementer's targeted run and the gate's phase 2 (136/136 in run 1) passed it.
- **O9.** `SEE_THE_ITEMS` and "See the items" have **no** matches under `src`, `tests` or the spec, and `typecheck` exits 0.
- **O10.** `stock-entry-contract.test.ts:673-694` reads `RESERVED_YEAR`'s values, with comments stripped. It asserts:
  - no key is declared twice;
  - no year is held by two keys;
  - every named key is declared;
  - there are 15 distinct owned years.

  I evaluated its parser **in memory** on `tests/e2e/support/stock-entry.ts` with `analysisPrior: 2104 → 2105`: 15 keys, **14 years**, so `:690` would go red. On the tree it reads 15/15/15. I did not mutate the file on disk, because the concurrent e2e run imports it.
- **Runner.** The caveat is in the header at `scripts/run-e2e.mjs:39-43`: phase-2 failures after a red phase 1 are advisory. That file still belongs to the cascade repair's commit, not to #11's.

## The coordinator's amendments: honest. One sentence overreaches.

- **AC-6.** Honest. The page half moves to a server render that the gate runs, and that render is proven load-bearing (R1, R2, and the implementer's plant). The `Incomplete` sentence matches the decision table's "absent". It is a strengthening, not a relaxation.
- **AC-9.** It says "path" plus AC-16's parameters. This reconciles first-pass O5 with what the e2e has always asserted (exact pathname, parameters checked separately). It clarifies; it does not loosen.
- **AC-16.** Adds "(the page half by AC-6's server render)". Honest: the page-level default is now asserted directly, with a real clock and a pinned one.
- **AC-25.** Adds `src/lib/money.test.ts` (first-pass O4), which closes a real gap in the list. See the housekeeping note below.
- **AC-20, the empty state recorded as unreachable: right, and not a disguised loosening.**
  - **It is a loosening:** a measurement the approved spec required is removed.
  - **It is disclosed.** The criterion says so in its own text and the amendment explains why. The disguise was the previous state: a dead branch plus the `?period=1999-01` stand-in, presented as the empty state. Both are gone, and the `1999-01` state is now measured under its own name (`analysis-access.spec.ts:526-531`).
  - **The state really is unreachable.** This file's own `beforeAll` approves three counts, and the siblings' reserved years always hold approved ones.
  - **The unmeasured surface is small and bounded.** Every element of the empty state except the `no-approved-counts` block is the same element, with the same classes, as in the states that *are* measured at 390 px and 320 px. That includes the header with the 61-character unbreakable email, the `<h2>`, and the disabled jump spans. The block holds only two fixed short strings, no user data, in an `items-start` flex column.
  - **The honest alternative is not cheap.** It would mean a browser measuring the server-rendered markup with the built CSS, without a hand-copied fixture.
  - **One thing the amendment should add:** this is the screen the owner sees on day one in production, before any count is approved. The block is the one unmeasured piece of it, and that should be stated as the cost, not left implicit.
- **The amendment's prose overreaches in one sentence** (non-blocking; leader's fix). "The **total** cells for an incomplete period now read `Incomplete`, never `Not counted`" is false on the tree:
  - The trend table's cell for an incomplete period, `TrendChart.tsx:138`, still prints `Not counted`.
  - So does the chart gap's `<title>`, `:66`.

  That cell *is* the period's total, and for a period where Dublin was approved it has exactly the misreading O6 fixed. The numbered AC-6 names only `total-stock` and the breakdown-row totals, so the criterion passes. The leader should either narrow the sentence to those two, or extend `INCOMPLETE_TOTAL` to the trend table in a follow-up. The implementer raised this in the repair's reviewer notes.
- **Housekeeping (leader).**
  - AC-25 says each listed file is amended "exactly as AC-24, AC-26 and AC-10 name and no further". The O10 years-by-value check in `stock-entry-contract.test.ts` goes past what AC-24 names. It strengthens the same census and I asked for it, so it is sound, but it should get one line in the amendment.
  - First-pass O3 (the working-tree absence tests will go red while #21 is being built) is not addressed by this amendment and is still open for the leader.

## Criteria whose verdict changed since the first pass

| AC | First pass | Now | Evidence |
|----|-----------|-----|----------|
| AC-6 | FAIL | PASS | Page half: `page.test.ts:236-262`, red under R1, R2 and the implementer's plant. Amended `Incomplete`: `page.test.ts:330-381`, red under O6a and O6b. Shape half: `.db.test.ts:463-487`. |
| AC-8 | FAIL (scan half) | PASS | `analysis-contract.test.ts` "only as the snapshot" and "no code … reaches through the item's price relation"; `project-contract.test.ts:180-193`. All three red under M6 with tsc 0. Runtime half: `.db.test.ts:584`, red under M6 per the recorded transcript. |
| AC-16 | PARTIAL | PASS | `page.test.ts:296-324` (real clock and pinned clock). |
| AC-17 | PASS | PASS, with residual | O1d red. O1e green: see O1 above. Non-blocking. |
| AC-20 | PARTIAL | PASS as amended | The empty-state measurement is removed by a disclosed amendment, judged above. |
| AC-23 | PASS / OPEN | PASS | The gate's no-DNS `init` exited 0, ending `[OK] Environment ready (database checks skipped)`. |
| AC-24 | PARTIAL | **OPEN (coordinator)** | Run 1 clean (192/192). Run 2 red on #9's test. A second consecutive clean pair is required. |
| AC-25 | PASS | PASS | Porcelain delta since the first pass is `page.test.ts` only, plus the coordinator's spec and `feature_list.json`. The byte-identical trees are empty under `git diff HEAD`. `money.test.ts` is now listed. |

**Checkpoints changed:** C1 "Every numbered AC satisfied" is now [x] except AC-24, which is the coordinator's gate. C7 "Empty state tested" is now [x] (`page.test.ts`). All other checkpoints stand as in the first pass.

## Second-pass mutation and restore ledger

- Byte copies are in `scratchpad/rev11b/orig/`.
- The status, ignored set and hashes before the first mutation are in `scratchpad/rev11b/`.
- `page.tsx` and `analysis-service.ts` were mutated by a script that refuses to run unless the file is at its baseline hash and the target string occurs exactly once. The O6 edits used a one-shot replace with the same single-occurrence check.

| # | File | Mutated sha256 | Result | Restored sha256 |
|---|---|---|---|---|
| R1 | `page.tsx:267` (euro in text) | `6ac565b5…` | red | `3ad2c86f…` identical |
| R2 | `page.tsx:264` (euro in attribute) | `ec17383d…` | red | `3ad2c86f…` identical |
| M6 | `analysis-service.ts:192,207`, verbatim | `f6942227…` (= repair's) | 3 red, tsc 0 | `1eec466b…` identical |
| O1d | `analysis-service.ts:544` (block + return) | `329e14e6…` | red, tsc 0 | `1eec466b…` identical |
| O1e | `analysis-service.ts:544` (expression body + IIFE throw) | `48dde34a…` | **green**, tsc 0 → O1 residual | `1eec466b…` identical |
| O6a | `PeriodGrid.tsx:139` | n/a | red | `fe80a09e…` identical |
| O6b | `BreakdownTable.tsx:157` | n/a | red | `aa725c09…` identical |
| O10 | in-memory string only; no file touched | n/a | years 14 ≠ 15 | n/a |

- **Baseline, before any mutation:** 6 files, 96/96 passed (`page.test`, `analysis-messages.test`, `analysis-contract`, `project-contract`, `stock-entry-contract`, `analysis-service.test`). `npm run typecheck` exit 0.
- **Final state:**
  - `git status --porcelain` and `--ignored` are identical to the pre-mutation snapshot;
  - `sha256sum -c` over the 19 files in the repair's hash table: all OK;
  - `TrendChart.tsx` is unchanged (`67d7f12c…`).
- **Not run:** no Playwright/e2e command and no `test:db`, per the brief. `stock-entry-approve.spec.ts` and `stock-entry-quantities.spec.ts` were not opened.
