import type { JSX } from "react";

import {
  deleteItemTypeAction,
  moveItemTypeAction,
  renameItemTypeAction,
} from "@/app/item-master/actions";
import { requireAdminPage } from "@/app/page-guards";
import { ItemMasterNav } from "@/components/item-master/ItemMasterNav";
import { ItemTypePanel } from "@/components/item-master/ItemTypePanel";
import { Notices } from "@/components/item-master/Notices";
import { SubmitButton } from "@/components/item-master/SubmitButton";
import {
  DELETE,
  MOVE_DOWN,
  MOVE_UP,
  NO_ITEM_TYPES_YET,
  RENAME,
} from "@/lib/item-master-messages";
import { listItemTypes } from "@/server/items/item-type-service";

/**
 * Item types: create, rename, move up or down, delete (006 AC-27).
 *
 * There is deliberately no archive control and no `active` field. `ItemType` has no such
 * column in Part 3, and #6 adds no migration — so offering one would be offering
 * something the database cannot store.
 *
 * `sortOrder` is shown rather than hidden. Moving is a swap, gaps survive, and a visible
 * number is what lets a row still be traced back to the workbook it came from.
 */
export const dynamic = "force-dynamic";

export default async function ItemTypesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requireAdminPage("item-master");

  const query = await searchParams;
  const itemTypes = await listItemTypes(actor);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Item types</h1>

      <ItemMasterNav current="/item-master/types" />

      <Notices
        done={typeof query.done === "string" ? query.done : undefined}
        error={typeof query.error === "string" ? query.error : undefined}
      />

      <ItemTypePanel />

      {itemTypes.length === 0 ? (
        <p data-testid="types-empty" className="rounded border border-slate-300 bg-slate-50 px-3 py-4 text-sm">
          {NO_ITEM_TYPES_YET}
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table data-testid="type-table" className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th scope="col" className="px-2 py-2 font-semibold">Order</th>
                <th scope="col" className="px-2 py-2 font-semibold">Code and name</th>
                <th scope="col" className="px-2 py-2 font-semibold">Items</th>
                <th scope="col" className="px-2 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {itemTypes.map((itemType, index) => (
                <tr
                  key={itemType.id}
                  data-testid="type-row"
                  data-type-code={itemType.code}
                  className="border-b border-slate-200 align-top"
                >
                  <td className="px-2 py-2" data-testid="type-sort-order">
                    {itemType.sortOrder}
                  </td>
                  <td className="px-2 py-2">
                    <form action={renameItemTypeAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="itemTypeId" value={itemType.id} />
                      <label className="sr-only" htmlFor={`type-code-${itemType.id}`}>
                        Code of {itemType.name}
                      </label>
                      <input
                        id={`type-code-${itemType.id}`}
                        name="code"
                        type="text"
                        defaultValue={itemType.code}
                        className="min-h-11 w-32 max-w-full rounded border border-slate-300 px-2 py-2 text-base"
                      />
                      <label className="sr-only" htmlFor={`type-name-${itemType.id}`}>
                        Name of {itemType.name}
                      </label>
                      <input
                        id={`type-name-${itemType.id}`}
                        name="name"
                        type="text"
                        defaultValue={itemType.name}
                        className="min-h-11 w-48 max-w-full rounded border border-slate-300 px-2 py-2 text-base"
                      />
                      <SubmitButton testId={`rename-type-${itemType.id}`} tone="secondary">
                        {RENAME}
                      </SubmitButton>
                    </form>
                  </td>
                  <td className="px-2 py-2" data-testid="type-item-count">
                    {itemType.itemCount}
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex flex-wrap gap-2">
                      {index === 0 ? null : (
                        <form action={moveItemTypeAction}>
                          <input type="hidden" name="itemTypeId" value={itemType.id} />
                          <input type="hidden" name="direction" value="UP" />
                          <SubmitButton testId={`move-type-up-${itemType.id}`} tone="secondary">
                            {MOVE_UP}
                          </SubmitButton>
                        </form>
                      )}
                      {index === itemTypes.length - 1 ? null : (
                        <form action={moveItemTypeAction}>
                          <input type="hidden" name="itemTypeId" value={itemType.id} />
                          <input type="hidden" name="direction" value="DOWN" />
                          <SubmitButton testId={`move-type-down-${itemType.id}`} tone="secondary">
                            {MOVE_DOWN}
                          </SubmitButton>
                        </form>
                      )}
                      <form action={deleteItemTypeAction}>
                        <input type="hidden" name="itemTypeId" value={itemType.id} />
                        <SubmitButton testId={`delete-type-${itemType.id}`} tone="danger">
                          {DELETE}
                        </SubmitButton>
                      </form>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
