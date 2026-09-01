# CHECKPOINTS.md — Objective criteria for a correct final state

The reviewer walks this list on every feature and marks each item `[x]` or `[ ]` with a
reason. **A feature cannot be approved with any unchecked box in sections C1–C6.**

Copy this list into `progress/review_<feature>.md` and fill it in there — do not edit
this file to record a review.

---

## C1 — Process

- [ ] Exactly one feature was changed in this session.
- [ ] The feature has a spec at `specs/features/NNN-<name>.md`.
- [ ] Every numbered acceptance criterion in that spec is satisfied.
- [ ] `feature_list.json` `acceptance[]` matches the spec's criteria.
- [ ] `progress/impl_<feature>.md` exists and lists the files touched.

## C2 — Verification

- [ ] `init` finishes with `[OK] Environment ready`.
- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm run lint` passes with zero errors.
- [ ] Every new service function has at least one success test **and** one failure test.
- [ ] Tests assert real values, not merely "no exception was thrown".
- [ ] Tests use a real test database or real temp files — the filesystem and the
      database are not mocked.

## C3 — Architecture

- [ ] No React component or route handler imports `PrismaClient` directly.
- [ ] Data access lives in `src/server/`, one module per aggregate.
- [ ] Excel builders in `src/lib/excel/` are pure functions over plain data, with no
      database or network access.
- [ ] No circular imports between `src/server/` modules.
- [ ] Schema changes are accompanied by a Prisma migration, not just a schema edit.

## C4 — Domain integrity

- [ ] Monetary value is never stored — it is derived from
      `quantity × unitPriceSnapshot`.
- [ ] No price, value or total appears anywhere in a `YARD_STAFF` response body.
- [ ] Money columns are `Decimal(18,8)`; quantities `Decimal(12,4)`. Never `Float`.
- [ ] A count cannot reach `SUBMITTED` without a signature, and reopening clears it.
- [ ] `unitPriceSnapshot` is written when a count is submitted, and never rewritten
      afterwards.
- [ ] An approved `StockCount` is immutable.
- [ ] Quantities are stored with enough precision for fractional tonnes
      (e.g. `21.6128`) — no silent rounding.
- [ ] Nothing under `Samples/` was modified.

## C5 — Conventions

- [ ] Naming follows `docs/conventions.md`.
- [ ] Errors are typed domain errors, not bare `throw new Error("...")`.
- [ ] No `console.log` left in `src/`.
- [ ] No TODO without a linked feature id or issue.
- [ ] No secret, connection string, or credential committed. `.env` is gitignored.

## C6 — Session hygiene

- [ ] `progress/current.md` describes what was done, while it was being done.
- [ ] No temporary or scratch files left in the repository.
- [ ] `feature_list.json` status reflects reality.

---

## C7 — Advisory (does not block approval, but must be reported)

- [ ] Empty, loading, and error states exist for every new screen.
- [ ] New screens are usable on a phone-width viewport (yard staff use phones).
- [ ] User-facing numbers are formatted consistently (currency, thousands separators).
