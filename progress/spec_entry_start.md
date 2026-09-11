# Spec notes — #7 `entry_start`

Written 2026-09-11 by the spec-writer. Spec: `specs/features/007-entry_start.md`,
32 criteria, mirrored verbatim into `feature_list.json` (`spec_status: draft`,
`status: pending`).

## Gate

`./init.ps1` at the **start** of the session: green, database checks **executed** —
13 files, 173 service tests, `[OK] Environment ready`, 391 s.

`./init.ps1` at the **end**, three times: every step green except `npm run test:db`, which
failed on Neon connectivity (`Can't reach database server at …neon.tech:5432`,
`Server has closed the connection`) inside `resetTestDb`, with a different set of tests
failing each run and not one assertion among them. The full table is in
`progress/current.md` § Blockers. **It is not the tree**: the only changes in this session
are this file, the spec, and one block of `feature_list.json`, and `init`'s feature-list
validation — the one step those changes could break — passed on every run.

## What the database actually says today

Read-only probe before writing, so the criteria pin facts rather than assumptions:

| Fact | Value |
|---|---|
| `Location` | `DUBLIN` "Dublin" `sortOrder 1`, `CLONMEL` "Clonmel" `sortOrder 2`, both active |
| Dublin sheet (`ItemLocation.active` **and** `Item.active`) | **82** |
| Clonmel sheet | **70** |
| `StockCount` | **0** |
| `StockCountLine` | **0** |
| `Item` | 140 |

So the empty calendar is the first thing anyone will see, and AC-22 says so.
The 82 / 70 figures are what AC-12 asserts, on a fixture that reproduces them.

## The five decisions that took the most reading

1. **`listSheet` has an `ADMIN` guard, and #7 cannot live with it.**
   `src/server/items/item-assignment-service.ts:93` is `assertRole(actor, "ADMIN")`, and
   the caller that needs the sheet most is a `YARD_STAFF` user starting a count. The spec
   widens the guard on the two **read** functions (`listSheet`, `locationName`) to
   `assertUser`, keeps all seventeen mutations at `ADMIN`, and states the trade: a staff
   *actor* can now cause `SheetEntry.currentPrice` to be computed server-side, which
   Invariant 12 permits because it is never *sent*. Two assertions hold it — AC-15 (no
   module in the feature names `unitPrice` or `unitPriceSnapshot`; 006 AC-31's nine-file
   list unchanged) and AC-17 (the deep-key walk).
   **This edits one shipped assertion**: `item-assignment-service.db.test.ts` currently
   asserts `listSheet(staff, "DUBLIN")` rejects. 006 AC-4 lists only the seventeen
   mutations, so no criterion of #6 is contradicted — but the reviewer should see that
   line change and nothing else in that file.

2. **The money answer is not "nothing here carries money".** Almost, but not quite.
   `shapeForRole`'s first real caller is `getCount`, and the one divergence is the
   `ADMIN`-only `itemsWithoutPrice` — Invariant 4's warning, which `feature_list.json` #8
   already withholds from staff ("no 'no price' tag"). It is a count of items, not a euro,
   and it deliberately matches `/price/i` so the deep-key scan has something to find on
   the admin side and nothing on the staff side. The calendar is one shape for both roles,
   per Part 6's "one version of the screen, not two".

3. **E2E cannot use a per-run suffix on a count.** A count has no name; its key is
   `(locationId, periodYear, periodMonth)` and the yard codes are a fixed enum
   (`locationCodeSchema = z.enum(["DUBLIN", "CLONMEL"])`), so a per-run *yard* is not
   available either. AC-30 reserves `periodYear >= 2090` for the suite, one year per spec
   file, with `countDate` inside that year too so the calendar's "last stock take" default
   is never dragged into the future. `beforeAll` and `afterAll` both clear `>= 2090`, and
   the specs assert the set of ids below 2090 is identical before and after — today, empty.
   The "empty calendar" and "default month" criteria are therefore db-test-level, because
   three Playwright workers share one live database.

4. **Two definitions of "today".** `todayIso` in `price-selection.ts` uses the *server's*
   local zone; on Vercel that is UTC, and between midnight and 1 a.m. Irish summer time it
   names yesterday. Every user-visible date here goes through a new pure
   `src/lib/yard-time.ts` (`Europe/Dublin`). #6's `todayIso` is left alone — changing it
   edits a closed feature and its tests — and the divergence is Open question 5.

5. **`/stock-entry` carries three test ids three shipped e2e specs assert on**:
   `signed-in-email`, `sign-out` and `access-denied` (003 AC-15, AC-21; 006 AC-2). #7
   replaces that page, so AC-2 requires those three specs to pass **unmodified**. This is
   the most likely accidental regression in the feature.

## Carried forward, honoured

- `listSheet` stays the one definition of a yard sheet — AC-12 reads it, and no second
  query is specified.
- The served build at `retries: 0` is unchanged — AC-30.
- No business-day rule: the only surviving mentions in the repo are the *negative*
  statements in `specs/domain-model.md`, `specs/product-brief.md` and
  `docs/domain-glossary.md`. Nothing needs removing; AC-9 keeps it that way with a source
  scan and a Saturday count.

## For the implementer, in order

`period.ts` and `yard-time.ts` (pure, AC-6 / AC-31) → `calendar-month.ts` (pure, AC-19) →
`count-input.ts` → `count-service.ts` (`startCount` first, AC-12 / AC-13) → the four pages
→ the e2e specs. The `listSheet` guard change is one line and should be its own commit
step, because it touches #6's tree.

## Verification

Tail of the closing `./init.ps1` run is in `progress/current.md`.
