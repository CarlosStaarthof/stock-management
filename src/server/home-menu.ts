import { isAdminOrAbove, type Role } from "@/server/auth/roles";

/**
 * The one home menu's tiles (feature #22 D3, D4, AC-5).
 *
 * The list is built from the session role and nothing else. A tile a role may not use is
 * not rendered at all — absent from the response, not hidden by styling. The Stock
 * Calendar tile resolves per role: a counter starts a count in one tap, an administrator
 * reaches the history/approval calendar in one tap (D4), and both keep their shipped URLs.
 */
export type HomeTile = {
  testId: "home-calendar" | "home-export" | "home-stock" | "home-dashboard";
  label: string;
  href: string;
};

export const HOME_HEADING = "Home";

export function homeTilesForRole(role: Role): HomeTile[] {
  const tiles: HomeTile[] = [
    {
      testId: "home-calendar",
      label: "Stock Calendar",
      href: isAdminOrAbove(role) ? "/stock-takes" : "/stock-entry",
    },
  ];

  if (isAdminOrAbove(role)) {
    tiles.push(
      { testId: "home-export", label: "Export", href: "/analysis/export" },
      { testId: "home-stock", label: "Stock", href: "/item-master" },
    );
  }

  if (role === "SUPER_ADMIN") {
    tiles.push({ testId: "home-dashboard", label: "Dashboard", href: "/dashboard" });
  }

  return tiles;
}
