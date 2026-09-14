import Link from "next/link";
import { redirect } from "next/navigation";
import type { JSX } from "react";

import { requireUserPage } from "@/app/page-guards";
import { CountJump } from "@/components/stock-takes/CountJump";
import { HistoryLines } from "@/components/stock-takes/HistoryLines";
import { partitionHeld } from "@/lib/held";
import {
  BACK_TO_THE_CALENDAR,
  COUNT_NO_LONGER_EXISTS,
  COUNT_STATUS_LABEL,
  NEXT_COUNT,
  OPEN_IN_STOCK_ENTRY,
  PREVIOUS_COUNT,
  SHOW_ALL_ITEMS,
  SHOW_HELD_ONLY,
  STOCK_TAKES_HEADING,
  countedBy,
  formatDayLabel,
  noItemsHeld,
  notHeldSummary,
} from "@/lib/stock-takes-messages";
import { findNeighbourCounts, getCountHistory } from "@/server/counts/count-history-service";
import {
  DEFAULT_HELD_VIEW,
  parseHeldView,
  parseYardScope,
  stockTakesHref,
} from "@/server/counts/stock-takes-input";
import { NotFoundError } from "@/server/errors";
import type { CountHistoryView, CountRef, HeldView, YardScope } from "@/types/stock-count";

/**
 * ONE COUNT, READ ONLY — item, quantity, unit, and what the yard actually held.
 *
 * `/stock-entry/counts/[id]` is the WORKING SHEET: all 82 rows, inputs while it is a
 * draft, and the route a person is sent down in order to DO something. This is the
 * RECORD, and the difference is the default: `specs/domain-model.md` Part 5 says a count
 * view defaults to HELD only — "see what we have, not what we don't" — and 35 of the 82
 * rows in the most recent Dublin count are zero or blank. The page says what it hid, in a
 * sentence, with a one-tap way to see the rest (AC-9).
 *
 * IT WRITES NOTHING AND CANNOT (AC-3, AC-8). There is no `input`, `select`, `textarea`,
 * `button` or `form` element anywhere below — asserted by absence — no server action and
 * no route handler. Every control is an `<a>`, so the whole page works with the JavaScript
 * bundle dead (AC-18). That is also why it carries no sign-out control: a sign-out is a
 * `POST` and a `POST` needs a form.
 *
 * ONE VERSION OF THE SCREEN, NOT TWO (AC-13). No role is consulted here, in
 * `getCountHistory`, or in anything either of them renders. The whole page sits inside
 * `data-testid="stock-takes-body"` — there is no identity header on this route — and the
 * `innerHTML` of that element is compared byte for byte between a yard session and an
 * administrator's.
 *
 * NO EURO, FOR ANYBODY (AC-12, AC-15). `getCountHistory` maps `getCount`'s result field by
 * field, so the administrator-only count of unpriced items is dropped in the SERVICE
 * rather than hidden by this page. The one link into #9's tree is *Open this count in
 * Stock Entry*, with the same `href` and the same label for both roles; nothing here links
 * to the valued summary beneath it, for anybody.
 *
 * Both of those names are spelled nowhere in this file on purpose: AC-12 and AC-15 scan
 * this tree for the SUBSTRINGS, not for the links, and a doc comment is not an exemption -
 * the same bluntness 008 AC-3 applies to the yard-sheet reader one directory over.
 *
 * THE JUMPS ARE SAME-YARD, ALWAYS (AC-11). The previous count of a Dublin count is
 * Dublin's previous count: Clonmel's stock is different stock, and putting it next in a
 * sequence a person is reading as one yard's history would invite exactly the comparison
 * Part 4 spends a page forbidding. `?yard` is therefore CARRIED across this page — so
 * *Back to the calendar* returns to what the reader was looking at — and NOT applied to
 * its jumps.
 *
 * NO QUERY PARAMETER CAN MAKE THIS PAGE THROW (AC-9, AC-17). `?show` and `?yard` are
 * parsed by functions that never throw; an unreadable value is a `307` to this count's own
 * URL keeping the parameter that WAS readable, and renders no error. A `countId` that does
 * not exist is a sentence and a way back — never a Prisma string, never a stack frame.
 */
export const dynamic = "force-dynamic";

export default async function StockTakesCountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const user = await requireUserPage();
  const { id } = await params;
  const query = await searchParams;

  const path = `/stock-takes/counts/${encodeURIComponent(id)}`;

  const scope: YardScope | null = parseYardScope(query.yard);
  const show: HeldView | null = parseHeldView(query.show);

  if (scope === null || show === null) {
    // The unreadable parameter is dropped and the readable one survives: AC-9 requires the
    // `?show` refusal to keep `yard`, because losing the reading mode on a mistyped URL is
    // the thing AC-16 exists to prevent.
    redirect(
      stockTakesHref(path, {
        yard: scope ?? undefined,
        show: show === null || query.show === undefined ? undefined : show,
      }),
    );
  }

  // THE DEFAULT VIEW IS NEVER SPELLED INTO A LINK, exactly as the default scope is not
  // (AC-9, AC-16). `?show=held` must render IDENTICALLY to no `?show` at all — and the
  // page body contains links, so "identically" reaches them: carrying `show=held` into the
  // two count jumps made the two bodies differ by the length of `&show=held`, twice, which
  // is how this was found. `show=all` is carried, because it is not the default and the
  // reader asked for it.
  const carriedShow = show === DEFAULT_HELD_VIEW ? undefined : show;
  const calendarHref = stockTakesHref("/stock-takes", { yard: scope });

  let count: CountHistoryView;
  try {
    count = await getCountHistory(user, id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      return (
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
          <div data-testid="stock-takes-body" className="flex flex-col gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">{STOCK_TAKES_HEADING}</h1>
            <p
              data-testid="count-missing"
              role="alert"
              className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            >
              {COUNT_NO_LONGER_EXISTS}
            </p>
            <Link
              data-testid="back-to-calendar"
              href={calendarHref}
              prefetch={false}
              className="inline-flex min-h-11 min-w-11 items-center rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {BACK_TO_THE_CALENDAR}
            </Link>
          </div>
        </main>
      );
    }
    throw error;
  }

  // The held view is a PURE PREDICATE over the lines the service already returned, which
  // is why `?show=all` is a link rather than a second read (AC-9, AC-10).
  const { held, hidden } = partitionHeld(count.lines);
  const heldOnly = show === "held";
  const shown = heldOnly ? held : count.lines;

  // The count's OWN yard, whatever `?yard` says. `parseYardScope` rather than a cast, so
  // which yards exist is still stated in exactly one place.
  const ownScope = parseYardScope(count.locationCode);
  const neighbours =
    ownScope === null
      ? { previous: null, next: null }
      : await findNeighbourCounts(user, ownScope, {
          date: count.countDate,
          countId: count.countId,
        });

  const jumpHref = (target: CountRef | null): string | null =>
    target === null
      ? null
      : stockTakesHref(`/stock-takes/counts/${encodeURIComponent(target.countId)}`, {
          yard: scope,
          show: carriedShow,
        });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <div data-testid="stock-takes-body" className="flex flex-col gap-4">
        <header className="flex flex-col gap-2">
          <h1 data-testid="history-yard" className="text-2xl font-semibold tracking-tight">
            {count.locationName}
          </h1>
          <p data-testid="history-period" className="text-base font-medium">
            {count.periodLabel}
          </p>
          <p className="text-base text-slate-700">
            <time data-testid="history-date" dateTime={count.countDate}>
              {formatDayLabel(count.countDate)}
            </time>
          </p>
          {/* ONE expression, so the server emits no `<!-- -->` separator for hydration
              to remove afterwards. See `countedBy` — AC-13's byte comparison is why. */}
          <p data-testid="history-counted-by" className="text-sm text-slate-700">
            {countedBy(count.countedByName)}
          </p>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span
              data-testid="history-status"
              className="rounded bg-slate-900 px-2 py-1 text-xs font-semibold text-white"
            >
              {COUNT_STATUS_LABEL[count.status]}
            </span>
          </p>
        </header>

        {/* Same-yard, and the cursor is this count's own `(countDate, id)` (AC-11). */}
        <nav className="flex flex-wrap items-center gap-2">
          <CountJump
            testId="previous-count"
            label={PREVIOUS_COUNT}
            href={jumpHref(neighbours.previous)}
          />
          <CountJump testId="next-count" label={NEXT_COUNT} href={jumpHref(neighbours.next)} />
        </nav>

        <div className="flex flex-wrap items-center gap-3">
          {heldOnly ? (
            <Link
              data-testid="show-all-items"
              href={stockTakesHref(path, { yard: scope, show: "all" })}
              prefetch={false}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {SHOW_ALL_ITEMS}
            </Link>
          ) : (
            <Link
              data-testid="show-held-only"
              href={stockTakesHref(path, { yard: scope, show: "held" })}
              prefetch={false}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
            >
              {SHOW_HELD_ONLY}
            </Link>
          )}

          {/*
            THE PAGE SAYS WHAT IT HID. A view that quietly dropped 35 of 82 rows would be
            a view a person could not trust to be the whole record (AC-9).
          */}
          {heldOnly && hidden.length > 0 ? (
            <p data-testid="hidden-summary" className="text-sm text-slate-600">
              {notHeldSummary(hidden.length, count.lineCount)}
            </p>
          ) : null}
        </div>

        {shown.length === 0 ? (
          <p
            data-testid="no-items-held"
            className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          >
            {noItemsHeld(count.locationName, count.periodLabel)}
          </p>
        ) : (
          <HistoryLines lines={shown} />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Link
            data-testid="back-to-calendar"
            href={calendarHref}
            prefetch={false}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {BACK_TO_THE_CALENDAR}
          </Link>

          {/*
            THE ONE LINK INTO #9'S TREE, and it is the same link for both roles (AC-15).
            An administrator reaches the euro through it, in two clicks, on a screen that
            is #9's and not this one's. An administrator-only shortcut to the valued
            summary would buy one click and cost AC-13's byte-identity, which is the only
            thing that makes "one version of the screen, not two" checkable at all.
          */}
          <Link
            data-testid="open-in-stock-entry"
            href={`/stock-entry/counts/${encodeURIComponent(count.countId)}`}
            prefetch={false}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-300 px-3 py-2 text-sm"
          >
            {OPEN_IN_STOCK_ENTRY}
          </Link>
        </div>
      </div>
    </main>
  );
}
