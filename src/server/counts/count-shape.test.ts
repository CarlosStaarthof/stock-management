import { describe, expect, it, vi } from "vitest";

import { deepKeys, moneyKeysIn } from "@/lib/money-boundary";
import type { SessionUser } from "@/server/auth/session-user";
import { countForRole } from "@/server/counts/count-shape";
import type { CountForAdmin, CountForStaff } from "@/types/stock-count";

/**
 * Spec 007 AC-16's spy-thunk half and AC-17's key walk, with no database.
 */
const ADMIN: SessionUser = {
  id: "user_admin",
  username: "admin",
  name: "Fixture Administrator",
  role: "ADMIN",
};

const STAFF: SessionUser = { ...ADMIN, id: "user_staff", role: "YARD_STAFF" };

const FOR_STAFF: CountForStaff = {
  countId: "count_1",
  locationCode: "DUBLIN",
  locationName: "Dublin",
  periodKey: "2026-09",
  periodLabel: "September 2026",
  countDate: "2026-09-01",
  status: "DRAFT",
  createdById: "user_staff",
  createdByName: "Jo Byrne",
  lineCount: 82,
  countedLineCount: 0,
  uncountedLineCount: 82,
  lines: [
    {
      itemId: "item_1",
      description: "White Extrusion 80/20",
      unitLabel: "20 Kg",
      // The two fields 008 adds to the line, so the Supplier and Type filters read their
      // values from the count's own lines. Neither names money (008 AC-17, AC-20).
      supplierName: "Kelly",
      typeName: "Thermo-P",
      sortOrder: 3,
      quantity: null,
    },
  ],
};

const FOR_ADMIN: CountForAdmin = { ...FOR_STAFF, itemsWithoutPrice: 11 };

describe("countForRole", () => {
  it("AC-16: a YARD_STAFF result has no itemsWithoutPrice key, and forAdmin runs ZERO times", () => {
    const forStaff = vi.fn(() => FOR_STAFF);
    const forAdmin = vi.fn(() => FOR_ADMIN);

    const result = countForRole(STAFF, forStaff, forAdmin);

    expect(forAdmin).toHaveBeenCalledTimes(0);
    expect(forStaff).toHaveBeenCalledTimes(1);
    expect(Object.hasOwn(result, "itemsWithoutPrice")).toBe(false);
  });

  it("AC-16: an ADMIN result carries itemsWithoutPrice, and forStaff runs ZERO times", () => {
    const forStaff = vi.fn(() => FOR_STAFF);
    const forAdmin = vi.fn(() => FOR_ADMIN);

    const result = countForRole(ADMIN, forStaff, forAdmin);

    expect(forStaff).toHaveBeenCalledTimes(0);
    expect(forAdmin).toHaveBeenCalledTimes(1);
    expect(Object.hasOwn(result, "itemsWithoutPrice")).toBe(true);
    expect((result as CountForAdmin).itemsWithoutPrice).toBe(11);
  });

  it("AC-16, AC-18: the shape comes from actor.role alone and from nothing else", () => {
    // The only argument that decides is one a client cannot set. There is no second
    // parameter here for a query string, a header or a cookie to arrive through.
    expect(countForRole.length).toBe(3);

    const staffWithAdminName = { ...STAFF, name: "ADMIN", username: "admin" };
    const result = countForRole(staffWithAdminName, () => FOR_STAFF, () => FOR_ADMIN);

    expect(Object.hasOwn(result, "itemsWithoutPrice")).toBe(false);
  });

  it("AC-17: the staff shape carries no monetary key at any depth, lines included", () => {
    const result = countForRole(STAFF, () => FOR_STAFF, () => FOR_ADMIN);

    expect(moneyKeysIn(result)).toEqual([]);
    expect(deepKeys(result)).toContain("quantity");
    expect(deepKeys(result)).toContain("sortOrder");
  });

  it("AC-17: the ADMIN shape reports exactly one offender, itemsWithoutPrice, and no other", () => {
    const result = countForRole(ADMIN, () => FOR_STAFF, () => FOR_ADMIN);

    expect(moneyKeysIn(result)).toEqual(["itemsWithoutPrice"]);
  });

  it("AC-15: neither shape names the price column, at any depth", () => {
    for (const actor of [STAFF, ADMIN]) {
      const keys = deepKeys(countForRole(actor, () => FOR_STAFF, () => FOR_ADMIN));
      expect(keys.filter((key) => /unitPrice/.test(key))).toEqual([]);
    }
  });

  it("AC-16: the admin branch may be async, so its extra QUERY is inside it and not merely its key", () => {
    const forAdmin = vi.fn(async () => FOR_ADMIN);

    const staffResult = countForRole(STAFF, async () => FOR_STAFF, forAdmin);

    expect(forAdmin).toHaveBeenCalledTimes(0);
    expect(staffResult).toBeInstanceOf(Promise);
  });
});
