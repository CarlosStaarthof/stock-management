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

const SEEDED_LOCATION_IDS = SEEDED_LOCATIONS.map((location) => location.id);

export async function resetTestDb(): Promise<void> {
  if (process.env.MACROADS_TEST_DB !== "1") {
    throw new Error(
      "resetTestDb() refuses to run: MACROADS_TEST_DB is not set. Run these tests with " +
        "`npm run test:db`, which points DATABASE_URL at TEST_DATABASE_URL first.",
    );
  }

  // Child before parent. Several of these foreign keys are Restrict on purpose (spec 004,
  // referential behaviour), so the order below is the only order Postgres accepts - a
  // `Promise.all` here would fail intermittently rather than never.
  await db.stockCountLine.deleteMany();
  await db.stockCount.deleteMany();
  await db.itemPrice.deleteMany();
  await db.itemLocation.deleteMany();
  await db.item.deleteMany();
  await db.supplier.deleteMany();
  await db.itemType.deleteMany();
  await db.user.deleteMany();

  // Anything a test invented is a test row and goes; the two migration rows stay, and are
  // written back to their migration values in case a test renamed or archived one.
  await db.location.deleteMany({ where: { id: { notIn: SEEDED_LOCATION_IDS } } });

  for (const location of SEEDED_LOCATIONS) {
    await db.location.upsert({
      where: { id: location.id },
      create: location,
      update: location,
    });
  }
}
