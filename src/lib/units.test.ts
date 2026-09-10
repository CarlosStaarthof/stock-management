import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { normaliseUnit, UNIT_KINDS } from "@/lib/units";

/**
 * Spec 005 AC-10 — `specs/domain-model.md` Part 2's unit table, every row of it.
 *
 * Level 1 of docs/verification.md: pure logic, no database, and every assertion is on a
 * VALUE rather than on nothing having exploded. The 140-item tally AC-10 also names is
 * asserted in `src/server/items/workbook-plan.test.ts`, where the plan exists.
 */

/** Every unit string the workbook actually holds, with what Part 2 says it means. */
const PART_2_TABLE: { label: string; kind: string; kg: string | null }[] = [
  { label: "Tonne", kind: "TONNE", kg: "1000" },
  { label: "20kg", kind: "KILOGRAM", kg: "20" },
  { label: "20 Kg", kind: "KILOGRAM", kg: "20" },
  { label: "20Kg", kind: "KILOGRAM", kg: "20" },
  { label: "20kgs", kind: "KILOGRAM", kg: "20" },
  { label: "18KG", kind: "KILOGRAM", kg: "18" },
  { label: "21 Kg", kind: "KILOGRAM", kg: "21" },
  { label: "22 Kg", kind: "KILOGRAM", kg: "22" },
  { label: "16kg", kind: "KILOGRAM", kg: "16" },
  { label: "14kg", kind: "KILOGRAM", kg: "14" },
  { label: "14 kgs", kind: "KILOGRAM", kg: "14" },
  { label: "900 Kgs", kind: "KILOGRAM", kg: "900" },
  { label: "900kg", kind: "KILOGRAM", kg: "900" },
  { label: "25L", kind: "LITRE", kg: null },
  { label: "Ltrs", kind: "LITRE", kg: null },
  { label: "1 Unit", kind: "UNIT", kg: null },
  { label: "I Unit", kind: "UNIT", kg: null },
  { label: "2 Unit", kind: "UNIT", kg: null },
  { label: "3 Unit", kind: "UNIT", kg: null },
  { label: "Unit", kind: "UNIT", kg: null },
  { label: "1", kind: "UNIT", kg: null },
  { label: "lin.m", kind: "LINEAR_METRE", kg: null },
];

describe("normaliseUnit", () => {
  it.each(PART_2_TABLE)(
    "AC-10: $label is $kind with unitQuantityKg $kg",
    ({ label, kind, kg }) => {
      const normalised = normaliseUnit(label);

      expect(normalised.unitKind).toBe(kind);
      expect(normalised.unitQuantityKg).toBe(kg);
    },
  );

  it("AC-10: an empty cell is UNIT with no label and no weight", () => {
    // Seven rows of the workbook have no unit at all - Dublin D9, D18, D29, D44, D45, D46
    // and D78 - and they are imported, not dropped (Part 2).
    expect(normaliseUnit(null)).toEqual({ unitLabel: null, unitKind: "UNIT", unitQuantityKg: null });
    expect(normaliseUnit("")).toEqual({ unitLabel: null, unitKind: "UNIT", unitQuantityKg: null });
    expect(normaliseUnit("   ")).toEqual({ unitLabel: null, unitKind: "UNIT", unitQuantityKg: null });
  });

  it("AC-10: unitQuantityKg is null for every kind except TONNE and KILOGRAM", () => {
    const withWeight = PART_2_TABLE.filter((row) => normaliseUnit(row.label).unitQuantityKg !== null);
    const kinds = [...new Set(withWeight.map((row) => normaliseUnit(row.label).unitKind))].sort();

    expect(kinds).toEqual(["KILOGRAM", "TONNE"]);
  });

  it("AC-10: the label is the workbook's own string, so 20 Kg and 20kg stay two labels", () => {
    const spaced = normaliseUnit("20 Kg");
    const tight = normaliseUnit("20kg");

    expect(spaced.unitLabel).toBe("20 Kg");
    expect(tight.unitLabel).toBe("20kg");

    // Same meaning, two labels: yard staff recognise the exact string they wrote.
    expect(spaced.unitLabel).not.toBe(tight.unitLabel);
    expect(spaced.unitKind).toBe(tight.unitKind);
    expect(spaced.unitQuantityKg).toBe(tight.unitQuantityKg);
  });

  it("AC-10: the 22 labels in the file collapse onto 11 distinct (kind, kg) pairs", () => {
    expect(PART_2_TABLE).toHaveLength(22);

    const pairs = new Set(
      PART_2_TABLE.map((row) => {
        const normalised = normaliseUnit(row.label);
        return `${normalised.unitKind}/${normalised.unitQuantityKg ?? "-"}`;
      }),
    );

    // docs/domain-glossary.md says "13"; it is 11, and spec 005 records that correction.
    expect(pairs.size).toBe(11);
  });

  it("AC-10: I Unit is a capital i and not the digit one, and both are UNIT", () => {
    expect("I Unit".charCodeAt(0)).toBe(73);
    expect("1 Unit".charCodeAt(0)).toBe(49);
    expect(normaliseUnit("I Unit").unitKind).toBe("UNIT");
    expect(normaliseUnit("1 Unit").unitKind).toBe("UNIT");
  });

  it("AC-10: a label the table does not name falls to UNIT rather than throwing", () => {
    // The failure path. prisma/schema.prisma says UNIT is the default because "a bare
    // number with no label is a count of things"; Part 2 says a row is never silently
    // dropped. So an unknown label is imported and left for #15's housekeeping worklist.
    const normalised = normaliseUnit("5 Gallon Drum");

    expect(normalised.unitKind).toBe("UNIT");
    expect(normalised.unitQuantityKg).toBeNull();
    expect(normalised.unitLabel).toBe("5 Gallon Drum");
  });
});

describe("UNIT_KINDS", () => {
  it("AC-10: equals the UnitKind labels declared in prisma/schema.prisma", () => {
    // Read as TEXT on purpose: the check then needs no database and no generated client,
    // and src/lib/ keeps importing nothing from src/server/db or @prisma/client.
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    const block = /enum\s+UnitKind\s*\{([^}]*)\}/.exec(schema);

    expect(block).not.toBeNull();

    const declared = (block?.[1] ?? "")
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter((line) => line.length > 0);

    expect([...UNIT_KINDS]).toEqual(declared);
  });
});
