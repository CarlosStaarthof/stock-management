import { expect, test } from "@playwright/test";
import type { Page, Request } from "@playwright/test";

import {
  ALL_CHANGES_SAVED,
  NOT_SAVED,
  RETRY_NOW,
  SAVE_HAS_NO_EDITS,
  changesNotSaved,
} from "@/lib/count-messages";
import { QUEUE_KEY } from "@/lib/entry-queue";

import { seededMasterCounts } from "./support/item-master";
import { databaseIsReachable, skipWithoutDatabase } from "./support/database";
import {
  RESERVED_YEAR,
  clearReservedYear,
  createdByIdOf,
  quantitiesByItem,
  quantityOf,
  realCountIds,
  seedCountWithLines,
} from "./support/stock-entry";
import { createTestUser, removeUser, signIn } from "./support/users";
import type { TestUser } from "./support/users";

/**
 * Spec 008's autosave: the debounce, the batch, the failure, the offline queue and the
 * reload — plus the endpoint's own contract over real HTTP.
 *
 * LOSING SIGNAL IS THE NORMAL CASE HERE, NOT THE EDGE CASE. `docs/conventions.md`: *"The
 * yard has bad signal — never lose a user's typed count."* Every failure test below
 * asserts the RECOVERY as well as the failure, because a screen that says `Not saved`
 * forever is a screen that lost the count politely.
 *
 * Two criteria need real HTTP and can be asserted nowhere else: the `405` on an
 * unexported method, which is Next's own answer rather than a handler of ours, and the
 * `401` a signed-out `POST` gets instead of the `307` the page gets.
 *
 * This file owns reserved year 2097 and deletes only that year.
 */
const YEAR = RESERVED_YEAR.autosave;

const created: string[] = [];
let realCountsBefore: string[] = [];
let masterBefore: Awaited<ReturnType<typeof seededMasterCounts>>;

test.beforeEach(async ({}, testInfo) => {
  await skipWithoutDatabase(testInfo);
});

test.beforeAll(async () => {
  if (!(await databaseIsReachable())) return;

  realCountsBefore = await realCountIds();
  masterBefore = await seededMasterCounts();
  await clearReservedYear(YEAR);
});

test.afterAll(async () => {
  if (!(await databaseIsReachable())) return;

  await clearReservedYear(YEAR);
  for (const username of created.splice(0)) {
    await removeUser(username);
  }

  expect(await realCountIds()).toEqual(realCountsBefore);
  expect(await seededMasterCounts()).toEqual(masterBefore);
});

async function newUser(role: "YARD_STAFF" | "ADMIN" = "YARD_STAFF"): Promise<TestUser> {
  const user = await createTestUser(role, `stock-entry-autosave-${role.toLowerCase()}`);
  created.push(user.username);
  return user;
}

async function freshCount(
  createdById: string,
  month: number,
): Promise<{ countId: string; lineCount: number }> {
  return seedCountWithLines({
    locationCode: "DUBLIN",
    year: YEAR,
    month,
    countDate: `${String(YEAR)}-${String(month).padStart(2, "0")}-10`,
    createdById,
  });
}

type Edit = { itemId: string; quantity: string | null };
type Post = { at: number; edits: Edit[] };

/** Every save this page sends, with its body and the moment it went. */
function recordPosts(page: Page): Post[] {
  const posts: Post[] = [];

  page.on("request", (request: Request) => {
    if (request.method() !== "POST") return;
    if (!request.url().includes("/api/counts/")) return;

    const raw = request.postData();
    const body = raw === null ? { edits: [] } : (JSON.parse(raw) as { edits: Edit[] });
    posts.push({ at: Date.now(), edits: body.edits });
  });

  return posts;
}

async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId("save-status")).toHaveText(ALL_CHANGES_SAVED, {
    timeout: 20_000,
  });
}

/** The ids of the first `count` rows, in the order they are rendered. */
async function itemIdsOnPage(page: Page, count: number): Promise<string[]> {
  const rows = page.getByTestId("count-line");
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    ids.push((await rows.nth(index).getAttribute("data-item-id")) as string);
  }
  return ids;
}

test("AC-1: a signed-out POST is a JSON 401, while the page for the same session is a 307", async ({
  request,
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 1);
  const before = await quantitiesByItem(countId);
  const [itemId] = [...before.keys()];

  // No cookies at all: the `request` fixture is its own context.
  const refused = await request.post(`/api/counts/${countId}/lines`, {
    data: { edits: [{ itemId, quantity: "1" }] },
    maxRedirects: 0,
  });

  // A 307 to an HTML sign-in form is not something a `fetch` in a save loop can use, and
  // following it would turn a refusal into a 200 carrying a login page.
  expect(refused.status()).toBe(401);
  expect(refused.headers()["content-type"]).toContain("application/json");
  expect(await refused.json()).toEqual({ error: "Unauthorized" });
  expect(refused.headers().location).toBeUndefined();
  expect(await quantitiesByItem(countId)).toEqual(before);

  // The PAGE, for the same signed-out session, still redirects — the endpoint is outside
  // the middleware's matcher and the page is inside it.
  const pagePath = `/stock-entry/counts/${countId}`;
  const redirected = await request.get(pagePath, { maxRedirects: 0 });
  expect([302, 307]).toContain(redirected.status());
  expect(redirected.headers().location).toContain(
    `/sign-in?callbackUrl=${encodeURIComponent(pagePath)}`,
  );

  // And signed in, the same POST is accepted.
  await signIn(page, staff);
  const accepted = await page.request.post(`/api/counts/${countId}/lines`, {
    data: { edits: [{ itemId, quantity: "1" }] },
  });
  expect(accepted.status()).toBe(200);
});

test("AC-10, AC-27: the endpoint's contract, on real HTTP", async ({ page }) => {
  const staff = await newUser();
  const { countId, lineCount } = await freshCount(staff.id, 2);
  const ids = [...(await quantitiesByItem(countId)).keys()];
  const url = `/api/counts/${countId}/lines`;

  await signIn(page, staff);

  const body = { edits: [{ itemId: ids[0], quantity: "12.5" }, { itemId: ids[1], quantity: null }] };
  const response = await page.request.post(url, { data: body });

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");

  const saved = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(saved).sort()).toEqual([
    "countId",
    "countedLineCount",
    "lineCount",
    "saved",
    "uncountedLineCount",
  ]);
  // `saved` is READ BACK after the write, not copied from the request.
  expect(saved.saved).toEqual(body.edits);
  expect(saved.lineCount).toBe(lineCount);
  expect(Number(saved.countedLineCount) + Number(saved.uncountedLineCount)).toBe(lineCount);
  expect(await quantityOf(countId, ids[0])).toBe("12.5");
  expect(await quantityOf(countId, ids[1])).toBeNull();

  // The identical body twice is the identical answer, and the database is identical after.
  const again = await page.request.post(url, { data: body });
  expect(await again.json()).toEqual(saved);
  const after = await quantitiesByItem(countId);
  const thrice = await page.request.post(url, { data: body });
  expect(thrice.status()).toBe(200);
  expect(await quantitiesByItem(countId)).toEqual(after);

  // Seven refusals, each a 400 with a sentence and each writing nothing.
  const tooMany = Array.from({ length: 201 }, () => ({ itemId: ids[0], quantity: "1" }));
  const refusals: unknown[] = [
    "not an object",
    { edits: "not an array" },
    { edits: [] },
    { edits: tooMany },
    { edits: [{ itemId: 7, quantity: "1" }] },
    { edits: [{ itemId: ids[0], quantity: 1 }] },
    { edits: [{ itemId: ids[0], quantity: "1" }], role: "ADMIN" },
  ];

  for (const refused of refusals) {
    const answer = await page.request.post(url, { data: refused as object });
    const text = await answer.text();

    expect(answer.status(), JSON.stringify(refused)).toBe(400);
    expect(((await answer.json()) as { error: string }).error.length).toBeGreaterThan(0);
    // AC-27: no driver or Postgres string reaches a JSON body, ever.
    expect(text).not.toMatch(/prisma|PrismaClient|invalid `?prisma|22003|numeric field overflow/i);
    expect(await quantitiesByItem(countId)).toEqual(after);
  }
  expect(
    ((await (await page.request.post(url, { data: { edits: [] } })).json()) as { error: string })
      .error,
  ).toBe(SAVE_HAS_NO_EDITS);

  // A count that does not exist, and a line that is not on this count: both 404.
  //
  // The BODY of a 404 is #3's generic `Not Found`, not the domain sentence: `errorResponse`
  // flattens every `NotFoundError` that way and is byte-identical after this feature
  // (008 AC-27). The sentences themselves — `That count no longer exists.` and `That item
  // is not on this count.` — are asserted on the service, in
  // `src/server/counts/count-entry-service.db.test.ts`, and on the page.
  const missing = await page.request.post("/api/counts/doesnotexist/lines", {
    data: { edits: [{ itemId: ids[0], quantity: "1" }] },
  });
  expect(missing.status()).toBe(404);
  expect(Object.keys((await missing.json()) as object)).toEqual(["error"]);
  expect(await quantitiesByItem(countId)).toEqual(after);

  const strayLine = await page.request.post(url, {
    data: { edits: [{ itemId: "not-on-this-count", quantity: "1" }] },
  });
  expect(strayLine.status()).toBe(404);
  // The whole batch is refused: a client that sent one bad id has a bug, not a stale row.
  expect(await quantitiesByItem(countId)).toEqual(after);

  // A GET, PUT or DELETE on the same path is a 405 — Next's own answer to a method the
  // route module does not export, which is why it can only be asserted over real HTTP.
  expect((await page.request.get(url)).status()).toBe(405);
  expect((await page.request.put(url, { data: body })).status()).toBe(405);
  expect((await page.request.delete(url)).status()).toBe(405);
});

test("AC-19: nothing a client sets can change who is saving", async ({ page, context, baseURL }) => {
  const staff = await newUser();
  const admin = await newUser("ADMIN");
  const { countId } = await freshCount(staff.id, 3);
  const url = `/api/counts/${countId}/lines`;
  const ids = [...(await quantitiesByItem(countId)).keys()];

  await signIn(page, staff);
  await context.addCookies([{ name: "role", value: "ADMIN", url: baseURL as string }]);
  const headers = { "x-user-role": "ADMIN" };

  // The page, claiming ADMIN in every way a request can: still the staff shape.
  const shown = await page.request.get(`/stock-entry/counts/${countId}?role=ADMIN`, { headers });
  const shownBody = await shown.text();
  expect(shown.status()).toBe(200);
  expect(shownBody).not.toContain("no price recorded");
  expect(shownBody).not.toContain("€");

  // The POST, with the query string, the header and the cookie: byte-identical answers.
  const clean = await page.request.post(url, {
    data: { edits: [{ itemId: ids[0], quantity: "3" }] },
  });
  const claimed = await page.request.post(`${url}?role=ADMIN`, {
    headers,
    data: { edits: [{ itemId: ids[0], quantity: "3" }] },
  });
  expect(claimed.status()).toBe(clean.status());
  expect(await claimed.json()).toEqual(await clean.json());

  // The BODY variant is refused outright rather than honoured: AC-10's strict schema
  // answers an unknown key with a 400, which is the stronger of the two guarantees.
  const forged = await page.request.post(url, {
    headers,
    data: { edits: [{ itemId: ids[0], quantity: "9" }], role: "ADMIN", userId: admin.id },
  });
  expect(forged.status()).toBe(400);
  expect(await quantityOf(countId, ids[0])).toBe("3");

  // And no row's creator moved.
  expect(await createdByIdOf(countId)).toBe(staff.id);
});

test("AC-11: autosave fires on the events a counter produces, and not on every keystroke", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 4);

  await signIn(page, staff);
  const posts = recordPosts(page);
  await page.goto(`/stock-entry/counts/${countId}`);

  const rows = page.getByTestId("count-line");

  // Typing and waiting out the debounce: exactly one POST for four keystrokes.
  await rows.nth(0).getByTestId("quantity-input").pressSequentially("12.5");
  await page.waitForTimeout(1_000);
  expect(posts).toHaveLength(1);
  expect(posts[0].edits).toHaveLength(1);
  await settled(page);

  // Typing and blurring BEFORE the debounce elapses: the blur flushes and cancels the
  // timer. It does not double-send.
  posts.length = 0;
  const second = rows.nth(1).getByTestId("quantity-input");
  await second.pressSequentially("7.25");
  await second.blur();
  await settled(page);
  await page.waitForTimeout(1_200);
  expect(posts).toHaveLength(1);

  // Focusing and blurring with no change: nothing at all.
  posts.length = 0;
  const third = rows.nth(2).getByTestId("quantity-input");
  await third.focus();
  await third.blur();
  await page.waitForTimeout(1_200);
  expect(posts).toEqual([]);

  // A flush sends every PENDING edit in one batch. The first request is held for a second
  // so the batching is the mechanism under test rather than a race with Neon's latency.
  posts.length = 0;
  let held = 0;
  await page.route("**/api/counts/*/lines", async (route) => {
    held += 1;
    if (held === 1) await new Promise((resolve) => setTimeout(resolve, 1_000));
    await route.continue();
  });

  const ids: string[] = [];
  for (let index = 3; index < 9; index += 1) {
    const row = rows.nth(index);
    ids.push((await row.getAttribute("data-item-id")) as string);
    await row.getByTestId("quantity-input").fill(String(index));
  }
  await rows.nth(8).getByTestId("quantity-input").blur();
  await settled(page);

  expect(posts.length).toBeLessThanOrEqual(2);
  expect(posts.reduce((sum, post) => sum + post.edits.length, 0)).toBe(6);
  for (const [offset, itemId] of ids.entries()) {
    expect(await quantityOf(countId, itemId)).toBe(String(offset + 3));
  }
  await page.unroute("**/api/counts/*/lines");

  // A flush is attempted on `pagehide` and on `visibilitychange` to hidden, without
  // waiting out the debounce.
  posts.length = 0;
  await rows.nth(10).getByTestId("quantity-input").fill("2");
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => posts.length, { timeout: 3_000 }).toBe(1);
  await settled(page);

  posts.length = 0;
  await rows.nth(11).getByTestId("quantity-input").fill("3");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  await expect.poll(() => posts.length, { timeout: 3_000 }).toBe(1);
  await settled(page);
});

test("AC-12: one row's response never rewrites another row's input", async ({ page }) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 5);

  await signIn(page, staff);
  await page.route("**/api/counts/*/lines", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.continue();
  });
  await page.goto(`/stock-entry/counts/${countId}`);

  const rows = page.getByTestId("count-line");
  const [itemA, itemB] = await itemIdsOnPage(page, 2);
  const inputA = rows.nth(0).getByTestId("quantity-input");
  const inputB = rows.nth(1).getByTestId("quantity-input");

  await inputA.fill("10");
  await inputA.blur();
  await expect(rows.nth(0)).toHaveAttribute("data-save-state", "saving");

  // B is typed WHILE A's request is in flight.
  await inputB.fill("20");
  await inputB.blur();

  // No input is ever disabled or read-only while the page is editable: a counter who
  // cannot type while the phone is talking to Neon is a counter who stops.
  expect(
    await page.evaluate(
      () =>
        document.querySelectorAll(
          '[data-testid="quantity-input"]:disabled, [data-testid="quantity-input"][readonly]',
        ).length,
    ),
  ).toBe(0);

  await settled(page);
  await expect(inputA).toHaveValue("10");
  await expect(inputB).toHaveValue("20");
  expect(await quantityOf(countId, itemA)).toBe("10");
  expect(await quantityOf(countId, itemB)).toBe("20");

  // The same row twice: a server value is applied only when no newer local edit exists.
  await inputA.fill("11");
  await inputA.blur();
  await expect(rows.nth(0)).toHaveAttribute("data-save-state", "saving");
  await inputA.fill("12");
  await inputA.blur();

  await settled(page);
  await expect(inputA).toHaveValue("12");
  expect(await quantityOf(countId, itemA)).toBe("12");

  await page.unroute("**/api/counts/*/lines");
});

test("AC-13, AC-27: a failed save keeps the number, backs off, and drains when the route recovers", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 6);

  await signIn(page, staff);
  const posts = recordPosts(page);

  let failing = true;
  await page.route("**/api/counts/*/lines", async (route) => {
    if (!failing) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Something went wrong" }),
    });
  });

  const navigations: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  await page.goto(`/stock-entry/counts/${countId}`);
  const startedAt = page.url();
  // A marker on THIS JavaScript context. A `location.reload()` builds a new one, so the
  // marker is how "the failure path never reloads" is proved rather than asserted.
  await page.evaluate(() => {
    Object.assign(globalThis, { __macroadsNeverReloaded: true });
  });

  const rows = page.getByTestId("count-line");
  const ids = await itemIdsOnPage(page, 3);

  for (const [index, typedValue] of ["1", "2", "3"].entries()) {
    const input = rows.nth(index).getByTestId("quantity-input");
    await input.fill(typedValue);
    await input.blur();
  }

  // The three values are still on the screen, each row says so, and the header counts them.
  for (const [index, typedValue] of ["1", "2", "3"].entries()) {
    await expect(rows.nth(index).getByTestId("quantity-input")).toHaveValue(typedValue);
    await expect(rows.nth(index)).toHaveAttribute("data-save-state", "error");
    await expect(rows.nth(index).getByTestId("row-save-state")).toHaveText(NOT_SAVED);
  }
  await expect(page.getByTestId("save-status")).toHaveText(changesNotSaved(3));
  await expect(page.getByTestId("retry-now")).toHaveAccessibleName(RETRY_NOW);

  // The retries are automatic and they back off: three of them inside eight seconds, with
  // the gap growing each time rather than hammering a server that is already unwell.
  //
  // The attempt counter is one per QUEUE rather than one per row, so after three blurred
  // failures the schedule is already several steps into `RETRY_BACKOFF_MS` — which is the
  // point of a backoff and not a defect. What is asserted is therefore the shape: more
  // attempts arrive with no user action at all, and each waits longer than the last.
  const before = posts.length;
  await expect.poll(() => posts.length, { timeout: 20_000 }).toBeGreaterThanOrEqual(before + 2);
  const gaps = posts
    .slice(before - 1)
    .map((post, index, all) => (index === 0 ? 0 : post.at - all[index - 1].at))
    .slice(1);
  expect(gaps.length).toBeGreaterThanOrEqual(2);
  expect(gaps[0]).toBeGreaterThanOrEqual(900);
  expect(gaps[1]).toBeGreaterThan(gaps[0]);

  // *Retry now* sends immediately rather than waiting out the current backoff.
  const beforeRetry = posts.length;
  await page.getByTestId("retry-now").click();
  await expect.poll(() => posts.length, { timeout: 1_500 }).toBeGreaterThan(beforeRetry);

  // Nothing has been lost, nothing has been reloaded, nothing has navigated. The address
  // never changed, the document was never rebuilt, and the queue still holds all three.
  expect(new Set(navigations)).toEqual(new Set([startedAt]));
  expect(page.url()).toBe(startedAt);
  expect(
    await page.evaluate(() => "__macroadsNeverReloaded" in globalThis),
    "the failure path reloaded the document",
  ).toBe(true);
  await expect(page.getByTestId("save-status")).toHaveText(changesNotSaved(3));

  // When the route stops failing the three edits go in ONE batch.
  const beforeRecovery = posts.length;
  failing = false;
  await page.getByTestId("retry-now").click();
  await settled(page);

  const drained = posts.slice(beforeRecovery);
  expect(drained[0].edits).toHaveLength(3);
  for (const [index, typedValue] of ["1", "2", "3"].entries()) {
    expect(await quantityOf(countId, ids[index])).toBe(typedValue);
    await expect(rows.nth(index)).toHaveAttribute("data-save-state", "saved");
  }
  await expect(page.getByTestId("retry-now")).toHaveCount(0);

  // AC-27: the screen never shows a driver or a Postgres string.
  const shown = await page.content();
  expect(shown).not.toMatch(/prisma|PrismaClient|22003|numeric field overflow/i);
  await page.unroute("**/api/counts/*/lines");
});

test("AC-13: an aborted connection is the same answer, and it recovers the same way", async ({
  page,
}) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 7);

  await signIn(page, staff);
  let aborting = true;
  await page.route("**/api/counts/*/lines", async (route) => {
    if (aborting) await route.abort("connectionfailed");
    else await route.continue();
  });

  await page.goto(`/stock-entry/counts/${countId}`);
  const rows = page.getByTestId("count-line");
  const [itemId] = await itemIdsOnPage(page, 1);

  const input = rows.nth(0).getByTestId("quantity-input");
  await input.fill("21.6128");
  await input.blur();

  await expect(rows.nth(0)).toHaveAttribute("data-save-state", "error");
  await expect(input).toHaveValue("21.6128");
  await expect(page.getByTestId("save-status")).toHaveText(changesNotSaved(1));

  aborting = false;
  await page.getByTestId("retry-now").click();
  await settled(page);

  // Full precision, all the way from the input to Postgres and back.
  expect(await quantityOf(countId, itemId)).toBe("21.6128");
  await expect(input).toHaveValue("21.6128");
  await page.unroute("**/api/counts/*/lines");
});

test("AC-14: signal drops in a yard, and the count survives it", async ({ browser }) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 8);

  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, staff);
  const posts = recordPosts(page);
  await page.goto(`/stock-entry/counts/${countId}`);

  const rows = page.getByTestId("count-line");
  const ids = await itemIdsOnPage(page, 3);

  await context.setOffline(true);
  for (const [index, typedValue] of ["4", "5", "6"].entries()) {
    const input = rows.nth(index).getByTestId("quantity-input");
    await input.fill(typedValue);
    await input.blur();
  }

  for (const [index, typedValue] of ["4", "5", "6"].entries()) {
    await expect(rows.nth(index).getByTestId("quantity-input")).toHaveValue(typedValue);
    await expect(rows.nth(index)).toHaveAttribute("data-save-state", "error");
  }
  await expect(page.getByTestId("save-status")).toHaveText(changesNotSaved(3));

  // A row edited TWICE while offline: the wire never carries the value already replaced.
  await rows.nth(2).getByTestId("quantity-input").fill("60");
  await rows.nth(2).getByTestId("quantity-input").blur();
  await expect(page.getByTestId("save-status")).toHaveText(changesNotSaved(3));

  // Back in signal, and with NO further user action at all.
  const before = posts.length;
  await context.setOffline(false);
  await expect(page.getByTestId("save-status")).toHaveText(ALL_CHANGES_SAVED, { timeout: 2_000 });

  const sent = posts.slice(before);
  expect(sent.length).toBeGreaterThan(0);
  const perItem = new Map<string, (string | null)[]>();
  for (const post of sent) {
    for (const edit of post.edits) {
      perItem.set(edit.itemId, [...(perItem.get(edit.itemId) ?? []), edit.quantity]);
    }
  }
  // The LATEST value only, once: the queue is keyed by `itemId`.
  expect(perItem.get(ids[2])).toEqual(["60"]);

  expect(await quantityOf(countId, ids[0])).toBe("4");
  expect(await quantityOf(countId, ids[1])).toBe("5");
  expect(await quantityOf(countId, ids[2])).toBe("60");

  await context.close();
});

test("AC-15: a reload does not lose ten minutes of typing", async ({ page }) => {
  const staff = await newUser();
  const { countId } = await freshCount(staff.id, 9);

  await signIn(page, staff);
  await page.goto(`/stock-entry/counts/${countId}`);

  // One value that the server DOES take, so the reload has something of its own to render.
  const rows = page.getByTestId("count-line");
  const ids = await itemIdsOnPage(page, 4);
  await rows.nth(3).getByTestId("quantity-input").fill("99");
  await rows.nth(3).getByTestId("quantity-input").blur();
  await settled(page);

  // After a successful save the stored queue is empty, read from `localStorage` directly.
  const emptied = await page.evaluate((key) => window.localStorage.getItem(key), QUEUE_KEY);
  expect(JSON.parse(emptied ?? '{"edits":[]}')).toMatchObject({ edits: [] });

  let aborting = true;
  await page.route("**/api/counts/*/lines", async (route) => {
    if (aborting) await route.abort("connectionfailed");
    else await route.continue();
  });

  for (const [index, typedValue] of ["7", "8", "9"].entries()) {
    const input = rows.nth(index).getByTestId("quantity-input");
    await input.fill(typedValue);
    await input.blur();
  }
  await expect(page.getByTestId("save-status")).toHaveText(changesNotSaved(3));

  await page.reload();

  // The server's values AND the three queued edits re-applied over them.
  await expect(page.getByTestId("count-line").nth(3).getByTestId("quantity-input")).toHaveValue(
    "99",
  );
  for (const [index, typedValue] of ["7", "8", "9"].entries()) {
    await expect(
      page.getByTestId("count-line").nth(index).getByTestId("quantity-input"),
    ).toHaveValue(typedValue);
    await expect(page.getByTestId("count-line").nth(index)).toHaveAttribute(
      "data-save-state",
      "error",
    );
  }
  await expect(page.getByTestId("save-status")).toHaveText(changesNotSaved(3));

  // Removing the route and pressing *Retry now* persists them.
  aborting = false;
  await page.getByTestId("retry-now").click();
  await settled(page);

  for (const [index, typedValue] of ["7", "8", "9"].entries()) {
    expect(await quantityOf(countId, ids[index])).toBe(typedValue);
  }
  expect(await quantityOf(countId, ids[3])).toBe("99");

  const afterwards = await page.evaluate((key) => window.localStorage.getItem(key), QUEUE_KEY);
  expect(JSON.parse(afterwards ?? '{"edits":[]}')).toMatchObject({ edits: [] });
  await page.unroute("**/api/counts/*/lines");
});
