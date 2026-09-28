import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { createRequire } from "node:module";
import { dirname, join, posix } from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PROTECTED_PATHS } from "@/lib/auth-config";

import { anonymousCheckNames, functionRegion } from "../../scripts/verify/anonymous-pass";
import { main, parseArguments } from "../../scripts/verify/cli";
import { cookieFlags } from "../../scripts/verify/common";
import {
  assertSessionSupplierAllowed,
  isCountPage,
  SessionSupplierRefused,
  SIGN_IN_PROMPT,
  signedInPass,
} from "../../scripts/verify/signed-in-pass";

/**
 * Spec 016 AC-13 and AC-14, and the parts of AC-15 that need no browser.
 *
 * Every check of the anonymous pass runs against a local stub HTTP server, once made to pass
 * it and once made to fail it. A second stub stands in for the plain-`http:` address, since
 * one server cannot answer `/` both as a redirect and as a page.
 *
 * Every response the stubs send carries a cookie value and a body text made for this run.
 * Neither may appear in anything the check prints, whether it passes or fails (AC-14).
 */

/** `bare`: the reply carries its own headers only, none of the stub's common ones. */
type Reply = { status: number; headers?: Record<string, string | string[]>; body?: string; bare?: boolean };

type Received = { method: string; path: string; hadBody: boolean };

type Stub = {
  server: Server;
  origin: URL;
  routes: Map<string, Reply>;
  received: Received[];
  /** Headers every reply carries unless the reply sets the same name. */
  common: Record<string, string | string[]>;
};

const COOKIE_VALUE = `cv${randomBytes(16).toString("hex")}`;
const BODY_TEXT = `bt${randomBytes(16).toString("hex")}`;
const COMMIT = randomBytes(20).toString("hex");

const SECURITY = {
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "frame-ancestors 'none'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

const HTML = { "Content-Type": "text/html; charset=utf-8" };
const JSON_TYPE = { "Content-Type": "application/json" };
const TRACKER = `tracker=${COOKIE_VALUE}; Path=/; HttpOnly; Secure`;

const LEFTOVERS = [
  "/.env",
  "/.git/config",
  "/package.json",
  "/prisma/schema.prisma",
  "/Samples/Stock%20@%2001-Sep-2026.xlsx",
];

async function startStub(): Promise<Stub> {
  const stub = {
    routes: new Map<string, Reply>(),
    received: [] as Received[],
    common: {} as Record<string, string | string[]>,
  } as Stub;

  stub.server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const hadBody =
      request.headers["transfer-encoding"] !== undefined ||
      Number(request.headers["content-length"] ?? "0") > 0;
    stub.received.push({ method: request.method ?? "", path: request.url ?? "", hadBody });

    const reply: Reply = stub.routes.get(request.url ?? "") ?? {
      status: 404,
      headers: HTML,
      body: `<html>not found ${BODY_TEXT}</html>`,
    };
    const headers = reply.bare === true ? { ...reply.headers } : { ...stub.common, ...reply.headers };
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response.statusCode = reply.status;
    response.end(request.method === "HEAD" ? undefined : (reply.body ?? ""));
  });

  await new Promise<void>((resolve) => stub.server.listen(0, "127.0.0.1", resolve));
  const { port } = stub.server.address() as AddressInfo;
  stub.origin = new URL(`http://127.0.0.1:${port}`);
  return stub;
}

async function stopStub(stub: Stub): Promise<void> {
  stub.server.closeAllConnections();
  await new Promise<void>((resolve) => stub.server.close(() => resolve()));
}

let site: Stub;
let plainHttp: Stub;

/** Every route answering as the live site must: every check passes. */
function makePassing(): void {
  const host = site.origin.host;
  site.routes.clear();
  site.received.length = 0;
  plainHttp.routes.clear();
  plainHttp.received.length = 0;

  site.common = { ...SECURITY, "Set-Cookie": TRACKER };
  const page = (status = 200): Reply => ({
    status,
    headers: HTML,
    body: `<html><body><main>${BODY_TEXT}</main></body></html>`,
  });

  site.routes.set("/", page());
  site.routes.set("/sign-in", page());
  site.routes.set("/sign-in/create", page());
  site.routes.set("/setup", page(404));
  site.routes.set("/api/auth/csrf", {
    status: 200,
    headers: {
      ...JSON_TYPE,
      "Set-Cookie": [`__Host-authjs.csrf-token=${COOKIE_VALUE}; Path=/; HttpOnly; Secure; SameSite=Lax`, TRACKER],
    },
    body: JSON.stringify({ csrfToken: BODY_TEXT }),
  });
  site.routes.set("/api/session", {
    status: 401,
    headers: { ...JSON_TYPE, "x-vercel-id": "dub1::lhr1::abcde-1727000000000-0123456789ab" },
    body: JSON.stringify({ error: `Sign in first ${BODY_TEXT}` }),
  });
  site.routes.set("/api/users", {
    status: 401,
    headers: JSON_TYPE,
    body: JSON.stringify({ error: BODY_TEXT }),
  });
  for (const path of PROTECTED_PATHS) {
    site.routes.set(path, {
      status: 307,
      headers: { Location: `https://${host}/sign-in?callbackUrl=${encodeURIComponent(path)}` },
      body: BODY_TEXT,
    });
  }
  site.routes.set("/api/version", {
    status: 200,
    headers: { ...JSON_TYPE, "Cache-Control": "no-store" },
    body: JSON.stringify({ commit: COMMIT }),
  });

  plainHttp.common = { "Set-Cookie": TRACKER };
  plainHttp.routes.set("/", {
    status: 308,
    headers: { Location: `https://${host}/` },
    body: BODY_TEXT,
  });
}

function reply(path: string): Reply {
  const found = site.routes.get(path);
  if (found === undefined) throw new Error(`the stub has no route ${path}`);
  return found;
}

/** Changes the headers one route sends, the common ones included, and no other route's. */
function withHeaders(path: string, change: (headers: Record<string, string | string[]>) => void): void {
  const current = reply(path);
  const headers = { ...site.common, ...current.headers };
  change(headers);
  site.routes.set(path, { ...current, headers, bare: true });
}

type Run = { code: number; lines: string[]; printed: string };

async function run(argv: readonly string[]): Promise<Run> {
  const lines: string[] = [];
  const code = await main(argv, {
    print: (line) => {
      lines.push(line);
    },
    launchBrowser: () => Promise.reject(new Error("the anonymous pass opens no browser")),
    httpOriginFor: () => plainHttp.origin,
  });
  return { code, lines, printed: lines.join("\n") };
}

function anonymous(extra: readonly string[] = []): Promise<Run> {
  return run(["--url", site.origin.origin, ...extra]);
}

function outcomes(result: Run): Record<string, "PASS" | "FAIL"> {
  const found: Record<string, "PASS" | "FAIL"> = {};
  for (const line of result.lines) {
    const match = /^\[verify\] (PASS|FAIL) ([\w-]+)/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) found[match[2]] = match[1] as "PASS" | "FAIL";
  }
  return found;
}

/** Only `name` failed, every other check passed, and the run exited 1. */
function expectOnlyFailure(result: Run, name: string, withCommit = false): void {
  const expected = Object.fromEntries(
    anonymousCheckNames(withCommit).map((check) => [check, check === name ? "FAIL" : "PASS"]),
  );
  expect(outcomes(result)).toEqual(expected);
  expect(result.code).toBe(1);
  expect(result.lines.some((line) => line.startsWith(`[verify] FAIL ${name}: `))).toBe(true);
}

function expectNothingLeaked(printed: string): void {
  expect(printed.includes(COOKIE_VALUE), "a cookie value was printed").toBe(false);
  expect(printed.includes(BODY_TEXT), "body text was printed").toBe(false);
  expect(/set-cookie/i.test(printed), "a Set-Cookie header was printed").toBe(false);
  expect(printed.includes(COMMIT), "the served commit was printed").toBe(false);
}

beforeAll(async () => {
  site = await startStub();
  plainHttp = await startStub();
});

afterAll(async () => {
  await stopStub(site);
  await stopStub(plainHttp);
});

beforeEach(() => {
  makePassing();
});

/* ------------------------------------------------------------------ AC-13 */

describe("016 AC-13: the anonymous pass, against a stub made to pass every check", () => {
  it("AC-13: runs the eleven checks in order, prints PASS for each, and exits 0", async () => {
    const result = await anonymous();

    expect(result.lines).toEqual([
      ...anonymousCheckNames(false).map((name) => `[verify] PASS ${name}`),
      "[verify] 11 of 11 checks passed",
    ]);
    expect(anonymousCheckNames(false)).toEqual([
      "https-only",
      "hsts",
      "security-headers",
      "csrf-cookie-secure",
      "session-401",
      "api-401",
      "protected-redirects",
      "setup-404",
      "public-no-money",
      "no-leftovers",
      "region",
    ]);
    expect(result.code).toBe(0);
    expectNothingLeaked(result.printed);
  });

  it("AC-13: with --expect-commit, commit runs last and passes when /api/version reports it", async () => {
    const result = await anonymous(["--expect-commit", COMMIT]);

    expect(Object.keys(outcomes(result))).toEqual(anonymousCheckNames(true));
    expect(Object.values(outcomes(result)).every((outcome) => outcome === "PASS")).toBe(true);
    expect(result.code).toBe(0);
  });

  it("AC-13: without --expect-commit, commit does not run", async () => {
    const result = await anonymous();

    expect(Object.keys(outcomes(result))).not.toContain("commit");
    expect(site.received.some((request) => request.path === "/api/version")).toBe(false);
  });
});

describe("016 AC-13: each check, against a stub made to fail it", () => {
  it("AC-13 https-only: fails when http://<host>/ answers 200, answers 302, or redirects anywhere but https://<host>/", async () => {
    const variants: Reply[] = [
      { status: 200, headers: HTML, body: BODY_TEXT },
      { status: 302, headers: { Location: `https://${site.origin.host}/` } },
      { status: 308, headers: { Location: `http://${site.origin.host}/` } },
      { status: 301, headers: { Location: `https://${site.origin.host}/sign-in` } },
    ];
    for (const variant of variants) {
      plainHttp.routes.set("/", variant);
      expectOnlyFailure(await anonymous(), "https-only");
    }
  });

  it("AC-13 https-only: 301 is accepted as well as 308", async () => {
    plainHttp.routes.set("/", { status: 301, headers: { Location: `https://${site.origin.host}/` } });

    expect(outcomes(await anonymous())["https-only"]).toBe("PASS");
  });

  it("AC-13 hsts: fails with no Strict-Transport-Security on /sign-in, and with a max-age below 31536000", async () => {
    withHeaders("/sign-in", (headers) => {
      delete headers["Strict-Transport-Security"];
    });
    expectOnlyFailure(await anonymous(), "hsts");

    makePassing();
    withHeaders("/sign-in", (headers) => {
      headers["Strict-Transport-Security"] = "max-age=31535999; includeSubDomains";
    });
    expectOnlyFailure(await anonymous(), "hsts");

    makePassing();
    withHeaders("/sign-in", (headers) => {
      headers["Strict-Transport-Security"] = "max-age=31536000";
    });
    expect(outcomes(await anonymous()).hsts).toBe("PASS");
  });

  it("AC-13 security-headers: fails when any one of the other five is missing or wrong, or X-Powered-By is sent", async () => {
    const others = Object.keys(SECURITY).filter((name) => name !== "Strict-Transport-Security");
    expect(others).toHaveLength(5);

    for (const name of others) {
      makePassing();
      withHeaders("/sign-in", (headers) => {
        delete headers[name];
      });
      expectOnlyFailure(await anonymous(), "security-headers");

      makePassing();
      withHeaders("/sign-in", (headers) => {
        headers[name] = "unsafe-none";
      });
      expectOnlyFailure(await anonymous(), "security-headers");
    }

    makePassing();
    withHeaders("/sign-in", (headers) => {
      headers["X-Powered-By"] = "Next.js";
    });
    expectOnlyFailure(await anonymous(), "security-headers");
  });

  it("AC-13 csrf-cookie-secure: fails for a cookie without Secure, without HttpOnly, with another Path, or under another name", async () => {
    const variants = [
      `__Host-authjs.csrf-token=${COOKIE_VALUE}; Path=/; HttpOnly; SameSite=Lax`,
      `__Host-authjs.csrf-token=${COOKIE_VALUE}; Path=/; Secure; SameSite=Lax`,
      `__Host-authjs.csrf-token=${COOKIE_VALUE}; Path=/api; HttpOnly; Secure`,
      `authjs.csrf-token=${COOKIE_VALUE}; Path=/; HttpOnly; Secure`,
    ];
    for (const cookie of variants) {
      makePassing();
      site.routes.set("/api/auth/csrf", {
        status: 200,
        headers: { ...JSON_TYPE, "Set-Cookie": [cookie, TRACKER] },
        body: JSON.stringify({ csrfToken: BODY_TEXT }),
      });
      const result = await anonymous();

      expectOnlyFailure(result, "csrf-cookie-secure");
      expectNothingLeaked(result.printed);
    }
  });

  it("AC-13 session-401: fails when /api/session answers 200, and when its 401 names id, username or role", async () => {
    const vercelId = { "x-vercel-id": "dub1::lhr1::abcde-1727000000000-0123456789ab" };
    const variants: Reply[] = [
      { status: 200, headers: { ...JSON_TYPE, ...vercelId }, body: JSON.stringify({ error: BODY_TEXT }) },
      { status: 401, headers: { ...JSON_TYPE, ...vercelId }, body: JSON.stringify({ role: "YARD_STAFF" }) },
      { status: 401, headers: { ...JSON_TYPE, ...vercelId }, body: JSON.stringify({ user: { id: BODY_TEXT } }) },
      { status: 401, headers: { ...HTML, ...vercelId }, body: `<p>"username": ${BODY_TEXT}</p>` },
    ];
    for (const variant of variants) {
      makePassing();
      site.routes.set("/api/session", variant);
      const result = await anonymous();

      expectOnlyFailure(result, "session-401");
      expectNothingLeaked(result.printed);
    }
  });

  it("AC-13 api-401: fails when /api/users answers anything but 401", async () => {
    site.routes.set("/api/users", { status: 403, headers: JSON_TYPE, body: "{}" });

    expectOnlyFailure(await anonymous(), "api-401");
  });

  it("AC-13 protected-redirects: fails for a path that answers 200, redirects over http, or drops the callback", async () => {
    const [first, second, third] = PROTECTED_PATHS;
    const host = site.origin.host;
    const variants: [string, Reply][] = [
      [first, { status: 200, headers: HTML, body: BODY_TEXT }],
      [second, { status: 307, headers: { Location: `http://${host}/sign-in?callbackUrl=${encodeURIComponent(second)}` } }],
      [third, { status: 307, headers: { Location: `https://${host}/sign-in?callbackUrl=${third}` } }],
      [first, { status: 307, headers: { Location: `https://${host}/sign-in` } }],
    ];
    for (const [path, variant] of variants) {
      makePassing();
      site.routes.set(path, variant);
      const result = await anonymous();

      expectOnlyFailure(result, "protected-redirects");
      const line = result.lines.find((entry) => entry.startsWith("[verify] FAIL protected-redirects"));
      expect(line).toContain(path);
    }
  });

  it("AC-13 protected-redirects: reads the paths from src/lib/auth-config.ts, and asks every one", async () => {
    await anonymous();

    const asked = site.received.map((request) => request.path);
    for (const path of PROTECTED_PATHS) expect(asked, path).toContain(path);
    expect(readFileSync("scripts/verify/anonymous-pass.ts", "utf8")).toContain(
      'import { PROTECTED_PATHS, SIGN_IN_PATH } from "@/lib/auth-config";',
    );
  });

  it("AC-13 setup-404: fails when /setup answers 200", async () => {
    site.routes.set("/setup", { status: 200, headers: HTML, body: BODY_TEXT });

    expectOnlyFailure(await anonymous(), "setup-404");
  });

  it("AC-13 public-no-money: fails when a public page is not 200, or carries money", async () => {
    const variants: [string, Reply][] = [
      ["/", { status: 200, headers: HTML, body: `<p>${BODY_TEXT} €12</p>` }],
      ["/sign-in", { status: 200, headers: HTML, body: `<p>&euro;${BODY_TEXT}</p>` }],
      ["/sign-in/create", { status: 404, headers: HTML, body: BODY_TEXT }],
      ["/sign-in/create", { status: 200, headers: HTML, body: `<p>${["unit", "Pr", "ice"].join("")}</p>` }],
    ];
    for (const [path, variant] of variants) {
      makePassing();
      site.routes.set(path, variant);
      const result = await anonymous();

      expectOnlyFailure(result, "public-no-money");
      expectNothingLeaked(result.printed);
    }
  });

  it("AC-13 no-leftovers: fails when any one of the five answers anything but 404", async () => {
    for (const path of LEFTOVERS) {
      makePassing();
      site.routes.set(path, { status: 200, headers: HTML, body: BODY_TEXT });
      const result = await anonymous();

      expectOnlyFailure(result, "no-leftovers");
      expect(result.lines.find((line) => line.startsWith("[verify] FAIL no-leftovers"))).toContain(path);
    }
  });

  it("AC-13 region: fails with no x-vercel-id, another function region, or an edge-only id", async () => {
    for (const vercelId of [undefined, "dub1::iad1::abcde-1727000000000-0123456789ab", "lhr1::abcde-1727000000000-0123456789ab"]) {
      makePassing();
      const headers: Record<string, string> = { ...JSON_TYPE };
      if (vercelId !== undefined) headers["x-vercel-id"] = vercelId;
      site.routes.set("/api/session", { status: 401, headers, body: "{}" });

      expectOnlyFailure(await anonymous(), "region");
    }
  });

  it("AC-13 region: the function's region is the last region code before the request id", () => {
    expect(functionRegion("dub1::lhr1::abcde-1727000000000-0123456789ab")).toBe("lhr1");
    expect(functionRegion("lhr1::lhr1::abcde-1727000000000-0123456789ab")).toBe("lhr1");
    expect(functionRegion("dub1::iad1::abcde-1727000000000-0123456789ab")).toBe("iad1");
    expect(functionRegion("lhr1::abcde-1727000000000-0123456789ab")).toBeNull();
    expect(functionRegion(null)).toBeNull();
  });

  it("AC-13 commit: fails when /api/version reports another commit, or null", async () => {
    for (const body of [{ commit: randomBytes(20).toString("hex") }, { commit: null }]) {
      makePassing();
      site.routes.set("/api/version", { status: 200, headers: JSON_TYPE, body: JSON.stringify(body) });

      expectOnlyFailure(await anonymous(["--expect-commit", COMMIT]), "commit", true);
    }
  });

  it("AC-13: a check whose request cannot be made fails, naming the path", async () => {
    const lines: string[] = [];
    const code = await main(["--url", site.origin.origin], {
      print: (line) => {
        lines.push(line);
      },
      launchBrowser: () => Promise.reject(new Error("unused")),
      // A port nothing listens on: the plain-http request is refused.
      httpOriginFor: () => new URL("http://127.0.0.1:9"),
    });

    expect(code).toBe(1);
    expect(lines).toContain("[verify] FAIL https-only: /: request failed");
  });
});

describe("016 AC-13: the --url rule and the other arguments", () => {
  it("AC-13: refuses a --url that is not https:, unless its host is localhost or 127.0.0.1", () => {
    for (const url of ["http://example.invalid", "http://localhost.example", "http://127.0.0.2:3000", "ftp://localhost"]) {
      expect(parseArguments(["--url", url]), url).toHaveProperty("problem");
    }
    for (const url of [
      "https://stock-management-zeta-one.vercel.app",
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "https://localhost",
    ]) {
      expect(parseArguments(["--url", url]), url).not.toHaveProperty("problem");
    }
  });

  it("AC-13: a refused --url makes no request at all, and exits non-zero", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      const result = await run(["--url", "http://example.invalid"]);

      expect(result.code).toBe(2);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result.lines[0]).toMatch(/^\[verify\] refused: /);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("AC-13: --url must be an origin, and --expect-commit a full commit hash", () => {
    for (const argv of [
      ["--url", "https://stock-management-zeta-one.vercel.app/sign-in"],
      ["--url", "https://stock-management-zeta-one.vercel.app/?a=1"],
      ["--url", "https://stock-management-zeta-one.vercel.app/#x"],
      ["--url", "not a url"],
      [],
      ["--url"],
      ["--url", "https://a.invalid", "--expect-commit", "713b5a5"],
      ["--url", "https://a.invalid", "--expect-commit", COMMIT.toUpperCase().replace(/^./, "A")],
      ["--url", "https://a.invalid", "--url", "https://b.invalid"],
    ]) {
      expect(parseArguments(argv), argv.join(" ")).toHaveProperty("problem");
    }
    const parsed = parseArguments(["--url", "https://a.invalid", "--expect-commit", COMMIT]);
    expect("problem" in parsed).toBe(false);
    if (!("problem" in parsed)) {
      expect(parsed.origin.href).toBe("https://a.invalid/");
      expect(parsed.expectCommit).toBe(COMMIT);
      expect(parsed.signedIn).toBe(false);
    }
  });
});

/* ------------------------------------------------------------------ AC-14 */

describe("016 AC-14: the live check holds no secret", () => {
  it("AC-14: accepts no credential through an argument: a --url with a user name or password is refused, and not quoted", async () => {
    const password = `pw${randomBytes(8).toString("hex")}`;
    const result = await run(["--url", `https://someone:${password}@a.invalid`]);

    expect(result.code).toBe(2);
    expect(result.printed.includes(password)).toBe(false);
    expect(result.printed.includes("someone")).toBe(false);
  });

  it("AC-14: accepts no other argument, and never quotes one it refuses", async () => {
    const pasted = `k${randomBytes(12).toString("hex")}`;
    for (const argv of [
      ["--url", site.origin.origin, "--pin", pasted],
      ["--url", site.origin.origin, pasted],
      ["--url", site.origin.origin, `--cookie=${pasted}`],
      ["--url", site.origin.origin, "--signed-in", "--session", pasted],
    ]) {
      const result = await run(argv);

      expect(result.code, argv.join(" ")).toBe(2);
      expect(result.printed.includes(pasted)).toBe(false);
    }
    expect(site.received).toEqual([]);
  });

  it("AC-14: prints no cookie value, no Set-Cookie header and no body text, when every check fails as well as when every check passes", async () => {
    expectNothingLeaked((await anonymous(["--expect-commit", COMMIT])).printed);

    // Break every check at once, so every failure reason is printed.
    site.common = { "Set-Cookie": TRACKER, "X-Powered-By": BODY_TEXT };
    for (const path of site.routes.keys()) {
      site.routes.set(path, { status: 200, headers: { ...HTML, "Set-Cookie": `__Host-authjs.csrf-token=${COOKIE_VALUE}` }, body: `${BODY_TEXT} €` });
    }
    for (const path of LEFTOVERS) site.routes.set(path, { status: 200, headers: HTML, body: BODY_TEXT });
    plainHttp.routes.set("/", { status: 200, headers: HTML, body: BODY_TEXT });
    const result = await anonymous(["--expect-commit", COMMIT]);

    expect(Object.values(outcomes(result)).every((outcome) => outcome === "FAIL")).toBe(true);
    expectNothingLeaked(result.printed);
  });

  it("AC-14: sends only GET and HEAD, never with a body, and sends no cookie back", async () => {
    await anonymous(["--expect-commit", COMMIT]);

    const received = [...site.received, ...plainHttp.received];
    expect(received.length).toBeGreaterThan(20);
    expect(received.filter((request) => request.method !== "GET" && request.method !== "HEAD")).toEqual([]);
    expect(received.filter((request) => request.hadBody)).toEqual([]);
  });

  it("AC-14: the parsed cookie keeps the name and the flags, and drops the value", () => {
    const flags = cookieFlags(`__Host-authjs.csrf-token=${COOKIE_VALUE}; Path=/; HttpOnly; Secure`);

    expect(flags).toEqual({ name: "__Host-authjs.csrf-token", secure: true, httpOnly: true, path: "/" });
    expect(JSON.stringify(flags).includes(COOKIE_VALUE)).toBe(false);
  });

  it("AC-14: the real command, spawned with sentinel settings in its environment, prints none of them, nor the stub's cookie or body", async () => {
    const sentinels = Array.from({ length: 3 }, () => `s${randomBytes(12).toString("hex")}`);
    const [database, secret, pepper] = sentinels;
    const env = { ...process.env, DATABASE_URL: database, AUTH_SECRET: secret, PIN_PEPPER: pepper };

    const result = await spawnVerify(["--url", site.origin.origin, "--expect-commit", COMMIT], env);

    // Run for real, the plain-http check asks the stub itself, which answers 200 there.
    expect(result.status).toBe(1);
    expect(result.printed).toContain("[verify] FAIL https-only: ");
    expect(result.printed).toContain("[verify] PASS commit");
    expectNothingLeaked(result.printed);
    for (const sentinel of sentinels) expect(result.printed.includes(sentinel)).toBe(false);
  });
});

/** Every repository file the command loads: its own, and each local module they import. */
function importClosure(entry: string): { files: string[]; external: string[] } {
  const files: string[] = [];
  const external = new Set<string>();
  const queue = [entry];
  const specifiers = /(?:import|export)\s+(?:type\s+)?(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (files.includes(file)) continue;
    files.push(file);
    for (const match of readFileSync(file, "utf8").matchAll(specifiers)) {
      const specifier = match[1] ?? match[2] ?? "";
      let base: string | undefined;
      if (specifier.startsWith("@/")) base = `src/${specifier.slice(2)}`;
      else if (specifier.startsWith(".")) base = posix.join(posix.dirname(file), specifier);
      if (base === undefined) {
        external.add(specifier);
        continue;
      }
      const resolved = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) => existsSync(candidate));
      if (resolved === undefined) throw new Error(`cannot resolve ${specifier} from ${file}`);
      queue.push(resolved);
    }
  }
  return { files: files.sort(), external: [...external].sort() };
}

describe("016 AC-14: what the live check's modules contain, read from source", () => {
  const closure = importClosure("scripts/verify-deployment.ts");
  const sources = closure.files.map((file) => ({ file, source: readFileSync(file, "utf8") }));
  const offending = (pattern: RegExp): string[] =>
    sources.filter(({ source }) => pattern.test(source)).map(({ file }) => file);

  it("AC-14: the closure is read in full: the command, its modules and the three shared rules it uses", () => {
    expect(closure.files).toEqual([
      "scripts/verify-deployment.ts",
      "scripts/verify/anonymous-pass.ts",
      "scripts/verify/cli.ts",
      "scripts/verify/common.ts",
      "scripts/verify/signed-in-pass.ts",
      "src/lib/auth-config.ts",
      "src/lib/deploy/money-scan.ts",
      "src/lib/money-boundary.ts",
    ]);
    // The browser, and Auth.js's configuration type, which auth-config imports as a type.
    expect(closure.external).toEqual(["@playwright/test", "next-auth"]);
  });

  it("AC-14: reads no .env: no loadEnvFile, no dotenv, no environment variable, and no file-system, process or module API", () => {
    expect(offending(/loadEnvFile/)).toEqual([]);
    expect(offending(/dotenv/)).toEqual([]);
    expect(offending(/process\.env/)).toEqual([]);
    expect(offending(/["'](?:node:)?(?:fs|fs\/promises|child_process|module|worker_threads)["']/)).toEqual([]);
    expect(offending(/\brequire\s*\(/)).toEqual([]);
  });

  it("AC-14: names no path ending in .env, apart from the URL path no-leftovers asks the server for", () => {
    const envPaths = sources.flatMap(({ file, source }) =>
      [...source.matchAll(/["'`]([^"'`\n]*\.env)["'`]/g)].map((match) => `${file}: ${match[1] ?? ""}`),
    );

    expect(envPaths).toEqual(["scripts/verify/anonymous-pass.ts: /.env"]);
    // That one is a URL path in the list of addresses that must answer 404.
    expect(readFileSync("scripts/verify/anonymous-pass.ts", "utf8")).toMatch(/const LEFTOVERS = \[\s*"\/\.env",/);
  });

  it("AC-14: imports nothing from the server layer or the database client", () => {
    expect(closure.files.filter((file) => file.startsWith("src/server/"))).toEqual([]);
    expect(closure.external.filter((name) => /prisma/.test(name))).toEqual([]);
    expect(offending(/(?:from\s+|import\(\s*)["'](?:@\/server\/|@prisma\/client|\.prisma\/client)/)).toEqual([]);
  });

  it("AC-14: sends no request other than GET and HEAD, and no request body", () => {
    // One fetch, in one helper, whose method is typed GET or HEAD and whose options carry
    // no body. The browser pass asks with Playwright's `get` only.
    const common = readFileSync("scripts/verify/common.ts", "utf8");
    const fetchCall = /fetch\(new URL\(path, base\), \{([^}]*)\}\)/.exec(common)?.[1] ?? "";

    expect(offending(/\bfetch\s*\(/)).toEqual(["scripts/verify/common.ts"]);
    expect(fetchCall.replace(/\s+/g, " ").trim()).toBe(
      'method, redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),',
    );
    expect(common).toContain('method: "GET" | "HEAD" = "GET"');
    expect(offending(/["'](?:POST|PUT|PATCH|DELETE)["']/)).toEqual([]);
    expect(offending(/\.(?:post|put|patch|delete|fetch)\s*\(/)).toEqual([]);
    // A browser context's or a page's request API may only `get`.
    expect(offending(/\.request\.(?!get\b)\w+\s*\(/)).toEqual([]);
    expect(offending(/\.request\.get\s*\(/)).toEqual(["scripts/verify/signed-in-pass.ts"]);
  });

  it("AC-14: contains the string unitPrice nowhere", () => {
    expect(offending(new RegExp(["unit", "Price"].join("")))).toEqual([]);
  });

  it("AC-15: never types into, reads or records a form field", () => {
    expect(
      offending(/\.(?:fill|type|press|pressSequentially|inputValue|selectOption|setInputFiles|setChecked)\s*\(|\bkeyboard\b/),
    ).toEqual([]);
  });

  it("AC-14 (non-vacuity): each rule sees the shape it bans", () => {
    const shapes = [
      [/loadEnvFile/, 'process.loadEnvFile(".env")'],
      [/process\.env/, "const x = process.env.AUTH_SECRET"],
      [/["'](?:node:)?(?:fs|fs\/promises|child_process|module|worker_threads)["']/, 'import { readFileSync } from "node:fs"'],
      [/["']@\/server\//, 'import { db } from "@/server/db"'],
      [/["'](?:POST|PUT|PATCH|DELETE)["']/, 'fetch(url, { method: "POST" })'],
      [/\.request\.(?!get\b)\w+\s*\(/, "page.context().request.post(url, { data: x })"],
      [/(?:from\s+|import\(\s*)["'](?:@\/server\/|@prisma\/client|\.prisma\/client)/, 'import { db } from "@/server/db"'],
    ] as const;
    for (const [pattern, shape] of shapes) expect(pattern.test(shape), shape).toBe(true);
  });
});

/* ------------------------------------------------------------------ AC-15 */

describe("016 AC-15: the signed-in pass, the parts that need no browser", () => {
  it("AC-15: prints the sentence the spec gives", () => {
    expect(SIGN_IN_PROMPT).toBe("Sign in as a YARD_STAFF profile in the window that opened");
  });

  it("AC-15: a session supplied without a person is refused for every origin but localhost and 127.0.0.1", () => {
    for (const origin of [
      "https://stock-management-zeta-one.vercel.app",
      "https://localhost.example",
      "https://127.0.0.1.example",
      "http://127.0.0.2:3000",
      "http://[::1]:3000",
    ]) {
      expect(() => assertSessionSupplierAllowed(new URL(origin)), origin).toThrow(SessionSupplierRefused);
    }
    for (const origin of ["http://localhost:3000", "http://127.0.0.1:3000", "https://localhost"]) {
      expect(() => assertSessionSupplierAllowed(new URL(origin)), origin).not.toThrow();
    }
  });

  it("AC-15: the pass refuses a supplied session for the live origin before it opens anything", async () => {
    const newContext = vi.fn();
    const browser = { newContext } as unknown as Parameters<typeof signedInPass>[0]["browser"];

    await expect(
      signedInPass({
        origin: new URL("https://stock-management-zeta-one.vercel.app"),
        browser,
        print: () => undefined,
        supplySession: () => Promise.resolve(),
      }),
    ).rejects.toThrow(SessionSupplierRefused);
    expect(newContext).not.toHaveBeenCalled();
  });

  it("AC-15: a count page is a count id under /stock-entry/counts or /stock-takes/counts, and nothing else", () => {
    for (const path of ["/stock-entry/counts/c1", "/stock-takes/counts/c1", "/stock-entry/counts/c1/summary"]) {
      expect(isCountPage(path), path).toBe(true);
    }
    for (const path of ["/stock-entry", "/stock-entry/new", "/stock-entry/counts", "/stock-takes", "/analysis/counts/c1"]) {
      expect(isCountPage(path), path).toBe(false);
    }
  });

  it("AC-15: the command line has no way to supply a session: the CLI never names the supplier", () => {
    expect(readFileSync("scripts/verify/cli.ts", "utf8")).not.toContain("supplySession");
    expect(readFileSync("scripts/verify-deployment.ts", "utf8")).not.toContain("supplySession");
  });

  it("AC-15: --signed-in opens the browser the command line launches, visible, and closes it", () => {
    const entry = readFileSync("scripts/verify-deployment.ts", "utf8");

    expect(entry).toContain("chromium.launch({ headless: false })");
    expect(readFileSync("scripts/verify/cli.ts", "utf8")).toContain("await browser.close()");
    expect(readFileSync("scripts/verify/signed-in-pass.ts", "utf8")).toContain("browser.newContext()");
  });
});

/* ------------------------------------------------------------------ helpers */

const requireFromRoot = createRequire(join(process.cwd(), "package.json"));

function tsxCli(): string {
  const manifestPath = requireFromRoot.resolve("tsx/package.json");
  const manifest = requireFromRoot(manifestPath) as { bin: string | Record<string, string> };
  const bin = typeof manifest.bin === "string" ? manifest.bin : (manifest.bin.tsx ?? "");
  return join(dirname(manifestPath), bin);
}

/** The real command, as `npm run verify:deploy` runs it, without blocking the stub. */
function spawnVerify(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<{ status: number; printed: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli(), "scripts/verify-deployment.ts", ...args], { env });
    let printed = "";
    child.stdout.on("data", (chunk: Buffer) => {
      printed += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      printed += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ status: code ?? 1, printed }));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});
