import Link from "next/link";
import type { JSX } from "react";

import { Field } from "@/components/item-master/Field";
import { SEARCH_LABEL } from "@/lib/item-master-messages";
import type { ItemListCounts } from "@/server/items/item-service";
import type { ItemFilter, ItemListQuery } from "@/server/items/item-master-input";

/**
 * Search, the four filters and the two narrowing selects (006 AC-6, AC-17).
 *
 * Every filter is a plain `<Link>` and the search is a `GET` form, so navigating between
 * them is the browser's own navigation — which is why this feature needs no `loading.tsx`
 * and must not have one (AC-3). The browser's progress indicator IS the loading state.
 *
 * The `Needs review` entry carries the count of flagged items, so the 15 rows #5 left
 * behind are one click away and their number is visible without clicking (AC-17).
 */
const FILTERS: { key: ItemFilter; label: string; countKey: keyof ItemListCounts }[] = [
  { key: "active", label: "Active", countKey: "active" },
  { key: "needs-review", label: "Needs review", countKey: "needsReview" },
  { key: "notes", label: "Notes", countKey: "notes" },
  { key: "archived", label: "Archived", countKey: "archived" },
];

function withFilter(query: ItemListQuery, filter: ItemFilter): string {
  const params = new URLSearchParams();
  params.set("filter", filter);
  if (query.q !== null) params.set("q", query.q);
  if (query.supplierId !== null) params.set("supplierId", query.supplierId);
  if (query.itemTypeId !== null) params.set("itemTypeId", query.itemTypeId);
  if (query.locationCode !== null) params.set("locationCode", query.locationCode);
  return `/item-master?${params.toString()}`;
}

export function FilterBar({
  query,
  counts,
  suppliers,
  itemTypes,
}: {
  query: ItemListQuery;
  counts: ItemListCounts;
  suppliers: { id: string; name: string }[];
  itemTypes: { id: string; name: string }[];
}): JSX.Element {
  return (
    <section className="flex flex-col gap-3" aria-label="Filters">
      <ul className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => (
          <li key={filter.key}>
            <Link
              href={withFilter(query, filter.key)}
              data-testid={`filter-${filter.key}`}
              aria-current={query.filter === filter.key ? "true" : undefined}
              className={
                query.filter === filter.key
                  ? "inline-flex min-h-11 items-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
                  : "inline-flex min-h-11 items-center gap-2 rounded border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              }
            >
              {filter.label}
              <span
                data-testid={`filter-count-${filter.key}`}
                className="rounded bg-white/20 px-1.5 py-0.5 text-xs font-semibold"
              >
                {counts[filter.countKey]}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* A GET form, so the filters live in the URL and a filtered list can be shared. */}
      <form method="GET" action="/item-master" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="filter" value={query.filter} />

        <Field id="q" label={SEARCH_LABEL} className="min-w-0 flex-1">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query.q ?? ""}
            placeholder="multigrip"
            className="min-h-11 w-full rounded border border-slate-300 px-3 py-2 text-base"
          />
        </Field>

        {/* Every select is BESIDE its label, never inside it: a label that wraps a select
            takes its accessible name from its whole text content, options included, so
            "Supplier" would be called "SupplierAny supplierKellyKestrel..." */}
        <Field id="supplierId" label="Supplier">
          <select
            id="supplierId"
            name="supplierId"
            defaultValue={query.supplierId ?? ""}
            className="min-h-11 rounded border border-slate-300 px-2 py-2 text-base"
          >
            <option value="">Any supplier</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id="itemTypeId" label="Type">
          <select
            id="itemTypeId"
            name="itemTypeId"
            defaultValue={query.itemTypeId ?? ""}
            className="min-h-11 rounded border border-slate-300 px-2 py-2 text-base"
          >
            <option value="">Any type</option>
            {itemTypes.map((itemType) => (
              <option key={itemType.id} value={itemType.id}>
                {itemType.name}
              </option>
            ))}
          </select>
        </Field>

        <Field id="locationCode" label="Yard">
          <select
            id="locationCode"
            name="locationCode"
            defaultValue={query.locationCode ?? ""}
            className="min-h-11 rounded border border-slate-300 px-2 py-2 text-base"
          >
            <option value="">Any yard</option>
            <option value="DUBLIN">Dublin</option>
            <option value="CLONMEL">Clonmel</option>
          </select>
        </Field>

        <button
          type="submit"
          data-testid="apply-filters"
          className="min-h-11 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Apply
        </button>
      </form>
    </section>
  );
}
