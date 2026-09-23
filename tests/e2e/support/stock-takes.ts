import type { Page } from "@playwright/test";

import { db } from "@/server/db";

/**
 * Fixtures for the two `/stock-takes` specs (spec 010 AC-21).
 *
 * IT IS A NEW MODULE RATHER THAN AN EDIT TO `tests/e2e/support/stock-entry.ts`, and AC-22
 * is the reason: that file is a SHIPPED one, and this feature may amend it "exactly as
 * AC-21 names and no further" — which is `RESERVED_YEAR` and its 2100 note. Everything
 * #10 needs beyond that lives here. The year reservation, the count seeding, the
 * lifecycle helpers and `realCountIds` are still `stock-entry.ts`'s and are imported from
 * it, because a second definition of "a reserved year" is exactly what 007 AC-30 forbids.
 */

/**
 * Invariant 5's three states, spread over a count's own lines.
 *
 * THE NUMBERS ARE DERIVED, NOT HARD-CODED. AC-9 describes the user's real Dublin sheet —
 * 82 lines, 47 held, 23 zero, 12 never counted — and a spec that asserted `82` would be
 * asserting about their data rather than about this feature. So the caller says how many
 * zeros and how many nulls it wants, this returns what the count actually holds, and the
 * spec computes `hidden of total` from that. 007's calendar spec made the same choice and
 * records it.
 *
 * The quantities are written through Prisma rather than through the entry endpoint,
 * because what these criteria are about is what a LATER READ does with them: a fixture
 * must not be able to fail independently of the thing it is meant to prove.
 */
export async function shapeCountQuantities(
  countId: string,
  options: { zeros: number; nulls: number },
): Promise<{
  total: number;
  held: number;
  hidden: number;
  /** The item rendering `Not counted`, and the one rendering `0` (AC-9). */
  nullItemId: string;
  zeroItemId: string;
  /** The two decimals AC-8 requires to survive the read unrounded. */
  exactItemId: string;
  exactQuantity: string;
  fractionItemId: string;
  fractionQuantity: string;
}> {
  const lines = await db.stockCountLine.findMany({
    where: { stockCountId: countId },
    select: { id: true, itemId: true },
    orderBy: { itemId: "asc" },
  });

  const zeros = lines.slice(0, options.zeros);
  const nulls = lines.slice(options.zeros, options.zeros + options.nulls);
  const heldLines = lines.slice(options.zeros + options.nulls);

  // `0` and `null` are DIFFERENT facts, and the whole of #8 is that they stay that way
  // through a write and now through a read (Invariant 5).
  await db.stockCountLine.updateMany({
    where: { id: { in: zeros.map((line) => line.id) } },
    data: { quantity: 0 },
  });
  await db.stockCountLine.updateMany({
    where: { id: { in: nulls.map((line) => line.id) } },
    data: { quantity: null },
  });
  await db.stockCountLine.updateMany({
    where: { id: { in: heldLines.map((line) => line.id) } },
    data: { quantity: 3 },
  });

  // The workbook's own awkward numbers: `21.6128` tonnes and `0.475` units, which a float
  // round trip loses and which this screen must print character for character (AC-8).
  const exactQuantity = "21.6128";
  const fractionQuantity = "0.475";
  await db.stockCountLine.update({
    where: { id: heldLines[0].id },
    data: { quantity: exactQuantity },
  });
  await db.stockCountLine.update({
    where: { id: heldLines[1].id },
    data: { quantity: fractionQuantity },
  });

  return {
    total: lines.length,
    held: heldLines.length,
    hidden: zeros.length + nulls.length,
    nullItemId: nulls[0].itemId,
    zeroItemId: zeros[0].itemId,
    exactItemId: heldLines[0].itemId,
    exactQuantity,
    fractionItemId: heldLines[1].itemId,
    fractionQuantity,
  };
}

/**
 * The longest `Item.description` on one yard's sheet — AC-19 measures the overflow on it.
 *
 * Scoped to the yard because a count holds that yard's items: the longest description in
 * the whole database might belong to an item no Dublin count has a row for, and then the
 * measurement would be taken on a row that is not on the screen.
 */
export async function longestDescription(locationCode: "DUBLIN" | "CLONMEL"): Promise<string> {
  const links = await db.itemLocation.findMany({
    where: { location: { code: locationCode } },
    select: { item: { select: { description: true } } },
  });

  return links.reduce(
    (longest, link) =>
      link.item.description.length > longest.length ? link.item.description : longest,
    "",
  );
}

/**
 * The body AC-13 compares BYTE FOR BYTE between a yard session and an administrator's.
 *
 * Everything on each page except the identity header sits inside it, so an equality here
 * is the whole of "one version of the screen, not two" — no normalisation, no whitespace
 * collapsing, no "except the link".
 */
export async function bodyOf(page: Page, url: string): Promise<string> {
  await page.goto(url);

  // The read waits for the document to be QUIET first, and that is not decoration. These
  // pages are `force-dynamic` and Next streams them, so `goto` resolving on `load` does
  // not by itself mean the last chunk of the body has been inserted - and a byte
  // comparison taken mid-flush is a failure that says nothing about the two roles. One
  // such inequality (8 characters, on a `?show=all` detail) was observed during this
  // session and never reproduced; the wait is the answer to it either way, because at
  // `retries: 0` a measurement that is sometimes taken early is a measurement that is
  // sometimes wrong.
  await page.waitForLoadState("networkidle");
  await page.getByTestId("stock-takes-body").waitFor();

  return page.getByTestId("stock-takes-body").innerHTML();
}

/**
 * `(day cell test id, data-count-id, data-location-code, badge status text)` for every
 * badge on a rendered calendar, in per-day order (AC-4).
 *
 * The two calendars are the same calendar, and this is what makes that checkable rather
 * than promised: the array this returns for `/stock-entry?month=X` must EQUAL the array it
 * returns for `/stock-takes?month=X&yard=BOTH`. An array rather than a set, so "in the
 * same per-day order" is asserted too.
 */
export async function badgeTuples(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid^='day-']")).flatMap((cell) =>
      Array.from(cell.querySelectorAll("[data-testid='count-badge']")).map((badge) => {
        const spans = badge.querySelectorAll("span");
        const status = spans.length === 0 ? "" : (spans[spans.length - 1].textContent ?? "");

        return [
          cell.getAttribute("data-testid") ?? "",
          badge.getAttribute("data-count-id") ?? "",
          badge.getAttribute("data-location-code") ?? "",
          status.trim(),
        ].join("|");
      }),
    ),
  );
}

/**
 * The token a neighbour this spec does not own is replaced by before a byte comparison.
 *
 * It is not cuid-shaped on purpose: if the masking ever lands on a value it should not
 * have, the difference is legible in the reporter rather than being one hex string that
 * looks like another.
 */
export const FOREIGN_NEIGHBOUR = "a-count-this-spec-does-not-own";

/**
 * A rendered body with every `/stock-takes/counts/<id>` whose `<id>` belongs to ANOTHER
 * spec replaced by `FOREIGN_NEIGHBOUR` — and every id the caller owns left alone.
 *
 * WHY A BYTE COMPARISON NEEDS THIS AT ALL (010's eighth post-approval amendment). AC-9 and
 * AC-13 claim MODE- AND ROLE-INVARIANCE: the same count, read twice, renders the same
 * bytes. They do not claim anything about WHICH count the two jumps lead to. But
 * `findNeighbourCounts` picks the neighbour by `(countDate, id)` across the WHOLE yard's
 * history, so the href of *Previous count* holds a value derived from every other spec's
 * rows — and at `workers: 3` those rows appear and disappear between the two navigations a
 * comparison needs. Both failures diagnosed on 2026-09-14 were exactly that: identical
 * lengths (a cuid is fixed width, which is the signature) and one differing id.
 *
 * THE MASK IS THE NARROWEST ONE THAT DROPS THE DEPENDENCY. Only the id is replaced, and
 * only when the caller does not own it: the query the jump carries (`?yard=…&show=…`), the
 * element, its attributes and the neighbour ids the caller DOES own are still compared
 * byte for byte, and a jump that pointed at a different one of the caller's own counts in
 * one of the two readings still fails. The per-spec reserved years (007 AC-30) cannot do
 * this job on their own: a neighbour is chosen across every year, so another file's
 * 2090-series count is a perfectly good "previous count" for a 2102 one.
 *
 * "A count whose neighbours cannot move" was the other repair the amendment offered, and
 * it is not available here: pinning the earliest count's predecessor would mean seeding a
 * second Dublin count inside this spec's own year dated before it, and
 * `@@unique([locationId, periodYear, periodMonth])` refuses a second Dublin row for the
 * same period — the only way through would be a count whose period and count date name
 * different months, which is a fixture that lies about the domain.
 */
export function maskForeignNeighbours(body: string, ownCountIds: readonly string[]): string {
  const own = new Set(ownCountIds);

  return body.replace(/\/stock-takes\/counts\/([A-Za-z0-9_-]+)/g, (whole: string, id: string) =>
    own.has(id) ? whole : `/stock-takes/counts/${FOREIGN_NEIGHBOUR}`,
  );
}

/**
 * Where *Previous count* and *Next count* lead on the page as it stands, by count id.
 *
 * `null` is the disabled state — `CountJump` renders a `span` with no `href` there, and
 * "there is nowhere to go" is a fact a caller may want to assert. A jump whose href is not
 * a count URL is returned WHOLE rather than as `null`, so a malformed one fails an
 * equality with something readable in it instead of passing as "disabled".
 *
 * This is the other half of the mask above: what the mask stops comparing, the caller
 * asserts directly, on the neighbours its own fixture owns and can predict.
 */
export async function jumpTargets(
  page: Page,
): Promise<{ previous: string | null; next: string | null }> {
  const targetOf = async (testId: string): Promise<string | null> => {
    const href = await page.getByTestId(testId).getAttribute("href");
    if (href === null) return null;

    const match = /^\/stock-takes\/counts\/([^?#]+)/.exec(href);
    return match === null ? href : decodeURIComponent(match[1]);
  };

  return { previous: await targetOf("previous-count"), next: await targetOf("next-count") };
}
