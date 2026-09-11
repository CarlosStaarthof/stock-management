import Link from "next/link";
import type { JSX } from "react";

import { buildMonthGrid } from "@/lib/calendar-month";
import { COUNT_STATUS_LABEL, START_A_COUNT, WEEKDAY_HEADINGS } from "@/lib/count-messages";
import type { CalendarMonth } from "@/types/stock-count";

/**
 * One month of days, `Mon` first (AC-19, AC-20).
 *
 * The GRID is `buildMonthGrid`'s — pure, unit-tested, and knowing nothing about counts, so
 * a padding cell has nowhere to put one. The COUNTS come keyed by date from
 * `listCalendarMonth`. Joining them here is the only thing this component does.
 *
 * A Server Component: it fetches nothing and holds no state, so there is no reason for it
 * to reach the browser as JavaScript (`docs/conventions.md`).
 *
 * Phone first (AC-28): seven columns, each a `<td>` of at least 40 px with a 44 px tap
 * target inside it, on a table that never forces the DOCUMENT to scroll sideways.
 *
 * EVERY LINK HERE IS `prefetch={false}`, and that is not a detail. A month grid holds up to
 * 31 day links plus a badge for every count; Next prefetches each `<Link>` that enters the
 * viewport, so the default would fire thirty-odd RSC requests for protected pages the
 * moment a phone with bad signal opened the calendar — the one thing `specs/product-brief.md`
 * says the yard does not have. It was also observed to break a SHIPPED assertion:
 * `tests/e2e/sign-in.spec.ts`'s 003 AC-11 compares the cookie jar immediately after
 * sign-in, and a prefetch response landing a moment later added a cookie to it. AC-2
 * requires that spec to pass unmodified, so the page changed rather than the test.
 */
export function CalendarGrid({ month }: { month: CalendarMonth }): JSX.Element {
  const countsByDate = new Map(month.days.map((day) => [day.date, day.counts]));
  const rows = buildMonthGrid(month.monthKey);

  return (
    <table data-testid="calendar" className="w-full table-fixed border-collapse text-sm">
      <thead>
        <tr>
          {WEEKDAY_HEADINGS.map((heading) => (
            <th
              key={heading}
              scope="col"
              data-testid="weekday-heading"
              className="border-b border-slate-300 px-0.5 py-2 text-center text-xs font-semibold text-slate-600"
            >
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((week, index) => (
          <tr key={`week-${String(index)}`}>
            {week.map((cell, dayIndex) => {
              if (cell.date === null) {
                return (
                  <td
                    key={`pad-${String(index)}-${String(dayIndex)}`}
                    data-testid="calendar-padding"
                    className="h-16 border border-slate-100 bg-slate-50"
                  />
                );
              }

              const counts = countsByDate.get(cell.date) ?? [];
              const dayNumber = Number(cell.date.slice(8, 10));
              const isToday = cell.date === month.todayKey;

              return (
                <td
                  key={cell.date}
                  data-testid={`day-${cell.date}`}
                  // AC-20: today's cell is marked, and no other cell is.
                  data-today={isToday ? "true" : undefined}
                  className={`h-16 min-w-10 border border-slate-200 p-0 align-top ${
                    isToday ? "bg-amber-50 ring-1 ring-inset ring-amber-400" : ""
                  }`}
                >
                  {counts.length === 0 ? (
                    <Link
                      data-testid="start-count-day"
                      href={`/stock-entry/new?countDate=${cell.date}`}
                      prefetch={false}
                      aria-label={START_A_COUNT}
                      title={START_A_COUNT}
                      className="flex h-full min-h-11 w-full flex-col items-center justify-start gap-1 px-0.5 py-1 hover:bg-slate-50"
                    >
                      <span className="text-xs font-medium text-slate-700">{dayNumber}</span>
                    </Link>
                  ) : (
                    <div className="flex h-full flex-col gap-0.5 px-0.5 py-1">
                      <span className="text-xs font-medium text-slate-700">{dayNumber}</span>
                      {counts.map((badge) => (
                        <Link
                          key={badge.countId}
                          data-testid="count-badge"
                          data-count-id={badge.countId}
                          data-location-code={badge.locationCode}
                          // AC-20: the period rides along in the badge, because the count
                          // is placed by the day it happened and not by the month it closes.
                          title={badge.periodKey}
                          href={`/stock-entry/counts/${badge.countId}`}
                          prefetch={false}
                          className="block rounded bg-slate-900 px-1 py-0.5 text-[0.625rem] leading-tight text-white"
                        >
                          <span className="block truncate">{badge.locationName}</span>
                          <span className="block truncate font-semibold">
                            {COUNT_STATUS_LABEL[badge.status]}
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
