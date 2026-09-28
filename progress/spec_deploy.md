# Spec notes — #16 `deploy`

Spec: `specs/features/016-deploy.md` (`spec_status: draft`, `status: pending`). It has 27
criteria, mirrored verbatim into `feature_list.json` → id 16 `acceptance[]`. Multi-line criteria
keep their bullets, joined with `\n`.

- **Phase A** (AC-1 to AC-16) is repository work that `init` proves.
- **Phase B** (AC-17 to AC-27) is go-live, proved by the live script and by recorded owner
  observations.

No domain question blocks the feature: `specs/domain-model.md` → *Still open* holds only Q7 and
Q8, both of them M7.

## Verified, not taken from the brief

- **The repository.** `gh repo view` shows it is private, the default branch is `main`, and it
  was pushed at 2026-09-26 23:14 UTC. Local `main` equals `origin/main` (`713b5a5`). There is no
  `.github/`, no GitHub deployment and no webhook.
- **No secret in history, by pattern.** I scanned the patches of all 46 commits for
  connection-string shapes, printing classes and hosts only. Every hit has placeholder user-info.
  No tracked file is named `.env*`, `.pem` or `.key`.
- **Tools.**
  - `gh` 2.95.0 is signed in as `CarlosStaarthof`, with the scopes `repo` and `workflow`.
  - Also present: `git` 2.53.0, `node` 24.14.0, `npm` 11.12.0, `curl` 8.18.0 and Playwright's
    Chromium.
  - **Absent:** `vercel`, `neonctl`, `psql`, `pg_dump`.
- **Development census**, from a read-only count through Prisma: 140 items (15 need review), 19
  types, 10 suppliers, 129 prices, 152 links and 2 locations. The brief's numbers hold.
- **The seed.** It is idempotent on an unchanged database (005 AC-21). **It is not safe to re-run
  after go-live**, because its second matching pass is by description, so a renamed item would be
  re-created. The spec therefore guards it: the seed runs only when all five master tables are
  empty.
- **The two cookies.** Both get `Secure` from the URL Auth.js derives, which comes from `AUTH_URL`
  or else from the forwarded headers. **Both are set only by a successful sign-in.**
- **`npm audit --omit=dev`:** 4 high, 3 moderate, 0 critical. npm's suggested fix for each is a
  semver-major change.

## The brief's asks that collided, and how the spec resolves them

1. **"A script that needs no secret" against "the Secure cookies" and "no euro on a YARD_STAFF
   page".** Neither check can be made without a signed-in staff session. The spec splits the live
   check in two:
   - an anonymous pass the coordinator runs unattended;
   - a signed-in pass that opens a visible browser. The owner types the PIN into the page; the
     script only inspects the cookies' flags and the responses. The script holds no secret.

   The anonymous pass also checks Auth.js's `__Host-` CSRF cookie. That cookie shares the
   session cookie's `Secure` switch, so it is supporting evidence, not the proof.
2. **Operator scripts against production had no safe route.** 021 S4's recovery ("run
   `pin:reset`") would need production's strings in `.env`, where the next e2e run writes
   fixtures, or on a command line, where shell history keeps them. The spec adds a launcher,
   `operator:production`, that asks for them at a hidden prompt, accepts five command forms, and
   refuses a value equal to `.env`'s.
3. **Migrations run in the build, and app rollback depends on each migration keeping the previous
   release working.** The spec makes that rule checkable: a new migration containing a
   destructive statement must carry a `-- contract-step:` line (AC-15).

## Decisions and the tradeoff each accepts (details in the spec, D1 to D18)

- **D1, D2 — The owner holds every account and secret; the coordinator holds no Vercel or Neon
  token and installs neither CLI.** Every dashboard step waits for the owner, who also relays
  build-log lines.
- **D3 — Vercel deploys the git branch `production`. `main` deploys nothing.** There is one more
  branch, and production can lag `main`. The gain is that no push of unreviewed work is ever a
  release.
- **D4 — No previews,** with three guards. There is no pre-production address for phone tests.
  Pointing previews at `dev` was rejected: `dev` is shared, a preview is internet-reachable, and
  a preview would migrate `dev`.
- **D6 — `AUTH_URL` is the production `https:` origin.** Changing the domain later signs everyone
  out and makes every device new.
- **D7 — The region is `lhr1`, beside Neon London.** The Irish yards cross the sea once per
  request rather than once per query.
- **D8 — `migrate deploy` runs in the production build after `next build`, using `DIRECT_URL`.**
  The old release briefly runs on the new schema, hence AC-15. A failed migration blocks later
  builds until it is resolved.
- **D9 — The seed runs in the build, only into an empty item master.** A no-op data step stays in
  every build.
- **D10, D11 — A read-only census, and the launcher.** Each is one more script.
- **D12 — Security headers, without a script-source Content-Security-Policy.** Defence in depth
  against script injection is deferred.
- **D13 — A public `/api/version`.** Anyone can see the live commit hash; the repository is
  private.
- **D14 — Two live passes.** The signed-in half needs the owner at the keyboard.
- **D15 — Backups are Neon's own window, plus the secrets in the owner's password manager, plus a
  drill.** Until Q3 is answered, Neon holds the only copy of the data.
- **D16 — The schema only moves forward.** A bad migration is fixed forward or by a data restore.
- **D17 — `SETUP_CODE` is deleted after setup.**
- **D18 — Both production strings carry `connect_timeout=15`.** A dead database takes 15 s to
  report, but a waking Neon compute does not fail the day's first sign-in.

## What the owner must decide (the spec's Open questions)

- **Q1 — The production address:** `vercel.app` or a Macroads subdomain. Decide before staff
  sign in. Recommended: a subdomain if DNS access exists.
- **Q2 — Neon Free or a paid plan,** decided on the confirmed facts F1 to F8. Recommended: stay
  on Free only if the restore window is at least 7 days and `dev`/test usage cannot suspend
  `main`.
- **Q3 — A data copy outside Neon.** Recommended: yes, monthly, as a later feature.
- **Q4 — The `YARD_STAFF` profile for the signed-in pass.** Recommended: one dedicated profile,
  kept active, since the admin section cannot reactivate a profile. Also: may #16 close before
  the first real count? Recommended: no.
- **Q5 — Confirm no previews.**
- **Q6 — Go or no-go on the audit's findings.** Recommended: go, if none is reachable from
  request input.
- **Q7 — Should a second person hold the secret backups?** Recommended: yes.
- **Q8 — Does a feature's sign-off also authorise its release?** Recommended: yes.

## For the coordinator

- **Phase A is sizeable.** It adds eight artefacts, among them the build runner and plan, the
  guarded seed, the census, the launcher, the headers, the version route and the verify script,
  plus the migration guard and the docs. Two implementer phases would fit:
  - A1: build, seed, census, launcher;
  - A2: headers, version, verify script, migration guard, docs.
- **The development database has changed since `progress/current.md`'s last entry.** It now
  holds **1 profile, an `ADMIN`**, so `/setup` on `dev` has been completed. It also holds
  **1 stock count with 82 lines**.
- **Phase B cannot finish until a real count exists in production** (AC-22, Q4). #16 may
  therefore stay `in_progress` for some days after go-live.
- **Token cost of this task:** not measurable from inside the agent. Read it from the transcript.

## Files written

- `specs/features/016-deploy.md` (new)
- `feature_list.json` (#16: `spec_status` `draft`, 27 criteria in `acceptance[]`; no other entry
  touched)
- `progress/spec_deploy.md` (this file)

## Revision of 2026-09-28

The spec was rewritten with the owner's dashboard facts and decisions. It is still `draft`. It
now has **31** criteria, re-mirrored into `feature_list.json` → #16. The change to
`progress/current.md` in the working tree is not mine.

### What changed

- **The Neon branch is `production`, not `main`.** Every mention is corrected. *Environments*
  now says that git's `production` is what Vercel releases, Neon's `production` is the database,
  git's `main` releases nothing, and Neon has no `main`.
- **The facts are recorded with their dates.**
  - A new table holds the 2026-09-28 dashboard facts and the coordinator's anonymous probe.
  - The F table carries values where they are known: F1 Free; F2 6 hours; F5 the three branches;
    F6 usage; F7 0.25 ↔ 2 CU; F8 London, Postgres 18, `production` is the default branch with no
    activity. Each unknown row says when it must be confirmed.
  - **F9 is new:** whether an empty database can be created inside a branch. The restore needs it.
  - The V table now runs V1 to V8. V1 (Hobby) is recorded and is no longer a requirement. V2, V5
    and V6 are marked **needed before approval**.
- **The owner's decisions are OD1 to OD4, each with its risk.**
  - **OD1, Hobby.** The owner accepted the commercial-use risk. Every assumption that needed a Pro
    feature was re-checked:
    - D3's production-branch setting is V2. If Hobby lacks it, the recommended fallback is that
      `main` stays the production branch and is pushed only to release.
    - D7's `lhr1` is V5. If Hobby cannot place functions there, D7 is re-opened.
    - Instant Rollback is V3. The drill now uses only the deployment immediately before the
      current one.
    - *Sensitive* settings are V4.
    - **D18 now depends on V6.** If Hobby's maximum function duration is at most 20 s,
      `connect_timeout` is set 5 s below it.
  - **OD2, Free plus a monthly copy.** Q2 and Q3 are resolved. The copy is in #16 (D19 to D21;
    AC-9, AC-10, AC-28).
  - **OD3, the address `stock-management-zeta-one.vercel.app`.** `AUTH_URL` is fixed to it, and
    the Phase B criteria name it.
  - **OD4.** Q4 to Q8 are marked "Recommended; the owner confirms at approval", with their
    recommendations unchanged.
- **The copy (D19 to D21).**
  - **The export:** `db:export`, run through `operator:production`. It writes one JSON file
    outside the repository, holding every table except `_prisma_migrations`, whose names it
    records instead. It reads at one repeatable-read moment, keeps Decimals exact, and prints
    counts and a SHA-256 only.
  - **Schedule:** after each month's approvals, and before every release that carries a
    migration.
  - **`pinHash` and `pinKeyId` are omitted (D20).** The tradeoff: after a restore, every person
    needs a new PIN (021 S4's path, starting with `pin:reset` through the launcher). In exchange,
    the copy holds no credential and need not be kept apart from the pepper.
  - **The restore: `db:restore`.** It writes only into a schema with no table, so it can never
    write into production. It applies the migrations, inserts the rows in one transaction, never
    updates or deletes, then reads every table back and compares it row for row.
  - **The drill** restores into an empty database on a scratch branch made from `dev`.
- **Go-live now starts by taking over Vercel (AC-19).** The steps are: change the production branch
  to `production`; inventory the variable names; delete every variable; contain the live
  deployment if it held values; then resume pushing. The proof is that `/` reads
  `Database configuration missing.` The owner's "Enter no setting in the import form" step is gone,
  because the project already exists.
- **The launcher.** It gains `db:export` and `db:restore`, eight forms in all. It now asks for
  `PIN_PEPPER` only for `db:census` and `pin:reset`.
- **Renumbering.** Phase A is AC-1 to AC-18; the export and restore are AC-9 and AC-10. Phase B
  is AC-19 to AC-31. AC-19 (take-over) and AC-28 (the copy and its drill) are new. The Neon
  point-in-time drill is kept as AC-29, within the 6-hour window.
- **New Q9.** If Vercel has held development's values, take the live site off them now. The
  recommendation is yes, and the owner confirms that the `ADMIN` and the count on `dev` are their
  own. The public site may have been serving `dev`'s sign-in, its profile requests and, while
  `dev` had no `ADMIN`, its `/setup`.

### Still open

- **Before approval:** V2, V5 and V6, plus Q4 to Q9 confirmed.
- **Before go-live:** F4, F6, F8's table check and storage limit, V4 and V7.
- **Before the drills:** F3, F5 and F9, and V3.
- **The product brief still says Vercel Pro.** Whether to amend `specs/product-brief.md` →
  *Hosting* to OD1 is the coordinator's decision, and it is listed as out of scope here.
