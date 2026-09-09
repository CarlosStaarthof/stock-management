/**
 * `npm run admin:create` — create an administrator.
 *
 * Spec 003: no account is seeded with a committed password, because a password in git is
 * a published password. The operator runs, once, against the target database:
 *
 *   ADMIN_EMAIL=you@macroads.ie ADMIN_PASSWORD=<choose-a-strong-password> npm run admin:create
 *
 * There is no default and no prompt: with ADMIN_PASSWORD unset this exits non-zero, so
 * there is no fallback value for anybody to guess (AC-7).
 *
 * It hashes through `src/server/auth/user-service.ts`, which hashes through
 * `src/server/auth/password.ts` — the one file allowed to import bcrypt (AC-5). It
 * prints the email and the role, and never the password nor the hash (AC-6).
 */
import { createUser } from "@/server/auth/user-service";
import { ConflictError, ValidationError } from "@/server/errors";

const USAGE =
  "usage: ADMIN_EMAIL=<email> ADMIN_PASSWORD=<choose-a-strong-password> npm run admin:create";

function fail(message: string): never {
  console.error(`[admin:create] ${message}`);
  console.error(USAGE);
  process.exit(1);
}

async function main(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? "").trim();
  const password = process.env.ADMIN_PASSWORD ?? "";
  // The account's display name is not a secret and not worth a second prompt.
  const name = (process.env.ADMIN_NAME ?? "").trim() || "Administrator";

  if (email === "") {
    fail("ADMIN_EMAIL is not set.");
  }
  if (password === "") {
    fail("ADMIN_PASSWORD is not set. There is no default password.");
  }

  try {
    const user = await createUser({ email, name, password, role: "ADMIN" });

    console.log(`[admin:create] created ${user.email} with role ${user.role}`);
  } catch (error) {
    if (error instanceof ConflictError) {
      // The message already contains the email and the words "already exists".
      fail(error.message);
    }
    if (error instanceof ValidationError) {
      fail(error.message);
    }
    throw error;
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error(
      `[admin:create] failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exit(1);
  });
