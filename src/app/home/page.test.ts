import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/server/auth/roles";
import type { SessionUser } from "@/server/auth/session-user";

/**
 * Spec 022 AC-5, AC-6 and the `/home` half of AC-9, the PAGE half, rendered by the page
 * itself with no database.
 *
 * The browser spec (`tests/e2e/home-menu.spec.ts`) is kept for when Chromium runs in the
 * workers. This test proves the rendered response inside today's gate: the real page, the
 * real `homeTilesForRole`, the real `next/link` and the real identity header, with only the
 * session guard and the sign-out action mocked. It asserts the exact tiles, labels and
 * hrefs per role ("absent, not hidden") and that the menu carries no figure, price, value,
 * total or euro.
 */

const mocks = vi.hoisted(() => ({
  requireUserPage: vi.fn(),
  signOutAction: vi.fn(),
}));

vi.mock("@/app/page-guards", () => ({ requireUserPage: mocks.requireUserPage }));
vi.mock("@/app/auth-actions", () => ({ signOutAction: mocks.signOutAction }));

/*
 * The classic JSX runtime, as in `src/app/analysis/page.test.ts`: `tsconfig.json` preserves
 * JSX for Next, and Vitest's esbuild falls back to the classic transform, which needs a
 * `React` on `globalThis`. Met here, for this file only.
 */
(globalThis as { React?: typeof React }).React = React;
const { default: HomePage } = await import("./page");

const USERS: Record<Role, SessionUser> = {
  YARD_STAFF: { id: "u-staff", username: "staff", name: "Yard Staff", role: "YARD_STAFF" },
  ADMIN: { id: "u-admin", username: "owner", name: "Owner", role: "ADMIN" },
  SUPER_ADMIN: {
    id: "u-super",
    username: "carlos-staarthof",
    name: "Carlos",
    role: "SUPER_ADMIN",
  },
};

type RenderedTile = { testId: string; href: string; text: string };

/** The `home-*` anchors a response contains, in render order, read from the HTML. */
function tilesIn(html: string): RenderedTile[] {
  const found: RenderedTile[] = [];
  const opener = /<a\b[^>]*\bdata-testid="(home-[^"]+)"[^>]*>/g;

  for (const open of html.matchAll(opener)) {
    const start = open.index;
    const close = html.indexOf("</a>", start);
    const text = html.slice(start + open[0].length, close).replace(/<[^>]*>/g, "").trim();
    const href = /\bhref="([^"]*)"/.exec(open[0])?.[1] ?? "";
    found.push({ testId: open[1], href, text });
  }

  return found;
}

async function renderHome(role: Role): Promise<string> {
  mocks.requireUserPage.mockResolvedValue(USERS[role]);
  return renderToStaticMarkup(await HomePage());
}

beforeEach(() => {
  mocks.requireUserPage.mockReset();
  mocks.signOutAction.mockReset();
});

describe("022 AC-5: /home renders exactly the signed-in role's tiles", () => {
  it("AC-5: YARD_STAFF gets only Stock Calendar, at /stock-entry (AC-6)", async () => {
    const html = await renderHome("YARD_STAFF");

    expect(tilesIn(html)).toEqual([
      { testId: "home-calendar", href: "/stock-entry", text: "Stock Calendar" },
    ]);
    expect(html).not.toContain('href="/analysis/export"');
    expect(html).not.toContain('href="/item-master"');
    expect(html).not.toContain('href="/dashboard"');
  });

  it("AC-5: ADMIN gets the three admin tiles, calendar at /stock-takes, no Dashboard (AC-6)", async () => {
    const html = await renderHome("ADMIN");

    expect(tilesIn(html)).toEqual([
      { testId: "home-calendar", href: "/stock-takes", text: "Stock Calendar" },
      { testId: "home-export", href: "/analysis/export", text: "Export" },
      { testId: "home-stock", href: "/item-master", text: "Stock" },
    ]);
    expect(html).not.toContain('href="/dashboard"');
  });

  it("AC-5: SUPER_ADMIN gets all four tiles, calendar still at /stock-takes (AC-6)", async () => {
    const html = await renderHome("SUPER_ADMIN");

    expect(tilesIn(html)).toEqual([
      { testId: "home-calendar", href: "/stock-takes", text: "Stock Calendar" },
      { testId: "home-export", href: "/analysis/export", text: "Export" },
      { testId: "home-stock", href: "/item-master", text: "Stock" },
      { testId: "home-dashboard", href: "/dashboard", text: "Dashboard" },
    ]);
  });

  it.each(["YARD_STAFF", "ADMIN", "SUPER_ADMIN"] as const)(
    "AC-5: a %s response carries the identity header — display name and sign-out",
    async (role) => {
      const html = await renderHome(role);

      expect(mocks.requireUserPage).toHaveBeenCalledTimes(1);
      expect(html).toContain(`data-testid="signed-in-name"`);
      expect(html).toContain(USERS[role].name);
      expect(html).toContain(`data-testid="sign-out"`);
    },
  );
});

describe("022 AC-9: the home menu carries no figure, price, value, total or euro", () => {
  it.each(["YARD_STAFF", "ADMIN", "SUPER_ADMIN"] as const)(
    "AC-9: a %s /home response has no euro and no digit in the menu",
    async (role) => {
      const html = await renderHome(role);

      const menuStart = html.lastIndexOf("<nav", html.indexOf('data-testid="home-menu"'));
      const menuEnd = html.indexOf("</nav>", menuStart);
      expect(menuStart).toBeGreaterThanOrEqual(0);
      expect(menuEnd).toBeGreaterThan(menuStart);

      // The text a person reads in the menu, with the markup's own `1`, `3` and `16` gone.
      const menu = html.slice(menuStart, menuEnd).replace(/<[^>]*>/g, " ").trim();
      expect(menu).not.toContain("€");
      expect(menu).not.toMatch(/\d/);

      // The whole page, script payloads excluded, carries no euro.
      const page = html
        .replace(/<script[\s\S]*?<\/script>/g, " ")
        .replace(/<[^>]*>/g, " ");
      expect(page).not.toContain("€");
    },
  );
});
