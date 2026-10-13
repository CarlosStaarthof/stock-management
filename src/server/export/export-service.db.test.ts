import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";

import { NO_SUPPLIER } from "@/lib/analysis-messages";
import {
  MASTER_HEADERS,
  QUANTITY_HEADER,
  SIGNED_BY_LABEL,
  SIGNED_ON_LABEL,
  TOTAL_LABEL,
  VALUE_HEADER,
} from "@/lib/export-messages";
import { db } from "@/server/db";
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";
import { exportWorkbook, listExportStockTakes } from "@/server/export/export-service";
import { resetTestDb } from "@/server/test-db";

import {
  ADMIN,
  CASHEL_ID,
  DUBLIN_ID,
  STAFF,
  makeItem,
  makeItemType,
  makeLink,
  makePrice,
  makeSupplier,
  makeUser,
} from "../../../tests/support/item-master-fixture";

/**
 * Spec 012 at Level 2 (`docs/verification.md`): the database mapped onto the writer's shape,
 * against a REAL Postgres and a hand-built fixture.
 *
 * Every euro in these criteria is asserted on rows this file created, never on the user's
 * seeded item master. ONE DEPOT PER CALL (R3): `exportWorkbook` is asked for `DUBLIN` or
 * `CASHEL` and produces a file that names only that one.
 */

beforeEach(async () => {
  await resetTestDb();
});

/* ------------------------------------------------------------------ the fixture */

const SIGNER_NAME = "Aoife Signer";
const PERIOD = "2026-06";

type LineSpec = { itemId: string; quantity: string; snapshot: string };

async function makeApprovedCount(input: {
  locationId: string;
  periodKey: string;
  signerId: string;
  lines: readonly LineSpec[];
}): Promise<void> {
  const createdById = await makeUser("ADMIN");
  const day = `${input.periodKey}-15T00:00:00.000Z`;

  const count = await db.stockCount.create({
    data: {
      locationId: input.locationId,
      periodYear: Number(input.periodKey.slice(0, 4)),
      periodMonth: Number(input.periodKey.slice(5, 7)),
      countDate: new Date(day),
      status: "APPROVED",
      createdById,
      submittedAt: new Date(day),
      signedById: input.signerId,
      signedAt: new Date(day),
      signatureSvg: "M 1 1 L 20 12",
      approvedById: createdById,
      approvedAt: new Date(day),
    },
    select: { id: true },
  });

  await db.stockCountLine.createMany({
    data: input.lines.map((line) => ({
      stockCountId: count.id,
      itemId: line.itemId,
      quantity: line.quantity,
      unitPriceSnapshot: line.snapshot,
    })),
  });
}

/** One period; a held item, a counted zero and a never-counted item at Dublin, one at Cashel. */
async function seed(): Promise<void> {
  const signerId = await makeUser("YARD_STAFF");
  await db.user.update({ where: { id: signerId }, data: { name: SIGNER_NAME } });

  const supplierId = await makeSupplier("Kelly");
  const typeId = await makeItemType("BEADS", 1, "Beads");

  // Column E is the CURRENT price: 9.99 now, while June's Value stays frozen at 1.005 (R4).
  const widgetA = await makeItem({
    description: "Widget A",
    supplierId,
    itemTypeId: typeId,
    unitLabel: "20 Kg",
  });
  await makePrice(widgetA, "1.005", "2026-01-01");
  await makePrice(widgetA, "9.99", "2026-09-01");
  await makeLink(widgetA, DUBLIN_ID, 1);

  const countedZero = await makeItem({
    description: "Counted Zero",
    supplierId,
    itemTypeId: typeId,
    unitLabel: "20 Kg",
  });
  await makePrice(countedZero, "2", "2026-01-01");
  await makeLink(countedZero, DUBLIN_ID, 2);

  const neverCounted = await makeItem({
    description: "Never Counted",
    supplierId,
    itemTypeId: typeId,
    unitLabel: "20 Kg",
  });
  await makePrice(neverCounted, "2", "2026-01-01");
  await makeLink(neverCounted, DUBLIN_ID, 3);

  // No supplier: the sheet must read NO_SUPPLIER (AC-2).
  const cashelHeld = await makeItem({
    description: "Held Down South",
    itemTypeId: typeId,
    unitLabel: "1 Unit",
  });
  await makePrice(cashelHeld, "3", "2026-01-01");
  await makeLink(cashelHeld, CASHEL_ID, 1);

  await makeApprovedCount({
    locationId: DUBLIN_ID,
    periodKey: PERIOD,
    signerId,
    lines: [
      { itemId: widgetA, quantity: "2", snapshot: "1.005" },
      { itemId: countedZero, quantity: "0", snapshot: "2" },
    ],
  });
  await makeApprovedCount({
    locationId: CASHEL_ID,
    periodKey: PERIOD,
    signerId,
    lines: [{ itemId: cashelHeld, quantity: "5", snapshot: "3" }],
  });
}

async function openWorkbook(
  locationCode: string,
  showAll = false,
): Promise<ExcelJS.Workbook> {
  const { bytes } = await exportWorkbook(ADMIN, { showAll, locationCode, periodKey: PERIOD });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(bytes).buffer);
  return workbook;
}

function sheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet {
  const found = workbook.getWorksheet(name);
  if (found === undefined) {
    throw new Error(
      `no sheet ${name}; workbook holds ${workbook.worksheets.map((w) => w.name).join(", ")}`,
    );
  }
  return found;
}

function stringsIn(workbook: ExcelJS.Workbook): string[] {
  const found: string[] = [];
  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === "string") found.push(cell.value);
      });
    });
  }
  return found;
}

/* -------------------------------------------------------------------- the criteria */

describe("012 AC-8: ADMIN only, refused in the service", () => {
  it("AC-8: a YARD_STAFF actor is ForbiddenError; a null actor is UnauthorizedError", async () => {
    await expect(
      exportWorkbook(STAFF, { showAll: false, locationCode: "DUBLIN", periodKey: PERIOD }),
    ).rejects.toThrow(ForbiddenError);
    await expect(
      exportWorkbook(null, { showAll: false, locationCode: "DUBLIN", periodKey: PERIOD }),
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe("012 AC-1, AC-12: the sheets and the file name", () => {
  it("AC-1: one depot builds Summary then that depot, and no other", async () => {
    await seed();
    const dublin = await openWorkbook("DUBLIN");
    expect(dublin.worksheets.map((each) => each.name)).toEqual(["Summary", "Dublin"]);

    const cashel = await openWorkbook("CASHEL");
    expect(cashel.worksheets.map((each) => each.name)).toEqual(["Summary", "Cashel"]);
  });

  it("AC-12: names the file from the depot's own count date", async () => {
    await seed();
    const result = await exportWorkbook(ADMIN, {
      showAll: false,
      locationCode: "DUBLIN",
      periodKey: PERIOD,
    });
    expect(result.fileName).toBe("Dublin_Stocktake_15-06-2026.xlsx");
  });

  it("AC-12: an unknown depot or an unapproved period is a refusal, never a file", async () => {
    await seed();
    await expect(
      exportWorkbook(ADMIN, { showAll: false, locationCode: "NOPE", periodKey: PERIOD }),
    ).rejects.toThrow(ValidationError);
    await expect(
      exportWorkbook(ADMIN, { showAll: false, locationCode: "DUBLIN", periodKey: "2026-09" }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe("012 AC-2, AC-3, AC-6: the depot sheet, a derived value, one depot only", () => {
  it("AC-2: the headers, the master columns, NO_SUPPLIER and the current price", async () => {
    await seed();
    const dublin = sheet(await openWorkbook("DUBLIN"), "Dublin");

    expect(
      ["A2", "B2", "C2", "D2", "E2", "F2", "G2"].map((ref) => dublin.getCell(ref).value),
    ).toEqual([...MASTER_HEADERS, QUANTITY_HEADER, VALUE_HEADER]);
    expect(dublin.getCell("F1").value).toBe("June 2026");

    expect(dublin.getCell("A3").value).toBe("Widget A");
    expect(dublin.getCell("B3").value).toBe("Kelly");
    expect(dublin.getCell("C3").value).toBe("Beads");
    expect(dublin.getCell("D3").value).toBe("20 Kg");
    // Column E is the CURRENT price (9.99), not the June snapshot (R4).
    expect(dublin.getCell("E3").value).toBe("€9.99");

    const cashel = sheet(await openWorkbook("CASHEL"), "Cashel");
    expect(cashel.getCell("B3").value).toBe(NO_SUPPLIER);
  });

  it("AC-3: the Value cell is quantity x frozen snapshot, and the TOTAL is a formula", async () => {
    await seed();
    // Held-only: row 3 is Widget A, and its row 4 is the total.
    const dublin = sheet(await openWorkbook("DUBLIN"), "Dublin");

    expect(dublin.getCell("G3").value).toBe(2.01); // 2 x 1.005, from the June snapshot

    const total = dublin.getCell("G4").value as { formula?: string; result?: number };
    expect(total.formula).toMatch(/^SUM\(G3:G3\)$/);
    expect(total.result).toBe(2.01);
  });

  it("AC-6: a Dublin file carries no Cashel cell, and a Cashel file carries no Dublin cell", async () => {
    await seed();
    expect(stringsIn(await openWorkbook("DUBLIN"))).not.toContain("Cashel");
    expect(stringsIn(await openWorkbook("CASHEL"))).not.toContain("Dublin");
  });

  it("AC-7: held-only hides the counted zero and the never-counted item; showAll restores them", async () => {
    await seed();

    const held = sheet(await openWorkbook("DUBLIN"), "Dublin");
    expect(held.getCell("A3").value).toBe("Widget A");
    expect(held.getCell("A4").value).toBe(TOTAL_LABEL);

    const all = sheet(await openWorkbook("DUBLIN", true), "Dublin");
    expect([
      all.getCell("A3").value,
      all.getCell("A4").value,
      all.getCell("A5").value,
      all.getCell("A6").value,
    ]).toEqual(["Widget A", "Counted Zero", "Never Counted", TOTAL_LABEL]);
  });
});

describe("012 AC-9: the signer and the signed date travel onto the depot sheet", () => {
  it("AC-9: renders the stored signer name and signed date", async () => {
    await seed();
    // Held-only Dublin has one data row, so the total is row 4 and the signer block starts at 6.
    const dublin = sheet(await openWorkbook("DUBLIN"), "Dublin");

    expect(dublin.getCell("A6").value).toBe(SIGNED_BY_LABEL);
    expect(dublin.getCell("B6").value).toBe(SIGNER_NAME);
    expect(dublin.getCell("A7").value).toBe(SIGNED_ON_LABEL);
    expect(dublin.getCell("B7").value).toBe("2026-06-15");
  });
});

describe("012 AC-15: the listing page's stock takes", () => {
  it("AC-15: one stock take, one download per depot, newest first", async () => {
    await seed();
    const takes = await listExportStockTakes(ADMIN);

    expect(takes).toEqual([
      {
        periodKey: PERIOD,
        periodLabel: "June 2026",
        depots: [
          { code: "DUBLIN", name: "Dublin", countDate: "2026-06-15" },
          { code: "CASHEL", name: "Cashel", countDate: "2026-06-15" },
        ],
      },
    ]);
  });

  it("AC-15: a YARD_STAFF actor is refused the listing", async () => {
    await expect(listExportStockTakes(STAFF)).rejects.toThrow(ForbiddenError);
  });
});
