# 016 — Production deployment

**Feature id:** 16   **Status:** approved (2026-09-28)   **Revised:** 2026-09-28, with the owner's facts and decisions
**Depends on:** #2 `app_scaffold` (a build that needs no database, 002 AC-5), #3 `auth_and_roles`
(Auth.js, `PROTECTED_PATHS`, the middleware), #4 `domain_schema` (the migrations and the two
migration-seeded `Location` rows), #5 `seed_from_workbook` (the importer, 005 AC-18 to AC-24),
#9 and #10 (the money boundary on every staff surface), #21 `pin_auth` (`PIN_PEPPER` and S4,
`/setup` and S9, and AC-16's `Secure` cookie, whose production half is carried here)

## Purpose

The app runs on one computer. Yard staff cannot count on their phones until it runs somewhere
they can reach, over HTTPS, against a database that is not the one the tests empty. This feature
takes over the Vercel project that already exists and releases the app from it. The production
database is Neon's `production` branch. The feature makes four things a live system needs
repeatable:

- a release that migrates the schema without a person holding a connection string;
- a first use that loads the item master exactly once;
- a copy of the data that survives outside Neon;
- a documented, rehearsed way back from a bad release or damaged data.

What breaks without it: nothing is tested on a real phone in a real yard, which the brief wants
months before Excel export exists. The Vercel project already serves commit `713b5a5` publicly,
with settings nobody has inventoried. And Neon keeps only 6 hours of history, so without a copy,
damage noticed the next morning cannot be undone.

## The owner's decisions, 2026-09-28 — binding, each with the risk it accepts

| # | Decision | Risk the owner accepted |
|---|---|---|
| OD1 | **Stay on Vercel Hobby.** This departs from `specs/product-brief.md` → *Hosting*, which chose Pro. | The owner was told that Hobby's terms exclude commercial use, and **accepted that risk**. If the terms are enforced, the project may have to move to a paid plan. The release flow specified here moves with it unchanged. Hobby may also lack features this spec would use. Each one is a fact the owner confirms on the dashboard (V2 to V7), and **none is asserted here from memory**. |
| OD2 | **Stay on Neon Free, and keep a monthly copy outside Neon, built in #16.** | Neon keeps **6 hours** of history (F2). Damage noticed later than that can be undone only back to the last copy. Everything written since is lost and must be typed again. D19 narrows that gap with a copy before every release that carries a migration. Whether usage on `dev` and `test` can suspend `production` is not yet known (F6). |
| OD3 | **The production address is `stock-management-zeta-one.vercel.app`.** `AUTH_URL` is `https://stock-management-zeta-one.vercel.app`. | The address is the one Vercel assigned; there is no custom domain. Changing it later signs everyone out and makes every device a new device (D6). |
| OD4 | **Q4 to Q8 stand as recommended. The owner confirms each at approval.** | — |

## What is already true

### Verified in the repository, 2026-09-27

| Fact | How it was checked |
|---|---|
| The repository is on GitHub, **private**, at `CarlosStaarthof/stock-management`, default branch `main`, last pushed 2026-09-26 23:14 UTC. Local `main` equals `origin/main` (`713b5a5`). There is no `.github/` directory, no GitHub deployment and no webhook. | `gh repo view`, `git rev-parse`, `gh api …/deployments`, `gh api …/hooks` |
| No tracked file is named `.env*`, `*.pem`, `*.key`, `*.p12` or `*.pfx`. Every connection-string shape in the patches of all 46 commits has placeholder user-info (`USER:PASSWORD` or `u:p`). This agrees with the coordinator's scan of every blob for every `.env` value. | `git ls-files`; a pattern scan of `git log -p --all` that printed hosts and classes only |
| **The coordinator's tools:** `gh` 2.95.0, signed in as `CarlosStaarthof` with the scopes `gist`, `read:org`, `repo` and `workflow`; `git` 2.53.0; `node` 24.14.0; `npm` 11.12.0; `curl` 8.18.0; Playwright's Chromium; and Prisma. **Not installed:** `vercel`, `neonctl`, `psql`, `pg_dump`. | `--version` for each |
| **Development census:** 140 items, 15 of them flagged `needsReview`; 19 types; 10 suppliers; 129 prices; 152 yard links; 2 locations. It also holds 1 profile (an `ADMIN`), and 1 stock count with 82 lines. | A read-only count through Prisma |
| **How the item master is loaded.** `npm run seed:workbook` reads `Samples/Stock @ 01-Sep-2026.xlsx`. The file is tracked, so a Vercel build has it. The seed writes in one transaction (005 AC-24), is insert-only (005 AC-22), and is a no-op when re-run on an unchanged database (005 AC-21). It needs the two `Location` rows the second migration inserts (005 AC-19). | The script, the service and spec 005 |
| **Re-running it blind after go-live is not safe.** Its second matching pass is by description alone (`workbook-import-service.ts:190-198`). An item an `ADMIN` has since renamed no longer matches, so a re-run would create the workbook's original again. That is why AC-6 guards the seed. | Reading the service |
| **Why Auth.js's session cookie gets `Secure`.** It is `Secure` when the URL Auth.js derives is `https:` (`node_modules/@auth/core/lib/init.js:69`, `lib/utils/cookie.js:45-74`). That URL comes from `AUTH_URL` when it is set, and from `x-forwarded-proto` and `x-forwarded-host` otherwise (`lib/utils/env.js:66-87`). `authorize` receives a request built on the same URL (`lib/actions/callback/index.js:231-233`), and `deviceCookieOptions(request.url)` sets `macroads-device`'s `Secure` from it (`src/server/auth/sign-in-codes.ts:36-42`). **Both cookies are set only on a successful sign-in.** | Reading the code |
| `npm audit --omit=dev`: **4 high, 3 moderate, 0 critical**, in `postcss` (under `next`), `deepmerge-ts` (under `@prisma/config`), and `uuid` (under `exceljs`). npm's suggested fix for each is a semver-major change. | `npm audit --omit=dev --json` |

### From the owner's dashboard screenshots, 2026-09-28

- **Neon.**
  - The project is `stock_managment`, on the **Free** plan, in AWS Europe West 2 (London), running **Postgres 18**.
  - It has **three branches**: `production`, the default branch, created 2026-09-01; `dev`; and `test`.
  - **There is no `main` branch in Neon. The production database is the branch `production`.**
  - Default compute is 0.25 ↔ 2 CU.
  - **History retention is 6 hours.**
  - Usage since 1 September: 5.37 CU-hours, 34.19 MB of storage, 340.58 MB of network.
  - The `production` branch's monitoring shows no data, meaning no activity.
  - `dev` and `test` are on the same project, so the gate already runs on Postgres 18.
- **Vercel.**
  - The team is "MacRoads", on the **Hobby** plan.
  - **The project `stock-management` already exists.** It is connected to the repository, **its production branch is `main`**, and it has deployed `713b5a5`, status Ready, at **`stock-management-zeta-one.vercel.app`**.
  - Vercel's production checklist shows "Preview Deployment" unchecked. It stays unchecked by design (D4).
  - An unrelated project, `quote-tool`, exists in the same team.
- **The live site, probed anonymously by the coordinator:** `/` answers `200`, `/sign-in` `200`, `/setup` `404` and `/api/session` `401`. `/stock-takes` and `/profiles` answer `307` to sign-in.
- **Which variables the live site has is unknown.** The owner is sending a screenshot of their names. The probe fits both of the likeliest cases: development's values, since development holds an `ADMIN` and so `/setup` answers `404`; and no values at all. **Go-live therefore starts by inventorying and clearing whatever is there** (AC-19).
- **The coordinator has stopped pushing `main`.** Vercel releases every push of `main` today.

## Decisions, each with the tradeoff it accepts

| # | Decision | Tradeoff accepted |
|---|---|---|
| D1 | **The owner holds every account and every secret. The coordinator holds none.** The owner works in the Vercel and Neon dashboards, in a password manager, at `/setup`, and in their own terminal for operator commands. The coordinator works in the repository, with `git` and `gh`, and runs this feature's scripts. **No secret value ever passes through the chat, a file in the repository or a log.** | Every dashboard step waits for the owner. The coordinator cannot read Vercel's build log, so the owner relays the lines this feature prints, which carry no secret. |
| D2 | **No Vercel CLI, no `neonctl`, and no Vercel or Neon token on the coordinator's machine.** | Same as D1. The gain is that nothing on this machine can read or change production's settings. |
| D3 | **Vercel releases the git branch `production`, and nothing else.** Pushing `main` releases nothing: it is a backup of committed work, phase commits included. **A release is a fast-forward push of `production`** to a commit on `main` whose `init` ran with the database checks executed, after the owner's sign-off (Q8). Nobody ever force-pushes `production`. **The project's production branch is `main` today. Changing it is go-live's first step** (AC-19). V2 confirms that Hobby offers the setting, and it is needed before approval. If Hobby does not offer it, D3 is re-opened. The recommended fallback is that `main` stays the production branch and the coordinator pushes `main` only to release. | One more branch to keep in step, and production can lag `main`. The gain is that no push of unreviewed work is ever a release. |
| D4 | **No preview deployments.** Three layers stop them. Git deployments are enabled for `production` only (AC-1). The Preview and Development environments hold no setting at all (AC-19, AC-22). A non-production build on Vercel that finds a database setting refuses to build (AC-3). The database steps run only when `VERCEL_ENV` is `production` (AC-2). | There is no pre-production address for trying a change on a phone, so the local gate is the only check before a release. **Pointing previews at `dev` was rejected:** e2e runs and the owner's own work share `dev`; a preview is reachable from the internet; and a preview carrying a new migration would have to migrate `dev` behind the developer's back. Q5 asks the owner to confirm. |
| D5 | **Each setting lives in one Vercel environment.** See *Environments* below. **Nothing already on Vercel survives go-live**: every production value is entered new. | Production's settings live in two places, Vercel and the owner's password manager. The second copy is the backup. |
| D6 | **`AUTH_URL` is `https://stock-management-zeta-one.vercel.app`** (OD3). Auth.js then derives an `https:` URL whatever headers the proxy forwards, so both cookies' `Secure` stops depending on header forwarding. | The app signs people in correctly only at that address. Changing the address later signs everyone out and makes every device new (021 S7, S8). |
| D7 | **The function region is `lhr1` (London), beside Neon's London compute.** V5 confirmed on 2026-09-28 that Hobby lets the project choose it. If Hobby does not, D7 is re-opened, and AC-1's `regions` and AC-13's `region` check go with it. | The Irish yards cross the Irish Sea once per request. With the functions in `dub1` they would cross it once per database query instead, and a page makes several. |
| D8 | **`prisma migrate deploy` runs in the production build, after `next build` has succeeded**, through `DIRECT_URL`. A compile error therefore never touches the database. A failed migration fails the build, and nothing is released. | The migration lands before the new deployment is promoted, so for a moment the old release runs on the new schema. **Every migration must therefore keep the previous release working** (AC-17). A migration that fails after a good build leaves the old release serving, and every later build fails until the failure is resolved (R3). **Rejected:** a GitHub Actions step, which is a second store for secrets and races Vercel's own deploy; and migrating by hand, which puts a secret in a terminal for every release. |
| D9 | **The item master is loaded by the production build, only into an empty database** (AC-6), then counted (AC-7). | Every production build carries a data step that does nothing after the first day. **Rejected:** running `seed:workbook` from a terminal holding production's strings. It puts a secret in a shell, and a bare re-run after go-live re-creates renamed items. |
| D10 | **One read-only census**, `npm run db:census`, describes any database by counts. It verifies the seed, the pepper backup, the copy and both drills. | Counts only. It cannot say which row differs. D21's read-back covers that for a restore. |
| D11 | **Operator commands against a live database go through one launcher**, `npm run operator:production`. It asks for connection strings and the pepper at a prompt, never from a file, and it accepts only eight command forms (AC-8). It serves 021 S4's recovery, the copy (D19) and its restore (D21), and a failed migration. | One more script. Without it, the only way to run such a command against production is to put production's strings on a command line, where shell history keeps them, or in `.env`, where the next `npm run test:e2e` would write its fixtures into production. |
| D12 | **Security headers are set in `next.config.ts`** (AC-11). They cover transport, sniffing, referrer, framing and device permissions. There is **no script-source Content-Security-Policy**. | Defence in depth against script injection is deferred. A script policy needs nonces carried through every Server Component render, and the project's React #418 hydration history argues for doing that as its own piece of work. |
| D13 | **`GET /api/version` is public and names the commit being served** (AC-12), so the live check can prove that what is live is what was gated. | Anyone can learn which commit is live. The repository is private, so the hash gives them nothing they can use. |
| D14 | **The live check has two passes** (AC-13 to AC-15). The anonymous pass needs nobody. **The two cookie checks and the staff money check cannot be made without a signed-in `YARD_STAFF` session, because both cookies are set only by a successful sign-in and every staff page redirects without one.** So the signed-in pass opens a browser window, the owner signs in there, and the script checks what the browser then holds. The script holds no secret, and the PIN goes only into the page. | The signed-in half needs the owner at the keyboard. |
| D15 | **Backups come in two layers** (see *Backup and restore* below). Neon's 6-hour history covers a mistake noticed within hours. **The copy outside Neon (D19 to D21) is the main protection.** The secrets are kept in the owner's password manager, and each layer is drilled once (AC-27 to AC-29). | Damage noticed more than 6 hours later loses everything since the last copy (OD2). |
| D16 | **The app is rolled back in Vercel's dashboard, and the schema only ever moves forward** (see *Rollback* below). | A bad migration is repaired by another migration or by a data restore, never by running it backwards. |
| D17 | **`SETUP_CODE` is deleted from Vercel once the first `ADMIN` exists** (AC-24). | Restoring to a time before the first `ADMIN` would leave `/setup` unavailable until a code is set again, which is the safe way round. |
| D18 | **Both production connection strings carry `connect_timeout=15`**, which the owner appends when copying them from Neon. This holds provided V6 shows that a function may run longer than 20 s on Hobby. Otherwise the value is 5 s below that maximum, and is recorded. V6 is read at go-live, and the value is fixed then. | An unreachable database takes longer to report than Prisma's default, which is 5 s at the time of writing (the implementer confirms it). In exchange, a Neon compute waking from suspension does not fail the day's first request: this repository measured about 6.5 s to open a first session on a suspended compute (`progress/current.md`, 2026-09-14). AC-31 observes the result. |
| D19 | **The copy is one JSON file per export** (AC-9). It holds every table except `_prisma_migrations`, whose applied names it records instead, read at one consistent moment. The file is written outside the repository, and the owner keeps it in storage they control. **An export is made after each month's counts are approved, and before every release that carries a migration.** | Between copies, anything written after Neon's 6-hour window has passed can be lost. The file holds prices, names, usernames and counts, so it is business-sensitive and never goes into the repository or the chat. |
| D20 | **The copy holds no PIN credential. Every `User.pinHash` and `User.pinKeyId` is written as `null`.** | After a restore from the copy, nobody can sign in until the owner gives one `ADMIN` a PIN with `operator:production -- pin:reset --profile <id>`. That `ADMIN` then resets everyone's PIN from `/profiles` and gives each person the new one, which is 021 S4's path. In exchange, a lost or stolen copy exposes business data but no way into the app, and it need not be kept apart from `PIN_PEPPER`. **Rejected: keeping the hashes.** The restore would be whole, but the copy and the pepper together would let anyone recover every PIN offline, since a PIN has at most a million values. |
| D21 | **A copy is restored only into an empty schema, never into a database in use** (AC-10). A restore applies the migrations, inserts every row, then reads every table back and compares it with the file. | Restoring production from the copy means restoring into a new, empty database (F9) and pointing Vercel's two strings at it, never writing back into the damaged one. That takes a redeploy. |

## Who does what

| Actor | Has | Does | Never |
|---|---|---|---|
| **Owner** | The Vercel project (Hobby), the Neon project (Free), a password manager, storage for the copies, a browser, their own terminal | Confirms the F and V facts. Inventories and clears Vercel's variables. Generates and stores the three secrets, and enters every setting. Completes `/setup` and approves profiles. Signs in for the signed-in pass. Runs every `operator:production` command: census, copy, restore, `pin:reset`, `migrate:*`. Performs the drills. Relays the build log's `[vercel-build]`, `[seed]` and `[db:census]` lines. | Pastes a secret into the chat, a file in the repository, or a command line |
| **Coordinator** | The repository, `git`, `gh` (as `CarlosStaarthof`), `node`/`npm`/`npx`, `curl`, Playwright's Chromium | Runs the implementer and the reviewer for Phase A, and the gate. Pushes `main`. Fast-forwards `production` after sign-off. Runs both passes of `verify:deploy`, the development census and the audit. Records the evidence in `progress/impl_deploy.md`. | Holds a Vercel or Neon token, reads `.env`, or sees a production secret or a copy |
| **Vercel's production build** | The Production environment's settings | Runs `check-settings`, `next-build`, `migrate-deploy`, `seed-if-empty` and `census` (AC-2) | Runs for any branch other than `production` |
| **Implementer, reviewer** | As for every feature | Phase A, in the repository | Touch Vercel, Neon or any `.env` value |

## Environments

**The git branch `production` is what Vercel releases. The Neon branch `production` is the
production database.** Git's `main` releases nothing. Neon has no `main`.

| Setting | Vercel Production | Vercel Preview | Vercel Development | A developer's `.env` |
|---|---|---|---|---|
| `DATABASE_URL` | Neon `production`, **pooled**, with `connect_timeout` (D18) | — | — | `dev`, pooled |
| `DIRECT_URL` | Neon `production`, **unpooled**, with `connect_timeout` (D18) | — | — | `dev`, unpooled |
| `AUTH_SECRET` | **new**, generated by the owner | — | — | its own |
| `AUTH_URL` | `https://stock-management-zeta-one.vercel.app` | — | — | `http://localhost:3000` |
| `PIN_PEPPER` | **new**, generated by the owner | — | — | its own |
| `SETUP_CODE` | **new**; deleted once the first `ADMIN` exists | — | — | its own |
| `TEST_DATABASE_URL` | **never** | never | never | `test`, pooled |
| `TEST_DIRECT_URL` | **never** | never | never | `test`, unpooled |

- The owner generates every **new** value in their own terminal with the command
  `docs/operations.md` → *Environment* gives for `AUTH_SECRET`. Each value goes into the password
  manager first, then into Vercel. None is ever copied from `.env` or kept from what Vercel held
  before go-live.
- The owner copies the two connection strings from Neon's *Connect* dialog for the `production`
  branch straight into the password manager and into Vercel.
- The secrets are marked *Sensitive* where Vercel offers it (V4).
- The build relies on three of Vercel's system variables: `VERCEL`, `VERCEL_ENV` and
  `VERCEL_GIT_COMMIT_SHA` (V4).

## Facts only a dashboard can give

Nothing here is asserted from memory. The owner reads each fact on the dashboard. The coordinator
records it with its date in `docs/operations.md` → *Facts confirmed on the dashboards*. No row blocks
approval any more. V5 was confirmed on 2026-09-28. V2 and V6 were moved to go-live by the coordinator's ruling of
2026-09-28, because D3 and D18 already set out their fallbacks.

**Neon**

| # | Fact | Value, as read |
|---|---|---|
| F1 | The plan | **Free** (2026-09-28) |
| F2 | The history or restore window | **6 hours** (2026-09-28) |
| F3 | Whether a branch can be created from `production` as of a past time within F2 | to confirm, before AC-29 |
| F4 | Whether `production` can be restored in place to a past time, and whether that keeps a copy of the state before the restore | to confirm, before go-live |
| F5 | The branch limit | to confirm, before AC-28. In use: `production` (default, created 2026-09-01), `dev`, `test` (2026-09-28) |
| F6 | The compute allowance, whether all branches share it, and **whether usage on `dev` and `test` can suspend `production`** | to confirm, before go-live. Usage since 1 September: 5.37 CU-hours, 34.19 MB of storage, 340.58 MB of network (2026-09-28) |
| F7 | `production`'s compute size and autosuspend delay | 0.25 ↔ 2 CU (2026-09-28); the delay is to confirm |
| F8 | Region, Postgres version, default branch, storage limit, **and whether `production` holds any table** | AWS Europe West 2 (London), Postgres 18, `production` is the default branch, with no monitoring data (2026-09-28). The storage limit and the table check are to confirm, before go-live. |
| F9 | Whether a new, empty database can be created inside a branch | to confirm, before AC-28 |

**Vercel**

| # | Fact | Value, as read |
|---|---|---|
| V1 | The plan | **Hobby**, team "MacRoads" (2026-09-28). Kept by the owner's decision OD1; not a requirement. |
| V2 | Whether Hobby lets the project's production branch be changed to `production`, a branch that does not yet exist | **The setting exists on Hobby** at *Environments → Production → Branch Tracking*, which reads `main` (screenshot, 2026-09-28). Whether it accepts `production` is confirmed at go-live step 1 (AC-19). If it does not, D3's fallback applies. |
| V3 | What Instant Rollback on Hobby can target, and whether it stops promoting new pushes until it is undone | to confirm, before AC-30 |
| V4 | Whether system environment variables are exposed to builds and functions, and whether settings can be marked *Sensitive* on Hobby | to confirm, before go-live |
| V5 | Whether Hobby lets the project place its functions in `lhr1` | **Confirmed, 2026-09-28.** Hobby allows one region, and `lhr1` is the one set (*Settings → Functions → Function Region*). |
| V6 | A function's maximum duration on Hobby | Not yet read: it sits below the 2026-09-28 screenshot, under *Functions → Advanced Settings*. It is **read at go-live**, and D18's value is fixed then. |
| V7 | Which repositories Vercel's GitHub app can reach | to confirm, at go-live |
| V8 | The existing project's variables, by name, in each environment | the owner's screenshot is pending (AC-19) |

## Go-live

| Step | Actor | Where | What |
|---|---|---|---|
| 1 | Owner | Vercel | Change the project's production branch from `main` to `production` (V2). No `production` branch exists on GitHub yet, so nothing is released, and the current deployment keeps serving. |
| 2 | Owner, then coordinator | Vercel, repository | The owner screenshots the variables' **names** in each environment, never their values. The coordinator records them in `progress/impl_deploy.md`. |
| 3 | Owner | Vercel | Delete every variable in Production, Preview and Development. If Production or Preview held any, take the current deployment off them now, by the means the dashboard offers on Hobby, and record how (Q9). |
| 4 | Coordinator | `git` | Resume pushing `main`. Until Phase A's `vercel.json` turns `main`'s deployments off, a push may create a preview deployment. It holds no setting and can reach no database. |
| 5 | Coordinator | repository | Phase A implemented, reviewed and gated, with `init`'s database checks executed. After the owner's sign-off, commit and push `main`. |
| 6 | Coordinator, then owner | repository | The audit (AC-20), then the owner's go or no-go (Q6). |
| 7 | Owner | Neon | Confirm F4, F6 and F8 (AC-21), including that `production` holds no table. Copy `production`'s pooled and unpooled strings into the password manager with `connect_timeout` (D18). |
| 8 | Owner | own terminal | Generate `AUTH_SECRET`, `PIN_PEPPER` and `SETUP_CODE`, each straight into the password manager. |
| 9 | Owner | Vercel | Enter the six Production settings. Preview and Development stay empty. Confirm V4 and V7 (AC-22). |
| 10 | Coordinator | `git` | `git push origin <the step-5 commit>:refs/heads/production` |
| 11 | Vercel's build | — | `check-settings` → `next-build` → `migrate-deploy` (three migrations) → `seed-if-empty` (`SEEDED`) → `census`. Then released. |
| 12 | Owner | Vercel | Relay the log's `[vercel-build]`, `[seed]` and `[db:census]` lines (AC-23). **If the seed says `SKIPPED`, stop:** the settings point at a database that already holds an item master. |
| 13 | Owner | browser | Open `https://stock-management-zeta-one.vercel.app/setup` straight away. Create the first `ADMIN`, then sign in. |
| 14 | Coordinator | terminal | The anonymous pass (AC-24), while `SETUP_CODE` is still set. |
| 15 | Owner | Vercel | Delete `SETUP_CODE`. The deletion takes effect at the next deployment. |
| 16 | Owner | `/profiles` | Create the verification `YARD_STAFF` profile (Q4). Staff request profiles; the owner approves them. |
| 17 | Owner | own terminal | Check the pepper backup (AC-27). |
| 18 | Owner | own terminal, Neon | Make the first copy and drill its restore (AC-28). |
| 19 | Coordinator and owner | terminal and browser | The signed-in pass, once a count exists (AC-25). |
| 20 | Owner | Neon, Vercel | The history drill (AC-29), the rollback drill (AC-30) and the cold-start observation (AC-31). |
| 21 | Coordinator | `git` | Commit the confirmed facts and the drill results to `docs/operations.md`, and release them. This is the second deployment AC-23 and AC-30 need. |

**After go-live, a release is:**

1. The feature is signed off, and its commits are on `main` and pushed.
2. If the release carries a migration, the owner first exports a copy (D19).
3. `git push origin main:production` fast-forwards `production`. A non-fast-forward is refused.
4. The build runs, and the seed reports `SKIPPED`.
5. The coordinator runs the anonymous pass with `--expect-commit`.
6. When the release changes anything a staff session is sent, the signed-in pass runs too.

## Backup and restore

- **Layer 1: Neon's 6-hour history (F2 to F4).** This is for a mistake noticed within hours.
  1. Create a branch from `production` as of a time before the mistake (F3).
  2. Run `operator:production -- db:census` against it and compare it with production.
  3. Restore `production` in place (F4), or point Vercel's two strings at the branch and redeploy.

  Everything written after that time is lost.
- **Layer 2: the copy (D19 to D21), the main protection.**
  - **The export:** `operator:production -- db:export --out <file>`, run against production after
    each month's counts are approved and before every release that carries a migration.
  - **Where:** a file outside the repository, in storage the owner controls.
  - **The log:** `docs/operations.md` records each export's date, the file's SHA-256 and the kind of
    storage used, never a path that holds a credential.
- **Restoring production from the copy:**
  1. If the damage is ongoing, roll back the app (R1).
  2. Create a new, empty database inside the `production` branch (F9). The damaged database is
     left untouched.
  3. Run `operator:production -- db:restore --in <file>` against the new database. It applies the
     migrations, inserts every row, and reports every table identical.
  4. Run `operator:production -- db:census` against it and compare with the export's counts.
  5. Put the new database's two strings into the password manager and into Vercel's Production
     settings, then redeploy the current release. Its seed reports `SKIPPED`.
  6. Give one `ADMIN` a PIN with `operator:production -- pin:reset --profile <id>`. That `ADMIN`
     resets everyone's PIN from `/profiles` (D20).
  7. Run the anonymous pass.

  Everything written after the copy was made is lost, and counts entered since must be entered
  again.
- **Secrets kept outside the server.** The owner's password manager holds `AUTH_SECRET`,
  `PIN_PEPPER` and the two production connection strings, plus `SETUP_CODE` until it has been
  used. Losing `PIN_PEPPER` invalidates every PIN. It is recovered as `docs/operations.md` →
  *Recovery from a lost `PIN_PEPPER`* says, with `pin:reset` run through the launcher. Replacing
  `AUTH_SECRET` signs everyone out and makes every device new, so the new-device budget may pause
  sign-ins until an `ADMIN` resumes them (021 S8). AC-27 proves the stored pepper is the live one.
- **What the drills prove:**
  - **The copy drill (AC-28)** proves that a copy taken from production restores, whole, into an
    empty database, and that its counts match. It is the real restore procedure, run against a
    scratch branch.
  - **The history drill (AC-29)** proves that the owner can produce production as it was at a
    time inside the 6-hour window.
  - **Neither proves** that restoring `production` in place works.

## Rollback

- **R1, a bad release, with or without an additive migration.** The owner rolls production back
  in Vercel's dashboard to the previous deployment (V3). No build runs, so no migration runs. The
  previous release works on the newer schema because every migration keeps the previous release
  working (AC-17). The coordinator confirms with `--expect-commit`. The fix goes to `main`, is
  gated, and is released. If Vercel stopped promoting pushes after the rollback, the owner undoes
  that, as `docs/operations.md` records.
- **R2, a migration that damaged data.** Restore the data (Layer 1 within 6 hours, else Layer 2).
  The release that goes out next must not re-apply the damaging migration unchanged. How to change
  it is decided case by case with its author and recorded. Never edit a migration that is applied
  anywhere; write a new one (`docs/conventions.md`).
- **R3, a migration that failed.** The build fails, and the previous release keeps serving.
  Prisma records the failure in `_prisma_migrations`, and every later production build fails at
  `migrate-deploy` until it is resolved.
  - The owner relays the failing statement and error code from the build log.
  - The owner runs `operator:production -- migrate:status`.
  - A migration that left nothing applied is marked with
    `operator:production -- migrate:resolve --rolled-back <migration>`, corrected, gated and
    released.
  - A migration that left part of itself applied is undone with Layer 1, restoring to just before
    that build. The restore also removes the failure record.
- **Never:** force-push `production`; run `prisma migrate reset`, `prisma migrate dev` or
  `db push` against production; put a production string in `.env`; restore a copy into a database
  in use.

## User stories

- As the owner (`ADMIN`), I open `https://stock-management-zeta-one.vercel.app` on my phone or
  laptop, over HTTPS only, and find the 140 items already loaded, so that nobody re-types the item
  master.
- As the owner, I create the first administrator at `/setup` once, and the page is gone for good
  afterwards.
- As a `YARD_STAFF` user, I request a profile and count from the yard on my phone, and no price
  ever reaches the phone.
- As the owner, I can undo a bad release from Vercel's dashboard in a minute, without touching the
  database.
- As the owner, I keep a monthly copy of production's data outside Neon, and I have already
  restored one, so a problem noticed days late is not the end of the data.
- As the coordinator, I can prove what is live and that it is safe, without holding any secret.

## Data touched

- **No schema change and no migration.** `TRUNCATED_TABLES` is unchanged.
- **Read:**
  - the row counts of `Location`, `Supplier`, `ItemType`, `Item` (and how many have
    `needsReview`), `ItemPrice`, `ItemLocation`, `StockCount` by status and `StockCountLine`;
  - `User` by role and status, and each stored `pinKeyId`, compared with the given pepper and
    never printed;
  - `_prisma_migrations` (the applied names);
  - for an export, every row of every other table.
- **Written:** only by #5's existing importer, when the five master tables are all empty (AC-6);
  by `prisma migrate deploy`; by `/setup` and `/profiles` as 021 already specifies; and by a
  restore, **only into an empty schema** (AC-10).
- **Outside the database:** one copy file per export, outside the repository (AC-9).
- **Production, on first use:** three migrations, then 10 suppliers, 19 types, 140 items, 129
  prices and 152 yard links, then the first `ADMIN`.

## Contract

| Artefact | What it is |
|---|---|
| `vercel.json` | `regions`, `buildCommand`, and Git deployments for `production` only (AC-1) |
| `package.json` → `build:vercel` | The runner of AC-5. `buildCommand` calls it. |
| `src/server/deploy/build-plan.ts` | Pure. `planVercelBuild(env: Record<string, string \| undefined>): BuildStep[]`, where `BuildStep` is `"check-settings" \| "next-build" \| "migrate-deploy" \| "seed-if-empty" \| "census"`, plus the checks of AC-3 and AC-4, each returning problems that name a variable and a rule and never a value |
| `src/server/items/item-master-seed.ts`, `scripts/seed-if-empty.ts` | `seedItemMasterIfEmpty(input: { fileName: string; bytes: Buffer }): Promise<{ outcome: "SEEDED" \| "SKIPPED"; counts: MasterCounts }>`. It throws `ConflictError` for a partly filled item master. |
| `src/server/deploy/census.ts`, `scripts/db-census.ts`, `npm run db:census` | `databaseCensus(): Promise<Census>` and its rendering (AC-7) |
| `src/server/deploy/export.ts`, `scripts/db-export.ts`, `npm run db:export -- --out <file>` | AC-9 |
| `src/server/deploy/restore.ts`, `scripts/db-restore.ts`, `npm run db:restore -- --in <file>` | AC-10 |
| `scripts/operator-production.mjs`, `npm run operator:production -- <command> [arguments]` | The launcher of AC-8 |
| `next.config.ts` | `poweredByHeader: false` and the headers of AC-11 |
| `src/app/api/version/route.ts` | `GET` → `200 { "commit": string \| null }` (AC-12) |
| `scripts/verify-deployment.ts`, `npm run verify:deploy -- --url <origin> [--expect-commit <sha>] [--signed-in]` | AC-13 to AC-15 |
| `src/lib/deploy/money-scan.ts` | Pure. `scanForMoney(body: string, contentType: string): Finding[]` (AC-16) |
| `tests/unit/migration-safety.test.ts` | AC-17 |
| `docs/operations.md`, `docs/conventions.md` | AC-17, AC-18 |

- The export and the restore are generic over tables. They name no table or column except
  `User.pinHash` and `User.pinKeyId`, so the money-column scan of 006 AC-31 is not touched.
- Output lines are prefixed `[vercel-build]`, `[seed]`, `[db:census]`, `[db:export]`,
  `[db:restore]` and `[verify]`.

## UI states

This feature adds no screen. What it adds are states of the release.

- **Empty:** Neon's `production` holds no table. The first production build applies three
  migrations, seeds the item master and prints the census. `/setup` is available until the owner
  uses it.
- **Loading:** a build is running, and the previous production deployment keeps serving.
- **Error:** a refused setting, a failed step or a partly filled item master fails the build.
  Nothing is released, and the previous release keeps serving. `verify:deploy`, `db:export` and
  `db:restore` print their failures and exit non-zero.
- **Success:** the build's lines show every step `ok`; both passes of `verify:deploy` exit 0; a
  restore reports every table identical.

## Acceptance criteria

### Phase A — the repository, proved by `init`

1. **AC-1** — **Vercel's settings that can live in the repository do.** `vercel.json` at the root declares `regions` equal to `["lhr1"]`, `buildCommand` equal to `npm run build:vercel`, and Git deployments enabled for the branch `production` and disabled for every other branch, `main` included, in the form Vercel's documentation gives for that, whose address is cited in `progress/impl_deploy.md`. It has no `env` and no `build.env` key. `package.json` gains `build:vercel`, `db:census`, `db:export`, `db:restore`, `operator:production` and `verify:deploy`, and `build` stays exactly `next build`. Neither `init.sh`, `init.ps1` nor any `test:*` script invokes `build:vercel`, `db:export`, `db:restore`, `operator:production` or `verify:deploy`. *Proved by* `tests/unit/deploy-config.test.ts`.
2. **AC-2** — **The build plan depends on where it runs, and only production touches a database.** `planVercelBuild(env)` returns, for `VERCEL_ENV` equal to `production`, exactly `["check-settings", "next-build", "migrate-deploy", "seed-if-empty", "census"]`. For `preview`, `development`, any other value, and unset, it returns exactly `["next-build"]`. `migrate-deploy` runs `prisma migrate deploy`. *Proved by* `tests/unit/vercel-build.test.ts`, one case per value.
3. **AC-3** — **A preview build carrying a database setting does not build.** When `VERCEL` is `1`, `VERCEL_ENV` is not `production`, and any of `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` or `TEST_DIRECT_URL` is set non-empty, `npm run build:vercel` exits non-zero before `next build`. It prints one line per such variable, naming it and saying that preview and development deployments carry no database setting. With `VERCEL` unset, as on a developer's computer, this refusal does not apply. *Proved by* unit tests with sentinel values, asserting that no sentinel appears in the output.
4. **AC-4** — **A production build with incomplete or wrong settings does not build.** With `VERCEL_ENV` equal to `production`, `check-settings` exits non-zero, before `next build`, when any of the following holds:
   - any of `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL` or `PIN_PEPPER` is unset or empty;
   - `TEST_DATABASE_URL` or `TEST_DIRECT_URL` is set;
   - `DATABASE_URL`'s host does not contain `-pooler`, or `DIRECT_URL`'s host does;
   - the two hosts differ once `-pooler` is removed;
   - `AUTH_URL` is not an `https:` origin with no path, query or fragment;
   - `PIN_PEPPER` fails `isUsablePinPepper`;
   - `AUTH_SECRET` is shorter than 32 characters;
   - `SETUP_CODE` is set and shorter than 16 characters once trimmed.

   It lists every problem it finds, each naming the variable and the rule, and prints no value, no host and no part of a value. A complete, well-formed set passes and prints the names it checked. *Proved by* unit tests, one per rule, with sentinel values asserted absent from the output.
5. **AC-5** — **The build stops at the first failed step.** `npm run build:vercel` runs the plan's steps in order and prints `[vercel-build] <step> ok` after each. When a step exits non-zero, it prints `[vercel-build] <step> failed`, exits non-zero and runs no later step. So a failed `next-build` never reaches `migrate-deploy`, and a failed `migrate-deploy` never reaches `seed-if-empty`. `npm run build:vercel -- --dry-run` prints the plan for the current environment and runs nothing. *Proved by* unit tests that drive the runner with stand-in steps exiting 0 and non-zero, and by the dry run under each `VERCEL_ENV` of AC-2.
6. **AC-6** — **The item master is loaded once, and only into an empty database.** `seedItemMasterIfEmpty` reads the row counts of `Supplier`, `ItemType`, `Item`, `ItemPrice` and `ItemLocation`:
   - **All five are zero.** It runs #5's importer on `Samples/Stock @ 01-Sep-2026.xlsx` and returns `SEEDED` with created counts of 10, 19, 140, 129 and 152, and `scripts/seed-if-empty.ts` prints `[seed] SEEDED` with them.
   - **All five are non-zero.** It returns `SKIPPED` and writes nothing, and the script prints `[seed] SKIPPED: item master present` with the five counts. This is proved after an `ADMIN` has renamed an item's description: a dump of the five tables before and after, ids included, is deep-equal. As the non-vacuity half, `importWorkbook` given that same state creates one item.
   - **Any other combination.** It throws `ConflictError` whose message names each of the five tables with its count. It writes nothing, and the script exits non-zero.

   The script exits 0 for `SEEDED` and for `SKIPPED`. *Proved by* `src/server/items/item-master-seed.db.test.ts`.
7. **AC-7** — **The census reports counts and nothing else.** `npm run db:census` prints one `[db:census]` line each, in this order:
   - `locations`;
   - `suppliers`;
   - `item types`;
   - `items`, with how many need review;
   - `prices`;
   - `yard links`;
   - `profiles`, as a count for each role-and-status pair present;
   - `stock counts`, for each status;
   - `count lines`;
   - `migrations`, the number applied and the latest one's name;
   - `pins: <m> of <n> made under the given PIN_PEPPER`.

   It prints no username, display name, price, hash, key id, connection string or host. *Proved by* `src/server/deploy/census.db.test.ts`, against a fixture holding a named profile with a PIN made under the current pepper, a second profile with a PIN made under another pepper, and a priced item. The output says `pins: 1 of 2`, and none of the fixture's usernames, names, price, `pinKeyId` values or the database's host appears in it.
8. **AC-8** — **An operator command against a live database takes its settings at a prompt, never from a file.** `npm run operator:production -- <command> [arguments]` accepts exactly these forms: `db:census`; `db:export --out <file>`; `db:restore --in <file>`; `pin:reset --list`; `pin:reset --profile <id>`; `migrate:status`; `migrate:resolve --rolled-back <migration>`; and `migrate:resolve --applied <migration>`. Anything else exits non-zero before asking for anything, listing the accepted forms. The launcher then:
   - asks, for every form, for `DATABASE_URL` and `DIRECT_URL`; for `db:census` and both `pin:reset` forms, also for `PIN_PEPPER`; and for `pin:reset --profile`, also for `NEW_PIN`. On a terminal, the typed characters are not shown. From input that is not a terminal, it reads one answer per line.
   - refuses an empty answer, and an answer equal to the value `.env` holds for the same name. Each refusal names the variable and prints neither value.
   - runs the command with the answers in that command's environment only, writes no file of its own, and prints no answer.

   *Proved by* `tests/unit/operator-production.test.ts`, covering every accepted form, every refusal, the sentinels never printed and no file written. And by `src/server/deploy/operator-production.db.test.ts`: the launcher is started with `DATABASE_URL` and `DIRECT_URL` absent from its own environment and is given the test database's two strings at the prompt, while `.env` names the development database. `db:census` then reports what the test database holds.
9. **AC-9** — **The copy: every table, one moment, no credential.** `npm run db:export -- --out <file>`:
   - refuses, before connecting, an `--out` inside the repository's working tree or naming a file that already exists;
   - reads, in one read-only repeatable-read transaction, every table of the target schema except `_prisma_migrations`. The set it reads is asserted equal to the models of `prisma/schema.prisma`, so a table left out turns the test red.
   - writes one UTF-8 JSON file holding `format` equal to `macroads-export/1`, `exportedAt`, `migrations` (the applied names, in order), and, for each table, its row `count` and its `rows`. The rows are ordered by primary key, with every value as Postgres renders it in JSON, so a `Decimal(18, 8)` price and a `Decimal(12, 4)` quantity keep every digit.
   - writes `User.pinHash` and `User.pinKeyId` as `null` in every row, and lists both under `omitted` (D20);
   - leaves out every `User` row whose `status` is `PENDING` and records their number as `omittedPendingRequests`, because a pending request holds the requester's PIN hash by the schema's own rule (ruling A1-F1); after a restore, a pending requester asks again;
   - prints the file's path, its SHA-256 and one line per table with its count, and nothing else.

   *Proved by* `src/server/deploy/export.db.test.ts`, against a fixture with at least one row in every table. The fixture includes a profile with a PIN, an `AccountLock`, an `AuthEvent`, a `SetupClaim`, and a signed count whose lines hold the quantity `21.6128` and the snapshot `6.11764706`. The test asserts that:
   - every count equals its table's;
   - those two figures appear exactly;
   - the fixture's `pinHash` and `pinKeyId` values appear nowhere in the file;
   - no value of `DATABASE_URL`, `DIRECT_URL`, `PIN_PEPPER`, `AUTH_SECRET` or `SETUP_CODE` from the test's environment appears in the file or the output;
   - the output holds no username, name or price;
   - each refusal holds.
10. **AC-10** — **A copy restores only into an empty schema, and proves it restored.** `npm run db:restore -- --in <file>`:
    - refuses, before writing anything, when the target schema holds any table. The target schema is `public`, unless the connection string's `schema` parameter names another. So the restore cannot write into a database in use, production included.
    - refuses when the file's `format` is not `macroads-export/1`, when its `migrations` differ from the migration directories under `prisma/migrations/`, or when a table's `count` differs from its number of rows;
    - applies the migrations with `prisma migrate deploy`, then inserts every table's rows in foreign-key order in one transaction. A row the migrations already inserted, such as the two `Location` rows, must equal the file's row with the same id; otherwise the transaction is rolled back and the run exits non-zero. It never updates or deletes a row.
    - reads every table back and compares it row for row with the file, prints `[db:restore] <table>: restored <n>, identical <n>` for each, and exits 0 only when every table is identical;
    - prints no row and no value.

    *Proved by* `src/server/deploy/restore.db.test.ts`, against throwaway schemas on the test database. It covers each refusal, and a round trip of AC-9's fixture, after which a second export equals the first apart from `exportedAt` and `omittedPendingRequests`, because the restored schema holds no pending request (ruling A1-F1). `db:census` on the restored schema then reports AC-9's counts, less the omitted pending requests, and `pins: 0 of 0`. A file with one row tampered to break a constraint leaves no restored row in the target.
11. **AC-11** — **Every response carries the security headers.** `next.config.ts` sets `poweredByHeader: false` and, for the source `/:path*`, exactly these six headers:
    - `Strict-Transport-Security: max-age=63072000; includeSubDomains`
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: same-origin`
    - `X-Frame-Options: DENY`
    - `Content-Security-Policy: frame-ancestors 'none'`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=()`

    *Proved by* a unit test calling the configuration's `headers()`, and by an e2e test that `/sign-in` on the local production build carries all six and no `X-Powered-By`.
12. **AC-12** — **`GET /api/version` names the commit being served.** The route is not under `PROTECTED_PATHS`. It answers `200` with `Cache-Control: no-store` and the JSON body `{ "commit": <value> }`, with no other key. `<value>` is `VERCEL_GIT_COMMIT_SHA` when that is 40 lower-case hexadecimal characters, and `null` otherwise. The route reads no database, no cookie and no other setting. *Proved by* a unit test of the handler with the variable set, unset and malformed, and by an e2e check on the local build that answers `null`.
13. **AC-13** — **The anonymous live check.** `npm run verify:deploy -- --url <origin> [--expect-commit <sha>]` refuses a `--url` that is not `https:`, unless its host is `localhost` or `127.0.0.1`. It runs these checks in this order, prints `[verify] PASS <name>` or `[verify] FAIL <name>: <reason>` for each, and exits 0 only if every check passed:
    - `https-only`: `http://<host>/` answers `301` or `308` with a `Location` on `https://<host>/`.
    - `hsts`: `/sign-in` carries `Strict-Transport-Security` with a `max-age` of at least 31536000.
    - `security-headers`: `/sign-in` carries the other five headers of AC-11 with those values, and no `X-Powered-By`.
    - `csrf-cookie-secure`: `/api/auth/csrf` sets a cookie named `__Host-authjs.csrf-token` with `Secure`, `HttpOnly` and `Path=/`. This is the URL-derived setting that also decides the session cookie's `Secure`.
    - `session-401`: `GET /api/session` answers `401`, and its body has no `id`, `username` or `role`.
    - `api-401`: `GET /api/users` answers `401`.
    - `protected-redirects`: every path in `PROTECTED_PATHS`, read from `src/lib/auth-config.ts`, answers a redirect whose `Location` is `https://<host>/sign-in?callbackUrl=` followed by that path, encoded.
    - `setup-404`: `/setup` answers `404`.
    - `public-no-money`: `/`, `/sign-in` and `/sign-in/create` answer `200`, and AC-16's scanner finds nothing in them.
    - `no-leftovers`: `/.env`, `/.git/config`, `/package.json`, `/prisma/schema.prisma` and `/Samples/Stock%20@%2001-Sep-2026.xlsx` each answer `404`.
    - `region`: the `x-vercel-id` header of the `/api/session` response names `lhr1` as the region that ran the function.
    - `commit`, only with `--expect-commit`: `/api/version` reports that commit.

    *Proved by* `tests/unit/verify-deployment.test.ts`, which runs every check against a local stub HTTP server, once made to pass it and once made to fail it.
14. **AC-14** — **The live check holds no secret.** `scripts/verify-deployment.ts` and every module it imports:
    - read no `.env`: no `loadEnvFile`, no `dotenv`, and no file-system path ending in `.env`. The URL path `/.env`, which `no-leftovers` asks of the server, is not a file path (ruling A2-F2);
    - import nothing from `@/server/` or `@prisma/client`;
    - accept no credential through an argument, a setting or a file;
    - print no cookie value, no `Set-Cookie` header and no excerpt of a response body. A failing check names the path and the rule only;
    - send no request other than `GET` and `HEAD`, apart from AC-15's sign-out, and never read a request's body;
    - contain the string `unitPrice` nowhere.

    *Proved by* a static unit test over the script's files, and by a stub-server test that serves a known cookie value and body text and asserts that neither appears in the output.
15. **AC-15** — **The signed-in pass: a person types, the script checks.** `npm run verify:deploy -- --url <origin> --signed-in` opens a visible Chromium window with a fresh, non-persistent context at `<origin>/sign-in`. It prints `Sign in as a YARD_STAFF profile in the window that opened`, then waits up to five minutes for `GET /api/session` in that context to answer `200`. It never types into, reads or records a form field. It then runs these checks, printing lines as in AC-13:
    - `staff-role`: the session's role is `YARD_STAFF`. Otherwise it reports `FAIL`, signs out and stops.
    - `device-cookie-secure`: the cookie `macroads-device` has `Secure` and `HttpOnly`.
    - `session-cookie-secure`: the cookie `__Secure-authjs.session-token` exists, with `Secure` and `HttpOnly`.
    - `staff-no-money`: it opens `/stock-entry` and `/stock-takes`, every same-origin link under those two paths found on them (at most 50), and `/analysis`, `/item-master`, `/profiles` and `/api/users`. Every response from the origin whose content type is HTML, `text/x-component` or JSON goes through AC-16's scanner, except static files under `/_next/static/`. It prints how many responses it scanned and how many count pages it opened. A `FAIL` names the path only.
    - `signed-out`: it signs out through the page's own sign-out control, after which `GET /api/session` answers `401`.

    Any way to supply a session without a person, if the tests need one, is refused for every origin other than `localhost` and `127.0.0.1`. *Proved by* a test against the local production build with a fixture `YARD_STAFF` session, in which `staff-role`, `staff-no-money` and `signed-out` pass and, over `http`, both cookie checks fail. And by a breach run recorded in `progress/impl_deploy.md`, in which a staff page made to render a price turns `staff-no-money` red.
16. **AC-16** — **The money scanner.** `scanForMoney` reports a finding for a body that contains any of the following:
    - the euro sign, or `&euro;`, `&#8364;`, `&#x20ac;` or `\u20ac` in any letter case;
    - any of the field names `unitPriceSnapshot`, `unitPrice` or `lineValue`;
    - for a JSON body only, any key at any depth that matches `specs/domain-model.md` Part 6's `/price|value|total|amount/i`.

    It reports nothing for a staff-shaped body of item, quantity, unit and note. Its source holds none of the three field names as a literal; they are assembled at run time. *Proved by* `src/lib/deploy/money-scan.test.ts`, with one case per form.
17. **AC-17** — **A destructive migration has to say so.** `tests/unit/migration-safety.test.ts` reads every migration directory later than `20260925120000_pin_profiles`. It fails, naming the migration and the statement, for each statement that does any of the following, unless that migration's SQL holds a line beginning `-- contract-step:`:
    - drops a table, a column or a type;
    - renames anything;
    - changes a column's type;
    - sets a column `NOT NULL`;
    - adds a `NOT NULL` column with no `DEFAULT` in the same statement;
    - adds an enum value;
    - deletes or truncates rows.

    **Non-vacuity:** the same detector flags the `DROP COLUMN` statements of `20260925120000_pin_profiles` and a synthetic example of each shape above. It passes `CREATE TABLE`, `CREATE INDEX`, a nullable `ADD COLUMN` and a `NOT NULL DEFAULT` one. `docs/conventions.md` → *Database* gains the rule: after go-live, a migration must leave the previous release working, and a destructive step ships only after the release that stopped using what it removes. *Proved by* the test named.
18. **AC-18** — **The operations document is the runbook.** `docs/operations.md` gains `## Production`, `## Backup and restore` and `## Rollback`. They carry, in placeholders only:
    - the owner's decisions OD1 to OD3, each with its risk;
    - *Who does what*, including that no secret value ever goes into a chat, a file in the repository or a log;
    - the sentence ``Pushing `main` deploys nothing.``, and the release procedure, including the export before a migration;
    - the settings table of *Environments*;
    - the *Go-live* steps, including what a `SKIPPED` first seed means;
    - how to run both passes of `npm run verify:deploy` and every form of `npm run operator:production`;
    - a table of F1 to F9 and V1 to V8 with a *confirmed on* column;
    - both backup layers, the export schedule, the copy log, and restoring production from the copy, including giving the first `ADMIN` a PIN afterwards;
    - both drills, with what each proves and what it does not;
    - where the secrets and the production strings are kept outside the server;
    - R1 to R3.

    *Proved by* a unit test asserting the three headings and the literals ``Pushing `main` deploys nothing.``, `lhr1`, `stock-management-zeta-one.vercel.app`, `npm run verify:deploy`, `npm run operator:production`, `db:export`, `db:restore`, `-- contract-step:`, `SKIPPED`, each of `OD1` to `OD3`, `F1` to `F9` and `V1` to `V8`. The repository's existing credential and placeholder scans pass over the new text.

### Phase B — go-live, proved by the live check and by recorded observations

19. **AC-19** — **Go-live starts by taking over what Vercel already holds.** In this order:
    - The owner changes the project's production branch from `main` to `production`.
    - The coordinator records in `progress/impl_deploy.md`, from the owner's screenshot, every variable's **name** in each of Production, Preview and Development, and never a value.
    - The owner deletes every one of those variables.
    - If Production or Preview held any, the owner takes the current deployment off them as the dashboard allows on Hobby, and records how (Q9).
    - The coordinator resumes pushing `main` only after that.
    - Afterwards, the coordinator's anonymous request for `/` on the production address returns a page reading `Database configuration missing.`

    *Proved by* the recorded inventory, recorded owner observation and the coordinator's recorded request.
20. **AC-20** — **The audit is recorded before the first release.** In `progress/impl_deploy.md` the coordinator records:
    - that `git ls-files` lists no path ending in `.env`, `.pem`, `.key`, `.p12` or `.pfx`;
    - that a scan, with the credential pattern of `tests/unit/repo-hygiene.test.ts`, of every blob reachable from the commit to be released finds only its documented placeholders;
    - `npm audit --omit=dev` at that date, with each high or critical advisory listed beside whether request input can reach the vulnerable code.

    The owner's go or no-go on that list is recorded next to it (Q6). *Proved by* the recorded run and the owner's recorded decision.
21. **AC-21** — **Neon is confirmed, not assumed.** Before the first release, every row of `docs/operations.md`'s F1 to F9 table holds the value the owner read on Neon's dashboard, with its date. The owner has also observed that the `production` branch holds no table. *Proved by* recorded owner observation. The reviewer checks that no row is unconfirmed.
22. **AC-22** — **Vercel holds production's settings, and nothing else holds any.** The owner records, by name only:
    - V2 to V7 as read, and the plan, Hobby, as the owner's decision OD1;
    - that the production branch is `production`;
    - that the Production environment holds exactly `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL` and `PIN_PEPPER`, plus `SETUP_CODE` until AC-24's last step, with the secrets marked *Sensitive* where V4 says Hobby offers it;
    - that the Preview and Development environments hold none of the eight names of `docs/operations.md` → *Environment*;
    - that the two strings were copied from Neon's `production` branch;
    - that `AUTH_SECRET`, `PIN_PEPPER` and `SETUP_CODE` were generated in the owner's own terminal with the documented command, and stored outside the server before being entered.

    *Proved by* recorded owner observation.
23. **AC-23** — **The first production build migrates, seeds and counts.** The first production build's log, as the owner relays it, shows:
    - `check-settings`, `next-build` and `migrate-deploy` `ok`, with three migrations applied;
    - `[seed] SEEDED` with 10, 19, 140, 129 and 152;
    - a census of 2 locations, 10 suppliers, 19 item types, 140 items with 15 needing review, 129 prices, 152 yard links, no profile and no stock count.

    The coordinator's `npm run db:census` against the development database shows the same lines for locations, suppliers, item types, items, prices and yard links. The next production build reports `[seed] SKIPPED` with the same five counts. *Proved by* the relayed log lines and the coordinator's census, recorded in `progress/impl_deploy.md`.
24. **AC-24** — **Setup happens once, and then the anonymous pass is green.**
    - The owner opens `https://stock-management-zeta-one.vercel.app/setup` with the production `SETUP_CODE`, creates the first `ADMIN` and signs in.
    - Then, while `SETUP_CODE` is still set in production, the coordinator runs `npm run verify:deploy -- --url https://stock-management-zeta-one.vercel.app --expect-commit <the commit at origin/production>`. Because the code is still set, the `404` comes from the rule that an `ADMIN` exists (021 S9). Every check of AC-13 passes and the script exits 0.
    - `git merge-base --is-ancestor` confirms that commit is on `origin/main`.
    - The owner then deletes `SETUP_CODE` from the Production environment.

    *Proved by* the recorded script output and owner observation.
25. **AC-25** — **In production, both cookies carry `Secure` and a staff session is sent no money.** Once at least one stock count exists in production, the coordinator runs the signed-in pass against `https://stock-management-zeta-one.vercel.app`, and the owner signs in, in the window it opens, as a `YARD_STAFF` profile (Q4). Every check of AC-15 passes, including `device-cookie-secure` and `session-cookie-secure`, and the output shows at least one count page opened. This is the production half of 021 AC-16 (`progress/review_pin_auth.md` → *Second pass* → R3). *Proved by* the recorded script output.
26. **AC-26** — **No push other than `production` deploys.** After a push to `main` of a commit that `production` does not hold, the owner observes no new deployment in the Vercel project. If Vercel reports deployments to GitHub, `gh api repos/CarlosStaarthof/stock-management/deployments` lists none for that commit. *Proved by* recorded owner observation and the coordinator's recorded run.
27. **AC-27** — **The off-server `PIN_PEPPER` is the one production uses, and not development's.** The owner runs `npm run operator:production -- db:census` against production, answering `PIN_PEPPER` from the copy kept outside the server. The launcher accepts it, so it differs from development's. The census prints `pins: n of n made under the given PIN_PEPPER`, with `n` at least 1. *Proved by* the relayed census line.
28. **AC-28** — **The first copy exists outside Neon, and it has been restored once.**
    - After the first `ADMIN` exists, the owner runs `npm run operator:production -- db:export --out <file>` against production, with `<file>` outside the repository, in storage the owner controls.
    - Its table counts agree with a `db:census` of production taken straight after.
    - The owner creates a scratch Neon branch from `dev`, creates a new, empty database in it (F9), and runs `npm run operator:production -- db:restore --in <file>` against that database. Every table reports identical, and `db:census` there shows the export's counts with `pins: 0 of 0`.
    - The scratch branch is deleted.
    - `docs/operations.md` records the date, the file's SHA-256, the kind of storage it is kept in, and the drill's result.

    *Proved by* the relayed output lines and recorded owner observation.
29. **AC-29** — **A history drill has been done.** The owner creates a Neon branch from `production` as of a stated past time within the 6-hour window (F2, F3), after the first `ADMIN` was created. The owner then runs `npm run operator:production -- db:census` against that branch. Its lines for locations, suppliers, item types, items, prices and yard links equal production's, and it shows at least one `ADMIN` profile. The time taken and the result are recorded in `docs/operations.md`, and the branch is deleted. *Proved by* recorded owner observation and the relayed census.
30. **AC-30** — **A rollback drill has been done.** Production has two deployments: B, the current one, and A, the one immediately before it, sharing one schema.
    - The owner rolls production back to A in Vercel's dashboard, and the coordinator's `npm run verify:deploy -- --url https://stock-management-zeta-one.vercel.app --expect-commit <A>` passes.
    - The owner returns production to B, and the same run with `--expect-commit <B>` passes.
    - `docs/operations.md` → *Rollback* records what Hobby's rollback offered (V3), whether Vercel stopped promoting new `production` pushes after it, and how that was undone.

    *Proved by* the recorded script outputs and owner observation.
31. **AC-31** — **A cold database does not fail the first person of the day.** After production has had no request for at least one hour, the first sign-in succeeds at the first attempt, with no error page. *Proved by* recorded owner observation, with the time. If it fails, the error shown is recorded and D18 is revisited.

## Out of scope

- **Moving to Vercel Pro** (OD1).
- **A custom domain** (OD3).
- **Continuous integration.** `init` on the coordinator's machine stays the only gate. No GitHub
  Actions workflow is added.
- **Preview environments with a database of their own** (Q5).
- **Automating the copy**, whether on a schedule or by uploading it anywhere. The owner runs it
  by hand (D19).
- **Restoring a copy into a database in use.** AC-10 refuses it by design.
- **Rehearsing a migration** on a branch copy of production before release.
- **Separate database roles** for the runtime and for migrations.
- **A script-source Content-Security-Policy** with nonces (D12).
- **Monitoring**: alerting, log drains, uptime checks, analytics, and firewall rules. The app's
  own sign-in and setup budgets stand.
- **Upgrading the dependencies `npm audit` flags.** The owner decides go or no-go in AC-20 and Q6,
  and the upgrades are a feature of their own.
- **Pinning Node's version.** 002 AC-3 keeps `engines.node` at `>=20`. The build log shows the
  version Vercel used.
- **Re-importing or updating the item master from the workbook after go-live.** AC-6 loads it once.
- **Any change to the product's behaviour, its role rules or the money boundary.** This includes
  the public home page's line saying whether database configuration is present. That line names
  no value, and AC-19 relies on it.
- **Amending `specs/product-brief.md` → *Hosting*,** which still reads Pro. The coordinator
  decides whether to amend it to OD1.
- **The Level 5 manual smoke of `docs/verification.md`.** Its Excel steps need #12.
- Installing the Vercel CLI, `neonctl`, `psql` or `pg_dump`, or giving the coordinator any Vercel
  or Neon token (D2).

## Open questions

**Resolved by the owner on 2026-09-28:**

- **Q1** — The address is `stock-management-zeta-one.vercel.app` (OD3).
- **Q2** — Neon stays on Free (OD2).
- **Q3** — The copy outside Neon is built in #16 (OD2; D19 to D21).

**Recommended** (the owner's answers follow the list):

- **Q4 — The `YARD_STAFF` profile for the signed-in pass.** One dedicated profile, created by the
  owner in `/profiles` with a 6-digit PIN and kept active. The admin section cannot reactivate a
  deactivated profile (021 → *Out of scope*). #16 does not close before the first real count
  exists, because AC-25 needs one count page, and the count page is where a price would leak.
- **Q5 — Preview deployments.** None (D4). If they are wanted later, they get a Neon branch of
  their own, never `dev`.
- **Q6 — Going live with the audit's findings.** On 2026-09-27: 4 high, 3 moderate and 0
  critical, each with a semver-major fix. Go live if the coordinator's AC-20 assessment finds none
  reachable from request input, and schedule the upgrades as their own feature.
- **Q7 — Who else holds the secrets' copies outside the server.** The team's second person too,
  through a shared vault.
- **Q8 — What authorises a release.** The owner's sign-off on a feature also authorises releasing
  it, and the owner can hold any release by saying so.

**New, for the owner:**

- **Q9 — If Vercel holds development's values today, take the live site off them now, before
  Phase A is built?** In that case the public address has been serving the development database:
  its sign-in, its profile requests and, while it had no `ADMIN`, its `/setup`.
  **Recommendation:** yes, at go-live step 3, which AC-19 assumes. Also:
  - confirm that the one `ADMIN` profile and the one stock count now on `dev` are the owner's own;
  - rotating development's secrets is optional, because they never left the owner's accounts.

**Facts before approval:** V5 is confirmed. V2 and V6 were moved to go-live (the coordinator's ruling of
2026-09-28), because D3 and D18 already hold their fallbacks.

**The owner's answers, 2026-09-28:**
- **Q4:** yes, one dedicated test account for now.
- **Q5:** yes, only the live site, with no previews.
- **Q6:** go live, on the condition AC-20 sets.
- **Q7:** no, **only the owner** holds the copies of the secrets. **Risk accepted:** they depend on one person's
  password manager. Losing them means regenerating every secret and resetting every PIN (021 S4).
- **Q8:** yes. The owner's sign-off on a feature also authorises releasing it, and the owner can hold any release by saying so.
- **Q9:** the `ADMIN` on `dev` is the owner's own (`carlos-staarthof`). **Yes, take the live site off development's
  values.** The owner wants everything on Neon. The live site moves to Neon's `production` branch at go-live, and
  whatever Vercel holds now is removed at AC-19's step. Until then, no real data is entered on the live site. The
  laptop holds only connection settings, never data.
- **Where the monthly copy is kept (D19):** in **the owner's Google Drive**, which the owner chose on 2026-09-28 from
  three options: a second Neon project, Google Drive, or both. The owner uploads each export by hand. It is never
  routed through the coordinator or any connector, because the file holds all the business data. The local file
  is deleted once it has been uploaded, and the export prints the SHA-256 that the upload is checked against. The
  restore drill (AC-28) restores a copy downloaded from Drive.

### Findings from Phase A1, ruled by the coordinator, 2026-09-28

- **A1-F1. A copy holding a `PENDING` request could not be restored.** #21's schema requires a
  `PENDING` row to hold the requester's PIN hash (`User_pending_shape`), but D20 writes every
  `pinHash` as `null`. So one pending request would roll back the whole restore. **Ruling: the
  export leaves `PENDING` rows out and counts them** (AC-9 now says so). A pending request is a
  request, not an account: after a restore, the requester asks again.
  - Restoring requests as `REJECTED` was rejected, because it records a decision nobody made.
  - Relaxing the CHECK was rejected, because it weakens a #21 invariant.
  - Keeping the hashes of pending rows only was rejected, because the copy would then hold a
    credential.
- **A1-F3. The deployment rule was checked against Vercel's documentation** (*Git
  Configuration*, updated 2026-08-25). Branch keys use minimatch syntax. Quoting the page: "If a
  branch matches multiple rules and at least one rule is `true`, a deployment will occur." With
  `"**": false` and `"production": true`, only `production` deploys. AC-26 still observes it
  live.
- **A1-F2** (`verify:deploy` exists before its file, which A2 creates) and **A1-F5** (a restore
  rejects a `Location` row that differs from the migration's, which matters only once a future
  feature edits yards) are recorded as they are.

### Findings from Phase A2, ruled by the coordinator, 2026-09-28

- **A2-F1. The `region` check's reading of `x-vercel-id`.** Vercel's *Response headers*
  documentation (updated 2026-08-11) says the header "contains a list of Vercel regions your request
  hit, as well as the region the function was executed in". It does not state the order. **So it
  was observed on the live site on 2026-09-28.** A function response (`/api/session`, `/sign-in`)
  carried `dub1::lhr1::<request id>`, and the static `/` carried `dub1::<request id>`. The
  function's region is therefore the last region code before the request id, which is how
  `functionRegion` reads it. A single code fails closed. The check stays pointed at a function
  route.
- **A2-F2. AC-14's "no path ending in `.env`" against AC-13's `no-leftovers`.** **Ruling: AC-14 is
  about the file system.** The URL path `/.env` in `no-leftovers` is a request to the server, not a
  file the command opens. AC-14 now says so. The implementer's static test already allows exactly
  that one literal, in `LEFTOVERS`. It also asserts that no module of the command imports a
  file-system, process or module-loading API, or reads `process.env`.
- **A2-F3** is an observation, recorded as it is: `test:e2e` imports the pass's modules against
  `localhost`, and nothing in the gate runs `verify:deploy` itself.

## Approved 2026-09-28

The owner approved this spec on 2026-09-28, after two rounds of dashboard facts and answers
(*Open questions*: Q1 to Q9 resolved, and the copy kept in the owner's Google Drive). Phase A may be
built. Phase B is go-live, done together with the owner, step by step.
