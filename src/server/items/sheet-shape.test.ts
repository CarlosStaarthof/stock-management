import { describe, expect, it, vi } from "vitest";

import type { SessionUser } from "@/server/auth/session-user";
import { currentPriceOf, sheetEntriesForRole } from "@/server/items/sheet-shape";

/**
 * Spec 007 AC-14's shape half, with no database: a staff reader never has a price BUILT
 * for them, and the choice comes from `actor.role` alone.
 *
 * The spy thunks are 003 AC-17's assertion, applied one layer up: the unselected builder
 * is called ZERO times, so the value is never constructed rather than constructed and
 * discarded.
 */
const ADMIN: SessionUser = {
  id: "user_admin",
  email: "admin@macroads.test",
  name: "Fixture Administrator",
  role: "ADMIN",
};

const STAFF: SessionUser = { ...ADMIN, id: "user_staff", role: "YARD_STAFF" };

type Link = { id: string; description: string; sortOrder: number };

const LINKS: Link[] = [
  { id: "item_1", description: "White Extrusion 80/20", sortOrder: 3 },
  { id: "item_2", description: "Yellow Thermo-P", sortOrder: 4 },
];

function toStaffEntry(link: Link) {
  return {
    itemId: link.id,
    description: link.description,
    unitLabel: "20 Kg",
    sortOrder: link.sortOrder,
    linkActive: true,
    itemActive: true,
  };
}

function aPrice() {
  return { unitPrice: "9.83000000", currency: "EUR", effectiveFrom: "2025-01-01" };
}

describe("sheetEntriesForRole", () => {
  it("AC-14: a YARD_STAFF entry has NO currentPrice key at all", () => {
    const entries = sheetEntriesForRole(STAFF, LINKS, toStaffEntry, aPrice);

    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      expect(Object.hasOwn(entry, "currentPrice")).toBe(false);
      expect(Object.keys(entry)).not.toContain("currentPrice");
    }
  });

  it("AC-14: the unselected builder is called ZERO times for a staff actor", () => {
    // 003 AC-17's assertion. "Never constructed" is a stronger thing than "constructed and
    // discarded", and this is the difference between them.
    const buildPrice = vi.fn(aPrice);

    sheetEntriesForRole(STAFF, LINKS, toStaffEntry, buildPrice);

    expect(buildPrice).toHaveBeenCalledTimes(0);
  });

  it("AC-14: an ADMIN entry carries currentPrice, built once per link", () => {
    const buildPrice = vi.fn(aPrice);

    const entries = sheetEntriesForRole(ADMIN, LINKS, toStaffEntry, buildPrice);

    expect(buildPrice).toHaveBeenCalledTimes(2);
    for (const entry of entries) {
      expect(Object.hasOwn(entry, "currentPrice")).toBe(true);
    }
    expect(currentPriceOf(entries[0])).toEqual(aPrice());
  });

  it("AC-14: an item with no price in force still has the KEY for an ADMIN, holding null", () => {
    const entries = sheetEntriesForRole(ADMIN, LINKS, toStaffEntry, () => null);

    expect(Object.hasOwn(entries[0], "currentPrice")).toBe(true);
    expect(currentPriceOf(entries[0])).toBeNull();
  });

  it("AC-14: both shapes carry the same non-money fields, in the same order", () => {
    const staff = sheetEntriesForRole(STAFF, LINKS, toStaffEntry, aPrice);
    const admin = sheetEntriesForRole(ADMIN, LINKS, toStaffEntry, aPrice);

    expect(staff.map((entry) => entry.itemId)).toEqual(admin.map((entry) => entry.itemId));
    expect(staff.map((entry) => entry.description)).toEqual(["White Extrusion 80/20", "Yellow Thermo-P"]);
    expect(staff[0].sortOrder).toBe(3);
  });

  it("AC-17: a staff sheet carries no key matching /price|value|total|amount/i at any depth", () => {
    const entries = sheetEntriesForRole(STAFF, LINKS, toStaffEntry, aPrice);

    const keys = entries.flatMap((entry) => Object.keys(entry));
    expect(keys.filter((key) => /price|value|total|amount/i.test(key))).toEqual([]);
  });

  it("AC-14: an empty sheet is an empty array for either role, and builds nothing", () => {
    const buildPrice = vi.fn(aPrice);

    expect(sheetEntriesForRole(STAFF, [], toStaffEntry, buildPrice)).toEqual([]);
    expect(sheetEntriesForRole(ADMIN, [], toStaffEntry, buildPrice)).toEqual([]);
    expect(buildPrice).toHaveBeenCalledTimes(0);
  });
});

describe("currentPriceOf", () => {
  it("AC-14: a staff entry has no price to read, and reading it is null rather than a throw", () => {
    const [entry] = sheetEntriesForRole(STAFF, LINKS, toStaffEntry, aPrice);

    expect(currentPriceOf(entry)).toBeNull();
  });
});
