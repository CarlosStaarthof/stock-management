# Review — specs 022, 023, 024 (access, dashboard, open items), branch `hermes/mwkjd6rb`

**Verdict:** CHANGES_REQUESTED

Reviewer: strict reviewer, 2026-11-17. Contract: the task text (spec-only; three draft specs, three
`pending`/`draft` entries in `feature_list.json`, no implementation, no new scope). Base `main`,
range `main..HEAD` (commits `b9217b3`, `ab0490f`).

## Claims verified against the diff

`git diff main..HEAD --name-status` is exactly five files: `feature_list.json` (M),
`progress/spec_access_dashboard_open_items.md` (A), `specs/features/022-roles_home_menu.md` (A, 270 lines),
`023-super_admin_dashboard.md` (A, 296), `024-open_items_sign_off.md` (A, 519).
`git diff main..HEAD -- src tests prisma scripts docs Samples package.json` is empty: no code, schema,
migration, test, doc or `Samples/` change. Lane is respected. `git status` is clean.

`feature_list.json`: ids 22, 23, 24 are `pending` / `spec_status: draft`, with 12 / 13 / 15 criteria, and the
`acceptance` arrays match the spec text (I diffed token sets: the only differences are the dropped bold headings and
four trailing round-2 sentences that are carried into the JSON as well). #12 is still the only `in_progress`
feature and no feature was marked `done`. A new milestone M8 was added; this is bookkeeping, not scope.

## Gate result

| Command | Result |
|---|---|
| `bash init.sh` (not executable here: `./init.sh` is "Permission denied") | **[FAILED] 3 problems**: `prisma validate` (`DATABASE_URL` unset), `npm run test:unit` (1 test), `npm run test:e2e` (no database). Harness, feature-list and `Samples/` checks are `[ok]`; database checks were `[skip]`. |
| `npm run typecheck` | exit 0 |
| `npm run lint` | exit 0 (`--max-warnings 0`) |
| `npm run test:unit` | 86 files passed, 1 failed; 1329 / 1330 tests. The one failure is `tests/unit/env-file.test.ts` ("`.env` does not exist"). |
| `npx prisma validate` with throwaway `DATABASE_URL` / `DIRECT_URL` | "The schema is valid" |

All three red items are container environment (no `.env`, no `DATABASE_URL`), not caused by this branch: the
branch changes no file under `src/`, `tests/`, `prisma/` or `scripts/`, and the failure set is the same one recorded in
`progress/review_mva3eswl.md` for the previous branch. A spec-only round cannot have turned them red. I am not
approving on that basis alone (the verdict is driven by the spec defects below), and I did not run `test:db` or
`test:e2e` (no database in this container; nothing to test).

## AC table

Each criterion is judged as a spec criterion: numbered, independently testable, consistent with the shipped code
and with the other two specs. "Evidence" is the spec location plus the shipped code it must agree with.

### 022 — Roles, home menu, export price

| AC | PASS/FAIL | Evidence |
|---|---|---|
| 1 | PASS | `roles.ts` union closed, one `isAdminOrAbove`; shipped `landing.ts` and `guards.ts:assertRole` use a strict `===` today, so the predicate is needed. Scan wording must exempt legitimate `role === "ADMIN"` target checks (`profile-admin-service.ts:422,491`, `ActiveProfileActions.tsx:50`): Observation 3. |
| 2 | PASS | Promote-or-nothing, idempotent, one-`SUPER_ADMIN` refusal, testable with a seeded and an unseeded DB (022:171-181). Matches the owner's R2 as recorded. |
| 3 | **FAIL** | 022:183-190 refuses `SUPER_ADMIN` as a requested role and as a target of `changeProfileRole` / `deactivateProfile` only. It says nothing about `resetProfilePin` or `clearAccountLock`. Shipped `resetProfilePin` (`profile-admin-service.ts:440-470`) returns the new PIN to the actor and has no target-role check; once its guard becomes admin-or-above (022 contract, `guards.ts`), an `ADMIN` can reset `carlos-staarthof`'s PIN, read it, and sign in as `SUPER_ADMIN`. See Required change 1. |
| 4 | PASS | Landing, `callbackUrl`, protected-path and signed-out redirect are asserted (022:192-198). |
| 5 | PASS | Exact tile set per role by test id, absence not styling (022:200-208). Tile targets: see AC-6. |
| 6 | **FAIL** | D4 and the tile table send every role's *Stock Calendar* to `/stock-entry`. Today `ADMIN` lands on `/stock-takes` (`landing.ts:14-17`, the money-free history calendar, which is where an admin reaches `/stock-takes/counts/[id]`). After this spec no home tile reaches `/stock-takes`; `ADMIN` loses its landing and its only menu route to it, and neither decision, change list nor open question says so (Q2 asks only about renaming). See Required change 3. |
| 7 | PASS | Every shipped admin surface for `SUPER_ADMIN`, `shapeForRole` fix (`role-shape.ts:21` is `=== "ADMIN"`), role-access extension (022:221-227). |
| 8 | PASS | Numeric E cell, `numFmt` `"€"#,##0.00`, blank not `""`, read-back via ExcelJS. Current writer is `formatPriceExact` text (`workbook-writer.ts:193`). Its consequence on a shipped assertion is under AC-10. |
| 9 | PASS | Staff money-free everywhere, new `/home` walk (022:236-244). |
| 10 | **FAIL** | Enumerates only e2e sign-in/landing tests. AC-8 necessarily changes a shipped unit assertion: `tests/unit/export-workbook.test.ts:165` is `expect(valueOf(dublin, "E3")).toBe("€1.005")`. AC-10 says "no assertion is removed" yet no criterion states which existing assertions change, what each checked before and now, or why none is weaker (the convention of 009 AC-33 and #12 R10). See Required change 2. |
| 11 | PASS | Full gate incl. database checks executed, `Samples/` clean. |
| 12 | PASS | Only an enum value; `TRUNCATED_TABLES` unchanged. |

### 023 — Super Admin dashboard

| AC | PASS/FAIL | Evidence |
|---|---|---|
| 1 | PASS | Page guard + service guard + protected path (023:140-148). Note the redirect target `/home?denied=dashboard` needs `/home` to render a `denied` notice; `src/app/page-guards.ts:34` redirects to `/stock-entry?denied=`; the spec's e2e covers only the 307 (Observation 4). |
| 2 | PASS | Three-fixture list with lock state; testable. |
| 3 | PASS | Reset returns one PIN, old sessions die, lock cleared; matches `resetProfilePin` (epoch increment, `settleLock`). |
| 4 | PASS | Deactivation matches shipped behaviour (`pinHash`/`pinKeyId` cleared, username kept). |
| 5 | PASS | Activation is new; refused states and fresh PIN stated; testable. |
| 6 | PASS | Role change ADMIN/YARD_STAFF only, forged `SUPER_ADMIN` refused. |
| 7 | **FAIL** | Covers the `SUPER_ADMIN` as actor only. It does not require that a non-super actor (an `ADMIN` on `/profiles`) cannot reset the `SUPER_ADMIN`'s PIN or clear its lock, which is the privilege-escalation path in Required change 1. A criterion headed "self-protection is in the service" should state the protection of the `SUPER_ADMIN` row against every other actor too. |
| 8 | PASS | One row per approved `StockCount`, ordering, total, signer, missing-signer marker, legacy approval (R3, R4). |
| 9 | PASS | Source-registry design with a duplicate-id throw and a fake-source test: satisfies "more records can be added later". |
| 10 | PASS | POST-only, typed refusals, PIN never in a URL. |
| 11 | PASS | No schema/migration; `/profiles` unchanged for `ADMIN`. |
| 12 | PASS | Empty, error, 390 px states. |
| 13 | PASS | Gate criterion, same form as the shipped specs. |

### 024 — Open items, finish and sign-off

| AC | PASS/FAIL | Evidence |
|---|---|---|
| 1 | PASS | Model has no `itemId`, cascade on count, `PENDING_SIGN_OFF` added, `TRUNCATED_TABLES` gains the table. |
| 2 | PASS | Add only while DRAFT, no master write (before/after dump), typed errors. |
| 3 | PASS | Removable only while DRAFT, `NotFoundError` on second removal. |
| 4 | PASS | Count-local; scan for no `Item`/`ItemLocation`/`ItemPrice` write. |
| 5 | PASS | Admin review shows total, every counted item, open items, uncounted list; staff shape money-free by key walk. |
| 6 | PASS | Exact decimal price, grammar refusals with `field === "unitPrice"`, staff refused. |
| 7 | PASS | Refusal order stated and each refusal named; unpriced open item blocks sign-off and writes nothing. |
| 8 | PASS | One transaction, one `APPROVED` audit line, snapshots written at sign-off, concurrency case stated. |
| 9 | PASS | Read-only after sign-off; reopen keeps open items. |
| 10 | PASS | Total includes open items on summary, analysis, export, dashboard; computed, never stored. |
| 11 | PASS | Open-item rows in the same sheet shape; total range covers them; `showAll` rule stated. |
| 12 | PASS | One row per approved count including open-item value. |
| 13 | PASS | Second approver gone for new counts; legacy `SUBMITTED` approve path kept (R4); predicates specified. |
| 14 | **FAIL** | "The review is the only new money surface" is not true against the shipped contract and the spec does not acknowledge it. The admin review is served at `/stock-entry/counts/[id]/submit` (024 Contract, routes table) and carries a total and prices. Shipped criteria say the opposite and are in force: 009 AC-21 ("the ADMIN renders of `/submit` contain no €"), 009 AC-22 ("`/summary` is the only route whose HTML contains a €", asserted by fetching the four routes for an ADMIN), 011 AC-19 ("the only two euro-bearing routes in the tree are `/analysis` and `/summary`"), and the money-key walk of 009 AC-21 over `getCountForSubmit`. Those assertions go red unmodified, which contradicts AC-15's "no assertion is weakened". See Required change 2. |
| 15 | **FAIL** | Says shipped submit/approve tests are "updated only where this feature changes the flow" without enumerating them. This feature changes at least: the contract tests that fix exact module lists (`tests/unit/project-contract.test.ts` "exactly thirteen modules may name unitPrice", the `src/types/`+`src/app`+`src/components` unitPrice scans; it will see `unitPrice` in `open-item-service.ts`, `open-item-input.ts`, the review page and the `OpenItemForAdmin` shape), 009 AC-21/22/23, 011 AC-19 and AC-5, `tests/unit/stock-entry-contract.test.ts` (status-name scans; `MUTATION_EXEMPT`; exact Prisma-operation set of `count-lifecycle-service.ts`), `COUNT_STATUS_LABEL: Record<CountStatus,string>` (`count-messages.ts:133`) and the audit-line regex (`count-audit.ts:64`, `SUBMITTED|APPROVED|REOPENED`). The spec must list them (Required change 2). |

## "Compare with today's submit and approve flow and list every change"

024 lists 17 changes and they are accurate against `count-lifecycle-service.ts`, `count-lifecycle.ts` and the
`/submit` page. It is **not** every change: it omits (a) the shipped assertions it contradicts or must edit (above);
(b) what the calendar, `/stock-takes` history and analysis do with a count in the new `PENDING_SIGN_OFF` status
(analysis only values `APPROVED`; `yardFigureFor` renders the status label, `analysis-service.ts:273-285`);
(c) the `parseAuditLines` format change needed for `FINISHED`. See Required change 2.

## CHECKPOINTS.md

CHECKPOINTS.md describes the correct final state of the shipped product, not of a spec-only round. Walked at the level
that applies:

- [x] Spec-first: three specs exist before any code, each with numbered criteria, owner decisions, out-of-scope and open questions.
- [x] No code, schema, migration, test or `Samples/` change on the branch.
- [x] One feature per spec; `feature_list.json` valid (`init.sh` "23 features, 1 in progress"); nothing marked `done`.
- [x] Typecheck and lint green.
- [ ] Full gate green: red in this container for environment reasons only (no `.env`, no `DATABASE_URL`); the branch changes no gated file. Not a defect of this work; recorded, not waved through.
- [ ] Specs consistent with the shipped specs they amend: see Required changes 1-3.

## Required changes

1. **Close the SUPER_ADMIN takeover path** (`specs/features/022-roles_home_menu.md` AC-3 and the Contract's guards paragraph at 022:100-108; `specs/features/023-super_admin_dashboard.md` AC-7 at 023:208-216). State that `resetProfilePin` and `clearAccountLock` (and `approveProfile`/`rejectProfile` where meaningful) refuse a target whose role is `SUPER_ADMIN` unless the actor is that same `SUPER_ADMIN` (own-PIN reset is the one allowed case, per 023 AC-7), in the service, with a typed error and an unchanged row, and add the test (`profile-admin-service.db.test.ts`) that an `ADMIN` actor's reset of the `SUPER_ADMIN` returns no PIN and changes no column. As written, widening `assertRole(actor, "ADMIN")` to admin-or-above lets any `ADMIN` become `SUPER_ADMIN` by resetting its PIN.
2. **Enumerate the shipped assertions each feature amends, and state the money-surface contradiction** (022 AC-10 at 022:228-236; 024 AC-14 at 024:395-402, AC-15 at 024:404-413, and the "Changes to today's submit and approve flow" list at 024:415-). Follow 009 AC-33's convention: name each changed existing assertion, what it checks before, what after, and why it is not weaker. At minimum: 022 → `tests/unit/export-workbook.test.ts:165` (`"€1.005"` text becomes a number plus `numFmt`); 024 → 009 AC-21/AC-22 and 011 AC-19 (the euro now appears on the admin `/submit` review, so "only two euro-bearing routes" becomes "three, the third admin-only"), `tests/unit/project-contract.test.ts` exact `unitPrice` lists, `tests/unit/stock-entry-contract.test.ts` scans and `MUTATION_EXEMPT`, and the `Record<CountStatus,…>` / audit-regex changes. Reword AC-14's "the only new money surface" so it does not contradict the shipped criteria it requires to be amended, and add to the 024 change list how `PENDING_SIGN_OFF` renders on the calendar, `/stock-takes` and `/analysis` (it carries no euro, like `SUBMITTED` today).
3. **Decide what Stock Calendar means for ADMIN** (022 D3/D4 at 022:28-35, tile table at 022:122-128, AC-6, and Open questions at 022:262-270). Today `ADMIN` lands on `/stock-takes` and `YARD_STAFF` on `/stock-entry`. Either (a) the tile resolves per role (`/stock-takes` for `ADMIN`/`SUPER_ADMIN`, `/stock-entry` for `YARD_STAFF`), or (b) keep `/stock-entry` for all and state that no home tile reaches `/stock-takes` and that this is deliberate. Record the choice as an owner decision or a new open question (Q4), name the loss of the "what needs approving" landing as an accepted tradeoff, and make AC-5/AC-6 assert the tile `href` per role accordingly. This is a clarification of existing scope, not new scope.

## Observations (non-blocking)

1. **Owner rulings are not verifiable from the repository.** Specs 022/023/024 carry an "Owner rulings, 2026-11-17" section (R1-R4), and `progress/spec_access_dashboard_open_items.md` says the owner answered four questions, but no commit message or file records the owner's words. R1 departs from the literal task text: the task says the *counter* sees the review with total value and enters the open-item prices; the spec gives that to `ADMIN`/`SUPER_ADMIN` and makes a `YARD_STAFF` counter finish with no money (new `PENDING_SIGN_OFF` status, `finishCount`, `FINISHED` audit event). It is internally consistent with #22 D5 and Part 6 of the domain model, and the spec-writer flagged the conflict honestly, but the owner should confirm this reading when approving; `PENDING_SIGN_OFF` is the largest addition beyond the task text.
2. **Spec size.** 023 is 296 lines and 024 is 519 lines, against the "under ~200 lines" aim; 024 bundles schema, lifecycle, export, records and two UIs in 15 very long criteria. It is within the 5-15 criteria cap, so not blocking, but the owner may prefer to split 024 (e.g. open items / sign-off).
3. 022 AC-1's "no second spelling of the hierarchy" scan should say which comparisons it allows (the last-admin and `otherRole` checks compare against one specific role, not the hierarchy).
4. 023 AC-1 redirects to `/home?denied=dashboard`, but nothing in 022 specifies that `/home` renders a `denied` notice (the shipped notice lives on `/stock-entry`, `page.tsx:70`, test id `access-denied`). Add a sentence or an AC line.
5. Some referenced test files do not exist yet (`src/server/auth/roles.test.ts`, `src/app/stock-entry/counts/[id]/summary/page.test.ts`); only some are marked "created by this feature".
6. `./init.sh` is not executable in this checkout (mode), so it must be run as `bash init.sh`; unrelated to this branch.

GOAL_STATUS: DONE
CHANGES_REQUESTED -> progress/review_mwkjd6rb.md
