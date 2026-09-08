# 002 — Next.js application scaffold

**Feature id:** 2   **Status:** approved — signed off 2026-09-07
**Depends on:** #1 `repo_harness`

## Post-approval amendment — AC-8 (2026-09-08)

Raised by the reviewer, which nonetheless passed the criterion on intent.

**As approved, AC-8 was unsatisfiable.** It forbade the pattern
`postgres(ql)?://[^\s]*:[^\s]*@` in every tracked file except `.env.example` — but AC-9
*mandates* the fixtures `postgresql://u:p@h/db` and `postgresql://u:p@h2/db`, and those
strings are quoted verbatim in this spec and in `feature_list.json`. The criterion
therefore fired on the contract that defines it and never on code.

The implementer was right to refuse to edit either document to make a criterion pass, and
right to record the tension instead. The wording is now corrected to exempt the documents
that quote the fixtures. **The check itself is unchanged and was not weakened** — the
reviewer proved that by planting four realistic credentials in a scratch copy (in
`README.md`, in `src/`, appended to `.env.example`, and replacing `.env.example`
wholesale) and confirming every one of them fails the suite.

## Amendments made before approval

Three changes to the drafted criteria, agreed with the user:

- **AC-8** gained a second half. As drafted it exempted `.env.example` from the
  credential scan, which meant a real connection string pasted into that file would
  pass — the mistake made on 2026-09-07, an hour before this spec was written. It now
  also asserts the placeholder is intact.
- **AC-11** no longer depends on a documented manual browser install, which would have
  put it in direct conflict with AC-1's requirement that `init` be green on a clean clone.
- **AC-3** no longer pins the developer machine's Node and npm versions, which would go
  stale on any other machine or after an upgrade.

## Purpose

Feature #1 produced a gate that checks documents and skips every step that touches real
tooling: `init` currently prints `[skip] no package.json yet` and `[skip] no 'typecheck'
script yet`. This feature makes that gate bite. It delivers the smallest Next.js
application that can be typechecked, linted, unit-tested, driven by a real browser and
validated against Prisma — so that from #3 onward every claim of "done" is backed by four
commands that actually ran.

Without it there is no place to put `src/server/`, no way to prove a rule such as "`app/`
never imports `PrismaClient`", and no evidence behind any later feature.

## User stories

- As **an agent starting feature #3**, I can run `init` and see `typecheck`, `lint`,
  `test:unit` and `test:e2e` execute rather than skip, so a red gate means my code is
  broken and a green gate means something was checked.
- As **the user**, I can run `npm run dev`, open `http://localhost:3000`, and see the
  application respond — the deployment target is real from the first week, not the last.
- As **an implementer**, I can find the four layers `docs/architecture.md` mandates
  already present, so I add a service to `src/server/` instead of inventing a location.
- As **the user**, I can hand the repository to a second machine and get it running with
  `npm ci` plus a `.env` copied from `.env.example`, without a Docker daemon and without
  anyone reading my secrets out of the repository.

## Data touched

No models, no migrations, no rows. This feature creates `prisma/schema.prisma`
containing **only** a `datasource` and a `generator` block — enough for
`prisma generate` and `prisma validate` to do real work. Every model in
`specs/domain-model.md § Part 3` belongs to #4 `domain_schema`.

Two connection strings are configured, and the difference is load-bearing:

| Variable | Neon connection | Used by |
|---|---|---|
| `DATABASE_URL` | **pooled** (host contains `-pooler`) | the application at runtime |
| `DIRECT_URL` | **unpooled / direct** | `prisma migrate`, which fails through a pooler |

Real values live in `.env`, which is gitignored and denied to agents by
`.claude/settings.json`. Nothing in this feature — no script, no test, no documented
step — may require an agent to read `.env`.

## Contract

**Package scripts** (names are fixed: both `init.ps1` and `init.sh` hard-code the last
four):

| Script | Does |
|---|---|
| `dev` | Next dev server on port 3000 |
| `build` | Next production build |
| `start` | Serve the production build |
| `typecheck` | `tsc --noEmit`, strict |
| `lint` | ESLint over `src/` and `tests/` |
| `test:unit` | Vitest, unit tests only |
| `test:e2e` | Playwright, starting the app itself |

**Layout** (`docs/architecture.md`): `src/app`, `src/components`, `src/lib`,
`src/server`, with `src/server/db.ts` as the sole owner of `PrismaClient` and `@/` as the
absolute import alias for `src/`.

**Routes:** `/` only — a static page naming the product. No domain screen exists yet.

**Exported function introduced:** `src/lib/env.ts`

```
parseEnv(source: Record<string, string | undefined>): { databaseUrl: string; directUrl: string }
```

Pure: it reads the record it is given, never `process.env` directly, so it is testable
without an environment. Throws on a missing or empty variable, naming the variable.

## UI states

The only screen is a static home page, so the states are the framework-level ones:

- **Empty:** not applicable — the page renders no collection. There is no data source yet.
- **Loading:** `src/app/loading.tsx` renders while a segment suspends.
- **Error:** `src/app/error.tsx` renders an error boundary; `src/app/not-found.tsx`
  renders for an unknown route.
- **Success:** `/` returns HTTP 200 and shows the heading `Macroads Stock`.

## Acceptance criteria

1. **AC-1** — `init.ps1` and `init.sh` both exit `0` with `[OK] Environment ready`, and
   neither prints `[skip] no package.json yet`, `[skip] no prisma schema yet`, or
   `[skip] no '<name>' script yet` for any of `typecheck`, `lint`, `test:unit`,
   `test:e2e`. Each run reports `[ok] prisma schema valid`, `[ok] npm run typecheck`,
   `[ok] npm run lint`, `[ok] npm run test:unit` and `[ok] npm run test:e2e`.
2. **AC-2** — `package.json` defines scripts named exactly `dev`, `build`, `start`,
   `typecheck`, `lint`, `test:unit` and `test:e2e`; `npm run <name>` exits `0` for each of
   the last four.
3. **AC-3** — `package.json` declares `engines.node` of `>=20`, and `init` prints
   `[ok] node v<version>` rather than a version failure on any machine whose Node
   satisfies that range. The criterion is the declared range, not the version that
   happens to be installed today.
4. **AC-4** — From a clean clone with no `node_modules`, `npm ci` exits `0`. This requires
   `package-lock.json` to be committed and in step with `package.json`.
5. **AC-5** — **With no reachable database**: given a `.env` whose `DATABASE_URL` and
   `DIRECT_URL` point at a hostname that does not resolve, each of
   `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit`,
   `npm run test:e2e` and `npm run build` still exits `0`, and `init` still prints
   `[OK] Environment ready`. No command introduced by this feature opens a database
   connection.
6. **AC-6** — `prisma/schema.prisma` exists, contains a `generator` block and a
   `postgresql` `datasource` whose `url` is `env("DATABASE_URL")` and whose `directUrl` is
   `env("DIRECT_URL")`, and contains **zero** `model` and zero `enum` declarations.
   `npx prisma generate` and `npx prisma validate` each exit `0`.
7. **AC-7** — `.env.example` is committed and documents four variables —
   `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `AUTH_URL` — with a comment stating that
   `DATABASE_URL` is Neon's pooled connection (host contains `-pooler`), that `DIRECT_URL`
   is the unpooled one, and that Prisma migrations use `DIRECT_URL` because they fail
   through a pooler. Its `DATABASE_URL` and `DIRECT_URL` lines are placeholders, not a
   real host.
8. **AC-8** — `git check-ignore .env` exits `0` and `git ls-files .env` prints nothing.
   No tracked file other than `.env.example`, `feature_list.json` and anything under
   `specs/` matches `postgres(ql)?://[^\s]*:[^\s]*@` — that is, no credential or
   connection string is committed. *(Those three exemptions are not a loophole: they
   are the documents that quote AC-9's mandated fixtures. See the post-approval
   amendment below.)* **And `.env.example` itself is proved to be a placeholder, not a real
   credential**: it still contains the literal string `USER:PASSWORD`, and it contains no
   `neon.tech` host. Without that second half the exemption is a hole — a real connection
   string pasted into `.env.example` would satisfy the first half, which is exactly the
   mistake this criterion exists to catch.
9. **AC-9** — `src/lib/env.ts` exports `parseEnv`. Given
   `{ DATABASE_URL: "postgresql://u:p@h/db", DIRECT_URL: "postgresql://u:p@h2/db" }` it
   returns `{ databaseUrl: "postgresql://u:p@h/db", directUrl: "postgresql://u:p@h2/db" }`.
   Given the same record with `DIRECT_URL` absent, it throws an error whose message
   contains the string `DIRECT_URL`. Both paths are asserted by named unit tests
   (`AC-9: …`), and the success test asserts the returned values, not merely that no
   exception was thrown.
10. **AC-10** — `npm run test:unit` reports at least one passing test with a real value
    assertion, runs to completion in under 30 seconds, and executes **no** file under
    `tests/e2e/`. Unit tests sit beside their source as `<name>.test.ts`; Playwright specs
    live in `tests/e2e/*.spec.ts`.
11. **AC-11** — `npm run test:e2e` starts the application itself (no separately launched
    dev server) and passes **from a clean clone with no manual preparation**. The script
    installs its own browser if it is missing, so `init` is green on a machine that has
    never run Playwright; a documented manual step would put AC-11 in conflict with AC-1,
    which requires `init` green. At least one spec asserts page content, not merely that a
    response arrived.
12. **AC-12** — `npm run dev` serves `http://localhost:3000/` with HTTP `200`, and the
    page contains a level-1 heading whose text is `Macroads Stock`. An unknown route such
    as `/no-such-page` returns HTTP `404` and renders the text from
    `src/app/not-found.tsx`.
13. **AC-13** — Tailwind is applied, not merely installed: a Playwright test asserts that
    the computed `font-size` of the `Macroads Stock` heading is the value its Tailwind
    utility class produces (e.g. `30px` for `text-3xl`), and fails if the stylesheet is
    absent.
14. **AC-14** — `tsconfig.json` sets `"strict": true`. Adding a function with an untyped
    parameter to any file under `src/` makes `npm run typecheck` exit non-zero with an
    implicit-`any` error. Removing that file restores exit `0`.
15. **AC-15** — The `@/` alias resolves to `src/` in all four toolchains: an import of
    `@/lib/env` compiles under `npm run typecheck`, resolves in the Next build, resolves
    in a Vitest unit test, and resolves in code exercised by a Playwright test.
16. **AC-16** — `src/app`, `src/components`, `src/lib` and `src/server` each contain at
    least one committed file, and `src/server/db.ts` exports a single `PrismaClient`
    instance.
17. **AC-17** — The dependency rule is enforced by the linter, not by convention: adding
    `import { PrismaClient } from "@prisma/client"` to any file under `src/app/` or
    `src/components/` makes `npm run lint` exit non-zero with a message naming the
    restricted import, while the same import inside `src/server/db.ts` lints clean.

## Out of scope

- **The Prisma schema and every model in it.** No `User`, `Location`, `Item`,
  `StockCount` or any other model, no enum, no migration, no `migrate dev` run, no seed.
  That is #4 `domain_schema`. This feature ships a datasource and a generator, nothing
  more.
- **Authentication.** `AUTH_SECRET` and `AUTH_URL` appear in `.env.example` so the shape
  of the environment is settled once, but no login page, no session, no Auth.js provider,
  no route protection and no `Role` handling. That is #3 `auth_and_roles`.
- **Any domain screen.** No stock entry, no stock takes, no item master, no analysis,
  no dashboard. The only route is `/`.
- **The workbook seed importer** (#5) and **ExcelJS** (#12) — neither library nor
  directory is created here. `src/lib/excel/` arrives with the feature that needs it.
- **Service tests against a real Postgres** (`docs/verification.md` Level 2). There is no
  schema to test against yet; the first such test arrives with #4.
- **Deployment to Vercel and creation of the Neon `main` branch.** That is #16 `deploy`.
- **CI configuration.** `init` is the gate; a GitHub Actions workflow is not part of this
  feature.
- Styling beyond proving Tailwind is wired: no design system, no component library, no
  layout chrome, no navigation.

## Open questions

None blocking. This feature is specified so that every criterion holds whether or not a
database is reachable, so the outstanding operational item — creating the Neon `dev`
branch and putting its pooled and unpooled URLs into `.env` — does not block
implementation. It does block #4 `domain_schema`, whose first `prisma migrate dev`
needs a live `DIRECT_URL`, and it should be confirmed before that feature starts.

`Q7` and `Q8` in `specs/domain-model.md § Still open` block only M7 and are unrelated
to this feature.
