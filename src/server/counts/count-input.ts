import { z } from "zod";

import {
  CHOOSE_A_YARD,
  SAVE_HAS_NO_EDITS,
  SAVE_HAS_TOO_MANY_EDITS,
  SAVE_REQUEST_INVALID,
  yardNotFound,
} from "@/lib/count-messages";
import { parseQuantity } from "@/server/counts/quantity-input";
import { NotFoundError, ValidationError } from "@/server/errors";
import {
  parseCountDate,
  parseMonthKey,
  parsePeriodKey,
  periodForCountDate,
} from "@/server/counts/period";
import { locationCodeSchema } from "@/server/items/item-master-input";
import type { LocationCode } from "@/server/items/item-master-input";
import type { QuantityEdit, StartCountInput, StartCountRawInput } from "@/types/stock-count";

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

/* ------------------------------------------------------- #8, the save at the edge */

/**
 * The body `POST /api/counts/<id>/lines` accepts, parsed at the edge of `src/server/`
 * (`docs/architecture.md` § Validation), so `saveQuantities` receives already-valid data.
 *
 * A QUANTITY IS A DECIMAL STRING OR `null`, NEVER A JSON NUMBER (008 AC-10). The union
 * below is the whole of that rule: `12.5` as a number is refused with `400` rather than
 * accepted and converted, because a JavaScript number is where `21.6128` goes to be
 * quietly rounded and because a client that sends one has a bug worth hearing about.
 *
 * STRICT, at both levels. An unknown key is refused rather than ignored — a body carrying
 * `role` or `userId` is a forged body, and answering it with `400` is a clearer thing than
 * silently dropping the key it hoped would be honoured (008 AC-10, AC-19).
 *
 * 200 edits is the ceiling: two and a half Dublin sheets in one request, which no counter
 * types and no autosave batch reaches.
 */
const MAX_EDITS_PER_SAVE = 200;

const quantityEditSchema = z.strictObject({
  itemId: z.string().trim().min(1),
  quantity: z.union([z.string(), z.null()]),
});

export const saveQuantitiesBodySchema = z.strictObject({
  edits: z.array(quantityEditSchema).min(1).max(MAX_EDITS_PER_SAVE),
});

/** The three refusals, told apart by which rule the body broke rather than by Zod's text. */
function saveRequestMessage(issue: z.core.$ZodIssue | undefined): string {
  const isEditsLength = issue?.path.length === 1 && issue.path[0] === "edits";

  if (isEditsLength && issue?.code === "too_small") return SAVE_HAS_NO_EDITS;
  if (isEditsLength && issue?.code === "too_big") return SAVE_HAS_TOO_MANY_EDITS;
  return SAVE_REQUEST_INVALID;
}

/**
 * The edits in a request body, canonical and in the order they were sent.
 *
 * Each quantity goes through `parseQuantity` — the same function the no-JavaScript action
 * and the client call — so a bad number is a `ValidationError` naming `quantity` before any
 * database work happens, and no other module needs a numeric regular expression (AC-7).
 */
export function parseSaveQuantitiesBody(raw: unknown): QuantityEdit[] {
  const result = saveQuantitiesBodySchema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError("edits", saveRequestMessage(result.error.issues[0]));
  }

  return result.data.edits.map((edit) => ({
    itemId: edit.itemId,
    quantity: parseQuantity(edit.quantity),
  }));
}
