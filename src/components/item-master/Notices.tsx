import type { JSX } from "react";

import { doneMessage } from "@/lib/item-master-messages";

/**
 * The confirmation and the refusal a redirect brings back, rendered on the freshly loaded
 * page (006 AC-28).
 *
 * The success sentence is looked up from a KEY, so the words are always
 * `src/lib/item-master-messages.ts`'s. The failure sentence is the service's own message
 * and is carried verbatim, because it names the item and the count — and React escapes it
 * on the way onto the page, so it is text and never markup (AC-29).
 */
export function Notices({
  done,
  error,
}: {
  done?: string;
  error?: string;
}): JSX.Element | null {
  const confirmation = doneMessage(done);

  if (confirmation === null && (error === undefined || error === "")) return null;

  return (
    <div className="flex flex-col gap-2">
      {confirmation === null ? null : (
        <p
          data-testid="item-master-done"
          role="status"
          className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          {confirmation}
        </p>
      )}
      {error === undefined || error === "" ? null : (
        <p
          data-testid="item-master-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </p>
      )}
    </div>
  );
}
