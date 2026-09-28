import type { Browser, BrowserContext, Page, Response } from "@playwright/test";

import { scanForMoney } from "@/lib/deploy/money-scan";

import { isLocalHost, PREFIX, printResult, runCheck } from "./common";
import type { CheckResult, Print } from "./common";

/**
 * The signed-in pass of `npm run verify:deploy -- --signed-in` (spec 016 AC-15, D14).
 *
 * A PERSON TYPES, THE SCRIPT CHECKS. Both cookies exist only after a successful sign-in,
 * and every staff page redirects without one, so the pass opens a browser window at the
 * sign-in page and waits for someone to sign in there as a `YARD_STAFF` profile. It never
 * types into a field, never reads one and never records one: the PIN goes only into the
 * page. What it reads afterwards is the session's role, the two cookies' names and flags,
 * and the bodies the origin sends, each through the money scanner and then dropped.
 */

export const SIGN_IN_PROMPT = "Sign in as a YARD_STAFF profile in the window that opened";

const DEVICE_COOKIE = "macroads-device";
const SESSION_COOKIE = "__Secure-authjs.session-token";

/** AC-15: up to five minutes for a person to sign in. */
const SIGN_IN_WAIT_MS = 5 * 60 * 1000;
const POLL_INTERVAL_MS = 1_000;
const PAGE_SETTLE_MS = 15_000;

const START_PAGES = ["/stock-entry", "/stock-takes"];
const LINKED_PAGE_LIMIT = 50;
const OTHER_PAGES = ["/analysis", "/item-master", "/profiles", "/api/users"];
const COUNT_PAGE = /^\/(?:stock-entry|stock-takes)\/counts\/[^/]+/;

/** A page of one count, where a price would leak first (AC-25): a count id under either path. */
export function isCountPage(pathname: string): boolean {
  return COUNT_PAGE.test(pathname);
}
const SCANNED_TYPE = /text\/html|text\/x-component|application\/(?:[\w.-]+\+)?json/i;
const STATIC_FILES = "/_next/static/";

export type SignedInOptions = {
  origin: URL;
  /** The command line launches a visible Chromium; a test passes its own. */
  browser: Browser;
  print: Print;
  /**
   * FOR TESTS ONLY: stands in for the person, in the page the pass opened. Refused for
   * every origin but `localhost` and `127.0.0.1`, and the command line has no way to set it.
   */
  supplySession?: (page: Page) => Promise<void>;
  /** Defaults to AC-15's five minutes. */
  signInWaitMs?: number;
};

export class SessionSupplierRefused extends Error {
  constructor() {
    super("a session may be supplied without a person only on localhost or 127.0.0.1");
    this.name = "SessionSupplierRefused";
  }
}

/** Throws unless a session may be supplied without a person at `origin`. */
export function assertSessionSupplierAllowed(origin: URL): void {
  if (!isLocalHost(origin.hostname)) throw new SessionSupplierRefused();
}

async function sessionStatus(context: BrowserContext, origin: URL): Promise<number> {
  const response = await context.request.get(new URL("/api/session", origin).href, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  const status = response.status();
  await response.dispose();
  return status;
}

async function waitForSession(context: BrowserContext, origin: URL, waitMs: number): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    try {
      if ((await sessionStatus(context, origin)) === 200) return true;
    } catch {
      // The window may be mid-navigation; the next poll asks again.
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

async function sessionRole(context: BrowserContext, origin: URL): Promise<unknown> {
  const response = await context.request.get(new URL("/api/session", origin).href, {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  try {
    if (response.status() !== 200) return undefined;
    return ((await response.json()) as { role?: unknown }).role;
  } catch {
    return undefined;
  } finally {
    await response.dispose();
  }
}

/** The named cookie the browser holds for the origin's host, by its flags only. */
async function cookieOnHost(
  context: BrowserContext,
  origin: URL,
  name: string,
): Promise<{ secure: boolean; httpOnly: boolean } | undefined> {
  const cookies = await context.cookies();
  const found = cookies.find(
    (cookie) =>
      cookie.name === name && cookie.domain.replace(/^\./, "") === origin.hostname,
  );
  return found === undefined ? undefined : { secure: found.secure, httpOnly: found.httpOnly };
}

async function cookieCheck(context: BrowserContext, origin: URL, name: string): Promise<string | null> {
  const flags = await cookieOnHost(context, origin, name);
  if (flags === undefined) return `${name}: the browser holds no such cookie`;
  const missing = [flags.secure ? null : "Secure", flags.httpOnly ? null : "HttpOnly"].filter(
    (flag) => flag !== null,
  );
  return missing.length === 0 ? null : `${name}: lacks ${missing.join(", ")}`;
}

/** `moneyIn`: each path money was found in, with the kinds of rule that found it. */
type Scan = {
  responses: number;
  readAgain: number;
  linkedPages: number;
  countPages: number;
  moneyIn: Map<string, Set<string>>;
};

/** Records the path and the kind of rule, and nothing of the body. */
function found(scan: Scan, path: string, rule: string): void {
  const rules = scan.moneyIn.get(path) ?? new Set<string>();
  rules.add(rule);
  scan.moneyIn.set(path, rules);
}

/** Headers the browser sets for itself, which a repeated request must not copy. */
const OWN_HEADERS = /^(?::|cookie$|host$|content-length$|connection$|accept-encoding$)/i;

/** The same GET again, in the same session, or undefined when that fails too. */
async function readAgain(page: Page, response: Response): Promise<string | undefined> {
  const request = response.request();
  if (request.method() !== "GET") return undefined;
  try {
    const headers = Object.fromEntries(
      Object.entries(await request.allHeaders()).filter(([name]) => !OWN_HEADERS.test(name)),
    );
    const again = await page.context().request.get(request.url(), {
      headers,
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    try {
      return await again.text();
    } finally {
      await again.dispose();
    }
  } catch {
    return undefined;
  }
}

/**
 * Every response from the origin, bar static files, that is a page, a component payload or
 * JSON, goes through the scanner. Its body is read, scanned and dropped here; only the
 * path is kept, and only when money was found.
 *
 * A body the browser no longer holds, typically a prefetch the next navigation cancelled, is
 * asked for again: the same GET, with the headers the browser sent, in the same session. A
 * body that still cannot be read counts as money found, because it cannot be shown to be
 * free of it.
 */
function watchResponses(
  page: Page,
  origin: URL,
  scan: Scan,
): { settled: () => Promise<void>; stop: () => void } {
  const pending: Promise<void>[] = [];

  const inspect = async (response: Response): Promise<void> => {
    const url = new URL(response.url());
    if (url.origin !== origin.origin || url.pathname.startsWith(STATIC_FILES)) return;
    const status = response.status();
    if ((status >= 300 && status < 400) || status === 204) return;
    const contentType = response.headers()["content-type"] ?? "";
    if (!SCANNED_TYPE.test(contentType)) return;

    let body: string | undefined;
    try {
      body = await response.text();
    } catch {
      body = await readAgain(page, response);
      if (body !== undefined) scan.readAgain += 1;
    }
    if (body === undefined) {
      found(scan, url.pathname, "body unreadable");
      return;
    }
    scan.responses += 1;
    for (const finding of scanForMoney(body, contentType)) found(scan, url.pathname, finding.rule);
  };

  const listener = (response: Response): void => {
    pending.push(inspect(response));
  };
  page.on("response", listener);

  return {
    settled: async () => {
      await Promise.all(pending.splice(0));
    },
    stop: () => {
      page.off("response", listener);
    },
  };
}

async function open(page: Page, origin: URL, path: string, settled: () => Promise<void>): Promise<URL> {
  await page.goto(new URL(path, origin).href, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: PAGE_SETTLE_MS }).catch(() => undefined);
  await settled();
  return new URL(page.url());
}

/** The same-origin links on the page under the two count paths: `href`s of anchors only. */
async function linksUnderCountPaths(page: Page, origin: URL): Promise<string[]> {
  const hrefs = await page.$$eval("a[href]", (anchors) =>
    anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
  );
  return hrefs.filter((href) => {
    const url = new URL(href);
    return (
      url.origin === origin.origin &&
      START_PAGES.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))
    );
  });
}

async function staffNoMoney(page: Page, origin: URL, print: Print): Promise<string | null> {
  const scan: Scan = { responses: 0, readAgain: 0, linkedPages: 0, countPages: 0, moneyIn: new Map() };
  const { settled, stop } = watchResponses(page, origin, scan);
  try {
    return await visitStaffPages(page, origin, print, scan, settled);
  } finally {
    stop();
  }
}

async function visitStaffPages(
  page: Page,
  origin: URL,
  print: Print,
  scan: Scan,
  settled: () => Promise<void>,
): Promise<string | null> {
  const signedOutOn: string[] = [];

  const links: string[] = [];
  for (const path of START_PAGES) {
    const landed = await open(page, origin, path, settled);
    if (landed.pathname.startsWith("/sign-in")) signedOutOn.push(path);
    for (const href of await linksUnderCountPaths(page, origin)) {
      const url = new URL(href);
      const relative = `${url.pathname}${url.search}`;
      if (!START_PAGES.includes(relative) && !links.includes(relative)) links.push(relative);
    }
  }

  for (const link of links.slice(0, LINKED_PAGE_LIMIT)) {
    await open(page, origin, link, settled);
    scan.linkedPages += 1;
    if (isCountPage(new URL(link, origin).pathname)) scan.countPages += 1;
  }

  for (const path of OTHER_PAGES) {
    await open(page, origin, path, settled);
  }

  print(
    `${PREFIX} staff-no-money: scanned ${scan.responses} responses (${scan.readAgain} asked for again); ` +
      `opened ${scan.linkedPages} linked pages, ${scan.countPages} of them count pages`,
  );

  if (signedOutOn.length > 0) return `${signedOutOn.join(", ")}: answered with the sign-in page`;
  if (scan.responses === 0) return "no response was scanned";
  if (scan.moneyIn.size === 0) return null;
  const where = [...scan.moneyIn].map(([path, rules]) => `${path} (${[...rules].join(", ")})`);
  return `money found in ${where.join(", ")}`;
}

/** Signs out through the page's own control, then asks who is signed in. */
async function signOut(page: Page, context: BrowserContext, origin: URL): Promise<string | null> {
  await page.goto(new URL("/stock-entry", origin).href, { waitUntil: "load" });
  await page.getByTestId("sign-out").click();
  await page.waitForURL((url) => url.pathname === "/sign-in", { timeout: PAGE_SETTLE_MS });
  return (await sessionStatus(context, origin)) === 401
    ? null
    : "/api/session: does not answer 401 after signing out";
}

export async function signedInPass(options: SignedInOptions): Promise<CheckResult[]> {
  const { origin, browser, print } = options;
  if (options.supplySession !== undefined) assertSessionSupplierAllowed(origin);

  const results: CheckResult[] = [];
  const record = (result: CheckResult): void => {
    printResult(print, result);
    results.push(result);
  };

  // Fresh and not persistent: nothing from an earlier run, and nothing kept after this one.
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(new URL("/sign-in", origin).href);
    print(`${PREFIX} ${SIGN_IN_PROMPT}`);

    if (options.supplySession !== undefined) await options.supplySession(page);

    if (!(await waitForSession(context, origin, options.signInWaitMs ?? SIGN_IN_WAIT_MS))) {
      record({
        name: "staff-role",
        passed: false,
        reason: "/api/session: nobody signed in within the time allowed",
      });
      return results;
    }

    const role = await runCheck("staff-role", async () =>
      (await sessionRole(context, origin)) === "YARD_STAFF"
        ? null
        : "/api/session: the session's role is not YARD_STAFF",
    );
    record(role);
    if (!role.passed) {
      await signOut(page, context, origin).catch(() => undefined);
      return results;
    }

    record(await runCheck("device-cookie-secure", () => cookieCheck(context, origin, DEVICE_COOKIE)));
    record(await runCheck("session-cookie-secure", () => cookieCheck(context, origin, SESSION_COOKIE)));
    record(await runCheck("staff-no-money", () => staffNoMoney(page, origin, print)));
    record(await runCheck("signed-out", () => signOut(page, context, origin)));
    return results;
  } finally {
    await context.close();
  }
}
