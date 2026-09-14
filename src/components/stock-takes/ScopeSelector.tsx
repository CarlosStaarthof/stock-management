import Link from "next/link";
import type { JSX } from "react";

import { YARD_LABEL } from "@/lib/stock-takes-messages";
import type { YardScope } from "@/types/stock-count";

/**
 * Dublin / Clonmel / Both — the one control `/stock-entry` does not have (010 AC-5, AC-6).
 *
 * THREE LINKS, IN `Location.sortOrder` THEN `Both`, and the current one carries
 * `aria-current="true"` and no other one does. They are links rather than a `<select>`
 * because this feature ships no client JavaScript at all: a `<select>` needs an
 * `onChange` to navigate, and AC-18 requires every control here to work with the bundle
 * dead.
 *
 * IT IS HANDED ITS OPTIONS ALREADY BUILT. The label is `facetOptionLabel`'s — `Dublin (4)`
 * — the yard NAMES come from `Location.name` through `listCountableYards`, and the `href`
 * is `stockTakesHref`'s, so this component spells no URL and no yard. A component that
 * built its own link would be a second place the reading mode could be dropped (AC-16).
 *
 * There is no role branch here and no money: one rendering, both roles, and the body this
 * sits inside is compared byte for byte between the two sessions (AC-12, AC-13).
 */
export type ScopeOption = {
  scope: YardScope;
  /** `Dublin (4)` — built by `facetOptionLabel`, never spelled here. */
  label: string;
  href: string;
  current: boolean;
};

export function ScopeSelector({ options }: { options: ScopeOption[] }): JSX.Element {
  return (
    <nav
      data-testid="yard-scope"
      aria-label={YARD_LABEL}
      className="flex flex-wrap items-center gap-2"
    >
      {options.map((option) => (
        <Link
          key={option.scope}
          data-testid="yard-scope-option"
          data-scope={option.scope}
          href={option.href}
          prefetch={false}
          // Exactly one option is marked, and the attribute is absent on the others
          // rather than `false`: `aria-current="false"` is a value, and AC-6 counts
          // elements carrying the attribute at all.
          aria-current={option.current ? "true" : undefined}
          className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded border px-3 py-2 text-sm ${
            option.current
              ? "border-slate-900 bg-slate-900 font-semibold text-white"
              : "border-slate-300 text-slate-900"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
