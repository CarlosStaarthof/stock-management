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
