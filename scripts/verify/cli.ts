import type { Browser } from "@playwright/test";

import { anonymousPass } from "./anonymous-pass";
import { isLocalHost, PREFIX } from "./common";
import type { CheckResult, Print } from "./common";
import { signedInPass } from "./signed-in-pass";

/**
 * `npm run verify:deploy -- --url <origin> [--expect-commit <sha>] [--signed-in]`
 * (spec 016 AC-13 to AC-15).
 *
 * Three arguments and nothing else. None of them can carry a credential: `--url` is refused
 * when it holds a user name or a password, and every other argument is refused outright.
 */

export const USAGE = [
  "npm run verify:deploy -- --url <origin> [--expect-commit <sha>]",
  "npm run verify:deploy -- --url <origin> --signed-in",
];

export type Arguments = { origin: URL; expectCommit?: string; signedIn: boolean };

const FULL_COMMIT = /^[0-9a-f]{40}$/;

/** The arguments, or the one problem that refuses them. No problem quotes a value. */
export function parseArguments(argv: readonly string[]): Arguments | { problem: string } {
  let url: string | undefined;
  let expectCommit: string | undefined;
  let signedIn = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--signed-in" && !signedIn) {
      signedIn = true;
    } else if (argument === "--url" && url === undefined) {
      url = argv[index + 1];
      index += 1;
      if (url === undefined || url.startsWith("--")) return { problem: "--url needs an origin" };
    } else if (argument === "--expect-commit" && expectCommit === undefined) {
      expectCommit = argv[index + 1];
      index += 1;
      if (expectCommit === undefined || !FULL_COMMIT.test(expectCommit)) {
        return { problem: "--expect-commit needs a full 40-character lower-case commit hash" };
      }
    } else {
      return { problem: `an argument this command does not accept, at position ${index + 1}` };
    }
  }

  if (url === undefined) return { problem: "--url is required" };

  let origin: URL;
  try {
    origin = new URL(url);
  } catch {
    return { problem: "--url is not a URL" };
  }
  if (origin.username !== "" || origin.password !== "") {
    return { problem: "--url may not carry a user name or a password" };
  }
  if (origin.pathname !== "/" || origin.search !== "" || origin.hash !== "") {
    return { problem: "--url must be an origin, with no path, query or fragment" };
  }
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && isLocalHost(origin.hostname))) {
    return { problem: "--url must be https:, unless its host is localhost or 127.0.0.1" };
  }
  if (signedIn && expectCommit !== undefined) {
    return { problem: "--expect-commit belongs to the anonymous pass; run it without --signed-in" };
  }

  return { origin: new URL(origin.origin), expectCommit, signedIn };
}

export type Dependencies = {
  print: Print;
  /** The command line launches a visible Chromium. */
  launchBrowser: () => Promise<Browser>;
  /** Tests only: see `AnonymousTarget.httpOrigin`. The command line derives it. */
  httpOriginFor?: (origin: URL) => URL;
};

function summary(print: Print, results: readonly CheckResult[]): number {
  const passed = results.filter((result) => result.passed).length;
  print(`${PREFIX} ${passed} of ${results.length} checks passed`);
  return results.length > 0 && passed === results.length ? 0 : 1;
}

/** The exit code: 0 only when every check that ran passed, 2 for refused arguments. */
export async function main(argv: readonly string[], dependencies: Dependencies): Promise<number> {
  const { print } = dependencies;
  const parsed = parseArguments(argv);
  if ("problem" in parsed) {
    print(`${PREFIX} refused: ${parsed.problem}`);
    for (const form of USAGE) print(`${PREFIX} usage: ${form}`);
    return 2;
  }

  if (!parsed.signedIn) {
    const httpOrigin = dependencies.httpOriginFor?.(parsed.origin) ?? new URL(`http://${parsed.origin.host}`);
    return summary(
      print,
      await anonymousPass({ origin: parsed.origin, httpOrigin, expectCommit: parsed.expectCommit }, print),
    );
  }

  const browser = await dependencies.launchBrowser();
  try {
    return summary(print, await signedInPass({ origin: parsed.origin, browser, print }));
  } finally {
    await browser.close();
  }
}
