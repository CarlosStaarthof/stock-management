/**
 * Unit-label normalisation, `specs/domain-model.md` Part 2 § Units.
 *
 * The yard sheet writes the same unit six ways — `20kg`, `20 Kg`, `20Kg`, `20kgs`, `18KG`,
 * `14 kgs` — and staff recognise the exact string they wrote. So the label is preserved
 * verbatim and only the MEANING is derived: what is being counted (`unitKind`) and, when
 * the label states one, how many kilograms one of them weighs (`unitQuantityKg`).
 *
 * Pure, and deliberately Prisma-free: `src/lib/` never imports the database layer
 * (docs/architecture.md, dependency rule), which is what lets spec 005 AC-10 run in
 * `npm run test:unit` on a machine with no Postgres.
 */

/**
 * The `UnitKind` enum of `prisma/schema.prisma`, in declaration order.
 *
 * Spec 005 AC-10 asserts this array equals the enum's labels by reading the schema file as
 * TEXT rather than importing the generated client, so the check needs no database and this
 * module keeps its one-way dependency.
 */
export const UNIT_KINDS = ["TONNE", "KILOGRAM", "LITRE", "UNIT", "LINEAR_METRE"] as const;

export type UnitKind = (typeof UNIT_KINDS)[number];

export type NormalisedUnit = {
  /** The workbook's own string, unchanged. `null` when the cell was blank. */
  unitLabel: string | null;
  unitKind: UnitKind;
  /** `"1000"` for TONNE, the parsed kilograms for KILOGRAM, `null` for every other kind. */
  unitQuantityKg: string | null;
};

// specs/domain-model.md Part 2: `Tonne` -> TONNE, 1000.
const KG_PER_TONNE = "1000";

const TONNE = /^tonnes?$/i;
// `20kg`, `20 Kg`, `20Kg`, `20kgs`, `18KG`, `21 Kg`, `900 Kgs`, `14 kgs`, `900kg`.
const KILOGRAM = /^(\d+(?:\.\d+)?)\s*(?:kg|kgs)$/i;
// `25L` — a litre count with a number in front.
const LITRE_WITH_COUNT = /^\d+(?:\.\d+)?\s*(?:l|ltr|ltrs|litre|litres)$/i;
// `Ltrs` — the two below-total fuel rows, which are measured in litres with no pack size.
const LITRE_BARE = /^(?:l|ltr|ltrs|litre|litres)$/i;
// `lin.m` — 50mm speed bumps, sold by the linear metre.
const LINEAR_METRE = /^lin\.?\s*m(?:etres?)?$/i;

/**
 * `20` from `20 Kg`, without the trailing-zero noise a `Number` round trip would add.
 *
 * The value lands in `Item.unitQuantityKg`, a `Decimal(12, 4)`, so it stays a string all
 * the way to Prisma: `docs/architecture.md` § Money and quantities forbids a JavaScript
 * number for anything the database stores as a decimal.
 */
function canonicalDecimalText(text: string): string {
  const [whole, fraction = ""] = text.split(".");
  const trimmedWhole = whole.replace(/^0+(?=\d)/, "");
  const trimmedFraction = fraction.replace(/0+$/, "");
  return trimmedFraction === "" ? trimmedWhole : `${trimmedWhole}.${trimmedFraction}`;
}

/**
 * Part 2's table, as a function.
 *
 * An unrecognised label falls to `UNIT` rather than throwing, because that is what
 * `prisma/schema.prisma` says the default means — "a bare number with no label is a count
 * of things" — and because the importer never silently drops a row (Part 2). A row whose
 * label was never understood is still imported; `Item.needsReview` and #15's housekeeping
 * worklist are how a human gets asked about it.
 */
export function normaliseUnit(raw: string | null): NormalisedUnit {
  const unitLabel = raw === null || raw.trim() === "" ? null : raw;
  const text = (raw ?? "").trim();

  if (text === "") {
    return { unitLabel, unitKind: "UNIT", unitQuantityKg: null };
  }

  if (TONNE.test(text)) {
    return { unitLabel, unitKind: "TONNE", unitQuantityKg: KG_PER_TONNE };
  }

  const kilograms = KILOGRAM.exec(text);
  if (kilograms !== null) {
    return {
      unitLabel,
      unitKind: "KILOGRAM",
      unitQuantityKg: canonicalDecimalText(kilograms[1]),
    };
  }

  if (LITRE_WITH_COUNT.test(text) || LITRE_BARE.test(text)) {
    return { unitLabel, unitKind: "LITRE", unitQuantityKg: null };
  }

  if (LINEAR_METRE.test(text)) {
    return { unitLabel, unitKind: "LINEAR_METRE", unitQuantityKg: null };
  }

  // `1 Unit`, `I Unit` (a capital i, not the digit one), `2 Unit`, `3 Unit`, `Unit`, `1`,
  // and anything the table does not name.
  return { unitLabel, unitKind: "UNIT", unitQuantityKg: null };
}
