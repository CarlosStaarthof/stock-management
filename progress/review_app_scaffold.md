# Review — feature 2 app_scaffold

**Verdict:** APPROVED
**Spec:** specs/features/002-app_scaffold.md
**init:** green (`./init.ps1` exit 0, `bash init.sh` exit 0, both `[OK] Environment ready`)
**Reviewed:** 2026-09-08, uncommitted working tree on top of `17feedc`, 19 paths
**Scope:** the 19 paths in `git status --porcelain` are all inside the feature's stated
scope. `init.ps1`, `init.sh`, `docs/`, `.claude/` and `Samples/` are untouched.

Everything below was re-executed by me. Where the implementer reported a mutation
("probe added, gate went red, probe deleted"), I planted my own probe in a scratch copy
outside this repository and watched the gate fail. No file in this repository was
modified by the review; the working tree is byte-identical to the state I received.

## Gate output (mine, not the implementer's)

```
./init.ps1
    [ok]   17 required files present
    [ok]   feature_list.json parses
    [ok]   18 features, 1 in progress
    [ok]   Samples/ has no uncommitted changes
    [ok]   node v24.14.0
    [ok]   node_modules present
    [ok]   prisma schema valid
    [ok]   npm run typecheck
    [ok]   npm run lint
    [ok]   npm run test:unit        (Test Files 4 passed (4) / Tests 17 passed (17), 5.81s)
    [ok]   npm run test:e2e         (4 passed (40.5s))
[OK] Environment ready
init.ps1 exit = 0

bash init.sh
    … same eleven [ok] lines, 17 unit tests, 4 e2e passed (16.9s)
[OK] Environment ready
init.sh exit = 0
```

No `[skip]` line appears in either run.

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | Both gates run by me above: exit 0, `[OK] Environment ready`, `[ok] prisma schema valid`, `[ok] npm run typecheck`, `[ok] npm run lint`, `[ok] npm run test:unit`, `[ok] npm run test:e2e`, and zero `[skip]` lines in either. |
| AC-2 | PASS | `package.json:9-19` defines `dev`, `build`, `start`, `typecheck`, `lint`, `test:unit`, `test:e2e` (plus `postinstall`). I ran the last four to exit 0 (see AC-5 block below) and `npm run build` to exit 0. Pinned by `tests/unit/project-contract.test.ts:21` ("AC-2: package.json defines the seven scripts…"). |
| AC-3 | PASS | `package.json:6-8` = `"engines": { "node": ">=20" }`; asserted as the declared range, not the installed version, by `tests/unit/project-contract.test.ts:30-32` (`toBe(">=20")`). Both my gate runs print `[ok] node v24.14.0`. |
| AC-4 | PASS | Clean copy of the tree (`scratchpad/sc3`) with **no** `node_modules` and **no** `.env`: `npm ci --no-audit --no-fund` → `added 408 packages in 1m`, `npm ci exit = 0`. The `postinstall` `prisma generate` ran inside it without a database. |
| AC-5 | PASS | Scratch copy with `.env` absent and `DATABASE_URL`/`DIRECT_URL` = `postgresql://u:p@macroads-does-not-resolve.invalid:5432/stock?sslmode=require` (`dns lookup: ENOTFOUND` confirmed by me): `npx prisma validate` = 0, `npm run typecheck` = 0, `npm run lint` = 0, `npm run test:unit` = 0 (17 passed, 1.86s), `npm run test:e2e` = 0 (4 passed, 30.9s), `npm run build` = 0 (routes `/` and `/_not-found` prerendered), and `./init.ps1` = 0 printing `[OK] Environment ready`. Import-time safety is also pinned by `src/server/db.test.ts:20-25` (module import leaves `globalThis.macroadsPrismaClient` undefined) and `src/lib/env.test.ts:45-53` (`parseEnv` ignores `process.env`). |
| AC-6 | PASS | `prisma/schema.prisma:12-20`: `generator client`, `datasource db` with `provider = "postgresql"`, `url = env("DATABASE_URL")`, `directUrl = env("DIRECT_URL")`. My own counts: `grep -cE "^\s*model\s" prisma/schema.prisma` = **0**, `grep -cE "^\s*enum\s"` = **0**. `npx prisma validate` = 0 ("The schema at prisma\schema.prisma is valid"); `prisma generate` = 0 via `postinstall` in the AC-4 run. Pinned by `tests/unit/project-contract.test.ts:34-48`, which counts *declarations at line start*, so the file's explanatory comments cannot mask a model. |
| AC-7 | PASS (with a caveat I state below) | `tests/unit/repo-hygiene.test.ts:133-144` asserts `^DATABASE_URL=`, `^DIRECT_URL=`, `^AUTH_SECRET=`, `^AUTH_URL=`, the literal `-pooler`, `/pooled/i`, `/unpooled/i` and `/migrat/i` against the real file, and passes. Placeholder-ness is covered by AC-8's fourth test (every host under `.invalid`). Caveat: `.claude/settings.json` denies `Read(./.env.*)` to me as well, so I could not eyeball the file — my evidence is the executing test plus the four planted-credential mutations under AC-8, all of which failed as they should. |
| AC-8 | PASS on intent; the criterion's literal first half is self-contradictory — see "Spec defect" | Second half, and the real question: I planted realistic credentials in a scratch copy and ran `tests/unit/repo-hygiene.test.ts`. (a) Neon string in `README.md` → FAIL, `expected [ 'README.md' ] to deeply equal []`. (b) Neon string in `src/lib/planted.ts` → FAIL in **two** tests. (c) Non-Neon real credential (`…@db.macroads-prod.example.com:5432/stock`) appended to `.env.example`, `USER:PASSWORD` still present and no `neon.tech` anywhere → FAIL at `repo-hygiene.test.ts:129` (`expected false to be true`, the `.invalid`-host assertion). (d) `.env.example` replaced wholesale by a real credential → FAIL in both the AC-8 and the AC-7 test. Restoring the file returned the suite to 5 passed. So the exemption hole AC-8 exists to close is genuinely closed, including the 2026-09-07 mistake. First half, verified directly: `git check-ignore .env` exit 0; `git ls-files .env` prints nothing; `git grep -l --untracked -E "postgres(ql)?://[^\s]*:[^\s]*@"` returns exactly `.env.example`, `feature_list.json`, `specs/features/002-app_scaffold.md` — no code, no config, no credential. |
| AC-9 | PASS | `src/lib/env.ts:39-43` exports `parseEnv`. `src/lib/env.test.ts:12-22` asserts the *returned* object equals `{ databaseUrl: "postgresql://u:p@h/db", directUrl: "postgresql://u:p@h2/db" }` (fixtures assembled at `env.test.ts:8-9`, values exactly as AC-9 names) plus a shape assertion that the two are not swapped. `env.test.ts:24-37` asserts the missing-`DIRECT_URL` throw is a `MissingEnvVariableError` whose `.variable` is `DIRECT_URL` and whose message contains `DIRECT_URL`. Both test names begin `AC-9:`. |
| AC-10 | PASS | `npm run test:unit` → `Tests 17 passed (17)`, `Duration 5.81s` in the repo and `1.86s` in the scratch copy — both well under 30s. `npx vitest list` collects 17 tests across `tests/unit/repo-hygiene.test.ts`, `tests/unit/project-contract.test.ts`, `src/lib/env.test.ts`, `src/server/db.test.ts` — **no** `tests/e2e/` file (excluded at `vitest.config.ts:18`). Real value assertion: `src/lib/env.test.ts:17`. Playwright specs are `tests/e2e/home.spec.ts`, `tests/e2e/not-found.spec.ts`. |
| AC-11 | PASS | Decisive run: clean copy `sc3` (fresh `npm ci`, no `.env`) with `PLAYWRIGHT_BROWSERS_PATH` pointed at an **empty** directory, i.e. a machine that has never run Playwright. Output: `[e2e] Playwright's Chromium is not present on this machine; installing it.` → `Chrome for Testing 147.0.7727.15 … downloaded to …\pw-browsers\chromium-1217`, then `4 passed (44.4s)`, `test:e2e exit = 0`. No manual step, no separately launched server: `playwright.config.ts:21-28` owns the web server (`command: "npm run dev"`), and in the `sc2` run I confirmed zero listeners on port 3000 beforehand. Content assertions, not just a response: `tests/e2e/home.spec.ts:11`, `:25`, `:35`. |
| AC-12 | PASS | `tests/e2e/home.spec.ts:3-12` asserts `response.status() === 200` and `h1` text `Macroads Stock`; `tests/e2e/not-found.spec.ts:3-10` asserts status `404` on `/no-such-page` and the exact copy from `src/app/not-found.tsx:9`. Both green in every e2e run above, driven against `npm run dev`. |
| AC-13 | PASS, proved by my own mutation | `tests/e2e/home.spec.ts:14-26` asserts `getComputedStyle(h1).fontSize === "30px"` against `text-3xl` at `src/app/page.tsx:25`. I commented out `import "./globals.css"` at `src/app/layout.tsx:4` in the scratch copy and re-ran that spec alone: `1 failed`, exit 1. Restoring the import returned it to green. The test therefore fails when the stylesheet is absent, which is what the criterion asks. |
| AC-14 | PASS, proved by my own mutation | `tsconfig.json:6` `"strict": true` (pinned by `tests/unit/project-contract.test.ts:50-52`). I wrote `src/lib/ac14-probe.ts` containing `export function widthOf(row) { return row.width; }` in the scratch copy: `src/lib/ac14-probe.ts(1,25): error TS7006: Parameter 'row' implicitly has an 'any' type.`, `typecheck exit = 2`. After `rm`, `typecheck exit = 0`. |
| AC-15 | PASS | tsc: `tsconfig.json:17-19` maps `@/*`→`./src/*`; `src/app/page.tsx:3-4` and `src/lib/env.test.ts:3` import through it and `npm run typecheck` = 0. Next build: `npm run build` = 0 with the same aliased imports in `page.tsx`. Vitest: `vitest.config.ts:9-11` mirrors the alias; the 17 unit tests import `@/lib/env` and `@/server/db` and pass. Playwright: `tests/e2e/home.spec.ts:28-36` asserts the rendered output of `EnvStatus`, which only exists because `page.tsx` resolved `@/lib/env` at request time — and additionally asserts the body never contains `postgresql`. Alias mapping pinned by `tests/unit/project-contract.test.ts:54-60`. |
| AC-16 | PASS | `src/app` (6 files), `src/components/EnvStatus.tsx`, `src/lib/env.ts`, `src/server/db.ts` all present and non-ignored (they appear under `git ls-files --others --exclude-standard`, i.e. the first commit will carry them). `src/server/db.ts:22-27` memoises one client on `globalThis`; `src/server/db.test.ts:27-35` asserts `getDb() === getDb()` and that the `globalThis` slot holds that same object. See Observation 3 on the `Proxy` export. |
| AC-17 | PASS, proved by my own mutation | `eslint.config.mjs:15-41` scopes `no-restricted-imports` for `@prisma/client` (and `.prisma/client` and their subpaths) to `src/app/**` and `src/components/**`. In the scratch copy I added `import { PrismaClient } from "@prisma/client";` to `src/app/ac17-probe.ts` **and** `src/components/Ac17Probe.tsx`: `npm run lint` exited **1** with, for each file, `'@prisma/client' import is restricted from being used. PrismaClient belongs to src/server/ only. Import a service from '@/server/…' instead; see docs/architecture.md (dependency rule)  no-restricted-imports` — `✖ 2 problems (2 errors, 0 warnings)`. That same run linted `src/server/db.ts:1`, which carries the identical import, **clean**. After deleting both probes, `lint exit = 0`. |

## Spec defect (for the leader, not the implementer)

AC-8 forbids any tracked file other than `.env.example` from matching
`postgres(ql)?://[^\s]*:[^\s]*@`, while AC-9 mandates the fixtures
`postgresql://u:p@h/db` and `postgresql://u:p@h2/db`, which the spec itself
(`specs/features/002-app_scaffold.md:143-144`) and `feature_list.json` quote verbatim.
My own scan confirms the only files matching the pattern are `.env.example` (exempt),
`feature_list.json` and `002-app_scaffold.md`. AC-8 as written is therefore
unsatisfiable: it fires on the contract that defines it, never on code.

I judged the implementer's resolution and it is **not** a weakened check:

- the detector is AC-8's regex character for character (`repo-hygiene.test.ts:26`);
- outside `.env.example`, a hit is forgiven only if the user-info is exactly `u:p` or
  `USER:PASSWORD` **and** the host contains no dot (`:70-76`) — an accidentally pasted
  real credential satisfies neither, as mutations (a) and (b) demonstrate;
- `src/`, `tests/`, `scripts/`, `prisma/` and root configs get no allowance whatsoever
  (`:102-114`), which mutation (b) triggers;
- the `.env.example` exemption is closed by `USER:PASSWORD` present, `neon.tech` absent
  **and** every host under `.invalid` (`:116-131`) — mutation (c), a real non-Neon
  credential in `.env.example`, is caught by the last of those three, which is stricter
  than the two literal checks AC-8 asks for.

The implementer was right not to edit the spec or `feature_list.json` to make a criterion
pass. The wording should be amended by whoever owns the spec — suggest exempting
`specs/**` and `feature_list.json`, which quote AC-9's mandated fixture — so that a future
reviewer is not asked to satisfy two clauses that contradict each other. I have not
touched either document.

## Checkpoints

- C1.1 [x] Only feature #2 was changed; the 19 dirty paths are all scaffold, its tests,
  its spec, its progress notes, `README.md` and `.env.example`.
- C1.2 [x] `specs/features/002-app_scaffold.md`, approved 2026-09-07.
- C1.3 [x] All 17 criteria satisfied — table above.
- C1.4 [x] `feature_list.json` `acceptance[]` reproduces the spec's 17 criteria verbatim
  (`git diff -- feature_list.json`), `spec_status: "approved"`, `status: "in_progress"`.
- C1.5 [x] `progress/impl_app_scaffold.md` exists and lists every file; I verified the
  list against `git status --porcelain` and found no undisclosed file. One correction:
  the report says `feature_list.json` was "not modified", and it is indeed dirty versus
  `17feedc` — but the diff is the leader's spec mirror, not implementation work.
- C2.1 [x] `[OK] Environment ready` from both `init.ps1` and `init.sh`, and again from
  `init.ps1` in a copy with no `.env` and an unresolvable host.
- C2.2 [x] `npm run typecheck` exit 0, zero errors.
- C2.3 [x] `npm run lint` exit 0, `--max-warnings 0`.
- C2.4 [x] `parseEnv` is the only new exported function with failure modes: success
  (`env.test.ts:12`), missing variable (`:24`), empty variable (`:39`). `getDb` has no
  failure mode that does not require a database; its success path is asserted at
  `db.test.ts:27`.
- C2.5 [x] Assertions are on real values: `env.test.ts:17` on the returned object,
  `home.spec.ts:25` on a computed `font-size`, `project-contract.test.ts:59` on the
  parsed alias. No test settles for "did not throw".
- C2.6 [x] Nothing is mocked. `repo-hygiene.test.ts` shells out to real `git` and reads
  real files; `project-contract.test.ts` reads `package.json`, `schema.prisma`,
  `tsconfig.json` off disk; the e2e suite drives a real browser against a real server.
  No database is required at this stage and none is faked.
- C3.1 [x] `grep -rn "@prisma/client" src/` returns only `src/server/db.ts:1`, and the
  rule is enforced by ESLint, which I proved fails on a planted import (AC-17).
- C3.2 [x] `src/server/db.ts` is the sole data-access module; no aggregate services exist
  yet (they are #3/#4).
- C3.3 [x] N/A — `src/lib/excel/` does not exist; the spec puts it out of scope.
- C3.4 [x] No cycles: `src/server/` imports nothing from `src/app` or `src/components`.
- C3.5 [x] N/A — the schema declares zero models, so there is no table change to migrate.
  `prisma/migrations/` correctly does not exist.
- C4.1–C4.7 [x] N/A — no model, no money column, no `StockCount`, no response body with a
  price. Nothing in this feature can violate them; `src/app/page.tsx:13-20` reduces the
  env to a boolean before render and `home.spec.ts:36` asserts the page body never
  contains `postgresql`.
- C4.8 [x] `Samples/` untouched — both gates report `Samples/ has no uncommitted changes`
  and `git status --porcelain` lists nothing under it.
- C5.1 [x] `EnvStatus.tsx` PascalCase; `env.ts`, `db.ts` lowercase module names; tests
  mirror their source (`env.test.ts` beside `env.ts`).
- C5.2 [x] `MissingEnvVariableError` (`src/lib/env.ts:21-29`) names the offending
  variable; no bare `throw new Error("…")` anywhere in `src/`.
- C5.3 [x] No `console.log` under `src/`. The only one is `scripts/run-e2e.mjs:42`, which
  is a CLI script, not application code, and its output is the install notice AC-11 wants.
- C5.4 [x] No `TODO` in `src/`, `tests/` or `scripts/`.
- C5.5 [x] `.gitignore:13-16` ignores `.env` and `.env.*` while un-ignoring
  `.env.example`; `git check-ignore .env` = 0, `git ls-files .env` empty; no credential in
  any file git would carry, proved by four planted-credential mutations.
- C6.1 [x] `progress/current.md` carries the plan written before the work and a work log
  written during it, including the AC-8/AC-9 tension at the moment it was found.
- C6.2 [x] No scratch files: `git status --porcelain` is exactly the 19 expected paths;
  both mutation probes named in the implementer's report are gone, and my own probes were
  created only in `scratchpad/`.
- C6.3 [x] `feature_list.json` says `in_progress`; closing it is the leader's step, not
  the implementer's and not mine.
- C7 (advisory) [x] `loading.tsx`, `error.tsx` and `not-found.tsx` all exist and render
  distinct, testable content. The single screen is `max-w-2xl p-8` and readable at phone
  width. No user-facing numbers yet.

## Required changes

None. Approved as it stands.

## Observations (non-blocking)

1. **`.env.example` could not be eyeballed by me either.** `.claude/settings.json` denies
   `Read(./.env.*)`, which catches the committed placeholder as well as the secret, and
   the denial also blocks `git grep -- .env.example`. The implementer asked the reviewer
   to eyeball the rewritten file (impl report, Deviation 4); I could not, and I record
   that rather than pretend otherwise. What I *can* evidence is stronger than a glance:
   the AC-7/AC-8 tests execute against the real file, and all four credential-planting
   mutations made them fail. If the user wants the old placeholder content compared, that
   needs a human — or a narrowing of the deny rule to `.env` alone, which would be a
   sensible harness change for a later session.
2. **AC-10's "unit tests sit beside their source"** is honoured by `env.test.ts` and
   `db.test.ts`. `tests/unit/repo-hygiene.test.ts` and `tests/unit/project-contract.test.ts`
   have no source module — they assert facts about the repository itself. That is a
   reasonable reading of the criterion, not a violation, but it is worth settling as a
   convention before more repo-fact tests appear.
3. **`src/server/db.ts:29-37` exports a `Proxy`, not a bare `PrismaClient`.** AC-5 forces
   this: constructing at import time would read `DATABASE_URL` in every command. The
   singleton property AC-16 cares about is asserted (`db.test.ts:33-34`). Two things for
   later features to keep in mind: `db` cannot be used with `instanceof`, and anything
   that destructures methods off `db` gets a bound function, which is fine but worth
   knowing.
4. **The hygiene scan skips files over 8 MB** (`repo-hygiene.test.ts:40, 58`). Nothing
   tracked today is close to that, and a credential inside a binary workbook would not be
   found by a UTF-8 line scan anyway — but if a large text asset is ever committed, that
   limit is the blind spot.
5. **`MissingEnvVariableError` lives in `src/lib/env.ts`,** not in the
   `src/server/errors.ts` taxonomy `docs/architecture.md` mandates for services. Correct
   for now — `parseEnv` is a lib function, not a domain service — but when
   `src/server/errors.ts` arrives with #3/#4, decide deliberately whether this joins it.
6. **`next-env.d.ts` is untracked and should go into the first commit.** `tsconfig.json`
   includes it and Next regenerates it; the implementer flagged this and I agree.
7. **Version pinning is one major behind on several tools** (Next 15 vs 16, Prisma 6 vs 8-rc,
   ESLint 9 vs 10, TS 5.9 vs 7). Deliberate and documented in the impl report. `npm install`
   emits an ESLint support warning; it does not affect the gate. Upgrading is its own chore.
