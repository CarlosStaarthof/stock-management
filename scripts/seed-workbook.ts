/**
 * `npm run seed:workbook` — import the item master from the source workbook.
 *
 *   npm run seed:workbook [-- --file <path>] [--dry-run] [--report <path>]
 *
 * With no arguments it reads `Samples/Stock @ 01-Sep-2026.xlsx`, writes the 140 items,
 * 10 suppliers, 19 types, 129 prices and 152 yard links the file holds, prints the report
 * and exits 0. It is safe to run twice: the importer is insert-only, so a second run
 * creates nothing and a nervous re-run is never a reason to restore a backup (AC-21).
 *
 * `--dry-run` builds the plan, prints the same report and opens NO database connection, so
 * it works on a machine with no Postgres at all (AC-27).
 *
 * The workbook is opened read-only and is never written to. `Samples/` is the historical
 * record; `init` fails if `git status --porcelain -- Samples` is not empty.
 */
import { readFileSync, writeFileSync } from "node:fs";

import { DomainError } from "@/server/errors";
import { importWorkbook, planWorkbook } from "@/server/items/workbook-import-service";
import type { ImportReport, TableCounts } from "@/server/items/workbook-plan";

const DEFAULT_FILE = "Samples/Stock @ 01-Sep-2026.xlsx";

const USAGE = "usage: npm run seed:workbook [-- --file <path>] [--dry-run] [--report <path>]";

const PREFIX = "[seed:workbook]";

type Options = { file: string; dryRun: boolean; reportPath: string | null };

function fail(message: string): never {
  console.error(`${PREFIX} ${message}`);
  process.exit(1);
}

function parseArguments(argv: string[]): Options {
  const options: Options = { file: DEFAULT_FILE, dryRun: false, reportPath: null };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (argument === "--file" || argument === "--report") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        console.error(`${PREFIX} ${argument} needs a path.`);
        fail(USAGE);
      }
      if (argument === "--file") options.file = value;
      else options.reportPath = value;
      index += 1;
      continue;
    }

    console.error(`${PREFIX} unknown argument ${JSON.stringify(argument)}.`);
    fail(USAGE);
  }

  return options;
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : `${text}${" ".repeat(width - text.length)}`;
}

function padLeft(text: string, width: number): string {
  return text.length >= width ? text : `${" ".repeat(width - text.length)}${text}`;
}

/**
 * The report as text.
 *
 * It carries no money, and neither does the object it renders (AC-17): a missing price is
 * the reason code `MISSING_PRICE`, and the only numbers here are counts and row numbers.
 */
function renderReport(report: ImportReport): string {
  const lines: string[] = [];

  lines.push(`${PREFIX} source`);
  lines.push(`  file    ${report.source.fileName}`);
  lines.push(`  bytes   ${report.source.byteLength}`);
  lines.push(`  sha256  ${report.source.sha256}`);

  lines.push("");
  lines.push(`${PREFIX} sheets`);
  for (const sheet of report.sheets) {
    lines.push(
      `  ${pad(JSON.stringify(sheet.name), 12)} rows ${sheet.firstRow}-${sheet.lastRow}, ` +
        `${sheet.rowsRead} read, ${sheet.belowTotalRows} below the total row`,
    );
  }

  lines.push("");
  lines.push(`${PREFIX} counts`);
  lines.push(`  ${pad("table", 14)}${padLeft("planned", 9)}${padLeft("created", 9)}${padLeft("skipped", 9)}`);
  for (const count of report.counts) {
    lines.push(
      `  ${pad(count.table, 14)}${padLeft(String(count.planned), 9)}` +
        `${padLeft(String(count.created), 9)}${padLeft(String(count.skipped), 9)}`,
    );
  }

  lines.push("");
  lines.push(`${PREFIX} needs review (${report.needsReview.length})`);
  for (const entry of report.needsReview) {
    lines.push(`  ${pad(entry.sheetCell, 16)} ${pad(entry.description, 52)} ${entry.reasons.join(", ")}`);
  }

  lines.push("");
  lines.push(`${PREFIX} supplier spellings collapsed (${report.supplierVariants.length})`);
  for (const variant of report.supplierVariants) {
    lines.push(
      `  ${pad(JSON.stringify(variant.variant), 12)} -> ${pad(JSON.stringify(variant.canonical), 12)} ` +
        `${variant.rowCount} row(s), first at ${variant.cells[0]}`,
    );
  }

  lines.push("");
  lines.push(`${PREFIX} items held at both yards (${report.sharedItems.length})`);
  for (const shared of report.sharedItems) {
    lines.push(`  ${pad(shared.description, 44)} ${shared.cells.join(" + ")}`);
  }

  lines.push("");
  lines.push(`${PREFIX} cross-sheet disagreements (${report.conflicts.length})`);
  for (const conflict of report.conflicts) {
    lines.push(
      `  ${pad(conflict.field, 10)} ${pad(conflict.description, 44)} ` +
        `${conflict.cells[0]} ${JSON.stringify(conflict.readings[0])} wins over ` +
        `${conflict.cells[1]} ${JSON.stringify(conflict.readings[1])}`,
    );
  }

  lines.push("");
  lines.push(`${PREFIX} workbook/database divergences left untouched (${report.divergences.length})`);
  for (const divergence of report.divergences) {
    lines.push(
      `  ${pad(divergence.entity, 13)} ${pad(divergence.key, 44)} ${pad(divergence.field, 15)} ` +
        `workbook ${JSON.stringify(divergence.workbook)} / database ${JSON.stringify(divergence.database)}`,
    );
  }

  return lines.join("\n");
}

/** The workbook, opened read-only. Nothing in this script ever writes to `Samples/`. */
function readWorkbook(path: string): Buffer {
  try {
    return readFileSync(path);
  } catch {
    console.error(PREFIX + " cannot read " + path + ".");
    fail(USAGE);
  }
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const bytes = readWorkbook(options.file);

  let report: ImportReport;
  let created: TableCounts | null = null;

  if (options.dryRun) {
    report = (await planWorkbook(options.file, bytes)).report;
  } else {
    const outcome = await importWorkbook({ fileName: options.file, bytes });
    report = outcome.report;
    created = outcome.created;
  }

  console.log(renderReport(report));

  if (options.reportPath !== null) {
    writeFileSync(options.reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
    console.log("\n" + PREFIX + " report written to " + options.reportPath);
  }

  if (created === null) {
    console.log("\n" + PREFIX + " dry run: nothing was written and no database was opened.");
    return;
  }

  console.log(
    "\n" + PREFIX + " created " + created.items + " items, " + created.suppliers +
      " suppliers, " + created.itemTypes + " types, " + created.prices + " prices, " +
      created.links + " yard links.",
  );
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    if (error instanceof DomainError) {
      // The message already names the sheet and the cell, or the missing Location code.
      fail(error.message);
    }

    const detail = error instanceof Error ? error.message : "unknown error";
    fail(`the import failed against the database and nothing was written: ${detail}`);
  });
