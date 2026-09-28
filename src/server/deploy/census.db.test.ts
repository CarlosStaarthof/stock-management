import { randomBytes } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generatePin } from "@/server/auth/credential-rules";
import { createActiveProfile } from "@/server/auth/operator-service";
import { db } from "@/server/db";
import { databaseCensus, renderCensus } from "@/server/deploy/census";
import { resetTestDb } from "@/server/test-db";
import { DUBLIN_ID, makeItem, makeItemType, makeLink, makePrice, makeSupplier } from "../../../tests/support/item-master-fixture";
import { runScript } from "../../../tests/support/run-script";

/**
 * Spec 016 AC-7: `npm run db:census` reports counts and nothing else.
 *
 * The fixture holds a named profile whose PIN was made under this run's pepper, a second
 * whose PIN was made under another pepper, and a priced item. Every PIN is drawn at run
 * time and every pepper is random bytes set with `vi.stubEnv`.
 */

beforeEach(async () => {
  await resetTestDb();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

const LATEST_MIGRATION = readdirSync("prisma/migrations")
  .filter((name) => statSync(join("prisma/migrations", name)).isDirectory())
  .sort()
  .at(-1);

type Fixture = { forbidden: string[] };

async function fixture(): Promise<Fixture> {
  const current = await createActiveProfile({
    name: `Census Current ${hex(4)}`,
    username: `cc${hex(6)}`,
    role: "ADMIN",
    pin: generatePin(6),
  });

  vi.stubEnv("PIN_PEPPER", randomBytes(32).toString("base64"));
  const other = await createActiveProfile({
    name: `Census Other ${hex(4)}`,
    username: `co${hex(6)}`,
    role: "YARD_STAFF",
    pin: generatePin(6),
  });
  vi.unstubAllEnvs();

  const supplierId = await makeSupplier(`Census Supplier ${hex(3)}`);
  const itemTypeId = await makeItemType(`CENSUS_${hex(3)}`, 1);
  const itemId = await makeItem({ description: `Census item ${hex(3)}`, supplierId, itemTypeId, needsReview: true });
  const price = `${1000 + (randomBytes(2).readUInt16BE() % 9000)}.${hex(4).replace(/[a-f]/g, "7")}`;
  await makePrice(itemId, price, "2026-09-01");
  await makeLink(itemId, DUBLIN_ID, 1);

  const users = await db.user.findMany({ select: { username: true, name: true, pinHash: true, pinKeyId: true } });
  const host = new URL(process.env.DATABASE_URL ?? "").hostname;

  return {
    forbidden: [
      ...users.flatMap((user) => [user.username, user.name, user.pinHash, user.pinKeyId]),
      current.username,
      other.username,
      price,
      price.replace(/0+$/, ""),
      host,
      process.env.DATABASE_URL,
    ].filter((value): value is string => typeof value === "string" && value.length >= 4),
  };
}

function leaks(text: string, forbidden: readonly string[]): number {
  return forbidden.filter((value) => text.includes(value)).length;
}

describe("016 AC-7: the census reports counts and nothing else", () => {
  it("AC-7: npm run db:census prints one [db:census] line each, in order, and says pins: 1 of 2", async () => {
    const { forbidden } = await fixture();

    const run = runScript("scripts/db-census.ts", [], process.env);

    expect(run.status, "exit status").toBe(0);
    expect(run.stdout.trim().split(/\r?\n/)).toEqual([
      "[db:census] locations: 2",
      "[db:census] suppliers: 1",
      "[db:census] item types: 1",
      "[db:census] items: 1, 1 need review",
      "[db:census] prices: 1",
      "[db:census] yard links: 1",
      "[db:census] profiles: ADMIN ACTIVE 1, YARD_STAFF ACTIVE 1",
      "[db:census] stock counts: none",
      "[db:census] count lines: 0",
      `[db:census] migrations: 3 applied, latest ${LATEST_MIGRATION}`,
      "[db:census] pins: 1 of 2 made under the given PIN_PEPPER",
    ]);
    expect(leaks(run.printed, forbidden), "values printed that must never be").toBe(0);
    // Non-vacuity: the scan holds the usernames, both key ids, the price and the host.
    expect(forbidden.length).toBeGreaterThanOrEqual(9);
  });

  it("AC-7: the census object carries counts only, and the same lines render from it", async () => {
    const { forbidden } = await fixture();

    const census = await databaseCensus();

    expect(leaks(JSON.stringify(census), forbidden)).toBe(0);
    expect(census.pins).toEqual({ checked: true, underGivenPepper: 1, stored: 2 });
    expect(renderCensus(census).at(-1)).toBe("[db:census] pins: 1 of 2 made under the given PIN_PEPPER");
  });

  it("AC-7: without a usable PIN_PEPPER the pins line says it was not checked, and prints no key id", async () => {
    const { forbidden } = await fixture();
    vi.stubEnv("PIN_PEPPER", "");

    const lines = renderCensus(await databaseCensus());

    expect(lines.at(-1)).toBe("[db:census] pins: 2 stored, not checked: PIN_PEPPER is not set or not usable");
    expect(leaks(lines.join("\n"), forbidden)).toBe(0);
  });
});
