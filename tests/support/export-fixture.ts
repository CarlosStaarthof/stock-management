import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { generatePin } from "@/server/auth/credential-rules";
import { hashPin } from "@/server/auth/password";
import { requestProfile } from "@/server/auth/profile-request-service";
import { db } from "@/server/db";
import { DUBLIN_ID, makeItem, makeItemType, makeLink, makePrice, makeSupplier } from "./item-master-fixture";

/**
 * Spec 016 AC-9's fixture: at least one row in every table, on the test database.
 *
 * It holds a profile with a PIN, an `AccountLock`, an `AuthEvent`, a `SetupClaim`, and a
 * signed count whose line holds the quantity 21.6128 and the snapshot 6.11764706. Since ruling
 * A1-F1 it also holds one `PENDING` profile request, made through `requestProfile` from a new
 * device, which the export must leave out and count. The two
 * `Location` rows come from the migration, restored by `resetTestDb`.
 *
 * It lives under `tests/` because it writes the price snapshot column, which only the
 * modules 009 AC-26 lists may name among shipping code. Every PIN is drawn at run time.
 */

export const QUANTITY = "21.6128";
export const SNAPSHOT = "6.11764706";

export type ExportFixture = {
  /** Values the export's output must never print: usernames, names and prices. */
  printedNever: string[];
  /** The PIN credentials, which must appear nowhere in the file. */
  credentials: string[];
  /** The pending request's typed name and username, which must appear nowhere in the file. */
  pendingRequest: string[];
};

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

/**
 * An ACTIVE profile holding a PIN made under this run's pepper. Written directly rather than
 * through the operator service, which only the reset script and test files may import
 * (021 AC-31); this module is neither.
 */
async function profile(role: "ADMIN" | "YARD_STAFF", label: string): Promise<{ id: string; username: string; name: string }> {
  const username = `${label.toLowerCase().slice(0, 2)}${hex(6)}`;
  const name = `Export ${label} ${hex(3)}`;
  const credential = await hashPin(generatePin(6));
  const created = await db.user.create({
    data: { username, name, role, status: "ACTIVE", ...credential },
    select: { id: true },
  });
  return { id: created.id, username, name };
}

export async function buildExportFixture(): Promise<ExportFixture> {
  const admin = await profile("ADMIN", "Admin");
  const staff = await profile("YARD_STAFF", "Staff");

  const pin = generatePin(6);
  const request = { name: `Export Request ${hex(3)}`, username: `rq${hex(6)}`, pin, pinAgain: pin };
  const outcome = await requestProfile(request, { deviceToken: null });
  if (outcome.outcome !== "SENT") throw new Error(`the fixture's profile request was not sent (${outcome.outcome})`);

  const supplierName = `Export Supplier ${hex(3)}`;
  const supplierId = await makeSupplier(supplierName);
  const itemTypeId = await makeItemType(`EXPORT_${hex(3)}`, 1);
  const description = `Export item ${hex(3)}`;
  const itemId = await makeItem({ description, supplierId, itemTypeId, unitLabel: "t" });
  const price = "5.20000000";
  await makePrice(itemId, price, "2026-09-01", "Sep-26");
  await makeLink(itemId, DUBLIN_ID, 1);

  await db.accountLock.create({ data: { accountKey: hex(32), consecutiveFailures: 2, level: 1 } });
  await db.authEvent.create({ data: { kind: "PIN_FAILURE", bucket: `device:${hex(16)}` } });
  await db.setupClaim.create({ data: { id: 1, userId: admin.id } });

  const count = await db.stockCount.create({
    data: {
      locationId: DUBLIN_ID,
      periodYear: 2026,
      periodMonth: 8,
      countDate: new Date("2026-08-31T00:00:00.000Z"),
      status: "SUBMITTED",
      createdById: staff.id,
      submittedAt: new Date("2026-09-01T09:15:00.123Z"),
      signedById: staff.id,
      signedAt: new Date("2026-09-01T09:14:00.456Z"),
      signatureSvg: "M 1 1 L 20 12",
      notes: "Signed fixture count",
    },
    select: { id: true },
  });
  await db.stockCountLine.create({
    data: { stockCountId: count.id, itemId, quantity: QUANTITY, unitPriceSnapshot: SNAPSHOT, note: "fixture line" },
  });

  const users = await db.user.findMany({ select: { pinHash: true, pinKeyId: true } });

  return {
    printedNever: [
      admin.username,
      admin.name,
      staff.username,
      staff.name,
      request.username,
      request.name,
      supplierName,
      description,
      price,
      "5.2",
      QUANTITY,
      SNAPSHOT,
    ],
    credentials: users
      .flatMap((user) => [user.pinHash, user.pinKeyId])
      .filter((value): value is string => typeof value === "string" && value !== ""),
    pendingRequest: [request.name, request.username],
  };
}

/** The model names of `prisma/schema.prisma`, sorted. */
export function schemaModels(): string[] {
  return [...readFileSync("prisma/schema.prisma", "utf8").matchAll(/^model (\w+) \{/gm)]
    .map((match) => match[1] ?? "")
    .sort();
}
