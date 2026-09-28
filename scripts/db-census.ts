/**
 * `npm run db:census` — describe a database by counts (spec 016 D10, AC-7).
 *
 * Read-only. It prints one `[db:census]` line per fact and nothing else: no username, no
 * name, no price, no hash, no key id, no connection string and no host. Against production
 * it runs through `npm run operator:production -- db:census`, which asks for the settings
 * at a prompt; in the production build it is the `census` step.
 *
 * A failure is reported by the error's name and code only, because a database error's
 * message can quote the connection it was given.
 */
import { CENSUS_PREFIX, databaseCensus, renderCensus } from "@/server/deploy/census";

async function main(): Promise<void> {
  for (const line of renderCensus(await databaseCensus())) {
    console.log(line);
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
    console.error(`${CENSUS_PREFIX} failed: ${error instanceof Error ? error.name : "unknown error"}${code}`);
    process.exit(1);
  });
