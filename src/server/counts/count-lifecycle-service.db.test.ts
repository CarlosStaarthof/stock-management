import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseAuditLines } from "@/lib/count-audit";
import {
  COUNT_ALREADY_APPROVED,
  COUNT_ALREADY_DRAFT,
  COUNT_ALREADY_SUBMITTED,
  COUNT_NOT_SUBMITTED,
  COUNT_NO_LONGER_EXISTS,
  COUNT_READ_ONLY,
  SIGNATURE_REQUIRED,
  SIGNATURE_TOO_LONG,
  SIGNATURE_UNREADABLE,
  countAlreadyExists,
  uncountedBlocksSubmit,
} from "@/lib/count-messages";
import { SIGNATURE_PATH_PATTERN } from "@/lib/signature-path";
import type { SessionUser } from "@/server/auth/session-user";
import { saveQuantities } from "@/server/counts/count-entry-service";
import {
  approveCount,
  getLifecycleFacts,
  reopenCount,
  submitCount,
} from "@/server/counts/count-lifecycle-service";
import { startCount } from "@/server/counts/count-service";
import { db } from "@/server/db";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from "@/server/errors";
import { resetTestDb } from "@/server/test-db";

import {
  actorFor,
  allTableCounts,
  countRowOf,
  lineRowsOf,
  snapshotsOf,
} from "../../../tests/support/count-fixture";
import {
  CLONMEL_ID,
  DUBLIN_ID,
  fixtureId,
  makeItemType,
  makeItemsBulk,
  makeLinksBulk,
  makePrice,
  makePricesBulk,
  makeSupplier,
} from "../../../tests/support/item-master-fixture";

/**
 * AC-17's SECOND refusal is the ENDPOINT's, so the endpoint's own handler is what answers it
 * here, against a real Postgres and through the real route module.
 *
 * ONLY THE SESSION IS MOCKED, and only because there is no browser in this file to hold a
 * cookie: `auth()` is replaced exactly as `src/app/api/counts/[id]/lines/route.db.test.ts`
 * replaces it, and everything below it - `findActiveUserById`, `saveQuantities`, Prisma, the
 * database - is real. Nothing else in this file calls `auth()`, so the mock is inert
 * everywhere but in that one test.
 *
 * WHY THE ASSERTION LIVES HERE AND NOT IN #8'S ROUTE SUITE. AC-17 asks for ONE row read
 * before the refusals and one after ALL FIVE, deeply equal - splitting the fifth into another
 * file breaks exactly that clause. And AC-33 pins every `*.db.test.ts` shipped by #3 through
 * #20 as passing UNMODIFIED, which `route.db.test.ts` is. The cost is that a test under
 * `src/server/` imports a route module from `src/app/`, which `docs/architecture.md`'s
 * dependency rule forbids SHIPPING modules to do; it is taken deliberately and recorded in
 * `progress/impl_entry_submit.md`.
 *
 * `markPastDraft` is deliberately NOT used: `tests/support/count-fixture.ts` defines it as
 * `SUBMITTED`, and this refusal is about `APPROVED`. The count is approved through
 * `approveCount`, which is the only honest way to reach that status.
 */
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/next-auth", () => ({ auth: authMock }));

const { POST: postLines } = await import("@/app/api/counts/[id]/lines/route");

/** One quantity edit, as a real `Request` with a real body, through the real handler. */
async function postQuantity(
  countId: string,
  actor: SessionUser,
  edit: { itemId: string; quantity: string },
): Promise<Response> {
  // `epoch: 0` is what a freshly made profile's session carries (021 AC-17).
  authMock.mockResolvedValue({ user: { id: actor.id }, epoch: 0 });

  return postLines(
    new Request(`http://localhost:3000/api/counts/${countId}/lines`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edits: [edit] }),
    }),
    { params: Promise.resolve({ id: countId }) },
  );
}

/**
 * Spec 009, Level 2 (`docs/verification.md`): the lifecycle against a real Postgres, never
 * a mock. Every test seeds exactly what it needs and `resetTestDb()` empties the eight
 * tables before each one.
 *
 * THE SHAPE OF THIS FILE IS THE SHAPE OF THE FEATURE: five invariants, each with its own
 * block, each proved by reading the ROW back rather than by trusting the return value.
 */
beforeEach(async () => {
  await resetTestDb();
});

/** A module's CODE, comments removed: a scan must read what runs, not what it says. */
function codeOf(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

/** A real signature: three points, two strokes, and every character inside the grammar. */
const SIGNATURE = "M 10 10 L 20 20 L 30 40 M 100 100 L 120 130";

/** A count walked on 15 June 2026 and closing that month. */
const COUNT_DATE = "2026-06-15";
const PERIOD = "2026-06";

/** The full Dublin sheet, which is what every criterion counts in. */
const DUBLIN_LINES = 82;

type Fixture = {
  countId: string;
  itemIds: string[];
  staff: SessionUser;
  admin: SessionUser;
};

/**
 * A yard sheet, prices for it, and a `DRAFT` count over it created through #7's own
 * `startCount` — so the lines under test are the lines the product really makes.
 *
 * `priceless` items are given NO `ItemPrice` at all: Invariant 4's case, and eleven items
 * in the real database are in exactly that state today.
 */
async function seedCount(
  options: {
    lines?: number;
    priceless?: number;
    locationId?: string;
    countDate?: string;
    period?: string;
    /** Link the same items to the other yard too, so a second count can be started there. */
    alsoLinkTo?: string;
  } = {},
): Promise<Fixture> {
  const lines = options.lines ?? DUBLIN_LINES;
  const priceless = options.priceless ?? 0;
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
      unitLabel: index === 1 ? null : "20 Kg",
    })),
  );
  await makeLinksBulk(
    itemIds.map((itemId, index) => ({ itemId, locationId, sortOrder: 3 + index })),
  );
  if (options.alsoLinkTo !== undefined) {
    await makeLinksBulk(
      itemIds.map((itemId, index) => ({
        itemId,
        locationId: options.alsoLinkTo as string,
        sortOrder: 3 + index,
      })),
    );
  }

  // One price each, in force well before the count date, for every item except the last
  // `priceless` ones.
  await makePricesBulk(
    itemIds
      .slice(0, lines - priceless)
      .map((itemId, index) => ({
        itemId,
        // Varied, so a grouped write really does write more than one number.
        amount: index % 2 === 0 ? "9.83" : "33.09",
        effectiveFrom: "2025-01-01",
      })),
  );

  const staff = await actorFor("YARD_STAFF", "Jo Byrne");
  const admin = await actorFor("ADMIN", "Ann Doyle");

  const countId = await startCount(staff, {
    locationCode,
    countDate: options.countDate ?? COUNT_DATE,
    period: options.period ?? PERIOD,
  });

  return { countId, itemIds, staff, admin };
}

/** Every line counted, so Invariant 5 does not block. */
async function countEverything(countId: string, quantity = "5"): Promise<void> {
  await db.stockCountLine.updateMany({ where: { stockCountId: countId }, data: { quantity } });
}

/** Put these lines back to *not counted*, which is what Invariant 5 refuses. */
async function leaveUncounted(countId: string, itemIds: readonly string[]): Promise<void> {
  await db.stockCountLine.updateMany({
    where: { stockCountId: countId, itemId: { in: [...itemIds] } },
    data: { quantity: null },
  });
}

/** The lifecycle columns, straight from Postgres. */
async function rowOf(countId: string): Promise<Record<string, unknown>> {
  return countRowOf(countId);
}

async function snapshotOf(countId: string, itemId: string): Promise<string | null> {
  const line = await db.stockCountLine.findFirstOrThrow({
    where: { stockCountId: countId, itemId },
    select: { unitPriceSnapshot: true },
  });
  return line.unitPriceSnapshot === null ? null : line.unitPriceSnapshot.toString();
}

/* ------------------------------------------------------------------------- AC-2 */

describe("AC-2: every function takes an explicit actor, and a null actor writes nothing", () => {
  it("AC-2: all four lifecycle functions refuse a null actor with UnauthorizedError", async () => {
    const { countId } = await seedCount({ lines: 4 });
    await countEverything(countId);

    const before = await rowOf(countId);
    const linesBefore = await lineRowsOf(countId);

    await expect(submitCount(null, countId, { signaturePath: SIGNATURE })).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(approveCount(null, countId)).rejects.toThrow(UnauthorizedError);
    await expect(reopenCount(null, countId, "a reason")).rejects.toThrow(UnauthorizedError);
    await expect(getLifecycleFacts(null, countId)).rejects.toThrow(UnauthorizedError);

    expect(await rowOf(countId)).toEqual(before);
    expect(await lineRowsOf(countId)).toEqual(linesBefore);
  });
});

/* ------------------------------------------------------------------------- AC-3 */

describe("AC-3: Invariant 5 — one uncounted line blocks submission, at the service", () => {
  it("AC-3: 12 uncounted lines refuse the submission and name the number", async () => {
    const { countId, itemIds, staff } = await seedCount();
    await countEverything(countId);
    await leaveUncounted(countId, itemIds.slice(0, 12));

    const refusal = await submitCount(staff, countId, { signaturePath: SIGNATURE }).catch(
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(ValidationError);
    expect((refusal as ValidationError).field).toBe("lines");
    expect((refusal as ValidationError).message).toBe(uncountedBlocksSubmit(12));

    const row = await rowOf(countId);
    expect(row.status).toBe("DRAFT");
    expect(row.submittedAt).toBeNull();
    expect(row.signedById).toBeNull();
    expect(row.signedAt).toBeNull();
    expect(row.signatureSvg).toBeNull();
    expect(row.notes).toBeNull();
    expect(await snapshotsOf(countId)).toEqual(Array.from({ length: DUBLIN_LINES }, () => null));
  });

  it("AC-3: with exactly one left, the sentence is singular", async () => {
    const { countId, itemIds, staff } = await seedCount({ lines: 6 });
    await countEverything(countId);
    await leaveUncounted(countId, itemIds.slice(0, 1));

    await expect(submitCount(staff, countId, { signaturePath: SIGNATURE })).rejects.toThrow(
      uncountedBlocksSubmit(1),
    );
  });

  it("AC-3: a line holding 0 does NOT block — 35 of 82 is what a real count looks like", async () => {
    const { countId, itemIds, staff } = await seedCount();

    await db.stockCountLine.updateMany({
      where: { stockCountId: countId, itemId: { in: itemIds.slice(0, 47) } },
      data: { quantity: "12.5" },
    });
    await db.stockCountLine.updateMany({
      where: { stockCountId: countId, itemId: { in: itemIds.slice(47) } },
      data: { quantity: "0" },
    });

    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const row = await rowOf(countId);
    expect(row.status).toBe("SUBMITTED");
  });
});

/* ------------------------------------------------------------------- AC-6, AC-7 */

describe("AC-6: Invariant 11 — no signature, no submission", () => {
  const refused: [string, string, string][] = [
    ["nothing drawn", "", SIGNATURE_REQUIRED],
    ["whitespace", "   ", SIGNATURE_REQUIRED],
    ["a dot", "M 10 10", SIGNATURE_UNREADABLE],
  ];

  for (const [why, value, message] of refused) {
    it(`AC-6: ${why} is refused at the SERVICE and writes nothing`, async () => {
      const { countId, staff } = await seedCount({ lines: 4 });
      await countEverything(countId);

      const before = await rowOf(countId);

      const refusal = await submitCount(staff, countId, { signaturePath: value }).catch(
        (error: unknown) => error,
      );

      expect(refusal).toBeInstanceOf(ValidationError);
      expect((refusal as ValidationError).field).toBe("signature");
      expect((refusal as ValidationError).message).toBe(message);
      expect(await rowOf(countId)).toEqual(before);
    });
  }

  it("AC-6: a 6001-character path is refused as too long, and writes nothing", async () => {
    const { countId, staff } = await seedCount({ lines: 4 });
    await countEverything(countId);

    const head = "M 111 11";
    const oversized = head + " L 22 22".repeat(750);
    expect(oversized.length).toBeGreaterThan(6000);

    const before = await rowOf(countId);

    await expect(submitCount(staff, countId, { signaturePath: oversized })).rejects.toThrow(
      SIGNATURE_TOO_LONG,
    );
    expect(await rowOf(countId)).toEqual(before);
  });
});

describe("AC-7: the signature round-trips intact, byte for byte", () => {
  it("AC-7: what Postgres holds is exactly the string that was passed in", async () => {
    const { countId, staff } = await seedCount({ lines: 4 });
    await countEverything(countId);

    const before = Date.now();
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const row = await rowOf(countId);
    expect(row.signatureSvg).toBe(SIGNATURE);
    expect((row.signatureSvg as string).length).toBe(SIGNATURE.length);
    expect(SIGNATURE_PATH_PATTERN.test(row.signatureSvg as string)).toBe(true);

    expect(row.signedById).toBe(staff.id);
    const signedAt = row.signedAt as Date;
    expect(signedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(signedAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("AC-7: a long path with decimals survives, and getLifecycleFacts returns it unchanged", async () => {
    const { countId, staff } = await seedCount({ lines: 4 });
    await countEverything(countId);

    const points = Array.from({ length: 130 }, (_unused, index) => `L ${index * 4} ${index % 30}.5`);
    const path = `M 1.5 2.5 ${points.join(" ")}`;

    await submitCount(staff, countId, { signaturePath: path });

    const row = await rowOf(countId);
    expect(row.signatureSvg).toBe(path);

    const facts = await getLifecycleFacts(staff, countId);
    expect(facts.signaturePath).toBe(path);
    expect(facts.signedByName).toBe("Jo Byrne");
  });
});

/* ---------------------------------------------------------------- AC-11, AC-12 */

describe("AC-11: Invariant 2 — the snapshot is the price in force ON the count date", () => {
  it("AC-11: a price effective exactly on countDate wins, and a later one never does", async () => {
    const { countId, itemIds, staff } = await seedCount({ lines: 4 });
    await countEverything(countId);

    const itemId = itemIds[0];
    await db.itemPrice.deleteMany({ where: { itemId } });
    await makePrice(itemId, "5.00", "2025-01-01");
    await makePrice(itemId, "7.25", COUNT_DATE);
    await makePrice(itemId, "9.99", "2026-07-01");

    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    expect(await snapshotOf(countId, itemId)).toBe("7.25");
  });

  it("AC-11: precision is exact — a non-terminating workbook price keeps every digit", async () => {
    const { countId, itemIds, staff } = await seedCount({ lines: 4 });
    await countEverything(countId);

    const itemId = itemIds[1];
    await db.itemPrice.deleteMany({ where: { itemId } });
    // Clonmel's `=5.2/0.85`, which is why the column is Decimal(18, 8).
    await makePrice(itemId, "6.11764706", "2026-01-01");

    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    expect(await snapshotOf(countId, itemId)).toBe("6.11764706");
  });

  it("AC-11: after submission the snapshot is inert — four operations, no movement", async () => {
    const { countId, itemIds, staff, admin } = await seedCount();
    await countEverything(countId);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const captured = await snapshotsOf(countId);
    expect(captured.filter((value) => value !== null)).toHaveLength(DUBLIN_LINES);

    // 1. A new price, earlier, later and identical.
    await makePrice(itemIds[0], "1.11", "2024-01-01");
    await makePrice(itemIds[0], "2.22", "2026-12-01");
    await makePrice(itemIds[0], "3.33", COUNT_DATE);
    expect(await snapshotsOf(countId)).toEqual(captured);

    // 2. Editing the item, and 3. archiving it.
    await db.item.update({ where: { id: itemIds[1] }, data: { description: "Renamed" } });
    await db.item.update({ where: { id: itemIds[2] }, data: { active: false } });
    expect(await snapshotsOf(countId)).toEqual(captured);

    // 4. Approving the count.
    await approveCount(admin, countId);
    expect(await snapshotsOf(countId)).toEqual(captured);
  });

  it("AC-11: the price in force is selected by ONE function, and no second comparison exists", () => {
    for (const file of [
      "src/server/counts/count-lifecycle-service.ts",
      "src/server/counts/count-summary-service.ts",
    ]) {
      const source = codeOf(file);

      // No Prisma filter on the effective date, no comparison of one and no sort by one:
      // the whole of "which price was in force" is `selectCurrentPrice`, and it lives in
      // `src/server/items/price-selection.ts`.
      expect(source, file).not.toMatch(/effectiveFrom:\s*\{/);
      expect(source, file).not.toMatch(/effectiveFrom\s*[<>]/);
      expect(source, file).not.toMatch(/[<>]=?\s*[\w.]*effectiveFrom/);
      expect(source, file).not.toMatch(/effectiveFrom[^\n]*localeCompare/);
    }

    expect(readFileSync("src/server/counts/count-lifecycle-service.ts", "utf8")).toContain(
      "selectCurrentPrice(",
    );
  });
});

describe("AC-12: Invariant 4 — a line with no price stays null, and is never zeroed", () => {
  it("AC-12: three priceless items keep null; the other 79 are written", async () => {
    const { countId, itemIds, staff } = await seedCount({ priceless: 3 });
    await countEverything(countId);

    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    for (const itemId of itemIds.slice(DUBLIN_LINES - 3)) {
      // `null`, NOT `0`: writing 0 would make "no price" and "the price was zero"
      // indistinguishable forever.
      expect(await snapshotOf(countId, itemId)).toBeNull();
    }

    const written = (await snapshotsOf(countId)).filter((value) => value !== null);
    expect(written).toHaveLength(DUBLIN_LINES - 3);
  });
});

/* ----------------------------------------------------------------- AC-13, AC-14 */

describe("AC-13: submission is one transaction and one compare-and-set", () => {
  const ADD_SNAPSHOT_CHECK =
    'ALTER TABLE "StockCountLine" ADD CONSTRAINT "tmp_ac13_snapshot_check" ' +
    'CHECK ("unitPriceSnapshot" IS NULL) NOT VALID';
  const DROP_SNAPSHOT_CHECK =
    'ALTER TABLE "StockCountLine" DROP CONSTRAINT IF EXISTS "tmp_ac13_snapshot_check"';

  it("AC-13: a failing snapshot write rolls the status write back with it", async () => {
    const { countId, staff } = await seedCount({ lines: 6 });
    await countEverything(countId);

    await db.$executeRawUnsafe(ADD_SNAPSHOT_CHECK);
    try {
      await expect(submitCount(staff, countId, { signaturePath: SIGNATURE })).rejects.toThrow();
    } finally {
      await db.$executeRawUnsafe(DROP_SNAPSHOT_CHECK);
    }

    const row = await rowOf(countId);
    expect(row.status).toBe("DRAFT");
    expect(row.submittedAt).toBeNull();
    expect(row.signedById).toBeNull();
    expect(row.signedAt).toBeNull();
    expect(row.signatureSvg).toBeNull();
    expect(await snapshotsOf(countId)).toEqual(Array.from({ length: 6 }, () => null));

    // The control run: with the constraint gone, the same call submits and writes all six.
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    expect((await rowOf(countId)).status).toBe("SUBMITTED");
    expect((await snapshotsOf(countId)).filter((value) => value !== null)).toHaveLength(6);
  });

  it("AC-13: two concurrent submissions produce one SUBMITTED row and one ConflictError", async () => {
    const { countId, staff, admin } = await seedCount({ lines: 6 });
    await countEverything(countId);

    const results = await Promise.allSettled([
      submitCount(staff, countId, { signaturePath: SIGNATURE }),
      submitCount(admin, countId, { signaturePath: "M 1 1 L 2 2" }),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect(((rejected[0] as PromiseRejectedResult).reason as Error).message).toBe(
      COUNT_ALREADY_SUBMITTED,
    );

    const row = await rowOf(countId);
    expect(row.status).toBe("SUBMITTED");
    // One winner, one signature, one set of snapshots: the loser's is not stored.
    expect([SIGNATURE, "M 1 1 L 2 2"]).toContain(row.signatureSvg);
    expect([staff.id, admin.id]).toContain(row.signedById);
    expect(parseAuditLines(row.notes as string)).toHaveLength(1);
  });

  it("AC-13: no lock and no version token anywhere in the service", () => {
    const source = codeOf("src/server/counts/count-lifecycle-service.ts");

    expect(source).not.toMatch(/FOR UPDATE/i);
    expect(source).not.toMatch(/\bversion\b/);
    expect(source).toContain("updateMany(");
  });
});

describe("AC-14: what submission writes, and the long list of what it does not", () => {
  it("AC-14: eight columns move, and every other column of every row does not", async () => {
    const { countId, staff } = await seedCount();
    await countEverything(countId, "12.5");

    const before = await rowOf(countId);
    const linesBefore = await lineRowsOf(countId);
    const tablesBefore = await allTableCounts();
    const at = Date.now();

    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const after = await rowOf(countId);
    expect(after.status).toBe("SUBMITTED");
    expect(Math.abs((after.submittedAt as Date).getTime() - at)).toBeLessThan(30_000);
    expect(after.signedById).toBe(staff.id);
    expect((after.signedAt as Date).getTime()).toBe((after.submittedAt as Date).getTime());
    expect(after.signatureSvg).toBe(SIGNATURE);
    expect(parseAuditLines(after.notes as string)).toHaveLength(1);

    // Approval is untouched by a submission.
    expect(after.approvedById).toBeNull();
    expect(after.approvedAt).toBeNull();

    for (const column of ["locationId", "periodYear", "periodMonth", "countDate", "createdById"]) {
      expect(after[column], column).toEqual(before[column]);
    }

    const linesAfter = await lineRowsOf(countId);
    expect(linesAfter).toHaveLength(linesBefore.length);
    for (const [index, line] of linesAfter.entries()) {
      for (const column of ["id", "stockCountId", "itemId", "quantity", "note"]) {
        expect(line[column], column).toEqual(linesBefore[index][column]);
      }
      // The ONLY column that changed.
      expect(line.unitPriceSnapshot).not.toBeNull();
    }

    // This feature inserts nothing and deletes nothing.
    expect(await allTableCounts()).toEqual(tablesBefore);
  });
});

/* ---------------------------------------------------------------- AC-15, AC-16 */

describe("AC-15: Part 6 — YARD_STAFF submits and never approves", () => {
  it("AC-15: staff may submit at either yard, whoever created the count", async () => {
    const dublin = await seedCount({ lines: 4, alsoLinkTo: CLONMEL_ID });
    await countEverything(dublin.countId);
    await submitCount(dublin.staff, dublin.countId, { signaturePath: SIGNATURE });
    expect((await rowOf(dublin.countId)).status).toBe("SUBMITTED");

    const clonmelId = await startCount(dublin.admin, {
      locationCode: "CLONMEL",
      countDate: COUNT_DATE,
      period: PERIOD,
    });
    await countEverything(clonmelId);
    await submitCount(dublin.staff, clonmelId, { signaturePath: SIGNATURE });
    expect((await rowOf(clonmelId)).status).toBe("SUBMITTED");
  });

  it("AC-15: approve and reopen refuse a staff actor, and nothing moves", async () => {
    const { countId, staff, admin } = await seedCount({ lines: 4 });
    await countEverything(countId);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const before = await rowOf(countId);
    const linesBefore = await lineRowsOf(countId);

    for (const call of [
      (): Promise<unknown> => approveCount(staff, countId),
      (): Promise<unknown> => reopenCount(staff, countId, "the MMA price was wrong"),
    ]) {
      const refusal = await call().catch((error: unknown) => error);
      expect(refusal).toBeInstanceOf(ForbiddenError);
      // The string 006 AC-4 pinned for the seventeen item-master mutations.
      expect((refusal as Error).message).toBe("ADMIN is required for this action");
    }

    expect(await rowOf(countId)).toEqual(before);
    expect(await lineRowsOf(countId)).toEqual(linesBefore);
    expect(parseAuditLines((await rowOf(countId)).notes as string)).toHaveLength(1);

    // The admin, on the same count, is permitted.
    await approveCount(admin, countId);
    expect((await rowOf(countId)).status).toBe("APPROVED");
  });
});

describe("AC-16: approval, its conflicts, and self-approval", () => {
  it("AC-16: approval sets three columns, appends one line, and moves nothing else", async () => {
    const { countId, staff, admin } = await seedCount();
    await countEverything(countId);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const before = await rowOf(countId);
    const linesBefore = await lineRowsOf(countId);
    const snapshotsBefore = await snapshotsOf(countId);
    const at = Date.now();

    await approveCount(admin, countId);

    const after = await rowOf(countId);
    expect(after.status).toBe("APPROVED");
    expect(after.approvedById).toBe(admin.id);
    expect(Math.abs((after.approvedAt as Date).getTime() - at)).toBeLessThan(30_000);
    expect(parseAuditLines(after.notes as string).map((entry) => entry.event)).toEqual([
      "SUBMITTED",
      "APPROVED",
    ]);

    for (const column of [
      "locationId",
      "periodYear",
      "periodMonth",
      "countDate",
      "createdById",
      "submittedAt",
      "signedById",
      "signedAt",
      "signatureSvg",
    ]) {
      expect(after[column], column).toEqual(before[column]);
    }

    expect(await lineRowsOf(countId)).toEqual(linesBefore);
    expect(await snapshotsOf(countId)).toEqual(snapshotsBefore);
  });

  it("AC-16: a DRAFT, an APPROVED count and a missing id are each refused by name", async () => {
    const { countId, staff, admin } = await seedCount({ lines: 4 });
    await countEverything(countId);

    await expect(approveCount(admin, countId)).rejects.toThrow(COUNT_NOT_SUBMITTED);

    await submitCount(staff, countId, { signaturePath: SIGNATURE });
    await approveCount(admin, countId);

    await expect(approveCount(admin, countId)).rejects.toThrow(COUNT_ALREADY_APPROVED);

    const missing = await approveCount(admin, "count_that_never_was").catch(
      (error: unknown) => error,
    );
    expect(missing).toBeInstanceOf(NotFoundError);
    expect((missing as Error).message).toBe(COUNT_NO_LONGER_EXISTS);
  });

  it("AC-16: two concurrent approvals give one APPROVED row and one ConflictError", async () => {
    const { countId, staff, admin } = await seedCount({ lines: 4 });
    await countEverything(countId);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const second = await actorFor("ADMIN", "Another Administrator");
    const results = await Promise.allSettled([
      approveCount(admin, countId),
      approveCount(second, countId),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
    expect((rejected as PromiseRejectedResult).reason.message).toBe(COUNT_ALREADY_APPROVED);

    expect(parseAuditLines((await rowOf(countId)).notes as string)).toHaveLength(2);
  });

  it("AC-16: an ADMIN who signed a count may approve it, and the fact is recorded", async () => {
    // Open question 2: the team is two people at most, and a single administrator must be
    // able to close the month. It is a fact on the page, not a refusal.
    const { countId, admin } = await seedCount({ lines: 4 });
    await countEverything(countId);

    await submitCount(admin, countId, { signaturePath: SIGNATURE });
    await approveCount(admin, countId);

    const row = await rowOf(countId);
    expect(row.approvedById).toBe(row.signedById);

    const facts = await getLifecycleFacts(admin, countId);
    expect(facts.signedAndApprovedBySamePerson).toBe(true);
    expect(facts.signedByName).toBe("Ann Doyle");
    expect(facts.approvedByName).toBe("Ann Doyle");
  });

  it("AC-16: two different people leave signedAndApprovedBySamePerson false", async () => {
    const { countId, staff, admin } = await seedCount({ lines: 4 });
    await countEverything(countId);

    await submitCount(staff, countId, { signaturePath: SIGNATURE });
    await approveCount(admin, countId);

    expect((await getLifecycleFacts(staff, countId)).signedAndApprovedBySamePerson).toBe(false);
  });
});

/* ------------------------------------------------------------------------ AC-17 */

describe("AC-17: Invariant 3 — what immutable means, enumerated", () => {
  it("AC-17: all five writes are refused against an APPROVED count and the row does not move", async () => {
    const { countId, itemIds, staff, admin } = await seedCount();
    await countEverything(countId);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });
    await approveCount(admin, countId);

    const before = await rowOf(countId);
    const linesBefore = await lineRowsOf(countId);

    // 1. #8's quantity path, with 008 AC-9's message unchanged.
    const edit = await saveQuantities(staff, countId, [{ itemId: itemIds[0], quantity: "9" }]).catch(
      (error: unknown) => error,
    );
    expect(edit).toBeInstanceOf(ConflictError);
    expect((edit as Error).message).toBe(COUNT_READ_ONLY);

    // 2. The same refusal AT THE ENDPOINT #8's screen autosaves through: `409`, the domain's
    //    sentence in `error`, nothing written. It is not a restatement of 1 - what the
    //    service raises and what a client is told are two different facts, and the second is
    //    the one an autosave loop acts on.
    const posted = await postQuantity(countId, staff, { itemId: itemIds[0], quantity: "9" });
    const body = (await posted.json()) as { error: string };

    expect(posted.status).toBe(409);
    expect(body.error).toBe(COUNT_READ_ONLY);

    // 3. A second submission, and 4. a second approval.
    await expect(submitCount(staff, countId, { signaturePath: SIGNATURE })).rejects.toThrow(
      COUNT_ALREADY_APPROVED,
    );
    await expect(approveCount(admin, countId)).rejects.toThrow(COUNT_ALREADY_APPROVED);

    // 5. #7's one-count-per-period rule, with 007 AC-10's message unchanged.
    const second = await startCount(admin, {
      locationCode: "DUBLIN",
      countDate: COUNT_DATE,
      period: PERIOD,
    }).catch((error: unknown) => error);
    expect(second).toBeInstanceOf(ConflictError);
    expect((second as Error).message).toBe(countAlreadyExists("DUBLIN", PERIOD));

    expect(await rowOf(countId)).toEqual(before);
    expect(await lineRowsOf(countId)).toEqual(linesBefore);
  });

  it("AC-17: a SUBMITTED count refuses a second submission with its own sentence", async () => {
    const { countId, staff } = await seedCount({ lines: 4 });
    await countEverything(countId);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    await expect(submitCount(staff, countId, { signaturePath: SIGNATURE })).rejects.toThrow(
      COUNT_ALREADY_SUBMITTED,
    );
  });

  it("AC-17: nothing in this feature deletes a count or a line", () => {
    for (const file of [
      "src/server/counts/count-lifecycle-service.ts",
      "src/server/counts/count-summary-service.ts",
    ]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(
        /stockCount(Line)?\s*\.\s*(create|createMany|delete|deleteMany|upsert)\b/,
      );
    }
  });
});

/* ----------------------------------------------------------------- AC-18, AC-19 */

describe("AC-18: the reopen — who, what it clears, and what it records", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AC-18: six columns go back to null and one audit line is appended", async () => {
    const { countId, staff, admin } = await seedCount({ lines: 6 });
    await countEverything(countId);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });
    await approveCount(admin, countId);

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await reopenCount(admin, countId, "the MMA price was wrong");

    const row = await rowOf(countId);
    expect(row.status).toBe("DRAFT");
    expect(row.submittedAt).toBeNull();
    expect(row.signedById).toBeNull();
    expect(row.signedAt).toBeNull();
    expect(row.signatureSvg).toBeNull();
    expect(row.approvedById).toBeNull();
    expect(row.approvedAt).toBeNull();

    const entries = parseAuditLines(row.notes as string);
    expect(entries.map((entry) => entry.event)).toEqual(["SUBMITTED", "APPROVED", "REOPENED"]);
    expect(entries[2].reason).toBe("the MMA price was wrong");
    expect(entries[2].actorRef).toBe(admin.username);

    // The one operation here that destroys information is in the server log too.
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls[0][0] as string;
    expect(logged).toContain("count.reopened");
    expect(logged).toContain(`countId=${countId}`);
    expect(logged).toContain(`actorId=${admin.id}`);
    expect(logged).toContain("previousStatus=APPROVED");
    expect(logged).not.toContain("the MMA price was wrong");
  });

  it("AC-18: a SUBMITTED count may be reopened too, and a DRAFT may not", async () => {
    const { countId, staff, admin } = await seedCount({ lines: 4 });
    await countEverything(countId);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(reopenCount(admin, countId, "too soon")).rejects.toThrow(COUNT_ALREADY_DRAFT);

    await submitCount(staff, countId, { signaturePath: SIGNATURE });
    await reopenCount(admin, countId, "a number was wrong");

    expect((await rowOf(countId)).status).toBe("DRAFT");
  });

  it("AC-18: after a reopen the count is editable again and demands a fresh signature", async () => {
    const { countId, itemIds, staff, admin } = await seedCount({ lines: 4 });
    await countEverything(countId);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await reopenCount(admin, countId, "a number was wrong");

    await saveQuantities(staff, countId, [{ itemId: itemIds[0], quantity: "99" }]);

    const facts = await getLifecycleFacts(staff, countId);
    expect(facts.signaturePath).toBeNull();
    expect(facts.signedByName).toBeNull();

    await expect(submitCount(staff, countId, { signaturePath: "" })).rejects.toThrow(
      SIGNATURE_REQUIRED,
    );
  });
});

describe("AC-19: a reopened count keeps its snapshots, and a re-submit fills only the gaps", () => {
  it("AC-19: all 82 survive the reopen; a new price does not move one, a first price fills one", async () => {
    const { countId, itemIds, staff, admin } = await seedCount({ priceless: 3 });
    await countEverything(countId);
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const captured = await snapshotsOf(countId);
    expect(captured).toHaveLength(DUBLIN_LINES);

    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await reopenCount(admin, countId, "the MMA price was wrong");

    // Reopening writes no snapshot at all.
    expect(await snapshotsOf(countId)).toEqual(captured);

    const priced = itemIds[0];
    const priceless = itemIds[DUBLIN_LINES - 1];
    const before = await snapshotOf(countId, priced);

    await makePrice(priced, "77.77", COUNT_DATE);
    await makePrice(priceless, "44.44", COUNT_DATE);

    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    // Written once, never rewritten - even across a reopen.
    expect(await snapshotOf(countId, priced)).toBe(before);
    // A null snapshot was never a written value, so Invariant 4's warning gets its answer.
    expect(await snapshotOf(countId, priceless)).toBe("44.44");

    vi.restoreAllMocks();
  });

  it("AC-19: the condition is `unitPriceSnapshot IS NULL`, in the WHERE clause", () => {
    const source = codeOf("src/server/counts/count-lifecycle-service.ts");

    // The condition is in the WHERE of the write itself, not in a branch above it: the
    // database refuses to touch a line that already holds a snapshot, whatever the caller
    // believed it was doing.
    expect(source).toMatch(
      /where:[^\n]*unitPriceSnapshot: null[^\n]*\},\s*\n\s*data: \{ unitPriceSnapshot/,
    );
  });
});

/* ------------------------------------------------------------------------ AC-20 */

describe("AC-20: the audit trail against the database", () => {
  it("AC-20: submit, approve, reopen, submit, approve leaves exactly five lines in order", async () => {
    const { countId, staff, admin } = await seedCount({ lines: 4 });
    await countEverything(countId);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await submitCount(staff, countId, { signaturePath: SIGNATURE });
    await approveCount(admin, countId);
    await reopenCount(admin, countId, "the MMA price was wrong");

    const afterFour = ((await rowOf(countId)).notes as string).split("\n");
    expect(afterFour).toHaveLength(3);

    await submitCount(staff, countId, { signaturePath: SIGNATURE });
    await approveCount(admin, countId);

    const notes = (await rowOf(countId)).notes as string;
    const lines = notes.split("\n");

    expect(lines).toHaveLength(5);
    // Append-only: the earlier four are byte-identical to what they were.
    expect(lines.slice(0, 3)).toEqual(afterFour);

    expect(parseAuditLines(notes).map((entry) => entry.event)).toEqual([
      "SUBMITTED",
      "APPROVED",
      "REOPENED",
      "SUBMITTED",
      "APPROVED",
    ]);

    vi.restoreAllMocks();
  });
});

/* ------------------------------------------------------------------------ AC-28 */

describe("AC-28: no database error text ever reaches a caller", () => {
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
    "StockCount_locationId_periodYear_periodMonth_key",
  ];

  it("AC-28: eight provoked failures carry this feature's own sentences and nothing else", async () => {
    const { countId, itemIds, staff, admin } = await seedCount({ lines: 6 });

    const messages: string[] = [];
    const collect = async (call: () => Promise<unknown>): Promise<void> => {
      const error = await call().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(Error);
      messages.push((error as Error).message);
    };

    // 1. an uncounted line
    await leaveUncounted(countId, itemIds.slice(0, 2));
    await collect(() => submitCount(staff, countId, { signaturePath: SIGNATURE }));

    await countEverything(countId);

    // 2, 3, 4. an empty, an unreadable and an oversized signature
    await collect(() => submitCount(staff, countId, { signaturePath: "" }));
    await collect(() => submitCount(staff, countId, { signaturePath: "M 10 10" }));
    await collect(() =>
      submitCount(staff, countId, { signaturePath: `M 111 11${" L 22 22".repeat(750)}` }),
    );

    // 5. a second submission
    await submitCount(staff, countId, { signaturePath: SIGNATURE });
    await collect(() => submitCount(staff, countId, { signaturePath: SIGNATURE }));

    // 6. an approval of a draft — the next month at the same yard, because #7 permits one
    // count per yard per period and this fixture's yard already has June.
    const draftId = await startCount(admin, {
      locationCode: "DUBLIN",
      countDate: "2026-07-01",
      period: "2026-07",
    });
    await collect(() => approveCount(admin, draftId));

    // 7. a reopen of a count that is already a draft
    await collect(() => reopenCount(admin, draftId, "a reason"));

    // 8. a countId that does not exist
    await collect(() => getLifecycleFacts(staff, "count_that_never_was"));

    expect(messages).toHaveLength(8);
    for (const message of messages) {
      for (const forbidden of FORBIDDEN) {
        expect(message, `"${message}" leaks ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("AC-28: the service throws only typed domain errors, never a bare Error", () => {
    const source = readFileSync("src/server/counts/count-lifecycle-service.ts", "utf8");

    const thrown = [...source.matchAll(/throw new (\w+)/g)].map((match) => match[1]);
    expect(new Set(thrown)).toEqual(new Set(["ConflictError", "NotFoundError", "ValidationError"]));
  });
});

/* ------------------------------------------------------------------------ AC-25 */

describe("AC-25, AC-30: the total is stored nowhere", () => {
  it("AC-25: no column of StockCount or StockCountLine holds a total", async () => {
    const { countId, staff } = await seedCount({ lines: 4 });
    await countEverything(countId, "10");
    await submitCount(staff, countId, { signaturePath: SIGNATURE });

    const row = await rowOf(countId);
    const lines = await lineRowsOf(countId);

    // Invariant 1: value is derived on read, every time. The schema has no column to hold
    // it, and this asserts the shape of the row rather than trusting the schema file.
    for (const key of Object.keys(row)) {
      expect(key, key).not.toMatch(/value|total/i);
    }
    for (const key of Object.keys(lines[0])) {
      expect(key, key).not.toMatch(/value|total/i);
    }
  });
});
