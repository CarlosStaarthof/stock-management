"use server";

import { redirect } from "next/navigation";

import type { SessionUser } from "@/server/auth/session-user";
import { requireUser } from "@/server/auth/session";
import { findCountForPeriod, startCount } from "@/server/counts/count-service";
import { parsePeriodKey, periodForCountDate } from "@/server/counts/period";

import { toStartCountState } from "@/app/stock-entry/form-state";
import type { StartCountState } from "@/app/stock-entry/form-state";

/**
 * The ONE write this feature makes, and the only place a screen may make one.
 *
 * TWO RULES, both asserted by a source scan of this file (AC-4).
 *
 * 1. THE ACTOR COMES FROM THE SESSION. There is exactly one `requireUser()` call below and
 *    no wrapper that could grow a second path, and the role is read from the stored `User`
 *    row on every request (003 AC-18). NOTHING HERE READS AN IDENTITY OUT OF THE FORM: a
 *    form field is something the sender chooses, so who is counting is the session's
 *    answer, and a submission carrying an extra identity field and `role=ADMIN` changes
 *    neither the row that is written nor the shape that is returned (AC-4, AC-18). The
 *    three fields read below are a yard, a day and a month, and every one of them is
 *    validated inside `src/server/`. There is no second identity mechanism anywhere in
 *    this feature: what #9 asks a person to draw is the second, deliberate artefact, and a
 *    typed name here would be an unverifiable third.
 * 2. ONE SERVICE. The write is `startCount` and there is no other write at all. The second
 *    call, reached only when the write was refused, is `findCountForPeriod` from the SAME
 *    service module — a read, and the only way the screen can link to the count that
 *    already exists, which AC-10 requires by id. No Prisma query lives here
 *    (`docs/architecture.md`).
 *
 * ON SUCCESS IT REDIRECTS, so the new count is read from a freshly rendered page rather
 * than from client state (AC-26).
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
