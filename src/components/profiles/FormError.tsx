import type { JSX } from "react";

/** One refused action's message, beside the form it concerns (021 `/profiles`, UI states). */
export function FormError({
  testId,
  message,
}: {
  testId: string;
  message: string | null;
}): JSX.Element | null {
  if (message === null) return null;
  return (
    <p
      data-testid={testId}
      role="alert"
      className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 [overflow-wrap:anywhere]"
    >
      {message}
    </p>
  );
}
