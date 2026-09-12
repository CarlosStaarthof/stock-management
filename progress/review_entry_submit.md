# Review — feature 9 `entry_submit`

**Verdict (first pass, 2026-09-12):** CHANGES_REQUESTED — **superseded.** The standing
verdict is **APPROVED**, recorded under `## Second pass — 2026-09-12` at the end of this
file. Everything below this line is the first pass, kept as written.
**Spec:** `specs/features/009-entry_submit.md` (34 criteria, plus three ratified
post-approval amendments)
**init:** green — the coordinator's closing run, `init exit=0`, 875 s, `[OK] Environment
ready`, **database checks executed**, 133 e2e, 614 unit, 0 flaky. Not re-run here, on
instruction.
**My own runs, from the restored tree:** `npm run typecheck` exit 0, `npm run lint` exit 0,
`npm run test:unit` **614 passed / 43 files**, the four contract files **86 passed**, and
seven targeted `npm run test:db` runs (one at a time, `tasklist` checked first — no
`run-db-tests.mjs` was in flight).

Two clauses that the criteria enumerate by name have **no test anywhere in the repository**.
Both are two-to-four-line additions. Everything else in this feature is, without
exaggeration, the best-evidenced work in this repository so far: I re-ran five of the eleven
mutations myself and every transcript in the report reproduced character for character.

---

## The two blocking findings, first

### B1 — AC-17 lost one of its five enumerated refusals between Phase A and Phase C

AC-17 lists five writes that must be refused **against an `APPROVED` count**, the second
being: *"`POST /api/counts/<id>/lines` returns `409` with that message in `error`"*, and then
*"After **all five**, a full row read … is deeply equal to the read taken before them"*.

`src/server/counts/count-lifecycle-service.db.test.ts:717` is named
**"AC-17: four writes are refused against an APPROVED count and the row does not move"** and
performs four: `saveQuantities`, `submitCount`, `approveCount`, `startCount`. The endpoint is
not among them, and it is not covered anywhere else:

- `src/app/api/counts/[id]/lines/route.db.test.ts:260` — the only route-level 409 test —
  calls `markPastDraft(countId)`, and `tests/support/count-fixture.ts:25` defines
  `PAST_DRAFT = "SUBMITTED"`. **`APPROVED` never reaches that endpoint in any test.**
- `tests/e2e/stock-entry-quantities.spec.ts:368` is the same, through the same helper.
- `grep -rn "api/counts" tests/ src/app/api` finds no other caller; `stock-entry-approve.spec.ts`
  never touches the endpoint.

Phase A's report explicitly deferred this half — *"Browser halves … AC-17 (the `409` from
`POST /api/counts/<id>/lines`)"* — Phase B's AC-17 row silently replaced it with the
read-only-DOM assertion, and Phase C's consolidated table carries the substitution forward. It
is not listed under Deviations in any of the three phases.

**Why this one matters rather than being pedantry:** it is *precisely* the M7 finding, one
layer out. M7's point is that a status guard proved against one status is not proved against
the other, and that the repository had exactly one test standing between an `APPROVED` count
and an editable one. At the route there are currently **zero**. I verified this by mutation:
with `src/server/counts/count-entry-service.ts:117` loosened to
`if (count.status === "SUBMITTED")`, `npm run test:db -- src/app/api/counts/[id]/lines/route.db.test.ts`
would stay green for the same reason #8's service suite did.

### B2 — AC-21's browser walk never looks at an `APPROVED` count

AC-21: *"the rendered HTML of `/stock-entry/counts/<id>` and `/stock-entry/counts/<id>/submit`
for a staff session — **for a `DRAFT`, a `SUBMITTED` and an `APPROVED` count**, with a filter
applied and with none — contains no `€` … The `ADMIN` renders of the same two routes contain
no `€` either."*

`tests/e2e/stock-entry-submit.spec.ts:411` loops
`for (const countId of [draft.countId, submitted.countId])` — **two states, not three**. The
implementer's own report says so in terms ("two roles × two states × three URLs"), again
without flagging it as a deviation.

Partial mitigation exists and is not enough: `tests/e2e/stock-entry-approve.spec.ts:235`
checks the **staff** `<main>` of `/stock-entry/counts/<id>` on an approved count for `€` and
`No price`. That leaves untested, on an `APPROVED` count: `/submit` for either role, the
`ADMIN` render of the count page, and the `unitPrice` string / real-price-value clauses on all
of them. `tests/e2e/stock-entry-approve.spec.ts:105` walks all four routes for a euro, but on
a **`SUBMITTED`** count.

---

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `tests/e2e/stock-entry-submit.spec.ts:114` — 307/302 + `callbackUrl` + body checked for content signed-out; staff 200 on `/submit`, `307 → /stock-entry?denied=count-summary` / `count-reopen` on the raw response with the bodies checked; ADMIN 200 ×3; `access-denied` rendered. `tests/unit/stock-entry-contract.test.ts:82` — no `loading.tsx` at or above `src/app/stock-entry/`. `git status --porcelain -- src/lib/auth-config.ts src/middleware.ts` empty. |
| AC-2 | PASS | `count-lifecycle-service.db.test.ts:196` and `count-summary-service.db.test.ts:123` — all six refuse a `null` actor and nothing moves. `tests/unit/stock-entry-contract.test.ts:193` — five exported actions, exactly one `await requireUser()` in each body. `tests/unit/entry-submit-contract.test.ts:270` — the complete `formData.get` field set is `{countId, reason, signature}` and none of the seven identity names appears. |
| AC-3 | PASS | `count-lifecycle-service.db.test.ts:218, 241, 251` — 12 uncounted → `ValidationError("lines", …)` with the exact sentence and six columns still null; singular at 1; **35 zeros of 82 submit**. Re-proved by me: mutating `uncounted > 0` → `> 999` gives `Tests 2 failed \| 1 passed`, the third (the `0` case) correctly staying green. |
| AC-4 | PASS | `count-summary-service.db.test.ts:148, 168, 174` — whole count in sheet order, never truncated, signature is `(actor, countId)` only. `stock-entry-submit.spec.ts:182` — exact `#line-<itemId>` hrefs with no query string, the same 12 entries from a filtered view, `toBeInViewport()`, `isDisabled() === false`. |
| AC-5 | PASS | `src/lib/signature-path.test.ts:49–192` — the five constants as literals, the accepted shapes, and **all twelve refusals** enumerated at `:101–121` (dot, no spaces, lowercase, `C`, two decimals, sign, x>600, y>300, double space, markup, script tag, `javascript:`), plus the `SIGNATURE_MAX_CHARS` boundary both sides and `pointInViewBox` rounding/clamping. |
| AC-6 | PASS | `count-lifecycle-service.db.test.ts:280` (×3) and `:297` — service-level refusal with six columns unchanged. `submit-input.test.ts:39` — an absent field is the same refusal. `stock-entry-submit.spec.ts:249` — enabled before anything is drawn, the sentence beside the pad, no navigation, row still `DRAFT`. Mutation re-run by me: `parseSignaturePath` removed → 4 of 4 AC-6 red. |
| AC-7 | PASS | `count-lifecycle-service.db.test.ts:315, 333` — byte-for-byte through Postgres and back through `getLifecycleFacts`. `stock-entry-signature.spec.ts:131` — drawn with real pointer input, the pad's `d`s join to the hidden field, the field equals the column, the page's `d`s join to the column, and a reload redraws it. |
| AC-8 | PASS | `entry-submit-contract.test.ts:65, 99` — four pointer handlers, no `touchstart`/`mousedown`, `touch-none`, the cap from the library constant. `signature-path.test.ts:195, 208, 272` — 200 collinear points → <60, every kept point ≥ `MIN_POINT_DISTANCE`, 400 points < 6000 chars. `stock-entry-signature.spec.ts:204` — Clear, two `M`s, 600 moves capped. |
| AC-9 | PASS | `stock-entry-signature.spec.ts:259` — 390 px, `scrollWidth ≤ clientWidth` at every step, pad ≥ 320×150 and inside the viewport, computed `touch-action: none`, **`window.scrollY` identical across a 200 px touch drag** with ≥2 points captured, both controls ≥ 44×44. `:338` — 320 px and the ADMIN's valued list. |
| AC-10 | PASS | `stock-entry-submit.spec.ts:363` — `javaScriptEnabled: false`, 200, review + uncounted list, `signature-needs-js`, no control with that accessible name, count still `DRAFT`. `stock-entry-approve.spec.ts:491` — approve **and** reopen complete with the bundle disabled. `entry-submit-contract.test.ts:141` — every act is a form post, none is a `fetch`. |
| AC-11 | PASS | `count-lifecycle-service.db.test.ts:354, 369, 383, 407` — the `2026-06-15` row wins over `2026-07-01`, `6.11764706` survives, four post-submission operations move nothing, one `effectiveFrom` comparison in the tree. Re-proved by me: pricing on `isoDateOf(new Date())` → `expected '9.99' to be '7.25'`. **The margin is one test of four** (see Observation 3). |
| AC-12 | PASS | `count-lifecycle-service.db.test.ts:430` — three priceless lines keep `null`. `count-summary-service.db.test.ts:228, 253, 270` — `noPrice`, `lineValue "0"`, `linesWithoutPrice`, and the same items named **before** submission. `stock-entry-approve.spec.ts:105` — `No price` on exactly those rows, `€0.00`, the sentence above the table. `stock-entry-submit.spec.ts:402` — the ADMIN's named items, the staff render with neither. |
| AC-13 | PASS | `count-lifecycle-service.db.test.ts:456` — `tmp_ac13_snapshot_check` added and dropped in the test, the status write rolls back with the snapshots, and a control run submits all six. `:482` — two concurrent submissions → one `SUBMITTED`, one `ConflictError`, one signature, one audit line. `:509` — no `FOR UPDATE`, no `version`. (Deviation: the constraint helper does not live in `src/server/test-db.ts`; see Observation 5.) |
| AC-14 | PASS | `count-lifecycle-service.db.test.ts:519` — the eight columns, `signedAt === submittedAt`, the five header columns compared, every line column but `unitPriceSnapshot` compared, and `allTableCounts()` equal before and after. |
| AC-15 | PASS | `count-lifecycle-service.db.test.ts:564, 580` — staff submit at either yard; `approveCount`/`reopenCount` raise `ForbiddenError("ADMIN is required for this action")` with the row, all lines and `notes` unchanged; the admin then succeeds. `stock-entry-approve.spec.ts:378` — no control, no `href$="/summary"`, and the forged POST leaves `approvedById === null`. |
| AC-16 | PASS | `count-lifecycle-service.db.test.ts:609, 648, 666, 685, 703` — three columns move and nothing else; `DRAFT`/`APPROVED`/missing id each refused by name; the concurrent race; **self-approval permitted and `signedAndApprovedBySamePerson === true`**. `stock-entry-approve.spec.ts:171, 269` — both screens say so. |
| AC-17 | **FAIL** | Four of five refusals proved at `count-lifecycle-service.db.test.ts:717` (its own name says "four writes"), plus `:752`, `:762` and the read-only DOM at `stock-entry-approve.spec.ts:171`. **The enumerated `POST /api/counts/<id>/lines` → 409 against an `APPROVED` count has no test in the repository** — `route.db.test.ts:260` and `stock-entry-quantities.spec.ts:368` both use `markPastDraft`, which is `SUBMITTED` (`tests/support/count-fixture.ts:25`). See B1. `count-entry-service.ts` **is** byte-identical (`cmp` against the pre-review copy: OK). |
| AC-18 | PASS | `count-lifecycle-service.db.test.ts:782` — six columns individually null, the `REOPENED` line with its reason, and `logWarn` asserted once with `countId`, `actorId`, `previousStatus` and **without** the reason text. `:816`, `:829`. `submit-input.test.ts:58–103` — trim, empty/blank/null/undefined, 200 vs 201, `\n`/`\r`/` `, and the proof a passing reason cannot split its own audit line. `stock-entry-approve.spec.ts:310` — the notice in the staff session, editable again, fresh signature demanded. Mutation re-run by me: `signatureSvg: null` deleted → 2 of 3 AC-18 red, `expected 'M 10 10 L …' to be null`. |
| AC-19 | PASS | `count-lifecycle-service.db.test.ts:849, 880` — all 82 survive the reopen, the repriced item does not move, the previously priceless one fills, and the WHERE clause asserted by scan. Mutation re-run by me: dropping `unitPriceSnapshot: null` → `expected '77.77' to be '9.83'` **and** the scan red, independently. |
| AC-20 | PASS | `src/lib/count-audit.test.ts:33–144` — the quoted line exactly, no trailing colon without a reason, the prefix property over three appends, unparseable lines ignored, `[]` for null/empty. `count-lifecycle-service.db.test.ts:895` — five lines in order. `stock-entry-approve.spec.ts:171` — two entries oldest first, the earlier line byte-identical after the second. |
| AC-21 | **PARTIAL** | Service half complete and exact: `count-summary-service.db.test.ts:302` (staff, zero at any depth, non-vacuous — it seeds an uncounted line and asserts the walk saw `Item 000`), `:322` (ADMIN `getCount` still exactly `itemsWithoutPrice`), `:328` (exactly `{itemsWithoutPrice, linesWithoutPrice}` as a set **and** length 2), `:337` (`getLifecycleFacts` deeply equal for both roles). Browser half at `stock-entry-submit.spec.ts:402` covers **`DRAFT` and `SUBMITTED` only**. See B2. |
| AC-22 | PASS | `src/server/counts/count-summary-service.test.ts:25` — the staff thunk runs, the admin thunk zero times, **with no database at all**, so "never built" is proved by the absence of a connection. `count-summary-service.db.test.ts:360` — the ADMIN money keys as a **set** of exactly six. `stock-entry-approve.spec.ts:105` — of the four routes, the `€` is in exactly `/summary`. `entry-submit-contract.test.ts:251` — only the ADMIN-only page reads `getCountSummary`, and the two guarded pages are exactly `/summary` and `/reopen`. |
| AC-23 | PASS | `stock-entry-approve.spec.ts:171` — the staff render of a `SUBMITTED` and an `APPROVED` count: status label, `signed-by`, `approved-by`, the inline `<svg>`, no input/select/textarea, no `€`, no `No price`, no `count-total`; then **`adminMain` with the one `/summary` link removed compared with `staffMain` and equal**. |
| AC-24 | PASS | `src/lib/money.test.ts` — every figure the criterion quotes, including `roundHalfUp("2.675", 2) === "2.68"` asserted both ways, plus the scan for `Number(`/`parseFloat`/`toFixed`/`Math.round` and the pin to exactly the multiplications between `bigint`s. `entry-submit-contract.test.ts:162` — the same scan over the three files AC-24 names by path. `money.ts` still names `unitPrice` nowhere. |
| AC-25 | PASS | `count-summary-service.db.test.ts:188` — the five `lineValue`s and `countTotal === "8896.637232378368"` as literals; `:207` — `0.02` vs `0.03`, the service returning the former. `stock-entry-approve.spec.ts:105` — every rendered figure compared with the service's own value through `formatPriceExact(roundHalfUp(v, 2))`. `count-lifecycle-service.db.test.ts:1010` — no column holds a total. |
| AC-26 | PASS | `project-contract.test.ts:167` (eleven, with `toHaveLength(11)` added), `:235` (`toEqual(LIFECYCLE_MODULES)`), `:246` (`signatureSvg` → an exact list of **one**, subset-checked). `stock-entry-contract.test.ts:293, 332, 351, 410, 445, 467`; `count-entry-contract.test.ts:236, 523, 535, 576, 586`. `entry-submit-contract.test.ts:184` — `src/app/stock-entry/**` and `src/components/stock-entry/**` at **zero** for the snapshot column. Every exemption is a literal file list; none is a directory. I re-ran all four files: 86 passed. |
| AC-27 | PASS | `stock-entry-approve.spec.ts:378` — cookie `role=ADMIN` + header `x-user-role` + `?role=ADMIN` + four forged fields, the Server Action reference captured from an ADMIN render, and the POST **read back off the wire** (`expect(posted).toContain(admin.id)`) before asserting `status === "SUBMITTED"`, `approvedById === null`, `notes` unchanged, `signedById` still the staff user's. |
| AC-28 | PASS | `count-lifecycle-service.db.test.ts:949` — eight provoked failures × fifteen forbidden strings. `:999` — `throw new` is exactly `{ConflictError, NotFoundError, ValidationError}`. `stock-entry-submit.spec.ts:249` — the rendered HTML against nine Prisma/Postgres strings. `src/app/api/error-response.ts` unmodified. (One substitution in the list of eight; see Observation 6.) |
| AC-29 | PASS | `count-messages.test.ts` (#9's `describe`) single-sources every quoted literal; `entry-submit-contract.test.ts:201` — the three screens spell no literal of their own. States: `/submit` blocked/ready/away/empty/missing/no-JS (`stock-entry-submit.spec.ts:249, 327, 363`), `/summary` submitted/approved/all-unpriced/missing (`stock-entry-approve.spec.ts:105, 171`; `count-summary-service.db.test.ts:270`), `/reopen` reopenable/draft/missing-reason (`stock-entry-approve.spec.ts:310`). **The rejected submission keeps the drawing**, read back off the hidden field at `stock-entry-submit.spec.ts:291`. `lint-fence.test.ts` unmodified and green. |
| AC-30 | PASS | `git status --porcelain -- prisma Samples src/server/test-db.ts` **empty**, verified by me. `TRUNCATED_TABLES` unchanged, 020 AC-4 green in the gate. No migration, no new table. |
| AC-31 | PASS | `count-summary-service.test.ts` runs inside `test:unit` with no database (my run: 614 passed). `stock-entry-contract.test.ts` — seven `force-dynamic` pages. `entry-submit-contract.test.ts:224` — the components import from `src/server` exactly what #8's exception permits (in fact: **nothing**). `docs/architecture.md` is unmodified, as AC-31 requires. The unresolvable-host `init` run was not performed by anyone this session (Observation 7). |
| AC-32 | PASS | `playwright.config.ts` byte-identical (`git status` clean). `RESERVED_YEAR` 2098/2099/2100 with the "2100 is the last" note at `tests/e2e/support/stock-entry.ts:41`. Each new spec's `afterAll` asserts `realCountIds()` and `seededMasterCounts()` unchanged (`stock-entry-approve.spec.ts:67`). Gate: 133 e2e, 0 flaky at `retries: 0` — **one** full run reported to me, not two (Observation 7). |
| AC-33 | PASS | **Fourteen is correct, and I re-derived it rather than trusting it.** Intersecting `git diff -U0 c0d3e37` with each `it()` range gives 4 + 12 + 6 = 22 candidates; four are **new** `it()`s (`project:246`, `stock-entry:351`, `stock-entry:445`, `count-entry:523`) and four are false positives where the changed lines are module-level consts sitting between tests (`project:95`←`LIFECYCLE_MODULES`, `stock-entry:123`←`EXPORTED_ACTIONS`, `stock-entry:373`←`MUTATION_EXEMPT`, `count-entry:449`←`SUMMARY_SURFACE`/`PERMITTED`). 22 − 4 − 4 = **14**, split 2 + 8 + 4 exactly as § 3 claims. The stated counting rule is mechanical and reproducible, and the two double-counts it identifies ((f)=(j), (h)=(m)) are real. |
| AC-34 | PASS | Eleven transcripts, of which I re-ran **five** from byte copies taken before each edit: M1 (`'77.77'` vs `'9.83'` + the scan), M2 (`'9.99'` vs `'7.25'`, 1 of 4), M3 (2 failed / 1 passed, the `0` case correctly green), M4 (4 of 4), M5 (2 of 3), and **M7 in full** (see below). Every one reproduced exactly as reported, including the counts of what stayed green. Two findings reported rather than patched, which is what AC-34 asks for. Tree restored: `sha256sum` matches on all five files I copied, and `git status --porcelain` is the same 43 entries. |

---

## The coordinator's Priority 1 questions, answered

### M7 — reproduced, and my ruling: **#9's coverage is sufficient; #8's suite does not need the assertion, but the route does (B1)**

Reproduced exactly. With `src/server/counts/count-entry-service.ts:117` changed to
`if (count.status === "SUBMITTED") throw new ConflictError(COUNT_READ_ONLY);`:

```
npm run test:db -- src/server/counts/count-entry-service.db.test.ts   ->  30 passed   (exit 0)
npm run test:db -- …/count-lifecycle-service.db.test.ts -t "AC-17"    ->  1 failed | 2 passed
    FAIL  AC-17: four writes are refused against an APPROVED count and the row does not move
    AssertionError: expected { …(5) } to be an instance of ConflictError
```

`grep -c APPROVED src/server/counts/count-entry-service.db.test.ts` → **0**, confirmed.

The ruling:

1. **#9's coverage of the criterion it owns is sufficient.** AC-17 is #9's criterion, and the
   spec is explicit about where the assertion belongs: *"#9 re-asserts it against an `APPROVED`
   count (AC-17) rather than re-spelling it, so 008 AC-9 and its scan pass unmodified"* and
   *"`count-entry-service.ts` is byte-identical after this feature"*. Adding a case to #8's db
   suite would be #9 editing a shipped file that AC-33 lists as passing unmodified, for a
   guarantee #9 already asserts. **The implementer was right not to add it**, and right to
   report it.
2. **The observation is real and belongs in the record, not in a patch.** The guarantee lives
   in another feature's file; if #8's service is ever refactored on its own, its suite will not
   notice. That is a note for whoever next touches `count-entry-service.ts`, and I have written
   it up as Observation 1 rather than as a required change.
3. **What M7 does expose as a required change is one layer out.** The same status-specific hole
   exists at the **route**, where nothing at all covers `APPROVED` — and unlike the service
   case, AC-17 names that refusal explicitly. That is B1, and it is required change 1.

### M11b — my ruling: **the amendment does not hold as worded. The assertion is true; the justification is not.**

Verified at the source. `src/components/stock-entry/ValuedLines.tsx:43` holds the only `€` in
either exempt file, inside the block comment (*"…is tagged `No price` and valued at `€0.00`"*);
`src/app/stock-entry/counts/[id]/summary/page.tsx` holds **no `€` character at all**, because
the symbol comes from `formatPriceExact` in `src/lib/money.ts`. Three separate problems, and
the implementer found two of them:

1. **It cannot fail independently.** `tests/unit/count-entry-contract.test.ts:586–600`: the
   `carriers ⊆ SUMMARY_SURFACE` clause runs *after* the per-file loop over the same file set,
   so any euro in a scanned non-exempt file is caught by the loop first. The clause is a
   restatement, not an additional claim.
2. **Its only live content is comment-anchored.** `expect(carriers).toContain(".../ValuedLines.tsx")`
   is satisfied by a doc comment. If `ValuedLines` stopped rendering money tomorrow and kept
   its comment, the clause would stay green — which is what M11b's transcript showed.
3. **And one the report did not catch:** the amendment says *"Before: 'no file in these **two**
   trees carries a euro.' After: '…across all **four** scanned trees'"*. The diff shows
   `const SCANNED = [SERVICE, "src/app/api/counts", ...SCREEN_TREES]` is **unchanged** — the
   scan already covered all four trees before the amendment. The surface did not grow.

So, plainly: **AC-33(n)'s letter is satisfied** — the scan does assert "no file outside these
two carries a euro", which is what "those two are the only files … carrying a euro" means — but
the amendment's characterisation of it as *"a stronger claim about a larger surface"* is wrong
on both counts. The net change to that `it()` is a narrowing (two files exempted) plus a
redundant clause plus one comment-anchored non-vacuity check. It is **not** stricter than what
it replaced.

Does it need fixing? **Not as a condition of this feature**, because the guarantee it was meant
to carry is genuinely carried elsewhere and I verified each of those:
`count-entry-contract.test.ts:523` (which demands `count-total` in the page and
`formatPriceExact` in the component — that is the assertion actually anchoring the rendering),
`stock-entry-approve.spec.ts:105` (the euro in exactly one of four routes, at the browser), and
AC-21/AC-22's key walks. My recommendation, non-blocking, is in Recommendations R1 — and the
**spec text** should be corrected by the coordinator, since it is the spec, not the test, that
makes a claim that is not true.

---

## The seven mutations (Priority 2)

| # | Guarantee | Re-run by me | Result |
|---|-----------|--------------|--------|
| 1a | Snapshot taken today, not on `countDate` | **yes** | `AC-11: a price effective exactly on countDate wins` → `expected '9.99' to be '7.25'`; 1 failed, 3 passed, as reported |
| 1b | Snapshot rewritten on re-submit | **yes** | 2 of 2 AC-19 red: `expected '77.77' to be '9.83'` **and** the WHERE-clause scan, independently |
| 2 | `null` accepted at submit | **yes** | 2 failed, 1 passed — and the one that stayed green is "a line holding 0 does NOT block", which is the half that must not move |
| 3a | Empty signature accepted | **yes** | 4 of 4 AC-6 red |
| 3b | Signature surviving a reopen | **yes** | 2 of 3 AC-18 red: `expected 'M 10 10 L 20 20 …' to be null` |
| 4 | The warning dropped, the arithmetic kept | no (transcript accepted) | Reported 3 of 17 red in `count-summary-service.db.test.ts`, every arithmetic assertion staying green — the shape of that result is exactly right, and the three tests it names exist at `:228`, `:253`, `:270` |
| 5 | An approved count still editable | **yes** | See M7 above |
| 6 | Staff able to approve | no (transcript accepted) | The test it names exists at `count-lifecycle-service.db.test.ts:580` and asserts `ForbiddenError`, the pinned sentence, and an unchanged row |
| 7 | A euro on a shared surface | no (transcript accepted) | M10's shape-level half is the important one and its two failure messages quote `assertNoMoneyKeys`; M11/M11b judged above |

Every mutation I ran reproduced the reported failure, the reported count of failures, **and**
the reported set of tests that stayed green. That last part is what makes these transcripts
trustworthy rather than decorative.

---

## Priority 4 — the mapper rule

Both instances are real and both are implemented as described:

- **`unitPriceSnapshot` → `unitAmount`.** `summaryRows` at `count-summary-service.ts` (the file
  AC-26 permits to name the column), `SummaryRow` declared in `src/types/stock-count.ts`.
  Verified: `grep -rn "unitPriceSnapshot" src/app/stock-entry src/components/stock-entry`
  returns **nothing**, and 006 AC-31's screen half is unmodified at the three item-master files.
- **`submittedAt` / `approvedAt` → `lifecycleSentences()`.** `CountRecord.tsx:35` reads
  `said.signed`, `said.approved`, `said.samePerson`, `said.reopened` and
  `lifecycle.signaturePath` — no instant, no status string. Verified:
  `grep -rn "SUBMITTED\|APPROVED\|submittedAt\|approvedAt\|signatureSvg" src/app/stock-entry
  src/components/stock-entry` returns **nothing**.

**A third instance exists, and neither phase named it — but it could not have been answered by
a mapper.** `SummaryRow` keeps `lineValue` and `noPrice`, both of which match 008 AC-18's
`/price|value|total|amount/i` and both of which are read by `ValuedLines.tsx:73, 89`. They
cross on a scan **exemption**, not a mapper. That is unavoidable: AC-24 names
`src/components/stock-entry/ValuedLines.tsx` **by path** as a file that renders money, so the
file must be exempt whatever its props are called. The rule therefore needs one clause it does
not currently have:

> When a shape's key is a forbidden string, the boundary is crossed by a mapper in the service
> — **unless the screen is itself the far side of the boundary**, in which case the exemption is
> the point and the mapper would only disguise it.

That is a note for the coordinator's rule, not a defect in this feature. Recorded as
Observation 2.

---

## Priority 5 — the money boundary, by surface

| Surface | Required | Verified |
|---|---|---|
| `getCount` (admin) | exactly `itemsWithoutPrice` | `count-summary-service.db.test.ts:322` — `toEqual(["itemsWithoutPrice"])`, so 007 AC-17 is genuinely unmodified |
| `getCountForSubmit` (admin) | exactly `{itemsWithoutPrice, linesWithoutPrice}` | `:328` — as a `Set` **and** `toHaveLength(2)` |
| `getCountSummary` (admin) | exactly the six | `:360` — as a `Set`, so a seventh turns it red |
| any surface, staff | zero at any depth | `:302`, non-vacuous (it seeds an uncounted line and proves the walk descended) |
| `/summary` for staff | 307, no page content | `stock-entry-submit.spec.ts:155–161` — status on the raw response, `location` exact, and the **body** checked for `€`, `Approve this count`, `Reopen this count` |
| self-approval | permitted **and recorded** | `count-lifecycle-service.db.test.ts:685` (`approvedById === signedById`, `signedAndApprovedBySamePerson === true`); `stock-entry-approve.spec.ts:269` |
| staff refused at the **service** | not only the route | `count-lifecycle-service.db.test.ts:580`, no browser involved; mutation M6 turns it red |
| signing needs JS and says so | everything else does not | `stock-entry-submit.spec.ts:363`; `stock-entry-approve.spec.ts:491` |
| no `loading.tsx` | at or above `src/app/stock-entry/` | `find src/app -name loading.tsx` → only `src/app/(public)/loading.tsx`, which is a sibling route group and is separately pinned unchanged at `stock-entry-contract.test.ts:100` |
| `prisma/` byte-identical | 020 AC-4 stays green | `git status --porcelain -- prisma Samples` empty |

The one hole in this table is B2 — the `APPROVED` state at the browser.

---

## Checkpoints

**C1 — Process**
- C1.1 [x] One feature. The diff against `c0d3e37` touches only #9's files plus the ratified
  spec/`feature_list.json` AC-33 text and `progress/`.
- C1.2 [x] `specs/features/009-entry_submit.md`.
- C1.3 [ ] ← **AC-17 and AC-21 each have an enumerated clause with no test.** See B1, B2.
- C1.4 [x] `feature_list.json`'s `acceptance[]` AC-33 entry matches the amended spec text
  verbatim; `status` is still `in_progress`. (The file *is* modified — only that one string —
  which contradicts the report's "`feature_list.json` was not touched by any session"; it is the
  coordinator's ratification edit, not a status change. Observation 8.)
- C1.5 [x] `progress/impl_entry_submit.md`, 1234 lines, three phases, files listed.

**C2 — Verification**
- C2.1 [x] `init exit=0`, 875 s, `[OK] Environment ready`, database checks **executed**
  (coordinator's run; I was instructed not to repeat it). The transcript is not yet pasted into
  `progress/current.md`, whose `## Verification` block still shows the #8-era run (501 unit /
  117 e2e) under a `<!-- Paste the closing run here -->` comment.
- C2.2 [x] `npm run typecheck` → exit 0 (my run).
- C2.3 [x] `npm run lint` → exit 0 (my run).
- C2.4 [x] Every new service function has a success and a failure test: `submitCount`,
  `approveCount`, `reopenCount`, `getLifecycleFacts`, `getCountForSubmit`, `getCountSummary`.
  `summaryRows` is a pure projection with no failure mode, covered by `stock-entry-approve.spec.ts:105`
  end to end and by `entry-submit-contract.test.ts:193`.
- C2.5 [x] Real values throughout: literal strings (`"8896.637232378368"`, `"7.25"`, `"77.77"`),
  full-row deep equality, `Set` equality on key walks — not "no exception was thrown".
- C2.6 [x] Real Postgres in every `*.db.test.ts`, real browser in every spec. Nothing mocked
  except `console.warn` for the `logWarn` spy and `vi.fn` thunks in the no-database AC-22 test.

**C3 — Architecture**
- C3.1 [x] No `PrismaClient` outside `src/server/` (`grep` clean). No component imports from
  `@/server/**` at all.
- C3.2 [x] `src/server/counts/` holds the aggregate; the two new services are one writer and one
  reader.
- C3.3 [x] n/a — no Excel builder in this feature.
- C3.4 [x] One direction only: `count-summary-service` → `count-lifecycle-service`, never the
  reverse (`pricesInForceOn`, `getLifecycleFacts`).
- C3.5 [x] No schema change, so no migration needed; `prisma/` byte-identical.

**C4 — Domain integrity**
- C4.1 [x] `countTotal`/`lineValue` derived on read; `count-lifecycle-service.db.test.ts:1010`
  asserts no column holds a total.
- C4.2 [ ] ← **not fully proved.** The service-level walks are exact and green, but AC-21's
  browser clause omits the `APPROVED` state (B2). I am not claiming a leak exists — I am
  recording that the enumerated proof is incomplete.
- C4.3 [x] Unchanged from #4; `columns.db.test.ts` green in the gate.
- C4.4 [x] `parseSignaturePath` before any write (M4 red), `signatureSvg: null` on reopen
  (M5 red).
- C4.5 [x] `where: { …, unitPriceSnapshot: null }` — M1 red behaviourally *and* by scan.
- C4.6 [ ] ← **four of the five enumerated refusals are proved.** The endpoint refusal against
  an `APPROVED` count is not (B1).
- C4.7 [x] `6.11764706` and `21.6128` round-trip exactly; no `Number(` anywhere on the path.
- C4.8 [x] `git status --porcelain -- Samples` empty.

**C5 — Conventions**
- C5.1 [x] Names follow `docs/conventions.md`; `src/lib/` for pure modules, so no new
  dependency exception was needed and `docs/architecture.md` is unmodified.
- C5.2 [x] `throw new` in the lifecycle service is exactly
  `{ConflictError, NotFoundError, ValidationError}`, asserted at `count-lifecycle-service.db.test.ts:999`.
- C5.3 [x] No `console.log` in `src/` (only the ban's own explanation in `src/lib/log.ts`).
- C5.4 [x] No `TODO` anywhere in `src/`.
- C5.5 [x] No secret or connection string in the diff.

**C6 — Session hygiene**
- C6.1 [x] `progress/current.md` was kept during the work — though see C2.1: the closing gate
  output has not been pasted into it.
- C6.2 [x] No scratch files. The `ac3-probe.txt` / `zz-ac3-probe.spec.ts` pair visible in the
  session-start snapshot is gone; `git status` is 43 entries and every one is accounted for.
- C6.3 [x] `#9` is `in_progress`, as it should be until the user signs off.

**C7 — Advisory**
- C7.1 [x] Empty, loading and error states exist for all three screens (AC-29's thirteen).
- C7.2 [x] 390 px and 320 px both asserted, including the drag-does-not-scroll case.
- C7.3 [x] Every figure through `formatPriceExact(roundHalfUp(v, 2))`, with the
  column-may-not-add-to-the-total cost stated on the screen's own comment and in the spec.

---

## Required changes

1. **`src/server/counts/count-lifecycle-service.db.test.ts:717` (or
   `src/app/api/counts/[id]/lines/route.db.test.ts`) — add the fifth refusal AC-17 enumerates:
   `POST /api/counts/<id>/lines` against an `APPROVED` count must return `409` with
   `error === "This count has been submitted and can no longer be edited."`,** and the count's
   full row must still compare equal afterwards. Today the only route-level 409 test runs through
   `markPastDraft`, which is `SUBMITTED` (`tests/support/count-fixture.ts:25`), so the endpoint's
   guard has **zero** coverage for the status this feature invented. Rename the test once it
   covers five, since its current name ("four writes") is accurate and will stop being so.
   *Do not reach for `markPastDraft` — it would have to become a parameter, and that is a #8
   fixture file. Approving the count through `approveCount` is the honest route.*

2. **`tests/e2e/stock-entry-submit.spec.ts:411` — add the `APPROVED` count to AC-21's loop.**
   The criterion names three states and the loop covers two. Approve `submitted.countId` in the
   fixture (or add a third count) and let the existing three-URL × two-role walk run over it, so
   that `/submit` on an approved count is checked for `€`, `No price`, `unitPrice` and a real
   price value for **both** roles — which is currently checked for neither.

Nothing else. Both are additive: no shipping file needs to change, and no shipped assertion
moves, so AC-33's count of fourteen is unaffected by either.

---

## Recommendations (not blocking)

- **R1 — `tests/unit/count-entry-contract.test.ts:592–600.** Move the `carriers` block into the
  sibling `it("009 AC-22: the exempt surface is exactly two files, and both really exist")` at
  `:523`, where the non-vacuity anchors are already `count-total` and `formatPriceExact` —
  things that are load-bearing for rendering — and drop
  `expect(carriers).toContain(".../ValuedLines.tsx")`, which a doc comment satisfies. That
  makes the claim self-evident instead of requiring a paragraph of explanation, and it removes
  the clause that cannot fail on its own. **The spec's second post-approval amendment should
  also be corrected**: the scanned surface did not grow from two trees to four (`SCANNED` is
  unchanged in the diff), and only one of the two exempt files contains a `€` at all.
- **R2 — `tests/unit/stock-entry-contract.test.ts:82`.** The "no `loading.tsx` at or above
  `src/app/stock-entry/`" list is `[src/app, src/app/stock-entry, src/app/stock-entry/new,
  src/app/stock-entry/counts]`. It does **not** include `src/app/stock-entry/counts/[id]`,
  which is now a parent of three routes whose 307s AC-1 asserts. A `loading.tsx` dropped there
  would degrade `/summary`'s and `/reopen`'s refusals into 200s and nothing would notice. One
  more entry in the array.

---

## Observations (non-blocking)

1. **M7's real content, restated for the record.** Invariant 3 at the entry **service** is
   carried by exactly one test in the repository and it belongs to #9
   (`count-lifecycle-service.db.test.ts:717`). #8's 30-test suite contains the string `APPROVED`
   zero times. That is the spec's own design and I am not asking for it to change — but anyone
   who later refactors `count-entry-service.ts` and runs only its own suite will get a false
   green. Worth a line in `docs/conventions.md` or in #8's file header.
2. **The mapper rule needs its exception clause** — see Priority 4 above. `SummaryRow.lineValue`
   and `noPrice` cross into a component on a scan exemption, not a mapper, because AC-24 names
   that component by path. The rule as written in the spec's third amendment reads as absolute
   and is not.
3. **AC-11's margin is one test, not four**, exactly as the report says: only
   `count-lifecycle-service.db.test.ts:354` distinguishes "the price on `countDate`" from "the
   price today". The other three AC-11 tests use fixtures whose price is the same on both days.
   One exact-value assertion is enough to make the guarantee real, but a second fixture with a
   moving price would cost nothing.
4. **`getCountSummary` on a `DRAFT` values at today's-equivalent prices** (Deviation 3). The
   rule — past `DRAFT` the stored snapshot and nothing else; while `DRAFT` what submitting now
   would write — is in one helper (`priceByItem`) and the fallback is unreachable once a
   snapshot exists. That is the right answer to a question the spec left open, and it is
   asserted at `count-summary-service.db.test.ts:284`.
5. **AC-13's constraint helper does not exist** (Deviation 9): the two `ALTER TABLE` statements
   are declared in the db test itself, as 008's `tmp_ac8_quantity_check` is, and
   `src/server/test-db.ts` is byte-identical. The criterion's substance — the rollback — is
   fully proved. Accepted; the helper is #20's to add, not #9's.
6. **AC-28's seventh provoked failure is a substitution.** The criterion names "a reopen with
   no reason"; `count-lifecycle-service.db.test.ts:949` provokes "a reopen of a count that is
   already a draft" instead. The substitution is forced — `reopenCount` takes an already-parsed
   reason, so the empty-reason failure happens at the action, not the service — and the real
   case is proved at `submit-input.test.ts:62` and rendered at `stock-entry-approve.spec.ts:327`.
   No action needed; noting it so the count of eight is not taken as literal.
7. **Two gate items are the coordinator's and were reported to me rather than observed.**
   AC-32 asks for **two** consecutive full `npm run test:e2e` runs at `retries: 0`; one was
   reported. AC-31 asks for an `init` run against an unresolvable database host ending
   `[OK] Environment ready (database checks skipped)`; no session ran it. Neither is the
   implementer's to fix, and neither changes my verdict.
8. **`feature_list.json` is modified**, contrary to the report's claim that no session touched
   it. The change is the AC-33 string only, matching the ratified spec amendment byte for byte;
   `status` is still `in_progress`. Harmless, and correct — but the report should say so.
9. **Quality worth naming.** The refusal-order comment in `count-lifecycle-service.ts`, the
   `signedAt: at` note about two clock reads, the `sortOrder: Number.MAX_SAFE_INTEGER` for an
   unassigned link, the non-vacuity assertion attached to *every* exemption, and the decision to
   report M7 and M11b rather than patch them — this is the standard the rest of the project
   should be held to. The two required changes are small precisely because everything around
   them is thorough.

---

## Restoration

Seven `npm run test:db` runs, one at a time; no `run-db-tests.mjs` was in flight when I
started (checked via `Get-CimInstance Win32_Process`). Every mutated file was copied to the
scratchpad **before** its first edit and restored from that copy:

```
src/server/counts/count-lifecycle-service.ts   64e16016…f502c64d   cmp OK
src/server/counts/count-entry-service.ts       d2a47984…cfcf71ad   cmp OK
src/server/counts/count-summary-service.ts     7f74d608…1946b6d8   cmp OK   (not mutated)
src/components/stock-entry/ValuedLines.tsx     09ec779b…c081aa55   cmp OK   (not mutated)
tests/unit/count-entry-contract.test.ts        b3acc699…618eff32   cmp OK   (not mutated)

git status --porcelain   ->  43 entries, exactly as found
npm run test:unit        ->  614 passed (43 files)
npm run typecheck / lint ->  exit 0 / exit 0
```

The first four hashes match the ones `progress/impl_entry_submit.md` § 1 recorded after Phase
C, which independently confirms the implementer's own restoration claim. No code, spec or
`feature_list.json` was edited by this review.

---

## Second pass — 2026-09-12

**Verdict:** APPROVED
**init:** green — the coordinator's closing run, `init exit=0`, 756 s, `[OK] Environment
ready`, database checks **executed**, 133 e2e, zero flaky. Not re-run here, on instruction.
**My own runs this pass:** `npm run typecheck` exit 0, `npm run lint` exit 0,
`npm run test:unit` **614 passed / 43 files**,
`npm run test:db -- count-lifecycle-service.db.test.ts` **38 passed**, and four mutations of my
own, one at a time, `tasklist` checked first — nothing was in flight.

**The diff since my first pass is what the coordinator says it is**, and I checked rather than
took it: `find … -newermt` lists exactly `count-lifecycle-service.db.test.ts`,
`tests/e2e/stock-entry-submit.spec.ts`, `tests/e2e/support/stock-entry.ts`,
`tests/unit/stock-entry-contract.test.ts`, `tests/unit/count-entry-contract.test.ts`, the spec
and the two `progress/` files. Two shipping files also show fresh mtimes —
`src/server/counts/count-entry-service.ts` and `src/app/stock-entry/counts/[id]/page.tsx` —
and both are **byte-identical** to their Phase C hashes (`d2a47984…cfcf71ad`,
`f280db9e…1ffe4a20`), which is the mutate-and-restore cycle showing through the filesystem and
not a change. **No shipping file moved in Phase D.**

---

## B1 — closed, and the mutation question answered

The fifth refusal is at `src/server/counts/count-lifecycle-service.db.test.ts:779-787`, inside
the renamed **"AC-17: all five writes are refused against an `APPROVED` count and the row does
not move"**, between refusal 1 and refusal 3, so the single before/after row comparison at
`:804` still spans all five — which is the clause that forced the placement. It goes through
the real handler (`postLines`, `:83`), a real `Request` with a real JSON body, real
`requireUser`, real `saveQuantities`, real Postgres; only `auth()` is mocked, exactly as
`route.db.test.ts:40` mocks it. `markPastDraft` is correctly **not** used, and the header
comment says why.

### M12b reproduced

Byte copies of both files taken first (`count-entry-service.ts` `d2a47984…`,
`count-lifecycle-service.db.test.ts` `b951c76c…2a6c8bbb` — the same hash the report records, so
the file I mutated is the file the report mutated). Guard loosened to `status === "SUBMITTED"`,
refusal 1's two `expect`s replaced by `void edit;`:

```
npm run test:db -- src/server/counts/count-lifecycle-service.db.test.ts -t "all five writes"

FAIL … > AC-17: all five writes are refused against an APPROVED count and the row does not move
AssertionError: expected 200 to be 409 // Object.is equality
  Test Files  1 failed (1)
       Tests  1 failed | 37 skipped (38)
```

Identical to the transcript, down to the message.

### Is it the right proof? Yes — and there is a sharper one, which I ran

**The implementer's diagnosis is correct and it corrects my recommendation.** My suggested
mutation loosens a guard that refusals 1 and 2 *share*, and Vitest stops at the first failing
`expect`, so the red it produces is refusal 1's. I proposed evidence that could not have
distinguished the assertion under test from the one above it. M12b — void the earlier
assertion, re-run, watch the later one answer — is a legitimate and standard way to isolate
that, and it is the technique the situation calls for.

Its one weakness is that it needs the **test** edited, so what it proves is "assertion 2 is
sensitive to this defect", not "assertion 2 sees something assertion 1 cannot". The rationale
written into the test's own comment makes the stronger claim — *"what the service raises and
what a client is told are two different facts"* — so I proved the stronger claim directly.

### M14 (mine) — the defect that lives in the route and nowhere else

`src/app/api/counts/[id]/lines/route.ts:67`, byte copy taken first (`6e79b760…b188712f3d`),
**no test edited, the service untouched**:

```
-    return errorResponse(error);
+    return NextResponse.json({ error: (error as Error).message }, { status: 200 });

npm run test:db -- src/server/counts/count-lifecycle-service.db.test.ts -t "all five writes"

FAIL … AssertionError: expected 200 to be 409 // Object.is equality
  Tests  1 failed | 37 skipped (38)
```

The failure is at `:786`, which is **after** refusal 1's two `expect`s — so refusal 1 passed:
the service still raised `ConflictError`, and the only thing wrong was what the client was
told. That is a defect refusal 1 is structurally incapable of seeing, caught by refusal 2
alone, with nothing but the route mutated. **The new assertion earns its place**, and the
comment that justifies it is now backed by a transcript rather than by an argument.

Restored: `route.ts` back to `6e79b760…`, the other two verified by `sha256sum -c`, and
`npm run test:db -- src/server/counts/count-lifecycle-service.db.test.ts` → **38 passed**.

**The wider point, since this is the second time in this feature.** M7 was an obvious mutation
that proved something *weaker* than it appeared (caught — but by another feature's criterion).
M12 was an obvious mutation that proved something *other* than it appeared (caught — but by the
assertion above the one under test). The common error is treating "the suite went red" as
identifying **which** assertion is load-bearing. The discipline that fixes it is cheap and
should be written down: **when a mutation is meant to prove a specific assertion, either
isolate that assertion (M12b) or choose a mutation only it can see (M14) — and record which of
the two you did.** A transcript that names the failing assertion's line number, as both of
these do, is what makes the difference checkable.

---

## B2 — closed, and wider than I asked

`tests/e2e/stock-entry-submit.spec.ts` now seeds a third count in month 9 of its reserved year,
fills it, submits it through `submitAs` and approves it through the new `approveAs`
(`tests/e2e/support/stock-entry.ts`, which goes through `approveCount` rather than a Prisma
`status` write — so `approvedById` and `approvedAt` are real and the screens render a state the
product can actually be in). The walk is now `[draft, submitted, approved]` × two roles × three
URLs = **18 fetches**, each asserting that `€`, `No price`, `unitPrice` and a real `unitPrice`
value from the database are all absent.

Two additions I did not ask for and that materially improve it:

- **the three states are asserted before the walk** (`lifecycleOf(...)` is `DRAFT`,
  `SUBMITTED`, `APPROVED`), so the new state cannot quietly stop being one;
- **every fetch must be `200`**, which closes the hole where a page that redirected or 404'd
  would satisfy a no-euro assertion vacuously. Eighteen real renders.

The `APPROVED` state is the one that mattered — it is the only state whose lines hold a
`unitPriceSnapshot` — and `/submit` on an approved count for both roles, which was checked for
neither, is now checked for both. **AC-21 → PASS.**

---

## R3 — the `loading.tsx` list, and my own probe

`tests/unit/stock-entry-contract.test.ts:82-104` gains `src/app/stock-entry/counts/[id]`, with
the reason in the comment. Reproduced M13 myself:

```
$ printf 'export default function Loading() { return null; }\n' > "src/app/stock-entry/counts/[id]/loading.tsx"
$ npx vitest run tests/unit/stock-entry-contract.test.ts -t "loading.tsx"
  FAIL  AC-3: no loading.tsx exists at or above src/app/stock-entry/
  AssertionError: src/app/stock-entry/counts/[id]/loading.tsx: expected true to be false
  Tests  1 failed | 1 passed | 25 skipped (27)
$ rm …   ->  git status back to 44 entries
```

Live, and the message names the offending path.

---

## R4 — the `carriers` claim, and my own probe

`tests/unit/count-entry-contract.test.ts:543-545`: the block now sits inside
`009 AC-22: the exempt surface is exactly two files, and both really exist`, whose anchors are
`count-total` in the page and `formatPriceExact` in the component — rendered output, not a doc
comment. `expect(carriers).toContain(".../ValuedLines.tsx")` is **dropped**, and
`AC-18: no euro sign is written anywhere on this surface` (`:599`) is one claim again.

Verified it can now fail on its own, which was the whole complaint — a `€` appended to
`src/app/stock-entry/counts/[id]/page.tsx` (byte copy taken first):

```
FAIL … > 009 AC-22: the exempt surface is exactly two files, and both really exist
AssertionError: src/app/stock-entry/counts/[id]/page.tsx: expected [ …(2) ] to include 'src/app/…/page.…'
  Tests  1 failed | 34 skipped (35)
```

File restored, `f280db9e…1ffe4a20`. **M11b is closed properly — fixed, not merely reported.**

### The corrected amendment

The spec's second post-approval amendment now reads, accurately: `SCANNED` is unchanged, only
**one** of the two exempt files contains a `€`, and the criterion went from *"none in these
trees"* to *"exactly these two files and no others in the same trees"* — *"the smallest change
that lets AC-24 and AC-25 hold"*. That is correct, it is attributed correctly, and it is
narrower rather than merely humbler: it now states what the assertion actually does, which is
what I was able to check. **Accepted.**

One nit, for the coordinator and not for this feature: **AC-33's own (n) clause still carries
the sentence the amendment disproves** — *"a **new** assertion that those two are the only
files in the four trees carrying a euro — so the criterion becomes stricter in the trees it
still governs rather than merely smaller."* The dated amendment overrides it and a reader who
gets that far is safe, but the criterion text and its amendment now say opposite things about
the same assertion.

---

## AC-33 → fifteen: the arithmetic, and the ruling

**Fifteen is right.** I re-derived it from the tree rather than from the report, the same way I
derived fourteen:

| File | Candidates | − new `it()` | − const-between-tests | Moved |
|---|---|---|---|---|
| `project-contract.test.ts` | 4 | 1 (`:246`) | 1 (`:95` ← `LIFECYCLE_MODULES`) | **2** |
| `stock-entry-contract.test.ts` | 13 | 2 (`:357`, `:451`) | 2 (`:129` ← `EXPORTED_ACTIONS`, `:379` ← `MUTATION_EXEMPT`) | **9** |
| `count-entry-contract.test.ts` | 6 | 1 (`:523`) | 1 (`:449` ← `SUMMARY_SURFACE`/`PERMITTED`) | **4** |

2 + 9 + 4 = **15**. `AC-3: no loading.tsx…` at `:82` is a pre-existing `it()` of #7's whose body
now differs — a `+`-only hunk inside the array — so it is the ninth in that file and the
fifteenth overall. R4 changes no count, correctly: the AC-18 euro test was already among the
fourteen, and `009 AC-22` is a **new** `it()`, which the rule counts separately.
`feature_list.json`'s `acceptance[]` carries the same **Fifteen** and the same `(o)`.

### The ruling — "do not write another AC-33" — I agree, with one correction and one addition

**Agreed on the diagnosis, without reservation.** A criterion whose subject is *other criteria*
has no mechanical check and no owner: every change anywhere in the feature can falsify it and
nothing recomputes it. Four values in four sittings is not carelessness, it is the shape of the
thing. And its failure mode is worse than being wrong — a stale count reads as a *completed*
reconciliation, which is exactly how B1 and B2 travelled three phases inside a report that said
AC-33 was satisfied.

**The correction.** The amendment says *"three separate contradictions surfaced because someone
had to reconcile a list."* Two did; the third did not, and the difference matters for choosing
the replacement.

| Contradiction | What actually surfaced it | Would the replacement shape have caught it? |
|---|---|---|
| Phase A — 007 AC-15 / 007 AC-5 / 008 AC-31 forbid exactly what AC-26 authorises | **The suite went red.** The implementer had to decide what to do, and therefore had to write it down | **Yes** — the red is unchanged, and "every changed `it()` is named in the report" forces the same write-up |
| Phase B — 008 AC-18 vs AC-24/AC-25 (the euro in the components tree) | **The suite went red**, same mechanism | **Yes**, same reason |
| Review — the fifteenth, `loading.tsx` at `counts/[id]` | **Nothing was red.** A reviewer compared a scan's *input list* with the new route tree | **No** — and neither would AC-33. Nothing catches an assertion that is *missing*; only reading a scan's inputs against the code does |

So: the number never caught anything. What caught things was (a) a red suite forcing a
decision, and (b) the requirement that every amended assertion be **named and justified**,
which is what made those decisions visible to a reviewer. The replacement keeps (b) and drops
the number. **That is the right trade**, and it would have caught two of the three; the third
was never AC-33's to catch and the ruling should not claim otherwise.

**The addition, which would make the replacement stronger than what it replaces.** *"Every
changed `it()` is named in the report"* is still checked by a human. It need not be: the
derivation I ran twice — intersect `git diff -U0 <base>` with each `it()`'s line range, then
subtract new blocks and module-level consts — is about twenty lines. As a test it would read
*"the set of pre-existing `it()` blocks whose bodies changed equals the list in this spec"*, and
it would go red the moment a fifteenth appeared, in the session that caused it, instead of three
phases later. That turns the reconciliation into something the suite does, which is the one
property AC-33 never had. The `it()`-range heuristic needs the const-between-tests subtraction
to be honest — four false positives across three files here — but § 3 of the implementation
report already documents that step precisely enough to encode it.

---

## The declined Observation 3 — accepted

The implementer declined a second moving-price fixture for AC-11, arguing that `'9.99'` vs
`'7.25'` (M2) already distinguishes *"the price on `countDate`"* from *"the price today"*, and
that a second fixture would be a second test of the **same** fact rather than a second fact.
**That is correct and the decline is properly argued.** My observation was about *margin* — one
test carrying a guarantee is one edit away from carrying none — which is a real but lesser
concern, and it is now written down in two places where the next person will meet it. It was an
observation, not a required change, and declining it with reasoning is exactly the right
response to one. No further action.

---

## The remaining criteria

Everything the first pass settled stands: the seven mutations (five re-run then, four more run
now), the mapper rule and both its instances, the money boundary by surface, and the criteria
table outside AC-17 and AC-21. Nothing in Phase D touches any of it — no shipping file moved,
and the unit count is unchanged at 614 because the four changes added assertions and a directory
string, not tests.

| AC | First pass | Now |
|----|-----------|-----|
| AC-17 | FAIL | **PASS** — five refusals at `count-lifecycle-service.db.test.ts:772-805`, the row and all 82 lines deeply equal after all five; proved load-bearing by M12b and by my M14 |
| AC-21 | PARTIAL | **PASS** — three states × two roles × three URLs in `stock-entry-submit.spec.ts`, each fetch asserted `200`, the three states asserted before the walk |
| AC-33 | PASS (fourteen) | **PASS (fifteen)** — re-derived above; spec and `feature_list.json` agree |

All 34 criteria pass.

---

## Checkpoints — the three that were open

- **C1.3 [x]** — every numbered criterion is now satisfied; AC-17 and AC-21 closed above.
- **C4.2 [x]** — no price, value or total in a `YARD_STAFF` response body: the service walks
  were already exact, and the browser walk now covers the `APPROVED` state, which is the only
  one whose lines hold a `unitPriceSnapshot`.
- **C4.6 [x]** — an approved `StockCount` is immutable: five enumerated refusals, at the service
  **and** at the endpoint, with the row read before and after all five.

Every other box stands as marked in the first pass. C2.1 remains satisfied by the coordinator's
run, and the transcript still is not pasted into `progress/current.md` — but the stale block is
now **labelled** as stale with the real figures beside it, which is the honest interim state and
better than a silent one.

---

## Observations from this pass (non-blocking)

1. **A test under `src/server/` now imports a route module from `src/app/`**
   (`count-lifecycle-service.db.test.ts:83`, `await import("@/app/api/counts/[id]/lines/route")`).
   `docs/architecture.md:75` says *"`src/server/` **never** imports from `src/app/` or
   `src/components/`"* with no qualifier, and this is the first such import in the repository
   (`grep` confirms: none elsewhere, shipping or test). It is a test, so nothing ships and no
   runtime dependency is inverted; the alternatives were editing a file AC-33 pins or breaking
   AC-17's single before/after comparison; and the reasoning is in the file's own header where
   the next reader meets it. **Accepted** — but `docs/architecture.md` should gain the qualifier
   it is missing ("shipping modules"; a test may import a handler in order to exercise it),
   because a rule stated absolutely and then quietly excepted is how the next exception gets
   taken without an argument. Coordinator's edit, not the implementer's.
2. **AC-33's (n) clause and its amendment now contradict each other** — see R4 above. One
   sentence to strike.
3. **Still open, and still the coordinator's:** AC-32's *second* consecutive full
   `npm run test:e2e` at `retries: 0`, the unresolvable-host `init` run AC-31 describes, and
   pasting the closing gate into `progress/current.md`. None is the implementer's, none is
   affected by Phase D, and none changes this verdict.
4. **The report's "The process lesson" is the most valuable paragraph in it**, and it
   generalises past this feature: *a deferral in one phase becomes a substitution in the next
   and a completed row in the one after*, because each phase reads the previous phase's summary
   rather than the criterion. Its two remedies — put an enumerated count in the test's **name**
   (which is literally how I found B1: the test said "four writes" and the criterion said five),
   and repeat an open deferral verbatim in every later Deviations section until it closes — are
   both cheap and both mechanical. They belong in `docs/verification.md`, not only in this
   report.

---

## Restoration

Four mutations this pass — M12b (two files), M14 (the route), M13 (a dropped `loading.tsx`) and
a `€` probe on `page.tsx` — each from a byte copy taken **before** the edit:

```
src/server/counts/count-entry-service.ts              d2a47984…cfcf71ad    sha256 -c OK
src/server/counts/count-lifecycle-service.db.test.ts  b951c76c…2a6c8bbb    sha256 -c OK
src/app/stock-entry/counts/[id]/page.tsx              f280db9e…1ffe4a20    sha256 -c OK
src/app/api/counts/[id]/lines/route.ts                6e79b760…b188712f3d  restored, hash checked
src/app/stock-entry/counts/[id]/loading.tsx           removed

git status --porcelain   ->  44 entries (the 43 found at the first pass, plus this review file)
npm run test:db -- …count-lifecycle-service.db.test.ts   ->  38 passed
npm run test:unit / typecheck / lint                      ->  614 passed / exit 0 / exit 0
```

No code, spec or `feature_list.json` was edited by either pass of this review. `#9` is left
`in_progress`; marking it done is the user's call.

**APPROVED.**
