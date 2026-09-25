"use client";

import { use } from "react";
import type { JSX, ReactNode } from "react";

/**
 * HOLDS HYDRATION UNTIL THE BROWSER HAS PARSED THE WHOLE DOCUMENT. It renders nothing of its
 * own: on the server it is its children, byte for byte, and after hydration it is its
 * children again. What it changes is WHEN React starts hydrating them.
 *
 * WHY, measured rather than guessed (`progress/impl_hydration_418.md`). React's Flight
 * server cuts a row once it passes 3,200 characters and sends every later element as a
 * separate row, referenced lazily from inside its parent element. The page's HTML carries
 * those rows as inline scripts AFTER `</main>`, and Next starts hydrating as soon as its
 * bootstrap script runs, which can be while the parser is still working through them. So
 * React meets a `<main>` or a `<tbody>` whose children are not all there yet, and suspends
 * inside that element. If the missing rows are parsed during the few milliseconds React
 * yields, React REPLAYS that element, and its replay of a host element does not rewind
 * the hydration cursor: it tries to claim the element's own first child as the element
 * itself, fails, and throws minified error #418. React then throws the server's markup away
 * and renders the tree again on the client, which drops every server-only artefact (the
 * `$ACTION_*` fields of progressive forms, the `<!-- -->` text separators) and costs a
 * second full render. On `/stock-entry/counts/[id]/summary` that happened on between one
 * load in thirty and one in eight, depending on how busy the machine was; it was also
 * measured on `/item-master`, `/item-master/yards/[code]` and `/stock-takes`, and it failed
 * 011 AC-18 on `/analysis`: every page large enough to be cut.
 *
 * Once the document is parsed, every row is already in the Flight client, so nothing inside
 * a host element can suspend on one and there is nothing to replay. Suspending HERE instead
 * is safe, because this is a function component: React replays it by calling it again,
 * which touches no DOM. The cost is none a user can see — a page cannot finish hydrating
 * before its last row arrives anyway. That holds because no protected page has a Suspense
 * boundary: a page that streamed slow content behind one would have its whole shell held
 * un-hydrated here until the stream ended.
 *
 * WHAT IT COVERS is the page's MODEL rows, the ones the parser delivers. A row blocked on a
 * client MODULE instead (a client component passed as a prop value under a host element, for
 * example the `error.tsx` of a future nested layout) could still be pending after parsing,
 * and could still be replayed. Nothing in today's tree does this: `src/app/layout.tsx` is the
 * only layout.
 *
 * It must stay above every element a page renders, which is why `src/app/layout.tsx` puts it
 * directly inside `<body>`, and `src/app/layout.test.ts` pins it there. `<html>` and `<body>`
 * themselves are safe: React re-resolves them from the document on a replay instead of from
 * the cursor.
 */
export function HydrationGate({ children }: { children: ReactNode }): JSX.Element {
  // `typeof document` is the server's answer: there is no document to wait for there, and
  // the server's HTML must be exactly the children. In the browser, "loading" is the one
  // readiness value that means the parser has not reached the end yet.
  if (typeof document !== "undefined" && document.readyState === "loading") {
    use(documentParsed());
  }

  return <>{children}</>;
}

let parsed: Promise<void> | null = null;

/**
 * One promise for the life of the page, so every render that asks waits on the same thing
 * (`use` must be handed a stable promise). It is created only while the document is still
 * loading, so the listeners are always registered before the events they wait for are fired.
 *
 * TWO WAYS OUT, because a parse can end without `DOMContentLoaded`. The parser leaving
 * "loading" is what the gate waits for, and `readystatechange` reports exactly that. A parse
 * that finishes normally reports it first, as "interactive", after the last inline script has
 * run. A parse that is ABORTED (the Stop button, `window.stop()`) jumps straight to "complete",
 * and the HTML standard's steps for aborting a parser fire no `DOMContentLoaded`, so a gate
 * listening for that event alone could wait for the rest of the page's life (a browser may
 * fire it anyway; the gate no longer depends on either). `DOMContentLoaded` stays as the
 * second way out. Resolving twice is harmless.
 */
function documentParsed(): Promise<void> {
  parsed ??= new Promise<void>((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    document.addEventListener("readystatechange", () => {
      if (document.readyState !== "loading") resolve();
    });
  });
  return parsed;
}
