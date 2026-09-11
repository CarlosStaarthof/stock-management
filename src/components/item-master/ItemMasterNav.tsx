import Link from "next/link";
import type { JSX } from "react";

/**
 * The section's own navigation.
 *
 * It is a component rendered BY each page rather than a `layout.tsx`, and deliberately so:
 * a layout renders around a page, and spec 006's *The refusal* section is emphatic that
 * nothing above a guarded page may flush anything before `requireAdminPage` has run. A
 * layout is safe today and a `loading.tsx` beside it would not be; keeping the chrome
 * inside the page removes the temptation entirely.
 */
const LINKS = [
  { href: "/item-master", label: "Items" },
  { href: "/item-master/suppliers", label: "Suppliers" },
  { href: "/item-master/types", label: "Item types" },
  { href: "/item-master/yards/DUBLIN", label: "Dublin sheet" },
  { href: "/item-master/yards/CLONMEL", label: "Clonmel sheet" },
];

export function ItemMasterNav({ current }: { current: string }): JSX.Element {
  return (
    <nav aria-label="Item master" className="flex flex-wrap gap-2 text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          aria-current={link.href === current ? "page" : undefined}
          className={
            link.href === current
              ? "rounded bg-slate-900 px-3 py-2 font-medium text-white"
              : "rounded border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"
          }
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
