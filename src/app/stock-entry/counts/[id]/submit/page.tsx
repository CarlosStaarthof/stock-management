import Link from "next/link";
import type { JSX } from "react";

import { requireUserPage } from "@/app/page-guards";
import { CountRecord } from "@/components/stock-entry/CountRecord";
import { SignaturePad } from "@/components/stock-entry/SignaturePad";
import { canSubmit } from "@/lib/count-lifecycle";
import {
  BACK_TO_THE_CALENDAR,
  BACK_TO_THE_COUNT,
  COUNT_HAS_NO_ITEMS,
  COUNT_NO_LONGER_EXISTS,
  COUNT_STATUS_LABEL,
  LINES_WITHOUT_PRICE_HEADING,
  NO_UNIT,
  REVIEW_AND_SIGN,
  UNCOUNTED_HEADING,
  countedSummary,
  formatDayLabel,
  itemsWithoutPriceMessage,
  uncountedBlocksSubmit,
} from "@/lib/count-messages";
import { getCountForSubmit } from "@/server/counts/count-summary-service";
import { NotFoundError } from "@/server/errors";
import type { SubmitReviewForAdmin, SubmitReviewForStaff } from "@/types/stock-count";

/**
 * REVIEW AND SIGN — the screen that turns a draft into a record.
 *
 * NO EURO, FOR EITHER ROLE (009 AC-21, Open question 9). Every monetary figure in this
 * feature lives on `/summary`, which no `YARD_STAFF` session can reach at all. What an
 * `ADMIN` gets here that a staff user does not is a LIST OF ITEM NAMES — the items with no
 * price, so Invariant 4's warning is actionable — and never a figure. That is what keeps
 * Part 6's "Stock Takes is money-free for both roles" literally true instead of nearly
 * true, and it is why 007 AC-17 and 008 AC-17 pass unmodified.
 *
 * IT READS NO QUERY PARAMETER AT ALL, and that is the whole of Invariant 5's hard case
 * (009 AC-4). #8's three filters hide rows on purpose, so a counter who filtered to one
 * supplier an hour ago and counted every visible row has finished nothing.
 * `getCountForSubmit` takes an actor and a count id and reads the WHOLE count, so the
 * blocked list is identical with a filter and without one — and this feature adds no fourth
 * parameter to the counting screen, so 008 AC-22 stays literally true.
 *
 * THE WAY OUT IS ONE TAP PER MISSING ROW. Each uncounted entry is an anchor to
 * `/stock-entry/counts/<id>#line-<itemId>` with NO QUERY STRING, so the filter does not
 * travel, the row is guaranteed to be rendered, and the browser scrolls to it.
 *
 * THE SUBMIT CONTROL IS NEVER DISABLED AND NEVER HIDDEN WHILE THE COUNT IS A DRAFT, even
 * when it is blocked. A disabled button is not a rule: `submitCount` refuses, and the
 * sentence it refuses with names how many rows are missing — which is more use than a
 * greyed-out control, and is what puts 009 AC-28's first provoked failure on a screen.
 *
 * THERE IS STILL NO `loading.tsx` AT OR ABOVE `src/app/stock-entry/` (007 AC-3, 008 AC-1,
 * 009 AC-1): a Suspense boundary flushes the shell, after which a `redirect()` thrown by a
 * Server Component can no longer be a 307.
 */
export const dynamic = "force-dynamic";

function hasPriceWarning(
  review: SubmitReviewForStaff | SubmitReviewForAdmin,
): review is SubmitReviewForAdmin {
  return Object.hasOwn(review, "linesWithoutPrice");
}

export default async function SubmitCountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const user = await requireUserPage();
  const { id } = await params;

  let review: SubmitReviewForStaff | SubmitReviewForAdmin;
  try {
    review = await getCountForSubmit(user, id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
          <h1 className="text-2xl font-semibold tracking-tight">{REVIEW_AND_SIGN}</h1>
          <p
            data-testid="count-missing"
            role="alert"
            className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          >
            {COUNT_NO_LONGER_EXISTS}
          </p>
          <Link
            data-testid="back-to-calendar"
            href="/stock-entry"
            className="inline-flex min-h-11 min-w-11 items-center rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {BACK_TO_THE_CALENDAR}
          </Link>
        </main>
      );
    }
    throw error;
  }

  const path = `/stock-entry/counts/${review.countId}`;
  // Written through `src/lib/count-lifecycle.ts` and never by naming a status: those words
  // live in `src/types/stock-count.ts` and this tree holds zero of them (009 AC-26).
  const signable = canSubmit(review.status);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <h1 data-testid="count-heading" className="text-2xl font-semibold tracking-tight">
          {review.locationName}
        </h1>
        <p data-testid="count-period" className="text-base font-medium">
          {review.periodLabel}
        </p>
        <p className="text-base text-slate-700">
          <time data-testid="count-date" dateTime={review.countDate}>
            {formatDayLabel(review.countDate)}
          </time>
        </p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span
            data-testid="count-status"
            className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
          >
            {COUNT_STATUS_LABEL[review.status]}
          </span>
        </p>
      </header>

      <p data-testid="counted-summary" className="text-sm text-slate-700">
        {countedSummary(review.countedLineCount, review.lineCount)}
      </p>

      {/*
        ADMIN only, and by construction rather than by a component deciding: a YARD_STAFF
        value has no such key, so there is nothing here to hide (Invariant 4, 009 AC-12).
        The warning NAMES THE ITEMS, because a number is not actionable and a list is.
      */}
      {hasPriceWarning(review) && review.itemsWithoutPrice > 0 ? (
        <div className="flex flex-col gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p data-testid="items-without-price">
            {itemsWithoutPriceMessage(review.itemsWithoutPrice)}
          </p>
          <p className="text-xs font-semibold uppercase tracking-wide">
            {LINES_WITHOUT_PRICE_HEADING}
          </p>
          <ul data-testid="lines-without-price" className="flex flex-col gap-1">
            {review.linesWithoutPrice.map((line) => (
              <li key={line.itemId} data-testid="line-without-price" data-item-id={line.itemId}>
                {line.description}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {review.lineCount === 0 ? (
        <p
          data-testid="count-empty"
          className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
        >
          {COUNT_HAS_NO_ITEMS}
        </p>
      ) : null}

      {/*
        INVARIANT 5, WITH THE WAY OUT ATTACHED (009 AC-4). Every uncounted line, in sheet
        order, never truncated and with no "show more" — a control that silently drops a
        row here would drop exactly the row somebody has to go back for.
      */}
      {review.uncountedLineCount > 0 ? (
        <section className="flex flex-col gap-2">
          <p
            data-testid="uncounted-blocked"
            role="alert"
            className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {uncountedBlocksSubmit(review.uncountedLineCount)}
          </p>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            {UNCOUNTED_HEADING}
          </h2>
          <ul data-testid="uncounted-list" className="flex w-full flex-col">
            {review.uncounted.map((line) => (
              <li
                key={line.itemId}
                data-testid="uncounted-line"
                data-item-id={line.itemId}
                className="border-b border-slate-200 py-2"
              >
                <Link
                  href={`${path}#line-${line.itemId}`}
                  className="flex min-h-11 items-baseline justify-between gap-2 text-sm underline underline-offset-2"
                >
                  <span className="min-w-0 break-words font-medium">{line.description}</span>
                  <span className="shrink-0 text-xs text-slate-600">
                    {line.unitLabel ?? NO_UNIT}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        INVARIANT 11. While the count is a draft this is the pad; once it is away, the
        signed record, read-only, with no submit control anywhere on the page.
      */}
      {review.lineCount > 0 && signable ? (
        <SignaturePad countId={review.countId} />
      ) : (
        <CountRecord lifecycle={review.lifecycle} />
      )}

      <Link
        data-testid="back-to-count"
        href={path}
        className="text-sm underline underline-offset-2"
      >
        {BACK_TO_THE_COUNT}
      </Link>
    </main>
  );
}
