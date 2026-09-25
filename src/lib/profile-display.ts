import { todayInYard, YARD_TIME_ZONE } from "@/lib/yard-time";

/**
 * How `/profiles` writes an instant (021 AC-22, AC-26): in the yard's zone, as the rest of the
 * product dates things, and in one shape a person can compare at a glance.
 *
 * Pure: the instant is an argument, so both zone cases are asserted as values.
 */

const YARD_TIME_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: YARD_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** A profile's creation date: `YYYY-MM-DD` in `Europe/Dublin`. */
export function yardDate(iso: string): string {
  return todayInYard(new Date(iso));
}

/** When a lock ends: `YYYY-MM-DD HH:MM` in `Europe/Dublin`, on a 24-hour clock. */
export function yardDateTime(iso: string): string {
  const instant = new Date(iso);
  const parts = YARD_TIME_PARTS.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${todayInYard(instant)} ${part("hour")}:${part("minute")}`;
}
