import { expect } from "@playwright/test";
import type { Browser, BrowserContext, Page } from "@playwright/test";

import { signIn } from "./users";
import type { TestUser } from "./users";

/**
 * The #418 regression check. Its test is in `tests/e2e/stock-entry-approve.spec.ts`, on
 * `/summary`, because that page needs a count and that file owns the reserved year to make
 * one. The mechanism and the measurements are in `progress/impl_hydration_418.md`; the fix
 * is `src/components/HydrationGate.tsx`.
 *
 * WHAT IS BEING CAUGHT. On some loads React failed to hydrate a large page, threw the
 * server's markup away and rendered the page again on the client: a second full render,
 * and the loss of everything only the server emits (the `$ACTION_*` fields of a progressive
 * form, React's `<!-- -->` text separators). The server's bytes were identical on failing and
 * passing loads — the cause was the ORDER in which the browser parsed the page and React
 * hydrated it — so one load proves nothing either way, and the page is loaded many times.
 *
 * WHY ONLY `/summary`. The failure was seen on every page large enough to trigger it, but a
 * load-count test is only worth having where the unfixed application can be watched failing
 * it. `/summary` failed 12 of 96 loads in that run; `/analysis`, `/item-master` and
 * `/stock-takes` failed none of 96 between them, so a test on them would have been green
 * either way. The gate is one component in the root layout, so every page gets the same fix.
 *
 * WHAT COUNTS AS A FAILED LOAD, and both are checked rather than either:
 *
 *   * an uncaught error in the page — Playwright's `pageerror`, and the same event recorded
 *     inside the page, so that one delivered late cannot miss the check; and
 *   * a `<main>` removed from `<body>` — the regeneration itself, seen directly, whatever
 *     React chose to report about it. A hydration that succeeds removes nothing there.
 *
 * "HYDRATION FINISHED" IS READ FROM REACT'S ROOT, not guessed with a sleep or `networkidle`.
 * The root React creates on `document` holds `isDehydrated: true` until the hydrated (or
 * regenerated) tree is committed, and React reports a hydration failure in that same commit.
 * If a future React renames the field, `hydrationCommitted` never becomes true and the test
 * fails on its timeout: loudly, and never by passing without having looked.
 */

/**
 * Per page, per test. A load costs about a second against the development database, most of
 * it the server's, and each test must stay inside the suite's 45 s.
 */
export const LOADS_PER_TEST = 14;

type Watch = { errors: string[]; mainsRemoved: number; watching: boolean };

/**
 * Installed before any page script runs, on every load: the page's uncaught errors, and
 * every `<main>` removed from `<body>`.
 */
function watchForRegeneration(): void {
  const watch: Watch = { errors: [], mainsRemoved: 0, watching: false };
  (window as unknown as { __hydrationWatch: Watch }).__hydrationWatch = watch;

  addEventListener("error", (event) => {
    watch.errors.push(String(event.message));
  });

  const bodyChildren = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node.nodeName === "MAIN") watch.mainsRemoved += 1;
      }
    }
  });

  // `<body>` does not exist yet when this runs, so watch the document only until it does,
  // then nothing but `<body>`'s own children: a whole-document observer would record every
  // node the parser inserts and change the very timing it is here to observe.
  const untilBody = new MutationObserver(() => {
    if (document.body === null) return;
    untilBody.disconnect();
    bodyChildren.observe(document.body, { childList: true });
    watch.watching = true;
  });
  untilBody.observe(document, { childList: true, subtree: true });
}

/** True once React has committed the tree it hydrated (or regenerated) on `document`. */
function hydrationCommitted(): boolean {
  type Root = { stateNode?: { current?: { memoizedState?: { isDehydrated?: boolean } } } };
  const holder = document as unknown as Record<string, Root | undefined>;
  const key = Object.keys(holder).find((name) => name.startsWith("__reactContainer$"));

  return (
    key !== undefined && holder[key]?.stateNode?.current?.memoizedState?.isDehydrated === false
  );
}

/**
 * `howMany` pages, each in its own context and signed in as `user`, every load on them
 * watched. The test loads them AT THE SAME TIME, and that is deliberate: the failure is a
 * race between the parser and React on the main thread, and it was seen most on a busy
 * machine. With the fix taken out, one page loading alone failed 3 of 96 loads; two pages
 * loading at once failed 20 of 168 (`progress/impl_hydration_418.md`). A phone in a yard is
 * rarely idle either. Only the first signs in through the form; the rest reuse its session.
 */
export async function openWatchedPages(
  browser: Browser,
  user: TestUser,
  howMany: number,
): Promise<{ contexts: BrowserContext[]; pages: Page[] }> {
  const first = await browser.newContext();
  await first.addInitScript(watchForRegeneration);
  const firstPage = await first.newPage();
  await signIn(firstPage, user);
  const session = await first.storageState();

  const contexts = [first];
  const pages = [firstPage];
  while (pages.length < howMany) {
    const context = await browser.newContext({ storageState: session });
    await context.addInitScript(watchForRegeneration);
    contexts.push(context);
    pages.push(await context.newPage());
  }

  return { contexts, pages };
}

/**
 * Loads `path` `LOADS_PER_TEST` times and returns one line for every load that failed, so
 * the assertion `toEqual([])` prints which page, which loads and what happened on them.
 */
export async function failedLoads(page: Page, path: string, label: string): Promise<string[]> {
  const failures: string[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  for (let load = 1; load <= LOADS_PER_TEST; load += 1) {
    pageErrors.length = 0;

    const response = await page.goto(path);
    // The page itself: a refusal or a sign-in redirect would hydrate cleanly and prove nothing.
    expect(response?.status(), path).toBe(200);
    expect(new URL(page.url()).pathname, path).toBe(path);

    await page.waitForFunction(hydrationCommitted);
    const watch = await page.evaluate(
      () => (window as unknown as { __hydrationWatch: Watch }).__hydrationWatch,
    );

    // Non-vacuity: the watcher was attached, so "nothing removed" is an observation.
    expect(watch.watching, `${path} load ${String(load)}: the watcher never attached`).toBe(true);

    const errors = [...new Set([...pageErrors, ...watch.errors])];
    if (errors.length > 0 || watch.mainsRemoved > 0) {
      failures.push(
        `${label}, load ${String(load)}: <main> removed ${String(watch.mainsRemoved)}x; ` +
          `errors: ${errors.join(" | ").slice(0, 160)}`,
      );
    }
  }

  return failures;
}
