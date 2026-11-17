import Link from "next/link";
import type { JSX } from "react";

import { requireUserPage } from "@/app/page-guards";
import { IdentityHeader } from "@/components/IdentityHeader";
import { HOME_HEADING, homeTilesForRole } from "@/server/home-menu";

/**
 * THE HOME MENU — the landing for every role since feature #22 (D3).
 *
 * It shows only the tiles the signed-in role may use (AC-5), built from the role read from
 * the database on this request. It carries no price, count, total or stock figure of any
 * kind (AC-9); the sections it leads to keep their shipped URLs and their own guards.
 *
 * `requireUserPage`, not `requireAdminPage`: every role has a home. The middleware refuses
 * a signed-out request before this page runs, so none of the menu is sent to it (AC-4).
 */
export const dynamic = "force-dynamic";

export default async function HomePage(): Promise<JSX.Element> {
  const user = await requireUserPage();
  const tiles = homeTilesForRole(user.role);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-3 sm:p-6">
      <IdentityHeader
        name={user.name}
        heading={<h1 className="text-2xl font-semibold tracking-tight">{HOME_HEADING}</h1>}
      />

      <nav data-testid="home-menu" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {tiles.map((tile) => (
          <Link
            key={tile.testId}
            data-testid={tile.testId}
            href={tile.href}
            prefetch={false}
            className="inline-flex min-h-16 items-center justify-center rounded border border-slate-300 px-4 py-4 text-lg font-medium"
          >
            {tile.label}
          </Link>
        ))}
      </nav>
    </main>
  );
}
