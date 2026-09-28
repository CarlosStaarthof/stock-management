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

/**
 * The schema a restore writes into. `DATABASE_URL` inserts the rows and `DIRECT_URL` runs
 * the migrations, so both must name the same one, or the migrations would land in one
 * schema and the rows be written to another.
 */
export function restoreSchema(env: Record<string, string | undefined>): string {
  const pooled = schemaOf("DATABASE_URL", env.DATABASE_URL);
  const direct = schemaOf("DIRECT_URL", env.DIRECT_URL);

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
