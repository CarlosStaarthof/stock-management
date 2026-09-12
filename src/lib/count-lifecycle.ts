import type { CountStatus } from "@/types/stock-count";

/**
 * The lifecycle of `specs/domain-model.md` Part 3, as six pure predicates.
 *
 * IT LIVES IN `src/lib/` AND THAT IS THE WHOLE POINT. 007 AC-25 forbids any shipping
 * module under `src/server/counts/` or `src/app/stock-entry/` from naming `SUBMITTED` or
 * `APPROVED`; spec 009 AC-26 amends that to an exact two-file exemption for the lifecycle
 * service and the summary service, and for nothing else. Every page, every component and
 * every other service therefore asks a question here — `canApprove(status)` — instead of
 * comparing a string, and the exemption stays two files wide (009 AC-26).
 *
 * It imports one type and no runtime at all, so it is unit-tested with no database
 * (009 AC-31) and is reachable from `src/app/`, `src/components/` and `src/server/` alike.
 */

export function isDraft(status: CountStatus): boolean {
  return status === "DRAFT";
}

export function isSubmitted(status: CountStatus): boolean {
  return status === "SUBMITTED";
}

export function isApproved(status: CountStatus): boolean {
  return status === "APPROVED";
}

/** Invariant 3: only a `DRAFT` may be submitted, and only once (009 AC-17). */
export function canSubmit(status: CountStatus): boolean {
  return isDraft(status);
}

/** Part 6: approval is an `ADMIN` act on a count somebody has already signed (009 AC-16). */
export function canApprove(status: CountStatus): boolean {
  return isSubmitted(status);
}

/**
 * A `SUBMITTED` count is reopenable too, not only an `APPROVED` one (009 Open question 1):
 * forcing an `ADMIN` to approve a known-wrong count in order to undo it would put it into
 * the history and into #11's totals on the way past.
 */
export function canReopen(status: CountStatus): boolean {
  return !isDraft(status);
}
