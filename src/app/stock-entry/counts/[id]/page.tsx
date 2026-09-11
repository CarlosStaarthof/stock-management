import Link from "next/link";
import type { JSX } from "react";

import { requireUserPage } from "@/app/page-guards";
import {
  BACK_TO_THE_CALENDAR,
  COUNT_NO_LONGER_EXISTS,
  COUNT_STATUS_LABEL,
  NOT_COUNTED,
  NO_UNIT,
  countedSummary,
  countingAs,
  formatDayLabel,
  itemsWithoutPriceMessage,
} from "@/lib/count-messages";
import { getCount } from "@/server/counts/count-service";
import { NotFoundError } from "@/server/errors";
import type { CountForAdmin, CountForStaff } from "@/types/stock-count";

/**
 * THE COUNT — the yard, the period, the day, who is counting, and the sheet.
 *
 * Every quantity reads `Not counted` (Invariant 5), and there is no input, select or
 * textarea anywhere in the line list: typing a quantity is #8's, and submitting is #9's.
 * This feature creates the thing all three operate on and does nothing to it afterwards.
 *
 * THE SHAPE IS THE SESSION'S. `getCount` chooses it through `shapeForRole` from
 * `actor.role` alone, so an `ADMIN` is told how many items on this sheet have no price and
 * a `YARD_STAFF` user is not — and is not merely not shown it, but never has it built
 * (AC-16, AC-17). `countId` is the only argument this page derives from the request.
 *
 * A `countId` that does not exist renders a sentence and a way back rather than throwing
 * into the error boundary (AC-24), because a stale link is an ordinary thing to click and
 * not a bug.
 */
export const dynamic = "force-dynamic";

function hasPriceWarning(count: CountForStaff | CountForAdmin): count is CountForAdmin {
  return Object.hasOwn(count, "itemsWithoutPrice");
}

export default async function CountPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
          <span data-testid="counted-summary" className="text-slate-700">
            {countedSummary(count.countedLineCount, count.lineCount)}
          </span>
        </p>
      </header>

      {/*
        ADMIN only, and by construction rather than by a component deciding: a YARD_STAFF
        value has no such key, so there is nothing here to hide (Invariant 4, AC-16).
      */}
      {hasPriceWarning(count) && count.itemsWithoutPrice > 0 ? (
        <p
          data-testid="items-without-price"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {itemsWithoutPriceMessage(count.itemsWithoutPrice)}
        </p>
      ) : null}

      <div data-testid="count-lines" className="w-full">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-left">
              <th scope="col" className="px-2 py-2 font-semibold">
                Item
              </th>
              <th scope="col" className="px-2 py-2 font-semibold">
                Unit
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Quantity
              </th>
            </tr>
          </thead>
          <tbody>
            {count.lines.map((line) => (
              <tr
                key={line.itemId}
                data-testid="count-line"
                data-item-id={line.itemId}
                className="border-b border-slate-200 align-top"
              >
                <td className="px-2 py-2">{line.description}</td>
                <td className="px-2 py-2 text-slate-600">{line.unitLabel ?? NO_UNIT}</td>
                <td data-testid="count-quantity" className="px-2 py-2 text-right text-slate-600">
                  {/* Read-only. #8 replaces this cell with an input. */}
                  {line.quantity ?? NOT_COUNTED}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link
        data-testid="back-to-calendar"
        href="/stock-entry"
        className="text-sm underline underline-offset-2"
      >
        {BACK_TO_THE_CALENDAR}
      </Link>
    </main>
  );
}
