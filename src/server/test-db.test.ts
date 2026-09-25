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

/**
 * The eight tables of spec 020's "Data touched" table, quoted from the spec, and the three
 * #21 added (021 AC-4).
 */
const EXPECTED_TRUNCATED = [
  "AccountLock",
  "AuthEvent",
  "Item",
  "ItemLocation",
  "ItemPrice",
  "ItemType",
  "SetupClaim",
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
  it("AC-2, amended by 021 AC-4: TRUNCATED_TABLES equals the eleven emptied tables as a set", () => {
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
  //
  // 021 AC-1 amends the unit half: #21 adds two ids that are not cuids and have no default.
  // `AccountLock.accountKey` is the HMAC of a typed username, computed by the application
  // (021 S5), and `SetupClaim.id` is the `Int` that is always 1 (021 S9). An `@id` with no
  // default creates no sequence, so the claim this half supports is unchanged.
  const idDeclarations: { owner: string; line: string }[] = [];
  let model = "";
  for (const line of SCHEMA_SOURCE.split("\n")) {
    const opened = /^model\s+(\w+)\s*\{/.exec(line);
    if (opened !== null) model = opened[1];
    else if (/^\}/.test(line)) model = "";
    else if (/(?<!@)@id\b/.test(line)) {
      idDeclarations.push({ owner: `${model}.${line.trim().split(/\s+/)[0]}`, line: line.trim() });
    }
  }

  it("AC-6, amended by 021 AC-1: prisma/schema.prisma declares twelve ids, ten of them @default(cuid()) and exactly AccountLock.accountKey and SetupClaim.id with no @default", () => {
    // The count is what stops the line filter from silently matching nothing.
    expect(idDeclarations).toHaveLength(12);

    const cuids = idDeclarations.filter(({ line }) => line.includes("@default(cuid())"));
    expect(cuids, cuids.map(({ owner }) => owner).join(", ")).toHaveLength(10);

    const noDefault = idDeclarations
      .filter(({ line }) => !line.includes("@default"))
      .map(({ owner }) => owner)
      .sort();
    expect(noDefault).toEqual(["AccountLock.accountKey", "SetupClaim.id"]);
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
