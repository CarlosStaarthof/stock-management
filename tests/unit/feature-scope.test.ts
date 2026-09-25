import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import {
  changedLinesBy,
  commitsOf,
  featureStatus,
  filesTouchedBy,
  isAttributedTo,
  workingTreeChanges,
} from "../support/feature-scope";

/**
 * Spec 021, Phase 0: the one helper that decides whose work a git assertion is about (AC-44),
 * and the scan that keeps every shipped test going through it (AC-45).
 *
 * AC-44 IS PROVEN ON THROWAWAY REPOSITORIES, never on this one: each test builds its own
 * repository under the OS temp directory, with its own local identity and configuration, its
 * own `feature_list.json` and its own commits, and `afterEach` removes it. Nothing here commits
 * to, resets or reads the history of the repository the suite runs in, except AC-45's scan,
 * which lists and reads files.
 *
 * X and Y are chosen so that the scope match is exercised by the fixtures themselves: `(#8)`
 * must never be read out of `(#80)`.
 */

const X = 8;
const Y = 80;
const P = "guarded";

const LOCAL_CONFIG: readonly (readonly [string, string])[] = [
  ["user.name", "Feature Scope Test"],
  ["user.email", "feature-scope@example.invalid"],
  ["core.autocrlf", "false"],
  ["core.safecrlf", "false"],
  ["commit.gpgsign", "false"],
  ["gc.auto", "0"],
  ["maintenance.auto", "false"],
];

type Statuses = Record<number, string>;

const created: string[] = [];

afterEach(() => {
  for (const directory of created.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5 });
    expect(existsSync(directory), `${directory} must be removed`).toBe(false);
  }
});

function scratchDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "feature-scope-"));
  created.push(directory);
  return directory;
}

/** A git command that builds a fixture. The helper under test is never called through this. */
function run(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`fixture: git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
  }
  return result.stdout;
}

function write(repo: string, file: string, content: string): void {
  mkdirSync(dirname(join(repo, file)), { recursive: true });
  writeFileSync(join(repo, file), content);
}

function remove(repo: string, file: string): void {
  rmSync(join(repo, file));
}

function commit(repo: string, subject: string, body?: string): string {
  run(repo, "add", "-A");
  run(repo, "commit", "-q", "-m", subject, ...(body === undefined ? [] : ["-m", body]));
  return run(repo, "rev-parse", "HEAD").trim();
}

function setStatuses(directory: string, statuses: Statuses): void {
  const features = Object.entries(statuses).map(([id, status]) => ({
    id: Number(id),
    name: `feature_${id}`,
    status,
  }));
  writeFileSync(join(directory, "feature_list.json"), JSON.stringify({ features }, null, 2));
}

/**
 * A repository whose base commit belongs to no feature and whose second commit is X's spec
 * approval, outside P - so X has work, none of it under P.
 */
function buildRepo(statuses: Statuses): { repo: string; approval: string } {
  const repo = scratchDirectory();
  run(repo, "init", "-q");
  for (const [key, value] of LOCAL_CONFIG) run(repo, "config", key, value);

  write(repo, ".gitignore", "*.log\n/feature_list.json\n");
  write(repo, `${P}/a.txt`, "one\ntwo\nthree\n");
  write(repo, `${P}/b.txt`, "alpha\n");
  write(repo, `${P}/c.txt`, "gamma\n");
  write(repo, `${P}/d`, "d\n");
  write(repo, `${P}/[id]/page.txt`, "page\n");
  write(repo, "elsewhere/x.txt", "x\n");
  commit(repo, "harness(repo): the base, which belongs to no feature");

  write(repo, "docs/x.md", "x\n");
  const approval = commit(repo, `spec(#${X}): approve X, outside the guarded directory`);

  setStatuses(repo, statuses);
  return { repo, approval };
}

/** Every uncommitted kind of change AC-44 (a) names, plus two that must never be counted. */
function dirtyTheTree(repo: string): void {
  write(repo, `${P}/a.txt`, "one\nTWO\nthree\n"); // modified, not staged
  write(repo, `${P}/b.txt`, "ALPHA\n");
  run(repo, "add", `${P}/b.txt`); // staged, and the working tree matches the index
  remove(repo, `${P}/c.txt`); // deleted
  write(repo, `${P}/new.txt`, "new\n"); // untracked
  write(repo, `${P}/deeper/new.txt`, "new\n"); // untracked, inside an untracked directory
  write(repo, `${P}/debug.log`, "ignored\n"); // git-ignored: never counted
  write(repo, "elsewhere/x.txt", "changed outside P\n"); // outside P: never counted
}

const DIRTY = [
  `${P}/a.txt`,
  `${P}/b.txt`,
  `${P}/c.txt`,
  `${P}/deeper/new.txt`,
  `${P}/new.txt`,
];

function fingerprint(repo: string): { index: string; refs: string } {
  const indexFile = join(repo, ".git", "index");
  const index = existsSync(indexFile)
    ? createHash("sha256").update(readFileSync(indexFile)).digest("hex")
    : "(no index)";

  return { index, refs: run(repo, "for-each-ref") };
}

/**
 * Calls the helper and requires that the call left `.git/index` byte-identical and every ref
 * where it was, whether the call returned or threw.
 */
function observe<T>(repo: string, call: (cwd: string) => T): T {
  const before = fingerprint(repo);
  let outcome: { ok: true; value: T } | { ok: false; error: unknown };
  try {
    outcome = { ok: true, value: call(repo) };
  } catch (error) {
    outcome = { ok: false, error };
  }
  const after = fingerprint(repo);

  expect(after.index, "the helper rewrote .git/index").toBe(before.index);
  expect(after.refs, "the helper moved a ref").toBe(before.refs);

  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}

describe("021 AC-44: a commit is a feature's by its subject line alone", () => {
  it("AC-44: with id 8, every lower-case type scoped (#8) is feature 8's", () => {
    for (const subject of ["feat(#8): x", "fix(#8): x", "spec(#8): x", "refactor(#8): x"]) {
      expect(isAttributedTo(subject, 8), subject).toBe(true);
    }
  });

  it("AC-44: with id 8, another number, a padded or malformed scope, a word scope or a revert is not", () => {
    for (const subject of [
      "feat(#80): x",
      "feat(#18): x",
      "feat(#08): x",
      "feat(#8) x",
      "feat(#8):x",
      "Feat(#8): x",
      "fix(app): x",
      "harness(repo): x",
      "spec: x",
      'Revert "feat(#8): x"',
    ]) {
      expect(isAttributedTo(subject, 8), subject).toBe(false);
    }
  });

  it("AC-44: with id 1, feat(#10) is not feature 1's, because the parenthesis closes the match", () => {
    expect(isAttributedTo("feat(#10): x", 1)).toBe(false);
    expect(isAttributedTo("feat(#1): x", 1)).toBe(true);
  });
});

describe("021 AC-44: the helper, on a throwaway repository", { timeout: 60_000 }, () => {
  it("AC-44 (a): while X is in_progress, every uncommitted change under P is X's, and an ignored file is not", () => {
    const { repo } = buildRepo({ [X]: "in_progress", [Y]: "pending" });
    dirtyTheTree(repo);
    // Non-vacuity: the ignored file really is ignored, and really is there.
    expect(run(repo, "check-ignore", `${P}/debug.log`).trim()).toBe(`${P}/debug.log`);

    expect(observe(repo, (cwd) => featureStatus(X, { cwd }))).toBe("in_progress");
    expect(observe(repo, (cwd) => filesTouchedBy(X, [P], { cwd }))).toEqual(DIRTY);
  });

  it("AC-44 (b): with X done and Y in_progress, the same changes are not X's", () => {
    const { repo } = buildRepo({ [X]: "done", [Y]: "in_progress" });
    dirtyTheTree(repo);

    expect(observe(repo, (cwd) => filesTouchedBy(X, [P], { cwd }))).toEqual([]);
    // They are Y's: Y is the feature in progress, and it needs no commit of its own yet.
    expect(observe(repo, (cwd) => filesTouchedBy(Y, [P], { cwd }))).toEqual(DIRTY);
  });

  it("AC-44 (c): with X done and a clean tree, only commits whose subject is X's count", () => {
    const { repo, approval } = buildRepo({ [X]: "done", [Y]: "pending" });

    write(repo, `${P}/a.txt`, "one\nTWO\nthree\n");
    const fix = commit(repo, `fix(#${X}): edit a`);
    write(repo, `${P}/b.txt`, "ALPHA\n");
    const spec = commit(repo, `spec(#${X}): edit b`);
    write(repo, `${P}/c.txt`, "GAMMA\n");
    commit(repo, `feat(#${Y}): edit c`);
    write(repo, `${P}/[id]/page.txt`, "PAGE\n");
    commit(repo, "fix(app): edit the page");
    write(repo, `${P}/d`, "D\n");
    commit(repo, "harness(repo): edit d", `fix(#${X}): named on a body line only`);
    write(repo, "elsewhere/x.txt", "X\n");
    const outside = commit(repo, `feat(#${X}): outside P`);

    expect(observe(repo, (cwd) => workingTreeChanges(["."], { cwd }))).toEqual([]);
    expect(observe(repo, (cwd) => commitsOf(X, { cwd }))).toEqual([approval, fix, spec, outside]);
    expect(observe(repo, (cwd) => filesTouchedBy(X, [P], { cwd }))).toEqual([
      `${P}/a.txt`,
      `${P}/b.txt`,
    ]);
  });

  it("AC-44 (d): with X in_progress and a clean tree, X's committed work under P is still seen", () => {
    const { repo } = buildRepo({ [X]: "in_progress", [Y]: "pending" });
    write(repo, `${P}/a.txt`, "one\nTWO\nthree\n");
    commit(repo, `feat(#${X}): edit a before the feature is done`);

    expect(observe(repo, (cwd) => workingTreeChanges([P], { cwd }))).toEqual([]);
    expect(observe(repo, (cwd) => filesTouchedBy(X, [P], { cwd }))).toEqual([`${P}/a.txt`]);
  });

  it("AC-44 (e): changedLinesBy is each X commit's own +/- lines in order, headers dropped, then the working tree's", () => {
    const { repo } = buildRepo({ [X]: "done", [Y]: "pending" });

    write(repo, `${P}/a.txt`, "one\nTWO\nthree\n");
    commit(repo, `feat(#${X}): first`);
    write(repo, `${P}/a.txt`, "one\nTWO\nthree\nfour\n");
    commit(repo, `feat(#${Y}): not X's`);
    // Content lines that begin `++` and `--` print as `+++ …` and `--- …`, exactly like a
    // file header: they must be kept, and the real headers of the new file must not.
    write(repo, `${P}/b.txt`, "++ plus\n");
    write(repo, `${P}/n.txt`, "-- minus\n");
    commit(repo, `fix(#${X}): second`);
    write(repo, `${P}/n.txt`, "kept");
    commit(repo, `spec(#${X}): third, with no newline at the end`);

    const committed = ["-two", "+TWO", "-alpha", "+++ plus", "+-- minus", "--- minus", "+kept"];
    expect(observe(repo, (cwd) => changedLinesBy(X, [P], { cwd }))).toEqual(committed);

    write(repo, `${P}/c.txt`, "GAMMA\n");
    write(repo, `${P}/u.txt`, "u1\nu2\n");
    write(repo, `${P}/u.log`, "ignored\n");

    // X done: the working tree is not X's.
    expect(observe(repo, (cwd) => changedLinesBy(X, [P], { cwd }))).toEqual(committed);

    setStatuses(repo, { [X]: "in_progress", [Y]: "pending" });
    expect(observe(repo, (cwd) => changedLinesBy(X, [P], { cwd }))).toEqual([
      ...committed,
      "-gamma",
      "+GAMMA",
      "+u1",
      "+u2",
    ]);
  });

  it("AC-44 (f): workingTreeChanges lists a change under P whatever any status is, and [] when clean", () => {
    const { repo } = buildRepo({ [X]: "done", [Y]: "done" });
    expect(observe(repo, (cwd) => workingTreeChanges([P], { cwd }))).toEqual([]);

    write(repo, `${P}/a.txt`, "one\nTWO\nthree\n");
    write(repo, "elsewhere/x.txt", "changed outside P\n");

    for (const statuses of [
      { [X]: "done", [Y]: "done" },
      { [X]: "in_progress", [Y]: "pending" },
      { [X]: "pending", [Y]: "in_progress" },
    ]) {
      setStatuses(repo, statuses);
      expect(observe(repo, (cwd) => workingTreeChanges([P], { cwd }))).toEqual([`${P}/a.txt`]);
    }

    // It does not read feature_list.json at all.
    writeFileSync(join(repo, "feature_list.json"), "not json {");
    expect(observe(repo, (cwd) => workingTreeChanges([P], { cwd }))).toEqual([`${P}/a.txt`]);
    remove(repo, "feature_list.json");
    expect(observe(repo, (cwd) => workingTreeChanges([P], { cwd }))).toEqual([`${P}/a.txt`]);
  });

  it("AC-44 (g): a directory named [id] is found by that literal path, not read as a character class", () => {
    const { repo } = buildRepo({ [X]: "in_progress", [Y]: "pending" });
    const literal = `${P}/[id]`;
    write(repo, `${literal}/page.txt`, "PAGE\n");
    // `guarded/d` is what `[id]` would match as a glob.
    write(repo, `${P}/d`, "D\n");

    expect(observe(repo, (cwd) => workingTreeChanges([literal], { cwd }))).toEqual([
      `${literal}/page.txt`,
    ]);
    expect(observe(repo, (cwd) => filesTouchedBy(X, [literal], { cwd }))).toEqual([
      `${literal}/page.txt`,
    ]);

    commit(repo, `fix(#${X}): the page, and d`);
    setStatuses(repo, { [X]: "done", [Y]: "pending" });

    // Non-vacuity: without literal pathspecs, git itself reads the same path as a glob.
    expect(run(repo, "show", "--name-only", "--format=", "HEAD", "--", literal)).toContain(`${P}/d`);

    expect(observe(repo, (cwd) => filesTouchedBy(X, [literal], { cwd }))).toEqual([
      `${literal}/page.txt`,
    ]);
    expect(observe(repo, (cwd) => changedLinesBy(X, [literal], { cwd }))).toEqual([
      "-page",
      "+PAGE",
    ]);
  });

  it("AC-44 (h): an absent id, a missing or broken feature list, or a finished feature with no commits throws, naming the id", () => {
    const { repo } = buildRepo({ [X]: "done", 81: "done", 82: "pending", 83: "in_progress" });

    for (const check of [filesTouchedBy, changedLinesBy]) {
      expect(() => observe(repo, (cwd) => check(99, [P], { cwd }))).toThrow(/#99\b/);
      expect(() => observe(repo, (cwd) => check(81, [P], { cwd }))).toThrow(/#81\b.*no commit/);
      expect(() => observe(repo, (cwd) => check(82, [P], { cwd }))).toThrow(/#82\b.*no commit/);
      // In progress with no commit yet is legitimate: its work is the working tree.
      expect(observe(repo, (cwd) => check(83, [P], { cwd }))).toEqual([]);
      // Non-vacuity: X, done with a commit, is answered rather than refused.
      expect(observe(repo, (cwd) => check(X, [P], { cwd }))).toEqual([]);
    }

    writeFileSync(join(repo, "feature_list.json"), "not json {");
    for (const check of [filesTouchedBy, changedLinesBy]) {
      expect(() => observe(repo, (cwd) => check(X, [P], { cwd }))).toThrow(/#8\b.*not JSON/);
    }

    remove(repo, "feature_list.json");
    for (const check of [filesTouchedBy, changedLinesBy]) {
      expect(() => observe(repo, (cwd) => check(X, [P], { cwd }))).toThrow(/#8\b.*cannot read/);
    }
  });

  it("AC-44 (h): a shallow clone makes every history read throw", () => {
    const { repo } = buildRepo({ [X]: "in_progress", [Y]: "pending" });
    write(repo, `${P}/a.txt`, "one\nTWO\nthree\n");
    commit(repo, `feat(#${X}): edit a`);

    const clone = join(scratchDirectory(), "shallow");
    // A file URL, because a local path would ignore --depth.
    run(dirname(clone), "clone", "-q", "--depth", "1", pathToFileURL(repo).href, clone);
    expect(run(clone, "rev-parse", "--is-shallow-repository").trim()).toBe("true");
    setStatuses(clone, { [X]: "in_progress", [Y]: "pending" });

    expect(() => observe(clone, (cwd) => commitsOf(X, { cwd }))).toThrow(/#8\b.*shallow/);
    expect(() => observe(clone, (cwd) => filesTouchedBy(X, [P], { cwd }))).toThrow(/#8\b.*shallow/);
    expect(() => observe(clone, (cwd) => changedLinesBy(X, [P], { cwd }))).toThrow(/#8\b.*shallow/);
  });

  it("AC-44 (h): outside a git repository, every function that runs git throws", () => {
    const outside = scratchDirectory();
    // Non-vacuity: the directory really is outside every repository.
    expect(spawnSync("git", ["rev-parse", "--git-dir"], { cwd: outside }).status).not.toBe(0);
    setStatuses(outside, { [X]: "in_progress", [Y]: "pending" });

    expect(() => commitsOf(X, { cwd: outside })).toThrow(/#8\b/);
    expect(() => filesTouchedBy(X, [P], { cwd: outside })).toThrow(/#8\b/);
    expect(() => changedLinesBy(X, [P], { cwd: outside })).toThrow(/#8\b/);
    expect(() => workingTreeChanges([P], { cwd: outside })).toThrow(/not a git repository/);
  });
});

/* ===================================================================================
 * AC-45: every shipped git assertion about one feature's work goes through the helper.
 *
 * The strings this scan bans are built from parts, so that this file - which is scanned like
 * every other, and not excepted - does not spell them.
 * =================================================================================== */

const PORCELAIN = ["--", "porcelain"].join("");
const TIP_RANGE = ["..", "HEAD"].join("");
const OLD_CLAIM = ["stays", "true", "forever"].join(" ");

const HELPER = "tests/support/feature-scope.ts";
const THIS_FILE = "tests/unit/feature-scope.test.ts";
const ROW_11_FILE = "tests/unit/stock-entry-contract.test.ts";
const ROW_11_TITLE = "AC-32: the source workbook is untouched";
const PHASE_0_FILES = [
  "tests/unit/analysis-contract.test.ts",
  "tests/unit/count-entry-contract.test.ts",
  "tests/unit/schema-and-migration.test.ts",
  ROW_11_FILE,
  "tests/unit/stock-takes-contract.test.ts",
];

/** Every tracked and untracked file under `tests/`, and every `*.test.ts` under `src/`. */
function scannedFiles(): string[] {
  const listed = spawnSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "tests", "src"],
    { encoding: "utf8" },
  );
  if (listed.status !== 0) throw new Error(`git ls-files failed: ${listed.stderr}`);

  return listed.stdout
    .split("\0")
    .filter((file) => file.startsWith("tests/") || (file.startsWith("src/") && file.endsWith(".test.ts")))
    .filter((file) => existsSync(file))
    .sort();
}

function parsed(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/**
 * Where each string literal whose text has an argument beginning with the porcelain flag
 * starts. Read from the syntax tree, so comments are removed by construction.
 */
function porcelainArguments(file: string): number[] {
  const flag = new RegExp(`(^|\\s)${PORCELAIN}`);
  const source = parsed(file);
  const found: number[] = [];

  const visit = (node: ts.Node): void => {
    if (
      (ts.isStringLiteral(node) ||
        ts.isNoSubstitutionTemplateLiteral(node) ||
        ts.isTemplateHead(node) ||
        ts.isTemplateMiddle(node) ||
        ts.isTemplateTail(node)) &&
      flag.test(node.text)
    ) {
      found.push(node.getStart(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return found;
}

/** The source span of the `it(...)` call with this exact title. */
function testSpan(file: string, title: string): { start: number; end: number } {
  const source = parsed(file);
  const spans: { start: number; end: number }[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "it" &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0]) &&
      node.arguments[0].text === title
    ) {
      spans.push({ start: node.getStart(source), end: node.getEnd() });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  expect(spans, `${file} has exactly one test titled "${title}"`).toHaveLength(1);
  return spans[0];
}

describe("021 AC-45: shipped git assertions name the feature, and Samples stays strict", () => {
  it("AC-45: only the helper, and row 11 exactly once, pass a porcelain argument to git", () => {
    const files = scannedFiles();
    // Non-vacuity: the scan reaches the helper, this file and all five converted files.
    expect(files).toEqual(expect.arrayContaining([HELPER, THIS_FILE, ...PHASE_0_FILES]));
    // ...and the detector sees an argument where one is known to be.
    expect(porcelainArguments(HELPER).length).toBeGreaterThan(0);

    const offenders = files
      .filter((file) => file !== HELPER && file !== ROW_11_FILE)
      .filter((file) =>
        /\.(ts|tsx|js|mjs|cjs)$/.test(file)
          ? porcelainArguments(file).length > 0
          : readFileSync(file, "utf8").includes(PORCELAIN),
      );
    expect(offenders).toEqual([]);

    const inRowFile = porcelainArguments(ROW_11_FILE);
    const row11 = testSpan(ROW_11_FILE, ROW_11_TITLE);
    expect(inRowFile).toHaveLength(1);
    expect(inRowFile[0]).toBeGreaterThan(row11.start);
    expect(inRowFile[0]).toBeLessThan(row11.end);
  });

  it("AC-45: no scanned file, and not the conventions, spells a range ending at the tip or the old claim", () => {
    const files = [...scannedFiles(), "docs/conventions.md"];
    expect(files).toContain(THIS_FILE);

    for (const file of files) {
      const raw = readFileSync(file, "utf8");

      expect(raw.includes(TIP_RANGE), `${file} spells a range ending at the tip`).toBe(false);
      expect(raw.includes(OLD_CLAIM), `${file} repeats the claim Phase 0 withdrew`).toBe(false);
    }
  });
});
