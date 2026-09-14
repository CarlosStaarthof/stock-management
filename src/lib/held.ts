import { compareDecimals } from "@/lib/money";

/**
 * HELD MEANS `quantity > 0`, AND IT IS ONE FUNCTION.
 *
 * `specs/domain-model.md` Part 5: a count *view* defaults to held only — "see what we have,
 * not what we don't". 35 of the 82 rows in the most recent Dublin count are zero or blank,
 * so the default is the difference between reading a record and scrolling past half a page
 * of nothing.
 *
 * THREE STATES, NOT TWO, and the middle one is the whole of Invariant 5:
 *
 *   * `null`  — nobody looked. The workbook's blank cell, which could not say this.
 *   * `"0"`   — counted, and none held. A person stood in the yard and wrote it.
 *   * `"0.0001"` and up — held.
 *
 * `isHeld` answers `false` for the first two and `true` for the third, and the two `false`s
 * stay distinguishable afterwards because this module never collapses them: `partitionHeld`
 * moves whole lines, so whatever `quantity` a line arrived with, it leaves with.
 *
 * The comparison goes through `compareDecimals` and NEVER through a JavaScript `number`
 * (010 AC-10, `docs/architecture.md` § Money and quantities): `0.0001` tonnes of something
 * is held, and `Decimal(12, 4)` reads a counted zero back as the string `"0.0000"`, so a
 * comparison on the string itself would be wrong in both directions.
 *
 * Pure, and it imports nothing from `src/server/`, which is why AC-10 runs in
 * `npm run test:unit` with no Postgres at all.
 */

/** The value `isHeld` compares against. Held is *more than none*, never *not none*. */
const NONE = "0";

/** `true` when this line holds stock. `null` is *nobody looked* and is not held (AC-10). */
export function isHeld(quantity: string | null): boolean {
  return quantity !== null && compareDecimals(quantity, NONE) > 0;
}

/** The shape `partitionHeld` needs, and the only field it reads. */
export type HeldPartitionable = { quantity: string | null };

/**
 * The lines that hold stock and the lines that do not, INPUT ORDER PRESERVED IN BOTH
 * (AC-10), and `held.length + hidden.length === lines.length` for every input.
 *
 * Generic over the line, so the caller gets its own type back rather than a reduced one:
 * this module decides which rows a view shows, and never what a row says.
 */
export function partitionHeld<TLine extends HeldPartitionable>(
  lines: readonly TLine[],
): { held: TLine[]; hidden: TLine[] } {
  const held: TLine[] = [];
  const hidden: TLine[] = [];

  for (const line of lines) {
    if (isHeld(line.quantity)) held.push(line);
    else hidden.push(line);
  }

  return { held, hidden };
}
