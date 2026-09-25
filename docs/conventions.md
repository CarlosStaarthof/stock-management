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
| Feature spec | `specs/features/NNN-snake_case.md`, `NNN` = feature id | `007-entry_start.md` |
| Reference doc | `specs/kebab-case.md`, no number | `domain-model.md` |

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
throw new ConflictError(`Count for ${locationCode} in ${period} already exists`);

// bad
throw new Error("duplicate");
```

- Messages name the entity and the offending value.
- Never swallow an error to keep a screen rendering. Surface it.

## Comments

- Explain **why**, never **what**. The code says what.
- One place comments are required: any constant taken from the source workbook must
  cite its origin.
- **If a criterion bans a string, the comment explaining the ban cannot spell it either.**
  The scans read raw source, comments included (006 AC-31: *"in code and in a comment
  alike"*). Five times now a module comment saying "there is no path from here to
  `<the banned name>`" has turned its own criterion red. Name the thing indirectly, or
  describe the rule without quoting it.

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
- **Money: `Decimal @db.Decimal(18, 8)`. Quantity: `Decimal @db.Decimal(12, 4)`.**
  Never `Float`. Not `(12,4)` for money: four workbook prices are formulas
  (`=5.2/0.85` and friends) that do not terminate in decimal, and at four places the
  totals drift from the file this replaces. See `specs/domain-model.md` Invariant 10.
- Every foreign key gets an explicit `onDelete` policy. Think about it — do not accept
  the default because it is the default.

## Tests

- Test names read as sentences describing behaviour, and reference their criterion:

```ts
it("AC-3: rejects a second count for the same location and period", async () => { … });
```

- Arrange / Act / Assert, separated by blank lines.
- No shared mutable state between tests. Each test seeds what it needs.
- **A git assertion says whose work it is about, through `tests/support/feature-scope.ts`.**
  No test runs `git status` or `git diff` itself to make one. There are three kinds:
  - *A path no feature may change* — a global invariant with a written "never" behind it,
    today only `Samples/` (`CLAUDE.md`, *Forbidden* below):
    `expect(workingTreeChanges(["Samples"])).toEqual([])`. Checked in every session,
    whoever is working.
  - *A path feature N did not touch*: `expect(filesTouchedBy(N, paths)).toEqual([])`.
  - *What feature N changed*: an equality on `filesTouchedBy(N, paths)` or
    `changedLinesBy(N, paths)`.

  The helper reads N's own commits (see *Commits*), plus the working tree while N is
  `in_progress`. **Neither the working tree nor a commit range ending at the branch tip may
  carry a claim about one feature's work.** The working tree does not record whose change it
  holds: a later feature's legitimate edit turns an earlier feature's "untouched" check red,
  and a claim that something *was* changed empties out at the commit. A range that ends at
  the tip keeps taking in every later feature's commits to the same paths: 010's
  `playwright.config.ts` check had already absorbed #11's edit, and its `CalendarGrid.tsx`
  check would have turned red at #21's commit. A range from a feature's first commit to its
  last fails too, because a feature's commits are not contiguous (`fix(#8)` landed after #10).
  See 021's Phase 0 amendment.

## Commits

```
<type>(<scope>): <imperative summary>

<why this change exists>

Feature: #<id> <feature_name>
```

Types: `spec`, `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `harness`.

One feature per commit series. Never mix a refactor into a feature commit.

**The scope says which feature a commit is for, and tests depend on it.** Every commit made
for a feature is scoped `(#<id>)`: `spec(#N)` approves or amends its spec, `feat(#N)` builds
it, `fix(#N)` repairs it later, and any other type takes the same scope (`test(#N)`,
`refactor(#N)`). A commit made for no feature takes a word scope (`fix(app)`,
`harness(repo)`) and belongs to no feature. `tests/support/feature-scope.ts` decides whose a
commit is from **the subject line alone** — lower-case type, `(#N)`, a colon and a space. It
never reads the body, the author, the date or the `Feature:` trailer above.

- **A missing or malformed scope** (`fix(app)` for #8's work, `fix(#08)`, `fix #8:`) makes the
  commit no feature's. Every "N did not touch this" check ignores it: a false green, never a
  false red, which only review catches — or the working-tree half, if the gate runs while
  the edit is uncommitted and N is `in_progress`.
- **A wrong number** (`fix(#10)` for #8's work) makes the commit #10's for good, because
  history on `main` is not rewritten. If it touched a path #10's checks protect, they turn red
  for a change #10 did not make. The remedy is an attribution correction added to the helper,
  keyed by the commit's SHA, carrying its reason and reviewed on its own — never an edit to
  the assertion.
- **A revert** (`Revert "fix(#8): …"`) belongs to no feature, and the reverted commit stays #8's.

## Forbidden

- `console.log` in `src/` (use the logger, or delete it).
- Committed `.env`, connection strings, or credentials.
- Editing anything in `Samples/`.
- `TODO` without a feature id: `// TODO(#12): …`
- Disabling a lint rule inline without a comment explaining why.
