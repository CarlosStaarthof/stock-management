# Review — feature 3 auth_and_roles

**Verdict:** APPROVED
**Spec:** specs/features/003-auth_and_roles.md (approved, 32 criteria)
**init:** green — **both scripts, database reachable, database checks executed**
(`CHECKPOINTS.md` C2.1)

Reviewed at `e49b794` + the uncommitted working tree. Nothing was edited by this review;
`git status` is byte-identical before and after. Every experiment that needed a mutation
was run in a copy of the tree outside the repository
(`…\scratchpad\app3`, `node_modules` junctioned, no `.env` copied).
`.env` and `.env.example` were never read, printed or echoed.

## Gate runs performed by this review

| Run | Command | Final line | Exit |
|---|---|---|---|
| Full, database reachable | `powershell -File ./init.ps1` | `[OK] Environment ready` | 0 |
| Full, database reachable | `bash ./init.sh` | `[OK] Environment ready` | 0 |
| No database (all four URLs → `no-such-host.invalid`) | `bash ./init.sh` | `[OK] Environment ready (database checks skipped)` | 0 |
| No database | `powershell -File ./init.ps1` | `[OK] Environment ready (database checks skipped)` | 0 |
| Database step forced to fail (`TEST_DATABASE_URL` → a TCP port that answers but is not Postgres) | `bash ./init.sh` | `[FAILED] 1 problem(s): - npm run test:db failed` | 1 |
| Same | `powershell -File ./init.ps1` | `[FAILED] 1 problem(s): - npm run test:db failed` | 1 |

The two full runs executed the database step for real: `[ok] database reachable`,
`[ok] prisma migrate status`, `[ok] npm run test:db` with `Test Files 4 passed (4) /
Tests 29 passed (29)` in both. Unit suite: 14 files, 63 tests. End-to-end: 26 passed
(`init.sh`); `init.ps1` reported `23 passed, 3 flaky` — see Observations. The two skip
runs printed zero `[FAIL]` lines and never invoked `npm run test:db`.

## The three items the leader asked to be judged first

### 1. AC-22 — "no automated end-to-end test" — the qualification stands, the criterion passes

I reproduced the criterion end to end myself, twice, in the scratch copy: a real
`next dev`, real HTTP, **`AUTH_SECRET` deleted from the process environment**, request
carrying `Cookie: authjs.session-token=aaaaaaaaaaaaaaaaaaaaaaaa`:

```
GET /api/users   -> 401  body={"error":"Unauthorized"}  (24 bytes, no "users" key)
GET /api/session -> 401  body={"error":"Unauthorized"}
GET /stock-entry -> 307  location=/sign-in?reason=inactive
```

The application invents no fallback: `src/server/auth/session.ts:25-32` catches the
`MissingSecret` throw from `auth()` and returns `null`, and the server log for the run
shows the throw arriving from `@auth/core/lib/actions/session.js` — the real path, not a
simulated one. `scripts/run-e2e.mjs:69-76` minting an ephemeral secret is therefore
legitimate: it is the *test runner's* environment, the value is random per run and written
to no file, and with no secret the app still refuses (proved above).

I also tested the stated obstacle rather than accepting it. Giving a second dev server its
own build directory does make Next rewrite `tsconfig.json`: with
`distDir: process.env.NEXT_DIST_DIR ?? ".next"`, one `next dev` run reformatted the whole
file and appended `".next-nosecret/types/**/*.ts"` to `include`. In-repo that is a dirty
tree after every gate run, exactly as claimed. The only automation I found that avoids it
is the one I used — copy the tree to a temp directory and junction/symlink `node_modules`
— which is a bespoke, platform-specific harness for one criterion. I accept the
qualification.

AC-22 is **PASS**, not on "the code looks right": the gate contains
`src/app/api/users/route.test.ts:39-61` (401, no `users` key when `auth()` throws
`MissingSecret`) and `src/server/auth/session.db.test.ts:102-107`, and the precondition
those two assume — "no secret ⇒ `auth()` throws" — is what I verified against a real
server. See Observations for the one thing that remains unpinned by the suite.

### 2. `src/app/loading.tsx` → `src/app/(public)/loading.tsx` — the diagnosis is correct

Verified in the scratch copy, three runs, same code, middleware disabled so the *page*
guard answers (no `AUTH_SECRET`, so `getCurrentUser()` is `null`):

| Arrangement | `/stock-entry` | `/analysis` | `/stock-takes` | `/` |
|---|---|---|---|---|
| A — as shipped (`(public)/loading.tsx`) | **307** → `/sign-in?reason=inactive` | **307** | **307** | 200, loading fallback present in the streamed shell |
| B — `loading.tsx` put back at `src/app/` | **200**, 24 621 bytes of shell | **200** | **200** | 200 |
| C — negative control, no `loading.tsx` anywhere | 307 | 307 | 307 | 200, **fallback absent** (14 142 bytes) |

B is the pre-move behaviour and it is exactly the failure described: the refusal degrades
to a 200 with the page shell, which `curl` would accept. C proves the "Loading" marker in
A's `/` really comes from `(public)/loading.tsx`, i.e. `/` keeps the loading state spec 002
asks for. This is a fix, not a workaround, and AC-11, AC-12 and AC-15 rest on it honestly.
Note for the leader: spec 002 line 114 names the literal path `src/app/loading.tsx` in its
UI-states prose; no 002 acceptance criterion and no test names that path, so nothing is
broken, but 002's prose is now one word out of date.

### 3. `scripts/run-e2e.mjs` minting an ephemeral `AUTH_SECRET`

Legitimate — see item 1. The refusal is the application's own, with no secret present at
all, and `grep` finds no fallback secret anywhere under `src/`.

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `prisma/schema.prisma:30` (`enum Role`), `:40` (`model User`), nothing else; `tests/unit/schema-and-migration.test.ts:58-76` asserts set equality and scans for all ten feature-#4 names; `tests/unit/project-contract.test.ts:34-50` re-asserts it as an equality. My run with all four URLs on `no-such-host.invalid`: `npx prisma validate` exit 0, `npx prisma generate` exit 0. |
| AC-2 | PASS | `prisma/schema.prisma:41-48` — the eight fields, no others; `prisma/migrations/20260908224453_create_user/migration.sql:5,8,22` creates the type, the table and `User_email_key`; `migration_lock.toml` records `postgresql`; `tests/unit/schema-and-migration.test.ts:78-129`. The directory is present and not gitignored (`?? prisma/migrations/`); the whole feature is uncommitted, so "committed" is satisfied when the feature commit is made. |
| AC-3 | PASS | `src/server/auth/password.ts:15,19` (cost 10); `src/server/auth/password.test.ts:19-56` — five named tests, all in `test:unit`, which I ran green with no reachable database. |
| AC-4 | PASS | `src/server/auth/credentials-logging.db.test.ts:37-81` spies on `log/info/warn/error`, drives a real success and a real failure with a runtime-generated password, asserts the password appears nowhere and the failed attempt logs the email; ran in both full `init` runs. |
| AC-5 | PASS | `tests/unit/hashing-boundary.test.ts:71-77` asserts the importer set equals `["src/server/auth/password.ts"]` over `git ls-files --cached --others`; `:86-91` asserts `scripts/admin-create.ts` reaches hashing through the service. |
| AC-6 | PASS | `src/server/auth/admin-create.db.test.ts:58-94` runs the real `npm run admin:create`: exit 0, prints email + `ADMIN`, prints neither password nor hash; second run non-zero, `already exists`, and asserts the stored `passwordHash` and `role` are unchanged. |
| AC-7 | PASS | `src/server/auth/admin-create.db.test.ts:96-112` (unset and empty, non-zero, `ADMIN_PASSWORD` named, `db.user.count() === 0`); `tests/unit/no-default-password.test.ts:59-89` scans every tracked/untracked file — `.env.example` included — for a password assignment, checks `docs/operations.md:13` shows the literal placeholder, and checks the script has no fallback. |
| AC-8 | PASS | `src/server/auth/user-service.db.test.ts:80-166` — invalid email / short password / blank name each `ValidationError` with `field` asserted and row count unchanged; duplicate `ConflictError` containing the email; lower-casing proved by signing in shouted and by the second create conflicting. |
| AC-9 | PASS | `tests/e2e/sign-in.spec.ts:34-81` — landing path, `authjs.session-token` present, `/api/session` 200 with `role` and the stored lower-cased `email`. |
| AC-10 | PASS | `tests/e2e/sign-in.spec.ts:84-136` drives all three failure modes, asserts the POST is 200, the message is `Invalid email or password.`, `new Set(messages).size === 1`, no session cookie, URL still `/sign-in`, and `/api/session` 401; `src/server/auth/user-service.db.test.ts:185-201` proves the three are literally the same value. |
| AC-11 | PASS | `tests/e2e/sign-in.spec.ts:169-195` — cookie set unchanged before/after, then `page.request.get("/stock-entry", { maxRedirects: 0 })` asserted **on the response**: 307, `location: /sign-in?reason=inactive`, the message renders, `/api/session` 401; `src/server/auth/session.db.test.ts:75-100` (row wins, deleted row refused). I independently reproduced the 307 in the scratch copy (table above). |
| AC-12 | PASS | `tests/e2e/route-protection.spec.ts:18-33` (per path: 302/307, exact `?callbackUrl=` encoding, body contains none of the three page names), `:36-48` (`/` and `/sign-in` 200, `Macroads Stock` heading), `tests/e2e/sign-in.spec.ts:152-167` (signing in from `/analysis` lands on `/analysis`, not the ADMIN default). |
| AC-13 | PASS | `tests/e2e/route-protection.spec.ts:50-62` (401 `{"error":"Unauthorized"}`, body contains none of `email/role/name/landingPath`), `:73-107` mints a token with the real `AUTH_SECRET` and `maxAge: -3600` → `/stock-entry` ends on `/sign-in`, `/api/session` 401. |
| AC-14 | PASS | `src/server/auth/landing.test.ts:6-23` (pure, no database); `tests/e2e/sign-in.spec.ts:34,53` end to end for both roles. |
| AC-15 | PASS | `tests/e2e/role-access.spec.ts:34-44` (both roles 200 on `/stock-takes`), `:46-81` (`YARD_STAFF` → `/stock-entry?denied=analysis` with `You do not have access to that page.`, `/api/users` 403 `{"error":"Forbidden"}` and the text contains no `users`; ADMIN gets 200 on both). |
| AC-16 | PASS | `src/server/auth/guards.test.ts:16-58` — all three paths, `ForbiddenError` message contains `ADMIN`, and `UnauthorizedError` explicitly *not* `ForbiddenError`; `src/server/auth/session.db.test.ts:110-142` through the real service; both consumers go through it (`src/app/api/users/route.ts:16`, `src/app/page-guards.ts:30`), and the e2e refusal is the service's — a signed-in `YARD_STAFF` carries a valid token, so the middleware admits the request. |
| AC-17 | PASS | `src/server/auth/role-shape.test.ts:16-47` — spy thunks, `toHaveBeenCalledTimes(0)` on the unselected branch in both directions, plus a smuggled `requestedRole`/`x-user-role` ignored. |
| AC-18 | PASS | `tests/e2e/role-access.spec.ts:83-109` — cookie `role=ADMIN`, header `x-user-role: ADMIN` and `?role=ADMIN` together: `/api/session` returns `"role":"YARD_STAFF"` (asserted on the raw text too), `/api/users` 403; repeated as POST with body `role=ADMIN`. Asserted on the response, not the source. `src/app/api/session/route.ts:33-39` takes no request argument at all. |
| AC-19 | PASS | `src/lib/money-boundary.ts:15,21,46,54`; `src/lib/money-boundary.test.ts:33-48` — the exact fixture fails, a clean fixture passes, arrays covered; applied to real bodies in `tests/e2e/role-access.spec.ts:111-130` (`/api/session` 200 and `/api/users` 403). |
| AC-20 | PASS | `tests/e2e/role-access.spec.ts:132-151` — ADMIN listing of ≥2 accounts, deep-key scan empty, and the raw response text asserted not to contain either stored `passwordHash` (fetched from the row); `src/server/auth/user-service.db.test.ts:58-65,217-231`; `src/server/auth/session-user.ts:28` copies four fields by name. |
| AC-21 | PASS | `tests/e2e/sign-in.spec.ts:197-212` — cookie absent or empty, `/stock-entry` ends on `/sign-in`, `/api/session` 401. |
| AC-22 | PASS | See "the three items", §1. In-gate: `src/app/api/users/route.test.ts:39-61`, `src/server/auth/session.db.test.ts:102-107`. Out-of-gate, by me: real server with no `AUTH_SECRET` → `/api/users` 401, 24-byte body, no `users` key. |
| AC-23 | PASS | My run with all four URLs on `no-such-host.invalid`: `prisma validate` 0, `prisma generate` 0, `typecheck` 0, `lint` 0, `test:unit` 0 (63 passed), `build` 0. Build output marks `/analysis`, `/stock-entry`, `/stock-takes`, `/sign-in` and every route handler `ƒ (Dynamic)`; only `/` and `/_not-found` are `○ (Static)`. |
| AC-24 | PASS | Both scripts, table above: exit 0, `[skip] database unreachable at no-such-host.invalid - database-dependent checks skipped` at column 0, zero `[FAIL]`, `npm run test:db` never invoked, final line `[OK] Environment ready (database checks skipped)`. Probe run directly by me: `[probe] unreachable nope.example.invalid` (exit 1) for a URL carrying `alice:s3cr3t-pw` — neither user info nor password printed; `[probe] NOT_A_VAR is not set` (exit 1); `[probe] reachable <host>` (exit 0). Both scripts call the same `scripts/db-probe.mjs`. |
| AC-25 | PASS | Both full runs: `[ok] prisma migrate status`, `[ok] npm run test:db`, no `[skip]` about the database, final line exactly `[OK] Environment ready`. Negative half verified by me for the `test:db` branch: with the database step forced to fail, **both** scripts printed `[FAIL] npm run test:db failed` and exited 1, identically. The drift branch (`prisma migrate status` non-zero → `bad`) is the same wiring in `init.sh:181-185` / `init.ps1:229-235` that I have now shown fails the gate, plus the implementer's transcript. |
| AC-26 | PASS | `vitest.config.ts:21` excludes `**/*.db.test.ts`; `vitest.db.config.ts:23` includes only them. `test:unit` ran 14 files, none `*.db.test.ts`; `test:db` ran exactly 4, all under `src/server/auth/` (admin-create 5, user-service 12, session 9, credentials-logging 3 = 29). Refusals run by me: `TEST_DATABASE_URL=` → exit 1, "TEST_DATABASE_URL is not set"; `TEST_DATABASE_URL == DATABASE_URL` → exit 1, "TEST_DATABASE_URL must not equal DATABASE_URL". No vitest output in either — the refusal is at `scripts/run-db-tests.mjs:31-45`, before any file is loaded. |
| AC-27 | PASS | `grep` over `src/` and `tests/`: the only `vi.mock` calls are `@/server/auth/next-auth` in two files; nothing mocks `@prisma/client`/`PrismaClient`. Every `*.db.test.ts` seeds after `resetTestDb()`. `npm run test:db` passed three times in a row here with no cleanup between (both full `init` runs plus one direct run) and passed with the four files given explicitly in reversed order. |
| AC-28 | PASS | Skip runs: `12 passed, 14 skipped`, exit 0, and the unauthenticated-redirect specs ran. JSON reporter run by me with an unreachable database: every skipped test carries `{"type":"skip","description":"database unreachable"}` (`tests/e2e/support/database.ts:61`). With a database: 26 tests run, none skipped. |
| AC-29 | PASS | `docs/verification.md` Level 0 item 5 lists the probe, both skip messages, the `[skip] … database-dependent checks skipped` line, `prisma migrate status`, `npm run test:db` and the `(database checks skipped)` verdict, and restates C2.1. |
| AC-30 | PASS | `tests/unit/repo-hygiene.test.ts:148-171` asserts `TEST_DATABASE_URL` and `TEST_DIRECT_URL` are assigned in `.env.example`, that there are exactly two such lines, that the user info is `USER:PASSWORD` and the host ends `.invalid`; the four pre-existing hygiene tests still pass; every fixture connection string in the new tests/scripts is a placeholder and every test password is `randomBytes` at runtime. `npm run test:unit` green. (Verified only through the test — I did not open `.env.example`.) |
| AC-31 | PASS | `npm run lint` exit 0 (twice, once with no database); `tests/unit/hashing-boundary.test.ts:95-147` — no `PrismaClient` under `src/app/` or `src/components/`, `src/middleware.ts` clean transitively through the whole `@/` graph (with a non-vacuity assertion), and every `@/server/db` importer is under `src/server/auth/` or is #2's `db.ts`. `grep` confirms no `src/server` or `src/lib` file imports from `@/app` or `@/components`. |
| AC-32 | PASS | `tests/e2e/route-protection.spec.ts:110-140` at 390 px: `scrollWidth <= clientWidth`, all three controls visible, right edge ≤ 390, and both inputs actually filled. Passed in both full runs. |

## Checkpoints

### C1 — Process
- C1.1 [x] Only feature #3's surface is touched — auth, the gate, its docs and its tests. No stock-domain model, no `Location`/`Item`/`StockCount` anywhere (`tests/unit/schema-and-migration.test.ts:71`).
- C1.2 [x] `specs/features/003-auth_and_roles.md`, approved.
- C1.3 [x] All 32 walked above; each has a named test or a run I performed.
- C1.4 [x] `feature_list.json` `acceptance[]` compared to the spec programmatically: 32 vs 32, zero differences beyond the `AC-n —` / `AC-n:` separator.
- C1.5 [x] `progress/impl_auth_and_roles.md` exists; its file list matches `git status` item for item, including the two moves and the `.env.example` edit it attributes to the user.

### C2 — Verification
- C2.1 [x] `[OK] Environment ready` from **both** scripts with the database reachable and the database checks executed (`[ok] npm run test:db`, 29 tests). Not a skipped run.
- C2.2 [x] `npm run typecheck` — 0 errors, in four separate runs.
- C2.3 [x] `npm run lint` — 0 errors, including with no reachable database.
- C2.4 [x] Success and failure tests for each new service function: `hashPassword`/`verifyPassword`, `createUser`, `verifyCredentials`, `findActiveUserById` (via `getCurrentUser`: found / deactivated / deleted), `setUserActive` (deactivate and reactivate), `assertUser`/`assertRole`, `shapeForRole`, `landingPathForRole`. `listUsers` has a success test and no constructible failure mode; `deleteUserByEmail` (`deleteMany`, idempotent) has none — see Observations.
- C2.5 [x] Tests assert values, not absence of exceptions: exact status codes, exact bodies (`{"error":"Forbidden"}`), the identical-message set of size 1, the stored hash absent from raw text, `location` headers.
- C2.6 [x] Real Postgres on a separate branch, real `admin:create` subprocess, real browser; no filesystem or database mocking.

### C3 — Architecture
- C3.1 [x] No component or route handler imports `PrismaClient`; handlers call `requireRole`/`requireUser`/`listUsers` and never write a query inline.
- C3.2 [x] Data access lives in `src/server/auth/user-service.ts`, one module for the accounts aggregate.
- C3.3 [x] N/A — no Excel builder in this feature.
- C3.4 [x] No cycles: `session.ts → next-auth.ts → user-service.ts`, and `user-service.ts` imports nothing back.
- C3.5 [x] `prisma/migrations/20260908224453_create_user/` accompanies the schema edit, and `init` fails on drift.

### C4 — Domain integrity
- C4.1 [x] N/A — no monetary column exists yet; `shapeForRole` ships as the mechanism.
- C4.2 [x] `assertNoMoneyKeys` applied to every body a `YARD_STAFF` session can obtain (`/api/session` 200, `/api/users` 403); both clean.
- C4.3 [x] N/A — no money or quantity column in this feature.
- C4.4 – C4.7 [x] N/A — no `StockCount` yet.
- C4.8 [x] `Samples/` untouched — asserted by `init` in all six runs and by `git status`.

### C5 — Conventions
- C5.1 [x] kebab-case services, `PascalCase.tsx` components, `*.test.ts` mirrors, `SCREAMING_SNAKE` enum values, kebab-case routes; default exports only where Next requires them.
- C5.2 [x] `src/server/errors.ts` typed errors throughout; no bare `throw new Error` in a service (the one `throw new Error` is `test-db.ts:16`, a refusal in test support, deliberately not a domain error).
- C5.3 [x] No `console.log` under `src/` (only the mention inside `src/lib/log.ts`'s comment); logging goes through `logWarn`/`logError`.
- C5.4 [x] No `TODO` anywhere in `src/`, `tests/`, `scripts/`.
- C5.5 [x] `.env` gitignored (`.gitignore:15-17`); the hygiene scan over every tracked and untracked file passes.

### C6 — Session hygiene
- C6.1 [x] `progress/current.md` carries the plan, the approach and a work log written during the session.
- C6.2 [x] No scratch files in the tree; `test-results/`, `.next/`, `*.tsbuildinfo` are all gitignored.
- C6.3 [x] `feature_list.json` still says `in_progress` — correct; closing it is the leader's step, not the implementer's.

### C7 — Advisory (reported, not blocking)
- C7.1 [x] `/sign-in` has all three states (empty form, pending submit via `useFormStatus`, error region). The placeholder pages have no loading fallback by design — spec 003 says loading is not applicable to them, and a boundary above them would break the 307 (verified above).
- C7.2 [x] AC-32 proves the 390 px viewport.
- C7.3 [x] N/A — no user-facing number in this feature.

## Required changes

None blocking.

## Observations (non-blocking)

1. **`docs/operations.md:41-50` is now false.** The note dated 2026-09-09 says
   "`.env.example` still documents only the first pair" and gives the two lines to add.
   The user has since added them — `tests/unit/repo-hygiene.test.ts:148-171` asserts both
   variables are present and passes. Delete that block before the feature commit; an
   operator reading it today would be told the template is missing something it has.
2. **`playwright.config.ts:35` `retries: 1` hides intermittent failures.** My `init.ps1`
   run reported `3 flaky` — all three of feature 002's `tests/e2e/home.spec.ts` tests,
   each `page.goto: net::ERR_NETWORK_IO_SUSPENDED` at 90 s, each green on the retry. The
   same suite was `26 passed, 0 flaky` under `init.sh` minutes later, so this is machine
   noise rather than the application; but with one retry allowed, a genuinely intermittent
   regression can still reach `done`. Worth revisiting if the flaky count grows.
3. **AC-22's in-gate tests assume "no secret ⇒ `auth()` throws `MissingSecret`".** Both
   `src/app/api/users/route.test.ts:41` and `src/server/auth/session.db.test.ts:103`
   simulate the precondition. It is true today (I verified it against a real server), but
   nothing in the suite would notice if a future Auth.js version silently generated a
   development secret instead of throwing. A cheap pin would be a unit test asserting that
   `next-auth`'s own `auth()` rejects with no secret configured.
4. **`deleteUserByEmail` (`src/server/auth/user-service.ts:177`) has no test.** It exists
   for the end-to-end suite's `afterAll`, which exercises it unasserted. It has no failure
   mode worth a test, but it is a service function with no coverage of its own.
5. **The end-to-end suite writes to the development database.** Documented and defended in
   the implementation report; accounts are random `@macroads-e2e.invalid` addresses and
   deleted in `afterAll`, but an interrupted run leaves rows behind. Worth a cleanup note
   in `docs/operations.md` when a feature next touches it.
6. **`requireUserPage` sends every null session to `?reason=inactive`**
   (`src/app/page-guards.ts:19`). For a deactivated user that is exactly right. For a
   missing `AUTH_SECRET` — which I reproduced — a signed-out visitor would be told their
   account is no longer active. The middleware catches the ordinary signed-out case first,
   so this only shows up in a misconfigured deployment; still, the message is a guess about
   *why* the session is unusable.
7. **`verifyCredentials` runs twice per sign-in** (server action, then `authorize`): two
   bcrypt comparisons at cost 10 per attempt. Documented as a deliberate trade-off against
   guessing the landing path. Fine at this size; note it if sign-in latency ever matters.
8. **Spec 002's UI-states prose names `src/app/loading.tsx`** and the file now lives at
   `src/app/(public)/loading.tsx`. No 002 criterion or test names the path, so nothing
   regressed, but the leader may want that line of 002 amended so the next reader does not
   "restore" it.
