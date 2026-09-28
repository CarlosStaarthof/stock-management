/**
 * `npm run db:export -- --out <file>` — the copy of a database (spec 016 D19, D20, AC-9).
 *
 * Against production it runs through `npm run operator:production -- db:export --out <file>`,
 * which asks for the connection strings at a prompt. `<file>` must lie outside this
 * repository's working tree and must not exist yet; both are checked before any connection
 * is opened. The file holds every table of the schema `DATABASE_URL` names, with the PIN
 * credentials written as `null` and pending profile requests left out and counted.
 *
 * It prints the file's path, its SHA-256 and one line per table with its count, and nothing
 * else. A failure is reported by the error's name and code only, because a database error's
 * message can quote the values it was given.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, realpathSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

import { DomainError } from "@/server/errors";
import { exportDatabase } from "@/server/deploy/export";
import { exportSchema } from "@/server/deploy/target-schema";

const PREFIX = "[db:export]";
const USAGE = "usage: npm run db:export -- --out <file outside the repository>";

function fail(message: string): never {
  console.error(`${PREFIX} ${message}`);
  process.exit(1);
}

function outArgument(argv: string[]): string {
  if (argv.length !== 2 || argv[0] !== "--out" || argv[1] === "" || argv[1].startsWith("--")) {
    fail(USAGE);
  }
  return resolve(argv[1]);
}

/** The working tree's root as git knows it, and this package's root. */
function repositoryRoots(): string[] {
  const roots = [realpathSync(process.cwd())];
  const git = spawnSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" });
  const top = (git.stdout ?? "").trim();
  if (git.status === 0 && top !== "" && existsSync(top)) roots.push(realpathSync(top));
  return roots;
}

function isInside(root: string, path: string): boolean {
  const between = relative(root, path);
  return between === "" || (!between.startsWith("..") && !isAbsolute(between));
}

/** AC-9's two refusals, made before anything connects. */
function checkedOut(out: string): string {
  if (existsSync(out)) {
    fail("the --out file already exists. An export never overwrites a file; name a new one.");
  }
  const directory = dirname(out);
  if (!existsSync(directory)) {
    fail("the --out file's directory does not exist.");
  }
  const target = resolve(realpathSync(directory), basename(out));
  if (repositoryRoots().some((root) => isInside(root, target))) {
    fail("the --out file is inside the repository's working tree. Write the copy outside it.");
  }
  return target;
}

async function main(): Promise<void> {
  const out = checkedOut(outArgument(process.argv.slice(2)));
  const schema = exportSchema(process.env);

  const result = await exportDatabase(schema);

  // `wx`: created here, never written over, even if something appeared since the check.
  writeFileSync(out, result.text, { encoding: "utf8", flag: "wx" });

  console.log(`${PREFIX} wrote ${out}`);
  console.log(`${PREFIX} sha256 ${createHash("sha256").update(result.text, "utf8").digest("hex")}`);
  for (const table of result.tables) {
    console.log(`${PREFIX} ${table.name}: ${table.count}`);
  }
  // Ruling A1-F1: pending requests are left out of the copy, and only their number is kept.
  console.log(`${PREFIX} omittedPendingRequests: ${result.omittedPendingRequests}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    if (error instanceof DomainError) fail(error.message);
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? ` (${String((error as { code?: unknown }).code)})`
        : "";
    fail(`failed: ${error instanceof Error ? error.name : "unknown error"}${code}. No file was written.`);
  });
