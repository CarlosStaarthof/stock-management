import { CHOOSE_A_YARD, yardNotFound } from "@/lib/count-messages";
import { NotFoundError, ValidationError } from "@/server/errors";
import {
  parseCountDate,
  parseMonthKey,
  parsePeriodKey,
  periodForCountDate,
} from "@/server/counts/period";
import { locationCodeSchema } from "@/server/items/item-master-input";
import type { LocationCode } from "@/server/items/item-master-input";
import type { StartCountInput, StartCountRawInput } from "@/types/stock-count";

/**
 * Every input crossing into `src/server/counts/`, parsed at the edge
 * (`docs/architecture.md` § Validation). Pure — no Prisma, no clock — which is why AC-8's
 * and AC-23's schema halves run in `npm run test:unit` with no Postgres at all (AC-29).
 *
 * It imports `locationCodeSchema` from `@/server/items/item-master-input` rather than
 * restating which yards exist. Two yards is a closed set fixed by `specs/product-brief.md`,
 * and a second list of them is a second thing to keep in step.
 *
 * TWO DIFFERENT REFUSALS FOR A YARD, and the difference is the screen. Nothing chosen is a
 * `ValidationError` naming `locationCode`, because there is a control on the form to put
 * `Choose a yard.` beside (AC-23). A code that is not one of the two is a `NotFoundError`
 * naming the code, because the caller asked for a yard that does not exist and no field on
 * the screen offered it (AC-13) — the same split `item-assignment-service.ts` already makes.
 */

/** AC-23: no yard is preselected, so "none chosen" is a state the form is really in. */
export function parseYardChoice(raw: unknown): LocationCode {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (value === "") {
    throw new ValidationError("locationCode", CHOOSE_A_YARD);
  }

  const parsed = locationCodeSchema.safeParse(value);
  if (!parsed.success) {
    throw new NotFoundError(yardNotFound(value));
  }
  return parsed.data;
}

/**
 * The three fields *Start count* sends, none of them trusted.
 *
 * The order is the order a form wants to hear about them: the yard first, because AC-23
 * requires the typed date to survive that refusal; then the date; then the period. A
 * missing period DERIVES from the date rather than failing, so a direct POST with no
 * `period` field behaves as the screen's default does — but a period that is present and
 * wrong is refused, because the user typed something and it was not a month (AC-8).
 */
export function parseStartCountInput(raw: StartCountRawInput): StartCountInput {
  const locationCode = parseYardChoice(raw.locationCode);
  const countDate = parseCountDate(raw.countDate);

  const rawPeriod = typeof raw.period === "string" ? raw.period.trim() : "";
  const period = rawPeriod === "" ? periodForCountDate(countDate) : parsePeriodKey(rawPeriod);

  return { locationCode, countDate, period };
}

/** The first value of a query parameter, or `undefined` when it repeated or is absent. */
function singleValue(raw: string | string[] | undefined): string | undefined {
  // A repeated parameter is not a value, it is two (AC-21). Taking the first would let
  // `?month=2026-09&month=banana` mean something, and the calendar would then have a
  // state that depends on which one Next happened to put first.
  return Array.isArray(raw) ? undefined : raw;
}

/**
 * `?month=YYYY-MM`, or `null` for anything else — `banana`, `2026-13`, `2026-1`, an empty
 * string, or the parameter repeated twice.
 *
 * It never throws. A query string is a navigation, not a submission: AC-21 requires the
 * calendar to redirect to `/stock-entry` rather than render an error, and requires that no
 * query parameter can make the page throw. `parseItemListQuery` makes the same choice for
 * the same reason (006).
 */
export function parseMonthKeyParam(raw: string | string[] | undefined): string | null {
  const value = singleValue(raw);
  if (value === undefined) return null;

  try {
    return parseMonthKey(value);
  } catch {
    return null;
  }
}

/**
 * `?countDate=YYYY-MM-DD` when it is a real day, and `fallback` otherwise (AC-23).
 *
 * Ignored rather than refused, for `parseMonthKeyParam`'s reason: a hand-edited link is a
 * navigation, and the form's default is a better answer than an error page.
 */
export function parseCountDateOrDefault(
  raw: string | string[] | undefined,
  fallback: string,
): string {
  const value = singleValue(raw);
  if (value === undefined) return fallback;

  try {
    return parseCountDate(value);
  } catch {
    return fallback;
  }
}

/** `?locationCode=DUBLIN`, or `null`. The confirm screen decides what to say about null. */
export function parseYardChoiceOrNull(raw: string | string[] | undefined): LocationCode | null {
  const value = singleValue(raw);
  if (value === undefined) return null;

  const parsed = locationCodeSchema.safeParse(value.trim());
  return parsed.success ? parsed.data : null;
}
