import { beforeEach, describe, expect, it } from "vitest";

import { COUNT_NO_LONGER_EXISTS, COUNT_READ_ONLY, ITEM_NOT_ON_COUNT } from "@/lib/count-messages";
import { assertNoMoneyKeys, moneyKeysIn } from "@/lib/money-boundary";
import type { SessionUser } from "@/server/auth/session-user";
import { saveQuantities } from "@/server/counts/count-entry-service";
import { getCount, startCount } from "@/server/counts/count-service";
import { db } from "@/server/db";
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";
import { resetTestDb } from "@/server/test-db";
import type { CountForAdmin, QuantityEdit } from "@/types/stock-count";

import {
  PRESERVED_LINE_COLUMNS,
  allTableCounts,
  countRowOf,
  lineRowsOf,
  markPastDraft,
  nullQuantityLineCount,
  snapshotsOf,
} from "../../../tests/support/count-fixture";
import {
  CLONMEL_ID,
  DUBLIN_ID,
  fixtureId,
  makeItemType,
  makeItemsBulk,
  makeLinksBulk,
  makeSupplier,
  makeUser,
} from "../../../tests/support/item-master-fixture";

/**
 * Spec 008, Level 2 (`docs/verification.md`): `saveQuantities` against a real Postgres,
 * never a mock. Every test seeds exactly what it needs.
 *
 * THE FIRST BLOCK IS THE FEATURE. An empty input is never saved as `0`, and a `0` is never
 * stored as an empty input — proved by asking the database itself, with `IS NULL`, rather
 * than by asking TypeScript.
 */
beforeEach(async () => {
  await resetTestDb();
});

/**
 * The mechanism AC-8's atomicity test uses: a constraint the middle edit of three cannot
 * satisfy, added for the duration of one `saveQuantities` call and dropped in a `finally`.
 *
 * `NOT VALID` skips the scan of existing rows while still enforcing the check on every
 * write, which is what has to fail. 007 AC-13 established the shape; the name is spelled
 * the same in both statements and nowhere else in the schema.
 */
const ADD_QUANTITY_CHECK =
  'ALTER TABLE "StockCountLine" ADD CONSTRAINT "tmp_ac8_quantity_check" ' +
  "CHECK (quantity IS NULL OR quantity <> 4444) NOT VALID";
const DROP_QUANTITY_CHECK =
  'ALTER TABLE "StockCountLine" DROP CONSTRAINT IF EXISTS "tmp_ac8_quantity_check"';

async function newActor(role: "ADMIN" | "YARD_STAFF", name = "Jo Byrne"): Promise<SessionUser> {
  const id = await makeUser(role);
  await db.user.update({ where: { id }, data: { name } });
  const row = await db.user.findUniqueOrThrow({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

type Fixture = {
  countId: string;
  itemIds: string[];
  staff: SessionUser;
  admin: SessionUser;
};

/**
 * A yard sheet and a `DRAFT` count over it, created through #7's own `startCount` so the
 * lines under test are the lines the product really makes — one per sheet item, every one
 * of them `quantity = null`.
 */
async function seedCount(
  options: { lines?: number; locationId?: string; countedBy?: "ADMIN" | "YARD_STAFF" } = {},
): Promise<Fixture> {
  const lines = options.lines ?? 4;
  const locationId = options.locationId ?? DUBLIN_ID;
  const locationCode = locationId === CLONMEL_ID ? "CLONMEL" : "DUBLIN";

  const typeId = await makeItemType("BEADS", 1, "Beads");
  const supplierId = await makeSupplier("Kelly");

  const itemIds = Array.from({ length: lines }, (_unused, index) => fixtureId("item", index));
  await makeItemsBulk(
    itemIds.map((id, index) => ({
      id,
      description: `Item ${String(index).padStart(3, "0")}`,
      itemTypeId: typeId,
      supplierId: index === 0 ? null : supplierId,
      unitLabel: "20 Kg",
    })),
  );
  await makeLinksBulk(itemIds.map((itemId, index) => ({ itemId, locationId, sortOrder: 3 + index })));

  const staff = await newActor("YARD_STAFF", "Jo Byrne");
  const admin = await newActor("ADMIN", "An Administrator");

  const creator = options.countedBy === "YARD_STAFF" ? staff : admin;
  const countId = await startCount(creator, {
    locationCode,
    countDate: "2026-09-01",
    period: "2026-09",
  });

  return { countId, itemIds, staff, admin };
}

/** One line's quantity, straight from the database, as a string or a real `null`. */
async function storedQuantity(countId: string, itemId: string): Promise<string | null> {
  const line = await db.stockCountLine.findFirstOrThrow({
    where: { stockCountId: countId, itemId },
    select: { quantity: true },
  });
  return line.quantity === null ? null : line.quantity.toString();
}

function edit(itemId: string, quantity: string | null): QuantityEdit {
  return { itemId, quantity };
}

/* ------------------------------------------------------------------------- AC-5 */

describe("AC-5: a blank input is never saved as 0, and 0 is never blank", () => {
  it("AC-5: typing 0 stores zero, and the null count falls by exactly one", async () => {
    const { countId, itemIds, staff } = await seedCount();
    const before = await nullQuantityLineCount();

    await saveQuantities(staff, countId, [edit(itemIds[0], "0")]);

    const stored = await storedQuantity(countId, itemIds[0]);
    expect(stored).toBe("0");
    expect(stored).not.toBeNull();
    expect(await nullQuantityLineCount()).toBe(before - 1);
  });

  it("AC-5: clearing a row stores NULL, not 0, and the null count rises by exactly one", async () => {
    const { countId, itemIds, staff } = await seedCount();
    await saveQuantities(staff, countId, [edit(itemIds[0], "12.5")]);
    const before = await nullQuantityLineCount();

    await saveQuantities(staff, countId, [edit(itemIds[0], null)]);

    const stored = await storedQuantity(countId, itemIds[0]);
    expect(stored).toBeNull();
    expect(stored).not.toBe("0");
    expect(await nullQuantityLineCount()).toBe(before + 1);
  });

  it("AC-5: the two are distinguishable by IS NULL, which is the whole feature", async () => {
    const { countId, itemIds, staff } = await seedCount();

    await saveQuantities(staff, countId, [edit(itemIds[0], "0"), edit(itemIds[1], null)]);

    const zero = await db.$queryRaw<
      { n: bigint }[]
    >`SELECT count(*) AS n FROM "StockCountLine" WHERE quantity = 0`;
    expect(Number(zero[0].n)).toBe(1);
    // The other three lines - the two never touched and the one explicitly cleared.
    expect(await nullQuantityLineCount()).toBe(3);
  });

  it("AC-5, AC-24: `0` counts as counted and clearing it decrements the progress", async () => {
    const { countId, itemIds, staff } = await seedCount();

    const zeroed = await saveQuantities(staff, countId, [edit(itemIds[0], "0")]);
    expect(zeroed.countedLineCount).toBe(1);
    expect(zeroed.uncountedLineCount).toBe(3);

    const cleared = await saveQuantities(staff, countId, [edit(itemIds[0], null)]);
    expect(cleared.countedLineCount).toBe(0);
    expect(cleared.uncountedLineCount).toBe(4);
  });
});

/* ------------------------------------------------------------------------- AC-2 */

describe("AC-2: both roles may count, and no yard is off limits", () => {
  it("AC-2: a null actor raises UnauthorizedError and writes nothing", async () => {
    const { countId, itemIds } = await seedCount();
    const nobody = null as unknown as SessionUser;
    const before = await nullQuantityLineCount();

    await expect(saveQuantities(nobody, countId, [edit(itemIds[0], "12.5")])).rejects.toBeInstanceOf(
      UnauthorizedError,
    );

    expect(await nullQuantityLineCount()).toBe(before);
    expect(await storedQuantity(countId, itemIds[0])).toBeNull();
  });

  it("AC-2: YARD_STAFF may edit a count an ADMIN started, at Dublin", async () => {
    const { countId, itemIds, staff } = await seedCount({ countedBy: "ADMIN" });

    const result = await saveQuantities(staff, countId, [edit(itemIds[1], "21.6128")]);

    expect(result.countId).toBe(countId);
    expect(await storedQuantity(countId, itemIds[1])).toBe("21.6128");
  });

  it("AC-2: an ADMIN may edit a count a YARD_STAFF user started, at Clonmel", async () => {
    const { countId, itemIds, admin } = await seedCount({
      locationId: CLONMEL_ID,
      countedBy: "YARD_STAFF",
    });

    await saveQuantities(admin, countId, [edit(itemIds[2], "9.83")]);

    expect(await storedQuantity(countId, itemIds[2])).toBe("9.83");
  });
});

/* ------------------------------------------------------------------------- AC-8 */

describe("AC-8: the save writes one column, all or nothing, and touches nothing else", () => {
  it("AC-8: a batch that fails half way leaves all three lines at their previous state", async () => {
    const { countId, itemIds, staff } = await seedCount();
    await saveQuantities(staff, countId, [
      edit(itemIds[0], "1"),
      edit(itemIds[1], "2"),
      edit(itemIds[2], "3"),
    ]);

    const doomed: QuantityEdit[] = [
      edit(itemIds[0], "11"),
      edit(itemIds[1], "4444"),
      edit(itemIds[2], "33"),
    ];

    await db.$executeRawUnsafe(ADD_QUANTITY_CHECK);
    let refused = false;
    try {
      await saveQuantities(staff, countId, doomed);
    } catch {
      refused = true;
    } finally {
      await db.$executeRawUnsafe(DROP_QUANTITY_CHECK);
    }

    expect(refused).toBe(true);
    expect(await storedQuantity(countId, itemIds[0])).toBe("1");
    expect(await storedQuantity(countId, itemIds[1])).toBe("2");
    expect(await storedQuantity(countId, itemIds[2])).toBe("3");

    // The control run: the same batch, with nothing in its way, writes all three.
    await saveQuantities(staff, countId, doomed);
    expect(await storedQuantity(countId, itemIds[0])).toBe("11");
    expect(await storedQuantity(countId, itemIds[1])).toBe("4444");
    expect(await storedQuantity(countId, itemIds[2])).toBe("33");
  });

  it("AC-8, AC-28: every column of the line except quantity is left exactly as it was", async () => {
    const { countId, itemIds, staff } = await seedCount();
    const before = await lineRowsOf(countId);

    await saveQuantities(staff, countId, [edit(itemIds[0], "12.5"), edit(itemIds[1], "0")]);

    const after = await lineRowsOf(countId);
    const strip = (rows: Record<string, unknown>[]): Record<string, unknown>[] =>
      rows.map((row) =>
        Object.fromEntries(Object.entries(row).filter(([column]) => column !== "quantity")),
      );

    // Structural, not a list of five names: a column added later is compared too.
    expect(strip(after)).toEqual(strip(before));
    expect(Object.keys(strip(after)[0]).sort()).toEqual([...PRESERVED_LINE_COLUMNS].sort());
  });

  it("AC-8: not one column of the parent count moves", async () => {
    const { countId, itemIds, staff } = await seedCount();
    const before = await countRowOf(countId);

    await saveQuantities(staff, countId, [edit(itemIds[0], "12.5")]);

    expect(await countRowOf(countId)).toEqual(before);
  });

  it("AC-8: nothing is inserted and nothing is deleted, in any table", async () => {
    const { countId, itemIds, staff } = await seedCount();
    const before = await allTableCounts();

    await saveQuantities(staff, countId, [edit(itemIds[0], "12.5"), edit(itemIds[3], null)]);

    expect(await allTableCounts()).toEqual(before);
  });

  it("AC-8: an itemId that is not a line of this count refuses the whole batch", async () => {
    const { countId, itemIds, staff } = await seedCount();

    await expect(
      saveQuantities(staff, countId, [edit(itemIds[0], "12.5"), edit("item_not_here", "1")]),
    ).rejects.toThrow(ITEM_NOT_ON_COUNT);

    // Including the valid edit that travelled beside it.
    expect(await storedQuantity(countId, itemIds[0])).toBeNull();
    expect(await nullQuantityLineCount()).toBe(4);
  });

  it("AC-8: the refusal is a NotFoundError, so the endpoint answers 404", async () => {
    const { countId, staff } = await seedCount();

    await expect(saveQuantities(staff, countId, [edit("item_not_here", "1")])).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

/* ------------------------------------------------------------------------- AC-9 */

describe("AC-9: a count that is no longer a DRAFT cannot be edited", () => {
  it("AC-9: the refusal is a ConflictError in the domain's own words, and writes nothing", async () => {
    const { countId, itemIds, staff } = await seedCount();
    await markPastDraft(countId);

    const refusal = await saveQuantities(staff, countId, [edit(itemIds[0], "12.5")]).catch(
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(ConflictError);
    expect((refusal as ConflictError).message).toBe(COUNT_READ_ONLY);
    expect((refusal as ConflictError).message).toBe(
      "This count has been submitted and can no longer be edited.",
    );
    expect(await storedQuantity(countId, itemIds[0])).toBeNull();
  });

  it("AC-9: a countId that does not exist is #7's sentence, and a NotFoundError", async () => {
    const { itemIds, staff } = await seedCount();

    const refusal = await saveQuantities(staff, "count_does_not_exist", [
      edit(itemIds[0], "12.5"),
    ]).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(NotFoundError);
    expect((refusal as NotFoundError).message).toBe(COUNT_NO_LONGER_EXISTS);
  });
});

/* ------------------------------------------------------------------------ AC-10 */

describe("AC-10: what the service answers with", () => {
  it("AC-10: the result carries exactly five keys, and the counts add up", async () => {
    const { countId, itemIds, staff } = await seedCount();

    const result = await saveQuantities(staff, countId, [
      edit(itemIds[0], "12.5"),
      edit(itemIds[1], null),
    ]);

    expect(Object.keys(result).sort()).toEqual([
      "countId",
      "countedLineCount",
      "lineCount",
      "saved",
      "uncountedLineCount",
    ]);
    expect(result.countedLineCount + result.uncountedLineCount).toBe(result.lineCount);
    expect(result.lineCount).toBe(4);
  });

  it("AC-10: `saved` is read back from the database, not copied from the request", async () => {
    const { countId, itemIds, staff } = await seedCount();

    // `21,6128` and `007` are what a person types; the response reports what Postgres holds.
    const result = await saveQuantities(staff, countId, [
      edit(itemIds[0], "21,6128"),
      edit(itemIds[1], "007"),
      edit(itemIds[2], null),
    ]);

    expect(result.saved).toEqual([
      { itemId: itemIds[0], quantity: "21.6128" },
      { itemId: itemIds[1], quantity: "7" },
      { itemId: itemIds[2], quantity: null },
    ]);
  });

  it("AC-10: an identical repeat returns an identical result and changes nothing", async () => {
    const { countId, itemIds, staff } = await seedCount();
    const edits = [edit(itemIds[0], "12.5"), edit(itemIds[1], "0")];

    const first = await saveQuantities(staff, countId, edits);
    const between = await lineRowsOf(countId);
    const second = await saveQuantities(staff, countId, edits);

    expect(second).toEqual(first);
    expect(await lineRowsOf(countId)).toEqual(between);
  });

  it("AC-10, AC-14: two edits for one line in one batch write the latest only", async () => {
    const { countId, itemIds, staff } = await seedCount();

    const result = await saveQuantities(staff, countId, [
      edit(itemIds[0], "10"),
      edit(itemIds[0], "11"),
    ]);

    expect(result.saved).toEqual([{ itemId: itemIds[0], quantity: "11" }]);
    expect(await storedQuantity(countId, itemIds[0])).toBe("11");
  });
});

/* ------------------------------------------------------------------ AC-27, AC-7 */

describe("AC-27: no database error text ever reaches a caller", () => {
  const FORBIDDEN = [
    "prisma",
    "Prisma",
    "violates",
    "constraint",
    "SQLSTATE",
    "22003",
    "23502",
    "23514",
    "23505",
    "P2002",
    "P2003",
    "P2025",
    "numeric field overflow",
    "StockCountLine_stockCountId_itemId_key",
  ] as const;

  it("AC-27: six provoked failures, each in the feature's own words", async () => {
    const { countId, itemIds, staff } = await seedCount();
    const pastDraft = await seedCountPastDraft();

    const provoked: [string, () => Promise<unknown>][] = [
      ["abc", () => saveQuantities(staff, countId, [edit(itemIds[0], "abc")])],
      ["21.61285", () => saveQuantities(staff, countId, [edit(itemIds[0], "21.61285")])],
      ["100000000", () => saveQuantities(staff, countId, [edit(itemIds[0], "100000000")])],
      ["unknown item", () => saveQuantities(staff, countId, [edit("item_not_here", "1")])],
      ["unknown count", () => saveQuantities(staff, "count_gone", [edit(itemIds[0], "1")])],
      [
        "not a draft",
        () => saveQuantities(staff, pastDraft.countId, [edit(pastDraft.itemIds[0], "1")]),
      ],
    ];

    expect(provoked).toHaveLength(6);
    for (const [name, call] of provoked) {
      const error = await call().catch((caught: unknown) => caught);

      // A typed domain error, never a bare Error and never the driver's own.
      expect(
        error instanceof ValidationError ||
          error instanceof NotFoundError ||
          error instanceof ConflictError,
        name,
      ).toBe(true);

      for (const forbidden of FORBIDDEN) {
        expect((error as Error).message, `${name} / ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("AC-7, AC-27: a value wider than the column is refused before Postgres sees it", async () => {
    const { countId, itemIds, staff } = await seedCount();

    await expect(
      saveQuantities(staff, countId, [edit(itemIds[0], "100000000")]),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(await storedQuantity(countId, itemIds[0])).toBeNull();
  });
});

/** A second count, already past `DRAFT`, for the refusal above. */
async function seedCountPastDraft(): Promise<{ countId: string; itemIds: string[] }> {
  const typeId = await makeItemType("THERMO", 2, "Thermo-P");
  const itemIds = [fixtureId("clonmel", 0), fixtureId("clonmel", 1)];

  await makeItemsBulk(
    itemIds.map((id, index) => ({
      id,
      description: `Clonmel item ${index}`,
      itemTypeId: typeId,
      unitLabel: "Tonne",
    })),
  );
  await makeLinksBulk(
    itemIds.map((itemId, index) => ({ itemId, locationId: CLONMEL_ID, sortOrder: 3 + index })),
  );

  const creator = await newActor("ADMIN", "An Administrator");
  const countId = await startCount(creator, {
    locationCode: "CLONMEL",
    countDate: "2026-09-02",
    period: "2026-09",
  });
  await markPastDraft(countId);

  return { countId, itemIds };
}

/* --------------------------------------------------------------- AC-17, AC-31 */

describe("AC-17: the money boundary, on everything this service returns", () => {
  it("AC-17: a staff actor's result carries no monetary key at any depth", async () => {
    const { countId, itemIds, staff } = await seedCount();

    const result = await saveQuantities(staff, countId, [
      edit(itemIds[0], "12.5"),
      edit(itemIds[1], null),
    ]);

    expect(moneyKeysIn(result)).toEqual([]);
    expect(() => assertNoMoneyKeys(result, "saveQuantities")).not.toThrow();
  });

  it("AC-17: the two roles receive deeply equal bodies for the identical request", async () => {
    const { countId, itemIds, staff, admin } = await seedCount();
    const edits = [edit(itemIds[0], "12.5")];

    const asStaff = await saveQuantities(staff, countId, edits);
    const asAdmin = await saveQuantities(admin, countId, edits);

    // One shape, both roles, because there is no monetary fact it could carry (AC-18).
    expect(asAdmin).toEqual(asStaff);
    expect(moneyKeysIn(asAdmin)).toEqual([]);
  });

  it("AC-17: getCount stays role-shaped after #8 adds two fields to a line", async () => {
    const { countId, itemIds, staff, admin } = await seedCount();
    await saveQuantities(staff, countId, [edit(itemIds[0], "12.5")]);

    const forStaff = await getCount(staff, countId);
    const forAdmin = (await getCount(admin, countId)) as CountForAdmin;

    expect(moneyKeysIn(forStaff)).toEqual([]);
    // Unchanged from 007 AC-17: exactly one offender for an ADMIN, and no other.
    expect(moneyKeysIn(forAdmin)).toEqual(["itemsWithoutPrice"]);
  });

  it("AC-20: a line carries the supplier and the type its filters are built from", async () => {
    const { countId, staff } = await seedCount();

    const count = await getCount(staff, countId);

    // The first fixture item deliberately has no supplier, as Dublin!A45 has none.
    expect(count.lines[0].supplierName).toBeNull();
    expect(count.lines[1].supplierName).toBe("Kelly");
    expect(count.lines[0].typeName).toBe("Beads");
  });

  it("AC-31: every line this feature writes still has no price snapshot", async () => {
    const { countId, itemIds, staff } = await seedCount();

    await saveQuantities(staff, countId, [edit(itemIds[0], "12.5"), edit(itemIds[1], "0")]);

    // Invariant 2: #9 is still the first writer of that column.
    expect(await snapshotsOf(countId)).toEqual([null, null, null, null]);
  });
});

/* ------------------------------------------------------------------ AC-24, AC-29 */

describe("AC-24, AC-29: progress, and precision", () => {
  it("AC-24: one line holding 0 makes a Dublin count 1 of 82 counted", async () => {
    const { countId, itemIds, staff } = await seedCount({ lines: 82 });

    await saveQuantities(staff, countId, [edit(itemIds[0], "0")]);

    const count = await getCount(staff, countId);
    expect(count.lineCount).toBe(82);
    expect(count.countedLineCount).toBe(1);
    expect(count.uncountedLineCount).toBe(81);
  });

  it("AC-29: quantities round-trip at full precision, with no rounding anywhere", async () => {
    const { countId, itemIds, staff } = await seedCount();

    await saveQuantities(staff, countId, [
      edit(itemIds[0], "21.6128"),
      edit(itemIds[1], "0.475"),
    ]);

    const count = await getCount(staff, countId);
    const byItem = new Map(count.lines.map((line) => [line.itemId, line.quantity]));

    expect(byItem.get(itemIds[0])).toBe("21.6128");
    expect(byItem.get(itemIds[1])).toBe("0.475");
  });
});

/* ------------------------------------------------------------------------ AC-34 */

describe("AC-34: two devices, one count — the last write wins", () => {
  it("AC-34: the later save is what the database holds, and what it echoes", async () => {
    const { countId, itemIds, staff, admin } = await seedCount();

    const first = await saveQuantities(staff, countId, [edit(itemIds[0], "10")]);
    const second = await saveQuantities(admin, countId, [edit(itemIds[0], "20")]);

    expect(first.saved[0].quantity).toBe("10");
    expect(second.saved[0].quantity).toBe("20");
    expect(await storedQuantity(countId, itemIds[0])).toBe("20");
  });

  it("AC-34: two sessions editing different lines both succeed, and progress is 2", async () => {
    const { countId, itemIds, staff, admin } = await seedCount();

    await saveQuantities(staff, countId, [edit(itemIds[0], "10")]);
    const second = await saveQuantities(admin, countId, [edit(itemIds[1], "20")]);

    expect(second.countedLineCount).toBe(2);
    expect(await storedQuantity(countId, itemIds[0])).toBe("10");
    expect(await storedQuantity(countId, itemIds[1])).toBe("20");
  });
});
