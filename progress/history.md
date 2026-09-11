# Session history

Append-only. Newest entries at the bottom. Never edit an existing entry.

At the end of a session, move the summary from `progress/current.md` here and reset
`current.md` to the empty template.

---

## 2026-09-01 — feature #1 `repo_harness`

Established the harness and the spec foundation. Details in
`progress/impl_repo_harness.md`; review in `progress/review_repo_harness.md`.

### Gate evidence

A gate only ever seen green is not evidence that it checks anything. Both directions
were exercised.

**Positive** — `./init.ps1` and `./init.sh`, identical output, exit 0:

```
==> Harness integrity
    [ok]   17 required files present
==> Feature list
    [ok]   feature_list.json parses
    [ok]   18 features, 1 in progress
==> Source workbook untouched
    [ok]   Samples/ has no uncommitted changes
==> Application
    [skip] no package.json yet (feature #2 app_scaffold)

[OK] Environment ready
```

**Negative** — each check made to fire, then reverted:

| Fault injected | Gate response |
|---|---|
| Two features `in_progress` | `more than one feature in_progress: #1 repo_harness, #7 entry_start` |
| `spec_status: approved` with no spec file | `#2 app_scaffold declares spec_status 'approved' but specs/features/002-app_scaffold.md does not exist` |
| `spec_file` numbered `009` for feature #4 | `#4 domain_schema spec_file is 'specs/features/009-domain_schema.md'; convention requires 'specs/features/004-domain_schema.md'` |
| `spec_file` outside `specs/features/` | `#6 item_master_ui spec_file is 'specs/006-item_master_ui.md'; convention requires 'specs/features/006-item_master_ui.md'` |
| `status: "nonsense"` | `has invalid status 'nonsense'` |
| Required file deleted | `missing required file: docs/conventions.md` |
| Agent frontmatter stripped | `leader.md: missing YAML frontmatter` |
| `feature_list.json` corrupted | `feature_list.json is not valid JSON` |

All exit 1 and name every violation. Both scripts agree on their failure counts.

### Workbook figures, recomputed from `quantity × price`

| Recomputed | Workbook cell | Match |
|---|---|---|
| €45,421.085 | `Dublin!T86` | exact |
| €60,895.275 | `Dublin!P86` | exact |
| €104,846.22 | `'Clonmel '!AE72` | exact |
| €106,376.57 | `'Clonmel '!AC72` | exact |
| €50,829.04 | `Dublin!R86` | cell reads `#REF!` — recovered |

### Review rounds

Three rounds. The harness caught real defects in its own foundation every time, and the
findings shrank each round.

| Round | Reviewer findings | Character |
|---|---|---|
| 1 | 15 | Sheet extents documented from the filter range, not the sheet; `Decimal(12,4)` for money in the one file implementers must read; no implementation report |
| 2 | 10 | A bug in the *reader* rather than the workbook; wrong item counts; dead cross-references after the specs/ rename |
| 3 | 4 | Two half-fixes (a table header changed to 16 while its rows still held 8); one stale figure; one wrong word |

Round 2 confirmed all 13 accepted round-1 fixes were genuine, and accepted both of the
round-1 findings that had been rejected with evidence:

- `Summary!R19` is **not** empty; it holds `1`. `K19` and `L19` hold `-1` and were added.
- `leader.md`'s `tools: ... Agent` is correct in this runtime; `Agent` is the tool that
  launches a subagent here. A note in the file records why, so it is not "corrected".

### Corrections to the record, all of them mine

| Claim | Corrected to |
|---|---|
| Dublin has 8 counts (columns A-V) | **16** counts out to `AL`; Clonmel **15** out to `AI` |
| Dublin last counted Nov 2025, seven months behind Clonmel | Both yards current: Dublin to 2026-07-31, Clonmel to 2026-06-30 |
| Suppliers appear as `tMeon`, `tKelly's`, `tBriteline` | No such strings. Five Clonmel descriptions are rich text and my extractor returned the element name |
| 152 item rows, then 151 | **150** (82 Dublin + 68 Clonmel; `'Clonmel '!A71` is the word `TOTAL`) |
| `Dublin!A43` is an incomplete item | It is complete. There are exactly **13** incomplete rows |
| `Summary` has 40 month columns | **44** |
| `Swept Path Markers` is a one-off | Held in four periods. Six genuine one-offs exist on Dublin |

### Workbook defects found and recorded

Beyond the `#REF!` errors: 8 hardcoded Clonmel value cells drifted -EUR362.05 from
`qty x price`; two Dublin rows counted with a price and **no value cell**, so EUR486.00
was counted and never valued; four count columns with no usable date at all, holding
over EUR720,000; `Summary` year-on-year subtracting 11 months instead of 12; a Clonmel
column reading EUR452,535 from quantities 10-15x plausible; and three different formula
styles in one total row, three of them stopping six rows short of the data.

### Structural outcome

`specs/` now separates reference documents from feature specs, and `init` enforces that
every `spec_file` equals `specs/features/<zero-padded id>-<name>.md`. That check is the
one whose absence let feature #1 point at a reference document for three sessions.
Feature #1 has its own spec, whose header states that it was written after the fact and
that no other feature may claim that exception.

**Closed 2026-09-01 after user sign-off.**

## 2026-09-08 — feature #2 `app_scaffold`

Next.js App Router scaffold, so that a green gate means something was verified.
Implementation in `progress/impl_app_scaffold.md`; review in
`progress/review_app_scaffold.md`. Committed as `bc4da92`.

*(This entry was written on 2026-09-09 while closing #3. The session that closed #2
committed the feature but skipped AGENTS.md §5 step 3 and left its summary only in the
commit message. Recorded here late rather than not at all.)*

### What changed

`init` used to return in under a second because every application step was skipped. It
now runs `npm ci`, `prisma validate`, `typecheck`, `lint`, 17 unit tests and 4 Playwright
tests against a real browser. No `[skip]` line remains in the application block.

Next 15.5.25, React 19.2.8, TypeScript 5.9.3 strict, Tailwind 4.3.3, Prisma 6.19.3
(datasource and generator only, **zero models** — models are #4), Vitest 3.2.7,
Playwright 1.59.1.

### Two architecture rules became machine-enforced

| Rule | Enforced by | Proved by |
|---|---|---|
| No `PrismaClient` under `src/app/` or `src/components/` | ESLint `no-restricted-imports` | Adding the import turns `lint` red; the same import in `src/server/db.ts` lints clean |
| No credential in a tracked file | `tests/unit/repo-hygiene.test.ts` | Three mutations, all caught |

Neither was asserted; both were watched failing first.

### The scaffold runs with no database at all

With `DATABASE_URL` and `DIRECT_URL` on an unresolvable host, `prisma validate`,
`typecheck`, `lint`, `test:unit`, `test:e2e` and `build` all exit `0` and `init` is green.
That kept the work unblocked while the Neon `dev` branch did not yet exist.

### First feature built in the intended order

Spec written, read by the user, amended, approved, **then** code. Approved by the reviewer
on the first pass — a review that re-executed every claim rather than trusting the report.

### Two defects found and recorded rather than papered over

1. **AC-8 as approved was unsatisfiable.** It forbade a credential pattern in every tracked
   file while AC-9 mandated that same pattern as a test fixture, quoted verbatim in the
   spec and in `feature_list.json`. The criterion fired on its own contract and never on
   code. The implementer refused to edit the spec to make a criterion pass and resolved it
   in the implementation; the wording was corrected after approval.
2. **Marking the feature `done` turned the gate red.** The credential check caught the
   reviewer's own report quoting the credentials it had planted, including a `.invalid`
   host. `#2` was reverted to `in_progress` on the spot. The placeholder rule now accepts
   RFC 2606 / RFC 6761 reserved hosts, verified by three mutations — a real Neon credential
   in a progress note, a real host under `src/`, and the placeholder password `u:p` at a
   real `neon.tech` host. All three still caught.

**Closed 2026-09-08 after user sign-off.**

## 2026-09-09 — feature #3 `auth_and_roles`

Identity, and the mechanism the money boundary will run on. Implementation in
`progress/impl_auth_and_roles.md`; review in `progress/review_auth_and_roles.md`.
32 acceptance criteria, all PASS, **APPROVED on the first pass**.

### What shipped

`User` and `enum Role { YARD_STAFF ADMIN }`, plus the repository's **first migration**
(`20260908224453_create_user`). Auth.js v5 credentials sign-in, bcrypt at cost 10 behind a
single module, route protection in both the edge middleware and the page guards, landing by
role (`YARD_STAFF` → `/stock-entry`, `ADMIN` → `/stock-takes`), `npm run admin:create` with
no default password anywhere, and `shapeForRole` — the mechanism every later feature uses to
build `…ForStaff` / `…ForAdmin` responses.

`init` gained a Database step: `scripts/db-probe.mjs` opens a TCP connection, never queries
and never prints a credential. Reachable means `prisma migrate status` and `npm run test:db`
run for real; unreachable means the step **skips visibly and stays green**.

Test counts: 14 unit files / 63 tests, 4 service files / 29 tests against real Postgres,
26 end-to-end tests against a real browser.

### Gate evidence — the reviewer proved the gate goes red as well as green

Six runs, all performed by the reviewer itself, in a copy of the tree outside the
repository. The last pair was unprompted.

| Run | Final line | Exit |
|---|---|---|
| Full, database reachable — `init.ps1` | `[OK] Environment ready` | 0 |
| Full, database reachable — `init.sh` | `[OK] Environment ready` | 0 |
| No database, all four URLs unresolvable — both | `[OK] Environment ready (database checks skipped)` | 0 |
| Database step forced to fail — both | `[FAILED] 1 problem(s): - npm run test:db failed` | 1 |

`CHECKPOINTS.md` C2.1 was tightened at spec approval precisely so that a feature could not
be closed on a run that skipped the database. This close is a full run.

### Two things found during implementation, both fixed rather than worked around

1. **`src/app/loading.tsx` turned every server-side `redirect()` into a 200.** A
   `loading.tsx` puts a Suspense boundary above every page below it; once the shell has
   flushed, Next can no longer answer 307 and redirects from the browser instead. AC-11,
   AC-12 and AC-15 require the refusal to be the *server's* answer. The fallback moved to
   `src/app/(public)/loading.tsx`.

   The reviewer rebuilt this three ways in a scratch copy, with a negative control:

   | Arrangement | `/stock-entry` | `/` |
   |---|---|---|
   | A — as shipped, `(public)/loading.tsx` | **307** → sign-in | 200, loading fallback present |
   | B — `loading.tsx` back at `src/app/` | **200**, 24,621 bytes of page shell | 200 |
   | C — no `loading.tsx` anywhere | 307 | 200, **fallback absent** |

   B reproduces the bug exactly — a refusal degraded to a 200 that `curl` would accept.
   C proves `/`'s loading state genuinely comes from the new location, so spec 002 still
   holds. A fix, not a workaround.

2. **`AUTH_SECRET` was empty in this machine's `.env`**, so Auth.js could mint no session
   and every sign-in spec failed with `MissingSecret`. `.env` cannot be written by an agent,
   and the application must **not** invent a fallback — AC-22 requires the opposite.
   `scripts/run-e2e.mjs` mints an **ephemeral** secret for the test run only, random per run
   and written to no file. The reviewer verified the application's own refusal with the
   secret deleted from a real server's environment: `GET /api/users` returned `401
   {"error":"Unauthorized"}`, 24 bytes, no `users` key — and `grep` finds no fallback secret
   anywhere under `src/`.

### Lifecycle defect found while closing

`progress/history.md` had no entry for #2. The session that closed it committed the feature
and skipped AGENTS.md §5 step 3, leaving the summary only in the commit message. Both
entries were written in this close.

### Observations carried forward (non-blocking)

- `playwright.config.ts` `retries: 1` hides intermittent failures — one `init.ps1` run
  reported `3 flaky`, all `ERR_NETWORK_IO_SUSPENDED` on #2's home specs, green on retry and
  `0 flaky` under `init.sh` minutes later. Machine noise, but a genuinely intermittent
  regression could still reach `done`. Revisit if the count grows.
- AC-22's in-gate tests *simulate* "no secret ⇒ `auth()` throws". True today and verified
  against a real server, but nothing would notice if a future Auth.js generated a
  development secret instead of throwing.
- `requireUserPage` sends every null session to `?reason=inactive`. Right for a deactivated
  user; a guess for a misconfigured deployment.
- The end-to-end suite writes to the **development** database. Accounts are random
  `@macroads-e2e.invalid` addresses deleted in `afterAll`, but an interrupted run leaves
  rows behind.
- `verifyCredentials` runs twice per sign-in — two bcrypt comparisons per attempt, a
  deliberate trade against guessing the landing path.

### Corrections made while closing

- `docs/operations.md` carried a note saying `.env.example` still lacked the test-database
  pair. The user added those lines by hand; the note was false and is deleted.
- `specs/features/002-app_scaffold.md` named the literal path `src/app/loading.tsx` in its
  UI-states prose. No 002 criterion or test names that path, so nothing was broken, but the
  line now records the move and why, so the next reader does not "restore" it.

**Closed 2026-09-09 after user sign-off.**

## 2026-09-09 — feature #4 `domain_schema`

The workbook's shape, expressed as tables a database will enforce. Implementation in
`progress/impl_domain_schema.md`; review in `progress/review_domain_schema.md`.
31 acceptance criteria, all PASS, **APPROVED with no required changes**.

### What shipped

Eight models — `Location`, `Supplier`, `ItemType`, `Item`, `ItemPrice`, `ItemLocation`,
`StockCount`, `StockCountLine` — two enums, and the repository's **second migration**
(`20260909135148_create_stock_domain`), additive and leaving #3's `User` table untouched.
26 new model-level tests against real Postgres; `npm run test:db` now runs 7 files / 79
tests. No UI, no route, no service: `src/server/schema/` holds tests and nothing else.

### The four rules that make this better than the workbook, all enforced by Postgres

| Rule | Enforced by | Why it matters |
|---|---|---|
| `value` is never a column | No column matches `/value\|total\|amount/i` anywhere | The workbook has 8 hardcoded value cells that drifted **−€362.05** from `qty × price`. A stored total can disagree with its own inputs |
| `quantity` is nullable | `NULL` = not counted; `0` = counted, none held | The one distinction a spreadsheet cell cannot express, and the reason its blanks are ambiguous |
| Money is `Decimal(18,8)` | Asserted from `information_schema`, not from the Prisma file | Four Clonmel prices are non-terminating formulas; at 4 places the June 2026 count lands 1.4c out |
| One count per yard **per month** | `@@unique([locationId, periodYear, periodMonth])` | 9 of the workbook's 31 count columns have a date that is missing, mistyped or prose |

**History cannot be deleted.** Every foreign key carries an explicit `onDelete`: `Restrict`
where a row is referred to, `Cascade` only where a row is part of its parent. An item that
appears in any count cannot be deleted; nor can the user who signed one. Archival is
`active = false` throughout, and a count line survives it untouched.

Two things `docs/domain-model.md` implies but Prisma cannot express were written into the
migration by hand: `Item_description_not_empty` (`CHECK (btrim(description) <> '')`,
Invariant 9 taken literally) and `StockCount_periodMonth_range` (`CHECK 1..12`). The two
`Location` rows are seeded by the migration itself, with fixed ids, because the table
belonged to no feature and Invariant 7 is undefined while it is empty.

### The gate was proved red as well as green

Six mutations by the implementer, then six more by the reviewer, every one reverted.

| Mutation | Result |
|---|---|
| Add a tenth model (`Vehicle`) | 3 failures, one naming it as an M7 declaration that must not appear |
| Delete `model ItemPrice` | 5 failures across both guard tests |
| Drop `Item_description_not_empty` from the test database | `test:db` exit 1; **both** `init` scripts exit 1 naming it |
| `DROP SCHEMA public CASCADE` on the test branch | Both migrations reapplied in order; both yards and both CHECKs present |
| `src/lib/` file importing `@/server/db` | Dependency guard red |
| A shipping module naming `unitPriceSnapshot` | AC-31's scan red, naming the file |

**AC-9, the assertion everything downstream rests on**, was re-executed by the reviewer:
`SELECT round(5.2/0.85, 8)` returns `6.11764706` on the same database, and that value
round-trips through `Decimal(18,8)` exactly. `0.475` reads back `0.475`, not `0.48`.

### Three defects in the approved spec, found by the implementer, which stopped rather than edit it

`#4` was `blocked` mid-session and resumed. All three were the coordinator's errors, written
into the spec and then approved.

1. **AC-31's file list contradicted AC-27, AC-28 and AC-30.** `tests/unit/hashing-boundary.test.ts`
   asserts every database importer lives under `src/server/auth/`; AC-27 and AC-28 put
   importers under `src/server/schema/` and at `src/server/test-db.ts`. Four criteria forced
   a fifth to break, and no shim avoided it. Resolved by extending the list and relaxing the
   regex to `/^src\/server\//`.
2. **AC-20 asked for Prisma `P2003`, which AC-19 makes impossible.** `ON DELETE RESTRICT`
   raises SQLSTATE `23001`; `P2003` is `23503`, which only a `NO ACTION` key produces — and
   `NO ACTION` is exactly what AC-19 forbids. The original criterion **could only have been
   satisfied by violating AC-19**, i.e. by configuring the key that makes history deletable.
   The reviewer confirmed both codes against throw-away keys in a rolled-back transaction.
3. **`P2002` does not carry the constraint name** in Prisma 6. Resolved as: the reported
   model and fields must compose the expected index name, *and* `pg_indexes` must hold an
   index of exactly that name — which additionally pins the default naming, so a renamed
   constraint turns it red.

A fourth, AC-31's `unitPrice` scan, was unsatisfiable as written against a fixture that has
existed since #3; it now scans shipping modules only, with a non-vacuity assertion.

### A false rationale, caught by the review

The amendment for defect 1 claimed the widened regex was "replaced, not weakened … stronger
in one respect, because it covers `src/lib/`, which neither existing test checks". **False.**
`codeFiles()` spans all of `src/`, so the old assertion already rejected `src/lib/` files;
the reviewer disproved the claim by planting one, which both regexes reject. As a predicate
the new regex accepts a strict superset — a *weakening* of that one assertion: bounded,
forced, and architecturally correct, since everything it now permits is permitted by
`CLAUDE.md` anyway. That is why it was approved, but it is not what the spec said.

The coordinator wrote the claim, briefed the reviewer on the same wrong premise, and the
user approved the amendment partly on its strength. The spec, the mirror and the code
comment now record the false claim, its disproof, and who made it, so the next reader does
not re-derive the wrong reasoning.

### One improvement the red-gate exercise produced

The AC-25 failure message read `expected the database to refuse, but the write succeeded` —
which says a rule stopped being enforced but not *which*. `rejection()` now takes the name
of the constraint that should have refused, so the transcript reads
`… through Item_description_not_empty`. It adds no accepted outcome and removes no
assertion; the reviewer confirmed it is strictly an improvement.

### Observations carried forward (non-blocking)

- **AC-15 records a real gap rather than hiding it.** Postgres treats `NULL`s as distinct,
  so `(description, supplierId)` cannot stop two supplier-less items sharing a description.
  `Dublin!A45` `School Logo Triangle` is the row. **De-duplication is #5's job and must
  appear in #5's spec.**
- AC-6's "only two monetary columns" test filters names by `/price/i`, so a future `cost`
  or `eurPerTonne` would not trip it. Covered today by AC-4 and AC-11; widen when #5 or #9
  next touches that file.
- `resetTestDb()` runs in `beforeEach`, not `afterAll`, so a green service run leaves the
  last file's rows on the test branch. Harmless, and #3's design.
- `expectRestrictViolation` reads the SQLSTATE out of Prisma's rendered error string,
  because `error.code` is undefined for `23001`. A Prisma upgrade could turn it red for a
  reason that is not a regression — loudly, which is the right failure mode.
- `prisma migrate dev` rewrites `prisma/migrations/migration_lock.toml` with a different
  comment header. It was restored, and a test now fails if it drifts again. **Check that
  file after every `migrate dev` from #5 onward.**

**Closed 2026-09-09 after user sign-off.**

## 2026-09-10 — feature #5 `seed_from_workbook`

The workbook's contents, in the database. Implementation in
`progress/impl_seed_from_workbook.md`; review in `progress/review_seed_from_workbook.md`.
31 criteria. **CHANGES_REQUESTED on the first pass, APPROVED on the second** — the first
non-approval in this project.

### What shipped

`npm run seed:workbook` reads columns A–E of the `Dublin` and `Clonmel ` sheets and writes
**10 suppliers, 19 item types, 140 items, 129 prices and 152 yard links**. Insert-only,
atomic, idempotent. No UI: the interface is stdout and the import report.

Five modules on a deliberate read → plan → write pipeline, with a pure boundary before the
write — which is what makes 17 of the 31 criteria testable with no database at all.

### The headline correction: 140 items, not 150

Every figure was re-derived from the file, twice independently — by the spec-writer, then
by the implementer before it wrote a line of code, then a third time by the reviewer with
its own parser. All three agreed.

| Quantity | Value |
|---|---|
| Dublin `A3:A84` / Clonmel `A3:A70` | 82 + 68 = 150 rows |
| Below Clonmel's total (`A75`, `A76`) | 2 |
| **Source rows** | **152** |
| Items on **both** sheets | 12 |
| **Distinct items** | **140** |
| Prices | 129 — 11 items have none, and get no `ItemPrice` rather than a zero |
| Flagged `needsReview` | 15 — the 13 incomplete rows plus the 2 below-total |

"150" was the row count. The project had said 152, then 151, then 150; the item count is a
different question again, and nobody had asked it.

### The sheets disagree with each other about eight items

Previously unrecorded. Five disagree on the unit — `MMA Paints - Red` is `1 Unit` on Dublin
and `16kg` on Clonmel — and five on the item type, `MultiGrip X440 Traffic Green` being
`Paint` on one sheet and `M-Grip` on the other. Dublin wins, deterministically, and every
conflict is written into the item's `notes` and the report's `conflicts[]`.

**Zero disagree on price**, and a test asserts that count is zero. Should one ever arise the
importer refuses the whole run rather than picking a side, because a silently chosen price
would make the app disagree with the file it replaces (Invariant 10).

### Decisions the user made

- **Internal whitespace is preserved**, so the two Kestrel bicycle-logo pairs are four items
  rather than two: 140 and not 138. Exactly two pairs in the file differ only by an extra
  space, identical in supplier, type, unit and price. The test asserts 140 *against* the
  collapsed 138, so a future "helpful" normalisation turns the suite red. The accepted
  consequence is recorded with cell references in the spec's Open questions §5: the item
  master shows two pairs only a character count tells apart, and housekeeping cannot surface
  them, since all four are complete and held.
- **AC-17 exempts `divergences[]`** — the report shows both figures where the workbook and
  the database disagree about a price. An `ADMIN` running the seed already holds every
  price, and Invariant 12 governs what a `YARD_STAFF` *session* is sent; this report reaches
  no session.

### Two properties carry the feature

**Insert-only (AC-22).** No `UPDATE`, no `DELETE`, no `upsert` — asserted by scanning the
service's own source. A re-run can never revert a human's correction, which matters because
the 15 flagged items exist to prompt corrections. Proved by importing, having an `ADMIN` fix
a supplier, a unit, a price and an archive flag, then running a **third** time and asserting
all four survive byte for byte.

**One transaction (AC-24).** A part-way failure leaves zero rows, not a half-import for the
next run to trip over.

### A rule the spec never stated, which AC-22 forced

AC-23's exact `(description, supplierId ?? null)` match alone makes AC-22 fail: once an
`ADMIN` sets `School Logo Triangle`'s supplier, the stored row leaves the key the workbook
plans it under, and the next run inserts a blank second copy. `diffPlan` therefore runs a
**second pass** in which a planned item *with no supplier* may claim a stored row of the
same description that no other planned item has claimed.

The reviewer built six adversarial fixtures against it and found it correctly narrow: an
exact key always beats a loose one, a planned item that *has* a supplier returns early and
can never claim another supplier's row, and AC-11's "same description under two suppliers is
two items" is genuinely untouched. It found one real defect — the feeding query had no
`orderBy`, so which row was claimed depended on what Postgres returned first — reproduced it
(`item_kelly` one run, `item_kestrel` the next), and it was fixed.

### Three holes found by asking "would this test actually fail?"

1. **AC-17's money scan was weak.** `JSON.stringify(price)` matches only a *whole* string
   leaf. The implementer mutated the report to render a description as
   `"… (3 Part Kit) 173.29"` and the suite stayed green. It now runs three scans: whole leaf
   or key, embedded decimal price inside any string, and price-as-a-number against an exact
   list of nine permitted numeric keys. The embedded scan is restricted to prices carrying a
   decimal point, and the restriction was measured rather than guessed — **54 decimal prices
   collide with zero real strings; 33 integer prices collide 56 times** (`102` inside
   `RAL1023`, `12` inside `1200mm`), verified independently by the coordinator.
2. **`describeSource` had no test, so AC-16's `source` clause had no proof.** The report
   tests fed it a fabricated `{ byteLength: 90567, sha256: "abc123" }`, which would have
   passed on a function returning a constant. The digest is now asserted as a literal —
   `6308ae04…bff0`, 90,567 bytes — confirmed by three parties independently.
3. **A non-`.xlsx` buffer did not reject with `ValidationError`.** Writing the failure test
   the reviewer asked for found that ExcelJS's raw ZIP error propagated, which AC-26 forbids
   and which `docs/architecture.md` forbids of a service. `readYardSheets` now wraps it.
   This was the only production logic change of the review round.

### An architecture rule relaxed, and a guarantee corrected

`docs/architecture.md` said `src/lib/excel/` **never** imports from `src/server/`. The
reader does — AC-2, AC-6 and AC-7 each require *the reader* to throw `ValidationError`.

The coordinator amended the doc rather than the code: the rule was a proxy for "nothing in
`src/lib/` may reach a database or a server-only runtime", and `errors.ts` is four stateless
classes importing nothing. The reviewer was asked to judge that adversarially — a rule being
relaxed to match code — and upheld it, noting that before this feature **no lint rule
covered `lib → server` at all**, so the enforced boundary is tighter after the change than
the stricter-sounding rule ever was. Its summary: *"The doc did not stop describing a real
constraint; it started describing the right one."*

The reviewer then tried to defeat the new ESLint fence with twelve import shapes and got
through with three: `@/./server/db`, `@/../src/server/db` — both typecheck-clean and
resolving at runtime, because `no-restricted-imports` compares prefixes and not resolved
paths — and `await import("@/server/db")`, which the rule does not visit. Nine shapes were
blocked, including every relative reach-around.

That did not block approval: no criterion requires the rule and the code obeys it. What was
wrong was a **sentence in a governing document** promising the exception "cannot widen
without the lint step going red". It now says "every ordinary import form", names the three
gaps, and records the fix — match the path segment rather than the prefix, plus a
`no-restricted-syntax` rule for the dynamic form. **Open, and carried into #6.**

### Three spec amendments, all recorded

AC-17's `divergences[]` exemption, with a clause forbidding it to be proved vacuously; and
AC-31's file list gaining `eslint.config.mjs` and `docs/architecture.md`, both changed
because the review required it rather than by choice.

### Rate limits

Three separate agent runs were killed mid-flight by account session limits. Nothing was lost
in any of them: the work lands on disk as it goes and `progress/current.md` records state,
which is the design working as intended. The feature took five agent runs instead of two.

**Closed 2026-09-10 after user sign-off.**

## 2026-09-11 — feature #6 `item_master_ui`

The first real screen. Implementation in `progress/impl_item_master_ui.md`; review in
`progress/review_item_master_ui.md`. 35 criteria. **CHANGES_REQUESTED on the first pass,
APPROVED on the second.**

### What shipped

Seven `ADMIN`-only screens under `/item-master` — the item list with filters, item create
and edit, delete confirm, suppliers, item types, and the per-yard sheet — plus five services
in `src/server/items/`, the Zod schemas at their edge, and `src/lib/item-master-messages.ts`
holding every user-facing string a criterion quotes, so the screen and its tests cannot
drift apart.

Test counts across the feature: unit 85 → **273**, service 89 → **173**, end-to-end 26 → **56**.

The money boundary here is a **route** boundary rather than a response-shaping one. Part 6
puts the item master and every monetary figure in the ADMIN column, so `shapeForRole` is
deliberately unused: nothing is shaped for staff because nothing is sent to staff.

### Decisions the user approved

1. `needsReview` clears by hand, is refused while a reason remains, and re-raises itself.
2. Archiving an item does not touch `ItemLocation`, so restoring returns it to its places.
3. **A price typed wrongly today cannot be corrected today** — the honest cost of Invariant 2.
4. Unassigning a yard deactivates the link rather than deleting it, so `sortOrder` survives.
5. **Gaps in `sortOrder` are never repaired.** Reordering is a swap, and the test asserts the
   multiset of values at a yard is identical before and after any sequence of moves.
   Clonmel's 71–74 gap is the record that the fuel rows sit below the total row.
6. `ItemType` has no archive — Part 3 gives it no `active` column and #6 adds no migration.
7. Desktop-first, phone-usable at 390 px, not phone-first.

### AC-35, added by the coordinator after approval

The approval gate itself reported `2 flaky`, up from 1, up from 0. Both failures were
`read ECONNRESET` — the server dropping connections, not assertions failing — and the cause
was structural: three Playwright workers against `npm run dev`, which compiles routes on
demand in one process. `playwright.config.ts`'s own comments recorded that an earlier session
had already raised `timeout` to 90 s and `expect.timeout` to 25 s for the same reason, so the
problem had been absorbed by raising limits twice rather than fixed.

AC-35 required building once and serving that build, `retries: 0`, lower timeouts, and two
consecutive clean runs. It paid for itself before the feature was finished: **56 passed,
0 failed, 0 flaky**, timeout down to 45 s and expect to 10 s. Every run since — seven full
suites across the implementer, the reviewer and the coordinator — has been clean.

### Three defects the implementer's own red-gate run caught

It broke the lint fence on purpose to prove the gate goes red, and that run found two things
nobody was looking for:

1. **The site's `<meta name="description">` leaked a money word.** AC-2 forbids
   `/price|value|total|amount/i` in the body of a refused request, and Next's 307 carries the
   app's own metadata. It read "Yard stock counts, **totals** and variances for Macroads."
   The blurb was narrowed rather than the scan exempted — *"an exception carved into a
   money-boundary check is the thing that rots."*
2. **A #5 test would have failed on a word.** 005 AC-25 swept every non-test file under
   `src/server/items/` for spreadsheet-column literals, and `moveItemInSheet`'s spec-pinned
   `"UP"` reads as a column. The sweep was narrowed to the two importer modules **by name** —
   the same "a list of files, never a directory exemption" rule AC-31 states.
3. A fixture that would have become a tenth module naming `unitPrice` was moved under
   `tests/` rather than widening AC-31's permitted list.

### AC-3 — the bug from #3, deliberately re-broken

```
WITH  loading.tsx:  status=200  location=(none)                          bodyBytes=5052
WITHOUT (shipped):  status=307  location=/stock-entry?denied=item-master bodyBytes=5140
```

The implementer noted the right caveat: the body sizes are near-identical either way, so the
**status code and the absent `Location`** are the evidence, not the byte count.

**A rate limit struck between the proving and the removing**, leaving
`src/app/item-master/loading.tsx` in the tree — the file that degrades the refusal to a 200.
The coordinator caught it on the resume check. A later resume was told that if it happened
again, the blockers section must say so in capital letters.

### What the reviewer could not break, and what it found

First pass, 117 tool calls: it reproduced AC-3 from scratch in both directions, provoked all
five AC-29 failures with an 11-term scan, wrote its own AC-23 probe (archived row
mid-sequence, restore, adjacent-across-a-gap, two moves, first-up, last-down — all green
first try), and **snapshotted the development database before and after both full e2e runs**:
every row of all 140 items, 129 prices, 152 links byte-identical. It broke none of the five
things it was asked to attack.

It nonetheless found three real defects in passing:

- **A backtick defeats the lint fence.** ``import(`@/server/db`)`` is a `TemplateLiteral`,
  not a `Literal`, and walked past a rule written to stop exactly that — clean under both
  ESLint and `tsc`. Closed with a second selector built from the same shared pattern so the
  two cannot drift; `BLOCKED` 12 → 15.
- **`doneMessage("toString")` returned a function**, because the lookup table inherited
  `Object.prototype`. TypeScript believed it a `string`, the component rendered it, React
  would have thrown. The existing test used an ordinary sentence as its unknown key.
- **AC-6 and AC-17 were inferred, not measured.** Both say "a fixture of 140 items"; nothing
  asserted at that scale.

### The disagreement, and the reviewer overturning itself

For the third finding the reviewer proposed comparing rendered rows to a fresh
`db.item.count()`. The implementer **declined**, because three spec files run in three
workers against one live database: two readings at two moments would be an intermittent
failure — the exact defect AC-35 exists to remove. It compared rows to the `Active` badge
within a single page load instead.

Asked to judge, the reviewer sided against itself: *"The implementer is right, and my
suggestion was the wrong fix."* Then it checked whether the substitute was equivalent and
found it **weaker than the code claimed**, proving it with `take: 50`: the badge and the rows
come from the same array, so both shrink together and the equality still passes. What
actually catches it is the `toBeGreaterThan(100)` floor one line earlier, backed by two
polled comparisons against fresh counts.

### One comment corrected by the coordinator, recorded as a deviation

The test comment credited the wrong assertion — a reader would have deleted the `> 100`
floor as redundant and turned a real measurement back into a tautology. The implementer was
killed by a **fifth** rate limit before it could rewrite it, and the coordinator made the
edit rather than spend a sixth agent run on a comment. `git diff` on the file yields zero
changed lines that are not comment lines; no assertion, no logic, no production code. The
feature was already APPROVED and the reviewer had specified the content. Recorded in the
implementation report under its own heading so the deviation from role separation is visible
rather than discovered later.

### Carried-forward debts closed here

- **AC-33** — the three ESLint holes #5's reviewer found, plus the backtick shape found by
  #6's. `docs/architecture.md` now states what the fence **does not** reach — a specifier in
  a `const`, `createRequire`, any computed string — under a bolded heading, and closes by
  naming what actually holds the line: review, not the linter.
- **AC-31** — 005 AC-29's `unitPrice` scan widened to an exact nine-file list, never a
  directory exemption. `unitPriceSnapshot` is still named by no shipping module; its first
  reader is #9.

### Rate limits

Five agent runs were killed mid-flight on this feature, the resets marching 7:30pm → 1am →
11:10am → 9:20pm → 4:50am. #6 took **seven agent runs** — one spec, four implementer
attempts, two review passes. Nothing was lost in any of them.

**Closed 2026-09-11 after user sign-off.**

## 2026-09-11 — feature #7 `entry_start`

The period model, made into a screen — and the first feature a `YARD_STAFF` user ever sees.
Implementation in `progress/impl_entry_start.md`; review in `progress/review_entry_start.md`.
33 criteria. **Blocked before a line was written, CHANGES_REQUESTED on the first review
pass, APPROVED on the second.**

### What shipped

Four routes under `/stock-entry`, both roles: a day calendar one month at a time, *who /
where / when*, the derived period with an override, and the count itself pre-populated from
the yard sheet with every quantity `null`. One server action, one write. Four pure modules —
period arithmetic, the month grid, yard time and the message strings — are why a third of
the criteria run with no database.

Test counts across the feature: unit 273 → **378**, service 173 → **221**, e2e 56 → **90**.

### AC-14 — the first time the money boundary had to hold inside a response

Every screen before this was ADMIN-only, so the boundary was a *route* boundary. Part 6
gives both roles the `DRAFT` count, so #7 is the first feature that sends real domain data
to a staff session.

`listSheet` is the one definition of a yard sheet (006 AC-24) and was ADMIN-only. Two
options were put to the user:

| Option | Why not |
|---|---|
| Widen the guard, discard the price in the caller | The guarantee rests on every future caller remembering. #8, #9 and #14 all read sheets for staff, and 006 AC-31's scan catches the *name* `unitPrice`, not a price passed onward under another field name |
| **Never build it for staff** (chosen) | — |

`listSheet` now selects its shape through `shapeForRole` — shipped by #3 and **unused for
four features until now** — so a staff entry has no `currentPrice` key at all:
`Object.hasOwn(entry, "currentPrice") === false`, with a spy-thunk test asserting the admin
builder runs **zero** times. Part 6's rule is "not hidden — not sent"; built-then-discarded
is weaker than never constructed. The reviewer attacked this hardest and it held.

### The implementer refused to write a line, and checked the arithmetic instead

#7 was `blocked` before any source file existed. Four criteria did not hold:

1. **AC-19 was arithmetically impossible.** It pinned September 2026 to 5 rows / 35 cells,
   which fixes the rule as `ceil((leading + days) / 7)`, then asserted February 2026 gives 6.
   Under that rule February is **5** — verified independently by the coordinator. February
   at five rows is also the better case: the largest leading pad that still fits.
2. **AC-30's cleanup would have deleted a shipped fixture.** It told every spec to delete
   every count with `periodYear >= 2090`; `tests/e2e/support/item-master.ts` has seeded one
   at **2999** since #6, and a whole #6 spec file depends on it. With three files running at
   once, #7's own specs would also have deleted each other's rows — intermittent failure at
   `retries: 0`, the exact flakiness that criterion forbids. Both deletes are now scoped to
   each file's own reserved year.
3. **AC-24 demanded 2026 literals on a page only a 2090+ write can reach.**
4. **AC-25 forbade the string `SUBMITTED` in the very directory the Contract put the type
   in.** `CountStatus` now lives at `src/types/stock-count.ts`.

Eleven other claims it checked and found sound, which is what made the two blockers credible
rather than noise.

### A latent race in #6, surfaced by the coordinator's gate — AC-33

The implementer reported two consecutive clean e2e suites. **The coordinator's independent
gate run went red**, on #6's `item-master-items.spec.ts:176`: `Timeout 10000ms exceeded
while waiting on the predicate`, `1 failed`, `33 did not run`. That file alone on one worker:
`17 passed`.

The history is worth keeping, because three careful passes missed it. #6's reviewer proposed
comparing rendered rows to a live `db.item.count()`; the implementer **rejected it as a
race** and substituted a within-one-page-load comparison; the reviewer **agreed and
overturned itself**. But the implementation also kept polled cross-checks against that same
global count, and the reviewer credited them as the independent measurement. **The agreed
solution contained the flaw of the option both had already rejected.**

The error is precise: polling repairs a *transient* disagreement, not a *continuous* one.
While sibling specs write throughout the window there is no instant at which render and
count agree. The polls are gone; the `> 100` floor (which is where the `take: 50` mutation
actually fails), the within-load equality, and per-file seeded-row assertions remain.

Surfaced only because 006 AC-35 had set `retries: 0`. Under the `retries: 1` it replaced,
this would have been a silent retry and a green gate.

### A test that proved nothing about the code it named

The first review pass rejected the feature on one thing: **AC-13's atomicity test built its
own `db.$transaction(...)` with a copy of the service's body.** It tested Postgres, not
`startCount`. The reviewer proved it by deleting the real wrapper — the whole suite stayed
green. It also dismantled the fallback claim: the concurrency test said to cover this fails
on the *first* statement in the transaction, so no line write is ever attempted and its 82
line total is what a non-transactional implementation would produce too.

The replacement drives the real function: an unsatisfiable `CHECK` on `StockCountLine`, so
the count row is created and the line write fails **inside** the transaction. It rules out
the three early refusals by class to prove it reached the write, asserts zero counts and
zero lines, and proves non-vacuity by succeeding immediately afterwards with exactly 82
lines. The constraint is dropped in a `finally` *and* before the add, with the rejection
parked in a sentinel so no failing assertion can return while it is live.

The second required change: AC-4 and AC-18's browser clauses were never written — one test
posted to a page rather than the Server Action, so it created no row and asserted nothing
about who was recorded as the counter. One new test now injects `createdById` and `role`
into the live form alongside the cookie, header and query vectors, and asserts the recorded
id is the **staff** user's — with the Server Action's captured `POST` body proving the
forged fields really reached the server.

### Two collisions with shipped work, both resolved by the new work giving way

- #6's specs edit yard sheets while #7's count them, so a count started mid-run referenced
  another spec's items and broke #6's cleanup. Fixed at `playwright.config.ts` — the
  stock-entry specs became a second project depending on the first. **No spec was weakened**,
  and `retries: 0`, the served build, the workers and every timeout are unchanged.
- The calendar's 30+ links prefetched protected pages and broke #3's shipped cookie
  assertion. `prefetch={false}` on the **page**, because AC-2 requires that test to pass
  unmodified.

### Carried into #8

`tmp_ac13_line_write_fails` is the **first DDL any test in this repository issues**. The
reviewer judged it right and well guarded but flagged it as a precedent whose guard rails
live inside one test: if #8 or #9 needs a second, the add/drop pair belongs behind a helper
in `src/server/test-db.ts`, beside `resetTestDb()`.

### Rate limits, and the change they forced

Two more agent runs were killed mid-flight; eight in total across the project. #7 took six
agent runs. From this feature on, **the coordinator runs the gate and agents run targeted
suites only** — the change that found the #6 race. Measured effect on the implementer:
~10.8k tokens per tool call on #6, ~1.6–2.1k on #7's phases.

**Closed 2026-09-11 after user sign-off.**
