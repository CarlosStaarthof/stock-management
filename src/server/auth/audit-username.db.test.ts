import { beforeEach, describe, expect, it } from "vitest";

import { parseAuditLines } from "@/lib/count-audit";
import { approveCount, submitCount } from "@/server/counts/count-lifecycle-service";
import { startCount } from "@/server/counts/count-service";
import { db } from "@/server/db";
import { resetTestDb } from "@/server/test-db";

import { actorFor, countRowOf } from "../../../tests/support/count-fixture";
import {
  DUBLIN_ID,
  fixtureId,
  makeItemType,
  makeItemsBulk,
  makeLinksBulk,
  makePricesBulk,
  makeSupplier,
} from "../../../tests/support/item-master-fixture";

/**
 * 021 AC-38's database half: approving a count writes a line whose bracketed reference is
 * the approving profile's USERNAME (S13) — unique, never reissued, and readable.
 */
const SIGNATURE = "M 10 10 L 20 20 L 30 40 M 100 100 L 120 130";

beforeEach(async () => {
  await resetTestDb();
});

describe("021 AC-38: audit lines name a username", () => {
  it("AC-38: the APPROVED line carries the approving profile's username in the brackets", async () => {
    const typeId = await makeItemType("BEADS", 1, "Beads");
    const supplierId = await makeSupplier("Kelly");
    const itemIds = [fixtureId("item", 0), fixtureId("item", 1)];
    await makeItemsBulk(
      itemIds.map((id, index) => ({
        id,
        description: `Item ${index}`,
        itemTypeId: typeId,
        supplierId,
        unitLabel: "20 Kg",
      })),
    );
    await makeLinksBulk(
      itemIds.map((itemId, index) => ({ itemId, locationId: DUBLIN_ID, sortOrder: 3 + index })),
    );
    await makePricesBulk(
      itemIds.map((itemId) => ({ itemId, amount: "9.83", effectiveFrom: "2025-01-01" })),
    );
    const staff = await actorFor("YARD_STAFF", "Jo Byrne");
    const admin = await actorFor("ADMIN", "Ann Doyle");
    const countId = await startCount(staff, {
      locationCode: "DUBLIN",
      countDate: "2026-06-15",
      period: "2026-06",
    });
    await db.stockCountLine.updateMany({ where: { stockCountId: countId }, data: { quantity: "5" } });
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    await approveCount(admin, countId);

    const notes = (await countRowOf(countId)).notes as string;
    const approved = parseAuditLines(notes).filter((entry) => entry.event === "APPROVED");
    expect(approved).toHaveLength(1);
    expect(approved[0]?.actorRef).toBe(admin.username);
    expect(admin.username).toMatch(/^[a-z][a-z0-9._-]{2,31}$/);
    expect(notes).toContain(`<${admin.username}>`);
  });
});
