import Link from "next/link";
import type { JSX } from "react";

/**
 * *Previous count* and *Next count* — one control, in its two states (010 AC-11).
 *
 * WHERE THERE IS NO NEIGHBOUR THE CONTROL STILL RENDERS, under the same `data-testid` and
 * the same label, as a NON-ANCHOR carrying `aria-disabled="true"`. A control that comes
 * and goes is a control a person has to look for, and the two jumps are the whole reason
 * this calendar is usable at all: the workbook has no July or August 2025, so paging
 * month by month is four taps to reach a fact.
 *
 * It is `<span aria-disabled>` rather than `<button disabled>` because the detail page
 * contains no `button`, `input`, `select`, `textarea` or `form` element anywhere — this
 * feature writes nothing, and AC-8 asserts that by absence.
 *
 * Both pages render it, which is the point: the calendar's jump moves by MONTH and the
 * detail's by COUNT, but "there is nowhere to go" must look and read the same on both.
 */
export function CountJump({
  testId,
  label,
  href,
}: {
  testId: string;
  label: string;
  /** `null` is "there is no neighbour in this direction". */
  href: string | null;
}): JSX.Element {
  if (href === null) {
    return (
      <span
        data-testid={testId}
        aria-disabled="true"
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-200 px-3 py-2 text-sm text-slate-400"
      >
        {label}
      </span>
    );
  }

  return (
    <Link
      data-testid={testId}
      href={href}
      prefetch={false}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
    >
      {label}
    </Link>
  );
}
