# Review — feature 21 pin_auth

**Verdict:** CHANGES_REQUESTED
**Spec:** specs/features/021-pin_auth.md (47 criteria, with every ruled section and post-approval amendment)
**Reviewed:** `5d28556..8ee3748` — `9bf1f82` spec(#21) … `8ee3748` feat(#21): Phase 0, A, B, C1, C2
**init:** green (my one run: `init exit=0 (22 min)`, `[OK] Environment ready`, database checks executed)

## What I ran

| Run | Result |
|---|---|
| `gate.ps1 -Out gate21rev.txt` (Git Bash `./init.sh`, kept awake), alone | exit 0 in 22 min. `[ok]` on every step. unit **997/997** (71 files); e2e phase 1 **108 passed**, phase 2 **139 passed**; `database reachable`; `prisma migrate status`; test:db **535/535** (27 files). Summary line from the log: `db-skipped: 0   suspended: 0   connection-errors: 0`. Only one run was needed. |
| AC-42's non-`init` half, with all four connection strings pointed at a host under `.invalid` (`scratchpad/nodb42.sh`) | `npx prisma validate` exit 0 (5 s), `npm run typecheck` exit 0 (7 s), `npm run lint` exit 0 (18 s), `npm run test:unit` exit 0 (71 files, **997/997**, 45 s), `npm run build` exit 0 (67 s), with every page `ƒ (Dynamic)`, including `/profiles`, `/setup`, `/sign-in/create` and `/sign-in/requested`. |
| `git diff 9bf1f82..HEAD -- tests/e2e` (AC-40), `git show 0a64e54` (AC-45, AC-47), and the fixture-only diff of every other shipped test (AC-43) | See AC-40, AC-43 and AC-45 below. |
| Two probes, in the scratchpad only: the five AC-8 PIN patterns copied verbatim from `pin-auth-contract.test.ts:190-202` and run on sample lines built at runtime, and WHATWG URL resolution of crafted callback paths | See Required changes 1 and 2. |
| The coordinator's AC-43 logs `scratchpad/ac43-run1.txt` and `ac43-run2.txt` | Each shows `108 passed` and then `139 passed`, with no `failed`, no `flaky` and no `Retry #`. |

I did not read `.env`. I wrote only this file.

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `prisma/schema.prisma` User has the eleven fields in order, plus `AccountLock`, `AuthEvent`, `SetupClaim` and the two enums. Tests: `tests/unit/schema-and-migration.test.ts:229` (twelve models and five enums); `tests/unit/project-contract.test.ts:35`; `src/server/schema/columns.db.test.ts:120` (twelve tables) and `:156` (User's eleven columns); `src/server/schema/referential.db.test.ts:182`, `:198`; `src/server/test-db.test.ts:91` (twelve `@id`s: ten cuids, and exactly `AccountLock.accountKey` and `SetupClaim.id`). `specs/domain-model.md:273-282` names #21. B1's breach proofs are recorded at `impl_pin_auth.md:749-758`. |
| AC-2 | PASS | `prisma/migrations/20260925120000_pin_profiles/migration.sql`: `status` is backfilled before `active` is dropped, there is no INSERT, and there are ten CHECKs. Tests: `tests/unit/pin-auth-contract.test.ts:76-158`, where the one-directory claim goes through `filesTouchedBy(21, …)`; 004 AC-23 re-spelled at `schema-and-migration.test.ts:372`; 004 AC-24 re-spelled at `columns.db.test.ts:104`; the third row pinned at `src/server/auth/pin-schema.db.test.ts:279`. Development-database counts are recorded at `impl_pin_auth.md:436-451`: 33 and 33, 33 and 33, with 8 `ADMIN`. |
| AC-3 | PASS | `src/server/auth/pin-schema.db.test.ts:107-275` covers each refused shape and its non-vacuity controls (`:115`, `:179`). |
| AC-4 | PASS | `src/server/test-db.test.ts:53` checks the eleven. The 020 AC-4 equality at `src/server/test-db.db.test.ts:204` is unmodified, and that file changed only its fixture row. #8's and #10's "no table" claims now read their own commits (`count-entry-contract.test.ts` row 5; `stock-takes-contract.test.ts` AC-22 ×2). |
| AC-5 | PASS | `src/server/auth/password.test.ts:65-190`, plus the fail-closed block from `:190`. Phase A's M6 (a 1-byte pepper) turned it red. |
| AC-6 | PASS | `tests/unit/hashing-boundary.test.ts` has three amended tests, whose detector now covers `createHmac` and `timingSafeEqual`. `pin-auth-contract.test.ts:163` is the reader census; only `password.ts` reads the three secrets (`password.ts:70`, `:196`, `:255`). |
| AC-7 | PASS | `src/server/auth/credential-rules.test.ts:96-…`: trivial PINs are built by rule (24 + 20), 1,000 random PINs, 2,000 draws per length. Phase A's M7 and M8 turned it red. |
| AC-8 | **FAIL (partial)** | The setup-code half, including G1, holds: `pin-auth-contract.test.ts:249`, `:280`, and G1 was proved red (`impl_pin_auth.md:1164-1166`). The `.env` half is at `:261`, labels only. The "nothing seeds a profile" half holds: the gate's test:db starts from an empty migrated database, and `pin-auth-contract.test.ts:155`. **The PIN half does not cover "passed as … a parameter whose name matches /pin/i" or a fill of a PIN input held in a variable.** See Required change 2. |
| AC-9 | **FAIL** | Most of the criterion is proved at `tests/e2e/sign-in.spec.ts:124-227`. But the redirect after sign-in is now open to an off-site target on the no-JavaScript path, and the off-site test (`:178-204`) covers only `//evil.example/x` and `https://evil.example/x`, with JavaScript on. See Required change 1. |
| AC-10 | PASS | `src/server/auth/sign-in-service.db.test.ts:139-197` checks that (a) to (e) produce **identical** statement sequences, with the real bcrypt wrapped and counted once each, and non-vacuity at `:190-193`. `:199-230` covers (f), including trivial PINs built by rule: zero `verifyPin` calls, no statement against `User`, and one keyless `PIN_FAILURE`. End to end, `sign-in.spec.ts:231-294` checks that the `outerHTML` is identical across all ten, with a 200 status, the username kept, the PIN field empty, no session cookie, and 401. The unit half is at `password.test.ts:290`. Because the sequences are compared whole, any early return for an unknown username would turn the test red. Also see Observation 2. |
| AC-11 | PASS | `src/server/auth/account-lock.test.ts:26-…`. Phase A's M1 and M2 turned it red. |
| AC-12 | PASS | `sign-in-service.db.test.ts:233-291` covers (i) and (ii), then the sixth attempt: `LOCKED`, zero bcrypt, no `User` statement, no event. After the lock expires the correct PIN works and the level is 0. Twenty concurrent attempts from twenty known devices give exactly 5, 5 and 15. End to end, `sign-in.spec.ts:298-335` shows byte-identical `outerHTML` and that the open session gets 200. Phase B's M3 turned all three red. |
| AC-13 | PASS | `src/server/auth/attempt-budget.test.ts:45-…`. The token cases go through `bucketFor(kind, verifyDeviceToken(t))`, per Phase A's Deviation 1 and the ruling. |
| AC-14 | PASS | `sign-in-service.db.test.ts:293-427` covers: PAUSED with no `User` or `AccountLock` statement and zero bcrypt; device A signing in; per-device budgets; 20 concurrent attempts giving exactly 10; success writing and removing nothing; the column-shape and no-typed-value check; and retention. |
| AC-15 | PASS | `sign-in.spec.ts:339-410`: 10 callback POSTs give 10 events in that device's bucket and lock both usernames. The form then gives `SIGN_IN_PAUSED_MESSAGE` for a correct PIN. A fresh device gives exactly one event and one step. |
| AC-16 | **FAIL (partial)** | The token half is at `password.test.ts:328-…`. The cookie half is at `tests/e2e/pin-device.spec.ts:70-146`, through both transports: renewal keeps the id, a device cookie alone is not a session, and sign-out leaves the cookie. **Two gaps.** "Secure when the origin is https" has no test: `pin-device.spec.ts:64` asserts only `secure === false` over http, and `next-auth.ts:75` is unproved. The "redirect from every protected route" loop (`pin-device.spec.ts:128`) omits `/profiles`. See Required change 3. |
| AC-17 | PASS | `src/server/auth/pin-session.db.test.ts:57-95`; end to end, `sign-in.spec.ts:414-467`, including `SESSION_ENDED_MESSAGE` after a reset with the cookie untouched. Phase B's M4 turned two tests red. |
| AC-18 | PASS | `src/server/auth/profile-request-service.db.test.ts:127-212`; `src/app/sign-in/create/actions.test.ts:70-125`; `tests/e2e/pin-create.spec.ts:137-290`, including the forged `role`, `status`, `username` and `pinHash` fields. C1's M1 turned it red. |
| AC-19 | PASS | `profile-request-service.db.test.ts:229-284` checks identical sequences for the four cases, that the only `User` read before the insert is the PENDING `COUNT`, and zero `verifyPin`. `pin-auth-contract.test.ts:447` is the source scan. No-JS e2e at `pin-create.spec.ts:294-354`: the same 303, `Location` and cookie names, and a byte-identical acknowledgement. C1's M2 turned both red. |
| AC-20 | PASS | `profile-request-service.db.test.ts:286-345`, which includes a concurrency test at the cap. `pin-create.spec.ts:356-390` shows a byte-identical paused body. |
| AC-21 | PASS | `src/server/auth/profile-admin-service.db.test.ts:376-517`, including 10 repetitions of concurrent approvals. `tests/e2e/pin-profiles.spec.ts:252-299`. C2's M3b and M4 turned it red. M3a staying green is accepted under ruling C2-3. |
| AC-22 | PASS | `profile-admin-service.db.test.ts:257-375`: all ten functions, both refusals, the exact message, and a snapshot showing nothing changed. `pin-profiles.spec.ts:153-248` covers the 307s, the staff body naming no profile, ordering, and the one `/analysis` header link. `pin-auth-contract.test.ts:717-757`. The hand proof is at `impl_pin_auth.md:1751-1765`, with the hash restored. C2's M1 and M2 turned it red. |
| AC-23 | PASS | `profile-admin-service.db.test.ts:518-639`: the last ADMIN, self and other, including an ACTIVE `ADMIN` that cannot sign in (`:553`), 10 repetitions of mutual demotion and 5 of mutual deactivation. `pin-profiles.spec.ts:449-497`. C2's M5a, M5b and M5c turned it red. |
| AC-24 | PASS | `pin-session.db.test.ts:96-189`. `pin-profiles.spec.ts:303-348` covers the POST body, `new-pin`, a later GET, every column, the browser console, and a sign-in. C2's M7 turned it red. |
| AC-25 | PASS | `profile-admin-service.db.test.ts:640-728`; `pin-profiles.spec.ts:352-383`. |
| AC-26 | PASS | `profile-admin-service.db.test.ts:729-908` checks the exact `{3,1,2,false}`, the pause, and the resume writing one `BUDGET_RESET` and deleting nothing. `pin-profiles.spec.ts:387-445`. The hand observation is at `impl_pin_auth.md:1767-1791`. C2's M8 turned it red. |
| AC-27 | PASS | `src/server/auth/setup-service.db.test.ts:132-214` covers the DEACTIVATED `ADMIN`, the migrated `ADMIN`, the claim with no `ADMIN`, a 15-character code, and the 404 render. `tests/e2e/pin-setup.spec.ts:33`. `pin-auth-contract.test.ts:466-490`. C1's M3 turned it red. |
| AC-28 | PASS | `setup-service.db.test.ts:215-338`, with `setupCodeMatches` wrapped and counted: zero comparisons when PAUSED. `src/app/setup/actions.test.ts:75-137`. `pin-setup.spec.ts:49`. Constant-time comparison is covered in `password.test.ts`, and Phase A's M3 turned the source check red. The end-to-end 303 is proved in pieces (`impl_pin_auth.md:1362-1373`), which the spec's no-database paragraph allows. |
| AC-29 | PASS | `setup-service.db.test.ts:339-358`: 20 repetitions, and a third call that compares nothing. C1's M5 turned all 20 red. |
| AC-30 | PASS | `src/server/auth/pin-reset.db.test.ts`: 21 tests, each run scanned for every forbidden value. The G2 order check is at `pin-auth-contract.test.ts:542-567`, with its non-vacuity test and mutation. `no-default-password.test.ts:116`. Breaches 1 to 4 are recorded at `impl_pin_auth.md:857-864`. |
| AC-31 | PASS | `pin-auth-contract.test.ts:312-396`. There is one `signIn(` call site, taking `{ username, pin, redirect }`, as licensed by Phase B's Deviation 1. |
| AC-32 | PASS | `sign-in-service.db.test.ts:429-464`; `profile-request-service.db.test.ts:347`; `setup-service.db.test.ts:360`; `profile-admin-service.db.test.ts:909`; `pin-profiles.spec.ts:501`; `src/server/auth/sign-in-codes.test.ts:16`. |
| AC-33 | PASS | The criterion's one test is split by surface, and together the parts cover every action it lists: `sign-in-service.db.test.ts:466-525` (including exactly one `auth.pin_failed bucket=device` line), `profile-request-service.db.test.ts:359`, `setup-service.db.test.ts:370`, `profile-admin-service.db.test.ts:931`, `src/app/setup/actions.test.ts:139`. The response half is at `tests/e2e/pin-boundary.spec.ts:41`. C1's M6 turned it red. |
| AC-34 | PASS | `pin-boundary.spec.ts:76-124` covers `YARD_STAFF` on `/api/session` and `/api/users`, and a role forged into the body, a header and a cookie. `pin-create.spec.ts:393`, `pin-profiles.spec.ts:180-191` and `pin-setup.spec.ts:33` check for no `€`. `deepKeys` checks are at `profile-admin-service.db.test.ts:987`, `setup-service.db.test.ts:216` and `pin-session.db.test.ts:114`. Phase B's M1 turned it red. |
| AC-35 | PASS | `tests/e2e/route-protection.spec.ts:125`, `:159` and `:186` (no JavaScript); `pin-create.spec.ts:408`; `pin-profiles.spec.ts:517-576`, which includes the header's sign-out under C2-2. C2's M10 turned it red at both widths. |
| AC-36 | PASS | `sign-in.spec.ts:485-536`, which reads path, query and fragment, as C1 Finding 3 required. `pin-create.spec.ts:437`. After a failure: `sign-in.spec.ts:286-287`. |
| AC-37 | PASS | `tests/e2e/pin-header.spec.ts:48-98`: an 80-letter unbroken name on four pages at 390 and 320 px, and the username never rendered. `pin-auth-contract.test.ts:400-411` (the retired id, built from parts) and `:761`. The six criteria of 007, 010 and 011 are amended in their spec files. |
| AC-38 | PASS | `src/lib/count-audit-ref.test.ts:13`, `:25`; `src/server/auth/audit-username.db.test.ts:31`. `count-audit.test.ts` changed only the field name. |
| AC-39 | PASS | `src/lib/auth-messages.test.ts:46-…`; the literal scan is at `pin-auth-contract.test.ts:415-441`. |
| AC-40 | PASS | `tests/e2e/support/users.ts:31-148` has the `TestUser` shape, 20 username letters and 16 name letters drawn `a`–`p` (the coordinator's disclosed C2-4 change, checked: `:59-63`), and a skip when `PIN_PEPPER` is absent (`:44-52`). `git diff -U0 9bf1f82..HEAD -- tests/e2e` outside the five exempt files and the new `pin-*.spec.ts` shows only substitutions (1)–(5) at the named sites, two fixture types (`support/analysis.ts`, `support/item-master.ts`), and the C2-1-licensed change to `analysis-figures.spec.ts` (`allHrefs`, with the count of one and one header link). No `test(` title changed. `role-access.spec.ts` changed only its hash helper, the `/api/users` field and site (4). New-device guards are at `sign-in.spec.ts:559`, `pin-profiles.spec.ts:580` and `pin-create.spec.ts:493`. |
| AC-41 | PASS | `tests/unit/no-default-password.test.ts` has five tests, with G1's quoted-literal rule and its non-vacuity test. `pin-auth-contract.test.ts:571-685` covers the command it runs and the one-sentence claims. `docs/operations.md:85-113`, `:115-225`. `tests/unit/env-file.test.ts:145` checks the real `.env`, labels only. |
| AC-42 | **PASS (my run) / OPEN (init half)** | My run, with all four URLs on a host under `.invalid`: `prisma validate` 0, `typecheck` 0, `lint` 0, `test:unit` 0 (997/997), `build` 0, and every page dynamic.. The unit half is at `password.test.ts:508-…`. **Nobody recorded the half where both `init` scripts end with `[OK] Environment ready (database checks skipped)` with no database.** My brief allows one `init` run, and I used it on the full gate. See Required change 4. |
| AC-43 | PASS | My gate is green, with the database checks executed. The coordinator's two consecutive full e2e runs are verified from the logs (108 + 139 each, 0 failed, 0 flaky, no retry), and mine makes a third. The 010 AC-20 census now derives its count with a floor and names the four pages (`stock-takes-contract.test.ts:440-470`), licensed by AC-43 (Observation 5). The no-`loading.tsx` check is at `pin-auth-contract.test.ts:689-713`. The fixture-only rule holds: every changed line in the other shipped unit and database tests is a fixture (`email`→`username`, `status: "ACTIVE"`, `epoch: 0`) or a change licensed by AC-37 or AC-38 (`analysis/page.test.ts` name; `count-lifecycle-service.db.test.ts` `actorRef`). `git status --porcelain -- Samples` is empty, and init step 3 passed. |
| AC-44 | PASS | `tests/unit/feature-scope.test.ts:174-…` covers (a) to (h) on throwaway repositories, with the index and refs checked around every call. Helper mutations M1 to M8 are recorded at `impl_pin_auth.md:181-197`. |
| AC-45 | PASS | `git show 0a64e54 -- tests/unit`: rows 1–10 and 12–16 are converted as the table says, and `Samples` is split out to `workingTreeChanges` (`analysis-contract.test.ts`). Row 11 is byte-identical: I extracted its `it(` block at `5d28556` and at HEAD and diffed them, with no difference. The two scans are at `feature-scope.test.ts:496-…`. |
| AC-46 | PASS | Twelve runs and a 15×12 table are recorded at `impl_pin_auth.md:88-179`, matching the spec's table. Current state: `git worktree list` names only the main checkout, `git for-each-ref` shows one ref, and the clone is not shallow. |
| AC-47 | PASS | `docs/conventions.md` *Tests* and *Commits* say what AC-47 lists. `0a64e54 test(#21): …` lists exactly the eight named files plus two under `progress/`, and it comes straight after `9bf1f82 spec(#21)`. The Phase 0 `init` record is at `impl_pin_auth.md:235-252`. |

## Checkpoints

### C1 — Process
- [x] Exactly one feature was changed. `feature_list.json` differs from `5d28556` only in #21's entry. The edits to 002, 003, 004, 007, 010, 011 and 020 are the amendment notes and criterion edits that 021 names.
- [x] The spec exists.
- [ ] Every numbered acceptance criterion is satisfied. AC-8, AC-9 and AC-16 are partly unproved or broken, and AC-42's `init` half is unevidenced. See Required changes 1 to 4.
- [x] `feature_list.json` `acceptance[]` matches the spec: I compared all 47 texts programmatically and found 0 mismatches.
- [x] `progress/impl_pin_auth.md` exists and lists the files touched, per phase. I checked it against `git diff --name-status 5d28556..HEAD`.

### C2 — Verification
- [x] `init` finished `[OK] Environment ready` with the database checks executed (see *What I ran*).
- [x] `npm run typecheck`: 0 errors, both in the gate and in my no-database run.
- [x] `npm run lint`: 0 errors, both in the gate and in my no-database run.
- [x] Every new service function has a success test and a failure test. This covers `attemptSignIn`, `requestProfile`, `setupAvailable`, `completeSetup`, the ten admin functions and the three operator functions (`--list` included, and the `PIN_PEPPER`-unset refusal in `pin-reset.db.test.ts`).
- [x] Tests assert real values: exact outcomes, counts, statement sequences and messages.
- [x] Tests use the real test database, and the e2e tests use the real served build.

### C3 — Architecture
- [x] No component or route handler imports `PrismaClient`. A grep over `src/app`, `src/components` and `src/lib` finds only comments.
- [x] Data access lives in `src/server/auth/`, one module per concern. The new components import only `@/app/*` actions, which is the shipped pattern since #3, and never import `@/server`.
- [x] Excel builders are untouched.
- [x] There are no circular imports. `password.ts` imports only the pure `attempt-budget` and `credential-rules`, and `setup-service` → `profile-admin-service` goes one way.
- [x] The schema change ships with its migration.

### C4 — Domain integrity
- [x] No monetary value is stored.
- [x] No price, value or total appears in a `YARD_STAFF` body (AC-34 tests above).
- [x] Money and quantity types are untouched.
- [x] The count lifecycle is untouched, apart from the `actorRef` rename.
- [x] `unitPriceSnapshot` is untouched.
- [x] An approved count stays immutable.
- [x] Quantity precision is untouched.
- [x] Nothing under `Samples/` was modified (init step 3).

### C5 — Conventions
- [x] Naming follows the conventions.
- [x] Errors are typed domain errors. The only bare `throw new Error(` under changed `src/` is `test-db.ts:104`, from #4 (blame `faccf65a`).
- [x] There is no `console.log` in `src/`. The reset script's `console.log` is under `scripts/`.
- [x] There is no TODO.
- [x] No secret is committed. I grepped the reports and docs for bcrypt hashes, long base64 strings, 64-hex values other than the recorded commit SHA and file hashes, and 4- or 6-digit numbers near PIN words, and found none. `.env*` is ignored and none is tracked.

### C6 — Session hygiene
- [x] `progress/current.md` logs each phase and the coordinator's gates. Its only uncommitted change is the coordinator's AC-43 entry.
- [x] There are no scratch files in the repository, and `git status` is clean apart from that one entry.
- [x] #21 is `in_progress`, which reflects reality.

### C7 — Advisory
- [x] Every new screen has empty, loading and error states: `/sign-in/create`, `/sign-in/requested`, `/setup`, `/profiles`.
- [x] Every new screen is measured at 390 and 320 px.
- [x] No new screen shows money.

## Required changes

1. **An open redirect after sign-in (AC-9, security).**
   - The code path:
     - `src/app/auth-actions.ts:19-23` `safeCallbackPath` accepts any value that begins with `/` but not with `//`.
     - `:55` now redirects with Next's `redirect(callbackUrl ?? …)`.
     - Before #21 the target went through Auth.js's `signIn(…, { redirectTo })`. Its default `redirect` callback turns every path into `${baseUrl}${url}`, an absolute same-origin URL (`node_modules/@auth/core/lib/init.js:13-15`). #21's switch to `redirect: false` plus Next's `redirect()` removed that guarantee.
   - What a browser does with it:
     - In a no-JavaScript or pre-hydration submission (an MPA action), Next writes the target into `Location` verbatim (`node_modules/next/dist/server/app-render/action-handler.js:800-801`).
     - Browsers resolve the path by the URL Standard. My probe, with `new URL(p, "http://localhost:3000/sign-in")`, gives:
       - a slash then a backslash, `/\evil.example/x` → `http://evil.example/x`;
       - a slash, a tab, then `/evil.example` → `http://evil.example/`.
       - Both pass `safeCallbackPath`.
   - The attack: a link to `/sign-in?callbackUrl=%2F%5Cevil.example%2F` sends a person who signs in without JavaScript, or before the form hydrates on a slow yard phone, to an attacker's page. That page can ask for the username and PIN "again". AC-35 makes the no-JavaScript sign-in a supported path, which `route-protection.spec.ts:186` proves.
   - The gap in the tests: the only off-site test (`sign-in.spec.ts:193`) uses `//` and `https://` with JavaScript on.
   - **Fix:**
     - Refuse any callback that contains a backslash or an ASCII control or whitespace character.
     - Better still, parse it against a fixed origin and accept it only when the origin is unchanged, then redirect to `pathname + search` alone.
     - Add e2e cases for both shapes above, with JavaScript on and with it off (`javaScriptEnabled: false`). Each must land on the role's landing page. Write the no-JavaScript case first and watch it go red on the current code.
   - I did not run the exploit end to end: it needs a profile with a known PIN in the development database, which a reviewer may not create. The chain above is cited step by step.

2. **AC-8's PIN scan misses the "passed as … a parameter" half, and a PIN field held in a variable.**
   - The criterion covers a 4- or 6-digit literal "assigned to, passed as, or compared with an identifier, key, parameter or form field whose name matches `/pin/i`", and "no `fill` of a PIN input with a literal". The five patterns (`tests/unit/pin-auth-contract.test.ts:190-202`) cover assignment, keys, comparison, a `name=pin … value=` attribute, and `.fill(` chained on a locator whose own selector string says `pin`.
   - My probe ran those five patterns verbatim over lines built at runtime, with the digits drawn by `randomInt` and never written down. Each of these was **missed**:
     - a literal as the argument of `hashPin(…)`;
     - a literal as the first argument of `verifyPin(…)`;
     - a literal as the second argument of `attemptSignIn(username, …, device)`;
     - `pinField.fill(<literal>)`, where `pinField` is a locator variable. `sign-in.spec.ts:489` uses exactly that shape.
   - The non-vacuity test (`:271-278`) exercises only patterns 0, 1 and 4.
   - **Fix:** add patterns for:
     - a quoted 4- or 6-digit literal anywhere in the argument list of a call whose callee matches `/pin/i` or is `attemptSignIn`;
     - `.fill(` of a quoted digit literal on a receiver whose name matches `/pin/i`.
     - Then extend the non-vacuity test with each shape, built at runtime.
   - A simpler and stricter rule would also do: any quoted 4- or 6-digit literal on a line that matches `/pin/i`. Today it would flag only the spec's own example at `specs/features/021-pin_auth.md:1073` (see Observation 1).

3. **AC-16: prove `Secure` over https, and cover `/profiles`.**
   - `src/server/auth/next-auth.ts:75` sets `secure` from `new URL(request.url).protocol`. No test exercises the https branch; `pin-device.spec.ts:64` asserts only `false` over http. A cookie that silently loses `Secure` in production, behind a TLS-terminating proxy (#16), is exactly the failure this criterion guards.
   - **Fix:**
     - Add a test that drives `authorize`, or the cookie-options code factored into a pure function, with an https request URL, and asserts `Secure`.
     - Assert the http case beside it.
   - Also add `/profiles` to the "device cookie alone is not signed in" loop (`pin-device.spec.ts:128`). Better still, derive the list from `PROTECTED_PATHS`, so a later protected path is covered automatically.

4. **AC-42's `init` half has no recorded evidence.**
   - Neither `progress/impl_pin_auth.md` nor `progress/current.md` records `./init.sh` or `./init.ps1` ending `[OK] Environment ready (database checks skipped)` with all four URLs unresolvable. This criterion's evidence is the coordinator's to make; I ran the other five checks (see AC-42).
   - **Fix:** record both no-database `init` runs before closing. This asks for evidence, not code.

## Observations (non-blocking)

1. **The spec writes a PIN-shaped example.** `specs/features/021-pin_auth.md:1073` (Phase A's ruling text) shows a four-digit repeated-digit example in a code span. It is trivial, so it can never be a stored PIN. But it goes against the spec's own "No PIN value … not in this spec, not in an example" (`:79-81`), and it would trip the stricter scan suggested in Required change 2. This is for the spec-writer.
2. **AC-10 (e) is built as case (a).** Both `sign-in-service.db.test.ts:163-171` and `sign-in.spec.ts:253-266` create a `REJECTED` row with no requested username, then type a username that was never stored anywhere. That matches what `rejectProfile` leaves behind, which AC-21's test proves at `profile-admin-service.db.test.ts:481`. A tighter test would request, reject through `rejectProfile`, and then attempt with the original username and PIN.
3. **Stale text in shipped tests the diff rules kept untouched:**
   - `src/server/test-db.db.test.ts:186` is titled "exactly the eight tables" but compares against the eleven in `TRUNCATED_TABLES`.
   - Comments still describe the email fixture `${label}-${16 hex}@…`: `tests/e2e/stock-takes-calendar.spec.ts:104-110` and `:570`, and `tests/e2e/analysis-access.spec.ts:152`.
   - The 010 AC-19 property still holds: the 61-letter label is now the first run of the name.
4. **`toProfileListEntry` is an exported, unguarded function in the admin module** (`src/server/auth/profile-admin-service.ts:176`). AC-22's first-statement check exempts it by name (`pin-auth-contract.test.ts:748`). Only `setup-service.ts` imports it today, but nothing stops a page from doing so. Consider moving it to an internal module, or asserting who imports it, as AC-31 does for `operator-service`.
5. **010 AC-20's census now has a floor, not an exact count** (`tests/unit/stock-takes-contract.test.ts:460`). AC-43 licenses this, and it names the four new pages. A page outside the six named ones could now drop out of the census unnoticed.
6. **Flake risk in AC-14's "no typed value stored" check.** `sign-in-service.db.test.ts:392-395` searches a JSON dump that contains 64-hex keys for 6-digit PINs. A PIN can appear inside a hex key by chance, roughly once in several thousand runs. Comparing column by column, and skipping the key columns for PINs, would remove it.
7. Every run, including before #21, logs two "Failed to find Server Action" lines during `stock-entry-autosave`. The logs `e2e_pair_run1.txt` and `e2e-full.log` from 2026-09-24 and 25 show the same. It is not #21's.

---

## Second pass, 2026-09-26

**Verdict:** CHANGES_REQUESTED
**Scope:** the repairs only. They are uncommitted on top of `8ee3748`, so I read `git diff HEAD` and `git status`. I checked them against AC-8, AC-9 and AC-16 as they now read, and against *The review's findings, ruled by the coordinator*. I did not re-review what the first pass passed and the diff leaves untouched.
**init:** green, on the coordinator's close-out runs. Per the brief, I ran no `init`, `test:db` or `test:e2e`.

**Summary:**
- **Closed:** R1, the open redirect, with a real red-first and a probe of about 1.9 million values that found no escape. R3 and R4, and observations 2, 3, 4 and 6.
- **Open:** one narrow item, AC-8. As reworded, it promises two things its scan does not prove:
  - "no `fill` of a PIN input with a literal, **whatever holds the locator**";
  - "passed as … a **parameter** whose name matches `/pin/i`". This is still missed for a callee other than `attemptSignIn`, and one such helper is in use today.

  See Required change 1.

### What I ran

| Run | Result |
|---|---|
| `npx vitest run src/lib/callback-path.test.ts src/server/auth/sign-in-codes.test.ts tests/unit/pin-auth-contract.test.ts` | 3 files, 53/53 (10 + 5 + 38). |
| `scratchpad/r2probe_callback.mts` runs the real `safeCallbackPath`, imported from `src/lib/callback-path.ts`, over three sets of inputs. Every foreign host was built at runtime. (a) 59 hand-built hostile values. (b) Every string of length 1 to 5 over a 17-character alphabet of URL-significant characters, 1,508,597 values. (c) 400,000 random values over a wider alphabet, which adds fullwidth and other lookalike slashes, NBSP, U+3000, BOM, a lone surrogate, DEL and C0 controls. For each kept value it checks: one leading slash and not two; printable ASCII only, so the value is safe in `Location`; no backslash; no fragment; and idempotence. It also checks that the value stays on the origin when resolved against 12 bases: three origins, each at the root, at `/sign-in`, in a deep directory and with a query. | **48,477 kept, 0 failures.** Encoded slashes and backslashes are kept as written and stay on the origin. Every dot-segment route to a leading `//` is refused, including the percent-encoded dots. An encoded CR-LF in the query stays encoded, so it cannot inject a header. A fullwidth solidus is percent-encoded into the path. |
| `scratchpad/r2probe_ac8.mjs` runs the eight AC-8 PIN patterns, copied verbatim from `pin-auth-contract.test.ts:190-215`, over lines built at runtime, with the digits drawn by `randomInt` and never printed. | The four shapes the first pass found missed are all caught now. Still missed: a `fill` on a holder not named like a PIN, a call to the e2e helper `attempt(page, username, pin)`, and a literal on its own line in a wrapped call. See Required change 1 and Observation 3. |
| `scratchpad/r2probe_mut.mjs` removes each new rule from the list in turn, using the non-vacuity test's own logic. | The same shapes go red as in M-R2a to M-R2c. See R2 below. |
| I read the close-out logs `close-1-gate.txt` to `close-4-nodb-ps1.txt` (UTF-16, converted to read them), `closeout.ps1`, and `fix21-r1-red.txt`, `fix21-r1-green.txt` and `fix21-r1-mutant.txt`, with every digit run of 4 or more masked. | See R1 and R4. |
| `scratchpad/r2_acmatch.cjs` compares the 47 criteria in `feature_list.json` with the spec. | 0 mismatches. In `feature_list.json`, only AC-8, AC-9 and AC-16 changed. |

I did not read `.env`. In the repository I wrote only this section.

### The four required changes

**R1, the open redirect: CLOSED.**
- **How the fix works.**
  - `src/lib/callback-path.ts:38-53` first refuses any backslash, C0 control, DEL or whitespace.
  - It then requires exactly one leading slash, parses the value against a fixed origin, and keeps it only if that origin is unchanged.
  - It returns pathname plus search, then checks that result again for a leading `//`.
  - `src/app/auth-actions.ts:31` is its only caller, and `:46` redirects to what it returns.
  - Moving it out of the `"use server"` file was necessary (Deviation 1).
- **No escape found.** My probe found no kept value that leaves the origin. Parsing against a fixed reference origin instead of the app's own is equivalent here:
  - only a value that begins with one slash is parsed, and how it resolves does not depend on the base's host;
  - both origins use special schemes, so a backslash is read as a browser reads it.
- **The no-JavaScript case exercises the MPA path.**
  - With `javaScriptEnabled: false` there is no React, so the click submits the plain HTML form.
  - `signInPost` (`tests/e2e/sign-in.spec.ts:198`) captures that navigation POST.
  - The POST's answer carries a `Location`, which only Next's MPA branch writes. The red and mutant logs show that `Location` exactly: a slash, a backslash, then the run's `.invalid` host.
  - The with-JavaScript mutant failed a different way: it landed on `/x` on our origin. So the two modes did take different paths.
- **The red-first evidence is real.**
  - `scratchpad/fix21-r1-red.txt` (00:44): a fresh build, one test, failing at the `Location` assertion with the foreign host's origin.
  - `src/lib/callback-path.ts` was created at 00:45.
  - `fix21-r1-green.txt`: 8 passed.
  - `fix21-r1-mutant.txt`, with the old rule restored: both off-site tests red, both `/analysis` tests green.
- **The matrix.** AC-9's 2 × 2 is at `sign-in.spec.ts:205-263`: all four shapes, and the `/analysis` callback, each with JavaScript on and off.

**R2, AC-8's PIN scan: the four shapes are caught; two clauses of the criterion are still unproved.**
- **The rules and the test.**
  - The three rules are at `tests/unit/pin-auth-contract.test.ts:197-201`.
  - The scan tests line by line (`:253`), so `PIN_LINE`'s `^` anchors to a line.
  - The non-vacuity test (`:292-325`) builds five shapes, each in 2 lengths and 3 quote characters, from `randomInt`. For each, it soft-asserts that every rule the shape names catches it.
- **Removing each rule turns red what it should.** My simulation matches M-R2a to M-R2c:
  - without `CALL_ARGUMENT`: the hashPin, verifyPin and attemptSignIn shapes, 6 each;
  - without `FILL_ON_PIN_VARIABLE`: the fill shape, 6;
  - without `PIN_LINE`: the hashPin, verifyPin, fill and line-only shapes, 6 each.
- **Which rules are needed.**
  - Two rules are needed alone. Without `CALL_ARGUMENT` the scan misses the attemptSignIn line, and without `PIN_LINE` it misses the line-only one.
  - `FILL_ON_PIN_VARIABLE` adds nothing for digit literals, because its lines always contain "pin". It does also catch a non-digit literal, though, and the soft assertion still makes its removal visible. That is acceptable.
- **Implementer finding 1 is right.** The reworded AC-8 now credits `attemptSignIn` to "the parameter rule above".
- **Still open:** see Required change 1.

**R3, AC-16: CLOSED.**
- **The code.** `deviceCookieOptions` (`src/server/auth/sign-in-codes.ts:36`) is pure, and `next-auth.ts:72` sets the cookie with it.
  - Importing `attempt-budget` into `sign-in-codes.ts` keeps it pure: that module touches no database, clock or environment.
  - No client component imports `sign-in-codes`.
- **The tests.**
  - `sign-in-codes.test.ts:39` and `:49` assert the whole options object over three `https` and three `http` URLs, against a literal 180 days rather than the constant.
  - `:59` pins the constant.
  - M-R3a and M-R3b show that each branch can go red.
- **The protected list.** `pin-device.spec.ts:131-132` asserts that `PROTECTED_PATHS` holds `/profiles`, then loops over the same list the middleware reads (`src/middleware.ts:5`, `:19`).
- **I agree that implementer finding 4 belongs to #16.**
  - Auth.js rebuilds the URL that `authorize` receives from `AUTH_URL`, or else from `x-forwarded-proto` and `x-forwarded-host` (`node_modules/@auth/core/lib/utils/env.js:66-87`; the request is built at `node_modules/@auth/core/lib/actions/callback/index.js:231-233`). That is a property of the deployment, not of this code.
  - Auth.js sets `Secure` on its own session cookie from the same URL (`node_modules/@auth/core/lib/init.js:69`), so #16 has to check both cookies in production anyway.
  - `progress/current.md` already puts it on #16's deploy checklist.

**R4, AC-42's no-database `init` half: CLOSED.**
- **The two no-database runs.** `closeout.ps1` points `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` at one host under `.invalid` before runs 3 and 4.
  - `close-3-nodb-sh.txt` (`init.sh`): every step `[ok]`; unit 1011/1011 in 72 files; e2e 14 passed, with 97 + 139 skipped. It ends with `[skip] database unreachable at macroads-nodns.invalid - database-dependent checks skipped` and then `[OK] Environment ready (database checks skipped)`.
  - `close-4-nodb-ps1.txt` (`init.ps1`): the same results and the same ending. Its one alarming block is not a failure: PowerShell 5.1 wraps Prisma's stderr line "Environment variables loaded from .env" as a `NativeCommandError`, and `[ok] prisma schema valid` follows straight after.
- **The gate with the database, `close-1-gate.txt`:** every step `[ok]`; unit 1011/1011; e2e phase 1 111 passed and phase 2 139 passed; `database reachable`; `prisma migrate status`; test:db 535/535 in 27 files; then `[OK] Environment ready`.
- **The extra e2e run, `close-2-e2e.txt`:** 111 + 139 passed.
- **No failures in either.** Neither log has a `failed`, `flaky` or `Retry #` line. Phase 1's 111 is the old 108, minus the one replaced callback test, plus the four new AC-9 tests.
- **These are runs of the final tree.** Every changed source file predates the close-out: the latest, `src/app/item-master/actions.ts`, is from 01:18:56, and `closeout.ps1` from 01:19.

### Acceptance criteria touched by the repair

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-8 | **FAIL (partial)** | The four first-pass shapes are caught and proved non-vacuous (see R2). The setup-code, `.env` and seeding halves were passed in the first pass and are unchanged. **Two clauses are unproved.** The "fill … whatever holds the locator" clause is proved only when the holder's name, or something else on the line, says "pin". The "passed as … a parameter whose name matches `/pin/i`" clause is proved only for callees named like a PIN and for `attemptSignIn`. See Required change 1. |
| AC-9 | PASS | `src/lib/callback-path.test.ts` (10 tests); `sign-in.spec.ts:205-263`, with JavaScript on and off; the red-first and mutant logs; and my probe, which found no escape. |
| AC-10 | PASS | Case (e) now goes through `requestProfile`, then `rejectProfile`, then an attempt with the username and PIN the person chose (`sign-in-service.db.test.ts:164-190`). It runs inside the loop that checks for identical statement sequences. |
| AC-14 | PASS | `sign-in-service.db.test.ts:384-467` checks each column separately. A hex column must be a key this run can derive, and is not searched. Failure labels name the column, never the value. The malformed attempt's PIN is now among the values searched. M-14 is recorded red. |
| AC-16 | PASS | See R3 above. |
| AC-22 | PASS | `pin-auth-contract.test.ts:806` (observation 4) catches a named import, a re-export, and any other file that names the function. |
| AC-42 | PASS | See R4 above, plus my first-pass run of the other five checks. |
| AC-43 | PASS | Two consecutive clean full e2e runs on the final tree (close-1 and close-2). `test-db.db.test.ts:186` changed only its title. In the two e2e specs, filtering `git diff -U0` for changed lines that are not comments finds none. |

### Checkpoints, as they stand after the repair
- C1 [ ] Every AC is satisfied. AC-8's two clauses above are unproved.
- C1 [x] `feature_list.json` matches the spec: 47 of 47, and only AC-8, AC-9 and AC-16 changed.
- C1 [x] The change stays in #21's scope. Its one exception is the one-line comment in #6's `src/app/item-master/actions.ts:97`, which the coordinator disclosed. It fixes a pointer that #21's own move of `safeCallbackPath` made stale, and it touches only a comment. I accept it.
- C2 [x] `init` is green with the database, and both no-database `init` runs are green.
- C3 [x] Layering holds. `callback-path.ts` is a pure `src/lib` module, and `deviceCookieOptions` lives in the pure `sign-in-codes.ts`. No new `PrismaClient` import.
- C5 [x] No `console.log`, TODO or bare `throw new Error(` in the new or changed source.
- C6 [x] `git status` shows only the repair, this file and the two new `callback-path` files. `Samples/` is untouched.

### Required changes
1. **AC-8: prove its two remaining clauses, or narrow them.** The criterion is at `specs/features/021-pin_auth.md:898`, mirrored in `feature_list.json`.
   - **(a) "No `fill` of a PIN input with a literal, whatever holds the locator."**
     - **The gap.** None of the eight patterns catches `await field.fill(<4 digits>);` or `await inputs.nth(1).fill(<6 digits>);`, built at runtime. Neither holder is named like a PIN, and nothing else on the line says "pin".
     - **Where it comes from.** The implementer built what my first-pass R2 asked for, a receiver named like a PIN. The gap comes from the criterion's new wording.
     - **To close it:** add a rule for `.fill(` of a quoted literal of exactly 4 or 6 digits on **any** receiver, that is `\.fill\(\s*` followed by `QUOTED_PIN`, with a runtime-built non-vacuity shape whose receiver is not named like a PIN. No tracked or untracked file has such a fill today (every numeric fill is a quantity of one or two digits), so the rule flags nothing now.
     - **Or:** narrow the clause to what is proved.
   - **(b) "Passed as … a parameter whose name matches `/pin/i`."**
     - **The gap.** `tests/e2e/sign-in.spec.ts:102` declares `attempt(page, username, pin)`, and `:339`, `:379`, `:382`, `:441` and `:459` call it with a PIN in third place. A call built at runtime with a quoted literal there, `await attempt(page, admin.username, <4 digits>);`, is caught by none of the eight patterns, because neither the callee nor anything else on the line says "pin".
     - **Where it comes from.** `CALL_ARGUMENT` special-cases `attemptSignIn` by name. My first pass named only `attemptSignIn` and missed this helper, so the miss is partly mine.
     - **To close it:** build the callee set for `CALL_ARGUMENT` from the tree, taking every function whose declared parameters include a name matching `/pin/i`. Today that is `attemptSignIn`, `parseAttempt` and the e2e `attempt`. Add a non-vacuity shape that calls `attempt` with a literal. No call to any of these holds a quoted 4- or 6-digit literal today.
     - **Or:** narrow the clause to "a call whose name matches `/pin/i`, or `attemptSignIn`", and accept the helper as a known gap.
   - Either way the non-vacuity test must show each new shape caught, and the rule removed must turn it red, as the first three rules do.

### Observations (non-blocking)
1. **The no-JavaScript off-site test's `Location` check passes even when there is no `Location`.**
   - At `sign-in.spec.ts:253`, `response.headers().location ?? ""` falls back to an empty string, which resolves to the origin itself, so the check passes.
   - The landing assertions after it still hold, and the `/analysis` sibling (`:224-228`) does prove that the MPA answer carries a `Location`.
   - Asserting a 303 and a non-empty `Location` would let each shape's check stand on its own.
2. **Only the first off-site shape has been seen red end to end.**
   - The four shapes run in one loop (`:243`), and both the red run and the mutant run stopped at the backslash shape.
   - The tab shape's refusal is proved in the unit tests, and its e2e case now passes. I expect it would have gone red too, because a tab survives both a hidden input and a multipart body, but no run showed it.
   - One test per shape, or soft assertions, would show each shape red under M-R1.
3. **Any line scan misses a PIN literal alone on a line inside a wrapped call,** such as a multi-line `attemptSignIn(` call with the literal on a line of its own. No wrapped PIN call exists today, and nothing in the repository formats code into one, so I note this only as a limit of the method.
4. **AC-10 (e) end to end still uses a hand-built `REJECTED` row** (`sign-in.spec.ts:312-317`). The implementer claimed only the database half, and that half is the real flow now. The hand-built row matches what `rejectProfile` leaves behind, so this is not a gap.
5. **First-pass Observation 1 is resolved:** `specs/features/021-pin_auth.md:1073` no longer shows an example PIN.

---

## Third pass, 2026-09-26

**Verdict:** APPROVED
**Overall verdict for #21:** APPROVED. This pass closes the last open item. Every one of the 47 criteria now passes.
**Scope:** only the second pass's Required change 1, AC-8's two unproved clauses. I checked it against the ruling "R2 again" and against AC-8 as it now reads. The implementer's section is `### Second-pass repair` in `progress/impl_pin_auth.md`.
**init:** green, on the coordinator's close-out runs (recorded in the second pass). The only change since then is in `tests/unit/pin-auth-contract.test.ts`. On the final tree I ran `npm run typecheck` (exit 0), `npm run lint` (exit 0) and `npm run test:unit` (72 files, 1012 of 1012). Per the brief, I ran no `init`, database or e2e run.

### What I ran

| Run | Result |
|---|---|
| `npx vitest run tests/unit/pin-auth-contract.test.ts`, then `npm run test:unit`, `npm run typecheck` and `npm run lint` | 39/39; 1012/1012 in 72 files; exit 0; exit 0. |
| `scratchpad/r3/extracted.mts` holds the test's `boundNames`, `pinParameterFunctions`, `QUOTED_PIN`, `FILL_ANY_RECEIVER` and `callToPinParameter`, copied by line range from the test file so that nothing is retyped. `scratchpad/r3/probe.mts` runs them. | See items 1 and 2. |
| `scratchpad/r3/mutate.mjs` runs in a throwaway clone under the scratchpad (a `git clone` of the repository, with the working changes copied in, and `node_modules` joined through a junction that I removed afterwards). It applies each mutation to the clone's copy of the test file, runs the AC-8 tests, and restores the file. | See item 4. The repository itself was not touched: `git status` shows the same 19 entries, and `git worktree list` shows only the main checkout. |
| `scratchpad/r3/unnamed.mts` lists every function-like node in the tree that has a `/pin/i` parameter and that the derivation cannot name. | 1: an inline `.map` callback at `src/server/auth/profile-admin-service.db.test.ts:964`, which cannot be called by name. |

No PIN, setup code or `.env` value was read, printed or written. Every digit run came from `randomInt` and was masked in any output.

### The five things the coordinator asked me to verify

1. **`FILL_ANY_RECEIVER` catches a fill on a receiver that is not named like a PIN. VERIFIED.**
   - The rule is at `tests/unit/pin-auth-contract.test.ts:254`, and it is in the scan's list at `:284`.
   - Built at runtime, each of these is caught by this rule alone:
     - `field.fill(<4 digits>)`;
     - `inputs.nth(1).fill(<6 digits>)`;
     - `maybe?.fill(<4 digits>)`, with backticks;
     - `field.fill(<4 digits>, { force: true })`.
   - The shape "a fill of a field held in a variable not named like one" is at `:401-405`.
   - See Observation 1 for `page.fill(<selector>, <literal>)`.

2. **The derivation finds functions, arrows, function expressions and methods with a `/pin/i` parameter, and the rule catches a literal in a call to each. VERIFIED.**
   - The code is `pinParameterFunctions` (`:89-120`) and `boundNames` (`:76-80`). They use the TypeScript compiler API, with the script kind chosen per file (`.ts`, `.tsx`, `.js`, `.mjs`, `.cjs`).
   - **On the tree**, the derived set is exactly the 10 names the implementer lists, `attempt` among them.
   - **On declarations built at runtime under random names, all 18 forms are found:**
     - a function declaration, an exported async function, an overload signature and a `declare function`;
     - an arrow in a `const`, and an exported async arrow with a default value;
     - an anonymous and a named function expression;
     - a class method, a static method, and an async method with a rest parameter;
     - an object-literal method, an object-literal arrow property and a class-field arrow;
     - a parameter nested two levels deep in destructuring;
     - a `.tsx` component with destructured props;
     - an `.mjs` arrow and a `.cjs` object-property function.
   - **The negative control holds.** A source with `spin(page)`, `(username, count)` and `m(value)` yields nothing, so the rule matches parameter names and not function names.
   - **Calls to a derived name are caught** as a plain call, as `helpers.attempt(…)`, as `this.attempt(…)`, with a space before the parenthesis, and with the literal nested inside another call.
   - **The real scan catches both second-pass shapes end to end.** In the clone:
     - (E2E-a) I appended to `tests/e2e/sign-in.spec.ts` a function that calls `attempt(page, admin.username, <4 digits>)` and `field.fill(<6 digits>)`. The scan test went red with 2 offenders.
     - (E2E-b) I added a new untracked helper file declaring `submitCode(page, code, newPinValue)`, a name no rule has ever held, and calling it with a literal. The scan went red with 1 offender.

3. **The runtime-declared-helper test proves the derivation, not a fixed list. VERIFIED, with one caveat.**
   - At `:418-438`, four helpers get random names that no file holds: a declaration, an async arrow, an anonymous function expression with `{ pin }`, and a class method. A fifth function, `unrelated`, is a control. The derived set must be exactly those four.
   - Each helper's call must be caught by a rule built from the derived set, and **not** by the scan's own set. That shows the catch came from the derivation.
   - In the clone, I disabled each part of the derivation in turn: arrows, function expressions, methods, destructured parameters, and the holder's name. Each time this test went red.
   - **Caveat (Observation 2):** it proves the derivation function, not that the scan feeds it. When I replaced the scan's own set with a fixed list (R-f), all 39 tests stayed green. E2E-b shows that the scan does derive today.

4. **The mutations are real. VERIFIED, reproduced in the clone.** The baseline was 6 AC-8 tests passed. Then:

   | Mutation | Result |
   |---|---|
   | M-R2d: `FILL_ANY_RECEIVER` removed from the list | Non-vacuity red: the fill on a variable not named like a PIN, and the PIN-variable fill. |
   | M-R2e: `CALL_TO_PIN_PARAMETER` removed | Non-vacuity red: the hashPin, verifyPin, attemptSignIn and `attempt` shapes. |
   | M-R2f: `pinParameterFunctions` returns nothing | "At least attempt, hashPin and verifyPin" red (`expected [] to deeply equal ArrayContaining…`), and non-vacuity red: the four call shapes against the rule that matches nothing. |
   | R-a to R-e (mine): arrows, function expressions, methods, destructuring or the holder's name dropped from the derivation | The runtime-helper assertion red each time: three names, or two, where four were expected. |
   | R-f (mine): the scan's set replaced by a fixed list | **All green.** See Observation 2. |
   | R-g (mine): the fill rule narrowed back to a receiver named like a PIN | Non-vacuity red: "a fill of a field held in a variable not named like one", all six variants. |
   | E2E-a, E2E-b (mine) | The scan test red, as described in item 2. |

   After restoring, the result was 6 passed again.

5. **Nothing else moved. VERIFIED.**
   - Every code file other than `tests/unit/pin-auth-contract.test.ts` has the same modification time as in the second pass, and the same line counts in `git diff HEAD --stat`.
   - Against `HEAD`, that test file loses only two lines: the old `randomBytes` import and the old scan title.
   - The spec gained the "R2 again" ruling, 10 lines at `specs/features/021-pin_auth.md:1219-1228`, and the new AC-8 text at `:898`. `feature_list.json` mirrors it: 47 of 47 criteria match, and only AC-8, AC-9 and AC-16 differ from `HEAD`.
   - `progress/current.md` and `progress/impl_pin_auth.md` only gained lines at their ends.
   - The first and second passes in this file are byte-identical to what I wrote.
   - Implementer note 5, about `src/app/item-master/actions.ts:97`, refers to the coordinator's disclosed comment fix, which the second pass accepted.

### Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-8 | PASS | **The fill clause:** `pin-auth-contract.test.ts:254`, with non-vacuity at `:401-405`; M-R2d and R-g. **The derived-callee clause:** `:89-120` and `:260-270`; the "at least" test at `:333`; non-vacuity at `:406` and `:418-438`; M-R2e, M-R2f and R-a to R-e. **End to end:** E2E-a and E2E-b. The earlier halves are as the second pass recorded them. |

**Every other criterion** stands as the first and second passes recorded it. AC-9, AC-16 and AC-42 were closed in the second pass, and the rest passed in the first.

### Checkpoints
- C1 [x] Every numbered acceptance criterion is satisfied.
- C2 [x] `init` is green (the close-out runs). On the final tree: typecheck 0, lint 0, unit 1012/1012.
- C1 to C7: otherwise as recorded in the first two passes. Nothing in this repair touches them.

### Observations (non-blocking)
1. **`page.fill(<selector>, <literal>)` is not caught, and neither is `frame.fill(…)`.**
   - `FILL_ANY_RECEIVER` looks for the literal only as the first argument, and `.fill (` with a space before the parenthesis is missed too.
   - The suite uses locators only: there are 0 `page.fill(` or `frame.fill(` lines in the tree. A selector that names a PIN is already caught by `PIN_LINE`.
   - The regex I suggested in the second pass has the same gap.
   - A one-line hardening, `\.fill\s*\(.*` followed by `QUOTED_PIN`, flags 0 lines today. I recommend folding it in, with one non-vacuity shape, before #21 is committed.
2. **No test would catch the scan's own set being turned back into a fixed list** (R-f). One line would guard it: assert that `PIN_PARAMETER_FUNCTIONS` contains a name that only the derivation finds today, such as `NewPinNotice` (props destructured in a `.tsx` file), or that it equals the derivation over the scanned files.
3. **Forms the derivation cannot name:**
   - a constructor;
   - an arrow wrapped in a call (`useCallback`), in parentheses or in `as`;
   - an assignment to a member (`exports.x = function (pin) …`);
   - a private `#method`;
   - a function type with no body.

   In the real tree, the only function-like node with a PIN parameter that has no name is an inline `.map` callback (`profile-admin-service.db.test.ts:964`), which nothing can call by name. A renamed destructuring such as `{ pin: value }` binds no PIN name, but a call to it would carry a `pin:` key, which pattern 0 catches.
4. **Call shapes a lexical scan misses:** `name?.(…)`, `name<T>(…)`, `name.call(…)`, an alias, and a literal alone on the line of a wrapped call (see the second pass's Observation 3). None occurs today.
5. **About the clone:** the clone shared `node_modules` through a junction. Its vitest runs could therefore write only to vitest's own cache under `node_modules`, which is ignored and which every unit run writes. I removed the junction with `rmdir`, then deleted the clone. The repository's `node_modules` is intact.
