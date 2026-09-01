# Review — feature 1 repo_harness

**Verdict:** CHANGES_REQUESTED
**Spec:** `specs/features/001-repo_harness.md` (11 numbered criteria)
**init:** green — both scripts, exit 0
**Round:** 3 (targeted re-check of round 2's ten required changes)

Seven of the ten are genuinely fixed. Two are **half-fixed in a way that leaves the
repository worse than before on one side**, one introduces a small new workbook-fact
error, and the criterion that failed in round 2 for those reasons — AC-11 — still fails.
AC-10 now passes.

Four edits close this out. Three of them are one line each.

> **On the independence of this pass.** The coordinator did not commission a third full
> review and told me so, which changes what this pass can claim. I re-derived every
> disputed fact from `Samples/Stock @ 01-Sep-2026.xlsx` rather than accepting the
> hand-off, and I checked the adjacent surfaces I was asked to. But I am checking my own
> findings, and that will not surface a class of problem a cold reader would. Two of the
> four items below were found by looking at what my own fixes touched — which is exactly
> the blind spot being described. Read the verdict with that weighting.

---

## Gate runs (this reviewer, from the repository root)

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./init.ps1`
final line **`[OK] Environment ready`**, exit code **0**.

`bash ./init.sh`
final line **`[OK] Environment ready`**, exit code **0**.

Both printed byte-identical bodies:

```
==> Harness integrity
    [ok]   17 required files present

==> Feature list
    [ok]   feature_list.json parses
    [ok]   18 features, 1 in progress

==> Source workbook untouched
    [ok]   Samples/ has no uncommitted changes

==> Application
    [skip] no package.json yet (feature #2 app_scaffold)

[OK] Environment ready
```

`Samples/` untouched: `git status --porcelain -- Samples` empty. The workbook was read
read-only through `zipfile` over the XML parts throughout.

---

## The ten round-2 required changes, re-checked

| # | What it required | Verdict | Evidence |
|---|---|---|---|
| 1 | `feature_list.json` `acceptance[]` for #1 = the spec's eleven criteria, verbatim | **FIXED** | Checked mechanically, not by eye: parsed the 11 numbered criteria out of `specs/features/001-repo_harness.md` and compared each, whitespace-normalised, against `feature_list.json:39-51`. All 11 match **character for character**. AC-11 and the four truncated clauses (AC-4 `tools:`, AC-7 naming, AC-10 open-question, AC-3 rename) are all present. |
| 2 | #17 must be blocked by Q8, not the closed Q6 | **FIXED** | `feature_list.json:218` now reads `"Q8 in specs/domain-model.md - a full boiler is 200kg on Dublin and 250kg on Clonmel; which is right?"`, matching `specs/domain-model.md:530`. #18 -> Q7 unchanged and correct. The scope error went too: `:213` now says "for BOTH yards - Dublin has its own trucks 09D, 10D and 141D at Dublin!AM94:AS96", agreeing with `specs/domain-model.md:95`. |
| 3 | Five dead `specs/001` / `specs/000` references | **FIXED** | Repo-wide grep for `specs/001`, `specs/000`, `001-domain-model`, `000-product-brief`, `specs/NNN` across `*.md`, `*.json`, `*.ps1`, `*.sh`: all five named sites are clear. `README.md:42`/`:55` now use `specs/features/NNN-<name>.md`; `docs/architecture.md:17` cites `specs/domain-model.md`; `feature_list.json:70`, `:81`, `:92` now say `specs/domain-model.md Part 6 / Part 3 / Part 2`. Four occurrences survive in `progress/current.md` — see Observations. |
| 4 | Part 5 and `product-brief.md:30`: stop describing the 8-count Dublin sheet | **PARTIALLY FIXED — and one half went backwards** | Fixed: `specs/domain-model.md:437` now says "In Dublin's **November 2025** count (column `S`), 27 of 82 ..." and adds "The most recent count, `AI` (2026-07-31), gives **35 of 82**". Both figures re-verified from the sheet (column `S`: 18 blank + 9 zero = 27; column `AI`: 35 blank, 0 zero). **Not fixed, and now self-contradictory:** `:430` relabels the table "Quantities across the **16 counts**" while rows `:432-435` still carry **8 values each** — I counted them programmatically. The header was changed and the data was not. Before this edit the table was stale but internally consistent; it is now internally inconsistent. **Not fixed at all:** `specs/product-brief.md:30` still reads "In Dublin's **last valid count (Nov 2025)**, 27 of 82" — the exact phrase, and the exact AC-11 contradiction with Part 1 `:59` (`AI`/`AJ` = `2026-07-31`, EUR 44,929.63). |
| 5 | The 151/69/rows-3-70 item arithmetic | **FIXED** | `specs/domain-model.md:228-230`: "82 populated descriptions on Dublin (`A3:A84`) and 68 on Clonmel (`A3:A70`) = **150 item rows**. (`'Clonmel '!A71` is the string `TOTAL`, not an item.)" Re-counted from the sheets: 82 and 68, and `'Clonmel '!A71` is `TOTAL`. Correct. |
| 6 | The invented leading-`t` supplier rule | **FIXED on substance; introduces one new error** | The rule is gone and the replacement is right, and I verified the whole explanation independently: `xl/sharedStrings.xml` contains **exactly five** entries with multiple `<r>` runs, and their concatenated texts are exactly the five now listed — `White - Briteline`, `Yellow  - Briteline`, `Stick On Studs - Meon`, `Stick On Studs - Roadcraft  1st July`, `Anti Skid Buff  - Kelly's`. Reading only the first run yields `White - `, `Yellow  - `, `Stick On Studs - `, `Stick On Studs -`, `Anti Skid Buff  - `, which is the documented failure mode. The five cell references `'Clonmel '!A9, A10, A22, A23, A24` are correct. The importer rule (concatenate every `<t>` descendant) is the right rule. **New error:** the closing paragraph says "One **Clonmel** row has no supplier at all". Scanning both item ranges, the single supplier-less row is **`Dublin!A45`** (`School Logo Triangle`). No Clonmel row lacks a supplier. |
| 7 | `Dublin!A43` is not an incomplete row; the count is 13 | **FIXED** | `specs/domain-model.md:241-245` lists 13 cells and explicitly retracts `A43` with its values. I re-derived the list under the broadened "missing a supplier, a unit or a price" wording: Dublin 9, 12, 18, 29, 44, 45, 46, 47, 48, 62, 63, 78 and `'Clonmel '!A54` — **exactly the 13 cited, in order**. Row 45 is the supplier-less row and was already in the set, so broadening the criterion did not change the count. Cosmetic defect only — see Observations. |
| 8 | `Summary` has 44 month columns, not 40 | **PARTIALLY FIXED** | Fixed: `specs/domain-model.md:15` now reads "**44** month columns (`B1:AT1`), back to `2019-06-30`. `B1` is text; the other 43 are date serials" — which matches the sheet exactly (44 populated cells in `B1:AT1`, `B1` the text `31-11-25`, `AT1` = `2019-06-30`). **Not fixed:** `specs/product-brief.md:94` still says "the **40 months** of historical counts". Fixing one side of a two-sided claim has converted a shared error into a **new document-to-document contradiction**. |
| 9 | `spec-writer.md:71` model criterion keyed on date, not period | **FIXED** | Now: `"AC-3: Creating a second count for the same location and period returns a 409 and the message `Count for DUBLIN in 2026-09 already exists`"`. Agrees with Invariant 6 (`specs/domain-model.md:330`), `docs/conventions.md:86` and `reviewer.md:48`. A repo-wide grep finds no surviving "location and date" outside the progress log's account of the fix. |
| 10 | Glossary "twelve columns left"; the phantom `20 Kgs` unit | **FIXED** | `docs/domain-glossary.md:32` now says row 9 "counts **eleven**, not twelve, so the two most recent figures compare against the wrong month" — which matches `Summary!B9 = +B5-M5` and `C9 = +C5-N5` (11 columns) against `D9 = +D5-P5` (12), and agrees with `specs/domain-model.md:121`. `20 Kgs` is gone and the real `20Kg` is present in both `docs/domain-glossary.md:85` and `specs/domain-model.md:217`; that list's twelve kilogram variants now match the twelve in the sheets exactly. Bonus, correctly done: `docs/domain-glossary.md:28` no longer claims `Swept Path Markers` is a one-off and says why. |

**Score: 7 fixed, 2 partially fixed, 1 fixed with a new error introduced.**

## Adjacency checks — did the fixes break anything nearby?

Asked specifically about `feature_list.json` and `specs/domain-model.md` Parts 2 and 5.

- **`feature_list.json` is structurally sound.** Parses; 18 features; no duplicate ids
  (`1..11, 12, 14, 15, 16, 17, 18, 19`); every feature carries all nine expected keys;
  only #1 has a non-empty `acceptance`; `status` values are `{in_progress, pending}` and
  `spec_status` values `{draft, missing}`, all inside `rules.valid_*`. Both gates parse it
  green.
- **`acceptance[]` is correct today but nothing enforces it.** `progress/current.md:138`
  claims "`acceptance[]` is now generated from the spec, so the two cannot drift." There
  is no generator in the repository and `init` does not compare the array against the
  spec — it only checks that the array is non-empty when a feature goes `done`
  (`init.ps1:109-111`). The array happens to be verbatim-correct; the guarantee is
  asserted, not built. This is the same shape as the `scratchpad/genpart1.py` claim, and
  it is the highest-value follow-up available, because array-versus-spec drift is
  precisely what round 2's C1.4 caught.
- **`specs/domain-model.md` survived the edits structurally.** No ragged markdown tables
  anywhere in the file (checked every table block for consistent column counts), no
  over-long orphan lines. Part 1's numbers are intact after the Summary-row rewrite: the
  Dublin and Clonmel count tables, the `-EUR 362.05` drift, the
  `Summary!K19`/`!L19`/`!R19` plugs of `-1, -1, 1`, `Dublin!AM94:AS96`, Invariant 10's
  `Decimal(18,8)` and the `*(closed)*` marker on Q6 are all still present and still
  correct.
- **Part 5 is the one place an edit did damage** — the "16 counts" header over 8-value
  rows, item 4 above. Part 2 absorbed several edits cleanly apart from the "Clonmel" /
  "Dublin" slip in item 6.
- **AC-10 now passes.** Q1-Q5 answered; the "Still open" table lists Q6 `*(closed)*`,
  Q8 -> #17, Q7 -> #18; `feature_list.json` references Q8 and Q7 from the matching
  features. Every open question is referenced by the feature it blocks, and nothing before
  M7 is blocked.
- **AC-11 still fails**, on `specs/domain-model.md:430` (table header versus its own
  rows), `specs/product-brief.md:30` (versus Part 1) and `specs/product-brief.md:94`
  (versus `specs/domain-model.md:15`). The money-precision and `COUNTER`/`MANAGER` clauses
  pass cleanly; the dead-filename clause passes at all five sites it failed on.
- **No file outside feature #1's scope was touched.** `git status --porcelain` is
  unchanged in shape from round 2: the same 18 modified files, the same two renames, the
  same three untracked paths. No new commits.

## Required changes

1. **`specs/domain-model.md:430-435` — the table header says 16 and the rows carry 8.**
   Either restore the header to 8 and say the table shows the first eight columns, or put
   the real series in. Verified from the sheet, `G` through `AK`:
   `Swept Path Markers for Transdev` = -,-,-,-,580,580,65,-,65,-,-,-,-,-,-,- ;
   `EV ONLY text for Epower` = 0,-,0,0,60,-,105,0,24,32,24,-,18,18,18,- ;
   `Disabled Logo on Purple B'ground` = -,-,-,-,-,1,1,1,1,1,1,-,-,-,-,- ;
   `Pre-form for Lucan ETNS` = 0,-,0,1,1,1,0,-,1,-,-,-,-,-,-,- .
2. **`specs/product-brief.md:30` — "In Dublin's last valid count (Nov 2025)".** Same fix
   already applied at `specs/domain-model.md:437`: it is the November 2025 count, not the
   last valid one. Part 1 `:59` documents a valid count eight months later.
3. **`specs/product-brief.md:94` — "the 40 months of historical counts".** `Summary`
   carries 44 month columns; `specs/domain-model.md:15` now says so and this line
   contradicts it.
4. **`specs/domain-model.md`, end of the Suppliers section — "One `Clonmel` row has no
   supplier at all".** It is `Dublin!A45` (`School Logo Triangle`). No Clonmel row lacks a
   supplier. One word, but it is a workbook fact in the section the #5 importer is written
   from, and it is already cited correctly two bullets later as one of the 13 incomplete
   rows.

## Observations (non-blocking)

- **`progress/current.md` still carries four `specs/001` / `specs/000` references**
  (`:20`, `:31`, `:50`, `:135`). I did not list these in round 2 and I am flagging them
  now rather than quietly ignoring them: `:31` ("the money boundary, `specs/001` Part 6")
  and `:50` ("Recorded in `specs/001` Part 1 with cell references") are live pointers to a
  filename that no longer exists, which is the AC-11 clause. I am not blocking on them
  because `AGENTS.md:70-73` has `current.md` reset to an empty template at session close.
  **But the same rule moves its summary into `progress/history.md` first** — if that
  happens verbatim, four dead pointers become permanent in the append-only log. Fix them
  when the summary moves, not before.
- `specs/domain-model.md:241-245` is grammatically broken by the insertion: "Rows missing
  a supplier, a unit or a price - **13 exactly**: ... (`Dublin!A43` ... `E43` is `350`.)
  are imported as items with `active: true` ...". The parenthetical sits between the
  subject and its verb, so the sentence ends in a full stop and then continues " are
  imported". The content is right; the sentence needs re-joining.
- `specs/domain-model.md` still lists `Visever` and `Visever ` as two variants. Only the
  trailing-space form occurs in the sheets. Harmless — the normaliser trims either way.
- Round 2's remaining observations stand unaddressed and remain non-blocking: the
  unreproducible "nine of 31 count columns" figure (I can derive six), "over EUR 270,000"
  for four columns that hold EUR 721,489.52, "four times any other" for a 3.3x ratio, the
  `000`/`001` headings still at the top of the two renamed reference documents, the
  EUR 136,246.93 versus EUR 136,038.72 pairing in `current.md`, `AGENTS.md:61`'s
  `specs/<its spec_file>`, the `KG_PER_FULL_BOILER = 250` example sitting on top of open
  Q8, the Q1/Q6 and Q2/Q7 duplication, the untested `init` feature-list logic, and the
  unowned session-close step.
- Worth recording, because it is the strongest evidence in this feature's file that the
  process works: the leading-`t` supplier rule was not merely deleted, it was **diagnosed**
  — traced to a rich-text reader bug, the five affected strings identified by cell, and a
  concrete importer rule written so the same bug cannot recur downstream. I re-derived all
  of it from `sharedStrings.xml` and every part of it holds. A wrong fact was turned into
  a correct rule rather than papered over, which is the outcome a review process exists to
  produce.

---

# Appendix A — Round 2 review (verbatim, superseded)

Round-2 verdict was **CHANGES_REQUESTED**, `init` green, against the same spec. Its ten
required changes are the ones re-checked above. Its acceptance-criteria table, checkpoint
walk (C1-C7) and workbook verification remain the substantive record for this feature, and
its "Round-1 disposition" section is the record of round 1's fifteen items. Everything
below this line is reproduced unchanged; where it says "AC-10 FAIL" or refers to the ten
required changes as open, read it against the round-3 table above.


This is review round 2. Round 1's 15 required changes were checked one by one: **13 were
genuinely fixed** (not papered over — I re-derived each from the workbook or the file),
and **both rejections are accepted**, one because the evidence proves the implementer
right and one because round 1 itself offered the alternative that was taken. See
*Round-1 disposition* below.

What blocks approval now is different from what blocked it before. Round 1 rejected a
harness with a wrong Part 1 and a `Decimal(12,4)` landmine. Both are gone. What remains is
that **the rename of `specs/000`/`specs/001` to `specs/product-brief.md` /
`specs/domain-model.md` was not followed through**: five places still point at the old
filenames, `feature_list.json`'s `acceptance[]` for #1 still describes the old layout and
is missing an entire criterion, Part 5 and the product brief still describe a Dublin sheet
with 8 counts that Part 1 now says has 16, and the newly-created Q8 blocks a feature that
has never heard of it. AC-10 and AC-11 are the two criteria that exist to catch exactly
this, and they catch it.

---

## Gate runs (this reviewer, from the repository root)

`powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./init.ps1`

```
==> Harness integrity
    [ok]   17 required files present

==> Feature list
    [ok]   feature_list.json parses
    [ok]   18 features, 1 in progress

==> Source workbook untouched
    [ok]   Samples/ has no uncommitted changes

==> Application
    [skip] no package.json yet (feature #2 app_scaffold)

[OK] Environment ready
```

Final line `[OK] Environment ready`, **exit 0**.
`bash ./init.sh` prints a byte-identical body, final line `[OK] Environment ready`,
**exit 0**.

### The new `spec_file` naming rule fires

Proven on a throw-away copy of the harness in the session scratchpad, outside this
repository. No tracked file was modified to produce any of this.

Four `spec_file` faults injected at once:

```
    [FAIL] #1 repo_harness spec_file is 'specs/domain-model.md'; convention requires 'specs/features/001-repo_harness.md'
    [FAIL] #4 domain_schema spec_file is 'specs/features/009-domain_schema.md'; convention requires 'specs/features/004-domain_schema.md'
    [FAIL] #6 item_master_ui spec_file is 'specs/006-item_master_ui.md'; convention requires 'specs/features/006-item_master_ui.md'
    [FAIL] #7 entry_start spec_file is 'specs/features/007-count_create.md'; convention requires 'specs/features/007-entry_start.md'

[FAILED] 4 problem(s):
```

`init.sh` exit **1**; `init.ps1` exit **1**. The rule catches a wrong directory, a wrong
number, and a wrong slug, and it caught the exact historical defect (#1 pointing at a
reference document) that motivated it.

The other feature-list rules plus the two structural rules were then fired together:

```
    [FAIL] missing required file: docs/conventions.md
    [FAIL] leader.md: missing YAML frontmatter
    [FAIL] #2 app_scaffold declares spec_status 'approved' but specs/features/002-app_scaffold.md does not exist
    [FAIL] #3 auth_and_roles has invalid status 'nonsense'
    [FAIL] #5 seed_from_workbook has invalid spec_status 'bogus'
    [FAIL] #7 entry_start is done but its spec is not approved
    [FAIL] #7 entry_start is done but has no acceptance criteria
    [FAIL] more than one feature in_progress: #1 repo_harness, #6 item_master_ui

[FAILED] 10 problem(s):
```

Both scripts produced the same ten lines in the same order and **both reported
`10 problem(s)`** — round 1's observation that `init.sh` collapsed every feature-list
fault into one is fixed (`init.sh:104-107`). `feature_list.json` replaced with `{ broken`
gives `feature_list.json is not valid JSON` on both. Every rule named in AC-7 has now been
observed firing.

## Scope

`git status --porcelain`: 18 modified files, 2 renames (`specs/001-domain-model.md` ->
`specs/domain-model.md`, `specs/000-product-brief.md` -> `specs/product-brief.md`), 3
untracked paths (`progress/impl_repo_harness.md`, `progress/review_repo_harness.md`,
`specs/features/`), on top of `db5568c`, `6beece0`, `4b9d7e3`. Every path is harness
scope. **Nothing outside feature #1's stated scope was touched**, and no application code
was created — correct, since `src/`, `tests/`, `package.json` and `prisma/` are not
expected until #2.

`Samples/` is untouched: `git status --porcelain -- Samples` empty, `git diff HEAD -- Samples`
empty, `git log --oneline -- Samples` shows only `db5568c`. This review read the workbook
read-only through `zipfile` over the XML parts.

---

## Acceptance criteria

| AC | Verdict | Evidence |
|----|---------|----------|
| AC-1 | PASS | `AGENTS.md`, `CLAUDE.md`, `CHECKPOINTS.md` present at root and substantive (82/47/73 lines); required by `init.ps1:22-24` / `init.sh:25-27`, confirmed by `[ok] 17 required files present`, and made to fail in the scratch copy. |
| AC-2 | PASS | `docs/architecture.md` (115), `docs/conventions.md` (113), `docs/verification.md` (131), `docs/domain-glossary.md` (96) all exist; enforced at `init.ps1:26-29`; deletion of `docs/conventions.md` produced `missing required file: docs/conventions.md`. |
| AC-3 | PASS | Reference docs are unnumbered — `specs/product-brief.md`, `specs/domain-model.md` (`ls specs/`), renamed under git so history follows (`RM` in `git status`). Feature specs live under `specs/features/`; `001-repo_harness.md` is the only one and matches its id and name. `domain-model.md` covers all five required subjects: layout Part 1 (`:9-160`), normalisation Part 2 (`:164-240`), schema Part 3 (`:244-339`), period model Part 4 (`:343-398`), roles and money boundary Part 6 (`:460-507`). Content defects are Required changes 4-8; they do not make the subjects undocumented. |
| AC-4 | PASS, with one unverifiable | All five agent files open `---` / `name:` / `description:` / `tools:` / `---`. `tools:` now permits the body's work in the two cases round 1 rejected: `explorer.md:4` and `reviewer.md:4` both grant `Write`, which `explorer.md:20` ("Write your findings to the file the leader named") and `reviewer.md:29` ("Write your verdict to `progress/review_<feature>.md`") require, and both bodies scope it to `progress/` in prose (`explorer.md:12-13`, `reviewer.md:11-13`). `implementer.md:4` and `spec-writer.md:4` grant `Write, Edit`, which their bodies need. `leader.md:4` `Agent` — see *Round-1 disposition*; accepted, but flagged as the one `tools:` value I cannot verify from inside the repository. |
| AC-5 | PASS | `progress/current.md` (119 lines), `progress/history.md` (60 lines, now carrying the session entry and the gate transcript), `progress/impl_repo_harness.md` (70 lines) all exist. Round 1's C1.5 and C6.1 gaps are closed. |
| AC-6 | PASS | Both runs above, exit 0, with no `package.json`, `src/`, `tests/` or `prisma/` present — `[skip] no package.json yet (feature #2 app_scaffold)`. |
| AC-7 | PASS | All rules observed firing in the scratch copy, transcripts above: required-file presence, agent frontmatter, JSON parse, invalid `status`, invalid `spec_status`, more than one `in_progress`, `spec_file` existence when `spec_status != 'missing'`, `spec_file` naming convention, `done` without `approved`, `done` with an empty `acceptance` array. The naming rule is at `init.ps1:100-103` and `init.sh:90-92` and is the criterion's headline clause. |
| AC-8 | PASS | `git log --oneline` -> `db5568c` (24 files, initial), `6beece0`, `4b9d7e3`. `.gitignore:2` `node_modules/`; `:7-11` `.next/ out/ build/ dist/ *.tsbuildinfo`; `:14-16` `.env`, `.env.*`, `!.env.example`. `git ls-files` lists no `.env` and no connection string. |
| AC-9 | PASS | See Scope. `Samples/` holds only `Stock @ 01-Sep-2026.xlsx`, added in `db5568c`, never re-touched. `.claude/settings.json:18-21` additionally denies `Edit`/`Write` on `./Samples/**`. |
| AC-10 | **FAIL** | Two halves; the second fails. Q1-Q5 are answered (`specs/domain-model.md:515-521`) and nothing before M7 is blocked. But the criterion also requires that *"every remaining open question is referenced by the feature it blocks"*, and **Q8 is referenced by nothing.** `specs/domain-model.md:530` names Q8 (a full boiler is 200 kg on Dublin, 250 kg on Clonmel) as blocking `#17 trucks_schema_seed`; `feature_list.json:217` still carries `"blocked_by_question": "Q6 in specs/domain-model.md - does Dublin have its own trucks?"` — and `specs/domain-model.md:529` marks Q6 **`*(closed)*`**. So #17 is gated on a question that is answered, and is not gated on the one that is open. Q7 -> #18 is correct (`:531`, `feature_list.json:229`). |
| AC-11 | **FAIL** | Money precision passes — `docs/conventions.md:74`, `docs/architecture.md:47`, `CHECKPOINTS.md:43` and Invariant 10 (`specs/domain-model.md:314`) all say `Decimal(18,8)`; round 1's most dangerous finding is genuinely fixed. `COUNTER`/`MANAGER` passes — the only surviving occurrence is `progress/current.md:29` recording their removal, a historical note rather than a reference. **The other two clauses fail.** *Spec filenames that do not exist* (5 sites): `README.md:42` "`specs/NNN-<feature>.md`" and `README.md:55` "`specs/NNN-*.md`" are the pre-rename convention; `docs/architecture.md:17` "(see specs/001)"; `feature_list.json:42` "specs/ contains 000-product-brief.md and 001-domain-model.md"; `feature_list.json:69`, `:80`, `:91` "specs/001 Part 6 / Part 3 / Part 2". *A question id cited in a state that no longer holds*: `feature_list.json:217` (see AC-10). *Documents contradicting each other* (4 sites): `specs/domain-model.md:408` "Quantities across the **8 counts**" and `:415` "Dublin's **last valid count (Nov 2025, column `S`)**" against Part 1 `:16` "**16 counts**" and `:59` `AI`/`AJ` = `2026-07-31` totalling EUR 44,929.63 — a valid count eight months later; `specs/product-brief.md:30` repeats the same stale sentence; `.claude/agents/spec-writer.md:71` teaches a model acceptance criterion keyed on "the same location **and date**" with the message `Count for DUBLIN on 2026-09-01 already exists`, which Invariant 6 (`specs/domain-model.md:308`) exists to forbid — "*not* per day"; `docs/domain-glossary.md:32` says Summary row 9 works "by counting **twelve** columns left" while `specs/domain-model.md:121` says the defect is that it goes **11**, not 12 (verified: `Summary!B9 = +B5-M5`, and B to M is 11 columns). |

---

## Part 1 verified against the workbook

AC-3's value is that Part 1 claims to be *generated* from
`Samples/Stock @ 01-Sep-2026.xlsx` rather than transcribed. I re-derived it from the XML
parts. **The overwhelming majority of it is exactly right**, including everything round 1
forced to be rewritten:

- **Dublin, all 16 count pairs** (`specs/domain-model.md:45-60`): every column letter,
  every row-1 serial, every serial-to-date reading, every total and every total formula
  matches. `G/H` `45807` -> 2025-05-30 EUR 61,251.44 ... `AI/AJ` `46234` -> 2026-07-31
  EUR 44,929.63, `AK/AL` unheaded EUR 47,958.53, `R86`/`V86` `#REF!`. Sheet extent
  `A1:AZ104` correct; item rows 3-84 = 82 correct.
- **Clonmel, all 15 count pairs** (`:66-80`): every letter, serial, date, total and
  formula matches, including the `SUBTOTAL`/`SUM` split, `AF1`/`AH1` as the *text*
  `31st July ` / `31st Aug`, and `AI72` = EUR 452,535.6875.
- **The Dublin truck block** (`:82-99`): `AM88` `Shed`, `AM89` `Trucks`, totals in
  `AS`/`AW`/`AZ`; `AM92:AR92` `Full Boiler  equates to ` / `200` / `or 10 Bags`;
  `AM94:AS96` trucks `09D`, `10D`, `141D` with White and Yellow per-cent and kg;
  `AM99:AS103` bags, 50 bags = 1,000 kg. Q6 really is answered by the sheet, and Q8 really
  is a contradiction — `Dublin!AQ92` = 200, `Clonmel Trucks & Yard!A5` = "250 Kgs".
- **The defect table** (`:103-122`) — every row checked, every row true. Notably
  `Summary!K19`, `!L19`, `!R19` = `-1`, `-1`, `1`: **`R19` is not empty; the implementer's
  rejection of round-1 item 3 is correct and round 1 was wrong.** Also verified:
  `Dublin!Q13`/`U13` `=+#REF!` (and `H13` = 355.5 from a shared formula, so the brief's
  round-1 correction was right); `Summary!AK3`/`AP4` `#REF!`; `Summary!B1` text
  `31-11-25`; `Summary!B5 = B3+B4` joining `'Clonmel '!AE72` to `Dublin!T86`;
  `Summary!B18 = +B12+1`; `B9 = +B5-M5` and `C9 = +C5-N5` at 11 columns while
  `D9 = +D5-P5` is 12; `Dublin!AK` 42 populated quantities; `'Clonmel '!G72`/`I72`/`K72`
  `SUBTOTAL(9,x3:x64)` with rows 65-71 empty in those columns — **"six rows short ... runs
  to row 70" is right and round 1's "seven" was wrong**; `'Clonmel '!AA3:AA71` all 62
  populated cells typed numbers, exactly 8 drifted, drift summing to **-EUR 362.0500**,
  with `Beads` 1 x 790 = 790 vs 900 and `MultiGrip X440 Stong Blue` 28 x 121.30 = 3,396.40
  vs 3,220.
- **Trucks & Yard layout** (`:141-160`): `A8:H22`, `A41:G43`, `A26:K37`, `J13:M20`,
  `C3:M3` all correct; the sheet notes at `A5` and `A45` quoted correctly; **all 19 truck
  registrations and all 14 role labels are present and complete** — I enumerated them
  independently and the lists agree.
- **Invariant 10** (`:314-319`): the four non-terminating price formulas are real —
  `'Clonmel '!E19 = 5.2/0.85`, `E20 = 2.45/0.85`, `E21 = 5.89/0.85`, `E23 = 1.4/0.9`. And
  the arithmetic holds: `Road Studs 301 Type` at 6.9294117647 truncated to 4 places, times
  a quantity of 2,285, is **2.7c** out. The case for `Decimal(18,8)` is sound.
- **The 27-of-82 figure** (`:415`): Dublin column `S` gives 18 blank + 9 zero = **27** of
  82. The number is right; the sentence around it is not — see Required change 4.

What did **not** survive the check is Required changes 4-8. Every one of them sits in a
passage the regeneration did not reach: the prose counts in Part 2, the Part 5 example
table, and one Summary head count.

---

## Checkpoints

Items about application code are marked **n/a at this stage** where there is no code that
could violate them, or **genuine gap** where the harness itself is at fault. `src/`,
`tests/`, `package.json` and `prisma/` are absent by design.

### C1 — Process
- C1.1 **[x]** Exactly one feature changed. `feature_list.json` shows `#1` `in_progress`
  and everything else `pending`; all three commits carry `Feature: #1 repo_harness`; every
  modified path is harness scope.
- C1.2 **[x]** `specs/features/001-repo_harness.md` exists, matches its id and name, and
  `init` now enforces that. Round 1's C1.2 gap is closed, and the bootstrap exception is
  written down rather than ignored (`:8-25`) — the right resolution of round-1 item 15.
- C1.3 **[ ]** **Gap.** AC-10 and AC-11 are not satisfied — see the criteria table.
- C1.4 **[ ]** **Gap.** `feature_list.json:39-50` holds **10** entries against the spec's
  **11**. `AC-11` is absent entirely. `AC-3` (`:42`) still reads "specs/ contains
  000-product-brief.md and 001-domain-model.md" — two files that no longer exist, and
  whose removal is the point of the spec's AC-3. `AC-4` drops "and each one's declared
  `tools:` list permits the work its body instructs"; `AC-7` drops the `spec_file` naming
  clause, which is this round's headline change; `AC-10` drops "and every remaining open
  question is referenced by the feature it blocks" — the very clause that fails. This is
  not bookkeeping: `.claude/agents/spec-writer.md:22-23` requires the array to mirror the
  spec, `CHECKPOINTS.md:16` requires the match, and `init.ps1:109-111` reads this array
  when a feature goes `done`. A future reviewer walking #1 from `feature_list.json` would
  walk four criteria that no longer describe the repository.
- C1.5 **[x]** `progress/impl_repo_harness.md` exists and lists every path touched.
  Caveat, not blocking: it files all of them under **"Files created"** when 18 of the 20
  were *modified* this session; it omits the `## Files modified` and `## Verification
  output` sections its own template requires (`.claude/agents/implementer.md:43`,
  `:51-54`); and `:39` claims "four commits" where `git log` shows three plus an
  uncommitted tree.

### C2 — Verification
- C2.1 **[x]** `[OK] Environment ready`, exit 0, both scripts; transcripts above.
- C2.2 **[x]** n/a at this stage — no `package.json`. `init.ps1:173-181` /
  `init.sh:151-158` will run `typecheck` the moment the script exists.
- C2.3 **[x]** n/a at this stage — same for `lint`.
- C2.4 **[x]** n/a at this stage — no service functions exist.
- C2.5 **[x]** n/a at this stage — no tests exist. The gate was nevertheless proven in
  both directions rather than merely seen green.
- C2.6 **[x]** n/a at this stage — no database, no fixtures. This review read the real
  workbook, not a fixture.

### C3 — Architecture
- C3.1 **[x]** n/a at this stage — no `src/`. Rule stated at `docs/architecture.md:33` and
  `CLAUDE.md:41-42`.
- C3.2 **[x]** n/a at this stage — no `src/server/`. Layout defined at
  `docs/architecture.md:6-19`.
- C3.3 **[x]** n/a at this stage — no `src/lib/excel/`. Rule at
  `docs/architecture.md:36-37`.
- C3.4 **[x]** n/a at this stage — no modules that could cycle.
- C3.5 **[x]** n/a at this stage — no `prisma/`. Rule at `docs/conventions.md:72-73`.

### C4 — Domain integrity
- C4.1 **[x]** n/a at this stage; stated consistently at `CLAUDE.md:43-44`,
  `docs/architecture.md:66-73`, Invariant 1 (`specs/domain-model.md:296`).
- C4.2 **[x]** n/a at this stage; Part 6 (`specs/domain-model.md:482-501`),
  `docs/architecture.md:54-64`, `docs/verification.md:80-88`.
- C4.3 **[x]** **Round 1's genuine gap is fixed.** `docs/conventions.md:74` now reads
  "Money: `Decimal @db.Decimal(18, 8)`. Quantity: `Decimal @db.Decimal(12, 4)`" and cites
  Invariant 10 for why. A repo-wide grep finds no surviving `Decimal(12,4)`-for-money.
- C4.4 **[x]** n/a at this stage; Invariant 11 (`specs/domain-model.md:320-324`).
- C4.5 **[x]** n/a at this stage; Invariant 2 (`:297-298`).
- C4.6 **[x]** n/a at this stage; Invariant 3 (`:299-300`).
- C4.7 **[x]** n/a at this stage; quantity `Decimal(12,4)` at `:284`, consistent with
  `CHECKPOINTS.md:43`. Verified from the workbook that this precision is needed:
  `'Clonmel '!AH3` holds `227.6875`.
- C4.8 **[x]** Verified — see AC-9.

### C5 — Conventions
- C5.1 **[x]** n/a at this stage for code. `docs/conventions.md:20` now illustrates the
  spec convention with `007-entry_start.md`, a name that exists — round 1's note fixed.
- C5.2 **[x]** n/a at this stage — no services. Rule at `docs/architecture.md:83-88`.
- C5.3 **[x]** n/a at this stage — no `src/`.
- C5.4 **[x]** No `TODO` in any tracked file; the only occurrences are the rules
  forbidding them (`AGENTS.md:74`, `CHECKPOINTS.md:57`, `docs/conventions.md:111`).
- C5.5 **[x]** `.gitignore:14-16`; `git ls-files` lists no `.env` and no connection
  string; `.claude/settings.json:18-19` denies reading them.

### C6 — Session hygiene
- C6.1 **[x]** `progress/current.md` is written as the work happened and includes an
  honest "Corrections to my own earlier claims" section and a round-1 disposition.
  Round 1's C6.1 gap is closed: the gate transcript now lives in
  `progress/history.md:15-49`, negative runs included.
- C6.2 **[x]** No temp or scratch files. `git status --porcelain` shows only harness
  paths; my own scratch copy was built outside the repository.
- C6.3 **[x]** `feature_list.json` `status` reflects reality — `#1` `in_progress`,
  everything else `pending`, and `spec_status: "draft"` correctly stops `init` letting it
  go `done` before a human approves it.

### C7 — Advisory
- C7.1-C7.3 n/a at this stage — no screens exist.

**Two boxes in C1-C6 are unchecked: C1.3 and C1.4. Their reasons are AC-10 and AC-11.**

---

## Round-1 disposition

**Accepted as fixed (13):** items 1, 2 (Part 1 regenerated, extents correct, Dublin truck
block documented, Q6 closed with its cell reference), 4 (Part 5 now says 27 and explains
where 40 came from), 5 (the `Dublin!H13` claim is gone from the brief; `:21-22` now cites
`Q13`/`U13`), 6 (`docs/conventions.md:74`), 7 (`Write` on explorer and reviewer), 9
(`spec-writer.md:37-38` now `YARD_STAFF`/`ADMIN`), 10 (`spec-writer.md:19` now
"section Still open", which matches `:523`), 11 (`#11 analysis`, `#12 export_workbook` —
both names exist), 12 (`docs/verification.md:17-29` now describes the four steps the
scripts actually run, in order, and `:31-32` commits to keeping them in step), 13
(`AGENTS.md:36` now names `spec-writer`), 14 (`impl_repo_harness.md` written; gate
transcript in `history.md`), 15 (bootstrap exception written into the spec's own header
and enforced prospectively by `init`).

**Rejection 1 — `Summary!R19`: ACCEPTED, and round 1 was wrong.** `R19` holds the number
`1`. I read the cell directly from the XML: value `1`, no formula. `K19` and `L19` hold
`-1` each. `specs/domain-model.md:120` is correct as written. Round 1's "R19 is empty" was
a reading error on my predecessor's part; adding `K19`/`L19` alongside it was the right
response.

**Rejection 2 — `leader.md` `tools: ... Agent`: ACCEPTED, conditionally.** Round 1 itself
offered "or, if `Agent` is deliberate for an older runtime, record that in the body", and
`leader.md:12-15` now does exactly that, in a blockquote telling a future agent not to
"fix" it. That satisfies the alternative that was offered, so it is not a required change.
I record honestly that **I cannot verify the claim from inside this repository** — no
subagent has been launched here, `.claude/settings.json` says nothing about it, and
exercising the leader is explicitly out of scope
(`specs/features/001-repo_harness.md:102`). The first `leader` run at #2 settles it in one
attempt; if `Agent` does not resolve, that is a one-word fix, not a design flaw.

---

## Required changes

1. **`feature_list.json:39-50` — replace the `acceptance[]` array for #1 with the spec's
   eleven criteria, verbatim.** All eleven, including AC-11. In particular `:42` must stop
   saying "specs/ contains 000-product-brief.md and 001-domain-model.md" and state what
   AC-3 now states; `:43` must include the `tools:` clause; `:46` must include the
   `spec_file` naming clause; `:49` must include "and every remaining open question is
   referenced by the feature it blocks". (C1.4, and the direct cause of AC-11's
   dead-filename failure inside `feature_list.json` itself.)
2. **`feature_list.json:217` — #17's `blocked_by_question` must name Q8, not Q6.** Q6 is
   marked `*(closed)*` at `specs/domain-model.md:529`; Q8 at `:530` is the one that blocks
   #17. As it stands, the only open question created this session is referenced by
   nothing, which is exactly what AC-10's second clause forbids. While there:
   `feature_list.json:212` still scopes #17 to "the Clonmel Trucks and Yard sheet",
   contradicting `specs/domain-model.md:95` — "The Trucks & Yard module at M7 covers
   **both** yards, not Clonmel alone."
3. **Finish the rename. Five dead references to `specs/001` / `specs/000`:**
   `README.md:42` and `README.md:55` (both still say `specs/NNN-<feature>.md`; the
   convention is `specs/features/NNN-<name>.md`, and `README.md:74` already says so, so
   the file contradicts itself), `docs/architecture.md:17` "(see specs/001)", and
   `feature_list.json:69`, `:80`, `:91` ("specs/001 Part 6 / Part 3 / Part 2"). This is
   the AC-11 clause "no file refers to a ... spec filename ... that does not exist".
4. **`specs/domain-model.md:408` and `:415`, and `specs/product-brief.md:30` — Part 5
   still describes the 8-count Dublin sheet that Part 1 was rewritten to correct.** `:408`
   heads its table "Quantities across the **8 counts**"; there are 16. `:415` calls
   November 2025 "Dublin's **last valid count**"; Part 1 `:59` documents `AI`/`AJ` =
   `2026-07-31` totalling EUR 44,929.63, eight months later and perfectly valid. The
   27-of-82 number is right for column `S` — say "in the November 2025 count (column `S`)"
   and drop "last valid", or recompute for the real last count. For the record, column
   `AI` (2026-07-31) gives **35 of 82** blank-or-zero, so the "a third of the sheet is
   noise" argument survives either way. The full 16-column series are:
   `Swept Path Markers for Transdev` = -,-,-,-,580,580,65,-,65,-,-,-,-,-,-,- ;
   `EV ONLY text for Epower` = 0,-,0,0,60,-,105,0,24,32,24,-,18,18,18,- ;
   `Disabled Logo on Purple B'ground` = -,-,-,-,-,1,1,1,1,1,1,-,-,-,-,- ;
   `Pre-form for Lucan ETNS` = 0,-,0,1,1,1,0,-,1,-,-,-,-,-,-,- .
   This also breaks `docs/domain-glossary.md:28`, which uses `Swept Path Markers` as its
   example of a **one-off** ("held in exactly one period") and describes it as running
   "580 -> 65 -> 0": it is held in four periods and never reads 0. Pick a genuine one-off,
   or change the definition.
5. **`specs/domain-model.md:209-211` — the item count is arithmetically wrong, and it
   drives feature #5.** It reads "82 descriptions on Dublin (rows 3-84) and **69** on
   Clonmel (rows **3-70**) = **151**". Rows 3-70 is 68 rows, not 69, and `'Clonmel '!A71`
   is the string `TOTAL`, not an item. Verified counts: Dublin `A3:A84` = 82 populated,
   Clonmel `A3:A70` = 68 populated, **150 rows**, **137 distinct trimmed descriptions**,
   plus the two below-total rows `A75`/`A76` = 152 descriptions in the file. 150 is the
   figure `progress/current.md:61` already reached and could not explain — this is the
   explanation. The seed importer's row count is checked against this sentence.
6. **`specs/domain-model.md:172-179` — the leading-`t` supplier rule is invented.**
   `tMeon`, `tKellys` and `tBriteline` (as written in the doc, with apostrophes)
   **do not occur anywhere in the workbook**; none of the three is present in
   `xl/sharedStrings.xml`, so no cell can contain them. The actual supplier strings across
   both item ranges are exactly: `Kestrel` (61), `Meon` (49), `Meon ` with a trailing
   space (1), `Kellys` (19), `Kelly` (7), `Kelly` with an apostrophe-s (1), `Visever `
   with a trailing space (2), `Pittman` (2), `Roadcraft` (2), `Roadstuds` (2), `M & E`
   (2), `Ennis Flint` (1), `Mid-West` (2, rows 75-76), and one row with no supplier at
   all. Note that `Visever` never appears without its trailing space, and that the
   blank-supplier row is unaddressed by a rule keying items on
   `(description, supplierId)` (`:216`). Either cite the cells where a leading `t` occurs
   or delete the rule — `specs/domain-model.md:3` promises this document was derived by
   reading the file, and an implementer will otherwise write a normaliser for a case that
   cannot arise.
7. **`specs/domain-model.md:221-223` — `Dublin!A43` is the wrong example.** For "rows with
   a description but no unit or price", it cites `Dublin!A43 Clock Blue + Yellow Nos`:
   `D43` = `1 Unit` and `E43` = `350`. Both present. `A29` and `A62` are correct examples.
   The true count is **13**, not "about 15" — 12 on Dublin (rows 9, 12, 18, 29, 44, 45,
   46, 47, 48, 62, 63, 78) and 1 on Clonmel (row 54). This list is the `needsReview` seed
   set for #5 and #15; it should be exact and cited.
8. **`specs/domain-model.md:15` — `Summary` carries 44 month columns, not 40.** Row 1 is
   populated across `B1:AT1` — 44 cells, of which `B1` is the text `31-11-25` and 43 are
   date serials running back to `AT1` = `2019-06-30`. `specs/product-brief.md:94` repeats
   "40 months". Minor, but it is inside the generated table.
9. **`.claude/agents/spec-writer.md:71` — the model "good" acceptance criterion
   contradicts the period model.** It reads: "AC-3: Creating a second count for the same
   location and **date** returns a 409 and the message `Count for DUBLIN on 2026-09-01
   already exists`". Invariant 6 (`specs/domain-model.md:308`) makes the key
   `(locationId, periodYear, periodMonth)` and says explicitly "*not* per day". Round 1
   caught this in `docs/conventions.md` and `reviewer.md` and both were fixed
   (`conventions.md:86`, `reviewer.md:48` now say "period") — this one was missed, and it
   is the worst place for it to survive, because it is the template from which every
   future spec is written. Use the period, and a message such as
   `Count for DUBLIN in 2026-09 already exists`.
10. **`docs/domain-glossary.md:32` — "counting twelve columns left" is wrong and
    contradicts the defect table.** `Summary!B9 = +B5-M5`; B to M is **11** columns.
    `specs/domain-model.md:121` states this correctly. The glossary currently describes
    the *intent* as the *behaviour*, which loses the defect entirely. While in that file,
    `:85` lists `20 Kgs` as a workbook unit string; it does not occur (`20kgs` and `20Kg`
    do) — the same spurious variant is at `specs/domain-model.md:198`, and the real
    variant `20Kg` is missing from both lists.

## Observations (non-blocking)

- **The gate is in genuinely good shape.** Both scripts now itemise identically and agree
  on their failure counts (10 and 10, 4 and 4 in my runs) — round 1's divergence is fixed
  at `init.sh:104-107`. `docs/verification.md:17-29` now matches the scripts step for
  step, and `:31-32` commits to keeping them in step, which is the right structural answer
  rather than a one-time correction.
- `specs/domain-model.md:370` says "**Nine** of this workbook's 31 count columns have a
  date that is missing, mistyped, or not a date at all". 31 is right. I can derive only
  **six**: `Dublin!AK1` and `'Clonmel '!H1` (absent), `Dublin!U1` and `'Clonmel '!R1`
  (year typos), `'Clonmel '!AF1` and `!AH1` (prose). If the other three are the
  start-of-month headers that disagree with `Summary`, say so; as written the number is
  not reproducible.
- `specs/domain-model.md:364` says the four undatable columns "hold over EUR 270,000".
  They hold EUR 721,489.52 (47,958.53 + 136,038.72 + 84,956.58 + 452,535.69). True, but it
  understates by 2.7x — and the three excluding the corrupt `AH` come to EUR 268,953.83,
  which is *under* 270,000. The sentence reads as if it were computed from three columns
  and rounded from the wrong side.
- `specs/product-brief.md:24-25` and `specs/domain-model.md:112` call `'Clonmel '!AI72`
  "four times any other". It is EUR 452,535.69 against a next-highest EUR 136,038.72 —
  3.3x.
- `specs/product-brief.md:1` and `specs/domain-model.md:1` still open with the headings
  "000 — Product brief" and "001 — Domain model", so two files in `specs/` now carry the
  title "001" (`specs/features/001-repo_harness.md` being the other). The filenames are
  right; the headings are the last trace of the old scheme.
- `progress/current.md:55` still prices the unheaded Clonmel column at EUR 136,246.93 (the
  recomputed sum of qty x price) while `specs/domain-model.md:109` uses EUR 136,038.72
  (the workbook's truncated `SUBTOTAL`). Both numbers are real and the difference *is* the
  `I72` defect at `:113` — but stated side by side without that link they read as a
  contradiction.
- `progress/current.md:81` credits Part 1's regeneration to `scratchpad/genpart1.py`,
  which is not in the repository. Correctly kept out of the tree (C6.2), but it means the
  claim "generated, so it cannot drift again" is not reproducible by the next agent —
  which matters, because five of my ten required changes sit in the prose the generator
  did not cover. Consider committing the generator under `tools/` at #2, or dropping the
  claim.
- `AGENTS.md:61` reads "Confirm `specs/<its spec_file>` exists"; `spec_file` already
  begins with `specs/`, so followed literally this is `specs/specs/features/...`.
- `docs/conventions.md:60-61` gives `KG_PER_FULL_BOILER = 250` as the model for citing a
  workbook constant. It is a good example of the practice and a poor choice of constant —
  Q8 is open precisely because Dublin says 200.
- Q1 (`specs/domain-model.md:517`) and Q6 (`:529`) remain the same question with two
  different resolutions on the same page — "Deferred" and "Answered by the workbook". Q2
  (`:518`) and Q7 (`:531`) likewise. Defensible as a historical record, but a reader who
  hits Q1 first gets the wrong answer.
- The feature-list validation in `init` is real logic with no automated test of its own.
  When #2 lands Vitest, these rules are the obvious first unit test; until then every
  proof of the gate is a manual scratch-copy exercise like this one.
- Nobody owns session close. `AGENTS.md:66-74` describes it; `leader.md:67` forbids the
  leader to mark a feature `done`, the implementer must not self-approve, and the reviewer
  must not edit `feature_list.json`. Worth naming the human as the closer explicitly.
- Positive, and worth saying plainly: Part 1 is now some of the most thoroughly evidenced
  domain documentation I have checked. Thirty-one count columns, sixteen defect-table
  rows, nineteen truck registrations and four price formulas all reproduced exactly, and
  both round-1 rejections were researched rather than waved away — one of them proving the
  reviewer wrong. The defects that remain are concentrated in the prose paragraphs the
  regeneration did not reach, and they are a few lines each.
