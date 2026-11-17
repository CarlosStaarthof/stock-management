import { describe, expect, it } from "vitest";

import { homeTilesForRole } from "@/server/home-menu";

describe("homeTilesForRole", () => {
  it("022 AC-5: YARD_STAFF gets exactly the calendar, at /stock-entry", () => {
    expect(homeTilesForRole("YARD_STAFF")).toEqual([
      { testId: "home-calendar", label: "Stock Calendar", href: "/stock-entry" },
    ]);
  });

  it("022 AC-5: ADMIN gets calendar, export and stock, with the history calendar", () => {
    expect(homeTilesForRole("ADMIN")).toEqual([
      { testId: "home-calendar", label: "Stock Calendar", href: "/stock-takes" },
      { testId: "home-export", label: "Export", href: "/analysis/export" },
      { testId: "home-stock", label: "Stock", href: "/item-master" },
    ]);
  });

  it("022 AC-5: SUPER_ADMIN gets all four tiles", () => {
    expect(homeTilesForRole("SUPER_ADMIN")).toEqual([
      { testId: "home-calendar", label: "Stock Calendar", href: "/stock-takes" },
      { testId: "home-export", label: "Export", href: "/analysis/export" },
      { testId: "home-stock", label: "Stock", href: "/item-master" },
      { testId: "home-dashboard", label: "Dashboard", href: "/dashboard" },
    ]);
  });
});
