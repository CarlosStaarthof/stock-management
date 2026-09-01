# AGENTS.md — Navigation map for AI agents

> This file is the **entry point** for any agent working in this repository.
> It is not a rulebook — it is a **map**. Read only what you need, when you need it
> (progressive disclosure).

---

## 1. Before you start (mandatory)

1. Run `./init.ps1` (Windows) or `./init.sh` (POSIX). It must finish with
   `[OK] Environment ready`. If it fails, **stop** and fix the environment before
   touching any code.
2. Read `progress/current.md` to see what state the last session left behind.
3. Read `feature_list.json` and pick **one** feature with status `pending`.
   Never work on more than one at a time.
4. Read that feature's spec in `specs/`. **If the spec does not exist, do not
   implement — write the spec first and get it approved.**

## 2. Repository map

| File / folder | What it holds | When to read it |
|---|---|---|
| `feature_list.json` | Task list with status (`pending` / `in_progress` / `done` / `blocked`) | Always, at the start |
| `specs/` | One spec per feature. Acceptance criteria live here | Before implementing anything |
| `specs/product-brief.md` | What this product is and who uses it | First session, or when lost |
| `specs/features/NNN-<name>.md` | The contract for one feature. `NNN` is the feature id, enforced by `init` | Before implementing that feature |
| `specs/domain-model.md` | The domain, derived from the source workbook | Before touching the schema |
| `progress/current.md` | Current session state | Always, at the start |
| `progress/history.md` | Append-only log of previous sessions | When you need historical context |
| `docs/architecture.md` | What "good work" means here: layers, dependency rules | Before implementing |
| `docs/conventions.md` | Style, naming, structure, error handling | Before writing code |
| `docs/verification.md` | How to prove your work actually works | Before declaring anything `done` |
| `docs/domain-glossary.md` | Thermo-P, A-S, boiler, MoM, yard, `Bal per nl`… | When the vocabulary is unfamiliar |
| `CHECKPOINTS.md` | Objective criteria for "correct final state" | To self-assess, and when reviewing |
| `.claude/agents/` | Subagent definitions: leader, explorer, **spec-writer**, implementer, reviewer | If you are orchestrating work |
| `Samples/` | The original Excel workbook. **READ ONLY — never modify** | To verify domain assumptions |
| `prisma/schema.prisma` | Database schema | Before any data change |
| `src/` | Application code | To implement |
| `tests/` | Automated tests | To verify |

## 3. Hard rules (non-negotiable)

- **One feature at a time.** Never mix changes from several tasks in one session.
- **No spec, no code.** Every feature has a `specs/features/NNN-<name>.md` with numbered
  acceptance criteria before implementation starts.
- **Never mark a feature `done` without green tests.** Run `init` and confirm the
  test block passes 100%.
- **Never modify anything under `Samples/`.** It is the historical record and the
  source of truth for domain questions.
- **Document as you go** in `progress/current.md`, not at the end.
- **Leave the repository clean** before closing the session (see §5).
- **If you do not know something, look in `docs/` and `specs/`** before inventing it.

## 4. How to pick a task

```
1. Open feature_list.json
2. Filter status == "pending"
3. Take the lowest "id"
4. Confirm specs/<its spec_file> exists. If not → write the spec first.
5. Set status to "in_progress" and save
6. Record in progress/current.md: feature, start time, brief plan
```

## 5. Session close (lifecycle)

Before you finish:

1. Run `init` — everything green.
2. If the task is complete: set `status: "done"` in `feature_list.json`.
3. Move the summary from `progress/current.md` to the end of `progress/history.md`.
4. Reset `progress/current.md` to the empty template.
5. Leave no temp files, no debug `console.log`, no context-free TODOs.

## 6. If you get stuck

- Re-read the relevant section of `docs/` or the feature's spec.
- If a tool does not behave as expected, **do not invent a workaround**:
  record the blocker in `progress/current.md`, set the feature to `blocked`,
  and stop the session.
