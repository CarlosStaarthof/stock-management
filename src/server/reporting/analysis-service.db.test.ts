import { beforeEach, describe, expect, it } from "vitest";

import { formatFigure } from "@/lib/analysis-messages";
import { MONEY_KEY_PATTERN, deepKeys } from "@/lib/money-boundary";
import { roundHalfUp, sumDecimals } from "@/lib/money";
import { db } from "@/server/db";
import { resetTestDb } from "@/server/test-db";
import { getAnalysis, listApprovedPeriods } from "@/server/reporting/analysis-service";
import type { AnalysisForAdmin, BreakdownKey } from "@/types/analysis";
import type { CountStatus } from "@/types/stock-count";

import { allTableCounts, countRowOf, lineRowsOf } from "../../../tests/support/count-fixture";
import { ADMIN, CLONMEL_ID, DUBLIN_ID, makePrice } from "../../../tests/support/item-master-fixture";

/**
 * Spec 011 at Level 2 (`docs/verification.md`): the figures, against a REAL Postgres and a
 * HAND-BUILT fixture.
 *
 * EVERY LITERAL EURO IN THESE CRITERIA IS ASSERTED HERE, on rows this file created, never
 * against the user's seeded item master — a literal asserted against real data is an
 * assertion about the user's data, which is the choice 007's start spec recorded and 008
 * repeated.
 *
 * TYPESCRIPT DOES NOT PROTECT ANY OF THIS. Every assertion below is over a VALUE returned
 * by the service, never over a type.
 */

beforeEach(async () => {
  await resetTestDb();
});

/* ------------------------------------------------------------------ the fixture */

type LineSpec = {
  /** Lines that share a key share an ITEM, which is how a group spans two yards. */
  item?: string;
  /** `ItemType.code`. Defaults to the first declared type. */
  type?: string;
  /** `Supplier.name`, or `null` for the items Dublin!A45 represents. */
  supplier?: string | null;
  quantity: string | null;
  /** The price snapshot, written once at submit and never rewritten (Invariant 2). */
  snapshot: string | null;
};

type CountSpec = {
  yard: "DUBLIN" | "CLONMEL";
  /** `"2026-09"`. */
  periodKey: string;
  status: CountStatus;
  lines: LineSpec[];
};

type FixtureSpec = {
  /** Declared in the order they should appear in the breakdown. */
  types?: { code: string; name: string }[];
  counts: CountSpec[];
};

type Fixture = {
  /** `"2026-09|DUBLIN"` -> count id. */
  countIds: Map<string, string>;
  /** Item description -> item id. */
  itemIds: Map<string, string>;
};

const YARD_IDS: Record<CountSpec["yard"], string> = {
  DUBLIN: DUBLIN_ID,
  CLONMEL: CLONMEL_ID,
};

const DEFAULT_TYPE = { code: "BEADS", name: "Beads" };

/** `"2026-09"` -> the two integers the column holds. A test may say `Number(`; AC-10's scan excludes it. */
function periodOf(periodKey: string): { periodYear: number; periodMonth: number } {
  return {
    periodYear: Number(periodKey.slice(0, 4)),
    periodMonth: Number(periodKey.slice(5, 7)),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Lines that name the same `item` share one, which is how a group spans two yards. */
function descriptionOf(
  line: LineSpec,
  countIndex: number,
  lineIndex: number,
  defaultType: string,
): string {
  return line.item ?? `item-${countIndex}-${lineIndex}-${line.type ?? defaultType}`;
}

/** `undefined` is the default supplier; `null` is Dublin!A45, which has none. */
function supplierNameOf(line: LineSpec): string | null {
  return line.supplier === undefined ? "Kelly" : line.supplier;
}

/**
 * Rows in a real Postgres, built through Prisma rather than through the service under test:
 * a fixture that used `getAnalysis` could not fail independently of the thing it proves.
 *
 * SIX STATEMENTS, NOT FIFTY. AC-9's fixture alone is 47 lines, and one `create` per row
 * against a database in another region is 47 opportunities for a dropped link to fail the
 * gate - which is exactly what the first run of this file did. `createMany` with explicit
 * ids is the same rows in one round trip, and the ids have to be explicit because
 * `createMany` returns none. `tests/support/item-master-fixture.ts` made the same move in #6.
 */
async function seed(spec: FixtureSpec): Promise<Fixture> {
  const declared = spec.types ?? [DEFAULT_TYPE];
  const typeIds = new Map(declared.map((type, index) => [type.code, `fixture_type_${index}`]));

  await db.itemType.createMany({
    data: declared.map((type, index) => ({
      id: `fixture_type_${index}`,
      code: type.code,
      name: type.name,
      sortOrder: index + 1,
    })),
  });

  const entries = spec.counts.flatMap((count, countIndex) =>
    count.lines.map((line, lineIndex) => ({
      countIndex,
      line,
      description: descriptionOf(line, countIndex, lineIndex, declared[0].code),
    })),
  );

  const supplierNames = unique(
    entries
      .map((entry) => supplierNameOf(entry.line))
      .filter((name): name is string => name !== null),
  );
  const supplierIds = new Map(supplierNames.map((name, index) => [name, `fixture_sup_${index}`]));
  if (supplierNames.length > 0) {
    await db.supplier.createMany({
      data: supplierNames.map((name, index) => ({ id: `fixture_sup_${index}`, name })),
    });
  }

  const itemIds = new Map<string, string>();
  const itemRows: {
    id: string;
    description: string;
    itemTypeId: string;
    supplierId: string | null;
    unitLabel: string;
  }[] = [];

  for (const entry of entries) {
    if (itemIds.has(entry.description)) continue;

    const typeCode = entry.line.type ?? declared[0].code;
    const itemTypeId = typeIds.get(typeCode);
    if (itemTypeId === undefined) throw new Error(`fixture: undeclared type ${typeCode}`);

    const id = `fixture_item_${String(itemIds.size).padStart(4, "0")}`;
    itemIds.set(entry.description, id);

    const supplierName = supplierNameOf(entry.line);
    itemRows.push({
      id,
      description: entry.description,
      itemTypeId,
      supplierId: supplierName === null ? null : (supplierIds.get(supplierName) ?? null),
      unitLabel: "20 Kg",
    });
  }

  if (itemRows.length > 0) await db.item.createMany({ data: itemRows });

  await db.user.createMany({
    data: [
      {
        id: "fixture_user",
        email: "analysis-fixture@macroads.test",
        name: "Fixture user",
        // Not a real hash and never verified: no test here signs in.
        passwordHash: "fixture-not-a-hash",
        role: "ADMIN",
      },
    ],
  });

  const countIds = new Map<string, string>();
  await db.stockCount.createMany({
    data: spec.counts.map((count, countIndex) => {
      const id = `fixture_count_${countIndex}`;
      countIds.set(`${count.periodKey}|${count.yard}`, id);

      return {
        id,
        locationId: YARD_IDS[count.yard],
        ...periodOf(count.periodKey),
        countDate: new Date(`${count.periodKey}-15T00:00:00.000Z`),
        status: count.status,
        createdById: "fixture_user",
      };
    }),
  });

  await db.stockCountLine.createMany({
    data: spec.counts.flatMap((count, countIndex) =>
      count.lines.map((line, lineIndex) => {
        const itemId = itemIds.get(descriptionOf(line, countIndex, lineIndex, declared[0].code));
        if (itemId === undefined) throw new Error("fixture: missing item");

        return {
          stockCountId: `fixture_count_${countIndex}`,
          itemId,
          quantity: line.quantity,
          unitPriceSnapshot: line.snapshot,
        };
      }),
    ),
  });

  return { countIds, itemIds };
}

function analysisOf(periodKey: string, breakdownKey: BreakdownKey = "type"): Promise<AnalysisForAdmin> {
  return getAnalysis(ADMIN, { periodKey, breakdownKey });
}

function yardOf(analysis: AnalysisForAdmin, code: string) {
  const figure = analysis.period.yards.find((yard) => yard.locationCode === code);
  if (figure === undefined) throw new Error(`no yard ${code} in the shape`);
  return figure;
}

/** AC-7's fixture, whose arithmetic the criterion does by hand. */
const AC7: FixtureSpec = {
  counts: [
    {
      yard: "DUBLIN",
      periodKey: "2026-09",
      status: "APPROVED",
      lines: [
        { quantity: "890", snapshot: "9.83" },
        { quantity: "21.6128", snapshot: "6.11764706" },
        { quantity: "0", snapshot: "45" },
      ],
    },
    {
      yard: "CLONMEL",
      periodKey: "2026-09",
      status: "APPROVED",
      lines: [
        { quantity: "0.475", snapshot: "33.09" },
        { quantity: "7", snapshot: null },
      ],
    },
  ],
};

const DUBLIN_VALUE = "8880.919482378368";
const CLONMEL_VALUE = "15.71775";
const TOTAL_VALUE = "8896.637232378368";

/* ---------------------------------------------------------------------- AC-7 */

describe("011 AC-7: the per-yard figures and the total, by hand", () => {
  it("AC-7: the three literal figures the criterion computes", async () => {
    await seed(AC7);

    const analysis = await analysisOf("2026-09");

    expect(yardOf(analysis, "DUBLIN").yardValue).toBe(DUBLIN_VALUE);
    expect(yardOf(analysis, "CLONMEL").yardValue).toBe(CLONMEL_VALUE);
    expect(analysis.period.totalStock).toBe(TOTAL_VALUE);
    expect(analysis.period.complete).toBe(true);
  });

  it("AC-7: and the strings a page renders from them", async () => {
    await seed(AC7);

    const analysis = await analysisOf("2026-09");

    expect(formatFigure(yardOf(analysis, "DUBLIN").yardValue ?? "")).toBe("€8,880.92");
    expect(formatFigure(yardOf(analysis, "CLONMEL").yardValue ?? "")).toBe("€15.72");
    expect(formatFigure(analysis.period.totalStock ?? "")).toBe("€8,896.64");
  });

  it("AC-7: the total is the sum of the EXACT yards, not the sum of the rounded ones", async () => {
    // A fixture built so the two answers differ: each yard rounds to €0.00 and the total
    // does not. Invariant 10 - a stock system that disagrees with the file it replaced, by
    // any amount, will not be trusted.
    await seed({
      counts: [
        { yard: "DUBLIN", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "0.004", snapshot: "1" }] },
        { yard: "CLONMEL", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "0.004", snapshot: "1" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");
    const rounded = analysis.period.yards.map((yard) => roundHalfUp(yard.yardValue ?? "0", 2));

    expect(analysis.period.totalStock).toBe("0.008");
    expect(formatFigure(analysis.period.totalStock ?? "")).toBe("€0.01");

    // The rendered column: two cents that are not there, and a total that is.
    expect(rounded).toEqual(["0.00", "0.00"]);
    expect(analysis.period.yards.map((yard) => formatFigure(yard.yardValue ?? ""))).toEqual([
      "€0.00",
      "€0.00",
    ]);
    expect(roundHalfUp(analysis.period.totalStock ?? "0", 2)).toBe("0.01");
    expect(roundHalfUp(analysis.period.totalStock ?? "0", 2)).not.toBe(sumDecimals(rounded));
  });

  it("AC-7: the total is stored nowhere - no column of either table holds it", async () => {
    await seed(AC7);
    await analysisOf("2026-09");

    const count = await countRowOf(
      (await db.stockCount.findFirstOrThrow({ select: { id: true } })).id,
    );

    expect(Object.keys(count)).not.toContain("value");
    expect(Object.keys(count)).not.toContain("total");
    expect(Object.values(count).map(String)).not.toContain(TOTAL_VALUE);
  });
});

/* ---------------------------------------------------------------------- AC-5 */

describe("011 AC-5: only an APPROVED count carries a euro", () => {
  const MIXED: FixtureSpec = {
    counts: [
      { yard: "DUBLIN", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "10", snapshot: "2" }] },
      {
        yard: "CLONMEL",
        periodKey: "2026-09",
        status: "SUBMITTED",
        // ITS SNAPSHOTS EXIST. They are deliberately not read.
        lines: [{ quantity: "100", snapshot: "99" }],
      },
    ],
  };

  it("AC-5: a SUBMITTED yard is named, linked, and worth nothing", async () => {
    const fixture = await seed(MIXED);

    const analysis = await analysisOf("2026-09");
    const clonmel = yardOf(analysis, "CLONMEL");

    expect(clonmel.yardValue).toBeNull();
    expect(clonmel.countStatus).toBe("SUBMITTED");
    expect(clonmel.countId).toBe(fixture.countIds.get("2026-09|CLONMEL"));
    expect(clonmel.countDate).toBe("2026-09-15");
    expect(analysis.period.complete).toBe(false);
  });

  it("AC-5: a third active yard with no count at all is absent from every figure", async () => {
    await seed(MIXED);
    await db.location.create({
      data: { id: "loc_fixture_third", code: "CORK", name: "Cork", active: true, sortOrder: 3 },
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.period.yards.map((yard) => yard.locationCode)).toEqual([
      "DUBLIN",
      "CLONMEL",
      "CORK",
    ]);
    expect(yardOf(analysis, "CORK").countStatus).toBeNull();
    expect(yardOf(analysis, "CORK").yardValue).toBeNull();
    expect(analysis.period.missingYardNames).toEqual(["Clonmel", "Cork"]);
  });

  it("AC-5: DRAFT is the same answer with a different word, and APPROVED changes nothing else", async () => {
    const fixture = await seed(MIXED);
    const clonmelId = fixture.countIds.get("2026-09|CLONMEL") ?? "";

    const beforeDublin = yardOf(await analysisOf("2026-09"), "DUBLIN");

    await db.stockCount.update({ where: { id: clonmelId }, data: { status: "DRAFT" } });
    const asDraft = await analysisOf("2026-09");
    expect(yardOf(asDraft, "CLONMEL").yardValue).toBeNull();
    expect(yardOf(asDraft, "CLONMEL").countStatus).toBe("DRAFT");
    expect(asDraft.period.complete).toBe(false);

    await db.stockCount.update({ where: { id: clonmelId }, data: { status: "APPROVED" } });
    const asApproved = await analysisOf("2026-09");
    expect(yardOf(asApproved, "CLONMEL").yardValue).toBe("9900");
    expect(asApproved.period.complete).toBe(true);

    // NO OTHER FIELD OF THE DUBLIN FIGURE MOVES when the other yard is approved.
    expect(yardOf(asApproved, "DUBLIN")).toEqual(beforeDublin);
  });

  it("AC-5: a SUBMITTED count contributes to no figure on the whole screen", async () => {
    await seed(MIXED);

    const analysis = await analysisOf("2026-09", "supplier");

    expect(analysis.period.totalStock).toBeNull();
    expect(analysis.monthOnMonth.state).not.toBe("COMPARABLE");
    expect(analysis.yearOnYear.state).not.toBe("COMPARABLE");
    expect(analysis.trend.every((point) => point.totalStock === null)).toBe(true);

    // The one group in the fixture carries Dublin's 20 and nothing of Clonmel's 9,900.
    for (const row of analysis.breakdown) {
      const clonmelCell = row.perYard.find((cell) => cell.locationCode === "CLONMEL");
      expect(clonmelCell?.amount ?? null).toBeNull();
      expect(row.amount).toBeNull();
    }
    expect(analysis.breakdown.map((row) => row.perYard[0].amount)).toEqual(["20"]);
  });
});

/* ---------------------------------------------------------------------- AC-6 */

describe("011 AC-6: a missing month is a gap, never a zero", () => {
  it("AC-6: one yard approved, one absent - and every figure says so differently", async () => {
    await seed({
      counts: [
        { yard: "DUBLIN", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "10", snapshot: "2" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.period.complete).toBe(false);
    expect(analysis.period.missingYardNames).toEqual(["Clonmel"]);
    expect(analysis.period.totalStock).toBeNull();
    expect(analysis.period.totalStock).not.toBe("0");

    for (const row of analysis.breakdown) {
      expect(row.amount).toBeNull();
      // The per-yard cell of the APPROVED yard is still a figure.
      expect(row.perYard.find((cell) => cell.locationCode === "DUBLIN")?.amount).toBe("20");
      expect(row.perYard.find((cell) => cell.locationCode === "CLONMEL")?.amount).toBeNull();
    }

    expect(analysis.monthOnMonth.state).not.toBe("COMPARABLE");
    expect(analysis.yearOnYear.state).not.toBe("COMPARABLE");
  });

  it("AC-6: THE CONVERSE - a complete period holding nothing is zero, and says zero", async () => {
    await seed({
      counts: [
        { yard: "DUBLIN", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "0", snapshot: "45" }] },
        { yard: "CLONMEL", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "0", snapshot: "33.09" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.period.complete).toBe(true);
    expect(analysis.period.totalStock).toBe("0");
    expect(formatFigure(analysis.period.totalStock ?? "")).toBe("€0.00");
    // Counted-and-empty and never-counted are two different facts, and they render
    // differently: the first is a bar, the second is a gap.
    expect(analysis.trend[analysis.trend.length - 1].complete).toBe(true);
    expect(analysis.trend[analysis.trend.length - 1].totalStock).toBe("0");
  });

  it("AC-6: with no approved count anywhere the shape carries no figure at all", async () => {
    await seed({
      counts: [
        { yard: "DUBLIN", periodKey: "2026-09", status: "DRAFT", lines: [{ quantity: "10", snapshot: null }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.anyApprovedCountEver).toBe(false);
    expect(analysis.period.totalStock).toBeNull();
    expect(analysis.breakdown).toEqual([]);
    expect(analysis.trend.every((point) => point.totalStock === null)).toBe(true);
    expect(analysis.previousApprovedPeriodKey).toBeNull();
    expect(analysis.nextApprovedPeriodKey).toBeNull();
    expect(await listApprovedPeriods(ADMIN)).toEqual([]);
  });

  it("AC-6: an empty database is an empty shape, with no figure to render as zero", async () => {
    const analysis = await analysisOf("2026-09");

    expect(analysis.anyApprovedCountEver).toBe(false);
    expect(analysis.period.yards.map((yard) => yard.countStatus)).toEqual([null, null]);
    expect(analysis.period.totalStock).toBeNull();
    expect(JSON.stringify(analysis)).not.toContain("€");
  });
});

/* ---------------------------------------------------------------------- AC-9 */

describe("011 AC-9: a held line with no price counts zero, and says so", () => {
  /** 3 held and unpriced, 4 counted-as-zero and unpriced, 40 priced. */
  const AC9_LINES: LineSpec[] = [
    ...Array.from({ length: 3 }, () => ({ quantity: "5", snapshot: null })),
    ...Array.from({ length: 4 }, () => ({ quantity: "0", snapshot: null })),
    ...Array.from({ length: 40 }, () => ({ quantity: "2", snapshot: "1.5" })),
  ];

  const AC9: FixtureSpec = {
    counts: [
      { yard: "DUBLIN", periodKey: "2026-09", status: "APPROVED", lines: AC9_LINES },
      { yard: "CLONMEL", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "1", snapshot: "10" }] },
    ],
  };

  it("AC-9: the count is 3 - the four zero-quantity unpriced lines are counted nowhere", async () => {
    await seed(AC9);

    const analysis = await analysisOf("2026-09");

    expect(yardOf(analysis, "DUBLIN").unvaluedHeldLineCount).toBe(3);
    expect(yardOf(analysis, "DUBLIN").heldLineCount).toBe(43);
    expect(analysis.period.unvaluedHeldLineCount).toBe(3);
    expect(yardOf(analysis, "CLONMEL").unvaluedHeldLineCount).toBe(0);

    // A line counted as none is not stock that failed to be valued, and a warning that
    // fires on all 35 zero rows of a Dublin count is a warning nobody reads.
    const rows = analysis.breakdown.filter((row) => row.unvaluedHeldLineCount > 0);
    expect(rows.map((row) => row.unvaluedHeldLineCount)).toEqual([3]);
  });

  it("AC-9: the three lines contribute exactly nothing - the same figure without them", async () => {
    await seed(AC9);
    const withThem = await analysisOf("2026-09");

    await resetTestDb();
    await seed({
      counts: [
        {
          yard: "DUBLIN",
          periodKey: "2026-09",
          status: "APPROVED",
          lines: AC9_LINES.filter((line) => !(line.quantity === "5" && line.snapshot === null)),
        },
        { yard: "CLONMEL", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "1", snapshot: "10" }] },
      ],
    });
    const without = await analysisOf("2026-09");

    expect(withThem.period.totalStock).toBe(without.period.totalStock);
    expect(yardOf(withThem, "DUBLIN").yardValue).toBe(yardOf(without, "DUBLIN").yardValue);
    // And the disclosure is the only difference between the two shapes.
    expect(yardOf(withThem, "DUBLIN").unvaluedHeldLineCount).toBe(3);
    expect(yardOf(without, "DUBLIN").unvaluedHeldLineCount).toBe(0);
  });

  it("AC-9: a group whose only held lines are unpriced is NEVER omitted", async () => {
    // EUR 486 counted and never valued was invisible because it was absent. Here it is
    // visible as counted-not-valued, beside a total that is honest about being short.
    await seed({
      types: [
        { code: "BEADS", name: "Beads" },
        { code: "PAINT", name: "Paints" },
      ],
      counts: [
        {
          yard: "DUBLIN",
          periodKey: "2026-09",
          status: "APPROVED",
          lines: [
            { type: "BEADS", quantity: "2", snapshot: "10" },
            { type: "PAINT", quantity: "9", snapshot: null },
          ],
        },
        { yard: "CLONMEL", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");
    const paints = analysis.breakdown.find((row) => row.groupLabel === "Paints");

    expect(paints).toBeDefined();
    expect(paints?.amount).toBe("0");
    expect(formatFigure(paints?.amount ?? "")).toBe("€0.00");
    expect(paints?.unvaluedHeldLineCount).toBe(1);
  });
});

/* ---------------------------------------------------------------------- AC-8 */

describe("011 AC-8: no price-list edit moves a figure on this screen", () => {
  it("AC-8: five operations, and the whole shape is deeply equal after each", async () => {
    const fixture = await seed(AC7);
    const before = await analysisOf("2026-09");
    const unpricedItem = fixture.itemIds.get("item-1-1-BEADS") ?? "";
    const pricedItem = fixture.itemIds.get("item-0-0-BEADS") ?? "";

    const operations: { name: string; run: () => Promise<unknown> }[] = [
      { name: "a price effective BEFORE countDate", run: () => makePrice(pricedItem, "1000", "2026-09-01") },
      { name: "a price effective ON countDate", run: () => makePrice(pricedItem, "2000", "2026-09-15") },
      { name: "a price effective AFTER countDate", run: () => makePrice(pricedItem, "3000", "2026-09-30") },
      { name: "a FIRST-EVER price for the item that had none", run: () => makePrice(unpricedItem, "81", "2020-01-01") },
      {
        name: "archiving an item the count references",
        run: () => db.item.update({ where: { id: pricedItem }, data: { active: false } }),
      },
    ];

    for (const operation of operations) {
      await operation.run();

      const after = await analysisOf("2026-09");
      expect(after, `${operation.name} must not move a figure`).toEqual(before);
      expect(after.period.totalStock).toBe(TOTAL_VALUE);
    }

    // And the archived item is still IN the count: a count is what a yard held THEN.
    expect(await db.itemPrice.count()).toBe(4);
    expect(yardOf(await analysisOf("2026-09"), "DUBLIN").heldLineCount).toBe(2);
  });
});

/* -------------------------------------------------------------- AC-11, AC-12 */

describe("011 AC-11, AC-12: the two comparisons, joined on the period", () => {
  /** A rise: August 8,748.70 -> September 8,896.637232378368. */
  function twoPeriods(augustStatus: CountStatus): FixtureSpec {
    return {
      counts: [
        ...AC7.counts,
        { yard: "DUBLIN", periodKey: "2026-08", status: augustStatus, lines: [{ quantity: "890", snapshot: "9.83" }] },
        { yard: "CLONMEL", periodKey: "2026-08", status: augustStatus, lines: [{ quantity: "0", snapshot: "1" }] },
        // July is COMPLETE in the same fixture, and must never be reached for.
        { yard: "DUBLIN", periodKey: "2026-07", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
        { yard: "CLONMEL", periodKey: "2026-07", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
      ],
    };
  }

  it("AC-11: with both periods complete it is (y, m-1) and an exact difference", async () => {
    await seed(twoPeriods("APPROVED"));

    const analysis = await analysisOf("2026-09");

    expect(analysis.monthOnMonth.againstPeriodKey).toBe("2026-08");
    expect(analysis.monthOnMonth.againstPeriodLabel).toBe("August 2026");
    expect(analysis.monthOnMonth.state).toBe("COMPARABLE");
    expect(analysis.monthOnMonth.againstTotal).toBe("8748.7");
    expect(analysis.monthOnMonth.varianceAmount).toBe("147.937232378368");
  });

  it("AC-11: a fall is a negative figure, and renders with a true minus", async () => {
    await seed({
      counts: [
        { yard: "DUBLIN", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "1", snapshot: "100" }] },
        { yard: "CLONMEL", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "1", snapshot: "0" }] },
        { yard: "DUBLIN", periodKey: "2026-08", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1334.56" }] },
        { yard: "CLONMEL", periodKey: "2026-08", status: "APPROVED", lines: [{ quantity: "1", snapshot: "0" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.monthOnMonth.varianceAmount).toBe("-1234.56");
  });

  it("AC-11: an incomplete comparand REFUSES and does not reach back to July", async () => {
    // Silently comparing September with July is the workbook defect this rule exists to
    // prevent: a two-month movement labelled as one month.
    await seed({
      counts: [
        ...AC7.counts,
        { yard: "DUBLIN", periodKey: "2026-08", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
        { yard: "DUBLIN", periodKey: "2026-07", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
        { yard: "CLONMEL", periodKey: "2026-07", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.monthOnMonth.state).toBe("AGAINST_INCOMPLETE");
    expect(analysis.monthOnMonth.againstPeriodKey).toBe("2026-08");
    expect(analysis.monthOnMonth.againstPeriodKey).not.toBe("2026-07");
    expect(analysis.monthOnMonth.varianceAmount).toBeNull();
    expect(analysis.monthOnMonth.againstTotal).toBeNull();
  });

  it("AC-11: no count at all for the comparand is a THIRD answer", async () => {
    await seed(AC7);

    const analysis = await analysisOf("2026-09");

    expect(analysis.monthOnMonth.state).toBe("AGAINST_MISSING");
    expect(analysis.monthOnMonth.againstPeriodKey).toBe("2026-08");
  });

  it("AC-11: an incomplete SELECTED period is the first answer of the four", async () => {
    await seed({
      counts: [
        { yard: "DUBLIN", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
        { yard: "DUBLIN", periodKey: "2026-08", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
        { yard: "CLONMEL", periodKey: "2026-08", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.monthOnMonth.state).toBe("PERIOD_INCOMPLETE");
    expect(analysis.monthOnMonth.varianceAmount).toBeNull();
    // The comparand is complete and its total is still reported, unhidden.
    expect(analysis.monthOnMonth.againstTotal).toBe("2");
  });

  it("AC-12: year on year is (y-1, m) and never an ordinal walk", async () => {
    // 2025-09 and 2026-09 are complete; the months between hold GAPS, so the twelfth and
    // the eleventh most recent counted periods are both something else.
    await seed({
      counts: [
        ...AC7.counts,
        { yard: "DUBLIN", periodKey: "2025-09", status: "APPROVED", lines: [{ quantity: "100", snapshot: "1" }] },
        { yard: "CLONMEL", periodKey: "2025-09", status: "APPROVED", lines: [{ quantity: "0", snapshot: "1" }] },
        { yard: "DUBLIN", periodKey: "2025-10", status: "APPROVED", lines: [{ quantity: "5", snapshot: "1" }] },
        { yard: "DUBLIN", periodKey: "2026-08", status: "APPROVED", lines: [{ quantity: "7", snapshot: "1" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.yearOnYear.againstPeriodKey).toBe("2025-09");
    expect(analysis.yearOnYear.againstPeriodKey).not.toBe("2025-10");
    expect(analysis.yearOnYear.againstPeriodKey).not.toBe("2026-08");
    expect(analysis.yearOnYear.state).toBe("COMPARABLE");
    expect(analysis.yearOnYear.againstTotal).toBe("100");
    expect(analysis.yearOnYear.varianceAmount).toBe("8796.637232378368");
  });

  it("AC-12: the four states hold for year on year too, against its own period", async () => {
    await seed({
      counts: [
        ...AC7.counts,
        { yard: "DUBLIN", periodKey: "2025-09", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.yearOnYear.state).toBe("AGAINST_INCOMPLETE");
    expect(analysis.yearOnYear.againstPeriodLabel).toBe("September 2025");
    expect(analysis.yearOnYear.varianceAmount).toBeNull();
  });
});

/* --------------------------------------------------------------------- AC-14 */

describe("011 AC-14: the trend the chart is drawn from", () => {
  it("AC-14: thirteen points, oldest first, ending at the selected period", async () => {
    await seed({
      counts: [
        ...AC7.counts,
        { yard: "DUBLIN", periodKey: "2025-09", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
        { yard: "CLONMEL", periodKey: "2025-09", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.trend).toHaveLength(13);
    expect(analysis.trend[0].periodKey).toBe("2025-09");
    expect(analysis.trend[12].periodKey).toBe("2026-09");
    // The leftmost point IS the year-on-year comparand - why the window is 13, not 12.
    expect(analysis.trend[0].periodKey).toBe(analysis.yearOnYear.againstPeriodKey);

    expect(analysis.trend[0].totalStock).toBe("2");
    expect(analysis.trend[12].totalStock).toBe(TOTAL_VALUE);
    expect(analysis.trend.filter((point) => point.complete)).toHaveLength(2);
    expect(analysis.trend.filter((point) => point.totalStock === null)).toHaveLength(11);
  });

  it("AC-14: the chart's numbers ARE the table's - one array, two renderings", async () => {
    await seed(AC7);

    const analysis = await analysisOf("2026-09");
    const selected = analysis.trend[analysis.trend.length - 1];

    expect(selected.periodKey).toBe(analysis.periodKey);
    expect(selected.totalStock).toBe(analysis.period.totalStock);
    expect(selected.complete).toBe(analysis.period.complete);
    expect(selected.periodLabel).toBe(analysis.periodLabel);
  });
});

/* --------------------------------------------------------------------- AC-15 */

describe("011 AC-15: the breakdown, by type and by supplier", () => {
  const SPLIT: FixtureSpec = {
    types: [
      { code: "THERMO", name: "Thermo-P" },
      { code: "BEADS", name: "Beads" },
    ],
    counts: [
      {
        yard: "DUBLIN",
        periodKey: "2026-09",
        status: "APPROVED",
        lines: [
          { item: "thermo-white", type: "THERMO", supplier: "Kelly", quantity: "10", snapshot: "2.5" },
          { item: "beads-a", type: "BEADS", supplier: "Kestrel", quantity: "4", snapshot: "1.25" },
          { item: "logo", type: "BEADS", supplier: null, quantity: "2", snapshot: "3" },
          { item: "dormant", type: "BEADS", supplier: "Kelly", quantity: "0", snapshot: "99" },
        ],
      },
      {
        yard: "CLONMEL",
        periodKey: "2026-09",
        status: "APPROVED",
        lines: [
          { item: "thermo-white", type: "THERMO", supplier: "Kelly", quantity: "2", snapshot: "2.5" },
          { item: "beads-a", type: "BEADS", supplier: "Kestrel", quantity: "1", snapshot: "1.25" },
        ],
      },
    ],
  };

  it("AC-15: by type, in ItemType.sortOrder, with a cell per yard and a total", async () => {
    await seed(SPLIT);

    const analysis = await analysisOf("2026-09", "type");

    expect(analysis.breakdown.map((row) => row.groupLabel)).toEqual(["Thermo-P", "Beads"]);
    expect(analysis.breakdown[0].groupKey).toBe("THERMO");
    expect(analysis.breakdown[0].perYard).toEqual([
      { locationCode: "DUBLIN", amount: "25" },
      { locationCode: "CLONMEL", amount: "5" },
    ]);
    expect(analysis.breakdown[0].amount).toBe("30");
    // Beads: Dublin 5 + 6 + 0, Clonmel 1.25.
    expect(analysis.breakdown[1].amount).toBe("12.25");
  });

  it("AC-15: by supplier, name ascending, with No supplier LAST", async () => {
    await seed(SPLIT);

    const analysis = await analysisOf("2026-09", "supplier");

    expect(analysis.breakdown.map((row) => row.groupLabel)).toEqual([
      "Kelly",
      "Kestrel",
      "No supplier",
    ]);
    // The items with no supplier group under an empty key - Dublin!A45's real case.
    expect(analysis.breakdown[2].groupKey).toBe("");
    expect(analysis.breakdown[2].amount).toBe("6");
    expect(analysis.breakdown[0].amount).toBe("30");
    expect(analysis.breakdown[1].amount).toBe("6.25");
  });

  it("AC-15: the exact sums agree with the period total, whatever the printed column says", async () => {
    await seed(SPLIT);

    for (const key of ["type", "supplier"] as const) {
      const analysis = await analysisOf("2026-09", key);
      const rows = analysis.breakdown.flatMap((row) => (row.amount === null ? [] : [row.amount]));

      expect(sumDecimals(rows)).toBe(analysis.period.totalStock);
    }
  });

  it("AC-15: a group with nothing held does not appear at all", async () => {
    await seed({
      types: [
        { code: "THERMO", name: "Thermo-P" },
        { code: "EMPTY", name: "Nothing held here" },
      ],
      counts: [
        {
          yard: "DUBLIN",
          periodKey: "2026-09",
          status: "APPROVED",
          lines: [
            { type: "THERMO", quantity: "1", snapshot: "1" },
            { type: "EMPTY", quantity: "0", snapshot: "1" },
          ],
        },
        { yard: "CLONMEL", periodKey: "2026-09", status: "APPROVED", lines: [{ type: "THERMO", quantity: "1", snapshot: "1" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.breakdown.map((row) => row.groupLabel)).toEqual(["Thermo-P"]);
  });

  it("AC-15: for an INCOMPLETE period every row total is absent and every yard cell is not", async () => {
    await seed({
      counts: [
        { yard: "DUBLIN", periodKey: "2026-09", status: "APPROVED", lines: [{ quantity: "3", snapshot: "2" }] },
      ],
    });

    const analysis = await analysisOf("2026-09");

    expect(analysis.breakdown).toHaveLength(1);
    expect(analysis.breakdown[0].amount).toBeNull();
    expect(analysis.breakdown[0].perYard).toEqual([
      { locationCode: "DUBLIN", amount: "6" },
      { locationCode: "CLONMEL", amount: null },
    ]);
  });
});

/* -------------------------------------------------------------- AC-16, AC-21 */

describe("011 AC-16: the period the page opens on, and the two jumps", () => {
  const SPREAD: FixtureSpec = {
    counts: [
      { yard: "DUBLIN", periodKey: "2026-03", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
      { yard: "DUBLIN", periodKey: "2026-06", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
      { yard: "DUBLIN", periodKey: "2026-09", status: "SUBMITTED", lines: [{ quantity: "1", snapshot: "1" }] },
      { yard: "DUBLIN", periodKey: "2026-11", status: "APPROVED", lines: [{ quantity: "1", snapshot: "1" }] },
    ],
  };

  it("AC-16: listApprovedPeriods is ascending, and skips the months nobody approved", async () => {
    await seed(SPREAD);

    expect(await listApprovedPeriods(ADMIN)).toEqual(["2026-03", "2026-06", "2026-11"]);
  });

  it("AC-16: the jumps go to the nearest approved period either side, skipping the rest", async () => {
    await seed(SPREAD);

    const analysis = await analysisOf("2026-06");

    expect(analysis.previousApprovedPeriodKey).toBe("2026-03");
    expect(analysis.nextApprovedPeriodKey).toBe("2026-11");
  });

  it("AC-16: at either end there is no neighbour, and the answer is null rather than a guess", async () => {
    await seed(SPREAD);

    expect((await analysisOf("2026-03")).previousApprovedPeriodKey).toBeNull();
    expect((await analysisOf("2026-11")).nextApprovedPeriodKey).toBeNull();
    // From a period with no approved count of its own, both sides are still reachable.
    expect((await analysisOf("2026-09")).previousApprovedPeriodKey).toBe("2026-06");
    expect((await analysisOf("2026-09")).nextApprovedPeriodKey).toBe("2026-11");
  });

  it("AC-16: the latest period holding an approved count is the last of the list", async () => {
    await seed(SPREAD);

    const periods = await listApprovedPeriods(ADMIN);

    // It is deliberately NOT the latest COMPLETE period: a yard that has not counted is the
    // thing an administrator most needs to see (Open question 3).
    expect(periods[periods.length - 1]).toBe("2026-11");
    expect((await analysisOf("2026-11")).period.complete).toBe(false);
  });

  it("AC-21: a period far outside any data is the never-counted state, not an error", async () => {
    await seed(AC7);

    const analysis = await analysisOf("1999-01");

    expect(analysis.periodKey).toBe("1999-01");
    expect(analysis.periodLabel).toBe("January 1999");
    expect(analysis.period.yards.map((yard) => yard.countStatus)).toEqual([null, null]);
    expect(analysis.period.totalStock).toBeNull();
    expect(analysis.nextApprovedPeriodKey).toBe("2026-09");
  });
});

/* --------------------------------------------------------------------- AC-17 */

describe("011 AC-17: the money-key walk over the admin shape", () => {
  const SIX = ["againstTotal", "amount", "totalStock", "unvaluedHeldLineCount", "varianceAmount", "yardValue"];

  it("AC-17: exactly six money-shaped keys, as a set - a seventh turns this red", async () => {
    await seed(AC7);

    const analysis = await analysisOf("2026-09", "supplier");
    const found = [...new Set(deepKeys(analysis).filter((key) => MONEY_KEY_PATTERN.test(key)))].sort();

    // `assertNoMoneyKeys` is deliberately NOT applied: this is the one shape in the product
    // that is allowed to carry every monetary fact. The guarantee is that it is never built
    // for anybody else (AC-2), not that it is clean.
    expect(found).toEqual(SIX);
  });

  it("AC-17: and every euro-bearing field is one of those six", async () => {
    await seed(AC7);

    const analysis = await analysisOf("2026-09");
    const figures = new Set([DUBLIN_VALUE, CLONMEL_VALUE, TOTAL_VALUE]);
    const strays: string[] = [];

    const walk = (node: unknown): void => {
      if (node === null || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (const element of node) walk(element);
        return;
      }
      for (const [key, child] of Object.entries(node)) {
        if (typeof child === "string" && /^-?\d+(\.\d+)?$/.test(child) && figures.has(child)) {
          if (!SIX.includes(key)) strays.push(`${key}=${child}`);
        }
        walk(child);
      }
    };

    walk(analysis);

    // The naming rule is what makes the census above mean something: the variance is
    // `varianceAmount` and not `difference` on purpose.
    expect(strays).toEqual([]);
  });
});

/* ---------------------------------------------------------------------- AC-4 */

describe("011 AC-4: this feature writes nothing, and the rows prove it", () => {
  it("AC-4: every row count is identical before and after, and so is every column", async () => {
    const fixture = await seed(AC7);
    const countId = fixture.countIds.get("2026-09|DUBLIN") ?? "";

    const countsBefore = await allTableCounts();
    const countRowBefore = await countRowOf(countId);
    const lineRowsBefore = await lineRowsOf(countId);

    await analysisOf("2026-09", "type");
    await analysisOf("2026-09", "supplier");
    await analysisOf("2025-09");
    await listApprovedPeriods(ADMIN);

    expect(await allTableCounts()).toEqual(countsBefore);
    expect(await countRowOf(countId)).toEqual(countRowBefore);
    expect(await lineRowsOf(countId)).toEqual(lineRowsBefore);
  });
});
