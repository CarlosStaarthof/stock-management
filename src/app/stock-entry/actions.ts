"use server";

import { redirect } from "next/navigation";

import type { SessionUser } from "@/server/auth/session-user";
import { requireUser } from "@/server/auth/session";
import { saveQuantities } from "@/server/counts/count-entry-service";
import {
  approveCount,
  reopenCount,
  submitCount,
} from "@/server/counts/count-lifecycle-service";
import { findCountForPeriod, startCount } from "@/server/counts/count-service";
import { parsePeriodKey, periodForCountDate } from "@/server/counts/period";
import { parseQuantity } from "@/server/counts/quantity-input";
import { parseReopenReason, parseSubmitCountInput } from "@/server/counts/submit-input";
import type { QuantityEdit } from "@/types/stock-count";

import {
  itemIdOfQuantityField,
  toCountActionState,
  toSaveQuantitiesState,
  toStartCountState,
} from "@/app/stock-entry/form-state";
import type {
  CountActionState,
  SaveQuantitiesState,
  StartCountState,
} from "@/app/stock-entry/form-state";

/**
 * The writes the two stock-entry screens make, and the only place a screen may make one.
 *
 * #7 shipped one action, `startCountAction`. #8 added `saveQuantitiesAction` — the
 * no-JavaScript half of the counting screen, which calls the same `saveQuantities` the
 * JSON endpoint calls. #9 adds the three at the bottom of this file, which are the three
 * deliberate acts that close a count: sign and submit, approve, reopen.
 *
 * TWO RULES, both asserted by a source scan of this file (AC-4, 008 AC-19, 009 AC-2), and
 * both asserted PER ACTION rather than per file, because there are five of them now.
 *
 * 1. THE ACTOR COMES FROM THE SESSION. There is exactly one `requireUser()` call in each
 *    action and no wrapper that could grow a second path, and the role is read from the stored `User`
 *    row on every request (003 AC-18). NOTHING HERE READS AN IDENTITY OUT OF THE FORM: a
 *    form field is something the sender chooses, so who is counting is the session's
 *    answer, and a submission carrying an extra identity field and `role=ADMIN` changes
 *    neither the row that is written nor the shape that is returned (AC-4, AC-18). The
 *    three fields read below are a yard, a day and a month, and every one of them is
 *    validated inside `src/server/`. There is no second identity mechanism anywhere in
 *    this feature: what #9 asks a person to draw is the second, deliberate artefact, and a
 *    typed name here would be an unverifiable third.
 * 2. ONE SERVICE PER ACTION. The write is `startCount` and there is no other write at all
 *    in #7's. The second
 *    call, reached only when the write was refused, is `findCountForPeriod` from the SAME
 *    service module — a read, and the only way the screen can link to the count that
 *    already exists, which AC-10 requires by id. No Prisma query lives here
 *    (`docs/architecture.md`).
 *
 * ON SUCCESS IT REDIRECTS, so the new count is read from a freshly rendered page rather
 * than from client state (AC-26). Four of the five do; `saveQuantitiesAction` is the one
 * that must not, and says why where it is written.
 */

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/**
 * The id of the count that already occupies this yard and period, when there is one.
 *
 * Only ever reached on a refusal, and it never throws: when the period itself was what was
 * wrong there is no count to look for, and the screen renders the message with no link.
 */
async function existingCountIdFor(
  actor: SessionUser,
  locationCode: string,
  countDate: string,
  period: string,
): Promise<string | null> {
  try {
    const wanted = period.trim() === "" ? periodForCountDate(countDate) : parsePeriodKey(period);
    const existing = await findCountForPeriod(actor, locationCode, wanted);
    return existing === null ? null : existing.countId;
  } catch {
    return null;
  }
}

export async function startCountAction(
  previous: StartCountState,
  formData: FormData,
): Promise<StartCountState> {
  const actor = await requireUser();

  const locationCode = stringField(formData, "locationCode");
  const countDate = stringField(formData, "countDate");
  const period = stringField(formData, "period");

  let countId: string;
  try {
    countId = await startCount(actor, { locationCode, countDate, period });
  } catch (error) {
    const existingId = await existingCountIdFor(actor, locationCode, countDate, period);
    return toStartCountState(error, existingId, previous.attempt);
  }

  // Outside the `try`: `redirect` works by throwing, and catching it here would turn a
  // success into a form error — the trap #6's `actions.ts` records.
  redirect(`/stock-entry/counts/${countId}`);
}

/**
 * THE NO-JAVASCRIPT TRANSPORT (008 AC-16).
 *
 * `docs/conventions.md`: *"Forms are progressive: they work with a server action, and are
 * enhanced with client state for autosave."* A phone in a yard with JavaScript turned off,
 * or with the bundle still in flight, is a phone that must still be able to record a
 * count — so the screen is a real `<form>` first and an autosaving client second.
 *
 * ONE SERVICE, TWO TRANSPORTS. This action and `POST /api/counts/<id>/lines` both call
 * `saveQuantities` and neither has a Prisma query of its own. The rule the workbook broke —
 * one calculation, one place — is kept by giving the two paths nothing of their own except
 * how they were called (008 AC-16).
 *
 * THE ACTOR IS THE SESSION, EXACTLY ONCE. One `requireUser()` call, and nothing read from
 * the submission except a count id and one field per rendered row. A form carrying
 * `role=ADMIN` and somebody else's user id changes neither what is written nor what comes
 * back (008 AC-19).
 *
 * IT ATTRIBUTES A REFUSAL TO A ROW ITSELF. `ValidationError.field` is `"quantity"`, which
 * names the column and not the line, so every field is parsed here, in order, by the SAME
 * `parseQuantity` the endpoint and the client run (008 AC-7). The first field that refuses
 * is the row the sentence is rendered beside, and because the parse happens before the
 * service is called at all, a refused submission writes nothing (008 AC-16, AC-25).
 */
export async function saveQuantitiesAction(
  previous: SaveQuantitiesState,
  formData: FormData,
): Promise<SaveQuantitiesState> {
  const actor = await requireUser();

  // A count id and nothing else about who is asking. An absent or malformed id is left to
  // the service, which answers `That count no longer exists.` for it.
  const submitted = formData.get("countId");
  const countId = typeof submitted === "string" ? submitted : "";

  const edits: QuantityEdit[] = [];
  for (const [field, typed] of formData.entries()) {
    const itemId = itemIdOfQuantityField(field);
    if (itemId === null || typeof typed !== "string") continue;

    try {
      edits.push({ itemId, quantity: parseQuantity(typed) });
    } catch (error) {
      // Before the service, so nothing at all is written (008 AC-16).
      return toSaveQuantitiesState(error, itemId, previous.attempt);
    }
  }

  if (edits.length > 0) {
    try {
      await saveQuantities(actor, countId, edits);
    } catch (error) {
      return toSaveQuantitiesState(error, null, previous.attempt);
    }
  }

  // No redirect: the page is `force-dynamic`, so the re-render that follows reads the
  // stored numbers back out of the database rather than out of anybody's client state.
  return { error: null, itemId: null, attempt: previous.attempt + 1 };
}

/* ===================================================================================
 * #9 — the three deliberate acts: sign and submit, approve, reopen.
 *
 * THREE MORE ACTIONS AND NO FOURTH TRANSPORT (009 § Contract). #8's
 * `POST /api/counts/[id]/lines` is the only JSON endpoint this product has and this
 * feature adds none: submitting, approving and reopening are each ONE deliberate act a
 * person takes once, so each is a `<form>` posting to a server action — the transport that
 * still works when the bundle does not (009 AC-10). Approve and reopen therefore need no
 * JavaScript at all; only the drawing does.
 *
 * EACH OBTAINS ITS ACTOR WITH EXACTLY ONE `requireUser()` CALL AND CALLS EXACTLY ONE
 * SERVICE (009 AC-2). Nothing here reads a role, a user id, a `signedById` or an
 * `approvedById` out of the submission: `approveCount` and `reopenCount` refuse a
 * `YARD_STAFF` actor at the SERVICE, so a forged `role=ADMIN` field changes nothing at all
 * (009 AC-15, AC-27).
 *
 * NOTHING IS PARSED TWICE AND NOTHING IS PARSED HERE THAT THE SERVICE DOES NOT PARSE
 * AGAIN. `parseSubmitCountInput` and `parseReopenReason` are the edge, exactly as
 * `docs/architecture.md` § Validation asks; `submitCount` runs the signature grammar once
 * more before writing, because the last gate before Postgres is the one that matters.
 *
 * ON SUCCESS EACH REDIRECTS, so every new value is read from a freshly rendered page
 * rather than from anybody's client state (009 § UI states).
 * =================================================================================== */

/** One posted field, narrowed. `FormData.get` returns a string, a file or nothing. */
function posted(field: unknown): string {
  return typeof field === "string" ? field : "";
}

/**
 * Sign a count and close it (Invariants 5, 11 and 2).
 *
 * The submit control is present and enabled whatever the state of the count, because a
 * disabled button is not a rule: this is where the refusals actually happen, and the
 * sentence that comes back is what takes a person to the rows nobody counted (009 AC-4,
 * AC-6).
 */
export async function submitCountAction(
  previous: CountActionState,
  formData: FormData,
): Promise<CountActionState> {
  const actor = await requireUser();

  const countId = posted(formData.get("countId"));

  try {
    // A field that was never sent and an empty one are the same refusal, spelled once.
    const input = parseSubmitCountInput(formData.get("signature"));
    await submitCount(actor, countId, input);
  } catch (error) {
    return toCountActionState(error, previous.attempt);
  }

  // Outside the `try`: `redirect` works by throwing, and catching it here would turn a
  // success into a form error — the trap #6's `actions.ts` records.
  redirect(`/stock-entry/counts/${countId}`);
}

/**
 * Approve a submitted count. `ADMIN` only, and the refusal is `approveCount`'s.
 *
 * Self-approval is permitted and recorded rather than refused (009 Open question 2): the
 * team is two people at most, and an administrator alone in the office must be able to
 * close the month.
 */
export async function approveCountAction(
  previous: CountActionState,
  formData: FormData,
): Promise<CountActionState> {
  const actor = await requireUser();

  const countId = posted(formData.get("countId"));

  try {
    await approveCount(actor, countId);
  } catch (error) {
    return toCountActionState(error, previous.attempt);
  }

  redirect(`/stock-entry/counts/${countId}/summary`);
}

/**
 * Put a count back to `DRAFT`, with a reason. `ADMIN` only.
 *
 * The reason is required and is validated to a single line BEFORE the service is called,
 * because it is the only record that survives the six columns a reopen sets to null — and
 * because a newline in it would forge a second entry in the audit trail (009 AC-18).
 */
export async function reopenCountAction(
  previous: CountActionState,
  formData: FormData,
): Promise<CountActionState> {
  const actor = await requireUser();

  const countId = posted(formData.get("countId"));

  try {
    const reason = parseReopenReason(formData.get("reason"));
    await reopenCount(actor, countId, reason);
  } catch (error) {
    return toCountActionState(error, previous.attempt);
  }

  redirect(`/stock-entry/counts/${countId}`);
}
