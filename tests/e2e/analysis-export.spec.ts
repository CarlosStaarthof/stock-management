import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";

import { ACCESS_DENIED_MESSAGE } from "@/lib/auth-messages";
import {
  MASTER_HEADERS,
  QUANTITY_HEADER,
  VALUE_HEADER,
  exportHref,
} from "@/lib/export-messages";
import { isHeld } from "@/lib/held";
import { multiplyDecimal } from "@/lib/money";
import type { Role } from "@/server/auth/roles";

import { pickSheetItems, seedCountHolding, valuedLinesOf } from "./support/analysis";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import { seededMasterCounts } from "./support/item-master";
import {
  RESERVED_YEAR,
  approveAs,
  clearReservedYear,
  realCountIds,
  submitAs,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 012's browser half: the ADMIN downloads one depot's workbook for one stock take,
 * a `YARD_STAFF` session never receives one, and the listing page offers one control per
 * depot per approved stock take (AC-8, AC-13, AC-15, rulings R3, R7, R8).
 *
 * THIS FILE OWNS RESERVED YEAR 2106 (007 AC-30, 012 AC-15) and deletes only that year. Its
 * counts are built through Prisma and the lifecycle SERVICE rather than through the start
 * flow, which is why 2106 is reachable although 007 AC-8 caps a period started through
 * `startCount` at 2100. It owns the HIGHEST reserved year, so the latest approved stock
 * take the page opens on is one of its own — the earlier one proves the "lists earlier
 * approved stock takes the same way" half of R8.
 *
 * THE DOWNLOAD IS FOLLOWED AS A REAL REQUEST FROM THE SIGNED-IN CONTEXT, not by parsing a
 * browser download: `page.request` shares the browser's cookies, so the `GET` is the same
 * authorised request the control's `href` would make, and the response carries the headers
 * (`Content-Type`, `Content-Disposition`) a download is judged on.
 *
 * NO EURO IS ASSERTED AS A LITERAL. The prices are the user's master; every expected value
 * below is recomputed from the rows this file seeded, as 007's start spec recorded and #8,
 * #10 and #11 repeated.
 */
const YEAR = RESERVED_YEAR.analysisExport;
const Y = String(YEAR);

/** The latest stock take: both depots approved. */
const MAIN = `${Y}-09`;
/** An earlier stock take: Dublin only, so its block proves the one-depot case. */
const EARLIER = `${Y}-08`;

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const created: string[] = [];
let dublinMainId = "";
let realCountsBefore: string[] = [];
let masterBefore: Awaited<ReturnType<typeof seededMasterCounts>>;

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.beforeAll(async () => {
  if (!(await databaseIsReachable())) return;

  // A handful of counts through the real lifecycle service against a database in another
  // region. The hook's own budget is raised; `playwright.config.ts`'s timeouts, workers,
  // retries and `fullyParallel` are untouched (012 AC-14), and no test gets a second longer.
  test.setTimeout(180_000);

  realCountsBefore = await realCountIds();
  masterBefore = await seededMasterCounts();

  await clearReservedYear(YEAR);

  const owner = await createTestUser("YARD_STAFF", "analysis-export-owner");
  const approver = await createTestUser("ADMIN", "analysis-export-approver");
  created.push(owner.username, approver.username);

  const dublinItems = await pickSheetItems("DUBLIN", 3);
  const cashelItems = await pickSheetItems("CASHEL", 2);

  const approved = async (
    locationCode: "DUBLIN" | "CASHEL",
    month: number,
    day: string,
    items: { itemId: string }[],
  ): Promise<string> => {
    const countId = await seedCountHolding({
      locationCode,
      year: YEAR,
      month,
      countDate: `${Y}-${String(month).padStart(2, "0")}-${day}`,
      owner,
      // Distinct quantities, so a Value cell can be matched to exactly one seeded line.
      lines: items.map((item, index) => ({ itemId: item.itemId, quantity: String(index + 1) })),
    });
    await submitAs(countId, owner);
    await approveAs(countId, approver);
    return countId;
  };

  dublinMainId = await approved("DUBLIN", 9, "15", dublinItems);
  await approved("CASHEL", 9, "20", cashelItems);
  await approved("DUBLIN", 8, "10", dublinItems);
});

test.afterAll(async () => {
  if (!(await databaseIsReachable())) return;

  await clearReservedYear(YEAR);
  for (const username of created.splice(0)) {
    await removeUser(username);
  }

  // 007 AC-30: this file reached nothing outside its own year.
  expect(await realCountIds()).toEqual(realCountsBefore);
  expect(await seededMasterCounts()).toEqual(masterBefore);
});

async function newUser(role: Role = "ADMIN", label = "analysis-export"): Promise<TestUser> {
  const user = await createTestUser(role, label);
  created.push(user.username);
  return user;
}

/* ------------------------------------------------------------------- AC-8, the refusals */

test("AC-8: the listing page is refused to an anonymous and to a YARD_STAFF session", async ({
  page,
}) => {
  const anonymous = await page.request.get("/analysis/export", { maxRedirects: 0 });
  expect([302, 307]).toContain(anonymous.status());
  expect(anonymous.headers()["location"] ?? "").toContain("/sign-in");
  expect(anonymous.headers()["location"] ?? "").toContain("callbackUrl=%2Fanalysis%2Fexport");

  await signIn(page, await newUser("YARD_STAFF"));
  const refusal = await page.request.get("/analysis/export", { maxRedirects: 0 });
  expect(refusal.status()).toBe(307);
  expect(refusal.headers()["location"] ?? "").toContain("/stock-entry?denied=analysis");

  await page.goto("/analysis/export");
  expect(page.url()).toContain("/stock-entry?denied=analysis");
  await expect(page.getByTestId("access-denied")).toHaveText(ACCESS_DENIED_MESSAGE);
});

test("AC-8: the download is refused to anonymous and staff, and no workbook ever travels", async ({
  page,
}) => {
  const url = exportHref("DUBLIN", MAIN);

  const anonymous = await page.request.get(url, { maxRedirects: 0 });
  expect([302, 307]).toContain(anonymous.status());
  expect(anonymous.headers()["location"] ?? "").toContain("/sign-in");
  expect(anonymous.headers()["content-type"] ?? "").not.toContain("spreadsheetml");

  await signIn(page, await newUser("YARD_STAFF"));
  const refusal = await page.request.get(url, { maxRedirects: 0 });
  expect(refusal.status()).toBe(403);
  expect(refusal.headers()["content-type"] ?? "").not.toContain("spreadsheetml");
  expect(await refusal.text()).toContain("Forbidden");
});

/* -------------------------------------------------------------------- AC-15, the listing */

test("AC-15: each stock take lists one download per depot, newest first", async ({ page }) => {
  await signIn(page, await newUser());
  await page.goto("/analysis/export");

  const latest = page.getByTestId(`stock-take-${MAIN}`);
  const earlier = page.getByTestId(`stock-take-${EARLIER}`);
  await expect(latest).toHaveCount(1);
  await expect(earlier).toHaveCount(1);

  // The latest period's block opens before the earlier one's, whatever other approved
  // stock takes the shared database holds (ours is the highest reserved year).
  const order = await page
    .getByTestId(/^stock-take-/)
    .evaluateAll((blocks) => blocks.map((block) => block.getAttribute("data-testid") ?? ""));
  expect(order.indexOf(`stock-take-${MAIN}`)).toBeLessThan(
    order.indexOf(`stock-take-${EARLIER}`),
  );

  // The stock take both depots approved: one control each, each pointing at its own file.
  await expect(latest.getByTestId("download-DUBLIN")).toHaveCount(1);
  await expect(latest.getByTestId("download-CASHEL")).toHaveCount(1);
  await expect(latest.getByTestId("download-DUBLIN")).toHaveAttribute(
    "href",
    exportHref("DUBLIN", MAIN),
  );
  await expect(latest.getByTestId("download-CASHEL")).toHaveAttribute(
    "href",
    exportHref("CASHEL", MAIN),
  );

  // The earlier stock take had only Dublin approved: one control, and no Cashel one.
  await expect(earlier.getByTestId("download-DUBLIN")).toHaveCount(1);
  await expect(earlier.getByTestId("download-CASHEL")).toHaveCount(0);
  await expect(earlier.getByTestId("download-DUBLIN")).toHaveAttribute(
    "href",
    exportHref("DUBLIN", EARLIER),
  );
});

/* ------------------------------------------------------------------- AC-13, the download */

test("AC-13: an ADMIN follows a control and receives that depot's own readable workbook", async ({
  page,
}) => {
  await signIn(page, await newUser());
  await page.goto("/analysis/export");

  const control = page.getByTestId(`stock-take-${MAIN}`).getByTestId("download-DUBLIN");
  const href = await control.getAttribute("href");
  expect(href).toBe(exportHref("DUBLIN", MAIN));

  const response = await page.request.get(href ?? "");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe(XLSX_CONTENT_TYPE);
  expect(response.headers()["cache-control"]).toBe("no-store");
  // Ruling R7: the depot's OWN count date, day-month-year.
  expect(response.headers()["content-disposition"]).toContain(
    `Dublin_Stocktake_15-09-${Y}.xlsx`,
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(await response.body()).buffer);

  // AC-1: exactly two sheets, the summary then the depot, named for the depot it was asked.
  expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Summary", "Dublin"]);

  const depot = workbook.getWorksheet("Dublin");
  if (depot === undefined) throw new Error("the workbook holds no Dublin sheet");

  // AC-2: the five master columns, then the one Qty | Value pair.
  expect(
    ["A2", "B2", "C2", "D2", "E2", "F2", "G2"].map((ref) => depot.getCell(ref).value),
  ).toEqual([...MASTER_HEADERS, QUANTITY_HEADER, VALUE_HEADER]);

  // AC-3: every Value cell is the exact quantity x frozen snapshot for a seeded line, and
  // no cell is an error value.
  const held = (await valuedLinesOf(dublinMainId)).filter((line) => isHeld(line.quantity));
  expect(held.length).toBeGreaterThan(0);
  const expected: number[] = held.map((line) =>
    Number(multiplyDecimal(line.quantity, line.snapshot ?? "0")),
  );

  // Only the Value column (G) is compared against the seeded lines, so a Qty cell cannot
  // stand in for a Value cell. No cell anywhere is an Excel error value (AC-4).
  const values: number[] = [];
  depot.eachRow((row) => {
    row.eachCell((cell) => {
      const value: unknown = cell.value;
      if (value !== null && typeof value === "object" && "error" in value) {
        throw new Error(`error cell ${cell.address}: ${String(value.error)}`);
      }
    });

    const valueCell = row.getCell(7);
    if (typeof valueCell.value === "number") values.push(valueCell.value);
  });
  for (const value of expected) {
    expect(values, `a Value cell for ${String(value)}`).toContain(value);
  }
});
