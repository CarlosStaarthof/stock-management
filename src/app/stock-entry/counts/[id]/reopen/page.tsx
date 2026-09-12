import Link from "next/link";
import type { JSX } from "react";

import { requireAdminPage } from "@/app/page-guards";
import { CountRecord } from "@/components/stock-entry/CountRecord";
import { ReopenForm } from "@/components/stock-entry/ReopenForm";
import { canReopen } from "@/lib/count-lifecycle";
import {
  BACK_TO_THE_CALENDAR,
  BACK_TO_THE_COUNT,
  COUNT_ALREADY_DRAFT,
  COUNT_NO_LONGER_EXISTS,
  COUNT_STATUS_LABEL,
  REOPEN_DESTROYS,
  REOPEN_THIS_COUNT,
  formatDayLabel,
} from "@/lib/count-messages";
import { getCountForSubmit } from "@/server/counts/count-summary-service";
import { NotFoundError } from "@/server/errors";

/**
 * REOPEN — the one transition that destroys information, behind a screen that says so.
 *
 * `requireAdminPage("count-reopen")`: a `YARD_STAFF` request is a `307` to
 * `/stock-entry?denied=count-reopen` and none of this page's content is sent, and
 * `reopenCount` refuses a staff actor at the SERVICE underneath that (009 AC-1, AC-15).
 *
 * A CONFIRMING SCREEN RATHER THAN A BUTTON IN A HEADER (009 Open question 8). Reopening
 * sets SIX COLUMNS back to null — who submitted the count, who signed it and when, who
 * approved it and when, and the drawing itself — and a mark that survived an edit
 * would be worthless. A screen is where that can be said before it happens, and it is also
 * what gives the operation a route-level `ADMIN` refusal a browser test can assert with a
 * status code. This page names none of those columns: it asks `src/lib/count-lifecycle.ts`
 * whether the count can be reopened, and 009 AC-26 keeps this tree at zero (007 AC-25).
 *
 * A `GET` OF THIS PAGE CHANGES NOTHING. The write is a `POST` to `reopenCountAction`, and
 * the reason is required: it is the only record that survives the six nulls.
 *
 * NO EURO. What reopening destroys is a drawing and an approval, not a figure; the prices
 * already captured on the lines are the one thing it does NOT touch (Invariant 2, AC-19),
 * and this page says so in words rather than showing them.
 *
 * IT READS `getCountForSubmit`, NOT `getCountSummary`, deliberately: this screen needs the
 * count's identity and its lifecycle, and there is no reason for a money shape to be built
 * at all on a page that shows none.
 */
export const dynamic = "force-dynamic";

export default async function ReopenCountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const user = await requireAdminPage("count-reopen");
  const { id } = await params;

  let review: Awaited<ReturnType<typeof getCountForSubmit>>;
  try {
    review = await getCountForSubmit(user, id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
          <h1 className="text-2xl font-semibold tracking-tight">{REOPEN_THIS_COUNT}</h1>
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
  const reopenable = canReopen(review.status);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{REOPEN_THIS_COUNT}</h1>
        <p data-testid="count-heading" className="text-base font-medium">
          {review.locationName}
        </p>
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

      {reopenable ? (
        <>
          <p
            data-testid="reopen-destroys"
            role="alert"
            className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            {REOPEN_DESTROYS}
          </p>

          {/* What is about to be destroyed, shown rather than described. */}
          <CountRecord lifecycle={review.lifecycle} />

          <ReopenForm countId={review.countId} />
        </>
      ) : (
        /* A draft cannot be reopened, and there is no control to press (009 AC-29). */
        <p
          data-testid="reopen-conflict"
          role="alert"
          className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
        >
          {COUNT_ALREADY_DRAFT}
        </p>
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
