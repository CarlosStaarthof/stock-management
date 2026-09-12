import { describe, expect, it } from "vitest";

import {
  SIGNATURE_REQUIRED,
  SIGNATURE_TOO_LONG,
  SIGNATURE_UNREADABLE,
} from "@/lib/count-messages";
import {
  MIN_POINT_DISTANCE,
  SIGNATURE_HEIGHT,
  SIGNATURE_MAX_CHARS,
  SIGNATURE_MAX_POINTS,
  SIGNATURE_PATH_PATTERN,
  SIGNATURE_VIEWBOX,
  SIGNATURE_WIDTH,
  type SignaturePoint,
  parseSignaturePath,
  pointInViewBox,
  reducePoints,
  splitStrokes,
  strokesToPath,
} from "@/lib/signature-path";
import { ValidationError } from "@/server/errors";

/**
 * Spec 009 AC-5 and the pure half of AC-8: the signature grammar, with no database and no
 * browser (AC-31). Every refusal is asserted on the FIELD and the MESSAGE, because the pad
 * renders the sentence beside the field the error names.
 */
function refusal(value: unknown): { field: string; message: string } {
  try {
    parseSignaturePath(value);
  } catch (error) {
    if (error instanceof ValidationError) return { field: error.field, message: error.message };
    throw error;
  }
  throw new Error(`parseSignaturePath accepted ${String(value)}`);
}

/** A stroke of `points` points, spaced far enough apart that none is dropped. */
function stroke(points: number, startX = 0): SignaturePoint[] {
  return Array.from({ length: points }, (_unused, index) => ({
    x: startX + (index % 50) * 4,
    y: 10 + (index % 40) * 2,
  }));
}

describe("AC-5: the constants are named, exported and exactly these", () => {
  it("AC-5: the coordinate space and the two caps", () => {
    expect(SIGNATURE_VIEWBOX).toBe("0 0 600 300");
    expect(SIGNATURE_WIDTH).toBe(600);
    expect(SIGNATURE_HEIGHT).toBe(300);
    expect(SIGNATURE_MAX_CHARS).toBe(6000);
    expect(SIGNATURE_MAX_POINTS).toBe(400);
  });
});

describe("AC-5: what the grammar accepts", () => {
  it("AC-5: the two paths the criterion names are returned unchanged", () => {
    expect(parseSignaturePath("M 10 10 L 20 20")).toBe("M 10 10 L 20 20");
    expect(parseSignaturePath("M 10.5 10.5 L 20 20.1 L 30 40 M 100 100 L 120 130")).toBe(
      "M 10.5 10.5 L 20 20.1 L 30 40 M 100 100 L 120 130",
    );
  });

  it("AC-5: a 3-stroke 380-point path built by strokesToPath is accepted", () => {
    const path = strokesToPath([stroke(140), stroke(140, 1), stroke(100, 2)]);

    expect(parseSignaturePath(path)).toBe(path);
    expect(SIGNATURE_PATH_PATTERN.test(path)).toBe(true);
    expect([...path.matchAll(/M/g)]).toHaveLength(3);
    expect([...path.matchAll(/L/g)]).toHaveLength(380 - 3);
  });

  it("AC-5: surrounding whitespace is trimmed, and the trim is the only change", () => {
    expect(parseSignaturePath("  M 10 10 L 20 20\n")).toBe("M 10 10 L 20 20");
  });

  it("AC-5: a path of exactly SIGNATURE_MAX_CHARS characters is accepted", () => {
    const path = exactly(SIGNATURE_MAX_CHARS);

    expect(path).toHaveLength(SIGNATURE_MAX_CHARS);
    expect(parseSignaturePath(path)).toBe(path);
  });
});

describe("AC-5, AC-6: nothing drawn at all", () => {
  it("AC-6: the empty string, whitespace, null and undefined all ask for a signature", () => {
    for (const value of ["", "   ", null, undefined]) {
      expect(refusal(value)).toEqual({ field: "signature", message: SIGNATURE_REQUIRED });
    }
  });

  it("AC-6: a value that is not a string at all is refused rather than coerced", () => {
    for (const value of [42, {}, [], { signaturePath: "M 10 10 L 20 20" }]) {
      expect(refusal(value)).toEqual({ field: "signature", message: SIGNATURE_REQUIRED });
    }
  });
});

describe("AC-5: the whitelist, one refusal per shape the criterion names", () => {
  const unreadable = [
    ["a dot is not a signature", "M 10 10"],
    ["no spaces", "M10 10L20 20"],
    ["lowercase commands", "m 10 10 l 20 20"],
    ["a command outside the whitelist", "M 10 10 C 1 2 3 4 5 6"],
    ["two decimal places", "M 10 10 L 20 20.55"],
    ["a sign", "M -1 10 L 20 20"],
    ["x beyond SIGNATURE_WIDTH", "M 10 10 L 700 20"],
    ["y beyond SIGNATURE_HEIGHT", "M 10 10 L 20 400"],
    ["a double space", "M 10 10 L 20 20  L 30 30"],
    ["markup", '<svg onload="x"/>'],
    ["a script tag", "M 10 10 L 20 20 <script>alert(1)</script>"],
    ["a javascript URL", "javascript:alert(1)"],
  ] as const;

  for (const [why, value] of unreadable) {
    it(`AC-5: ${why} is refused, and the pattern refuses it too`, () => {
      expect(refusal(value)).toEqual({ field: "signature", message: SIGNATURE_UNREADABLE });
    });
  }

  it("AC-5: the bound is on the value, not on the digit count: 600 and 300 are inside", () => {
    expect(parseSignaturePath("M 0 0 L 600 300")).toBe("M 0 0 L 600 300");
    expect(refusal("M 0 0 L 600.1 300").message).toBe(SIGNATURE_UNREADABLE);
    expect(refusal("M 0 0 L 600 300.1").message).toBe(SIGNATURE_UNREADABLE);
  });

  it("AC-5: every stroke needs its own L, not just the first one", () => {
    expect(refusal("M 10 10 L 20 20 M 30 30").message).toBe(SIGNATURE_UNREADABLE);
  });
});

/**
 * A syntactically valid path of exactly `length` characters, for a length that is a
 * multiple of eight.
 *
 * Both pieces are eight characters wide, so the length is exact by construction rather
 * than by padding a coordinate - which would push it past the three digits the grammar
 * allows and turn a length test into a grammar test.
 */
function exactly(length: number): string {
  const head = "M 111 11";
  const segment = " L 22 22";

  return head + segment.repeat((length - head.length) / segment.length);
}

describe("AC-5: the server's backstop", () => {
  it("AC-5: one character past SIGNATURE_MAX_CHARS is too long to store", () => {
    const path = `${exactly(SIGNATURE_MAX_CHARS)} L 22 22`;

    expect(path.length).toBeGreaterThan(SIGNATURE_MAX_CHARS);
    expect(refusal(path)).toEqual({ field: "signature", message: SIGNATURE_TOO_LONG });
  });
});

describe("AC-5: pointInViewBox is pure, rounds to one decimal and clamps", () => {
  const rect = { left: 20, top: 100, width: 300, height: 150 };

  it("AC-5: a client point maps into viewBox units", () => {
    // 300 CSS px across 600 units: one CSS px is two units.
    expect(pointInViewBox(rect, 20, 100)).toEqual({ x: 0, y: 0 });
    expect(pointInViewBox(rect, 170, 175)).toEqual({ x: 300, y: 150 });
    expect(pointInViewBox(rect, 320, 250)).toEqual({ x: 600, y: 300 });
  });

  it("AC-5: it rounds to ONE decimal place, so the grammar can always spell the result", () => {
    const point = pointInViewBox(rect, 20.037, 100.037);

    expect(point.x).toBe(0.1);
    expect(point.y).toBe(0.1);
    expect(SIGNATURE_PATH_PATTERN.test(strokesToPath([[point, { x: 1, y: 1 }]]))).toBe(true);
  });

  it("AC-5: a pointer released outside the pad yields an in-bounds point, not an invalid path", () => {
    expect(pointInViewBox(rect, -500, -500)).toEqual({ x: 0, y: 0 });
    expect(pointInViewBox(rect, 5000, 5000)).toEqual({ x: 600, y: 300 });

    const path = strokesToPath([
      [pointInViewBox(rect, -500, -500), pointInViewBox(rect, 5000, 5000)],
    ]);
    expect(parseSignaturePath(path)).toBe("M 0 0 L 600 300");
  });

  it("AC-5: a pad of zero width does not produce NaN", () => {
    expect(pointInViewBox({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

describe("AC-8: the reducer, which is why a signature is a few hundred bytes", () => {
  it("AC-8: 200 collinear points 0.5 units apart reduce to fewer than 60", () => {
    const points = Array.from({ length: 200 }, (_unused, index) => ({
      x: index * 0.5,
      y: 10,
    }));

    const kept = reducePoints(points);

    expect(kept.length).toBeLessThan(60);
    expect(kept.length).toBeGreaterThan(1);
    expect(kept[0]).toEqual({ x: 0, y: 10 });
  });

  it("AC-8: every kept point is at least MIN_POINT_DISTANCE from the one before it", () => {
    const points = Array.from({ length: 300 }, (_unused, index) => ({
      x: (index % 7) * 0.9,
      y: (index % 11) * 0.4,
    }));

    const kept = reducePoints(points);

    for (let index = 1; index < kept.length; index += 1) {
      const dx = kept[index].x - kept[index - 1].x;
      const dy = kept[index].y - kept[index - 1].y;
      expect(Math.sqrt(dx * dx + dy * dy)).toBeGreaterThanOrEqual(MIN_POINT_DISTANCE);
    }
  });

  it("AC-8: the first point is always kept, and an empty stroke stays empty", () => {
    expect(reducePoints([])).toEqual([]);
    expect(reducePoints([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });
});

describe("AC-7, AC-8: strokesToPath writes exactly what will be stored", () => {
  it("AC-8: a second stroke starts a new M, so two strokes hold exactly two M commands", () => {
    const path = strokesToPath([
      [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
      ],
      [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
    ]);

    expect(path).toBe("M 1 2 L 3 4 M 10 20 L 30 40");
    expect([...path.matchAll(/M/g)]).toHaveLength(2);
    expect(parseSignaturePath(path)).toBe(path);
  });

  it("AC-5: a stroke of one point is dropped, because a dot is not a signature", () => {
    const path = strokesToPath([
      [{ x: 1, y: 2 }],
      [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
    ]);

    expect(path).toBe("M 10 20 L 30 40");
    expect(strokesToPath([[{ x: 1, y: 2 }]])).toBe("");
  });

  it("AC-5: coordinates are written with at most one decimal and no trailing .0", () => {
    const path = strokesToPath([
      [
        { x: 1.04, y: 2.06 },
        { x: 3.0, y: 4.55 },
      ],
    ]);

    expect(path).toBe("M 1 2.1 L 3 4.6");
    expect(parseSignaturePath(path)).toBe(path);
  });

  it("AC-8: the client cap keeps the server cap unreachable in ordinary use", () => {
    // SIGNATURE_MAX_POINTS points, spread over three strokes, still fits well inside
    // SIGNATURE_MAX_CHARS - which is what makes the 6000-character refusal a backstop for
    // a forged body rather than something a person can meet by signing.
    const path = strokesToPath([
      stroke(SIGNATURE_MAX_POINTS / 2),
      stroke(SIGNATURE_MAX_POINTS / 4, 1),
      stroke(SIGNATURE_MAX_POINTS / 4, 2),
    ]);

    expect(path.length).toBeLessThan(SIGNATURE_MAX_CHARS);
    expect(parseSignaturePath(path)).toBe(path);
  });
});

/* ===================================================================================
 * Phase B — what the pad and the count page render, from one definition.
 * =================================================================================== */

describe("AC-7: splitStrokes is the renderer's half of the round trip", () => {
  it("AC-7: one stroke per M, and joining them by a single space gives the input back", () => {
    const path = "M 10 10 L 20 20 M 30 30 L 40 40.5 L 50 50";

    expect(splitStrokes(path)).toEqual(["M 10 10 L 20 20", "M 30 30 L 40 40.5 L 50 50"]);
    expect(splitStrokes(path).join(" ")).toBe(path);
  });

  it("AC-7: the property holds for every path this module would accept", () => {
    const paths = [
      "M 10 10 L 20 20",
      "M 10.5 10.5 L 20 20.1 L 30 40 M 100 100 L 120 130",
      strokesToPath([stroke(40), stroke(40, 1), stroke(40, 2)]),
    ];

    for (const path of paths) {
      expect(parseSignaturePath(path), path).toBe(path);
      expect(splitStrokes(path).join(" "), path).toBe(path);
      // One `<path>` element per `M` command, which is what the page renders.
      expect(splitStrokes(path), path).toHaveLength((path.match(/M /g) ?? []).length);
    }
  });

  it("AC-7: nothing to draw is no strokes at all, and rendering never throws", () => {
    expect(splitStrokes("")).toEqual([]);
    expect(splitStrokes("   ")).toEqual([]);
    // Rendering is not where a signature is validated: junk comes back as one stroke.
    expect(splitStrokes("nonsense")).toEqual(["nonsense"]);
  });
});
