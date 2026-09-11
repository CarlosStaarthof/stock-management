import Link from "next/link";
import type { JSX } from "react";

import {
  ARCHIVED_TAG,
  FLAGGED_AT_IMPORT,
  NEEDS_REVIEW_TAG,
  NOTE_TAG,
  NO_PRICE,
  NO_SUPPLIER,
  NO_UNIT,
  REVIEW_REASON_TAG,
} from "@/lib/item-master-messages";
import { formatPriceExact } from "@/lib/money";
import type { ItemRow } from "@/server/items/item-service";

/**
 * The item list (006 AC-6). Presentational: it fetches nothing and decides nothing about
 * who may see it — the whole route is closed to a `YARD_STAFF` session at the door, which
 * is why a price may be rendered here at all (AC-2, AC-31).
 *
 * It is one of exactly two presentation files spec 006 AC-31 permits to name `unitPrice`,
 * and it names it in one place: handing the decimal string to `formatPriceExact`, which
 * never converts through `Number`.
 *
 * The table scrolls inside its own container. The DOCUMENT must never scroll sideways at
 * 390 px (AC-30), and a table with eight columns will not fit — so the overflow is put
 * where a phone can reach it instead of on `<html>`.
 */
function Tag({ label, tone }: { label: string; tone: "warn" | "info" | "muted" }): JSX.Element {
  const palette = {
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    info: "border-sky-300 bg-sky-50 text-sky-900",
    muted: "border-slate-300 bg-slate-50 text-slate-700",
  }[tone];

  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${palette}`}>
      {label}
    </span>
  );
}

export function ItemTable({ rows }: { rows: ItemRow[] }): JSX.Element {
  return (
    <div className="w-full overflow-x-auto">
      <table data-testid="item-table" className="w-full min-w-[52rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 text-left">
            <th scope="col" className="px-2 py-2 font-semibold">Description</th>
            <th scope="col" className="px-2 py-2 font-semibold">Supplier</th>
            <th scope="col" className="px-2 py-2 font-semibold">Type</th>
            <th scope="col" className="px-2 py-2 font-semibold">Unit</th>
            <th scope="col" className="px-2 py-2 font-semibold">Price</th>
            <th scope="col" className="px-2 py-2 font-semibold">Yards</th>
            <th scope="col" className="px-2 py-2 font-semibold">Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid="item-row" data-item-id={row.id} className="border-b border-slate-200 align-top">
              <td className="px-2 py-2">
                <Link
                  href={`/item-master/items/${row.id}`}
                  className="font-medium text-slate-900 underline underline-offset-2"
                >
                  {row.description}
                </Link>
              </td>
              <td className="px-2 py-2">{row.supplierName ?? NO_SUPPLIER}</td>
              <td className="px-2 py-2">{row.itemTypeName}</td>
              <td className="px-2 py-2">{row.unitLabel ?? NO_UNIT}</td>
              <td className="px-2 py-2" data-testid="item-price">
                {row.currentPrice === null ? NO_PRICE : formatPriceExact(row.currentPrice.unitPrice)}
              </td>
              <td className="px-2 py-2">
                <span className="flex flex-wrap gap-1">
                  {row.yards.map((code) => (
                    <Tag key={code} label={code} tone="muted" />
                  ))}
                </span>
              </td>
              <td className="px-2 py-2">
                <span className="flex flex-wrap gap-1">
                  {row.needsReview ? <Tag label={NEEDS_REVIEW_TAG} tone="warn" /> : null}
                  {row.reviewReasons.map((reason) => (
                    <Tag key={reason} label={REVIEW_REASON_TAG[reason]} tone="warn" />
                  ))}
                  {/* Flagged and missing nothing: the two below-total fuel rows (AC-18). */}
                  {row.needsReview && row.reviewReasons.length === 0 ? (
                    <Tag label={FLAGGED_AT_IMPORT} tone="info" />
                  ) : null}
                  {row.hasNote ? <Tag label={NOTE_TAG} tone="info" /> : null}
                  {row.active ? null : <Tag label={ARCHIVED_TAG} tone="muted" />}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
