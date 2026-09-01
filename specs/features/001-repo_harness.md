# 001 — Repository harness and spec foundation

**Feature id:** 1   **Status:** approved — signed off 2026-09-01 after three review rounds
**Depends on:** nothing — this is the first feature

---

## A note on how this spec came to exist

**This spec was written after the work it describes.** Every other feature in this
repository is specified first and built second, and `init` now enforces that. Feature #1
is the exception, because feature #1 is what created the rule.

A harness cannot bootstrap itself under its own rule: writing
`specs/features/001-repo_harness.md` first would have required a `specs/features/`
convention, a template, and a `spec-writer` definition that did not yet exist. That is a
fixed point, not hypocrisy — but it has to be written down rather than quietly ignored,
because an unmet rule at feature #1 teaches every later feature that the rule is
optional.

**This is the only feature permitted to claim this exception.** From #2 onward the spec
exists before any code, `init` fails a `done` feature whose `spec_status` is not
`approved`, and `init` fails any feature whose `spec_file` does not match
`specs/features/NNN-<name>.md` where `NNN` is the feature id.

---

## Purpose

Turn a directory containing one Excel workbook into a repository that an AI agent can
work in autonomously and verifiably: a navigation map, role-separated subagents,
objective review criteria, a progress log, a single verification gate, and a spec
foundation derived from the source workbook rather than from assumption.

Without it there is nothing to check work against, no way to hand work between agents
without it degrading, and no definition of "done" beyond someone's say-so.

## User stories

- As **an agent starting a session**, I can read one file (`AGENTS.md`) and find
  everything else I need, when I need it, without loading the whole repository.
- As **an agent about to implement**, I can find the domain rules and the schema in
  `specs/domain-model.md` and know they were derived from the workbook, with cell
  references I can re-check.
- As **a reviewer**, I can walk a fixed list of objective criteria (`CHECKPOINTS.md`)
  rather than inventing standards per review.
- As **the user**, I can run one command and know whether the repository is in a good
  state.

## Data touched

None. No database, no application code. This feature produces documents, agent
definitions and two shell scripts.

## Contract

`./init.ps1` (Windows) and `./init.sh` (POSIX) are the single verification gate. Both
must print `[OK] Environment ready` and exit `0` when the repository is sound, and exit
`1` naming every problem when it is not. Steps whose tooling does not exist yet are
skipped, not failed.

## Acceptance criteria

1. **AC-1** — `AGENTS.md`, `CLAUDE.md` and `CHECKPOINTS.md` exist at the repository root.
2. **AC-2** — `docs/` contains `architecture.md`, `conventions.md`, `verification.md`
   and `domain-glossary.md`.
3. **AC-3** — `specs/` separates reference documents from feature specs:
   `specs/product-brief.md` and `specs/domain-model.md` carry no number, and feature
   specs live at `specs/features/NNN-<name>.md` where `NNN` is the feature id.
   `domain-model.md` documents the workbook layout, the normalisation rules, the period
   model, the roles and money boundary, and the target schema.
4. **AC-4** — `.claude/agents/` contains `leader.md`, `explorer.md`, `spec-writer.md`,
   `implementer.md` and `reviewer.md`, each with valid YAML frontmatter, and each one's
   declared `tools:` list permits the work its body instructs it to do.
5. **AC-5** — `progress/current.md` and `progress/history.md` exist, and this feature's
   implementation report exists at `progress/impl_repo_harness.md`.
6. **AC-6** — `init.ps1` and `init.sh` both run to completion and print
   `[OK] Environment ready` with no application code present, and both exit `0`.
7. **AC-7** — `init` verifies harness integrity: required files present; agent
   frontmatter valid; `feature_list.json` parses; every `status` and `spec_status` valid;
   at most one feature `in_progress`; every `spec_file` with `spec_status` other than
   `missing` exists on disk; **every `spec_file` matches
   `specs/features/NNN-<name>.md` for its own id and name**; no feature is `done` without
   an approved spec and a non-empty `acceptance` array.
8. **AC-8** — The repository is a git repository with a commit history, and `.gitignore`
   covers `node_modules`, `.env` and build output.
9. **AC-9** — Nothing under `Samples/` has been modified.
10. **AC-10** — Every question in `specs/domain-model.md` that blocks a feature before
    M7 is answered, and every remaining open question is referenced by the feature it
    blocks.
11. **AC-11** — The harness documents do not contradict each other. Specifically: no
    file states a money precision other than `Decimal(18,8)`; no file refers to the
    removed `COUNTER` or `MANAGER` roles; and no file refers to a feature name, spec
    filename or question id that does not exist.

## Out of scope

- Any application code, database schema, migration or test suite — those are #2 onward.
- Importing the workbook's historical counts. `specs/product-brief.md` records that
  counting starts fresh.
- The Trucks & Yard module, deferred to M7.
- A `leader` orchestration run. The definitions exist; exercising them begins at #2.

## Open questions

None blocking. Q6 and Q7 in `specs/domain-model.md` remain open and block only M7
features #17 and #18, each of which carries a matching `blocked_by_question`.
