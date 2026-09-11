import Link from "next/link";
import type { JSX } from "react";

import { requireUserPage } from "@/app/page-guards";
import { StartCountForm } from "@/components/stock-entry/StartCountForm";
import {
  CHANGE_THE_DATE_OR_YARD,
  CHOOSE_A_YARD,
  CONTINUE_THIS_COUNT,
  OPEN_THE_EXISTING_COUNT,
  countAlreadyExistsForPeriod,
  countClosesMessage,
  countingAs,
  draftAlreadyExists,
  formatDayLabel,
} from "@/lib/count-messages";
import { todayInYard } from "@/lib/yard-time";
import { parseCountDateOrDefault, parseYardChoiceOrNull } from "@/server/counts/count-input";
import { findCountForPeriod } from "@/server/counts/count-service";
import { formatPeriodKey, parsePeriodKey, periodForCountDate } from "@/server/counts/period";
import { locationName } from "@/server/items/item-assignment-service";
import type { Period } from "@/types/stock-count";

/**
 * THE PERIOD, BEFORE ANYTHING IS WRITTEN (AC-7).
 *
 * This `GET` changes nothing: it reads the yard and the day the previous screen chose,
 * derives the month the count closes, says so in a sentence, and offers one control to
 * change it. `StockCount` and `StockCountLine` hold exactly as many rows after this request
 * as before it.
 *
 * COMING BACK NEVER STARTS A SECOND COUNT (AC-11). When this yard already has a count for
 * this period the *Start count* control is not rendered at all — a `DRAFT` is offered as
 * *Continue this count*, anything further along as *Open the existing count* — so a second
 * one cannot be attempted from the screen, and AC-10's unique constraint is the backstop
 * for a direct POST.
 *
 * It answers `200` even with no query at all, which is what AC-2 asks of all four routes:
 * a missing yard is `Choose a yard.` with a way back, not a redirect and not an error page.
 */
export const dynamic = "force-dynamic";

export default async function ConfirmCountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const user = await requireUserPage();
  const query = await searchParams;

  const locationCode = parseYardChoiceOrNull(query.locationCode);
  const countDate = parseCountDateOrDefault(query.countDate, todayInYard());

  if (locationCode === null) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Start a count</h1>
        <p
          data-testid="confirm-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {CHOOSE_A_YARD}
        </p>
        <Link
          data-testid="change-the-date-or-yard"
          href={`/stock-entry/new?countDate=${countDate}`}
          className="inline-flex min-h-11 min-w-11 items-center rounded border border-slate-300 px-3 py-2 text-sm"
        >
          {CHANGE_THE_DATE_OR_YARD}
        </Link>
      </main>
    );
  }

  // `?period=` lets the action send the user back here with the month they actually
  // submitted, so the refusal and the control agree. Anything unusable falls back to the
  // derived one rather than throwing: this is a navigation, not a submission.
  const period: Period = periodFromQuery(query.period) ?? periodForCountDate(countDate);
  const periodKey = formatPeriodKey(period);

  const [name, existing] = await Promise.all([
    locationName(user, locationCode),
    findCountForPeriod(user, locationCode, period),
  ]);

  const isDraft = existing !== null && existing.status === "DRAFT";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>

      <p data-testid="counting-as" className="text-base text-slate-700">
        {countingAs(user.name)}
      </p>

      <p className="text-base text-slate-700">
        <time data-testid="confirm-count-date" dateTime={countDate}>
          {formatDayLabel(countDate)}
        </time>
      </p>

      <p data-testid="period-sentence" className="text-base font-medium">
        {countClosesMessage(period)}
      </p>

      {existing === null ? (
        <StartCountForm
          locationCode={locationCode}
          countDate={countDate}
          periodKey={periodKey}
        />
      ) : (
        /* No submit control at all, so a second count cannot be attempted here (AC-11). */
        <div className="flex flex-col items-start gap-3 rounded border border-amber-300 bg-amber-50 px-3 py-4">
          <p data-testid="existing-count-notice" className="text-sm text-amber-900">
            {isDraft
              ? draftAlreadyExists(name, period, existing.createdByName, existing.countDate)
              : countAlreadyExistsForPeriod(name, period)}
          </p>
          <Link
            data-testid="existing-count-link"
            href={`/stock-entry/counts/${existing.countId}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded bg-slate-900 px-4 py-2 text-base font-medium text-white"
          >
            {isDraft ? CONTINUE_THIS_COUNT : OPEN_THE_EXISTING_COUNT}
          </Link>
        </div>
      )}

      <Link
        data-testid="change-the-date-or-yard"
        href={`/stock-entry/new?countDate=${countDate}`}
        className="text-sm underline underline-offset-2"
      >
        {CHANGE_THE_DATE_OR_YARD}
      </Link>
    </main>
  );
}

/** `?period=YYYY-MM` when it is usable, and `null` otherwise. It never throws. */
function periodFromQuery(raw: string | string[] | undefined): Period | null {
  if (typeof raw !== "string") return null;
  try {
    return parsePeriodKey(raw);
  } catch {
    return null;
  }
}
