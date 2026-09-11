import Link from "next/link";
import type { JSX } from "react";

import { deleteItemAction } from "@/app/item-master/actions";
import { requireAdminPage } from "@/app/page-guards";
import { ItemMasterNav } from "@/components/item-master/ItemMasterNav";
import { SubmitButton } from "@/components/item-master/SubmitButton";
import {
  DELETE,
  DELETE_CONFIRM_HEADING,
  deleteConfirmBody,
  itemHasCountLines,
} from "@/lib/item-master-messages";
import { getItem } from "@/server/items/item-service";

/**
 * Confirm deleting an item (006 AC-12).
 *
 * The `GET` changes nothing: it names the item and states what goes with it. When the
 * item IS referenced by a count line the page renders the refusal instead of a confirm
 * control, in the same words `deleteItem` would throw — so the sentence an admin reads is
 * the service's own, and never a Postgres one (AC-29).
 */
export const dynamic = "force-dynamic";

export default async function DeleteItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<JSX.Element> {
  const actor = await requireAdminPage("item-master");

  const { id } = await params;
  const item = await getItem(actor, id);
  const refusal = item.lineCount > 0 ? itemHasCountLines(item.description, item.lineCount) : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{DELETE_CONFIRM_HEADING}</h1>

      <ItemMasterNav current="/item-master" />

      <p data-testid="delete-item-name" className="text-lg font-medium break-words">
        {item.description}
      </p>

      {refusal === null ? (
        <>
          <p data-testid="delete-confirm-body" className="text-sm">
            {deleteConfirmBody(item.description, item.prices.length, item.links.length)}
          </p>

          <form action={deleteItemAction}>
            <input type="hidden" name="itemId" value={item.id} />
            <SubmitButton testId="confirm-delete-item" tone="danger">
              {DELETE}
            </SubmitButton>
          </form>
        </>
      ) : (
        <p
          data-testid="delete-refused"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {refusal}
        </p>
      )}

      <Link
        href={`/item-master/items/${item.id}`}
        data-testid="delete-cancel"
        className="text-sm underline underline-offset-2"
      >
        Cancel and go back to the item
      </Link>
    </main>
  );
}
