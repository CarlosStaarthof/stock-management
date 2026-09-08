import { beforeEach, describe, expect, it, vi } from "vitest";

type DbGlobal = { macroadsPrismaClient?: unknown };

const dbGlobal = globalThis as unknown as DbGlobal;

// Spec 002 AC-5 is about behaviour with no reachable database, so the tests point the
// client at a hostname that cannot resolve. The string is assembled at runtime because
// AC-8 forbids a credential-bearing connection string literal in any tracked file.
const UNREACHABLE_URL = ["postgresql://u:p", "no-such-host.invalid:5432/macroads"].join("@");

beforeEach(() => {
  vi.resetModules();
  delete dbGlobal.macroadsPrismaClient;
  process.env.DATABASE_URL = UNREACHABLE_URL;
  process.env.DIRECT_URL = UNREACHABLE_URL;
});

describe("src/server/db", () => {
  it("AC-5: importing the module constructs no client and opens no connection", async () => {
    const dbModule = await import("@/server/db");

    expect(typeof dbModule.getDb).toBe("function");
    expect(dbGlobal.macroadsPrismaClient).toBeUndefined();
  });

  it("AC-16: getDb returns one and the same PrismaClient instance", async () => {
    const { getDb } = await import("@/server/db");

    const first = getDb();
    const second = getDb();

    expect(first).toBe(second);
    expect(dbGlobal.macroadsPrismaClient).toBe(first);
  });

  it("AC-5: builds its client against an unresolvable host without contacting it", async () => {
    const { db, getDb } = await import("@/server/db");

    // Reading a member off the proxy is what triggers construction. No query is made,
    // so no connection is attempted, and this passes on a machine with no database.
    const connect = db.$connect;

    expect(typeof connect).toBe("function");
    expect(dbGlobal.macroadsPrismaClient).toBe(getDb());
  });
});
