import { db } from "@/server/db";

/**
 * Level 2 support (docs/verification.md): a real Postgres, emptied between tests, never
 * a mock of `PrismaClient`.
 *
 * It lives under `src/server/` because it touches Prisma and that is the only layer
 * allowed to (docs/architecture.md). It is used only by `*.db.test.ts`.
 *
 * The guard is not decoration. `npm run test:db` sets `MACROADS_TEST_DB` after proving
 * `TEST_DATABASE_URL` is set and is not `DATABASE_URL`; without that proof this function
 * refuses, so a stray `vitest run src/**\/*.db.test.ts` cannot empty a developer's table.
 */
export async function resetTestDb(): Promise<void> {
  if (process.env.MACROADS_TEST_DB !== "1") {
    throw new Error(
      "resetTestDb() refuses to run: MACROADS_TEST_DB is not set. Run these tests with " +
        "`npm run test:db`, which points DATABASE_URL at TEST_DATABASE_URL first.",
    );
  }

  // `User` is the only table this feature owns (spec 003 AC-1), so this is the whole
  // reset. Feature #4 adds its own tables and extends this in the same change.
  await db.user.deleteMany();
}
