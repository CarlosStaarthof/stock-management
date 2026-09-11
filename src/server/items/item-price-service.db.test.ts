import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import { priceDateAlreadyUsed } from "@/lib/item-master-messages";
import { db } from "@/server/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/server/errors";
import { addPrice, listPrices } from "@/server/items/item-price-service";
import { getItem } from "@/server/items/item-service";
import { resetTestDb } from "@/server/test-db";

import {
  ADMIN,
  makeItem,
  makeItemType,
  makePrice,
  makeSupplier,
  tableCounts,
} from "../../../tests/support/item-master-fixture";

/**
 * Spec 006 AC-13 to AC-16: the price list, which is insert-only.
 */
beforeEach(async () => {
  await resetTestDb();
});

async function anItem(description = "Beads"): Promise<string> {
  const typeId = await makeItemType("BEADS", 1);
  const supplierId = await makeSupplier("Kelly");
  return makeItem({ description, itemTypeId: typeId, supplierId, unitLabel: "20 Kg" });
}

describe("addPrice", () => {
  it("AC-13: changing a price adds a row and leaves the original byte-identical", async () => {
    const itemId = await anItem();
    await makePrice(itemId, "33.09000000", "2025-01-01", "2025 Prices");
    const before = await db.itemPrice.findFirstOrThrow({ where: { itemId } });

    await addPrice(ADMIN, {
      itemId,
      unitPrice: "35.00",
      effectiveFrom: "2026-10-01",
      label: "2026 Prices",
    });

    const rows = await db.itemPrice.findMany({ where: { itemId }, orderBy: { effectiveFrom: "asc" } });
    expect(rows).toHaveLength(2);

    const after = rows[0];
    expect(after.id).toBe(before.id);
    expect(after.unitPrice.toString()).toBe(before.unitPrice.toString());
    expect(after.currency).toBe(before.currency);
    expect(after.effectiveFrom.getTime()).toBe(before.effectiveFrom.getTime());
    expect(after.label).toBe(before.label);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
  });

  it("AC-14: a date the item already has is refused in the service's own words", async () => {
    const itemId = await anItem();
    await makePrice(itemId, "33.09000000", "2026-10-01");

    const error = await addPrice(ADMIN, {
      itemId,
      unitPrice: "35.00",
      effectiveFrom: "2026-10-01",
      label: null,
    }).catch((thrown) => thrown);

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe(priceDateAlreadyUsed("Beads", "2026-10-01"));
    expect((error as ConflictError).message).toContain("Prices are never overwritten");
    for (const forbidden of ["Unique constraint", "P2002", "ItemPrice_itemId_effectiveFrom_key", "prisma"]) {
      expect((error as ConflictError).message).not.toContain(forbidden);
    }

    const rows = await db.itemPrice.findMany({ where: { itemId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].unitPrice.toString()).toBe("33.09");
  });

  it("AC-16: stores 6.11764706 exactly, as EUR, on the date given with no timezone shift", async () => {
    const itemId = await anItem();

    const created = await addPrice(ADMIN, {
      itemId,
      unitPrice: "6.11764706",
      effectiveFrom: "2026-01-01",
      label: null,
    });

    const stored = await db.itemPrice.findUniqueOrThrow({ where: { id: created.id } });
    // The four Clonmel formula prices (=5.2/0.85 and friends) survive intact only because
    // nothing on this path is a JavaScript number (docs/architecture.md).
    expect(stored.unitPrice.toString()).toBe("6.11764706");
    expect(stored.currency).toBe("EUR");
    expect(stored.effectiveFrom.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(created.effectiveFrom).toBe("2026-01-01");
  });

  it("AC-16 failure path: an amount Decimal(18, 8) cannot hold writes nothing", async () => {
    const itemId = await anItem();

    for (const amount of ["", "abc", "-1", "1.234567890", "12345678901.5"]) {
      await expect(
        addPrice(ADMIN, { itemId, unitPrice: amount, effectiveFrom: "2026-01-01", label: null }),
      ).rejects.toBeInstanceOf(ValidationError);
    }

    expect(await db.itemPrice.count()).toBe(0);
  });

  it("AC-14 failure path: a price for an unknown item is a NotFoundError", async () => {
    await expect(
      addPrice(ADMIN, {
        itemId: "item_missing",
        unitPrice: "1.00",
        effectiveFrom: "2026-01-01",
        label: null,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("AC-4: addPrice refuses a YARD_STAFF actor, as a ForbiddenError, and writes nothing", async () => {
    const itemId = await anItem();
    const before = await tableCounts();
    const staff = { ...ADMIN, role: "YARD_STAFF" } as const;
    const input = { itemId, unitPrice: "1.00", effectiveFrom: "2026-01-01", label: null };

    await expect(addPrice(staff, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(addPrice(staff, input)).rejects.toThrow("ADMIN is required for this action");
    await expect(listPrices(staff, itemId)).rejects.toThrow(
      "ADMIN is required for this action",
    );

    expect(await tableCounts()).toEqual(before);
    expect(await db.itemPrice.count()).toBe(0);
  });
});

describe("listPrices and the Current badge", () => {
  it("AC-15: rows are newest first and exactly one is current, chosen by effectiveFrom", async () => {
    const itemId = await anItem();
    await makePrice(itemId, "30.00000000", "2024-01-01", "2024 Prices");
    await makePrice(itemId, "33.09000000", "2025-01-01", "2025 Prices");
    await makePrice(itemId, "35.00000000", "2099-01-01", "future");

    const rows = await listPrices(ADMIN, itemId);
    expect(rows.map((row) => row.effectiveFrom)).toEqual([
      "2099-01-01",
      "2025-01-01",
      "2024-01-01",
    ]);

    const detail = await getItem(ADMIN, itemId, "2026-09-10");
    expect(detail.prices.filter((price) => price.isCurrent).map((price) => price.effectiveFrom)).toEqual(
      ["2025-01-01"],
    );
    expect(detail.currentPrice?.unitPrice).toBe("33.09");
  });

  it("AC-15: a future-only price leaves the item with no current price", async () => {
    const itemId = await anItem();
    await makePrice(itemId, "35.00000000", "2099-01-01");

    const detail = await getItem(ADMIN, itemId, "2026-09-10");

    expect(detail.currentPrice).toBeNull();
    expect(detail.prices).toHaveLength(1);
    expect(detail.prices[0].isCurrent).toBe(false);
    // The item is still flagged as missing nothing: it HAS a price row (AC-18).
    expect(detail.reviewReasons).toEqual([]);
  });
});

describe("AC-13: nothing in this feature updates or deletes an ItemPrice", () => {
  /**
   * `src/server/test-db.ts` empties nine tables between tests and is the one file under
   * `src/` that is not a shipping module: it refuses to run at all unless
   * `npm run test:db` has already proved it is pointed at the test database. Excluding it
   * by NAME rather than by directory keeps the scan exact — a second file appearing here
   * would have to be added deliberately.
   */
  const NOT_A_SHIPPING_MODULE = ["src/server/test-db.ts"];

  /** Tracked and untracked source files under src/ and scripts/, tests excluded. */
  function shippingModules(): string[] {
    const listed = spawnSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "src", "scripts"],
      { encoding: "utf8" },
    );

    return (listed.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((file) => /\.(ts|tsx|mjs|cjs|js)$/.test(file))
      .filter((file) => !/\.test\.ts$/.test(file))
      .filter((file) => !NOT_A_SHIPPING_MODULE.includes(file));
  }

  it("AC-13: no shipping module applies update, upsert or delete to itemPrice", () => {
    const scanned = shippingModules();

    // Non-vacuity: the scan must have seen the module that inserts one.
    expect(scanned).toContain("src/server/items/item-price-service.ts");

    const forbidden = /itemPrice\s*\.\s*(update|updateMany|upsert|delete|deleteMany)\b/;
    const offenders = scanned.filter((file) => forbidden.test(readFileSync(file, "utf8")));

    expect(offenders).toEqual([]);
  });

  it("AC-13: there is no updatePriceAction and no deletePriceAction", () => {
    const actions = readFileSync("src/app/item-master/actions.ts", "utf8");

    expect(actions).toContain("addItemPriceAction");
    expect(actions).not.toContain("updatePriceAction");
    expect(actions).not.toContain("deletePriceAction");
  });

  it("AC-22: no shipping module deletes an ItemLocation either", () => {
    const forbidden = /itemLocation\s*\.\s*(delete|deleteMany)\b/;
    const offenders = shippingModules().filter((file) =>
      forbidden.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
