# Current session

**Feature:** #9 `entry_submit`
**Spec:** `specs/features/009-entry_submit.md` (approved 2026-09-12, 34 criteria)
**Started:** 2026-09-12
**Status:** in_progress — spec approved by the user, implementation not started

## Plan

**The last feature of M2.** Three new routes under `/stock-entry/counts/[id]` — `/submit`,
`/summary` (ADMIN-only), `/reopen` (ADMIN-only) — three server actions, one lifecycle
service, and the price snapshot. **No JSON endpoint and no `fetch`**: each act is one
deliberate submission, and a `<form>` posting to a server action still works when the bundle
does not.

Dispatched as cold phases:

- **Phase A** — `count-lifecycle-service.ts` (`submitCount`, `approveCount`, `reopenCount`,
  `getLifecycleFacts`), the price-snapshot selection, the signature validator, the money
  shaping for the three surfaces, and their `*.db.test.ts`.
- **Phase B** — the three screens, the signature pad, the three server actions, and the e2e.
- **Phase C** — mutation proofs, the report, the work log.

## Approach

**The money boundary is resolved by splitting surfaces, not by hiding fields.**
`/stock-entry/counts/[id]` and `/submit` carry **no euro for either role**; every monetary
figure lives on `/summary`, which 307s a staff session. That keeps Part 6's "Stock Takes is
money-free for both roles" literally true, and it is why 007 AC-17 and 008 AC-17 pass
**unmodified**. The admin's submit-time warning is a **list of item names, not a number**.

The money-key walk runs on three surfaces with three exact expected sets, asserted as sets so
a seventh money-shaped key turns them red.

Decisions the user approved (spec § Open questions), each strikeable:

1. A `SUBMITTED` count can be reopened, not only an `APPROVED` one — otherwise a known-wrong
   count must be approved before it can be undone.
2. **Self-approval is permitted and recorded**, not refused: two people at most, and a single
   admin must be able to close the month. `signedAndApprovedBySamePerson` makes it visible.
3. **The total is the sum of exact line values, rounded once**, not the sum of rounded lines
   (Invariant 10). Stated cost: the rendered column may not add to the rendered total to the
   last cent.
4. Signature is SVG path data in a fixed `0 0 600 300` space, capped at 400 points / 6000
   characters, as named constants.
5. Signing needs JavaScript and the screen says so; everything else works with the bundle off.
6. **The audit trail is `StockCount.notes`, append-only — no audit table**, because one would
   mean amending Part 3, a migration and a `TRUNCATED_TABLES` entry. Scheduled separately if
   wanted.
7. The reopen reason is shown to both roles; the full trail is ADMIN-only.
8. Approve and reopen each get a confirming screen — one of them destroys a signature.
9. Every euro lives on `/summary`; nothing on the shared pages.

## Work log

<!-- Update as you go, not at the end. If the session dies, this file is what survives. -->

## Verification

Gate at the moment of approval — full run, database checks executed:

```
bash ./init.sh                        ->  init exit=0, 580 s
    [ok]   19 features, 1 in progress
    [ok]   typecheck / lint / test:unit (501) / test:e2e (117)
==> Database
    [ok]   database reachable / prisma migrate status / npm run test:db
[OK] Environment ready
```

<!-- Paste the closing run here. It must not say "(database checks skipped)" — C2.1. -->

## Blockers

None.

## Next

Phase A, gate, Phase B, gate, Phase C, gate, reviewer, sign-off. Then M2 is complete and
**#16 deploy** becomes reachable.

### Rules in force

- **The coordinator runs `init`; agents run targeted commands only.**
- **Only one `npm run test:db` in flight at a time.**
- **No gate while an agent is active on the tree.**
- Cold phases, not resumed agents. Reviewers told what not to re-derive, starting from
  `git diff`.

### The five invariants this feature makes real

- **5** — `null` blocks submission.
- **11** — no submission without a signature; reopening **clears** it.
- **2** — `unitPriceSnapshot` written **once**, at submit, never rewritten. #9 is its first
  writer, so **006 AC-31's permitted-module list must be amended deliberately** — an exact
  list, never a directory exemption.
- **4** — a line whose item has no price contributes `0` **and raises a warning**; never
  silently zero-valued stock. Eleven items currently have no price.
- **3** — an APPROVED count is immutable; only an ADMIN reopens it, audited.

### Carried forward

- **TypeScript does not protect the money boundary.** #8 proved it: a `currentPrice` added to
  a staff shape typechecked cleanly, twice, and six scans caught it. Every guarantee here is
  an assertion over a value or a response body.
- **020 AC-4 turns red if a table is added and not to `TRUNCATED_TABLES`.** #9 should need no
  migration — #4 already shipped the signature and approval columns.
- 008's Observation 8: the `pagehide` flush e2e cannot prove the listener fired.
