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

`init` runs these, in order, and skips cleanly any step whose tooling is not present yet:

1. **Harness integrity** — every required file exists; each agent definition opens with
   YAML frontmatter carrying a `name`.
2. **Feature list** — `feature_list.json` parses; every `status` and `spec_status` is
   valid; at most one feature is `in_progress`; every `spec_file` with a `spec_status`
   other than `missing` exists on disk; every `spec_file` matches
   `specs/features/NNN-<name>.md` for its own id and name; nothing is `done` without an
   approved spec and a non-empty `acceptance` array.
3. **Source workbook untouched** — `git status --porcelain -- Samples` is empty.
4. **Application** — skipped entirely until `package.json` exists. Then: Node ≥ 20,
   `npm ci`, `npx prisma validate` if `prisma/schema.prisma` exists, and each of
   `typecheck`, `lint`, `test:unit`, `test:e2e` that `package.json` actually defines.
5. **Database** — added by feature #3. `node scripts/db-probe.mjs` opens a TCP connection
   to the host in `DATABASE_URL` and then to the host in `TEST_DATABASE_URL`, with a ten
   second timeout. It never queries and never prints a credential.
   - **Both reachable:** `npx prisma migrate status` must pass — a pending migration or
     drift fails the gate — and then `npm run test:db` runs the Level 2 service tests.
   - **Either not reachable, or `TEST_DATABASE_URL` unset:** the step SKIPS. `init`
     prints a line beginning `[skip] database unreachable at <host>` (or
     `[skip] TEST_DATABASE_URL is not set`) and ending
     `database-dependent checks skipped`, does not run `npm run test:db`, and still
     exits `0` — with the final line
     `[OK] Environment ready (database checks skipped)`, which names what it did not do.

   A machine with no database is not a broken machine, so the gate stays usable. But a
   green run that skipped this step has never executed a service test: `CHECKPOINTS.md`
   C2.1 therefore forbids closing a feature on one. The reviewer must see a full run.

Anything not in that list is not checked, however much this document might wish it were.
When a step is added to the scripts, it is added here in the same change.

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

## Level 3b — The money boundary (required for anything `YARD_STAFF` can reach)

`YARD_STAFF` must never be *sent* a monetary value. Assert it on the **response body**,
not the rendered UI — a UI assertion passes while the price sits in the JSON.

```ts
const res = await getCount(id, staffSession);
expect(deepKeys(res)).not.toContainMatch(/price|value|total|amount/i);
```

## Level 3c — Signatures

Submitting without a signature must be rejected **by the service**, not by a disabled
button. Test both: the rejection, and that a submitted count round-trips its
`signatureSvg` intact.

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
