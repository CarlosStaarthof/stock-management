import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { exportSchema, restoreSchema } from "@/server/deploy/target-schema";
import { ValidationError } from "@/server/errors";

/**
 * Spec 016 AC-10, review Observation 2: before anything connects, a restore needs its two
 * connection strings to name one target — the same host once `-pooler` is removed (the
 * build's host rule), the same database and the same schema. Every string here is a runtime
 * sentinel under `.invalid`, and no refusal may quote any part of one.
 */

const SCHEME = "postgres" + "ql";

function token(): string {
  return randomBytes(6).toString("hex");
}

type Target = { endpoint: string; domain: string; database: string; schema?: string };

function target(): Target {
  return { endpoint: `ep-${token()}`, domain: `${token()}.invalid`, database: `db${token()}` };
}

function connection(where: Target, pooled: boolean): string {
  const host = `${where.endpoint}${pooled ? "-pooler" : ""}.${where.domain}`;
  const query = where.schema === undefined ? "sslmode=require" : `sslmode=require&schema=${where.schema}`;
  return `${SCHEME}://${token()}:${token()}@${host}/${where.database}?${query}`;
}

/** The refusal's message, with every part of both strings asserted absent from it. */
function refusal(env: Record<string, string>, parts: readonly string[]): string {
  let message = "";
  try {
    restoreSchema(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    message = error instanceof Error ? error.message : "";
  }
  expect(message, "a refusal").not.toBe("");
  expect(parts.filter((part) => message.includes(part)).length, "parts of a string in the message").toBe(0);
  return message;
}

describe("016 AC-10 (review Observation 2): one target for both strings", () => {
  it("accepts the production shape: the pooled and the unpooled string of one endpoint, one database, one schema", () => {
    const where = { ...target(), schema: `s${token()}` };

    expect(restoreSchema({ DATABASE_URL: connection(where, true), DIRECT_URL: connection(where, false) })).toBe(where.schema);
    expect(restoreSchema({ DATABASE_URL: connection(where, false), DIRECT_URL: connection(where, false) })).toBe(where.schema);
  });

  it("refuses two different hosts, even once -pooler is removed", () => {
    const one = target();
    const other = { ...target(), database: one.database };

    const message = refusal({ DATABASE_URL: connection(one, true), DIRECT_URL: connection(other, false) }, [
      one.endpoint,
      one.domain,
      other.endpoint,
      other.domain,
      one.database,
    ]);

    expect(message).toMatch(/different hosts once -pooler is removed/);
  });

  it("refuses two different databases on the same host", () => {
    const one = target();
    const other = { ...one, database: `db${token()}` };

    const message = refusal({ DATABASE_URL: connection(one, true), DIRECT_URL: connection(other, false) }, [
      one.endpoint,
      one.domain,
      one.database,
      other.database,
    ]);

    expect(message).toMatch(/different databases/);
  });

  it("refuses two different schemas, as before", () => {
    const one = { ...target(), schema: `s${token()}` };
    const other = { ...one, schema: `s${token()}` };

    const message = refusal({ DATABASE_URL: connection(one, true), DIRECT_URL: connection(other, false) }, [
      one.schema,
      other.schema,
      one.endpoint,
    ]);

    expect(message).toMatch(/different schemas/);
  });

  it("the export reads DATABASE_URL's schema alone, and public without one", () => {
    const where = target();

    expect(exportSchema({ DATABASE_URL: connection(where, true) })).toBe("public");
    expect(exportSchema({ DATABASE_URL: connection({ ...where, schema: "copy_x" }, true) })).toBe("copy_x");
  });
});
