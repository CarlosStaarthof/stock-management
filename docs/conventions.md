# Conventions

## Language

- All code, comments, identifiers, commit messages, specs and docs are in **English**.
- Domain terms keep their real-world spelling: `Thermo-P`, `A-S`, `Vialine`, `MultiGrip`.
  Do not "tidy" them — yard staff recognise these exact strings.

## Files and naming

| Thing | Convention | Example |
|---|---|---|
| React component file | `PascalCase.tsx` | `StockCountRow.tsx` |
| Service / util module | `kebab-case.ts` | `count-service.ts`, `unit-label.ts` |
| Test file | mirrors source + `.test.ts` | `count-service.test.ts` |
| Prisma model | `PascalCase` singular | `StockCountLine` |
| DB column | `camelCase` in Prisma | `unitPriceSnapshot` |
| Enum value | `SCREAMING_SNAKE` | `WHITE_THERMO`, `IN_PROGRESS` |
| Route segment | `kebab-case` | `/stock-counts/[id]/entry` |
| Spec file | `NNN-snake_case.md` | `007-count_create.md` |

## TypeScript

- `strict: true`. No `any`. If you truly need an escape hatch, use `unknown` and narrow.
- No non-null assertion (`!`) outside tests. Narrow properly or throw a domain error.
- Prefer `type` aliases for data shapes, `interface` only for extensible contracts.
- Exported functions have explicit return types. Inference is fine internally.
- No default exports except where Next.js requires them (pages, layouts, route handlers).

## React / Next.js

- Server Components by default. Add `"use client"` only when you need state, effects,
  or event handlers — and push it as far down the tree as possible.
- Data fetching happens in Server Components or server actions, calling `src/server/`.
- Every screen handles three states explicitly: **empty**, **loading**, **error**.
- Forms are progressive: they work with a server action, and are enhanced with client
  state for autosave. The yard has bad signal — never lose a user's typed count.

## Errors

```ts
// good
throw new ConflictError(`Count for ${locationCode} on ${date} already exists`);

// bad
throw new Error("duplicate");
```

- Messages name the entity and the offending value.
- Never swallow an error to keep a screen rendering. Surface it.

## Comments

- Explain **why**, never **what**. The code says what.
- One place comments are required: any constant taken from the source workbook must
  cite its origin.

```ts
// Clonmel Trucks & Yard!D8:D22 — a full hand-truck boiler holds 250 kg.
const KG_PER_FULL_BOILER = 250;
```

## Imports

- Absolute imports via the `@/` alias (`@/server/counts/count-service`).
- Import order: node builtins → external → `@/` internal → relative → styles.
- No barrel `index.ts` re-export files. They hide dependency cycles.

## Database

- Every schema change ships with a migration: `npx prisma migrate dev --name <verb_noun>`.
- Never edit an applied migration. Write a new one.
- Money and quantity: `Decimal @db.Decimal(12, 4)`. Never `Float`.
- Every foreign key gets an explicit `onDelete` policy. Think about it — do not accept
  the default because it is the default.

## Tests

- Test names read as sentences describing behaviour, and reference their criterion:

```ts
it("AC-3: rejects a second count for the same location and date", async () => { … });
```

- Arrange / Act / Assert, separated by blank lines.
- No shared mutable state between tests. Each test seeds what it needs.

## Commits

```
<type>(<scope>): <imperative summary>

<why this change exists>

Feature: #<id> <feature_name>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `harness`.

One feature per commit series. Never mix a refactor into a feature commit.

## Forbidden

- `console.log` in `src/` (use the logger, or delete it).
- Committed `.env`, connection strings, or credentials.
- Editing anything in `Samples/`.
- `TODO` without a feature id: `// TODO(#12): …`
- Disabling a lint rule inline without a comment explaining why.
