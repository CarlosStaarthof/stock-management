/**
 * Setup for the Level 2 suite. Named in `vitest.db.config.ts`, loaded before every
 * `*.db.test.ts` file.
 *
 * Its only job is to hand the connection back. `src/server/db.ts` stashes its
 * `PrismaClient` on `globalThis` and never closes it — correct for a long-lived server,
 * wrong for a test run, which used to end by exiting the process and leaving the sockets
 * for Postgres to reap. Under `singleFork` one process now runs all 22 files, so the
 * client outlives each of them and something has to close it.
 *
 * `afterAll` in a setup file runs once per TEST FILE, not once per run: vitest registers
 * it into that file's root suite. That is the tighter behaviour anyway — at most one
 * file's pool is open at a time, and Prisma reconnects lazily on the next query — but it
 * is not the single call the plan assumed, and the comment says so rather than implying
 * otherwise.
 *
 * It reads the client off `globalThis` instead of calling `getDb()` so that a file which
 * never touched the database does not construct a client purely in order to close it.
 */
import { afterAll } from "vitest";

type DbGlobal = { macroadsPrismaClient?: { $disconnect: () => Promise<void> } };

afterAll(async () => {
  await (globalThis as unknown as DbGlobal).macroadsPrismaClient?.$disconnect();
});
