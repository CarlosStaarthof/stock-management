import Link from "next/link";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { signOutAction } from "@/app/auth-actions";
import { requireUserPage } from "@/app/page-guards";
import { CalendarGrid } from "@/components/stock-entry/CalendarGrid";
import { SignOutForm } from "@/components/SignOutForm";
import { ACCESS_DENIED_MESSAGE } from "@/lib/auth-messages";
import {
  NEXT_MONTH,
  NO_COUNTS_IN_MONTH,
  NO_COUNTS_RECORDED_YET,
  PREVIOUS_MONTH,
  START_A_COUNT,
  TODAY,
} from "@/lib/count-messages";
import { parseMonthKeyParam } from "@/server/counts/count-input";
import { defaultMonthKey, listCalendarMonth } from "@/server/counts/count-service";
import { monthKeyOf } from "@/server/counts/period";

/**
 * THE CALENDAR — the first screen a `YARD_STAFF` user ever sees.
 *
 * It replaces #3's placeholder and keeps its three test ids: `signed-in-email`, `sign-out`
 * and `access-denied`, because `sign-in.spec.ts`, `role-access.spec.ts` and
 * `item-master-access.spec.ts` all assert on them and all three pass unmodified (AC-2).
 * `/stock-entry?denied=…` is still where a refused `ADMIN`-only page sends a staff session.
 *
 * `requireUserPage`, not `requireAdminPage`: Part 6 gives BOTH roles the calendar, the
 * count and the `DRAFT`, and there is no role refusal on any route in this feature.
 *
 * NO `loading.tsx` EXISTS AT OR ABOVE THIS SEGMENT, and that is deliberate (AC-3). A
 * `loading.tsx` puts a Suspense boundary above every page below it; once the shell has
 * flushed, a `redirect()` thrown later by a Server Component can no longer be a 307 — Next
 * has to finish the 200 and redirect from the browser instead. #3 and #6 both recorded it,
 * and this feature's refusals must stay the server's answer rather than a suggestion.
 *
 * EVERY LINK ON THIS PAGE IS `prefetch={false}`. A month grid is up to 31 day links and a
 * badge per count, and Next prefetches each `<Link>` that enters the viewport — thirty-odd
 * RSC requests for protected pages the moment a phone on a bad signal opens the calendar.
 * See `src/components/stock-entry/CalendarGrid.tsx` for the shipped assertion that caught it.
 *
 * `?month` NEVER THROWS. Anything that is not `YYYY-MM` with a month in `01`-`12` — and a
 * parameter repeated twice is not one value — redirects to `/stock-entry` (AC-21).
 */
export const dynamic = "force-dynamic";

export default async function StockEntryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const user = await requireUserPage();
  const query = await searchParams;

  const requested = query.month;
  const parsedMonth = parseMonthKeyParam(requested);
  if (requested !== undefined && parsedMonth === null) {
    redirect("/stock-entry");
  }

  const monthKey = parsedMonth ?? (await defaultMonthKey(user));
  const month = await listCalendarMonth(user, monthKey);
  const todayMonthKey = monthKeyOf(month.todayKey);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-6">
      {query.denied === undefined ? null : (
        <p
          data-testid="access-denied"
          role="alert"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {ACCESS_DENIED_MESSAGE}
        </p>
      )}

      <header className="flex flex-col gap-2">
        <h1 data-testid="month-heading" className="text-2xl font-semibold tracking-tight">
          {month.monthLabel}
        </h1>
        <p data-testid="signed-in-email" className="text-sm text-slate-600">
          {user.email}
        </p>
      </header>

      {/* Plain links, so the browser's own progress is the loading state (UI states). */}
      <nav className="flex flex-wrap items-center gap-2">
        <Link
          data-testid="previous-month"
          href={`/stock-entry?month=${month.previousMonthKey}`}
          prefetch={false}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {PREVIOUS_MONTH}
        </Link>
        <Link
          data-testid="today"
          href={`/stock-entry?month=${todayMonthKey}`}
          prefetch={false}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {TODAY}
        </Link>
        <Link
          data-testid="next-month"
          href={`/stock-entry?month=${month.nextMonthKey}`}
          prefetch={false}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {NEXT_MONTH}
        </Link>
      </nav>

      {/* The two empty states of AC-22, and only one of them carries an instruction. */}
      {month.anyCountEver ? (
        month.countsInMonth === 0 ? (
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

      <CalendarGrid month={month} />

      <SignOutForm action={signOutAction} />
    </main>
  );
}
