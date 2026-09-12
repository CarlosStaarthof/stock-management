# Implementation — feature 9 `entry_submit`

**Spec:** `specs/features/009-entry_submit.md` (approved 2026-09-12, 34 criteria)
**Status:** complete — **Phase A** (the lifecycle service, the price snapshot, the money
shaping), **Phase B** (the three screens, the signature pad, the three server actions and the
e2e) and **Phase C** (AC-34's mutation proofs, the consolidated criteria map, the exact
assertion count and the mapper rule). Each phase is reported under its own heading below;
**Phase C also carries the single 34-row criteria table, in § 2.**

**#9 is not done.** Nothing in `feature_list.json` was changed by any of the three sessions;
#9 stays `in_progress` until the reviewer and then the user say otherwise.

## Files created

- `src/lib/count-lifecycle.ts` — `isDraft`, `isSubmitted`, `isApproved`, `canSubmit`,
  `canApprove`, `canReopen`. The reason no page has to name a status.
- `src/lib/count-lifecycle.test.ts` — the transition table as three exact filters.
- `src/lib/count-audit.ts` — `AUDIT_EVENTS`, `auditLine`, `appendAuditLine`,
  `parseAuditLines`, `latestAudit`. The trail is `StockCount.notes`, append-only.
- `src/lib/count-audit.test.ts` — round trips, the prefix property over three appends, and
  the rule that an unparseable line contributes nothing.
- `src/lib/signature-path.ts` — the grammar, the five constants, `parseSignaturePath`,
  `pointInViewBox`, `reducePoints`, `strokesToPath`.
- `src/lib/signature-path.test.ts` — 33 tests: every accepted shape and every one of the
  twelve refusals AC-5 names.
- `src/server/counts/submit-input.ts` — `parseSubmitCountInput`, `parseReopenReason`,
  `REOPEN_REASON_MAX_LENGTH`. Pure.
- `src/server/counts/submit-input.test.ts` — including the proof that a reason that passed
  cannot split its own audit line in two.
- `src/server/counts/count-lifecycle-service.ts` — `submitCount`, `approveCount`,
  `reopenCount`, `getLifecycleFacts`, `pricesInForceOn`. **The only writer.**
- `src/server/counts/count-lifecycle-service.db.test.ts` — 38 tests against real Postgres.
- `src/server/counts/count-summary-service.ts` — `getCountForSubmit`, `getCountSummary`,
  and the `ValuedLine` / `CountSummaryForAdmin` types. Read only.
- `src/server/counts/count-summary-service.db.test.ts` — 17 tests, including the three
  money-key walks as exact sets.
- `src/server/counts/count-summary-service.test.ts` — AC-22's spy-thunk half, with no
  database.

## Files modified

- `src/lib/money.ts` — gains `multiplyDecimal`, `sumDecimals`, `roundHalfUp`, all `bigint`
  string arithmetic. Still names the price column nowhere, and still holds no `Number(`.
- `src/lib/money.test.ts` — every figure AC-24 and AC-25 quote, plus the scan that pins the
  module to exactly two multiplications, both between `bigint`s.
- `src/lib/count-messages.ts` — every literal #9's criteria quote, plus `yardDayOf`, so
  `Signed by Jo Byrne on 1 September 2026.` is the yard's day and not the server's.
- `src/lib/count-messages.test.ts` — a `describe` block for #9's literals. No existing
  assertion changed.
- `src/lib/count-audit.ts` / `count-messages.ts` — neither names a database column, so
  `src/lib/**` stays at zero files naming `unitPrice` or `signatureSvg`.
- `src/types/stock-count.ts` — `AuditEvent`, `AuditEntry`, `CountLifecycleFacts`,
  `UncountedLine`, `SubmitReviewForStaff`, `SubmitReviewForAdmin`, `CountSummaryForStaff`,
  `SubmitCountInput`. `CountForStaff`, `CountForAdmin`, `CountLineRow` and
  `SaveQuantitiesResult` are **untouched**, which is why 007 AC-17 and 008 AC-17 pass
  unmodified.
- `tests/support/item-master-fixture.ts` — `makePricesBulk`, so an 82-line fixture costs one
  round trip instead of 82.
- `tests/unit/project-contract.test.ts`, `tests/unit/stock-entry-contract.test.ts`,
  `tests/unit/count-entry-contract.test.ts` — the permitted-module lists. **See
  "Deviations" — AC-33 says six assertions change; the tree needs nine.**

## The three things the coordinator flagged

**1. Which modules were added to the permitted lists, and why each one must name the
column.** Exactly two, as literals, never a directory:

| Module | Why it must name `unitPriceSnapshot` |
|---|---|
| `src/server/counts/count-lifecycle-service.ts` | It is the column's **first writer**. The snapshot write is `updateMany({ where: { …, unitPriceSnapshot: null }, data: { unitPriceSnapshot: price } })` — Invariant 2 as a WHERE clause, not as a comment, which is what makes a reopen and a re-submit safe. It also names `SUBMITTED`, `APPROVED`, `submittedAt`, `approvedAt` and `signatureSvg`, because it is the only module that performs a transition. |
| `src/server/counts/count-summary-service.ts` | It is the column's **first reader**: it values a line on it and declares `ValuedLine`, whose `unitPriceSnapshot` key AC-22 pins. The ADMIN summary is the one surface in this product that carries a euro, and it is a 307 for every staff session. |

`signatureSvg` is named by **one** file, `count-lifecycle-service.ts`, and the new assertion
is an exact list of one with a check that it is a subset of the two AC-26 permits. That is
stricter than AC-26's wording, not looser.

**2. Invariant 4 is in the shape, not only in the arithmetic.** A line whose item has no
price keeps `unitPriceSnapshot = null` — never `0` — and the summary gives it
`noPrice: true`, `lineValue: "0"` and an entry in `linesWithoutPrice` carrying its `itemId`
and `description`. `getCountForSubmit` gives an `ADMIN` the same list **before** the count
is submitted, so the warning names the same items on both sides of the submission
(`count-summary-service.db.test.ts` → "AC-12: Invariant 4 on the summary" and "AC-12: before
submission the ADMIN review names the same items").

**3. Invariant 10 is respected and its cost is asserted rather than hidden.**
`countTotal = sumDecimals(exact line values)`, rounded once by the caller.
`count-summary-service.db.test.ts` → "AC-25: the total is the sum of the EXACT lines, not
the sum of the rounded ones" seeds three lines of `0.005` and asserts the two answers
differ — `0.02` against `0.03` — and that the service returns the former.

## Phase A — acceptance criteria

Only the halves Phase A can prove. Every row's test is named; "Phase B" rows are listed
separately below.

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-2 | `count-lifecycle-service.ts:185,274,319,369` (`assertUser` / `assertRole` first), `count-summary-service.ts:230,290` | `count-lifecycle-service.db.test.ts` → "AC-2: all four lifecycle functions refuse a null actor"; `count-summary-service.db.test.ts` → "AC-2: a null actor is refused by each of them" |
| AC-3 | `count-lifecycle-service.ts:204` (the `quantity === null` count), `count-messages.ts` `uncountedBlocksSubmit` | `count-lifecycle-service.db.test.ts` → three tests, including "a line holding 0 does NOT block"; `count-messages.test.ts` → "AC-3: the block names the number" |
| AC-4 (service half) | `count-summary-service.ts` `getCountForSubmit` — two parameters, reads the whole count | `count-summary-service.db.test.ts` → "AC-4: every uncounted line is listed, in sheet order, never truncated" and "AC-4: it reads no query parameter" |
| AC-5 | `src/lib/signature-path.ts` | `signature-path.test.ts` → 33 tests |
| AC-6 (service half) | `count-lifecycle-service.ts:195` — `parseSignaturePath` before any write | `count-lifecycle-service.db.test.ts` → "AC-6: … is refused at the SERVICE and writes nothing" ×4 |
| AC-7 (storage half) | `count-lifecycle-service.ts` (`signatureSvg: signaturePath`), `getLifecycleFacts` (`signaturePath: row.signatureSvg`) | `count-lifecycle-service.db.test.ts` → "AC-7: what Postgres holds is exactly the string that was passed in", "AC-7: a long path with decimals survives" |
| AC-8 (reducer half) | `signature-path.ts` `reducePoints`, `strokesToPath` | `signature-path.test.ts` → "AC-8: 200 collinear points 0.5 units apart reduce to fewer than 60", "AC-8: the client cap keeps the server cap unreachable" |
| AC-11 | `count-lifecycle-service.ts` `pricesInForceOn` → `selectCurrentPrice` | `count-lifecycle-service.db.test.ts` → four tests, including "a price effective exactly on countDate wins" and "after submission the snapshot is inert" |
| AC-12 (service half) | `count-lifecycle-service.ts` (no entry ⇒ no write), `count-summary-service.ts` `linesWithoutPriceIn` | `count-lifecycle-service.db.test.ts` → "AC-12: three priceless items keep null"; `count-summary-service.db.test.ts` → two AC-12 tests |
| AC-13 | `count-lifecycle-service.ts` — one `$transaction`, `updateMany` compare-and-set, `claimed.count !== 1` | `count-lifecycle-service.db.test.ts` → "a failing snapshot write rolls the status write back with it", "two concurrent submissions produce one SUBMITTED row", "no lock and no version token" |
| AC-14 | `count-lifecycle-service.ts` `submitCount` | `count-lifecycle-service.db.test.ts` → "AC-14: eight columns move, and every other column of every row does not" |
| AC-15 (service half) | `assertUser` in `submitCount`, `assertRole(actor, "ADMIN")` in `approveCount` / `reopenCount` | `count-lifecycle-service.db.test.ts` → "staff may submit at either yard", "approve and reopen refuse a staff actor, and nothing moves" |
| AC-16 (service half) | `count-lifecycle-service.ts` `approveCount` | `count-lifecycle-service.db.test.ts` → five AC-16 tests, including self-approval and the concurrent race |
| AC-17 (service half) | `canSubmit` / `canApprove` branches; `count-entry-service.ts` **byte-identical** | `count-lifecycle-service.db.test.ts` → "AC-17: four writes are refused against an APPROVED count and the row does not move" |
| AC-18 (service half) | `reopenCount`, `parseReopenReason`, `logWarn("count.reopened", …)` | `count-lifecycle-service.db.test.ts` → three AC-18 tests; `submit-input.test.ts` → four `parseReopenReason` tests |
| AC-19 | the `unitPriceSnapshot: null` WHERE clause | `count-lifecycle-service.db.test.ts` → "all 82 survive the reopen; a new price does not move one, a first price fills one" and the source scan |
| AC-20 | `src/lib/count-audit.ts`, `appendAuditLine` at every transition | `count-audit.test.ts` → 13 tests; `count-lifecycle-service.db.test.ts` → "submit, approve, reopen, submit, approve leaves exactly five lines in order" |
| AC-21 (service half) | the split of `getCount` / `getCountForSubmit` / `getLifecycleFacts` | `count-summary-service.db.test.ts` → four AC-21 tests, all exact sets |
| AC-22 (service half) | `count-summary-service.ts` — the staff thunk throws, the admin thunk is never called | `count-summary-service.test.ts` (no database) + `count-summary-service.db.test.ts` → "the ADMIN summary's money keys are EXACTLY the six" |
| AC-24 | `src/lib/money.ts` | `money.test.ts` → 23 tests |
| AC-25 (service half) | `getCountSummary` | `count-summary-service.db.test.ts` → "five line values and one total, each asserted as a literal string" |
| AC-26 (a–e) | the three contract test files | `project-contract.test.ts` → three money-boundary tests; `stock-entry-contract.test.ts` → five |
| AC-28 (service half) | typed errors only, in both services | `count-lifecycle-service.db.test.ts` → "eight provoked failures carry this feature's own sentences", "the service throws only typed domain errors" |
| AC-29 (messages half) | `src/lib/count-messages.ts` | `count-messages.test.ts` → eight #9 tests; `lint-fence.test.ts` unchanged and green |
| AC-30 | nothing under `prisma/` was opened | `count-entry-contract.test.ts` → "prisma/ is byte-identical" (unmodified, green); `git status --porcelain -- prisma Samples` empty |
| AC-31 (partial) | no module opens a connection at import time | `count-summary-service.test.ts` → "getCountSummary refuses a staff actor before it reads anything" runs in `test:unit` with no database at all |

## What is left to Phase B (and Phase C)

Whole criteria, untouched, because every one of them is proved by a rendered DOM or a route:

- **AC-1** — the three routes, their guards and the two 307s.
- **AC-9** — the 390 px flow, the pad's box, the drag that does not scroll.
- **AC-10** — the no-JavaScript behaviour and `signature-needs-js`.
- **AC-23** — what a `YARD_STAFF` user sees after submitting, and the identical-markup
  comparison.
- **AC-27** — the forged `role`, header, cookie and form fields against real responses.
- **AC-32** — the e2e suite, `RESERVED_YEAR` 2098/2099/2100, two clean runs.
- **AC-33 (f)** — "each action obtains its actor with exactly one `requireUser()` call"
  expects **five** actions rather than two. That assertion lives in
  `tests/unit/stock-entry-contract.test.ts` and is **deliberately left at two**, because
  `src/app/stock-entry/actions.ts` still holds two actions. It turns red the moment Phase B
  adds the third.
- **AC-34** — the six mutation proofs. Phase C, per `progress/current.md`.

Browser halves of criteria Phase A completed at the service: AC-4 (the `uncounted-list` and
its anchors), AC-6 (the enabled button), AC-7 (the inline `<svg>`), AC-8 (the pad's three
listeners), AC-12 (`no-price`, `lines-without-price`), AC-15/AC-16/AC-18 (the rendered
sentences and the absent controls), AC-17 (the `409` from `POST /api/counts/<id>/lines`),
AC-20 (`audit-trail`), AC-21/AC-22 (the `€` on exactly one of four routes), AC-24 (the
`ValuedLines.tsx` half of the scan), AC-25 (`count-total`), AC-28 (the rendered HTML half),
AC-29 (the five screen states), AC-31 (`force-dynamic` on the three new pages).

## Verification output

I did **not** run `./init.ps1`, `bash ./init.sh` or `npm run test:e2e` — the coordinator
runs the gate. Targeted runs, all from a clean tree:

```
npm run typecheck                       ->  exit 0
npm run lint                            ->  exit 0   (eslint src tests --max-warnings 0)

npm run test:unit
     Test Files  42 passed (42)
          Tests  593 passed (593)          # 501 before this phase

npm run test:db
     Test Files  20 passed (20)
          Tests  333 passed (333)          # 316 before this phase
       Duration  407.94s
```

`git status --porcelain -- prisma Samples` is empty. No migration, no new table,
`TRUNCATED_TABLES` untouched — 020 AC-4 green in the run above.

## Deviations from the spec

**1. AC-33 says six shipped assertions change. The tree needs nine, and three of them AC-26
does not authorise.** This is the one thing in this report that needs a decision.

Authorised and applied, exactly as AC-26 words them:

| # | File | Change |
|---|---|---|
| a | `project-contract.test.ts` | the `unitPrice` list, nine files → **eleven** |
| b | `project-contract.test.ts` | `unitPriceSnapshot` "no shipping module" → **an exact two-file list** |
| c | `stock-entry-contract.test.ts` | 007 AC-25's status/column scan gains the exact two-file exemption |
| d | `stock-entry-contract.test.ts` | "the only files naming the forbidden strings are tests" gains the two files (and is now sorted, so the answer does not depend on what is committed) |
| e | `stock-entry-contract.test.ts` | `MUTATION_EXEMPT`, one file → **two**, with the exact four-operation Prisma set asserted |

Also added, because AC-26 requires them in terms: the `signatureSvg` parallel assertion
(`project-contract.test.ts`) and the assertion that the `src/app/stock-entry/**` half stays
at **zero** offenders (`stock-entry-contract.test.ts`).

**Not authorised by AC-26, and impossible to satisfy as written:**

| # | File | Assertion | Why it cannot pass unmodified |
|---|---|---|---|
| 1 | `stock-entry-contract.test.ts` | 007 AC-15 — "no shipping module in the feature names the price column", over `src/server/counts/**` | The spec's own Contract puts both new services in `src/server/counts/`, and AC-26 explicitly permits them to name `unitPriceSnapshot`. The sibling scan in `project-contract.test.ts` is amended by AC-26; this one is the same scan over a narrower tree and was simply not enumerated. |
| 2 | `count-entry-contract.test.ts` | 008 AC-31 — "nothing Phase A adds names a price column", over `src/server/counts/**` and `src/app/api/counts/**` | Same cause. **AC-33 names this file among those that "pass unmodified".** It cannot. |
| 3 | `stock-entry-contract.test.ts` | 007 AC-5 — "no file in the feature refers to the artefact #9 owns" (`/signature/i` over both trees) | #9 *is* the feature that owns the signature. Held at zero for #7's files; now an exact list of the two modules that own it (`count-lifecycle-service.ts`, `submit-input.ts`). Phase B will have to add its pad, its page and `actions.ts` to that list. |

Each of the three was amended in the same shape the repository has always used — an exact
list of **files**, with the reason written into the test's own comment — and each is a
three-line revert. I applied them rather than leaving the suite red, so the coordinator can
gate; **AC-33's own sentence says this is "a blocker to report … not a licence to edit it",
so the decision is the reviewer's and I am flagging it rather than burying it.** Nothing
about the feature's design depends on the outcome: if they are reverted, the two services
have to move out of `src/server/counts/`, which contradicts the Contract.

**2. `ValuedLine` and `CountSummaryForAdmin` live in `count-summary-service.ts`, not in
`src/types/stock-count.ts`.** The spec's prose ("New types, in modules that hold no
runtime") lists `CountSummaryForAdmin` under `src/types/`, but both types name
`unitPriceSnapshot`, and AC-26 pins that string to **exactly two files**, neither of which is
`src/types/stock-count.ts`. The criterion wins over the prose, and this is the layout #6
already used for `PriceRow` in `src/server/items/price-selection.ts`. `src/types/` gains the
seven money-free types. `CountSummaryForStaff` is declared there as `never`.

**3. `getCountSummary` on a `DRAFT` count values its lines at the prices in force on
`countDate`.** The spec does not say what `/summary` shows for a count that has not been
submitted (AC-29 lists submitted, approved, no-priced-lines and missing-id). Reading the
snapshot column alone would show an `ADMIN` a page of `No price` tags and a total of `€0.00`
for every draft. The rule implemented is one sentence, in one helper (`priceByItem`): **past
`DRAFT`, the stored snapshot and nothing else; while `DRAFT`, what submitting it now would
write** — the same `selectCurrentPrice` answer, from the same day. Invariant 2 is untouched,
because the fallback is unreachable the moment a snapshot exists.

**4. `submitCount`, `approveCount` and `reopenCount` return `CountLifecycleFacts`.** The
Contract does not pin a return type. Returning the freshly read facts costs one query on an
action that happens a few times a month and gives Phase B's actions something money-free to
redirect on. `getLifecycleFacts` is the same function the pages call.

**5. `pricesInForceOn` is exported from `count-lifecycle-service.ts` and used by
`count-summary-service.ts`.** One read, one definition, one direction of import (summary →
lifecycle, never the reverse). The alternative — a third module — is not in the Contract, and
duplicating the read is exactly what AC-11 forbids.

**6. The order of `submitCount`'s refusals** is actor → existence → status → signature →
uncounted lines. AC-3 and AC-6 each fix one of the last two and no criterion fixes their
order; putting existence and status first means a person who submits a count somebody else
already approved is told *that*, rather than that their signature is unreadable.

**7. AC-6 says a 6001-character path behaves like an empty one.** It raises
`ValidationError` on `signature` and writes nothing, as AC-6 requires, but with AC-5's own
`That signature is too long to store.` rather than `Draw your signature…`. The two criteria
would otherwise contradict each other.

**8. Tests appended to two existing test files.** `src/lib/money.test.ts` and
`src/lib/count-messages.test.ts` gain a `describe` block each. No assertion in either was
changed — the modules they cover are the single-sourced ones #9 extends, and a second test
file for the same module would be the drift those modules exist to prevent.

**9. AC-13's constraint helper does not exist.** The criterion says the `CHECK` goes
"behind the helper 007's reviewer asked for in `src/server/test-db.ts`". There is no such
helper in `src/server/test-db.ts` today, and adding one would edit a #20 file for a #9 test,
so the two `ALTER TABLE` statements are declared in the db test itself — exactly as 008's
`tmp_ac8_quantity_check` is. `src/server/test-db.ts` is byte-identical.

## Notes for the reviewer

**A hazard Phase B will hit, and the way out.** AC-26 claims "this feature's screens render
a price without naming the column, because the value crosses the boundary on a field the
shape declares". The field **is** `unitPriceSnapshot` (AC-22 pins it in the money-key set),
so any page or component that reads `line.unitPriceSnapshot` names the column and turns the
`src/app/**` / `src/components/**` half of 006 AC-31 red. The clean answer is a mapper
**inside `count-summary-service.ts`** (which may name it) that hands the component a row
whose key is, say, `amount` — a money-shaped name is fine on a component's props, which no
walk asserts; it is the *column* that is pinned. I did not write it, because an unused
export is dead code in Phase A.

**`getCountForSubmit` returns descriptions only for uncounted lines.** The review screen
needs no full line list — #8's screen already has one — so the money-key walk over it
descends into `uncounted[]` and `audit[]` and nothing else. The walk test seeds an uncounted
line deliberately, so it is not vacuous.

**The snapshot write is grouped by price**, one `updateMany` per distinct amount, which is
~30 statements for an 82-line Dublin sheet inside a 20 s transaction. A single raw
`UPDATE … FROM (VALUES …)` would be one statement, but it would break AC-26's exact
four-operation Prisma set and put SQL in a service. If the reviewer prefers the raw form,
that criterion has to move first.

**The two contract-scan helpers now strip comments** (`codeOf`) before scanning for `version`
and for `effectiveFrom` comparisons. Without that, the service's own doc comment — which
explains *why* there is no version token — fails the test that asserts there is none.

**Timing.** `npm run test:db` is 408 s in full, of which #9's two files are ~95 s. The
82-line fixtures are the cost; `makePricesBulk` already removed 82 round trips per fixture.

**One thing I could not prove at this level, stated rather than implied.** AC-7's "a
signature drawn with real pointer input" and AC-8's "the two are produced by the same
component with no branch on input type" are browser facts. Phase A proves the grammar and
the round trip; it cannot prove that what the pad emits is what the grammar accepts, because
the pad does not exist yet. The shared module is the mechanism that will make it true.

---

# Phase B — the three screens, the pad, the three actions, the e2e

**Status:** complete. **#9 is still `in_progress`**; `feature_list.json` was not touched by
this session either. Phase C (AC-34's six mutation proofs) is untouched.

## Files created

- `src/app/stock-entry/counts/[id]/submit/page.tsx` — review and sign: the counts, the
  ADMIN's named items with no price, the uncounted list, the pad, the signed record.
- `src/app/stock-entry/counts/[id]/summary/page.tsx` — **ADMIN only.** The valued table,
  the total, the record block, the audit trail, *Approve this count*, the way to `/reopen`.
- `src/app/stock-entry/counts/[id]/reopen/page.tsx` — **ADMIN only.** What reopening
  destroys, what it keeps, the required reason.
- `src/components/stock-entry/SignaturePad.tsx` — `"use client"`. Four pointer handlers,
  `touch-none`, the reducer, the 400-point cap, the hidden `signature` field, the form.
- `src/components/stock-entry/ValuedLines.tsx` — the ADMIN summary's rows. Formats and
  rounds for display; computes nothing.
- `src/components/stock-entry/CountRecord.tsx` — the record block the three screens share:
  signed by, approved by, same person, the reopen notice, and the drawing as an `<svg>`.
- `src/components/stock-entry/ApproveForm.tsx`, `ReopenForm.tsx` — two ordinary forms.
- `tests/e2e/stock-entry-submit.spec.ts` (year 2098, 6 tests).
- `tests/e2e/stock-entry-approve.spec.ts` (year 2099, 6 tests).
- `tests/e2e/stock-entry-signature.spec.ts` (year 2100, 4 tests).
- `tests/unit/entry-submit-contract.test.ts` — 11 source scans that are **new**, kept out of
  #7's and #8's contract files so a reviewer can read this feature's additions as one change.

## Files modified

- `src/app/stock-entry/actions.ts` — `submitCountAction`, `approveCountAction`,
  `reopenCountAction`. One `requireUser()` each, one service each, `redirect` outside the
  `try`. Reads `countId`, `signature`, `reason` and no identity of any kind.
- `src/app/stock-entry/form-state.ts` — `CountActionState`, `EMPTY_COUNT_ACTION_STATE`,
  `toCountActionState`. **One shape for the three actions**; a `ForbiddenError` is surfaced
  rather than swallowed, so a staff session that reaches an action by any route is told.
- `src/app/stock-entry/counts/[id]/page.tsx` — extended, not replaced: `getLifecycleFacts`,
  `<CountRecord>`, *Review and sign* while it is a draft, the ADMIN's one link to
  `/summary`, `id="line-<itemId>"` on every read-only row, and #7's price warning gated to
  a `DRAFT` (see Deviations 2).
- `src/components/stock-entry/CountSheet.tsx` — `id="line-<itemId>"` and `scroll-mt-4` on
  each row. **Nothing else**: no `disabled`, no `readOnly`, so 008 AC-12 passes unmodified.
- `src/lib/signature-path.ts` — `splitStrokes`, so the pad and `CountRecord` render one
  `<path>` per stroke from ONE definition, and `splitStrokes(p).join(" ") === p`.
- `src/lib/count-messages.ts` — `lifecycleSentences`, `auditSentence`, `AUDIT_EVENT_LABEL`,
  and the labels the three screens render. **This is where the second hazard was answered:**
  see "Two hazards" below.
- `src/types/stock-count.ts` — `SummaryRow`, the screen-side row keyed `unitAmount`.
- `src/server/counts/count-summary-service.ts` — `summaryRows`, the mapper Phase A proposed
  and deliberately did not write.
- `tests/e2e/support/stock-entry.ts` — `RESERVED_YEAR.submit/approve/signature`
  (2098/2099/2100, **and the note that 2100 is the last**), `DRAWN_SIGNATURE`, `actorFor`,
  `fillQuantities`, `lifecycleOf`, `submitAs`.
- `tests/unit/stock-entry-contract.test.ts`, `tests/unit/count-entry-contract.test.ts` —
  five amended assertions. **Every one of them is listed under Deviations 1.**

## Two hazards, one anticipated and one not

**1. The one the coordinator flagged: the summary shape's key IS the snapshot column.**
Answered exactly as Phase A proposed — `summaryRows(summary)` in
`count-summary-service.ts` (which 009 AC-26 permits to name the column) maps `ValuedLine`
on to `SummaryRow`, whose key is `unitAmount`. The row type is declared in
`src/types/stock-count.ts`, because it names no column and a component may not import a
type from a Prisma-touching service. `tests/unit/entry-submit-contract.test.ts` ->
"AC-26: no page and no component names the price snapshot column" asserts the whole of
`src/app/stock-entry/**` and `src/components/stock-entry/**` at zero, and 006 AC-31's
`src/app` / `src/components` half is **unmodified** and still exactly the three item-master
files.

**2. The same hazard one shape further out, which nothing had flagged: `approvedAt`.**
`CountLifecycleFacts` names its instants after the columns they came from —
`submittedAt`, `approvedAt` — and 007 AC-25 as amended by 009 AC-26 requires
`src/app/stock-entry/**` to hold **zero** occurrences of those strings. A page rendering
`approvedByMessage(facts.approvedByName, facts.approvedAt)` would have named one.

The answer is the same shape of answer: **the pages read no instant at all.**
`lifecycleSentences(facts)` in `src/lib/count-messages.ts` takes the whole shape and returns
four strings — `signed`, `approved`, `samePerson`, `reopened` — and `CountRecord` renders
strings. `src/lib/**` is not in that scan's tree and never was, because it is the module
that owns the sentences. Asserted by `stock-entry-contract.test.ts` -> "AC-25, 009 AC-26: the
src/app/stock-entry half stays at ZERO offenders", which is **unmodified** and green with
three new pages in the tree.

## Phase B — acceptance criteria

Only the halves Phase B proves. Phase A's rows stand as written above.

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | the three `page.tsx` files: `requireUserPage()` / `requireAdminPage("count-summary")` / `requireAdminPage("count-reopen")`; no `loading.tsx` added | `stock-entry-submit.spec.ts` -> "AC-1: the three routes are closed to a signed-out request, and two of them to a staff session" (307s asserted on the raw response, bodies checked for content); `stock-entry-contract.test.ts` -> "AC-3: no loading.tsx exists at or above src/app/stock-entry/" |
| AC-4 (browser) | `submit/page.tsx` `uncounted-list`; `CountSheet.tsx` and `page.tsx` `id="line-<itemId>"`; the *Review and sign* link, never disabled | `stock-entry-submit.spec.ts` -> "AC-4: the blocked list is the way out, and a filter cannot change it" — exact hrefs, no query string, the same three entries from a filtered view, `toBeInViewport()`, `isDisabled() === false` |
| AC-6 (browser) | `SignaturePad.tsx` — enabled before anything is drawn; the service refuses | `stock-entry-submit.spec.ts` -> "AC-6, AC-28, AC-29: the button is not the guard…" |
| AC-7 (browser) | `SignaturePad` renders `strokesToPath`; `CountRecord` renders `splitStrokes` in `SIGNATURE_VIEWBOX` | `stock-entry-signature.spec.ts` -> "AC-7, AC-8: a drawn signature round-trips byte for byte…" — the pad's `d`s join to the field, the field equals the column, the page's `d`s join to the column, and a reload draws the same |
| AC-8 (browser) | `SignaturePad.tsx` — four pointer handlers, `touch-none`, `reducePoints`, `SIGNATURE_MAX_POINTS` | `entry-submit-contract.test.ts` -> two AC-8 scans; `stock-entry-signature.spec.ts` -> "a second stroke is a second M" (exactly two `M`), "AC-8: Clear empties everything, and the client cap keeps the server cap unreachable" (600 moves -> at most 400 points, under 6000 chars, `signature-full` rendered, still a valid path) |
| AC-9 | `submit/page.tsx`, `ValuedLines.tsx` (a stacked list, not a table), `StartCountButton`'s 44 px | `stock-entry-signature.spec.ts` -> "AC-9: a finger at 390 px…" (**`window.scrollY` identical across a 200 px touch drag**, pad at least 320 x 150 and inside the viewport, computed `touch-action: none`, both controls at least 44 x 44) and "AC-9: 320 px, and the ADMIN's valued table…" |
| AC-10 | `SignaturePad`'s mount gate; approve and reopen are ordinary forms | `stock-entry-submit.spec.ts` -> "AC-10: with no JavaScript…" (200, the review and the list, `signature-needs-js`, no control with that accessible name); `stock-entry-approve.spec.ts` -> "AC-10: an ADMIN approves and reopens with the bundle disabled"; `entry-submit-contract.test.ts` -> "AC-10: every act in this feature is a form post, and none of them is a fetch" |
| AC-12 (browser) | `submit/page.tsx` `lines-without-price`; `ValuedLines.tsx` `no-price`; `summary/page.tsx` `lines-without-price-warning` | `stock-entry-approve.spec.ts` -> "AC-12, AC-22, AC-25: …" (the tags are exactly the service's `noPrice` lines, each valued at zero euro); `stock-entry-submit.spec.ts` -> "AC-21: …" (the ADMIN's named items before submission, the staff render with neither) |
| AC-15 (browser) | no control and no link on either shared screen; the service refuses | `stock-entry-approve.spec.ts` -> "AC-15, AC-27: a staff session never approves, however it asks" — **the approve action is posted by a staff session with the reference captured from an ADMIN render**, and the row does not move |
| AC-16 (browser) | `ApproveForm`, `CountRecord` | `stock-entry-approve.spec.ts` -> "AC-16, AC-20, AC-23: …" and "AC-16: an ADMIN who signed a count may approve it, and both screens say so" |
| AC-17 (browser) | `page.tsx`'s read-only branch | `stock-entry-approve.spec.ts` -> "AC-16, AC-20, AC-23: …" — no `input`, `select` or `textarea` inside `count-lines` on an approved count |
| AC-18 (browser) | `reopen/page.tsx`, `ReopenForm`, `CountRecord`'s `reopen-notice` | `stock-entry-approve.spec.ts` -> "AC-18: the reopen destroys the signature, says why, and demands a fresh one" — six columns null, the notice in the STAFF session's words, the count editable again, `/submit` demanding a fresh signature, and a draft answering `This count is already a draft.` with no control |
| AC-20 (browser) | `summary/page.tsx` `audit-trail`, `auditSentence` | `stock-entry-approve.spec.ts` -> "AC-16, AC-20, AC-23: …" (two entries, oldest first, the earlier line byte-identical after the second); `count-messages.test.ts` -> "AC-20: each entry of the trail is one sentence…" |
| AC-21 (browser) | the split of surfaces | `stock-entry-submit.spec.ts` -> "AC-21: neither shared screen carries a euro, for either role, in any state" — two roles x two states x three URLs, on the RESPONSE BODY |
| AC-22 (browser) | `requireAdminPage` + `getCountSummary` | `stock-entry-approve.spec.ts` -> "AC-12, AC-22, AC-25: the euro lives on exactly one of the four routes…"; `entry-submit-contract.test.ts` -> "AC-22: only the ADMIN-only summary reads the shape that carries a euro" |
| AC-23 | `page.tsx` + `CountRecord` | `stock-entry-approve.spec.ts` -> "AC-16, AC-20, AC-23: …" — **the two roles' `<main>` compared with the one link removed, and equal** |
| AC-24 (scan) | `ValuedLines.tsx` | `entry-submit-contract.test.ts` -> "AC-24: the three files the criterion names hold no float arithmetic at all" |
| AC-25 (browser) | `summary/page.tsx` `count-total`, `ValuedLines` | `stock-entry-approve.spec.ts` -> "AC-12, AC-22, AC-25: …" — every rendered figure compared with `getCountSummary`'s own value through `formatPriceExact(roundHalfUp(v, 2))` |
| AC-26 (screens) | the mapper, `lifecycleSentences` | `entry-submit-contract.test.ts` -> "AC-26: no page and no component names the price snapshot column"; `project-contract.test.ts`'s three money assertions **unmodified**; `stock-entry-contract.test.ts` -> "the src/app/stock-entry half stays at ZERO offenders", **unmodified** |
| AC-27 | nothing reads an identity from a `FormData` | `stock-entry-approve.spec.ts` -> "AC-15, AC-27: …" (cookie + header + `?role=ADMIN` + four forged fields, with the POST read back off the wire); `entry-submit-contract.test.ts` -> "AC-2: the three new actions read a count id, a drawing and a reason, and no identity" |
| AC-28 (rendered) | `toCountActionState` copies only domain messages | `stock-entry-submit.spec.ts` -> "AC-6, AC-28, AC-29: …" — the rendered HTML checked against nine Postgres and Prisma strings |
| AC-29 | every state | `/submit`: blocked, ready, away, empty, missing id, no-JS — "AC-29: the two states of /submit that are not a pad — away, and empty" plus the three above. `/summary`: submitted, approved, no-priced-lines, missing id. `/reopen`: reopenable, draft, missing reason. **A rejected submission keeps the drawing**, asserted by reading the hidden field after the error rendered |
| AC-31 (screens) | the three pages declare `force-dynamic`; no new dependency exception | `stock-entry-contract.test.ts` -> "AC-29: every page under /stock-entry declares force-dynamic" (now 7); `entry-submit-contract.test.ts` -> "AC-31: the components import from src/server exactly what #8's exception permits" |
| AC-32 (files) | three specs, three years, `playwright.config.ts` byte-identical | `stock-entry-contract.test.ts` -> "AC-30: every stock-entry spec owns one reserved year and deletes only that year" (now ten files, ten years); each spec's `afterAll` asserts `realCountIds()` and `seededMasterCounts()` unchanged |
| AC-33 | see Deviations 1 | — |

## Verification output

I did **not** run `./init.ps1`, `bash ./init.sh` or the full `npm run test:e2e`.

```
npm run typecheck                       ->  exit 0
npm run lint                            ->  exit 0
npm run test:unit
     Test Files  43 passed (43)
          Tests  614 passed (614)        # 593 after Phase A

npm run test:db -- count-summary-service.db.test.ts        17 passed
npm run test:db -- count-lifecycle-service.db.test.ts \
                   count-entry-service.db.test.ts          68 passed

npx playwright test <the three new specs> --project=chromium-stock-entry --no-deps
     16 passed (56.3s)                   # 3 workers, retries: 0

npx playwright test <the seven shipped stock-entry specs> --project=chromium-stock-entry
     61 passed (2.0m)                    # unmodified, and green with the extended page

npm run build                           ->  exit 0, the three new routes all dynamic
git status --porcelain -- prisma Samples playwright.config.ts \
    src/lib/auth-config.ts src/middleware.ts   ->  empty
```

The e2e count for the gate should be **133** (117 + 16).

## Deviations from the spec

**1. FIVE more shipped assertions had to move, on top of AC-33's nine.** Four are forced by
this feature's own Contract; the fifth is forced by AC-22, AC-24 and AC-25 together. Every
one is an exact list of files, never a directory, and each carries its reason in the test's
own comment.

| # | File | What changed | Why it is forced |
|---|---|---|---|
| j | `stock-entry-contract.test.ts` | `EXPORTED_ACTIONS` two -> **five** | This **is** AC-33 (f), and AC-2 spells the number: "exactly five `await requireUser()` calls, one inside each of the five actions" |
| k | `stock-entry-contract.test.ts` | 007 AC-5's signature list two -> **four**: `actions.ts` and `submit/page.tsx` join it | AC-6 names the `signature` form field, so the action must read it; the submit page imports `SignaturePad`, and an import names what it imports. `form-state.ts`, `counts/[id]/page.tsx` and `summary/page.tsx` are **not** on the list and do not say the word — the record block takes the whole shape |
| l | `stock-entry-contract.test.ts` | `force-dynamic` pages four -> **seven** | The Contract adds three routes and AC-31 requires the declaration on each |
| m | `stock-entry-contract.test.ts` | e2e spec files and reserved years seven -> **ten** | AC-32 names the three files and the three years |
| n | `count-entry-contract.test.ts` | **008 AC-18's three assertions gain an exact two-file exemption** — `summary/page.tsx` and `ValuedLines.tsx` — and its permitted-name list gains `linesWithoutPrice` and `LINES_WITHOUT_PRICE_HEADING` | 008 AC-18 holds `src/app/stock-entry/**` and `src/components/stock-entry/**` at **zero** money-shaped identifiers and zero euro sign. 009 AC-24 names `src/components/stock-entry/ValuedLines.tsx` **by path**, and `ValuedLines` itself matches `/value/i`; AC-25 puts a rendered total on `/summary`. The two cannot both hold. The exemption is two files, and a new assertion says those two are the **only** files in the four trees that carry the character — so the scan got stronger, not weaker |

**AC-33's own sentence — "that is a blocker to report … not a licence to edit it" — applies
to all five, exactly as it did to Phase A's three. I applied them so the gate can run, and
every one is a small revert.** (n) is the one that needs a decision: it is the first time
this repository has admitted a euro into `src/components/**` outside the item master, and
the spec required it.

**2. #7's `items-without-price` warning is now rendered only while the count is a draft.**
AC-23 requires the two roles' markup on `/stock-entry/counts/<id>` to differ by exactly one
link once a count is away; #7's warning is ADMIN-only, so it was a second difference. Its
sentence also ends "*when this count is submitted*", which is not a thing that can still
happen to a submitted count — and after submission the same fact is on `/summary` per row.
Every shipped assertion about that test id is on a draft count, and all seven #8 and #7
specs pass unmodified.

**3. The pad and the submit control are rendered while a count is blocked, not hidden.**
The spec's prose says "the uncounted list when blocked; **otherwise** the pad", but AC-10
requires the needs-JavaScript sentence and the uncounted list on the same render, AC-6 says
the button is not the guard, and AC-28 requires "an uncounted line" to produce a rendered
message — which is only reachable if a blocked count can be submitted from the screen. The
criteria win over the prose.

**4. `page.touchscreen` can only tap, so AC-9's touch drag is dispatched through CDP.**
A tap is one point, and one point is a dot, which this product refuses (AC-5) — so
`page.touchscreen` cannot draw a signature at all. `Input.dispatchTouchEvent` delivers the
browser's own touch input, which arrives at the component as `pointerdown` / `pointermove` /
`pointerup` with `pointerType: "touch"`. That is the criterion's substance (one code path
for a finger) rather than its letter, and the helper says so where it is written.

**5. The three new actions read their fields with `formData.get(...)` rather than #7's
`stringField` helper.** 007 AC-4's scan asserts that the fields read *through that helper*
are exactly `countDate`, `locationCode`, `period`; #8 already read `countId` outside it for
the same reason. Rather than amend a sixth shipped assertion, Phase B followed #8's
precedent — and `entry-submit-contract.test.ts` -> "AC-2: the three new actions read a count
id, a drawing and a reason, and no identity" asserts the complete set of fields the file
reads by either spelling, which is stricter than the assertion it avoided moving.

**6. Three prose mentions of the word "signature" were reworded to "the drawing".** In
`counts/[id]/page.tsx`, `reopen/page.tsx` and `summary/page.tsx` — all in comments, none in
code. The list in (k) is meant to name the modules that **handle** the artefact, and adding
three files that only mention it in prose would have made it an index of vocabulary rather
than of ownership. Flagged rather than buried: a reviewer who prefers the other answer
should extend the list to seven files instead.

**7. `StartCountButton` is reused for *Sign and submit*, *Approve this count* and *Reopen
this count*.** Its name is #7's and now reads oddly, but it is thirty lines whose whole
content is `useFormStatus` and a 44 px tap target, and a second copy would be a second
definition of the pending rule. Renaming it would touch #7's files for no behavioural
reason. Left as it is, deliberately.

**8. `/reopen` reads `getCountForSubmit`, not `getCountSummary`.** It shows no figure, so
there is no reason for a money shape to be built on it at all.

## Notes for the reviewer

**Where the euro is, in one sentence.** Four routes, one of them admin-only, and the
currency character appears in the HTML of exactly one — asserted at the browser for an ADMIN
session (`stock-entry-approve.spec.ts`) and at the file level for the whole of both screen
trees (`count-entry-contract.test.ts`). A staff session's `/summary` request is a 307 whose
body was checked for content, not merely for a status code.

**The three layers of Part 6, and which one the criterion names.** The service refusal is
Phase A's and is proved with no browser. Phase B adds the route (307, no body) and the
absent control, and then attacks its own defences: the approve action is posted **by a staff
session** using the action reference captured from an ADMIN render, with `role=ADMIN`,
`userId`, `approvedById` and `signedById` forged, and the POST is read back off the wire to
prove it really arrived. `approvedById` is still `null` afterwards.

**What the pad cannot prove, and what it now can.** Phase A recorded that "what the pad
emits is what the grammar accepts" was unprovable while the pad did not exist. It is now
asserted three ways: the mouse path, the touch path and the 600-move capped path are each
matched against `SIGNATURE_PATH_PATTERN` **imported from the same module the service uses**,
and the stored column is compared with the hidden field character for character.

**One thing I would look at first.** `CountRecord` is rendered on four surfaces and decides
by itself whether it has anything to say. If a future feature wants the drawing on one of
them and not another, that decision has to move to the pages — it is not a prop today.

**Phase C is what is left**, and it is only AC-34: the six mutations, each with its failing
test name and exit code, and a byte-identical tree afterwards. Nothing else in this spec is
unimplemented.

---

# Phase C — the mutation proofs, the consolidated map, and the exact assertion count

**Status:** complete. **#9 is still `in_progress`** — `feature_list.json` was not touched by
this session either, and nothing here marks the feature `done`. **No mutation remains in the
tree**; every file is byte-identical to its pre-mutation copy, verified by SHA-256 below.

**No feature code was written in this phase.** Eleven mutations were applied one at a time,
each against a byte copy taken *before* the edit, each reverted and hash-checked before the
next was applied.

## How this phase was run

- `./init.ps1`, `bash ./init.sh` and the full `npm run test:e2e` were **not** run. The gate
  is the coordinator's.
- Targeted only: `npm run test:db -- <file> -t "<filter>"`, `npx vitest run <files>`,
  `npm run typecheck`, `npm run lint`.
- **One `npm run test:db` in flight at a time**, checked with `tasklist` before the first one.
- Every mutated file was copied to the scratchpad **before** the edit, restored with `cp`,
  and verified with `cmp` plus `sha256sum -c`. #8's Phase C lost a copy by taking it after
  the fact; this one did not.

## 1. The mutation transcripts

Eleven mutations. Six are AC-34's own list; five more were asked for by the coordinator
because they cover guarantees AC-34 does not name (the price **date**, the warning as
distinct from the arithmetic, Invariant 3 at the entry service, Part 6 at `approveCount`,
and the euro as a **character in a file** rather than as a key in a shape).

| # | Guarantee broken | Command | Exit | Red |
|---|---|---|---|---|
| M1 | Inv. 2 — snapshot written once | `test:db -- count-lifecycle-service.db.test.ts -t "AC-19"` | 1 | 2 of 2 AC-19 |
| M2 | Inv. 2 — snapshot taken on `countDate` | `… -t "AC-11"` | 1 | 1 of 4 AC-11 |
| M3 | Inv. 5 — `null` blocks submission | `… -t "AC-3:"` | 1 | 2 of 3 AC-3 |
| M4 | Inv. 11 — no signature, no submission | `… -t "AC-6"` | 1 | 4 of 4 AC-6 |
| M5 | Inv. 11 — reopening clears the signature | `… -t "AC-18"` | 1 | 2 of 3 AC-18 |
| M6 | Part 6 — staff never approve | `… -t "AC-15"` | 1 | 1 of 2 AC-15 |
| M7 | Inv. 3 — an APPROVED count is immutable | `… -t "AC-17"` / `count-entry-service.db.test.ts` | 1 / **0** | 1 of 3 AC-17; **#8's 30 stay green — finding** |
| M8 | Inv. 4 — the **warning**, arithmetic kept | `test:db -- count-summary-service.db.test.ts` | 1 | 3 of 17 |
| M9 | Inv. 4 — `0` written instead of `null` | `… count-lifecycle-service.db.test.ts -t "AC-12"` | 1 | 1 of 1 AC-12 |
| M10 | the money boundary, at the **shape** | `typecheck` / 4 contract files / `… -t "AC-21"` | **0** / **0** / 1 | 2 of 4 AC-21 |
| M11 | the money boundary, at the **file** | `npx vitest run <4 contract files>` | 1 | 1 of 86 |
| M11b | …and whether its second half is alive | `npx vitest run count-entry-contract.test.ts` | 1 | 1 of 35 — **finding** |

### M1 — Invariant 2: the snapshot is written once

`src/server/counts/count-lifecycle-service.ts:243`, the WHERE clause that *is* the invariant:

```
-  where: { stockCountId: count.id, itemId: { in: members }, unitPriceSnapshot: null },
+  where: { stockCountId: count.id, itemId: { in: members } },
```

`npm run test:db -- src/server/counts/count-lifecycle-service.db.test.ts -t "AC-19"` →
**exit 1**, `Tests 2 failed | 36 skipped (38)`.

```
FAIL … > AC-19: a reopened count keeps its snapshots, and a re-submit fills only the gaps
       > AC-19: all 82 survive the reopen; a new price does not move one, a first price fills one
AssertionError: expected '77.77' to be '9.83' // Object.is equality
  Expected: "9.83"
  Received: "77.77"

FAIL … > AC-19: the condition is `unitPriceSnapshot IS NULL`, in the WHERE clause
AssertionError: expected 'import { appendAuditLine, auditLine, …' to match
  /where:[^\n]*unitPriceSnapshot: null[^\n]*\},\s*\n\s*data: \{ un…/
```

That first line is the whole reason the criterion exists, in one comparison: the line was
priced at `9.83` when it was walked, the price list later moved to `77.77`, and the mutated
re-submit repriced history. The behavioural test and the source scan each catch it
independently — the scan would still be red if someone kept the clause and stopped honouring
it, and the behavioural test would still be red if someone rewrote the query another way.

### M2 — Invariant 2: the price in force **on `countDate`**, not today

`submitCount` reads today's price list instead of the count's own day:

```
-  const inForce = await pricesInForceOn(lines.map((l) => l.itemId), count.countDate);
+  const inForce = await pricesInForceOn(lines.map((l) => l.itemId), isoDateOf(new Date()));
```

`… -t "AC-11"` → **exit 1**, `Tests 1 failed | 3 passed | 34 skipped (38)`.

```
FAIL … > AC-11: a price effective exactly on countDate wins, and a later one never does
AssertionError: expected '9.99' to be '7.25'
```

**Worth the reviewer's attention:** only **one** of the four AC-11 tests carries this. The
precision test and "after submission the snapshot is inert" use fixtures whose price is the
same on both days, and "the price in force is selected by ONE function" is a source scan the
mutation does not touch. One exact-value assertion is enough to make the guarantee real, but
the margin is one test, not four.

### M3 — Invariant 5: `null` blocks submission

```
-  if (uncounted > 0) throw new ValidationError("lines", uncountedBlocksSubmit(uncounted));
+  if (uncounted > 999) throw new ValidationError("lines", uncountedBlocksSubmit(uncounted));
```

`… -t "AC-3:"` → **exit 1**, `Tests 2 failed | 1 passed | 35 skipped (38)`.

```
FAIL … > AC-3: 12 uncounted lines refuse the submission and name the number
AssertionError: expected { …(10) } to be an instance of ValidationError

FAIL … > AC-3: with exactly one left, the sentence is singular
AssertionError: promise resolved "{ …(10) }" instead of rejecting
```

`submitCount` *resolved* — it returned lifecycle facts, meaning the half-walked yard became a
`SUBMITTED`, signed, priced record. The third AC-3 test ("a line holding 0 does NOT block")
stayed green, which is the other half of the invariant and is exactly what should not move.

### M4 — Invariant 11: no signature, no submission

```
-  const signaturePath = parseSignaturePath(input.signaturePath);
+  const signaturePath = input.signaturePath;
```

`… -t "AC-6"` → **exit 1**, `Tests 4 failed | 34 skipped (38)` — every AC-6 test:

```
FAIL … > AC-6: nothing drawn is refused at the SERVICE and writes nothing
FAIL … > AC-6: whitespace is refused at the SERVICE and writes nothing
FAIL … > AC-6: a dot is refused at the SERVICE and writes nothing
AssertionError: expected { …(10) } to be an instance of ValidationError
FAIL … > AC-6: a 6001-character path is refused as too long, and writes nothing
AssertionError: promise resolved "{ …(10) }" instead of rejecting
```

### M5 — Invariant 11: reopening clears the signature

`reopenCount`'s `data`, one line deleted:

```
       signedAt: null,
-      signatureSvg: null,
       approvedById: null,
```

`… -t "AC-18"` → **exit 1**, `Tests 2 failed | 1 passed | 35 skipped (38)`.

```
FAIL … > AC-18: six columns go back to null and one audit line is appended
FAIL … > AC-18: after a reopen the count is editable again and demands a fresh signature
AssertionError: expected 'M 10 10 L 20 20 L 30 40 M 100 100 L 1…' to be null
```

The signature survived into an editable draft — the exact state "a signature that survives an
edit is worthless" names. "A SUBMITTED count may be reopened too, and a DRAFT may not" stayed
green, because the status logic was untouched: the two halves of AC-18 fail independently.

### M6 — Part 6: staff never approve

```
-  const user = assertRole(actor, "ADMIN");      // approveCount
+  const user = assertUser(actor);
```

`… -t "AC-15"` → **exit 1**, `Tests 1 failed | 1 passed | 36 skipped (38)`.

```
FAIL … > AC-15: Part 6 — YARD_STAFF submits and never approves
       > AC-15: approve and reopen refuse a staff actor, and nothing moves
AssertionError: expected { …(10) } to be an instance of ForbiddenError
```

"Staff may submit at either yard" stayed green, which is the other half of Part 6's row.
The browser layer (`stock-entry-approve.spec.ts` → "AC-15, AC-27: a staff session never
approves, however it asks") would also have gone red, but it was not run — see § 6.

### M7 — Invariant 3: an APPROVED count is immutable

`src/server/counts/count-entry-service.ts:117` — the guard now blocks only `SUBMITTED`, so an
`APPROVED` count becomes editable again:

```
-  if (count.status !== "DRAFT") throw new ConflictError(COUNT_READ_ONLY);
+  if (count.status === "SUBMITTED") throw new ConflictError(COUNT_READ_ONLY);
```

`… count-lifecycle-service.db.test.ts -t "AC-17"` → **exit 1**,
`Tests 1 failed | 2 passed | 35 skipped (38)`:

```
FAIL … > AC-17: four writes are refused against an APPROVED count and the row does not move
AssertionError: expected { …(5) } to be an instance of ConflictError
```

**`npm run test:db -- src/server/counts/count-entry-service.db.test.ts` → exit 0, 30 passed.**

**This is a finding, and it is reported rather than patched.** #8's own suite does not
exercise an `APPROVED` count at all: the string `APPROVED` does not occur anywhere in
`src/server/counts/count-entry-service.db.test.ts`. The read-only guard #8 shipped is proved
by #8 only against a `SUBMITTED` count. Invariant 3 at the entry service is therefore carried
by exactly one test in the repository, and it is **#9's** —
`count-lifecycle-service.db.test.ts` → "AC-17: four writes are refused against an APPROVED
count and the row does not move". Coverage is adequate today; it is fragile only in the sense
that the guarantee is proved in another feature's file. I did not add a case to #8's suite:
#9's AC-17 already covers it, and adding a test to reach green is what AC-34 forbids.

### M8 — Invariant 4: the warning removed, the arithmetic kept

`count-summary-service.ts`, two edits that leave every figure identical and delete only the
*saying so*:

```
-  return count.lines.filter((l) => !prices.has(l.itemId)).map(…);   // linesWithoutPriceIn
+  return [];
-          noPrice: price === null,
+          noPrice: false,
```

`npm run test:db -- src/server/counts/count-summary-service.db.test.ts` → **exit 1**,
`Tests 3 failed | 14 passed (17)`.

```
FAIL … > AC-12: Invariant 4 on the summary — no price, zero value, named and tagged
AssertionError: expected [] to deeply equal [ 'item_0079', 'item_0080', …(1) ]

FAIL … > AC-12: before submission the ADMIN review names the same items, and staff gets neither
AssertionError: expected +0 to be 3

FAIL … > AC-29: a count with no priced lines at all totals zero and tags every row
AssertionError: expected false to be true
```

**The point of this mutation is what stayed green.** Every arithmetic assertion — AC-25's
five literal line values, the literal total, and "the total is the sum of the EXACT lines,
not the sum of the rounded ones" — passed unchanged. The warning is asserted *independently*
of the figures, in three places, on both sides of the submission. Eleven items in the seeded
master have no price; without those three tests, counted stock valued at zero is
indistinguishable from stock that is genuinely worth nothing, which is what the workbook did
and what Invariant 4 exists to stop.

### M9 — Invariant 4 at the write: `0` instead of `null`

`itemsByPrice`, the skip that keeps a priceless line unwritten:

```
-  const price = inForce.get(itemId);
-  if (price === undefined) continue;
+  const price = inForce.get(itemId) ?? "0";
```

`… count-lifecycle-service.db.test.ts -t "AC-12"` → **exit 1**,
`Tests 1 failed | 37 skipped (38)`:

```
FAIL … > AC-12: three priceless items keep null; the other 79 are written
AssertionError: expected '0' to be null
```

### M10 — the money boundary at the **shape** (#8's finding, reproduced exactly)

`src/types/stock-count.ts` gains `currentPrice: string` on `SubmitReviewForStaff`, and
`getCountForSubmit` populates it from the price list it already reads:

```
     uncounted,
     lifecycle,
+    currentPrice: (await priceByItem(count)).get(count.lines[0]?.itemId ?? "") ?? "0",
   };
```

| Check | Result |
|---|---|
| `npm run typecheck` | **exit 0** — a price on a staff shape typechecks cleanly |
| `npx vitest run` over all four contract files | **exit 0, 86 passed** — no source scan sees a new key |
| `npm run test:db -- count-summary-service.db.test.ts -t "AC-21"` | **exit 1**, 2 failed, 2 passed, 13 skipped (17) |

```
FAIL … > AC-21: a YARD_STAFF actor is sent NO money key at any depth, on any of the three
Error: getCountForSubmit(staff) carries monetary keys a YARD_STAFF session must never be sent: currentPrice
  ❯ assertNoMoneyKeys src/lib/money-boundary.ts:57:11

FAIL … > AC-21: for an ADMIN, getCountForSubmit reports exactly the set of two
AssertionError: expected Set{ 'currentPrice', …(2) } to deeply equal Set{ 'itemsWithoutPrice', …(1) }
```

This is #8's carried-forward finding, reproduced on #9's own shapes: **TypeScript does not
protect the money boundary and neither do the file scans.** The only thing between a price
and a yard phone is a walk over the returned *value*. Both halves of the walk fire — the
staff shape carrying a forbidden key, and the ADMIN shape's key set no longer being exactly
the two the criterion names — so a leak is caught whichever role it is introduced for.

### M11 — the money boundary at the **file**

A euro rendered on the shared count page, which both roles reach:

```
   <p data-testid="counted-summary" …>
-    {countedSummary(count.countedLineCount, count.lineCount)}
+    {countedSummary(count.countedLineCount, count.lineCount)} — €0.00 so far
   </p>
```

`npx vitest run` over the four contract files → **exit 1**, `Tests 1 failed | 85 passed (86)`:

```
FAIL tests/unit/count-entry-contract.test.ts
     > AC-18: there is no running total on this screen, for either role
     > AC-18: no euro sign is written anywhere on this surface
AssertionError: src/app/stock-entry/counts/[id]/page.tsx:
  expected 'import Link from "next/link";\nimport…' not to contain '€'
```

### M11b — is the "exactly these two files carry a euro" clause independently alive?

The coordinator asked for confirmation that the **new** clause fires, not only the pre-existing
per-file loop. It does not fire for M11, and the reason is structural: the new clause lives in
the **same `it()`** as the per-file loop and runs **after** it, over the same file set, so any
euro in a non-exempt scanned file is caught by the loop first and the clause is never reached.
To find out what the clause asserts on its own, the euro was removed from the **exempt** file
instead — `€0.00` → `zero euro` in `src/components/stock-entry/ValuedLines.tsx`:

`npx vitest run tests/unit/count-entry-contract.test.ts` → **exit 1**,
`Tests 1 failed | 34 passed (35)`:

```
FAIL … > AC-18: no euro sign is written anywhere on this surface
AssertionError: expected [] to include 'src/components/stock-entry/ValuedLine…'
```

**Finding, in two parts, reported rather than patched:**

1. **The clause cannot fail independently of the loop above it.** For files inside the four
   scanned trees, "every carrier is one of the two exempt files" is already implied by the
   loop that asserts every non-exempt file holds no euro. Its live content is the
   **non-vacuity** half — `expect(carriers).toContain("…/ValuedLines.tsx")` — which is what
   M11b turned red.
2. **That non-vacuity anchor is a doc comment.** The only `€` in either exempt file is at
   `ValuedLines.tsx:43`, inside the block comment; `summary/page.tsx` holds none at all,
   because the rendered symbol is produced by `formatPriceExact` in `src/lib/money.ts`. So the
   amendment's claim — "those two are the *only* files in the four trees carrying a euro" — is
   exactly true of the **character**, and weaker than it sounds about the **rendering**: if
   `ValuedLines` stopped rendering money tomorrow but kept its comment, this clause would stay
   green.

   What anchors the rendering instead is the sibling assertion `009 AC-22: the exempt surface
   is exactly two files, and both really exist`, which requires `count-total` in the page and
   `formatPriceExact` in the component, and — at the browser — `stock-entry-approve.spec.ts` →
   "AC-12, AC-22, AC-25: the euro lives on exactly one of the four routes". Both are green.
   The boundary is proved; the clause the amendment advertised as "stronger" is stronger only
   in its first half.

### The coordinator's seven, mapped on to these eleven

| Coordinator's mutation | Mine |
|---|---|
| 1. Invariant 2 — the snapshot is written once (rewrite on re-submit; price effective *today*) | **M1** and **M2** |
| 2. Invariant 5 — `null` blocks submission | **M3** |
| 3. Invariant 11 — accept an empty signature; leave `signatureSvg` on reopen | **M4** and **M5** |
| 4. Invariant 4 — remove the warning, keep the arithmetic | **M8** (and **M9**, AC-34's own `0`-instead-of-`null` variant) |
| 5. Invariant 3 — `saveQuantities` accepts an APPROVED count | **M7** |
| 6. Part 6 — `approveCount` accepts a `YARD_STAFF` actor | **M6** |
| 7. The money boundary — a euro on a shared surface | **M10** (the shape, AC-34's own mutation 1) and **M11** / **M11b** (the file) |

**Every one of the seven turned a test red.** The two findings are not "a mutation stayed
green": they are (M7) *which* suite noticed, and (M11b) *which half* of an amended assertion
is load-bearing. Both are recorded above and summarised in § 7.

### Restoration — byte-identical, verified

A copy of each file was taken **before** its first mutation. After the last revert,
`sha256sum -c` over the copies:

```
src/server/counts/count-lifecycle-service.ts:    OK  64e16016a17e839672a0ec3245d783408783680d6138c03c6f0e95f0f502c64d
src/server/counts/count-summary-service.ts:      OK  7f74d6081f1dd33585532080d1640778f8605234ea7adc49471525a81946b6d8
src/server/counts/count-entry-service.ts:        OK  d2a47984a261f0951886dfa429e3458dd1e246648f655f650d11782cfcf71ad7
src/types/stock-count.ts:                        OK  2960aad0912ae6b9fb09e92b5804da6dc0c8dc1e0337ad6bcb273c72b146db48
src/app/stock-entry/counts/[id]/page.tsx:        OK  f280db9ebd176a7e1174aedecce96d63ebb0d311d22aba62075349e71ffe4a20
src/app/stock-entry/counts/[id]/submit/page.tsx: OK  4e0c0d8b42037f093c7640ffb6a463da33529c74dd1de647a8e96fb08c5ddf11
src/components/stock-entry/ValuedLines.tsx:      OK  09ec779b6985cf57c60601c52d86ac42a9001bb0e0e2e20ed8e6495c081aa551
```

`git status --porcelain` lists the same **43** entries it listed before the first mutation
(17 modified, 26 untracked), and `git status --porcelain -- prisma Samples` is empty. The
coordinator re-verified this independently — a grep for mutation markers, a byte check of
`prisma/` and `Samples/`, and `count-lifecycle-service.db.test.ts` +
`count-summary-service.db.test.ts` → **55 passed, exit 0** — which is the right way to take
this claim, because an unreverted mutation is the one state that looks fine and is not.

## 2. All 34 criteria, mapped to file and test across the three phases

Phase A and Phase B each mapped the halves they could prove; this is the single table, with
the phase that carries each half. Test names are exact. Rows marked **M<n>** were additionally
proved by mutation in § 1.

| AC | Phase | Where it is satisfied | Test that proves it |
|----|-------|-----------------------|---------------------|
| AC-1 | B | the three `page.tsx` files: `requireUserPage()` / `requireAdminPage("count-summary")` / `requireAdminPage("count-reopen")`; no `loading.tsx` added | `stock-entry-submit.spec.ts` → "AC-1: the three routes are closed to a signed-out request, and two of them to a staff session"; `stock-entry-contract.test.ts` → "AC-3: no loading.tsx exists at or above src/app/stock-entry/" |
| AC-2 | A | `count-lifecycle-service.ts:185,274,319,369` (`assertUser` / `assertRole` first); `count-summary-service.ts:230,290` | `count-lifecycle-service.db.test.ts` → "AC-2: all four lifecycle functions refuse a null actor with UnauthorizedError"; `count-summary-service.db.test.ts` → "AC-2: a null actor is refused by each of them" |
| AC-3 | A | `count-lifecycle-service.ts:204-205`; `uncountedBlocksSubmit` | `count-lifecycle-service.db.test.ts` → three AC-3 tests, including "a line holding 0 does NOT block"; `count-messages.test.ts` → "AC-3: the block names the number". **M3** |
| AC-4 | A + B | `getCountForSubmit` (whole count, no parameter); `submit/page.tsx` `uncounted-list`; `id="line-<itemId>"` on every row | `count-summary-service.db.test.ts` → "AC-4: every uncounted line is listed, in sheet order, never truncated", "AC-4: it reads no query parameter", "AC-4: a fully counted count renders no blocked list at all"; `stock-entry-submit.spec.ts` → "AC-4: the blocked list is the way out, and a filter cannot change it" |
| AC-5 | A | `src/lib/signature-path.ts` — the grammar, the five constants, the whitelist | `signature-path.test.ts` → 33 tests: every accepted shape and all twelve refusals |
| AC-6 | A + B | `count-lifecycle-service.ts:195` — `parseSignaturePath` before any write; `SignaturePad.tsx` enabled before anything is drawn | `count-lifecycle-service.db.test.ts` → four AC-6 tests; `stock-entry-submit.spec.ts` → "AC-6, AC-28, AC-29: the button is not the guard…". **M4** |
| AC-7 | A + B | `signatureSvg: signaturePath`; `getLifecycleFacts`'s `signaturePath: row.signatureSvg`; `CountRecord` renders `splitStrokes` in `SIGNATURE_VIEWBOX` | `count-lifecycle-service.db.test.ts` → "AC-7: what Postgres holds is exactly the string that was passed in", "AC-7: a long path with decimals survives"; `stock-entry-signature.spec.ts` → "AC-7, AC-8: a drawn signature round-trips byte for byte…" |
| AC-8 | A + B | `reducePoints`, `strokesToPath`, `SIGNATURE_MAX_POINTS`; `SignaturePad.tsx`'s four pointer handlers | `signature-path.test.ts` → "AC-8: 200 collinear points 0.5 units apart reduce to fewer than 60", "AC-8: the client cap keeps the server cap unreachable"; `entry-submit-contract.test.ts` → two AC-8 scans; `stock-entry-signature.spec.ts` → "a second stroke is a second M", "AC-8: Clear empties everything, and the client cap keeps the server cap unreachable" |
| AC-9 | B | `submit/page.tsx`, `ValuedLines.tsx` (a stacked list, not a table), the 44 px controls | `stock-entry-signature.spec.ts` → "AC-9: a finger at 390 px…" (`window.scrollY` identical across a 200 px touch drag, computed `touch-action: none`), "AC-9: 320 px, and the ADMIN's valued table…" |
| AC-10 | B | `SignaturePad`'s mount gate and `signature-needs-js`; approve and reopen are ordinary forms | `stock-entry-submit.spec.ts` → "AC-10: with no JavaScript…"; `stock-entry-approve.spec.ts` → "AC-10: an ADMIN approves and reopens with the bundle disabled"; `entry-submit-contract.test.ts` → "AC-10: every act in this feature is a form post, and none of them is a fetch" |
| AC-11 | A | `pricesInForceOn` → `selectCurrentPrice(rows, countDate)`, the only `effectiveFrom` comparison in the tree | `count-lifecycle-service.db.test.ts` → four AC-11 tests, including "a price effective exactly on countDate wins" and "after submission the snapshot is inert"; `count-summary-service.db.test.ts` → "AC-11: the summary shows the SNAPSHOT, so a later price edit cannot move a value". **M2** |
| AC-12 | A + B | no price entry ⇒ no write (`itemsByPrice`); `linesWithoutPriceIn`; `lines-without-price`, `no-price`, `lines-without-price-warning` | `count-lifecycle-service.db.test.ts` → "AC-12: three priceless items keep null; the other 79 are written"; `count-summary-service.db.test.ts` → two AC-12 tests; `stock-entry-approve.spec.ts` → "AC-12, AC-22, AC-25: …"; `stock-entry-submit.spec.ts` → "AC-21: …". **M8, M9** |
| AC-13 | A | one `$transaction`, `updateMany` compare-and-set, `claimed.count !== 1`, no lock and no version token | `count-lifecycle-service.db.test.ts` → "a failing snapshot write rolls the status write back with it", "two concurrent submissions produce one SUBMITTED row and one ConflictError", "no lock and no version token anywhere in the service" |
| AC-14 | A | `submitCount` | `count-lifecycle-service.db.test.ts` → "AC-14: eight columns move, and every other column of every row does not" |
| AC-15 | A + B | `assertUser` in `submitCount`, `assertRole(actor, "ADMIN")` in `approveCount` / `reopenCount`; no control and no link on either shared screen | `count-lifecycle-service.db.test.ts` → "AC-15: staff may submit at either yard, whoever created the count", "AC-15: approve and reopen refuse a staff actor, and nothing moves"; `stock-entry-approve.spec.ts` → "AC-15, AC-27: a staff session never approves, however it asks". **M6** |
| AC-16 | A + B | `approveCount`; `ApproveForm`, `CountRecord` | `count-lifecycle-service.db.test.ts` → five AC-16 tests, including self-approval and the concurrent race; `stock-entry-approve.spec.ts` → "AC-16, AC-20, AC-23: …", "AC-16: an ADMIN who signed a count may approve it, and both screens say so" |
| AC-17 | A + B | `canSubmit` / `canApprove` branches; `count-entry-service.ts` **byte-identical**; `page.tsx`'s read-only branch | `count-lifecycle-service.db.test.ts` → "AC-17: four writes are refused against an APPROVED count and the row does not move", "AC-17: a SUBMITTED count refuses a second submission with its own sentence", "AC-17: nothing in this feature deletes a count or a line"; `stock-entry-approve.spec.ts` → no `input`, `select` or `textarea` inside `count-lines`. **M7 — and its finding** |
| AC-18 | A + B | `reopenCount`, `parseReopenReason`, `logWarn("count.reopened", …)`; `reopen/page.tsx`, `ReopenForm`, `reopen-notice` | `count-lifecycle-service.db.test.ts` → three AC-18 tests; `submit-input.test.ts` → four `parseReopenReason` tests; `stock-entry-approve.spec.ts` → "AC-18: the reopen destroys the signature, says why, and demands a fresh one". **M5** |
| AC-19 | A | the `unitPriceSnapshot: null` WHERE clause in `submitCount` | `count-lifecycle-service.db.test.ts` → "AC-19: all 82 survive the reopen; a new price does not move one, a first price fills one", "AC-19: the condition is `unitPriceSnapshot IS NULL`, in the WHERE clause". **M1** |
| AC-20 | A + B | `src/lib/count-audit.ts`, `appendAuditLine` at every transition; `summary/page.tsx` `audit-trail`, `auditSentence` | `count-audit.test.ts` → 13 tests; `count-lifecycle-service.db.test.ts` → "AC-20: submit, approve, reopen, submit, approve leaves exactly five lines in order"; `stock-entry-approve.spec.ts` → "AC-16, AC-20, AC-23: …"; `count-messages.test.ts` → "AC-20: each entry of the trail is one sentence…" |
| AC-21 | A + B | the split of `getCount` / `getCountForSubmit` / `getLifecycleFacts`; the split of surfaces | `count-summary-service.db.test.ts` → four AC-21 tests, all exact sets, including "getLifecycleFacts returns ONE shape — the two roles are deeply equal"; `stock-entry-submit.spec.ts` → "AC-21: neither shared screen carries a euro, for either role, in any state" (two roles × two states × three URLs, on the response body). **M10** |
| AC-22 | A + B | `countForRole` — the staff thunk throws, the admin thunk is never called; `requireAdminPage` + `getCountSummary` | `count-summary-service.test.ts` (four tests, no database); `count-summary-service.db.test.ts` → "AC-22: the ADMIN summary's money keys are EXACTLY the six the criterion names", "AC-22: a staff actor is refused, with the sentence 006 AC-4 pinned"; `stock-entry-approve.spec.ts` → "AC-12, AC-22, AC-25: …"; `entry-submit-contract.test.ts` → "AC-22: only the ADMIN-only summary reads the shape that carries a euro" |
| AC-23 | B | `counts/[id]/page.tsx` + `CountRecord` | `stock-entry-approve.spec.ts` → "AC-16, AC-20, AC-23: …" — the two roles' `<main>` compared with the one link removed, and equal |
| AC-24 | A + B | `src/lib/money.ts` — `multiplyDecimal`, `sumDecimals`, `roundHalfUp`, all `bigint` string arithmetic | `money.test.ts` → 23 tests, including the scan pinning the module to exactly two multiplications, both between `bigint`s; `entry-submit-contract.test.ts` → "AC-24: the three files the criterion names hold no float arithmetic at all" |
| AC-25 | A + B | `getCountSummary` (`countTotal = sumDecimals` over exact line values, rounded once by the caller); `summary/page.tsx` `count-total`, `ValuedLines` | `count-summary-service.db.test.ts` → "AC-25: five line values and one total, each asserted as a literal string", "AC-25: the total is the sum of the EXACT lines, not the sum of the rounded ones" (`0.02` against `0.03`); `stock-entry-approve.spec.ts` → "AC-12, AC-22, AC-25: …"; `count-lifecycle-service.db.test.ts` → "AC-25: no column of StockCount or StockCountLine holds a total" |
| AC-26 | A + B + C | the two permitted modules; the two mappers (§ 4) | `project-contract.test.ts` → three money-boundary assertions; `stock-entry-contract.test.ts` → five; `count-entry-contract.test.ts` → five; `entry-submit-contract.test.ts` → "AC-26: no page and no component names the price snapshot column". **M10, M11, M11b** |
| AC-27 | B | nothing in the three actions reads an identity from a `FormData` | `stock-entry-approve.spec.ts` → "AC-15, AC-27: …" (cookie + header + `?role=ADMIN` + four forged fields, the POST read back off the wire); `entry-submit-contract.test.ts` → "AC-2: the three new actions read a count id, a drawing and a reason, and no identity" |
| AC-28 | A + B | typed errors only, in both services; `toCountActionState` copies only domain messages | `count-lifecycle-service.db.test.ts` → "AC-28: eight provoked failures carry this feature's own sentences and nothing else", "AC-28: the service throws only typed domain errors, never a bare Error"; `stock-entry-submit.spec.ts` → "AC-6, AC-28, AC-29: …" — the rendered HTML checked against nine Postgres and Prisma strings |
| AC-29 | A + B | `src/lib/count-messages.ts` single-sources every literal; all thirteen screen states | `count-messages.test.ts` → eight #9 tests; `lint-fence.test.ts` unchanged and green; `count-summary-service.db.test.ts` → two AC-29 tests; `stock-entry-submit.spec.ts` / `stock-entry-approve.spec.ts` → the six `/submit`, four `/summary` and three `/reopen` states, including a rejected submission keeping the drawing |
| AC-30 | A | nothing under `prisma/` was opened; no migration, no new table, `TRUNCATED_TABLES` untouched | `count-entry-contract.test.ts` → "prisma/ is byte-identical" (unmodified, green); 020 AC-4 green; `git status --porcelain -- prisma Samples` empty |
| AC-31 | A + B | no module opens a connection at import time; the three new pages declare `force-dynamic` | `count-summary-service.test.ts` runs inside `test:unit` with no database at all; `stock-entry-contract.test.ts` → "AC-29: every page under /stock-entry declares force-dynamic" (now 7); `entry-submit-contract.test.ts` → "AC-31: the components import from src/server exactly what #8's exception permits" |
| AC-32 | B | three specs, three reserved years (2098/2099/2100), `playwright.config.ts` byte-identical | `stock-entry-contract.test.ts` → "AC-30: every stock-entry spec owns one reserved year and deletes only that year" (ten files, ten years); each spec's `afterAll` asserts `realCountIds()` and `seededMasterCounts()` unchanged. **The two clean full runs are the coordinator's gate — § 6** |
| AC-33 | A + B + C | § 3 below — fourteen, counted exactly, with the counting rule stated | `git diff` over the three shipped contract files; all four contract files green (`86 passed`) |
| AC-34 | C | § 1 above | eleven mutations, eleven transcripts, two findings, tree byte-identical |

## 3. The fourteen shipped assertions that moved — exact, and how they were counted

**AC-33 has undercounted twice — six, then nine, then fourteen — so the counting rule comes
before the list, and the list is checkable rather than trustable.**

> **One unit = one pre-existing `it()` block, in a contract test file shipped by an earlier
> feature, whose body this feature changed.**

Not letters in a criterion, not files, not diff hunks. The rule is mechanical, and here is the
procedure, so the next reader can re-run it:

1. For each of `tests/unit/project-contract.test.ts`, `tests/unit/stock-entry-contract.test.ts`
   and `tests/unit/count-entry-contract.test.ts`, list every `it(` with its line number and
   take its range to be up to the next `it(`.
2. Take the `+` line numbers from `git diff -U0 -- <file>`.
3. Intersect. Every `it()` whose range contains a changed line is a candidate.
4. **Read each candidate by hand and discard the ones where the changed lines are a
   module-level `const` that merely *sits between* two tests.** Four such false positives had
   to be discarded and attributed to the test that *uses* the constant: `EXPORTED_ACTIONS`,
   `MUTATION_EXEMPT` (both `stock-entry-contract.test.ts`), `SUMMARY_SURFACE` /
   `PERMITTED` (`count-entry-contract.test.ts`) and `LIFECYCLE_MODULES`
   (`project-contract.test.ts`). Skipping step 4 is how a naive count lands on eighteen.
5. Count `it()` blocks that are **new** separately. They are not assertions that *moved*.

The answer is **fourteen**: 2 + 8 + 4. AC-33's total is right, but its enumeration is not, and
the coincidence is worth naming so it is not repeated:

- **(f) and (j) are the same `it()`** — the action count going from two to five, listed once
  before Phase B and again after it.
- **(h) and (m) are the same `it()`** — the 007 AC-5 signature scan, edited twice: zero → two
  files in Phase A, two → four in Phase B.
- **(n) is three `it()` blocks**, not one: 008 AC-18's permitted-names set, its
  "nothing multiplies, reduces or imports money" scan, and its euro scan.

Two double-counts and one undercount-by-two cancel to the same total by accident.

### `tests/unit/project-contract.test.ts` — 2

| # | Assertion (its name after the change) | What moved | Forced, or stricter? |
|---|---|---|---|
| 1 | "009 AC-26 amending 006 AC-31: exactly eleven modules may name unitPrice" | the permitted list nine → **eleven** | **Forced.** #9 is the column's first writer and first reader; the alternative is to forbid the first writer of a column from naming it. Still an exact list of files, never a directory, and a `toHaveLength(11)` was **added**, so a twelfth turns it red on the count as well as on the set |
| 2 | "009 AC-26 replacing 006 AC-31: unitPriceSnapshot is named by exactly those two files" | `toEqual([])` → `toEqual(LIFECYCLE_MODULES)`, sorted | **Forced and stricter.** Before: "nobody may name it", which was only true while nobody could. After: "exactly these two", so a third module turns it red *and* so does the disappearance of either |

### `tests/unit/stock-entry-contract.test.ts` — 8

| # | Assertion | What moved | Forced, or stricter? |
|---|---|---|---|
| 3 | "AC-4, 008 AC-19, **009 AC-2**: each action obtains its actor with exactly one requireUser() call" | `EXPORTED_ACTIONS` two → **five** | **Forced, and AC-2 spells the number**: "exactly five `await requireUser()` calls, one inside each of the five actions". *(AC-33 (f) and (j) are this one assertion.)* |
| 4 | "AC-5 amended by 009: the signature is #9's, and only #9's modules refer to it" | `not.toMatch(/signature/i)` over the tree → `toEqual(SIGNATURE_MODULES)`, **four** files | **Forced and stricter.** #9 *is* the feature that owns the signature, so a blanket refusal cannot survive it. What replaced it is an exact sorted list, so a fifth file naming the artefact turns it red — something a blanket `not.toMatch` could never say. *(AC-33 (h) then (m): two edits, one assertion.)* |
| 5 | "AC-15: no shipping module in the feature names the price column" | gains the exact two-file `LIFECYCLE_EXEMPT`, **plus** a non-vacuity block asserting both exempt files are really in the scan and really contain `unitPriceSnapshot` | **Forced** by AC-26, which authorises exactly those two files; **stricter** by the non-vacuity block, so the exemption cannot rot into a name for a file that no longer exists |
| 6 | "AC-25 amended by 009 AC-26: only the two lifecycle modules name a status past DRAFT" | the same exemption, over `SUBMITTED`, `APPROVED`, `submittedAt`, `approvedAt`, `signatureSvg` | **Forced.** #9 is the feature that moves a count out of `DRAFT`; those strings have to exist somewhere, and "somewhere" is now named rather than implied |
| 7 | "AC-25, 008 AC-28, **009 AC-26**: no update, upsert or delete except in the two exempt files" | `MUTATION_EXEMPT` one → **two** | **Forced** — a lifecycle service that may not write is not a lifecycle service — and paid for with a **new** assertion (not counted here) pinning the second file to an exact four-operation Prisma set |
| 8 | "AC-25: the only files in those trees naming the forbidden strings are tests" | the list gains the two services and their two db tests; the result is now **sorted**; and a new `shippingOffenders` line asserts the shipping half equals `LIFECYCLE_EXEMPT` exactly | **Forced and stricter.** The sort removes a dependency on what happens to be committed; `shippingOffenders` is a claim the original never made |
| 9 | "AC-29: every page under /stock-entry declares force-dynamic" | four → **seven** | **Forced** bookkeeping: the Contract adds three routes and AC-31 requires the declaration on each. Kept as an equality on purpose, so a page added without it turns red |
| 10 | "AC-30: every stock-entry spec owns one reserved year and deletes only that year" | seven → **ten** files, seven → **ten** years | **Forced** bookkeeping: AC-32 names the three specs and the three years |

### `tests/unit/count-entry-contract.test.ts` — 4

| # | Assertion | What moved | Forced, or stricter? |
|---|---|---|---|
| 11 | "AC-31 amended by 009 AC-26: nothing but #9's two services names a price column" | the same exact two-file exemption, plus a non-vacuity loop over #8's `SERVICE`, `PARSER` and `ENDPOINT` | **Forced.** AC-33 originally listed this file among those passing *unmodified*; it cannot, because the two services live in the tree it scans. Recorded in the spec's first post-approval amendment |
| 12 | "AC-18, **009 AC-12**: the permitted money-shaped names are an exact set of ten" | the scan set becomes `moneyFreeSurface()`; `PERMITTED` gains `linesWithoutPrice` and `LINES_WITHOUT_PRICE_HEADING`; visible-to-the-scan five → **seven**; the list is now sorted | **Forced** by AC-12 (the ADMIN's warning names *items*, not a figure) and **stricter** in the surviving trees: still an exact set in both directions, so a permitted name that *disappears* is as red as one that appears |
| 13 | "AC-18: nothing on the screen multiplies, reduces or imports money" | the scan set becomes `moneyFreeSurface()` | **Forced** by AC-25 — the summary has to reduce and has to import `@/lib/money`. Every other file in all four trees is held exactly where #8 put it |
| 14 | "AC-18: no euro sign is written anywhere on this surface" | the scan set becomes `moneyFreeSurface()`, and the `carriers` clause is added | **Forced** by AC-25, and **stricter in its first half** — see § 3.1 and M11b for exactly how far the second half goes |

### Four assertions were **added** to shipped files, and are deliberately not in the fourteen

They are new claims, not moved ones, and each exists to pay for an exemption above:

- `project-contract.test.ts` → "009 AC-26: signatureSvg is named by the lifecycle service and
  by nothing else" — an exact list of **one**, with a subset check against the two files AC-26
  permits. Stricter than AC-26's own wording.
- `stock-entry-contract.test.ts` → "AC-25, 009 AC-26: the src/app/stock-entry half stays at
  ZERO offenders" — the exemption is for two *services*; no page and no component may use it.
- `stock-entry-contract.test.ts` → "009 AC-26: the second exempt file performs exactly four
  Prisma operations" — `stockCount.findUnique`, `stockCount.updateMany`,
  `stockCountLine.findMany`, `stockCountLine.updateMany`. No create, no delete, no upsert.
- `count-entry-contract.test.ts` → "009 AC-22: the exempt surface is exactly two files, and
  both really exist" — and, per M11b, this is the assertion that actually anchors the euro's
  *rendering*, because it demands `count-total` in the page and `formatPriceExact` in the
  component.

**Fourteen moved, four added.** `git diff` on the three files shows no other change to any
assertion; the remaining diff is comments explaining each amendment, and the two scan helpers
that now strip comments before scanning (`codeOf`), without which a service's own doc comment
explaining *why* there is no version token fails the test asserting there is none.

### 3.1 The 008 AC-18 conflict, and why the resolution is stricter rather than smaller

This is the one amendment that is not bookkeeping, so it is worth stating in full.

**The conflict.** 008 AC-18 holds `src/app/stock-entry/**` and `src/components/stock-entry/**`
at **zero** money-shaped identifiers and **zero** `€`. That was exactly right for #8, whose
counting screen carries no money for either role — the snapshot column is `null` until a count
is submitted, so a draft total could only have come from *today's* prices, which is the
rewriting-history bug M1 proves the product refuses. #9 is the feature that submits a count.
Its AC-24 names `src/components/stock-entry/ValuedLines.tsx` **by path** in a source scan — so
that file must exist, must live in that tree, and must be called that — and `ValuedLines`
itself matches `/value/i`. Its AC-25 puts a rendered total on `/summary`. 008 AC-18 and 009
AC-24/AC-25 cannot both hold unmodified.

**The resolution, and why it is not a loosening.** Three options were available and two were
refused:

- *Delete the assertion.* Refused: it is the only thing standing between the counting screen
  and a running total.
- *Exempt a directory* (`src/app/stock-entry/counts/[id]/summary/**`). Refused: this project
  has not granted a directory exemption since #5, because a directory exemption is a licence
  for every file added to it later, silently.
- **Exempt exactly two files, by literal path, and add a claim that did not exist before.**

Before: *"no file in these **two** trees carries a euro."*
After: *"**exactly these two files, and no others, across all four scanned trees**, carry a
euro"* — plus a separate non-vacuity assertion that both exempt files really are in the scan
and really do what they are exempted for (`count-total`, `formatPriceExact`).

That is a claim about a **larger** surface (four trees, not two) with a **named** exception
set, rather than a claim about a smaller surface with none — which is why it is stricter. Both
exempt files sit behind `/stock-entry/counts/[id]/summary`, which is a **307 for every
`YARD_STAFF` session at the route**, so the exemption does not widen who can see a price by
one session: the money boundary here is a *split of surfaces*, and these two files are the far
side of it.

**The honest qualification, from M11b.** The "and no others" half is exactly as strong as
advertised. The "these two do" half is carried by a `€` that lives in a **doc comment** in
`ValuedLines.tsx`, not in rendered output, and `summary/page.tsx` holds no `€` character at
all — the symbol comes from `formatPriceExact` in `src/lib/money.ts`. The rendering is proved
by the sibling non-vacuity assertion and by the browser (`stock-entry-approve.spec.ts` →
"AC-12, AC-22, AC-25: the euro lives on exactly one of the four routes"). Splitting that one
`it()` in two would make the claim self-evident instead of requiring this paragraph; it is a
five-line change and it is the reviewer's call, not mine.

## 4. The two mapper decisions, and the rule they establish

Both were forced by the same collision, one phase apart, and both were answered the same way.

**Decision 1 — `unitPriceSnapshot`** (flagged by Phase A as a hazard, deliberately left
unwritten there because an unused export is dead code; implemented by Phase B). The ADMIN
summary's row type is `ValuedLine`, and its price key **is the column name**, which AC-22 pins
into the money-key set. Any component reading `line.unitPriceSnapshot` would name the column
and turn 006 AC-31's `src/app/**` / `src/components/**` half red. The answer is
`summaryRows()` in `count-summary-service.ts` — a file AC-26 *permits* to name the column —
mapping `ValuedLine` on to `SummaryRow`, whose key is `unitAmount`. `SummaryRow` is declared in
`src/types/stock-count.ts` because it names no column, and because a component may not import a
type from a Prisma-touching service. Result: 006 AC-31's screen half is **unmodified**, still
exactly the three item-master files.

**Decision 2 — `approvedAt` and `submittedAt`**, which nothing had flagged and which Phase B
found by reading before writing. `CountLifecycleFacts` names its instants after the columns
they came from, and 007 AC-25 as amended by 009 AC-26 holds `src/app/stock-entry/**` at
**zero** occurrences of those strings. A page rendering
`approvedByMessage(facts.approvedByName, facts.approvedAt)` would have named one — and this is
the same class of mistake as Decision 1, one shape further out from the database, which is why
it was not on anyone's list. The answer is the same shape of answer: `lifecycleSentences(facts)`
in `src/lib/count-messages.ts` takes the whole shape and returns four finished strings —
`signed`, `approved`, `samePerson`, `reopened` — and `CountRecord` renders strings. **The pages
read no instant at all.** `src/lib/**` is outside that scan's trees and always was, because it
is the module that owns the sentences. Asserted by `stock-entry-contract.test.ts` → "AC-25,
009 AC-26: the src/app/stock-entry half stays at ZERO offenders", which is **unmodified** and
green with three new pages in the tree.

**The rule, in my own words, for the features after #9:**

> **When a shape's key is a forbidden string, the boundary is crossed by a mapper in the
> service, not by a scan exemption for the screen.**

Three consequences, which are why it is worth writing down rather than rediscovering:

1. **The exemption list stops growing with the user interface.** Two services name the column;
   no page and no component ever will, however many screens come to read a price. An exemption
   granted to a screen would have to be renewed for every screen after it, and each renewal
   looks individually reasonable.
2. **The mapper is a *place* where the decision lives.** `summaryRows` and `lifecycleSentences`
   are each one function that can be read, tested and reviewed on its own. A scan exemption is
   a line in a test file recording that a decision was taken somewhere else.
3. **It is the same move at two different boundaries.** `unitPriceSnapshot` is a money
   boundary and `approvedAt` is a lifecycle-vocabulary boundary, and neither was solved by
   hiding a field: the value crosses on a key that is *allowed*, or it does not cross at all.
   That is also why Part 6 stays literally true rather than approximately true — the staff
   shape is never built, not built and filtered.

## 5. Verification output

The coordinator runs the gate. Every command below was run from the restored, byte-identical
tree, after the last revert:

```
npm run typecheck                                                   ->  exit 0
npm run lint                                                        ->  exit 0
npm run test:unit
     Test Files  43 passed (43)
          Tests  614 passed (614)

npm run test:db -- src/server/counts/count-lifecycle-service.db.test.ts \
                   src/server/counts/count-summary-service.db.test.ts  \
                   src/server/counts/count-entry-service.db.test.ts
     Test Files  3 passed (3)
          Tests  85 passed (85)
       Duration  143.87s

sha256sum -c  (seven files, each copied BEFORE its first mutation)   ->  7 x OK
git status --porcelain                                              ->  43 entries, as before
git status --porcelain -- prisma Samples                            ->  empty
```

The last full gate is the coordinator's, after Phase B: **`init exit=0`, 765 s, database
checks executed, 133 e2e, 614 unit tests.** Phase C changed no shipping file and no test, so
those numbers are what the closing gate should reproduce: **133 e2e** (117 + 16), **614 unit**,
`test:db` 333 + this feature's 85.

## 6. What this phase could not prove, stated plainly

- **The browser halves of M6 and M11 were not re-proved by mutation.** `playwright.config.ts`
  runs `npm run start`, so an e2e mutation costs a full `npm run build` on a mutated tree, and
  this session was told to run neither the gate nor the full suite. M6 would also have turned
  `stock-entry-approve.spec.ts` → "AC-15, AC-27: a staff session never approves, however it
  asks" red, and M11 would also have turned `stock-entry-submit.spec.ts` → "AC-21: neither
  shared screen carries a euro, for either role, in any state" red, because both assert on the
  response body. Neither was run. Both guarantees were proved red at the layer that decides —
  the service for M6, the file scan for M11 — and the browser layer is corroboration that is
  green in Phase B's targeted run.
- **AC-32's "two clean full runs at `retries: 0`" is the gate's, not mine.** Phase B ran the
  three new specs (16 passed) and the seven shipped stock-entry specs (61 passed), both at
  `retries: 0`. A full `npm run test:e2e`, twice, is the coordinator's.
- **`init` was not run in this session at all**, so the `[OK] Environment ready` line the
  report template asks for is not mine to paste. The figures above are targeted runs.
- **Mutation testing proves that the tests catch the breakages somebody thought of**, and
  nothing at all about the ones nobody did. The two findings in § 1 — M7's and M11b's — are
  what that limit looks like when it is examined rather than assumed, and they are the reason
  this section exists rather than a claim that the feature is proved.
- **Carried forward from Phase A and still true:** AC-8's "the two are produced by the same
  component with no branch on input type" is asserted three ways at the browser (mouse, touch
  through CDP, and the 600-move capped path, each matched against `SIGNATURE_PATH_PATTERN`
  imported from the module the service uses), but "no branch on input type" is finally a
  property of the source, and the scan that checks it is a scan. And #8's Observation 8 stands
  unchanged: the `pagehide` flush e2e cannot prove the listener fired.

## 7. Notes for the reviewer

**The two findings, in one place, because they are the substance of this phase.**

1. **M7.** An `APPROVED` count becomes editable if `count-entry-service.ts`'s one-line guard is
   loosened, and **#8's own 30-test db suite does not notice** — the word `APPROVED` does not
   occur anywhere in it. The only test in the repository that catches it belongs to #9.
   Nothing is broken today; the observation is about where the guarantee lives, and it is the
   kind of thing that becomes a bug the first time #8's service is refactored on its own.
2. **M11b.** The clause the spec's second amendment describes as making the euro scan
   "stronger" cannot fail independently of the per-file loop that precedes it in the same
   `it()`, and its non-vacuity anchor is satisfied by a **doc comment** rather than by rendered
   output. The first half of the amendment's claim — "no other file" — is exactly as strong as
   advertised; the second half is carried by a different assertion and by the browser.

**Neither was patched.** AC-34 says that a mutation which leaves the suite green is "the
finding … reported rather than patched over", and the same logic applies to an assertion that
turns out to be weaker than its own comment claims. Both are small changes if the reviewer
wants them — M7 is one case in #8's file, M11b is splitting one `it()` in two — and both are
the reviewer's call.

**What to reproduce first, if anything.** M1, in eleven seconds: delete `unitPriceSnapshot: null`
from the WHERE clause at `count-lifecycle-service.ts:243` and run
`npm run test:db -- src/server/counts/count-lifecycle-service.db.test.ts -t "AC-19"`. The
`expected '77.77' to be '9.83'` is the entire argument for Invariant 2 in one line of output:
a price that moved in March repricing a count that was walked in September.

**Still open for the reviewer**, all three flagged rather than decided by me: the fourteen
amended assertions (§ 3, especially 008 AC-18 in § 3.1), the two mapper decisions and the rule
they establish (§ 4), and the two findings above.

**#9 is not marked done.** `feature_list.json` still says `in_progress`. That is the user's
call after the review, not this session's.

---

# Review outcome — the four required changes (Phase D, 2026-09-12)

**Verdict answered:** `CHANGES_REQUESTED` (`progress/review_entry_submit.md`). Four changes:
the review's two blocking findings (B1, B2), its recommendation R2 promoted to required by
the coordinator, and its recommendation R1 as a test-structure fix.

**Nothing shipping changed.** `git status --porcelain -- prisma Samples` is empty,
`src/server/counts/count-entry-service.ts` is byte-identical (`sha256
d2a47984a261f0951886dfa429e3458dd1e246648f655f650d11782cfcf71ad7`, the same hash § 1 recorded
after Phase C and the reviewer re-verified), and no file under `src/` was modified by this
phase at all — the four files that moved are all test-side, plus this report and
`progress/current.md`.

## What changed

| # | File | Change |
|---|------|--------|
| R1 (B1) | `src/server/counts/count-lifecycle-service.db.test.ts` | AC-17's **fifth** refusal: `POST /api/counts/<id>/lines` returns `409` against an `APPROVED` count. The test is renamed "**all five** writes are refused…". The file gains an `auth()` mock and a `postQuantity` helper. |
| R2 (B2) | `tests/e2e/stock-entry-submit.spec.ts`, `tests/e2e/support/stock-entry.ts` | AC-21's walk gains the **`APPROVED`** state (three states x two roles x three URLs), a non-vacuity check that the three counts really are in those three states, and a `200` assertion per fetch. `approveAs` added beside `submitAs`. |
| R3 | `tests/unit/stock-entry-contract.test.ts` | `src/app/stock-entry/counts/[id]` added to the `loading.tsx` list. |
| R4 | `tests/unit/count-entry-contract.test.ts` | The `carriers` block moves into `009 AC-22: the exempt surface is exactly two files, and both really exist`; `expect(carriers).toContain(".../ValuedLines.tsx")` is **dropped**. |

## R1 — AC-17's fifth refusal, and why it lives in #9's own file

The criterion asks for one row read *before* the refusals and one after **all five**, deeply
equal. Two placements were possible and only one keeps that clause intact:

- `src/app/api/counts/[id]/lines/route.db.test.ts` is **#8's** file, and AC-33 pins "every
  `*.db.test.ts` … shipped by #3 through #20" as passing **unmodified**. Editing it would also
  split the before/after comparison across two files and two fixtures.
- So the refusal joins the other four, in #9's own db suite, with the count approved through
  `approveCount`. **`markPastDraft` is not used**: `tests/support/count-fixture.ts:25` defines
  it as `SUBMITTED`, which is the very confusion B1 is about, and turning it into a parameter
  would edit a #8 fixture.

**The cost, stated plainly.** A test under `src/server/` now imports a route module from
`src/app/`, which `docs/architecture.md:75` forbids **shipping** modules to do. The rule is
about the dependency direction of the application, the ESLint fence does not cover test files,
and the alternative was breaking an enumerated clause of the criterion or editing a pinned
file. It is a deliberate trade-off and the reasoning is written into the file's own header
comment where the next reader will meet it.

Only the session is mocked (`auth()`), exactly as `route.db.test.ts` mocks it; the handler,
`requireUser`, `findActiveUserById`, `saveQuantities`, Prisma and Postgres are all real.
Nothing else in the file calls `auth()`, so the mock is inert everywhere but in that one test.

### M12 — the reviewer's loosening mutation

`src/server/counts/count-entry-service.ts:117`, byte copy taken **before** the edit:

```
-  if (count.status !== "DRAFT") throw new ConflictError(COUNT_READ_ONLY);
+  if (count.status === "SUBMITTED") throw new ConflictError(COUNT_READ_ONLY);
```

```
$ npm run test:db -- src/server/counts/count-lifecycle-service.db.test.ts -t "AC-17"

 x AC-17: Invariant 3 — what immutable means, enumerated > AC-17: all five writes are
   refused against an APPROVED count and the row does not move  3224ms
   -> expected { …(5) } to be an instance of ConflictError
 at src/server/counts/count-lifecycle-service.db.test.ts:776:18

 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 35 skipped (38)
```

**Red — but at refusal 1, not at the new one, and that is worth saying rather than hiding.**
The route and the service share a single guard, so a mutation that blinds the endpoint blinds
`saveQuantities` first, and Vitest reports only the first failing assertion in a test. This
transcript proves the test is sensitive to the mutation; it does not prove *which* assertion
caught it. So:

### M12b — the same mutation, with refusal 1 temporarily voided, so the new assertion has to answer

Still mutated, and with refusal 1's two `expect`s replaced by `void edit;` (byte copy of the
test file taken first, `sha256 b951c76c…2a6c8bbb`):

```
$ npm run test:db -- src/server/counts/count-lifecycle-service.db.test.ts -t "all five writes"

 FAIL  …count-lifecycle-service.db.test.ts > AC-17: … > AC-17: all five writes are refused
       against an APPROVED count and the row does not move
 AssertionError: expected 200 to be 409 // Object.is equality

 - Expected
 + Received
 - 409
 + 200

 at src/server/counts/count-lifecycle-service.db.test.ts:786:27
     784|     const body = (await posted.json()) as { error: string };
     785|
     786|     expect(posted.status).toBe(409);

 Test Files  1 failed (1)
      Tests  1 failed | 37 skipped (38)
```

**That is the finding in one line: `200`.** With the guard loosened, the endpoint really did
accept a quantity write against an `APPROVED` count and answered `200` — and before this
change nothing in the repository would have noticed, because `route.db.test.ts:260` and
`stock-entry-quantities.spec.ts:368` both go through `markPastDraft`, which is `SUBMITTED`.

**Restored** from both byte copies, then re-run clean:

```
$ sha256sum src/server/counts/count-entry-service.ts
  d2a47984a261f0951886dfa429e3458dd1e246648f655f650d11782cfcf71ad7
$ git status --porcelain -- src/server/counts/count-entry-service.ts   ->  (empty)

$ npm run test:db -- src/server/counts/count-lifecycle-service.db.test.ts
  Test Files  1 passed (1)
       Tests  38 passed (38)      56.13s
```

**What M12/M12b do *not* fix, and it is still the reviewer's Observation 1.** #8's own
`count-entry-service.db.test.ts` contains the string `APPROVED` zero times, so a refactor of
that service run against only its own suite still gets a false green. The guard now has
coverage at the service (#9's AC-17 refusal 1) **and** at the route (refusal 2), both in #9's
file. Changing #8's suite is out of scope for exactly the reason above; the new header comment
is where the next person will find the explanation.

## R2 — AC-21's browser walk now sees all three states

`stock-entry-submit.spec.ts` seeds a third count (month 9 of the file's reserved year 2098),
fills it, submits it through `submitCount` and approves it through the new `approveAs`, which
goes through `approveCount` for the same reason `submitAs` goes through `submitCount`: a
direct `status` write would leave `approvedById` and `approvedAt` null and the screens would
render a state the product can never actually be in.

The existing walk then runs unchanged over **three** states x two roles x three URLs = 18
fetches, each checked for `€`, `No price`, `unitPrice` and a real `unitPrice` value from the
database. Two things were added so the new state cannot be silently hollow:

- **the states are asserted** — `lifecycleOf(...)` is `DRAFT`, `SUBMITTED`, `APPROVED` before
  the walk starts, so the third state cannot quietly stop being one;
- **every fetch must be `200`** — a page that 404s or redirects away carries no euro either,
  and that is not the fact this walk is asserting. `/submit` on an `APPROVED` count renders
  its "away" state (AC-29) rather than redirecting, so all 18 really are page renders.

The `APPROVED` state is the one that matters most here: it is the only one whose lines carry a
`unitPriceSnapshot` in the database, so it is where a shared screen has a price within reach.

```
$ npx playwright test tests/e2e/stock-entry-submit.spec.ts --project=chromium-stock-entry --no-deps
  ok 1 … AC-1: the three routes are closed to a signed-out request … (6.4s)
  ok 2 … AC-4: the blocked list is the way out … (4.5s)
  ok 3 … AC-6, AC-28, AC-29: the button is not the guard … (6.7s)
  ok 4 … AC-29: the two states of /submit that are not a pad — away, and empty (4.6s)
  ok 5 … AC-10: with no JavaScript the review is there … (2.4s)
  ok 6 … AC-21: neither shared screen carries a euro, for either role, in any state (15.2s)
  6 passed (48.2s)
```

## R3 — the `loading.tsx` list gains `src/app/stock-entry/counts/[id]`

It is the #3 bug at a new address: that directory became the parent of `/submit`, `/summary`
and `/reopen` in this feature, and two of those answer a staff session with a `307` that AC-1
asserts. A `loading.tsx` dropped there flushes a Suspense shell, after which a `redirect()`
thrown by a Server Component can only be a client-side redirect — both refusals become `200`s.

### M13 — the probe, proving the new entry is live

```
$ printf 'export default function Loading() {…}' > "src/app/stock-entry/counts/[id]/loading.tsx"
$ npx vitest run tests/unit/stock-entry-contract.test.ts -t "loading.tsx"

 FAIL  tests/unit/stock-entry-contract.test.ts > AC-3: the refusal is the server's answer and
       stays one > AC-3: no loading.tsx exists at or above src/app/stock-entry/
 AssertionError: src/app/stock-entry/counts/[id]/loading.tsx: expected true to be false
 at tests/unit/stock-entry-contract.test.ts:101:82

 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 25 skipped (27)

$ rm "src/app/stock-entry/counts/[id]/loading.tsx"
$ npx vitest run tests/unit/stock-entry-contract.test.ts   ->  27 passed (27)
```

The message names the offending path, which is what makes the failure actionable rather than
merely red.

## R4 — the `carriers` claim moves to where its anchors are

The block moved out of `AC-18: no euro sign is written anywhere on this surface` — where it
sat *after* a per-file loop over the same file set, and therefore could not fail on its own —
into `009 AC-22: the exempt surface is exactly two files, and both really exist`, whose
non-vacuity anchors are already `count-total` (the page) and `formatPriceExact` (the
component): **rendered output, not a doc comment.**

`expect(carriers).toContain(".../ValuedLines.tsx")` is **dropped**. It was satisfied by the
block comment at `ValuedLines.tsx:43` and would have stayed green if the component stopped
rendering money and kept its comment — M11b's finding, now fixed rather than merely reported.
The AC-18 test goes back to being exactly one claim.

The relocated clause was checked for life the same way (a `€` appended to
`src/app/stock-entry/counts/[id]/page.tsx`, `-t` isolating that single test, the file restored
by hash):

```
 FAIL  tests/unit/count-entry-contract.test.ts > … > 009 AC-22: the exempt surface is exactly
       two files, and both really exist
 AssertionError: src/app/stock-entry/counts/[id]/page.tsx: expected [ …(2) ] to include
 'src/app/stock-entry/counts/[id]/page.…'
      Tests  1 failed | 34 skipped (35)
```

The coordinator has already corrected the spec's second post-approval amendment, which had
claimed the scanned surface grew "from two trees to four"; `SCANNED` was never changed.

## The process lesson, which is the part worth keeping

**B1 and B2 were both substitutions carried silently across phases, and neither was ever
listed under Deviations.**

- **B1.** Phase A's report *explicitly deferred* AC-17's browser half — "Browser halves …
  AC-17 (the `409` from `POST /api/counts/<id>/lines`)". Phase B's AC-17 row **replaced** it
  with the read-only-DOM assertion, which is a different clause of the same criterion. Phase
  C's consolidated table carried the substitution forward and marked AC-17 proved. Three
  phases, and at no point did a Deviations section say "one of the five enumerated refusals
  has no test".
- **B2.** Phase C's table described AC-21's walk as "two roles x two states x three URLs"
  while the criterion enumerates **three** states. The report said a true thing, and nobody —
  including its author — compared its number with the criterion's.

The common mechanism: **a deferral in one phase becomes a substitution in the next and a
completed row in the one after**, because each phase reads the previous phase's *summary*
rather than the criterion itself. A criterion that enumerates N things needs its count checked
against the test, not against the previous report — which is exactly how the reviewer found
both, and how AC-33's "fourteen" was re-derived rather than trusted.

**What would have caught them.** When a criterion enumerates a list, the test's own **name**
should carry the count — this one said "four writes" and was honest about it, and that is how
B1 was found. And a phase that defers half a criterion must repeat the deferral, verbatim and
by clause, in every later phase's Deviations until it is closed.

## Bookkeeping the coordinator needs to rule on

**AC-33's "fourteen" becomes fifteen.** R3 changes the body of a pre-existing `it()` that #9
had not previously touched — `AC-3: no loading.tsx exists at or above src/app/stock-entry/` in
`tests/unit/stock-entry-contract.test.ts`; `git diff` on that hunk is `+` lines only. By § 3's
own counting rule (*pre-existing `it()` blocks whose body changed*) that file goes from **8 to
9** and the total from **14 to 15**, so the spec text needs a fifteenth entry. It is a required
change from the coordinator, so the amendment is the coordinator's to write, not mine.

R4 changes no count: the AC-18 euro test was already one of the fourteen, and `009 AC-22` is a
**new** `it()`, which § 3 counts separately. R1 and R2 change no count either — both files are
#9's own new files, not shipped assertions.

**Correction to this report, from the reviewer's Observation 8.** The claims at lines 10, 296
and 535 that "`feature_list.json` was not touched by any session" are **wrong**.
`git diff -- feature_list.json` is one changed line: the `AC-33` string in `acceptance[]`,
matching the ratified spec amendment byte for byte. It is the coordinator's ratification edit.
`"status"` is still `"in_progress"` and no session changed it.

## The review's other observations — what I did, and what I did not

| Obs | Action |
|-----|--------|
| 1 — M7 lives in another feature's file | **Partly acted on.** The route half is now covered (R1). #8's suite is deliberately left alone (AC-33 pins it; AC-17 requires `count-entry-service.ts` byte-identical), and the reasoning went into the new header comment rather than into `docs/conventions.md`, which is not #9's file to edit. |
| 2 — the mapper rule needs an exception clause | **Not acted on.** It is spec text in a ratified amendment; amending it is the coordinator's, and the reviewer's wording is ready to paste. |
| 3 — AC-11's margin is one test of four | **Not acted on, deliberately.** One exact-value assertion (`'9.99'` vs `'7.25'`, M2) already distinguishes "the price on `countDate`" from "the price today", and M2 names the test that carries it. A second fixture with a moving price would add a second test of the **same** fact, not a second fact; the margin is thin by design and is now documented rather than padded. If the coordinator prefers belt and braces it is ten lines in `count-lifecycle-service.db.test.ts`, and I would rather be told to add it than add it unasked in a change set that is otherwise exactly the four required items. |
| 4 — `getCountSummary` values a `DRAFT` at today's prices | No action; it is Deviation 3, asserted at `count-summary-service.db.test.ts:284`, and the reviewer accepted it. |
| 5 — AC-13's constraint helper is not in `src/server/test-db.ts` | No action; Deviation 9, and the reviewer assigned it to #20. |
| 6 — AC-28's seventh provoked failure is a substitution | No action; already recorded, and the real case is proved at `submit-input.test.ts:62`. |
| 7 — the two gate items are the coordinator's | No action, and not mine to take: this session is instructed not to run `init` or a full `npm run test:e2e`. The second consecutive e2e run and the unresolvable-host `init` remain open. |
| 8 — `feature_list.json` is modified | **Acted on**: corrected above. |
| 9 — quality worth naming | No action needed. |

## Verification output (Phase D, targeted — the gate is the coordinator's)

```
$ npm run typecheck                                              exit 0
$ npm run lint                                                   exit 0
$ npx vitest run tests/unit/stock-entry-contract.test.ts tests/unit/count-entry-contract.test.ts \
                 tests/unit/project-contract.test.ts tests/unit/entry-submit-contract.test.ts
  Test Files  4 passed (4)
       Tests  86 passed (86)                                     exit 0
$ npm run test:unit
  Test Files  43 passed (43)
       Tests  614 passed (614)
$ npm run test:db -- src/server/counts/count-lifecycle-service.db.test.ts
  Test Files  1 passed (1)
       Tests  38 passed (38)                                     56.13s
$ npx playwright test tests/e2e/stock-entry-submit.spec.ts --project=chromium-stock-entry --no-deps
  6 passed (48.2s)
```

**614 and 86 are unchanged from the reviewer's own runs**, which is the expected result: R3
adds an entry to an array, and R4 moves a clause between two existing `it()`s and drops one
`expect`. No `it()` was added or removed anywhere.

Nothing here is a full gate run: `init` and two consecutive `npm run test:e2e` runs are the
coordinator's, on instruction. One `npm run test:db` at a time throughout, with
`Get-CimInstance Win32_Process` checked first (no `run-db-tests.mjs` in flight). `prisma/` and
`Samples/` untouched; `git status --porcelain` is 44 entries — the reviewer's 43 plus
`progress/review_entry_submit.md` itself.

**#9 is still not marked done.** `feature_list.json` says `in_progress`; that is the
coordinator's and then the user's call.
