import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PROTECTED_PATHS } from "@/lib/auth-config";
import { ROLES } from "@/server/auth/roles";
import { homeTilesForRole } from "@/server/home-menu";

/**
 * Spec 022 AC-4 and AC-6 as facts about the shipped tree, proved with no browser.
 *
 * AC-4: `/home` is protected at the edge, so a signed-out request never renders the menu.
 * AC-6: neither calendar moved — the pages are still at `/stock-entry` and `/stock-takes`,
 * and the Stock Calendar tile resolves to one of those shipped addresses for every role.
 * The executing browser spec stays in `tests/e2e/home-menu.spec.ts` for when Chromium runs.
 */

const ROOT = process.cwd();

function read(file: string): string {
  return readFileSync(join(ROOT, file), "utf8");
}

describe("022 AC-4: /home is in the protected set and the middleware matcher", () => {
  it("AC-4: PROTECTED_PATHS carries /home", () => {
    expect(PROTECTED_PATHS).toContain("/home");
  });

  it("AC-4: the middleware matcher carries the static /home literal", () => {
    expect(read("src/middleware.ts")).toContain('"/home/:path*"');
  });

  it("AC-4: a signed-out request is sent to /sign-in with the path as callbackUrl", () => {
    const middleware = read("src/middleware.ts");

    expect(middleware).toContain('signIn.searchParams.set("callbackUrl", `${pathname}${search}`)');
  });
});

describe("022 AC-6: both calendars keep their shipped addresses", () => {
  it("AC-6: the counting and history calendar pages still exist where they shipped", () => {
    for (const route of ["src/app/stock-entry/page.tsx", "src/app/stock-takes/page.tsx"]) {
      expect(existsSync(join(ROOT, route)), route).toBe(true);
    }
  });

  it("AC-6: the Stock Calendar tile resolves to a shipped calendar page for every role", () => {
    for (const role of ROLES) {
      const tile = homeTilesForRole(role).find((entry) => entry.testId === "home-calendar");

      expect(tile, role).toBeDefined();
      expect(tile?.href, role).toMatch(/^\/(stock-entry|stock-takes)$/);
      expect(existsSync(join(ROOT, `src/app${tile?.href}/page.tsx`)), role).toBe(true);
    }
  });
});
