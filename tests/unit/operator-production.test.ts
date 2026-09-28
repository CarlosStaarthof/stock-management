import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { generatePin } from "@/server/auth/credential-rules";

/**
 * Spec 016 AC-8, the launcher's own half: `npm run operator:production`.
 *
 * The launcher is driven through `runLauncher`, whose input, output, `.env` text and command
 * runner are all given here. Every answer and every `.env` value is a sentinel drawn at run
 * time, the prompt is fed at run time, and every run's output is checked for every sentinel.
 * Values are compared as yes or no, so a failing assertion prints no answer either. The real
 * process is also started, for the refusals that exit before any command runs.
 */

const LAUNCHER = join(process.cwd(), "scripts", "operator-production.mjs");
const SCHEME = "postgres" + "ql";

type Plan = { cli: string; args: string[]; prompts: string[] };
type Io = {
  argv: string[];
  input: NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown };
  output: { write: (text: string) => unknown };
  envFileText: string | null;
  baseEnv: Record<string, string | undefined>;
  run: (cli: string, args: string[], env: Record<string, string | undefined>) => number;
};
type Launcher = {
  ACCEPTED_FORMS: string[];
  PROMPTED_NAMES: string[];
  TERMINAL_NOTICE: string;
  NOT_A_TERMINAL_NOTICE: string;
  planCommand: (argv: string[]) => Plan | null;
  runLauncher: (io: Io) => Promise<number>;
};

async function launcher(): Promise<Launcher> {
  return (await import(pathToFileURL(LAUNCHER).href)) as Launcher;
}

function token(): string {
  return randomBytes(9).toString("hex");
}

function connection(): string {
  return `${SCHEME}://${token()}:${token()}@ep-${token()}.${token()}.invalid/${token()}`;
}

/** A fresh answer for each name the launcher may ask for. */
function answersFor(names: readonly string[]): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const name of names) {
    answers[name] =
      name === "NEW_PIN"
        ? generatePin(6)
        : name === "PIN_PEPPER"
          ? randomBytes(32).toString("base64")
          : connection();
  }
  return answers;
}

/** A `.env` text assigning a sentinel to each of the four names. */
function envFile(values: Record<string, string>): string {
  return Object.entries(values)
    .map(([name, value]) => `${name}="${value}"`)
    .join("\n");
}

type Call = { cli: string; args: string[]; env: Record<string, string | undefined> };
type Result = { code: number; printed: string; calls: Call[] };

async function launch(
  argv: string[],
  input: Io["input"],
  options: { envFileText?: string | null; baseEnv?: Record<string, string | undefined>; sentinels?: string[] } = {},
): Promise<Result> {
  const { runLauncher } = await launcher();
  let printed = "";
  const calls: Call[] = [];

  const code = await runLauncher({
    argv,
    input,
    output: { write: (text: string) => (printed += text) },
    envFileText: options.envFileText ?? null,
    baseEnv: options.baseEnv ?? {},
    run: (cli, args, env) => {
      calls.push({ cli, args, env });
      return 0;
    },
  });

  const leaked = (options.sentinels ?? []).filter((sentinel) => printed.includes(sentinel)).length;
  expect(leaked, "sentinels printed").toBe(0);
  for (const call of calls) {
    const onCommandLine = (options.sentinels ?? []).filter((sentinel) => call.args.join(" ").includes(sentinel));
    expect(onCommandLine.length, "sentinels on the command line").toBe(0);
  }
  return { code, printed, calls };
}

/** Input that is not a terminal: the given lines, then the end. */
function piped(lines: string[], ending = "\n"): PassThrough {
  const stream = new PassThrough();
  stream.end(lines.map((line) => `${line}${ending}`).join(""));
  return stream;
}

/**
 * A terminal stand-in: `isTTY`, a `setRawMode` that records each call, and an operator who
 * types the next answer, then Enter, each time a question appears.
 */
class Terminal extends PassThrough {
  readonly isTTY = true;
  readonly rawModes: boolean[] = [];

  setRawMode(mode: boolean): this {
    this.rawModes.push(mode);
    return this;
  }
}

async function typed(
  argv: string[],
  answers: string[],
  options: { envFileText?: string | null; sentinels?: string[] } = {},
): Promise<Result & { terminal: Terminal }> {
  const { runLauncher } = await launcher();
  const terminal = new Terminal();
  const queue = [...answers];
  let printed = "";
  const calls: Call[] = [];

  const code = await runLauncher({
    argv,
    input: terminal,
    output: {
      write: (text: string) => {
        printed += text;
        if (/: $/.test(text) && queue.length > 0) {
          const next = queue.shift() ?? "";
          // One key at a time, as a person types; then Enter.
          setImmediate(() => {
            for (const character of next) terminal.write(character);
            terminal.write("\r");
          });
        }
      },
    },
    envFileText: options.envFileText ?? null,
    baseEnv: {},
    run: (cli, args, env) => {
      calls.push({ cli, args, env });
      return 0;
    },
  });

  const leaked = (options.sentinels ?? []).filter((sentinel) => printed.includes(sentinel)).length;
  expect(leaked, "sentinels printed").toBe(0);
  return { code, printed, calls, terminal };
}

const FORMS: { argv: string[]; cli: string; args: string[]; prompts: string[] }[] = [
  { argv: ["db:census"], cli: "tsx", args: ["scripts/db-census.ts"], prompts: ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER"] },
  { argv: ["db:export", "--out", "copy.json"], cli: "tsx", args: ["scripts/db-export.ts", "--out", "copy.json"], prompts: ["DATABASE_URL", "DIRECT_URL"] },
  { argv: ["db:restore", "--in", "copy.json"], cli: "tsx", args: ["scripts/db-restore.ts", "--in", "copy.json"], prompts: ["DATABASE_URL", "DIRECT_URL"] },
  { argv: ["pin:reset", "--list"], cli: "tsx", args: ["scripts/pin-reset.ts", "--list"], prompts: ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER"] },
  { argv: ["pin:reset", "--profile", "c123"], cli: "tsx", args: ["scripts/pin-reset.ts", "--profile", "c123"], prompts: ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER", "NEW_PIN"] },
  { argv: ["migrate:status"], cli: "prisma", args: ["migrate", "status"], prompts: ["DATABASE_URL", "DIRECT_URL"] },
  { argv: ["migrate:resolve", "--rolled-back", "20260101000000_x"], cli: "prisma", args: ["migrate", "resolve", "--rolled-back", "20260101000000_x"], prompts: ["DATABASE_URL", "DIRECT_URL"] },
  { argv: ["migrate:resolve", "--applied", "20260101000000_x"], cli: "prisma", args: ["migrate", "resolve", "--applied", "20260101000000_x"], prompts: ["DATABASE_URL", "DIRECT_URL"] },
];

describe("016 AC-8: exactly eight command forms", () => {
  it("AC-8: each accepted form runs its command and asks for exactly its settings", async () => {
    const { planCommand, ACCEPTED_FORMS } = await launcher();

    expect(ACCEPTED_FORMS).toHaveLength(8);
    for (const form of FORMS) {
      expect(planCommand(form.argv), form.argv.join(" ")).toEqual({ cli: form.cli, args: form.args, prompts: form.prompts });
    }
  });

  it("AC-8: every accepted form, run, passes its answers in the command's environment only", async () => {
    const { PROMPTED_NAMES } = await launcher();

    for (const form of FORMS) {
      const answers = answersFor(form.prompts);
      const inherited = answersFor(PROMPTED_NAMES);
      const run = await launch(form.argv, piped(form.prompts.map((name) => answers[name] ?? "")), {
        baseEnv: { ...inherited, KEPT: "yes" },
        sentinels: [...Object.values(answers), ...Object.values(inherited)],
      });

      expect(run.code, form.argv.join(" ")).toBe(0);
      expect(run.calls).toHaveLength(1);
      expect(run.calls[0]?.cli).toBe(form.cli);
      expect(run.calls[0]?.args).toEqual(form.args);
      const env = run.calls[0]?.env ?? {};
      for (const name of PROMPTED_NAMES) {
        expect(env[name] === answers[name], `${form.argv[0]} ${name}`).toBe(true);
      }
      expect(env.KEPT).toBe("yes");

      const asked = [...run.printed.matchAll(/^(DATABASE_URL|DIRECT_URL|PIN_PEPPER|NEW_PIN)\b.*: $/gm)].map((match) => match[1]);
      expect(asked, form.argv.join(" ")).toEqual(form.prompts);
    }
  });

  it("AC-8: anything else exits non-zero before asking for anything, listing the accepted forms", async () => {
    const { ACCEPTED_FORMS } = await launcher();
    const refused = [
      [],
      ["db:census", "--extra"],
      ["db:export"],
      ["db:export", "--out"],
      ["db:export", "--out", "--in"],
      ["db:export", "--in", "copy.json"],
      ["db:restore", "--in"],
      ["pin:reset"],
      ["pin:reset", "--profile"],
      ["pin:reset", "--list", "--profile", "c123"],
      ["migrate:status", "--schema", "x"],
      ["migrate:resolve", "--rolled-back"],
      ["migrate:resolve", "--deleted", "x"],
      ["migrate:deploy"],
      ["migrate:reset"],
      ["migrate:dev"],
      ["db:push"],
      ["seed:workbook"],
      ["DB:CENSUS"],
      ["db:census;", "x"],
    ];

    for (const argv of refused) {
      const input = piped([connection(), connection()]);
      const run = await launch(argv, input);

      expect(run.code, argv.join(" ")).not.toBe(0);
      expect(run.calls).toEqual([]);
      expect(run.printed).not.toMatch(/: $/m);
      for (const form of ACCEPTED_FORMS) expect(run.printed).toContain(`operator:production -- ${form}`);
      // Nothing was read: the answers are still waiting in the input.
      expect(input.readableLength, argv.join(" ")).toBeGreaterThan(0);
    }
  });
});

describe("016 AC-8: the prompt", () => {
  it("AC-8: from input that is not a terminal, it reads one answer per line, CRLF included", async () => {
    const answers = answersFor(["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER"]);
    const input = piped([answers.DATABASE_URL ?? "", answers.DIRECT_URL ?? "", answers.PIN_PEPPER ?? ""], "\r\n");

    const run = await launch(["db:census"], input, { sentinels: Object.values(answers) });

    expect(run.code).toBe(0);
    for (const name of ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER"]) {
      expect(run.calls[0]?.env[name] === answers[name], name).toBe(true);
    }
  });

  it("AC-8: on a terminal, the typed characters are not shown, and raw mode is on while typing and off after", async () => {
    const answers = answersFor(["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER", "NEW_PIN"]);

    const run = await typed(
      ["pin:reset", "--profile", "c123"],
      ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER", "NEW_PIN"].map((name) => answers[name] ?? ""),
      { sentinels: Object.values(answers) },
    );

    expect(run.code).toBe(0);
    expect(run.terminal.rawModes).toEqual([true, false]);
    for (const [name, value] of Object.entries(answers)) {
      expect(run.calls[0]?.env[name] === value, name).toBe(true);
    }
    // Every character typed was swallowed: what was written is the questions and line breaks.
    const shown = run.printed.replace(/^\[operator:production\].*$/gm, "").replace(/^[A-Z_]+ ?(\([^)]*\))?: $/gm, "");
    expect(shown.replace(/\s/g, "")).toBe("");
  });

  it("AC-8: on a terminal, backspace edits the answer and Ctrl+C cancels without running anything", async () => {
    const answer = connection();
    const edited = await typed(["migrate:status"], [`${answer}x\u007f`, `${answer}`], { sentinels: [answer] });
    expect(edited.code).toBe(0);
    expect(edited.calls[0]?.env.DATABASE_URL === answer, "the edited answer").toBe(true);

    const cancelled = await typed(["migrate:status"], [`${token()}\u0003`], {});
    expect(cancelled.code).not.toBe(0);
    expect(cancelled.calls).toEqual([]);
    expect(cancelled.terminal.rawModes).toEqual([true, false]);
  });
});

describe("016 AC-8 (review R4): a hidden prompt is promised only on a terminal", () => {
  it("R4: on a terminal it says nothing typed is shown, and gives no warning", async () => {
    const { TERMINAL_NOTICE, NOT_A_TERMINAL_NOTICE } = await launcher();
    const answers = answersFor(["DATABASE_URL", "DIRECT_URL"]);

    const run = await typed(["migrate:status"], [answers.DATABASE_URL ?? "", answers.DIRECT_URL ?? ""], {
      sentinels: Object.values(answers),
    });

    expect(run.code).toBe(0);
    expect(run.printed).toContain(`[operator:production] migrate:status: ${TERMINAL_NOTICE}\n`);
    expect(run.printed).not.toContain(NOT_A_TERMINAL_NOTICE);
    expect(run.printed).not.toMatch(/not a terminal|may be visible/);
  });

  it("R4: from input that is not a terminal it says so, that answers may be visible, to stop with Ctrl+C, and which terminals to use, and it still reads one answer per line", async () => {
    const { TERMINAL_NOTICE, NOT_A_TERMINAL_NOTICE } = await launcher();
    const answers = answersFor(["DATABASE_URL", "DIRECT_URL"]);

    const run = await launch(["migrate:status"], piped([answers.DATABASE_URL ?? "", answers.DIRECT_URL ?? ""]), {
      sentinels: Object.values(answers),
    });

    expect(run.code).toBe(0);
    expect(run.printed).toContain(`[operator:production] migrate:status: ${NOT_A_TERMINAL_NOTICE}\n`);
    expect(run.printed).not.toContain(TERMINAL_NOTICE);
    expect(run.printed).not.toMatch(/Nothing you type is shown/);
    for (const phrase of [/not a terminal/, /one per line/, /may be visible/, /Ctrl\+C/, /PowerShell/, /Windows Terminal/]) {
      expect(NOT_A_TERMINAL_NOTICE).toMatch(phrase);
    }
    for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
      expect(run.calls[0]?.env[name] === answers[name], name).toBe(true);
    }
  });

  it("R4: started for real with piped input, it prints the not-a-terminal notice", async () => {
    const { NOT_A_TERMINAL_NOTICE } = await launcher();
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const name of ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER", "NEW_PIN"]) delete env[name];

    const result = spawnSync(process.execPath, [LAUNCHER, "migrate:status"], { encoding: "utf8", env, input: "\n" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(NOT_A_TERMINAL_NOTICE);
  });
});

describe("016 AC-8: the refusals", () => {
  it("AC-8: an empty answer is refused for each name it asks, naming the variable and printing no value", async () => {
    const names = ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER", "NEW_PIN"];

    for (const [position, name] of names.entries()) {
      for (const blank of ["", "   "]) {
        const answers = answersFor(names);
        const lines = names.map((each, index) => (index === position ? blank : (answers[each] ?? "")));

        const run = await launch(["pin:reset", "--profile", "c123"], piped(lines), {
          sentinels: Object.values(answers),
        });

        expect(run.code, name).not.toBe(0);
        expect(run.calls).toEqual([]);
        expect(run.printed).toContain(`${name}: the answer is empty`);
      }
    }
  });

  it("AC-8: input that ends before every answer is given is refused, and nothing runs", async () => {
    const answers = answersFor(["DATABASE_URL"]);
    const run = await launch(["db:census"], piped([answers.DATABASE_URL ?? ""]), { sentinels: Object.values(answers) });

    expect(run.code).not.toBe(0);
    expect(run.calls).toEqual([]);
    expect(run.printed).toContain("DIRECT_URL: the answer is empty");
  });

  it("AC-8: an answer equal to the value .env holds for the same name is refused, naming it and printing neither value", async () => {
    const names = ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER", "NEW_PIN"];

    for (const [position, name] of names.entries()) {
      const development = answersFor(names);
      const answers = answersFor(names);
      answers[name] = development[name] ?? "";
      // Spaces around a pasted value do not make it a different value.
      const lines = names.map((each, index) => (index === position ? `  ${answers[each]} ` : (answers[each] ?? "")));

      const run = await launch(["pin:reset", "--profile", "c123"], piped(lines), {
        envFileText: envFile(development),
        sentinels: [...Object.values(development), ...Object.values(answers)],
      });

      expect(run.code, name).not.toBe(0);
      expect(run.calls).toEqual([]);
      expect(run.printed).toContain(`${name}: the answer equals the value .env holds for ${name}`);
    }
  });

  it("AC-8: a value .env holds is never used: the command gets the answers, and a missing answer is refused rather than filled from .env", async () => {
    const names = ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER"];
    const development = answersFor(names);
    const answers = answersFor(names);
    const sentinels = [...Object.values(development), ...Object.values(answers)];

    const run = await launch(["db:census"], piped(names.map((name) => answers[name] ?? "")), {
      envFileText: envFile(development),
      sentinels,
    });
    expect(run.code).toBe(0);
    for (const name of names) expect(run.calls[0]?.env[name] === answers[name], name).toBe(true);

    const missing = await launch(["db:census"], piped([answers.DATABASE_URL ?? "", ""]), {
      envFileText: envFile(development),
      sentinels,
    });
    expect(missing.code).not.toBe(0);
    expect(missing.calls).toEqual([]);
  });
});

describe("016 AC-8: no file of its own, no answer printed", () => {
  it("AC-8: the launcher's source calls no file-writing API", () => {
    const source = readFileSync(LAUNCHER, "utf8");
    const writers = /\b(?:writeFile|writeFileSync|appendFile|appendFileSync|createWriteStream|mkdir|mkdirSync|rename|renameSync|copyFile|copyFileSync|rm|rmSync|unlink|unlinkSync|openSync|symlink|symlinkSync|truncate|truncateSync)\s*\(/;

    expect(source).not.toMatch(writers);
    // Non-vacuity: the pattern catches the call it names.
    expect(`writeFileSync(${JSON.stringify(token())})`).toMatch(writers);
  });

  it("AC-8: started for real, it refuses an unknown form and an empty answer, exits non-zero and prints no answer", () => {
    const answer = connection();
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const name of ["DATABASE_URL", "DIRECT_URL", "PIN_PEPPER", "NEW_PIN"]) delete env[name];

    const unknown = spawnSync(process.execPath, [LAUNCHER, "migrate:reset"], { encoding: "utf8", env, input: `${answer}\n` });
    expect(unknown.status).not.toBe(0);
    expect(unknown.stderr).toContain("npm run operator:production -- db:census");
    expect(`${unknown.stdout}${unknown.stderr}`.includes(answer)).toBe(false);

    const empty = spawnSync(process.execPath, [LAUNCHER, "migrate:status"], { encoding: "utf8", env, input: `${answer}\n\n` });
    expect(empty.status).not.toBe(0);
    expect(empty.stderr).toContain("DIRECT_URL: the answer is empty");
    expect(`${empty.stdout}${empty.stderr}`.includes(answer)).toBe(false);
  });
});
