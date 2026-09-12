"use client";

import type { JSX } from "react";

import {
  APPLY_FILTERS,
  SUPPLIER_FILTER_LABEL,
  TYPE_FILTER_LABEL,
  UNIT_FILTER_LABEL,
  facetOptionLabel,
} from "@/lib/count-messages";
import { ENTRY_FACET_CATEGORIES } from "@/server/counts/entry-filters";
import type {
  EntryFacetCategory,
  EntryFacets,
  FilterSelection,
} from "@/server/counts/entry-filters";

/**
 * THE THREE FILTER CATEGORIES — Supplier, Type and Unit — and nothing else.
 *
 * A counter standing in front of the Kelly thermoplastic wants the Kelly thermoplastic
 * (008 AC-21). Those three facts are what describe where a row physically is in a yard;
 * there is no fourth control, because a fourth control is a fourth thing to mis-tap with
 * cold hands.
 *
 * IT IS A REAL `<form method="get">`, AND THAT IS THE NO-JAVASCRIPT PATH. With the bundle
 * disabled the checkboxes are ordinary checkboxes and the `<noscript>` submit control,
 * labelled `Apply filters`, produces exactly the URL the client would have produced with
 * `history.replaceState` — repeated parameters, never a comma-joined list, so a supplier
 * whose name contains a comma is safe (008 AC-22). With JavaScript the form is never
 * submitted: `onChange` does the work and the address bar is rewritten in place.
 *
 * A FACET COUNT IS OVER THE WHOLE COUNT, never over the current filter (008 AC-20). Live
 * faceting makes options appear, vanish and renumber under a thumb, and the panel jumps
 * while it is being tapped.
 *
 * EVERY OPTION'S TAP TARGET IS THE `<label>`, sized to at least 44 x 44 CSS px (008 AC-30).
 * A native checkbox is about 13 px on a phone, which is not a target anybody wearing
 * gloves can hit; the label is what a tap really lands on, so the label is what is sized.
 */
const CATEGORY_LABEL: Record<EntryFacetCategory, string> = {
  supplier: SUPPLIER_FILTER_LABEL,
  type: TYPE_FILTER_LABEL,
  unit: UNIT_FILTER_LABEL,
};

export function EntryFilters({
  action,
  facets,
  selection,
  onToggle,
}: {
  /** Where the `<noscript>` submit goes: this count's own path. */
  action: string;
  facets: EntryFacets;
  selection: FilterSelection;
  onToggle: (category: EntryFacetCategory, option: string) => void;
}): JSX.Element {
  return (
    <form
      method="get"
      action={action}
      data-testid="entry-filters"
      className="flex flex-col gap-3 rounded border border-slate-300 bg-white p-3"
    >
      {ENTRY_FACET_CATEGORIES.map((category) => (
        <fieldset
          key={category}
          data-testid={`facet-group-${category}`}
          className="flex flex-col gap-1"
        >
          <legend className="text-sm font-semibold">{CATEGORY_LABEL[category]}</legend>

          <div className="flex flex-wrap gap-1">
            {facets[category].map((facet) => (
              <label
                key={facet.value}
                data-testid="facet-option"
                data-category={category}
                data-option={facet.value}
                data-count={facet.count}
                className="inline-flex min-h-11 min-w-11 items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  name={category}
                  value={facet.value}
                  checked={selection[category].includes(facet.value)}
                  onChange={() => {
                    onToggle(category, facet.value);
                  }}
                  className="h-5 w-5 shrink-0"
                />
                <span>{facetOptionLabel(facet.value, facet.count)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {/* The only control that submits this form, and it exists only without JavaScript. */}
      <noscript>
        <button
          type="submit"
          data-testid="apply-filters"
          className="inline-flex min-h-11 min-w-11 items-center rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          {APPLY_FILTERS}
        </button>
      </noscript>
    </form>
  );
}
