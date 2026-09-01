# Verification — the agent does not say "it works", it proves it

Executable evidence, not assertions. A claim without a command that produces green
output is not evidence.

---

## Level 0 — The gate

```powershell
./init.ps1        # Windows
./init.sh         # POSIX
```

Must end with `[OK] Environment ready`. Nothing is `done` until it does.

`init` runs, in order, skipping cleanly any step whose tooling is not yet present:

1. Node version check
2. Harness integrity (required files exist, `feature_list.json` parses, statuses valid)
3. `npm ci`
4. Database up (`docker compose up -d db`) and reachable
5. `npx prisma validate` + `npx prisma migrate deploy` against the **test** database
6. `npm run typecheck`
7. `npm run lint`
8. `npm run test:unit`
9. `npm run test:e2e`

## Level 1 — Unit tests (required)

Every exported function in `src/lib/` and `src/server/` needs:

- at least one test for the **success** path, and
- at least one test for a **failure** path.

```ts
// good — asserts a value
const total = calculateCountTotal(lines);
expect(total.toString()).toBe("45421.0850");

// bad — asserts only that nothing exploded
expect(() => calculateCountTotal(lines)).not.toThrow();
```

## Level 2 — Service tests against a real database (required for `src/server/`)

Use a **real Postgres test database**, not a mock. Mocking Prisma proves that your
mock works, which is not a fact anyone needs.

```ts
beforeEach(async () => { await resetTestDb(); });
```

Each test seeds exactly what it needs. Tests must pass when run in any order and in
parallel.

## Level 3 — Excel exports (required for anything in `src/lib/excel/`)

Generate the workbook into a buffer, **read it back with ExcelJS, and assert on cell
values**.

```ts
const buf = await buildYardSheet(fixture);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(buf);
const sheet = wb.getWorksheet("Dublin");

expect(sheet.getCell("A3").value).toBe("White Extrusion 80/20");
expect(sheet.getCell("G3").value).toBe(9.83);
expect(sheet.getCell("H3").value).toBe(8748.7);
```

Asserting that the file was created is not a test. Asserting its contents is.

## Level 4 — End-to-end (required for any user-facing feature)

Playwright, real browser, real server, real database. Test what a user does, not what
a component renders.

## Level 5 — Manual smoke (run before closing a milestone)

1. Seed from the workbook.
2. Create a Dublin count for today.
3. Enter quantities for at least five items across different types.
4. Submit, then approve.
5. Confirm the dashboard total matches the sum you entered.
6. Export Excel; open the file; confirm the `Qty | Value` pair and the `TOTAL` row
   match the dashboard figure exactly.

Record the result in `progress/current.md`.

---

## Anti-patterns — do not do these

| Anti-pattern | Why it fails |
|---|---|
| "The feature is implemented and should work." | No evidence. Run it. |
| `expect(fn).not.toThrow()` as the whole test | Proves nothing about correctness. |
| Mocking `PrismaClient` | Tests the mock, not the schema or the query. |
| Mocking the filesystem for Excel tests | Use a real buffer; that is what ships. |
| Marking `done` with `init` red | Explicitly forbidden. |
| Deleting or skipping a failing test to get green | Fix the code or record the blocker. |

## If `init` fails and you cannot fix it

Do **not** improvise a workaround and do **not** mark the feature `done`.
Write the blocker in `progress/current.md`, set the feature's status to `blocked` in
`feature_list.json`, and stop the session.
