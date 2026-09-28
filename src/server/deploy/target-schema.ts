import { hostOf, sameEndpoint } from "@/server/deploy/build-plan";
import { ValidationError } from "@/server/errors";

/**
 * Which Postgres schema a copy is read from or restored into (spec 016 AC-9, AC-10): the
 * connection string's `schema` parameter, as Prisma reads it, and `public` without one.
 *
 * Pure: it reads the settings it is given. Every message names the variable and never any
 * part of its value.
 */

export const DEFAULT_SCHEMA = "public";

function schemaOf(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new ValidationError(name, `${name} is not set.`);
  }

  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ValidationError(name, `${name} is not a connection string.`);
  }

  const schema = url.searchParams.get("schema");
  return schema === null || schema === "" ? DEFAULT_SCHEMA : schema;
}

/** The schema `DATABASE_URL` names. */
export function exportSchema(env: Record<string, string | undefined>): string {
  return schemaOf("DATABASE_URL", env.DATABASE_URL);
}

/** The database a connection string names: its path, without the leading slash. */
function databaseOf(value: string): string {
  const path = new URL(value.trim()).pathname.replace(/^\//, "");
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/**
 * The schema a restore writes into. `DATABASE_URL` checks emptiness and inserts the rows,
 * and `DIRECT_URL` runs the migrations, so both must name one target: the same host once
 * `-pooler` is removed (the build's host rule), the same database, and the same schema.
 * Otherwise the emptiness check would look at one database while the migrations land in
 * another. Checked before anything connects; no message carries a host or a name.
 */
export function restoreSchema(env: Record<string, string | undefined>): string {
  const pooled = schemaOf("DATABASE_URL", env.DATABASE_URL);
  const direct = schemaOf("DIRECT_URL", env.DIRECT_URL);

  const pooledHost = hostOf((env.DATABASE_URL ?? "").trim());
  const directHost = hostOf((env.DIRECT_URL ?? "").trim());
  if (pooledHost === null || directHost === null || !sameEndpoint(pooledHost, directHost)) {
    throw new ValidationError(
      "DIRECT_URL",
      "DATABASE_URL and DIRECT_URL name different hosts once -pooler is removed; a restore needs one target.",
    );
  }
  if (databaseOf(env.DATABASE_URL ?? "") !== databaseOf(env.DIRECT_URL ?? "")) {
    throw new ValidationError(
      "DIRECT_URL",
      "DATABASE_URL and DIRECT_URL name different databases; a restore needs one target.",
    );
  }

  if (pooled !== direct) {
    throw new ValidationError(
      "DIRECT_URL",
      "DATABASE_URL and DIRECT_URL name different schemas; a restore needs one target.",
    );
  }
  return pooled;
}

/** A double-quoted SQL identifier. */
export function sqlIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}
