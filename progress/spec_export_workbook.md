# Spec 012 — Excel export: full workbook

**Role:** spec-writer (default agent). **Date:** 2026-10-13.
**Feature:** #12 `export_workbook`, spec `specs/features/012-export_workbook.md`.
**Feature status:** `pending` (unchanged). **Spec status:** `missing` → `draft`.
`feature_list.json`'s acceptance array mirrors the 14 criteria.

## Why this feature, and why now

`AGENTS.md` §4 picks the lowest-id feature whose `status` is `pending` and writes its spec
first when it has none. #16 `deploy` is the only feature `in_progress`, and every remaining
criterion (AC-19 to AC-31) is a dashboard/owner observation or a go-live step, so no
repository implementation is available in it. The next `pending` feature is **#12**, whose
spec was `missing`. This note is that spec.

## What the spec decides, and what it defers to the owner

The owner's approved one-line summary (`feature_list.json`) already fixes four things; the
spec records them as OD1–OD4: held-only by default with a "show all" option; the signer and
signature on each yard sheet; only `APPROVED` counts and complete periods contribute; the
file is generated on demand and never stored.

The spec derives everything else from `specs/domain-model.md` rather than inventing it:

- **Sheets and shape** from Part 1 (three sheets, the `A–E` master columns, repeating
  `Qty | Value`, `Summary` rows 3/4/5/7/9, and no `Bal per nl`).
- **Value derivation** from Invariants 1, 2 and 4, and the sum-exact-then-round-once rule
  #9/#11 already use (`roundHalfUp`, `sumDecimals`, `subtractDecimals`).
- **Held-only rows** from Part 5 and `src/lib/held.ts` (`isHeld` / `partitionHeld`).
- **MoM and YoY joined on the period**, refusing across a gap, from Part 4 and #11's rule.
- **ADMIN-only, refused in the service**, from Part 6 and 003 AC-16.
- **The money-list amendments** that a new `unitPriceSnapshot` reader forces on
  `tests/unit/project-contract.test.ts` (the exact lists #4→#5→#6→#9→#11 have grown five
  times). The spec amends them as literals, never as a directory exemption, and keeps the
  `signatureSvg` list at one file by routing the signer through `getLifecycleFacts`.

## What could not be settled without the owner

Three open questions are recorded in the spec:

- **OQ1** — how the **drawn** signature reaches a cell, since ExcelJS cannot embed SVG.
  The recommendation is name + date now, rasteriser later.
- **OQ2** — the default period range (recommended: every period with an `APPROVED` count).
- **OQ3** — whether column E is the item's **current** price while each period's `Value`
  uses that period's frozen snapshot.

## Verification of this spec-writing turn

- `node` parse of `feature_list.json`: valid JSON, `#12` `spec_status` `draft`, its
  `spec_file` exists, still **one** feature `in_progress` (#16).
- `npm run typecheck` exit 0; `npm run lint` exit 0.
- `npm run test:unit`: the only failure is `tests/unit/env-file.test.ts`, which requires a
  real `.env`; this container has none. It is environmental and pre-existing, unrelated to
  this change (see `progress/current.md`).

Nothing under `src/`, `tests/` or `prisma/` was touched. This is spec-lane work only.
