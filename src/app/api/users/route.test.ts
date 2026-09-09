import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Spec 003 AC-22: a missing `AUTH_SECRET` must degrade to refusal, never to access.
 *
 * `AUTH_SECRET` is removed from the environment for these tests, and Auth.js behaves as
 * it does without one: `auth()` throws `MissingSecret`. The route must answer 401 and
 * list nobody.
 *
 * Nothing about Prisma is mocked (AC-27) — and that is load-bearing here. There is no
 * `DATABASE_URL` in this suite, so if the handler ever fell through to a database read
 * instead of refusing, this test would fail rather than pass quietly.
 */
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/auth/next-auth", () => ({ auth: authMock }));

const { GET } = await import("@/app/api/users/route");

class MissingSecret extends Error {
  constructor() {
    super("Please define a `secret`.");
    this.name = "MissingSecret";
  }
}

const originalSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  authMock.mockReset();
  delete process.env.AUTH_SECRET;
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.AUTH_SECRET;
  else process.env.AUTH_SECRET = originalSecret;
});

describe("GET /api/users with no AUTH_SECRET", () => {
  it("AC-22: refuses with 401 and a body that contains no users key", async () => {
    authMock.mockRejectedValue(new MissingSecret());

    const response = await GET();
    const body = await response.text();

    expect(response.status).not.toBe(200);
    expect(response.status).toBe(401);
    expect(body).not.toContain("users");
    expect(JSON.parse(body)).toEqual({ error: "Unauthorized" });
  });

  it("AC-22: an unusable session is refused even when the request carries a session cookie", async () => {
    // Auth.js cannot decrypt a cookie without the secret, so it reports no session at
    // all. Whatever the client sent, the answer is the same refusal.
    authMock.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain("users");
  });
});
