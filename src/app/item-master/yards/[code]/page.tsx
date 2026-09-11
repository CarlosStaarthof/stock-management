import Link from "next/link";
import type { JSX } from "react";

import { moveItemInSheetAction, unassignItemAction } from "@/app/item-master/actions";
import { requireAdminPage } from "@/app/page-guards";
import { ItemMasterNav } from "@/components/item-master/ItemMasterNav";
import { Notices } from "@/components/item-master/Notices";
import { SubmitButton } from "@/components/item-master/SubmitButton";
import {
  MOVE_DOWN,
  MOVE_UP,
  NO_PRICE,
  NO_UNIT,
  UNASSIGN,
  noItemsAssigned,
} from "@/lib/item-master-messages";
import { formatPriceExact } from "@/lib/money";
import { listSheet, locationName } from "@/server/items/item-assignment-service";
import { priceAmountOf } from "@/server/items/price-selection";
import { currentPriceOf } from "@/server/items/sheet-shape";

/**
 * One yard's sheet, in the order the yard is walked (006 AC-23, AC-24).
 *
 * `sortOrder` is DISPLAYED, not hidden. It is the workbook's own source row number (005
 * open question 4), Clonmel's 71-74 gap records that the fuel rows sit below the total
 * row, and a visible number is what lets an admin trace a row back to the cell it came
 * from. Moving is a swap of two of these numbers; there is no renumber control and the
 * feature ships none.
 *
 * The price is read through `priceAmountOf` rather than off the entry directly, because
 * AC-31 permits exactly nine modules to name that column and a page is not one of them.
 */
export const dynamic = "force-dynamic";

export default async function YardSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requireAdminPage("item-master");

  const { code } = await params;
  const query = await searchParams;

  const [name, sheet] = await Promise.all([
    locationName(actor, code),
    listSheet(actor, code),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{name} sheet</h1>

      <ItemMasterNav current={`/item-master/yards/${code}`} />

      <Notices
        done={typeof query.done === "string" ? query.done : undefined}
        error={typeof query.error === "string" ? query.error : undefined}
      />

      {sheet.length === 0 ? (
        <p data-testid="sheet-empty" className="rounded border border-slate-300 bg-slate-50 px-3 py-4 text-sm">
          {noItemsAssigned(name)}
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table data-testid="sheet-table" className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th scope="col" className="px-2 py-2 font-semibold">Order</th>
                <th scope="col" className="px-2 py-2 font-semibold">Description</th>
                <th scope="col" className="px-2 py-2 font-semibold">Unit</th>
                <th scope="col" className="px-2 py-2 font-semibold">Price</th>
                <th scope="col" className="px-2 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sheet.map((entry, index) => {
                // `listSheet` returns a union since 007 AC-14, so the page narrows rather
                // than assuming which half it was handed. An ADMIN reaches this page and
                // only an ADMIN, so the price is here and renders exactly as 006 AC-24
                // requires; a staff entry would have no such key to read.
                const amount = priceAmountOf(currentPriceOf(entry));

                return (
                  <tr
                    key={entry.itemId}
                    data-testid="sheet-row"
                    data-item-id={entry.itemId}
                    className="border-b border-slate-200 align-top"
                  >
                    <td className="px-2 py-2" data-testid="sheet-sort-order">
                      {entry.sortOrder}
                    </td>
                    <td className="px-2 py-2">
                      <Link
                        href={`/item-master/items/${entry.itemId}`}
                        className="font-medium underline underline-offset-2"
                      >
                        {entry.description}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{entry.unitLabel ?? NO_UNIT}</td>
                    <td className="px-2 py-2">
                      {amount === null ? NO_PRICE : formatPriceExact(amount)}
                    </td>
                    <td className="px-2 py-2">
                      <span className="flex flex-wrap gap-2">
                        {/* No control on the rows a move would be a no-op for (AC-23). */}
                        {index === 0 ? null : (
                          <form action={moveItemInSheetAction}>
                            <input type="hidden" name="itemId" value={entry.itemId} />
                            <input type="hidden" name="locationCode" value={code} />
                            <input type="hidden" name="direction" value="UP" />
                            <SubmitButton testId={`move-up-${entry.itemId}`} tone="secondary">
                              {MOVE_UP}
                            </SubmitButton>
                          </form>
                        )}
                        {index === sheet.length - 1 ? null : (
                          <form action={moveItemInSheetAction}>
                            <input type="hidden" name="itemId" value={entry.itemId} />
                            <input type="hidden" name="locationCode" value={code} />
                            <input type="hidden" name="direction" value="DOWN" />
                            <SubmitButton testId={`move-down-${entry.itemId}`} tone="secondary">
                              {MOVE_DOWN}
                            </SubmitButton>
                          </form>
                        )}
                        <form action={unassignItemAction}>
                          <input type="hidden" name="itemId" value={entry.itemId} />
                          <input type="hidden" name="locationCode" value={code} />
                          <input
                            type="hidden"
                            name="returnTo"
                            value={`/item-master/yards/${code}`}
                          />
                          <SubmitButton testId={`unassign-${entry.itemId}`} tone="secondary">
                            {UNASSIGN}
                          </SubmitButton>
                        </form>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
