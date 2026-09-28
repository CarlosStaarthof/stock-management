import { db } from "@/server/db";
import { ConflictError } from "@/server/errors";
import { sqlIdentifier } from "@/server/deploy/target-schema";

/**
 * The copy of a database, as one JSON text (spec 016 D19, D20, AC-9).
 *
 * Generic over tables: it reads whatever `information_schema` lists in the target schema,
 * so a table a later feature adds is copied without anyone remembering to add it here. The
 * only table and columns it names are the two credential columns it refuses to copy, and the
 * status that marks a pending request, whose row it leaves out and counts (ruling A1-F1).
 *
 * Every row is rendered by Postgres (`row_to_json`), never by JavaScript, so a price or a
 * quantity keeps every digit its `Decimal` column holds. Everything is read inside one
 * read-only, repeatable-read transaction, so the copy describes one moment.
 */

export const EXPORT_FORMAT = "macroads-export/1";

/** D20: the copy holds no PIN credential. Both are written as `null` in every row. */
export const OMITTED_COLUMNS: readonly { table: string; column: string }[] = [
  { table: "User", column: "pinHash" },
  { table: "User", column: "pinKeyId" },
];

/**
 * Ruling A1-F1: a pending profile request is left out whole and only counted. The schema
 * requires such a row to hold the requester's PIN hash, which D20 keeps out of the copy, so
 * the row could not be restored without it. A request is not an account: after a restore,
 * the requester asks again.
 */
export const OMITTED_ROWS = { table: "User", column: "status", value: "PENDING" } as const;

const MIGRATIONS_TABLE = "_prisma_migrations";

/** The copy reads a few hundred rows per table over a network hop. */
const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 20_000;

export type ExportedTable = { name: string; count: number };

export type ExportResult = {
  /** The file's whole content, UTF-8 JSON. */
  text: string;
  tables: ExportedTable[];
  migrations: string[];
  /** How many `PENDING` requests were left out (ruling A1-F1). */
  omittedPendingRequests: number;
  /** What the transaction that read everything reported about itself. */
  snapshot: { isolation: string; readOnly: boolean };
};

type ColumnRow = { table: string; column: string; type: string };
type KeyRow = { table: string; column: string };
type SettingRow = { isolation: string; read_only: string };
type TableRow = { count: number; rows: string | null };

const TEXT_TYPES = new Set(["text", "character varying", "character"]);

export async function exportDatabase(schema: string, now: Date = new Date()): Promise<ExportResult> {
  const qualified = (table: string): string => `${sqlIdentifier(schema)}.${sqlIdentifier(table)}`;

  return await db.$transaction(
    async (tx) => {
      // The first statement of the transaction, as Postgres requires for both settings.
      await tx.$executeRawUnsafe("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY");

      const [setting] = await tx.$queryRawUnsafe<SettingRow[]>(
        `SELECT current_setting('transaction_isolation') AS isolation,
                current_setting('transaction_read_only') AS read_only`,
      );
      const snapshot = { isolation: setting?.isolation ?? "", readOnly: setting?.read_only === "on" };
      if (snapshot.isolation !== "repeatable read" || !snapshot.readOnly) {
        throw new ConflictError("The export could not read in one read-only, repeatable-read transaction.");
      }

      const columns = await tx.$queryRawUnsafe<ColumnRow[]>(
        `SELECT c.table_name::text AS "table", c.column_name::text AS "column", c.data_type::text AS "type"
           FROM information_schema.columns c
           JOIN information_schema.tables t
             ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = $1 AND t.table_type = 'BASE TABLE'
          ORDER BY c.table_name::text COLLATE "C", c.ordinal_position`,
        schema,
      );
      const keys = await tx.$queryRawUnsafe<KeyRow[]>(
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

      const tableNames = [...new Set(columns.map((row) => row.table))];
      if (!tableNames.includes(MIGRATIONS_TABLE)) {
        throw new ConflictError(`The schema holds no ${MIGRATIONS_TABLE} table, so it is not a migrated database.`);
      }

      for (const omitted of OMITTED_COLUMNS) {
        const present = columns.some((row) => row.table === omitted.table && row.column === omitted.column);
        if (tableNames.includes(omitted.table) && !present) {
          throw new ConflictError(
            `${omitted.table}.${omitted.column} is missing, so the export cannot tell which column holds the credential it must leave out.`,
          );
        }
      }

      const pendingKnown = columns.some(
        (row) => row.table === OMITTED_ROWS.table && row.column === OMITTED_ROWS.column,
      );
      if (tableNames.includes(OMITTED_ROWS.table) && !pendingKnown) {
        throw new ConflictError(
          `${OMITTED_ROWS.table}.${OMITTED_ROWS.column} is missing, so the export cannot tell which rows are pending requests.`,
        );
      }
      // The same test as the rows' filter below, so what is counted is exactly what is left out.
      const leftOut = `${sqlIdentifier(OMITTED_ROWS.column)}::text = '${OMITTED_ROWS.value}'`;
      const [pending] = tableNames.includes(OMITTED_ROWS.table)
        ? await tx.$queryRawUnsafe<{ n: number }[]>(
            `SELECT count(*)::int AS n FROM ${qualified(OMITTED_ROWS.table)} WHERE ${leftOut}`,
          )
        : [{ n: 0 }];
      const omittedPendingRequests = pending?.n ?? 0;

      const migrationRows = await tx.$queryRawUnsafe<{ name: string }[]>(
        `SELECT migration_name AS name FROM ${qualified(MIGRATIONS_TABLE)}
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          ORDER BY migration_name COLLATE "C"`,
      );
      const migrations = migrationRows.map((row) => row.name);

      const exported: { name: string; count: number; rows: string }[] = [];

      for (const table of tableNames.filter((name) => name !== MIGRATIONS_TABLE)) {
        const tableColumns = columns.filter((row) => row.table === table);
        const keyColumns = keys.filter((row) => row.table === table).map((row) => row.column);
        if (keyColumns.length === 0) {
          throw new ConflictError(`${table} has no primary key, so its rows have no order to be copied in.`);
        }

        const selectList = tableColumns
          .map(({ column }) =>
            OMITTED_COLUMNS.some((omitted) => omitted.table === table && omitted.column === column)
              ? `NULL::text AS ${sqlIdentifier(column)}`
              : sqlIdentifier(column),
          )
          .join(", ");
        const order = keyColumns
          .map((column) => {
            const type = tableColumns.find((row) => row.column === column)?.type ?? "";
            return `r.${sqlIdentifier(column)}${TEXT_TYPES.has(type) ? ' COLLATE "C"' : ""}`;
          })
          .join(", ");

        const [result] = await tx.$queryRawUnsafe<TableRow[]>(
          `SELECT count(*)::int AS count,
                  string_agg(row_to_json(r)::text, E',\\n' ORDER BY ${order}) AS rows
             FROM (SELECT ${selectList} FROM ${qualified(table)}${
               table === OMITTED_ROWS.table ? ` WHERE NOT (${leftOut})` : ""
             }) AS r`,
        );
        exported.push({ name: table, count: result?.count ?? 0, rows: result?.rows ?? "" });
      }

      return {
        text: renderExport(now, migrations, omittedPendingRequests, exported),
        tables: exported.map(({ name, count }) => ({ name, count })),
        migrations,
        omittedPendingRequests,
        snapshot,
      };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}

/**
 * The file's text. Every scalar is written by `JSON.stringify`; each table's rows are the
 * text Postgres produced, one row per line, placed between the brackets unchanged.
 */
function renderExport(
  now: Date,
  migrations: string[],
  omittedPendingRequests: number,
  tables: { name: string; count: number; rows: string }[],
): string {
  const lines: string[] = [
    "{",
    `  "format": ${JSON.stringify(EXPORT_FORMAT)},`,
    `  "exportedAt": ${JSON.stringify(now.toISOString())},`,
    `  "migrations": ${JSON.stringify(migrations)},`,
    `  "omitted": ${JSON.stringify(OMITTED_COLUMNS.map(({ table, column }) => `${table}.${column}`))},`,
    `  "omittedPendingRequests": ${omittedPendingRequests},`,
    `  "tables": {`,
  ];

  tables.forEach((table, index) => {
    const last = index === tables.length - 1;
    lines.push(`    ${JSON.stringify(table.name)}: {`);
    lines.push(`      "count": ${table.count},`);
    if (table.rows === "") {
      lines.push(`      "rows": []`);
    } else {
      lines.push(`      "rows": [`);
      lines.push(table.rows);
      lines.push(`      ]`);
    }
    lines.push(last ? "    }" : "    },");
  });

  lines.push("  }", "}", "");
  return lines.join("\n");
}
