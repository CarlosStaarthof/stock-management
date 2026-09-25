import Link from "next/link";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { signOutAction } from "@/app/auth-actions";
import { requireAdminPage } from "@/app/page-guards";
import { SignOutForm } from "@/components/SignOutForm";
import { BreakdownTable } from "@/components/analysis/BreakdownTable";
import type { BreakdownColumn, BreakdownOption } from "@/components/analysis/BreakdownTable";
import { PeriodGrid } from "@/components/analysis/PeriodGrid";
import type { YardCell } from "@/components/analysis/PeriodGrid";
import { TrendChart } from "@/components/analysis/TrendChart";
import { VariancePanel } from "@/components/analysis/VariancePanel";
import {
  ANALYSIS_HEADING,
  BREAKDOWN_LABEL,
  GO_TO_STOCK_TAKES,
  MONTH_ON_MONTH_LABEL,
  NEXT_PERIOD,
  NO_APPROVED_STOCK_TAKES_YET,
  PREVIOUS_PERIOD,
  YEAR_ON_YEAR_LABEL,
} from "@/lib/analysis-messages";
import { todayInYard } from "@/lib/yard-time";
import { monthKeyOf } from "@/server/counts/period";
import {
  analysisHref,
  parseAnalysisPeriodParam,
  parseBreakdownParam,
} from "@/server/reporting/analysis-input";
import { getAnalysis, listApprovedPeriods } from "@/server/reporting/analysis-service";
import type { BreakdownKey } from "@/types/analysis";

/**
 * ANALYSIS — the one screen in this product that carries all of the money, for one role.
 *
 * It replaces the placeholder #3 left here, which existed to demonstrate role refusal and
 * said so in its own comment. The refusal is unchanged and is still the SERVICE's:
 * `requireAdminPage("analysis")` below, `assertRole` inside every function it calls, and
 * `PROTECTED_PATHS` untouched since #3 (AC-1, AC-2).
 *
 * THIS PAGE COMPUTES NOTHING. `getAnalysis` returns the per-yard figures, the total, both
 * variances with their state, the thirteen trend points, the breakdown already in
 * `Location.sortOrder`, the two jump targets and `anyApprovedCountEver`. There is no
 * arithmetic here, no sum, no comparison of euros — a page that did any of it would be a
 * second definition of a figure the service already owns, and #12 will read that service
 * for the workbook rather than reading this screen.
 *
 * THE ABSENT PARAMETER AND THE UNREADABLE ONE ARE DIFFERENT, AND ONLY THIS FILE CAN TELL
 * THEM APART. `parseAnalysisPeriodParam` answers `null` for both, by design: there is no
 * default period it could return, because the default is *the latest period holding an
 * approved count*, which only the database knows. So the redirect below is conditioned on
 * the RAW parameter having been present — six unreadable values answer `307`, and no
 * `?period` at all opens on the latest approved period (AC-16, AC-21).
 *
 * IT OPENS ON THE LATEST PERIOD WITH AN APPROVED COUNT, NOT THE LATEST COMPLETE ONE. A
 * yard that has not counted is the thing an administrator most needs to see, and a default
 * that skipped past it would hide exactly that.
 *
 * EVERY LINK CARRIES THE READING STATE. `analysisHref` writes both parameters whenever it
 * is given them — including the default grouping, deliberately the opposite of #10's
 * `stockTakesHref` — so "every link carries the current `?period` and `?breakdown`" is ONE
 * rule covering the breakdown links, both period jumps and every link into a count, and a
 * browser test can assert it as one rule (AC-16).
 *
 * NO `loading.tsx` AT OR ABOVE THIS SEGMENT (AC-3). A Suspense boundary above a page turns
 * the server's `redirect()` into a `200` carrying a shell — and on this route the request
 * that degrades is the staff refusal itself.
 *
 * NO CLIENT COMPONENT, NO FORM, NO ROUTE HANDLER, NO `fetch`. Every control is an `<a>`
 * and the chart is markup, so the whole screen works with the bundle dead (AC-22).
 */
export const dynamic = "force-dynamic";

/** The two groupings, derived from the labels rather than respelled beside them. */
const BREAKDOWN_ENTRIES = Object.entries(BREAKDOWN_LABEL) as [BreakdownKey, string][];

/**
 * *Previous period* and *Next period* (AC-16).
 *
 * WHERE THERE IS NO NEIGHBOUR THE CONTROL STILL RENDERS, under the same `data-testid` and
 * the same label, as a non-anchor carrying `aria-disabled="true"` — #10's rule, for the
 * same reason: a control that comes and goes is a control a person has to look for. It is
 * a `<span>` rather than a disabled `<button>` because this feature writes nothing and
 * renders no form element anywhere.
 */
function PeriodJump({
  testId,
  label,
  href,
}: {
  testId: string;
  label: string;
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

export default async function AnalysisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const user = await requireAdminPage("analysis");
  const query = await searchParams;

  // An unreadable grouping is a navigation that cannot be honoured, not an error: the
  // screen answers with its own base URL and renders no message at all (AC-21).
  const breakdownKey = parseBreakdownParam(query.breakdown);
  if (breakdownKey === null) {
    redirect("/analysis");
  }

  // PRESENT AND UNREADABLE is a redirect; ABSENT is the default period. The parser cannot
  // tell those two apart, so the raw value is what decides — see the header.
  const requestedPeriod = query.period;
  const parsedPeriod = parseAnalysisPeriodParam(requestedPeriod);
  if (requestedPeriod !== undefined && parsedPeriod === null) {
    redirect("/analysis");
  }

  const approvedPeriods = await listApprovedPeriods(user);
  const latestApproved = approvedPeriods.at(-1);

  // With nothing approved anywhere the screen opens on the month containing today IN THE
  // YARD and renders the empty state. The clock belongs here rather than to the service:
  // a read service with a clock inside it is a service whose answer changes at midnight.
  const periodKey = parsedPeriod ?? latestApproved ?? monthKeyOf(todayInYard());

  const analysis = await getAnalysis(user, { periodKey, breakdownKey });

  const analysisLink = (path: string): string =>
    analysisHref(path, { period: analysis.periodKey, breakdown: analysis.breakdownKey });

  const jumpHref = (target: string | null): string | null =>
    target === null
      ? null
      : analysisHref("/analysis", { period: target, breakdown: analysis.breakdownKey });

  // Field by field, never a spread: a cell is a figure and two links, and a fourth fact
  // must be a decision rather than something that rode along on a database row.
  const cells: YardCell[] = analysis.period.yards.map((figure) => ({
    figure,
    countHref:
      figure.countId === null
        ? null
        : analysisLink(`/stock-takes/counts/${encodeURIComponent(figure.countId)}`),
    // #9's surface, which lists the items with no price BY NAME. This screen states the
    // size of the hole; that one names what is in it (AC-9).
    summaryHref:
      figure.countId === null
        ? null
        : analysisLink(`/stock-entry/counts/${encodeURIComponent(figure.countId)}/summary`),
  }));

  const columns: BreakdownColumn[] = analysis.period.yards.map((figure) => ({
    locationCode: figure.locationCode,
    locationName: figure.locationName,
  }));

  const breakdownOptions: BreakdownOption[] = BREAKDOWN_ENTRIES.map(([key, label]) => ({
    key,
    label,
    // Each link changes exactly one thing: the grouping, on the period being read.
    href: analysisHref("/analysis", { period: analysis.periodKey, breakdown: key }),
    current: key === analysis.breakdownKey,
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 p-3 sm:p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{ANALYSIS_HEADING}</h1>
        {/*
          `break-words` IS THE WHOLE OF THE FIX, AND IT IS THE THIRD TIME THIS ELEMENT HAS
          NEEDED IT (AC-20). An email is one unbreakable token; without this the document
          — not this paragraph, the DOCUMENT — grows to the width of the address and the
          phone scrolls sideways on every screen. Measured here before the change: an
          address whose local part is a 61-character run with no hyphen in it gave
          `scrollWidth` 478 against a 390 px viewport and against a 320 px one, while an
          ordinary hyphenated fixture address fitted both exactly. #10 fixed
          `/stock-takes`; `/stock-entry` is a recorded debt against 008 AC-30 and is NOT
          touched here, because a feature does not reach into another screen.
        */}
        <p data-testid="signed-in-email" className="text-base break-words text-slate-700">
          {user.email}
        </p>
      </header>

      <h2 data-testid="period-heading" className="text-xl font-semibold tracking-tight">
        {analysis.periodLabel}
      </h2>

      {/*
        The jumps skip the months nobody counted: the workbook has no July or August 2025
        at all, and paging through them one at a time is four taps to reach a fact (AC-16).
      */}
      <nav className="flex flex-wrap items-center gap-2">
        <PeriodJump
          testId="previous-period"
          label={PREVIOUS_PERIOD}
          href={jumpHref(analysis.previousApprovedPeriodKey)}
        />
        <PeriodJump
          testId="next-period"
          label={NEXT_PERIOD}
          href={jumpHref(analysis.nextApprovedPeriodKey)}
        />
      </nav>

      {analysis.anyApprovedCountEver ? (
        <div className="flex flex-col gap-4">
          <PeriodGrid period={analysis.period} cells={cells} />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <VariancePanel
              testId="mom-variance"
              label={MONTH_ON_MONTH_LABEL}
              variance={analysis.monthOnMonth}
            />
            <VariancePanel
              testId="yoy-variance"
              label={YEAR_ON_YEAR_LABEL}
              variance={analysis.yearOnYear}
            />
          </div>

          <TrendChart points={analysis.trend} />

          <BreakdownTable
            breakdownKey={analysis.breakdownKey}
            options={breakdownOptions}
            columns={columns}
            rows={analysis.breakdown}
          />
        </div>
      ) : (
        /*
          NOTHING HAS EVER BEEN APPROVED. No grid, no chart, no breakdown, and not one `€`
          character in the whole document: an empty database rendering `€0.00` is the
          top-level form of the mistake this feature is shaped around (AC-6).
        */
        <div
          data-testid="no-approved-counts"
          className="flex flex-col items-start gap-3 rounded border border-slate-300 bg-slate-50 px-3 py-4"
        >
          <p className="text-sm">{NO_APPROVED_STOCK_TAKES_YET}</p>
          <Link
            data-testid="go-to-stock-takes"
            href="/stock-takes"
            prefetch={false}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded bg-slate-900 px-4 py-2 text-base font-medium text-white"
          >
            {GO_TO_STOCK_TAKES}
          </Link>
        </div>
      )}

      <SignOutForm action={signOutAction} />
    </main>
  );
}
