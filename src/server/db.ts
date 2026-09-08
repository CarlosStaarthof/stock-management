import { PrismaClient } from "@prisma/client";

/**
 * The single PrismaClient for the process.
 *
 * This module is the ONLY place in the codebase allowed to import `@prisma/client`
 * (docs/architecture.md; enforced for src/app and src/components by eslint.config.mjs).
 *
 * Construction is deferred. Spec 002 AC-5 requires every command in this repository —
 * typecheck, lint, unit tests, e2e, build, `prisma validate` — to succeed with no
 * reachable database, so importing this module must not construct a client, read
 * DATABASE_URL or open a connection. `db` is a proxy that builds the client the first
 * time somebody actually uses it.
 *
 * The instance is stashed on `globalThis` because Next's dev server re-evaluates
 * modules on every hot reload, and a fresh client per reload exhausts the connection
 * pool within minutes.
 */

const globalForDb = globalThis as unknown as { macroadsPrismaClient?: PrismaClient };

export function getDb(): PrismaClient {
  if (globalForDb.macroadsPrismaClient === undefined) {
    globalForDb.macroadsPrismaClient = new PrismaClient();
  }
  return globalForDb.macroadsPrismaClient;
}

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getDb();
    const value: unknown = Reflect.get(client, property);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value;
  },
});
