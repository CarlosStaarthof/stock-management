# Implementation — feature 1 repo_harness

**Spec:** specs/features/001-repo_harness.md
**Status:** complete — awaiting review

## Files created

| Path | What it does |
|---|---|
| `AGENTS.md` | Navigation map. The one file an agent must read first |
| `CLAUDE.md` | Project rules for Claude Code; points at AGENTS.md |
| `CHECKPOINTS.md` | C1–C7 objective review criteria |
| `README.md` | Human entry point |
| `feature_list.json` | 18 features across 8 milestones, with `spec_status` tracking |
| `init.ps1`, `init.sh` | The single verification gate |
| `.gitignore`, `.gitattributes` | Secrets and build output excluded; `.xlsx` marked binary |
| `docs/architecture.md` | Layering, the money boundary, decimal precision |
| `docs/conventions.md` | Naming, errors, tests, commits |
| `docs/verification.md` | How to prove work, matched to what `init` actually runs |
| `docs/domain-glossary.md` | Yard vocabulary, roles, period, signature |
| `specs/product-brief.md` | Why the product exists, who uses it, scope |
| `specs/domain-model.md` | The workbook, normalisation, periods, roles, schema |
| `specs/features/001-repo_harness.md` | This feature's own spec |
| `.claude/agents/{leader,explorer,spec-writer,implementer,reviewer}.md` | Role definitions |
| `.claude/settings.json` | Permissions; `Samples/` denied for write |
| `progress/current.md`, `progress/history.md` | Session state and append-only log |

## Acceptance criteria

| AC | Where it is satisfied | How it is proved |
|----|----------------------|------------------|
| AC-1 | repo root | `init` required-file list; `[ok] 17 required files present` |
| AC-2 | `docs/` | same list |
| AC-3 | `specs/` | reference docs unnumbered, `specs/features/001-repo_harness.md` exists; `init` enforces the naming rule |
| AC-4 | `.claude/agents/` | `init` frontmatter check; `tools:` now grants `Write` to reviewer and explorer, which their bodies require |
| AC-5 | `progress/` | this file, plus `current.md` and `history.md` |
| AC-6 | `init.ps1`, `init.sh` | both exit 0 with `[OK] Environment ready`, no application code present |
| AC-7 | `init.ps1:75-115`, `init.sh:62-108` | eight distinct checks, each made to fire — see `progress/history.md` |
| AC-8 | git | four commits; `.gitignore` covers `node_modules`, `.env*`, build output |
| AC-9 | `Samples/` | `git status --porcelain -- Samples` empty |
| AC-10 | `specs/domain-model.md` § Answered / Still open | Q1–Q5 answered, Q6 closed by the workbook, Q7 and Q8 block only M7 and are referenced by `blocked_by_question` |
| AC-11 | repo-wide | grep sweeps for `COUNTER\|MANAGER`, dead feature names and `Decimal(12,4)`-for-money all return nothing |

## Deviations from the spec

The spec was written **after** the work, and says so in its own header. Feature #1 is the
only feature permitted that, because it is the feature that created the spec system.
`init` now enforces the rule prospectively for #2 onward.

## Notes for the reviewer

- **A previous review of this feature returned `CHANGES_REQUESTED`**
  (`progress/review_repo_harness.md`, 15 required changes). Thirteen were accepted and
  fixed. Two were checked and rejected, deliberately:
  - `Summary!R19` is **not** empty — it holds `1`. The original citation was correct.
    `K19` and `L19` were added alongside it.
  - `leader.md`'s `tools: … Agent` is **correct in this runtime**; `Agent` is the tool
    that launches a subagent here. A note in the file records why, so it is not
    "corrected" to `Task` later.
- **The largest fix was a content error, not a process one.** Part 1 recorded Dublin as
  8 counts in columns A–V, because that is its `_FilterDatabase` range. The sheet holds
  **16** counts out to `AL`, and Clonmel **15** out to `AI`. Part 1's sheet tables are now
  **generated from the workbook XML** rather than transcribed, so they cannot drift again.
- That correction overturns a claim made repeatedly during this feature: Dublin is *not*
  seven months behind Clonmel. Both yards are current to mid-2026. Anything built on the
  old reading — including the design prototype's "no complete period" panel — needs
  revisiting at #11.
- `Dublin!AM87:AZ104` answers Q6: Dublin has its own trucks (`09D`, `10D`, `141D`). A new
  Q8 records that Dublin calls a full boiler 200 kg while Clonmel calls it 250 kg.
