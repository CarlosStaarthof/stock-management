import { readFileSync } from "node:fs";

import { SETUP_CODE_MIN_LENGTH } from "@/server/auth/credential-rules";
import { isUsablePinPepper } from "@/server/auth/password";

/**
 * `.env` is the only settings file (021 → Post-approval amendments → *`.env` is the only
 * settings file*). This module holds what the file must contain, as a pure check on its
 * text, and reads the document that says how to make it: `docs/operations.md` →
 * *Environment*.
 *
 * THE CHECK ANSWERS WITH LABELS, NEVER VALUES. Each problem is one of the fixed sentences in
 * `ENV_FILE_LABELS`, naming a setting and a fact, so a failing test says which fact is wrong
 * and prints nothing that is in the file. `tests/unit/env-file.test.ts` proves every label it
 * can return is one of them.
 *
 * It lives here, not in a test file, because two test files use it: importing a test file
 * from another would run the first file's tests a second time.
 */

/** The eight settings: 002 AC-7's four, 003 AC-30's two, and 021's two. */
export const ENV_FILE_SETTINGS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "AUTH_SECRET",
  "AUTH_URL",
  "TEST_DATABASE_URL",
  "TEST_DIRECT_URL",
  "PIN_PEPPER",
  "SETUP_CODE",
] as const;

export type EnvFileSetting = (typeof ENV_FILE_SETTINGS)[number];

/** The connection strings whose host is judged: pooled, unpooled, and the test database's. */
const HOST_CHECKED = ["DATABASE_URL", "DIRECT_URL", "TEST_DIRECT_URL"] as const;

type HostChecked = (typeof HOST_CHECKED)[number];

// Neon's pooled host carries this in its first label; the unpooled host is the same without it.
const POOLER = "-pooler";

export const ENV_FILE_LABELS = {
  missing: (name: EnvFileSetting): string => `${name} is missing or empty`,
  noHost: (name: HostChecked): string => `${name} is not a connection string with a host`,
  databaseUrlUnpooled: `DATABASE_URL's host does not contain ${POOLER}, so it is not the pooled connection`,
  directUrlPooled: `DIRECT_URL's host contains ${POOLER}, so it is not the unpooled connection`,
  testDirectUrlPooled: `TEST_DIRECT_URL's host contains ${POOLER}, so it is not the unpooled connection`,
  testDirectUrlOnDirectUrlHost: "TEST_DIRECT_URL is on the same host as DIRECT_URL",
  codeTooShort: `SETUP_CODE has fewer than ${SETUP_CODE_MIN_LENGTH} characters`,
  pepperUnusable: "PIN_PEPPER is not base64 of at least 32 bytes, so password.ts refuses it",
  newPinPresent: "NEW_PIN appears in .env",
} as const;

const { missing, noHost, ...FIXED_LABELS } = ENV_FILE_LABELS;

/** Every sentence `envFileProblems` can return. */
export const ALL_ENV_FILE_LABELS: ReadonlySet<string> = new Set<string>([
  ...ENV_FILE_SETTINGS.map(missing),
  ...HOST_CHECKED.map(noHost),
  ...Object.values(FIXED_LABELS),
]);

// dotenv 16's line rule and value clean-up (`dotenv/lib/main.js`, `LINE` and `parse`), so the
// file is read the way Prisma's client and Next.js read it. Node's own `util.parseEnv` is not
// used: given a value of only spaces, it takes the NEXT line as that value, so a `NEW_PIN`
// line after a blank one would vanish from its result while Prisma still loads it.
const DOTENV_LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

/** Each assignment in `text`, by name, as dotenv reads it; the last one of a name wins. */
function parseDotenv(text: string): Map<string, string> {
  const settings = new Map<string, string>();
  for (const match of text.replace(/\r\n?/g, "\n").matchAll(DOTENV_LINE)) {
    const raw = (match[2] ?? "").trim();
    let value = raw.replace(/^(['"`])([\s\S]*)\1$/gm, "$2");
    if (raw.startsWith('"')) value = value.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    settings.set(match[1] ?? "", value);
  }
  return settings;
}

/** The host of a connection string, lower case, or `null` when none can be read. */
function hostOf(connectionString: string): string | null {
  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    return host === "" ? null : host;
  } catch {
    return null;
  }
}

/**
 * What is wrong with a `.env` whose text is `text`, as labels; `[]` when nothing is.
 *
 * The text is read by dotenv's rule (`parseDotenv` above). A setting that is missing or
 * blank gets that one label and no other, so each broken fact answers with exactly one label.
 */
export function envFileProblems(text: string): string[] {
  const settings = parseDotenv(text);
  const valueOf = (name: string): string => (settings.get(name) ?? "").trim();
  const problems: string[] = [];

  for (const name of ENV_FILE_SETTINGS) {
    if (valueOf(name) === "") problems.push(ENV_FILE_LABELS.missing(name));
  }

  const hosts = new Map<HostChecked, string>();
  for (const name of HOST_CHECKED) {
    if (valueOf(name) === "") continue;
    const host = hostOf(valueOf(name));
    if (host === null) problems.push(ENV_FILE_LABELS.noHost(name));
    else hosts.set(name, host);
  }

  const pooled = hosts.get("DATABASE_URL");
  const direct = hosts.get("DIRECT_URL");
  const testDirect = hosts.get("TEST_DIRECT_URL");
  if (pooled !== undefined && !pooled.includes(POOLER)) {
    problems.push(ENV_FILE_LABELS.databaseUrlUnpooled);
  }
  if (direct?.includes(POOLER)) problems.push(ENV_FILE_LABELS.directUrlPooled);
  if (testDirect?.includes(POOLER)) problems.push(ENV_FILE_LABELS.testDirectUrlPooled);
  if (direct !== undefined && direct === testDirect) {
    problems.push(ENV_FILE_LABELS.testDirectUrlOnDirectUrlHost);
  }

  // Counted as `password.ts` counts it: trimmed, in characters rather than UTF-16 units.
  const code = valueOf("SETUP_CODE");
  if (code !== "" && Array.from(code).length < SETUP_CODE_MIN_LENGTH) {
    problems.push(ENV_FILE_LABELS.codeTooShort);
  }

  const pepper = valueOf("PIN_PEPPER");
  if (pepper !== "" && !isUsablePinPepper(pepper)) problems.push(ENV_FILE_LABELS.pepperUnusable);

  // By name alone (021 AC-8): any assignment, even an empty one, is a problem, and the value
  // is never looked at. Prisma's client fills a missing variable from `.env`, so a value here
  // would act as a default PIN for the reset script (G2).
  if (settings.has("NEW_PIN")) problems.push(ENV_FILE_LABELS.newPinPresent);

  return problems;
}

/**
 * The lines from the first heading `isStart` accepts down to the next heading `isEnd`
 * accepts. A `#` line inside a fenced block is not a heading.
 */
function sectionOf(
  lines: string[],
  isStart: (line: string) => boolean,
  isEnd: (line: string) => boolean,
): string {
  const taken: string[] = [];
  let inFence = false;
  for (const line of lines) {
    const heading = !inFence && /^#+ /.test(line);
    if (line.startsWith("```")) inFence = !inFence;
    if (taken.length === 0) {
      if (heading && isStart(line)) taken.push(line);
      continue;
    }
    if (heading && isEnd(line)) break;
    taken.push(line);
  }
  return taken.join("\n");
}

/** `docs/operations.md` → *Environment*: from its heading to the next `## ` heading. */
export function operationsEnvironment(): string {
  return sectionOf(
    readFileSync("docs/operations.md", "utf8").split(/\r?\n/),
    (line) => /^## Environment\s*$/.test(line),
    (line) => /^#{1,2} /.test(line),
  );
}

/** The `### ` subsection of `section` whose heading names `` `name` ``, down to the next heading. */
export function entryFor(section: string, name: string): string {
  return sectionOf(
    section.split("\n"),
    (line) => line.startsWith("### ") && line.includes(`\`${name}\``),
    (line) => /^#{1,3} /.test(line),
  );
}
