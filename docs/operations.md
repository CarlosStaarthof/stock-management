# Operations — running this application against a real database

Everything here is a command an operator types. Nothing here requires reading `.env`.

---

## Creating the first administrator

There is no seeded account and no default password, because a password in git is a
published password. On a new database, run once:

```
ADMIN_EMAIL=you@macroads.ie ADMIN_PASSWORD=<choose-a-strong-password> npm run admin:create
```

- `<choose-a-strong-password>` is a placeholder. Substitute a password of at least
  **12 characters**; there are no composition rules.
- The command hashes the password through `src/server/auth/password.ts` (bcrypt, cost 10),
  writes the user with `role = ADMIN` and `active = true`, and prints the email and the
  role. It never prints, logs or stores the plaintext, and it never prints the hash.
- Run again with the same email it refuses, exits non-zero, and changes nothing.
- With `ADMIN_PASSWORD` unset or empty it refuses and exits non-zero. It does not prompt
  and there is no fallback value.
- `ADMIN_NAME` is optional and defaults to `Administrator`.

Every later account is created the same way until a feature owns a user-management screen
(spec 003, *Open questions*). To lock out a leaver, set `active = false` on their row: the
next request they make is refused, without waiting for their session to expire.

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
table, no credentials in its output, ten second timeout. A socket that merely opens
proves nothing; a suspended compute and a stale password both accept one.

- **Reachable:** `prisma migrate status` and `npm run test:db` run for real, and the run
  ends with `[OK] Environment ready`.
- **Not reachable:** both scripts print a line beginning `[skip] database unreachable at`
  and ending `database-dependent checks skipped`, run neither, and end with
  `[OK] Environment ready (database checks skipped)`.

A feature may **not** be closed on a skipped run — `CHECKPOINTS.md` C2.1. The skip keeps
the gate usable on a machine with no database; it does not lower the bar for finishing
work.
