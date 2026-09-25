# Operations — running this application against a real database

Everything here is a command an operator types. Nothing here requires reading `.env`.

---

## Profiles, usernames and PINs

People sign in with a username and a PIN (spec 021). There is no seeded profile and no
default PIN, because a credential in git is a published credential. `PIN_PEPPER` is
required in every environment, and each environment generates its own.

First-run setup: added with `/setup`.

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

Four connection strings, in two pairs — see `.env.example` for the pooled/direct split.

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
