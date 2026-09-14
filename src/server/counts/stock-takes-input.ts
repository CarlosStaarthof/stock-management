import { locationCodeSchema } from "@/server/items/item-master-input";
import type { HeldView, YardScope } from "@/types/stock-count";

/**
 * The two query parameters `/stock-takes` reads, parsed at the edge of `src/server/`
 * (`docs/architecture.md` § Validation). Pure — no Prisma, no clock — which is why these
 * criteria run in `npm run test:unit` with no Postgres at all (AC-20).
 *
 * IT LIVES UNDER `src/server/` BECAUSE IT BUILDS ON `locationCodeSchema` rather than
 * restating which yards exist (spec 010, *Services and pure modules*), and
 * `docs/architecture.md` forbids `src/lib/**` from importing it. Two yards is a closed set
 * fixed by `specs/product-brief.md`, and a second list of them is a second thing to keep in
 * step. `src/lib/stock-takes-view.ts` compares plain strings and needs no schema, which is
 * why it is allowed to live one directory over.
 *
 * NEITHER FUNCTION EVER THROWS, and that is deliberate. A query string is a NAVIGATION, not
 * a submission: AC-6, AC-9 and AC-17 require a value that cannot be read to redirect to the
 * page's own base URL and render no error, and require that no query parameter can make
 * either page throw. `parseMonthKeyParam` made the same choice in #7 and
 * `parseItemListQuery` in #6.
 *
 * THE ABSENT VALUE AND THE UNREADABLE VALUE ARE DIFFERENT ANSWERS. Absent is the default —
 * `/stock-takes` with no query string is NOT redirected and renders `Both` (AC-16), because
 * the default scope is never spelled into a URL. Unreadable is `null`, and `null` is what
 * the page turns into a `307`.
 */

/** AC-6: the default with no `?yard` at all. `BOTH` is a scope, not a claim. */
export const DEFAULT_YARD_SCOPE: YardScope = "BOTH";

/** Part 5, AC-9: a count view defaults to HELD — "see what we have, not what we don't". */
export const DEFAULT_HELD_VIEW: HeldView = "held";

/**
 * The first value of a query parameter, `undefined` when it is absent, and `REPEATED` when
 * it appeared twice.
 *
 * A repeated parameter is not a value, it is two (007 AC-21). Taking the first would let
 * `?yard=DUBLIN&yard=banana` mean something, and the page would then have a state that
 * depends on which one Next happened to put first.
 */
const REPEATED = Symbol("a repeated query parameter is not a value");

function singleValue(raw: string | string[] | undefined): string | undefined | typeof REPEATED {
  return Array.isArray(raw) ? REPEATED : raw;
}

/**
 * `?yard=DUBLIN|CLONMEL|BOTH`, `BOTH` when it is absent, and `null` for anything else —
 * `banana`, `dublin`, an empty string, or the parameter repeated twice (AC-6).
 *
 * The comparison is exact and case-sensitive, because `locationCodeSchema` is: a code is a
 * code, and `dublin` is a spelling a person never types and a hand-edited URL does.
 */
export function parseYardScope(raw: string | string[] | undefined): YardScope | null {
  const value = singleValue(raw);
  if (value === REPEATED) return null;
  if (value === undefined) return DEFAULT_YARD_SCOPE;

  if (value === DEFAULT_YARD_SCOPE) return DEFAULT_YARD_SCOPE;

  const parsed = locationCodeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * `?show=held|all`, `held` when it is absent, and `null` for anything else (AC-9).
 *
 * `?show=held` therefore renders identically to no `?show` at all, which is what makes
 * *Show held only* a link back to a URL rather than a link that has to strip a parameter.
 */
export function parseHeldView(raw: string | string[] | undefined): HeldView | null {
  const value = singleValue(raw);
  if (value === REPEATED) return null;
  if (value === undefined) return DEFAULT_HELD_VIEW;

  if (value === "held" || value === "all") return value;
  return null;
}

/* --------------------------------------------------------- the same spelling, back */

/**
 * The other direction: a `/stock-takes` URL, spelled in ONE place (AC-16).
 *
 * AC-16 asks every link on both pages to carry the reading mode — the three scope links,
 * the month links, *Today*, the two count jumps, every badge, the held/all toggle, *Open
 * this count in Stock Entry*'s siblings and *Back to the calendar* — and the two pages
 * between them render nine kinds of link. Nine hand-built query strings are nine chances
 * for one of them to drop `yard`, which is the bug AC-16 exists to catch, so the builder
 * lives HERE, beside the parser that reads what it writes, and the two are tested against
 * each other.
 *
 * THE DEFAULT SCOPE IS NEVER SPELLED INTO A URL (AC-16): `yard` is omitted when it is
 * `DEFAULT_YARD_SCOPE`, which is why `/stock-takes` with no query string is a URL the
 * product itself produces rather than only one a person can type. `DEFAULT_HELD_VIEW` gets
 * no such treatment, and deliberately: AC-9 requires the *Show held only* control to link
 * to `?show=held` explicitly, so `show` is written whenever a caller asks for it and
 * omitted only when the caller leaves it out.
 *
 * `path` is a path this feature owns and never a value from a request; ids are encoded by
 * the caller that holds them.
 */
export function stockTakesHref(
  path: string,
  params: { month?: string; yard?: YardScope; show?: HeldView } = {},
): string {
  const query = new URLSearchParams();

  if (params.month !== undefined) query.set("month", params.month);
  if (params.yard !== undefined && params.yard !== DEFAULT_YARD_SCOPE) {
    query.set("yard", params.yard);
  }
  if (params.show !== undefined) query.set("show", params.show);

  const search = query.toString();
  return search === "" ? path : `${path}?${search}`;
}
