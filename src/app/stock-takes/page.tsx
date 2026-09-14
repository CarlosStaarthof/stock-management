import Link from "next/link";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { signOutAction } from "@/app/auth-actions";
import { requireUserPage } from "@/app/page-guards";
import { CalendarGrid } from "@/components/stock-entry/CalendarGrid";
import { SignOutForm } from "@/components/SignOutForm";
import { CountJump } from "@/components/stock-takes/CountJump";
import { ScopeSelector } from "@/components/stock-takes/ScopeSelector";
import type { ScopeOption } from "@/components/stock-takes/ScopeSelector";
import {
  BOTH_YARDS,
  NEXT_COUNT,
  NEXT_MONTH,
  NO_COUNTS_IN_MONTH,
  NO_COUNTS_RECORDED_YET,
  PREVIOUS_COUNT,
  PREVIOUS_MONTH,
  START_A_COUNT,
  STOCK_TAKES_HEADING,
  TODAY,
  facetOptionLabel,
} from "@/lib/stock-takes-messages";
import { filterCalendarByYard, scopeTallies } from "@/lib/stock-takes-view";
import { parseMonthKeyParam } from "@/server/counts/count-input";
import { findNeighbourCounts } from "@/server/counts/count-history-service";
import {
  defaultMonthKey,
  listCalendarMonth,
  listCountableYards,
} from "@/server/counts/count-service";
import { monthBounds, monthKeyOf } from "@/server/counts/period";
import { parseYardScope, stockTakesHref } from "@/server/counts/stock-takes-input";
import type { CountRef, YardScope } from "@/types/stock-count";

/**
 * THE HISTORY CALENDAR — where an administrator lands, and what `/stock-takes` has
 * promised since #3.
 *
 * ONE VERSION OF THE SCREEN, NOT TWO (`specs/domain-model.md` Part 6, AC-13). There is no
 * role branch on this page, in any file it renders, or in either service it calls: the
 * body below carries no price, no value and no total for ANYBODY, so there is nothing an
 * administrator may see here that a yard phone may not. AC-13 asserts that byte for byte —
 * the `innerHTML` of `data-testid="stock-takes-body"` fetched in the two sessions is
 * compared for exact equality — which is a strictly stronger claim than 009 AC-23's
 * "identical except one link", and it is affordable only because this screen has nothing
 * to differ about. The signed-in email is the one thing that does differ, and it is
 * outside that element, in the identity header, with the sign-out control.
 *
 * THE SAME CALENDAR AS `/stock-entry`, RENDERED AT A SECOND ADDRESS (AC-4). It calls
 * `listCalendarMonth(user, monthKey)` EXACTLY ONCE, with no yard argument, and
 * `CalendarGrid` with the same `CalendarMonth` #7 gives it. The Dublin / Clonmel / Both
 * scope is a PURE FILTER over that result (`filterCalendarByYard`), never a second query:
 * a `where` clause of its own would be a second definition of "the counts in this month",
 * and 006 AC-24 exists because a second definition drifts. What differs is affordance, and
 * affordance is two optional props — a day with nothing on it is a plain cell here, not a
 * *Start a count* link, and a badge leads to this feature's read-only detail (AC-5).
 *
 * THE JUMPS SKIP THE MONTHS NOBODY COUNTED (AC-11), which is why the two cursors below
 * look asymmetric. `findNeighbourCounts` takes ONE cursor; the two ends of a displayed
 * month are TWO cursors, so the page asks twice — with the month's first day for
 * *Previous count* and with its last day for *Next count*. The workbook has no July or
 * August 2025 at all, and paging through them is four taps to reach a fact.
 *
 * THE MONTH IT OPENS ON IGNORES THE SCOPE, deliberately (Open question 1): `defaultMonthKey`
 * is #7's, unchanged, so "the month of the last stock take" has one definition. Choosing
 * Clonmel when Clonmel was last counted three months ago lands on a month with no Clonmel
 * counts, and *Previous count* is one tap away.
 *
 * NO `loading.tsx` EXISTS AT OR ABOVE THIS SEGMENT, and AC-2 now derives that guarantee
 * from the route tree instead of a hand-typed list. A `loading.tsx` puts a Suspense
 * boundary above every page below it; once the shell has flushed, the `redirect()` calls
 * below can no longer be `307`s — Next has to finish the `200` and redirect from the
 * browser. #3, #6, #7 and #9 each recorded it, and this session reproduced it again.
 *
 * NO QUERY PARAMETER CAN MAKE THIS PAGE THROW (AC-6, AC-17). `?month` and `?yard` are
 * parsed by functions that never throw; an unreadable value is a `307` to this page's own
 * base URL and no error text at all. The default scope is never spelled into a URL, so
 * `/stock-takes` with no query string is a URL this page itself produces.
 */
export const dynamic = "force-dynamic";

export default async function StockTakesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const user = await requireUserPage();
  const query = await searchParams;

  const scope = parseYardScope(query.yard);
  if (scope === null) {
    redirect("/stock-takes");
  }

  const requestedMonth = query.month;
  const parsedMonth = parseMonthKeyParam(requestedMonth);
  if (requestedMonth !== undefined && parsedMonth === null) {
    redirect("/stock-takes");
  }

  const monthKey = parsedMonth ?? (await defaultMonthKey(user));

  // ONE call, no yard argument (AC-7). Everything the scope does to it happens afterwards,
  // in a pure function, over the value it returned.
  const month = await listCalendarMonth(user, monthKey);

  const { first, last } = monthBounds(monthKey);
  const [yards, before, after] = await Promise.all([
    listCountableYards(user),
    findNeighbourCounts(user, scope, { date: first, countId: null }),
    findNeighbourCounts(user, scope, { date: last, countId: null }),
  ]);

  const scoped = filterCalendarByYard(month, scope);
  const tallies = scopeTallies(month);
  const todayMonthKey = monthKeyOf(month.todayKey);

  const calendarHref = (params: { month?: string }): string =>
    stockTakesHref("/stock-takes", { month: params.month, yard: scope });

  const jumpHref = (target: CountRef | null): string | null =>
    target === null ? null : calendarHref({ month: target.monthKey });

  // The three options: the yards in `Location.sortOrder`, then the scope that is both of
  // them. The NAMES are `Location.name` as #6 made them editable — no yard is spelled in
  // this feature's source — and the order is the database's, not a constant's.
  const namedScopes: { scope: YardScope; label: string }[] = yards.flatMap((yard) => {
    const named = parseYardScope(yard.code);
    if (named === null || named === "BOTH") return [];

    return [{ scope: named, label: facetOptionLabel(yard.name, tallies[named]) }];
  });

  // Field by field, never a spread: an option is four facts and a fifth must be a
  // decision rather than something that rode along.
  const allScopes: { scope: YardScope; label: string }[] = [
    ...namedScopes,
    { scope: "BOTH", label: facetOptionLabel(BOTH_YARDS, tallies.BOTH) },
  ];

  const scopeOptions: ScopeOption[] = allScopes.map((option) => ({
    scope: option.scope,
    label: option.label,
    // Each option links to ITS OWN scope on the displayed month, so choosing one changes
    // exactly one thing — and `BOTH` links to a URL with no `yard` in it at all, because
    // the default scope is never spelled into a URL (AC-16).
    href: stockTakesHref("/stock-takes", { month: monthKey, yard: option.scope }),
    current: scope === option.scope,
  }));

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-6">
      {/* The identity header, and the ONE thing that differs between two sessions. */}
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{STOCK_TAKES_HEADING}</h1>
        <p data-testid="signed-in-email" className="text-sm break-words text-slate-600">
          {user.email}
        </p>
      </header>

      <div data-testid="stock-takes-body" className="flex flex-col gap-4">
        <h2 data-testid="month-heading" className="text-xl font-semibold tracking-tight">
          {scoped.monthLabel}
        </h2>

        <ScopeSelector options={scopeOptions} />

        {/* Plain links, so the browser's own progress is the loading state (UI states). */}
        <nav className="flex flex-wrap items-center gap-2">
          <Link
            data-testid="previous-month"
            href={calendarHref({ month: scoped.previousMonthKey })}
            prefetch={false}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {PREVIOUS_MONTH}
          </Link>
          <Link
            data-testid="today"
            href={calendarHref({ month: todayMonthKey })}
            prefetch={false}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {TODAY}
          </Link>
          <Link
            data-testid="next-month"
            href={calendarHref({ month: scoped.nextMonthKey })}
            prefetch={false}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {NEXT_MONTH}
          </Link>
        </nav>

        {/* Two cursors, one function: the month's first day, then its last (AC-11). */}
        <nav className="flex flex-wrap items-center gap-2">
          <CountJump
            testId="previous-count"
            label={PREVIOUS_COUNT}
            href={jumpHref(before.previous)}
          />
          <CountJump testId="next-count" label={NEXT_COUNT} href={jumpHref(after.next)} />
        </nav>

        {/*
          Two empty states, and only one of them carries an instruction (UI states).
          `anyCountEver` is NOT rescoped by the filter: it answers "has this product ever
          recorded a stock take", which is the question this state asks.
        */}
        {scoped.anyCountEver ? (
          scoped.countsInMonth === 0 ? (
            <p
              data-testid="no-counts-in-month"
              className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            >
              {NO_COUNTS_IN_MONTH}
            </p>
          ) : null
        ) : (
          <div
            data-testid="no-counts-ever"
            className="flex flex-col items-start gap-3 rounded border border-slate-300 bg-slate-50 px-3 py-4"
          >
            <p className="text-sm">{NO_COUNTS_RECORDED_YET}</p>
            {/* The one thing this screen offers about starting a count, and it is #7's. */}
            <Link
              data-testid="start-a-count"
              href="/stock-entry/new"
              prefetch={false}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded bg-slate-900 px-4 py-2 text-base font-medium text-white"
            >
              {START_A_COUNT}
            </Link>
          </div>
        )}

        <CalendarGrid
          month={scoped}
          badgeHref={(badge) =>
            stockTakesHref(`/stock-takes/counts/${encodeURIComponent(badge.countId)}`, {
              yard: scope,
            })
          }
          // This calendar reads; it does not start a count. A day with nothing on it holds
          // its number and no anchor at all (AC-5).
          emptyDayHref={() => null}
        />
      </div>

      <SignOutForm action={signOutAction} />
    </main>
  );
}
