import { db } from "@/server/db";
import { ConflictError } from "@/server/errors";
import { EXPORT_FORMAT } from "@/server/deploy/export";
import { sqlIdentifier } from "@/server/deploy/target-schema";

/**
 * Restoring a copy, only into an empty schema, and proving it restored (spec 016 D21, AC-10).
 *
 * Generic over tables, like the export: the tables, their keys and their foreign keys come
 * from the target's own catalogue after the migrations have run. The rows are handed to
 * Postgres as the JSON text the file holds and turned back into rows by
 * `json_populate_recordset`, so no figure passes through a JavaScript number.
 *
 * It only ever inserts. A row the migrations already wrote must equal the file's row with the
 * same key; if it does not, the whole insert is rolled back. Nothing here updates or deletes.
 *
 * Nothing it returns or throws carries a row or a value: messages name tables and counts.
 */

const MIGRATIONS_TABLE = "_prisma_migrations";

const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 20_000;

type ParsedTable = { count?: unknown; rows?: unknown };
type ParsedFile = { format?: unknown; migrations?: unknown; omittedPendingRequests?: unknown; tables?: unknown };

/**
 * What is wrong with the file, before any database is touched: its format, its migrations
 * against the repository's, and each table's count against its rows. Empty when it is usable.
 */
export function exportFileProblems(text: string, migrationDirectories: readonly string[]): string[] {
  let parsed: ParsedFile;
  try {
    parsed = JSON.parse(text) as ParsedFile;
  } catch {
    return ["The file is not JSON."];
  }
  if (typeof parsed !== "object" || parsed === null) return ["The file is not a JSON object."];

  const problems: string[] = [];

  if (parsed.format !== EXPORT_FORMAT) {
    problems.push(`The file's format is not ${EXPORT_FORMAT}.`);
  }

  const migrations = Array.isArray(parsed.migrations) ? parsed.migrations : null;
  const expected = [...migrationDirectories].sort();
  if (
    migrations === null ||
    migrations.length !== expected.length ||
    migrations.some((name, index) => name !== expected[index])
  ) {
    problems.push(
      `The file's migrations differ from prisma/migrations/: the file lists ` +
        `${migrations === null ? "none" : migrations.length}, the repository has ${expected.length}.`,
    );
  }

  const pending = parsed.omittedPendingRequests;
  if (typeof pending !== "number" || !Number.isInteger(pending) || pending < 0) {
    problems.push("The file does not say how many pending requests it left out.");
  }

  const tables = parsed.tables;
  if (typeof tables !== "object" || tables === null || Array.isArray(tables)) {
    problems.push("The file holds no tables.");
    return problems;
  }

  for (const [name, table] of Object.entries(tables as Record<string, ParsedTable>)) {
    const rows = typeof table === "object" && table !== null ? table.rows : undefined;
    const count = typeof table === "object" && table !== null ? table.count : undefined;
    if (!Array.isArray(rows)) {
      problems.push(`${name}: the file holds no rows array.`);
    } else if (count !== rows.length) {
      problems.push(`${name}: its count differs from its number of rows.`);
    }
  }

  return problems;
}

/** Tables, views and other relations in the schema. A restore writes only where this is 0. */
export async function relationsInSchema(schema: string): Promise<number> {
  const [row] = await db.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n
       FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = $1 AND c.relkind IN ('r', 'p', 'v', 'm', 'f')`,
    schema,
  );
  return row?.n ?? 0;
}

type Catalogue = {
  tables: string[];
  keys: Map<string, string[]>;
  parents: Map<string, Set<string>>;
};

async function catalogue(
  tx: Pick<typeof db, "$queryRawUnsafe">,
  schema: string,
): Promise<Catalogue> {
  const tableRows = await tx.$queryRawUnsafe<{ table: string }[]>(
    `SELECT table_name::text AS "table" FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> $2
      ORDER BY table_name::text COLLATE "C"`,
    schema,
    MIGRATIONS_TABLE,
  );
  const keyRows = await tx.$queryRawUnsafe<{ table: string; column: string }[]>(
    `SELECT tc.table_name::text AS "table", k.column_name::text AS "column"
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage k
         ON k.constraint_schema = tc.constraint_schema
        AND k.constraint_name = tc.constraint_name
        AND k.table_name = tc.table_name
      WHERE tc.table_schema = $1 AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name::text COLLATE "C", k.ordinal_position`,
    schema,
  );
  const edgeRows = await tx.$queryRawUnsafe<{ child: string; parent: string }[]>(
    `SELECT child.relname::text AS child, parent.relname::text AS parent
       FROM pg_constraint c
       JOIN pg_class child ON child.oid = c.conrelid
       JOIN pg_class parent ON parent.oid = c.confrelid
       JOIN pg_namespace ns ON ns.oid = child.relnamespace
      WHERE c.contype = 'f' AND ns.nspname = $1`,
    schema,
  );

  const tables = tableRows.map((row) => row.table);
  const keys = new Map<string, string[]>();
  for (const row of keyRows) keys.set(row.table, [...(keys.get(row.table) ?? []), row.column]);
  const parents = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]));
  for (const edge of edgeRows) {
    if (edge.child !== edge.parent) parents.get(edge.child)?.add(edge.parent);
  }
  return { tables, keys, parents };
}

/** Parents before children. A cycle cannot be inserted table by table, so it is refused. */
export function foreignKeyOrder(tables: readonly string[], parents: Map<string, Set<string>>): string[] {
  const order: string[] = [];
  const placed = new Set<string>();
  const remaining = [...tables].sort();

  while (remaining.length > 0) {
    const ready = remaining.find((table) =>
      [...(parents.get(table) ?? [])].every((parent) => placed.has(parent) || !tables.includes(parent)),
    );
    if (ready === undefined) {
      throw new ConflictError(`The foreign keys among ${remaining.join(", ")} form a cycle.`);
    }
    order.push(ready);
    placed.add(ready);
    remaining.splice(remaining.indexOf(ready), 1);
  }
  return order;
}

/** Each table's `rows` as the JSON text the file holds, split out by Postgres. */
async function rowsTextByTable(
  tx: Pick<typeof db, "$queryRawUnsafe">,
  fileText: string,
): Promise<Map<string, string>> {
  const rows = await tx.$queryRawUnsafe<{ table: string; rows: string }[]>(
    `SELECT key AS "table", (value -> 'rows')::text AS rows FROM json_each(($1::json) -> 'tables')`,
    fileText,
  );
  return new Map(rows.map((row) => [row.table, row.rows]));
}

function sameKey(keyColumns: readonly string[]): string {
  return keyColumns.map((column) => `e.${sqlIdentifier(column)} = r.${sqlIdentifier(column)}`).join(" AND ");
}

/**
 * Inserts every table's rows, parents first, in ONE transaction. It returns the order used.
 * The schema's tables must be exactly the file's; a row the migrations wrote must equal the
 * file's row with the same key. Either failure rolls everything back.
 */
export async function restoreRows(schema: string, fileText: string): Promise<string[]> {
  return await db.$transaction(
    async (tx) => {
      const { tables, keys, parents } = await catalogue(tx, schema);
      const byTable = await rowsTextByTable(tx, fileText);

      const inFileOnly = [...byTable.keys()].filter((table) => !tables.includes(table)).sort();
      const inSchemaOnly = tables.filter((table) => !byTable.has(table));
      if (inFileOnly.length > 0 || inSchemaOnly.length > 0) {
        throw new ConflictError(
          "The file's tables are not the schema's. " +
            `Only in the file: ${inFileOnly.join(", ") || "none"}. ` +
            `Only in the schema: ${inSchemaOnly.join(", ") || "none"}.`,
        );
      }

      const order = foreignKeyOrder(tables, parents);

      for (const table of order) {
        const keyColumns = keys.get(table) ?? [];
        if (keyColumns.length === 0) {
          throw new ConflictError(`${table} has no primary key, so a row already present cannot be matched.`);
        }
        const target = `${sqlIdentifier(schema)}.${sqlIdentifier(table)}`;
        const rows = byTable.get(table) ?? "[]";

        const [differing] = await tx.$queryRawUnsafe<{ n: number }[]>(
          `SELECT count(*)::int AS n
             FROM json_populate_recordset(NULL::${target}, $1::json) AS r
             JOIN ${target} AS e ON ${sameKey(keyColumns)}
            WHERE to_jsonb(e) IS DISTINCT FROM to_jsonb(r)`,
          rows,
        );
        if ((differing?.n ?? 0) > 0) {
          throw new ConflictError(
            `${table}: ${differing?.n} row(s) the migrations wrote differ from the file's row with the same key. ` +
              "Nothing was restored.",
          );
        }

        await tx.$executeRawUnsafe(
          `INSERT INTO ${target}
           SELECT r.* FROM json_populate_recordset(NULL::${target}, $1::json) AS r
            WHERE NOT EXISTS (SELECT 1 FROM ${target} AS e WHERE ${sameKey(keyColumns)})`,
          rows,
        );
      }

      return order;
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}

export type TableComparison = { table: string; expected: number; restored: number; identical: number };

/**
 * Every table read back and compared with the file, row for row: `restored` is how many rows
 * the table holds, `identical` how many of the file's rows it holds exactly.
 */
export async function compareWithFile(schema: string, fileText: string): Promise<TableComparison[]> {
  const { tables } = await catalogue(db, schema);
  const byTable = await rowsTextByTable(db, fileText);
  const comparisons: TableComparison[] = [];

  for (const table of [...new Set([...tables, ...byTable.keys()])].sort()) {
    const rows = byTable.get(table) ?? "[]";
    const present = tables.includes(table);
    const [result] = present
      ? await db.$queryRawUnsafe<{ expected: number; restored: number; identical: number }[]>(
          `WITH f AS (SELECT value::jsonb AS j FROM json_array_elements($1::json)),
                d AS (SELECT to_jsonb(t) AS j FROM ${sqlIdentifier(schema)}.${sqlIdentifier(table)} AS t)
           SELECT (SELECT count(*) FROM f)::int AS expected,
                  (SELECT count(*) FROM d)::int AS restored,
                  (SELECT count(*) FROM f JOIN d ON d.j = f.j)::int AS identical`,
          rows,
        )
      : await db.$queryRawUnsafe<{ expected: number; restored: number; identical: number }[]>(
          `SELECT json_array_length($1::json) AS expected, 0 AS restored, 0 AS identical`,
          rows,
        );
    comparisons.push({
      table,
      expected: result?.expected ?? 0,
      restored: result?.restored ?? 0,
      identical: result?.identical ?? 0,
    });
  }
  return comparisons;
}

/** A table is identical when it holds exactly the file's rows, and nothing else. */
export function isIdentical(comparison: TableComparison): boolean {
  return comparison.restored === comparison.expected && comparison.identical === comparison.expected;
}
