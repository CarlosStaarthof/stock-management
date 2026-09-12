import type { QuantityEdit } from "@/types/stock-count";

/**
 * WHAT THE DEVICE IS HOLDING THAT THE SERVER HAS NOT TAKEN YET.
 *
 * `docs/conventions.md`: *"The yard has bad signal — never lose a user's typed count."*
 * Behind the shed a `fetch` fails, the phone may be reloaded, the browser may be killed by
 * the operating system to free memory — and none of those may cost a counter ten minutes
 * of typing. So every edit that has not been confirmed is written to `Storage` as well as
 * held in memory, and read back on the next render of the same count (008 AC-15).
 *
 * FOUR RULES, each with a criterion rather than a comment keeping it true.
 *
 *  1. IT IS PURE, AND IT IS TESTED WITH NO BROWSER. Every function takes the storage as an
 *     argument, over the three methods it actually uses, so 008 AC-15's first half runs in
 *     `npm run test:unit` on a machine with no Postgres and no Chromium (008 AC-32).
 *  2. A STORED QUEUE BELONGS TO ONE USER AND ONE COUNT. A shared yard phone is an ordinary
 *     thing, and re-applying one counter's unsent numbers to another counter's count would
 *     be worse than losing them. `userId` AND `countId` must both match or the stored queue
 *     is discarded rather than returned.
 *  3. IT EXPIRES. Seven days, because a number typed a week ago and never sent is no longer
 *     a fact about today's stock; re-applying it silently over what the server holds would
 *     be the second source of truth `docs/architecture.md` forbids.
 *  4. IT NEVER THROWS. Private browsing, a full disk and a storage quota all raise from
 *     `localStorage`, and a screen that cannot hold a queue must still let a person count.
 *     Every path catches, discards and returns an empty queue.
 *
 * IT IMPORTS NOTHING FROM `src/server/`, not even the error classes: it has no refusal to
 * make. That keeps `npm run lint`'s dependency fence green (006 AC-33, 008 AC-26).
 */

/** One key, because one device counts one count at a time. */
export const QUEUE_KEY = "macroads.stock-entry.queue";

/** Seven days. A number typed last week is not a fact about today's stock. */
export const QUEUE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Exactly what is written under `QUEUE_KEY` (008 AC-15). */
export type StoredQueue = {
  userId: string;
  countId: string;
  edits: QuantityEdit[];
  /** `Date.now()` at the moment of the write. */
  updatedAt: number;
};

/**
 * The three methods this module uses, and no more.
 *
 * `Storage` itself would drag `lib.dom` into a unit test; this is the same shape and lets
 * the test hand in a `Map`, or a stub that throws on every call.
 */
export type QueueStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, item: string) => void;
  removeItem: (key: string) => void;
};

/** Discard whatever is stored, and never raise while doing it. */
function discard(storage: QueueStorage): void {
  try {
    storage.removeItem(QUEUE_KEY);
  } catch {
    // A storage that cannot even forget is a storage this screen does not need.
  }
}

/** One edit, checked one field at a time: a decimal string or `null`, never a number. */
function isEdit(candidate: unknown): candidate is QuantityEdit {
  if (typeof candidate !== "object" || candidate === null) return false;

  const edit = candidate as Record<string, unknown>;
  if (typeof edit.itemId !== "string" || edit.itemId === "") return false;
  return edit.quantity === null || typeof edit.quantity === "string";
}

/**
 * Write the queue, silently doing nothing when the storage refuses.
 *
 * A refusal here costs the reload-survives guarantee and nothing else: the queue is still
 * in memory, still on the screen and still retried, so counting continues.
 */
export function writeQueue(storage: QueueStorage, stored: StoredQueue): void {
  try {
    storage.setItem(QUEUE_KEY, JSON.stringify(stored));
  } catch {
    // Private browsing and a full quota both land here.
  }
}

/**
 * The edits stored for THIS user and THIS count, or an empty queue.
 *
 * Anything else — another user, another count, older than `QUEUE_MAX_AGE_MS`, malformed
 * JSON, the wrong shape, or a storage that throws — discards the stored item and returns
 * nothing, so a bad queue can never be sticky.
 */
export function readQueue(
  storage: QueueStorage,
  userId: string,
  countId: string,
  now: number = Date.now(),
): QuantityEdit[] {
  let raw: string | null;
  try {
    raw = storage.getItem(QUEUE_KEY);
  } catch {
    discard(storage);
    return [];
  }

  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    discard(storage);
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) {
    discard(storage);
    return [];
  }

  const stored = parsed as Record<string, unknown>;
  const fresh =
    typeof stored.updatedAt === "number" &&
    Number.isFinite(stored.updatedAt) &&
    now - stored.updatedAt <= QUEUE_MAX_AGE_MS;

  if (stored.userId !== userId || stored.countId !== countId || !fresh) {
    discard(storage);
    return [];
  }

  if (!Array.isArray(stored.edits) || !stored.edits.every(isEdit)) {
    discard(storage);
    return [];
  }

  return [...stored.edits];
}

/**
 * The queue with `edit` in it, replacing any earlier edit for the same line.
 *
 * KEYED BY `itemId`, so the wire never carries a number the counter has already replaced
 * (008 AC-14). The replacement keeps the original position, so the order the queue is sent
 * in is the order the rows were first touched.
 */
export function mergeEdit(edits: readonly QuantityEdit[], edit: QuantityEdit): QuantityEdit[] {
  const at = edits.findIndex((existing) => existing.itemId === edit.itemId);
  if (at === -1) return [...edits, edit];

  const merged = [...edits];
  merged[at] = edit;
  return merged;
}

/** The queue with exactly the confirmed lines removed, and every other line kept. */
export function dropConfirmed(
  edits: readonly QuantityEdit[],
  confirmed: readonly string[],
): QuantityEdit[] {
  const gone = new Set(confirmed);
  return edits.filter((edit) => !gone.has(edit.itemId));
}
