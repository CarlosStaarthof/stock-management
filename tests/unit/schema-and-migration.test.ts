import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Spec 003 AC-1 and AC-2 as facts about files, checkable with no database.
 *
 * The schema is the contract between this feature and #4 `domain_schema`: #3 owns `User`
 * and `Role` and stops. These assertions are what stops "and stops" from being a promise.
 */

const schema = readFileSync("prisma/schema.prisma", "utf8");
const schemaLines = schema.split("\n");
const MIGRATIONS_DIR = "prisma/migrations";

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

/** The field names of a model block, in declaration order. */
function fieldsOf(body: string[]): string[] {
  return body
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//") && !line.startsWith("@@"))
    .map((line) => line.split(/\s+/)[0]);
}

// Everything specs/domain-model.md Part 3 defines that belongs to feature #4, not #3.
const FEATURE_4_DECLARATIONS = [
  "Location",
  "Supplier",
  "ItemType",
  "Item",
  "ItemPrice",
  "ItemLocation",
  "StockCount",
  "StockCountLine",
  "CountStatus",
  "UnitKind",
];

describe("prisma schema", () => {
  it("AC-1: declares exactly one model, User, and exactly one enum, Role", () => {
    expect(declarations("model")).toEqual(["User"]);
    expect(declarations("enum")).toEqual(["Role"]);
  });

  it("AC-1: Role is exactly { YARD_STAFF ADMIN }", () => {
    const values = blockBody("enum", "Role")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"));

    expect(values).toEqual(["YARD_STAFF", "ADMIN"]);
  });

  it("AC-1: no feature #4 declaration appears anywhere in the file", () => {
    for (const name of FEATURE_4_DECLARATIONS) {
      expect(schemaLines).not.toContain(`model ${name} {`);
      expect(schemaLines).not.toContain(`enum ${name} {`);
    }
  });

  it("AC-2: User carries the eight fields of the domain model and no others", () => {
    expect(fieldsOf(blockBody("model", "User"))).toEqual([
      "id",
      "email",
      "name",
      "passwordHash",
      "role",
      "active",
      "createdAt",
      "updatedAt",
    ]);
  });

  it("AC-2: email is unique, role defaults to YARD_STAFF, active defaults to true", () => {
    const body = blockBody("model", "User").join("\n");

    expect(body).toMatch(/email\s+String\s+@unique/);
    expect(body).toMatch(/role\s+Role\s+@default\(YARD_STAFF\)/);
    expect(body).toMatch(/active\s+Boolean\s+@default\(true\)/);
    expect(body).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(body).toMatch(/updatedAt\s+DateTime\s+@updatedAt/);
    expect(body).toMatch(/id\s+String\s+@id\s+@default\(cuid\(\)\)/);
  });
});

describe("the first migration", () => {
  const directories = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
    : [];

  it("AC-2: prisma/migrations holds one directory, <timestamp>_create_user", () => {
    expect(directories).toHaveLength(1);
    expect(directories[0]).toMatch(/^\d{14}_create_user$/);
  });

  it("AC-2: its SQL creates the Role type, the User table and a unique index on email", () => {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${directories[0]}/migration.sql`, "utf8");

    expect(sql).toMatch(/CREATE TYPE "Role" AS ENUM \('YARD_STAFF', 'ADMIN'\)/);
    expect(sql).toMatch(/CREATE TABLE "User"/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX "User_email_key" ON "User"\("email"\)/);
    expect(sql).toMatch(/"passwordHash" TEXT NOT NULL/);
    expect(sql).toMatch(/"active" BOOLEAN NOT NULL DEFAULT true/);
  });

  it("AC-2: migration_lock.toml records provider postgresql", () => {
    const lock = readFileSync(`${MIGRATIONS_DIR}/migration_lock.toml`, "utf8");

    expect(lock).toMatch(/provider\s*=\s*"postgresql"/);
  });
});
