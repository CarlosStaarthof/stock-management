import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { resetTestDb, SEEDED_LOCATIONS, TRUNCATED_TABLES } from "@/server/test-db";

/**
 * Spec 020, the half that needs no database (AC-13): the module's contract, the shape of
 * the truncate list, and the proof that `RESTART IDENTITY` would be a no-op.
 *
 * The database half — what actually reaches Postgres, and what the tables hold afterwards
 * — is `src/server/test-db.db.test.ts`, which `npm run test:db` runs.
 */

type DbGlobal = { macroadsPrismaClient?: unknown };

const MODULE_SOURCE = readFileSync("src/server/test-db.ts", "utf8");
const SCHEMA_SOURCE = readFileSync("prisma/schema.prisma", "utf8");

/** The eight tables of spec 020's "Data touched" table, quoted from the spec. */
const EXPECTED_TRUNCATED = [
  "Item",
  "ItemLocation",
  "ItemPrice",
  "ItemType",
  "StockCount",
  "StockCountLine",
  "Supplier",
  "User",
];

describe("the contract, unchanged", () => {
  it("AC-1: resetTestDb is still an exported function of no arguments", () => {
    expect(typeof resetTestDb).toBe("function");
    expect(resetTestDb.length).toBe(0);
  });

  it("AC-1: SEEDED_LOCATIONS still carries the two migration rows, field for field", () => {
    expect(SEEDED_LOCATIONS.map((location) => ({ ...location }))).toEqual([
      { id: "loc_dublin", code: "DUBLIN", name: "Dublin", active: true, sortOrder: 1 },
      { id: "loc_clonmel", code: "CLONMEL", name: "Clonmel", active: true, sortOrder: 2 },
    ]);
  });
});

describe("the truncate list", () => {
  it("AC-2: TRUNCATED_TABLES equals the eight emptied tables as a set", () => {
    expect([...TRUNCATED_TABLES].sort()).toEqual([...EXPECTED_TRUNCATED].sort());
  });

  it("AC-4: it holds no duplicate and does not contain Location", () => {
    expect(new Set(TRUNCATED_TABLES).size).toBe(TRUNCATED_TABLES.length);
    expect(TRUNCATED_TABLES).not.toContain("Location");
  });

  it("AC-2: the module issues no per-model delete and opens no interactive transaction", () => {
    // Read from disk rather than reasoned about: eleven round-trips per reset is exactly
    // what nine `deleteMany` calls and two upserts cost, and this is what stops them
    // creeping back one convenience at a time.
    expect(MODULE_SOURCE).not.toContain("deleteMany");
    expect(MODULE_SOURCE).not.toContain("$transaction");
    expect(MODULE_SOURCE).not.toContain("upsert");
  });
});

describe("RESTART IDENTITY would reset nothing", () => {
  // The other half of AC-6 — that the schema owns zero sequences in `pg_class` — is in
  // src/server/test-db.db.test.ts. This half needs no database at all.
  const idLines = SCHEMA_SOURCE.split("\n").filter((line) => /(?<!@)@id\b/.test(line));

  it("AC-6: prisma/schema.prisma declares nine ids, every one of them @default(cuid())", () => {
    expect(idLines).toHaveLength(9);

    for (const line of idLines) {
      expect(line, line.trim()).toContain("@default(cuid())");
    }
  });

  it("AC-6: no id anywhere in the schema is an autoincrement", () => {
    expect(SCHEMA_SOURCE).not.toContain("autoincrement");
  });
});

describe("importing the module touches no database", () => {
  it("AC-13: no PrismaClient is constructed by the import above", () => {
    // This file is in `npm run test:unit`, which runs with no database reachable; the
    // deferred proxy in src/server/db.ts is what makes that possible, and this is the
    // assertion that it is still deferred.
    expect((globalThis as unknown as DbGlobal).macroadsPrismaClient).toBeUndefined();
  });
});
