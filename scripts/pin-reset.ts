/**
 * `npm run pin:reset` — the operator's repair tool (spec 021 S11, AC-30). It replaces #3's
 * `admin:create` and, unlike it, creates no profile: the first `ADMIN` comes from `/setup`.
 *
 * Exactly two forms:
 *
 *   npm run pin:reset -- --list
 *   NEW_PIN=<choose-a-pin> npm run pin:reset -- --profile <id>
 *   NEW_USERNAME=<choose-a-username> NEW_PIN=<choose-a-pin> npm run pin:reset -- --profile <id>
 *
 * `NEW_USERNAME` is given when, and only when, the profile has no username yet (a row
 * migrated from #3). There is no prompt, no default and no generated PIN: with `NEW_PIN`
 * unset or empty the script exits non-zero and changes nothing (003 AC-7).
 *
 * It reaches hashing through `src/server/auth/operator-service.ts`, which hashes through
 * `src/server/auth/password.ts` (003 AC-5, 021 AC-6). It prints the profile's id,
 * username, name and role, and never the PIN, a hash, a key id or an account key (003
 * AC-6). A failure it did not expect is reported by its name only, because a database
 * error's message can quote the values it was given.
 */

// Both variables are read FIRST, before any module that reaches Prisma's client is loaded.
// That client fills every variable this process was started without from the project's
// `.env` when it loads, so a PIN or a username written there would act as a default (021
// AC-30, G2). Nothing under `src/server/` is imported statically for that reason: `main`
// loads it after these two lines, and a source check in `npm run test:unit` holds the order.
const typedPin = process.env.NEW_PIN ?? "";
const typedUsername = process.env.NEW_USERNAME ?? "";

const USAGE = [
  "usage: npm run pin:reset -- --list",
  "       NEW_PIN=<choose-a-pin> npm run pin:reset -- --profile <id>",
  "       NEW_USERNAME=<choose-a-username> NEW_PIN=<choose-a-pin> npm run pin:reset -- --profile <id>",
].join("\n");

/** The variable each validated field comes from, so a refusal names what to fix. */
const VARIABLE_FOR_FIELD: Record<string, string> = {
  pin: "NEW_PIN",
  username: "NEW_USERNAME",
};

function fail(message: string, withUsage = false): never {
  console.error(message);
  if (withUsage) console.error(USAGE);
  process.exit(1);
}

type Command = { form: "list" } | { form: "profile"; id: string };

function parseArguments(args: string[]): Command {
  if (args.length === 1 && args[0] === "--list") {
    return { form: "list" };
  }
  if (args.length === 2 && args[0] === "--profile" && !args[1].startsWith("-")) {
    return { form: "profile", id: args[1] };
  }

  const unknown = args.find((arg) => arg.startsWith("-") && arg !== "--list" && arg !== "--profile");
  fail(
    unknown === undefined
      ? "pin:reset takes exactly one of the two forms below."
      : `Unknown argument ${unknown}. pin:reset creates no profile: it repairs an existing one.`,
    true,
  );
}

async function main(): Promise<void> {
  const command = parseArguments(process.argv.slice(2));

  // Only now, after the two reads at the top of this file.
  const { listProfilesForOperator, setCredentialsForOperator } = await import(
    "@/server/auth/operator-service"
  );
  const { ConflictError, NotFoundError, ValidationError } = await import("@/server/errors");

  try {
    if (command.form === "list") {
      for (const line of await listProfilesForOperator()) {
        console.log(
          [
            line.id,
            line.username ?? "-",
            line.name,
            line.role,
            line.status,
            line.pinState,
            line.lockState,
          ].join("\t"),
        );
      }
      return;
    }

    if (typedPin === "") {
      fail(
        "NEW_PIN is not set. There is no prompt, no default and no generated PIN: set NEW_PIN to the PIN you chose.",
        true,
      );
    }

    const profile = await setCredentialsForOperator({
      id: command.id,
      pin: typedPin,
      username: typedUsername === "" ? undefined : typedUsername,
    });

    console.log(
      `pin:reset: profile ${profile.id} (${profile.username}, ${profile.name}, ${profile.role}) ` +
        "has a new PIN. Every session it had has ended.",
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      fail(`${VARIABLE_FOR_FIELD[error.field] ?? error.field}: ${error.message}`);
    }
    if (error instanceof ConflictError || error instanceof NotFoundError) {
      fail(error.message);
    }
    // The pepper's own error names the variable and never its value (021 AC-5).
    if (error instanceof Error && error.name === "CredentialSecretError") {
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
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? ` (${String((error as { code?: unknown }).code)})`
        : "";
    console.error(`pin:reset failed: ${error instanceof Error ? error.name : "unknown error"}${code}`);
    process.exit(1);
  });
