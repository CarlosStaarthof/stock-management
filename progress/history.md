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
