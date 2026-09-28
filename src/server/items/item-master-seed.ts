import { db } from "@/server/db";
import { ConflictError } from "@/server/errors";
import { importWorkbook } from "@/server/items/workbook-import-service";
import type { TableCounts } from "@/server/items/workbook-plan";

/**
 * The item master, loaded once and only into an empty database (spec 016 D9, AC-6).
 *
 * The production build runs this on every release. It is safe to, because it looks before
 * it writes: #5's importer is insert-only, but its second matching pass is by description
 * alone, so a bare re-run after an ADMIN has renamed an item would create the workbook's
 * original again. Here the importer runs only when all five master tables are empty, and
 * never when any of them holds a row.
 */

/** The five tables the importer writes, in the order every message and line names them. */
export type MasterCounts = TableCounts;

export type SeedOutcome = { outcome: "SEEDED" | "SKIPPED"; counts: MasterCounts };

/** The five tables by name, beside the key that counts each one. */
export const MASTER_TABLES: readonly { table: string; key: keyof MasterCounts }[] = [
  { table: "Supplier", key: "suppliers" },
  { table: "ItemType", key: "itemTypes" },
  { table: "Item", key: "items" },
  { table: "ItemPrice", key: "prices" },
  { table: "ItemLocation", key: "links" },
];

/** The five row counts, read in one transaction so they describe one moment. */
export async function readMasterCounts(): Promise<MasterCounts> {
  const [suppliers, itemTypes, items, prices, links] = await db.$transaction([
    db.supplier.count(),
    db.itemType.count(),
    db.item.count(),
    db.itemPrice.count(),
    db.itemLocation.count(),
  ]);
  return { suppliers, itemTypes, items, prices, links };
}

export async function seedItemMasterIfEmpty(input: {
  fileName: string;
  bytes: Buffer;
}): Promise<SeedOutcome> {
  const counts = await readMasterCounts();
  const filled = MASTER_TABLES.filter(({ key }) => counts[key] > 0).length;

  if (filled === MASTER_TABLES.length) {
    return { outcome: "SKIPPED", counts };
  }

  if (filled > 0) {
    throw new ConflictError(
      "The item master is partly filled, so it is neither seeded nor skipped: " +
        MASTER_TABLES.map(({ table, key }) => `${table} ${counts[key]}`).join(", ") +
        ". Nothing was written.",
    );
  }

  const { created } = await importWorkbook({ fileName: input.fileName, bytes: input.bytes });
  return { outcome: "SEEDED", counts: created };
}
