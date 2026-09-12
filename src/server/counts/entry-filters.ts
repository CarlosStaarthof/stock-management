import { NO_SUPPLIER, NO_UNIT } from "@/lib/count-messages";
import type { CountLineRow } from "@/types/stock-count";

/**
 * The three filter categories of the counting screen, as pure functions over lines.
 *
 * A COUNTER STANDING IN FRONT OF THE KELLY THERMOPLASTIC WANTS THE KELLY THERMOPLASTIC
 * (008 AC-21). Supplier, Type and Unit are the three facts that describe where a row
 * physically is in a yard, so they are the three categories; there is no fourth control,
 * because a fourth control is a fourth thing to mis-tap with cold hands.
 *
 * FOUR RULES THIS MODULE ENCODES.
 *
 *  1. A FACET COUNT IS A COUNT OVER THE WHOLE COUNT, never over the current filter
 *     (008 AC-20, open question 6). Live faceting makes options appear, vanish and
 *     renumber under a thumb, and the panel jumps while it is being tapped.
 *  2. OR WITHIN A CATEGORY, AND ACROSS CATEGORIES (008 AC-21). Two suppliers means either
 *     supplier; a supplier and a type means both, which is how "the Kelly thermoplastic"
 *     is expressed.
 *  3. A SELECTION IS READ FROM THE URL AND NEVER THROWS (008 AC-22). An unknown value, a
 *     repeated unknown value, an empty value or a parameter that is not one of the three
 *     is ignored: a query string is a navigation, not a submission, and no query string
 *     may make this page throw (007 AC-21).
 *  4. FILTERING HIDES ROWS AND SAYS SO. `hiddenSummary` is what stops a filter letting a
 *     counter believe they have finished — it reports how many rows are hidden AND how
 *     many of those nobody has counted (008 AC-23).
 *
 * Pure: no Prisma, no request, no clock. 008 AC-20's and AC-21's halves run in
 * `npm run test:unit` with no database at all (008 AC-32).
 */

/** The three categories, in the order the panel renders them. */
export const ENTRY_FACET_CATEGORIES = ["supplier", "type", "unit"] as const;

export type EntryFacetCategory = (typeof ENTRY_FACET_CATEGORIES)[number];

/** One option: the text a counter reads, and how many lines of the count carry it. */
export type EntryFacet = { value: string; count: number };

export type EntryFacets = Record<EntryFacetCategory, EntryFacet[]>;

/** What the counter has chosen, per category. Empty arrays mean "no filter". */
export type FilterSelection = Record<EntryFacetCategory, string[]>;

/**
 * The option that stands for "this line has no such fact".
 *
 * Spelled by `src/lib/item-master-messages.ts` through `count-messages.ts`, so the item
 * master and the counting screen spell them the same way (008 AC-20, AC-26). `type` has
 * no sentinel because `Item.itemTypeId` is required — there is no line without one.
 */
const SENTINEL: Record<EntryFacetCategory, string | null> = {
  supplier: NO_SUPPLIER,
  type: null,
  unit: NO_UNIT,
};

/** The one place that decides which text a line contributes to each category. */
function facetValueOf(line: CountLineRow, category: EntryFacetCategory): string {
  if (category === "supplier") return line.supplierName ?? NO_SUPPLIER;
  if (category === "unit") return line.unitLabel ?? NO_UNIT;
  return line.typeName;
}

/** Case-insensitive, so `kelly` and `Kelly` do not sit at opposite ends of the panel. */
function compareValues(left: string, right: string): number {
  const folded = left.toLocaleLowerCase().localeCompare(right.toLocaleLowerCase());
  return folded === 0 ? left.localeCompare(right) : folded;
}

/**
 * The three categories of options, built from the count's own lines.
 *
 * Sorted by value ascending, case-insensitive, with the sentinel option LAST — an item
 * with no supplier is an exception, and an exception belongs at the end of a list rather
 * than sorted into the middle of it under whatever letter it happens to start with.
 */
export function buildEntryFacets(lines: readonly CountLineRow[]): EntryFacets {
  const facets = {} as EntryFacets;

  for (const category of ENTRY_FACET_CATEGORIES) {
    const counts = new Map<string, number>();
    for (const line of lines) {
      const text = facetValueOf(line, category);
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }

    const sentinel = SENTINEL[category];
    facets[category] = [...counts.entries()]
      .map(([text, count]) => ({ value: text, count }))
      .sort((left, right) => {
        if (left.value === sentinel) return 1;
        if (right.value === sentinel) return -1;
        return compareValues(left.value, right.value);
      });
  }

  return facets;
}

/** Nothing chosen anywhere: every line is shown and the hiding sentence is not rendered. */
export function isEmptySelection(selection: FilterSelection): boolean {
  return ENTRY_FACET_CATEGORIES.every((category) => selection[category].length === 0);
}

/** An empty selection, which is what the page starts from and what *Clear filters* returns to. */
export function emptySelection(): FilterSelection {
  return { supplier: [], type: [], unit: [] };
}

/**
 * `?supplier=Kelly&supplier=Meon&type=Thermo-P` — repeated parameters, never a
 * comma-joined list, so a value containing a comma is safe (008 AC-22).
 *
 * `facets` is required rather than optional: a value no option offers is IGNORED, not
 * treated as a filter that matches nothing, and only the facets know which values exist.
 * The same function runs on the server render and in the browser, so a reload of a
 * filtered URL renders the same list the client was showing.
 */
export function parseFilterSelection(
  raw: Record<string, string | string[] | undefined>,
  facets: EntryFacets,
): FilterSelection {
  const selection = emptySelection();

  for (const category of ENTRY_FACET_CATEGORIES) {
    const offered = new Set(facets[category].map((facet) => facet.value));
    const given = raw[category];
    const chosen = given === undefined ? [] : Array.isArray(given) ? given : [given];

    for (const candidate of chosen) {
      if (typeof candidate !== "string") continue;
      if (!offered.has(candidate)) continue;
      if (selection[category].includes(candidate)) continue;
      selection[category].push(candidate);
    }
  }

  return selection;
}

/** The lines a selection leaves visible: OR within a category, AND across categories. */
export function filterEntryRows(
  lines: readonly CountLineRow[],
  selection: FilterSelection,
): CountLineRow[] {
  if (isEmptySelection(selection)) return [...lines];

  return lines.filter((line) =>
    ENTRY_FACET_CATEGORIES.every((category) => {
      const chosen = selection[category];
      // A category nobody has touched constrains nothing - that is the AND, applied only
      // to the categories that are actually in play.
      return chosen.length === 0 || chosen.includes(facetValueOf(line, category));
    }),
  );
}

/** What a filter is hiding: the rows, and the ones of those nobody has counted (008 AC-23). */
export type HiddenSummary = { hidden: number; hiddenUncounted: number };

/**
 * The arithmetic behind `Filters are hiding 70 items, 31 not counted.`
 *
 * A filter changes what you can see and never what you have done, so this is the ONLY
 * place a filtered view is allowed to produce a number about progress — and the number it
 * produces is about what is missing, not about what is finished (008 AC-23, AC-24).
 */
export function hiddenSummary(
  lines: readonly CountLineRow[],
  visible: readonly CountLineRow[],
): HiddenSummary {
  const shown = new Set(visible.map((line) => line.itemId));
  const hiddenLines = lines.filter((line) => !shown.has(line.itemId));

  return {
    hidden: hiddenLines.length,
    hiddenUncounted: hiddenLines.filter((line) => line.quantity === null).length,
  };
}
