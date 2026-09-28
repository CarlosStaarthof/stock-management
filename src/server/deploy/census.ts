import { currentPinKeyId } from "@/server/auth/password";
import { db } from "@/server/db";

/**
 * The read-only census of a database (spec 016 D10, AC-7): counts, and nothing a count is
 * made of.
 *
 * It describes whichever database `DATABASE_URL` names — development, the test database,
 * production through the operator launcher, or a scratch branch after a restore drill — so
 * the seed, the pepper backup, the copy and both drills are all checked by the same lines.
 *
 * What it never returns, so that nothing rendered from it can print one: a username, a
 * display name, a price, a PIN hash, a key id, a connection string or a host. The PIN check
 * reduces every stored key id to "made under the given pepper, or not" inside this module.
 */

/** A count for one value of a grouping, e.g. `{ label: "ADMIN ACTIVE", count: 1 }`. */
export type CensusGroup = { label: string; count: number };

/** Whether the given `PIN_PEPPER` made the stored PINs, as two counts. */
export type PinCensus =
  | { checked: true; underGivenPepper: number; stored: number }
  | { checked: false; stored: number };

export type Census = {
  locations: number;
  suppliers: number;
  itemTypes: number;
  items: number;
  itemsNeedingReview: number;
  prices: number;
  yardLinks: number;
  profiles: CensusGroup[];
  stockCounts: CensusGroup[];
  countLines: number;
  migrations: { applied: number; latest: string | null };
  pins: PinCensus;
};

type MigrationRow = { name: string };

/** The applied migrations, oldest first; none when Prisma's table does not exist yet. */
async function appliedMigrations(): Promise<string[]> {
  const present = await db.$queryRawUnsafe<{ present: boolean }[]>(
    `SELECT to_regclass('_prisma_migrations') IS NOT NULL AS present`,
  );
  if (present[0]?.present !== true) return [];

  const rows = await db.$queryRawUnsafe<MigrationRow[]>(
    `SELECT migration_name AS name FROM _prisma_migrations
      WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
      ORDER BY migration_name`,
  );
  return rows.map((row) => row.name);
}

/** The given pepper's key id, or `null` when `PIN_PEPPER` is not set or not usable. */
function givenPinKeyId(): string | null {
  try {
    return currentPinKeyId();
  } catch (error) {
    // password.ts names the variable and never its value; anything else is a real fault.
    if (error instanceof Error && error.name === "CredentialSecretError") return null;
    throw error;
  }
}

function byLabel(groups: CensusGroup[]): CensusGroup[] {
  return [...groups].sort((left, right) => left.label.localeCompare(right.label, "en"));
}

export async function databaseCensus(): Promise<Census> {
  const [
    locations,
    suppliers,
    itemTypes,
    items,
    itemsNeedingReview,
    prices,
    yardLinks,
    profileGroups,
    countGroups,
    countLines,
    keyIds,
  ] = await Promise.all([
    db.location.count(),
    db.supplier.count(),
    db.itemType.count(),
    db.item.count(),
    db.item.count({ where: { needsReview: true } }),
    db.itemPrice.count(),
    db.itemLocation.count(),
    db.user.groupBy({ by: ["role", "status"], _count: { _all: true } }),
    db.stockCount.groupBy({ by: ["status"], _count: { _all: true } }),
    db.stockCountLine.count(),
    db.user.findMany({ where: { pinHash: { not: null } }, select: { pinKeyId: true } }),
  ]);

  const migrations = await appliedMigrations();
  const given = givenPinKeyId();

  return {
    locations,
    suppliers,
    itemTypes,
    items,
    itemsNeedingReview,
    prices,
    yardLinks,
    profiles: byLabel(
      profileGroups.map((group) => ({
        label: `${group.role} ${group.status}`,
        count: group._count._all,
      })),
    ),
    stockCounts: byLabel(
      countGroups.map((group) => ({ label: group.status, count: group._count._all })),
    ),
    countLines,
    migrations: { applied: migrations.length, latest: migrations.at(-1) ?? null },
    pins:
      given === null
        ? { checked: false, stored: keyIds.length }
        : {
            checked: true,
            stored: keyIds.length,
            underGivenPepper: keyIds.filter((row) => row.pinKeyId === given).length,
          },
  };
}

export const CENSUS_PREFIX = "[db:census]";

function groups(values: CensusGroup[]): string {
  return values.length === 0
    ? "none"
    : values.map((group) => `${group.label} ${group.count}`).join(", ");
}

/** The census as the lines `npm run db:census` prints, in AC-7's order. */
export function renderCensus(census: Census): string[] {
  const pins = census.pins.checked
    ? `pins: ${census.pins.underGivenPepper} of ${census.pins.stored} made under the given PIN_PEPPER`
    : `pins: ${census.pins.stored} stored, not checked: PIN_PEPPER is not set or not usable`;

  return [
    `locations: ${census.locations}`,
    `suppliers: ${census.suppliers}`,
    `item types: ${census.itemTypes}`,
    `items: ${census.items}, ${census.itemsNeedingReview} need review`,
    `prices: ${census.prices}`,
    `yard links: ${census.yardLinks}`,
    `profiles: ${groups(census.profiles)}`,
    `stock counts: ${groups(census.stockCounts)}`,
    `count lines: ${census.countLines}`,
    `migrations: ${census.migrations.applied} applied, latest ${census.migrations.latest ?? "none"}`,
    pins,
  ].map((line) => `${CENSUS_PREFIX} ${line}`);
}
