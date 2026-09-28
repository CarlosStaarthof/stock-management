#!/usr/bin/env node
// `npm run operator:production -- <command> [arguments]` — the one way an operator command
// reaches a live database (spec 016 D11, AC-8).
//
// It asks for the settings at a prompt, never from a file. A production connection string
// on a command line stays in shell history; in `.env` the next `npm run test:e2e` would write
// its fixtures into production. So this launcher:
//
//   * accepts exactly eight command forms, and refuses anything else before asking for
//     anything;
//   * asks for DATABASE_URL and DIRECT_URL for every form, PIN_PEPPER for `db:census` and
//     both `pin:reset` forms, and NEW_PIN for `pin:reset --profile`. On a terminal nothing
//     typed is shown; from input that is not a terminal it reads one answer per line;
//   * refuses an empty answer, and an answer equal to the value `.env` holds for the same
//     name. It reads `.env` for that comparison only: a value found there is never used,
//     and never printed;
//   * runs the command with the answers in that command's environment only — never on its
//     command line — writes no file of its own, and prints no answer.
//
// It is plain Node on purpose: nothing here loads Prisma's client, which would fill this
// process's environment from `.env` before a single question was asked.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as nodeUtil from "node:util";

const PREFIX = "[operator:production]";
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** The eight forms of AC-8, as the usage lists them. */
export const ACCEPTED_FORMS = [
  "db:census",
  "db:export --out <file>",
  "db:restore --in <file>",
  "pin:reset --list",
  "pin:reset --profile <id>",
  "migrate:status",
  "migrate:resolve --rolled-back <migration>",
  "migrate:resolve --applied <migration>",
];

/** Every name the launcher may ask for. None of them is inherited by the command. */
export const PROMPTED_NAMES = ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER", "NEW_PIN"];

const CONNECTION = ["DATABASE_URL", "DIRECT_URL"];

// Name-and-hint pairs rather than an object keyed by name: the repository's scans read a
// secret's name followed by a colon and a quoted text as a value written down.
const HINTS = new Map([
  ["DATABASE_URL", "the pooled connection string"],
  ["DIRECT_URL", "the unpooled connection string"],
  ["PIN_PEPPER", "as kept outside the server"],
  ["NEW_PIN", "the PIN you chose"],
]);

function question(name) {
  return `${name} (${HINTS.get(name)}): `;
}

/** A value argument: present, and not another flag. */
function isValue(argument) {
  return typeof argument === "string" && argument !== "" && !argument.startsWith("-");
}

/**
 * The command a form runs, or `null` for anything that is not exactly one of the eight.
 * `cli` names the package whose own CLI runs; `args` are that CLI's arguments.
 */
export function planCommand(argv) {
  const [command, ...rest] = argv;
  const exactly = (...expected) =>
    rest.length === expected.length && expected.every((token, index) => token === null || rest[index] === token);

  switch (command) {
    case "db:census":
      return rest.length === 0
        ? { cli: "tsx", args: ["scripts/db-census.ts"], prompts: [...CONNECTION, "PIN_PEPPER"] }
        : null;
    case "db:export":
      return exactly("--out", null) && isValue(rest[1])
        ? { cli: "tsx", args: ["scripts/db-export.ts", "--out", rest[1]], prompts: [...CONNECTION] }
        : null;
    case "db:restore":
      return exactly("--in", null) && isValue(rest[1])
        ? { cli: "tsx", args: ["scripts/db-restore.ts", "--in", rest[1]], prompts: [...CONNECTION] }
        : null;
    case "pin:reset":
      if (exactly("--list")) {
        return { cli: "tsx", args: ["scripts/pin-reset.ts", "--list"], prompts: [...CONNECTION, "PIN_PEPPER"] };
      }
      return exactly("--profile", null) && isValue(rest[1])
        ? {
            cli: "tsx",
            args: ["scripts/pin-reset.ts", "--profile", rest[1]],
            prompts: [...CONNECTION, "PIN_PEPPER", "NEW_PIN"],
          }
        : null;
    case "migrate:status":
      return rest.length === 0 ? { cli: "prisma", args: ["migrate", "status"], prompts: [...CONNECTION] } : null;
    case "migrate:resolve":
      if ((exactly("--rolled-back", null) || exactly("--applied", null)) && isValue(rest[1])) {
        return { cli: "prisma", args: ["migrate", "resolve", rest[0], rest[1]], prompts: [...CONNECTION] };
      }
      return null;
    default:
      return null;
  }
}

/** `.env`'s assignments, for comparison only. Node's own parser where it exists. */
export function parseEnvText(text) {
  if (typeof nodeUtil.parseEnv === "function") return nodeUtil.parseEnv(text);

  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().replace(/^export\s+/, "");
    if (line === "" || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    let value = line.slice(equals + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'" || quote === "`") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    values[line.slice(0, equals).trim()] = value;
  }
  return values;
}

/** One answer per line, from input that is not a terminal. `null` once the input has ended. */
function lineReader(input) {
  let buffer = "";
  let ended = false;
  const lines = [];
  const waiting = [];

  const settle = () => {
    while (waiting.length > 0 && (lines.length > 0 || ended)) {
      waiting.shift()(lines.length > 0 ? lines.shift() : null);
    }
  };

  input.setEncoding?.("utf8");
  input.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      lines.push(buffer.slice(0, newline).replace(/\r$/, ""));
      buffer = buffer.slice(newline + 1);
    }
    settle();
  });
  input.on("end", () => {
    if (buffer !== "") lines.push(buffer.replace(/\r$/, ""));
    buffer = "";
    ended = true;
    settle();
  });
  input.resume?.();

  return {
    next: () =>
      new Promise((resolveLine) => {
        waiting.push(resolveLine);
        settle();
      }),
    close: () => input.pause?.(),
  };
}

/**
 * Answers from a terminal, with echo off: raw mode for the whole session, and nothing written
 * back but a line break per answer. Backspace edits; Ctrl+C cancels, after which every answer
 * is `null`. An answer pasted together with its Enter keeps what follows for the next one.
 */
function terminalReader(input, output) {
  let current = "";
  let afterReturn = false;
  let cancelled = false;
  const lines = [];
  const waiting = [];

  const settle = () => {
    while (waiting.length > 0 && (cancelled || lines.length > 0)) {
      waiting.shift()(cancelled ? null : lines.shift());
    }
  };

  const onData = (chunk) => {
    for (const character of String(chunk)) {
      if (cancelled) break;
      if (character === "\n" && afterReturn) {
        afterReturn = false;
        continue;
      }
      afterReturn = character === "\r";
      if (character === "\r" || character === "\n") {
        lines.push(current);
        current = "";
        output.write("\n");
      } else if (character === "\u0003") {
        cancelled = true;
      } else if (character === "\u007f" || character === "\b") {
        current = Array.from(current).slice(0, -1).join("");
      } else if (character >= " ") {
        current += character;
      }
    }
    settle();
  };

  input.setEncoding?.("utf8");
  input.setRawMode(true);
  input.on("data", onData);
  input.resume();

  return {
    next: () =>
      new Promise((resolveLine) => {
        waiting.push(resolveLine);
        settle();
      }),
    close: () => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
    },
  };
}

/**
 * AC-8, whole. Returns the exit code. Every dependency is given, so the unit tests can feed
 * the prompt at run time and stand in for the command; the real run below passes the real ones.
 *
 * @param {{
 *   argv: string[],
 *   input: NodeJS.ReadableStream & { isTTY?: boolean, setRawMode?: (mode: boolean) => unknown },
 *   output: { write: (text: string) => unknown },
 *   envFileText: string | null,
 *   baseEnv: Record<string, string | undefined>,
 *   run: (cli: string, args: string[], env: Record<string, string | undefined>) => number,
 * }} io
 */
export async function runLauncher(io) {
  const { argv, input, output, envFileText, baseEnv, run } = io;
  const say = (line) => output.write(`${PREFIX} ${line}\n`);

  const plan = planCommand(argv);
  if (plan === null) {
    say("that is not an operator command. It accepts exactly these forms:");
    for (const form of ACCEPTED_FORMS) output.write(`  npm run operator:production -- ${form}\n`);
    return 2;
  }

  const development = envFileText === null ? {} : parseEnvText(envFileText);
  const terminal = input.isTTY === true && typeof input.setRawMode === "function";
  const reader = terminal ? terminalReader(input, output) : lineReader(input);

  say(`${argv[0]}: answer each setting. Nothing you type is shown, stored or printed.`);

  const answers = {};
  try {
    for (const name of plan.prompts) {
      output.write(question(name));
      const raw = await reader.next();
      if (!terminal) output.write("\n");

      if (raw === null && terminal) {
        say("cancelled: nothing was run.");
        return 130;
      }
      const answer = (raw ?? "").trim();
      if (answer === "") {
        say(`${name}: the answer is empty. Nothing was run.`);
        return 2;
      }
      const held = development[name];
      if (typeof held === "string" && held.trim() !== "" && held.trim() === answer) {
        say(
          `${name}: the answer equals the value .env holds for ${name}. Operator commands never ` +
            "run on the development settings. Nothing was run.",
        );
        return 2;
      }
      answers[name] = answer;
    }
  } finally {
    reader.close();
  }

  const env = { ...baseEnv };
  for (const name of PROMPTED_NAMES) delete env[name];
  Object.assign(env, answers);

  return run(plan.cli, plan.args, env);
}

const require = createRequire(import.meta.url);

/** A package's CLI, through its own `bin` entry. */
function cliOf(packageName) {
  const manifestPath = require.resolve(`${packageName}/package.json`);
  const manifest = require(manifestPath);
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin[packageName];
  return join(dirname(manifestPath), bin);
}

/** The real command: the package's CLI under this Node, from the repository root, no shell. */
function runCommand(cli, args, env) {
  const result = spawnSync(process.execPath, [cliOf(cli), ...args], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "inherit", "inherit"],
  });
  return result.error === undefined ? (result.status ?? 1) : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const envFile = join(ROOT, ".env");
  const code = await runLauncher({
    argv: process.argv.slice(2),
    input: process.stdin,
    output: process.stderr,
    envFileText: existsSync(envFile) ? readFileSync(envFile, "utf8") : null,
    baseEnv: process.env,
    run: runCommand,
  });
  process.exit(code);
}
