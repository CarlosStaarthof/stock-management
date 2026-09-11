"use client";

import { useActionState } from "react";
import type { JSX } from "react";

import { addItemPriceAction } from "@/app/item-master/actions";
import { initialFormState } from "@/app/item-master/form-state";
import { Field } from "@/components/item-master/Field";
import { SubmitButton } from "@/components/item-master/SubmitButton";
import {
  ADD_PRICE,
  CURRENT_PRICE_TAG,
  NO_CURRENT_PRICE,
  NO_PRICES_YET,
  NO_PRICE_RECORDED,
} from "@/lib/item-master-messages";
import { formatPriceExact } from "@/lib/money";

/**
 * The price list, and the ONE control it has: *Add a price* (006 AC-13 to AC-15).
 *
 * There is no edit control and no delete control on an existing row, because Invariant 2
 * says a price is never overwritten. Changing a price is adding one with a later
 * `effectiveFrom`, and the existing rows below are read-only by construction: they are
 * rendered as text, not as inputs.
 *
 * The second of the two presentation files spec 006 AC-31 permits to name `unitPrice`,
 * and it names it where the money is: the input the admin types into, and the string
 * handed to `formatPriceExact`.
 */
export type PricePanelRow = {
  id: string;
  unitPrice: string;
  currency: string;
  effectiveFrom: string;
  label: string | null;
  isCurrent: boolean;
};

export function PricePanel({
  itemId,
  prices,
  today,
  defaultLabel,
}: {
  itemId: string;
  prices: PricePanelRow[];
  today: string;
  defaultLabel: string;
}): JSX.Element {
  const [state, formAction] = useActionState(
    addItemPriceAction,
    initialFormState({ unitPrice: "", effectiveFrom: today, label: defaultLabel }),
  );

  const errorFor = (field: string): string | null =>
    state.error !== null && state.field === field ? state.error : null;

  const current = prices.find((price) => price.isCurrent) ?? null;

  return (
    <section aria-labelledby="prices-heading" className="flex flex-col gap-3">
      <h2 id="prices-heading" className="text-lg font-semibold">
        Prices
      </h2>

      <p data-testid="current-price" className="text-sm">
        {current === null ? NO_CURRENT_PRICE : formatPriceExact(current.unitPrice)}
      </p>

      {prices.length === 0 ? (
        <p
          data-testid="no-price-recorded"
          className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {NO_PRICE_RECORDED}
        </p>
      ) : null}

      {state.error !== null && state.field === null ? (
        <p
          data-testid="price-form-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      ) : null}

      <form action={formAction} className="flex flex-wrap items-end gap-2" data-testid="add-price-form">
        <input type="hidden" name="itemId" value={itemId} />

        <Field id="unitPrice" label="Amount" error={errorFor("unitPrice")} errorTestId="unitPrice-error">
          <input
            id="unitPrice"
            name="unitPrice"
            type="text"
            inputMode="decimal"
            key={`unitPrice-${state.attempt}`}
            defaultValue={state.values.unitPrice ?? ""}
            aria-invalid={errorFor("unitPrice") !== null}
            className="min-h-11 w-40 rounded border border-slate-300 px-3 py-2 text-base"
          />
        </Field>

        <Field
          id="effectiveFrom"
          label="Effective from"
          error={errorFor("effectiveFrom")}
          errorTestId="effectiveFrom-error"
        >
          <input
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            key={`effectiveFrom-${state.attempt}`}
            defaultValue={state.values.effectiveFrom ?? today}
            aria-invalid={errorFor("effectiveFrom") !== null}
            className="min-h-11 rounded border border-slate-300 px-3 py-2 text-base"
          />
        </Field>

        <Field id="label" label="Price label">
          <input
            id="label"
            name="label"
            type="text"
            key={`label-${state.attempt}`}
            defaultValue={state.values.label ?? defaultLabel}
            className="min-h-11 w-40 rounded border border-slate-300 px-3 py-2 text-base"
          />
        </Field>

        <SubmitButton testId="add-price">{ADD_PRICE}</SubmitButton>
      </form>

      {prices.length === 0 ? (
        <p className="text-sm text-slate-600">{NO_PRICES_YET}</p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table data-testid="price-table" className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th scope="col" className="px-2 py-2 font-semibold">Effective from</th>
                <th scope="col" className="px-2 py-2 font-semibold">Amount</th>
                <th scope="col" className="px-2 py-2 font-semibold">Label</th>
                <th scope="col" className="px-2 py-2 font-semibold">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {prices.map((price) => (
                <tr key={price.id} data-testid="price-row" className="border-b border-slate-200">
                  <td className="px-2 py-2">{price.effectiveFrom}</td>
                  <td className="px-2 py-2">{formatPriceExact(price.unitPrice)}</td>
                  <td className="px-2 py-2">{price.label ?? ""}</td>
                  <td className="px-2 py-2">
                    {price.isCurrent ? (
                      <span
                        data-testid="current-badge"
                        className="inline-block rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900"
                      >
                        {CURRENT_PRICE_TAG}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
