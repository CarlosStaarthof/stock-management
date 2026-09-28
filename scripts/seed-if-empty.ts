/**
 * The production build's `seed-if-empty` step (spec 016 D9, AC-6).
 *
 * It loads the item master from `Samples/Stock @ 01-Sep-2026.xlsx` into an empty database,
 * does nothing to one that already holds an item master, and fails the build for one that
 * holds part of one:
 *
 *   [seed] SEEDED: 10 suppliers, 19 item types, 140 items, 129 prices, 152 yard links
 *   [seed] SKIPPED: item master present (10 suppliers, ...)
 *
 * It exits 0 for both. The workbook is opened read-only; `Samples/` is never written.
 */
import { readFileSync } from "node:fs";

import { DomainError } from "@/server/errors";
import { seedItemMasterIfEmpty, type MasterCounts } from "@/server/items/item-master-seed";

const WORKBOOK = "Samples/Stock @ 01-Sep-2026.xlsx";
const PREFIX = "[seed]";

function described(counts: MasterCounts): string {
  return (
    `${counts.suppliers} suppliers, ${counts.itemTypes} item types, ${counts.items} items, ` +
    `${counts.prices} prices, ${counts.links} yard links`
  );
}

async function main(): Promise<void> {
  const result = await seedItemMasterIfEmpty({ fileName: WORKBOOK, bytes: readFileSync(WORKBOOK) });

  if (result.outcome === "SEEDED") {
    console.log(`${PREFIX} SEEDED: ${described(result.counts)}`);
  } else {
    console.log(`${PREFIX} SKIPPED: item master present (${described(result.counts)})`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    if (error instanceof DomainError) {
      // The message names the five tables and their counts, and nothing else.
      console.error(`${PREFIX} ${error.message}`);
      process.exit(1);
    }
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? ` (${String((error as { code?: unknown }).code)})`
        : "";
    console.error(`${PREFIX} failed: ${error instanceof Error ? error.name : "unknown error"}${code}`);
    process.exit(1);
  });
