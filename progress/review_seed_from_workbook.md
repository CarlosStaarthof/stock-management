# Review — feature 5 `seed_from_workbook`

**Verdict:** CHANGES_REQUESTED
**Spec:** `specs/features/005-seed_from_workbook.md` (approved 2026-09-09; AC-17 amended by
the user 2026-09-10)
**init:** green — `./init.ps1` exit 0, ending `[OK] Environment ready`, **database checks
executed** (`database reachable` / `prisma migrate status` / `npm run test:db`), not skipped.
17 unit files / 183 tests, 8 db files / 95 tests, 26 e2e.

Two exported functions in `src/server/` ship with **no automated test of any kind**:
`describeSource` and `planWorkbook`. `describeSource` is the sole producer of the one part
of AC-16 the test suite never asserts — the SHA-256 of the bytes read. That is an unchecked
box in C2, which `CHECKPOINTS.md` says blocks approval. Everything else in this feature is
correct, and I verified it by re-deriving it rather than by reading it.

---

## What I re-derived independently

I unzipped `Samples/Stock @ 01-Sep-2026.xlsx` into the scratchpad and parsed
`xl/worksheets/sheet2.xml` (Dublin), `sheet3.xml` (`Clonmel `) and `xl/sharedStrings.xml`
with my own parser — no ExcelJS, no code from this feature. Every figure in the spec is one
I counted myself:

| Quantity | Spec | Mine |
|---|---|---|
| Source rows | 152 | **152** |
| Dublin block / below-total | 3–84, 82, 0 | **3–84, 82, 0** |
| `Clonmel ` block / below-total | 3–70, 68, 2 (75, 76) | **3–70, 68, 2 (75, 76)** |
| `Item` rows | 140 | **140** |
| Items on both sheets | 12 | **12** (same twelve descriptions) |
| `ItemLocation` rows | 152 (82 / 70) | **152 (82 / 70)** |
| `Supplier` rows | 10 | **10** (`Kelly` 7 + `Kellys` 19 + `Kelly's` 1; `Meon ` 1; `Visever ` 2; blank at `Dublin!B45`) |
| `ItemType` rows | 19 | **19** (`Logo's` at `'Clonmel '!C66` collapses) |
| `ItemPrice` rows | 129 | **129** |
| `needsReview` | 15 | **15**, cell for cell, reasons included |
| Items with `notes` | 10 | **10** |
| Conflicts / distinct items | 10 / 8 | **10 / 8**, same cells, same readings, **0 price conflicts** |
| Unit-kind tally | 24 / 38 / 6 / 71 / 1 | **24 / 38 / 6 / 71 / 1** |
| Distinct unit labels / blank cells | 22 / 7 | **22 / 7** |
| Items if internal whitespace collapsed | 138 | **138** |
| SHA-256 / bytes | — | `sha256sum` = `6308ae04…f54bff0`, 90567 — the same pair the script prints |

`AC-4`'s five rich-text cells, read straight from `sharedStrings.xml`: each has exactly two
`<t>` runs, and the first run is `"White - "`, `"Yellow  - "`, `"Stick On Studs - "`,
`"Stick On Studs -"`, `"Anti Skid Buff  - "` — exactly the strings
`workbook-reader.test.ts:148-154` pins, each strictly shorter than the full string.

`AC-6`'s prices from the raw XML: `'Clonmel '!E19` `=5.2/0.85`, `E20` `=2.45/0.85`, `E21`
`=5.89/0.85`, `E23` `=1.4/0.9`; `Dublin!E10/E31/E55/E72` are stored literals.

---

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `src/lib/excel/workbook-reader.test.ts:75,80,86` — 152 rows, sheets exactly `Dublin`/`Clonmel `, key set exactly the eight, none matching `/qty\|quantity\|value\|count\|date/i`. Reader iterates `YARD_SHEET_NAMES` only (`workbook-reader.ts:345`). |
| AC-2 | PASS | `workbook-reader.test.ts:94,214,227`. Exact-name check at `workbook-reader.ts:348` (`sheet.name !== sheetName`) defeats ExcelJS's loose lookup; message contains `Clonmel` and `sheet`. |
| AC-3 | PASS | `workbook-reader.test.ts:102,112,127`. My own parse gives the identical block bounds; `Dublin!85` has no cell at all in A–E and is skipped, `A86`/`A71` are `TOTAL` and are not rows. |
| AC-4 | PASS | `workbook-reader.test.ts:136,144,164,171`, plus my independent run-by-run read of `sharedStrings.xml` above. `unwrapCellValue` at `workbook-plan`'s upstream `workbook-reader.ts:200` joins **every** run. |
| AC-5 | PASS | `workbook-reader.test.ts:179`; round trip in `workbook-import.db.test.ts:138`. I read it back from the development database myself: `"Anti Skid Grains (€550 p/T)"`. |
| AC-6 | PASS | `workbook-reader.test.ts:186,193,200,274` and the three `toDecimalString` blocks at `:306-324`. Rounding is on digit strings (`incrementDigits`, `workbook-reader.ts:104`), never through a float. |
| AC-7 | PASS | `workbook-reader.test.ts:208,236,260`. Message is `Dublin row 7 has no description in column A`. |
| AC-8 | PASS | `workbook-plan.test.ts:119,134,150,159,169`. My count: `Kelly` 7 / `Kellys` 19 / `Kelly's` 1 / `Meon ` 1 / `Visever ` 2 / one blank at `Dublin!B45`, and **no** `t`-prefixed spelling exists in the file. |
| AC-9 | PASS | `workbook-plan.test.ts:176,202` — the exact 19 in Part 2's order with `sortOrder` 1–19; no `Logo's` type. |
| AC-10 | PASS | `src/lib/units.test.ts` — 22 table rows + blank + null-`kg` rule + label preservation + 11 pairs + `I Unit` + fallback; `UNIT_KINDS` compared to `prisma/schema.prisma` read as text (`:114`). Tally 24/38/6/71/1 at `workbook-plan.test.ts:209`, matching my own count. |
| AC-11 | PASS | `workbook-plan.test.ts:225,231,250,255,274,283`. The whitespace test asserts **both** sides: `collapsed.size` is `138` *and* `plan.items` is `140` (`:270-271`), which is what the user's approval decision required. |
| AC-12 | PASS | `workbook-plan.test.ts:311,317,326,347,354`; `workbook-import.db.test.ts:112`. `Dublin!A43` excluded and asserted (`1 Unit`, `350`); the eleven price-less rows enumerated; `A9` `173.29` and `A78` `253` kept. All thirteen cells match my derivation. |
| AC-13 | PASS | `workbook-plan.test.ts:361,384,391,395`; `workbook-import.db.test.ts:165`. Supplier `Mid-West`, type `Fuel`, `Ltrs`/`LITRE`, one CLONMEL link, `1.23`/`0.96`, `sortOrder` 75/76, note naming the cell and `below the total row`. |
| AC-14 | PASS | `workbook-plan.test.ts:402,420,434,449,464`. The five unit and five type conflicts, cells and readings, are byte-identical to mine; price conflicts are zero and asserted zero; the `ConflictError` path names both cells and both prices (`workbook-plan.ts:487`). |
| AC-15 | PASS | `workbook-plan.test.ts:480`; `workbook-import.db.test.ts:128`. Development database: 10 rows with a non-null `notes`. |
| AC-16 | **FAIL** | Everything except `source` is proved: sheets/counts (`:493`), the fifteen (`:510`), the four variants with counts 19/1/1/2 (`:538`), twelve shared + ten conflicts (`:550`), ordering (`:556`), byte-identical determinism (`:573`). **`source` is not.** The criterion demands "the file name, byte length and **SHA-256 of the bytes read**"; `workbook-plan.test.ts:40` supplies a fabricated `{ byteLength: 90567, sha256: "abc123" }` and `:494` asserts `report.source` equals it. That proves the report passes a source through, not that the digest is the digest. `describeSource` (`workbook-plan.ts:220`), the only code that computes it, is referenced by **no test file in the repository** — `grep -rn "describeSource" --include=*.test.ts src tests` is empty. I verified the behaviour by hand (`sha256sum` = `6308ae04…`, matching the script's output), but a criterion proved only by a transcript is not proved. |
| AC-17 | PASS | `workbook-plan.test.ts:665,671,713,768`. See "AC-17 in detail" below — the exemption is correctly bounded and non-vacuous, and I attacked all three scans. |
| AC-18 | PASS | `workbook-import.db.test.ts:69` — created counts and row counts both, with `Location` 2 / `User` 0 / `StockCount` 0 / `StockCountLine` 0 after. Re-confirmed against the development database: `{locations:2, users:0, counts:0, lines:0, suppliers:10, itemTypes:19, items:140, prices:129, links:152}`. |
| AC-19 | PASS | `workbook-import.db.test.ts:151,194`; `workbook-plan.test.ts:775`. Development database: 82 links to `loc_dublin`, 70 to `loc_clonmel`, `Location` still the two migration rows. |
| AC-20 | PASS | `workbook-import.db.test.ts:216,239`. I also read them back through Prisma myself: `Cast Iron Studs` → `6.11764706`, `Bauxite Buff  for MMA` → `33.09`, `EUR`, `2025 Prices`, `2025-01-01`; 129 prices over 129 distinct items. |
| AC-21 | PASS | `workbook-import.db.test.ts:256` — full column dump, ids included, deep-equal. I re-ran `npm run seed:workbook` against the development database: `created 0`, `skipped 10/19/140/129/152`, `divergences 0`, exit 0. |
| AC-22 | PASS | `workbook-import.db.test.ts:288,373`; `workbook-plan.test.ts:850`. Four distinct ADMIN edits (supplier, `unitLabel`, price, `active`) survive the third run and each is a divergence. I checked the scan cannot be defeated: `src/server/items/workbook-import-service.ts` contains no `$executeRaw`, no `$queryRaw`, no bracket/dynamic property access and no aliasing — the only Prisma calls are six `findMany`, three `createManyAndReturn` and two `createMany`. |
| AC-23 | PASS | `workbook-plan.test.ts:805,821`; `workbook-import.db.test.ts:392,403`. `itemKeyOf` (`workbook-plan.ts:309`) makes two nulls equal. Development database holds exactly one `School Logo Triangle`. |
| AC-24 | PASS | `workbook-import.db.test.ts:472`. **Re-executed myself** against the test branch, three different mid-transaction failures: (a) the `Item_description_not_empty` CHECK, (b) a `ConflictError` thrown from the service *after* suppliers and types were written, (c) a unique-constraint violation. All three left `Supplier/ItemType/Item/ItemPrice/ItemLocation` at **0** and `Location` at 2 — zero rows, not one. |
| AC-25 | PASS | `workbook-plan.test.ts:905,921`; `workbook-import.db.test.ts:101`. `Summary` / `Clonmel Trucks & Yard` appear only at `workbook-reader.ts:19-20` and `workbook-plan.ts:22`, all comment lines. `src/lib/units.ts` and `scripts/seed-workbook.ts` name neither. |
| AC-26 | PASS | Executed. Default run exit 0 with 140 items, the 15 `needsReview` entries, 4 variants, 12 shared, 10 conflicts; `git status --porcelain -- Samples` empty; `--report <path>` writes the JSON (`counts` 10/19/140/129/152, `source` `90567` + `6308ae04…`); with the flag absent `git status --porcelain` is byte-identical before and after — no file written into the repository. A bad `--file` exits 1 with `[seed:workbook] cannot read …`, no stack trace. |
| AC-27 | PASS | Executed with all four URLs on `host.invalid` / `host2.invalid`: `typecheck` 0, `lint` 0, `test:unit` 0, `build` 0, `seed:workbook -- --dry-run` 0 (140 planned), `seed:workbook` **1** naming `Can't reach database server at host.invalid:5432` and writing nothing, `bash ./init.sh` 0 and `./init.ps1` 0, both ending `[OK] Environment ready (database checks skipped)`. |
| AC-28 | PASS | The four file names are as specified; `vitest.db.config.ts` is unchanged. `npm run test:unit` ran 17 files, none `*.db.test.ts`. `npm run test:db` passed **twice in a row** (once inside `init`, once standalone: 8 files / 95 tests both times). `resetTestDb()` in `beforeEach` at `workbook-import.db.test.ts:64`. |
| AC-29 | PASS | `tests/unit/project-contract.test.ts` — exact permitted list `["src/server/items/workbook-import-service.ts", "src/server/items/workbook-plan.ts"]`, non-vacuity via `src/server/db.ts`, plus the two new assertions on `src/app`/`src/components`/`src/lib`/`scripts` and on `unitPriceSnapshot`. |
| AC-30 | PASS | `exceljs` pinned `4.4.0` in `dependencies`, present in `package-lock.json` with `resolved` + `integrity`; `seed:workbook` script present; `npm ci` from the lockfile exit 0; `npx prisma validate` valid; `npx prisma migrate status` "up to date", 2 migrations; `./init.ps1` green with the database checks executed. `git status --porcelain -- prisma` is empty — `schema.prisma`, both migration directories and `migration_lock.toml` are byte-identical. |
| AC-31 | PASS | `git status --porcelain -uall` lists exactly the sixteen paths AC-31 permits and nothing else: no `src/app/`, no `src/components/`, no route handler, no server action, no component, nothing under `prisma/` or `Samples/`. `src/lib/excel/workbook-reader.ts` and `src/lib/units.ts` import neither `@prisma/client` nor `@/server/db`, so `tests/unit/hashing-boundary.test.ts` needed no change and still passes. |

`feature_list.json`'s 31 `acceptance[]` entries match the spec's 31 numbered criteria
character for character, including the amended AC-17 (checked programmatically: 0
mismatches).

---

## AC-17 in detail — the amendment, and my attempt to defeat it

**The exemption is correctly bounded.** The scan removes exactly one key, structurally
(`workbook-plan.test.ts:612` — `{ ...source }` then `delete copy.divergences`), never by
surgery on serialised JSON. Nothing else in the report is exempt.

**The amended criterion is not vacuous.** It is asserted twice: on the ordinary report,
with `expect(report.divergences).toEqual([])` first (`:666`), and on a report built against
a database where an ADMIN has corrected `Beads` from `790` to `800`, with
`expect(corrected.divergences).not.toEqual([])` first (`:708`). A third test (`:713`)
asserts *positively* that the exempt array carries **both** figures — the whole divergence
object, `workbook: "790"` / `database: "800"` — and that `790` really is the workbook's
price for that item (`:765`). So the exemption cannot quietly stop carrying what AC-22
requires of it, which was precisely the vacuity the user's amendment closed.

**I attacked the three scans** by mutating a real report in memory (no repository file was
touched) and running the test's own scan logic:

| Attempt | Result |
|---|---|
| unmutated report | passes — no false positive |
| decimal price `173.29` glued into `needsReview[].description` | **caught by scan (b)** |
| integer price `890` as a whole string leaf | **caught by scan (a)** |
| price as a number under a new key `total` | **caught by scan (c)** |
| integer price `890` glued into a description | escapes |
| `173.29` substituted into the permitted numeric key `lastRow` | escapes |
| `173` and `.29` split across two adjacent leaves | escapes |

The first residue is the one the implementer documented, and the workbook justifies it: over
the report's own string leaves, **every price containing a decimal point collides zero
times**, while integer prices collide constantly (`450` inside `Unipime X450`, `25` inside
`25L` and `X250`, `102` inside `RAL1023`) — 225 collisions in my leaf set against 0.
Searching for integer prices as substrings would make the suite permanently red on real
descriptions, so scan (a) covers them as whole leaves and scan (c) as numbers. The other two
escapes are contrived. The criterion's literal form ("none of the workbook's price strings
appears anywhere in it") is not fully assertable; the implementer asserted the largest
satisfiable form of it, measured the residue instead of guessing, and said so. That is the
right call, and AC-17 passes.

Distinct planned prices: **87**, of which **39** carry a decimal point — comfortably above
the test's own non-vacuity floor of `> 20` (`workbook-plan.test.ts:651`).

---

## `diffPlan`'s second matching pass (`workbook-plan.ts:655`) — the highest-risk change

I built adversarial fixtures and ran them through `diffPlan`:

| Fixture | Result |
|---|---|
| Supplier-less planned item; **two** stored rows with that description under `Kelly` and `Kestrel` | claims one, creates nothing — but **which one depends on the order `existing.items` arrives in** (see below) |
| Plan holds both a supplier-less `X` and a `Kestrel X`; database holds `Kestrel X` | pass 1 claims `Kestrel X`; the supplier-less item is **not** allowed to steal it and is created. Correct, and not order-dependent: pass 1 runs to completion before pass 2 |
| Stored supplier-less row **and** a stored row under a supplier, same description | the **exact** key wins (`item_null`). Correct precedence |
| Two supplier-ed planned items sharing a description (AC-11's `Bicycle Logo's  1200mm` case), plus a stored supplier-less orphan | both are created, neither claims the orphan — **AC-11 is genuinely untouched**, because `:660` returns early for any planned item that has a supplier |
| Two supplier-less planned items differing only by internal whitespace | only the exact one matches; the other is created. Whitespace is compared exactly, not collapsed |
| Planned item whose supplier row is absent from the database | returns `null` and does **not** claim a supplier-less stored row (`:646`) |

So the pass is correctly narrow: it can only ever claim a row that no planned item matches
exactly, it never applies to a planned item that has a supplier, and it can neither create a
duplicate nor overwrite anything. In this workbook exactly one planned item is supplier-less
(`School Logo Triangle`), so it can claim at most one row.

The one real defect is ordering, and it is **non-blocking** — see Observation 1.

---

## Checkpoints

### C1 — Process
- C1.1 [x] Exactly one feature changed. `git status -uall` lists only #5's sixteen paths.
- C1.2 [x] Spec exists at `specs/features/005-seed_from_workbook.md`.
- C1.3 [ ] **Every numbered acceptance criterion satisfied** — AC-16's `source` clause is
  not proved by any test. See the table and Required change 1.
- C1.4 [x] `feature_list.json` `acceptance[]` matches the spec's 31 criteria exactly,
  amended AC-17 included.
- C1.5 [x] `progress/impl_seed_from_workbook.md` exists and lists the files touched. One
  inaccuracy: it states "`feature_list.json` and the spec are unchanged", and both are in
  fact modified — by the user's 2026-09-10 AC-17 amendment, which AC-31 explicitly permits.
  No scope violation, but the report and the working tree disagree.

### C2 — Verification
- C2.1 [x] `./init.ps1` → `[OK] Environment ready`, database checks **executed**.
- C2.2 [x] `npm run typecheck` — 0 errors.
- C2.3 [x] `npm run lint` — 0 errors, `--max-warnings 0`.
- C2.4 [ ] **Every new service function has a success test and a failure test.**
  `importWorkbook` has both. **`planWorkbook` (`workbook-import-service.ts:383`) has
  neither, and `describeSource` (`workbook-plan.ts:220`) has neither** —
  `grep -rn "planWorkbook\|describeSource" --include=*.test.ts src tests` returns nothing.
  Both are exported, both ship, and both are on a user-facing path (`--dry-run`, the
  report's `source`).
- C2.5 [x] Tests assert real values — 140 against 138, `6.11764706`, `33.09`, the exact
  fifteen cells, id-inclusive dumps. No bare "did not throw".
- C2.6 [x] Real Postgres and real workbook bytes throughout; `PrismaClient` is never mocked.

### C3 — Architecture
- C3.1 [x] No component or route handler imports `PrismaClient`. Nothing under `src/app/`
  or `src/components/` was touched at all.
- C3.2 [x] `src/server/items/workbook-import-service.ts` is the only module in this feature
  that touches Prisma, and `workbook-plan.ts` imports neither `@/server/db` nor
  `@prisma/client` (asserted at `workbook-import.db.test.ts:382`).
- C3.3 [x] `src/lib/excel/workbook-reader.ts` performs no database and no network access.
  It does import `@/server/errors` — see Observation 3.
- C3.4 [x] No circular imports. `src/server/errors.ts` imports nothing, so the
  `server/items → lib/excel → server/errors` chain terminates.
- C3.5 [x] No schema change, so no migration is owed. `git status --porcelain -- prisma`
  is empty; both migration directories and `migration_lock.toml` are byte-identical.

### C4 — Domain integrity
- C4.1 [x] No value column written; this feature writes no computed value at all.
- C4.2 [x] No `YARD_STAFF` surface exists here — no route, no action, no component. The
  report reaches no session; AC-17 keeps money out of it regardless.
- C4.3 [x] Money stays `Decimal(18,8)`, quantity `Decimal(12,4)` — unchanged schema, and
  prices travel as decimal **strings** from cell to Prisma, never as a JS `number`.
- C4.4 [x] Not applicable — no count reaches `SUBMITTED` here.
- C4.5 [x] `unitPriceSnapshot` is written nowhere; `tests/unit/project-contract.test.ts`
  proves no shipping module even names it.
- C4.6 [x] No `StockCount` row is created (`StockCount` and `StockCountLine` are 0 in the
  development database and asserted 0 in `workbook-import.db.test.ts:101`).
- C4.7 [x] `6.11764706` survives to the database and back at full precision.
- C4.8 [x] `Samples/` untouched — `git status --porcelain -- Samples` empty before and
  after every run I made, including the two end-to-end imports.

### C5 — Conventions
- C5.1 [x] `kebab-case.ts` modules, `*.test.ts` / `*.db.test.ts` mirrors, test names read
  as sentences and cite their criterion.
- C5.2 [x] Typed domain errors only — `ValidationError`, `NotFoundError`, `ConflictError`.
  No `throw new Error()` anywhere in the new code. (One nuance in Observation 4.)
- C5.3 [x] No `console.log` under `src/`; the script's output is in `scripts/`.
- C5.4 [x] No `TODO` without a feature id.
- C5.5 [x] No credential or connection string committed.
- C5.6 [x] No `any`, no non-null assertion outside tests, explicit return types on exports,
  workbook-derived constants carry their cell citation (`PRICE_LABEL`, `KG_PER_TONNE`,
  `ITEM_TYPE_VARIANTS`).

### C6 — Session hygiene
- C6.1 [x] `progress/current.md` was written during the work, with the plan up front.
- C6.2 [x] No scratch or temp file in the repository; `--report` wrote outside it.
- C6.3 [x] `feature_list.json` says `in_progress`, which is what it is. The implementer
  correctly did not mark it `done`.

### C7 — Advisory
- [x] No new screen, so empty/loading/error have no surface. The spec records this
  deliberately; the CLI's own four states are implemented (`created 0` on a re-run is a
  success, not an error).
- [x] No viewport concerns.
- [x] The report's columns are aligned and every number in it is a count or a row number.

---

## Required changes

1. **`src/server/items/workbook-plan.ts:220` — `describeSource` has no test, and AC-16's
   `source` clause therefore has no proof.** `workbook-plan.test.ts:40` hands the report a
   fabricated `{ byteLength: 90567, sha256: "abc123" }` and `:494` asserts it comes back
   unchanged, which would still pass if `describeSource` returned a constant. Add a unit
   test in `src/server/items/workbook-plan.test.ts` that calls `describeSource` on the real
   workbook bytes and asserts the byte length is `90567` and the digest is
   `6308ae040163d3d008cb0622fc83c70987ceaf44389d59a457ab5e6a2f54bff0` (I confirmed both
   with `sha256sum`), plus one negative case — two different byte sequences must not produce
   the same digest, or one byte changed must change it.

2. **`src/server/items/workbook-import-service.ts:383` — `planWorkbook` has no test at all,
   failing checkpoint C2.4.** It is an exported service function on the `--dry-run` path and
   the only thing standing between AC-27 and a connection attempt. Add a success test (real
   workbook bytes in, `report.counts` states 140 planned items, `plan.items` has 140, and
   it resolves with no `DATABASE_URL` reachable) and a failure test (a buffer that is not an
   `.xlsx`, or a workbook with no `Clonmel ` sheet, rejects with `ValidationError`). It must
   live in `npm run test:unit`, not in `*.db.test.ts` — the whole point of the function is
   that it needs no database, and AC-27 requires that to be provable without one.

Neither change touches production code, and nothing else in the feature needs to move.

---

## Observations (non-blocking)

1. **`tx.item.findMany` at `workbook-import-service.ts:194` has no `orderBy`, and the second
   matching pass depends on that order.** When two or more stored rows share a description
   and a supplier-less planned item claims one, `existing.items.find(...)`
   (`workbook-plan.ts:661`) takes whichever Postgres returned first. I reproduced this: the
   same plan against the same rows in two orders claimed `item_kelly` and then
   `item_kestrel`. Nothing is corrupted — the importer is insert-only, so either way it
   creates nothing and overwrites nothing — but the `divergences[]` a run reports is then
   not deterministic, which sits awkwardly beside AC-16's determinism promise (asserted only
   against an empty database, so no criterion is broken). One word fixes it:
   `orderBy: { id: "asc" }`. Worth doing before #6 starts editing the master.

2. **The second pass is not pinned by a pure test.** It is proved only indirectly, by
   `workbook-import.db.test.ts:288` going red when it is removed. Given how much rides on it
   being narrow, a unit test in `workbook-plan.test.ts` asserting the two properties I had
   to discover for myself — a planned item *with* a supplier never claims a stored row of a
   different supplier, and an exact match always beats a loose one — would make the
   narrowness a stated rule rather than an emergent one. This is a suggestion, not a
   requirement: AC-22 and AC-23 are both proved.

3. **`src/lib/excel/workbook-reader.ts:3` imports `@/server/errors`,** which the letter of
   `docs/architecture.md` forbids ("`src/lib/excel/` **never** imports from `src/server/`").
   The spec forced it — AC-2, AC-6 and AC-7 all require *the reader* to throw
   `ValidationError`, and that class lives only in `src/server/errors.ts` — and AC-31 states
   the boundary in narrower terms ("neither `@prisma/client` nor `@/server/db`"), which the
   file honours. No lint rule covers `lib → server`, and `errors.ts` is four stateless
   classes that import nothing, so there is no cycle and no database reachability. I am not
   blocking on it, but `docs/architecture.md` and the code now disagree in writing, and one
   of them should be changed by whoever owns that doc.

4. **A database constraint violation escapes `importWorkbook` as a raw
   `PrismaClientUnknownRequestError`,** not as a typed domain error. I saw this in my own
   AC-24 runs. The Contract says `importWorkbook` "throws `ValidationError`, `NotFoundError`
   or `ConflictError` … never a bare `Error`". No numbered criterion requires the mapping —
   AC-24 asks only that it reject, and AC-26's user-facing behaviour is correct, because
   `scripts/seed-workbook.ts:198` catches non-`DomainError` and prints a one-line message
   with exit 1 rather than a stack trace. Worth mapping in a later feature when a route
   handler has to turn one of these into a status code.

5. **`--dry-run` prints `created 140`.** `planWorkbook` diffs against a synthetic empty
   database, so the `created` column of a dry run reads as though 140 rows were written.
   The closing line ("dry run: nothing was written and no database was opened") corrects it,
   and AC-27 only requires the planned figure, but `created` is the wrong word for a run
   that creates nothing.

6. **`ImportPlan.sharedItems` is the one deviation that is wider than its criterion needs.**
   The other three added sections (`sheets`, `supplierVariants`, `conflicts`) and the two
   added item fields (`cells`, `reviewReasons`) carry information genuinely unrecoverable
   from `{ suppliers, itemTypes, items }` — I checked each claim, and AC-16 really would be
   unsatisfiable without them, exactly as the implementer states. `sharedItems`, though, is
   computed at `workbook-plan.ts:565` from `items.filter(i => i.links.length > 1)`, so the
   report could derive it too. It is non-monetary and pure, so it costs nothing; noted only
   because the deviation list presents all four as forced.

7. **Deviations 1, 3, 4 and 5 are all genuinely forced,** and I tested rather than accepted
   each claim. Trimming `YardSheetRow.supplier` would collapse `Meon ` and `Visever ` into
   their canonical spellings before `buildImportPlan` could notice them, leaving
   `supplierVariants[]` with two entries instead of AC-16's four and `Meon` with a row count
   of 31 instead of 1 — AC-16 would be unsatisfiable. `buildImportReport` cannot obtain a
   file name, a byte length or a digest from a plan or a diff. An object-shaped `counts`
   would put the key `prices` in the report, which AC-17 forbids by name — and
   `ImportOutcome.created`/`.skipped` correctly keep the Contract's object shape, since
   AC-17 constrains the report and not the outcome. The `{ source, plan }` input is the only
   way to reach the transaction with the blank description AC-24 demands, because AC-7 makes
   the reader refuse it first; I used that same seam to force three independent
   mid-transaction failures.

8. **The development database is consistent and correctly scoped.** 10 / 19 / 140 / 129 /
   152, links 82 / 70, 140 active, 15 `needsReview`, 10 with notes, zero orphan prices and
   zero orphan links, and the only description held by more than one item is
   `Bicycle Logo's  1200mm` — AC-11's deliberate Kestrel/Kelly pair. `Location` still holds
   exactly `loc_dublin/DUBLIN` and `loc_clonmel/CLONMEL`; `User`, `StockCount` and
   `StockCountLine` are all 0. A fresh `npm run seed:workbook` reports **0 divergences**,
   which is the strongest available statement that what is stored is what the workbook says.

---

## What I changed, and what I did not

Nothing in the repository. `git status --porcelain -uall` is character for character what it
was when I started — the same six modified and ten untracked paths. Every script, fixture
and report I generated lives in the session scratchpad, outside the repository.

I did touch the **test** database: my AC-24 re-runs called `resetTestDb()` before and after,
so the test branch is in exactly the state `npm run test:db` leaves it in (2 `Location`
rows, everything else empty). The development database was only read, plus one no-op
`npm run seed:workbook` re-run that created 0 rows. `Samples/` was opened read-only and is
byte-identical.

---

# Second pass — 2026-09-10

**Verdict:** APPROVED
**init:** green — `./init.ps1` exit 0, `[OK] Environment ready`, **database checks
executed**. 17 unit files / **191** tests (was 183; +8 exactly accounts for the 2
`describeSource`, 3 `planWorkbook` and 3 second-pass tests), 26 e2e passed, 8 db files / 95
tests. I ran it myself; I did not take the coordinator's run or the implementer's on trust.

Both required changes are done and both are real, not cosmetic. All three observations are
addressed. The one new piece of production logic — the `xlsx.load` wrap — is correct and
correctly scoped. Every one of the 31 criteria now passes, including AC-16, which failed
last time.

I did **not** re-derive the workbook figures or re-run the six `diffPlan` fixtures. Nothing
in this round touched `buildImportPlan`, the reader's cell logic or the matching rules
themselves, so the first pass settles them and I have no reason to disagree.

One finding, reported below and **not blocking**: the new ESLint fence has three holes I
reproduced, and one sentence in `docs/architecture.md` overstates what it guarantees.

---

## Required 1 — `describeSource` — CLOSED

`workbook-plan.test.ts:943-974`. Two tests:

- `:951` calls `describeSource` on the real workbook bytes and asserts the **whole object**,
  with `byteLength: 90567` and
  `sha256: 6308ae040163d3d008cb0622fc83c70987ceaf44389d59a457ab5e6a2f54bff0` as literals.
  Those are the two figures I computed with `sha256sum` in the first pass, and which the
  coordinator says it re-derived with Python `hashlib`. Three independent derivations agree.
- `:961` flips byte 1000 and asserts the length is unchanged, the digest is not, and the
  digest is still 64 lower-case hex characters. **This is the test that matters**: it is
  what stops the first one passing on a function that returns a constant, which was the
  exact defect I raised.

AC-16's `source` clause is now proved by a test rather than by a transcript. AC-16 → PASS.

## Required 2 — `planWorkbook` — CLOSED, and it found a real bug

`workbook-plan.test.ts:976-1014`. One success test (140 planned items, the `Item` count row
`{planned: 140, created: 140, skipped: 0}`, 15 `needsReview`, `divergences: []`,
`byteLength` 90567) and **two** failure tests (a non-`.xlsx` buffer → `ValidationError`
matching `/xlsx/`; a workbook with `Dublin` and no `Clonmel ` → `ValidationError` matching
`/Clonmel/`). All three run in `npm run test:unit`, which is where AC-27 requires them.

Checkpoint C2.4 is now satisfied: every new exported service function — `importWorkbook`,
`planWorkbook`, `describeSource` — has both a success and a failure test.

### The `readYardSheets` error wrap, reviewed as new code

`src/lib/excel/workbook-reader.ts:341-353`. My assessment, point by point:

- **The scope is the narrowest possible.** The `try` wraps exactly one statement,
  `await workbook.xlsx.load(arrayBuffer)`. `readSheet`, `findTotalRow`, `cellPrice` and the
  missing-sheet check all sit **outside** it, so no `ValidationError` this module already
  raised can be caught and re-wrapped, and none of AC-2's, AC-3's, AC-6's or AC-7's messages
  changes. I confirmed that against the suite: `workbook-reader.test.ts`'s six refusal tests
  all still assert their original strings and all still pass.
- **Can it swallow something that should surface differently?** Everything `xlsx.load` can
  throw for — a non-ZIP byte sequence, a truncated archive, an encrypted workbook, malformed
  part XML — is the same fact: *this file is not a workbook I can read*. That is a bad input,
  not a bug, and `ValidationError` is the right class for it. The one misclassification I
  can construct is a resource failure (an allocation error on a very large buffer) being
  reported as "could not be opened as an .xlsx workbook"; the original message is
  concatenated into the new one, so the truth is still on screen. I would not hold the
  feature for that.
- **Behaviour, executed.** `npm run seed:workbook -- --file <a text file named .xlsx>` now
  prints one line —
  `[seed:workbook] the file could not be opened as an .xlsx workbook: Can't find end of central directory : is this a zip file ?`
  — and exits 1. No stack trace, which is what AC-26 demands and what the old code violated.
- **One nit, non-blocking.** The wrap does not chain the original via `cause`, so a genuinely
  internal ExcelJS failure loses its stack. The message survives, so nothing is hidden; if
  `DomainError` ever grows a `cause`, this is the first call site that wants it.

### The new transitive `@/server/db` import in the pure suite — re-checked, and harder

`workbook-plan.test.ts:12` imports `planWorkbook` from
`@/server/items/workbook-import-service`, which imports `@/server/db` at `:5`. The
coordinator was right that this is the kind of thing that passes today and regresses
silently, so I did not settle for the unresolvable-host run:

| Condition | `npm run test:unit` |
|---|---|
| `DATABASE_URL` etc. on `host.invalid` / `host2.invalid` | **17 files / 191 tests pass**, exit 0 |
| `DATABASE_URL`/`DIRECT_URL`/`TEST_*` set to the literal string `not-a-database-url` | **17 files / 191 tests pass**, exit 0 |
| `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, `TEST_DIRECT_URL` **removed from the environment entirely** | **17 files / 191 tests pass**, exit 0 |

The second and third rows are the stronger proof, and the reason I ran them: a malformed or
absent URL makes the **`PrismaClient` constructor itself** throw, not just the first query.
Negative control, same nonsense URL, touching `db` for real:
`await db.item.count()` → `PrismaClientInitializationError`. So the suite is not merely
avoiding a connection, it never constructs a client at all — `src/server/db.ts`'s lazy proxy
holds through the new import chain.

Also re-run with all four URLs unresolvable: `typecheck` 0, `lint` 0, `test:unit` 0,
`build` 0, `seed:workbook -- --dry-run` 0 (`Item 140 140 0`, "no database was opened").
AC-27 → PASS, unweakened.

## Observation 1 — determinism — CLOSED, and verified against a real database

`workbook-import-service.ts:200-233`: `orderBy: { id: "asc" }` on **all six** reads, with the
reason written above them in the code rather than left in a document. I checked no read that
can influence matching was missed — those six are the only `findMany`/`findFirst`/`findUnique`
calls in the feature, `planWorkbook` passes a hardcoded empty set, and every other lookup in
`diffPlan` goes through a map keyed on a unique id.

I re-ran the exact case I broke in the first pass, this time end to end through
`importWorkbook` against the test branch — two stored `Thing` rows, one under `Kelly` and one
under `Kestrel`, inserted in both orders, four imports each:

```
kelly-first:   stored rows by id asc = [Kelly, Kestrel]   claimed on 4 runs = [Kelly, Kelly, Kelly, Kelly]
kestrel-first: stored rows by id asc = [Kestrel, Kelly]   claimed on 4 runs = [Kestrel, Kestrel, Kestrel, Kestrel]
```

Both STABLE. The nondeterminism is gone, and the rule is now a stated one: **the lowest-`id`
stored row of that description wins**. Arbitrary, but stable, reportable and the same on
every run — which is all AC-16's determinism promise needs.

## Observation 2 — the second pass is pinned — CLOSED

`workbook-plan.test.ts:1016-1100`, three tests stating what I previously had to discover by
experiment: a planned item **with** a supplier never claims another supplier's row
(`:1053`); an exact key match always beats the loose one, with the supplier-less stored row
deliberately listed **second** so a loose-first implementation would fail (`:1065`); and a
row an exact match already claimed is not claimed again (`:1086`).

One nit, non-blocking: the third test passes for a different reason than its comment gives.
It is the `item.supplierName !== null` early return at `workbook-plan.ts:660` that stops the
Kestrel item, not the `claimed` set — the `claimed` set is only load-bearing when a
**supplier-less** planned item meets a stored row that an exact match has already taken, and
no test constructs that. I verified that case by hand in the first pass (fixture 2) and it
behaves correctly. Worth one more test some day; not worth a round trip now.

## Observation 3 — the doc, and the lint fence

### Judging the relaxation adversarially

I am satisfied with the direction of the amendment, and I looked for reasons not to be.

- The rule as written (`src/lib/excel/` never imports from `src/server/`) was genuinely a
  proxy. The stated *why* in the same document is "this is what makes exports unit-testable
  without a database" — a purpose `@/server/errors` cannot defeat, because it is four class
  declarations extending `Error` and it imports nothing at all. I re-read it to confirm that.
- The spec forced the collision, not the implementer: AC-2, AC-6 and AC-7 each require **the
  reader itself** to throw `ValidationError`.
- The amendment is narrower than the rule it replaces in one respect and wider in another:
  it now covers all of `src/lib/**` rather than only `src/lib/excel/`, and it names a single
  permitted module. Before this feature there was **no lint rule at all** on `lib → server`,
  so in enforced terms the boundary is strictly tighter after the change than before it.
- The cleaner alternative (move the error classes to `src/lib/errors.ts`, re-export from
  `src/server/errors.ts`) is recorded in the doc as still open rather than quietly dropped.
- I proved the amendment is not a licence: the `@/server/errors` import at
  `workbook-reader.ts:3` is the only `lib → server` import in the tree.

Relaxing a rule to match code deserves the suspicion the coordinator asked for, and this one
survives it. The doc did not stop describing a real constraint; it started describing the
right one.

### Defeating the fence — three holes, reproduced

I wrote a probe file under `src/lib/`, ran `npm run lint`, and deleted it. Twelve import
shapes, nine blocked:

| Shape | Result |
|---|---|
| `@/server/db` | **blocked** |
| `@/server/items/workbook-plan` (a service) | **blocked** |
| `../server/errors` (the relative reach-around) | **blocked** |
| `../server/db` | **blocked** |
| `./../server/db` | **blocked** |
| `@/server/./db` | **blocked** |
| `@/server/errors/../db` | **blocked** |
| `@/SERVER/db` | **blocked** (`no-restricted-imports` regex patterns are case-insensitive by default) |
| `export * from "@/server/db"` | **blocked** |
| `@/./server/db` | **PASSES LINT** |
| `@/../src/server/db` | **PASSES LINT** |
| `await import("@/server/db")` | **PASSES LINT** |

The first two are not theoretical. I confirmed both **typecheck clean** (`tsc --noEmit`
exit 0) and **resolve at runtime** — a throwaway vitest file importing `@/./server/db`
loaded `src/server/db.ts` and passed. The third is a limitation of `no-restricted-imports`,
which does not visit `ImportExpression` in this configuration.

The one the coordinator was most worried about — a relative path going behind the alias's
back — **is** blocked, in all three spellings I tried.

**Why this does not block approval.** No acceptance criterion requires the lint rule; AC-31
merely lists `eslint.config.mjs` as a changed file. The code obeys the rule. The fence is
defence-in-depth that did not exist before this feature, and it stops every shape a developer
would plausibly write. What is wrong is one *sentence*: `docs/architecture.md` says the
exception "cannot widen to a service or to `@/server/db` without the lint step going red",
and for three spellings it can. That is an overstated guarantee in a governing document,
which is worth fixing precisely because people will rely on it.

**The fix, for whoever picks it up (next session, not a blocker).** Replace the two patterns
in `eslint.config.mjs` with one that matches the *path*, not its prefix — something on the
shape of `(^|/)server(/|$)` with the `errors` exception kept — which catches `@/./server/db`,
`@/../src/server/db` and every relative form in one rule while still admitting
`@/server/errors`. Dynamic `import()` needs either the `@typescript-eslint` variant of the
rule or a small `no-restricted-syntax` rule on `ImportExpression`. Until then,
`docs/architecture.md`'s sentence should read "enforced by ESLint for every ordinary import
form" rather than an unqualified "cannot".

## AC-31's amendment — honest, and not widened

The spec's `## Post-approval amendments` now carries a second entry adding exactly
`eslint.config.mjs` and `docs/architecture.md` to AC-31's file list, and nothing else. I
checked both directions:

- Both files were changed **because the review required them**, not by the implementer's
  choice, and the amendment says so.
- The list did not widen anywhere else — I diffed AC-31 old against new: the only insertion
  is the two file names, before `specs/features/005-seed_from_workbook.md`.
- `feature_list.json`'s 31 `acceptance[]` entries still match the spec's 31 criteria
  character for character (checked programmatically: 0 mismatches), amended AC-17 and AC-31
  included.
- `git status --porcelain -uall` lists exactly the nineteen paths AC-31 now permits — the
  seventeen from the first pass plus `eslint.config.mjs` and `docs/architecture.md`. Still
  nothing under `src/app/`, `src/components/`, `prisma/` or `Samples/`.

---

## Acceptance criteria — second pass

AC-1 to AC-15, AC-17 to AC-25 and AC-28 to AC-30 are unchanged and were settled in the first
pass; the first-pass table stands. The four that moved:

| AC | First pass | Now | Evidence |
|----|-----------|-----|----------|
| AC-16 | **FAIL** | **PASS** | `workbook-plan.test.ts:951,961` — `describeSource` on real bytes, whole object asserted, plus the one-byte-flip test that makes a constant impossible. |
| AC-26 | PASS | PASS (improved) | Executed again. Re-run creates 0 and exits 0; a non-workbook file now exits 1 with one line naming the problem instead of a JSZip stack trace. |
| AC-27 | PASS | PASS (re-proved harder) | `planWorkbook` now has three tests in `test:unit`; the suite passes with the database URLs unresolvable, malformed **and absent**, against a negative control that shows a real client would fail. |
| AC-31 | PASS | PASS | Amended list matches the working tree exactly, and `feature_list.json` matches the amended spec. |

## Checkpoints — items the changes touched

- C1.3 [x] **Every numbered acceptance criterion is satisfied.** AC-16's `source` clause,
  the one gap, is closed by a test.
- C1.4 [x] `feature_list.json` still mirrors the spec exactly, both amendments included.
- C1.5 [x] `progress/impl_seed_from_workbook.md` § Review outcome records all five items, the
  production change and the one file outside AC-31's original list — accurately, this time.
- C2.1 [x] `init` green, database checks executed. I ran it.
- C2.2 [x] `npm run typecheck` — 0 errors, after my probe files were removed.
- C2.3 [x] `npm run lint` — 0 errors, `--max-warnings 0`.
- C2.4 [x] **Now satisfied.** `importWorkbook`, `planWorkbook` and `describeSource` each have
  a success test and a failure test.
- C2.5 [x] The new tests assert real values — `90567`, the 64-hex digest, 140, 15, and named
  item ids on the matching-pass tests.
- C2.6 [x] Real workbook bytes, real Postgres, no mocked client.
- C3.3 [x] `src/lib/excel/` reaches no database and no network. The `@/server/errors` import
  is now a **named, documented, lint-enforced** exception rather than an undeclared breach —
  the substance of my first-pass observation 3, resolved.
- C5.2 [x] Errors are typed domain errors. The one path that previously escaped as a raw ZIP
  error is now a `ValidationError`; the residual raw-Prisma-error path from the first pass's
  observation 4 is unchanged and stays a non-blocking note.
- C6.2 [x] No temp or scratch file left. `src/lib/` holds exactly this feature's four files.

Everything else in the C1–C6 walk stands as marked in the first pass. **No unchecked box
remains.**

---

## Non-blocking, carried forward

1. **The lint fence's three holes**, above — `@/./server/db`, `@/../src/server/db` and
   dynamic `import()`. One regex closes the first two. `docs/architecture.md`'s "cannot
   widen … without the lint step going red" should be qualified until it does.
2. **The `claimed`-set test proves its point by the wrong mechanism** (second pass,
   Observation 2 above).
3. **The `xlsx.load` wrap does not chain `cause`.** The message survives; the stack does not.
4. Still open from the first pass, unchanged and still non-blocking: a database constraint
   violation escapes `importWorkbook` as a raw `PrismaClientKnownRequestError` rather than a
   typed domain error (first pass, observation 4); `--dry-run` prints `created 140` for a run
   that creates nothing (observation 5); `ImportPlan.sharedItems` is derivable from `items`
   (observation 6); AC-17's scans cannot catch an integer price glued mid-string, which the
   workbook itself makes unavoidable (first pass, "AC-17 in detail").

None of these is a defect in what the feature promises. They are the next session's material.

---

## What I changed, and what I did not — second pass

Nothing in the repository. I created `src/lib/zz-reviewer-fence-probe.ts` and a matching
`.test.ts` to attack the lint fence, and **deleted both**; `npm run lint` and
`npm run typecheck` are green afterwards and `git status --porcelain -uall` is character for
character what it was when this pass began — the same eight modified and eleven untracked
paths. Every script and fixture I wrote lives in the session scratchpad, outside the
repository.

I touched the **test** database again for the determinism check, calling `resetTestDb()`
before and after, and left it in the state `npm run test:db` leaves it in (2 `Location` rows,
every other owned table empty — verified). The development database was read and given one
no-op `npm run seed:workbook` re-run that created 0 rows and reported 0 divergences.
`Samples/` and `prisma/` are byte-identical: `git status --porcelain -- Samples prisma` is
empty.

`#5` is left `in_progress`. The user closes features, not the reviewer.
