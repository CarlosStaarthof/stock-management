# 006 — Item master administration

**Feature id:** 6   **Status:** approved   **Approved:** 2026-09-10
**Depends on:** #3 `auth_and_roles` (session, `requireRole`, `assertRole`, the page guards,
the typed errors and the error→status mapping), #4 `domain_schema` (every table this writes,
the two seeded `Location` rows, the `Item_description_not_empty` CHECK and the `Restrict`
foreign keys), #5 `seed_from_workbook` (the 140 items this screen edits, `normaliseUnit`,
and the `needsReview` / `notes` flags it set), #2 `app_scaffold` (Tailwind, the shared error
boundary, the two vitest configs)

## Purpose

This is **the first real screen in the application**. Everything before it was identity,
schema and an importer whose interface was stdout; from here the database is the system of
record and a human maintains it. Without this screen the 15 items #5 flagged can only be
fixed with SQL, a new one-off item cannot be added before a count needs it, a price can
never change, and no item can be taken off a yard sheet — which is the failure the product
brief opens with, a printed sheet a third of which asks about stock that is not there.

It is also where the money boundary changes shape for the first time. `specs/domain-model.md`
Part 6 puts "Item master, prices, per-yard assignment" and "Any monetary figure at all" in
the `ADMIN` column and marks both ❌ for `YARD_STAFF`. So here the boundary is a **route**
boundary, not a response-shaping one: there is no `ItemForStaff`, because no part of this
feature is reachable by a staff session at all.

## Scope boundary

**In:** create, edit, archive, restore and (when nothing references it) delete items;
create, rename, archive, restore and delete suppliers; create, rename, reorder and delete
item types; add versioned prices; assign an item to a yard, unassign it, and reorder the
yard sheet; find and fix the flagged and conflicted items #5 imported.

**Out, and owned elsewhere:** #15 `item_housekeeping` owns the **dormant**-item worklist —
`quantity = 0` across the last three counted periods (Part 5) — and the one-click bulk
archive built on it. That worklist cannot exist yet: it is derived from `StockCountLine`
rows, and there are none until #7–#9. #15's rows link **into** this screen, because this is
where a fix is made. See *Out of scope* for the full boundary.

**No migration.** `prisma/schema.prisma` and everything under `prisma/migrations/` are
byte-identical after this feature. Part 3's schema is what #4 shipped and what this screen
edits.

**No route handler and no client-side fetch.** Every read is a server component reading
query parameters; every write is a server action. So this feature emits no JSON at all, and
the only response body a session can obtain from it is HTML — which is why AC-2 asserts on
raw response text rather than on `deepKeys`.

## User stories

- As an **ADMIN**, I can find the 15 items the importer flagged in one click, see for each
  one what is missing, fix it, and mark it reviewed — so the flags shrink to zero instead of
  becoming background noise.
- As an **ADMIN**, I can change a supplier price and be certain that every count already
  submitted still reads exactly what it read yesterday, because a price is added, never
  overwritten.
- As an **ADMIN**, I can add the one-off item a job has just brought into the yard, put it
  on the right yard's sheet, and have it appear in the next count.
- As an **ADMIN**, I can archive `Swept Path Markers for Transdev` when the job ends, and
  know that every historical line still names it and still values it.
- As an **ADMIN**, I can read the note on `MMA Paints - Red` saying Dublin calls it
  `1 Unit` and Clonmel calls it `16kg`, decide which is right, and fix it on the same page.
- As an **ADMIN**, I can move an item up or down its yard sheet so the on-screen order
  matches the order the yard is actually walked in.
- As a **YARD_STAFF** user, I cannot reach any of this — not the screen, not a price, not by
  editing a URL — because the refusal is the server's, in three places, and the page content
  is never sent.
- As the **implementer of #7 and #8**, I can call one function to get a yard's sheet in
  order, and one to get the price effective on a date, instead of re-deriving either.

## Data touched

| Model | Read | Written |
|---|---|---|
| `Item` | yes | **insert, update, delete** (delete only when no `StockCountLine` references it) |
| `ItemPrice` | yes | **insert only** — never updated, never deleted (AC-13) |
| `ItemLocation` | yes | insert and update (`active`, `sortOrder`). **Never deleted** (AC-22) |
| `Supplier` | yes | insert, update, delete (delete only when no `Item` references it) |
| `ItemType` | yes | insert, update, delete (delete only when no `Item` references it) |
| `Location` | yes, by `code` | never — #4's migration owns both yards |
| `StockCountLine` | **count only**, to decide whether an item may be deleted | never |
| `StockCount`, `User` | never | never |

Deleting an `Item` cascades its `ItemPrice` and `ItemLocation` rows (004 AC-19, AC-20e).
That is the only place this feature causes a row to disappear other than a supplier or a
type nothing references.

**No new field, no new column, no migration.** `needsReview`, `notes`, `active` and
`sortOrder` all exist; this feature is the first thing that writes them from a screen.

## The refusal, reusing #3 and inventing nothing

Three mechanisms, all already shipped, layered so that removing any one of them still
leaves the screen closed:

1. **Middleware.** `PROTECTED_PATHS` in `src/lib/auth-config.ts` gains `"/item-master"`, and
   `src/middleware.ts`'s matcher gains the static literal `"/item-master/:path*"`. An
   unauthenticated request is redirected to `/sign-in?callbackUrl=…` at the edge and no page
   content is sent (003 AC-12). The middleware decides *signed in or not* and nothing else —
   it still imports nothing from `@prisma/client`.
2. **The page guard.** Every page under `/item-master` begins with
   `await requireAdminPage("item-master")` from `src/app/page-guards.ts`, which calls
   `requireRole("ADMIN")` — a role read from the stored `User` row, never from the token,
   the query string, a header or a cookie (003 AC-18) — and redirects a `YARD_STAFF` session
   to `/stock-entry?denied=item-master`. That page already renders
   `ACCESS_DENIED_MESSAGE` for any `denied` value, so **no string and no page changes**.
3. **The service.** Every mutation takes an explicit `actor: SessionUser` and starts with
   `assertRole(actor, "ADMIN")` from `src/server/auth/guards.ts`, throwing `ForbiddenError`
   with the message `ADMIN is required for this action`. The actor comes from
   `requireRole("ADMIN")` inside the action and from nowhere else — never from a form field.

**`shapeForRole` is not used by this feature, and that is not an oversight.** It exists for
surfaces both roles reach (`CountForStaff` / `CountForAdmin` in #8). Here there is no staff
shape to choose, because there is no staff-reachable response: the money boundary is drawn
at the door, which is the strongest place to draw it.

**No `loading.tsx` at or above `src/app/item-master/`.** #3's close records why: a
`loading.tsx` puts a Suspense boundary above every page below it, the shell flushes, and a
server-side `redirect()` degrades from a 307 into a 200 carrying the page shell — a refusal
`curl` would accept. A Suspense boundary *inside* a guarded page, after the guard has
already run, is permitted and is how a slow panel streams.

## Contract

### Routes — seven, all `ADMIN`-only, all `export const dynamic = "force-dynamic"`

| Route | What it is |
|---|---|
| `/item-master` | The item list. Query: `?q=`, `?filter=active\|needs-review\|notes\|archived`, `?supplierId=`, `?itemTypeId=`, `?locationCode=DUBLIN\|CLONMEL` |
| `/item-master/items/new` | Create an item |
| `/item-master/items/[id]` | Edit one item: details, price list, yard assignment, notes |
| `/item-master/items/[id]/delete` | Confirm deletion, naming the item. `GET` changes nothing |
| `/item-master/suppliers` | Suppliers: create, rename, archive, restore, delete |
| `/item-master/types` | Item types: create, rename, move up / down, delete |
| `/item-master/yards/[code]` | One yard's sheet order: assigned items in `sortOrder`, move up / down, unassign |

Search matches `description` case-insensitively as a substring. Filters combine with **AND**
across categories. `filter=active` is the default and shows `active = true` only;
`filter=archived` shows `active = false` only; `filter=needs-review` shows active items with
`needsReview = true`; `filter=notes` shows active items whose `notes` is not null. Default
order is `description` ascending, case-insensitive. There is no pagination: 140 items is one
page, and a filter is a better answer than a page control.

### Server actions — `src/app/item-master/actions.ts`

Each obtains its actor with `await requireRole("ADMIN")`, calls exactly one service, and
either redirects on success or returns a `{ error, field? }` form state rendered inline.

`createItemAction`, `updateItemAction`, `archiveItemAction`, `restoreItemAction`,
`deleteItemAction`, `markItemReviewedAction`, `addItemPriceAction`, `assignItemAction`,
`unassignItemAction`, `moveItemInSheetAction`, `createSupplierAction`, `renameSupplierAction`,
`archiveSupplierAction`, `restoreSupplierAction`, `deleteSupplierAction`,
`createItemTypeAction`, `renameItemTypeAction`, `moveItemTypeAction`, `deleteItemTypeAction`.

### Services — `src/server/items/`

| Module | Exports | Touches Prisma |
|---|---|---|
| `item-service.ts` | `listItems(actor, query)`, `getItem(actor, id)`, `createItem(actor, input)`, `updateItem(actor, id, input)`, `setItemActive(actor, id, active)`, `deleteItem(actor, id)`, `markItemReviewed(actor, id)` | yes |
| `item-price-service.ts` | `listPrices(actor, itemId)`, `addPrice(actor, input)` | yes — **inserts only** |
| `item-assignment-service.ts` | `listSheet(actor, locationCode, options?)`, `assignItemToLocation(actor, itemId, locationCode)`, `unassignItemFromLocation(actor, itemId, locationCode)`, `moveItemInSheet(actor, itemId, locationCode, direction)` | yes |
| `supplier-service.ts` | `listSuppliers(actor, options?)`, `createSupplier`, `renameSupplier`, `setSupplierActive`, `deleteSupplier` | yes |
| `item-type-service.ts` | `listItemTypes(actor)`, `createItemType`, `updateItemType`, `moveItemType`, `deleteItemType` | yes |
| `item-master-input.ts` | Zod schemas parsed at the edge of `src/server/` | no — **pure** |
| `price-selection.ts` | `selectCurrentPrice(prices, asOf)` | no — **pure** |
| `review-reasons.ts` | `reviewReasons(item): ReviewReason[]` | no — **pure** |
| `src/lib/money.ts` | `formatPriceExact(value: string): string` | no — **pure** |
| `src/lib/item-master-messages.ts` | the exact literals the criteria quote | no — **pure** |

Three pure modules and the two `src/lib/` ones are why a third of these criteria run in
`npm run test:unit` with no database, as #5's read → plan → write split did.

```ts
type ReviewReason = "MISSING_SUPPLIER" | "MISSING_UNIT" | "MISSING_PRICE";

type ItemRow = {
  id: string;
  description: string;
  supplierId: string | null;
  supplierName: string | null;
  supplierActive: boolean | null;
  itemTypeId: string;
  itemTypeName: string;
  unitLabel: string | null;
  unitKind: UnitKind;
  unitQuantityKg: string | null;             // decimal string or null, never a number
  currentPrice: { unitPrice: string; currency: string; effectiveFrom: string } | null;
  yards: ("DUBLIN" | "CLONMEL")[];           // active links only, in Location.sortOrder
  active: boolean;
  needsReview: boolean;
  reviewReasons: ReviewReason[];
  hasNote: boolean;
};

type ItemListPage = {
  rows: ItemRow[];
  counts: { active: number; needsReview: number; notes: number; archived: number };
};

type ItemDetail = ItemRow & {
  notes: string | null;
  prices: {
    id: string; unitPrice: string; currency: string;
    effectiveFrom: string;                    // "YYYY-MM-DD"
    label: string | null; isCurrent: boolean;
  }[];                                        // newest effectiveFrom first
  links: { locationCode: string; locationName: string; sortOrder: number; active: boolean }[];
  lineCount: number;                          // StockCountLine rows naming this item
};

type ItemInput = {
  description: string;                        // trimmed, non-empty
  supplierId: string | null;
  itemTypeId: string;
  unitLabel: string | null;                   // trimmed; "" becomes null
  notes: string | null;
};

type PriceInput = {
  itemId: string;
  unitPrice: string;                          // decimal string, <= 8 dp, never a JS number
  effectiveFrom: string;                      // "YYYY-MM-DD"
  label: string | null;
};
```

Every monetary and quantity field crossing a service boundary is a **string**, converted from
Prisma `Decimal` with `.toString()` and back by handing the string to Prisma.
`docs/architecture.md` § Money and quantities forbids a JavaScript `number` for anything the
database stores as a decimal, and `6.11764706` is exactly the value #5 fought for.

### The rules this contract encodes

**A price is added, never edited (Part 2, Invariant 2).** The price panel has one control:
*Add a price*. It pre-fills `effectiveFrom` with today and `label` with `<year> Prices`. The
existing rows are read-only, newest first, and the one in force carries a `Current` badge.
`selectCurrentPrice(prices, asOf)` returns the row with the greatest `effectiveFrom` that is
**on or before** `asOf`, or `null`. #8 and #9 will call the same function with `countDate` to
write `unitPriceSnapshot`, which is why it is pure and separately tested.

**`needsReview` is raised by the system and cleared only by a human.** Any save that leaves
an item with no supplier, no `unitLabel` or no `ItemPrice` sets `needsReview = true`.
Nothing sets it to `false` except `markItemReviewed`, and that refuses while any
`reviewReasons` remains. Automatic clearing would silently unflag the two below-total fuel
rows, which are flagged for provenance and are missing nothing (005 open question 1); a
purely manual flag would let an admin dismiss a price-less item. One rule closes both.

**Archiving is `active = false`, and delete is attempted rather than pre-checked.**
`deleteItem` issues the delete; when Postgres refuses it with
`violates RESTRICT setting of foreign key constraint` (004 AC-20b), the service counts the
lines and throws `ConflictError`. No pre-check means no window between the check and the
delete, and `docs/architecture.md` § Error handling means the raw message never leaves the
service.

## UI states

- **Empty.** No items at all: `No items yet. Run npm run seed:workbook, or add the first
  item.` with the *Add item* control. A filter or search matching nothing:
  `No items match those filters.` with a *Clear filters* link back to `/item-master`. An item
  with no price: `No price recorded. Lines for this item will count as 0 and raise a warning
  on the count summary.` (Invariant 4). A yard sheet with no assigned items:
  `No items are assigned to Dublin yet.`
- **Loading.** Submit controls show a pending state and cannot be submitted twice.
  Navigation between filters is a plain link, so the browser's own progress is the loading
  state — and there is deliberately **no `loading.tsx` at or above `src/app/item-master/`**,
  because one turns the role refusal into a 200 (see *The refusal*).
- **Error.** A `ValidationError` renders inline beside the field it names, with the typed
  values kept. A `ConflictError` renders above the form. Neither ever shows a Prisma or
  Postgres string. Anything else reaches the shared error boundary from #2.
- **Success.** The action redirects back to the item (or the list), a confirmation names what
  changed — `Saved.`, `Price added.`, `Archived.`, `Marked as reviewed.` — and the new value
  is present in the freshly rendered page, so the test proves persistence and not an
  optimistic render.

## Acceptance criteria

Tests that touch only the Zod schemas, `selectCurrentPrice`, `reviewReasons`,
`formatPriceExact` or the lint fence are `*.test.ts` and run in `npm run test:unit` with no
database. Tests that write are `*.db.test.ts` under `src/server/items/`, call `resetTestDb()`
in `beforeEach` and build their own fixture. Browser-level criteria are Playwright specs
under `tests/e2e/`.

1. **AC-1** — The section exists and is closed to a signed-out request. `PROTECTED_PATHS` in `src/lib/auth-config.ts` contains `"/item-master"` and `src/middleware.ts`'s matcher contains the static literal `"/item-master/:path*"`. An unauthenticated `GET` of each of `/item-master`, `/item-master/items/new`, `/item-master/items/<id>`, `/item-master/items/<id>/delete`, `/item-master/suppliers`, `/item-master/types` and `/item-master/yards/DUBLIN` responds `307` (or `302`) to `/sign-in?callbackUrl=<the URL-encoded path>` and sends none of the page's content; signing in as an `ADMIN` from that page lands on the requested path. `src/middleware.ts` still imports nothing from `@prisma/client`, transitively, so `tests/unit/hashing-boundary.test.ts` stays green unchanged.
2. **AC-2** — A `YARD_STAFF` session is refused at every one of those seven URLs, and is sent no item and no money. Each `GET` responds `307` to `/stock-entry?denied=item-master`, and the response body contains none of: the description of any item in the database, any price string, the character `€`, and no key or word matching `/unitPrice|price|value|total|amount/i`. Following the redirect renders `You do not have access to that page.` — #3's existing `ACCESS_DENIED_MESSAGE`, unchanged, on a page this feature does not edit. There is no `ItemForStaff` shape anywhere in the feature and no call to `shapeForRole`: nothing here is shaped for staff because nothing here is sent to staff.
3. **AC-3** — The refusal is the server's answer and stays one. The implementer reproduces #3's degradation before closing: adding `src/app/item-master/loading.tsx` makes AC-2's assertion fail with a `200` carrying the page shell, and the result is recorded in `progress/impl_item_master_ui.md` with both status codes and both body sizes. In the shipped tree no `loading.tsx` exists at `src/app/item-master/` or at `src/app/`, `src/app/(public)/loading.tsx` is unchanged, and `/` still returns `200` with its loading fallback present (spec 002).
4. **AC-4** — Every mutation refuses a `YARD_STAFF` actor at the service, not only at the screen. Called with a `SessionUser` whose role is `YARD_STAFF`, each of `createItem`, `updateItem`, `setItemActive`, `deleteItem`, `markItemReviewed`, `addPrice`, `assignItemToLocation`, `unassignItemFromLocation`, `moveItemInSheet`, `createSupplier`, `renameSupplier`, `setSupplierActive`, `deleteSupplier`, `createItemType`, `updateItemType`, `moveItemType` and `deleteItemType` throws `ForbiddenError` whose message is `ADMIN is required for this action`, and afterwards every row count in `Item`, `ItemPrice`, `ItemLocation`, `Supplier` and `ItemType` is unchanged. The refusal comes from #3's `assertRole`; no new guard, no new message and no new error class is introduced.
5. **AC-5** — The actor is never taken from the request body. Every exported function in `src/app/item-master/actions.ts` obtains its actor by calling `requireRole("ADMIN")`, asserted by a source scan of that file which finds one such call per exported action and finds no read of `role`, `actor`, `actorId` or `userId` from a `FormData`. A test drives `updateItemAction` with a form body additionally carrying `role=ADMIN` while signed in as `YARD_STAFF` and asserts the item is unchanged.
6. **AC-6** — The list shows an item master an admin can work with. Against a fixture of 140 items, `GET /item-master` as an `ADMIN` returns `200` and renders one row per active item — all of them, with no pagination control — each carrying the description, the supplier name (or `No supplier`), the type, the unit label (or `No unit`), the current price formatted by `formatPriceExact` (or `No price`), a badge per assigned yard, and a tag for each of `Needs review`, `Note` and `Archived` that applies. Rows are ordered by `description` ascending, case-insensitively. `?q=multigrip` returns only items whose description contains that text in any case; `?supplierId=`, `?itemTypeId=` and `?locationCode=` narrow further and combine with AND; `?q=` matching nothing renders `No items match those filters.` and a *Clear filters* link.
7. **AC-7** — Creating an item works and derives what it should. Submitting `/item-master/items/new` with a description, a supplier, a type and the unit label `20 Kg` creates one `Item` with `unitKind = KILOGRAM` and `unitQuantityKg = "20"` — derived by the same `normaliseUnit` from `src/lib/units.ts` that #5 used, not a second implementation — with `active = true`, and redirects to `/item-master/items/<id>`, which renders those values after a fresh load. The label is stored trimmed but its internal whitespace is preserved: submitting `Bicycle Logo's  1200mm` (two spaces) stores exactly that string, and a search for the three-space spelling does not find it.
8. **AC-8** — `description` is required and non-empty at the form as well as at the database (Invariant 9). Submitting `""` or `"   "` on create, and on update, renders the message `Description is required.` beside the description field with the other typed values kept, writes no row and changes none. The rendered HTML contains none of `Item_description_not_empty`, `violates`, `check constraint`, `23514`, `P2000`–`P2999` or `prisma`. The same input is rejected by the Zod schema in `item-master-input.ts` in a unit test with no database, raising `ValidationError` whose `field` is `description`.
9. **AC-9** — An item's identity is enforced by the application, including where Postgres cannot enforce it. Creating a second item with the same trimmed description under the same supplier raises `ConflictError` whose message names both, e.g. `An item "Beads" already exists for supplier Kelly.`, and creates nothing. Because Postgres treats `NULL`s as distinct, `@@unique([description, supplierId])` does not stop two supplier-less rows, so the service matches on `(description, supplierId ?? null)` in application code — as #5 AC-23 does — and a second supplier-less `School Logo Triangle` raises `ConflictError` naming the description and `no supplier`, leaving exactly one row. The same check runs on update: renaming item B onto item A's `(description, supplier)` is refused and B is unchanged.
10. **AC-10** — Updating an item persists and re-derives. Changing the supplier, the type, the unit label and the notes of an existing item stores all four, re-derives `unitKind` and `unitQuantityKg` from the new label (`Tonne` → `TONNE` / `1000`), leaves `ItemPrice` and `ItemLocation` rows untouched — same ids, same values — and shows the new values after a reload. Setting the supplier to `No supplier` stores `null` rather than a placeholder supplier row.
11. **AC-11** — Archiving is `active = false` and never a delete, and it does not touch history. `archiveItemAction` on an item that has a `StockCountLine` sets `Item.active = false`, and afterwards every line naming it is byte-identical — same `id`, same `quantity`, same `unitPriceSnapshot`, same `note` — and still readable through its count (004 AC-20a). The archived item disappears from `/item-master`'s default list and from `listSheet` for both yards, appears under `?filter=archived` with an `Archived` tag, and its `ItemLocation` rows are **not** modified: same ids, same `sortOrder`, same `active`. Restoring it sets `active = true` and it reappears on exactly the yards, in exactly the positions, it occupied before.
12. **AC-12** — Deleting is offered only for an item nothing references, and a refusal is a domain error rather than a Postgres string. `getItem` returns `lineCount`, and the *Delete* control is rendered only when it is `0`; the control leads to `/item-master/items/<id>/delete`, whose `GET` names the item, states that its prices and yard assignments will go with it, and changes nothing. On an item with at least one line, `deleteItem` throws `ConflictError` whose message names the item and the line count — e.g. `"Beads" appears on 3 count lines and cannot be deleted. Archive it instead.` — the item and every line still exist, and the rendered page contains none of `violates RESTRICT setting of foreign key constraint`, `PrismaClientUnknownRequestError`, `constraint` or `23001`. On an item with prices and links but no lines, the delete succeeds and removes its `ItemPrice` and `ItemLocation` rows with it (004 AC-20e), leaving no orphan.
13. **AC-13** — **A price is never overwritten.** Nothing in this feature updates or deletes an `ItemPrice`: a scan of every shipping module under `src/` and `scripts/` finds no `.update`, `.updateMany`, `.upsert`, `.delete` or `.deleteMany` applied to `itemPrice`, the price panel renders no edit or delete control for an existing price row, and there is no `updatePriceAction` or `deletePriceAction` in `src/app/item-master/actions.ts`. Changing a price is adding one: after adding `35.00` effective `2026-10-01` to an item priced `33.09` from `2025-01-01`, the item has two `ItemPrice` rows, and the original row is unchanged in `id`, `unitPrice`, `currency`, `effectiveFrom`, `label` and `createdAt`.
14. **AC-14** — A date already taken is refused, in the service's words. `addPrice` for an `effectiveFrom` that item already has raises `ConflictError` whose message names the item and the date and says the price is not overwritten — `A price for "Beads" effective 2026-10-01 already exists. Prices are never overwritten: choose a later date.` — no row is written, the existing row is unchanged, and the form re-renders with the typed amount and date kept. The rendered page contains none of `Unique constraint`, `P2002`, `ItemPrice_itemId_effectiveFrom_key` or `prisma`.
15. **AC-15** — The current price is the latest one in force, chosen by a pure function. `selectCurrentPrice(prices, asOf)` returns the row with the greatest `effectiveFrom` that is on or before `asOf`, and `null` when there is none; unit tests with no database cover: a single past price; two past prices, the later winning; a price effective exactly on `asOf`, which wins; a future-only price, giving `null`; and an empty list, giving `null`. On the screen, the winning row carries a `Current` badge, a future-dated row is listed with its date and no badge while the header reads `No current price`, and an item with no `ItemPrice` at all shows `No price` plus `No price recorded. Lines for this item will count as 0 and raise a warning on the count summary.` A price reaches the page as a decimal string and is rendered by `formatPriceExact`, which never converts through `Number`: `"6.11764706"` renders `€6.11764706`, `"33.09000000"` renders `€33.09`, `"1000.00000000"` renders `€1,000.00` and `"0.00000000"` renders `€0.00`.
16. **AC-16** — Price input is validated at the edge and stored exactly. In unit tests with no database the Zod schema rejects, with `ValidationError` naming `unitPrice`, each of `""`, `"abc"`, `"-1"`, `"1.234567890"` (nine decimal places, more than `Decimal(18,8)` holds) and `"12345678901.5"` (eleven integer digits), and accepts `"0"`, `"33.09"` and `"6.11764706"`; it rejects `effectiveFrom` values that are not `YYYY-MM-DD` naming `effectiveFrom`. Against the database, adding `"6.11764706"` effective `2026-01-01` reads back `unitPrice.toString() === "6.11764706"` and `effectiveFrom` as the date `2026-01-01` with no timezone shift, `currency` is `EUR`, and the value passed to Prisma was never a JavaScript `number`.
17. **AC-17** — **The flagged items are reachable in one click.** `/item-master` renders a filter control whose `Needs review` entry carries a count badge equal to the number of active items with `needsReview = true`, and links to `?filter=needs-review`. On a fixture reproducing #5's outcome — 140 items, 15 flagged — the badge reads `15`, the filtered list renders exactly those 15 rows and no others, and the same page's `Notes` badge reads `10` and `Archived` reads `0`. Each flagged row links to `/item-master/items/<id>`.
18. **AC-18** — Each flagged row says what is missing, from a pure function. `reviewReasons` returns `MISSING_SUPPLIER` when `supplierId` is null, `MISSING_UNIT` when `unitLabel` is null or blank, and `MISSING_PRICE` when the item has no `ItemPrice` row — unit-tested with no database over all eight combinations — and the list and the item page render them as the tags `No supplier`, `No unit` and `No price`. On the fixture, the 11 price-less items carry `No price`, `School Logo Triangle` carries `No supplier`, and the two below-total fuel rows — flagged but missing nothing — carry **no** reason tag and instead render `Flagged at import` with their `notes` text.
19. **AC-19** — **The flag is raised by the system and cleared only by a human, and clearing is refused while a reason remains.** `markItemReviewed` on an item with any `reviewReasons` raises `ValidationError` naming the outstanding reasons — e.g. `Cannot mark reviewed: no price recorded.` — and leaves `needsReview` true. After the missing supplier, unit label and price are supplied through the screen, the same action succeeds, sets `needsReview = false`, and the item leaves `?filter=needs-review` and the badge count drops by one. The two fuel rows can be marked reviewed immediately, because they have no outstanding reason. Conversely the flag is raised automatically: clearing the supplier of a reviewed item, or clearing its unit label, sets `needsReview = true` on that save, and no code path anywhere in the feature sets `needsReview = false` except `markItemReviewed`.
20. **AC-20** — **The cross-sheet conflicts are surfaced here, next to the fields that fix them.** An item whose `notes` is not null carries a `Note` tag in the list, is listed by `?filter=notes`, and its edit page renders the `notes` text verbatim in an `Import notes` panel: for `MMA Paints - Red` the rendered text contains `Dublin!D50`, `1 Unit`, `'Clonmel '!D64` and `16kg`, so the admin reads both cells and both values on the page where the unit label is edited. On the fixture, `?filter=notes` returns exactly 10 items — the 2 below-total fuel rows and the 8 cross-sheet conflicts of 005 AC-14 and AC-15. `notes` is an editable field: clearing it is how a resolved conflict is recorded, and saving it changes neither `needsReview` nor any other column.
21. **AC-21** — Assigning an item to a yard puts it at the end of that yard's sheet, and never twice. `assignItemToLocation(actor, itemId, "DUBLIN")` creates one `ItemLocation` with `active = true` and `sortOrder` equal to one more than the greatest `sortOrder` at that yard across active and inactive links — `85` on a fixture whose Dublin links run 3–84 — and the item then appears last on `/item-master/yards/DUBLIN`. Assigning an item that already has an **inactive** link at that yard reactivates that same row: same `id`, same `sortOrder`, `active` back to `true`, and the `ItemLocation` row count is unchanged. Assigning an item that is already actively assigned is a no-op that raises no error and creates no row, so `@@unique([itemId, locationId])` is never reached. Assigning to an unknown `locationCode` raises `NotFoundError` naming the code.
22. **AC-22** — Unassigning keeps the row and the place. `unassignItemFromLocation` sets `ItemLocation.active = false`, leaves `sortOrder` and `id` unchanged, and no `ItemLocation` row is deleted anywhere in this feature — asserted both by a source scan finding no `.delete` or `.deleteMany` applied to `itemLocation`, and by the row count being identical before and after an unassign. The item leaves `/item-master/yards/<code>` and `listSheet`, its other yard's link is untouched, and every `StockCountLine` naming the item is unchanged. Re-assigning restores it to the position it held.
23. **AC-23** — **Reordering is a swap, and the gaps survive.** `moveItemInSheet(actor, itemId, code, "UP" | "DOWN")` exchanges the item's `sortOrder` with that of the adjacent active row on that yard, in one transaction, so both rows are always consistent. On a fixture reproducing Clonmel — active links at `sortOrder` 3–70 and 75–76, with nothing at 71–74 — moving the row at 75 up exchanges it with the row at 70, both values still exist afterwards, and no row is renumbered: for any sequence of moves at a yard, the **multiset of `sortOrder` values at that yard is identical before and after**, which is the assertion the test makes. `UP` on the first row and `DOWN` on the last are no-ops: no error, no write, order unchanged, and the corresponding control is not rendered on those rows. There is no renumber or compact action in this feature — `sortOrder` is the workbook's source row number (005 open question 4) and the screen displays it, so a row can still be traced to its cell.
24. **AC-24** — The yard sheet has one definition, and #7 will read it here. `listSheet(actor, "DUBLIN")` returns the yard's links where `ItemLocation.active` **and** `Item.active` are both true, ordered by `sortOrder` ascending then `description` ascending so ties are deterministic, each entry carrying the item id, description, unit label, `sortOrder` and the item's current price. An archived item and an unassigned link are both absent; `listSheet(actor, "DUBLIN", { includeArchived: true })` includes them, each marked with why. On the fixture the two calls return 82 and 84 entries respectively, and `/item-master/yards/DUBLIN` renders them in that order with the `sortOrder` value shown.
25. **AC-25** — Suppliers are maintained, and archiving one does not rewrite the items that name it. `/item-master/suppliers` lists suppliers alphabetically with the number of items each supplies; creating one with a trimmed non-empty unique name succeeds; creating a duplicate — in any case, `kelly` against `Kelly` — raises `ConflictError` naming it, and an empty or whitespace-only name raises `ValidationError` naming `name`. Renaming updates every item's displayed supplier without touching `Item` rows. `setSupplierActive(false)` removes the supplier from the item form's selection list for a **new** choice, while an item that already references it still shows it, marked `(archived)`, and its `supplierId` is unchanged; the supplier list shows it under *Show archived*, and restoring returns it to the selection list.
26. **AC-26** — A supplier or a type is deleted only when nothing references it, and the refusal is readable. `deleteSupplier` on a supplier with items raises `ConflictError` naming the supplier and the count — `Kelly supplies 27 items and cannot be deleted. Archive it instead.` — both the supplier and every item survive, and the page shows none of `violates RESTRICT setting of foreign key constraint`, `23001` or `PrismaClientUnknownRequestError`. On a supplier with no items the delete succeeds and the row is gone. `deleteItemType` behaves identically, with its own message naming the type and its item count.
27. **AC-27** — Item types are created, renamed, reordered and deleted — and **not archived**, because Part 3 gives `ItemType` no `active` column and this feature adds no migration. `/item-master/types` lists the 19 types in `sortOrder` with their item counts; creating one takes the next `sortOrder` after the greatest; a duplicate `code` in any case raises `ConflictError` naming it; `moveItemType` swaps `sortOrder` with the neighbour under the same multiset rule as AC-23; and there is no archive control and no `active` field in the type form. `prisma/schema.prisma`, every directory under `prisma/migrations/` and `prisma/migrations/migration_lock.toml` are byte-identical to their state before this feature.
28. **AC-28** — Every screen handles empty, loading, error and success, and the strings are single-sourced. With an empty database `/item-master` renders `No items yet. Run npm run seed:workbook, or add the first item.`; a filter matching nothing renders `No items match those filters.` with a working *Clear filters* link; a yard with no assignments renders `No items are assigned to Dublin yet.`; a submit control is disabled while pending so a double click writes one row, not two; and after a successful save the page redirects, renders a confirmation naming what changed, and shows the new value on that freshly rendered page rather than from client state. Every literal a criterion quotes is exported from `src/lib/item-master-messages.ts` and asserted from that module, so the screen and the test cannot drift apart.
29. **AC-29** — No database error text ever reaches a screen. For each of five provoked failures — an empty description, a duplicate `(description, supplier)`, a duplicate `(itemId, effectiveFrom)`, deleting an item with a count line, and deleting a supplier with items — the rendered HTML contains the feature's own message and none of `prisma`, `Prisma`, `violates`, `constraint`, `SQLSTATE`, `23001`, `23505`, `23514`, `P2002`, `P2003` or `P2025`. Every service throws only `ValidationError`, `NotFoundError`, `ConflictError` or `ForbiddenError` from `src/server/errors.ts`, never a bare `Error`, and the actions map them to inline form state exactly as `src/app/api/error-response.ts` maps them to status codes.
30. **AC-30** — **Device: this screen is desktop-first and must not be broken on a phone.** `specs/product-brief.md` makes phone-first a constraint on counting, and an admin prices at a laptop; but a screen an admin cannot open in the yard is a screen they will not fix a flagged item on. At a 390 px viewport, on each of the seven URLs of AC-1 signed in as an `ADMIN`, `document.documentElement.scrollWidth` does not exceed its `clientWidth` — the *document* never scrolls sideways, while the item table may scroll inside its own container — and the search box, the filter links, the *Add item*, *Save*, *Add price*, *Assign* and *Move up* controls are each visible and clickable without horizontal scrolling of the document, exactly as 003 AC-32 asserts for `/sign-in`.
31. **AC-31** — **The money-naming scan is amended, not loosened.** 005 AC-29 permits exactly two modules to name `unitPrice` and forbids the string under `src/app/`, `src/components/`, `src/lib/` and `scripts/`; this is the first feature that legitimately renders a price. `tests/unit/project-contract.test.ts` now asserts an exact permitted list — `["src/app/item-master/actions.ts", "src/components/item-master/ItemTable.tsx", "src/components/item-master/PricePanel.tsx", "src/server/items/item-master-input.ts", "src/server/items/item-price-service.ts", "src/server/items/item-service.ts", "src/server/items/price-selection.ts", "src/server/items/workbook-import-service.ts", "src/server/items/workbook-plan.ts"]` — so a tenth module naming the column turns it red; it keeps its non-vacuity assertion that it inspected `src/server/db.ts`; `src/lib/**` and `scripts/**` stay at **zero** files naming `unitPrice`, which is why `formatPriceExact` takes `value: string`; and `unitPriceSnapshot` is still named by no shipping module anywhere, its first reader being #9. The exemption is a list of files, never a directory exemption, and it is justified by AC-2: the two presentation files it names sit behind a route no staff session can reach.
32. **AC-32** — **Which checks survive with no database,** mirroring 003 AC-23, 004 AC-26 and 005 AC-27. With `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL` and `TEST_DIRECT_URL` all pointing at a hostname that does not resolve: `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run build` each exit `0`, and both `init` scripts exit `0` ending with `[OK] Environment ready (database checks skipped)`. No module this feature adds opens a connection at import time, and no page under `/item-master` is statically prerendered against a database during `build` — each declares `export const dynamic = "force-dynamic"`. The criteria provable without Postgres are AC-8's schema half, AC-15's `selectCurrentPrice` and `formatPriceExact` halves, AC-16's schema half, AC-18's `reviewReasons` half, AC-31 and AC-33; every other criterion needs a database or a browser and lives in `*.db.test.ts` or `tests/e2e/`.
33. **AC-33** — **The three known holes in the ESLint fence from `src/lib/` to `src/server/` are closed, and `docs/architecture.md` stops promising something untrue.** The two prefix patterns are replaced by one that matches the path **segment**, on the shape of `(^|/)server(/|$)`, keeping the `@/server/errors` exception, and a `no-restricted-syntax` rule covers `ImportExpression`. Proved by mutation, not by inspection: a test in `tests/unit/lint-fence.test.ts` runs ESLint's `lintText` API against source text with `filePath` set under `src/lib/` — writing nothing to the tree — and asserts at least one `no-restricted-imports` or `no-restricted-syntax` error for each of `@/./server/db`, `@/../src/server/db` and `await import("@/server/db")`, for the nine shapes #5's reviewer already blocked (including `@/server/db`, `@/server/items/item-service`, `export * from "@/server/db"`, `../server/db` and `./../server/db`), and **zero** errors for `@/server/errors`, for `@/lib/units` and for `@/server/db` imported from a `filePath` under `src/server/`. In the same change `docs/architecture.md`'s dependency rule loses the paragraph beginning `Three spellings currently slip through` and states the guarantee it can now keep; `npm run lint` exits `0` on the shipped tree, which contains none of these shapes.
34. **AC-34** — The gate is green in full, and the two suites stay disjoint and self-cleaning. `npx prisma validate`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:e2e`, `npx prisma migrate status` and `npm run test:db` all pass, and `./init.ps1` ends with `[OK] Environment ready` having **executed** the database checks rather than skipping them. `npm run test:unit` executes zero `*.db.test.ts` files; the database tests call `resetTestDb()` in `beforeEach`, seed their own fixture, and pass twice in a row and with the file order reversed. Because Playwright runs against the **development** database, every e2e spec here creates its own suppliers, types and items with descriptions carrying a per-run random suffix, deletes them in `afterAll`, and never edits, archives or deletes a row it did not create — asserted by the seeded item count being identical before and after the run.

35. **AC-35** — **The end-to-end suite stops being flaky, and stops being able to hide a failure.** `npm run test:e2e` builds the application once and serves that build for the run, instead of running `next dev` — spec 002 AC-11's requirement that the suite start the application itself is unchanged, and 004 AC-26 and 005 AC-27 already prove `npm run build` exits `0` with no reachable database, so the no-database path is unaffected. `playwright.config.ts` then sets `retries: 0`, so a failure is a failure, and its `timeout` and `expect.timeout` come down to values a served build meets comfortably. Proved by **two consecutive full `npm run test:e2e` runs reporting `0 flaky` and `0 failed`**, with both transcripts recorded. If the suite is still not stable at `retries: 0`, the implementer **reports that rather than restoring retries or raising a timeout** — raising the limit is what turned one flaky test into two.

## Out of scope

- **The dormant-item worklist and one-click bulk archive.** `quantity = 0` across the last
  three counted periods (Part 5) is #15 `item_housekeeping`. It cannot exist before #7–#9
  create a `StockCountLine`, and #6 reads no count data beyond `lineCount`. #15's rows will
  link into `/item-master/items/[id]`, which is where a fix is made; the two screens share a
  destination, not a definition.
- **Merging the two pairs of near-duplicate items.** `Bicycle Logo's  1200mm` (two spaces)
  and `Bicycle Logo's   1200mm` (three), and the same pair at 2750mm, stay four items. The
  user decided this deliberately on 2026-09-09 (005 open question 5) and #6 does not
  re-litigate it: there is **no merge action**, no "possible duplicates" view and no
  whitespace-collapsing search normalisation. An admin who wants them merged today archives
  one and assigns the other to both yards — using the actions this feature already ships,
  with the history of both preserved. A real merge — moving `StockCountLine` rows from one
  item to another — rewrites history, needs an audit trail, and is a feature nobody has
  asked for.
- **Editing or deleting an `ItemPrice`.** Invariant 2 and Part 2 forbid it, AC-13 asserts
  it, and no later feature is expected to add it. A price entered wrongly is superseded by a
  later-dated one; see *Open questions* 3 for the same-day case.
- **Bulk operations.** No multi-select, no bulk archive, no CSV import, no bulk price
  upload. #5's importer is the bulk path and it is insert-only.
- **Merging suppliers or item types**, and de-duplicating `Kellys` against `Kelly` — #5
  already collapsed those, and a merge is the same history-rewriting problem as above.
- **An audit trail.** Who changed a price, and when, is not recorded beyond
  `ItemPrice.createdAt`. `docs/architecture.md` requires an audit only for reopening an
  `APPROVED` count, which is #9's.
- **Creating, renaming or archiving a `Location`.** Two yards, fixed by the product brief
  and written by #4's migration.
- **Overriding `unitKind` by hand.** It is derived from `unitLabel` by `normaliseUnit`, one
  rule in one place. A label the table does not recognise falls to `UNIT` and the item is
  flagged, which is Part 2's own answer.
- **Multi-currency.** `currency` is `EUR`, the schema default, and is not an input.
- **A user-management screen.** Still owned by no feature (003 open question 3).
- **Creating an item from inside a count.** Part 5's two paths for adding a one-off during
  a count — search the master, or create inline — belong to #8 `stock_entry_ui`. They will
  call `createItem` and `assignItemToLocation` from this feature, which is why both take an
  actor and validate their own input rather than trusting a caller.
- **Any monetary total.** This screen shows a unit price per item and never sums one. Totals,
  MoM and YoY are #11 `analysis`, "the only place monetary figures appear" beyond a price.
- **Repairing the workbook.** The `#REF!` cells, the year-typo headers and the drifted value
  cells stay in `Samples/`, which is opened by nothing in this feature.
- **Performance work.** 140 items render in one page with no index added and no query
  budget. Revisit when the master is ten times larger.
- **CI.** `init` remains the gate.

## Post-approval amendments

### AC-35 added 2026-09-10 — the end-to-end suite is degrading

Added by the coordinator immediately after approval, on evidence gathered from the approval
gate run itself. The user may strike it; nothing else in the spec depends on it.

The flaky count across the last three full gate runs went **0 → 1 → 2**. Both failures in the
third run were `apiRequestContext.get: read ECONNRESET` — the server dropping connections,
not an assertion failing — in `role-access.spec.ts` and `sign-in.spec.ts`. Each passed on
retry.

The cause is structural rather than incidental: `playwright.config.ts` runs **three workers
against `npm run dev`**, and the Next development server compiles routes on demand in a
single process. Its own comments record that a previous session already raised `timeout` to
90 s and `expect.timeout` to 25 s because "a cold `/stock-entry` could lose the race" — so
this has been absorbed by raising limits twice already rather than fixed.

Two reasons it is this feature's problem. #6 roughly doubles the end-to-end surface, adding
specs for seven new routes against the same server. And #4's reviewer wrote the warning down
at the time: `retries: 1` means "a genuinely intermittent regression can still reach `done`".
A suite that hides one failure makes all thirty-four criteria less trustworthy, and this is
the first feature whose criteria are mostly browser-level.

## Open questions

None blocking. Seven decisions this spec settles with a stated answer rather than leaving
undefined, each flagged so the user can strike it at approval:

1. **`needsReview` clears by hand, not automatically — and the hand is refused while a
   reason remains.** Automatic clearing would silently unflag the two below-total fuel rows,
   which are flagged for provenance and are missing nothing; a purely manual flag would let
   a price-less item be dismissed. The alternative is recomputing the flag on every save and
   accepting that the fuel rows lose theirs at the first unrelated edit.
2. **Archiving does not touch `ItemLocation`.** `Item.active` is the single answer to "is
   this item on a sheet?", so restoring an item restores its exact yard positions. The
   alternative — deactivating the links too — needs a second flag meaning the same thing,
   and two flags with one meaning drift.
3. **A price typed wrongly today cannot be corrected today.** `@@unique([itemId,
   effectiveFrom])` refuses a second row on the same date and nothing here may `UPDATE`, so
   the admin must date the correction tomorrow, or a later date. This is the honest cost of
   Invariant 2 and it is stated rather than engineered around. If it proves painful in use,
   the answer is a separate, audited *supersede* feature, not an `UPDATE` here.
4. **Unassigning a yard deactivates the link rather than deleting it**, so `sortOrder` — and
   therefore the item's place on the printed sheet — survives a mistake. The alternative is
   deleting the row and reassigning at `max + 1`, which quietly moves an item to the bottom
   of the sheet.
5. **Gaps in `sortOrder` are never repaired.** Moving is a swap; a new assignment takes
   `max + 1`; Clonmel's 71–74 gap stays, because it records that the fuel rows sit below the
   total row. The alternative is a *Renumber sheet* action producing a dense sequence, which
   would destroy the traceability 005 open question 4 chose deliberately.
6. **`ItemType` has no archive**, because Part 3 gives it no `active` column and this
   feature adds no migration. Striking this means a migration, which would make #6 the first
   feature since #4 to change the schema.
7. **This screen is desktop-first and phone-usable**, per AC-30, rather than phone-first.
   Striking this means designing the item table for a 390 px viewport as the primary case,
   which the brief reserves for Stock Entry and Stock Takes.

Two carried-forward items, both closed here rather than left open:

- `docs/architecture.md`'s three known ESLint holes — AC-33.
- 005 AC-29's `unitPrice` scan, which this feature is the first to need widened — AC-31.

`Q7` and `Q8` in `specs/domain-model.md § Still open` block only M7 and are unrelated to this
feature.
