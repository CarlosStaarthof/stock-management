import Link from "next/link";
import type { JSX } from "react";

import { requireAdminPage } from "@/app/page-guards";
import { IdentityHeader } from "@/components/IdentityHeader";
import {
  EXPORT_DOWNLOAD_LABEL,
  EXPORT_EMPTY,
  EXPORT_HEADING,
  exportHref,
} from "@/lib/export-messages";
import { listExportStockTakes } from "@/server/export/export-service";

/**
 * EXPORT STOCK TAKES — the page an `ADMIN` downloads one depot's workbook from (R8, AC-15).
 *
 * ADMIN ONLY, and refused in the SERVICE as well as here: `requireAdminPage` keeps a
 * `YARD_STAFF` session out of the page, and `listExportStockTakes` asserts `ADMIN` as its
 * first statement, so removing the page guard exposes nothing (AC-8).
 *
 * ONE DOWNLOAD PER DEPOT PER STOCK TAKE. Each approved stock take is a period the database
 * holds an `APPROVED` count for; beneath it sits one control per active depot that approved a
 * count in that period, each pointing at that depot's own file (R3, R7, R8). The list is
 * derived from the database, newest first, and nothing about it is hard-coded.
 *
 * IT COMPUTES NOTHING AND CARRIES NO EURO. Every figure is in the downloaded file; this page
 * names periods and depots and offers links, so it can be read with the bundle dead.
 */
export const dynamic = "force-dynamic";

export default async function ExportPage(): Promise<JSX.Element> {
  const user = await requireAdminPage("analysis");
  const stockTakes = await listExportStockTakes(user);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-6">
      <IdentityHeader
        name={user.name}
        heading={<h1 className="text-2xl font-semibold tracking-tight">{EXPORT_HEADING}</h1>}
      >
        <Link
          href="/analysis"
          data-testid="back-to-analysis"
          prefetch={false}
          className="inline-flex min-h-11 items-center rounded border border-slate-300 px-3 py-2 text-sm"
        >
          Analysis
        </Link>
      </IdentityHeader>

      {stockTakes.length === 0 ? (
        <p
          data-testid="export-empty"
          className="rounded border border-slate-300 bg-slate-50 px-3 py-4 text-sm"
        >
          {EXPORT_EMPTY}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {stockTakes.map((stockTake) => (
            <li
              key={stockTake.periodKey}
              data-testid={`stock-take-${stockTake.periodKey}`}
              className="flex flex-col gap-2 rounded border border-slate-300 p-3"
            >
              <h2 className="text-lg font-semibold tracking-tight">{stockTake.periodLabel}</h2>
              <div className="flex flex-wrap gap-2">
                {stockTake.depots.map((depot) => (
                  <Link
                    key={depot.code}
                    href={exportHref(depot.code, stockTake.periodKey)}
                    data-testid={`download-${depot.code}`}
                    prefetch={false}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                  >
                    {`${EXPORT_DOWNLOAD_LABEL} ${depot.name}`}
                  </Link>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
