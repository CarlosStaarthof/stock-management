import { parseMonthKey } from "@/server/counts/period";
import { ValidationError } from "@/server/errors";
import type { BreakdownKey } from "@/types/analysis";

/**
 * The two query parameters `/analysis` reads, parsed at the edge of `src/server/`
 * (`docs/architecture.md` § Validation), and the builder that spells the URL back.
 *
 * Pure — no Prisma, no clock — which is why AC-16's parser half runs in
 * `npm run test:unit` with no Postgres at all. It lives under `src/server/` because it
 * builds on `parseMonthKey` from `@/server/counts/period` rather than restating what a
 * month key is, and `docs/architecture.md` forbids `src/lib/**` from importing it.
 *
 * THE PERIOD IS PARSED WITH `parseMonthKey`, NOT `parsePeriodKey`, AND THE DIFFERENCE IS
 * DELIBERATE (AC-16). `parsePeriodKey` refuses any year outside 2000–2100, and that cap
 * exists to keep a WRITE away from the `StockCount_periodMonth_range` CHECK #4 shipped.
 * THIS FEATURE WRITES NOTHING, and its e2e suite reserves years 2103–2105 — which
 * `parsePeriodKey` would refuse, producing a `307` that looks like a routing bug and is a
 * validator doing its job on the wrong side of the boundary. A source scan asserts
 * `parsePeriodKey` is called nowhere in this feature.
 *
 * NEITHER PARSER EVER THROWS, and that is deliberate too. A query string is a NAVIGATION,
 * not a submission: AC-16 and AC-21 require a value that cannot be read to redirect to
 * `/analysis` and render no error, and require that NO query parameter can make the page
 * throw. `parseMonthKeyParam` made the same choice in #7, `parseYardScope` in #10 and
 * `parseItemListQuery` in #6.
 *
 * THE ABSENT PERIOD AND THE UNREADABLE PERIOD ARE BOTH `null`, AND THE PAGE TELLS THEM
 * APART BY LOOKING AT THE RAW PARAMETER. AC-16 fixes this parser's answer for `undefined`
 * at `null` — there is no default period to return, because the default is *the latest
 * period holding an `APPROVED` count*, which is a question only the database can answer —
 * while AC-21 fixes the page's answer for the six unreadable values at a `307`. So the page
 * redirects when the parameter was PRESENT and unreadable, and renders the latest approved
 * period when it was absent. `breakdown` needs no such care: its default is a constant, so
 * absent is `DEFAULT_BREAKDOWN` and unreadable is `null`.
 */

/** AC-15, AC-16: `?breakdown=type` and no `?breakdown` at all are the same view. */
export const DEFAULT_BREAKDOWN: BreakdownKey = "type";

/**
 * The first value of a query parameter, `undefined` when it is absent, and `REPEATED` when
 * it appeared twice.
 *
 * A repeated parameter is not a value, it is two (007 AC-21). Taking the first would let
 * `?breakdown=type&breakdown=banana` mean something, and the page would then have a state
 * that depends on which one Next happened to put first.
 */
const REPEATED = Symbol("a repeated query parameter is not a value");

function singleValue(raw: string | string[] | undefined): string | undefined | typeof REPEATED {
  return Array.isArray(raw) ? REPEATED : raw;
}

/**
 * `?period=2026-09` and `?period=2105-03`, and `null` for `banana`, `2026-13`, `2026-1`,
 * an empty string, the parameter repeated twice, and the parameter absent (AC-16).
 *
 * `2105-03` is accepted because the e2e suite reserves 2103–2105 and this feature writes
 * nothing; see the module comment.
 */
export function parseAnalysisPeriodParam(raw: string | string[] | undefined): string | null {
  const value = singleValue(raw);
  if (value === REPEATED || value === undefined) return null;

  try {
    return parseMonthKey(value);
  } catch (error) {
    // The one refusal `parseMonthKey` raises, turned into the absence a navigation needs.
    // Anything else is a bug and is rethrown rather than swallowed into a blank screen.
    if (error instanceof ValidationError) return null;
    throw error;
  }
}

/**
 * `?breakdown=type|supplier`, `DEFAULT_BREAKDOWN` when it is absent, and `null` for
 * anything else — `banana`, an empty string, or the parameter repeated twice (AC-16, AC-21).
 *
 * The comparison is exact and case-sensitive: `Supplier` is a spelling a person never types
 * and a hand-edited URL does.
 */
export function parseBreakdownParam(raw: string | string[] | undefined): BreakdownKey | null {
  const value = singleValue(raw);
  if (value === REPEATED) return null;
  if (value === undefined) return DEFAULT_BREAKDOWN;

  return value === "type" || value === "supplier" ? value : null;
}

/**
 * The other direction: an `/analysis` URL, spelled in ONE place (AC-16).
 *
 * AC-16 asks every link the page renders — the two breakdown links, *Previous period* and
 * *Next period* — to carry the reading state, and the page renders several kinds of link.
 * Hand-built query strings are as many chances for one of them to drop `period`, which is
 * the bug the criterion exists to catch, so the builder lives HERE, beside the parser that
 * reads what it writes, and the two are tested against each other.
 *
 * BOTH PARAMETERS ARE WRITTEN WHENEVER THEY ARE GIVEN, including the default breakdown.
 * #10 omitted its default scope, because AC-16 there required `/stock-takes` with no query
 * to be a URL the product itself produces; here the requirement is the opposite one — every
 * link carries the current `?period` AND `?breakdown` — and a link that silently drops the
 * grouping when it happens to be the default is a link that cannot be asserted with one
 * rule.
 *
 * `path` is a path this feature owns and never a value from a request.
 */
export function analysisHref(
  path: string,
  params: { period?: string; breakdown?: BreakdownKey } = {},
): string {
  const query = new URLSearchParams();

  if (params.period !== undefined) query.set("period", params.period);
  if (params.breakdown !== undefined) query.set("breakdown", params.breakdown);

  const search = query.toString();
  return search === "" ? path : `${path}?${search}`;
}
