# Feature 22 — Roles, home menu and export price format

**Spec:** `specs/features/022-roles_home_menu.md` (approved; owner rulings 2026-11-17)
**Branch:** `hermes/mwknuude`
**Status:** implementation complete, gate green; stays `in_progress` until review and the
owner's approval (never set `done` by the implementer).

## What was built

| AC | What landed |
|---|---|
| AC-1 | `prisma/schema.prisma` `Role { YARD_STAFF ADMIN SUPER_ADMIN }`; `src/server/auth/roles.ts` exports `ROLES`, `Role`, `isRole`, `isAdminOrAbove`; `assertAdminOrAbove` in `src/server/auth/guards.ts`; every admin surface uses the one predicate. |
| AC-2 | `prisma/migrations/20261117120000_add_super_admin_role` (enum value, with a `-- contract-step:` line) and `20261117121000_promote_carlos_super_admin` (promotes `carlos-staarthof` only if it exists; inserts nothing; idempotent; rolls back if the result would hold more than one `SUPER_ADMIN`). |
| AC-3 | `parseRole` accepts only `YARD_STAFF` and `ADMIN` in `createProfile`, `approveProfile` and `changeProfileRole`; `changeProfileRole`, `deactivateProfile`, `resetProfilePin`, `clearAccountLock`, `approveProfile` and `rejectProfile` refuse a `SUPER_ADMIN` target, except the same `SUPER_ADMIN` resetting its own PIN (AC-3 / #23 AC-7). Target role is re-read under `FOR UPDATE`. |
| AC-4 | `landingPathForRole` returns `/home` for every role; `/home` added to `PROTECTED_PATHS` and the middleware matcher; `safeCallbackPath` still wins. |
| AC-5 | `src/server/home-menu.ts` builds the exact tiles per role; `src/app/home/page.tsx` renders only those tiles with the identity header. |
| AC-6 | No URL moved: `/stock-entry` and `/stock-takes` keep their shipped pages; the *Stock Calendar* tile resolves `YARD_STAFF → /stock-entry`, `ADMIN`/`SUPER_ADMIN → /stock-takes`. |
| AC-7 | `requireAdminPage` / `requireAdminOrAbove` / `shapeForRole` use `isAdminOrAbove`, so `SUPER_ADMIN` gets the admin shape and the admin surfaces. |
| AC-8 | `src/lib/excel/workbook-writer.ts` writes column E as a number with `numFmt = "\"€\"#,##0.00`; no price leaves the cell blank. Value and TOTAL unchanged. |
| AC-9 | Staff responses stay money-free; the menu adds no figure. |
| AC-10 | See the amended assertions below. |
| AC-12 | Only the enum value was added; `schema-and-migration.test.ts` updated for the third member; `TRUNCATED_TABLES` unchanged. |

## Amended assertion (spec 022 AC-10)

`tests/unit/export-workbook.test.ts:165` — **before** `expect(valueOf(dublin, "E3")).toBe("€1.005")`;
**after** `expect(valueOf(dublin, "E3")).toBe(1.005)` plus
`expect(dublin.getCell("E3").numFmt).toBe('"€"#,##0.00')`, and a no-price row asserting E has no
value (`toBeNull`). Not weaker: it asserts the machine-readable number and the euro display
format separately, still round-trips the workbook, and adds the blank case the old assertion did
not make. `valueOf` stays; no other assertion in that file changed.

Necessary mechanical follow-ons (same behaviour, no assertion weakened):

- `src/server/export/export-service.db.test.ts` — column E now reads `9.99` and asserts the euro
  `numFmt`.
- `tests/unit/schema-and-migration.test.ts` — `Role` now has the third member.
- `tests/unit/item-master-actions-contract.test.ts` and `tests/unit/pin-auth-contract.test.ts` —
  the guard they require is now `requireAdminOrAbove()` / `assertAdminOrAbove(actor)`.
- `tests/e2e/{home-menu,role-access,route-protection,sign-in}.spec.ts` — new landing `/home`,
  third role, `SUPER_ADMIN` fixture support. E2E is out of this goal's gate.

## Gate

Each command was run on its own, from the repository root, on 2026-11-17.

```
$ npm run typecheck
> tsc --noEmit
exit 0

$ npm run lint
> eslint src tests --max-warnings 0
exit 0

$ npm run test:unit
 Test Files  90 passed (90)
      Tests  1347 passed (1347)
exit 0

$ npm run test:db
 Test Files  35 passed (35)
      Tests  589 passed (589)
exit 0
```

`npx prisma validate` → `The schema at prisma/schema.prisma is valid 🚀`, exit 0.
`git status --porcelain -- Samples` → empty. No dependency added.

`npm run test:e2e` is out of this goal's gate per the task instruction. The e2e specs that
cover AC-4, AC-5, AC-7 and AC-10 are in the tree for when the container can run Playwright.

## Not done / remains

- Review, then the owner's approval. The feature stays `in_progress`.
- E2E execution (out of gate for now).
- Features #23 and #24 were not started.
