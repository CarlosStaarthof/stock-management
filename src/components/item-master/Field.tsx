import type { JSX, ReactNode } from "react";

/**
 * One labelled control: a `<label htmlFor>` BESIDE its control, never wrapping it, with
 * the hint and the error as siblings tied on by `aria-describedby`.
 *
 * Wrapping looks tidier and is wrong here. A `<label>` that contains a `<select>` takes
 * its accessible name from its whole text content — which includes every `<option>` — so
 * the Type field was called `TypeChoose a typeThermo-PBeads…` rather than `Type`. The
 * same trap swallows an inline error message: put it inside the label and `Description`
 * becomes `Description Description is required.` the moment the field is wrong. Both are
 * invisible on screen and both are exactly what a screen reader announces.
 */
export function Field({
  id,
  label,
  hint,
  error,
  errorTestId,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  errorTestId?: string;
  className?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-xs text-slate-600">
          {hint}
        </p>
      )}
      {error === null || error === undefined ? null : (
        <p
          id={`${id}-error`}
          data-testid={errorTestId}
          role="alert"
          className="text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}
