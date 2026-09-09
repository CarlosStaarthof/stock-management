# Implementation — feature 3 auth_and_roles

**Spec:** specs/features/003-auth_and_roles.md (approved, 32 criteria)
**Status:** complete
**Closed on:** a full `init` run with the database reachable — the database checks were
executed, not skipped (`CHECKPOINTS.md` C2.1).

Test totals: **63 unit** (`npm run test:unit`, 14 files, no database) · **29 service**
(`npm run test:db`, 4 files, real Postgres on the test branch) · **26 end-to-end**
(`npm run test:e2e`, real browser, real server, real database).

## Files created

### Schema and migration
- `prisma/migrations/20260908224453_create_user/migration.sql` — the repository's first
  migration: creates the `Role` type, the `User` table and the unique index on `email`.
- `prisma/migrations/migration_lock.toml` — records provider `postgresql`.

### Server (`src/server/`)
- `errors.ts` — `DomainError` base plus `NotFoundError`, `ValidationError`,
  `ConflictError`, `ForbiddenError` and the new `UnauthorizedError`.
- `errors.test.ts` — 401 and 403 are different types, and every error names itself.
- `auth/roles.ts` — the `Role` union and `ROLES`, declared without `@prisma/client` so the
  edge middleware never needs Prisma.
- `auth/session-user.ts` — `SessionUser` and the one mapper from row to session user; it
  copies fields by name, so no `passwordHash` can ever leave the layer.
- `auth/password.ts` — `hashPassword` / `verifyPassword`. The only file in the repository
  that imports bcrypt.
- `auth/password.test.ts` — the four AC-3 assertions plus a failure path.
- `auth/user-service.ts` — `createUser`, `verifyCredentials`, `findActiveUserById`,
  `listUsers`, `setUserActive`, `deleteUserByEmail`. Zod validation at the edge.
- `auth/user-service.db.test.ts` — 12 service tests against a real Postgres.
- `auth/guards.ts` — pure `assertUser` / `assertRole`, the two decisions `requireUser` and
  `requireRole` make.
- `auth/guards.test.ts` — all three AC-16 paths, with no database.
- `auth/session.ts` — `getCurrentUser`, `requireUser`, `requireRole`. Re-reads the `User`
  row on every request.
- `auth/session.db.test.ts` — 9 service tests, including the stored row beating the token.
- `auth/role-shape.ts` — `shapeForRole`, the money-boundary mechanism #8 inherits.
- `auth/role-shape.test.ts` — spy thunks prove only the selected shape is built.
- `auth/landing.ts`, `auth/landing.test.ts` — `landingPathForRole`, pure.
- `auth/next-auth.ts` — the Auth.js v5 instance and the credentials provider.
- `auth/test-db.ts` — `resetTestDb()`, which refuses to run unless `npm run test:db`
  proved it is pointed at the test database.
- `auth/credentials-logging.db.test.ts` — AC-4: the console spies.
- `auth/admin-create.db.test.ts` — AC-6 and AC-7: `npm run admin:create` run for real.

### Application (`src/app/`, `src/components/`, `src/lib/`, `src/types/`)
- `src/middleware.ts` — edge route protection; redirects a signed-out request to
  `/sign-in?callbackUrl=…` with 307.
- `src/lib/auth-config.ts` — the provider-free, edge-safe half of the Auth.js config.
- `src/lib/auth-messages.ts` — the three exact strings the criteria quote.
- `src/lib/money-boundary.ts` — `deepKeys`, `moneyKeysIn`, `assertNoMoneyKeys`,
  `passwordKeysIn`.
- `src/lib/money-boundary.test.ts` — the positive and negative fixtures of AC-19.
- `src/lib/log.ts` — the logger, so `src/` needs no `console.log`.
- `src/types/next-auth.d.ts` — pins the two fields put on `Session` and `JWT`.
- `src/app/auth-actions.ts` — the `signInAction` and `signOutAction` server actions.
- `src/app/page-guards.ts` — `requireUserPage`, `requireAdminPage`.
- `src/app/api/error-response.ts` — domain errors to status codes, in one place.
- `src/app/api/auth/[...nextauth]/route.ts` — re-exports the Auth.js handlers.
- `src/app/api/session/route.ts` — GET and POST, one implementation.
- `src/app/api/users/route.ts` — ADMIN only, through `requireRole`.
- `src/app/api/users/route.test.ts` — AC-22 at the handler: no secret, no 200, no users.
- `src/app/sign-in/page.tsx`, `src/app/sign-in/form-state.ts` — the sign-in screen.
- `src/app/stock-entry/page.tsx`, `src/app/stock-takes/page.tsx`,
  `src/app/analysis/page.tsx` — the three placeholders #8, #10 and #11 replace.
- `src/app/(public)/loading.tsx` — the loading fallback, moved (see Deviations).
- `src/components/SignInForm.tsx` — the form; the only new Client Component.
- `src/components/SignOutForm.tsx` — presentational sign-out control.

### Scripts, config, docs, tests
- `scripts/db-probe.mjs` — the shared reachability probe. Prints the host, never a
  credential; exit 0 within 10 s or 1.
- `scripts/run-db-tests.mjs` — `npm run test:db`: the two refusals, then migrate deploy,
  then vitest against the test branch.
- `scripts/admin-create.ts` — `npm run admin:create`.
- `vitest.db.config.ts` — the Level 2 suite; runs only `*.db.test.ts`.
- `docs/operations.md` — creating the first administrator, the four connection strings,
  what `init` does about the database.
- `tests/unit/schema-and-migration.test.ts` — AC-1 and AC-2 as facts about files.
- `tests/unit/hashing-boundary.test.ts` — AC-5 and AC-31.
- `tests/unit/no-default-password.test.ts` — the static half of AC-7.
- `tests/e2e/route-protection.spec.ts` — AC-12, AC-13, AC-32 (no database needed).
- `tests/e2e/sign-in.spec.ts` — AC-9, AC-10, AC-11, AC-12, AC-14, AC-21.
- `tests/e2e/role-access.spec.ts` — AC-15, AC-16, AC-18, AC-19, AC-20.
- `tests/e2e/support/database.ts` — the skip-with-annotation helper (AC-28).
- `tests/e2e/support/users.ts` — seeding, deactivating and signing in.

## Files modified

- `prisma/schema.prisma` — added `enum Role` and `model User`, and nothing else.
- `package.json` — added `test:db` and `admin:create`; added `next-auth@5.0.0-beta.32`,
  `bcryptjs@3.0.3`, `zod@4.5.4` and `tsx` (dev).
- `package-lock.json` — the same, locked.
- `init.ps1`, `init.sh` — a fifth step, `Database`: probe, `prisma migrate status`,
  `npm run test:db`; and a verdict that names a skip. Both changed identically.
- `vitest.config.ts` — excludes `**/*.db.test.ts`, so the two suites are disjoint.
- `playwright.config.ts` — loads `.env`; `workers: 3`; `retries: 1`; longer timeouts.
- `scripts/run-e2e.mjs` — mints an ephemeral `AUTH_SECRET` when the environment has none
  (see Deviations).
- `docs/verification.md` — Level 0 now lists the database step, `npm run test:db` and the
  skip behaviour (AC-29).
- `tests/unit/project-contract.test.ts` — spec 002's "zero models" assertion narrowed to
  the two declarations 003 AC-1 allows, as an equality so #4 cannot slip one in early.
- `tests/unit/repo-hygiene.test.ts` — added the AC-30 assertion for the test-database
  variables in `.env.example`.
- `src/app/page.tsx` → `src/app/(public)/page.tsx` — moved into a route group, with a
  sign-in link added (see Deviations).
- `src/app/loading.tsx` → `src/app/(public)/loading.tsx` — moved (see Deviations).
- `.env.example` — **edited by the user, not by this session.** Agents are denied
  `Read(./.env.*)`, which covers the template as well as `.env`. I specified the two lines
  and the user added them; `tests/unit/repo-hygiene.test.ts` now verifies them.

## Acceptance criteria

| AC | Where it is satisfied | Test that proves it |
|----|-----------------------|---------------------|
| AC-1 | `prisma/schema.prisma:30` (`enum Role`), `:40` (`model User`) | `tests/unit/schema-and-migration.test.ts` → "AC-1: declares exactly one model, User, and exactly one enum, Role"; "AC-1: Role is exactly { YARD_STAFF ADMIN }"; "AC-1: no feature #4 declaration appears anywhere in the file"; `tests/unit/project-contract.test.ts` → "AC-6 (002) narrowed by 003 AC-1…". `npx prisma validate` and `npx prisma generate` both exit 0 against `no-such-host.invalid` (transcript below) |
| AC-2 | `prisma/schema.prisma:40-49`; `prisma/migrations/20260908224453_create_user/migration.sql`; `prisma/migrations/migration_lock.toml` | `tests/unit/schema-and-migration.test.ts` → "AC-2: User carries the eight fields of the domain model and no others"; "AC-2: email is unique, role defaults to YARD_STAFF, active defaults to true"; "AC-2: prisma/migrations holds one directory, <timestamp>_create_user"; "AC-2: its SQL creates the Role type, the User table and a unique index on email"; "AC-2: migration_lock.toml records provider postgresql" |
| AC-3 | `src/server/auth/password.ts:15,19` (bcrypt, cost 10) | `src/server/auth/password.test.ts` → four named tests, all with no database: "the hash is neither the plaintext nor contains it", "hashing the same input twice yields two different strings, and both verify", "verifyPassword returns false for a different plaintext against the same hash", "the hash is bcrypt at cost 10 or above" |
| AC-4 | `src/server/auth/user-service.ts:116-141` (logs the email, never the password); `src/lib/log.ts` | `src/server/auth/credentials-logging.db.test.ts` → "AC-4: the password reaches no console method, while the failed attempt logs the email"; "AC-4: the attempted password of an unknown email is not logged either"; "AC-4: what verifyCredentials returns has no key matching /password/i at any depth" |
| AC-5 | `src/server/auth/password.ts:1` — the only `import bcrypt` in the repository | `tests/unit/hashing-boundary.test.ts` → "AC-5: exactly one file under src/, scripts/ and prisma/ imports the hashing library" (asserts set equality with `["src/server/auth/password.ts"]`); "AC-5: the admin-creation script reaches hashing through the service layer" |
| AC-6 | `scripts/admin-create.ts`; `src/server/auth/user-service.ts:84` | `src/server/auth/admin-create.db.test.ts` → "AC-6: creates an ADMIN, exits 0, and prints the email and the role but no secret"; "AC-6: a second run with the same email refuses, and changes nothing" (asserts the stored `passwordHash` and `role` are unchanged) |
| AC-7 | `scripts/admin-create.ts:36-41` (no fallback); `docs/operations.md` | `src/server/auth/admin-create.db.test.ts` → "AC-7: with ADMIN_PASSWORD unset it refuses, names the variable, and creates no row"; "AC-7: with ADMIN_PASSWORD empty it refuses too"; `tests/unit/no-default-password.test.ts` → "AC-7: no tracked file assigns a value to ADMIN_PASSWORD"; "AC-7: the documented invocation shows the placeholder, not a value"; "AC-7: the script has no fallback value to guess" |
| AC-8 | `src/server/auth/user-service.ts:26-82` (Zod at the edge), `:84-114` | `src/server/auth/user-service.db.test.ts` → "an invalid email raises ValidationError naming email and creates nothing"; "a password shorter than 12 characters…"; "a blank name…"; "a duplicate email raises ConflictError whose message contains the email"; "emails are stored lower-cased, and case does not create a second account" |
| AC-9 | `src/app/auth-actions.ts:28-58`; `src/app/api/session/route.ts:19-28` | `tests/e2e/sign-in.spec.ts` → "AC-9, AC-14: a YARD_STAFF user signs in and lands on /stock-entry"; "…an ADMIN signs in and lands on /stock-takes"; "AC-9: the email in the session is the stored, lower-cased one" |
| AC-10 | `src/server/auth/user-service.ts:116-141` (one answer for all three); `src/lib/auth-messages.ts` | `tests/e2e/sign-in.spec.ts` → "AC-10: wrong password, unknown email and deactivated account are one answer" (asserts 200, the identical message in all three cases, no session cookie, no landing redirect, and 401 from `/api/session`); "AC-10: the form keeps the typed email and clears the password"; `src/server/auth/user-service.db.test.ts` → "AC-10: a wrong password, an unknown email and a deactivated account are one answer" |
| AC-11 | `src/server/auth/session.ts:19-38`; `src/server/auth/user-service.ts:143-153`; `src/app/page-guards.ts:16-22` | `tests/e2e/sign-in.spec.ts` → "AC-11: deactivation takes effect on the next request, without touching the cookie" (asserts the cookie set is unchanged, the next `GET /stock-entry` answers 307 to `/sign-in?reason=inactive`, the message renders, `/api/session` is 401); `src/server/auth/session.db.test.ts` → "AC-11: deactivation takes effect on the next call…"; "AC-11: a session for a user whose row has been deleted is refused" |
| AC-12 | `src/middleware.ts:26-35,38`; `src/app/auth-actions.ts:20-24,50` | `tests/e2e/route-protection.spec.ts` → three tests "AC-12: /stock-entry \| /stock-takes \| /analysis redirects to /sign-in with the callbackUrl and sends no content"; "AC-12: / and /sign-in still answer 200, and / still has the Macroads Stock heading"; `tests/e2e/sign-in.spec.ts` → "AC-12: signing in from a protected URL lands on that URL, not on the default landing" |
| AC-13 | `src/server/auth/session.ts:19-38`; `src/app/api/error-response.ts:20-22` | `tests/e2e/route-protection.spec.ts` → "AC-13: /api/session with no session cookie is 401 Unauthorized and carries no user"; "AC-13: a token minted with the same AUTH_SECRET but a past exp is not a session"; `src/server/auth/session.db.test.ts` → "AC-13: returns null when there is no session" |
| AC-14 | `src/server/auth/landing.ts:18`; `src/app/auth-actions.ts:50` | `src/server/auth/landing.test.ts` → three tests, no database; `tests/e2e/sign-in.spec.ts` → "AC-9, AC-14: a YARD_STAFF user signs in and lands on /stock-entry"; "AC-9, AC-14: an ADMIN signs in and lands on /stock-takes" |
| AC-15 | `src/app/stock-takes/page.tsx` (both roles); `src/app/analysis/page.tsx:15` + `src/app/page-guards.ts:28-39`; `src/app/api/users/route.ts:16` | `tests/e2e/role-access.spec.ts` → "AC-15: YARD_STAFF reaches /stock-takes with 200"; "AC-15: ADMIN reaches /stock-takes with 200"; "AC-15, AC-16: /analysis and /api/users refuse YARD_STAFF and admit ADMIN"; `tests/e2e/route-protection.spec.ts` → "AC-15: /api/users with no session is refused" |
| AC-16 | `src/server/auth/session.ts:49`; `src/server/auth/guards.ts:18`; used by `src/app/api/users/route.ts:16` and `src/app/page-guards.ts:30` | `src/server/auth/guards.test.ts` → "returns the user when the role matches", "raises ForbiddenError naming the required role", "raises UnauthorizedError — not ForbiddenError — when there is no session"; `src/server/auth/session.db.test.ts` → the same three paths through the real service. The e2e refusal is the service's, not the middleware's: a `YARD_STAFF` request to `/analysis` carries a valid token, so the middleware admits it, and it is still refused |
| AC-17 | `src/server/auth/role-shape.ts:17` | `src/server/auth/role-shape.test.ts` → "a YARD_STAFF user gets the staff shape and forAdmin is never called"; "an ADMIN user gets the admin shape and forStaff is never called"; "a role-looking property on the user object is ignored — only user.role decides" |
| AC-18 | `src/server/auth/session.ts:19-38` (the row decides); `src/app/api/session/route.ts` takes no argument from the request | `tests/e2e/role-access.spec.ts` → "AC-18: a query parameter, a header and a cookie cannot change the role" — all three vectors at once, on GET and on POST with `role=ADMIN` in the body; asserts `"role":"YARD_STAFF"` in the response and 403 from `/api/users`. `src/server/auth/session.db.test.ts` → "AC-18: the role comes from the stored row, not from the session token" |
| AC-19 | `src/lib/money-boundary.ts:15,21,54` | `src/lib/money-boundary.test.ts` → "AC-19: fails on { line: { unitPriceSnapshot, totals: { lineValue } } }" and "AC-19: passes on a body with no monetary key", plus the array case; applied to real bodies in `tests/e2e/role-access.spec.ts` → "AC-19, AC-20: nothing a YARD_STAFF session can obtain carries money or a password" (`/api/session` 200 and `/api/users` 403) |
| AC-20 | `src/server/auth/session-user.ts`; `src/server/auth/user-service.ts:155-160` (five columns by name) | `tests/e2e/role-access.spec.ts` → "AC-20: the ADMIN listing of at least two accounts carries no password and no hash" (asserts the raw response text contains neither stored hash); `src/server/auth/user-service.db.test.ts` → "AC-20: the value it returns has no key matching /password/i at any depth"; "AC-20: lists accounts with no hash and no monetary key" |
| AC-21 | `src/app/auth-actions.ts:56-58`; `src/components/SignOutForm.tsx` | `tests/e2e/sign-in.spec.ts` → "AC-21: signing out ends the session" |
| AC-22 | `src/server/auth/session.ts:24-34` (fails closed); `src/app/api/error-response.ts` | `src/app/api/users/route.test.ts` → "AC-22: refuses with 401 and a body that contains no users key"; "AC-22: an unusable session is refused even when the request carries a session cookie"; `src/server/auth/session.db.test.ts` → "AC-22: an unreadable session — a missing AUTH_SECRET — degrades to null, not to access". **Also verified by hand against a real server with no secret** — transcript below. See the note on this criterion |
| AC-23 | `src/server/db.ts` (deferred construction, from #2); `dynamic = "force-dynamic"` on every protected page and route | Transcript below: with all four URLs pointed at `no-such-host.invalid`, `npx prisma validate`, `npx prisma generate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` each exit 0, and the build marks `/stock-entry`, `/stock-takes`, `/analysis` and every route handler `ƒ (Dynamic)` |
| AC-24 | `init.ps1` step 5 + `Write-DbSkip`; `init.sh` step 5 + `db_skip`; `scripts/db-probe.mjs` | Transcripts below: both scripts exit 0, print `[skip] database unreachable at no-such-host.invalid - database-dependent checks skipped` at column 0, print zero `[FAIL]` lines, never invoke `npm run test:db`, and end `[OK] Environment ready (database checks skipped)`. The `TEST_DATABASE_URL is not set` variant is shown too. The probe prints `[probe] unreachable <host>` — host only, no user info, no password |
| AC-25 | the same two steps | Transcripts below: with the database reachable both scripts print `[ok] prisma migrate status` and `[ok] npm run test:db`, no `[skip]` about the database, and end with exactly `[OK] Environment ready`. Negatives: one mutated service test → **both** scripts exit 1 listing `npm run test:db failed`; an unapplied migration directory → **both** exit 1 listing `prisma migrate status: a migration is pending, or the schema has drifted` |
| AC-26 | `vitest.config.ts:21` (excludes `**/*.db.test.ts`); `vitest.db.config.ts:23` (includes only them); `scripts/run-db-tests.mjs:29-45` | `npm run test:unit` runs 14 files, none matching `*.db.test.ts`; `npm run test:db` runs exactly the 4 files under `src/server/auth/`. Transcripts below: with `TEST_DATABASE_URL` empty it exits 1 naming `TEST_DATABASE_URL`, and set equal to `DATABASE_URL` it exits 1 with `TEST_DATABASE_URL must not equal DATABASE_URL` — in both cases before any test file is loaded |
| AC-27 | `src/server/auth/test-db.ts`; the four `*.db.test.ts` files | No file under `src/` or `tests/` mocks `@prisma/client` or `PrismaClient` (only `@/server/auth/next-auth` is stubbed, in two files). Transcripts below: `npm run test:db` passed twice in a row with no manual cleanup, and passed with the four files given in reversed order |
| AC-28 | `tests/e2e/support/database.ts`; `scripts/run-e2e.mjs` | Transcript below: with no database `npm run test:e2e` exits 0 — 12 passed, 14 skipped, every skipped test annotated `{"type":"skip","description":"database unreachable"}` (JSON reporter output below), and the unauthenticated-redirect spec runs and passes. With a database, 26 tests run and none is skipped |
| AC-29 | `docs/verification.md` Level 0, item 5 | The file lists the probe, `prisma migrate status`, `npm run test:db`, the exact skip line and the `(database checks skipped)` verdict, and restates C2.1 |
| AC-30 | `.env.example` (edited by the user; see Files modified); fixtures assembled from halves; runtime-generated passwords | `tests/unit/repo-hygiene.test.ts` → "003 AC-30: .env.example documents the test database alongside the other four" (asserts both variables are assigned, user info `USER:PASSWORD`, hosts ending `.invalid`), plus the four existing AC-8 hygiene tests; `npm run test:unit` passes with the credential scan in it |
| AC-31 | `src/middleware.ts` (imports only `next-auth`, `next/server`, `@/lib/auth-config`); `eslint.config.mjs` from #2 | `npm run lint` exits 0; `tests/unit/hashing-boundary.test.ts` → "AC-31: no file under src/app/ or src/components/ imports PrismaClient"; "AC-31: src/middleware.ts imports nothing from @prisma/client, transitively" (walks the whole `@/` import graph); "AC-31: every database access this feature adds lives under src/server/auth/" |
| AC-32 | `src/app/sign-in/page.tsx` (single column, `max-w-md`), `src/components/SignInForm.tsx` (full-width controls) | `tests/e2e/route-protection.spec.ts` → "AC-32: at 390 px it does not scroll sideways and every control is usable" — asserts `scrollWidth <= clientWidth` and that each of the three controls is visible, inside 390 px, and fillable |

### The one criterion with a qualification

**AC-22** is evidenced at the service layer, at the route handler, and by hand against a
real server with no secret — but **not** by an automated end-to-end test. Automating it
needs a second dev server started without `AUTH_SECRET`; I built that spec, and abandoned
it because a second Next dev server needs its own build directory, and giving it one makes
Next rewrite `tsconfig.json` on every run, leaving the repository dirty after every gate
run. I judged a permanently dirty tree worse than a recorded manual check. The manual run
is reproducible in one command and its transcript is below.

## Verification output

### Closing run — `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./init.ps1`

```
==> Harness integrity
    [ok]   17 required files present
==> Feature list
    [ok]   feature_list.json parses
    [ok]   18 features, 1 in progress
==> Source workbook untouched
    [ok]   Samples/ has no uncommitted changes
==> Application
    [ok]   node v24.14.0
    [ok]   node_modules present
    [ok]   prisma schema valid
    [ok]   npm run typecheck
    [ok]   npm run lint
 Test Files  14 passed (14)
      Tests  63 passed (63)
    [ok]   npm run test:unit
  26 passed (1.5m)
    [ok]   npm run test:e2e
==> Database
    [ok]   database reachable
    [ok]   prisma migrate status
 Test Files  4 passed (4)
      Tests  29 passed (29)
    [ok]   npm run test:db
[OK] Environment ready

init.ps1 exit=0
```

Tail of the same run, showing the service tests actually ran:

```
 ✓ src/server/auth/session.db.test.ts (9 tests) 4644ms
   ✓ getCurrentUser > AC-13: returns null when there is no session  802ms
   ✓ getCurrentUser > AC-9: returns the stored user for a session carrying their id  622ms
   ✓ getCurrentUser > AC-18: the role comes from the stored row, not from the session token  712ms
   ✓ getCurrentUser > AC-11: deactivation takes effect on the next call, with the session untouched  716ms
   ✓ getCurrentUser > AC-11: a session for a user whose row has been deleted is refused  613ms
   ✓ requireRole > AC-16: returns the user when the session role matches  411ms
   ✓ requireRole > AC-16: raises ForbiddenError naming the required role when the session role does not match  602ms
 ✓ src/server/auth/credentials-logging.db.test.ts (3 tests) 2598ms
   ✓ credential checks and the console > AC-4: the password reaches no console method, while the failed attempt logs the email  1706ms
   ✓ credential checks and the console > AC-4: the attempted password of an unknown email is not logged either  314ms
   ✓ credential checks and the console > AC-4: what verifyCredentials returns has no key matching /password/i at any depth  575ms

 Test Files  4 passed (4)
      Tests  29 passed (29)

    [ok]   npm run test:db

[OK] Environment ready
```

### Closing run — `bash ./init.sh`

```
==> Harness integrity
    [ok]   17 required files present
==> Feature list
    [ok]   feature_list.json parses
    [ok]   18 features, 1 in progress
==> Source workbook untouched
    [ok]   Samples/ has no uncommitted changes
==> Application
    [ok]   node v24.14.0
    [ok]   node_modules present
    [ok]   prisma schema valid
    [ok]   npm run typecheck
    [ok]   npm run lint
    [ok]   npm run test:unit
  25 passed (1.7m)
    [ok]   npm run test:e2e
==> Database
    [ok]   database reachable
    [ok]   prisma migrate status
    [ok]   npm run test:db
[OK] Environment ready

init.sh exit=0
final line: [OK] Environment ready
```

`25 passed` and `1 flaky` in this run, against `26 passed` under PowerShell: one test —
"AC-20: the ADMIN listing…" — hit `apiRequestContext.get: read ECONNRESET` on a request
that never reached the application, and passed on its single retry. That is the dev
server dropping a keep-alive socket under parallel load on Windows, and it is why
`playwright.config.ts` allows exactly one retry. It is reported here rather than hidden:
a real regression fails both attempts and the gate goes red.

### Re-run against the exact tree being handed over

This report and `progress/current.md` are themselves scanned by the credential and
password checks, so the gate was run once more after they were written:

```
init.sh exit=0
    [ok]   npm run typecheck
    [ok]   npm run lint
    [ok]   npm run test:unit
  26 passed (1.5m)
    [ok]   npm run test:e2e
    [ok]   database reachable
    [ok]   prisma migrate status
    [ok]   npm run test:db
[OK] Environment ready
final line: [OK] Environment ready
```

### AC-24 — the skip path, both scripts, no database

`DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointed at
`no-such-host.invalid`:

```
init.sh(skip) exit=0
      Tests  63 passed (63)
  14 skipped
  12 passed (45.6s)
[skip] database unreachable at no-such-host.invalid - database-dependent checks skipped
[OK] Environment ready (database checks skipped)
FAIL lines: 0
test:db never invoked

init.ps1(skip) exit=0
      Tests  63 passed (63)
  14 skipped
  12 passed (33.3s)
[skip] database unreachable at no-such-host.invalid - database-dependent checks skipped
[OK] Environment ready (database checks skipped)
FAIL lines: 0
```

The other skip message, with `TEST_DATABASE_URL` empty and the development database
reachable:

```
exit=0
  26 passed (1.5m)
    [ok]   npm run test:e2e

==> Database
[skip] TEST_DATABASE_URL is not set - database-dependent checks skipped

[OK] Environment ready (database checks skipped)
--- FAIL count: 0
```

The probe itself, on all four paths — it names the host and nothing else:

```
$ node scripts/db-probe.mjs TEST_DATABASE_URL
[probe] reachable ep-odd-boat-zamat29w-pooler.c-2.eu-west-2.aws.neon.tech
exit=0
$ node scripts/db-probe.mjs DATABASE_URL
[probe] reachable ep-cold-sound-zahsy82t-pooler.c-2.eu-west-2.aws.neon.tech
exit=0
$ DATABASE_URL="postgresql://USER:PASSWORD@nope.example.invalid:5432/db" node scripts/db-probe.mjs DATABASE_URL
[probe] unreachable nope.example.invalid
exit=1
$ NOPE= node scripts/db-probe.mjs NOPE
[probe] NOPE is not set
exit=1
```

### AC-25 — the negatives, both scripts

One service test mutated (`expect(created.role).toBe("ADMIN")` in
`user-service.db.test.ts`, since restored):

```
init.sh exit=1
      Tests  1 failed | 28 passed (29)
    [FAIL] npm run test:db failed
[FAILED] 1 problem(s):
  - npm run test:db failed

init.ps1 exit=1
    [FAIL] npm run test:db failed
[FAILED] 1 problem(s):
  - npm run test:db failed
```

A migration directory with nothing applied for it (`20991231000000_pending_check`, since
removed, and its row deleted from the test branch's `_prisma_migrations`):

```
$ npx prisma migrate status
Following migration have not yet been applied:
20991231000000_pending_check
status_exit=1

init.sh exit=1
[FAILED] 2 problem(s):
  - npm run test:unit failed
  - prisma migrate status: a migration is pending, or the schema has drifted

init.ps1 exit=1
[FAILED] 2 problem(s):
  - npm run test:unit failed
  - prisma migrate status: a migration is pending, or the schema has drifted
```

(The second problem is `tests/unit/schema-and-migration.test.ts` noticing the extra
directory — the repository's own AC-2 assertion firing, not a defect.)

### AC-26 — `test:db` refuses the development database

```
$ TEST_DATABASE_URL= npm run test:db --silent
[test:db] TEST_DATABASE_URL is not set. These tests truncate tables between tests, so they
need their own database or Neon branch. See .env.example.
exit=1

$ (TEST_DATABASE_URL set equal to DATABASE_URL)
[test:db] TEST_DATABASE_URL must not equal DATABASE_URL. These tests delete every row
between tests; point TEST_DATABASE_URL at a separate database or Neon branch.
exit=1
```

No vitest output in either: the refusal happens before a test file is loaded.

### AC-27 — twice in a row, and in reversed order

```
$ npm run test:db          # first
 Test Files  4 passed (4)
      Tests  29 passed (29)
$ npm run test:db          # again, no cleanup in between
 Test Files  4 passed (4)
      Tests  29 passed (29)
$ npm run test:db -- user-service.db.test.ts session.db.test.ts credentials-logging.db.test.ts admin-create.db.test.ts
 Test Files  4 passed (4)
      Tests  29 passed (29)
```

### AC-23 — every check that survives with no database

All four connection variables pointed at `no-such-host.invalid`:

```
=== npx prisma validate ===   The schema at prisma\schema.prisma is valid   exit=0
=== npx prisma generate ===                                                 exit=0
=== npm run typecheck  ===                                                  exit=0
=== npm run lint       ===                                                  exit=0
=== npm run test:unit  ===    Tests  63 passed (63)                          exit=0
=== npm run build      ===                                                  exit=0

Route (app)                                 Size  First Load JS
┌ ○ /                                    3.46 kB         106 kB
├ ○ /_not-found                            145 B         103 kB
├ ƒ /analysis                              145 B         103 kB
├ ƒ /api/auth/[...nextauth]                145 B         103 kB
├ ƒ /api/session                           145 B         103 kB
├ ƒ /api/users                             145 B         103 kB
├ ƒ /sign-in                               981 B         104 kB
├ ƒ /stock-entry                           145 B         103 kB
└ ƒ /stock-takes                           145 B         103 kB
ƒ  (Dynamic)  server-rendered on demand
```

No protected page is prerendered against a database.

### AC-28 — the annotation on a skipped end-to-end test

`npm run test:e2e -- tests/e2e/sign-in.spec.ts --reporter=json` with no database:

```
skipped | [{"type":"skip","description":"database unreachable"}, …] | AC-9, AC-14: a YARD_STAFF user signs in and lands …
skipped | [{"type":"skip","description":"database unreachable"}, …] | AC-9, AC-14: an ADMIN signs in and lands on /stock…
skipped | [{"type":"skip","description":"database unreachable"}, …] | AC-9: the email in the session is the stored, lowe…
skipped | [{"type":"skip","description":"database unreachable"}, …] | AC-12: signing in from a protected URL lands on th…
skipped | [{"type":"skip","description":"database unreachable"}, …] | AC-11: deactivation takes effect on the next reque…
skipped | [{"type":"skip","description":"database unreachable"}, …] | AC-21: signing out ends the session
skipped | [{"type":"skip","description":"database unreachable"}, …] | AC-10: wrong password, unknown email and deactivat…
skipped | [{"type":"skip","description":"database unreachable"}, …] | AC-10: the form keeps the typed email and clears t…
```

### AC-22 — by hand, against a server with no secret

Run while `.env` still had an empty `AUTH_SECRET`; `npm run dev`, then two requests
carrying a session cookie:

```
server ready: true
cookie=authjs.session-token=aaaaaaaaaaa… -> status=401 body={"error":"Unauthorized"}
  contains 'users' key: false
cookie=authjs.session-token=        …    -> status=401 body={"error":"Unauthorized"}
  contains 'users' key: false
/api/session -> 401 {"error":"Unauthorized"}
```

## Deviations from the spec

**1. `scripts/run-e2e.mjs` mints an ephemeral `AUTH_SECRET` when the environment has
none.** When I started, `.env` had `AUTH_SECRET=` — empty. Auth.js could mint no session,
so every sign-in specification failed with `MissingSecret`, and `init` was red for a
reason that had nothing to do with this feature's code. An agent cannot write `.env`, and
the application must not invent a fallback — AC-22 requires the exact opposite. So the
**test runner** supplies one, for the duration of the run, when and only when the
environment has none. It is random per run, written to no file, and passed to Playwright
and to the dev server it starts. This is the same argument spec 002 AC-11 makes for
`run-e2e.mjs` installing Chromium itself rather than leaving a "remember to…" note: the
suite must pass from a clean clone with no manual preparation. The application keeps no
fallback of its own — proved by the AC-22 transcript above, taken against a real server
with no secret. `.env` now has a 64-character secret (the user added it), so on this
machine the fallback no longer fires; the message it prints when it does is
`[e2e] AUTH_SECRET is not set in this environment; using an ephemeral secret for this run
only.`

**2. `src/app/loading.tsx` moved to `src/app/(public)/loading.tsx`, and `src/app/page.tsx`
with it.** This is the deviation that matters most, so here is the whole reasoning.

AC-11 requires the next `GET /stock-entry` by a deactivated user to **redirect** to
`/sign-in?reason=inactive`; AC-15 requires `GET /analysis` as `YARD_STAFF` to redirect to
`/stock-entry?denied=analysis`. Both refusals are `redirect()` calls in a Server
Component. They were answering **HTTP 200** with an HTML shell and a client-side redirect
instruction instead. Diagnosis, from the run recorded in this session: `/api/session`
correctly returned 401 for the same session while `/stock-entry` returned 200 — so the
guard was working and only the *shape of the answer* was wrong.

The cause is `loading.tsx`. A `loading.tsx` puts a Suspense boundary above every page
beneath it. The page is async, so it suspends; React flushes the shell and the fallback
immediately; the `redirect()` is thrown after the response has begun, and Next can no
longer send a 307 — it finishes the 200 and asks the browser to navigate. Removing the
root `loading.tsx` turned the very same code into `307 → /sign-in?reason=inactive`,
confirmed by experiment before I changed anything permanently.

Why moving it is the fix and not a workaround:

- It is not a change to the guard. The guard was already correct; the boundary above it
  was downgrading the server's answer to a suggestion. A refusal a client is free to
  ignore is not a refusal — `curl` would have seen 200 and the page shell.
- Spec 003 says of these very pages: "**empty** and **loading** are not applicable — they
  render no collection and fetch no data beyond the session." A loading boundary over them
  buys nothing and costs the redirect.
- Spec 002's prose asks for `src/app/loading.tsx` to render "while a segment suspends",
  and its only screen is `/`. Putting `/` and the fallback in a `(public)` route group
  keeps exactly that: `/` still has its loading state, the URL is unchanged, and 002's
  end-to-end specs still pass untouched. Nothing was deleted.
- The alternative — weakening the tests to `waitForURL` and accepting a 200 — would have
  been the workaround, and would have written "the server refuses" into the report while
  the server was, in fact, replying 200 with the page's shell.

`src/app/(public)/loading.tsx` carries this explanation as a comment, so the next person
who is tempted to move it back reads why first.

**3. `src/server/auth/user-service.ts` exports three functions the contract table does not
name:** `listUsers` (there is no `/api/users` without it), `setUserActive` (AC-11 needs a
user to be deactivated, and no user-management screen exists yet — spec 003 *Out of
scope*) and `deleteUserByEmail` (the end-to-end suite runs against the development
database and cleans up after itself). All three are in `src/server/auth/`, so AC-31 holds.

**4. `scripts/admin-create.ts` runs through `tsx`,** added as a devDependency, because the
script must reach hashing through `src/server/auth/password.ts` (AC-5) and therefore has
to resolve the `@/` alias into TypeScript sources.

**5. `playwright.config.ts` gained `workers: 3` and `retries: 1`.** One dev server serves
every worker and compiles each route on first request; beyond a few workers the contention
decides whether an assertion arrives in time. The single retry exists for
`read ECONNRESET` on requests that never reach the application (see the closing `init.sh`
run). Both are commented in the file. A real regression still fails both attempts.

**6. `tests/unit/project-contract.test.ts` was edited.** Spec 002 AC-6 asserted the schema
declares nothing; spec 003 AC-1 supersedes that for `User` and `Role`. The assertion is
now an equality against exactly those two declarations, so #4 still cannot add a model
early — it is narrowed, not relaxed.

**7. `.env.example` was edited by the user, not by this session.** `.claude/settings.json`
denies `Read(./.env.*)`, and that glob covers the template as well as the secret file, so
both the Write tool and every Bash form of the edit were refused. I did not work around
it: I reported the exact two lines needed and the user added them. `tests/unit/repo-hygiene.test.ts`
now asserts them, which is how AC-30 is verified here — the file is never opened by an
agent, only by a test.

## Notes for the reviewer

- **The database step is deliberately two probes.** `init` probes `DATABASE_URL` *and*
  `TEST_DATABASE_URL`, because the step then runs `prisma migrate status` against the
  development database and `npm run test:db` against the test one. Either being
  unreachable skips both, so the gate never half-runs.
- **The probe opens a TCP connection and asks nothing.** That keeps every database *query*
  in this feature inside `src/server/auth/` (AC-31) and makes it impossible for the probe
  to print a credential. The cost is that it cannot tell "the port answers" from "the
  credentials work"; a wrong password would fail loudly at `migrate status`, which is the
  right place for it.
- **`verifyCredentials` runs twice per sign-in** — once in the server action, to learn the
  role and hence the landing path, and once inside the credentials provider's `authorize`.
  Two bcrypt comparisons at cost 10, roughly 200 ms. I chose the duplicate work over
  guessing the landing path or reading the cookie the action had just set. If it ever
  matters, the fix is to have the action call `signIn(..., { redirect: false })` and then
  re-read the session — not to weaken the check.
- **An unknown email costs the same bcrypt work as a known one.** `ABSENT_USER_HASH` in
  `user-service.ts` is compared against when no row is found, so response time does not
  disclose which emails have accounts. It is a hash of 32 random bytes nobody kept.
- **The e2e suite writes to the development database.** That is the database the dev
  server under test is connected to; there is no other honest option at Level 4. Every
  account it creates has a random `@macroads-e2e.invalid` address and is deleted in
  `afterAll`. An interrupted run can leave one behind; nothing else touches them.
- **The session token carries `role`, and nothing reads it for a decision.**
  `src/server/auth/session.db.test.ts` → "AC-18: the role comes from the stored row, not
  from the session token" sets the token to `ADMIN` while the row says `YARD_STAFF` and
  asserts the row wins, including `requireRole("ADMIN")` throwing.
- **`shapeForRole` has no caller yet.** That is intended: spec 003 ships the mechanism and
  proves it on money-free payloads, and #8 brings the first `CountForStaff` /
  `CountForAdmin` pair. `assertNoMoneyKeys` is already applied to every JSON body a
  `YARD_STAFF` session can obtain today.
- **`feature_list.json` is untouched.** Feature #3 remains `in_progress`: closing it is the
  reviewer's gate and then the user's. Nothing is committed.
