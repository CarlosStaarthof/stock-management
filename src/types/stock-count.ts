/**
 * Every shape feature #7 moves across a boundary, in one module that imports no runtime.
 *
 * IT LIVES HERE, AND AC-25 IS THE REASON. That criterion forbids the strings `SUBMITTED`
 * and `APPROVED` anywhere under `src/server/counts/**` or `src/app/stock-entry/**` — this
 * feature only ever creates a `DRAFT`, and a scan is what keeps that true rather than a
 * promise. The union has to be written down somewhere, so it is written down OUTSIDE both
 * scanned trees, following the precedent `src/types/item-master.ts` set in #6 for the same
 * kind of reason. Every branch on status in this feature is written `status !== "DRAFT"`,
 * never by naming the other two members.
 *
 * The second reason is the dependency rule: `src/lib/count-messages.ts` needs `Period` and
 * `CountStatus` to build its sentences, and `docs/architecture.md` forbids `src/lib/**`
 * from importing anything under `src/server/` except `@/server/errors`. A type module
 * under `src/types/` is reachable from `src/lib/`, `src/server/` and `src/app/` alike.
 */

/** The lifecycle of `specs/domain-model.md` Part 3. #9 owns every transition out of DRAFT. */
export type CountStatus = "DRAFT" | "SUBMITTED" | "APPROVED";

/** Declaration order, so a list of statuses always reads the same way. */
export const COUNT_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
] as const satisfies readonly CountStatus[];

/**
 * The month a count closes (Part 4). Not the day it was walked — that is `countDate`, and
 * the whole point of Part 4 is that the two are independent facts.
 */
export type Period = { periodYear: number; periodMonth: number };

/** One count, as it appears on a day of the calendar. */
export type CountBadge = {
  countId: string;
  /** `"DUBLIN"`. */
  locationCode: string;
  /** `"Dublin"`. */
  locationName: string;
  status: CountStatus;
  /** `"2026-09"` — the month it closes, which need not be the month it sits in. */
  periodKey: string;
};

/** `date` is `"YYYY-MM-DD"`. */
export type CalendarDay = { date: string; counts: CountBadge[] };

export type CalendarMonth = {
  /** `"2026-09"`. */
  monthKey: string;
  /** `"September 2026"`. */
  monthLabel: string;
  previousMonthKey: string;
  nextMonthKey: string;
  /** Today in the yard's zone, `"YYYY-MM-DD"` (AC-31). */
  todayKey: string;
  /** Every day of the month, ascending. Padding is the grid's business, not the data's. */
  days: CalendarDay[];
  countsInMonth: number;
  anyCountEver: boolean;
};

export type CountLineRow = {
  itemId: string;
  description: string;
  unitLabel: string | null;
  /**
   * The Supplier and Type filters of #8 read their values from these two fields, which is
   * why they are on the line rather than fetched a second time by the panel (008 AC-20).
   * `supplierName` is nullable because Dublin!A45 has no supplier in the workbook;
   * `typeName` is not, because `Item.itemTypeId` is required. Neither name matches
   * `/price|value|total|amount/i`, so 007 AC-17's staff walk is unaffected (008 AC-17).
   */
  supplierName: string | null;
  typeName: string;
  sortOrder: number;
  /**
   * A decimal STRING or null, never a JS number: `docs/architecture.md` § Money and
   * quantities, and `21.6128` tonnes is the reason. `null` is *not counted* — the
   * distinction the workbook's blank cell could not express (Invariant 5).
   */
  quantity: string | null;
};

export type CountForStaff = {
  countId: string;
  locationCode: string;
  locationName: string;
  /** `"2026-09"`. */
  periodKey: string;
  /** `"September 2026"`. */
  periodLabel: string;
  /** `"YYYY-MM-DD"`. */
  countDate: string;
  status: CountStatus;
  createdById: string;
  createdByName: string;
  lineCount: number;
  countedLineCount: number;
  uncountedLineCount: number;
  lines: CountLineRow[];
};

export type CountForAdmin = CountForStaff & {
  /** Items on this sheet with no `ItemPrice` in force. Invariant 4: their lines value at 0. */
  itemsWithoutPrice: number;
};

/** What `startCount` receives after `parseStartCountInput` has had it. */
export type StartCountInput = {
  locationCode: string;
  /** `"YYYY-MM-DD"`. */
  countDate: string;
  /** Derived by `periodForCountDate`, then possibly overridden by the user. */
  period: Period;
};

/** What a form hands the service: three strings, none of them trusted. */
export type StartCountRawInput = {
  locationCode: string | undefined;
  countDate: string | undefined;
  period: string | undefined;
};

/** A yard a count may be started at. No money, no sortOrder — the order is the array's. */
export type CountableYard = { code: string; name: string };

/** What `findCountForPeriod` answers with when this yard has already been counted. */
export type ExistingCount = {
  countId: string;
  status: CountStatus;
  /** `"YYYY-MM-DD"`. */
  countDate: string;
  createdByName: string;
};

/* ------------------------------------------------------------------ #8, the entry */

/**
 * One typed quantity for one line. A decimal STRING or `null`, never a JS number: the
 * endpoint refuses a JSON number outright (008 AC-10), because `21.6128` is a value a
 * float round trip loses and `null` is a fact a `0` would destroy (Invariant 5).
 */
export type QuantityEdit = {
  itemId: string;
  quantity: string | null;
};

/** The body `POST /api/counts/<id>/lines` accepts: 1 to 200 edits, and nothing else. */
export type SaveQuantitiesBody = {
  edits: QuantityEdit[];
};

/**
 * What `saveQuantities` answers with — ONE shape for both roles, because it carries no
 * money at all (008 AC-17). An id, a quantity per edited line as it was actually stored,
 * and three counts. There is no running total here and there is none on the screen: a
 * draft total could only come from today's prices, and the price snapshot column is null
 * until the count is submitted (Invariant 2), so the two would disagree the moment a price
 * changed. #9's submit summary is where the first total comes from (008 AC-18).
 *
 * The snapshot column is deliberately not spelled here: 006 AC-31 keeps it named by no
 * shipping module at all, and #9 is still its first reader.
 */
export type SaveQuantitiesResult = {
  countId: string;
  /** As persisted — read back after the write, never copied from the request (008 AC-10). */
  saved: QuantityEdit[];
  lineCount: number;
  countedLineCount: number;
  uncountedLineCount: number;
};

/* --------------------------------------------------- #9, signing and approving */

/**
 * The three things that ever happen to a count after it leaves `DRAFT`.
 *
 * There is no audit TABLE (009 Open question 6): `specs/domain-model.md` Part 3 is the
 * schema field for field, so a `StockCountEvent` model would mean amending the domain
 * model, writing a migration and adding an entry to `TRUNCATED_TABLES` — a decision for
 * the user rather than a side effect of this feature. The trail is `StockCount.notes`,
 * append-only, one line per event, built and parsed by `src/lib/count-audit.ts`.
 */
export type AuditEvent = "SUBMITTED" | "APPROVED" | "REOPENED";

export type AuditEntry = {
  /** ISO instant, exactly as `Date.prototype.toISOString` spells it. */
  at: string;
  event: AuditEvent;
  actorName: string;
  actorEmail: string;
  /** `REOPENED` only, and validated to a single line of 1–200 characters (009 AC-18). */
  reason: string | null;
};

/**
 * Who signed, who approved, when, and the drawn signature itself.
 *
 * ONE SHAPE FOR BOTH ROLES (009 AC-21), because there is no monetary fact it could
 * carry: `getLifecycleFacts` returns values that are deeply equal for a `YARD_STAFF`
 * actor and for an `ADMIN` on the same count, and a criterion asserts exactly that.
 */
export type CountLifecycleFacts = {
  countId: string;
  status: CountStatus;
  /** ISO instant. */
  submittedAt: string | null;
  signedByName: string | null;
  signedAt: string | null;
  /** The exact stored `d`, byte for byte (009 AC-7). Never a raster, never a document. */
  signaturePath: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  /**
   * Permitted, and recorded rather than refused (009 Open question 2, AC-16): the team is
   * two people at most, and a single administrator must be able to close the month.
   */
  signedAndApprovedBySamePerson: boolean;
  audit: AuditEntry[];
};

/** A line nobody has counted, named so the way out of Invariant 5 is a link (009 AC-4). */
export type UncountedLine = { itemId: string; description: string; unitLabel: string | null };

/**
 * The review-and-sign screen, for either role. NO EURO, FOR EITHER ROLE (009 AC-21):
 * every monetary figure in this feature lives on `/summary`, which no staff session can
 * reach at all.
 */
export type SubmitReviewForStaff = {
  countId: string;
  locationName: string;
  /** `"2026-09"`. */
  periodKey: string;
  /** `"September 2026"`. */
  periodLabel: string;
  /** `"YYYY-MM-DD"`. */
  countDate: string;
  status: CountStatus;
  lineCount: number;
  countedLineCount: number;
  uncountedLineCount: number;
  /** Every uncounted line, in sheet order. Never truncated, never filtered (009 AC-4). */
  uncounted: UncountedLine[];
  lifecycle: CountLifecycleFacts;
};

export type SubmitReviewForAdmin = SubmitReviewForStaff & {
  /** Invariant 4, as a count of ITEMS rather than a euro figure. */
  itemsWithoutPrice: number;
  /** Which ones. A warning that names the items is actionable; a number is not. */
  linesWithoutPrice: { itemId: string; description: string }[];
};

/**
 * There is no staff summary, and `never` is the honest spelling of that.
 *
 * `getCountSummary` raises `ForbiddenError` for a staff actor rather than returning a
 * reduced object, because there is no money-free thing it could usefully answer — that is
 * `getCount`'s job and it already exists (009 AC-22). `ValuedLine` and
 * `CountSummaryForAdmin` are NOT declared here: they name the price snapshot column, and
 * 009 AC-26 permits exactly two files in the whole tree to do that. They are declared in
 * `src/server/counts/count-summary-service.ts`, which is one of them — the same layout
 * #6 used for `PriceRow` in `src/server/items/price-selection.ts`.
 */
export type CountSummaryForStaff = never;

/** What `submitCount` receives after the signature grammar has had it (009 AC-5). */
export type SubmitCountInput = { signaturePath: string };

/**
 * ONE ROW OF THE ADMIN SUMMARY, AS A SCREEN MAY HOLD IT (009 AC-26).
 *
 * The service's own `ValuedLine` carries the price on the snapshot column itself, and 009
 * AC-26 pins that string to exactly two files — neither a page nor a component. So the
 * value crosses the last boundary on a field named for what it IS on a screen, an amount,
 * rather than for the column it came from: `summaryRows` in
 * `src/server/counts/count-summary-service.ts` is the one mapper, and it lives in a file
 * that is allowed to say both words.
 *
 * `unitAmount` is `null` and never `0` for a line whose item had no price in force
 * (Invariant 4): `noPrice` is what the row is tagged with, and `lineValue` is `"0"`.
 */
export type SummaryRow = {
  itemId: string;
  description: string;
  unitLabel: string | null;
  quantity: string | null;
  /** A decimal STRING, or `null` when no price was in force (Invariant 4). */
  unitAmount: string | null;
  /** `quantity × (the amount ?? 0)`, exact and unrounded. Rendered rounded. */
  lineValue: string;
  noPrice: boolean;
};

/* ------------------------------------------------- #10, reading a count back */

/**
 * Both yards, or one of them. `BOTH` is a SCOPE, not a claim that both were counted: on a
 * day only Clonmel was walked, `BOTH` shows the Clonmel badge and nothing beside it.
 *
 * It is declared here rather than in `src/server/counts/stock-takes-input.ts` for the
 * reason `CountStatus` is: `src/lib/stock-takes-view.ts` needs it, and
 * `docs/architecture.md` forbids `src/lib/**` from importing anything under `src/server/`
 * except `@/server/errors`. The parser that produces one still builds on
 * `locationCodeSchema`, so which yards exist is stated in exactly one place.
 */
export type YardScope = "DUBLIN" | "CLONMEL" | "BOTH";

/** Declaration order: `Location.sortOrder`, then the scope that is both of them. */
export const YARD_SCOPES = [
  "DUBLIN",
  "CLONMEL",
  "BOTH",
] as const satisfies readonly YardScope[];

/**
 * Which rows a count view shows. `specs/domain-model.md` Part 5: a count view defaults to
 * HELD — "see what we have, not what we don't" — and 35 of the 82 rows in the most recent
 * Dublin count are zero or blank.
 */
export type HeldView = "held" | "all";

/**
 * A count, as a jump target. Money-free, and ONE SHAPE FOR BOTH ROLES (010 AC-12).
 *
 * `monthKey` and `periodKey` are both `"YYYY-MM"` and they are different facts: a count
 * dated `2026-10-01` closing `2026-09` sits in OCTOBER's grid (007 AC-20), so a jump that
 * moved by period would land the reader on a month the count is not drawn in.
 */
export type CountRef = {
  countId: string;
  locationCode: string;
  locationName: string;
  /** `"YYYY-MM-DD"`. */
  countDate: string;
  /** `"2026-10"` — the month it SITS in, which is where the calendar jump goes. */
  monthKey: string;
  /** `"2026-09"` — the month it CLOSES. */
  periodKey: string;
  status: CountStatus;
};

/** The nearest count either side of a cursor, in `(countDate, id)` order, or `null`. */
export type CountNeighbours = { previous: CountRef | null; next: CountRef | null };

/** One line of a historical count. Item, quantity, unit — Part 6's row, and nothing more. */
export type CountHistoryLine = {
  itemId: string;
  description: string;
  unitLabel: string | null;
  /**
   * A decimal STRING or `null`, exactly as stored, NEVER rounded and never a JS number.
   * `null` is *nobody looked*; `"0"` is *counted, none held*. Keeping those two apart is
   * the whole of Invariant 5, and it has to survive a read as well as a write.
   */
  quantity: string | null;
  sortOrder: number;
};

/**
 * ONE SHAPE FOR BOTH ROLES (010 AC-12, AC-13). There is no `…ForAdmin` variant, because
 * there is no monetary fact this screen may carry for anybody: every euro in the product
 * lives on `/stock-entry/counts/[id]/summary`, which is #9's and not this feature's.
 *
 * `getCount`'s `itemsWithoutPrice` is dropped by `getCountHistory`'s mapper rather than by
 * a scan exemption for the screen — #9's rule, applied where the boundary actually is.
 */
export type CountHistoryView = {
  countId: string;
  locationCode: string;
  locationName: string;
  /** `"2026-09"`. */
  periodKey: string;
  /** `"September 2026"`. */
  periodLabel: string;
  /** `"YYYY-MM-DD"`. */
  countDate: string;
  status: CountStatus;
  countedByName: string;
  lineCount: number;
  uncountedLineCount: number;
  /** EVERY line, in sheet order. The held view is applied by a pure predicate, not here. */
  lines: CountHistoryLine[];
};

/** Where `findNeighbourCounts` starts from. `countId` is `null` for a whole-day cursor. */
export type CountCursor = { date: string; countId: string | null };
