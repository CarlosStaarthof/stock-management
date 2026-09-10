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
│   ├── units.ts    unit-label normalisation (see `specs/domain-model.md`)
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
- `src/lib/**` **never** imports from `src/server/` or `prisma`, **with one named
  exception**: it may import the typed error classes from `@/server/errors`, and nothing
  else from `src/server/`. It receives plain objects. This is what makes `src/lib/`
  unit-testable without a database.

  *The exception, added 2026-09-10 while closing #5.* Spec 005 AC-2, AC-6 and AC-7 require
  `src/lib/excel/workbook-reader.ts` itself to throw `ValidationError`, and that class lives
  only in `src/server/errors.ts`. The rule as first written was a proxy for the constraint
  that actually matters — nothing in `src/lib/` may reach a database or a server-only
  runtime — and `errors.ts` is four stateless classes that import nothing at all, so it
  compromises neither. The exception is deliberately narrow and is **enforced by ESLint for
  every ordinary import form**, not by convention: `@/server/db`, any service under
  `@/server/`, `export * from` and every relative reach-around (`../server/db`,
  `./../server/db`) all turn `npm run lint` red, in nine spellings the #5 reviewer tried.

  **Three spellings currently slip through**, found by that reviewer and reproduced:
  `@/./server/db` and `@/../src/server/db` — which `no-restricted-imports` compares as
  prefixes rather than as resolved paths, and which both typecheck and resolve at runtime —
  and `await import("@/server/db")`, because the rule does not visit `ImportExpression` in
  this configuration. None appears anywhere in the tree; the only `lib → server` import that
  exists is the permitted `@/server/errors` one. **The fix, open for whoever next touches the
  lint config:** replace the two prefix patterns with one that matches the path segment —
  on the shape of `(^|/)server(/|$)`, keeping the `errors` exception — and add a
  `no-restricted-syntax` rule on `ImportExpression` for the dynamic form. Until then this
  sentence says "every ordinary import form" and not "cannot", because a governing document
  that overstates its own guarantee is worse than one that admits a gap. The alternative, moving the error classes to `src/lib/errors.ts` and
  re-exporting them from `src/server/errors.ts`, is cleaner layering and remains open; it
  was not done here because it would touch every file #3 committed.
- `src/server/` **never** imports from `src/app/` or `src/components/`.

Why: the Excel workbook this replaces failed because presentation and calculation were
the same thing. When a formula lived in a cell, moving the cell broke the number.
Keeping calculation in `server/` and presentation in `app/` is the structural fix.

## Money and quantities

- **Never use JavaScript `number` for money in the database.** Prisma `Decimal`
  (`@db.Decimal(18, 8)`) for prices and values. Not `(12,4)`: four of the workbook's
  prices are formulas — `=5.2/0.85` and friends — that do not terminate in decimal, and
  at 4 places the totals drift from the file we are replacing.
- **Quantities are decimal too.** The workbook holds `21.6128` tonnes and `0.475`
  units. `Int` would silently destroy data.
- Convert to `number` only at the presentation boundary, and format there.

## The money boundary

`YARD_STAFF` is never *sent* a monetary value. Hiding one in a component is not a
permission — it stays in the network response and the page source.

- `src/server/` exposes two shapes per aggregate: `…ForStaff` and `…ForAdmin`.
- The shape is chosen from the **session role**, never from anything the client controls.
- A component never filters money. If a component has to decide whether to show a price,
  the boundary has already been crossed in the wrong place.

See `specs/domain-model.md` Part 6.

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
