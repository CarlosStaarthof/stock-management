/**
 * The one shape shared by `src/lib/`, `src/server/` and `src/components/` in feature #6.
 *
 * It lives here rather than in `src/server/items/review-reasons.ts` for a structural
 * reason: `src/lib/item-master-messages.ts` maps every reason to the words a human reads,
 * and `docs/architecture.md`'s dependency rule forbids `src/lib/**` from importing
 * anything under `src/server/` except `@/server/errors` — a `type` import included, which
 * is exactly what ESLint's `no-restricted-imports` reports.
 */

/**
 * Why an item is flagged. `BELOW_TOTAL_ROW`, which #5's importer also writes, is not one
 * of these: the two fuel rows it names are flagged for provenance and are missing
 * nothing, so they have no reason and cannot be told to fix one (006 AC-18).
 */
export type ReviewReason = "MISSING_SUPPLIER" | "MISSING_UNIT" | "MISSING_PRICE";

/** Declaration order, so a list of reasons always reads the same way. */
export const REVIEW_REASONS = [
  "MISSING_SUPPLIER",
  "MISSING_UNIT",
  "MISSING_PRICE",
] as const satisfies readonly ReviewReason[];
