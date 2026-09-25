import type { JSX, ReactNode } from "react";

import { signOutAction } from "@/app/auth-actions";
import { SignOutForm } from "@/components/SignOutForm";

/**
 * The one identity header every signed-in page renders (021 S12, AC-37).
 *
 * It shows the profile's DISPLAY NAME — what the person, and anyone glancing at a yard
 * phone to see who is counting, recognises — and never the username. The name wraps at
 * any character (`overflow-wrap: anywhere`), because a name is up to 80 characters with
 * no space in it, and one unbreakable token wider than the viewport widens the whole
 * document: that is the overflow 010's fifth and sixth amendments recorded on three pages,
 * closed here once instead of three times. `min-w-0` lets the text shrink inside the flex
 * row instead of pushing it wider.
 *
 * `children` is where a page puts its own links beside the sign-out control.
 */
export function IdentityHeader({
  heading,
  name,
  children,
}: {
  heading: ReactNode;
  name: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <header className="flex min-w-0 flex-col gap-2">
      {heading}
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p
          data-testid="signed-in-name"
          className="min-w-0 flex-1 text-sm text-slate-600 [overflow-wrap:anywhere]"
        >
          {name}
        </p>
        {children}
        <SignOutForm action={signOutAction} />
      </div>
    </header>
  );
}
