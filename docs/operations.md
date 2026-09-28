# Operations — running this application against a real database

Everything here is a command an operator types. Nothing here requires reading `.env`.

---

## Environment

Every setting lives in one file, `.env`, at the root of the repository, one `NAME=value` per
line. git ignores it, so it is never committed. There is no template to copy: this section is
the list of settings, what each is for, and how to make each one. **The names here match
`.env`. The values never go anywhere but `.env`**: not into a document, a commit, a chat, a
log or an issue. Every value shown below is a placeholder.

On a new computer, create `.env` with these eight. They are also the checklist for the
production host (#16):

| Setting | Read by | What it is for |
|---|---|---|
| `DATABASE_URL` | the app | the **pooled** connection to the development database |
| `DIRECT_URL` | `prisma migrate` | the **unpooled** connection to the same database |
| `AUTH_SECRET` | the app | signs every session and every known-device token |
| `AUTH_URL` | the app | the address the app is served at |
| `TEST_DATABASE_URL` | `npm run test:db` | the pooled connection to a separate test database |
| `TEST_DIRECT_URL` | `npm run test:db` | the unpooled connection to that test database |
| `PIN_PEPPER` | the app, `npm run pin:reset` | the key every PIN is stored under |
| `SETUP_CODE` | `/setup` | the code that creates the first administrator |

`npm run test:unit` checks the file (`tests/unit/env-file.test.ts`): all eight are set, the
pooled and unpooled strings are the right way round, the test database has its own host,
`SETUP_CODE` is long enough, `PIN_PEPPER` is usable, and there is no `NEW_PIN`. It names each
setting that is wrong and never prints a value. `NEW_PIN` and `NEW_USERNAME` never go in
`.env`: they are typed on the command line of `npm run pin:reset` only (spec 021 AC-8).

### `DATABASE_URL` and `DIRECT_URL`: pooled and unpooled

Neon gives every database two connection strings. The **pooled** one goes through Neon's
connection pooler, and its host contains `-pooler`. The **unpooled** one is the same host
without `-pooler`, and connects straight to the database.

- `DATABASE_URL` is the pooled string. The app uses it at runtime.
- `DIRECT_URL` is the unpooled string. Prisma migrations use `DIRECT_URL`, because they fail through a pooler.

To make them: in the Neon console, open the project, pick the development branch and press
*Connect*. With *Connection pooling* on, the string shown is the pooled one; turn it off for
the unpooled one. Their shape, with placeholders for the user, the password and the host:

```
DATABASE_URL=postgresql://USER:PASSWORD@ep-example-123456-pooler.eu-west-2.aws.neon.invalid/neondb?sslmode=require
DIRECT_URL=postgresql://USER:PASSWORD@ep-example-123456.eu-west-2.aws.neon.invalid/neondb?sslmode=require
```

### `TEST_DATABASE_URL` and `TEST_DIRECT_URL`: the test database

`npm run test:db` empties the test database: it deletes every row between tests. So the tests
run against a database of their own, a separate Neon branch, and never the development one.
The run refuses to start when `TEST_DATABASE_URL` is unset or equal to `DATABASE_URL`.

- `TEST_DATABASE_URL` is the test branch's pooled string.
- `TEST_DIRECT_URL` is its unpooled string, on a different host from `DIRECT_URL`. The test
  run applies the migrations and runs the tests through it.

To make them: create a branch in the Neon console, for example `test`, and copy its two
strings as above. Nothing on it needs keeping.

### `AUTH_SECRET`

Signs every session and every known-device token (spec 021 S7). Make it with this command,
which prints 32 random bytes in base64, and paste the output into `.env` and nowhere else:

`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`

```
AUTH_SECRET=REPLACE_WITH_A_GENERATED_SECRET
```

Each environment makes its own. Back it up outside the server. Changing it signs everyone out
and makes every device a new device again.

### `AUTH_URL`

The address the app is served at, as the browser reaches it: `http://localhost:3000` on a
developer's computer, and the production address on the production host. It is not a secret.

### `PIN_PEPPER`

The key every PIN is stored under (spec 021 S3). Each environment has its own: the
development database, the production database and every developer generate their own. Make it
with the same command as `AUTH_SECRET`:

`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`

```
PIN_PEPPER=REPLACE_WITH_A_GENERATED_SECRET
```

The app refuses a pepper that is not base64 of at least 32 bytes; the command's output always
passes. Back it up outside the server, as you back up `AUTH_SECRET`. Changing or losing it
invalidates every PIN: see *Recovery from a lost `PIN_PEPPER`* below.

### `SETUP_CODE`

The code `/setup` asks for when it creates the first administrator (see *First-run setup*
below). It must be at least 16 characters. Make it with the same command as `AUTH_SECRET`:

`node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`

```
SETUP_CODE=REPLACE_WITH_A_GENERATED_SECRET
```

It is used only until the first ADMIN exists. After that `/setup` never comes back,
`SETUP_CODE` is no longer read, and removing it is tidy but not required.

## Profiles, usernames and PINs

People sign in with a username and a PIN (spec 021). There is no seeded profile and no
default PIN, because a credential in git is a published credential. `PIN_PEPPER` is
required in every environment, and each environment generates its own.

### First-run setup

A fresh database has no profile at all. The first administrator is created once, in the
browser, at `/setup`:

1. Choose a setup code of at least 16 characters, generated the same way as `AUTH_SECRET`,
   and set it in the server's environment next to `PIN_PEPPER`:
   `SETUP_CODE=<choose-a-setup-code>`. That is a placeholder: a real code is never written
   in a file that is committed.
2. Open `/setup`. It asks for the setup code, your name, a username and a PIN typed twice,
   and creates an `ACTIVE` administrator.
3. Sign in at `/sign-in` with that username and PIN. Setup does not sign you in.

- `/setup` exists only while no profile holds the `ADMIN` role, in any status, and only
  while `SETUP_CODE` is set to at least 16 characters and `PIN_PEPPER` is usable. At any
  other time it answers "page not found". Nothing links to it.
- Once an administrator exists, `/setup` never comes back, even if that administrator is
  later deactivated. `SETUP_CODE` is then no longer read; removing it is tidy but not
  required.
- Ten wrong setup codes within 24 hours pause setup for everyone, until the oldest of them
  is a day old. A setup code is never shown back and never logged.
- A database migrated from #3 already holds `ADMIN` rows, so `/setup` is never available
  there. Use the one-time step below instead.

### The reset script

`npm run pin:reset` repairs an existing profile. It never creates one, and it takes
exactly two forms:

```
npm run pin:reset -- --list
NEW_PIN=<choose-a-pin> npm run pin:reset -- --profile <id>
```

- `--list` prints one line per profile: its id, its username (or `-`), its name, role and
  status, its PIN state (`set`, `none`, or `reset needed` for a PIN made under another
  `PIN_PEPPER`), and its lock state.
- `--profile <id>` gives an `ACTIVE` profile the PIN in `NEW_PIN`, made under the current
  `PIN_PEPPER`. It ends any lock on the profile's username, ends every session the profile
  had, and prints the profile's id, username, name and role.
- `<choose-a-pin>` is a placeholder. Substitute exactly 4 or 6 digits, not one digit
  repeated and not digits counting up or down in order.
- It never prints the PIN, a hash, a key id or an account key. With `NEW_PIN` unset or
  empty it refuses and exits non-zero. It does not prompt, and there is no fallback value.
- It refuses, exits non-zero and changes nothing for a profile that is not `ACTIVE`, for an
  unknown id, when `PIN_PEPPER` is not set, and for any other argument.

### One time, on a database migrated from #3

The migration keeps every account #3 created. Each becomes an `ACTIVE` profile with no
username and no PIN, or `DEACTIVATED` if it had been switched off. Nobody can sign in
until the operator gives an `ADMIN` profile a username and a PIN:

```
npm run pin:reset -- --list
NEW_USERNAME=<choose-a-username> NEW_PIN=<choose-a-pin> npm run pin:reset -- --profile <id>
```

- Take `<id>` from the `--list` line of an `ADMIN` whose username is `-`.
- `<choose-a-username>` is a placeholder: 3 to 32 characters, a letter a-z first, then
  letters a-z, digits, `.`, `_` or `-`. It is stored in lower case and must not already
  be taken.
- Give `NEW_USERNAME` only to a profile with no username. For a profile that already has
  one, the script refuses it: give only `NEW_PIN`.

That administrator then signs in and manages everyone else.

### Lockout recovery

Five wrong PINs in a row lock that username for 15 minutes. Each further lock doubles, up
to 24 hours, so a person locked out can always sign in again later without anyone's help.
A lock refuses new sign-ins only: sessions already open carry on.

To end a lock at once, give the profile a new PIN:

```
NEW_PIN=<choose-a-pin> npm run pin:reset -- --profile <id>
```

The reset ends the lock and zeroes the failure count. It keeps the lock level, so a reset
in the middle of an attack gives an attacker five more guesses, not a fresh start. The
person's next successful sign-in zeroes the level.

### Recovery from a lost `PIN_PEPPER`

A lost pepper cannot be recovered. Every PIN was made under it, so every PIN must be
replaced:

1. Set a **new** `PIN_PEPPER` in the environment, generated the same way as
   `AUTH_SECRET`, and back it up outside the server as you back up `AUTH_SECRET`.
2. From then on every sign-in answers "incorrect", nobody is locked by it, and
   `--list` shows every PIN as `reset needed`. Every lock is forgotten, because each was
   kept under the old pepper. Open sessions and known devices are unaffected: they are
   signed with `AUTH_SECRET`.
3. An `ADMIN` who still has a session open resets every profile's PIN from the admin
   section and gives each person their new PIN. If no `ADMIN` has a session open, run
   `NEW_PIN=<choose-a-pin> npm run pin:reset -- --profile <id>` for one `ADMIN`; that
   administrator signs in and resets everyone else. Until the admin section is added with
   `/profiles`, the reset script is the way to reset every profile.
4. Profile requests made under the old pepper carry PINs that can never match. An `ADMIN`
   approves and then resets them, or rejects them and asks for a new request.

Nothing else is lost: counts, prices, profiles, roles and usernames live in the database.
A leaked pepper is handled the same way: replace it, then reset everyone.

## Databases

Four connection strings, in two pairs. *Environment* above says how to make each, and why
each database has a pooled and an unpooled one.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | the pooled connection the application uses at runtime |
| `DIRECT_URL` | the unpooled connection `prisma migrate` uses |
| `TEST_DATABASE_URL` | a **separate** database or Neon branch, used only by `npm run test:db` |
| `TEST_DIRECT_URL` | the unpooled connection to that same test database |

`npm run test:db` **deletes every row between tests**. It refuses to start when
`TEST_DATABASE_URL` is unset, and when it is equal to `DATABASE_URL` — before it loads a
single test file. Point it at a throwaway branch and nothing else.

### Applying migrations

```
npx prisma migrate deploy        # apply the committed migrations to DATABASE_URL
```

`npm run test:db` applies them to the test database itself, so the test branch never
needs migrating by hand.

## What `init` does about the database

`init` probes `DATABASE_URL` and then the endpoint `npm run test:db` will use —
`TEST_DIRECT_URL`, falling back to `TEST_DATABASE_URL` — with
`node scripts/db-probe.mjs`, which opens a session and runs `SELECT 1`: no application
table, no credentials in its output, a ten second timeout per attempt, and one retry two
seconds after a failed first attempt (about 22 s at most for a host that never answers;
`docs/verification.md` says why). A socket that merely opens proves nothing; a suspended
compute and a stale password both accept one.

- **Reachable:** `prisma migrate status` and `npm run test:db` run for real, and the run
  ends with `[OK] Environment ready`.
- **Not reachable:** both scripts print a line beginning `[skip] database unreachable at`
  and ending `database-dependent checks skipped`, run neither, and end with
  `[OK] Environment ready (database checks skipped)`.

A feature may **not** be closed on a skipped run — `CHECKPOINTS.md` C2.1. The skip keeps
the gate usable on a machine with no database; it does not lower the bar for finishing
work.

## Production

The live application is `https://stock-management-zeta-one.vercel.app`, on Vercel, and its
database is the Neon branch `production`. Spec 016 is the contract; this section is how to
run it. **Every value below is a placeholder.** A real secret, connection string, PIN or setup
code is never written here, and never goes into a chat, a file in the repository or a log.

### The owner's decisions (2026-09-28)

| # | Decision | Risk the owner accepted |
|---|---|---|
| OD1 | Stay on **Vercel Hobby**. | Hobby's terms exclude commercial use. If they are enforced, the project moves to a paid plan; the release flow here moves with it unchanged. Hobby may lack a feature this runbook uses; each one is a dashboard fact below. |
| OD2 | Stay on **Neon Free**, and keep a **monthly copy outside Neon** (the export below). | Neon keeps only 6 hours of history. Damage noticed later is undone only back to the last copy, and everything written since is typed again. Whether usage on `dev` and `test` can suspend `production` is not yet known (F6). |
| OD3 | The address is **`stock-management-zeta-one.vercel.app`**, and `AUTH_URL` is `https://stock-management-zeta-one.vercel.app`. | There is no custom domain. Changing the address later signs everyone out and makes every device a new device. |

### Who does what

| Who | Has | Does | Never |
|---|---|---|---|
| **Owner** | The Vercel project, the Neon project, a password manager, the Google Drive that keeps the copies, a browser, their own terminal | Reads the dashboard facts below. Generates and stores every secret, and enters every setting. Completes `/setup` and approves profiles. Signs in for the signed-in pass. Runs every `npm run operator:production` command. Makes and keeps the monthly copy. Does the drills. Relays the build log's `[vercel-build]`, `[seed]` and `[db:census]` lines. | Pastes a secret into a chat, a file in the repository or a command line |
| **Coordinator** | The repository, `git`, `gh`, `node` and `npm`, `curl`, Playwright's Chromium | Runs the gate. Pushes `main`. Fast-forwards `production` after the owner's sign-off. Runs both passes of `npm run verify:deploy`. Records the evidence. | Holds a Vercel or Neon token, reads `.env`, or sees a production secret or a copy |
| **Vercel's production build** | The Production environment's settings | `check-settings`, `next-build`, `migrate-deploy`, `seed-if-empty`, `census` | Runs for any branch but `production` |

**No secret value ever goes into a chat, a file in the repository or a log.** Only names are
exchanged: of settings, of steps, of checks.

### Releasing

The git branch `production` is what Vercel releases. **Pushing `main` deploys nothing.** `main`
keeps committed work; `vercel.json` turns deployments off for every branch but `production`.

A release, once a feature is signed off (the owner's sign-off authorises its release, and the
owner can hold any release by saying so):

1. The feature's commits are on `main` and pushed, and `init` ran with the database checks
   executed.
2. **If the release carries a migration, the owner first exports a copy** (see *Backup and
   restore*). A migration must keep the previous release working; a destructive step carries a
   `-- contract-step:` line (`docs/conventions.md` → *Database*).
3. The coordinator fast-forwards `production`: `git push origin main:production`. A
   non-fast-forward is refused. Nobody ever force-pushes `production`.
4. The build runs. After the first day, the seed reports `SKIPPED`.
5. The coordinator runs the anonymous pass with `--expect-commit <the commit at origin/production>`.
6. When the release changes anything a staff session is sent, the signed-in pass runs too.

### Settings

Each setting lives in one Vercel environment. Nothing that was on Vercel before go-live is
kept: every production value is made new.

| Setting | Vercel Production | Vercel Preview | Vercel Development | A developer's `.env` |
|---|---|---|---|---|
| `DATABASE_URL` | Neon `production`, **pooled**, with `connect_timeout` | — | — | `dev`, pooled |
| `DIRECT_URL` | Neon `production`, **unpooled**, with `connect_timeout` | — | — | `dev`, unpooled |
| `AUTH_SECRET` | **new**, generated by the owner | — | — | its own |
| `AUTH_URL` | `https://stock-management-zeta-one.vercel.app` | — | — | `http://localhost:3000` |
| `PIN_PEPPER` | **new**, generated by the owner | — | — | its own |
| `SETUP_CODE` | **new**; deleted once the first `ADMIN` exists | — | — | its own |
| `TEST_DATABASE_URL` | **never** | never | never | `test`, pooled |
| `TEST_DIRECT_URL` | **never** | never | never | `test`, unpooled |

- The owner generates `AUTH_SECRET`, `PIN_PEPPER` and `SETUP_CODE` in their own terminal with
  the command *Environment* above gives for `AUTH_SECRET`. Each value goes into the password
  manager first, then into Vercel, marked *Sensitive* where Vercel offers it.
- The owner copies the two connection strings from Neon's *Connect* dialog for the `production`
  branch straight into the password manager and into Vercel, adding the `connect_timeout`
  parameter to each: 15 seconds, unless V6 shows that a function may not run longer than 20
  seconds on Hobby, in which case 5 seconds below that maximum (spec 016 D18).
- The build also reads Vercel's own `VERCEL`, `VERCEL_ENV` and `VERCEL_GIT_COMMIT_SHA`.
- Functions run in `lhr1` (London), beside Neon's London compute.

### Go-live

| Step | Who | What |
|---|---|---|
| 1 | Owner | In Vercel, change the production branch from `main` to `production`. Nothing is released yet. |
| 2 | Owner, coordinator | Screenshot the variables' **names** in each environment, never their values. The coordinator records the names. |
| 3 | Owner | Delete every variable in Production, Preview and Development, and take the current deployment off them, recording how. |
| 4 | Coordinator | Resume pushing `main`. |
| 5 | Coordinator | Phase A gated with the database checks executed; after sign-off, commit and push `main`. |
| 6 | Coordinator, owner | The audit, then the owner's go or no-go. |
| 7 | Owner | In Neon, confirm F4, F6 and F8, including that `production` holds no table. Copy both strings, with `connect_timeout`, into the password manager. |
| 8 | Owner | Generate `AUTH_SECRET`, `PIN_PEPPER` and `SETUP_CODE`, each straight into the password manager. |
| 9 | Owner | Enter the six Production settings. Preview and Development stay empty. Confirm V4 and V7. |
| 10 | Coordinator | `git push origin <the step-5 commit>:refs/heads/production` |
| 11 | Vercel's build | `check-settings`, `next-build`, `migrate-deploy` (three migrations), `seed-if-empty` (`SEEDED`), `census`; then released. |
| 12 | Owner | Relay the `[vercel-build]`, `[seed]` and `[db:census]` lines. **If the first seed says `SKIPPED`, stop:** the settings point at a database that already holds an item master, so they are not the empty `production` branch. |
| 13 | Owner | Open `https://stock-management-zeta-one.vercel.app/setup` straight away, create the first `ADMIN`, then sign in. |
| 14 | Coordinator | The anonymous pass, while `SETUP_CODE` is still set. |
| 15 | Owner | Delete `SETUP_CODE` from Vercel. It takes effect at the next deployment. |
| 16 | Owner | In `/profiles`, create the one verification `YARD_STAFF` profile, and keep it active. |
| 17 | Owner | Check the pepper backup: `npm run operator:production -- db:census`, answering `PIN_PEPPER` from the password manager, prints `pins: n of n made under the given PIN_PEPPER`. |
| 18 | Owner | Make the first copy and drill its restore (see *Backup and restore*). |
| 19 | Coordinator, owner | The signed-in pass, once a count exists. |
| 20 | Owner | The history drill, the rollback drill, and the first sign-in after an hour with no traffic. |
| 21 | Coordinator | Record the confirmed facts and the drill results here, and release them. |

### The live check: `npm run verify:deploy`

It holds no secret: it reads no `.env`, takes no credential, and prints check names, cookie
names and flags, never a cookie value or any part of a page. The gate never runs it.

The **anonymous pass** needs nobody:

```
npm run verify:deploy -- --url https://stock-management-zeta-one.vercel.app
npm run verify:deploy -- --url https://stock-management-zeta-one.vercel.app --expect-commit <the commit at origin/production>
```

It prints `[verify] PASS <check>` or `[verify] FAIL <check>: <path and rule>` for `https-only`,
`hsts`, `security-headers`, `csrf-cookie-secure`, `session-401`, `api-401`,
`protected-redirects`, `setup-404`, `public-no-money`, `no-leftovers`, `region` (the function
ran in `lhr1`) and, with `--expect-commit`, `commit`. It exits 0 only when every check passed.
`--url` must be `https:`, except for `localhost` and `127.0.0.1`.

The **signed-in pass** needs the owner at the keyboard:

```
npm run verify:deploy -- --url https://stock-management-zeta-one.vercel.app --signed-in
```

A Chromium window opens at the sign-in page, and the command prints `Sign in as a YARD_STAFF
profile in the window that opened`. The owner signs in there as the verification `YARD_STAFF`
profile, typing the PIN into the page only; the command never types into, reads or records a
field. It waits up to five minutes for the sign-in, then checks `staff-role`,
`device-cookie-secure`, `session-cookie-secure`, `staff-no-money` (it opens the staff pages and
the count pages linked from them, and scans every response for money) and `signed-out`, and
closes the window. `--expect-commit` belongs to the anonymous pass and is refused with
`--signed-in`.

### Operator commands: `npm run operator:production`

Every command against a live database goes through this launcher. It asks for the settings at a
prompt and never reads them from a file; on a terminal, nothing typed is shown. It refuses an
empty answer, and an answer equal to what `.env` holds for the same name, so a development value
cannot reach production. Anything but these eight forms is refused before anything is asked:

```
npm run operator:production -- db:census
npm run operator:production -- db:export --out <file>
npm run operator:production -- db:restore --in <file>
npm run operator:production -- pin:reset --list
npm run operator:production -- pin:reset --profile <id>
npm run operator:production -- migrate:status
npm run operator:production -- migrate:resolve --rolled-back <migration>
npm run operator:production -- migrate:resolve --applied <migration>
```

- Every form asks for `DATABASE_URL` and `DIRECT_URL`, from the password manager.
- `db:census` and both `pin:reset` forms also ask for `PIN_PEPPER`.
- `pin:reset --profile <id>` also asks for `NEW_PIN`, the PIN you chose for that profile.
- Never put a production string in `.env`, on a command line or in a shell variable: the next
  `npm run test:e2e` would write its fixtures into whatever `.env` names.

### Facts confirmed on the dashboards

Each fact is read by the owner on the dashboard, never assumed. *Confirmed on* holds the date
it was read, or, for a fact still to confirm, by when.

| # | Fact | Value, as read | Confirmed on |
|---|---|---|---|
| F1 | Neon's plan | Free | 2026-09-28 |
| F2 | The history (restore) window | 6 hours | 2026-09-28 |
| F3 | A branch can be created from `production` as of a past time within F2 | to confirm | before the history drill |
| F4 | `production` can be restored in place to a past time, and whether a copy of the state before is kept | to confirm | before go-live |
| F5 | The branch limit (in use: `production`, `dev`, `test`) | to confirm | before the copy drill |
| F6 | The compute allowance, whether branches share it, and whether usage on `dev` and `test` can suspend `production` | usage since 1 September: 5.37 CU-hours, 34.19 MB storage, 340.58 MB network; the rest to confirm | 2026-09-28 for the usage; the rest before go-live |
| F7 | `production`'s compute size and autosuspend delay | 0.25 to 2 CU; the delay to confirm | 2026-09-28 for the size |
| F8 | Region, Postgres version, default branch, storage limit, and whether `production` holds any table | AWS Europe West 2 (London), Postgres 18, `production` is the default branch; the storage limit and the table check to confirm | 2026-09-28 for the first three; the rest before go-live |
| F9 | A new, empty database can be created inside a branch | to confirm | before the copy drill |
| V1 | Vercel's plan | Hobby, team "MacRoads" (OD1) | 2026-09-28 |
| V2 | The production branch can be changed to `production` | the setting exists at *Environments → Production → Branch Tracking*; that it accepts `production` is confirmed at go-live step 1 | 2026-09-28 for the setting |
| V3 | What Instant Rollback on Hobby can target, and whether it stops promoting new pushes until undone | to confirm | before the rollback drill |
| V4 | System variables reach builds and functions, and settings can be marked *Sensitive* on Hobby | to confirm | before go-live |
| V5 | Functions can be placed in `lhr1` | confirmed: Hobby allows one region, and `lhr1` is set | 2026-09-28 |
| V6 | A function's maximum duration on Hobby | to read; it fixes `connect_timeout` | at go-live |
| V7 | Which repositories Vercel's GitHub app can reach | to confirm | at go-live |
| V8 | The existing project's variables, by name, in each environment | the owner's screenshot | at go-live step 2 |

## Backup and restore

Two layers. Neon's history covers a mistake noticed within hours; **the copy outside Neon is the
main protection.**

### Layer 1: Neon's 6-hour history (F2 to F4)

For a mistake noticed within 6 hours:

1. In Neon, create a branch from `production` as of a time before the mistake (F3).
2. Run `npm run operator:production -- db:census` against the branch, and compare it with
   production's.
3. Restore `production` in place (F4), or put the branch's two strings into Vercel's Production
   settings and redeploy.

Everything written after that time is lost.

### Layer 2: the copy

- **When:** after each month's counts are approved, and **before every release that carries a
  migration**.
- **How:** `npm run operator:production -- db:export --out <a new file outside the repository>`,
  against production. It refuses a path inside the repository and a file that already exists.
  It prints the file's path, its SHA-256 and one line per table with its count.
- **What it holds:** every table, read at one moment, with every `pinHash` and `pinKeyId`
  written as null, and pending profile requests left out and counted. It holds prices, names,
  usernames and counts: it is business-sensitive, and never goes into the repository or a chat.
- **Where it is kept: the owner's Google Drive.** The owner uploads each export by hand. It is
  never routed through the coordinator or any connector, because the file holds all the
  business data. After uploading, the owner downloads the uploaded copy and checks its SHA-256
  against the one the export printed (`Get-FileHash -Algorithm SHA256 <file>` in PowerShell, or
  `shasum -a 256 <file>`), then deletes both local files.

**The copy log.** One row per export: the date, the SHA-256 the export printed, the kind of
storage, and the restore drill's result when there was one. Never a path that holds a
credential.

| Date | SHA-256 | Storage | Restore drill |
|---|---|---|---|
| — | — | — | none yet |

### Restoring production from the copy

A copy is restored only into a new, empty database, never into the damaged one.

1. If the damage is ongoing, roll the app back (R1).
2. In Neon, create a new, empty database inside the `production` branch (F9). Leave the damaged
   one untouched.
3. Download the copy from Google Drive, and check its SHA-256 against the copy log.
4. Run `npm run operator:production -- db:restore --in <file>` against the new database. It
   applies the migrations, inserts every row, reads every table back and prints
   `[db:restore] <table>: restored <n>, identical <n>`. It refuses a database that holds any
   table.
5. Run `npm run operator:production -- db:census` against it, and compare with the export's
   counts.
6. Put the new database's two strings into the password manager and into Vercel's Production
   settings, then redeploy the current release. Its seed reports `SKIPPED`.
7. **Give the first `ADMIN` a PIN.** The copy holds no PIN, so nobody can sign in yet. Run
   `npm run operator:production -- pin:reset --list` to find the `ADMIN`'s id, then
   `npm run operator:production -- pin:reset --profile <id>`, answering `NEW_PIN` with the PIN
   you chose. That administrator signs in and resets everyone else's PIN from `/profiles`.
   Anyone whose profile request was pending asks again.
8. Run the anonymous pass.

Everything written after the copy was made is lost, and counts entered since are entered again.

### Secrets kept outside the server

The owner's password manager holds `AUTH_SECRET`, `PIN_PEPPER` and the two production connection
strings, plus `SETUP_CODE` until it has been used. **Only the owner holds them** (the owner's
answer to Q7). The risk accepted is that they depend on one person's password manager: losing
them means regenerating every secret and resetting every PIN. Losing `PIN_PEPPER` invalidates
every PIN: see *Recovery from a lost `PIN_PEPPER`* above, with `pin:reset` run through
`npm run operator:production`. Replacing `AUTH_SECRET` signs everyone out and makes every device
new.

### The drills

- **The copy drill (AC-28).** After the first `ADMIN` exists: export production, and check the
  counts against a census taken straight after. Create a scratch Neon branch from `dev` with a
  new, empty database, restore a copy **downloaded from Google Drive** into it, and check that
  every table reports identical and the census shows the export's counts with `pins: 0 of 0`.
  Delete the scratch branch, and record the date, the SHA-256, the storage and the result in
  the copy log. **It proves** that a copy taken from production restores, whole, into an empty
  database, with matching counts: it is the real restore procedure, run against a scratch
  branch.
- **The history drill (AC-29).** Create a branch from `production` as of a stated time within
  the 6-hour window, after the first `ADMIN` was created, and run
  `npm run operator:production -- db:census` against it. Its master-data lines equal
  production's, and it shows at least one `ADMIN`. Record the time taken and the result, then
  delete the branch. **It proves** that the owner can produce production as it was at a time
  inside the window.
- **Neither drill proves** that restoring `production` in place works.

| Drill | Date | Result |
|---|---|---|
| Copy (AC-28) | — | not yet done |
| History (AC-29) | — | not yet done |

## Rollback

The app is rolled back in Vercel's dashboard; the schema only ever moves forward.

- **R1, a bad release, with or without an additive migration.** The owner rolls production back
  in Vercel's dashboard to the previous deployment (V3). No build runs, so no migration runs.
  The previous release works on the newer schema because every migration keeps the previous
  release working, and a destructive step carries `-- contract-step:`. The coordinator confirms
  with `npm run verify:deploy -- --url https://stock-management-zeta-one.vercel.app
  --expect-commit <the previous commit>`. The fix goes to `main`, is gated and is released. If
  Vercel stopped promoting pushes after the rollback, the owner undoes that, as recorded below.
- **R2, a migration that damaged data.** Restore the data: Layer 1 within 6 hours, else Layer 2.
  The next release must not re-apply the damaging migration unchanged; how to change it is
  decided with its author and recorded. Never edit a migration that is applied anywhere; write a
  new one.
- **R3, a migration that failed.** The build fails and the previous release keeps serving.
  Prisma records the failure, and every later production build fails at `migrate-deploy` until
  it is resolved.
  - The owner relays the failing statement and error code from the build log.
  - The owner runs `npm run operator:production -- migrate:status`.
  - A migration that left nothing applied is marked with
    `npm run operator:production -- migrate:resolve --rolled-back <migration>`, corrected, gated
    and released.
  - A migration that left part of itself applied is undone with Layer 1, restoring to just
    before that build. The restore also removes the failure record.
- **Never:** force-push `production`; run `prisma migrate reset`, `prisma migrate dev` or
  `db push` against production; put a production string in `.env`; restore a copy into a
  database in use.

**What the rollback drill found (AC-30):** not yet done. It records what Hobby's rollback
offered (V3), whether Vercel stopped promoting new `production` pushes after it, and how that
was undone.
