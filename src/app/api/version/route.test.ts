import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PROTECTED_PATHS } from "@/lib/auth-config";

import { GET } from "./route";

/**
 * Spec 016 AC-12: `GET /api/version` names the commit being served, and nothing else.
 * Every value here is made at run time, so no test can pass by matching a literal.
 */
const ROUTE_SOURCE = readFileSync("src/app/api/version/route.ts", "utf8");

function fullCommit(): string {
  return randomBytes(20).toString("hex");
}

async function answer(): Promise<{ status: number; cacheControl: string | null; body: unknown; text: string }> {
  const response = GET();
  const text = await response.text();
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: JSON.parse(text) as unknown,
    text,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("016 AC-12: GET /api/version", () => {
  it("AC-12: with VERCEL_GIT_COMMIT_SHA set to a full commit, answers 200, no-store, and exactly { commit }", async () => {
    const commit = fullCommit();
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", commit);

    const { status, cacheControl, body } = await answer();

    expect(status).toBe(200);
    expect(cacheControl).toBe("no-store");
    expect(body).toEqual({ commit });
  });

  it("AC-12: with the variable unset, answers { commit: null }", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);

    const { status, cacheControl, body } = await answer();

    expect(status).toBe(200);
    expect(cacheControl).toBe("no-store");
    expect(body).toEqual({ commit: null });
  });

  it("AC-12: with the variable malformed, answers { commit: null } and never echoes it", async () => {
    const commit = fullCommit();
    const malformed = [
      "",
      commit.toUpperCase().replace(/^./, "A"),
      commit.slice(1),
      `${commit}0`,
      ` ${commit}`,
      `${commit}\n`,
      `${commit.slice(0, 39)}g`,
      `k${randomBytes(8).toString("hex")}`,
    ];

    for (const value of malformed) {
      vi.stubEnv("VERCEL_GIT_COMMIT_SHA", value);
      const { body, text } = await answer();

      expect(body, `malformed case ${malformed.indexOf(value)}`).toEqual({ commit: null });
      if (value.trim() !== "") expect(text.includes(value.trim())).toBe(false);
    }
  });

  it("AC-12: no other setting reaches the answer, even when the environment holds several", async () => {
    const sentinels = Array.from({ length: 4 }, () => randomBytes(12).toString("hex"));
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", undefined);
    vi.stubEnv("VERCEL_ENV", sentinels[0]);
    vi.stubEnv("VERCEL_REGION", sentinels[1]);
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", sentinels[2]);
    vi.stubEnv("AUTH_URL", `https://${sentinels[3]}.invalid`);

    const { text, body } = await answer();

    expect(Object.keys(body as object)).toEqual(["commit"]);
    for (const sentinel of sentinels) expect(text.includes(sentinel)).toBe(false);
  });

  it("AC-12: the route reads one setting, VERCEL_GIT_COMMIT_SHA, and no database, cookie or header", () => {
    const settingsRead = [...ROUTE_SOURCE.matchAll(/process\.env(?:\.(\w+)|\[)/g)].map(
      (match) => match[1] ?? "[computed]",
    );

    expect(settingsRead).toEqual(["VERCEL_GIT_COMMIT_SHA"]);
    expect(ROUTE_SOURCE).not.toMatch(/@\/server\/|@prisma\/client|next\/headers|cookies\(|headers\(\)/);
    // The handler takes no request, so it has nothing of the caller's to read.
    expect(GET.length).toBe(0);
  });

  it("AC-12: /api/version is not under PROTECTED_PATHS, and the middleware does not match it", () => {
    const middleware = readFileSync("src/middleware.ts", "utf8");

    const version: string = "/api/version";
    for (const path of PROTECTED_PATHS) {
      expect(version === path || version.startsWith(`${path}/`), path).toBe(false);
    }
    expect(middleware).not.toContain("/api/version");
    expect(middleware).not.toMatch(/["']\/api(?:\/:path\*)?["']/);
  });
});
