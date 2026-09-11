import {
  COUNT_NO_LONGER_EXISTS,
  countAlreadyExists,
  formatMonthLabel,
  noItemsOnSheet,
  yardNotFound,
} from "@/lib/count-messages";
import { todayInYard } from "@/lib/yard-time";
import { assertUser } from "@/server/auth/guards";
import type { SessionUser } from "@/server/auth/session-user";
import { countForRole } from "@/server/counts/count-shape";
import { parseStartCountInput } from "@/server/counts/count-input";
import {
  formatPeriodKey,
  formatPeriodLabel,
  monthBounds,
  monthKeyOf,
  nextMonthKey,
  parseMonthKey,
  previousMonthKey,
} from "@/server/counts/period";
import { db } from "@/server/db";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import { listSheet } from "@/server/items/item-assignment-service";
import { isoDateOf } from "@/server/items/price-selection";
import type {
  CalendarDay,
  CalendarMonth,
  CountBadge,
  CountForAdmin,
  CountForStaff,
  CountLineRow,
  CountStatus,
  CountableYard,
  ExistingCount,
  Period,
  StartCountRawInput,
} from "@/types/stock-count";

/**
 * Starting a stock count, and everything a screen needs to decide whether to.
 *
 * FOUR RULES THIS MODULE ENCODES, each of which has a criterion rather than a comment
 * keeping it true.
 *
 *  1. THE ACTOR IS THE SESSION. Every exported function takes an explicit `actor` and
 *     begins with `assertUser(actor)`. It comes from `requireUser()` / `requireUserPage()`
 *     and from nowhere else — never from a form field (AC-4). There is no role refusal in
 *     this feature: `specs/domain-model.md` Part 6 gives both roles the calendar, the
 *     count and the `DRAFT`.
 *  2. A COUNT IS KEYED BY ITS PERIOD AND DATED BY ITS DAY. `@@unique([locationId,
 *     periodYear, periodMonth])` is the database's answer to "one count per yard per
 *     month"; `ConflictError` is the domain's, and a Postgres string never reaches a
 *     screen (AC-10, `docs/architecture.md`).
 *  3. A NEW COUNT IS EMPTY, NOT ZERO. One line per sheet item with `quantity = null` —
 *     *not counted*, which is the distinction the workbook's blank cell could not express
 *     (Invariant 5). `0` means counted and none held, and only a human writes it, in #8.
 *  4. THIS FEATURE INSERTS AND READS, AND DOES NOTHING ELSE. There is no update, no
 *     upsert and no delete of a count or a line anywhere in this module, and no value of
 *     `status` other than the schema's default is ever written (AC-25).
 *
 * The price snapshot column is not named here, and not written: it stays null while DRAFT
 * (Invariant 2) and #9 is still its first writer (AC-15).
 */

/** A `@db.Date` column is stored at UTC midnight; `YYYY-MM-DD` is the whole of it. */
function asDateColumn(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

/**
 * A yard, by code. `NotFoundError` naming the code, never a `ValidationError`: the caller
 * asked for a yard that does not exist and there is no field on the screen to put a
 * message beside (AC-13), which is the split `item-assignment-service.ts` already makes.
 */
async function yardByCode(code: string): Promise<{ id: string; code: string; name: string }> {
  const location = await db.location.findUnique({
    where: { code },
    select: { id: true, code: true, name: true },
  });
  if (location === null) throw new NotFoundError(yardNotFound(code));
  return location;
}

/**
 * Prisma's unique-violation code, recognised structurally.
 *
 * `@prisma/client` is imported by `src/server/db.ts` and by nothing else
 * (`docs/architecture.md`), so the error is identified by the shape it has rather than by
 * an imported class — and the value that reaches a screen is this module's own sentence,
 * never the driver's (AC-10, AC-27).
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "P2002"
  );
}

/* --------------------------------------------------------------------- the calendar */

/**
 * The month the calendar opens on: the month of the most recent stock take, or the month
 * containing today in the yard when there has never been one (AC-22).
 *
 * The development database holds 0 `StockCount` rows today, so the second branch is the
 * one the first user will meet.
 */
export async function defaultMonthKey(actor: SessionUser): Promise<string> {
  assertUser(actor);

  const latest = await db.stockCount.findFirst({
    orderBy: { countDate: "desc" },
    select: { countDate: true },
  });

  return latest === null ? monthKeyOf(todayInYard()) : monthKeyOf(isoDateOf(latest.countDate));
}

/**
 * One month of days, with the counts that happened on each of them.
 *
 * COUNTS ARE PLACED BY `countDate`, NOT BY PERIOD (AC-20, open question 4). It is a
 * calendar of days, so it shows the day the yard was walked; the period rides along in the
 * badge. A count dated `2026-10-01` that closes `2026-09` appears in October.
 */
export async function listCalendarMonth(
  actor: SessionUser,
  rawMonthKey: string,
): Promise<CalendarMonth> {
  assertUser(actor);

  const monthKey = parseMonthKey(rawMonthKey);
  const { first, last } = monthBounds(monthKey);

  const [rows, everCount] = await Promise.all([
    db.stockCount.findMany({
      where: { countDate: { gte: asDateColumn(first), lte: asDateColumn(last) } },
      select: {
        id: true,
        countDate: true,
        status: true,
        periodYear: true,
        periodMonth: true,
        location: { select: { code: true, name: true, sortOrder: true } },
      },
    }),
    db.stockCount.count(),
  ]);

  const byDate = new Map<string, (CountBadge & { locationSortOrder: number })[]>();
  for (const row of rows) {
    const dateKey = isoDateOf(row.countDate);
    const badges = byDate.get(dateKey) ?? [];
    badges.push({
      countId: row.id,
      locationCode: row.location.code,
      locationName: row.location.name,
      status: row.status as CountStatus,
      periodKey: formatPeriodKey({ periodYear: row.periodYear, periodMonth: row.periodMonth }),
      locationSortOrder: row.location.sortOrder,
    });
    byDate.set(dateKey, badges);
  }

  const days: CalendarDay[] = [];
  const lastDay = Number(last.slice(8, 10));
  for (let day = 1; day <= lastDay; day += 1) {
    const dateKey = `${monthKey}-${String(day).padStart(2, "0")}`;
    const badges = byDate.get(dateKey) ?? [];
    days.push({
      date: dateKey,
      // Dublin before Clonmel, in `Location.sortOrder` (AC-20). `locationSortOrder` is
      // dropped on the way out: it is how the order was decided, not a fact about a count.
      counts: badges
        .sort(
          (left, right) =>
            left.locationSortOrder - right.locationSortOrder ||
            left.locationName.localeCompare(right.locationName),
        )
        .map((badge) => ({
          countId: badge.countId,
          locationCode: badge.locationCode,
          locationName: badge.locationName,
          status: badge.status,
          periodKey: badge.periodKey,
        })),
    });
  }

  return {
    monthKey,
    monthLabel: formatMonthLabel(monthKey),
    previousMonthKey: previousMonthKey(monthKey),
    nextMonthKey: nextMonthKey(monthKey),
    todayKey: todayInYard(),
    days,
    countsInMonth: rows.length,
    anyCountEver: everCount > 0,
  };
}

/* ---------------------------------------------------------------------- the yards */

/** Every yard a count may be started at, in `Location.sortOrder` (AC-23). */
export async function listCountableYards(actor: SessionUser): Promise<CountableYard[]> {
  assertUser(actor);

  const yards = await db.location.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { code: true, name: true },
  });

  return yards.map((yard) => ({ code: yard.code, name: yard.name }));
}

/* ------------------------------------------------------------------- coming back */

/**
 * The count this yard already has for this period, or `null` (AC-11).
 *
 * It is what stops a dropped signal becoming a second count: the confirm screen offers the
 * existing one instead of a *Start count* control, and AC-10 is the backstop for a direct
 * POST.
 */
export async function findCountForPeriod(
  actor: SessionUser,
  locationCode: string,
  period: Period,
): Promise<ExistingCount | null> {
  assertUser(actor);

  const yard = await yardByCode(locationCode);

  const existing = await db.stockCount.findUnique({
    where: {
      locationId_periodYear_periodMonth: {
        locationId: yard.id,
        periodYear: period.periodYear,
        periodMonth: period.periodMonth,
      },
    },
    select: {
      id: true,
      status: true,
      countDate: true,
      createdBy: { select: { name: true } },
    },
  });

  if (existing === null) return null;

  return {
    countId: existing.id,
    status: existing.status as CountStatus,
    countDate: isoDateOf(existing.countDate),
    createdByName: existing.createdBy.name,
  };
}

/* ------------------------------------------------------------------ the one write */

/**
 * Create a `DRAFT` count and one line per item on that yard's sheet.
 *
 * Everything is refused BEFORE anything is written: an unknown yard, an empty sheet and a
 * count that already exists for this yard and period. What is written is written in ONE
 * transaction, so a failure half way leaves no count at all (AC-13).
 *
 * Pre-population comes from `listSheet` — the one definition of a yard sheet (006 AC-24) —
 * so an archived item and an unassigned link are absent by construction rather than by a
 * filter this module would have to keep in step. Sheet ORDER is not copied onto the line:
 * it is `ItemLocation.sortOrder`, read at display time, so moving a row later moves it on
 * every count including the ones already written (AC-12).
 *
 * Returns the new count's id, which is the only thing the caller needs to redirect.
 */
export async function startCount(
  actor: SessionUser,
  raw: StartCountRawInput,
): Promise<string> {
  const user = assertUser(actor);

  const input = parseStartCountInput(raw);
  const yard = await yardByCode(input.locationCode);
  const periodKey = formatPeriodKey(input.period);

  const sheet = await listSheet(user, yard.code);
  if (sheet.length === 0) {
    throw new ValidationError("locationCode", noItemsOnSheet(yard.name));
  }

  // Checked first, so the ordinary case is the domain's own sentence rather than a caught
  // driver error - and mapped below as well, because two requests can still race (AC-10).
  const existing = await db.stockCount.findUnique({
    where: {
      locationId_periodYear_periodMonth: {
        locationId: yard.id,
        periodYear: input.period.periodYear,
        periodMonth: input.period.periodMonth,
      },
    },
    select: { id: true },
  });
  if (existing !== null) {
    throw new ConflictError(countAlreadyExists(yard.code, periodKey));
  }

  try {
    return await db.$transaction(async (tx) => {
      const count = await tx.stockCount.create({
        data: {
          locationId: yard.id,
          periodYear: input.period.periodYear,
          periodMonth: input.period.periodMonth,
          countDate: asDateColumn(input.countDate),
          createdById: user.id,
          // `status` is the schema's DRAFT default and is deliberately not written here:
          // this feature has no other value to give it (AC-25).
        },
        select: { id: true },
      });

      // One line per sheet item. `quantity` is omitted, so it is NULL - *not counted*,
      // which is the whole point (Invariant 5). So are the note and the price snapshot:
      // #9 is the first writer of the latter (Invariant 2).
      await tx.stockCountLine.createMany({
        data: sheet.map((entry) => ({ stockCountId: count.id, itemId: entry.itemId })),
      });

      return count.id;
    });
  } catch (error) {
    // The loser of a race gets the same sentence the winner's rival got above, so the
    // screen cannot tell the two paths apart and neither can a Postgres string get out.
    if (isUniqueViolation(error)) {
      throw new ConflictError(countAlreadyExists(yard.code, periodKey));
    }
    throw error;
  }
}

/* ------------------------------------------------------------------- reading one */

/** The `Item` rows on this count, with the sheet position they are displayed at. */
async function sortOrderByItem(
  locationId: string,
  itemIds: readonly string[],
): Promise<Map<string, number>> {
  const links = await db.itemLocation.findMany({
    where: { locationId, itemId: { in: [...itemIds] } },
    select: { itemId: true, sortOrder: true },
  });

  return new Map(links.map((link) => [link.itemId, link.sortOrder]));
}

/**
 * Items on this sheet with no `ItemPrice` in force on the count date.
 *
 * Invariant 4: their lines value at 0, and an `ADMIN` is told so before the count is
 * submitted. It is a count of ITEMS and not a euro — the only money-adjacent fact on this
 * surface — and the query lives inside `getCount`'s admin thunk, so a staff request never
 * issues it at all (AC-16). It names no price column (AC-15).
 */
async function countItemsWithoutPrice(
  itemIds: readonly string[],
  asOf: string,
): Promise<number> {
  return db.item.count({
    where: {
      id: { in: [...itemIds] },
      prices: { none: { effectiveFrom: { lte: asDateColumn(asOf) } } },
    },
  });
}

/**
 * One count, shaped by the session role (AC-16).
 *
 * `countId` is the only argument derived from a request. The shape is chosen by
 * `shapeForRole` from `actor.role` alone, and the admin thunk is `async` so the extra
 * query is inside the branch rather than merely its key.
 */
export async function getCount(
  actor: SessionUser,
  countId: string,
): Promise<CountForStaff | CountForAdmin> {
  const user = assertUser(actor);

  const row = await db.stockCount.findUnique({
    where: { id: countId },
    select: {
      id: true,
      periodYear: true,
      periodMonth: true,
      countDate: true,
      status: true,
      createdById: true,
      createdBy: { select: { name: true } },
      location: { select: { id: true, code: true, name: true } },
      lines: {
        select: {
          itemId: true,
          quantity: true,
          item: { select: { description: true, unitLabel: true } },
        },
      },
    },
  });

  if (row === null) throw new NotFoundError(COUNT_NO_LONGER_EXISTS);

  const itemIds = row.lines.map((line) => line.itemId);
  const sortOrders = await sortOrderByItem(row.location.id, itemIds);

  const lines: CountLineRow[] = row.lines
    .map((line) => ({
      itemId: line.itemId,
      description: line.item.description,
      unitLabel: line.item.unitLabel,
      // A line whose link was unassigned after the count started has no position left on
      // the sheet; it sorts to the end rather than to the top, where a 0 would put it.
      sortOrder: sortOrders.get(line.itemId) ?? Number.MAX_SAFE_INTEGER,
      // A decimal STRING, converted from Prisma's Decimal. Never a JS number: the workbook
      // holds `21.6128` tonnes (docs/architecture.md § Money and quantities).
      quantity: line.quantity === null ? null : line.quantity.toString(),
    }))
    // `ItemLocation.sortOrder` ascending, then description - the same comparator
    // `listSheet` uses, so the count reproduces the sheet element for element (AC-12).
    .sort(
      (left, right) =>
        left.sortOrder - right.sortOrder || left.description.localeCompare(right.description),
    );

  const period: Period = { periodYear: row.periodYear, periodMonth: row.periodMonth };
  const countDate = isoDateOf(row.countDate);
  const countedLineCount = lines.filter((line) => line.quantity !== null).length;

  const forStaff: CountForStaff = {
    countId: row.id,
    locationCode: row.location.code,
    locationName: row.location.name,
    periodKey: formatPeriodKey(period),
    periodLabel: formatPeriodLabel(period),
    countDate,
    status: row.status as CountStatus,
    createdById: row.createdById,
    createdByName: row.createdBy.name,
    lineCount: lines.length,
    countedLineCount,
    uncountedLineCount: lines.length - countedLineCount,
    lines,
  };

  return countForRole(
    user,
    async () => forStaff,
    async () => ({
      ...forStaff,
      itemsWithoutPrice: await countItemsWithoutPrice(itemIds, countDate),
    }),
  );
}
