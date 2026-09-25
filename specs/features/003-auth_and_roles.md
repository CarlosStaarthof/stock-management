# 003 — Accounts and role-based access

**Feature id:** 3   **Status:** approved — signed off 2026-09-08
**Depends on:** #2 `app_scaffold`

## Amendment made before approval

One change, agreed with the user, and it is to `CHECKPOINTS.md` rather than to these
criteria.

**AC-24 decides that `init` stays green when the database is unreachable**, skipping the
database-dependent checks and saying so. That is the right call — failing would block all
work until Neon is configured — but it puts a hole in the gate. `CHECKPOINTS.md` C2.1
said a feature cannot be marked `done` unless `init` is green; if green can mean
"database checks skipped", a feature could be closed having never run its service tests.

C2.1 now reads that `init` must be green **and not have skipped the database checks**.
The reviewer must see a full run before approving. The 32 criteria below are unchanged.

## Purpose

Every screen after this one is role-shaped. `YARD_STAFF` counts and never sees a euro;
`ADMIN` approves, prices and reads Analysis. This feature delivers the identity that
decision rests on: a `User` model, the two-role enum, credentials sign-in, route
protection, landing by role, and — before any money exists to leak — the server-side
mechanism that chooses a response shape from the session role and nothing else.

Without it there is no session to ask, so #7 onwards would each invent their own answer to
"who is this?", and `specs/domain-model.md` Invariant 12 (`YARD_STAFF` is never *sent* a
monetary value) would be enforced, if at all, in components — which is where it fails.

## Scope boundary with #4 `domain_schema`

Spec 002 said the whole Prisma schema belongs to #4. That is narrowed here, deliberately:
**#3 owns `User`, the `Role` enum and the first migration** — authentication cannot be
tested against a table that does not exist — and **#4 owns every other model** in
`specs/domain-model.md` Part 3. #3 must not add a single stock-domain model. See
*Out of scope*.

## User stories

- As a **YARD_STAFF** user, I can sign in with my email and password on my phone and
  arrive directly on Stock Entry, so counting starts in one tap and not after navigating a
  menu built for the office.
- As an **ADMIN**, I can sign in and arrive on Stock Takes, so the first thing I see is
  what needs approving.
- As an **ADMIN**, I can create the first administrator account on a new database without
  a password ever entering the repository, so deploying this app does not publish a way
  into it.
- As an **ADMIN**, I can deactivate a leaver and have them locked out on their very next
  request, without waiting for a token to expire.
- As the **owner**, I can be sure a yard phone cannot ask for admin data by editing a URL,
  because role comes from the session and from nowhere else.
- As an **implementer of #7–#11**, I can call one helper to get the current user's role and
  one helper to choose between a staff shape and an admin shape, so the money boundary is a
  single mechanism rather than a habit.

## Data touched

**Written by this feature:** one new model and one new enum, and nothing else.

```prisma
enum Role { YARD_STAFF ADMIN }

model User {
  id           String   @id @default(cuid())
  email        String   @unique          // stored lower-cased
  name         String
  passwordHash String                    // bcrypt, cost >= 10. Never the password.
  role         Role     @default(YARD_STAFF)
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

This is the repository's **first migration**: `prisma migrate dev --name create_user`,
run through `DIRECT_URL` because migrations fail through Neon's pooler. Spec 002 AC-6
required zero models; that requirement is superseded here for `User` and `Role` only.

**Read:** the `User` row on every authenticated server-side request, so that
deactivation and role changes take effect immediately rather than when a token expires.

**Environment:** `AUTH_SECRET` and `AUTH_URL` already exist in `.env.example` (002 AC-7). *(`.env.example` was retired on 2026-09-25; `.env` is the only settings file. See the note under 002 AC-7.)*
This feature adds `TEST_DATABASE_URL` and `TEST_DIRECT_URL` — a **separate** Neon branch
or database used only by `npm run test:db`, because Level 2 tests truncate tables between
tests and must never be pointed at the developer's data. `.env` itself is gitignored and
denied to agents; no test, script or documented step may require reading it.

### How the first ADMIN comes to exist

No account is seeded with a committed password, because a password in git is a published
password. Instead the operator runs, once, against the target database:

```
ADMIN_EMAIL=you@macroads.ie ADMIN_PASSWORD=<choose-a-strong-password> npm run admin:create
```

`admin:create` hashes the password through `src/server/auth/password.ts`, writes the user
with `role = ADMIN`, prints the email and role, and never prints, logs or stores the
plaintext. With `ADMIN_PASSWORD` unset it refuses and exits non-zero: there is no
fallback value to guess. Subsequent accounts are created the same way until a
user-management screen exists — no feature currently owns that screen (see
*Open questions*).

## Contract

**Server modules** (all under `src/server/`, the only layer allowed to touch Prisma):

| Module | Export | Shape |
|---|---|---|
| `auth/password.ts` | `hashPassword` | `(plain: string) => Promise<string>` |
| | `verifyPassword` | `(plain: string, hash: string) => Promise<boolean>` |
| `auth/user-service.ts` | `createUser` | `({ email, name, password, role }) => Promise<SessionUser>` |
| | `verifyCredentials` | `(email: string, password: string) => Promise<SessionUser \| null>` |
| `auth/session.ts` | `getCurrentUser` | `() => Promise<SessionUser \| null>` |
| | `requireUser` | `() => Promise<SessionUser>` — throws `UnauthorizedError` |
| | `requireRole` | `(role: Role) => Promise<SessionUser>` — throws `ForbiddenError` |
| `auth/role-shape.ts` | `shapeForRole` | `<S, A>(user: SessionUser, shapes: { forStaff: () => S; forAdmin: () => A }) => S \| A` |
| `auth/landing.ts` | `landingPathForRole` | `(role: Role) => "/stock-entry" \| "/stock-takes"` (pure) |
| `errors.ts` | typed domain errors | `NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`, **`UnauthorizedError`** |

`SessionUser = { id: string; email: string; name: string; role: Role }` — there is no
`passwordHash` on it, so no route can leak one by forwarding a service result.

`UnauthorizedError` extends the four types `docs/architecture.md` names. "Not signed in"
and "signed in but not allowed" map to different status codes (401 / 403) and different
user-facing behaviour, and a service that cannot distinguish them forces the route handler
to guess.

**Auth.js (NextAuth v5), credentials provider.** Session strategy is JWT so that
`src/middleware.ts` can redirect an unauthenticated request at the edge without a database
round trip. The token carries `sub` and `role`; it is a hint for routing only — every
server-side decision re-reads the `User` row through `getCurrentUser`, which returns
`null` when the row is missing or `active` is `false`. Session lifetime is **7 days**,
refreshed at most once every 24 hours.

**Routes**

| Route | Method | Access | Behaviour |
|---|---|---|---|
| `/` | GET | public | Unchanged from 002 (heading `Macroads Stock`), plus a sign-in link |
| `/sign-in` | GET / POST | public | Credentials form; server action; `?callbackUrl=`, `?reason=inactive` |
| `/api/auth/*` | — | public | Auth.js handlers |
| `/stock-entry` | GET | any signed-in user | **Placeholder.** `YARD_STAFF` landing |
| `/stock-takes` | GET | any signed-in user | **Placeholder.** `ADMIN` landing; money-free for both roles |
| `/analysis` | GET | `ADMIN` only | **Placeholder.** Demonstrates role refusal |
| `/api/session` | GET / POST | signed-in | `{ id, email, name, role, landingPath }`, else `401` |
| `/api/users` | GET | `ADMIN` only | `{ users: [{ id, email, name, role, active }] }`, else `403` / `401` |

The three page routes are **placeholders that later features replace**: `/stock-entry` by
#8 `stock_entry_ui`, `/stock-takes` by #10 `stock_takes_history`, `/analysis` by #11
`analysis`. Each renders its own name, the signed-in user's email and a sign-out control,
and nothing else. They exist so that landing-by-role and role refusal are observable
today; their content is not part of this contract.

**Scripts added:** `admin:create` (create an administrator), `test:db` (Level 2 service
tests), and `scripts/db-probe.mjs` (reachability probe used by both `init` scripts).

## UI states

`/sign-in`:

- **Empty:** blank email and password fields, submit enabled, no error region rendered.
- **Loading:** on submit the control shows a pending state and cannot be submitted twice.
- **Error:** `Invalid email or password.` above the form for any failed credential, and
  `Your account is no longer active. Contact an administrator.` when arriving with
  `?reason=inactive`. The form keeps the typed email and clears the password.
- **Success:** redirect to `callbackUrl` if present, otherwise to `landingPathForRole`.

Placeholder pages: **empty** and **loading** are not applicable — they render no
collection and fetch no data beyond the session; **error** is the shared boundary from
002; **success** is a `200` naming the page and the signed-in user.

## Acceptance criteria

1. **AC-1** — `prisma/schema.prisma` declares **exactly one** `model` — `User` — and **exactly one** `enum` — `Role { YARD_STAFF ADMIN }`. No `Location`, `Supplier`, `ItemType`, `Item`, `ItemPrice`, `ItemLocation`, `StockCount`, `StockCountLine`, `CountStatus` or `UnitKind` declaration appears anywhere in the file. `npx prisma validate` and `npx prisma generate` each exit `0` with no reachable database.
2. **AC-2** — `User` carries the fields named in `specs/domain-model.md` Part 3 — `id`, `email` (unique), `name`, `passwordHash`, `role` (`Role`, default `YARD_STAFF`), `active` (`Boolean`, default `true`), `createdAt`, `updatedAt` — and no others. A committed migration directory `prisma/migrations/<timestamp>_create_user/migration.sql` exists whose SQL creates the `Role` type, the `User` table and a unique index on `email`, and `prisma/migrations/migration_lock.toml` records provider `postgresql`. This is the repository's first migration.
3. **AC-3** — `src/server/auth/password.ts` exports `hashPassword(plain: string): Promise<string>` and `verifyPassword(plain: string, hash: string): Promise<boolean>`. Named unit tests running with **no database** assert: the hash is not equal to the plaintext and does not contain it; hashing the same input twice yields two different strings and `verifyPassword` returns `true` for both; `verifyPassword` returns `false` for a different plaintext against the same hash; and the hash matches `/^\$2[aby]\$(1[0-9]|[2-9][0-9])\$/`, i.e. a bcrypt hash at cost 10 or above.
4. **AC-4** — No plaintext password is ever written to a log or returned from a service. A test spies on `console.log`, `console.info`, `console.warn` and `console.error`, drives one successful and one failed credential check with a password generated at runtime, and asserts that the generated string appears in **no** captured output, while the failed check's captured output does contain the attempted email. The value returned by `verifyCredentials` has no key matching `/password/i` at any depth.
5. **AC-5** — Exactly one file in the repository imports the password-hashing library. A test enumerates tracked files under `src/`, `scripts/` and `prisma/` and asserts that the set importing it is exactly `["src/server/auth/password.ts"]` — the admin-creation script and the credentials provider both reach hashing through that module, so a second, weaker hasher cannot appear.
6. **AC-6** — `npm run admin:create`, given `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the environment and a reachable database, creates a `User` with `role = ADMIN` and `active = true`, exits `0`, and prints the email and the role but never the password nor the hash. Run a second time with the same email it exits non-zero with a message containing `already exists` and the email, and the existing row's `passwordHash` and `role` are unchanged.
7. **AC-7** — No default password exists anywhere in the repository. Run with `ADMIN_PASSWORD` unset or empty and stdin not a terminal, `npm run admin:create` exits non-zero with a message naming `ADMIN_PASSWORD`, and the `User` table gains no row. The documented invocation in `docs/` shows the literal placeholder `<choose-a-strong-password>`, not a value, and neither `.env.example` nor any other tracked file assigns a password.
8. **AC-8** — `createUser` validates at the edge of `src/server/` and creates nothing when input is invalid: an email that is not a valid address, a password shorter than 12 characters, or a blank name each raise `ValidationError` whose message names the offending field, and the row count is unchanged. A duplicate email raises `ConflictError` whose message contains the email. Emails are stored lower-cased: creating `Admin@example.com` and then signing in as `ADMIN@EXAMPLE.COM` succeeds, and a second `createUser` for `ADMIN@EXAMPLE.COM` raises `ConflictError`.
9. **AC-9** — Signing in at `/sign-in` with a correct email and password sets a session cookie and redirects to the role's landing route. `GET /api/session` for that session returns HTTP `200` and a body whose `role` equals the signed-in user's role and whose `email` equals the stored (lower-cased) email.
10. **AC-10** — A failed sign-in is indistinguishable and grants nothing. Each of (a) a correct email with the wrong password, (b) an email with no account, and (c) a correct email and password for a user whose `active` is `false` returns HTTP `200` on `/sign-in`, renders the message `Invalid email or password.` identically in all three cases, sets no session cookie, and issues no redirect to any landing route. A subsequent `GET /api/session` returns `401`.
11. **AC-11** — Deactivation takes effect on the next request, without waiting for the token to expire. Given a signed-in `YARD_STAFF` session, setting that user's `active` to `false` in the database causes the next `GET /stock-entry` to redirect to `/sign-in?reason=inactive`, where the page renders `Your account is no longer active. Contact an administrator.`, and causes `GET /api/session` to return `401`. The test does not touch the session cookie — the check is made server-side against the stored row.
12. **AC-12** — An unauthenticated `GET` of `/stock-entry`, `/stock-takes` or `/analysis` responds `307` (or `302`) to `/sign-in?callbackUrl=<the URL-encoded path>` and sends none of the protected page's content. Signing in from that page then lands on the requested path rather than on the role's default landing. `/` and `/sign-in` still return `200` unauthenticated, and `/` still contains the level-1 heading `Macroads Stock` required by spec 002 AC-12.
13. **AC-13** — An absent or expired session is refused. `GET /api/session` with no session cookie returns `401` with body `{"error":"Unauthorized"}` and no user fields. A request carrying a session token minted with the same `AUTH_SECRET` but an `exp` in the past is treated as unauthenticated: `/stock-entry` redirects to `/sign-in` and `/api/session` returns `401`.
14. **AC-14** — Landing is decided by role. `landingPathForRole` is a pure exported function, unit-tested with no database, returning `/stock-entry` for `YARD_STAFF` and `/stock-takes` for `ADMIN`. End to end, signing in with no `callbackUrl` lands a `YARD_STAFF` user on `/stock-entry` and an `ADMIN` on `/stock-takes`, matching `specs/domain-model.md` Part 6.
15. **AC-15** — Both roles reach `/stock-takes` with HTTP `200` — Part 6 makes it money-free and common to both — while an `ADMIN`-only route refuses `YARD_STAFF`: `GET /analysis` as `YARD_STAFF` redirects to `/stock-entry?denied=analysis`, where the page renders `You do not have access to that page.`, and `GET /api/users` as `YARD_STAFF` returns `403` with body `{"error":"Forbidden"}` and no `users` key. The same two requests as `ADMIN` return `200`.
16. **AC-16** — `requireRole` fails closed as a service, not as a screen. Called with a session whose role does not match, it raises `ForbiddenError` naming the required role; called with no session it raises `UnauthorizedError`; called with a matching session it returns the user. All three paths have named tests, and both `/api/users` and the page at `/analysis` go through it, so deleting the middleware entry alone does not expose either.
17. **AC-17** — `shapeForRole(user, { forStaff, forAdmin })` selects the response shape from `user.role` alone and builds only the selected one. Unit tests with spy thunks assert that for a `YARD_STAFF` user the result is the staff shape and `forAdmin` was called zero times, and for an `ADMIN` user the result is the admin shape and `forStaff` was called zero times. This is the mechanism later features use for `CountForStaff` / `CountForAdmin`; it takes no argument derived from a request.
18. **AC-18** — Role cannot be influenced by anything the client sets. Signed in as `YARD_STAFF`, a request to `/api/session` carrying the query string `?role=ADMIN`, the header `x-user-role: ADMIN` and the cookie `role=ADMIN` simultaneously returns `"role":"YARD_STAFF"`; the identical request to `/api/users` returns `403`. Repeating all three vectors on a `POST` to `/api/session` with the form body `role=ADMIN` changes nothing. The test asserts the response, not the source code.
19. **AC-19** — A reusable money-boundary assertion ships with this feature: a helper exporting `deepKeys(value: unknown): string[]` and an assertion that fails when any key matches `/price|value|total|amount/i`. It has both a positive and a negative test — the fixture `{ line: { unitPriceSnapshot: 1, totals: { lineValue: 2 } } }` makes the assertion fail, and a fixture without money keys makes it pass — and it is applied to every JSON body a `YARD_STAFF` session can obtain in this feature (`/api/session` at `200`, `/api/users` at `403`), all of which pass.
20. **AC-20** — No response body from any route introduced here contains a password or a hash, for either role: the deep-key scan of `/api/session` and of `/api/users` (as `ADMIN`, listing at least two accounts) finds no key matching `/password/i`, and the raw response text does not contain any stored `passwordHash` value.
21. **AC-21** — Signing out ends the session: after the sign-out control is used, the session cookie is cleared or expired, `GET /stock-entry` redirects to `/sign-in`, and `GET /api/session` returns `401`.
22. **AC-22** — Fail closed with no secret: with `AUTH_SECRET` unset, `GET /api/users` carrying any cookie value never returns `200` and its body contains no `users` key. A missing secret degrades to refusal, never to access.
23. **AC-23** — **Which checks survive with no database.** Given a `.env` whose `DATABASE_URL`, `DIRECT_URL` and `TEST_DATABASE_URL` all point at a hostname that does not resolve, each of `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` still exits `0`. No module under `src/` opens a database connection at import time, and no protected page is statically prerendered against a database during `build`.
24. **AC-24** — **Which checks require one, and what `init` does without it: it skips, visibly — it does not fail.** With no reachable database both `init.ps1` and `init.sh` exit `0`, print a line beginning `[skip] database unreachable at <host>` (or `[skip] TEST_DATABASE_URL is not set`) and ending `database-dependent checks skipped`, do not invoke `npm run test:db`, print no `[FAIL]` line, and end with a final line beginning `[OK] Environment ready` that names the skip: `[OK] Environment ready (database checks skipped)`. Both scripts reach that verdict through the same `node scripts/db-probe.mjs`, which opens a real session and exits `0` when the database answers within 10 seconds on either of **two attempts, 2 seconds apart** (about 22 seconds at worst), and `1` otherwise, and whose output names the host only — run against a URL carrying credentials it prints neither the user info nor the password.
25. **AC-25** — With a reachable `TEST_DATABASE_URL`, the same two scripts run the database step for real: they apply migrations, print `[ok] npm run test:db`, print no `[skip]` line about the database, and end with exactly `[OK] Environment ready`. Making one service test fail makes both scripts exit `1` and list that failure. A schema change with no matching migration is caught here: `prisma migrate status` reporting a pending migration or drift makes both scripts exit `1`.
26. **AC-26** — The two suites are disjoint and named by convention. `npm run test:unit` executes zero files matching `**/*.db.test.ts`; `npm run test:db` executes only those files, and at least three of them exist under `src/server/auth/`. `npm run test:db` refuses to run against the development database: when `TEST_DATABASE_URL` is absent it exits non-zero naming `TEST_DATABASE_URL`, and when it equals `DATABASE_URL` it exits non-zero with a message containing `TEST_DATABASE_URL must not equal DATABASE_URL` — in both cases before executing a single test.
27. **AC-27** — Service tests use a real Postgres, per `docs/verification.md` Level 2. No file under `src/` or `tests/` mocks `@prisma/client` or `PrismaClient`; each test seeds the users it needs after `resetTestDb()`; and `npm run test:db` passes twice in a row without manual cleanup between runs, and passes with the file order reversed.
28. **AC-28** — `npm run test:e2e` exits `0` whether or not a database is reachable. With none, every spec that needs one reports as **skipped** with an annotation containing `database unreachable`, and the unauthenticated-redirect spec still runs and passes, because route protection needs no database. With one reachable, no spec is skipped and the sign-in, landing-by-role and role-refusal specs all run.
29. **AC-29** — `docs/verification.md` Level 0 lists the database step and `npm run test:db` in its enumeration of what `init` runs, and states the skip behaviour — the file's own rule is that a step added to the scripts is added there in the same change.
30. **AC-30** — Repository hygiene stays green. `.env.example` documents `TEST_DATABASE_URL` and `TEST_DIRECT_URL` alongside the existing four variables, with placeholder values whose user info is `USER:PASSWORD` and whose host ends in `.invalid`; every connection-string fixture in a test or script is assembled from concatenated halves rather than written whole, as `tests/unit/repo-hygiene.test.ts` already does for itself; test passwords are generated at runtime rather than committed as literals; and `npm run test:unit` — which contains the credential scan — passes.
    *Amended by the owner's decision of 2026-09-25 (021 → *Post-approval amendments* → *`.env` is the only settings file*):* `.env.example` no longer exists. `docs/operations.md` → *Environment* documents `TEST_DATABASE_URL` and `TEST_DIRECT_URL`: what the test database is for, and that `npm run test:db` empties it. `tests/unit/env-file.test.ts` asserts that `.env` defines both, with `TEST_DIRECT_URL` unpooled and on a different host from `DIRECT_URL`. The rest of AC-30 is unchanged.
31. **AC-31** — The dependency rule holds. `npm run lint` exits `0`; no file under `src/app/` or `src/components/` imports `PrismaClient`; every database access added by this feature lives under `src/server/auth/`; and `src/middleware.ts` imports nothing from `@prisma/client`, so the edge runtime never needs it.
32. **AC-32** — `/sign-in` is usable on a phone. At a 390 px viewport the page's `document.documentElement.scrollWidth` does not exceed its `clientWidth`, and the email input, the password input and the submit control are all visible and clickable without horizontal scrolling.

## Out of scope

- **Every stock-domain model.** No `Location`, `Supplier`, `ItemType`, `Item`,
  `ItemPrice`, `ItemLocation`, `StockCount`, `StockCountLine`, `CountStatus` or
  `UnitKind` — not one field, not one migration. That is #4 `domain_schema`. This feature
  adds `User` and `Role` and stops.
- **Any real screen.** `/stock-entry`, `/stock-takes` and `/analysis` are placeholders
  with no data, no forms and no styling beyond legibility. #8, #10 and #11 replace them.
- **The money itself.** No price, value or total exists yet. This feature ships the
  mechanism (`shapeForRole`, the deep-key assertion) and proves it on money-free payloads;
  the first real `…ForStaff` / `…ForAdmin` pair arrives with #8.
- **User-management UI.** No screen to invite, list, edit, deactivate or delete users.
  Accounts are created with `admin:create` and edited in the database until a feature owns
  it.
- **Password reset, "forgot password", email delivery, password change.** A locked-out
  user is helped by an admin re-running `admin:create` semantics against their row.
- **Self-registration.** There is no public sign-up. Accounts are created by an operator.
- **OAuth, magic links, two-factor, "remember me", device management, session listing.**
- **Rate limiting, lockout after N failed attempts, CAPTCHA, audit log of sign-ins.**
  Worth doing; not here. The count-reopen audit trail belongs to #9.
- **Per-location permissions.** A `YARD_STAFF` user may count at any yard. There is no
  third role and no yard-scoped user — `specs/domain-model.md` Part 6 is two roles, full
  stop.
- **Deployment, the Neon `main` branch and production secrets.** That is #16 `deploy`.
- **CI.** `init` remains the gate.

## Open questions

None blocking. Three items the user may wish to settle, each of which is a constant this
spec fixes with a stated default rather than leaving undefined:

1. **Session lifetime** is set to 7 days, refreshed at most daily. Shorter is safer;
   longer is kinder to a phone in a cold yard. Changing it changes one constant.
2. **Minimum password length** is set to 12 characters, with no composition rules.
3. **Who owns user management.** Part 6 gives `ADMIN` "user management", but no feature in
   `feature_list.json` delivers that screen. Until one does, accounts come from
   `admin:create`. This does not block #3.

An operational precondition, not a question: the Neon `dev` branch and a separate test
branch for `TEST_DATABASE_URL` must exist before the database-dependent criteria (AC-6,
AC-7, AC-8, AC-9 to AC-22 in their end-to-end form, AC-24 to AC-27) can be *run*. AC-23
exists precisely so that state is legible instead of assumed away: until then `init` is
green and says, on every run, exactly which checks it did not perform.

`Q7` and `Q8` in `specs/domain-model.md § Still open` block only M7 and are unrelated to
this feature.

## Post-approval amendments

### AC-24: the probe's bound, 2026-09-24

The database probe was rewritten on 2026-09-17 to open a real session against the endpoint the
next step uses, instead of a bare TCP socket against the pooler. The old probe had reported two
endpoints "reachable" that were rejecting authentication. On 2026-09-24 it gained **one retry**,
2 seconds after a first miss. That same day, a single slow Neon moment right after the e2e suite
had made a gate skip every database check. A run that skips them cannot close a feature (C2.1), so
the miss wasted the gate rather than hiding anything. The per-attempt bound is unchanged at
10 seconds; an unreachable database is now reported after about 22 seconds. Proven both ways in
`tests/unit/db-connection-guard.test.ts`.
