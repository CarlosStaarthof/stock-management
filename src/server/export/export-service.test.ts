import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { exportFileName } from "@/lib/export-messages";
import type { SessionUser } from "@/server/auth/session-user";
import { ForbiddenError, UnauthorizedError } from "@/server/errors";
import { exportWorkbook } from "@/server/export/export-service";

/**
 * Spec 012 AC-8's refusal half and AC-12's file-name half, WITH NO DATABASE.
 *
 * The refusal happens before the first `await`, so an unauthenticated or staff actor never
 * reaches Postgres — exactly the guarantee 011 AC-2 asserts of `getAnalysis`, and the reason
 * removing the route's own guard still exposes nothing (AC-8).
 */

const STAFF: SessionUser = {
  id: "user_staff",
  username: "staff",
  name: "Fixture Yard Staff",
  role: "YARD_STAFF",
};

const OPTIONS = { showAll: false, locationCode: "DUBLIN", periodKey: "2026-09" };

describe("012 AC-8: ADMIN only, refused in the service", () => {
  it("AC-8: a null actor is UnauthorizedError, before any query", async () => {
    await expect(exportWorkbook(null, OPTIONS)).rejects.toThrow(UnauthorizedError);
  });

  it("AC-8: a YARD_STAFF actor is ForbiddenError with #6's exact sentence", async () => {
    await expect(exportWorkbook(STAFF, OPTIONS)).rejects.toThrow(ForbiddenError);
    await expect(exportWorkbook(STAFF, OPTIONS)).rejects.toThrow(
      "ADMIN is required for this action",
    );
  });

  it("AC-8: the options are the show-all flag, one depot and one period", () => {
    expect(exportWorkbook.length).toBe(2);
    expect(Object.keys(OPTIONS).sort()).toEqual(["locationCode", "periodKey", "showAll"]);
  });

  it("AC-9: neither the service nor its messages names the signature column", () => {
    expect(readFileSync("src/server/export/export-service.ts", "utf8")).not.toMatch(
      /signatureSvg/,
    );
    expect(readFileSync("src/lib/export-messages.ts", "utf8")).not.toMatch(/signatureSvg/);
  });
});

describe("012 AC-12: the download's file name", () => {
  it("AC-12: is <Depot>_Stocktake_dd-mm-yyyy.xlsx from the depot's own count date", () => {
    expect(exportFileName("Dublin", "2026-10-13")).toBe("Dublin_Stocktake_13-10-2026.xlsx");
  });

  it("AC-12: takes the date from the count it is given, not from a range", () => {
    expect(exportFileName("Cashel", "2026-07-01")).toBe("Cashel_Stocktake_01-07-2026.xlsx");
  });
});
