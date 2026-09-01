# CLAUDE.md

**Start by reading [`AGENTS.md`](AGENTS.md).** It is the navigation map for this
repository and it governs how work is done here.

## What this project is

A stock management web app for Macroads, replacing a hand-filled Excel workbook.
Users record yard stock counts on phone or laptop; the dashboard computes the totals
and variances; Excel becomes an export, not the system of record.

See `specs/000-product-brief.md`.

## Stack

- Next.js (App Router) + TypeScript
- Prisma + PostgreSQL (Docker locally, Neon in production)
- Tailwind CSS
- ExcelJS for `.xlsx` generation
- Vitest (unit/integration) + Playwright (e2e)

## The three things that matter most here

1. **Spec-driven.** No feature is implemented before `specs/NNN-<feature>.md` exists
   with numbered, testable acceptance criteria. The spec is the contract.
2. **Role separation.** The leader does not implement, the implementer does not
   self-approve, the reviewer does not edit code. See `.claude/agents/`.
3. **Verification over assertion.** You do not say "it works" — you prove it.
   `init` must be green. See `docs/verification.md`.

## Anti-broken-telephone rule

When you launch subagents, instruct them to **write their findings to a file** under
`progress/` and return only a reference such as
`done -> progress/explore_pricing.md`. Substantive content must never travel through
chat, where it degrades on every hand-off.

## Never

- Modify anything under `Samples/` — that is the original workbook.
- Import `PrismaClient` from a React component or a route handler. Data access goes
  through `src/server/`.
- Store a computed `value` column. Value is always `quantity × unitPriceSnapshot`,
  derived on read.
