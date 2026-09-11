import Link from "next/link";
import type { JSX } from "react";

import {
  archiveSupplierAction,
  deleteSupplierAction,
  renameSupplierAction,
  restoreSupplierAction,
} from "@/app/item-master/actions";
import { requireAdminPage } from "@/app/page-guards";
import { ItemMasterNav } from "@/components/item-master/ItemMasterNav";
import { Notices } from "@/components/item-master/Notices";
import { SubmitButton } from "@/components/item-master/SubmitButton";
import { SupplierPanel } from "@/components/item-master/SupplierPanel";
import {
  ARCHIVE,
  ARCHIVED_TAG,
  DELETE,
  NO_SUPPLIERS_YET,
  RENAME,
  RESTORE,
  SHOW_ARCHIVED,
} from "@/lib/item-master-messages";
import { listSuppliers } from "@/server/items/supplier-service";

/**
 * Suppliers: create, rename, archive, restore and delete (006 AC-25, AC-26).
 *
 * Archived suppliers are hidden until *Show archived* is asked for, which is a query
 * parameter rather than client state — so the view an admin is looking at is in the URL
 * and survives a save.
 */
export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requireAdminPage("item-master");

  const query = await searchParams;
  const includeArchived = query.archived === "1";
  const suppliers = await listSuppliers(actor, { includeArchived });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>

      <ItemMasterNav current="/item-master/suppliers" />

      <Notices
        done={typeof query.done === "string" ? query.done : undefined}
        error={typeof query.error === "string" ? query.error : undefined}
      />

      <SupplierPanel />

      <Link
        href={includeArchived ? "/item-master/suppliers" : "/item-master/suppliers?archived=1"}
        data-testid="toggle-archived-suppliers"
        className="text-sm underline underline-offset-2"
      >
        {includeArchived ? "Hide archived" : SHOW_ARCHIVED}
      </Link>

      {suppliers.length === 0 ? (
        <p data-testid="suppliers-empty" className="rounded border border-slate-300 bg-slate-50 px-3 py-4 text-sm">
          {NO_SUPPLIERS_YET}
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <table data-testid="supplier-table" className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300 text-left">
                <th scope="col" className="px-2 py-2 font-semibold">Name</th>
                <th scope="col" className="px-2 py-2 font-semibold">Items</th>
                <th scope="col" className="px-2 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr
                  key={supplier.id}
                  data-testid="supplier-row"
                  data-supplier-name={supplier.name}
                  className="border-b border-slate-200 align-top"
                >
                  <td className="px-2 py-2">
                    <form action={renameSupplierAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="supplierId" value={supplier.id} />
                      <label className="sr-only" htmlFor={`supplier-${supplier.id}`}>
                        Name of {supplier.name}
                      </label>
                      <input
                        id={`supplier-${supplier.id}`}
                        name="name"
                        type="text"
                        defaultValue={supplier.name}
                        className="min-h-11 w-52 max-w-full rounded border border-slate-300 px-2 py-2 text-base"
                      />
                      <SubmitButton testId={`rename-supplier-${supplier.id}`} tone="secondary">
                        {RENAME}
                      </SubmitButton>
                    </form>
                    {supplier.active ? null : (
                      <span className="mt-1 inline-block rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs">
                        {ARCHIVED_TAG}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2" data-testid="supplier-item-count">
                    {supplier.itemCount}
                  </td>
                  <td className="px-2 py-2">
                    <span className="flex flex-wrap gap-2">
                      <form action={supplier.active ? archiveSupplierAction : restoreSupplierAction}>
                        <input type="hidden" name="supplierId" value={supplier.id} />
                        <SubmitButton
                          testId={`${supplier.active ? "archive" : "restore"}-supplier-${supplier.id}`}
                          tone="secondary"
                        >
                          {supplier.active ? ARCHIVE : RESTORE}
                        </SubmitButton>
                      </form>
                      <form action={deleteSupplierAction}>
                        <input type="hidden" name="supplierId" value={supplier.id} />
                        <SubmitButton testId={`delete-supplier-${supplier.id}`} tone="danger">
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
