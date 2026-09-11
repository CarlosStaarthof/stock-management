# Spec notes — #8 `stock_entry_ui`

Written 2026-09-11. Spec at `specs/features/008-stock_entry_ui.md`, 35 criteria, mirrored
verbatim into `feature_list.json` (`spec_status: draft`, `status: pending`).

## Sources read

`specs/product-brief.md`; `specs/domain-model.md` Parts 3 (Invariants 1, 2, 4, 5, 12), 4, 5
and 6; `specs/features/007-entry_start.md` in full, including its post-approval amendments;
006 AC-24, AC-30, AC-31, AC-32, AC-33, AC-34, AC-35; 003 AC-17, AC-19, AC-32; `docs/*`;
`CHECKPOINTS.md`; `progress/history.md` entries for #6, #7 and #20. Shipped code read rather
than assumed: `count-service.ts` (`getCount`), `count-shape.ts`, `item-assignment-service.ts`
(`listSheet`), `src/app/stock-entry/counts/[id]/page.tsx`, `actions.ts`, `form-state.ts`,
`count-messages.ts`, `src/types/stock-count.ts`, `money-boundary.ts`, `error-response.ts`,
`auth-config.ts`, `middleware.ts`, `playwright.config.ts`, `tests/e2e/support/stock-entry.ts`,
`prisma/schema.prisma`.

Nothing in `specs/domain-model.md § Still open` blocks this feature: Q7 and Q8 are M7 only.

## The eight things the brief said to settle, and what the spec says

1. **Autosave.** Debounce 800 ms, immediate on blur and on *None held*, batched, one
   transaction per request, flushed on `online`, `pagehide` and `visibilitychange`. Failure
   keeps the value in the input, marks the row and the header, retries with backoff
   (1/2/4/8/30 s) and offers *Retry now*. The pending queue is held in `localStorage` through
   a pure module (`src/lib/entry-queue.ts`) keyed by user **and** count, so a reload restores
   typed values and re-sends them. Two clobber traps are criteria in their own right (AC-12):
   a response for one row must not rewrite another row's input, and a stale response must not
   overwrite a newer local edit. AC-11 through AC-16.
2. **The money boundary.** Three facts: the page is role-shaped through `shapeForRole`; the
   new JSON endpoint has **one** shape for both roles because it carries no money at all; and
   there is **no running total for either role**, argued from Part 6, from Invariant 2 (a
   draft total could only use today's prices and would disagree with the count's own total
   after approval) and from the one-source-of-truth rule. The first total comes from
   `unitPriceSnapshot` written at `SUBMITTED` by #9, read by #9's summary and #11. The
   003 AC-19-shaped walk is applied to `getCount`, to `saveQuantities` and to the parsed body
   of the real HTTP response. AC-17, AC-18, AC-19.
3. **The three filters.** Facets built from the count's own lines; multi-select within a
   category, AND across; URL-persisted with repeated parameters and `history.replaceState`;
   server-applied on reload; `<noscript>` *Apply filters* for the no-JS path. The trap the
   user named has its own criterion: `Filters are hiding 70 items, 31 not counted.` plus
   `Showing 12 of 82 items` and *Clear filters*, and the progress line never moves when a
   filter does. AC-20 through AC-23.
4. **Which lines appear.** Part 5's table — count entry defaults to **all** items assigned to
   the yard. Pinned with no held-only toggle, no pagination and no virtualiser, asserted by
   counting inputs in one HTML response. AC-3.
5. **Progress.** "Counted" is `quantity IS NOT NULL`, `0` included; denominator is every line
   on the count; unaffected by filters; optimistic on typing, with AC-13's unsaved banner as
   the counterweight. AC-24.
6. **What #8 does not do.** #9 keeps submission, the signature, the snapshot and approval.
   **Adding an item mid-count is deferred** to its own feature after #9, alongside #15:
   both of Part 5's paths call `createItem` / `assignItemToLocation`, which 006 AC-4 and
   007 AC-14 keep ADMIN-only, so building it here would widen the role boundary inside the
   feature that must not lose a typed number. Per-line notes are out too.
7. **Phone-first.** 390 px and 320 px, no sideways scroll, ≥ 44 px targets,
   `inputmode="decimal"` rather than `type="number"` (numeric keypad, and a wheel gesture
   cannot change a value), sticky status bar at the **top** because the keyboard owns the
   bottom, focused input still in view at 390 × 380, and the 82nd input present on first
   paint and reachable by `Tab`. AC-30.
8. **No-database checks.** Five pure modules; AC-32 lists which criteria survive.

## Two shipped assertions this feature must change, named in criteria rather than discovered

- **007 AC-25's no-mutation scan** forbids `.update` on `stockCountLine` anywhere under
  `src/server/counts/**`. #8's whole job is one such update, so AC-28 narrows the scan to an
  exact one-file exemption (`count-entry-service.ts`), forbids every other mutation verb in
  it, and backs the "only `quantity` is written" claim with a column-by-column database
  comparison rather than a source read.
- **007 AC-24's "no input in the line list"**, asserted at
  `tests/e2e/stock-entry-start.spec.ts:228`. AC-35 replaces that one line and requires
  `git diff` on the file to show no other change; the neighbouring `Not counted` assertion
  stays green because an uncounted cell keeps that exact text.

No other shipped criterion is touched. `playwright.config.ts`, `middleware.ts`,
`auth-config.ts`, `error-response.ts`, the schema, the migrations and 006 AC-31's nine-file
`unitPrice` list are all asserted byte-identical or unchanged.

## Decisions taken rather than left open

Eight, listed in the spec's *Open questions* so the user can strike any of them: the deferred
inline add; blank input = not counted with no separate *Clear*; no running total; no per-row
*No price* tag (which also keeps 007 AC-17's admin clause true — this feature adds **no** new
money-shaped key); last write wins with no lock; facet counts over the whole count;
`replaceState` not `pushState`; and the two timing constants.

## Not verified, and worth the implementer checking first

Following #7's precedent — its implementer checked the spec's arithmetic before writing a
line and found two impossible criteria — these are the claims most worth re-deriving:

- That `POST /api/counts/<id>/lines` is genuinely outside `src/middleware.ts`'s matcher, so a
  signed-out `POST` returns JSON `401` and not a `307` (AC-1). Read from the matcher list; not
  executed.
- That a `<noscript>` submit control and a server action in the same form behave as AC-16 and
  AC-22 describe in this Next version.
- The exact identifier list AC-18 pins as an exact set; a name I have not foreseen (say
  `subtotal` in a Tailwind class) would make it red for the wrong reason.
