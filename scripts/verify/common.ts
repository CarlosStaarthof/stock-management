/**
 * What both passes of `npm run verify:deploy` share (spec 016 AC-13 to AC-15).
 *
 * THE LIVE CHECK HOLDS NO SECRET (AC-14). Every module of it keeps these rules, and
 * `tests/unit/verify-deployment.test.ts` reads each one to prove it:
 *   - it reads no settings file and no environment variable, and imports no file-system,
 *     process or module-loading API, so it has no way to open one;
 *   - it imports nothing from the server layer or the database client;
 *   - it takes no credential, from an argument, a setting or a file;
 *   - it prints no cookie value, no cookie header and no part of a response body. A
 *     failing check names the path and the rule, and nothing else;
 *   - it sends GET and HEAD only, with no request body. The one exception is the signed-in
 *     pass's sign-out, which is the page's own control, clicked.
 */

export const PREFIX = "[verify]";

export type CheckResult = { name: string; passed: boolean; reason?: string };

export type Print = (line: string) => void;

/** A request that could not be made. It carries the path, so the failure can name it. */
export class RequestFailed extends Error {
  constructor(readonly path: string) {
    super(`${path}: request failed`);
    this.name = "RequestFailed";
  }
}

/** 20 s: longer than a Neon compute takes to wake (spec 016 D18). */
const REQUEST_TIMEOUT_MS = 20_000;

/** What a check sees of a response. The body is read in full and never printed. */
export type Fetched = { status: number; headers: Headers; body: string };

/**
 * One GET or HEAD, with redirects NOT followed: a check judges the response the server
 * gave, not where it leads. No body is sent, and no cookie: each request stands alone.
 * Every body is read to its end here, so no response is left open when the command exits.
 */
export async function request(
  base: URL,
  path: string,
  method: "GET" | "HEAD" = "GET",
): Promise<Fetched> {
  try {
    const response = await fetch(new URL(path, base), {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return { status: response.status, headers: response.headers, body: await response.text() };
  } catch {
    throw new RequestFailed(path);
  }
}

/**
 * A cookie as the checks see it: its name and its flags. The value is dropped the moment
 * the header is split, so no later line of code can print it.
 */
export type CookieFlags = { name: string; secure: boolean; httpOnly: boolean; path: string | null };

export function cookieFlags(setCookie: string): CookieFlags {
  const [pair = "", ...attributes] = setCookie.split(";");
  const equals = pair.indexOf("=");
  const name = (equals === -1 ? pair : pair.slice(0, equals)).trim();

  let secure = false;
  let httpOnly = false;
  let path: string | null = null;
  for (const attribute of attributes) {
    const [key = "", ...rest] = attribute.split("=");
    const lowered = key.trim().toLowerCase();
    if (lowered === "secure") secure = true;
    if (lowered === "httponly") httpOnly = true;
    if (lowered === "path") path = rest.join("=").trim();
  }
  return { name, secure, httpOnly, path };
}

/** The only hosts a check may be pointed at over plain `http:`, and a session supplied. */
export function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function printResult(print: Print, result: CheckResult): void {
  print(
    result.passed
      ? `${PREFIX} PASS ${result.name}`
      : `${PREFIX} FAIL ${result.name}: ${result.reason ?? "failed"}`,
  );
}

/**
 * Runs one check and turns what it returns into a result: `null` is a pass, a string is the
 * failure's reason. A request that failed names its path; anything else names only the
 * kind of error, because an error's message could quote what it was given.
 */
export async function runCheck(
  name: string,
  check: () => Promise<string | null>,
): Promise<CheckResult> {
  try {
    const reason = await check();
    return reason === null ? { name, passed: true } : { name, passed: false, reason };
  } catch (error) {
    if (error instanceof RequestFailed) return { name, passed: false, reason: error.message };
    const kind = error instanceof Error ? error.name : "unknown error";
    return { name, passed: false, reason: `the check stopped on an unexpected ${kind}` };
  }
}
