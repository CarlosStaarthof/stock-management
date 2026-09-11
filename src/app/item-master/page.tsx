import Link from "next/link";
import type { JSX } from "react";

import { requireAdminPage } from "@/app/page-guards";
import { FilterBar } from "@/components/item-master/FilterBar";
import { ItemMasterNav } from "@/components/item-master/ItemMasterNav";
import { ItemTable } from "@/components/item-master/ItemTable";
import { Notices } from "@/components/item-master/Notices";
import { ADD_ITEM, CLEAR_FILTERS, NO_ITEMS_MATCH, NO_ITEMS_YET } from "@/lib/item-master-messages";
import { listItems } from "@/server/items/item-service";
import { parseItemListQuery } from "@/server/items/item-master-input";
import { listItemTypes } from "@/server/items/item-type-service";
import { listSuppliers } from "@/server/items/supplier-service";

/**
 * The item master list (006 AC-6, AC-17, AC-28).
 *
 * `force-dynamic` because every read is of the database and of the query string: nothing
 * here may be prerendered at build time, which is also what keeps `npm run build` green
 * on a machine with no database at all (AC-32).
 *
 * The guard is the first statement, before anything is read or rendered, and there is no
 * `loading.tsx` at or above this directory — with one, the shell would flush and the
 * `redirect()` inside `requireAdminPage` would degrade from a 307 into a 200 carrying the
 * page (AC-3).
 */
export const dynamic = "force-dynamic";

export default async function ItemMasterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requireAdminPage("item-master");

  const params = await searchParams;
  const query = parseItemListQuery(params);

  const [page, suppliers, itemTypes] = await Promise.all([
    listItems(actor, query),
    listSuppliers(actor, { includeArchived: true }),
    listItemTypes(actor),
  ]);

  const done = typeof params.done === "string" ? params.done : undefined;
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Item master</h1>
        <Link
          href="/item-master/items/new"
          data-testid="add-item"
          className="inline-flex min-h-11 items-center rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          {ADD_ITEM}
        </Link>
      </header>

      <ItemMasterNav current="/item-master" />

      <Notices done={done} error={error} />

      <FilterBar
        query={query}
        counts={page.counts}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name }))}
        itemTypes={itemTypes.map((itemType) => ({ id: itemType.id, name: itemType.name }))}
      />

      {page.rows.length > 0 ? (
        <ItemTable rows={page.rows} />
      ) : page.totalItems === 0 ? (
        // Nothing has ever been imported: a different problem, and a different sentence.
        <p data-testid="item-master-empty" className="rounded border border-slate-300 bg-slate-50 px-3 py-4 text-sm">
          {NO_ITEMS_YET}
        </p>
      ) : (
        <p data-testid="item-master-no-match" className="rounded border border-slate-300 bg-slate-50 px-3 py-4 text-sm">
          {NO_ITEMS_MATCH}{" "}
          <Link
            href="/item-master"
            data-testid="clear-filters"
            className="font-medium underline underline-offset-2"
          >
            {CLEAR_FILTERS}
          </Link>
        </p>
      )}
    </main>
  );
}
