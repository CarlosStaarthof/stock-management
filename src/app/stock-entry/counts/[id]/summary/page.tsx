import Link from "next/link";
import type { JSX } from "react";

import { requireAdminPage } from "@/app/page-guards";
import { ApproveForm } from "@/components/stock-entry/ApproveForm";
import { CountRecord } from "@/components/stock-entry/CountRecord";
import { ValuedLines } from "@/components/stock-entry/ValuedLines";
import { canApprove, canReopen } from "@/lib/count-lifecycle";
import {
  AUDIT_TRAIL_HEADING,
  BACK_TO_THE_CALENDAR,
  BACK_TO_THE_COUNT,
  COUNT_NO_LONGER_EXISTS,
  COUNT_STATUS_LABEL,
  COUNT_SUMMARY_LINK,
  COUNT_TOTAL_LABEL,
  REOPEN_LINK,
  auditSentence,
  formatDayLabel,
  linesWithoutPriceMessage,
} from "@/lib/count-messages";
import { formatPriceExact, roundHalfUp } from "@/lib/money";
import { getCountSummary, summaryRows } from "@/server/counts/count-summary-service";
import { NotFoundError } from "@/server/errors";

/**
 * THE VALUED SUMMARY — every euro this feature has, on the one surface a staff session
 * cannot reach.
 *
 * `requireAdminPage("count-summary")` IS THE OUTERMOST OF THREE LAYERS (009 AC-1, AC-22).
 * A `YARD_STAFF` request is a `307` to `/stock-entry?denied=count-summary` and NONE of this
 * page's content is sent — not hidden, not sent. `getCountSummary` raises `ForbiddenError`
 * for a staff actor underneath it, and the admin builder is never called. The money
 * boundary here is a SPLIT OF SURFACES, not a CSS class: `docs/architecture.md` is explicit
 * that hiding a value in a component is not a permission, because it stays in the page
 * source.
 *
 * WHY APPROVAL LIVES ON THIS SCREEN AND NOT ON THE COUNT. "Approving a number I have not
 * seen is not approving" — so *Approve this count* is rendered beneath the figures it is an
 * approval of, and nowhere else (009 § User stories, Open question 8).
 *
 * THE TOTAL IS THE SUM OF THE EXACT LINE VALUES, ROUNDED ONCE, and the cost of that is
 * stated rather than hidden: the rendered column may not add to the rendered total to the
 * last cent, and the total is the figure that agrees with the workbook. Four Clonmel prices
 * are non-terminating formulas, and Invariant 10 says a stock system that disagrees with
 * the file it replaced by any amount will not be trusted (009 AC-25, Open question 3).
 *
 * IT NAMES NO COLUMN. `summaryRows` is the mapper that hands the component a row keyed for
 * what it is on a screen rather than for where it came from (009 AC-26).
 *
 * IT WRITES NOTHING. A `GET` of this page approves nothing; approval is a `POST` to a
 * server action from the form below.
 */
export const dynamic = "force-dynamic";

export default async function CountSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const user = await requireAdminPage("count-summary");
  const { id } = await params;

  let summary: Awaited<ReturnType<typeof getCountSummary>>;
  try {
    summary = await getCountSummary(user, id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
          <h1 className="text-2xl font-semibold tracking-tight">{COUNT_SUMMARY_LINK}</h1>
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

  const path = `/stock-entry/counts/${summary.countId}`;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <h1 data-testid="count-heading" className="text-2xl font-semibold tracking-tight">
          {summary.locationName}
        </h1>
        <p data-testid="count-period" className="text-base font-medium">
          {summary.periodLabel}
        </p>
        <p className="text-base text-slate-700">
          <time data-testid="count-date" dateTime={summary.countDate}>
            {formatDayLabel(summary.countDate)}
          </time>
        </p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span
            data-testid="count-status"
            className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
          >
            {COUNT_STATUS_LABEL[summary.status]}
          </span>
        </p>
      </header>

      {/* Invariant 4, after the fact: never silently zero-valued stock (009 AC-12). */}
      {summary.itemsWithoutPrice > 0 ? (
        <p
          data-testid="lines-without-price-warning"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {linesWithoutPriceMessage(summary.itemsWithoutPrice)}
        </p>
      ) : null}

      <ValuedLines rows={summaryRows(summary)} />

      <p className="flex items-baseline justify-between gap-2 border-t-2 border-slate-900 pt-2 text-base font-semibold">
        <span>{COUNT_TOTAL_LABEL}</span>
        <span data-testid="count-total">
          {formatPriceExact(roundHalfUp(summary.countTotal, 2))}
        </span>
      </p>

      <CountRecord lifecycle={summary.lifecycle} />

      {/*
        THE TRAIL, OLDEST FIRST (009 AC-20). It is `StockCount.notes`, append-only, one
        line per event — and it is what survives a reopen, which nulls every column that
        recorded who submitted, signed or approved the count. A count with no events yet
        renders no block at all rather than an empty one.
      */}
      {summary.lifecycle.audit.length === 0 ? null : (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
            {AUDIT_TRAIL_HEADING}
          </h2>
          <ol data-testid="audit-trail" className="flex flex-col gap-1 text-sm text-slate-700">
            {summary.lifecycle.audit.map((entry) => (
              <li key={`${entry.at}-${entry.event}`} data-testid="audit-entry">
                {auditSentence(entry)}
              </li>
            ))}
          </ol>
        </section>
      )}

      {canApprove(summary.status) ? <ApproveForm countId={summary.countId} /> : null}

      <div className="flex flex-wrap items-center gap-4">
        <Link
          data-testid="back-to-count"
          href={path}
          className="text-sm underline underline-offset-2"
        >
          {BACK_TO_THE_COUNT}
        </Link>

        {/*
          The ONE way to `/reopen`, and it is on an ADMIN-only screen: the operation
          destroys what was drawn, so it lives behind the figures rather than beside the
          count (009 Open question 8).
        */}
        {canReopen(summary.status) ? (
          <Link
            data-testid="reopen-link"
            href={`${path}/reopen`}
            className="text-sm underline underline-offset-2"
          >
            {REOPEN_LINK}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
