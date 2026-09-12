"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { JSX, PointerEvent as ReactPointerEvent } from "react";

import { submitCountAction } from "@/app/stock-entry/actions";
import { EMPTY_COUNT_ACTION_STATE } from "@/app/stock-entry/form-state";
import { StartCountButton } from "@/components/stock-entry/StartCountButton";
import {
  CLEAR_SIGNATURE,
  SIGNATURE_FULL,
  SIGNATURE_HEADING,
  SIGNATURE_NEEDS_JS,
  SIGN_AND_SUBMIT,
} from "@/lib/count-messages";
import {
  SIGNATURE_MAX_POINTS,
  SIGNATURE_VIEWBOX,
  pointInViewBox,
  reducePoints,
  splitStrokes,
  strokesToPath,
} from "@/lib/signature-path";
import type { SignaturePoint } from "@/lib/signature-path";

/**
 * THE PAD: a finger, a stylus and a mouse, and ONE code path for the three (009 AC-8).
 *
 * POINTER EVENTS, NOT THREE FAMILIES OF THEM. `pointerdown`, `pointermove`, `pointerup`
 * and `pointercancel` — and `pointercancel` is bound to the SAME handler as `pointerup`,
 * because a gesture the browser takes away is a stroke that ended. There is no
 * `touchstart`, no `mousedown` and no branch anywhere on what kind of pointer it was: a
 * criterion asserts that by source scan, and the phone and the desktop specs assert that
 * the same component produces a valid path for both.
 *
 * `touch-action: none` IS WHAT MAKES A DRAG DRAW INSTEAD OF SCROLL. Without it, a finger
 * moved across this box scrolls the page and the signature is one dot — the single
 * assertion 009 AC-9 exists for is that `window.scrollY` does not move during the gesture.
 *
 * WHAT IS DRAWN IS WHAT IS STORED. The rendered `<path>` elements and the hidden field are
 * built from the same `strokesToPath` string, so there is no raster-to-vector step in
 * which the two could differ (009 AC-7). The grammar lives in `src/lib/signature-path.ts`
 * and the SERVICE runs it again before writing: a browser that accepted what the server
 * refuses would be a person signing twice.
 *
 * THE CAP IS THE CLIENT'S AND IT SAYS SO. `SIGNATURE_MAX_POINTS` stops recording and
 * renders a sentence, rather than silently dropping the end of a stroke;
 * `SIGNATURE_MAX_CHARS` is the server's backstop for a forged body and a person never
 * meets it (009 AC-8).
 *
 * IT NEEDS JAVASCRIPT, AND THE SCREEN SAYS SO (009 AC-10, Open question 5). You cannot
 * draw with a finger without it. Until this component has mounted it renders the sentence
 * and NO submit control at all — so a browser with the bundle disabled is told the truth
 * instead of being shown a button that cannot work. Everything else in this feature —
 * approve, reopen, and this very review screen — is an ordinary form and needs none.
 *
 * THE SUBMIT CONTROL IS ENABLED BEFORE ANYTHING IS DRAWN, deliberately (009 AC-6): the
 * refusal is `submitCount`'s, and a disabled button is not a rule. Pressing it with an
 * empty pad renders `Draw your signature before submitting this count.` beside the pad and
 * writes nothing. The same is true of a count that is still blocked by Invariant 5: the
 * sentence that comes back names how many rows nobody counted.
 */
export function SignaturePad({ countId }: { countId: string }): JSX.Element {
  const [state, formAction] = useActionState(submitCountAction, EMPTY_COUNT_ACTION_STATE);

  // Until the effect has run there is no JavaScript as far as this screen is concerned,
  // which is exactly the state a bundle-less browser is left in permanently.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  /** The authoritative strokes. A ref, so a fast stroke cannot lose a point to a re-render. */
  const strokes = useRef<SignaturePoint[][]>([]);
  const points = useRef(0);
  const drawing = useRef(false);
  const pad = useRef<SVGSVGElement | null>(null);

  /** What is rendered AND what is submitted: one string, built once per accepted point. */
  const [path, setPath] = useState("");
  const [full, setFull] = useState(false);

  function pointAt(event: ReactPointerEvent<SVGSVGElement>): SignaturePoint | null {
    const box = pad.current?.getBoundingClientRect();
    if (box === undefined) return null;

    return pointInViewBox(box, event.clientX, event.clientY);
  }

  function startStroke(event: ReactPointerEvent<SVGSVGElement>): void {
    const point = pointAt(event);
    if (point === null) return;

    if (points.current >= SIGNATURE_MAX_POINTS) {
      setFull(true);
      return;
    }

    // The pointer is captured so a stroke that wanders off the pad keeps drawing and comes
    // back, rather than ending at the edge and starting a new `M` when it returns.
    pad.current?.setPointerCapture(event.pointerId);
    drawing.current = true;
    strokes.current = [...strokes.current, [point]];
    points.current += 1;
  }

  function extendStroke(event: ReactPointerEvent<SVGSVGElement>): void {
    if (!drawing.current) return;

    const point = pointAt(event);
    if (point === null) return;

    const stroke = strokes.current[strokes.current.length - 1];
    // ONE reducer, the one `signature-path.test.ts` proves: a point closer than
    // `MIN_POINT_DISTANCE` carries no shape, only bytes, and is dropped here.
    const extended = reducePoints([...stroke, point]);
    if (extended.length === stroke.length) return;

    if (points.current >= SIGNATURE_MAX_POINTS) {
      // It says so rather than truncating silently, and it stops recording (009 AC-8).
      setFull(true);
      drawing.current = false;
      return;
    }

    strokes.current[strokes.current.length - 1] = extended;
    points.current += 1;
    setPath(strokesToPath(strokes.current));
  }

  function endStroke(): void {
    drawing.current = false;
  }

  function clear(): void {
    strokes.current = [];
    points.current = 0;
    drawing.current = false;
    setPath("");
    setFull(false);
  }

  if (!ready) {
    return (
      <p
        data-testid="signature-needs-js"
        role="note"
        className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
      >
        {SIGNATURE_NEEDS_JS}
      </p>
    );
  }

  const aboveTheForm = state.error !== null && state.field === null;
  const besideThePad = state.error !== null && state.field !== null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="countId" value={countId} />
      {/*
        What is submitted, and what a rejected submission KEEPS: this component does not
        unmount between attempts, so the drawing survives a refusal and nobody has to sign
        twice for a reason that was not the drawing (009 AC-29).
      */}
      <input type="hidden" name="signature" data-testid="signature-field" value={path} />

      {/* A ConflictError or a NotFoundError names no control and renders above the form. */}
      {!aboveTheForm ? null : (
        <p
          data-testid="submit-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {state.error}
        </p>
      )}

      <svg
        ref={pad}
        data-testid="signature-pad"
        viewBox={SIGNATURE_VIEWBOX}
        role="application"
        aria-label={SIGNATURE_HEADING}
        onPointerDown={startStroke}
        onPointerMove={extendStroke}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        className="h-auto w-full touch-none select-none rounded border-2 border-dashed border-slate-400 bg-white"
      >
        {splitStrokes(path).map((stroke, index) => (
          <path
            key={`${String(index)}-${stroke.slice(0, 12)}`}
            d={stroke}
            fill="none"
            stroke="#0f172a"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>

      {!full ? null : (
        <p data-testid="signature-full" role="alert" className="text-sm font-medium text-amber-900">
          {SIGNATURE_FULL}
        </p>
      )}

      {/* A ValidationError renders INLINE beside the pad it names. */}
      {!besideThePad ? null : (
        <p
          data-testid="submit-field-error"
          role="alert"
          data-field={state.field}
          className="text-sm font-medium text-red-700"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="clear-signature"
          onClick={clear}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-400 px-4 py-2 text-base font-medium"
        >
          {CLEAR_SIGNATURE}
        </button>

        <StartCountButton testId="sign-and-submit">{SIGN_AND_SUBMIT}</StartCountButton>
      </div>
    </form>
  );
}
