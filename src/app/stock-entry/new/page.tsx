import Link from "next/link";
import type { JSX } from "react";

import { requireUserPage } from "@/app/page-guards";
import {
  BACK_TO_THE_CALENDAR,
  CONTINUE_TO_CONFIRM,
  COUNT_DATE_LABEL,
  YARD_LABEL,
  countingAs,
} from "@/lib/count-messages";
import { todayInYard } from "@/lib/yard-time";
import { parseCountDateOrDefault } from "@/server/counts/count-input";
import { listCountableYards } from "@/server/counts/count-service";

/**
 * WHO, WHERE, WHEN — confirmed, not typed.
 *
 * WHO IS COUNTING IS THE SESSION (AC-5). The signed-in name is TEXT. There is
 * no "counted by" input and no second identity mechanism: 003 AC-18 already established
 * that nothing the client sets decides who you are, and what #9 asks a person to draw is
 * the second, deliberate artefact — a typed name here would be an unverifiable third. The
 * only two inputs on this page are `locationCode` and `countDate`, neither of which matches
 * `/count(ed)?By|createdBy|name|user/i`.
 *
 * THE FORM IS A `GET` (AC-23, AC-7). Choosing a yard and a date navigates to
 * `/stock-entry/new/confirm` carrying both as query parameters, and that request writes
 * nothing. The write happens once, on the next screen, behind an explicit *Start count*.
 *
 * NO YARD IS PRESELECTED, so "none chosen" is a state the form can really be in and
 * `Choose a yard.` is a refusal the user can actually provoke — which is the point of
 * asking deliberately.
 *
 * The date field is `type="date"` and the two yards are 44 px tap targets, so a phone
 * offers its native picker and a thumb can hit either yard (AC-28).
 */
export const dynamic = "force-dynamic";

export default async function NewCountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const user = await requireUserPage();
  const query = await searchParams;

  const yards = await listCountableYards(user);
  // A `?countDate` that is not a real date is IGNORED and the default used, rather than
  // throwing: a hand-edited link is a navigation, not a submission (AC-23).
  const countDate = parseCountDateOrDefault(query.countDate, todayInYard());

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Start a count</h1>

      <p data-testid="counting-as" className="text-base text-slate-700 [overflow-wrap:anywhere]">
        {countingAs(user.name)}
      </p>

      <form method="get" action="/stock-entry/new/confirm" className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="pb-1 text-sm font-medium">{YARD_LABEL}</legend>
          {yards.map((yard) => (
            <label
              key={yard.code}
              data-testid={`yard-${yard.code}`}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded border border-slate-300 px-3 py-3 text-base has-[:checked]:border-slate-900 has-[:checked]:bg-slate-50"
            >
              {/* No `defaultChecked` anywhere: none is preselected (AC-23). */}
              <input
                type="radio"
                name="locationCode"
                value={yard.code}
                className="h-5 w-5"
              />
              {yard.name}
            </label>
          ))}
        </fieldset>

        <label className="flex flex-col gap-1 text-sm font-medium" htmlFor="countDate">
          {COUNT_DATE_LABEL}
          <input
            id="countDate"
            data-testid="count-date"
            type="date"
            name="countDate"
            defaultValue={countDate}
            className="min-h-11 w-full rounded border border-slate-300 px-3 py-2 text-base font-normal"
          />
        </label>

        <button
          type="submit"
          data-testid="continue-to-confirm"
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded bg-slate-900 px-4 py-2 text-base font-medium text-white"
        >
          {CONTINUE_TO_CONFIRM}
        </button>
      </form>

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
