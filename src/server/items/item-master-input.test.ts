import { describe, expect, it } from "vitest";

import {
  DESCRIPTION_REQUIRED,
  SUPPLIER_NAME_REQUIRED,
} from "@/lib/item-master-messages";
import { ValidationError } from "@/server/errors";
import {
  parseItemInput,
  parseItemListQuery,
  parseItemTypeInput,
  parseLocationCode,
  parseMoveDirection,
  parsePriceInput,
  parseSupplierName,
} from "@/server/items/item-master-input";

/**
 * Spec 006 AC-8's and AC-16's schema halves, plus AC-25's empty supplier name. No
 * database (AC-32): these are the rules the edge of `src/server/` enforces before any
 * service sees the data.
 */
function expectValidationError(run: () => unknown, field: string, message?: string): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }

  expect(thrown, "a ValidationError was thrown").toBeInstanceOf(ValidationError);
  expect((thrown as ValidationError).field).toBe(field);
  if (message !== undefined) {
    expect((thrown as ValidationError).message).toBe(message);
  }
}

describe("parseItemInput", () => {
  it("AC-8: an empty or whitespace-only description raises ValidationError on description", () => {
    const base = { supplierId: null, itemTypeId: "type_1", unitLabel: null, notes: null };

    expectValidationError(
      () => parseItemInput({ ...base, description: "" }),
      "description",
      DESCRIPTION_REQUIRED,
    );
    expectValidationError(
      () => parseItemInput({ ...base, description: "   " }),
      "description",
      DESCRIPTION_REQUIRED,
    );
  });

  it("AC-7: the description is trimmed and its internal whitespace is preserved", () => {
    const parsed = parseItemInput({
      description: "  Bicycle Logo's  1200mm  ",
      supplierId: "sup_1",
      itemTypeId: "type_1",
      unitLabel: "  20 Kg ",
      notes: "  a note ",
    });

    // Two spaces in, two spaces out. 005 open question 5 keeps the two-space and the
    // three-space spellings as two different items, so collapsing here would merge them.
    expect(parsed.description).toBe("Bicycle Logo's  1200mm");
    expect(parsed.unitLabel).toBe("20 Kg");
    expect(parsed.notes).toBe("a note");
  });

  it("AC-10: an empty supplier, unit label or note becomes null, not a placeholder", () => {
    const parsed = parseItemInput({
      description: "Beads",
      supplierId: "",
      itemTypeId: "type_1",
      unitLabel: "   ",
      notes: "",
    });

    expect(parsed.supplierId).toBeNull();
    expect(parsed.unitLabel).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it("AC-8: a missing item type raises ValidationError on itemTypeId", () => {
    expectValidationError(
      () =>
        parseItemInput({
          description: "Beads",
          supplierId: null,
          itemTypeId: "",
          unitLabel: null,
          notes: null,
        }),
      "itemTypeId",
    );
  });
});

describe("parsePriceInput", () => {
  const base = { itemId: "item_1", effectiveFrom: "2026-01-01", label: null };

  it("AC-16: rejects the five amounts Decimal(18, 8) cannot hold, naming unitPrice", () => {
    for (const amount of ["", "abc", "-1", "1.234567890", "12345678901.5"]) {
      expectValidationError(
        () => parsePriceInput({ ...base, unitPrice: amount }),
        "unitPrice",
      );
    }
  });

  it("AC-16: accepts 0, 33.09 and 6.11764706 and returns them unchanged", () => {
    for (const amount of ["0", "33.09", "6.11764706"]) {
      expect(parsePriceInput({ ...base, unitPrice: amount }).unitPrice).toBe(amount);
    }
  });

  it("AC-16: rejects an effectiveFrom that is not YYYY-MM-DD, naming effectiveFrom", () => {
    for (const date of ["", "01/01/2026", "2026-1-1", "2026-13-01", "2026-02-31", "today"]) {
      expectValidationError(
        () => parsePriceInput({ ...base, unitPrice: "1.00", effectiveFrom: date }),
        "effectiveFrom",
      );
    }
  });

  it("AC-16: a valid date survives with no timezone shift applied to the string", () => {
    expect(parsePriceInput({ ...base, unitPrice: "1.00" }).effectiveFrom).toBe("2026-01-01");
  });

  it("AC-16: the schema never converts the amount through Number", () => {
    // A JS number would turn this into 12345678.9; the string must arrive intact.
    expect(parsePriceInput({ ...base, unitPrice: "12345678.90000000" }).unitPrice).toBe(
      "12345678.90000000",
    );
  });
});

describe("parseSupplierName and parseItemTypeInput", () => {
  it("AC-25: an empty or whitespace-only supplier name raises ValidationError on name", () => {
    expectValidationError(() => parseSupplierName({ name: "" }), "name", SUPPLIER_NAME_REQUIRED);
    expectValidationError(() => parseSupplierName({ name: "  " }), "name", SUPPLIER_NAME_REQUIRED);
  });

  it("AC-25: a supplier name is trimmed", () => {
    expect(parseSupplierName({ name: "  Kelly " }).name).toBe("Kelly");
  });

  it("AC-27: an item type needs both a code and a name", () => {
    expectValidationError(() => parseItemTypeInput({ code: "", name: "Beads" }), "code");
    expectValidationError(() => parseItemTypeInput({ code: "BEADS", name: " " }), "name");
    expect(parseItemTypeInput({ code: " BEADS ", name: " Beads " })).toEqual({
      code: "BEADS",
      name: "Beads",
    });
  });
});

describe("parseLocationCode and parseMoveDirection", () => {
  it("AC-21: only the two yards of the product brief are codes", () => {
    expect(parseLocationCode("DUBLIN")).toBe("DUBLIN");
    expect(parseLocationCode("CLONMEL")).toBe("CLONMEL");
    expectValidationError(() => parseLocationCode("CORK"), "locationCode");
    expectValidationError(() => parseLocationCode("dublin"), "locationCode");
  });

  it("AC-23: a direction is UP or DOWN and nothing else", () => {
    expect(parseMoveDirection("UP")).toBe("UP");
    expect(parseMoveDirection("DOWN")).toBe("DOWN");
    expectValidationError(() => parseMoveDirection("SIDEWAYS"), "direction");
  });
});

describe("parseItemListQuery", () => {
  it("AC-6: an absent query is the default active list", () => {
    expect(parseItemListQuery({})).toEqual({
      q: null,
      filter: "active",
      supplierId: null,
      itemTypeId: null,
      locationCode: null,
    });
  });

  it("AC-6: the four filters and the three narrowing parameters are read", () => {
    expect(
      parseItemListQuery({
        q: " multigrip ",
        filter: "needs-review",
        supplierId: "sup_1",
        itemTypeId: "type_1",
        locationCode: "CLONMEL",
      }),
    ).toEqual({
      q: "multigrip",
      filter: "needs-review",
      supplierId: "sup_1",
      itemTypeId: "type_1",
      locationCode: "CLONMEL",
    });
  });

  it("AC-6 failure path: a hand-edited query navigates, it does not raise", () => {
    // A query string is a navigation, not a submission: there is no field to put a
    // message beside, so nonsense falls back to the default list.
    expect(parseItemListQuery({ filter: "nonsense", locationCode: "MARS" })).toEqual({
      q: null,
      filter: "active",
      supplierId: null,
      itemTypeId: null,
      locationCode: null,
    });
  });

  it("AC-6: a repeated parameter takes its first value rather than an array", () => {
    expect(parseItemListQuery({ q: ["beads", "paint"] }).q).toBe("beads");
  });
});
