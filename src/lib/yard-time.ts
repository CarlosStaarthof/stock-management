/**
 * Today, in the yard — not on the server.
 *
 * AC-31. Both yards are in Ireland, so every user-visible date in this feature is a date
 * in `Europe/Dublin`. A server in UTC at 23:30 on 1 July is already 2 July in Dublin (IST,
 * UTC+1), and a count started then must be dated the 2nd on the calendar, on the confirm
 * screen and in the database — otherwise a yard walked in the evening lands on the wrong
 * day, and in the first five days of a month that moves it into the wrong PERIOD.
 *
 * Pure and unit-tested with no database: `now` is an argument, so the two zone cases can
 * be asserted as values rather than waited for.
 *
 * `src/server/items/price-selection.ts`'s `todayIso` (the server's own zone) is NOT
 * changed by this feature — spec 007 open question 5. It is only a default `asOf` for a
 * price lookup, and editing it would edit a closed feature's behaviour and its tests.
 * Converging them is a one-line change #8 or #9 may make.
 */

export const YARD_TIME_ZONE = "Europe/Dublin";

const YARD_DATE_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: YARD_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * `now` as `YYYY-MM-DD` in `Europe/Dublin`.
 *
 * Built from `formatToParts` rather than from a locale pattern: a locale that renders
 * `01/07/2026` and one that renders `2026-07-01` are both correct for their locale and
 * only one of them is a key this application can compare.
 */
export function todayInYard(now: Date = new Date()): string {
  const parts = YARD_DATE_PARTS.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}
