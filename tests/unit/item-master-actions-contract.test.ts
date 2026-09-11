import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ARCHIVED,
  DESCRIPTION_REQUIRED,
  MARKED_AS_REVIEWED,
  NO_ITEMS_MATCH,
  NO_ITEMS_YET,
  NO_PRICE_RECORDED,
  PRICE_ADDED,
  SAVED,
  doneMessage,
  itemAlreadyExists,
  itemHasCountLines,
  itemTypeHasItems,
  noItemsAssigned,
  priceDateAlreadyUsed,
  supplierHasItems,
} from "@/lib/item-master-messages";

/**
 * Facts about this feature's own files rather than about its runtime behaviour, so they
 * run in `npm run test:unit` with no database and no browser (006 AC-32).
 *
 * Spec 006 AC-5, AC-3, AC-13 and AC-28.
 */
const ACTIONS_PATH = "src/app/item-master/actions.ts";
const ACTIONS_SOURCE = readFileSync(ACTIONS_PATH, "utf8");

/** A scan of CODE. Prose that quotes the rule is not a breach of it. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const ACTIONS_CODE = withoutComments(ACTIONS_SOURCE);

/** The nineteen actions spec 006 § Contract names, and not one more. */
const EXPECTED_ACTIONS = [
  "createItemAction",
  "updateItemAction",
  "archiveItemAction",
  "restoreItemAction",
  "deleteItemAction",
  "markItemReviewedAction",
  "addItemPriceAction",
  "assignItemAction",
  "unassignItemAction",
  "moveItemInSheetAction",
  "createSupplierAction",
  "renameSupplierAction",
  "archiveSupplierAction",
  "restoreSupplierAction",
  "deleteSupplierAction",
  "createItemTypeAction",
  "renameItemTypeAction",
  "moveItemTypeAction",
  "deleteItemTypeAction",
];

function exportedActionNames(): string[] {
  return [...ACTIONS_CODE.matchAll(/export async function (\w+)\s*\(/g)].map(
    (match) => match[1],
  );
}

describe("AC-5: the actor comes from the session, never from the request body", () => {
  it("AC-5: the file exports exactly the nineteen actions the contract names", () => {
    expect(exportedActionNames().sort()).toEqual([...EXPECTED_ACTIONS].sort());
  });

  it("AC-5: there is one requireRole(\"ADMIN\") call per exported action", () => {
    const actions = exportedActionNames();
    const guards = [...ACTIONS_CODE.matchAll(/await requireRole\("ADMIN"\)/g)];

    expect(actions.length).toBe(19);
    expect(guards.length).toBe(actions.length);
  });

  it("AC-5: every action's FIRST statement is the guard", () => {
    // Split on the export keyword, so each chunk is one action's body.
    const bodies = ACTIONS_CODE.split(/export async function /).slice(1);

    expect(bodies).toHaveLength(19);
    for (const body of bodies) {
      const firstStatement = body.slice(body.indexOf("{") + 1).trim().split("\n")[0].trim();
      expect(firstStatement, body.split("(")[0]).toBe(
        'const actor = await requireRole("ADMIN");',
      );
    }
  });

  it("AC-5: nothing reads a role or an identity out of a FormData", () => {
    for (const field of ["role", "actor", "actorId", "userId"]) {
      expect(
        ACTIONS_CODE,
        `actions.ts reads "${field}" from the request body`,
      ).not.toMatch(new RegExp(`get\\(\\s*["'\`]${field}["'\`]`, "i"));
      expect(ACTIONS_CODE).not.toMatch(new RegExp(`stringField\\([^)]*["']${field}["']`, "i"));
    }

    // And no other route to a role: the only one is `requireRole`.
    expect(ACTIONS_CODE).not.toContain("YARD_STAFF");
    expect(ACTIONS_CODE).not.toMatch(/headers\(\)/);
    expect(ACTIONS_CODE).not.toMatch(/cookies\(\)/);
  });

  it("AC-13: there is no action that edits or deletes a price", () => {
    for (const forbidden of ["updatePrice", "deletePrice", "editPrice", "removePrice"]) {
      expect(ACTIONS_SOURCE).not.toContain(forbidden);
    }
    expect(exportedActionNames()).toContain("addItemPriceAction");
  });

  it("AC-27: there is no action that archives an item type", () => {
    expect(exportedActionNames()).not.toContain("archiveItemTypeAction");
    expect(ACTIONS_SOURCE).not.toContain("setItemTypeActive");
  });

  it("AC-29: the actions file never imports Prisma and writes no query of its own", () => {
    expect(ACTIONS_CODE).not.toContain("@prisma/client");
    expect(ACTIONS_CODE).not.toContain("@/server/db");
    expect(ACTIONS_CODE).not.toMatch(/\bdb\./);
  });
});

describe("AC-3: no loading.tsx at or above src/app/item-master/", () => {
  const EXISTS = (path: string): boolean => {
    try {
      readFileSync(path, "utf8");
      return true;
    } catch {
      return false;
    }
  };

  it("AC-3: neither src/app/item-master/loading.tsx nor src/app/loading.tsx exists", () => {
    // A `loading.tsx` puts a Suspense boundary above every page below it. The shell
    // flushes, and the `redirect()` inside `requireAdminPage` degrades from a 307 into a
    // 200 carrying the page - a refusal `curl` would accept. #3 paid a review round for
    // this; the file's ABSENCE is therefore an asserted fact, not a habit.
    expect(EXISTS("src/app/item-master/loading.tsx")).toBe(false);
    expect(EXISTS("src/app/loading.tsx")).toBe(false);
    expect(EXISTS("src/app/item-master/items/loading.tsx")).toBe(false);
    expect(EXISTS("src/app/item-master/items/[id]/loading.tsx")).toBe(false);
  });

  it("AC-3: the public loading.tsx spec 002 shipped is untouched", () => {
    // The boundary that IS wanted: below no guard, above a page that refuses nobody.
    expect(EXISTS("src/app/(public)/loading.tsx")).toBe(true);
  });

  it("AC-3: every page under /item-master declares force-dynamic and guards first", () => {
    const pages = [
      "src/app/item-master/page.tsx",
      "src/app/item-master/items/new/page.tsx",
      "src/app/item-master/items/[id]/page.tsx",
      "src/app/item-master/items/[id]/delete/page.tsx",
      "src/app/item-master/suppliers/page.tsx",
      "src/app/item-master/types/page.tsx",
      "src/app/item-master/yards/[code]/page.tsx",
    ];

    expect(pages).toHaveLength(7);
    for (const page of pages) {
      const source = readFileSync(page, "utf8");
      expect(source, page).toContain('export const dynamic = "force-dynamic"');
      expect(source, page).toContain('requireAdminPage("item-master")');
    }
  });
});

describe("AC-2: nothing in this feature shapes a response for a staff session", () => {
  it("AC-2: there is no ItemForStaff and no call to shapeForRole", () => {
    const featureFiles = [
      ACTIONS_PATH,
      "src/app/item-master/page.tsx",
      "src/app/item-master/items/[id]/page.tsx",
      "src/components/item-master/ItemTable.tsx",
      "src/components/item-master/PricePanel.tsx",
      "src/server/items/item-service.ts",
      "src/server/items/item-price-service.ts",
      "src/server/items/item-assignment-service.ts",
    ];

    for (const file of featureFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain("ItemForStaff");
      expect(source, file).not.toContain("shapeForRole");
    }
  });
});

describe("AC-28: every quoted literal is exported from one module", () => {
  it("AC-28: the empty-state sentences read exactly as the criteria quote them", () => {
    expect(NO_ITEMS_YET).toBe("No items yet. Run npm run seed:workbook, or add the first item.");
    expect(NO_ITEMS_MATCH).toBe("No items match those filters.");
    expect(NO_PRICE_RECORDED).toBe(
      "No price recorded. Lines for this item will count as 0 and raise a warning on the count summary.",
    );
    expect(noItemsAssigned("Dublin")).toBe("No items are assigned to Dublin yet.");
  });

  it("AC-28: the confirmations read exactly as the criteria quote them", () => {
    expect(SAVED).toBe("Saved.");
    expect(PRICE_ADDED).toBe("Price added.");
    expect(ARCHIVED).toBe("Archived.");
    expect(MARKED_AS_REVIEWED).toBe("Marked as reviewed.");
  });

  it("AC-28: a confirmation travels as a key, and an unknown key renders nothing", () => {
    expect(doneMessage("saved")).toBe(SAVED);
    expect(doneMessage("price-added")).toBe(PRICE_ADDED);
    expect(doneMessage(undefined)).toBeNull();
    // A link is something anybody can write, so an unrecognised key says nothing at all.
    expect(doneMessage("Your account has been suspended, call this number")).toBeNull();
  });

  it("AC-28: a key off Object.prototype renders nothing, and does not crash the page", () => {
    // The key comes off a QUERY STRING. A plain object literal inherits
    // `Object.prototype`, so `DONE_MESSAGE[key] ?? null` answered `?done=toString` with a
    // FUNCTION from a lookup typed `string` - which `Notices` would render and React
    // would throw on. A crash anybody could put in a link.
    for (const key of ["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"]) {
      const message = doneMessage(key);

      expect(message, `doneMessage(${JSON.stringify(key)})`).toBeNull();
      // Belt and braces: whatever comes back is renderable text or nothing at all.
      expect(typeof message === "string" || message === null).toBe(true);
    }
  });

  it("AC-8, AC-9, AC-12, AC-14, AC-26: the refusals read exactly as the criteria quote them", () => {
    expect(DESCRIPTION_REQUIRED).toBe("Description is required.");
    expect(itemAlreadyExists("Beads", "Kelly")).toBe(
      'An item "Beads" already exists for supplier Kelly.',
    );
    expect(itemAlreadyExists("School Logo Triangle", null)).toBe(
      'An item "School Logo Triangle" already exists for no supplier.',
    );
    expect(itemHasCountLines("Beads", 3)).toBe(
      '"Beads" appears on 3 count lines and cannot be deleted. Archive it instead.',
    );
    expect(priceDateAlreadyUsed("Beads", "2026-10-01")).toBe(
      'A price for "Beads" effective 2026-10-01 already exists. Prices are never overwritten: choose a later date.',
    );
    expect(supplierHasItems("Kelly", 27)).toBe(
      "Kelly supplies 27 items and cannot be deleted. Archive it instead.",
    );
  });

  it("AC-26: one item, one line, one type - the refusals pluralise", () => {
    expect(itemHasCountLines("Beads", 1)).toContain("appears on 1 count line and");
    expect(supplierHasItems("Kelly", 1)).toContain("supplies 1 item and");
    expect(itemTypeHasItems("Beads", 1)).toContain("is used by 1 item and");
    // A type has no archive to offer, because Part 3 gives it no `active` column (AC-27).
    expect(itemTypeHasItems("Beads", 4)).not.toContain("Archive it instead");
  });

  it("AC-29: no message this feature can render carries a database word", () => {
    const messages = [
      NO_ITEMS_YET,
      NO_ITEMS_MATCH,
      NO_PRICE_RECORDED,
      DESCRIPTION_REQUIRED,
      itemAlreadyExists("Beads", "Kelly"),
      itemHasCountLines("Beads", 3),
      priceDateAlreadyUsed("Beads", "2026-10-01"),
      supplierHasItems("Kelly", 27),
      itemTypeHasItems("Beads", 4),
    ];

    for (const message of messages) {
      for (const forbidden of [
        "prisma",
        "Prisma",
        "violates",
        "constraint",
        "SQLSTATE",
        "23001",
        "23505",
        "23514",
        "P2002",
        "P2003",
        "P2025",
      ]) {
        expect(message, message).not.toContain(forbidden);
      }
    }
  });
});

describe("AC-1: the section is in the protected set", () => {
  it("AC-1: PROTECTED_PATHS carries /item-master and the matcher carries the literal", () => {
    const authConfig = readFileSync("src/lib/auth-config.ts", "utf8");
    const middleware = readFileSync("src/middleware.ts", "utf8");

    expect(authConfig).toContain('"/item-master"');
    // Matcher patterns must be static literals - Next reads them at build time.
    expect(middleware).toContain('"/item-master/:path*"');
  });

  it("AC-1: the middleware still imports nothing from @prisma/client", () => {
    // Code, not prose: the file's own doc comment says it imports nothing from Prisma,
    // which is the sentence worth checking rather than a breach of it.
    const middleware = withoutComments(readFileSync("src/middleware.ts", "utf8"));

    expect(middleware).not.toContain("@prisma/client");
    expect(middleware).not.toContain("@/server/");
    // Non-vacuity: the scan really did read the module.
    expect(middleware).toContain("PROTECTED_PATHS");
  });
});
