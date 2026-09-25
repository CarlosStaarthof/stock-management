import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { resetTestDb } from "@/server/test-db";

/**
 * 021 AC-3: the database refuses an impossible profile, whatever wrote it.
 *
 * Every row here is written with raw SQL, not through a service, because the claim is
 * about Postgres: a service that validates first would make these pass without a single
 * constraint existing. No value here is a PIN or a hash of one — the hash column only has
 * to be non-null, so it holds a random string that verifies nothing.
 */

type Row = Record<string, string | number | null>;

function hex(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

function newUsername(): string {
  return `u${hex(6)}`;
}

/** Stands in for a stored hash: non-null is all a CHECK can see. Never a PIN's. */
function notAHash(): string {
  return `not-a-hash-${hex(8)}`;
}

function keyId(): string {
  return hex(8);
}

const USER_DEFAULTS = {
  id: null,
  username: null,
  requestedUsername: null,
  name: "Schema Fixture",
  role: "YARD_STAFF",
  status: "ACTIVE",
  pinHash: null,
  pinKeyId: null,
} as const;

/** One INSERT into "User" with every column named, so a default never hides a value. */
async function insertUser(overrides: Row): Promise<void> {
  const row = { ...USER_DEFAULTS, ...overrides, id: overrides.id ?? `c${hex(10)}` };
  await db.$executeRaw`
    INSERT INTO "User" ("id", "username", "requestedUsername", "name", "role", "status",
                        "pinHash", "pinKeyId", "updatedAt")
    VALUES (${row.id}, ${row.username}, ${row.requestedUsername}, ${row.name},
            ${row.role}::"Role", ${row.status}::"ProfileStatus", ${row.pinHash},
            ${row.pinKeyId}, now())`;
}

/** The error an action raised, so its message can be read. */
async function refusal(action: () => Promise<unknown>): Promise<Error> {
  try {
    await action();
  } catch (error) {
    return error as Error;
  }
  throw new Error("expected the database to refuse the write, and it accepted it");
}

/** AC-3 asks a duplicate only to be refused as a unique violation, not to name the index. */
const UNIQUE = "a unique violation";

/**
 * A unique violation, as Prisma reports one from a raw statement: code `P2002`, or the
 * Postgres code 23505 in the message. Either way no constraint text is invented here.
 */
function isUniqueViolation(error: Error): boolean {
  const code = (error as { code?: unknown }).code;
  return code === "P2002" || /23505|Unique constraint/.test(error.message);
}

async function expectRefusedBy(
  constraint: string,
  table: "User" | "SetupClaim" | "AccountLock" | "AuthEvent",
  action: () => Promise<unknown>,
): Promise<void> {
  const count = async (): Promise<number> => {
    const rows = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "${table}"`,
    );
    return rows[0]?.n ?? -1;
  };
  const before = await count();

  const error = await refusal(action);

  if (constraint === UNIQUE) {
    expect(isUniqueViolation(error), error.message).toBe(true);
  } else {
    expect(error.message).toContain(constraint);
  }
  expect(await count()).toBe(before);
}

beforeEach(async () => {
  await resetTestDb();
});

describe("021 AC-3: a PENDING row is a YARD_STAFF request with a PIN and no username", () => {
  const pending = (): Row => ({
    status: "PENDING",
    requestedUsername: newUsername(),
    pinHash: notAHash(),
    pinKeyId: keyId(),
  });

  it("AC-3: a well-formed request is accepted, so the refusals below are not vacuous", async () => {
    await insertUser(pending());

    expect(await db.user.count({ where: { status: "PENDING" } })).toBe(1);
  });

  it("AC-3: with a NULL requestedUsername it is refused", async () => {
    await expectRefusedBy("User_request_only_when_pending", "User", () =>
      insertUser({ ...pending(), requestedUsername: null }),
    );
  });

  it("AC-3: with a non-null username it is refused", async () => {
    await expectRefusedBy("User_pending_shape", "User", () =>
      insertUser({ ...pending(), username: newUsername() }),
    );
  });

  it("AC-3: with a NULL pinHash it is refused", async () => {
    await expectRefusedBy("User_pending_shape", "User", () =>
      insertUser({ ...pending(), pinHash: null, pinKeyId: null }),
    );
  });

  it("AC-3: with role ADMIN it is refused", async () => {
    await expectRefusedBy("User_pending_shape", "User", () =>
      insertUser({ ...pending(), role: "ADMIN" }),
    );
  });

  it("AC-3: an ACTIVE row with a non-null requestedUsername is refused", async () => {
    await expectRefusedBy("User_request_only_when_pending", "User", () =>
      insertUser({ requestedUsername: newUsername() }),
    );
  });
});

describe("021 AC-3: usernames are lower-case, begin with a letter, 3 to 32 characters", () => {
  const malformed: [string, string][] = [
    ["an upper-case letter", `U${hex(4)}`],
    ["a leading digit", `7${hex(4)}`],
    ["2 characters", "ab"],
    ["33 characters", `a${"b".repeat(32)}`],
  ];

  for (const [label, value] of malformed) {
    it(`AC-3: a username with ${label} is refused`, async () => {
      await expectRefusedBy("User_username_format", "User", () =>
        insertUser({ username: value }),
      );
    });

    it(`AC-3: a requestedUsername with ${label} is refused`, async () => {
      await expectRefusedBy("User_requested_username_format", "User", () =>
        insertUser({
          status: "PENDING",
          requestedUsername: value,
          pinHash: notAHash(),
          pinKeyId: keyId(),
        }),
      );
    });
  }

  it("AC-3: 3 and 32 characters are accepted, so the two lengths above are the boundary", async () => {
    await insertUser({ username: `a${hex(1)}` });
    await insertUser({ username: `a${"b".repeat(31)}` });

    expect(await db.user.count()).toBe(2);
  });
});

describe("021 AC-3: a PIN hash lives only where it can be used", () => {
  it("AC-3: a pinHash without a pinKeyId is refused", async () => {
    await expectRefusedBy("User_pin_key_with_pin", "User", () =>
      insertUser({ username: newUsername(), pinHash: notAHash(), pinKeyId: null }),
    );
  });

  it("AC-3: a pinKeyId without a pinHash is refused", async () => {
    await expectRefusedBy("User_pin_key_with_pin", "User", () =>
      insertUser({ username: newUsername(), pinHash: null, pinKeyId: keyId() }),
    );
  });

  for (const status of ["REJECTED", "DEACTIVATED"]) {
    it(`AC-3: a pinHash on a ${status} row is refused`, async () => {
      await expectRefusedBy("User_pin_only_when_live", "User", () =>
        insertUser({ status, username: newUsername(), pinHash: notAHash(), pinKeyId: keyId() }),
      );
    });
  }

  it("AC-3: a pinHash on a non-PENDING row whose username is NULL is refused", async () => {
    await expectRefusedBy("User_pin_needs_username", "User", () =>
      insertUser({ username: null, pinHash: notAHash(), pinKeyId: keyId() }),
    );
  });
});

describe("021 AC-3: the three new tables", () => {
  it("AC-3: a SetupClaim whose id is not 1 is refused", async () => {
    await insertUser({ id: "setup_claim_owner", username: newUsername() });

    await expectRefusedBy("SetupClaim_single_row", "SetupClaim", () =>
      db.$executeRaw`INSERT INTO "SetupClaim" ("id", "userId") VALUES (2, 'setup_claim_owner')`,
    );
  });

  const badKeys: [string, string][] = [
    ["63 hex characters", hex(32).slice(1)],
    ["upper-case hex", hex(32).toUpperCase().replace(/^[0-9]/, "A")],
    ["a non-hex character", `${hex(32).slice(1)}g`],
  ];

  for (const [label, key] of badKeys) {
    it(`AC-3: an AccountLock key of ${label} is refused`, async () => {
      await expectRefusedBy("AccountLock_key_format", "AccountLock", () =>
        db.$executeRaw`INSERT INTO "AccountLock" ("accountKey", "updatedAt") VALUES (${key}, now())`,
      );
    });

    it(`AC-3: an AuthEvent account key of ${label} is refused`, async () => {
      await expectRefusedBy("AuthEvent_account_key_format", "AuthEvent", () =>
        db.$executeRaw`
          INSERT INTO "AuthEvent" ("id", "kind", "bucket", "accountKey")
          VALUES (${`e${hex(8)}`}, 'PIN_FAILURE'::"AuthEventKind", 'pin:new-devices', ${key})`,
      );
    });
  }
});

describe("021 AC-3: uniqueness and the claim's foreign key", () => {
  it("AC-3: a second User with an existing username is refused", async () => {
    const username = newUsername();
    await insertUser({ username });

    await expectRefusedBy(UNIQUE, "User", () => insertUser({ username }));
  });

  it("AC-3: a second SetupClaim row is refused", async () => {
    await insertUser({ id: "first_admin", username: newUsername(), role: "ADMIN" });
    await insertUser({ id: "second_admin", username: newUsername(), role: "ADMIN" });
    await db.$executeRaw`INSERT INTO "SetupClaim" ("id", "userId") VALUES (1, 'first_admin')`;

    await expectRefusedBy(UNIQUE, "SetupClaim", () =>
      db.$executeRaw`INSERT INTO "SetupClaim" ("id", "userId") VALUES (1, 'second_admin')`,
    );
  });

  it("AC-3: deleting a User that a SetupClaim references is refused", async () => {
    await insertUser({ id: "claimed_admin", username: newUsername(), role: "ADMIN" });
    await db.$executeRaw`INSERT INTO "SetupClaim" ("id", "userId") VALUES (1, 'claimed_admin')`;

    await expectRefusedBy("SetupClaim_userId_fkey", "User", () =>
      db.$executeRaw`DELETE FROM "User" WHERE "id" = 'claimed_admin'`,
    );
    expect(await db.setupClaim.count()).toBe(1);
  });
});

describe("021 AC-2: the migration applied third is this feature's", () => {
  // 004 AC-24 (columns.db.test.ts) pins the first two rows and carries no count; the third
  // row is #21's claim, so #21 pins it here.
  it("AC-2: ordered by started_at, the third _prisma_migrations row is <timestamp>_pin_profiles, finished and not rolled back", async () => {
    const rows = await db.$queryRaw<
      { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
    >`SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      ORDER BY started_at`;

    expect(rows[2]?.migration_name).toMatch(/^\d{14}_pin_profiles$/);
    expect(rows[2]?.finished_at).not.toBeNull();
    expect(rows[2]?.rolled_back_at).toBeNull();
  });
});
