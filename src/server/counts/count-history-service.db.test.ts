import { beforeEach, describe, expect, it } from "vitest";

import { partitionHeld } from "@/lib/held";
import { assertNoMoneyKeys, deepKeys, moneyKeysIn } from "@/lib/money-boundary";
import { filterCalendarByYard } from "@/lib/stock-takes-view";
import type { SessionUser } from "@/server/auth/session-user";
import {
  findNeighbourCounts,
  getCountHistory,
} from "@/server/counts/count-history-service";
import { getCount, listCalendarMonth } from "@/server/counts/count-service";
import { db } from "@/server/db";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";
import { resetTestDb } from "@/server/test-db";
import { COUNT_STATUSES } from "@/types/stock-count";
import type { CountForAdmin, YardScope } from "@/types/stock-count";

import {
  CLONMEL_ID,
  DUBLIN_ID,
  makeItem,
  makeItemType,
  makeLink,
  makePrice,
  makeSupplier,
  makeUser,
} from "../../../tests/support/item-master-fixture";

/**
 * Spec 010, Level 2 (`docs/verification.md`): the history service against a real Postgres,
 * never a mock. Every test seeds exactly what it needs.
 *
 * IT NAMES NO STATUS PAST `DRAFT` AND NO LIFECYCLE COLUMN, ON PURPOSE. 007 AC-25 as amended
 * by 009 AC-26 holds `src/server/counts/**` — tests included — to an exact list of files
 * that may say those words, and this file is not on it. Where a test needs a submitted or an
 * approved count it reaches one through `COUNT_STATUSES`, which is declared in
 * `src/types/stock-count.ts` for exactly this reason.
 */
beforeEach(async () => {
  await resetTestDb();
});

/** The three lifecycle values, by position, so this file spells only `DRAFT`. */
const [DRAFT, SIGNED_OFF_PENDING, SIGNED_OFF] = COUNT_STATUSES;

/** A `SessionUser` for a row that really exists, so `createdById`'s FK is satisfiable. */
async function newActor(role: "ADMIN" | "YARD_STAFF", name = "Jo Byrne"): Promise<SessionUser> {
  const id = await makeUser(role);
  await db.user.update({ where: { id }, data: { name } });
  const row = await db.user.findUniqueOrThrow({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

function asDate(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

type CountSpec = {
  id?: string;
  locationId?: string;
  countDate: string;
  periodYear?: number;
  periodMonth: number;
  status?: (typeof COUNT_STATUSES)[number];
};

async function makeCount(createdById: string, spec: CountSpec): Promise<string> {
  const count = await db.stockCount.create({
    data: {
      id: spec.id,
      locationId: spec.locationId ?? DUBLIN_ID,
      periodYear: spec.periodYear ?? 2026,
      periodMonth: spec.periodMonth,
      countDate: asDate(spec.countDate),
      status: spec.status ?? DRAFT,
      createdById,
    },
    select: { id: true },
  });
  return count.id;
}

/** One `ItemType`, one `Supplier`, and `count` items linked to Dublin in sheet order. */
async function seedItems(count: number, unitLabel: string | null = "20 Kg"): Promise<string[]> {
  const itemTypeId = await makeItemType("BEADS", 1);
  const supplierId = await makeSupplier("Kelly");

  const itemIds: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const itemId = await makeItem({
      description: `Dublin item ${String(index).padStart(3, "0")}`,
      itemTypeId,
      supplierId,
      unitLabel,
    });
    await makeLink(itemId, DUBLIN_ID, 3 + index);
    itemIds.push(itemId);
  }
  return itemIds;
}

async function makeLines(
  countId: string,
  quantities: readonly (string | null)[],
  itemIds: readonly string[],
): Promise<void> {
  await db.stockCountLine.createMany({
    data: quantities.map((quantity, index) => ({
      stockCountId: countId,
      itemId: itemIds[index],
      quantity,
    })),
  });
}

/** Every row count this feature must be able to prove it did not change (AC-3). */
async function rowCounts(): Promise<Record<string, number>> {
  return {
    stockCount: await db.stockCount.count(),
    stockCountLine: await db.stockCountLine.count(),
    item: await db.item.count(),
    itemPrice: await db.itemPrice.count(),
    itemLocation: await db.itemLocation.count(),
    supplier: await db.supplier.count(),
    itemType: await db.itemType.count(),
    location: await db.location.count(),
    user: await db.user.count(),
  };
}

/* =================================================================== getCountHistory */

describe("getCountHistory", () => {
  it("AC-3: a null actor raises UnauthorizedError before anything is read", async () => {
    const admin = await newActor("ADMIN");
    const itemIds = await seedItems(1);
    const countId = await makeCount(admin.id, { countDate: "2026-09-30", periodMonth: 9 });
    await makeLines(countId, ["5"], itemIds);

    await expect(getCountHistory(null as unknown as SessionUser, countId)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("AC-8: the yard, the period, the date, the status and who counted it", async () => {
    const actor = await newActor("YARD_STAFF", "Ann Doyle");
    const itemIds = await seedItems(2);
    const countId = await makeCount(actor.id, {
      countDate: "2026-10-01",
      periodMonth: 9,
      status: SIGNED_OFF,
    });
    await makeLines(countId, ["21.6128", null], itemIds);

    const view = await getCountHistory(actor, countId);

    expect(view.countId).toBe(countId);
    expect(view.locationCode).toBe("DUBLIN");
    expect(view.locationName).toBe("Dublin");
    // A count dated 1 October closing September: the two are independent facts (Part 4).
    expect(view.countDate).toBe("2026-10-01");
    expect(view.periodKey).toBe("2026-09");
    expect(view.periodLabel).toBe("September 2026");
    expect(view.status).toBe(SIGNED_OFF);
    expect(view.countedByName).toBe("Ann Doyle");
    expect(view.lineCount).toBe(2);
    expect(view.uncountedLineCount).toBe(1);
  });

  it("AC-8: every line comes back, in ItemLocation.sortOrder then description order", async () => {
    const actor = await newActor("YARD_STAFF");
    const itemTypeId = await makeItemType("BEADS", 1);

    // Deliberately created in an order that is neither the sheet order nor alphabetical.
    const middle = await makeItem({ description: "Middle", itemTypeId });
    const first = await makeItem({ description: "Zebra", itemTypeId });
    const last = await makeItem({ description: "Apple", itemTypeId });
    await makeLink(first, DUBLIN_ID, 3);
    await makeLink(middle, DUBLIN_ID, 4);
    await makeLink(last, DUBLIN_ID, 5);

    const countId = await makeCount(actor.id, { countDate: "2026-09-30", periodMonth: 9 });
    await makeLines(countId, ["1", "2", "3"], [middle, first, last]);

    const view = await getCountHistory(actor, countId);

    expect(view.lines.map((line) => line.description)).toEqual(["Zebra", "Middle", "Apple"]);
    expect(view.lines.map((line) => line.sortOrder)).toEqual([3, 4, 5]);

    // The same order `getCount` returns, because this is a mapper over it and not a query.
    const raw = await getCount(actor, countId);
    expect(view.lines.map((line) => line.itemId)).toEqual(raw.lines.map((line) => line.itemId));
  });

  it("AC-8: the quantity is exactly as stored, never rounded", async () => {
    const actor = await newActor("ADMIN");
    const itemIds = await seedItems(3);
    const countId = await makeCount(actor.id, { countDate: "2026-09-30", periodMonth: 9 });
    await makeLines(countId, ["21.6128", "0.475", "1000"], itemIds);

    const view = await getCountHistory(actor, countId);

    // `Decimal(12, 4)` reads back at its own scale; what must never happen is a value
    // losing a digit. 21.6128 tonnes is the workbook's, and it has four of them.
    expect(view.lines[0].quantity).toBe("21.6128");
    expect(view.lines[1].quantity).toBe("0.475");
    for (const line of view.lines) expect(typeof line.quantity).toBe("string");
  });

  it("AC-9: null and 0 survive the read as different facts", async () => {
    const actor = await newActor("YARD_STAFF");
    const itemIds = await seedItems(3);
    const countId = await makeCount(actor.id, { countDate: "2026-09-30", periodMonth: 9 });
    await makeLines(countId, ["7.5", "0", null], itemIds);

    const view = await getCountHistory(actor, countId);

    // Invariant 5, read back: `null` is *nobody looked*, `"0"` is *counted, none held*.
    // #8's whole feature is that distinction, and it has to survive a read.
    expect(view.lines[1].quantity).not.toBeNull();
    expect(view.lines[2].quantity).toBeNull();
    expect(view.lines[1].quantity).toMatch(/^0(\.0+)?$/);
    expect(view.uncountedLineCount).toBe(1);

    // And the held view hides both without merging them.
    const { held, hidden } = partitionHeld(view.lines);
    expect(held).toHaveLength(1);
    expect(hidden.map((line) => line.quantity)).toEqual([view.lines[1].quantity, null]);
  });

  it("AC-9: the held partition over an 82-line count is 47 held and 35 hidden", async () => {
    // The spec's own fixture: 47 held, 23 counted as `0`, 12 never counted — which is the
    // most recent Dublin count's shape, and the reason held-only is the default (Part 5).
    const actor = await newActor("ADMIN");
    const itemIds = await seedItems(82);
    const countId = await makeCount(actor.id, { countDate: "2026-09-30", periodMonth: 9 });

    const quantities: (string | null)[] = [
      ...Array.from({ length: 47 }, (_unused, index) => `${index + 1}.5`),
      ...Array.from({ length: 23 }, () => "0"),
      ...Array.from({ length: 12 }, () => null),
    ];
    await makeLines(countId, quantities, itemIds);

    const view = await getCountHistory(actor, countId);
    const { held, hidden } = partitionHeld(view.lines);

    expect(view.lineCount).toBe(82);
    expect(view.uncountedLineCount).toBe(12);
    expect(held).toHaveLength(47);
    expect(hidden).toHaveLength(35);
  });

  it("AC-8: a line whose item was archived after the count still appears, unchanged", async () => {
    const actor = await newActor("ADMIN");
    const itemIds = await seedItems(2);
    const countId = await makeCount(actor.id, { countDate: "2026-09-30", periodMonth: 9 });
    await makeLines(countId, ["4", "6"], itemIds);

    const before = await getCountHistory(actor, countId);

    // A sheet is what a yard stocks NOW; a count is what it held THEN. Archiving an item
    // must not edit history, which is why this feature never calls `listSheet`.
    await db.item.update({ where: { id: itemIds[0] }, data: { active: false } });
    await db.itemLocation.updateMany({
      where: { itemId: itemIds[0], locationId: DUBLIN_ID },
      data: { active: false },
    });

    const after = await getCountHistory(actor, countId);

    expect(after.lines).toEqual(before.lines);
    expect(after.lines.map((line) => line.itemId)).toContain(itemIds[0]);
    expect(after.lineCount).toBe(2);
  });

  it("AC-8, AC-17: a countId that does not exist is a typed NotFoundError", async () => {
    const actor = await newActor("YARD_STAFF");

    for (const countId of ["count_does_not_exist", "", "not a cuid at all"]) {
      const failure = await getCountHistory(actor, countId).catch((error: unknown) => error);

      expect(failure, countId).toBeInstanceOf(NotFoundError);
      // The feature's own sentence, never a driver string (AC-17).
      expect((failure as Error).message).toBe("That count no longer exists.");
      expect((failure as Error).message).not.toMatch(/prisma|violates|constraint|P20\d\d/i);
    }
  });

  it("AC-12: no monetary key at any depth, for a staff actor AND for an admin", async () => {
    const admin = await newActor("ADMIN");
    const staff = await newActor("YARD_STAFF");
    const itemIds = await seedItems(3);
    await makePrice(itemIds[0], "9.83000000", "2025-01-01", "2025 Prices");
    const countId = await makeCount(admin.id, { countDate: "2026-09-30", periodMonth: 9 });
    await makeLines(countId, ["1", "0", null], itemIds);

    const forStaff = await getCountHistory(staff, countId);
    const forAdmin = await getCountHistory(admin, countId);

    // ZERO OFFENDERS FOR THE ADMIN AS WELL, which is what makes this feature different
    // from every one before it: #7 permitted `itemsWithoutPrice` on this surface.
    expect(moneyKeysIn(forStaff)).toEqual([]);
    expect(moneyKeysIn(forAdmin)).toEqual([]);
    assertNoMoneyKeys(forStaff, "getCountHistory for a staff session");
    assertNoMoneyKeys(forAdmin, "getCountHistory for an administrator");

    // Non-vacuity: the walk really did descend into the lines.
    expect(deepKeys(forAdmin)).toContain("quantity");
  });

  it("AC-12, AC-13: the two roles get deeply equal values, and one shape", async () => {
    const admin = await newActor("ADMIN");
    const staff = await newActor("YARD_STAFF");
    const itemIds = await seedItems(2);
    const countId = await makeCount(admin.id, { countDate: "2026-09-30", periodMonth: 9 });
    await makeLines(countId, ["12.5", null], itemIds);

    const forStaff = await getCountHistory(staff, countId);
    const forAdmin = await getCountHistory(admin, countId);

    expect(forAdmin).toEqual(forStaff);
    expect(Object.keys(forAdmin)).toEqual(Object.keys(forStaff));
  });

  it("AC-13: the SERVICE drops itemsWithoutPrice, not the page", async () => {
    const admin = await newActor("ADMIN");
    const itemIds = await seedItems(2);
    const countId = await makeCount(admin.id, { countDate: "2026-09-30", periodMonth: 9 });
    await makeLines(countId, ["3", "4"], itemIds);

    const view = await getCountHistory(admin, countId);

    expect(Object.hasOwn(view, "itemsWithoutPrice")).toBe(false);

    // And the thing it dropped really was there: `getCount` hands an administrator a key
    // that matches /price/i, and the mapper is what removes it. Without this half the
    // assertion above would pass against a shape that never carried it.
    const raw = (await getCount(admin, countId)) as CountForAdmin;
    expect(Object.hasOwn(raw, "itemsWithoutPrice")).toBe(true);
    expect(moneyKeysIn(raw)).not.toEqual([]);

    // The page could not have done it: nothing below `createdById` survives the mapper
    // either, so the discarded keys are exactly the ones this shape does not declare.
    expect(Object.hasOwn(view, "createdById")).toBe(false);
    expect(Object.hasOwn(view, "countedLineCount")).toBe(false);
  });

  it("AC-3: reading a count changes no row and no column of it", async () => {
    const admin = await newActor("ADMIN");
    const staff = await newActor("YARD_STAFF");
    const itemIds = await seedItems(4);
    const countId = await makeCount(admin.id, {
      countDate: "2026-09-30",
      periodMonth: 9,
      status: SIGNED_OFF_PENDING,
    });
    await makeLines(countId, ["1", "0", null, "2.5"], itemIds);

    const rowsBefore = await rowCounts();
    const countBefore = await db.stockCount.findUniqueOrThrow({ where: { id: countId } });
    const linesBefore = await db.stockCountLine.findMany({
      where: { stockCountId: countId },
      orderBy: { itemId: "asc" },
    });

    await getCountHistory(admin, countId);
    await getCountHistory(staff, countId);
    await findNeighbourCounts(staff, "BOTH", { date: "2026-09-30", countId });

    expect(await rowCounts()).toEqual(rowsBefore);
    expect(await db.stockCount.findUniqueOrThrow({ where: { id: countId } })).toEqual(countBefore);
    expect(
      await db.stockCountLine.findMany({
        where: { stockCountId: countId },
        orderBy: { itemId: "asc" },
      }),
    ).toEqual(linesBefore);
  });
});

/* =============================================================== findNeighbourCounts */

describe("findNeighbourCounts", () => {
  /**
   * AC-11's own fixture: Dublin counts dated `2026-01-31`, `2026-04-30` and `2026-05-31`,
   * and one Clonmel count dated `2026-03-31`. February and March hold no Dublin count at
   * all, which is the workbook's shape — it skips July and August 2025 entirely.
   */
  async function seedNeighbours(): Promise<{
    actor: SessionUser;
    dublinJanuary: string;
    dublinApril: string;
    dublinMay: string;
    clonmelMarch: string;
  }> {
    const actor = await newActor("ADMIN");

    const dublinJanuary = await makeCount(actor.id, { countDate: "2026-01-31", periodMonth: 1 });
    const clonmelMarch = await makeCount(actor.id, {
      locationId: CLONMEL_ID,
      countDate: "2026-03-31",
      periodMonth: 3,
    });
    const dublinApril = await makeCount(actor.id, { countDate: "2026-04-30", periodMonth: 4 });
    const dublinMay = await makeCount(actor.id, { countDate: "2026-05-31", periodMonth: 5 });

    return { actor, dublinJanuary, dublinApril, dublinMay, clonmelMarch };
  }

  it("AC-3: a null actor raises UnauthorizedError", async () => {
    await expect(
      findNeighbourCounts(null as unknown as SessionUser, "BOTH", {
        date: "2026-04-01",
        countId: null,
      }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("AC-11: the calendar cursor skips the months nobody counted at that yard", async () => {
    const { actor, dublinJanuary } = await seedNeighbours();

    // The calendar's cursor is the displayed month: the first day for *Previous count*.
    const { previous } = await findNeighbourCounts(actor, "DUBLIN", {
      date: "2026-04-01",
      countId: null,
    });

    expect(previous?.countId).toBe(dublinJanuary);
    // THREE MONTHS BACK, skipping the two nobody counted at Dublin.
    expect(previous?.monthKey).toBe("2026-01");
    expect(previous?.locationCode).toBe("DUBLIN");
  });

  it("AC-11: the same cursor under BOTH lands on the Clonmel count in March", async () => {
    const { actor, clonmelMarch } = await seedNeighbours();

    const { previous } = await findNeighbourCounts(actor, "BOTH", {
      date: "2026-04-01",
      countId: null,
    });

    expect(previous?.countId).toBe(clonmelMarch);
    expect(previous?.monthKey).toBe("2026-03");
    expect(previous?.locationCode).toBe("CLONMEL");
  });

  it("AC-11: next is the earliest count strictly after the month's last day", async () => {
    const { actor, dublinMay } = await seedNeighbours();

    // The count ON the last day is not its own neighbour: the comparison is strict.
    const { next } = await findNeighbourCounts(actor, "DUBLIN", {
      date: "2026-04-30",
      countId: null,
    });

    expect(next?.countId).toBe(dublinMay);
    expect(next?.monthKey).toBe("2026-05");
  });

  it("AC-11: on the detail the jumps are same-yard, whatever the calendar scope said", async () => {
    const { actor, dublinJanuary, dublinApril, dublinMay } = await seedNeighbours();

    const { previous, next } = await findNeighbourCounts(actor, "DUBLIN", {
      date: "2026-04-30",
      countId: dublinApril,
    });

    // NOT the 2026-03-31 Clonmel count: Clonmel's stock is different stock, and a jump
    // that crossed yards would invite exactly the comparison Part 4 forbids.
    expect(previous?.countId).toBe(dublinJanuary);
    expect(next?.countId).toBe(dublinMay);
  });

  it("AC-11: where there is no neighbour the answer is null, at both ends", async () => {
    const { actor, dublinJanuary, dublinMay } = await seedNeighbours();

    const earliest = await findNeighbourCounts(actor, "DUBLIN", {
      date: "2026-01-31",
      countId: dublinJanuary,
    });
    const latest = await findNeighbourCounts(actor, "DUBLIN", {
      date: "2026-05-31",
      countId: dublinMay,
    });

    expect(earliest.previous).toBeNull();
    expect(earliest.next).not.toBeNull();
    expect(latest.next).toBeNull();
    expect(latest.previous).not.toBeNull();
  });

  it("AC-11: a yard with no counts at all has no neighbours in either direction", async () => {
    const { actor } = await seedNeighbours();

    const clonmel = await findNeighbourCounts(actor, "CLONMEL", {
      date: "2026-03-31",
      countId: null,
    });

    expect(clonmel.previous).toBeNull();
    expect(clonmel.next).toBeNull();
  });

  it("AC-11: two counts at one yard sharing a countDate are reachable exactly once", async () => {
    const actor = await newActor("ADMIN");

    // `@@unique([locationId, periodYear, periodMonth])` permits September and October both
    // walked on 1 October, so `countDate` alone is not a deterministic ordering. `id` is.
    const earlierId = "count_tie_a";
    const laterId = "count_tie_b";
    await makeCount(actor.id, { id: laterId, countDate: "2026-10-01", periodMonth: 10 });
    await makeCount(actor.id, { id: earlierId, countDate: "2026-10-01", periodMonth: 9 });

    const fromEarlier = await findNeighbourCounts(actor, "DUBLIN", {
      date: "2026-10-01",
      countId: earlierId,
    });
    const fromLater = await findNeighbourCounts(actor, "DUBLIN", {
      date: "2026-10-01",
      countId: laterId,
    });

    // Neither is its own neighbour, and each reaches the other exactly once.
    expect(fromEarlier.next?.countId).toBe(laterId);
    expect(fromEarlier.previous).toBeNull();
    expect(fromLater.previous?.countId).toBe(earlierId);
    expect(fromLater.next).toBeNull();
  });

  it("AC-11: a CountRef carries the month it SITS in and the month it CLOSES", async () => {
    const actor = await newActor("ADMIN");
    const target = await makeCount(actor.id, {
      countDate: "2026-10-01",
      periodMonth: 9,
      status: SIGNED_OFF,
    });
    await makeCount(actor.id, { countDate: "2026-11-30", periodMonth: 11 });

    const { previous } = await findNeighbourCounts(actor, "DUBLIN", {
      date: "2026-11-30",
      countId: null,
    });

    expect(previous?.countId).toBe(target);
    // 007 AC-20: the count is DRAWN in October and CLOSES September, so a jump that moved
    // by period would land on a month the count is not on.
    expect(previous?.monthKey).toBe("2026-10");
    expect(previous?.periodKey).toBe("2026-09");
    expect(previous?.countDate).toBe("2026-10-01");
    expect(previous?.status).toBe(SIGNED_OFF);
    expect(previous?.locationName).toBe("Dublin");
  });

  it("AC-17: a cursor date that is not a real day is a typed ValidationError", async () => {
    const { actor } = await seedNeighbours();

    for (const date of ["banana", "2026-02-30", "", "2026-13-01"]) {
      const failure = await findNeighbourCounts(actor, "DUBLIN", { date, countId: null }).catch(
        (error: unknown) => error,
      );

      expect(failure, date).toBeInstanceOf(ValidationError);
      expect((failure as Error).message, date).not.toMatch(/prisma|violates|constraint/i);
    }
  });

  it("AC-12: the neighbours carry no monetary key, for either role, and are deeply equal", async () => {
    const { dublinApril } = await seedNeighbours();
    const staff = await newActor("YARD_STAFF");
    const admin = await newActor("ADMIN");

    const cursor = { date: "2026-04-30", countId: dublinApril };
    const forStaff = await findNeighbourCounts(staff, "BOTH", cursor);
    const forAdmin = await findNeighbourCounts(admin, "BOTH", cursor);

    expect(moneyKeysIn(forStaff)).toEqual([]);
    expect(moneyKeysIn(forAdmin)).toEqual([]);
    assertNoMoneyKeys(forAdmin, "findNeighbourCounts for an administrator");
    expect(forAdmin).toEqual(forStaff);

    // Non-vacuity: there really was something either side of the cursor to walk.
    expect(forAdmin.previous).not.toBeNull();
    expect(forAdmin.next).not.toBeNull();
  });
});

/* ================================================ the scoped calendar, end to end */

describe("AC-4, AC-7, AC-12: the scoped calendar over one unchanged query", () => {
  async function seedTwoYards(actor: SessionUser): Promise<void> {
    await makeCount(actor.id, { countDate: "2026-04-30", periodMonth: 4 });
    await makeCount(actor.id, {
      locationId: CLONMEL_ID,
      countDate: "2026-04-30",
      periodMonth: 4,
    });
    await makeCount(actor.id, {
      locationId: CLONMEL_ID,
      countDate: "2026-04-14",
      periodMonth: 3,
    });
  }

  it("AC-7: the scope filter over listCalendarMonth answers the three scopes", async () => {
    const actor = await newActor("ADMIN");
    await seedTwoYards(actor);

    const month = await listCalendarMonth(actor, "2026-04");

    expect(filterCalendarByYard(month, "DUBLIN").countsInMonth).toBe(1);
    expect(filterCalendarByYard(month, "CLONMEL").countsInMonth).toBe(2);
    expect(filterCalendarByYard(month, "BOTH")).toEqual(month);
  });

  it("AC-6: on a day only Clonmel was counted, DUBLIN leaves the cell plain", async () => {
    const actor = await newActor("ADMIN");
    await seedTwoYards(actor);

    const month = await listCalendarMonth(actor, "2026-04");
    const dayOf = (scope: YardScope, date: string) =>
      filterCalendarByYard(month, scope).days.find((day) => day.date === date);

    expect(dayOf("BOTH", "2026-04-14")?.counts).toHaveLength(1);
    expect(dayOf("CLONMEL", "2026-04-14")?.counts).toHaveLength(1);
    expect(dayOf("DUBLIN", "2026-04-14")?.counts).toEqual([]);

    // And on a day both were counted, Dublin comes before Clonmel — `Location.sortOrder`,
    // decided once in `listCalendarMonth` and not re-decided by the filter.
    expect(dayOf("BOTH", "2026-04-30")?.counts.map((badge) => badge.locationCode)).toEqual([
      "DUBLIN",
      "CLONMEL",
    ]);
  });

  it("AC-12: the scoped month carries no monetary key, for either role, and is equal", async () => {
    const admin = await newActor("ADMIN");
    const staff = await newActor("YARD_STAFF");
    await seedTwoYards(admin);

    for (const scope of ["DUBLIN", "CLONMEL", "BOTH"] as const) {
      const forStaff = filterCalendarByYard(await listCalendarMonth(staff, "2026-04"), scope);
      const forAdmin = filterCalendarByYard(await listCalendarMonth(admin, "2026-04"), scope);

      expect(moneyKeysIn(forStaff), scope).toEqual([]);
      expect(moneyKeysIn(forAdmin), scope).toEqual([]);
      expect(forAdmin, scope).toEqual(forStaff);
    }

    // Non-vacuity: the walk descended into `days[].counts[]`.
    expect(deepKeys(filterCalendarByYard(await listCalendarMonth(admin, "2026-04"), "BOTH"))).toContain(
      "countId",
    );
  });
});
