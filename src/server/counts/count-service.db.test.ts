import { beforeEach, describe, expect, it } from "vitest";

import { assertNoMoneyKeys, deepKeys, moneyKeysIn } from "@/lib/money-boundary";
import type { SessionUser } from "@/server/auth/session-user";
import {
  defaultMonthKey,
  findCountForPeriod,
  getCount,
  listCalendarMonth,
  listCountableYards,
  startCount,
} from "@/server/counts/count-service";
import { db } from "@/server/db";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";
import { listSheet } from "@/server/items/item-assignment-service";
import { resetTestDb } from "@/server/test-db";
import type { CountForAdmin } from "@/types/stock-count";

import {
  CLONMEL_ID,
  DUBLIN_ID,
  fixtureId,
  makeItemType,
  makeItemsBulk,
  makeLinksBulk,
  makePrice,
  makeSupplier,
  makeUser,
  tableCounts,
} from "../../../tests/support/item-master-fixture";

/**
 * Spec 007, Level 2 (`docs/verification.md`): the count service against a real Postgres,
 * never a mock. Every test seeds exactly what it needs.
 */
beforeEach(async () => {
  await resetTestDb();
});

const DUBLIN_LINKS = 82;
const CLONMEL_LINKS = 70;

/**
 * The mechanism AC-13's atomicity test uses: a constraint no `StockCountLine` insert can
 * satisfy, added for the duration of one `startCount` call and dropped in a `finally`.
 *
 * `NOT VALID` skips the scan of existing rows — there are none — while still enforcing the
 * check on every INSERT, which is the write that has to fail. The name is spelled the same
 * in both statements and nowhere else in the schema.
 */
const ADD_UNSATISFIABLE_LINE_CHECK =
  'ALTER TABLE "StockCountLine" ADD CONSTRAINT "tmp_ac13_line_write_fails" CHECK (false) NOT VALID';
const DROP_UNSATISFIABLE_LINE_CHECK =
  'ALTER TABLE "StockCountLine" DROP CONSTRAINT IF EXISTS "tmp_ac13_line_write_fails"';

/** The "it did not throw" sentinel, so the assertion can happen after the constraint is gone. */
const RESOLVED = Symbol("startCount resolved");

/** A `SessionUser` for a row that really exists, so `createdById`'s FK is satisfiable. */
async function newActor(role: "ADMIN" | "YARD_STAFF", name = "Jo Byrne"): Promise<SessionUser> {
  const id = await makeUser(role);
  await db.user.update({ where: { id }, data: { name } });
  const row = await db.user.findUniqueOrThrow({
    where: { id },
    select: { id: true, username: true, name: true, role: true },
  });
  return { id: row.id, username: row.username ?? "", name: row.name, role: row.role };
}

/**
 * Today's master, reproduced: 82 active Dublin links and 70 active Clonmel links — the 152
 * the workbook importer wrote (AC-12). `pricedCount` of the Dublin items carry a price.
 */
async function seedMaster(options: { pricedDublinItems?: number } = {}): Promise<{
  dublinItemIds: string[];
  clonmelItemIds: string[];
}> {
  const typeId = await makeItemType("BEADS", 1);
  const supplierId = await makeSupplier("Kelly");

  const dublinItemIds = Array.from({ length: DUBLIN_LINKS }, (_unused, index) =>
    fixtureId("item_dub", index),
  );
  const clonmelItemIds = Array.from({ length: CLONMEL_LINKS }, (_unused, index) =>
    fixtureId("item_clo", index),
  );

  await makeItemsBulk([
    ...dublinItemIds.map((id, index) => ({
      id,
      description: `Dublin item ${String(index).padStart(3, "0")}`,
      itemTypeId: typeId,
      supplierId,
      unitLabel: "20 Kg",
    })),
    ...clonmelItemIds.map((id, index) => ({
      id,
      description: `Clonmel item ${String(index).padStart(3, "0")}`,
      itemTypeId: typeId,
      supplierId,
      unitLabel: "25 Kg",
    })),
  ]);

  await makeLinksBulk([
    // Dublin's imported links start at 3, which is the workbook's own source row number.
    ...dublinItemIds.map((itemId, index) => ({ itemId, locationId: DUBLIN_ID, sortOrder: 3 + index })),
    ...clonmelItemIds.map((itemId, index) => ({ itemId, locationId: CLONMEL_ID, sortOrder: 3 + index })),
  ]);

  const priced = options.pricedDublinItems ?? DUBLIN_LINKS;
  for (const itemId of dublinItemIds.slice(0, priced)) {
    await makePrice(itemId, "9.83000000", "2025-01-01", "2025 Prices");
  }

  return { dublinItemIds, clonmelItemIds };
}

/** The three strings the confirm form sends. */
function startInput(locationCode: string, countDate: string, period: string) {
  return { locationCode, countDate, period };
}

/* ------------------------------------------------------------------------ AC-4 */

describe("the actor is the session, and a null one writes nothing", () => {
  it("AC-4: every exported function called with a null actor raises UnauthorizedError", async () => {
    await seedMaster();
    const nobody = null as unknown as SessionUser;

    const calls: [string, () => Promise<unknown>][] = [
      ["listCalendarMonth", () => listCalendarMonth(nobody, "2026-09")],
      ["defaultMonthKey", () => defaultMonthKey(nobody)],
      ["listCountableYards", () => listCountableYards(nobody)],
      [
        "findCountForPeriod",
        () => findCountForPeriod(nobody, "DUBLIN", { periodYear: 2026, periodMonth: 9 }),
      ],
      ["startCount", () => startCount(nobody, startInput("DUBLIN", "2026-09-01", "2026-09"))],
      ["getCount", () => getCount(nobody, "count_nothing")],
    ];

    expect(calls).toHaveLength(6);
    for (const [name, call] of calls) {
      await expect(call(), name).rejects.toBeInstanceOf(UnauthorizedError);
    }

    expect(await db.stockCount.count()).toBe(0);
    expect(await db.stockCountLine.count()).toBe(0);
  });

  it("AC-4: createdById is the actor's own id, whatever else was passed alongside", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF", "Jo Byrne");
    const admin = await newActor("ADMIN", "An Administrator");

    // The service takes three strings and an actor. There is no field on `StartCountInput`
    // an attacker could put `createdById` in - which is AC-4's point, made at the type.
    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    const row = await db.stockCount.findUniqueOrThrow({
      where: { id: countId },
      select: { createdById: true },
    });
    expect(row.createdById).toBe(staff.id);
    expect(row.createdById).not.toBe(admin.id);
    expect((await getCount(staff, countId)).createdByName).toBe("Jo Byrne");
  });
});

/* ----------------------------------------------------------------- AC-12, AC-13 */

describe("startCount pre-populates from listSheet", () => {
  it("AC-12: a Dublin count has 82 lines and a Clonmel count 70, and the itemIds are the sheet's", async () => {
    const { dublinItemIds, clonmelItemIds } = await seedMaster();
    const staff = await newActor("YARD_STAFF");

    const dublinId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));
    const clonmelId = await startCount(staff, startInput("CLONMEL", "2026-09-01", "2026-09"));

    const dublinLines = await db.stockCountLine.findMany({
      where: { stockCountId: dublinId },
      select: { itemId: true },
    });
    const clonmelLines = await db.stockCountLine.findMany({
      where: { stockCountId: clonmelId },
      select: { itemId: true },
    });

    expect(dublinLines).toHaveLength(82);
    expect(clonmelLines).toHaveLength(70);
    expect(new Set(dublinLines.map((line) => line.itemId))).toEqual(new Set(dublinItemIds));
    expect(new Set(clonmelLines.map((line) => line.itemId))).toEqual(new Set(clonmelItemIds));
  });

  it("AC-12, AC-15: every created line is quantity null, snapshot null and note null", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    const lines = await db.stockCountLine.findMany({
      where: { stockCountId: countId },
      select: { quantity: true, unitPriceSnapshot: true, note: true },
    });

    expect(lines).toHaveLength(82);
    for (const line of lines) {
      // Invariant 5: NULL is *not counted*. `0` means counted and none held, and only a
      // human writes it, in #8.
      expect(line.quantity).toBeNull();
      // Invariant 2: written once, at submit. #9 is still the first writer of it.
      expect(line.unitPriceSnapshot).toBeNull();
      expect(line.note).toBeNull();
    }
  });

  it("AC-12: the count reproduces listSheet's order element for element", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");
    const sheet = await listSheet(staff, "DUBLIN");

    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));
    const count = await getCount(staff, countId);

    expect(count.lines.map((line) => line.itemId)).toEqual(sheet.map((entry) => entry.itemId));
    expect(count.lines.map((line) => line.sortOrder)).toEqual(sheet.map((entry) => entry.sortOrder));
  });

  it("AC-12: an archived item and an unassigned link are absent from a NEW count", async () => {
    const { dublinItemIds } = await seedMaster();
    const staff = await newActor("YARD_STAFF");

    await db.item.update({ where: { id: dublinItemIds[10] }, data: { active: false } });
    await db.itemLocation.updateMany({
      where: { itemId: dublinItemIds[20], locationId: DUBLIN_ID },
      data: { active: false },
    });

    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));
    const lines = await db.stockCountLine.findMany({
      where: { stockCountId: countId },
      select: { itemId: true },
    });

    expect(lines).toHaveLength(80);
    const present = new Set(lines.map((line) => line.itemId));
    expect(present.has(dublinItemIds[10])).toBe(false);
    expect(present.has(dublinItemIds[20])).toBe(false);
  });

  /**
   * AC-13, clause 1. THE FAILURE HAPPENS INSIDE `startCount`, NOT INSIDE A COPY OF IT.
   *
   * A CHECK that can never hold is put on `StockCountLine` for the duration of ONE call, so
   * the real function gets past its guards, creates the count row, and then fails on the
   * `createMany` — its SECOND write, the one inside `db.$transaction`. "Zero `StockCount`
   * rows afterwards" is therefore a statement about `src/server/counts/count-service.ts`
   * and about nothing else: remove the `$transaction` wrapper there and this test goes red.
   *
   * It is deterministic and mock-free, which is what `docs/verification.md` asks for: no
   * race decides the outcome and no part of Prisma is stubbed.
   *
   * NOTE ON THE CONCURRENCY TEST BELOW: it does NOT cover this clause, and an earlier
   * comment here claimed it did. The loser of that race fails on `tx.stockCount.create`,
   * the FIRST statement of the transaction, so no line write is ever attempted and its
   * `82 lines and not 164` would hold for a non-transactional implementation too. What it
   * proves is AC-10 — one row per yard and period under a race — which is its own claim.
   *
   * THE DROP RUNS IN A `finally`, AND AGAIN BEFORE THE ADD. A constraint left behind by a
   * crashed run would fail every line write on the test branch from then on, and
   * `resetTestDb()` deletes rows, not DDL.
   */
  it("AC-13: startCount itself, failed at the LINE write, leaves zero counts", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");
    const input = startInput("DUBLIN", "2026-09-01", "2026-09");
    const where = { locationId: DUBLIN_ID, periodYear: 2026, periodMonth: 9 };

    // A sentinel rather than `rejects`, so the constraint is dropped before anything can
    // assert and fail while it is still in place.
    let outcome: unknown = RESOLVED;

    await db.$executeRawUnsafe(DROP_UNSATISFIABLE_LINE_CHECK);
    try {
      await db.$executeRawUnsafe(ADD_UNSATISFIABLE_LINE_CHECK);
      try {
        await startCount(staff, input);
      } catch (error) {
        outcome = error;
      }
    } finally {
      await db.$executeRawUnsafe(DROP_UNSATISFIABLE_LINE_CHECK);
    }

    expect(outcome, "startCount resolved though its line write could not succeed").not.toBe(
      RESOLVED,
    );
    // It reached the write: this is not the empty-sheet, unknown-yard or already-exists
    // refusal, each of which returns before any row is created.
    expect(outcome).not.toBeInstanceOf(ValidationError);
    expect(outcome).not.toBeInstanceOf(NotFoundError);
    expect(outcome).not.toBeInstanceOf(ConflictError);

    // The count row WAS created inside the transaction, and went back with it.
    expect(await db.stockCount.count({ where })).toBe(0);
    expect(await db.stockCount.count()).toBe(0);
    expect(await db.stockCountLine.count()).toBe(0);

    // Non-vacuity: the identical call succeeds now the constraint is gone, so what failed
    // was the line write and nothing before it — and the table is left usable.
    const countId = await startCount(staff, input);
    expect(await db.stockCount.count({ where })).toBe(1);
    expect(await db.stockCountLine.count({ where: { stockCountId: countId } })).toBe(82);
  });

  it("AC-13: a yard whose sheet is empty is refused before anything is written", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    // Clonmel emptied: every link inactive. Nothing is deleted, so this is the state an
    // administrator can really leave a yard in.
    await db.itemLocation.updateMany({ where: { locationId: CLONMEL_ID }, data: { active: false } });

    try {
      await startCount(staff, startInput("CLONMEL", "2026-09-01", "2026-09"));
      expect.unreachable("an empty sheet cannot be counted");
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).field).toBe("locationCode");
      expect((error as ValidationError).message).toBe(
        "Clonmel has no items on its sheet. An administrator must assign items before this yard can be counted.",
      );
    }

    expect(await db.stockCount.count()).toBe(0);
  });

  it("AC-13: every item archived is the same refusal as no links at all", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");
    await db.item.updateMany({ where: { locations: { some: { locationId: CLONMEL_ID } } }, data: { active: false } });

    await expect(
      startCount(staff, startInput("CLONMEL", "2026-09-01", "2026-09")),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await db.stockCount.count()).toBe(0);
  });

  it("AC-13: an unknown locationCode is a NotFoundError naming the code, and writes nothing", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    await expect(
      startCount(staff, startInput("BANANA", "2026-09-01", "2026-09")),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(startCount(staff, startInput("BANANA", "2026-09-01", "2026-09"))).rejects.toThrow(
      "No yard with code BANANA.",
    );
    expect(await db.stockCount.count()).toBe(0);
  });

  it("AC-32: the master data is untouched by starting a count", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");
    const before = await tableCounts();
    const locationsBefore = await db.location.count();

    await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    expect(await tableCounts()).toEqual(before);
    expect(await db.location.count()).toBe(locationsBefore);
  });
});

/* ------------------------------------------------------------------ AC-7, AC-8 */

describe("the period is a fact of its own", () => {
  it("AC-7: the derived period is what an unchanged form writes", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    const countId = await startCount(staff, startInput("DUBLIN", "2026-10-01", "2026-09"));

    const row = await db.stockCount.findUniqueOrThrow({
      where: { id: countId },
      select: { periodYear: true, periodMonth: true, countDate: true },
    });
    expect(row.periodYear).toBe(2026);
    expect(row.periodMonth).toBe(9);
    expect(row.countDate.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("AC-8: the override is honoured, and the date and the period stay two separate facts", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    const countId = await startCount(staff, startInput("DUBLIN", "2026-10-01", "2026-10"));
    const count = await getCount(staff, countId);

    expect(count.periodKey).toBe("2026-10");
    expect(count.periodLabel).toBe("October 2026");
    expect(count.countDate).toBe("2026-10-01");
  });

  it("AC-8: a period at any distance from the date is created exactly as asked", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    // The workbook holds a count dated 2026-12-31 that belongs to 2025-12 (open question 3).
    const countId = await startCount(staff, startInput("DUBLIN", "2026-10-01", "2025-12"));
    const count = await getCount(staff, countId);

    expect(count.periodKey).toBe("2025-12");
    expect(count.countDate).toBe("2026-10-01");
  });

  it("AC-8: a period outside the range writes nothing and never reaches the CHECK", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    for (const bad of ["2026-13", "2026-00", "1999-12", "2101-01", "banana"]) {
      try {
        await startCount(staff, startInput("DUBLIN", "2026-10-01", bad));
        expect.unreachable(`${bad} is not a period`);
      } catch (error) {
        expect(error, bad).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).field, bad).toBe("period");
        expect((error as ValidationError).message, bad).toBe(
          "Period must be a month between 2000 and 2100.",
        );
        expect((error as ValidationError).message, bad).not.toMatch(
          /StockCount_periodMonth_range|violates|check constraint|23514/i,
        );
      }
    }

    expect(await db.stockCount.count()).toBe(0);
  });

  it("AC-9: there is no business-day rule — a Saturday and a Sunday are created plainly", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    // 2026-01-03 is a Saturday; 2025-11-30 is a Sunday.
    const saturday = await startCount(staff, startInput("DUBLIN", "2026-01-03", "2025-12"));
    const sunday = await startCount(staff, startInput("CLONMEL", "2025-11-30", "2025-11"));

    expect((await getCount(staff, saturday)).countDate).toBe("2026-01-03");
    expect((await getCount(staff, sunday)).countDate).toBe("2025-11-30");
  });

  it("AC-31: a countDate reads back as the day it was given, whatever the machine's TZ", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    const original = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));
      const row = await db.stockCount.findUniqueOrThrow({
        where: { id: countId },
        select: { countDate: true },
      });

      // 004 AC-22: a `@db.Date` column is UTC midnight, and that is the whole of it.
      expect(row.countDate.toISOString().slice(0, 10)).toBe("2026-09-01");
      expect((await getCount(staff, countId)).countDate).toBe("2026-09-01");
    } finally {
      process.env.TZ = original;
    }
  });
});

/* ----------------------------------------------------------------- AC-10, AC-11 */

describe("one count per yard per month", () => {
  it("AC-10: a second count for the same yard and period is refused in the domain's words", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    const firstId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));
    const before = await db.stockCount.findUniqueOrThrow({
      where: { id: firstId },
      select: { id: true, countDate: true, status: true },
    });
    const linesBefore = await db.stockCountLine.count({ where: { stockCountId: firstId } });

    try {
      await startCount(staff, startInput("DUBLIN", "2026-09-15", "2026-09"));
      expect.unreachable("a second count for the same period is refused");
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).message).toBe("Count for DUBLIN in 2026-09 already exists");
      expect((error as ConflictError).message).not.toMatch(
        /Unique constraint|P2002|StockCount_locationId_periodYear_periodMonth_key|prisma|constraint/i,
      );
    }

    expect(await db.stockCount.count()).toBe(1);
    expect(await db.stockCountLine.count({ where: { stockCountId: firstId } })).toBe(linesBefore);
    expect(
      await db.stockCount.findUniqueOrThrow({
        where: { id: firstId },
        select: { id: true, countDate: true, status: true },
      }),
    ).toEqual(before);
  });

  it("AC-10: the same yard in another month, and the other yard in the same month, both succeed", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));
    const october = await startCount(staff, startInput("DUBLIN", "2026-10-10", "2026-10"));
    const clonmel = await startCount(staff, startInput("CLONMEL", "2026-09-01", "2026-09"));

    expect(october).not.toBe(clonmel);
    expect(await db.stockCount.count()).toBe(3);
  });

  it("AC-10: two concurrent starts leave exactly one count, and the loser gets the same message", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    const results = await Promise.allSettled([
      startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09")),
      startCount(staff, startInput("DUBLIN", "2026-09-02", "2026-09")),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(ConflictError);
    expect((reason as ConflictError).message).toBe("Count for DUBLIN in 2026-09 already exists");

    expect(await db.stockCount.count()).toBe(1);
    // The loser's lines went with its transaction: 82 and not 164.
    expect(await db.stockCountLine.count()).toBe(82);
  });

  it("AC-11: findCountForPeriod answers with the existing count, or null", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF", "Jo Byrne");

    expect(await findCountForPeriod(staff, "DUBLIN", { periodYear: 2026, periodMonth: 9 })).toBeNull();

    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    expect(await findCountForPeriod(staff, "DUBLIN", { periodYear: 2026, periodMonth: 9 })).toEqual({
      countId,
      status: "DRAFT",
      countDate: "2026-09-01",
      createdByName: "Jo Byrne",
    });
    expect(
      await findCountForPeriod(staff, "CLONMEL", { periodYear: 2026, periodMonth: 9 }),
    ).toBeNull();
  });

  it("AC-11: coming back through the same flow arrives at the SAME countId", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));
    const found = await findCountForPeriod(staff, "DUBLIN", { periodYear: 2026, periodMonth: 9 });

    expect(found?.countId).toBe(countId);
    expect(
      await db.stockCount.count({ where: { locationId: DUBLIN_ID, periodYear: 2026, periodMonth: 9 } }),
    ).toBe(1);
  });

  it("AC-11: findCountForPeriod on an unknown yard names the code", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    await expect(
      findCountForPeriod(staff, "BANANA", { periodYear: 2026, periodMonth: 9 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

/* -------------------------------------------------------- AC-19 to AC-22, AC-23 */

describe("the calendar", () => {
  it("AC-22: defaultMonthKey is the month of the greatest countDate", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    await startCount(staff, startInput("DUBLIN", "2026-07-31", "2026-07"));
    await startCount(staff, startInput("CLONMEL", "2026-08-31", "2026-08"));

    expect(await defaultMonthKey(staff)).toBe("2026-08");
  });

  it("AC-22: with no counts at all it is the month containing today in the yard", async () => {
    const staff = await newActor("YARD_STAFF");

    expect(await db.stockCount.count()).toBe(0);
    expect(await defaultMonthKey(staff)).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/);
    expect(await defaultMonthKey(staff)).toHaveLength(7);
  });

  it("AC-22: countsInMonth and anyCountEver drive the two empty states", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    const empty = await listCalendarMonth(staff, "2026-09");
    expect(empty.countsInMonth).toBe(0);
    expect(empty.anyCountEver).toBe(false);

    await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    const september = await listCalendarMonth(staff, "2026-09");
    expect(september.countsInMonth).toBe(1);
    expect(september.anyCountEver).toBe(true);

    const august = await listCalendarMonth(staff, "2026-08");
    expect(august.countsInMonth).toBe(0);
    expect(august.anyCountEver).toBe(true);
  });

  it("AC-19, AC-21: the month carries its own label and both neighbours", async () => {
    const staff = await newActor("YARD_STAFF");

    const month = await listCalendarMonth(staff, "2026-09");

    expect(month.monthKey).toBe("2026-09");
    expect(month.monthLabel).toBe("September 2026");
    expect(month.previousMonthKey).toBe("2026-08");
    expect(month.nextMonthKey).toBe("2026-10");
    expect(month.days).toHaveLength(30);
    expect(month.days[0].date).toBe("2026-09-01");
    expect(month.days[29].date).toBe("2026-09-30");
  });

  it("AC-21: a month key the page never validated is refused rather than rendered", async () => {
    const staff = await newActor("YARD_STAFF");

    await expect(listCalendarMonth(staff, "2026-13")).rejects.toBeInstanceOf(ValidationError);
    await expect(listCalendarMonth(staff, "banana")).rejects.toBeInstanceOf(ValidationError);
  });

  it("AC-20: a day with counts at both yards renders Dublin before Clonmel", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    await startCount(staff, startInput("CLONMEL", "2026-09-01", "2026-09"));
    await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    const month = await listCalendarMonth(staff, "2026-09");
    const first = month.days.find((day) => day.date === "2026-09-01");

    expect(first?.counts).toHaveLength(2);
    expect(first?.counts.map((badge) => badge.locationName)).toEqual(["Dublin", "Clonmel"]);
    expect(first?.counts.map((badge) => badge.status)).toEqual(["DRAFT", "DRAFT"]);
  });

  it("AC-20: a count is placed by countDate, not by period, and carries its period", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    // Dated the 1st of October, closing September.
    const countId = await startCount(staff, startInput("DUBLIN", "2026-10-01", "2026-09"));

    const september = await listCalendarMonth(staff, "2026-09");
    const october = await listCalendarMonth(staff, "2026-10");

    expect(september.countsInMonth).toBe(0);
    expect(october.countsInMonth).toBe(1);

    const badge = october.days.find((day) => day.date === "2026-10-01")?.counts[0];
    expect(badge?.countId).toBe(countId);
    expect(badge?.periodKey).toBe("2026-09");
    expect(badge?.locationCode).toBe("DUBLIN");
  });

  it("AC-20: a day with no count carries no badge", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");
    await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    const month = await listCalendarMonth(staff, "2026-09");

    expect(month.days.filter((day) => day.counts.length > 0)).toHaveLength(1);
    expect(month.days.find((day) => day.date === "2026-09-02")?.counts).toEqual([]);
  });

  it("AC-23: listCountableYards is Dublin then Clonmel, and excludes an inactive yard", async () => {
    const staff = await newActor("YARD_STAFF");

    expect(await listCountableYards(staff)).toEqual([
      { code: "DUBLIN", name: "Dublin" },
      { code: "CLONMEL", name: "Clonmel" },
    ]);

    await db.location.update({ where: { id: CLONMEL_ID }, data: { active: false } });

    expect(await listCountableYards(staff)).toEqual([{ code: "DUBLIN", name: "Dublin" }]);
  });
});

/* ---------------------------------------------------------- AC-16, AC-17, AC-24 */

describe("getCount", () => {
  it("AC-24: the count page's figures come from the service, freshly read", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF", "Jo Byrne");

    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));
    const count = await getCount(staff, countId);

    expect(count.locationName).toBe("Dublin");
    expect(count.periodLabel).toBe("September 2026");
    expect(count.countDate).toBe("2026-09-01");
    expect(count.createdByName).toBe("Jo Byrne");
    expect(count.status).toBe("DRAFT");
    expect(count.lineCount).toBe(82);
    expect(count.countedLineCount).toBe(0);
    expect(count.uncountedLineCount).toBe(82);
    expect(count.lines.every((line) => line.quantity === null)).toBe(true);
    expect(count.lines[0].unitLabel).toBe("20 Kg");
  });

  it("AC-24: a countId that does not exist is a NotFoundError, not a throw the page cannot use", async () => {
    const staff = await newActor("YARD_STAFF");

    await expect(getCount(staff, "count_does_not_exist")).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCount(staff, "count_does_not_exist")).rejects.toThrow(
      "That count no longer exists.",
    );
  });

  it("AC-16: 11 of the 82 Dublin items have no price, so an ADMIN is told 11", async () => {
    await seedMaster({ pricedDublinItems: 71 });
    const staff = await newActor("YARD_STAFF");
    const admin = await newActor("ADMIN");

    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    const forAdmin = (await getCount(admin, countId)) as CountForAdmin;
    expect(forAdmin.itemsWithoutPrice).toBe(11);
    expect(Number.isInteger(forAdmin.itemsWithoutPrice)).toBe(true);

    const forStaff = await getCount(staff, countId);
    expect(Object.hasOwn(forStaff, "itemsWithoutPrice")).toBe(false);
  });

  it("AC-16: the two shapes are otherwise identical", async () => {
    await seedMaster({ pricedDublinItems: 71 });
    const staff = await newActor("YARD_STAFF");
    const admin = await newActor("ADMIN");
    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    const forStaff = await getCount(staff, countId);
    const forAdmin: Record<string, unknown> = {
      ...((await getCount(admin, countId)) as CountForAdmin),
    };
    delete forAdmin.itemsWithoutPrice;

    expect(forAdmin).toEqual(forStaff);
  });

  it("AC-17: the staff value carries no monetary key at any depth, lines included", async () => {
    await seedMaster({ pricedDublinItems: 71 });
    const staff = await newActor("YARD_STAFF");
    const admin = await newActor("ADMIN");
    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    const forStaff = await getCount(staff, countId);

    assertNoMoneyKeys(forStaff, "getCount(YARD_STAFF)");
    expect(moneyKeysIn(forStaff)).toEqual([]);
    // Non-vacuity: the walk really did go into `lines[]`.
    expect(deepKeys(forStaff)).toContain("quantity");

    // For an ADMIN the same walk reports exactly one offender and no other.
    expect(moneyKeysIn(await getCount(admin, countId))).toEqual(["itemsWithoutPrice"]);
  });

  it("AC-17: the three other functions are money-free for BOTH roles", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");
    const admin = await newActor("ADMIN");
    await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    for (const actor of [staff, admin]) {
      const label = actor.role;
      assertNoMoneyKeys(await listCalendarMonth(actor, "2026-09"), `listCalendarMonth ${label}`);
      assertNoMoneyKeys(await listCountableYards(actor), `listCountableYards ${label}`);
      assertNoMoneyKeys(
        await findCountForPeriod(actor, "DUBLIN", { periodYear: 2026, periodMonth: 9 }),
        `findCountForPeriod ${label}`,
      );
    }

    // Part 6 makes the calendar one screen and not two: the same shape for both roles.
    expect(deepKeys(await listCalendarMonth(staff, "2026-09")).sort()).toEqual(
      deepKeys(await listCalendarMonth(admin, "2026-09")).sort(),
    );
  });

  it("AC-15: every line still reads back with a null price snapshot", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");
    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    const lines = await db.stockCountLine.findMany({
      where: { stockCountId: countId },
      select: { unitPriceSnapshot: true },
    });

    expect(lines).toHaveLength(82);
    expect(lines.every((line) => line.unitPriceSnapshot === null)).toBe(true);
  });
});

/* ---------------------------------------------------------------------- AC-25 */

describe("this feature only ever creates a DRAFT", () => {
  it("AC-25: every written count is DRAFT with every later-lifecycle column null", async () => {
    await seedMaster();
    const staff = await newActor("YARD_STAFF");

    const countId = await startCount(staff, startInput("DUBLIN", "2026-09-01", "2026-09"));

    const row = await db.stockCount.findUniqueOrThrow({
      where: { id: countId },
      select: {
        status: true,
        submittedAt: true,
        approvedById: true,
        approvedAt: true,
        signedById: true,
        signedAt: true,
        signatureSvg: true,
        notes: true,
      },
    });

    expect(row.status).toBe("DRAFT");
    expect(row.submittedAt).toBeNull();
    expect(row.approvedById).toBeNull();
    expect(row.approvedAt).toBeNull();
    expect(row.signedById).toBeNull();
    expect(row.signedAt).toBeNull();
    expect(row.signatureSvg).toBeNull();
    expect(row.notes).toBeNull();
  });
});
