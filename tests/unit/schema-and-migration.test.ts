import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The schema and the migration history as facts about files, checkable with no database.
 *
 * Written for #3, when the whole contract was "`User` and `Role`, and stop". #4
 * domain_schema REPLACES that contract rather than removing it (spec 004 AC-2): the
 * "exactly one model" assertion becomes an equality over the full nine models and three
 * enums, and the scan for the ten names #4 was going to add becomes a scan for the six M7
 * names it must still not add. The schema cannot drift silently in either direction.
 *
 * Everything a database can answer better - column types, precision, delete rules - is
 * asserted against Postgres in src/server/schema/*.db.test.ts, not here. A test that reads
 * `Decimal(18, 8)` out of this file proves nothing about the column that exists.
 */

const SCHEMA_PATH = "prisma/schema.prisma";
const MIGRATIONS_DIR = "prisma/migrations";

const schema = readFileSync(SCHEMA_PATH, "utf8");
const schemaLines = schema.split("\n");

/** Declarations at the start of a line, so a comment mentioning "model" does not count. */
function declarations(kind: "model" | "enum"): string[] {
  return schemaLines
    .filter((line) => line.startsWith(`${kind} `) && line.trimEnd().endsWith("{"))
    .map((line) => line.slice(kind.length + 1).replace("{", "").trim());
}

/** The lines of a `model X { … }` / `enum X { … }` block, without its braces. */
function blockBody(kind: "model" | "enum", name: string): string[] {
  const start = schemaLines.indexOf(`${kind} ${name} {`);
  expect(start).toBeGreaterThanOrEqual(0);

  const body: string[] = [];
  for (let index = start + 1; index < schemaLines.length; index += 1) {
    if (schemaLines[index] === "}") break;
    body.push(schemaLines[index]);
  }
  return body;
}

/** `[name, type]` for every field line of a model block, in declaration order. */
function fieldEntries(body: string[]): Array<[string, string]> {
  return body
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("@@"))
    .map((line) => {
      const [name, type] = line.split(/\s+/);
      return [name, type] as [string, string];
    });
}

/** The type without its optional `?` and list `[]` markers. */
function baseType(type: string): string {
  return type.replace(/\?$/, "").replace(/\[\]$/, "");
}

// specs/domain-model.md Part 3, and the spec 004 "Data touched" block that quotes it.
const EXPECTED_MODELS = [
  "User",
  "Location",
  "Supplier",
  "ItemType",
  "Item",
  "ItemPrice",
  "ItemLocation",
  "StockCount",
  "StockCountLine",
];

const EXPECTED_ENUMS = ["Role", "CountStatus", "UnitKind"];

/** Deferred to M7 by Part 3. Not one field of these may appear (spec 004 scope boundary). */
const M7_DECLARATIONS = [
  "Vehicle",
  "BoilerReading",
  "BagReading",
  "YardBulkReading",
  "BoilerMaterial",
  "BagMaterial",
];

/** A field is a relation when its type is one of the models. Enums and scalars are not. */
function isRelation(type: string): boolean {
  return EXPECTED_MODELS.includes(baseType(type));
}

function scalarFieldsOf(model: string): string[] {
  return fieldEntries(blockBody("model", model))
    .filter(([, type]) => !isRelation(type))
    .map(([name]) => name);
}

function relationFieldsOf(model: string): string[] {
  return fieldEntries(blockBody("model", model))
    .filter(([, type]) => isRelation(type))
    .map(([name]) => name);
}

// Exactly the "Data touched" block of specs/features/004-domain_schema.md, which is
// specs/domain-model.md Part 3 with nothing added: no createdAt / updatedAt anywhere but
// User (from #3) and ItemPrice, and no audit column.
const EXPECTED_SCALARS: Record<string, string[]> = {
  User: ["id", "email", "name", "passwordHash", "role", "active", "createdAt", "updatedAt"],
  Location: ["id", "code", "name", "active", "sortOrder"],
  Supplier: ["id", "name", "active"],
  ItemType: ["id", "code", "name", "sortOrder"],
  Item: [
    "id",
    "description",
    "supplierId",
    "itemTypeId",
    "unitLabel",
    "unitKind",
    "unitQuantityKg",
    "active",
    "needsReview",
    "notes",
  ],
  ItemPrice: ["id", "itemId", "unitPrice", "currency", "effectiveFrom", "label", "createdAt"],
  ItemLocation: ["id", "itemId", "locationId", "sortOrder", "active"],
  StockCount: [
    "id",
    "locationId",
    "periodYear",
    "periodMonth",
    "countDate",
    "status",
    "createdById",
    "submittedAt",
    "approvedById",
    "approvedAt",
    "notes",
    "signedById",
    "signedAt",
    "signatureSvg",
  ],
  StockCountLine: [
    "id",
    "stockCountId",
    "itemId",
    "quantity",
    "unitPriceSnapshot",
    "note",
  ],
};

const EXPECTED_RELATIONS: Record<string, string[]> = {
  User: ["stockCountsCreated", "stockCountsApproved", "stockCountsSigned"],
  Location: ["itemLinks", "stockCounts"],
  Supplier: ["items"],
  ItemType: ["items"],
  Item: ["supplier", "itemType", "prices", "locations", "lines"],
  ItemPrice: ["item"],
  ItemLocation: ["item", "location"],
  StockCount: ["location", "createdBy", "approvedBy", "signedBy", "lines"],
  StockCountLine: ["stockCount", "item"],
};

const migrationDirectories = existsSync(MIGRATIONS_DIR)
  ? readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
  : [];

function migrationSql(directory: string): string {
  return readFileSync(`${MIGRATIONS_DIR}/${directory}/migration.sql`, "utf8");
}

const createUserDirectory = migrationDirectories.find((name) => name.endsWith("_create_user"));
const createStockDomainDirectory = migrationDirectories.find((name) =>
  name.endsWith("_create_stock_domain"),
);

/** Every column name a CREATE TABLE statement in this SQL declares. */
function declaredColumns(sql: string): string[] {
  const columns: string[] = [];
  let inTable = false;

  for (const raw of sql.split("\n")) {
    const line = raw.trim();
    if (/^CREATE TABLE /i.test(line)) {
      inTable = true;
      continue;
    }
    if (inTable) {
      if (line.startsWith(");")) {
        inTable = false;
        continue;
      }
      const match = /^"([A-Za-z0-9_]+)"\s+\S/.exec(line);
      if (match) columns.push(match[1]);
    }
  }
  return columns;
}

describe("prisma schema declarations", () => {
  it("004 AC-1: declares exactly nine models and exactly three enums, compared as sets", () => {
    // Equality, not a count: a model swapped for another would pass a count.
    expect([...declarations("model")].sort()).toEqual([...EXPECTED_MODELS].sort());
    expect([...declarations("enum")].sort()).toEqual([...EXPECTED_ENUMS].sort());
  });

  it("004 AC-1: no M7 declaration appears anywhere in the file", () => {
    for (const name of M7_DECLARATIONS) {
      expect(schemaLines).not.toContain(`model ${name} {`);
      expect(schemaLines).not.toContain(`enum ${name} {`);
      expect(declarations("model")).not.toContain(name);
      expect(declarations("enum")).not.toContain(name);
    }
  });

  it("004 AC-3: Role, CountStatus and UnitKind carry Part 3's values in Part 3's order", () => {
    const valuesOf = (name: string): string[] =>
      blockBody("enum", name)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("//"));

    expect(valuesOf("Role")).toEqual(["YARD_STAFF", "ADMIN"]);
    expect(valuesOf("CountStatus")).toEqual(["DRAFT", "SUBMITTED", "APPROVED"]);
    expect(valuesOf("UnitKind")).toEqual([
      "TONNE",
      "KILOGRAM",
      "LITRE",
      "UNIT",
      "LINEAR_METRE",
    ]);
  });

  it("004 AC-4: every model's scalar field list equals Part 3, exactly and in order", () => {
    for (const model of EXPECTED_MODELS) {
      expect(scalarFieldsOf(model), `scalar fields of ${model}`).toEqual(
        EXPECTED_SCALARS[model],
      );
    }
  });

  it("004 AC-4: every model's relation field list is exactly the spec's, and no more", () => {
    for (const model of EXPECTED_MODELS) {
      expect(relationFieldsOf(model), `relation fields of ${model}`).toEqual(
        EXPECTED_RELATIONS[model],
      );
    }
  });

  it("003 AC-2 / 004 AC-5: User keeps its eight scalar fields and gains exactly three relations", () => {
    expect(scalarFieldsOf("User")).toEqual([
      "id",
      "email",
      "name",
      "passwordHash",
      "role",
      "active",
      "createdAt",
      "updatedAt",
    ]);

    expect(relationFieldsOf("User")).toEqual([
      "stockCountsCreated",
      "stockCountsApproved",
      "stockCountsSigned",
    ]);
  });

  it("004 AC-5: the three User relations carry the relation names StockCount points back with", () => {
    const body = blockBody("model", "User").join("\n");

    expect(body).toMatch(/stockCountsCreated\s+StockCount\[\]\s+@relation\("StockCountCreatedBy"\)/);
    expect(body).toMatch(
      /stockCountsApproved\s+StockCount\[\]\s+@relation\("StockCountApprovedBy"\)/,
    );
    expect(body).toMatch(/stockCountsSigned\s+StockCount\[\]\s+@relation\("StockCountSignedBy"\)/);
  });

  it("003 AC-2: email is unique, role defaults to YARD_STAFF, active defaults to true", () => {
    const body = blockBody("model", "User").join("\n");

    expect(body).toMatch(/email\s+String\s+@unique/);
    expect(body).toMatch(/role\s+Role\s+@default\(YARD_STAFF\)/);
    expect(body).toMatch(/active\s+Boolean\s+@default\(true\)/);
    expect(body).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(body).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);
    expect(body).toMatch(/id\s+String\s+@id\s+@default\(cuid\(\)\)/);
  });

  it("004 AC-8: no field in the schema is declared Float", () => {
    const floats: string[] = [];

    for (const model of EXPECTED_MODELS) {
      for (const [name, type] of fieldEntries(blockBody("model", model))) {
        if (baseType(type) === "Float") floats.push(`${model}.${name}`);
      }
    }

    expect(floats).toEqual([]);
  });

  it("004 AC-1: the datasource is still postgresql on DATABASE_URL / DIRECT_URL", () => {
    expect(schema).toMatch(/provider\s*=\s*"postgresql"/);
    expect(schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
    expect(schema).toMatch(/directUrl\s*=\s*env\("DIRECT_URL"\)/);
  });
});

describe("the first migration, create_user", () => {
  it("003 AC-2: its SQL creates the Role type, the User table and a unique index on email", () => {
    expect(createUserDirectory).toBeDefined();
    const sql = migrationSql(createUserDirectory as string);

    expect(sql).toMatch(/CREATE TYPE "Role" AS ENUM \('YARD_STAFF', 'ADMIN'\)/);
    expect(sql).toMatch(/CREATE TABLE "User"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "User_email_key" ON "User"\("email"\)/);
    expect(sql).toMatch(/"passwordHash" TEXT NOT NULL/);
    expect(sql).toMatch(/"active" BOOLEAN NOT NULL DEFAULT true/);
  });

  it("004 AC-23: it was written once and has not been edited since", () => {
    // docs/conventions.md: never edit an applied migration, write a new one. One commit
    // touching this file is what "never edited" looks like from outside.
    const log = spawnSync(
      "git",
      ["log", "--oneline", "--", `${MIGRATIONS_DIR}/${createUserDirectory}/migration.sql`],
      { encoding: "utf8" },
    );

    const commits = (log.stdout ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    expect(commits).toHaveLength(1);
  });
});

describe("the second migration, create_stock_domain", () => {
  it("004 AC-23: prisma/migrations holds exactly two directories, in order", () => {
    expect(migrationDirectories).toHaveLength(2);
    expect(migrationDirectories[0]).toMatch(/^\d{14}_create_user$/);
    expect(migrationDirectories[1]).toMatch(/^\d{14}_create_stock_domain$/);
  });

  it("004 AC-23: migration_lock.toml still records provider postgresql and is unmodified", () => {
    const lock = readFileSync(`${MIGRATIONS_DIR}/migration_lock.toml`, "utf8");
    expect(lock).toMatch(/provider\s*=\s*"postgresql"/);

    const status = spawnSync(
      "git",
      ["status", "--porcelain", "--", `${MIGRATIONS_DIR}/migration_lock.toml`],
      { encoding: "utf8" },
    );

    expect((status.stdout ?? "").trim()).toBe("");
  });

  it("004 AC-23: the migration is additive - no DROP, no TRUNCATE, nothing aimed at User or Role", () => {
    const sql = migrationSql(createStockDomainDirectory as string);

    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/DROP TYPE/i);
    expect(sql).not.toMatch(/TRUNCATE/i);
    expect(sql).not.toMatch(/ALTER TABLE "User"/);
    expect(sql).not.toMatch(/ALTER TYPE "Role"/);

    // The only way "User" may appear is as the target of a foreign key from StockCount.
    const userMentions = sql.split("\n").filter((line) => line.includes('"User"'));
    expect(userMentions.length).toBeGreaterThan(0);
    for (const line of userMentions) {
      expect(line).toContain('REFERENCES "User"("id")');
      expect(line.startsWith('ALTER TABLE "StockCount"')).toBe(true);
    }

    expect(sql).not.toContain('"Role"');
  });

  it("004 AC-3: it creates the two new enum types with their labels in Part 3's order", () => {
    const sql = migrationSql(createStockDomainDirectory as string);

    expect(sql).toContain(`CREATE TYPE "CountStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED');`);
    expect(sql).toContain(
      `CREATE TYPE "UnitKind" AS ENUM ('TONNE', 'KILOGRAM', 'LITRE', 'UNIT', 'LINEAR_METRE');`,
    );
  });

  it("004 AC-10: it declares quantity nullable - no NOT NULL, no DEFAULT", () => {
    const sql = migrationSql(createStockDomainDirectory as string);

    const quantityLine = sql
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith('"quantity"'));

    expect(quantityLine).toBe('"quantity" DECIMAL(12,4),');
    expect(quantityLine).not.toMatch(/NOT NULL/);
    expect(quantityLine).not.toMatch(/DEFAULT/);
  });

  it("004 AC-11: it creates no value, total or amount column", () => {
    for (const directory of migrationDirectories) {
      const offenders = declaredColumns(migrationSql(directory)).filter((column) =>
        /value|total|amount/i.test(column),
      );
      expect(offenders, `columns created by ${directory}`).toEqual([]);
    }
  });

  it("004 AC-8: neither migration mentions DOUBLE PRECISION, REAL or FLOAT", () => {
    for (const directory of migrationDirectories) {
      const sql = migrationSql(directory);
      expect(sql, directory).not.toMatch(/DOUBLE PRECISION/i);
      expect(sql, directory).not.toMatch(/\bREAL\b/i);
      expect(sql, directory).not.toMatch(/\bFLOAT\b/i);
    }
  });

  it("004 AC-17 / AC-18: it adds the two CHECK constraints Prisma cannot express", () => {
    const sql = migrationSql(createStockDomainDirectory as string);

    expect(sql).toMatch(
      /ADD CONSTRAINT "Item_description_not_empty" CHECK \(btrim\("description"\) <> ''\)/,
    );
    expect(sql).toMatch(
      /ADD CONSTRAINT "StockCount_periodMonth_range" CHECK \("periodMonth" BETWEEN 1 AND 12\)/,
    );
  });

  it("004 AC-21: it ends with an idempotent insert of exactly the two yards", () => {
    const sql = migrationSql(createStockDomainDirectory as string).trimEnd();

    expect(sql.endsWith('ON CONFLICT ("code") DO NOTHING;')).toBe(true);
    expect(sql).toContain('INSERT INTO "Location" ("id", "code", "name", "active", "sortOrder")');
    expect(sql).toMatch(/\('loc_dublin',\s+'DUBLIN',\s+'Dublin',\s+true, 1\)/);
    expect(sql).toMatch(/\('loc_clonmel', 'CLONMEL', 'Clonmel', true, 2\)/);

    // Exactly two rows: a third yard would have to arrive through its own migration.
    const inserted = [...sql.matchAll(/\('loc_[a-z]+',/g)];
    expect(inserted).toHaveLength(2);
  });
});
