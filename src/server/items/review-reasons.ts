import type { ReviewReason } from "@/types/item-master";

/**
 * What is missing from an item, as a pure function of three facts about it.
 *
 * Spec 006's rule, and the reason this is a function rather than a column: `needsReview`
 * is raised by the system and cleared only by a human, and the human is refused while a
 * reason remains. A stored list of reasons would need maintaining on every save of every
 * related row — a price added at 11:04 changes the answer for an item nobody touched —
 * so the flag is stored and the REASONS are derived.
 *
 * Deliberately not exhaustive of every reason an item might need attention: the two
 * below-total fuel rows #5 flagged for provenance are missing nothing, so they get an
 * empty list, no reason tag, and may be marked reviewed immediately (AC-18, AC-19).
 */

export type { ReviewReason };

/** The three facts. `hasPrice` is "there is at least one `ItemPrice` row", not "today". */
export type ReviewReasonInput = {
  supplierId: string | null;
  unitLabel: string | null;
  hasPrice: boolean;
};

export function reviewReasons(item: ReviewReasonInput): ReviewReason[] {
  const reasons: ReviewReason[] = [];

  if (item.supplierId === null) reasons.push("MISSING_SUPPLIER");
  if (item.unitLabel === null || item.unitLabel.trim() === "") reasons.push("MISSING_UNIT");
  if (!item.hasPrice) reasons.push("MISSING_PRICE");

  return reasons;
}
