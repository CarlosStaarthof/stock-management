import { db } from "@/server/db";

/**
 * Level 2 support (docs/verification.md): a real Postgres, emptied between tests, never
 * a mock of `PrismaClient`.
 *
 * It lives under `src/server/` because it touches Prisma and that is the only layer
 * allowed to (docs/architecture.md). It is used only by `*.db.test.ts`. It moved here
 * from `src/server/auth/` with feature #4: it empties nine tables now, not one, so it is
 * no longer auth's.
 *
 * The guard is not decoration. `npm run test:db` sets `MACROADS_TEST_DB` after proving
 * `TEST_DATABASE_URL` is set and is not `DATABASE_URL`; without that proof this function
 * refuses, so a stray `vitest run src/**\/*.db.test.ts` cannot empty a developer's table.
 *
 * Feature #20: two statements per reset, not eleven. Every round-trip to a database in
 * another region is an opportunity for a dropped link to fail the gate, and both of
 * 2026-09-11's red runs landed inside this function with zero assertion failures.
 */

/**
 * The two yards written by `20260909135148_create_stock_domain`, with the literal ids that
 * migration uses. `Location` is reference data, not test data: Invariant 7 is undefined
 * while the table is empty, so the reset restores these two rather than deleting them.
 */
export const SEEDED_LOCATIONS = [
  { id: "loc_dublin", code: "DUBLIN", name: "Dublin", active: true, sortOrder: 1 },
  { id: "loc_clonmel", code: "CLONMEL", name: "Clonmel", active: true, sortOrder: 2 },
] as const;

/**
 * The eleven tables the reset empties — every table in the schema except `Location`, which
 * is restored rather than emptied, and `_prisma_migrations`, which is Prisma's. #21 added
 * `AccountLock`, `AuthEvent` and `SetupClaim` (021 AC-4).
 *
 * Order is irrelevant: a single `TRUNCATE` over a set closed under its foreign keys has no
 * child-before-parent requirement, which is why the comment that used to describe one is
 * gone. `src/server/test-db.db.test.ts` asserts the closure and the equality with
 * `information_schema` (020 AC-4, AC-5), so a table added by a later feature and not added
 * here turns that test red instead of quietly keeping its rows between tests.
 */
export const TRUNCATED_TABLES: readonly string[] = [
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
] as const;

/** A single-quoted SQL literal. Every caller here passes a module constant. */
function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * No `CASCADE`, on purpose (020 AC-5): with it, a later table that references one of the
 * eight and is missing from `TRUNCATED_TABLES` would be emptied silently. Without it,
 * Postgres refuses the whole reset with `cannot truncate a table referenced in a foreign
 * key constraint` — wrong data replaced by a loud failure.
 *
 * No `RESTART IDENTITY` either (020 AC-6): the schema owns no sequence, because every id
 * is an application-supplied `cuid`, so it would reset nothing.
 */
const TRUNCATE_STATEMENT = `TRUNCATE TABLE ${TRUNCATED_TABLES.map(sqlIdentifier).join(", ")}`;

/**
 * `Location`, restored to exactly the two migration rows in ONE statement — whether a test
 * renamed one, archived one, re-sorted one, added a third yard or deleted one outright.
 *
 * A data-modifying CTE, so the removal of invented yards and the restoration of the two
 * seeded ones cost a single round-trip. The CTE is not referenced by the main query and
 * does not need to be: Postgres runs a data-modifying `WITH` exactly once and to
 * completion whether or not its output is read.
 */
const LOCATION_RESTORE_STATEMENT = `
  WITH removed AS (
    DELETE FROM "Location"
    WHERE "id" NOT IN (${SEEDED_LOCATIONS.map((location) => sqlText(location.id)).join(", ")})
  )
  INSERT INTO "Location" ("id", "code", "name", "active", "sortOrder")
  VALUES ${SEEDED_LOCATIONS.map(
    (location) =>
      `(${sqlText(location.id)}, ${sqlText(location.code)}, ${sqlText(location.name)}, ` +
      `${location.active ? "true" : "false"}, ${location.sortOrder})`,
  ).join(", ")}
  ON CONFLICT ("id") DO UPDATE SET
    "code" = EXCLUDED."code",
    "name" = EXCLUDED."name",
    "active" = EXCLUDED."active",
    "sortOrder" = EXCLUDED."sortOrder"`;

export async function resetTestDb(): Promise<void> {
  if (process.env.MACROADS_TEST_DB !== "1") {
    throw new Error(
      "resetTestDb() refuses to run: MACROADS_TEST_DB is not set. Run these tests with " +
        "`npm run test:db`, which points DATABASE_URL at TEST_DATABASE_URL first.",
    );
  }

  // Both strings are assembled at module load from the constants above and from nothing
  // else: no argument, no environment variable and no test-supplied value reaches them.
  //
  // Deliberately not wrapped in an interactive transaction: that adds a BEGIN and a
  // COMMIT round-trip, and the two statements need no atomicity between them — the
  // suite runs `fileParallelism: false` against one database and nothing else writes to it.
  // Keeping `Location` out of the truncate also means a link that drops between the two
  // leaves the yards present: the worst case is a stale test row, not a database with no
  // yards in it.
  await db.$executeRawUnsafe(TRUNCATE_STATEMENT);
  await db.$executeRawUnsafe(LOCATION_RESTORE_STATEMENT);
}
