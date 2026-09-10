import { createHash } from "node:crypto";

import {
  formatCellRef,
  YARD_SHEET_NAMES,
  type YardSheetName,
  type YardSheetRow,
} from "@/lib/excel/workbook-reader";
import { normaliseUnit, type UnitKind } from "@/lib/units";
import { ConflictError, NotFoundError } from "@/server/errors";

/**
 * Steps two of spec 005's pipeline — read, PLAN, write — and the pure boundary before the
 * write.
 *
 * Nothing here touches Prisma, opens a connection or knows what a spreadsheet is. It takes
 * `YardSheetRow[]` and plain records of what the database already holds, and answers three
 * questions: what the workbook says (`buildImportPlan`), what is missing from the database
 * (`diffPlan`), and what a human needs to be told (`buildImportReport`). That is what makes
 * AC-1 to AC-17 provable in `npm run test:unit` with no Postgres at all.
 *
 * The `Summary` sheet and the `Clonmel Trucks & Yard` sheet are excluded from this feature
 * (specs/domain-model.md Part 2 § Not imported); this module never sees them, because the
 * reader never returns them.
 */

/** `Location.code` for each yard sheet. #4's migration seeded both rows; #5 only reads them. */
export const LOCATION_CODE_BY_SHEET = {
  Dublin: "DUBLIN",
  "Clonmel ": "CLONMEL",
} as const satisfies Record<YardSheetName, string>;

export type LocationCode = (typeof LOCATION_CODE_BY_SHEET)[YardSheetName];

/** specs/domain-model.md Part 2 § Prices: the single price column is the 2025 list. */
export const PRICE_EFFECTIVE_FROM = "2025-01-01";
/** The string `Dublin!E2` and `'Clonmel '!E2` both hold. */
export const PRICE_LABEL = "2025 Prices";
export const PRICE_CURRENCY = "EUR";

/**
 * The item types of specs/domain-model.md Part 2, in Part 2's order.
 *
 * Pinned literally rather than derived from first appearance on the sheets, because the
 * two do not agree: Dublin meets `A-S` fourth and `'Clonmel '` meets `C-E` third, so a
 * first-appearance rule would produce a different answer from the one Part 2 states.
 * `code` and `name` are both the workbook's own spelling (spec 005 Open questions §3).
 */
const ITEM_TYPE_ORDER: readonly string[] = [
  "Thermo-P",
  "Beads",
  "C-E",
  "A-S",
  "Cold A-S",
  "Primer",
  "M-Grip",
  "Vialine",
  "Paint",
  "MMA",
  "Logo",
  "Sealer",
  "Cleaner",
  "F&F",
  "Ramps",
  "Aerosol",
  "Bauxite",
  "Glue",
  "Fuel",
];

/** `'Clonmel '!C66` reads `Logo's`, and it is the `Logo` type (Part 2). */
const ITEM_TYPE_VARIANTS = new Map<string, string>([["Logo's", "Logo"]]);

/**
 * The Kelly family, Part 2's table.
 *
 * `Meon ` and `Visever ` are not listed here: the difference is trailing whitespace and a
 * trim handles both. There is deliberately NO leading-`t` rule — `tMeon`, `tKelly's` and
 * `tBriteline` were a defect in an old reader, not spellings in the file, and stripping a
 * character the workbook does not contain would corrupt a real supplier name (AC-8).
 */
const SUPPLIER_VARIANTS = new Map<string, string>([
  ["Kellys", "Kelly"],
  ["Kelly's", "Kelly"],
]);

export type ReviewReason =
  | "MISSING_SUPPLIER"
  | "MISSING_UNIT"
  | "MISSING_PRICE"
  | "BELOW_TOTAL_ROW";

const REVIEW_REASON_ORDER: readonly ReviewReason[] = [
  "MISSING_SUPPLIER",
  "MISSING_UNIT",
  "MISSING_PRICE",
  "BELOW_TOTAL_ROW",
];

export type ImportPlanSupplier = { name: string };

export type ImportPlanItemType = { code: string; name: string; sortOrder: number };

export type ImportPlanLink = { locationCode: LocationCode; sortOrder: number };

export type ImportPlanItem = {
  description: string;
  supplierName: string | null;
  itemTypeCode: string;
  unitLabel: string | null;
  unitKind: UnitKind;
  unitQuantityKg: string | null;
  needsReview: boolean;
  notes: string | null;
  /** `null` for the 11 items the workbook prices nowhere. Never a JavaScript number. */
  unitPrice: string | null;
  links: ImportPlanLink[];
  /** Every source cell this item was built from, e.g. `["Dublin!A3", "'Clonmel '!A3"]`. */
  cells: string[];
  /** Why `needsReview` is true. Empty when it is false. */
  reviewReasons: ReviewReason[];
};

export type PlannedSheet = {
  name: YardSheetName;
  firstRow: number;
  lastRow: number;
  rowsRead: number;
  belowTotalRows: number;
};

export type SupplierVariant = {
  variant: string;
  canonical: string;
  rowCount: number;
  cells: string[];
};

export type SharedItem = {
  description: string;
  supplier: string | null;
  cells: string[];
};

export type PlanConflict = {
  field: "unitLabel" | "itemType";
  description: string;
  supplier: string | null;
  /** The winning cell first, the recorded-and-not-applied cell second. */
  cells: string[];
  /** The two disagreeing readings, in the same order as `cells`. Never monetary. */
  readings: (string | null)[];
  winner: string | null;
};

/**
 * What the workbook says, as plain data.
 *
 * The first three sections are spec 005's Contract, unchanged. The last four are derived
 * from the same rows and carry the detail AC-16's report has to print — the spelling a
 * supplier was collapsed from, which cell a conflict came from — which the canonical
 * three cannot express. They are all non-monetary and all a pure function of `rows`, so
 * `buildImportPlan(rows)` keeps the one argument the Contract gives it.
 */
export type ImportPlan = {
  suppliers: ImportPlanSupplier[];
  itemTypes: ImportPlanItemType[];
  items: ImportPlanItem[];
  sheets: PlannedSheet[];
  supplierVariants: SupplierVariant[];
  sharedItems: SharedItem[];
  conflicts: PlanConflict[];
};

export type TableCounts = {
  suppliers: number;
  itemTypes: number;
  items: number;
  prices: number;
  links: number;
};

/** A row the workbook and the database disagree about, which the importer did NOT change. */
export type Divergence = {
  entity: "Item" | "ItemPrice" | "ItemLocation";
  key: string;
  field: string;
  workbook: string | null;
  database: string | null;
};

export type ItemPlanDecision = {
  /** Index into `plan.items`. */
  planIndex: number;
  /** The row already in the database, or `null` when the item has to be created. */
  existingItemId: string | null;
  createPrice: boolean;
  linksToCreate: { locationCode: LocationCode; locationId: string; sortOrder: number }[];
};

export type ImportDiff = {
  suppliersToCreate: ImportPlanSupplier[];
  itemTypesToCreate: ImportPlanItemType[];
  /** One decision per planned item, in plan order. */
  items: ItemPlanDecision[];
  counts: { planned: TableCounts; toCreate: TableCounts; skipped: TableCounts };
  divergences: Divergence[];
};

export type ImportSource = { fileName: string; byteLength: number; sha256: string };

/**
 * The workbook the report is about: its name, its size and its digest.
 *
 * It lives in the pure layer, beside `buildImportReport`, because it is a fact about bytes
 * and not about the database — and because keeping Node's `createHash(...).update(...)`
 * out of the writing service lets AC-22's scan for `.update` stay a plain, unqualified
 * search for a Prisma write.
 */
export function describeSource(fileName: string, bytes: Uint8Array): ImportSource {
  return {
    fileName,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export type ReportCount = {
  table: "Supplier" | "ItemType" | "Item" | "ItemPrice" | "ItemLocation";
  planned: number;
  created: number;
  skipped: number;
};

export type ReportReviewEntry = {
  sheetCell: string;
  description: string;
  reasons: ReviewReason[];
};

export type ImportReport = {
  source: ImportSource;
  sheets: PlannedSheet[];
  counts: ReportCount[];
  needsReview: ReportReviewEntry[];
  supplierVariants: SupplierVariant[];
  sharedItems: SharedItem[];
  conflicts: PlanConflict[];
  divergences: Divergence[];
};

export type ExistingSupplier = { id: string; name: string };
export type ExistingItemType = { id: string; code: string };
export type ExistingLocation = { id: string; code: string };

export type ExistingItem = {
  id: string;
  description: string;
  supplierId: string | null;
  itemTypeId: string;
  unitLabel: string | null;
  unitKind: string;
  unitQuantityKg: string | null;
  active: boolean;
  needsReview: boolean;
  notes: string | null;
};

export type ExistingItemPrice = {
  itemId: string;
  /** `YYYY-MM-DD`. The service formats the `@db.Date` column; this module stays pure. */
  effectiveFrom: string;
  unitPrice: string;
  currency: string;
  label: string | null;
};

export type ExistingItemLocation = {
  itemId: string;
  locationId: string;
  sortOrder: number;
  active: boolean;
};

export type ExistingMasterData = {
  locations: ExistingLocation[];
  suppliers: ExistingSupplier[];
  itemTypes: ExistingItemType[];
  items: ExistingItem[];
  prices: ExistingItemPrice[];
  links: ExistingItemLocation[];
};

const SHEET_ORDER = new Map<string, number>(YARD_SHEET_NAMES.map((name, index) => [name, index]));

function canonicalSupplierName(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  return SUPPLIER_VARIANTS.get(trimmed) ?? trimmed;
}

function canonicalItemTypeCode(raw: string): string {
  const trimmed = raw.trim();
  return ITEM_TYPE_VARIANTS.get(trimmed) ?? trimmed;
}

/** NUL and SOH cannot occur in a worksheet string, so a composed key cannot collide. */
export function itemKeyOf(description: string, supplierName: string | null): string {
  return `${description}\u0000${supplierName ?? "\u0001"}`;
}

/** Two decimal strings that mean the same number compare equal. `1000.0000` is `1000`. */
export function canonicalDecimal(text: string | null): string | null {
  if (text === null) return null;
  const parts = /^(-?)(\d*)(?:\.(\d*))?$/.exec(text.trim());
  if (parts === null) return text.trim();

  const [, sign, whole, fraction = ""] = parts;
  const trimmedWhole = whole.replace(/^0+(?=\d)/, "") || "0";
  const trimmedFraction = fraction.replace(/0+$/, "");
  const magnitude = trimmedFraction === "" ? trimmedWhole : `${trimmedWhole}.${trimmedFraction}`;
  return /^0(\.0*)?$/.test(magnitude) ? "0" : `${sign}${magnitude}`;
}

function bySheetThenRow(a: { sheet: string; row: number }, b: { sheet: string; row: number }): number {
  const sheetDelta = (SHEET_ORDER.get(a.sheet) ?? 0) - (SHEET_ORDER.get(b.sheet) ?? 0);
  return sheetDelta !== 0 ? sheetDelta : a.row - b.row;
}

type ItemAccumulator = {
  key: string;
  description: string;
  supplierName: string | null;
  itemTypeCode: string;
  itemTypeRow: YardSheetRow;
  unitLabel: string | null;
  unitLabelRow: YardSheetRow | null;
  unitPrice: string | null;
  unitPriceRow: YardSheetRow | null;
  belowTotal: boolean;
  links: Map<LocationCode, ImportPlanLink>;
  rows: YardSheetRow[];
  notes: string[];
  conflicts: PlanConflict[];
};

function describeItem(accumulator: ItemAccumulator): string {
  return accumulator.supplierName === null
    ? `${accumulator.description} (no supplier)`
    : `${accumulator.description} / ${accumulator.supplierName}`;
}

/**
 * The workbook as a plan, deterministic and free of the database.
 *
 * An item is `(trimmed description, canonical supplier)`. Internal whitespace is PRESERVED,
 * so `Bicycle Logo's  1200mm` and `Bicycle Logo's   1200mm` are two items: the user decided
 * that at approval (spec 005 Open questions §5) and it is the difference between 140 items
 * and 138. Trailing space is trimmed, because Part 2 says trim, not collapse.
 */
export function buildImportPlan(rows: YardSheetRow[]): ImportPlan {
  const ordered = [...rows].sort(bySheetThenRow);

  const accumulators = new Map<string, ItemAccumulator>();
  const order: string[] = [];
  const supplierOrder: string[] = [];
  const supplierFirstCell = new Map<string, string>();
  const variants = new Map<string, SupplierVariant>();
  const typeOrder: string[] = [];

  for (const row of ordered) {
    const supplierName = canonicalSupplierName(row.supplier);
    const itemTypeCode = canonicalItemTypeCode(row.itemType);
    const key = itemKeyOf(row.description, supplierName);
    const locationCode = LOCATION_CODE_BY_SHEET[row.sheet];

    if (supplierName !== null && !supplierFirstCell.has(supplierName)) {
      supplierFirstCell.set(supplierName, formatCellRef(row.sheet, "B", row.row));
      supplierOrder.push(supplierName);
    }
    if (row.supplier !== null && row.supplier !== supplierName) {
      const existing = variants.get(row.supplier);
      if (existing === undefined) {
        variants.set(row.supplier, {
          variant: row.supplier,
          canonical: supplierName ?? "",
          rowCount: 1,
          cells: [formatCellRef(row.sheet, "B", row.row)],
        });
      } else {
        existing.rowCount += 1;
        existing.cells.push(formatCellRef(row.sheet, "B", row.row));
      }
    }
    if (!typeOrder.includes(itemTypeCode)) typeOrder.push(itemTypeCode);

    const existing = accumulators.get(key);

    if (existing === undefined) {
      accumulators.set(key, {
        key,
        description: row.description,
        supplierName,
        itemTypeCode,
        itemTypeRow: row,
        unitLabel: row.unitLabel,
        unitLabelRow: row.unitLabel === null ? null : row,
        unitPrice: row.price,
        unitPriceRow: row.price === null ? null : row,
        belowTotal: row.belowTotal,
        links: new Map([[locationCode, { locationCode, sortOrder: row.row }]]),
        rows: [row],
        notes: [],
        conflicts: [],
      });
      order.push(key);
      continue;
    }

    existing.rows.push(row);
    existing.belowTotal = existing.belowTotal || row.belowTotal;

    // Two rows on ONE sheet with the same identity would be two links to one location, and
    // `@@unique([itemId, locationId])` refuses that. It does not happen in this workbook
    // (82 Dublin rows and 70 Clonmel rows make 152 links across 140 items); the first row
    // keeps the sort order if it ever does, and the second row's values still merge below.
    if (!existing.links.has(locationCode)) {
      existing.links.set(locationCode, { locationCode, sortOrder: row.row });
    }

    if (existing.itemTypeCode !== itemTypeCode) {
      const cells = [
        formatCellRef(existing.itemTypeRow.sheet, "C", existing.itemTypeRow.row),
        formatCellRef(row.sheet, "C", row.row),
      ];
      existing.conflicts.push({
        field: "itemType",
        description: existing.description,
        supplier: existing.supplierName,
        cells,
        readings: [existing.itemTypeCode, itemTypeCode],
        winner: existing.itemTypeCode,
      });
      existing.notes.push(
        `Item type differs between the yard sheets: ${cells[0]} ${JSON.stringify(existing.itemTypeCode)} ` +
          `is used; ${cells[1]} ${JSON.stringify(itemTypeCode)} is recorded here and not applied.`,
      );
    }

    if (row.unitLabel !== null && existing.unitLabel === null) {
      existing.unitLabel = row.unitLabel;
      existing.unitLabelRow = row;
    } else if (
      row.unitLabel !== null &&
      existing.unitLabelRow !== null &&
      existing.unitLabel !== row.unitLabel
    ) {
      const cells = [
        formatCellRef(existing.unitLabelRow.sheet, "D", existing.unitLabelRow.row),
        formatCellRef(row.sheet, "D", row.row),
      ];
      existing.conflicts.push({
        field: "unitLabel",
        description: existing.description,
        supplier: existing.supplierName,
        cells,
        readings: [existing.unitLabel, row.unitLabel],
        winner: existing.unitLabel,
      });
      existing.notes.push(
        `Unit label differs between the yard sheets: ${cells[0]} ${JSON.stringify(existing.unitLabel)} ` +
          `is used; ${cells[1]} ${JSON.stringify(row.unitLabel)} is recorded here and not applied.`,
      );
    }

    if (row.price !== null && existing.unitPrice === null) {
      existing.unitPrice = row.price;
      existing.unitPriceRow = row;
    } else if (
      row.price !== null &&
      existing.unitPriceRow !== null &&
      canonicalDecimal(existing.unitPrice) !== canonicalDecimal(row.price)
    ) {
      // Never averaged and never picked: a silently chosen price would make the
      // application disagree with the file it replaces (Invariant 10, AC-14).
      throw new ConflictError(
        `${describeItem(existing)} is priced twice and the two disagree: ` +
          `${formatCellRef(existing.unitPriceRow.sheet, "E", existing.unitPriceRow.row)} holds ` +
          `${existing.unitPrice} and ${formatCellRef(row.sheet, "E", row.row)} holds ${row.price}. ` +
          "Fix one of them in the workbook and run the import again.",
      );
    }
  }

  const items: ImportPlanItem[] = order.map((key) => {
    const accumulator = accumulators.get(key) as ItemAccumulator;
    const unit = normaliseUnit(accumulator.unitLabel);

    if (accumulator.belowTotal) {
      const cell = formatCellRef(accumulator.rows[0].sheet, "A", accumulator.rows[0].row);
      accumulator.notes.unshift(
        `Imported from ${cell}, which sits below the total row: the workbook's own total ` +
          "has never included it.",
      );
    }

    const reasons = REVIEW_REASON_ORDER.filter((reason) => {
      if (reason === "MISSING_SUPPLIER") return accumulator.supplierName === null;
      if (reason === "MISSING_UNIT") return unit.unitLabel === null;
      if (reason === "MISSING_PRICE") return accumulator.unitPrice === null;
      return accumulator.belowTotal;
    });

    return {
      description: accumulator.description,
      supplierName: accumulator.supplierName,
      itemTypeCode: accumulator.itemTypeCode,
      unitLabel: unit.unitLabel,
      unitKind: unit.unitKind,
      unitQuantityKg: unit.unitQuantityKg,
      needsReview: reasons.length > 0,
      notes: accumulator.notes.length === 0 ? null : accumulator.notes.join(" "),
      unitPrice: accumulator.unitPrice,
      links: [...accumulator.links.values()],
      cells: accumulator.rows.map((row) => formatCellRef(row.sheet, "A", row.row)),
      reviewReasons: reasons,
    };
  });

  const sheets: PlannedSheet[] = YARD_SHEET_NAMES.map((name) => {
    const inBlock = ordered.filter((row) => row.sheet === name && !row.belowTotal);
    const belowTotal = ordered.filter((row) => row.sheet === name && row.belowTotal);
    return {
      name,
      firstRow: inBlock.length === 0 ? 0 : inBlock[0].row,
      lastRow: inBlock.length === 0 ? 0 : inBlock[inBlock.length - 1].row,
      rowsRead: inBlock.length,
      belowTotalRows: belowTotal.length,
    };
  });

  // A type the workbook grew after Part 2 was written still gets a row and a sort order,
  // after the nineteen: the importer never drops a row it does not recognise.
  const itemTypes: ImportPlanItemType[] = [...typeOrder]
    .sort((a, b) => {
      const rankA = ITEM_TYPE_ORDER.indexOf(a);
      const rankB = ITEM_TYPE_ORDER.indexOf(b);
      if (rankA !== -1 && rankB !== -1) return rankA - rankB;
      if (rankA !== -1) return -1;
      if (rankB !== -1) return 1;
      return typeOrder.indexOf(a) - typeOrder.indexOf(b);
    })
    .map((code, index) => ({ code, name: code, sortOrder: index + 1 }));

  const conflicts = items
    .flatMap((_item, index) => accumulators.get(order[index])?.conflicts ?? [])
    .sort((a, b) => {
      const [sheetA, rowA] = splitCellRef(a.cells[0]);
      const [sheetB, rowB] = splitCellRef(b.cells[0]);
      const delta = bySheetThenRow({ sheet: sheetA, row: rowA }, { sheet: sheetB, row: rowB });
      return delta !== 0 ? delta : a.field.localeCompare(b.field);
    });

  const sharedItems: SharedItem[] = items
    .filter((item) => item.links.length > 1)
    .map((item) => ({ description: item.description, supplier: item.supplierName, cells: item.cells }));

  const supplierVariants = [...variants.values()].sort((a, b) => {
    const [sheetA, rowA] = splitCellRef(a.cells[0]);
    const [sheetB, rowB] = splitCellRef(b.cells[0]);
    return bySheetThenRow({ sheet: sheetA, row: rowA }, { sheet: sheetB, row: rowB });
  });

  return {
    suppliers: supplierOrder.map((name) => ({ name })),
    itemTypes,
    items,
    sheets,
    supplierVariants,
    sharedItems,
    conflicts,
  };
}

/** `'Clonmel '!D64` -> `["Clonmel ", 64]`. Used only to sort report arrays. */
function splitCellRef(cellRef: string): [string, number] {
  const parts = /^(?:'(.*)'|([^!]*))!([A-Z]+)(\d+)$/.exec(cellRef);
  if (parts === null) return ["", 0];
  return [parts[1] ?? parts[2] ?? "", Number(parts[4])];
}

function plannedCounts(plan: ImportPlan): TableCounts {
  return {
    suppliers: plan.suppliers.length,
    itemTypes: plan.itemTypes.length,
    items: plan.items.length,
    prices: plan.items.filter((item) => item.unitPrice !== null).length,
    links: plan.items.reduce((total, item) => total + item.links.length, 0),
  };
}

/**
 * What the database is missing, and what it disagrees about.
 *
 * INSERT-ONLY (AC-22). Nothing here ever proposes an update or a delete: from #6 the
 * database is the system of record and the workbook is a historical file, so a row that
 * already exists is left exactly as a human left it and every difference is reported as a
 * divergence instead.
 */
export function diffPlan(plan: ImportPlan, existing: ExistingMasterData): ImportDiff {
  const locationIdByCode = new Map(existing.locations.map((location) => [location.code, location.id]));
  const usedCodes = new Set(plan.items.flatMap((item) => item.links.map((link) => link.locationCode)));

  for (const code of [...usedCodes].sort()) {
    if (!locationIdByCode.has(code)) {
      throw new NotFoundError(
        `Location ${code} is not in the database. #4's migration seeds DUBLIN and CLONMEL; ` +
          "this importer reads them and never creates them.",
      );
    }
  }

  const supplierIdByName = new Map(existing.suppliers.map((supplier) => [supplier.name, supplier.id]));
  const itemTypeCodes = new Set(existing.itemTypes.map((itemType) => itemType.code));

  const suppliersToCreate = plan.suppliers.filter((supplier) => !supplierIdByName.has(supplier.name));
  const itemTypesToCreate = plan.itemTypes.filter((itemType) => !itemTypeCodes.has(itemType.code));

  // AC-23: Postgres treats NULLs as distinct, so `@@unique([description, supplierId])`
  // cannot stop two supplier-less `School Logo Triangle` rows. The match happens here, in
  // application code, on `(description, supplierId ?? null)`, with two nulls equal.
  const existingByKey = new Map<string, ExistingItem>();
  for (const item of existing.items) {
    existingByKey.set(itemKeyOf(item.description, item.supplierId), item);
  }

  const claimed = new Set<string>();
  const matches: (ExistingItem | null)[] = plan.items.map((item) => {
    let supplierId: string | null = null;

    if (item.supplierName !== null) {
      const found = supplierIdByName.get(item.supplierName);
      // The supplier row is about to be created, so no stored item can carry it — and no
      // stored SUPPLIER-LESS row of the same description may be mistaken for this one.
      if (found === undefined) return null;
      supplierId = found;
    }

    const stored = existingByKey.get(itemKeyOf(item.description, supplierId)) ?? null;
    if (stored !== null) claimed.add(stored.id);
    return stored;
  });

  // Second pass, and the reason AC-22's third run creates nothing: an ADMIN who fills in
  // `School Logo Triangle`'s missing supplier moves the stored row out of the key the
  // workbook plans it under. Without this, the next import would insert a second, blank
  // copy and silently undo the correction the 15 needsReview flags exist to prompt.
  plan.items.forEach((item, index) => {
    if (matches[index] !== null || item.supplierName !== null) return;
    const candidate = existing.items.find(
      (stored) => stored.description === item.description && !claimed.has(stored.id),
    );
    if (candidate !== undefined) {
      claimed.add(candidate.id);
      matches[index] = candidate;
    }
  });

  const priceByItemAndDate = new Map(
    existing.prices.map((price) => [`${price.itemId}\u0000${price.effectiveFrom}`, price]),
  );
  const linkByItemAndLocation = new Map(
    existing.links.map((link) => [`${link.itemId}\u0000${link.locationId}`, link]),
  );

  const divergences: Divergence[] = [];
  const decisions: ItemPlanDecision[] = [];
  let pricesToCreate = 0;
  let linksToCreate = 0;
  let pricesSkipped = 0;
  let linksSkipped = 0;

  plan.items.forEach((item, planIndex) => {
    const match = matches[planIndex];
    const key = item.supplierName === null ? item.description : `${item.description} / ${item.supplierName}`;

    if (match !== null) {
      const storedSupplierName =
        match.supplierId === null
          ? null
          : existing.suppliers.find((supplier) => supplier.id === match.supplierId)?.name ?? null;
      const storedTypeCode =
        existing.itemTypes.find((itemType) => itemType.id === match.itemTypeId)?.code ?? null;

      recordDivergence(divergences, "Item", key, "supplierName", item.supplierName, storedSupplierName);
      recordDivergence(divergences, "Item", key, "itemTypeCode", item.itemTypeCode, storedTypeCode);
      recordDivergence(divergences, "Item", key, "unitLabel", item.unitLabel, match.unitLabel);
      recordDivergence(divergences, "Item", key, "unitKind", item.unitKind, match.unitKind);
      recordDivergence(
        divergences,
        "Item",
        key,
        "unitQuantityKg",
        canonicalDecimal(item.unitQuantityKg),
        canonicalDecimal(match.unitQuantityKg),
      );
      recordDivergence(divergences, "Item", key, "active", "true", String(match.active));
      recordDivergence(divergences, "Item", key, "needsReview", String(item.needsReview), String(match.needsReview));
      recordDivergence(divergences, "Item", key, "notes", item.notes, match.notes);
    }

    let createPrice = false;
    if (item.unitPrice !== null) {
      if (match === null) {
        createPrice = true;
      } else {
        const stored = priceByItemAndDate.get(`${match.id}\u0000${PRICE_EFFECTIVE_FROM}`);
        if (stored === undefined) {
          createPrice = true;
        } else {
          pricesSkipped += 1;
          recordDivergence(
            divergences,
            "ItemPrice",
            `${key} @ ${PRICE_EFFECTIVE_FROM}`,
            "unitPrice",
            canonicalDecimal(item.unitPrice),
            canonicalDecimal(stored.unitPrice),
          );
          recordDivergence(
            divergences,
            "ItemPrice",
            `${key} @ ${PRICE_EFFECTIVE_FROM}`,
            "currency",
            PRICE_CURRENCY,
            stored.currency,
          );
          recordDivergence(
            divergences,
            "ItemPrice",
            `${key} @ ${PRICE_EFFECTIVE_FROM}`,
            "label",
            PRICE_LABEL,
            stored.label,
          );
        }
      }
    }
    if (createPrice) pricesToCreate += 1;

    const linksForItem: ItemPlanDecision["linksToCreate"] = [];
    for (const link of item.links) {
      const locationId = locationIdByCode.get(link.locationCode) as string;
      const stored = match === null ? undefined : linkByItemAndLocation.get(`${match.id}\u0000${locationId}`);

      if (stored === undefined) {
        linksForItem.push({ locationCode: link.locationCode, locationId, sortOrder: link.sortOrder });
        continue;
      }

      linksSkipped += 1;
      recordDivergence(
        divergences,
        "ItemLocation",
        `${key} @ ${link.locationCode}`,
        "sortOrder",
        String(link.sortOrder),
        String(stored.sortOrder),
      );
      recordDivergence(
        divergences,
        "ItemLocation",
        `${key} @ ${link.locationCode}`,
        "active",
        "true",
        String(stored.active),
      );
    }
    linksToCreate += linksForItem.length;

    decisions.push({
      planIndex,
      existingItemId: match === null ? null : match.id,
      createPrice,
      linksToCreate: linksForItem,
    });
  });

  const planned = plannedCounts(plan);
  const itemsToCreate = decisions.filter((decision) => decision.existingItemId === null).length;

  const toCreate: TableCounts = {
    suppliers: suppliersToCreate.length,
    itemTypes: itemTypesToCreate.length,
    items: itemsToCreate,
    prices: pricesToCreate,
    links: linksToCreate,
  };

  return {
    suppliersToCreate,
    itemTypesToCreate,
    items: decisions,
    counts: {
      planned,
      toCreate,
      skipped: {
        suppliers: planned.suppliers - toCreate.suppliers,
        itemTypes: planned.itemTypes - toCreate.itemTypes,
        items: planned.items - toCreate.items,
        prices: pricesSkipped,
        links: linksSkipped,
      },
    },
    divergences: divergences.sort(
      (a, b) =>
        a.entity.localeCompare(b.entity) || a.key.localeCompare(b.key) || a.field.localeCompare(b.field),
    ),
  };
}

function recordDivergence(
  into: Divergence[],
  entity: Divergence["entity"],
  key: string,
  field: string,
  workbook: string | null,
  database: string | null,
): void {
  if (workbook === database) return;
  into.push({ entity, key, field, workbook, database });
}

/**
 * The report a human reads, and the only output this feature has.
 *
 * It carries NO money (AC-17). Not a price, not a value, not a total, and no key matching
 * `/price|value|amount/i` at any depth — which is why `counts` is a list of tables rather
 * than an object with a `prices` field, and why a missing price is the reason CODE
 * `MISSING_PRICE`, a value and not a key.
 *
 * `source` is the third argument because AC-16 asks the report for the file name, byte
 * length and SHA-256 of the bytes that were read, and none of those is a property of a
 * plan or of a diff.
 */
export function buildImportReport(plan: ImportPlan, diff: ImportDiff, source: ImportSource): ImportReport {
  const tables: ReportCount["table"][] = ["Supplier", "ItemType", "Item", "ItemPrice", "ItemLocation"];
  const fields: (keyof TableCounts)[] = ["suppliers", "itemTypes", "items", "prices", "links"];

  return {
    source,
    sheets: plan.sheets,
    counts: tables.map((table, index) => ({
      table,
      planned: diff.counts.planned[fields[index]],
      created: diff.counts.toCreate[fields[index]],
      skipped: diff.counts.skipped[fields[index]],
    })),
    needsReview: plan.items
      .filter((item) => item.needsReview)
      .map((item) => ({
        sheetCell: item.cells[0],
        description: item.description,
        reasons: item.reviewReasons,
      })),
    supplierVariants: plan.supplierVariants,
    sharedItems: plan.sharedItems,
    conflicts: plan.conflicts,
    divergences: diff.divergences,
  };
}
