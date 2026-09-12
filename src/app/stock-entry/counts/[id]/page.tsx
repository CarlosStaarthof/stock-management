import Link from "next/link";
import type { JSX } from "react";

import { requireUserPage } from "@/app/page-guards";
import { CountRecord } from "@/components/stock-entry/CountRecord";
import { CountSheet } from "@/components/stock-entry/CountSheet";
import { canSubmit } from "@/lib/count-lifecycle";
import {
  BACK_TO_THE_CALENDAR,
  COUNT_HAS_NO_ITEMS,
  COUNT_NO_LONGER_EXISTS,
  COUNT_READ_ONLY,
  COUNT_STATUS_LABEL,
  COUNT_SUMMARY_LINK,
  NOT_COUNTED,
  NO_UNIT,
  REVIEW_AND_SIGN,
  countedSummary,
  countingAs,
  formatDayLabel,
  itemsWithoutPriceMessage,
} from "@/lib/count-messages";
import { getLifecycleFacts } from "@/server/counts/count-lifecycle-service";
import { getCount } from "@/server/counts/count-service";
import { buildEntryFacets, parseFilterSelection } from "@/server/counts/entry-filters";
import { NotFoundError } from "@/server/errors";
import type { CountForAdmin, CountForStaff } from "@/types/stock-count";

/**
 * THE COUNT — the yard, the period, the day, who is counting, and the sheet you type into.
 *
 * #7 created this page and left every quantity reading `Not counted`; #8 turns those cells
 * into inputs. The page itself stays a Server Component and stays `force-dynamic`: it
 * reads the count, builds the three filter categories from the count's OWN lines, parses
 * the query string into a selection, and hands all of it to `CountSheet`, which is
 * server-rendered into the first response and only then hydrates (008 AC-16).
 *
 * THERE IS STILL NO `loading.tsx` AT OR ABOVE `src/app/stock-entry/`, and this is the
 * third feature to record why: a Suspense boundary flushes the shell, after which a
 * `redirect()` thrown by a Server Component can no longer be a `307` (007 AC-3, 008 AC-1).
 *
 * THE SHAPE IS THE SESSION'S. `getCount` chooses it through `shapeForRole` from
 * `actor.role` alone, so an `ADMIN` is told how many items on this sheet have no price and
 * a `YARD_STAFF` user is not — and is not merely not shown it, but never has it built.
 * Nothing else differs between the two roles' markup, and neither role gets a running
 * total, a line value or a per-row tag: `SaveQuantitiesResult` carries no money either, so
 * a staff session can obtain none of it from this screen at all (008 AC-17, AC-18).
 *
 * NO QUERY STRING CAN MAKE THIS PAGE THROW (007 AC-21, 008 AC-22). An unknown filter value,
 * a repeated one, an empty one or a parameter that is not one of the three is ignored by
 * `parseFilterSelection`, which is given the facets precisely so it knows which values
 * really exist.
 *
 * THREE STATES BESIDES THE ORDINARY ONE (008 AC-25): a `countId` that does not exist is a
 * sentence and a way back, a count that is no longer a `DRAFT` is read-only, and a count
 * with no lines says so rather than rendering an empty table.
 *
 * #9 EXTENDS THIS PAGE RATHER THAN REPLACING IT, and everything it adds is money-free for
 * BOTH ROLES (009 AC-21, AC-23, Open question 9):
 *
 *   * a *Review and sign* link while the count is a draft — ALWAYS PRESENT AND NEVER
 *     DISABLED, even when Invariant 5 is blocking the submission, because the way out of
 *     "blocked" is the list of what is missing and not a greyed-out control (009 AC-4);
 *   * `CountRecord` — who signed, who approved, whether they were the same person, why it
 *     was reopened, and the drawing itself as path data (009 AC-7, AC-16, AC-18);
 *   * for an `ADMIN`, and ONLY for an `ADMIN`, one link to `/summary`. That link is the
 *     ONLY difference between the two roles' markup once a count is away — Part 6's "one
 *     version of the screen, not two", asserted by comparing the two DOMs with it removed
 *     (009 AC-23).
 *
 * #7's ADMIN-only price warning is rendered WHILE THE COUNT IS EDITABLE and not after: its
 * sentence ends "when this count is submitted", which is not a thing that can still happen
 * to a count that is away, and after submission the same fact lives on `/summary` as
 * `No price` per row (009 AC-12).
 *
 * THERE IS STILL NO EURO ON THIS SCREEN FOR ANYBODY, and no value, no total and no
 * `No price` tag. Every one of those is on `/summary`, which is a `307` for a staff
 * session.
 */
export const dynamic = "force-dynamic";

function hasPriceWarning(count: CountForStaff | CountForAdmin): count is CountForAdmin {
  return Object.hasOwn(count, "itemsWithoutPrice");
}

export default async function CountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const user = await requireUserPage();
  const { id } = await params;

  let count: CountForStaff | CountForAdmin;
  try {
    count = await getCount(user, id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
          <h1 className="text-2xl font-semibold tracking-tight">Stock count</h1>
          <p
            data-testid="count-missing"
            role="alert"
            className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          >
            {COUNT_NO_LONGER_EXISTS}
          </p>
          <Link
            data-testid="back-to-calendar"
            href="/stock-entry"
            className="inline-flex min-h-11 min-w-11 items-center rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {BACK_TO_THE_CALENDAR}
          </Link>
        </main>
      );
    }
    throw error;
  }

  // ONE SHAPE FOR BOTH ROLES: there is no monetary fact on it, so a staff actor and an
  // ADMIN get deeply equal values for the same count (009 AC-21).
  const lifecycle = await getLifecycleFacts(user, count.countId);

  const path = `/stock-entry/counts/${count.countId}`;
  const facets = buildEntryFacets(count.lines);
  const selection = parseFilterSelection(await searchParams, facets);

  // Written `!== "DRAFT"` and never by naming the two statuses past it: those words live in
  // `src/types/stock-count.ts` and the sentence in `src/lib/count-messages.ts` (007 AC-25).
  const editable = count.status === "DRAFT";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <h1 data-testid="count-heading" className="text-2xl font-semibold tracking-tight">
          {count.locationName}
        </h1>
        <p data-testid="count-period" className="text-base font-medium">
          {count.periodLabel}
        </p>
        <p className="text-base text-slate-700">
          <time data-testid="count-date" dateTime={count.countDate}>
            {formatDayLabel(count.countDate)}
          </time>
        </p>
        <p data-testid="counting-as" className="text-base text-slate-700">
          {countingAs(count.createdByName)}
        </p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span
            data-testid="count-status"
            className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
          >
            {COUNT_STATUS_LABEL[count.status]}
          </span>
        </p>
      </header>

      {/*
        ADMIN only, and by construction rather than by a component deciding: a YARD_STAFF
        value has no such key, so there is nothing here to hide (Invariant 4, 008 AC-17).
      */}
      {editable && hasPriceWarning(count) && count.itemsWithoutPrice > 0 ? (
        <p
          data-testid="items-without-price"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {itemsWithoutPriceMessage(count.itemsWithoutPrice)}
        </p>
      ) : null}

      {count.lineCount === 0 ? (
        <p
          data-testid="count-empty"
          className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
        >
          {COUNT_HAS_NO_ITEMS}
        </p>
      ) : editable ? (
        <CountSheet
          countId={count.countId}
          userId={user.id}
          path={path}
          lines={count.lines}
          facets={facets}
          initialSelection={selection}
        />
      ) : (
        <>
          {/*
            A count that is away is read-only, and says so in the domain's own words: no
            input, no *None held*, and the quantities as text (008 AC-9, AC-25).
          */}
          <p
            data-testid="count-read-only"
            role="alert"
            className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          >
            {COUNT_READ_ONLY}
          </p>
          <p data-testid="counted-summary" className="text-sm text-slate-700">
            {countedSummary(count.countedLineCount, count.lineCount)}
          </p>

          {/* The same stacked shape the editable sheet uses, for the same reason (AC-30). */}
          <ul data-testid="count-lines" className="flex w-full flex-col">
            {count.lines.map((line) => (
              <li
                key={line.itemId}
                // The anchor `/submit`'s uncounted list points at (009 AC-4). It is on the
                // row in BOTH states of this page, because a count can be reopened and a
                // link that only worked while it was a draft would be a dead link.
                id={`line-${line.itemId}`}
                data-testid="count-line"
                data-item-id={line.itemId}
                data-counted={line.quantity === null ? "false" : "true"}
                className="flex scroll-mt-4 flex-col gap-1 border-b border-slate-200 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-medium">
                    {line.description}
                  </span>
                  <span className="shrink-0 text-xs text-slate-600">
                    {line.unitLabel ?? NO_UNIT}
                  </span>
                </div>
                <span data-testid="count-quantity" className="text-sm text-slate-600">
                  {line.quantity ?? NOT_COUNTED}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <CountRecord lifecycle={lifecycle} />

      <div className="flex flex-wrap items-center gap-4">
        <Link
          data-testid="back-to-calendar"
          href="/stock-entry"
          className="text-sm underline underline-offset-2"
        >
          {BACK_TO_THE_CALENDAR}
        </Link>

        {/*
          NEVER DISABLED, and present whether or not the count can actually be submitted:
          the refusal is `submitCount`'s, and being taken to the list of what is missing is
          more use than a control that does nothing (009 AC-4).
        */}
        {canSubmit(count.status) ? (
          <Link
            data-testid="review-and-sign"
            href={`${path}/submit`}
            className="inline-flex min-h-11 items-center rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            {REVIEW_AND_SIGN}
          </Link>
        ) : null}

        {/*
          THE ONE DIFFERENCE BETWEEN THE TWO ROLES' MARKUP (009 AC-23). A staff session has
          no such key on its shape, so there is nothing here to hide: `hasPriceWarning` is
          the same type guard #7 wrote, and it is asking "is this the ADMIN shape?".
        */}
        {hasPriceWarning(count) ? (
          <Link
            data-testid="count-summary-link"
            href={`${path}/summary`}
            className="text-sm underline underline-offset-2"
          >
            {COUNT_SUMMARY_LINK}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
