import { z } from "zod";

import { readYardSheets, YARD_SHEET_NAMES } from "@/lib/excel/workbook-reader";
import { UNIT_KINDS } from "@/lib/units";
import { db } from "@/server/db";
import { ConflictError, ValidationError } from "@/server/errors";
import {
  buildImportPlan,
  buildImportReport,
  describeSource,
  diffPlan,
  PRICE_CURRENCY,
  PRICE_EFFECTIVE_FROM,
  PRICE_LABEL,
  itemKeyOf,
  type ExistingMasterData,
  type ImportPlan,
  type ImportReport,
  type ImportSource,
  type TableCounts,
} from "@/server/items/workbook-plan";

/**
 * Step three of spec 005's pipeline — read, plan, WRITE — and the only module in this
 * feature that touches Prisma.
 *
 * Two properties carry it.
 *
 * INSERT-ONLY (AC-22). This service creates rows whose natural key is absent and leaves
 * every existing row exactly as it is. There is no UPDATE, no DELETE and no upsert here,
 * and `src/server/items/workbook-import.db.test.ts` scans this file to prove it. From #6
 * the database is the system of record and the workbook is a historical file: an importer
 * that wrote over a stored row would undo the very corrections the 15 `needsReview` flags
 * exist to prompt. Anything the two disagree about is reported as a divergence instead.
 *
 * ATOMIC (AC-24). Everything happens inside ONE transaction with an explicit timeout, so
 * a failure part of the way through — `Item_description_not_empty` refusing a blank
 * description, say — leaves the database exactly as it was rather than half-imported for
 * the next run to trip over.
 */

/** Neon is a network hop away and this writes ~430 rows in a handful of statements. */
const TRANSACTION_TIMEOUT_MS = 120_000;
const TRANSACTION_MAX_WAIT_MS = 20_000;

export type ImportOutcome = {
  created: TableCounts;
  skipped: TableCounts;
  report: ImportReport;
};

/**
 * Either the workbook's bytes, or a plan somebody already built.
 *
 * The second form is not a convenience: AC-24 proves atomicity with a plan whose SECOND
 * item has a whitespace-only description, and the reader refuses that before a single row
 * is written (AC-7). Without a seam here, the rollback could not be tested at all.
 */
export type ImportWorkbookInput =
  | { fileName: string; bytes: Uint8Array }
  | { source: ImportSource; plan: ImportPlan };

const reviewReasonSchema = z.enum([
  "MISSING_SUPPLIER",
  "MISSING_UNIT",
  "MISSING_PRICE",
  "BELOW_TOTAL_ROW",
]);

const locationCodeSchema = z.enum(["DUBLIN", "CLONMEL"]);

const planSchema = z.object({
  suppliers: z.array(z.object({ name: z.string() })),
  itemTypes: z.array(
    z.object({ code: z.string(), name: z.string(), sortOrder: z.number().int() }),
  ),
  items: z.array(
    z.object({
      // Deliberately not `.min(1)`. Invariant 9 is enforced by the hand-written CHECK
      // `Item_description_not_empty` (spec 004), and AC-24 proves that the CHECK, inside
      // the transaction, is what rolls the whole import back. Duplicating the rule here
      // would replace that proof with a proof that Zod works.
      description: z.string(),
      supplierName: z.string().nullable(),
      itemTypeCode: z.string(),
      unitLabel: z.string().nullable(),
      unitKind: z.enum(UNIT_KINDS),
      unitQuantityKg: z.string().nullable(),
      needsReview: z.boolean(),
      notes: z.string().nullable(),
      unitPrice: z.string().nullable(),
      links: z.array(
        z.object({ locationCode: locationCodeSchema, sortOrder: z.number().int() }),
      ),
      cells: z.array(z.string()),
      reviewReasons: z.array(reviewReasonSchema),
    }),
  ),
  sheets: z.array(
    z.object({
      name: z.enum(YARD_SHEET_NAMES),
      firstRow: z.number().int(),
      lastRow: z.number().int(),
      rowsRead: z.number().int(),
      belowTotalRows: z.number().int(),
    }),
  ),
  supplierVariants: z.array(
    z.object({
      variant: z.string(),
      canonical: z.string(),
      rowCount: z.number().int(),
      cells: z.array(z.string()),
    }),
  ),
  sharedItems: z.array(
    z.object({
      description: z.string(),
      supplier: z.string().nullable(),
      cells: z.array(z.string()),
    }),
  ),
  conflicts: z.array(
    z.object({
      field: z.enum(["unitLabel", "itemType"]),
      description: z.string(),
      supplier: z.string().nullable(),
      cells: z.array(z.string()),
      readings: z.array(z.string().nullable()),
      winner: z.string().nullable(),
    }),
  ),
});

const sourceSchema = z.object({
  fileName: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string(),
});

/** docs/architecture.md § Validation: a seed script's input is parsed at the edge. */
const inputSchema = z.union([
  z.object({ fileName: z.string().min(1), bytes: z.instanceof(Uint8Array) }),
  z.object({ source: sourceSchema, plan: planSchema }),
]);

function assertValidInput(input: ImportWorkbookInput): void {
  const parsed = inputSchema.safeParse(input);

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first === undefined ? "input" : first.path.join(".") || "input";
    const detail = first === undefined ? "the shape is wrong" : first.message;

    throw new ValidationError(
      field,
      `importWorkbook was given an input it cannot use: ${detail} (at ${field})`,
    );
  }
}

async function planFrom(input: ImportWorkbookInput): Promise<{ plan: ImportPlan; source: ImportSource }> {
  if ("plan" in input) return { plan: input.plan, source: input.source };

  const buffer = Buffer.from(input.bytes);
  const rows = await readYardSheets(buffer);

  return { plan: buildImportPlan(rows), source: describeSource(input.fileName, buffer) };
}

/** `@db.Date` back to the `YYYY-MM-DD` the pure layer compares on. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Reads the workbook, plans the import, and writes what is missing — once, atomically.
 *
 * The two yards are resolved by `Location.code`; they are never created. #4's migration
 * owns `loc_dublin` and `loc_clonmel`, and a database without them fails with a
 * `NotFoundError` naming the missing code rather than inventing a yard (AC-19).
 */
export async function importWorkbook(input: ImportWorkbookInput): Promise<ImportOutcome> {
  assertValidInput(input);

  const { plan, source } = await planFrom(input);

  return await db.$transaction(
    async (tx) => {
      // Every read is ordered by id, and `item` is the one that has to be.
      //
      // Postgres returns rows in whatever order it pleases, and `diffPlan`'s second
      // matching pass walks `existing.items` to find the first UNCLAIMED row of a given
      // description. Unordered, two runs against the same database can claim two different
      // rows — the #5 review reproduced exactly that, one run taking `item_kelly` and the
      // next `item_kestrel`. Nothing is corrupted either way, because the importer is
      // insert-only; but `divergences[]` would differ between runs, and AC-16 promises a
      // deterministic report. Ordering the read is the cheap end of that fix.
      const ordered = { id: "asc" } as const;

      const [locations, suppliers, itemTypes, items, prices, links] = await Promise.all([
        tx.location.findMany({ select: { id: true, code: true }, orderBy: ordered }),
        tx.supplier.findMany({ select: { id: true, name: true }, orderBy: ordered }),
        tx.itemType.findMany({ select: { id: true, code: true }, orderBy: ordered }),
        tx.item.findMany({
          select: {
            id: true,
            description: true,
            supplierId: true,
            itemTypeId: true,
            unitLabel: true,
            unitKind: true,
            unitQuantityKg: true,
            active: true,
            needsReview: true,
            notes: true,
          },
          orderBy: ordered,
        }),
        tx.itemPrice.findMany({
          select: {
            itemId: true,
            effectiveFrom: true,
            unitPrice: true,
            currency: true,
            label: true,
          },
          orderBy: ordered,
        }),
        tx.itemLocation.findMany({
          select: { itemId: true, locationId: true, sortOrder: true, active: true },
          orderBy: ordered,
        }),
      ]);

      const existing: ExistingMasterData = {
        locations,
        suppliers,
        itemTypes,
        items: items.map((item) => ({
          ...item,
          unitQuantityKg: item.unitQuantityKg === null ? null : item.unitQuantityKg.toString(),
        })),
        prices: prices.map((price) => ({
          itemId: price.itemId,
          effectiveFrom: dateOnly(price.effectiveFrom),
          unitPrice: price.unitPrice.toString(),
          currency: price.currency,
          label: price.label,
        })),
        links,
      };

      const diff = diffPlan(plan, existing);

      const createdSuppliers =
        diff.suppliersToCreate.length === 0
          ? []
          : await tx.supplier.createManyAndReturn({
              data: diff.suppliersToCreate.map((supplier) => ({ name: supplier.name })),
              select: { id: true, name: true },
            });

      const createdItemTypes =
        diff.itemTypesToCreate.length === 0
          ? []
          : await tx.itemType.createManyAndReturn({
              data: diff.itemTypesToCreate,
              select: { id: true, code: true },
            });

      const supplierIdByName = new Map(
        [...suppliers, ...createdSuppliers].map((supplier) => [supplier.name, supplier.id]),
      );
      const itemTypeIdByCode = new Map(
        [...itemTypes, ...createdItemTypes].map((itemType) => [itemType.code, itemType.id]),
      );

      const toCreate = diff.items.filter((decision) => decision.existingItemId === null);

      const createdItems =
        toCreate.length === 0
          ? []
          : await tx.item.createManyAndReturn({
              data: toCreate.map((decision) => {
                const item = plan.items[decision.planIndex];
                const itemTypeId = itemTypeIdByCode.get(item.itemTypeCode);

                if (itemTypeId === undefined) {
                  throw new ConflictError(
                    `item type ${item.itemTypeCode} was planned but is not in the database`,
                  );
                }

                return {
                  description: item.description,
                  supplierId:
                    item.supplierName === null
                      ? null
                      : supplierIdByName.get(item.supplierName) ?? null,
                  itemTypeId,
                  unitLabel: item.unitLabel,
                  unitKind: item.unitKind,
                  unitQuantityKg: item.unitQuantityKg,
                  active: true,
                  needsReview: item.needsReview,
                  notes: item.notes,
                };
              }),
              select: { id: true, description: true, supplierId: true },
            });

      // Keyed on the identity the schema itself uses, `(description, supplierId)`, rather
      // than on the order Postgres happened to return the rows in.
      const createdIdByKey = new Map(
        createdItems.map((item) => [itemKeyOf(item.description, item.supplierId), item.id]),
      );

      const itemIdOf = (planIndex: number, existingItemId: string | null): string => {
        if (existingItemId !== null) return existingItemId;

        const item = plan.items[planIndex];
        const supplierId =
          item.supplierName === null ? null : supplierIdByName.get(item.supplierName) ?? null;
        const id = createdIdByKey.get(itemKeyOf(item.description, supplierId));

        if (id === undefined) {
          throw new ConflictError(`${item.description} was planned but no row came back for it`);
        }
        return id;
      };

      const priceRows = diff.items.flatMap((decision) => {
        const unitPrice = plan.items[decision.planIndex].unitPrice;
        if (!decision.createPrice || unitPrice === null) return [];

        return [
          {
            itemId: itemIdOf(decision.planIndex, decision.existingItemId),
            unitPrice,
            currency: PRICE_CURRENCY,
            effectiveFrom: new Date(`${PRICE_EFFECTIVE_FROM}T00:00:00.000Z`),
            label: PRICE_LABEL,
          },
        ];
      });

      const linkRows = diff.items.flatMap((decision) =>
        decision.linksToCreate.map((link) => ({
          itemId: itemIdOf(decision.planIndex, decision.existingItemId),
          locationId: link.locationId,
          sortOrder: link.sortOrder,
          active: true,
        })),
      );

      const createdPrices =
        priceRows.length === 0 ? { count: 0 } : await tx.itemPrice.createMany({ data: priceRows });
      const createdLinks =
        linkRows.length === 0 ? { count: 0 } : await tx.itemLocation.createMany({ data: linkRows });

      const created: TableCounts = {
        suppliers: createdSuppliers.length,
        itemTypes: createdItemTypes.length,
        items: createdItems.length,
        prices: createdPrices.count,
        links: createdLinks.count,
      };

      // What the plan said would happen and what Postgres actually did must agree. If they
      // do not, the transaction is abandoned rather than reported as a success.
      for (const table of Object.keys(created) as (keyof TableCounts)[]) {
        if (created[table] !== diff.counts.toCreate[table]) {
          throw new ConflictError(
            `the import planned ${diff.counts.toCreate[table]} ${table} rows but wrote ` +
              `${created[table]}; the run has been abandoned and nothing was written`,
          );
        }
      }

      return {
        created,
        skipped: diff.counts.skipped,
        report: buildImportReport(plan, diff, source),
      };
    },
    { maxWait: TRANSACTION_MAX_WAIT_MS, timeout: TRANSACTION_TIMEOUT_MS },
  );
}

/**
 * The plan and the report, with no database at all.
 *
 * `npm run seed:workbook -- --dry-run` uses this: it prints the same report, states the
 * same 140 planned items and opens no connection (AC-27).
 */
export async function planWorkbook(
  fileName: string,
  bytes: Uint8Array,
): Promise<{ plan: ImportPlan; source: ImportSource; report: ImportReport }> {
  const { plan, source } = await planFrom({ fileName, bytes });
  const diff = diffPlan(plan, {
    locations: [
      { id: "loc_dublin", code: "DUBLIN" },
      { id: "loc_clonmel", code: "CLONMEL" },
    ],
    suppliers: [],
    itemTypes: [],
    items: [],
    prices: [],
    links: [],
  });

  return { plan, source, report: buildImportReport(plan, diff, source) };
}
