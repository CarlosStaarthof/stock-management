import Link from "next/link";
import type { JSX } from "react";

import {
  archiveItemAction,
  assignItemAction,
  markItemReviewedAction,
  restoreItemAction,
  unassignItemAction,
} from "@/app/item-master/actions";
import { requireAdminPage } from "@/app/page-guards";
import { ItemForm } from "@/components/item-master/ItemForm";
import { ItemMasterNav } from "@/components/item-master/ItemMasterNav";
import { Notices } from "@/components/item-master/Notices";
import { PricePanel } from "@/components/item-master/PricePanel";
import { SubmitButton } from "@/components/item-master/SubmitButton";
import {
  ARCHIVE,
  ARCHIVED_TAG,
  ASSIGN,
  DELETE,
  FLAGGED_AT_IMPORT,
  IMPORT_NOTES_HEADING,
  MARK_REVIEWED,
  NEEDS_REVIEW_TAG,
  NO_SUPPLIER,
  NO_UNIT,
  RESTORE,
  REVIEW_REASON_TAG,
  UNASSIGN,
} from "@/lib/item-master-messages";
import { getItem } from "@/server/items/item-service";
import { todayIso } from "@/server/items/price-selection";
import { listItemTypes } from "@/server/items/item-type-service";
import { listSuppliers } from "@/server/items/supplier-service";

/**
 * One item: details, prices, yard assignment and the import note that explains why it was
 * flagged (006 AC-10 to AC-12, AC-15, AC-18 to AC-22).
 *
 * The `Delete` control is rendered only when `lineCount` is 0 — an item a count already
 * names is archived, never deleted (AC-12).
 */
export const dynamic = "force-dynamic";

const YARDS = [
  { code: "DUBLIN", name: "Dublin" },
  { code: "CLONMEL", name: "Clonmel" },
];

export default async function ItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<JSX.Element> {
  const actor = await requireAdminPage("item-master");

  const { id } = await params;
  const query = await searchParams;

  const [item, suppliers, itemTypes] = await Promise.all([
    getItem(actor, id),
    listSuppliers(actor, { includeArchived: true }),
    listItemTypes(actor),
  ]);

  const today = todayIso();
  const activeYardCodes = new Set(
    item.links.filter((link) => link.active).map((link) => link.locationCode),
  );

  // Only the supplier this item already names may appear archived in its own form (AC-25).
  const supplierChoices = suppliers
    .filter((supplier) => supplier.active || supplier.id === item.supplierId)
    .map((supplier) => ({ id: supplier.id, name: supplier.name, active: supplier.active }));

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-col gap-2">
        <h1 data-testid="item-description" className="text-2xl font-semibold tracking-tight break-words">
          {item.description}
        </h1>
        <p className="flex flex-wrap gap-2 text-sm">
          <span>{item.supplierName ?? NO_SUPPLIER}</span>
          <span aria-hidden="true">·</span>
          <span>{item.itemTypeName}</span>
          <span aria-hidden="true">·</span>
          <span>{item.unitLabel ?? NO_UNIT}</span>
          <span aria-hidden="true">·</span>
          {/* Derived from the label by `normaliseUnit`, never typed (006 § Out of scope). */}
          <span data-testid="unit-kind">{item.unitKind}</span>
        </p>
        <p className="flex flex-wrap gap-2">
          {item.needsReview ? (
            <span
              data-testid="needs-review-tag"
              className="inline-block rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
            >
              {NEEDS_REVIEW_TAG}
            </span>
          ) : null}
          {item.reviewReasons.map((reason) => (
            <span
              key={reason}
              data-testid={`reason-${reason}`}
              className="inline-block rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900"
            >
              {REVIEW_REASON_TAG[reason]}
            </span>
          ))}
          {item.needsReview && item.reviewReasons.length === 0 ? (
            <span
              data-testid="flagged-at-import"
              className="inline-block rounded border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900"
            >
              {FLAGGED_AT_IMPORT}
            </span>
          ) : null}
          {item.active ? null : (
            <span
              data-testid="archived-tag"
              className="inline-block rounded border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-700"
            >
              {ARCHIVED_TAG}
            </span>
          )}
        </p>
      </header>

      <ItemMasterNav current="/item-master" />

      <Notices
        done={typeof query.done === "string" ? query.done : undefined}
        error={typeof query.error === "string" ? query.error : undefined}
      />

      {item.notes === null ? null : (
        <section
          aria-labelledby="import-notes-heading"
          className="rounded border border-sky-300 bg-sky-50 px-3 py-3"
        >
          <h2 id="import-notes-heading" className="text-sm font-semibold text-sky-900">
            {IMPORT_NOTES_HEADING}
          </h2>
          {/* Verbatim: both cell references and both values, on the page where the unit
              label is edited (AC-20). */}
          <p data-testid="import-notes" className="whitespace-pre-wrap text-sm text-sky-900">
            {item.notes}
          </p>
        </section>
      )}

      <ItemForm
        itemId={item.id}
        values={{
          description: item.description,
          supplierId: item.supplierId ?? "",
          itemTypeId: item.itemTypeId,
          unitLabel: item.unitLabel ?? "",
          notes: item.notes ?? "",
        }}
        suppliers={supplierChoices}
        itemTypes={itemTypes.map((itemType) => ({ id: itemType.id, name: itemType.name }))}
      />

      <PricePanel
        itemId={item.id}
        prices={item.prices}
        today={today}
        defaultLabel={`${today.slice(0, 4)} Prices`}
      />

      <section aria-labelledby="yards-heading" className="flex flex-col gap-3">
        <h2 id="yards-heading" className="text-lg font-semibold">
          Yards
        </h2>
        <ul className="flex flex-col gap-2">
          {YARDS.map((yard) => {
            const assigned = activeYardCodes.has(yard.code);
            const link = item.links.find((candidate) => candidate.locationCode === yard.code);

            return (
              <li key={yard.code} className="flex flex-wrap items-center gap-3 text-sm">
                <span className="min-w-24 font-medium">{yard.name}</span>
                <span data-testid={`yard-state-${yard.code}`}>
                  {assigned ? `Assigned, position ${link?.sortOrder ?? ""}` : "Not assigned"}
                </span>
                <form action={assigned ? unassignItemAction : assignItemAction}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <input type="hidden" name="locationCode" value={yard.code} />
                  <SubmitButton
                    testId={`${assigned ? "unassign" : "assign"}-${yard.code}`}
                    tone="secondary"
                  >
                    {assigned ? UNASSIGN : ASSIGN}
                  </SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="lifecycle-heading" className="flex flex-col gap-3">
        <h2 id="lifecycle-heading" className="text-lg font-semibold">
          Lifecycle
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {item.needsReview ? (
            <form action={markItemReviewedAction}>
              <input type="hidden" name="itemId" value={item.id} />
              <SubmitButton testId="mark-reviewed" tone="secondary">
                {MARK_REVIEWED}
              </SubmitButton>
            </form>
          ) : null}

          <form action={item.active ? archiveItemAction : restoreItemAction}>
            <input type="hidden" name="itemId" value={item.id} />
            <SubmitButton testId={item.active ? "archive-item" : "restore-item"} tone="secondary">
              {item.active ? ARCHIVE : RESTORE}
            </SubmitButton>
          </form>

          {/* Rendered only when nothing references the item (AC-12). */}
          {item.lineCount === 0 ? (
            <Link
              href={`/item-master/items/${item.id}/delete`}
              data-testid="delete-item-link"
              className="inline-flex min-h-11 items-center rounded border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              {DELETE}
            </Link>
          ) : (
            <span data-testid="line-count" className="text-sm text-slate-600">
              On {item.lineCount} count line{item.lineCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </section>

      <Link href="/item-master" className="text-sm underline underline-offset-2">
        Back to the item master
      </Link>
    </main>
  );
}
