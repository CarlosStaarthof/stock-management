import {
  REOPEN_REASON_REQUIRED,
  REOPEN_REASON_SINGLE_LINE,
  REOPEN_REASON_TOO_LONG,
} from "@/lib/count-messages";
import { parseSignaturePath } from "@/lib/signature-path";
import { ValidationError } from "@/server/errors";
import type { SubmitCountInput } from "@/types/stock-count";

/**
 * The two values a form hands the lifecycle service, parsed at the edge.
 *
 * PURE, and that is what puts half of 009 AC-18 and all of AC-5's server side into
 * `npm run test:unit` with no database (AC-31). `docs/architecture.md`: every input
 * crossing a trust boundary is parsed at the edge of `src/server/`, and the service below
 * receives values it may assume are valid — then parses the signature ONCE MORE before
 * writing, because the last gate before Postgres is the one that matters.
 *
 * Both functions take `unknown`, because `FormData.get` returns `string | File | null` and
 * a field that was never sent returns `null`. A missing field and an empty one are the
 * same refusal, spelled once (009 AC-6).
 */

/** The longest a reason may be. Longer than a sentence, shorter than a story. */
export const REOPEN_REASON_MAX_LENGTH = 200;

/**
 * A newline in a reason would forge a second entry in the audit trail, because the trail
 * is one line per event in `StockCount.notes` (009 AC-18, AC-20). `\u2028` and `\u2029`
 * are line breaks too as far as a text column and a renderer are concerned.
 */
const LINE_BREAK = /[\n\r\u2028\u2029]/;

/** What `submitCount` receives: a drawn signature, and nothing else at all. */
export function parseSubmitCountInput(signature: unknown): SubmitCountInput {
  return { signaturePath: parseSignaturePath(signature) };
}

/**
 * The reason a count is being reopened, trimmed, single-line and 1–200 characters.
 *
 * The order of the three refusals is the order a person meets them: nothing typed, then a
 * forged line break, then a length. The line-break check comes before the length so that a
 * pasted paragraph is named for what is wrong with it rather than for how long it is.
 */
export function parseReopenReason(reason: unknown): string {
  if (typeof reason !== "string" || reason.trim() === "") {
    throw new ValidationError("reason", REOPEN_REASON_REQUIRED);
  }

  const trimmed = reason.trim();

  if (LINE_BREAK.test(trimmed)) {
    throw new ValidationError("reason", REOPEN_REASON_SINGLE_LINE);
  }

  if (trimmed.length > REOPEN_REASON_MAX_LENGTH) {
    throw new ValidationError("reason", REOPEN_REASON_TOO_LONG);
  }

  return trimmed;
}
