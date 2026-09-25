import * as React from "react";
import { renderToString } from "react-dom/server";
import { prerender } from "react-dom/static";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * `React` on `globalThis` for the classic JSX transform Vitest falls back to — the reason is
 * written out in `src/app/analysis/page.test.ts`. The gate's `<>{children}</>` needs it.
 */
(globalThis as { React?: typeof React }).React = React;

type FakeDocument = {
  readyState: string;
  /** Waiting for `DOMContentLoaded`. */
  listeners: (() => void)[];
  /** Waiting for `readystatechange`. */
  readyStateListeners: (() => void)[];
  addEventListener: (type: string, listener: () => void) => void;
};

/** A document at a given readiness, recording who waits for which event. */
function fakeDocument(readyState: string): FakeDocument {
  const fake: FakeDocument = {
    readyState,
    listeners: [],
    readyStateListeners: [],
    addEventListener: (type, listener) => {
      if (type === "DOMContentLoaded") fake.listeners.push(listener);
      if (type === "readystatechange") fake.readyStateListeners.push(listener);
    },
  };
  (globalThis as { document?: unknown }).document = fake;
  return fake;
}

/** A fresh module each time: the gate keeps one promise for the life of a page. */
async function freshGate(): Promise<typeof import("./HydrationGate").HydrationGate> {
  vi.resetModules();
  return (await import("./HydrationGate")).HydrationGate;
}

/** Shaped like a real page: adjacent text children (a `<!-- -->`) and a server form field. */
function page(): React.ReactElement {
  return React.createElement(
    "main",
    { className: "p-4" },
    React.createElement("p", null, "Quantity", " ", 3),
    React.createElement(
      "form",
      null,
      React.createElement("input", { type: "hidden", name: "countId", defaultValue: "c1" }),
    ),
  );
}

async function prerendered(element: React.ReactElement): Promise<string> {
  const { prelude } = await prerender(element);
  return new Response(prelude).text();
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document;
});

describe("HydrationGate", () => {
  it("renders exactly its children on the server, text separators and all", async () => {
    const HydrationGate = await freshGate();
    const gated = renderToString(React.createElement(HydrationGate, null, page()));

    expect(gated).toBe(renderToString(page()));
    // Non-vacuity: the page really does carry what a regeneration used to lose.
    expect(gated).toContain("<!-- -->");
    expect(gated).toContain('name="countId"');
  });

  it("while the document is still loading, waits for DOMContentLoaded and then renders its children", async () => {
    const document = fakeDocument("loading");
    const HydrationGate = await freshGate();

    let settled = false;
    const rendering = prerendered(React.createElement(HydrationGate, null, page())).then(
      (html) => {
        settled = true;
        return html;
      },
    );

    // Nothing but the event can end the wait, so after a while it has still not ended.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(settled).toBe(false);
    expect(document.listeners).toHaveLength(1);

    document.readyState = "interactive";
    for (const listener of document.listeners) listener();

    expect(await rendering).toBe(await prerendered(page()));
  });

  it.each([
    ["interactive", "the parser reached the end of the document"],
    ["complete", "a parse aborted by Stop or window.stop(), which fires no DOMContentLoaded"],
  ])(
    "while loading, readyState becoming %s ends the wait on its own: %s",
    async (readyState) => {
      const document = fakeDocument("loading");
      const HydrationGate = await freshGate();

      let settled = false;
      const rendering = prerendered(React.createElement(HydrationGate, null, page())).then(
        (html) => {
          settled = true;
          return html;
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(settled).toBe(false);
      expect(document.readyStateListeners).toHaveLength(1);

      // The event alone is not the signal: a document still loading keeps the gate shut.
      for (const listener of document.readyStateListeners) listener();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(settled).toBe(false);

      document.readyState = readyState;
      for (const listener of document.readyStateListeners) listener();

      // Bounded, so a gate that stays shut fails on this assertion rather than on the clock.
      const stillWaiting = new Promise<string>((resolve) =>
        setTimeout(() => resolve("still waiting"), 1_000),
      );
      expect(await Promise.race([rendering, stillWaiting])).toBe(await prerendered(page()));
    },
  );

  it("once the document is parsed, waits for nothing", async () => {
    const document = fakeDocument("interactive");
    const HydrationGate = await freshGate();

    expect(await prerendered(React.createElement(HydrationGate, null, page()))).toBe(
      await prerendered(page()),
    );
    expect(document.listeners).toHaveLength(0);
    expect(document.readyStateListeners).toHaveLength(0);
  });
});
