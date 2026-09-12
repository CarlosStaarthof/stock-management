import { describe, expect, it } from "vitest";

import {
  QUEUE_KEY,
  QUEUE_MAX_AGE_MS,
  dropConfirmed,
  mergeEdit,
  readQueue,
  writeQueue,
} from "@/lib/entry-queue";
import type { QueueStorage } from "@/lib/entry-queue";

/**
 * Spec 008 AC-15's first half: the offline queue, with no browser and no database.
 *
 * The browser half — typing, reloading and finding the numbers still there — is
 * `tests/e2e/stock-entry-autosave.spec.ts`. This file is what makes the module's rules
 * checkable on a machine with nothing installed (008 AC-32).
 */

/** A `Storage`-shaped fake over a Map, so a test can read what was really written. */
function fakeStorage(seed?: string): QueueStorage & { peek: () => string | null } {
  const held = new Map<string, string>();
  if (seed !== undefined) held.set(QUEUE_KEY, seed);

  return {
    getItem: (key) => held.get(key) ?? null,
    setItem: (key, item) => {
      held.set(key, item);
    },
    removeItem: (key) => {
      held.delete(key);
    },
    peek: () => held.get(QUEUE_KEY) ?? null,
  };
}

/** Private browsing, a full quota and a disabled storage all behave like this. */
function throwingStorage(): QueueStorage {
  return {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {
      throw new Error("SecurityError");
    },
  };
}

const NOW = 1_757_000_000_000;
const USER = "user-1";
const COUNT = "count-1";

function stored(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    userId: USER,
    countId: COUNT,
    edits: [{ itemId: "item-a", quantity: "12.5" }],
    updatedAt: NOW,
    ...over,
  });
}

describe("AC-15: writeQueue stores the four fields under QUEUE_KEY", () => {
  it("AC-15: what is written is exactly { userId, countId, edits, updatedAt }", () => {
    const storage = fakeStorage();

    writeQueue(storage, {
      userId: USER,
      countId: COUNT,
      edits: [{ itemId: "item-a", quantity: "0" }],
      updatedAt: NOW,
    });

    const written = JSON.parse(storage.peek() as string) as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(["countId", "edits", "updatedAt", "userId"]);
    expect(written.userId).toBe(USER);
    expect(written.countId).toBe(COUNT);
    expect(written.updatedAt).toBe(NOW);
    // A decimal STRING, and `0` survives as `"0"` rather than becoming a JSON number.
    expect(written.edits).toEqual([{ itemId: "item-a", quantity: "0" }]);
  });

  it("AC-15: a storage that throws does not take the screen down with it", () => {
    expect(() =>
      writeQueue(throwingStorage(), {
        userId: USER,
        countId: COUNT,
        edits: [],
        updatedAt: NOW,
      }),
    ).not.toThrow();
  });
});

describe("AC-15: readQueue returns the edits only for the same user and the same count", () => {
  it("AC-15: the matching user and count within the age gives the edits back", () => {
    const storage = fakeStorage(stored());

    expect(readQueue(storage, USER, COUNT, NOW)).toEqual([{ itemId: "item-a", quantity: "12.5" }]);
    // A good read keeps the queue: the edits have not been sent yet.
    expect(storage.peek()).not.toBeNull();
  });

  it("AC-15: nothing stored at all is an empty queue and not an error", () => {
    expect(readQueue(fakeStorage(), USER, COUNT, NOW)).toEqual([]);
  });

  it("AC-15: a different user gets an empty queue, and the stored one is discarded", () => {
    const storage = fakeStorage(stored());

    // A shared yard phone: re-applying one counter's unsent numbers to another counter's
    // count would be worse than losing them.
    expect(readQueue(storage, "user-2", COUNT, NOW)).toEqual([]);
    expect(storage.peek()).toBeNull();
  });

  it("AC-15: a different count gets an empty queue, and the stored one is discarded", () => {
    const storage = fakeStorage(stored());

    expect(readQueue(storage, USER, "count-2", NOW)).toEqual([]);
    expect(storage.peek()).toBeNull();
  });

  it("AC-15: a stale timestamp gets an empty queue, and the stored one is discarded", () => {
    const storage = fakeStorage(stored({ updatedAt: NOW - QUEUE_MAX_AGE_MS - 1 }));

    expect(readQueue(storage, USER, COUNT, NOW)).toEqual([]);
    expect(storage.peek()).toBeNull();
  });

  it("AC-15: exactly QUEUE_MAX_AGE_MS old is still fresh — seven days, inclusive", () => {
    const storage = fakeStorage(stored({ updatedAt: NOW - QUEUE_MAX_AGE_MS }));

    expect(readQueue(storage, USER, COUNT, NOW)).toHaveLength(1);
  });

  it("AC-15: malformed JSON gets an empty queue, and the stored one is discarded", () => {
    const storage = fakeStorage("{ this is not json");

    expect(readQueue(storage, USER, COUNT, NOW)).toEqual([]);
    expect(storage.peek()).toBeNull();
  });

  it("AC-15: a storage that throws gets an empty queue and raises nothing", () => {
    expect(readQueue(throwingStorage(), USER, COUNT, NOW)).toEqual([]);
  });

  it("AC-15: the wrong shape is discarded — a missing timestamp, edits that are not an array", () => {
    for (const bad of [
      stored({ updatedAt: undefined }),
      stored({ updatedAt: "yesterday" }),
      stored({ edits: "item-a" }),
      stored({ edits: [{ itemId: "item-a", quantity: 12.5 }] }),
      stored({ edits: [{ itemId: 7, quantity: "1" }] }),
      stored({ edits: [null] }),
      JSON.stringify(["not", "an", "object"]),
      JSON.stringify(42),
    ]) {
      const storage = fakeStorage(bad);

      expect(readQueue(storage, USER, COUNT, NOW), bad).toEqual([]);
      expect(storage.peek(), bad).toBeNull();
    }
  });

  it("AC-15: a JSON number quantity is refused rather than coerced", () => {
    // The endpoint refuses a JSON number outright (008 AC-10); a queue that quietly
    // accepted one would send it and be told `400` on a phone with no way to say so.
    const storage = fakeStorage(stored({ edits: [{ itemId: "item-a", quantity: 0 }] }));

    expect(readQueue(storage, USER, COUNT, NOW)).toEqual([]);
  });
});

describe("AC-15: mergeEdit replaces an earlier edit for the same line", () => {
  it("AC-15: the same itemId twice is one entry, holding the later quantity", () => {
    const first = mergeEdit([], { itemId: "item-a", quantity: "1" });
    const second = mergeEdit(first, { itemId: "item-b", quantity: "2" });
    const third = mergeEdit(second, { itemId: "item-a", quantity: "3" });

    // Keyed by itemId, so the wire never carries a number already replaced (008 AC-14).
    expect(third).toEqual([
      { itemId: "item-a", quantity: "3" },
      { itemId: "item-b", quantity: "2" },
    ]);
  });

  it("AC-15: a replacement keeps the row's original position in the queue", () => {
    const queue = [
      { itemId: "item-a", quantity: "1" },
      { itemId: "item-b", quantity: "2" },
      { itemId: "item-c", quantity: "3" },
    ];

    expect(mergeEdit(queue, { itemId: "item-a", quantity: null }).map((edit) => edit.itemId)).toEqual(
      ["item-a", "item-b", "item-c"],
    );
  });

  it("AC-15: mergeEdit does not mutate the queue it was given", () => {
    const queue = [{ itemId: "item-a", quantity: "1" }];
    mergeEdit(queue, { itemId: "item-a", quantity: "9" });

    expect(queue).toEqual([{ itemId: "item-a", quantity: "1" }]);
  });

  it("AC-15: clearing a row queues null, which is a different thing from zero", () => {
    const queue = mergeEdit([{ itemId: "item-a", quantity: "0" }], {
      itemId: "item-a",
      quantity: null,
    });

    expect(queue).toEqual([{ itemId: "item-a", quantity: null }]);
  });
});

describe("AC-15: dropConfirmed removes exactly the confirmed ids", () => {
  const queue = [
    { itemId: "item-a", quantity: "1" },
    { itemId: "item-b", quantity: "2" },
    { itemId: "item-c", quantity: null },
  ];

  it("AC-15: the confirmed go and the rest stay, in order", () => {
    expect(dropConfirmed(queue, ["item-b"])).toEqual([
      { itemId: "item-a", quantity: "1" },
      { itemId: "item-c", quantity: null },
    ]);
  });

  it("AC-15: confirming every line empties the queue", () => {
    expect(dropConfirmed(queue, ["item-a", "item-b", "item-c"])).toEqual([]);
  });

  it("AC-15: an id that is not in the queue removes nothing", () => {
    expect(dropConfirmed(queue, ["item-z"])).toEqual(queue);
  });

  it("AC-15: dropConfirmed does not mutate the queue it was given", () => {
    dropConfirmed(queue, ["item-a", "item-b", "item-c"]);
    expect(queue).toHaveLength(3);
  });
});
