import { describe, expect, it } from "vitest";

import { foreignKeyOrder } from "@/server/deploy/restore";
import { ConflictError } from "@/server/errors";

/**
 * Spec 016 AC-10, review R2: `foreignKeyOrder`, the pure half of the restore's insert order.
 * No database: the foreign keys are given as a child-to-parents map, as `restore.ts` reads them
 * from the target's catalogue.
 */

function parentsOf(edges: readonly [child: string, parent: string][], tables: readonly string[]): Map<string, Set<string>> {
  const parents = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]));
  for (const [child, parent] of edges) parents.get(child)?.add(parent);
  return parents;
}

// The schema's own foreign keys, child first (prisma/schema.prisma).
const SCHEMA_EDGES: [string, string][] = [
  ["SetupClaim", "User"],
  ["Item", "Supplier"],
  ["Item", "ItemType"],
  ["ItemPrice", "Item"],
  ["ItemLocation", "Item"],
  ["ItemLocation", "Location"],
  ["StockCount", "Location"],
  ["StockCount", "User"],
  ["StockCountLine", "StockCount"],
  ["StockCountLine", "Item"],
];

const SCHEMA_TABLES = [
  "StockCountLine",
  "StockCount",
  "SetupClaim",
  "ItemPrice",
  "ItemLocation",
  "Item",
  "ItemType",
  "Supplier",
  "Location",
  "User",
  "AuthEvent",
  "AccountLock",
];

describe("016 AC-10 (review R2): foreignKeyOrder", () => {
  it("R2: orders every parent before its children, for the schema's own foreign keys, children listed first", () => {
    const order = foreignKeyOrder(SCHEMA_TABLES, parentsOf(SCHEMA_EDGES, SCHEMA_TABLES));

    expect([...order].sort()).toEqual([...SCHEMA_TABLES].sort());
    for (const [child, parent] of SCHEMA_EDGES) {
      expect(order.indexOf(parent), `${parent} before ${child}`).toBeLessThan(order.indexOf(child));
    }
  });

  it("R2: a parent that is not among the tables does not hold its children back", () => {
    const tables = ["Child", "Other"];

    const order = foreignKeyOrder(tables, parentsOf([["Child", "Elsewhere"]], tables));

    expect(order).toEqual(["Child", "Other"]);
  });

  it("R2: a two-table cycle throws ConflictError naming both tables", () => {
    const tables = ["Alpha", "Beta", "Free"];
    const parents = parentsOf(
      [
        ["Alpha", "Beta"],
        ["Beta", "Alpha"],
      ],
      tables,
    );

    expect(() => foreignKeyOrder(tables, parents)).toThrow(ConflictError);
    expect(() => foreignKeyOrder(tables, parents)).toThrow(/Alpha, Beta/);
  });
});
