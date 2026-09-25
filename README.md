# Macroads Stock Management

A stock management web app for two road-marking yards (Dublin and Clonmel), replacing a
hand-filled Excel workbook. Yard staff enter counts on a phone; the dashboard computes
the totals and variances; Excel becomes an export rather than the system of record.

It is also a **Harness Engineering** exercise: this repository is deliberately built as
a system that AI agents can work in autonomously and verifiably. The harness follows
[betta-tech/ejemplo-harness-subagentes](https://github.com/betta-tech/ejemplo-harness-subagentes),
with Spec-Driven Development layered on top.

## Start here

| If you are… | Read |
|---|---|
| An AI agent | [`AGENTS.md`](AGENTS.md) — the navigation map |
| A developer, new to the project | [`specs/product-brief.md`](specs/product-brief.md) |
| Working on the schema | [`specs/domain-model.md`](specs/domain-model.md) |
| Reviewing someone's work | [`CHECKPOINTS.md`](CHECKPOINTS.md) |

## Verify the environment

```powershell
./init.ps1     # Windows
./init.sh      # macOS / Linux
```

Must print `[OK] Environment ready`. Nothing is done until it does.

## Run the app

```powershell
npm ci                      # installs dependencies and generates the Prisma client
# create .env before the next step: see below
npm run dev                 # http://localhost:3000
```

`.env` is the only settings file, and it is never committed. Create it from
[`docs/operations.md` → *Environment*](docs/operations.md#environment), which lists the
eight settings, what each is for and how to make each one.

Node 20 or newer. No Docker: Postgres is a Neon branch, not a local container. Nothing
in the checks needs a reachable database — `npm run typecheck`, `npm run lint`,
`npm run test:unit`, `npm run test:e2e` and `npm run build` all pass without one, and
`npm run test:e2e` installs its own browser the first time it runs. `npm run test:unit`
does need `.env` to exist: it checks that the eight settings are there, naming any that is
missing and printing no value.

## How work happens here

Three ideas, and they are the point of the project as much as the app is:

**1. Repository as system.** `AGENTS.md`, `feature_list.json`, `CHECKPOINTS.md` and
`init` define the workflow. An agent that reads only `AGENTS.md` can find everything
else it needs, when it needs it — progressive disclosure, not a wall of rules.

**2. Role separation.** The leader does not implement, the implementer does not
self-approve, the reviewer does not edit code. Definitions in
[`.claude/agents/`](.claude/agents/).

**3. Spec first.** No feature is implemented before `specs/features/NNN-<name>.md` exists
with numbered, testable acceptance criteria. The spec is the contract; the reviewer
checks against it, not against taste.

### The anti-broken-telephone rule

Subagents write their results to files under `progress/` and return a single line such
as `done -> progress/impl_entry_start.md`. Substantive content never travels through
chat, where it degrades on every hand-off.

### The loop

```
spec-writer  →  specs/features/NNN-<name>.md          (approved by a human)
     ↓
implementer  →  code + tests            →  progress/impl_<feature>.md
     ↓
reviewer     →  APPROVED / CHANGES      →  progress/review_<feature>.md
     ↓
close        →  feature_list.json done  →  progress/history.md
```

## Repository layout

```
AGENTS.md            navigation map for agents
CLAUDE.md            project rules for Claude Code
CHECKPOINTS.md       objective "correct final state" criteria
feature_list.json    scope control — one feature at a time
init.ps1 / init.sh   the single verification gate
.claude/agents/      leader, explorer, spec-writer, implementer, reviewer
docs/                architecture, conventions, verification, glossary
specs/               one spec per feature; the contract
progress/            current session state + append-only history
src/                 app/ (routes), components/, lib/, server/ (the only Prisma layer)
tests/               unit/ (Vitest) and e2e/ (Playwright)
prisma/              schema.prisma
scripts/             helpers invoked by npm scripts
Samples/             the original workbook — READ ONLY
```

## Status

Milestone M0, feature #2 `app_scaffold`. See `feature_list.json`.
