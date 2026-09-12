import {
  SIGNATURE_REQUIRED,
  SIGNATURE_TOO_LONG,
  SIGNATURE_UNREADABLE,
} from "@/lib/count-messages";
import { ValidationError } from "@/server/errors";

/**
 * The signature, as a grammar rather than as a picture.
 *
 * WHAT IS STORED IS SVG PATH DATA, NOT A RASTER AND NOT A DOCUMENT: the `d` attribute of
 * the strokes, in a fixed coordinate space, and nothing else. A few hundred bytes that
 * scale onto #12's Excel export and a printed sheet without going fuzzy, rather than a
 * base64 PNG that does not.
 *
 * IT LIVES IN `src/lib/`, DELIBERATELY (009 AC-31). `docs/architecture.md` records a named
 * `components -> server` exception for #8's `quantity-input.ts` and `entry-filters.ts` and
 * says in terms: "If a third such module appears, the better answer is to move all of them
 * under `src/lib/`." The pad and the service must share ONE grammar - a browser that
 * accepts what the server refuses is a person signing twice - so this would have been the
 * third. Here it needs no exception at all: it imports `@/lib/count-messages` and the
 * error classes from `@/server/errors`, which is the one lib-to-server import the fence
 * permits (006 AC-33).
 *
 * THE GRAMMAR IS A WHITELIST, and that is what makes the column safe: `M`, `L`, digits, a
 * single dot and single spaces. What goes in cannot be markup, cannot be a script tag and
 * cannot be a `data:` URL - not because those are filtered out, but because nothing except
 * the whitelist is ever let in. Every stroke must carry at least one `L`: A DOT IS NOT A
 * SIGNATURE, and that rule lives in the pattern rather than in an extra check somebody
 * could forget to call.
 */

/** The fixed coordinate space. A stored path means the same thing on every screen. */
export const SIGNATURE_WIDTH = 600;
export const SIGNATURE_HEIGHT = 300;
export const SIGNATURE_VIEWBOX = `0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}`;

/**
 * The server's backstop for a forged body. A real signature drawn under the client cap
 * lands near 3 000 characters, so this is never met by a person (009 AC-8).
 */
export const SIGNATURE_MAX_CHARS = 6000;

/** The client cap, and the one a person actually meets - it says so rather than truncating. */
export const SIGNATURE_MAX_POINTS = 400;

/**
 * Points closer together than this, in viewBox units, are dropped.
 *
 * The pad is 600 units across roughly 360 CSS px on a phone, so two units is about one
 * millimetre of finger travel: below that a point carries no shape, only bytes. It is what
 * keeps a signature a few hundred bytes rather than a few thousand (009 AC-8).
 */
export const MIN_POINT_DISTANCE = 2;

/** A point in viewBox units, rounded to one decimal place. Never a client coordinate. */
export type SignaturePoint = { x: number; y: number };

/** A rectangle as `getBoundingClientRect` gives it - a plain object, so this stays pure. */
export type PadRect = { left: number; top: number; width: number; height: number };

/**
 * At most three digits and at most ONE decimal place, with no sign and no exponent.
 *
 * One decimal place is a tenth of a viewBox unit - finer than the pad can resolve, and the
 * difference between a 3 000-character signature and a 9 000-character one.
 */
const COORDINATE = String.raw`\d{1,3}(?:\.\d)?`;
const POINT = `${COORDINATE} ${COORDINATE}`;
const STROKE = `M ${POINT}(?: L ${POINT})+`;

/**
 * The whole of the stored grammar: one or more strokes, single-space separated, each a
 * move followed by AT LEAST ONE line.
 */
export const SIGNATURE_PATH_PATTERN = new RegExp(`^${STROKE}(?: ${STROKE})*$`);

/** Every coordinate in a path that has already matched the pattern, in order. */
function coordinatesOf(path: string): number[] {
  return path
    .split(" ")
    .filter((token) => token !== "M" && token !== "L")
    .map((token) => Number(token));
}

/**
 * Inside the pad, or it is not a signature this product drew.
 *
 * The pattern cannot express the bound - `700` is three digits exactly as `600` is - so it
 * is checked here, over coordinates the pattern has already proved to be plain decimals.
 * A `Number` is safe on a coordinate in a fixed 600 x 300 space: it is neither money nor a
 * quantity, and `docs/architecture.md` "Money and quantities" is about those two.
 */
function withinViewBox(path: string): boolean {
  const coordinates = coordinatesOf(path);

  for (let index = 0; index < coordinates.length; index += 2) {
    if (coordinates[index] > SIGNATURE_WIDTH) return false;
    if (coordinates[index + 1] > SIGNATURE_HEIGHT) return false;
  }

  return true;
}

/**
 * The one gate. The pad calls it before submitting, the service calls it again before
 * writing, and a forged body meets exactly the same rules as a drawn one (009 AC-6).
 *
 * THE ORDER OF THE THREE REFUSALS IS DELIBERATE. Nothing drawn at all is the ordinary case
 * and gets the ordinary sentence. Length is checked before the pattern, so a megabyte of
 * text is refused by a comparison rather than by a regular expression.
 */
export function parseSignaturePath(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError("signature", SIGNATURE_REQUIRED);
  }

  const path = value.trim();

  if (path.length > SIGNATURE_MAX_CHARS) {
    throw new ValidationError("signature", SIGNATURE_TOO_LONG);
  }

  if (!SIGNATURE_PATH_PATTERN.test(path) || !withinViewBox(path)) {
    throw new ValidationError("signature", SIGNATURE_UNREADABLE);
  }

  return path;
}

/** `12.34` -> `12.3`, `12.04` -> `12`: at most one decimal place, and never a trailing `.0`. */
function formatCoordinate(value: number): string {
  return `${Math.round(value * 10) / 10}`;
}

/** A client point mapped into the viewBox, rounded to one decimal place and clamped. */
export function pointInViewBox(rect: PadRect, clientX: number, clientY: number): SignaturePoint {
  const scaleX = rect.width === 0 ? 0 : SIGNATURE_WIDTH / rect.width;
  const scaleY = rect.height === 0 ? 0 : SIGNATURE_HEIGHT / rect.height;

  // Clamped, not refused: a pointer released just outside the pad is an ordinary gesture,
  // and an in-bounds point is a better answer than an invalid path (009 AC-5).
  const clamp = (value: number, upper: number): number =>
    Math.min(upper, Math.max(0, Math.round(value * 10) / 10));

  return {
    x: clamp((clientX - rect.left) * scaleX, SIGNATURE_WIDTH),
    y: clamp((clientY - rect.top) * scaleY, SIGNATURE_HEIGHT),
  };
}

/**
 * Drop a point closer than `MIN_POINT_DISTANCE` to the last one kept.
 *
 * Compared as squared distances, so there is no square root: `Math.hypot` on every
 * pointermove of a fast stroke is work a phone in a cold yard does not need to do
 * (009 AC-8).
 */
export function reducePoints(
  points: readonly SignaturePoint[],
  minDistance: number = MIN_POINT_DISTANCE,
): SignaturePoint[] {
  const kept: SignaturePoint[] = [];
  const minimum = minDistance * minDistance;

  for (const point of points) {
    const last = kept[kept.length - 1];
    if (last === undefined) {
      kept.push(point);
      continue;
    }

    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (dx * dx + dy * dy >= minimum) kept.push(point);
  }

  return kept;
}

/**
 * Strokes to the exact string that is stored and rendered.
 *
 * A stroke of fewer than two points is DROPPED rather than written as a lone `M`: a dot is
 * not a signature, and the pattern would refuse the whole path for it - dropping it here
 * means a stray tap beside a real stroke does not invalidate the signature.
 *
 * WHAT IS DRAWN IS WHAT IS STORED: the pad renders these same `d` strings, so there is no
 * raster-to-vector step in which the two could differ (009 AC-7).
 */
export function strokesToPath(strokes: readonly (readonly SignaturePoint[])[]): string {
  return strokes
    .filter((stroke) => stroke.length >= 2)
    .map((stroke) =>
      stroke
        .map(
          (point, index) =>
            `${index === 0 ? "M" : "L"} ${formatCoordinate(point.x)} ${formatCoordinate(point.y)}`,
        )
        .join(" "),
    )
    .join(" ");
}

/**
 * One stored path back into its strokes, so a renderer can draw one `<path>` per stroke.
 *
 * `"M 1 1 L 2 2 M 3 3 L 4 4"` -> `["M 1 1 L 2 2", "M 3 3 L 4 4"]`, and joining the result
 * with a single space gives back exactly what went in - which is the property 009 AC-7
 * asserts on the rendered page: the `d` attributes, joined by one space, EQUAL the stored
 * string. The pad and the count page call this same function, so what was drawn, what was
 * stored and what is shown cannot be three different pictures.
 *
 * A value that is not a path this module would accept comes back as a single stroke rather
 * than throwing: rendering is not the place a signature is validated.
 */
export function splitStrokes(path: string): string[] {
  const trimmed = path.trim();
  if (trimmed === "") return [];

  const strokes: string[] = [];
  for (const token of trimmed.split(" ")) {
    if (token === "M" || strokes.length === 0) strokes.push(token);
    else strokes[strokes.length - 1] += ` ${token}`;
  }

  return strokes;
}
