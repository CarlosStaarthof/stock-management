"use client";

import type { JSX, ReactNode } from "react";

/**
 * The PIN keypad (021 *Phone-first*, AC-35): ten digit keys, a delete key and the submit
 * key, in three columns, every key at least 44 × 44 CSS px so a gloved thumb can hit it.
 *
 * Presentational. It holds no PIN of its own: the form owns the value and is told about
 * each key, so there is exactly one copy of a half-typed PIN, in memory, to forget.
 *
 * The form renders this only once JavaScript has run. Without JavaScript the keypad is
 * absent and the two fields work on their own; the keypad is an enhancement, never the
 * only way in.
 */
const KEY_CLASS =
  "flex min-h-14 min-w-11 items-center justify-center rounded border border-slate-300 bg-white text-xl font-medium active:bg-slate-100";

// Telephone order: 1-2-3 across the top, then delete, 0 and the submit key on the last row.
const DIGIT_ROWS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

export function PinPad({
  onDigit,
  onDelete,
  submit,
}: {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  /** The form's submit button, placed in the last row. */
  submit: ReactNode;
}): JSX.Element {
  return (
    <div data-testid="pin-pad" className="grid w-full grid-cols-3 gap-2">
      {DIGIT_ROWS.map((digit) => (
        <button
          key={digit}
          type="button"
          data-testid={`pin-key-${digit}`}
          aria-label={digit}
          onClick={() => onDigit(digit)}
          className={KEY_CLASS}
        >
          {digit}
        </button>
      ))}
      <button
        type="button"
        data-testid="pin-key-delete"
        aria-label="Delete the last digit"
        onClick={onDelete}
        className={KEY_CLASS}
      >
        ⌫
      </button>
      <button
        type="button"
        data-testid="pin-key-0"
        aria-label="0"
        onClick={() => onDigit("0")}
        className={KEY_CLASS}
      >
        0
      </button>
      {submit}
    </div>
  );
}
