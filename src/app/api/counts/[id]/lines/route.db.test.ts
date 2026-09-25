import { beforeEach, describe, expect, it, vi } from "vitest";

import { moneyKeysIn } from "@/lib/money-boundary";
import type { SessionUser } from "@/server/auth/session-user";
import { startCount } from "@/server/counts/count-service";
import { resetTestDb } from "@/server/test-db";

import {
  actorFor,
  createdByIdOf,
  markPastDraft,
  quantitiesOf,
} from "../../../../../../tests/support/count-fixture";
import {
  DUBLIN_ID,
  fixtureId,
  makeItemType,
  makeItemsBulk,
  makeLinksBulk,
  makeSupplier,
} from "../../../../../../tests/support/item-master-fixture";

/**
 * Spec 008 AC-1, AC-10, AC-17 and AC-19: the endpoint's whole contract, against a real
 * Postgres and through the real handler.
 *
 * ONLY THE SESSION IS MOCKED, and only because there is no browser here to hold a cookie:
 * `auth()` is replaced, exactly as `src/app/api/users/route.test.ts` replaces it, and
 * everything below it — `findActiveUserById`, the service, Prisma, the database — is real.
 * Mocking the service would prove that the mock works, which is not a fact anybody needs
 * (`docs/verification.md` Level 2). The browser-level half of AC-10, including the `405`
 * that Next itself answers a `GET` with, belongs to the Playwright specs.
 *
 * Every row it seeds and every row it reads back goes through `tests/support/`, and not
 * through `@/server/db` directly: 004 AC-31 requires every file importing the database to
 * live under `src/server/`, and this one does not. The fixtures do the same job for #6.
 */
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/next-auth", () => ({ auth: authMock }));

const { POST } = await import("@/app/api/counts/[id]/lines/route");

const ENDPOINT = "http://localhost:3000/api/counts";

beforeEach(async () => {
  await resetTestDb();
  authMock.mockReset();
});

/** Whoever the next request is from. Nothing a client sends can change this answer. */
function signedInAs(actor: SessionUser | null): void {
  // `epoch: 0` is what a freshly made profile's session carries (021 AC-17).
  authMock.mockResolvedValue(actor === null ? null : { user: { id: actor.id }, epoch: 0 });
}

type Fixture = { countId: string; itemIds: string[]; staff: SessionUser; admin: SessionUser };

async function seedCount(): Promise<Fixture> {
  const typeId = await makeItemType("BEADS", 1, "Beads");
  const supplierId = await makeSupplier("Kelly");

  const itemIds = Array.from({ length: 4 }, (_unused, index) => fixtureId("item", index));
  await makeItemsBulk(
    itemIds.map((id, index) => ({
      id,
      description: `Item ${index}`,
      itemTypeId: typeId,
      supplierId,
      unitLabel: "20 Kg",
    })),
  );
  await makeLinksBulk(
    itemIds.map((itemId, index) => ({ itemId, locationId: DUBLIN_ID, sortOrder: 3 + index })),
  );

  const staff = await actorFor("YARD_STAFF");
  const admin = await actorFor("ADMIN");
  const countId = await startCount(admin, {
    locationCode: "DUBLIN",
    countDate: "2026-09-01",
    period: "2026-09",
  });

  return { countId, itemIds, staff, admin };
}

/** A real `Request`, with a real body, through the real handler. */
async function post(
  countId: string,
  body: unknown,
  options: { url?: string; headers?: Record<string, string> } = {},
): Promise<Response> {
  const request = new Request(options.url ?? `${ENDPOINT}/${countId}/lines`, {
    method: "POST",
    headers: { "content-type": "application/json", ...options.headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

  return POST(request, { params: Promise.resolve({ id: countId }) });
}

/* ------------------------------------------------------------------------- AC-1 */

describe("AC-1: the endpoint is closed to a signed-out request, and answers in JSON", () => {
  it("AC-1: a signed-out POST with a valid body is 401 JSON, with no Location header", async () => {
    const { countId, itemIds } = await seedCount();
    signedInAs(null);

    const response = await post(countId, { edits: [{ itemId: itemIds[0], quantity: "12.5" }] });

    expect(response.status).toBe(401);
    expect(response.status).not.toBe(307);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Unauthorized" });

    // A redirect to an HTML sign-in form is not something a `fetch` can use, which is why
    // this path is deliberately outside the middleware's matcher.
    expect(await quantitiesOf(countId)).toEqual([null, null, null, null]);
  });

  it("AC-1: an unusable session is refused before the body is even read", async () => {
    const { countId } = await seedCount();
    authMock.mockRejectedValue(new Error("MissingSecret"));

    const response = await post(countId, "not json at all");

    expect(response.status).toBe(401);
    expect(await quantitiesOf(countId)).toEqual([null, null, null, null]);
  });
});

/* ------------------------------------------------------------------------ AC-10 */

describe("AC-10: the endpoint's contract", () => {
  it("AC-10: a valid save is 200 JSON with exactly five keys and the counts adding up", async () => {
    const { countId, itemIds, staff } = await seedCount();
    signedInAs(staff);

    const response = await post(countId, {
      edits: [
        { itemId: itemIds[0], quantity: "12.5" },
        { itemId: itemIds[1], quantity: null },
      ],
    });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(Object.keys(body).sort()).toEqual([
      "countId",
      "countedLineCount",
      "lineCount",
      "saved",
      "uncountedLineCount",
    ]);
    expect(body.countId).toBe(countId);
    expect(body.saved).toEqual([
      { itemId: itemIds[0], quantity: "12.5" },
      { itemId: itemIds[1], quantity: null },
    ]);
    expect(body.lineCount).toBe(4);
    expect(body.countedLineCount).toBe(1);
    expect(body.uncountedLineCount).toBe(3);
    expect((body.countedLineCount as number) + (body.uncountedLineCount as number)).toBe(
      body.lineCount,
    );
  });

  it("AC-10: `saved` echoes what was persisted, not what was sent", async () => {
    const { countId, itemIds, staff } = await seedCount();
    signedInAs(staff);

    const response = await post(countId, {
      edits: [{ itemId: itemIds[0], quantity: "21,6128" }],
    });
    const body = (await response.json()) as { saved: { quantity: string }[] };

    // The comma the counter typed is not what the database holds, and the body says so.
    expect(body.saved[0].quantity).toBe("21.6128");
    expect((await quantitiesOf(countId))[0]).toBe("21.6128");
  });

  it("AC-10: sending the identical body twice is identical both times", async () => {
    const { countId, itemIds, staff } = await seedCount();
    signedInAs(staff);
    const sent = {
      edits: [
        { itemId: itemIds[0], quantity: "12.5" },
        { itemId: itemIds[1], quantity: "0" },
      ],
    };

    const first = await (await post(countId, sent)).json();
    const between = await quantitiesOf(countId);
    const second = await (await post(countId, sent)).json();

    expect(second).toEqual(first);
    expect(await quantitiesOf(countId)).toEqual(between);
  });

  it("AC-10: seven malformed bodies are each 400, and none of them writes", async () => {
    const { countId, itemIds, staff } = await seedCount();
    signedInAs(staff);

    const good = { itemId: itemIds[0], quantity: "12.5" };
    const malformed: [string, unknown][] = [
      ["not an object", "12.5"],
      ["edits is not an array", { edits: "everything" }],
      ["edits is empty", { edits: [] }],
      [
        "more than 200 edits",
        {
          edits: Array.from({ length: 201 }, () => ({ itemId: itemIds[0], quantity: "1" })),
        },
      ],
      ["itemId is not a string", { edits: [{ itemId: 7, quantity: "1" }] }],
      ["quantity is a JSON number", { edits: [{ itemId: itemIds[0], quantity: 12.5 }] }],
      ["an unknown extra key", { edits: [good], role: "ADMIN" }],
    ];

    expect(malformed).toHaveLength(7);
    for (const [name, body] of malformed) {
      const response = await post(countId, body);
      const parsed = (await response.json()) as { error?: string; field?: string };

      expect(response.status, name).toBe(400);
      expect(typeof parsed.error, name).toBe("string");
      expect(parsed.error, name).not.toBe("");
      expect(parsed.field, name).toBeTruthy();
    }

    expect(await quantitiesOf(countId)).toEqual([null, null, null, null]);
  });

  it("AC-10: a body that is not JSON at all is 400, not 500", async () => {
    const { countId, staff } = await seedCount();
    signedInAs(staff);

    const response = await post(countId, "{ edits: ");

    expect(response.status).toBe(400);
  });

  it("AC-10: a countId that does not exist is 404, and an unknown line is 404", async () => {
    const { countId, itemIds, staff } = await seedCount();
    signedInAs(staff);

    const missingCount = await post("count_does_not_exist", {
      edits: [{ itemId: itemIds[0], quantity: "1" }],
    });
    const missingLine = await post(countId, {
      edits: [{ itemId: "item_not_on_this_count", quantity: "1" }],
    });

    expect(missingCount.status).toBe(404);
    expect(missingLine.status).toBe(404);
    expect(await quantitiesOf(countId)).toEqual([null, null, null, null]);
  });

  it("AC-9: a count that is no longer a DRAFT is 409, in the domain's own words", async () => {
    const { countId, itemIds, staff } = await seedCount();
    await markPastDraft(countId);
    signedInAs(staff);

    const response = await post(countId, { edits: [{ itemId: itemIds[0], quantity: "1" }] });
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(body.error).toBe("This count has been submitted and can no longer be edited.");
  });

  it("AC-27: no refusal body carries a driver or a Postgres string", async () => {
    const { countId, itemIds, staff } = await seedCount();
    signedInAs(staff);

    const refusals = [
      await post(countId, { edits: [{ itemId: itemIds[0], quantity: "abc" }] }),
      await post(countId, { edits: [{ itemId: itemIds[0], quantity: "21.61285" }] }),
      await post(countId, { edits: [{ itemId: itemIds[0], quantity: "100000000" }] }),
      await post(countId, { edits: [{ itemId: "item_not_here", quantity: "1" }] }),
      await post("count_gone", { edits: [{ itemId: itemIds[0], quantity: "1" }] }),
    ];

    for (const response of refusals) {
      const text = JSON.stringify(await response.json());

      for (const forbidden of [
        "prisma",
        "Prisma",
        "violates",
        "constraint",
        "SQLSTATE",
        "22003",
        "23502",
        "23514",
        "23505",
        "P2002",
        "P2003",
        "P2025",
        "numeric field overflow",
        "StockCountLine_stockCountId_itemId_key",
      ]) {
        expect(text, forbidden).not.toContain(forbidden);
      }
    }
  });
});

/* ----------------------------------------------------------------- AC-17, AC-19 */

describe("AC-17, AC-19: one shape, no money, and no client-set identity", () => {
  it("AC-17: the parsed JSON body of a staff response reports zero monetary keys", async () => {
    const { countId, itemIds, staff } = await seedCount();
    signedInAs(staff);

    const response = await post(countId, { edits: [{ itemId: itemIds[0], quantity: "12.5" }] });
    const body = await response.json();

    // docs/verification.md Level 3b, on a real response body rather than on the rendering.
    expect(moneyKeysIn(body)).toEqual([]);
  });

  it("AC-17: an ADMIN's body is deeply equal to a YARD_STAFF's for the identical request", async () => {
    const { countId, itemIds, staff, admin } = await seedCount();
    const sent = { edits: [{ itemId: itemIds[0], quantity: "12.5" }] };

    signedInAs(staff);
    const asStaff = await (await post(countId, sent)).json();
    signedInAs(admin);
    const asAdmin = await (await post(countId, sent)).json();

    // One shape for both roles, because the response carries no money at all (AC-18).
    expect(asAdmin).toEqual(asStaff);
  });

  it("AC-19: a query string, a header and a cookie claiming ADMIN change nothing", async () => {
    const { countId, itemIds, staff, admin } = await seedCount();
    const sent = { edits: [{ itemId: itemIds[0], quantity: "12.5" }] };

    signedInAs(staff);
    const forged = await post(countId, sent, {
      url: `${ENDPOINT}/${countId}/lines?role=ADMIN&userId=${admin.id}`,
      headers: { "x-user-role": "ADMIN", cookie: `role=ADMIN; userId=${admin.id}` },
    });
    const plain = await post(countId, sent);

    expect(forged.status).toBe(200);
    expect(await forged.json()).toEqual(await plain.json());

    // And the count still belongs to whoever started it.
    expect(await createdByIdOf(countId)).toBe(admin.id);
  });

  it("AC-19: a body claiming an identity is refused rather than honoured", async () => {
    const { countId, itemIds, staff, admin } = await seedCount();
    signedInAs(staff);

    const response = await post(countId, {
      edits: [{ itemId: itemIds[0], quantity: "12.5" }],
      role: "ADMIN",
      userId: admin.id,
    });

    // The strict schema of AC-10 answers this before the service is ever called, so there
    // is no question of the keys having been read: nothing is written either.
    expect(response.status).toBe(400);
    expect(await quantitiesOf(countId)).toEqual([null, null, null, null]);
  });
});
