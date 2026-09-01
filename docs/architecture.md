# Architecture — what "good work" means in this repository

## The shape

```
src/
├── app/            Next.js App Router. Pages, layouts, route handlers, server actions.
├── components/     Presentational React components. No data fetching.
├── server/         Domain services. THE ONLY LAYER THAT TOUCHES PRISMA.
│   ├── db.ts       PrismaClient singleton
│   ├── items/      item master: queries + mutations + validation
│   ├── counts/     stock counts: create, enter, submit, approve
│   ├── trucks/     boiler / bag / yard-bulk readings
│   └── reporting/  totals, MoM, YoY, breakdowns
├── lib/
│   ├── excel/      ExcelJS workbook builders — PURE functions over plain data
│   ├── units.ts    unit-label normalisation (see specs/001)
│   └── money.ts    decimal arithmetic helpers
└── types/          shared TypeScript types
```

## Dependency rule

```
app/  →  server/  →  prisma
app/  →  components/
app/  →  lib/
server/ → lib/
```

Arrows point one way only.

- A React component **never** imports `PrismaClient`.
- A route handler **never** writes a Prisma query inline — it calls a service in
  `src/server/`.
- `src/lib/excel/` **never** imports from `src/server/` or `prisma`. It receives plain
  objects. This is what makes exports unit-testable without a database.
- `src/server/` **never** imports from `src/app/` or `src/components/`.

Why: the Excel workbook this replaces failed because presentation and calculation were
the same thing. When a formula lived in a cell, moving the cell broke the number.
Keeping calculation in `server/` and presentation in `app/` is the structural fix.

## Money and quantities

- **Never use JavaScript `number` for money in the database.** Prisma `Decimal`
  (`@db.Decimal(12, 4)`) for prices and values.
- **Quantities are decimal too.** The workbook holds `21.6128` tonnes and `0.475`
  units. `Int` would silently destroy data.
- Convert to `number` only at the presentation boundary, and format there.

## Derived values are never stored

`value = quantity × unitPriceSnapshot` is computed on read, every time.

Storing it creates two sources of truth, which is precisely how the source workbook
accumulated `#REF!` errors in its total rows. The one exception is
`unitPriceSnapshot` itself — that is not a derived value, it is a **historical fact**
captured at submit time so that later price-list edits cannot rewrite the past.

## Immutability

A `StockCount` moves `DRAFT → SUBMITTED → APPROVED`. Once `APPROVED`:

- lines cannot be added, edited, or deleted;
- `unitPriceSnapshot` cannot change;
- the only permitted transition is an explicit, audited reopen by an `ADMIN`.

## Error handling

Domain services throw typed errors from `src/server/errors.ts`
(`NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`).
Route handlers map those to HTTP status codes in one place. Never `throw new Error()`
from a service — the caller cannot distinguish it from a bug.

## Validation

Every input crossing a trust boundary (form submission, route handler, seed script)
is parsed with a Zod schema at the edge of `src/server/`. Services receive already-valid
data and may assume it.

## Testing layers

| Layer | Tool | What it proves |
|---|---|---|
| `src/lib/**` | Vitest, no DB | Pure logic: unit normalisation, money maths, Excel cell layout |
| `src/server/**` | Vitest + real test Postgres | Services behave against a real schema |
| `src/app/**` | Playwright | A user can actually complete the flow |

See `docs/verification.md`.

## What "done" looks like

A feature is done when a person who was not in the session can:

1. Run `init` and get green.
2. Read the spec's acceptance criteria and find a named test for each one.
3. Run the app and perform the flow the spec describes.

Anything less is `in_progress`.
