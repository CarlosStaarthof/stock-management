import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * WHOSE WORK A GIT ASSERTION IS ABOUT, decided in one place (spec 021, Phase 0, AC-44).
 *
 * A test that asks git whether a path changed makes one of three claims, and each has one
 * spelling here:
 *
 * - no feature may ever change this path (a global invariant with a written "never" behind
 *   it, today only `Samples/`): `workingTreeChanges(paths)` is empty, in every session;
 * - feature N did not touch this path: `filesTouchedBy(N, paths)` is empty;
 * - feature N changed exactly this: an equality on `filesTouchedBy` or `changedLinesBy`.
 *
 * While N is `in_progress`, N's work is N's commits AND the working tree: at most one feature
 * is `in_progress` (`docs/verification.md`), so every uncommitted change is N's, and a feature
 * that commits before it is done must not lose sight of its own edit. Otherwise N's work is
 * N's commits alone. That history is closed, so no later feature can turn N's claim red, and
 * N's own later `fix(#N)` still can. Neither the bare working tree nor a range that ends at
 * the branch tip can say this: the first does not record whose change it holds, and the
 * second keeps absorbing every later feature's commits to the same paths.
 *
 * A COMMIT IS N'S BY ITS SUBJECT LINE ALONE: lower-case letters, `(#N)`, a colon and a space
 * (`docs/conventions.md` -> Commits). The body, the author, the date and any trailer are never
 * read. A word scope (`fix(app)`), no scope, or a revert belongs to no feature.
 *
 * IT IS READ-ONLY. It runs only `log`, `show`, `diff`, `status`, `ls-files` and `rev-parse`,
 * always with `--no-optional-locks` (so `status` never rewrites the index while other test
 * files run in parallel) and `--literal-pathspecs` (so `[id]` in a path is four characters,
 * not a character class). `log` runs with `--full-history`.
 *
 * IT FAILS CLOSED. The checks this replaced read `(stdout ?? "").trim()`, so a `git` that
 * could not start looked exactly like "nothing changed". Here every one of these throws, with
 * the feature id in the message where there is one: `git` cannot run or exits non-zero; the
 * clone is shallow (a truncated history would make every check pass by reading nothing);
 * `feature_list.json` is missing, is not JSON, or has no such feature; an empty list of paths
 * (which git would read as "the whole repository"); and a feature that is not `in_progress`
 * with no commit attributed to it, because a history check over no commits asserts nothing.
 */

export type FeatureScopeOptions = {
  /** Where `git` runs and where `feature_list.json` is read. Defaults to `process.cwd()`. */
  cwd?: string;
};

export type FeatureStatus = "pending" | "in_progress" | "blocked" | "done";

const STATUSES: readonly FeatureStatus[] = ["pending", "in_progress", "blocked", "done"];

/** `feat(#8): …` -> "8". The closing parenthesis is part of the match, so `(#1)` is not `(#10)`. */
const FEATURE_SUBJECT = /^[a-z]+\(#(\d+)\): /;

/**
 * Variables that would point `git` at a repository, an index or a pathspec mode other than
 * the one `cwd` and this module's flags decide - a test run from inside a hook inherits them.
 */
const REDIRECTING_GIT_VARIABLES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_GLOB_PATHSPECS",
  "GIT_NOGLOB_PATHSPECS",
  "GIT_ICASE_PATHSPECS",
  "GIT_LITERAL_PATHSPECS",
];

/** Whether a commit subject line belongs to feature `id`. */
export function isAttributedTo(subject: string, id: number): boolean {
  assertFeatureId(id);
  const match = FEATURE_SUBJECT.exec(subject);

  return match !== null && match[1] === String(id);
}

/** Feature `id`'s `status` in `feature_list.json`. */
export function featureStatus(id: number, options: FeatureScopeOptions = {}): FeatureStatus {
  assertFeatureId(id);
  const file = join(cwdOf(options), "feature_list.json");

  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (error) {
    throw new Error(`feature-scope: feature #${id}: cannot read ${file} (${messageOf(error)})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^﻿/, ""));
  } catch (error) {
    throw new Error(`feature-scope: feature #${id}: ${file} is not JSON (${messageOf(error)})`);
  }

  const features = isRecord(parsed) ? parsed.features : undefined;
  if (!Array.isArray(features)) {
    throw new Error(`feature-scope: feature #${id}: ${file} has no "features" array`);
  }

  const entry: unknown = features.find((feature) => isRecord(feature) && feature.id === id);
  if (!isRecord(entry)) {
    throw new Error(`feature-scope: feature #${id} is not in ${file}`);
  }

  const status = entry.status;
  if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
    throw new Error(`feature-scope: feature #${id} has status ${JSON.stringify(status)} in ${file}`);
  }

  return status as FeatureStatus;
}

/** Full SHAs of the commits reachable from `HEAD` that belong to feature `id`, oldest first. */
export function commitsOf(id: number, options: FeatureScopeOptions = {}): string[] {
  assertFeatureId(id);
  const cwd = cwdOf(options);
  const about = `feature #${id}`;

  assertFullHistory(cwd, about);

  return git(
    ["log", "--full-history", "--topo-order", "--reverse", "--format=%H%x00%s", "HEAD"],
    cwd,
    about,
  )
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const separator = line.indexOf("\0");

      return { sha: line.slice(0, separator), subject: line.slice(separator + 1) };
    })
    .filter((commit) => isAttributedTo(commit.subject, id))
    .map((commit) => commit.sha);
}

/**
 * Repository-relative files under `paths`, sorted and distinct, that feature `id`'s commits
 * changed - plus, while `id` is `in_progress`, `workingTreeChanges(paths)`.
 */
export function filesTouchedBy(
  id: number,
  paths: readonly string[],
  options: FeatureScopeOptions = {},
): string[] {
  const { cwd, about, status, commits } = workOf(id, paths, options);
  const files = new Set<string>();

  for (const sha of commits) {
    const named = git(
      [
        "show",
        "--no-renames",
        "--diff-merges=first-parent",
        "--name-only",
        "-z",
        "--format=",
        sha,
        "--",
        ...paths,
      ],
      cwd,
      about,
    );

    for (const file of named.split("\0")) {
      if (file.length > 0) files.add(file);
    }
  }

  if (status === "in_progress") {
    for (const file of changedInWorkingTree(paths, cwd, about)) files.add(file);
  }

  return [...files].sort();
}

/**
 * The `+` and `-` lines of each of feature `id`'s commits' own patch under `paths`, at zero
 * context and with file headers dropped, in commit order. While `id` is `in_progress`, the
 * working tree's lines against `HEAD` follow, and every line of an untracked file counts as
 * added.
 */
export function changedLinesBy(
  id: number,
  paths: readonly string[],
  options: FeatureScopeOptions = {},
): string[] {
  const { cwd, about, status, commits } = workOf(id, paths, options);
  const lines: string[] = [];

  for (const sha of commits) {
    lines.push(
      ...patchLines(
        git(
          [
            "show",
            "--no-renames",
            "--diff-merges=first-parent",
            "--format=",
            "--unified=0",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            sha,
            "--",
            ...paths,
          ],
          cwd,
          about,
        ),
      ),
    );
  }

  if (status === "in_progress") {
    lines.push(
      ...patchLines(
        git(
          [
            "diff",
            "--no-renames",
            "--unified=0",
            "--no-color",
            "--no-ext-diff",
            "--no-textconv",
            "HEAD",
            "--",
            ...paths,
          ],
          cwd,
          about,
        ),
      ),
    );

    const untracked = git(
      ["ls-files", "--others", "--exclude-standard", "-z", "--", ...paths],
      cwd,
      about,
    )
      .split("\0")
      .filter((file) => file.length > 0)
      .sort();

    for (const file of untracked) {
      // `ls-files` names are relative to `cwd`, like the pathspecs it was given.
      const content = readFileSync(join(cwd, file), "utf8");
      if (content.length === 0) continue;

      const body = content.endsWith("\n") ? content.slice(0, -1) : content;
      lines.push(...body.split(/\r?\n/).map((line) => `+${line}`));
    }
  }

  return lines;
}

/**
 * Files under `paths`, sorted and distinct, that differ from `HEAD` - modified, added,
 * deleted or renamed (both names), staged or not - or that are untracked and not ignored.
 * Whatever any feature's status is: this is the check for a path no feature may change.
 */
export function workingTreeChanges(
  paths: readonly string[],
  options: FeatureScopeOptions = {},
): string[] {
  const about = `the working tree under ${JSON.stringify(paths)}`;
  assertPaths(paths, about);

  return changedInWorkingTree(paths, cwdOf(options), about);
}

function changedInWorkingTree(paths: readonly string[], cwd: string, about: string): string[] {
  const fields = git(
    [
      "status",
      "--porcelain=v1",
      "-z",
      "--no-renames",
      "--untracked-files=all",
      "--ignored=no",
      "--",
      ...paths,
    ],
    cwd,
    about,
  ).split("\0");

  const files = new Set<string>();
  for (let index = 0; index < fields.length; index += 1) {
    const entry = fields[index];
    if (entry.length === 0) continue;

    // `XY path`, root-relative in porcelain v1 whatever `cwd` is. `--no-renames` means no
    // entry carries a second name, but if one ever does, its source path follows it.
    files.add(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) {
      index += 1;
      if (fields[index]) files.add(fields[index]);
    }
  }

  return [...files].sort();
}

/**
 * The added and removed lines of a patch. A line is kept only inside a hunk, so a file's
 * `---` / `+++` headers are dropped while a content line that itself begins `--` or `++`
 * (shown as `---…` or `+++…`) is kept.
 */
function patchLines(patch: string): string[] {
  const lines: string[] = [];
  let inHunk = false;

  for (const line of patch.split("\n")) {
    if (line.startsWith("diff ")) {
      inHunk = false;
    } else if (line.startsWith("@@")) {
      inHunk = true;
    } else if (inHunk && (line.startsWith("+") || line.startsWith("-"))) {
      lines.push(line);
    }
  }

  return lines;
}

function workOf(
  id: number,
  paths: readonly string[],
  options: FeatureScopeOptions,
): { cwd: string; about: string; status: FeatureStatus; commits: string[] } {
  assertFeatureId(id);
  const cwd = cwdOf(options);
  const about = `feature #${id}`;
  assertPaths(paths, about);

  const status = featureStatus(id, { cwd });
  const commits = commitsOf(id, { cwd });

  if (status !== "in_progress" && commits.length === 0) {
    throw new Error(
      `feature-scope: feature #${id} is ${status} and no commit reachable from HEAD is ` +
        `attributed to it, so there is no work of its to check`,
    );
  }

  return { cwd, about, status, commits };
}

function assertFullHistory(cwd: string, about: string): void {
  const shallow = git(["rev-parse", "--is-shallow-repository"], cwd, about).trim();

  if (shallow !== "false") {
    throw new Error(
      `feature-scope: ${about}: the repository at ${cwd} is a shallow clone, and a truncated ` +
        `history cannot say what a feature touched`,
    );
  }
}

function git(args: readonly string[], cwd: string, about: string): string {
  const env = { ...process.env };
  for (const variable of REDIRECTING_GIT_VARIABLES) delete env[variable];

  const run = spawnSync("git", ["--no-optional-locks", "--literal-pathspecs", ...args], {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });

  if (run.error) {
    throw new Error(`feature-scope: ${about}: git ${args[0]} could not run in ${cwd} (${run.error.message})`);
  }
  if (run.status !== 0) {
    throw new Error(
      `feature-scope: ${about}: git ${args.join(" ")} exited ${String(run.status)} in ${cwd}: ` +
        (run.stderr ?? "").trim(),
    );
  }

  return run.stdout;
}

function assertFeatureId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`feature-scope: ${String(id)} is not a feature id`);
  }
}

function assertPaths(paths: readonly string[], about: string): void {
  if (paths.length === 0 || paths.some((path) => typeof path !== "string" || path.length === 0)) {
    throw new Error(
      `feature-scope: ${about}: a git check needs at least one non-empty path; an empty ` +
        `pathspec would read the whole repository`,
    );
  }
}

function cwdOf(options: FeatureScopeOptions): string {
  return options.cwd ?? process.cwd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
