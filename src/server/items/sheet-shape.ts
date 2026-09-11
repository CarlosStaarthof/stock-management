import { shapeForRole } from "@/server/auth/role-shape";
import type { SessionUser } from "@/server/auth/session-user";
import type { CurrentPrice } from "@/server/items/price-selection";

/**
 * The yard sheet as a STAFF reader gets it: no `currentPrice` key at all (AC-14).
 *
 * These three live here rather than in `src/types/stock-count.ts` because
 * `AdminSheetEntry` names `CurrentPrice`, which is `src/server/`'s; and
 * `src/lib/count-messages.ts` imports the types module, so the types module may not reach
 * into `src/server/` even for a type — that is the trap `src/types/item-master.ts` records
 * in #6.
 */
export type StaffSheetEntry = {
  itemId: string;
  description: string;
  unitLabel: string | null;
  sortOrder: number;
  /** Why this row is here when `includeArchived` was asked for. */
  linkActive: boolean;
  itemActive: boolean;
  /**
   * DECLARED ABSENT, not merely undeclared.
   *
   * `currentPrice?: undefined` says, in the type system, "this shape never has a price" —
   * a staff entry that grew one would stop compiling. The key is genuinely missing at
   * runtime, which is what `Object.hasOwn(entry, "currentPrice") === false` asserts in
   * AC-14, because the staff branch of `sheetEntriesForRole` never writes it.
   *
   * It is spelled this way rather than left off the type entirely so that a caller holding
   * the union may still ASK for the price and be handed `undefined` — which is what
   * `/item-master/yards/<code>` does, and 006 AC-24 pins that page's behaviour as
   * unchanged. AC-14 permits this feature to edit exactly one assertion in
   * `item-assignment-service.db.test.ts` and no other line of it, so the union had to stay
   * readable by the code that was already there.
   */
  currentPrice?: undefined;
};

/** The same sheet for an `ADMIN`, and the ONLY shape that carries a price (006 AC-24). */
export type AdminSheetEntry = Omit<StaffSheetEntry, "currentPrice"> & {
  currentPrice: CurrentPrice | null;
};

/** What `listSheet` returns: one of two shapes, chosen from the session role. */
export type SheetEntry = StaffSheetEntry | AdminSheetEntry;

/**
 * The yard sheet's shape, chosen from the session role — and built only once.
 *
 * SPEC 007 AC-14, THE DECISION OF THE FEATURE, made by the user at approval. `listSheet`
 * is the one definition of a yard sheet (006 AC-24) and was `ADMIN`-only, because until #7
 * no staff caller existed. The caller that needs it most is now a `YARD_STAFF` user
 * starting a count, so the guard had to move. Two ways to move it were put:
 *
 *   * widen the guard and let the caller discard the price — the guarantee then rests on
 *     every future caller remembering, and #8, #9 and #14 all read sheets for staff; or
 *   * NEVER BUILD IT FOR STAFF.
 *
 * The second was chosen. `specs/domain-model.md` Part 6's rule is "not hidden — NOT SENT",
 * and "built, then discarded by a conscientious caller" is a weaker thing than "never
 * constructed". So the price builder below is a THUNK, called once per link inside the
 * admin branch and not at all inside the staff one — asserted with spy thunks in
 * `sheet-shape.test.ts`, exactly as 003 AC-17 asserts it of `shapeForRole` itself.
 *
 * It is a module of its own, and pure, for the reason `price-selection.ts` is: a function
 * that takes its builders as parameters can be spied on, and one that closes over them
 * cannot. There is no Prisma here and no `@/server/db` import, so the whole of AC-14's
 * shape half runs in `npm run test:unit` with no database.
 *
 * It deliberately does not name the price column — it moves whole `CurrentPrice` values
 * that `price-selection.ts` built — so spec 006 AC-31's nine-file list is unchanged.
 */
export function sheetEntriesForRole<TLink>(
  actor: SessionUser,
  links: readonly TLink[],
  toStaffEntry: (link: TLink) => StaffSheetEntry,
  buildCurrentPrice: (link: TLink) => CurrentPrice | null,
): SheetEntry[] {
  return shapeForRole<StaffSheetEntry[], AdminSheetEntry[]>(actor, {
    forStaff: () => links.map((link) => toStaffEntry(link)),
    forAdmin: () =>
      links.map((link) => ({ ...toStaffEntry(link), currentPrice: buildCurrentPrice(link) })),
  });
}

/**
 * The price on an entry, when the entry has one.
 *
 * `/item-master/yards/<code>` needs this because `listSheet` now returns a union, and a
 * page may not assume which half it was handed — the whole point of AC-14 is that the
 * answer comes from the session and not from the caller's expectations. It is a read, not a
 * conversion: a staff entry has no such key, so the answer is `null` and the page renders
 * `No price` — which no staff session can reach anyway, because all seven `/item-master`
 * routes still redirect one (006 AC-2).
 */
export function currentPriceOf(entry: SheetEntry): CurrentPrice | null {
  return entry.currentPrice ?? null;
}
