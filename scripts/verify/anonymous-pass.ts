import { PROTECTED_PATHS, SIGN_IN_PATH } from "@/lib/auth-config";
import { scanForMoney } from "@/lib/deploy/money-scan";
import { deepKeys } from "@/lib/money-boundary";

import { cookieFlags, printResult, request, runCheck } from "./common";
import type { CheckResult, Print } from "./common";

/**
 * The anonymous pass of `npm run verify:deploy` (spec 016 AC-13). It needs nobody and
 * holds nothing: every request goes out with no cookie, and every check is judged on the
 * status, the headers, or a scan of the body that reports a rule and never an excerpt.
 */

export type AnonymousTarget = {
  /** The origin given with `--url`. */
  origin: URL;
  /**
   * Where `https-only` sends its plain-`http:` request. The command line always derives
   * it from `origin` (`http://<host>/`); a test gives it a second stub server, because one
   * stub cannot answer the same address both as a redirect and as a page.
   */
  httpOrigin: URL;
  /** `--expect-commit`: when given, `commit` runs last. */
  expectCommit?: string;
};

/** The values AC-11 sets, written out here rather than imported, so a change to the
 * configuration cannot silently change what the check accepts. */
const HSTS_MINIMUM_MAX_AGE = 31_536_000;
const OTHER_HEADERS: readonly [string, string][] = [
  ["X-Content-Type-Options", "nosniff"],
  ["Referrer-Policy", "same-origin"],
  ["X-Frame-Options", "DENY"],
  ["Content-Security-Policy", "frame-ancestors 'none'"],
  ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
];

/** The cookie Auth.js names `__Host-` only when the URL it derives is `https:`. */
const CSRF_COOKIE = "__Host-authjs.csrf-token";

const PUBLIC_PAGES = ["/", SIGN_IN_PATH, `${SIGN_IN_PATH}/create`];

/** Files that must never be served. The first is a URL path asked of the server. */
const LEFTOVERS = [
  "/.env",
  "/.git/config",
  "/package.json",
  "/prisma/schema.prisma",
  "/Samples/Stock%20@%2001-Sep-2026.xlsx",
];

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const SESSION_KEYS = new Set(["id", "username", "role"]);
const REGION_CODE = /^[a-z]{3}\d+$/;
const EXPECTED_REGION = "lhr1";

type Check = { name: string; run: (target: AnonymousTarget) => Promise<string | null> };

async function httpsOnly(target: AnonymousTarget): Promise<string | null> {
  const response = await request(target.httpOrigin, "/");
  if (response.status !== 301 && response.status !== 308) {
    return "http://<host>/ does not answer 301 or 308";
  }
  if (response.headers.get("location") !== `https://${target.origin.host}/`) {
    return "http://<host>/ does not redirect to https://<host>/";
  }
  return null;
}

async function hsts(target: AnonymousTarget): Promise<string | null> {
  const response = await request(target.origin, SIGN_IN_PATH);
  const header = response.headers.get("strict-transport-security");
  if (header === null) return `${SIGN_IN_PATH}: no Strict-Transport-Security`;
  const maxAge = /(?:^|;)\s*max-age\s*=\s*"?(\d+)"?\s*(?:;|$)/i.exec(header)?.[1];
  if (maxAge === undefined || Number(maxAge) < HSTS_MINIMUM_MAX_AGE) {
    return `${SIGN_IN_PATH}: Strict-Transport-Security max-age is below ${HSTS_MINIMUM_MAX_AGE}`;
  }
  return null;
}

async function securityHeaders(target: AnonymousTarget): Promise<string | null> {
  const response = await request(target.origin, SIGN_IN_PATH);
  const problems: string[] = [];
  for (const [name, expected] of OTHER_HEADERS) {
    if (response.headers.get(name)?.trim() !== expected) problems.push(`${name} is not ${expected}`);
  }
  if (response.headers.has("x-powered-by")) problems.push("X-Powered-By is present");
  return problems.length === 0 ? null : `${SIGN_IN_PATH}: ${problems.join("; ")}`;
}

async function csrfCookieSecure(target: AnonymousTarget): Promise<string | null> {
  const path = "/api/auth/csrf";
  const response = await request(target.origin, path);
  const cookie = response.headers
    .getSetCookie()
    .map(cookieFlags)
    .find((flags) => flags.name === CSRF_COOKIE);
  if (cookie === undefined) return `${path}: sets no cookie named ${CSRF_COOKIE}`;

  const missing = [
    cookie.secure ? null : "Secure",
    cookie.httpOnly ? null : "HttpOnly",
    cookie.path === "/" ? null : "Path=/",
  ].filter((flag) => flag !== null);
  return missing.length === 0 ? null : `${path}: ${CSRF_COOKIE} lacks ${missing.join(", ")}`;
}

async function session401(target: AnonymousTarget): Promise<string | null> {
  const path = "/api/session";
  const response = await request(target.origin, path);
  if (response.status !== 401) return `${path}: does not answer 401`;

  const body = response.body;
  let named: boolean;
  try {
    named = deepKeys(JSON.parse(body) as unknown).some((key) => SESSION_KEYS.has(key));
  } catch {
    named = /"(?:id|username|role)"\s*:/.test(body);
  }
  return named ? `${path}: the body names id, username or role` : null;
}

async function api401(target: AnonymousTarget): Promise<string | null> {
  const path = "/api/users";
  const response = await request(target.origin, path);
  return response.status === 401 ? null : `${path}: does not answer 401`;
}

async function protectedRedirects(target: AnonymousTarget): Promise<string | null> {
  const wrong: string[] = [];
  for (const path of PROTECTED_PATHS) {
    const response = await request(target.origin, path);
    const expected = `https://${target.origin.host}${SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(path)}`;
    if (!REDIRECT_STATUSES.has(response.status) || response.headers.get("location") !== expected) {
      wrong.push(path);
    }
  }
  return wrong.length === 0
    ? null
    : `${wrong.join(", ")}: does not redirect to https://<host>${SIGN_IN_PATH}?callbackUrl=<the path, encoded>`;
}

async function setup404(target: AnonymousTarget): Promise<string | null> {
  const response = await request(target.origin, "/setup");
  return response.status === 404 ? null : "/setup: does not answer 404";
}

async function publicNoMoney(target: AnonymousTarget): Promise<string | null> {
  const problems: string[] = [];
  for (const path of PUBLIC_PAGES) {
    const response = await request(target.origin, path);
    if (response.status !== 200) {
      problems.push(`${path}: does not answer 200`);
      continue;
    }
    const findings = scanForMoney(response.body, response.headers.get("content-type") ?? "");
    if (findings.length > 0) {
      problems.push(`${path}: money found (${[...new Set(findings.map((f) => f.rule))].join(", ")})`);
    }
  }
  return problems.length === 0 ? null : problems.join("; ");
}

async function noLeftovers(target: AnonymousTarget): Promise<string | null> {
  const served: string[] = [];
  for (const path of LEFTOVERS) {
    const response = await request(target.origin, path);
    if (response.status !== 404) served.push(path);
  }
  return served.length === 0 ? null : `${served.join(", ")}: does not answer 404`;
}

/**
 * The function region from Vercel's `x-vercel-id`: the region codes in it, in order, are
 * the ones the request passed through, and the last is the one that ran the function. A
 * header with only one region came from the edge alone, so no function region is named.
 */
export function functionRegion(header: string | null): string | null {
  if (header === null) return null;
  const regions = header.split("::").filter((part) => REGION_CODE.test(part));
  return regions.length >= 2 ? (regions[regions.length - 1] ?? null) : null;
}

async function region(target: AnonymousTarget): Promise<string | null> {
  const path = "/api/session";
  const response = await request(target.origin, path);
  return functionRegion(response.headers.get("x-vercel-id")) === EXPECTED_REGION
    ? null
    : `${path}: x-vercel-id does not name ${EXPECTED_REGION} as the region that ran the function`;
}

async function commit(target: AnonymousTarget): Promise<string | null> {
  const path = "/api/version";
  const response = await request(target.origin, path);
  if (response.status !== 200) return `${path}: does not answer 200`;
  let reported: unknown;
  try {
    reported = (JSON.parse(response.body) as { commit?: unknown }).commit;
  } catch {
    return `${path}: the body is not JSON`;
  }
  return reported === target.expectCommit ? null : `${path}: does not report the expected commit`;
}

const CHECKS: readonly Check[] = [
  { name: "https-only", run: httpsOnly },
  { name: "hsts", run: hsts },
  { name: "security-headers", run: securityHeaders },
  { name: "csrf-cookie-secure", run: csrfCookieSecure },
  { name: "session-401", run: session401 },
  { name: "api-401", run: api401 },
  { name: "protected-redirects", run: protectedRedirects },
  { name: "setup-404", run: setup404 },
  { name: "public-no-money", run: publicNoMoney },
  { name: "no-leftovers", run: noLeftovers },
  { name: "region", run: region },
];

/** The names, in the order they run: `commit` only with `--expect-commit`. */
export function anonymousCheckNames(withCommit: boolean): string[] {
  return [...CHECKS.map((check) => check.name), ...(withCommit ? ["commit"] : [])];
}

export async function anonymousPass(target: AnonymousTarget, print: Print): Promise<CheckResult[]> {
  const checks =
    target.expectCommit === undefined ? CHECKS : [...CHECKS, { name: "commit", run: commit }];

  const results: CheckResult[] = [];
  for (const check of checks) {
    const result = await runCheck(check.name, () => check.run(target));
    printResult(print, result);
    results.push(result);
  }
  return results;
}
