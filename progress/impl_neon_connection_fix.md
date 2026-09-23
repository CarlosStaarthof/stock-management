# Implementation — the Neon test-database failures

**Plan:** `C:\Users\User\.claude\plans\i-want-to-develop-greedy-twilight.md`
**Brief:** scratchpad `impl-neon.md`
**Status:** **changes complete and verified against a stand-in Postgres — BLOCKED on the real
Neon test branch, which now refuses authentication outright**

---

## Read this first: the headline is a negative result

Two things the plan asserts did not survive measurement.

**1. The Neon test branch is not dropping connections. It is rejecting the password.**

The very first thing I ran — `npm run test:db` on unmodified `HEAD`, before touching a file —
died in about four seconds:

```
Datasource "db": PostgreSQL database "neondb", schema "public" at "ep-odd-boat-zamat29w.c-2.eu-west-2.aws.neon.tech"

Error: P1000: Authentication failed against database server, the provided database credentials for `(not available)` are not valid.

[test:db] prisma migrate deploy failed against TEST_DATABASE_URL.
```

Not `P1001 Can't reach database server`, not a hang, not a timeout: **P1000**, fast, and
repeatable. I checked every endpoint in `.env` with a real `SELECT 1` (no credential printed,
nothing written to a tracked file):

| Endpoint | Host | Verdict |
|---|---|---|
| `DATABASE_URL` (dev, pooled) | `ep-cold-sound-zahsy82t-pooler…` | **answers**, 315 ms |
| `DIRECT_URL` (dev, unpooled) | `ep-cold-sound-zahsy82t…` | **answers**, 2 859 ms cold / 283 ms warm |
| `TEST_DATABASE_URL` (test, pooled) | `ep-odd-boat-zamat29w-pooler…` | **P1000**, 636 ms |
| `TEST_DIRECT_URL` (test, unpooled) | `ep-odd-boat-zamat29w…` | **P1000**, 690 ms |

The two test endpoints carry the **same username and the same password as the two development
endpoints** (compared programmatically, never printed). Those credentials work against the
development compute and are refused by the test compute. So this is not exhaustion, not the
pooler, not autosuspend — the role's password on the test branch no longer matches what `.env`
holds. `channel_binding` is innocent: I tried each endpoint as-is, with `channel_binding`
removed, and with `channel_binding=disable`; all three behave identically on each endpoint
(dev passes three times, test fails three times). The plan's aside that "the query engine
appears to handle `channel_binding` differently from the CLI" is not what is happening — the
CLI (`prisma migrate deploy`) fails in exactly the same way as the query engine.

**`.env` is denied to agents, so I cannot fix this and did not try.** Somebody with the Neon
console has to reset the role's password on the `test` branch (or re-copy the branch's
connection strings) and update `TEST_DATABASE_URL` and `TEST_DIRECT_URL`. Until then
`npm run test:db` cannot run against the real branch at all, so the plan's "three consecutive
green runs on the test branch" is not achievable by me.

**2. "~374 connection slots" is a ceiling nobody was reaching. Measured peak was 9.**

See the numbers below. The suite never requested anything like 374 backends, because Prisma's
pool is **lazy** — `connection_limit` is a maximum, not an allocation — and
`fileParallelism: false` means only one of the 22 processes is ever running. The fix is still
a real improvement (9 → 5, and 22 processes → 1), but it is a 44 % reduction against a ceiling
of 200, not a 75-fold one against a ceiling of 112. If connection exhaustion were the cause of
the gate failures, these numbers do not show it.

I could not measure Neon's `max_connections`, because I could not open a session on the test
branch. It remains unverified.

---

## What I had to substitute, and what that costs the evidence

With the real test branch refusing connections, the only way to measure anything was a
stand-in: **PostgreSQL in Docker on `127.0.0.1:55432`, `max_connections=200`**. I started on
`postgres:16`, found two tests failing on a `SQLSTATE 23001` vs `23503` difference, checked
`SHOW server_version` on the Neon development branch (**18.6**) and moved the stand-in to
`postgres:18` (**18.6**, same build family). The two failures disappeared. That is worth
recording on its own: **the repository's `restrict_violation` assertions depend on Postgres 17+
behaviour**.

What this stand-in proves and does not prove:

- **Proves:** how many connections the suite *requests*, which is a client-side property; that
  `singleFork` collapses 22 processes into 1; that the capped pool binds; that the suite is
  green and stable across three consecutive runs; the duration change.
- **Does not prove:** anything about Neon's `max_connections`, its proxy's reaping of sockets
  from processes that exited, autosuspend, or the account's compute allowance. A local
  Postgres closes a dropped socket immediately; a proxy in another region may not. **If the
  real mechanism is lingering sockets at Neon's proxy, this measurement cannot see it.**

---

## The four changes

### 1. One process for the whole suite — `vitest.db.config.ts`

`poolOptions: { forks: { singleFork: true } }`, with a comment beside it recording why, in the
voice of the comments already there. `isolate` left at its default, so module registries still
reset per file; only the process — and therefore `globalThis.macroadsPrismaClient` — is shared.

**Measured effect:** the in-suite probe saw **22 distinct process ids** before and **1** after.

### 2. A capped connection pool, composed in `scripts/run-db-tests.mjs`

`connection_limit=5`, `pool_timeout=20`, `connect_timeout=15`, composed onto the URL the script
binds as the child's `DATABASE_URL` **and** `DIRECT_URL`. In the script, never in `.env`.

Three properties worth naming:

- **Existing parameters are preserved**, not replaced: the composer works on
  `URL.searchParams`, so `sslmode` and `channel_binding` survive.
- **A parameter already on the URL wins.** This adds defaults; it does not override a choice.
- **A string that is not a parseable URL is returned untouched.** That is the honest behaviour
  for a plain DSN — and it is also why **020 AC-10 and AC-15 pass completely unmodified**:
  their sentinels (`sentinel-test-direct`) are not URLs, so nothing is composed onto them and
  the existing byte-equality assertions still hold. I did not edit `tests/unit/test-db-guard.test.ts`.

Both refusals and the `MACROADS_TEST_DB` handshake are untouched and still written against
`TEST_DATABASE_URL`.

### 3. `$disconnect()` at the end — new `vitest.db.setup.ts`

Named in `setupFiles`. It reads the client off `globalThis` (so a file that never touched the
database does not construct one purely to close it) and `$disconnect()`s it in `afterAll`.

**Correction to the plan:** the plan says "with one process this is one call". It is not.
`afterAll` in a setup file is registered into **each test file's** root suite, so it fires 22
times, and Prisma reconnects lazily on the next query. That is the tighter behaviour anyway —
at most one file's pool is open at a time — but it is not what the plan predicted, and the
file's comment says so rather than implying otherwise. I found no vitest hook that fires once
per *worker process*: `globalSetup`'s teardown runs in the main process, which under
`singleFork` is not the process holding the client.

I can show the hook is wired and executing (`setup 126ms` … `setup 149ms` in every run below,
against `setup 0ms` on the baseline). I **cannot** show a connection-count delta attributable
to it alone, because with one process the process exit closes the socket regardless. Its value
is hygiene, not a measured saving. Recorded as such rather than claimed.

### 4. A health check that can fail — `scripts/db-probe.mjs`, `init.sh`, `init.ps1`

The probe now opens a real session and runs `SELECT 1`. `init.sh` and `init.ps1` probe
`DATABASE_URL` and then **`TEST_DIRECT_URL TEST_DATABASE_URL`** — the pair, so the probe
applies the same fallback `run-db-tests.mjs` does and checks the endpoint `test:db` will
actually use. When neither is set the message still names `TEST_DATABASE_URL`, which is what
003 AC-24 asks for.

**A collision the plan did not anticipate, and how it is resolved without an amendment.** My
first version imported `PrismaClient`. That turned
`tests/unit/hashing-boundary.test.ts` red:

```
FAIL  tests/unit/hashing-boundary.test.ts > the dependency rule >
      004 AC-31 replacing 003 AC-31: every file that touches the database lives under src/server/
AssertionError: expected 'scripts/db-probe.mjs' to match /^src\/server\//
```

004 AC-31 is a rule worth more than the convenience, and I am not permitted to amend a spec.
So the probe runs its statement through the **Prisma CLI** — `prisma db execute --stdin` — which
the repository already depends on and already spawns here for `migrate deploy`. No
`@prisma/client` import, rule intact, real session all the same. The URL is passed to the child
**in its environment**, never as `--url` on the command line, because argv is readable by other
processes and that string is a credential; the child's output is captured, never inherited, so
only the `[probe]` line is ever printed.

Cost: 2.1–2.3 s per probe, against AC-24's ten-second budget, which is unchanged.

`docs/verification.md` and `docs/operations.md` both described the old TCP behaviour and are
updated. No spec file, no `feature_list.json`, nothing of #11's was touched.

---

## Files

### Created
- `vitest.db.setup.ts` — `afterAll` → `$disconnect()`; the suite hands its connection back.
- `tests/unit/db-connection-guard.test.ts` — 8 tests: the composed parameters, the preserved
  ones, the untouched-when-unparseable case, 020 AC-15 still binding the direct endpoint, and
  four on the probe including **the one that matters, that it reports failure**.

### Modified
- `vitest.db.config.ts` — `poolOptions.forks.singleFork`, `setupFiles`, comments for both.
- `scripts/run-db-tests.mjs` — `withConnectionParameters()` and the two bindings that use it.
  The refusals, the `MACROADS_TEST_DB` handshake and 020 AC-15's fallback are byte-unchanged.
- `scripts/db-probe.mjs` — rewritten: real session via the Prisma CLI, multi-name fallback.
- `init.sh`, `init.ps1` — probe `TEST_DIRECT_URL TEST_DATABASE_URL` as a pair.
- `docs/verification.md`, `docs/operations.md` — the probe's description now matches the probe.

**Not touched:** `src/server/db.ts`, `src/server/test-db.ts`, `tests/unit/test-db-guard.test.ts`,
any spec, `feature_list.json`, `progress/current.md`, anything of #11's, anything under `Samples/`.

---

## Measurement 1 — peak connections, before and after

Method as the brief required: a temporary probe **inside the suite** (a setup file sampling
`pg_stat_activity` and `SHOW max_connections` every 1.5 s through the suite's own client, one
interval per process, plus a sample in `afterAll`). Full run each time, same stand-in database,
same machine. The probe has been **removed**; it exists only in this report.

| | **Before** (HEAD) | **After** (all four changes) |
|---|---|---|
| Samples | 125 | 109 |
| **Distinct OS processes** | **22** | **1** |
| **Peak backends, test database** | **9** | **5** |
| Peak backends, whole server | 14 | 10 |
| Median backends, test database | 2 | 2 |
| `max_connections` (stand-in) | 200 | 200 |
| Sampling errors | 0 | 0 |

Read that carefully:

- The plan predicted **~374** requested slots before. Measured: **9**. Prisma opens pool
  connections **lazily**, and `fileParallelism: false` already serialised the files, so 21 of
  the 22 processes are dead at any instant and the live one holds one or two connections, not
  seventeen. The "22 × 17" figure is the suite's theoretical ceiling and nothing was
  approaching it.
- After the changes the peak is **5** — exactly `connection_limit`, so the cap is what binds,
  which is the intended behaviour and confirms the parameter is actually reaching the engine.
- The peak fell by a factor of **1.8**, not 75.

**`max_connections` on the Neon test compute is still unmeasured**, because nothing can open a
session there. The plan's "roughly 112" remains general knowledge, unverified, exactly as the
brief suspected. On the evidence I have, **I would not tell anyone the gate failures were
connection exhaustion.**

## Measurement 2 — three consecutive runs

All against the Postgres 18.6 stand-in, back to back, no restarts between them.

```
=== run 1: exit=0 wall=90s ===
 Test Files  22 passed (22)
      Tests  397 passed (397)
   Duration  84.93s (transform 1.21s, setup 126ms, collect 3.64s, tests 80.32s, prepare 206ms)
=== run 2: exit=0 wall=90s ===
 Test Files  22 passed (22)
      Tests  397 passed (397)
   Duration  85.49s (transform 1.19s, setup 130ms, collect 3.62s, tests 81.02s, prepare 164ms)
=== run 3: exit=0 wall=90s ===
 Test Files  22 passed (22)
      Tests  397 passed (397)
   Duration  85.17s (transform 1.20s, setup 149ms, collect 3.53s, tests 80.82s, prepare 181ms)
```

No `Can't reach database server`, no `Server has closed the connection`, no `Hook timed out`.
**397 tests, not the 359 the brief expected** — the suite has grown since that figure was taken
(`src/server/reporting/` is untracked #11 work carrying db tests).

Like-for-like baseline, same stand-in, `HEAD` versions of both changed files restored for the
run and then replaced:

```
BASELINE exit=0 wall=121s
 Test Files  22 passed (22)
      Tests  397 passed (397)
   Duration  115.50s (transform 1.42s, setup 0ms, collect 8.78s, tests 95.44s, prepare 3.93s)
```

**115.50 s → 85.17 s, about 26 % faster.** `collect` 8.78 s → 3.53 s and `prepare` 3.93 s →
0.18 s, which is the 21 process spawns disappearing, as the plan predicted. Note the baseline
was **green too** on a healthy database: nothing here reproduces the gate failure, because the
gate failure is not in this repository.

## Measurement 3 — the probe fails when it should

The decisive comparison, both probes run against the same three endpoints in the same minute:

```
=== new probe ===
DATABASE_URL                      -> [probe] reachable ep-cold-sound-zahsy82t-pooler…   exit=0
TEST_DIRECT_URL TEST_DATABASE_URL -> [probe] unreachable ep-odd-boat-zamat29w…          exit=1
TEST_DATABASE_URL                 -> [probe] unreachable ep-odd-boat-zamat29w-pooler…   exit=1

=== old probe (git show HEAD:scripts/db-probe.mjs) ===
DATABASE_URL      -> [probe] reachable ep-cold-sound-zahsy82t-pooler…   exit=0
TEST_DATABASE_URL -> [probe] reachable ep-odd-boat-zamat29w-pooler…     exit=0
TEST_DIRECT_URL   -> [probe] reachable ep-odd-boat-zamat29w…            exit=0
```

**The old probe calls a database that refuses every single connection "reachable", twice.**
That is the defect the plan described, caught red-handed on the endpoint that is actually
broken today. The new probe is right about all three.

Also proved against a host that cannot resolve, and against a healthy database, in 2.1–2.3 s:

```
[probe] reachable 127.0.0.1     exit=0    real 2.264s
[probe] unreachable db.invalid  exit=1    real 2.114s
```

Both are asserted in `tests/unit/db-connection-guard.test.ts`, so they cannot rot.

**Consequence for the gate right now:** `init` will print
`[skip] database unreachable at ep-odd-boat-zamat29w… - database-dependent checks skipped` and
end `[OK] Environment ready (database checks skipped)`. Under `CHECKPOINTS.md` C2.1 **no feature
may be closed on that run** — which is the correct outcome and, before change 4, was being
concealed.

## Measurement 4 — the guards

020 AC-10's spawn test and 020 AC-15's binding test pass **unmodified** — the file was never
edited:

```
 ✓ tests/unit/test-db-guard.test.ts (11 tests) 1771ms
   ✓ AC-10: neither refusal deploys a migration or loads a test file
   ✓ AC-15: binds the child's DATABASE_URL and DIRECT_URL to TEST_DIRECT_URL
   ✓ AC-15: falls back to TEST_DATABASE_URL for both when TEST_DIRECT_URL is unset
```

## Measurement 5 — typecheck, lint, unit

```
npm run typecheck   exit 0, no output
npm run lint        exit 0, no output
npm run test:unit
 Test Files  55 passed (55)
      Tests  817 passed (817)
   Duration  16.31s
```

`init` and `test:e2e` were **not** run; the coordinator gates.

---

## Deviations from the plan

1. **The probe does not import `PrismaClient`.** It spawns `prisma db execute`. Forced by
   004 AC-31, which a direct import breaks; evidence above. Same guarantee, no spec amendment.
2. **`$disconnect()` fires per test file, not once per run.** No vitest hook fires once per
   worker process. Explained above and in the file.
3. **Everything was measured against a local Postgres 18.6, not the Neon test branch**, which
   refuses authentication. Scope of that substitution stated above.
4. **`init.sh`/`init.ps1` probe a *pair* of variable names**, which needed the probe to accept
   several. The plan said "probe the endpoint `test:db` will use" without saying how; the
   fallback has to live in the probe because `init` never loads `.env` and so cannot know
   whether `TEST_DIRECT_URL` is set.
5. `docs/verification.md` and `docs/operations.md` updated — both asserted the old TCP
   behaviour. Not in the plan's file list, but leaving them would leave the docs lying.

## What the plan got wrong

| Claim | Measured |
|---|---|
| ~374 connection slots requested per run | **9** peak backends. Prisma's pool is lazy; `fileParallelism: false` already serialised it |
| Free-plan `max_connections` ≈ 112 | **Unmeasured.** No session can be opened on the test branch |
| The failure is dropped connections / exhaustion | Today's failure is **P1000, authentication**, in ~4 s, before any test loads |
| `channel_binding` behaves differently for CLI and query engine | No. Both fail identically on the test endpoints and both succeed on the dev endpoints, with `channel_binding` required, absent or disabled |
| One `$disconnect()` call with one process | 22 — `afterAll` in a setup file is per file |
| `test:db` is 359 tests | 397 |

None of this makes the four changes wrong. `singleFork` is a genuine 22→1, the cap genuinely
binds at 5, the run is 26 % faster, and change 4 fixes a health check that was demonstrably
lying — it is the thing that *found* the real fault. But the plan's causal story is not
supported by measurement, and the gate will not go green until somebody fixes the test
branch's credentials.

## Notes for the reviewer

- **The one thing to do next is not in this repository.** Reset the role's password on the Neon
  `test` branch (or re-copy that branch's connection strings) and update `TEST_DATABASE_URL`
  and `TEST_DIRECT_URL` in `.env`. Then re-run `npm run test:db` three times. If it *still*
  drops connections mid-run with zero assertion failures, the next diagnostic is the Neon
  console's Usage/Billing page, as the plan says — not more repository work.
- **Re-measure the peak on the real branch when it is back.** My numbers are from a local
  server that reaps a dropped socket instantly. Neon's proxy may hold sockets from the 22
  exited processes for far longer, and that is the one version of the exhaustion story this
  measurement cannot rule out. The in-suite probe was about 20 lines in a setup file; it is
  easy to put back.
- **The suite's `restrict_violation` assertions require Postgres 17+.** On `postgres:16` two
  tests in `src/server/schema/referential.db.test.ts` fail on `23503` where they expect
  `23001`. Neon is on 18.6, so this is latent, but it means the test database cannot be
  downgraded, and a developer reaching for a local Postgres must pick 17 or newer. Nobody has
  written that down anywhere; it is not in scope here, so I have not.
- `vitest.db.setup.ts` sits at the repository root beside `vitest.db.config.ts`, which means
  `npm run lint` (`eslint src tests`) does not cover it. `vitest.db.config.ts` has the same
  property. `npm run typecheck` does cover it.
- The temporary measurement probe and both Docker containers are gone; `git status` shows only
  the files listed above plus #11's pre-existing work.
