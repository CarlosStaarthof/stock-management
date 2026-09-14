import type { CalendarDay, CalendarMonth, YardScope } from "@/types/stock-count";

/**
 * THE YARD SCOPE IS A PURE FILTER OVER ONE QUERY'S RESULT, AND NEVER A SECOND QUERY.
 *
 * `/stock-entry` and `/stock-takes` are the same calendar rendered at two addresses with
 * different affordances (spec 010, *Scope boundary with #7*). They stay the same calendar
 * by CALLING THE SAME FUNCTION: `listCalendarMonth(actor, monthKey)` is unchanged — same
 * signature, same body, same arguments from both pages — and the Dublin / Clonmel / Both
 * selector is applied afterwards, here, to the value it returned.
 *
 * A `where` clause on a second query would be a second definition of "the counts in this
 * month", and 006 AC-24 exists because a second definition drifts. 010 AC-4 asserts the
 * absence of that drift directly: for the same month, the badge set rendered by
 * `/stock-entry?month=X` equals the badge set rendered by `/stock-takes?month=X&yard=BOTH`.
 * `filterCalendarByYard(month, "BOTH")` returning a value DEEPLY EQUAL to its input is what
 * makes that true by construction rather than by vigilance.
 *
 * Pure: no Prisma, no clock, no request. `src/lib/` rather than `src/server/` because it
 * compares plain strings and needs no schema, so it costs no dependency exception and
 * AC-7 runs in `npm run test:unit` with no database (AC-20).
 */

/** The scopes a day's badges are counted under, in the order the selector renders them. */
const SCOPE_OF_CODE: Record<string, YardScope | undefined> = {
  DUBLIN: "DUBLIN",
  CLONMEL: "CLONMEL",
};

/** `BOTH` is every badge; a named yard is the badges whose `locationCode` is that yard. */
function inScope(locationCode: string, scope: YardScope): boolean {
  return scope === "BOTH" || locationCode === scope;
}

/**
 * The same month, with the badges outside `scope` dropped and `countsInMonth` recomputed.
 *
 * EVERY DAY SURVIVES, including the ones the filter emptied: `days` is one entry per day of
 * the month whatever the scope, because the grid is a calendar and a missing day would move
 * every day after it. Only `counts` and `countsInMonth` change.
 *
 * `anyCountEver` is deliberately NOT rescoped. It answers "has this product ever recorded a
 * stock take", which is the question the never-counted-anything empty state asks, and it is
 * a fact about the database rather than about the selector (spec 010, *UI states*).
 *
 * The input is not mutated — a new object, new arrays, and the badges themselves shared by
 * reference because nothing here or downstream writes to one.
 */
export function filterCalendarByYard(month: CalendarMonth, scope: YardScope): CalendarMonth {
  const days: CalendarDay[] = month.days.map((day) => ({
    date: day.date,
    counts: day.counts.filter((badge) => inScope(badge.locationCode, scope)),
  }));

  return {
    monthKey: month.monthKey,
    monthLabel: month.monthLabel,
    previousMonthKey: month.previousMonthKey,
    nextMonthKey: month.nextMonthKey,
    todayKey: month.todayKey,
    days,
    countsInMonth: days.reduce((running, day) => running + day.counts.length, 0),
    anyCountEver: month.anyCountEver,
  };
}

/**
 * How many counts each scope has IN THIS MONTH — the `n` of `Dublin (n)`, `Clonmel (n)` and
 * `Both (n)` (AC-6).
 *
 * `BOTH` is the total rather than the sum of the two named yards, and the two are the same
 * number only because every count belongs to a yard. A badge whose `locationCode` is
 * neither — which no query can produce today — would be counted in `BOTH` and in neither
 * name, which is the honest answer for a facet count: it says how many the scope shows.
 */
export function scopeTallies(month: CalendarMonth): Record<YardScope, number> {
  const tallies: Record<YardScope, number> = { DUBLIN: 0, CLONMEL: 0, BOTH: 0 };

  for (const day of month.days) {
    for (const badge of day.counts) {
      tallies.BOTH += 1;

      const named = SCOPE_OF_CODE[badge.locationCode];
      if (named !== undefined) tallies[named] += 1;
    }
  }

  return tallies;
}
