import { expect, test } from "@playwright/test";

import { anonymousPass } from "../../scripts/verify/anonymous-pass";
import type { CheckResult } from "../../scripts/verify/common";
import { signedInPass } from "../../scripts/verify/signed-in-pass";

import { skipWithoutDatabase } from "./support/database";
import { createTestUser, removeUser, signIn } from "./support/users";

/**
 * Spec 016 AC-11, AC-12 and AC-15, against the LOCAL PRODUCTION BUILD this suite serves
 * (`next start`), never against the live address. The live check itself is run by the
 * coordinator at go-live; here it is run against the build, where everything that depends on
 * HTTPS is expected to fail, and does.
 */

const SECURITY_HEADERS: Record<string, string> = {
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

const created: string[] = [];

test.afterAll(async () => {
  for (const username of created.splice(0)) {
    await removeUser(username);
  }
});

function outcomes(results: readonly CheckResult[]): Record<string, boolean> {
  return Object.fromEntries(results.map((result) => [result.name, result.passed]));
}

test("AC-11: /sign-in on the local production build carries all six security headers and no X-Powered-By", async ({
  request,
}) => {
  const response = await request.get("/sign-in");
  const headers = response.headers();

  expect(response.status()).toBe(200);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expect(headers[name], name).toBe(value);
  }
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("AC-11: a JSON answer, a not-found page and a sign-in redirect carry them too", async ({ request }) => {
  const answers = [
    await request.get("/api/version"),
    await request.get("/no-such-page"),
    await request.get("/stock-entry", { maxRedirects: 0 }),
  ];

  expect(answers.map((answer) => answer.status())).toEqual([200, 404, 307]);
  for (const answer of answers) {
    const headers = answer.headers();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(headers[name], `${answer.url()} ${name}`).toBe(value);
    }
    expect(headers["x-powered-by"], answer.url()).toBeUndefined();
  }
});

test("AC-12: GET /api/version on the local build answers 200, no-store, and { commit: null }", async ({
  request,
}) => {
  const response = await request.get("/api/version");

  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.json()).toEqual({ commit: null });
});

test("AC-13, observed on the local build: the anonymous pass fits the application, and only what needs HTTPS or Vercel fails", async ({
  baseURL,
}, testInfo) => {
  await skipWithoutDatabase(testInfo);
  const origin = new URL(baseURL as string);
  const lines: string[] = [];

  const results = await anonymousPass({ origin, httpOrigin: origin }, (line) => lines.push(line));

  expect(outcomes(results)).toEqual({
    // Plain http, and no proxy: the four that only an https deployment on Vercel can pass.
    "https-only": false,
    "csrf-cookie-secure": false,
    "protected-redirects": false,
    region: false,
    // Everything the application itself decides.
    hsts: true,
    "security-headers": true,
    "session-401": true,
    "api-401": true,
    "setup-404": true,
    "public-no-money": true,
    "no-leftovers": true,
  });
});

test("AC-15: the signed-in pass, with a fixture YARD_STAFF session on the local build: staff-role, staff-no-money and signed-out pass, and over http both cookie checks fail", async ({
  browser,
  baseURL,
}, testInfo) => {
  // The pass opens both staff screens, every page linked from them (up to 50) and four
  // more, waiting for each to settle so every response it sends is read: that is minutes,
  // not the suite's 45 s.
  test.setTimeout(240_000);
  await skipWithoutDatabase(testInfo);
  const staff = await createTestUser("YARD_STAFF", "verify-deploy");
  created.push(staff.username);
  const origin = new URL(baseURL as string);
  const lines: string[] = [];

  const results = await signedInPass({
    origin,
    browser,
    print: (line) => lines.push(line),
    // The test stands in for the person, in the window the pass opened.
    supplySession: (page) => signIn(page, staff, new URL("/sign-in", origin).href),
  });

  // The printed lines name checks, paths and rules only, so the run's log may show them: the
  // counts of responses scanned and pages opened are the evidence the scan looked at all.
  console.log(lines.join("\n"));
  expect(outcomes(results), lines.join(" | ")).toEqual({
    "staff-role": true,
    "device-cookie-secure": false,
    "session-cookie-secure": false,
    "staff-no-money": true,
    "signed-out": true,
  });
  expect(lines[0]).toBe("[verify] Sign in as a YARD_STAFF profile in the window that opened");
  const scanned = lines.find((line) => line.startsWith("[verify] staff-no-money: scanned "));
  expect(Number(/scanned (\d+) responses/.exec(scanned ?? "")?.[1] ?? "0")).toBeGreaterThan(5);
  // The cookie checks fail on the flags, not on a missing browser session.
  expect(lines).toContain("[verify] FAIL device-cookie-secure: macroads-device: lacks Secure");
  expect(lines).toContain(
    "[verify] FAIL session-cookie-secure: __Secure-authjs.session-token: the browser holds no such cookie",
  );
  // Nothing the person typed is in what the pass printed.
  expect(lines.join("\n").includes(staff.pin)).toBe(false);
});
