import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Feature #22 AC-2 against a real Postgres, from a schema that stops just before the role
 * existed.
 *
 * The migrations are already applied to the test database, so this file builds a throwaway
 * schema and applies the history up to `20261117120000_add_super_admin_role` itself. It then
 * applies the two new migrations VERBATIM, so the assertion is about the files a deployment
 * runs, not a paraphrase of them.
 *
 * `TEST_DATABASE_URL` only, as the rename test does: this file creates a schema of its own
 * and must never touch the developer's database.
 */

const MIGRATIONS_DIR = "prisma/migrations";
const ENUM_DIR = "20261117120000_add_super_admin_role";
const PROMOTE_DIR = "20261117121000_promote_carlos_super_admin";

function migrationDirectories(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * A migration's statements, with full-line comments dropped and `$$` bodies kept whole:
 * the DO block in the promote migration contains semicolons of its own.
 */
function statementsOf(sql: string): string[] {
  const text = sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");

  const statements: string[] = [];
  let current = "";
  let inDollar = false;

  for (let index = 0; index < text.length; index += 1) {
    if (text.startsWith("$$", index)) {
      inDollar = !inDollar;
      current += "$$";
      index += 1;
      continue;
    }

    const character = text[index];
    current += character;
    if (character === ";" && !inDollar) {
      if (current.trim() !== "") statements.push(current.trim());
      current = "";
    }
  }

  if (current.trim() !== "") statements.push(current.trim());
  return statements;
}

function sqlOf(directory: string): string {
  return readFileSync(`${MIGRATIONS_DIR}/${directory}/migration.sql`, "utf8");
}

function withSchema(url: string, schema: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("schema", schema);
  return parsed.toString();
}

const BASE_URL = (process.env["TEST_DATABASE_URL"] ?? "").trim();
if (BASE_URL === "") {
  throw new Error(
    "super-admin-migration.db.test.ts requires TEST_DATABASE_URL; it never connects to DATABASE_URL.",
  );
}
const SCHEMA = `mig_super_${randomBytes(5).toString("hex")}`;

const admin = new PrismaClient({ datasources: { db: { url: BASE_URL } } });
const scoped = new PrismaClient({ datasources: { db: { url: withSchema(BASE_URL, SCHEMA) } } });

async function apply(directory: string): Promise<void> {
  for (const statement of statementsOf(sqlOf(directory))) {
    await scoped.$executeRawUnsafe(statement);
  }
}

/** The promote file as one transaction, so a raised exception rolls its UPDATE back. */
async function applyPromoteAtomically(): Promise<void> {
  await scoped.$transaction(async (tx) => {
    for (const statement of statementsOf(sqlOf(PROMOTE_DIR))) {
      await tx.$executeRawUnsafe(statement);
    }
  });
}

async function carlos(): Promise<{
  id: string;
  username: string | null;
  name: string;
  role: string;
  status: string;
  pinHash: string | null;
  pinKeyId: string | null;
  sessionEpoch: number;
  createdAt: Date;
}> {
  return scoped.user.findUniqueOrThrow({
    where: { username: "carlos-staarthof" },
    select: {
      id: true,
      username: true,
      name: true,
      role: true,
      status: true,
      pinHash: true,
      pinKeyId: true,
      sessionEpoch: true,
      createdAt: true,
    },
  });
}

beforeAll(async () => {
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${SCHEMA}"`);

  for (const directory of migrationDirectories().filter((name) => name < ENUM_DIR)) {
    await apply(directory);
  }
});

afterAll(async () => {
  await scoped.$disconnect();
  await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await admin.$disconnect();
});

describe("022 AC-2: the migrations promote an existing profile and never create one", () => {
  it("AC-2: no carlos row means no insert and no SUPER_ADMIN; a carlos row is promoted in place, idempotently, and a second SUPER_ADMIN refuses", async () => {
    await apply(ENUM_DIR);

    // --- no carlos: nothing is inserted ---------------------------------------------
    await applyPromoteAtomically();
    expect(await scoped.user.count()).toBe(0);
    expect(await scoped.user.count({ where: { role: "SUPER_ADMIN" } })).toBe(0);

    // --- carlos exists: only the role changes ---------------------------------------
    const created = await scoped.user.create({
      data: {
        username: "carlos-staarthof",
        name: "Carlos Staarthof",
        role: "ADMIN",
        status: "ACTIVE",
        pinHash: "fixture-pin-hash",
        pinKeyId: "fixture-pin-key",
        sessionEpoch: 7,
      },
      select: { id: true },
    });
    const before = await carlos();
    expect(before.id).toBe(created.id);
    expect(before.role).toBe("ADMIN");

    await applyPromoteAtomically();
    const after = await carlos();
    expect(after.role).toBe("SUPER_ADMIN");
    expect({ ...after, role: "ADMIN" }).toEqual(before);

    // --- idempotent: the second application writes the same row --------------------
    await applyPromoteAtomically();
    expect(await carlos()).toEqual(after);

    // --- more than one SUPER_ADMIN refuses, rolling the promote back ----------------
    await scoped.user.create({
      data: {
        username: "another-super",
        name: "Another Super",
        role: "SUPER_ADMIN",
        status: "ACTIVE",
      },
      select: { id: true },
    });

    await expect(applyPromoteAtomically()).rejects.toThrow();
    expect(await scoped.user.count({ where: { role: "SUPER_ADMIN" } })).toBe(2);
    expect((await carlos()).role).toBe("SUPER_ADMIN");
  });

  it("AC-2: neither file inserts a profile, and the enum file carries a contract-step line", () => {
    for (const directory of [ENUM_DIR, PROMOTE_DIR]) {
      expect(sqlOf(directory), directory).not.toMatch(/\bINSERT\s+INTO\b/i);
    }
    expect(sqlOf(ENUM_DIR)).toMatch(/^-- contract-step:/m);
    expect(sqlOf(ENUM_DIR)).toMatch(/ALTER TYPE "Role" ADD VALUE 'SUPER_ADMIN'/);
    expect(sqlOf(PROMOTE_DIR)).toMatch(/WHERE "username" = 'carlos-staarthof'/);
  });
});
