import type { JSX } from "react";

import { RESET_PIN_SHOWN_ONCE } from "@/lib/auth-messages";

/**
 * A PIN drawn by a reset or a direct creation, shown ONCE (021 AC-24, AC-25): it is rendered
 * from the one action response that carried it, beside whose it is and the warning that it
 * cannot be shown again. A reload shows the page without it.
 */
export function NewPinNotice({ pin, name }: { pin: string; name: string }): JSX.Element {
  return (
    <div
      data-testid="new-pin-notice"
      role="status"
      className="flex flex-col gap-1 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
    >
      <p data-testid="new-pin-for" className="[overflow-wrap:anywhere]">
        {name}
      </p>
      <p data-testid="new-pin" className="font-mono text-2xl tracking-widest">
        {pin}
      </p>
      <p>{RESET_PIN_SHOWN_ONCE}</p>
    </div>
  );
}
