import Link from "next/link";
import type { JSX } from "react";

import { requireAdminPage } from "@/app/page-guards";
import { ItemForm } from "@/components/item-master/ItemForm";
import { ItemMasterNav } from "@/components/item-master/ItemMasterNav";
import { listItemTypes } from "@/server/items/item-type-service";
import { listSuppliers } from "@/server/items/supplier-service";

/**
 * Create an item (006 AC-7 to AC-9).
 *
 * Only ACTIVE suppliers are offered for a new choice: an archived one is a supplier
 * nobody buys from any more, and AC-25 keeps it visible only where an item already names
 * it.
 */
export const dynamic = "force-dynamic";

export default async function NewItemPage(): Promise<JSX.Element> {
  const actor = await requireAdminPage("item-master");

  const [suppliers, itemTypes] = await Promise.all([
    listSuppliers(actor),
    listItemTypes(actor),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add item</h1>

      <ItemMasterNav current="/item-master" />

      <ItemForm
        itemId={null}
        values={{ description: "", supplierId: "", itemTypeId: "", unitLabel: "", notes: "" }}
        suppliers={suppliers.map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          active: supplier.active,
        }))}
        itemTypes={itemTypes.map((itemType) => ({ id: itemType.id, name: itemType.name }))}
      />

      <Link href="/item-master" className="text-sm underline underline-offset-2">
        Back to the item master
      </Link>
    </main>
  );
}
