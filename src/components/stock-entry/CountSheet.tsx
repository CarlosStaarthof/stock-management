"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FocusEvent, FormEvent, JSX, MouseEvent } from "react";

import { saveQuantitiesAction } from "@/app/stock-entry/actions";
import {
  EMPTY_SAVE_QUANTITIES_STATE,
  quantityFieldName,
} from "@/app/stock-entry/form-state";
import { EntryFilters } from "@/components/stock-entry/EntryFilters";
import {
  ALL_CHANGES_SAVED,
  CLEAR_FILTERS,
  NONE_HELD,
  NOT_COUNTED,
  NOT_SAVED,
  NO_MATCHING_LINES,
  NO_UNIT,
  RETRY_NOW,
  SAVE_NOW,
  SAVING,
  changesNotSaved,
  countedSummary,
  filtersHiding,
  showingSummary,
} from "@/lib/count-messages";
import { dropConfirmed, mergeEdit, readQueue, writeQueue } from "@/lib/entry-queue";
import {
  ENTRY_FACET_CATEGORIES,
  emptySelection,
  filterEntryRows,
  hiddenSummary,
  isEmptySelection,
} from "@/server/counts/entry-filters";
import type {
  EntryFacetCategory,
  EntryFacets,
  FilterSelection,
} from "@/server/counts/entry-filters";
import { parseQuantity } from "@/server/counts/quantity-input";
import { DomainError } from "@/server/errors";
import type {
  CountLineRow,
  QuantityEdit,
  SaveQuantitiesResult,
} from "@/types/stock-count";

/**
 * THE SCREEN THE PRODUCT EXISTS FOR: a person in a yard, in the cold, on a phone,
 * one-handed, typing the numbers in.
 *
 * #5 put the workbook's items in the database, #6 made them editable, #7 created a count
 * whose 82 lines all read `Not counted`. This is where they stop reading that.
 *
 * SIX RULES, each of which has a criterion rather than a comment keeping it true.
 *
 *  1. AN EMPTY INPUT IS NEVER SAVED AS `0`, AND A `0` IS NEVER RENDERED AS BLANK. The
 *     workbook's blank cell cannot tell "nobody looked" from "looked, none held", which is
 *     why a third of its rows are ambiguous and why Invariant 5 exists. Here the two are
 *     different to type, different to read and different in the row's markup: an empty
 *     input carries `data-counted="false"` and the words `Not counted`, a typed `0`
 *     carries `data-counted="true"` and the `0` itself (008 AC-4, AC-5).
 *  2. NOTHING TYPED IS EVER LOST. `docs/conventions.md`: *"The yard has bad signal — never
 *     lose a user's typed count."* Every unconfirmed edit is held in the queue AND in
 *     `Storage`, retried with backoff, flushed when the radio comes back, and re-applied
 *     after a reload. A failure NEVER empties an input, never replaces a typed number with
 *     the server's older one, never drops an edit from the queue, and never reloads or
 *     navigates (008 AC-13, AC-14, AC-15).
 *  3. A SERVER RESPONSE IS APPLIED TO A ROW ONLY IF NOTHING NEWER WAS TYPED THERE. Every
 *     row carries a revision that a local edit bumps; a batch remembers the revisions it
 *     sent, and a reply for a row whose revision has moved on is ignored. That is what
 *     stops one row's response rewriting another row's input, and what makes `11` typed
 *     over an in-flight `10` end as `11` (008 AC-12).
 *  4. NO INPUT IS EVER DISABLED OR READ-ONLY. A counter who cannot type while the phone is
 *     talking to Neon is a counter who stops counting (008 AC-12).
 *  5. A FILTER CANNOT HIDE AN UNCOUNTED ROW. Progress is `n of 82` over the WHOLE count,
 *     never the filtered view; whenever a filter is active the page says how many rows are
 *     hidden and how many of those nobody has counted (008 AC-23, AC-24).
 *  6. NO MONEY, FOR EITHER ROLE. No euro figure, no line value, no running total, and no
 *     per-row price tag. A draft total could only come from today's prices, and the
 *     snapshot column is null until the count is submitted (Invariant 2), so the two would
 *     disagree the moment a price changed — which is the workbook defect this product
 *     exists to remove. #9's submit summary is where the first total comes from
 *     (008 AC-17, AC-18).
 *
 * IT IS SERVER-RENDERED FIRST. The whole sheet is in the HTML of the first response, so
 * the page is complete before it hydrates and works with JavaScript disabled entirely: the
 * `<form>` below is a real form whose action is `saveQuantitiesAction`, and *Save now* is
 * a real submit control. With JavaScript, the submit is prevented and the queue is flushed
 * instead, so no `POST` to the page URL ever happens in the enhanced flow (008 AC-16).
 */

/** Long enough that `12.5` is one request, short enough that a walk away is not a loss. */
export const AUTOSAVE_DEBOUNCE_MS = 800;

/**
 * 1 s, 2 s, 4 s, 8 s, then 30 s forever (008 AC-13).
 *
 * The cap matters more than the curve: a phone behind a shed may be out of signal for
 * twenty minutes, and a schedule that kept doubling would be an hour late coming back.
 */
export const RETRY_BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 30_000] as const;

/** What one row is doing. `saved` is the resting state and the default. */
type SaveState = "saved" | "pending" | "saving" | "error";

type Timer = ReturnType<typeof setTimeout> | null;

/** The typed text of a row, or `null` when the row is *not counted* (Invariant 5). */
function typedQuantity(typed: Record<string, string>, itemId: string): string | null {
  const text = typed[itemId] ?? "";
  return text.trim() === "" ? null : text;
}

/** A domain error's own sentence, and never a driver's (008 AC-27). */
function sentenceOf(error: unknown): string | null {
  return error instanceof DomainError ? error.message : null;
}

export function CountSheet({
  countId,
  userId,
  path,
  lines,
  facets,
  initialSelection,
}: {
  countId: string;
  /** Whose queue this is: a shared yard phone must not re-apply somebody else's numbers. */
  userId: string;
  /** This count's own path, for `history.replaceState` and the no-JavaScript filter form. */
  path: string;
  /** EVERY line of the count, in sheet order. Filtering is a view, never a fetch (AC-3). */
  lines: CountLineRow[];
  facets: EntryFacets;
  initialSelection: FilterSelection;
}): JSX.Element {
  const [actionState, formAction] = useActionState(
    saveQuantitiesAction,
    EMPTY_SAVE_QUANTITIES_STATE,
  );

  /* ------------------------------------------------------------- what is on the screen */

  const [typed, setTyped] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.itemId, line.quantity ?? ""])),
  );
  const [rowStates, setRowStates] = useState<Record<string, SaveState>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<QuantityEdit[]>([]);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [selection, setSelection] = useState<FilterSelection>(initialSelection);

  /*
   * The mirrors below are the SOURCE OF TRUTH for everything asynchronous.
   *
   * A blur that happens 4 ms after a keystroke, a response that lands mid-typing and a
   * retry timer that fires 30 s later all need the queue as it is NOW, not as it was when
   * their closure was created. React state is a render-time snapshot, so every mutation
   * below updates the ref synchronously and hands the same object to the setter.
   */
  const typedRef = useRef(typed);
  const rowStatesRef = useRef(rowStates);
  const rowErrorsRef = useRef(rowErrors);
  const queueRef = useRef(queue);
  const sendingRef = useRef(false);
  const failedRef = useRef(false);
  const attemptRef = useRef(0);
  const revisionRef = useRef(new Map<string, number>());
  const debounceRef = useRef<Timer>(null);
  const retryRef = useRef<Timer>(null);
  const restoredRef = useRef(false);

  /* --------------------------------------------------------------- the small mutations */

  const putTyped = useCallback((itemId: string, text: string): void => {
    typedRef.current = { ...typedRef.current, [itemId]: text };
    setTyped(typedRef.current);
  }, []);

  const putRowState = useCallback((itemId: string, state: SaveState): void => {
    rowStatesRef.current = { ...rowStatesRef.current, [itemId]: state };
    setRowStates(rowStatesRef.current);
  }, []);

  const putRowError = useCallback((itemId: string, sentence: string | null): void => {
    const next = { ...rowErrorsRef.current };
    if (sentence === null) delete next[itemId];
    else next[itemId] = sentence;

    rowErrorsRef.current = next;
    setRowErrors(next);
  }, []);

  /** The queue, written to `Storage` in the same breath, so a reload finds it (AC-15). */
  const putQueue = useCallback(
    (next: QuantityEdit[]): void => {
      queueRef.current = next;
      setQueue(next);

      if (typeof window === "undefined") return;
      writeQueue(window.localStorage, {
        userId,
        countId,
        edits: next,
        updatedAt: Date.now(),
      });
    },
    [countId, userId],
  );

  const revisionOf = useCallback(
    (itemId: string): number => revisionRef.current.get(itemId) ?? 0,
    [],
  );

  /* -------------------------------------------------------------------------- the send */

  const scheduleRetry = useCallback((run: () => void): void => {
    if (retryRef.current !== null) clearTimeout(retryRef.current);

    const wait = RETRY_BACKOFF_MS[Math.min(attemptRef.current, RETRY_BACKOFF_MS.length - 1)];
    attemptRef.current += 1;
    retryRef.current = setTimeout(run, wait);
  }, []);

  const flush = useCallback(
    async function flush(keepalive = false): Promise<void> {
      if (debounceRef.current !== null) {
        // A blur flushes AND cancels the timer: it does not double-send (008 AC-11).
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (retryRef.current !== null) {
        clearTimeout(retryRef.current);
        retryRef.current = null;
      }

      // One request at a time. Everything typed while it is in flight goes in the NEXT
      // batch, which is what makes six rows and a blur two requests rather than six.
      if (sendingRef.current) return;

      const batch = queueRef.current;
      if (batch.length === 0) return;

      const sentAt = new Map(batch.map((edit) => [edit.itemId, revisionOf(edit.itemId)]));

      sendingRef.current = true;
      setSending(true);

      const saving = { ...rowStatesRef.current };
      for (const edit of batch) saving[edit.itemId] = "saving";
      rowStatesRef.current = saving;
      setRowStates(saving);

      let recovered = false;
      try {
        const response = await fetch(`/api/counts/${countId}/lines`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ edits: batch }),
          // `pagehide` and a hidden tab both get one last attempt the browser finishes on
          // its own, after this document has stopped running (008 AC-11).
          keepalive,
        });

        if (response.ok) {
          const result = (await response.json()) as SaveQuantitiesResult;

          const nextTyped = { ...typedRef.current };
          const nextStates = { ...rowStatesRef.current };
          const confirmed: string[] = [];

          for (const saved of result.saved) {
            // A newer local edit for this row exists: the reply is about a number the
            // counter has already replaced, so it is read and discarded (008 AC-12).
            if (revisionOf(saved.itemId) !== sentAt.get(saved.itemId)) continue;

            confirmed.push(saved.itemId);
            nextTyped[saved.itemId] = saved.quantity ?? "";
            nextStates[saved.itemId] = "saved";
          }

          typedRef.current = nextTyped;
          setTyped(nextTyped);
          rowStatesRef.current = nextStates;
          setRowStates(nextStates);
          putQueue(dropConfirmed(queueRef.current, confirmed));

          attemptRef.current = 0;
          failedRef.current = false;
          setFailed(false);
          setRefusal(null);
          recovered = true;
        } else {
          const body = (await response.json().catch(() => null)) as { error?: unknown } | null;
          const sentence = typeof body?.error === "string" ? body.error : null;

          // 5xx and a dropped connection are worth retrying; a refusal of the request
          // itself is not, so the automatic loop stops and *Retry now* stays the way out.
          markFailed(batch, sentAt, sentence, response.status >= 500);
        }
      } catch {
        // A dropped connection, an aborted request, a radio behind a shed: same answer.
        markFailed(batch, sentAt, null, true);
      } finally {
        sendingRef.current = false;
        setSending(false);
      }

      // Whatever arrived while the request was in flight, in one more batch.
      if (recovered && queueRef.current.length > 0) void flush();

      function markFailed(
        failedBatch: readonly QuantityEdit[],
        sent: ReadonlyMap<string, number>,
        sentence: string | null,
        retryable: boolean,
      ): void {
        // NOTHING IS REMOVED FROM THE QUEUE HERE, and no input is touched: the typed value
        // stays exactly where the counter typed it (008 AC-13).
        const nextStates = { ...rowStatesRef.current };
        for (const edit of failedBatch) {
          if (revisionOf(edit.itemId) !== sent.get(edit.itemId)) continue;
          nextStates[edit.itemId] = "error";
        }
        rowStatesRef.current = nextStates;
        setRowStates(nextStates);

        failedRef.current = true;
        setFailed(true);
        if (sentence !== null) setRefusal(sentence);
        if (retryable) scheduleRetry(() => void flush());
      }
    },
    [countId, putQueue, revisionOf, scheduleRetry],
  );

  /* ----------------------------------------------------------------------- the editing */

  const edit = useCallback(
    (itemId: string, text: string, immediately: boolean): void => {
      putTyped(itemId, text);
      revisionRef.current.set(itemId, revisionOf(itemId) + 1);

      let quantity: string | null;
      try {
        // THE CLIENT RUNS THE SAME PARSER THE SERVER RUNS (008 AC-7), so a refusal is a
        // sentence beside the row rather than a `400` a phone has no way to explain.
        quantity = parseQuantity(text);
      } catch (error) {
        const sentence = sentenceOf(error);
        if (sentence === null) throw error;

        putRowError(itemId, sentence);
        putRowState(itemId, "error");
        return;
      }

      putRowError(itemId, null);
      putRowState(itemId, "pending");
      putQueue(mergeEdit(queueRef.current, { itemId, quantity }));

      if (immediately) {
        void flush();
        return;
      }

      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
    },
    [flush, putQueue, putRowError, putRowState, putTyped, revisionOf],
  );

  /**
   * `0` is one tap (008 AC-6) — the only control on this page that writes a number the
   * user did not type, and the reason is arithmetic: the most recent Dublin count has 35
   * of 82 rows at zero or blank, and a counter who types `0` thirty-five times goes back
   * to paper.
   */
  const noneHeld = useCallback(
    (itemId: string): void => {
      let current: string | null = null;
      try {
        current = parseQuantity(typedRef.current[itemId] ?? "");
      } catch {
        current = null;
      }

      // Already none held: there is nothing to say, so nothing is sent.
      if (current === "0") return;

      // No debounce. A tap is a decision, not a keystroke somebody is still making.
      edit(itemId, "0", true);
    },
    [edit],
  );

  const retryNow = useCallback((): void => {
    attemptRef.current = 0;
    void flush();
  }, [flush]);

  /* ------------------------------------------------------------------------ the events */

  useEffect(() => {
    const flushNow = (): void => void flush();
    const flushKeepalive = (): void => void flush(true);
    const onVisibility = (): void => {
      if (document.visibilityState === "hidden") flushKeepalive();
    };

    // Bound to `online`, and NOT to a poll: the moment the radio comes back, the queue
    // goes (008 AC-14).
    window.addEventListener("online", flushNow);
    window.addEventListener("pagehide", flushKeepalive);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("online", flushNow);
      window.removeEventListener("pagehide", flushKeepalive);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flush]);

  useEffect(
    () => () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      if (retryRef.current !== null) clearTimeout(retryRef.current);
    },
    [],
  );

  /** A reload does not lose ten minutes of typing (008 AC-15). */
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    const restored = readQueue(window.localStorage, userId, countId);
    if (restored.length === 0) return;

    const known = new Set(lines.map((line) => line.itemId));
    const nextTyped = { ...typedRef.current };
    const nextStates = { ...rowStatesRef.current };
    const kept: QuantityEdit[] = [];

    for (const stored of restored) {
      // A line that is no longer on this count cannot be re-applied to anything.
      if (!known.has(stored.itemId)) continue;

      kept.push(stored);
      // OVER the server's values, not under them: the queued number is the newer fact.
      nextTyped[stored.itemId] = stored.quantity ?? "";
      nextStates[stored.itemId] = "error";
      revisionRef.current.set(stored.itemId, revisionOf(stored.itemId) + 1);
    }

    typedRef.current = nextTyped;
    setTyped(nextTyped);
    rowStatesRef.current = nextStates;
    setRowStates(nextStates);
    putQueue(kept);

    if (kept.length === 0) return;
    failedRef.current = true;
    setFailed(true);
    // A reload with good signal heals itself; a reload without one waits for `online`.
    scheduleRetry(() => void flush());
  }, [countId, flush, lines, putQueue, revisionOf, scheduleRetry, userId]);

  /* ----------------------------------------------------------------------- the filters */

  const replaceUrl = useCallback(
    (next: FilterSelection): void => {
      const params = new URLSearchParams();
      for (const category of ENTRY_FACET_CATEGORIES) {
        for (const option of next[category]) params.append(category, option);
      }

      const query = params.toString();
      // `replaceState`, never `pushState`: on a phone, *back* means "out of here", and a
      // counter who tapped four filters should not have to tap *back* four times to leave
      // (008 AC-22). No request is made either way.
      window.history.replaceState(null, "", query === "" ? path : `${path}?${query}`);
    },
    [path],
  );

  const toggleFilter = useCallback(
    (category: EntryFacetCategory, option: string): void => {
      const chosen = selection[category];
      const next: FilterSelection = {
        ...selection,
        [category]: chosen.includes(option)
          ? chosen.filter((held) => held !== option)
          : [...chosen, option],
      };

      setSelection(next);
      replaceUrl(next);
    },
    [replaceUrl, selection],
  );

  const clearFilters = useCallback(
    (event: MouseEvent<HTMLAnchorElement>): void => {
      event.preventDefault();
      const next = emptySelection();
      setSelection(next);
      replaceUrl(next);
    },
    [replaceUrl],
  );

  /* --------------------------------------------------------------------- what is shown */

  /*
   * The count as the COUNTER sees it: the server's lines with the typed text over them.
   *
   * Progress and the hiding sentence are both computed from this, which is what makes the
   * progress line move the moment a number is typed rather than when it is confirmed
   * (008 AC-24). Its counterweight is the unsaved banner: the page never claims a number
   * is stored, only that it has been entered.
   */
  const live = useMemo(
    () =>
      lines.map((line) => ({ ...line, quantity: typedQuantity(typed, line.itemId) })),
    [lines, typed],
  );

  const visible = useMemo(() => filterEntryRows(live, selection), [live, selection]);
  const hidden = useMemo(() => hiddenSummary(live, visible), [live, visible]);
  const counted = live.filter((line) => line.quantity !== null).length;
  const filtering = !isEmptySelection(selection);

  const status = sending
    ? SAVING
    : queue.length > 0
      ? changesNotSaved(queue.length)
      : ALL_CHANGES_SAVED;

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>): void => {
      // With JavaScript, *Save now* and the Enter key flush the queue; the form is never
      // posted to the page URL (008 AC-11, AC-16). React skips a form action whose submit
      // event was already default-prevented.
      event.preventDefault();
      void flush();
    },
    [flush],
  );

  const handleFocus = useCallback((event: FocusEvent<HTMLInputElement>): void => {
    // The on-screen keyboard takes the bottom half of the phone; a focused row has to be
    // brought into what is left of the viewport (008 AC-30).
    event.currentTarget.scrollIntoView({ block: "center" });
  }, []);

  return (
    <>
      {/*
        STICKY TO THE TOP, NEVER THE BOTTOM. The keyboard occupies the bottom of a phone,
        and a bar there would cover the row being typed into (008 AC-30).
      */}
      <div
        data-testid="entry-status"
        className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-300 bg-white px-4 py-2 sm:-mx-6 sm:px-6"
      >
        <span data-testid="counted-summary" className="text-sm font-medium text-slate-800">
          {countedSummary(counted, lines.length)}
        </span>
        <span data-testid="save-status" className="text-sm text-slate-700">
          {status}
        </span>
        {failed ? (
          <button
            type="button"
            data-testid="retry-now"
            onClick={retryNow}
            className="inline-flex min-h-11 min-w-11 items-center rounded border border-slate-400 px-3 py-1 text-sm font-medium"
          >
            {RETRY_NOW}
          </button>
        ) : null}
      </div>

      {refusal === null && actionState.error === null ? null : (
        <p
          data-testid="save-error"
          role="alert"
          className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {refusal ?? actionState.error}
        </p>
      )}

      <EntryFilters
        action={path}
        facets={facets}
        selection={selection}
        onToggle={toggleFilter}
      />

      {filtering ? (
        <p className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
          <span data-testid="showing-summary">{showingSummary(visible.length, lines.length)}</span>
          {hidden.hidden > 0 ? (
            <span data-testid="filter-hiding" className="font-medium text-amber-900">
              {filtersHiding(hidden.hidden, hidden.hiddenUncounted)}
            </span>
          ) : null}
          <a
            data-testid="clear-filters"
            href={path}
            onClick={clearFilters}
            className="inline-flex min-h-11 min-w-11 items-center underline underline-offset-2"
          >
            {CLEAR_FILTERS}
          </a>
        </p>
      ) : null}

      {/*
        A REAL FORM, and it is the whole no-JavaScript path (008 AC-16). Its action is the
        server action, which calls the same `saveQuantities` the JSON endpoint calls.
      */}
      <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input type="hidden" name="countId" value={countId} />

        {visible.length === 0 ? (
          <p
            data-testid="no-matching-lines"
            className="rounded border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
          >
            {NO_MATCHING_LINES}
          </p>
        ) : null}

        {/*
          A STACKED LIST RATHER THAN A TABLE, and AC-30 is the reason rather than taste. A
          five-column row cannot fit 320 CSS px without the document scrolling sideways,
          and a counting screen whose rows have to be scrolled horizontally to be read is
          the screen that gets abandoned for paper. Each line is one list item: what it is
          on one line, and the number, the shortcut and the state on the next.
        */}
        <ul data-testid="count-lines" className="flex w-full flex-col">
          {visible.map((line) => {
            const state = rowStates[line.itemId] ?? "saved";
            const sentence = rowErrors[line.itemId] ?? null;
            const forRow =
              sentence ?? (actionState.itemId === line.itemId ? actionState.error : null);

            return (
              <li
                key={line.itemId}
                // The anchor #9's uncounted list points at: `/stock-entry/counts/<id>#line-
                // <itemId>`, with no query string, so a filtered view is not what a person
                // comes back to and the row is guaranteed to be rendered (009 AC-4).
                id={`line-${line.itemId}`}
                data-testid="count-line"
                data-item-id={line.itemId}
                data-counted={line.quantity === null ? "false" : "true"}
                data-save-state={state}
                className="flex scroll-mt-4 flex-col gap-1 border-b border-slate-200 py-2"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 break-words text-sm font-medium">
                    {line.description}
                  </span>
                  <span className="shrink-0 text-xs text-slate-600">
                    {line.unitLabel ?? NO_UNIT}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    data-testid="count-quantity"
                    className="flex flex-wrap items-center gap-2 text-sm text-slate-600"
                  >
                    {/*
                      NOT `type="number"`: a scroll gesture over a focused number input
                      changes it, which on a phone in a yard is a silently wrong count.
                      `inputmode="decimal"` is what offers the numeric keypad (AC-30).
                    */}
                    <input
                      data-testid="quantity-input"
                      name={quantityFieldName(line.itemId)}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      enterKeyHint="next"
                      aria-label={line.description}
                      value={typed[line.itemId] ?? ""}
                      onChange={(event) => {
                        edit(line.itemId, event.target.value, false);
                      }}
                      onBlur={() => void flush()}
                      onFocus={handleFocus}
                      className="min-h-11 w-20 rounded border border-slate-400 px-2 py-2 text-right text-base"
                    />
                    {line.quantity === null ? (
                      <span data-testid="not-counted">{NOT_COUNTED}</span>
                    ) : null}
                  </span>

                  {/*
                    `tabIndex={-1}` deliberately: AC-30 requires the 82nd input to be
                    reachable by pressing Tab from the 81st, and this control is a
                    redundant shortcut for typing `0` rather than a step in the path.
                  */}
                  <button
                    type="button"
                    data-testid="none-held"
                    tabIndex={-1}
                    onClick={() => {
                      noneHeld(line.itemId);
                    }}
                    className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded border border-slate-400 px-3 py-2 text-sm"
                  >
                    {NONE_HELD}
                  </button>

                  {state === "error" ? (
                    <span data-testid="row-save-state" className="text-sm text-red-700">
                      {NOT_SAVED}
                    </span>
                  ) : null}
                  {state === "saving" ? (
                    <span data-testid="row-save-state" className="text-sm text-slate-600">
                      {SAVING}
                    </span>
                  ) : null}
                </div>

                {forRow === null ? null : (
                  <span
                    data-testid="row-error"
                    role="alert"
                    className="text-sm font-medium text-red-700"
                  >
                    {forRow}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <button
          type="submit"
          data-testid="save-now"
          className="inline-flex min-h-11 min-w-11 items-center self-start rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          {SAVE_NOW}
        </button>
      </form>
    </>
  );
}
